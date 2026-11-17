import { describe, it, expect, vi } from 'vitest';
import { wrapDeps } from '../src/js/store3d/xr/guard.js';

function make({ presenting = false, wants = true, begin = true } = {}) {
  const order = [];
  const deps = { toast: vi.fn(), play: vi.fn(() => { order.push('play'); return Promise.resolve(true); }), onFatal: vi.fn(), catalog: {} };
  const xr = { presenting, toast: vi.fn(), beforePlay: vi.fn(() => order.push('xr.beforePlay')), leaveCinema: vi.fn(), exit: vi.fn(), exitThen: vi.fn() };
  const pal = { wantsPlay: vi.fn(() => wants), beforePlay: vi.fn(() => { order.push('pal.beforePlay'); return begin; }), leave: vi.fn() };
  return { deps, xr, pal, order, w: wrapDeps(deps, () => xr, () => pal) };
}

describe('wrapDeps · 2D-Kino im Palast', () => {
  it('ohne getPalast bitgleich zu vorher', async () => {
    const deps = { play: vi.fn(() => Promise.resolve(true)) };
    const w = wrapDeps(deps, () => null);
    await w.play({ Id: 1 }, { resume: true });
    expect(deps.play).toHaveBeenCalledWith({ Id: 1 }, { resume: true });
  });

  it('wantsPlay() false: Original unverändert (kein noCover, kein beforePlay)', async () => {
    const { deps, pal, w } = make({ wants: false });
    await w.play({ Id: 1 }, { resume: false });
    expect(deps.play).toHaveBeenCalledWith({ Id: 1 }, { resume: false });
    expect(pal.beforePlay).not.toHaveBeenCalled();
    await w.play({ Id: 2 });
    expect(deps.play).toHaveBeenLastCalledWith({ Id: 2 }, undefined);
  });

  it('wantsPlay() true: beforePlay vor deps.play, noCover:true', async () => {
    const { deps, pal, order, w } = make();
    await w.play({ Id: 1 }, { resume: true });
    expect(order).toEqual(['pal.beforePlay', 'play']);
    expect(pal.beforePlay).toHaveBeenCalledWith({ Id: 1 }, { resume: true });
    expect(deps.play).toHaveBeenCalledWith({ Id: 1 }, { resume: true, noCover: true });
    expect(pal.leave).not.toHaveBeenCalled();
  });

  it('Fehler (false, Ablehnung, synchrones false) → leave(fail, P)', async () => {
    const a = make();
    a.deps.play.mockImplementationOnce(() => Promise.resolve(false));
    await a.w.play({ Id: 1 });
    expect(a.pal.leave).toHaveBeenCalledWith('fail', 'P');
    const b = make();
    b.deps.play.mockImplementationOnce(() => Promise.reject(new Error('x')));
    await b.w.play({ Id: 1 }).catch(() => {});
    expect(b.pal.leave).toHaveBeenCalledWith('fail', 'P');
    const c = make();
    c.deps.play.mockImplementationOnce(() => false);
    c.w.play({ Id: 1 });
    expect(c.pal.leave).toHaveBeenCalledWith('fail', 'P');
  });

  it('beforePlay false (Bau-Fehler): normaler 2D-Weg mit Ladebild', async () => {
    const { deps, w } = make({ begin: false });
    await w.play({ Id: 1 }, { resume: false });
    expect(deps.play).toHaveBeenCalledWith({ Id: 1 }, { resume: false });
  });

  it('in VR gewinnt der VR-Zweig, der 2D-Weg wird nie gefragt', async () => {
    const { deps, xr, pal, order, w } = make({ presenting: true });
    await w.play({ Id: 1 }, { resume: false });
    expect(order).toEqual(['xr.beforePlay', 'play']);
    expect(xr.beforePlay).toHaveBeenCalled();
    expect(pal.wantsPlay).not.toHaveBeenCalled();
    expect(deps.play).toHaveBeenCalledWith({ Id: 1 }, { resume: false });
  });
});
