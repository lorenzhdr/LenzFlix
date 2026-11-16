// @vitest-environment jsdom
// Haltemodus: Hüllen-Pose bei schmalen Fenstern (Hochformat).
import { describe, it, expect } from 'vitest';
import { Group } from 'three';
import { HoldView } from '../src/js/store3d/ui/holdview.js';

describe('Hüllen-Pose bei schmalen Fenstern', () => {
  const top = (fov) => {
    const t = HoldView.prototype.target.call({ gripMode: () => false, camera: { aspect: 1.19, fov } });
    return (t.pos.y + t.scale) / (-t.pos.z * Math.tan((fov * Math.PI) / 360));
  };
  it('Oberkante liegt bei FOV 55 nicht höher im Bild als bei FOV 70', () => {
    expect(top(55)).toBeLessThanOrEqual(top(70) + 1e-6);
    expect(top(40)).toBeLessThanOrEqual(top(70) + 1e-6);
  });
  it('Gruppen-Stub ohne fov bleibt unverändert', () => {
    const camera = new Group();
    camera.aspect = 1;
    const t = HoldView.prototype.target.call({ gripMode: () => false, camera });
    expect(t.scale).toBe(3);
    expect(t.pos.y).toBeCloseTo(0.3);
  });
});

