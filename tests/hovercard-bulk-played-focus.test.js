// @vitest-environment jsdom
// Hovercard: Bulk-Rückfrage nach geschlossenem Popup, Top-10-Hovercard, Fokus beim Schließen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({
  buildUrl: (p) => p,
  getAuth: () => ({ token: 't', userId: 'u' }),
  getItem: vi.fn(),
  getUserId: () => 'u',
  isReady: () => true,
  landscapeImage: () => 'http://x/land.jpg',
  logoImage: () => 'http://x/logo.png',
  pickLandscape: () => ({ type: 'Backdrop' }),
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
import { getEpisodes } from '../src/js/core/api.js';
import { confirmAction } from '../src/js/core/sheet.js';
import { clearCache } from '../src/js/core/cache.js';
import { clearItemStore, putItems } from '../src/js/core/itemstore.js';

let n = 0;
function makeCard({ cls = '', type = 'Series', imgSrc = 'http://x/poster.jpg', ...extra } = {}) {
  const id = `w${++n}`;
  putItems([{ Id: id, Type: type, Name: 'Die Serie', Genres: ['A'], UserData: {}, ImageTags: { Primary: 'p' }, ...extra }]);
  const row = document.createElement('div');
  row.innerHTML = `<div class="lfx-card ${cls}" data-lfx-id="${id}" data-lfx-type="${type}"><a class="lfx-card__link" href="#x"><img class="lfx-card__img" src="${imgSrc}"></a></div>`;
  document.body.append(row);
  const card = row.firstElementChild;
  card.getBoundingClientRect = () => ({ left: 100, top: 200, width: 280, height: 158, right: 380, bottom: 358 });
  return { id, card, img: card.querySelector('img') };
}
const over = (el) => el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
async function openPopup(opts) {
  const c = makeCard(opts);
  over(c.img);
  vi.advanceTimersByTime(500);
  await vi.advanceTimersByTimeAsync(0);
  return { c, pop: document.getElementById('lfx-hovercard') };
}

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

describe('Bulk-Gesehen bei geschlossenem Popup', () => {
  it('Knopf abgelöst: Sheet ohne Anker, Titel im Text', async () => {
    let finish;
    getEpisodes.mockReturnValue(new Promise((r) => { finish = r; }));
    const { pop } = await openPopup();
    pop.querySelector('.lfx-hc__played').click();
    over(document.body);
    await vi.advanceTimersByTimeAsync(1000);
    expect(document.getElementById('lfx-hovercard')).toBeNull();
    finish({ Items: [{ Id: 'e1' }, { Id: 'e2' }] });
    await vi.advanceTimersByTimeAsync(0);
    const args = confirmAction.mock.calls[0][0];
    expect(args.anchorEl).toBeNull();
    expect(args.title).toBe('Die Serie: 2 Folgen als gesehen markieren?');
  });
});

describe('Top-10-Hovercard', () => {
  it('nutzt das Querformat-Bild und zeigt Logo im Overlay', async () => {
    const { pop } = await openPopup({ type: 'Movie', cls: 'lfx-card--top10' });
    expect(pop.querySelector('.lfx-hc__img').getAttribute('src')).toBe('http://x/land.jpg');
    expect(pop.querySelector('.lfx-hc__overlay .lfx-hc__logo').getAttribute('src')).toBe('http://x/logo.png');
  });
  it('normale eigene Karte bleibt beim Kartenbild ohne Overlay-Rückfall', async () => {
    const { pop } = await openPopup({ type: 'Movie' });
    expect(pop.querySelector('.lfx-hc__img').getAttribute('src')).toBe('http://x/poster.jpg');
    expect(pop.querySelector('.lfx-hc__overlay').children.length).toBe(0);
  });
});

describe('Fokus beim Schließen', () => {
  it('Fokus im Popup wandert beim Entfernen auf den Kartenlink', async () => {
    const { c, pop } = await openPopup({ type: 'Movie' });
    const btn = pop.querySelector('.lfx-hc__btn--list');
    btn.focus();
    expect(document.activeElement).toBe(btn);
    over(document.body);
    await vi.advanceTimersByTimeAsync(1000);
    expect(document.getElementById('lfx-hovercard')).toBeNull();
    expect(document.activeElement).toBe(c.card.querySelector('a'));
  });
});
