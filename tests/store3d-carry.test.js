// VIDEOTHEK LENZ: Tragen (Mitnehmen aus dem Halte-Bild): carry/drop/openCarried, Ereignis 'carry', Randfälle.
import { describe, it, expect, vi } from 'vitest';
import { PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { StoreApp } from '../src/js/store3d/store.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';

const SLOT = { fv: { id: 'fv' }, info: { id: 'slot' } };

/** StoreApp ohne Konstruktor (kein WebGL), Halte-Bild als Stub, der onClosed wie das echte HoldView meldet. */
function make({ slot = SLOT, items = { a: { Id: 'a', lfx: { media: 'vhs' } }, b: { Id: 'b' } } } = {}) {
  const emitted = [];
  const mods = { locked: false, emit: vi.fn((...a) => emitted.push(a)), interactables: [], action: vi.fn(() => false) };
  const hv = {
    isOpen: false, itemId: null,
    open: vi.fn((id) => { hv.isOpen = true; hv.itemId = id; }),
    close: vi.fn(() => { hv.isOpen = false; hv.itemId = null; app.onHoldClosed(); }),
    releaseForCarry: vi.fn(() => { const r = { slot: hv.slotHeld, art: { w: 1 } }; hv.isOpen = false; hv.itemId = null; app.onHoldClosed(); return r; }),
    slotHeld: null,
  };
  const app = Object.assign(Object.create(StoreApp.prototype), {
    mode: 'play', disposed: false, xr: null, aim: null, carried: null, carryingOut: false, heldId: null, takingNext: false, pendingTake: null,
    items: new Map(Object.entries(items)),
    mods, holdview: hv,
    hands: { setCarried: vi.fn() },
    touchCtl: { setCarrying: vi.fn() },
    shelves: { setHidden: vi.fn() },
    player: { cancelPath: vi.fn() },
    desktop: { releaseLock: vi.fn(), requestLock: vi.fn() },
    suspended: false,
    findSlot: vi.fn(() => slot),
    setMode: vi.fn(function setMode(m) { this.mode = m; }),
    clearAim: vi.fn(),
    notifyState: vi.fn(),
  });
  return { app, hv, mods, emitted };
}
const events = (emitted, name) => emitted.filter((e) => e[0] === name).map((e) => e[1]);

describe('Tragen', () => {
  it('carry aus dem Regal: Fach bleibt leer, Hülle in der Hand, Ereignis carry, Touch-Knopf Werfen', () => {
    const { app, emitted } = make();
    expect(app.carry('a')).toBe(true);
    expect(app.shelves.setHidden).toHaveBeenCalledWith(SLOT.fv, SLOT.info, true);
    expect(app.getCarried()).toEqual({ id: 'a', item: app.items.get('a') });
    expect(app.hands.setCarried).toHaveBeenLastCalledWith({ media: 'vhs', art: null });
    expect(app.touchCtl.setCarrying).toHaveBeenLastCalledWith(true);
    expect(events(emitted, 'carry')).toEqual([{ id: 'a' }]);
    expect(app.carry('a')).toBe(true); // schon getragen
    expect(events(emitted, 'carry').length).toBe(1);
  });

  it('Mitnehmen aus dem Halte-Bild: Spielmodus, kein put, Fach bleibt leer, Sperre aufgehoben', () => {
    const { app, hv, emitted } = make();
    hv.isOpen = true; hv.itemId = 'a'; hv.slotHeld = SLOT;
    app.heldId = 'a';
    app.mode = 'hold';
    expect(app.carry('a')).toBe(true);
    expect(hv.releaseForCarry).toHaveBeenCalledTimes(1);
    expect(app.mode).toBe('play');
    expect(app.heldId).toBe(null);
    expect(events(emitted, 'put')).toEqual([]);
    expect(app.shelves.setHidden).not.toHaveBeenCalledWith(SLOT.fv, SLOT.info, false);
    expect(app.carried.slot).toBe(SLOT);
    expect(app.carried.art).toEqual({ w: 1 });
    expect(app.carryingOut).toBe(false);
    expect(app.desktop.requestLock).toHaveBeenCalled();
  });

  it('drop: zurück ins Regal an den Ursprungsplatz, Ereignis { id: null }', () => {
    const { app, emitted } = make();
    app.carry('a');
    expect(app.drop()).toBe(true);
    expect(app.shelves.setHidden).toHaveBeenLastCalledWith(SLOT.fv, SLOT.info, false);
    expect(app.getCarried()).toBe(null);
    expect(app.hands.setCarried).toHaveBeenLastCalledWith(null);
    expect(app.touchCtl.setCarrying).toHaveBeenLastCalledWith(false);
    expect(events(emitted, 'carry')).toEqual([{ id: 'a' }, { id: null }]);
    expect(app.drop()).toBe(false);
  });

  it('drop bei Hülle ohne Regalplatz (von der Theke): nur aus der Hand, kein setHidden(false)', () => {
    const { app, hv, emitted } = make({ slot: null });
    hv.isOpen = true; hv.itemId = 'b'; hv.slotHeld = null;
    app.carry('b');
    app.shelves.setHidden.mockClear();
    expect(app.drop()).toBe(true);
    expect(app.shelves.setHidden).not.toHaveBeenCalled();
    expect(events(emitted, 'carry')).toEqual([{ id: 'b' }, { id: null }]);
  });

  it('Benutzen ohne Ziel öffnet die Hülle wieder; Zurückstellen legt sie ins Regal (kein put)', () => {
    const { app, hv, emitted } = make();
    app.carry('a');
    expect(app.openCarried()).toBe(true);
    expect(hv.open).toHaveBeenCalledWith('a', null, false);
    expect(app.mode).toBe('hold');
    expect(app.hands.setCarried).toHaveBeenLastCalledWith(null);
    expect(app.carried.reopened).toBe(true);
    hv.close(true); // „Zurückstellen“
    expect(app.getCarried()).toBe(null);
    expect(app.shelves.setHidden).toHaveBeenLastCalledWith(SLOT.fv, SLOT.info, false);
    expect(events(emitted, 'put')).toEqual([]);
    expect(events(emitted, 'carry')).toEqual([{ id: 'a' }, { id: null }]);
    expect(app.mode).toBe('play');
  });

  it('wieder geöffnet und erneut „Mitnehmen“: wieder in der Hand, Regalplatz bleibt der alte', () => {
    const { app, hv } = make();
    app.carry('a');
    app.openCarried();
    hv.slotHeld = null; // das echte HoldView kennt den Platz nicht (open(id, null))
    expect(app.carry('a')).toBe(true);
    expect(app.carried.reopened).toBe(false);
    expect(app.carried.slot).toBe(SLOT);
    expect(app.mode).toBe('play');
  });

  it('drop bei wieder geöffneter Hülle schließt das Halte-Bild und legt zurück', () => {
    const { app, hv } = make();
    app.carry('a');
    app.openCarried();
    expect(app.drop()).toBe(true);
    expect(hv.close).toHaveBeenCalledWith(false);
    expect(app.getCarried()).toBe(null);
  });

  it('take einer anderen Hülle: die getragene geht zuerst zurück ins Regal', () => {
    const { app, hv } = make();
    app.carry('a');
    app.shelves.setHidden.mockClear();
    app.take('b');
    expect(app.shelves.setHidden).toHaveBeenCalledWith(SLOT.fv, SLOT.info, false);
    expect(app.getCarried()).toBe(null);
    expect(hv.open).toHaveBeenCalledWith('b', expect.anything(), false);
  });

  it('take(id) der getragenen Hülle öffnet sie wieder (kein Doppel-Halten, kein put)', () => {
    const { app, hv, emitted } = make();
    app.carry('a');
    expect(app.take('a')).toBe(true);
    expect(hv.open).toHaveBeenCalledTimes(1);
    expect(hv.open).toHaveBeenCalledWith('a', null, false);
    expect(app.take('a')).toBe(true); // schon offen
    expect(hv.open).toHaveBeenCalledTimes(1);
    hv.close(true);
    expect(events(emitted, 'put')).toEqual([]);
    expect(app.getCarried()).toBe(null);
  });

  it('syncHeld: heldId des Spielers = getragene oder gehaltene Hülle', () => {
    const { app, hv } = make();
    app.player = { cancelPath: vi.fn(), heldId: null };
    app.syncHeld();
    expect(app.player.heldId).toBe(null);
    hv.isOpen = true; hv.itemId = 'b';
    app.syncHeld();
    expect(app.player.heldId).toBe('b');
    hv.isOpen = false; hv.itemId = null;
    app.carry('a');
    app.syncHeld();
    expect(app.player.heldId).toBe('a');
    app.drop();
    app.syncHeld();
    expect(app.player.heldId).toBe(null);
  });

  it('carry einer zweiten Hülle legt die erste zurück', () => {
    const { app } = make();
    app.carry('a');
    app.shelves.setHidden.mockClear();
    app.carry('b');
    expect(app.shelves.setHidden).toHaveBeenCalledWith(SLOT.fv, SLOT.info, false);
    expect(app.getCarried().id).toBe('b');
  });

  it('VR-Start legt die getragene Hülle zurück; carry in VR geht nicht; unbekannter Titel nicht', () => {
    const { app } = make();
    app.carry('a');
    app.onXrHold(true);
    expect(app.getCarried()).toBe(null);
    app.xr = { presenting: true };
    expect(app.carry('a')).toBe(false);
    app.xr = null;
    expect(app.carry('zzz')).toBe(false);
    expect(app.carry('')).toBe(false);
  });

  it('getState().heldId bleibt null beim Tragen (nicht in der sessionStorage-Wiederherstellung)', () => {
    const { app, hv } = make();
    app.player = { state: { x: 1, z: 2, yaw: 0, pitch: 0 }, cancelPath: vi.fn() };
    app.carry('a');
    app.holdview = { ...hv, itemId: null };
    expect(app.getState().heldId).toBe(null);
  });
});

describe('Tippen ins Leere (Schemata touch/joystick)', () => {
  const tapApp = (scheme) => {
    const { app, hv, mods } = make();
    const cam = new PerspectiveCamera();
    cam.updateMatrixWorld(true);
    Object.assign(app, {
      touchScheme: scheme, _d: new Vector3(), rc: new Raycaster(), hud: { note: vi.fn() },
      shelves: { setHidden: vi.fn(), faceViews: [] },
      engine: { camera: cam, canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }) } },
    });
    mods.flushNav = vi.fn();
    return { app, hv, mods };
  };
  it('use-Handler bekommen den Tipp (source touch)', () => {
    const { app, mods } = tapApp('touch');
    mods.action.mockImplementation(() => true);
    app.onTap(100, 100);
    expect(mods.action).toHaveBeenCalledWith('use', expect.objectContaining({ name: 'use', source: 'touch' }));
  });
  it('getragene Hülle: Tipp unten rechts öffnet sie, woanders nicht', () => {
    const { app, hv } = tapApp('joystick');
    app.carry('a');
    app.onTap(100, 100);
    expect(hv.open).not.toHaveBeenCalled();
    app.onTap(900, 500);
    expect(hv.open).toHaveBeenCalledWith('a', null, false);
  });
  it('Schema game: kein Tipp-Benutzen (dort gibt es den Knopf)', () => {
    const { app, mods } = tapApp('game');
    app.carry('a');
    app.onTap(900, 500);
    expect(mods.action).not.toHaveBeenCalled();
    expect(app.holdview.open).not.toHaveBeenCalled();
  });
});

describe('ctx.items: carried / carry / drop', () => {
  it('reicht an die App durch; ohne App-Unterstützung (Fakes) neutral', () => {
    const { app } = make();
    app.engine = { scene: {}, camera: {}, renderer: {}, preset: { level: 'mid' } };
    app.layout = { colliders: [], zones: {} };
    app.deps = { catalog: {} };
    app.opts = {};
    const h = new ModuleHost(app);
    const it = h.ctx.items;
    expect(it.carried()).toBe(null);
    expect(it.carry('a')).toBe(true);
    expect(it.carried()).toEqual({ id: 'a', item: app.items.get('a') });
    const seen = vi.fn();
    h.ctx.on('carry', seen);
    h.emit('carry', { id: 'x' });
    expect(seen).toHaveBeenCalledWith({ id: 'x' });
    expect(it.drop()).toBe(true);
    const fake = new ModuleHost({ engine: app.engine, layout: app.layout, deps: app.deps, opts: {} });
    expect(fake.ctx.items.carried()).toBe(null);
    expect(fake.ctx.items.carry('a')).toBe(false);
    expect(fake.ctx.items.drop()).toBe(false);
  });
});
