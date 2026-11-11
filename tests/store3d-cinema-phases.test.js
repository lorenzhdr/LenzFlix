// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Group, Scene, PerspectiveCamera } from 'three';
import { Cinema } from '../src/js/store3d/cinema/cinema.js';

function makeVideo(over = {}) {
  return { readyState: 4, currentTime: 0, paused: false, ended: false, videoWidth: 1920, videoHeight: 1080, ...over };
}

function setup({ video = null, state = {} } = {}) {
  const calls = { stop: 0, leave: [], hook: [], duck: [], teleport: [], panels: [], toasts: [] };
  const dc = {
    v: video,
    st: { route: 'video', phase: 'loading', time: 0, duration: 100, title: 'Testfilm', hasPrev: false, hasNext: false, upNext: null, error: null, volume: 1, muted: false, reloading: false, ...state },
    video() { return dc.v; },
    state() { return dc.st; },
    onVideo() { return () => {}; },
    onChange() { return () => {}; },
    subtitles: () => null,
    stop: vi.fn(async () => { calls.stop++; return true; }),
    togglePause: vi.fn(), seekBy: vi.fn(), seekTo: vi.fn(), next: vi.fn(), prev: vi.fn(), setVolume: vi.fn(), upNext: vi.fn(),
    tracks: vi.fn(async () => []), selectTrack: vi.fn(async () => true),
  };
  const engine = {
    rig: new Group(), storeScene: new Scene(), camera: new PerspectiveCamera(),
    setScene: vi.fn(), setFoveation: vi.fn(), renderer: { xr: { getCamera: () => new PerspectiveCamera() } },
  };
  engine.storeScene.add(engine.rig);
  const app = {
    deps: { cinema: dc },
    engine,
    player: { x: 3, z: 4, yaw: 0.5, pitch: 0.1, teleport: (...a) => calls.teleport.push(a) },
    mods: { hook: (n) => calls.hook.push(n), ctx: { use: () => ({ duck: (k, on) => calls.duck.push([k, on]) }) } },
    holdview: { close: vi.fn() },
    opts: { vr: { seat: 'mid' } },
    savePrefs: vi.fn(),
  };
  const cin = new Cinema(app);
  app.xr = {
    presenting: false, fade: null, floor: true,
    openPanel: (spec) => {
      const h = { open: true, spec, update(s) { h.spec = s; }, close() { if (!h.open) return; h.open = false; if (h.spec.onClose) h.spec.onClose(); } };
      calls.panels.push(h);
      return h;
    },
    toast: (t) => calls.toasts.push(t),
    closePanels: () => { for (const p of calls.panels) p.close(); },
    leaveCinema: (r, c) => { calls.leave.push(r); return cin.leave(r, c); },
  };
  return { cin, app, dc, calls, engine };
}

/** tick-Schleife: stepMs je Schritt, Video läuft mit. */
function run(ctx, from, ms, { play = true, step = 50 } = {}) {
  let now = from;
  for (; now < from + ms; now += step) {
    if (play && ctx.dc.v) ctx.dc.v.currentTime += step / 1000;
    ctx.cin.tick(step / 1000, now);
  }
  return now;
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('Cinema Phasen', () => {
  it('enter: Szene, Pose gemerkt, Hülle zu, Module aus; Phase starting', () => {
    const c = setup();
    c.cin.enter({ Name: 'Testfilm' });
    expect(c.cin.active).toBe(true);
    expect(c.cin.diag().phase).toBe('starting');
    expect(c.app.holdview.close).toHaveBeenCalledWith(false);
    expect(c.calls.hook).toContain('onSuspend');
    expect(c.calls.duck).toContainEqual(['cinema', true]);
    expect(c.engine.setScene).toHaveBeenCalledWith(c.cin.hall.scene);
    expect(c.engine.rig.parent).toBe(c.cin.hall.scene);
    expect(c.engine.setFoveation).toHaveBeenCalledWith(0);
    expect(c.cin.hall.curtainOpen).toBe(false);
    c.cin.dispose();
  });

  it('Erfolg: Bild, Zeit läuft, ≥3 Uploads → playing, Vorhang auf, Saallicht gedimmt, Panel sichtbar; Pause heller', () => {
    const c = setup({ video: makeVideo(), state: { phase: 'playing' } });
    c.cin.enter({ Name: 'Testfilm' });
    run(c, 0, 1500);
    expect(c.cin.diag().phase).toBe('playing');
    expect(c.cin.diag().videoFrames).toBeGreaterThanOrEqual(3);
    expect(c.cin.hall.curtainOpen).toBe(true);
    expect(c.cin.hall.houseLightTarget).toBeCloseTo(0.08, 5);
    expect(c.cin.controls.visible).toBe(true);
    c.dc.st = { ...c.dc.st, phase: 'paused' };
    run(c, 1500, 500, { play: false });
    expect(c.cin.diag().phase).toBe('paused');
    expect(c.cin.hall.houseLightTarget).toBeCloseTo(0.35, 5);
    c.cin.dispose();
  });

  it('Panel blendet sich beim Spielen nach 6 s aus, onSelectEmpty schaltet es um', () => {
    const c = setup({ video: makeVideo(), state: { phase: 'playing' } });
    c.cin.enter({});
    let now = run(c, 0, 1500);
    expect(c.cin.controls.visible).toBe(true);
    run(c, now, 7000);
    expect(c.cin.controls.visible).toBe(false);
    c.cin.onSelectEmpty();
    expect(c.cin.controls.visible).toBe(true);
    c.cin.onSelectEmpty();
    expect(c.cin.controls.visible).toBe(false);
    c.cin.dispose();
  });

  it('ohne Player nach 25 s: T1, stop() und leave(fail); Code in Statuszeile und Toast', async () => {
    const c = setup({ video: null, state: { phase: 'loading', route: 'video' } });
    c.cin.enter({ Name: 'X' });
    run(c, 0, 24500, { play: false });
    expect(c.cin.diag().phase).toBe('starting');
    run(c, 24500, 1500, { play: false });
    expect(c.cin.diag().phase).toBe('failed');
    expect(c.cin.diag().failCode).toBe('T1');
    expect(c.calls.toasts).toContain('Kino konnte nicht starten (T1)');
    await vi.advanceTimersByTimeAsync(3000);
    expect(c.calls.stop).toBe(1);
    expect(c.calls.leave).toEqual(['fail']);
    expect(c.cin.active).toBe(false);
  });

  it('Video ohne Fortschritt: nach 15 s T2', () => {
    const v = makeVideo({ readyState: 1 });
    const c = setup({ video: v, state: { phase: 'loading', route: 'video' } });
    c.cin.enter({});
    run(c, 0, 14000, { play: false });
    expect(c.cin.diag().phase).toBe('starting');
    run(c, 14000, 2500, { play: false });
    expect(c.cin.diag().phase).toBe('failed');
    expect(c.cin.diag().failCode).toBe('T2');
    expect(c.calls.toasts).toContain('Kino konnte nicht starten (T2)');
    expect(c.cin.diag().marks.video).toBeDefined();
    expect(c.cin.diag().marks.fail).toBeGreaterThan(14000);
  });

  it('langsamer Start mit Fortschritt (buffered wächst, 15 s Bild) -> kein Fehlschlag, spätes playing; Hinweis nach 8 s', () => {
    const v = makeVideo({ readyState: 1 });
    let buf = 0;
    v.buffered = { length: 1, end: () => buf };
    const c = setup({ video: v, state: { phase: 'loading', route: 'video' } });
    c.cin.enter({ Name: 'X' });
    let now = 0;
    for (; now < 16000; now += 50) {
      buf += 0.05;
      c.cin.tick(0.05, now);
    }
    expect(c.cin.diag().phase).toBe('starting');
    expect(c.cin.prepareShown).toBe(true);
    v.readyState = 4;
    c.dc.st = { ...c.dc.st, phase: 'playing' };
    run(c, now, 1500);
    expect(c.cin.diag().phase).toBe('playing');
    expect(c.calls.leave).toEqual([]);
    c.cin.dispose();
  });

  it('pausierter Start (Autoplay geblockt): nach 1,5 s paused statt Fehlschlag, Panel und Hinweis', () => {
    const v = makeVideo({ paused: true });
    const c = setup({ video: v, state: { phase: 'paused', route: 'video' } });
    c.cin.enter({});
    run(c, 0, 1000, { play: false });
    expect(c.cin.diag().phase).toBe('starting');
    run(c, 1000, 2500, { play: false });
    expect(c.cin.diag().phase).toBe('paused');
    expect(c.cin.hall.curtainOpen).toBe(true);
    expect(c.cin.controls.visible).toBe(true);
    expect(c.calls.toasts.some((t) => t.includes('Weiter'))).toBe(true);
    run(c, 3500, 20000, { play: false });
    expect(c.cin.diag().phase).toBe('paused');
    expect(c.calls.leave).toEqual([]);
    // Nutzer drückt „Weiter“ -> Player spielt -> playing
    v.paused = false;
    c.dc.st = { ...c.dc.st, phase: 'playing' };
    run(c, 23500, 600);
    expect(c.cin.diag().phase).toBe('playing');
    c.cin.dispose();
  });

  it('Fehlerdialog: Code D', () => {
    const c = setup({ video: null, state: { phase: 'error', error: 'Nicht abspielbar', route: 'video' } });
    c.cin.enter({});
    c.cin.tick(0.016, 300);
    expect(c.cin.diag().failCode).toBe('D');
    expect(c.calls.toasts).toContain('Kino konnte nicht starten (D)');
  });

  it('Code aus leave(fail, code) landet im Toast nach dem Verlassen (play()-Fehler P)', async () => {
    const c = setup({ video: null, state: { phase: 'loading', route: 'video' } });
    const jump = vi.fn(async (fn) => { await fn(); });
    c.app.xr.presenting = true;
    c.app.xr.fade = { jump };
    c.cin.enter({});
    await vi.advanceTimersByTimeAsync(10);
    await c.cin.leave('fail', 'P');
    expect(c.cin.diag().failCode).toBe('P');
    expect(c.calls.toasts).toContain('Kino konnte nicht starten (P)');
  });

  it('Fehler-Phase von Jellyfin: sofort failed, stop + leave(fail)', async () => {
    const c = setup({ video: null, state: { phase: 'error', error: 'Nicht abspielbar', route: 'video' } });
    c.cin.enter({});
    c.cin.tick(0.016, 300);
    expect(c.cin.diag().phase).toBe('failed');
    await vi.advanceTimersByTimeAsync(3000);
    expect(c.calls.stop).toBe(1);
    expect(c.calls.leave).toEqual(['fail']);
  });

  it('kein stop(), wenn der Player nie geöffnet wurde', async () => {
    const c = setup({ video: null, state: { phase: 'error', error: 'x', route: 'home' } });
    c.cin.enter({});
    c.cin.tick(0.016, 300);
    await vi.advanceTimersByTimeAsync(3000);
    expect(c.calls.stop).toBe(0);
    expect(c.calls.leave).toEqual(['fail']);
  });

  it('reloading ist kein Fehler (Start und Spiel)', () => {
    const v = makeVideo({ readyState: 0 });
    const c = setup({ video: v, state: { phase: 'loading', reloading: true } });
    c.cin.enter({});
    run(c, 0, 3000, { play: false });
    expect(c.cin.diag().phase).toBe('starting');
    v.readyState = 4;
    c.dc.st = { ...c.dc.st, phase: 'playing', reloading: false };
    run(c, 3000, 1500);
    expect(c.cin.diag().phase).toBe('playing');
    v.readyState = 0;
    c.dc.st = { ...c.dc.st, phase: 'loading', reloading: true };
    run(c, 4500, 3000, { play: false });
    expect(c.cin.diag().phase).toBe('playing');
    expect(c.calls.leave).toEqual([]);
    c.cin.dispose();
  });

  it('Video-Tausch: neues Element → neue Textur; selbes Element (nächste Folge) behält sie', () => {
    const v1 = makeVideo();
    const c = setup({ video: v1, state: { phase: 'playing' } });
    c.cin.enter({});
    run(c, 0, 1500);
    const t1 = c.cin.screen.texture;
    expect(t1).toBeTruthy();
    v1.currentTime = 0;
    c.dc.st = { ...c.dc.st, title: 'Folge 2' };
    run(c, 1500, 500);
    expect(c.cin.screen.texture).toBe(t1);
    expect(c.cin.diag().phase).toBe('playing');
    const v2 = makeVideo();
    c.dc.v = v2;
    run(c, 2000, 600);
    expect(c.cin.screen.video).toBe(v2);
    expect(c.cin.screen.texture).not.toBe(t1);
    c.cin.dispose();
  });

  it('route home nach dem Start: verlässt sich selbst mit home, Pose wiederhergestellt', () => {
    const c = setup({ video: makeVideo(), state: { phase: 'playing' } });
    c.cin.enter({});
    run(c, 0, 1500);
    c.dc.st = { ...c.dc.st, route: 'home' };
    run(c, 1500, 400);
    expect(c.calls.leave).toEqual(['home']);
    expect(c.cin.active).toBe(false);
    expect(c.calls.teleport).toEqual([[3, 4, 0.5, 0.1]]);
    expect(c.calls.hook).toEqual(['onSuspend', 'onResume']);
    expect(c.calls.duck).toContainEqual(['cinema', false]);
    expect(c.engine.rig.parent).toBe(c.engine.storeScene);
    expect(c.engine.setScene).toHaveBeenLastCalledWith(c.engine.storeScene);
    expect(c.engine.setFoveation).toHaveBeenLastCalledWith(1);
    expect(c.cin.screen).toBeNull();
  });

  it('route home VOR dem Start löst kein Verlassen aus', () => {
    const c = setup({ video: null, state: { phase: 'loading', route: 'home' } });
    c.cin.enter({});
    run(c, 0, 2000, { play: false });
    expect(c.calls.leave).toEqual([]);
    expect(c.cin.active).toBe(true);
    c.cin.dispose();
  });

  it('leave ist idempotent', async () => {
    const c = setup({ video: makeVideo(), state: { phase: 'playing' } });
    c.cin.enter({});
    run(c, 0, 1000);
    await c.cin.leave('stop');
    await c.cin.leave('stop');
    await c.cin.leave('home');
    expect(c.calls.hook.filter((h) => h === 'onResume').length).toBe(1);
    expect(c.calls.teleport.length).toBe(1);
    expect(c.cin.active).toBe(false);
    c.cin.tick(0.016, 5000);
  });

  it('mit Schwarzblende: enter/leave über fade.jump; sessionend ohne Fade', async () => {
    const c = setup({ video: makeVideo(), state: { phase: 'playing' } });
    const jump = vi.fn(async (fn) => { await fn(); });
    c.app.xr.presenting = true;
    c.app.xr.fade = { jump };
    c.cin.enter({});
    await vi.advanceTimersByTimeAsync(10);
    expect(jump).toHaveBeenCalledTimes(1);
    expect(c.cin.diag().phase).toBe('starting');
    await c.cin.leave('stop');
    expect(jump).toHaveBeenCalledTimes(2);
    expect(c.cin.active).toBe(false);
    c.cin.enter({});
    await vi.advanceTimersByTimeAsync(10);
    expect(jump).toHaveBeenCalledTimes(3);
    await c.cin.leave('sessionend');
    expect(jump).toHaveBeenCalledTimes(3);
    expect(c.cin.active).toBe(false);
  });

  it('Platz: Pref gespeichert, Sprung setzt den Sitz', async () => {
    const c = setup({ video: makeVideo(), state: { phase: 'playing' } });
    c.cin.enter({});
    run(c, 0, 1000);
    await c.cin.setSeat('back');
    expect(c.app.opts.vr.seat).toBe('back');
    expect(c.app.savePrefs).toHaveBeenCalled();
    expect(c.engine.rig.position.z).toBeCloseTo(16, 3);
    await c.cin.setSeat('front');
    expect(c.engine.rig.position.z).toBeCloseTo(8, 3);
    expect(await c.cin.setSeat('xyz')).toBe(false);
    c.cin.dispose();
  });

  it('menuItems nur im Kino, mit den drei Einträgen', () => {
    const c = setup({ video: makeVideo(), state: { phase: 'playing' } });
    expect(c.cin.menuItems()).toEqual([]);
    c.cin.enter({});
    const items = c.cin.menuItems();
    expect(items.map((i) => i.label)).toEqual(['Zurück in die Videothek', 'Platz: Mitte', 'Kino-Bedienung zeigen']);
    run(c, 0, 1000);
    items[2].onSelect();
    expect(c.cin.controls.visible).toBe(true);
    c.cin.dispose();
  });

  it('Zurück in die Videothek: stop(), dann leave(stop)', async () => {
    const c = setup({ video: makeVideo(), state: { phase: 'playing' } });
    c.cin.enter({});
    run(c, 0, 1000);
    c.cin.menuItems()[0].onSelect();
    await vi.advanceTimersByTimeAsync(10);
    expect(c.calls.stop).toBe(1);
    expect(c.calls.leave).toEqual(['stop']);
  });
});
