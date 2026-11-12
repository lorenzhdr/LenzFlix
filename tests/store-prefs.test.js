// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ getUserId: () => 'u1' }));

import * as prefs from '../src/js/features/store/prefs.js';

beforeEach(() => localStorage.clear());

describe('Touch-Feineinstellung', () => {
  it('Standard: Touch-Steuerung, Umschauen normal, Umgreifen kurz', () => {
    expect(prefs.getTouchControl()).toBe('touch');
    expect(prefs.getTouchTune()).toEqual({ touchSens: 'normal', touchRegrip: 'short', holdInvertY: false, holdInvertX: false, lookFlipY: false, lookFlipX: false });
  });
  it('gespeichertes joystick bleibt', () => {
    prefs.savePrefs({ touchControl: 'joystick' });
    expect(prefs.getTouchControl()).toBe('joystick');
  });
  it('alte lookInvert-Schlüssel werden entfernt und nicht übernommen', () => {
    localStorage.setItem('lfx.store.lookInvertY.u1', '1');
    localStorage.setItem('lfx.store.lookInvertX.u1', '1');
    const t = prefs.getTouchTune();
    expect(t.lookFlipY).toBe(false);
    expect(t.lookFlipX).toBe(false);
    expect(localStorage.getItem('lfx.store.lookInvertY.u1')).toBeNull();
    expect(localStorage.getItem('lfx.store.lookInvertX.u1')).toBeNull();
  });
  it('Umgreifen speichern und validieren', () => {
    prefs.savePrefs({ touchRegrip: 'long' });
    expect(prefs.getTouchTune().touchRegrip).toBe('long');
    prefs.savePrefs({ touchRegrip: 'x' });
    expect(prefs.getTouchTune().touchRegrip).toBe('long');
    localStorage.setItem('lfx.store.touchRegrip.u1', 'zzz');
    expect(prefs.getTouchTune().touchRegrip).toBe('short');
  });
  it('speichert und validiert', () => {
    prefs.savePrefs({ holdInvertY: true, lookFlipX: true, touchSens: 'high' });
    expect(prefs.getTouchTune()).toEqual({ touchSens: 'high', touchRegrip: 'short', holdInvertY: true, holdInvertX: false, lookFlipY: false, lookFlipX: true });
    prefs.savePrefs({ touchSens: 'wild', holdInvertY: 'ja', lookFlipX: false });
    const t = prefs.getTouchTune();
    expect(t.touchSens).toBe('high');
    expect(t.holdInvertY).toBe(true);
    expect(t.lookFlipX).toBe(false);
  });
  it('ungültiger gespeicherter Wert fällt auf Standard', () => {
    localStorage.setItem('lfx.store.touchSens.u1', 'x');
    expect(prefs.getTouchTune().touchSens).toBe('normal');
  });
});

describe('VR-Prefs', () => {
  it('Standardwerte', () => {
    expect(prefs.getVr()).toEqual({ turn: 'snap', vignette: true, height: 'auto', quality: 'mid', seat: 'mid' });
  });

  it('savePrefs({ vr }) speichert gültige Werte unter lfx.store.<name>.<uid>', () => {
    prefs.savePrefs({ vr: { turn: 'smooth', vignette: false, height: 'seated', quality: 'low', seat: 'front' } });
    expect(localStorage.getItem('lfx.store.vrTurn.u1')).toBe('smooth');
    expect(localStorage.getItem('lfx.store.vrVignette.u1')).toBe('0');
    expect(prefs.getVr()).toEqual({ turn: 'smooth', vignette: false, height: 'seated', quality: 'low', seat: 'front' });
    prefs.savePrefs({ vr: { vignette: true } });
    expect(prefs.getVr().vignette).toBe(true);
    expect(prefs.getVr().turn).toBe('smooth');
  });

  it('ungültige Werte werden ignoriert, kaputter Speicher fällt auf Standard', () => {
    prefs.savePrefs({ vr: { turn: 'quatsch', vignette: 'ja', height: 3, quality: 'high', seat: null } });
    expect(localStorage.length).toBe(0);
    localStorage.setItem('lfx.store.vrSeat.u1', 'oben');
    localStorage.setItem('lfx.store.vrQuality.u1', 'ultra');
    expect(prefs.getVr().seat).toBe('mid');
    expect(prefs.getVr().quality).toBe('mid');
    prefs.savePrefs({ vr: null });
    prefs.savePrefs({ vr: 'x' });
  });
});
