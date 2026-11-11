// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { Scene, PerspectiveCamera } from 'three';
import { layoutPanel, wrapText, openPanel } from '../src/js/store3d/xr/panel.js';

const at = (L, kind, ref) => L.hits.find((h) => h.kind === kind && JSON.stringify(h.ref) === JSON.stringify(ref));
const centre = (h) => ({ x: h.x + h.w / 2, y: h.y + h.h / 2 });

describe('xr/panel layoutPanel', () => {
  it('bricht Text um und wächst mit dem Inhalt', () => {
    const short = layoutPanel({ text: 'Hallo' }, 600);
    const long = layoutPanel({ text: 'Dies ist ein langer Satz, der in einem schmalen Panel mehrfach umbrochen werden muss.' }, 600);
    expect(long.height).toBeGreaterThan(short.height);
    const lines = wrapText('eins zwei drei vier fünf sechs', 100, 20);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('eins zwei drei vier fünf sechs');
  });

  it('Knöpfe: Treffer nebeneinander innerhalb der Breite, deaktivierte ohne Treffer', () => {
    const L = layoutPanel({ title: 'T', buttons: [{ label: 'A' }, { label: 'B', disabled: true }, { label: 'C' }] }, 900);
    const hits = L.hits.filter((h) => h.kind === 'button');
    expect(hits.map((h) => h.ref)).toEqual([0, 2]);
    expect(hits[0].x).toBeLessThan(hits[1].x);
    for (const h of hits) { expect(h.x + h.w).toBeLessThanOrEqual(900); expect(h.y + h.h).toBeLessThanOrEqual(L.height); }
  });

  it('Tabs, Liste, Aktionen, Eingabe und Fortschritt liefern Treffer', () => {
    const L = layoutPanel({
      tabs: [{ label: 'Eins', on: true }, { label: 'Zwei' }],
      list: { rows: [{ label: 'r0', actions: [{ label: 'Los', primary: true }] }, { label: 'r1' }] },
      input: { value: '', placeholder: 'Suche' },
      progress: { value: 0.4, onSeek() {} },
    }, 900);
    expect(at(L, 'tab', 1)).toBeTruthy();
    expect(at(L, 'row', 0)).toBeTruthy();
    expect(at(L, 'row', 1)).toBeTruthy();
    expect(at(L, 'action', { row: 0, action: 0 })).toBeTruthy();
    expect(at(L, 'input', 0)).toBeTruthy();
    expect(at(L, 'progress', 0)).toBeTruthy();
  });

  it('Liste scrollt: nur sichtbare Zeilen, Scroll verschiebt das Fenster', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ label: `r${i}` }));
    const a = layoutPanel({ list: { rows, visible: 4 } }, 900, 0);
    expect(a.hits.filter((h) => h.kind === 'row').map((h) => h.ref)).toEqual([0, 1, 2, 3]);
    expect(a.maxScroll).toBeGreaterThan(0);
    const b = layoutPanel({ list: { rows, visible: 4 } }, 900, 3 * 88);
    expect(b.hits.filter((h) => h.kind === 'row').map((h) => h.ref)).toEqual([3, 4, 5, 6]);
    const c = layoutPanel({ list: { rows, visible: 4 } }, 900, 99999);
    expect(c.hits.filter((h) => h.kind === 'row').map((h) => h.ref)).toEqual([6, 7, 8, 9]);
  });
});

describe('xr/panel openPanel', () => {
  it('Treffer per UV, activate ruft onSelect, close ruft onClose einmal', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const scene = new Scene();
    const cam = new PerspectiveCamera();
    scene.add(cam);
    const h = openPanel({ text: 'x', buttons: [{ label: 'OK', onSelect }], onClose }, { camera: cam, scene });
    expect(h.open).toBe(true);
    expect(scene.children).toContain(h.mesh);
    const L = layoutPanel({ text: 'x', buttons: [{ label: 'OK', onSelect }] }, 900);
    const b = at(L, 'button', 0);
    const H = Math.ceil(L.height);
    const hit = h.hit({ x: centre(b).x / 900, y: 1 - centre(b).y / H });
    expect(hit && hit.kind).toBe('button');
    expect(h.hit({ x: 0.001, y: 0.999 })).toBeNull();
    expect(h.activate(hit)).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);
    h.close();
    h.close();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(h.open).toBe(false);
    expect(scene.children).not.toContain(h.mesh);
    vi.restoreAllMocks();
  });
});
