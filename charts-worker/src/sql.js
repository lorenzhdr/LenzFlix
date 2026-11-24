// Feste SQL-Vorlage. Einzige Variablen: drei validierte Integer (kein Nutzerinput).
export const DEFAULT_WINDOW_DAYS = 30;
export const DEFAULT_MIN_SECONDS = 300;
export const DEFAULT_MIN_SECONDS_MOVIE = 800;

/** Parst einen Integer-String strikt (nur Ziffern) und prüft den Bereich, sonst Default. */
export function safeInt(value, min, max, fallback) {
  const s = String(value ?? '').trim();
  if (!/^\d{1,6}$/.test(s)) return fallback;
  const n = Number(s);
  return n >= min && n <= max ? n : fallback;
}

export const windowDays = (v) => safeInt(v, 1, 365, DEFAULT_WINDOW_DAYS);
export const minSeconds = (v) => safeInt(v, 0, 3600, DEFAULT_MIN_SECONDS);
export const minSecondsMovie = (v) => safeInt(v, 0, 3600, DEFAULT_MIN_SECONDS_MOVIE);

export function buildSql(windowDaysValue, minSecondsValue, minSecondsMovieValue) {
  const days = windowDays(windowDaysValue);
  const secs = minSeconds(minSecondsValue);
  const movieSecs = minSecondsMovie(minSecondsMovieValue);
  // age = Alter des letzten Abrufs in ganzen Kalendertagen, als Sekunden (Vielfaches von 86400):
  // Mitternacht heute minus Mitternacht des Abruftags (DateCreated = lokale Serverzeit, wie 'now','localtime').
  return (
    'SELECT ItemId, ItemType, UserId, COUNT(*) AS plays, SUM(PlayDuration) AS secs, ' +
    "(strftime('%s','now','localtime','start of day') - strftime('%s', substr(MAX(DateCreated),1,10))) AS age " +
    'FROM PlaybackActivity ' +
    `WHERE ((ItemType = 'Movie' AND PlayDuration >= ${movieSecs}) ` +
    `OR (ItemType = 'Episode' AND PlayDuration >= ${secs})) ` +
    `AND DateCreated >= datetime('now','localtime','-${days} days') ` +
    'AND UserId NOT IN (SELECT UserId FROM UserList) ' +
    'GROUP BY ItemId, UserId'
  );
}
