// @vitest-environment jsdom
// cache.js begrenzt den Speicher.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cached, clearCache, peekCached } from '../src/js/core/cache.js';

function client(extra = {}) {
  window.ApiClient = {
    serverId: () => 'srv', getCurrentUserId: () => 'u1', accessToken: () => 'tok', serverAddress: () => 'http://x', ...extra,
  };
}

beforeEach(() => { clearCache(); client(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('cache.js begrenzt den Speicher', () => {
  it('älteste Einträge fallen bei Überschreitung der Obergrenze heraus', async () => {
    for (let i = 0; i < 700; i++) await cached(`k:${i}`, async () => i, 60_000);
    expect(peekCached('k:0')).toBeUndefined();
    expect(peekCached('k:699')).toBe(699);
  });
});

