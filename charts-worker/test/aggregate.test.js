import { describe, expect, it } from 'vitest';
import { HALF_LIFE_DAYS, aggregate, weight } from '../src/aggregate.js';

const DAY = 86400;
const round = (x) => Math.round(x * 1000) / 1000;
// age in Sekunden; Standard 0 = frisch (Gewicht 1)
const row = (itemId, itemType, userId, plays = 1, secs = 600, age = 0) => ({ itemId, itemType, userId, plays, secs, age });
const eps = (n, sid = 's', user = 'u1', age = 0) => {
  const rows = [];
  const map = new Map();
  for (let i = 0; i < n; i++) {
    rows.push(row(`${sid}e${i}`, 'Episode', user, 1, 600, age));
    map.set(`${sid}e${i}`, sid);
  }
  return { rows, map };
};

describe('weight', () => {
  it('Halbwertszeit 7 Tage', () => {
    expect(HALF_LIFE_DAYS).toBe(7);
    expect(weight(0)).toBe(1);
    expect(weight(7 * DAY)).toBeCloseTo(0.5, 10);
    expect(weight(14 * DAY)).toBeCloseTo(0.25, 10);
  });
  it('ungültig -> 1, negativ -> 1', () => {
    for (const v of [null, undefined, NaN, 'x', Infinity]) expect(weight(v)).toBe(1);
    expect(weight(-5 * DAY)).toBe(1);
  });
});

describe('aggregate', () => {
  it('Film: score = Summe der Gewichte je Person, distinct viewers, plays/seconds summiert', () => {
    const r = aggregate([row('m1', 'Movie', 'u1', 2, 100), row('m1', 'Movie', 'u2', 3, 200, 7 * DAY)], new Map());
    expect(r.movies).toEqual([{ id: 'm1', viewers: 2, plays: 5, seconds: 300, score: 1.5 }]);
  });

  it('Film: score <= viewers', () => {
    const r = aggregate(
      [row('m1', 'Movie', 'u1', 1, 900, 0), row('m1', 'Movie', 'u2', 1, 900, 3 * DAY), row('m1', 'Movie', 'u3', 1, 900, 30 * DAY)],
      new Map(),
    );
    expect(r.movies[0].viewers).toBe(3);
    expect(r.movies[0].score).toBeLessThanOrEqual(3);
  });

  it('Serie: log2-Treppe 1/3/7/15 frische Folgen einer Person -> 1/2/3/4', () => {
    for (const [n, score] of [[1, 1], [3, 2], [7, 3], [15, 4]]) {
      const { rows, map } = eps(n);
      expect(aggregate(rows, map).series[0].score).toBe(score);
    }
  });

  it('Serie: Halbwertszeit (7 Tage -> 0.5, 14 Tage -> 0.25)', () => {
    const a = eps(1, 'a', 'u1', 7 * DAY);
    expect(aggregate(a.rows, a.map).series[0].score).toBe(round(Math.log2(1.5)));
    const b = eps(1, 'b', 'u1', 14 * DAY);
    expect(aggregate(b.rows, b.map).series[0].score).toBe(round(Math.log2(1.25)));
  });

  it('Serie: viewers distinct, score Summe über Personen', () => {
    const map = new Map([['e1', 's1'], ['e2', 's1']]);
    const r = aggregate([row('e1', 'Episode', 'u1', 1, 10), row('e2', 'Episode', 'u1', 2, 20), row('e2', 'Episode', 'u2', 1, 5)], map);
    // u1: W=2 -> log2(3); u2: W=1 -> 1
    expect(r.series).toEqual([{ id: 's1', viewers: 2, plays: 4, seconds: 35, score: round(Math.log2(3) + 1) }]);
    expect(r.movies).toEqual([]);
  });

  it('ungültiges und negatives age zählt mit Gewicht 1', () => {
    const r = aggregate(
      [row('m1', 'Movie', 'u1', 1, 900, null), row('m1', 'Movie', 'u2', 1, 900, undefined), row('m1', 'Movie', 'u3', 1, 900, -100)],
      new Map(),
    );
    expect(r.movies[0].score).toBe(3);
  });

  it('verwirft unbekannte Episoden', () => {
    const r = aggregate([row('gone', 'Episode', 'u1')], new Map());
    expect(r).toEqual({ movies: [], series: [], all: [] });
  });

  it('Sortierung: score vor viewers (25 frische Folgen einer Person schlagen 3 Personen mit je 1 Folge)', () => {
    const a = eps(25, 'A', 'u1');
    const rows = [...a.rows, row('b1', 'Episode', 'u1'), row('b2', 'Episode', 'u2'), row('b3', 'Episode', 'u3')];
    const map = new Map([...a.map, ['b1', 'B'], ['b2', 'B'], ['b3', 'B']]);
    const r = aggregate(rows, map);
    // A: u1 hat 25 Folgen -> log2(26) ~ 4.7; B: 3 Personen je 1 Folge -> 3 (u1 zählt mit 1 Folge zusätzlich zu A)
    expect(r.series.map((x) => x.id)).toEqual(['A', 'B']);
    expect(r.series[0].score).toBeCloseTo(Math.log2(26), 3);
    expect(r.series[1].score).toBe(3);
    expect(r.series[1].viewers).toBe(3);
    // Mischliste bleibt bei der alten Regel: viewers zuerst -> B vor A
    expect(r.all.map((x) => x.id)).toEqual(['B', 'A']);
  });

  it('Gleichstand: score, dann viewers, plays, seconds, dann id aufsteigend', () => {
    const r = aggregate(
      [
        row('z', 'Movie', 'u1', 1, 10),
        row('a', 'Movie', 'u1', 1, 10),
        row('b', 'Movie', 'u1', 5, 10),
        row('c', 'Movie', 'u1', 5, 99),
        row('d', 'Movie', 'u1', 1, 1, 7 * DAY),
        row('d', 'Movie', 'u2', 1, 1, 7 * DAY),
        row('d', 'Movie', 'u3', 1, 1, 7 * DAY),
      ],
      new Map(),
    );
    // d: score 1.5 vorn; danach gleiche scores 1: c (plays 5, secs 99), b, dann a vor z (id)
    expect(r.movies.map((x) => x.id)).toEqual(['d', 'c', 'b', 'a', 'z']);
  });

  it('gleiches Alter (Tageswerte) -> exakter score-Gleichstand', () => {
    const r = aggregate([row('a', 'Movie', 'u1', 1, 900, 2 * DAY), row('b', 'Movie', 'u1', 1, 900, 2 * DAY)], new Map());
    expect(r.movies[0].score).toBe(r.movies[1].score);
  });

  it('Filme: höhere completion gewinnt bei gleichem score/viewers, unabhängig von der Länge', () => {
    // short: 90 min, 2 Personen ganz; long: 180 min, 2 Personen halb -> gleiche Sekunden
    const rt = new Map([['short', 5400], ['long', 10800]]);
    const rows = [
      row('long', 'Movie', 'u1', 1, 5400),
      row('long', 'Movie', 'u2', 1, 5400),
      row('short', 'Movie', 'u1', 1, 5400),
      row('short', 'Movie', 'u2', 1, 5400),
    ];
    const r = aggregate(rows, new Map(), 50, rt);
    expect(r.movies.map((x) => x.id)).toEqual(['short', 'long']);
    expect(r.movies[0].completion).toBe(2);
    expect(r.movies[1].completion).toBe(1);
    // ohne Laufzeiten: Rückfall auf seconds/plays/id, kein completion-Feld
    const r2 = aggregate(rows, new Map());
    expect(r2.movies.map((x) => x.id)).toEqual(['long', 'short']);
    expect('completion' in r2.movies[0]).toBe(false);
  });

  it('Filme: completion nur im Vergleich, wenn beide eine Laufzeit haben', () => {
    const rows = [row('a', 'Movie', 'u1', 1, 100), row('b', 'Movie', 'u1', 1, 200)];
    const r = aggregate(rows, new Map(), 50, new Map([['a', 100]]));
    expect(r.movies.map((x) => x.id)).toEqual(['b', 'a']); // b mehr seconds; a hat nur einseitig completion
    expect(r.movies[1].completion).toBe(1);
    expect('completion' in r.movies[0]).toBe(false);
  });

  it('Filme: completion je Person auf 1 gekappt', () => {
    const r = aggregate([row('a', 'Movie', 'u1', 3, 9000)], new Map(), 50, new Map([['a', 3000]]));
    expect(r.movies[0].completion).toBe(1);
  });

  it('Serien: seconds vor plays; all bleibt viewers/plays/seconds', () => {
    const rows = [row('e1', 'Episode', 'u1', 9, 100), row('e2', 'Episode', 'u1', 1, 5000)];
    const r = aggregate(rows, new Map([['e1', 'A'], ['e2', 'B']]));
    expect(r.series.map((x) => x.id)).toEqual(['B', 'A']);
    expect(r.all.map((x) => x.id)).toEqual(['A', 'B']);
  });

  it('Gleicher score, mehr viewers gewinnt', () => {
    // x: 2 Personen je 0.5 = 1.0; y: 1 Person frisch = 1.0
    const r = aggregate([row('y', 'Movie', 'u1'), row('x', 'Movie', 'u1', 1, 600, 7 * DAY), row('x', 'Movie', 'u2', 1, 600, 7 * DAY)], new Map());
    expect(r.movies.map((x) => x.id)).toEqual(['x', 'y']);
  });

  it('all mischt Filme und Serien mit type, ohne score und ohne UserIds', () => {
    const r = aggregate([row('m', 'Movie', 'u1'), row('e', 'Episode', 'u1'), row('e', 'Episode', 'u2')], new Map([['e', 's']]));
    expect(r.all).toEqual([
      { id: 's', type: 'Series', viewers: 2, plays: 2, seconds: 1200 },
      { id: 'm', type: 'Movie', viewers: 1, plays: 1, seconds: 600 },
    ]);
    expect(JSON.stringify(r)).not.toMatch(/u1|u2|users|userId/i);
  });

  it('all ignoriert Aktualität (alt gewinnt bei mehr Zuschauern)', () => {
    const r = aggregate(
      [row('old', 'Movie', 'u1', 1, 900, 60 * DAY), row('old', 'Movie', 'u2', 1, 900, 60 * DAY), row('new', 'Movie', 'u1', 1, 900, 0)],
      new Map(),
    );
    expect(r.all.map((x) => x.id)).toEqual(['old', 'new']);
    expect(r.movies.map((x) => x.id)).toEqual(['new', 'old']);
  });

  it('begrenzt auf 50', () => {
    const rows = Array.from({ length: 80 }, (_, i) => row(`m${String(i).padStart(2, '0')}`, 'Movie', 'u1', i + 1));
    const r = aggregate(rows, new Map());
    expect(r.movies).toHaveLength(50);
    expect(r.all).toHaveLength(50);
    expect(r.movies[0].id).toBe('m79');
  });

  it('leere Eingabe -> leere Arrays', () => {
    expect(aggregate([], new Map())).toEqual({ movies: [], series: [], all: [] });
  });
});
