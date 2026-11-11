// VIDEOTHEK LENZ · Vorlader: je Titel ein Mini-Bild (64 px, Browser-Cache!) für die Low-Stufe aller Regalseiten.
// Rein logisch (Ladefunktion/Skalierung injizierbar): Fehler/404/kein Bild zählen als erledigt (null), nahe Seiten zuerst.
import { loadBitmap as defaultLoad, closeBitmap as defaultClose } from './loader.js';

export const PRE_WIDTH = 64;
export const PRE_QUALITY = 60;

/** Cover-URL wie in der full-Stufe (gleiche Parameter inkl. tag), nur Breite/Qualität variabel. null = kein Bild. */
export function coverUrl(deps, id, item, maxWidth, quality) {
  if (!item || !item.ImageTags || !item.ImageTags.Primary) return null;
  try { return deps.imageUrl(id, { type: 'Primary', maxWidth, tag: item.ImageTags.Primary, quality }) || null; } catch { return null; }
}

async function defaultResize(bm, w) {
  const sw = bm.width || bm.naturalWidth;
  if (!sw || sw <= w || typeof createImageBitmap !== 'function') return bm;
  try { return await createImageBitmap(bm, { resizeWidth: w, resizeQuality: 'medium' }); } catch { return bm; }
}

export class CoverPreloader {
  /**
   * @param {object} o { faces: [{x,z,slots}], items: Map, deps, targetW, px, pz, concurrency, onProgress(done,total), onItem(id),
   *   loadBitmap, closeBitmap, resize, now }
   */
  constructor(o) {
    this.deps = o.deps;
    this.items = o.items;
    this.targetW = o.targetW || 43;
    this.concurrency = o.concurrency || 12;
    this.onProgress = o.onProgress || null;
    this.onItem = o.onItem || null;
    this.load = o.loadBitmap || defaultLoad;
    this.close = o.closeBitmap || defaultClose;
    this.resize = o.resize || defaultResize;
    this.now = o.now || (() => Date.now());
    this.cache = new Map(); // id → bitmap | null
    this.ac = new AbortController();
    this.disposed = false;
    this.active = 0;
    this.done = 0;
    this.finished = false;
    this.t0 = 0;
    this.t1 = 0;
    this.waiters = [];
    // Reihenfolge: nahe Seiten zuerst, jede Id einmal
    const px = o.px || 0;
    const pz = o.pz || 0;
    const faces = (o.faces || []).slice().sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
    const seen = new Set();
    this.ids = [];
    for (const f of faces) for (const id of f.slots || []) if (id != null && !seen.has(id)) { seen.add(id); this.ids.push(id); }
    this.total = this.ids.length;
    this.next = 0;
  }

  start() {
    if (this.t0) return this;
    this.t0 = this.now();
    if (!this.total) this.finish();
    else this.pump();
    return this;
  }

  pump() {
    while (!this.disposed && this.active < this.concurrency && this.next < this.total) {
      const id = this.ids[this.next++];
      const url = coverUrl(this.deps, id, this.items.get(id), PRE_WIDTH, PRE_QUALITY);
      if (!url) { this.complete(id, null); continue; }
      this.active++;
      this.run(id, url);
    }
  }

  async run(id, url) {
    let out = null;
    try {
      const bm = await this.load(url, this.ac.signal);
      if (this.disposed) { this.close(bm); return; }
      if (bm) {
        out = await this.resize(bm, this.targetW);
        if (out !== bm) this.close(bm);
        if (this.disposed) { this.close(out); return; }
      }
    } catch { out = null; }
    this.active--;
    this.complete(id, out || null);
    this.pump();
  }

  complete(id, bm) {
    this.cache.set(id, bm);
    this.done++;
    try { if (this.onProgress) this.onProgress(this.done, this.total); } catch { /* egal */ }
    try { if (this.onItem) this.onItem(id, bm); } catch { /* egal */ }
    if (this.done >= this.total) this.finish();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.t1 = this.now();
    const w = this.waiters;
    this.waiters = [];
    w.forEach((r) => r());
  }

  /** Löst bei Fertigstellung oder nach `ms` auf (Laden läuft danach im Hintergrund weiter). */
  wait(ms) {
    if (this.finished || this.disposed) return Promise.resolve();
    return new Promise((resolve) => {
      let timer = null;
      const fin = () => { if (timer) clearTimeout(timer); resolve(); };
      timer = setTimeout(fin, ms);
      this.waiters.push(fin);
    });
  }

  stats() {
    return { done: this.done, total: this.total, ms: this.t0 ? (this.t1 || this.now()) - this.t0 : 0 };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try { this.ac.abort(); } catch { /* egal */ }
    this.cache.forEach((b) => this.close(b));
    this.cache.clear();
    this.finish();
  }
}
