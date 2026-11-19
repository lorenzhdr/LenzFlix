// @vitest-environment jsdom
// Absturzschutz Handy-Ultra (features/store/ultraguard.js): Merker ultraLive/ultraBlock, nur auf ultraCompact-Geräten.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, getUserId: () => 'u1' };
});

import { startUltraGuard, reportUltraLevel, clearUltraGuard, manualUltraChosen } from '../src/js/features/store/ultraguard.js';
import * as prefs from '../src/js/features/store/prefs.js';

const setHidden = (v) => {
  Object.defineProperty(document, 'hidden', { value: v, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  clearUltraGuard();
  localStorage.clear();
  setHidden(false);
});

describe('Absturzschutz Handy-Ultra', () => {
  it('Start ohne Merker: Automatik frei, nichts gesetzt', () => {
    expect(startUltraGuard(true)).toBe(true);
    expect(prefs.getUltraLive()).toBe(false);
    expect(prefs.getUltraBlock()).toBe(false);
  });
  it('Ultra gemeldet setzt den Merker, anderer Level löscht ihn', () => {
    startUltraGuard(true);
    reportUltraLevel('high');
    expect(prefs.getUltraLive()).toBe(false);
    reportUltraLevel('ultra');
    expect(prefs.getUltraLive()).toBe(true);
    reportUltraLevel('mid');
    expect(prefs.getUltraLive()).toBe(false);
  });
  it('pagehide löscht, pageshow und sichtbar setzen bei Ultra erneut, verdeckt löscht', () => {
    startUltraGuard(true);
    reportUltraLevel('ultra');
    window.dispatchEvent(new Event('pagehide'));
    expect(prefs.getUltraLive()).toBe(false);
    window.dispatchEvent(new Event('pageshow'));
    expect(prefs.getUltraLive()).toBe(true);
    setHidden(true);
    expect(prefs.getUltraLive()).toBe(false);
    setHidden(false);
    expect(prefs.getUltraLive()).toBe(true);
  });
  it('Ultra gemeldet bei verdeckter Seite setzt nichts', () => {
    startUltraGuard(true);
    setHidden(true);
    reportUltraLevel('ultra');
    expect(prefs.getUltraLive()).toBe(false);
  });
  it('clear (suspend/dispose/destroy) löscht den Merker und entfernt die Listener', () => {
    startUltraGuard(true);
    reportUltraLevel('ultra');
    clearUltraGuard();
    expect(prefs.getUltraLive()).toBe(false);
    setHidden(true);
    setHidden(false);
    window.dispatchEvent(new Event('pageshow'));
    expect(prefs.getUltraLive()).toBe(false);
  });
  it('Absturz (Merker beim Start vorhanden): ultraAuto false, Merker weg, Block gesetzt, bleibt über Neustarts', () => {
    prefs.setUltraLive(true);
    expect(startUltraGuard(true)).toBe(false);
    expect(prefs.getUltraLive()).toBe(false);
    expect(prefs.getUltraBlock()).toBe(true);
    expect(startUltraGuard(true)).toBe(false);
  });
  it('manuelle Ultra-Wahl hebt den Block auf', () => {
    prefs.setUltraBlock(true);
    expect(startUltraGuard(true)).toBe(false);
    manualUltraChosen();
    expect(prefs.getUltraBlock()).toBe(false);
    expect(startUltraGuard(true)).toBe(true);
  });
  it('Desktop/Tablet (compact false): unberührt, ultraAuto immer true, nichts geschrieben', () => {
    prefs.setUltraLive(true);
    prefs.setUltraBlock(true);
    expect(startUltraGuard(false)).toBe(true);
    expect(prefs.getUltraLive()).toBe(true);
    prefs.setUltraLive(false);
    reportUltraLevel('ultra');
    window.dispatchEvent(new Event('pageshow'));
    expect(prefs.getUltraLive()).toBe(false);
    clearUltraGuard();
    manualUltraChosen();
    expect(prefs.getUltraBlock()).toBe(true);
  });
  it('Schlüssel sind je Benutzer', () => {
    prefs.setUltraLive(true);
    expect(localStorage.getItem('lfx.store.ultraLive.u1')).toBe('1');
    prefs.setUltraBlock(true);
    expect(localStorage.getItem('lfx.store.ultraBlock.u1')).toBe('1');
  });
});
