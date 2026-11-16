// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoreApp } from '../src/js/store3d/store.js';
import { DesktopControls } from '../src/js/store3d/controls/desktop.js';
import { createFullscreen } from '../src/js/store3d/ui/fullscreen.js';
import tv from '../src/js/store3d/modules/tv.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const proto = StoreApp.prototype;
const fakeApp = (o = {}) => Object.assign(Object.create(proto), {
  suspended: false, disposed: false, mode: 'play', ready: true, host: document.body,
  syncUi: vi.fn(), fs: null, hud: { showPrompt: vi.fn() }, notifyState: vi.fn(),
  engine: { stop: vi.fn(), start: vi.fn(), resize: vi.fn() },
  desktop: { attach: vi.fn(), detach: vi.fn() }, touchCtl: { attach: vi.fn(), detach: vi.fn() },
  covers: { pause: vi.fn(), resume: vi.fn() }, mods: { hook: vi.fn() },
}, o);

describe('B066: Vormerkungen überleben Moduswechsel nicht', () => {
  it('setMode weg von play löscht pendingTake/pendingUse', () => {
    const a = fakeApp({ pendingTake: { id: 'x', at: 1 }, pendingUse: { ia: {}, at: 1 } });
    a.setMode('paused');
    expect(a.pendingTake).toBeNull();
    expect(a.pendingUse).toBeNull();
  });
  it('suspend löscht sie ebenfalls', () => {
    const a = fakeApp({ pendingTake: { id: 'x', at: 1 }, pendingUse: { ia: {}, at: 1 } });
    a.suspend();
    expect(a.pendingTake).toBeNull();
    expect(a.pendingUse).toBeNull();
  });
});

describe('A104: Aufräumfolge auch aus boot() nutzbar', () => {
  it('pauseParts hält Engine, Steuerung, Cover und Module an', () => {
    const a = fakeApp();
    expect(typeof a.pauseParts).toBe('function');
    a.pauseParts();
    expect(a.engine.stop).toHaveBeenCalled();
    expect(a.desktop.detach).toHaveBeenCalled();
    expect(a.touchCtl.detach).toHaveBeenCalled();
    expect(a.covers.pause).toHaveBeenCalled();
    expect(a.mods.hook).toHaveBeenCalledWith('onSuspend');
  });
});

describe('A103: resume während des Boots', () => {
  it('startet weder Schleife noch Steuerung, solange der Modus boot ist', () => {
    const a = fakeApp({ mode: 'boot', ready: false, player: {}, suspended: true });
    a.resume();
    expect(a.suspended).toBe(false);
    expect(a.engine.start).not.toHaveBeenCalled();
    expect(a.desktop.attach).not.toHaveBeenCalled();
    expect(a.touchCtl.attach).not.toHaveBeenCalled();
  });
});

describe('B061: später erteilter Pointer-Lock außerhalb von play', () => {
  let canvas; let lockEl; let mode; let ctl;
  beforeEach(() => {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    lockEl = null; mode = 'overlay';
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockEl });
    document.exitPointerLock = vi.fn();
    canvas.requestPointerLock = vi.fn();
    ctl = new DesktopControls({ canvas, player: { look: vi.fn() }, getMode: () => mode, onLockLost: vi.fn(), onLockChange: vi.fn(), onTake: vi.fn(), onEscape: vi.fn(), onZoom: vi.fn(), getZoom: () => 1 });
    ctl.attach();
  });
  afterEach(() => { ctl.detach(); delete document.pointerLockElement; canvas.remove(); });
  it('Lock im Modus overlay wird sofort wieder freigegeben', () => {
    lockEl = canvas;
    document.dispatchEvent(new Event('pointerlockchange'));
    expect(document.exitPointerLock).toHaveBeenCalledTimes(1);
  });
  it('Lock im Modus play bleibt bestehen', () => {
    mode = 'play';
    lockEl = canvas;
    document.dispatchEvent(new Event('pointerlockchange'));
    expect(document.exitPointerLock).not.toHaveBeenCalled();
  });
});

describe('A126/A122: iPhone-Vollbildanleitung', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const mk = () => {
    const win = new EventTarget();
    Object.assign(win, { navigator: { userAgent: IPHONE, maxTouchPoints: 5, standalone: false }, innerWidth: 844, innerHeight: 300, scrollY: 0, screen: { width: 390, height: 844 }, scrollTo: vi.fn(), matchMedia: () => ({ matches: false }) });
    return createFullscreen({ host: document.body, isTouch: true, getMode: () => 'play', userId: 'u', win, doc: document });
  };
  beforeEach(() => { document.body.innerHTML = ''; });
  it('Schließen gibt den Fokus an den vorherigen Knopf zurück', () => {
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    btn.focus();
    const fs = mk();
    fs.showGuide();
    expect(document.activeElement).not.toBe(btn);
    fs.hideGuide();
    expect(document.activeElement).toBe(btn);
    fs.destroy();
  });
  it('suspend entfernt Anleitung und Escape-Listener', () => {
    const fs = mk();
    fs.showGuide();
    fs.suspend();
    expect(document.querySelector('.lfx-store-fs-guide')).toBeNull();
    const e = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true });
    const spy = vi.spyOn(e, 'stopPropagation');
    document.dispatchEvent(e);
    expect(spy).not.toHaveBeenCalled();
    fs.destroy();
  });
});

function fake2d() {
  const g = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: () => ({ width: 10 }),
  };
  return new Proxy(g, { get: (t, k) => (k in t ? t[k] : (k === 'canvas' ? null : () => {})), set: () => true });
}
function tvSetup(deps) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fake2d());
  let overlay = null;
  const ia = [];
  const els = [];
  const ctx = {
    layout: { zones: { tv: { rect: { x0: 0, z0: 0, x1: 6, z1: 6 } } }, adultRoom: null },
    scene: { add() {} }, track: (o) => o, addCollider: (r) => r, removeCollider: () => {},
    addInteractable: (o) => { ia.push(o); return () => {}; },
    catalog: { items: new Map(), highlights: ['a', 'b', 'c', 'd'].map((i) => ({ Id: i, Name: i, BackdropImageTags: ['t'] })) },
    deps: { imageUrl: () => 'blob:x', play() {}, toast() {}, ...deps },
    quality: () => 'mid', provide: () => () => {}, use: () => null,
    camera: { fov: 70, aspect: 1.7, matrixWorld: { elements: new Array(16).fill(0) } },
    player: {
      getPose: () => ({ x: 1, z: 2, yaw: 0.5, pitch: 0 }), freeze() {}, teleport() {},
      camera: { flyTo: vi.fn(() => Promise.resolve(false)), release: vi.fn() },
    },
    overlay: {
      open: vi.fn((el, o) => { els.push(el); overlay = o; }), isOpen: () => !!overlay,
      close: () => { const o = overlay; overlay = null; if (o && o.onClose) o.onClose(); },
    },
    xr: { presenting: () => false },
    on: () => () => {},
  };
  return { ctx, ia, els };
}

describe('A110: TV-Trailersuche stoppt nach onSuspend', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it('keine weiteren getItem-Aufrufe nach suspend', async () => {
    let release;
    const getItem = vi.fn((id) => (getItem.mock.calls.length === 1 ? new Promise((r) => { release = () => r({ Id: id, LocalTrailerCount: 0 }); }) : Promise.resolve({ Id: id, LocalTrailerCount: 0 })));
    const S = tvSetup({ getItem, loadTrailer: vi.fn(() => Promise.resolve(null)) });
    const h = tv.init(S.ctx);
    S.ia.find((i) => i.label === 'Sofa').onUse();
    await tick();
    expect(getItem).toHaveBeenCalledTimes(1);
    h.onSuspend();
    release();
    await tick(); await tick();
    expect(getItem).toHaveBeenCalledTimes(1);
    h.dispose();
  });
});

describe('A113: Lautstärke wird angesagt', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it('role=status in der Couch-Leiste zeigt die Lautstärke', async () => {
    const S = tvSetup({});
    const h = tv.init(S.ctx);
    S.ia.find((i) => i.label === 'Sofa').onUse();
    await tick();
    const root = S.els[0];
    const status = root.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    const up = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Lauter');
    up.click();
    expect(status.textContent).toMatch(/^Lautstärke \d+ %$/);
    h.dispose();
  });
});
