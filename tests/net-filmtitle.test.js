// @vitest-environment jsdom
// VIDEOTHEK LENZ · Mehrspieler: Film-Spalte der Spielerliste (modules/net.js filmTitle), Notiz „Name zeigen“, Touch-Chatprotokoll unter dem Menü-Knopf.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import net from '../src/js/store3d/modules/net.js';
import { createPanel } from '../src/js/store3d/net/panel.js';

let sockets;
class FakeWS {
  constructor() { this.sent = []; this.readyState = 0; sockets.push(this); }
  send(s) { this.sent.push(s); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen && this.onopen({}); }
  recv(m) { this.onmessage && this.onmessage({ data: JSON.stringify(m) }); }
}
const WL = (over = {}) => ({ t: 'wl', pv: 1, c: 1, k: 'aaaaaaaaaaaa', s: 5000000, ad: 0, cap: ['pres', 'chat'], cf: { pr: 8, ph: 8 }, peers: [], ...over });
const peer = (c, k, extra = {}) => ({ c, k, n: 'Gast', f: 1, j: 0, ...extra });

function setup(o = {}) {
  const provided = new Map();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  const prefs = { on: true, name: true, film: false, chat: true, mute: [], hint: true };
  const listeners = new Map();
  const ctx = {
    scene: {}, camera: {}, renderer: { domElement: canvas }, layout: { w: 12.5, d: 18 }, isTouch: false, isPhone: false,
    deps: { mp: { uid: 'u1', cv: '1.16.0', prefs: () => prefs, ticket: async () => ({ ok: true, tk: 'a.b', url: 'wss://x/mp', exp: 0, pv: [1], s: 5000000 }) }, onPrefs: vi.fn() },
    opts: { debug: true, mpTransport: FakeWS },
    quality: () => 'high', suspended: () => false, playing: () => true,
    player: { getNet: () => ({ x: 5, y: 0, z: 5, yaw: 0, pitch: 0, a: 0, h: null, vx: 0, vy: 0, vz: 0 }) },
    xr: { presenting: () => false, toast: vi.fn() },
    overlay: { open: vi.fn(), close: vi.fn(), isOpen: () => false },
    catalog: o.catalog,
    provide: (n, impl) => { provided.set(n, impl); return () => provided.delete(n); },
    use: (n) => provided.get(n),
    on: (ev, fn) => { const l = listeners.get(ev) || []; l.push(fn); listeners.set(ev, l); return () => {}; },
  };
  if (o.offers) provided.set('cinema2d', { party: { offers: () => o.offers } });
  return { ctx, provided, emit: (ev) => { for (const fn of listeners.get(ev) || []) fn(); } };
}

async function live(t, wl) {
  t.emit('enter');
  await vi.advanceTimersByTimeAsync(0);
  const ws = sockets[sockets.length - 1];
  ws.open();
  ws.recv(wl);
  return ws;
}

beforeEach(() => { vi.useFakeTimers(); sockets = []; });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

const PEERS = [peer(2, 'bbbbbbbbbbbb', { n: 'Anna' }), peer(3, 'bbbbbbbbbbbb', { n: 'Anna' }), peer(4, 'cccccccccccc', { n: 'Ben' })];
const offer = (over = {}) => ({ sid: 7, host: 2, itemId: 'm1', n: 1, st: 1, m: [3], p: 0, at: 0, ...over });
const metas = (t) => {
  const el = document.createElement('div');
  t.provided.get('net').renderMenu(el);
  return [...el.querySelectorAll('.lfx-mp-pmeta')].map((x) => x.textContent);
};

describe('Spielerliste: Film-Spalte', () => {
  it('Titel bei öffentlicher Sitzung (Gastgeber oder Mitglied jeder Verbindung der Zeile) und Film im eigenen Katalog', async () => {
    const t = setup({ offers: [offer({ host: 9, m: [3] })], catalog: { items: new Map([['m1', { Id: 'm1', Name: 'Alien', Type: 'Movie' }]]) } });
    const h = net.init(t.ctx);
    await live(t, WL({ peers: PEERS }));
    expect(metas(t)).toEqual(['Unterwegs · 2 Geräte · Film: Alien', 'Unterwegs']);
    h.dispose();
  });
  it('Gastgeber zählt ebenfalls (Katalog als Objekt)', async () => {
    const t = setup({ offers: [offer({ host: 4, m: [] })], catalog: { items: { m1: { Id: 'm1', Name: 'Alien', Type: 'Movie' } } } });
    const h = net.init(t.ctx);
    await live(t, WL({ peers: PEERS }));
    expect(metas(t)).toEqual(['Unterwegs · 2 Geräte', 'Unterwegs · Film: Alien']);
    h.dispose();
  });
  it('kein Titel, wenn der Film nicht im eigenen Katalog steht', async () => {
    const t = setup({ offers: [offer()], catalog: { items: new Map([['x', { Id: 'x', Name: 'Anderer', Type: 'Movie' }]]) } });
    const h = net.init(t.ctx);
    await live(t, WL({ peers: PEERS }));
    expect(metas(t).join('|')).not.toContain('Film:');
    h.dispose();
  });
  it('kein Titel ohne Sitzung, ohne Katalog oder ohne cinema2d', async () => {
    for (const o of [{ offers: [], catalog: { items: new Map([['m1', { Id: 'm1', Name: 'Alien', Type: 'Movie' }]]) } }, { offers: [offer()] }, { catalog: { items: new Map() } }]) {
      const t = setup(o);
      const h = net.init(t.ctx);
      await live(t, WL({ peers: PEERS }));
      expect(metas(t).join('|')).not.toContain('Film:');
      h.dispose();
      sockets = [];
    }
  });
});

describe('Panel: Notiz „Name zeigen“', () => {
  it('sagt, dass bei Aus kein Name über der Figur steht', () => {
    const el = document.createElement('div');
    createPanel({ prefs: () => ({ on: true, name: true, chat: true, film: false }), set: () => {}, status: () => '', players: () => [], isMuted: () => false, setMute: () => {}, canKick: () => false, kick: () => false }).render(el);
    const notes = [...el.querySelectorAll('.lfx-mp-note')].map((x) => x.textContent);
    expect(notes).toContain('Dein Jellyfin-Benutzername über deiner Figur. Aus: kein Name über der Figur, in Liste und Chat „Jemand“.');
  });
});

describe('Touch-Chatprotokoll (CSS)', () => {
  const css = readFileSync('src/css/themes/store/net.css', 'utf8');
  const rule = (sel) => css.split('}').find((b) => b.includes(sel + ' {')) || '';
  it('liegt unter dem Menü-Knopf (top+10 + 44 + 8 = +62), Desktop unverändert', () => {
    expect(rule('.lfx-mp-chatlog.is-touch')).toContain('+ 62px');
    expect(rule('.lfx-mp-chatlog.is-desk')).toContain('bottom: max(24px');
  });
});
