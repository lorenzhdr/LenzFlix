// VIDEOTHEK LENZ · Kino-Sync (Welle d, Paket K2): reiner Rechenkern des gemeinsamen Kinos, ohne DOM und ohne Netz.
// Alle Zeiten in ms. Uhr: serverNow() (Provider net, ck-Abgleich). Adapter (Aufrufer, z. B. cinema/party.js):
//   { setPaused(on), seekTo(ms, {exact}), setRate?(r), state() -> {paused,t,ready,seeking,rate?,ahead?,hidden?,ended?},
//     mode?() -> 'direct'|'hls'|'other', exact?() -> boolean, res?() -> ms (Sliderauflösung ohne exakten Sprung) }
// Netz-Ausgaben gehen über send({t:'kc'|'kb'|'kl', sid, ...}); Ereignisse für Toast/Leiste über emit({type, ...}).
// Gesteuert wird nur in absoluten Zielzuständen (kc o=1 weiter, 2 Pause, 3 Sprung; Server st 0 wartet, 1 läuft, 2 Pause).

export const SYNC = Object.freeze({
  TICK_MS: 250, // Takt des Aufrufers
  DEAD_MS: 300, // Totband-Minimum
  RATE_MAX_MS: 2000, // bis hier Ratenkorrektur, darüber Sprung
  RATE_GAIN_MS: 10000,
  RATE_CLAMP: 0.08,
  COOLDOWN_MS: 6000, // zwischen zwei Sync-Sprüngen (Direktwiedergabe)
  COOLDOWN_HLS_MS: 12000,
  SEEK_CAP: 3, // Sync-Sprünge je Fenster, danach Versatz hinnehmen
  SEEK_CAP_WINDOW_MS: 60000,
  OFFSET_RETRY_MS: 120000,
  LEAD_DIRECT_MS: 500, // Startwerte des gelernten Vorhalts
  LEAD_HLS_MS: 1500,
  LEAD_MAX_MS: 3000,
  LAND_AFTER_MS: 2000, // Messung des Landefehlers nach einem Sprung
  SYNCED_HOLD_MS: 2000,
  APPLY_MS: 2000, // nach eigenem Befehl keine Eingriffserkennung
  GUARD_MS: 8000, // nach Sprung kein Zeitsprung-Eingriff, kein kb
  JUMP_MS: 2500, // Zeitsprung ohne Guard = Nutzer hat gespult
  TICK_GAP_MS: 3000, // größere Lücke (Hintergrund-Drossel): neu aufsetzen
  COALESCE_MS: 400, // Seeks sammeln
  KC_MIN_MS: 500,
  KB_MIN_MS: 250,
  INFLIGHT_MS: 3000,
  STALL_MS: 1000,
  LG_MS: 60000, // Schonzeit in lg (wie Worker LG_MS); der Worker meldet ihr Ende nicht per kx
  AHEAD_OK_MS: 3000,
  MIRROR_TOL_MS: 150,
  SEEK_TOAST_MS: 1500,
  HOLD_MAX_MS: 3000, // bis hier korrigiert ein lokales Anhalten einen Vorsprung, darüber Sprung
  STUCK_MS: 3000, // lokale Pausenposition weicht so weit ab: Gruppenposition nehmen
});

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const num = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);

/** Erwartete Position (ms) einer Sitzung {st, p, at, rate?} zur Serverzeit now. */
export function expectedPos(s, now) {
  if (!s) return 0;
  const p = num(s.p);
  if (s.st !== 1) return Math.max(0, p);
  return Math.max(0, p + (now - num(s.at, now)) * num(s.rate, 1));
}

/** Wiederbeitritt nach wl: 'kj' (Sitzung noch da), 'ks' (neu anlegen), 'solo' (allein weiter). kh = [[sid, host, i, n, st, m, p, at]…] */
export function rejoinPlan({ kh, sid, wasHost, alone } = {}) {
  if (Array.isArray(kh) && kh.some((e) => Array.isArray(e) && e[0] === sid)) return 'kj';
  return wasHost || alone ? 'ks' : 'solo';
}

export function createSync(o = {}) {
  const cfg = { ...SYNC, ...(o.cfg || {}) };
  const A = o.adapter;
  const send = o.send || (() => false);
  const emit = o.emit || (() => {});
  const nowFn = o.serverNow || (() => Date.now());
  const isHost = !!o.host;
  const selfC = o.self;
  const S = {
    sess: null, phase: 'joining', began: false,
    inflight: null, next: null, seekP: null, seekDue: 0, lastKc: -1e9, lastKb: -1e9,
    applyUntil: 0, guardUntil: 0, lastSeekAt: -1e9, seekTimes: [], offsetUntil: 0, offsetHits: 0,
    land: null, landFix: false, landAt: 0, lead: null, leadAt: 0,
    rateSet: null, rateOk: null, alignedSince: null,
    bufSent: false, stallSince: null, hostKb: false, waiting: false, fasterShown: false,
    last: null, d: 0, offsetMs: 0, holdUntil: 0,
  };
  const C = { kc: 0, kb: 0, seeks: 0, accepts: 0 };

  const mode = () => (A.mode ? A.mode() : 'direct');
  const exactOk = () => (A.exact ? A.exact() !== false : true);
  const res = () => (exactOk() ? 0 : num(A.res && A.res()));
  const lead = () => (S.lead != null ? S.lead : mode() === 'hls' ? cfg.LEAD_HLS_MS : cfg.LEAD_DIRECT_MS);
  const dead = () => Math.max(cfg.DEAD_MS, 1.5 * (S.land || 0), res());
  const inactive = () => S.phase === 'solo' || S.phase === 'ended';
  const obsNow = () => { try { return A.state() || null; } catch { return null; } };

  function resetRate() {
    if (S.rateSet != null) { S.rateSet = null; try { if (A.setRate) A.setRate(1); } catch { /* egal */ } }
  }

  // Lokales Anhalten gegen einen Vorsprung (nur Mitschauende; der Gastgeber korrigiert wie bisher per Rate/Sprung, sonst stünde sein
  // Bild ohne erkennbaren Grund bis zu HOLD_MAX still): Pause, nach ms (am Tick, nicht per Timer) wieder weiter. Zählt nicht als Nutzerpause.
  function startHold(ms, now) {
    try { A.setPaused(true); } catch { /* egal */ }
    S.holdUntil = now + Math.round(ms);
    S.applyUntil = Math.max(S.applyUntil, now + cfg.APPLY_MS);
    S.alignedSince = null;
    resetRate();
  }
  function endHold(resume, now) {
    if (!S.holdUntil) return;
    S.holdUntil = 0;
    if (!resume) return;
    try { A.setPaused(false); } catch { /* egal */ }
    S.applyUntil = Math.max(S.applyUntil, (now == null ? nowFn() : now) + cfg.APPLY_MS);
  }

  function giveUp(reason, sendKl = true) {
    if (inactive()) return;
    endHold(true);
    resetRate();
    if (sendKl && S.sess) send({ t: 'kl', sid: S.sess.sid });
    S.phase = 'solo';
    emit({ type: 'solo', reason });
  }

  function doSeek(target, now) {
    S.holdUntil = 0;
    try { A.seekTo(Math.max(0, Math.round(target)), { exact: exactOk() }); } catch { /* egal */ }
    S.guardUntil = now + cfg.GUARD_MS;
    S.applyUntil = now + cfg.APPLY_MS;
    S.lastSeekAt = now;
    S.landAt = now + cfg.LAND_AFTER_MS;
    S.leadAt = now;
    S.alignedSince = null;
    C.seeks++;
    resetRate();
  }
  function doPause(on, now) {
    S.holdUntil = 0; // jede andere Pause-Entscheidung löst ein laufendes Anhalten ab
    try { A.setPaused(on); } catch { /* egal */ }
    S.applyUntil = now + cfg.APPLY_MS;
  }

  // Zustand, den der Nutzer sieht: ausstehende eigene Befehle zählen mit (Toggle-Falle: nie nach dem DOM-Knopf entscheiden).
  function effSt() {
    if (S.next) return S.next.o === 1 ? 1 : 2;
    if (S.inflight && S.inflight.o !== 3) return S.inflight.o === 1 ? 1 : 2;
    return S.sess ? S.sess.st : 2;
  }

  // Immer nur ein kc unterwegs (CAS über v); weitere Befehle liegen im Slot „next“ (der letzte gewinnt) bzw. als gesammelter Sprung.
  function flush(now) {
    if (!S.sess || inactive() || S.inflight || now - S.lastKc < cfg.KC_MIN_MS) return;
    let o, p;
    if (S.next) { o = S.next.o; p = S.next.p; S.next = null; }
    else if (S.seekP != null && now >= S.seekDue) { o = 3; p = S.seekP; S.seekP = null; }
    else return;
    p = Math.round(p);
    S.inflight = { v: S.sess.v, o, p, at: now };
    S.lastKc = now;
    C.kc++;
    send({ t: 'kc', sid: S.sess.sid, v: S.sess.v, o, p });
  }
  function queue(o, p, now) {
    if (o === 3) { S.seekP = Math.max(0, p); S.seekDue = now + cfg.COALESCE_MS; return; }
    const pp = S.seekP != null ? S.seekP : p; // wartender Sprung geht im Weiter/Pause-Ziel auf
    S.seekP = null;
    S.next = { o, p: Math.max(0, pp) };
    flush(now);
  }

  function setWaiting(on, ms) {
    if (on && !S.waiting) emit({ type: 'wait', ms });
    if (!on && S.waiting) emit({ type: 'resume' });
    S.waiting = on;
  }

  // Serverzustand lokal herstellen (nie ein kc; Toast nur bei Änderung gegenüber old, nicht beim ersten Abgleich)
  function applyRemote(old, s, now, initial) {
    const obs = obsNow();
    const cur = obs ? num(obs.t) : 0;
    const D = dead();
    if (S.phase === 'offset') S.phase = 'synced';
    if (s.st === 1) {
      setWaiting(false);
      doPause(false, now);
      const erw = expectedPos(s, now);
      if (initial || Math.abs(cur - erw) > D) doSeek(erw + lead(), now);
    } else if (s.st === 2) {
      setWaiting(false);
      doPause(true, now);
      if (Math.abs(cur - s.p) > D) doSeek(s.p, now);
    } else if (s.w) {
      doPause(true, now);
      if (Math.abs(cur - s.p) > D) doSeek(s.p, now);
      setWaiting(true, Math.max(0, num(s.w) - now));
    } else if (!isHost) { // wartet auf den Start des Gastgebers; der Gastgeber selbst spielt weiter
      doPause(true, now);
      if (Math.abs(cur - s.p) > D) doSeek(s.p, now);
    }
    if (!initial && old && !S.fasterShown) {
      if (old.st === 1 && s.st === 2) emit({ type: 'remote', kind: 'pause', p: s.p });
      else if (old.st === 2 && s.st === 1) emit({ type: 'remote', kind: 'play', p: expectedPos(s, now) });
      else if (old.st === s.st && s.st !== 0 && Math.abs(expectedPos(s, now) - expectedPos(old, now)) > cfg.SEEK_TOAST_MS) emit({ type: 'remote', kind: 'seek', p: expectedPos(s, now) });
    }
  }

  function hostKb() {
    if (!isHost || S.hostKb || !S.began || !S.sess || S.sess.st !== 0 || S.sess.w) return;
    S.hostKb = true;
    S.lastKb = nowFn();
    C.kb++;
    send({ t: 'kb', sid: S.sess.sid, b: 0 });
  }

  function userSt(st) {
    if (inactive() || !S.sess) return false;
    const now = nowFn();
    const obs = obsNow();
    doPause(st === 2, now);
    let p = S.seekP != null ? S.seekP : obs ? num(obs.t) : S.sess.p;
    // Player weit hinter (oder vor) der Gruppe (hing/puffert): nicht die lokale Stelle zur Pausenposition machen, sondern die der Gruppe
    if (st === 2 && S.seekP == null && obs) {
      const g = expectedPos(S.sess, now);
      if (Math.abs(p - g) > cfg.STUCK_MS) { p = g; doSeek(g, now); }
    }
    queue(st, p, now);
    return true;
  }

  const api = {
    /** Mitschauer: der Watchdog meldet 'start' -> erster Abgleich auf den Sitzungszustand. */
    begin() {
      if (inactive() || S.began) return;
      S.began = true;
      if (S.sess) applyRemote(null, S.sess, nowFn(), true);
    },
    /** Gastgeber: der Film spielt echt (erstes playing). Bezugspunkt der Sitzung; sendet kb 0, sobald der Server st=0 meldet. */
    markPlaying() {
      if (inactive() || S.began) return;
      S.began = true;
      if (isHost) { S.phase = 'synced'; hostKb(); }
      else if (S.sess) applyRemote(null, S.sess, nowFn(), true);
    },
    onKx(kx) {
      if (inactive() || !kx || typeof kx !== 'object') return;
      if (S.sess && kx.sid !== S.sess.sid) return;
      const old = S.sess;
      const v = num(kx.v);
      if (old && v < old.v) return;
      const now = nowFn();
      const s = { sid: kx.sid, v, i: kx.i, st: num(kx.st, 2), p: num(kx.p), at: num(kx.at, now), m: Array.isArray(kx.m) ? kx.m : [], lg: Array.isArray(kx.lg) ? kx.lg : [], w: kx.w ? num(kx.w) : 0, rate: kx.rate };
      if (o.itemId && s.i && s.i !== o.itemId) { S.sess = s; giveUp('item'); return; }
      S.sess = s;
      if (selfC != null && s.lg.includes(selfC)) { if (S.lgSince == null) S.lgSince = now; } else S.lgSince = null;
      C.accepts++;
      const f = S.inflight;
      let mine = false;
      if (f && v > f.v) {
        mine = v === f.v + 1 && Math.abs(s.p - f.p) <= cfg.MIRROR_TOL_MS && (f.o === 3 || s.st === (f.o === 1 ? 1 : 2));
        S.inflight = null;
        if (!mine && !S.fasterShown) { emit({ type: 'faster' }); S.fasterShown = true; }
      }
      const repeat = old && v === old.v && s.st === old.st && s.w === old.w;
      if (!mine && !repeat && S.began) applyRemote(old, s, now, !old);
      S.fasterShown = false;
      hostKb();
      flush(now);
    },
    /** er-Antwort auf einen eigenen kc. */
    onError(code) {
      if (inactive()) return;
      if (code === 'stale') { S.inflight = null; if (!S.fasterShown) { emit({ type: 'faster' }); S.fasterShown = true; } }
      else if (code === 'rate' || code === 'bad') S.inflight = null;
      else if (code === 'off' || code === 'cap' || code === 'deny' || code === 'perm') giveUp(code, false);
    },
    // Nutzeraktionen (Leiste, Tastenwächter, VR-Panel): optimistisch lokal, dann absoluter Zielzustand per kc.
    pause() { return userSt(2); },
    play() { return userSt(1); },
    toggle() {
      // Sitzung läuft, nur der eigene Player ist gehalten (z. B. iOS-Sperre): lokal fortsetzen, die Gruppe nicht pausieren.
      if (!inactive() && S.sess && S.sess.st === 1 && effSt() === 1 && !S.next && !S.inflight) {
        const obs = obsNow();
        if (obs && obs.paused) {
          const now = nowFn();
          doPause(false, now);
          const erw = expectedPos(S.sess, now);
          if (Math.abs(num(obs.t) - erw) > dead()) doSeek(erw + lead(), now);
          return true;
        }
      }
      return userSt(effSt() === 1 ? 2 : 1);
    },
    seek(ms) {
      if (inactive() || !S.sess) return false;
      const now = nowFn();
      const p = Math.max(0, num(ms));
      try { A.seekTo(Math.round(p), { exact: exactOk() }); } catch { /* egal */ }
      S.guardUntil = now + cfg.GUARD_MS;
      S.applyUntil = now + cfg.APPLY_MS;
      queue(3, p, now);
      return true;
    },
    seekBy(deltaMs) {
      if (inactive() || !S.sess) return false;
      const obs = obsNow();
      return api.seek((S.seekP != null ? S.seekP : obs ? num(obs.t) : 0) + num(deltaMs));
    },
    /** Aufstehen: allein Pause per kc ('pause', der Aufrufer pausiert lokal wie 1.15), mit anderen nichts ('keep'). */
    stand() {
      if (inactive() || !S.sess) return 'pause';
      if ((S.sess.m || []).length > 1) return 'keep';
      const obs = obsNow();
      queue(2, obs ? num(obs.t) : S.sess.p, nowFn());
      return 'pause';
    },
    /** Eigene lokale Eingriffe (Autoplay-Sperre, Spurwechsel, Neuladen) ms lang nicht als Nutzeraktion/Puffern werten. */
    suppress(ms) {
      const now = nowFn();
      const t = now + num(ms, cfg.GUARD_MS);
      S.guardUntil = Math.max(S.guardUntil, t);
      S.applyUntil = Math.max(S.applyUntil, t);
    },
    /** Sitzung lokal verwerfen (Aufrufer baut sie ab): Rate zurück, kein kl. */
    dispose() { endHold(true); resetRate(); S.phase = 'ended'; },
    localEnded() { if (!inactive()) { endHold(false); resetRate(); S.phase = 'ended'; } },
    leave() {
      if (inactive()) return;
      endHold(true);
      resetRate();
      if (S.sess) send({ t: 'kl', sid: S.sess.sid });
      S.phase = 'ended';
    },
    tick() {
      if (!S.sess || inactive()) return;
      const now = nowFn();
      if (S.inflight && now - S.inflight.at > cfg.INFLIGHT_MS) S.inflight = null;
      flush(now);
      const obs = obsNow();
      if (!obs) return;
      const t = num(obs.t);
      const ready = num(obs.ready, 4);
      const last = S.last;
      const rebase = !last || now - last.now > cfg.TICK_GAP_MS;
      S.last = { now, t, paused: !!obs.paused, rate: obs.rate != null ? num(obs.rate, 1) : 1 };
      if (obs.ended) return;
      if (S.holdUntil && now + cfg.TICK_MS / 2 >= S.holdUntil) endHold(true, now); // Halbtakt-Rundung gegen Tick-Raster
      // Ratenprobe: hält der Player die gesetzte Rate nicht, ist die Ratenkorrektur für den Lauf aus
      if (S.rateSet != null && obs.rate != null && Math.abs(num(obs.rate) - S.rateSet) > 0.01) { resetRate(); S.rateOk = false; }
      // Lerngrößen: Landefehler nach einem Sprung, Vorhalt = Sprungbefehl bis wieder spielend
      let held = false;
      if (S.landAt && now >= S.landAt && ready >= 3 && !obs.seeking) {
        const sd = t - expectedPos(S.sess, now);
        const err = Math.abs(sd);
        S.landAt = 0;
        if (!isHost && sd > 2 * cfg.DEAD_MS && sd <= cfg.HOLD_MAX_MS && S.sess.st === 1 && !obs.paused && !S.holdUntil) {
          // Landung VORAUS bei laufender Sitzung (z. B. Nachsprung im gepufferten Bereich): nicht zurückspringen, sondern kurz anhalten;
          // der Überschuss ist kein Landefehler des Players und wird nicht in S.land gebucht.
          S.landFix = false;
          startHold(sd, now);
          held = true;
        } else if (!S.landFix && S.sess.st === 1 && !obs.paused && res() === 0 && err > 2 * cfg.DEAD_MS) {
          // Einmaliger Korrektursprung: lag der Sprung wegen eines falsch geschätzten Vorhalts weit daneben (läuft die Sitzung), nicht als
          // „unvermeidbaren Landefehler“ ins Totband buchen (der Vorhalt lernt in der Zwischenzeit), sondern mit dem gelernten Vorhalt nachspringen.
          S.landFix = true;
          doSeek(expectedPos(S.sess, now) + lead(), now);
          return;
        } else {
          S.landFix = false;
          S.land = S.land == null ? err : 0.7 * S.land + 0.3 * err;
        }
      }
      if (S.leadAt && now - S.leadAt >= cfg.TICK_MS && ready >= 3 && !obs.seeking && S.sess.st === 1 && !obs.paused) {
        const dur = clamp(now - S.leadAt, 0, cfg.LEAD_MAX_MS);
        S.lead = clamp(S.lead == null ? dur : 0.7 * S.lead + 0.3 * dur, 0, cfg.LEAD_MAX_MS);
        S.leadAt = 0;
      }
      if (held) return;
      const hidden = !!obs.hidden;
      // Eingriffe außerhalb unserer Befehle (Jellyfin-OSD, Medientasten): Pause-Wechsel oder Zeitsprung -> kc
      if (S.began && S.phase !== 'joining' && !rebase && !hidden) {
        const eff = effSt();
        if (obs.paused !== last.paused && now >= S.applyUntil) {
          if (obs.paused && eff === 1) queue(2, t, now);
          else if (!obs.paused && eff !== 1) queue(1, t, now);
        }
        const expT = last.paused ? last.t : last.t + (now - last.now) * num(last.rate, 1);
        if (Math.abs(t - expT) > cfg.JUMP_MS && now >= S.guardUntil && now >= S.applyUntil) {
          S.guardUntil = now + cfg.GUARD_MS;
          queue(3, t, now);
        }
      }
      // Puffern (lazy, nur in der Sitzung): kb 1 bei Stocken, kb 0 bei Erholung
      const inLg = selfC != null && (S.sess.lg || []).includes(selfC) && (S.lgSince == null || now - S.lgSince < cfg.LG_MS);
      const recovered = ready >= 3 || num(obs.ahead) >= cfg.AHEAD_OK_MS;
      const stalled = !obs.paused && !obs.seeking && ready < 3 && last && Math.abs(t - last.t) < 50;
      if (stalled) { if (S.stallSince == null) S.stallSince = now; if (now - S.stallSince >= cfg.STALL_MS) S.stalledLong = true; } else S.stallSince = null;
      if (S.bufSent) {
        if (recovered && now - S.lastKb >= cfg.KB_MIN_MS) { S.bufSent = false; S.lastKb = now; C.kb++; send({ t: 'kb', sid: S.sess.sid, b: 0 }); }
      } else if (S.phase === 'synced' && S.stallSince != null && now - S.stallSince >= cfg.STALL_MS && now >= S.guardUntil && !hidden && !inLg && now - S.lastKb >= cfg.KB_MIN_MS) {
        S.bufSent = true; S.lastKb = now; C.kb++;
        send({ t: 'kb', sid: S.sess.sid, b: 1 });
      }
      // Nach langem Stocken scheitert der Aufholsprung weder am Cooldown noch an der Sprungobergrenze
      if (S.stalledLong && recovered) { S.stalledLong = false; S.seekTimes = []; S.lastSeekAt = -1e9; if (S.phase === 'offset') { S.phase = 'synced'; S.alignedSince = null; } }
      // Drift
      if (!S.began) return;
      const st = S.sess.st;
      const erw = expectedPos(S.sess, now);
      const d = t - erw;
      S.d = d;
      const D = dead();
      if (S.phase === 'offset') {
        S.offsetMs = d;
        if (now < S.offsetUntil) return;
        S.phase = 'synced'; S.seekTimes = []; S.alignedSince = null;
      }
      const hold = !!obs.paused && st === 1; // lokal gehalten (z. B. Autoplay-Sperre): nicht nachziehen
      if (mode() === 'other') { // progressive Transkodierung: Zeitbasis unsicher, kein Abgleich
        if (S.phase === 'joining') { S.phase = 'synced'; emit({ type: 'unsynced' }); }
        return;
      }
      if (hold) return;
      if (S.phase === 'joining') {
        const ok = ready >= 3 && !obs.seeking && Math.abs(d) < D && (st === 1 ? !obs.paused : !!obs.paused);
        if (!ok) S.alignedSince = null;
        else if (S.alignedSince == null) S.alignedSince = now;
        else if (now - S.alignedSince >= cfg.SYNCED_HOLD_MS) { S.phase = 'synced'; emit({ type: 'synced' }); }
      }
      if (ready < 3 || obs.seeking) return;
      const ad = Math.abs(d);
      // Ratenband ab dem festen Totband: der Landefehler (unpräzise Sprünge, z. B. HLS) weitet nur das Sprungband gegen
      // Sprungzyklen. Sonst bleiben zwei Mitglieder mit entgegengesetztem Versatz je „im Totband“ und liegen zusammen
      // deutlich über der Zielgrenze (live gemessen: −0,98 s und +0,36 s, also 1,34 s Abstand, ohne Korrektur).
      const Dr = Math.max(cfg.DEAD_MS, res());
      if (ad < Dr / 2) { resetRate(); return; }
      const cool = mode() === 'hls' ? cfg.COOLDOWN_HLS_MS : cfg.COOLDOWN_MS;
      // Vorsprung über 2×Totband bis HOLD_MAX: kurz lokal anhalten statt langsamer Rate oder Sprung (gleicher Cooldown und Deckel wie Sprünge)
      if (!isHost && st === 1 && !S.holdUntil && d > Math.max(2 * cfg.DEAD_MS, D) && d <= cfg.HOLD_MAX_MS && now - S.lastSeekAt >= cool) {
        S.seekTimes = S.seekTimes.filter((x) => now - x < cfg.SEEK_CAP_WINDOW_MS);
        if (S.seekTimes.length < cfg.SEEK_CAP) {
          S.seekTimes.push(now); S.lastSeekAt = now;
          startHold(d, now);
          return;
        }
      }
      if (st === 1 && S.rateOk !== false && A.setRate && ad > Dr && ad <= Math.max(D, cfg.RATE_MAX_MS)) {
        const r = 1 - clamp(d / cfg.RATE_GAIN_MS, -cfg.RATE_CLAMP, cfg.RATE_CLAMP);
        if (S.rateSet !== r) {
          try { A.setRate(r); S.rateSet = r; } catch { S.rateOk = false; }
        }
        return;
      }
      if (ad <= D) return;
      if (now - S.lastSeekAt < cool) return;
      S.seekTimes = S.seekTimes.filter((x) => now - x < cfg.SEEK_CAP_WINDOW_MS);
      if (S.seekTimes.length >= cfg.SEEK_CAP) {
        resetRate();
        S.phase = 'offset'; S.offsetUntil = now + cfg.OFFSET_RETRY_MS; S.offsetMs = d; S.offsetHits++;
        emit({ type: 'offset', ms: d });
        if (S.offsetHits >= 2) giveUp('sync');
        return;
      }
      S.seekTimes.push(now);
      doSeek(erw + (st === 1 ? lead() : 0), now);
    },
    status() {
      const now = nowFn();
      const s = S.sess;
      return { phase: S.phase, st: s ? s.st : null, v: s ? s.v : null, d: S.d, offsetMs: S.offsetMs, waitMs: s && s.st === 0 && s.w ? Math.max(0, s.w - now) : 0, members: s ? s.m.length : 0 };
    },
    diag() {
      return { phase: S.phase, st: S.sess ? S.sess.st : null, v: S.sess ? S.sess.v : null, d: S.d, seeks: C.seeks, rate: S.rateSet, rateOk: S.rateOk, accepts: C.accepts, kcSent: C.kc, kbSent: C.kb, land: S.land, lead: lead(), guard: Math.round(S.guardUntil - nowFn()), apply: Math.round(S.applyUntil - nowFn()), inflight: !!S.inflight, seekP: S.seekP };
    },
  };
  return api;
}
