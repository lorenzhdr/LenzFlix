// VIDEOTHEK LENZ · Mehrspieler (C1): Netz-IDs der Requisiten (modules/props.js netIdOf, planProps-IDs eindeutig und im Format der Leitung).
import { describe, it, expect } from 'vitest';
import { netIdOf, planProps } from '../src/js/store3d/modules/props.js';
import { buildCity } from '../src/js/store3d/world/city.js';
import { resolveHoop } from '../src/js/store3d/physics/hoop.js';

describe('props: Netz-ID (netIdOf)', () => {
  it('data.net (Spawn "<c>.<n>") hat Vorrang vor data.id; ungültige Formate und fehlende Daten → null', () => {
    expect(netIdOf({ data: { id: 'binL' } })).toBe('binL');
    expect(netIdOf({ data: { id: 'binL', net: '3.7' } })).toBe('3.7');
    expect(netIdOf({ data: { tapeId: 'x' } })).toBeNull();
    expect(netIdOf({ data: { id: 'has space' } })).toBeNull();
    expect(netIdOf({ data: { id: 'x'.repeat(25) } })).toBeNull();
    expect(netIdOf({ data: { id: 'a:b' } })).toBeNull(); // ":" verletzt die ID-Regex
    expect(netIdOf({ data: null })).toBeNull();
    expect(netIdOf(null)).toBeNull();
  });
  it('alle Plan-IDs der Stadt sind eindeutig und gültig (W=12.5, 20, 28)', () => {
    for (const [w, d] of [[12.5, 18], [20, 24], [28, 30]]) {
      const city = buildCity({ w, d });
      const layout = { w, d, city, colliders: city.colliders, cidx: null };
      const hoop = resolveHoop(city.yard);
      const plan = planProps(layout, hoop);
      expect(plan.length).toBeGreaterThan(10);
      const ids = plan.map((p) => netIdOf({ data: { id: p.id } }));
      expect(ids.every(Boolean)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
