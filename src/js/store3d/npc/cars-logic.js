// VIDEOTHEK LENZ · Auto-Fahrlogik (rein, ohne three/DOM). Autos fahren kinematisch auf layout.city.lanes:
// halten bei Rot vor der Haltelinie UND vor dem davorliegenden Zebrastreifen, lassen Fußgänger auf Zebrastreifen, halten Abstand,
// halten vor Spieler/Passanten auf der Fahrbahn, hupen (mit Abkühlzeit) und schieben sehr sanft („nudge“), wenn der Spieler nicht weicht.
// Hinweis: In city.js liegt `stop.at` HINTER dem ersten Zebrastreifen der Fahrtrichtung (Bsp. mainW: Linie xc1+1.4, Zebra xc1+2.2…4.4).
// Ein bei Rot haltendes Auto stünde auf dem Streifen, auf dem in dieser Phase die Fußgänger gehen. effectiveStop() hält deshalb
// vor dem Zebra (Stoßstange 0,6 m davor).

export const CAR_LEN = 4.2;
export const CAR_W = 1.8;
export const ACC = 3.0;
export const DEC = 6.5;
export const GAP = 2.4; // Wunschabstand zum Vordermann (m)
export const HORN_COOL = 7; // s zwischen zwei Hupsignalen eines Autos
export const HORN_AFTER = 1.0; // s Blockade, bevor gehupt wird
export const NUDGE_AFTER = 3.8; // s Blockade durch den Spieler, bevor das Auto vorsichtig anrollt
const UPSTREAM_WINDOW = 6; // Zebra gilt als „vor der Haltelinie“, wenn sie höchstens so weit davor beginnt

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function laneSign(lane) { return (lane.dir.x || lane.dir.z) > 0 ? 1 : -1; }
export function laneAxis(lane) { return lane.dir.x ? 'x' : 'z'; }

/** Weltposition des Auto-Mittelpunkts bei Fahrkoordinate p. */
export function posOf(lane, p) { return laneAxis(lane) === 'x' ? { x: p, z: lane.z } : { x: lane.x, z: p }; }

/** Fahrkoordinate (x oder z) eines Weltpunkts. */
export function alongOf(lane, x, z) { return laneAxis(lane) === 'x' ? x : z; }
export function lateralOf(lane, x, z) { return laneAxis(lane) === 'x' ? z - lane.z : x - lane.x; }

/** Haltekoordinate für die Stoßstange bei Rot: vor dem ersten Zebra, das kurz vor der Haltelinie beginnt. */
export function effectiveStop(lane, zebras) {
  if (!lane.stop) return null;
  const s = laneSign(lane);
  const ax = laneAxis(lane);
  let eff = lane.stop.at;
  for (const id of lane.yields || []) {
    const z = (zebras || []).find((q) => q.id === id);
    if (!z) continue;
    const entry = s > 0 ? (ax === 'x' ? z.x0 : z.z0) : (ax === 'x' ? z.x1 : z.z1);
    const back = (lane.stop.at - entry) * s; // >0: Zebra beginnt vor der Linie
    if (back <= 0 || back > UPSTREAM_WINDOW) continue;
    const cand = entry - s * 0.6;
    if ((cand - eff) * s < 0) eff = cand;
  }
  return eff;
}

/** Fußgänger-/Spieler-Punkt im Rechteck eines Zebras (leicht erweitert)? */
export function inZebra(z, x, zz, pad = 0.4) { return x > z.x0 - pad && x < z.x1 + pad && zz > z.z0 - pad && zz < z.z1 + pad; }

export function createCar(lane, o = {}) {
  const s = laneSign(lane);
  return {
    id: o.id || 0, lane: lane.id, p: o.p !== undefined ? o.p : lane.from, v: o.v !== undefined ? o.v : 0, state: 'drive', timer: 0,
    hornCool: 0, blockedT: 0, nudgeCool: 0, speedMul: o.speedMul || 1, style: o.style || 0, away: false, sign: s,
    stopped: false, blockKind: null,
  };
}

/**
 * Ein Schritt. env = { lane, zebras, signal: { main, side }, cars: [Car] (alle), obstacles: [{ x, z, kind: 'player'|'ped' }],
 *   zebraOccupied(id) → bool, rand }
 * Rückgabe: Ereignisse [{ type: 'honk', toPlayer } | { type: 'nudge', dir: {x,z} }]. Verändert car.
 */
export function stepCar(car, dt, env) {
  const ev = [];
  const lane = env.lane;
  const s = laneSign(lane);
  const ax = laneAxis(lane);
  car.hornCool = Math.max(0, car.hornCool - dt);
  car.nudgeCool = Math.max(0, car.nudgeCool - dt);
  if (car.state === 'away') {
    car.timer -= dt;
    if (car.timer <= 0) {
      const startProg = lane.from * s;
      const clear = !(env.cars || []).some((c) => c !== car && c.lane === car.lane && c.state === 'drive' && Math.abs(c.p * s - startProg) < 12);
      if (clear) { car.state = 'drive'; car.p = lane.from; car.v = lane.speed * 0.6 * car.speedMul; car.blockedT = 0; }
      else car.timer = 0.6;
    }
    return ev;
  }
  const front = car.p + s * (CAR_LEN / 2);
  const toFront = (c) => (c - front) * s; // Abstand der Stoßstange zur Koordinate c in Fahrtrichtung
  let stopDist = Infinity;
  let reason = null;
  const consider = (d, why) => { if (d < stopDist) { stopDist = d; reason = why; } };

  // 1) Ampel
  if (lane.stop) {
    const col = env.signal ? env.signal[lane.stop.signal] : 'green';
    if (col !== 'green') {
      const eff = effectiveStop(lane, env.zebras);
      const d = toFront(eff);
      const canStop = d >= -0.2 && !(col === 'yellow' && d < (car.v * car.v) / (2 * 5.5));
      if (canStop) consider(Math.max(0, d), 'signal');
    }
  }
  // 2) Zebra mit Fußgänger/Spieler
  for (const id of lane.yields || []) {
    if (!env.zebraOccupied || !env.zebraOccupied(id)) continue;
    const z = (env.zebras || []).find((q) => q.id === id);
    if (!z) continue;
    const entry = s > 0 ? (ax === 'x' ? z.x0 : z.z0) : (ax === 'x' ? z.x1 : z.z1);
    const d = toFront(entry - s * 0.6);
    if (d >= -0.1) consider(Math.max(0, d), 'zebra');
  }
  // 3) Vordermann
  for (const c of env.cars || []) {
    if (c === car || c.lane !== car.lane || c.state !== 'drive') continue;
    const rear = c.p - s * (CAR_LEN / 2);
    const d = (rear - front) * s - GAP;
    if ((c.p - car.p) * s > 0) consider(Math.max(0, d), 'car');
  }
  // 4) Spieler/Passanten auf der Fahrbahn im Fahrstreifen
  let blocker = null;
  for (const o of env.obstacles || []) {
    const lat = lateralOf(lane, o.x, o.z);
    if (Math.abs(lat) > 1.45) continue;
    const d = toFront(alongOf(lane, o.x, o.z)) - 1.3;
    if (d < -1.3 || d > 40) continue;
    if (d < stopDist) { blocker = o; }
    consider(Math.max(0, d), 'obstacle');
  }
  if (reason !== 'obstacle') blocker = null;

  // Tempo
  let vMax = lane.speed * car.speedMul;
  if (stopDist < Infinity) vMax = Math.min(vMax, Math.sqrt(2 * DEC * Math.max(0, stopDist - 0.25)));
  car.blockKind = null;
  car.stopped = car.v < 0.25 && stopDist < 1.2;
  if (reason === 'obstacle' && car.stopped && blocker) {
    car.blockedT += dt;
    car.blockKind = blocker.kind;
    if (car.blockedT > HORN_AFTER && car.hornCool <= 0) { car.hornCool = HORN_COOL; ev.push({ type: 'honk', toPlayer: blocker.kind === 'player' }); }
    if (blocker.kind === 'player' && car.blockedT > NUDGE_AFTER) {
      // vorsichtig anrollen: noch 0,35 m Abstand lassen, dann sanft schieben
      vMax = Math.min(lane.speed, 1.0);
      if (stopDist < 0.4 && car.nudgeCool <= 0) { car.nudgeCool = 1.2; ev.push({ type: 'nudge', dir: { x: ax === 'x' ? s : 0, z: ax === 'z' ? s : 0 } }); }
      if (stopDist < 0.1) vMax = 0;
    }
  } else if (reason !== 'obstacle') {
    car.blockedT = Math.max(0, car.blockedT - dt * 2);
  }
  if (car.blockedT > NUDGE_AFTER && car.blockKind === 'player' && stopDist >= 0.1) {
    // Anrollen ignoriert den 1,3-m-Puffer des Hindernisses
    vMax = Math.min(lane.speed, 1.0);
  }
  const dv = vMax - car.v;
  car.v = clamp(car.v + clamp(dv, -DEC * dt * 1.4, ACC * dt), 0, lane.speed * 1.2);
  car.p += s * car.v * dt;
  if ((car.p - lane.to) * s >= 0) { car.state = 'away'; car.timer = 3 + (env.rand ? env.rand() : 0.5) * 8; car.v = 0; }
  return ev;
}

/** Sollanzahl fahrender Autos nach Qualität/Tageszeit. */
export function carCount(carsMax, tod) {
  if (carsMax <= 0) return 0;
  return tod === 'night' && carsMax > 2 ? carsMax - 1 : carsMax;
}

/** Kurvenfreie Verteilung: Autos reihum auf die Spuren (Hauptstraße zuerst), mit Startversatz entlang der Spur. */
export function assignCars(lanes, n, rand) {
  const out = [];
  const order = [...lanes].sort((a, b) => (a.id.startsWith('main') ? 0 : 1) - (b.id.startsWith('main') ? 0 : 1));
  const used = new Map();
  for (let i = 0; i < n; i++) {
    const lane = order[i % order.length];
    const k = used.get(lane.id) || 0;
    used.set(lane.id, k + 1);
    const s = laneSign(lane);
    const span = Math.abs(lane.to - lane.from);
    const p = lane.from + s * (span * (0.12 + 0.26 * rand()) + k * 22);
    out.push({ lane: lane.id, p: Math.abs(p - lane.from) > span ? lane.from : p, style: i % 4, speedMul: 0.85 + rand() * 0.3 });
  }
  return out;
}

/** Plätze für parkende Autos in den Seitenstraßen (Rechtecke, Längsachse z). Rein; gegen Spuren/Zebras/Kollider prüfbar. */
export function parkingSpots(city) {
  const f = city.frame;
  const { xc0, xc1 } = f;
  const D = f.D;
  const L = CAR_LEN;
  const mk = (id, cx, z0) => ({ id, x0: cx - CAR_W / 2, x1: cx + CAR_W / 2, z0, z1: z0 + L, cx, cz: z0 + L / 2 });
  return [
    mk('parkNW', xc0 - 1.4, D - 10.5),
    mk('parkNE', xc1 + 1.4, D - 7.0),
    mk('parkSW', xc0 - 1.4, f.roadZ1 + 6.0),
  ];
}
