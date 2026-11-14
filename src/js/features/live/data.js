// LENZ LIVE: lädt den RawCatalog (Filme, Serien, Folgen, Sammlungen; schlanke Felder, keine Bilder/UserData; docs/live.md).
// Cache pro Benutzer und Sendetag: IndexedDB `lfx-live`/`catalog` (Schlüssel `<uid>:<Sendetag>`, ältere Einträge des Benutzers werden
// ersetzt), ohne IndexedDB Speicher-Cache (core/cache.js). Es landen keine Tokens im Cache.
import * as api from '../../core/api.js';
import { cached } from '../../core/cache.js';

export const PAGE_SIZE = 1000;
export const EPISODE_PAGE_SIZE = 2000;
export const MEM_TTL_MS = 6 * 60 * 60 * 1000;
export const DAY_START_SHIFT_MS = 5 * 60 * 60 * 1000; // Sendetag beginnt um 5:00 lokaler Zeit
const DB_NAME = 'lfx-live';
const STORE = 'catalog';

const BASE_FIELDS = 'Genres,OfficialRating,ProductionYear,PremiereDate,DateCreated,RunTimeTicks';

// Welche Felder je Typ in den Katalog (und Cache) wandern.
export const KEEP = {
  movies: ['Id', 'Name', 'RunTimeTicks', 'Genres', 'OfficialRating', 'ProductionYear', 'PremiereDate', 'DateCreated', 'LocalTrailerCount', 'ImageTags', 'BackdropImageTags'],
  series: ['Id', 'Name', 'Genres', 'OfficialRating', 'ProductionYear', 'DateCreated', 'ImageTags', 'BackdropImageTags'],
  episodes: ['Id', 'Name', 'SeriesId', 'SeriesName', 'ParentIndexNumber', 'IndexNumber', 'RunTimeTicks', 'PremiereDate', 'DateCreated', 'OfficialRating'],
  boxsets: ['Id', 'Name', 'ChildCount'],
};

const SOURCES = [
  { key: 'movies', type: 'Movie', fields: BASE_FIELDS, size: PAGE_SIZE, tags: true },
  { key: 'series', type: 'Series', fields: BASE_FIELDS, size: PAGE_SIZE, tags: true },
  { key: 'episodes', type: 'Episode', fields: 'DateCreated,PremiereDate,RunTimeTicks,OfficialRating', size: EPISODE_PAGE_SIZE },
  { key: 'boxsets', type: 'BoxSet', fields: 'ChildCount', size: PAGE_SIZE },
];

const asItems = (res) => (Array.isArray(res) ? res : (res && Array.isArray(res.Items) ? res.Items : []));

function compact(item, keys) {
  const out = {};
  for (const k of keys) if (item[k] !== undefined && item[k] !== null) out[k] = item[k];
  if (out.ImageTags) { // schlank: nur Thumb/Primary (Bild-Kennung `tag` → Browser-Cache, docs/tvmode.md „Bilder“)
    const t = {};
    if (out.ImageTags.Thumb) t.Thumb = out.ImageTags.Thumb;
    if (out.ImageTags.Primary) t.Primary = out.ImageTags.Primary;
    out.ImageTags = t;
  }
  if (Array.isArray(out.BackdropImageTags)) out.BackdropImageTags = out.BackdropImageTags.slice(0, 1);
  return out;
}

/** Sendetag (lokales Datum von now − 5 h) als YYYY-MM-DD. */
export function broadcastDayKey(now = Date.now()) {
  const d = new Date(now - DAY_START_SHIFT_MS);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const cacheKey = (uid, now) => `${uid || 'anon'}:${broadcastDayKey(now)}`;

async function fetchType(src, onPart) {
  const out = [];
  const seen = new Set();
  let total = null;
  for (let start = 0; ; start += src.size) {
    const res = await api.getItems({
      Recursive: true,
      IncludeItemTypes: src.type,
      Fields: src.fields,
      // Filme/Serien liefern Bild-Tags (ImageTypeLimit 1); Folgen/Sammlungen ohne Bilder
      ...(src.tags ? { EnableImages: true, ImageTypeLimit: 1, EnableImageTypes: 'Primary,Thumb,Backdrop' } : { EnableImages: false }),
      EnableUserData: false,
      StartIndex: start,
      Limit: src.size,
    });
    const page = asItems(res);
    for (const it of page) {
      if (!it || !it.Id || seen.has(it.Id)) continue;
      seen.add(it.Id);
      out.push(compact(it, KEEP[src.key]));
    }
    if (res && typeof res.TotalRecordCount === 'number') total = res.TotalRecordCount;
    const done = page.length < src.size || (total !== null && start + src.size >= total);
    onPart(src.key, done ? 1 : (total ? Math.min(0.99, (start + src.size) / total) : 0.5));
    if (done) break;
  }
  return out;
}

/** Lädt alle vier Teilkataloge parallel. onProgress(fraction 0..1, label) pro Teilabruf. */
export async function fetchCatalog({ onProgress } = {}, now = Date.now()) {
  const part = {};
  const report = () => {
    if (typeof onProgress !== 'function') return;
    const f = SOURCES.reduce((s, x) => s + (part[x.key] || 0), 0) / SOURCES.length;
    try { onProgress(f, 'Sendersuchlauf …'); } catch { /* egal */ }
  };
  const results = await Promise.all(SOURCES.map((src) => fetchType(src, (k, f) => { part[k] = f; report(); })));
  const [movies, series, episodes, boxsets] = results;
  return { movies, series, episodes, boxsets, loadedAt: now };
}

// ------------------------------------------------------------------ IndexedDB (optional)

function hasIdb() {
  try { return typeof indexedDB !== 'undefined' && indexedDB !== null; } catch { return false; }
}

function openDb() {
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blockiert'));
  });
}

const idbDone = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

async function idbGet(key) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}

/** Speichert den Katalog und entfernt ältere Einträge desselben Benutzers. */
async function idbPut(uid, key, value) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    const prefix = `${uid || 'anon'}:`;
    const keys = await new Promise((resolve, reject) => {
      const r = os.getAllKeys();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
    for (const k of keys) if (typeof k === 'string' && k.startsWith(prefix) && k !== key) os.delete(k);
    os.put(value, key);
    await idbDone(tx);
  } finally {
    db.close();
  }
}

function validRaw(x) {
  return Boolean(x && Array.isArray(x.movies) && Array.isArray(x.series) && Array.isArray(x.episodes) && Array.isArray(x.boxsets));
}

/** RawCatalog für den aktuellen Sendetag: IndexedDB -> sonst Server (dann zurückschreiben). Fehler des Servers werden geworfen. */
export function loadCatalog({ onProgress, now } = {}) {
  const t = typeof now === 'function' ? now() : (Number.isFinite(now) ? now : Date.now());
  const uid = api.getUserId();
  const key = cacheKey(uid, t);
  return cached(`live:catalog:${key}`, async () => {
    if (hasIdb()) {
      try {
        const hit = await idbGet(key);
        if (validRaw(hit)) {
          if (typeof onProgress === 'function') onProgress(1, 'Sendersuchlauf …');
          return hit;
        }
      } catch { /* kein Cache: neu laden */ }
    }
    const raw = await fetchCatalog({ onProgress }, t);
    if (hasIdb()) {
      try { await idbPut(uid, key, raw); } catch { /* Speicher voll/gesperrt: ignorieren */ }
    }
    return raw;
  }, MEM_TTL_MS);
}
