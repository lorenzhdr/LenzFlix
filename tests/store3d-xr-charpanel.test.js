// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { buildCharSpec, PARTS } from '../src/js/store3d/xr/charpanel.js';
import { layoutPanel } from '../src/js/store3d/xr/panel.js';
import { buildMenuSpec } from '../src/js/store3d/xr/menu.js';
import xrchar from '../src/js/store3d/modules/xrchar.js';
import { defaultCode } from '../src/js/store3d/char/look2.js';

function fakeAvatar(over = {}) {
  const code = defaultCode();
  const a = {
    code: () => code,
    slots: () => [code, null, code],
    active: () => 0,
    setSlot: vi.fn(),
    randomize: vi.fn(),
    setColor: vi.fn(),
    onChange: vi.fn(() => vi.fn()),
    ...over,
  };
  return a;
}
const btn = (spec, label) => spec.buttons.find((b) => b.label === label);

describe('xr/charpanel Spec', () => {
  it('Plätze: leere ausgegraut, aktiver markiert, Aufruf setSlot', () => {
    const a = fakeAvatar();
    const refresh = vi.fn();
    const spec = buildCharSpec(a, { part: 0 }, { refresh });
    expect(btn(spec, 'Platz 1').on).toBe(true);
    expect(btn(spec, 'Platz 2 (leer)').disabled).toBe(true);
    btn(spec, 'Platz 3').onSelect();
    expect(a.setSlot).toHaveBeenCalledWith(2);
    expect(refresh).toHaveBeenCalled();
  });

  it('Zufall und Fertig', () => {
    const a = fakeAvatar();
    const close = vi.fn();
    const spec = buildCharSpec(a, { part: 0 }, { close });
    btn(spec, 'Zufall').onSelect();
    expect(a.randomize).toHaveBeenCalled();
    btn(spec, 'Fertig').onSelect();
    expect(close).toHaveBeenCalled();
  });

  it('Farben: 16 Felder je Teil, richtiger Teil und Index', () => {
    const a = fakeAvatar();
    const state = { part: 0 };
    PARTS.forEach((p, i) => {
      state.part = i;
      const spec = buildCharSpec(a, state, {});
      expect(spec.tabs[i].on).toBe(true);
      const sw = spec.buttons.filter((b) => b.swatch);
      expect(sw).toHaveLength(16);
      sw[5].onSelect();
      expect(a.setColor).toHaveBeenLastCalledWith(p.part, 5);
    });
    expect(PARTS.map((p) => p.part)).toEqual(['hair', 'top', 'bottom', 'shoes', 'hat', 'bag']);
  });

  it('Reiter wechselt den Teil und fordert Neuzeichnen', () => {
    const state = { part: 0 };
    const refresh = vi.fn();
    const spec = buildCharSpec(fakeAvatar(), state, { refresh });
    spec.tabs[3].onSelect();
    expect(state.part).toBe(3);
    expect(refresh).toHaveBeenCalled();
  });

  it('Layout passt in die Panelhöhe, jedes Feld hat eine Trefferfläche', () => {
    const spec = buildCharSpec(fakeAvatar(), { part: 1 }, {});
    const L = layoutPanel(spec, 900);
    expect(L.height).toBeLessThan(1100);
    expect(L.hits.filter((h) => h.kind === 'button')).toHaveLength(spec.buttons.length - 1); // Platz 2 gesperrt
  });
});

function fakeCtx({ xr = true, avatar = fakeAvatar() } = {}) {
  const providers = new Map();
  const handle = { open: true, update: vi.fn(), close: vi.fn(function () { this.open = false; }) };
  const ctx = {
    xr: { presenting: () => xr, panel: { open: vi.fn(() => handle) } },
    use: (n) => (n === 'avatar' ? avatar : providers.get(n)),
    provide: (n, impl) => { providers.set(n, impl); return () => providers.delete(n); },
  };
  return { ctx, providers, handle };
}

describe('modules/xrchar', () => {
  it('ohne VR: false und kein Panel', () => {
    const { ctx, providers } = fakeCtx({ xr: false });
    xrchar.init(ctx);
    expect(providers.get('xrchar').open()).toBe(false);
    expect(ctx.xr.panel.open).not.toHaveBeenCalled();
  });

  it('in VR: öffnet Panel, zweiter Aufruf schließt, onChange zeichnet neu', () => {
    const avatar = fakeAvatar();
    const { ctx, providers, handle } = fakeCtx({ avatar });
    xrchar.init(ctx);
    const p = providers.get('xrchar');
    expect(p.open()).toBe(true);
    expect(ctx.xr.panel.open).toHaveBeenCalledTimes(1);
    const cb = avatar.onChange.mock.calls[0][0];
    cb();
    expect(handle.update).toHaveBeenCalled();
    expect(p.open()).toBe(true);
    expect(handle.close).toHaveBeenCalled();
  });

  it('ohne avatar-Provider: false; dispose entfernt den Provider', () => {
    const { ctx, providers } = fakeCtx({ avatar: null });
    const m = xrchar.init(ctx);
    expect(providers.get('xrchar').open()).toBe(false);
    m.dispose();
    expect(providers.has('xrchar')).toBe(false);
  });
});

describe('xr/menu Eintrag Figur', () => {
  const mk = (xrc, extra = {}) => ({
    app: { opts: { vr: {} }, sound: true, modUse: (n) => (n === 'xrchar' ? xrc : undefined) },
    savePrefs() {}, refreshMenu() {}, closeMenu: vi.fn(), recenter() {}, toast() {}, exit() {}, setDiag() {}, ...extra,
  });
  it('Eintrag ruft xrchar.open nach closeMenu', () => {
    const xrc = { open: vi.fn() };
    const m = mk(xrc);
    const row = buildMenuSpec(m).list.rows.find((r) => r.label === 'Figur');
    row.onSelect();
    expect(m.closeMenu).toHaveBeenCalled();
    expect(xrc.open).toHaveBeenCalled();
  });
  it('ohne Provider oder im Kino kein Eintrag', () => {
    expect(buildMenuSpec(mk(null)).list.rows.some((r) => r.label === 'Figur')).toBe(false);
    expect(buildMenuSpec(mk({ open() {} }, { inCinema: true })).list.rows.some((r) => r.label === 'Figur')).toBe(false);
  });
});
