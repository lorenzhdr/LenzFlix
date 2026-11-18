// @vitest-environment jsdom
// 1.18.0 Draw-Call-Budget: leere InstancedMeshes werden nicht gezeichnet (visible = false), solange nichts darzustellen ist.
import { describe, it, expect } from 'vitest';
import { Scene } from 'three';
import { createPeerLasers } from '../src/js/store3d/net/peerlaser.js';
import { createThrowPool } from '../src/js/store3d/npc/throwpool.js';

const visibleMeshes = (scene) => { const l = []; scene.traverseVisible((o) => { if (o.isMesh) l.push(o); }); return l; };

describe('Draw-Call-Budget: leere Meshes bleiben unsichtbar', () => {
  it('Laserpunkte der Fremden: ohne Laser kein sichtbares Mesh (auch bei mid), mit Laser 1 Punkt + 1 Strahl, danach wieder keins', () => {
    const scene = new Scene();
    const pl = createPeerLasers({ scene, quality: () => 'mid' });
    pl.update(0.1, () => null);
    expect(visibleMeshes(scene)).toHaveLength(0);
    pl.set(5, true, { x: 1, y: 1, z: -4 });
    pl.update(0.1, () => ({ x: 0, y: 1.5, z: 0 }));
    expect(visibleMeshes(scene)).toHaveLength(2);
    pl.drop(5);
    pl.update(0.1, () => null);
    expect(visibleMeshes(scene)).toHaveLength(0);
    pl.dispose();
  });
  it('Laserpunkte der Fremden bei low: nur der Punkt (1 Mesh), kein Strahl', () => {
    const scene = new Scene();
    const pl = createPeerLasers({ scene, quality: () => 'low' });
    pl.set(5, true, { x: 1, y: 1, z: -4 });
    pl.update(0.1, () => ({ x: 0, y: 1.5, z: 0 }));
    expect(visibleMeshes(scene)).toHaveLength(1);
    pl.dispose();
  });
  it('Wurf-Pool: leer unsichtbar, mit Geschoss sichtbar, nach der Landung wieder unsichtbar', () => {
    const scene = new Scene();
    const tp = createThrowPool(scene, () => 0.5);
    expect(visibleMeshes(scene)).toHaveLength(0);
    expect(tp.launch('candy', { x: 0, y: 1.5, z: 0 }, { x: 0, y: 1.2, z: -3 })).toBe(true);
    expect(visibleMeshes(scene)).toHaveLength(1);
    for (let i = 0; i < 100; i++) tp.update(0.05, { x: 0, y: 0, z: -3 }, () => {});
    expect(tp.active()).toBe(0);
    expect(visibleMeshes(scene)).toHaveLength(0);
    tp.dispose();
  });
});
