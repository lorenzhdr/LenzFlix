import { getMeInfo } from './jellyfin.js';

/*
 * resolveUser(env, token, ctx) -> {uid, name, admin} | {status: 401|502}
 * Cache-API-Schlüssel tok2/<sha256(token)> ({uid,name,admin,at}); frisch 10 min, Rückfall bis 24 h nur bei
 * 5xx/Netzfehlern und dann immer admin=false. Fehlversuche (401) werden 60 s im Isolate gemerkt.
 * Eigenständig: me-stats.js (resolveUid, Schlüssel tok/) bleibt unangetastet.
 */
const FRESH_MS = 10 * 60 * 1000;
const NEG_TTL_MS = 60 * 1000;
const NEG_MAX = 500;
const DAY_S = 24 * 60 * 60;
const CACHE_HOST = 'https://lfx-stats-cache.invalid';
const ID_RE = /^[0-9a-f]{32}$/;

const negCache = new Map(); // hash -> exp
export function clearAuthCache() {
  negCache.clear();
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const cacheStore = () => {
  try {
    return typeof caches !== 'undefined' ? caches.default : null;
  } catch {
    return null;
  }
};

async function cacheGet(key) {
  try {
    const c = cacheStore();
    if (!c) return null;
    const res = await c.match(new Request(key));
    return res ? await res.json() : null;
  } catch {
    return null;
  }
}

function cachePut(key, value, ctx) {
  const job = (async () => {
    try {
      const c = cacheStore();
      if (!c) return;
      await c.put(
        new Request(key),
        new Response(JSON.stringify(value), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${DAY_S}` },
        }),
      );
    } catch {
      console.error('auth: cache-put');
    }
  })();
  if (ctx?.waitUntil) {
    ctx.waitUntil(job);
    return Promise.resolve();
  }
  return job;
}

async function cacheDelete(key) {
  try {
    await cacheStore()?.delete(new Request(key));
  } catch {
    /* ignorieren */
  }
}

function negRemember(hash, now) {
  if (negCache.size >= NEG_MAX) {
    for (const [k, exp] of negCache) if (exp <= now) negCache.delete(k);
    if (negCache.size >= NEG_MAX) negCache.delete(negCache.keys().next().value);
  }
  negCache.set(hash, now + NEG_TTL_MS);
}

export async function resolveUser(env, token, ctx) {
  const hash = await sha256Hex(token);
  const now = Date.now();
  const neg = negCache.get(hash);
  if (neg && neg > now) return { status: 401 };

  const key = `${CACHE_HOST}/tok2/${hash}`;
  const cached = await cacheGet(key);
  const valid = !!cached && ID_RE.test(cached.uid ?? '') && typeof cached.name === 'string';
  if (valid && now - (Number(cached.at) || 0) < FRESH_MS) {
    return { uid: cached.uid, name: cached.name, admin: cached.admin === true };
  }
  try {
    const me = await getMeInfo(env, token);
    if (me === false) {
      if (cached) await cacheDelete(key);
      negRemember(hash, now);
      return { status: 401 };
    }
    await cachePut(key, { uid: me.uid, name: me.name, admin: me.admin, at: now }, ctx);
    return me;
  } catch {
    console.error('auth: users-me');
    // Rückfall (24 h) nur bei Netz-/5xx-/Nicht-JSON-Fehlern, nie bei 401/403; nie mit Admin-Recht.
    if (valid) return { uid: cached.uid, name: cached.name, admin: false };
    return { status: 502 };
  }
}
