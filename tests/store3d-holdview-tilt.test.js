// @vitest-environment jsdom
// VIDEOTHEK LENZ: Cover kippt vorne und hinten gleich (Kippen um die feste X-Achse, nicht um die mitgedrehte).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Group, Vector3, Euler, Quaternion } from 'three';
import { HoldView } from '../src/js/store3d/ui/holdview.js';

const ctxStub = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ width: 10, addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
HTMLCanvasElement.prototype.getContext = () => ctxStub;

function mk() {
  document.body.innerHTML = '';
  const camera = new Group();
  camera.aspect = 1.6;
  const deps = { imageUrl: () => '', getItem: async () => null, toast() {}, setFavorite: async () => {}, setPlayed: async () => {}, play: async () => {} };
  const hv = new HoldView({ host: document.body, camera, deps, items: new Map(), shelves: { setHidden() {}, faceViews: [] }, notify() {}, onClosed() {} });
  hv.open('x', null, true);
  hv.update(100); // 'in' abschließen
  return hv;
}
function topEdge(hv, rx, ry) {
  hv.state = 'held';
  hv.rot.x = rx; hv.rot.y = ry; hv.rotTargetY = ry;
  hv.update(0);
  return new Vector3(0, 1, 0).applyQuaternion(hv.mesh.quaternion);
}

describe('HoldView Kippen', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Kippen wirkt vorne und hinten gleich (Z-Komponente der Oberkante)', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0); // sway = 0
    const hv = mk();
    expect(hv.state).toBe('held');
    const front = topEdge(hv, 0.3, 0);
    const back = topEdge(hv, 0.3, Math.PI);
    expect(Math.abs(front.z)).toBeGreaterThan(0.2);
    expect(back.z).toBeCloseTo(front.z, 5);
    expect(back.y).toBeCloseTo(front.y, 5);
    hv.dispose(true);
  });

  it('bei rot.y = 0 identisch zur alten YXZ-Berechnung', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const hv = mk();
    topEdge(hv, 0.3, 0);
    const old = new Quaternion().setFromEuler(new Euler(0.3, 0, 0, 'YXZ'));
    const q = hv.mesh.quaternion;
    expect(q.x).toBeCloseTo(old.x, 6);
    expect(q.y).toBeCloseTo(old.y, 6);
    expect(q.z).toBeCloseTo(old.z, 6);
    expect(q.w).toBeCloseTo(old.w, 6);
    hv.dispose(true);
  });
});
