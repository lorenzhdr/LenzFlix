// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scene } from 'three';
import { PalastCinema, screenCenterY } from '../src/js/store3d/cinema/palast.js';
import { buildStubSaal, palastTest } from '../src/js/store3d/cinema/saal-stub.js';
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
const lastNotify = (c) => c.raw.onCinema2d.mock.calls.at(-1)[0];

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('PalastCinema', () => {
  it('wantsPlay: nur im Saal oder bei laufendem Kino, nie in VR', () => {
    const c = setup();
    expect(c.cin.wantsPlay()).toBe(true);
    c.app.player.x = 50;
    expect(c.cin.wantsPlay()).toBe(false);
    c.app.player.x = 5;
    c.app.xr = { presenting: true };
    expect(c.cin.wantsPlay()).toBe(false);
    c.app.xr = null;
    c.cin.detachSaal();
    expect(c.cin.wantsPlay()).toBe(false);
  });

  it('(a) sit: freeze, Overlay mit Leiste, Kamerafahrt, Ton gedämpft; zweites sit ist ein No-op', () => {
    const c = setup();
    expect(c.cin.sit('stub')).toBe(true);
    expect(c.calls.freeze).toEqual([true]);
    expect(c.ctx.overlay.open).toHaveBeenCalledTimes(1);
    expect(c.ctx.overlay.open.mock.calls[0][0].classList.contains('lfx-palast-bar')).toBe(true);
    expect(c.calls.fly).toHaveLength(1);
    expect(c.calls.fly[0][0]).toMatchObject({ x: 5, z: 5 });
    expect(c.calls.duck).toContainEqual(['cinema', true]);
    expect(c.cin.sit('stub')).toBe(true);
    expect(c.ctx.overlay.open).toHaveBeenCalledTimes(1);
    c.cin.dispose();
  });

  it('Platzwechsel bei laufendem Film: Kamera fliegt auf den neuen Platz, kein Neustart, Leiste und Phase bleiben', () => {
    const c = setup({ video: mkVideo(), state: { phase: 'playing' } });
    c.saal.seats.push({ id: 'B2', x: 7, y: 1.15, z: 6, yaw: 0 });
    c.cin.sit('stub');
    c.cin.play(ITEM);
    run(c, 0, 1500);
    expect(c.cin.phase).toBe('playing');
    const plays = c.raw.play.mock.calls.length;
    const notifies = c.raw.onCinema2d.mock.calls.length;
    expect(c.cin.sit('B2')).toBe(true);
    expect(c.cin.seatId).toBe('B2');
    expect(c.calls.fly).toHaveLength(2);
    expect(c.calls.fly[1][0]).toMatchObject({ x: 7, z: 6 });
    expect(c.ctx.overlay.open).toHaveBeenCalledTimes(1);
    expect(c.calls.freeze).toEqual([true]);
    expect(c.raw.play.mock.calls.length).toBe(plays);
    expect(c.raw.onCinema2d.mock.calls.length).toBe(notifies);
    expect(c.cin.phase).toBe('playing');
    expect(c.cin.seated).toBe(true);
    c.cin.sit('B2');
    expect(c.calls.fly).toHaveLength(2); // derselbe Platz: No-op
    c.cin.dispose();
  });

  it('(b) play: onCinema2d({active}) kommt VOR dem echten deps.play, mit noCover; Leinwand hängt am Saal-Anker', () => {
    const c = setup();
    c.cin.play(ITEM, { resume: true });
    expect(order).toEqual(['notify:on', 'play']);
    expect(c.raw.play).toHaveBeenCalledWith(ITEM, { resume: true, noCover: true });
    expect(c.cin.active).toBe(true);
    expect(c.cin.seated).toBe(true); // setzt sich automatisch
    expect(c.saal.anchor.children.some((o) => o.name === 'lfx-cinema-screen')).toBe(true);
    expect(c.app.holdview.close).toHaveBeenCalledWith(false);
    c.cin.dispose();
  });

  it('(c) deps.play false oder Fehler → leave(fail, P)', async () => {
    const c = setup();
    c.raw.play.mockImplementationOnce(() => Promise.resolve(false));
    await c.cin.play(ITEM);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.cin.active).toBe(false);
    expect(c.calls.toasts).toContain('Kino konnte nicht starten (P)');
    expect(lastNotify(c)).toEqual({ active: false, full: false });
    const d = setup();
    d.raw.play.mockImplementationOnce(() => Promise.reject(new Error('x')));
    await d.cin.play(ITEM).catch(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(d.cin.active).toBe(false);
  });

  it('(d) Phasen starting → playing → paused', () => {
    const c = setup({ video: mkVideo(), state: { phase: 'playing' } });
    c.cin.play(ITEM);
    expect(c.cin.phase).toBe('starting');
    run(c, 0, 1500);
    expect(c.cin.phase).toBe('playing');
    expect(c.cin.diag().videoFrames).toBeGreaterThanOrEqual(3);
    expect(c.saal.log).toContainEqual(['curtain', true]);
    expect(c.saal.log).toContainEqual(['light', 0.08]);
    c.dc.st = { ...c.dc.st, phase: 'paused' };
    run(c, 1500, 400, { play: false });
    expect(c.cin.phase).toBe('paused');
    expect(c.saal.log).toContainEqual(['light', 0.35]);
    c.cin.dispose();
  });

  it('pausierter Start (Autoplay gesperrt): „Starten“ in der Leiste, Klick = togglePause', () => {
    const c = setup({ video: mkVideo({ paused: true }), state: { phase: 'paused' } });
    c.cin.play(ITEM);
    run(c, 0, 3000, { play: false });
    expect(c.cin.phase).toBe('paused');
    expect(c.cin.startPending).toBe(true);
    const b = [...document.querySelectorAll('.lfx-palast-btn')].find((x) => x.textContent === 'Starten');
    expect(b).toBeTruthy();
    b.click();
    expect(c.dc.togglePause).toHaveBeenCalledTimes(1);
    c.cin.dispose();
  });

  it('(e) T1 ohne Player-Seite: aufstehen, Toast, Kino verlassen', async () => {
    const c = setup({ state: { route: 'home', phase: 'idle' } });
    c.cin.play(ITEM);
    run(c, 0, 26000, { play: false });
    expect(c.cin.phase).toBe('failed');
    await vi.advanceTimersByTimeAsync(2500);
    expect(c.cin.active).toBe(false);
    expect(c.calls.toasts).toContain('Kino konnte nicht starten (T1)');
    expect(c.calls.teleport.at(-1)).toEqual([5, 5, 0, 0]);
    expect(c.calls.freeze.at(-1)).toBe(false);
  });

  it('(e) T1 auf der Player-Seite / T2 / D: Rückfall auf Vollbild mit Hinweis', () => {
    const t1 = setup({ state: { route: 'video', phase: 'loading' } });
    t1.cin.play(ITEM);
    run(t1, 0, 26000, { play: false });
    expect(t1.cin.phase).toBe('fallback');
    expect(t1.cin.full).toBe(true);
    expect(lastNotify(t1)).toEqual({ active: true, full: true });
    expect(t1.calls.toasts).toContain('Leinwand nicht verfügbar (T1)');
    expect(t1.app.engine.setRenderEnabled).toHaveBeenLastCalledWith(false);
    t1.cin.dispose();

    const t2 = setup({ video: mkVideo({ readyState: 1 }), state: { phase: 'loading' } });
    t2.cin.play(ITEM);
    run(t2, 0, 16000, { play: false });
    expect(t2.cin.diag().fallbackCode).toBe('T2');
    expect(t2.calls.toasts).toContain('Leinwand nicht verfügbar (T2)');
    t2.cin.dispose();

    const d = setup({ video: mkVideo({ readyState: 1 }), state: { phase: 'loading' } });
    d.cin.play(ITEM);
    d.dc.st = { ...d.dc.st, phase: 'error', error: 'Fehler', reloading: false };
    run(d, 0, 300, { play: false });
    expect(d.cin.diag().fallbackCode).toBe('D');
    expect(d.cin.full).toBe(true);
    d.cin.dispose();
  });

  it('(f) Leinwand liefert nur Schwarz → Vollbild, nur einmal je Lauf', () => {
    const data = new Uint8ClampedArray(16 * 9 * 4).fill(0);
    const g = new Proxy({}, { get: (t, k) => (k === 'getImageData' ? () => ({ data }) : (k in t ? t[k] : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g);
    const c = setup({ video: mkVideo(), state: { phase: 'playing' } });
    c.cin.play(ITEM);
    run(c, 0, 9000);
    expect(c.cin.full).toBe(false);
    run(c, 9000, 5000);
    expect(c.cin.full).toBe(true);
    expect(c.calls.toasts).toContain('Leinwand nicht verfügbar');
    const n = c.calls.toasts.filter((t) => t === 'Leinwand nicht verfügbar').length;
    expect(c.cin.setFull(false)).toBe(true);
    run(c, 14000, 12000);
    expect(c.cin.full).toBe(false); // pendelt nicht zurück
    expect(c.calls.toasts.filter((t) => t === 'Leinwand nicht verfügbar')).toHaveLength(n);
    c.cin.dispose();
    vi.restoreAllMocks();
  });

  it('(g) Aufstehen pausiert, active bleibt wahr, Spieler steht am Gang', () => {
    const c = setup({ video: mkVideo(), state: { phase: 'playing' } });
    c.cin.play(ITEM);
    run(c, 0, 1500);
    expect(c.cin.stand()).toBe(true);
    expect(c.dc.togglePause).toHaveBeenCalledTimes(1);
    expect(c.cin.active).toBe(true);
    expect(c.cin.seated).toBe(false);
    expect(c.ctx.player.camera.release).toHaveBeenCalled();
    expect(c.calls.teleport.at(-1)).toEqual([5, 5, 0, 0]);
    expect(c.calls.freeze.at(-1)).toBe(false);
    expect(document.querySelector('.lfx-palast-bar')).toBeNull();
    expect(c.calls.duck.at(-1)).toEqual(['cinema', false]);
    expect(c.cin.stand()).toBe(false);
    c.cin.dispose();
  });

  it('(h) Route home → leave(home): Spieler am Gang, Hülle benachrichtigt, Toast; Filmende → „Abspann vorbei“', () => {
    const c = setup({ video: mkVideo(), state: { phase: 'playing' } });
    c.cin.play(ITEM);
    run(c, 0, 1500);
    c.dc.st = { ...c.dc.st, route: 'home', phase: 'ended', time: 100 };
    run(c, 1500, 400, { play: false });
    expect(c.cin.active).toBe(false);
    expect(lastNotify(c)).toEqual({ active: false, full: false });
    expect(c.calls.toasts).toContain('Abspann vorbei');
    expect(c.calls.teleport.at(-1)).toEqual([5, 5, 0, 0]);
    expect(c.cin.screen).toBeNull();
    expect(c.saal.anchor.children.some((o) => o.name === 'lfx-cinema-screen')).toBe(false);
    const x = setup({ video: mkVideo(), state: { phase: 'playing' } });
    x.cin.play(ITEM);
    run(x, 0, 1500);
    x.dc.st = { ...x.dc.st, route: 'home', time: 10 };
    run(x, 1500, 400, { play: false });
    expect(x.calls.toasts).toContain('Film beendet');
  });

  it('(i) setFull schaltet das Rendern, die Desktop-Steuerung und meldet die Hülle; leave stellt alles her', () => {
    const c = setup({ video: mkVideo(), state: { phase: 'playing' } });
    c.cin.play(ITEM);
    run(c, 0, 1500);
    expect(c.cin.setFull(true)).toBe(true);
    expect(c.app.engine.setRenderEnabled).toHaveBeenLastCalledWith(false);
    expect(c.app.desktop.detach).toHaveBeenCalledTimes(1);
    expect(lastNotify(c)).toEqual({ active: true, full: true });
    expect(c.cin.diag().renderEnabled).toBe(false);
    expect(c.cin.setFull(false)).toBe(true);
    expect(c.app.engine.setRenderEnabled).toHaveBeenLastCalledWith(true);
    expect(c.app.desktop.attach).toHaveBeenCalledTimes(1);
    expect(lastNotify(c)).toEqual({ active: true, full: false });
    c.cin.setFull(true);
    c.cin.leave('home');
    expect(c.app.engine.setRenderEnabled).toHaveBeenLastCalledWith(true);
    expect(c.app.desktop.attach).toHaveBeenCalledTimes(2);
    expect(c.cin.full).toBe(false);
    expect(c.cin.setFull(true)).toBe(false); // nicht aktiv
  });

  it('Wächter: aktiv solange das Kino läuft (auch stehend), im Vollbild aus; Leertaste pausiert nur sitzend', () => {
    const c = setup({ video: mkVideo(), state: { phase: 'playing' } });
    const seen = vi.fn();
    document.addEventListener('keydown', seen);
    c.cin.play(ITEM);
    run(c, 0, 1500);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
    expect(seen).not.toHaveBeenCalled();
    expect(c.dc.togglePause).toHaveBeenCalledTimes(1);
    c.cin.setFull(true);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
    expect(seen).toHaveBeenCalledTimes(1);
    c.cin.setFull(false);
    c.cin.stand({ pause: false });
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f', bubbles: true, cancelable: true }));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(c.dc.togglePause).toHaveBeenCalledTimes(1);
    c.cin.dispose();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f', bubbles: true, cancelable: true }));
    expect(seen).toHaveBeenCalledTimes(2);
    document.removeEventListener('keydown', seen);
  });

  it('Esc (desktop.js → overlayClose) pausiert ebenfalls: der Pfad läuft direkt über das Overlay', () => {
    const c = setup({ video: mkVideo(), state: { phase: 'playing' } });
    c.cin.play(ITEM);
    run(c, 0, 1500);
    c.ctx.overlay.close();
    expect(c.dc.togglePause).toHaveBeenCalledTimes(1);
    expect(c.cin.seated).toBe(false);
    expect(c.cin.active).toBe(true);
    c.cin.dispose();
  });

  it('nach „Zurück ins Kino“ (Rückfall beendet) gelten wieder die Übergänge; Aufstehen pausiert nach frischem Zustand', () => {
    const data = new Uint8ClampedArray(16 * 9 * 4).fill(0);
    const g = new Proxy({}, { get: (t, k) => (k === 'getImageData' ? () => ({ data }) : (k in t ? t[k] : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g);
    const c = setup({ video: mkVideo(), state: { phase: 'playing' } });
    c.cin.play(ITEM);
    run(c, 0, 14000);
    expect(c.cin.phase).toBe('fallback');
    c.cin.setFull(false);
    run(c, 14000, 600);
    expect(c.cin.phase).toBe('playing');
    expect(c.saal.log).toContainEqual(['light', 0.08]);
    c.cin.stand();
    expect(c.dc.togglePause).toHaveBeenCalledTimes(1);
    c.cin.dispose();
    vi.restoreAllMocks();
  });

  it('Aufstehen im Startzustand (Adapter-Phase starting, Jellyfin spielt schon) pausiert ebenfalls', () => {
    const c = setup({ video: mkVideo({ readyState: 1 }), state: { phase: 'playing' } });
    c.cin.play(ITEM);
    run(c, 0, 200, { play: false });
    expect(c.cin.phase).toBe('starting');
    c.cin.stand();
    expect(c.dc.togglePause).toHaveBeenCalledTimes(1);
    c.cin.dispose();
  });

  it('Saal verlassen: stehend außerhalb von bounds → Film stoppen und Kino verlassen; sitzend/Vollbild nie', async () => {
    const c = setup({ video: mkVideo(), state: { phase: 'playing' } });
    c.cin.play(ITEM);
    run(c, 0, 1500);
    c.app.player.x = 50; // sitzend: egal
    run(c, 1500, 200);
    expect(c.cin.active).toBe(true);
    c.cin.setFull(true);
    run(c, 1700, 200);
    expect(c.cin.active).toBe(true); // Vollbild: egal
    c.cin.setFull(false);
    c.cin.stand({ pause: false });
    c.app.player.x = 5;
    run(c, 1900, 200);
    expect(c.cin.active).toBe(true); // im Saal (aisle liegt in bounds)
    c.app.player.x = 50;
    run(c, 2100, 200);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.dc.stop).toHaveBeenCalled();
    expect(c.cin.active).toBe(false);
    expect(c.calls.toasts).toContain('Film beendet');
  });

  it('Hintergrund-Tab: große Zeitlücke löst kein falsches T2 aus', () => {
    const c = setup({ video: mkVideo({ readyState: 1 }), state: { phase: 'loading' } });
    c.cin.play(ITEM);
    run(c, 0, 1000, { play: false });
    c.cin.tick(0.016, 21000);
    expect(c.cin.phase).toBe('starting');
    c.cin.tick(0.016, 21050);
    expect(c.cin.phase).toBe('starting');
    c.cin.dispose();
  });

  it('Saal verlassen: stopAndRelease stoppt Jellyfin und verlässt das Kino', async () => {
    const c = setup({ video: mkVideo(), state: { phase: 'playing' } });
    c.cin.play(ITEM);
    run(c, 0, 1500);
    await c.cin.stopAndRelease();
    expect(c.dc.stop).toHaveBeenCalled();
    expect(c.cin.active).toBe(false);
  });

  it('(j) dispose räumt Abmelder, Timer, Leiste, Wächter und Saal ab', () => {
    const c = setup({ video: mkVideo(), state: { phase: 'playing' } });
    c.cin.play(ITEM);
    run(c, 0, 1500);
    const off = c.dc.onVideo.mock.results[0].value;
    const offC = c.dc.onChange.mock.results[0].value;
    c.cin.dispose();
    expect(off).toHaveBeenCalled();
    expect(offC).toHaveBeenCalled();
    expect(c.cin.timers.size).toBe(0);
    expect(document.querySelector('.lfx-palast-bar')).toBeNull();
    expect(c.cin.guard).toBeNull();
    expect(c.cin.saal).toBeNull();
    expect(c.cin.active).toBe(false);
    expect(c.cin.wantsPlay()).toBe(false);
    c.cin.tick(0.016, 99999); // tut nichts
  });

  it('(k) getNetState liefert die Form für den Mehrspieler-Modus', () => {
    const c = setup({ video: mkVideo(), state: { phase: 'playing', time: 12.5 } });
    expect(c.cin.getNetState()).toEqual({ active: false, phase: 'idle', seatId: null, time: 0, itemId: null });
    c.cin.play(ITEM);
    expect(c.cin.getNetState()).toMatchObject({ active: true, phase: 'starting', seatId: 'stub', time: 12.5, itemId: 'i1' });
    expect(c.cin.applyRemote({})).toBe(false);
    c.cin.dispose();
  });

  it('VR hat Vorrang: in XR nimmt wrapDeps nie den 2D-Weg', () => {
    const c = setup({ xr: { presenting: true, beforePlay: vi.fn(), leaveCinema: vi.fn(), toast: vi.fn() } });
    c.app.deps.play(ITEM, { resume: false });
    expect(c.app.xr.beforePlay).toHaveBeenCalled();
    expect(c.raw.play).toHaveBeenCalledWith(ITEM, { resume: false });
    expect(c.cin.active).toBe(false);
  });

  it('palastTest (Debug-API): baut Stub-Saal, startet auf Wunsch, dispose räumt ab', () => {
    const c = setup({ video: mkVideo(), state: { phase: 'playing' } });
    c.cin.detachSaal();
    c.app.items = new Map([['i1', ITEM]]);
    const h = palastTest(c.app, { autostart: true });
    expect(h).toBeTruthy();
    expect(c.cin.active).toBe(true);
    expect(c.raw.play).toHaveBeenCalledWith(ITEM, { noCover: true });
    h.dispose();
    expect(c.cin.saal).toBeNull();
    c.cin.dispose();
  });
});

describe('Sitzblick (Q3#4)', () => {
  it('zielt vor dem Bau der Leinwand auf die Leinwandmitte, nicht auf Augenhöhe', () => {
    const opts = { bottom: 1.8, maxW: 10.5, maxH: 4.9 };
    expect(screenCenterY(opts)).toBeCloseTo(1.8 + 4.9 / 2, 5);
    const fake = { screen: null, saal: { anchor: { getWorldPosition: (v) => v.set(7.8, 0, 52.4) }, screenOpts: opts } };
    const t = PalastCinema.prototype._lookTarget.call(fake, { yaw: Math.PI }, { x: 7.5, y: 1.15, z: 46.3 });
    expect(t).toEqual({ x: 7.8, y: expect.closeTo(4.25, 5), z: 52.4 });
  });
});
