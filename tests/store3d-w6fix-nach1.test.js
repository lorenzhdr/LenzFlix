// @vitest-environment jsdom
// 1.19.0 W6-Fix Nachlese 1: Spiegel-Schattencache (N3), Titelumbruch mit Bindestrich (N4), Palast-Schild als Schildfläche (N5).
import { describe, it, expect } from 'vitest';
import { Scene, PerspectiveCamera, DirectionalLight } from 'three';
import { createMirror } from '../src/js/store3d/world/mirror.js';
import { fitTitle, wrapWords } from '../src/js/store3d/world/room-ultra-logic.js';
import { signBoards, windowOnSign, facadeWindows } from '../src/js/store3d/world/ultra-plan.js';
import { createRowdy, stepRowdy, REACH_Y, REACH_LOST_S } from '../src/js/store3d/npc/gang-logic.js';
import { layoutOf } from './helpers-city.js';

describe('N3: Spiegel traversiert die Szene nur bis zur Schattenbereitschaft', () => {
  function setup() {
    const log = [];
    const renderer = {
      info: { autoReset: true }, shadowMap: { enabled: true, autoUpdate: true }, target: null,
      getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t; },
      render(scene, c) { log.push(c); },
    };
    const scene = new Scene();
    const light = new DirectionalLight(0xffffff, 1);
    light.castShadow = true;
    scene.add(light);
    const camera = new PerspectiveCamera(70, 1.6, 0.05, 120);
    camera.position.set(0, 1.5, 4);
    camera.lookAt(0, 1.5, 0);
    camera.updateMatrixWorld(true);
    const ctx = { scene, camera, renderer, quality: () => 'high', xr: { presenting: () => false } };
    return { ctx, scene, light, log, renderer };
  }
  it('wartet ohne Schattenkarte, danach kein Traversieren je Bild mehr; Stufenwechsel setzt zurück', () => {
    const t = setup();
    let trav = 0;
    const orig = t.scene.traverse.bind(t.scene);
    t.scene.traverse = (fn) => { trav++; orig(fn); };
    const m = createMirror(t.ctx, { x: 0, y: 1.5, z: 0, yaw: 0, w: 2, h: 2 });
    for (let i = 0; i < 30; i++) m.update(0.1);
    expect(t.log.length).toBe(0); // keine Schattenkarte: kein Render
    t.light.shadow.map = {};
    for (let i = 0; i < 20; i++) m.update(0.1);
    expect(t.log.length).toBeGreaterThan(3);
    const after = trav;
    for (let i = 0; i < 40; i++) m.update(0.1);
    expect(trav).toBe(after); // bereit: Ergebnis gemerkt
    // Schatten aus und wieder an: neu prüfen
    t.renderer.shadowMap.enabled = false;
    m.update(0.1);
    t.renderer.shadowMap.enabled = true;
    t.light.shadow.map = null;
    const n = t.log.length;
    for (let i = 0; i < 20; i++) m.update(0.1);
    expect(t.log.length).toBe(n);
    m.dispose();
  });
});

describe('N4: Titelumbruch mit Trennstrichen', () => {
  const measure = (t) => t.length * 10;
  it('Trennstücke werden ohne Leerzeichen angefügt', () => {
    expect(wrapWords(['ONDFLÜ-', 'STERE'], measure, 500)).toEqual(['ONDFLÜ-STERE']);
    expect(wrapWords(['A', 'B', 'CD-', 'EF'], measure, 500)).toEqual(['A B CD-EF']);
  });
  it('bei Überlauf steht das Folgestück auf einer eigenen Zeile', () => {
    expect(wrapWords(['ONDFLÜ-', 'STERE'], measure, 80)).toEqual(['ONDFLÜ-', 'STERE']);
  });
  it('fitTitle + wrapWords: nie „- “ innerhalb einer Zeile', () => {
    const fit = fitTitle('SUPERLANGESWORT UND', 100, (t, px) => t.length * px * 0.6, 30, 17);
    const lines = wrapWords(fit.words, (t) => t.length * 17 * 0.6, 100);
    for (const l of lines) expect(l).not.toMatch(/- \S/);
    expect(lines.join('').replace(/[\s-]/g, '')).toBe('SUPERLANGESWORTUND');
  });
});

describe('N5: Palast-Leuchtschild ist eine Schildfläche', () => {
  const L = layoutOf(80);
  const c = L.city;
  it('signBoards enthält das Palast-Schild, ein Fenster darüber wird verworfen', () => {
    const ps = c.palast.sign;
    const boards = signBoards(c);
    const b = boards.find((q) => q.axis === 'z' && Math.abs(q.c - c.frame.sz) < 1e-6 && q.a0 < ps.x && q.a1 > ps.x && q.y0 < ps.y && q.y1 > ps.y);
    expect(b).toBeTruthy();
    expect(windowOnSign({ axis: 'z', x: ps.x, y: ps.y, z: c.frame.sz, w: 0.9, h: 1.3 }, boards)).toBe(true);
    for (const w of facadeWindows(c)) {
      if (w.axis !== 'z' || Math.abs(w.z - c.frame.sz) > 0.6) continue;
      expect(windowOnSign(w, [b])).toBe(false);
    }
  });
});

describe('N6b: Rowdy bricht bei kurzem Sprung nicht ab (Hysterese)', () => {
  const env = { allowed: [{ x0: -50, z0: -50, x1: 50, z1: 50 }], forbidden: [], spots: [] };
  const mk = () => { const m = createRowdy(0, { x: 0, z: 0 }); m.st = 'attack'; m.cool = 0; return m; };
  it('kurz über REACH_Y: bleibt im Angriff, kein Pöbeln', () => {
    const m = mk();
    const ev = [];
    for (let i = 0; i < 3; i++) ev.push(...stepRowdy(m, 0.1, { ...env, player: { x: 0.6, z: 0, y: REACH_Y + 0.5, safe: false } }));
    expect(m.st).toBe('attack');
    expect(ev.filter((e) => e.type === 'say')).toHaveLength(0);
    ev.push(...stepRowdy(m, 0.1, { ...env, player: { x: 0.6, z: 0, y: 0, safe: false } }));
    expect(m.over).toBe(0);
    expect(m.st).toBe('attack');
  });
  it('dauerhaft oben: nach REACH_LOST_S Pöbeln statt Schlag', () => {
    const m = mk();
    const ev = [];
    for (let i = 0; i < Math.ceil(REACH_LOST_S / 0.1) + 2; i++) ev.push(...stepRowdy(m, 0.1, { ...env, player: { x: 0.6, z: 0, y: REACH_Y + 0.5, safe: false } }));
    expect(m.st).toBe('taunt');
    expect(ev.filter((e) => e.type === 'say' && e.cat === 'taunt')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'strike')).toHaveLength(0);
  });
});
