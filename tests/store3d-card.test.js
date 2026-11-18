import { describe, it, expect } from 'vitest';
import {
  tierOf, stampsMask, foundFromMask, sumCounts, memberSince, cardData, toWire, fromWire, formatNo, formatDay, countOnce,
} from '../src/js/store3d/char/card.js';
import { CATALOG, TOTAL } from '../src/js/store3d/discover/catalog.js';
import { defaultCode } from '../src/js/store3d/char/look2.js';

describe('card', () => {
  it('Stufen-Grenzen', () => {
    expect(tierOf({ rent: 0, cine: 0, found: 0 })).toBe('bronze');
    expect(tierOf({ rent: 3, cine: 2, found: 3 })).toBe('bronze');
    expect(tierOf({ rent: 3, cine: 2, found: 4 })).toBe('silver');
    expect(tierOf({ rent: 2, cine: 2, found: 9 })).toBe('bronze');
    expect(tierOf({ rent: 10, cine: 10, found: 9 })).toBe('silver');
    expect(tierOf({ rent: 10, cine: 10, found: 10 })).toBe('gold');
    expect(tierOf({ rent: 19, cine: 0, found: 15 })).toBe('silver');
    expect(tierOf()).toBe('bronze');
  });

  it('Stempelmaske nach Katalogindex', () => {
    expect(stampsMask([])).toBe(0);
    expect(stampsMask([CATALOG[0].id])).toBe(1);
    expect(stampsMask([CATALOG[3].id, CATALOG[0].id, 'unbekannt'])).toBe(9);
    const all = CATALOG.map((e) => e.id);
    expect(stampsMask(all)).toBe(2 ** TOTAL - 1);
    expect(foundFromMask(2 ** TOTAL - 1)).toEqual(all);
    expect(foundFromMask(9)).toEqual([CATALOG[0].id, CATALOG[3].id]);
    expect(foundFromMask(-3)).toEqual([]);
    expect(foundFromMask('x')).toEqual([]);
    expect(stampsMask(new Set([CATALOG[1].id]))).toBe(2);
  });

  it('sumCounts', () => {
    expect(sumCounts({ rent: { a: 2, b: 3 }, cine: { a: 1 }, last: { x: 1 } })).toEqual({ rent: 5, cine: 1 });
    expect(sumCounts(null)).toEqual({ rent: 0, cine: 0 });
    expect(sumCounts({ rent: { a: 'x', b: -2 } })).toEqual({ rent: 0, cine: 0 });
  });

  it('memberSince nimmt das Minimum', () => {
    const d = (n) => n * 86400000 + 5000;
    expect(memberSince({ disc: { a: d(100), b: d(50) }, mem: { since: 70 } })).toBe(50);
    expect(memberSince({ disc: { a: d(100) }, mem: { since: 70 } })).toBe(70);
    expect(memberSince({ mem: { since: 70 } })).toBe(70);
    expect(memberSince({}, d(9))).toBe(9);
  });

  it('cardData', () => {
    const p = { mem: { no: '000042', since: 200 }, cnt: { rent: { a: 4 }, cine: { a: 1, b: 1 } }, disc: { [CATALOG[0].id]: 86400000 * 150, [CATALOG[1].id]: 1, [CATALOG[2].id]: 1, [CATALOG[3].id]: 1 } };
    const code = defaultCode();
    const c = cardData(p, { name: 'Lenz', showName: true, code, foundIds: Object.keys(p.disc) });
    expect(c).toMatchObject({ name: 'Lenz', no: '000042', since: 0, rent: 4, cine: 2, stamps: 15, total: TOTAL, tier: 'silver' });
    expect(c.code).toBe(code);
    expect(cardData(p, { name: 'Lenz', showName: false }).name).toBeNull();
    expect(cardData(null, {}).no).toBe('000000');
  });

  it('Wire-Rundreise', () => {
    const card = { no: '000123', since: 20000, rent: 7, cine: 3, stamps: 1023 };
    const w = toWire(card);
    expect(w).toEqual([1, 123, 20000, 7, 3, 1023]);
    const back = fromWire(w);
    expect(back).toMatchObject({ no: '000123', since: 20000, rent: 7, cine: 3, stamps: 1023, name: null, total: TOTAL, tier: 'silver' });
    expect(fromWire([1, 5])).toMatchObject({ no: '000005', rent: 0, stamps: 0, tier: 'bronze' });
    expect(fromWire([1, 5, 1, 1, 1, 2, 9, 9, 9, 9, 9, 9])).not.toBeNull();
  });

  it('fromWire: Müll gibt null', () => {
    for (const bad of [null, 'x', 5, [], [1], new Array(13).fill(1), [1, -1], [1, 1.5], [1, 'a'], [1, 2 ** 31], [0, 5], [1, NaN]]) expect(fromWire(bad)).toBeNull();
  });

  it('Formatierung', () => {
    expect(formatNo(42)).toBe('000042');
    expect(formatNo('123456')).toBe('123456');
    expect(formatNo(null)).toBe('000000');
    expect(formatDay(0)).toBe('01.01.1970');
    expect(formatDay(Math.floor(Date.UTC(2026, 10, 18, 23, 59) / 86400000))).toBe('18.11.2026');
  });

  it('countOnce: je Titel einmal pro Tag, höchstens 50', () => {
    let r = countOnce({}, 'a', 10);
    expect(r.ok).toBe(true);
    expect(r.last).toEqual({ a: 10 });
    const r2 = countOnce(r.last, 'a', 10);
    expect(r2.ok).toBe(false);
    expect(countOnce(r.last, 'a', 11).ok).toBe(true);
    expect(countOnce(r.last, 'b', 10).ok).toBe(true);
    let last = {};
    for (let i = 0; i < 70; i++) last = countOnce(last, 'i' + i, 100 + i).last;
    expect(Object.keys(last)).toHaveLength(50);
    expect(last.i0).toBeUndefined();
    expect(last.i69).toBe(169);
    expect(countOnce(null, 'x', 1).ok).toBe(true);
  });
});
