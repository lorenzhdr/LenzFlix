// VIDEOTHEK LENZ: lädt alle Filme + Serien des Benutzers (seitenweise), Weiterschauen und Favoriten und baut den Katalog.
import * as api from '../../core/api.js';
import { cached } from '../../core/cache.js';
import { putItems } from '../../core/itemstore.js';
import { buildCatalog } from './departments.js';

export const PAGE_SIZE = 500;
export const TTL_MS = 5 * 60 * 1000;
export const FIELDS = 'Overview,Genres,OfficialRating,ProductionYear,DateCreated,RunTimeTicks,CommunityRating,ChildCount,SortName,BackdropImageTags,PrimaryImageAspectRatio';

const asItems = (res) => (Array.isArray(res) ? res : (res && Array.isArray(res.Items) ? res.Items : []));

async function fetchAllTitles() {
  const out = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const res = await api.getItems({
      Recursive: true,
      IncludeItemTypes: 'Movie,Series',
      Fields: FIELDS,
      EnableUserData: true,
      ImageTypeLimit: 1,
      SortBy: 'SortName',
      SortOrder: 'Ascending',
      StartIndex: start,
      Limit: PAGE_SIZE,
    });
    const page = asItems(res);
    out.push(...page);
    const total = res && typeof res.TotalRecordCount === 'number' ? res.TotalRecordCount : null;
    if (page.length < PAGE_SIZE || (total !== null && out.length >= total)) break;
  }
  return out;
}

const soft = (p) => p.then(asItems).catch(() => []);

/** Katalog (siehe docs/store3d.md), 5 Minuten gecacht pro Benutzer. */
export function loadCatalog() {
  return cached(`store:catalog:${api.getUserId() || 'anon'}`, load, TTL_MS);
}

async function load() {
  const [items, resume, favorites] = await Promise.all([
    fetchAllTitles(),
    soft(api.getResume({ Limit: 12, MediaTypes: 'Video', Fields: FIELDS, EnableUserData: true, ImageTypeLimit: 1 })),
    soft(api.getItems({
      Recursive: true, Filters: 'IsFavorite', IncludeItemTypes: 'Movie,Series', Fields: FIELDS, EnableUserData: true, ImageTypeLimit: 1, SortBy: 'SortName',
    })),
  ]);
  putItems(items);
  putItems(resume);
  putItems(favorites);
  return buildCatalog({ items, resume, favorites, now: Date.now() });
}
