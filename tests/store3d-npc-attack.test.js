// @vitest-environment jsdom
// 1.18.0 Welle 6 (Coder B): Angriffe der Passanten (attack-logic), Provokations-Gedächtnis des Personals (aggro-logic), Wurf-Logik (throw-logic)
// und die Verdrahtung im Modul npc (Temperament, hitzköpfig greift an, ängstlich flieht, VR/Schutz: kein Angriff, Pool = 1 InstancedMesh).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { Scene, PerspectiveCamera, Group, InstancedMesh } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import npc from '../src/js/store3d/modules/npc.js';
import { ATK, attackItem, createAttack, createBlind, stepAttack, stunAttack, nearestOnGraph } from '../src/js/store3d/npc/attack-logic.js';
import { createAggro, provoke, stepAggro, AGGRO } from '../src/js/store3d/npc/aggro-logic.js';
import { createThrow, stepThrow, THROW, THROW_DMG } from '../src/js/store3d/npc/throw-logic.js';
import { temperOf } from '../src/js/store3d/npc/temper-logic.js';

describe('npc/attack-logic', () => {
  const env = (o = {}) => ({ clock: 0, target: { x: 6, z: 0 }, free: () => true, stop: false, rand: () => 0.5, ...o });
  const run = (a, secs, e, dt = 0.05) => { const out = []; for (let t = 0; t < secs; t += dt) { e.clock += dt; out.push(...stepAttack(a, dt, e)); if (out.some((x) => x.type === 'end')) break; } return out; };

  it('Gegenstand aus dem Look: Schirm, Tasche, Tüte, Rucksack → Tasche, sonst Faust', () => {
    expect(attackItem({ umbrella: true, bag: 'bag' })).toBe('umbrella');
    expect(attackItem({ bag: 'bag' })).toBe('bag');
    expect(attackItem({ bag: 'backpack' })).toBe('bag');
    expect(attackItem({ bag: 'shopping' })).toBe('shopping');
    expect(attackItem({ bag: null })).toBe(null);
    expect(attackItem(null)).toBe(null);
  });

  it('Drohen (Ärmel, dann Drohpose), Verfolgen, Zuschlagen: Faust 8, Gegenstand 11, Schlag nur in Reichweite', () => {
    const a = createAttack({ x: 0, z: 0, until: 8, attack: true });
    const e = env();
    const ev = run(a, 12, e);
    const anims = ev.filter((x) => x.type === 'anim').map((x) => x.name);
    expect(anims.slice(0, 3)).toEqual(['sleeves', 'threat', 'run']);
    expect(ev.some((x) => x.type === 'say' && x.cat === 'attackHot')).toBe(true);
    const strike = ev.find((x) => x.type === 'strike');
    expect(strike).toBeTruthy();
    expect(strike.dmg).toBe(ATK.dmgFist);
    expect(Math.hypot(a.x - e.target.x, a.z - e.target.z)).toBeLessThan(ATK.reach + 0.5);
    const b = createAttack({ x: 0, z: 0, until: 8, attack: true, item: 'bag' });
    const s2 = run(b, 12, env()).find((x) => x.type === 'strike');
    expect(s2.dmg).toBe(ATK.dmgItem);
    expect(s2.item).toBe('bag');
  });

  it('Verfolgung endet nach höchstens 8 s (timeout), nur Drohen endet nach der Drohung', () => {
    const a = createAttack({ x: 0, z: 0, until: 8, attack: true });
    const e = env({ target: { x: 300, z: 0 } }); // unerreichbar weit
    const far = run(a, 20, e);
    expect(far.find((x) => x.type === 'end').reason).toBe('far');
    const b = createAttack({ x: 0, z: 0, until: 8, attack: true });
    const e2 = env({ target: { x: 17, z: 0 } });
    const ev = run(b, 30, e2);
    const end = ev.find((x) => x.type === 'end');
    expect(end.reason).toBe('timeout');
    expect(e2.clock).toBeLessThan(8.2);
    const c = createAttack({ x: 0, z: 0, until: 8, attack: false });
    expect(run(c, 5, env()).find((x) => x.type === 'end').reason).toBe('threatDone');
  });

  it('Schutz/VR (stop) und versperrter Weg beenden den Angriff, Treffer wirft aus dem Tritt', () => {
    const a = createAttack({ x: 0, z: 0, until: 8, attack: true });
    expect(run(a, 1, env({ stop: true })).find((x) => x.type === 'end').reason).toBe('stop');
    const b = createAttack({ x: 0, z: 0, until: 99, attack: true });
    b.phase = 'chase';
    expect(run(b, 5, env({ free: () => false })).find((x) => x.type === 'end').reason).toBe('blocked');
    const c = createAttack({ x: 0, z: 0, until: 99, attack: true });
    c.phase = 'chase';
    run(c, 0.5, env());
    const x0 = c.x;
    stunAttack(c);
    stepAttack(c, 0.1, env());
    expect(c.x).toBe(x0);
  });

  it('Geblendet: Hände vor den Augen 2 s, danach Angriff (hitzköpfig) oder Flucht', () => {
    const f = createBlind({ x: 0, z: 0, then: 'flee' });
    const ev = run(f, 5, env({ target: null }));
    expect(ev[0]).toMatchObject({ type: 'anim', name: 'cover' });
    expect(ev.some((x) => x.type === 'say' && x.cat === 'blinded')).toBe(true);
    expect(ev.find((x) => x.type === 'end')).toMatchObject({ reason: 'blind', then: 'flee' });
    const h = createBlind({ x: 0, z: 0, then: 'attack' });
    const e = env();
    const ev2 = run(h, 6, e);
    expect(h.phase === 'chase' || h.phase === 'swing').toBe(true);
    expect(h.attack).toBe(true);
    expect(ev2.some((x) => x.type === 'strike')).toBe(true);
  });

  it('Geblendet: bei erreichter Angreifer-Obergrenze (env.canAttack false) wird der Hitzkopf nach der Blendung zur Flucht statt Angriff', () => {
    const h = createBlind({ x: 0, z: 0, then: 'attack' });
    const ev = run(h, 6, env({ canAttack: () => false }));
    expect(h.attack).toBe(false);
    expect(ev.find((x) => x.type === 'end')).toMatchObject({ reason: 'blind', then: 'flee' });
    expect(ev.some((x) => x.type === 'strike')).toBe(false);
    const ok = createBlind({ x: 0, z: 0, then: 'attack' });
    run(ok, 3, env({ canAttack: () => true }));
    expect(ok.attack).toBe(true);
  });

  it('nearestOnGraph: nächster Kantenpunkt ohne Ampelkanten', () => {
    const g = { edges: [{ id: 0, ax: 0, az: 0, bx: 10, bz: 0, wait: null, path: 'a' }, { id: 1, ax: 0, az: 2, bx: 10, bz: 2, wait: 'main', path: 'b' }] };
    const r = nearestOnGraph(g, 4, 1.5);
    expect(r.edge).toBe(0);
    expect(r.t).toBeCloseTo(0.4, 5);
    expect(nearestOnGraph(g, 4, 1.5, (e) => e.path === 'a')).toBe(null);
  });
});

describe('npc/aggro-logic', () => {
  it('Gabi droht beim 1. Schlag, schlägt beim 2. innerhalb von 8 s (nach der Drohfrist); Gedächtnis verfällt', () => {
    const a = createAggro('gabi');
    expect(provoke(a, 0)).toBe('threat');
    expect(provoke(a, 3)).toBe('attack');
    expect(stepAggro(a, 3.5)).toBe(null);
    expect(stepAggro(a, 3 + AGGRO.gabi.threatS)).toBe('swing');
    expect(stepAggro(a, 3 + AGGRO.gabi.threatS + 0.1)).toBe(null);
    const b = createAggro('gabi');
    expect(provoke(b, 0)).toBe('threat');
    expect(provoke(b, 20)).toBe('threat'); // vergessen
  });
  it('Ronny schlägt schon beim 1. Schlag, mit Abklingzeit; danach beruhigt er sich', () => {
    const a = createAggro('ronny');
    expect(provoke(a, 0)).toBe('attack');
    expect(provoke(a, 1)).toBe('threat'); // Abklingzeit
    expect(stepAggro(a, 1.1)).toBe('swing');
    expect(stepAggro(a, 20)).toBe('calm');
    expect(stepAggro(a, 21)).toBe(null);
  });
  it('Kioskfrau und Popcorn werfen mit Abklingzeit', () => {
    for (const role of ['kiosk', 'popcorn']) {
      const a = createAggro(role);
      expect(provoke(a, 0)).toBe('throw');
      expect(provoke(a, 1)).toBe(null);
      expect(provoke(a, AGGRO[role].cool + 1)).toBe('throw');
      expect(stepAggro(a, AGGRO[role].cool + 1 + AGGRO[role].hold)).toBe('calm');
    }
  });
});

describe('npc/throw-logic', () => {
  it('Parabel vom Werfer zum Ziel; Treffer nur, wenn der Spieler bei der Ankunft am Zielpunkt steht (Ausweichen möglich)', () => {
    const from = { x: 0, y: 1.3, z: 0 };
    const to = { x: 4, y: 1.2, z: 0 };
    const p = createThrow('candy', from, to);
    expect(p.dur).toBeGreaterThanOrEqual(THROW.minDur);
    let peak = 0;
    let r;
    for (let t = 0; t < 3 && !(r && r.arrived); t += 0.02) { r = stepThrow(p, 0.02, { x: 4, z: 0, y: 0 }); peak = Math.max(peak, p.y); }
    expect(peak).toBeGreaterThan(1.3);
    expect(r).toEqual({ arrived: true, hit: true });
    const q = createThrow('popcorn', from, to);
    let r2;
    for (let t = 0; t < 3 && !(r2 && r2.arrived); t += 0.02) r2 = stepThrow(q, 0.02, { x: 7, z: 2, y: 0 });
    expect(r2.hit).toBe(false);
    expect(THROW_DMG.candy).toBeGreaterThan(0);
  });
});

function mkCanvasCtx() {
  return function getContext() {
    return new Proxy({}, {
      get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))),
      set: (t, k, v) => { t[k] = v; return true; },
    });
  };
}

describe('Modul npc: Provokation und Angriff', () => {
  let host;
  let dom;
  let app;
  let hits;
  let sounds;
  let fightState;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  beforeEach(() => { HTMLCanvasElement.prototype.getContext = mkCanvasCtx(); });
  afterEach(() => {
    if (host) host.hook('dispose');
    host = null;
    if (dom) dom.remove();
    HTMLCanvasElement.prototype.getContext = realGetContext;
    MODULES.length = 0;
    delete window.__lfxM4;
  });

  async function build() {
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ['c1'] }]);
    hits = [];
    sounds = [];
    fightState = { protected: false };
    const groups = { street: new Group(), yard: new Group(), palast: new Group(), palastInterior: new Group() };
    const fakeCity = {
      name: 'fakecity',
      init(ctx) {
        for (const g of Object.values(groups)) ctx.scene.add(g);
        ctx.provide('city', { data: layout.city, groups, signals: () => ({ main: 'green', side: 'red', walkMain: false, walkSide: true }), visible: () => ({}) });
        ctx.provide('weather', { tod: 'day', raining: false, hour: 14 });
        ctx.provide('discover', { found: () => true, has: () => false, list: () => [] });
        ctx.provide('sound', { play: (n) => sounds.push(n) });
        ctx.provide('fight', { weapon: () => 'hand', protected: () => fightState.protected, hitPlayer: (o) => { hits.push(o); return true; } });
      },
    };
    MODULES.length = 0;
    MODULES.push(fakeCity, npc);
    dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    document.body.appendChild(dom);
    const state = { x: 10, z: 20, yaw: 0, pitch: 0 };
    const camera = new PerspectiveCamera(70, 1.5, 0.05, 90);
    app = {
      layout, deps: { catalog: { items: new Map(), departments: [], highlights: [], resume: [] }, toast: vi.fn(), user: { name: 'Max' } },
      opts: { debug: true, devFlags: { npc: true, cars: true } }, phone: false, touch: false, sound: false, mode: 'play',
      engine: { scene: new Scene(), camera, renderer: { domElement: canvas }, preset: { level: 'high' } },
      player: { ...state, y: 0, state, cancelPath() {}, teleport: vi.fn(), knock: vi.fn(), moved: 0 },
      setMode(m) { app.mode = m; }, holdview: { isOpen: false }, findSlot: () => null, take: vi.fn(), host: dom,
    };
    host = new ModuleHost(app);
    await host.init();
    return app;
  }
  const place = (x, z, yaw = 0, y = 0) => { app.player.state.x = x; app.player.state.z = z; app.player.state.yaw = yaw; app.player.x = x; app.player.z = z; app.player.y = y; };
  const tick = (n, dt = 0.05) => { for (let i = 0; i < n; i++) host.hook('update', dt, i * dt); };
  /** Baut neu, bis ein Passant mit dem gewünschten Temperament existiert. */
  async function withTemper(t) {
    for (let i = 0; i < 25; i++) {
      await build();
      tick(2);
      const p = host.ctx.use('npc');
      const person = p.people().find((q) => q.kind === 'walker' && p.temperOf(q.handle) === t);
      if (person) return { p, person };
      host.hook('dispose'); dom.remove(); MODULES.length = 0;
    }
    throw new Error('kein Passant mit Temperament ' + t);
  }

  it('Temperament folgt dem Seed (Provider temperOf liefert nur bekannte Werte)', async () => {
    await build();
    const p = host.ctx.use('npc');
    for (const q of p.people().filter((x) => x.kind === 'walker')) expect(['shy', 'normal', 'hot']).toContain(p.temperOf(q.handle));
    expect(temperOf(5)).toBe(temperOf(5));
    expect(p.temperOf({})).toBe('normal');
  });

  it('hitzköpfig: Schlag → droht, greift an (Gegenstand in der Hand), trifft den Spieler per fight.hitPlayer({ src: npc })', async () => {
    const { p, person } = await withTemper('hot');
    place(person.x + 1.1, person.z, 0);
    person.handle.hitReact({ x: 1, z: 0 });
    let maxAtt = 0;
    for (let i = 0; i < 160 && !hits.length; i++) { tick(1); maxAtt = Math.max(maxAtt, p.attackers()); }
    expect(maxAtt).toBeGreaterThanOrEqual(1);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].src).toBe('npc');
    expect(hits[0].dmg).toBeGreaterThan(0);
    expect(Math.hypot(hits[0].knock.x, hits[0].knock.z)).toBeCloseTo(1, 3);
  });

  it('hitzköpfig: kein Angriff in VR und bei Schutz (Drohen statt Schlag), kein Treffer', async () => {
    const { p, person } = await withTemper('hot');
    app.xr = { presenting: true };
    place(person.x + 1.1, person.z, 0);
    person.handle.hitReact({ x: 1, z: 0 });
    tick(160);
    expect(hits.length).toBe(0);
    expect(p.attackers()).toBe(0);
    const g = await withTemper('hot');
    fightState.protected = true;
    place(g.person.x + 1.1, g.person.z, 0);
    g.person.handle.hitReact({ x: 1, z: 0 });
    tick(160);
    expect(hits.length).toBe(0);
  });

  it('ängstlich flieht wie bisher (kein Angriff)', async () => {
    const { p, person } = await withTemper('shy');
    place(person.x + 1.1, person.z, 0);
    person.handle.hitReact({ x: 1, z: 0 });
    tick(40);
    expect(p.attackers()).toBe(0);
    expect(hits.length).toBe(0);
    const dbg = person.handle.anim.anim;
    expect(['stagger', 'run', 'walk', 'idle']).toContain(dbg);
  });

  it('Umstehende (hitzköpfig) machen mit, aber höchstens 3 Angreifer', async () => {
    await build();
    const p = host.ctx.use('npc');
    const walkers = p.people().filter((q) => q.kind === 'walker');
    // alle hitzköpfig machen über Hits nacheinander: hier nur die Obergrenze prüfen
    place(walkers[0].x + 1.1, walkers[0].z, 0);
    for (const w of walkers.slice(0, 8)) w.handle.hitReact({ x: 1, z: 0 });
    tick(60);
    expect(p.attackers()).toBeLessThanOrEqual(3);
  });

  it('Obergrenze bleibt bei verschachteltem Beitritt (feste Zufallsfolgen, Regression: veralteter Zähler in joinBystanders)', async () => {
    const real = Math.random;
    try {
      for (const seed of [1, 26, 36]) {
        let st = seed * 2654435761 >>> 0;
        Math.random = () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        await build();
        const p = host.ctx.use('npc');
        const walkers = p.people().filter((q) => q.kind === 'walker');
        place(walkers[0].x + 1.1, walkers[0].z, 0);
        for (const w of walkers.slice(0, 8)) w.handle.hitReact({ x: 1, z: 0 });
        let mx = 0;
        for (let i = 0; i < 60; i++) { tick(1); mx = Math.max(mx, p.attackers()); }
        expect(mx).toBeLessThanOrEqual(3);
        host.hook('dispose'); dom.remove(); MODULES.length = 0; delete window.__lfxM4;
      }
    } finally { Math.random = real; }
  }, 60000);

  it('Wurf-Pool: ein InstancedMesh, Treffer → hitPlayer, Ausweichen trifft nicht', async () => {
    await build();
    const p = host.ctx.use('npc');
    place(4, 0, 0);
    expect(p.throwProp('candy', { x: 0, y: 1.3, z: 0 }, { x: 4, y: 1.2, z: 0 })).toBe(true);
    const pools = [];
    app.engine.scene.traverse((o) => { if (o instanceof InstancedMesh && o.name === 'npc-throwpool') pools.push(o); });
    expect(pools.length).toBe(1);
    expect(pools[0].visible).toBe(true);
    expect(sounds).toContain('candy');
    tick(40);
    expect(hits.length).toBe(1);
    expect(hits[0].src).toBe('npc');
    expect(pools[0].visible).toBe(false);
    hits.length = 0;
    place(9, 5, 0); // ausgewichen
    p.throwProp('popcorn', { x: 0, y: 1.3, z: 0 }, { x: 4, y: 1.2, z: 0 });
    tick(40);
    expect(hits.length).toBe(0);
    app.xr = { presenting: true };
    expect(p.throwProp('candy', { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 })).toBe(false);
  });

  it('Popcorn-Personal wirft Popcorn bei Provokation (Pool, Ton pop, Treffer klein), mit Abklingzeit', async () => {
    await build();
    const p = host.ctx.use('npc');
    const staff = p.staff('popcorn');
    expect(staff).toBeTruthy();
    const pos = staff.root.position;
    place(pos.x, pos.z + 1.2, 0);
    tick(2);
    const ev = { origin: { x: pos.x, y: 1.6, z: pos.z + 1.2 }, dir: { x: 0, y: 0, z: -1 } };
    expect(host.action('hit', ev)).toBe(true);
    tick(40);
    expect(sounds).toContain('pop');
    expect(hits.length).toBe(1);
    expect(hits[0].dmg).toBeLessThanOrEqual(6);
    expect(staff.getHandItem()).toBe(null);
    hits.length = 0;
    host.action('hit', ev); // Abklingzeit: kein zweiter Wurf
    tick(40);
    expect(hits.length).toBe(0);
  });
});
