// @vitest-environment jsdom
// VIDEOTHEK LENZ: Touch = Halten läuft, Wischen = „Szene greifen“ (Finger rechts → Blick links), Tippen = onTap, Pinch = Zoom.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TouchControls, TOUCH_LOOK, STICK_YAW_RATE, STICK_PITCH_RATE } from '../src/js/store3d/controls/touch.js';
import { shapeStick } from '../src/js/store3d/ui/joypad.js';

function setup(extra = {}) {
  document.body.innerHTML = '';
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  canvas.setPointerCapture = () => {};
  const player = { look: vi.fn() };
  const onTap = vi.fn();
  const onZoom = vi.fn();
  const state = { mode: 'play' };
  const tc = new TouchControls({ canvas, player, getMode: () => state.mode, onTap, onZoom, ...extra });
  tc.attach();
  const fire = (type, x, y, id = 1) => {
    const e = new Event(type, { bubbles: true });
    Object.assign(e, { pointerId: id, clientX: x, clientY: y });
    canvas.dispatchEvent(e);
  };
  return { tc, canvas, player, onTap, onZoom, state, fire };
}

describe('TouchControls Feineinstellung', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const swipe = (fire) => { fire('pointerdown', 100, 100); fire('pointermove', 120, 120); fire('pointermove', 140, 150); };
  it('Umkehr und Empfindlichkeit wirken auf Wischen', () => {
    const tune = { lookInvertY: true, touchSens: 'high' };
    const { player, fire } = setup({ getTune: () => tune });
    swipe(fire);
    const [dyaw, dpitch] = player.look.mock.calls.at(-1);
    expect(dyaw).toBeCloseTo(20 * TOUCH_LOOK * 1.4);
    expect(dpitch).toBeCloseTo(-30 * TOUCH_LOOK * 1.4);
    tune.lookInvertY = false; tune.lookInvertX = true; tune.touchSens = 'low'; // zur Laufzeit
    fire('pointermove', 160, 150);
    expect(player.look.mock.calls.at(-1)[0]).toBeCloseTo(-20 * TOUCH_LOOK * 0.7);
  });
  it('Standard (ohne getTune) bleibt unverändert', () => {
    const { player, fire } = setup();
    swipe(fire);
    expect(player.look.mock.calls.at(-1)[1]).toBeCloseTo(30 * TOUCH_LOOK);
  });
  it('Joystick-Achsen: lookInvert dreht das Vorzeichen', () => {
    const { tc, player } = setup({ getTune: () => ({ lookInvertX: true, lookInvertY: true }) });
    tc.stick = { x: 1, y: 1 };
    tc.tick(0.05);
    const [yaw, pitch] = player.look.mock.calls.at(-1);
    expect(yaw).toBeCloseTo(STICK_YAW_RATE * 0.05);
    expect(pitch).toBeCloseTo(STICK_PITCH_RATE * 0.05);
  });
});

describe('TouchControls', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('Finger nach rechts dreht den Blick nach links (yaw steigt), Finger nach unten hebt den Blick (pitch steigt)', () => {
    const { player, fire } = setup();
    fire('pointerdown', 100, 100);
    fire('pointermove', 120, 100); // Schwelle überschreiten
    fire('pointermove', 140, 100);
    const [dyaw, dpitch] = player.look.mock.calls.at(-1);
    expect(dyaw).toBeCloseTo(20 * TOUCH_LOOK);
    expect(dpitch).toBeCloseTo(0);
    fire('pointermove', 140, 130);
    expect(player.look.mock.calls.at(-1)[1]).toBeCloseTo(30 * TOUCH_LOOK);
  });

  it('kurzes Tippen ohne Bewegung löst onTap aus, kein Umsehen, kein Laufen', () => {
    const { tc, player, onTap, fire } = setup();
    fire('pointerdown', 50, 60);
    vi.advanceTimersByTime(100);
    fire('pointerup', 50, 60);
    expect(onTap).toHaveBeenCalledWith(50, 60);
    expect(player.look).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(tc.input.fwd).toBe(0);
  });

  it('Halten (250 ms) läuft vorwärts, Loslassen stoppt ohne onTap; Ring erscheint und verschwindet', () => {
    const { tc, canvas, onTap, fire } = setup();
    fire('pointerdown', 50, 60);
    expect(tc.input.fwd).toBe(0);
    vi.advanceTimersByTime(250);
    expect(tc.input).toEqual({ fwd: 1, strafe: 0, run: false });
    const ring = canvas.parentElement.querySelector('.lfx-store-walkring');
    expect(ring.classList.contains('is-on')).toBe(true);
    fire('pointerup', 50, 60);
    expect(tc.input.fwd).toBe(0);
    expect(ring.classList.contains('is-on')).toBe(false);
    expect(onTap).not.toHaveBeenCalled();
  });

  it('Ziehen während des Laufens lenkt (look), Laufen bleibt', () => {
    const { tc, player, fire } = setup();
    fire('pointerdown', 100, 100);
    vi.advanceTimersByTime(250);
    fire('pointermove', 130, 100);
    expect(player.look.mock.calls.at(-1)[0]).toBeCloseTo(30 * TOUCH_LOOK);
    expect(tc.input.fwd).toBe(1);
  });

  it('Wischen sofort (20 px) = Umsehen, nie Laufen', () => {
    const { tc, player, onTap, fire } = setup();
    fire('pointerdown', 100, 100);
    fire('pointermove', 120, 100);
    vi.advanceTimersByTime(400);
    expect(player.look).toHaveBeenCalled();
    expect(tc.input.fwd).toBe(0);
    fire('pointerup', 120, 100);
    expect(onTap).not.toHaveBeenCalled();
  });

  it('Pinch: Zoom > 1, kein Laufen, kein Umsehen, kein Tap', () => {
    const { tc, player, onTap, onZoom, fire } = setup();
    fire('pointerdown', 100, 100, 1);
    fire('pointerdown', 200, 100, 2);
    vi.advanceTimersByTime(400);
    expect(tc.input.fwd).toBe(0);
    fire('pointermove', 300, 100, 2);
    expect(onZoom).toHaveBeenCalled();
    expect(onZoom.mock.calls.at(-1)[0]).toBeCloseTo(2);
    fire('pointermove', 600, 100, 2);
    expect(onZoom.mock.calls.at(-1)[0]).toBe(3); // Obergrenze
    expect(player.look).not.toHaveBeenCalled();
    fire('pointerup', 600, 100, 2);
    fire('pointerup', 100, 100, 1);
    expect(onTap).not.toHaveBeenCalled();
  });

  it('beim nächsten Loslaufen fällt der Zoom auf 1', () => {
    const { onZoom, fire } = setup({ getZoom: () => 2 });
    fire('pointerdown', 10, 10);
    vi.advanceTimersByTime(250);
    expect(onZoom).toHaveBeenCalledWith(1);
  });

  it('Moduswechsel oder detach stoppt das Laufen sofort', () => {
    const { tc, canvas, state, fire } = setup();
    fire('pointerdown', 10, 10);
    vi.advanceTimersByTime(250);
    state.mode = 'pause';
    expect(tc.input.fwd).toBe(0);
    state.mode = 'play';
    fire('pointerup', 10, 10);
    fire('pointerdown', 10, 10);
    vi.advanceTimersByTime(250);
    expect(tc.input.fwd).toBe(1);
    tc.detach();
    expect(tc.input.fwd).toBe(0);
    expect(canvas.parentElement.querySelector('.lfx-store-walkring')).toBeNull();
  });
});

describe('TouchControls: Schema „Joystick“', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const padFire = (el, type, x, y, id) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, { pointerId: id, clientX: x, clientY: y });
    el.dispatchEvent(e);
  };
  function joy(extra = {}) {
    const s = setup({ scheme: 'joystick', ...extra });
    const host = s.canvas.parentElement;
    const walk = host.querySelector('.lfx-store-pad-walk');
    const stick = host.querySelector('.lfx-store-pad-stick');
    if (stick) {
      walk.setPointerCapture = () => {};
      stick.setPointerCapture = () => {};
      stick.getBoundingClientRect = () => ({ left: 300, top: 300, width: 116, height: 116, right: 416, bottom: 416 });
    }
    return { ...s, host, walk, stick };
  }

  it('legt Gehen-Knopf und Joystick an; Halten auf dem Canvas läuft nicht, Tippen nimmt weiter', () => {
    const { tc, walk, stick, onTap, fire } = joy();
    expect(walk).not.toBeNull();
    expect(stick).not.toBeNull();
    fire('pointerdown', 50, 60);
    vi.advanceTimersByTime(500);
    expect(tc.input.fwd).toBe(0);
    fire('pointerup', 50, 60);
    expect(tc.input.fwd).toBe(0);
    fire('pointerdown', 70, 80);
    fire('pointerup', 70, 80);
    expect(onTap).toHaveBeenCalledWith(70, 80);
  });

  it('Wischen auf dem Canvas sieht weiter um (Szene greifen), Pinch zoomt', () => {
    const { player, onZoom, fire } = joy();
    fire('pointerdown', 100, 100);
    fire('pointermove', 120, 100);
    fire('pointermove', 140, 100);
    expect(player.look.mock.calls.at(-1)[0]).toBeCloseTo(20 * TOUCH_LOOK);
    fire('pointerup', 140, 100);
    fire('pointerdown', 100, 100, 1);
    fire('pointerdown', 200, 100, 2);
    fire('pointermove', 300, 100, 2);
    expect(onZoom.mock.calls.at(-1)[0]).toBeCloseTo(2);
  });

  it('Gehen-Knopf: gedrückt = vorwärts, loslassen = stehen; Zoom fällt auf 1', () => {
    const { tc, walk, onZoom } = joy({ getZoom: () => 2 });
    padFire(walk, 'pointerdown', 40, 380, 7);
    expect(tc.input).toEqual({ fwd: 1, strafe: 0, run: false });
    expect(walk.classList.contains('is-on')).toBe(true);
    expect(onZoom).toHaveBeenCalledWith(1);
    padFire(walk, 'pointerup', 40, 380, 7);
    expect(tc.input.fwd).toBe(0);
  });

  it('Joystick rechts/oben dreht den Blick nach rechts/oben (Drehrate × dt), Totzone und Loslassen = 0', () => {
    const { tc, stick, player } = joy();
    padFire(stick, 'pointerdown', 358, 358, 9); // Mitte
    tc.tick(0.016);
    expect(player.look).not.toHaveBeenCalled();
    padFire(stick, 'pointermove', 358 + 200, 358, 9); // voll rechts (begrenzt)
    tc.tick(0.1);
    const [dyaw, dpitch] = player.look.mock.calls.at(-1);
    expect(dyaw).toBeCloseTo(-STICK_YAW_RATE * 0.1);
    expect(dpitch).toBeCloseTo(0);
    padFire(stick, 'pointermove', 358, 358 - 200, 9); // voll oben
    tc.tick(0.1);
    expect(player.look.mock.calls.at(-1)[1]).toBeCloseTo(STICK_PITCH_RATE * 0.1);
    padFire(stick, 'pointerup', 358, 158, 9);
    player.look.mockClear();
    tc.tick(0.1);
    expect(player.look).not.toHaveBeenCalled();
  });

  it('Laufen und Umsehen gleichzeitig (zwei Daumen)', () => {
    const { tc, walk, stick, player } = joy();
    padFire(walk, 'pointerdown', 40, 380, 1);
    padFire(stick, 'pointerdown', 358, 358, 2);
    padFire(stick, 'pointermove', 420, 358, 2);
    tc.tick(0.05);
    expect(tc.input.fwd).toBe(1);
    expect(player.look).toHaveBeenCalled();
  });

  it('Moduswechsel stoppt Gehen und Blick, showPad(false) blendet aus', () => {
    const { tc, walk, stick, state, player, host } = joy();
    padFire(walk, 'pointerdown', 40, 380, 1);
    padFire(stick, 'pointerdown', 358, 358, 2);
    padFire(stick, 'pointermove', 420, 358, 2);
    state.mode = 'paused';
    expect(tc.input.fwd).toBe(0);
    tc.tick(0.05);
    expect(player.look).not.toHaveBeenCalled();
    tc.showPad(false);
    expect(host.querySelector('.lfx-store-pad').hidden).toBe(true);
    state.mode = 'play';
    expect(tc.input.fwd).toBe(0);
  });

  it('setScheme("touch") entfernt das Pad, Halten läuft wieder; zurück legt es neu an; detach räumt auf', () => {
    const { tc, host, fire } = joy();
    tc.setScheme('touch');
    expect(host.querySelector('.lfx-store-pad')).toBeNull();
    fire('pointerdown', 50, 60);
    vi.advanceTimersByTime(250);
    expect(tc.input.fwd).toBe(1);
    fire('pointerup', 50, 60);
    tc.setScheme('joystick');
    expect(host.querySelector('.lfx-store-pad')).not.toBeNull();
    tc.detach();
    expect(host.querySelector('.lfx-store-pad')).toBeNull();
  });

  it('shapeStick: Totzone, Betrag ≤ 1, quadratische Kurve', () => {
    expect(shapeStick(0.1, 0)).toEqual({ x: 0, y: 0 });
    expect(shapeStick(1, 0).x).toBeCloseTo(1);
    const half = shapeStick(0.56, 0).x;
    expect(half).toBeCloseTo(0.25, 1);
  });
});
