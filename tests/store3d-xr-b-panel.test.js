// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Scene, PerspectiveCamera, Object3D } from 'three';
import { layoutPanel, openPanel, MAX_H } from '../src/js/store3d/xr/panel.js';

afterEach(() => vi.restoreAllMocks());
const at = (L, kind, ref) => L.hits.find((h) => h.kind === kind && JSON.stringify(h.ref) === JSON.stringify(ref));
const uvOf = (L, h, W = 900) => ({ x: (h.x + h.w / 2) / W, y: 1 - (h.y + h.h / 2) / Math.ceil(Math.min(MAX_H, L.height)) });
const setup = () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  scene.add(camera);
  return { scene, camera };
};
const open = (spec, opts = {}) => {
  const { scene, camera } = setup();
  return { scene, camera, h: openPanel(spec, { scene, camera, ...opts }) };
};

describe('xr-b panel layout', () => {
  it('alle Teile: Titel, Tabs, Liste mit Tag/Aktionen, Fortschritt, Knöpfe', () => {
    const L = layoutPanel({
      title: 'Titel', text: 'Text', lines: ['Meta'],
      tabs: [{ label: 'A', on: true }, { label: 'B' }],
      list: { rows: [{ label: 'x', sub: 's', tag: 'NEU', selected: true, actions: [{ label: 'Los' }, { label: 'Mehr' }] }] },
      progress: { value: 0.5, label: 'Pos', onSeek() {} },
      buttons: [{ label: 'OK', primary: true }, { label: 'On', on: true }],
    }, 900);
    const texts = L.ops.filter((o) => o.t === 'text').map((o) => o.text);
    expect(texts).toEqual(expect.arrayContaining(['Titel', 'Text', 'Meta', 'A', 'B', 'x', 's', 'NEU', 'Los', 'Mehr', 'Pos', 'OK', 'On']));
    expect(L.ops.find((o) => o.key === 'tab:0').fill).not.toBe(L.ops.find((o) => o.key === 'tab:1').fill);
    expect(at(L, 'action', { row: 0, action: 1 })).toBeTruthy();
    const row = at(L, 'row', 0);
    const a0 = at(L, 'action', { row: 0, action: 0 });
    expect(a0.x).toBeGreaterThanOrEqual(row.x + row.w);
    expect(a0.x + a0.w).toBeLessThanOrEqual(900);
  });

  it('Eingabe liefert Feld, Cursor und alle Tasten als Treffer', () => {
    const L = layoutPanel({ input: { value: 'ab', placeholder: 'Suche' } }, 900);
    expect(L.ops.some((o) => o.t === 'cursor')).toBe(true);
    expect(L.hits.filter((h) => h.kind === 'key')).toHaveLength(11 * 3 + 10 + 2);
    expect(at(L, 'key', 'ä')).toBeTruthy();
    expect(at(L, 'key', 'enter')).toBeTruthy();
    const ph = layoutPanel({ input: { value: '', placeholder: 'Suche' } }, 900);
    expect(ph.ops.some((o) => o.text === 'Suche')).toBe(true);
  });

  it('Knöpfe brechen um, wenn sie nicht nebeneinander passen', () => {
    const btns = Array.from({ length: 6 }, (_, i) => ({ label: `K${i}` }));
    const L = layoutPanel({ buttons: btns }, 900);
    const ys = new Set(L.hits.filter((h) => h.kind === 'button').map((h) => h.y));
    expect(ys.size).toBeGreaterThan(1);
    for (const h of L.hits) expect(h.x + h.w).toBeLessThanOrEqual(900.001);
  });

  it('Höhe wird auf 1100 begrenzt, die Liste schrumpft und scrollt', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ label: `r${i}` }));
    const L = layoutPanel({ title: 'T', list: { rows, visible: 12 }, input: { value: '' } }, 900);
    expect(L.height).toBeLessThanOrEqual(MAX_H);
    expect(L.maxScroll).toBeGreaterThan(0);
    expect(L.hits.filter((h) => h.kind === 'row').length).toBeLessThan(12);
  });

  it('Scroll-Indikator nur bei scrollbaren Listen', () => {
    const rows = (n) => Array.from({ length: n }, (_, i) => ({ label: `r${i}` }));
    const count = (L) => L.ops.filter((o) => o.t === 'rect' && o.w === 8).length;
    expect(count(layoutPanel({ list: { rows: rows(3), visible: 6 } }, 900))).toBe(0);
    expect(count(layoutPanel({ list: { rows: rows(10), visible: 4 } }, 900))).toBe(2);
  });
});

describe('xr-b openPanel', () => {
  it('Liste: scroll(dy) begrenzt und verschiebt die Zeilen', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ label: `r${i}` }));
    const spec = { list: { rows, visible: 4 } };
    const { h } = open(spec);
    const rowAtTop = () => {
      const L = layoutPanel(spec, 900, 0);
      const H = Math.ceil(L.height);
      const t = at(L, 'row', 0);
      return h.hit({ x: 0.5, y: 1 - (t.y + t.h / 2) / H });
    };
    expect(rowAtTop().ref).toBe(0);
    h.scroll(-500);
    expect(rowAtTop().ref).toBe(0);
    h.scroll(88 * 2);
    expect(rowAtTop().ref).toBe(2);
    h.scroll(99999);
    expect(rowAtTop().ref).toBe(6);
    h.scroll(5);
    expect(rowAtTop().ref).toBe(6);
    h.close();
  });

  it('activate verteilt auf Tab, Zeile, Aktion, Knopf, Fortschritt', () => {
    const f = { tab: vi.fn(), row: vi.fn(), act: vi.fn(), btn: vi.fn(), seek: vi.fn() };
    const spec = {
      tabs: [{ label: 'A', onSelect: f.tab }],
      list: { rows: [{ label: 'r', onSelect: f.row, actions: [{ label: 'Go', onSelect: f.act }] }] },
      progress: { value: 0.2, onSeek: f.seek },
      buttons: [{ label: 'Ja', onSelect: f.btn }],
    };
    const { h } = open(spec);
    const L = layoutPanel(spec, 900);
    for (const [kind, ref] of [['tab', 0], ['row', 0], ['action', { row: 0, action: 0 }], ['button', 0]]) expect(h.activate(h.hit(uvOf(L, at(L, kind, ref))))).toBe(true);
    expect(f.tab).toHaveBeenCalledTimes(1);
    expect(f.row).toHaveBeenCalledTimes(1);
    expect(f.act).toHaveBeenCalledTimes(1);
    expect(f.btn).toHaveBeenCalledTimes(1);
    const p = at(L, 'progress', 0);
    const hit = h.hit({ x: (p.x + p.w * 0.25) / 900, y: 1 - (p.y + p.h / 2) / Math.ceil(L.height) });
    expect(hit.kind).toBe('progress');
    expect(hit.frac).toBeCloseTo(0.25, 1);
    h.activate(hit);
    expect(f.seek).toHaveBeenCalledTimes(1);
    expect(f.seek.mock.calls[0][0]).toBeCloseTo(0.25, 1);
    h.close();
  });

  it('deaktivierter Knopf hat keinen Treffer und keine Wirkung', () => {
    const onSelect = vi.fn();
    const spec = { buttons: [{ label: 'X', disabled: true, onSelect }] };
    const { h } = open(spec);
    expect(layoutPanel(spec, 900).hits.filter((x) => x.kind === 'button')).toHaveLength(0);
    h.activate({ kind: 'button', ref: 0 });
    expect(onSelect).not.toHaveBeenCalled();
    h.close();
  });

  it('Tasten: onInput mit Umlaut/Shift, Löschen, Wert intern gehalten, Suchen ruft onEnter', () => {
    const onInput = vi.fn();
    const onEnter = vi.fn();
    const spec = { input: { value: '', placeholder: 'x', onInput, onEnter } };
    const { h } = open(spec);
    const key = (k) => h.activate({ kind: 'key', ref: k });
    key('ä'); key('shift'); key('b'); key('c');
    expect(onInput.mock.calls.map((c) => c[0])).toEqual(['ä', 'äB', 'äBc']);
    key('back');
    expect(onInput).toHaveBeenLastCalledWith('äB');
    key('space');
    expect(onInput).toHaveBeenLastCalledWith('äB ');
    key('enter');
    expect(onEnter).toHaveBeenCalledWith('äB ');
    h.update({ input: { value: 'neu', placeholder: 'x', onInput, onEnter } });
    key('a');
    expect(onInput).toHaveBeenLastCalledWith('neua');
    h.close();
  });

  it('Tastentreffer per UV; Hover liefert den Treffer', () => {
    const spec = { input: { value: '' } };
    const { h } = open(spec);
    const L = layoutPanel(spec, 900);
    const uv = uvOf(L, at(L, 'key', 'q'));
    expect(h.hit(uv)).toMatchObject({ kind: 'key', ref: 'q' });
    expect(h.hover(uv).kind).toBe('key');
    h.hover(uv);
    h.close();
  });

  it('front: 1,1 m vor dem Kopf, Augenhöhe − 0,1; low: ≥ 0,85 m (Winkelbreite ≤ 55°), 0,4 m tiefer', () => {
    const { scene, camera } = setup();
    camera.position.set(2, 1.65, 3);
    camera.rotation.set(-0.3, Math.PI / 2, 0, 'YXZ');
    camera.updateMatrixWorld(true);
    const f = openPanel({ text: 'a' }, { scene, camera });
    expect(f.mesh.position.x).toBeCloseTo(2 - 1.1, 2);
    expect(f.mesh.position.z).toBeCloseTo(3, 2);
    expect(f.mesh.position.y).toBeCloseTo(1.55, 2);
    const l = openPanel({ text: 'a' }, { scene, camera, anchor: 'low' });
    expect(l.mesh.position.x).toBeCloseTo(2 - 0.8645, 2);
    expect(l.mesh.position.y).toBeCloseTo(1.25, 2);
    f.close();
    l.close();
  });

  it('Object3D-Anker: Panel wird Kind', () => {
    const obj = new Object3D();
    const { h } = open({ text: 'a' }, { anchor: obj });
    expect(h.mesh.parent).toBe(obj);
    h.close();
    expect(obj.children).toHaveLength(0);
  });

  it('follow: folgt träge per tick(dt)', () => {
    const target = new Object3D();
    target.position.set(0, 1, -2);
    const { scene, camera } = setup();
    scene.add(target);
    target.updateMatrixWorld(true);
    const h = openPanel({ text: 'a' }, { scene, camera, anchor: { object: target, offset: { x: 0.5, y: 0, z: 0 }, follow: true } });
    expect(h.mesh.position.toArray()).toEqual([0.5, 1, -2]);
    target.position.set(4.5, 1, -2);
    target.updateMatrixWorld(true);
    h.tick(0.1);
    expect(h.mesh.position.x).toBeGreaterThan(0.5);
    expect(h.mesh.position.x).toBeLessThan(5);
    for (let i = 0; i < 100; i++) h.tick(0.1);
    expect(h.mesh.position.x).toBeCloseTo(5, 1);
    h.close();
  });

  it('close gibt Geometrie und Textur frei', () => {
    const { h } = open({ text: 'a' });
    const gd = vi.fn();
    h.mesh.geometry.addEventListener('dispose', gd);
    const td = vi.fn();
    h.mesh.material.map.addEventListener('dispose', td);
    h.close();
    expect(gd).toHaveBeenCalled();
    expect(td).toHaveBeenCalled();
    expect(h.open).toBe(false);
  });
});
