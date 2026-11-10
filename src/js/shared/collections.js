// LenzFlix shared: Sammlungen (BoxSets) für die Studio-/Marken-Kacheln.
import * as api from '../core/api.js';
import { cached } from '../core/cache.js';

const asItems = (res) => (Array.isArray(res) ? res : (res && Array.isArray(res.Items) ? res.Items : []));
const FIELDS = 'ChildCount,ImageTags,BackdropImageTags';

function pickImage(b) {
  const tags = b.ImageTags || {};
  const bd = Array.isArray(b.BackdropImageTags) ? b.BackdropImageTags[0] : null;
  if (tags.Thumb) return { type: 'Thumb', tag: tags.Thumb };
  if (bd) return { type: 'Backdrop', tag: bd };
  if (tags.Primary) return { type: 'Primary', tag: tags.Primary };
  return null;
}

/** [{ id, name, imageUrl, imageType, href }]: erst BoxSets mit Tag, sonst die größten BoxSets. 5 min gecacht. */
export function getCollections({ tag = 'lenzplus', fallbackLimit = 8 } = {}) {
  return cached(`collections:${tag}:${fallbackLimit}`, async () => {
    const q = (params) => api.getItems({
      IncludeItemTypes: 'BoxSet', Recursive: true, Fields: FIELDS, ImageTypeLimit: 1,
      EnableImageTypes: 'Primary,Backdrop,Thumb', EnableUserData: false, ...params,
    }).then(asItems);
    let list = tag ? await q({ Tags: tag, SortBy: 'SortName', SortOrder: 'Ascending' }) : [];
    if (!list.length) {
      const all = await q({ SortBy: 'SortName', SortOrder: 'Ascending' });
      list = all.slice().sort((a, b) => (b.ChildCount || 0) - (a.ChildCount || 0)).slice(0, fallbackLimit);
    }
    return list.filter((b) => b && b.Id).map((b) => {
      const img = pickImage(b);
      return {
        id: b.Id,
        name: b.Name,
        imageUrl: img ? api.imageUrlFor(b.Id, { type: img.type, tag: img.tag, maxWidth: 640 }) : null,
        imageType: img ? img.type : null,
        href: `#/details?id=${b.Id}`,
      };
    });
  }, 5 * 60 * 1000);
}
