// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual,
    isReady: () => true,
    getUserId: () => 'u1',
    getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 'srv' }),
    getViews: vi.fn(),
    getJson: vi.fn(),
    getItems: vi.fn(),
    getResume: vi.fn(),
    getNextUp: vi.fn(),
    getLatest: vi.fn(),
    getSimilar: vi.fn(),
  };
});
vi.mock('../src/js/core/theme.js', () => ({ getTheme: () => 'prime', brandName: () => 'LENZPRIME' }));
vi.mock('../src/js/shared/newcontent.js', () => ({ getNewContentInfo: vi.fn(async () => ({})), newBadge: () => null }));
vi.mock('../src/js/shared/trend.js', () => ({ getTrendInfo: vi.fn(async () => ({ available: false })), cardBadge: () => null }));

import * as api from '../src/js/core/api.js';
import { createRows } from '../src/js/features/prime/home-rows.js';
import { buildRowDefs, peekRowDefs, resetSourceCache } from '../src/js/features/rows/sources.js';
import { clearCache } from '../src/js/core/cache.js';

const mk = (id) => ({ Id: id, Type: 'Movie', Name: id, ImageTags: { Thumb: 't' }, DateCreated: new Date().toISOString() });
const many = (p, n = 12) => Array.from({ length: n }, (_, i) => mk(`${p}${i}`));
const calls = () => [api.getResume, api.getLatest, api.getItems].reduce((n, f) => n + f.mock.calls.length, 0);
const settle = () => vi.waitFor(() => expect(document.querySelectorAll('.lfx-prime-row:not(.is-loading)').length).toBeGreaterThan(3));

describe('LENZPRIME: Startseiten-Cache der Zeilen', () => {
  let slot;
  beforeEach(() => {
    resetSourceCache();
    clearCache();
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    api.getViews.mockResolvedValue({ Items: [{ Id: 'vm', CollectionType: 'movies' }] });
    api.getJson.mockResolvedValue({ Items: [{ Name: 'Action' }] });
    api.getResume.mockResolvedValue({ Items: [mk('r1')] });
    api.getNextUp.mockResolvedValue({ Items: [] });
    api.getLatest.mockResolvedValue(many('l'));
    api.getSimilar.mockResolvedValue({ Items: [] });
    api.getItems.mockImplementation(async () => ({ Items: many('x') }));
    document.body.innerHTML = '<div id="s"></div>';
    slot = document.getElementById('s');
  });
  afterEach(() => vi.restoreAllMocks());

  it('zweiter Mount innerhalb der TTL: kein Abruf, kein Skeleton, erste Karten ohne lazy', async () => {
    const first = createRows(slot);
    first.add(await buildRowDefs({ genreCount: 6 }));
    await settle();
    expect(slot.querySelector('.lfx-card__img').getAttribute('loading')).toBe('lazy'); // Erstbesuch wie bisher
    first.destroy();
    const before = calls();
    const defs = peekRowDefs({ genreCount: 6 });
    expect(defs).toBeDefined();
    const second = createRows(slot);
    second.add(defs);
    expect(slot.querySelector('.is-loading')).toBeNull(); // synchron gefüllt
    expect(slot.querySelectorAll('.lfx-prime-row').length).toBeGreaterThan(3);
    const imgs = slot.querySelector('[data-lfx-row="latest-movies"]').querySelectorAll('.lfx-card__img');
    expect(imgs[0].hasAttribute('loading')).toBe(false);
    expect(imgs[imgs.length - 1].getAttribute('loading')).toBe('lazy');
    await new Promise((r) => setTimeout(r, 20));
    expect(calls()).toBe(before);
    second.destroy();
  });
});
