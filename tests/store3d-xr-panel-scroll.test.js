// @vitest-environment jsdom
// VR-Panel: Listen scrollen anhand des Layouts.
import { describe, it, expect } from 'vitest';
import { PerspectiveCamera } from 'three';
import { scrollable } from '../src/js/store3d/xr/pointer.js';
import { openPanel, layoutPanel, MAX_H } from '../src/js/store3d/xr/panel.js';

describe('Panel-Listen scrollbar', () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ label: `Treffer ${i}`, onSelect() {} }));
  const spec = (n) => ({ title: 'Kassen-PC · Suche', lines: ['a'], list: { rows: rows(n), visible: 6 }, input: { value: '', placeholder: 'x' }, buttons: [{ label: 'Zu' }] });

  it('scrollable stützt sich auf das Layout: 6 Treffer bei gekürzter Liste scrollen', () => {
    const L6 = layoutPanel(spec(6));
    expect(L6.height).toBeLessThanOrEqual(MAX_H + 1);
    expect(L6.maxScroll).toBeGreaterThan(0);
    const h = openPanel(spec(6), { camera: new PerspectiveCamera() });
    expect(h.maxScroll).toBeGreaterThan(0);
    expect(scrollable(h)).toBe(true);
    h.close();
    const h5 = openPanel(spec(3), { camera: new PerspectiveCamera() });
    expect(scrollable(h5)).toBe(false);
    h5.close();
  });

  it('▲/▼-Treffer (für Hände) scrollen die Liste zeilenweise', () => {
    const s = spec(8);
    const L = layoutPanel(s);
    const kinds = L.hits.filter((x) => x.kind === 'scroll').map((x) => x.ref).sort();
    expect(kinds).toEqual([-1, 1]);
    expect(layoutPanel(spec(2)).hits.some((x) => x.kind === 'scroll')).toBe(false);
    const h = openPanel(s, { camera: new PerspectiveCamera() });
    const W = 900;
    const Hh = Math.min(MAX_H, Math.ceil(L.height));
    const r0 = L.hits.find((x) => x.kind === 'row' && x.ref === 0);
    const uv = { x: (r0.x + r0.w / 2) / W, y: 1 - (r0.y + r0.h / 2) / Hh };
    expect(h.hit(uv).ref).toBe(0);
    expect(h.activate({ kind: 'scroll', ref: 1 })).toBe(true);
    expect(h.hit(uv).ref).toBe(1);
    h.activate({ kind: 'scroll', ref: -1 });
    expect(h.hit(uv).ref).toBe(0);
    h.close();
  });
});

