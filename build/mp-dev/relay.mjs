// VIDEOTHEK LENZ · Mehrspieler-Harness: lokaler WebSocket-Relay auf dem ECHTEN Reducer charts-worker/src/mp/room.js (inkl. aller Unter-Reducer), ohne Cloudflare.
// NUR Dev (nie Produktionscode, nichts davon landet in dist/). Fährt den Reducer über step() wie charts-worker/src/mp/world.js:
// out (send/att/renew) → close → Alarm; Alarm per Timer im Node-Prozess (hier erlaubt, anders als im DO); Store in-memory (der Reducer hält ihn selbst in st.store).
// Paket 'ws' kommt aus charts-worker/node_modules (nichts installieren).
//
// CLI:  node build/mp-dev/relay.mjs [--port 5197] [--host 127.0.0.1] [--quiet]      (port 0 = frei; gedruckt wird "RELAY <port>")
// API:  import { startRelay } from './relay.mjs'  →  const r = await startRelay({ port, host, cfg, now })
//         r.port, r.state (Reducer-State), r.stats(), r.reset(), r.kick(name), r.close()
//   cfg  = Reducer-Konfiguration (wie MpWorld: { maxConn, dailyReq }); now = Uhr-Funktion (Standard Date.now, Tests dürfen eine eigene setzen)
// HTTP (nur zum Messen/Debuggen):  GET /stats → r.stats()    GET /health → "ok"
// WebSocket: ws://127.0.0.1:<port>/mp, Subprotokolle ['lfx-mp.1', 't.<Ticket>'] (Antwort 'lfx-mp.1'), Origin egal.
// Dev-Ticket (statt HMAC-Ticket): 'dev.<name>.<admin 0|1>' → Claims { k: Pseudonym aus 'dev-<name>' (12 Hex, stabil), n: name, a, e: jetzt+10 min, j: eindeutig je Verbindung }.
//   Ungültige Tickets → 401 vor dem Upgrade (wie die Hülle). Kein Token-/Ticket-Logging.
// Text 'ping' beantwortet der Relay selbst mit 'pong' (wie der Auto-Response des DO) und meldet ihn dem Alarm als Auto-Zeitstempel; er erreicht den Reducer nicht.
// stats(): { conns:[{c,name,live,in,out,inMax1s,sinceMs}], framesIn, framesOut, rejected, opens, alarms, peers } – in/out zählen Textframes ohne ping/pong;
//   inMax1s = höchste Zahl Client-Frames in einem gleitenden 1-s-Fenster (Sende-Takt-Prüfung ≤ 8/s).
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const require = createRequire(resolve(root, 'charts-worker', 'package.json'));
const { WebSocketServer } = require('ws');
const { createState, step, precheck } = await import(pathToFileURL(resolve(root, 'charts-worker/src/mp/room.js')).href);

const PROTO = 'lfx-mp.1';

function keyOf(s) { // gleich wie build/mp-dev/fake.js (12 Hex)
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + s.charCodeAt(i), 2246822519) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 12);
}

export function parseDevTicket(tk, nowMs, jti) {
  const m = /^dev\.([A-Za-z0-9_-]{1,24})\.([01])$/.exec(String(tk || ''));
  if (!m) return null;
  return { k: keyOf('dev-' + m[1]), n: m[1], a: m[2] === '1' ? 1 : 0, e: nowMs + 600000, j: jti };
}

export async function startRelay(o = {}) {
  const host = o.host || '127.0.0.1';
  const now = typeof o.now === 'function' ? o.now : () => Date.now();
  let st = null;
  const sockets = new Map(); // c -> ws
  const meta = new Map(); // c -> { name, in, out, times[], max, t0 }
  const auto = {}; // c -> Zeitstempel der letzten ping/pong-Antwort
  let jtiSeq = 0;
  let timer = null;
  let alarmAt = null;
  let closed = false;
  const tot = { framesIn: 0, framesOut: 0, rejected: 0, opens: 0, alarms: 0 };

  const fresh = () => createState({ cfg: o.cfg || { maxConn: 16, dailyReq: 80000 }, store: {}, atts: [], now: now() });
  st = fresh();

  function schedule() {
    if (closed || alarmAt === null) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(fireAlarm, Math.max(0, alarmAt - now()));
  }
  function fireAlarm() {
    timer = null;
    if (closed) return;
    alarmAt = null;
    tot.alarms++;
    run({ type: 'alarm', auto: { ...auto } });
  }
  function apply(res) {
    const renews = [];
    for (const x of res.out) {
      if (x.kind === 'send') {
        for (const c of x.to) {
          const ws = sockets.get(c);
          if (!ws || ws.readyState !== 1) continue;
          try { ws.send(x.data); tot.framesOut++; const mt = meta.get(c); if (mt) mt.out++; } catch { /* toter Socket: der Alarm räumt auf */ }
        }
      } else if (x.kind === 'renew') renews.push(x);
      // 'att' (Hibernation-Attachment) entfällt: der Relay hält den Zustand im Prozess
    }
    for (const { c, code } of res.close) {
      const ws = sockets.get(c);
      sockets.delete(c);
      if (ws) { try { ws.close(code, 'bye'); } catch { /* schon zu */ } }
    }
    if (res.alarmAt !== null && res.alarmAt !== undefined && (alarmAt === null || res.alarmAt < alarmAt)) { alarmAt = res.alarmAt; schedule(); }
    for (const r of renews) {
      const claims = parseDevTicket(r.tk, now(), 'dj' + ++jtiSeq);
      run(claims ? { type: 'renew-ok', c: r.c, claims } : { type: 'renew-fail', c: r.c });
    }
  }
  function run(event) {
    if (closed) return null;
    const res = step(st, event, now());
    apply(res);
    return res;
  }

  const http = createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/stats') { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(api.stats())); return; }
    if (p === '/health') { res.writeHead(200); res.end('ok'); return; }
    res.writeHead(426); res.end('upgrade required');
  });
  const wss = new WebSocketServer({ noServer: true, handleProtocols: (set) => (set.has(PROTO) ? PROTO : false), maxPayload: 4096 });

  http.on('upgrade', (req, socket, head) => {
    const deny = (code, text) => { tot.rejected++; try { socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); } catch { /* egal */ } socket.destroy(); };
    if (closed || new URL(req.url, 'http://x').pathname !== '/mp') { deny(404, 'Not Found'); return; }
    const prots = String(req.headers['sec-websocket-protocol'] || '').split(',').map((s) => s.trim());
    const tk = (prots.find((s) => s.startsWith('t.')) || '').slice(2);
    const claims = parseDevTicket(tk, now(), 'dj' + ++jtiSeq);
    if (!prots.includes(PROTO) || !claims || !precheck(st, claims, now()).ok) { deny(401, 'Unauthorized'); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const res = step(st, { type: 'open', claims }, now());
      tot.opens++;
      const c = res.c;
      if (c) {
        sockets.set(c, ws);
        meta.set(c, { name: claims.n, in: 0, out: 0, times: [], max: 0, t0: now() });
        auto[c] = now();
        ws.on('message', (data, isBinary) => {
          if (isBinary || closed) return;
          const text = data.toString('utf8');
          if (text === 'ping') { auto[c] = now(); try { ws.send('pong'); } catch { /* egal */ } return; }
          const mt = meta.get(c);
          if (mt) { const t = now(); mt.in++; mt.times.push(t); while (mt.times.length && t - mt.times[0] >= 1000) mt.times.shift(); if (mt.times.length > mt.max) mt.max = mt.times.length; }
          tot.framesIn++;
          run({ type: 'message', c, data: text });
        });
        const gone = (type) => () => {
          if (sockets.get(c) === ws) sockets.delete(c);
          delete auto[c];
          const mt = meta.get(c);
          if (mt) mt.gone = true;
          run({ type, c });
        };
        ws.on('close', gone('close'));
        ws.on('error', gone('error'));
      }
      apply(res);
    });
  });

  await new Promise((r, j) => { http.once('error', j); http.listen(o.port || 0, host, r); });
  const api = {
    port: http.address().port,
    get state() { return st; },
    stats() {
      const conns = [...meta.entries()].map(([c, m]) => ({ c, name: m.name, live: !m.gone && sockets.has(c), in: m.in, out: m.out, inMax1s: m.max, sinceMs: now() - m.t0 }));
      return { ...tot, conns, peers: Object.keys(st.peers).length, alarmAt };
    },
    /** Zähler (nicht den Reducer) zurücksetzen, z. B. vor einer Messphase. */
    resetCounters() { for (const m of meta.values()) { m.in = 0; m.out = 0; m.max = 0; m.times.length = 0; } tot.framesIn = tot.framesOut = 0; },
    /** Alles auf Anfang: Verbindungen schließen, neuer Reducer-Zustand (neuer Wetter-Seed, Richard/Physik leer). */
    reset() { for (const ws of sockets.values()) { try { ws.close(1000, 'reset'); } catch { /* egal */ } } sockets.clear(); meta.clear(); for (const k of Object.keys(auto)) delete auto[k]; alarmAt = null; if (timer) clearTimeout(timer); timer = null; st = fresh(); },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      for (const ws of sockets.values()) { try { ws.terminate(); } catch { /* egal */ } }
      sockets.clear();
      wss.close();
      return new Promise((r) => { http.close(() => r()); http.closeAllConnections?.(); });
    },
  };
  return api;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2);
  const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
  const r = await startRelay({ port: Number(opt('port', 5197)), host: opt('host', '127.0.0.1') });
  console.log(`RELAY ${r.port}`);
  if (!a.includes('--quiet')) console.log(`lfx-mp relay: ws://127.0.0.1:${r.port}/mp  (stats: http://127.0.0.1:${r.port}/stats)`);
  const stop = () => { r.close().then(() => process.exit(0)); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
