// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const themeState = vi.hoisted(() => ({ id: 'flix' }));
vi.mock('../src/js/core/theme.js', () => ({ getTheme: () => themeState.id, isTheme: (id) => themeState.id === id }));

import { show, hide, destroy, allowRoute, isShown } from '../src/js/core/startcover.js';

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const cover = () => document.getElementById('lfx-startcover');
const ep = { Id: 'E1', Type: 'Episode', Name: 'Pilot', SeriesName: 'Serie', ParentIndexNumber: 1, IndexNumber: 3, ParentBackdropItemId: 'S1', ParentBackdropImageTags: ['bt'] };
const movie = { Id: 'M1', Type: 'Movie', Name: 'Film', BackdropImageTags: ['mt'] };

beforeEach(() => {
  window.ApiClient = { serverAddress: () => 'http://s', getCurrentUserId: () => 'u', accessToken: () => 'secret', serverId: () => 'srv' };
  document.documentElement.className = 'lfx-js';
  document.body.innerHTML = '';
  window.location.hash = '#/home';
  themeState.id = 'flix';
});
afterEach(() => { destroy(); vi.useRealTimers(); });

describe('startcover', () => {
  it('zeigt Titel, Backdrop (ohne api_key) und Ladekreis', () => {
    show({ item: movie });
    expect(cover()).not.toBeNull();
    expect(cover().querySelector('.lfx-startcover__title').textContent).toBe('Film');
    expect(cover().querySelector('.lfx-startcover__spinner')).not.toBeNull();
    const src = cover().querySelector('img').getAttribute('src');
    expect(src).toContain('/Items/M1/Images/Backdrop');
    expect(src).not.toContain('api_key');
  });

  it('Folge: Serienname, „S1 · F3 · Titel“, Backdrop der Serie', () => {
    show({ item: ep });
    expect(cover().querySelector('.lfx-startcover__title').textContent).toBe('Serie');
    expect(cover().querySelector('.lfx-startcover__sub').textContent).toBe('S1 · F3 · Pilot');
    expect(cover().querySelector('img').getAttribute('src')).toContain('/Items/S1/Images/Backdrop');
  });

  it('idempotent für dasselbe Item, anderes Item ersetzt den Inhalt', () => {
    show({ item: movie });
    const node = cover();
    const bg = node.querySelector('.lfx-startcover__bg');
    show({ item: movie });
    expect(document.querySelectorAll('#lfx-startcover').length).toBe(1);
    expect(node.querySelector('.lfx-startcover__bg')).toBe(bg);
    show({ item: { ...movie, Id: 'M2', Name: 'Anderer' } });
    expect(document.querySelectorAll('#lfx-startcover').length).toBe(1);
    expect(cover().querySelector('.lfx-startcover__title').textContent).toBe('Anderer');
  });

  it('nicht unter layout-tv und nicht bei live', () => {
    document.documentElement.classList.add('layout-tv');
    show({ item: movie });
    expect(cover()).toBeNull();
    document.documentElement.classList.remove('layout-tv');
    themeState.id = 'live';
    show({ item: movie });
    expect(cover()).toBeNull();
  });

  it('hide: Fade, dann entfernt', async () => {
    show({ item: movie });
    hide();
    expect(cover().classList.contains('is-leaving')).toBe(true);
    expect(isShown()).toBe(false);
    await flush(260);
    expect(cover()).toBeNull();
  });

  it('(a) Player-Seite sichtbar + Video spielt: entfernt; ohne Wiedergabe nicht', async () => {
    window.location.hash = '#/video';
    show({ item: movie });
    document.body.insertAdjacentHTML('beforeend', '<div id="videoOsdPage"><video class="htmlvideoplayer"></video></div>');
    const v = document.querySelector('video');
    Object.defineProperty(v, 'paused', { value: true, configurable: true });
    Object.defineProperty(v, 'currentTime', { value: 0, configurable: true });
    await flush(30);
    expect(cover().classList.contains('is-leaving')).toBe(false);
    Object.defineProperty(v, 'paused', { value: false, configurable: true });
    Object.defineProperty(v, 'currentTime', { value: 2, configurable: true });
    v.dispatchEvent(new Event('playing'));
    await flush(30);
    expect(cover().classList.contains('is-leaving')).toBe(true);
  });

  it('(a) pausierter Start mit erstem Bild (readyState ≥ 2) entfernt das Ladebild', async () => {
    window.location.hash = '#/video';
    show({ item: movie });
    document.body.insertAdjacentHTML('beforeend', '<div id="videoOsdPage"><video class="htmlvideoplayer"></video></div>');
    const v = document.querySelector('video');
    Object.defineProperty(v, 'paused', { value: true, configurable: true });
    Object.defineProperty(v, 'currentTime', { value: 0, configurable: true });
    Object.defineProperty(v, 'readyState', { value: 2, configurable: true });
    v.dispatchEvent(new Event('loadeddata'));
    await flush(30);
    expect(cover().classList.contains('is-leaving')).toBe(true);
  });

  it('versteckte alte Player-Seite zählt nicht', async () => {
    window.location.hash = '#/video';
    document.body.innerHTML = '<div id="videoOsdPage" class="hide"><video class="htmlvideoplayer"></video></div>';
    const v = document.querySelector('video');
    Object.defineProperty(v, 'paused', { value: false });
    Object.defineProperty(v, 'currentTime', { value: 5 });
    show({ item: movie });
    document.body.append(document.createElement('i'));
    await flush(30);
    expect(cover().classList.contains('is-leaving')).toBe(false);
  });

  it('(b) offener Jellyfin-Dialog entfernt das Ladebild', async () => {
    show({ item: movie });
    document.body.insertAdjacentHTML('beforeend', '<div class="dialogContainer"><div class="dialog opened"></div></div>');
    await flush(30);
    expect(cover().classList.contains('is-leaving')).toBe(true);
  });

  it('(c) Route weder /video noch Ausgangsroute entfernt; /video und allowRoute bleiben', async () => {
    show({ item: movie });
    window.location.hash = '#/video';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush(30);
    expect(isShown()).toBe(true);
    allowRoute('/details');
    window.location.hash = '#/details?id=M1';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush(30);
    expect(isShown()).toBe(true);
    window.location.hash = '#/movies';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush(30);
    expect(isShown()).toBe(false);
  });

  it('(c) pushState ohne hashchange wird über den MutationObserver erkannt', async () => {
    show({ item: movie });
    history.pushState({}, '', '#/movies');
    document.body.append(document.createElement('div'));
    await flush(30);
    expect(isShown()).toBe(false);
  });

  it('(e) Sicherheitsnetz nach 25 s', () => {
    vi.useFakeTimers();
    show({ item: movie });
    vi.advanceTimersByTime(24900);
    expect(isShown()).toBe(true);
    vi.advanceTimersByTime(200);
    expect(isShown()).toBe(false);
    vi.advanceTimersByTime(300);
    expect(cover()).toBeNull();
  });

  it('(f) Esc schließt nur das Ladebild und wird verschluckt', () => {
    show({ item: movie });
    const other = vi.fn();
    window.addEventListener('keydown', other);
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev);
    window.removeEventListener('keydown', other);
    expect(isShown()).toBe(false);
    expect(ev.defaultPrevented).toBe(true);
    expect(other).not.toHaveBeenCalled();
  });

  it('show während des Ausblendens blendet wieder ein', async () => {
    show({ item: movie });
    hide();
    show({ item: movie });
    await flush(260);
    expect(isShown()).toBe(true);
  });

  it('destroy entfernt sofort', () => {
    show({ item: movie });
    destroy();
    expect(cover()).toBeNull();
  });
});
