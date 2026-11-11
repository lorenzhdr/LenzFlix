// LENZ LIVE Fernsehzeitung: Heftmodell (rein, ohne DOM/Netzwerk). Fake-Scheduler mit kontrollierten Plänen + echter Scheduler für die Struktur.
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { buildMagazine, collectTipIds, loadOverviews } from '../src/js/live/magazine/model.js';
import { normalizeCatalog, createScheduler, dayOfDate, dayBounds, formatClock, formatDay } from '../src/js/live/schedule/index.js';

const MIN = 60000;
const D0 = dayOfDate(2026, 10, 11);
const time = { formatClock, formatDay, dayBounds };

const ITEMS = {
  m1: { id: 'm1', kind: 'movie', title: 'Der Film', year: 1999, genres: ['action', 'drama'], durMs: 95 * MIN, age: 12 },
  m2: { id: 'm2', kind: 'movie', title: 'Klassiker', year: 1955, genres: ['drama'], durMs: 110 * MIN, age: 0 },
  m3: { id: 'm3', kind: 'movie', title: 'Premierenfilm', year: 2026, genres: ['komödie'], durMs: 100 * MIN, age: 16 },
  m4: { id: 'm4', kind: 'movie', title: 'Thementitel', year: 2001, genres: [], durMs: 90 * MIN, age: 6 },
};
for (let e = 1; e <= 9; e++) ITEMS['a' + e] = { id: 'a' + e, kind: 'episode', title: 'Folge ' + e, seriesId: 'sA', seriesTitle: 'Serie A', season: 1, episode: e, durMs: 25 * MIN, genres: ['krimi'], year: 2010, age: 12 };
ITEMS.b1 = { id: 'b1', kind: 'episode', title: 'Zwei', seriesId: 'sB', seriesTitle: 'Serie B', season: 1, episode: 9, durMs: 25 * MIN, genres: [], year: 2012, age: 0 };
ITEMS.b2 = { id: 'b2', kind: 'episode', title: 'Drei', seriesId: 'sB', seriesTitle: 'Serie B', season: 2, episode: 2, durMs: 25 * MIN, genres: [], year: 2012, age: 0 };
ITEMS.c1 = { id: 'c1', kind: 'episode', title: 'Neu', seriesId: 'sC', seriesTitle: 'Serie C', season: 3, episode: 1, durMs: 45 * MIN, genres: ['drama'], year: 2026, age: 16 };

const freeze = (o) => Object.freeze(o);

/** Kontrollierte Pläne je Sender; Premiere (17) nur an Tag D0+2 und D0+4, Thementag (18) an jedem Tag. */
function plan(no, D) {
  const b = dayBounds(D);
  const E = (start, end, o) => freeze({ start, end, ...o });
  const rel = (m) => b.start + m * MIN;
  const rel2015 = (m) => b.a2015 + m * MIN;
  if (no === 1) {
    return [
      E(b.start, b.start + 60 * MIN, { type: 'program', itemId: 'm2' }),
      E(b.start + 60 * MIN, b.start + 70 * MIN, { type: 'filler' }),
      E(b.start + 70 * MIN, b.start + 4 * 36e5, { type: 'fill', itemId: 'm4', label: 'Füllprogramm' }),
      E(b.start + 4 * 36e5, b.a2015, { type: 'fill', itemId: 'm4', label: 'Füllprogramm' }),
      E(b.a2015, rel2015(95), { type: 'program', itemId: 'm1' }),
      E(rel2015(95), rel2015(105), { type: 'filler' }),
      E(rel2015(105), b.end - 30 * MIN, { type: 'nightfill', itemId: 'm4', label: 'Füllprogramm – reguläres Programm ab 5:00' }),
      E(b.end - 30 * MIN, b.end, { type: 'closedown', reason: 'end' }),
    ];
  }
  if (no === 2) {
    // läuft um 20:15 schon (Start 19:45) → Tipp ist der erste Programmeintrag ab 20:15
    return [
      E(b.start, b.a2015 - 30 * MIN, { type: 'program', itemId: 'm1' }),
      E(b.a2015 - 30 * MIN, b.a2015 + 70 * MIN, { type: 'program', itemId: 'm2' }),
      E(b.a2015 + 70 * MIN, b.end, { type: 'program', itemId: 'm2', rerun: true }),
    ];
  }
  if (no === 3) {
    const out = [];
    let t = rel(0);
    // sA E3–E7 mit Füllern dazwischen (filler fehlt, Folgen werden zusammengefasst), dann E9, dann sB S1 E9 + S2 E2
    for (const id of ['a3', 'a4', 'a5', 'a6', 'a7', 'a9', 'b1', 'b2']) {
      out.push(E(t, t + 25 * MIN, { type: 'program', itemId: id, seriesId: ITEMS[id].seriesId }));
      t += 25 * MIN;
      if (id === 'a4') { out.push(E(t, t + 5 * MIN, { type: 'filler' })); t += 5 * MIN; }
    }
    out.push(E(t, b.end, { type: 'program', itemId: 'm1' }));
    return out;
  }
  if (no === 4) {
    return [
      E(b.start, rel(60), { type: 'program', itemId: 'a1', seriesId: 'sA' }),
      E(rel(60), rel(120), { type: 'program', itemId: 'a2', seriesId: 'sA' }),
      E(rel(120), rel(180), { type: 'program', itemId: 'b1', seriesId: 'sB' }),
      E(rel(180), b.end, { type: 'program', itemId: 'a3', seriesId: 'sA', rerun: true }),
    ];
  }
  if (no === 17) {
    const prem = D === D0 + 2 || D === D0 + 4;
    return prem
      ? [E(b.start, b.a2015, { type: 'program', itemId: 'm2', rerun: true }), E(b.a2015, rel2015(100), { type: 'program', itemId: 'm3', premiere: 'film', age: 16 }), E(rel2015(100), b.end, { type: 'program', itemId: 'm2', rerun: true })]
      : [E(b.start, b.end, { type: 'program', itemId: 'm2', rerun: true })];
  }
  if (no === 18) {
    return [E(b.start, rel(300), { type: 'program', itemId: 'm4', theme: 'Filmreihe Test', age: 6 }), E(rel(300), b.end, { type: 'program', itemId: 'c1', theme: 'Filmreihe Test', premiere: 'episode', seriesId: 'sC' })];
  }
  return [E(b.start, b.end, { type: 'program', itemId: 'm1' })];
}

function makeScheduler() {
  const chans = [];
  for (let no = 1; no <= 18; no++) chans.push({ no, name: 'LIVE Sender' + no, kind: 'special' });
  return {
    channels: () => chans,
    planDay: vi.fn((no, D) => plan(no, D)),
    item: (id) => ITEMS[id] || null,
    genres: () => [{ label: 'Action', count: 3 }, { label: 'Drama', count: 4 }, { label: 'Komödie', count: 1 }, { label: 'Krimi', count: 2 }],
  };
}

const mag = (over) => buildMagazine({ scheduler: makeScheduler(), today: D0, ...time, ...over });
const pageKinds = (m) => m.pages.map((p) => p.kind + (p.part ? p.part : ''));

describe('Heftmodell: Aufbau', () => {
  it('30 Seiten in richtiger Reihenfolge, Seitennummern 1..30', () => {
    const m = mag();
    expect(m.pages).toHaveLength(30);
    const expected = ['cover'];
    for (let i = 0; i < 7; i++) expected.push('tips', 'evening', 'day1', 'day2');
    expected.push('back');
    expect(pageKinds(m)).toEqual(expected);
    expect(m.pages.map((p) => p.no)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(m.days).toHaveLength(7);
    expect(m.days[0]).toMatchObject({ D: D0, weekday: 'Mi', date: '11.11.' });
    expect(m.pages[1]).toMatchObject({ kind: 'tips', D: D0, weekday: 'Mi', date: '11.11.' });
    expect(m.pages[5]).toMatchObject({ kind: 'tips', D: D0 + 1 });
    expect(m.title).toBe('LIVE Programm');
  });

  it('Tagesseiten: Teil 1 = Sender 1–9, Teil 2 = 10–18', () => {
    const m = mag();
    const d1 = m.pages[3];
    const d2 = m.pages[4];
    expect(d1.channels.map((c) => c.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(d2.channels.map((c) => c.no)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(d2.channels[8].theme).toBe('Filmreihe Test');
    expect(d1.channels[0].theme).toBeNull();
  });

  it('deterministisch: zweimal identisch, Plan wird nicht verändert', () => {
    const a = JSON.stringify(mag());
    const b = JSON.stringify(mag());
    expect(a).toBe(b);
  });

  it('Untertitel und Dateiname, auch über die Monatsgrenze', () => {
    const m = mag();
    expect(m.subtitle).toBe('Die Fernsehwoche · 11.–17.11.2026');
    expect(m.fileName).toBe('LIVE-Programm_2026-11-11.pdf');
    const m2 = mag({ today: dayOfDate(2026, 10, 28) });
    expect(m2.subtitle).toBe('Die Fernsehwoche · 28.11.–4.12.2026');
    expect(m2.fileName).toBe('LIVE-Programm_2026-11-28.pdf');
    const m3 = mag({ today: dayOfDate(2026, 11, 29) });
    expect(m3.subtitle).toBe('Die Fernsehwoche · 29.12.2026–4.1.2027');
  });
});

describe('Heftmodell: Tipps', () => {
  it('Tag ohne Premiere: Kino 20:15, Klassik (erster Programmeintrag ab 20:15), Thementag, Marathon; ≤ 5', () => {
    const t = mag().pages[1].tips;
    expect(t.map((x) => x.kindLabel)).toEqual(['Film', 'Film', 'Thementag', 'Marathon']);
    expect(t[0]).toMatchObject({ channelNo: 1, channelName: 'LIVE Sender1', time: '20:15', title: 'Der Film', itemId: 'm1', imageId: 'm1', year: 1999, runMin: 95, genres: ['Action', 'Drama'] });
    // Sender 2 läuft schon um 20:15: erster Programmeintrag ab 20:15 ist die Wiederholung um 21:45
    expect(t[1]).toMatchObject({ channelNo: 2, itemId: 'm2', title: 'Klassiker' });
    expect(t[1].start).toBeGreaterThanOrEqual(dayBounds(D0).a2015);
    expect(t[2]).toMatchObject({ channelNo: 18, itemId: 'm4', sub: 'Filmreihe Test' });
    expect(t[2].badges).toContain('Thementag');
    for (const p of mag().pages.filter((q) => q.kind === 'tips')) expect(p.tips.length).toBeLessThanOrEqual(5);
  });

  it('Premiere-Tag: Premiere (17) als dritter Tipp mit Badges; Reihenfolge Kino, Klassik, Premiere, Thementag, Marathon', () => {
    const p = mag().pages[1 + 4 * 2];
    expect(p.D).toBe(D0 + 2);
    expect(p.tips.map((x) => x.kindLabel)).toEqual(['Film', 'Film', 'Premiere', 'Thementag', 'Marathon']);
    const pr = p.tips[2];
    expect(pr).toMatchObject({ channelNo: 17, itemId: 'm3', time: '20:15', age: 16 });
    expect(pr.badges).toEqual(expect.arrayContaining(['Premiere', 'ab 16']));
  });

  it('Marathon: Serie des Tages, imageId = seriesId, Titel = Serie', () => {
    const t = mag().pages[1].tips.find((x) => x.kindLabel === 'Marathon');
    expect(t).toMatchObject({ title: 'Serie A', imageId: 'sA', channelNo: 4 });
  });

  it('Titelseite: Hero = erste Premiere der Woche, Teaser = Thementage', () => {
    const m = mag();
    expect(m.cover.hero).toMatchObject({ itemId: 'm3', kindLabel: 'Premiere' });
    expect(m.cover.teasers).toHaveLength(7);
    expect(m.cover.teasers[0]).toEqual({ D: D0, weekday: 'Mi', label: 'Filmreihe Test' });
  });

  it('Titelseite ohne Premiere: Hero = Kino heute 20:15', () => {
    const sch = makeScheduler();
    sch.planDay = (no, D) => (no === 17 ? [freeze({ start: dayBounds(D).start, end: dayBounds(D).end, type: 'closedown' })] : plan(no, D));
    const m = buildMagazine({ scheduler: sch, today: D0, ...time });
    expect(m.cover.hero).toMatchObject({ channelNo: 1, itemId: 'm1' });
  });

  it('overview: ohne Map null, mit Map gesetzt; collectTipIds eindeutig', () => {
    const m = mag();
    expect(m.pages[1].tips.every((t) => t.overview === null)).toBe(true);
    const ids = collectTipIds(m);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['m1', 'm2', 'm3', 'm4']));
    const m2 = mag({ overviews: new Map([['m1', 'Eine Inhaltsangabe.']]) });
    expect(m2.pages[1].tips[0].overview).toBe('Eine Inhaltsangabe.');
    expect(m2.pages[1].tips[1].overview).toBeNull();
    expect(m2.cover.hero.overview).toBeNull();
    const m3 = mag({ overviews: new Map([['m3', 'Premierentext']]) });
    expect(m3.cover.hero.overview).toBe('Premierentext');
  });
});

describe('Heftmodell: Zeilen', () => {
  const rows = (no) => mag().pages[3].channels.find((c) => c.no === no).rows;

  it('filler fehlt; fill/nightfill zusammengezogen; closedown → Sendeschluss', () => {
    const r = rows(1);
    expect(r.map((x) => x.title)).toEqual(['Klassiker', 'Füllprogramm', 'Der Film', 'Füllprogramm', 'Sendeschluss']);
    expect(r.map((x) => x.kind)).toEqual(['program', 'fill', 'program', 'fill', 'closedown']);
    expect(r[0].time).toBe('05:00');
    expect(r[2].time).toBe('20:15');
    expect(r.every((x) => typeof x.start === 'number' && Array.isArray(x.badges) && typeof x.sub === 'string')).toBe(true);
  });

  it('Folgen derselben Serie → eine Zeile mit Folgenspanne, Serienwechsel getrennt', () => {
    const r = rows(3);
    expect(r[0]).toMatchObject({ title: 'Serie A', sub: 'S1 E3–E9', kind: 'program' });
    expect(r.filter((x) => x.title === 'Serie A')).toHaveLength(1); // Filler dazwischen trennt nicht
    const b = r.find((x) => x.title === 'Serie B');
    expect(b.sub).toBe('S1 E9 – S2 E2');
  });

  it('Wiederholung bricht Folgenreihe nicht auf Serien-Sender, Badges Wdh./Premiere/ab 16/Thementag', () => {
    const marathon = rows(4);
    expect(marathon.map((x) => x.title)).toEqual(['Serie A', 'Serie B', 'Serie A']);
    expect(marathon[0].sub).toBe('S1 E1–E2');
    expect(marathon[2].badges).toContain('Wdh.');
    const d2 = mag().pages[4].channels.find((c) => c.no === 18).rows;
    expect(d2[0].badges).toContain('Thementag');
    expect(d2[1].badges).toEqual(expect.arrayContaining(['Neue Folge', 'Thementag']));
  });

  it('Abendprogramm: laufende und folgende Einträge ab 20:15 bis Tagesende', () => {
    const ev = mag().pages[2];
    expect(ev.kind).toBe('evening');
    expect(ev.channels).toHaveLength(18);
    const c2 = ev.channels.find((c) => c.no === 2);
    expect(c2.rows[0]).toMatchObject({ time: '19:45', title: 'Klassiker' }); // läuft um 20:15
    const c1 = ev.channels.find((c) => c.no === 1);
    expect(c1.rows.map((x) => x.title)).toEqual(['Der Film', 'Füllprogramm', 'Sendeschluss']);
  });
});

describe('Heftmodell: echter Scheduler', () => {
  it('liefert 30 Seiten, 18 Sender je Abend, deterministisch', async () => {
    const raw = { movies: [], series: [], episodes: [], boxsets: [], loadedAt: 0 };
    for (let i = 0; i < 80; i++) raw.movies.push({ Id: 'f' + i, Name: 'Film ' + i, RunTimeTicks: (80 + (i % 40)) * 6e8, Genres: [['Action', 'Komödie', 'Drama', 'Krimi'][i % 4]], OfficialRating: i % 9 === 0 ? 'R' : 'G', ProductionYear: 1980 + (i % 40), DateCreated: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() });
    for (let s = 0; s < 8; s++) {
      raw.series.push({ Id: 's' + s, Name: 'Serie ' + s, Genres: ['Krimi'], OfficialRating: 'PG', ProductionYear: 2005, DateCreated: new Date(Date.UTC(2026, 0, 1 + s)).toISOString() });
      for (let e = 0; e < 16; e++) raw.episodes.push({ Id: `s${s}e${e}`, SeriesId: 's' + s, ParentIndexNumber: 1, IndexNumber: e + 1, RunTimeTicks: 25 * 6e8, DateCreated: new Date(Date.UTC(2026, 0, 1 + s, 12, e)).toISOString() });
    }
    const sch = createScheduler(normalizeCatalog(raw));
    await sch.prepare(Array.from({ length: 7 }, (_, i) => D0 + i));
    const a = buildMagazine({ scheduler: sch, today: D0, ...time });
    const b = buildMagazine({ scheduler: sch, today: D0, ...time });
    expect(a.pages).toHaveLength(30);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.pages[2].channels).toHaveLength(18);
    expect(a.pages[3].channels[0].rows.every((r) => r.kind !== 'filler')).toBe(true);
    expect(a.pages[3].channels[0].rows.length).toBeGreaterThan(0);
  });
});

describe('loadOverviews', () => {
  it('eine Anfrage, Map id → Text, kurze Texte unverändert', async () => {
    const fn = vi.fn(async () => new Map([['a', { overview: '  Kurz   und gut.  ' }], ['b', { overview: '' }]]));
    const m = await loadOverviews(['a', 'b', 'a'], fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toEqual(['a', 'b']);
    expect(m.get('a')).toBe('Kurz und gut.');
    expect(m.has('b')).toBe(false);
  });

  it('kürzt auf ~240 Zeichen an der Satzgrenze, sonst an der Wortgrenze mit „…“', async () => {
    const sentences = Array.from({ length: 12 }, (_, i) => 'Das ist Satz Nummer ' + i + ' mit etwas Text.').join(' ');
    const words = Array.from({ length: 80 }, (_, i) => 'wort' + i).join(' ');
    const m = await loadOverviews(['s', 'w'], async () => new Map([['s', { overview: sentences }], ['w', { overview: words }]]));
    const s = m.get('s');
    expect(s.length).toBeLessThanOrEqual(240);
    expect(s.endsWith('.')).toBe(true);
    expect(s.length).toBeGreaterThan(150);
    const w = m.get('w');
    expect(w.length).toBeLessThanOrEqual(241);
    expect(w.endsWith('…')).toBe(true);
    expect(/\s…$/.test(w)).toBe(false);
  });

  it('Fehler oder fehlende Funktion → leere Map', async () => {
    expect((await loadOverviews(['a'], async () => { throw new Error('x'); })).size).toBe(0);
    expect((await loadOverviews(['a'], undefined)).size).toBe(0);
    expect((await loadOverviews([], vi.fn())).size).toBe(0);
  });
});
