// @vitest-environment jsdom
// Audit w3 (store3d-xr-2): H008, B069, B073, B077, A117, A118, B072
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Group, Scene, PerspectiveCamera, Vector3 } from 'three';
import { Hud3d, vrHint } from '../src/js/store3d/xr/hud3d.js';
import { buildMenuSpec } from '../src/js/store3d/xr/menu.js';
import { XrMode } from '../src/js/store3d/xr/mode.js';
import { Cinema } from '../src/js/store3d/cinema/cinema.js';
import { Pointer, scrollable } from '../src/js/store3d/xr/pointer.js';
import { openPanel, layoutPanel, MAX_H } from '../src/js/store3d/xr/panel.js';

const makeHud = () => new Hud3d({ rig: new Group(), camera: new PerspectiveCamera() });

describe('H008 Hinweis überdeckt das Kino-Panel nicht', () => {
  it('Toast sitzt oberhalb der Blickmitte (das Panel „low“ liegt darunter)', () => {
    const hud = makeHud();
    expect(hud.toastQuad.mesh.position.y).toBeGreaterThan(0);
    hud.dispose();
  });
});

describe('B069 TextQuad ersetzt die Textur bei Größenwechsel', () => {
  let orig;
  beforeEach(() => {
    orig = HTMLCanvasElement.prototype.getContext;
    const g = { measureText: (t) => ({ width: String(t).length * 20 }), clearRect() {}, beginPath() {}, rect() {}, fill() {}, fillText() {} };
    HTMLCanvasElement.prototype.getContext = () => g;
  });
  afterEach(() => { HTMLCanvasElement.prototype.getContext = orig; });

  it('neue CanvasTexture nur bei geänderten Maßen', () => {
    const hud = makeHud();
    const t0 = hud.toastQuad.mat.map;
    hud.toast('kurz');
    expect(hud.toastQuad.mat.map).toBe(t0); // erster Upload: gleiche Textur
    hud.toast('kurz2'); // gleiche Breite? 5 statt 4 Zeichen -> andere Breite
    const t1 = hud.toastQuad.mat.map;
    expect(t1).not.toBe(t0);
    expect(hud.toastQuad.tex).toBe(t1);
    expect(t1.image).toBe(hud.toastQuad.canvas);
    hud.toast('ein deutlich längerer Hinweistext');
    expect(hud.toastQuad.mat.map).not.toBe(t1);
    hud.dispose();
  });
});

describe('B073/B077 VR-Menü im Kino', () => {
  const fake = (over = {}) => ({
    app: { opts: { vr: {} }, sound: true, setSound() {}, setQuality() {}, openTerminal: vi.fn() },
    diagOn: false, cinema: null, savePrefs() {}, refreshMenu() {}, closeMenu() {}, recenter: vi.fn(), toast: vi.fn(), exit() {}, setDiag() {},
    ...over,
  });
  const labels = (m) => buildMenuSpec(m).list.rows.map((r) => r.label);

  it('B073: im Kino weder Kassen-PC-Suche noch Größe', () => {
    expect(labels(fake({ inCinema: false }))).toContain('Kassen-PC-Suche');
    const l = labels(fake({ inCinema: true }));
    expect(l).not.toContain('Kassen-PC-Suche');
    expect(l).not.toContain('Größe');
    expect(l).toContain('Neu ausrichten');
  });

  it('B073: jumpTo im Kino teleportiert nicht', async () => {
    const teleport = vi.fn();
    const r = await XrMode.prototype.jumpTo.call({ inCinema: true, app: { player: { yaw: 0, teleport }, layout: null } }, 1, 2);
    expect(r).toBe(false);
    expect(teleport).not.toHaveBeenCalled();
  });

  it('B077: Neu ausrichten meldet Erfolg nur bei echter Neuplatzierung', () => {
    const m = fake({ recenter: vi.fn(() => false) });
    buildMenuSpec(m).list.rows.find((r) => r.label === 'Neu ausrichten').onSelect();
    expect(m.toast).not.toHaveBeenCalled();
    const m2 = fake({ recenter: vi.fn(() => true) });
    buildMenuSpec(m2).list.rows.find((r) => r.label === 'Neu ausrichten').onSelect();
    expect(m2.toast).toHaveBeenCalled();
  });

  it('B077: XrMode.recenter im Kino delegiert an das Kino, sonst placed=false', () => {
    const cinema = { recenter: vi.fn(() => true) };
    const a = { inCinema: true, cinema, placed: true };
    expect(XrMode.prototype.recenter.call(a)).toBe(true);
    expect(cinema.recenter).toHaveBeenCalled();
    expect(a.placed).toBe(true);
    const b = { inCinema: false, cinema, placed: true };
    expect(XrMode.prototype.recenter.call(b)).toBe(true);
    expect(b.placed).toBe(false);
  });
});

function cinemaSetup({ gated = false } = {}) {
  const dc = {
    video: () => null, state: () => ({ route: 'video', phase: 'loading', title: 'T' }), onVideo: () => () => {}, onChange: () => () => {},
    subtitles: () => null, stop: async () => true,
  };
  const engine = { rig: new Group(), storeScene: new Scene(), camera: new PerspectiveCamera(), setScene: vi.fn(), setFoveation: vi.fn() };
  engine.storeScene.add(engine.rig);
  const app = {
    deps: { cinema: dc }, engine, player: { x: 0, z: 0, yaw: 0, pitch: 0, teleport: vi.fn() },
    mods: { hook: vi.fn(), ctx: { use: () => ({ duck: vi.fn() }) } }, holdview: { close: vi.fn() }, opts: { vr: { seat: 'mid' } }, savePrefs: vi.fn(), qualitySetting: 'mid',
  };
  const cin = new Cinema(app);
  if (gated) {
    const fade = { jump: vi.fn((fn) => new Promise((res) => { setTimeout(() => { fn(); res(); }, 100); })) };
    app.xr = { presenting: true, fade, floor: true, savePrefs() {}, openPanel: () => ({ open: true, close() {}, update() {} }), toast() {}, closePanels() {}, leaveCinema: (r, c) => cin.leave(r, c) };
  }
  return { cin, app, engine };
}

describe('B077 Cinema.recenter', () => {
  it('false ohne Kino, true und neue Sitzhöhe im Kino', () => {
    const { cin, engine } = cinemaSetup();
    expect(cin.recenter()).toBe(false);
    cin.enter({ Name: 'X' });
    const y0 = engine.rig.position.y;
    engine.camera.position.set(0, 1.0, 0);
    engine.camera.updateMatrixWorld(true);
    expect(cin.recenter()).toBe(true);
    expect(engine.rig.position.y).not.toBeCloseTo(y0, 3);
    cin.dispose();
  });
});

describe('A117 Kino-Start während der Rückblende', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('enter in der Phase leaving wird nach dem Verlassen nachgeholt', async () => {
    const { cin } = cinemaSetup({ gated: true });
    expect(cin.enter({ Name: 'A' })).toBe(true);
    await vi.advanceTimersByTimeAsync(150);
    expect(cin.phase).toBe('starting');
    cin.leave('stop');
    expect(cin.phase).toBe('leaving');
    expect(cin.enter({ Name: 'B' })).toBe(true);
    await vi.advanceTimersByTimeAsync(600);
    expect(cin.active).toBe(true);
    expect(cin.item.Name).toBe('B');
    cin.dispose();
  });

  it('ein erneutes Verlassen verwirft den vorgemerkten Start', async () => {
    const { cin } = cinemaSetup({ gated: true });
    cin.enter({ Name: 'A' });
    await vi.advanceTimersByTimeAsync(150);
    cin.leave('stop');
    cin.enter({ Name: 'B' });
    cin.leave('home');
    await vi.advanceTimersByTimeAsync(600);
    expect(cin.active).toBe(false);
    cin.dispose();
  });
});

describe('A118 Hinweise für Hände', () => {
  it('vrHint: Pinch statt Trigger', () => {
    expect(vrHint('E / Klick: Nehmen', undefined, true)).toBe('Zusammenkneifen: Nehmen');
    expect(vrHint(undefined, undefined, true)).toBe('Zusammenkneifen: Benutzen');
    expect(vrHint('E / Klick: Nehmen')).toBe('Trigger: Nehmen');
  });

  function labelFor(target, hand) {
    const setLabel = vi.fn();
    const rec = { source: { hand }, pt: { target, o: new Vector3(), d: new Vector3(0, 0, -1) } };
    const mode = { hud3d: { setLabel, hideLabel() {} }, aimHand: 'right', recFor: () => rec, app: { items: { get: () => ({ Name: 'Film' }) } } };
    new Pointer(mode).updateLabel();
    return setLabel.mock.calls[0];
  }

  it('Hülle, Interaktion und Handgelenk-Knopf', () => {
    expect(labelFor({ kind: 'cover', t: 1, info: { itemId: 'a' } }, false)[1]).toBe('Trigger: Nehmen · Grip: Greifen');
    expect(labelFor({ kind: 'cover', t: 1, info: { itemId: 'a' } }, true)[1]).toBe('Zusammenkneifen: Nehmen');
    expect(labelFor({ kind: 'ia', t: 1, ia: { label: 'PC', hint: 'E / Klick: Suchen' } }, true)[1]).toBe('Zusammenkneifen: Suchen');
    expect(labelFor({ kind: 'wrist', t: 1 }, true)[1]).toBe('Zusammenkneifen: Öffnen');
    expect(labelFor({ kind: 'wrist', t: 1 }, false)[1]).toBe('Trigger: Öffnen');
  });
});

describe('B072 Panel-Listen scrollbar', () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ label: `Treffer ${i}`, onSelect() {} }));
  const spec = (n) => ({ title: 'Kassen-PC · Suche', lines: ['a'], list: { rows: rows(n), visible: 6 }, input: { value: '', placeholder: 'x' }, buttons: [{ label: 'Zu' }] });

  it('scrollable stützt sich auf das Layout: 6 Treffer bei gekürzter Liste scrollen', () => {
    const L6 = layoutPanel(spec(6));
    expect(L6.height).toBeLessThanOrEqual(MAX_H + 1);
    expect(L6.maxScroll).toBeGreaterThan(0);
    const h = openPanel(spec(6), { camera: new PerspectiveCamera() });
    expect(h.maxScroll).toBeGreaterThan(0);
    expect(scrollable(h)).toBe(true);
    h.close();
    const h5 = openPanel(spec(3), { camera: new PerspectiveCamera() });
    expect(scrollable(h5)).toBe(false);
    h5.close();
  });

  it('▲/▼-Treffer (für Hände) scrollen die Liste zeilenweise', () => {
    const s = spec(8);
    const L = layoutPanel(s);
    const kinds = L.hits.filter((x) => x.kind === 'scroll').map((x) => x.ref).sort();
    expect(kinds).toEqual([-1, 1]);
    expect(layoutPanel(spec(2)).hits.some((x) => x.kind === 'scroll')).toBe(false);
    const h = openPanel(s, { camera: new PerspectiveCamera() });
    const W = 900;
    const Hh = Math.min(MAX_H, Math.ceil(L.height));
    const r0 = L.hits.find((x) => x.kind === 'row' && x.ref === 0);
    const uv = { x: (r0.x + r0.w / 2) / W, y: 1 - (r0.y + r0.h / 2) / Hh };
    expect(h.hit(uv).ref).toBe(0);
    expect(h.activate({ kind: 'scroll', ref: 1 })).toBe(true);
    expect(h.hit(uv).ref).toBe(1);
    h.activate({ kind: 'scroll', ref: -1 });
    expect(h.hit(uv).ref).toBe(0);
    h.close();
  });
});
