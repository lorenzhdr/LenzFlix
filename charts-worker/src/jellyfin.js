const TIMEOUT_MS = 15000;
const CHUNK = 100;

const base = (env) => String(env.JELLYFIN_URL).replace(/\/+$/, '');
const auth = (token) => `MediaBrowser Token="${token}"`;
const normId = (v) => String(v ?? '').replace(/-/g, '').toLowerCase();

/** Wandelt die Plugin-Antwort ({colums, results}) in Objekte; Zahlen als Number. */
export function parseCustomQuery(json) {
  const cols = json?.colums ?? json?.columns;
  const results = json?.results;
  if (!Array.isArray(cols) || !Array.isArray(results)) return [];
  const [iId, iType, iUser, iPlays, iSecs] = ['ItemId', 'ItemType', 'UserId', 'plays', 'secs'].map((n) =>
    cols.indexOf(n),
  );
  if (iId < 0 || iType < 0 || iUser < 0) return [];
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return results
    .filter(Array.isArray)
    .map((r) => ({
      itemId: normId(r[iId]),
      itemType: String(r[iType] ?? ''),
      userId: normId(r[iUser]),
      plays: iPlays >= 0 ? toNum(r[iPlays]) : 1,
      secs: iSecs >= 0 ? toNum(r[iSecs]) : 0,
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
