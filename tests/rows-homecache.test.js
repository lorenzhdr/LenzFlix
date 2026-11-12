// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const userState = vi.hoisted(() => ({ id: 'u1' }));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual,
    isReady: () => true,
    getUserId: () => userState.id,
    getAuth: () => ({ address: 'http://x', userId: userState.id, token: 't', serverId: 'srv' }),
    getViews: vi.fn(),
    getJson: vi.fn(),
    getItems: vi.fn(),
    getResume: vi.fn(),
    getNextUp: vi.fn(),
    getLatest: vi.fn(),
    getSimilar: vi.fn(),
  };
});
vi.mock('../src/js/core/theme.js', () => ({ getTheme: () => 'flix', brandName: () => 'LENZFLIX' }));

import * as api from '../src/js/core/api.js';
import { render } from '../src/js/features/rows.js';
import { createCard } from '../src/js/features/rows/card.js';
import { resetSourceCache, buildRowDefs, peekRowDefs } from '../src/js/features/rows/sources.js';
import { clearCache } from '../src/js/core/cache.js';

const mk = (id) => ({ Id: id, Type: 'Movie', Name: id, ImageTags: { Thumb: 't' }, DateCreated: new Date().toISOString() });
const many = (p, n = 12) => Array.from({ length: n }, (_, i) => mk(`${p}${i}`));

function setupApi() {
  api.getViews.mockResolvedValue({ Items: [{ Id: 'vm', CollectionType: 'movies' }] });
  api.getJson.mockResolvedValue({ Items: [{ Name: 'Action' }] });
  api.getResume.mockResolvedValue({ Items: [mk('r1')] });
  api.getNextUp.mockResolvedValue({ Items: [] });
  api.getLatest.mockResolvedValue(many('l'));
  api.getSimilar.mockResolvedValue({ Items: [] });
  api.getItems.mockImplementation(async (p) => {
    if (p.IncludeItemTypes === 'Episode' && !p.Genres) return { Items: [] };
    return { Items: many('x') };
  });
}

const settle = () => vi.waitFor(() => expect(document.querySelectorAll('.lfx-row:not(.is-loading)').length).toBeGreaterThan(3));
const calls = () => [api.getResume, api.getLatest, api.getItems].reduce((n, f) => n + f.mock.calls.length, 0);

describe('Startseiten-Cache der Zeilen', () => {
  let slot;
  beforeEach(() => {
    userState.id = 'u1';
    resetSourceCache();
    clearCache();
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setupApi();
    document.body.innerHTML = '<div id="s"></div>';
    slot = document.getElementById('s');
  });
  afterEach(() => vi.restoreAllMocks());

  it('zweiter Mount innerhalb der TTL: kein neuer Abruf, sofort gefüllt ohne Skeleton, erste Karten ohne lazy', async () => {
    const first = render(slot);
    await settle();
    expect(slot.querySelector('.lfx-card__img').getAttribute('loading')).toBe('lazy'); // Erstbesuch wie bisher
    const titles1 = [...slot.querySelectorAll('.lfx-row__title')].map((t) => t.textContent);
    first();
    const before = calls();
    const second = render(slot);
    // synchron: keine Skeletons, keine Wartezeit
    expect(slot.querySelector('.is-loading')).toBeNull();
    expect(slot.querySelectorAll('.lfx-row').length).toBeGreaterThan(3);
    const img = slot.querySelector('.lfx-card__img');
    expect(img.hasAttribute('loading')).toBe(false);
    expect(img.hasAttribute('decoding')).toBe(false);
    expect([...slot.querySelectorAll('.lfx-row__title')].map((t) => t.textContent)).toEqual(titles1);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls()).toBe(before);
    // weit hinten liegende Karten (> 8) bleiben lazy
    const imgs = slot.querySelector('[data-lfx-row="latest-movies"]').querySelectorAll('.lfx-card__img');
    expect(imgs[0].hasAttribute('loading')).toBe(false);
    expect(imgs[imgs.length - 1].getAttribute('loading')).toBe('lazy');
    second();
  });

  it('nach clearCache("home:") wieder Abruf', async () => {
    const first = render(slot);
    await settle();
    first();
    clearCache('home:');
    const before = calls();
    const second = render(slot);
    expect(slot.querySelector('.lfx-row')).toBeNull(); // nicht sofort gefüllt
    await settle();
    expect(calls()).toBeGreaterThan(before);
    second();
  });

  it('anderer Nutzer hat einen eigenen Cache', async () => {
    const first = render(slot);
    await settle();
    first();
    userState.id = 'u2';
    expect(peekRowDefs({ deferCharts: true })).toBeUndefined();
    const before = calls();
    const second = render(slot);
    expect(slot.querySelector('.lfx-row')).toBeNull(); // nicht sofort gefüllt
    await settle();
    expect(calls()).toBeGreaterThan(before);
    second();
  });

  it('Zufalls-Zeilen bleiben innerhalb der TTL gleich', async () => {
    let n = 0;
    api.getItems.mockImplementation(async (p) => {
      if (p.IncludeItemTypes === 'Episode' && !p.Genres) return { Items: [] };
      n += 1;
      return { Items: many(p.SortBy === 'Random' ? `z${n}-` : 'x') };
    });
    const first = render(slot);
    await settle();
    const ids1 = [...slot.querySelectorAll('[data-lfx-row="genre-Action"] .lfx-card')].map((c) => c.dataset.lfxId);
    first();
    const second = render(slot);
    const ids2 = [...slot.querySelectorAll('[data-lfx-row="genre-Action"] .lfx-card')].map((c) => c.dataset.lfxId);
    expect(ids1.length).toBeGreaterThan(0);
    expect(ids2).toEqual(ids1);
    second();
  });

  it('Zeilenliste ohne Bibliotheken/Genres (Fehler) wird nicht gecacht', async () => {
    api.getViews.mockRejectedValueOnce(new Error('x'));
    await buildRowDefs({ deferCharts: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(peekRowDefs({ deferCharts: true })).toBeUndefined();
    await buildRowDefs({ deferCharts: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(peekRowDefs({ deferCharts: true })).toBeDefined();
  });
});

describe('createCard eager', () => {
  const item = { Id: 'm', Type: 'Movie', Name: 'M', ImageTags: { Thumb: 't', Primary: 'p', Logo: 'l' } };
  it('Standard lazy/async, eager ohne beides', () => {
    for (const kind of ['landscape', 'top10']) {
      const lazy = createCard(item, { kind }).querySelector('img');
      expect(lazy.getAttribute('loading')).toBe('lazy');
      expect(lazy.getAttribute('decoding')).toBe('async');
      for (const i of createCard(item, { kind, eager: true }).querySelectorAll('img')) {
        expect(i.hasAttribute('loading')).toBe(false);
        expect(i.hasAttribute('decoding')).toBe(false);
      }
    }
  });
});
