// POST /srv/report: Meldung des Servers (Server zu Server, ohne CORS). Baut alles neu aus einer Whitelist.
import { makeLimiter } from './rate.js';

export const REPORT_KEY = 'srv:report:v1';
const MAX_BODY = 65536;
const MIN_SECRET = 32;
const WRITE_GAP_MS = 10 * 60 * 1000;
const MAX_NUM = 1e16;
const MAX_UPTIME_S = 10 * 365 * 86400;
const MAX_DISKS = 6;
const MAX_MONTHS = 24;
const MAX_DAYS = 62;
const LABEL_RE = /^[\p{L}\p{N} _-]{1,24}$/u;

const failLimit = makeLimiter({ max: 6 });
let lastPutAt = 0; // Isolate-Merker zusätzlich zum KV-`at`

export function clearReportState() {
  failLimit.clear();
  lastPutAt = 0;
}

function reply(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function digest(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** Zeitkonstant: SHA-256 beider Werte, dann XOR über alle Bytes. */
async function secretEqual(a, b) {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ (y[i] ?? 0);
  return diff === 0;
}

async function readCapped(request) {
  const body = request.body;
  if (!body) return '';
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY) {
      try {
        await reader.cancel();
      } catch {
        /* ignorieren */
      }
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

// --- Whitelist-Helfer ---
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
function num(x, min, max) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return undefined;
  return Math.min(max, Math.max(min, x));
}
const big = (x) => num(x, 0, MAX_NUM);
const pad = (n) => String(n).padStart(2, '0');

function cleanHealth(host, now) {
  if (!isObj(host)) return null;
  const h = { at: now };
  let any = false;
  const set = (k, v) => {
    if (v !== undefined) {
      h[k] = v;
      any = true;
    }
  };
  set('tempC', num(host.tempC, -40, 150));
  set('cpuPct', num(host.cpuPct, 0, 100));
  if (Array.isArray(host.load) && host.load.length === 3) {
    const l = host.load.map((v) => num(v, 0, 1000));
    if (l.every((v) => v !== undefined)) set('load', l);
  }
  const cores = num(host.cores, 1, 1024);
  set('cores', cores === undefined ? undefined : Math.round(cores));
  const total = big(host.memTotal);
  const avail = big(host.memAvail);
  if (total !== undefined && avail !== undefined) set('mem', { total, avail });
  set('uptimeS', num(host.uptimeS, 0, MAX_UPTIME_S));
  return any ? h : null;
}

function cleanDisks(list, now) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const d of list) {
    if (out.length >= MAX_DISKS) break;
    if (!isObj(d) || typeof d.l !== 'string' || !LABEL_RE.test(d.l)) continue;
    const size = big(d.size);
    const used = big(d.used);
    const avail = big(d.avail);
    if (size === undefined || used === undefined || avail === undefined) continue;
    out.push({ l: d.l, size, used, avail });
  }
  return out.length ? { at: now, list: out } : null;
}

/** vnstat `--json` (jsonversion "2") -> interfaces[0].traffic[kind] als Liste {ym|d, rx, tx}. */
function vnstatRows(raw, kind) {
  if (!isObj(raw) || String(raw.jsonversion) !== '2') return [];
  const tr = Array.isArray(raw.interfaces) && isObj(raw.interfaces[0]) ? raw.interfaces[0].traffic : null;
  const rows = isObj(tr) && Array.isArray(tr[kind]) ? tr[kind] : [];
  const out = [];
  for (const r of rows) {
    if (!isObj(r) || !isObj(r.date)) continue;
    const y = num(r.date.year, 2000, 2200);
    const m = num(r.date.month, 1, 12);
    const rx = big(r.rx);
    const tx = big(r.tx);
    if (y === undefined || m === undefined || rx === undefined || tx === undefined) continue;
    if (kind === 'day') {
      const d = num(r.date.day, 1, 31);
      if (d === undefined) continue;
      out.push({ d: `${Math.round(y)}-${pad(Math.round(m))}-${pad(Math.round(d))}`, rx, tx });
    } else {
      out.push({ ym: `${Math.round(y)}-${pad(Math.round(m))}`, rx, tx });
    }
  }
  return out;
}

function mergeRows(oldRows, newRows, key, cap) {
  const map = new Map();
  for (const r of [...(Array.isArray(oldRows) ? oldRows : []), ...newRows]) {
    const k = r[key];
    const e = map.get(k);
    if (e) {
      e.rx = Math.max(e.rx, r.rx);
      e.tx = Math.max(e.tx, r.tx);
    } else map.set(k, { [key]: k, rx: r.rx, tx: r.tx });
  }
  return [...map.values()].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0)).slice(-cap);
}

/** raw = geparster Body, prev = bisheriger KV-Datensatz oder null. Liefert den zusammengeführten Datensatz oder null. */
export function sanitizeReport(raw, prev, nowMs) {
  if (!isObj(raw)) return null;
  const old = isObj(prev) ? prev : {};
  const health = cleanHealth(raw.host, nowMs);
  const disks = cleanDisks(raw.disks, nowMs);
  let newMonths = [];
  let newDays = [];
  if (isObj(raw.vnstat)) {
    newMonths = vnstatRows(raw.vnstat.m, 'month');
    newDays = vnstatRows(raw.vnstat.d, 'day');
  }
  const hasTraffic = newMonths.length > 0 || newDays.length > 0;
  if (!health && !disks && !hasTraffic) return null;

  const rec = { v: 1, at: nowMs };
  const h = health ?? (isObj(old.health) ? old.health : null);
  if (h) rec.health = h;
  const d = disks ?? (isObj(old.disks) ? old.disks : null);
  if (d) rec.disks = d;
  const oldT = isObj(old.traffic) ? old.traffic : null;
  if (hasTraffic) {
    rec.traffic = {
      at: nowMs,
      days: mergeRows(oldT?.days, newDays, 'd', MAX_DAYS),
      months: mergeRows(oldT?.months, newMonths, 'ym', MAX_MONTHS),
    };
  } else if (oldT) rec.traffic = oldT;

  // Upload-Rekordmonat: Maximum aus altem Rekord und allen bekannten Monaten.
  let best = isObj(old.rec) && isObj(old.rec.tx) && Number.isFinite(old.rec.tx.bytes) ? { ym: old.rec.tx.ym, bytes: old.rec.tx.bytes } : null;
  for (const m of rec.traffic?.months ?? []) if (!best || m.tx > best.bytes) best = { ym: m.ym, bytes: m.tx };
  if (best) rec.rec = { tx: best };
  return rec;
}

/** POST /srv/report. */
export async function handleReport(request, env) {
  const secret = env.SERVER_REPORT_SECRET;
  if (typeof secret !== 'string' || secret.length < MIN_SECRET) return reply({ error: 'srv-off' }, 404);

  const auth = request.headers.get('Authorization') ?? '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!(await secretEqual(given, secret))) {
    const ip = request.headers.get('CF-Connecting-IP') || 'noip';
    return failLimit.hit('ip:' + ip, Date.now()) ? reply({ error: 'unauthorized' }, 401) : reply({ error: 'rate' }, 429);
  }

  const ct = (request.headers.get('Content-Type') ?? '').toLowerCase();
  if (!ct.startsWith('application/json')) return reply({ error: 'unsupported-media-type' }, 415);
  const len = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(len) && len > MAX_BODY) return reply({ error: 'too-large' }, 413);
  const text = await readCapped(request);
  if (text === null) return reply({ error: 'too-large' }, 413);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return reply({ error: 'bad-body' }, 400);
  }

  let prev;
  try {
    prev = await env.CHARTS.get(REPORT_KEY, 'json');
  } catch {
    console.error('srv: report-get');
    return reply({ error: 'kv' }, 503);
  }
  const now = Date.now();
  const rec = sanitizeReport(parsed, prev, now);
  if (!rec) return reply({ error: 'bad-body' }, 400);

  const lastAt = Math.max(Number.isFinite(prev?.at) ? prev.at : 0, lastPutAt);
  if (now - lastAt >= 0 && now - lastAt < WRITE_GAP_MS) return reply({ ok: true, skipped: 1 }, 200);
  try {
    await env.CHARTS.put(REPORT_KEY, JSON.stringify(rec));
  } catch {
    console.error('srv: report-put');
    return reply({ error: 'kv' }, 503);
  }
  lastPutAt = now;
  return reply({ ok: true }, 200);
}
