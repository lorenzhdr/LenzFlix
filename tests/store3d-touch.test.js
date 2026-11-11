// @vitest-environment jsdom
// VIDEOTHEK LENZ: Wischen am Handy = „Szene greifen“ (Finger rechts → Blick links, Finger runter → Blick hoch).
import { describe, it, expect, vi } from 'vitest';
import { TouchControls, TOUCH_LOOK } from '../src/js/store3d/controls/touch.js';

function setup() {
  const canvas = document.createElement('canvas');
  canvas.setPointerCapture = () => {};
  const player = { look: vi.fn() };
  const onTap = vi.fn();
  const tc = new TouchControls({ canvas, player, getMode: () => 'play', onTap });
  tc.attach();
  const fire = (type, x, y) => {
    const e = new Event(type, { bubbles: true });
    Object.assign(e, { pointerId: 1, clientX: x, clientY: y });
    canvas.dispatchEvent(e);
  };
  return { tc, player, onTap, fire };
}

describe('TouchControls', () => {
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

  it('kurzes Tippen ohne Bewegung löst onTap aus, kein Umsehen', () => {
    const { player, onTap, fire } = setup();
    fire('pointerdown', 50, 60);
    fire('pointerup', 50, 60);
    expect(onTap).toHaveBeenCalledWith(50, 60);
    expect(player.look).not.toHaveBeenCalled();
  });
});
