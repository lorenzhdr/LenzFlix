// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDigits } from '../src/js/live/tvmode/digits.js';
import { createControls } from '../src/js/live/tvmode/controls.js';
import { createInfo } from '../src/js/live/tvmode/info.js';

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => vi.useRealTimers());

describe('tvmode Welle 3', () => {
  it('A136: Ziffern-dispose räumt eine offene Vorschau ab', () => {
    vi.useFakeTimers();
    const onPreview = vi.fn();
    const d = createDigits({ onCommit: vi.fn(), onPreview, onInvalid: vi.fn(), now: () => Date.now() });
    d.push('1');
    expect(onPreview).toHaveBeenLastCalledWith('1_');
    d.dispose();
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(d.pending()).toBe('');
  });

  it('B089: ein offenes Ton-/Untertitel-Menü schließt, wenn die Sendung wechselt', () => {
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

  it('H021: ohne Sendung ist „Mehr“ versteckt und die Wurzel is-empty', () => {
    const T = Date.UTC(2026, 10, 11, 19, 0, 0);
    const entry = { start: T, end: T + 3600000, type: 'program', itemId: 'm1' };
    const model = {
      channels: vi.fn(() => [{ no: 3, name: 'LIVE Kino', key: 'k' }]),
      describe: vi.fn(() => ({ title: 'Testfilm', sub: '', time: '20:00–21:00', progress: 0.5, badges: [], kind: 'program', itemId: 'm1', overview: 'Text', year: 1999, genres: [], runMin: 60 })),
      nextProgram: vi.fn(() => null),
      titleOf: vi.fn(() => ({ title: '', sub: '' })),
    };
    const ctl = { restartTarget: vi.fn(() => ({ itemId: 'm1' })), stop: vi.fn() };
    const details = { get: vi.fn(() => ''), request: vi.fn(), map: vi.fn(() => new Map()), on: vi.fn(() => () => {}) };
    const info = createInfo({ doc: document, ctl, model, deps: {}, opts: { details, pip: { supported: () => true, toggle: vi.fn() }, getNow: () => T + 1800000 } });
    document.body.append(info.el);
    info.update({ on: true, channel: 3, entry, phase: 'playing' });
    info.update({ on: false, channel: 0, entry: null, phase: 'off' });
    expect(info.el.classList.contains('is-empty')).toBe(true);
    expect(info.el.querySelector('.lfx-tvm__info-more').hidden).toBe(true);
  });
});
