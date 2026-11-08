// LenzFlix newpopular: reine Logik (Datum, Auswahl) – ohne DOM/Netzwerk.

const MONTHS = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];

/** ISO-Datum -> {month:'NOV', day:'08'} (lokale Zeit, deutsch) oder null. */
export function dateParts(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return { month: MONTHS[d.getMonth()], day: String(d.getDate()).padStart(2, '0') };
}

/** ISO-Datum -> '8. November 2026' (deutsch) oder ''. */
export function longDate(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Statuszeile: Serien mit neuer Folge (und nicht neu angelegt) -> 'Neue Folgen', sonst 'Neu seit <Datum>'. */
export function sinceLabel(item, newSeriesIds, now = Date.now()) {
  const created = Date.parse(item && item.DateCreated);
  const recent = !Number.isNaN(created) && now - created < 14 * 86400000;
  const has = newSeriesIds && typeof newSeriesIds.has === 'function' && newSeriesIds.has(item.Id);
  if (item && item.Type === 'Series' && has && !recent) return 'Neue Folgen';
  const d = longDate(item && item.DateCreated);
  return d ? `Neu seit ${d}` : 'Neu';
}

/** true, wenn mindestens ein Item eine PlayCount > 0 hat. */
export function hasPlayCounts(items) {
  return (items || []).some((i) => Number(i && i.UserData && i.UserData.PlayCount) > 0);
}

/** Dedupliziert und begrenzt auf Filme/Serien. */
export function uniqueTitles(items, limit = Infinity) {
  const seen = new Set();
  const out = [];
  for (const it of items || []) {
    if (!it || !it.Id || (it.Type !== 'Movie' && it.Type !== 'Series') || seen.has(it.Id)) continue;
    seen.add(it.Id);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}
