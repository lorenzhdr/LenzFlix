// VIDEOTHEK LENZ · gemeinsames Kino im LENZ PALAST (Welle d, Paket K3): Client der Kino-Sitzung.
// Verdrahtet den reinen Sync-Kern (cinema/sync.js) mit dem Provider `net` (send/on/serverNow/has/me/setKino) und der Bridge der Hülle
// (deps.cinema). Kein Jellyfin-DOM, kein three. Ohne Mehrspieler / ohne Fähigkeit `kino` / ohne Sitzung ist alles ein Durchreichen (wrap)
// und das Kino verhält sich exakt wie in 1.15.
//   createParty({ net(), bridge(), film(), chatOn(), toast(text), onBlocked(), startPending(), hidden?(), setInterval?, clearInterval? }) →
//   { active, role, listen(), offers(), join(sid, item) → bool, onPlaying(item), poll(now), wrap(bridge), stand() → 'pause'|'keep',
//     play() → bool, resync(), suppress(ms), leave(), text(), chatOn(), say(text), diag(), dispose() }
// Über die Leitung gehen nur Item-IDs (ks nur mit „Film sichtbar“, der Server erzwingt es zusätzlich), nie Titel.
import { createSync, expectedPos, rejoinPlan } from './sync.js';
import { fmtTime } from './controls.js';

const TICK_MS = 250;
const HOLD_MS = 8000; // eigene Eingriffe (Spurwechsel, Autoplay-Sperre) so lange nicht als Nutzeraktion/Puffern werten
const POLL_MS = 1000; // Gastgeber-Start nachholen (mp verbindet erst während des Films, Schalter später an)
const RESYNC_MS = 1500;
const LOST_MS = 20000; // so lange ohne Verbindung, bevor die Sitzung als getrennt gilt
const warn = (...a) => { try { console.warn('[LenzFlix Store3D]', ...a); } catch { /* egal */ } };

const SOLO_TEXT = {
  sync: 'Synchron nicht möglich – du schaust allein weiter.',
  item: 'Anderer Film – du schaust allein weiter.',
  lost: 'Gemeinsames Kino getrennt – du schaust allein weiter.',
};

export function createParty(o = {}) {
  const get = (f, ...a) => { try { return typeof f === 'function' ? f(...a) : null; } catch (err) { warn('party', err); return null; } };
  const netp = () => {
    const n = get(o.net);
    return n && typeof n.send === 'function' && typeof n.on === 'function' && typeof n.has === 'function' && typeof n.serverNow === 'function' ? n : null;
  };
  const meNow = () => { const n = netp(); return n && typeof n.me === 'function' ? get(() => n.me()) : null; };
  const live = () => { const n = netp(); return n && (typeof n.active !== 'function' || n.active()) ? n : null; };
  const kinoNet = () => { const n = live(); return n && n.has('kino') ? n : null; };
  const toast = (t) => { if (t) get(o.toast, t); };
  const si = o.setInterval || ((f, ms) => setInterval(f, ms));
  const ci = o.clearInterval || ((h) => clearInterval(h));
  const bridge = () => get(o.bridge);
  const video = () => { const b = bridge(); return b && typeof b.video === 'function' ? get(() => b.video()) : null; };
  const now = () => { const n = netp(); const t = n ? Number(n.serverNow()) : NaN; return Number.isFinite(t) ? t : Date.now(); };

  let sync = null;
  let sid = null;
  let role = null; // 'host' | 'member'
  let itemId = null;
  let kh = []; // [[sid, host, i, n, st, m, p, at]…] (nur öffentliche Sitzungen)
  let timer = 0;
  let offs = [];
  let hostTried = false;
  let pendingJoin = false;
  let played = false; // erstes echtes playing dieses Laufs gesehen
  let lastKx = null;
  let lastPoll = -1e9;
  let wrapped = null;
  let lostAt = 0;
  let disposed = false;
  let info = { wait: false, unsynced: false };

  const alive = () => {
    if (!sync) return false;
    const p = sync.status().phase;
    return p !== 'solo' && p !== 'ended';
  };

  // ---------------------------------------------------------------- Adapter auf die Bridge (Sekunden ↔ ms)
  const adapter = {
    setPaused(on) {
      const b = bridge();
      if (!b) return;
      let r;
      if (typeof b.setPaused === 'function') r = b.setPaused(on);
      else { const v = video(); if (v && Boolean(v.paused) !== Boolean(on) && typeof b.togglePause === 'function') b.togglePause(); }
      if (r && typeof r.then === 'function') r.then(undefined, () => { if (sync) sync.suppress(HOLD_MS); get(o.onBlocked); });
    },
    seekTo(ms, opts) { const b = bridge(); if (b && typeof b.seekTo === 'function') b.seekTo(ms / 1000, opts); },
    setRate(r) { const v = video(); if (v) v.playbackRate = r; },
    mode() { const b = bridge(); const m = b && typeof b.mode === 'function' ? b.mode() : 'direct'; return m === 'unknown' ? 'hls' : m; },
    exact: () => true,
    state() {
      const v = video();
      if (!v) return null;
      const t = Number(v.currentTime) || 0;
      let ahead = 0;
      try { const b = v.buffered; if (b && b.length) ahead = Math.max(0, (Number(b.end(b.length - 1)) || 0) - t) * 1000; } catch { /* egal */ }
      return {
        paused: Boolean(v.paused), t: t * 1000, ready: Number(v.readyState) || 0, seeking: Boolean(v.seeking), rate: Number(v.playbackRate) || 1,
        ahead, hidden: typeof document !== 'undefined' && document.hidden === true, ended: Boolean(v.ended),
      };
    },
  };

  // ---------------------------------------------------------------- Sitzung auf- und abbauen
  function endSession() {
    if (timer) { ci(timer); timer = 0; }
    const n = netp();
    if (n && typeof n.setKino === 'function') get(() => n.setKino(false));
    sync = null; sid = null; role = null; lastKx = null;
    info = { wait: false, unsynced: false };
  }

  function onEmit(ev) {
    switch (ev.type) {
      case 'remote':
        if (ev.kind === 'pause') toast('Jemand hat pausiert');
        else if (ev.kind === 'play') toast('Jemand hat fortgesetzt');
        else toast(`Jemand hat auf ${fmtTime(ev.p / 1000)} gespult`);
        break;
      case 'faster': toast('Jemand war schneller'); break;
      case 'wait': info.wait = true; break;
      case 'resume': info.wait = false; break;
      case 'unsynced': info.unsynced = true; toast('Hier ist kein Abgleich möglich – du schaust für dich.'); break;
      case 'solo':
        toast(SOLO_TEXT[ev.reason] || 'Gemeinsames Kino nicht verfügbar – du schaust allein weiter.');
        endSession();
        break;
      default: break;
    }
  }

  function make(host, n) {
    const me = n.me ? get(() => n.me()) : null;
    sync = createSync({
      serverNow: now, adapter, send: (m) => { const x = netp(); return x ? x.send(m) : false; }, emit: onEmit,
      host, self: me ? me.c : undefined, itemId,
    });
    role = host ? 'host' : 'member';
    info = { wait: false, unsynced: false };
    if (typeof n.setKino === 'function') n.setKino(true); // W9: Verbindung bleibt im verborgenen Tab offen
    lostAt = 0;
    timer = si(() => { if (sync) { checkLost(); if (sync) sync.tick(); } }, TICK_MS);
    listen();
  }

  /** Verbindung dauerhaft weg (Backoff/tot/gesperrt, Mehrspieler aus): nach LOST_MS Sitzung beenden statt auf eingefrorener Zeitleiste weiterzulaufen. */
  function checkLost() {
    if (!sync) return;
    if (live()) { lostAt = 0; return; }
    const t = Date.now();
    if (!lostAt) { lostAt = t; return; }
    if (t - lostAt < LOST_MS) return;
    toast(SOLO_TEXT.lost);
    try { sync.leave(); } catch (err) { warn('kl', err); }
    endSession();
  }

  /** Gastgeber: Sitzung anlegen (ks), sobald der Film wirklich spielt. Nur Film, nur mit „Film sichtbar“ und Fähigkeit kino. */
  function startHost(item) {
    const n = kinoNet();
    const id = item && (item.Id || item.id);
    const t = item && item.Type;
    if (!n || !id || (t && t !== 'Movie') || !get(o.film)) return false;
    const v = video();
    if (!v) return false;
    const msg = { t: 'ks', i: id, p: Math.round((Number(v.currentTime) || 0) * 1000) };
    if (Number.isFinite(v.duration) && v.duration > 0) msg.dur = Math.round(v.duration * 1000);
    itemId = id;
    if (!n.send(msg)) return false;
    make(true, n);
    sync.markPlaying();
    return true;
  }

  // ---------------------------------------------------------------- Netz-Ereignisse
  function onWl(m) {
    kh = Array.isArray(m && m.kh) ? m.kh : [];
    if (!sync) return;
    // Wiederverbinden mit laufender Sitzung (Reconnect, Deploy, iOS-Sperre)
    const plan = rejoinPlan({ kh, sid, wasHost: role === 'host', alone: sync.status().members <= 1 });
    const n = kinoNet();
    if (plan === 'kj' && n) n.send({ t: 'kj', sid });
    else if (plan === 'ks' && n) {
      const item = { Id: itemId, Type: 'Movie' };
      endSession();
      if (!startHost(item)) toast(SOLO_TEXT.lost);
    } else { endSession(); toast(SOLO_TEXT.lost); }
  }

  function listen() {
    if (offs.length || disposed) return;
    const n = netp();
    if (!n) return;
    offs.push(
      n.on('msg:kh', (e) => { kh = Array.isArray(e && e.l) ? e.l : []; }),
      n.on('msg:wl', onWl),
      n.on('state', checkLost),
      n.on('msg:kx', (e) => {
        if (!sync || !e) return;
        if (sid == null) {
          const me = meNow();
          if (me && Array.isArray(e.m) && e.m.includes(me.c)) sid = e.sid; // Antwort auf unser ks
          else return;
        } else if (e.sid !== sid) return;
        lastKx = { ...e, i: e.i || (lastKx && lastKx.i) };
        sync.onKx(e);
      }),
      n.on('msg:er', (e) => {
        if (!sync || !e) return;
        if (e.y === 'kc' || e.y === 'ks' || e.y === 'kj') sync.onError(e.c);
      }),
    );
  }

  // ---------------------------------------------------------------- Bridge-Hülle: absolute Ziele statt Umschalter
  function wrap(b) {
    if (!b) return {};
    if (wrapped && wrapped.b === b) return wrapped.w;
    const w = Object.create(b);
    w.togglePause = (...a) => {
      if (alive()) {
        const st = sync.status().st;
        if (get(o.startPending)) { // „Starten“ bei gesperrtem Autoplay: nur lokal, bei pausierter Sitzung für alle
          if (!played || st === 1 || st === 0 || !sync.play()) { sync.suppress(HOLD_MS); adapter.setPaused(false); }
          return undefined;
        }
        if (sync.toggle()) return undefined;
      }
      return b.togglePause(...a);
    };
    w.seekBy = (d, ...a) => (alive() && sync.seekBy(Number(d) * 1000) ? undefined : b.seekBy(d, ...a));
    w.seekTo = (s, ...a) => (alive() && sync.seek(Number(s) * 1000) ? undefined : b.seekTo(s, ...a));
    wrapped = { b, w };
    return w;
  }

  const api = {
    get active() { return alive(); },
    get role() { return alive() ? role : null; },
    get sid() { return sid; },
    listen,
    /** Öffentliche Sitzungen anderer (Platzwahl): [{ sid, host, itemId, n, st, m, p, at }]. Rechte-Filter macht die Platzwahl. */
    offers() {
      if (!netp()) return [];
      listen();
      const me = meNow();
      return kh.filter((e) => Array.isArray(e) && e[2] && e[0] !== sid && !(me && e[1] === me.c))
        .map((e) => ({ sid: e[0], host: e[1], itemId: e[2], n: e[3], st: e[4], m: e[5] || [], p: e[6], at: e[7] }));
    },
    /** Mitschauen: kj sofort senden; der Film startet danach über cinema.play (ohne resume). false = nicht möglich. */
    join(s, item) {
      const n = kinoNet();
      const id = item && (item.Id || item.id);
      if (!n || !id || !Number.isInteger(s)) return false;
      if (sync) api.leave();
      itemId = id;
      if (!n.send({ t: 'kj', sid: s })) return false;
      sid = s;
      make(false, n);
      pendingJoin = true;
      return true;
    },
    /** Beginn eines Laufs (PalastCinema.beforePlay): ohne vorangegangenes join() endet eine alte Sitzung (kl). */
    beginRun(item) {
      const joining = pendingJoin;
      pendingJoin = false;
      if (!joining) { api.leave(); itemId = item ? (item.Id || item.id || null) : null; }
      played = false;
      hostTried = false;
    },
    /** Erstes echtes playing (Watchdog start bzw. „Starten“): Gastgeber legt die Sitzung an, Mitschauer gleicht erstmals ab. */
    onPlaying(item) {
      if (played) return;
      played = true;
      if (sync && role === 'member') { sync.begin(); return; }
      if (!sync) { hostTried = true; if (!startHost(item)) hostTried = false; }
    },
    /** Takt von PalastCinema.tick: Gastgeber-Start nachholen (mp erst später verbunden, Film-Schalter später an). */
    poll(t, item) {
      if (!played || sync || hostTried || t - lastPoll < POLL_MS) return;
      lastPoll = t;
      if (startHost(item)) hostTried = true;
    },
    wrap,
    /** Aufstehen: 'keep' = mit anderen nichts tun (Film läuft weiter), sonst 'pause' (allein; kc ist schon gesendet, lokal pausiert der Aufrufer). */
    stand() { return alive() ? sync.stand() : 'pause'; },
    /** Nach Aufstehen allein pausiert: Weiter für die Sitzung. false = keine Sitzung (Aufrufer setzt lokal fort). */
    play() { return alive() ? sync.play() : false; },
    /** Wieder hingesetzt: bei größerer Abweichung sofort auf die gemeinsame Position springen (kein Nutzer-Seek, also kein kc). */
    resync() {
      if (!alive() || !lastKx || lastKx.st !== 1) return;
      const v = video();
      if (!v) return;
      const erw = expectedPos(lastKx, now());
      if (Math.abs((Number(v.currentTime) || 0) * 1000 - erw) <= RESYNC_MS) return;
      sync.suppress(HOLD_MS);
      adapter.seekTo(erw, { exact: true });
    },
    suppress(ms = HOLD_MS) { if (alive()) sync.suppress(ms); },
    leave() {
      pendingJoin = false;
      if (sync) { try { sync.leave(); } catch (err) { warn('kl', err); } endSession(); }
    },
    /** Leistenzeile (leer ohne Sitzung). */
    text() {
      if (!alive()) return '';
      const s = sync.status();
      if (s.waitMs > 0) return `Warte auf andere Zuschauer … ${Math.ceil(s.waitMs / 1000)} s`;
      if (info.unsynced) return 'Nicht abgeglichen';
      if (s.phase === 'joining') return role === 'member' ? 'Du steigst ein …' : '';
      if (s.phase === 'offset') return `≈ ${Math.max(1, Math.round(Math.abs(s.offsetMs) / 1000))} s versetzt`;
      return s.members > 1 ? `Gemeinsam · ${s.members} Zuschauer` : '';
    },
    /** Chat in der Leiste: nur mit Verbindung und eingeschaltetem Chat (sonst bleibt Enter im Sessel unberührt). */
    chatOn() { return Boolean(live() && get(o.chatOn)); },
    say(text) { const n = live(); return Boolean(n && typeof n.say === 'function' && n.say(text)); },
    diag() {
      return { role, sid, itemId, kh: kh.length, ...(sync ? sync.diag() : {}) };
    },
    dispose() {
      if (disposed) return;
      api.leave();
      disposed = true;
      for (const f of offs) { try { if (typeof f === 'function') f(); } catch { /* egal */ } }
      offs = [];
    },
  };
  return api;
}
