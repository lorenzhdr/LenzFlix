// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { zapStatsEnabled, zapVariant, forceHlsEnabled, ZAP_KEY, ZAP_VARIANT_KEY, FORCE_HLS_KEY } from '../src/js/features/live/zapflag.js';

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

describe('lfxzap (Startvariante)', () => {
  it('Standard 1 ohne Parameter und Speicher', () => {
    expect(zapVariant()).toBe(1);
  });
  it('0/2 werden gespeichert und gelten danach auch ohne Parameter', () => {
    window.location.hash = '#/home?lfx=tv&lfxzap=2';
    expect(zapVariant()).toBe(2);
    expect(localStorage.getItem(ZAP_VARIANT_KEY)).toBe('2');
    window.location.hash = '#/home?lfx=tv';
    expect(zapVariant()).toBe(2);
    window.location.hash = '#/home?lfxzap=0';
    expect(zapVariant()).toBe(0);
  });
  it('1 und ungültige Werte entfernen den Schlüssel (Standard)', () => {
    localStorage.setItem(ZAP_VARIANT_KEY, '2');
    window.location.hash = '#/home?lfxzap=1';
    expect(zapVariant()).toBe(1);
    expect(localStorage.getItem(ZAP_VARIANT_KEY)).toBeNull();
    localStorage.setItem(ZAP_VARIANT_KEY, '2');
    window.location.hash = '#/home?lfxzap=3'; // verworfene Variante
    expect(zapVariant()).toBe(1);
    localStorage.setItem(ZAP_VARIANT_KEY, '2');
    window.location.hash = '#/home?lfxzap=x';
    expect(zapVariant()).toBe(1);
    expect(localStorage.getItem(ZAP_VARIANT_KEY)).toBeNull();
  });
  it('ungültiger gespeicherter Wert → Standard', () => {
    localStorage.setItem(ZAP_VARIANT_KEY, '9');
    expect(zapVariant()).toBe(1);
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
