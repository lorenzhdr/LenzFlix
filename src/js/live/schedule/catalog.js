// LENZ LIVE Zeitplan: Katalog-Normalisierung (RawCatalog → Catalog). Rein, deterministisch, unabhängig von der Eingabereihenfolge.
import { cmpStr } from './hash.js';
import { ratingAge, maxAge } from './rating.js';
import { parseDate, ticksToMs, MIN, HOUR } from './time.js';

export const MIN_DUR = 5 * MIN;
export const MAX_DUR = 5 * HOUR;

/** Genre normalisieren (Vergleichsschlüssel). */
export const normGenre = (g) => String(g == null ? '' : g).trim().normalize('NFC').toLowerCase();

const cmpEp = (a, b) => (a.season - b.season) || (a.episode - b.episode) || (a.premiere === b.premiere ? 0 : a.premiere < b.premiere ? -1 : 1) || cmpStr(a.id, b.id);

/** Unterer Median (ganzzahlig, engine-unabhängig). arr: aufsteigend sortiert. */
export const lowerMedian = (arr) => (arr.length ? arr[Math.floor((arr.length - 1) / 2)] : 0);

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

function yearOf(ProductionYear, premiere) {
  const y = num(ProductionYear);
  if (y && y > 1800 && y < 3000) return Math.floor(y);
  if (premiere != null && Number.isFinite(premiere)) return new Date(premiere).getUTCFullYear();
  return null;
}

function genresOf(list, labelCounts) {
  const norm = [];
  const seen = new Set();
  for (const g of Array.isArray(list) ? list : []) {
    const label = String(g == null ? '' : g).trim().normalize('NFC');
    const n = label.toLowerCase();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    norm.push(n);
    let m = labelCounts.get(n);
    if (!m) labelCounts.set(n, (m = new Map()));
    m.set(label, (m.get(label) || 0) + 1);
  }
  norm.sort(cmpStr);
  return norm;
}

/** Eindeutige Ids, bei Doppelten gewinnt der in Code-Unit-Reihenfolge kleinere Roh-Eintrag (JSON) – unabhängig von der Eingabereihenfolge. */
function dedupe(list) {
  const arr = (Array.isArray(list) ? list : []).filter((x) => x && x.Id != null && x.Id !== '').map((x) => ({ x, id: String(x.Id) }));
  arr.sort((a, b) => cmpStr(a.id, b.id) || cmpStr(JSON.stringify(a.x), JSON.stringify(b.x)));
  const out = [];
  for (const r of arr) if (!out.length || out[out.length - 1].id !== r.id) out.push(r);
  return out;
}

/**
 * Catalog = {
 *   movies:  CatalogItem[] (nach id),  series: SeriesItem[] (nach id, nur mit planbaren Folgen),
 *   items:   Map<id, CatalogItem|SeriesItem>,
 *   boxsets: [{ id, name, childCount }], genres: [{ label, count }] (Titel = Filme + Serien),
 *   genreLabel(norm) → Anzeigelabel, loadedAt
 * }
 * CatalogItem = { id, kind: 'movie'|'episode', title, durMs, genres: string[] (normalisiert), year, premiere, addedAt, age,
 *                 seriesId?, seriesTitle?, season?, episode?, trailer }
 * SeriesItem  = { id, kind: 'series', title, genres, year, addedAt (eigenes DateCreated), age (nur eigene Freigabe),
 *                 eps: Episode[] kanonisch, epAddedSorted: number[], firstEpAdded, ageMax (strengste Freigabe inkl. Folgen),
 *                 totalMs, durMs (Median der Folgen) }
 */
export function normalizeCatalog(raw) {
  const r = raw || {};
  const labelCounts = new Map();
  const items = new Map();

  const movies = [];
  for (const { x, id } of dedupe(r.movies)) {
    const durMs = ticksToMs(x.RunTimeTicks);
    if (!(durMs >= MIN_DUR && durMs <= MAX_DUR)) continue;
    const premiere = parseDate(x.PremiereDate);
    const it = {
      id, kind: 'movie', title: String(x.Name == null ? '' : x.Name), durMs,
      genres: genresOf(x.Genres, labelCounts), year: yearOf(x.ProductionYear, premiere), premiere,
      addedAt: parseDate(x.DateCreated) ?? 0, age: ratingAge(x.OfficialRating), trailer: (num(x.LocalTrailerCount) || 0) > 0,
    };
    movies.push(it);
    items.set(id, it);
  }

  const rawSeries = dedupe(r.series);
  const byId = new Map(rawSeries.map((s) => [s.id, s]));
  const epsBy = new Map();
  for (const { x, id } of dedupe(r.episodes)) {
    const sid = x.SeriesId == null ? '' : String(x.SeriesId);
    if (!byId.has(sid)) continue;
    const season = num(x.ParentIndexNumber);
    if (season === 0) continue; // Staffel 0 (Extras) raus
    const hasRt = x.RunTimeTicks != null && Number(x.RunTimeTicks) > 0;
    const durMs = hasRt ? ticksToMs(x.RunTimeTicks) : null;
    if (hasRt && !(durMs >= MIN_DUR && durMs <= MAX_DUR)) continue;
    const prem = parseDate(x.PremiereDate);
    let list = epsBy.get(sid);
    if (!list) epsBy.set(sid, (list = []));
    list.push({
      id, kind: 'episode', title: String(x.Name == null ? '' : x.Name), durMs, seriesId: sid,
      seriesTitle: String(x.SeriesName == null ? (byId.get(sid).x.Name ?? '') : x.SeriesName),
      season: season == null ? 9999 : season, episode: num(x.IndexNumber) == null ? 9999 : num(x.IndexNumber),
      premiere: prem == null ? Infinity : prem, addedAt: parseDate(x.DateCreated) ?? 0, ownAge: ratingAge(x.OfficialRating),
    });
  }

  const series = [];
  for (const { x, id } of rawSeries) {
    const eps = epsBy.get(id) || [];
    const durs = eps.filter((e) => e.durMs != null).map((e) => e.durMs).sort((a, b) => a - b);
    const med = lowerMedian(durs);
    const keep = durs.length ? eps.filter((e) => { if (e.durMs == null) e.durMs = med; return true; }) : [];
    keep.sort(cmpEp);
    const own = ratingAge(x.OfficialRating);
    const genres = genresOf(x.Genres, labelCounts);
    const year = yearOf(x.ProductionYear, null);
    let ageMax = own;
    for (const e of keep) {
      e.age = maxAge(own, e.ownAge);
      ageMax = maxAge(ageMax, e.age);
      e.genres = genres;
      e.year = year;
      delete e.ownAge;
      Object.freeze(e);
      items.set(e.id, e);
    }
    const s = {
      id, kind: 'series', title: String(x.Name == null ? '' : x.Name), genres, year,
      addedAt: parseDate(x.DateCreated) ?? 0, age: own, ageMax, eps: keep,
      epAddedSorted: keep.map((e) => e.addedAt).sort((a, b) => a - b),
      firstEpAdded: 0, totalMs: 0, durMs: med,
    };
    s.firstEpAdded = s.epAddedSorted.length ? s.epAddedSorted[0] : 0;
    for (const e of keep) s.totalMs += e.durMs;
    items.set(id, s);
    if (keep.length) series.push(s);
  }

  const boxsets = dedupe(r.boxsets).map(({ x, id }) => ({ id, name: String(x.Name == null ? '' : x.Name), childCount: num(x.ChildCount) || 0 }));

  // Genre-Zählung und Anzeigelabel (häufigste Originalschreibweise, Gleichstand: kleinste Code-Unit-Folge)
  const labels = new Map();
  for (const [n, m] of labelCounts) {
    let best = null;
    let bc = -1;
    for (const [lab, c] of m) if (c > bc || (c === bc && cmpStr(lab, best) < 0)) { best = lab; bc = c; }
    labels.set(n, best);
  }
  const counts = new Map();
  for (const t of movies.concat(series)) for (const g of t.genres) counts.set(g, (counts.get(g) || 0) + 1);
  const genres = [...counts].map(([n, count]) => ({ norm: n, label: labels.get(n), count }))
    .sort((a, b) => (b.count - a.count) || cmpStr(a.norm, b.norm))
    .map((g) => ({ label: g.label, count: g.count, norm: g.norm }));

  return {
    movies, series, items, boxsets, genres,
    genreLabel: (n) => labels.get(n) ?? n,
    loadedAt: num(r.loadedAt) ?? 0,
  };
}
