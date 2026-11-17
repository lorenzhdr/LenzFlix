// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { FrontSide, Vector3 } from 'three';
import { buildCity } from '../src/js/store3d/world/city.js';
import { buildPlan } from '../src/js/store3d/palast/plan.js';
import { buildFoyer } from '../src/js/store3d/palast/foyer.js';

// jsdom hat keinen 2D-Kontext: Stub, der jede Zeichenmethode schluckt.
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
let spy; let plan; let mesh;
beforeAll(() => { spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx2d); const W = 16, D = 26; plan = buildPlan(buildCity({ w: W, d: D, door: { x0: W / 2 - 1.1, x1: W / 2 + 1.1 } }).palast); mesh = buildFoyer(plan, {}).root.children.find((c) => c.name === 'palast-foyer-signs'); });
afterAll(() => spy.mockRestore());

describe('Palast-Schilder: keine Spiegelschrift von hinten', () => {

  it('Schildmaterial zeigt nur die Vorderseite', () => {
    expect(mesh.material.side).toBe(FrontSide);
  });

  it('SAAL 1 und LENZ PALAST sind von beiden Seiten lesbar (Fläche nach -z und nach +z)', () => {
    const pos = mesh.geometry.attributes.position;
    const nor = mesh.geometry.attributes.normal;
    const faces = (x, y, dirZ) => { let n = 0; for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - y) < 0.3 && nor.getZ(i) * dirZ > 0.9 && Math.abs(pos.getX(i) - x) < 1.01) n++; return n; };
    for (const [x, y] of [[plan.aisles[0], 2.85], [plan.aisles[1], 2.85], [plan.cx, 3.45]]) {
      expect(faces(x, y, -1)).toBeGreaterThan(0);
      expect(faces(x, y, 1)).toBeGreaterThan(0);
    }
    void Vector3;
  });
});
