import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cached, clearCache, debounce, peekCached } from '../src/js/core/cache.js';

beforeEach(() => {
  vi.useFakeTimers();
  clearCache();
});
afterEach(() => vi.useRealTimers());

describe('cache', () => {
  it('dedupliziert gleichzeitige Requests', async () => {
    const loader = vi.fn(async () => 42);
    const [a, b] = await Promise.all([cached('k', loader), cached('k', loader)]);
    expect([a, b]).toEqual([42, 42]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('beachtet TTL', async () => {
    const loader = vi.fn(async () => 1);
    await cached('t', loader, 1000);
    await cached('t', loader, 1000);
    expect(loader).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1001);
    await cached('t', loader, 1000);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('cached keine Fehler', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(5);
    await expect(cached('e', loader)).rejects.toThrow('x');
    expect(await cached('e', loader)).toBe(5);
  });

  it('peekCached: synchroner Treffer oder undefined, respektiert TTL und clearCache', async () => {
    expect(peekCached('p')).toBeUndefined();
    await cached('p', async () => 7, 1000);
    expect(peekCached('p')).toBe(7);
    vi.advanceTimersByTime(1001);
    expect(peekCached('p')).toBeUndefined();
    await cached('p', async () => 8, 1000);
    clearCache('p');
    expect(peekCached('p')).toBeUndefined();
  });

  it('debounce', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d(1);
    d(2);
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(2);
  });
});
