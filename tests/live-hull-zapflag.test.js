// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { zapStatsEnabled, zapWarmEnabled, defineZapWarm, forceHlsEnabled, ZAP_KEY, ZAP_WARM_KEY, FORCE_HLS_KEY } from '../src/js/features/live/zapflag.js';

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

describe('lfxwarm (Vorwärmen, Standard an)', () => {
  const net = (c) => Object.defineProperty(navigator, 'connection', { value: c, configurable: true });
  afterEach(() => { delete navigator.connection; });

  it('Standard an (ohne gespeicherten Wert)', () => {
    expect(zapWarmEnabled()).toBe(true);
  });
  it('lfxwarm=0 schaltet aus und bleibt gespeichert (auch ohne Parameter)', () => {
    window.location.hash = '#/home?lfx=tv&lfxwarm=0';
    expect(zapWarmEnabled()).toBe(false);
    expect(localStorage.getItem(ZAP_WARM_KEY)).toBe('0');
    window.location.hash = '#/home?lfx=tv';
    expect(zapWarmEnabled()).toBe(false);
  });
  it('lfxwarm=1 schaltet wieder an und speichert 1', () => {
    localStorage.setItem(ZAP_WARM_KEY, '0');
    window.location.hash = '#/home?lfxwarm=1';
    expect(zapWarmEnabled()).toBe(true);
    expect(localStorage.getItem(ZAP_WARM_KEY)).toBe('1');
    window.location.hash = '';
    expect(zapWarmEnabled()).toBe(true);
  });
  it('alter gespeicherter Wert 1 bleibt an', () => {
    localStorage.setItem(ZAP_WARM_KEY, '1');
    expect(zapWarmEnabled()).toBe(true);
  });
  it('Netzregel: aus bei Datensparen, Mobilfunk, 2g/3g; an bei WLAN/4g und ohne API', () => {
    net({ saveData: true });
    expect(zapWarmEnabled()).toBe(false);
    net({ type: 'cellular' });
    expect(zapWarmEnabled()).toBe(false);
    net({ effectiveType: '3g' });
    expect(zapWarmEnabled()).toBe(false);
    net({ effectiveType: '2g' });
    expect(zapWarmEnabled()).toBe(false);
    net({ effectiveType: '4g', type: 'wifi' });
    expect(zapWarmEnabled()).toBe(true);
  });
  it('defineZapWarm: Getter wertet zur Laufzeit aus und überlebt keinen Spread (deshalb erneut setzen)', () => {
    const deps = defineZapWarm({ ...defineZapWarm({}) });
    expect(deps.zapWarm).toBe(true);
    localStorage.setItem(ZAP_WARM_KEY, '0');
    expect(deps.zapWarm).toBe(false);
    expect(Object.keys(deps)).toContain('zapWarm');
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
