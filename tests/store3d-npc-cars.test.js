import { describe, it, expect } from 'vitest';
import { buildCity, signalAt } from '../src/js/store3d/world/city.js';
import {
  createCar, stepCar, effectiveStop, laneSign, laneAxis, posOf, assignCars, carCount, parkingSpots, CAR_LEN, CAR_W, HORN_COOL, NUDGE_AFTER, inZebra,
} from '../src/js/store3d/npc/cars-logic.js';
import { seeded } from '../src/js/store3d/modules/m4-util.js';

const city = buildCity({ w: 20, d: 16 });
const lane = (id) => city.lanes.find((l) => l.id === id);
const zebra = (id) => city.zebras.find((z) => z.id === id);
const frontOf = (l, car) => car.p + laneSign(l) * (CAR_LEN / 2);
const envFor = (l, o = {}) => ({ lane: l, zebras: city.zebras, signal: { main: 'green', side: 'green' }, cars: [], obstacles: [], zebraOccupied: () => false, rand: seeded(1), ...o });
const run = (car, l, secs, env, dt = 0.05) => { const ev = []; for (let t = 0; t < secs; t += dt) ev.push(...stepCar(car, dt, env)); return ev; };
const inRect = (z, l, car) => { const p = posOf(l, car.p); const f = laneAxis(l) === 'x' ? { x: frontOf(l, car), z: p.z } : { x: p.x, z: frontOf(l, car) }; return inZebra(z, f.x, f.z, 0); };

describe('Auto-Fahrlogik: Haltelinie und Zebra', () => {
  it('effectiveStop liegt vor dem Zebra, das hinter der Haltelinie beginnt (alle vier Spuren)', () => {
    for (const l of city.lanes) {
      const eff = effectiveStop(l, city.zebras);
      const s = laneSign(l);
      expect((eff - l.stop.at) * s).toBeLessThan(0); // weiter stromaufwärts als die Linie
      // Stoßstange an eff liegt in keinem Zebra
      for (const z of city.zebras) {
        const x = laneAxis(l) === 'x' ? eff : l.x;
        const zz = laneAxis(l) === 'x' ? l.z : eff;
        expect(x > z.x0 && x < z.x1 && zz > z.z0 && zz < z.z1).toBe(false);
      }
    }
  });

  it('hält bei Rot vor dem Zebra und nie mit der Stoßstange darauf (Hauptstraße West/Ost, Seitenstraße)', () => {
    for (const id of ['mainW', 'mainE', 'sideS', 'sideN']) {
      const l = lane(id);
      const eff0 = effectiveStop(l, city.zebras);
      const car = createCar(l, { p: eff0 - laneSign(l) * (12 + CAR_LEN / 2), v: l.speed });
      const env = envFor(l, { signal: { main: 'red', side: 'red' } });
      let maxIn = false;
      for (let t = 0; t < 30; t += 0.05) { stepCar(car, 0.05, env); for (const zid of l.yields) if (inRect(zebra(zid), l, car)) maxIn = true; }
      expect(car.v).toBeLessThan(0.05);
      expect(maxIn).toBe(false);
      const eff = effectiveStop(l, city.zebras);
      expect((frontOf(l, car) - eff) * laneSign(l)).toBeLessThanOrEqual(0.05);
      expect((frontOf(l, car) - eff) * laneSign(l)).toBeGreaterThan(-3.5);
    }
  });

  it('fährt bei Grün durch', () => {
    const l = lane('mainW');
    const car = createCar(l, { p: l.from + laneSign(l) * 30, v: l.speed });
    const start = car.p;
    run(car, l, 4, envFor(l));
    expect((car.p - start) * laneSign(l)).toBeGreaterThan(20);
  });

  it('ignoriert Gelb, wenn der Bremsweg nicht mehr reicht', () => {
    const l = lane('mainW');
    const eff = effectiveStop(l, city.zebras);
    const car = createCar(l, { p: eff - laneSign(l) * (CAR_LEN / 2) + laneSign(l) * 3, v: l.speed }); // Stoßstange 3 m vor der Linie bei 8 m/s
    run(car, l, 0.5, envFor(l, { signal: { main: 'yellow', side: 'red' } }));
    expect(car.v).toBeGreaterThan(5);
  });

  it('hält vor einem Fußgänger auf dem Zebra, auch bei Grün', () => {
    const l = lane('mainE');
    const car = createCar(l, { p: zebra('zebraW').x0 - 30, v: l.speed });
    car.p = zebra('zebraW').x0 - 25;
    const env = envFor(l, { zebraOccupied: (id) => id === 'zebraW' });
    run(car, l, 12, env);
    expect(car.v).toBeLessThan(0.05);
    expect(frontOf(l, car)).toBeLessThan(zebra('zebraW').x0);
    env.zebraOccupied = () => false;
    run(car, l, 3, env);
    expect(car.v).toBeGreaterThan(2);
  });

  it('hält Abstand zum Vordermann', () => {
    const l = lane('mainW');
    const lead = createCar(l, { p: l.from + laneSign(l) * 30, v: 0 });
    const car = createCar(l, { p: l.from + laneSign(l) * 8, v: l.speed });
    lead.id = 1; car.id = 2;
    const env = envFor(l, { cars: [lead, car] });
    // Vordermann steht: der Hintermann bremst vorher
    let minGap = Infinity;
    for (let t = 0; t < 12; t += 0.05) { stepCar(car, 0.05, env); minGap = Math.min(minGap, ((lead.p - laneSign(l) * CAR_LEN / 2) - frontOf(l, car)) * laneSign(l)); }
    expect(minGap).toBeGreaterThan(1.5);
    expect(car.v).toBeLessThan(0.05);
  });

  it('erreicht das Spurende, verschwindet (away) und kommt nach der Wartezeit zurück', () => {
    const l = lane('sideS');
    const car = createCar(l, { p: l.to - laneSign(l) * 2, v: l.speed });
    const env = envFor(l, { cars: [car] });
    run(car, l, 1, env);
    expect(car.state).toBe('away');
    run(car, l, 15, env);
    expect(car.state).toBe('drive');
    expect(car.v).toBeGreaterThan(0);
    expect((car.p - l.from) * laneSign(l)).toBeGreaterThanOrEqual(0);
  });
});

describe('Auto: Hupen und Anrollen', () => {
  const blockedSetup = () => {
    const l = lane('mainW');
    const car = createCar(l, { p: l.from + laneSign(l) * 30, v: l.speed });
    const pos = posOf(l, car.p + laneSign(l) * 14);
    const env = envFor(l, { obstacles: [{ x: pos.x, z: pos.z, kind: 'player' }] });
    return { l, car, env };
  };

  it('hält vor dem Spieler und hupt genau einmal je Abkühlzeit', () => {
    const { l, car, env } = blockedSetup();
    const honks = [];
    for (let t = 0; t < HORN_COOL + 3; t += 0.05) { for (const e of stepCar(car, 0.05, env)) if (e.type === 'honk') honks.push(t); }
    expect(honks.length).toBeGreaterThanOrEqual(1);
    expect(honks.length).toBeLessThanOrEqual(2);
    if (honks.length === 2) expect(honks[1] - honks[0]).toBeGreaterThanOrEqual(HORN_COOL - 0.1);
    expect((env.obstacles[0].x - frontOf(l, car)) * laneSign(l)).toBeGreaterThan(0.8);
  });

  it('hupt Passanten an, rollt aber nie an (nur der Spieler wird sanft geschoben)', () => {
    const { l, car, env } = blockedSetup();
    env.obstacles[0].kind = 'ped';
    const ev = run(car, l, NUDGE_AFTER + 6, env);
    expect(ev.some((e) => e.type === 'nudge')).toBe(false);
    expect(ev.some((e) => e.type === 'honk' && e.toPlayer === false)).toBe(true);
  });

  it('rollt erst nach der Wartezeit an und meldet dann einen sanften Stoß in Fahrtrichtung', () => {
    const { l, car, env } = blockedSetup();
    const early = run(car, l, NUDGE_AFTER - 1.5, env);
    expect(early.some((e) => e.type === 'nudge')).toBe(false);
    const late = run(car, l, 8, env);
    const n = late.find((e) => e.type === 'nudge');
    expect(n).toBeTruthy();
    expect(n.dir.x).toBe(laneSign(l));
    expect(n.dir.z).toBe(0);
    // nie über den Spieler hinweg
    expect((env.obstacles[0].x - frontOf(l, car)) * laneSign(l)).toBeGreaterThan(-0.05);
  });

  it('Spieler abseits des Fahrstreifens blockiert nicht', () => {
    const l = lane('mainW');
    const car = createCar(l, { p: l.from + laneSign(l) * 30, v: l.speed });
    const pos = posOf(l, car.p + laneSign(l) * 14);
    const env = envFor(l, { obstacles: [{ x: pos.x, z: pos.z + 3, kind: 'player' }] });
    run(car, l, 2, env);
    expect(car.v).toBeGreaterThan(5);
  });
});

describe('Autos: Verteilung und parkende Plätze', () => {
  it('carCount: Anzahl aus Qualität, nachts eins weniger ab 3', () => {
    expect(carCount(2, 'night')).toBe(2);
    expect(carCount(6, 'night')).toBe(5);
    expect(carCount(0, 'day')).toBe(0);
  });

  it('assignCars: Hauptstraße zuerst, innerhalb der Spur, deterministisch', () => {
    const a = assignCars(city.lanes, 6, seeded(4));
    const b = assignCars(city.lanes, 6, seeded(4));
    expect(a).toEqual(b);
    expect(a.slice(0, 2).every((c) => c.lane.startsWith('main'))).toBe(true);
    for (const c of a) {
      const l = lane(c.lane);
      expect((c.p - l.from) * laneSign(l)).toBeGreaterThanOrEqual(0);
      expect((l.to - c.p) * laneSign(l)).toBeGreaterThan(0);
    }
  });

  it('parkingSpots: frei von Kollidern, Spuren, Zebras, Fußwegen, Signalen und Plätzen anderer Pakete', () => {
    for (const [w, d] of [[12, 10], [15.6, 22.6], [20, 16], [30, 20]]) {
    const city = buildCity({ w, d });
    const spots = parkingSpots(city);
    expect(spots.length).toBeGreaterThanOrEqual(3);
    for (const s of spots) {
      expect(s.x1 - s.x0).toBeCloseTo(CAR_W, 5);
      expect(s.z1 - s.z0).toBeCloseTo(CAR_LEN, 5);
      for (const q of city.colliders) expect(s.x0 < q.x1 && s.x1 > q.x0 && s.z0 < q.z1 && s.z1 > q.z0, `${s.id} × ${q.id}`).toBe(false);
      // Fahrstreifen (Breite 3,0 m) der Seitenstraßen und Hauptstraße
      for (const l of city.lanes) {
        if (laneAxis(l) === 'z') expect(s.x0 < l.x + 1.5 && s.x1 > l.x - 1.5 && s.z0 < l.to + 1e9 && s.z1 > Math.min(l.from, l.to)).toBe(false);
        else expect(s.z0 < l.z + 1.5 && s.z1 > l.z - 1.5).toBe(false);
      }
      for (const z of city.zebras) expect(s.x0 < z.x1 && s.x1 > z.x0 && s.z0 < z.z1 && s.z1 > z.z0, `${s.id} × ${z.id}`).toBe(false);
      for (const p of city.sidewalkPaths) for (let i = 0; i < p.pts.length - 1; i++) {
        const a = p.pts[i]; const b = p.pts[i + 1];
        const x0 = Math.min(a.x, b.x) - 1; const x1 = Math.max(a.x, b.x) + 1; const z0 = Math.min(a.z, b.z) - 1; const z1 = Math.max(a.z, b.z) + 1;
        expect(s.x0 < x1 && s.x1 > x0 && s.z0 < z1 && s.z1 > z0, `${s.id} × ${p.id}`).toBe(false);
      }
      for (const sg of city.signals) expect(sg.x > s.x0 - 0.5 && sg.x < s.x1 + 0.5 && sg.z > s.z0 - 0.5 && sg.z < s.z1 + 0.5).toBe(false);
      for (const slot of [...city.propSlots, ...city.discoverSlots]) expect(slot.x > s.x0 - 0.3 && slot.x < s.x1 + 0.3 && slot.z > s.z0 - 0.3 && slot.z < s.z1 + 0.3, `${s.id} × ${slot.id}`).toBe(false);
      for (const l of city.lights) expect(l.x > s.x0 - 0.3 && l.x < s.x1 + 0.3 && l.z > s.z0 - 0.3 && l.z < s.z1 + 0.3).toBe(false);
    }
    }
  });

  it('Ampel-Uhr aus signalAt steuert die Spurlogik (Rot ↔ Grün der Gegenrichtung)', () => {
    const s = signalAt(11.7);
    expect(s.main).toBe('red');
    expect(s.walkMain).toBe(true);
  });
});
