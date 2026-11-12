// @vitest-environment jsdom
// VIDEOTHEK LENZ: Cover-Ziehen – Umkehr/Empfindlichkeit nur für Touch-Pointer, Maus unverändert.
import { describe, it, expect } from 'vitest';
import { Group } from 'three';
import { HoldView } from '../src/js/store3d/ui/holdview.js';

const ctxStub = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ width: 10, addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
HTMLCanvasElement.prototype.getContext = () => ctxStub;

function mk(tune) {
  const camera = new Group();
  camera.aspect = 1.6;
  const deps = { imageUrl: () => '', getItem: async () => null, toast() {}, setFavorite: async () => {}, setPlayed: async () => {}, play: async () => {} };
  const hv = new HoldView({ host: document.body, camera, deps, items: new Map(), shelves: { setHidden() {}, faceViews: [] }, notify() {}, onClosed() {}, getTune: tune ? () => tune : undefined });
  hv.open('x', null, true);
  return hv;
}
function drag(hv, type) {
  const el = document.querySelector('.lfx-store-hold-drag');
  const fire = (t, x, y) => { const e = new Event(t, { bubbles: true }); Object.assign(e, { pointerId: 1, pointerType: type, clientX: x, clientY: y }); el.dispatchEvent(e); };
  el.setPointerCapture = () => {};
  fire('pointerdown', 100, 100);
  fire('pointermove', 110, 120);
  return hv.rot;
}

describe('HoldView Ziehen', () => {
  it('Touch: Umkehr und Empfindlichkeit', () => {
    document.body.innerHTML = '';
    const hv = mk({ holdInvertX: true, holdInvertY: true, touchSens: 'high' });
    const r = drag(hv, 'touch');
    expect(r.y).toBeCloseTo(-10 * 0.012 * 1.4);
    expect(r.x).toBeCloseTo(-20 * 0.008 * 1.4);
    hv.dispose(true);
  });
  it('Maus bleibt unverändert, auch mit Einstellung', () => {
    document.body.innerHTML = '';
    const hv = mk({ holdInvertX: true, holdInvertY: true, touchSens: 'high' });
    const r = drag(hv, 'mouse');
    expect(r.y).toBeCloseTo(10 * 0.012);
    expect(r.x).toBeCloseTo(20 * 0.008);
    hv.dispose(true);
  });
  it('Touch ohne Einstellung = heutiges Verhalten', () => {
    document.body.innerHTML = '';
    const hv = mk(null);
    const r = drag(hv, 'touch');
    expect(r.y).toBeCloseTo(10 * 0.012);
    expect(r.x).toBeCloseTo(20 * 0.008);
    hv.dispose(true);
  });
});
