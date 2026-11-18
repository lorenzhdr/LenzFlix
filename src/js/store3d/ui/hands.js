// VIDEOTHEK LENZ · Hände vor der Kamera (nur 2D): Schlag-Schwung (Faust), getragene Hülle unten rechts, Wurf-Schwung,
// Waffen (1.18.0): Gürtel (flacher Hieb), Peitsche (Überkopf-Hieb mit laufender Welle), Laser-Pointer (Gerät mit Leuchtpunkt, solange er an ist).
// Hängt als Gruppe an der Kamera, ohne Tiefentest (wie die Halte-Ebene); in VR nie sichtbar (setVisible(false)).
import { Group, Mesh, BoxGeometry, SphereGeometry, MeshBasicMaterial, CanvasTexture, SRGBColorSpace } from 'three';

export const SWING_DUR = 0.28;
/** Dauer des Hiebs je Waffe in s (hand = Faust; der Laser schlägt nicht). */
export const SWING_DURS = { hand: SWING_DUR, belt: 0.36, whip: 0.55 };
export const HELD_WEAPONS = ['belt', 'whip', 'laser'];
const WEAPON_POS = [0.27, -0.27, -0.44];
const LEATHER = 0x52341e;
const STEEL = 0xbcc2cc;
const WHIP_SEGS = 7;
const THROW_DUR = 0.35;
const CARRY_POS = [0.24, -0.2, -0.42];
const SIDE = { vhs: 0xe2d8bd, dvd: 0x1d3f9c, box: 0xc9a227 };
const SIZE = { vhs: [0.1, 0.19, 0.03], dvd: [0.12, 0.17, 0.02], box: [0.14, 0.19, 0.05] };

const sin01 = (p) => Math.sin(Math.PI * Math.min(1, Math.max(0, p)));

export function createHands(camera) {
  const group = new Group();
  group.name = 'lfx-hands';
  const fistMat = new MeshBasicMaterial({ color: 0xe8b894, depthTest: false, transparent: true });
  const fist = new Mesh(new BoxGeometry(0.09, 0.09, 0.17), fistMat);
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
  let weapon = null; // { id, group, geos, mats, segs?, glow?, halo? }
  let laserOn = false;
  let clock = 0;
  const weaponGroup = new Group();
  weaponGroup.position.set(...WEAPON_POS);
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
    weaponGroup.remove(weapon.group);
    for (const g of weapon.geos) g.dispose();
    for (const m of weapon.mats) m.dispose();
    weapon = null;
    weaponGroup.visible = false;
    weaponGroup.rotation.set(0, 0, 0);
    weaponGroup.position.set(...WEAPON_POS);
  }

  /** Waffe bauen: kleine Quader/Kugeln ohne Tiefentest (wie die Faust), alles in einer Gruppe, Teile fürs Aufräumen gesammelt. */
  function buildWeapon(id) {
    const g = new Group();
    const geos = [];
    const mats = [];
    const mat = (color, op = 1) => { const m = new MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: op }); mats.push(m); return m; };
    const part = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
      geos.push(geo);
      const mesh = new Mesh(geo, m);
      mesh.renderOrder = 998;
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      g.add(mesh);
      return mesh;
    };
    const w = { id, group: g, geos, mats };
    if (id === 'belt') {
      // Schnalle vorn (die Hand packt dort), der Riemen hängt nach hinten-unten
      const lm = mat(LEATHER);
      part(new BoxGeometry(0.035, 0.012, 0.2), lm, 0, 0, 0.09, 0.15);
      part(new BoxGeometry(0.035, 0.012, 0.16), lm, 0, -0.03, 0.24, 0.55);
      part(new BoxGeometry(0.05, 0.04, 0.025), mat(STEEL), 0, 0.005, -0.015);
      part(new BoxGeometry(0.03, 0.025, 0.03), mat(0x6f7480), 0, 0.005, -0.016);
    } else if (id === 'whip') {
      // Griff, danach eine Kette aus Segmenten (verschachtelte Gruppen): so läuft die Welle beim Hieb von der Hand zur Spitze
      part(new BoxGeometry(0.03, 0.03, 0.17), mat(0x2f2018), 0, 0, 0.02);
      part(new BoxGeometry(0.036, 0.036, 0.02), mat(STEEL), 0, 0, -0.07);
      const lm = mat(LEATHER);
      const segs = [];
      let parent = g;
      for (let i = 0; i < WHIP_SEGS; i++) {
        const sg = new Group();
        sg.position.set(0, 0, i === 0 ? -0.08 : -(0.11 - (i - 1) * 0.006));
        parent.add(sg);
        const len = 0.11 - i * 0.006;
        const t = 0.014 - i * 0.0013;
        const bg = new BoxGeometry(t, t, len);
        geos.push(bg);
        const m = new Mesh(bg, lm);
        m.renderOrder = 998;
        m.position.z = -len / 2;
        sg.add(m);
        sg.rotation.x = -0.14;
        segs.push(sg);
        parent = sg;
      }
      w.segs = segs;
    } else if (id === 'laser') {
      part(new BoxGeometry(0.026, 0.026, 0.15), mat(0x1c1f29), 0, 0, 0);
      part(new BoxGeometry(0.03, 0.03, 0.03), mat(0xcc2024), 0, 0, 0.055);
      part(new BoxGeometry(0.02, 0.02, 0.02), mat(0xff6a5a), 0, 0, -0.082);
      w.glow = part(new SphereGeometry(0.009, 8, 6), mat(0xff3b30), 0, 0, -0.098);
      w.halo = part(new SphereGeometry(0.02, 8, 6), mat(0xff6a5a, 0.35), 0, 0, -0.098);
      w.glow.visible = false;
      w.halo.visible = false;
    }
    return w;
  }

  const reduced = () => typeof matchMedia === 'function' && !!matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Waffe pro Bild: Ruhelage mit leichtem Atmen, Hieb je Waffe, Laser: Pulsieren des Punkts (nicht bei reduzierter Bewegung). */
  function updateWeapon() {
    const id = weapon.id;
    const wg = weaponGroup;
    const breathe = reduced() ? 0 : Math.sin(clock * 1.7) * 0.004;
    if (id === 'belt') {
      const p = swingT > 0 && swingKind === 'belt' ? 1 - swingT / swingDur : 0;
      const e = sin01(p);
      // flacher Hieb von rechts nach links: Gruppe dreht um y, der Riemen schlägt vor
      wg.position.set(WEAPON_POS[0] - 0.5 * p + 0.1 * e, WEAPON_POS[1] + 0.1 * e + breathe, WEAPON_POS[2] - 0.12 * e);
      wg.rotation.set(0.5 * (1 - e) - 0.2 * e, -0.2 - 1.5 * p + 0.5 * e, 0.4 * (1 - e));
    } else if (id === 'whip') {
      const p = swingT > 0 && swingKind === 'whip' ? 1 - swingT / swingDur : 0;
      // Überkopf: Ausholen (0-35 %) nach oben-hinten, dann in einem Bogen nach vorn-unten durchziehen
      const slash = p < 0.35 ? 0 : (p - 0.35) / 0.65;
      const rx = p === 0 ? 0.2 : p < 0.35 ? 0.2 + 1.1 * (p / 0.35) : 1.3 - 2.0 * Math.sin(Math.min(1, slash * 1.2) * Math.PI * 0.5) + 0.5 * slash;
      wg.position.set(WEAPON_POS[0] - 0.12 * sin01(p), WEAPON_POS[1] + 0.2 * sin01(p) + breathe, WEAPON_POS[2] - 0.05 * sin01(slash));
      wg.rotation.set(rx, -0.15, 0.1);
      const crack = p > 0 ? 0.55 : 0.04;
      weapon.segs.forEach((sg, i) => {
        const lag = Math.max(0, slash * 1.4 - i * 0.11);
        sg.rotation.x = -0.14 + (p > 0 ? Math.sin(Math.min(1, lag) * Math.PI) * crack * (i % 2 ? -1 : 1) : (reduced() ? 0 : Math.sin(clock * 2.2 + i * 0.7) * crack * 0.3));
      });
    } else if (id === 'laser') {
      // Pointer nach vorn gerichtet, Leuchtpunkt pulsiert, solange er an ist
      wg.position.set(WEAPON_POS[0] - 0.04, WEAPON_POS[1] + 0.05 + breathe, WEAPON_POS[2] + 0.02);
      wg.rotation.set(0.1, 0.12, 0);
      if (laserOn) {
        const pulse = reduced() ? 1 : 1 + Math.sin(clock * 14) * 0.18;
        weapon.glow.scale.setScalar(pulse);
        weapon.halo.scale.setScalar(pulse * 1.1);
      }
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
      if (weapon && weapon.glow) { weapon.glow.visible = laserOn; weapon.halo.visible = laserOn; }
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
          weaponGroup.add(weapon.group);
        }
        weaponGroup.visible = true;
        if (weapon.glow) { weapon.glow.visible = laserOn; weapon.halo.visible = laserOn; }
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
      if (weapon) updateWeapon();
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
