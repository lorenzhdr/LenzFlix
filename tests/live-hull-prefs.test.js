// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ getUserId: () => 'u1' }));

import * as prefs from '../src/js/features/live/prefs.js';

beforeEach(() => localStorage.clear());

describe('live prefs', () => {
  it('Standardwerte', () => {
    expect(prefs.getStyle()).toBe('flat');
    expect(prefs.DEFAULTS.style).toBe('flat');
    expect(prefs.STYLES[0]).toBe('flat');
    expect(prefs.getVolume()).toBe(0.8);
    expect(prefs.getMuted()).toBe(false);
    expect(prefs.getLastChannel()).toBe(1);
  });

  it('speichert pro Benutzer unter lfx.live.<name>.<uid>', () => {
    prefs.savePrefs({ style: 'silver', volume: 0.35, muted: true, lastChannel: 7 });
    expect(localStorage.getItem('lfx.live.tvstyle.u1')).toBe('silver');
    expect(localStorage.getItem('lfx.live.volume.u1')).toBe('0.35');
    expect(localStorage.getItem('lfx.live.muted.u1')).toBe('1');
    expect(localStorage.getItem('lfx.live.lastChannel.u1')).toBe('7');
    expect(prefs.getStyle()).toBe('silver');
    expect(prefs.getVolume()).toBe(0.35);
    expect(prefs.getMuted()).toBe(true);
    expect(prefs.getLastChannel()).toBe(7);
    prefs.savePrefs({ muted: false, volume: 0 });
    expect(prefs.getMuted()).toBe(false);
    expect(prefs.getVolume()).toBe(0);
  });

  it('alter Schlüssel lfx.live.style.<uid> (automatisch gespeichertes crt80) wird ignoriert → neuer Standard flat', () => {
    localStorage.setItem('lfx.live.style.u1', 'crt80');
    expect(prefs.getStyle()).toBe('flat');
    prefs.savePrefs({ volume: 0.5, muted: true, lastChannel: 3 });
    expect(localStorage.getItem('lfx.live.tvstyle.u1')).toBeNull();
    expect(prefs.getStyle()).toBe('flat');
    prefs.savePrefs({ style: 'crt80' });
    expect(prefs.getStyle()).toBe('crt80');
  });

  it('partielle Speicherung lässt andere Werte unberührt', () => {
    prefs.savePrefs({ style: 'flat' });
    prefs.savePrefs({ lastChannel: 18 });
    expect(prefs.getStyle()).toBe('flat');
    expect(prefs.getLastChannel()).toBe(18);
  });

  it('ungültige Werte werden nicht gespeichert bzw. fallen auf den Standard', () => {
    prefs.savePrefs({ style: 'neon', volume: 2, muted: 'ja', lastChannel: 19 });
    prefs.savePrefs({ lastChannel: 0 });
    prefs.savePrefs({ lastChannel: 2.5 });
    prefs.savePrefs(null);
    expect(localStorage.length).toBe(0);
    localStorage.setItem('lfx.live.tvstyle.u1', 'x');
    localStorage.setItem('lfx.live.volume.u1', 'laut');
    localStorage.setItem('lfx.live.lastChannel.u1', '99');
    expect(prefs.getStyle()).toBe('flat');
    expect(prefs.getVolume()).toBe(0.8);
    expect(prefs.getLastChannel()).toBe(1);
  });

  it('Röhren-Effekte: Standard an, speichert lfx.live.fx.<uid>, nur Boolean', () => {
    expect(prefs.getFx()).toBe(true);
    prefs.savePrefs({ fx: false });
    expect(localStorage.getItem('lfx.live.fx.u1')).toBe('0');
    expect(prefs.getFx()).toBe(false);
    prefs.savePrefs({ fx: 'nein' });
    expect(prefs.getFx()).toBe(false);
    prefs.savePrefs({ fx: true });
    expect(prefs.getFx()).toBe(true);
  });

  it('Pausenmusik: Standard an, speichert lfx.live.music.<uid>, nur Boolean', () => {
    expect(prefs.getMusic()).toBe(true);
    expect(prefs.DEFAULTS.music).toBe(true);
    prefs.savePrefs({ music: false });
    expect(localStorage.getItem('lfx.live.music.u1')).toBe('0');
    expect(prefs.getMusic()).toBe(false);
    prefs.savePrefs({ music: 'nein' });
    expect(prefs.getMusic()).toBe(false);
    prefs.savePrefs({ music: true });
    expect(localStorage.getItem('lfx.live.music.u1')).toBe('1');
    expect(prefs.getMusic()).toBe(true);
  });

  it('gesperrter Speicher wirft nicht', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('voll'); });
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('gesperrt'); });
    expect(() => prefs.savePrefs({ style: 'plain' })).not.toThrow();
    expect(prefs.getStyle()).toBe('flat');
    spy.mockRestore();
    get.mockRestore();
  });
});
