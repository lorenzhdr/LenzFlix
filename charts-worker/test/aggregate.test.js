import { describe, expect, it } from 'vitest';
import { aggregate } from '../src/aggregate.js';

const row = (itemId, itemType, userId, plays = 1, secs = 600) => ({ itemId, itemType, userId, plays, secs });

describe('aggregate', () => {
  it('zählt distinct viewers pro Film und summiert plays/seconds', () => {
    const r = aggregate([row('m1', 'Movie', 'u1', 2, 100), row('m1', 'Movie', 'u2', 3, 200), row('m1', 'Movie', 'u1', 1, 50)], new Map());
    expect(r.movies).toEqual([{ id: 'm1', viewers: 2, plays: 6, seconds: 350 }]);
  });

  it('ordnet Episoden der Serie zu, viewers distinct über Episoden', () => {
    const map = new Map([['e1', 's1'], ['e2', 's1']]);
    const r = aggregate([row('e1', 'Episode', 'u1', 1, 10), row('e2', 'Episode', 'u1', 2, 20), row('e2', 'Episode', 'u2', 1, 5)], map);
    expect(r.series).toEqual([{ id: 's1', viewers: 2, plays: 4, seconds: 35 }]);
    expect(r.movies).toEqual([]);
  });

  it('verwirft unbekannte Episoden', () => {
    const r = aggregate([row('gone', 'Episode', 'u1')], new Map());
    expect(r).toEqual({ movies: [], series: [], all: [] });
  });

  it('sortiert viewers desc, plays desc, seconds desc', () => {
    const r = aggregate(
      [row('a', 'Movie', 'u1', 1, 10), row('b', 'Movie', 'u1', 5, 10), row('c', 'Movie', 'u1', 5, 99), row('d', 'Movie', 'u1', 1, 1), row('d', 'Movie', 'u2', 1, 1)],
      new Map(),
    );
    expect(r.movies.map((x) => x.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('all mischt Filme und Serien mit type und enthält keine UserIds', () => {
    const r = aggregate([row('m', 'Movie', 'u1'), row('e', 'Episode', 'u1'), row('e', 'Episode', 'u2')], new Map([['e', 's']]));
    expect(r.all.map((x) => [x.id, x.type])).toEqual([['s', 'Series'], ['m', 'Movie']]);
    expect(JSON.stringify(r)).not.toMatch(/u1|u2|users|userId/i);
  });

  it('begrenzt auf 50', () => {
    const rows = Array.from({ length: 80 }, (_, i) => row(`m${i}`, 'Movie', 'u1', i + 1));
    const r = aggregate(rows, new Map());
    expect(r.movies).toHaveLength(50);
    expect(r.all).toHaveLength(50);
    expect(r.movies[0].id).toBe('m79');
  });

  it('leere Eingabe -> leere Arrays', () => {
    expect(aggregate([], new Map())).toEqual({ movies: [], series: [], all: [] });
  });
});
