// @vitest-environment jsdom
// Reine/kleine Teile des 2D-Kinos: Screen-Optionen, stepVolume, trackBlack, Sitzwahl, Saalgrenzen, Renderschalter.
import { describe, it, expect, vi } from 'vitest';
import { createScreen, fitScreen, SCREEN_DEFAULTS } from '../src/js/store3d/cinema/screen.js';
import { stepVolume, applyVolumeStep, createControls } from '../src/js/store3d/cinema/controls.js';
import { trackBlack, newBlackState, BLACK, createAmbientSampler } from '../src/js/store3d/cinema/ambient.js';
import { inBounds, pickSeat } from '../src/js/store3d/cinema/palast.js';
import { createFeed } from '../src/js/store3d/cinema/feed.js';
import { FAIL, failToast } from '../src/js/store3d/cinema/failcodes.js';

describe('createScreen Optionen', () => {
  it('ohne Argumente: VR-Maße unverändert (16 x 9 m, Maske +1,6/+1,2)', () => {
    const s = createScreen();
    expect(SCREEN_DEFAULTS).toMatchObject({ radius: 14, bottom: 1.5, maxW: 16, maxH: 9, padW: 1.6, padH: 1.2 });
    expect(s.dims.width).toBeCloseTo(16, 5);
    expect(s.dims.height).toBeCloseTo(9, 5);
    expect(s.dims.centerY).toBeCloseTo(1.5 + 4.5, 5);
    const mask = s.group.children.find((c) => c.name === 'lfx-cinema-screen-mask');
    expect(mask.geometry.userData.height).toBeCloseTo(10.2, 5);
    expect(mask.geometry.userData.width).toBeGreaterThan(17);
    s.dispose();
  });

  it('createScreen({ maxW, maxH, bottom, padW }) begrenzt die Fläche', () => {
    const s = createScreen({ radius: 10, bottom: 0.9, maxW: 6, maxH: 3.4, padW: 0.4, padH: 0.3 });
    expect(s.dims.width).toBeCloseTo(6, 5);
    expect(s.dims.height).toBeCloseTo(3.375, 4);
    expect(s.dims.centerY).toBeCloseTo(0.9 + 3.375 / 2, 4);
    const mask = s.group.children.find((c) => c.name === 'lfx-cinema-screen-mask');
    expect(mask.geometry.userData.height).toBeCloseTo(3.375 + 0.3, 4);
    s.dispose();
  });

  it('fitScreen mit Optionen: schmaleres Format wird durch maxH begrenzt', () => {
    expect(fitScreen(16 / 9, { maxW: 8, maxH: 4.5 })).toMatchObject({ width: 8 });
    const f = fitScreen(2.39, { maxW: 6, maxH: 3.4 });
    expect(f.width).toBeCloseTo(6, 5);
    expect(f.height).toBeCloseTo(6 / 2.39, 5);
    const g = fitScreen(1, { maxW: 6, maxH: 3.4 });
    expect(g.width).toBeCloseTo(3.4, 5);
  });
});

describe('stepVolume (VR-Panel, 2D-Leiste, Tastenwächter)', () => {
  it('10-%-Raster hoch/runter', () => {
    expect(stepVolume({ volume: 0.55 }, 1)).toEqual({ act: 'set', value: 0.6 });
    expect(stepVolume({ volume: 0.5 }, 1)).toEqual({ act: 'set', value: 0.6 });
    expect(stepVolume({ volume: 0.55 }, -1)).toEqual({ act: 'set', value: 0.5 });
    expect(stepVolume({ volume: 0.5 }, -1)).toEqual({ act: 'set', value: 0.4 });
    expect(stepVolume({}, -1)).toEqual({ act: 'set', value: 0.9 }); // fehlend = 100 %
  });

  it('100 % und lauter: stumm → unmute, sonst Toast; 0 % und leiser: Toast', () => {
    expect(stepVolume({ volume: 1, muted: true }, 1)).toEqual({ act: 'unmute' });
    expect(stepVolume({ volume: 1 }, 1)).toEqual({ act: 'toast', text: 'Schon volle Lautstärke' });
    expect(stepVolume({ volume: 0 }, -1)).toEqual({ act: 'toast', text: 'Schon ganz leise' });
  });

  it('VR-Panel (createControls.onVolume) verhält sich wie stepVolume', () => {
    const cinema = { setVolume: vi.fn(), toggleMute: vi.fn() };
    const toast = vi.fn();
    let st = { volume: 1, muted: true, phase: 'playing' };
    let spec;
    const c = createControls({ openPanel: (s) => { spec = s; return { open: true, update(x) { spec = x; }, close() {} }; }, cinema, getState: () => st, getSeat: () => 'mid', onSeat() {}, onBack() {}, toast });
    c.show();
    const btn = (label) => spec.buttons.find((b) => b.label === label);
    btn('Lauter').onSelect();
    expect(cinema.toggleMute).toHaveBeenCalledTimes(1);
    st = { volume: 1, muted: false, phase: 'playing' };
    btn('Lauter').onSelect();
    expect(toast).toHaveBeenCalledWith('Schon volle Lautstärke');
    st = { volume: 0.55, phase: 'playing' };
    btn('Leiser').onSelect();
    expect(cinema.setVolume).toHaveBeenLastCalledWith(0.5);
    c.dispose();
  });

  it('applyVolumeStep gibt die Schritte an die Bridge', () => {
    const cinema = { setVolume: vi.fn(), toggleMute: vi.fn() };
    const toast = vi.fn();
    applyVolumeStep({ act: 'set', value: 0.3 }, cinema, toast);
    applyVolumeStep({ act: 'unmute' }, cinema, toast);
    applyVolumeStep({ act: 'toast', text: 'x' }, cinema, toast);
    expect(cinema.setVolume).toHaveBeenCalledWith(0.3);
    expect(cinema.toggleMute).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('x');
  });
});

describe('trackBlack', () => {
  const black = { r: 0, g: 0, b: 0 };
  it('10 s Videozeit exakt 0 → schwarz, genau einmal', () => {
    const st = newBlackState();
    let fired = 0;
    for (let i = 0; i <= 120; i++) if (trackBlack(black, i * 125, st, { ready: true, currentTime: i * 0.125 })) fired++;
    expect(fired).toBe(1);
    expect(st.fired).toBe(true);
    expect(trackBlack(black, 99999, st, { ready: true, currentTime: 999 })).toBe(false);
  });

  it('ein heller Frame setzt zurück und schaltet die Erkennung für den Lauf ab; ImageData-Form wird gelesen', () => {
    const st = newBlackState();
    const dark = { data: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]) };
    const lit = { data: new Uint8ClampedArray([0, 0, 0, 255, 0, 1, 0, 255]) };
    expect(trackBlack(dark, 0, st, { currentTime: 0 })).toBe(false);
    expect(trackBlack(lit, 3000, st, { currentTime: 3 })).toBe(false);
    expect(st.since).toBeNull();
    expect(st.seen).toBe(true);
    expect(trackBlack(dark, 4000, st, { currentTime: 4 })).toBe(false);
    expect(trackBlack(dark, 20000, st, { currentTime: 20 })).toBe(false); // Film mit schwarzer Szene: nie mehr Alarm
  });

  it('K-BLACK: Farbe gesehen, danach 12 s schwarz → kein Alarm; schwarz ab Start 8 s, dann Farbe → kein Alarm', () => {
    const lit = { r: 0.3, g: 0.2, b: 0.1 };
    const a = newBlackState();
    let fired = 0;
    trackBlack(lit, 0, a, { currentTime: 0 });
    for (let i = 1; i <= 100; i++) if (trackBlack(black, i * 125, a, { currentTime: 1 + i * 0.125 })) fired++;
    expect(fired).toBe(0);
    const b = newBlackState();
    for (let i = 0; i <= 64; i++) if (trackBlack(black, i * 125, b, { currentTime: i * 0.125 })) fired++; // 8 s
    trackBlack(lit, 8200, b, { currentTime: 8.2 });
    for (let i = 0; i < 160; i++) if (trackBlack(black, 8300 + i * 125, b, { currentTime: 8.3 + i * 0.125 })) fired++;
    expect(fired).toBe(0);
    const c = newBlackState(); // iPhone: schwarz ab der ersten Probe, löst nach 10 s Videozeit aus
    expect(trackBlack(black, 0, c, { currentTime: 0 })).toBe(false);
    expect(trackBlack(black, 9900, c, { currentTime: 9.9 })).toBe(false);
    expect(trackBlack(black, 10100, c, { currentTime: 10.1 })).toBe(true);
  });

  it('Videozeit steht (Pause): kein Alarm; nicht bereit: Zähler zurück; nach dem Zeitfenster: kein Alarm', () => {
    const st = newBlackState();
    for (let i = 0; i < 80; i++) expect(trackBlack(black, i * 500, st, { ready: true, currentTime: 2 })).toBe(false);
    const st2 = newBlackState();
    trackBlack(black, 0, st2, { currentTime: 0 });
    trackBlack(black, 100, st2, { ready: false, currentTime: 1 });
    expect(st2.since).toBeNull();
    const st3 = newBlackState();
    trackBlack(black, 0, st3, { currentTime: 0 });
    expect(trackBlack(black, BLACK.WINDOW_MS + 1, st3, { currentTime: 50 })).toBe(false);
  });

  it('getaintetes Video (getImageData wirft) → tainted', () => {
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData() { throw new Error('tainted'); } }) };
    const doc = { createElement: () => canvas };
    const s = createAmbientSampler({ video: { readyState: 4 }, doc });
    expect(s.tainted).toBe(false);
    expect(s.update(0)).toBeNull();
    expect(s.failed).toBe(true);
    expect(s.tainted).toBe(true);
    const none = createAmbientSampler({ video: { readyState: 4 }, doc: { createElement: () => ({ getContext: () => null }) } });
    expect(none.failed).toBe(true);
    expect(none.tainted).toBe(false); // nur kein Canvas-Kontext (jsdom), kein Taint
  });
});

describe('Saal-Helfer', () => {
  it('inBounds: Ecken in beliebiger Reihenfolge, Rand zählt', () => {
    const b = { x0: 5, z0: 8, x1: 1, z1: 2 };
    expect(inBounds(b, 3, 5)).toBe(true);
    expect(inBounds(b, 1, 8)).toBe(true);
    expect(inBounds(b, 0.9, 5)).toBe(false);
    expect(inBounds(null, 0, 0)).toBe(false);
  });

  it('pickSeat: per id, sonst der nächste, ohne Sitze null', () => {
    const seats = [{ id: 'a', x: 0, z: 0 }, { id: 'b', x: 10, z: 0 }, { id: 'c', x: 20, z: 0 }];
    expect(pickSeat(seats, 'c', { x: 0, z: 0 }).id).toBe('c');
    expect(pickSeat(seats, null, { x: 11, z: 1 }).id).toBe('b');
    expect(pickSeat(seats, 'zz', { x: 19, z: 0 }).id).toBe('c');
    expect(pickSeat([], null, null)).toBeNull();
    expect(pickSeat(seats, null, null).id).toBe('a');
  });
});

describe('feed + failcodes', () => {
  it('Intervalle: Video 250 ms, Zustand 200 ms, Untertitel 100 ms; ohne Bridge nichts', () => {
    const d = { video: vi.fn(() => 'v'), state: vi.fn(() => ({ a: 1 })), subtitles: vi.fn(() => 's') };
    const f = createFeed({ getDeps: () => d });
    expect(f.pollVideo(0)).toEqual({ value: 'v' });
    expect(f.pollVideo(249)).toBeNull();
    expect(f.pollVideo(250)).toEqual({ value: 'v' });
    expect(f.pollState(0)).toEqual({ value: { a: 1 } });
    expect(f.pollState(199)).toBeNull();
    expect(f.pollSubs(0)).toEqual({ value: 's' });
    expect(f.pollSubs(99)).toBeNull();
    expect(f.pollSubs(100, true, false)).toEqual({ value: null });
    expect(f.pollSubs(300, false)).toBeNull();
    const none = createFeed({ getDeps: () => null });
    expect(none.pollVideo(0)).toBeNull();
  });

  it('subscribe/unsubscribe', () => {
    const off1 = vi.fn();
    const off2 = vi.fn();
    const d = { onVideo: vi.fn(() => off1), onChange: vi.fn(() => off2) };
    const f = createFeed({ getDeps: () => d });
    f.subscribe({ onVideo() {}, onChange() {} });
    f.unsubscribe();
    expect(off1).toHaveBeenCalledTimes(1);
    expect(off2).toHaveBeenCalledTimes(1);
  });

  it('Fehlercodes', () => {
    expect(Object.keys(FAIL)).toEqual(['P', 'T1', 'T2', 'D', 'B']);
    expect(failToast('T2')).toBe('Kino konnte nicht starten (T2)');
  });
});
