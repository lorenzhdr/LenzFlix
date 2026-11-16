// @vitest-environment jsdom
// B010 (Marke nach Designwechsel), B007 (kein Mount unter store), A038 (Abfragen gecacht).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const themeState = { id: 'flix', listeners: new Set() };
vi.mock('../src/js/core/theme.js', () => ({
  brandName: () => ({ flix: 'LENZFLIX', plus: 'LENZ+' }[themeState.id] || 'X'),
  isTheme: (id) => themeState.id === id,
  getTheme: () => themeState.id,
  onThemeChange: (fn) => { themeState.listeners.add(fn); return () => themeState.listeners.delete(fn); },
}));
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
import { clearCache } from '../src/js/core/cache.js';
import { resetSourceCache } from '../src/js/features/rows/sources.js';

const mk = (id, type) => ({ Id: id, Name: id, Type: type, DateCreated: '2026-11-08T12:00:00Z', UserData: { PlayCount: 1 } });
const route = { path: '/home', params: new URLSearchParams('lfx=new') };

describe('Neu und beliebt (Welle 2)', () => {
  beforeEach(() => {
    themeState.id = 'flix';
    themeState.listeners.clear();
    clearCache();
    resetSourceCache();
    api.getItems.mockReset();
    api.getItems.mockImplementation(async (p) => (p.IncludeItemTypes === 'Episode' ? { Items: [] } : { Items: [mk('i1', 'Movie'), mk('i2', 'Series')] }));
    document.body.innerHTML = '<div id="indexPage"><div id="homeTab"></div></div>';
  });
  afterEach(() => { feature.unmount(); document.body.innerHTML = ''; });

  it('B010: Überschrift und Pille folgen dem Designwechsel', async () => {
    feature.mount();
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-np__entry').length).toBe(2));
    expect(document.querySelector('#lfx-np-new .lfx-np__heading').textContent).toBe('Neu bei LENZFLIX');
    themeState.id = 'plus';
    themeState.listeners.forEach((fn) => fn());
    expect(document.querySelector('#lfx-np-new .lfx-np__heading').textContent).toBe('Neu bei LENZ+');
    expect(document.querySelector('.lfx-np__pill[data-np="new"]').textContent).toContain('Neu bei LENZ+');
  });

  it('B007: unter store kein Match', () => {
    expect(feature.match(route)).toBe(true);
    themeState.id = 'store';
    expect(feature.match(route)).toBe(false);
  });

  it('A038: zweiter Besuch lädt nicht erneut', async () => {
    feature.mount();
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-np__entry').length).toBe(2));
    const n = api.getItems.mock.calls.filter((c) => c[0].IncludeItemTypes !== 'Episode').length;
    feature.unmount();
    feature.mount();
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-np__entry').length).toBe(2));
    expect(api.getItems.mock.calls.filter((c) => c[0].IncludeItemTypes !== 'Episode').length).toBe(n);
  });
});
