// Messanzeige für LENZ LIVE und TV-Modus: Hash-Parameter lfxdebug=1 schaltet sie ein und merkt sich das in localStorage
// (Key lfx-zapstats), lfxdebug=0 löscht es. Ohne Parameter gilt der gespeicherte Wert. Vertrag: docs/live.md („Messanzeige“).
import { parseHash } from '../../core/router.js';
import { netOk } from '../../core/net.js';
import { isDataSaver } from '../../core/datasaver.js';

export const ZAP_KEY = 'lfx-zapstats';
export const ZAP_WARM_KEY = 'lfx-zapwarm';
export const FORCE_HLS_KEY = 'lfx-forcehls';

// Aufräumen: Rest der entfernten Startvarianten-Weiche (1.11.5).
try { window.localStorage.removeItem('lfx-zapvariant'); } catch { /* Speicher gesperrt */ }

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
 * Vorwärmen der Nachbarsender: Standard AN. Hash lfxwarm=0 schaltet dauerhaft aus (localStorage lfx-zapwarm = '0'), lfxwarm=1 wieder an.
 * Aus bei Datensparen/Mobilfunk/langsamem Netz. Wird zur Laufzeit ausgewertet (deps.zapWarm ist ein Getter). docs/live.md „Vorwärmen“.
 */
export function zapWarmEnabled() {
  const v = hashParam('lfxwarm');
  let off;
  try {
    if (v === '1' || v === '0') window.localStorage.setItem(ZAP_WARM_KEY, v);
    off = window.localStorage.getItem(ZAP_WARM_KEY) === '0';
  } catch {
    off = v === '0'; // Speicher gesperrt: nur für diese Sitzung
  }
  return !off && netOk() && !isDataSaver(); // isDataSaver: nur flix/plus/prime, unter LENZ LIVE immer false
}

/**
 * Setzt deps.zapWarm und deps.zapPrefetch als Getter (Spread kopiert Getter nur als Wert, daher nach dem Zusammenbauen der deps aufrufen).
 * zapPrefetch = false bei aktivem Datensparmodus (TV-Modus sperrt dann die PlaybackInfo-Vorauflösung der Nachbarn; unter LENZ LIVE immer true).
 */
export function defineZapWarm(deps) {
  Object.defineProperty(deps, 'zapWarm', { get: zapWarmEnabled, enumerable: true, configurable: true });
  Object.defineProperty(deps, 'zapPrefetch', { get: () => !isDataSaver(), enumerable: true, configurable: true });
  return deps;
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
