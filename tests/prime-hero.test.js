// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, isReady: () => true, getItems: vi.fn() };
});
vi.mock('../src/js/core/itemmenu.js', () => ({
  openItemMenu: vi.fn(), isMenuOpen: vi.fn(() => false), onItemsChanged: vi.fn(() => () => {}),
}));
vi.mock('../src/js/core/download.js', () => ({ isChooserOpen: vi.fn(() => false), canDownload: vi.fn(), startDownload: vi.fn() }));
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn(async () => true) }));
vi.mock('../src/js/features/modal/data.js', () => ({
  loadNextUp: vi.fn(), loadSeasons: vi.fn(), loadEpisodes: vi.fn(),
}));
vi.mock('../src/js/shared/titleactions.js', () => ({
  toggleFavorite: vi.fn(async (it) => { it.UserData = { ...(it.UserData || {}), IsFavorite: !(it.UserData && it.UserData.IsFavorite) }; return it.UserData.IsFavorite; }),
  togglePlayed: vi.fn(), openTitleMenu: vi.fn(),
}));
vi.mock('../src/js/shared/trend.js', async () => {
  const actual = await vi.importActual('../src/js/shared/trend.js');
  return { ...actual, getTrendInfo: vi.fn() };
});
vi.mock('../src/js/shared/trailer.js', () => ({ createMutedPreview: vi.fn() }));
const ds = vi.hoisted(() => ({ on: false, subs: new Set() }));
vi.mock('../src/js/core/datasaver.js', () => ({
  isDataSaver: () => ds.on,
  onDataSaverChange: (cb) => { ds.subs.add(cb); return () => ds.subs.delete(cb); },
}));
const setSaver = (v) => { ds.on = v; [...ds.subs].forEach((cb) => cb(v)); };

import * as api from '../src/js/core/api.js';
import { clearCache } from '../src/js/core/cache.js';
import { play } from '../src/js/core/playback.js';
import * as data from '../src/js/features/modal/data.js';
import { createMutedPreview } from '../src/js/shared/trailer.js';
import { getTrendInfo } from '../src/js/shared/trend.js';
import { isMenuOpen } from '../src/js/core/itemmenu.js';
import { fetchHomePool, renderHero, ROTATE_MS, TRAILER_DELAY_MS } from '../src/js/features/prime/hero.js';
import { playLabel } from '../src/js/features/prime/hero-play.js';

const mk = (id, type = 'Movie', extra = {}) => ({
  Id: id, Name: `Titel ${id}`, Type: type, ImageTags: { Logo: 'l' }, BackdropImageTags: ['b'], ...extra,
});

let slot;
let preview;

async function tick(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
}

async function mount(pool) {
  slot = document.createElement('section');
  document.body.append(slot);
  const cleanup = renderHero(slot, { loadPool: async () => pool });
  await tick(0);
  return cleanup;
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  document.documentElement.className = '';
  preview = { cancel: vi.fn() };
  createMutedPreview.mockReset();
  createMutedPreview.mockReturnValue(preview);
  getTrendInfo.mockReset();
  getTrendInfo.mockResolvedValue({ available: true, rank: new Map([['m1', { rank: 2, type: 'Movie' }]]) });
  data.loadNextUp.mockReset();
  data.loadNextUp.mockResolvedValue(null);
  data.loadSeasons.mockReset();
  data.loadEpisodes.mockReset();
  play.mockClear();
  isMenuOpen.mockReturnValue(false);
  localStorage.clear();
});
afterEach(() => { vi.useRealTimers(); });

describe('Hero: Beschriftung', () => {
  it('playLabel: Film, Fortsetzen, Serie', () => {
    expect(playLabel(mk('a'))).toEqual({ line1: 'Abspielen', line2: null, progress: 0 });
    const res = playLabel(mk('a', 'Movie', { RunTimeTicks: 1000, UserData: { PlaybackPositionTicks: 400 } }));
    expect(res.line1).toBe('Fortsetzen');
    expect(Math.round(res.progress)).toBe(40);
    const s = mk('s', 'Series');
    expect(playLabel(s, null).line1).toBe('Abspielen');
    expect(playLabel(s, { IndexNumber: 1, ParentIndexNumber: 1 }).line2).toBeNull();
    expect(playLabel(s, { IndexNumber: 4, ParentIndexNumber: 1 })).toMatchObject({ line1: 'Folge 4', line2: 'weiter ansehen' });
    expect(playLabel(s, { IndexNumber: 4, ParentIndexNumber: 1, RunTimeTicks: 100, UserData: { PlaybackPositionTicks: 50 } }))
      .toMatchObject({ line1: 'Folge 4', line2: 'Fortsetzen', progress: 50 });
  });
});

describe('Hero: Slides', () => {
  it('zeigt Logo, grüne Rangzeile, Buttons und Punkte; Aufräumen leert den Slot', async () => {
    const cleanup = await mount([mk('m1', 'Movie', { OfficialRating: 'FSK-12' }), mk('m2')]);
    expect(slot.hidden).toBe(false);
    expect(slot.querySelector('.lfx-prime-hero__logo')).not.toBeNull();
    expect(slot.querySelector('.lfx-prime-hero__rank').textContent).toContain('Platz 2 der Top 10');
    expect(slot.querySelector('.lfx-prime-hero__label1').textContent).toBe('Abspielen');
    expect(slot.querySelector('.lfx-prime-hero__label').textContent).toBe('Abspielen'); // kein "null"
    expect(slot.querySelectorAll('.lfx-prime-hero__round').length).toBe(2);
    expect(slot.querySelector('a.lfx-prime-hero__round--info').getAttribute('href')).toBe('#/home?lfx=title&id=m1');
    expect(slot.querySelector('.lfx-prime-hero__fsk').textContent).toBe('12');
    expect(slot.querySelectorAll('.lfx-prime-hero__dot').length).toBe(2);
    expect(slot.querySelector('.lfx-prime-hero__dot.is-active')).toBe(slot.querySelectorAll('.lfx-prime-hero__dot')[0]);
    cleanup();
    expect(slot.childElementCount).toBe(0);
    expect(preview.cancel).toHaveBeenCalled();
  });

  it('ohne Pool bleibt der Slot versteckt', async () => {
    await mount([]);
    expect(slot.hidden).toBe(true);
    expect(slot.classList.contains('is-loading')).toBe(false);
  });

  it('reserviert Platz (is-loading) bis der Hero da ist', async () => {
    const cleanup = renderHero(slot, { loadPool: () => new Promise(() => {}) });
    expect(slot.hidden).toBe(false);
    expect(slot.classList.contains('is-loading')).toBe(true);
    cleanup();
    expect(slot.classList.contains('is-loading')).toBe(false);
    const c2 = await mount([mk('m1')]);
    expect(slot.classList.contains('is-loading')).toBe(false);
    c2();
  });

  it('Crossfade: nach 20 s zweite Slide, altes Bild verschwindet nach der Überblendung', async () => {
    const cleanup = await mount([mk('m1'), mk('m2')]);
    expect(ROTATE_MS).toBe(20000);
    await tick(ROTATE_MS - 1);
    expect(slot.querySelectorAll('.lfx-prime-hero__img').length).toBe(1);
    await tick(2);
    expect(slot.querySelectorAll('.lfx-prime-hero__img').length).toBe(2); // beide Ebenen während der Überblendung
    await tick(1200);
    expect(slot.querySelectorAll('.lfx-prime-hero__img').length).toBe(1);
    expect(slot.querySelector('.lfx-prime-hero__dot.is-active')).toBe(slot.querySelectorAll('.lfx-prime-hero__dot')[1]);
    cleanup();
  });

  it('Rotation pausiert bei Hover und bei offenem Menü', async () => {
    const cleanup = await mount([mk('m1'), mk('m2')]);
    slot.querySelector('.lfx-prime-hero').dispatchEvent(new Event('mouseenter'));
    await tick(ROTATE_MS + 100);
    expect(slot.querySelector('.lfx-prime-hero__dot.is-active')).toBe(slot.querySelectorAll('.lfx-prime-hero__dot')[0]);
    slot.querySelector('.lfx-prime-hero').dispatchEvent(new Event('mouseleave'));
    isMenuOpen.mockReturnValue(true);
    await tick(ROTATE_MS + 100);
    expect(slot.querySelector('.lfx-prime-hero__dot.is-active')).toBe(slot.querySelectorAll('.lfx-prime-hero__dot')[0]);
    isMenuOpen.mockReturnValue(false);
    await tick(ROTATE_MS + 100);
    expect(slot.querySelector('.lfx-prime-hero__dot.is-active')).toBe(slot.querySelectorAll('.lfx-prime-hero__dot')[1]);
    cleanup();
  });

  it('Serie: nächste Folge ergibt zweizeilige Beschriftung', async () => {
    data.loadNextUp.mockResolvedValue({ Id: 'e5', Type: 'Episode', IndexNumber: 5, ParentIndexNumber: 1 });
    const cleanup = await mount([mk('s1', 'Series')]);
    await tick(0);
    expect(slot.querySelector('.lfx-prime-hero__label1').textContent).toBe('Folge 5');
    expect(slot.querySelector('.lfx-prime-hero__label2').textContent).toBe('weiter ansehen');
    slot.querySelector('.lfx-prime-hero__play').click();
    await tick(0);
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ Id: 'e5' }), { resume: false });
    cleanup();
  });

  it('Film mit Fortschritt: Fortsetzen, Leiste und resume-Abspielen', async () => {
    const m = mk('m1', 'Movie', { RunTimeTicks: 1000, UserData: { PlaybackPositionTicks: 500 } });
    const cleanup = await mount([m]);
    expect(slot.querySelector('.lfx-prime-hero__label1').textContent).toBe('Fortsetzen');
    expect(slot.querySelector('.lfx-prime-hero__progress').hidden).toBe(false);
    expect(slot.querySelector('.lfx-prime-hero__bar').style.width).toBe('50%');
    slot.querySelector('.lfx-prime-hero__play').click();
    await tick(0);
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ Id: 'm1' }), { resume: true });
    cleanup();
  });

  it('Serie ohne nächste Folge: erste Folge der Startstaffel', async () => {
    data.loadSeasons.mockResolvedValue([{ Id: 'sea0', IndexNumber: 0 }, { Id: 'sea1', IndexNumber: 1 }]);
    data.loadEpisodes.mockResolvedValue([{ Id: 'e1', Type: 'Episode', IndexNumber: 1 }]);
    const cleanup = await mount([mk('s1', 'Series')]);
    slot.querySelector('.lfx-prime-hero__play').click();
    await tick(0);
    expect(data.loadEpisodes).toHaveBeenCalledWith('s1', 'sea1');
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ Id: 'e1' }), { resume: false });
    cleanup();
  });

  it('Meine Liste: Häkchen nach dem Klick', async () => {
    const cleanup = await mount([mk('m1')]);
    const btn = slot.querySelector('.lfx-prime-hero__round--list');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    btn.click();
    await tick(0);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.classList.contains('is-on')).toBe(true);
    cleanup();
  });
});

describe('Hero: Trailer', () => {
  it('startet die stumme Vorschau mit Verzögerung, Stumm-Knopf schaltet den Ton, Wechsel bricht ab', async () => {
    let opts;
    createMutedPreview.mockImplementation((container, item, o) => { opts = { container, item, ...o }; return preview; });
    const cleanup = await mount([mk('m1', 'Movie', { LocalTrailerCount: 1 }), mk('m2')]);
    expect(createMutedPreview).toHaveBeenCalledTimes(1);
    expect(opts.delay).toBe(TRAILER_DELAY_MS);
    expect(opts.item.Id).toBe('m1');
    expect(opts.container.classList.contains('lfx-prime-hero__media')).toBe(true);
    const mute = slot.querySelector('.lfx-prime-hero__mute');
    expect(mute.hidden).toBe(true);
    const v = document.createElement('video');
    v.muted = true;
    opts.onStart(v);
    expect(mute.hidden).toBe(false);
    expect(v.classList.contains('is-in')).toBe(true);
    mute.click();
    expect(v.muted).toBe(false);
    mute.click();
    expect(v.muted).toBe(true);
    // Trailer läuft: Rotation pausiert
    await tick(ROTATE_MS + 100);
    expect(slot.querySelector('.lfx-prime-hero__dot.is-active')).toBe(slot.querySelectorAll('.lfx-prime-hero__dot')[0]);
    // Ende des Trailers: Rotation läuft wieder, Knopf weg
    opts.onEnd();
    expect(mute.hidden).toBe(true);
    await tick(ROTATE_MS + 100);
    expect(slot.querySelector('.lfx-prime-hero__dot.is-active')).toBe(slot.querySelectorAll('.lfx-prime-hero__dot')[1]);
    expect(createMutedPreview).toHaveBeenCalledTimes(2);
    cleanup();
  });

  it('Slidewechsel per Punkt bricht die Vorschau ab', async () => {
    const cleanup = await mount([mk('m1'), mk('m2')]);
    slot.querySelectorAll('.lfx-prime-hero__dot')[1].click();
    expect(preview.cancel).toHaveBeenCalled();
    cleanup();
  });

  it('reduzierte Bewegung: keine Vorschau, keine Rotation', async () => {
    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const cleanup = await mount([mk('m1'), mk('m2')]);
    expect(createMutedPreview).not.toHaveBeenCalled();
    await tick(ROTATE_MS + 100);
    expect(slot.querySelector('.lfx-prime-hero__dot.is-active')).toBe(slot.querySelectorAll('.lfx-prime-hero__dot')[0]);
    cleanup();
    delete window.matchMedia;
  });
});

describe('Hero: Pool', () => {
  beforeEach(() => clearCache());
  it('fetchHomePool cached den Pool 10 min (gleicher erster Titel), nach clearCache("home:") neu', async () => {
    api.getItems.mockReset();
    api.getItems.mockImplementation(async (p) => ({ Items: p.SortBy === 'Random' ? [mk('r1'), mk('r2')] : [mk('n1'), mk('n2')] }));
    const a = await fetchHomePool();
    const n = api.getItems.mock.calls.length;
    const b = await fetchHomePool();
    expect(b).toBe(a);
    expect(api.getItems.mock.calls.length).toBe(n);
    clearCache('home:');
    await fetchHomePool();
    expect(api.getItems.mock.calls.length).toBeGreaterThan(n);
  });
  it('fetchHomePool fragt Logo+Backdrop-Titel mit Trailer-Feldern ab und baut den Pool', async () => {
    api.getItems.mockReset();
    api.getItems.mockImplementation(async (p) => ({
      Items: p.SortBy === 'Random'
        ? [mk('r1', 'Movie', { LocalTrailerCount: 1 }), mk('r2'), { Id: 'x', Name: 'ohne Bild' }]
        : [mk('n1'), mk('n2')],
    }));
    const pool = await fetchHomePool();
    const params = api.getItems.mock.calls[0][0];
    expect(params.ImageTypes).toBe('Logo,Backdrop');
    expect(params.Fields).toContain('RemoteTrailers');
    expect(params.Fields).toContain('LocalTrailerCount');
    const ids = pool.map((p) => p.Id);
    expect(ids).toContain('r1');
    expect(ids).not.toContain('x');
    expect(pool[0].Id).toBe('r1'); // Zufallstitel mit Trailer zuerst
  });
});

describe('Hero: Datensparmodus', () => {
  afterEach(() => { ds.on = false; ds.subs.clear(); });

  it('an: keine Vorschau, Pool auf 5 Titel gekürzt, data-lfx-tr leer', async () => {
    ds.on = true;
    const pool = Array.from({ length: 10 }, (_, i) => mk(`m${i}`, 'Movie', { LocalTrailerCount: 1 }));
    const cleanup = await mount(pool);
    expect(createMutedPreview).not.toHaveBeenCalled();
    expect(slot.querySelectorAll('.lfx-prime-hero__dot').length).toBe(5);
    expect(slot.dataset.lfxTr).toBeUndefined();
    await tick(ROTATE_MS + 100); // Rotation läuft ohne Trailer weiter
    expect(slot.querySelector('.lfx-prime-hero__dot.is-active')).toBe(slot.querySelectorAll('.lfx-prime-hero__dot')[1]);
    cleanup();
  });

  it('aus: Pool bleibt voll und die Vorschau startet', async () => {
    const pool = Array.from({ length: 10 }, (_, i) => mk(`m${i}`, 'Movie', { LocalTrailerCount: 1 }));
    const cleanup = await mount(pool);
    expect(createMutedPreview).toHaveBeenCalledTimes(1);
    expect(slot.querySelectorAll('.lfx-prime-hero__dot').length).toBe(10);
    cleanup();
  });

  it('Einschalten stoppt die laufende Vorschau, kürzt den Pool und setzt die Rotation fort', async () => {
    let opts;
    createMutedPreview.mockImplementation((container, item, o) => { opts = o; return preview; });
    const pool = Array.from({ length: 10 }, (_, i) => mk(`m${i}`, 'Movie', { LocalTrailerCount: 1 }));
    const cleanup = await mount(pool);
    opts.onStart(document.createElement('video'));
    expect(slot.querySelector('.lfx-prime-hero').classList.contains('is-trailer')).toBe(true);
    setSaver(true);
    expect(preview.cancel).toHaveBeenCalled();
    expect(slot.querySelector('.lfx-prime-hero').classList.contains('is-trailer')).toBe(false);
    expect(slot.querySelectorAll('.lfx-prime-hero__dot').length).toBe(5);
    await tick(ROTATE_MS + 100);
    expect(slot.querySelector('.lfx-prime-hero__dot.is-active')).toBe(slot.querySelectorAll('.lfx-prime-hero__dot')[1]);
    cleanup();
    expect(ds.subs.size).toBe(0);
  });
});
