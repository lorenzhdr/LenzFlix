// @vitest-environment jsdom
// 1.18.0 Welle 4: Nähte und Stubs (Fight/Gang-Provider, ANIMS/NET_A_ANIM-Erweiterung, Freischalt-IDs).
import { describe, it, expect } from 'vitest';
import { MODULES } from '../src/js/store3d/modules/index.js';
import fight from '../src/js/store3d/modules/fight.js';
import gang from '../src/js/store3d/modules/gang.js';
import { ANIMS } from '../src/js/store3d/npc/anim.js';
import { NET_A_ANIM } from '../src/js/store3d/net/proto.js';
import { UNLOCK_BAGS, UNLOCK_TOPS, UNLOCK_HATS, UNLOCK_GLASSES } from '../src/js/store3d/char/ids.js';
import { createEnergyHud } from '../src/js/store3d/ui/energy.js';
import { createWeaponWheel } from '../src/js/store3d/ui/weaponwheel.js';
import { createBlindVeil } from '../src/js/store3d/ui/blindveil.js';

const fakeCtx = () => { const m = {}; return { m, provide: (n, i) => { m[n] = i; return () => { delete m[n]; }; } }; };

describe('Welle 4 Nähte', () => {
  it('Stubs sind vor net registriert', () => {
    const names = MODULES.map((m) => m.name);
    expect(names.indexOf('fight')).toBeGreaterThan(names.indexOf('xrchar'));
    expect(names.indexOf('gang')).toBeGreaterThan(names.indexOf('fight'));
    expect(names.indexOf('net')).toBeGreaterThan(names.indexOf('gang'));
  });
  it('Provider fight und gang sind No-ops', () => {
    const c = fakeCtx();
    const h = fight.init(c);
    const f = c.m.fight;
    expect(f.weapon()).toBe('hand');
    expect(f.energy()).toBe(100);
    expect(f.protected()).toBe(false);
    expect(f.hitPlayer({ dmg: 5 })).toBe(false);
    expect(typeof f.onKO(() => {})).toBe('function');
    f.setWeapon('belt');
    f.blind(100);
    expect(f.weapon()).toBe('hand');
    h.dispose();
    expect(c.m.fight).toBeUndefined();
    const g = gang.init(c);
    const gp = c.m.gang;
    expect(gp.active()).toBe(false);
    expect(gp.members()).toEqual([]);
    expect(gp.hit(0, 'hand')).toBe(false);
    g.dispose();
    expect(c.m.gang).toBeUndefined();
  });
  it('UI-Stubs liefern Handles', () => {
    for (const h of [createEnergyHud(), createWeaponWheel(), createBlindVeil()]) expect(typeof h.dispose).toBe('function');
  });
  it('ANIMS 0..13 stabil, neue Namen angehängt', () => {
    expect(ANIMS.slice(0, 14)).toEqual(['idle', 'walk', 'run', 'sit', 'wave', 'hit', 'throw', 'stagger', 'point', 'cheer', 'dance', 'clap', 'thumbs', 'bow']);
    expect(ANIMS.slice(14)).toEqual(['threat', 'sleeves', 'shake', 'cover', 'whip', 'belt', 'aim', 'ko', 'swing', 'toss']);
  });
  it('NET_A_ANIM 9..15', () => {
    expect(NET_A_ANIM.slice(0, 9)).toEqual(['idle', 'walk', 'run', 'idle', 'stagger', 'idle', 'hit', 'sit', 'throw']);
    expect(NET_A_ANIM.slice(9)).toEqual(['ko', 'cover', 'whip', 'belt', 'aim', 'threat', 'idle']);
    for (const n of NET_A_ANIM) expect(ANIMS).toContain(n);
  });
  it('Freischalt-IDs nur angehängt', () => {
    expect(UNLOCK_BAGS).toEqual(['chips', 'vhspack', 'catpack']);
    expect(UNLOCK_TOPS).toEqual(['cape', 'jersey3', 'banshirt', 'hivis', 'studjacket']);
    expect(UNLOCK_HATS).toEqual(['goldcap', 'crown', 'catears', 'canhat', 'usher', 'curlers']);
    expect(UNLOCK_GLASSES).toEqual(['pilot', '3d', 'bandaid']);
  });
});
