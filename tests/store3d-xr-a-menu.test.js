// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { buildMenuSpec } from '../src/js/store3d/xr/menu.js';
import { XrMode } from '../src/js/store3d/xr/mode.js';

function fake(over = {}) {
  const app = {
    opts: { vr: { turn: 'snap', vignette: true, height: 'auto', quality: 'mid', seat: 'mid' } },
    sound: true,
    setSound: vi.fn(function (on) { this.sound = on; }),
    setQuality: vi.fn(),
    openTerminal: vi.fn(),
  };
  const mode = {
    app,
    diagOn: false,
    cinema: null,
    savePrefs: vi.fn(),
    refreshMenu: vi.fn(),
    closeMenu: vi.fn(),
    recenter: vi.fn(),
    toast: vi.fn(),
    exit: vi.fn(),
    setDiag: vi.fn(function (on) { this.diagOn = on; }),
    menuPanel: {},
    ...over,
  };
  return mode;
}
const row = (spec, label) => spec.list.rows.find((r) => r.label === label);

describe('xr/menu', () => {
  it('Spec: Titel, Einträge, Weiter und VR verlassen', () => {
    const spec = buildMenuSpec(fake());
    expect(spec.title).toBe('VR-Menü');
    expect(spec.list.rows.map((r) => r.label)).toEqual(['Ton', 'Drehen', 'Vignette', 'Größe', 'Neu ausrichten', 'Qualität', 'Kassen-PC-Suche', 'Diagnose']);
    expect(spec.buttons.map((b) => b.label)).toEqual(['Weiter', 'VR verlassen']);
    expect(typeof spec.onClose).toBe('function');
    expect(row(spec, 'Ton').tag).toBe('An');
    expect(row(spec, 'Drehen').tag).toBe('Ruck 45°');
    expect(row(spec, 'Größe').tag).toBe('Automatisch');
    expect(row(spec, 'Qualität').tag).toBe('Mittel');
  });

  it('Schalter schreiben app.opts.vr in place und sichern', () => {
    const m = fake();
    const same = m.app.opts.vr;
    row(buildMenuSpec(m), 'Drehen').onSelect();
    expect(m.app.opts.vr.turn).toBe('smooth');
    expect(m.app.opts.vr).toBe(same);
    row(buildMenuSpec(m), 'Vignette').onSelect();
    expect(m.app.opts.vr.vignette).toBe(false);
    row(buildMenuSpec(m), 'Vignette').onSelect();
    expect(m.app.opts.vr.vignette).toBe(true);
    row(buildMenuSpec(m), 'Größe').onSelect();
    expect(m.app.opts.vr.height).toBe('seated');
    expect(m.recenter).toHaveBeenCalled();
    row(buildMenuSpec(m), 'Qualität').onSelect();
    expect(m.app.opts.vr.quality).toBe('low');
    expect(m.app.setQuality).toHaveBeenCalledWith('low');
    expect(m.savePrefs.mock.calls.length).toBe(5);
    expect(m.refreshMenu).toHaveBeenCalled();
  });

  it('Ton, Neu ausrichten, Diagnose, Kassen-PC-Suche, Weiter, VR verlassen', () => {
    const m = fake();
    row(buildMenuSpec(m), 'Ton').onSelect();
    expect(m.app.setSound).toHaveBeenCalledWith(false);
    expect(m.savePrefs).toHaveBeenCalled();
    row(buildMenuSpec(m), 'Neu ausrichten').onSelect();
    expect(m.recenter).toHaveBeenCalled();
    row(buildMenuSpec(m), 'Diagnose').onSelect();
    expect(m.diagOn).toBe(true);
    expect(row(buildMenuSpec(m), 'Diagnose').tag).toBe('An');
    row(buildMenuSpec(m), 'Kassen-PC-Suche').onSelect();
    expect(m.app.openTerminal).toHaveBeenCalledWith('');
    const spec = buildMenuSpec(m);
    m.closeMenu.mockClear();
    spec.buttons[0].onSelect();
    expect(m.closeMenu).toHaveBeenCalledTimes(1);
    spec.buttons[1].onSelect();
    expect(m.exit).toHaveBeenCalled();
  });

  it('Kino-Zusatzeinträge erscheinen nur, wenn das Kino sie liefert', () => {
    const fn = vi.fn();
    const m = fake({ cinema: { menuItems: () => [{ label: 'Tonspur', onSelect: fn }] } });
    const spec = buildMenuSpec(m);
    expect(spec.list.rows.map((r) => r.label)).toContain('Tonspur');
    row(spec, 'Tonspur').onSelect();
    expect(fn).toHaveBeenCalled();
    expect(m.closeMenu).toHaveBeenCalled();
    expect(buildMenuSpec(fake({ cinema: {} })).list.rows.length).toBe(8);
  });

  it('XrMode.savePrefs hält die 2D-Qualität, auch wenn VR sie auf low/mid zwang', () => {
    let seen = null;
    const app = { qualitySetting: 'mid', savePrefs() { seen = this.qualitySetting; } };
    XrMode.prototype.savePrefs.call({ app, presenting: true, prevQuality: 'high' });
    expect(seen).toBe('high');
    expect(app.qualitySetting).toBe('mid');
  });
});
