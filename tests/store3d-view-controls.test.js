// @vitest-environment jsdom
// Bedien-Nähte der Außenansicht (1.17.0): Knopf „Ansicht“ (HUD, Gamepad, GameTouch), Loslass-Rückrufe (Desktop, GameTouch), hands.setHeld.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerspectiveCamera } from 'three';
import { DesktopControls } from '../src/js/store3d/controls/desktop.js';
import { GameTouch } from '../src/js/store3d/controls/gametouch.js';
import { createGamepad } from '../src/js/store3d/ui/gamepad.js';
import { createHud } from '../src/js/store3d/ui/hud.js';
import { createHands } from '../src/js/store3d/ui/hands.js';

describe('Desktop: V und Loslass-Rückrufe', () => {
  let canvas; let lockEl; let mode; let ctl; let ctx;
  const key = (code, type = 'keydown') => { const e = new KeyboardEvent(type, { code, bubbles: true, cancelable: true }); window.dispatchEvent(e); return e; };
  beforeEach(() => {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    lockEl = canvas; mode = 'play';
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockEl });
    document.exitPointerLock = vi.fn();
    canvas.requestPointerLock = vi.fn();
    ctx = {
      canvas, player: { look: vi.fn() }, getMode: () => mode, onLockLost: vi.fn(), onLockChange: vi.fn(), onTake: vi.fn(), onEscape: vi.fn(),
      onZoom: vi.fn(), getZoom: () => 1, onJump: vi.fn(), onHit: vi.fn(), onThrow: vi.fn(), onView: vi.fn(),
      onHitUp: vi.fn(), onViewUp: vi.fn(), onTakeUp: vi.fn(),
    };
    ctl = new DesktopControls(ctx);
    ctl.attach();
  });
  afterEach(() => { ctl.detach(); delete document.pointerLockElement; canvas.remove(); });

  it('V ruft onView, keyup ruft onViewUp (nur einmal pro Druck)', () => {
    key('KeyV');
    expect(ctx.onView).toHaveBeenCalledTimes(1);
    expect(ctx.onViewUp).not.toHaveBeenCalled();
    key('KeyV', 'keyup');
    expect(ctx.onViewUp).toHaveBeenCalledTimes(1);
    key('KeyV', 'keyup');
    expect(ctx.onViewUp).toHaveBeenCalledTimes(1);
  });
  it('Loslassen zählt auch, wenn inzwischen ein anderer Modus aktiv ist; blur und detach lösen gehaltene Aktionen', () => {
    key('KeyF');
    mode = 'paused';
    key('KeyF', 'keyup');
    expect(ctx.onHitUp).toHaveBeenCalledTimes(1);
    mode = 'play';
    key('KeyF');
    window.dispatchEvent(new Event('blur'));
    expect(ctx.onHitUp).toHaveBeenCalledTimes(2);
    key('KeyV');
    ctl.detach();
    expect(ctx.onViewUp).toHaveBeenCalledTimes(1);
  });
  it('Maus: Loslassen der linken Taste ruft onTakeUp; ohne Rückruf passiert nichts', () => {
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    expect(ctx.onTake).toHaveBeenCalledWith('click');
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    expect(ctx.onTakeUp).toHaveBeenCalledTimes(1);
    delete ctx.onTakeUp;
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    expect(() => window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }))).not.toThrow();
  });
  it('ohne Loslass-Rückrufe im ctx unverändertes Verhalten', () => {
    delete ctx.onHitUp; delete ctx.onViewUp;
    key('KeyF'); key('KeyF', 'keyup'); key('KeyV'); key('KeyV', 'keyup');
    expect(ctx.onHit).toHaveBeenCalledTimes(1);
    expect(ctx.onView).toHaveBeenCalledTimes(1);
  });
});

describe('HUD-Knopf Ansicht', () => {
  it('nur mit onView; Klick ruft ihn; im Schema game bleibt er aus', () => {
    const host = document.createElement('div');
    const a = createHud(host, { touch: false });
    expect(host.querySelector('.lfx-store-viewbtn')).toBeNull();
    a.destroy();
    const onView = vi.fn();
    let scheme = 'touch';
    const h = createHud(host, { touch: true, onView, getTouchScheme: () => scheme });
    const b = host.querySelector('.lfx-store-viewbtn');
    expect(b.hidden).toBe(true);
    h.showViewBtn(true);
    expect(b.hidden).toBe(false);
    b.click();
    expect(onView).toHaveBeenCalledTimes(1);
    scheme = 'game';
    h.showViewBtn(true);
    expect(b.hidden).toBe(true);
    h.destroy();
  });
});

describe('GameTouch: Knopf Ansicht und Zusatzknopf', () => {
  let host; let pad; let gt; let cbs;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    pad = createGamepad(host);
    cbs = { look: vi.fn(), onTap: vi.fn(), onZoom: vi.fn(), onView: vi.fn(), onViewUp: vi.fn(), onAux: vi.fn(), onAuxUp: vi.fn(), onJump: vi.fn(), onJumpUp: vi.fn() };
    gt = new GameTouch(cbs);
    gt.attach(pad);
  });
  afterEach(() => { gt.detach(); pad.destroy(); host.remove(); });
  const el = (n) => pad.root.querySelector(`.lfx-store-gp-${n}`);

  it('Knöpfe view/aux sind standardmäßig versteckt und werden mit setViewShown/setAux sichtbar', () => {
    expect(el('view').hidden).toBe(true);
    expect(el('aux').hidden).toBe(true);
    pad.setViewShown(true);
    pad.setAux(true, 'X');
    expect(el('view').hidden).toBe(false);
    expect(el('aux').hidden).toBe(false);
    expect(el('aux').textContent).toBe('X');
    expect(pad.btnOf(el('view'))).toBe('view');
    expect(pad.btnOf(el('aux'))).toBe('aux');
  });
  it('Drücken ruft onView, Loslassen onViewUp; Aux analog; Sprung-Loslassen', () => {
    gt.start(1, 10, 10, el('view'));
    expect(cbs.onView).toHaveBeenCalledTimes(1);
    expect(cbs.onViewUp).not.toHaveBeenCalled();
    gt.end(1, false);
    expect(cbs.onViewUp).toHaveBeenCalledTimes(1);
    gt.start(2, 10, 10, el('aux'));
    gt.end(2, true); // Abbruch löst ebenfalls
    expect(cbs.onAux).toHaveBeenCalledTimes(1);
    expect(cbs.onAuxUp).toHaveBeenCalledTimes(1);
    gt.start(3, 10, 10, el('jump'));
    gt.end(3, false);
    expect(cbs.onJumpUp).toHaveBeenCalledTimes(1);
  });
  it('Gate off löst gehaltene Knöpfe (Loslass-Rückruf), Durchziehen ebenso', () => {
    gt.start(1, 10, 10, el('view'));
    gt.setGate('off', 'mode:paused');
    expect(cbs.onViewUp).toHaveBeenCalledTimes(1);
    gt.setGate('on', '');
    gt.start(2, 10, 10, el('aux'));
    gt.move(2, 80, 80); // weit gezogen → Finger wird zum Blick-Finger
    expect(cbs.onAuxUp).toHaveBeenCalledTimes(1);
  });
});

describe('hands.setHeld', () => {
  it('setHeld ersetzt setCarried; setCarried bleibt als Alias', () => {
    const cam = new PerspectiveCamera();
    const h = createHands(cam);
    expect(h.carrying).toBe(false);
    h.setHeld({ media: 'dvd' });
    expect(h.carrying).toBe(true);
    h.setHeld(null);
    expect(h.carrying).toBe(false);
    h.setCarried({ media: 'vhs' });
    expect(h.carrying).toBe(true);
    h.setCarried(null);
    expect(h.carrying).toBe(false);
    h.dispose();
  });
});
