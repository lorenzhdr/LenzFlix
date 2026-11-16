// @vitest-environment jsdom
// VR-Menü im Kino: Einträge, Neu ausrichten, Kino-Start während der Rückblende.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Group, Scene, PerspectiveCamera } from 'three';
import { buildMenuSpec } from '../src/js/store3d/xr/menu.js';
import { XrMode } from '../src/js/store3d/xr/mode.js';
import { Cinema } from '../src/js/store3d/cinema/cinema.js';

describe('VR-Menü im Kino', () => {
  const fake = (over = {}) => ({
    app: { opts: { vr: {} }, sound: true, setSound() {}, setQuality() {}, openTerminal: vi.fn() },
    diagOn: false, cinema: null, savePrefs() {}, refreshMenu() {}, closeMenu() {}, recenter: vi.fn(), toast: vi.fn(), exit() {}, setDiag() {},
    ...over,
  });
  const labels = (m) => buildMenuSpec(m).list.rows.map((r) => r.label);

  it('im Kino weder Kassen-PC-Suche noch Größe', () => {
    expect(labels(fake({ inCinema: false }))).toContain('Kassen-PC-Suche');
    const l = labels(fake({ inCinema: true }));
    expect(l).not.toContain('Kassen-PC-Suche');
    expect(l).not.toContain('Größe');
    expect(l).toContain('Neu ausrichten');
  });

  it('jumpTo im Kino teleportiert nicht', async () => {
    const teleport = vi.fn();
    const r = await XrMode.prototype.jumpTo.call({ inCinema: true, app: { player: { yaw: 0, teleport }, layout: null } }, 1, 2);
    expect(r).toBe(false);
    expect(teleport).not.toHaveBeenCalled();
  });

  it('Neu ausrichten meldet Erfolg nur bei echter Neuplatzierung', () => {
    const m = fake({ recenter: vi.fn(() => false) });
    buildMenuSpec(m).list.rows.find((r) => r.label === 'Neu ausrichten').onSelect();
    expect(m.toast).not.toHaveBeenCalled();
    const m2 = fake({ recenter: vi.fn(() => true) });
    buildMenuSpec(m2).list.rows.find((r) => r.label === 'Neu ausrichten').onSelect();
    expect(m2.toast).toHaveBeenCalled();
  });

  it('XrMode.recenter im Kino delegiert an das Kino, sonst placed=false', () => {
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

describe('Cinema.recenter', () => {
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

describe('Kino-Start während der Rückblende', () => {
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

