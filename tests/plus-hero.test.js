// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual,
    isReady: () => true,
    getUserId: () => 'u1',
    getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 'srv' }),
    getItems: vi.fn(),
  };
});

const ds = vi.hoisted(() => ({ on: false }));
vi.mock('../src/js/core/datasaver.js', () => ({
  isDataSaver: () => ds.on,
  onDataSaverChange: () => () => {},
}));

import * as api from '../src/js/core/api.js';
import { clearCache } from '../src/js/core/cache.js';
import { createHero, taglineFor, loadHomeHeroPool, HERO_INTERVAL } from '../src/js/features/plus/hero.js';

const mk = (n, extra = {}) => ({
  Id: `id${n}`, Name: `Titel ${n}`, Type: 'Movie', ProductionYear: 2020, Genres: ['Drama', 'Krimi'], OfficialRating: 'FSK-12',
  Overview: 'Beschreibung', ImageTags: { Logo: 'l' }, BackdropImageTags: ['b'], ...extra,
});

describe('taglineFor', () => {
  it('bevorzugt Tagline', () => expect(taglineFor({ Taglines: ['Hallo'], Overview: 'x' })).toBe('Hallo'));
  it('kürzt lange Beschreibung', () => {
    const t = taglineFor({ Overview: 'wort '.repeat(80) });
    expect(t.length).toBeLessThanOrEqual(152);
    expect(t.endsWith('…')).toBe(true);
  });
  it('leer ohne Daten', () => expect(taglineFor({})).toBe(''));
});

describe('createHero', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  it('null bei leerem Pool', () => expect(createHero([])).toBeNull());

  it('rendert Folien mit Link, Badge, Meta', () => {
    const info = { bySeries: new Map(), newMovieIds: new Set(['id1']), newSeriesIds: new Set() };
    const hero = createHero([mk(1), mk(2)], { info });
    const slides = hero.el.querySelectorAll('.lfx-plus-hero__slide');
    expect(slides).toHaveLength(2);
    expect(slides[0].getAttribute('href')).toBe('#/home?lfx=title&id=id1');
    expect(slides[0].querySelector('.lfx-plus-hero__badge').textContent).toBe('Neuer Film');
    expect(slides[1].querySelector('.lfx-plus-hero__badge')).toBeNull();
    expect(slides[0].querySelector('.lfx-plus-hero__meta').textContent).toContain('2020');
    expect(hero.el.querySelectorAll('.lfx-plus-hero__dot')).toHaveLength(2);
    hero.destroy();
  });

  it('wechselt nach ~7 s und läuft rund', () => {
    const hero = createHero([mk(1), mk(2)]);
    document.body.append(hero.el);
    expect(hero.index()).toBe(0);
    vi.advanceTimersByTime(HERO_INTERVAL);
    expect(hero.index()).toBe(1);
    expect(hero.el.style.getPropertyValue('--i')).toBe('1');
    vi.advanceTimersByTime(HERO_INTERVAL);
    expect(hero.index()).toBe(0);
    hero.destroy();
  });

  it('pausiert bei Hover und bei verborgenem Tab', () => {
    const hero = createHero([mk(1), mk(2)]);
    hero.el.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(HERO_INTERVAL * 3);
    expect(hero.index()).toBe(0);
    hero.el.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(HERO_INTERVAL);
    expect(hero.index()).toBe(1);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(HERO_INTERVAL * 3);
    expect(hero.index()).toBe(1);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(HERO_INTERVAL);
    expect(hero.index()).toBe(0);
    hero.destroy();
  });

  it('Pfeile, Punkte und Klick auf Nachbarfolie schalten um; destroy stoppt Timer', () => {
    const hero = createHero([mk(1), mk(2), mk(3)]);
    document.body.append(hero.el);
    hero.el.querySelector('.lfx-plus-hero__nav--next').click();
    expect(hero.index()).toBe(1);
    hero.el.querySelector('.lfx-plus-hero__nav--prev').click();
    hero.el.querySelector('.lfx-plus-hero__nav--prev').click();
    expect(hero.index()).toBe(2);
    hero.el.querySelectorAll('.lfx-plus-hero__dot')[0].click();
    expect(hero.index()).toBe(0);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    hero.el.querySelectorAll('.lfx-plus-hero__slide')[1].dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(hero.index()).toBe(1);
    hero.destroy();
    vi.advanceTimersByTime(HERO_INTERVAL * 3);
    expect(hero.index()).toBe(1);
    expect(document.querySelector('.lfx-plus-hero')).toBeNull();
  });

  it('Klick auf aktive Folie wird nicht abgefangen', () => {
    const hero = createHero([mk(1), mk(2)]);
    document.body.append(hero.el);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    hero.el.querySelector('.lfx-plus-hero__slide.is-active').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    hero.destroy();
  });
});

describe('loadHomeHeroPool', () => {
  beforeEach(() => clearCache());
  it('cached den Pool 10 min (gleiche Titel), nach clearCache("home:") neu', async () => {
    api.getItems.mockReset();
    api.getItems.mockImplementation(async (p) => ({ Items: p.SortBy === 'Random' ? [mk(5), mk(6)] : [mk(1)] }));
    const a = await loadHomeHeroPool();
    const n = api.getItems.mock.calls.length;
    const b = await loadHomeHeroPool();
    expect(b).toBe(a);
    expect(api.getItems.mock.calls.length).toBe(n);
    clearCache('home:');
    await loadHomeHeroPool();
    expect(api.getItems.mock.calls.length).toBeGreaterThan(n);
  });
  it('baut Pool aus neu + zufällig', async () => {
    api.getItems.mockImplementation(async (p) => ({ Items: p.SortBy === 'Random' ? [mk(5), mk(6)] : [mk(1)] }));
    const pool = await loadHomeHeroPool();
    expect(pool.map((i) => i.Id).sort()).toEqual(['id1', 'id5', 'id6']);
    expect(api.getItems.mock.calls[0][0].Fields).toContain('Taglines');
  });
});

describe('createHero: Datensparmodus', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; ds.on = false; });
  const many = Array.from({ length: 10 }, (_, i) => mk(i + 1));
  const loading = (hero) => [...hero.el.querySelectorAll('.lfx-plus-hero__img')].map((i) => i.getAttribute('loading'));

  it('aus: alle Titel, die ersten 3 Bilder eager', () => {
    const hero = createHero(many);
    expect(hero.el.querySelectorAll('.lfx-plus-hero__slide')).toHaveLength(10);
    expect(loading(hero).slice(0, 4)).toEqual(['eager', 'eager', 'eager', 'lazy']);
    hero.destroy();
  });
  it('an: höchstens 5 Titel, nur das erste Bild eager', () => {
    ds.on = true;
    const hero = createHero(many);
    expect(hero.el.querySelectorAll('.lfx-plus-hero__slide')).toHaveLength(5);
    expect(loading(hero)).toEqual(['eager', 'lazy', 'lazy', 'lazy', 'lazy']);
    expect(hero.el.querySelectorAll('.lfx-plus-hero__dot')).toHaveLength(5);
    hero.destroy();
  });
});
