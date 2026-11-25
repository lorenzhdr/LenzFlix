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
const MAX_HOURS = 24 * 8;
const MAX_BK = 62;
const MAX_BKM = 120;
const EST_CAP = 64424509440; // 60 GiB
const DEFAULT_WINDOW = { dow: 0, from: 5, to: 8 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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

const cmp = (key) => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);

/** "<dow>:<von>-<bis>" (bis exklusiv) -> { dow, from, to }; ungültig -> Standard Sonntag 5-8. */
export function parseBackupWindow(raw) {
  const m = /^\s*([0-6])\s*:\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/.exec(typeof raw === 'string' ? raw : '');
  if (!m) return { ...DEFAULT_WINDOW };
  const from = Number(m[2]);
  const to = Number(m[3]);
  if (from > 23 || to > 24 || from >= to) return { ...DEFAULT_WINDOW };
  return { dow: Number(m[1]), from, to };
}

/** Wochentag (0 = Sonntag) eines Kalenderdatums 'YYYY-MM-DD' (reine Kalenderrechnung). */
function weekday(d) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
}
function addDays(d, n) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
}
const ymd = (y, m, d) => `${Math.round(y)}-${pad(Math.round(m))}-${pad(Math.round(d))}`;

/** vnstat h (jsonversion "2") -> [{ d, h, tx }] in Lokalzeit von vnstat, aufsteigend, höchstens MAX_HOURS neueste. */
function vnstatHours(raw) {
  if (!isObj(raw) || String(raw.jsonversion) !== '2') return [];
  const tr = Array.isArray(raw.interfaces) && isObj(raw.interfaces[0]) ? raw.interfaces[0].traffic : null;
  const rows = isObj(tr) && Array.isArray(tr.hour) ? tr.hour : [];
  const out = [];
  for (const r of rows) {
    if (!isObj(r) || !isObj(r.date) || !isObj(r.time)) continue;
    const y = num(r.date.year, 2000, 2200);
    const m = num(r.date.month, 1, 12);
    const d = num(r.date.day, 1, 31);
    const h = num(r.time.hour, 0, 23);
    const tx = big(r.tx);
    if (y === undefined || m === undefined || d === undefined || h === undefined || tx === undefined) continue;
    out.push({ d: ymd(y, m, d), h: Math.round(h), tx });
  }
  out.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.h - b.h));
  return out.slice(-MAX_HOURS);
}

/** interfaces[0].created.date -> 'YYYY-MM-DD' (erster Messtag von vnstat) oder undefined. */
function vnstatSince(raw) {
  if (!isObj(raw) || String(raw.jsonversion) !== '2') return undefined;
  const c = Array.isArray(raw.interfaces) && isObj(raw.interfaces[0]) ? raw.interfaces[0].created : null;
  if (!isObj(c) || !isObj(c.date)) return undefined;
  const y = num(c.date.year, 2000, 2200);
  const m = num(c.date.month, 1, 12);
  const d = num(c.date.day, 1, 31);
  if (y === undefined || m === undefined || d === undefined) return undefined;
  return ymd(y, m, d);
}

/**
 * Backup aus Stundenwerten: je Datum mit Wochentag win.dow die Summe tx der Stunden [from, to).
 * Meldestand = neueste Stunde der Meldung (Lokalzeit von vnstat, nie die Worker-Uhr). Gesetzt nur, wenn das
 * Datum vor dem Meldestand liegt oder am selben Datum die aktuelle Stunde schon >= to ist (keine halben Werte),
 * und wenn alle Fensterstunden vorkommen oder die Stundenreihe vor dem Fenster einsetzt (Lücken = Nullstunden).
 */
function backupFromHours(hours, win) {
  if (!hours.length) return [];
  const first = hours[0];
  const last = hours[hours.length - 1];
  const byDate = new Map();
  for (const r of hours) {
    if (r.h < win.from || r.h >= win.to || weekday(r.d) !== win.dow) continue;
    const e = byDate.get(r.d) ?? { tx: 0, hs: new Set() };
    e.tx += r.tx;
    e.hs.add(r.h);
    byDate.set(r.d, e);
  }
  const out = [];
  for (const [d, e] of byDate) {
    const done = d < last.d || (d === last.d && last.h >= win.to);
    const complete = e.hs.size === win.to - win.from || first.d < d || (first.d === d && first.h <= win.from);
    if (done && complete) out.push({ d, tx: e.tx, src: 'h' });
  }
  return out;
}

/** Merge je Datum: 'h' ersetzt 'est'; zwei 'h' -> Maximum; zwei 'est' -> neuer Wert; neuer 'est' lässt 'h' stehen. */
function mergeBk(oldBk, newBk) {
  const map = new Map();
  for (const r of Array.isArray(oldBk) ? oldBk : []) {
    if (!isObj(r) || typeof r.d !== 'string' || !DATE_RE.test(r.d)) continue;
    const tx = big(r.tx);
    if (tx === undefined || (r.src !== 'h' && r.src !== 'est')) continue;
    map.set(r.d, { d: r.d, tx, src: r.src });
  }
  for (const r of newBk) {
    const e = map.get(r.d);
    if (!e || (r.src === 'h' && e.src === 'est') || (r.src === 'est' && e.src === 'est')) map.set(r.d, { ...r });
    else if (r.src === 'h') e.tx = Math.max(e.tx, r.tx);
  }
  return [...map.values()].sort(cmp('d')).slice(-MAX_BK);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

/**
 * Schätzung für Backup-Tage (Wochentag win.dow) ohne 'h': max(0, tx_Tag − Median(tx der 6 Vortage, also Mo–Sa
 * derselben Woche beim Sonntag; nur vorhandene, mind. 3)), gedeckelt auf 60 GiB. Der neueste Tag läuft womöglich noch.
 */
function backupEstimates(days, bk, win) {
  if (!days.length) return [];
  const newest = days[days.length - 1].d;
  const tx = new Map(days.map((r) => [r.d, r.tx]));
  const hasH = new Set(bk.filter((r) => r.src === 'h').map((r) => r.d));
  const out = [];
  for (const r of days) {
    if (r.d >= newest || hasH.has(r.d) || weekday(r.d) !== win.dow) continue;
    const others = [];
    for (let i = 1; i <= 6; i++) {
      const v = tx.get(addDays(r.d, -i));
      if (v !== undefined) others.push(v);
    }
    if (others.length < 3) continue;
    out.push({ d: r.d, tx: Math.round(Math.min(EST_CAP, Math.max(0, r.tx - median(others)))), src: 'est' });
  }
  return out;
}

/**
 * bkm: Monatssumme aus bk. Ist der Monat noch vollständig im gespeicherten Tageszeitraum (erster Tag des Monats bzw.
 * since, falls später, liegt >= days[0]), ERSETZT die Summe den alten Wert (frühe 'est' bleiben nicht hängen).
 * Sonst Maximum aus altem Wert und Teilsumme (überlebt das Herausfallen der Tage).
 */
function mergeBkm(oldBkm, bk, days, since) {
  const covFrom = days.length ? days[0].d : null;
  const map = new Map();
  for (const r of Array.isArray(oldBkm) ? oldBkm : []) {
    if (!isObj(r) || typeof r.ym !== 'string' || !/^\d{4}-\d{2}$/.test(r.ym)) continue;
    const tx = big(r.tx);
    if (tx !== undefined) map.set(r.ym, tx);
  }
  const sums = new Map();
  for (const r of bk) sums.set(r.d.slice(0, 7), (sums.get(r.d.slice(0, 7)) ?? 0) + r.tx);
  for (const [ym, tx] of sums) {
    const start = since && since > `${ym}-01` ? since : `${ym}-01`;
    const covered = covFrom !== null && start >= covFrom;
    map.set(ym, covered ? tx : Math.max(map.get(ym) ?? 0, tx));
  }
  return [...map.entries()]
    .map(([ym, tx]) => ({ ym, tx }))
    .sort(cmp('ym'))
    .slice(-MAX_BKM);
}

/**
 * raw = geparster Body, prev = bisheriger KV-Datensatz oder null. Liefert den zusammengeführten Datensatz oder null.
 * backupWindow = env.SRV_BACKUP_WINDOW (optional, Standard "0:5-8").
 */
export function sanitizeReport(raw, prev, nowMs, backupWindow) {
  if (!isObj(raw)) return null;
  const old = isObj(prev) ? prev : {};
  const health = cleanHealth(raw.host, nowMs);
  const disks = cleanDisks(raw.disks, nowMs);
  let newMonths = [];
  let newDays = [];
  let hours = [];
  let since;
  if (isObj(raw.vnstat)) {
    newMonths = vnstatRows(raw.vnstat.m, 'month');
    newDays = vnstatRows(raw.vnstat.d, 'day');
    hours = vnstatHours(raw.vnstat.h);
    since = vnstatSince(raw.vnstat.h) ?? vnstatSince(raw.vnstat.d) ?? vnstatSince(raw.vnstat.m);
  }
  const hasTraffic = newMonths.length > 0 || newDays.length > 0 || hours.length > 0;
  if (!health && !disks && !hasTraffic) return null;

  const rec = { v: 1, at: nowMs };
  const h = health ?? (isObj(old.health) ? old.health : null);
  if (h) rec.health = h;
  const d = disks ?? (isObj(old.disks) ? old.disks : null);
  if (d) rec.disks = d;
  const oldT = isObj(old.traffic) ? old.traffic : null;
  if (hasTraffic) {
    const win = parseBackupWindow(backupWindow);
    const days = mergeRows(oldT?.days, newDays, 'd', MAX_DAYS);
    rec.traffic = {
      at: nowMs,
      days,
      months: mergeRows(oldT?.months, newMonths, 'ym', MAX_MONTHS),
    };
    const s = since ?? (typeof oldT?.since === 'string' && DATE_RE.test(oldT.since) ? oldT.since : undefined);
    if (s) rec.traffic.since = s;
    const withH = mergeBk(oldT?.bk, backupFromHours(hours, win));
    const bk = mergeBk(withH, backupEstimates(days, withH, win));
    if (bk.length) rec.traffic.bk = bk;
    const bkm = mergeBkm(oldT?.bkm, bk, days, s);
    if (bkm.length) rec.traffic.bkm = bkm;
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
  const rec = sanitizeReport(parsed, prev, now, env.SRV_BACKUP_WINDOW);
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
