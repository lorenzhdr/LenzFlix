// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { create } from '../src/js/live/tvmode/entry.js';

const T = Date.UTC(2026, 10, 11, 19, 0, 0);
const now = () => T;
let host;
let inst;
let deps;

function catalog() {
  const raw = { movies: [], series: [], episodes: [], boxsets: [], loadedAt: 0 };
  for (let i = 0; i < 80; i++) raw.movies.push({ Id: 'f' + i, Name: 'Film ' + i, RunTimeTicks: (80 + (i % 40)) * 6e8, Genres: [['Action', 'Komödie', 'Drama', 'Krimi'][i % 4]], OfficialRating: 'G', ProductionYear: 1980 + (i % 40), DateCreated: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() });
  return raw;
}
const mkDeps = (over = {}) => ({
  catalog: catalog(), channelConfig: {}, getBoxSetItems: async () => [],
  onProgress: vi.fn(), onReady: vi.fn(), onFatal: vi.fn(), onStopped: vi.fn(), onPip: vi.fn(),
  ...over,
});
const ready = () => vi.waitFor(() => { if (!(deps.onReady.mock.calls.length || deps.onFatal.mock.calls.length)) throw new Error('warten'); });
async function boot(opts = {}) {
  inst = create(host, deps, { now, fakePlayer: true, ...opts });
  await ready();
  return inst;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="h" class="lfx-tvm"></div>';
  host = document.getElementById('h');
  deps = mkDeps();
  HTMLCanvasElement.prototype.getContext = () => null;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  delete window.__lfxTvm;
  delete window.__lfxTvmDebug;
});
afterEach(() => { if (inst) inst.dispose(); inst = null; vi.useRealTimers(); });

describe('entry', () => {
  it('registriert das Global mit Marker', () => {
    expect(window.LenzFlixTvMode).toMatchObject({ version: 1, mark: '__LFX_TVMODE_ENGINE__' });
    expect(window.LenzFlixTvMode.create).toBe(create);
  });

  it('bootet, meldet Fortschritt und onReady, rendert das Gerüst; kein Start von selbst', async () => {
    await boot();
    expect(deps.onFatal).not.toHaveBeenCalled();
    expect(deps.onProgress).toHaveBeenCalled();
    expect(deps.onProgress.mock.calls.at(-1)[0]).toBe(1);
    expect(host.querySelector('.lfx-tvm__stage')).not.toBeNull();
    expect(inst.isOn()).toBe(false);
    expect(inst.isPip()).toBe(false);
  });

  it('start/stop: isOn, Root-Klassen, onStopped mit Grund', async () => {
    await boot({ lastChannel: 3 });
    inst.start();
    expect(inst.isOn()).toBe(true);
    expect(host.classList.contains('is-on')).toBe(true);
    inst.stop('modal');
    expect(inst.isOn()).toBe(false);
    expect(deps.onStopped).toHaveBeenCalledWith({ reason: 'modal' });
    expect(host.classList.contains('is-on')).toBe(false);
  });

  it('releaseWarm: wirft weder vor dem Boot, noch laufend, noch nach dispose; der laufende Sender bleibt an', async () => {
    inst = create(host, deps, { now, fakePlayer: true });
    expect(() => inst.releaseWarm()).not.toThrow(); // vor dem Boot: noch kein Controller
    await ready();
    inst.start();
    expect(() => inst.releaseWarm()).not.toThrow();
    expect(inst.isOn()).toBe(true);
    inst.dispose();
    expect(() => inst.releaseWarm()).not.toThrow();
  });

  it('start vor onReady wird nachgeholt', async () => {
    inst = create(host, deps, { now, fakePlayer: true });
    inst.start();
    await ready();
    await vi.waitFor(() => { if (!inst.isOn()) throw new Error('noch aus'); });
  });

  it('lfx:play stoppt mit Grund lfx-play', async () => {
    await boot();
    inst.start();
    window.dispatchEvent(new CustomEvent('lfx:play', { detail: { id: 'x' } }));
    expect(inst.isOn()).toBe(false);
    expect(deps.onStopped).toHaveBeenCalledWith({ reason: 'lfx-play' });
  });

  it('Route /video stoppt', async () => {
    await boot();
    inst.start();
    window.location.hash = '#/video';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(inst.isOn()).toBe(false);
    expect(deps.onStopped).toHaveBeenCalledWith({ reason: 'route-video' });
    window.location.hash = '';
  });

  it('getrenntes Video stoppt im Takt (detached)', async () => {
    await boot();
    vi.useFakeTimers();
    inst.start();
    host.querySelector('video').remove();
    vi.advanceTimersByTime(1100);
    expect(inst.isOn()).toBe(false);
    expect(deps.onStopped).toHaveBeenCalledWith({ reason: 'detached' });
  });

  it('suspend ohne PiP stoppt (false); resume dockt an, start geht wieder', async () => {
    await boot();
    inst.start();
    expect(inst.suspend()).toBe(false);
    expect(inst.isOn()).toBe(false);
    expect(deps.onStopped).toHaveBeenCalledWith({ reason: 'leave' });
    const h2 = document.createElement('div');
    h2.className = 'lfx-tvm';
    document.body.append(h2);
    inst.resume(h2);
    expect(h2.querySelector('.lfx-tvm__stage')).not.toBeNull();
    inst.start();
    expect(inst.isOn()).toBe(true);
  });

  it('suspend mit PiP: true, Instanz läuft weiter, Video im Halter', async () => {
    const video = document.createElement('video');
    video.requestPictureInPicture = vi.fn(async () => { document.pictureInPictureElement = video; video.dispatchEvent(new Event('enterpictureinpicture')); });
    Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, writable: true, value: null });
    await boot({ video });
    inst.start();
    await video.requestPictureInPicture();
    expect(inst.isPip()).toBe(true);
    expect(deps.onPip).toHaveBeenCalledWith(true);
    expect(document.getElementById('lfx-tvm-bg').contains(video)).toBe(true);
    expect(inst.suspend()).toBe(true);
    expect(inst.isOn()).toBe(true);
    // PiP-Ende ohne verbundenen Slot: pip-end und dispose
    host.remove();
    document.pictureInPictureElement = null;
    video.dispatchEvent(new Event('leavepictureinpicture'));
    expect(deps.onStopped).toHaveBeenCalledWith({ reason: 'pip-end' });
    expect(document.getElementById('lfx-tvm-bg')).toBeNull();
    inst = null;
    delete document.pictureInPictureElement;
  });

  async function suspendInPip() {
    const video = document.createElement('video');
    video.requestPictureInPicture = vi.fn(async () => { document.pictureInPictureElement = video; video.dispatchEvent(new Event('enterpictureinpicture')); });
    Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, writable: true, value: null });
    await boot({ video });
    vi.useFakeTimers();
    inst.start();
    await video.requestPictureInPicture();
    expect(inst.suspend()).toBe(true);
    return video;
  }

  it('suspendiert im PiP: Route /video beendet die Instanz (route-video)', async () => {
    await suspendInPip();
    window.location.hash = '#/video';
    vi.advanceTimersByTime(1100);
    expect(deps.onStopped).toHaveBeenCalledWith({ reason: 'route-video' });
    expect(document.getElementById('lfx-tvm-bg')).toBeNull();
    window.location.hash = '';
    inst = null;
    delete document.pictureInPictureElement;
  });

  it('suspendiert im PiP: getrenntes Video beendet die Instanz (detached)', async () => {
    const video = await suspendInPip();
    video.remove();
    vi.advanceTimersByTime(1100);
    expect(deps.onStopped).toHaveBeenCalledWith({ reason: 'detached' });
    inst = null;
    delete document.pictureInPictureElement;
  });

  describe('Klasse lfx-tvm-bgplay', () => {
    const has = () => document.documentElement.classList.contains('lfx-tvm-bgplay');
    afterEach(() => { document.documentElement.classList.remove('lfx-tvm-bgplay'); delete document.pictureInPictureElement; });

    it('gesetzt bei suspend im PiP, weg bei Rückkehr (resume)', async () => {
      const video = await suspendInPip();
      expect(has()).toBe(true);
      const h2 = document.createElement('div');
      document.body.append(h2);
      inst.resume(h2);
      expect(has()).toBe(false);
      expect(video).toBeTruthy();
    });

    it('weg bei PiP-Ende', async () => {
      const video = await suspendInPip();
      expect(has()).toBe(true);
      document.pictureInPictureElement = null;
      video.dispatchEvent(new Event('leavepictureinpicture'));
      expect(has()).toBe(false);
      inst = null;
    });

    it('weg bei lfx:play', async () => {
      await suspendInPip();
      window.dispatchEvent(new Event('lfx:play'));
      expect(has()).toBe(false);
    });

    it('weg bei dispose', async () => {
      await suspendInPip();
      inst.dispose();
      expect(has()).toBe(false);
      inst = null;
    });

    it('nicht gesetzt ohne Hintergrund-PiP', async () => {
      await boot();
      inst.start();
      expect(has()).toBe(false);
      inst.suspend();
      expect(has()).toBe(false);
    });
  });

  it('dispose räumt Halter, Listener und Host', async () => {
    await boot();
    inst.start();
    const bg = document.createElement('div');
    bg.id = 'lfx-tvm-bg';
    document.body.append(bg);
    inst.dispose();
    expect(document.getElementById('lfx-tvm-bg')).toBeNull();
    expect(host.children.length).toBe(0);
    deps.onStopped.mockClear();
    window.dispatchEvent(new CustomEvent('lfx:play', { detail: { id: 'x' } }));
    expect(deps.onStopped).not.toHaveBeenCalled();
    inst = null;
  });

  it('übernimmt opts.video', async () => {
    const video = document.createElement('video');
    await boot({ video });
    expect(video.disablePictureInPicture).toBe(false);
    expect(host.contains(video)).toBe(true);
  });

  it('Debug-Hook mit debugCard (nur Anzeige), Aufräumen in dispose', async () => {
    await boot({ debug: true });
    expect(window.__lfxTvm.ctl).toBeTruthy();
    expect(window.__lfxTvm.state().on).toBe(false);
    window.__lfxTvm.debugCard('pause');
    expect(window.__lfxTvm.ctl.state().phase).toBe('off');
    expect(host.classList.contains('is-paused-card')).toBe(true);
    window.__lfxTvm.debugCard('error');
    expect(host.classList.contains('is-error')).toBe(true);
    window.__lfxTvm.debugCard('tap');
    expect(host.classList.contains('is-error')).toBe(true);
    window.__lfxTvm.debugCard('muted');
    expect(host.classList.contains('is-error')).toBe(false);
    window.__lfxTvm.debugCard(null);
    expect(host.classList.contains('is-paused-card')).toBe(false);
    inst.dispose();
    expect(window.__lfxTvm).toBeUndefined();
    inst = null;
  });

  it('ohne Debug kein Hook; Fehler im Katalog → onFatal', async () => {
    await boot();
    expect(window.__lfxTvm).toBeUndefined();
    inst.dispose();
    deps = mkDeps({ channelConfig: null, getBoxSetItems: null, catalog: null });
    deps.catalog = { get movies() { throw new Error('kaputt'); } };
    inst = create(host, deps, { now, fakePlayer: true });
    await ready();
    expect(deps.onFatal).toHaveBeenCalled();
  });
});
