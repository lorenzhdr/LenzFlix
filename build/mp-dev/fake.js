// VIDEOTHEK LENZ · Mehrspieler-Harness: Fake-Welt im Browser/Node auf dem ECHTEN Reducer charts-worker/src/mp/room.js (kein Netzwerk).
// Nur Dev (build/serve.mjs liefert build/mp-dev/*.js und charts-worker/src/mp/*.js lesend aus); nichts davon landet in dist/.
//   createFakeWorld({ mode, bots, seed, latency, virtual, now, uid, name, admin }) → {
//     mp          deps.mp der Hülle: { uid, cv, prefs(), ticket(), on() }  (mode ≠ 'ok' → ticket() scheitert wie die Hülle: nourl|gone|off|auth|blocked)
//     socketFactory  Klasse FakeWebSocket (new socketFactory(url, [SUB, 't.<tk>'])) für opts.mpTransport / Transport-env.WebSocket
//     bots        Bot-Schwarm (build/mp-dev/bots.js), stats()
//     connect(claims, handlers) → { c, send(text), close(code) }   (für Bots/Tests, ohne Ticket)
//     setPrefs(partial), start() (Browser: Takt per setInterval 25 ms), advance(ms) (nur virtual), pump(), stats(), dispose() }
//   Welle 2: admin = ich bin Admin (Ticket a=1), prefs = Start-Prefs (z. B. { chat:false }), botSocial (Standard true: Bots chatten/emoten von selbst), botAdmin = Bot-Index mit Admin-Rolle.
//   mode: 'ok' | 'nourl' | '404' | '503' | '401' | 'blocked' | 'drop' (Verbindung bricht sofort nach dem Öffnen ab, 1006).
//   virtual: eigene Uhr (Start opts.start), advance(ms) treibt Server, Latenz, Alarm und Bots in 25-ms-Schritten.
import { createState, step, precheck } from '../../charts-worker/src/mp/room.js';
import { createBots } from './bots.js';

const STEP_MS = 25;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function keyOf(s) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + s.charCodeAt(i), 2246822519) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 12);
}

export function createFakeWorld(o = {}) {
  const mode = o.mode || 'ok';
  const virtual = !!o.virtual;
  let vt = Number.isFinite(o.start) ? o.start : 1_800_000_000_000;
  const now = typeof o.now === 'function' ? o.now : virtual ? () => vt : () => Date.now();
  const lat = Number.isFinite(o.latency) ? o.latency : 30;
  const rnd = mulberry32(o.seed || 1);
  const st = createState({ cfg: o.cfg, store: {}, atts: [], now: now() });
  const conns = new Map(); // c -> { recv(data), serverClose(code) }
  const tickets = new Map(); // tk -> claims
  const queue = [];
  let qseq = 0;
  let tkSeq = 0;
  let alarmAt = null;
  let timer = null;
  let disposed = false;
  const stats = { framesIn: 0, framesOut: 0, opens: 0, rejected: 0 };
  const uid = o.uid || 'fake-user';
  const prefs = { on: true, name: true, film: false, chat: true, mute: [], hint: false, ...(o.prefs || {}) };

  const at = (ms, fn) => queue.push({ t: now() + ms, s: qseq++, fn });

  function apply(r) {
    for (const x of r.out) {
      if (x.kind === 'send') {
        for (const c of x.to) {
          const cn = conns.get(c);
          if (cn) {
            stats.framesOut++;
            at(lat, () => { if (conns.get(c) === cn) cn.recv(x.data); });
          }
        }
      } else if (x.kind === 'renew') {
        const cl = tickets.get(x.tk);
        at(lat, () => apply(step(st, cl ? { type: 'renew-ok', c: x.c, claims: cl } : { type: 'renew-fail', c: x.c }, now(), rnd)));
      }
    }
    for (const { c, code } of r.close) {
      const cn = conns.get(c);
      if (!cn) continue;
      conns.delete(c);
      at(lat, () => cn.serverClose(code));
    }
    if (r.alarmAt != null && (alarmAt === null || r.alarmAt < alarmAt)) alarmAt = r.alarmAt;
  }

  /** Server-Seite: Verbindung mit Ticket-Claims annehmen (precheck entspricht dem 401 vor dem accept). Rückgabe c oder 0. */
  function attach(claims, conn) {
    const t = now();
    if (!precheck(st, claims, t).ok) {
      stats.rejected++;
      return 0;
    }
    stats.opens++;
    const r = step(st, { type: 'open', claims }, t, rnd);
    conns.set(r.c, conn);
    apply(r);
    return r.c;
  }
  function fromClient(c, conn, data) {
    stats.framesIn++;
    at(lat, () => { if (conns.get(c) === conn) apply(step(st, { type: 'message', c, data }, now(), rnd)); });
  }
  function clientClose(c, conn) {
    at(lat, () => {
      if (conns.get(c) === conn) {
        conns.delete(c);
        apply(step(st, { type: 'close', c }, now(), rnd));
      }
    });
  }

  /** Ohne Ticket verbinden (Bots, Tests). handlers: { onMessage(text), onClose(code) }. */
  function connect(claims, handlers = {}) {
    let open = true;
    const conn = {
      recv: (d) => { if (open && handlers.onMessage) handlers.onMessage(d); },
      serverClose: (code) => {
        if (open) {
          open = false;
          if (handlers.onClose) handlers.onClose(code);
        }
      },
    };
    const c = attach(claims, conn);
    if (!c) {
      open = false;
      return null;
    }
    return {
      c,
      send: (text) => { if (open) fromClient(c, conn, text); },
      close: () => {
        if (open) {
          open = false;
          clientClose(c, conn);
        }
      },
    };
  }

  function mintClaims(extra = {}) {
    const n = ++tkSeq;
    return { k: keyOf(uid), n: o.name || 'Du', a: o.admin ? 1 : 0, e: now() + 600000, j: 'fj' + n, ...extra };
  }

  class FakeWebSocket {
    constructor(url, protocols) {
      this.url = String(url);
      this.protocols = protocols;
      this.protocol = '';
      this.readyState = 0;
      this.onopen = this.onmessage = this.onclose = this.onerror = null;
      this.sent = [];
      this._c = 0;
      this._conn = null;
      at(lat, () => this._connect());
    }

    _connect() {
      if (this.readyState !== 0) return;
      const tk = (Array.isArray(this.protocols) ? this.protocols : []).map((p) => String(p)).find((p) => p.startsWith('t.'));
      const claims = tk ? tickets.get(tk.slice(2)) : null;
      if (mode === 'drop' || !claims) {
        this._fail(1006);
        return;
      }
      const conn = {
        recv: (data) => { if (this.readyState === 1 && this.onmessage) this.onmessage({ data }); },
        serverClose: (code) => {
          if (this.readyState === 3) return;
          this.readyState = 3;
          if (this.onclose) this.onclose({ code, reason: '', wasClean: code < 4000 });
        },
      };
      this._conn = conn;
      const c = attach(claims, conn);
      if (!c) {
        this._fail(1006);
        return;
      }
      this._c = c;
      this.protocol = 'lfx-mp.1';
      this.readyState = 1;
      if (this.onopen) this.onopen({});
    }

    _fail(code) {
      this.readyState = 3;
      at(0, () => {
        if (this.onerror) this.onerror({});
        if (this.onclose) this.onclose({ code, reason: '', wasClean: false });
      });
    }

    send(s) {
      if (this.readyState !== 1) throw new Error('not open');
      this.sent.push(s);
      fromClient(this._c, this._conn, String(s));
    }

    close(code = 1000) {
      if (this.readyState >= 2) return;
      const was = this.readyState;
      this.readyState = 3;
      if (was === 1) clientClose(this._c, this._conn);
      at(1, () => { if (this.onclose) this.onclose({ code, reason: '', wasClean: true }); });
    }
  }

  const WHY = { nourl: 'nourl', 404: 'gone', 503: 'off', 401: 'auth', blocked: 'blocked' };
  const mp = {
    uid,
    cv: '1.16.0',
    prefs: () => ({ ...prefs, mute: prefs.mute.slice() }),
    on: () => () => {},
    ticket: async () => {
      if (WHY[mode]) return { ok: false, why: WHY[mode] };
      const claims = mintClaims();
      const tk = 'ft' + (++tkSeq).toString(36) + '.s' + claims.j;
      tickets.set(tk, claims);
      return { ok: true, tk, url: 'wss://fake.invalid/mp', exp: claims.e, pv: [1], s: now() };
    },
  };

  const world = {
    mode, mp, socketFactory: FakeWebSocket, connect, state: st, bots: null, now,
    setPrefs(p) {
      if (!p) return;
      for (const k of ['on', 'name', 'film', 'chat', 'hint']) if (typeof p[k] === 'boolean') prefs[k] = p[k];
      if (Array.isArray(p.mute)) prefs.mute = p.mute.slice(0, 50);
    },
    pump() {
      if (disposed) return;
      for (let guard = 0; guard < 5000; guard++) {
        const t = now();
        let best = -1;
        for (let i = 0; i < queue.length; i++) {
          if (queue[i].t <= t && (best < 0 || queue[i].t < queue[best].t || (queue[i].t === queue[best].t && queue[i].s < queue[best].s))) best = i;
        }
        if (best >= 0) {
          queue.splice(best, 1)[0].fn();
          continue;
        }
        if (alarmAt !== null && alarmAt <= t) {
          alarmAt = null;
          apply(step(st, { type: 'alarm' }, t, rnd));
          continue;
        }
        break;
      }
      if (world.bots) world.bots.tick(now());
    },
    start() {
      if (!virtual && !timer && !disposed) timer = setInterval(() => world.pump(), STEP_MS);
      return world;
    },
    advance(ms) {
      if (!virtual) {
        world.pump();
        return;
      }
      const end = vt + ms;
      while (vt < end) {
        vt = Math.min(end, vt + STEP_MS);
        world.pump();
      }
    },
    stats() { return { ...stats, conns: conns.size, peers: Object.keys(st.peers).length, queued: queue.length, alarmAt, mode }; },
    dispose() {
      if (disposed) return;
      if (world.bots) world.bots.dispose();
      disposed = true;
      if (timer) clearInterval(timer);
      timer = null;
      queue.length = 0;
      conns.clear();
    },
  };
  world.bots = createBots(world, { n: Math.max(0, Math.floor(o.bots || 0)), seed: o.seed || 1, social: o.botSocial !== false, adminBot: Number.isInteger(o.botAdmin) ? o.botAdmin : -1 });
  return world;
}
