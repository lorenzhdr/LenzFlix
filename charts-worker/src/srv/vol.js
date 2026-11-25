// Datenvolumen je Konto (Cron „7 * * * *“, stündlich). Schätzt Bytes = Sekunden × kbps × 125 je Titel und gleicht
// die Summe aller Konten mit dem vnstat-Upload (ohne Backup) ab. Vertrag: KV `srv:vol:v1` (siehe docs/stats-api.md).
// Höchstens 10 Subrequests je Lauf: KV 2 Get + 1 Put, SQL 2, Admin 1, /Items <= BR_BLOCKS (4).
// Wirft nie; Log nur als fester Code, nie Namen, IDs oder Token.
import { getAdminUserId, normId, runCustomQueryRows } from '../jellyfin.js';
import { REPORT_KEY } from './report.js';

export const VOL_KEY = 'srv:vol:v1';
export const BR_BLOCKS = 4;
export const BR_BLOCK = 50;
export const BR_MAX_TEXT = 2 * 1024 * 1024;
export const VOL_ROW_LIMIT = 20000;
export const FB_DEFAULT = Object.freeze({ movie: 8000, episode: 4000 });
export const K_MIN = 0.5;
export const K_MAX = 2.5;
export const RANGES = ['7d', '30d', 'year', 'all'];
const REPORT_STALE_MS = 48 * 3600 * 1000;
const TIMEOUT_MS = 15000;
const MAX_KBPS = 1e6;

const LOG = 'srv: vol';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const YM_RE = /^\d{4}-\d{2}$/;
const ID_RE = /^[0-9a-f]{32}$/;
const FROM = "FROM PlaybackActivity WHERE ItemType IN ('Movie','Episode')";
// Untergrenzen der Fenster (Lokalzeit der DB, Kalendertage); 'all' ohne Grenze.
const LO = {
  '7d': "date('now','localtime','-6 days')",
  '30d': "date('now','localtime','-29 days')",
  year: "date('now','localtime','start of year')",
};
const COL = { '7d': '7', '30d': '30', year: 'y', all: 'a' };

const base = (env) => String(env.JELLYFIN_URL).replace(/\/+$/, '');
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const pad = (n) => String(n).padStart(2, '0');
const maxStr = (a, b) => (a > b ? a : b);
const typeKey = (t) => (t === 'Movie' ? 'movie' : t === 'Episode' ? 'episode' : null);

function addDays(d, n) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
}
function nextYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

async function kvGet(env, key) {
  try {
    return (await env.CHARTS?.get(key, 'json')) ?? null;
  } catch {
    return null;
  }
}

/* ---------- SQL ---------- */

/** Alle gespielten Titel (alle Konten) samt Typ. */
export function buildVolIds() {
  return `SELECT DISTINCT ItemId, ItemType ${FROM}`;
}

/**
 * Sekunden je (Konto, Titel) für die vier Fenster (w*) und, wenn ov gesetzt ist, ab Überlappungsbeginn (o*).
 * ov = { day, mon }: geprüfte Tage 'YYYY-MM-DD' (Beginn der vnstat-Tage bzw. -Monate). ig = Konto steht in UserList.
 */
export function buildVolRows(ov) {
  const sum = (lo) => (lo ? `SUM(CASE WHEN DateCreated >= ${lo} THEN PlayDuration ELSE 0 END)` : 'SUM(PlayDuration)');
  const cols = RANGES.map((r) => `${sum(LO[r])} AS w${COL[r]}`);
  if (ov) {
    if (!DATE_RE.test(ov.day) || !DATE_RE.test(ov.mon)) throw new Error('invalid date');
    const start = { '7d': ov.day, '30d': ov.day, year: ov.mon, all: ov.mon };
    for (const r of RANGES) {
      const lo = LO[r] ? `max(${LO[r]}, '${start[r]}')` : `'${start[r]}'`;
      cols.push(`${sum(lo)} AS o${COL[r]}`);
    }
  }
  return (
    "SELECT date('now','localtime') AS today, UserId AS u, ItemId AS i, MAX(ItemType) AS t, " +
    `${cols.join(', ')}, ` +
    'MAX(CASE WHEN UserId IN (SELECT UserId FROM UserList) THEN 1 ELSE 0 END) AS ig ' +
    `${FROM} GROUP BY UserId, ItemId LIMIT ${VOL_ROW_LIMIT}`
  );
}

/* ---------- Upload aus dem Server-Bericht ---------- */

/** Abgleich-Daten aus srv:report:v1 oder null (kein since, kein Traffic oder veraltet). */
function trafficInfo(report, now) {
  const t = isObj(report?.traffic) ? report.traffic : null;
  if (!t || typeof t.since !== 'string' || !DATE_RE.test(t.since)) return null;
  if (!(Number.isFinite(t.at) && now - t.at < REPORT_STALE_MS)) return null;
  const rows = (list, key, re) =>
    (Array.isArray(list) ? list : []).filter((r) => isObj(r) && typeof r[key] === 'string' && re.test(r[key]) && Number.isFinite(r.tx));
  const days = rows(t.days, 'd', DATE_RE);
  const months = rows(t.months, 'ym', YM_RE);
  if (!days.length && !months.length) return null;
  const toMap = (list, key) => new Map(list.map((r) => [r[key], Math.max(0, r.tx)]));
  // Überlappung beginnt frühestens am ersten gespeicherten Tag/Monat (Listen sind gedeckelt).
  const day = days.length ? maxStr(t.since, days.map((r) => r.d).sort()[0]) : t.since;
  const mon = months.length ? maxStr(t.since, `${months.map((r) => r.ym).sort()[0]}-01`) : t.since;
  return {
    ov: { day, mon },
    days: toMap(days, 'd'),
    months: toMap(months, 'ym'),
    bk: toMap(rows(t.bk, 'd', DATE_RE), 'd'),
    bkm: toMap(rows(t.bkm, 'ym', YM_RE), 'ym'),
  };
}

/** Streaming-Upload (tx − Backup, je Tag/Monat >= 0) der Überlappung von Fenster r; null ohne Überlappung. */
function uploadFor(r, today, tr) {
  if (!tr || !today) return null;
  if (r === '7d' || r === '30d') {
    const from = maxStr(addDays(today, r === '7d' ? -6 : -29), tr.ov.day);
    if (from > today) return null;
    let up = 0;
    for (let d = from, i = 0; d <= today && i < 40; d = addDays(d, 1), i++) up += Math.max(0, (tr.days.get(d) ?? 0) - (tr.bk.get(d) ?? 0));
    return up;
  }
  const from = (r === 'year' ? maxStr(`${today.slice(0, 4)}-01-01`, tr.ov.mon) : tr.ov.mon).slice(0, 7);
  const to = today.slice(0, 7);
  if (from > to) return null;
  let up = 0;
  for (let ym = from, i = 0; ym <= to && i < 1200; ym = nextYm(ym), i++) up += Math.max(0, (tr.months.get(ym) ?? 0) - (tr.bkm.get(ym) ?? 0));
  return up;
}

/* ---------- Bitraten ---------- */

function cleanBr(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (ID_RE.test(k) && Number.isFinite(v) && v >= 0 && v <= MAX_KBPS) out[k] = Math.round(v);
  }
  return out;
}

/** Ein /Items-Block -> Map<id, kbps> oder null bei Fehler/zu großer Antwort. */
async function fetchBlock(env, ids, userParam) {
  try {
    const res = await fetch(
      `${base(env)}/Items?Ids=${ids.join(',')}&Fields=MediaSources&EnableImages=false&EnableUserData=false${userParam}`,
      { headers: { Authorization: `MediaBrowser Token="${env.JELLYFIN_API_KEY}"` }, signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const len = Number(res.headers.get('Content-Length'));
    if (Number.isFinite(len) && len > BR_MAX_TEXT) return null;
    const text = await res.text();
    if (text.length > BR_MAX_TEXT) return null;
    const data = JSON.parse(text);
    if (!Array.isArray(data?.Items)) return null;
    const want = new Set(ids);
    const out = new Map(ids.map((id) => [id, 0])); // fehlt in erfolgreicher Antwort -> 0
    for (const it of data.Items) {
      const id = normId(it?.Id);
      if (!want.has(id)) continue;
      const b = Number(it?.MediaSources?.[0]?.Bitrate);
      out.set(id, Number.isFinite(b) && b > 0 ? Math.min(MAX_KBPS, Math.round(b / 1000)) : 0);
    }
    return out;
  } catch {
    return null;
  }
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return Math.round(n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2);
}

/* ---------- Lauf ---------- */

/** Rechnet ranges und users aus den Zeilen mit dem endgültigen br/fb (gleiche Nachschlageregel wie /me/stats). */
export function computeVolume(rows, br, fb, tr) {
  const today = rows.map((r) => r.today).find((t) => typeof t === 'string' && DATE_RE.test(t)) ?? null;
  const acc = Object.fromEntries(RANGES.map((r) => [r, { est: 0, ov: 0, secs: 0, known: 0, users: new Map() }]));
  for (const row of rows) {
    const id = normId(row.i);
    const uid = normId(row.u);
    const t = typeKey(row.t);
    if (!ID_RE.test(id) || !ID_RE.test(uid) || !t) continue;
    const kb = br[id] > 0 ? br[id] : fb[t];
    const ig = num(row.ig) > 0;
    for (const r of RANGES) {
      const s = Math.max(0, num(row[`w${COL[r]}`]));
      const a = acc[r];
      const bytes = s * kb * 125;
      a.est += bytes;
      a.secs += s;
      if (br[id] > 0) a.known += s;
      a.ov += Math.max(0, num(row[`o${COL[r]}`])) * kb * 125;
      if (!ig && bytes > 0) a.users.set(uid, (a.users.get(uid) ?? 0) + bytes);
    }
  }
  const ranges = {};
  const users = {};
  for (const r of RANGES) {
    const a = acc[r];
    const up = uploadFor(r, today, tr);
    const raw = up !== null && up > 0 && a.ov > 0 ? up / a.ov : null;
    const scaled = raw !== null && raw >= K_MIN && raw <= K_MAX;
    const k = scaled ? Math.round(raw * 1e6) / 1e6 : 1;
    ranges[r] = {
      est: Math.round(a.est),
      up: up === null ? null : Math.round(up),
      k,
      scaled,
      cov: a.secs > 0 ? Math.round((a.known / a.secs) * 1e4) / 1e4 : 0,
    };
    users[r] = {};
    for (const [uid, b] of a.users) users[r][uid] = Math.round(b * k);
  }
  return { ranges, users };
}

/** Stündlicher Volumen-Lauf. Wirft nie. */
export async function runVol(env, ctx) {
  void ctx;
  try {
    const now = Date.now();
    const [old, report] = await Promise.all([kvGet(env, VOL_KEY), kvGet(env, REPORT_KEY)]);
    const tr = trafficInfo(report, now);
    const [idsRes, rowsRes] = await Promise.allSettled([
      runCustomQueryRows(env, buildVolIds()),
      runCustomQueryRows(env, buildVolRows(tr?.ov)),
    ]);
    if (idsRes.status === 'rejected') console.error(LOG);
    // Ohne Volumen-Zeilen kein Schreiben: alter Stand bleibt in sich stimmig.
    if (rowsRes.status === 'rejected') {
      console.error(LOG);
      return;
    }
    const rows = rowsRes.value;

    // Typen und Priorität (Sekunden gesamt) je Titel
    const type = new Map();
    const weight = new Map();
    if (idsRes.status === 'fulfilled') {
      for (const r of idsRes.value) {
        const id = normId(r.ItemId);
        const t = typeKey(r.ItemType);
        if (ID_RE.test(id) && t) type.set(id, t);
      }
    }
    for (const r of rows) {
      const id = normId(r.i);
      const t = typeKey(r.t);
      if (!ID_RE.test(id) || !t) continue;
      if (!type.has(id)) type.set(id, t);
      weight.set(id, (weight.get(id) ?? 0) + Math.max(0, num(r.wa)));
    }

    // Bitraten: alter Stand, bei vollständiger ID-Liste auf gespielte Titel beschränkt
    let br = cleanBr(old?.br);
    if (idsRes.status === 'fulfilled') br = Object.fromEntries(Object.entries(br).filter(([id]) => type.has(id)));
    const missing = [...type.keys()].filter((id) => !(id in br)).sort((a, b) => (weight.get(b) ?? 0) - (weight.get(a) ?? 0) || (a < b ? -1 : 1));
    const blocks = [];
    for (let i = 0; i < missing.length && blocks.length < BR_BLOCKS; i += BR_BLOCK) blocks.push(missing.slice(i, i + BR_BLOCK));
    if (blocks.length) {
      const admin = await getAdminUserId(env).catch(() => null);
      const userParam = admin ? `&userId=${admin}` : '';
      const got = await Promise.all(blocks.map((ids) => fetchBlock(env, ids, userParam)));
      let failed = false;
      for (const m of got) {
        if (!m) {
          failed = true;
          continue;
        }
        for (const [id, kb] of m) br[id] = kb;
      }
      if (failed) console.error(LOG);
    }

    // Rückfall-Bitrate: Median je Typ über bekannte (> 0) Titel
    const per = { movie: [], episode: [] };
    for (const [id, kb] of Object.entries(br)) {
      const t = type.get(id);
      if (kb > 0 && t) per[t].push(kb);
    }
    const fb = { movie: median(per.movie) ?? FB_DEFAULT.movie, episode: median(per.episode) ?? FB_DEFAULT.episode };

    const { ranges, users } = computeVolume(rows, br, fb, tr);
    const out = { v: 1, at: now, ...(rows.length >= VOL_ROW_LIMIT ? { approx: 1 } : {}), br, fb, ranges, users };
    await env.CHARTS.put(VOL_KEY, JSON.stringify(out));
  } catch {
    console.error(LOG);
  }
}
