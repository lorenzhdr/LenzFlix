// VIDEOTHEK LENZ · Entdeckungen: Speicherung pro Gerät (rein; Storage wird übergeben, nie Top-Level-Zugriff auf window).
// Format: JSON { v:1, found: { <id>: <Zeitstempel ms> } }. Müll, fremde IDs und fehlender/werfender Storage werden still ignoriert.
import { isKnownId, CATALOG } from './catalog.js';

export const KEY_PREFIX = 'lfx.store.discover.';
export const keyFor = (userId) => `${KEY_PREFIX}${userId ? String(userId).slice(0, 64) : 'anon'}`;

/** Wert aus dem Storage lesen → { id: ts } (nur bekannte IDs, Zeit endlich). */
export function parseFound(raw) {
  if (typeof raw !== 'string' || !raw) return {};
  let j;
  try { j = JSON.parse(raw); } catch { return {}; }
  const src = j && typeof j === 'object' && j.found && typeof j.found === 'object' && !Array.isArray(j.found) ? j.found : {};
  const out = {};
  for (const id of Object.keys(src)) {
    if (!isKnownId(id)) continue;
    const t = Number(src[id]);
    out[id] = Number.isFinite(t) && t > 0 ? t : 1;
  }
  return out;
}

/** Entdeckungs-Speicher. opts: { storage?, userId?, now?: () => ms }. */
export function createDiscoverStore({ storage = null, userId = null, now = () => Date.now() } = {}) {
  const key = keyFor(userId);
  let found = {};
  try { found = storage ? parseFound(storage.getItem(key)) : {}; } catch { found = {}; }
  const listeners = new Set();
  const persist = () => { try { if (storage) storage.setItem(key, JSON.stringify({ v: 1, found })); } catch { /* Speicher voll/gesperrt: nur Sitzung */ } };
  const api = {
    key,
    has: (id) => Object.prototype.hasOwnProperty.call(found, id),
    count: () => Object.keys(found).length,
    /** true, wenn neu (bekannte ID, noch nicht gefunden). */
    add(id) {
      if (!isKnownId(id) || api.has(id)) return false;
      found[id] = Math.max(1, Math.round(now()));
      persist();
      for (const fn of [...listeners]) { try { fn(id); } catch { /* egal */ } }
      return true;
    },
    reset() { found = {}; try { if (storage) storage.removeItem(key); } catch { /* egal */ } },
    ids: () => CATALOG.filter((e) => api.has(e.id)).map((e) => e.id),
    onAdd(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  return api;
}
