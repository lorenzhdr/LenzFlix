// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { zapStatsEnabled, zapWarmEnabled, forceHlsEnabled, ZAP_KEY, ZAP_WARM_KEY, FORCE_HLS_KEY } from '../src/js/features/live/zapflag.js';

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

describe('lfxwarm (Vorwärmen, Test)', () => {
  it('Standard aus', () => {
    expect(zapWarmEnabled()).toBe(false);
  });
  it('lfxwarm=1 gilt danach auch ohne Parameter, unabhängig von lfxdebug', () => {
    window.location.hash = '#/home?lfx=tv&lfxwarm=1';
    expect(zapWarmEnabled()).toBe(true);
    expect(localStorage.getItem(ZAP_WARM_KEY)).toBe('1');
    window.location.hash = '#/home?lfx=tv';
    expect(zapWarmEnabled()).toBe(true);
  });
  it('lfxwarm=0 löscht den Speicher', () => {
    localStorage.setItem(ZAP_WARM_KEY, '1');
    window.location.hash = '#/home?lfxwarm=0';
    expect(zapWarmEnabled()).toBe(false);
    expect(localStorage.getItem(ZAP_WARM_KEY)).toBeNull();
  });
});

describe('lfxhls (HLS erzwingen, nur mit Messanzeige)', () => {
  it('wirkt nur bei eingeschalteter Messanzeige', () => {
    window.location.hash = '#/home?lfxhls=1';
    expect(forceHlsEnabled()).toBe(false);
    expect(localStorage.getItem(FORCE_HLS_KEY)).toBe('1');
    window.location.hash = '#/home?lfxdebug=1';
    expect(forceHlsEnabled()).toBe(true);
  });
  it('lfxhls=0 löscht den Speicher', () => {
    localStorage.setItem(ZAP_KEY, '1');
    localStorage.setItem(FORCE_HLS_KEY, '1');
    window.location.hash = '#/home?lfxhls=0';
    expect(forceHlsEnabled()).toBe(false);
    expect(localStorage.getItem(FORCE_HLS_KEY)).toBeNull();
  });
});
