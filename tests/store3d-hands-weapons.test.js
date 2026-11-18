// @vitest-environment jsdom
// Ego-Hände mit Waffen (1.18.0): setHeld({weapon}), Hieb je Waffe, Laser-Leuchtpunkt, Aufräumen.
import { describe, it, expect } from 'vitest';
import { PerspectiveCamera } from 'three';
import { createHands, SWING_DUR, SWING_DURS, HELD_WEAPONS } from '../src/js/store3d/ui/hands.js';

const mk = () => { const cam = new PerspectiveCamera(); const h = createHands(cam); return { cam, h }; };
const fistVisible = (h) => h.group.children[0].visible;
const glowOf = (h) => { let g = null; h.group.traverse((o) => { if (o.isMesh && o.geometry.type === 'SphereGeometry' && o.geometry.parameters.radius < 0.01) g = o; }); return g; };

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

  it('Waffenpose bleibt endlich, die Peitsche schwingt beim Hieb', () => {
    const { h } = mk();
    h.setHeld({ weapon: 'whip' });
    h.swing('whip');
    const wg = h.group.children.find((c) => c !== h.group.children[0] && c.children.length && c.children[0].children.length > 1);
    expect(wg).toBeTruthy();
    const rots = [];
    for (let i = 0; i < 12; i++) {
      h.update(0.05);
      expect([wg.position.x, wg.position.y, wg.position.z, wg.rotation.x].every(Number.isFinite)).toBe(true);
      rots.push(wg.rotation.x);
    }
    expect(Math.max(...rots) - Math.min(...rots)).toBeGreaterThan(0.5);
    h.dispose();
  });

  it('Laser: Leuchtpunkt nur mit setLaser(true) und gehaltenem Laser', () => {
    const { h } = mk();
    h.setLaser(true);
    expect(h.laserOn).toBe(true);
    h.setHeld({ weapon: 'laser' });
    expect(glowOf(h).visible).toBe(true);
    h.update(0.05);
    expect(glowOf(h).scale.x).toBeGreaterThan(0.5);
    h.setLaser(false);
    expect(glowOf(h).visible).toBe(false);
    h.setHeld({ weapon: 'belt' });
    expect(glowOf(h)).toBeNull();
    h.dispose();
  });

  it('dispose entsorgt die Waffenteile und hängt die Gruppe ab', () => {
    const { cam, h } = mk();
    h.setHeld({ weapon: 'whip' });
    let disposed = 0;
    h.group.traverse((o) => { if (o.isMesh) o.geometry.addEventListener('dispose', () => { disposed++; }); });
    h.dispose();
    expect(disposed).toBeGreaterThan(5);
    expect(cam.children.includes(h.group)).toBe(false);
  });
});
