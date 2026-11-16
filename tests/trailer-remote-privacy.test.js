// @vitest-environment jsdom
// Remote-Trailer nur über https und ohne Referrer.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({
  getJson: vi.fn(),
  getUserId: () => 'u1',
  getAuth: () => ({ address: 'http://srv', userId: 'u1', token: 'tok', serverId: 's' }),
}));

import { directRemoteTrailerUrl, createMutedPreview } from '../src/js/shared/trailer.js';

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="box"></div>';
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Remote-Trailer-Datenschutz', () => {
  it('http-Videodatei wird nicht genutzt, https schon', () => {
    expect(directRemoteTrailerUrl({ RemoteTrailers: [{ Url: 'http://cdn.example/t.mp4' }] })).toBeNull();
    expect(directRemoteTrailerUrl({ RemoteTrailers: [{ Url: 'http://cdn.example/t.mp4' }, { Url: 'https://cdn.example/t.webm' }] })).toBe('https://cdn.example/t.webm');
  });

  it('Vorschau-Video mit Remote-Trailer trägt referrerpolicy=no-referrer', async () => {
    createMutedPreview(document.getElementById('box'), { Id: 'M1', RemoteTrailers: [{ Url: 'https://cdn.example/t.mp4' }] }, { delay: 10 });
    await vi.advanceTimersByTimeAsync(20);
    await flush();
    const v = document.querySelector('video');
    expect(v).not.toBeNull();
    expect(v.getAttribute('referrerpolicy')).toBe('no-referrer');
  });
});
