// Zahl der gerade in der VIDEOTHEK verbundenen Personen (GET /mp/online am Charts-Worker).
// Nur für das Design-Menü. Das Jellyfin-Token geht nur als Header an den Worker; nie loggen, nie in eine URL.
import * as api from './api.js';
import { getChartsUrl } from './charts.js';

const TIMEOUT_MS = 4000;
const CACHE_MS = 20000;

let cache = null; // { at, n }
export function clearOnlineCache() {
  cache = null;
}

/** Promise<number|null>: Anzahl verschiedener Konten, null bei jedem Fehler (404/503/Netz/Abbruch/ungültige Antwort). */
export async function fetchOnline(signal) {
  const now = Date.now();
  if (cache && now - cache.at >= 0 && now - cache.at < CACHE_MS) return cache.n;
  let timer = null;
  try {
    const base = getChartsUrl();
    if (!base) return null;
    const token = api.getAuth().token;
    if (!token) return null;
    if (signal && signal.aborted) return null;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    let onAbort = null;
    if (ctrl) {
      timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      if (signal) {
        onAbort = () => ctrl.abort();
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }
    try {
      const res = await fetch(`${base}/mp/online`, {
        headers: { 'X-Emby-Token': token },
        credentials: 'omit',
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : signal,
      });
      if (!res.ok) return null;
      const d = await res.json();
      if (!d || d.v !== 1 || !Number.isInteger(d.n) || d.n < 0) return null;
      cache = { at: Date.now(), n: d.n };
      return d.n;
    } finally {
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
    }
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
