// @vitest-environment jsdom
// TV-Details: sofortige Anfrage ohne Entprellung.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDetails } from '../src/js/live/tvmode/details.js';

const T0 = Date.UTC(2026, 10, 11, 18, 0, 0);
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => vi.useRealTimers());

describe('tvmode details.js: sofortige Anfrage', () => {
  it('request(id, true) lädt ohne Entprellung und lässt die wartende Id stehen', async () => {
    const itemDetails = vi.fn(async (ids) => new Map(ids.map((id) => [id, { overview: `T ${id}` }])));
    const d = createDetails({ deps: { itemDetails } });
    d.request('a');
    d.request('b', true);
    await flush(0);
    expect(d.get('b')).toBe('T b');
    expect(d.get('a')).toBeUndefined();
    await flush(450);
    expect(d.get('a')).toBe('T a');
  });
});

