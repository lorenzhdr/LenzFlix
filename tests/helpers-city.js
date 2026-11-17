// Gemeinsame Helfer der Stadt-Tests (kein Test selbst): Layouts, Canvas-Attrappe für three-Module.
import { buildLayout } from '../src/js/store3d/world/layout.js';

export const depts = [
  { id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ['a', 'b'] },
  { id: 'genre-x', label: 'X', kind: 'genre', color: '#0f0', itemIds: Array.from({ length: 80 }, (_, i) => `g${i}`) },
];

/** Layout mit n Titeln in freien Gängen (Breite/Tiefe wachsen mit n). */
export function layoutOf(n = 80) {
  return buildLayout([{ id: 'g', label: 'G', kind: 'genre', color: '#0f0', itemIds: Array.from({ length: n }, (_, i) => `t${i}`) }], { big: false });
}

/** 2D-Kontext-Attrappe (jsdom hat kein Canvas): alle Zeichenaufrufe sind No-Ops. */
export function fakeCanvas(w = 8, h = 8) {
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
      return typeof k === 'string' && k in t ? t[k] : () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { width: w, height: h, getContext: () => ctx };
}

export const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
