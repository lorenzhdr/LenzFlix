// LenzFlix shared: Suche + Genre-Kacheln.
import * as api from '../core/api.js';
import { cached } from '../core/cache.js';
import { BASE_PARAMS } from '../features/rows/logic.js';

const asItems = (res) => (Array.isArray(res) ? res : (res && Array.isArray(res.Items) ? res.Items : []));
const MIN_LEN = 2;

/** { movies, series, episodes, people } (rohe Items). Begriff < 2 Zeichen -> leer, ohne Request. */
export async function searchItems(q, { limit = 40, signal } = {}) {
  const out = { movies: [], series: [], episodes: [], people: [] };
  const term = String(q == null ? '' : q).trim();
  if (term.length < MIN_LEN) return out;
  const userId = api.getUserId();
  const get = (path, params) => api.getJson(path, { userId, ...params }, { signal }).then(asItems);
  const soft = (e) => {
    if (e && e.name === 'AbortError') throw e;
    return [];
  };
  const [titles, episodes, people] = await Promise.all([
    get('/Items', { ...BASE_PARAMS, searchTerm: term, IncludeItemTypes: 'Movie,Series', Recursive: true, Limit: limit }),
    get('/Items', { ...BASE_PARAMS, searchTerm: term, IncludeItemTypes: 'Episode', Recursive: true, Limit: 12 }).catch(soft),
    get('/Persons', { searchTerm: term, Limit: 8, Fields: 'PrimaryImageAspectRatio', ImageTypeLimit: 1 }).catch(soft),
  ]);
  out.movies = titles.filter((i) => i.Type === 'Movie');
  out.series = titles.filter((i) => i.Type === 'Series');
  out.episodes = episodes;
  out.people = people;
  return out;
}

async function tileFor(genre, parentId) {
  const own = genre.ImageTags && (genre.ImageTags.Thumb ? 'Thumb' : genre.ImageTags.Primary ? 'Primary' : null);
  if (own) return api.imageUrlFor(genre.Id, { type: own, tag: genre.ImageTags[own], maxWidth: 640 });
  const top = asItems(await api.getItems({
    ParentId: parentId || undefined, GenreIds: genre.Id, IncludeItemTypes: 'Movie,Series', Recursive: true,
    SortBy: 'CommunityRating', SortOrder: 'Descending', Limit: 5, Fields: 'BackdropImageTags', ImageTypeLimit: 1,
    EnableImageTypes: 'Backdrop', EnableUserData: false,
  }));
  const hit = top.find((i) => i.BackdropImageTags && i.BackdropImageTags.length);
  return hit ? api.imageUrlFor(hit.Id, { type: 'Backdrop', tag: hit.BackdropImageTags[0], maxWidth: 640 }) : null;
}

/** [{ id, name, imageUrl|null }] – Bild: eigenes Genre-Bild, sonst Backdrop des bestbewerteten Titels. */
export async function getGenreTiles({ parentId, limit = 12 } = {}) {
  const res = await api.getJson('/Genres', {
    userId: api.getUserId(), ParentId: parentId || undefined, IncludeItemTypes: 'Movie,Series', Recursive: true,
    SortBy: 'SortName', Fields: 'PrimaryImageAspectRatio',
  });
  const genres = asItems(res).filter((g) => g && g.Id && g.Name).slice(0, limit);
  return Promise.all(genres.map(async (g) => {
    let imageUrl;
    try {
      imageUrl = await cached(`genretile:${parentId || ''}:${g.Id}`, () => tileFor(g, parentId), 10 * 60 * 1000);
    } catch { imageUrl = null; }
    return { id: g.Id, name: g.Name, imageUrl };
  }));
}
