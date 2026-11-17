// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Group, Scene } from 'three';
import { buildCity } from '../src/js/store3d/world/city.js';
import palastMod, { dayLabel } from '../src/js/store3d/modules/palast.js';
import { renderPanel } from '../src/js/store3d/palast/panel.js';
import { showRows } from '../src/js/store3d/palast/choice.js';
import { buildProgram } from '../src/js/store3d/palast/program.js';
import { fakeCanvas } from './helpers-city.js';

const W = 16;
const D = 26;
const city = buildCity({ w: W, d: D, door: { x0: W / 2 - 1.1, x1: W / 2 + 1.1 } });

const movie = (i) => ({ Id: `m${i}`, Name: `Film ${i}`, Type: 'Movie', RunTimeTicks: 6000000000, ProductionYear: 2000 + i, ImageTags: { Primary: 't' } });

function setup({ area = 'palastHall', resume = [], xr = false, hall = true } = {}) {
  const items = new Map();
  for (let i = 0; i < 6; i++) items.set(`m${i}`, movie(i));
  const catalog = { items, resume, departments: [] };
  const groups = { palastInterior: new Group(), palast: new Group() };
  const rec = { toasts: [], colliders: [], ias: [], found: [], say: [], opened: [], drop: 0, sit: [], play: [], attach: 0, detach: 0, areaCbs: [] };
  let pose = hall ? { x: W / 2, z: city.palast.hall.z0 + 4, y: 0, yaw: 0, pitch: 0 } : { x: W / 2, z: city.palast.foyer.z0 + 1, y: 0, yaw: 0, pitch: 0 };
  let carried = null;
  const providers = new Map();
  const cinema = {
    active: false, phase: 'idle', seated: true,
    attachSaal: vi.fn((s) => { rec.attach++; rec.saal = s; return () => { rec.detach++; }; }),
    sit: vi.fn((id) => { rec.sit.push(id); return true; }),
    play: vi.fn((it, o) => { rec.play.push([it.Id, o]); return Promise.resolve(true); }),
  };
  providers.set('city', { groups });
  providers.set('areas', { current: () => area, on: (fn) => { rec.areaCbs.push(fn); return () => { rec.areaCbs = rec.areaCbs.filter((f) => f !== fn); }; } });
  providers.set('cinema2d', cinema);
  providers.set('discover', { found: (id) => { rec.found.push(id); return true; } });
  providers.set('npc', { staff: (role) => ({ say: (t) => rec.say.push([role, t]) }) });
  providers.set('weather', { hour: 19 });
  const ctx = {
    layout: { city }, catalog, scene: new Scene(), opts: {},
    deps: { toast: (t) => rec.toasts.push(t), imageUrl: (id) => `img/${id}`, play: vi.fn() },
    xr: { presenting: () => xr, toast: (t) => rec.toasts.push(t) },
    addCollider: (r) => { rec.colliders.push(r); return r; },
    removeCollider: (r) => { rec.colliders = rec.colliders.filter((c) => c !== r); },
    addInteractable: (o) => { rec.ias.push(o); return () => { rec.ias = rec.ias.filter((i) => i !== o); }; },
    player: { getPose: () => pose, teleport: vi.fn() },
    items: { carried: () => carried, drop: () => { rec.drop++; carried = null; } },
    overlay: { isOpen: () => false, open: (el) => { rec.opened.push(el); }, close: vi.fn() },
    track: (o) => o,
    loadTexture: () => Promise.resolve(null),
    use: (n) => providers.get(n),
    provide: (n, impl) => { providers.set(n, impl); return () => providers.delete(n); },
    on: () => () => {},
    isTouch: false,
  };
  return { ctx, rec, groups, cinema, providers, setCarried: (c) => { carried = c; }, setPose: (p) => { pose = p; } };
}

const iaBy = (rec, label) => rec.ias.find((i) => i.label === label);

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () { return fakeCanvas().getContext(); });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('Modul palast', () => {
  it('ohne Stadt oder ohne city-Gruppe: tut nichts', () => {
    const t = setup();
    expect(palastMod.init({ ...t.ctx, layout: {} })).toEqual({});
    t.providers.set('city', { groups: null });
    expect(palastMod.init(t.ctx)).toEqual({});
  });

  it('meldet den Saal bei PalastCinema an, hängt Meshes in palastInterior und liefert den Provider', () => {
    const t = setup();
    const h = palastMod.init(t.ctx);
    expect(t.cinema.attachSaal).toHaveBeenCalledTimes(1);
    const saal = t.rec.saal;
    expect(saal.anchor.rotation.y).toBeCloseTo(Math.PI);
    expect(saal.seats.length).toBeGreaterThan(40);
    expect(saal.bounds).toEqual({ x0: city.palast.hall.x0, z0: city.palast.hall.z0, x1: city.palast.hall.x1, z1: city.palast.hall.z1 });
    expect(saal.screenOpts.maxH).toBeGreaterThan(3);
    expect(t.groups.palastInterior.children.length).toBe(2);
    const prov = t.providers.get('palast');
    expect(prov.stations.ticket).toBeTruthy();
    expect(prov.program().shows.length).toBe(4);
    expect(t.rec.colliders.length).toBeGreaterThan(20);
    h.dispose();
    expect(t.rec.detach).toBe(1);
    expect(t.rec.colliders.length).toBe(0);
    expect(t.rec.ias.length).toBe(0);
    expect(t.providers.has('palast')).toBe(false);
    expect(t.groups.palastInterior.children.length).toBe(0);
  });

  it('Sitz-Interaktionen existieren nur im Saal (Bereichswechsel) und gelten auf Rängen (anyHeight)', () => {
    const t = setup({ area: 'palastFoyer' });
    const h = palastMod.init(t.ctx);
    expect(t.rec.ias.some((i) => /^Platz /.test(i.label))).toBe(false);
    t.rec.areaCbs.forEach((fn) => fn('palastHall', 'palastFoyer'));
    const seats = t.rec.ias.filter((i) => /^Platz /.test(i.label));
    expect(seats.length).toBe(t.rec.saal.seats.length);
    expect(seats.every((i) => i.anyHeight)).toBe(true);
    t.rec.areaCbs.forEach((fn) => fn('palastFoyer', 'palastHall'));
    expect(t.rec.ias.some((i) => /^Platz /.test(i.label))).toBe(false);
    h.dispose();
  });

  it('Hinsetzen ohne Ticket: Hinweis, kein Film; mit Ticket: sit + play (mit Weiterschauen-Position)', async () => {
    const t = setup({ resume: [movie(3)] });
    palastMod.init(t.ctx);
    const seat = iaBy(t.rec, `Platz ${t.rec.saal.seats[10].id}`);
    seat.onUse();
    expect(t.cinema.sit).not.toHaveBeenCalled();
    expect(t.rec.toasts).toContain('Erst ein Ticket an der Kasse holen');
    const prov = t.providers.get('palast');
    const show = prov.program().shows[0];
    expect(show).toMatchObject({ itemId: 'm3', resume: true });
    prov.ticketBook.buyShow(show, t.ctx.catalog.items.get('m3'), 'x');
    seat.onUse();
    expect(t.cinema.sit).toHaveBeenCalledWith(t.rec.saal.seats[10].id);
    await Promise.resolve();
    expect(t.rec.play).toEqual([['m3', { resume: true }]]);
  });

  it('Kasse: Overlay mit Programm; Kauf setzt Ticket, Toast und Spruch des Personals', () => {
    const t = setup();
    palastMod.init(t.ctx);
    iaBy(t.rec, 'Kasse').onUse();
    expect(t.rec.opened.length).toBe(1);
    const root = t.rec.opened[0];
    expect(root.querySelectorAll('.lfx-store-palast-row').length).toBe(4);
    expect(root.querySelector('.lfx-store-palast-hand')).toBe(null);
    root.querySelectorAll('.lfx-store-palast-row')[1].click();
    const tk = t.providers.get('palast').ticket();
    expect(tk).toMatchObject({ source: 'program', slot: 1 });
    expect(t.rec.toasts.some((x) => x.includes('Saal 1'))).toBe(true);
    expect(t.rec.say.some(([r]) => r === 'ticket')).toBe(true);
  });

  it('Mitgebrachte Kassette: Knopf im Overlay und direkt am Kartenabreißer; Hülle wird abgegeben', () => {
    const t = setup();
    palastMod.init(t.ctx);
    const tape = { Id: 'own1', Name: 'Meine Kassette', Type: 'Series' };
    t.setCarried({ id: 'own1', item: tape });
    iaBy(t.rec, 'Anzeigetafel').onUse();
    const btn = t.rec.opened[0].querySelector('.lfx-store-palast-hand');
    expect(btn).toBeTruthy();
    btn.click();
    expect(t.providers.get('palast').ticket()).toMatchObject({ source: 'tape', itemId: 'own1' });
    expect(t.rec.drop).toBe(1);
    // direkt am Pult
    t.providers.get('palast').ticketBook.clear();
    t.setCarried({ id: 'own1', item: tape });
    iaBy(t.rec, 'Kartenabreißer').onUse();
    expect(t.providers.get('palast').ticket().source).toBe('tape');
    expect(t.rec.drop).toBe(2);
  });

  it('Entdeckung erst beim echten Filmstart; Ticket verfällt nach dem Film', () => {
    const t = setup();
    const h = palastMod.init(t.ctx);
    t.ctx.use('city').groups.palastInterior.visible = true;
    const prov = t.providers.get('palast');
    const tape = { Id: 'own1', Name: 'K', Type: 'Movie' };
    prov.ticketBook.handIn(tape);
    t.cinema.active = true;
    t.cinema.phase = 'starting';
    h.update(0.1);
    expect(t.rec.found).toEqual([]);
    t.cinema.phase = 'playing';
    h.update(0.1);
    h.update(0.1);
    expect(t.rec.found).toEqual(['palast-film', 'palast-tape']);
    t.cinema.active = false;
    h.update(0.1);
    expect(prov.ticket()).toBe(null);
  });

  it('VR: Foyer gibt nur einen Hinweis (kein DOM), Hinsetzen startet über deps.play', () => {
    const t = setup({ xr: true });
    palastMod.init(t.ctx);
    iaBy(t.rec, 'Kasse').onUse();
    expect(t.rec.opened.length).toBe(0);
    iaBy(t.rec, `Platz ${t.rec.saal.seats[0].id}`).onUse();
    expect(t.ctx.deps.play).toHaveBeenCalledTimes(1);
    expect(t.cinema.sit).not.toHaveBeenCalled();
  });

  it('Provider test(): Spieler in den Saal, Ticket, Start', () => {
    const t = setup();
    palastMod.init(t.ctx);
    const h = t.providers.get('palast').test({ autostart: true });
    expect(t.ctx.player.teleport).toHaveBeenCalled();
    expect(t.cinema.sit).toHaveBeenCalled();
    expect(t.cinema.play).toHaveBeenCalled();
    expect(h.saal).toBe(t.rec.saal);
  });

  it('Saal-Handle: Licht, Vorhang, Streulicht ohne Fehler; dispose räumt auf', () => {
    const t = setup();
    palastMod.init(t.ctx);
    const s = t.rec.saal;
    s.light(0.08);
    s.curtain(true);
    for (let i = 0; i < 40; i++) s.update(0.1);
    expect(s.diag().curtain).toBe(1);
    s.curtain(false, true);
    expect(s.diag().curtain).toBe(0);
    s.spill({ r: 1, g: 0.5, b: 0 }, 1);
    expect(s.diag().spill).toBe(1);
  });
});

describe('Kassen-Overlay (DOM)', () => {
  it('rendert Zeilen, Hinweis ohne Kassette und Ticket mit Rückgabe', () => {
    const prog = buildProgram({ items: new Map([['a', movie(1)], ['b', movie(2)]]), resume: [], departments: [] }, '2026-01-01');
    const panel = document.createElement('div');
    const model = {
      rows: showRows(prog, 600, null), ticket: null, tape: null, footer: prog.footer, dayLabel: 'Heute',
      imageUrl: () => '', itemOf: () => null, onBuy: vi.fn(), onHandIn: vi.fn(), onClear: vi.fn(),
    };
    const close = vi.fn();
    const r = renderPanel(panel, close, model);
    expect(panel.querySelectorAll('.lfx-store-palast-row').length).toBe(2);
    expect(panel.querySelector('.lfx-store-palast-tip')).toBeTruthy();
    panel.querySelector('.lfx-store-palast-row').click();
    expect(model.onBuy).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalled();
    model.ticket = { no: 123, title: 'X', source: 'program' };
    r.rebuild();
    panel.querySelector('.lfx-store-palast-back').click();
    expect(model.onClear).toHaveBeenCalled();
  });

  it('leeres Programm: freundlicher Text', () => {
    const panel = document.createElement('div');
    renderPanel(panel, () => {}, { rows: [], ticket: null, tape: null, onBuy() {}, onHandIn() {}, onClear() {} });
    expect(panel.textContent).toContain('Popcorn holen');
  });

  it('dayLabel', () => {
    expect(dayLabel('2026-11-17')).toBe('Heute, 17. November');
    expect(dayLabel('')).toBe('Heute im Programm');
  });
});
