// VIDEOTHEK LENZ: Einteilung des Katalogs in Abteilungen. REIN (keine Imports, kein State): Regeln siehe docs/store3d.md.
export const NEW_DAYS = 14;
export const NEW_MAX = 24;
export const MIN_SERIES_GENRE = 6;
export const MIN_MOVIE_GENRE = 8;
export const HIGHLIGHT_MAX = 8;
export const HIGHLIGHT_RATING = 7.5;

const DAY_MS = 86400000;
const ADULT = new Set(['FSK-18', '18', 'DE-18', 'NC-17', 'X', 'R18', 'R18+', 'AO']);
const KIDS_GENRES = new Set(['animation', 'familie', 'kids', 'kinder']);
const KIDS_RATINGS = new Set(['FSK-0', 'FSK-6', '0', '6', '']);

// Kräftige 90er-Neonfarben; Abteilungen bekommen deterministisch eine daraus (Hash des Schlüssels).
export const NEON = ['#ff3d7f', '#00e5ff', '#7cff3d', '#ffa826', '#b455ff', '#3d7bff', '#ff5a3d', '#2affb2', '#ff4df0', '#e8ff3d'];
const FIXED = { new: '#ffd23f', kids: '#4dd2ff', adult: '#ff2a3a', misc: '#c7cde8', 'series-misc': '#aab4ff' };

const norm = (s) => String(s == null ? '' : s).trim();
const sortKey = (it) => norm(it.SortName || it.Name).toLowerCase();
const byName = (a, b) => sortKey(a).localeCompare(sortKey(b), 'de');

export function isAdult(item) {
  return ADULT.has(norm(item && item.OfficialRating).toUpperCase());
}

export function isKids(item) {
  if (isAdult(item)) return false;
  const genres = ((item && item.Genres) || []).map((g) => norm(g).toLowerCase());
  if (!genres.some((g) => KIDS_GENRES.has(g))) return false;
  return KIDS_RATINGS.has(norm(item.OfficialRating).toUpperCase());
}

export function mediaOf(item) {
  if (item.Type === 'Series') return 'box';
  const y = Number(item.ProductionYear);
  return y > 0 && y < 2000 ? 'vhs' : 'dvd';
}

export function isNewItem(item, now) {
  const t = Date.parse(item.DateCreated || '');
  if (!Number.isFinite(t)) return false;
  const age = now - t;
  return age >= 0 && age < NEW_DAYS * DAY_MS;
}

function progressOf(item) {
  const ud = item.UserData || {};
  if (ud.PlayedPercentage > 0) return Math.min(1, ud.PlayedPercentage / 100);
  if (ud.PlaybackPositionTicks > 0 && item.RunTimeTicks > 0) return Math.min(1, ud.PlaybackPositionTicks / item.RunTimeTicks);
  return 0;
}

function decorate(item, now) {
  const ud = item.UserData || {};
  return { ...item, lfx: { media: mediaOf(item), isNew: isNewItem(item, now), progress: progressOf(item), watched: Boolean(ud.Played) } };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Schildfarbe einer Abteilung (deterministisch pro Abteilungs-ID). */
export function departmentColor(id, kind) {
  return FIXED[id] || FIXED[kind] || NEON[hash(String(id)) % NEON.length];
}

function dept(id, label, kind, list) {
  return { id, label, kind, color: departmentColor(id, kind), itemIds: [...list].sort(byName).map((i) => i.Id) };
}

/** Gruppiert nach erstem Genre; kleine Gruppen (< min) und Titel ohne Genre wandern in `rest`. */
function groupByGenre(list, min) {
  const groups = new Map();
  const rest = [];
  for (const it of list) {
    const g = norm((it.Genres || [])[0]);
    if (!g) { rest.push(it); continue; }
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(it);
  }
  const big = [];
  for (const [g, arr] of groups) {
    if (arr.length >= min) big.push([g, arr]);
    else rest.push(...arr);
  }
  big.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'de'));
  return { big, rest };
}

/**
 * { items, resume, favorites } (rohe Jellyfin-Items) -> Catalog { items: Map, departments, resume, favorites, highlights }.
 * Reihenfolge der Abteilungen: Neuheiten, Kinder, Filme-Genres, Querbeet, Serien-Genres, Serien · Mehr, Ab 18.
 */
export function buildCatalog({ items = [], resume = [], favorites = [], now = Date.now() } = {}) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const map = new Map();
  for (const raw of items) {
    if (!raw || !raw.Id || (raw.Type !== 'Movie' && raw.Type !== 'Series') || map.has(raw.Id)) continue;
    map.set(raw.Id, decorate(raw, t));
  }
  const all = [...map.values()];
  const adult = all.filter(isAdult);
  const rest = all.filter((i) => !isAdult(i));
  const kids = rest.filter(isKids);
  const normal = rest.filter((i) => !isKids(i));
  const series = normal.filter((i) => i.Type === 'Series');
  const movies = normal.filter((i) => i.Type === 'Movie');

  const departments = [];
  const fresh = rest
    .filter((i) => i.lfx.isNew)
    .sort((a, b) => Date.parse(b.DateCreated) - Date.parse(a.DateCreated))
    .slice(0, NEW_MAX);
  if (fresh.length) departments.push(dept('new', 'Neuheiten', 'new', fresh));
  if (kids.length) departments.push(dept('kids', 'Kinder', 'kids', kids));

  const mg = groupByGenre(movies, MIN_MOVIE_GENRE);
  for (const [g, arr] of mg.big) departments.push(dept(`genre-${g}`, g, 'genre', arr));
  if (mg.rest.length) departments.push(dept('misc', 'Querbeet', 'misc', mg.rest));

  const sg = groupByGenre(series, MIN_SERIES_GENRE);
  for (const [g, arr] of sg.big) departments.push(dept(`series-${g}`, `Serien · ${g}`, 'series', arr));
  if (sg.rest.length) departments.push(dept('series-misc', 'Serien · Mehr', 'series', sg.rest));

  if (adult.length) departments.push(dept('adult', 'Ab 18', 'adult', adult));

  const link = (list) => (list || []).filter((i) => i && i.Id).map((i) => map.get(i.Id) || decorate(i, t));
  const highlights = rest
    .filter((i) => (i.lfx.isNew || i.CommunityRating >= HIGHLIGHT_RATING) && i.BackdropImageTags && i.BackdropImageTags.length)
    .sort((a, b) => Number(b.lfx.isNew) - Number(a.lfx.isNew) || (b.CommunityRating || 0) - (a.CommunityRating || 0) || byName(a, b))
    .slice(0, HIGHLIGHT_MAX);

  // Favoriten: Antwort der Favoriten-Abfrage plus alle Titel, deren UserData.IsFavorite gesetzt ist (falls die Abfrage leer/fehlgeschlagen ist)
  const favMap = new Map(link(favorites).map((i) => [i.Id, i]));
  for (const i of all) if (i.UserData && i.UserData.IsFavorite && !favMap.has(i.Id)) favMap.set(i.Id, i);
  return { items: map, departments, resume: link(resume), favorites: [...favMap.values()], highlights };
}
