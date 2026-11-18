// @vitest-environment jsdom
// 1.18.0 Welle 6: Modul fight – Waffenwahl, Angriff, Schutz, Laser, PvP-Empfang, Waffenknopf, Waffenrad.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fight from '../src/js/store3d/modules/fight.js';
import { makeCtx } from './helpers/fight-ctx.js';

function setup(over) {
  const k = makeCtx(over);
  const mod = fight.init(k.ctx);
  const f = k.providers.get('fight');
  const frame = (dt = 0.016) => mod.update(dt);
  const frames = (sec) => { for (let t = 0; t < sec; t += 0.05) mod.update(0.05); };
  return { ...k, mod, f, frame, frames };
}

const netFake = (o = {}) => {
  const handlers = {};
  const sent = [];
  const peers = o.peers || [];
  const fightNet = {
    has: () => o.has !== false,
    send: (t, p) => { sent.push([t, p]); return true; },
    on: (t, fn) => { handlers[t] = fn; return () => { delete handlers[t]; }; },
    leader: () => null, isLeader: () => false,
    peerPos: (c) => (o.pos && o.pos[c]) || null,
  };
  return { net: { fight: fightNet, peers: () => peers.map((c) => ({ c })) }, handlers, sent };
};

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

describe('fight: Waffenwahl', () => {
  it('Standard Hand, setWeapon/cycle, ungültig abgelehnt, Wahl per Toast', () => {
    const s = setup();
    expect(s.f.weapon()).toBe('hand');
    expect(s.f.setWeapon('belt')).toBe(true);
    expect(s.f.weapon()).toBe('belt');
    expect(s.f.setWeapon('bazooka')).toBe(false);
    s.f.cycle(1);
    expect(s.f.weapon()).toBe('whip');
    s.f.cycle(-1); s.f.cycle(-1);
    expect(s.f.weapon()).toBe('hand');
    s.f.cycle(-1);
    expect(s.f.weapon()).toBe('laser');
    expect(s.calls.toast.at(-1)).toContain('Laser');
    expect(s.f.heldWeapon()).toBe('laser');
    s.f.setWeapon('hand');
    expect(s.f.heldWeapon()).toBe(null);
  });
  it('Waffenrad: wheel(true) öffnet als Overlay, wheel(false) wählt das markierte Segment', () => {
    const s = setup();
    s.f.setWeapon('belt');
    expect(s.f.wheel(true)).toBe(true);
    expect(s.calls.overlayOpen).toBe(1);
    s.frame();
    expect(s.f.wheel(false)).toBe(true);
    expect(s.f.weapon()).toBe('belt');
    expect(s.calls.overlayClose).toBe(1);
    expect(s.f.wheel(false)).toBe(false);
  });
  it('Waffenrad nicht außerhalb des Laufmodus und nicht in VR', () => {
    const s = setup();
    s.state.playing = false;
    expect(s.f.wheel(true)).toBe(false);
    s.state.playing = true;
    s.state.xr = true;
    expect(s.f.wheel(true)).toBe(false);
    expect(s.f.setWeapon('belt')).toBe(false);
  });
  it('Waffe geht entprellt als wp ans Netz', () => {
    const nf = netFake();
    const s = setup();
    s.providers.set('net', nf.net);
    s.frame();
    s.f.setWeapon('whip');
    s.frames(0.2);
    expect(nf.sent.filter((x) => x[0] === 'wp')).toHaveLength(0);
    s.frames(0.3);
    expect(nf.sent.filter((x) => x[0] === 'wp')).toEqual([['wp', { w: 2 }]]);
  });
});

describe('fight: Angriff', () => {
  it('swingOk gilt mit Abklingzeit, swung spielt den Ton der Waffe', () => {
    const s = setup();
    expect(s.f.swingOk()).toBe(true);
    s.f.swung({ weapon: 'belt' });
    expect(s.calls.sounds).toContain('belt');
    expect(s.f.swingOk()).toBe(false);
    s.frames(0.7);
    expect(s.f.swingOk()).toBe(true);
    s.f.swung({ weapon: 'whip' });
    expect(s.f.poseCode()).toBe(11);
    s.frames(1.2);
    expect(s.f.swingOk()).toBe(true);
    expect(s.f.poseCode()).toBe(null);
  });
  it('PvP: mit Fähigkeit fight geht fh pro Ziel im Kegel (Welt-Richtung), sonst false (alter Stoß)', () => {
    const nf = netFake({ peers: ['a', 'b'], pos: { a: { x: 10, y: 0, z: 8.8 }, b: { x: 15, y: 0, z: 10 } } });
    const s = setup();
    s.providers.set('net', nf.net);
    const ev = { origin: { x: 10, y: 1.6, z: 10 }, dir: { x: 0, y: 0, z: -1 }, weapon: 'hand', range: 1.6, max: 1 };
    expect(s.fire('hit', ev)).toBe(true);
    expect(nf.sent).toEqual([['fh', { c: 'a', w: 0, dir: { x: 0, z: -1 }, src: 0 }]]); // Welt-Richtung, kodiert net/fight.js (kein rohes d)
    expect(nf.sent[0][1].d).toBeUndefined();
    nf.sent.length = 0;
    expect(s.fire('hit', { ...ev, dir: { x: 1, y: 0, z: 0 } })).toBe(false); // b ist 5 m weg
    const nf2 = netFake({ has: false, peers: ['a'], pos: { a: { x: 10, y: 0, z: 8.8 } } });
    s.providers.set('net', nf2.net);
    expect(s.fire('hit', ev)).toBe(false);
    expect(nf2.sent).toHaveLength(0);
  });
  it('PvP: Peitsche trifft bis zu zwei Ziele', () => {
    const nf = netFake({ peers: ['a', 'b', 'c'], pos: { a: { x: 10, y: 0, z: 8 }, b: { x: 10, y: 0, z: 7 }, c: { x: 10, y: 0, z: 6.9 } } });
    const s = setup();
    s.providers.set('net', nf.net);
    expect(s.fire('hit', { origin: { x: 10, y: 1.6, z: 10 }, dir: { x: 0, y: 0, z: -1 }, weapon: 'whip', range: 3.5, max: 2 })).toBe(true);
    expect(nf.sent.map((x) => x[1].c)).toEqual(['a', 'b']);
    expect(nf.sent[0][1].w).toBe(2);
  });
});

describe('fight: Treffer am Spieler und Schutz', () => {
  it('Treffer senkt die Energie, stößt zurück, Ton ouch; Anzeige erscheint', () => {
    const s = setup();
    expect(s.f.hitPlayer({ dmg: 20, knock: { x: 1, z: 0 }, src: 'npc' })).toBe(true);
    s.frame();
    expect(s.f.energy()).toBeCloseTo(80, 0);
    expect(s.calls.knock).toHaveLength(1);
    expect(s.calls.knock[0][0]).toEqual({ x: 1, z: 0 });
    expect(s.calls.sounds).toContain('ouch');
    expect(s.host.querySelector('.lfx-store-fight-energy').hidden).toBe(false);
  });
  it.each([
    ['Kinder-Ecke', (s) => { s.pose.x = 2; s.pose.z = 2; }],
    ['Saal läuft', (s) => s.providers.set('cinema2d', { active: true, phase: 'playing' })],
    ['Couch', (s) => s.providers.set('couch', { seated: () => true })],
    ['Friseurstuhl', (s) => s.providers.set('salon', { busy: () => false, sitting: () => true })],
    ['Umkleide', (s) => s.providers.set('salon', { busy: () => true, sitting: () => false })],
    ['VR', (s) => { s.state.xr = true; }],
  ])('Schutz: %s – kein Schaden, kein Schleier', (_n, arm) => {
    const s = setup();
    arm(s);
    expect(s.f.protected()).toBe(true);
    expect(s.f.hitPlayer({ dmg: 30, knock: { x: 1, z: 0 }, src: 'npc' })).toBe(false);
    expect(s.f.blindPlayer(2000)).toBe(false);
    expect(s.f.energy()).toBe(100);
    expect(s.calls.knock).toHaveLength(0);
  });
  it('Kino ohne laufenden Film schützt nicht', () => {
    const s = setup();
    s.providers.set('cinema2d', { active: true, phase: 'idle' });
    expect(s.f.hitPlayer({ dmg: 10, knock: { x: 1, z: 0 }, src: 'npc' })).toBe(true);
  });
  it('Menü schützt erst 3 s nach dem Öffnen, danach 2 s Nachlauf', () => {
    const s = setup();
    s.frame();
    s.state.playing = false;
    s.frames(1);
    expect(s.f.protected()).toBe(false);
    expect(s.f.poseCode()).toBe(null);
    s.frames(2.5);
    expect(s.f.protected()).toBe(true);
    expect(s.f.poseCode()).toBe(15);
    expect(s.f.hitPlayer({ dmg: 10, knock: { x: 1, z: 0 }, src: 'pvp' })).toBe(false);
    s.state.playing = true;
    s.frames(0.5);
    expect(s.f.protected()).toBe(true); // Nachlauf 2 s
    s.frames(2);
    expect(s.f.protected()).toBe(false);
  });
  it('die offene Waffenwahl zählt nicht als Menü', () => {
    const s = setup();
    s.f.wheel(true);
    s.frames(4);
    expect(s.f.protected()).toBe(false);
    expect(s.f.poseCode()).toBe(null);
    s.f.wheel(false);
  });
  it('Blenden: Schleier, Posen-Code cover, höchstens alle 4 s', () => {
    const s = setup();
    expect(s.f.blindPlayer(2500)).toBe(true);
    expect(s.f.poseCode()).toBe(10);
    expect(s.host.querySelector('.lfx-store-fight-veil').hidden).toBe(false);
    expect(s.f.blindPlayer(2500)).toBe(false);
  });
  it('eingehendes fh: Schaden und Rückstoß, aber nicht von weit weg; lb blendet', () => {
    const nf = netFake({ peers: ['a'], pos: { a: { x: 10, y: 0, z: 9 } } });
    const s = setup();
    s.providers.set('net', nf.net);
    s.frame();
    nf.handlers.fh({ c: 'a', w: 1, d: [0, 1] });
    expect(s.f.energy()).toBeCloseTo(80, 0);
    expect(s.calls.knock.at(-1)[0]).toEqual({ x: 0, z: 1 });
    nf.net.fight.peerPos = () => ({ x: 40, y: 0, z: 40 });
    s.frames(7);
    const e0 = s.f.energy();
    nf.handlers.fh({ c: 'a', w: 1, d: [0, 1] });
    expect(s.f.energy()).toBe(e0);
    nf.net.fight.peerPos = () => ({ x: 10, y: 0, z: 5 });
    nf.handlers.lb({ c: 'a' });
    expect(s.f.poseCode()).toBe(10);
  });
  it('Energie füllt sich nach 6 s von selbst', () => {
    const s = setup();
    s.f.hitPlayer({ dmg: 26, knock: { x: 0, z: 1 }, src: 'npc' });
    s.frames(5);
    expect(s.f.energy()).toBeCloseTo(74, 0);
    s.frames(4);
    expect(s.f.energy()).toBeGreaterThan(80);
  });
});

describe('fight: Laser', () => {
  it('nur mit Laser in der Hand; Punkt an der Wand, sound.laser, Zustand und Rückruf', () => {
    const s = setup();
    expect(s.f.laser(true)).toBe(false);
    s.f.setWeapon('laser');
    s.ctx.layout.colliders.push({ x0: 5, z0: 4.9, x1: 15, z1: 5.0, y1: 3 });
    const states = [];
    s.f.onLaser((st) => states.push(st));
    expect(s.f.laser(true)).toBe(true);
    s.frame(0.11);
    const st = s.f.laserState();
    expect(st.on).toBe(true);
    expect(st.point.z).toBeCloseTo(5.0, 1);
    expect(s.calls.sounds).toContain('laser:true');
    expect(s.f.poseCode()).toBe(13);
    expect(s.scene.getObjectByName('lfx-laser-dot').visible).toBe(true);
    expect(states.length).toBeGreaterThan(0);
    s.f.laser(false);
    expect(s.f.laserState()).toEqual({ on: false, point: null });
    expect(s.scene.getObjectByName('lfx-laser-dot').visible).toBe(false);
    expect(s.calls.sounds).toContain('laser:false');
  });
  it('bei low nur der Punkt, in der Außenansicht ab mid zusätzlich der Strahl', () => {
    const s = setup();
    s.providers.set('selfview', { mode: () => 'third', eye: (o) => o.set(10, 1.65, 10), figure: () => null, playAnim() {} });
    s.f.setWeapon('laser');
    s.f.laser(true);
    s.frame(0.11);
    expect(s.scene.getObjectByName('lfx-laser-beam').visible).toBe(true);
    s.f.laser(false);
    s.state.quality = 'low';
    s.f.laser(true);
    s.frame(0.11);
    expect(s.scene.getObjectByName('lfx-laser-beam').visible).toBe(false);
    expect(s.scene.getObjectByName('lfx-laser-dot').visible).toBe(true);
  });
  it('Schutzzone und Menü: kein Strahl', () => {
    const s = setup();
    s.f.setWeapon('laser');
    s.providers.set('couch', { seated: () => true });
    expect(s.f.laser(true)).toBe(false);
    s.providers.delete('couch');
    expect(s.f.laser(true)).toBe(true);
    s.state.playing = false;
    s.frame(0.05);
    expect(s.f.laserState().on).toBe(false);
  });
  it('Person: 0,5 s aufs Gesicht → npc.laserHit', () => {
    const s = setup();
    const handle = { root: { visible: true }, headWorld: (o) => o.set(10, 1.65, 6) };
    const laserHit = vi.fn();
    s.providers.set('npc', { people: () => [{ kind: 'walker', handle, x: 10, z: 6 }], laserHit });
    s.f.setWeapon('laser');
    s.f.laser(true);
    for (let i = 0; i < 4; i++) s.frame(0.1);
    expect(laserHit).not.toHaveBeenCalled();
    for (let i = 0; i < 3; i++) s.frame(0.1);
    expect(laserHit).toHaveBeenCalledTimes(1);
    expect(laserHit).toHaveBeenCalledWith(handle);
  });
  it('Richard: Treffer über brawl.hitBy(laser); Auto: blindDriver; Katze/Tauben: animals.laser', () => {
    const s = setup();
    const hitBy = vi.fn();
    const blindDriver = vi.fn(() => true);
    const alaser = vi.fn();
    s.providers.set('cashier', { richard: () => ({ pos: { x: 10, y: 0, z: 5 }, inStore: true }) });
    s.providers.set('brawl', { hitBy });
    s.providers.set('traffic', { laserHit: (p) => (Math.abs(p.z - 8) < 0.4 ? { id: 3 } : null), blindDriver });
    s.providers.set('animals', { laser: alaser });
    s.f.setWeapon('laser');
    s.f.laser(true);
    for (let i = 0; i < 8; i++) s.frame(0.1);
    expect(blindDriver).toHaveBeenCalled();
    expect(blindDriver.mock.calls[0][0]).toEqual({ id: 3 });
    expect(alaser).toHaveBeenCalled();
    s.providers.delete('traffic');
    s.f.laser(false);
    s.f.laser(true);
    // Richard steht hinter dem Auto (z 5, Blick −z): Kopf (y 1,65) liegt auf dem Strahl
    for (let i = 0; i < 8; i++) s.frame(0.1);
    expect(hitBy).toHaveBeenCalled(); // je Auftreffen höchstens einmal (Verweilzeit feuert nur einmal)
    expect(hitBy.mock.calls.every((c) => c[0] === 'laser')).toBe(true);
    expect(hitBy.mock.calls.length).toBeLessThanOrEqual(2);
  });
  it('Mitspieler: lb nach 0,5 s, lz mit Punkt in cm, beim Aus on 0', () => {
    const nf = netFake({ peers: ['a'], pos: { a: { x: 10, y: 0, z: 6 } } });
    const s = setup();
    s.providers.set('net', nf.net);
    s.frame(0.05);
    s.f.setWeapon('laser');
    s.f.laser(true);
    for (let i = 0; i < 8; i++) s.frame(0.1);
    expect(nf.sent.filter((x) => x[0] === 'lb')).toEqual([['lb', { c: 'a' }]]);
    const lz = nf.sent.filter((x) => x[0] === 'lz');
    expect(lz.length).toBeGreaterThan(0);
    expect(lz[0][1].on).toBe(1);
    // Punkt in Metern (Welt), net/fight.js kodiert in cm – kein vorkodiertes q
    expect(lz[0][1].q).toBeUndefined();
    const pt = lz[0][1].point;
    expect(Number.isFinite(pt.x) && Number.isFinite(pt.y) && Number.isFinite(pt.z)).toBe(true);
    expect(Math.hypot(pt.x - 10, pt.z - 10)).toBeLessThan(40); // Meter, nicht cm
    s.f.laser(false);
    expect(nf.sent.at(-1)).toEqual(['lz', { on: 0 }]);
  });
  it('VR beendet den Laser; Modul inaktiv', () => {
    const s = setup();
    s.f.setWeapon('laser');
    s.f.laser(true);
    s.state.xr = true;
    s.frame(0.1);
    expect(s.f.laserState().on).toBe(false);
    expect(s.f.swingOk()).toBe(false);
    expect(s.f.heldWeapon()).toBe(null);
    expect(s.f.poseCode()).toBe(null);
  });
});

describe('fight: Waffenknopf (Touch) und eigene Figur', () => {
  it('kurz tippen öffnet das Rad', () => {
    const s = setup();
    s.f.auxDown();
    s.frames(0.1);
    s.f.auxUp();
    expect(s.calls.overlayOpen).toBe(1);
    s.f.wheel(false);
  });
  it('halten mit Laser leuchtet, Loslassen schaltet aus und öffnet kein Rad', () => {
    const s = setup();
    s.f.setWeapon('laser');
    s.f.auxDown();
    s.frames(0.1);
    expect(s.f.laserState().on).toBe(false);
    s.frames(0.2);
    expect(s.f.laserState().on).toBe(true);
    s.f.auxUp();
    expect(s.f.laserState().on).toBe(false);
    expect(s.calls.overlayOpen).toBe(0);
  });
  it('Waffe geht an die eigene Figur (setHandItem nur bei Änderung)', () => {
    const s = setup();
    let item = null;
    const setHandItem = vi.fn((i) => { item = i; });
    s.providers.set('selfview', { mode: () => 'ego', figure: () => ({ setHandItem, getHandItem: () => item }), playAnim() {} });
    s.f.setWeapon('whip');
    s.frame(); s.frame();
    expect(setHandItem).toHaveBeenCalledTimes(1);
    expect(setHandItem).toHaveBeenCalledWith('whip');
    s.f.setWeapon('hand');
    s.frame();
    expect(setHandItem).toHaveBeenLastCalledWith(null);
  });
});

describe('fight: Aufräumen', () => {
  it('dispose entfernt Provider, Anzeige, Szene-Objekte und stoppt den Laser', () => {
    const s = setup();
    s.f.setWeapon('laser');
    s.f.laser(true);
    s.frame(0.11);
    s.mod.dispose();
    expect(s.providers.get('fight')).toBeUndefined();
    expect(s.host.querySelector('.lfx-store-fight-energy')).toBeNull();
    expect(s.scene.getObjectByName('lfx-laser-dot')).toBeUndefined();
    expect(s.calls.sounds.at(-1)).toBe('laser:false');
    expect(() => s.mod.update(0.1)).not.toThrow();
  });
  it('flags.fight=false: keine Treffer, kein Schlag', () => {
    const s = setup({ opts: { devFlags: { fight: false } } });
    expect(s.f.hitPlayer({ dmg: 10, knock: { x: 1, z: 0 }, src: 'npc' })).toBe(false);
    expect(s.f.swingOk()).toBe(false);
  });
});
