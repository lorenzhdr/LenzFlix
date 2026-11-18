// @vitest-environment jsdom
// 1.18.0 Welle 6: Waffen-Eingabe – Touch-Waffenknopf (controls/touch.js → ui/gamepad.js 'aux'), onHitUp-Weiterleitung und store.js (doHit/Nähte).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { TouchControls } from '../src/js/store3d/controls/touch.js';
import { StoreApp } from '../src/js/store3d/store.js';

describe('Touch: Waffenknopf', () => {
  let host; let tc; let root; let ctx;
  const W = 1000; const H = 500;
  const touchEv = (type, touches, changed, target) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    const mk = (o) => ({ identifier: o.id, clientX: o.x, clientY: o.y, target: o.target || root });
    e.touches = touches.map(mk);
    e.changedTouches = changed.map(mk);
    (target || root).dispatchEvent(e);
  };
  beforeEach(() => {
    document.body.innerHTML = '';
    window.innerWidth = W; window.innerHeight = H;
    host = document.createElement('div');
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    document.body.appendChild(host);
    canvas.setPointerCapture = () => {};
    ctx = {
      canvas, player: { look: vi.fn() }, getMode: () => 'play', now: () => 1000, getTune: () => ({ touchRegrip: 'off' }), getZoom: () => 1,
      onTap: vi.fn(), onJump: vi.fn(), onUse: vi.fn(), onHit: vi.fn(), onHitUp: vi.fn(), onThrow: vi.fn(), onZoom: vi.fn(), onAux: vi.fn(), onAuxUp: vi.fn(),
    };
    tc = new TouchControls({ ...ctx, scheme: 'game' });
    tc.attach();
    root = host.querySelector('.lfx-store-gp');
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H });
  });
  afterEach(() => { tc.detach(); });

  it('mit onAux ist der Knopf sichtbar und beschriftet, ohne bleibt er versteckt', () => {
    const aux = root.querySelector('.lfx-store-gp-aux');
    expect(aux.hidden).toBe(false);
    expect(aux.textContent).toBe('WAFFE');
    tc.detach();
    document.body.innerHTML = '';
    const c2 = document.createElement('canvas');
    document.body.appendChild(c2);
    const t2 = new TouchControls({ ...ctx, canvas: c2, onAux: undefined, scheme: 'game' });
    t2.attach();
    expect(document.querySelector('.lfx-store-gp-aux').hidden).toBe(true);
    t2.detach();
    tc.attach();
  });

  it('Drücken ruft onAux, Loslassen onAuxUp; Schlagen-Knopf liefert onHit/onHitUp', () => {
    const aux = root.querySelector('.lfx-store-gp-aux');
    touchEv('touchstart', [{ id: 1, x: 900, y: 400, target: aux }], [{ id: 1, x: 900, y: 400, target: aux }], aux);
    expect(ctx.onAux).toHaveBeenCalledTimes(1);
    expect(ctx.onAuxUp).not.toHaveBeenCalled();
    touchEv('touchend', [], [{ id: 1, x: 900, y: 400, target: aux }], aux);
    expect(ctx.onAuxUp).toHaveBeenCalledTimes(1);
    const hit = root.querySelector('.lfx-store-gp-hit');
    touchEv('touchstart', [{ id: 2, x: 800, y: 400, target: hit }], [{ id: 2, x: 800, y: 400, target: hit }], hit);
    expect(ctx.onHit).toHaveBeenCalledTimes(1);
    touchEv('touchend', [], [{ id: 2, x: 800, y: 400, target: hit }], hit);
    expect(ctx.onHitUp).toHaveBeenCalledTimes(1);
  });
});

function appStub(fightProv, extra = {}) {
  const mods = { locked: false, interactables: [], action: vi.fn(() => false), emit: vi.fn(), ctx: { use: (n) => (n === 'fight' ? fightProv : undefined) } };
  const app = Object.assign(Object.create(StoreApp.prototype), {
    mode: 'play', disposed: false, xr: null, aim: null, carried: null, mods, take: vi.fn(), openCarried: vi.fn(),
    player: { y: 0, swing: vi.fn(), jump: vi.fn(() => true) }, hands: { swing: vi.fn(), throwAnim: vi.fn() },
    engine: { camera: new PerspectiveCamera() }, _d: new Vector3(), ...extra,
  });
  return { app, mods };
}

describe('store.js: Waffen-Nähte', () => {
  it('actionEvent trägt Waffe, Reichweite und Trefferzahl; Laser zählt wie die Hand', () => {
    let w = 'belt';
    const { app } = appStub({ weapon: () => w });
    expect(app.actionEvent('hit', 'key')).toMatchObject({ weapon: 'belt', range: 2.2, max: 1 });
    w = 'whip';
    expect(app.actionEvent('hit', 'key')).toMatchObject({ weapon: 'whip', range: 3.5, max: 2 });
    w = 'laser';
    expect(app.actionEvent('hit', 'key')).toMatchObject({ weapon: 'hand', range: 1.6, max: 1 });
  });
  it('doHit: Gürtel schwingt mit Waffe, meldet swung und dispatcht hit mit ev.range', () => {
    const f = { weapon: () => 'belt', swingOk: vi.fn(() => true), swung: vi.fn(), laser: vi.fn() };
    const { app, mods } = appStub(f);
    app.doHit('key');
    expect(app.hands.swing).toHaveBeenCalledWith('belt');
    expect(f.swung).toHaveBeenCalledTimes(1);
    expect(mods.action).toHaveBeenCalledWith('hit', expect.objectContaining({ weapon: 'belt', range: 2.2 }));
  });
  it('doHit in der Abklingzeit: kein Schwung, kein Handler', () => {
    const f = { weapon: () => 'whip', swingOk: () => false, swung: vi.fn() };
    const { app, mods } = appStub(f);
    expect(app.doHit('key')).toBe(false);
    expect(app.player.swing).not.toHaveBeenCalled();
    expect(mods.action).not.toHaveBeenCalled();
  });
  it('doHit mit Laser: Strahl an, nie ein hit-Ereignis und kein Schwung; onHitUp schaltet aus', () => {
    const f = { weapon: () => 'laser', laser: vi.fn(() => true) };
    const { app, mods } = appStub(f);
    expect(app.doHit('key')).toBe(true);
    expect(f.laser).toHaveBeenCalledWith(true);
    expect(mods.action).not.toHaveBeenCalled();
    expect(app.player.swing).not.toHaveBeenCalled();
    app.onHitUp();
    expect(f.laser).toHaveBeenLastCalledWith(false);
  });
  it('ohne fight-Provider bleibt alles wie 1.17 (Hand)', () => {
    const { app, mods } = appStub(undefined);
    app.doHit('key');
    expect(app.hands.swing).toHaveBeenCalledWith('hand');
    expect(mods.action).toHaveBeenCalledWith('hit', expect.objectContaining({ weapon: 'hand', range: 1.6, max: 1 }));
  });
  it('Rad, Direktwahl, Mausrad und Waffenknopf nur im Laufmodus', () => {
    const f = { wheel: vi.fn(() => true), setWeapon: vi.fn(), cycle: vi.fn(() => true), auxDown: vi.fn(), auxUp: vi.fn() };
    const { app } = appStub(f);
    expect(app.onWeaponWheel(true)).toBe(true);
    expect(app.onWeaponPick(3)).toBe(true);
    expect(f.setWeapon).toHaveBeenCalledWith('whip');
    expect(app.onWeaponPick(9)).toBe(false);
    expect(app.onWeaponCycle(-1)).toBe(true);
    expect(f.cycle).toHaveBeenCalledWith(-1);
    app.onAux();
    expect(f.auxDown).toHaveBeenCalledTimes(1);
    app.mode = 'paused';
    expect(app.onWeaponWheel(true)).toBe(false);
    expect(app.onWeaponWheel(false)).toBe(true); // Schließen geht immer
    expect(app.onWeaponPick(1)).toBe(false);
    expect(app.onWeaponCycle(1)).toBe(false);
    app.onAux();
    expect(f.auxDown).toHaveBeenCalledTimes(1);
    app.onAuxUp();
    expect(f.auxUp).toHaveBeenCalledTimes(1);
  });
});
