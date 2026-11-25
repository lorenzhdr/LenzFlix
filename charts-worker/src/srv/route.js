// Routen unter /srv: Anmeldung, Limits, Probe. Die Inhalte kommen aus now.js, month.js, server.js, report.js.
import { resolveUser, sha256Hex } from '../auth.js';
import { jsonResponse } from '../http.js';
import { runDaily } from './daily.js';
import { getMonth, getMonthMeta } from './month.js';
import { getNow } from './now.js';
import { makeLimiter } from './rate.js';
import { handleReport } from './report.js';
import { getServer, readSrvKv } from './server.js';

/** Cron-Slot des Server-Statistik-Laufs (wrangler.jsonc). */
export const SRV_CRON = '23 */6 * * *';

const PROBE_MS = 60 * 1000;
const REPORT_FRESH_MS = 7 * 24 * 3600 * 1000;

// Token- und IP-Grenzen je Minute (PLAN: API-Verträge)
const LIMITS = {
  probe: { token: 20, ip: 60 },
  now: { token: 12, ip: 60 },
  month: { token: 30, ip: 90 },
  server: { token: 12, ip: 60 },
};
const limiters = Object.fromEntries(
  Object.entries(LIMITS).map(([k, v]) => [k, { token: makeLimiter({ max: v.token }), ip: makeLimiter({ max: v.ip }) }]),
);
let probeCache = null;

export function clearSrvRoute() {
  for (const l of Object.values(limiters)) {
    l.token.clear();
    l.ip.clear();
  }
  probeCache = null;
}

async function probe(env, ctx, now) {
  if (probeCache && now - probeCache.at >= 0 && now - probeCache.at < PROBE_MS) return probeCache.body;
  const tabs = ['now', 'month'];
  const kv = await readSrvKv(env, now);
  const at = kv?.report?.at;
  if ((Number.isFinite(at) && now - at < REPORT_FRESH_MS) || kv?.daily) tabs.push('server');
  let maxM = 0;
  try {
    const meta = await getMonthMeta(env, ctx);
    if (Number.isFinite(meta?.maxM)) maxM = meta.maxM;
  } catch {
    /* Probe scheitert nie am Server */
  }
  const body = { v: 1, tabs, maxM };
  probeCache = { at: now, body };
  return body;
}

async function safeEqual(a, b) {
  const [x, y] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  return x === y;
}

async function refresh(request, env, url) {
  const secret = request.headers.get('X-Refresh-Secret');
  if (!env.REFRESH_SECRET || !secret || !(await safeEqual(secret, env.REFRESH_SECRET))) {
    return jsonResponse({ error: 'unauthorized' }, 401, request, env);
  }
  try {
    const r = await runDaily(env, { full: url.searchParams.get('full') === '1' });
    if (r?.ok) return jsonResponse({ ok: true }, 200, request, env);
    return jsonResponse({ error: 'refresh-failed', code: r?.code ?? null }, 502, request, env);
  } catch {
    console.error('srv: refresh');
    return jsonResponse({ error: 'refresh-failed' }, 502, request, env);
  }
}

export async function routeSrv(request, env, ctx, url) {
  const p = url.pathname;
  if (p !== '/srv' && !p.startsWith('/srv/')) return null;
  const method = request.method;

  if (p === '/srv/report') {
    if (method !== 'POST') return jsonResponse({ error: 'method' }, 405, request, env);
    return handleReport(request, env, ctx);
  }
  if (p === '/srv/refresh') {
    if (method !== 'POST') return jsonResponse({ error: 'method' }, 405, request, env);
    return refresh(request, env, url);
  }

  const kind = p === '/srv' ? 'probe' : p === '/srv/now' ? 'now' : p === '/srv/month' ? 'month' : p === '/srv/server' ? 'server' : null;
  if (!kind) return jsonResponse({ error: 'not-found' }, 404, request, env);
  if (method !== 'GET') return jsonResponse({ error: 'method' }, 405, request, env);

  const token = request.headers.get('X-Emby-Token');
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
  const now = Date.now();
  const lim = limiters[kind];
  // IP-Limit vor der Anmeldung (kostet keinen Jellyfin-Aufruf); ohne CF-Connecting-IP gilt der gemeinsame Schlüssel 'noip'.
  const ip = request.headers.get('CF-Connecting-IP') || 'noip';
  if (!lim.ip.hit('ip:' + (await sha256Hex(ip)), now)) return jsonResponse({ error: 'rate' }, 429, request, env);
  const user = await resolveUser(env, token, ctx);
  if (user.status === 401) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
  if (user.status) return jsonResponse({ error: 'upstream-unreachable' }, 502, request, env);
  if (!lim.token.hit(await sha256Hex(token), now)) return jsonResponse({ error: 'rate' }, 429, request, env);

  if (kind === 'probe') return jsonResponse(await probe(env, ctx, now), 200, request, env);
  if (kind === 'now') {
    let body;
    try {
      body = await getNow(env, ctx, user, token);
    } catch {
      body = { v: 1, down: 1 };
    }
    return jsonResponse(body, 200, request, env, { 'Cache-Control': 'no-store' });
  }
  if (kind === 'month') {
    const r = await getMonth(env, ctx, url.searchParams.get('m') ?? '0');
    return jsonResponse(r.body, r.status, request, env);
  }
  return jsonResponse(await getServer(env, ctx), 200, request, env, { 'Cache-Control': 'no-store' });
}
