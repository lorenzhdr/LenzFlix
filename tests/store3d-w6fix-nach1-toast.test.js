// 1.19.0 W6-Fix Nachlese 1 (N8): ctx.xr.toast reicht die Dauer im 2D-Zweig an deps.toast durch, ohne Dauer bleibt der Standard-Aufruf.
import { describe, it, expect, vi } from 'vitest';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';

describe('ctx.xr.toast (2D)', () => {
  it('mit ms → deps.toast(text, ms); ohne ms → deps.toast(text)', () => {
    const toast = vi.fn();
    const host = new ModuleHost({ deps: { toast }, opts: {}, layout: { w: 10, d: 10 }, engine: { scene: {}, camera: {}, renderer: {} }, player: {}, xr: null });
    host.ctx.xr.toast('a', 2200);
    host.ctx.xr.toast('b');
    expect(toast.mock.calls).toEqual([['a', 2200], ['b']]);
  });
});
