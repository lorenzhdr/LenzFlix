// @vitest-environment jsdom
// TV-Bedienleiste: ein offenes Ton-/Untertitel-Menü schließt, wenn die Sendung wechselt.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createControls } from '../src/js/live/tvmode/controls.js';

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => vi.useRealTimers());

describe('tvmode controls', () => {
  it('ein offenes Ton-/Untertitel-Menü schließt, wenn die Sendung wechselt', () => {
    const tr = { audio: [{ index: 0, label: 'A' }, { index: 1, label: 'B' }], subs: [], audioIndex: 0, subtitleIndex: -1 };
    const ctl = { volumeSupported: true, setVolume: vi.fn(), toggleMute: vi.fn(), zap: vi.fn(), tracks: vi.fn(() => tr), setAudio: vi.fn(), setSubtitle: vi.fn() };
    const c = createControls({ doc: document, ctl, opts: { pip: { supported: () => true, active: () => false, toggle: vi.fn(), exit: vi.fn(), on: () => () => {} }, fullscreen: { toggle: vi.fn(), active: () => false } } });
    document.body.append(c.el, c.menu.el);
    const base = { on: true, muted: false, volume: 50 };
    const e1 = { start: 1, end: 2 };
    c.update({ ...base, entry: e1 });
    c.menu.open();
    expect(c.isMenuOpen()).toBe(true);
    c.update({ ...base, entry: e1 });
    expect(c.isMenuOpen()).toBe(true);
    c.update({ ...base, entry: { start: 2, end: 3 } });
    expect(c.isMenuOpen()).toBe(false);
  });
});

