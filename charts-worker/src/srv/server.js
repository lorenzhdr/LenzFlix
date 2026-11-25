// GET /srv/server: letzter bekannter Stand aus dem KV (Meldung, Tageslauf, Bibliothekslauf). Wirft nie.
import { REPORT_KEY } from './report.js';

export const DAILY_KEY = 'srv:daily:v1';
export const LIB_KEY = 'srv:lib:v1';
const CACHE_MS = 60 * 1000;
const HEALTH_MAX_MS = 24 * 3600 * 1000;
const STALE_MS = 75 * 60 * 1000;

let cache = null; // { at, kv }

export function clearServerCache() {
  cache = null;
}

/** Roh-KV (Meldung, Tageslauf, Bibliothekslauf), 60 s im Isolate; wirft nie, bei Fehler null. */
export async function readSrvKv(env, now = Date.now()) {
  if (cache && now - cache.at >= 0 && now - cache.at < CACHE_MS) return cache.kv;
  try {
    const [report, daily, lib] = await Promise.all([
      env.CHARTS.get(REPORT_KEY, 'json'),
      env.CHARTS.get(DAILY_KEY, 'json'),
      env.CHARTS.get(LIB_KEY, 'json'),
    ]);
    const kv = { report: report ?? null, daily: daily ?? null, lib: lib ?? null };
    cache = { at: now, kv };
    return kv;
  } catch {
    console.error('srv: kv-read');
    return null;
  }
}

const ageS = (at, now) => Math.max(0, Math.round((now - at) / 1000));
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

export async function getServer(env) {
  try {
    const kv = await readSrvKv(env);
    if (!kv) return { v: 1 };
    const now = Date.now();
    const out = { v: 1 };
    const { report, daily, lib } = kv;
    const h = report?.health;
    if (isObj(h) && Number.isFinite(h.at) && now - h.at <= HEALTH_MAX_MS) {
      const o = { ageS: ageS(h.at, now), stale: now - h.at > STALE_MS };
      for (const k of ['tempC', 'cpuPct', 'load', 'cores', 'mem', 'uptimeS']) if (h[k] !== undefined) o[k] = h[k];
      out.health = o;
    }
    const d = report?.disks;
    if (isObj(d) && Array.isArray(d.list) && d.list.length && Number.isFinite(d.at)) out.disks = { ageS: ageS(d.at, now), list: d.list };
    const t = report?.traffic;
    if (isObj(t) && Number.isFinite(t.at)) out.traffic = { ageS: ageS(t.at, now), days: t.days ?? [], months: t.months ?? [] };
    if (isObj(daily?.library)) {
      out.library = { ...daily.library };
      if (Number.isFinite(lib?.runtimeS)) out.library.runtimeS = lib.runtimeS;
    }
    const rec = isObj(daily?.records) ? { ...daily.records } : {};
    if (isObj(report?.rec?.tx)) rec.tx = report.rec.tx;
    if (Object.keys(rec).length) out.records = rec;
    return out;
  } catch {
    return { v: 1 };
  }
}
