// VIDEOTHEK LENZ · Modul `traffic` (Welle 2, Paket E): Autos auf layout.city.lanes, parkende Autos in den Seitenstraßen, Hupen, Zebra-Fund.
// Provider 'traffic' { zebraClear(edge) → bool (für Passanten am ungeregelten Zebra), cars() → [{ lane, x, z, v, state }], parked() → Rechtecke (3 Kollider je Auto), parkedCars() → ein Rechteck je Auto,
//   laserHit(point {x,y,z}) → { id, lane, x, z } | null (fahrendes Auto, dessen Fahrerkabine der Laserpunkt trifft; Box 3,2 m lang, y 0,65..1,75),
//   blindDriver(ref | id, { decel?, stand? }) → bool (Vollbremsung 9 m/s², 2,5 s stehen und hupen; 1.18.0) }.
// Fahrlogik: npc/cars-logic.js (Halten bei Rot VOR dem Zebra, Zebra-Vorrang, Abstand, Hupen, sanftes Anrollen gegen den Spieler).
// Bewegliche Autos sind dynamische Kollider (top:false, nie begehbar); parkende Autos sind statisch (dreiteilig: Haube/Kabine/Heck, Dach per Mantle).
// ?cars=0 (ctx.opts.devFlags.cars === false): nichts, 'traffic' bleibt als Attrappe (zebraClear → true).
import { presetFor } from '../engine/quality.js';
import { signalAt } from '../world/city.js';
import { createCarMesh, setCarLightsOn, disposeCarCaches, STYLE_COUNT, CAR_COLORS } from '../npc/cars.js';
import { createCar, stepCar, blindCar, assignCars, carCount, parkingSpots, posOf, laneSign, CAR_LEN, CAR_W, inZebra } from '../npc/cars-logic.js';
import { debugHook } from './m3-debug.js';

const NEAR_COLLIDER = 36; // m: darüber Auto-Kollider nur grob nachführen
const FAR = 58;
const HORN_HEAR = 38;
const CAB_HALF = 1.6; // halbe Kabinenlänge (m) für den Laser-Treffer
const CAB_Y0 = 0.65;
const CAB_Y1 = 1.75;
const SIGNAL_ZEBRAS = { zebraW: 'walkMain', zebraE: 'walkMain', zebraArmN: 'walkSide', zebraArmS: 'walkSide' };

export default {
  name: 'traffic',
  init(ctx) {
    const flags = (ctx.opts && ctx.opts.devFlags) || {};
    const L = ctx.layout;
    const city = L.city || null;
    const off = [];
    const cars = []; // { car, lane, mesh, col, yaw }
    const parkedCols = [];
    const parkedMeshes = [];
    const parkedSpots = []; // ein Rechteck je geparktem Auto (Vereinigung seiner 3 Kollider)
    const weather = () => ctx.use('weather') || {};
    const groups = () => { const c = ctx.use('city'); return (c && c.groups) || null; };
    const found = (id) => { const d = ctx.use('discover'); if (d && d.found) { try { d.found(id); } catch { /* egal */ } } };
    const sound = (n) => { const s = ctx.use('sound'); if (s && s.play) s.play(n); };
    const xrOn = () => !!(ctx.xr && ctx.xr.presenting());
    let preset = presetFor(ctx.quality(), ctx.isPhone);
    let px = 0; let pz = 0; let py = 0; let havePose = false;
    const zebraWalk = new Map(); // Zebra-Fund: id → { entry: ±1, walk: bool }

    const api = {
      zebraClear: () => true,
      cars: () => cars.map((c) => ({ lane: c.car.lane, ...posOf(c.lane, c.car.p), v: c.car.v, state: c.car.state })),
      parked: () => parkedCols.map((q) => ({ x0: q.x0, z0: q.z0, x1: q.x1, z1: q.z1 })),
      parkedCars: () => parkedSpots.map((q) => ({ x0: q.x0, z0: q.z0, x1: q.x1, z1: q.z1 })),
      laserHit: () => null,
      blindDriver: () => false,
    };
    const offProvider = ctx.provide('traffic', api);
    if (flags.cars === false || !city || !city.lanes) return { dispose() { offProvider(); } };

    const rand = Math.random;
    const lanes = city.lanes;
    const laneById = new Map(lanes.map((l) => [l.id, l]));
    const g0 = groups();
    const street = () => { const g = groups(); return (g && g.street) || ctx.scene; };

    function addCar(spec, i) {
      const lane = laneById.get(spec.lane);
      const car = createCar(lane, { id: i, p: spec.p, v: lane.speed * 0.5, style: spec.style, speedMul: spec.speedMul });
      const mesh = createCarMesh(spec.style % STYLE_COUNT, (i * 3 + spec.style) % CAR_COLORS.length, true);
      street().add(mesh.root);
      const col = ctx.addCollider({ x0: 0, z0: 0, x1: 1, z1: 1, y1: 1.4, top: false, kind: 'car' }, { dynamic: true });
      const e = { car, lane, mesh, col, yaw: 0 };
      cars.push(e);
      applyCar(e, true);
    }
    function removeCar(e) {
      const i = cars.indexOf(e);
      if (i >= 0) cars.splice(i, 1);
      ctx.removeCollider(e.col);
      if (e.mesh.root.parent) e.mesh.root.parent.remove(e.mesh.root);
    }
    function adjust() {
      const want = carCount(preset.carsMax, weather().tod || 'day');
      if (cars.length > want) { while (cars.length > want) removeCar(cars[cars.length - 1]); return; }
      if (cars.length < want) {
        const specs = assignCars(lanes, want, rand);
        for (let i = cars.length; i < want; i++) addCar(specs[i], i);
      }
    }
    function applyCar(e, force) {
      const { car, lane, mesh } = e;
      if (car.state === 'away') {
        mesh.root.visible = false;
        if (e.col.x0 > -9000 || force) ctx.moveCollider(e.col, -9990, -9990, -9989, -9989);
        return;
      }
      const p = posOf(lane, car.p);
      mesh.root.position.set(p.x, 0, p.z);
      mesh.root.rotation.y = Math.atan2(-lane.dir.x, -lane.dir.z); // Blick in Fahrtrichtung (−z bei yaw 0)
      const d = havePose ? Math.hypot(p.x - px, p.z - pz) : 0;
      mesh.root.visible = d < FAR;
      const alongX = !!lane.dir.x;
      const hx = alongX ? CAR_LEN / 2 : CAR_W / 2;
      const hz = alongX ? CAR_W / 2 : CAR_LEN / 2;
      if (d < NEAR_COLLIDER || force) ctx.moveCollider(e.col, p.x - hx, p.z - hz, p.x + hx, p.z + hz);
    }

    function buildParked() {
      const spots = parkingSpots(city);
      const n = preset.carsMax >= 3 ? spots.length : 1;
      for (let i = 0; i < n; i++) {
        const s = spots[i];
        const mesh = createCarMesh((i + 1) % STYLE_COUNT, (i * 2 + 1) % CAR_COLORS.length, false);
        mesh.root.position.set(s.cx, 0, s.cz);
        street().add(mesh.root);
        parkedMeshes.push(mesh);
        const hood = ctx.addCollider({ id: `${s.id}H`, kind: 'car', x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z0 + 1.2, y1: 0.95 });
        const cab = ctx.addCollider({ id: `${s.id}C`, kind: 'car', x0: s.x0, z0: s.z0 + 1.2, x1: s.x1, z1: s.z0 + 3.4, y1: 1.42 });
        const tr = ctx.addCollider({ id: `${s.id}T`, kind: 'car', x0: s.x0, z0: s.z0 + 3.4, x1: s.x1, z1: s.z1, y1: 0.95 });
        parkedCols.push(hood, cab, tr);
        parkedSpots.push({ x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1 });
      }
    }
    function clearParked() {
      for (const q of parkedCols) ctx.removeCollider(q);
      parkedCols.length = 0;
      parkedSpots.length = 0;
      for (const m of parkedMeshes) if (m.root.parent) m.root.parent.remove(m.root);
      parkedMeshes.length = 0;
    }

    adjust();
    buildParked();
    void g0;

    api.zebraClear = (edge) => {
      // ungeregelter Zebrastreifen: frei, wenn kein fahrendes Auto in 10 m vor der Querung heranfährt
      const x = (edge.ax + edge.bx) / 2;
      for (const e of cars) {
        if (e.car.state !== 'drive' || e.lane.dir.x === 0) continue;
        const s = laneSign(e.lane);
        const front = e.car.p + s * (CAR_LEN / 2);
        const d = (x - front) * s;
        if (d > -CAR_LEN && d < 10 && e.car.v > 0.9) return false;
      }
      return true;
    };

    /** Trifft der Laserpunkt die Fahrerkabine eines fahrenden Autos? (Box um die Mitte, Längsachse = Fahrtrichtung.) */
    api.laserHit = (pt) => {
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.z)) return null;
      const y = Number.isFinite(pt.y) ? pt.y : 1;
      if (y < CAB_Y0 || y > CAB_Y1) return null;
      for (const e of cars) {
        if (e.car.state === 'away') continue;
        const p = posOf(e.lane, e.car.p);
        const alongX = !!e.lane.dir.x;
        const hx = alongX ? CAB_HALF : CAR_W / 2 + 0.1;
        const hz = alongX ? CAR_W / 2 + 0.1 : CAB_HALF;
        if (Math.abs(pt.x - p.x) <= hx && Math.abs(pt.z - p.z) <= hz) return { id: e.car.id, lane: e.car.lane, x: p.x, z: p.z };
      }
      return null;
    };
    /** Fahrer blenden: ref = Rückgabe von laserHit oder Auto-Id. */
    api.blindDriver = (ref, o) => {
      if (xrOn()) return false;
      const id = ref && typeof ref === 'object' ? ref.id : ref;
      const e = cars.find((c) => c.car.id === id);
      return !!e && blindCar(e.car, o);
    };

    function zebraOccupiedSet(people) {
      const occ = new Set();
      for (const z of city.zebras) {
        if (havePose && py < 1.0 && inZebra(z, px, pz)) { occ.add(z.id); continue; }
        for (const p of people) if (inZebra(z, p.x, p.z)) { occ.add(z.id); break; }
      }
      return occ;
    }

    function trackZebra(sig) {
      if (!havePose || py > 1.0) { zebraWalk.clear(); return; }
      for (const z of city.zebras) {
        const key = SIGNAL_ZEBRAS[z.id];
        if (!key) continue;
        const inside = px > z.x0 && px < z.x1 && pz > z.z0 && pz < z.z1;
        const acrossZ = z.id === 'zebraW' || z.id === 'zebraE'; // quert die Hauptstraße in z-Richtung
        const side = acrossZ ? (pz < (z.z0 + z.z1) / 2 ? -1 : 1) : (px < (z.x0 + z.x1) / 2 ? -1 : 1);
        const rec = zebraWalk.get(z.id);
        if (inside && !rec) zebraWalk.set(z.id, { entry: side, walk: !!sig[key] });
        else if (!inside && rec) {
          const outSide = acrossZ ? (pz < z.z0 ? -1 : pz > z.z1 ? 1 : 0) : (px < z.x0 ? -1 : px > z.x1 ? 1 : 0);
          if (rec.walk && outSide !== 0 && outSide !== rec.entry) found('zebra');
          zebraWalk.delete(z.id);
        }
      }
    }

    const offDbg = debugHook(ctx, 'traffic', { cars: () => api.cars(), parked: () => api.parked() });
    let acc = 0;
    return {
      update(dt) {
        dt = Math.min(dt, 0.1);
        const pose = ctx.player.getPose();
        px = pose.x; pz = pose.z; py = Number.isFinite(pose.y) ? pose.y : 0; havePose = true;
        const sig = ctx.use('city') && ctx.use('city').signals ? ctx.use('city').signals() : signalAt(Date.now() / 1000);
        setCarLightsOn((weather().tod || 'day') !== 'day' || !!(weather().wet !== undefined ? weather().wet : weather().raining) || weather().fog > 0.2);
        const gs = groups();
        const streetVisible = !gs || !gs.street || gs.street.visible || xrOn();
        const npc = ctx.use('npc');
        const people = npc && npc.people ? npc.people().filter((p) => p.kind === 'walker') : [];
        const occ = zebraOccupiedSet(people);
        const obstacles = people.map((p) => ({ x: p.x, z: p.z, kind: 'ped' }));
        if (havePose && py < 1.0) obstacles.push({ x: px, z: pz, kind: 'player' });
        const all = cars.map((e) => e.car);
        for (const e of cars) {
          const evs = stepCar(e.car, dt, { lane: e.lane, zebras: city.zebras, signal: sig, cars: all, obstacles, zebraOccupied: (id) => occ.has(id), rand });
          for (const ev of evs) {
            const p = posOf(e.lane, e.car.p);
            const d = Math.hypot(p.x - px, p.z - pz);
            if (ev.type === 'honk' && d < HORN_HEAR) {
              sound('honk');
              if (ev.toPlayer && d < 12) found('car-honk');
            } else if (ev.type === 'nudge' && !xrOn() && d < 8) {
              ctx.player.knock({ x: ev.dir.x, z: ev.dir.z, up: 0 }, 0.6);
            }
          }
          if (streetVisible) applyCar(e, false);
          else if (e.col.x0 > -9000) ctx.moveCollider(e.col, -9990, -9990, -9989, -9989);
        }
        acc += dt;
        if (acc > 0.2) { acc = 0; trackZebra(sig); }
      },
      onQuality() {
        preset = presetFor(ctx.quality(), ctx.isPhone);
        adjust();
        clearParked();
        buildParked();
      },
      dispose() {
        offProvider();
        for (const e of [...cars]) removeCar(e);
        clearParked();
        disposeCarCaches();
        offDbg();
        for (const o of off) o();
      },
    };
  },
};
