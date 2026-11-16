// @vitest-environment jsdom
// Welt: buildShelves mit leerem Katalog, setAnisotropy markiert Texturen zum Neu-Hochladen.
import { describe, it, expect } from 'vitest';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import { buildShelves } from '../src/js/store3d/world/build-shelves.js';
import { makeTextures } from '../src/js/store3d/world/textures.js';

const draws = [];
const ctxStub = new Proxy({}, {
  get: (t, k) => (k === 'fillText' ? (s) => { draws.push(String(s)); } : k in t ? t[k] : () => ({ width: 10, addColorStop() {} })),
  set: (t, k, v) => { t[k] = v; return true; },
});
HTMLCanvasElement.prototype.getContext = () => ctxStub;

describe('Welt', () => {
  it('buildShelves mit leerem Katalog wirft nicht', () => {
    const layout = buildLayout([]);
    let shelves;
    expect(() => { shelves = buildShelves(layout, new Map(), null, null); }).not.toThrow();
    expect(shelves.frameMesh).toBeTruthy();
  });

  it('setAnisotropy markiert geänderte Texturen zum Neu-Hochladen', () => {
    const t = makeTextures({ anisotropy: 4 });
    const v0 = t.carpet.version;
    t.setAnisotropy(4);
    expect(t.carpet.version).toBe(v0);
    t.setAnisotropy(8);
    expect(t.carpet.anisotropy).toBe(8);
    expect(t.carpet.version).toBeGreaterThan(v0);
    t.dispose();
  });
});

