// LenzFlix rows: reine Logik (ohne DOM/Netzwerk) – gut testbar.

export const NEW_DAYS = 14;
const DAY_MS = 86400000;

export const ITEM_FIELDS = [
  'PrimaryImageAspectRatio', 'Overview', 'Genres', 'DateCreated', 'ParentId', 'ImageTags', 'BackdropImageTags',
  'ParentThumbItemId', 'ParentThumbImageTag', 'ParentBackdropItemId', 'ParentBackdropImageTags', 'SeriesId',
  'SeriesPrimaryImageTag', 'ChildCount', 'RecursiveItemCount', 'OfficialRating', 'ProductionYear', 'RunTimeTicks',
  'ParentLogoItemId', 'ParentLogoImageTag',
].join(',');

export const BASE_PARAMS = {
  Fields: ITEM_FIELDS,
  EnableUserData: true,
  ImageTypeLimit: 1,
  EnableImageTypes: 'Primary,Backdrop,Thumb,Logo',
};

export function isRecent(dateStr, now = Date.now(), days = NEW_DAYS) {
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return false;
  return now - t < days * DAY_MS;
}

/** Badge-Text für ein Item oder null. newSeriesIds: Set/Array von Serien-Ids mit neuen Folgen. */
export function badgeFor(item, newSeriesIds, now = Date.now()) {
  if (!item) return null;
  if (item.Type === 'Movie') return isRecent(item.DateCreated, now) ? 'Neu hinzugefügt' : null;
  if (item.Type === 'Series') {
    if (isRecent(item.DateCreated, now)) return 'Neu hinzugefügt';
    const has = newSeriesIds && (typeof newSeriesIds.has === 'function' ? newSeriesIds.has(item.Id) : newSeriesIds.includes(item.Id));
    return has ? 'Neue Folgen' : null;
  }
  return null;
}

/** Die 10 zuletzt hinzugefügten Filme/Serien, neueste zuerst (dedupliziert). */
export function selectTop10(items) {
  const seen = new Set();
  const list = [];
  for (const it of items || []) {
    if (!it || !it.Id || (it.Type !== 'Movie' && it.Type !== 'Series') || seen.has(it.Id)) continue;
    seen.add(it.Id);
    list.push(it);
  }
  const ts = (it) => { const t = Date.parse(it.DateCreated); return Number.isNaN(t) ? -Infinity : t; };
  return list
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (ts(b.it) - ts(a.it)) || (a.i - b.i))
    .slice(0, 10)
    .map((x) => x.it);
}

/** Abspielfortschritt 0–100 oder 0. */
export function progressPercent(item) {
  const ud = item && item.UserData;
  if (!ud) return 0;
  let p = Number(ud.PlayedPercentage);
  if (!(p > 0) && ud.PlaybackPositionTicks && item.RunTimeTicks) p = (ud.PlaybackPositionTicks / item.RunTimeTicks) * 100;
  if (!(p > 0)) return 0;
  return Math.min(100, Math.max(0, p));
}

// ------------------------------------------------------------ Zufall mit Seed
export function dayKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(arr, seed) {
  const out = arr.slice();
  const rnd = mulberry32(hashString(String(seed)));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Wählt deterministisch (pro Tag) Genre-Namen. genres: Namen oder {Name, MovieCount?, SeriesCount?}. */
export function pickGenres(genres, { seed, count = 6, minTitles = 8 } = {}) {
  const names = [];
  for (const g of genres || []) {
    const name = typeof g === 'string' ? g : g && g.Name;
    if (!name) continue;
    if (typeof g === 'object') {
      const known = g.MovieCount != null || g.SeriesCount != null;
      if (known && (g.MovieCount || 0) + (g.SeriesCount || 0) < minTitles) continue;
    }
    if (!names.includes(name)) names.push(name);
  }
  names.sort((a, b) => a.localeCompare(b, 'de'));
  return seededShuffle(names, seed).slice(0, count);
}
