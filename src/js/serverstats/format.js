// Server-Statistik: Formatierer (Deutsch, ohne Intl, deterministisch).

export const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];
export const WEEKDAYS = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];

export const T = {
  down: 'Der Server ist gerade nicht erreichbar, vermutlich ein Neustart. Die Werte erscheinen gleich wieder.',
  downStale:
    'Der Server ist gerade nicht erreichbar, vermutlich ein Neustart. Gezeigt wird der zuletzt gespeicherte Stand.',
  error: 'Statistik gerade nicht abrufbar.',
  retry: 'Erneut versuchen',
  loading: 'Lade …',
  idle: 'Gerade läuft nichts.',
  noData: 'Noch keine Daten vom Server.',
};

export const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
export const pos0 = (n) => (isNum(n) && n > 0 ? n : 0);

/** Deutsche Zahl: Punkt als Tausender, Komma als Dezimalzeichen, echtes Minus. */
export function num(n, dec = 0) {
  if (!isNum(n)) return '–';
  const s = Math.abs(n).toFixed(dec);
  const neg = n < 0 && Number(s) !== 0;
  const [i, f] = s.split('.');
  return (neg ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? ',' + f : '');
}

const p2 = (n) => (n < 10 ? '0' : '') + n;

/** Uhrzeit-Schreibweise: „12:10“ bzw. mit long „0:42:10“. */
export function fmtClock(secs, long) {
  const t = Math.max(0, Math.floor(isNum(secs) ? secs : 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return long || h > 0 ? `${h}:${p2(m)}:${p2(s)}` : `${m}:${p2(s)}`;
}

/** „182 h“, „182 h 15 min“, „45 min“. */
export function fmtHm(secs) {
  const total = Math.round(pos0(secs) / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${num(h)} h ${m} min` : `${num(h)} h`;
}

/** Dezimale Einheiten (kB, MB, GB, TB). dec überschreibt die automatische Nachkommastelle. */
export function fmtBytes(b, dec) {
  if (!isNum(b) || b < 0) return '–';
  const u = ['B', 'kB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let v = b;
  while (v >= 1000 && i < u.length - 1) {
    v /= 1000;
    i++;
  }
  const d = dec !== undefined ? dec : i < 2 ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${num(v, d)} ${u[i]}`;
}

export function fmtPct(frac, dec = 0) {
  return isNum(frac) ? `${num(frac * 100, dec)} %` : '–';
}

/** Veränderung zum Vormonat: „+12 %“, „−8 %“, „neu“ (Vormonat 0). */
export function fmtDelta(cur, prev) {
  if (!(prev > 0)) return cur > 0 ? 'neu' : '–';
  const r = Math.round(((pos0(cur) - prev) / prev) * 100);
  return r > 0 ? `+${num(r)} %` : r < 0 ? `−${num(-r)} %` : '0 %';
}

export function fmtMbps(n) {
  return isNum(n) ? `${num(n, 1)} Mbit/s` : '';
}

export function plural(n, one, many) {
  return `${num(n)} ${n === 1 ? one : many}`;
}

function ymParts(ym) {
  const m = /^(\d{4})-(\d{2})/.exec(String(ym || ''));
  if (!m || +m[2] < 1 || +m[2] > 12) return null;
  return { y: m[1], m: +m[2] };
}

/** „2026-11“ → „November 2026“ (mit only: „November“); ungültig → ''. */
export function monthName(ym, only) {
  const p = ymParts(ym);
  if (!p) return '';
  return only ? MONTHS[p.m - 1] : `${MONTHS[p.m - 1]} ${p.y}`;
}

/** „2026-10-03“ → „03.10.2026“ */
export function fmtDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

/** „2026-11-12“ → „Do., 12.11.“ */
export function fmtDayShort(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
  if (!m) return '';
  const wd = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  return `${WEEKDAYS[wd]}, ${m[3]}.${m[2]}.`;
}

/** „3 Tage 4 h“, „5 h 12 min“, „7 min“. */
export function fmtUptime(secs) {
  if (!isNum(secs) || secs < 0) return '';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d) return `${d} ${d === 1 ? 'Tag' : 'Tage'} ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}

/** Für „vor …“: „5 min“, „2 h“, „3 Tagen“. */
export function fmtAgo(secs) {
  const s = pos0(secs);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return d === 1 ? '1 Tag' : `${d} Tagen`;
}
