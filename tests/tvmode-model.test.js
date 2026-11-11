import { describe, it, expect, vi } from 'vitest';
import { normalizeCatalog, createScheduler, dayBounds, dayOfDate, broadcastDayOf, formatClock } from '../src/js/live/schedule/index.js';
import { nowAll, gridRows, describe as describeEntry, days, nextProgram } from '../src/js/live/tvmode/model.js';

const MIN = 6e8;
const D0 = dayOfDate(2026, 10, 11); // Mittwoch 11.11.2026
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

const sched = () => createScheduler(normalizeCatalog(smallRaw()), {});

describe('days', () => {
  it('liefert 7 Sendetage mit Heute, Morgen und Wochentag + Datum', () => {
    const r = days(Date.UTC(2026, 10, 11, 12, 0, 0));
    expect(r).toHaveLength(7);
    expect(r.map((x) => x.label)).toEqual(['Heute', 'Morgen', 'Fr 13.11.', 'Sa 14.11.', 'So 15.11.', 'Mo 16.11.', 'Di 17.11.']);
    expect(r[0].D).toBe(D0);
    expect(r[6].D).toBe(D0 + 6);
  });

  it('vor 05:00 (Planzone) gehört t noch zum Vortag', () => {
    const r = days(Date.UTC(2026, 10, 11, 3, 0, 0)); // 04:00 MEZ
    expect(r[0].D).toBe(D0 - 1);
    expect(r[2].label).toBe('Do 12.11.');
  });
});

describe('nowAll', () => {
  const s = sched();
  const t = Date.UTC(2026, 10, 11, 19, 30, 0);

  it('liefert alle 18 Sender mit Eintrag, Fortschritt und Folgesendung', () => {
    const all = nowAll(s, t);
    expect(all).toHaveLength(18);
    expect(all.map((x) => x.channel.no)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    for (const r of all) {
      expect(r.entry.start).toBeLessThanOrEqual(t);
      expect(r.entry.end).toBeGreaterThan(t);
      expect(r.progress).toBeGreaterThanOrEqual(0);
      expect(r.progress).toBeLessThanOrEqual(1);
      expect(r.progress).toBeCloseTo((t - r.entry.start) / (r.entry.end - r.entry.start), 10);
      if (r.next) expect(r.next.start).toBeGreaterThanOrEqual(r.entry.end);
    }
  });

  it('Folgesendung überspringt Füller', () => {
    const sch = {
      nowOn: (no, x) => (x < 100 ? { entry: { start: 0, end: 100, type: 'program' } } : x < 130 ? { entry: { start: 100, end: 130, type: 'filler' } } : { entry: { start: 130, end: 200, type: 'program', itemId: 'x' } }),
    };
    const n = nextProgram(sch, 1, { start: 0, end: 100, type: 'program' });
    expect(n.start).toBe(130);
  });
});

describe('gridRows', () => {
  const s = sched();
  const b = dayBounds(D0);

  it('schneidet Zellen auf das Fenster zu und deckt es lückenlos ab', () => {
    const from = b.start + 3600000 + 17 * 60000;
    const to = from + 3 * 3600000;
    const rows = gridRows(s, { from, to });
    expect(rows).toHaveLength(18);
    for (const r of rows) {
      expect(r.cells[0].start).toBe(from);
      expect(r.cells[r.cells.length - 1].end).toBe(to);
      r.cells.forEach((c, i) => {
        expect(c.end).toBeGreaterThan(c.start);
        expect(c.start).toBeGreaterThanOrEqual(from);
        expect(c.end).toBeLessThanOrEqual(to);
        if (i) expect(c.start).toBe(r.cells[i - 1].end);
        expect(['program', 'fill', 'filler', 'closedown']).toContain(c.kind);
        expect(typeof c.title).toBe('string');
        expect(c.title).not.toBe('');
      });
    }
    // erste Zelle beginnt (meist) früher als das Fenster: Zuschnitt sichtbar am Eintrag selbst
    expect(rows[0].cells[0].entry.start).toBeLessThanOrEqual(from);
  });

  it('ein Fenster über 05:00 nutzt zwei planDay-Aufrufe je Sender und wechselt den Tag', () => {
    const spy = vi.fn((no, D) => s.planDay(no, D));
    const wrapped = { ...s, planDay: spy };
    const from = b.end - 2 * 3600000;
    const to = b.end + 2 * 3600000;
    const rows = gridRows(wrapped, { from, to });
    const calls = spy.mock.calls.filter(([no]) => no === 1).map(([, D]) => D);
    expect(calls).toEqual([D0, D0 + 1]);
    const r = rows[0];
    expect(r.cells[0].start).toBe(from);
    expect(r.cells[r.cells.length - 1].end).toBe(to);
    expect(r.cells.some((c) => c.entry.start >= b.end)).toBe(true);
    expect(r.cells.some((c) => c.entry.start < b.end)).toBe(true);
    // lückenlos über die Tagesgrenze
    r.cells.forEach((c, i) => { if (i) expect(c.start).toBe(r.cells[i - 1].end); });
  });

  it('Senderköpfe kommen aus channels(D) des Fensterbeginns (oder opts.D)', () => {
    const ch = vi.fn((D) => s.channels(D));
    gridRows({ ...s, channels: ch }, { from: b.start, to: b.start + 3600000 });
    expect(ch).toHaveBeenCalledWith(D0);
    ch.mockClear();
    gridRows({ ...s, channels: ch }, { from: b.start, to: b.start + 3600000, D: D0 + 2 });
    expect(ch).toHaveBeenCalledWith(D0 + 2);
  });

  it('markiert die laufende Zelle über opts.now', () => {
    const now = b.start + 5 * 3600000 + 600000;
    const rows = gridRows(s, { from: b.start + 4 * 3600000, to: b.start + 8 * 3600000, now });
    for (const r of rows) {
      const live = r.cells.filter((c) => c.now);
      expect(live).toHaveLength(1);
      expect(live[0].entry.start).toBeLessThanOrEqual(now);
      expect(live[0].entry.end).toBeGreaterThan(now);
    }
    expect(gridRows(s, { from: b.start, to: b.start + 3600000 })[0].cells.every((c) => c.now === false)).toBe(true);
  });

  it('Titel für filler, fill und closedown', () => {
    const fake = {
      channels: () => [{ no: 1, key: 'k', name: 'LIVE 1' }],
      item: (id) => (id === 'a' ? { id: 'a', kind: 'movie', title: 'Der Film' } : id === 'b' ? { id: 'b', kind: 'movie', title: 'Lückenfüller' } : null),
      planDay: () => [
        { start: 0, end: 100, type: 'program', itemId: 'a' },
        { start: 100, end: 120, type: 'filler' },
        { start: 120, end: 200, type: 'fill', itemId: 'b' },
        { start: 200, end: 300, type: 'closedown', reason: 'nightly' },
      ],
      nowOn: (no, t) => ({ entry: t < 120 ? { start: 100, end: 120, type: 'filler' } : { start: 120, end: 200, type: 'fill', itemId: 'b' } }),
    };
    // t-Werte so klein, dass broadcastDayOf überall D = -1 ergibt: Fenster [0,300) im Jahr 1970
    const rows = gridRows(fake, { from: 0, to: 300 });
    const c = rows[0].cells;
    expect(c.map((x) => x.kind)).toEqual(['program', 'filler', 'fill', 'closedown']);
    expect(c[0].title).toBe('Der Film');
    expect(c[1].title).toBe('Gleich: Lückenfüller');
    expect(c[2].title).toBe('Füllprogramm');
    expect(c[2].sub).toBe('Lückenfüller');
    expect(c[3].title).toBe('Sendepause');
  });
});

describe('describe', () => {
  const items = {
    mv: { id: 'mv', kind: 'movie', title: 'Der Film', year: 1999, genres: ['drama'], durMs: 6600000 },
    ep: { id: 'ep', kind: 'episode', title: 'Pilot', seriesTitle: 'Die Serie', seriesId: 'se', season: 1, episode: 3, genres: [], durMs: 2700000 },
  };
  const fake = { item: (id) => items[id] || null, genres: () => [{ label: 'Drama', count: 1 }] };
  const t0 = Date.UTC(2026, 10, 11, 19, 15, 0); // 20:15 MEZ

  it('Film: Titel, Zeitspanne, Fortschritt, Badges', () => {
    const e = { start: t0, end: t0 + 6600000, type: 'program', itemId: 'mv', premiere: 'film', age: 16 };
    const d = describeEntry(fake, 7, e, t0 + 3300000);
    expect(d.title).toBe('Der Film');
    expect(d.sub).toBe('');
    expect(d.time).toBe(`${formatClock(e.start)}–${formatClock(e.end)}`);
    expect(d.time).toBe('20:15–22:05');
    expect(d.progress).toBeCloseTo(0.5, 5);
    expect(d.badges).toEqual(['Premiere', 'ab 16']);
    expect(d.kind).toBe('program');
    expect(d.itemId).toBe('mv');
    expect(d.imageItemId).toBe('mv');
    expect(d.genres).toEqual(['Drama']);
    expect(d.runMin).toBe(110);
    expect(d.overview).toBe('');
  });

  it('Folge: Serienname, „S1 E3 · Folgentitel“, Bild der Serie', () => {
    const e = { start: t0, end: t0 + 2700000, type: 'program', itemId: 'ep', rerun: true };
    const d = describeEntry(fake, 7, e, t0, { overviews: new Map([['ep', 'Text']]) });
    expect(d.title).toBe('Die Serie');
    expect(d.sub).toBe('S1 E3 · Pilot');
    expect(d.seriesId).toBe('se');
    expect(d.imageItemId).toBe('se');
    expect(d.badges).toEqual(['Wdh.']);
    expect(d.overview).toBe('Text');
  });

  it('fill, filler und closedown', () => {
    const fill = describeEntry(fake, 1, { start: t0, end: t0 + 1000, type: 'fill', itemId: 'mv', label: 'Füllprogramm' }, t0);
    expect(fill.title).toBe('Füllprogramm');
    expect(fill.sub).toBe('Der Film');
    expect(fill.kind).toBe('fill');
    expect(fill.badges).toContain('Füllprogramm');
    const cd = describeEntry(fake, 1, { start: t0, end: t0 + 1000, type: 'closedown', reason: 'empty' }, t0 + 500);
    expect(cd.title).toBe('Sendepause');
    expect(cd.kind).toBe('closedown');
    expect(cd.itemId).toBe(null);
    expect(cd.imageItemId).toBe(null);
    expect(cd.progress).toBeCloseTo(0.5, 5);
  });
});

describe('Sendetag', () => {
  it('Kontrolle: Fenster 04:00 MEZ gehört zum Vortag', () => {
    expect(broadcastDayOf(Date.UTC(2026, 10, 11, 3, 0, 0))).toBe(D0 - 1);
  });
});

describe('channelName', () => {
  it('entfernt das LIVE-Präfix und nutzt das Genre-Label', async () => {
    const { channelName } = await import('../src/js/live/tvmode/model.js');
    expect(channelName({ no: 1, name: 'LIVE Kino' })).toBe('Kino');
    expect(channelName({ no: 7, name: 'LIVE Action', genreLabel: 'Action' })).toBe('Action');
    expect(channelName({ no: 9, name: 'LIVE 9' })).toBe('Sender 9');
    expect(channelName(null)).toBe('');
  });
});
