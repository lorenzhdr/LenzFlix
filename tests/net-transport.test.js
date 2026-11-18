// WebSocket-Transport (net/transport.js): Handshake, Sende-Takt/Bucket/2-kB-Rahmen, Backoff, Close-Code-Tabelle, Keepalive,
// Ticket-Erneuerung, verborgener Tab, Still-aus. Fake-WebSocket und Fake-Timer, kein Netzwerk.
import { describe, it, expect, vi } from 'vitest';
import { createTransport, TICK_MS, BUCKET_PER_S } from '../src/js/store3d/net/transport.js';

const CAPS = ['pres', 'chat', 'emote', 'push', 'phys', 'rich', 'wx', 'kino', 'admin', 'look'];
const WL = { t: 'wl', pv: 1, c: 3, k: 'abcdef012345', s: 5000000, ad: 0, cap: CAPS, cf: { pr: 8, ph: 8 }, peers: [] };
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

function harness(o = {}) {
  let t = 1000000;
  let hid = 0;
  const timers = [];
  const sockets = [];
  const log = { states: [], msgs: [] };
  class FakeWS {
    constructor(url, protocols) {
      this.url = url; this.protocols = protocols; this.sent = []; this.closed = null; this.readyState = 0;
      sockets.push(this);
    }
    send(s) {
      if (this.throwOnSend) throw new Error('x');
      this.sent.push({ s, at: t });
      if (s === 'ping' && cfg.autoPong) Promise.resolve().then(() => { if (this.readyState === 1) this.recv('pong'); });
    }
    close(code) { this.closed = code; this.readyState = 3; }
    open() { this.readyState = 1; this.onopen && this.onopen({}); }
    recv(m) { this.onmessage && this.onmessage({ data: typeof m === 'string' ? m : JSON.stringify(m) }); }
    drop(code = 1006) { this.readyState = 3; this.onclose && this.onclose({ code }); }
    frames() { return this.sent.filter((x) => x.s.startsWith('[')).map((x) => ({ at: x.at, arr: JSON.parse(x.s) })); }
    texts() { return this.sent.filter((x) => !x.s.startsWith('[')).map((x) => x.s); }
  }
  const cfg = { autoPong: o.autoPong !== false };
  const env = {
    now: () => t,
    setTimeout: (fn, ms) => { const h = ++hid; timers.push({ h, at: t + Math.max(0, ms), fn }); return h; },
    clearTimeout: (h) => { const i = timers.findIndex((x) => x.h === h); if (i >= 0) timers.splice(i, 1); },
    WebSocket: FakeWS,
    random: o.random || (() => 0.5),
  };
  let n = 0;
  const ticket = vi.fn(async () => (o.ticket ? o.ticket(++n) : { ok: true, tk: `eyJ.sig${++n}`, url: 'wss://charts.example/mp', exp: t + 60000, pv: [1], s: 5000000 }));
  const hello = vi.fn(() => ({ cap: CAPS, f: 3, cv: '1.16.0' }));
  const tr = createTransport({
    ticket, env, hello,
    onMsg: o.onMsg || ((m) => log.msgs.push(m)),
    onState: (s, info) => log.states.push([s, info.why]),
  });
  const h = {
    tr, env, sockets, timers, ticket, hello, log, cfg,
    now: () => t,
    last: () => sockets[sockets.length - 1],
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        await settle();
        const next = timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at || a.h - b.h)[0];
        if (!next) break;
        timers.splice(timers.indexOf(next), 1);
        t = Math.max(t, next.at);
        next.fn();
      }
      t = end;
      await settle();
    },
    async live(wl = WL) {
      tr.start();
      await h.advance(0);
      h.last().open();
      h.last().recv(wl);
      await h.advance(0);
      return h.last();
    },
  };
  return h;
}

describe('Handshake', () => {
  it('Ticket -> WebSocket(url, [lfx-mp.1, t.<tk>]) -> hi -> wl -> live', async () => {
    const h = harness();
    expect(h.tr.state()).toBe('off');
    expect(h.tr.start()).toBe(true);
    expect(h.tr.state()).toBe('ticket');
    await h.advance(0);
    expect(h.sockets).toHaveLength(1);
    const ws = h.last();
    expect(ws.url).toBe('wss://charts.example/mp');
    expect(ws.protocols).toEqual(['lfx-mp.1', 't.eyJ.sig1']);
    expect(ws.url).not.toContain('eyJ'); // Ticket nie in der URL
    expect(h.tr.state()).toBe('open');
    ws.open();
    expect(h.tr.state()).toBe('hello');
    const hi = ws.frames()[0].arr;
    expect(hi).toEqual([{ t: 'hi', pv: 1, cap: CAPS, f: 3, cv: '1.16.0' }]);
    ws.recv({ ...WL, cf: { pr: 4, ph: 5 } });
    expect(h.tr.state()).toBe('live');
    expect(h.log.msgs[0].t).toBe('wl');
    expect(h.tr.me()).toEqual({ c: 3, k: 'abcdef012345', admin: false });
    expect(h.tr.cf()).toEqual({ pr: 4, ph: 5 });
    expect(h.tr.has('chat')).toBe(true);
  });
  it('5x ck im Abstand von 1 s, dann alle 5 min; Echo liefert serverNow', async () => {
    const h = harness();
    const ws = await h.live();
    const cks = () => ws.frames().filter((f) => f.arr[0].t === 'ck');
    expect(cks()).toHaveLength(1);
    await h.advance(4000);
    expect(cks()).toHaveLength(5);
    await h.advance(200000);
    expect(cks()).toHaveLength(5);
    await h.advance(100000);
    expect(cks()).toHaveLength(6);
    const a = cks()[5].arr[0].a;
    ws.recv({ t: 'ck', a, s: 7000000 });
    expect(h.tr.serverNow()).toBeGreaterThan(6999000);
  });
  it('wl ohne pres schaltet aus', async () => {
    const h = harness();
    await h.live({ ...WL, cap: ['chat'] });
    expect(h.tr.state()).toBe('dead');
    expect(h.tr.info().why).toBe('cap');
  });
  it('kein wl binnen 12 s: Verbindung verwerfen und neu versuchen', async () => {
    const h = harness();
    h.tr.start();
    await h.advance(0);
    h.last().open();
    await h.advance(12000);
    expect(h.sockets[0].closed).toBe(1000);
    expect(h.sockets).toHaveLength(2); // erster Fehlversuch: sofort neues Ticket und neue Verbindung
  });
});

describe('Sende-Takt', () => {
  const pmsg = (x) => ({ t: 'p', q: [x, 0, 0, 0, 0, 1, 0] });

  it('send: false, solange nicht live; ungültig false; fehlende Fähigkeit false', async () => {
    const h = harness();
    expect(h.tr.send(pmsg(1))).toBe(false);
    await h.live({ ...WL, cap: ['pres'] });
    expect(h.tr.send(pmsg(1))).toBe(true);
    expect(h.tr.send({ t: 'p', q: [NaN, 0, 0, 0, 0, 0, 0] })).toBe(false);
    expect(h.tr.send({ t: 'm', x: 'hi' })).toBe(false); // keine chat-Fähigkeit
    expect(h.tr.send({ t: 'rc' })).toBe(false);
    expect(h.tr.send({ t: 'unbekannt' })).toBe(false);
  });
  it('höchstens 8 Frames/s bei Dauerlast, letzte Pose gewinnt (Zusammenlegen)', async () => {
    const h = harness();
    const ws = await h.live();
    const base = ws.frames().length;
    for (let i = 0; i < 625; i++) { h.tr.send(pmsg(i)); await h.advance(16); } // 10 s
    const fr = ws.frames().slice(base).filter((f) => f.arr.some((m) => m.t === 'p'));
    expect(fr.length).toBeLessThanOrEqual(81);
    expect(fr.length).toBeGreaterThanOrEqual(72);
    for (const f of fr) expect(f.arr.filter((m) => m.t === 'p')).toHaveLength(1);
    for (let i = 1; i < fr.length; i++) expect(fr[i].at - fr[i - 1].at).toBeGreaterThanOrEqual(TICK_MS);
  });
  it('mehrere Nachrichten im selben Tick gehen als EIN Frame (JSON-Array)', async () => {
    const h = harness();
    const ws = await h.live();
    await h.advance(1000);
    const base = ws.frames().length;
    h.tr.send(pmsg(1));
    h.tr.send({ t: 'hd', i: null });
    h.tr.send({ t: 'f', f: 1 });
    await h.advance(0);
    const fr = ws.frames().slice(base);
    expect(fr).toHaveLength(1);
    expect(fr[0].arr.map((m) => m.t)).toEqual(['p', 'hd', 'f']);
  });
  it('kein Timer bei leerer Warteschlange; kein Heartbeat', async () => {
    const h = harness();
    const ws = await h.live();
    await h.advance(10000);
    const base = ws.frames().length;
    await h.advance(60000);
    expect(ws.frames().length).toBe(base); // nur Ping-Text, keine Frames
    expect(ws.texts().length).toBeGreaterThan(0);
    expect(h.timers.every((x) => x.at - h.now() > 1000)).toBe(true); // kein Sende-Timer wartet
  });
  it('Bucket: nie mehr als 10 Frames in einer Sekunde, auch mit dringenden Nachrichten', async () => {
    const h = harness();
    const ws = await h.live();
    await h.advance(5000);
    const base = ws.frames().length;
    for (let i = 0; i < 400; i++) {
      h.tr.send(pmsg(i));
      if (i % 2 === 0) h.tr.send({ t: 'e', e: 1 + (i % 8) });
      h.tr.send({ t: 'm', x: `m${i}` }, { urgent: true });
      await h.advance(10);
    }
    await h.advance(5000);
    const fr = ws.frames().slice(base);
    expect(fr.length).toBeGreaterThan(20);
    for (const f of fr) {
      const inWin = fr.filter((g) => g.at >= f.at && g.at < f.at + 1000).length;
      expect(inWin).toBeLessThanOrEqual(BUCKET_PER_S);
    }
    // Reste geht später raus
    const chats = fr.flatMap((f) => f.arr.filter((m) => m.t === 'm'));
    expect(chats.length).toBeGreaterThan(0);
  });
  it('dringende Nachricht (Chat) löst höchstens einen vorgezogenen Takt aus', async () => {
    const h = harness();
    const ws = await h.live();
    await h.advance(1000);
    h.tr.send(pmsg(1));
    await h.advance(0); // gesendet
    const base = ws.frames().length;
    h.tr.send({ t: 'm', x: 'a' }); // 0 ms nach dem Frame: vorgezogen
    await h.advance(0);
    expect(ws.frames().length).toBe(base + 1);
    h.tr.send({ t: 'm', x: 'b' }); // zweiter im selben Takt: wartet
    await h.advance(0);
    expect(ws.frames().length).toBe(base + 1);
    await h.advance(TICK_MS);
    expect(ws.frames().length).toBe(base + 2);
  });
  it('2-kB-Rahmen: nichts über 2000 Zeichen, Rest im nächsten Takt, nichts geht verloren', async () => {
    const h = harness();
    const ws = await h.live();
    await h.advance(1000);
    const base = ws.frames().length;
    const msgs = Array.from({ length: 12 }, (_, i) => ({ t: 'm', x: `${i}`.padEnd(190, 'x') }));
    for (const m of msgs) h.tr.send(m);
    await h.advance(2000);
    const fr = ws.frames().slice(base);
    expect(fr.length).toBeGreaterThan(1);
    for (const x of ws.sent.slice(-fr.length)) expect(x.s.length).toBeLessThanOrEqual(2000);
    const got = fr.flatMap((f) => f.arr.filter((m) => m.t === 'm').map((m) => m.x));
    expect(got).toEqual(msgs.map((m) => m.x)); // Reihenfolge erhalten
  });
  it('ps: Einträge niedriger Priorität rutschen in den nächsten Takt, wenn der Rahmen voll ist', async () => {
    const h = harness();
    const ws = await h.live();
    await h.advance(1000);
    const base = ws.frames().length;
    for (let i = 0; i < 9; i++) h.tr.send({ t: 'm', x: `${i}`.padEnd(200, 'y') });
    const e = (i) => [`o${i}`, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    h.tr.send({ t: 'ps', l: [e(1), e(2), e(3), e(4), e(5), e(6), e(7), e(8)] });
    await h.advance(2000);
    const fr = ws.frames().slice(base);
    const ids = fr.flatMap((f) => f.arr.filter((m) => m.t === 'ps').flatMap((m) => m.l.map((x) => x[0])));
    expect(ids.sort()).toEqual(['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8']);
    for (const x of ws.sent.slice(-fr.length)) expect(x.s.length).toBeLessThanOrEqual(2000);
  });
  it('ps-Einträge gleicher ID werden zusammengelegt (neuer gewinnt)', async () => {
    const h = harness();
    const ws = await h.live();
    await h.advance(1000);
    h.tr.send(pmsg(1));
    await h.advance(0);
    const base = ws.frames().length;
    const e = (i, x) => [i, 1, x, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    h.tr.send({ t: 'ps', l: [e('a', 1), e('b', 2)] });
    h.tr.send({ t: 'ps', l: [e('a', 9)] });
    await h.advance(TICK_MS);
    const ps = ws.frames().slice(base).flatMap((f) => f.arr.filter((m) => m.t === 'ps'));
    expect(ps).toHaveLength(1);
    expect(ps[0].l.map((x) => [x[0], x[2]])).toEqual([['a', 9], ['b', 2]]);
  });
});

describe('Backoff', () => {
  it('erster Fehlversuch vor wl: genau einmal sofort neues Ticket; danach 1, 2, 4, 8 s; dann 6/10-min-Grenze = 30 min Pause', async () => {
    const h = harness();
    h.tr.start();
    await h.advance(0);
    h.last().open();
    h.last().drop();
    expect(h.ticket).toHaveBeenCalledTimes(2); // sofort neues Ticket (ohne Backoff)
    await h.advance(0);
    expect(h.sockets).toHaveLength(2);
    h.last().open(); h.last().drop();
    const delays = [];
    for (let i = 0; i < 4; i++) {
      const n0 = h.sockets.length;
      const t0 = h.now();
      expect(h.tr.state()).toBe('backoff');
      while (h.sockets.length === n0) await h.advance(100);
      delays.push(h.now() - t0);
      h.last().open(); h.last().drop();
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000]);
    expect(h.sockets).toHaveLength(6); // sechs Versuche
    expect(h.tr.state()).toBe('backoff');
    expect(h.tr.info().until - h.now()).toBe(1800000);
    expect(h.tr.info().why).toBe('limit');
    await h.advance(1799000);
    expect(h.sockets).toHaveLength(6);
    await h.advance(1000);
    expect(h.sockets).toHaveLength(7);
    // danach geht die Tabelle weiter: 16, 30, 60 s (je +-20 % Jitter)
    const more = [];
    for (let i = 0; i < 3; i++) {
      h.last().open(); h.last().drop();
      const n0 = h.sockets.length;
      const t0 = h.now();
      while (h.sockets.length === n0) await h.advance(100);
      more.push(h.now() - t0);
    }
    expect(more).toEqual([16000, 30000, 60000]);
  });
  it('Jitter +-20 %', async () => {
    for (const [r, f] of [[0, 0.8], [1, 1.2]]) {
      const h = harness({ random: () => r });
      await h.live();
      h.last().drop(1006);
      expect(h.tr.info().until - h.now()).toBe(Math.round(1000 * f));
    }
  });
  it('60 s stabile Verbindung setzt den Backoff zurück', async () => {
    const h = harness();
    h.tr.start();
    await h.advance(0);
    h.last().open(); h.last().recv(WL);
    h.last().drop(); // live -> Backoff 1 s
    expect(h.tr.info().until - h.now()).toBe(1000);
    await h.advance(1000);
    h.last().open(); h.last().recv(WL);
    h.last().drop();
    expect(h.tr.info().until - h.now()).toBe(2000);
    await h.advance(2000);
    h.last().open(); h.last().recv(WL);
    await h.advance(61000);
    h.last().drop();
    expect(h.tr.info().until - h.now()).toBe(1000);
  });
  it('stabile Verbindungen zählen nicht zur 6/10-min-Grenze (z. B. oft entsperrtes Handy)', async () => {
    const h = harness();
    h.tr.start();
    for (let i = 0; i < 8; i++) {
      await h.advance(0);
      h.last().open(); h.last().recv(WL);
      await h.advance(61000); // je über 60 s stabil
      h.last().drop();
      expect(h.tr.info().why).not.toBe('limit');
      await h.advance(1000);
    }
    expect(h.sockets).toHaveLength(9);
  });
  it('höchstens 6 Versuche je 10 min', async () => {
    const h = harness();
    h.tr.start();
    for (let i = 0; i < 40; i++) {
      await h.advance(0);
      const ws = h.last();
      if (ws && ws.readyState === 0) { ws.open(); ws.drop(); }
      await h.advance(2000);
    }
    expect(h.sockets.length).toBeLessThanOrEqual(6);
  });
});

describe('Close-Code-Tabelle (nach wl)', () => {
  const wlOpen = async () => { const h = harness(); const ws = await h.live(); return { h, ws }; };

  for (const code of [1000, 1001, 1006, 1011]) {
    it(`${code} -> Backoff und Neuverbinden`, async () => {
      const { h, ws } = await wlOpen();
      ws.drop(code);
      expect(h.tr.state()).toBe('backoff');
      await h.advance(1000);
      expect(h.sockets).toHaveLength(2);
    });
  }
  it('4000/4408: Backoff, nach dem 3. Mal aus für die Seitensitzung', async () => {
    const { h, ws } = await wlOpen();
    ws.drop(4000);
    expect(h.tr.state()).toBe('backoff');
    await h.advance(1000);
    h.last().open(); h.last().recv(WL);
    h.last().drop(4408);
    expect(h.tr.state()).toBe('backoff');
    await h.advance(2000);
    h.last().open(); h.last().recv(WL);
    h.last().drop(4000);
    expect(h.tr.state()).toBe('dead');
    expect(h.tr.info().why).toBe('bad');
    expect(h.tr.start()).toBe(false);
  });
  it('4001 -> aus mit Hinweis „Update nötig“', async () => {
    const { h, ws } = await wlOpen();
    ws.recv({ t: 'bye', c: 'pv' });
    ws.drop(4001);
    expect(h.tr.state()).toBe('dead');
    expect(h.tr.info().why).toBe('pv');
    expect(h.tr.info().hint).toBe('Update nötig');
  });
  it('4401 -> neues Ticket, 1x sofort, dann Backoff', async () => {
    const { h, ws } = await wlOpen();
    ws.recv({ t: 'bye', c: 'auth' });
    ws.drop(4401);
    await h.advance(0);
    expect(h.sockets).toHaveLength(2);
    expect(h.ticket).toHaveBeenCalledTimes(2);
    h.last().open();
    h.last().recv({ t: 'bye', c: 'auth' });
    h.last().drop(4401); // diesmal ohne wl dazwischen
    expect(h.tr.state()).toBe('backoff');
    await h.advance(1000);
    expect(h.sockets).toHaveLength(3);
  });
  it('4403 mit bye.u: keine Verbindung bis u', async () => {
    const { h, ws } = await wlOpen();
    const u = h.tr.serverNow() + 600000;
    ws.recv({ t: 'bye', c: 'ban', u });
    ws.drop(4403);
    expect(h.tr.state()).toBe('banned');
    await h.advance(599000);
    expect(h.sockets).toHaveLength(1);
    await h.advance(2000);
    expect(h.sockets).toHaveLength(2);
  });
  it('4409 -> aus', async () => {
    const { h, ws } = await wlOpen();
    ws.drop(4409);
    expect(h.tr.state()).toBe('dead');
    expect(h.tr.info().why).toBe('dup');
  });
  it('4429 -> 60 s warten', async () => {
    const { h, ws } = await wlOpen();
    ws.drop(4429);
    expect(h.tr.info().until - h.now()).toBe(60000);
    await h.advance(59000);
    expect(h.sockets).toHaveLength(1);
    await h.advance(1000);
    expect(h.sockets).toHaveLength(2);
  });
  it('4503 full -> 60 s, quota -> 30 min', async () => {
    const a = await wlOpen();
    a.ws.recv({ t: 'bye', c: 'full' });
    a.ws.drop(4503);
    expect(a.h.tr.info().until - a.h.now()).toBe(60000);
    const b = await wlOpen();
    b.ws.recv({ t: 'bye', c: 'quota' });
    b.ws.drop(4503);
    expect(b.h.tr.info().until - b.h.now()).toBe(1800000);
    expect(b.h.tr.info().why).toBe('quota');
  });
});

describe('Ticket-Fehler (why)', () => {
  for (const why of ['nourl', 'gone', 'off', 'blocked', 'bad', 'auth', 'user']) {
    it(`${why} -> aus für die Seitensitzung, nie ein WebSocket`, async () => {
      const h = harness({ ticket: () => ({ ok: false, why }) });
      h.tr.start();
      await h.advance(0);
      expect(h.tr.state()).toBe('dead');
      expect(h.tr.info().why).toBe(why);
      expect(h.sockets).toHaveLength(0);
      expect(h.timers).toHaveLength(0);
      await h.advance(3600000);
      expect(h.sockets).toHaveLength(0);
      expect(h.tr.start()).toBe(false);
      expect(h.tr.send({ t: 'p', q: [0, 0, 0, 0, 0, 0, 0] })).toBe(false);
    });
  }
  for (const why of ['rate', 'net']) {
    it(`${why} -> Backoff und erneut`, async () => {
      let n = 0;
      const h = harness({ ticket: () => (++n < 3 ? { ok: false, why } : { ok: true, tk: 'a.b', url: 'wss://x/mp', pv: [1] }) });
      h.tr.start();
      await h.advance(0);
      expect(h.tr.state()).toBe('backoff');
      await h.advance(1000);
      expect(h.tr.state()).toBe('backoff');
      await h.advance(2000);
      expect(h.sockets).toHaveLength(1);
    });
  }
  it('abgelehnte oder geworfene ticket()-Aufrufe wirken wie net (Backoff)', async () => {
    const h = harness({ ticket: () => { throw new Error('x'); } });
    h.tr.start();
    await h.advance(0);
    expect(h.tr.state()).toBe('backoff');
  });
  it('Antwort ohne tk oder ohne passendes pv schaltet aus', async () => {
    const a = harness({ ticket: () => ({ ok: true, url: 'wss://x/mp', pv: [1] }) });
    a.tr.start(); await a.advance(0);
    expect(a.tr.info().why).toBe('bad');
    const b = harness({ ticket: () => ({ ok: true, tk: 'a.b', url: 'wss://x/mp', pv: [2] }) });
    b.tr.start(); await b.advance(0);
    expect(b.tr.info().why).toBe('pv');
  });
  it('new WebSocket wirft -> wie Verbindungsfehler (Backoff, kein Absturz)', async () => {
    const h = harness();
    h.env.WebSocket = class { constructor() { throw new Error('csp'); } };
    h.tr.start();
    await h.advance(0);
    expect(['ticket', 'backoff']).toContain(h.tr.state());
  });
});

describe('Keepalive', () => {
  it('Ping-Text alle 3 s (Cloudflare kappt nach 5 s Funkstille); mit Pong bleibt die Verbindung', async () => {
    const h = harness({ autoPong: false });
    const ws = await h.live();
    for (let i = 0; i < 20; i++) {
      await h.advance(3000);
      ws.recv('pong');
    }
    expect(ws.texts().filter((x) => x === 'ping')).toHaveLength(20);
    expect(h.tr.state()).toBe('live');
    expect(h.sockets).toHaveLength(1);
  });
  it('höchstens 4,5 s zwischen zwei Pings (Abstand < 5 s Kappgrenze)', async () => {
    const h = harness();
    const ws = await h.live();
    await h.advance(60000);
    const at = ws.sent.filter((x) => x.s === 'ping').map((x) => x.at);
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeLessThanOrEqual(4500);
    expect(at.length).toBeGreaterThanOrEqual(19);
  });
  it('20 s ohne Pong -> neu verbinden', async () => {
    const h = harness({ autoPong: false });
    const ws = await h.live();
    await h.advance(18000);
    expect(h.tr.state()).toBe('live'); // kurzes Funkloch übersteht die Leitung
    await h.advance(6000); // ältester Ping > 20 s unbeantwortet
    expect(h.tr.state()).toBe('backoff');
    expect(ws.closed).toBe(1000);
    await h.advance(1000);
    expect(h.sockets).toHaveLength(2);
  });
  it('ein Pong dazwischen setzt die Frist zurück', async () => {
    const h = harness({ autoPong: false });
    const ws = await h.live();
    await h.advance(15000);
    ws.recv('pong');
    await h.advance(15000);
    expect(h.tr.state()).toBe('live');
  });
  it('Gerät geschlafen (Timer 5 min verspätet, kein Pong): sofort neu verbinden', async () => {
    const h = harness({ autoPong: false });
    const ws = await h.live();
    await h.advance(3000); // ping 1 unterwegs
    for (const x of h.timers) x.at += 300000; // Schlaf: alle Timer 5 min später
    await h.advance(304000); // nächster Ping-Tick (fällig bei 6 s) läuft erst jetzt
    expect(ws.closed).toBe(1000);
    expect(h.tr.state()).not.toBe('live');
  });
});

describe('Ticket-Erneuerung', () => {
  it('nach 10 min neues Ticket und rn im Takt', async () => {
    const h = harness();
    const ws = await h.live();
    expect(h.ticket).toHaveBeenCalledTimes(1);
    await h.advance(601000);
    expect(h.ticket).toHaveBeenCalledTimes(2);
    await h.advance(500);
    const rn = ws.frames().flatMap((f) => f.arr).filter((m) => m.t === 'rn');
    expect(rn).toEqual([{ t: 'rn', tk: 'eyJ.sig2' }]);
  });
});

describe('Verborgener Tab (W9)', () => {
  const pmsg = { t: 'p', q: [1, 0, 0, 0, 0, 1, 0] };
  it('verborgen: keine Posen; nach 60 s Close 1000; sichtbar -> neu verbinden', async () => {
    const h = harness();
    const ws = await h.live();
    h.tr.setHidden(true);
    expect(h.tr.send(pmsg)).toBe(false);
    expect(h.tr.send({ t: 'e', e: 1 })).toBe(true);
    await h.advance(59000);
    expect(ws.closed).toBe(null);
    await h.advance(1500);
    expect(ws.closed).toBe(1000);
    expect(h.tr.state()).toBe('idle');
    await h.advance(600000);
    expect(h.sockets).toHaveLength(1); // kein Neuverbinden im Verborgenen
    h.tr.setHidden(false);
    await h.advance(0);
    expect(h.sockets).toHaveLength(2);
  });
  it('vor Ablauf wieder sichtbar: Verbindung bleibt', async () => {
    const h = harness();
    const ws = await h.live();
    h.tr.setHidden(true);
    await h.advance(30000);
    h.tr.setHidden(false);
    await h.advance(120000);
    expect(ws.closed).toBe(null);
    expect(h.tr.state()).toBe('live');
  });
  it('Kino-Ausnahme: bleibt offen, solange eine Kino-Sitzung aktiv ist', async () => {
    const h = harness();
    const ws = await h.live();
    h.tr.setKino(true);
    h.tr.setHidden(true);
    await h.advance(300000);
    expect(ws.closed).toBe(null);
    expect(h.tr.state()).toBe('live');
    h.tr.setKino(false); // Sitzung endet im Verborgenen: 60-s-Uhr startet
    await h.advance(61000);
    expect(ws.closed).toBe(1000);
  });
});

describe('Aus, Neustart, Fehlerhaft', () => {
  it('stop(): schließt mit 1000, keine Timer, kein Neuverbinden; start() danach möglich', async () => {
    const h = harness();
    const ws = await h.live();
    h.tr.stop();
    expect(ws.closed).toBe(1000);
    expect(h.tr.state()).toBe('off');
    expect(h.timers).toHaveLength(0);
    ws.drop(1006); // spätes Ereignis eines alten Sockets: ignoriert
    await h.advance(120000);
    expect(h.sockets).toHaveLength(1);
    expect(h.tr.send({ t: 'p', q: [0, 0, 0, 0, 0, 0, 0] })).toBe(false);
    expect(h.tr.start()).toBe(true);
    await h.advance(0);
    expect(h.sockets).toHaveLength(2);
  });
  it('stop() während des Ticketholens: später eintreffendes Ticket öffnet nichts', async () => {
    let release;
    const h = harness({ ticket: () => new Promise((r) => { release = () => r({ ok: true, tk: 'a.b', url: 'wss://x/mp', pv: [1] }); }) });
    h.tr.start();
    await h.advance(0);
    h.tr.stop();
    release();
    await h.advance(0);
    expect(h.sockets).toHaveLength(0);
  });
  it('Handler-Fehler: mehr als 5 in 60 s schalten aus; keine Timer bleiben', async () => {
    let n = 0;
    const h = harness({ onMsg: (m) => { if (m.t === 'b') { n++; throw new Error('x'); } } });
    const ws = await h.live();
    for (let i = 0; i < 6; i++) ws.recv({ t: 'b', s: 1, p: [], ev: [] });
    expect(n).toBe(6);
    expect(h.tr.state()).toBe('dead');
    expect(h.tr.info().why).toBe('err');
    expect(h.timers).toHaveLength(0);
    expect(ws.closed).toBe(1000);
  });
  it('kaputte Frames und Binärdaten werden ignoriert', async () => {
    const h = harness();
    const ws = await h.live();
    ws.recv('kein json');
    ws.onmessage({ data: new ArrayBuffer(4) });
    ws.recv({ t: 5 });
    ws.recv(['x']);
    expect(h.tr.state()).toBe('live');
  });
  it('cf-Ereignis in b ändert die Raten (gedeckelt auf 1..8)', async () => {
    const h = harness();
    const ws = await h.live();
    ws.recv({ t: 'b', s: 1, p: [], ev: [{ t: 'cf', pr: 2, ph: 99 }] });
    expect(h.tr.cf()).toEqual({ pr: 2, ph: 8 });
  });
  it('send-Fehler am Socket führt zum Backoff statt zum Absturz', async () => {
    const h = harness();
    const ws = await h.live();
    ws.throwOnSend = true;
    h.tr.send({ t: 'e', e: 1 });
    await h.advance(TICK_MS);
    expect(h.tr.state()).toBe('backoff');
  });
  it('reset() nach dead räumt auf (Nutzerwechsel)', async () => {
    const h = harness({ ticket: () => ({ ok: false, why: 'auth' }) });
    h.tr.start();
    await h.advance(0);
    expect(h.tr.state()).toBe('dead');
    h.tr.reset();
    expect(h.tr.state()).toBe('off');
    expect(h.tr.start()).toBe(true);
  });
});
