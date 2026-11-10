// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({
  getJson: vi.fn(),
  getUserId: () => 'u1',
  getAuth: () => ({ address: 'http://srv', userId: 'u1', token: 'tok en', serverId: 's' }),
}));

import * as api from '../src/js/core/api.js';
import { trailerUrl, loadLocalTrailer, directRemoteTrailerUrl, createMutedPreview } from '../src/js/shared/trailer.js';

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  delete window.ApiClient;
  document.body.innerHTML = '<div id="box"></div>';
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('trailerUrl / loadLocalTrailer', () => {
  it('ohne ApiClient: Adresse + encodiertes Token', () => {
    expect(trailerUrl('T1')).toBe('http://srv/Videos/T1/stream.mp4?static=true&api_key=tok%20en');
  });

  it('mit ApiClient: getUrl mit static und api_key', () => {
    const getUrl = vi.fn(() => 'u');
    window.ApiClient = { getUrl, accessToken: () => 'tk' };
    expect(trailerUrl('T1')).toBe('u');
    expect(getUrl).toHaveBeenCalledWith('Videos/T1/stream.mp4', { static: true, api_key: 'tk' });
  });

  it('loadLocalTrailer: ohne LocalTrailerCount kein Request; sonst erster Trailer', async () => {
    expect(await loadLocalTrailer({ Id: 'M1' })).toBeNull();
    expect(api.getJson).not.toHaveBeenCalled();
    api.getJson.mockResolvedValue([{ Id: 'T9' }, { Id: 'T10' }]);
    expect(await loadLocalTrailer({ Id: 'M1', LocalTrailerCount: 1 })).toEqual({ Id: 'T9' });
    expect(api.getJson).toHaveBeenCalledWith('/Users/u1/Items/M1/LocalTrailers');
    api.getJson.mockResolvedValue([]);
    expect(await loadLocalTrailer({ Id: 'M1', LocalTrailerCount: 1 })).toBeNull();
  });

  it('directRemoteTrailerUrl: nur Videodatei-URLs', () => {
    expect(directRemoteTrailerUrl({ RemoteTrailers: [{ Url: 'https://youtu.be/x' }] })).toBeNull();
    expect(directRemoteTrailerUrl({ RemoteTrailers: [{ Url: 'https://youtu.be/x' }, { Url: 'https://cdn.example/t.mp4?x=1' }] })).toBe('https://cdn.example/t.mp4?x=1');
    expect(directRemoteTrailerUrl({})).toBeNull();
  });
});

describe('createMutedPreview', () => {
  const box = () => document.getElementById('box');

  it('startet erst nach der Verzögerung einen stummen Trailer; onStart bei playing', async () => {
    api.getJson.mockResolvedValue([{ Id: 'T1' }]);
    const onStart = vi.fn();
    createMutedPreview(box(), { Id: 'M1', LocalTrailerCount: 1 }, { delay: 1500, onStart });
    await vi.advanceTimersByTimeAsync(1499);
    expect(box().querySelector('video')).toBeNull();
    await vi.advanceTimersByTimeAsync(2);
    await flush();
    const v = box().querySelector('video');
    expect(v).not.toBeNull();
    expect(v.muted).toBe(true);
    expect(v.getAttribute('src')).toContain('/Videos/T1/stream.mp4');
    expect(onStart).not.toHaveBeenCalled();
    v.dispatchEvent(new Event('playing'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('startAt: springt nach loadedmetadata nur bei langen Videos', async () => {
    api.getJson.mockResolvedValue([{ Id: 'T1' }]);
    const run = async (duration, opts) => {
      box().innerHTML = '';
      createMutedPreview(box(), { Id: 'M1', LocalTrailerCount: 1 }, { delay: 10, ...opts });
      await vi.advanceTimersByTimeAsync(20);
      await flush();
      const v = box().querySelector('video');
      Object.defineProperty(v, 'duration', { value: duration, configurable: true });
      v.dispatchEvent(new Event('loadedmetadata'));
      return v.currentTime;
    };
    expect(await run(120, { startAt: 4 })).toBe(4);
    expect(await run(25, { startAt: 4 })).toBe(0);
    expect(await run(120, {})).toBe(0);
  });

  it('cancel vor dem Start: kein Video, kein Request-Ergebnis', async () => {
    api.getJson.mockResolvedValue([{ Id: 'T1' }]);
    const p = createMutedPreview(box(), { Id: 'M1', LocalTrailerCount: 1 }, { delay: 1000 });
    p.cancel();
    await vi.advanceTimersByTimeAsync(5000);
    await flush();
    expect(box().querySelector('video')).toBeNull();
    expect(api.getJson).not.toHaveBeenCalled();
  });

  it('cancel nach dem Start räumt vollständig auf (src entfernt, load, Element weg), kein onEnd', async () => {
    api.getJson.mockResolvedValue([{ Id: 'T1' }]);
    const onEnd = vi.fn();
    const p = createMutedPreview(box(), { Id: 'M1', LocalTrailerCount: 1 }, { delay: 10, onEnd });
    await vi.advanceTimersByTimeAsync(20);
    await flush();
    const v = box().querySelector('video');
    v.dispatchEvent(new Event('playing'));
    p.cancel();
    expect(box().querySelector('video')).toBeNull();
    expect(v.hasAttribute('src')).toBe(false);
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('Ende nach Start: onEnd einmal, Video entfernt', async () => {
    api.getJson.mockResolvedValue([{ Id: 'T1' }]);
    const onEnd = vi.fn();
    createMutedPreview(box(), { Id: 'M1', LocalTrailerCount: 1 }, { delay: 10, onEnd });
    await vi.advanceTimersByTimeAsync(20);
    await flush();
    const v = box().querySelector('video');
    v.dispatchEvent(new Event('playing'));
    v.dispatchEvent(new Event('ended'));
    v.dispatchEvent(new Event('ended'));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(box().querySelector('video')).toBeNull();
  });

  it('kein Start ohne abspielbaren Trailer', async () => {
    const onStart = vi.fn();
    createMutedPreview(box(), { Id: 'M1', RemoteTrailers: [{ Url: 'https://youtu.be/x' }] }, { delay: 10, onStart });
    await vi.advanceTimersByTimeAsync(50);
    await flush();
    expect(box().querySelector('video')).toBeNull();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('direkter Remote-Trailer wird genutzt; Fehler beim Laden der lokalen Liste fällt darauf zurück', async () => {
    api.getJson.mockRejectedValue(new Error('x'));
    createMutedPreview(box(), { Id: 'M1', LocalTrailerCount: 1, RemoteTrailers: [{ Url: 'https://cdn.example/t.webm' }] }, { delay: 10 });
    await vi.advanceTimersByTimeAsync(20);
    await flush();
    expect(box().querySelector('video').getAttribute('src')).toBe('https://cdn.example/t.webm');
  });
});
