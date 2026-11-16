// @vitest-environment jsdom
// VR-Hinweise: Toast über der Blickmitte, TextQuad ersetzt die Textur bei Größenwechsel.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Group, PerspectiveCamera } from 'three';
import { Hud3d } from '../src/js/store3d/xr/hud3d.js';

const makeHud = () => new Hud3d({ rig: new Group(), camera: new PerspectiveCamera() });

describe('Hinweis überdeckt das Kino-Panel nicht', () => {
  it('Toast sitzt oberhalb der Blickmitte (das Panel „low“ liegt darunter)', () => {
    const hud = makeHud();
    expect(hud.toastQuad.mesh.position.y).toBeGreaterThan(0);
    hud.dispose();
  });
});

describe('TextQuad ersetzt die Textur bei Größenwechsel', () => {
  let orig;
  beforeEach(() => {
    orig = HTMLCanvasElement.prototype.getContext;
    const g = { measureText: (t) => ({ width: String(t).length * 20 }), clearRect() {}, beginPath() {}, rect() {}, fill() {}, fillText() {} };
    HTMLCanvasElement.prototype.getContext = () => g;
  });
  afterEach(() => { HTMLCanvasElement.prototype.getContext = orig; });

  it('neue CanvasTexture nur bei geänderten Maßen', () => {
    const hud = makeHud();
    const t0 = hud.toastQuad.mat.map;
    hud.toast('kurz');
    expect(hud.toastQuad.mat.map).toBe(t0); // erster Upload: gleiche Textur
    hud.toast('kurz2'); // gleiche Breite? 5 statt 4 Zeichen -> andere Breite
    const t1 = hud.toastQuad.mat.map;
    expect(t1).not.toBe(t0);
    expect(hud.toastQuad.tex).toBe(t1);
    expect(t1.image).toBe(hud.toastQuad.canvas);
    hud.toast('ein deutlich längerer Hinweistext');
    expect(hud.toastQuad.mat.map).not.toBe(t1);
    hud.dispose();
  });
});

