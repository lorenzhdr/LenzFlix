// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, isReady: () => true, getUserId: () => 'u1', getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 's' }), getItems: vi.fn() };
});
vi.mock('../src/js/core/datasaver.js', () => ({
  isDataSaver: () => false,
  onDataSaverChange: () => () => {},
  onDataSaverPartsChange: () => () => {},
}));

import { createHero } from '../src/js/features/plus/hero.js';

const mk = (n) => ({ Id: `id${n}`, Name: `Titel ${n}`, Type: 'Movie', ImageTags: {}, BackdropImageTags: ['b'] });

describe('plus-hero: Fokus bei Pfeiltasten (A068)', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  it('ArrowRight verschiebt den Fokus auf die neue aktive Folie', () => {
    const hero = createHero([mk(1), mk(2), mk(3)], { mobile: false });
    document.body.append(hero.el);
    const slides = hero.el.querySelectorAll('.lfx-plus-hero__slide');
    slides[0].focus();
    expect(document.activeElement).toBe(slides[0]);
    slides[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(hero.index()).toBe(1);
    expect(document.activeElement).toBe(slides[1]);
    hero.destroy();
  });
});
