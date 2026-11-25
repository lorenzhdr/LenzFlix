// Tageslauf und Cron-Slot der Server-Statistik.
// Slot (alle 6 h): (a) Tageslauf, wenn der letzte Erfolg älter als 20 h ist, (b) ein Bibliotheks-Abschnitt.
// Höchstens 30 Subrequests je Slot (Tageslauf <= 18, Bibliothek <= 3, KV-Zugriffe eingerechnet). Nichts loggt Namen oder IDs.
import { getAdminUserId, normId, resolveSeries, runCustomQueryRows } from '../jellyfin.js';
import { getMonthMeta } from './month.js';
import {
  CONC_ROW_CAP,
  buildBingeCandidates,
  buildBingeEpisodes,
  buildConc,
  buildConcRows,
  buildRecDay,
  buildRecMonth,
} from './sql.js';

export const DAILY_KEY = 'srv:daily:v1';
export const LIB_KEY = 'srv:lib:v1';
const DAILY_STALE_MS = 20 * 3600 * 1000;
const LIB_RESTART_MS = 20 * 3600 * 1000;
const LIB_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const LIB_CHUNK = 2000;
const NEW_PAGE = 200;
const NEW_PAGES = 3;
const TIMEOUT_MS = 15000;
const SERIES_IDS_MAX = 300; // 3 Blöcke à 100

const base = (env) => String(env.JELLYFIN_URL).replace(/\/+$/, '');
const authHeaders = (env) => ({ Authorization: `MediaBrowser Token="${env.JELLYFIN_API_KEY}"` });
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function jfGet(env, path) {
  const res = await fetch(`${base(env)}${path}`, { headers: authHeaders(env), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`jf ${res.status}`);
  return res.json();
}

async function kvGet(env, key) {
  try {
    return (await env.CHARTS?.get(key, 'json')) ?? null;
  } catch {
    return null;
  }
}

/** Admin-Konto-ID einmal je Lauf (memoisiert über das gemeinsame Objekt). */
function adminParam(env, shared) {
  shared.admin ??= getAdminUserId(env).catch(() => null);
  return shared.admin.then((id) => (id ? `&userId=${id}` : ''));
}

/* ---------- Bibliothek: Zähler und Neuzugänge ---------- */

const utcMs = (s) => {
  const t = Date.parse(`${String(s).slice(0, 10)}T${String(s).slice(11, 19) || '00:00:00'}Z`);
  return Number.isFinite(t) ? t : NaN;
};

async function fetchCounts(env) {
  const c = await jfGet(env, '/Items/Counts');
  return { movies: num(c?.MovieCount), series: num(c?.SeriesCount), episodes: num(c?.EpisodeCount) };
}

async function fetchNew(env, monthStartUtc, shared) {
  const since = utcMs(monthStartUtc ?? '');
  if (!Number.isFinite(since)) throw new Error('monthStart');
  const user = await adminParam(env, shared);
  let newMovies = 0;
  let newEpisodes = 0;
  let capped = false;
  for (let p = 0; p < NEW_PAGES; p++) {
    const data = await jfGet(
      env,
      '/Items?IncludeItemTypes=Movie,Episode&Recursive=true&SortBy=DateCreated&SortOrder=Descending&Fields=DateCreated' +
        `&EnableImages=false&EnableUserData=false&ImageTypeLimit=0&Limit=${NEW_PAGE}&StartIndex=${p * NEW_PAGE}${user}`,
    );
    const items = Array.isArray(data?.Items) ? data.Items : [];
    let reachedOld = items.length < NEW_PAGE;
    for (const it of items) {
      const t = Date.parse(String(it?.DateCreated ?? '').slice(0, 19) + 'Z');
      if (!Number.isFinite(t) || t < since) {
        reachedOld = true;
        break;
      }
      if (it.Type === 'Movie') newMovies++;
      else if (it.Type === 'Episode') newEpisodes++;
    }
    if (reachedOld) break;
    if (p === NEW_PAGES - 1) capped = true;
  }
  return { newMovies, newEpisodes, ...(capped ? { newCapped: 1 } : {}) };
}

/* ---------- Rekorde ---------- */

/** Sweep über (Start, Dauer)-Zeilen; liefert { n, date } des Maximums oder null. Ende vor Start bei gleicher Sekunde. */
export function sweepConcurrent(rows) {
  const ev = [];
  for (const r of rows) {
    const s = utcMs(r.s);
    const dur = Math.floor(num(r.dur));
    if (!Number.isFinite(s) || dur <= 0) continue;
    ev.push([s / 1000, 1], [s / 1000 + dur, -1]);
  }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let c = 0;
  let best = 0;
  let at = 0;
  for (const [t, d] of ev) {
    c += d;
    if (c > best) {
      best = c;
      at = t;
    }
  }
  return best > 0 ? { n: best, date: new Date(at * 1000).toISOString().slice(0, 10) } : null;
}

const validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

async function recDay(env) {
  const r = (await runCustomQueryRows(env, buildRecDay()))[0];
  return validDate(r?.d) && num(r.secs) > 0 ? { d: r.d, secs: Math.round(num(r.secs)) } : null;
}

async function recMonth(env) {
  const r = (await runCustomQueryRows(env, buildRecMonth()))[0];
  return /^\d{4}-\d{2}$/.test(r?.ym ?? '') && num(r.secs) > 0 ? { ym: r.ym, secs: Math.round(num(r.secs)) } : null;
}

/** { value, approx } mit value = { n, date } | null. */
async function recConc(env, full) {
  try {
    const r = (await runCustomQueryRows(env, buildConc(full)))[0];
    const n = Math.round(num(r?.n));
    return { value: n > 0 && validDate(r?.date) ? { n, date: r.date } : null, approx: false };
  } catch {
    console.error('srv: conc sql');
  }
  const rows = await runCustomQueryRows(env, buildConcRows(full));
  return { value: sweepConcurrent(rows), approx: rows.length >= CONC_ROW_CAP };
}

/** Marathon: meiste Folgen derselben Serie von einem Konto an einem Tag. approx, wenn die Serien nicht auflösbar waren. */
async function recBinge(env, full) {
  const cand = (await runCustomQueryRows(env, buildBingeCandidates(full))).map((r) => ({ d: r.d, u: r.u, n: num(r.n) }));
  if (!cand.length) return { value: null, approx: false };
  const sql = buildBingeEpisodes(cand);
  let groups = null; // "d|u" -> Folgen-IDs
  if (sql) {
    const eps = await runCustomQueryRows(env, sql);
    groups = new Map();
    for (const e of eps) {
      const k = `${e.d}|${e.u}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(normId(e.ItemId));
    }
  }
  const fallback = () => {
    const v = cand.find((c) => validDate(c.d));
    return { value: v ? { n: Math.round(v.n), date: v.d } : null, approx: true };
  };
  if (!groups || !groups.size) return fallback();
  // Folgen-IDs der besten Kandidaten, höchstens 3 Blöcke (300 IDs) für resolveSeries
  const ordered = [];
  const seen = new Set();
  for (const c of cand) {
    for (const id of groups.get(`${c.d}|${c.u}`) ?? []) {
      if (!seen.has(id) && ordered.length < SERIES_IDS_MAX) {
        seen.add(id);
        ordered.push(id);
      }
    }
  }
  let map;
  try {
    map = await resolveSeries(env, ordered);
  } catch {
    console.error('srv: series');
    return fallback();
  }
  let top = null;
  let approx = ordered.length >= SERIES_IDS_MAX;
  for (const c of cand) {
    const ids = groups.get(`${c.d}|${c.u}`) ?? [];
    const per = new Map();
    for (const id of ids) {
      const s = map.get(id) ?? (seen.has(id) ? `ep:${id}` : null);
      if (s == null) {
        approx = true; // nicht in den ersten 300 IDs: als eigene Gruppe gezählt
        per.set(`x:${id}`, 1);
        continue;
      }
      per.set(s, (per.get(s) ?? 0) + 1);
    }
    const n = Math.max(0, ...per.values());
    if (n > 0 && validDate(c.d) && (!top || n > top.n)) top = { n, date: c.d };
  }
  return { value: top, approx };
}

const better = (a, b) => (a && (!b || a.n > b.n) ? a : b);

/* ---------- Tageslauf ---------- */

/**
 * Tageslauf. full = ganze Historie, ersetzt die Rekorde statt ein Maximum zu bilden.
 * Teilfehler: alter Stand aus KV bleibt. Liefert { ok:true } oder { ok:false, code }.
 */
export async function runDaily(env, { full = false, prev, shared = {} } = {}) {
  const old = prev !== undefined ? prev : await kvGet(env, DAILY_KEY);
  const meta = await getMonthMeta(env, null);
  if (!meta || !meta.monthStartUtc) return { ok: false, code: 'meta' };
  const R = old?.records ?? {};
  const fails = [];
  const [counts, news, day, month, conc, binge] = await Promise.allSettled([
    fetchCounts(env),
    fetchNew(env, meta.monthStartUtc, shared),
    recDay(env),
    recMonth(env),
    recConc(env, full),
    recBinge(env, full),
  ]);
  const val = (r, name) => {
    if (r.status === 'fulfilled') return r.value;
    fails.push(name);
    console.error(`srv: daily ${name}`);
    return undefined;
  };
  const c = val(counts, 'counts');
  const n = val(news, 'new');
  const library = { ...(old?.library ?? {}), ...(c ?? {}), ...(n ?? {}), ym: meta.ym };
  if (n && !n.newCapped) delete library.newCapped;
  library.newMovies ??= 0;
  library.newEpisodes ??= 0;
  const records = { ...R };
  let approx = full ? false : !!R.approx;
  const dayV = val(day, 'day');
  if (dayV !== undefined) {
    if (full) dayV ? (records.day = dayV) : delete records.day;
    else if (dayV) records.day = !R.day || dayV.secs >= R.day.secs ? dayV : R.day;
  }
  const monthV = val(month, 'month');
  if (monthV !== undefined) {
    if (full) monthV ? (records.month = monthV) : delete records.month;
    else if (monthV) records.month = !R.month || monthV.secs >= R.month.secs ? monthV : R.month;
  }
  for (const [name, r] of [
    ['conc', conc],
    ['binge', binge],
  ]) {
    const v = val(r, name);
    if (v === undefined) continue;
    if (v.approx) approx = true;
    if (full) v.value ? (records[name] = v.value) : delete records[name];
    else if (v.value) records[name] = better(v.value, R[name]);
  }
  if (approx) records.approx = 1;
  else delete records.approx;

  if (fails.length === 6) return { ok: false, code: 'all' };
  const now = Date.now();
  const partial = fails.length > 0;
  // Teilfehler: `at` so setzen, dass der nächste Slot (6 h später) den Lauf nachholt.
  const at = partial ? Math.min(old?.at ?? Infinity, now - 19 * 3600 * 1000) : now;
  try {
    await env.CHARTS.put(DAILY_KEY, JSON.stringify({ v: 1, at, monthStartUtc: meta.monthStartUtc, library, records }));
  } catch {
    console.error('srv: daily put');
    return { ok: false, code: 'put' };
  }
  return partial ? { ok: false, code: 'partial' } : { ok: true };
}

/* ---------- Bibliothek: Laufzeit in Abschnitten ---------- */

async function runLibChunk(env, shared) {
  const now = Date.now();
  let st = await kvGet(env, LIB_KEY);
  if (!st || typeof st !== 'object') st = { v: 1, cursor: 0, partS: 0, startedAt: 0 };
  if (st.cursor === 0 && st.doneAt && now - st.doneAt < LIB_RESTART_MS) return false; // frisch fertig
  let { cursor = 0, partS = 0, startedAt = 0 } = st;
  if (cursor > 0 && startedAt && now - startedAt > LIB_MAX_AGE_MS) {
    cursor = 0;
    partS = 0;
    startedAt = 0;
  }
  if (cursor === 0) {
    partS = 0;
    startedAt = now;
  }
  const user = await adminParam(env, shared);
  const data = await jfGet(
    env,
    `/Items?IncludeItemTypes=Movie,Episode&Recursive=true&SortBy=SortName&StartIndex=${cursor}&Limit=${LIB_CHUNK}` +
      `&EnableImages=false&EnableUserData=false&ImageTypeLimit=0&EnableTotalRecordCount=true${user}`,
  );
  const items = Array.isArray(data?.Items) ? data.Items : [];
  let ticks = 0;
  for (const it of items) ticks += num(it?.RunTimeTicks);
  partS += ticks / 10_000_000;
  const total = num(data?.TotalRecordCount);
  const next = cursor + items.length;
  const done = !items.length || (total > 0 && next >= total);
  const out = done
    ? { v: 1, cursor: 0, partS: 0, startedAt: 0, runtimeS: Math.round(partS), doneAt: now }
    : { v: 1, cursor: next, partS: Math.round(partS), startedAt, ...(st.runtimeS != null ? { runtimeS: st.runtimeS } : {}), ...(st.doneAt ? { doneAt: st.doneAt } : {}) };
  await env.CHARTS.put(LIB_KEY, JSON.stringify(out));
  return true;
}

// Cron-Slot (23 alle 6 Stunden). Wirft nie.
export async function runSlot(env, ctx) {
  void ctx;
  try {
    const shared = {};
    const prev = await kvGet(env, DAILY_KEY);
    if (!prev || !(Date.now() - num(prev.at) < DAILY_STALE_MS)) {
      try {
        await runDaily(env, { prev, shared });
      } catch {
        console.error('srv: slot daily');
      }
    }
    try {
      await runLibChunk(env, shared);
    } catch {
      console.error('srv: slot lib');
    }
  } catch {
    console.error('srv: slot');
  }
}
