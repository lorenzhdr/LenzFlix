import { describe, it, expect } from 'vitest';
import { createCat, stepCat, petCat, catPettable, scareCat, lineFree, createFlock, stepFlock, flush, CAT, PIGEON } from '../src/js/store3d/npc/animals-logic.js';
import { catSpots, pigeonHomes, staffAnchors, vendorAnchor } from '../src/js/store3d/npc/spots.js';
import { buildCity } from '../src/js/store3d/world/city.js';
import { seeded } from '../src/js/store3d/modules/m4-util.js';

const spots = [{ x: 0, z: 0, y: 0 }, { x: 6, z: 0, y: 0 }, { x: 12, z: 0, y: 1.6 }, { x: -6, z: 0, y: 0 }];
const envOf = (rand, player, o = {}) => ({ rand, spots, free: () => true, player, ...o });
const run = (cat, secs, env, dt = 0.05) => { const ev = []; for (let t = 0; t < secs; t += dt) ev.push(...stepCat(cat, dt, env)); return ev; };

describe('Katze (Zustandsautomat)', () => {
  it('sitzt, putzt und läuft zwischen Plätzen, ohne den Boden zu verlassen', () => {
    const cat = createCat(spots, seeded(2));
    const seen = new Set();
    const env = envOf(seeded(9), null);
    for (let t = 0; t < 200; t += 0.1) { stepCat(cat, 0.1, env); seen.add(cat.state); expect(Number.isFinite(cat.x + cat.z + cat.y)).toBe(true); }
    expect(seen.has('sit')).toBe(true);
    expect(seen.has('walk')).toBe(true);
    expect(seen.has('groom')).toBe(true);
  });

  it('flieht, wenn der Spieler nah heranrennt, und wählt einen Platz weg von ihm', () => {
    const cat = createCat(spots, seeded(1));
    cat.spot = 0; cat.x = 0; cat.z = 0; cat.y = 0; cat.state = 'sit'; cat.timer = 50;
    const ev = run(cat, 0.2, envOf(seeded(1), { x: -2, z: 0, speed: 5 }));
    expect(cat.state).toBe('flee');
    expect(ev.some((e) => e.type === 'startle')).toBe(true);
    expect(cat.to.x).toBeGreaterThan(0); // weg vom Spieler (liegt westlich)
    run(cat, 8, envOf(seeded(1), { x: -2, z: 0, speed: 0 }));
    expect(cat.state).not.toBe('flee');
  });

  it('bleibt bei ruhigem Herankommen sitzen und ist streichelbar', () => {
    const cat = createCat(spots, seeded(1));
    cat.x = 0; cat.z = 0; cat.y = 0; cat.spot = 0; cat.state = 'sit'; cat.timer = 50;
    const pl = { x: 1.5, z: 0, speed: 0.6 };
    run(cat, 1, envOf(seeded(1), pl));
    expect(cat.state).toBe('sit');
    expect(catPettable(cat, pl)).toBe(true);
    expect(catPettable(cat, { x: 1.5, z: 0, speed: 3 })).toBe(false);
    expect(catPettable(cat, { x: 5, z: 0, speed: 0 })).toBe(false);
    expect(petCat(cat)).toBe(true);
    expect(cat.state).toBe('purr');
    run(cat, CAT.purrT + 0.5, envOf(seeded(1), pl));
    expect(cat.state).toBe('sit');
  });

  it('Streicheln geht nicht, während sie läuft oder flieht', () => {
    const cat = createCat(spots, seeded(1));
    cat.state = 'walk';
    expect(petCat(cat)).toBe(false);
    expect(catPettable(cat, { x: cat.x, z: cat.z, speed: 0 })).toBe(false);
  });

  it('Schlag in der Nähe (scareCat) erschreckt, verletzt aber nichts: nur Zustandswechsel', () => {
    const cat = createCat(spots, seeded(1));
    cat.x = 0; cat.z = 0; cat.spot = 0; cat.state = 'sit';
    scareCat(cat, envOf(seeded(3), { x: 1, z: 0, speed: 0 }));
    expect(cat.state).toBe('flee');
    expect(cat.startled).toBeGreaterThan(0);
  });

  it('Hochspringen: Höhe steigt erst am Ende der Strecke auf den Zielplatz', () => {
    const cat = createCat(spots, seeded(1));
    cat.x = 6; cat.z = 0; cat.y = 0; cat.spot = 0; cat.state = 'sit';
    scareCat(cat, envOf(seeded(1), { x: 0, z: 0, speed: 0 }, { spots: [{ x: 6, z: 0, y: 0 }, { x: 12, z: 0, y: 1.6 }] }));
    expect(cat.state).toBe('flee');
    expect(cat.to.y).toBe(1.6);
    run(cat, 5, envOf(seeded(1), null, { spots: [{ x: 6, z: 0, y: 0 }, { x: 12, z: 0, y: 1.6 }] }));
    expect(cat.y).toBeCloseTo(1.6, 1);
  });

  it('lineFree: Kisten sperren die Gerade, der Zielplatz auf der Kiste nicht', () => {
    const cols = [{ x0: 2, z0: -1, x1: 3, z1: 1, y1: 1.1 }, { x0: 8, z0: -1, x1: 9, z1: 1, y1: 0.2 }];
    expect(lineFree(cols, { x: 0, z: 0 }, { x: 6, z: 0 })).toBe(false);
    expect(lineFree(cols, { x: 0, z: 0 }, { x: 2.5, z: 0 })).toBe(true);
    expect(lineFree(cols, { x: 6, z: 0 }, { x: 11, z: 0 })).toBe(true); // niedriges Hindernis zählt nicht
    expect(lineFree(cols, { x: 0, z: 5 }, { x: 6, z: 5 })).toBe(true);
  });
});

describe('Taubenschwarm', () => {
  const homes = [{ x: 0, z: 0, r: 1.4 }, { x: 10, z: 0, r: 1.4 }];
  const envOf2 = (rand, player) => ({ rand, homes, player, bounds: { x0: -50, z0: -50, x1: 50, z1: 50 } });

  it('startet am Boden (peck/walk)', () => {
    const f = createFlock(homes, 6, seeded(1));
    expect(f).toHaveLength(6);
    expect(f.every((p) => p.state === 'peck' && p.y === 0)).toBe(true);
  });

  it('scheucht bei naher oder rennender Annäherung gemeinsam auf (mit Verzögerungen)', () => {
    const f = createFlock(homes, 6, seeded(1));
    const ev = stepFlock(f, 0.05, envOf2(seeded(2), { x: 1, z: 0, speed: 0 }));
    expect(ev.some((e) => e.type === 'flush')).toBe(true);
    expect(f.every((p) => p.state === 'fly')).toBe(true);
    expect(new Set(f.map((p) => p.delay.toFixed(2))).size).toBeGreaterThan(1);
    const g = createFlock(homes, 4, seeded(1));
    expect(stepFlock(g, 0.05, envOf2(seeded(2), { x: 6, z: 0, speed: 5 })).length).toBe(1);
    const h = createFlock(homes, 4, seeded(1));
    expect(stepFlock(h, 0.05, envOf2(seeded(2), { x: 6, z: 0, speed: 1 })).length).toBe(0);
  });

  it('fliegt hoch, kreist 6–14 s, landet wieder an einem Heimatplatz', () => {
    const f = createFlock(homes, 5, seeded(3));
    const env = envOf2(seeded(4), null);
    flush(f, { x: -3, z: 0 }, seeded(5));
    let maxY = 0;
    let t = 0;
    while (t < 40 && !f.every((p) => p.state === 'peck' || p.state === 'walk')) { stepFlock(f, 0.05, env); maxY = Math.max(maxY, ...f.map((p) => p.y)); t += 0.05; }
    expect(maxY).toBeGreaterThan(PIGEON.altitude * 0.6);
    expect(t).toBeGreaterThan(PIGEON.flyMin - 0.1);
    expect(t).toBeLessThan(40);
    for (const p of f) {
      expect(p.y).toBe(0);
      const near = homes.some((h) => Math.hypot(p.x - h.x, p.z - h.z) < 3.5);
      expect(near).toBe(true);
    }
  });

  it('bleibt in der Welt (Rückdrehen am Rand)', () => {
    const f = createFlock([{ x: 0, z: 0, r: 1 }], 3, seeded(1));
    const env = { rand: seeded(1), homes: [{ x: 0, z: 0, r: 1 }], player: null, bounds: { x0: -30, z0: -30, x1: 30, z1: 30 } };
    flush(f, { x: -1, z: 0 }, seeded(1));
    for (let t = 0; t < 14; t += 0.05) stepFlock(f, 0.05, env);
    for (const p of f) expect(Math.hypot(p.x, p.z)).toBeLessThan(60);
  });
});

describe('Plätze (aus der echten Stadt)', () => {
  const city = buildCity({ w: 20, d: 16 });
  it('Katzenplätze liegen im Hinterhof und nicht in Hindernissen (außer auf Deckeln), für mehrere Ladengrößen', () => {
    for (const [w, d] of [[12, 10], [15.6, 22.6], [20, 16], [30, 20]]) {
      const c = buildCity({ w, d });
      const sp = catSpots(c);
      expect(sp.length).toBeGreaterThanOrEqual(6);
      for (const s of sp) {
        expect(s.x).toBeGreaterThanOrEqual(c.yard.x0 - 0.5);
        expect(s.z).toBeLessThan(c.yard.z1);
        for (const q of c.colliders) {
          if (!(s.x > q.x0 - 0.2 && s.x < q.x1 + 0.2 && s.z > q.z0 - 0.2 && s.z < q.z1 + 0.2)) continue;
          expect(s.y, `${w}x${d} ${s.id} in ${q.id}`).toBeCloseTo(q.y1, 5); // nur als Oberseite
        }
      }
    }
  });

  it('Taubenheimat liegt auf Gehwegen und kollidiert nicht (mehrere Ladengrößen)', () => {
    for (const [w, d] of [[12, 10], [15.6, 22.6], [20, 16], [30, 20]]) {
      const c = buildCity({ w, d });
      for (const h of pigeonHomes(c)) {
        for (const q of c.colliders) expect(h.x > q.x0 - h.r && h.x < q.x1 + h.r && h.z > q.z0 - h.r && h.z < q.z1 + h.r, `${w}x${d} ${h.id} × ${q.id}`).toBe(false);
      }
    }
  });

  it('Personal- und Verkäuferin-Anker: Fallback im Foyer/am Kiosk, Anker von A/B haben Vorrang', () => {
    const a = staffAnchors(city);
    const f = city.palast.foyer;
    for (const r of ['ticket', 'popcorn']) { expect(a[r].x).toBeGreaterThan(f.x0); expect(a[r].x).toBeLessThan(f.x1); expect(a[r].z).toBeGreaterThan(f.z0); expect(a[r].z).toBeLessThan(f.z1); }
    const v = vendorAnchor(city);
    // Anker von Paket A: Verkäuferin steht im Häuschen hinter der Theke (Blick zur Straße)
    const hut = city.kiosk.hut;
    expect(v.z).toBeGreaterThan(hut.z0); expect(v.z).toBeLessThan(city.kiosk.counter.z0);
    expect(v.x).toBeGreaterThan(hut.x0); expect(v.x).toBeLessThan(hut.x1);
    const fallback = vendorAnchor({ ...city, kiosk: { ...city.kiosk, vendor: undefined } });
    expect(fallback.anchor).toBe(false);
    const custom = { ...city, palast: { ...city.palast, staff: { ticket: { x: 1, z: 2, yaw: 3 } } }, kiosk: { ...city.kiosk, vendor: { x: 5, z: 6, yaw: 1 } } };
    expect(staffAnchors(custom).ticket).toEqual({ x: 1, z: 2, yaw: 3 });
    expect(vendorAnchor(custom).x).toBe(5);
  });
});
