// LENZ LIVE / TV-Modus: gemeinsamer API-Teil der Engine-deps (Umzug aus home.js). Hülle, Hauptbundle; importiert nichts aus src/js/live.
// Enthält nur Jellyfin-Zugriffe (request/streamUrl/imageUrl/getBoxSetItems/loadTrailer/itemDetails/setPlayed/channelConfig).
// Design-spezifische Felder (leaveToLibrary, openThemePicker, onProgress …) ergänzt der jeweilige Aufrufer.
import * as api from '../../core/api.js';
import { loadLocalTrailer, trailerUrl } from '../../shared/trailer.js';
import { getChannelConfig } from './config.js';
import { zapVariant, forceHlsEnabled } from './zapflag.js';

const asItems = (res) => (Array.isArray(res) ? res : (res && Array.isArray(res.Items) ? res.Items : []));

/** Fehlertext ohne Schlüssel (api_key/ApiKey), max. 200 Zeichen. */
export function fatalText(err) {
  const m = err && err.message ? String(err.message) : '';
  return m.replace(/(api_key|ApiKey)=[^&\s]+/gi, '$1=…').slice(0, 200);
}

/** { id, name, isAdmin, audioLang, subLang, subMode } aus /Users/Me (Fehler → leere Felder). */
export async function loadUser() {
  const u = await Promise.resolve().then(() => api.getUser()).catch(() => null);
  const cfg = (u && u.Configuration) || {};
  return {
    id: (u && u.Id) || api.getUserId() || '',
    name: (u && u.Name) || '',
    isAdmin: Boolean(u && u.Policy && u.Policy.IsAdministrator),
    audioLang: cfg.AudioLanguagePreference || '',
    subLang: cfg.SubtitleLanguagePreference || '',
    subMode: cfg.SubtitleMode || '',
  };
}

/** localStorage oder null (gesperrt). */
function safeStorage() {
  try { return window.localStorage || null; } catch { return null; }
}

export function deviceId() {
  try {
    const c = window.ApiClient;
    return (c && typeof c.deviceId === 'function' && c.deviceId()) || '';
  } catch {
    return '';
  }
}

/** Gemeinsame Engine-deps: { catalog, user, server, request, streamUrl, imageUrl, getBoxSetItems, loadTrailer, itemDetails, setPlayed, channelConfig }. */
export function buildApiDeps(raw, user) {
  return {
    catalog: raw,
    user,
    server: { deviceId: deviceId() },
    request: (method, path, o = {}) => api.requestJson(method, path, o),
    storage: safeStorage(), // Player: dauerhaft gemerkte Direct-Fehler
    zapVariant: zapVariant(), // Player: Startvariante 0–3 (Hash lfxzap, docs/live.md „Startablauf“)
    forceHls: forceHlsEnabled(), // Player: HLS erzwingen (Hash lfxhls, nur mit Messanzeige)
    streamUrl: (path, params) => api.buildUrl(path, { ...(params || {}), ApiKey: api.getAuth().token }),
    imageUrl: (id, o = {}) => api.imageUrlFor(id, o),
    getBoxSetItems: async (id) => {
      const res = await api.getItems({ ParentId: id, Fields: '', EnableImages: false, EnableUserData: false });
      return asItems(res).map((x) => x.Id).filter(Boolean);
    },
    loadTrailer: async (itemId) => {
      try {
        const item = await api.getItem(itemId);
        const t = await loadLocalTrailer(item);
        if (!t) return null;
        const ticks = Number(t.RunTimeTicks);
        return { url: trailerUrl(t.Id), durMs: ticks > 0 ? Math.round(ticks / 10000) : null };
      } catch {
        return null;
      }
    },
    // Inhaltsangaben (Fernsehzeitung, TV-Modus): eine Anfrage, Fehler → leere Map
    itemDetails: async (ids) => {
      const out = new Map();
      const list = (Array.isArray(ids) ? ids : []).filter(Boolean);
      if (!list.length) return out;
      try {
        const res = await api.requestJson('GET', '/Items', {
          params: { userId: api.getUserId(), Ids: list.join(','), Fields: 'Overview', EnableImages: false, EnableUserData: false },
        });
        for (const it of asItems(res)) if (it && it.Id) out.set(it.Id, { overview: typeof it.Overview === 'string' ? it.Overview : '' });
      } catch (e) {
        console.warn('[LenzFlix] live itemDetails', fatalText(e));
      }
      return out;
    },
    setPlayed: (id, v) => api.setPlayed(id, v),
    channelConfig: getChannelConfig(),
  };
}
