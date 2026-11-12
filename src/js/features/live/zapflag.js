// Messanzeige für LENZ LIVE und TV-Modus: Hash-Parameter lfxdebug=1 schaltet sie ein und merkt sich das in localStorage
// (Key lfx-zapstats), lfxdebug=0 löscht es. Ohne Parameter gilt der gespeicherte Wert. Vertrag: docs/live.md („Messanzeige“).
import { parseHash } from '../../core/router.js';

export const ZAP_KEY = 'lfx-zapstats';

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
