// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ getUserId: () => 'u1' }));

import * as prefs from '../src/js/features/store/prefs.js';

beforeEach(() => localStorage.clear());

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
