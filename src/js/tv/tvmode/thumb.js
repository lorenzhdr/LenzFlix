// TV-Modus · 16:9-Vorschaubild mit Typ-Fallback Thumb → Backdrop → Primary → Platzhalter in Senderfarbe.
// Vertrag: docs/tvmode.md („Bilder“). URLs nur über deps.imageUrl (ohne api_key/Token). Das Ergebnis je Id wird gemerkt.
import { channelColor, channelInk } from '../ui/logos.js';

export const THUMB_TYPES = ['Thumb', 'Backdrop', 'Primary'];

// id → Index des funktionierenden Typs bzw. -1 (nur Platzhalter). Gilt für alle Vorschaubilder der Seite.
const sharedCache = new Map();

/** Nur für Tests. */
export function resetThumbCache() {
  sharedCache.clear();
}

/**
 * @param {{ doc?: Document, deps?: { imageUrl?: (id: string, o: object) => string|null }, maxWidth?: number, cache?: Map<string, number> }} [o]
 * @returns {{ el: HTMLElement, set(imageItemId: string|null, channelNo: number): void, destroy(): void }}
 */
export function createThumb({ doc = document, deps = {}, maxWidth = 480, cache = sharedCache } = {}) {
  const el = doc.createElement('div');
  el.className = 'lfx-tvm__thumb';
  const img = doc.createElement('img');
  img.className = 'lfx-tvm__thumb-img';
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.loading = 'lazy';
  img.decoding = 'async';
  const no = doc.createElement('span');
  no.className = 'lfx-tvm__thumb-no';
  el.append(img, no);

  let cur = { id: null, ch: 0, idx: 0 };
  let alive = true;

  function placeholder() {
    if (cur.id) cache.set(cur.id, -1);
    el.classList.add('lfx-tvm__thumb--ph');
    el.style.background = channelColor(cur.ch || 1);
    el.style.color = channelInk(cur.ch || 1);
    no.textContent = cur.ch ? String(cur.ch) : '';
    img.hidden = true;
    img.removeAttribute('src');
  }

  function attempt(i) {
    const url = i < THUMB_TYPES.length && typeof deps.imageUrl === 'function'
      ? deps.imageUrl(cur.id, { type: THUMB_TYPES[i], maxWidth })
      : null;
    if (!url) {
      placeholder();
      return;
    }
    cur.idx = i;
    el.classList.remove('lfx-tvm__thumb--ph');
    el.style.background = '';
    el.style.color = '';
    no.textContent = '';
    img.hidden = false;
    if (img.getAttribute('src') !== url) img.src = url;
  }

  function onError() {
    if (!alive || !cur.id) return;
    if (cur.idx + 1 >= THUMB_TYPES.length) placeholder();
    else attempt(cur.idx + 1);
  }
  function onLoad() {
    if (alive && cur.id) cache.set(cur.id, cur.idx);
  }
  img.addEventListener('error', onError);
  img.addEventListener('load', onLoad);

  return {
    el,
    set(id, channelNo) {
      if (!alive) return;
      const ch = Number(channelNo) || 0;
      const nid = id || null;
      if (nid === cur.id && ch === cur.ch) return;
      cur = { id: nid, ch, idx: 0 };
      if (!nid) {
        placeholder();
        return;
      }
      const known = cache.get(nid);
      if (known === -1) placeholder();
      else attempt(typeof known === 'number' ? known : 0);
    },
    destroy() {
      alive = false;
      img.removeEventListener('error', onError);
      img.removeEventListener('load', onLoad);
      img.removeAttribute('src');
      el.remove();
    },
  };
}
