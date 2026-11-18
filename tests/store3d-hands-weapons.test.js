// @vitest-environment jsdom
// Ego-Hände mit Waffen (1.18.0): setHeld({weapon}), Hieb je Waffe, Laser-Leuchtpunkt, Aufräumen.
import { describe, it, expect } from 'vitest';
import { PerspectiveCamera } from 'three';
import { createHands, SWING_DUR, SWING_DURS, HELD_WEAPONS } from '../src/js/store3d/ui/hands.js';

const mk = () => { const cam = new PerspectiveCamera(); const h = createHands(cam); return { cam, h }; };
const fistVisible = (h) => h.group.children[0].visible;
const meshes = (h) => { const l = []; h.group.traverse((o) => { if (o.isMesh) l.push(o); }); return l; };
const weaponMesh = (h) => meshes(h).find((m) => m.name.startsWith('lfx-hands-')) || null;
const lensColor = (h) => { const g = weaponMesh(h).geometry; return g.attributes.color.array[(g.attributes.position.count - 24) * 3]; }; // Linse = letztes Teil des Lasers

describe('hands: Waffen', () => {
  it('setHeld({weapon}) hält die Waffe, setHeld(null) räumt sie weg; Hülle und Waffe schließen sich aus', () => {
    const { h } = mk();
    expect(HELD_WEAPONS).toEqual(['belt', 'whip', 'laser']);
    expect(h.weapon).toBeNull();
    for (const w of HELD_WEAPONS) {
      h.setHeld({ weapon: w });
      expect(h.weapon).toBe(w);
      expect(h.carrying).toBe(false);
    }
    h.setHeld({ media: 'dvd' });
    expect(h.weapon).toBeNull();
    expect(h.carrying).toBe(true);
    h.setHeld({ weapon: 'belt' });
    expect(h.carrying).toBe(false);
    h.setHeld({ weapon: 'unbekannt' });
    expect(h.weapon).toBeNull();
    h.setHeld(null);
    h.dispose();
  });

  it('Hieb je Waffe: Dauer, Faust bleibt bei Gürtel und Peitsche aus, danach wieder Ruhe', () => {
    const { h } = mk();
    expect(SWING_DURS.hand).toBe(SWING_DUR);
    expect(SWING_DURS.whip).toBeGreaterThan(SWING_DURS.belt);
    h.swing();
    h.update(0.05);
    expect(h.swinging).toBe(true);
    expect(fistVisible(h)).toBe(true);
    for (let i = 0; i < 20; i++) h.update(0.05);
    expect(h.swinging).toBe(false);
    expect(fistVisible(h)).toBe(false);
    for (const w of ['belt', 'whip']) {
      h.setHeld({ weapon: w });
      h.swing();
      h.update(0.05);
      expect(h.swinging, w).toBe(true);
      expect(fistVisible(h), w).toBe(false);
      for (let i = 0; i < 30; i++) h.update(0.05);
      expect(h.swinging, w).toBe(false);
    }
    h.setHeld({ weapon: 'laser' });
    h.swing(); // der Laser schlägt nicht: Faust
    h.update(0.05);
    expect(fistVisible(h)).toBe(true);
    h.dispose();
  });

  it('jede Waffe ist EIN Mesh (Draw-Call-Budget), mit Vertexfarbe und ohne Tiefentest', () => {
    const { h } = mk();
    for (const w of HELD_WEAPONS) {
      h.setHeld({ weapon: w });
      const ms = meshes(h).filter((m) => m.name.startsWith('lfx-hands-'));
      expect(ms.length, w).toBe(1);
      expect(ms[0].material.vertexColors).toBe(true);
      expect(ms[0].material.depthTest).toBe(false);
      expect(ms[0].geometry.attributes.position.array.every(Number.isFinite)).toBe(true);
    }
    h.setLaser(true);
    expect(meshes(h).filter((m) => m.name.startsWith('lfx-hands-')).length).toBe(1); // kein Halo/Glow-Zusatzmesh
    h.dispose();
  });

  it('Gürtel: Schlaufe aus mindestens 10 Stücken plus Schnalle (gemergt), steigt im Bild oberhalb der Hand auf', () => {
    const { h } = mk();
    h.setHeld({ weapon: 'belt' });
    const g = weaponMesh(h).geometry;
    expect(g.attributes.position.count).toBeGreaterThanOrEqual(15 * 24);
    g.computeBoundingBox();
    expect(g.boundingBox.max.y).toBeGreaterThan(0.1);
    h.dispose();
  });

  it('Waffenpose bleibt endlich, die Peitsche schwingt beim Hieb (Segmente werden neu berechnet)', () => {
    const { h } = mk();
    h.setHeld({ weapon: 'whip' });
    h.swing('whip');
    const wm = weaponMesh(h);
    const wg = wm.parent;
    const tip0 = Array.from(wm.geometry.attributes.position.array.slice(-3));
    const rots = [];
    let moved = 0;
    for (let i = 0; i < 12; i++) {
      h.update(0.05);
      expect([wg.position.x, wg.position.y, wg.position.z, wg.rotation.x].every(Number.isFinite)).toBe(true);
      expect(wm.geometry.attributes.position.array.every(Number.isFinite)).toBe(true);
      rots.push(wg.rotation.x);
      const tip = Array.from(wm.geometry.attributes.position.array.slice(-3));
      moved = Math.max(moved, Math.hypot(tip[0] - tip0[0], tip[1] - tip0[1], tip[2] - tip0[2]));
    }
    expect(Math.max(...rots) - Math.min(...rots)).toBeGreaterThan(0.5);
    expect(moved).toBeGreaterThan(0.02);
    h.dispose();
  });

  it('Laser: Linse leuchtet nur mit setLaser(true) und gehaltenem Laser (Vertexfarbe, kein Zusatzmesh)', () => {
    const { h } = mk();
    h.setLaser(true);
    expect(h.laserOn).toBe(true);
    h.setHeld({ weapon: 'laser' });
    const on = lensColor(h);
    h.update(0.05);
    h.setLaser(false);
    const off = lensColor(h);
    expect(off).not.toBe(on);
    h.setLaser(true);
    h.update(0.05);
    expect(lensColor(h)).toBe(on);
    expect(meshes(h).filter((m) => m.name.startsWith('lfx-hands-')).length).toBe(1);
    h.setHeld({ weapon: 'belt' });
    expect(weaponMesh(h).name).toBe('lfx-hands-belt');
    h.dispose();
  });

  it('dispose entsorgt die Waffenteile und hängt die Gruppe ab', () => {
    const { cam, h } = mk();
    h.setHeld({ weapon: 'whip' });
    let disposed = 0;
    h.group.traverse((o) => { if (o.isMesh) o.geometry.addEventListener('dispose', () => { disposed++; }); });
    h.dispose();
    expect(disposed).toBeGreaterThanOrEqual(1);
    expect(cam.children.includes(h.group)).toBe(false);
  });
});

describe('hands: Draw-Call-Budget bei low', () => {
  it('low: leuchtender Laser blendet das Gerät aus (nur der DOM-Punkt zeigt), mid/high und Laser aus: sichtbar; Gürtel/Peitsche immer sichtbar', () => {
    let q = 'low';
    const h = createHands(new PerspectiveCamera(), { quality: () => q });
    h.setHeld({ weapon: 'laser' });
    const wg = () => weaponMesh(h).parent;
    h.update(0.05);
    expect(wg().visible).toBe(true);
    h.setLaser(true);
    h.update(0.05);
    expect(wg().visible).toBe(false);
    q = 'mid';
    h.update(0.05);
    expect(wg().visible).toBe(true);
    q = 'low';
    h.setLaser(false);
    h.update(0.05);
    expect(wg().visible).toBe(true);
    h.setLaser(true);
    h.setHeld({ weapon: 'belt' });
    h.update(0.05);
    expect(wg().visible).toBe(true);
    h.dispose();
  });
});
