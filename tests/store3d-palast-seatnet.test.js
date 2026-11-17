// VIDEOTHEK LENZ · LENZ PALAST: Sitze im Netz (palast/seatnet.js): se [Reihe, Anteil], nächster freier Sitz, breitenunabhängig.
import { describe, it, expect } from 'vitest';
import { createSeatNet, buildSeatTable, encodeSeat } from '../src/js/store3d/palast/seatnet.js';
import { buildPlan, SEAT } from '../src/js/store3d/palast/plan.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';

const mkSeats = (rows = 3, n = 5, x0 = 2) => {
  const out = [];
  for (let r = 0; r < rows; r++) for (let j = 0; j < n; j++) out.push({ id: `${String.fromCharCode(65 + rows - 1 - r)}${j + 1}`, row: r, x: x0 + j, y: 1.15 + 0.1 * (rows - r), z: 30 + r, yaw: Math.PI, base: 0.1 * (rows - r) });
  return out;
};

describe('seatnet', () => {
  it('Tabelle: Anteil 0..1000 je Reihe, Reihen sortiert', () => {
    const t = buildSeatTable(mkSeats());
    expect(t.order).toEqual([0, 1, 2]);
    const row0 = t.rows.get(0);
    expect(row0.map((s) => s.frac)).toEqual([0, 250, 500, 750, 1000]);
  });

  it('encodeSeat: Reihe auf 0..5 geklemmt, unbekannte ID → null', () => {
    const t = buildSeatTable(mkSeats());
    expect(encodeSeat(t, 'A1')).toEqual([2, 0]);
    expect(encodeSeat(t, 'C5')).toEqual([0, 1000]);
    expect(encodeSeat(t, 'Z9')).toBeNull();
    const big = buildSeatTable(mkSeats(9));
    expect(encodeSeat(big, 'A1')[0]).toBeLessThanOrEqual(5);
  });

  it('sit: nächster Sitz am Anteil, Boden unter dem Sitz als y, Blick zur Leinwand', () => {
    const sn = createSeatNet(mkSeats());
    const s = sn.sit(7, [1, 500]);
    expect(s).toMatchObject({ x: 4, z: 31, yaw: Math.PI });
    expect(s.y).toBeCloseTo(0.2, 5);
    expect(sn.seatOf(7).id).toBe(s.id);
    expect(sn.has(7)).toBe(true);
  });

  it('zwei Fremde mit gleichem Wunsch bekommen verschiedene Sitze; der eigene Sitz zählt als belegt', () => {
    const sn = createSeatNet(mkSeats());
    const a = sn.sit(1, [1, 500]);
    const b = sn.sit(2, [1, 500]);
    expect(a.id).not.toBe(b.id);
    sn.setOwn('B2');
    const c = sn.sit(3, [1, 250]);
    expect(c.id).not.toBe('B2');
    expect(sn.taken().has('B2')).toBe(true);
  });

  it('volle Reihe: nächste Reihe; alles voll → null', () => {
    const sn = createSeatNet(mkSeats(1, 2));
    expect(sn.sit(1, [0, 0])).toBeTruthy();
    expect(sn.sit(2, [0, 0])).toBeTruthy();
    expect(sn.sit(3, [0, 0])).toBeNull();
  });

  it('Umsetzen mit gleichem Wunsch bleibt stabil; stand gibt frei; ungültiges se gibt frei', () => {
    const sn = createSeatNet(mkSeats());
    const a = sn.sit(1, [1, 500]);
    expect(sn.sit(1, [1, 500]).id).toBe(a.id);
    sn.stand(1);
    expect(sn.has(1)).toBe(false);
    sn.sit(1, [1, 500]);
    expect(sn.sit(1, null)).toBeNull();
    expect(sn.has(1)).toBe(false);
    sn.sit(5, [0, 0]);
    sn.clear();
    expect(sn.count()).toBe(0);
  });

  it('echter Plan: Rundlauf Sender → Empfänger liefert einen Sitz derselben Reihe, breitenunabhängig', () => {
    for (const items of [1, 40]) {
      const L = buildLayout([{ id: 'new', label: 'N', kind: 'new', color: '#f00', itemIds: Array.from({ length: items }, (_, i) => 'x' + i) }]);
      const plan = buildPlan(L.city.palast);
      const sn = createSeatNet(plan.seats);
      for (const s of plan.seats.filter((q, i) => i % 7 === 0)) {
        const se = sn.encode(s.id);
        expect(se[0]).toBeGreaterThanOrEqual(0);
        expect(se[0]).toBeLessThanOrEqual(5);
        const got = createSeatNet(plan.seats).sit(1, se);
        expect(got).toBeTruthy();
        expect(got.id).toBe(s.id);
        expect(got.y).toBeCloseTo(s.base, 5);
        expect(s.y - s.base).toBeCloseTo(SEAT.eye, 5);
      }
    }
  });
});
