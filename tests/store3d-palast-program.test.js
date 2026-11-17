import { describe, it, expect } from 'vitest';
import {
  buildProgram, dayKeyOf, minutesOf, clockText, highlightIndex, showState, candidates, SLOTS,
} from '../src/js/store3d/palast/program.js';
import {
  createTicketBook, showRows, tapeOf, seatGate, ticketText, ticketToast, tearLine,
} from '../src/js/store3d/palast/choice.js';

const mv = (i, o = {}) => ({ Id: `m${String(i).padStart(3, '0')}`, Name: `Film ${i}`, Type: 'Movie', RunTimeTicks: 6000000000 * (1 + (i % 3)), ProductionYear: 1990 + i, ...o });
const mk = (n, extra = {}) => {
  const items = new Map();
  for (let i = 0; i < n; i++) { const it = mv(i); items.set(it.Id, it); }
  return { items, resume: [], departments: [], ...extra };
};

describe('Palast-Programm', () => {
  it('ist deterministisch (gleicher Tag = gleiches Programm, unabhängig von der Katalogreihenfolge)', () => {
    const a = buildProgram(mk(20), '2026-11-17');
    const rev = mk(20);
    rev.items = new Map([...rev.items.entries()].reverse());
    expect(buildProgram(rev, '2026-11-17')).toEqual(a);
    expect(a.shows.length).toBe(4);
    expect(a.shows.map((s) => s.time)).toEqual(SLOTS.map((s) => s.time));
  });

  it('wechselt mit dem Kalendertag', () => {
    const ids = (d) => buildProgram(mk(30), d).shows.map((s) => s.itemId).join();
    const days = new Set(['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'].map(ids));
    expect(days.size).toBeGreaterThan(1);
  });

  it('nimmt nur Filme, keine Serien, Folgen oder Ab-18-Titel, keine Doppelten', () => {
    const cat = mk(6);
    cat.items.set('s1', { Id: 's1', Name: 'Serie', Type: 'Series' });
    cat.items.set('e1', { Id: 'e1', Name: 'Folge', Type: 'Episode' });
    cat.items.set('x1', mv(99, { Id: 'x1' }));
    cat.departments = [{ kind: 'adult', itemIds: ['x1'] }];
    const ids = candidates(cat).map((i) => i.Id);
    expect(ids).not.toContain('s1');
    expect(ids).not.toContain('e1');
    expect(ids).not.toContain('x1');
    const p = buildProgram(cat, '2026-01-01');
    expect(new Set(p.shows.map((s) => s.itemId)).size).toBe(p.shows.length);
  });

  it('Platz 1 ist der Weiterschauen-Film (resume: true), auch wenn er im Pool steckt', () => {
    const cat = mk(12);
    cat.resume = [{ Id: 'ep', Name: 'Folge', Type: 'Episode' }, cat.items.get('m007')];
    const p = buildProgram(cat, '2026-05-05');
    expect(p.shows[0]).toMatchObject({ itemId: 'm007', resume: true, slot: 0 });
    expect(p.shows.filter((s) => s.itemId === 'm007').length).toBe(1);
    expect(p.shows.slice(1).every((s) => !s.resume)).toBe(true);
  });

  it('Weiterschauen-Film ohne Ab-18-Freigabe: Ab-18-Resume wird übergangen', () => {
    const cat = mk(5);
    cat.departments = [{ kind: 'adult', itemIds: ['m001'] }];
    cat.resume = [cat.items.get('m001')];
    const p = buildProgram(cat, '2026-05-05');
    expect(p.shows.some((s) => s.itemId === 'm001')).toBe(false);
    expect(p.shows.some((s) => s.resume)).toBe(false);
  });

  it('kleine und leere Kataloge', () => {
    expect(buildProgram(mk(0), '2026-01-01').shows).toEqual([]);
    expect(buildProgram(null, '2026-01-01').shows).toEqual([]);
    expect(buildProgram(mk(1), '2026-01-01').shows.map((s) => s.time)).toEqual(['20:15']);
    expect(buildProgram(mk(2), '2026-01-01').shows.map((s) => s.time)).toEqual(['18:00', '20:15']);
    expect(buildProgram(mk(3), '2026-01-01').shows.map((s) => s.time)).toEqual(['18:00', '20:15', '22:45']);
    const only = mk(0, { resume: [mv(5)] });
    const p = buildProgram(only, '2026-01-01');
    expect(p.shows.length).toBe(1);
    expect(p.shows[0].resume).toBe(true);
  });

  it('bevorzugt Filme mit Laufzeit', () => {
    const cat = mk(10);
    for (const [id, it] of cat.items) if (id < 'm005') it.RunTimeTicks = 0;
    const p = buildProgram(cat, '2026-02-02');
    expect(p.shows.every((s) => s.runtimeMin > 0)).toBe(true);
  });

  it('Hilfen: Tagesschlüssel, Minuten, Hervorhebung, Zustand', () => {
    expect(dayKeyOf(new Date(2026, 10, 17, 23, 59))).toBe('2026-11-17');
    expect(dayKeyOf('quatsch')).toBe(null);
    expect(minutesOf(20.25)).toBe(1215);
    expect(minutesOf(new Date(2026, 0, 1, 9, 5))).toBe(545);
    expect(minutesOf(null)).toBe(null);
    expect(clockText(1215)).toBe('20:15');
    const p = buildProgram(mk(8), '2026-03-03');
    expect(highlightIndex(p, 0)).toBe(0);
    expect(highlightIndex(p, 16 * 60)).toBe(1);
    expect(highlightIndex(p, 23 * 60 + 30)).toBe(3);
    expect(highlightIndex({ shows: [] }, 5)).toBe(-1);
    const s = p.shows[1];
    expect(showState(s, s.minutes - 1)).toBe('later');
    expect(showState(s, s.minutes + 5)).toBe('running');
    expect(showState(s, s.minutes + 600)).toBe('done');
  });
});

describe('Palast-Filmauswahl (rein)', () => {
  const cat = mk(8);
  const prog = buildProgram(cat, '2026-04-04');

  it('Ticketkauf, Netzzustand und Rückgabe', () => {
    const book = createTicketBook();
    const seen = [];
    book.onChange((t) => seen.push(t && t.itemId));
    const show = prog.shows[2];
    const t = book.buyShow(show, cat.items.get(show.itemId), '2026-04-04');
    expect(t.no).toBeGreaterThanOrEqual(100);
    expect(book.getNetState()).toMatchObject({ itemId: show.itemId, source: 'program', slot: 2 });
    expect(JSON.stringify(book.getNetState())).not.toContain('Name');
    expect(book.applyRemote({})).toBe(false);
    book.clear();
    expect(book.has()).toBe(false);
    expect(seen).toEqual([show.itemId, null]);
    expect(book.buyShow(null, null)).toBe(null);
  });

  it('Kassette abgeben: nur mit getragener Hülle (egal ob ausgeliehen, Serie erlaubt)', () => {
    expect(tapeOf(null)).toBe(null);
    expect(tapeOf({ id: 'x', item: null })).toBe(null);
    const ser = { Id: 's1', Name: 'Serie', Type: 'Series' };
    expect(tapeOf({ id: 's1', item: ser })).toBe(ser);
    const book = createTicketBook();
    const t = book.handIn(ser);
    expect(t).toMatchObject({ source: 'tape', itemId: 's1', resume: false });
    expect(ticketText(t)).toContain('Eigene Kassette');
    expect(ticketToast(t)).toContain('Kassette');
  });

  it('Zeilen markieren das eigene Ticket und Weiterschauen', () => {
    const c = mk(8);
    c.resume = [c.items.get('m003')];
    const p = buildProgram(c, '2026-04-04');
    const book = createTicketBook();
    book.buyShow(p.shows[1], c.items.get(p.shows[1].itemId), 'x');
    const rows = showRows(p, 19 * 60, book.get());
    expect(rows[0].badge).toBe('Weiterschauen');
    expect(rows[1].mine).toBe(true);
    expect(rows[0].mine).toBe(false);
    expect(rows.every((r) => r.title && r.time)).toBe(true);
  });

  it('vergangene Vorstellungen tragen einen Hinweis statt stillschweigend verkauft zu werden', () => {
    const c = mk(8);
    const p = buildProgram(c, '2026-04-04');
    const late = p.shows[p.shows.length - 1].minutes + 600;
    const rows = showRows(p, late, null);
    expect(rows.every((r) => /läuft gerade nicht/.test(r.badge))).toBe(true);
  });

  it('Sitz-Freigabe: ohne Ticket Hinweis, außerhalb des Saals stumm', () => {
    expect(seatGate(null, true)).toEqual({ ok: false, msg: 'Erst ein Ticket an der Kasse holen' });
    expect(seatGate(null, false)).toEqual({ ok: false, msg: '' });
    expect(seatGate({ no: 1 }, true).ok).toBe(true);
    expect(tearLine(null)).toContain('Ticket');
    expect(tearLine({ no: 1 }, 5)).toBeTruthy();
  });

  it('Ticketnummer und Text sind deterministisch', () => {
    const a = createTicketBook().buyShow(prog.shows[0], cat.items.get(prog.shows[0].itemId), 'd');
    const b = createTicketBook().buyShow(prog.shows[0], cat.items.get(prog.shows[0].itemId), 'd');
    expect(a.no).toBe(b.no);
    expect(ticketText(a)).toBe(ticketText(b));
  });
});
