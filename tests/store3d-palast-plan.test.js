import { describe, it, expect } from 'vitest';
import { buildCity } from '../src/js/store3d/world/city.js';
import { buildPlan, SEAT, outerPosterSlots, inRect } from '../src/js/store3d/palast/plan.js';
import { colliderBlocks, groundHeight, RADIUS, STEP_H } from '../src/js/store3d/nav/collide.js';

const doorOf = (W) => ({ x0: W / 2 - 1.1, x1: W / 2 + 1.1 });
const SIZES = [[12.5, 18], [16, 26], [24, 40]];

describe('Palast-Plan (rein)', () => {
  for (const [W, D] of SIZES) {
    describe(`W=${W} D=${D}`, () => {
      const city = buildCity({ w: W, d: D, door: doorOf(W) });
      const p = city.palast;
      const plan = buildPlan(p);

      it('ist deterministisch und JSON-sicher', () => {
        expect(JSON.stringify(buildPlan(p))).toBe(JSON.stringify(plan));
        const bad = [];
        const scan = (v, path) => {
          if (typeof v === 'number' && !Number.isFinite(v)) bad.push(path);
          else if (typeof v === 'function') bad.push(path);
          else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) scan(x, `${path}.${k}`);
        };
        scan(plan, 'plan');
        expect(bad).toEqual([]);
      });

      it('Sitze liegen im Saal, haben eindeutige Ids und Reihenhöhen fallen zur Leinwand', () => {
        expect(plan.seats.length).toBeGreaterThanOrEqual(plan.rows * 9);
        const ids = new Set(plan.seats.map((s) => s.id));
        expect(ids.size).toBe(plan.seats.length);
        for (const s of plan.seats) {
          expect(inRect(plan.bounds, s.x, s.z)).toBe(true);
          expect(s.y).toBeCloseTo(s.base + SEAT.eye, 3);
        }
        const byRow = (i) => plan.seats.find((s) => s.row === i).base;
        for (let i = 1; i < plan.rows; i++) expect(byRow(i)).toBeLessThan(byRow(i - 1));
        expect(byRow(plan.rows - 1)).toBe(0);
      });

      it('Leinwand samt Maske passt unter die Saaldecke und nicht hinter die Rückwand', () => {
        expect(plan.screen.top).toBeLessThanOrEqual(p.hall.ceil);
        expect(plan.screen.z).toBeLessThan(p.hall.z1);
      });

      it('Stufen und Ränge steigen höchstens um die Stufenhöhe', () => {
        let prev = 0;
        for (const s of plan.steps) { expect(s.y - prev).toBeLessThanOrEqual(STEP_H + 1e-6); prev = s.y; }
        const first = plan.platforms.length ? plan.platforms[0].y : prev;
        expect(first - prev).toBeLessThanOrEqual(STEP_H + 1e-6);
        expect(inRect(plan.bounds, plan.aisle.x, plan.aisle.z)).toBe(true);
      });

      it('Gangmitte vor den Saaltüren ist begehbar (Stufen steigen, keine Sitzblockade)', () => {
        const all = [...city.colliders, ...plan.colliders];
        for (const x of plan.aisles) {
          let y = 0;
          for (let z = p.hall.z0 + 0.1; z < p.seatBlock.z0 + plan.rows * p.seatBlock.pitch; z += 0.05) {
            const g = groundHeight(x, z, RADIUS, y, all);
            expect(g.y - y).toBeLessThanOrEqual(STEP_H + 1e-6);
            y = g.y;
            const blocked = all.filter((q) => x > q.x0 - RADIUS && x < q.x1 + RADIUS && z > q.z0 - RADIUS && z < q.z1 + RADIUS && colliderBlocks(q, y));
            expect(blocked.map((q) => q.id)).toEqual([]);
          }
        }
      });

      it('Stationen und Plakate liegen im Foyer', () => {
        const f = p.foyer;
        for (const q of [plan.stations.kasse, plan.stations.popcorn, plan.stations.ticketDesk]) {
          expect(q.x0).toBeGreaterThan(f.x0);
          expect(q.x1).toBeLessThan(f.x1);
          expect(q.z0).toBeGreaterThan(f.z0);
          expect(q.z1).toBeLessThan(f.z1);
        }
        for (const s of [plan.stations.ticket, plan.stations.popcornStaff]) expect(inRect(f, s.x, s.z)).toBe(true);
        for (const q of plan.posters) expect(inRect(f, q.x, q.z)).toBe(true);
      });

      it('Foyer-Möbel versperrt Eingangs- und Saaltür-Wege nicht', () => {
        const all = [...city.colliders, ...plan.colliders];
        const pts = [[plan.cx, p.foyer.z0 + 0.6], [plan.cx, p.foyer.z1 - 0.6], [plan.aisles[0], p.foyer.z1 - 0.6], [plan.aisles[1], p.foyer.z1 - 0.6]];
        for (const [x, z] of pts) {
          const hit = all.filter((q) => x > q.x0 - RADIUS && x < q.x1 + RADIUS && z > q.z0 - RADIUS && z < q.z1 + RADIUS && colliderBlocks(q, 0) && !String(q.id).startsWith('palastPart'));
          expect(hit.map((q) => q.id)).toEqual([]);
        }
      });
    });
  }

  it('outerPosterSlots: fehlend = [], gültige normalisiert, ungültige verworfen', () => {
    expect(outerPosterSlots({})).toEqual([]);
    expect(outerPosterSlots(null)).toEqual([]);
    const s = outerPosterSlots({ posterSlots: [{ x: 1, z: 2 }, { x: NaN, z: 1 }, null, { x: 3, y: 2, z: 4, w: 1, h: 2, yaw: 0 }] });
    expect(s.length).toBe(2);
    expect(s[0]).toMatchObject({ x: 1, z: 2, w: 0.9, yaw: Math.PI });
    expect(s[1].yaw).toBe(0);
  });
});
