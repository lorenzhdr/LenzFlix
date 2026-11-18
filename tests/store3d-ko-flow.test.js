// @vitest-environment jsdom
// 1.18.0 Welle 6: K.O.-Ablauf – Schwarzblende, Hülle zurück, Aufwachen sitzend auf benchN, Richard, 10 s Schutz, Entdeckung.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fight from '../src/js/store3d/modules/fight.js';
import { makeCtx } from './helpers/fight-ctx.js';

function setup() {
  const k = makeCtx();
  const mod = fight.init(k.ctx);
  const f = k.providers.get('fight');
  const found = vi.fn();
  const event = vi.fn();
  const playAnim = vi.fn();
  k.providers.set('discover', { found });
  k.providers.set('cashier', { event });
  k.providers.set('selfview', { mode: () => 'ego', figure: () => null, playAnim });
  const frames = (sec) => { for (let t = 0; t < sec - 1e-9; t += 0.05) mod.update(0.05); };
  return { ...k, mod, f, found, event, playAnim, frames };
}

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('K.O.-Ablauf', () => {
  it('der Schlag auf 0 löst Blende, Drop, Bank-Teleport, Richard, Entdeckung und Schutz aus', () => {
    vi.useFakeTimers();
    const s = setup();
    const onKO = vi.fn();
    s.f.onKO(onKO);
    for (let i = 0; i < 4; i++) { s.f.hitPlayer({ dmg: 26, knock: { x: 1, z: 0 }, src: 'pvp' }); s.frames(0.1); }
    expect(s.f.energy()).toBe(0);
    expect(onKO).toHaveBeenCalledTimes(1);
    expect(s.calls.sounds).toContain('ko');
    expect(s.calls.freeze).toEqual([true]);
    expect(s.f.poseCode()).toBe(9);
    // während der Blende: keine weiteren Treffer
    expect(s.f.hitPlayer({ dmg: 10, knock: { x: 1, z: 0 }, src: 'pvp' })).toBe(false);
    expect(s.calls.drop).toBe(0);
    vi.advanceTimersByTime(800); // Blende voll
    expect(s.calls.drop).toBe(1);
    expect(s.calls.teleport).toHaveLength(1);
    const [x, z, yaw, , y] = s.calls.teleport[0];
    expect(x).toBeCloseTo(20.8, 1);
    expect(z).toBeCloseTo(30.5, 1);
    expect(yaw).toBe(0);
    expect(y).toBeCloseTo(0.48, 2);
    expect(s.playAnim).toHaveBeenCalledWith('sit');
    expect(s.event).toHaveBeenCalledWith('playerKO');
    expect(s.found).toHaveBeenCalledWith('knockout');
    expect(s.f.energy()).toBe(100);
    expect(s.f.sitting()).toBe(true);
    expect(s.f.poseCode()).toBe(7); // Bank: sitzt an der Körperposition
    vi.advanceTimersByTime(3000);
    expect(s.calls.freeze).toEqual([true, false]);
    // 10 s Schutz nach dem Aufwachen
    expect(s.f.protected()).toBe(true);
    expect(s.f.hitPlayer({ dmg: 26, knock: { x: 1, z: 0 }, src: 'npc' })).toBe(false);
    s.frames(10.5);
    expect(s.f.protected()).toBe(false);
    expect(s.f.hitPlayer({ dmg: 26, knock: { x: 1, z: 0 }, src: 'npc' })).toBe(true);
  });

  it('Loslaufen beendet das Sitzen auf der Bank', () => {
    vi.useFakeTimers();
    const s = setup();
    s.f.koSeat();
    expect(s.f.sitting()).toBe(true);
    s.net.vx = 2;
    s.frames(0.1);
    expect(s.f.sitting()).toBe(false);
    expect(s.f.poseCode()).toBe(null);
  });

  it('dispose mitten im K.O.: Freeze wird gelöst, keine Nachwirkung', () => {
    vi.useFakeTimers();
    const s = setup();
    s.f.hitPlayer({ dmg: 100, knock: { x: 1, z: 0 }, src: 'pvp' });
    expect(s.calls.freeze).toEqual([true]);
    s.mod.dispose();
    expect(s.calls.freeze).toEqual([true, false]);
    vi.advanceTimersByTime(5000);
    expect(s.calls.teleport).toHaveLength(0);
    expect(s.found).not.toHaveBeenCalled();
  });

  it('ohne Bank (kein Stadtlayout) wacht der Spieler an Ort und Stelle auf', () => {
    vi.useFakeTimers();
    const s = setup();
    s.ctx.layout.city = null;
    expect(s.f.koSeat()).toBe(false);
    expect(s.calls.teleport).toHaveLength(0);
  });

  it('Treffer im K.O.-Schutz nach dem Aufwachen: kein zweites K.O.', () => {
    vi.useFakeTimers();
    const s = setup();
    s.f.hitPlayer({ dmg: 100, knock: { x: 1, z: 0 }, src: 'pvp' });
    vi.advanceTimersByTime(4000);
    const n = s.calls.drop;
    for (let i = 0; i < 5; i++) s.f.hitPlayer({ dmg: 100, knock: { x: 1, z: 0 }, src: 'pvp' });
    expect(s.calls.drop).toBe(n);
  });
});
