// LenzFlix shared: „Neu“-Erkennung (Film/Serie/Staffel/Folge) für Badges der Designs.
// Hinweis (live geprüft): Jellyfin 12.4 ignoriert `MinDateCreated` bei /Items – deshalb nach
// DateCreated absteigend sortieren und clientseitig filtern.
import * as api from '../core/api.js';
import { cached } from '../core/cache.js';
import { NEW_DAYS, isRecent } from '../features/rows/logic.js';

const TTL_MS = 5 * 60 * 1000;
const asArr = (res) => (Array.isArray(res) ? res : (res && Array.isArray(res.Items) ? res.Items : []));

/**
 * Serien-Id -> 'season' | 'episode'. Neue Folge (DateCreated im Fenster) mit IndexNumber===1 und
 * ParentIndexNumber>1 = neue Staffel, sonst neue Folge; 'season' gewinnt.
 */
export function newContentFrom(episodes, now = Date.now(), { days = NEW_DAYS } = {}) {
  const map = new Map();
  for (const e of episodes || []) {
    if (!e || !e.SeriesId || !isRecent(e.DateCreated, now, days)) continue;
    const isSeason = e.IndexNumber === 1 && e.ParentIndexNumber > 1;
    if (isSeason) map.set(e.SeriesId, 'season');
    else if (!map.has(e.SeriesId)) map.set(e.SeriesId, 'episode');
  }
  return map;
}

const emptyInfo = () => ({ bySeries: new Map(), newMovieIds: new Set(), newSeriesIds: new Set() });

async function load(now) {
  const [eps, titles] = await Promise.allSettled([
    api.getItems({
      IncludeItemTypes: 'Episode', Recursive: true, SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 500,
      Fields: 'DateCreated,ParentIndexNumber,IndexNumber,SeriesId', EnableImages: false, EnableUserData: false,
    }),
    api.getItems({
      IncludeItemTypes: 'Movie,Series', Recursive: true, SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 100,
      Fields: 'DateCreated', EnableImages: false, EnableUserData: false,
    }),
  ]);
  if (eps.status === 'rejected' && titles.status === 'rejected') throw eps.reason;
  const info = emptyInfo();
  if (eps.status === 'fulfilled') info.bySeries = newContentFrom(asArr(eps.value), now);
  if (titles.status === 'fulfilled') {
    for (const it of asArr(titles.value)) {
      if (!it || !it.Id || !isRecent(it.DateCreated, now)) continue;
      if (it.Type === 'Movie') info.newMovieIds.add(it.Id);
      else if (it.Type === 'Series') info.newSeriesIds.add(it.Id);
    }
  }
  return info;
}

/** { bySeries: Map, newMovieIds: Set, newSeriesIds: Set }, 5 min gecacht; bei Fehler leer. */
export async function getNewContentInfo() {
  try {
    return await cached('newcontent', () => load(Date.now()), TTL_MS);
  } catch (e) {
    console.warn('[LenzFlix] Neu-Info nicht verfügbar', e && e.message);
    return emptyInfo();
  }
}

function kind(item, info) {
  if (!item || !info) return null;
  if (item.Type === 'Movie') return info.newMovieIds && info.newMovieIds.has(item.Id) ? 'movie' : null;
  if (item.Type !== 'Series' && item.Type !== 'Episode') return null;
  const sid = item.Type === 'Episode' ? item.SeriesId : item.Id;
  // Komplett neue Serie: „Neue Serie“ schlägt Staffel/Folge (sonst wäre jede erste Folge „neu“).
  if (item.Type === 'Series' && info.newSeriesIds && info.newSeriesIds.has(sid)) return 'series';
  const s = info.bySeries && info.bySeries.get(sid);
  if (s === 'season') return 'season';
  if (s === 'episode') return 'episode';
  return null;
}

const CAPS = { movie: 'NEUER FILM', series: 'NEUE SERIE', season: 'NEUE STAFFEL', episode: 'NEUE FOLGE' };
const SENTENCE = { movie: 'Neuer Film', series: 'Neue Serie', season: 'Neue Staffel', episode: 'Neue Folge' };

export function newBadge(item, info) {
  const k = kind(item, info);
  return k ? CAPS[k] : null;
}

export function plusBadge(item, info) {
  const k = kind(item, info);
  return k ? SENTENCE[k] : null;
}
