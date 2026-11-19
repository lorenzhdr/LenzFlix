// @vitest-environment jsdom
// 1.19.0 W7: statische Raum-Netze haben matrixAutoUpdate=false (kein Matrix-Neuberechnen je Frame); Türflügel bleiben beweglich.
import { describe, it, expect } from 'vitest';
import { Scene } from 'three';
import { buildRoom } from '../src/js/store3d/world/build-room.js';
import { layoutOf } from './helpers-city.js';

describe('build-room: statische Netze', () => {
  it('Wände, Decke, Glas, Kulisse eingefroren; Tür-Gruppe nicht', () => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
      get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))),
      set: (t, k, v) => { t[k] = v; return true; },
    });
    const tex = new Proxy({}, { get: () => null });
    let out;
    try { out = buildRoom(layoutOf(80), tex); } finally { HTMLCanvasElement.prototype.getContext = real; }
    const g = out.group;
    const meshes = [];
    g.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const door = g.getObjectByName('lfx-door');
    const outside = meshes.filter((m) => { for (let o = m; o; o = o.parent) if (o === door) return false; return true; });
    const frozen = outside.filter((m) => m.matrixAutoUpdate === false);
    expect(frozen.length).toBeGreaterThanOrEqual(7);
    expect(door.matrixAutoUpdate).toBe(true);
    expect(g.getObjectByName('lfx-door-left').matrixAutoUpdate).toBe(true);
    const sc = new Scene(); sc.add(g);
    g.position.set(3, 0, 0); // Elternbewegung wirkt weiterhin
    sc.updateMatrixWorld(true);
    expect(frozen[0].matrixWorld.elements[12]).toBe(3);
  });
});
