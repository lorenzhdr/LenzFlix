import { describe, it, expect } from 'vitest';
import { Animator, ANIMS, ANIM_CODE, ONE_SHOT, gaitRate, targetPose, POSE_KEYS } from '../src/js/store3d/npc/anim.js';

describe('NPC-Animation (rein)', () => {
  it('kennt alle zehn Animationen mit stabilen Codes', () => {
    expect(ANIMS).toEqual(['idle', 'walk', 'run', 'sit', 'wave', 'hit', 'throw', 'stagger', 'point', 'cheer']);
    ANIMS.forEach((n, i) => expect(ANIM_CODE[n]).toBe(i));
  });

  it('Gangfrequenz wächst mit dem Tempo und ist begrenzt', () => {
    expect(gaitRate(0)).toBe(0);
    expect(gaitRate(1.4)).toBeGreaterThan(gaitRate(0.7));
    expect(gaitRate(100)).toBeLessThanOrEqual(18);
  });

  it('Gangzyklus: Beine und Arme schwingen gegenläufig, Rennen ausladender als Gehen', () => {
    const w = targetPose('walk', 1.0, 1);
    expect(w.legLx).toBeCloseTo(-w.legRx, 6);
    expect(w.armLx).toBeCloseTo(-w.armRx, 6);
    expect(Math.sign(w.legLx)).toBe(-Math.sign(w.armLx));
    const r = targetPose('run', 1.0, 1);
    expect(Math.abs(r.legLx)).toBeGreaterThan(Math.abs(w.legLx));
    expect(r.lean).toBeGreaterThan(w.lean);
  });

  it('Sitzen senkt die Hüfte und streckt die Beine nach vorn', () => {
    const p = targetPose('sit', 0, 1);
    expect(p.hipDrop).toBeGreaterThan(0.2);
    expect(p.legLx).toBeGreaterThan(1);
  });

  it('alle Posen haben nur endliche Zahlen', () => {
    for (const a of ANIMS) for (const t of [0, 0.2, 0.9, 5]) for (const k of POSE_KEYS) expect(Number.isFinite(targetPose(a, t * 3, t, ONE_SHOT[a] || 1)[k])).toBe(true);
  });

  it('Einmal-Animationen fallen nach ihrer Dauer auf idle zurück', () => {
    const a = new Animator('idle');
    a.setAnim('hit');
    expect(a.busy()).toBe(true);
    for (let i = 0; i < 20; i++) a.step(0.05);
    expect(a.anim).toBe('idle');
    a.setAnim('stagger', { then: 'run' });
    for (let i = 0; i < 40; i++) a.step(0.05);
    expect(a.anim).toBe('run');
  });

  it('Wellen läuft zeitbegrenzt, sit bleibt', () => {
    const a = new Animator('wave');
    for (let i = 0; i < 80; i++) a.step(0.05);
    expect(a.anim).toBe('idle');
    a.setAnim('sit');
    for (let i = 0; i < 400; i++) a.step(0.05);
    expect(a.anim).toBe('sit');
  });

  it('Pose wird weich geglättet, nicht gesprungen', () => {
    const a = new Animator('idle');
    a.setAnim('wave');
    a.step(0.016);
    const first = a.pose.armRz;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(2.7);
    for (let i = 0; i < 60; i++) a.step(0.016);
    expect(a.pose.armRz).toBeGreaterThan(2.2);
  });

  it('Netzformat: Rundreise, Versionsprüfung, Ablehnung kaputter Eingaben', () => {
    const a = new Animator('idle');
    a.setAnim('walk', { speed: 1.4 });
    for (let i = 0; i < 30; i++) a.step(0.05);
    const n = a.getNetState();
    expect(n.v).toBe(1);
    expect(n.a).toBe(ANIM_CODE.walk);
    expect(n.p).toBeGreaterThanOrEqual(0);
    expect(n.p).toBeLessThan(1);
    expect(JSON.parse(JSON.stringify(n))).toEqual(n);
    const b = new Animator('idle');
    expect(b.applyNetState(n)).toBe(true);
    expect(b.anim).toBe('walk');
    expect(b.speed).toBeCloseTo(1.4, 2);
    expect(b.phase / (Math.PI * 2)).toBeCloseTo(n.p, 2);
    expect(b.applyNetState(null)).toBe(false);
    expect(b.applyNetState({ v: 2, a: 1 })).toBe(false);
    expect(b.applyNetState({ v: 1, a: 99 })).toBe(false);
    expect(b.applyNetState({ v: 1, a: 1.5 })).toBe(false);
    expect(b.anim).toBe('walk');
  });
});
