// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { zapStatsEnabled, ZAP_KEY } from '../src/js/features/live/zapflag.js';

beforeEach(() => { localStorage.clear(); window.location.hash = ''; });

describe('lfxdebug-Schalter', () => {
  it('ohne Parameter und Speicher: aus', () => {
    window.location.hash = '#/home?lfx=tv';
    expect(zapStatsEnabled()).toBe(false);
  });
  it('lfxdebug=1 schaltet ein und merkt sich den Wert; danach auch ohne Parameter an', () => {
    window.location.hash = '#/home?lfx=tv&lfxdebug=1';
    expect(zapStatsEnabled()).toBe(true);
    expect(localStorage.getItem(ZAP_KEY)).toBe('1');
    window.location.hash = '#/home?lfx=tv';
    expect(zapStatsEnabled()).toBe(true);
  });
  it('lfxdebug=0 löscht den Speicher', () => {
    localStorage.setItem(ZAP_KEY, '1');
    window.location.hash = '#/home?lfxdebug=0';
    expect(zapStatsEnabled()).toBe(false);
    expect(localStorage.getItem(ZAP_KEY)).toBeNull();
  });
});
