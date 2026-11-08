// Feste SQL-Vorlage. Einzige Variablen: zwei validierte Integer (kein Nutzerinput).
export const DEFAULT_WINDOW_DAYS = 30;
export const DEFAULT_MIN_SECONDS = 120;

/** Parst einen Integer-String strikt (nur Ziffern) und prüft den Bereich, sonst Default. */
export function safeInt(value, min, max, fallback) {
  const s = String(value ?? '').trim();
  if (!/^\d{1,6}$/.test(s)) return fallback;
  const n = Number(s);
  return n >= min && n <= max ? n : fallback;
}

export const windowDays = (v) => safeInt(v, 1, 365, DEFAULT_WINDOW_DAYS);
export const minSeconds = (v) => safeInt(v, 0, 3600, DEFAULT_MIN_SECONDS);

export function buildSql(windowDaysValue, minSecondsValue) {
  const days = windowDays(windowDaysValue);
  const secs = minSeconds(minSecondsValue);
  return (
    'SELECT ItemId, ItemType, UserId, COUNT(*) AS plays, SUM(PlayDuration) AS secs ' +
    'FROM PlaybackActivity ' +
    "WHERE ItemType IN ('Movie','Episode') " +
    `AND PlayDuration >= ${secs} ` +
    `AND DateCreated >= datetime('now','localtime','-${days} days') ` +
    'AND UserId NOT IN (SELECT UserId FROM UserList) ' +
    'GROUP BY ItemId, UserId'
  );
}
