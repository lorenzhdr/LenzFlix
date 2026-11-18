// @vitest-environment jsdom
// VIDEOTHEK LENZ 1.17.0 (Querverbindungen): noClick-Interaktion, Esc-feste Overlays, Ansicht-Wechsel (doView).
import { describe, it, expect, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { StoreApp } from '../src/js/store3d/store.js';

function stub(extra = {}) {
  const mods = { locked: false, interactables: [], action: vi.fn(() => false), emit: vi.fn() };
  const app = Object.assign(Object.create(StoreApp.prototype), {
    mode: 'play', disposed: false, xr: null, aim: null, carried: null,
    mods, take: vi.fn(), openCarried: vi.fn(),
    player: { y: 0, swing: vi.fn(), jump: vi.fn(() => true) },
    hands: { swing: vi.fn(), throwAnim: vi.fn() },
    engine: { camera: new PerspectiveCamera() },
    _d: new Vector3(),
    ...extra,
  });
  return { app, mods };
}

describe('addInteractable: noClick', () => {
  it('übernimmt noClick ins ia-Objekt (Standard false)', () => {
    const host = new ModuleHost({ layout: { colliders: [], zones: {} }, deps: {}, opts: {}, engine: { scene: {}, camera: new PerspectiveCamera(), renderer: {}, preset: { level: 'mid' } }, player: {} });
    host.ctx.addInteractable({ box: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, noClick: true });
    host.ctx.addInteractable({ box: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } });
    expect(host.interactables[0].noClick).toBe(true);
    expect(host.interactables[1].noClick).toBe(false);
  });
  it('Klick läuft weiter (doHit), E ruft onUse', () => {
    const ia = { onUse: vi.fn(), anyHeight: true, noClick: true };
    const { app, mods } = stub({ aim: { ia } });
    app.doUse('click');
    expect(ia.onUse).not.toHaveBeenCalled();
    expect(mods.action.mock.calls.map((c) => c[0])).toEqual(['use', 'hit']);
    expect(app.doUse('key')).toBe(true);
    expect(ia.onUse).toHaveBeenCalledTimes(1);
  });
});

describe('overlayOpen: Esc-fest', () => {
  const mk = () => {
    const host = document.createElement('div');
    const app = { mode: 'play', host, desktop: null, suspended: false, holdview: { isOpen: false }, player: { cancelPath: vi.fn() }, setMode: vi.fn((m) => { app.mode = m; }), xr: null };
    const h = Object.assign(Object.create(ModuleHost.prototype), { app, overlayState: null, xrOn: () => false });
    return { h, app };
  };
  it('Standard: escape true; modal oder escape:false: escape false', () => {
    const { h } = mk();
    h.overlayOpen(document.createElement('div'), {});
    expect(h.overlayState.escape).toBe(true);
    h.overlayOpen(document.createElement('div'), { modal: true });
    expect(h.overlayState.escape).toBe(false);
    h.overlayOpen(document.createElement('div'), { escape: false });
    expect(h.overlayState.escape).toBe(false);
  });
});

describe('StoreApp.doView', () => {
  it('schaltet selfview nur im Laufmodus um', () => {
    const toggle = vi.fn();
    const { app, mods } = stub();
    mods.ctx = { use: (n) => (n === 'selfview' ? { toggle } : undefined) };
    expect(app.doView()).toBe(true);
    expect(toggle).toHaveBeenCalledTimes(1);
    app.mode = 'paused';
    expect(app.doView()).toBe(false);
    expect(toggle).toHaveBeenCalledTimes(1);
  });
  it('ohne Modul: false', () => {
    const { app } = stub();
    expect(app.doView()).toBe(false);
  });
});
