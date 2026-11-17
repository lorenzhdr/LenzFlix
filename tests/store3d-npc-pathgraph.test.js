import { describe, it, expect } from 'vitest';
import { buildGraph, isConnected, chooseNext, edgeDir, pointOn, projectOn } from '../src/js/store3d/npc/pathgraph.js';
import { buildCity } from '../src/js/store3d/world/city.js';
import { seeded } from '../src/js/store3d/modules/m4-util.js';

const city = buildCity({ w: 20, d: 16 });

describe('Wegegraph der Passanten', () => {
  it('teilt Segmente an T-Punkten und ist zusammenhängend (echte Stadt)', () => {
    const g = buildGraph(city.sidewalkPaths);
    expect(isConnected(g)).toBe(true);
    const deg3 = g.nodes.filter((n) => n.edges.length >= 3).length;
    expect(deg3).toBeGreaterThanOrEqual(8);
    const total = city.sidewalkPaths.reduce((s, p) => s + p.pts.slice(1).reduce((a, q, i) => a + Math.hypot(q.x - p.pts[i].x, q.z - p.pts[i].z), 0), 0);
    expect(g.edges.reduce((s, e) => s + e.len, 0)).toBeCloseTo(total, 3);
  });

  it('Zebra-Bedingungen bleiben an den Kanten erhalten', () => {
    const g = buildGraph(city.sidewalkPaths);
    const waits = new Set(g.edges.map((e) => e.wait));
    expect(waits.has('main') && waits.has('side') && waits.has('mid')).toBe(true);
    expect(g.edges.filter((e) => e.wait === 'main').length).toBe(2);
  });

  it('projectOn findet nur Punkte auf dem Segment', () => {
    expect(projectOn({ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 4, z: 0.02 })).toBeCloseTo(0.4, 3);
    expect(projectOn({ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 4, z: 1 })).toBe(-1);
    expect(projectOn({ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 11, z: 0 })).toBe(-1);
  });

  it('chooseNext verlässt nie über dieselbe Kante, außer in Sackgassen', () => {
    const g = buildGraph(city.sidewalkPaths);
    const rand = seeded(7);
    for (let i = 0; i < 300; i++) {
      const e = g.edges[Math.floor(rand() * g.edges.length)];
      const nodeId = rand() < 0.5 ? e.a : e.b;
      const nx = chooseNext(g, e.id, nodeId, rand);
      if (g.nodes[nodeId].edges.length > 1) expect(nx.edge).not.toBe(e.id);
      else expect(nx.edge).toBe(e.id);
      const ne = g.edges[nx.edge];
      if (g.nodes[nodeId].edges.length > 1) expect(nx.dir === 1 ? ne.a : ne.b).toBe(nodeId);
    }
  });

  it('pointOn/edgeDir laufen entlang der Kante in beide Richtungen', () => {
    const g = buildGraph([{ id: 'a', pts: [{ x: 0, z: 0 }, { x: 10, z: 0 }], waits: [null] }]);
    const e = g.edges[0];
    expect(pointOn(e, 1, 4)).toEqual({ x: 4, z: 0 });
    expect(pointOn(e, -1, 4)).toEqual({ x: 6, z: 0 });
    expect(edgeDir(e, -1).x).toBe(-1);
  });
});
