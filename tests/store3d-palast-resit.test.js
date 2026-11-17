// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scene } from 'three';
import { PalastCinema } from '../src/js/store3d/cinema/palast.js';
import { buildStubSaal } from '../src/js/store3d/cinema/saal-stub.js';
import { wrapDeps } from '../src/js/store3d/xr/guard.js';

const mkVideo = (o = {}) => ({ readyState: 4, currentTime: 0, paused: false, ended: false, videoWidth: 1920, videoHeight: 1080, ...o });

let order;

function setup({ video = null, state = {}, xr = null } = {}) {
  order = [];
  const calls = { toasts: [], teleport: [], freeze: [], fly: [], duck: [], stop: 0 };
  const dc = {
    v: video,
    st: { route: 'video', phase: 'loading', time: 0, duration: 100, title: 'Testfilm', hasPrev: false, hasNext: false, upNext: null, error: null, volume: 1, muted: false, reloading: false, ...state },
    video() { return dc.v; },
    state() { return dc.st; },
    onVideo: vi.fn(() => vi.fn()),
    onChange: vi.fn(() => vi.fn()),
    subtitles: () => null,
    stop: vi.fn(async () => { calls.stop++; return true; }),
    togglePause: vi.fn(), seekBy: vi.fn(), seekTo: vi.fn(), next: vi.fn(), prev: vi.fn(), setVolume: vi.fn(), toggleMute: vi.fn(),
    tracks: vi.fn(async () => []), selectTrack: vi.fn(async () => true),
  };
  const raw = {
    cinema: dc,
    toast: vi.fn((t) => calls.toasts.push(t)),
    play: vi.fn(() => { order.push('play'); return Promise.resolve(true); }),
    onCinema2d: vi.fn((s) => order.push(`notify:${s.active ? 'on' : 'off'}${s.full ? ':full' : ''}`)),
  };
  let overlay = null;
  const ctx = {
    player: {
      getPose: () => ({ x: 5, z: 5, yaw: 0.3, pitch: 0.1 }),
      teleport: (...a) => calls.teleport.push(a),
      freeze: (on) => calls.freeze.push(on),
      camera: { flyTo: vi.fn((...a) => { calls.fly.push(a); return Promise.resolve(true); }), release: vi.fn() },
    },
    overlay: {
      open: vi.fn((el, o) => { overlay = { el, onClose: o.onClose }; document.body.appendChild(el); }),
      close: vi.fn(() => { const ov = overlay; overlay = null; if (ov) { ov.el.remove(); ov.onClose(); } }),
      isOpen: () => Boolean(overlay),
    },
    use: () => ({ duck: (k, on) => calls.duck.push([k, on]) }),
    provide: vi.fn(),
  };
  const app = {
    engine: { setRenderEnabled: vi.fn(), scene: new Scene() },
    player: { x: 5, z: 5 },
    mods: { ctx },
    desktop: { attach: vi.fn(), detach: vi.fn() },
    holdview: { close: vi.fn() },
    xr,
    suspended: false,
  };
  const cin = new PalastCinema(app);
  app.cinema2d = cin;
  app.deps = wrapDeps(raw, () => app.xr, () => app.cinema2d);
  const saal = buildStubSaal({ x: 5, z: 5, yaw: 0 });
  app.engine.scene.add(saal.root);
  cin.attachSaal(saal);
  return { cin, app, dc, raw, calls, saal, ctx };
}

function run(c, from, ms, { play = true, step = 50 } = {}) {
  let now = from;
  for (; now < from + ms; now += step) {
    if (play && c.dc.v) c.dc.v.currentTime += step / 1000;
    c.cin.tick(step / 1000, now);
  }
  return now;
}

const ITEM = { Id: 'i1', Name: 'Testfilm' };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('Palast: erneutes Hinsetzen nach Aufstehen', () => {
  it('gleicher Film: sameFilm wahr, sit + resumeAfterStand setzen nur fort (kein play)', () => {
    const c = setup({ video: mkVideo(), state: { phase: 'playing' } });
    c.cin.play(ITEM);
    run(c, 0, 1500);
    c.cin.stand();
    expect(c.dc.togglePause).toHaveBeenCalledTimes(1);
    c.dc.st.phase = 'paused';
    run(c, 1500, 200, { play: false });
    expect(c.cin.sameFilm({ Id: 'i1' })).toBe(true);
    expect(c.cin.sameFilm({ Id: 'andere' })).toBe(false);
    expect(c.cin.sit('stub')).toBe(true);
    expect(c.cin.resumeAfterStand()).toBe(true);
    expect(c.dc.togglePause).toHaveBeenCalledTimes(2);
    expect(c.raw.play).toHaveBeenCalledTimes(1);
    expect(c.cin.resumeAfterStand()).toBe(false); // idempotent
    c.cin.dispose();
  });

  it('selbst pausiert, dann aufgestanden: kein automatisches Fortsetzen', () => {
    const c = setup({ video: mkVideo(), state: { phase: 'playing' } });
    c.cin.play(ITEM);
    run(c, 0, 1500);
    c.dc.st.phase = 'paused';
    run(c, 1500, 200, { play: false });
    c.cin.stand();
    c.cin.sit('stub');
    expect(c.cin.resumeAfterStand()).toBe(false);
    expect(c.dc.togglePause).not.toHaveBeenCalled();
    c.cin.dispose();
  });

  it('Film zu Ende oder Kino verlassen: sameFilm falsch', () => {
    const c = setup({ video: mkVideo(), state: { phase: 'playing' } });
    c.cin.play(ITEM);
    run(c, 0, 1500);
    c.cin.stand();
    c.dc.st.phase = 'ended';
    expect(c.cin.sameFilm({ Id: 'i1' })).toBe(false);
    c.cin.leave('x');
    expect(c.cin.sameFilm({ Id: 'i1' })).toBe(false);
    c.cin.dispose();
  });
});
