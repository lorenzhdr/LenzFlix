// VIDEOTHEK LENZ · Wetter-Extras (1.19.0), rein (ohne three/DOM): Blitz-/Donnerplanung, Atem, Thermometer-Text.
import { atLeast } from '../engine/quality.js';

const fin = (v) => typeof v === 'number' && Number.isFinite(v);

/** Hash 0..1 aus einer Ganzzahl (deterministisch, ohne Math.random). */
export function hash01(n) {
  let a = (n | 0) + 0x6d2b79f5;
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}

/** Abstand zum nächsten Blitz (s) für den n-ten Blitz einer Sitzung: 8 … 25 s. */
export function lightningGap(seed, n) {
  return 8 + hash01((seed | 0) * 7919 + n * 104729) * 17;
}

/** Blitzhelligkeit 0..1 bei Zeit dt (s) seit Blitzbeginn: doppeltes Aufflackern in ~0,45 s, danach 0. */
export function flashAt(dt) {
  if (!fin(dt) || dt < 0) return 0;
  if (dt < 0.06) return 1;
  if (dt < 0.13) return 0.25 * (1 - (dt - 0.06) / 0.07);
  if (dt < 0.2) return 0.85;
  if (dt < 0.45) return 0.85 * (1 - (dt - 0.2) / 0.25) ** 2;
  return 0;
}
export const FLASH_LEN = 0.45;

/** Donner: Verzögerung 0,5 … 4 s und Lautstärke (0,2 … 1) nach Abstand 0..1 (n = Blitznummer, seed = Sitzung). */
export function thunderPlan(seed, n) {
  const dist = hash01((seed | 0) * 31 + n * 977 + 5);
  return { delay: 0.5 + dist * 3.5, gain: 1 - dist * 0.8, dist };
}

/** Blitze nur bei Gewitter und ohne reduzierte Bewegung. */
export function lightningOn(state, reduced) {
  return !!(state && state.storm) && !reduced;
}

/** Sichtbarer Blitz-Strahl: nur ab Stufe mid. */
export function boltVisible(level) { return atLeast(level, 'mid'); }

/** Atemwölkchen: nur bei Frost (≤ 0 °C) und ab Stufe high. */
export function breathOn(temp, level) {
  return fin(temp) && temp <= 0 && atLeast(level, 'high');
}
export const BREATH_MAX = 8;
export const BREATH_PERIOD = 3.5;

/** Phase 0..1 des Atemzugs einer Figur i zur Zeit t (Rhythmus 3 … 4 s je Figur); Puff sichtbar im ersten Drittel. */
export function breathPhase(t, i) {
  const per = 3 + hash01(i * 13 + 1);
  const off = hash01(i * 29 + 7) * per;
  return (((t + off) % per) + per) % per / per;
}

/** Thermometer: Text „3 °C“ (ganzzahlig, echtes Minus), null ohne Temperatur. */
export function thermoText(temp) {
  if (!fin(temp)) return null;
  const v = Math.round(temp);
  return `${v < 0 ? '-' : ''}${Math.abs(v)} °C`;
}

/** Restnässe nach Regenende (Sekunden). */
export const WET_DRY_S = 600;

/**
 * Nasse Straße (Ultra): Stärke 0..1. Regen (raining) 0,45 + 0,55·i; nach Regenende klingt es über 10 min linear ab
 * (sinceRain = Sekunden seit dem Ende, null = kein Regen bekannt); bei Schnee 0 (liegt Schnee, ist nichts nass).
 */
export function wetLevel(state, sinceRain) {
  if (!state || state.snowing || state.cover > 0.05) return 0;
  if (state.raining) return Math.min(1, 0.45 + 0.55 * (fin(state.i) ? state.i : 0.6));
  if (!fin(sinceRain) || sinceRain < 0 || sinceRain >= WET_DRY_S) return 0;
  return 0.45 * (1 - sinceRain / WET_DRY_S);
}

/** Tageszeit-Faktor der Spiegelungen: nachts deutlich, tagsüber dezent. */
export function wetGlow(tod) { return tod === 'night' ? 1 : tod === 'dusk' ? 0.7 : 0.22; }
