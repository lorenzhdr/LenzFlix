// Monatsansicht der Server-Statistik: Meta-Abfrage, Monatsabfrage (eine UNION-ALL-Abfrage, sonst Einzelteile),
// Cache API unter dem aufgelösten Monat (ym). Namen von Clients oder Geräten verlassen diese Datei nie.
import { runCustomQueryRows } from '../jellyfin.js';
import { deviceKind } from './device.js';
import { buildMeta, buildMonth, buildMonthParts, parseMonthParam } from './sql.js';

const META_FRESH_MS = 10 * 60 * 1000;
const CUR_FRESH_MS = 10 * 60 * 1000;
const PAST_FRESH_MS = 24 * 60 * 60 * 1000;
const KEEP_S = 7 * 24 * 60 * 60;
const CACHE_HOST = 'https://lfx-srv-cache.invalid';
const REPORT_KEY = 'srv:report:v1';
const YM_RE = /^\d{4}-\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}/;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const int = (v) => Math.round(num(v));

/* ---------- Monatsarithmetik auf "YYYY-MM" (reine Zeichenketten, keine UTC-Grenzen) ---------- */

const monthIndex = (ym) => Number(ym.slice(0, 4)) * 12 + (Number(ym.slice(5, 7)) - 1);
export function shiftYm(ym, delta) {
  const i = monthIndex(ym) + delta;
  const y = Math.floor(i / 12);
  return `${String(y).padStart(4, '0')}-${String((i % 12) + 1).padStart(2, '0')}`;
}
const daysIn = (ym) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();

/* ---------- Meta ---------- */

let metaCache = { at: 0, val: null, pending: null };

export function clearMonthCache() {
  metaCache = { at: 0, val: null, pending: null };
}

function parseMeta(row) {
  const ym = String(row?.ym ?? '');
  if (!YM_RE.test(ym)) return null;
  const first = String(row?.first ?? '');
  const maxM = YM_RE.test(first) ? Math.min(35, Math.max(0, monthIndex(ym) - monthIndex(first))) : 0;
  const today = DAY_RE.test(String(row?.today ?? '')) ? String(row.today).slice(0, 10) : null;
  return { ym, maxM, today, monthStartUtc: row?.monthStartUtc ? String(row.monthStartUtc) : null };
}

/** { ym, maxM, today, monthStartUtc } oder null. Isolate-Cache 10 min; bei Fehler der letzte Wert. */
export async function getMonthMeta(env, ctx) {
  void ctx;
  const now = Date.now();
  if (metaCache.val && now - metaCache.at < META_FRESH_MS) return metaCache.val;
  if (metaCache.pending) return metaCache.pending;
  const job = (async () => {
    try {
      const rows = await runCustomQueryRows(env, buildMeta());
      const val = parseMeta(rows[0]);
      if (!val) throw new Error('meta');
      metaCache.val = val;
      metaCache.at = Date.now();
      return val;
    } catch {
      console.error('srv: meta');
      return metaCache.val;
    } finally {
      metaCache.pending = null;
    }
  })();
  metaCache.pending = job;
  return job;
}

/* ---------- Cache API (Fehler nie fatal) ---------- */

const cacheStore = () => {
  try {
    return typeof caches !== 'undefined' ? caches.default : null;
  } catch {
    return null;
  }
};

async function cacheGet(ym) {
  try {
    const c = cacheStore();
    if (!c) return null;
    const res = await c.match(new Request(`${CACHE_HOST}/srv/month/${ym}`));
    const v = res ? await res.json() : null;
    return v && v.body && typeof v.at === 'number' ? v : null;
  } catch {
    return null;
  }
}

function cachePut(ym, value, ctx) {
  const job = (async () => {
    try {
      const c = cacheStore();
      if (!c) return;
      await c.put(
        new Request(`${CACHE_HOST}/srv/month/${ym}`),
        new Response(JSON.stringify(value), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${KEEP_S}` },
        }),
      );
    } catch {
      console.error('srv: month cache');
    }
  })();
  if (ctx?.waitUntil) {
    ctx.waitUntil(job);
    return Promise.resolve();
  }
  return job;
}

/* ---------- Auswertung ---------- */

function methodKind(m) {
  const s = String(m ?? '').toLowerCase();
  if (s.startsWith('directplay') || s.startsWith('directstream') || s.startsWith('transcode (v:direct a:direct)')) return 'direct';
  if (s.startsWith('transcode')) return 'transcode';
  return null;
}

/** Rohzeilen (k,a,b,c,d) -> Antwortteile. Fehlende Schlüssel (Teilfehler) fehlen auch im Ergebnis. */
function shape(rows, ym, m, meta, have) {
  const by = {};
  for (const r of rows) (by[r.k] ??= []).push(r);
  const out = {};
  if (have.has('tot')) {
    const t = by.tot?.[0];
    out.totals = { secs: int(t?.a), plays: int(t?.b), users: int(t?.c) };
  }
  if (have.has('prev')) out.prev = { ym: shiftYm(ym, -1), secs: int(by.prev?.[0]?.a) };
  if (have.has('day')) {
    const map = new Map();
    for (const r of by.day ?? []) if (DAY_RE.test(String(r.a))) map.set(String(r.a).slice(0, 10), int(r.b));
    let last = daysIn(ym);
    if (m === 0 && meta?.today && meta.today.startsWith(ym)) last = Number(meta.today.slice(8, 10)) || last;
    const days = [];
    let top = null;
    for (let d = 1; d <= last; d++) {
      const key = `${ym}-${String(d).padStart(2, '0')}`;
      const secs = map.get(key) ?? 0;
      days.push({ d: key, secs });
      if (secs > 0 && (!top || secs > top.secs)) top = { d: key, secs };
    }
    out.days = days;
    out.top = top;
  }
  if (have.has('hm')) {
    out.heat = (by.hm ?? [])
      .map((r) => [int(r.a), int(r.b), int(r.c)])
      .filter((h) => h[0] >= 0 && h[0] <= 6 && h[1] >= 0 && h[1] <= 23 && h[2] > 0);
  }
  const mix = {};
  if (have.has('dev')) {
    const dev = { tv: 0, phone: 0, web: 0, other: 0 };
    for (const r of by.dev ?? []) {
      const kind = deviceKind(r.a == null ? '' : String(r.a), r.b == null ? '' : String(r.b));
      dev[kind in dev ? kind : 'other'] += int(r.c);
    }
    mix.dev = dev;
  }
  if (have.has('pm')) {
    const method = { direct: 0, transcode: 0 };
    for (const r of by.pm ?? []) {
      const k = methodKind(r.a);
      if (k) method[k] += int(r.c);
    }
    mix.method = method;
  }
  if (have.has('ty')) {
    const type = { movie: 0, episode: 0 };
    for (const r of by.ty ?? []) {
      if (r.a === 'Movie') type.movie += int(r.c);
      else if (r.a === 'Episode') type.episode += int(r.c);
    }
    mix.type = type;
  }
  if (Object.keys(mix).length) out.mix = mix;
  return out;
}

/** Eine UNION-ALL-Abfrage; scheitert sie, die Teile einzeln. Wirft nur, wenn gar nichts ankam. */
async function compute(env, m, ym, meta) {
  let rows;
  let have = new Set(['tot', 'day', 'hm', 'dev', 'pm', 'ty', 'prev']);
  try {
    rows = await runCustomQueryRows(env, buildMonth(m));
  } catch {
    console.error('srv: month union');
    const parts = buildMonthParts(m);
    const keys = Object.keys(parts);
    const res = await Promise.allSettled(keys.map((k) => runCustomQueryRows(env, parts[k])));
    rows = [];
    have = new Set();
    res.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        have.add(keys[i]);
        rows.push(...r.value);
      }
    });
    if (!have.size) throw new Error('month');
  }
  return shape(rows, ym, m, meta, have);
}

async function readTx(env, ym) {
  try {
    const rep = await env.CHARTS?.get(REPORT_KEY, 'json');
    const row = rep?.traffic?.months?.find?.((x) => x?.ym === ym);
    if (!row) return null;
    return { tx: int(row.tx), rx: int(row.rx) };
  } catch {
    return null;
  }
}

async function respond(env, body, { ym, m, maxM, stale }) {
  const out = { v: 1, ym, m, maxM, partial: m === 0 };
  if (stale) out.stale = 1;
  const { totals, prev, days, top, heat, mix } = body;
  if (totals) out.totals = totals;
  if (prev) out.prev = prev;
  if (days) out.days = days;
  if (top !== undefined) out.top = top;
  if (heat) out.heat = heat;
  if (mix) out.mix = mix;
  const tx = await readTx(env, ym);
  if (tx) out.tx = tx;
  return { status: 200, body: out };
}

/** { status, body } für GET /srv/month?m=… */
export async function getMonth(env, ctx, mRaw) {
  const m = parseMonthParam(mRaw);
  if (m === null) return { status: 400, body: { error: 'bad-month' } };
  const meta = await getMonthMeta(env, ctx);
  if (!meta) {
    // Notfall ohne Meta (Jellyfin weg und kein letzter Wert): nur eine abgelaufene Kopie, geschätzt aus der UTC-Uhr.
    const now = new Date();
    const guess = shiftYm(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`, -m);
    const old = await cacheGet(guess);
    if (!old) return { status: 503, body: { error: 'unavailable' } };
    return respond(env, old.body, { ym: guess, m, maxM: old.body.maxM ?? 0, stale: true });
  }
  const ym = shiftYm(meta.ym, -m);
  const cur = m === 0;
  const cached = await cacheGet(ym);
  const ttl = cur ? CUR_FRESH_MS : PAST_FRESH_MS;
  const fresh = cached && Date.now() - cached.at < ttl && !(cached.cur && !cur);
  const info = { ym, m, maxM: meta.maxM };
  if (fresh) return respond(env, cached.body, info);
  try {
    const body = await compute(env, m, ym, meta);
    await cachePut(ym, { at: Date.now(), cur, body }, ctx);
    return respond(env, body, info);
  } catch {
    console.error('srv: month');
    if (cached) return respond(env, cached.body, { ...info, stale: true });
    return { status: 503, body: { error: 'unavailable' } };
  }
}
