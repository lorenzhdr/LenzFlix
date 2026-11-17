// @vitest-environment jsdom
// VIDEOTHEK LENZ: Touch-Schema „Spiel“ (ui/gamepad.js, controls/touch.js): Stick, Rennen mit Hysterese, Knöpfe, Mehrfinger, Schemawechsel.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGamepad, stickVector, stickRadius, GP_DEAD, GP_RUN_ON, GP_RUN_OFF } from '../src/js/store3d/ui/gamepad.js';
import { TouchControls, SCHEMES } from '../src/js/store3d/controls/touch.js';

const ev = (el, type, x, y, id = 1) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: id, clientX: x, clientY: y });
  el.dispatchEvent(e);
  return e;
};

describe('stickVector (rein)', () => {
  const R = 100;
  it('Totzone: bis 0,12 keine Eingabe', () => {
    const v = stickVector(0, -GP_DEAD * R, R);
    expect([v.fwd, v.strafe, v.scale]).toEqual([0, 0, 0]);
  });
  it('linear nach der Totzone, Richtungen (oben = vorwärts, rechts = Strafe)', () => {
    const half = stickVector(0, -50, R);
    expect(half.fwd).toBeCloseTo(1, 9);
    expect(half.strafe).toBeCloseTo(0, 9);
    expect(half.scale).toBeCloseTo((0.5 - GP_DEAD) / (1 - GP_DEAD), 9);
    const quarter = stickVector(0, -25, R);
    expect(quarter.scale).toBeCloseTo((0.25 - GP_DEAD) / (1 - GP_DEAD), 9);
    expect(stickVector(50, 0, R).strafe).toBeCloseTo(1, 9);
    const d = stickVector(30, 30, R);
    expect(d.fwd).toBeCloseTo(-Math.SQRT1_2, 9);
    expect(d.strafe).toBeCloseTo(Math.SQRT1_2, 9);
  });
  it('Verschiebung wird auf R geklemmt (Knopf), scale höchstens 1', () => {
    const v = stickVector(300, 0, R);
    expect(v.kx).toBeCloseTo(100, 9);
    expect(v.scale).toBe(1);
    expect(v.m).toBe(1);
  });
  it('Rennen: an ab 0,92, aus unter 0,8, dazwischen gilt der bisherige Zustand', () => {
    expect(stickVector(0, -91, R, false).run).toBe(false);
    expect(stickVector(0, -92, R, false).run).toBe(true);
    expect(stickVector(0, -85, R, true).run).toBe(true);
    expect(stickVector(0, -85, R, false).run).toBe(false);
    expect(stickVector(0, -79, R, true).run).toBe(false);
    expect([GP_RUN_ON, GP_RUN_OFF]).toEqual([0.92, 0.8]);
  });
  it('Radius: 9 % der kleineren Seite, mindestens 48', () => {
    expect(stickRadius(1000, 500)).toBeCloseTo(48, 9);
    expect(stickRadius(2000, 1000)).toBeCloseTo(90, 9);
  });
});

describe('createGamepad', () => {
  let host;
  let cb;
  let t;
  let gp;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    t = 1000;
    cb = { onJump: vi.fn(), onUse: vi.fn(), onHit: vi.fn(), onThrow: vi.fn(), onTap: vi.fn(), now: () => t };
    gp = createGamepad(host, cb);
  });
  afterEach(() => { gp.destroy(); host.remove(); });
  const R = () => stickRadius(window.innerWidth, window.innerHeight);

  it('DOM: root, Zone mit Stick, vier Knöpfe; Werfen anfangs versteckt', () => {
    expect(host.querySelector('.lfx-store-gp')).toBe(gp.root);
    expect(gp.root.getAttribute('aria-hidden')).toBe('true');
    for (const c of ['zone', 'base', 'knob', 'btns', 'jump', 'use', 'hit', 'throw']) expect(gp.root.querySelector(`.lfx-store-gp-${c}`), c).toBeTruthy();
    expect(gp.root.querySelector('.lfx-store-gp-throw').hidden).toBe(true);
    expect(gp.root.querySelector('.lfx-store-gp-jump').textContent).toBe('SPRINGEN');
  });

  it('Stick: Verschiebung -> Eingabe, Hysterese beim Rennen, Loslassen -> null', () => {
    const z = gp.zone;
    ev(z, 'pointerdown', 100, 400);
    expect(gp.stickActive).toBe(true);
    expect(gp.input).toMatchObject({ fwd: 0, scale: 0, run: false });
    ev(z, 'pointermove', 100, 400 - R() * 0.5);
    expect(gp.input.fwd).toBeCloseTo(1, 6);
    expect(gp.input.scale).toBeCloseTo((0.5 - 0.12) / 0.88, 6);
    expect(gp.input.run).toBe(false);
    ev(z, 'pointermove', 100, 400 - R() * 0.95);
    expect(gp.input.run).toBe(true);
    ev(z, 'pointermove', 100, 400 - R() * 0.85);
    expect(gp.input.run).toBe(true); // Hysterese
    ev(z, 'pointermove', 100, 400 - R() * 0.75);
    expect(gp.input.run).toBe(false);
    ev(z, 'pointermove', 100 + R() * 0.6, 400);
    expect(gp.input.strafe).toBeCloseTo(1, 6);
    expect(gp.input.fwd).toBeCloseTo(0, 6);
    ev(z, 'pointerup', 100, 400);
    expect(gp.stickActive).toBe(false);
    expect(gp.input).toMatchObject({ fwd: 0, strafe: 0, scale: 0, run: false });
    expect(gp.root.querySelector('.lfx-store-gp-base').hidden).toBe(true);
  });

  it('zweiter Finger in der Zone stört den Stick nicht', () => {
    ev(gp.zone, 'pointerdown', 100, 400, 1);
    ev(gp.zone, 'pointerdown', 150, 300, 2);
    ev(gp.zone, 'pointermove', 100, 400 - R() * 0.5, 1);
    expect(gp.input.fwd).toBeCloseTo(1, 6);
    ev(gp.zone, 'pointerup', 150, 300, 2);
    expect(gp.stickActive).toBe(true);
  });

  it('Multitouch: Stick + Sprungknopf gleichzeitig, Knöpfe rufen ihre Callbacks', () => {
    ev(gp.zone, 'pointerdown', 100, 400, 1);
    ev(gp.zone, 'pointermove', 100, 400 - R() * 0.5, 1);
    const jump = gp.root.querySelector('.lfx-store-gp-jump');
    ev(jump, 'pointerdown', 700, 400, 2);
    expect(cb.onJump).toHaveBeenCalledTimes(1);
    expect(jump.classList.contains('is-down')).toBe(true);
    ev(jump, 'pointerup', 700, 400, 2);
    expect(jump.classList.contains('is-down')).toBe(false);
    expect(gp.input.fwd).toBeCloseTo(1, 6); // Stick läuft weiter
    ev(gp.root.querySelector('.lfx-store-gp-use'), 'pointerdown', 0, 0, 3);
    ev(gp.root.querySelector('.lfx-store-gp-hit'), 'pointerdown', 0, 0, 4);
    expect([cb.onUse.mock.calls.length, cb.onHit.mock.calls.length, cb.onThrow.mock.calls.length]).toEqual([1, 1, 0]);
  });

  it('Getragen: Werfen ersetzt Schlagen', () => {
    gp.setCarrying(true);
    const hit = gp.root.querySelector('.lfx-store-gp-hit');
    const thr = gp.root.querySelector('.lfx-store-gp-throw');
    expect([hit.hidden, thr.hidden, gp.carrying]).toEqual([true, false, true]);
    ev(thr, 'pointerdown', 0, 0, 5);
    expect(cb.onThrow).toHaveBeenCalledTimes(1);
    gp.setCarrying(false);
    expect([hit.hidden, thr.hidden]).toEqual([false, true]);
    gp.setAimed(true);
    expect(gp.root.querySelector('.lfx-store-gp-use').classList.contains('is-aimed')).toBe(true);
  });

  it('kurzer Tipp in der linken Zone ruft onTap; Wischen oder langes Halten nicht', () => {
    ev(gp.zone, 'pointerdown', 120, 300);
    t += 100;
    ev(gp.zone, 'pointerup', 120, 300);
    expect(cb.onTap).toHaveBeenCalledWith(120, 300);
    cb.onTap.mockClear();
    ev(gp.zone, 'pointerdown', 120, 300);
    ev(gp.zone, 'pointermove', 160, 300);
    t += 100;
    ev(gp.zone, 'pointerup', 160, 300);
    ev(gp.zone, 'pointerdown', 120, 300);
    t += 400;
    ev(gp.zone, 'pointerup', 120, 300);
    expect(cb.onTap).not.toHaveBeenCalled();
  });

  it('reset lässt Stick und Knöpfe los, show(false) blendet aus, destroy räumt auf', () => {
    ev(gp.zone, 'pointerdown', 100, 400);
    ev(gp.zone, 'pointermove', 100, 300);
    gp.reset();
    expect(gp.stickActive).toBe(false);
    expect(gp.input.fwd).toBe(0);
    ev(gp.zone, 'pointerdown', 100, 400);
    gp.show(false);
    expect(gp.stickActive).toBe(false);
    expect(gp.root.hidden).toBe(true);
    gp.show(true);
    expect(gp.root.hidden).toBe(false);
    gp.destroy();
    expect(host.querySelector('.lfx-store-gp')).toBe(null);
    ev(gp.zone, 'pointerdown', 100, 400); // nach destroy ohne Wirkung
    expect(gp.stickActive).toBe(false);
    gp = createGamepad(host, cb); // für afterEach
  });
});

describe('TouchControls Schema game', () => {
  let canvas;
  let state;
  let player;
  let ctx;
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    const wrap = document.createElement('div');
    canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    document.body.appendChild(wrap);
    canvas.setPointerCapture = () => {};
    player = { look: vi.fn() };
    state = { mode: 'play' };
    ctx = { canvas, player, getMode: () => state.mode, onTap: vi.fn(), onJump: vi.fn(), onUse: vi.fn(), onHit: vi.fn(), onThrow: vi.fn(), getTune: () => ({ touchRegrip: 'off' }) };
  });
  afterEach(() => { vi.useRealTimers(); });

  it('SCHEMES enthält game; Klassen-Standard bleibt touch', () => {
    expect(SCHEMES).toEqual(['game', 'joystick', 'touch']);
    const tc = new TouchControls({ ...ctx });
    expect(tc.scheme).toBe('touch');
  });

  it('input kommt vom Stick; Canvas-Halten startet kein Laufen; Umsehen rechts gleichzeitig', () => {
    const tc = new TouchControls({ ...ctx, scheme: 'game' });
    tc.attach();
    const gp = canvas.parentElement.querySelector('.lfx-store-gp');
    expect(gp).toBeTruthy();
    const zone = gp.querySelector('.lfx-store-gp-zone');
    ev(zone, 'pointerdown', 100, 400, 1);
    ev(zone, 'pointermove', 100, 400 - stickRadius(window.innerWidth, window.innerHeight) * 0.6, 1);
    expect(tc.input.fwd).toBeCloseTo(1, 6);
    // rechter Finger auf dem Canvas: Halten startet kein Laufen, Wischen sieht um
    ev(canvas, 'pointerdown', 700, 300, 2);
    vi.advanceTimersByTime(500);
    expect(tc.walkId).toBe(null);
    ev(canvas, 'pointermove', 740, 300, 2);
    expect(player.look).toHaveBeenCalled();
    expect(tc.input.fwd).toBeCloseTo(1, 6); // Stick unverändert
    ev(canvas, 'pointerup', 740, 300, 2);
    ev(zone, 'pointerup', 100, 300, 1);
    expect(tc.input.fwd).toBe(0);
  });

  it('Tipp in der linken Zone erreicht onTap nur im Spielmodus', () => {
    const tc = new TouchControls({ ...ctx, scheme: 'game', now: () => 0 });
    tc.attach();
    const zone = canvas.parentElement.querySelector('.lfx-store-gp-zone');
    ev(zone, 'pointerdown', 120, 300);
    ev(zone, 'pointerup', 120, 300);
    expect(ctx.onTap).toHaveBeenCalledWith(120, 300);
    state.mode = 'hold';
    ctx.onTap.mockClear();
    ev(zone, 'pointerdown', 120, 300);
    ev(zone, 'pointerup', 120, 300);
    expect(ctx.onTap).not.toHaveBeenCalled();
  });

  it('Knöpfe: ctx-Callbacks; setCarrying/setAimed gelten auch vor dem Anlegen des Pads', () => {
    const tc = new TouchControls({ ...ctx, scheme: 'game' });
    tc.setCarrying(true);
    tc.setAimed(true);
    tc.attach();
    const gp = canvas.parentElement.querySelector('.lfx-store-gp');
    expect(gp.querySelector('.lfx-store-gp-throw').hidden).toBe(false);
    expect(gp.querySelector('.lfx-store-gp-use').classList.contains('is-aimed')).toBe(true);
    ev(gp.querySelector('.lfx-store-gp-jump'), 'pointerdown', 0, 0, 7);
    ev(gp.querySelector('.lfx-store-gp-use'), 'pointerdown', 0, 0, 8);
    ev(gp.querySelector('.lfx-store-gp-throw'), 'pointerdown', 0, 0, 9);
    expect([ctx.onJump.mock.calls.length, ctx.onUse.mock.calls.length, ctx.onThrow.mock.calls.length]).toEqual([1, 1, 1]);
  });

  it('Moduswechsel lässt den Stick los', () => {
    const tc = new TouchControls({ ...ctx, scheme: 'game' });
    tc.attach();
    const zone = canvas.parentElement.querySelector('.lfx-store-gp-zone');
    ev(zone, 'pointerdown', 100, 400);
    ev(zone, 'pointermove', 100, 300);
    expect(tc.input.fwd).toBeGreaterThan(0);
    state.mode = 'paused';
    expect(tc.input.fwd).toBe(0);
  });

  it('Schemawechsel game <-> joystick <-> touch: Pad entsteht und verschwindet', () => {
    const tc = new TouchControls({ ...ctx, scheme: 'game' });
    tc.attach();
    const host = canvas.parentElement;
    expect(host.querySelectorAll('.lfx-store-gp').length).toBe(1);
    expect(host.querySelectorAll('.lfx-store-pad').length).toBe(0);
    tc.setScheme('joystick');
    expect(host.querySelectorAll('.lfx-store-gp').length).toBe(0);
    expect(host.querySelectorAll('.lfx-store-pad').length).toBe(1);
    tc.setScheme('touch');
    expect(host.querySelectorAll('.lfx-store-gp, .lfx-store-pad').length).toBe(0);
    tc.setScheme('game');
    expect(host.querySelectorAll('.lfx-store-gp').length).toBe(1);
    tc.showPad(false);
    expect(host.querySelector('.lfx-store-gp').hidden).toBe(true);
    tc.detach();
    expect(host.querySelectorAll('.lfx-store-gp').length).toBe(0);
  });
});
