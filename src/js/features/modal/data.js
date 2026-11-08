// LenzFlix Modal: Datenzugriff (api.js + cached 5 min + itemstore).
import * as api from '../../core/api.js';
import { cached } from '../../core/cache.js';
import { putItems, getStoredItem } from '../../core/itemstore.js';

const TTL = 5 * 60_000;
export const ITEM_FIELDS = 'Overview,Genres,People,Studios,Taglines,OfficialRating,ProductionYear,RunTimeTicks,ChildCount,RemoteTrailers,MediaSources,Width,ImageTags,BackdropImageTags,UserData';
const LIST_FIELDS = 'Overview,UserData,ImageTags,RunTimeTicks,ProductionYear,OfficialRating';

const itemsOf = (res) => (res && res.Items) || [];

export async function loadItem(id) {
  const item = await cached(`lfx:modal:item:${id}`, () => api.getItem(id, { Fields: ITEM_FIELDS }), TTL);
  if (item) putItems([item]);
  return item;
}

export async function loadSeasons(seriesId) {
  const items = itemsOf(await cached(`lfx:modal:seasons:${seriesId}`, () => api.getSeasons(seriesId, { Fields: 'Overview,UserData,ImageTags' }), TTL));
  putItems(items);
  return items;
}

export async function loadEpisodes(seriesId, seasonId) {
  const items = itemsOf(await cached(`lfx:modal:eps:${seriesId}:${seasonId}`, () => api.getEpisodes(seriesId, { SeasonId: seasonId, Fields: LIST_FIELDS }), TTL));
  putItems(items);
  return items;
}

export async function loadNextUp(seriesId) {
  const items = itemsOf(await cached(`lfx:modal:next:${seriesId}`, () => api.getNextUp({ SeriesId: seriesId, Limit: 1, Fields: LIST_FIELDS }), 60_000));
  putItems(items);
  return items[0] || null;
}

export async function loadSimilar(id) {
  const items = itemsOf(await cached(`lfx:modal:similar:${id}`, () => api.getSimilar(id, { Limit: 12, Fields: LIST_FIELDS }), TTL));
  putItems(items);
  return items;
}

export async function loadCollection(id) {
  const items = itemsOf(await cached(`lfx:modal:coll:${id}`, () => api.getItems({ ParentId: id, SortBy: 'PremiereDate,SortName', Fields: LIST_FIELDS }), TTL));
  putItems(items);
  return items;
}

export { getStoredItem };

/** Gefällt mir: likes=true setzen oder Bewertung löschen (null). */
export async function setLike(id, likes) {
  const { token, userId } = api.getAuth();
  const res = await fetch(api.buildUrl(`/Users/${userId}/Items/${id}/Rating`, likes ? { likes: true } : undefined), {
    method: likes ? 'POST' : 'DELETE',
    headers: { Authorization: `MediaBrowser Token="${token}"` },
  });
  if (!res.ok) throw new Error(`LenzFlix API: HTTP ${res.status} (Bewertung)`);
}
