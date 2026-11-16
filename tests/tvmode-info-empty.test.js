// @vitest-environment jsdom
// TV-Info: ohne Sendung ist „Mehr“ versteckt und die Wurzel is-empty.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInfo } from '../src/js/live/tvmode/info.js';

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => vi.useRealTimers());

describe('tvmode info', () => {
  it('ohne Sendung ist „Mehr“ versteckt und die Wurzel is-empty', () => {
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

