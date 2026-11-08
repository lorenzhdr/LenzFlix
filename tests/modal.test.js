// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/js/core/api.js', async (orig) => {
  const real = await orig();
  return {
    ...real,
    getItem: vi.fn(),
    getSeasons: vi.fn(),
    getEpisodes: vi.fn(),
    getSimilar: vi.fn(),
    getNextUp: vi.fn(),
    getItems: vi.fn(),
    setFavorite: vi.fn(async () => ({})),
  };
});
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn(async () => true) }));

import * as api from '../src/js/core/api.js';
import { play } from '../src/js/core/playback.js';
import { clearCache } from '../src/js/core/cache.js';
import modal, { openModal, closeModal, findInterceptTarget } from '../src/js/features/modal.js';
import { formatRuntime, metaParts, qualityLabel, seasonsLabel, ratingText } from '../src/js/features/modal/format.js';

const flush = () => new Promise((r) => setTimeout(r, 0));
const wait = async (fn, n = 40) => { for (let i = 0; i < n; i++) { if (fn()) return; await flush(); } };

const series = { Id: 'S1', Type: 'Series', Name: 'Serie', Overview: 'Text', ChildCount: 2, ProductionYear: 2020, OfficialRating: 'FSK-12', People: [{ Id: 'p1', Name: 'Ann', Type: 'Actor' }], Genres: ['Drama'], UserData: {} };
const movie = { Id: 'M1', Type: 'Movie', Name: 'Film', RunTimeTicks: 67_200_000_000, Width: 1920, ProductionYear: 2021, UserData: { PlaybackPositionTicks: 5 } };
const seasons = [{ Id: 'SE1', Name: 'Staffel 1', IndexNumber: 1 }, { Id: 'SE2', Name: 'Staffel 2', IndexNumber: 2 }];
const mkEps = (season, n) => Array.from({ length: n }, (_, i) => ({ Id: `${season}-E${i + 1}`, Type: 'Episode', Name: `Folge ${i + 1}`, IndexNumber: i + 1, SeriesId: 'S1', SeasonId: season, RunTimeTicks: 600_000_000, UserData: {} }));

function setup() {
  window.ApiClient = { serverAddress: () => 'http://s', getCurrentUserId: () => 'u', accessToken: () => 't', serverId: () => 'srv' };
  document.documentElement.className = 'lfx-js';
  document.body.innerHTML = '';
  window.location.hash = '#/home';
  api.getItem.mockImplementation(async (id) => ({ S1: series, M1: movie }[id]));
  api.getSeasons.mockResolvedValue({ Items: seasons });
  api.getEpisodes.mockImplementation(async (_s, p) => ({ Items: mkEps(p.SeasonId, p.SeasonId === 'SE1' ? 14 : 3) }));
  api.getSimilar.mockResolvedValue({ Items: [movie] });
  api.getNextUp.mockResolvedValue({ Items: [] });
}

beforeEach(async () => { clearCache(); vi.clearAllMocks(); setup(); await flush(); });
afterEach(() => { modal.unmount(); document.documentElement.className = ''; });

function cardHtml(extra = '') {
  document.body.innerHTML = `<div class="lfx-card" data-lfx-id="M1" data-lfx-type="Movie" ${extra}><a class="lfx-card__link" href="#/details?id=M1"><img></a><button class="lfx-card__action">x</button></div>`;
  return document.querySelector('.lfx-card');
}
const click = (el, init = {}) => {
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
  el.dispatchEvent(ev);
  return ev;
};

describe('Klick-Abfang', () => {
  it('fängt Kartenklick ab und öffnet das Modal', async () => {
    modal.mount();
    const card = cardHtml();
    const ev = click(card.querySelector('img'));
    expect(ev.defaultPrevented).toBe(true);
    await wait(() => document.querySelector('.lfx-modal__title'));
    expect(document.querySelector('.lfx-modal')).not.toBeNull();
    expect(document.documentElement.classList.contains('lfx-modal-open')).toBe(true);
  });

  it('lässt Modifier, Mittelklick, Buttons und falsche Typen durch', () => {
    const card = cardHtml();
    const img = card.querySelector('img');
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect(findInterceptTarget(new MouseEvent('click', { bubbles: true, ...init }))).toBeNull();
    }
    const probe = (el, init = {}) => { let r; const f = (e) => { r = findInterceptTarget(e); }; document.addEventListener('click', f, { once: true }); el.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, ...init })); return r; };
    expect(probe(img)).toMatchObject({ id: 'M1' });
    expect(probe(card.querySelector('.lfx-card__action'))).toBeNull();
    expect(probe(img, { ctrlKey: true })).toBeNull();
    card.dataset.lfxType = 'CollectionFolder';
    expect(probe(img)).toBeNull();
    card.dataset.lfxType = 'Episode';
    expect(probe(img)).toMatchObject({ type: 'Episode' });
  });

  it('Jellyfin-Karten (.card[data-id]); Overlay-Buttons, Dialoge, Multi-Select, /video werden ignoriert', () => {
    document.body.innerHTML = '<div class="card" data-id="M1" data-type="Movie"><a class="cardImageContainer" data-action="link" href="#"><i></i></a><button class="cardOverlayButton" data-action="play"></button><div data-action="menu"></div></div>';
    const probe = (el) => { let r; const f = (e) => { r = findInterceptTarget(e); }; document.addEventListener('click', f, { once: true }); el.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })); return r; };
    expect(probe(document.querySelector('.cardImageContainer i'))).toMatchObject({ id: 'M1' });
    expect(probe(document.querySelector('.cardOverlayButton'))).toBeNull();
    expect(probe(document.querySelector('[data-action="menu"]'))).toBeNull();
    document.body.insertAdjacentHTML('beforeend', '<div class="itemSelectionPanel"></div>');
    expect(probe(document.querySelector('.cardImageContainer i'))).toBeNull();
    document.querySelector('.itemSelectionPanel').remove();
    window.location.hash = '#/video';
    expect(probe(document.querySelector('.cardImageContainer i'))).toBeNull();
    window.location.hash = '#/home';
    document.documentElement.classList.add('lfx-tv');
    expect(probe(document.querySelector('.cardImageContainer i'))).toBeNull();
  });
});

describe('open/close', () => {
  it('ohne lfx-js: Fallback auf Detailseite', () => {
    document.documentElement.className = '';
    openModal('M1');
    expect(window.location.hash).toContain('#/details?id=M1');
    expect(document.querySelector('.lfx-modal')).toBeNull();
  });

  it('Escape schließt, Fokus geht zurück, Rollen-Attribute gesetzt', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    await openModal('M1', { opener });
    const dlg = document.querySelector('.lfx-modal');
    expect(dlg.getAttribute('role')).toBe('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement.classList.contains('lfx-modal__close')).toBe(true);
    expect(history.state.lfxModal).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(() => !document.querySelector('.lfx-modal'));
    expect(document.querySelector('.lfx-modal')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.documentElement.classList.contains('lfx-modal-open')).toBe(false);
  });

  it('Overlay-Klick und X schließen; Tab bleibt im Modal', async () => {
    await openModal('M1');
    const overlay = document.getElementById('lfx-modal');
    const focusable = [...document.querySelectorAll('.lfx-modal button, .lfx-modal a[href]')].filter((e) => !e.closest('[hidden]'));
    focusable[focusable.length - 1].focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(focusable[0]);
    overlay.click();
    await wait(() => !document.querySelector('.lfx-modal'));
    expect(document.querySelector('.lfx-modal')).toBeNull();
    await openModal('M1');
    document.querySelector('.lfx-modal__close').click();
    await wait(() => !document.querySelector('.lfx-modal'));
    expect(document.querySelector('.lfx-modal')).toBeNull();
  });

  it('unmount räumt Modal, Klasse und Listener auf', async () => {
    modal.mount();
    await openModal('M1');
    modal.unmount();
    expect(document.querySelector('.lfx-modal')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-modal-open')).toBe(false);
    const card = cardHtml();
    expect(click(card.querySelector('img')).defaultPrevented).toBe(false);
  });

  it('Film: Fortsetzen-Label und play(resume)', async () => {
    await openModal('M1');
    const btn = document.querySelector('.lfx-modal__play');
    expect(btn.textContent).toContain('Fortsetzen');
    btn.click();
    await flush();
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ Id: 'M1' }), { resume: true });
    closeModal();
  });
});

describe('Serien', () => {
  it('Episode öffnet die Serie mit vorgewählter Staffel/Episode', async () => {
    const ep = { Id: 'SE2-E2', Type: 'Episode', Name: 'x', SeriesId: 'S1', SeasonId: 'SE2' };
    await openModal(ep);
    await wait(() => document.querySelector('.lfx-modal__ep'));
    expect(api.getItem).toHaveBeenCalledWith('S1', expect.anything());
    expect(document.querySelector('.lfx-modal__seasonbtn').textContent).toContain('Staffel 2');
    expect(document.querySelector('.lfx-modal__ep.is-selected').dataset.id).toBe('SE2-E2');
  });

  it('Staffelwechsel lädt Episoden; Mehr anzeigen zeigt alle', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    expect(document.querySelectorAll('.lfx-modal__ep').length).toBe(10);
    document.querySelector('.lfx-modal__eplist .lfx-modal__more-btn').click();
    expect(document.querySelectorAll('.lfx-modal__ep').length).toBe(14);
    document.querySelector('.lfx-modal__seasonbtn').click();
    document.querySelector('.lfx-modal__seasonopt[data-id="SE2"]').click();
    await wait(() => document.querySelectorAll('.lfx-modal__ep').length === 3);
    expect(api.getEpisodes).toHaveBeenCalledWith('S1', expect.objectContaining({ SeasonId: 'SE2' }));
    expect(document.querySelectorAll('.lfx-modal__ep').length).toBe(3);
  });

  it('Abspielen bei Serie nutzt NextUp', async () => {
    api.getNextUp.mockResolvedValue({ Items: [{ Id: 'N1', Type: 'Episode', UserData: { PlaybackPositionTicks: 9 } }] });
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__play-text').textContent === 'Fortsetzen');
    document.querySelector('.lfx-modal__play').click();
    await flush(); await flush();
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ Id: 'N1' }), { resume: true });
  });

  it('Ähnliche Titel: 6 sichtbar, Mehr anzeigen', async () => {
    api.getSimilar.mockResolvedValue({ Items: Array.from({ length: 12 }, (_, i) => ({ ...movie, Id: `X${i}` })) });
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__card'));
    expect(document.querySelectorAll('.lfx-modal__card').length).toBe(6);
    document.querySelector('.lfx-modal__grid ~ .lfx-modal__more .lfx-modal__more-btn').click();
    expect(document.querySelectorAll('.lfx-modal__card').length).toBe(12);
  });
});

describe('Formatierung', () => {
  it('Laufzeit, Staffeln, Qualität, Altersfreigabe, Meta', () => {
    expect(formatRuntime(67_200_000_000)).toBe('1 Std. 52 Min.');
    expect(formatRuntime(54_000_000_000)).toBe('1 Std. 30 Min.');
    expect(formatRuntime(72_000_000_000)).toBe('2 Std.');
    expect(formatRuntime(162_000_000_000)).toBe('4 Std. 30 Min.');
    expect(formatRuntime(0)).toBe('');
    expect(seasonsLabel(1)).toBe('1 Staffel');
    expect(seasonsLabel(3)).toBe('3 Staffeln');
    expect(qualityLabel({ Width: 3840 })).toBe('4K');
    expect(qualityLabel({ MediaSources: [{ MediaStreams: [{ Type: 'Video', Width: 1920 }] }] })).toBe('HD');
    expect(qualityLabel({ Width: 720 })).toBe('');
    expect(ratingText('FSK-16')).toBe('Freigegeben ab 16 Jahren');
    expect(ratingText('FSK-0')).toBe('Ohne Altersbeschränkung');
    expect(metaParts(series)).toMatchObject({ year: '2020', length: '2 Staffeln', rating: 'FSK-12' });
    expect(metaParts(movie)).toMatchObject({ length: '1 Std. 52 Min.', quality: 'HD' });
  });
});
