// @vitest-environment jsdom
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
}));
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn() }));
vi.mock('../src/js/features/modal.js', () => ({ openModal: vi.fn() }));

import hovercard, {
  computePopupRect,
  formatDuration,
  formatRating,
  qualityBadge,
  resolveTarget,
} from '../src/js/features/hovercard.js';
import { getItem, setFavorite } from '../src/js/core/api.js';
import { clearCache } from '../src/js/core/cache.js';
import { clearItemStore, putItems } from '../src/js/core/itemstore.js';

let n = 0;
function makeCard(extra = {}) {
  const id = `id${++n}`;
  putItems([{ Id: id, Type: 'Movie', Name: 'Film', Genres: ['A'], UserData: { IsFavorite: false }, ...extra }]);
  const row = document.createElement('div');
  row.innerHTML = `<div class="lfx-card" data-lfx-id="${id}" data-lfx-type="Movie"><a class="lfx-card__link"><img class="lfx-card__img" src="http://x/a.jpg"></a></div>`;
  document.body.append(row);
  const card = row.firstElementChild;
  card.getBoundingClientRect = () => ({ left: 100, top: 200, width: 280, height: 158, right: 380, bottom: 358 });
  return { id, card, img: card.querySelector('img') };
}
const over = (el) => el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));

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

describe('Timing', () => {
  it('öffnet nach 500 ms, nicht vorher; schließt mit Grace', () => {
    const { img } = makeCard();
    over(img);
    vi.advanceTimersByTime(499);
    expect(document.getElementById('lfx-hovercard')).toBeNull();
    vi.advanceTimersByTime(1);
    const pop = document.getElementById('lfx-hovercard');
    expect(pop).not.toBeNull();
    expect(pop.getAttribute('role')).toBe('dialog');
    over(document.body);
    vi.advanceTimersByTime(149);
    expect(pop.classList.contains('is-closing')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(pop.classList.contains('is-closing')).toBe(true);
    vi.advanceTimersByTime(200);
    expect(document.getElementById('lfx-hovercard')).toBeNull();
  });
  it('Verlassen vor Ablauf bricht das Öffnen ab', () => {
    const { img } = makeCard();
    over(img);
    vi.advanceTimersByTime(300);
    over(document.body);
    vi.advanceTimersByTime(1000);
    expect(document.getElementById('lfx-hovercard')).toBeNull();
  });
  it('Popup-Hover hält offen; unmount räumt auf', () => {
    const { img } = makeCard();
    over(img);
    vi.advanceTimersByTime(500);
    const pop = document.getElementById('lfx-hovercard');
    over(document.body);
    vi.advanceTimersByTime(100);
    over(pop.querySelector('.lfx-hc__img'));
    vi.advanceTimersByTime(1000);
    expect(pop.classList.contains('is-closing')).toBe(false);
    hovercard.unmount();
    expect(document.getElementById('lfx-hovercard')).toBeNull();
  });
});

describe('Zielfilter', () => {
  it('Grid, Personen und fremde Typen werden ignoriert', () => {
    document.body.innerHTML = `
      <div class="emby-scroller"><div class="card" data-id="1" data-type="Movie"><i></i></div>
      <div class="card" data-id="2" data-type="Person"><i></i></div></div>
      <div class="emby-scroller"><div class="vertical-wrap"><div class="card" data-id="3" data-type="Movie"><i></i></div></div></div>`;
    const q = (id) => document.querySelector(`[data-id="${id}"] i`);
    expect(resolveTarget(q(1)).id).toBe('1');
    expect(resolveTarget(q(2))).toBeNull();
    expect(resolveTarget(q(3))).toBeNull();
    expect(resolveTarget(document.body)).toBeNull();
  });
});

describe('computePopupRect', () => {
  const card = (left, width = 282) => ({ left, top: 300, width, height: (width * 9) / 16 });
  it('zentriert in der Mitte', () => {
    const r = computePopupRect(card(400), 1206, 1.5);
    expect(r.width).toBeCloseTo(423);
    expect(r.left).toBeCloseTo(400 + 141 - 211.5);
  });
  it('links bündig am linken Rand', () => {
    expect(computePopupRect(card(36), 1206, 1.5).left).toBe(36);
  });
  it('rechts bündig am rechten Rand', () => {
    const r = computePopupRect(card(900), 1206, 1.5);
    expect(r.left + r.width).toBeLessThanOrEqual(1206 - 8 + 0.001);
    expect(r.left + r.width).toBeCloseTo(900 + 282);
  });
  it('bleibt im Viewport und zentriert vertikal', () => {
    const r = computePopupRect(card(1100), 1206, 1.5, { viewportH: 800 });
    expect(r.left).toBeGreaterThanOrEqual(8);
    expect(r.left + r.width).toBeLessThanOrEqual(1198);
    const c = card(400);
    const v = computePopupRect(c, 1206, 1.5);
    expect(v.top + v.imageHeight / 2).toBeCloseTo(c.top + c.height / 2);
  });
});

describe('Meta-Formatierung', () => {
  it('FSK, Laufzeit, Qualität, Staffeln/Folgen', () => {
    expect(formatRating('FSK-12')).toBe('12');
    expect(formatRating('FSK-0')).toBe('0');
    expect(formatRating('TV-MA')).toBe('TV-MA');
    expect(formatDuration({ Type: 'Movie', RunTimeTicks: 106 * 600_000_000 })).toBe('1 Std. 46 Min.');
    expect(formatDuration({ Type: 'Movie', RunTimeTicks: 120 * 600_000_000 })).toBe('2 Std.');
    expect(formatDuration({ Type: 'Movie', RunTimeTicks: 46 * 600_000_000 })).toBe('46 Min.');
    expect(formatDuration({ Type: 'Series', ChildCount: 3 })).toBe('3 Staffeln');
    expect(formatDuration({ Type: 'Series', ChildCount: 1, RecursiveItemCount: 6 })).toBe('6 Folgen');
    expect(qualityBadge({ Width: 3840 })).toBe('4K');
    expect(qualityBadge({ Width: 1920 })).toBe('HD');
    expect(qualityBadge({ Width: 720 })).toBeNull();
    expect(qualityBadge({ MediaSources: [{ MediaStreams: [{ Type: 'Video', Width: 1280 }] }] })).toBe('HD');
  });
});

describe('Favoriten', () => {
  async function openPopup() {
    const c = makeCard();
    over(c.img);
    vi.advanceTimersByTime(500);
    return document.getElementById('lfx-hovercard');
  }
  it('optimistisch umschalten', async () => {
    setFavorite.mockResolvedValue({});
    const pop = await openPopup();
    const btn = pop.querySelectorAll('.lfx-hc__btn')[1];
    btn.click();
    expect(btn.classList.contains('is-on')).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(setFavorite).toHaveBeenCalledWith(expect.any(String), true);
    expect(btn.classList.contains('is-on')).toBe(true);
  });
  it('Rollback bei Fehler', async () => {
    setFavorite.mockRejectedValue(new Error('x'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pop = await openPopup();
    const btn = pop.querySelectorAll('.lfx-hc__btn')[1];
    btn.click();
    expect(btn.classList.contains('is-on')).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(btn.classList.contains('is-on')).toBe(false);
  });
  it('lädt fehlende Daten nach', async () => {
    getItem.mockResolvedValue({ Id: 'z', Type: 'Movie', Genres: ['Drama'], UserData: {}, OfficialRating: 'FSK-16' });
    const c = makeCard({ Genres: undefined, UserData: undefined });
    over(c.img);
    vi.advanceTimersByTime(500);
    await vi.advanceTimersByTimeAsync(0);
    expect(getItem).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.lfx-hc__genres').textContent).toContain('Drama');
    expect(document.querySelector('.lfx-hc__badge--rating').textContent).toBe('16');
  });
});

describe('Feature', () => {
  it('match schließt Video/Login aus', () => {
    expect(hovercard.match({ path: '/home' })).toBe(true);
    expect(hovercard.match({ path: '/video' })).toBe(false);
    expect(hovercard.match({ path: '/login' })).toBe(false);
    expect(hovercard.match({ path: '/dashboard/x' })).toBe(false);
  });
});
