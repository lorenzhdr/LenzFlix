import { describe, it, expect } from 'vitest';
import { areaAt, visibleGroups, AREAS, OUTDOOR_AREAS } from '../src/js/store3d/world/city.js';
import { layoutOf } from './helpers-city.js';

describe('areaAt (rein)', () => {
  const L = layoutOf(200);
  const f = L.city.frame;
  const sp = L.city.spawns;
  const at = (x, z, y = 0) => areaAt(L, x, z, y);

  it('liefert für jede Zone und jeden Spawn den erwarteten Bereich', () => {
    expect(at(sp.shop.x, sp.shop.z)).toBe('shop');
    expect(at(sp.street.x, sp.street.z)).toBe('street');
    expect(at(sp.palast.x, sp.palast.z)).toBe('palastFoyer');
    expect(at(sp.yard.x, sp.yard.z)).toBe('yard');
    expect(at(sp.kiosk.x, sp.kiosk.z)).toBe('kiosk');
    expect(at(sp.alley.x, sp.alley.z)).toBe('alley');
    expect(at(sp.roof.x, sp.roof.z, 3.3)).toBe('roof');
    const hall = L.city.palast.hall;
    expect(at((hall.x0 + hall.x1) / 2, (hall.z0 + hall.z1) / 2)).toBe('palastHall');
    expect(at(L.w / 2, f.roadMid)).toBe('street');
    expect(at((f.xc0 + f.xc1) / 2, f.roadMid)).toBe('crossing');
    expect(at((f.xc0 + f.xc1) / 2, f.zSN + 3)).toBe('sideN');
    expect(at((f.xc0 + f.xc1) / 2, f.zSS - 3)).toBe('sideS');
    expect(at(L.w / 2, f.sz - 1)).toBe('palastEntrance');
    expect(at(L.w / 2, L.d + 0.4)).toBe('doorway');
    expect(at(f.XW0 - 5, f.D + 5)).toBe('outside');
  });

  it('Dach über dem Laden: dieselbe x/z-Position ist mit y >= 2,9 "roof", sonst "shop"', () => {
    expect(at(L.w / 2, L.d / 2, 0)).toBe('shop');
    expect(at(L.w / 2, L.d / 2, 3.3)).toBe('roof');
    expect(at(L.w / 2, L.d / 2, 1.05)).toBe('shop'); // auf dem Tresen
  });

  it('Feuertreppe: auf Podest und Stufen "escape" (auch in Höhe des Dachs)', () => {
    const q = L.colliders.find((c) => c.id === 'escapeL2');
    expect(at((q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2, 3.3)).toBe('escape');
  });

  it('alle Ergebnisse stehen in AREAS; Außenbereiche sind für den Regen definiert', () => {
    for (let x = -30; x < 70; x += 3.7) for (let z = -15; z < 65; z += 3.1) expect(AREAS).toContain(at(x, z));
    expect(OUTDOOR_AREAS).not.toContain('shop');
    expect(OUTDOOR_AREAS).not.toContain('palastHall');
    expect(OUTDOOR_AREAS).toContain('street');
  });

  it('ohne city: nur shop oder outside', () => {
    const lay = { w: 10, d: 10 };
    expect(areaAt(lay, 5, 5, 0)).toBe('shop');
    expect(areaAt(lay, 5, 15, 0)).toBe('outside');
  });
});

describe('visibleGroups (rein): Sichtbarkeitstabelle', () => {
  const L = layoutOf(200);
  const f = L.city.frame;
  const vis = (x, z, y = 0) => visibleGroups(L, areaAt(L, x, z, y), x, z);

  it('im Laden: Hülle und Regale sichtbar, Hof und Palast-Innenraum nicht', () => {
    const v = vis(L.spawn.x, L.spawn.z);
    expect(v).toMatchObject({ shopShell: true, shelves: true, street: true, yard: false, palastInterior: false });
  });

  it('vor dem Laden auf dem Gehweg: Hülle und Regale (Blick durchs Fenster)', () => {
    const v = vis(L.w / 2, f.D + 1.5);
    expect(v.shopShell).toBe(true);
    expect(v.shelves).toBe(true);
  });

  it('weit südlich auf der Straße: keine Regale mehr, Hülle nur nah (|x - W/2| < W/2 + 8, z - D < 14)', () => {
    expect(vis(L.w / 2, f.D + 9).shelves).toBe(false);
    expect(vis(L.w / 2, f.D + 9).shopShell).toBe(true);
    expect(vis(L.w / 2, f.sz + 3).shopShell).toBe(false); // im Palast
    expect(vis(f.XW1 - 3, f.D + 5).shopShell).toBe(false);
  });

  it('im Hof, in der Gasse, auf Feuertreppe und Dach: Außenhof sichtbar, Laden-Innenraum nicht', () => {
    for (const [x, z, y] of [[L.city.spawns.yard.x, L.city.spawns.yard.z, 0], [L.city.spawns.alley.x, L.city.spawns.alley.z, 0], [L.city.spawns.roof.x, L.city.spawns.roof.z, 3.3]]) {
      const v = vis(x, z, y);
      expect(v.yard).toBe(true);
      expect(v.shopShell).toBe(false);
      expect(v.shelves).toBe(false);
    }
  });

  it('im Palast-Saal: Straße ausgeblendet, Palast-Innenraum sichtbar; Palast-Hülle immer', () => {
    const h = L.city.palast.hall;
    const v = vis((h.x0 + h.x1) / 2, (h.z0 + h.z1) / 2);
    expect(v.street).toBe(false);
    expect(v.palastInterior).toBe(true);
    expect(v.palastExterior).toBe(true);
  });

  it('Palast-Innenraum auch vor der Tür (Abstand < 12 m, davor)', () => {
    expect(vis(L.w / 2, f.sz - 4).palastInterior).toBe(true);
    expect(vis(L.w / 2, f.D + 1.5).palastInterior).toBe(true); // 9 m vor der Palast-Tür
    expect(vis(L.w / 2, L.d - 3).palastInterior).toBe(false); // im Laden
    expect(vis(f.XW0 + 2, f.D + 1.5).palastInterior).toBe(false); // zu weit weg
  });
});
