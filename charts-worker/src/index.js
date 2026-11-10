import { aggregate } from './aggregate.js';
import { jsonResponse, preflight } from './http.js';
import { checkToken, resolveSeries, runCustomQuery } from './jellyfin.js';
import { handleMeStats } from './me-stats.js';
import { buildSql, windowDays } from './sql.js';

const KV_KEY = 'charts:v1';
const TOKEN_TTL_MS = 10 * 60 * 1000;
const NEG_TTL_MS = 60 * 1000;
const MAX_CACHE = 500;

/*
 * Token-Cache: Memory-Map mit TTL (pro Isolate) statt Cache API.
 * Begründung: Die Cache API greift nur auf Custom Domains/Zonen und ist nicht
 * ohne Weiteres testbar; die Map ist trivial, kostenlos und ohne I/O. Ein Cache-Miss
 * (neuer Isolate) kostet nur einen /Users/Me-Aufruf. Gespeichert wird nur der SHA-256-Hash.
 */
const tokenCache = new Map(); // hash -> { valid, exp }
export function clearTokenCache() {
  tokenCache.clear();
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** true/false; wirft, wenn Jellyfin nicht erreichbar ist. */
async function isTokenValid(env, token) {
  const hash = await sha256Hex(token);
  const now = Date.now();
  const hit = tokenCache.get(hash);
  if (hit && hit.exp > now) return hit.valid;
  const valid = await checkToken(env, token);
  if (tokenCache.size >= MAX_CACHE) {
    for (const [k, v] of tokenCache) if (v.exp <= now) tokenCache.delete(k);
    if (tokenCache.size >= MAX_CACHE) tokenCache.delete(tokenCache.keys().next().value);
  }
  // Ungültige Tokens nur kurz merken (schützt Jellyfin vor Wiederholungs-Anfragen).
  tokenCache.set(hash, { valid, exp: now + (valid ? TOKEN_TTL_MS : NEG_TTL_MS) });
  return valid;
}

export async function computeCharts(env) {
  const days = windowDays(env.WINDOW_DAYS);
  const rows = await runCustomQuery(env, buildSql(env.WINDOW_DAYS, env.MIN_SECONDS));
  const episodeIds = [...new Set(rows.filter((r) => r.itemType === 'Episode').map((r) => r.itemId))];
  const seriesByEpisode = episodeIds.length ? await resolveSeries(env, episodeIds) : new Map();
  const { movies, series, all } = aggregate(rows, seriesByEpisode);
  return {
    version: 1,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    windowDays: days,
    metric: 'viewers',
    movies,
    series,
    all,
  };
}

async function refresh(env) {
  const charts = await computeCharts(env);
  await env.CHARTS.put(KV_KEY, JSON.stringify(charts));
  return charts;
}

async function safeEqual(a, b) {
  const [x, y] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  return x === y;
}

async function handle(request, env, ctx) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === 'OPTIONS') return preflight(request, env);

  if ((pathname === '/me/stats' || pathname === '/lenzflix-stats/api/me/stats') && request.method === 'GET') {
    return handleMeStats(request, env, ctx);
  }

  if (pathname === '/health' && request.method === 'GET') {
    const data = await env.CHARTS.get(KV_KEY, 'json');
    return jsonResponse({ ok: true, generatedAt: data?.generatedAt ?? null }, 200, request, env);
  }

  if (pathname === '/charts' && request.method === 'GET') {
    const token = request.headers.get('X-Emby-Token');
    if (!token) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
    let valid;
    try {
      valid = await isTokenValid(env, token);
    } catch (err) {
      console.error('token check error:', err?.message);
      return jsonResponse({ error: 'upstream-unreachable' }, 502, request, env);
    }
    if (!valid) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
    const data = await env.CHARTS.get(KV_KEY, 'json');
    if (!data) return jsonResponse({ error: 'no-data' }, 503, request, env);
    return jsonResponse(data, 200, request, env, { 'Cache-Control': 'private, max-age=300' });
  }

  if (pathname === '/refresh' && request.method === 'POST') {
    const secret = request.headers.get('X-Refresh-Secret');
    if (!env.REFRESH_SECRET || !secret || !(await safeEqual(secret, env.REFRESH_SECRET))) {
      return jsonResponse({ error: 'unauthorized' }, 401, request, env);
    }
    try {
      const c = await refresh(env);
      return jsonResponse({ ok: true, generatedAt: c.generatedAt }, 200, request, env);
    } catch (err) {
      console.error('refresh error:', err?.message);
      return jsonResponse({ error: 'refresh-failed' }, 502, request, env);
    }
  }

  return jsonResponse({ error: 'not-found' }, 404, request, env);
}

export default {
  fetch(request, env, ctx) {
    return handle(request, env, ctx).catch((err) => {
      console.error('unhandled error:', err?.message);
      return jsonResponse({ error: 'internal' }, 500, request, env);
    });
  },

  async scheduled(_event, env, ctx) {
    const job = refresh(env).catch((err) => {
      // Altes KV-Ergebnis bleibt erhalten; keine Secrets loggen.
      console.error('cron refresh failed, keeping previous result:', err?.message);
    });
    ctx?.waitUntil?.(job);
    await job;
  },
};
