// Messanzeige für LENZ LIVE und TV-Modus: Hash-Parameter lfxdebug=1 schaltet sie ein und merkt sich das in localStorage
// (Key lfx-zapstats), lfxdebug=0 löscht es. Ohne Parameter gilt der gespeicherte Wert. Vertrag: docs/live.md („Messanzeige“).
import { parseHash } from '../../core/router.js';

export const ZAP_KEY = 'lfx-zapstats';
export const ZAP_VARIANT_KEY = 'lfx-zapvariant';
export const FORCE_HLS_KEY = 'lfx-forcehls';

function hashParam(name) {
  try { return parseHash(window.location.hash).params.get(name); } catch { return null; }
}

export function zapStatsEnabled() {
  let v = null;
  try { v = parseHash(window.location.hash).params.get('lfxdebug'); } catch { /* ohne Hash */ }
  try {
    if (v === '1') window.localStorage.setItem(ZAP_KEY, '1');
    else if (v === '0') { window.localStorage.removeItem(ZAP_KEY); return false; }
    return window.localStorage.getItem(ZAP_KEY) === '1';
  } catch {
    return v === '1'; // Speicher gesperrt: nur für diese Sitzung
  }
}

/**
 * Startvariante des Players (0–2, Standard 1): Hash lfxzap=0|1|2, gemerkt in localStorage (lfx-zapvariant). Wert 1 oder ein ungültiger
 * Wert = Standard und entfernt den Schlüssel. Ohne Parameter gilt der gespeicherte Wert. Wirkt in LENZ LIVE und im TV-Modus (deps.zapVariant).
 */
export function zapVariant() {
  const v = hashParam('lfxzap');
  const valid = (x) => x === '0' || x === '1' || x === '2';
  try {
    if (v != null) {
      if (valid(v) && v !== '1') window.localStorage.setItem(ZAP_VARIANT_KEY, v);
      else window.localStorage.removeItem(ZAP_VARIANT_KEY);
    }
    const s = window.localStorage.getItem(ZAP_VARIANT_KEY);
    return valid(s) ? Number(s) : 1;
  } catch {
    return valid(v) ? Number(v) : 1; // Speicher gesperrt: nur für diese Sitzung
  }
}

/** Debug: HLS erzwingen (Hash lfxhls=1|0, localStorage lfx-forcehls). Wirkt nur bei eingeschalteter Messanzeige (lfxdebug). */
export function forceHlsEnabled() {
  const v = hashParam('lfxhls');
  let on;
  try {
    if (v === '1') window.localStorage.setItem(FORCE_HLS_KEY, '1');
    else if (v === '0') window.localStorage.removeItem(FORCE_HLS_KEY);
    on = window.localStorage.getItem(FORCE_HLS_KEY) === '1';
  } catch {
    on = v === '1';
  }
  return on && zapStatsEnabled();
}
