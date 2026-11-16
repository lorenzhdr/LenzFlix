// @vitest-environment jsdom
// L027/B051: aktive Pille oben (scrollY 0) ist immer die erste; aria-current folgt is-active.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual,
    isReady: () => true,
    getUserId: () => 'u1',
    getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 'srv' }),
    getItems: vi.fn(),
    setFavorite: vi.fn(),
  };
});
vi.mock('../src/js/core/download.js', () => ({ canDownload: vi.fn(async () => false), startDownload: vi.fn(), isChooserOpen: vi.fn(() => false) }));
vi.mock('../src/js/core/itemmenu.js', () => ({ openItemMenu: vi.fn(), isMenuOpen: vi.fn(() => false), onItemsChanged: vi.fn(() => () => {}) }));
vi.mock('../src/js/features/modal.js', () => ({ openModal: vi.fn() }));

import * as api from '../src/js/core/api.js';
import feature from '../src/js/features/newpopular.js';
import { resetSourceCache } from '../src/js/features/rows/sources.js';

const mk = (id, type) => ({ Id: id, Name: id, Type: type, DateCreated: '2026-11-08T12:00:00Z', UserData: { PlayCount: 1 } });
const active = () => document.querySelector('.lfx-np__pill.is-active')?.dataset.np;

describe('Neu und beliebt: aktive Pille', () => {
  let rectSpy;
  beforeEach(() => {
    resetSourceCache();
    api.getItems.mockReset();
    api.getItems.mockImplementation(async (p) => (p.IncludeItemTypes === 'Episode' ? { Items: [] } : { Items: [mk('i1', 'Movie'), mk('i2', 'Series')] }));
    document.body.innerHTML = '<div id="indexPage"><div id="homeTab"></div></div>';
  });
  afterEach(() => { rectSpy?.mockRestore(); feature.unmount(); document.body.innerHTML = ''; });

  it('L027: oben (scrollY 0) gewinnt der erste Abschnitt, auch wenn alle Oberkanten unter der Schwelle liegen', async () => {
    feature.mount();
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-np__entry').length).toBe(2));
    rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
      return { top: this.classList.contains('lfx-np__section') ? 40 : 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
    });
    window.dispatchEvent(new Event('scroll'));
    await new Promise((r) => setTimeout(r, 80));
    expect(active()).toBe('new');
  });

  it('B051: aria-current="true" nur an der aktiven Pille', async () => {
    feature.mount();
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-np__pill').length).toBe(4));
    const cur = () => [...document.querySelectorAll('.lfx-np__pill[aria-current]')].map((p) => p.dataset.np);
    expect(cur()).toEqual(['new']);
    document.querySelector('.lfx-np__pill[data-np="watched"]').click();
    expect(cur()).toEqual(['watched']);
    expect(document.querySelector('.lfx-np__pill[data-np="watched"]').getAttribute('aria-current')).toBe('true');
  });
});
