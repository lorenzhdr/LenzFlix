// @vitest-environment jsdom
// B037: Hovercard-Aktionen müssen den Modal-Item-Cache (lfx:modal:item:<id>) leeren.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({
  buildUrl: (p) => p,
  getAuth: () => ({ token: 't', userId: 'u' }),
  getItem: vi.fn(),
  getUserId: () => 'u',
  isReady: () => true,
  landscapeImage: () => 'http://x/land.jpg',
  logoImage: () => null,
  pickLandscape: () => ({ type: 'Thumb' }),
  setFavorite: vi.fn(),
  setPlayed: vi.fn(),
  getEpisodes: vi.fn(),
}));
vi.mock('../src/js/core/sheet.js', () => ({ confirmAction: vi.fn() }));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: (id) => id === 'flix', getTheme: () => 'flix' }));
vi.mock('../src/js/core/toast.js', () => ({ toast: vi.fn() }));
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn() }));
vi.mock('../src/js/features/modal.js', () => ({ openModal: vi.fn() }));
vi.mock('../src/js/core/itemmenu.js', () => ({
  openItemMenu: vi.fn(),
  isMenuOpen: vi.fn(() => false),
  onItemsChanged: vi.fn(() => vi.fn()),
}));
vi.mock('../src/js/core/download.js', () => ({
  startDownload: vi.fn(),
  canDownload: vi.fn(async () => false),
  isChooserOpen: vi.fn(() => false),
}));

import hovercard from '../src/js/features/hovercard.js';
import { setFavorite } from '../src/js/core/api.js';
import { cached, clearCache } from '../src/js/core/cache.js';
import { clearItemStore, putItems } from '../src/js/core/itemstore.js';

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.className = 'lfx-js';
  window.matchMedia = () => ({ matches: true });
  clearCache();
  clearItemStore();
  hovercard.mount();
});
afterEach(() => {
  hovercard.unmount();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('B037 Hovercard-Aktionen und Modal-Cache', () => {
  it('Favorit in der Hovercard leert lfx:modal:item:<id>', async () => {
    const id = 'x1';
    putItems([{ Id: id, Type: 'Movie', Name: 'Film', Genres: ['A'], UserData: { IsFavorite: false } }]);
    const row = document.createElement('div');
    row.innerHTML = `<div class="lfx-card" data-lfx-id="${id}" data-lfx-type="Movie"><a class="lfx-card__link"><img class="lfx-card__img" src="http://x/a.jpg"></a></div>`;
    document.body.append(row);
    const card = row.firstElementChild;
    card.getBoundingClientRect = () => ({ left: 100, top: 200, width: 280, height: 158, right: 380, bottom: 358 });

    // Info-Fenster war offen: alter Stand liegt im Modal-Cache
    const oldItem = { Id: id, UserData: { IsFavorite: false } };
    await cached(`lfx:modal:item:${id}`, async () => oldItem, 5 * 60_000);

    setFavorite.mockResolvedValue({});
    card.querySelector('img').dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    vi.advanceTimersByTime(500);
    const pop = document.getElementById('lfx-hovercard');
    pop.querySelector('.lfx-hc__btn--list').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(setFavorite).toHaveBeenCalledWith(id, true);

    const fresh = vi.fn(async () => ({ Id: id, UserData: { IsFavorite: true } }));
    await cached(`lfx:modal:item:${id}`, fresh, 5 * 60_000);
    expect(fresh).toHaveBeenCalled(); // Cache muss geleert sein, sonst alter Stand
  });
});
