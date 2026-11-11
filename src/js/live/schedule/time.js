// LENZ LIVE Zeitplan: Zeitfunktionen. Planzone MEZ/MESZ rein arithmetisch (kein Intl, keine Lokalzeit-Methoden).
// Alles in absoluten ms (UTC). D = Sendetag-Nummer = Date.UTC(y, m, d) / 864e5 (ganzzahlig). Sendetag 05:00 bis 05:00.

export const MIN = 60000;
export const HOUR = 3600000;
export const GRID = 300000;

const lastSun = (y, m) => { const d = new Date(Date.UTC(y, m + 1, 0)); return d.getUTCDate() - d.getUTCDay(); };

/** Offset der Planzone gegenüber UTC in ms (1 h MEZ, 2 h MESZ; EU-Regel: letzter So im März/Oktober, 01:00 UTC). */
export const offsetMs = (u) => {
  const y = new Date(u).getUTCFullYear();
  const s = Date.UTC(y, 2, lastSun(y, 2), 1);
  const e = Date.UTC(y, 9, lastSun(y, 9), 1);
  return (u >= s && u < e ? 2 : 1) * 36e5;
};

/** Wanduhr (Kalendertag D, Minute des Tages `min`, darf > 1440 sein) → absolute ms. */
export const wallToUtc = (D, min) => {
  const L = D * 864e5 + min * 6e4;
  return L - offsetMs(L - offsetMs(L));
};

/** Grenzen des Sendetags D: start 05:00, end = 05:00 des Folgetags, Anker 20:15 / 22:00 / 23:00. */
export const dayBounds = (D) => ({
  start: wallToUtc(D, 300),
  end: wallToUtc(D + 1, 300),
  a2015: wallToUtc(D, 1215),
  a2200: wallToUtc(D, 1320),
  a2300: wallToUtc(D, 1380),
});

/** Sendetag, zu dem der Zeitpunkt t (ms) gehört (04:59 gehört zum Vortag). */
export const broadcastDayOf = (t) => {
  const w = t + offsetMs(t);
  const D = Math.floor(w / 864e5);
  return w - D * 864e5 < 5 * 36e5 ? D - 1 : D;
};

/** Sendetag-Nummer aus Kalenderdatum; Monat wie bei Date.UTC 0-basiert (0 = Januar). */
export const dayOfDate = (y, m, d) => Math.round(Date.UTC(y, m, d) / 864e5);

const two = (n) => (n < 10 ? '0' : '') + n;

/** 'HH:MM' in der Planzone. */
export const formatClock = (t) => {
  const w = t + offsetMs(t);
  const m = Math.floor((w - Math.floor(w / 864e5) * 864e5) / 6e4);
  return two(Math.floor(m / 60)) + ':' + two(m % 60);
};

const WD_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

/** { weekday: 'Mo', long: 'Montag', date: '11.11.' } zum Sendetag D. */
export const formatDay = (D) => {
  const wd = (((D + 4) % 7) + 7) % 7; // 1970-01-01 war ein Donnerstag
  const dt = new Date(D * 864e5);
  return { weekday: WD_SHORT[wd], long: WD_LONG[wd], date: two(dt.getUTCDate()) + '.' + two(dt.getUTCMonth() + 1) + '.' };
};

/** Wochenindex (Woche beginnt Montag). */
export const weekOf = (D) => Math.floor((D + 3) / 7);
/** Erster Sendetag (Montag) der Woche W. */
export const weekStart = (W) => 7 * W - 3;

/** Erster Sendetag D, an dem ein Titel mit addedAt t bereits im Pool ist (addedAt < dayStart(D)). */
export const admitDay = (t) => broadcastDayOf(t) + 1;

/** Datum aus Jellyfin (ISO). Ohne Zeitzonenangabe als UTC lesen (engine-unabhängig). NaN → null. */
export const parseDate = (s) => {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  if (typeof s !== 'string' || !s) return null;
  let x = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(x)) x += 'T00:00:00Z';
  else if (/T[\d:.]+$/.test(x)) x += 'Z';
  const t = Date.parse(x);
  return Number.isFinite(t) ? t : null;
};

/** Ticks (100 ns) → ms. */
export const ticksToMs = (t) => { const n = Math.round(Number(t) / 1e4); return Number.isFinite(n) ? n : 0; };
