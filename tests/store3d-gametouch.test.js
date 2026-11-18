// @vitest-environment jsdom
// VIDEOTHEK LENZ: Spiel-Steuerung 2.0 (controls/gametouch.js + controls/touch.js, Schema game): Touch Events mit Rollen-Slots, Abgleich gegen e.touches,
// Gate (on/parked/off), Watchdogs, Durchziehen, Zoom-Knopf, Pointer-Rückfall, Diagnose. Die Ansicht ist das echte ui/gamepad.js.
// Ersetzt den alten Block „TouchControls Schema game“ aus store3d-gamepad.test.js.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TouchControls, SCHEMES, TOUCH_LOOK, SENS_FACTOR } from '../src/js/store3d/controls/touch.js';
import { GameTouch, diagLine, DRAG_SLOP, PARK_MAX_MS, TAP_MS, TAP_SLOP } from '../src/js/store3d/controls/gametouch.js';
import { stickRadius } from '../src/js/store3d/ui/gamepad.js';
import { ZOOM_IN } from '../src/js/store3d/controls/desktop.js';

const W = 1000;
const H = 500; // Querformat: Stick-Zone x < 420 und y > 140, R = 48
let canvas;
let host;
let player;
let state;
let t;
let ctx;
let tc;
let root;
let tune;
let zoom;

const mkTouch = (o) => ({ identifier: o.id, clientX: o.x, clientY: o.y, target: o.target || root });
/** touches = alle liegenden Finger (nach dem Ereignis), changed = betroffene Finger. */
function touchEv(type, touches, changed, target) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  e.touches = touches.map(mkTouch);
  e.changedTouches = changed.map(mkTouch);
  (target || (changed[0] && changed[0].target) || root).dispatchEvent(e);
  return e;
}
const down = (id, x, y, others = [], target) => touchEv('touchstart', [...others, { id, x, y, target }], [{ id, x, y, target }], target);
const mv = (id, x, y, others = []) => touchEv('touchmove', [...others, { id, x, y }], [{ id, x, y }]);
const up = (id, x, y, others = []) => touchEv('touchend', others, [{ id, x, y }]);
const cancel = (id, x, y, others = []) => touchEv('touchcancel', others, [{ id, x, y }]);
const btn = (n) => root.querySelector(`.lfx-store-gp-${n}`);
const ptr = (type, id, x, y, pointerType = 'mouse', extra = {}) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: id, clientX: x, clientY: y, pointerType, isPrimary: true }, extra);
  root.dispatchEvent(e);
  return e;
};

beforeEach(() => {
  document.body.innerHTML = '';
  window.innerWidth = W;
  window.innerHeight = H;
  host = document.createElement('div');
  canvas = document.createElement('canvas');
  host.appendChild(canvas);
  document.body.appendChild(host);
  canvas.setPointerCapture = () => {};
  player = { look: vi.fn() };
  state = { mode: 'play' };
  t = 1000;
  tune = { touchRegrip: 'off' };
  zoom = 1;
  ctx = {
    canvas, player, getMode: () => state.mode, now: () => t, getTune: () => tune, getZoom: () => zoom,
    onTap: vi.fn(), onJump: vi.fn(), onUse: vi.fn(), onHit: vi.fn(), onThrow: vi.fn(), onZoom: vi.fn(),
  };
  tc = new TouchControls({ ...ctx, scheme: 'game', debug: true });
  tc.attach();
  root = host.querySelector('.lfx-store-gp');
  root.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H });
});
afterEach(() => { tc.detach(); });

const baseEl = () => root.querySelector('.lfx-store-gp-base');

describe('Spiel-Steuerung 2.0: Grundlagen', () => {
  it('SCHEMES enthält game; Klassen-Standard bleibt touch; Konstanten', () => {
    expect(SCHEMES).toEqual(['game', 'joystick', 'touch']);
    expect(new TouchControls({ ...ctx }).scheme).toBe('touch');
    expect([DRAG_SLOP, PARK_MAX_MS, TAP_MS, TAP_SLOP, ZOOM_IN]).toEqual([12, 1500, 250, 9, 2.6]);
  });

  it('H1: die Basis ist Kind von root und liegt exakt unter dem Finger (auch ganz unten)', () => {
    expect(baseEl().parentElement).toBe(root);
    down(1, 100, 490);
    expect(baseEl().style.transform).toBe('translate3d(100px, 490px, 0) translate(-50%, -50%)');
    // root mit Versatz: Position relativ zum Rect
    up(1, 100, 490);
    root.getBoundingClientRect = () => ({ left: 20, top: 10, width: W, height: H });
    down(1, 100, 300);
    expect(baseEl().style.transform).toBe('translate3d(80px, 290px, 0) translate(-50%, -50%)');
  });

  it('Ruhe-Stick: is-rest im Leerlauf, nach touchend wieder is-rest', () => {
    expect(baseEl().classList.contains('is-rest')).toBe(true);
    down(1, 100, 400);
    expect(baseEl().classList.contains('is-rest')).toBe(false);
    up(1, 100, 400);
    expect(baseEl().classList.contains('is-rest')).toBe(true);
    expect(tc.input.fwd).toBe(0);
  });

  it('Stick: Richtung, Mitziehen jenseits von R, Rennen mit Hysterese, Rückkehr ins Gehen', () => {
    const R = stickRadius(W, H);
    down(1, 100, 400);
    mv(1, 100, 400 - R * 0.6);
    expect(tc.input.fwd).toBeCloseTo(1, 6);
    expect(tc.input.run).toBe(false);
    mv(1, 100 + 200, 400); // weit nach rechts: Basis folgt um (d - R)
    expect(tc.input.strafe).toBeCloseTo(1, 6);
    expect(tc.input.run).toBe(true);
    expect(baseEl().style.transform).toBe(`translate3d(${Math.round(100 + 200 - R)}px, 400px, 0) translate(-50%, -50%)`);
    expect(baseEl().classList.contains('is-run')).toBe(true);
    const ox = 100 + 200 - R; // neue Basis-Mitte
    mv(1, ox + R * 0.85, 400); // zwischen 0,8 und 0,92: Rennen bleibt (Hysterese)
    expect(tc.input.run).toBe(true);
    mv(1, ox + R * 0.6, 400); // unter 0,8: Gehen
    expect(tc.input.run).toBe(false);
    expect(tc.input.scale).toBeGreaterThan(0);
  });

  it('Blick: gleiche Formel wie touch.js, Flip/Empfindlichkeit, geteilt durch den Zoom', () => {
    down(1, 700, 300);
    mv(1, 720, 300);
    mv(1, 740, 330);
    let [yaw, pitch] = player.look.mock.calls.at(-1);
    expect(yaw).toBeCloseTo(-20 * TOUCH_LOOK);
    expect(pitch).toBeCloseTo(-30 * TOUCH_LOOK);
    tune.lookFlipX = true; tune.lookFlipY = true; tune.touchSens = 'high';
    zoom = 2;
    mv(1, 760, 360);
    [yaw, pitch] = player.look.mock.calls.at(-1);
    expect(yaw).toBeCloseTo(20 * TOUCH_LOOK * SENS_FACTOR.high / 2);
    expect(pitch).toBeCloseTo(30 * TOUCH_LOOK * SENS_FACTOR.high / 2);
  });

  it('Blick und Stick gleichzeitig', () => {
    down(1, 100, 400);
    mv(1, 100, 380, []);
    down(2, 700, 300, [{ id: 1, x: 100, y: 380 }]);
    mv(2, 730, 300, [{ id: 1, x: 100, y: 380 }]);
    expect(player.look).toHaveBeenCalled();
    expect(tc.input.fwd).toBeCloseTo(1, 6);
  });
});

describe('Spiel-Steuerung 2.0: verwaiste Finger', () => {
  it('neuer Finger ohne den alten in touches: Stick wird bereinigt (orphan), der neue sieht um', () => {
    down(1, 100, 400);
    mv(1, 100, 380);
    expect(tc.input.fwd).toBeGreaterThan(0);
    touchEv('touchstart', [{ id: 2, x: 700, y: 300 }], [{ id: 2, x: 700, y: 300 }]);
    expect(tc.input.fwd).toBe(0);
    expect(baseEl().classList.contains('is-rest')).toBe(true);
    const d = tc.diag();
    expect(d.n.orphan).toBe(1);
    expect(d.roles.stick).toBe(null);
    expect(d.roles.look).toBe(2);
    expect(d.last.why).toBe('orphan');
    expect(d.last.role).toBe('stick');
    mv(2, 730, 300);
    expect(player.look).toHaveBeenCalled();
  });

  it('Abgleich auch bei touchmove und touches=[] löst alles', () => {
    down(1, 100, 400);
    down(2, 700, 300, [{ id: 1, x: 100, y: 400 }]);
    touchEv('touchmove', [{ id: 2, x: 710, y: 300 }], [{ id: 2, x: 710, y: 300 }]); // Finger 1 fehlt
    expect(tc.diag().roles.stick).toBe(null);
    expect(tc.diag().n.orphan).toBe(1);
    touchEv('touchmove', [], [{ id: 2, x: 720, y: 300 }]);
    expect(tc.diag().roles.look).toBe(null);
    expect(tc.diag().n.orphan).toBe(2);
  });

  it('wiederverwendete ID: der alte Eintrag wird mit Grund reuse gelöst', () => {
    down(1, 100, 400);
    down(1, 700, 300, []); // Chrome vergibt ID 1 erneut
    const d = tc.diag();
    expect(d.n.reuse).toBe(1);
    expect(d.roles.stick).toBe(null);
    expect(d.roles.look).toBe(1);
  });

  it('touchcancel löst die Rolle ohne Tipp (Grund cancel)', () => {
    down(1, 100, 400);
    cancel(1, 100, 400);
    expect(ctx.onTap).not.toHaveBeenCalled();
    expect(tc.diag().n.cancel).toBe(1);
    expect(tc.diag().roles.stick).toBe(null);
  });
});

describe('Spiel-Steuerung 2.0: Knöpfe, Durchziehen, Zoom', () => {
  it('zwei Finger rechts: kein Zoom, der erste sieht weiter um, der zweite bleibt ohne Rolle', () => {
    down(1, 700, 300);
    down(2, 800, 300, [{ id: 1, x: 700, y: 300 }]);
    expect(ctx.onZoom).not.toHaveBeenCalled();
    mv(1, 730, 300, [{ id: 2, x: 800, y: 300 }]);
    expect(player.look).toHaveBeenCalled();
    expect(tc.diag().roles).toMatchObject({ look: 1, zoom: null, stick: null });
  });

  it('Knöpfe feuern beim Drücken einmal; Werfen statt Schlagen bei getragener Hülle', () => {
    down(1, 900, 450, [], btn('jump'));
    down(2, 900, 380, [{ id: 1, x: 900, y: 450 }], btn('use'));
    down(3, 800, 450, [{ id: 1, x: 900, y: 450 }, { id: 2, x: 900, y: 380 }], btn('hit'));
    expect([ctx.onJump.mock.calls.length, ctx.onUse.mock.calls.length, ctx.onHit.mock.calls.length, ctx.onThrow.mock.calls.length]).toEqual([1, 1, 1, 0]);
    expect(btn('jump').classList.contains('is-down')).toBe(true);
    up(1, 900, 450, [{ id: 2, x: 900, y: 380 }, { id: 3, x: 800, y: 450 }]);
    expect(btn('jump').classList.contains('is-down')).toBe(false);
    tc.reset();
    tc.setCarrying(true);
    down(4, 800, 450, [], btn('throw'));
    expect(ctx.onThrow).toHaveBeenCalledTimes(1);
    expect(ctx.onHit).toHaveBeenCalledTimes(1);
  });

  it('Durchziehen: 5 px bleiben Knopf, 20 px werden Blick (nur Deltas ab der Übernahme)', () => {
    down(1, 900, 450, [], btn('jump'));
    mv(1, 905, 450);
    expect(player.look).not.toHaveBeenCalled();
    expect(tc.diag().roles.jump).toBe(1);
    mv(1, 920, 450); // > DRAG_SLOP: Übernahme an der aktuellen Position, kein Sprung
    expect(player.look).not.toHaveBeenCalled();
    expect(tc.diag().roles.look).toBe(1);
    expect(btn('jump').classList.contains('is-down')).toBe(false);
    mv(1, 930, 450);
    expect(player.look).toHaveBeenCalledTimes(1);
    expect(player.look.mock.calls[0][0]).toBeCloseTo(-10 * TOUCH_LOOK);
    expect(ctx.onJump).toHaveBeenCalledTimes(1); // nicht erneut
    up(1, 930, 450);
    expect(ctx.onTap).not.toHaveBeenCalled();
  });

  it('Durchziehen bei belegtem Blick: der Finger bleibt reiner Knopf', () => {
    down(1, 700, 200);
    down(2, 900, 450, [{ id: 1, x: 700, y: 200 }], btn('use'));
    mv(2, 960, 450, [{ id: 1, x: 700, y: 200 }]);
    expect(player.look).not.toHaveBeenCalled();
    expect(tc.diag().roles).toMatchObject({ use: 2, look: 1 });
  });

  it('Zoom-Knopf: Halten = 2,6, Loslassen/Abbruch/reset/setScheme = 1', () => {
    down(1, 800, 400, [], btn('zoom'));
    expect(ctx.onZoom).toHaveBeenLastCalledWith(ZOOM_IN);
    expect(tc.diag().zoom).toBe(ZOOM_IN);
    up(1, 800, 400);
    expect(ctx.onZoom).toHaveBeenLastCalledWith(1);
    down(1, 800, 400, [], btn('zoom'));
    cancel(1, 800, 400);
    expect(ctx.onZoom).toHaveBeenLastCalledWith(1);
    down(1, 800, 400, [], btn('zoom'));
    tc.reset();
    expect(ctx.onZoom).toHaveBeenLastCalledWith(1);
    down(1, 800, 400, [], btn('zoom'));
    ctx.onZoom.mockClear();
    tc.setScheme('joystick');
    expect(ctx.onZoom).toHaveBeenCalledWith(1);
  });

  it('Zoom-Finger zieht: Blick plus Zoom bleibt', () => {
    down(1, 800, 400, [], btn('zoom'));
    ctx.onZoom.mockClear();
    mv(1, 830, 400); // Übernahme
    mv(1, 840, 400);
    expect(player.look).toHaveBeenCalledTimes(1);
    expect(ctx.onZoom).not.toHaveBeenCalled();
    expect(tc.diag().roles).toMatchObject({ zoom: 1, look: 1 });
    up(1, 840, 400);
    expect(ctx.onZoom).toHaveBeenLastCalledWith(1);
    expect(tc.diag().roles).toMatchObject({ zoom: null, look: null });
  });

  it('Tipp links (Stick-Finger) und rechts (Blick-Finger) nur im Spielmodus; Halten oder Ziehen tippt nicht', () => {
    down(1, 120, 300);
    up(1, 120, 300);
    expect(ctx.onTap).toHaveBeenLastCalledWith(120, 300);
    down(2, 700, 250);
    up(2, 700, 250);
    expect(ctx.onTap).toHaveBeenLastCalledWith(700, 250);
    ctx.onTap.mockClear();
    down(1, 120, 300);
    t += 400; // zu lang
    up(1, 120, 300);
    down(2, 700, 250);
    mv(2, 730, 250); // gezogen
    up(2, 730, 250);
    down(1, 120, 300);
    mv(1, 150, 300); // gezogen
    up(1, 150, 300);
    expect(ctx.onTap).not.toHaveBeenCalled();
    state.mode = 'hold';
    down(1, 120, 300);
    up(1, 120, 300);
    expect(ctx.onTap).not.toHaveBeenCalled();
  });
});

describe('Spiel-Steuerung 2.0: Gate', () => {
  it('Pause mit liegendem Stick: Eingabe 0, root.hidden, Grund mode:paused; derselbe Finger wirkt nicht mehr, Neuaufsetzen geht', () => {
    down(1, 100, 400);
    mv(1, 100, 380);
    expect(tc.input.fwd).toBeGreaterThan(0);
    tc.gate({ mode: 'paused' });
    expect(tc.input.fwd).toBe(0);
    expect(root.hidden).toBe(true);
    expect(tc.padShown).toBe(false);
    expect(tc.diag()).toMatchObject({ gate: 'off', gateWhy: 'mode:paused' });
    expect(tc.diag().n.rel.mode).toBe(1);
    tc.gate({ mode: 'play' });
    expect(root.hidden).toBe(false);
    mv(1, 100, 360, []);
    expect(tc.input.fwd).toBe(0);
    down(1, 100, 400);
    mv(1, 100, 380);
    expect(tc.input.fwd).toBeGreaterThan(0);
  });

  it('Moduswechsel ohne gate-Aufruf: input liefert 0 (wie bisher)', () => {
    down(1, 100, 400);
    mv(1, 100, 380);
    state.mode = 'paused';
    expect(tc.input.fwd).toBe(0);
    expect(root.hidden).toBe(true);
  });

  it('parked < 1,5 s: Stick und Blick laufen nach der Rückkehr ohne Loslassen weiter, ohne Blicksprung, Zoom wird neu gesetzt', () => {
    down(1, 100, 400);
    mv(1, 100, 380);
    down(2, 700, 300, [{ id: 1, x: 100, y: 380 }]);
    down(3, 800, 400, [{ id: 1, x: 100, y: 380 }, { id: 2, x: 700, y: 300 }], btn('zoom'));
    tc.gate({ mode: 'play', lock: 'cam' });
    expect(root.classList.contains('is-parked')).toBe(true);
    expect(tc.padShown).toBe(false);
    expect(tc.input.fwd).toBe(0);
    player.look.mockClear();
    mv(2, 760, 300, [{ id: 1, x: 100, y: 380 }, { id: 3, x: 800, y: 400 }]); // läuft mit, wirkt aber nicht
    expect(player.look).not.toHaveBeenCalled();
    t += 1000;
    ctx.onZoom.mockClear();
    tc.gate({ mode: 'play', lock: 'cam' });
    tc.gate({ mode: 'play' });
    expect(root.classList.contains('is-parked')).toBe(false);
    expect(tc.input.fwd).toBeGreaterThan(0);
    expect(ctx.onZoom).toHaveBeenCalledWith(ZOOM_IN);
    mv(2, 770, 300, [{ id: 1, x: 100, y: 380 }, { id: 3, x: 800, y: 400 }]);
    expect(player.look).toHaveBeenCalledTimes(1);
    expect(player.look.mock.calls[0][0]).toBeCloseTo(-10 * TOUCH_LOOK);
    const d = tc.diag();
    expect(d.n.parkResume).toBe(1);
    expect(d.lastHide.why).toBe('locked:cam');
  });

  it('parked > 1,5 s: alle Slots gelöst (Grund locked:cam bzw. locked:freeze)', () => {
    down(1, 100, 400);
    mv(1, 100, 380);
    tc.gate({ mode: 'play', lock: 'freeze' });
    t += PARK_MAX_MS - 1;
    tc.gate({ mode: 'play', lock: 'freeze' });
    expect(tc.diag().roles.stick).toBe(1);
    t += 2;
    tc.gate({ mode: 'play', lock: 'freeze' });
    const d = tc.diag();
    expect(d.roles.stick).toBe(null);
    expect(d.last.why).toBe('locked:freeze');
    expect(d.n.rel.locked).toBe(1);
    tc.gate({ mode: 'play' });
    expect(d.n.parkResume).toBe(0); // nichts zum Fortsetzen
  });

  it('neue Finger werden im Zustand parked ignoriert', () => {
    tc.gate({ mode: 'play', lock: 'cam' });
    down(1, 100, 400);
    expect(tc.diag().roles.stick).toBe(null);
  });

  it('XR: gate({ xr }) löst alles, Grund xr', () => {
    down(1, 100, 400);
    tc.gate({ xr: true });
    expect(tc.diag()).toMatchObject({ gate: 'off', gateWhy: 'xr' });
    expect(tc.diag().roles.stick).toBe(null);
  });

  it('showPad(false) bleibt als Wrapper: root.hidden', () => {
    tc.showPad(false);
    expect(root.hidden).toBe(true);
    tc.showPad(true);
    expect(root.hidden).toBe(false);
  });
});

describe('Spiel-Steuerung 2.0: Watchdogs', () => {
  const hold = () => { down(1, 100, 400); mv(1, 100, 380); expect(tc.input.fwd).toBeGreaterThan(0); };
  it('visibilitychange (hidden)', () => {
    hold();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
    expect(tc.input.fwd).toBe(0);
    expect(tc.diag().n.rel.hidden).toBe(1);
    expect(tc.diag().last.why).toBe('hidden');
  });
  it('sichtbar bleibt unberührt', () => {
    hold();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(tc.input.fwd).toBeGreaterThan(0);
  });
  it('pagehide und blur', () => {
    hold();
    window.dispatchEvent(new Event('pagehide'));
    expect(tc.input.fwd).toBe(0);
    hold();
    window.dispatchEvent(new Event('blur'));
    expect(tc.input.fwd).toBe(0);
    expect(tc.diag().n.rel).toMatchObject({ pagehide: 1, blur: 1 });
  });
  it('matchMedia(orientation)-Änderung und orientationchange; resize löst nichts', () => {
    tc.detach();
    const listeners = [];
    const mq = { matches: false, addEventListener: (ty, fn) => listeners.push(fn), removeEventListener: (ty, fn) => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); } };
    window.matchMedia = () => mq;
    try {
      tc.attach();
      root = host.querySelector('.lfx-store-gp');
      expect(listeners.length).toBe(1);
      hold();
      window.dispatchEvent(new Event('resize'));
      expect(tc.input.fwd).toBeGreaterThan(0);
      listeners[0]({ matches: true });
      expect(tc.input.fwd).toBe(0);
      hold();
      window.dispatchEvent(new Event('orientationchange'));
      expect(tc.input.fwd).toBe(0);
      expect(tc.diag().n.rel.orient).toBe(2);
      tc.detach();
      expect(listeners.length).toBe(0);
    } finally { delete window.matchMedia; }
  });
  it('setScheme und detach lösen (Grund scheme/detach)', () => {
    hold();
    tc.setScheme('touch');
    expect(tc.diag().n.rel.scheme).toBe(1);
    tc.setScheme('game');
    root = host.querySelector('.lfx-store-gp');
    down(1, 100, 400);
    tc.detach();
    expect(tc.diag().n.rel.detach).toBe(1);
  });
});

describe('Spiel-Steuerung 2.0: Ereignisse und Listener', () => {
  it('fremdes Ziel (Knopf in .lfx-store-ov): kein Slot, kein preventDefault; eigenes Ziel: preventDefault', () => {
    const ov = document.createElement('div');
    ov.className = 'lfx-store-ov';
    const b = document.createElement('button');
    ov.appendChild(b);
    host.appendChild(ov);
    const foreign = new Event('touchstart', { bubbles: true, cancelable: true });
    foreign.touches = [{ identifier: 1, clientX: 100, clientY: 400, target: b }];
    foreign.changedTouches = foreign.touches;
    b.dispatchEvent(foreign);
    expect(foreign.defaultPrevented).toBe(false);
    expect(tc.diag().roles.stick).toBe(null);
    expect(tc.diag().n.start).toBe(0);
    const own = down(1, 100, 400);
    expect(own.defaultPrevented).toBe(true);
    expect(tc.diag().roles.stick).toBe(1);
  });

  it('Listener-Bilanz bei attach/detach/setScheme: gleich viele add wie remove', () => {
    tc.detach();
    const add = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const rem = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    tc.attach();
    expect(add.mock.calls.length).toBeGreaterThan(8);
    tc.setScheme('touch');
    tc.setScheme('game');
    tc.setScheme('joystick');
    tc.setScheme('game');
    tc.detach();
    const nAdd = add.mock.calls.length;
    const nRem = rem.mock.calls.length;
    add.mockRestore();
    rem.mockRestore();
    expect(nRem).toBe(nAdd);
    expect(host.querySelectorAll('.lfx-store-gp, .lfx-store-pad').length).toBe(0);
    tc.attach();
    root = host.querySelector('.lfx-store-gp');
  });

  it('Pointer-Rückfall: Maus steuert den Stick, pointerType touch wird ignoriert', () => {
    ptr('pointerdown', 1, 100, 400, 'touch');
    expect(tc.diag().roles.stick).toBe(null);
    ptr('pointerdown', 1, 100, 400, 'mouse');
    ptr('pointermove', 1, 100, 380, 'mouse');
    expect(tc.input.fwd).toBeCloseTo(1, 6);
    ptr('pointerup', 1, 100, 380, 'mouse');
    expect(tc.input.fwd).toBe(0);
    ptr('pointerdown', 1, 100, 400, 'mouse');
    ptr('lostpointercapture', 1, 100, 400, 'mouse');
    expect(tc.diag().roles.stick).toBe(null);
    expect(tc.diag().n.lost).toBe(1);
    ptr('lostpointercapture', 1, 100, 400, 'mouse'); // nach normalem Ende: kein Slot, nichts zu zählen
    expect(tc.diag().n.lost).toBe(1);
  });

  it('touchApi pointer (Plan B): Touch-Pointer steuern, ein primärer Pointer bereinigt Reste', () => {
    tc.detach();
    tc = new TouchControls({ ...ctx, scheme: 'game', touchApi: 'pointer' });
    tc.attach();
    root = host.querySelector('.lfx-store-gp');
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H });
    ptr('pointerdown', 5, 100, 400, 'touch');
    ptr('pointermove', 5, 100, 380, 'touch');
    expect(tc.input.fwd).toBeCloseTo(1, 6);
    ptr('pointerdown', 9, 700, 300, 'touch', { isPrimary: true }); // 5 war verwaist
    expect(tc.diag().roles).toMatchObject({ stick: null, look: 'p9' });
    expect(tc.diag().n.orphan).toBe(1);
    expect(tc.diag().api).toBe('pointer');
    // Touch Events werden in diesem Modus nicht gebunden
    down(1, 100, 400);
    expect(tc.diag().roles.stick).toBe(null);
  });
});

describe('Spiel-Steuerung 2.0: Diagnose', () => {
  it('Form von diag()', () => {
    const d0 = tc.diag();
    expect(d0).toMatchObject({ v: 1, api: 'touch', scheme: 'game', gate: 'on', gateWhy: '', fingers: 0, stick: null, zoom: 1, last: null, lastHide: null });
    expect(Object.keys(d0.roles)).toEqual(['stick', 'look', 'jump', 'use', 'act', 'zoom', 'view', 'aux']);
    expect(Object.keys(d0.n)).toEqual(['start', 'end', 'cancel', 'orphan', 'reuse', 'lost', 'parkResume', 'rel']);
    expect(d0.layout).toMatchObject({ w: W, h: H, portrait: false, R: 48 });
    down(1, 100, 400);
    mv(1, 100, 380);
    const d = tc.diag();
    expect(d.fingers).toBe(1);
    expect(d.roles.stick).toBe(1);
    expect(d.stick).toMatchObject({ x: 0, y: -20, run: false, follow: 0 });
    expect(d.log.length).toBeGreaterThan(0);
    expect(d.log[0]).toHaveLength(6);
  });

  it('Schema-Wechsel: scheme folgt, Zähler überstehen ihn', () => {
    down(1, 100, 400);
    touchEv('touchstart', [{ id: 2, x: 700, y: 300 }], [{ id: 2, x: 700, y: 300 }]);
    tc.setScheme('touch');
    expect(tc.diag().scheme).toBe('touch');
    expect(tc.diag().n.orphan).toBe(1);
    expect(tc.diagLine()).toBe(null);
  });

  it('diagLine(): ohne Vorfälle, mit Vorfällen, Pad-aus-Zeile', () => {
    expect(diagLine(tc.diag())).toBe('Eingabe: 0 Finger · keine Abbrüche');
    expect(diagLine(null)).toBe('');
    down(1, 100, 400);
    down(2, 700, 300, [{ id: 1, x: 100, y: 400 }]);
    expect(tc.diagLine()).toBe('Eingabe: 2 Finger (Stick, Blick) · keine Abbrüche');
    touchEv('touchmove', [{ id: 2, x: 710, y: 300 }], [{ id: 2, x: 710, y: 300 }]); // Finger 1 verwaist
    t += 12000;
    const line = tc.diagLine();
    expect(line).toContain('Eingabe: 1 Finger (Blick)');
    expect(line).toContain('bereinigt 1');
    expect(line).toContain('zuletzt: verwaist am Stick vor 12 s');
    up(2, 710, 300);
    tc.gate({ mode: 'paused' });
    t += 40000;
    expect(tc.diagLine().split('\n')[1]).toBe('Pad aus zuletzt: Menü vor 40 s');
    expect(diagLine({ fingers: 0, roles: {}, n: { parkResume: 3 }, last: null, lastHide: { why: 'locked:cam', ago: 40 } })).toBe('Eingabe: 0 Finger · keine Abbrüche\nPad aus zuletzt: Kamerafahrt vor 40 s · fortgesetzt 3×');
  });
});

describe('GameTouch mit Ansichts-Double (Kern ohne DOM)', () => {
  it('start/move/end/releaseAll sind ereignisquellen-neutral', () => {
    const view = {
      root: document.createElement('div'), btnOf: () => null, setStick: vi.fn(), restStick: vi.fn(), press: vi.fn(), show: vi.fn(), setParked: vi.fn(), zoneOf: (x) => x < 400, carrying: false,
    };
    const look = vi.fn();
    const g = new GameTouch({ now: () => 0, look, onTap: vi.fn(), onZoom: vi.fn() });
    g.attach(view);
    expect(g.start('a', 100, 300, view.root)).toBe(true); // Stick
    expect(g.start('b', 700, 300, view.root)).toBe(true); // Blick
    expect(g.start('c', 800, 300, view.root)).toBe(false); // ohne Rolle
    g.move('b', 720, 300);
    expect(look).toHaveBeenCalledWith(20, 0);
    g.end('b', false);
    g.releaseAll('blur');
    expect(view.restStick).toHaveBeenCalled();
    expect(g.diag().n.rel.blur).toBe(1);
    g.detach();
    expect(g.view).toBe(null);
  });
});

describe('Spiel-Steuerung 2.0: Integration mit der echten Ansicht', () => {
  it('btnOf: Kindelement eines Knopfes zählt als Knopf; Stick-Zone und Zoom-Knopf', () => {
    const span = document.createElement('span');
    btn('use').appendChild(span);
    expect(tc.pad.btnOf(span)).toBe('use');
    expect(tc.pad.btnOf(root)).toBe(null);
    down(1, 900, 250, [], span);
    expect(ctx.onUse).toHaveBeenCalledTimes(1);
    expect(btn('use').classList.contains('is-down')).toBe(true);
    up(1, 900, 250);
    expect(btn('use').classList.contains('is-down')).toBe(false);
  });
});

