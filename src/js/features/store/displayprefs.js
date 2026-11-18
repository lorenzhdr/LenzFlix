// VIDEOTHEK LENZ: eigene Schlüssel in Jellyfins DisplayPreferences (1.17.0). Immer GET → nur den eigenen Schlüssel ändern → POST des
// ganzen Objekts: geteilte CustomPrefs-Einträge (chromecastVersion, skipForwardLength, …) bleiben unverändert erhalten.
// Client 'lenzflix'; die Design-Id 'lenzflix' (core/theme.js) wird hier nie angefasst. Keine Tokens loggen.
import { buildUrl, getAuth, getJson, getUserId } from '../../core/api.js';

const CLIENT = 'lenzflix';

function fetchPrefs(id, uid) {
  const c = window.ApiClient;
  if (c && typeof c.getDisplayPreferences === 'function') return c.getDisplayPreferences(id, uid, CLIENT);
  return getJson(`/DisplayPreferences/${id}`, { userId: uid, client: CLIENT });
}

async function postPrefs(id, uid, prefs) {
  const c = window.ApiClient;
  if (c && typeof c.updateDisplayPreferences === 'function') return c.updateDisplayPreferences(id, prefs, uid, CLIENT);
  const res = await fetch(buildUrl(`/DisplayPreferences/${id}`, { userId: uid, client: CLIENT }), {
    method: 'POST',
    headers: { Authorization: `MediaBrowser Token="${getAuth().token}"`, 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return null;
}

/** Wert eines Schlüssels (String) oder null. Wirft bei Netz-/Serverfehlern. */
export async function readCustom(id, key, uid = getUserId()) {
  const p = await fetchPrefs(id, uid);
  const v = p && p.CustomPrefs ? p.CustomPrefs[key] : null;
  return typeof v === 'string' ? v : null;
}

/** GET → fn(alterWert|null) → POST. Liefert fn null/undefined, entfällt der POST (false). Wirft bei Fehlern (ohne GET nie ein POST). */
export async function updateCustom(id, key, fn, uid = getUserId()) {
  const prefs = (await fetchPrefs(id, uid)) || {};
  const cur = prefs.CustomPrefs && prefs.CustomPrefs[key];
  const next = fn(typeof cur === 'string' ? cur : null);
  if (next === null || next === undefined) return false;
  prefs.CustomPrefs = { ...(prefs.CustomPrefs || {}), [key]: String(next) };
  if (!prefs.Id) prefs.Id = id;
  await postPrefs(id, uid, prefs);
  return true;
}

export const writeCustom = (id, key, value, uid) => updateCustom(id, key, () => String(value), uid);
