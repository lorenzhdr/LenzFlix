// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scene } from 'three';
import { PalastCinema } from '../src/js/store3d/cinema/palast.js';
import { buildStubSaal } from '../src/js/store3d/cinema/saal-stub.js';

const HINT = 'Für die ganze Leinwand: Handy drehen oder Vollbild.';

function setup({ touch, w, h }) {
  const toasts = [];
  let overlay = null;
  const ctx = {
    player: { getPose: () => ({ x: 5, z: 5, yaw: 0, pitch: 0 }), teleport: vi.fn(), freeze: vi.fn(), camera: { flyTo: vi.fn(() => Promise.resolve(true)), release: vi.fn() } },
    overlay: {
      open: vi.fn((el, o) => { overlay = { el, onClose: o.onClose }; document.body.appendChild(el); }),
      close: vi.fn(() => { const ov = overlay; overlay = null; if (ov) { ov.el.remove(); ov.onClose(); } }),
      isOpen: () => Boolean(overlay),
    },
    use: () => ({ duck: vi.fn() }),
    provide: vi.fn(),
  };
  const app = {
    engine: { setRenderEnabled: vi.fn(), scene: new Scene() }, player: { x: 5, z: 5 }, mods: { ctx },
    desktop: { attach: vi.fn(), detach: vi.fn() }, holdview: { close: vi.fn() }, xr: null, suspended: false, touch,
    deps: { toast: (t) => toasts.push(t) },
  };
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
  const cin = new PalastCinema(app);
  app.cinema2d = cin;
  const saal = buildStubSaal({ x: 5, z: 5, yaw: 0 });
  app.engine.scene.add(saal.root);
  cin.attachSaal(saal);
  return { cin, toasts };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('Palast: Hochformat-Hinweis beim Hinsetzen', () => {
  it('Touch + Hochformat: ein Hinweis je Hinsetzen', () => {
    const c = setup({ touch: true, w: 390, h: 844 });
    expect(c.cin.sit('stub')).toBe(true);
    expect(c.toasts.filter((t) => t === HINT)).toHaveLength(1);
    c.cin.stand();
    c.cin.sit('stub');
    expect(c.toasts.filter((t) => t === HINT)).toHaveLength(2);
    c.cin.dispose();
  });
  it('Platzwechsel im Sitzen: kein weiterer Hinweis', () => {
    const c = setup({ touch: true, w: 390, h: 844 });
    c.cin.sit('stub');
    c.cin.sit('stub');
    expect(c.toasts.filter((t) => t === HINT)).toHaveLength(1);
    c.cin.dispose();
  });
  it('Querformat oder Desktop: nie', () => {
    for (const o of [{ touch: true, w: 844, h: 390 }, { touch: false, w: 390, h: 844 }, { touch: false, w: 1280, h: 720 }]) {
      const c = setup(o);
      c.cin.sit('stub');
      expect(c.toasts).not.toContain(HINT);
      c.cin.dispose();
    }
  });
});
