// @vitest-environment jsdom
// Kino: Untertitel erst mit Videobild, Status beim Nachladen, Platzwechsel, Abbruch, Bedienpanel, Sitzungsende, Spurwahl.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Group, Scene, PerspectiveCamera } from 'three';
import { Cinema } from '../src/js/store3d/cinema/cinema.js';
import { createControls } from '../src/js/store3d/cinema/controls.js';
import { createFade } from '../src/js/store3d/xr/fade.js';

const makeVideo = (over = {}) => ({ readyState: 4, currentTime: 0, paused: false, ended: false, videoWidth: 1920, videoHeight: 1080, ...over });

function setup({ video = null, state = {}, fade = false } = {}) {
  const dc = {
    v: video,
    st: { route: 'video', phase: 'loading', time: 0, duration: 100, title: 'Testfilm', hasPrev: false, hasNext: false, upNext: null, error: null, volume: 1, muted: false, reloading: false, ...state },
    video() { return dc.v; },
    state() { return dc.st; },
    onVideo() { return () => {}; },
    onChange() { return () => {}; },
    subtitles: vi.fn(() => ({ kind: 'text', text: 'Satz 1' })),
    stop: vi.fn(async () => true),
    togglePause: vi.fn(), seekBy: vi.fn(), seekTo: vi.fn(), next: vi.fn(), prev: vi.fn(), setVolume: vi.fn(), upNext: vi.fn(),
    tracks: vi.fn(async () => []), selectTrack: vi.fn(async () => true),
  };
  const engine = { rig: new Group(), storeScene: new Scene(), camera: new PerspectiveCamera(), setScene: vi.fn(), setFoveation: vi.fn(), renderer: { xr: { getCamera: () => new PerspectiveCamera() } } };
  engine.storeScene.add(engine.rig);
  const app = {
    deps: { cinema: dc }, engine,
    player: { x: 0, z: 0, yaw: 0, pitch: 0, teleport: vi.fn() },
    mods: { hook: vi.fn(), ctx: { use: () => ({ duck: vi.fn() }) } },
    holdview: { close: vi.fn() }, opts: { vr: { seat: 'mid' } }, savePrefs: vi.fn(), qualitySetting: 'mid',
  };
  const cin = new Cinema(app);
  const calls = { leave: [], toasts: [], panels: [] };
  const f = fade ? createFade(engine.camera) : null;
  app.xr = {
    presenting: Boolean(fade), fade: f, floor: true,
    savePrefs: vi.fn(),
    openPanel: (spec) => { const h = { open: true, spec, update(s) { h.spec = s; }, close() { if (!h.open) return; h.open = false; if (h.spec.onClose) h.spec.onClose(); } }; calls.panels.push(h); return h; },
    toast: (t) => calls.toasts.push(t),
    closePanels: () => { for (const p of calls.panels) p.close(); },
    leaveCinema: (r, c) => { calls.leave.push(r); return cin.leave(r, c); },
  };
  return { cin, app, dc, calls, engine, f };
}

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

describe('Untertitel erst mit Videobild', () => {
  it('ohne Frame wird subs.set(null) statt Cue gesetzt', () => {
    const c = setup({ video: makeVideo({ readyState: 1 }), state: { phase: 'loading' } });
    c.cin.enter({ Name: 'X' });
    const spy = vi.spyOn(c.cin.subs, 'set');
    run(c, 0, 600, { play: false });
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls.every((a) => a[0] === null)).toBe(true);
    c.cin.dispose();
  });
});

describe('Status beim Nachladen', () => {
  it('zeigt Titel der neuen Folge und neuen Text, sobald das Bild fehlt', () => {
    const c = setup({ video: makeVideo(), state: { phase: 'playing' } });
    c.cin.enter({ Name: 'Folge 1' });
    const now = run(c, 0, 1500);
    expect(c.cin.diag().phase).toBe('playing');
    const spy = vi.spyOn(c.cin.screen, 'setStatus');
    c.dc.st = { ...c.dc.st, title: 'Folge 2' };
    c.dc.v.readyState = 1;
    run(c, now, 400, { play: false });
    expect(spy).toHaveBeenCalledWith({ title: 'Folge 2', text: 'Wird geladen …', sub: '' });
    c.cin.dispose();
  });
});

describe('Platzwechsel speichert über XrMode.savePrefs', () => {
  it('ruft xr.savePrefs, nicht app.savePrefs', () => {
    const c = setup();
    c.cin._active = true;
    c.cin.setSeat('front');
    expect(c.app.xr.savePrefs).toHaveBeenCalled();
    expect(c.app.savePrefs).not.toHaveBeenCalled();
  });
});

describe('Doppelauslösung backToStore', () => {
  it('stop() wird nur einmal aufgerufen', async () => {
    const c = setup({ video: makeVideo(), state: { phase: 'playing' } });
    c.cin.enter({});
    run(c, 0, 1500);
    c.cin.backToStore();
    c.cin.backToStore();
    await vi.advanceTimersByTimeAsync(10);
    expect(c.dc.stop).toHaveBeenCalledTimes(1);
  });
});

describe('Abbruch vor Player-Start', () => {
  it('ohne Video/Route wird der Abbruch vorgemerkt und erst mit dem Video ausgeführt', async () => {
    const c = setup({ video: null, state: { phase: 'loading', route: 'home' } });
    c.cin.enter({});
    run(c, 0, 400, { play: false });
    c.cin.backToStore();
    await vi.advanceTimersByTimeAsync(10);
    expect(c.dc.stop).not.toHaveBeenCalled();
    expect(c.cin.active).toBe(true);
    c.dc.v = makeVideo({ readyState: 1 });
    c.dc.st = { ...c.dc.st, route: 'video' };
    run(c, 400, 600, { play: false });
    await vi.advanceTimersByTimeAsync(10);
    expect(c.dc.stop).toHaveBeenCalledTimes(1);
    expect(c.calls.leave).toEqual(['stop']);
  });
});

describe('Bedienpanel nach blurred, hidden, visible', () => {
  it('Panel kommt zurück', () => {
    const c = setup({ video: makeVideo(), state: { phase: 'paused' } });
    c.cin.enter({});
    run(c, 0, 1500, { play: false });
    expect(c.cin.controls.visible).toBe(true);
    c.cin.onVisibility('visible-blurred');
    c.cin.onVisibility('hidden');
    c.cin.onVisibility('visible');
    expect(c.cin.controls.visible).toBe(true);
    c.cin.dispose();
  });
});

describe('Sitzungsende während Blende', () => {
  it('leave(sessionend) baut sofort ab, auch wenn ein Verlassen auf die Blende wartet', async () => {
    const c = setup({ video: makeVideo(), state: { phase: 'playing' }, fade: true });
    c.cin.enter({});
    expect(c.cin.active).toBe(true);
    c.cin.leave('stop');
    c.cin.leave('sessionend');
    expect(c.cin.active).toBe(false);
    c.app.xr.fade.dispose();
    await vi.advanceTimersByTimeAsync(10);
    expect(c.cin.active).toBe(false);
    c.app.xr.presenting = false;
    c.cin.enter({});
    expect(c.cin.active).toBe(true);
    c.cin.dispose();
  });

  it('entsorgte Blende löst to() sofort auf', async () => {
    const f = createFade(new PerspectiveCamera());
    f.dispose();
    await expect(f.to(1, 250)).resolves.toBeUndefined();
  });
});

describe('Spurwahl wird nicht vom Bedienpanel verdeckt', () => {
  function mk() {
    const panels = [];
    const openPanel = (spec) => { const h = { open: true, spec, update() {}, close() { if (!h.open) return; h.open = false; if (spec.onClose) spec.onClose(); } }; panels.push(h); return h; };
    const cinema = { tracks: vi.fn(async () => []), selectTrack: vi.fn(async () => true) };
    const api = createControls({ openPanel, cinema, getState: () => ({ phase: 'paused', title: 'T' }), getSeat: () => 'mid', onSeat() {}, onBack() {}, toast() {} });
    return { api, panels };
  }
  it('Bedienpanel ist zu, solange die Spurwahl offen ist, und kommt danach zurück', () => {
    const { api, panels } = mk();
    api.show();
    const main = panels[0];
    api.openTracks('audio');
    expect(main.open).toBe(false);
    expect(api.tracksOpen).toBe(true);
    api.closeTracks();
    expect(panels.length).toBe(3);
    expect(panels[2].open).toBe(true);
    expect(api.visible).toBe(true);
    api.dispose();
  });
  it('hide() während Spurwahl stellt das Bedienpanel nicht zurück', () => {
    const { api, panels } = mk();
    api.show();
    api.openTracks('audio');
    api.hide();
    expect(api.visible).toBe(false);
    expect(panels.length).toBe(2);
  });
});
