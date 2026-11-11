// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeCatalog, createScheduler } from '../src/js/live/schedule/index.js';
import * as M from '../src/js/live/tvmode/model.js';
import { createDetails } from '../src/js/live/tvmode/details.js';
import { createInfoCard } from '../src/js/live/tvmode/info-card.js';
import { resetThumbCache } from '../src/js/live/tvmode/thumb.js';

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

function make({ withDetails = true } = {}) {
  const model = bind(sched);
  const order = [];
  const ctl = { tune: vi.fn(() => order.push('tune')), stop: vi.fn(() => order.push('stop')), state: () => ({ on: true, channel: 1 }) };
  const itemDetails = vi.fn(async (ids) => new Map(ids.map((id) => [id, { overview: `Text zu ${id}` }])));
  const deps = {
    imageUrl: vi.fn((id, o) => `/img/${id}/${o.type}/${o.maxWidth}`),
    openDetails: vi.fn(() => order.push('details')),
    playFromStart: vi.fn(() => order.push('play')),
    itemDetails: withDetails ? itemDetails : undefined,
  };
  const details = createDetails({ deps });
  const card = createInfoCard({ doc: document, ctl, model, deps, opts: { details, getNow: () => T0 } });
  document.body.append(card.el);
  return { card, ctl, deps, model, details, order, itemDetails };
}

const entryOn = (model, no, t) => model.nowAll(t)[no - 1].entry;
const btns = (card) => [...card.el.querySelectorAll('.lfx-tvm__infocard-actions .lfx-tvm__btn')].map((b) => b.textContent);
const find = (card, label) => [...card.el.querySelectorAll('.lfx-tvm__infocard-actions .lfx-tvm__btn')].find((b) => b.textContent === label);

describe('tvmode info-card.js', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetThumbCache();
    document.body.innerHTML = '';
  });
  afterEach(() => vi.useRealTimers());

  it('ist ein modaler Dialog und anfangs geschlossen', () => {
    const { card } = make();
    expect(card.el.getAttribute('role')).toBe('dialog');
    expect(card.el.getAttribute('aria-modal')).toBe('true');
    expect(card.isOpen()).toBe(false);
    expect(card.el.hidden).toBe(true);
  });

  it('zeigt Bild (maxWidth 960), Sender, Titel, Tag und Zeit, Badges', () => {
    const { card, model, deps } = make();
    const e = entryOn(model, 3, T0 + 3 * 3600e3);
    card.open({ no: 3, entry: e });
    expect(card.isOpen()).toBe(true);
    expect(card.el.classList.contains('is-open')).toBe(true);
    const d = model.describe(3, e, T0);
    expect(card.el.querySelector('.lfx-tvm__infocard-title').textContent).toBe(d.title);
    expect(card.el.querySelector('.lfx-tvm__infocard-chan').textContent).toMatch(/^3 · /);
    expect(card.el.querySelector('.lfx-tvm__infocard-chan').textContent).not.toMatch(/LIVE/i);
    const time = card.el.querySelector('.lfx-tvm__infocard-time').textContent;
    expect(time).toMatch(/^(Mi|Do|Fr) \d\d\.\d\d\. · \d\d:\d\d–\d\d:\d\d$/);
    expect(time.endsWith(d.time)).toBe(true);
    expect(deps.imageUrl).toHaveBeenCalled();
    expect(deps.imageUrl.mock.calls[0][1]).toEqual({ type: 'Thumb', maxWidth: 960 });
    expect(card.el.querySelector('.lfx-tvm__infocard-img .lfx-tvm__thumb')).toBeTruthy();
    expect(card.el.querySelectorAll('.lfx-tvm__badges .lfx-tvm__badge').length).toBe(d.badges.length);
    expect(card.el.innerHTML).not.toMatch(/lfx-card|data-lfx-id|lfx-live-/);
  });

  it('Inhaltsangabe: Platzhalter, dann nachgeladener Text', async () => {
    const { card, model, details, itemDetails } = make();
    const e = entryOn(model, 2, T0 + 3 * 3600e3);
    card.open({ no: 2, entry: e });
    const text = card.el.querySelector('.lfx-tvm__infocard-text');
    expect(text.textContent).toMatch(/wird geladen/);
    expect(text.classList.contains('is-loading')).toBe(true);
    await vi.advanceTimersByTimeAsync(450);
    expect(itemDetails).toHaveBeenCalledTimes(1);
    expect(text.textContent).toBe(`Text zu ${e.itemId}`);
    expect(text.classList.contains('is-loading')).toBe(false);
    expect(details.get(e.itemId)).toBe(`Text zu ${e.itemId}`);
  });

  it('Knöpfe: Details ruft deps.openDetails, Mediathek stoppt vorher den Controller', () => {
    const { card, model, deps, ctl, order } = make();
    const e = entryOn(model, 4, T0 + 3 * 3600e3);
    card.open({ no: 4, entry: e });
    expect(btns(card)).toEqual(['Details', 'In der Mediathek ansehen']);
    find(card, 'Details').click();
    expect(deps.openDetails).toHaveBeenCalledWith(e.itemId);
    expect(card.isOpen()).toBe(false);
    card.open({ no: 4, entry: e });
    find(card, 'In der Mediathek ansehen').click();
    expect(ctl.stop).toHaveBeenCalledTimes(1);
    expect(deps.playFromStart).toHaveBeenCalledWith(e.itemId);
    expect(order).toEqual(['details', 'stop', 'play']);
    expect(card.isOpen()).toBe(false);
  });

  it('läuft die Sendung, gibt es „Jetzt einschalten“', () => {
    const { card, model, ctl } = make();
    const e = entryOn(model, 5, T0);
    card.open({ no: 5, entry: e });
    expect(btns(card)[0]).toBe('Jetzt einschalten');
    find(card, 'Jetzt einschalten').click();
    expect(ctl.tune).toHaveBeenCalledWith(5, { immediate: true });
    expect(card.isOpen()).toBe(false);
  });

  it('tick: wird eine Sendung laufend, erscheint „Jetzt einschalten“ nachträglich', () => {
    const { card, model } = make();
    const now = entryOn(model, 6, T0);
    const e = { ...now, start: T0 + 1000, end: T0 + 3600e3 };
    card.open({ no: 6, entry: e });
    expect(btns(card)).not.toContain('Jetzt einschalten');
    card.tick(T0 + 2000); // getNow bleibt T0, tick liefert die Uhrzeit nicht an isRunning
    expect(btns(card)).toContain('Jetzt einschalten');
  });

  it('Einträge ohne itemId (Füller, Sendepause) haben keine Knöpfe zur Mediathek', () => {
    const { card, deps } = make();
    card.open({ no: 1, entry: { start: T0 + 3600e3, end: T0 + 3600e3 + 600e3, type: 'closedown' } });
    expect(btns(card)).toEqual([]);
    expect(card.el.querySelector('.lfx-tvm__infocard-title').textContent).toBe('Sendepause');
    expect(card.el.querySelector('.lfx-tvm__infocard-text').hidden).toBe(true);
    expect(deps.openDetails).not.toHaveBeenCalled();
  });

  it('Esc schließt und der Fokus kehrt zum Auslöser zurück', () => {
    const { card, model } = make();
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    card.open({ no: 7, entry: entryOn(model, 7, T0 + 3 * 3600e3) });
    expect(card.el.contains(document.activeElement)).toBe(true);
    card.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(card.isOpen()).toBe(false);
    expect(card.el.hidden).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it('Klick auf den Hintergrund und auf Schließen schließt', () => {
    const { card, model } = make();
    const e = entryOn(model, 8, T0 + 3 * 3600e3);
    card.open({ no: 8, entry: e });
    card.el.querySelector('.lfx-tvm__infocard-backdrop').click();
    expect(card.isOpen()).toBe(false);
    card.open({ no: 8, entry: e });
    card.el.querySelector('.lfx-tvm__infocard-close').click();
    expect(card.isOpen()).toBe(false);
  });

  it('Tab bleibt im Dialog (Fokusfalle)', () => {
    const { card, model } = make();
    card.open({ no: 9, entry: entryOn(model, 9, T0 + 3 * 3600e3) });
    const close = card.el.querySelector('.lfx-tvm__infocard-close');
    close.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    close.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(card.el.contains(document.activeElement)).toBe(true);
  });

  it('destroy entfernt DOM und Abo; danach keine Reaktion', async () => {
    const { card, model, details } = make();
    const e = entryOn(model, 10, T0 + 3 * 3600e3);
    card.open({ no: 10, entry: e });
    card.destroy();
    expect(card.el.isConnected).toBe(false);
    expect(card.isOpen()).toBe(false);
    card.open({ no: 10, entry: e });
    expect(card.isOpen()).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(() => details.dispose()).not.toThrow();
  });
});

describe('tvmode info-card.js Datum nach Mitternacht', () => {
  it('zeigt das Kalenderdatum des Beginns, nicht den Sendetag (01:35 in der Nacht = neues Datum)', async () => {
    const { wallToUtc, broadcastDayOf, formatDay } = await import('../src/js/live/schedule/time.js');
    const { card } = make();
    const D = broadcastDayOf(T0);
    const start = wallToUtc(D + 1, 95); // 01:35 am Folgetag (gehört noch zum Sendetag D)
    expect(broadcastDayOf(start)).toBe(D);
    const entry = { start, end: start + 3600000, type: 'program', itemId: 'm1' };
    card.open({ no: 1, entry });
    const f = formatDay(D + 1);
    expect(card.el.textContent).toContain(`${f.weekday} ${f.date}`);
    expect(card.el.textContent).not.toContain(`${formatDay(D).weekday} ${formatDay(D).date}`);
    card.close();
  });
});
