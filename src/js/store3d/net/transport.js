// VIDEOTHEK LENZ · Mehrspieler: WebSocket-Transport (Zustandsautomat, ohne DOM/Jellyfin; alles Umgebungsabhängige per `env`).
// Ticket -> new WebSocket(url, ['lfx-mp.1', 't.'+tk]) -> hi -> wl -> live. EIN Sende-Takt (125 ms, nur bei nicht-leerer Warteschlange,
// <= 8 Frames/s, Client-Bucket <= 10/s), Keepalive-Text 'ping' alle 3 s, Backoff, Close-Code-Tabelle, Ticket-Erneuerung.
// Vertrag: docs/mp-api.md §2, §3, §6.3. Nie Token/Ticket loggen oder in eine URL schreiben; es wird gar nichts geloggt.
import { SUB, PV, CAP_OF, build, normalizeOut } from './proto.js';
import { createClock } from './clock.js';

export const TICK_MS = 125;
export const BUCKET_PER_S = 10;
export const FRAME_CHARS = 2000; // unter dem Server-Limit von 2048
// 3 s (statt 25 s): Cloudflare kappte live (17.11.2026) Workers-WebSockets nach genau 5 s ohne Nachricht vom Server (1006);
// der Auto-Response-Pong hält die Leitung offen, ohne das DO zu wecken. Kosten: höchstens ~60 Requests je Spielerstunde (20:1).
export const PING_MS = 3000;
export const PONG_DEAD_MS = 20000; // ältester unbeantworteter Ping älter als das: Verbindung tot
export const HELLO_MS = 12000;
export const RENEW_MS = 600000;
export const STABLE_MS = 60000;
export const HIDDEN_MS = 60000;
export const BACKOFF_S = [1, 2, 4, 8, 16, 30, 60];
export const ATTEMPTS_MAX = 6;
export const ATTEMPTS_WINDOW_MS = 600000;
export const LONG_PAUSE_MS = 1800000;
export const CK_COUNT = 5;
export const CK_GAP_MS = 1000;
export const CK_EVERY_MS = 300000;

/** why-Codes von ticket(), die für die Seitensitzung ausschalten (Rest: Backoff). */
export const FATAL_WHY = ['nourl', 'gone', 'off', 'blocked', 'bad', 'auth', 'user'];
const COALESCE = new Set(['p', 'hd', 'f', 'rs']); // letzte Nachricht gewinnt
const URGENT = new Set(['m', 'e', 'pu', 'kc']); // lösen höchstens einen vorgezogenen Takt aus

const isObj = (v) => v && typeof v === 'object';

/**
 * opts: { ticket? , env: { WebSocket, now, setTimeout, clearTimeout, ticket?, random? }, hello() -> {cap, f, cv}, onMsg(msg), onState(state, info) }
 * Zustände: off | idle | ticket | open | hello | live | backoff | dead | banned.
 */
export function createTransport(opts) {
  const env = opts.env;
  const ticketFn = opts.ticket || env.ticket;
  const now = () => env.now();
  const st = (fn, ms) => env.setTimeout(fn, ms);
  const ct = (h) => { if (h !== null && h !== undefined) env.clearTimeout(h); };
  const rnd = () => (env.random ? env.random() : Math.random());
  const clock = createClock({ now });

  let state = 'off';
  let why = null; // dead/backoff-Grund
  let until = 0; // backoff/banned: Ende (lokale ms)
  let hint = null;
  let enabled = false;
  let ws = null;
  let seq = 0; // Verbindungs-/Ticket-Generation
  let attempt = 0; // Index in BACKOFF_S
  let attemptLog = [];
  let fastUsed = false;
  let badCount = 0;
  let wasLive = false;
  let lastBye = null;
  let caps = null;
  let me = null;
  let cf = { pr: 8, ph: 8 };
  let hidden = false;
  let kino = false;
  let resumeOnVisible = false;
  let errLog = [];

  let queue = [];
  let sentTimes = [];
  let lastFlush = -Infinity;
  let earlyUsed = false;
  let flushEarly = false;

  const T = { retry: null, hello: null, ping: null, renew: null, stable: null, ck: null, flush: null, hidden: null };
  const clearT = (k) => { ct(T[k]); T[k] = null; };
  const clearAll = () => { for (const k of Object.keys(T)) clearT(k); };

  let awaitingPong = false;
  let pingSentT = 0; // Zeitpunkt des ältesten unbeantworteten Pings
  let ckN = 0;

  const info = () => ({ state, why, until, hint, attempt, cf: { ...cf }, count: attemptLog.length });
  function setState(s, w = null, h = null) {
    state = s;
    why = w;
    hint = h;
    try { if (opts.onState) opts.onState(s, info()); } catch { /* Hörer-Fehler dürfen den Transport nicht stören */ }
  }

  function detach(sock) {
    if (!sock) return;
    sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null;
  }
  function closeSock(code = 1000) {
    const s = ws;
    ws = null;
    seq++;
    detach(s);
    if (s) { try { s.close(code); } catch { /* schon zu */ } }
  }

  function die(w, h = null) {
    clearAll();
    closeSock(1000);
    queue = [];
    setState('dead', w, h);
  }

  // --- Verbinden ---------------------------------------------------------------------------------------------------
  function connect() {
    if (!enabled || state === 'dead') return;
    clearT('retry');
    clearT('hello');
    const my = ++seq;
    const t0 = now();
    attemptLog.push(t0);
    attemptLog = attemptLog.filter((x) => t0 - x <= ATTEMPTS_WINDOW_MS);
    lastBye = null;
    wasLive = false;
    setState('ticket');
    let p;
    try { p = Promise.resolve(ticketFn()); } catch { p = Promise.resolve({ ok: false, why: 'net' }); }
    p.then((r) => r, () => ({ ok: false, why: 'net' })).then((res) => {
      if (my !== seq || !enabled || state !== 'ticket') return;
      if (!res || !res.ok) {
        const w = (res && res.why) || 'net';
        if (FATAL_WHY.includes(w)) die(w);
        else scheduleRetry(w === 'rate' ? 'rate' : 'net');
        return;
      }
      if (Array.isArray(res.pv) && !res.pv.includes(PV)) { die('pv', 'Update nötig'); return; }
      if (typeof res.tk !== 'string' || typeof res.url !== 'string') { die('bad'); return; }
      if (Number.isFinite(res.s)) clock.seed(res.s);
      open(res, my);
    });
  }

  function open(res, my) {
    let sock;
    try { sock = new env.WebSocket(res.url, [SUB, `t.${res.tk}`]); } catch { handleClosed(1006); return; }
    ws = sock;
    setState('open');
    sock.onopen = () => {
      if (ws !== sock || my !== seq) return;
      sendRaw([build.hi(opts.hello ? opts.hello() : {})]);
      setState('hello');
      T.hello = st(() => { T.hello = null; if (ws === sock) dropConn(1006); }, HELLO_MS);
    };
    sock.onmessage = (ev) => { if (ws === sock && my === seq) onMessage(ev && ev.data); };
    sock.onerror = () => { /* das close-Ereignis folgt */ };
    sock.onclose = (ev) => {
      if (ws !== sock || my !== seq) return;
      ws = null;
      detach(sock);
      handleClosed(ev && Number.isFinite(ev.code) ? ev.code : 1006);
    };
  }

  /** Verbindung von uns aus verwerfen und wie einen Abbruch behandeln. */
  function dropConn(code) {
    const s = ws;
    ws = null;
    seq++;
    detach(s);
    if (s) { try { s.close(1000); } catch { /* weg */ } }
    handleClosed(code);
  }

  // --- Schließen: Tabelle -----------------------------------------------------------------------------------------
  function handleClosed(code) {
    clearT('hello');
    clearT('ping');
    clearT('renew');
    clearT('stable');
    clearT('ck');
    clearT('flush');
    queue = [];
    const live = wasLive;
    wasLive = false;
    const c = lastBye && lastBye.c;
    if (!enabled) return;
    if (code === 4001) return die('pv', 'Update nötig');
    if (code === 4409) return die('dup');
    if (code === 4403) {
      let u = now() + 600000;
      const lu = lastBye && Number.isFinite(lastBye.u) ? clock.toLocal(lastBye.u) : null;
      if (lu !== null) u = Math.max(now(), Math.min(lu, now() + 86400000));
      until = u;
      setState('banned', 'ban');
      T.retry = st(() => { T.retry = null; connect(); }, Math.max(0, u - now()));
      return;
    }
    if (code === 4429) return wait(60000, 'rate');
    if (code === 4503) return wait(c === 'quota' ? LONG_PAUSE_MS : 60000, c === 'quota' ? 'quota' : 'full');
    if (code === 4000 || code === 4408) {
      badCount++;
      if (badCount >= 3) return die('bad');
      return scheduleRetry('bad');
    }
    if (code === 4401 || (code === 1006 && !live && !lastBye)) {
      // neues Ticket, genau einmal sofort (Upgrade-401 ist im Browser nicht von 1006 unterscheidbar)
      if (!fastUsed) { fastUsed = true; connect(); return; }
    }
    scheduleRetry(code === 4401 ? 'auth' : 'net');
  }

  function wait(ms, w) {
    until = now() + ms;
    setState('backoff', w);
    T.retry = st(() => { T.retry = null; connect(); }, ms);
  }

  function scheduleRetry(w) {
    const t = now();
    attemptLog = attemptLog.filter((x) => t - x <= ATTEMPTS_WINDOW_MS);
    let ms;
    if (attemptLog.length >= ATTEMPTS_MAX) {
      ms = LONG_PAUSE_MS;
      attemptLog = [];
      w = 'limit';
    } else {
      const base = BACKOFF_S[Math.min(attempt, BACKOFF_S.length - 1)] * 1000;
      ms = Math.round(base * (0.8 + rnd() * 0.4));
      attempt++;
    }
    wait(ms, w);
  }

  // --- Empfangen -------------------------------------------------------------------------------------------------
  function onMessage(data) {
    if (typeof data !== 'string') return;
    if (data === 'pong') { awaitingPong = false; return; }
    let j;
    try { j = JSON.parse(data); } catch { return; }
    for (const m of Array.isArray(j) ? j : [j]) if (isObj(m) && typeof m.t === 'string') handle(m);
  }

  function handle(m) {
    if (m.t === 'ck') { clock.sample(m.a, m.s); return; }
    if (m.t === 'bye') lastBye = { c: m.c, u: m.u };
    if (m.t === 'wl') {
      if (Array.isArray(m.cap)) caps = new Set(m.cap);
      if (!caps || !caps.has('pres')) { die('cap'); return; }
      me = { c: m.c, k: m.k, admin: !!m.ad };
      if (m.cf) setCf(m.cf);
      if (Number.isFinite(m.s)) clock.seed(m.s);
      goLive();
    } else if (m.t === 'b' && Array.isArray(m.ev)) {
      for (const e of m.ev) if (e && e.t === 'cf') setCf(e);
    }
    try { if (opts.onMsg) opts.onMsg(m); } catch {
      const t = now();
      errLog = errLog.filter((x) => t - x < 60000);
      errLog.push(t);
      if (errLog.length > 5) die('err');
    }
  }

  function setCf(o) {
    const n = (v, d) => (Number.isFinite(v) ? Math.max(1, Math.min(8, Math.round(v))) : d);
    cf = { pr: n(o.pr, cf.pr), ph: n(o.ph, cf.ph) };
  }

  function goLive() {
    clearT('hello');
    if (state === 'live') return;
    wasLive = true;
    fastUsed = false;
    lastFlush = -Infinity;
    awaitingPong = false;
    pingSentT = 0;
    setState('live');
    // 60 s stabil: Backoff zurück und die Sturm-Grenze (6/10 min) vergisst die bisherigen Versuche – sie soll nur kurz lebende
    // Verbindungen bremsen, nicht oft entsperrte Handys oder Neuladen nach langen, stabilen Phasen.
    T.stable = st(() => { T.stable = null; attempt = 0; attemptLog = []; }, STABLE_MS);
    T.ping = st(pingTick, PING_MS);
    T.renew = st(renewTick, RENEW_MS);
    ckN = 0;
    ckTick();
  }

  // --- Keepalive, Zeitabgleich, Erneuerung ---------------------------------------------------------------------
  function pingTick() {
    T.ping = null;
    if (state !== 'live' || !ws) return;
    const t = now();
    // Tot erst, wenn der älteste Ping 20 s ohne Pong ist (kurze Funklöcher überstehen; nach Geräteschlaf sofort neu).
    // Gedrosselte Hintergrund-Timer sind kein Ausfall: der Pong kommt als Ereignis und löscht awaitingPong.
    if (awaitingPong && t - pingSentT > PONG_DEAD_MS) { dropConn(1006); return; }
    try { ws.send('ping'); } catch { dropConn(1006); return; }
    if (!awaitingPong) { awaitingPong = true; pingSentT = t; }
    T.ping = st(pingTick, PING_MS);
  }

  function ckTick() {
    T.ck = null;
    if (state !== 'live') return;
    if (bucketOk()) { sendRaw([build.ck(now())]); markSent(); }
    ckN++;
    T.ck = st(ckTick, ckN < CK_COUNT ? CK_GAP_MS : CK_EVERY_MS);
  }

  let renewFails = 0;
  function renewTick() {
    T.renew = null;
    if (state !== 'live') return;
    let p;
    try { p = Promise.resolve(ticketFn()); } catch { p = Promise.resolve({ ok: false }); }
    const my = seq;
    p.then((r) => r, () => ({ ok: false })).then((res) => {
      if (my !== seq || state !== 'live') return;
      if (res && res.ok && typeof res.tk === 'string') {
        renewFails = 0;
        const rn = build.rn(res.tk);
        if (rn) { enqueue(rn); schedule(); }
        T.renew = st(renewTick, RENEW_MS);
      } else if (++renewFails <= 3) T.renew = st(renewTick, 60000);
      // sonst: der Server schließt mit 4401, dann gilt der normale Weg
    });
  }

  // --- Senden: ein Takt ---------------------------------------------------------------------------------------------
  function rawSend(str) {
    try { ws.send(str); return true; } catch { return false; }
  }
  function sendRaw(arr) { return ws ? rawSend(JSON.stringify(arr)) : false; }
  function prune() { const t = now(); sentTimes = sentTimes.filter((x) => t - x < 1000); }
  function bucketOk() { prune(); return sentTimes.length < BUCKET_PER_S; }
  function markSent() { sentTimes.push(now()); }

  function enqueue(msg) {
    if (COALESCE.has(msg.t)) {
      const i = queue.findIndex((q) => q.t === msg.t);
      if (i >= 0) { queue[i] = msg; return; }
    } else if (msg.t === 'ps') {
      const i = queue.findIndex((q) => q.t === 'ps');
      if (i >= 0) {
        const ids = new Set(msg.l.map((e) => e[0]));
        const rest = queue[i].l.filter((e) => !ids.has(e[0]));
        queue[i] = { t: 'ps', l: [...msg.l, ...rest] };
        return;
      }
    }
    queue.push(msg);
    if (queue.length > 64) queue.shift();
  }

  function schedule(delay) {
    if (T.flush !== null || state !== 'live') return;
    const d = delay !== undefined ? delay : Math.max(0, lastFlush + TICK_MS - now());
    T.flush = st(flush, d);
  }

  function flush() {
    T.flush = null;
    if (state !== 'live' || !ws || !queue.length) return;
    prune();
    if (sentTimes.length >= BUCKET_PER_S) { schedule(Math.max(1, sentTimes[0] + 1000 - now())); return; }
    const out = [];
    let len = 2;
    const rest = [];
    for (const m of queue) {
      let cur = m;
      let s = JSON.stringify(cur);
      if (out.length && len + s.length + 1 > FRAME_CHARS) {
        if (cur.t === 'ps') {
          const keep = [];
          const more = [];
          let l2 = len;
          for (const e of cur.l) {
            const es = JSON.stringify(e).length + 1;
            if (!more.length && l2 + es + 30 <= FRAME_CHARS) { keep.push(e); l2 += es; } else more.push(e);
          }
          if (keep.length) { out.push({ t: 'ps', l: keep }); len = l2 + 30; }
          if (more.length) rest.push({ t: 'ps', l: more });
          continue;
        }
        rest.push(cur);
        continue;
      }
      if (s.length + 2 > FRAME_CHARS && !out.length) {
        if (cur.t === 'ps' && cur.l.length > 1) { // einzelner zu großer ps: auf die Hälfte der Einträge, Rest später
          const h = Math.ceil(cur.l.length / 2);
          cur = { t: 'ps', l: cur.l.slice(0, h) };
          rest.push({ t: 'ps', l: m.l.slice(h) });
          s = JSON.stringify(cur);
          if (s.length + 2 > FRAME_CHARS) continue;
        } else continue; // nie sendbar: verwerfen
      }
      out.push(cur);
      len += s.length + 1;
    }
    queue = rest;
    if (out.length) {
      if (!rawSend(JSON.stringify(out))) { dropConn(1006); return; }
      markSent();
      lastFlush = now();
      if (!flushEarly) earlyUsed = false; // der Zähler gilt je regulärem Takt
      flushEarly = false;
    }
    if (queue.length) schedule();
  }

  // --- Sichtbarkeit (W9) ---------------------------------------------------------------------------------------------
  function hiddenCheck() {
    clearT('hidden');
    if (!hidden || kino || !enabled) return;
    if (state === 'off' || state === 'dead' || state === 'idle') return;
    T.hidden = st(() => {
      T.hidden = null;
      if (!hidden || kino || !enabled) return;
      clearAll();
      closeSock(1000);
      queue = [];
      resumeOnVisible = true;
      setState('idle', 'hidden');
    }, HIDDEN_MS);
  }

  return {
    clock,
    start() {
      if (state === 'dead') return false;
      enabled = true;
      if (state === 'off' || state === 'idle') { resumeOnVisible = false; if (hidden && !kino) { resumeOnVisible = true; setState('idle', 'hidden'); } else connect(); }
      return true;
    },
    /** Schalter aus, Logout, dispose, suspend: mit 1000 schließen (kein Neuverbinden). */
    stop(code = 1000) {
      enabled = false;
      resumeOnVisible = false;
      clearAll();
      closeSock(code);
      queue = [];
      wasLive = false;
      if (state !== 'dead') setState('off');
    },
    /** Nach „dead“ (Nutzerwechsel) alles zurücksetzen. */
    reset() {
      enabled = false;
      clearAll();
      closeSock(1000);
      queue = [];
      attempt = 0;
      attemptLog = [];
      fastUsed = false;
      badCount = 0;
      errLog = [];
      renewFails = 0;
      clock.reset();
      caps = null;
      me = null;
      cf = { pr: 8, ph: 8 };
      setState('off');
    },
    /** In die Warteschlange (Takt). false bei inaktiv, fehlender Fähigkeit oder ungültiger Nachricht. */
    send(msg, o) {
      if (state !== 'live') return false;
      const m = normalizeOut(msg);
      if (!m) return false;
      const need = CAP_OF[m.t];
      if (need && (!caps || !caps.has(need))) return false;
      if (hidden && (m.t === 'p' || m.t === 'ps' || m.t === 'rs')) return false;
      enqueue(m);
      const urgent = (o && o.urgent) || URGENT.has(m.t);
      if (urgent && !earlyUsed && now() - lastFlush < TICK_MS) {
        earlyUsed = true;
        flushEarly = true;
        clearT('flush');
        schedule(0);
      } else schedule();
      return true;
    },
    /** Sichtbarkeit des Tabs: verborgen = keine Posen, nach 60 s Close 1000 (außer Kino aktiv). */
    setHidden(h) {
      hidden = !!h;
      if (!hidden) {
        clearT('hidden');
        if (resumeOnVisible && enabled && state === 'idle') { resumeOnVisible = false; connect(); }
      } else hiddenCheck();
    },
    /** Kino-Sitzung aktiv: Verbindung bleibt auch verborgen offen. */
    setKino(on) {
      kino = !!on;
      if (kino) clearT('hidden');
      else hiddenCheck();
      if (kino && hidden && resumeOnVisible && enabled && state === 'idle') { resumeOnVisible = false; connect(); }
    },
    state: () => state,
    info,
    live: () => state === 'live',
    me: () => (me ? { ...me } : null),
    has: (c) => !!(caps && caps.has(c)),
    cf: () => ({ ...cf }),
    serverNow: () => clock.serverNow(),
    queued: () => queue.length,
  };
}
