// VIDEOTHEK LENZ · VR-Kino: prozeduraler Kinosaal (gemergte Geometrie, Vorhang, Saallicht, Streulicht).
// Koordinaten: Leinwandmitte bei (0, y, 0), Publikum bei +z, Blick zur Leinwand = yaw 0 (−z). Keine fremden Assets.
import {
  Scene, Color, Mesh, BoxGeometry, PlaneGeometry, MeshLambertMaterial, MeshBasicMaterial, AmbientLight, DirectionalLight,
  Float32BufferAttribute, CanvasTexture, SRGBColorSpace, RepeatWrapping, Object3D, Group, DoubleSide,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const SEAT_NAMES = ['front', 'mid', 'back'];
const ROW_Z = [6, 8, 10, 12, 14, 16, 18];
const floorY = (z) => Math.max(0, 0.125 * (z - 8));

/** Sitzplätze: Kopfposition über der Sitzmitte; y = Bodenhöhe des Platzes, yaw = Blick zur Leinwandmitte. */
export const SEATS = {
  front: { x: 0, z: 8, y: floorY(8), yaw: 0 },
  mid: { x: 0, z: 12, y: floorY(12), yaw: 0 },
  back: { x: 0, z: 16, y: floorY(16), yaw: 0 },
};

/** Augenhöhe über dem Sitzboden (sitzend). */
export const SEAT_EYE = 1.1;

const HALL = { x: 13, back: 21, front: -0.4, h: 12 };
const CURTAIN = { half: 9.3, z: 2.05, h: 11.4 };
const HOUSE = { r: 1.0, g: 0.78, b: 0.55 };
const CURTAIN_SECONDS = 1.8;
// Streulicht: Faktoren auf die (lineare) Bildfarbe; Lambert teilt durch π, daher deutlich über 1. Das Bild bleibt der hellste Teil.
const SPILL_AMBIENT = 6.5;
const SPILL_SUN = 11;

/** Box als Geometrie mit Vertexfarbe (Mittelpunkt + Maße). */
function box(w, h, d, cx, cy, cz, color) {
  const g = new BoxGeometry(w, h, d);
  g.translate(cx, cy, cz);
  const c = new Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new Float32BufferAttribute(arr, 3));
  return g;
}

/** Box über Min/Max-Grenzen. */
const span = (x0, x1, y0, y1, z0, z1, color) => box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, color);

function canvas2d(w, h) {
  try {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext ? c.getContext('2d') : null;
    return g ? { c, g } : { c, g: null };
  } catch { return { c: null, g: null }; }
}

function pleatTexture() {
  const { c, g } = canvas2d(256, 32);
  if (!g) return null;
  for (let x = 0; x < 256; x++) {
    const k = 0.5 + 0.5 * Math.sin((x / 256) * Math.PI * 2 * 12);
    const sh = 0.38 + 0.62 * k * k;
    g.fillStyle = `rgb(${Math.round(150 * sh)},${Math.round(14 * sh)},${Math.round(32 * sh)})`;
    g.fillRect(x, 0, 1, 32);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  return t;
}

function exitTexture() {
  const { c, g } = canvas2d(256, 96);
  if (!g) return null;
  g.fillStyle = '#0a5a2a';
  g.fillRect(0, 0, 256, 96);
  g.strokeStyle = '#e8ffe8';
  g.lineWidth = 5;
  g.strokeRect(5, 5, 246, 86);
  g.fillStyle = '#ffffff';
  g.font = '700 46px system-ui, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('AUSGANG', 128, 50);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function buildStatic() {
  const list = [];
  const carpet = 0x3a1019;
  const wall = 0x262630;
  // Boden: vorn flach, dann ansteigende Stufen (je Reihe ab 10 m eine Stufe)
  list.push(span(-HALL.x, HALL.x, -0.6, 0, HALL.front, 9, carpet));
  for (const z of ROW_Z) {
    if (z < 10) continue;
    list.push(span(-HALL.x, HALL.x, -0.6, floorY(z), z - 1, z === ROW_Z[ROW_Z.length - 1] ? HALL.back : z + 1, z % 4 === 0 ? 0x44131d : carpet));
  }
  // Wände, Decke
  list.push(span(-HALL.x - 0.3, -HALL.x, -0.6, HALL.h, HALL.front - 0.3, HALL.back + 0.3, wall));
  list.push(span(HALL.x, HALL.x + 0.3, -0.6, HALL.h, HALL.front - 0.3, HALL.back + 0.3, wall));
  list.push(span(-HALL.x, HALL.x, -0.6, HALL.h, HALL.front - 0.3, HALL.front, 0x0c0c11));
  list.push(span(-HALL.x, HALL.x, -0.6, HALL.h, HALL.back, HALL.back + 0.3, wall));
  list.push(span(-HALL.x, HALL.x, HALL.h, HALL.h + 0.3, HALL.front - 0.3, HALL.back + 0.3, 0x0b0b10));
  // Akustik-Paneele an den Seitenwänden
  for (let z = 1.6, i = 0; z < 20.4; z += 1.7, i++) {
    const col = i % 2 ? 0x3b2a2c : 0x2f2124;
    list.push(span(-HALL.x, -HALL.x + 0.16, 1.4, 7.2, z, z + 1.4, col));
    list.push(span(HALL.x - 0.16, HALL.x, 1.4, 7.2, z, z + 1.4, col));
  }
  // Sockelleiste
  list.push(span(-HALL.x, -HALL.x + 0.1, -0.6, 1.4, HALL.front, HALL.back, 0x1c1418));
  list.push(span(HALL.x - 0.1, HALL.x, -0.6, 1.4, HALL.front, HALL.back, 0x1c1418));
  // Sitze (3 Teile je Sitz: Sitzfläche, Lehne, Armlehne)
  const red = 0x9b2230;
  const redDark = 0x7a1a28;
  for (const z of ROW_Z) {
    const y = floorY(z);
    for (let k = -9; k <= 9; k++) {
      const x = k * 0.62;
      list.push(box(0.54, 0.4, 0.52, x, y + 0.2, z + 0.1, red));
      list.push(box(0.54, 0.78, 0.14, x, y + 0.79, z + 0.42, redDark));
      list.push(box(0.07, 0.07, 0.46, x + 0.31, y + 0.52, z + 0.12, 0x2a1b1b));
    }
  }
  return mergeGeometries(list, false);
}

function buildStairLights() {
  const list = [];
  const amber = 0xffffff;
  for (const z of ROW_Z) {
    if (z < 10) continue;
    const y = floorY(z);
    for (let x = -12; x <= 12; x += 1.5) list.push(box(0.22, 0.04, 0.04, x, y - 0.07, z - 1 - 0.01, amber));
  }
  return mergeGeometries(list, false);
}

function buildExitSigns() {
  const a = new PlaneGeometry(1.1, 0.42);
  a.rotateY(Math.PI / 2);
  a.translate(-HALL.x + 0.2, 3.3, 3.2);
  const b = new PlaneGeometry(1.1, 0.42);
  b.rotateY(-Math.PI / 2);
  b.translate(HALL.x - 0.2, 3.3, 3.2);
  return mergeGeometries([a, b], false);
}

/**
 * Saal erzeugen. Rückgabe { scene, update(dt), curtain(open, instant), curtainOpen, setHouseLight(k, instant), setSpill(color, k),
 * houseLight, spill, seat(name), dispose() }. Draw-Calls: 8 (Hülle, Stufenlicht, Schild, 2× Vorhang) ohne Leinwand/Untertitel/Panels.
 */
export function createHall() {
  const scene = new Scene();
  scene.name = 'lfx-cinema-hall';
  scene.background = new Color(0x040406);

  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  const shellGeo = track(buildStatic());
  const shellMat = track(new MeshLambertMaterial({ vertexColors: true }));
  const shell = new Mesh(shellGeo, shellMat);
  shell.name = 'lfx-cinema-shell';
  shell.matrixAutoUpdate = false;
  scene.add(shell);

  const stairGeo = track(buildStairLights());
  const stairMat = track(new MeshBasicMaterial({ color: 0xffa24a, toneMapped: false }));
  const stairs = new Mesh(stairGeo, stairMat);
  stairs.name = 'lfx-cinema-stairlights';
  scene.add(stairs);

  const exitTex = exitTexture();
  if (exitTex) track(exitTex);
  const exitGeo = track(buildExitSigns());
  const exitMat = track(new MeshBasicMaterial({ map: exitTex, color: exitTex ? 0xffffff : 0x1c9a4a, toneMapped: false, side: DoubleSide }));
  const exits = new Mesh(exitGeo, exitMat);
  exits.name = 'lfx-cinema-exit';
  scene.add(exits);

  // Vorhang: zwei Hälften, Drehpunkt an der Außenkante (Skalierung in x rafft die Falten)
  const pleats = pleatTexture();
  if (pleats) track(pleats);
  const curtainMat = track(new MeshLambertMaterial({ map: pleats, color: pleats ? 0xffffff : 0x6a0f1c }));
  const curtains = new Group();
  curtains.name = 'lfx-cinema-curtain';
  scene.add(curtains);
  const makeHalf = (side) => {
    const g = track(new PlaneGeometry(CURTAIN.half, CURTAIN.h));
    // side -1 (links): Geometrie von x = 0 .. +half, Drehpunkt bei x = −half; side +1: von −half .. 0
    g.translate(-side * CURTAIN.half / 2, CURTAIN.h / 2, 0);
    const m = new Mesh(g, curtainMat);
    m.position.set(side * CURTAIN.half, 0, CURTAIN.z);
    curtains.add(m);
    return m;
  };
  const left = makeHalf(-1);
  const right = makeHalf(1);
  const CLOSED = 1;
  const OPEN = 0.1;
  let curtainK = 0; // 0 zu, 1 offen
  let curtainTarget = 0;
  const applyCurtain = () => {
    const e = curtainK * curtainK * (3 - 2 * curtainK);
    const s = CLOSED + (OPEN - CLOSED) * e;
    left.scale.x = s;
    right.scale.x = s;
  };
  applyCurtain();

  // Licht
  const ambient = new AmbientLight(0xffffff, 1);
  const sun = new DirectionalLight(0xffffff, 1);
  sun.position.set(0, 6.5, 1.5);
  const sunTarget = new Object3D();
  sunTarget.position.set(0, 1.2, 15);
  scene.add(ambient, sun, sunTarget);
  sun.target = sunTarget;

  let house = 1;
  let houseTarget = 1;
  let spillColor = [0, 0, 0];
  let spillK = 0;
  let spillKTarget = 0;

  function applyLight() {
    const sr = spillColor[0] * spillK;
    const sg = spillColor[1] * spillK;
    const sb = spillColor[2] * spillK;
    const hk = house;
    ambient.color.setRGB(HOUSE.r * (0.06 + 1.7 * hk) + sr * SPILL_AMBIENT, HOUSE.g * (0.06 + 1.7 * hk) + sg * SPILL_AMBIENT, HOUSE.b * (0.06 + 1.7 * hk) + sb * SPILL_AMBIENT);
    sun.color.setRGB(HOUSE.r * 0.45 * hk + sr * SPILL_SUN, HOUSE.g * 0.45 * hk + sg * SPILL_SUN, HOUSE.b * 0.45 * hk + sb * SPILL_SUN);
    const s = 0.28 + 0.72 * hk;
    stairMat.color.setRGB(1 * s, 0.64 * s, 0.29 * s);
  }
  applyLight();

  const ease = (cur, target, dt, rate) => (Math.abs(target - cur) < 0.0005 ? target : cur + (target - cur) * (1 - Math.exp(-Math.max(0, dt) * rate)));

  const api = {
    scene,
    get curtainOpen() { return curtainTarget >= 1; },
    get curtainProgress() { return curtainK; },
    get houseLight() { return house; },
    get houseLightTarget() { return houseTarget; },
    get spill() { return { color: [...spillColor], k: spillK }; },
    get meshes() { return [shell, stairs, exits, left, right]; },
    SEATS,
    seat(name) { return SEATS[name] || SEATS.mid; },
    curtain(open, instant = false) {
      curtainTarget = open ? 1 : 0;
      if (instant) { curtainK = curtainTarget; applyCurtain(); }
    },
    setHouseLight(k, instant = false) {
      houseTarget = Math.max(0, Math.min(1, Number(k) || 0));
      if (instant) { house = houseTarget; applyLight(); }
    },
    /** Streulicht: color {r,g,b} in sRGB 0..1, k 0..1 (Stärke). */
    setSpill(color, k = 1) {
      if (color) {
        const c = new Color().setRGB(color.r, color.g, color.b, SRGBColorSpace);
        spillColor = [c.r, c.g, c.b];
      }
      spillKTarget = Math.max(0, Math.min(1, Number(k) || 0));
    },
    update(dt) {
      let dirty = false;
      if (curtainK !== curtainTarget) {
        const step = dt / CURTAIN_SECONDS;
        curtainK = curtainTarget > curtainK ? Math.min(curtainTarget, curtainK + step) : Math.max(curtainTarget, curtainK - step);
        applyCurtain();
      }
      if (house !== houseTarget) { house = ease(house, houseTarget, dt, 2.2); dirty = true; }
      if (spillK !== spillKTarget) { spillK = ease(spillK, spillKTarget, dt, 2.5); dirty = true; }
      if (dirty || spillK > 0) applyLight();
    },
    dispose() {
      scene.removeFromParent();
      for (const o of disposables) { try { o.dispose(); } catch { /* egal */ } }
      disposables.length = 0;
      scene.clear();
    },
  };
  return api;
}
