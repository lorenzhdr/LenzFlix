// @vitest-environment jsdom
// 1.19.0 W6-Fix room: Plakattitel einpassen, Ultra-Anisotropie, Editor-Labels, Spiegel vor Schattenkarte, Gruß nach Tageszeit.
import { describe, it, expect, vi } from 'vitest';
import { Texture, Scene, Mesh, BoxGeometry, MeshLambertMaterial, DirectionalLight } from 'three';
import { fitTitle, POSTER_ART } from '../src/js/store3d/world/room-ultra-logic.js';
import { shadowsReady } from '../src/js/store3d/world/mirror.js';
import { createUltra } from '../src/js/store3d/engine/ultra.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import { makeTextures } from '../src/js/store3d/world/textures.js';
import ultraRoom from '../src/js/store3d/modules/ultra-room.js';
import { controlsFor, createEditorModel } from '../src/js/store3d/char/editor-model.js';
import { UNLOCK_TOPS, UNLOCK_GLASSES, UNLOCK_HATS, UNLOCK_BAGS, UNLOCK_BOTTOMS, UNLOCK_SHOES } from '../src/js/store3d/char/ids.js';
import { LINES } from '../src/js/store3d/npc/lines.js';

describe('fitTitle', () => {
  const measure = (t, px) => t.length * px * 0.8; // ~ Arial Black
  it('lässt kurze Titel bei voller Größe', () => {
    expect(fitTitle('TURBO OMA', 216, measure).px).toBe(30);
  });
  it('verkleinert, bis das breiteste Wort passt (alle Plakattitel)', () => {
    for (const a of POSTER_ART) {
      const r = fitTitle(a.title, 216, measure);
      expect(r.px).toBeLessThanOrEqual(30);
      for (const w of r.words) expect(measure(w, r.px)).toBeLessThanOrEqual(216);
    }
    expect(fitTitle('MONDFLÜSTERER', 216, measure).px).toBeLessThan(30);
  });
  it('trennt mit Bindestrich, wenn die Mindestgröße nicht reicht', () => {
    const r = fitTitle('SUPERLANGESWORTOHNEENDE', 100, measure, 30, 17);
    expect(r.px).toBe(17);
    expect(r.words.length).toBeGreaterThan(1);
    expect(r.words.slice(0, -1).every((w) => w.endsWith('-'))).toBe(true);
    for (const w of r.words) expect(measure(w, 17)).toBeLessThanOrEqual(100);
    expect(r.words.join('').replace(/-/g, '')).toBe('SUPERLANGESWORTOHNEENDE');
  });
});

describe('Ultra-Anisotropie bei high → ultra', () => {
  it('lädt gewärmte Texturen mit neuer Anisotropie neu hoch (needsUpdate)', () => {
    const ctxStub = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : () => ({ width: 10, addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
    HTMLCanvasElement.prototype.getContext = () => ctxStub;
    const depts = [{ id: 'a', label: 'Action', kind: 'free', color: '#ff0000', itemIds: ['a1'] }];
    const layout = buildLayout(depts, {});
    const scene = new Scene();
    const tex = makeTextures({ anisotropy: 16 });
    const mat = new MeshLambertMaterial({ map: tex.carpet });
    scene.add(new Mesh(new BoxGeometry(1, 1, 1), mat));
    const state = { level: 'high' };
    const ctx = { scene, layout, quality: () => state.level, opts: { ultraOk: true }, isPhone: false, addCollider: vi.fn(), addInteractable: vi.fn(), renderer: { capabilities: { getMaxAnisotropy: () => 16 }, domElement: { height: 800 } }, camera: { fov: 70 } };
    const jobs = [];
    const u = createUltra(ctx, { schedule: (fn) => { const j = { fn, cancel() { this.c = true; } }; jobs.push(j); return j; } });
    ctx.use = (n) => (n === 'ultra' ? u.api : undefined);
    const flush = () => { while (jobs.length) { const j = jobs.shift(); if (!j.c) j.fn(1000); } };
    ultraRoom.init(ctx);
    u.onQuality('high'); flush();
    // „Vorab-Upload“ bei high: Textur mit Anisotropie 1 (Anlage in buildTex)
    const desc = Object.getOwnPropertyDescriptor(Texture.prototype, 'needsUpdate');
    const hits = [];
    Object.defineProperty(Texture.prototype, 'needsUpdate', { ...desc, set(v) { hits.push(this); desc.set.call(this, v); } });
    state.level = 'ultra'; u.onQuality('ultra'); flush();
    Object.defineProperty(Texture.prototype, 'needsUpdate', desc);
    const t = mat.map;
    expect(t).not.toBe(tex.carpet);
    expect(t.anisotropy).toBe(16);
    expect(hits).toContain(t); // needsUpdate gesetzt → three lädt mit neuer Anisotropie neu hoch
  });
});

describe('Editor-Labels', () => {
  it('jede Freischalt-Label-Liste ist so lang wie die ID-Liste', () => {
    const m = createEditorModel({});
    const all = [];
    for (const t of ['top', 'bottom', 'shoes', 'extras', 'outfit', 'body']) {
      let cs; try { cs = controlsFor(t, m); } catch { continue; }
      for (const c of cs) for (const o of c.options || []) if (o.unlock) all.push(o);
    }
    const ids = [...UNLOCK_TOPS, ...UNLOCK_BOTTOMS, ...UNLOCK_SHOES, ...UNLOCK_GLASSES, ...UNLOCK_HATS, ...UNLOCK_BAGS];
    expect(all.length).toBe(ids.length);
    for (const o of all) expect(o.label).not.toBe(o.id);
  });
});

describe('Spiegel vor der Schattenkarte', () => {
  it('wartet, bis jede schattenwerfende Lampe eine Schattenkarte hat', () => {
    const scene = new Scene();
    const l = new DirectionalLight(0xffffff, 1);
    l.castShadow = true;
    scene.add(l);
    expect(shadowsReady({ shadowMap: { enabled: true } }, scene)).toBe(false);
    l.shadow.map = {};
    expect(shadowsReady({ shadowMap: { enabled: true } }, scene)).toBe(true);
  });
  it('ohne Schatten (low/mid) sofort bereit', () => {
    const scene = new Scene();
    const l = new DirectionalLight(0xffffff, 1);
    l.castShadow = true;
    scene.add(l);
    expect(shadowsReady({ shadowMap: { enabled: false } }, scene)).toBe(true);
    expect(shadowsReady({}, scene)).toBe(true);
  });
});

describe('Passanten-Gruß', () => {
  it('„Schönen Abend noch!“ nur im Nacht-Pool, nie im Tages-Gruß', () => {
    expect(LINES.hello).not.toContain('Schönen Abend noch!');
    expect(LINES.night).toContain('Schönen Abend noch!');
  });
});
