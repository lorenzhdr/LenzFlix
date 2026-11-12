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
vi.mock('../src/js/core/theme.js', () => ({ getTheme: () => 'plus', brandName: () => 'LENZ+' }));
vi.mock('../src/js/shared/newcontent.js', () => ({
  getNewContentInfo: vi.fn(async () => ({})),
  plusBadge: () => null,
}));

import * as api from '../src/js/core/api.js';
import { renderRows } from '../src/js/features/plus/rows.js';
import { buildRowDefs, peekRowDefs, resetSourceCache } from '../src/js/features/rows/sources.js';
import { clearCache } from '../src/js/core/cache.js';

const mk = (id) => ({ Id: id, Type: 'Movie', Name: id, ImageTags: { Primary: 'p' }, DateCreated: new Date().toISOString() });
const many = (p, n = 12) => Array.from({ length: n }, (_, i) => mk(`${p}${i}`));
const calls = () => [api.getResume, api.getLatest, api.getItems].reduce((n, f) => n + f.mock.calls.length, 0);
const mount = (slot) => renderRows(slot, () => buildRowDefs(), () => peekRowDefs());
const settle = () => vi.waitFor(() => expect(document.querySelectorAll('.lfx-plus-row:not(.is-loading)').length).toBeGreaterThan(3));

describe('LENZ+: Startseiten-Cache der Zeilen', () => {
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
    const first = mount(slot);
    await settle();
    expect(slot.querySelector('.lfx-card__img').getAttribute('loading')).toBe('lazy'); // Erstbesuch wie bisher
    first();
    const before = calls();
    const second = mount(slot);
    await Promise.resolve(); // Zeilenliste wird in einer async-Funktion gelesen, aber ohne Netzwerk
    await Promise.resolve();
    expect(slot.querySelector('.is-loading')).toBeNull();
    expect(slot.querySelectorAll('.lfx-plus-row').length).toBeGreaterThan(3);
    const imgs = slot.querySelector('[data-lfx-row="latest-movies"]').querySelectorAll('.lfx-card__img');
    expect(imgs[0].hasAttribute('loading')).toBe(false);
    expect(imgs[imgs.length - 1].getAttribute('loading')).toBe('lazy');
    await new Promise((r) => setTimeout(r, 20));
    expect(calls()).toBe(before);
    second();
  });
});
