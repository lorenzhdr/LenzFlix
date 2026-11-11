// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ getUserId: () => 'u1' }));

import { DEFAULTS, getLastChannel, getMuted, getVolume, savePrefs } from '../src/js/features/tvmode/prefs.js';

beforeEach(() => localStorage.clear());

describe('tvmode prefs', () => {
  it('Standardwerte', () => {
    expect(getVolume()).toBe(DEFAULTS.volume);
    expect(getMuted()).toBe(false);
    expect(getLastChannel()).toBe(1);
  });
  it('schreibt lfx.tvm.<name>.<uid>', () => {
    savePrefs({ volume: 0.5, muted: true, lastChannel: 7 });
    expect(localStorage.getItem('lfx.tvm.volume.u1')).toBe('0.5');
    expect(localStorage.getItem('lfx.tvm.muted.u1')).toBe('1');
    expect(localStorage.getItem('lfx.tvm.lastChannel.u1')).toBe('7');
    expect(getVolume()).toBe(0.5);
    expect(getMuted()).toBe(true);
    expect(getLastChannel()).toBe(7);
  });
  it('ignoriert ungültige Werte', () => {
    savePrefs({ volume: 2, muted: 'ja', lastChannel: 19 });
    savePrefs({ lastChannel: 0 });
    savePrefs(null);
    expect(localStorage.length).toBe(0);
    localStorage.setItem('lfx.tvm.lastChannel.u1', '99');
    expect(getLastChannel()).toBe(1);
  });
});
