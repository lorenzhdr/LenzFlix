// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ landscapeImage: vi.fn(() => 'http://x/img.jpg') }));
vi.mock('../src/js/shared/search.js', () => ({ searchItems: vi.fn() }));

import { searchItems } from '../src/js/shared/search.js';
import { openPrimeSearch, closePrimeSearch, isPrimeSearchOpen } from '../src/js/features/prime/search.js';

const flush = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};
const type = (v) => {
  const input = document.querySelector('.lfx-prime-search__input');
  input.value = v;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('prime-search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<button id="b">Lupe</button>';
    searchItems.mockReset();
    searchItems.mockResolvedValue({
      movies: [{ Id: 'a', Name: 'Star Film', Type: 'Movie', ProductionYear: 2020, RunTimeTicks: 36000000000 }],
      series: [{ Id: 'b', Name: 'Star Serie', Type: 'Series', ProductionYear: 2021 }],
      episodes: [],
      people: [],
    });
  });
  afterEach(() => {
    closePrimeSearch();
    vi.useRealTimers();
  });

  it('öffnet mit Fokus im Feld und Platzhalter, schließt per Escape und gibt den Fokus zurück', () => {
    const b = document.getElementById('b');
    b.focus();
    openPrimeSearch({ returnFocus: b });
    expect(isPrimeSearchOpen()).toBe(true);
    const input = document.querySelector('.lfx-prime-search__input');
    expect(input.placeholder).toBe('Suchen');
    expect(document.activeElement).toBe(input);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isPrimeSearchOpen()).toBe(false);
    expect(document.getElementById('lfx-prime-search')).toBeNull();
    expect(document.activeElement).toBe(b);
  });

  it('entprellt (300 ms) und zeigt Vorschläge und Karten', async () => {
    openPrimeSearch();
    type('star');
    vi.advanceTimersByTime(299);
    expect(searchItems).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(searchItems).toHaveBeenCalledTimes(1);
    expect(searchItems.mock.calls[0][0]).toBe('star');
    await flush();
    expect([...document.querySelectorAll('.lfx-prime-search__sug')].map((a) => a.textContent)).toEqual(['Star Film', 'Star Serie']);
    const cards = [...document.querySelectorAll('.lfx-prime-search__card')];
    expect(cards.map((a) => a.getAttribute('href'))).toEqual(['#/home?lfx=title&id=a', '#/home?lfx=title&id=b']);
    expect(cards[0].querySelector('.lfx-prime-search__meta').textContent).toBe('2020 · 1 Std. 0 Min.');
  });

  it('bricht die vorige Anfrage ab', () => {
    const signals = [];
    searchItems.mockImplementation((q, { signal }) => {
      signals.push(signal);
      return new Promise(() => {});
    });
    openPrimeSearch();
    type('st');
    vi.advanceTimersByTime(300);
    type('sta');
    vi.advanceTimersByTime(300);
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    closePrimeSearch();
    expect(signals[1].aborted).toBe(true);
  });

  it('kurze Eingabe: keine Anfrage; keine Treffer: Hinweis', async () => {
    openPrimeSearch();
    type('s');
    vi.advanceTimersByTime(300);
    expect(searchItems).not.toHaveBeenCalled();
    searchItems.mockResolvedValue({ movies: [], series: [], episodes: [], people: [] });
    type('zzz');
    vi.advanceTimersByTime(300);
    await flush();
    expect(document.querySelector('.lfx-prime-search__status').textContent).toContain('Keine Treffer');
  });

  it('Klick auf Ergebnis schließt; Klick daneben schließt; Klick im Panel nicht', async () => {
    openPrimeSearch();
    type('star');
    vi.advanceTimersByTime(300);
    await flush();
    document.querySelector('.lfx-prime-search__panel').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(isPrimeSearchOpen()).toBe(true);
    document.querySelector('.lfx-prime-search__card').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(isPrimeSearchOpen()).toBe(false);
    openPrimeSearch();
    document.getElementById('lfx-prime-search').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(isPrimeSearchOpen()).toBe(false);
  });

  it('Fokusfalle: Tab vom letzten Element springt zum ersten', async () => {
    openPrimeSearch();
    type('star');
    vi.advanceTimersByTime(300);
    await flush();
    const focusables = [...document.querySelectorAll('.lfx-prime-search__panel a, .lfx-prime-search__panel input, .lfx-prime-search__panel button')].filter((e) => !e.hidden);
    focusables[focusables.length - 1].focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(focusables[0]);
  });
});
