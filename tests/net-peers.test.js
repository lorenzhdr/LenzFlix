// @vitest-environment jsdom
// Mehrspieler (lfx-mp.1, Welle a): Fremdfiguren – reine Logik (net/peers-logic.js), Peers (net/peers.js), Namensschilder (net/tags.js),
// Hülle in der Hand (net/heldcover.js, Rechte-Filter). Kein Netzwerk: npc-Provider, Frame, proto und loadTexture sind Fakes.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Scene, PerspectiveCamera, Object3D, Texture } from 'three';
import * as L from '../src/js/store3d/net/peers-logic.js';
import { createPeers } from '../src/js/store3d/net/peers.js';
import { createHeldCover } from '../src/js/store3d/net/heldcover.js';
import { createTags } from '../src/js/store3d/net/tags.js';

import { createFrame } from '../src/js/store3d/net/frame.js';

const frame = createFrame({ w: 12.5, d: 18 });
const ID_A = 'a'.repeat(32);
const ID_B = 'b'.repeat(32);

describe('peers-logic (rein)', () => {
  it('Aussehen: deterministischer Seed aus k, verschieden für verschiedene k', () => {
    expect(L.lookSeed('abcdef012345')).toBe(L.lookSeed('abcdef012345'));
    expect(L.lookSeed('abcdef012345')).not.toBe(L.lookSeed('abcdef012346'));
    expect(L.fnv1a32('')).toBe(0x811c9dc5);
  });

  it('decodePose: cm → m über frame.dec, cRad → rad, Klemmen auf gültige Codes, ungültig → null', () => {
    const p = L.decodePose(frame, { x: 250, y: 10, z: -40, yaw: 157, pitch: -50, a: 2, r: 1, se: [1, 500] });
    expect(p).toMatchObject({ x: 2.5, y: 0.1, z: -0.4, yaw: 1.57, pitch: -0.5, a: 2, r: 1, se: [1, 500] });
    expect(L.decodePose(frame, { x: NaN, z: 0 })).toBeNull();
    expect(L.decodePose(frame, { x: 0, z: 0, a: 99 }).a).toBe(0);
    expect(L.decodePose({ dec: () => [1, 2, 3] }, { x: 0, z: 0 })).toMatchObject({ x: 1, y: 2, z: 3 });
    expect(L.decodePose(createFrame({ w: 12.5, d: 18 }), { x: 250, y: 10, z: 100, r: 0 })).toMatchObject({ x: 2.5, y: 0.1, z: 1 });
  });

  it('bodyState: Geschwindigkeit aus zwei Posen, geklemmt; Sitzen/Wurf → Body-Code 0', () => {
    const prev = { t: 1000, s: { x: 0, y: 0, z: 0 } };
    const cur = { x: 1, y: 0, z: 0, yaw: 0, pitch: 0, a: 7 };
    const st = L.bodyState(cur, prev, 1250);
    expect(st.vx).toBeCloseTo(4, 5);
    expect(st.a).toBe(0);
    expect(L.bodyState({ ...cur, x: 100 }, prev, 1001).vx).toBe(L.V_MAX);
    expect(L.bodyState(cur, null, 1000).vx).toBe(0);
  });

  it('Lücke > 300 ms speist neu ein; Zeitleiste verwirft Veraltetes, entryAt liefert den letzten Eintrag ≤ t', () => {
    expect(L.needRefeed(1000, 1301)).toBe(true);
    expect(L.needRefeed(1000, 1300)).toBe(false);
    const tl = [];
    expect(L.pushTimeline(tl, 100, { a: 1, r: 0 })).toBe(true);
    expect(L.pushTimeline(tl, 100, { a: 2, r: 0 })).toBe(false);
    expect(L.pushTimeline(tl, 300, { a: 2, r: 0 })).toBe(true);
    expect(L.entryAt(tl, 50).a).toBe(1);
    expect(L.entryAt(tl, 299).a).toBe(1);
    expect(L.entryAt(tl, 300).a).toBe(2);
    for (let i = 0; i < 40; i++) L.pushTimeline(tl, 400 + i, { a: 0, r: 0 });
    expect(tl.length).toBe(L.TIMELINE);
  });

  it('Animationscodes: Tabelle aus proto, Einmal-Animationen nur beim Codewechsel', () => {
    expect(L.animName(1)).toBe('walk');
    expect(L.animName(7)).toBe('sit');
    expect(L.animName(42)).toBe('idle');
    expect(L.animFor(6, 0, 0)).toMatchObject({ name: 'hit', restart: true, apply: true });
    expect(L.animFor(6, 6, 0)).toMatchObject({ name: 'hit', apply: false });
    expect(L.animFor(1, 1, 1.4)).toMatchObject({ name: 'walk', speed: 1.4, apply: true });
    expect(L.animFor(0, 1, 1.4)).toMatchObject({ name: 'idle', speed: 0 });
  });

  it('LOD: low = npcMax, mid 10, high 16, VR 4 (low 3); Hülle nach Stufe', () => {
    expect(L.lodFor('low', false, false)).toMatchObject({ max: 8, hand: 'none', tagDist: 12 });
    expect(L.lodFor('low', true, false).max).toBe(5);
    expect(L.lodFor('mid', false, false)).toMatchObject({ max: 10, hand: 'cover', coverDist: 10, tagDist: 16 });
    expect(L.lodFor('high', false, false)).toMatchObject({ max: 16, coverDist: 14, tagDist: 20 });
    expect(L.lodFor('high', false, true)).toMatchObject({ max: 4, hand: 'neutral', tag3d: 3, tag3dDist: 10 });
    expect(L.lodFor('low', false, true).max).toBe(3);
  });

  it('pickFigures: nächste zuerst, vorhandene Figur mit Trägheit, Ferne ausgeschlossen', () => {
    const cands = [{ c: 1, d: 5, has: false }, { c: 2, d: 4, has: false }, { c: 3, d: 4.8, has: true }, { c: 4, d: 80, has: false }];
    expect([...L.pickFigures(cands, 2)].sort()).toEqual([2, 3]);
    expect([...L.pickFigures(cands, 10)].sort()).toEqual([1, 2, 3]);
    expect(L.pickFigures(cands, 0).size).toBe(0);
  });

  it('Namen, Item-IDs, Geräte, Bereichssichtbarkeit', () => {
    expect(L.displayName('Max', 1)).toBe('Max');
    expect(L.displayName('Max', 0)).toBe('Jemand');
    expect(L.displayName('', 1)).toBe('Jemand');
    expect(L.cleanItemId(ID_A)).toBe(ID_A);
    expect(L.cleanItemId('xyz')).toBeNull();
    expect(L.cleanItemId(null)).toBeNull();
    expect([...L.deviceCounts([{ k: 'a' }, { k: 'a' }, { k: 'b' }], 'a')]).toEqual([['a', 3], ['b', 1]]);
    expect(L.regionVisible('shop', { shopShell: false })).toBe(false);
    expect(L.regionVisible('palastHall', { palastInterior: false })).toBe(false);
    expect(L.regionVisible('palastHall', { palastInterior: true })).toBe(true);
    expect(L.regionVisible('yard', { yard: false })).toBe(false);
    expect(L.regionVisible('street', {})).toBe(true);
  });
});

// ------------------------------------------------------------------ Peers mit Fakes
function fakeFigure(o) {
  const root = new Object3D();
  root.visible = true;
  const armR = new Object3D();
  root.add(armR);
  if (o.parent) o.parent.add(root);
  const f = {
    root, look: o.look, bones: { armR }, disposed: false,
    setAnim: vi.fn(), setName: vi.fn(),
    headWorld: (out) => out.set(root.position.x, root.position.y + 1.9, root.position.z),
    dispose: vi.fn(() => { f.disposed = true; if (root.parent) root.parent.remove(root); }),
  };
  return f;
}

describe('createPeers', () => {
  let env = null;
  afterEach(() => { if (env) { env.peers.dispose(); env.dom.remove(); } env = null; });

  function setup(o = {}) {
    const dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    document.body.appendChild(dom);
    const figs = [];
    const state = { level: o.level || 'high', xr: false, now: 10000, area: 'street', vis: { street: true, palastInterior: true, yard: true, shopShell: true } };
    const npc = {
      figure: vi.fn((fo) => { const f = fakeFigure(fo); figs.push(f); return f; }),
      reserve: vi.fn(),
    };
    const tex = new Texture();
    tex.dispose = vi.fn();
    const items = new Map();
    const providers = {
      npc,
      areas: { at: vi.fn(() => state.area) },
      city: { visible: () => state.vis },
      ...(o.providers || {}),
    };
    const ctx = {
      scene: new Scene(), camera: new PerspectiveCamera(70, 1.5, 0.05, 90), renderer: { domElement: canvas },
      isPhone: false, isTouch: false, quality: () => state.level, xr: { presenting: () => state.xr },
      catalog: { items }, deps: { imageUrl: vi.fn((id) => `/img/${id}`) },
      loadTexture: vi.fn(async () => tex),
      use: (n) => providers[n],
    };
    ctx.camera.position.set(0, 1.6, 0);
    const core = { ctx, frame, serverNow: () => state.now, me: () => ({ c: 1, k: 'aaaaaaaaaaaa' }) };
    const peers = createPeers(core);
    env = { dom, ctx, state, npc, figs, items, tex, providers, peers, core };
    return env;
  }
  const peer = (c, extra = {}) => ({ c, k: String(c).padStart(12, '0'), n: 'P' + c, f: 1, q: [300 + c * 10, 0, 400, 0, 0, 0, 0], ...extra });
  const run = (e, ms, step = 50) => { for (let t = 0; t < ms; t += step) { e.state.now += step; e.peers.tick(step / 1000); } };

  it('Figur entsteht erst nach Pose + tick: über npc.figure, parent scene, Aussehen aus k', () => {
    const e = setup();
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(2)] });
    expect(e.npc.figure).not.toHaveBeenCalled();
    run(e, 100);
    expect(e.npc.figure).toHaveBeenCalledTimes(1);
    const arg = e.npc.figure.mock.calls[0][0];
    expect(arg.parent).toBe(e.ctx.scene);
    expect(arg.look).toBeTruthy();
    expect(arg.name).toBeUndefined();
    // gleiches k → gleiches Aussehen (zweite Sitzung)
    const first = JSON.stringify(arg.look);
    const e2dom = e.peers;
    e2dom.clear();
    e2dom.welcome({ c: 1, s: 10000, peers: [peer(2)] });
    run(e, 100);
    expect(JSON.stringify(e.npc.figure.mock.calls[1][0].look)).toBe(first);
    expect(e.figs[0].root.position.x).toBeCloseTo(3.2, 1);
  });

  it('Interpolation mit 250 ms Anzeigeverzögerung', () => {
    const e = setup();
    e.peers.welcome({ c: 1, s: 10000, peers: [{ ...peer(2), q: [500, 0, 300, 0, 0, 2, 0] }] });
    e.peers.ev({ t: 'b', s: 10100, p: [[2, 600, 0, 300, 0, 0, 2, 0, 0]], ev: [] });
    e.state.now = 10000;
    run(e, 300); // Anzeigezeit 10050 → x ≈ 5.5
    const f = e.figs[0];
    expect(f.root.position.x).toBeGreaterThan(5.4);
    expect(f.root.position.x).toBeLessThan(5.6);
    expect(f.setAnim).toHaveBeenCalledWith('run', expect.objectContaining({ speed: expect.any(Number) }));
  });

  it('eigene Verbindung (c) und unbekannte Peers werden ignoriert', () => {
    const e = setup();
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(1), peer(2)] });
    expect(e.peers.count()).toBe(1);
    e.peers.ev({ t: 'b', s: 10100, p: [[1, 0, 0, 0, 0, 0, 0, 0, 0], [9, 0, 0, 0, 0, 0, 0, 0, 0]], ev: [] });
    expect(e.peers.count()).toBe(1);
  });

  it('j / l / pf: Beitreten, Verlassen (Figur freigegeben), Flags und Name', () => {
    const e = setup();
    e.peers.welcome({ c: 1, s: 10000, peers: [] });
    e.peers.ev({ t: 'j', ...peer(3) });
    run(e, 100);
    expect(e.figs.length).toBe(1);
    expect(e.peers.name(3)).toBe('P3');
    e.peers.ev({ t: 'pf', c: 3, f: 0, n: '' });
    expect(e.peers.name(3)).toBe('Jemand');
    e.peers.ev({ t: 'l', c: 3, r: 'bye' });
    expect(e.figs[0].dispose).toHaveBeenCalled();
    expect(e.peers.count()).toBe(0);
  });

  it('gleiches k mehrfach: je Verbindung eine Figur, Liste zeigt devs', () => {
    const e = setup();
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(2, { k: 'cccccccccccc' }), peer(3, { k: 'cccccccccccc' }), peer(4, { k: 'aaaaaaaaaaaa' })] });
    run(e, 100);
    expect(e.figs.length).toBe(3);
    const l = e.peers.list();
    expect(l.find((p) => p.c === 2).devs).toBe(2);
    expect(l.find((p) => p.c === 4).devs).toBe(2); // plus ich selbst
  });

  it('Sichtbarkeit nach Bereich: Laden-Hülle aus → keine Figur', () => {
    const e = setup();
    e.state.area = 'shop';
    e.state.vis = { shopShell: false, street: true };
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(2)] });
    run(e, 100);
    expect(e.figs.length).toBe(0);
    e.state.vis = { shopShell: true, street: true };
    run(e, 400);
    expect(e.figs.length).toBe(1);
    e.state.vis = { shopShell: false, street: true };
    run(e, 400);
    expect(e.figs[0].dispose).toHaveBeenCalled();
  });

  it('Begrenzung: low 8 (Desktop), mid 10, VR 3/4; Rest ohne Figur', () => {
    const many = Array.from({ length: 14 }, (_, i) => peer(i + 2));
    for (const [level, xr, max] of [['low', false, 8], ['mid', false, 10], ['high', false, 14], ['low', true, 3], ['high', true, 4]]) {
      const e = setup({ level });
      e.state.xr = xr;
      e.peers.welcome({ c: 1, s: 10000, peers: many });
      run(e, 100);
      expect(e.peers.stats().figures).toBe(max);
      e.peers.dispose(); e.dom.remove(); env = null;
    }
  });

  it('Draw-Call-Ausgleich: bei low reserve(n) = Zahl der Figuren, bei mid 0, am Ende 0', () => {
    const e = setup({ level: 'low' });
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(2), peer(3), peer(4)] });
    run(e, 100);
    expect(e.npc.reserve).toHaveBeenLastCalledWith(3);
    e.state.level = 'mid';
    e.peers.onQuality();
    run(e, 100);
    expect(e.npc.reserve).toHaveBeenLastCalledWith(0);
    e.state.level = 'low';
    run(e, 100);
    e.peers.dispose();
    expect(e.npc.reserve).toHaveBeenLastCalledWith(0);
    expect(document.querySelectorAll('.lfx-mp-tag').length).toBe(0);
    env = null;
    e.dom.remove();
  });

  it('Namensschild: DOM, pointer-events none, nur textContent, nur bei Namens-Flag; Ferne', () => {
    const e = setup({ level: 'mid' });
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(2, { n: '<img src=x onerror=1>' }), peer(3, { f: 0 })] });
    run(e, 100);
    const tagEls = e.dom.querySelectorAll('.lfx-mp-tag');
    expect(tagEls.length).toBe(1);
    expect(tagEls[0].style.pointerEvents).toBe('none');
    expect(tagEls[0].textContent).toBe('<img src=x onerror=1>');
    expect(tagEls[0].children.length).toBe(0);
  });

  it('VR: kein DOM-Schild, 3D-Schild nur bei presenting für die nächsten 3 innerhalb 10 m', () => {
    const e = setup({ level: 'high' });
    e.state.xr = true;
    const ps = [2, 3, 4, 5].map((c) => peer(c, { q: [100 * c, 0, 0, 0, 0, 0, 0] }));
    ps.push(peer(6, { q: [1500, 0, 0, 0, 0, 0, 0] }));
    e.peers.welcome({ c: 1, s: 10000, peers: ps });
    run(e, 100);
    expect(e.dom.querySelectorAll('.lfx-mp-tag:not([hidden])').length).toBe(0);
    const named = e.figs.filter((f) => f.setName.mock.calls.some((c) => c[0]));
    expect(named.length).toBe(3);
  });

  it('Sitzen im Saal: a=7 + se → zugewiesener Sitz, Anim sit; Aufstehen gibt den Sitz frei', () => {
    const seats = [0, 1, 2, 3].map((j) => ({ id: 'A' + (j + 1), row: 0, x: 4 + j, y: 1.15 + 0.3, z: 40, yaw: Math.PI, base: 0.3 }));
    const e = setup({ providers: { palast: { plan: { seats } } } });
    e.state.area = 'palastHall';
    e.peers.welcome({ c: 1, s: 10000, peers: [{ ...peer(2), q: [100, 0, 4000, 0, 0, 7, 1], se: [0, 1000] }] });
    run(e, 400);
    const f = e.figs[0];
    expect(f.root.position.x).toBeCloseTo(7, 5);
    expect(f.root.position.y).toBeCloseTo(0.3, 5);
    expect(f.root.position.z).toBeCloseTo(40, 5);
    expect(f.setAnim).toHaveBeenLastCalledWith('sit', expect.anything());
    e.peers.ev({ t: 'b', s: e.state.now, p: [[2, 100, 0, 4000, 0, 0, 0, 1, 0]], ev: [] });
    run(e, 600);
    expect(f.root.position.x).toBeCloseTo(1, 1);
  });

  it('Hülle in der Hand: nur ID im eigenen Katalog zeigt Cover, sonst neutral (kein Bildabruf); low keine Hülle', async () => {
    const e = setup({ level: 'high' });
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(2, { f: 3, h: ID_A }), peer(3, { f: 3, h: ID_B })] });
    e.items.set(ID_B, { Id: ID_B, ImageTags: { Primary: 'tag1' } });
    run(e, 100);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const s = e.peers.stats().held;
    expect(s.held).toBe(2);
    expect(s.withCover).toBe(1);
    expect(e.ctx.loadTexture).toHaveBeenCalledTimes(1);
    expect(e.ctx.deps.imageUrl).toHaveBeenCalledWith(ID_B, expect.objectContaining({ maxWidth: 160, tag: 'tag1' }));
    // ohne Film-Flag geht die Hülle nicht in die Hand
    e.peers.ev({ t: 'pf', c: 2, f: 1, n: 'P2', h: ID_A });
    run(e, 400);
    expect(e.peers.stats().held.held).toBe(1);
    // low: keine
    e.state.level = 'low';
    run(e, 400);
    expect(e.peers.stats().held.held).toBe(0);
  });

  it('Lücke > 300 ms: kein Sprung über die Lücke, Figur folgt ohne Dauerverzögerung', () => {
    const e = setup();
    e.peers.welcome({ c: 1, s: 10000, peers: [{ ...peer(2), q: [0, 0, 400, 0, 0, 0, 0] }] });
    run(e, 200);
    e.state.now = 12000;
    e.peers.ev({ t: 'b', s: 12000, p: [[2, 200, 0, 400, 0, 0, 1, 0, 0]], ev: [] });
    run(e, 100);
    const x1 = e.figs[0].root.position.x;
    run(e, 400);
    expect(e.figs[0].root.position.x).toBeGreaterThanOrEqual(x1);
    expect(e.figs[0].root.position.x).toBeCloseTo(2, 0);
  });

  it('onFigure meldet add/remove; setActive(false) räumt Figuren und DOM', () => {
    const e = setup();
    const log = [];
    e.peers.onFigure((k, p) => log.push(k + p.c));
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(2)] });
    run(e, 100);
    expect(log).toEqual(['add2']);
    e.peers.setActive(false);
    expect(log).toEqual(['add2', 'remove2']);
    expect(e.dom.querySelectorAll('.lfx-mp-tag').length).toBe(0);
    run(e, 400);
    expect(e.figs.length).toBe(1);
    e.peers.setActive(true);
    run(e, 400);
    expect(e.figs.length).toBe(2);
  });

  it('ohne npc-Provider: keine Figuren, Liste und Namen funktionieren', () => {
    const e = setup({ providers: { npc: null } });
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(2)] });
    run(e, 200);
    expect(e.peers.stats().figures).toBe(0);
    expect(e.peers.list().length).toBe(1);
  });
});

describe('heldcover / tags (Einzelfälle)', () => {
  it('heldcover.set verlangt gültige 32-Hex-ID; dispose entfernt Meshes und Texturen', async () => {
    const tex = new Texture();
    tex.dispose = vi.fn();
    const items = new Map([[ID_A, { Id: ID_A, ImageTags: { Primary: 't' } }]]);
    const ctx = { catalog: { items }, deps: { imageUrl: () => '/x' }, loadTexture: vi.fn(async () => tex) };
    const hc = createHeldCover(ctx);
    const fig = fakeFigure({});
    hc.set(1, fig, 'nope', 'cover');
    expect(hc.stats().held).toBe(0);
    hc.set(1, fig, ID_A, 'cover');
    await new Promise((r) => setTimeout(r, 0));
    expect(hc.stats()).toMatchObject({ held: 1, withCover: 1 });
    expect(fig.bones.armR.children.length).toBe(1);
    hc.dispose();
    expect(fig.bones.armR.children.length).toBe(0);
    expect(tex.dispose).toHaveBeenCalled();
  });

  it('heldcover: LRU hält höchstens 8 unbenutzte Texturen', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => i.toString(16).padStart(32, '0'));
    const items = new Map(ids.map((id) => [id, { Id: id, ImageTags: { Primary: 't' } }]));
    const texes = [];
    const ctx = { catalog: { items }, deps: { imageUrl: () => '/x' }, loadTexture: vi.fn(async () => { const t = new Texture(); t.dispose = vi.fn(); texes.push(t); return t; }) };
    const hc = createHeldCover(ctx);
    const fig = fakeFigure({});
    for (const id of ids) { hc.set(1, fig, id, 'cover'); await new Promise((r) => setTimeout(r, 0)); }
    hc.clear(1);
    hc.set(1, fig, ids[11], 'cover');
    expect(hc.stats().textures).toBeLessThanOrEqual(9);
    hc.dispose();
  });

  it('tags: Schild verschwindet bei Ferne und beim Entfernen der Figur', () => {
    const dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    const ctx = { renderer: { domElement: canvas }, camera: new PerspectiveCamera(), isTouch: false, xr: { presenting: () => false } };
    const tags = createTags(ctx);
    const fig = fakeFigure({});
    tags.sync([{ c: 1, fig, text: 'Max', dist: 30 }], { tagDist: 16 });
    expect(tags.stats().dom).toBe(0);
    tags.sync([{ c: 1, fig, text: 'Max', dist: 5 }], { tagDist: 16 });
    fig.root.position.set(0, 0, -5);
    tags.update();
    expect(tags.stats().dom).toBe(1);
    tags.sync([], { tagDist: 16 });
    expect(dom.querySelectorAll('.lfx-mp-tag').length).toBe(0);
    tags.dispose();
  });
});
