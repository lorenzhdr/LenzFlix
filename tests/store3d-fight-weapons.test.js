import { describe, it, expect } from 'vitest';
import { WEAPON_IDS, weaponInfo, selectTargets } from '../src/js/store3d/fight/weapons.js';

describe('fight/weapons', () => {
  it('Tabelle laut Vertrag', () => {
    expect(WEAPON_IDS).toEqual(['hand', 'belt', 'whip', 'laser']);
    const h = weaponInfo('hand');
    expect([h.range, h.dmg, h.knock, h.cooldown, h.max, h.sfx]).toEqual([1.6, 12, 1.0, 0.35, 1, 'slap']);
    expect(weaponInfo('belt')).toMatchObject({ range: 2.2, dmg: 20, knock: 1.6, cooldown: 0.6 });
    expect(weaponInfo('whip')).toMatchObject({ range: 3.5, dmg: 26, knock: 1.4, cooldown: 1.0, max: 2 });
    expect(weaponInfo('laser')).toMatchObject({ range: 15, dmg: 0 });
    expect(weaponInfo('nix').id).toBe('hand');
  });
  it('Kopie: Änderungen wirken nicht auf die Tabelle', () => {
    weaponInfo('hand').dmg = 99;
    expect(weaponInfo('hand').dmg).toBe(12);
  });
  it('Kegel ±25°, Reichweite, nächste zuerst, max', () => {
    const o = { x: 0, z: 0 };
    const d = { x: 1, z: 0 };
    const c = [{ x: 3, z: 0 }, { x: 1.2, z: 0 }, { x: 0, z: 1.2 }, { x: 2, z: 0.2 }, { x: 4, z: 0 }];
    expect(selectTargets(o, d, c, 'hand').map((t) => t.index)).toEqual([1]);
    expect(selectTargets(o, d, c, 'belt').map((t) => t.index)).toEqual([1]);
    expect(selectTargets(o, d, c, 'whip').map((t) => t.index)).toEqual([1, 3]);
    expect(selectTargets(o, d, c, 'laser')).toEqual([]);
    expect(selectTargets(o, { x: 0, z: 0 }, c, 'hand')).toEqual([]);
  });
});
