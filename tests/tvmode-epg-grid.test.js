// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeCatalog, createScheduler, dayBounds, broadcastDayOf } from '../src/js/live/schedule/index.js';
import { MIN as MS } from '../src/js/live/schedule/time.js';
import * as M from '../src/js/live/tvmode/model.js';
import { createEpgGrid } from '../src/js/live/tvmode/epg-grid.js';

const TICKS = 6e8;
const iso = (ms) => new Date(ms).toISOString();

function smallRaw() {
  const base = Date.UTC(2026, 0, 1);
  const out = { movies: [], series: [], episodes: [], boxsets: [], loadedAt: 0 };
  const genres = ['Action', 'Komödie', 'Drama', 'Krimi'];
  for (let i = 0; i < 80; i++) {
    out.movies.push({ Id: 'm' + i, Name: 'Film ' + i, RunTimeTicks: (80 + (i % 7) * 10) * TICKS, Genres: [genres[i % 4]], OfficialRating: 'FSK-12', ProductionYear: 1990 + (i % 30), DateCreated: iso(base + i * 864e5) });
  }
  for (let s = 0; s < 6; s++) {
    out.series.push({ Id: 's' + s, Name: 'Serie ' + s, Genres: [genres[s % 4]], OfficialRating: 'FSK-12', ProductionYear: 2005, DateCreated: iso(base) });
    for (let e = 0; e < 12; e++) {
      out.episodes.push({ Id: `s${s}e${e}`, SeriesId: 's' + s, ParentIndexNumber: 1, IndexNumber: e + 1, RunTimeTicks: 45 * TICKS, DateCreated: iso(base + 1000 + e) });
    }
  }
  return out;
}

function bind(s) {
  return {
    nowAll: (t) => M.nowAll(s, t),
    gridRows: (o) => M.gridRows(s, o),
    describe: (no, e, t, o) => M.describe(s, no, e, t, o),
    nextProgram: (no, e) => M.nextProgram(s, no, e),
    titleOf: (e) => M.titleOf(s, e),
    days: M.days,
    kindOf: M.kindOf,
    channels: (D) => s.channels(D),
    item: (id) => s.item(id),
  };
}

const sched = createScheduler(normalizeCatalog(smallRaw()), {});
const T0 = Date.UTC(2026, 10, 11, 19, 30, 0);
const D0 = broadcastDayOf(T0);

function make() {
  const model = bind(sched);
  const ctl = { tune: vi.fn(), state: () => ({ on: true, channel: 2 }) };
  const onInfo = vi.fn();
  let now = T0;
  const grid = createEpgGrid({ doc: document, ctl, model, deps: {}, opts: { onInfo, getNow: () => now } });
  document.body.append(grid.el);
  return { grid, ctl, onInfo, model, setNow: (n) => { now = n; } };
}

const prop = (n, k) => parseFloat(n.style.getPropertyValue(k));

describe('tvmode epg-grid.js', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('zeigt 7 Tage, Heute aktiv, Jetzt-Knopf und eine Zeitleiste in 30-Minuten-Schritten', () => {
    const { grid } = make();
    const days = grid.el.querySelectorAll('.lfx-tvm__day');
    expect(days).toHaveLength(7);
    expect(days[0].textContent).toBe('Heute');
    expect(days[1].textContent).toBe('Morgen');
    expect(days[2].textContent).toBe('Fr 13.11.');
    expect(days[0].classList.contains('is-active')).toBe(true);
    expect(grid.el.querySelector('.lfx-tvm__epg-now').textContent).toBe('Jetzt');
    const marks = [...grid.el.querySelectorAll('.lfx-tvm__epg-hour')];
    expect(marks.length).toBe(48);
    expect(marks[0].textContent).toBe('05:00');
    expect(marks[1].textContent).toBe('05:30');
    expect(marks[1].classList.contains('lfx-tvm__epg-hour--half')).toBe(true);
    expect(prop(marks[2], '--tvm-s')).toBe(60);
  });

  it('18 Senderzeilen mit Nummer und Badge, aktueller Sender markiert', () => {
    const { grid } = make();
    const rows = grid.el.querySelectorAll('.lfx-tvm__epg-row');
    expect(rows).toHaveLength(18);
    expect(rows[0].querySelector('.lfx-tvm__epg-chan-no').textContent).toBe('1');
    expect(rows[0].querySelector('.lfx-tvm__chan-badge')).toBeTruthy();
    expect(grid.el.querySelectorAll('.is-current-channel')).toHaveLength(1);
    expect(grid.el.querySelector('.is-current-channel').dataset.tvmNo).toBe('2');
    grid.update({ on: true, channel: 5 });
    expect(grid.el.querySelector('.is-current-channel').dataset.tvmNo).toBe('5');
    expect(grid.el.innerHTML).not.toMatch(/lfx-card|data-lfx-id|lfx-live-/);
  });

  it('Zellenbreite ist proportional zur Dauer, Start zur Tagesgrenze 05:00', () => {
    const { grid } = make();
    const { start, end } = dayBounds(D0);
    const cells = grid.el.querySelectorAll('.lfx-tvm__epg-row')[0].querySelectorAll('.lfx-tvm__epg-cell');
    expect(cells.length).toBeGreaterThan(3);
    expect(prop(cells[0], '--tvm-s')).toBe(0);
    let at = 0;
    for (const c of cells) {
      expect(prop(c, '--tvm-s')).toBeCloseTo(at, 2); // Zellen schließen lückenlos aneinander
      at = prop(c, '--tvm-s') + prop(c, '--tvm-w');
    }
    expect(at).toBeCloseTo((end - start) / MS, 2);
  });

  it('laufende Zelle ist markiert, Vergangenheit nicht; Jetzt-Linie steht an der Zeit', () => {
    const { grid } = make();
    expect(grid.el.querySelectorAll('.lfx-tvm__epg-cell.is-current')).toHaveLength(18);
    expect(grid.el.querySelectorAll('.lfx-tvm__epg-cell.is-past').length).toBeGreaterThan(18);
    const line = grid.el.querySelector('.lfx-tvm__epg-nowline');
    expect(line.hidden).toBe(false);
    const m = prop(line, '--tvm-s');
    expect(m).toBeCloseTo((T0 - dayBounds(D0).start) / MS, 1);
    grid.tick(T0 + 5 * MS);
    expect(prop(line, '--tvm-s')).toBeCloseTo(m + 5, 1);
  });

  it('Klick auf laufende Zelle schaltet um, auf andere Zellen öffnet die Info-Karte', () => {
    const { grid, ctl, onInfo } = make();
    const row = grid.el.querySelectorAll('.lfx-tvm__epg-row')[3];
    row.querySelector('.lfx-tvm__epg-cell.is-current').click();
    expect(ctl.tune).toHaveBeenCalledWith(4, { immediate: true });
    expect(onInfo).not.toHaveBeenCalled();
    row.querySelector('.lfx-tvm__epg-cell.is-past').click();
    expect(onInfo).toHaveBeenCalledTimes(1);
    expect(onInfo.mock.calls[0][0].no).toBe(4);
    expect(onInfo.mock.calls[0][0].entry.end).toBeLessThanOrEqual(T0);
    const cells = [...row.querySelectorAll('.lfx-tvm__epg-cell')];
    const idx = cells.findIndex((c) => c.classList.contains('is-current'));
    cells[idx + 1].click();
    expect(onInfo).toHaveBeenCalledTimes(2);
    expect(onInfo.mock.calls[1][0].entry.start).toBeGreaterThanOrEqual(T0);
    expect(ctl.tune).toHaveBeenCalledTimes(1);
  });

  it('Tage werden lazy gerendert (nur der gewählte Tag)', () => {
    const { grid, model } = make();
    const spy = vi.spyOn(model, 'gridRows');
    grid.el.querySelectorAll('.lfx-tvm__day')[2].click();
    expect(spy).toHaveBeenCalledTimes(1);
    const a = spy.mock.calls[0][0];
    expect(a.D).toBe(D0 + 2);
    expect(a.from).toBe(dayBounds(D0 + 2).start);
    expect(a.to).toBe(dayBounds(D0 + 2).end);
    expect(grid.el.querySelectorAll('.lfx-tvm__day')[2].classList.contains('is-active')).toBe(true);
    expect(grid.el.querySelectorAll('.lfx-tvm__epg-row')).toHaveLength(18);
    expect(grid.el.querySelector('.lfx-tvm__epg-nowline').hidden).toBe(true);
    expect(grid.el.querySelectorAll('.lfx-tvm__epg-cell.is-current')).toHaveLength(0);
    grid.el.querySelectorAll('.lfx-tvm__day')[2].click(); // derselbe Tag: nichts neu
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('„Jetzt“ springt zurück zum heutigen Tag und scrollt', () => {
    const { grid, model } = make();
    grid.el.querySelectorAll('.lfx-tvm__day')[3].click();
    const spy = vi.spyOn(model, 'gridRows');
    const scroll = grid.el.querySelector('.lfx-tvm__epg-scroll');
    Object.defineProperty(scroll, 'clientWidth', { value: 800, configurable: true });
    grid.el.querySelector('.lfx-tvm__epg-now').click();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].D).toBe(D0);
    expect(grid.el.querySelector('.lfx-tvm__day.is-active').textContent).toBe('Heute');
    expect(scroll.scrollLeft).toBeGreaterThan(0);
  });

  it('Füller, Füllprogramm und Sendepause bekommen gedämpfte Klassen', () => {
    const cell = (a, b, type, title, kind) => ({ entry: { start: a, end: b, type }, start: a, end: b, title, sub: '', kind, now: false });
    const fake = {
      ...bind(sched),
      gridRows: ({ from }) => [{
        channel: { no: 1, name: 'LIVE Kino', key: 'kino' },
        cells: [
          cell(from, from + 60 * MS, 'program', 'Film', 'program'),
          cell(from + 60 * MS, from + 70 * MS, 'filler', 'Gleich: Film', 'filler'),
          cell(from + 70 * MS, from + 130 * MS, 'fill', 'Füllprogramm', 'fill'),
          cell(from + 130 * MS, from + 400 * MS, 'closedown', 'Sendepause', 'closedown'),
        ],
      }],
    };
    const g = createEpgGrid({ doc: document, ctl: { tune() {}, state: () => ({ on: false }) }, model: fake, deps: {}, opts: { getNow: () => T0 } });
    const c = g.el.querySelectorAll('.lfx-tvm__epg-cell');
    expect(c[1].classList.contains('lfx-tvm__epg-cell--filler')).toBe(true);
    expect(c[1].classList.contains('lfx-tvm__epg-cell--short')).toBe(true);
    expect(c[2].classList.contains('lfx-tvm__epg-cell--filler')).toBe(true);
    expect(c[2].querySelector('.lfx-tvm__epg-cell-title').textContent).toBe('Füllprogramm');
    expect(c[3].classList.contains('lfx-tvm__epg-cell--closedown')).toBe(true);
    expect(c[0].classList.contains('lfx-tvm__epg-cell--filler')).toBe(false);
    g.destroy();
  });

  it('Pfeiltasten wechseln zwischen Zellen', () => {
    const { grid } = make();
    const cells = [...grid.el.querySelectorAll('.lfx-tvm__epg-row')[0].querySelectorAll('.lfx-tvm__epg-cell')];
    cells[0].focus();
    cells[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(cells[1]);
    cells[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement.closest('.lfx-tvm__epg-row').dataset.tvmNo).toBe('2');
  });

  it('tick beim Sendetagwechsel baut die Tage neu auf', () => {
    const { grid, setNow } = make();
    const t = dayBounds(D0 + 1).start + 5 * MS;
    setNow(t);
    grid.tick(t);
    expect(grid.el.querySelector('.lfx-tvm__day.is-active').textContent).toBe('Heute');
    expect(grid.el.querySelector('.lfx-tvm__epg-row')).toBeTruthy();
    expect(prop(grid.el.querySelector('.lfx-tvm__epg-nowline'), '--tvm-s')).toBeCloseTo(5, 1);
  });

  it('destroy entfernt das Element; danach keine Reaktion mehr', () => {
    const { grid, ctl } = make();
    const cell = grid.el.querySelector('.lfx-tvm__epg-cell.is-current');
    grid.destroy();
    expect(grid.el.isConnected).toBe(false);
    cell.click();
    expect(ctl.tune).not.toHaveBeenCalled();
    expect(() => grid.tick(T0)).not.toThrow();
  });

  it('reveal(): Jetzt-Linie steht ca. 30 min nach dem linken Rand, nur scrollLeft', () => {
    const { grid } = make();
    const scroll = grid.el.querySelector('.lfx-tvm__epg-scroll');
    scroll.scrollLeft = 0;
    const win = window.scrollY;
    grid.reveal();
    const m = (T0 - dayBounds(D0).start) / MS;
    expect(scroll.scrollLeft).toBeCloseTo((m - 30) * 5, 0);
    expect(window.scrollY).toBe(win);
    // anderer Tag: kein Sprung
    grid.el.querySelectorAll('.lfx-tvm__day')[2].click();
    scroll.scrollLeft = 7;
    grid.reveal();
    expect(scroll.scrollLeft).toBe(7);
  });

  it('springt beim ersten Rendern erst, wenn das Raster eine Breite hat (ResizeObserver)', () => {
    let cb;
    const obs = { observe: vi.fn(), disconnect: vi.fn() };
    window.ResizeObserver = function RO(fn) { cb = fn; return obs; };
    try {
      const { grid } = make();
      const scroll = grid.el.querySelector('.lfx-tvm__epg-scroll');
      grid.update({ on: true, channel: 2 });
      expect(scroll.scrollLeft).toBe(0); // noch versteckt
      Object.defineProperty(scroll, 'clientWidth', { value: 360, configurable: true });
      cb();
      expect(scroll.scrollLeft).toBeGreaterThan(0);
      scroll.scrollLeft = 0;
      cb(); // nur einmal
      expect(scroll.scrollLeft).toBe(0);
      grid.destroy();
      expect(obs.disconnect).toHaveBeenCalled();
    } finally {
      delete window.ResizeObserver;
    }
  });

  it('Klick auf „Heute“ ruft reveal', () => {
    const { grid } = make();
    const scroll = grid.el.querySelector('.lfx-tvm__epg-scroll');
    grid.el.querySelectorAll('.lfx-tvm__day')[2].click();
    expect(scroll.scrollLeft).toBe(0);
    grid.el.querySelectorAll('.lfx-tvm__day')[0].click();
    expect(scroll.scrollLeft).toBeGreaterThan(0);
  });

  it('winzige Zellen ohne Text (tiny), mittlere nur Titel (short), Füller mit „Gleich: …“ als title', () => {
    const cell = (a, b, type, title, kind) => ({ entry: { start: a, end: b, type }, start: a, end: b, title, sub: '', kind, now: false });
    const fake = {
      ...bind(sched),
      gridRows: ({ from }) => [{
        channel: { no: 1, name: 'LIVE Kino', key: 'kino' },
        cells: [
          cell(from, from + 5 * MS, 'program', 'Winzig', 'program'),
          cell(from + 5 * MS, from + 20 * MS, 'program', 'Mittel', 'program'),
          cell(from + 20 * MS, from + 30 * MS, 'filler', 'Gleich: Film', 'filler'),
          cell(from + 30 * MS, from + 120 * MS, 'program', 'Lang', 'program'),
        ],
      }],
    };
    const g = createEpgGrid({ doc: document, ctl: { tune() {}, state: () => ({ on: false }) }, model: fake, deps: {}, opts: { getNow: () => T0 } });
    const c = g.el.querySelectorAll('.lfx-tvm__epg-cell');
    expect(c[0].classList.contains('lfx-tvm__epg-cell--tiny')).toBe(true); // 25 px
    expect(c[1].classList.contains('lfx-tvm__epg-cell--tiny')).toBe(false); // 75 px
    expect(c[1].classList.contains('lfx-tvm__epg-cell--short')).toBe(true);
    expect(c[2].classList.contains('lfx-tvm__epg-cell--tiny')).toBe(true); // Füller 50 px
    expect(c[2].title).toMatch(/^Gleich: Film/);
    expect(c[2].getAttribute('aria-label')).toContain('Gleich: Film');
    expect(c[3].classList.contains('lfx-tvm__epg-cell--short')).toBe(false);
    expect(g.el.innerHTML).not.toMatch(/LIVE/);
    g.destroy();
  });
});

describe('tvmode epg-grid.js · Titel rückt nach', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('Titel und Zeit stehen in einem Wrapper .lfx-tvm__epg-cell-text', () => {
    const { grid } = make();
    const cell = grid.el.querySelector('.lfx-tvm__epg-cell');
    const txt = cell.querySelector(':scope > .lfx-tvm__epg-cell-text');
    expect(txt).toBeTruthy();
    expect(txt.querySelector('.lfx-tvm__epg-cell-title')).toBeTruthy();
    expect(txt.querySelector('.lfx-tvm__epg-cell-time')).toBeTruthy();
    grid.destroy();
  });

  it('setzt --tvm-vis nur auf links angeschnittene Zellen und entfernt es wieder', () => {
    const { grid } = make();
    const scroll = grid.el.querySelector('.lfx-tvm__epg-scroll');
    const chan = grid.el.querySelector('.lfx-tvm__epg-chan');
    Object.defineProperty(scroll, 'clientWidth', { value: 800, configurable: true });
    const cells = [...grid.el.querySelectorAll('.lfx-tvm__epg-cell')].slice(0, 2);
    const rect = (l, r) => ({ left: l, right: r, width: r - l, top: 0, bottom: 10, height: 10 });
    chan.getBoundingClientRect = () => rect(0, 100);
    cells[0].getBoundingClientRect = () => rect(40, 300); // ragt unter die Spalte
    cells[1].getBoundingClientRect = () => rect(300, 500);
    let raf;
    const spy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => { raf = fn; return 1; });
    scroll.dispatchEvent(new Event('scroll'));
    raf();
    expect(cells[0].style.getPropertyValue('--tvm-vis')).toBe('188px'); // 300 - (100 + 4) - 8
    expect(cells[1].style.getPropertyValue('--tvm-vis')).toBe('');
    cells[0].getBoundingClientRect = () => rect(120, 300);
    scroll.dispatchEvent(new Event('scroll'));
    raf();
    expect(cells[0].style.getPropertyValue('--tvm-vis')).toBe('');
    spy.mockRestore();
    grid.destroy();
  });

  it('destroy entfernt den Scroll-Listener', () => {
    const { grid } = make();
    const scroll = grid.el.querySelector('.lfx-tvm__epg-scroll');
    const spy = vi.spyOn(scroll, 'removeEventListener');
    grid.destroy();
    expect(spy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
