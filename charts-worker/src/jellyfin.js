const TIMEOUT_MS = 15000;
const CHUNK = 100;

const base = (env) => String(env.JELLYFIN_URL).replace(/\/+$/, '');
const auth = (token) => `MediaBrowser Token="${token}"`;
export const normId = (v) => String(v ?? '').replace(/-/g, '').toLowerCase();

/** Wandelt die Plugin-Antwort ({colums, results}) in Objekte; Zahlen als Number. */
export function parseCustomQuery(json) {
  const cols = json?.colums ?? json?.columns;
  const results = json?.results;
  if (!Array.isArray(cols) || !Array.isArray(results)) return [];
  const [iId, iType, iUser, iPlays, iSecs, iAge] = ['ItemId', 'ItemType', 'UserId', 'plays', 'secs', 'age'].map((n) =>
    cols.indexOf(n),
  );
  if (iId < 0 || iType < 0 || iUser < 0) return [];
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  // Alter in Sekunden: Spalte fehlt -> undefined (Aufrufer), Zelle nicht als Zahl lesbar -> null.
  const toAge = (v) => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return results
    .filter(Array.isArray)
    .map((r) => ({
      itemId: normId(r[iId]),
      itemType: String(r[iType] ?? ''),
      userId: normId(r[iUser]),
      plays: iPlays >= 0 ? toNum(r[iPlays]) : 1,
      secs: iSecs >= 0 ? toNum(r[iSecs]) : 0,
      age: iAge >= 0 ? toAge(r[iAge]) : undefined,
    }));
}

export async function runCustomQuery(env, sql) {
  const res = await fetch(`${base(env)}/user_usage_stats/submit_custom_query`, {
    method: 'POST',
    headers: { Authorization: auth(env.JELLYFIN_API_KEY), 'Content-Type': 'application/json' },
    body: JSON.stringify({ CustomQueryString: sql, ReplaceUserId: false }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`custom query failed: HTTP ${res.status}`);
  return parseCustomQuery(await res.json());
}

/**
 * ID eines Administrator-Kontos (für Item-Abfragen mit Benutzerkontext, sieht alle Bibliotheken).
 * Robuster als /Items ohne userId, dessen Verhalten mit API-Key je nach Jellyfin-Version variiert.
 * Liefert null, wenn /Users nicht abrufbar ist – dann wird ohne userId abgefragt.
 */
export async function getAdminUserId(env) {
  try {
    const res = await fetch(`${base(env)}/Users`, {
      headers: { Authorization: auth(env.JELLYFIN_API_KEY) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const users = await res.json();
    const admin = Array.isArray(users) ? users.find((u) => u?.Policy?.IsAdministrator && !u?.Policy?.IsDisabled) : null;
    return admin?.Id ? normId(admin.Id) : null;
  } catch {
    return null;
  }
}

/** Episode-IDs -> Map<episodeId, seriesId> (in 100er-Blöcken). */
export async function resolveSeries(env, episodeIds) {
  const map = new Map();
  if (!episodeIds.length) return map;
  const userId = await getAdminUserId(env);
  const userParam = userId ? `&userId=${userId}` : '';
  for (let i = 0; i < episodeIds.length; i += CHUNK) {
    const ids = episodeIds.slice(i, i + CHUNK);
    const url = `${base(env)}/Items?Ids=${ids.join(',')}&Fields=SeriesId&EnableImages=false${userParam}`;
    const res = await fetch(url, {
      headers: { Authorization: auth(env.JELLYFIN_API_KEY) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`items lookup failed: HTTP ${res.status}`);
    const data = await res.json();
    for (const it of data?.Items ?? []) {
      if (it?.Id && it?.SeriesId) map.set(normId(it.Id), normId(it.SeriesId));
    }
  }
  return map;
}

/**
 * Film-IDs -> Map<normId, Laufzeit in Sekunden> (100er-Blöcke, höchstens 5 Blöcke = 500 Filme).
 * RunTimeTicks steckt standardmäßig im Item-DTO (kein Fields nötig). Jeder Fehler -> leere Map (Lauf bricht nie ab).
 */
export const RUNTIME_MAX_CHUNKS = 5;
export async function resolveRuntimes(env, movieIds) {
  const map = new Map();
  try {
    const all = movieIds.slice(0, CHUNK * RUNTIME_MAX_CHUNKS);
    if (!all.length) return map;
    const userId = await getAdminUserId(env);
    const userParam = userId ? `&userId=${userId}` : '';
    for (let i = 0; i < all.length; i += CHUNK) {
      const ids = all.slice(i, i + CHUNK);
      const url = `${base(env)}/Items?Ids=${ids.join(',')}&EnableImages=false${userParam}`;
      const res = await fetch(url, {
        headers: { Authorization: auth(env.JELLYFIN_API_KEY) },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`runtime lookup failed: HTTP ${res.status}`);
      const data = await res.json();
      for (const it of data?.Items ?? []) {
        const sec = Number(it?.RunTimeTicks) / 10_000_000;
        if (it?.Id && Number.isFinite(sec) && sec > 0) map.set(normId(it.Id), sec);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

/** true = gültig, false = ungültig (401/403), wirft bei Nichterreichbarkeit/5xx. */
export async function checkToken(env, token) {
  const res = await fetch(`${base(env)}/Users/Me`, {
    headers: { Authorization: auth(token) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 200) return true;
  if (res.status === 401 || res.status === 403) return false;
  throw new Error(`token check failed: HTTP ${res.status}`);
}

/* ---------- „Meine Statistik“ (nur Ergänzungen) ---------- */

const GUID_RE = /^[0-9a-f]{32}$/;

/**
 * Generisch: Plugin-Antwort ({colums|columns, results}) -> Objekte { Spaltenname: Wert }.
 * Werte bleiben unverändert (meist Strings); der Aufrufer wandelt. Kaputte Antwort -> [].
 */
export function parseRows(json) {
  const cols = json?.colums ?? json?.columns;
  const results = json?.results;
  if (!Array.isArray(cols) || !Array.isArray(results)) return [];
  return results.filter(Array.isArray).map((r) => {
    const o = {};
    cols.forEach((c, i) => {
      o[c] = r[i];
    });
    return o;
  });
}

/** Wie runCustomQuery, liefert aber generische Objekte. Wirft bei HTTP-Fehler/Nicht-JSON/fehlendem results. */
export async function runCustomQueryRows(env, sql) {
  const res = await fetch(`${base(env)}/user_usage_stats/submit_custom_query`, {
    method: 'POST',
    headers: { Authorization: auth(env.JELLYFIN_API_KEY), 'Content-Type': 'application/json' },
    body: JSON.stringify({ CustomQueryString: sql, ReplaceUserId: false }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`custom query failed: HTTP ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json?.results)) throw new Error('custom query: unexpected response');
  return parseRows(json);
}

/**
 * Eigene UserId aus /Users/Me (normalisiert). false bei 401/403.
 * Wirft bei Netzwerkfehler, 5xx, Nicht-JSON und 200 ohne gültige GUID in Id (Wartungsseite!).
 */
export async function getMe(env, token) {
  const res = await fetch(`${base(env)}/Users/Me`, {
    headers: { Authorization: auth(token) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403) return false;
  if (res.status !== 200) throw new Error(`users/me failed: HTTP ${res.status}`);
  const json = await res.json(); // wirft bei HTML
  const uid = normId(json?.Id);
  if (!GUID_RE.test(uid)) throw new Error('users/me: invalid Id');
  return uid;
}

/** Episode-IDs -> Map<episodeId, seriesId> mit dem NUTZER-Token (100er-Blöcke). Jede Antwort muss JSON sein. */
export async function resolveSeriesForUser(env, token, episodeIds) {
  const map = new Map();
  for (let i = 0; i < episodeIds.length; i += CHUNK) {
    const ids = episodeIds.slice(i, i + CHUNK);
    const url = `${base(env)}/Items?Ids=${ids.join(',')}&Fields=SeriesId&EnableImages=false`;
    const res = await fetch(url, {
      headers: { Authorization: auth(token) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`items lookup failed: HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.Items)) throw new Error('items lookup: unexpected response');
    for (const it of data.Items) {
      if (it?.Id && it?.SeriesId) map.set(normId(it.Id), normId(it.SeriesId));
    }
  }
  return map;
}

/**
 * Eigene Id, Name und Admin-Recht aus /Users/Me (Mehrspieler-Ticket); getMe bleibt unverändert.
 * false bei 401/403; wirft bei Netzwerkfehler, 5xx, Nicht-JSON und ungültiger Id.
 * Fehlt Policy in der Antwort, Rückfall GET /Users/{uid}; ohne Ergebnis admin=false.
 */
export async function getMeInfo(env, token) {
  const res = await fetch(`${base(env)}/Users/Me`, {
    headers: { Authorization: auth(token) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403) return false;
  if (res.status !== 200) throw new Error(`users/me failed: HTTP ${res.status}`);
  const json = await res.json(); // wirft bei HTML
  const uid = normId(json?.Id);
  if (!GUID_RE.test(uid)) throw new Error('users/me: invalid Id');
  const name = typeof json?.Name === 'string' ? json.Name : '';
  let policy = json?.Policy && typeof json.Policy === 'object' ? json.Policy : null;
  if (!policy) {
    try {
      const r2 = await fetch(`${base(env)}/Users/${uid}`, {
        headers: { Authorization: auth(token) },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (r2.status === 200) policy = (await r2.json())?.Policy ?? null;
    } catch {
      policy = null;
    }
  }
  return { uid, name, admin: policy?.IsAdministrator === true };
}
