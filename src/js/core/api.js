// LenzFlix: Zugriff auf die Jellyfin-API (window.ApiClient, Fallback: localStorage.jellyfin_credentials).
// Sicherheit: Das Access-Token wird nie geloggt und taucht in keiner Fehlermeldung auf.

function readStoredServer() {
  try {
    const raw = JSON.parse(window.localStorage.getItem('jellyfin_credentials') || 'null');
    const servers = (raw && raw.Servers) || [];
    return servers.find((s) => s && s.AccessToken && s.UserId) || servers[0] || null;
  } catch {
    return null;
  }
}

function call(client, name) {
  return client && typeof client[name] === 'function' ? client[name]() : undefined;
}

function trimSlash(s) {
  return String(s || '').replace(/\/+$/, '');
}

/** Interner Auth-Zustand. Enthält das Token: niemals ausgeben/loggen. */
export function getAuth() {
  const client = window.ApiClient;
  const stored = readStoredServer();
  const address = trimSlash(call(client, 'serverAddress') || (stored && (stored.ManualAddress || stored.LocalAddress)) || '');
  const userId = call(client, 'getCurrentUserId') || (stored && stored.UserId) || null;
  const token = call(client, 'accessToken') || (stored && stored.AccessToken) || null;
  const serverId = call(client, 'serverId') || (stored && stored.Id) || null;
  return { address, userId, token, serverId };
}

export function getUserId() {
  return getAuth().userId;
}

export function isReady() {
  const a = getAuth();
  return Boolean(a.userId && a.token);
}

function toQuery(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export function buildUrl(path, params) {
  const { address } = getAuth();
  return `${address}${path.startsWith('/') ? '' : '/'}${path}${toQuery(params)}`;
}

/** GET JSON. Bevorzugt fetch mit Authorization-Header, sonst ApiClient.ajax. */
export async function getJson(path, params, { signal } = {}) {
  const { token, address } = getAuth();
  if (token && typeof fetch === 'function') {
    const res = await fetch(buildUrl(path, params), {
      headers: { Authorization: `MediaBrowser Token="${token}"`, Accept: 'application/json' },
      signal,
    });
    if (!res.ok) throw new Error(`LenzFlix API: HTTP ${res.status} für ${path}`);
    return res.status === 204 ? null : res.json();
  }
  const client = window.ApiClient;
  if (client && typeof client.ajax === 'function') {
    const url = typeof client.getUrl === 'function' ? client.getUrl(path, params || {}) : `${address}${path}${toQuery(params)}`;
    return client.ajax({ type: 'GET', url, dataType: 'json' });
  }
  throw new Error('LenzFlix API: kein ApiClient/Token verfügbar');
}

export function getItems(params) {
  return getJson('/Items', { userId: getUserId(), ...params });
}

export function getItem(id, params) {
  return getJson(`/Users/${getUserId()}/Items/${id}`, params);
}

/** /Items/Latest liefert ein Array (kein {Items}). */
export function getLatest(params) {
  return getJson('/Items/Latest', { userId: getUserId(), ...params });
}

export function getResume(params) {
  return getJson('/UserItems/Resume', { userId: getUserId(), ...params });
}

export function getNextUp(params) {
  return getJson('/Shows/NextUp', { userId: getUserId(), ...params });
}

export function getSeasons(seriesId, params) {
  return getJson(`/Shows/${seriesId}/Seasons`, { userId: getUserId(), ...params });
}

export function getEpisodes(seriesId, params) {
  return getJson(`/Shows/${seriesId}/Episodes`, { userId: getUserId(), ...params });
}

export function getSimilar(id, params) {
  return getJson(`/Items/${id}/Similar`, { userId: getUserId(), ...params });
}

export function getViews() {
  return getJson('/UserViews', { userId: getUserId() });
}

export async function setFavorite(id, isFavorite) {
  const client = window.ApiClient;
  const userId = getUserId();
  if (client && typeof client.updateFavoriteStatus === 'function') {
    return client.updateFavoriteStatus(userId, id, Boolean(isFavorite));
  }
  const { token } = getAuth();
  const res = await fetch(buildUrl(`/Users/${userId}/FavoriteItems/${id}`), {
    method: isFavorite ? 'POST' : 'DELETE',
    headers: { Authorization: `MediaBrowser Token="${token}"` },
  });
  if (!res.ok) throw new Error(`LenzFlix API: HTTP ${res.status} (Favorit)`);
  return res.json();
}

/** Gesehen-Status setzen (POST) oder zurücknehmen (DELETE). */
export async function setPlayed(id, played) {
  const userId = getUserId();
  const { token } = getAuth();
  const res = await fetch(buildUrl(`/Users/${userId}/PlayedItems/${id}`), {
    method: played ? 'POST' : 'DELETE',
    headers: { Authorization: `MediaBrowser Token="${token}"` },
  });
  if (!res.ok) throw new Error(`LenzFlix API: HTTP ${res.status} (Gesehen)`);
}

// ---------------------------------------------------------------- Bilder

function first(arr) {
  return Array.isArray(arr) && arr.length ? arr[0] : null;
}

/** Bild-URL für eine konkrete Item-Id + Typ. */
export function imageUrlFor(id, { type = 'Primary', maxWidth, maxHeight, quality = 90, tag } = {}) {
  if (!id) return null;
  return buildUrl(`/Items/${id}/Images/${type}`, { maxWidth, maxHeight, quality, tag });
}

/** Eigenes Bild des Items (ImageTags bzw. Backdrop-Tags). Null, wenn nicht vorhanden. */
export function imageUrl(item, { type = 'Primary', maxWidth, maxHeight, quality = 90 } = {}) {
  if (!item) return null;
  const tag = type === 'Backdrop' ? first(item.BackdropImageTags) : item.ImageTags && item.ImageTags[type];
  if (!tag) return null;
  return imageUrlFor(item.Id, { type, maxWidth, maxHeight, quality, tag });
}

/**
 * Wählt das beste Querformat-Bild. Reihenfolge:
 * Thumb -> Backdrop -> Eltern-Thumb -> Eltern-Backdrop -> Primary -> Serien-Primary.
 * Rückgabe: {id, type, tag} oder null.
 */
export function pickLandscape(item) {
  if (!item) return null;
  const tags = item.ImageTags || {};
  const candidates = [
    [item.Id, 'Thumb', tags.Thumb],
    [item.Id, 'Backdrop', first(item.BackdropImageTags)],
    [item.ParentThumbItemId, 'Thumb', item.ParentThumbImageTag],
    [item.ParentBackdropItemId, 'Backdrop', first(item.ParentBackdropImageTags)],
    [item.Id, 'Primary', tags.Primary],
    [item.SeriesId, 'Primary', item.SeriesPrimaryImageTag],
  ];
  for (const [id, type, tag] of candidates) {
    if (id && tag) return { id, type, tag };
  }
  return null;
}

export function landscapeImage(item, { maxWidth = 780, quality = 85 } = {}) {
  const pick = pickLandscape(item);
  return pick ? imageUrlFor(pick.id, { ...pick, maxWidth, quality }) : null;
}

export function logoImage(item, { maxWidth = 500, quality = 90 } = {}) {
  if (!item) return null;
  const own = item.ImageTags && item.ImageTags.Logo;
  if (own) return imageUrlFor(item.Id, { type: 'Logo', tag: own, maxWidth, quality });
  if (item.ParentLogoItemId && item.ParentLogoImageTag) {
    return imageUrlFor(item.ParentLogoItemId, { type: 'Logo', tag: item.ParentLogoImageTag, maxWidth, quality });
  }
  return null;
}

// ---------------------------------------------------------------- Benutzer

const userCache = new Map();

/** Aktueller Benutzer (inkl. Policy), pro userId gecacht. Fehler -> null. */
export async function getUser() {
  const userId = getUserId();
  if (!userId) return null;
  if (userCache.has(userId)) return userCache.get(userId);
  try {
    const client = window.ApiClient;
    const user =
      client && typeof client.getCurrentUser === 'function' ? await client.getCurrentUser() : await getJson(`/Users/${userId}`);
    if (!user) return null;
    userCache.set(userId, user);
    return user;
  } catch {
    return null;
  }
}
