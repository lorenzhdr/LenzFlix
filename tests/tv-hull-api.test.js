// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestJson } from '../src/js/core/api.js';

const TOKEN = 'SECRET-TOKEN-123';

beforeEach(() => {
  window.ApiClient = { serverAddress: () => 'http://srv', getCurrentUserId: () => 'u1', accessToken: () => TOKEN, serverId: () => 's' };
});
afterEach(() => {
  delete window.ApiClient;
  delete window.fetch;
});

describe('requestJson', () => {
  it('POST mit JSON-Body, Authorization-Header, Query', async () => {
    window.fetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => '{"a":1}' }));
    const res = await requestJson('post', '/Items/abc/PlaybackInfo', { params: { userId: 'u1' }, body: { SubtitleStreamIndex: -1 } });
    expect(res).toEqual({ a: 1 });
    const [url, init] = window.fetch.mock.calls[0];
    expect(url).toBe('http://srv/Items/abc/PlaybackInfo?userId=u1');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`MediaBrowser Token="${TOKEN}"`);
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ SubtitleStreamIndex: -1 });
  });

  it('ohne Body kein Content-Type; Signal wird durchgereicht', async () => {
    window.fetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => '[]' }));
    const ctrl = new AbortController();
    await requestJson('GET', '/Items', { signal: ctrl.signal });
    const init = window.fetch.mock.calls[0][1];
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.body).toBeUndefined();
    expect(init.signal).toBe(ctrl.signal);
  });

  it('204 und leerer Body -> null', async () => {
    window.fetch = vi.fn(async () => ({ ok: true, status: 204 }));
    expect(await requestJson('DELETE', '/Videos/ActiveEncodings', { params: { deviceId: 'd' } })).toBeNull();
    window.fetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    expect(await requestJson('POST', '/x')).toBeNull();
  });

  it('Fehler: Text ohne Query und ohne Token', async () => {
    window.fetch = vi.fn(async () => ({ ok: false, status: 403 }));
    const err = await requestJson('POST', '/Items/abc/PlaybackInfo', { params: { userId: 'u1', ApiKey: TOKEN } }).catch((e) => e);
    expect(err.message).toBe('LenzFlix API: HTTP 403 für /Items/abc/PlaybackInfo');
    expect(err.message).not.toContain(TOKEN);
  });
});
