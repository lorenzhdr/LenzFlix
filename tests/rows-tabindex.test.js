// @vitest-environment jsdom
// Nach dem Löschen der Karte mit tabindex=0 bleibt die Zeile per Tab erreichbar.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual,
    isReady: () => true,
    getUserId: () => 'u1',
    getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 'srv' }),
    getViews: vi.fn(), getJson: vi.fn(), getItems: vi.fn(), getResume: vi.fn(), getNextUp: vi.fn(), getLatest: vi.fn(), getSimilar: vi.fn(),
  };
});
vi.mock('../src/js/core/theme.js', () => ({ getTheme: () => 'flix', brandName: () => 'LENZFLIX' }));
vi.mock('../src/js/features/rows/prefetch.js', () => ({
  startRowPrefetch: vi.fn(() => ({ stop: vi.fn(), notify: vi.fn() })),
  allowPrefetch: () => true,
  heroSettled: () => true,
}));

import * as api from '../src/js/core/api.js';
import { render } from '../src/js/features/rows.js';
import { resetSourceCache } from '../src/js/features/rows/sources.js';
import { startItemWatch, stopItemWatch } from '../src/js/core/itemmenu.js';
import { clearCache } from '../src/js/core/cache.js';

const mk = (id) => ({ Id: id, Type: 'Movie', Name: id, ImageTags: { Thumb: 't' }, DateCreated: new Date().toISOString() });

describe('Roving-Tabindex nach Löschen', () => {
  beforeEach(() => {
    resetSourceCache();
    clearCache();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    api.getViews.mockResolvedValue({ Items: [{ Id: 'vm', CollectionType: 'movies' }] });
    api.getJson.mockResolvedValue({ Items: [] });
    api.getResume.mockResolvedValue({ Items: [mk('r1'), mk('r2'), mk('r3')] });
    api.getNextUp.mockResolvedValue({ Items: [] });
    api.getLatest.mockResolvedValue([]);
    api.getSimilar.mockResolvedValue({ Items: [] });
    api.getItems.mockResolvedValue({ Items: [] });
  });

  it('erste Karte gelöscht: der neue erste Link bekommt tabindex 0', async () => {
    const slot = document.createElement('div');
    document.body.append(slot);
    const cleanup = render(slot);
    await vi.waitFor(() => expect(slot.querySelector('[data-lfx-row="resume"] .lfx-card__link')).not.toBeNull());
    let cb;
    window.ApiClient = { subscribe: (_t, fn) => { cb = fn; return () => {}; } };
    startItemWatch();
    const track = slot.querySelector('[data-lfx-row="resume"] .lfx-row__track');
    expect(track.querySelector('.lfx-card__link').tabIndex).toBe(0);
    cb({ Data: { ItemsRemoved: ['r1'] } });
    const links = [...track.querySelectorAll('.lfx-card__link')];
    expect(links).toHaveLength(2);
    expect(links.filter((l) => l.tabIndex === 0)).toHaveLength(1);
    expect(links[0].tabIndex).toBe(0);
    cleanup();
    stopItemWatch();
    delete window.ApiClient;
  });
});
