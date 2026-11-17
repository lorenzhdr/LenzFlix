// @vitest-environment jsdom
// VIDEOTHEK LENZ · Platzwahl Mitschauen (Welle d): Angebot, Rechte-Filter, Privat-Regel, Start ohne resume, Panel-Bedienung.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Group, Scene } from 'three';
import { buildCity } from '../src/js/store3d/world/city.js';
import palastMod from '../src/js/store3d/modules/palast.js';
import { joinOffers, joinSub, createTicketBook, seatGate, ticketToast } from '../src/js/store3d/palast/choice.js';
import { renderJoin, joinSpec } from '../src/js/store3d/palast/joinpanel.js';
import { fakeCanvas } from './helpers-city.js';

const W = 16;
const D = 26;
const city = buildCity({ w: W, d: D, door: { x0: W / 2 - 1.1, x1: W / 2 + 1.1 } });
const movie = (i) => ({ Id: `m${i}`, Name: `Film ${i}`, Type: 'Movie', RunTimeTicks: 6000000000, ProductionYear: 2000 + i, ImageTags: { Primary: 't' } });

function setup({ offers = [], xr = false, active = false, pref } = {}) {
  const items = new Map();
  for (let i = 0; i < 6; i++) items.set(`m${i}`, movie(i));
  items.set('ep1', { Id: 'ep1', Name: 'Folge', Type: 'Episode' });
  const rec = { opened: [], sit: [], play: [], deps: [], join: [], vr: [], toasts: [], ias: [] };
  const providers = new Map();
  const party = { offers: vi.fn(() => offers), join: vi.fn((sid, it) => { rec.join.push([sid, it.Id]); return true; }) };
  const cinema = {
    active, phase: 'idle', seated: true, party,
    attachSaal: vi.fn(() => () => {}),
    sit: vi.fn((id) => { rec.sit.push(id); return true; }),
    play: vi.fn((it, o) => { rec.play.push([it.Id, o]); return Promise.resolve(true); }),
  };
  providers.set('city', { groups: { palastInterior: new Group(), palast: new Group() } });
  providers.set('areas', { current: () => 'palastHall', on: () => () => {} });
  providers.set('cinema2d', cinema);
  providers.set('net', { me: () => ({ c: 9 }), peerName: (c) => ({ 1: 'Anna', 2: 'Jemand' }[c] || 'Jemand'), serverNow: () => 100000, ...(pref ? { prefs: () => pref } : {}) });
  const pose = { x: W / 2, z: city.palast.hall.z0 + 4, y: 0, yaw: 0, pitch: 0 };
  const ctx = {
    layout: { city }, catalog: { items, resume: [], departments: [] }, scene: new Scene(), opts: {},
    deps: { toast: (t) => rec.toasts.push(t), imageUrl: (id) => `img/${id}`, play: vi.fn((it, o) => rec.deps.push([it.Id, o])) },
    xr: { presenting: () => xr, toast: (t) => rec.toasts.push(t), panel: { open: vi.fn((spec) => { rec.vr.push(spec); return { update() {}, open: true }; }) } },
    addCollider: (r) => r, removeCollider: () => {}, addInteractable: (o) => { rec.ias.push(o); return () => {}; },
    player: { getPose: () => pose, teleport: vi.fn() },
    items: { carried: () => null, drop: vi.fn() },
    overlay: { isOpen: () => false, open: (el) => { rec.opened.push(el); }, close: vi.fn() },
    track: (o) => o, loadTexture: () => Promise.resolve(null),
    use: (n) => providers.get(n), provide: (n, impl) => { providers.set(n, impl); return () => providers.delete(n); }, on: () => () => {}, isTouch: false,
  };
  return { ctx, rec, cinema, party, providers };
}
const seatOf = (t) => t.rec.ias.find((i) => /^Platz /.test(i.label));
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () { return fakeCanvas().getContext(); }); });
afterEach(() => { vi.restoreAllMocks(); });

describe('choice: Angebote und Rechte-Filter', () => {
  const items = new Map([['m1', movie(1)], ['ep', { Id: 'ep', Name: 'Folge', Type: 'Episode' }]]);
  it('nur Filme aus dem eigenen Katalog, nie ein fremder Titel', () => {
    const raw = [{ sid: 1, i: 'm1', n: 2, st: 1, m: [1, 2] }, { sid: 2, i: 'zz', n: 1, st: 1, m: [3] }, { sid: 3, i: 'ep', n: 1, st: 1, m: [4] }, { sid: 4, n: 1, st: 1, m: [5] }];
    const o = joinOffers(raw, items, () => 'Jemand', 0, null);
    expect(o.map((x) => x.sid)).toEqual([1]);
    expect(JSON.stringify(o)).not.toContain('zz');
  });
  it('nimmt auch Array-Einträge', () => {
    const o = joinOffers([[7, 1, 'm1', 1, 2, [1], 0, 0]], items, () => 'Anna', 0, null);
    expect(o[0]).toMatchObject({ sid: 7, itemId: 'm1' });
    expect(o[0].sub).toBe('pausiert · mit Anna');
  });
  it('Unterzeilen', () => {
    const nm = (c) => ({ 1: 'Anna', 2: 'Ben', 3: 'Cem' }[c] || 'Jemand');
    expect(joinSub({ st: 1, n: 3, m: [1, 2, 3] }, nm, 0)).toBe('läuft · mit Anna und 2 weiteren');
    expect(joinSub({ st: 1, n: 2, m: [1, 2] }, nm, 0)).toBe('läuft · mit Anna und 1 weiteren');
    expect(joinSub({ st: 0, n: 3, m: [8, 9, 10] }, nm, 0)).toBe('startet gerade · mit 3 Zuschauern');
    expect(joinSub({ st: 2, n: 1, m: [9] }, nm, 0)).toBe('pausiert · mit 1 Zuschauer');
    expect(joinSub({ st: 1, n: 1, m: [8], p: 60000, at: 1000 }, nm, 0, 11000)).toBe('läuft bei 1:10 · mit 1 Zuschauer');
    expect(joinSub({ st: 1, n: 1, m: [1], p: 3600000, at: 0 }, nm, 0, 5000)).toBe('läuft bei 1:00:05 · mit Anna');
  });
  it('Ticket join: ohne resume, Toast, seatGate mit Angebot', () => {
    const b = createTicketBook();
    const t = b.join({ sid: 5, itemId: 'm1', item: movie(1) });
    expect(t).toMatchObject({ source: 'join', resume: false, itemId: 'm1', sid: 5 });
    expect(ticketToast(t)).toContain('schaust mit');
    expect(b.join({ sid: 1 })).toBe(null);
    expect(seatGate(null, true, true).ok).toBe(true);
    expect(seatGate(null, true).ok).toBe(false);
  });
});

describe('Modul palast: Platzwahl mit Angebot', () => {
  const offer = [{ sid: 4, host: 1, i: 'm2', n: 2, st: 1, m: [1, 2], p: 0, at: 0 }];
  it('ohne Angebot unverändert (Hinweis ohne Ticket, kein Panel)', () => {
    const t = setup();
    palastMod.init(t.ctx);
    seatOf(t).onUse();
    expect(t.rec.opened.length).toBe(0);
    expect(t.rec.toasts).toContain('Erst ein Ticket an der Kasse holen');
  });
  it('Angebot ohne Katalog-Recht: kein Panel', () => {
    const t = setup({ offers: [{ sid: 4, i: 'nichtda', n: 1, st: 1, m: [1] }] });
    palastMod.init(t.ctx);
    seatOf(t).onUse();
    expect(t.rec.opened.length).toBe(0);
    expect(t.cinema.sit).not.toHaveBeenCalled();
  });
  it('Angebot: Panel mit Zeile Mitschauen und gesperrtem eigenem Film (kein Ticket); kein Sitzen vor der Wahl', () => {
    const t = setup({ offers: offer });
    palastMod.init(t.ctx);
    seatOf(t).onUse();
    const root = t.rec.opened[0];
    expect(root.textContent).toContain('Mitschauen: „Film 2“');
    expect(root.textContent).toContain('läuft bei 1:40 · mit Anna und 1 weiteren');
    expect(root.textContent).toContain('erst ein Ticket an der Kasse holen');
    expect(root.querySelector('.lfx-store-join-row:disabled')).toBeTruthy();
    expect(t.cinema.sit).not.toHaveBeenCalled();
  });
  it('Mitschauen: join an die Party, dann sit, dann play ohne resume', async () => {
    const t = setup({ offers: offer });
    palastMod.init(t.ctx);
    seatOf(t).onUse();
    t.rec.opened[0].querySelector('.lfx-store-join-row').click();
    await flush();
    expect(t.rec.join).toEqual([[4, 'm2']]);
    expect(t.rec.sit.length).toBe(1);
    expect(t.rec.play).toEqual([['m2', { resume: false }]]);
    expect(t.providers.get('palast').ticket()).toMatchObject({ source: 'join', itemId: 'm2' });
  });
  it('Eigener Film mit Ticket: kein join', async () => {
    const t = setup({ offers: offer });
    palastMod.init(t.ctx);
    const prov = t.providers.get('palast');
    prov.ticketBook.buyShow({ itemId: 'm3', title: 'Film 3', resume: false, slot: 0, time: '20:00' }, t.ctx.catalog.items.get('m3'), 'x');
    seatOf(t).onUse();
    const rows = t.rec.opened[0].querySelectorAll('.lfx-store-join-row');
    expect(rows[1].textContent).toContain('Eigener Film: „Film 3“');
    rows[1].click();
    await flush();
    expect(t.rec.join).toEqual([]);
    expect(t.rec.play).toEqual([['m3', { resume: false }]]);
  });
  it('läuft schon ein Film (Platzwechsel/Wiederhinsetzen): kein Panel', () => {
    const t = setup({ offers: offer, active: true });
    palastMod.init(t.ctx);
    seatOf(t).onUse();
    expect(t.rec.opened.length).toBe(0);
    expect(t.rec.toasts).toContain('Erst ein Ticket an der Kasse holen'); // alter Weg
  });
  it('Privat-Hinweis nur bei ausgeschaltetem Film-Flag', () => {
    const a = setup({ offers: offer, pref: { film: false } });
    palastMod.init(a.ctx);
    seatOf(a).onUse();
    expect(a.rec.opened[0].textContent).toContain('Dein Film ist privat');
    const b = setup({ offers: offer, pref: { film: true } });
    palastMod.init(b.ctx);
    seatOf(b).onUse();
    expect(b.rec.opened[0].textContent).not.toContain('Dein Film ist privat');
  });
  it('VR: Panel-Spec statt DOM; Mitschauen spielt über deps.play ohne resume', async () => {
    const t = setup({ offers: offer, xr: true });
    palastMod.init(t.ctx);
    seatOf(t).onUse();
    expect(t.rec.opened.length).toBe(0);
    const spec = t.rec.vr[0];
    expect(spec.list.rows[0].label).toBe('Mitschauen: „Film 2“');
    spec.list.rows[0].actions[0].onSelect();
    await flush();
    expect(t.rec.join).toEqual([[4, 'm2']]);
    expect(t.rec.deps).toEqual([['m2', { resume: false }]]);
  });
});

describe('joinpanel: Bedienung', () => {
  const model = (over = {}) => ({ offers: [{ sid: 1, title: 'A', sub: 'läuft' }], own: null, isPrivate: false, onJoin: vi.fn(), onOwn: vi.fn(), ...over });
  it('Esc schließt, Tab bleibt im Panel', () => {
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const close = vi.fn();
    renderJoin(panel, close, model({ own: { title: 'B' } }));
    const bs = [...panel.querySelectorAll('button:not([disabled])')];
    expect(bs.length).toBe(3);
    bs[bs.length - 1].focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    bs[bs.length - 1].dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(bs[0]);
    bs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(bs[bs.length - 1]);
    bs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(close).toHaveBeenCalled();
  });
  it('Spec ohne Ticket: eigener Film ohne Aktion', () => {
    const s = joinSpec(model({ isPrivate: true }), vi.fn());
    expect(s.list.rows[1].actions).toEqual([]);
    expect(s.lines.join(' ')).toContain('privat');
  });
});
