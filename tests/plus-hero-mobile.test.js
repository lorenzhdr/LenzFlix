// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

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

import { createHero } from '../src/js/features/plus/hero.js';

const mk = (n) => ({
  Id: `id${n}`, Name: `Titel ${n}`, Type: 'Movie', ProductionYear: 2020, Genres: ['Drama'],
  Overview: 'Beschreibung', ImageTags: { Primary: 'p', Logo: 'l' }, BackdropImageTags: ['b'],
});

describe('createHero: Handy-Karussell', () => {
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  it('Hochformat-Variante: Poster als Bild, keine Punkte/Pfeile, kein Autoplay', () => {
    vi.useFakeTimers();
    const hero = createHero([mk(1), mk(2), mk(3)], { mobile: true, interval: 1000 });
    expect(hero.el.classList.contains('lfx-plus-hero--m')).toBe(true);
    expect(hero.el.querySelector('.lfx-plus-hero__dots')).toBeNull();
    expect(hero.el.querySelector('.lfx-plus-hero__nav')).toBeNull();
    expect(hero.el.querySelector('.lfx-plus-hero__img').getAttribute('src')).toContain('/Images/Primary');
    vi.advanceTimersByTime(5000);
    expect(hero.index()).toBe(0);
    hero.destroy();
  });

  it('Desktop-Variante unverändert: Backdrop, Punkte, Autoplay', () => {
    vi.useFakeTimers();
    const hero = createHero([mk(1), mk(2)], { mobile: false, interval: 1000 });
    expect(hero.el.classList.contains('lfx-plus-hero--m')).toBe(false);
    expect(hero.el.querySelector('.lfx-plus-hero__img').getAttribute('src')).toContain('/Images/Backdrop');
    expect(hero.el.querySelectorAll('.lfx-plus-hero__dot')).toHaveLength(2);
    vi.advanceTimersByTime(1100);
    expect(hero.index()).toBe(1);
    hero.destroy();
  });

  it('Tippen auf Nachbarkarte blättert dorthin statt zu öffnen', () => {
    const hero = createHero([mk(1), mk(2)], { mobile: true });
    document.body.append(hero.el);
    const second = hero.el.querySelectorAll('.lfx-plus-hero__slide')[1];
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    second.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(hero.index()).toBe(1);
    hero.destroy();
  });
});
