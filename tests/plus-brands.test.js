// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

let resolveList;
vi.mock('../src/js/shared/collections.js', () => ({
  getCollections: vi.fn(() => new Promise((r) => { resolveList = r; })),
}));

import { renderBrands } from '../src/js/features/plus/brands.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('LENZ+ Sammlungsreihe: Platzhalter gegen Layoutsprung', () => {
  let parent;
  let before;
  beforeEach(() => {
    document.body.innerHTML = '<div id="p"><div id="rows"></div></div>';
    parent = document.getElementById('p');
    before = document.getElementById('rows');
  });

  it('fügt sofort einen Platzhalter vor den Zeilen ein und ersetzt ihn nach dem Laden', async () => {
    renderBrands(parent, before);
    const ph = parent.querySelector('.lfx-plus-brands.is-loading');
    expect(ph).not.toBeNull();
    expect(ph.nextElementSibling).toBe(before);
    expect(ph.getAttribute('aria-hidden')).toBe('true');
    resolveList([{ id: 'c1', name: 'Reihe', imageUrl: '/img.jpg' }]);
    await flush();
    expect(parent.querySelector('.lfx-plus-brands.is-loading')).toBeNull();
    const row = parent.querySelector('.lfx-plus-brands');
    expect(row.nextElementSibling).toBe(before);
    expect(row.querySelectorAll('a.lfx-plus-brand')).toHaveLength(1);
  });

  it('entfernt den Platzhalter ohne Sammlungen und beim Aufräumen', async () => {
    const cleanup = renderBrands(parent, before);
    resolveList([]);
    await flush();
    expect(parent.querySelector('.lfx-plus-brands')).toBeNull();
    cleanup();
    const cleanup2 = renderBrands(parent, before);
    cleanup2();
    expect(parent.querySelector('.lfx-plus-brands')).toBeNull();
    resolveList([{ id: 'c1', name: 'Reihe' }]);
    await flush();
    expect(parent.querySelector('.lfx-plus-brands')).toBeNull();
  });
});
