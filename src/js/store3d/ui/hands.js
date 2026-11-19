// VIDEOTHEK LENZ · Hände vor der Kamera (nur 2D): Schlag-Schwung (Faust), getragene Hülle unten rechts, Wurf-Schwung,
// Waffen (1.18.0): Gürtel (flacher Hieb), Peitsche (Überkopf-Hieb mit laufender Welle), Laser-Pointer (Gerät mit Leuchtpunkt, solange er an ist).
// createHands(camera, { quality() → 'low'|'mid'|'high' }): bei low blendet ein leuchtender Laser sein Gerät aus (0 Draw-Calls zusätzlich).
// Hängt als Gruppe an der Kamera, ohne Tiefentest (wie die Halte-Ebene); in VR nie sichtbar (setVisible(false)).
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, CanvasTexture, SRGBColorSpace, Matrix4, Quaternion, Vector3, Euler, DynamicDrawUsage, Float32BufferAttribute, Color } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const SWING_DUR = 0.28;
/** Dauer des Hiebs je Waffe in s (hand = Faust; der Laser schlägt nicht). */
export const SWING_DURS = { hand: SWING_DUR, belt: 0.36, whip: 0.55 };
export const HELD_WEAPONS = ['belt', 'whip', 'laser'];
const WEAPON_POS = [0.27, -0.27, -0.44];
/**
 * Ruhelage der Waffe in Kamerakoordinaten je Bildformat (1.19.0): Desktop unverändert (x höchstens knapp die halbe Bildhälfte rechts).
 * Touch: näher an der Bildmitte, damit die Waffe weder aus dem Bild ragt (hochkant, Sichtfeld breit/Bild schmal) noch unter der Knopfspalte rechts liegt.
 */
export function weaponPos(fovDeg, aspect, touch) {
  const f = Number(fovDeg) > 0 ? Number(fovDeg) : 70;
  const a = Number(aspect) > 0 ? Number(aspect) : 16 / 9;
  const halfW = Math.tan((f * Math.PI) / 360) * a * Math.abs(WEAPON_POS[2]);
  const x = touch ? Math.min(WEAPON_POS[0], 0.15 * halfW) : Math.min(WEAPON_POS[0], 0.5 * halfW);
  return [x, WEAPON_POS[1], WEAPON_POS[2]];
}
const BELT_A = 0x8a5a30; // Leder (abwechselnd zwei Töne, damit die Stücke lesbar bleiben)
const BELT_B = 0x74482a;
const STEEL = 0xe3e7ee;
const WHIP_SEGS = 12;
const WHIP_ROT = -0.08; // Grundkrümmung je Segment (Summe ≈ −0,96 rad wie vorher mit 7 Segmenten)
const WHIP_LEN = (i) => 0.068 - i * 0.0028;
const BELT_C = 0xc79a5c; // Ziernaht
const BELT_D = 0x2a1a0e; // Lochreihe
const STEEL_D = 0xa7aebb;
const THROW_DUR = 0.35;
const CARRY_POS = [0.24, -0.2, -0.42];
const SIDE = { vhs: 0xe2d8bd, dvd: 0x1d3f9c, box: 0xc9a227 };
const SIZE = { vhs: [0.1, 0.19, 0.03], dvd: [0.12, 0.17, 0.02], box: [0.14, 0.19, 0.05] };

const _e = new Euler();
const _q = new Quaternion();
const _p = new Vector3();
const _m1 = new Matrix4();
const _id = new Matrix4();
const _s1 = new Vector3(1, 1, 1);
const _c = new Color();
/** Hex-Farbe (sRGB) als Vertexfarbe; Color rechnet in den Arbeitsfarbraum, das Material gibt sie wieder korrekt aus. */
function paintGeo(g, hex) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  _c.setHex(hex);
  for (let i = 0; i < n; i++) { c[i * 3] = _c.r; c[i * 3 + 1] = _c.g; c[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new Float32BufferAttribute(c, 3));
}

/** Eine Box als Teil einer später gemergten Geometrie (nur Position + Vertexfarbe, optional gedreht). */
function boxPart(list, w, h, d, x, y, z, color, o = {}) {
  const g = new BoxGeometry(w, h, d);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  if (o.rx || o.ry || o.rz) { _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e); g.applyQuaternion(_q); }
  g.translate(x, y, z);
  paintGeo(g, color);
  list.push({ g, n: g.attributes.position.count, seg: o.seg === undefined ? -1 : o.seg, lens: !!o.lens });
}

/** Teile zu EINER Geometrie mergen (Teile werden entsorgt; Eckpunktzahl je Teil steht in list[i].n). */
function mergeList(list) {
  const geo = mergeGeometries(list.map((q) => q.g), false);
  list.forEach((q) => q.g.dispose());
  return geo;
}

/**
 * Faust (1.19.0): Handrücken, Handgelenk, Knöchelreihe, 4 Finger aus je 2 Gliedern (vorn, dann nach unten) und Daumen quer davor,
 * Hautton je Teil leicht abgestuft (Vertexfarbe). EIN Mesh; Maße im Rahmen der alten 0,09 × 0,09 × 0,17-Box.
 */
function buildFistGeometry() {
  const list = [];
  const p = (w, h, d, x, y, z, c) => boxPart(list, w, h, d, x, y, z, c);
  p(0.09, 0.07, 0.09, 0, 0.005, 0.04, 0xecbd9b); // Handrücken
  p(0.07, 0.06, 0.04, 0, 0, 0.085, 0xdfa985); // Handgelenk
  const stag = [0.0, 0.004, 0.005, 0.001];
  for (let i = 0; i < 4; i++) {
    const x = -0.03375 + i * 0.0225;
    const L = [0.044, 0.05, 0.047, 0.04][i];
    p(0.022, 0.022, 0.024, x, 0.044 + stag[i], -0.008, i % 2 ? 0xdba580 : 0xe3ae8a); // Knöchel, leicht gestuft
    p(0.02, 0.026, L, x, 0.031 + stag[i] * 0.5, -0.008 - L / 2 - 0.006, i % 2 ? 0xe6b490 : 0xebbb97); // vorderes Fingerglied
    p(0.019, 0.042 - (i % 2) * 0.003, 0.02, x, 0.008, -0.008 - L - 0.016, 0xd9a47e); // Mittelglied nach unten
  }
  p(0.026, 0.026, 0.05, -0.05, 0.0, 0.012, 0xe2ae8a); // Daumenballen
  p(0.062, 0.022, 0.026, -0.016, -0.012, -0.066, 0xe6b28e); // Daumen quer vor den Fingern
  const geo = mergeList(list);
  // Mittelpunkt auf den Ursprung (wie die alte mittige Box), damit Ruhelage und Hieb-Bogen unverändert sitzen
  geo.computeBoundingBox();
  const c = geo.boundingBox.getCenter(new Vector3());
  geo.translate(-c.x, -c.y, -c.z);
  geo.computeBoundingBox();
  return geo;
}

const LENS_ON = new Color(0xff5a46).toArray();
const LENS_OFF = new Color(0x6a2222).toArray();

const sin01 = (p) => Math.sin(Math.PI * Math.min(1, Math.max(0, p)));

export function createHands(camera, opts = {}) {
  const quality = typeof opts.quality === 'function' ? opts.quality : () => 'mid';
  const group = new Group();
  group.name = 'lfx-hands';
  const fistMat = new MeshBasicMaterial({ vertexColors: true, depthTest: false, transparent: true });
  const fist = new Mesh(buildFistGeometry(), fistMat);
  fist.renderOrder = 998;
  fist.visible = false;
  group.add(fist);
  const carryGroup = new Group();
  carryGroup.position.set(...CARRY_POS);
  carryGroup.visible = false;
  group.add(carryGroup);
  camera.add(group);

  let swingT = 0;
  let swingDur = SWING_DUR;
  let swingKind = 'hand';
  let weapon = null; // { id, mesh, geo, mat, segs?, lensAt? }
  let laserOn = false;
  let clock = 0;
  const weaponGroup = new Group();
  let wpos = WEAPON_POS;
  const coarse = () => typeof matchMedia === 'function' && !!matchMedia('(pointer: coarse)').matches;
  // Lage nur neu berechnen, wenn sich fov/Seitenverhältnis ändern (resize/Drehen); matchMedia nicht pro Bild.
  let placedFov = NaN;
  let placedAspect = NaN;
  const placeWeapon = () => {
    if (camera.fov === placedFov && camera.aspect === placedAspect) return;
    placedFov = camera.fov;
    placedAspect = camera.aspect;
    wpos = weaponPos(camera.fov, camera.aspect, coarse());
  };
  weaponGroup.position.set(...wpos);
  weaponGroup.visible = false;
  group.add(weaponGroup);
  let throwT = 0;
  let carried = null; // { mesh, tex }
  let visible = true;

  function clearCarried() {
    if (!carried) return;
    carryGroup.remove(carried.mesh);
    carried.mesh.geometry.dispose();
    for (const m of carried.mats) m.dispose();
    if (carried.tex) carried.tex.dispose();
    carried = null;
    carryGroup.visible = false;
  }

  function clearWeapon() {
    if (!weapon) return;
    weaponGroup.remove(weapon.mesh);
    weapon.geo.dispose();
    weapon.mat.dispose();
    weapon = null;
    weaponGroup.visible = false;
    weaponGroup.rotation.set(0, 0, 0);
    placeWeapon();
    weaponGroup.position.set(...wpos);
  }

  /**
   * Waffe bauen (1.18.0, Draw-Call-Budget): EINE Geometrie mit Vertexfarbe und EIN Mesh je Waffe (ohne Tiefentest, wie die Faust).
   * Die Peitsche bleibt animiert: ihre Segmente werden pro Bild auf der CPU gegen die Segmentkette neu berechnet (Matrix je Segment),
   * die Laser-Linse (kleine Box an der Spitze) pulsiert und leuchtet ebenfalls über Vertexdaten – kein Zusatzmesh für Glow/Halo.
   */
  function buildWeapon(id) {
    const list = []; // { g, seg, lens }
    const part = (w, h, d, x, y, z, color, o = {}) => boxPart(list, w, h, d, x, y, z, color, o);
    const w = { id, mesh: null, segs: null, lens: null, wave: null };
    if (id === 'belt') {
      // Schlaufe: beide Enden in der Faust (Schnalle unten), der Riemen steigt als Ring aus 10 flachen Stücken nach oben-vorn auf, ein Ende hängt heraus
      const R = 0.075;
      const N = 10;
      const cy = 0.02 + R;
      const pt = (k) => [Math.sin((k / N) * Math.PI * 2) * R, cy - Math.cos((k / N) * Math.PI * 2) * R];
      for (let k = 0; k < N; k++) {
        const [x0, y0] = pt(k);
        const [x1, y1] = pt(k + 1);
        const len = Math.hypot(x1 - x0, y1 - y0) + 0.004;
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        const rz = Math.atan2(y1 - y0, x1 - x0);
        part(len, 0.012, 0.034, mx, my, 0, k % 2 ? BELT_B : BELT_A, { rz });
        // Ziernaht: zwei dünne Streifen (dritte Lederfarbe) längs der Außenkante
        const nl = Math.hypot(mx, my - cy) || 1;
        const ox = (mx / nl) * 0.0066;
        const oy = ((my - cy) / nl) * 0.0066;
        for (const sz of [-0.012, 0.012]) part(len - 0.006, 0.0025, 0.0035, mx + ox, my + oy, sz, BELT_C, { rz });
        // Lochreihe (obere Hälfte): kleine dunkle Boxen, ragen leicht durch den Riemen
        if (k >= 3 && k <= 7) part(0.006, 0.0145, 0.008, mx, my, 0, BELT_D, { rz: rz + Math.PI / 2 });
        // Schlaufe (Keeper) um den Riemen nahe der Schnalle
        if (k === 1) part(0.012, 0.017, 0.038, mx, my, 0, BELT_B, { rz });
      }
      // Schnalle: Rahmen mit Dorn
      part(0.06, 0.011, 0.042, 0, 0.032, 0, STEEL);
      part(0.06, 0.011, 0.042, 0, -0.018, 0, STEEL);
      part(0.011, 0.061, 0.042, -0.0245, 0.007, 0, STEEL);
      part(0.011, 0.061, 0.042, 0.0245, 0.007, 0, STEEL);
      part(0.006, 0.05, 0.03, 0, 0.007, 0.004, 0xeef1f6);
      part(0.022, 0.006, 0.012, 0.008, 0.032, 0.02, 0xeef1f6); // Dorn über den Rahmensteg
      part(0.007, 0.012, 0.012, 0, 0.02, 0.02, STEEL_D); // Dornspitze
      // freies Ende mit Spitze
      part(0.034, 0.1, 0.012, 0.04, -0.06, 0, BELT_A, { rz: 0.35 });
      part(0.034, 0.05, 0.012, 0.07, -0.135, 0, BELT_B, { rz: 0.6 });
      part(0.02, 0.026, 0.012, 0.094, -0.168, 0, BELT_A, { rz: 0.8 });
    } else if (id === 'whip') {
      // Griff mit Wicklung, Knauf und Parierstück, danach eine Kette aus Segmenten: so läuft die Welle beim Hieb von der Hand zur Spitze
      part(0.03, 0.03, 0.17, 0, 0, 0.02, 0x4a3326);
      for (let k = 0; k < 8; k++) part(0.034, 0.034, 0.011, 0, 0, -0.056 + k * 0.021, k % 2 ? 0x2c1c12 : 0x8f6a45); // Griffwicklung
      part(0.042, 0.042, 0.026, 0, 0, 0.115, STEEL); // Knauf
      part(0.06, 0.016, 0.012, 0, 0, -0.07, STEEL); // Parierstück
      part(0.016, 0.06, 0.012, 0, 0, -0.07, STEEL_D);
      w.segs = [];
      w.segM = [];
      for (let i = 0; i < WHIP_SEGS; i++) {
        const len = WHIP_LEN(i);
        const t = Math.max(0.0042, 0.014 - i * 0.0009);
        part(t, t, len, 0, 0, -len / 2, i % 2 ? BELT_B : BELT_A, { seg: i });
        w.segs.push({ rot: WHIP_ROT, z: i === 0 ? -0.08 : -WHIP_LEN(i - 1) });
        w.segM.push(new Matrix4());
      }
      // Knall-Ende: drei kleine Fransen am letzten Segment (laufen mit ihm mit)
      const last = WHIP_SEGS - 1;
      const ll = WHIP_LEN(last);
      part(0.008, 0.008, 0.02, 0, 0, -ll - 0.008, 0x2c1c12, { seg: last });
      part(0.005, 0.005, 0.026, 0.006, 0.003, -ll - 0.024, 0xd8c6a4, { seg: last, ry: 0.25 });
      part(0.005, 0.005, 0.03, -0.006, -0.003, -ll - 0.026, 0xd8c6a4, { seg: last, ry: -0.25 });
    } else if (id === 'laser') {
      part(0.026, 0.026, 0.15, 0, 0, 0, 0x2c3040); // Gehäuse
      for (const z of [0.0, 0.016, 0.032]) part(0.03, 0.03, 0.007, 0, 0, z, 0x1d212d); // Griffrillen
      part(0.03, 0.03, 0.03, 0, 0, 0.055, 0xcc2024);
      part(0.008, 0.012, 0.07, 0, 0.019, 0.02, STEEL_D); // Clip
      part(0.008, 0.008, 0.006, 0, 0.019, -0.016, STEEL_D);
      part(0.012, 0.01, 0.016, 0, -0.016, -0.03, 0xe8e2d0); // Taster
      part(0.02, 0.02, 0.02, 0, 0, -0.082, 0xaeb4c2);
      part(0.028, 0.028, 0.006, 0, 0, -0.092, 0x70778a); // Linsenfassung
      part(0.016, 0.016, 0.016, 0, 0, -0.098, 0xff3b30, { lens: true }); // Linse bleibt das LETZTE Teil (24 Eckpunkte)
    }
    const geo = mergeList(list);
    const n = geo.attributes.position.count;
    w.segOf = new Int8Array(n);
    w.lensAt = [];
    let at = 0; // kumulierte Eckpunkt-Offsets: Teile dürfen unterschiedlich viele Eckpunkte haben
    for (const q of list) {
      for (let v = 0; v < q.n; v++, at++) { w.segOf[at] = q.seg; if (q.lens) w.lensAt.push(at); }
    }
    w.base = new Float32Array(geo.attributes.position.array);
    w.colorBase = new Float32Array(geo.attributes.color.array);
    geo.attributes.position.setUsage(DynamicDrawUsage);
    if (w.segs || w.lensAt.length) geo.attributes.color.setUsage(DynamicDrawUsage);
    const mat = new MeshBasicMaterial({ vertexColors: true, depthTest: false, transparent: true });
    const mesh = new Mesh(geo, mat);
    mesh.renderOrder = 998;
    mesh.frustumCulled = false;
    mesh.name = 'lfx-hands-' + id;
    w.mesh = mesh;
    w.geo = geo;
    w.mat = mat;
    if (w.lensAt.length) {
      let cx = 0; let cy = 0; let cz = 0;
      for (const v of w.lensAt) { cx += w.base[v * 3]; cy += w.base[v * 3 + 1]; cz += w.base[v * 3 + 2]; }
      w.lensC = [cx / w.lensAt.length, cy / w.lensAt.length, cz / w.lensAt.length];
    }
    return w;
  }

  /** Peitsche: Segmentkette → pro Eckpunkt die Matrix seines Segments (Kette relativ zur Waffengruppe). */
  function skinWhip(wp) {
    const mats = wp.segM;
    for (let i = 0; i < wp.segs.length; i++) {
      const sg = wp.segs[i];
      _e.set(sg.rot, 0, 0);
      _q.setFromEuler(_e);
      _p.set(0, 0, sg.z);
      mats[i].multiplyMatrices(i ? mats[i - 1] : _id, _m1.compose(_p, _q, _s1));
    }
    const pos = wp.geo.attributes.position.array;
    for (let v = 0; v < wp.segOf.length; v++) {
      const s = wp.segOf[v];
      if (s < 0) continue;
      _p.set(wp.base[v * 3], wp.base[v * 3 + 1], wp.base[v * 3 + 2]).applyMatrix4(mats[s]);
      pos[v * 3] = _p.x; pos[v * 3 + 1] = _p.y; pos[v * 3 + 2] = _p.z;
    }
    wp.geo.attributes.position.needsUpdate = true;
  }

  /** Laser-Linse: Farbe an/aus, Pulsieren der Größe um den Linsenmittelpunkt. */
  function paintLens(wp, k) {
    const col = wp.geo.attributes.color.array;
    const pos = wp.geo.attributes.position.array;
    const on = laserOn;
    for (const v of wp.lensAt) {
      const i = v * 3;
      if (on) { col[i] = LENS_ON[0]; col[i + 1] = LENS_ON[1]; col[i + 2] = LENS_ON[2]; } else { col[i] = LENS_OFF[0]; col[i + 1] = LENS_OFF[1]; col[i + 2] = LENS_OFF[2]; }
      const s = on ? k : 1;
      pos[i] = wp.lensC[0] + (wp.base[i] - wp.lensC[0]) * s;
      pos[i + 1] = wp.lensC[1] + (wp.base[i + 1] - wp.lensC[1]) * s;
      pos[i + 2] = wp.lensC[2] + (wp.base[i + 2] - wp.lensC[2]) * s;
    }
    wp.geo.attributes.color.needsUpdate = true;
    wp.geo.attributes.position.needsUpdate = true;
  }

  const reduced = () => typeof matchMedia === 'function' && !!matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Waffe pro Bild: Ruhelage mit leichtem Atmen, Hieb je Waffe, Laser: Pulsieren des Punkts (nicht bei reduzierter Bewegung). */
  function updateWeapon() {
    const id = weapon.id;
    const wg = weaponGroup;
    placeWeapon();
    const breathe = reduced() ? 0 : Math.sin(clock * 1.7) * 0.004;
    if (id === 'belt') {
      const p = swingT > 0 && swingKind === 'belt' ? 1 - swingT / swingDur : 0;
      const e = sin01(p);
      // flacher Hieb von rechts nach links: Gruppe dreht um y, der Riemen schlägt vor
      wg.position.set(wpos[0] - 0.04 * (1 - e) - 0.5 * p + 0.1 * e, wpos[1] + 0.1 * (1 - e) + 0.1 * e + breathe, wpos[2] - 0.12 * e); // Ruhelage etwas höher: die Schlaufe soll ganz im Bild stehen
      wg.rotation.set(0.5 * (1 - e) - 0.2 * e, -0.2 - 1.5 * p + 0.5 * e, 0.4 * (1 - e));
    } else if (id === 'whip') {
      const p = swingT > 0 && swingKind === 'whip' ? 1 - swingT / swingDur : 0;
      // Überkopf: Ausholen (0-35 %) nach oben-hinten, dann in einem Bogen nach vorn-unten durchziehen
      const slash = p < 0.35 ? 0 : (p - 0.35) / 0.65;
      const rx = p === 0 ? 0.2 : p < 0.35 ? 0.2 + 1.1 * (p / 0.35) : 1.3 - 2.0 * Math.sin(Math.min(1, slash * 1.2) * Math.PI * 0.5) + 0.5 * slash;
      wg.position.set(wpos[0] - 0.12 * sin01(p), wpos[1] + 0.2 * sin01(p) + breathe, wpos[2] - 0.05 * sin01(slash));
      wg.rotation.set(rx, -0.15, 0.1);
      const crack = p > 0 ? 0.4 : 0.03;
      weapon.segs.forEach((sg, i) => {
        const lag = Math.max(0, slash * 1.4 - i * 0.065);
        sg.rot = WHIP_ROT + (p > 0 ? Math.sin(Math.min(1, lag) * Math.PI) * crack * (i % 2 ? -1 : 1) : (reduced() ? 0 : Math.sin(clock * 2.2 + i * 0.7) * crack * 0.3));
      });
      skinWhip(weapon);
    } else if (id === 'laser') {
      // Pointer nach vorn gerichtet, Leuchtpunkt pulsiert, solange er an ist
      wg.position.set(wpos[0] - 0.04, wpos[1] + 0.05 + breathe, wpos[2] + 0.02);
      wg.rotation.set(0.1, 0.12, 0);
      paintLens(weapon, laserOn && !reduced() ? 1.5 + Math.sin(clock * 14) * 0.3 : laserOn ? 1.5 : 1);
    }
  }

  const api = {
    group,
    get swinging() { return swingT > 0; },
    get carrying() { return !!carried; },
    /** Waffe in der Hand ('belt' | 'whip' | 'laser') oder null. */
    get weapon() { return weapon ? weapon.id : null; },
    get laserOn() { return laserOn; },
    /** Hieb; w ('hand' | 'belt' | 'whip') überschreibt die gehaltene Waffe (Laser und Unbekanntes = Faust). */
    swing(w) {
      const held = weapon && (weapon.id === 'belt' || weapon.id === 'whip') ? weapon.id : 'hand';
      const kind = w === undefined ? held : w === 'belt' || w === 'whip' ? w : 'hand';
      swingKind = kind;
      swingDur = SWING_DURS[kind];
      swingT = swingDur;
    },
    /** Laser an/aus (leuchtet nur mit gehaltenem Laser). */
    setLaser(on) {
      laserOn = !!on;
      if (weapon && weapon.lensAt.length) paintLens(weapon, laserOn ? 1.5 : 1);
    },
    throwAnim() { throwT = THROW_DUR; },
    /**
     * Gehaltener Gegenstand (1.17.0, allgemein; 1.18-Naht für Waffen/Gegenstände):
     * spec { media: 'vhs'|'dvd'|'box', art?: Canvas } oder { weapon: 'belt'|'whip'|'laser' } oder null (nichts in der Hand).
     * Eine Hand: setHeld ersetzt alles bisher Gehaltene.
     */
    setHeld(spec) {
      clearCarried();
      const wid = spec && HELD_WEAPONS.includes(spec.weapon) ? spec.weapon : null;
      if (!wid || !weapon || weapon.id !== wid) clearWeapon();
      if (wid) {
        if (!weapon) {
          weapon = buildWeapon(wid);
          weaponGroup.add(weapon.mesh);
        }
        weaponGroup.visible = true;
        if (weapon.lensAt.length) paintLens(weapon, laserOn ? 1.5 : 1);
        return;
      }
      if (!spec) return;
      const media = SIDE[spec.media] ? spec.media : 'dvd';
      const [w, h, d] = SIZE[media];
      const side = new MeshBasicMaterial({ color: SIDE[media], depthTest: false, transparent: true });
      let tex = null;
      if (spec.art) { tex = new CanvasTexture(spec.art); tex.colorSpace = SRGBColorSpace; }
      const front = new MeshBasicMaterial({ color: tex ? 0xffffff : 0x3a4a78, map: tex, depthTest: false, transparent: true, toneMapped: false });
      const mesh = new Mesh(new BoxGeometry(w, h, d), [side, side, side, side, front, side]);
      mesh.renderOrder = 997;
      mesh.rotation.set(-0.25, -0.45, 0.08);
      carryGroup.add(mesh);
      carried = { mesh, tex, mats: [...new Set([side, front])] };
      carryGroup.visible = true; // Sichtbarkeit insgesamt über group (Hände im Halte-Bild aus, danach wieder an)
    },
    /** Alias für setHeld (bisheriger Name). */
    setCarried(spec) { api.setHeld(spec); },
    setVisible(on) {
      visible = !!on;
      group.visible = visible;
    },
    update(dt) {
      if (!(dt > 0)) return;
      clock += dt;
      if (swingT > 0) swingT = Math.max(0, swingT - dt);
      if (throwT > 0) throwT = Math.max(0, throwT - dt);
      if (weapon) {
        updateWeapon();
        // Draw-Call-Budget bei `low`: zielt der Laser, bleibt nur der Leuchtpunkt (DOM) – das Gerät zeigt ohnehin entlang der Blickachse
        weaponGroup.visible = !(weapon.id === 'laser' && laserOn && quality() === 'low');
      }
      if (swingT > 0 && swingKind !== 'hand') fist.visible = false;
      else if (swingT > 0) {
        const p = 1 - swingT / SWING_DUR;
        fist.visible = true;
        // von rechts unten in einem Bogen nach vorn-links
        fist.position.set(0.3 - 0.36 * p, -0.32 + 0.2 * sin01(p) - 0.04 * p, -0.34 - 0.36 * sin01(p));
        fist.rotation.set(-0.3 * sin01(p), 0.6 * p, 0);
      } else fist.visible = false;
      if (carried) {
        const p = throwT > 0 ? 1 - throwT / THROW_DUR : 0;
        const k = sin01(p);
        carryGroup.position.set(CARRY_POS[0] - 0.2 * k, CARRY_POS[1] + 0.12 * k, CARRY_POS[2] - 0.45 * k);
        carryGroup.rotation.set(-0.6 * k, 0, 0);
      }
    },
    dispose() {
      clearCarried();
      clearWeapon();
      fist.geometry.dispose();
      fistMat.dispose();
      camera.remove(group);
    },
  };
  return api;
}
