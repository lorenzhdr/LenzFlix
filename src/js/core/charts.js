// LenzFlix: echte Charts vom optionalen Charts-Worker (siehe docs/charts-api.md).
// Sicherheit: Das Access-Token wird nur als Header gesendet und nie geloggt.
import * as api from './api.js';
import { cached } from './cache.js';
import { putItems } from './itemstore.js';
import { BASE_PARAMS } from '../features/rows/logic.js';

const TIMEOUT_MS = 8000;
const TTL_MS = 5 * 60 * 1000;

/** Charts-URL: window.LenzFlixConfig.chartsUrl -> CSS-Var --lfx-charts-url -> null. Nur https. */
export function getChartsUrl() {
  const clean = (raw) => {
    const s = String(raw == null ? '' : raw).trim().replace(/^["'\s]+|["'\s]+$/g, '').replace(/\/+$/, '');
    return /^https:\/\/[^\s"']+$/i.test(s) ? s : null;
  };
  const fromConfig = clean(window.LenzFlixConfig && window.LenzFlixConfig.chartsUrl);
  if (fromConfig) return fromConfig;
  try {
    return clean(getComputedStyle(document.documentElement).getPropertyValue('--lfx-charts-url'));
  } catch {
    return null;
  }
}

let warned = false;
function warnOnce(msg) {
  if (warned) return;
  warned = true;
  console.warn(`[LenzFlix] Charts nicht verfügbar: ${msg}`);
}

export function resetChartsWarning() {
  warned = false;
}

function validEntries(list) {
  return Array.isArray(list) ? list.filter((e) => e && typeof e.id === 'string' && e.id) : null;
}

/** Grobe Schema-Prüfung. Rückgabe: bereinigtes Objekt oder null. */
function validate(json) {
  if (!json || typeof json !== 'object' || json.version !== 1) return null;
  const movies = validEntries(json.movies);
  const series = validEntries(json.series);
  const all = validEntries(json.all);
  if (!movies || !series || !all) return null;
  const days = Number(json.windowDays);
  return { ...json, movies, series, all, windowDays: days > 0 ? days : 30 };
}

async function fetchCharts() {
  const base = getChartsUrl();
  if (!base) return null;
  const { token } = api.getAuth();
  if (!token) return null;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetch(`${base}/charts`, {
      headers: { 'X-Emby-Token': token, Accept: 'application/json' },
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!res.ok) { warnOnce(`HTTP ${res.status}`); return null; }
    const data = validate(await res.json());
    if (!data) warnOnce('ungültige Antwort');
    return data;
  } catch (e) {
    warnOnce(e && e.name === 'AbortError' ? 'Zeitüberschreitung' : 'Netzwerkfehler');
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Lädt die Charts (5 min gecacht). Bei jedem Fehler: null. */
export function getCharts() {
  if (!getChartsUrl()) return Promise.resolve(null);
  return cached('charts', fetchCharts, TTL_MS);
}

const normId = (id) => String(id || '').replace(/-/g, '').toLowerCase();

/**
 * Löst Chart-Einträge in Jellyfin-Items auf (mit dem Login des Nutzers). Reihenfolge der Charts bleibt,
 * nicht auffindbare/nicht erlaubte Ids entfallen. Hängt _lfxViewers/_lfxPlays an.
 */
export async function resolveChartItems(entries, { type, limit = 10 } = {}) {
  const list = (Array.isArray(entries) ? entries : []).filter((e) => e && e.id && (!type || e.type === type));
  if (!list.length) return [];
  const res = await api.getItems({ Ids: list.map((e) => e.id).join(','), ...BASE_PARAMS });
  const found = Array.isArray(res) ? res : (res && Array.isArray(res.Items) ? res.Items : []);
  const byId = new Map(found.filter((i) => i && i.Id).map((i) => [normId(i.Id), i]));
  const out = [];
  const seen = new Set();
  for (const e of list) {
    const key = normId(e.id);
    const item = byId.get(key);
    if (!item || seen.has(key)) continue;
    seen.add(key);
    item._lfxViewers = e.viewers;
    item._lfxPlays = e.plays;
    out.push(item);
    if (out.length >= limit) break;
  }
  putItems(out);
  return out;
}
