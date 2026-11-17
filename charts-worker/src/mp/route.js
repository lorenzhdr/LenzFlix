import { resolveUser, sha256Hex } from '../auth.js';
import { jsonResponse } from '../http.js';
import { b64urlJson, hasSecret, mintTicket, verifyTicket } from './ticket.js';

const PROTO = 'lfx-mp.1';
const RATE_MAX = 6;
/** Zusätzlich je Client-IP (zufällige Tokens umgehen das Token-Limit, jeder Fehlversuch kostet einen Jellyfin-Aufruf). */
const RATE_MAX_IP = 30;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_CAP = 500;

const rate = new Map(); // tokenHash -> Zeitstempel[]
export function clearMpRate() {
  rate.clear();
}

export function mpEnabled(env) {
  return hasSecret(env?.MP_SECRET) && !!env?.WORLD && typeof env.WORLD.idFromName === 'function';
}

function rateHit(hash, now, max = RATE_MAX) {
  let list = rate.get(hash);
  if (!list) {
    if (rate.size >= RATE_CAP) {
      for (const [k, v] of rate) if (!v.length || now - v[v.length - 1] >= RATE_WINDOW_MS) rate.delete(k);
      if (rate.size >= RATE_CAP) rate.delete(rate.keys().next().value);
    }
    list = [];
    rate.set(hash, list);
  }
  while (list.length && now - list[0] >= RATE_WINDOW_MS) list.shift();
  if (list.length >= max) return false;
  list.push(now);
  return true;
}

/** GET /mp/ticket (Header X-Emby-Token). */
export async function handleTicket(request, env, ctx) {
  if (!mpEnabled(env)) return jsonResponse({ error: 'mp-disabled' }, 503, request, env);
  const token = request.headers.get('X-Emby-Token');
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
  const now = Date.now();
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip && !rateHit('ip:' + ip, now, RATE_MAX_IP)) return jsonResponse({ error: 'rate' }, 429, request, env);
  if (!rateHit(await sha256Hex(token), now)) return jsonResponse({ error: 'rate' }, 429, request, env);
  const user = await resolveUser(env, token, ctx);
  if (user.status === 401) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
  if (user.status) return jsonResponse({ error: 'upstream-unreachable' }, 502, request, env);
  const { tk, exp } = await mintTicket(env.MP_SECRET, user, now);
  return jsonResponse({ v: 1, tk, exp, url: '/mp', pv: [1], s: now }, 200, request, env);
}

function originAllowed(origin, env) {
  if (!origin) return false;
  if (env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN) return true;
  const dev = String(env.MP_DEV_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('https://'));
  return dev.includes(origin);
}

const plain = (status, text) => new Response(text, { status, headers: { 'Cache-Control': 'no-store' } });

/** GET /mp (WebSocket-Upgrade). Prüfreihenfolge nach Vertrag §2.2. */
export async function handleUpgrade(request, env) {
  if (!mpEnabled(env)) return jsonResponse({ error: 'mp-disabled' }, 503, request, env);
  if ((request.headers.get('Upgrade') ?? '').toLowerCase() !== 'websocket') return plain(426, 'upgrade required');
  if (!originAllowed(request.headers.get('Origin'), env)) return plain(403, 'forbidden');
  const protos = (request.headers.get('Sec-WebSocket-Protocol') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!protos.includes(PROTO)) return plain(426, 'protocol required');
  const entry = protos.find((p) => p.startsWith('t.'));
  const claims = entry ? await verifyTicket(env.MP_SECRET, entry.slice(2), Date.now()) : null;
  if (!claims) return plain(401, 'unauthorized');

  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.toLowerCase().startsWith('x-lfx-')) headers.delete(name);
  headers.set('X-Lfx-Claims', b64urlJson({ k: claims.k, n: claims.n, a: claims.a, e: claims.e, j: claims.j }));
  try {
    const stub = env.WORLD.get(env.WORLD.idFromName('world'));
    return await stub.fetch(new Request(request, { headers }));
  } catch {
    console.error('mp: do-fetch');
    return plain(503, 'unavailable');
  }
}
