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
    setPlayed: vi.fn(async () => {}),
  };
});
vi.mock('../src/js/core/sheet.js', () => ({ confirmAction: vi.fn() }));
vi.mock('../src/js/core/toast.js', () => ({ toast: vi.fn() }));
vi.mock('../src/js/core/itemmenu.js', () => ({
  openItemMenu: vi.fn(() => true),
  isMenuOpen: vi.fn(() => false),
  onItemsChanged: vi.fn(() => vi.fn()),
}));
vi.mock('../src/js/core/download.js', () => ({
  startDownload: vi.fn(async () => {}),
  canDownload: vi.fn(async () => false),
  isChooserOpen: vi.fn(() => false),
}));
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn(async () => true) }));

import * as api from '../src/js/core/api.js';
import { play } from '../src/js/core/playback.js';
import { openItemMenu, onItemsChanged } from '../src/js/core/itemmenu.js';
import { startDownload, canDownload, isChooserOpen } from '../src/js/core/download.js';
import { confirmAction } from '../src/js/core/sheet.js';
import { toast } from '../src/js/core/toast.js';
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

describe('Aktionen, Menü, Download', () => {
  it('Button-Leiste: Daumen mit Icon-Wechsel, Download hidden bis erlaubt, Mehr', async () => {
    canDownload.mockResolvedValue(false);
    await openModal('M1');
    const like = document.querySelector('.lfx-modal__actions .lfx-modal__round--like');
    const dl = document.querySelector('.lfx-modal__actions .lfx-modal__round--dl');
    const more = document.querySelector('.lfx-modal__actions .lfx-modal__round--menu');
    expect(like && dl && more).toBeTruthy();
    expect(dl.hidden).toBe(true);
    expect(dl.getAttribute('aria-label')).toBe('Herunterladen');
    expect(more.getAttribute('aria-haspopup')).toBe('menu');
    expect(more.getAttribute('aria-label')).toBe('Mehr');
    const off = like.innerHTML;
    expect(like.getAttribute('aria-pressed')).toBe('false');
    like.click();
    expect(like.classList.contains('is-on')).toBe(true);
    expect(like.innerHTML).not.toBe(off);
    more.click();
    expect(openItemMenu).toHaveBeenCalledWith(expect.objectContaining({ Id: 'M1' }), more);
  });

  it('Meine Liste: Modifier --fav, is-on, aria-pressed und Icon-Wechsel', async () => {
    await openModal('M1');
    const fav = document.querySelector('.lfx-modal__actions .lfx-modal__round--fav');
    expect(fav).not.toBeNull();
    const off = fav.innerHTML;
    expect(fav.classList.contains('is-on')).toBe(false);
    expect(fav.getAttribute('aria-pressed')).toBe('false');
    fav.click();
    expect(fav.classList.contains('is-on')).toBe(true);
    expect(fav.getAttribute('aria-pressed')).toBe('true');
    expect(fav.innerHTML).not.toBe(off);
    fav.click();
    expect(fav.classList.contains('is-on')).toBe(false);
    expect(fav.innerHTML).toBe(off);
  });

  it('Karten-Button „Meine Liste“ trägt --fav', async () => {
    api.getSimilar.mockResolvedValue({ Items: [{ ...movie, Id: 'X1' }] });
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__card'));
    const fav = document.querySelector('.lfx-modal__card .lfx-modal__round--fav');
    expect(fav).not.toBeNull();
    fav.click();
    expect(fav.classList.contains('is-on')).toBe(true);
    expect(fav.getAttribute('aria-pressed')).toBe('true');
  });

  it('Download wird sichtbar, wenn canDownload true; Klick startet Download', async () => {
    canDownload.mockResolvedValue(true);
    await openModal('M1');
    const dl = document.querySelector('.lfx-modal__actions .lfx-modal__round--dl');
    await wait(() => !dl.hidden);
    expect(dl.hidden).toBe(false);
    dl.click();
    expect(startDownload).toHaveBeenCalledWith(expect.objectContaining({ Id: 'M1' }), dl);
  });

  it('Serie: Download-Label "Episoden herunterladen"', async () => {
    await openModal('S1');
    expect(document.querySelector('.lfx-modal__actions .lfx-modal__round--dl').getAttribute('aria-label')).toBe('Episoden herunterladen');
  });

  it('Episodenzeile: data-lfx-id, Aktionen spielen nicht ab, siblings übergeben', async () => {
    canDownload.mockResolvedValue(true);
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    const row = document.querySelector('.lfx-modal__ep');
    expect(row.dataset.lfxId).toBe('SE1-E1');
    expect(row.dataset.lfxType).toBe('Episode');
    const acts = row.querySelector(':scope > .lfx-modal__epactions');
    expect(acts).not.toBeNull();
    expect(row.lastElementChild).toBe(acts);
    const dl = acts.querySelector('.lfx-modal__round--small.lfx-modal__round--dl');
    const more = acts.querySelector('.lfx-modal__round--small.lfx-modal__round--menu');
    expect(more.getAttribute('aria-label')).toContain('Folge 1');
    await wait(() => !dl.hidden);
    expect(dl.hidden).toBe(false);
    dl.click();
    more.click();
    for (const b of [dl, more]) {
      const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      b.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    }
    expect(play).not.toHaveBeenCalled();
    expect(startDownload).toHaveBeenCalledWith(expect.objectContaining({ Id: 'SE1-E1' }), dl);
    const [item, btn, opts] = openItemMenu.mock.calls.at(-1);
    expect(item.Id).toBe('SE1-E1');
    expect(btn).toBe(more);
    expect(opts.siblings.length).toBe(14);
    row.click();
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ Id: 'SE1-E1' }), expect.anything());
  });
});

describe('Gesehen-Button', () => {
  const lastConfirm = () => confirmAction.mock.calls.at(-1)[0];

  it('Film: Kopfbutton hinter Mehr, Zustand aus UserData.Played, Klick -> setPlayed, Wiedergabe unberührt', async () => {
    await openModal('M1');
    const actions = document.querySelector('.lfx-modal__actions');
    const btn = actions.querySelector('.lfx-modal__round--played');
    expect(btn).not.toBeNull();
    expect(actions.lastElementChild).toBe(btn);
    expect(btn.classList.contains('is-on')).toBe(false);
    expect(btn.getAttribute('aria-label')).toBe('Als gesehen markieren');
    btn.click();
    expect(btn.classList.contains('is-on')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe('Als ungesehen markieren');
    expect(api.setPlayed).toHaveBeenCalledWith('M1', true);
    expect(confirmAction).not.toHaveBeenCalled();
    await flush();
    btn.click();
    expect(btn.classList.contains('is-on')).toBe(false);
    expect(api.setPlayed).toHaveBeenLastCalledWith('M1', false);
  });

  it('Film mit UserData.Played startet aktiv; Fehler rollt zurück und zeigt Toast', async () => {
    api.getItem.mockImplementation(async (id) => ({ S1: series, M1: { ...movie, UserData: { Played: true } } }[id]));
    await openModal('M1');
    const btn = document.querySelector('.lfx-modal__actions .lfx-modal__round--played');
    expect(btn.classList.contains('is-on')).toBe(true);
    api.setPlayed.mockRejectedValueOnce(new Error('x'));
    btn.click();
    expect(btn.classList.contains('is-on')).toBe(false);
    await flush(); await flush();
    expect(btn.classList.contains('is-on')).toBe(true);
    expect(toast).toHaveBeenCalledWith('Konnte nicht gespeichert werden');
  });

  it('Folgenzeile: Button immer im DOM, Klick spielt nicht ab, Zeile bekommt is-played', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    const row = document.querySelector('.lfx-modal__ep');
    const btn = row.querySelector('.lfx-modal__epactions > .lfx-modal__round--played');
    expect(btn).toBe(row.querySelector('.lfx-modal__epactions').firstElementChild);
    expect(btn.classList.contains('lfx-modal__round--small')).toBe(true);
    expect(row.classList.contains('is-played')).toBe(false);
    expect(row.querySelector('.lfx-modal__ep-seen')).toBeNull();
    btn.click();
    expect(play).not.toHaveBeenCalled();
    expect(api.setPlayed).toHaveBeenCalledWith('SE1-E1', true);
    expect(row.classList.contains('is-played')).toBe(true);
    expect(row.querySelector('.lfx-modal__ep-seen')).not.toBeNull();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    btn.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    await flush();
    btn.click();
    expect(row.classList.contains('is-played')).toBe(false);
    expect(row.querySelector('.lfx-modal__ep-seen')).toBeNull();
  });

  it('Folge: Fehler beim Speichern rollt Zeile zurück', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    const row = document.querySelector('.lfx-modal__ep');
    api.setPlayed.mockRejectedValueOnce(new Error('x'));
    row.querySelector('.lfx-modal__round--played').click();
    await flush(); await flush();
    expect(row.classList.contains('is-played')).toBe(false);
    expect(toast).toHaveBeenCalledWith('Konnte nicht gespeichert werden');
  });

  it('Staffel-Button: Bestätigungs-Sheet, Abbrechen ruft nichts auf, Bestätigen setzt und rendert neu', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    const btn = document.querySelector('.lfx-modal__eps-tools .lfx-modal__round--played');
    expect(btn).not.toBeNull();
    expect(btn.classList.contains('is-on')).toBe(false);
    // Mit Staffelauswahl bilden Button und Dropdown einen zusammengesetzten Block
    expect(btn.parentElement.classList.contains('lfx-modal__eps-tools--joined')).toBe(Boolean(document.querySelector('.lfx-modal__seasonbtn')));
    btn.click();
    expect(confirmAction).toHaveBeenCalledTimes(1);
    expect(lastConfirm()).toMatchObject({ title: '14 Folgen als gesehen markieren?', confirmLabel: 'Als gesehen markieren', anchorEl: btn });
    expect(api.setPlayed).not.toHaveBeenCalled();
    // Server markiert rekursiv: Neuladen liefert alle Folgen als gesehen
    api.getEpisodes.mockImplementation(async (_s, p) => ({ Items: mkEps(p.SeasonId, 14).map((e) => ({ ...e, UserData: { Played: true } })) }));
    lastConfirm().onConfirm();
    await wait(() => document.querySelector('.lfx-modal__eps-tools .lfx-modal__round--played.is-on'));
    expect(api.setPlayed).toHaveBeenCalledWith('SE1', true);
    expect(api.setPlayed).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.lfx-modal__ep').classList.contains('is-played')).toBe(true);
    expect(toast).toHaveBeenCalledWith('14 Folgen als gesehen markiert');
  });

  it('Staffel: alle gesehen -> aktiv, Rückfrage „ungesehen“; Folgen-Toggle aktualisiert den Staffel-Button', async () => {
    api.getEpisodes.mockImplementation(async (_s, p) => ({ Items: mkEps(p.SeasonId, 2).map((e) => ({ ...e, UserData: { Played: true } })) }));
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    const btn = document.querySelector('.lfx-modal__eps-tools .lfx-modal__round--played');
    expect(btn.classList.contains('is-on')).toBe(true);
    btn.click();
    expect(lastConfirm().title).toBe('2 Folgen als ungesehen markieren?');
    expect(lastConfirm().confirmLabel).toBe('Als ungesehen markieren');
    document.querySelector('.lfx-modal__ep .lfx-modal__round--played').click();
    expect(btn.classList.contains('is-on')).toBe(false);
  });

  it('Staffel: teilweise gesetzter Status wird einzeln nachgezogen', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    api.getEpisodes.mockImplementation(async (_s, p) => ({ Items: mkEps(p.SeasonId, 3).map((e, i) => ({ ...e, UserData: { Played: i === 0 } })) }));
    document.querySelector('.lfx-modal__eps-tools .lfx-modal__round--played').click();
    lastConfirm().onConfirm();
    await wait(() => api.setPlayed.mock.calls.length >= 3);
    await flush();
    const ids = api.setPlayed.mock.calls.map((c) => c[0]);
    expect(ids).toEqual(expect.arrayContaining(['SE1', 'SE1-E2', 'SE1-E3']));
    expect(ids).not.toContain('SE1-E1');
  });

  it('Serien-Kopf: Rückfrage nennt Gesamtzahl, Abbrechen ändert nichts', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    const btn = document.querySelector('.lfx-modal__actions .lfx-modal__round--played');
    expect(btn.getAttribute('aria-label')).toBe('Ganze Serie als gesehen markieren');
    btn.click();
    await wait(() => confirmAction.mock.calls.length);
    expect(lastConfirm()).toMatchObject({ title: '17 Folgen als gesehen markieren?', anchorEl: btn });
    expect(api.setPlayed).not.toHaveBeenCalled();
    expect(btn.classList.contains('is-on')).toBe(false);
  });

  it('Serien-Kopf: Bestätigen -> setPlayed(Serie), Button aktiv, Toast', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    const btn = document.querySelector('.lfx-modal__actions .lfx-modal__round--played');
    btn.click();
    await wait(() => confirmAction.mock.calls.length);
    api.getEpisodes.mockImplementation(async (_s, p) => ({ Items: mkEps(p.SeasonId, 2).map((e) => ({ ...e, UserData: { Played: true } })) }));
    lastConfirm().onConfirm();
    await wait(() => btn.classList.contains('is-on'));
    expect(api.setPlayed).toHaveBeenCalledWith('S1', true);
    expect(toast).toHaveBeenCalledWith('Serie als gesehen markiert');
  });
});

describe('Escape bei Dialog, Änderungen', () => {
  const esc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

  it('Escape schließt nicht, solange .dialogContainer oder Download-Sheet offen ist', async () => {
    await openModal('M1');
    const dlg = document.createElement('div');
    dlg.className = 'dialogContainer';
    document.body.append(dlg);
    esc();
    await flush();
    expect(document.querySelector('.lfx-modal')).not.toBeNull();
    dlg.remove();
    isChooserOpen.mockReturnValueOnce(true);
    esc();
    await flush();
    expect(document.querySelector('.lfx-modal')).not.toBeNull();
    esc();
    await wait(() => !document.querySelector('.lfx-modal'), 1000);
    expect(document.querySelector('.lfx-modal')).toBeNull();
  });

  it('onItemsChanged: removed schließt, Abo wird beim Schließen beendet', async () => {
    const unsub = vi.fn();
    onItemsChanged.mockReturnValue(unsub);
    await openModal('M1');
    const cb = onItemsChanged.mock.calls.at(-1)[0];
    cb({ removed: ['M1'], updated: [] });
    await wait(() => !document.querySelector('.lfx-modal'), 1000);
    expect(document.querySelector('.lfx-modal')).toBeNull();
    expect(unsub).toHaveBeenCalled();
  });

  it('onItemsChanged: entfernte Episode verschwindet, updated lädt neu', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    const cb = onItemsChanged.mock.calls.at(-1)[0];
    cb({ removed: ['SE1-E1'], updated: [] });
    expect(document.querySelector('.lfx-modal__ep[data-id="SE1-E1"]')).toBeNull();
    const calls = api.getItem.mock.calls.length;
    cb({ removed: [], updated: ['S1'] });
    await wait(() => api.getItem.mock.calls.length > calls);
    expect(api.getItem.mock.calls.length).toBeGreaterThan(calls);
    await flush();
    expect(document.querySelector('.lfx-modal')).not.toBeNull();
  });
});

describe('Scrollverhalten', () => {
  let scrollTo;
  let scrollIntoView;
  let rafQueue;
  const runRaf = () => { const q = rafQueue; rafQueue = []; q.forEach((fn) => fn(0)); };
  const epCard = { Id: 'SE2-E2', Type: 'Episode', Name: 'x', SeriesId: 'S1', SeasonId: 'SE2' };

  beforeEach(() => {
    scrollTo = vi.fn();
    scrollIntoView = vi.fn();
    rafQueue = [];
    Element.prototype.scrollTo = scrollTo;
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.stubGlobal('requestAnimationFrame', (fn) => rafQueue.push(fn));
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete Element.prototype.scrollTo;
    delete Element.prototype.scrollIntoView;
  });

  it('Episoden-Karte: Overlay bleibt oben, danach genau ein sanftes scrollTo, kein scrollIntoView', async () => {
    await openModal(epCard);
    await wait(() => document.querySelector('.lfx-modal__ep.is-selected'));
    const overlay = document.getElementById('lfx-modal');
    expect(overlay.scrollTop).toBe(0);
    expect(scrollTo).not.toHaveBeenCalled();
    runRaf();
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(overlay.scrollTop).toBe(0);
  });

  it('Film und Serie ohne Episodenwahl: kein scrollTo', async () => {
    await openModal('M1');
    runRaf();
    closeModal();
    await wait(() => !document.querySelector('.lfx-modal'));
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    runRaf();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('Staffelwechsel: kein Overlay-Scroll', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    document.querySelector('.lfx-modal__seasonbtn').click();
    document.querySelector('.lfx-modal__seasonopt[data-id="SE2"]').click();
    await wait(() => document.querySelectorAll('.lfx-modal__ep').length === 3);
    runRaf();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('Staffelwechsel nach Episoden-Karte: kein zweites scrollTo', async () => {
    await openModal(epCard);
    await wait(() => document.querySelector('.lfx-modal__ep.is-selected'));
    runRaf();
    scrollTo.mockClear();
    document.querySelector('.lfx-modal__seasonbtn').click();
    document.querySelector('.lfx-modal__seasonopt[data-id="SE1"]').click();
    await wait(() => document.querySelectorAll('.lfx-modal__ep').length === 10);
    runRaf();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('Refresh (onChanged updated): kein Overlay-Scroll', async () => {
    await openModal(epCard);
    await wait(() => document.querySelector('.lfx-modal__ep.is-selected'));
    runRaf();
    scrollTo.mockClear();
    const cb = onItemsChanged.mock.calls.at(-1)[0];
    const calls = api.getEpisodes.mock.calls.length;
    cb({ removed: [], updated: ['S1'] });
    await wait(() => api.getEpisodes.mock.calls.length > calls);
    await flush(); await flush();
    runRaf();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.getElementById('lfx-modal').scrollTop).toBe(0);
  });

  it('Nutzereingriff (wheel) vor rAF: kein scrollTo', async () => {
    await openModal(epCard);
    await wait(() => document.querySelector('.lfx-modal__ep.is-selected'));
    document.getElementById('lfx-modal').dispatchEvent(new Event('wheel', { bubbles: true }));
    runRaf();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('Schließen vor rAF: kein scrollTo', async () => {
    await openModal(epCard);
    await wait(() => document.querySelector('.lfx-modal__ep.is-selected'));
    modal.unmount();
    runRaf();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('prefers-reduced-motion: behavior auto', async () => {
    const mm = window.matchMedia;
    window.matchMedia = vi.fn((q) => ({ matches: /reduced-motion/.test(q), media: q, addEventListener() {}, removeEventListener() {} }));
    try {
      await openModal(epCard);
      await wait(() => document.querySelector('.lfx-modal__ep.is-selected'));
      runRaf();
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
    } finally {
      window.matchMedia = mm;
    }
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

function touch(target, type, x, y) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const list = [{ clientX: x, clientY: y, identifier: 0 }];
  e.touches = type === 'touchend' || type === 'touchcancel' ? [] : list;
  e.changedTouches = list;
  target.dispatchEvent(e);
  return e;
}
/** Abwaertsgeste mit Fake-Timern (Date.now + setTimeout muessen gefakt sein). */
function swipeDown(target, to = 200) {
  touch(target, 'touchstart', 50, 10);
  vi.advanceTimersByTime(100);
  touch(target, 'touchmove', 50, to / 2);
  vi.advanceTimersByTime(100);
  touch(target, 'touchmove', 50, to);
  touch(target, 'touchend', 50, to);
}

describe('Modal-Wischgeste', () => {
  let mm;
  let backSpy;
  beforeEach(() => {
    mm = window.matchMedia;
    backSpy = vi.spyOn(history, 'back').mockImplementation(() => {});
  });
  afterEach(() => {
    window.matchMedia = mm;
    backSpy.mockRestore();
    vi.useRealTimers();
  });

  async function openMobile(matches) {
    window.matchMedia = vi.fn((q) => ({ matches: matches && !/reduced-motion/.test(q) }));
    modal.mount();
    await openModal('M1');
    await wait(() => document.querySelector('.lfx-modal__title'));
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    return document.querySelector('.lfx-modal');
  }

  it('Handy: Abwaertsgeste schliesst das Modal (history.back, dann Fallback-Abbau)', async () => {
    const m = await openMobile(true);
    swipeDown(m);
    expect(m.classList.contains('lfx-dragging')).toBe(true);
    expect(backSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(backSpy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(600);
    expect(document.querySelector('.lfx-modal')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-modal-open')).toBe(false);
  });

  it('Desktop (matchMedia false): keine Wischgeste', async () => {
    const m = await openMobile(false);
    swipeDown(m);
    vi.advanceTimersByTime(500);
    expect(m.classList.contains('lfx-dragging')).toBe(false);
    expect(m.style.transform).toBe('');
    expect(backSpy).not.toHaveBeenCalled();
  });

  it('gescrolltes Overlay (scrollTop > 0): Geste startet nicht', async () => {
    const m = await openMobile(true);
    Object.defineProperty(m.parentElement, 'scrollTop', { value: 40, configurable: true, writable: true });
    swipeDown(m);
    vi.advanceTimersByTime(500);
    expect(m.classList.contains('lfx-dragging')).toBe(false);
    expect(m.style.transform).toBe('');
    expect(backSpy).not.toHaveBeenCalled();
  });

  it('Geste startet nicht ueber offenem Dialog (overlayOnTop)', async () => {
    const m = await openMobile(true);
    const dlg = document.createElement('div');
    dlg.className = 'dialogContainer';
    document.body.append(dlg);
    swipeDown(m);
    vi.advanceTimersByTime(500);
    expect(m.classList.contains('lfx-dragging')).toBe(false);
    expect(backSpy).not.toHaveBeenCalled();
    dlg.remove();
  });

  it('Cleanup: unmount mitten in der Geste hinterlaesst keine Drag-Klasse/Transform', async () => {
    const m = await openMobile(true);
    const overlay = m.parentElement;
    touch(m, 'touchstart', 50, 10);
    touch(m, 'touchmove', 50, 60);
    expect(m.classList.contains('lfx-dragging')).toBe(true);
    modal.unmount();
    expect(m.classList.contains('lfx-dragging')).toBe(false);
    expect(m.style.transform).toBe('');
    expect(overlay.style.opacity).toBe('');
    swipeDown(m);
    vi.advanceTimersByTime(500);
    expect(backSpy).not.toHaveBeenCalled();
  });
});
