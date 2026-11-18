// Durable Object MpWorld (Hibernation): dünne Hülle um den reinen Reducer room.js.
// Keine Timer (Timer verhindern die Hibernation); Fristen laufen über alarm().
// Keine Cloudflare-Modulimporte (DurableObject-Basisklasse unnötig). Loggt nie Token/Ticket, nur feste Codes.
import { createState, step, precheck, onlineCount, STORE_PREFIXES } from './room.js';
import { b64urlDecode, verifyTicket } from './ticket.js';
import { pair, upgrade, autoPing } from './cf.js';

const PROTO = 'lfx-mp.1';
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

export class MpWorld {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sockets = new Map(); // c -> WebSocket
    this.st = null;
    autoPing(ctx);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const store = {};
      for (const prefix of STORE_PREFIXES) {
        for (const [k, v] of await ctx.storage.list({ prefix })) store[k] = v;
      }
      const atts = [];
      for (const ws of ctx.getWebSockets()) {
        let att;
        try { att = ws.deserializeAttachment(); } catch { att = null; }
        if (att && Number.isInteger(att.c)) { atts.push(att); this.sockets.set(att.c, ws); }
      }
      this.st = createState({
        cfg: { maxConn: num(env.MP_MAX_CONN, 16), dailyReq: num(env.MP_DAILY_REQ, 80000) },
        store, atts, now: Date.now(),
      });
    });
  }

  async fetch(request) {
    await this.ready;
    if (new URL(request.url).pathname === '/online') {
      // Nur lesen: kein step(), kein Tageszähler, keine Speicherschreibvorgänge.
      return new Response(JSON.stringify({ v: 1, n: onlineCount(this.st) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if ((request.headers.get('Upgrade') ?? '').toLowerCase() !== 'websocket') return new Response('upgrade required', { status: 426 });
    let claims;
    try {
      claims = JSON.parse(new TextDecoder().decode(b64urlDecode(request.headers.get('X-Lfx-Claims') ?? '')));
    } catch { claims = null; }
    if (!precheck(this.st, claims, Date.now()).ok) return new Response('unauthorized', { status: 401 });
    const { client, server } = pair();
    this.ctx.acceptWebSocket(server);
    const res = step(this.st, { type: 'open', claims }, Date.now());
    if (res.c) this.sockets.set(res.c, server);
    await this.apply(res);
    return upgrade(client, PROTO);
  }

  cOf(ws) {
    try { const a = ws.deserializeAttachment(); if (a && Number.isInteger(a.c)) return a.c; } catch { /* weiter */ }
    for (const [c, w] of this.sockets) if (w === ws) return c;
    return 0;
  }

  async run(event) {
    await this.ready;
    await this.apply(step(this.st, event, Date.now()));
  }

  async webSocketMessage(ws, data) {
    const c = this.cOf(ws);
    if (c) await this.run({ type: 'message', c, data });
  }

  async webSocketClose(ws, code) {
    const c = this.cOf(ws);
    this.sockets.delete(c);
    if (c) await this.run({ type: 'close', c });
    // Close-Rahmen beantworten, sonst kappt die Gegenseite erst nach Sekunden mit 1006; nur gültige Codes
    const ok = Number.isInteger(code) && (code === 1000 || (code >= 3000 && code <= 4999));
    try { ws.close(ok ? code : 1000, 'bye'); } catch { /* schon zu */ }
  }

  async webSocketError(ws) {
    const c = this.cOf(ws);
    this.sockets.delete(c);
    if (c) await this.run({ type: 'error', c });
  }

  async alarm() {
    if (!this.env.MP_SECRET) { // Kill-Schalter: Secret entfernt -> alle still schließen
      for (const ws of this.ctx.getWebSockets()) { try { ws.close(1000, 'off'); } catch { /* weg */ } }
      this.sockets.clear();
      return;
    }
    const auto = {};
    for (const [c, ws] of this.sockets) {
      const t = this.ctx.getWebSocketAutoResponseTimestamp(ws);
      if (t) auto[c] = t instanceof Date ? t.getTime() : Number(t);
    }
    await this.run({ type: 'alarm', auto });
  }

  // Effekte in der Reihenfolge des Reducers: out (inkl. bye), close, store, alarm.
  async apply(res) {
    const renews = [];
    for (const o of res.out) {
      const ws = this.sockets.get(o.c ?? 0);
      try {
        if (o.kind === 'send') {
          for (const c of o.to) this.sockets.get(c)?.send(o.data);
        } else if (o.kind === 'att') ws?.serializeAttachment(o.att);
        else if (o.kind === 'renew') renews.push(o);
      } catch { /* toter Socket: der Alarm räumt auf */ }
    }
    for (const { c, code } of res.close) {
      try { this.sockets.get(c)?.close(code, 'bye'); } catch { /* schon zu */ }
      this.sockets.delete(c);
    }
    if (res.store.length) {
      const last = new Map();
      for (const s of res.store) last.set(s.key, s);
      const put = {};
      const del = [];
      for (const [k, s] of last) { if (s.op === 'put') put[k] = s.val; else del.push(k); }
      if (Object.keys(put).length) await this.ctx.storage.put(put);
      if (del.length) await this.ctx.storage.delete(del);
    }
    if (res.alarmAt !== null) {
      const cur = await this.ctx.storage.getAlarm();
      if (cur === null || cur === undefined || res.alarmAt < cur) await this.ctx.storage.setAlarm(res.alarmAt);
    }
    for (const r of renews) {
      let claims;
      try { claims = await verifyTicket(this.env.MP_SECRET, r.tk, Date.now()); } catch { claims = null; }
      await this.run(claims ? { type: 'renew-ok', c: r.c, claims } : { type: 'renew-fail', c: r.c });
    }
  }
}
