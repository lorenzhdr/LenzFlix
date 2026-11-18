// VIDEOTHEK LENZ · Figuren-Baukasten (three): prozedurale Low-Poly-Menschen im Stil von Richard (modules/cashier.js), parametrisiert über einen
// Look (npc/looks.js). EIN gemergtes SkinnedMesh pro Figur mit starren Gewichten (Bones = Gelenke Hüfte/Oberkörper/Kopf/Arme/Beine) → 1 Draw-Call
// (+1 bei Regenschirm). Geometrie wird je Look gecacht, das Material ist geteilt. Animation: npc/anim.js.
// createFigure(look, { say?, name?, ego?, material? }) → Handle { root, look, setAnim, lookAt, say, hitReact, update(dt, camera?), setUmbrella, headWorld,
//   getNetState, applyRemote, show/hide, setLook, setEgo, topY, setHandItem, dispose }. Für Mehrspieler (1.16.0) ist der Handle mit getNetState/applyRemote netzfähig.
// 1.17.0: Looks mit v===2 (Render-Look der eigenen Figur) baut npc/figure-parts.js; Looks ohne v laufen unverändert (bitgleich, tests/store3d-figure-baseline).
// Geometrie-Cache mit Referenzzählung + LRU (höchstens GEO_FREE_MAX unreferenzierte Einträge).
import {
  Group, Mesh, SkinnedMesh, Skeleton, Bone, MeshLambertMaterial, MeshBasicMaterial, Sphere, Vector3, BufferAttribute, DoubleSide,
} from 'three';
import { box, quad, merge } from '../util/geo.js';
import { sph } from '../modules/m4-geo.js';
import { makeCanvas, toTexture, FONT } from '../world/textures.js';
import { lookKey } from './looks.js';
import { buildV2Parts, buildHandItem, HAND_ITEMS, faceBox } from './figure-parts.js';
import { detailBody, detailHead, winterHead, winterBody } from './figure-detail.js';
import { Animator } from './anim.js';
import { angDiff } from '../modules/m4-util.js';

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const dark = (c, k) => c.map((v) => v * k);
// Bone-Indizes
const B = { root: 0, spine: 1, head: 2, armL: 3, armR: 4, legL: 5, legR: 6 };
const SPINE_Y = 0.8;
const EGO_BACK = 0.12; // Ego (alter Pfad): Rig nach hinten
const EGO_LEAN = 0.45; // Ego (v2): Kippwinkel der Beine um den Fuß (rad), Hüfte hinter der Kamera, Füße davor
const EGO_Z = 0.05; // Ego (v2): Lage der Hüfte relativ zur Kamera (m, + = hinter der Kamera)
const NECK_Y = 1.44;
const FACE_UP = 0.16; // Augenhöhe über dem Kopf-Bone (alter Pfad 1,60; v2 mit Kopf ×1,15 um den Hals ≈ 1,60–1,62)

/** Höchstens so viele unreferenzierte Geometrien bleiben im Cache (älteste zuerst entsorgt). */
export const GEO_FREE_MAX = 48;
/** 1.18-Naht: Handposition am rechten Arm (Bone armR, Offset in dessen Raum; vgl. net/heldcover.js). */
export const HAND_R = { bone: 'armR', offset: [0.04, -0.5, -0.12] };

let sharedMat = null;
let umbrellaMat = null;
let useTick = 0;
const geoCache = new Map(); // key → { key, g, refs, used, topY }
const umbrellaCache = new Map();
const liveSet = new Set(); // alle lebenden Figuren-Handles (1.19.0: Abstands-LOD in modules/ultra-figures.js)

/** Alle lebenden Figuren (Handles), Reihenfolge = Erzeugung. */
export function liveFigures() { return [...liveSet]; }

function material() {
  if (!sharedMat) sharedMat = new MeshLambertMaterial({ vertexColors: true });
  return sharedMat;
}

function skinned(parts, bone) {
  const g = merge(parts);
  const n = g.attributes.position.count;
  const idx = new Uint16Array(n * 4);
  const wt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { idx[i * 4] = bone; wt[i * 4] = 1; }
  g.setAttribute('skinIndex', new BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new BufferAttribute(wt, 4));
  return g;
}

function maxY(g) {
  const a = g.attributes.position.array;
  let m = 0;
  for (let i = 1; i < a.length; i += 3) if (a[i] > m) m = a[i];
  return m;
}

/** Oberkante der vollen v2-Figur (Hut/Frisur) – auch für die Ego-Variante, die nur Beine trägt. */
function fullTopY(look) {
  const parts = buildV2Parts(look);
  let m = 0;
  for (const list of Object.values(parts)) for (const g of list) { m = Math.max(m, maxY(g)); g.dispose(); }
  return m;
}

/** Cache-Eintrag für den Look holen (Referenz +1, ggf. bauen). ego (nur v2): Geometrie mit Beinen, Schuhen und Hüfte (Ich-Sicht). */
function acquire(look, ego = false, item = null, fx = null) {
  const useEgo = !!ego && look.v === 2;
  // 1.19.0 U4: Detail ('|d') und Winterkleidung ('|w' Mütze+Schal, '|wh' nur Mütze, '|ws' nur Schal) – Schlüssel ohne Flag unverändert (bitgleich); nicht in der Ich-Sicht
  const useDetail = !!(fx && fx.detail) && !ego;
  const winter = ego ? null : effectiveWinter(look, fx && fx.winter);
  // Gegenstand (1.18): eigener Cache-Zweig; in der Ich-Sicht (Arme weg) ohne Gegenstand. Ohne Gegenstand bleibt der Schlüssel unverändert (bitgleich).
  const useItem = item && !ego && HAND_ITEMS.includes(item) ? item : null;
  const key = lookKey(look) + (useEgo ? '|ego' : '') + (useItem ? '|h:' + useItem + (useItem === 'umbrella' ? ':' + itemColorKey(look) : '') : '')
    + (useDetail ? '|d' + (useItem || (fx && fx.umb) ? 'n' : '') : '') + (winter ? (winter.hat && winter.scarf ? '|w' : winter.hat ? '|wh' : '|ws') : '');
  let e = geoCache.get(key);
  if (!e) {
    const g = bodyGeometry(look, useEgo, useItem, useDetail, winter, !!(useItem || (fx && fx.umb)));
    e = { key, g, refs: 0, used: 0, topY: useEgo ? fullTopY(look) : maxY(g) };
    geoCache.set(key, e);
  }
  e.refs++;
  e.used = ++useTick;
  return e;
}

/** Referenz −1; unreferenzierte Einträge: LRU, älteste über GEO_FREE_MAX hinaus entsorgen. */
function release(e) {
  if (e.refs > 0) e.refs--;
  e.used = ++useTick;
  if (e.refs > 0) return;
  const free = [...geoCache.values()].filter((x) => x.refs === 0);
  free.sort((a, b) => a.used - b.used);
  for (let i = 0; i < free.length - GEO_FREE_MAX; i++) { free[i].g.dispose(); geoCache.delete(free[i].key); }
}

/** Kennzahlen des Geometrie-Caches (Tests/Debug). */
export function figureCacheInfo() {
  let free = 0;
  let refs = 0;
  for (const e of geoCache.values()) { if (e.refs === 0) free++; refs += e.refs; }
  return { size: geoCache.size, free, refs };
}

/** Hat der Look schon eine Kopfbedeckung? (dann keine Wintermütze) */
function hasHat(look) {
  if (look.v === 2) return !!(look.hat && typeof look.hat === 'object' && look.hat.id && look.hat.id !== 'none');
  return !!look.hat;
}

/** Winter-Option normalisieren: { hat, scarf } oder null (Mütze entfällt bei vorhandenem Hut). */
function effectiveWinter(look, w) {
  if (!w) return null;
  const hat = !!w.hat && !hasHat(look);
  const scarf = !!w.scarf;
  return hat || scarf ? { hat, scarf } : null;
}

/** Farbanteil des Cache-Schlüssels für Gegenstände, deren Farbe nicht in lookKey steckt (Schirm). */
function itemColorKey(look) {
  return Array.isArray(look.umbrellaColor) ? look.umbrellaColor.map((v) => Math.round(v * 255)).join('.') : '-';
}

/** Geometrie je Look (gemergt, mit Skin-Attributen), ungecacht. item: Gegenstand an der rechten Hand (im selben Mesh, Bone armR). */
function bodyGeometry(look, ego = false, item = null, detail = false, winter = null, handBusy = false) {
  const parts = look.v === 2 ? buildV2Parts(look, { ego, detail, winter, handBusy }) : oldParts(look, detail, winter, handBusy);
  if (item) parts[B.armR].push(...buildHandItem(look, item));
  const geos = Object.entries(parts).filter(([, list]) => list.length).map(([bi, list]) => skinned(list, Number(bi)));
  const g = merge(geos);
  g.boundingSphere = new Sphere(new Vector3(0, 0.95, 0), 1.6);
  return g;
}

/** Teile des alten Pfads (Looks ohne v===2) – unverändert. */
function oldParts(look, detail = false, winter = null, handBusy = false) {
  const skin = look.skin;
  const parts = { [B.spine]: [], [B.head]: [], [B.armL]: [], [B.armR]: [], [B.legL]: [], [B.legR]: [] };
  const bottom = look.bottom;
  for (const [side, bi] of [[-1, B.legL], [1, B.legR]]) {
    parts[bi].push(box({ w: 0.14, h: 0.8, d: 0.17, x: side * 0.1, y: 0.4, z: 0, color: bottom }));
    parts[bi].push(box({ w: 0.15, h: 0.07, d: 0.26, x: side * 0.1, y: 0.035, z: -0.04, color: look.shoes }));
  }
  const sp = parts[B.spine];
  sp.push(box({ w: 0.42, h: 0.58, d: 0.23, x: 0, y: 1.09, z: 0, color: look.top }));
  sp.push(box({ w: 0.4, h: 0.14, d: 0.22, x: 0, y: 0.84, z: 0, color: bottom }));
  sp.push(box({ w: 0.1, h: 0.07, d: 0.1, x: 0, y: 1.42, z: 0, color: skin }));
  if (look.stripe) sp.push(box({ w: 0.44, h: 0.07, d: 0.25, x: 0, y: 1.22, z: 0, color: look.stripe }));
  else sp.push(box({ w: 0.43, h: 0.04, d: 0.24, x: 0, y: 0.9, z: 0, color: dark(look.top, 0.7) }));
  if (look.apron) sp.push(box({ w: 0.4, h: 0.48, d: 0.02, x: 0, y: 1.0, z: -0.125, color: look.apron }));
  if (look.bag === 'backpack') sp.push(box({ w: 0.3, h: 0.36, d: 0.14, x: 0, y: 1.12, z: 0.18, color: look.bagColor || [0.3, 0.3, 0.4] }));
  if (look.bag === 'bag') {
    sp.push(box({ w: 0.12, h: 0.2, d: 0.26, x: -0.27, y: 0.8, z: 0, color: look.bagColor || [0.5, 0.3, 0.2] }));
    sp.push(box({ w: 0.04, h: 0.64, d: 0.03, x: -0.12, y: 1.1, z: -0.12, rz: 0.62, color: dark(look.bagColor || [0.5, 0.3, 0.2], 0.7) }));
  }
  const hd = parts[B.head];
  hd.push(sph(0.12, 0, 1.58, 0, skin, 1, 1.1, 1));
  const hair = look.hair;
  const style = look.hairStyle;
  const winterHat = !!(winter && winter.hat); // Mütze deckt die Haarkappe (und den Schopf) ab
  if (style !== 'bald' && !winterHat) hd.push(sph(0.133, 0, 1.605, 0.016, hair, 1, 1, 1, 8, 5, style === 'tuft' ? 1.5 : 1.95));
  if (style === 'long') hd.push(box({ w: 0.25, h: 0.3, d: 0.07, x: 0, y: 1.5, z: 0.1, color: hair }));
  if (style === 'bob') { hd.push(box({ w: 0.04, h: 0.2, d: 0.2, x: -0.125, y: 1.54, z: 0.02, color: hair })); hd.push(box({ w: 0.04, h: 0.2, d: 0.2, x: 0.125, y: 1.54, z: 0.02, color: hair })); }
  if (style === 'tuft' && !winterHat) hd.push(box({ w: 0.05, h: 0.1, d: 0.05, x: 0, y: 1.76, z: 0, color: hair }));
  hd.push(box({ w: 0.028, h: 0.034, d: 0.012, x: -0.045, y: 1.6, z: -0.113, color: [0.08, 0.08, 0.1] }));
  hd.push(box({ w: 0.028, h: 0.034, d: 0.012, x: 0.045, y: 1.6, z: -0.113, color: [0.08, 0.08, 0.1] }));
  hd.push(box({ w: 0.02, h: 0.03, d: 0.02, x: 0, y: 1.57, z: -0.122, color: dark(skin, 0.93) }));
  hd.push(box({ w: 0.05, h: 0.012, d: 0.012, x: 0, y: 1.535, z: -0.113, color: [0.62, 0.25, 0.25] }));
  if (look.glasses) {
    for (const sx of [-1, 1]) hd.push(box({ w: 0.07, h: 0.05, d: 0.012, x: sx * 0.05, y: 1.6, z: -0.12, color: [0.1, 0.1, 0.14] }));
    hd.push(box({ w: 0.03, h: 0.01, d: 0.012, x: 0, y: 1.605, z: -0.12, color: [0.1, 0.1, 0.14] }));
  }
  if (look.hat === 'cap') {
    const c = look.hatColor || [0.8, 0.2, 0.2];
    hd.push(sph(0.14, 0, 1.62, 0, c, 1, 0.85, 1, 8, 5, 1.7));
    hd.push(box({ w: 0.2, h: 0.015, d: 0.12, x: 0, y: 1.635, z: -0.15, color: dark(c, 0.8) }));
  } else if (look.hat === 'beanie') {
    hd.push(sph(0.14, 0, 1.63, 0, look.hatColor || [0.2, 0.4, 0.8], 1, 1, 1, 8, 5, 2.0));
  } else if (look.hat === 'hat') {
    const c = look.hatColor || [0.3, 0.2, 0.15];
    hd.push(box({ w: 0.36, h: 0.02, d: 0.36, x: 0, y: 1.67, z: 0, color: dark(c, 0.8) }));
    hd.push(box({ w: 0.2, h: 0.14, d: 0.2, x: 0, y: 1.75, z: 0, color: c }));
  }
  for (const [sx, bi] of [[-1, B.armL], [1, B.armR]]) {
    const a = parts[bi];
    a.push(box({ w: 0.09, h: 0.3, d: 0.09, x: sx * 0.26, y: 1.21, z: 0, color: look.top }));
    a.push(box({ w: 0.085, h: 0.26, d: 0.085, x: sx * 0.26, y: 0.93, z: 0, color: skin }));
    a.push(sph(0.05, sx * 0.26, 0.78, 0, skin));
    if (sx === 1 && look.bag === 'shopping') {
      const bc = look.bagColor || [0.9, 0.7, 0.2];
      a.push(box({ w: 0.2, h: 0.28, d: 0.12, x: 0.3, y: 0.58, z: -0.02, color: bc }));
      a.push(box({ w: 0.02, h: 0.14, d: 0.02, x: 0.3, y: 0.76, z: -0.02, color: dark(bc, 0.6) }));
    }
  }
  if (detail || winter) {
    const dsc = { v2: false, skin, top: look.top, bottom, shoes: look.shoes, hair, sw: 0.42, hw: 0.4, td: 0.23, ax: 0.26, lx: 0.1, lw: 0.14, topCut: undefined, botCut: 'jeans', shoeModel: 'sneaker', brows: 'none', apron: !!look.apron, stripe: !!look.stripe, handBusy: handBusy || look.bag === 'shopping' };
    if (detail) { detailBody(parts, dsc); detailHead(hd, dsc, (w, h, d, x, y, color, p, rz) => faceBox(hd, w, h, d, x, y, color, p, rz)); }
    if (winter && winter.scarf) winterBody(parts, dsc);
    if (winterHat) winterHead(hd, dsc);
  }
  return parts;
}

function umbrellaGeometry(color) {
  const key = color.map((v) => Math.round(v * 20)).join('.');
  let g = umbrellaCache.get(key);
  if (!g) {
    g = merge([
      box({ w: 0.025, h: 1.1, d: 0.025, x: 0, y: 0.55, z: 0, color: [0.2, 0.2, 0.22] }),
      sph(0.62, 0, 0.98, 0, color, 1, 0.45, 1, 10, 5, Math.PI / 2),
    ]);
    umbrellaCache.set(key, g);
  }
  return g;
}

function nameTexture(text) {
  const c = makeCanvas(256, 64);
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(20,22,40,0.82)'; x.fillRect(0, 0, 256, 64);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `bold 34px ${FONT}`;
  x.fillText(String(text).slice(0, 16), 128, 34);
  return toTexture(c, { aniso: 2 });
}

/** Alle gecachten Geometrien und das geteilte Material freigeben (beim Modul-dispose). */
export function disposeFigureCaches() {
  for (const e of geoCache.values()) e.g.dispose();
  geoCache.clear();
  for (const g of umbrellaCache.values()) g.dispose();
  umbrellaCache.clear();
  if (sharedMat) { sharedMat.dispose(); sharedMat = null; }
  if (umbrellaMat) { umbrellaMat.dispose(); umbrellaMat = null; }
}

export function createFigure(look, hooks = {}) {
  const root = new Group();
  root.name = 'npc-figure';
  const rig = new Group();
  let k = look.height || 1;
  let ego = !!hooks.ego;
  let baseZ = 0;
  // Ego v2 (nur Beine): Körper um den Fuß nach hinten gekippt, damit beim Blick nach unten Beine und Schuhe vor der Kamera im Bild sind;
  // alter Pfad: Rig EGO_BACK m nach hinten (Kopf/Arme per Bone-Skalierung weg, unverändert).
  const egoPlace = () => {
    if (ego && look.v === 2) { rig.rotation.x = EGO_LEAN; baseZ = EGO_Z - SPINE_Y * k * Math.sin(EGO_LEAN); }
    else { rig.rotation.x = 0; baseZ = ego ? EGO_BACK : 0; }
    rig.position.set(0, 0, baseZ);
  };
  const applyScale = () => { k = look.height || 1; rig.scale.set(k * (look.build || 1), k, k * (look.build || 1)); egoPlace(); };
  applyScale();
  root.add(rig);
  const bones = [];
  const mk = (x, y, z, parent) => { const b = new Bone(); b.position.set(x, y, z); if (parent) parent.add(b); bones.push(b); return b; };
  const bRoot = mk(0, 0, 0);
  const bSpine = mk(0, SPINE_Y, 0, bRoot);
  const bHead = mk(0, NECK_Y - SPINE_Y, 0, bSpine);
  const bArmL = mk(-0.26, 1.36 - SPINE_Y, 0, bSpine);
  const bArmR = mk(0.26, 1.36 - SPINE_Y, 0, bSpine);
  const bLegL = mk(-0.1, SPINE_Y, 0, bRoot);
  const bLegR = mk(0.1, SPINE_Y, 0, bRoot);
  let fx = { detail: false, winter: null, umb: false }; // 1.19.0 U4 (umb: Schirm in der Hand → Detail ohne Finger der rechten Hand)
  let handItem = typeof look.handItem === 'string' && HAND_ITEMS.includes(look.handItem) ? look.handItem : null;
  let entry = acquire(look, ego, handItem, fx);
  const mesh = new SkinnedMesh(entry.g, hooks.material || material());
  mesh.add(bRoot);
  rig.add(mesh);
  mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton(bones));
  mesh.boundingSphere = new Sphere(new Vector3(0, 0.95, 0), 1.6);
  mesh.frustumCulled = true;

  const anim = new Animator('idle');
  let umbrella = null;
  let tag = null;
  let lookTarget = null;
  let headOff = 0;
  let recoil = { x: 0, z: 0 };
  let remote = null;
  let disposed = false;
  const legacyTop = () => look.v !== 2;
  const tagY = () => (legacyTop() ? 1.98 : entry.topY + 0.23);
  const headY = () => (legacyTop() ? 1.95 * k : (entry.topY + 0.2) * k);
  const tmp = new Vector3();
  /** Geometrie passend zu look/ego/Gegenstand/Detail/Winter aus dem Cache holen und tauschen (Animation/Position bleiben). */
  const swapGeo = () => {
    const next = acquire(look, ego, handItem, fx);
    if (next === entry) { release(next); return; }
    const old = entry; entry = next; mesh.geometry = entry.g; release(old);
    if (tag) tag.position.set(0, tagY(), 0);
  };
  const handle = {
    root, rig, mesh, look, anim,
    /** Oberkante der Figur (Hut/Frisur inkl.) in Metern, × height. */
    get topY() { return entry.topY * k; }, bones: { root: bRoot, spine: bSpine, head: bHead, armL: bArmL, armR: bArmR, legL: bLegL, legR: bLegR },
    get disposed() { return disposed; },
    setAnim(name, opts) { return anim.setAnim(name, opts); },
    /** Blickziel (Weltkoordinaten) oder null. */
    lookAt(x, y, z) { lookTarget = x === null || x === undefined ? null : { x, y, z }; },
    say(text, ms = 3800) { if (hooks.say) hooks.say(handle, text, ms); },
    /** Treffer: taumeln + kleiner Rückstoß entlang dir (xz). */
    hitReact(dir) {
      anim.setAnim('stagger', { restart: true, then: 'idle' });
      if (dir) { const l = Math.hypot(dir.x, dir.z) || 1; recoil = { x: (dir.x / l) * 1.6, z: (dir.z / l) * 1.6 }; }
    },
    setUmbrella(on) {
      if (!!on !== fx.umb) { fx = { ...fx, umb: !!on }; if (fx.detail) swapGeo(); } // Cache-Schlüssel ändert sich nur mit Detail
      if (on && !umbrella) {
        if (!umbrellaMat) umbrellaMat = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
        umbrella = new Mesh(umbrellaGeometry(look.umbrellaColor || [0.85, 0.2, 0.25]), umbrellaMat);
        umbrella.position.set(0.28, 0.95, -0.46);
        rig.add(umbrella);
      } else if (!on && umbrella) { rig.remove(umbrella); umbrella = null; }
    },
    hasUmbrella: () => !!umbrella,
    /** Namensschild über dem Kopf (Mehrspieler). */
    setName(text) {
      if (tag) { rig.remove(tag); tag.material.map.dispose(); tag.material.dispose(); tag.geometry.dispose(); tag = null; }
      if (!text) return;
      tag = new Mesh(quad({ w: 0.6, h: 0.15 }), new MeshBasicMaterial({ map: nameTexture(text), transparent: true, depthWrite: false }));
      tag.position.set(0, tagY(), 0);
      rig.add(tag);
    },
    /** Kopfposition (Welt) für Sprechblasen. */
    headWorld(out = tmp) { return out.set(root.position.x, root.position.y + headY(), root.position.z); },
    /** Gesichtsmitte (Welt, Augenhöhe) über den Kopf-Bone: folgt Größe, Animation (Taumeln, K.O.) und Blickdrehung. Ziel für den Laser (1.18.1). */
    faceWorld(out = tmp) { bHead.updateWorldMatrix(true, false); return bHead.localToWorld(out.set(0, FACE_UP, 0)); },
    /**
     * Look tauschen: nur die Geometrie wird ersetzt, Bones/Skelett bleiben; Rig-Skalierung (height/build) wird neu gesetzt.
     * Namensschild wandert mit der neuen Oberkante.
     */
    setLook(next) {
      if (disposed || !next) return;
      const old = entry;
      entry = acquire(next, ego, handItem, fx);
      handle.look = next;
      look = next;
      mesh.geometry = entry.g;
      release(old);
      applyScale();
      if (tag) tag.position.set(0, tagY(), 0);
    },
    /** Ego-Variante (Ich-Sicht): Kopf- und Arm-Bones auf Skalierung 0, enge Hüllkugel; v2: eigene Geometrie nur mit Beinen/Schuhen/Hüfte und gekippt, sonst Rig 0,12 m nach hinten. */
    setEgo(on) {
      ego = !!on;
      // v2: nur Beine, Schuhe und Hüfte (eigene Geometrie); alter Pfad: Kopf/Arme per Bone-Skalierung weg (unverändert)
      swapGeo();
      const s = ego ? 0 : 1;
      bHead.scale.set(s, s, s);
      bArmL.scale.set(s, s, s);
      bArmR.scale.set(s, s, s);
      mesh.boundingSphere = ego ? new Sphere(new Vector3(0, 0.5, 0), 0.55) : new Sphere(new Vector3(0, 0.95, 0), 1.6);
      egoPlace();
    },
    isEgo: () => ego,
    /**
     * Gegenstand/Waffe an der rechten Hand (Ort: HAND_R), im selben gemergten Mesh (kein zusätzlicher Draw-Call; eigener Cache-Zweig je Gegenstand).
     * IDs: belt, whip, laser, bag, umbrella, shopping, dryer, hanger, candy, popcorn (die letzten zwei: leere Wurfhand). null/unbekannt = Hand leer.
     * Der Gegenstand bleibt über setLook erhalten; in der Ich-Sicht (Arme ausgeblendet) wird er nicht gebaut.
     * @param {string|null} id Gegenstands-ID oder null
     * @returns {string|null} die gesetzte ID, null wenn die Hand leer ist
     */
    setHandItem(id) {
      if (disposed) return null;
      const want = typeof id === 'string' && HAND_ITEMS.includes(id) ? id : null;
      if (want === handItem) return handItem;
      handItem = want;
      swapGeo();
      return handItem;
    },
    getHandItem: () => handItem,
    /**
     * 1.19.0 U4: Detail-Geometrie (Finger, Gürtel, Schuhkappen, Ohren, Brauen …) im selben Mesh (kein Draw-Call mehr; Cache-Zweig '|d'). Idempotent.
     * @returns {boolean} aktueller Zustand
     */
    setDetail(on) {
      if (disposed) return false;
      const want = !!on;
      if (want !== fx.detail) { fx = { ...fx, detail: want }; swapGeo(); }
      return fx.detail;
    },
    getDetail: () => fx.detail,
    /**
     * 1.19.0 U4: Winterkleidung im selben Mesh (Cache-Zweig '|w'): true = Mütze + Schal, { hat, scarf } einzeln, false/null = aus. Eine Mütze entfällt
     * bei vorhandenem Hut. Idempotent.
     * @returns {{hat:boolean,scarf:boolean}|null} die wirksame Kleidung
     */
    setWinter(on) {
      if (disposed) return null;
      const want = on === true ? { hat: true, scarf: true } : on && typeof on === 'object' ? { hat: !!on.hat, scarf: !!on.scarf } : null;
      const same = (a, b) => (!a && !b) || (a && b && a.hat === b.hat && a.scarf === b.scarf);
      if (!same(want, fx.winter)) { fx = { ...fx, winter: want && (want.hat || want.scarf) ? want : null }; swapGeo(); }
      return effectiveWinter(look, fx.winter);
    },
    getWinter: () => effectiveWinter(look, fx.winter),
    show() { root.visible = true; },
    hide() { root.visible = false; },
    /** Netzzustand { x, y, z (mm), yaw (0,01), v, a, p, s, t }. */
    getNetState() { return { x: r3(root.position.x), y: r3(root.position.y), z: r3(root.position.z), yaw: r2(root.rotation.y), ...anim.getNetState() }; },
    /** Fremden Zustand übernehmen (Interpolation in update; Sprung bei > 3 m). */
    applyRemote(s) {
      if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.z)) return false;
      anim.applyNetState(s);
      const y = Number.isFinite(s.y) ? s.y : 0;
      if (!remote || Math.hypot(s.x - root.position.x, s.z - root.position.z) > 3) { root.position.set(s.x, y, s.z); root.rotation.y = Number.isFinite(s.yaw) ? s.yaw : 0; }
      remote = { x: s.x, y, z: s.z, yaw: Number.isFinite(s.yaw) ? s.yaw : root.rotation.y };
      return true;
    },
    isRemote: () => !!remote,
    update(dt, camera) {
      if (disposed || !(dt > 0)) return;
      const pose = anim.step(dt);
      if (remote) {
        const a = 1 - Math.exp(-12 * dt);
        root.position.x += (remote.x - root.position.x) * a;
        root.position.y += (remote.y - root.position.y) * a;
        root.position.z += (remote.z - root.position.z) * a;
        root.rotation.y += angDiff(root.rotation.y, remote.yaw) * a;
      }
      // Blick: Kopf dreht zum Ziel (relativ zur Körperrichtung, ±1,0 rad)
      let want = 0;
      if (lookTarget) {
        const yaw = Math.atan2(-(lookTarget.x - root.position.x), -(lookTarget.z - root.position.z));
        want = Math.max(-1, Math.min(1, angDiff(root.rotation.y, yaw)));
      }
      headOff += (want - headOff) * Math.min(1, dt * 7);
      bRoot.position.y = pose.bob - pose.hipDrop;
      bRoot.rotation.z = pose.roll;
      bSpine.rotation.x = -pose.lean;
      bHead.rotation.set(-pose.headX, pose.headY + headOff, 0);
      bArmL.rotation.set(pose.armLx, 0, -pose.armLz);
      if (umbrella) bArmR.rotation.set(1.0, 0, 0.18); else bArmR.rotation.set(pose.armRx, 0, pose.armRz);
      bLegL.rotation.x = pose.legLx;
      bLegR.rotation.x = pose.legRx;
      if (recoil.x || recoil.z) {
        rig.position.set(recoil.x * 0.12, 0, baseZ + recoil.z * 0.12);
        recoil = Math.hypot(recoil.x, recoil.z) < 0.02 ? { x: 0, z: 0 } : { x: recoil.x * Math.exp(-dt * 4), z: recoil.z * Math.exp(-dt * 4) };
        if (!recoil.x && !recoil.z) rig.position.set(0, 0, baseZ);
      }
      if (tag && camera) { camera.getWorldPosition(tmp); tag.lookAt(tmp); }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      liveSet.delete(handle);
      handle.setUmbrella(false);
      handle.setName(null);
      if (root.parent) root.parent.remove(root);
      mesh.skeleton.dispose();
      release(entry);
    },
  };
  liveSet.add(handle);
  if (hooks.ego) handle.setEgo(true);
  if (hooks.name) handle.setName(hooks.name);
  return handle;
}
