// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeCatalog, createScheduler } from '../src/js/live/schedule/index.js';
import * as M from '../src/js/live/tvmode/model.js';
import { createChannelList } from '../src/js/live/tvmode/channel-list.js';
import { resetThumbCache } from '../src/js/live/tvmode/thumb.js';

const MIN = 6e8;
const iso = (ms) => new Date(ms).toISOString();

function smallRaw() {
  const base = Date.UTC(2026, 0, 1);
  const out = { movies: [], series: [], episodes: [], boxsets: [], loadedAt: 0 };
  const genres = ['Action', 'Komödie', 'Drama', 'Krimi'];
  for (let i = 0; i < 80; i++) {
    out.movies.push({ Id: 'm' + i, Name: 'Film ' + i, RunTimeTicks: (80 + (i % 7) * 10) * MIN, Genres: [genres[i % 4]], OfficialRating: 'FSK-12', ProductionYear: 1990 + (i % 30), DateCreated: iso(base + i * 864e5) });
  }
  for (let s = 0; s < 6; s++) {
    out.series.push({ Id: 's' + s, Name: 'Serie ' + s, Genres: [genres[s % 4]], OfficialRating: 'FSK-12', ProductionYear: 2005, DateCreated: iso(base) });
    for (let e = 0; e < 12; e++) {
      out.episodes.push({ Id: `s${s}e${e}`, SeriesId: 's' + s, ParentIndexNumber: 1, IndexNumber: e + 1, RunTimeTicks: 45 * MIN, DateCreated: iso(base + 1000 + e) });
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

let ios;
class FakeIO {
  constructor(cb) {
    this.cb = cb;
    this.targets = new Set();
    this.disconnected = false;
    ios.push(this);
  }
  observe(t) { this.targets.add(t); }
  unobserve(t) { this.targets.delete(t); }
  disconnect() { this.disconnected = true; this.targets.clear(); }
  fire(target, isIntersecting = true) { this.cb([{ target, isIntersecting }]); }
}

function make(extra = {}) {
  const model = bind(sched);
  const ctl = { tune: vi.fn(), state: () => ({ on: true, channel: 3 }) };
  const deps = { imageUrl: vi.fn((id, o) => `/img/${id}/${o.type}`) };
  let now = T0;
  const list = createChannelList({ doc: document, ctl, model, deps, opts: { getNow: () => now, ...extra } });
  document.body.append(list.el);
  return { list, ctl, deps, model, setNow: (n) => { now = n; } };
}

describe('tvmode channel-list.js', () => {
  beforeEach(() => {
    ios = [];
    window.IntersectionObserver = FakeIO;
    resetThumbCache();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    delete window.IntersectionObserver;
  });

  it('rendert 18 Zeilen mit Nummer, Badge, Titel, Fortschritt und „Danach“', () => {
    const { list, model } = make();
    const rows = list.el.querySelectorAll('.lfx-tvm__row');
    expect(rows).toHaveLength(18);
    const all = model.nowAll(T0);
    rows.forEach((row, i) => {
      expect(row.querySelector('.lfx-tvm__row-no').textContent).toBe(String(i + 1));
      const badge = row.querySelector('.lfx-tvm__chan-badge');
      expect(badge).toBeTruthy();
      expect(badge.className).not.toMatch(/lfx-live/);
      expect(row.querySelector('.lfx-tvm__row-title').textContent).toBe(model.describe(i + 1, all[i].entry, T0).title);
      expect(row.querySelector('.lfx-tvm__row-fill').style.width).toMatch(/%$/);
    });
    const withNext = [...rows].filter((r) => !r.querySelector('.lfx-tvm__row-next').hidden);
    expect(withNext.length).toBeGreaterThan(0);
    expect(withNext[0].querySelector('.lfx-tvm__row-next').textContent).toMatch(/^Danach: .+ · \d\d:\d\d$/);
    expect(list.el.innerHTML).not.toMatch(/lfx-card|data-lfx-id|lfx-live-/);
    expect(list.el.textContent).not.toMatch(/LIVE/);
    for (const row of rows) expect(row.getAttribute('aria-label')).not.toMatch(/LIVE/);
    expect(rows[0].querySelector('.lfx-tvm__chan-badge').textContent.length).toBeLessThanOrEqual(9);
  });

  it('markiert den aktiven Sender mit aria-current und ändert sie beim Zappen', () => {
    const { list } = make();
    list.update({ on: true, channel: 3 });
    const cur = list.el.querySelectorAll('[aria-current]');
    expect(cur).toHaveLength(1);
    expect(cur[0].querySelector('.lfx-tvm__row-no').textContent).toBe('3');
    expect(cur[0].classList.contains('is-current')).toBe(true);
    list.update({ on: true, channel: 7 });
    const cur2 = list.el.querySelectorAll('[aria-current]');
    expect(cur2).toHaveLength(1);
    expect(cur2[0].querySelector('.lfx-tvm__row-no').textContent).toBe('7');
  });

  it('scrollt nur innerhalb der Liste (kein scrollIntoView auf der Seite, wenn die Liste scrollbar ist)', () => {
    const { list } = make();
    const rows = list.el.querySelectorAll('.lfx-tvm__row');
    Object.defineProperty(list.el, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(list.el, 'clientHeight', { value: 300, configurable: true });
    const target = rows[9];
    Object.defineProperty(target, 'offsetTop', { value: 600, configurable: true });
    Object.defineProperty(target, 'offsetHeight', { value: 60, configurable: true });
    target.scrollIntoView = vi.fn();
    list.update({ on: true, channel: 10 });
    expect(list.el.scrollTop).toBe(360);
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });

  it('Handy: scrollt die Seite nie automatisch (Liste im Seitenfluss)', () => {
    const { list } = make();
    const rows = list.el.querySelectorAll('.lfx-tvm__row');
    rows[17].scrollIntoView = vi.fn();
    rows[17].getBoundingClientRect = () => ({ top: 1400, bottom: 1480 });
    list.update({ on: true, channel: 18 });
    expect(rows[17].scrollIntoView).not.toHaveBeenCalled();
    expect(rows[17].classList.contains('is-current')).toBe(true);
  });

  it('Klick auf eine Zeile schaltet sofort um', () => {
    const { list, ctl } = make();
    list.el.querySelectorAll('.lfx-tvm__row')[11].click();
    expect(ctl.tune).toHaveBeenCalledWith(12, { immediate: true });
  });

  it('Zeilen sind Buttons (Tastatur über native Aktivierung)', () => {
    const { list } = make();
    for (const r of list.el.querySelectorAll('.lfx-tvm__row')) expect(r.tagName).toBe('BUTTON');
  });

  it('Vorschaubild lädt erst, wenn die Zeile sichtbar wird', () => {
    const { list, deps } = make();
    expect(deps.imageUrl).not.toHaveBeenCalled();
    const rows = list.el.querySelectorAll('.lfx-tvm__row');
    expect(rows[0].querySelector('.lfx-tvm__thumb').classList.contains('lfx-tvm__thumb--ph')).toBe(true);
    const io = ios[0];
    io.fire(rows[0], false);
    expect(deps.imageUrl).not.toHaveBeenCalled();
    io.fire(rows[0], true);
    expect(deps.imageUrl).toHaveBeenCalledTimes(1);
    expect(deps.imageUrl.mock.calls[0][1]).toEqual({ type: 'Thumb', maxWidth: 480 });
    expect(rows[0].querySelector('.lfx-tvm__thumb-img').getAttribute('src')).toMatch(/^\/img\/.+\/Thumb$/);
    expect(io.targets.has(rows[0])).toBe(false);
    expect(io.targets.has(rows[1])).toBe(true);
  });

  it('ohne IntersectionObserver werden Bilder sofort gesetzt', () => {
    delete window.IntersectionObserver;
    const { deps } = make();
    expect(deps.imageUrl).toHaveBeenCalled();
  });

  it('tick: nur Fortschritt, solange die Sendung läuft; Neuaufbau erst beim Sendungswechsel', () => {
    const { list, model, setNow } = make();
    const first = model.nowAll(T0)[0].entry;
    const spy = vi.spyOn(model, 'nowAll');
    const row0 = list.el.querySelector('.lfx-tvm__row');
    const titleBefore = row0.querySelector('.lfx-tvm__row-title');
    const w0 = row0.querySelector('.lfx-tvm__row-fill').style.width;
    list.tick(T0 + 60000);
    expect(spy).not.toHaveBeenCalled();
    const w1 = row0.querySelector('.lfx-tvm__row-fill').style.width;
    expect(parseFloat(w1)).toBeGreaterThanOrEqual(parseFloat(w0));
    expect(row0.querySelector('.lfx-tvm__row-title')).toBe(titleBefore);

    const t2 = first.end + 1000;
    setNow(t2);
    list.tick(t2);
    expect(spy).toHaveBeenCalledTimes(1);
    const after = model.nowAll(t2)[0];
    expect(row0.querySelector('.lfx-tvm__row-title').textContent).toBe(model.describe(1, after.entry, t2).title);
    // keine neuen Zeilen-Elemente (diffen statt neu rendern)
    expect(list.el.querySelectorAll('.lfx-tvm__row')).toHaveLength(18);
    expect(list.el.querySelector('.lfx-tvm__row')).toBe(row0);
  });

  it('destroy räumt Observer und DOM auf', () => {
    const { list, ctl } = make();
    list.destroy();
    expect(ios[0].disconnected).toBe(true);
    expect(list.el.isConnected).toBe(false);
    list.tick(T0);
    list.update({ on: true, channel: 2 });
    expect(ctl.tune).not.toHaveBeenCalled();
  });
});
