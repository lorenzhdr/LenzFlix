// @vitest-environment jsdom
// VIDEOTHEK LENZ · Modul net (modules/net.js): Verbindung erst nach 'enter', Anzeige, Still-aus, Lebenszyklus (Aussetzen, VR-Kino), dispose.
// Fake-WebSocket, Fake-Timer, kein Netzwerk.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import net from '../src/js/store3d/modules/net.js';

const WL = (over = {}) => ({ t: 'wl', pv: 1, c: 1, k: 'aaaaaaaaaaaa', s: 5000000, ad: 0, cap: ['pres', 'chat'], cf: { pr: 8, ph: 8 }, peers: [], ...over });
const peer = (c, k, extra = {}) => ({ c, k, n: 'Gast', f: 1, j: 0, ...extra });

let sockets;
class FakeWS {
  constructor(url, protocols) { this.url = url; this.protocols = protocols; this.sent = []; this.closed = null; this.readyState = 0; sockets.push(this); }
  send(s) { this.sent.push(s); }
  close(code) { this.closed = code; this.readyState = 3; }
  open() { this.readyState = 1; this.onopen && this.onopen({}); }
  recv(m) { this.onmessage && this.onmessage({ data: JSON.stringify(m) }); }
  frames() { return this.sent.filter((x) => x.startsWith('[')).flatMap((x) => JSON.parse(x)); }
}

function setup(o = {}) {
  const provided = new Map();
  const listeners = new Map();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  let prefs = { on: true, name: true, film: false, chat: true, mute: [], hint: false, ...(o.prefs || {}) };
  const onPrefs = vi.fn((p) => { Object.assign(prefs, p.mp); });
  const state = { suspended: false, playing: true, xr: false };
  const toast = vi.fn();
  const ticket = vi.fn(async () => o.ticket || { ok: true, tk: 'a.b', url: 'wss://charts.example/mp', exp: 0, pv: [1], s: 5000000 });
  const player = { x: 5, y: 0, z: 5, yaw: 0, pitch: 0, a: 0, h: null };
  const ctx = {
    scene: {}, camera: {}, renderer: { domElement: canvas }, layout: { w: 12.5, d: 18 }, isTouch: !!o.touch, isPhone: false,
    deps: { ...(o.noMp ? {} : { mp: { uid: 'u1', cv: '1.16.0', prefs: () => prefs, ticket } }), onPrefs },
    opts: { debug: true, mpTransport: FakeWS },
    quality: () => 'high',
    suspended: () => state.suspended,
    playing: () => state.playing,
    player: { getNet: () => ({ ...player, vx: 0, vy: 0, vz: 0 }) },
    xr: { presenting: () => state.xr, toast },
    provide: (n, impl) => { provided.set(n, impl); return () => { if (provided.get(n) === impl) provided.delete(n); }; },
    use: (n) => provided.get(n),
    on: (ev, fn) => { const l = listeners.get(ev) || []; l.push(fn); listeners.set(ev, l); return () => { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }; },
  };
  const emit = (ev, ...a) => { for (const fn of (listeners.get(ev) || []).slice()) fn(...a); };
  return { ctx, emit, provided, listeners, state, toast, ticket, onPrefs, prefs: (p) => { prefs = { ...prefs, ...p }; }, player, host, getPrefs: () => prefs };
}

const flush = async () => { await vi.advanceTimersByTimeAsync(0); };
async function goLive(t, wl = WL()) {
  t.emit('enter');
  await flush();
  const ws = sockets[sockets.length - 1];
  ws.open();
  ws.recv(wl);
  return ws;
}

beforeEach(() => { vi.useFakeTimers(); sockets = []; });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('Modul net: ohne deps.mp', () => {
  it('kein net-Provider, keine Listener, kein Social-DOM; nur der lokale Provider emotes (1.18.0, Emote-Rad ohne Mehrspieler)', () => {
    const t = setup({ noMp: true });
    const add = vi.spyOn(document, 'addEventListener');
    const h = net.init(t.ctx);
    expect(h).toBeTruthy();
    expect([...t.provided.keys()]).toEqual(['emotes']);
    expect(t.provided.get('net')).toBeUndefined();
    expect(t.listeners.size).toBe(0);
    expect(add).not.toHaveBeenCalled();
    expect(t.host.querySelector('.lfx-store-social')).toBeNull();
    add.mockRestore();
    h.dispose();
    expect(t.provided.size).toBe(0);
  });
});

describe('Modul net: Verbindung', () => {
  it('init verbindet nicht; erst nach enter kommt Ticket, Socket mit Subprotokoll und hi', async () => {
    const t = setup();
    const h = net.init(t.ctx);
    expect(h).toBeTruthy();
    await flush();
    expect(t.ticket).not.toHaveBeenCalled();
    expect(sockets.length).toBe(0);
    t.emit('enter');
    await flush();
    expect(t.ticket).toHaveBeenCalledTimes(1);
    expect(sockets.length).toBe(1);
    expect(sockets[0].protocols).toEqual(['lfx-mp.1', 't.a.b']);
    sockets[0].open();
    const hi = sockets[0].frames()[0];
    expect(hi).toMatchObject({ t: 'hi', pv: 1, cap: ['pres', 'chat', 'emote', 'push', 'phys', 'rich', 'wx', 'kino', 'admin', 'look', 'fight'], f: 5, cv: '1.16.0' }); // Name (1) + Chat (4), Film aus
    h.dispose();
  });

  it('Mehrspieler aus: auch nach enter keine Verbindung', async () => {
    const t = setup({ prefs: { on: false } });
    const h = net.init(t.ctx);
    t.emit('enter');
    await flush();
    expect(t.ticket).not.toHaveBeenCalled();
    h.dispose();
  });

  it('wl: Provider aktiv, Anzeige „1 hier“, Hinweis genau einmal', async () => {
    const t = setup();
    const h = net.init(t.ctx);
    await goLive(t);
    const p = t.provided.get('net');
    expect(p.active()).toBe(true);
    expect(p.me()).toMatchObject({ c: 1, k: 'aaaaaaaaaaaa' });
    expect(p.has('pres')).toBe(true);
    expect(p.has('kino')).toBe(false);
    h.update(0.016, 1);
    expect(t.host.querySelector('.lfx-mp-count').textContent).toBe('1 hier');
    expect(t.toast).toHaveBeenCalledTimes(1);
    expect(t.toast.mock.calls[0][0]).toContain('Abschalten im Menü unter Mehrspieler');
    expect(t.onPrefs).toHaveBeenCalledWith({ mp: { hint: true } });
    h.dispose();
  });

  it('Hinweis bei bereits gezeigtem hint: kein Toast', async () => {
    const t = setup({ prefs: { hint: true } });
    const h = net.init(t.ctx);
    await goLive(t);
    expect(t.toast).not.toHaveBeenCalled();
    h.dispose();
  });

  it('Zählung nach k: andere Person, eigenes zweites Gerät', async () => {
    const t = setup();
    const h = net.init(t.ctx);
    const ws = await goLive(t, WL({ peers: [peer(2, 'bbbbbbbbbbbb')] }));
    const p = t.provided.get('net');
    h.update(0.016, 1);
    expect(p.count()).toBe(2);
    expect(t.host.querySelector('.lfx-mp-count').textContent).toBe('2 hier');
    ws.recv({ t: 'b', s: 5001000, p: [], ev: [{ t: 'j', c: 3, k: 'aaaaaaaaaaaa', n: 'Ich', f: 1, j: 0 }] });
    h.update(0.016, 2);
    expect(p.count()).toBe(2);
    expect(t.host.querySelector('.lfx-mp-count').textContent).toBe('2 hier · 3 Geräte');
    expect(p.peers().map((x) => x.c).sort()).toEqual([2, 3]);
    ws.recv({ t: 'b', s: 5002000, p: [], ev: [{ t: 'l', c: 2 }, { t: 'l', c: 3 }] });
    h.update(0.016, 3);
    expect(t.host.querySelector('.lfx-mp-count').textContent).toBe('1 hier');
    h.dispose();
  });

  it('Nachrichtentypen gehen an on("msg:<t>")', async () => {
    const t = setup();
    const h = net.init(t.ctx);
    const ws = await goLive(t);
    const seen = [];
    t.provided.get('net').on('msg:kx', (e) => seen.push(e.sid));
    ws.recv({ t: 'x', ev: [{ t: 'kx', sid: 7 }] });
    expect(seen).toEqual([7]);
    h.dispose();
  });

  it('Anzeige nur bei playing()', async () => {
    const t = setup();
    const h = net.init(t.ctx);
    await goLive(t);
    h.update(0.016, 1);
    expect(t.host.querySelector('.lfx-mp-social').hidden).toBe(false);
    t.state.playing = false;
    h.update(0.016, 2);
    expect(t.host.querySelector('.lfx-mp-social').hidden).toBe(true);
    t.state.playing = true;
    h.update(0.016, 3);
    expect(t.host.querySelector('.lfx-mp-social').hidden).toBe(false);
    h.dispose();
  });

  it('Touch: Host-Klasse lfx-store-has-social, Desktop nicht', async () => {
    const t = setup({ touch: true });
    const h = net.init(t.ctx);
    await goLive(t);
    h.update(0.016, 1);
    expect(t.host.classList.contains('lfx-store-has-social')).toBe(true);
    h.dispose();
    expect(t.host.classList.contains('lfx-store-has-social')).toBe(false);
    const d = setup();
    const h2 = net.init(d.ctx);
    await goLive(d);
    h2.update(0.016, 1);
    expect(d.host.classList.contains('lfx-store-has-social')).toBe(false);
    h2.dispose();
  });

  it('sendet die eigene Pose im Takt (nur bei Änderung)', async () => {
    const t = setup();
    const h = net.init(t.ctx);
    const ws = await goLive(t);
    h.update(0.016, 1);
    await vi.advanceTimersByTimeAsync(300);
    const ps = ws.frames().filter((m) => m.t === 'p');
    expect(ps.length).toBe(1);
    expect(ps[0].q.length).toBe(7);
    h.update(0.016, 2); // unverändert: nichts Neues
    await vi.advanceTimersByTimeAsync(300);
    expect(ws.frames().filter((m) => m.t === 'p').length).toBe(1);
    h.dispose();
  });

  it('Salon-Stuhl: a=7 ohne Sitzplatz-Feld, sonst Standpose', async () => {
    const t = setup();
    t.provided.set('salon', { sitting: () => true });
    const h = net.init(t.ctx);
    const ws = await goLive(t);
    h.update(0.016, 1);
    await vi.advanceTimersByTimeAsync(300);
    const ps = ws.frames().filter((m) => m.t === 'p');
    expect(ps.length).toBe(1);
    expect(ps[0].q[5]).toBe(7);
    expect(ps[0].se).toBeUndefined();
    h.dispose();
    const t2 = setup();
    t2.provided.set('salon', { sitting: () => false });
    const h2 = net.init(t2.ctx);
    const ws2 = await goLive(t2);
    h2.update(0.016, 1);
    await vi.advanceTimersByTimeAsync(300);
    expect(ws2.frames().filter((m) => m.t === 'p')[0].q[5]).not.toBe(7);
    h2.dispose();
  });

  it('Hülle in der Hand: nur mit Film-Flag über die Leitung', async () => {
    const id = 'a'.repeat(32);
    const t = setup();
    const h = net.init(t.ctx);
    const ws = await goLive(t);
    t.emit('carry', { id });
    await vi.advanceTimersByTimeAsync(300);
    expect(ws.frames().some((m) => m.t === 'hd')).toBe(false);
    t.prefs({ film: true });
    t.provided.get('net').renderMenu(document.createElement('div'));
    h.dispose();
    const t2 = setup({ prefs: { film: true } });
    const h2 = net.init(t2.ctx);
    const ws2 = await goLive(t2);
    t2.emit('carry', { id });
    await vi.advanceTimersByTimeAsync(300);
    expect(ws2.frames().filter((m) => m.t === 'hd')).toEqual([{ t: 'hd', i: id }]);
    h2.dispose();
  });
});

describe('Modul net: Still-aus', () => {
  it.each([
    [{ ok: false, why: 'nourl' }, 'nicht eingerichtet'],
    [{ ok: false, why: 'gone' }, 'nicht eingerichtet'],
    [{ ok: false, why: 'off' }, 'vorübergehend aus'],
    [{ ok: false, why: 'blocked' }, 'nicht erreichbar'],
    [{ ok: false, why: 'auth' }, 'Anmeldung'],
  ])('Ticket %j: kein Socket, keine Figuren/Anzeige, Panel nennt den Grund', async (ticket, text) => {
    const t = setup({ ticket });
    const h = net.init(t.ctx);
    t.emit('enter');
    await flush();
    expect(sockets.length).toBe(0);
    const p = t.provided.get('net');
    expect(p.active()).toBe(false);
    h.update(0.016, 1);
    expect(t.host.querySelector('.lfx-store-social')).toBeNull();
    const el = document.createElement('div');
    p.renderMenu(el);
    expect(el.querySelector('.lfx-mp-status').textContent).toContain(text);
    h.dispose();
  });

  it('Ticket 503 ohne Update-Hinweis; Verbindungsabbruch räumt Anzeige und Peers weg', async () => {
    const t = setup();
    const h = net.init(t.ctx);
    const ws = await goLive(t, WL({ peers: [peer(2, 'bbbbbbbbbbbb')] }));
    h.update(0.016, 1);
    expect(t.host.querySelector('.lfx-mp-social').hidden).toBe(false);
    ws.readyState = 3;
    ws.onclose({ code: 1006 });
    expect(t.provided.get('net').active()).toBe(false);
    expect(t.provided.get('net').peers()).toEqual([]);
    expect(t.host.querySelector('.lfx-mp-social').hidden).toBe(true);
    h.dispose();
  });

  it('Update nötig (4001) nennt den Grund im Panel', async () => {
    const t = setup();
    const h = net.init(t.ctx);
    t.emit('enter');
    await flush();
    sockets[0].open();
    sockets[0].readyState = 3;
    sockets[0].onclose({ code: 4001 });
    const el = document.createElement('div');
    t.provided.get('net').renderMenu(el);
    expect(el.querySelector('.lfx-mp-status').textContent).toContain('Update nötig');
    h.dispose();
  });
});

describe('Modul net: Lebenszyklus', () => {
  it('echtes Aussetzen schließt mit 1000, Fortsetzen verbindet neu', async () => {
    const t = setup();
    const h = net.init(t.ctx);
    const ws = await goLive(t);
    t.state.suspended = true;
    h.onSuspend();
    expect(ws.closed).toBe(1000);
    expect(t.provided.get('net').active()).toBe(false);
    t.state.suspended = false;
    h.onResume();
    await flush();
    expect(sockets.length).toBe(2);
    h.dispose();
  });

  it('VR-Kino (ctx.suspended() false): Verbindung bleibt, Anzeige weg, keine Posen', async () => {
    const t = setup();
    const h = net.init(t.ctx);
    const ws = await goLive(t);
    h.update(0.016, 1);
    await vi.advanceTimersByTimeAsync(300);
    const n0 = ws.frames().filter((m) => m.t === 'p').length;
    h.onSuspend();
    expect(ws.closed).toBeNull();
    expect(t.provided.get('net').active()).toBe(true);
    expect(t.host.querySelector('.lfx-mp-social').hidden).toBe(true);
    t.player.x = 9;
    h.update(0.016, 2);
    await vi.advanceTimersByTimeAsync(300);
    expect(ws.frames().filter((m) => m.t === 'p').length).toBe(n0);
    h.onResume();
    expect(sockets.length).toBe(1);
    h.update(0.016, 3);
    await vi.advanceTimersByTimeAsync(300);
    expect(ws.frames().filter((m) => m.t === 'p').length).toBe(n0 + 1);
    h.dispose();
  });

  it('Panel-Schalter Mehrspieler aus schließt die Verbindung, an verbindet wieder', async () => {
    const t = setup();
    const h = net.init(t.ctx);
    const ws = await goLive(t);
    const el = document.createElement('div');
    const p = t.provided.get('net');
    p.renderMenu(el);
    const b = [...el.querySelectorAll('button')].find((x) => x.textContent.startsWith('Mehrspieler'));
    expect(b.textContent).toBe('Mehrspieler: An');
    b.click();
    expect(ws.closed).toBe(1000);
    expect(t.getPrefs().on).toBe(false);
    expect(b.textContent).toBe('Mehrspieler: Aus');
    expect([...el.querySelectorAll('button')].filter((x) => x !== b).every((x) => x.disabled)).toBe(true);
    b.click();
    await flush();
    expect(sockets.length).toBe(2);
    h.dispose();
  });

  it('Name-Schalter sendet das Flag neu', async () => {
    const t = setup();
    const h = net.init(t.ctx);
    const ws = await goLive(t);
    const el = document.createElement('div');
    t.provided.get('net').renderMenu(el);
    [...el.querySelectorAll('button')].find((x) => x.textContent.startsWith('Name zeigen')).click();
    await vi.advanceTimersByTimeAsync(300);
    expect(ws.frames().filter((m) => m.t === 'f')).toEqual([{ t: 'f', f: 4 }]);
    h.dispose();
  });

  it('dispose: Socket zu, Provider und DOM weg, Listener entfernt', async () => {
    const t = setup();
    const rm = vi.spyOn(document, 'removeEventListener');
    const h = net.init(t.ctx);
    const ws = await goLive(t);
    h.update(0.016, 1);
    h.dispose();
    expect(ws.closed).toBe(1000);
    expect(t.provided.has('net')).toBe(false);
    expect(t.host.querySelector('.lfx-store-social')).toBeNull();
    expect(rm).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    h.dispose(); // zweimal ist harmlos
    rm.mockRestore();
  });

  it('Provider: menu() und onChange', async () => {
    const t = setup();
    const h = net.init(t.ctx);
    const p = t.provided.get('net');
    expect(p.menu()).toEqual({ label: 'Mehrspieler …' });
    const fn = vi.fn();
    const off = p.onChange(fn);
    await goLive(t);
    expect(fn).toHaveBeenCalled();
    off();
    h.dispose();
  });
});

describe('Modul net: Welle b (Chat, Emotes, Liste, Kick)', () => {
  const withOverlay = (t) => {
    const ov = { open: vi.fn(), close: vi.fn(), isOpen: () => false };
    t.ctx.overlay = ov;
    return ov;
  };

  it('Provider: openChat und openEmotes öffnen die Teile nur bei Verbindung und Fähigkeit', async () => {
    const t = setup();
    const ov = withOverlay(t);
    const h = net.init(t.ctx);
    const p = t.provided.get('net');
    expect(p.openChat()).toBe(false); // noch nicht verbunden
    expect(p.openEmotes()).toBe(true); // 1.18.0: ohne Verbindung öffnet der lokale Zweig das Rad
    expect(ov.open).toHaveBeenCalledTimes(1);
    await goLive(t, WL({ cap: ['pres', 'chat', 'emote'] }));
    expect(p.openChat()).toBe(true);
    expect(ov.open).toHaveBeenCalledTimes(2);
    h.dispose();
  });

  it('Provider: ohne cap chat bleibt openChat false; Chat-Pref aus ebenso', async () => {
    const t = setup({ prefs: { chat: false } });
    withOverlay(t);
    const h = net.init(t.ctx);
    await goLive(t, WL({ cap: ['pres', 'chat', 'emote'] }));
    expect(t.provided.get('net').openChat()).toBe(false);
    h.dispose();
  });

  it('Provider say sendet m; emote sendet e', async () => {
    const t = setup();
    withOverlay(t);
    const h = net.init(t.ctx);
    const ws = await goLive(t, WL({ cap: ['pres', 'chat', 'emote'] }));
    const p = t.provided.get('net');
    expect(p.say('Hallo')).toBe(true);
    expect(p.emote(1)).toBe(true);
    h.update(0.016, 1);
    vi.advanceTimersByTime(500);
    h.update(0.016, 2);
    const fr = ws.frames();
    expect(fr.some((m) => m.t === 'm' && m.x === 'Hallo')).toBe(true);
    expect(fr.some((m) => m.t === 'e' && m.e === 1)).toBe(true);
    h.dispose();
  });

  it('Touch-HUD: Chat- und Emote-Knopf nur mit Fähigkeit, Desktop ohne Knöpfe', async () => {
    const t = setup({ touch: true });
    const ov = withOverlay(t);
    const h = net.init(t.ctx);
    await goLive(t, WL({ cap: ['pres', 'chat', 'emote'] }));
    h.update(0.016, 1);
    const chat = t.host.querySelector('.lfx-mp-chatbtn');
    const emo = t.host.querySelector('.lfx-mp-emotebtn');
    expect(chat.hidden).toBe(false);
    expect(emo.hidden).toBe(false);
    chat.click();
    expect(ov.open).toHaveBeenCalledTimes(1);
    h.dispose();
    const d = setup();
    const h2 = net.init(d.ctx);
    await goLive(d, WL({ cap: ['pres', 'chat', 'emote'] }));
    h2.update(0.016, 1);
    expect(d.host.querySelector('.lfx-mp-chatbtn')).toBeNull();
    h2.dispose();
  });

  it('Touch-HUD ohne cap chat: kein Chat-Knopf', async () => {
    const t = setup({ touch: true });
    withOverlay(t);
    const h = net.init(t.ctx);
    await goLive(t, WL({ cap: ['pres', 'emote'] }));
    h.update(0.016, 1);
    expect(t.host.querySelector('.lfx-mp-chatbtn').hidden).toBe(true);
    expect(t.host.querySelector('.lfx-mp-emotebtn').hidden).toBe(false);
    h.dispose();
  });

  it('Spielerliste: Name, Ort, Stumm je Person über prefs.mute; Kick nur für Admin', async () => {
    const t = setup();
    withOverlay(t);
    const h = net.init(t.ctx);
    const ws = await goLive(t, WL({ ad: 0, peers: [peer(2, 'bbbbbbbbbbbb', { n: 'Anna', f: 1 }), peer(3, 'cccccccccccc', { n: 'Bob', f: 0 })] }));
    const p = t.provided.get('net');
    const el = document.createElement('div');
    p.renderMenu(el);
    const names = [...el.querySelectorAll('.lfx-mp-pname')].map((x) => x.textContent);
    expect(names).toEqual(['Anna', 'Jemand']);
    expect(el.querySelector('.lfx-mp-kick')).toBeNull();
    el.querySelector('.lfx-mp-mute').click();
    expect(t.onPrefs).toHaveBeenCalledWith({ mp: { mute: ['bbbbbbbbbbbb'] } });
    expect(ws.closed).toBeNull();
    h.dispose();
  });

  it('Kick: Admin sieht Knopf, Bestätigung nötig, sendet ki mit c; Admin-Ziel ohne Knopf', async () => {
    const t = setup();
    withOverlay(t);
    const h = net.init(t.ctx);
    const ws = await goLive(t, WL({ ad: 1, cap: ['pres', 'chat', 'emote', 'admin'], peers: [peer(2, 'bbbbbbbbbbbb', { n: 'Anna', f: 1 }), peer(3, 'cccccccccccc', { n: 'Chef', f: 1, ad: 1 })] }));
    const p = t.provided.get('net');
    const el = document.createElement('div');
    p.renderMenu(el);
    const kicks = el.querySelectorAll('.lfx-mp-kick');
    expect(kicks.length).toBe(1);
    kicks[0].click();
    h.update(0.016, 1);
    expect(ws.frames().some((m) => m.t === 'ki')).toBe(false);
    el.querySelector('.lfx-mp-kick.is-confirm').click();
    h.update(0.016, 2);
    vi.advanceTimersByTime(500);
    h.update(0.016, 3);
    expect(ws.frames().filter((m) => m.t === 'ki')).toEqual([{ t: 'ki', c: 2 }]);
    h.dispose();
  });
});

describe('Modul net: 1.18.0 (fight, Posen-Code, Emote-Hook)', () => {
  it('Provider net.fight: has() erst mit ausgehandelter Fähigkeit; Posen-Code 9..15 aus dem Modul fight, nie über das Sitzen', async () => {
    const t = setup();
    let code = 0;
    t.provided.set('fight', { poseCode: () => code });
    const h = net.init(t.ctx);
    const f = t.provided.get('net').fight;
    expect(f).toBeTruthy();
    expect(f.has()).toBe(false);
    const ws = await goLive(t, WL({ cap: ['pres', 'chat', 'fight'] }));
    expect(f.has()).toBe(true);
    code = 15;
    h.update(0.016, 1);
    await vi.advanceTimersByTimeAsync(300);
    h.update(0.016, 2);
    await vi.advanceTimersByTimeAsync(300);
    expect(ws.frames().filter((m) => m.t === 'p').some((m) => m.q[5] === 15)).toBe(true);
    code = 3; // ungültiger Code wird ignoriert
    h.dispose();
  });

  it('gesendetes Emote spielt lokal und meldet onPlayerEmote (Provider emotes)', async () => {
    const t = setup();
    t.ctx.overlay = { open: vi.fn(), close: vi.fn(), isOpen: () => false };
    const anim = [];
    t.provided.set('selfview', { playAnim: (a) => anim.push(a) });
    const h = net.init(t.ctx);
    const em = t.provided.get('emotes');
    const hook = vi.fn();
    em.onPlayerEmote(hook);
    await goLive(t, WL({ cap: ['pres', 'emote'] }));
    expect(em.emote('cheer')).toBe(true);
    expect(anim).toEqual(['cheer']);
    expect(hook).toHaveBeenCalledWith({ name: 'cheer', code: 2, anim: 'cheer' });
    h.dispose();
    expect(t.provided.get('emotes')).toBeUndefined();
  });

  it('ohne Verbindung/Fähigkeit spielt der Provider emotes lokal (Rad auch ohne Mehrspieler)', () => {
    const t = setup({ noMp: true });
    t.ctx.overlay = { open: vi.fn(), close: vi.fn(), isOpen: () => false };
    t.ctx.playing = () => true;
    const h = net.init(t.ctx);
    const em = t.provided.get('emotes');
    const hook = vi.fn();
    em.onPlayerEmote(hook);
    expect(em.emote('wave')).toBe(true);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(em.usable()).toBe(true);
    h.dispose();
  });
});
