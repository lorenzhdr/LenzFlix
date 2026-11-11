// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { Scene, PerspectiveCamera } from 'three';
import { createBubble3d, bubbleLines } from '../src/js/store3d/xr/bubble3d.js';

describe('xr/bubble3d', () => {
  it('bubbleLines: höchstens 3 Zeilen, Auslassungszeichen bei Überlänge', () => {
    const text = 'Dies ist ein sehr langer Satz der garantiert nicht in drei kurze Zeilen passt wenn man ihn ordentlich umbricht und weiter schreibt';
    const l = bubbleLines(text, 300);
    expect(l).toHaveLength(3);
    expect(l[2].endsWith('…')).toBe(true);
    expect(bubbleLines('Hallo Welt', 600)).toEqual(['Hallo Welt']);
  });

  it('show/hide/update/dispose: Szene lazy, Billboard-Yaw, Skalierung begrenzt', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    let scene = new Scene();
    const camera = new PerspectiveCamera();
    camera.position.set(0, 1.65, 0);
    camera.updateMatrixWorld(true);
    const b = createBubble3d({ getScene: () => scene, camera });
    expect(scene.children).toHaveLength(0);
    b.show('Hallo', { x: 3, y: 1.7, z: 0 });
    expect(b.visible).toBe(true);
    const mesh = scene.children[0];
    expect(mesh.name).toBe('lfx-bubble3d');
    expect(mesh.position.toArray()).toEqual([3, 1.7, 0]);
    b.update(0.05);
    expect(mesh.material.opacity).toBeGreaterThan(0);
    expect(mesh.rotation.y).toBeCloseTo(-Math.PI / 2, 3);
    expect(mesh.scale.x).toBeGreaterThanOrEqual(1);
    b.show('Weit', { x: 0, y: 1.7, z: -30 });
    b.update(0.05);
    expect(mesh.scale.x).toBeLessThanOrEqual(3.4);
    b.update(1);
    expect(mesh.material.opacity).toBe(1);
    b.hide();
    expect(b.visible).toBe(false);
    b.update(1);
    expect(mesh.visible).toBe(false);
    const next = new Scene();
    scene = next;
    b.show('Neu', { x: 1, y: 1, z: 1 });
    b.update(0.1);
    expect(next.children).toContain(mesh);
    const gd = vi.fn();
    mesh.geometry.addEventListener('dispose', gd);
    b.dispose();
    b.dispose();
    expect(gd).toHaveBeenCalledTimes(1);
    expect(next.children).not.toContain(mesh);
    b.show('x', { x: 0, y: 0, z: 0 });
    expect(next.children).toHaveLength(0);
    vi.restoreAllMocks();
  });
});
