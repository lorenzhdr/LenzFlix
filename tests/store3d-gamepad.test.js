// @vitest-environment jsdom
// VIDEOTHEK LENZ: Touch-Schema „Spiel“, Ansicht (ui/gamepad.js): reine Stick-Mathematik und DOM/API der Ansicht. Die Eingabe (GameTouch) steht in store3d-gametouch.test.js.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGamepad, stickVector, stickRadius, GP_DEAD, GP_RUN_ON, GP_RUN_OFF, GP_ZONE, GP_STRIP_MIN } from '../src/js/store3d/ui/gamepad.js';

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

describe('createGamepad (Ansicht)', () => {
  let host;
  let gp;
  const q = (c) => gp.root.querySelector(`.lfx-store-gp-${c}`);
  const setSize = (w, h) => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
  };
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    gp = createGamepad(host);
  });
  afterEach(() => { gp.destroy(); host.remove(); });

  it('DOM: root, Ruhe-Stick (Basis + Knauf, kein Zonen-Element), fünf Knöpfe; Werfen anfangs versteckt', () => {
    expect(host.querySelector('.lfx-store-gp')).toBe(gp.root);
    expect(gp.root.getAttribute('aria-hidden')).toBe('true');
    for (const c of ['base', 'knob', 'btns', 'jump', 'use', 'hit', 'throw', 'zoom']) expect(q(c), c).toBeTruthy();
    expect(q('zone')).toBeNull();
    expect(q('base').parentNode).toBe(gp.root); // H1-Fix: Basis ist Kind von root
    expect(q('base').classList.contains('is-rest')).toBe(true);
    expect(q('throw').hidden).toBe(true);
    expect(q('jump').textContent).toBe('SPRINGEN');
    expect(q('zoom').textContent).toBe('ZOOM');
  });

  it('btnOf: Knöpfe und ihre Kindelemente, sonst null', () => {
    const inner = document.createElement('span');
    q('use').appendChild(inner);
    expect([gp.btnOf(q('jump')), gp.btnOf(q('use')), gp.btnOf(inner), gp.btnOf(q('hit')), gp.btnOf(q('throw')), gp.btnOf(q('zoom'))]).toEqual(['jump', 'use', 'use', 'act', 'act', 'zoom']);
    expect([gp.btnOf(gp.root), gp.btnOf(q('base')), gp.btnOf(q('knob')), gp.btnOf(document.body), gp.btnOf(null)]).toEqual([null, null, null, null, null]);
  });

  it('setStick: translate3d relativ zum root-Rect, Knopfversatz, Rennen; restStick stellt den Ruhezustand her', () => {
    gp.root.getBoundingClientRect = () => ({ left: 10, top: 20, right: 410, bottom: 820, width: 400, height: 800 });
    gp.setStick(110, 520, 12.4, -7.6, true);
    const b = q('base');
    expect(b.style.transform).toBe('translate3d(100px, 500px, 0) translate(-50%, -50%)');
    expect(b.classList.contains('is-rest')).toBe(false);
    expect(b.classList.contains('is-run')).toBe(true);
    expect(q('knob').style.transform).toBe('translate(12px, -8px)');
    gp.setStick(110, 520, 0, 0, false);
    expect(q('knob').style.transform).toBe('');
    expect(b.classList.contains('is-run')).toBe(false);
    gp.setStick(110, 520, 3, 3, true);
    gp.restStick();
    expect(b.classList.contains('is-rest')).toBe(true);
    expect(b.classList.contains('is-run')).toBe(false);
    expect(b.style.transform).toBe('');
    expect(q('knob').style.transform).toBe('');
  });

  it('press setzt is-down (Schlagen/Werfen je nach Tragen), setAimed hebt Benutzen hervor', () => {
    gp.press('jump', true);
    expect(q('jump').classList.contains('is-down')).toBe(true);
    gp.press('jump', false);
    expect(q('jump').classList.contains('is-down')).toBe(false);
    gp.press('act', true);
    expect(q('hit').classList.contains('is-down')).toBe(true);
    gp.setCarrying(true);
    gp.press('act', false);
    expect(q('hit').classList.contains('is-down')).toBe(false);
    gp.press('act', true);
    expect(q('throw').classList.contains('is-down')).toBe(true);
    gp.press('zoom', true);
    expect(q('zoom').classList.contains('is-down')).toBe(true);
    gp.setAimed(true);
    expect(q('use').classList.contains('is-aimed')).toBe(true);
    gp.setAimed(false);
    expect(q('use').classList.contains('is-aimed')).toBe(false);
  });

  it('Getragen: Werfen ersetzt Schlagen, btnOf bleibt act', () => {
    gp.setCarrying(true);
    expect([q('hit').hidden, q('throw').hidden, gp.carrying]).toEqual([true, false, true]);
    expect(gp.btnOf(q('throw'))).toBe('act');
    expect(q('use').classList.contains('is-carry')).toBe(true);
    gp.setCarrying(false);
    expect([q('hit').hidden, q('throw').hidden, gp.carrying]).toEqual([false, true, false]);
  });

  it('show(false) setzt hidden, setParked schaltet is-parked (Elemente bleiben im DOM)', () => {
    gp.show(false);
    expect(gp.root.hidden).toBe(true);
    gp.show(true);
    expect(gp.root.hidden).toBe(false);
    gp.setParked(true);
    expect(gp.root.classList.contains('is-parked')).toBe(true);
    gp.setParked(false);
    expect(gp.root.classList.contains('is-parked')).toBe(false);
  });

  it('zoneOf: Querformat x < 42 % und y > 28 %, Hochformat x < 48 % im unteren Streifen (22 %, mind. 140 px; 1.19.2)', () => {
    expect(GP_ZONE).toEqual({ landscape: { x: 0.42, y: 0.28 }, portrait: { x: 0.48, y: 0.78 } });
    expect(GP_STRIP_MIN).toBe(140);
    setSize(844, 390);
    expect(gp.zoneOf(100, 300)).toBe(true);
    expect(gp.zoneOf(0.42 * 844 + 1, 300)).toBe(false);
    expect(gp.zoneOf(100, 0.28 * 390 - 1)).toBe(false);
    expect(gp.zoneOf(100, 0.28 * 390 + 1)).toBe(true);
    setSize(390, 844);
    expect(gp.zoneOf(0.46 * 390, 0.9 * 844)).toBe(true);
    expect(gp.zoneOf(0.48 * 390 + 1, 0.9 * 844)).toBe(false);
    expect(gp.zoneOf(100, 0.78 * 844 + 1)).toBe(true);
    expect(gp.zoneOf(100, 0.78 * 844 - 1)).toBe(false);
    // vorher Stick-Zone (untere 58 %), jetzt Umsehen: rechter Daumen wischt dort
    expect(gp.zoneOf(100, 0.5 * 844)).toBe(false);
    expect(gp.zoneOf(100, 0.7 * 844)).toBe(false);
  });

  it('zoneOf Hochformat: Mindesthöhe 140 px bei niedrigem Fenster (Safari-Leisten, kleines Handy)', () => {
    setSize(375, 550); // 22 % wären 121 px < 140
    expect(gp.zoneOf(100, 550 - 139)).toBe(true);
    expect(gp.zoneOf(100, 550 - 141)).toBe(false);
    setSize(402, 750); // 22 % = 165 px > 140
    expect(gp.zoneOf(100, 750 - 164)).toBe(true);
    expect(gp.zoneOf(100, 750 - 166)).toBe(false);
  });

  it('destroy entfernt das DOM und ist wiederholbar', () => {
    gp.destroy();
    expect(host.querySelector('.lfx-store-gp')).toBe(null);
    gp.destroy();
    gp = createGamepad(host); // für afterEach
  });
});
