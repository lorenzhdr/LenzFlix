import { jsonResponse } from './http.js';
import { getMe, resolveSeriesForUser, runCustomQueryRows } from './jellyfin.js';
import {
  RANGES,
  ROW_CAP,
  buildQ1,
  buildQ2,
  buildQ2b,
  buildQ3,
  buildQ4,
  buildQ5a,
  buildQ5b,
  buildQ6a,
  buildQ6b,
  buildQ7,
  isRange,
} from './stats-sql.js';

const TOKEN_FRESH_MS = 10 * 60 * 1000;
const STATS_FRESH_MS = 5 * 60 * 1000;
const DAY_S = 24 * 60 * 60;
const CACHE_HOST = 'https://lfx-stats-cache.invalid';
const ID_RE = /^[0-9a-f]{32}$/;
const TOP_N = 10;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const normId = (v) => String(v ?? '').replace(/-/g, '').toLowerCase();

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- Cache API (Fehler sind nie fatal) ---------- */

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
    } catch (err) {
      console.error('stats cache put failed:', err?.message);
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

/* ---------- Auswertung ---------- */

const emptyMethods = () => ({
  directPlay: { plays: 0, seconds: 0 },
  directStream: { plays: 0, seconds: 0 },
  transcode: { plays: 0, seconds: 0 },
  other: { plays: 0, seconds: 0 },
});

function methodKey(m) {
  const s = String(m ?? '').toLowerCase();
  if (s.startsWith('directplay')) return 'directPlay';
  if (s.startsWith('directstream')) return 'directStream';
  if (s.startsWith('transcode')) return 'transcode';
  return 'other';
}

const ts = (v) => (v == null || v === '' ? null : String(v).slice(0, 19));
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

function base(range, extra) {
  return {
    version: 1,
    range,
    computedAt: now(),
    stale: false,
    approx: false,
    ignored: false,
    totals: { seconds: 0, plays: 0, episodes: 0, movies: 0, series: 0, activeDays: 0, firstAt: null, lastAt: null },
    topSeries: [],
    topMovies: [],
    timeline: { unit: RANGES[range].unit, buckets: [] },
    heatmap: [],
    binge: { topDay: null, seriesDay: null },
    devices: [],
    methods: emptyMethods(),
    compare: null,
    ...extra,
  };
}

async function compute(env, token, uid, range) {
  const [q1, q2, q2b, q3, q4, q5a, q5b, q6a, q6b, q7] = await Promise.all([
    runCustomQueryRows(env, buildQ1(uid, range)),
    runCustomQueryRows(env, buildQ2(uid, range)),
    runCustomQueryRows(env, buildQ2b(uid, range)),
    runCustomQueryRows(env, buildQ3(uid, range)),
    runCustomQueryRows(env, buildQ4(uid, range)),
    runCustomQueryRows(env, buildQ5a(uid, range)),
    runCustomQueryRows(env, buildQ5b(uid, range)),
    runCustomQueryRows(env, buildQ6a(uid, range)),
    runCustomQueryRows(env, buildQ6b(uid, range)),
    runCustomQueryRows(env, buildQ7(uid, range)),
  ]);

  const t = q1[0] ?? {};
  if (num(t.ignored) > 0) return base(range, { ignored: true });

  // Serien-Zuordnung: Union der Episoden aus Q2 und Q5b, nach Sekunden priorisiert, max. ROW_CAP.
  const secsById = new Map();
  const bump = (id, secs) => {
    if (ID_RE.test(id)) secsById.set(id, Math.max(secsById.get(id) ?? 0, secs));
  };
  const q2eps = q2.filter((r) => r.ItemType === 'Episode');
  for (const r of q2eps) bump(normId(r.ItemId), num(r.secs));
  for (const r of q5b) bump(normId(r.ItemId), num(r.secs));
  const epCountExact = num(q2b.find((r) => r.ItemType === 'Episode')?.n);
  const movieCount = num(q2b.find((r) => r.ItemType === 'Movie')?.n);
  let approx = epCountExact + movieCount > q2.length;
  if (q5b.length >= ROW_CAP) approx = true;
  let ids = [...secsById.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  if (ids.length > ROW_CAP) {
    ids = ids.slice(0, ROW_CAP);
    approx = true;
  }
  const seriesOf = ids.length ? await resolveSeriesForUser(env, token, ids) : new Map();

  // Top-Serien aus gezählten Folgen (Q2)
  const bySeries = new Map();
  for (const r of q2eps) {
    const sid = seriesOf.get(normId(r.ItemId));
    if (!sid) continue;
    const e = bySeries.get(sid) ?? { id: sid, seconds: 0, episodes: 0 };
    e.seconds += num(r.secs);
    e.episodes += 1;
    bySeries.set(sid, e);
  }
  const topSeries = [...bySeries.values()].sort((a, b) => b.seconds - a.seconds).slice(0, TOP_N);

  const topMovies = q2
    .filter((r) => r.ItemType === 'Movie' && ID_RE.test(normId(r.ItemId)))
    .slice(0, TOP_N)
    .map((r) => ({ id: normId(r.ItemId), seconds: num(r.secs), plays: num(r.plays) }));

  // Binge: meiste gezählte Folgen einer Serie an einem Tag
  const perDay = new Map();
  for (const r of q5b) {
    const sid = seriesOf.get(normId(r.ItemId));
    if (!sid) continue;
    const k = `${r.day}|${sid}`;
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  let seriesDay = null;
  for (const [k, episodes] of perDay) {
    const [date, seriesId] = k.split('|');
    if (!seriesDay || episodes > seriesDay.episodes || (episodes === seriesDay.episodes && date < seriesDay.date)) {
      seriesDay = { date, seriesId, episodes };
    }
  }
  const top = q5a[0];

  const methods = emptyMethods();
  for (const r of q6b) {
    const m = methods[methodKey(r.PlaybackMethod)];
    m.plays += num(r.plays);
    m.seconds += num(r.secs);
  }

  const seconds = num(t.secs);
  const c = q7[0];
  const n = num(c?.n);
  const compare =
    c && n >= 3 && seconds > 0
      ? { rank: 1 + num(c.ahead), of: n, avgSeconds: Math.round(num(c.avgSecs)) }
      : null;

  return base(range, {
    approx,
    totals: {
      seconds,
      plays: num(t.plays),
      episodes: epCountExact,
      movies: movieCount,
      series: bySeries.size,
      activeDays: num(t.activeDays),
      firstAt: ts(t.firstAt),
      lastAt: ts(t.lastAt),
    },
    topSeries,
    topMovies,
    timeline: { unit: RANGES[range].unit, buckets: q3.map((r) => ({ key: String(r.bucket), seconds: num(r.secs) })) },
    heatmap: q4.map((r) => ({ dow: num(r.dow), hour: num(r.hr), seconds: num(r.secs) })),
    binge: { topDay: top ? { date: String(top.day), seconds: num(top.secs) } : null, seriesDay },
    devices: q6a.map((r) => ({
      client: String(r.ClientName ?? ''),
      device: String(r.DeviceName ?? ''),
      plays: num(r.plays),
      seconds: num(r.secs),
    })),
    methods,
    compare,
  });
}

/* ---------- Token -> UserId ---------- */

/** { uid } | { status: 401 | 502 } */
async function resolveUid(env, token, ctx) {
  const key = `${CACHE_HOST}/tok/${await sha256Hex(token)}`;
  const cached = await cacheGet(key);
  if (cached && ID_RE.test(cached.uid ?? '') && Date.now() - num(cached.at) < TOKEN_FRESH_MS) {
    return { uid: cached.uid };
  }
  try {
    const uid = await getMe(env, token);
    if (uid === false) {
      if (cached) await cacheDelete(key);
      return { status: 401 };
    }
    await cachePut(key, { uid, at: Date.now() }, ctx);
    return { uid };
  } catch (err) {
    console.error('users/me error:', err?.message);
    // Fallback (24 h) nur bei Netz-/5xx-/Nicht-JSON-Fehlern, nie bei 401/403 (oben behandelt).
    if (cached && ID_RE.test(cached.uid ?? '')) return { uid: cached.uid };
    return { status: 502 };
  }
}

export async function handleMeStats(request, env, ctx) {
  try {
    const token = request.headers.get('X-Emby-Token');
    if (!token) return jsonResponse({ error: 'unauthorized' }, 401, request, env);

    const me = await resolveUid(env, token, ctx);
    if (me.status === 401) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
    if (me.status) return jsonResponse({ error: 'upstream-unreachable' }, 502, request, env);

    // Nur der range-Parameter wird gelesen; userId/uid/Body werden ignoriert.
    const range = new URL(request.url).searchParams.get('range') ?? '30d';
    if (!isRange(range)) return jsonResponse({ error: 'bad-range' }, 400, request, env);

    const key = `${CACHE_HOST}/stats/v1/${me.uid}/${range}`;
    const cached = await cacheGet(key);
    if (cached && cached.version === 1 && cached.range === range) {
      const age = Date.now() - Date.parse(cached.computedAt);
      if (age >= 0 && age < STATS_FRESH_MS) return jsonResponse(cached, 200, request, env);
    }

    let data;
    try {
      data = await compute(env, token, me.uid, range);
    } catch (err) {
      console.error('stats compute failed:', err?.message);
      if (cached && cached.version === 1 && cached.range === range) {
        return jsonResponse({ ...cached, stale: true }, 200, request, env);
      }
      return jsonResponse({ error: 'upstream-unreachable' }, 502, request, env);
    }
    await cachePut(key, data, ctx);
    return jsonResponse(data, 200, request, env);
  } catch (err) {
    console.error('me-stats error:', err?.message);
    return jsonResponse({ error: 'internal' }, 500, request, env);
  }
}
