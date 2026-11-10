// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import statshint, { shouldShow, markSeen, readState, HINT_DELAY, HINT_DURATION, HINT_DAYS } from '../src/js/features/statshint.js';
import { parseHash } from '../src/js/core/router.js';

const home = parseHash('#/home');

function setModern(on) {
  document.querySelectorAll('header.MuiAppBar-root').forEach((n) => n.remove());
  if (on) document.body.append(Object.assign(document.createElement('header'), { className: 'MuiAppBar-root' }));
}

describe('statshint', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    window.LenzFlixConfig = { statsUrl: '/lenzflix-stats/' };
    setModern(true);
    document.documentElement.classList.remove('layout-tv');
  });
  afterEach(() => {
    statshint.unmount();
    delete window.LenzFlixConfig;
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('match nur mit statsUrl, Modern, nicht TV', () => {
    expect(statshint.match(home)).toBe(true);
    delete window.LenzFlixConfig;
    expect(statshint.match(home)).toBe(false);
    window.LenzFlixConfig = { statsUrl: '/lenzflix-stats/' };
    document.documentElement.classList.add('layout-tv');
    expect(statshint.match(home)).toBe(false);
    document.documentElement.classList.remove('layout-tv');
    setModern(false);
    expect(statshint.match(home)).toBe(false);
  });

  it('erscheint nach Verzögerung und verschwindet nach 7 s', () => {
    statshint.mount(home);
    expect(document.getElementById('lfx-statshint')).toBeNull();
    vi.advanceTimersByTime(HINT_DELAY);
    const el = document.getElementById('lfx-statshint');
    expect(el).not.toBeNull();
    expect(el.querySelector('a').getAttribute('href')).toBe('/lenzflix-stats/');
    vi.advanceTimersByTime(HINT_DURATION + 300);
    expect(document.getElementById('lfx-statshint')).toBeNull();
  });

  it('nur einmal pro Sitzung', () => {
    statshint.mount(home);
    vi.advanceTimersByTime(HINT_DELAY + HINT_DURATION + 300);
    statshint.unmount();
    statshint.mount(home);
    vi.advanceTimersByTime(HINT_DELAY + 100);
    expect(document.getElementById('lfx-statshint')).toBeNull();
  });

  it('nicht auf anderen Seiten', () => {
    statshint.mount(parseHash('#/movies?topParentId=m1'));
    vi.advanceTimersByTime(HINT_DELAY + 100);
    expect(document.getElementById('lfx-statshint')).toBeNull();
  });

  it('shouldShow: seen und 10-Tage-Frist', () => {
    expect(shouldShow()).toBe(true);
    markSeen();
    expect(readState().seen).toBe(true);
    expect(shouldShow()).toBe(false);
    localStorage.clear();
    localStorage.setItem('lfx.statsHint', JSON.stringify({ firstShown: Date.now() - (HINT_DAYS + 1) * 86400000 }));
    expect(shouldShow()).toBe(false);
    localStorage.setItem('lfx.statsHint', JSON.stringify({ firstShown: Date.now() - (HINT_DAYS - 1) * 86400000 }));
    expect(shouldShow()).toBe(true);
  });

  it('Klick auf Statistik-Link im Theme setzt seen und blendet aus', () => {
    statshint.mount(home);
    vi.advanceTimersByTime(HINT_DELAY);
    const nav = document.createElement('a');
    nav.href = '/lenzflix-stats/';
    document.body.append(nav);
    nav.addEventListener('click', (e) => e.preventDefault());
    nav.click();
    expect(readState().seen).toBe(true);
    expect(document.getElementById('lfx-statshint')).toBeNull();
  });

  it('Klick auf anderen Link ändert nichts', () => {
    statshint.mount(home);
    vi.advanceTimersByTime(HINT_DELAY);
    const other = document.createElement('a');
    other.href = '#/movies';
    document.body.append(other);
    other.click();
    expect(readState().seen).toBeUndefined();
    expect(document.getElementById('lfx-statshint')).not.toBeNull();
  });

  it('X schließt nur für diese Sitzung (kein seen)', () => {
    statshint.mount(home);
    vi.advanceTimersByTime(HINT_DELAY);
    document.querySelector('.lfx-statshint__close').click();
    vi.advanceTimersByTime(300);
    expect(document.getElementById('lfx-statshint')).toBeNull();
    expect(readState().seen).toBeUndefined();
    expect(readState().firstShown).toBeTypeOf('number');
  });

  it('unmount räumt auf (auch vor dem Anzeigen)', () => {
    statshint.mount(home);
    statshint.unmount();
    vi.advanceTimersByTime(HINT_DELAY + 100);
    expect(document.getElementById('lfx-statshint')).toBeNull();
  });
});
