// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PerspectiveCamera } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';

const depts = [{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ['a', 'b'] }];

function fakeApp(xr) {
  const layout = buildLayout(depts);
  const app = {
    layout, deps: { catalog: {}, toast: vi.fn() }, opts: {}, phone: false, touch: false, sound: false, mode: 'play',
    engine: { scene: {}, camera: new PerspectiveCamera(), renderer: {}, preset: { level: 'mid' } },
    player: { x: layout.spawn.x, z: layout.spawn.z, yaw: 0, pitch: 0, state: {}, cancelPath() {}, teleport: vi.fn(), turnTo: null, moved: 0 },
    setMode(m) { app.mode = m; },
    holdview: { isOpen: false },
  };
  if (xr) app.xr = xr;
  return app;
}

function fakeXr(presenting = true) {
  const x = {
    presenting,
    panels: [],
    jumpTo: vi.fn(() => Promise.resolve(true)),
    toast: vi.fn(),
    exitThen: vi.fn(),
    openPanel: vi.fn((spec) => {
      const h = {
        open: true, mesh: {}, spec, update: vi.fn(), hit: () => null, hover: () => null, scroll: vi.fn(), activate: () => false,
        close() { if (!h.open) return; h.open = false; if (spec.onClose) spec.onClose(); },
      };
      x.panels.push(h);
      return h;
    }),
  };
  return x;
}

afterEach(() => { MODULES.length = 0; });

describe('ModuleHost in VR', () => {
  it('ohne app.xr gilt presenting() === false und das Overlay arbeitet wie bisher', () => {
    const app = fakeApp(null);
    app.host = document.createElement('div');
    app.desktop = null;
    const host = new ModuleHost(app);
    expect(host.ctx.xr.presenting()).toBe(false);
    expect(host.ctx.overlay.isOpen()).toBe(false);
    const el = document.createElement('div');
    host.ctx.overlay.open(el, {});
    expect(host.ctx.overlay.isOpen()).toBe(true);
    expect(el.parentNode).toBe(app.host);
    host.ctx.overlay.close();
    expect(host.ctx.overlay.isOpen()).toBe(false);
  });

  it('walkTo/flyTo werden zu jumpTo (löst mit true), lookAt sofort, release No-op', async () => {
    const xr = fakeXr();
    const host = new ModuleHost(fakeApp(xr));
    expect(host.ctx.xr.presenting()).toBe(true);
    await expect(host.ctx.player.walkTo(3, 4, { face: 1 })).resolves.toBe(true);
    expect(xr.jumpTo).toHaveBeenCalledWith(3, 4, { face: 1 });
    await expect(host.ctx.player.camera.flyTo({ x: 1, y: 1, z: 2 }, { x: 5, y: 1, z: 6 }, 500)).resolves.toBe(true);
    expect(xr.jumpTo).toHaveBeenLastCalledWith(1, 2, { face: { x: 5, z: 6 } });
    await expect(host.ctx.player.lookAt(1, 1, 1, 400)).resolves.toBe(true);
    expect(host.look).toBeNull();
    const cam = { resolve: vi.fn() };
    host.cam = cam;
    host.ctx.player.camera.release();
    expect(host.cam).toBe(cam);
    expect(cam.resolve).not.toHaveBeenCalled();
    host.cam = null;
  });

  it('rohes overlay.open öffnet nichts: Hinweis, onClose asynchron, kein Moduswechsel', async () => {
    const xr = fakeXr();
    const app = fakeApp(xr);
    app.host = document.createElement('div');
    const host = new ModuleHost(app);
    const onClose = vi.fn();
    const el = document.createElement('div');
    host.ctx.overlay.open(el, { onClose });
    expect(xr.toast).toHaveBeenCalledWith('In VR noch nicht verfügbar');
    expect(el.parentNode).toBeNull();
    expect(host.ctx.overlay.isOpen()).toBe(false);
    expect(app.mode).toBe('play');
    expect(onClose).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('xr.panel.open zählt als Overlay; overlay.close und handle.close schließen beides, onClose einmal', () => {
    const xr = fakeXr();
    const app = fakeApp(xr);
    const host = new ModuleHost(app);
    const onClose = vi.fn();
    const h = host.ctx.xr.panel.open({ title: 'T', onClose });
    expect(host.ctx.overlay.isOpen()).toBe(true);
    expect(app.mode).toBe('overlay');
    host.ctx.overlay.close();
    expect(h.open).toBe(false);
    expect(host.ctx.overlay.isOpen()).toBe(false);
    expect(app.mode).toBe('play');
    expect(onClose).toHaveBeenCalledTimes(1);

    const h2 = host.ctx.xr.panel.open({ title: 'U', onClose });
    expect(app.mode).toBe('overlay');
    h2.close();
    expect(host.ctx.overlay.isOpen()).toBe(false);
    expect(app.mode).toBe('play');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('Event xr wird zugestellt; ctx.xr.exitThen/toast/jumpTo delegieren', async () => {
    const xr = fakeXr();
    const host = new ModuleHost(fakeApp(xr));
    const fn = vi.fn();
    host.ctx.on('xr', fn);
    host.emit('xr', true);
    expect(fn).toHaveBeenCalledWith(true);
    host.ctx.xr.toast('a', 100);
    expect(xr.toast).toHaveBeenCalledWith('a', 100);
    host.ctx.xr.exitThen('l', () => {});
    expect(xr.exitThen).toHaveBeenCalled();
    await expect(host.ctx.xr.jumpTo(1, 2)).resolves.toBe(true);
  });
});
