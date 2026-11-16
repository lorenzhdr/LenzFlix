// @vitest-environment jsdom
// Player: abgebrochener Pfad meldet onArrive(false).
import { describe, it, expect, vi } from 'vitest';
import { Player } from '../src/js/store3d/controls/player.js';

describe('abgebrochener Pfad', () => {
  it('meldet onArrive(false), Ankunft meldet kein false', () => {
    const p = new Player({ colliders: [{ x0: 0.5, x1: 1, z0: -5, z1: 5 }], spawn: { x: 0, z: 0, yaw: -Math.PI / 2 } });
    const cb = vi.fn();
    p.walkTo([{ x: 3, z: 0 }], cb);
    for (let i = 0; i < 60 && p.path; i++) p.update(0.05, null);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toBe(false);
    const q = new Player({ colliders: [], spawn: { x: 0, z: 0, yaw: 0 } });
    const cb2 = vi.fn();
    q.walkTo([{ x: 0.5, z: 0 }], cb2);
    for (let i = 0; i < 80 && q.path; i++) q.update(0.05, null);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb2.mock.calls[0][0]).not.toBe(false);
  });
});

