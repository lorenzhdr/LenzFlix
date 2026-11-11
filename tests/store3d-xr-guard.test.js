import { describe, it, expect, vi } from 'vitest';
import { wrapDeps } from '../src/js/store3d/xr/guard.js';

function make(presenting) {
  const deps = {
    catalog: { items: new Map() }, user: { name: 'x' },
    toast: vi.fn(), play: vi.fn(() => Promise.resolve(true)), classicView: vi.fn(() => 'k'), openLibraries: vi.fn(), openSettings: vi.fn(),
    openThemePicker: vi.fn(), openMenu: vi.fn(), logout: vi.fn(), onBigCovers: vi.fn(), onFatal: vi.fn(), onReady: vi.fn(),
  };
  const xr = {
    presenting, toast: vi.fn(), beforePlay: vi.fn(), leaveCinema: vi.fn(), exit: vi.fn(),
    exitThen: vi.fn((label, fn) => { xr.fn = fn; return true; }),
  };
  return { deps, xr, w: wrapDeps(deps, () => xr) };
}

describe('xr/guard wrapDeps', () => {
  it('ohne VR ruft jede Funktion unverändert das Original', async () => {
    const { deps, xr, w } = make(false);
    w.toast('hi');
    expect(deps.toast).toHaveBeenCalledWith('hi');
    await expect(w.play({ Id: 1 }, { resume: true })).resolves.toBe(true);
    expect(deps.play).toHaveBeenCalledWith({ Id: 1 }, { resume: true });
    expect(w.classicView()).toBe('k');
    w.openMenu('anker');
    expect(deps.openMenu).toHaveBeenCalledWith('anker');
    w.onFatal(new Error('x'));
    expect(deps.onFatal).toHaveBeenCalled();
    expect(xr.toast).not.toHaveBeenCalled();
    expect(xr.beforePlay).not.toHaveBeenCalled();
    expect(xr.exitThen).not.toHaveBeenCalled();
    expect(xr.exit).not.toHaveBeenCalled();
  });

  it('kopiert Daten und unbekannte Felder, fehlende Funktionen bleiben undefined', () => {
    const { deps, w } = make(false);
    expect(w.catalog).toBe(deps.catalog);
    expect(w.onReady).toBe(deps.onReady);
    const slim = wrapDeps({ toast() {} }, () => null);
    expect(slim.play).toBeUndefined();
    expect(slim.logout).toBeUndefined();
    expect(() => slim.toast('x')).not.toThrow();
  });

  it('in VR: Toast ins Panel, Wiedergabe über beforePlay, Menüs über exitThen', async () => {
    const { deps, xr, w } = make(true);
    w.toast('hallo');
    expect(xr.toast).toHaveBeenCalledWith('hallo');
    expect(deps.toast).not.toHaveBeenCalled();
    await w.play({ Id: 2 }, { resume: false });
    expect(xr.beforePlay).toHaveBeenCalledWith({ Id: 2 }, { resume: false });
    expect(deps.play).toHaveBeenCalledWith({ Id: 2 }, { resume: false });
    for (const n of ['classicView', 'openLibraries', 'openSettings', 'openThemePicker', 'openMenu', 'logout', 'onBigCovers']) {
      xr.exitThen.mockClear();
      w[n]('a', 'b');
      expect(deps[n]).not.toHaveBeenCalledWith('a', 'b');
      expect(xr.exitThen).toHaveBeenCalledWith('Das geht nur außerhalb von VR', expect.any(Function));
      xr.fn();
      expect(deps[n]).toHaveBeenCalledWith('a', 'b');
    }
  });

  it('in VR: onFatal beendet zuerst die Sitzung; gescheitertes play verlässt das Kino', async () => {
    const { deps, xr, w } = make(true);
    w.onFatal('e');
    expect(xr.exit).toHaveBeenCalled();
    expect(deps.onFatal).toHaveBeenCalledWith('e');
    deps.play.mockResolvedValueOnce(false);
    await w.play({ Id: 3 });
    await Promise.resolve();
    expect(xr.leaveCinema).toHaveBeenCalledWith('fail');
  });
});
