import { describe, it, expect } from 'vitest';
import { Animator, ANIMS, ONE_SHOT, targetPose, timedDuration, POSE_KEYS } from '../src/js/store3d/npc/anim.js';

// 1.18.0 Welle 5: ausgearbeitete Posen (threat, sleeves, shake, cover, whip, belt, aim, ko, swing, toss).
describe('1.18.0 Posen', () => {
  const NEW = ['threat', 'sleeves', 'shake', 'cover', 'whip', 'belt', 'aim', 'ko', 'swing', 'toss'];
  const maxDiff = (a, b) => POSE_KEYS.reduce((m, k) => Math.max(m, Math.abs(a[k] - b[k])), 0);

  it('Indizes 0..13 bleiben, die zehn neuen hängen ab 14 an', () => {
    expect(ANIMS.slice(0, 14)).toEqual(['idle', 'walk', 'run', 'sit', 'wave', 'hit', 'throw', 'stagger', 'point', 'cheer', 'dance', 'clap', 'thumbs', 'bow']);
    expect(ANIMS.slice(14)).toEqual(NEW);
  });

  it('alle neuen Posen sind endlich, in Grenzen und weichen deutlich von idle ab', () => {
    const idle = targetPose('idle', 0, 1, 1);
    for (const n of NEW) {
      const dur = ONE_SHOT[n] || timedDuration(n) || 1;
      let far = 0;
      for (let i = 0; i <= 40; i++) {
        const age = (i / 40) * dur + (timedDuration(n) || ONE_SHOT[n] ? 0 : 1);
        const p = targetPose(n, 0, age, dur);
        for (const k of POSE_KEYS) {
          expect(Number.isFinite(p[k]), `${n}.${k}`).toBe(true);
          expect(Math.abs(p[k]), `${n}.${k}`).toBeLessThan(3.2);
        }
        far = Math.max(far, maxDiff(p, idle));
      }
      expect(far, n).toBeGreaterThan(0.25);
    }
  });

  it('Einmal-Hiebe (whip, belt, swing, toss) fallen auf idle zurück', () => {
    for (const n of ['whip', 'belt', 'swing', 'toss']) {
      expect(ONE_SHOT[n]).toBeGreaterThan(0.3);
      const a = new Animator('idle');
      a.setAnim(n);
      expect(a.busy()).toBe(true);
      for (let i = 0; i < Math.ceil(ONE_SHOT[n] / 0.05) + 2; i++) a.step(0.05);
      expect(a.anim).toBe('idle');
    }
  });

  it('Drohen, Ärmel und Kopfschütteln sind zeitbegrenzt; cover, aim und ko bleiben stehen', () => {
    for (const n of ['threat', 'sleeves', 'shake']) {
      expect(timedDuration(n)).toBeGreaterThan(1);
      const a = new Animator('idle');
      a.setAnim(n);
      for (let i = 0; i < Math.ceil(timedDuration(n) / 0.05) + 2; i++) a.step(0.05);
      expect(a.anim).toBe('idle');
    }
    for (const n of ['cover', 'aim', 'ko']) {
      expect(timedDuration(n)).toBe(0);
      const a = new Animator('idle');
      a.setAnim(n);
      for (let i = 0; i < 400; i++) a.step(0.05);
      expect(a.anim).toBe(n);
    }
  });

  it('K.O.: Körper liegt flach (roll nahe 90 Grad), Hüfte angehoben, Anlauf weich', () => {
    const p = targetPose('ko', 0, 2, 1);
    expect(p.roll).toBeGreaterThan(1.4);
    expect(p.roll).toBeLessThan(Math.PI / 2 + 0.05);
    expect(p.hipDrop).toBeLessThan(-0.15);
    expect(targetPose('ko', 0, 0, 1).roll).toBeCloseTo(0, 5);
    const a = new Animator('idle');
    a.setAnim('ko');
    for (let i = 0; i < 80; i++) a.step(0.05);
    expect(a.pose.roll).toBeGreaterThan(1.3);
  });

  it('Kopfschütteln dreht den Kopf beidseitig; Hände vor die Augen heben beide Arme hoch nach vorn', () => {
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < 40; i++) { const h = targetPose('shake', 0, i * 0.04, 1.6).headY; lo = Math.min(lo, h); hi = Math.max(hi, h); }
    expect(lo).toBeLessThan(-0.25);
    expect(hi).toBeGreaterThan(0.25);
    const c = targetPose('cover', 0, 1, 1);
    expect(c.armLx).toBeGreaterThan(1.8);
    expect(c.armRx).toBeGreaterThan(1.8);
  });

  it('Zielen streckt den rechten Arm waagrecht nach vorn; Drohen schüttelt die Faust', () => {
    expect(targetPose('aim', 0, 1, 1).armRx).toBeCloseTo(1.55, 1);
    const xs = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => targetPose('threat', 0, 0.5 + i * 0.03, 2.5).armRx);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.1);
  });

  it('Hiebe holen erst aus (Arm hinter den Körper) und schlagen dann nach vorn', () => {
    for (const [n, back] of [['whip', -1.5], ['belt', -0.7], ['swing', -0.6], ['toss', -0.5]]) {
      const d = ONE_SHOT[n];
      const series = Array.from({ length: 41 }, (_, i) => targetPose(n, 0, (i / 40) * d, d).armRx);
      expect(Math.min(...series), n).toBeLessThan(back);
      expect(Math.max(...series), n).toBeGreaterThan(1);
      expect(series.indexOf(Math.min(...series)), n).toBeLessThan(series.indexOf(Math.max(...series)));
    }
  });

  it('Netzstand der neuen Posen: Rundreise', () => {
    for (const n of NEW) {
      const a = new Animator('idle');
      a.setAnim(n);
      a.step(0.2);
      const b = new Animator('idle');
      expect(b.applyNetState(JSON.parse(JSON.stringify(a.getNetState())))).toBe(true);
      expect(b.anim).toBe(n);
    }
  });
});
