// @vitest-environment jsdom
// ModuleHost.walkTo: blockierter Pfad (Player ruft cb(false)) löst mit false auf und dreht nicht.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/js/store3d/nav/path.js', () => ({ findPath: () => [{ x: 1, z: 1 }], isFree: () => true }));
const { ModuleHost } = await import('../src/js/store3d/modules/runtime.js');

const host = (ok) => {
  const player = { x: 0, z: 0, faceYaw: vi.fn(), walkTo: vi.fn((path, cb) => (ok === false ? cb(false) : cb())) };
  const h = Object.assign(Object.create(ModuleHost.prototype), { app: { layout: { nav: {} }, player }, walkPending: null, flushNav: vi.fn(), xrOn: () => false });
  return { h, player };
};

describe('ModuleHost.walkTo', () => {
  it('blockierter Pfad: false, keine Drehung', async () => {
    const { h, player } = host(false);
    expect(await h.walkTo(1, 1, { face: 1 })).toBe(false);
    expect(player.faceYaw).not.toHaveBeenCalled();
  });
  it('erreichtes Ziel: true und Drehung', async () => {
    const { h, player } = host(true);
    expect(await h.walkTo(1, 1, { face: 1 })).toBe(true);
    expect(player.faceYaw).toHaveBeenCalledWith(1);
  });
});
