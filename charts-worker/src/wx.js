import { resolveUser, sha256Hex } from './auth.js';
import { jsonResponse } from './http.js';

/*
 * GET /wx: aktuelles Wetter für die VIDEOTHEK (Header X-Emby-Token wie /charts).
 * Quelle: Open-Meteo Forecast-API. Daten: Open-Meteo.com, CC BY 4.0, nicht-kommerziell.
 * Ort über die Vars WX_LAT/WX_LON; fehlen sie, antwortet der Worker 404 wx-off (Client nutzt dann Zufall).
 * Die Antwort enthält nie Koordinaten, Höhe oder Zeitzone des Upstreams.
 */
const UPSTREAM = 'https://api.open-meteo.com/v1/forecast';
const FIELDS = 'weather_code,temperature_2m,precipitation,rain,showers,snowfall,snow_depth,visibility,cloud_cover,is_day';
const KV_KEY = 'wx:v1';
const FRESH_MS = 15 * 60 * 1000;
const STALE_MS = 2 * 60 * 60 * 1000;
const TIMEOUT_MS = 4000;
const FAIL_BACKOFF_MS = 60 * 1000; // nach Upstream-Fehler so lange kein neuer Abruf
const RATE_MAX_IP = 30;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_CAP = 500;

const rate = new Map(); // ip -> Zeitstempel[]
let mem = null; // { data, at }
let inflight = null; // geteilter Abruf (Upstream + mem + ein KV-Put)
let inflightAt = 0;
let failAt = 0; // Zeitpunkt des letzten Upstream-Fehlers
let kvMissAt = 0; // Isolate-Negativ-Cache: letzter KV-Lesezugriff ohne frischen Wert (nur während eines Ausfalls)
const KV_MISS_MS = 15 * 1000;
const SHARE_MAX_MS = TIMEOUT_MS + 1000; // so lange wartet niemand auf einen geteilten Abruf
export function clearWxCache() {
  failAt = 0;
  kvMissAt = 0;
  inflightAt = 0;
  rate.clear();
  mem = null;
  inflight = null;
}

function rateHit(key, now) {
  let list = rate.get(key);
  if (!list) {
    if (rate.size >= RATE_CAP) {
      for (const [k, v] of rate) if (!v.length || now - v[v.length - 1] >= RATE_WINDOW_MS) rate.delete(k);
      if (rate.size >= RATE_CAP) rate.delete(rate.keys().next().value);
    }
    list = [];
    rate.set(key, list);
  }
  while (list.length && now - list[0] >= RATE_WINDOW_MS) list.shift();
  if (list.length >= RATE_MAX_IP) return false;
  list.push(now);
  return true;
}

// WMO-Code -> [Art, Intensität]
const WMO = {
  0: ['clear', 0], 1: ['clear', 0], 2: ['clear', 0], 3: ['cloudy', 0],
  45: ['fog', 0], 48: ['fog', 0],
  51: ['drizzle', 0.25], 53: ['drizzle', 0.35], 55: ['drizzle', 0.45], 56: ['drizzle', 0.35], 57: ['drizzle', 0.45],
  61: ['rain', 0.5], 63: ['rain', 0.75], 65: ['heavy', 1], 66: ['rain', 0.6], 67: ['heavy', 0.9],
  80: ['rain', 0.45], 81: ['rain', 0.75], 82: ['heavy', 1],
  71: ['snow', 0.35], 73: ['snow', 0.65], 75: ['snow', 1], 77: ['snow', 0.3], 85: ['snow', 0.5], 86: ['snow', 0.9],
  95: ['storm', 0.8], 96: ['storm', 1], 99: ['storm', 1],
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Upstream-JSON -> schlankes Schema; null bei unbrauchbarer Antwort. Reicht nie Ortsfelder durch. */
export function normalizeWx(json, nowMs) {
  const c = json && typeof json === 'object' ? json.current : null;
  if (!c || typeof c !== 'object') return null;
  const code = num(c.weather_code);
  if (code === null) return null; // ohne Wettercode keine gültige Antwort (kein erfundenes 'klar')
  const [k, i] = WMO[code] ?? ['clear', 0];
  const vis = num(c.visibility);
  let fog = vis === null ? 0 : vis < 1000 ? 1 : vis < 4000 ? (4000 - vis) / 3000 : 0;
  if (code === 45 || code === 48) fog = Math.max(fog, 0.8);
  const sd = num(c.snow_depth);
  const t = num(c.temperature_2m);
  const parsed = typeof c.time === 'string' ? Date.parse(c.time.length === 16 ? c.time + ':00Z' : c.time) : NaN;
  return {
    v: 1,
    k,
    i,
    sd: sd === null ? 0 : Math.round(Math.max(0, sd) * 100) / 100,
    fog: Math.round(Math.min(1, Math.max(0, fog)) * 100) / 100,
    t: t === null ? null : Math.round(t), // fehlende Temperatur bleibt fehlend (Client: unbekannt)
    day: c.is_day === 0 ? 0 : 1,
    ts: Number.isFinite(parsed) ? parsed : nowMs,
  };
}

export function wxCoords(env) {
  const parse = (s, lim) => {
    if (typeof s !== 'string' || !s.trim()) return null;
    const n = Number(s);
    return Number.isFinite(n) && Math.abs(n) <= lim ? n : null;
  };
  const lat = parse(env?.WX_LAT, 90);
  const lon = parse(env?.WX_LON, 180);
  return lat === null || lon === null ? null : { lat, lon };
}

async function fetchUpstream(co) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `${UPSTREAM}?latitude=${co.lat}&longitude=${co.lon}&current=${FIELDS}&timezone=UTC`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return normalizeWx(await res.json(), Date.now());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function kvGet(env) {
  try {
    const v = await env.CHARTS.get(KV_KEY, 'json');
    return v && v.data && Number.isFinite(v.at) ? v : null;
  } catch {
    return null;
  }
}

/** Ein Abruf für alle Wartenden: Upstream, mem und genau ein KV-Put; Daten oder null. */
async function refresh(env, co) {
  const data = await fetchUpstream(co);
  if (!data) {
    failAt = Date.now();
    return null;
  }
  failAt = 0;
  mem = { data, at: Date.now() };
  try {
    await env.CHARTS.put(KV_KEY, JSON.stringify(mem));
  } catch {
    console.error('wx: kv-put');
  }
  return data;
}

function shareRefresh(env, co, ctx) {
  if (inflight && Date.now() - inflightAt > SHARE_MAX_MS) inflight = null; // hängender Abruf (z. B. nach Client-Abbruch) blockiert nicht dauerhaft
  if (!inflight) {
    inflightAt = Date.now();
    const p = refresh(env, co).finally(() => {
      if (inflight === p) inflight = null;
    });
    inflight = p;
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p.catch(() => {})); // läuft auch nach Client-Abbruch zu Ende
  }
  const p = inflight;
  let timer;
  const limit = new Promise((res) => {
    timer = setTimeout(() => res(null), SHARE_MAX_MS);
  });
  return Promise.race([p.catch(() => null), limit]).finally(() => clearTimeout(timer));
}

/** { data, stale } | null */
async function getWx(env, co, now, ctx) {
  if (mem && now - mem.at < FRESH_MS) return { data: mem.data, stale: false };
  const backoff = failAt > 0 && now - failAt >= 0 && now - failAt < FAIL_BACKOFF_MS;
  const skipKv = backoff && (mem || (kvMissAt > 0 && now - kvMissAt >= 0 && now - kvMissAt < KV_MISS_MS));
  const kv = skipKv ? null : await kvGet(env);
  if (kv && now - kv.at < FRESH_MS) {
    mem = kv;
    return { data: kv.data, stale: false };
  }
  if (!skipKv) kvMissAt = backoff ? now : 0;
  if (kv && (!mem || kv.at > mem.at)) mem = kv; // veralteten KV-Wert mit seinem echten Alter übernehmen (spart KV-Lesen im Ausfall)
  let data = null;
  if (!backoff) {
    data = await shareRefresh(env, co, ctx);
    if (!data && !(failAt > 0 && Date.now() - failAt < FAIL_BACKOFF_MS)) failAt = Date.now(); // Wartezeit-Überschreitung zählt als Fehler
  }
  if (data) return { data, stale: false };
  const old = [mem, kv].filter(Boolean).sort((a, b) => b.at - a.at)[0];
  if (old && now - old.at < STALE_MS) return { data: old.data, stale: true };
  return null;
}

export async function handleWx(request, env, ctx) {
  const co = wxCoords(env);
  if (!co) return jsonResponse({ error: 'wx-off' }, 404, request, env);
  const token = request.headers.get('X-Emby-Token');
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
  const now = Date.now();
  // IP-Limit bewusst VOR der Anmeldeprüfung (kostet keinen Jellyfin-Aufruf); fehlt CF-Connecting-IP (lokal/Dev), gilt der gemeinsame Rückfallschlüssel 'noip'.
  const ip = request.headers.get('CF-Connecting-IP') || 'noip';
  if (!rateHit('ip:' + (await sha256Hex(ip)), now)) return jsonResponse({ error: 'rate' }, 429, request, env);
  const user = await resolveUser(env, token, ctx);
  if (user.status === 401) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
  if (user.status) return jsonResponse({ error: 'upstream-unreachable' }, 502, request, env);
  const r = await getWx(env, co, now, ctx);
  if (!r) return jsonResponse({ error: 'wx-down' }, 503, request, env);
  const body = r.stale ? { ...r.data, stale: 1 } : r.data;
  return jsonResponse(body, 200, request, env, { 'Cache-Control': 'private, max-age=300' });
}
