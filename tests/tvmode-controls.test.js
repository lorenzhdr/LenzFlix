// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createControls } from '../src/js/live/tvmode/controls.js';

const snap = (o = {}) => ({ on: true, muted: false, volume: 50, ...o });

function setup({ ctlOver = {}, opts = {} } = {}) {
  const ctl = {
    volumeSupported: true,
    setVolume: vi.fn(),
    toggleMute: vi.fn(),
    zap: vi.fn(),
    tracks: vi.fn(() => ({ audio: [{ index: 0, label: 'A' }], subs: [], audioIndex: 0, subtitleIndex: -1 })),
    setAudio: vi.fn(),
    setSubtitle: vi.fn(),
    ...ctlOver,
  };
  const pip = { supported: vi.fn(() => true), active: vi.fn(() => false), toggle: vi.fn(), exit: vi.fn(), on: vi.fn(() => () => {}) };
  const fullscreen = { toggle: vi.fn(), active: vi.fn(() => false) };
  const c = createControls({ doc: document, ctl, opts: { pip, fullscreen, ...opts } });
  document.body.appendChild(c.el);
  document.body.appendChild(c.menu.el);
  return { ctl, pip, fullscreen, c };
}
const q = (c, s) => c.el.querySelector(s);

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('controls', () => {
  it('Lautstärke-Regler ruft setVolume (0–100, Schritt 5)', () => {
    const { ctl, c } = setup();
    c.update(snap());
    const r = q(c, '.lfx-tvm__range');
    expect(r.min).toBe('0');
    expect(r.max).toBe('100');
    expect(r.step).toBe('5');
    expect(r.value).toBe('50');
    r.value = '75';
    r.dispatchEvent(new Event('input', { bubbles: true }));
    expect(ctl.setVolume).toHaveBeenCalledWith(75);
    expect(r.getAttribute('aria-label')).toBe('Lautstärke');
  });

  it('Stumm-Knopf ruft toggleMute und wechselt Beschriftung', () => {
    const { ctl, c } = setup();
    c.update(snap());
    const b = q(c, '.lfx-tvm__btn--mute');
    expect(b.getAttribute('aria-label')).toBe('Ton aus');
    b.click();
    expect(ctl.toggleMute).toHaveBeenCalled();
    c.update(snap({ muted: true }));
    expect(b.getAttribute('aria-label')).toBe('Ton an');
    expect(q(c, '.lfx-tvm__range').value).toBe('0');
  });

  it('ohne Lautstärke-Unterstützung (iOS) nur der Stumm-Knopf', () => {
    const { c } = setup({ ctlOver: { volumeSupported: false } });
    c.update(snap());
    expect(q(c, '.lfx-tvm__range')).toBeNull();
    expect(q(c, '.lfx-tvm__volume')).toBeNull();
    expect(q(c, '.lfx-tvm__btn--mute')).not.toBeNull();
  });

  it('Bild-in-Bild-Knopf nur wenn unterstützt', () => {
    const a = setup();
    a.c.update(snap());
    expect(q(a.c, '.lfx-tvm__btn--pip').hidden).toBe(false);
    q(a.c, '.lfx-tvm__btn--pip').click();
    expect(a.pip.toggle).toHaveBeenCalled();
    document.body.innerHTML = '';
    const b = setup();
    b.pip.supported.mockReturnValue(false);
    b.c.update(snap());
    expect(q(b.c, '.lfx-tvm__btn--pip').hidden).toBe(true);
  });

  it('Ton/UT-Knopf nur bei mehr als einer Tonspur oder Untertiteln, öffnet das Menü', () => {
    const a = setup();
    a.c.update(snap());
    expect(q(a.c, '.lfx-tvm__btn--tracks').hidden).toBe(true);
    a.ctl.tracks.mockReturnValue({ audio: [{ index: 0, label: 'A' }, { index: 1, label: 'B' }], subs: [], audioIndex: 0, subtitleIndex: -1 });
    a.c.update(snap());
    const b = q(a.c, '.lfx-tvm__btn--tracks');
    expect(b.hidden).toBe(false);
    expect(b.getAttribute('aria-label')).toBe('Ton und Untertitel');
    b.click();
    expect(a.c.isMenuOpen()).toBe(true);
    b.click();
    expect(a.c.isMenuOpen()).toBe(false);
    a.ctl.tracks.mockReturnValue({ audio: [{ index: 0, label: 'A' }], subs: [{ index: 3, label: 'UT' }], audioIndex: 0, subtitleIndex: -1 });
    a.c.update(snap());
    expect(b.hidden).toBe(false);
  });

  it('Vollbild-Knopf und Sender-Pfeile', () => {
    const { ctl, fullscreen, c } = setup();
    c.update(snap());
    const fs = q(c, '.lfx-tvm__btn--fullscreen');
    expect(fs.getAttribute('aria-label')).toBe('Vollbild');
    fs.click();
    expect(fullscreen.toggle).toHaveBeenCalled();
    fullscreen.active.mockReturnValue(true);
    c.update(snap());
    expect(fs.title).toBe('Vollbild beenden');
    q(c, '.lfx-tvm__btn--zap-up').click();
    q(c, '.lfx-tvm__btn--zap-down').click();
    expect(ctl.zap).toHaveBeenNthCalledWith(1, 1);
    expect(ctl.zap).toHaveBeenNthCalledWith(2, -1);
    expect(q(c, '.lfx-tvm__btn--zap-up').getAttribute('aria-label')).toBe('Nächster Sender');
    expect(q(c, '.lfx-tvm__btn--zap-down').title).toBe('Vorheriger Sender');
  });

  it('destroy entfernt DOM und Listener', () => {
    const { pip, c } = setup();
    const off = vi.fn();
    pip.on.mockReturnValue(off);
    const c2 = createControls({ doc: document, ctl: { volumeSupported: true, tracks: () => ({}) }, opts: { pip } });
    c2.destroy();
    expect(off).toHaveBeenCalled();
    c.update(snap());
    c.destroy();
    expect(c.el.isConnected).toBe(false);
    expect(c.menu.el.isConnected).toBe(false);
  });
});
