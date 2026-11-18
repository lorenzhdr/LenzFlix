// VIDEOTHEK LENZ: echtes Wetter vom Charts-Worker (GET /wx). Nur fetch; null = alter Zufall im 3D-Bundle.
// Das Jellyfin-Token verlässt diese Datei nur als Header an den Charts-Worker; nie loggen, nie in eine URL.
import * as api from '../../core/api.js';
import { getChartsUrl } from '../../core/charts.js';

const TIMEOUT_MS = 6000;
const OK_TTL_MS = 15 * 60 * 1000;
const FAIL_TTL_MS = 5 * 60 * 1000; // 404 = Worker ohne Wetter
const ERR_TTL_MS = 60 * 1000; // Timeout/Netzfehler/sonstiger Fehler: bald erneut versuchen
const KINDS = ['clear', 'cloudy', 'fog', 'drizzle', 'rain', 'heavy', 'snow', 'storm'];
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

function parse(d) {
  if (!d || d.v !== 1 || !KINDS.includes(d.k)) return null;
  if (![d.i, d.sd, d.fog, d.t, d.day, d.ts].every(fin)) return null;
  return { k: d.k, i: d.i, sd: d.sd, fog: d.fog, t: d.t, day: d.day ? 1 : 0, ts: d.ts, stale: d.stale ? 1 : 0 };
}

/** Quelle: () => Promise<{k,i,sd,fog,t,day,ts,stale}|null>; Ergebnis 15 min (404 5 min, sonstige Fehler 60 s) gemerkt, an das Token gebunden (Abmeldung/Kontowechsel verwirft), laufende Aufrufe zusammengelegt. */
export function createWeatherSource() {
  let pending = null;
  let cached = null; // { v, exp, key }
  async function run(key) {
    const base = getChartsUrl();
    const a = api.getAuth();
    if (!base || !a.token) return null; // nicht merken: Zustand kann sich ändern
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
    let v = null;
    let ttl = ERR_TTL_MS;
    try {
      const res = await fetch(`${base}/wx`, {
        headers: { 'X-Emby-Token': a.token },
        credentials: 'omit',
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (res.ok) {
        v = parse(await res.json());
        if (v) ttl = OK_TTL_MS;
      } else if (res.status === 404) ttl = FAIL_TTL_MS;
    } catch {
      v = null;
    } finally {
      if (timer) clearTimeout(timer);
    }
    cached = { v, exp: Date.now() + ttl, key };
    return v;
  }
  return () => {
    const key = api.getAuth().token || '';
    if (cached && cached.key !== key) cached = null; // anderes Konto/abgemeldet: nichts übernehmen
    if (pending && pending.key !== key) pending = null;
    if (cached && cached.exp > Date.now()) return Promise.resolve(cached.v);
    if (!pending) {
      const pr = run(key).finally(() => { if (pending === pr) pending = null; });
      pr.key = key;
      pending = pr;
    }
    return pending;
  };
}
