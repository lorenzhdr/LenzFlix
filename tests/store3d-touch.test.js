// @vitest-environment jsdom
// VIDEOTHEK LENZ: Touch = Halten läuft, Wischen = „Szene greifen“ (Finger rechts → Blick links), Tippen = onTap, Pinch = Zoom.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TouchControls, TOUCH_LOOK } from '../src/js/store3d/controls/touch.js';

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
