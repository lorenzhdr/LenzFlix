// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ getUserId: () => 'u1' }));

import * as prefs from '../src/js/features/store/prefs.js';

beforeEach(() => localStorage.clear());

describe('Touch-Feineinstellung', () => {
  it('Standard: Touch-Steuerung Spiel (game), Umschauen normal, Umgreifen kurz', () => {
    expect(prefs.getTouchControl()).toBe('game');
    expect(prefs.getTouchTune()).toEqual({ touchSens: 'normal', touchRegrip: 'short', holdInvertY: false, holdInvertX: false, lookFlipY: false, lookFlipX: false });
  });
  it('gespeichertes joystick bleibt', () => {
    prefs.savePrefs({ touchControl: 'joystick', touchControlChosen: true });
    expect(prefs.getTouchControl()).toBe('joystick');
  });
  it('Migration 1.15.0: touch ohne Marker = nie gewählt -> game; mit Marker bleibt touch; joystick bleibt; game bleibt', () => {
    localStorage.setItem('lfx.store.touchControl.u1', 'touch');
    expect(prefs.getTouchControl()).toBe('game');
    localStorage.setItem('lfx.store.touchControlChosen.u1', '1');
    expect(prefs.getTouchControl()).toBe('touch');
    localStorage.clear();
    localStorage.setItem('lfx.store.touchControl.u1', 'joystick');
    expect(prefs.getTouchControl()).toBe('joystick');
    localStorage.setItem('lfx.store.touchControl.u1', 'game');
    expect(prefs.getTouchControl()).toBe('game');
    localStorage.setItem('lfx.store.touchControl.u1', 'quatsch');
    expect(prefs.getTouchControl()).toBe('game');
  });
  it('savePrefs schreibt touchControl nur mit touchControlChosen (inkl. Marker)', () => {
    prefs.savePrefs({ touchControl: 'touch' });
    expect(localStorage.getItem('lfx.store.touchControl.u1')).toBe(null);
    prefs.savePrefs({ touchControl: 'touch', touchControlChosen: false });
    expect(localStorage.getItem('lfx.store.touchControl.u1')).toBe(null);
    prefs.savePrefs({ touchControl: 'touch', touchControlChosen: true });
    expect(localStorage.getItem('lfx.store.touchControl.u1')).toBe('touch');
    expect(localStorage.getItem('lfx.store.touchControlChosen.u1')).toBe('1');
    expect(prefs.getTouchControl()).toBe('touch');
    prefs.savePrefs({ touchControl: 'quatsch', touchControlChosen: true });
    expect(prefs.getTouchControl()).toBe('touch');
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

describe('Mehrspieler-Vorlieben', () => {
  it('Standard: on/name/chat an, film aus, mute leer, hint false', () => {
    expect(prefs.getMp()).toEqual({ on: true, name: true, card: true, film: false, chat: true, mute: [], hint: false });
  });
  it('nur ausdrückliches 0 schaltet ab, nur 1 schaltet film an', () => {
    prefs.savePrefs({ mp: { on: false, name: false, chat: false, film: true, hint: true, card: false } });
    expect(prefs.getMp()).toMatchObject({ on: false, name: false, card: false, chat: false, film: true, hint: true });
    expect(localStorage.getItem('lfx.store.mpOn.u1')).toBe('0');
    localStorage.setItem('lfx.store.mpOn.u1', 'x');
    localStorage.setItem('lfx.store.mpFilm.u1', 'x');
    expect(prefs.getMp()).toMatchObject({ on: true, film: false });
  });
  it('Teilmenge, Typprüfung, mute gefiltert/dedupliziert/auf 50 begrenzt', () => {
    prefs.savePrefs({ mp: { on: 'no', chat: false } });
    expect(prefs.getMp()).toMatchObject({ on: true, chat: false });
    const ks = Array.from({ length: 60 }, (_, i) => i.toString(16).padStart(12, '0'));
    prefs.savePrefs({ mp: { mute: [...ks, ks[0], 'ZZ', 5] } });
    expect(prefs.getMp().mute).toEqual(ks.slice(0, 50));
    localStorage.setItem('lfx.store.mpMute.u1', '{kaputt');
    expect(prefs.getMp().mute).toEqual([]);
  });
});
