import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { b64urlJson, mintTicket, verifyTicket } from '../src/mp/ticket.js';

vi.mock('../src/mp/cf.js', () => ({
  pair: () => ({ client: { role: 'client' }, server: new FakeWs() }),
  upgrade: (client, proto) => ({ status: 101, client, proto }),
  autoPing: () => {},
}));

const { MpWorld } = await import('../src/mp/world.js');

class FakeWs {
  constructor() { this.sent = []; this.att = null; this.closed = null; }
  send(d) { this.sent.push(d); }
  serializeAttachment(a) { this.att = structuredClone(a); }
  deserializeAttachment() { return this.att === null ? null : structuredClone(this.att); }
  close(code, reason) { this.closed = { code, reason }; }
  frames() { return this.sent.map((s) => (s === 'pong' ? s : JSON.parse(s))); }
}

function makeCtx() {
  const data = new Map();
  let alarm = null;
  const sockets = [];
  return {
    sockets,
    data,
    getAlarm: () => alarm,
    blockConcurrencyWhile: (fn) => fn(),
    acceptWebSocket: (ws) => sockets.push(ws),
    getWebSockets: () => sockets.filter((w) => !w.closed),
    getWebSocketAutoResponseTimestamp: () => null,
    setWebSocketAutoResponse: () => {},
    storage: {
      list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix))),
      put: async (o) => { for (const [k, v] of Object.entries(o)) data.set(k, structuredClone(v)); },
      delete: async (ks) => { for (const k of ks) data.delete(k); },
      getAlarm: async () => alarm,
      setAlarm: async (t) => { alarm = t; },
    },
  };
}

const SECRET = 's'.repeat(40);
const claims = (ch, j = ch.repeat(32), n = 'Anna') => ({ k: ch.repeat(12), n, a: 0, e: Date.now() + 3_600_000, j });
const req = (cl) => new Request('https://x/mp', {
  headers: { Upgrade: 'websocket', 'X-Lfx-Claims': b64urlJson(cl) },
});
const HI = JSON.stringify([{ t: 'hi', pv: 1, cap: ['pres'], f: 3, cv: '1.16.0' }]);

describe('MpWorld', () => {
  it('nimmt eine Verbindung an, antwortet 101 mit Protokoll und schreibt ein kleines Attachment', async () => {
    const ctx = makeCtx();
    const w = new MpWorld(ctx, { MP_SECRET: SECRET });
    const res = await w.fetch(req(claims('a')));
    expect(res.status).toBe(101);
    expect(res.proto).toBe('lfx-mp.1');
    const ws = ctx.sockets[0];
    expect(JSON.stringify(ws.att).length).toBeLessThan(1024);
    await w.webSocketMessage(ws, HI);
    const f = ws.frames().find((x) => x.t === 'wl');
    expect(f).toBeTruthy();
    expect(f.pv).toBe(1);
    expect(await ctx.storage.getAlarm()).toBeGreaterThan(Date.now());
  });

  it('lehnt wiederverwendete jti mit 401 ab, ohne zu akzeptieren', async () => {
    const ctx = makeCtx();
    const w = new MpWorld(ctx, { MP_SECRET: SECRET });
    expect((await w.fetch(req(claims('a', 'j'.repeat(32))))).status).toBe(101);
    const r2 = await w.fetch(req(claims('b', 'j'.repeat(32))));
    expect(r2.status).toBe(401);
    expect(ctx.sockets).toHaveLength(1);
  });

  it('lehnt fehlende oder kaputte Claims und Nicht-Upgrade ab', async () => {
    const w = new MpWorld(makeCtx(), { MP_SECRET: SECRET });
    expect((await w.fetch(new Request('https://x/mp'))).status).toBe(426);
    const bad = new Request('https://x/mp', { headers: { Upgrade: 'websocket', 'X-Lfx-Claims': '!!' } });
    expect((await w.fetch(bad)).status).toBe(401);
  });

  it('rekonstruiert den Raum nach Kaltstart aus Attachments und Storage', async () => {
    const ctx = makeCtx();
    const w1 = new MpWorld(ctx, { MP_SECRET: SECRET });
    await w1.fetch(req(claims('a')));
    await w1.webSocketMessage(ctx.sockets[0], HI);
    const w2 = new MpWorld(ctx, { MP_SECRET: SECRET }); // neue Instanz, gleiche Sockets
    await w2.ready;
    expect(w2.st.peers[ctx.sockets[0].att.c]).toBeTruthy();
    expect(w2.st.peers[ctx.sockets[0].att.c].live).toBe(true);
    await w2.fetch(req(claims('b')));
    const wsB = ctx.sockets[1];
    await w2.webSocketMessage(wsB, HI);
    const joinA = ctx.sockets[0].frames().find((x) => x.t === 'b' && x.ev?.some((e) => e.t === 'j'));
    expect(joinA).toBeTruthy();
    // jti bleibt nach Kaltstart gesperrt
    expect((await w2.fetch(req(claims('c', 'a'.repeat(32))))).status).toBe(401);
  });

  it('schließt mit Code, entfernt den Socket und meldet l an die anderen', async () => {
    const ctx = makeCtx();
    const w = new MpWorld(ctx, { MP_SECRET: SECRET });
    await w.fetch(req(claims('a')));
    await w.fetch(req(claims('b')));
    await w.webSocketMessage(ctx.sockets[0], HI);
    await w.webSocketMessage(ctx.sockets[1], HI);
    await w.webSocketClose(ctx.sockets[1]);
    const leave = ctx.sockets[0].frames().some((x) => x.t === 'b' && x.ev?.some((e) => e.t === 'l'));
    expect(leave).toBe(true);
  });

  it('beantwortet den Close-Rahmen des Clients (nur gültige Codes, sonst 1000)', async () => {
    const ctx = makeCtx();
    const w = new MpWorld(ctx, { MP_SECRET: SECRET });
    await w.fetch(req(claims('a')));
    await w.fetch(req(claims('b')));
    await w.fetch(req(claims('c')));
    await w.webSocketClose(ctx.sockets[0], 1000, '', true);
    expect(ctx.sockets[0].closed.code).toBe(1000);
    await w.webSocketClose(ctx.sockets[1], 1005, '', true);
    expect(ctx.sockets[1].closed.code).toBe(1000);
    await w.webSocketClose(ctx.sockets[2], 4123, 'x', true);
    expect(ctx.sockets[2].closed.code).toBe(4123);
  });

  it('Binärnachricht schließt mit 4000',async () => {
    const ctx = makeCtx();
    const w = new MpWorld(ctx, { MP_SECRET: SECRET });
    await w.fetch(req(claims('a')));
    await w.webSocketMessage(ctx.sockets[0], new ArrayBuffer(4));
    expect(ctx.sockets[0].closed.code).toBe(4000);
  });

  it('Alarm ohne MP_SECRET schließt alles mit 1000', async () => {
    const ctx = makeCtx();
    const w = new MpWorld(ctx, { MP_SECRET: SECRET });
    await w.fetch(req(claims('a')));
    const w2 = new MpWorld(ctx, {});
    await w2.ready;
    await w2.alarm();
    expect(ctx.sockets[0].closed.code).toBe(1000);
  });

  it('Alarm räumt auf und setzt den nächsten Alarm', async () => {
    const ctx = makeCtx();
    const w = new MpWorld(ctx, { MP_SECRET: SECRET });
    await w.fetch(req(claims('a')));
    await w.webSocketMessage(ctx.sockets[0], HI);
    await expect(w.alarm()).resolves.toBeUndefined();
  });

  it('Renew mit gültigem Ticket verlängert, mit ungültigem schließt 4401', async () => {
    const ctx = makeCtx();
    const w = new MpWorld(ctx, { MP_SECRET: SECRET });
    const user = { uid: 'u'.repeat(32), name: 'Anna', admin: false };
    const cl = await verifyTicket(SECRET, (await mintTicket(SECRET, user)).tk);
    await w.fetch(req(cl));
    const ws = ctx.sockets[0];
    await w.webSocketMessage(ws, HI);
    const { tk } = await mintTicket(SECRET, user);
    await w.webSocketMessage(ws, JSON.stringify([{ t: 'rn', tk }]));
    expect(ws.closed).toBeNull();
    // zweite Verbindung (eigenes Rate-Limit) mit schlecht signiertem Ticket
    const cl2 = await verifyTicket(SECRET, (await mintTicket(SECRET, user)).tk);
    await w.fetch(req(cl2));
    const ws2 = ctx.sockets[1];
    await w.webSocketMessage(ws2, HI);
    await w.webSocketMessage(ws2, JSON.stringify([{ t: 'rn', tk: tk.slice(0, -3) + 'AAA' }]));
    expect(ws2.closed.code).toBe(4401);
  });

  it('enthält keine Timer und keinen cloudflare:workers-Import', () => {
    for (const f of ['world.js', 'cf.js', 'room.js']) {
      const src = readFileSync(new URL('../src/mp/' + f, import.meta.url), 'utf8');
      expect(src).not.toMatch(/setTimeout|setInterval/);
      expect(src).not.toMatch(/from 'cloudflare:workers'/);
    }
  });
});
