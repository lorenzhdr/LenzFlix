// VIDEOTHEK LENZ · Raum: Boden (Teppich + gebackene Lichtpfützen/Kontaktschatten), Wände, Decke mit
// Leuchtstoffpaneelen, Eingangsfront mit Glastür/Schaufenstern, Nachtkulisse, Lichter.
import {
  Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, HemisphereLight, DirectionalLight, DoubleSide,
} from 'three';
import { box, quad, flatRect, merge, hex, disposeTree } from '../util/geo.js';
import { makeCanvas, toTexture } from './textures.js';
import { CEIL_H } from './layout.js';

const PI = Math.PI;
const WALL_COL = [1, 1, 1];
const TRIM_DARK = [0.16, 0.2, 0.24];
const TEAL = hex('#1f5f6b');
const METAL = [0.62, 0.64, 0.7];

function lightmapCanvas(layout) {
  const { w: W, d: D } = layout;
  const s = Math.min(16, 1024 / Math.max(W, D));
  const c = makeCanvas(Math.ceil(W * s), Math.ceil(D * s));
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(112,106,100)';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'lighter';
  const pool = (x, z, r, rgba) => {
    const g = ctx.createRadialGradient(x * s, z * s, 0, x * s, z * s, r * s);
    g.addColorStop(0, rgba);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect((x - r) * s, (z - r) * s, r * 2 * s, r * 2 * s);
  };
  for (const p of layout.panels) pool(p.x, p.z, 2.6, 'rgba(255,226,180,0.30)');
  for (const sg of layout.signs) {
    if (sg.kind !== 'hang') continue;
    const [r, g, b] = hex(sg.color);
    pool(sg.x, sg.z, 1.7, `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},0.22)`);
  }
  ctx.globalCompositeOperation = 'source-over';
  // Kontaktschatten unter Regalen/Tresen
  for (const q of layout.colliders) {
    if (q.kind !== 'shelf' && q.kind !== 'counter') continue;
    for (let i = 0; i < 7; i++) {
      const e = 0.04 + i * 0.075;
      ctx.fillStyle = 'rgba(0,0,0,0.11)';
      ctx.fillRect((q.x0 - e) * s, (q.z0 - e) * s, (q.x1 - q.x0 + 2 * e) * s, (q.z1 - q.z0 + 2 * e) * s);
    }
  }
  // Wandkanten dunkler
  const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(0,0,0,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
  };
  const e = 0.7 * s;
  edge(0, 0, e, 0, 0, 0, e, c.height);
  edge(c.width, 0, c.width - e, 0, c.width - e, 0, e, c.height);
  edge(0, 0, 0, e, 0, 0, c.width, e);
  edge(0, c.height, 0, c.height - e, 0, c.height - e, c.width, e);
  return c;
}

/** Wand entlang x (Dicke z0..z1) mit Öffnungen [{x0,x1,y0,y1}]; Pfeiler/Brüstung/Sturz als Quader. */
function wallAlongX(list, x0, x1, z0, z1, openings, color) {
  const zc = (z0 + z1) / 2;
  const t = z1 - z0;
  const part = (a, b, ya, yb) => {
    if (b - a < 0.005 || yb - ya < 0.005) return;
    list.push(box({ w: b - a, h: yb - ya, d: t, x: (a + b) / 2, y: (ya + yb) / 2, z: zc, color, tile: 1.2 }));
  };
  let cur = x0;
  for (const o of [...openings].sort((a, b) => a.x0 - b.x0)) {
    part(cur, o.x0, 0, CEIL_H);
    part(o.x0, o.x1, 0, o.y0);
    part(o.x0, o.x1, o.y1, CEIL_H);
    cur = o.x1;
  }
  part(cur, x1, 0, CEIL_H);
}

/** Ein Türflügel (Pivot = Scharnier an x = 0, öffnet nach +x/-x je nach dir). Benannt von buildRoom, Intro dreht ihn um y. */
export function buildDoorLeaf(dir) {
  const parts = [];
  const dark = [0.2, 0.22, 0.26];
  parts.push(box({ w: 1.08, h: 0.26, d: 0.05, x: dir * 0.54, y: 0.13, z: 0, color: dark }));
  parts.push(box({ w: 1.08, h: 0.12, d: 0.05, x: dir * 0.54, y: 2.29, z: 0, color: METAL }));
  parts.push(box({ w: 0.08, h: 2.35, d: 0.05, x: dir * 0.04, y: 1.175, z: 0, color: METAL }));
  parts.push(box({ w: 0.08, h: 2.35, d: 0.05, x: dir * 1.04, y: 1.175, z: 0, color: METAL }));
  parts.push(box({ w: 0.03, h: 0.5, d: 0.06, x: dir * 0.9, y: 1.05, z: 0.02, color: [0.88, 0.88, 0.92] }));
  const frame = new Mesh(merge(parts), new MeshBasicMaterial({ vertexColors: true }));
  frame.name = 'lfx-door-frame';
  const glass = new Mesh(quad({ w: 0.94, h: 1.95, x: dir * 0.54, y: 1.25, z: 0 }), new MeshBasicMaterial({ color: 0xaed6ff, transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide }));
  glass.renderOrder = 6;
  glass.name = 'lfx-door-glass';
  const g = new Group();
  g.add(frame, glass);
  return g;
}

export function buildRoom(layout, tex) {
  const { w: W, d: D } = layout;
  const group = new Group();
  group.name = 'room';

  // --- Boden ---
  const lm = toTexture(lightmapCanvas(layout), { mips: false, aniso: 1 });
  lm.channel = 1;
  const floorMat = (map, offset) => new MeshBasicMaterial({
    map, lightMap: lm, lightMapIntensity: PI, polygonOffset: !!offset, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset,
  });
  const floors = [];
  const f0 = flatRect(0, 0, W, D, { tile: 2, roomW: W, roomD: D });
  floors.push(new Mesh(f0, floorMat(tex.carpet, 0)));
  if (layout.adultRoom) {
    const a = layout.adultRoom;
    floors.push(new Mesh(flatRect(a.x0 + 0.12, a.z0, a.x1, a.z1, { y: 0.004, tile: 2, roomW: W, roomD: D }), floorMat(tex.carpetRed, 1)));
  }
  if (layout.kidsRoom) {
    const k = layout.kidsRoom;
    floors.push(new Mesh(flatRect(k.x0, k.z0, k.x1, k.z1, { y: 0.004, tile: 2, roomW: W, roomD: D }), floorMat(tex.carpetKids, 1)));
  }
  floors.forEach((m) => { m.matrixAutoUpdate = false; m.updateMatrix(); group.add(m); });

  // --- Wände (Tapete) und Zierleisten (Trim) ---
  const wallParts = [];
  const trimParts = [];
  const glassParts = [];
  const door = layout.door;
  const winH = { y0: 0.95, y1: 2.4 };
  const windows = [];
  if (door.x0 - 0.7 - 1.2 > 1.2) windows.push({ x0: 1.2, x1: door.x0 - 0.7, ...winH });
  if (W - 1.2 - (door.x1 + 0.7) > 1.2) windows.push({ x0: door.x1 + 0.7, x1: W - 1.2, ...winH });
  const doorOpen = { x0: door.x0, x1: door.x1, y0: 0, y1: 2.4 };
  layout.facade = { door, windows };

  for (const wl of layout.walls) {
    const col = wl.kind.startsWith('adult') ? [0.62, 0.3, 0.36] : WALL_COL;
    if (wl.kind === 'outer-s') wallAlongX(wallParts, wl.x0, wl.x1, wl.z0, wl.z1, [doorOpen, ...windows], col);
    else wallParts.push(box({ w: wl.x1 - wl.x0, h: CEIL_H, d: wl.z1 - wl.z0, x: (wl.x0 + wl.x1) / 2, y: CEIL_H / 2, z: (wl.z0 + wl.z1) / 2, color: col, tile: 1.2 }));
  }

  // Sockelleiste + Holzvertäfelung (innen) – auf allen Innenseiten außer der Eingangsfront
  const dado = (x0, z0, x1, z1) => {
    const w = Math.abs(x1 - x0) || 0.03;
    const d = Math.abs(z1 - z0) || 0.03;
    trimParts.push(box({ w, h: 0.9, d, x: (x0 + x1) / 2, y: 0.45, z: (z0 + z1) / 2, color: TEAL }));
    trimParts.push(box({ w: w + (w > d ? 0 : 0.03), h: 0.05, d: d + (w > d ? 0.03 : 0), x: (x0 + x1) / 2, y: 0.925, z: (z0 + z1) / 2, color: [0.45, 0.3, 0.18] }));
    trimParts.push(box({ w: w + (w > d ? 0 : 0.02), h: 0.1, d: d + (w > d ? 0.02 : 0), x: (x0 + x1) / 2, y: 0.05, z: (z0 + z1) / 2, color: TRIM_DARK }));
  };
  dado(0, 0.015, W, 0.015);
  dado(0.015, 0, 0.015, D);
  dado(W - 0.015, 0, W - 0.015, D);
  dado(0, D - 0.015, door.x0, D - 0.015);
  dado(door.x1, D - 0.015, W, D - 0.015);
  if (layout.adultRoom) {
    const a = layout.adultRoom;
    trimParts.push(box({ w: 0.03, h: 0.9, d: a.z1, x: a.x0 - 0.015, y: 0.45, z: a.z1 / 2, color: [0.25, 0.08, 0.12] }));
  }

  // Eingangstür (zweiflüglig), Pfosten, Schaufenster-Rahmen
  const frame = (x, y, w, h, d = 0.07) => trimParts.push(box({ w, h, d, x, y, z: D + 0.06, color: METAL }));
  frame(door.x0, 1.2, 0.08, 2.4);
  frame(door.x1, 1.2, 0.08, 2.4);
  frame(W / 2, 2.35, door.w, 0.1);
  for (const wd of windows) {
    const wcx = (wd.x0 + wd.x1) / 2;
    const ww = wd.x1 - wd.x0;
    glassParts.push(quad({ w: ww, h: wd.y1 - wd.y0, x: wcx, y: (wd.y0 + wd.y1) / 2, z: D + 0.06 }));
    trimParts.push(box({ w: 0.05, h: wd.y1 - wd.y0, d: 0.08, x: wcx, y: (wd.y0 + wd.y1) / 2, z: D + 0.06, color: METAL }));
    trimParts.push(box({ w: ww + 0.1, h: 0.05, d: 0.2, x: wcx, y: wd.y0, z: D + 0.06, color: [0.8, 0.72, 0.6] }));
  }
  layout.facade.windows = windows;

  const wallsMesh = new Mesh(merge(wallParts), new MeshLambertMaterial({ map: tex.wallpaper, vertexColors: true }));
  const trimMesh = new Mesh(merge(trimParts), new MeshLambertMaterial({ vertexColors: true }));
  group.add(wallsMesh, trimMesh);
  // Eingangstür: eigenes, benanntes Objekt mit zwei Flügeln (Module/Intro greifen per Name zu)
  const doorGroup = new Group();
  doorGroup.name = 'lfx-door';
  const leafL = buildDoorLeaf(1);
  leafL.name = 'lfx-door-left';
  leafL.position.set(door.x0 + 0.02, 0, D + 0.06);
  const leafR = buildDoorLeaf(-1);
  leafR.name = 'lfx-door-right';
  leafR.position.set(door.x1 - 0.02, 0, D + 0.06);
  doorGroup.add(leafL, leafR);
  group.add(doorGroup);
  const glass = new Mesh(merge(glassParts), new MeshBasicMaterial({ color: 0xaed6ff, transparent: true, opacity: 0.13, depthWrite: false, side: DoubleSide }));
  glass.renderOrder = 5;
  group.add(glass);

  // --- Kulisse: Straße bei Nacht ---
  const night = new Mesh(quad({ w: W + 30, h: 9, x: W / 2, y: 3.6, z: D + 8, ry: PI }), new MeshBasicMaterial({ map: tex.night }));
  const street = new Mesh(flatRect(-14, D, W + 14, D + 8, { y: -0.02, tile: 4, roomW: W, roomD: D }), new MeshBasicMaterial({ color: 0x15172a }));
  night.name = 'lfx-backdrop';
  street.name = 'lfx-street';
  group.add(night, street);

  // --- Decke + Leuchtstoffpaneele ---
  const ceil = new Mesh(flatRect(0, 0, W, D, { y: CEIL_H, up: false, tile: 0.6, roomW: W, roomD: D }), new MeshBasicMaterial({ map: tex.ceiling, color: 0xc9c3b5 }));
  group.add(ceil);
  const frames = [];
  const tubes = [];
  for (const p of layout.panels) {
    frames.push(box({ w: p.w + 0.08, h: 0.04, d: p.d + 0.08, x: p.x, y: CEIL_H - 0.02, z: p.z, color: [0.82, 0.82, 0.8] }));
    tubes.push(quad({ w: p.w, h: p.d, x: p.x, y: CEIL_H - 0.045, z: p.z, rx: PI / 2 }));
  }
  if (frames.length) {
    group.add(new Mesh(merge(frames), new MeshLambertMaterial({ vertexColors: true })));
    group.add(new Mesh(merge(tubes), new MeshBasicMaterial({ color: 0xfff4d8, toneMapped: false })));
  }

  return {
    group,
    lightmap: lm,
    dispose() { disposeTree(group); lm.dispose(); },
  };
}

/** Lichter: warmes Hemisphären-/Umgebungslicht + eine Richtungslichtquelle (Schatten nur bei Qualität „high“). */
export function addLights(scene, layout) {
  const hemi = new HemisphereLight(0xfff1dc, 0x8a7560, 1.45); // Umgebungslicht in einer Quelle (ein Licht weniger pro Fragment)
  const dir = new DirectionalLight(0xffe0b8, 0.75);
  const cx = layout.w / 2;
  const cz = layout.d / 2;
  dir.position.set(cx + 3, 12, cz + 4);
  dir.target.position.set(cx, 0, cz);
  const half = Math.max(layout.w, layout.d) * 0.62;
  const cam = dir.shadow.camera;
  cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.near = 1; cam.far = 30;
  dir.shadow.bias = -0.0006;
  dir.shadow.normalBias = 0.03;
  scene.add(hemi, dir, dir.target);
  dir.shadow.autoUpdate = false; // statische Szene: Schattenkarte nur bei Bedarf neu
  return {
    hemi, dir,
    setShadows(on, size = 2048) {
      dir.castShadow = !!on;
      dir.shadow.needsUpdate = true;
      if (on && dir.shadow.mapSize.x !== size) {
        dir.shadow.mapSize.set(size, size);
        if (dir.shadow.map) { dir.shadow.map.dispose(); dir.shadow.map = null; }
      }
    },
    dispose() { scene.remove(hemi, dir, dir.target); dir.shadow.dispose(); },
  };
}

