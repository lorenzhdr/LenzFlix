// SQL-Builder für „Meine Statistik“ (siehe docs/stats-queries.sql).
// Einzige Variablen im SQL: die validierte UID (32 Hex) und ein Fragment aus der festen RANGES-Whitelist.
// Die Mindestdauer (300 s) ist eine Konstante im Code.

export const MIN_COUNT_SECONDS = 300;
export const ROW_CAP = 3000;

/** Whitelist: range -> { where: festes SQL-Fragment, unit, bucket: Bucket-Ausdruck für Q3 }. */
export const RANGES = Object.freeze({
  '7d': {
    where: "DateCreated >= datetime('now','localtime','-7 days')",
    unit: 'day',
    bucket: 'substr(DateCreated,1,10)',
  },
  '30d': {
    where: "DateCreated >= datetime('now','localtime','-30 days')",
    unit: 'day',
    bucket: 'substr(DateCreated,1,10)',
  },
  year: {
    where: "DateCreated >= datetime('now','localtime','start of year')",
    unit: 'week',
    bucket: "strftime('%Y-%W', substr(DateCreated,1,19))",
  },
  all: { where: '1=1', unit: 'month', bucket: 'substr(DateCreated,1,7)' },
});

export const isRange = (v) => typeof v === 'string' && Object.prototype.hasOwnProperty.call(RANGES, v);

/** UserId normalisieren: Bindestriche raus, klein. */
export const normUserId = (v) => String(v ?? '').replace(/-/g, '').toLowerCase();

/** Strikte Prüfung; wirft bei allem außer 32 Kleinbuchstaben-Hex. */
export function assertUid(uid) {
  if (typeof uid !== 'string' || !/^[0-9a-f]{32}$/.test(uid)) throw new Error('invalid uid');
  return uid;
}

function frag(uid, range) {
  assertUid(uid);
  if (!isRange(range)) throw new Error('invalid range');
  return { u: uid, r: RANGES[range] };
}

const MV_EP = "ItemType IN ('Movie','Episode')";

export function buildQ1(uid, range) {
  const { u, r } = frag(uid, range);
  return (
    'SELECT COALESCE(SUM(PlayDuration),0) AS secs, COUNT(*) AS plays, ' +
    'COUNT(DISTINCT substr(DateCreated,1,10)) AS activeDays, ' +
    'MIN(DateCreated) AS firstAt, MAX(DateCreated) AS lastAt, ' +
    `(SELECT COUNT(*) FROM UserList WHERE UserId = '${u}') AS ignored ` +
    'FROM PlaybackActivity ' +
    `WHERE UserId = '${u}' AND ${MV_EP} AND ${r.where}`
  );
}

export function buildQ2(uid, range) {
  const { u, r } = frag(uid, range);
  return (
    'SELECT ItemId, ItemType, COUNT(*) AS plays, SUM(PlayDuration) AS secs, MAX(DateCreated) AS lastAt ' +
    'FROM PlaybackActivity ' +
    `WHERE UserId = '${u}' AND ${MV_EP} AND ${r.where} ` +
    'GROUP BY ItemId, ItemType ' +
    `HAVING SUM(PlayDuration) >= ${MIN_COUNT_SECONDS} ` +
    `ORDER BY secs DESC LIMIT ${ROW_CAP}`
  );
}

export function buildQ2b(uid, range) {
  const { u, r } = frag(uid, range);
  return (
    'SELECT ItemType, COUNT(*) AS n FROM (' +
    'SELECT ItemId, ItemType FROM PlaybackActivity ' +
    `WHERE UserId = '${u}' AND ${MV_EP} AND ${r.where} ` +
    `GROUP BY ItemId, ItemType HAVING SUM(PlayDuration) >= ${MIN_COUNT_SECONDS}` +
    ') GROUP BY ItemType'
  );
}

export function buildQ3(uid, range) {
  const { u, r } = frag(uid, range);
  return (
    `SELECT ${r.bucket} AS bucket, SUM(PlayDuration) AS secs ` +
    'FROM PlaybackActivity ' +
    `WHERE UserId = '${u}' AND ${MV_EP} AND ${r.where} ` +
    'GROUP BY bucket ORDER BY bucket'
  );
}

export function buildQ4(uid, range) {
  const { u, r } = frag(uid, range);
  return (
    "SELECT strftime('%w', substr(DateCreated,1,19)) AS dow, strftime('%H', substr(DateCreated,1,19)) AS hr, " +
    'SUM(PlayDuration) AS secs ' +
    'FROM PlaybackActivity ' +
    `WHERE UserId = '${u}' AND ${MV_EP} AND ${r.where} ` +
    'GROUP BY dow, hr'
  );
}

export function buildQ5a(uid, range) {
  const { u, r } = frag(uid, range);
  return (
    'SELECT substr(DateCreated,1,10) AS day, SUM(PlayDuration) AS secs ' +
    'FROM PlaybackActivity ' +
    `WHERE UserId = '${u}' AND ${MV_EP} AND ${r.where} ` +
    'GROUP BY day ORDER BY secs DESC LIMIT 1'
  );
}

export function buildQ5b(uid, range) {
  const { u, r } = frag(uid, range);
  return (
    'SELECT substr(DateCreated,1,10) AS day, ItemId, SUM(PlayDuration) AS secs ' +
    'FROM PlaybackActivity ' +
    `WHERE UserId = '${u}' AND ItemType = 'Episode' AND ${r.where} ` +
    'GROUP BY day, ItemId ' +
    `HAVING SUM(PlayDuration) >= ${MIN_COUNT_SECONDS} ` +
    `ORDER BY secs DESC LIMIT ${ROW_CAP}`
  );
}

export function buildQ6a(uid, range) {
  const { u, r } = frag(uid, range);
  return (
    'SELECT ClientName, DeviceName, COUNT(*) AS plays, SUM(PlayDuration) AS secs ' +
    'FROM PlaybackActivity ' +
    `WHERE UserId = '${u}' AND ${MV_EP} AND ${r.where} ` +
    'GROUP BY ClientName, DeviceName ORDER BY secs DESC LIMIT 5'
  );
}

export function buildQ6b(uid, range) {
  const { u, r } = frag(uid, range);
  return (
    'SELECT PlaybackMethod, COUNT(*) AS plays, SUM(PlayDuration) AS secs ' +
    'FROM PlaybackActivity ' +
    `WHERE UserId = '${u}' AND ${MV_EP} AND ${r.where} ` +
    'GROUP BY PlaybackMethod'
  );
}

export function buildQ7(uid, range) {
  const { u, r } = frag(uid, range);
  return (
    'SELECT COUNT(*) AS n, AVG(t) AS avgSecs, ' +
    'SUM(CASE WHEN t > (SELECT COALESCE(SUM(PlayDuration),0) FROM PlaybackActivity ' +
    `WHERE UserId = '${u}' AND ${MV_EP} AND ${r.where}) THEN 1 ELSE 0 END) AS ahead ` +
    'FROM (' +
    'SELECT UserId, SUM(PlayDuration) AS t FROM PlaybackActivity ' +
    `WHERE ${MV_EP} AND ${r.where} AND UserId NOT IN (SELECT UserId FROM UserList) ` +
    'GROUP BY UserId)'
  );
}
