// SQL-Bausteine für die Server-Statistik (Monat und Rekorde).
// Nur festes SQL; einzige Variablen sind geprüfte Ganzzahlen (Monatsversatz) sowie per Regex
// geprüfte Tage (YYYY-MM-DD) und Konto-IDs (32 Hex). Monatsgrenzen immer in der Lokalzeit der DB.
// Die Ignorierliste (UserList) ist in JEDER Abfrage ausgeschlossen.

export const MAX_M = 35;
export const MIN_BINGE_SECONDS = 300;
export const MIN_CONC_SECONDS = 60;
export const CONC_ROW_CAP = 5000;
export const BINGE_CANDIDATES = 10;

const BASE = "ItemType IN ('Movie','Episode') AND UserId NOT IN (SELECT UserId FROM UserList)";
const BASE_EP = "ItemType = 'Episode' AND UserId NOT IN (SELECT UserId FROM UserList)";
const FROM = 'FROM PlaybackActivity';

/** Query-Wert -> Ganzzahl 0..35 oder null. "01" ergibt 1. */
export function parseMonthParam(raw) {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw >= 0 && raw <= MAX_M ? raw : null;
  if (typeof raw !== 'string' || !/^\d{1,2}$/.test(raw)) return null;
  const n = parseInt(raw, 10);
  return n <= MAX_M ? n : null;
}

/** Wirft bei allem außer einer Ganzzahl 0..35. */
export function assertM(m) {
  if (!Number.isInteger(m) || m < 0 || m > MAX_M) throw new Error('invalid month');
  return m;
}

/** Fenster des Monats "heute minus m Monate" (Lokalzeit der DB). */
export function monthWindow(m) {
  return rawWindow(assertM(m));
}

function rawWindow(m) {
  const lo = `datetime('now','localtime','start of month','-${m} months')`;
  const hi =
    m === 0
      ? "datetime('now','localtime','start of month','+1 months')"
      : `datetime('now','localtime','start of month','-${m - 1} months')`;
  return `DateCreated >= ${lo} AND DateCreated < ${hi}`;
}

/** Laufender plus Vormonat (für die inkrementellen Rekordläufe). */
const RECENT = "DateCreated >= datetime('now','localtime','start of month','-1 months')";

/** Ein-Zeilen-Abfrage: aktueller Monat, heutiges Datum, erster Monat mit Daten, Monatsbeginn in UTC. */
export function buildMeta() {
  return (
    "SELECT strftime('%Y-%m', datetime('now','localtime')) AS ym, " +
    "date('now','localtime') AS today, " +
    "datetime('now','localtime','start of month','utc') AS monthStartUtc, " +
    `(SELECT substr(MIN(DateCreated),1,7) ${FROM} WHERE ${BASE}) AS first`
  );
}

/** Teilabfragen des Monats; alle liefern die Spalten k, a, b, c, d. */
export function buildMonthParts(m) {
  const w = monthWindow(m);
  const wp = rawWindow(m + 1); // m ist bis hierher geprüft, m+1 <= 36
  return {
    tot:
      "SELECT 'tot' AS k, COALESCE(SUM(PlayDuration),0) AS a, COUNT(*) AS b, COUNT(DISTINCT UserId) AS c, NULL AS d " +
      `${FROM} WHERE ${BASE} AND ${w}`,
    day:
      "SELECT 'day' AS k, substr(DateCreated,1,10) AS a, SUM(PlayDuration) AS b, COUNT(*) AS c, NULL AS d " +
      `${FROM} WHERE ${BASE} AND ${w} GROUP BY a`,
    hm:
      "SELECT 'hm' AS k, strftime('%w', substr(DateCreated,1,19)) AS a, strftime('%H', substr(DateCreated,1,19)) AS b, " +
      `SUM(PlayDuration) AS c, NULL AS d ${FROM} WHERE ${BASE} AND ${w} GROUP BY a, b`,
    dev:
      "SELECT 'dev' AS k, ClientName AS a, DeviceName AS b, SUM(PlayDuration) AS c, NULL AS d " +
      `${FROM} WHERE ${BASE} AND ${w} GROUP BY a, b`,
    pm:
      "SELECT 'pm' AS k, PlaybackMethod AS a, NULL AS b, SUM(PlayDuration) AS c, NULL AS d " +
      `${FROM} WHERE ${BASE} AND ${w} GROUP BY a`,
    ty:
      "SELECT 'ty' AS k, ItemType AS a, NULL AS b, SUM(PlayDuration) AS c, NULL AS d " +
      `${FROM} WHERE ${BASE} AND ${w} GROUP BY a`,
    prev:
      "SELECT 'prev' AS k, COALESCE(SUM(PlayDuration),0) AS a, NULL AS b, NULL AS c, NULL AS d " +
      `${FROM} WHERE ${BASE} AND ${wp}`,
  };
}

/** Alle Teile als eine UNION-ALL-Abfrage. */
export function buildMonth(m) {
  return Object.values(buildMonthParts(m)).join(' UNION ALL ');
}

/* ---------- Rekorde ---------- */

/** Rekordtag über die ganze Historie. */
export function buildRecDay() {
  return (
    `SELECT substr(DateCreated,1,10) AS d, SUM(PlayDuration) AS secs ${FROM} WHERE ${BASE} ` +
    'GROUP BY d ORDER BY secs DESC LIMIT 1'
  );
}

/** Rekordmonat über die ganze Historie. */
export function buildRecMonth() {
  return (
    `SELECT substr(DateCreated,1,7) AS ym, SUM(PlayDuration) AS secs ${FROM} WHERE ${BASE} ` +
    'GROUP BY ym ORDER BY secs DESC LIMIT 1'
  );
}

/**
 * Gleichzeitige Streams: Sweep mit Fensterfunktion über Start (+1) und Ende (-1).
 * Ende vor Start bei gleicher Sekunde. full = ganze Historie, sonst laufender und Vormonat.
 */
export function buildConc(full) {
  const w = full ? '1=1' : RECENT;
  const where = `${BASE} AND PlayDuration >= ${MIN_CONC_SECONDS} AND ${w}`;
  return (
    "SELECT strftime('%Y-%m-%d', t, 'unixepoch') AS date, c AS n FROM (" +
    'SELECT t, SUM(delta) OVER (ORDER BY t, delta ROWS UNBOUNDED PRECEDING) AS c FROM (' +
    `SELECT CAST(strftime('%s', substr(DateCreated,1,19)) AS INTEGER) AS t, 1 AS delta ${FROM} WHERE ${where} ` +
    'UNION ALL ' +
    `SELECT CAST(strftime('%s', substr(DateCreated,1,19)) AS INTEGER) + CAST(PlayDuration AS INTEGER) AS t, -1 AS delta ${FROM} WHERE ${where}` +
    ')) ORDER BY n DESC, t LIMIT 1'
  );
}

/** Rückfall: Start und Dauer der Zeilen für den Sweep im Worker (höchstens CONC_ROW_CAP). */
export function buildConcRows(full) {
  const w = full ? '1=1' : RECENT;
  return (
    `SELECT DateCreated AS s, PlayDuration AS dur ${FROM} ` +
    `WHERE ${BASE} AND PlayDuration >= ${MIN_CONC_SECONDS} AND ${w} ` +
    `ORDER BY DateCreated DESC LIMIT ${CONC_ROW_CAP}`
  );
}

/** Marathon, Schritt 1: die besten (Tag, Konto)-Paare nach Zahl gesehener Folgen. */
export function buildBingeCandidates(full) {
  const w = full ? '1=1' : RECENT;
  return (
    'SELECT d, u, COUNT(*) AS n FROM (' +
    `SELECT substr(DateCreated,1,10) AS d, UserId AS u, ItemId ${FROM} WHERE ${BASE_EP} AND ${w} ` +
    `GROUP BY d, u, ItemId HAVING SUM(PlayDuration) >= ${MIN_BINGE_SECONDS}` +
    `) GROUP BY d, u ORDER BY n DESC LIMIT ${BINGE_CANDIDATES}`
  );
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UID_RE = /^[0-9a-f]{32}$/;

/** Marathon, Schritt 2: Folgen-IDs je Kandidat. pairs = [{d,u}]; ungültige Paare werden verworfen. */
export function buildBingeEpisodes(pairs) {
  const ok = (Array.isArray(pairs) ? pairs : []).filter((p) => DAY_RE.test(p?.d) && UID_RE.test(p?.u));
  if (!ok.length) return null;
  const cond = ok.map((p) => `(substr(DateCreated,1,10) = '${p.d}' AND UserId = '${p.u}')`).join(' OR ');
  return (
    `SELECT substr(DateCreated,1,10) AS d, UserId AS u, ItemId ${FROM} WHERE ${BASE_EP} AND (${cond}) ` +
    `GROUP BY d, u, ItemId HAVING SUM(PlayDuration) >= ${MIN_BINGE_SECONDS}`
  );
}
