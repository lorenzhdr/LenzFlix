// VIDEOTHEK LENZ · Stadt (rein, ohne three und DOM, deterministisch, JSON-sicher): Block mit Kreuzung, Palast-Hülle, Hof, Gasse,
// Feuertreppe, Dach, Kollider, Zonen, Spawns, Fußwege, Fahrspuren, Ampel, Laternen, Entdeckungs- und Requisiten-Plätze.
// Koordinaten wie world/layout.js: x Osten, z Süden, y oben, Yaw: Vorwärts (-sin, -cos), Flächennormale (sin yaw, cos yaw).
// Physik-Konstanten kommen aus nav/collide.js (STEP_H, BODY_H, MANTLE_H, JUMP_V, GRAV); hier gibt es keine eigenen.
// Kollider-Format: { id?, x0, z0, x1, z1, kind, y0 = 0, y1 = Infinity (fehlt), top? } (siehe nav/collide.js).
import { seeded } from '../modules/m4-util.js';
import { STEP_H, BODY_H, MANTLE_H, JUMP_V, GRAV, groundHeight, resolveCircle3, RADIUS } from '../nav/collide.js';
import { isFree, nearestFree } from '../nav/path.js';

export const T = 0.12; // Wandstärke des Ladens (= layout WALL_T)
export const ROOF_Y = 3.3; // Oberkante der Dachfläche
const CEIL_Y = 3.0; // Oberkante der Ladenwände
/** Sprunghöhe aus den Konstanten von nav/collide.js (für Erreichbarkeitstests). */
export const JUMP_H = (JUMP_V * JUMP_V) / (2 * GRAV);
/** Maximale Höhe, die aus dem Stand per Sprung + Hochziehen erreichbar ist. */
export const REACH_H = JUMP_H + MANTLE_H;
export const SIGNAL_CYCLE = 24;
export const AREAS = ['roof', 'escape', 'palastHall', 'palastFoyer', 'shop', 'doorway', 'yard', 'alley', 'kiosk', 'palastEntrance', 'crossing', 'sideN', 'sideS', 'street', 'outside'];
/** Bereiche, in denen es regnen darf (nicht Laden, nicht Palast innen). */
export const OUTDOOR_AREAS = ['street', 'crossing', 'sideN', 'sideS', 'yard', 'alley', 'roof', 'escape', 'kiosk', 'palastEntrance', 'outside', 'doorway'];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const PI = Math.PI;

/** Rahmenmaße der Welt (rein). Alle Werte in Metern. */
export function cityFrame(W, D) {
  const fz = D + 0.21;
  const roadZ0 = D + 2.75;
  const roadZ1 = D + 8.5;
  const PW = clamp(Math.round((W + 4) * 2) / 2, 20, 28);
  return {
    W, D, fz, curbZ: D + 2.6, roadZ0, roadZ1, roadMid: D + 5.625, laneWz: D + 4.325, laneEz: D + 6.925, sz: D + 10.7,
    xc0: W + 14, xc1: W + 19,
    XW0: -26, XW1: W + 33.4, ZW0: -12.5, ZW1: D + 32,
    zSN: roadZ0 - 24, zSS: roadZ1 + 21,
    PW, px0: W / 2 - PW / 2, px1: W / 2 + PW / 2,
    fx: Math.round(W * 0.6 * 2) / 2,
    bounds: { x0: -27, z0: -13.5, x1: W + 34.4, z1: D + 33 },
  };
}

/** Zellgröße des Welt-Navigationsrasters: 0,25 m, bei mehr als 160 000 Zellen 0,5 m. */
export function navCellFor(bounds) {
  const c = (Math.ceil((bounds.x1 - bounds.x0) / 0.25)) * (Math.ceil((bounds.z1 - bounds.z0) / 0.25));
  return c <= 160000 ? 0.25 : 0.5;
}

/** Ampelzustand zur Zeit t (Sekunden, beliebiger Ursprung), Zyklus 24 s. */
export function signalAt(t) {
  const c = ((((Number(t) || 0) % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE);
  const main = c < 10 ? 'green' : c < 11.5 ? 'yellow' : 'red';
  const side = c < 12 ? 'red' : c < 18.5 ? 'green' : c < 20 ? 'yellow' : 'red';
  return { main, side, walkMain: main === 'red', walkSide: side === 'red' };
}

const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/**
 * Bereichsname für eine Position (rein). Priorität: roof, escape, palastHall, palastFoyer, shop, doorway, yard, alley, kiosk,
 * palastEntrance, crossing, sideN, sideS, street, outside. Ohne `layout.city` nur 'shop' oder 'outside'.
 */
export function areaAt(layout, x, z, y = 0) {
  const c = layout && layout.city;
  const zn = c && c.zones;
  if (!zn) return layout && x >= 0 && x <= layout.w && z >= 0 && z <= layout.d ? 'shop' : 'outside';
  if (y >= 2.9 && inRect(zn.roof.rect, x, z)) return 'roof';
  if (inRect(zn.escape.rect, x, z)) return 'escape';
  if (inRect(zn.palastHall.rect, x, z)) return 'palastHall';
  if (inRect(zn.palastFoyer.rect, x, z)) return 'palastFoyer';
  if (x >= 0 && x <= layout.w && z >= 0 && z <= layout.d && y < 2.9) return 'shop';
  for (const id of ['doorway', 'yard', 'alley', 'kiosk', 'palastEntrance', 'crossing', 'sideN', 'sideS', 'street']) if (inRect(zn[id].rect, x, z)) return id;
  return 'outside';
}

/**
 * Sichtbarkeit der Szenengruppen (rein). Rückgabe { shopShell, shelves, street, yard, palastInterior, palastExterior }.
 * Außen sieht man den Laden nur im Fenster-Sichtfeld vor der Front; Hof und Gasse nur in ihrer Nähe.
 */
export function visibleGroups(layout, area, x, z) {
  const W = layout.w;
  const D = layout.d;
  const c = layout.city;
  const out = { shopShell: false, shelves: false, street: area !== 'palastHall', yard: false, palastInterior: false, palastExterior: true };
  const inFront = z > D - 0.01 && z - D < 14 && Math.abs(x - W / 2) < W / 2 + 8 && area !== 'palastHall' && area !== 'palastFoyer' && area !== 'roof' && area !== 'escape' && area !== 'yard';
  out.shopShell = area === 'shop' || area === 'doorway' || inFront;
  out.shelves = area === 'shop' || (inFront && z - D < 5);
  if (c) {
    const m = c.spawns.alley;
    const inside = area === 'shop' || area === 'palastHall' || area === 'palastFoyer'; // drinnen sieht man den Hof nicht
    out.yard = area === 'yard' || area === 'alley' || area === 'escape' || area === 'roof' || (!inside && Math.hypot(x - m.x, z - (c.frame.fz + 1.2)) < 16);
    const dx = x - W / 2;
    out.palastInterior = area === 'palastHall' || area === 'palastFoyer' || (z < c.frame.sz && Math.hypot(dx, z - c.frame.sz) < 12 && area !== 'shop');
  }
  return out;
}

/**
 * Begehbare Standflächen: Oberseiten aller Kollider mit endlichem y1 <= 3.5 und top !== false (für Tests und Spawn-Prüfung).
 */
export function standSurfaces(layout) {
  const out = [];
  for (const q of layout.colliders) {
    if (!Number.isFinite(q.y1) || q.top === false || q.y1 > 3.5 || q.y1 < 0.01) continue;
    out.push({ id: q.id || q.kind, x0: q.x0, z0: q.z0, x1: q.x1, z1: q.z1, y: q.y1, y0: q.y0 || 0, kind: q.kind });
  }
  return out;
}

/**
 * Wiederherstellung einer gespeicherten Pose (rein). `r` = {x,z,yaw,pitch,y?}. Rückgabe {x,z,y,yaw,pitch}:
 * x/z ungültig → Laden-Spawn (yaw/pitch fehlend → 0); Position auf die Weltgrenzen geklemmt; y > 0,25 nur, wenn dort eine Standfläche liegt (sonst 0);
 * am Boden ein freier Rasterpunkt (nächster freier im Umkreis 4 m, sonst Laden-Spawn).
 */
export function resolveRestore(layout, r) {
  const sp = (layout.city && layout.city.spawns && layout.city.spawns.shop) || layout.spawn || { x: layout.w / 2, z: layout.d - 1.4, yaw: 0 };
  const base = { x: sp.x, z: sp.z, y: 0, yaw: Number.isFinite(sp.yaw) ? sp.yaw : 0, pitch: 0 };
  if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.z)) return base;
  const yaw = Number.isFinite(r.yaw) ? r.yaw : 0; // fehlende Blickrichtung: Norden (wie vor 1.15.0)
  const pitch = Number.isFinite(r.pitch) ? r.pitch : 0;
  const b = layout.bounds || { x0: 0, z0: 0, x1: layout.w, z1: layout.d };
  let x = clamp(r.x, b.x0, b.x1);
  let z = clamp(r.z, b.z0, b.z1);
  let y = Number.isFinite(r.y) && r.y > 0.25 ? r.y : 0;
  const src = layout.cidx ? { index: layout.cidx, dyn: layout.dyn } : layout.colliders;
  if (y > 0) {
    const g = groundHeight(x, z, RADIUS, y, src);
    if (g.rect && g.y > 0.25) {
      y = g.y;
      const c = resolveCircle3(x, z, RADIUS, src, y);
      x = c.x;
      z = c.z;
    } else y = 0;
  }
  if (y === 0) {
    if (!isFree(layout.nav, x, z)) {
      const n = nearestFree(layout.nav, x, z, Math.ceil(4 / layout.nav.cell));
      if (!n) return { ...base, yaw, pitch };
      x = n.x;
      z = n.z;
    }
  }
  return { x, z, y, yaw, pitch };
}

const zoneOf = (id, label, rect, extra = {}) => ({
  id, label, x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2, yaw: 0, rect, ...extra,
});

/**
 * Baut die Stadt. `store` = { w, d, door: {x0, x1}, windows? }. Rückgabe (JSON-sicher):
 * { frame, bounds, buildings, palast, colliders, zones, spawns, sidewalkPaths, lanes, zebras, signals, lights, signs, fixtures,
 *   yard, escape, roof, kiosk, doorPosts, doorBlock, discoverSlots, propSlots }
 */
export function buildCity(store) {
  const W = store.w;
  const D = store.d;
  const door = store.door || { x0: W / 2 - 1.1, x1: W / 2 + 1.1 };
  const f = cityFrame(W, D);
  const { fz, curbZ, roadZ0, roadZ1, sz, xc0, xc1, XW0, XW1, ZW0, ZW1, zSN, zSS, px0, px1, PW, fx } = f;
  const rand = seeded(Math.round(W * 100 + D * 10) + 5);
  const PALETTE = [[0.55, 0.28, 0.24], [0.62, 0.5, 0.36], [0.38, 0.42, 0.52], [0.5, 0.36, 0.4], [0.42, 0.5, 0.42], [0.6, 0.55, 0.5]];
  const colorOf = () => PALETTE[Math.floor(rand() * PALETTE.length)].map((v) => Math.round(v * 1000) / 1000);

  const colliders = [];
  const col = (id, kind, x0, z0, x1, z1, o = {}) => { const q = { id, kind, x0, z0, x1, z1, ...o }; colliders.push(q); return q; };

  // --- Gebäude (Quader, Vollkörper) ---
  const bl = [
    ['NW2', XW0, ZW0, -14, fz, 7.4, 'W'], ['NW1', -14, ZW0, -3.4, fz, 6.4, 'W'],
    ['NE1', W + T, -T, W + 8.4, fz, 7.0, 'N'], ['NE1b', W + 8.4, ZW0, W + 11.6, D - 2.0, 7.6, 'E'], ['NE2', W + 21.4, ZW0, XW1, fz, 8.0, 'E'],
    ['YB', -3.4, ZW0, W + 8.4, -11.0, 6.0, 'Y'],
    ['SW', XW0, sz, px0, ZW1, 7.0, 'S'], ['SE1', px1, sz, W + 11.6, ZW1, 6.6, 'S'], ['SE2', W + 21.4, sz, XW1, ZW1, 7.8, 'S'],
    ['QN', W + 11.6, ZW0, W + 21.4, zSN, 6.5, 'E'], ['QS', W + 11.6, zSS, W + 21.4, ZW1, 6.5, 'E'],
  ];
  const buildings = bl.map(([id, x0, z0, x1, z1, h, region]) => ({ id, x0, z0, x1, z1, h, region, color: colorOf(), front: z1 === fz ? 'S' : z0 === sz ? 'N' : null }));
  for (const b of buildings) col(b.id, 'building', b.x0, b.z0, b.x1, b.z1);
  // Nordzeile: Fassadenfront (gegenüber der Straße) bei z=fz, Südzeile bei z=sz
  for (const b of buildings) if (b.id === 'NE1' || b.id === 'NW1' || b.id === 'NW2' || b.id === 'NE2') b.front = 'S';
  for (const b of buildings) if (b.id === 'SW' || b.id === 'SE1' || b.id === 'SE2') b.front = 'N';
  for (const b of buildings) if (b.id === 'NE1b') b.front = null;

  // --- Palast (Hülle; Innenausbau Welle 2) ---
  const wt = 0.25;
  const pz1 = sz + 19.75;
  const palast = {
    rect: { x0: px0, z0: sz, x1: px1, z1: pz1 }, wall: wt, h: 8.5, doorX0: W / 2 - 1.5, doorX1: W / 2 + 1.5,
    foyer: { x0: px0 + wt, z0: sz + wt, x1: px1 - wt, z1: sz + 5.75, ceil: 4.0 },
    hall: { x0: px0 + wt, z0: sz + 6.0, x1: px1 - wt, z1: sz + 19.5, ceil: 7.5 },
    hallDoors: [{ x0: W / 2 - 4.5 - 0.8, x1: W / 2 - 4.5 + 0.8 }, { x0: W / 2 + 4.5 - 0.8, x1: W / 2 + 4.5 + 0.8 }],
    screen: { cx: W / 2, z: sz + 19.15, y0: 1.5, w: 11.0, h: 6.2, yaw: PI },
    seatBlock: { x0: px0 + 2, x1: px1 - 2, z0: sz + 7.0, z1: sz + 13.6, rows: 6, pitch: 1.1, rise: 0.2 },
    canopy: { x0: W / 2 - 4.5, x1: W / 2 + 4.5, z0: sz - 1.7, z1: sz, y: 3.0 },
  };
  // Schaukasten-Anker an der Außenwand (Mitte x,y,z; w,h; yaw PI = zur Straße), Plakate hängt das Paket Palast ein
  palast.posterSlots = [-6.4, -3.6, 3.6, 6.4].map((o, i) => ({ id: `poster${i}`, x: Math.round((W / 2 + o) * 100) / 100, y: 1.9, z: sz - 0.05, w: 1.6, h: 2.2, yaw: PI }));
  palast.sign = { x: W / 2, y: 5.6, w: Math.min(PW - 2, 9) }; // Neonschild (gleiche Werte wie signs.palast)
  col('palastFrontL', 'wall', px0, sz, palast.doorX0, sz + wt);
  col('palastFrontR', 'wall', palast.doorX1, sz, px1, sz + wt);
  col('palastSideW', 'wall', px0, sz, px0 + wt, pz1);
  col('palastSideE', 'wall', px1 - wt, sz, px1, pz1);
  col('palastBack', 'wall', px0, pz1 - wt, px1, pz1);
  const d0 = palast.hallDoors[0];
  const d1 = palast.hallDoors[1];
  col('palastPartA', 'wall', px0 + wt, sz + 5.75, d0.x0, sz + 6.0);
  col('palastPartB', 'wall', d0.x1, sz + 5.75, d1.x0, sz + 6.0);
  col('palastPartC', 'wall', d1.x1, sz + 5.75, px1 - wt, sz + 6.0);

  // --- Weltgrenzen: Ring um bounds, Absperrungen an den Straßenenden ---
  const b = f.bounds;
  col('boundW', 'bounds', b.x0 - 2, b.z0 - 2, b.x0, b.z1 + 2);
  col('boundE', 'bounds', b.x1, b.z0 - 2, b.x1 + 2, b.z1 + 2);
  col('boundN', 'bounds', b.x0 - 2, b.z0 - 2, b.x1 + 2, b.z0);
  col('boundS', 'bounds', b.x0 - 2, b.z1, b.x1 + 2, b.z1 + 2);
  col('gateW', 'bounds', XW0 - 1, fz, XW0 + 0.6, sz);
  col('gateE', 'bounds', XW1 - 0.6, fz, XW1 + 1, sz);
  col('gateN', 'bounds', xc0 - 2.4, zSN, xc1 + 2.4, zSN + 0.6);
  col('gateS', 'bounds', xc0 - 2.4, zSS - 0.6, xc1 + 2.4, zSS);

  // --- Kiosk (Ecke Ost) ---
  const kiosk = { hut: { x0: W + 8.8, z0: D - 1.9, x1: W + 11.2, z1: D - 0.1, h: 2.6 }, counter: { x0: W + 9.0, z0: D - 0.1, x1: W + 11.0, z1: D + 0.2, h: 1.05 } };
  kiosk.vendor = { x: W + 10, z: D - 0.95, yaw: PI }; // Anker für die Verkäuferin (steht im Häuschen, blickt zur Straße)
  kiosk.awning = { x0: W + 8.7, x1: W + 11.3, z0: D - 0.1, z1: D + 1.5, y0: 2.45, y1: 2.75 };
  kiosk.table = { x0: W + 8.9, z0: D + 1.8, x1: W + 9.4, z1: D + 2.3, h: 1.1 };
  col('kioskHut', 'hut', kiosk.hut.x0, kiosk.hut.z0, kiosk.hut.x1, kiosk.hut.z1, { y1: kiosk.hut.h, top: false });
  col('kioskCounter', 'kioskcounter', kiosk.counter.x0, kiosk.counter.z0, kiosk.counter.x1, kiosk.counter.z1, { y1: kiosk.counter.h });
  col('kioskTable', 'stehtisch', kiosk.table.x0, kiosk.table.z0, kiosk.table.x1, kiosk.table.z1, { y1: kiosk.table.h, top: false });

  // --- Feuertreppe (alle Maße relativ zu fx), Dach ---
  const L1 = col('escapeL1', 'escape', fx - 1.1, -1.62, fx + 1.1, -T, { y1: 1.65 });
  const escape = { fx, parts: [L1.id] };
  for (let k = 1; k <= 4; k++) { const q = col(`escapeA${k}`, 'escape', fx + 1.1 + (k - 1) * 0.36, -1.62, fx + 1.1 + k * 0.36, -T, { y1: Math.round((1.65 - 0.33 * k) * 100) / 100 }); escape.parts.push(q.id); }
  for (let j = 1; j <= 4; j++) { const q = col(`escapeB${j}`, 'escape', fx - 1.1 - j * 0.36, -1.62, fx - 1.1 - (j - 1) * 0.36, -T, { y1: Math.round((1.65 + 0.33 * j) * 100) / 100 }); escape.parts.push(q.id); }
  const L2 = col('escapeL2', 'escape', fx - 3.64, -1.62, fx - 2.54, -T, { y1: ROOF_Y });
  escape.parts.push(L2.id);
  const roof = { x0: -T, z0: -T, x1: W + T, z1: D + T, y: ROOF_Y, gate: { x0: fx - 3.84, x1: fx - 2.34 } };
  col('roof', 'roof', roof.x0, roof.z0, roof.x1, roof.z1, { y0: CEIL_Y, y1: ROOF_Y });
  const par = 0.15;
  // Brüstung (1 m, nicht besteigbar): Nord mit Lücke (Tor), West, Ost; Süd = Fassadenwand 2 m
  col('parapetN1', 'parapet', roof.x0, roof.z0, roof.gate.x0, roof.z0 + par, { y0: ROOF_Y, y1: ROOF_Y + 1.0, top: false });
  col('parapetN2', 'parapet', roof.gate.x1, roof.z0, roof.x1, roof.z0 + par, { y0: ROOF_Y, y1: ROOF_Y + 1.0, top: false });
  col('parapetW', 'parapet', roof.x0, roof.z0, roof.x0 + par, roof.z1, { y0: ROOF_Y, y1: ROOF_Y + 1.0, top: false });
  col('parapetE', 'parapet', roof.x1 - par, roof.z0, roof.x1, roof.z1, { y0: ROOF_Y, y1: ROOF_Y + 1.0, top: false });
  col('parapetS', 'parapet', roof.x0, D + 0.17, roof.x1, D + 0.25, { y0: ROOF_Y, y1: ROOF_Y + 2.0, top: false });

  // --- Hof ---
  col('crateA', 'crate', 0.6, -6.0, 1.6, -5.0, { y1: 0.55 });
  col('crateB', 'crate', 1.6, -6.0, 2.6, -5.0, { y1: 1.1 });
  col('crateC', 'crate', 2.6, -6.0, 3.6, -5.0, { y1: 1.65 });
  col('container', 'container', 3.6, -10.6, 6.0, -4.6, { y1: 2.6 });
  const cx0 = Math.round(W * 0.55 * 100) / 100;
  col('carHood', 'car', cx0, -9.6, cx0 + 1.8, -8.4, { y1: 0.95 });
  col('carCabin', 'car', cx0, -8.4, cx0 + 1.8, -6.2, { y1: 1.42 });
  col('carTrunk', 'car', cx0, -6.2, cx0 + 1.8, -5.4, { y1: 0.95 });
  const bx0 = Math.round(W * 0.9 * 100) / 100;
  col('yardBin1', 'bin', bx0, -3.3, bx0 + 0.7, -2.6, { y1: 1.0 });
  col('yardBin2', 'bin', bx0, -2.1, bx0 + 0.7, -1.4, { y1: 1.0 });
  // Basketballkorb (Mast + Brett + Ring statisch von hier, Treffer-Logik Paket physics), Paletten, Wäscheleine, Graffiti-Wand
  const hx = Math.round((W + 7.7) * 100) / 100;
  const hoop = { x: Math.round((W + 6.45) * 100) / 100, y: 3.05, z: -5.0, yaw: -PI / 2, mast: { x: hx, z: -5.0 }, board: { x: Math.round((W + 6.95) * 100) / 100, y: 3.35, w: 1.8, h: 1.05 }, ringR: 0.23 };
  col('hoopMast', 'hoopmast', hx - 0.1, -5.1, hx + 0.1, -4.9, { y1: 3.9, top: false });
  col('hoopBoard', 'hoopmast', hoop.board.x - 0.03, -5.0 - hoop.board.w / 2, hoop.board.x + 0.03, -5.0 + hoop.board.w / 2, { y0: hoop.board.y - hoop.board.h / 2, y1: hoop.board.y + hoop.board.h / 2, top: false }); // Brett: Bälle prallen ab, Spieler läuft darunter durch
  col('palletA', 'pallet', -3.0, -7.6, -1.8, -6.5, { y1: 0.28 });
  col('palletB', 'pallet', -3.0, -6.4, -1.8, -5.3, { y1: 0.28 });
  const laundry = { x0: Math.round(W * 35) / 100, x1: Math.round(W * 78) / 100, z: -3.9, y: 2.25 };
  col('laundryPostA', 'laundrypost', laundry.x0 - 0.05, laundry.z - 0.05, laundry.x0 + 0.05, laundry.z + 0.05, { y1: 2.4, top: false });
  col('laundryPostB', 'laundrypost', laundry.x1 - 0.05, laundry.z - 0.05, laundry.x1 + 0.05, laundry.z + 0.05, { y1: 2.4, top: false });
  const graffiti = { id: 'graffiti', x: 0.8, y: 1.6, z: -11.0, w: 3.0, h: 2.2, yaw: 0 }; // leere Wandfläche für das Paket discover
  // Dach: Lüftungskästen, Antenne (Hindernisse, nicht besteigbar)
  const roofProps = [
    { id: 'vent1', kind: 'vent', x: Math.round(W * 75) / 100, z: Math.round(D * 55) / 100, w: 0.9, d: 0.7, h: 0.8 },
    { id: 'vent2', kind: 'vent', x: Math.round(W * 62) / 100, z: Math.round(D * 82) / 100, w: 0.7, d: 0.7, h: 0.6 },
    { id: 'mast', kind: 'mast', x: Math.round(W * 20) / 100, z: Math.round(D * 75) / 100, w: 0.16, d: 0.16, h: 2.6 },
  ];
  for (const r of roofProps) col(`roof_${r.id}`, 'roofprop', r.x - r.w / 2, r.z - r.d / 2, r.x + r.w / 2, r.z + r.d / 2, { y0: ROOF_Y, y1: ROOF_Y + r.h, top: false });
  // Gasse
  col('barrel1', 'barrel', -3.3, D - 7.4, -2.6, D - 6.7, { y1: 1.05 });
  col('barrel2', 'barrel', -3.3, D - 5.9, -2.6, D - 5.2, { y1: 1.05 });

  // --- Straßenmöbel ---
  const fixtures = [];
  const fix = (id, kind, x0, z0, x1, z1, o = {}) => { fixtures.push(col(id, kind, x0, z0, x1, z1, o)); };
  const bn = W / 2 + 5.2;
  fix('benchN', 'bench', bn - 0.8, D + 0.3, bn + 0.8, D + 0.7, { y1: 0.48 });
  fix('benchS', 'bench', W / 2 - 7.8, D + 10.0, W / 2 - 6.2, D + 10.45, { y1: 0.48 });
  fix('phone', 'phone', W + 6.1, D + 1.7, W + 7.0, D + 2.4, { y1: 2.3, top: false });
  const bsx = px0 - 5;
  fix('busstop', 'busstop', bsx - 1.5, D + 9.95, bsx + 1.5, D + 10.65, { y1: 2.4, top: false });
  fix('mailbox', 'mailbox', W + 4.0, D + 2.0, W + 4.4, D + 2.4, { y1: 1.2, top: false });
  fix('hydrant', 'hydrant', W / 2 - 9.0, D + 2.2, W / 2 - 8.75, D + 2.45, { y1: 0.8, top: false });
  fix('binN', 'bin', W / 2 - 4.0, D + 0.3, W / 2 - 3.6, D + 0.7, { y1: 0.95 });
  fix('binS', 'bin', px1 + 3.0, D + 9.9, px1 + 3.4, D + 10.3, { y1: 0.95 });
  const lfx = Math.round((px1 + 5.5) * 100) / 100;
  const litfass = { x: lfx, z: D + 10.3, r: 0.35, h: 2.7, slot: { x: lfx, y: 1.5, z: D + 10.3, r: 0.37, h: 1.6 } }; // Plakatfläche als Anker (Mantel um die Säule)
  fix('litfass', 'litfass', lfx - 0.35, litfass.z - 0.35, lfx + 0.35, litfass.z + 0.35, { y1: litfass.h, top: false });
  const bikeX = Math.round((W / 2 - 12) * 100) / 100;
  fix('bikerack', 'bikerack', bikeX - 0.8, D + 0.3, bikeX + 0.8, D + 0.7, { y1: 1.5, top: false });
  [-3.4, -2.2, 2.2, 3.4].forEach((o, i) => { const x = W / 2 + o; fix(`bollard${i}`, 'bollard', x - 0.1, D + 2.35, x + 0.1, D + 2.55, { y1: 0.9, top: false }); });

  // --- Laternen, Ampelmasten ---
  const lights = [];
  const lampRow = (rowZ, armDz, from, id) => {
    for (let x = from; x < XW1 - 6; x += 9) {
      if (x < XW0 + 6) continue;
      if (x > xc0 - 3.5 && x < xc1 + 3.5) continue;
      if (id === 'S' && x > W / 2 - 5.5 && x < W / 2 + 5.5) continue;
      if ([W / 2, xc0 - 3.3, xc1 + 3.3, -1.8, W + 10].some((px) => Math.abs(x - px) < 1.5)) continue; // nicht auf Fußwege-Querungen
      lights.push({ id: `lamp${id}${lights.length}`, x: Math.round(x * 100) / 100, z: rowZ, armDz, h: 4.2 });
    }
  };
  lampRow(D + 2.45, -0.62, XW0 + 6 + 1, 'N');
  lampRow(D + 8.75, 0.62, XW0 + 6 + 5.5, 'S');
  for (const l of lights) col(l.id, 'pole', l.x - 0.1, l.z - 0.1, l.x + 0.1, l.z + 0.1, { y1: l.h, top: false });
  const signals = [
    { id: 'mainE', lane: 'mainE', signal: 'main', x: xc0 - 1.6, z: roadZ1 + 1.6 },
    { id: 'mainW', lane: 'mainW', signal: 'main', x: xc1 + 1.6, z: roadZ0 - 0.2 },
    { id: 'sideS', lane: 'sideS', signal: 'side', x: xc0 - 0.2, z: roadZ0 - 0.5 },
    { id: 'sideN', lane: 'sideN', signal: 'side', x: xc1 + 0.2, z: roadZ1 + 1.6 },
  ];
  for (const s of signals) col(`sig_${s.id}`, 'pole', s.x - 0.1, s.z - 0.1, s.x + 0.1, s.z + 0.1, { y1: 3.2, top: false });

  // --- Diebstahlsicherung an der Tür (Pfosten innen, Zone) ---
  const doorPosts = [
    col('postL', 'post', door.x0 + 0.05, D - 0.8, door.x0 + 0.17, D - 0.6, { y1: 1.3, top: false }),
    col('postR', 'post', door.x1 - 0.17, D - 0.8, door.x1 - 0.05, D - 0.6, { y1: 1.3, top: false }),
  ];
  const doorBlock = { id: 'door', kind: 'door', x0: door.x0, z0: D - 0.05, x1: door.x1, z1: D + T + 0.1, y1: CEIL_Y, top: false };

  // --- Zonen ---
  const zones = {};
  const Z = (id, label, rect, extra) => { zones[id] = zoneOf(id, label, rect, extra); };
  const hi = 2.9;
  Z('store', 'Laden', { x0: 0, z0: 0, x1: W, z1: D, y1: hi }, { x: W / 2, z: D - 1.4 });
  Z('street', 'Straße', { x0: XW0, z0: fz, x1: XW1, z1: sz, y1: hi });
  Z('sidewalkN', 'Gehweg Nord', { x0: XW0, z0: fz, x1: XW1, z1: curbZ, y1: hi });
  Z('sidewalkS', 'Gehweg Süd', { x0: XW0, z0: roadZ1, x1: XW1, z1: sz, y1: hi });
  Z('road', 'Fahrbahn', { x0: XW0, z0: roadZ0, x1: XW1, z1: roadZ1, y1: hi });
  Z('crossing', 'Kreuzung', { x0: xc0, z0: roadZ0, x1: xc1, z1: roadZ1, y1: hi });
  Z('sideN', 'Seitenstraße Nord', { x0: xc0 - 2.4, z0: zSN, x1: xc1 + 2.4, z1: roadZ0, y1: hi });
  Z('sideS', 'Seitenstraße Süd', { x0: xc0 - 2.4, z0: roadZ1, x1: xc1 + 2.4, z1: zSS, y1: hi });
  Z('doorway', 'Ladentür', { x0: door.x0, z0: D - 0.6, x1: door.x1, z1: D + 0.8, y1: hi }, { yaw: 0 });
  Z('theft', 'Diebstahlsicherung', { x0: door.x0 - 0.1, z0: D - 1.0, x1: door.x1 + 0.1, z1: D - 0.35, y1: hi }, { yaw: 0 });
  Z('alley', 'Gasse', { x0: -3.4, z0: -T, x1: -T, z1: fz, y1: hi });
  Z('yard', 'Hinterhof', { x0: -3.4, z0: -11.0, x1: W + 8.4, z1: -T, y1: 4.0 });
  Z('escape', 'Feuertreppe', { x0: fx - 3.64, z0: -1.62, x1: fx + 2.54, z1: -T });
  Z('roof', 'Dach', { x0: -T, z0: -T, x1: W + T, z1: D + T, y0: 3.0 });
  Z('kiosk', 'Kiosk', { x0: W + 8.4, z0: D + 0.3, x1: W + 11.6, z1: D + 2.0, y1: hi });
  Z('palast', 'LENZ PALAST', palast.rect);
  Z('palastFoyer', 'Palast-Foyer', { x0: palast.foyer.x0, z0: palast.foyer.z0, x1: palast.foyer.x1, z1: palast.hall.z0 }); // bis zum Saal: die Trennwand gehört zur Foyer-Zone (kein Spalt)
  Z('palastHall', 'Palast-Saal', { x0: palast.hall.x0, z0: palast.hall.z0, x1: palast.hall.x1, z1: palast.hall.z1 });
  Z('palastEntrance', 'Palast-Eingang', { x0: W / 2 - 2, z0: sz - 2.2, x1: W / 2 + 2, z1: sz + 1, y1: hi });

  // --- Spawns ---
  const spawns = {
    shop: { x: W / 2, z: D - 1.4, yaw: 0 },
    street: { x: W / 2, z: D + 1.6, yaw: PI },
    palast: { x: W / 2, z: sz + 2.0, yaw: PI },
    yard: { x: Math.round(W * 50) / 100, z: -3.2, yaw: PI },
    kiosk: { x: W + 10.0, z: D + 1.4, yaw: 0 },
    alley: { x: -1.8, z: Math.round(D * 50) / 100, yaw: 0 },
    roof: { x: fx - 2.0, z: 1.2, y: ROOF_Y, yaw: PI },
  };

  // --- Fußwege (Passanten laufen auf Pfaden) ---
  const wN = D + 1.2;
  const wS = D + 9.35;
  const sidewalkPaths = [
    { id: 'walkN', pts: [{ x: XW0 + 1.8, z: wN }, { x: xc0 - 0.3, z: wN }, { x: xc1 + 0.3, z: wN }, { x: XW1 - 1.8, z: wN }], waits: [null, 'side', null] },
    { id: 'walkS', pts: [{ x: XW0 + 1.8, z: wS }, { x: xc0 - 0.3, z: wS }, { x: xc1 + 0.3, z: wS }, { x: XW1 - 1.8, z: wS }], waits: [null, 'side', null] },
    { id: 'crossW', pts: [{ x: xc0 - 3.3, z: wN }, { x: xc0 - 3.3, z: wS }], waits: ['main'] },
    { id: 'crossE', pts: [{ x: xc1 + 3.3, z: wN }, { x: xc1 + 3.3, z: wS }], waits: ['main'] },
    { id: 'crossMid', pts: [{ x: W / 2, z: wN }, { x: W / 2, z: wS }], waits: ['mid'] },
    { id: 'shopDoor', pts: [{ x: W / 2, z: D + 0.9 }, { x: W / 2, z: wN }], waits: [null] },
    { id: 'palastDoor', pts: [{ x: W / 2, z: sz + 0.6 }, { x: W / 2, z: wS }], waits: [null] },
    { id: 'alleyMouth', pts: [{ x: -1.8, z: wN }, { x: -1.8, z: D + 0.9 }], waits: [null] },
    { id: 'kioskFront', pts: [{ x: W + 10, z: wN }, { x: W + 10, z: D + 0.9 }], waits: [null] },
  ];

  // --- Fahrspuren (Autos kinematisch, nie Kollider im Raster) ---
  const zebras = [
    { id: 'zebraMid', x0: W / 2 - 1.1, z0: roadZ0, x1: W / 2 + 1.1, z1: roadZ1 },
    { id: 'zebraW', x0: xc0 - 4.4, z0: roadZ0, x1: xc0 - 2.2, z1: roadZ1 },
    { id: 'zebraE', x0: xc1 + 2.2, z0: roadZ0, x1: xc1 + 4.4, z1: roadZ1 },
    { id: 'zebraArmN', x0: xc0, z0: D + 0.5, x1: xc1, z1: D + 2.1 },
    { id: 'zebraArmS', x0: xc0, z0: D + 8.9, x1: xc1, z1: D + 10.1 },
  ];
  const lanes = [
    { id: 'mainW', dir: { x: -1, z: 0 }, z: f.laneWz, from: XW1 + 4, to: XW0 - 4, speed: 8, stop: { at: xc1 + 1.4, axis: 'x', signal: 'main' }, yields: ['zebraMid', 'zebraW', 'zebraE'] },
    { id: 'mainE', dir: { x: 1, z: 0 }, z: f.laneEz, from: XW0 - 4, to: XW1 + 4, speed: 8, stop: { at: xc0 - 1.4, axis: 'x', signal: 'main' }, yields: ['zebraMid', 'zebraW', 'zebraE'] },
    { id: 'sideS', dir: { x: 0, z: 1 }, x: xc0 + 1.25, from: zSN - 4, to: zSS + 4, speed: 7, stop: { at: roadZ0 - 1.0, axis: 'z', signal: 'side' }, yields: ['zebraArmN'] },
    { id: 'sideN', dir: { x: 0, z: -1 }, x: xc1 - 1.25, from: zSS + 4, to: zSN - 4, speed: 7, stop: { at: roadZ1 + 1.0, axis: 'z', signal: 'side' }, yields: ['zebraArmS'] },
  ];

  // --- Schilder (erfundene Namen) ---
  const signs = [
    { id: 'palast', text: 'LENZ PALAST', color: '#ffd23f', x: W / 2, y: 5.6, z: sz - 0.05, yaw: PI, w: Math.min(PW - 2, 9) },
    { id: 'kiosk', text: 'KIOSK', color: '#ff7ac8', x: W + 10, y: 2.3, z: D - 0.07, yaw: 0, w: 1.8 },
    { id: 'alley', text: 'HINTERHOF', color: '#35e6ff', x: -3.37, y: 2.4, z: D - 1, yaw: PI / 2, w: 1.8 },
    { id: 'street', text: 'LENZSTRASSE', color: '#ffffff', x: px0 - 4, y: 3.2, z: sz - 0.03, yaw: PI, w: 3.0 },
    { id: 'armW', text: 'BAHNWEG', color: '#ffffff', x: W + 11.63, y: 3.0, z: D - 6, yaw: PI / 2, w: 2.4 },
    { id: 'armE', text: 'BAHNWEG', color: '#ffffff', x: W + 21.37, y: 3.0, z: D - 6, yaw: -PI / 2, w: 2.4 },
  ];

  // --- Läden an den Fassaden (erfundene Namen; Zeichnung in world/build-city-decor.js) ---
  const FRONTS = [
    ['NW1', 'BÄCKEREI KRUME', '#ffb347', [0.8, 0.3, 0.2]], ['NW2', 'WASCHSALON SCHAUMSCHLÄGER', '#7be0ff', [0.2, 0.5, 0.7]],
    ['NE2', 'IMBISS ZUR WURSTBUDE', '#ff6b6b', [0.85, 0.25, 0.2]], ['SW', 'FRISEUR HAARSCHARF', '#d9a6ff', [0.5, 0.3, 0.7]],
    ['SE1', 'BLUMEN PUSTEBLUME', '#9dff7a', [0.3, 0.65, 0.35]], ['SE2', 'REISEBÜRO FERNWEH', '#ffe66b', [0.25, 0.5, 0.75]],
    ['NE1', 'ZOO FELLNASE', '#ff9ad5', [0.9, 0.5, 0.6]],
  ];
  const shopFronts = [];
  for (const [bid, text, color, awning] of FRONTS) {
    const bd = buildings.find((q) => q.id === bid);
    if (!bd || !bd.front) continue;
    let cx = (bd.x0 + bd.x1) / 2;
    if (bid === 'SW') cx = Math.max(bd.x0 + 4, px0 - 14);
    if (bid === 'SE1') cx = (bd.x0 + bd.x1) / 2 + 2.5;
    const wd = Math.min(5, bd.x1 - bd.x0 - 1.5);
    if (wd < 2.4) continue;
    cx = clamp(cx, bd.x0 + wd / 2 + 0.2, bd.x1 - wd / 2 - 0.2);
    shopFronts.push({ id: bid, text, color, awning, x: Math.round(cx * 100) / 100, w: Math.round(wd * 100) / 100, z: bd.front === 'S' ? bd.z1 : bd.z0, yaw: bd.front === 'S' ? 0 : PI, y: 3.5 });
  }

  // --- Plätze für Welle 2 ---
  const discoverSlots = [
    { id: 'roofCenter', area: 'roof', x: Math.round(W * 50) / 100, z: Math.round(D * 40) / 100, y: ROOF_Y },
    { id: 'containerTop', area: 'yard', x: 4.8, z: -7.6, y: 2.6 },
    { id: 'carRoof', area: 'yard', x: cx0 + 0.9, z: -7.3, y: 1.42 },
    { id: 'yardCorner', area: 'yard', x: -2.4, z: -9.8, y: 0 },
    { id: 'alleyEnd', area: 'alley', x: -1.8, z: 1.4, y: 0 },
    { id: 'busStop', area: 'street', x: bsx, z: D + 9.2, y: 0 },
    { id: 'kioskSide', area: 'kiosk', x: W + 8.2, z: D + 1.0, y: 0 },
    { id: 'palastCanopy', area: 'palastEntrance', x: W / 2 + 3.2, z: sz - 0.8, y: 0 },
  ];
  const propSlots = [
    { id: 'ball1', kind: 'ball', x: W / 2 - 3.0, z: D + 1.4, y: 0 },
    { id: 'ball2', kind: 'ball', x: W / 2 + 3.0, z: D + 9.4, y: 0 },
    { id: 'crate1', kind: 'crate', x: -1.8, z: D * 0.35, y: 0 },
    { id: 'crate2', kind: 'crate', x: 1.5, z: -8.5, y: 0 },
    { id: 'crate3', kind: 'crate', x: W + 10.0, z: D + 1.1, y: 0 },
    { id: 'can1', kind: 'can', x: W / 2 + 7.0, z: D + 1.5, y: 0 },
    { id: 'can2', kind: 'can', x: W / 2 - 5.0, z: D + 9.5, y: 0 },
    { id: 'can3', kind: 'can', x: px1 + 1.5, z: D + 9.4, y: 0 },
    { id: 'cone1', kind: 'cone', x: xc0 - 1.0, z: D + 1.5, y: 0 },
    { id: 'cone2', kind: 'cone', x: xc1 + 1.0, z: D + 9.4, y: 0 },
    { id: 'box1', kind: 'box', x: W * 0.25, z: -3.0, y: 0 },
    { id: 'box2', kind: 'box', x: W + 5.0, z: D + 1.3, y: 0 },
    { id: 'roofBox', kind: 'box', x: W * 0.35, z: D * 0.6, y: ROOF_Y },
    { id: 'palastBall', kind: 'ball', x: W / 2 - 2.5, z: sz + 3.0, y: 0 },
  ];

  return {
    frame: f, bounds: f.bounds, buildings, palast, colliders, zones, spawns, sidewalkPaths, lanes, zebras, signals, lights, signs, fixtures,
    yard: { x0: -3.4, z0: -11.0, x1: W + 8.4, z1: -T, hoop, graffiti, laundry }, roofProps, litfass, shopFronts, escape, roof, kiosk, doorPosts, doorBlock, discoverSlots, propSlots,
    signalCycle: SIGNAL_CYCLE,
  };
}

// Re-Exporte, damit Tests und Welle 2 aus einer Datei lesen können.
export { STEP_H, BODY_H, MANTLE_H };
