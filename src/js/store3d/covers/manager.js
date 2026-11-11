// VIDEOTHEK LENZ · Cover-Verwaltung: ein Atlas pro Regalseite, LRU-Budget, Ladequeue mit begrenzter Parallelität
// und Priorität nach Nähe/Blickrichtung. Der Texturspeicher ist auf dem iPhone der Engpass – deshalb:
//   flat (nur Farbe) → ph (kleiner Platzhalter-Atlas mit Titeln) → full (Cover-Atlas), Eviction des entferntesten Atlas.
import { CanvasTexture, SRGBColorSpace, LinearMipmapLinearFilter } from 'three';
import { drawAtlas } from './atlas.js';
import { loadBitmap, closeBitmap } from './loader.js';

export class CoverManager {
  /**
   * @param {object} o { faceViews, items: Map, deps, preset, blankTex, renderer, phone, onFirst }
   */
  constructor(o) {
    this.deps = o.deps;
    this.items = o.items;
    this.blank = o.blankTex;
    this.renderer = o.renderer;
    this.preset = o.preset;
    this.concurrency = o.phone ? 4 : 8;
    this.maxLoadingFaces = o.phone ? 2 : 5;
    this.onFirst = o.onFirst || null;
    this.faces = o.faceViews.filter((fv) => fv.mesh).map((fv) => ({
      fv, face: fv.face, state: 'flat', tex: null, score: Infinity, loading: null, ph: false, queued: false,
    }));
    this.byFace = new Map(this.faces.map((f) => [f.face.index, f]));
    this.queue = [];
    this.composeQueue = [];
    this.active = 0;
    this.paused = false;
    this.disposed = false;
    this.first = false;
  }

  get loadedCount() { return this.faces.reduce((n, f) => n + (f.tex ? 1 : 0), 0); }
  get fullCount() { return this.faces.reduce((n, f) => n + (f.state === 'full' ? 1 : 0), 0); }

  setPreset(p) {
    const sizeChanged = p.atlas !== this.preset.atlas;
    this.preset = p;
    if (sizeChanged) this.evictAll();
    else for (const f of this.faces) if (f.tex) f.tex.anisotropy = p.anisotropy;
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; this.pump(); }

  /** Aufruf ca. 4×/s mit der Spielerposition. */
  update(px, pz, yaw) {
    if (this.disposed) return;
    const vx = -Math.sin(yaw);
    const vz = -Math.cos(yaw);
    for (const f of this.faces) {
      const fc = f.face;
      const dx = fc.x - px;
      const dz = fc.z - pz;
      const d = Math.hypot(dx, dz);
      const front = (px - fc.x) * fc.nx + (pz - fc.z) * fc.nz;
      const dot = (dx * vx + dz * vz) / (d || 1);
      f.score = d + (front < -0.3 ? 9 : 0) + (dot < -0.2 ? 4 : 0);
    }
    const radius = this.preset.loadRadius;
    const max = this.preset.maxAtlases;
    const wanted = this.faces.filter((f) => f.score < radius).sort((a, b) => a.score - b.score).slice(0, max);
    const wantedSet = new Set(wanted);

    // Budget: entferntesten Atlas zuerst verdrängen
    const loaded = this.faces.filter((f) => f.tex);
    if (loaded.length > max) {
      loaded.sort((a, b) => b.score - a.score);
      for (const f of loaded) {
        if (this.loadedCount <= max) break;
        if (!wantedSet.has(f)) this.evict(f);
      }
    }
    // Laufende Ladevorgänge weit entfernter Faces abbrechen
    for (const f of this.faces) if (f.loading && !wantedSet.has(f) && f.score > radius * 1.25) this.cancelLoad(f);

    let loadingNow = this.faces.reduce((n, f) => n + (f.loading ? 1 : 0), 0);
    let ph = 0;
    for (const f of wanted) {
      if (f.state === 'flat' && !f.queued && ph < 2) { this.queueCompose(f, 'ph'); ph++; }
      if (f.state !== 'full' && !f.loading && loadingNow < this.maxLoadingFaces) {
        this.startLoad(f);
        loadingNow++;
      }
    }
    this.pump();
  }

  /** Pro Frame höchstens ein Atlas zeichnen + hochladen. */
  tick() {
    if (this.disposed || !this.composeQueue.length) return;
    this.composeQueue.sort((a, b) => a.f.score - b.f.score);
    const job = this.composeQueue.shift();
    job.f.queued = false;
    try {
      if (job.kind === 'ph') this.composePlaceholder(job.f);
      else this.composeFull(job.f);
    } catch { /* ein defekter Atlas darf die Szene nicht stoppen */ }
  }

  queueCompose(f, kind) {
    if (kind === 'ph') {
      if (f.queued) return;
      f.queued = true;
    }
    this.composeQueue.push({ f, kind });
  }

  startLoad(f) {
    const ac = new AbortController();
    const loading = { ac, bitmaps: new Map(), pending: 0 };
    f.loading = loading;
    const jobs = [];
    f.face.slots.forEach((id, idx) => {
      if (id == null) return;
      const it = this.items.get(id);
      if (!it || !it.ImageTags || !it.ImageTags.Primary) return;
      let url;
      try { url = this.deps.imageUrl(id, { type: 'Primary', maxWidth: 200, tag: it.ImageTags.Primary, quality: 80 }); } catch { /* ohne Bild */ }
      if (url) jobs.push({ f, idx, url, loading });
    });
    loading.pending = jobs.length;
    if (!jobs.length) { this.queueCompose(f, 'full'); return; }
    this.queue.push(...jobs);
  }

  cancelLoad(f) {
    const l = f.loading;
    if (!l) return;
    l.ac.abort();
    l.bitmaps.forEach(closeBitmap);
    l.bitmaps.clear();
    f.loading = null;
    this.queue = this.queue.filter((j) => j.loading !== l);
  }

  pump() {
    while (!this.paused && !this.disposed && this.active < this.concurrency && this.queue.length) {
      let best = 0;
      for (let i = 1; i < this.queue.length; i++) if (this.queue[i].f.score < this.queue[best].f.score) best = i;
      const job = this.queue.splice(best, 1)[0];
      if (job.f.loading !== job.loading) continue;
      this.active++;
      loadBitmap(job.url, job.loading.ac.signal).then((bm) => {
        this.active--;
        const l = job.loading;
        if (this.disposed || job.f.loading !== l) { closeBitmap(bm); } else {
          if (bm) l.bitmaps.set(job.idx, bm);
          l.pending--;
          if (l.pending <= 0) this.queueCompose(job.f, 'full');
        }
        this.pump();
      });
    }
  }

  composePlaceholder(f) {
    if (f.state !== 'flat') return;
    const size = Math.min(512, this.preset.atlas);
    this.applyTexture(f, drawAtlas({ face: f.face, items: this.items, bitmaps: null, size }), 'ph');
  }

  composeFull(f) {
    const l = f.loading;
    if (!l) return;
    const canvas = drawAtlas({ face: f.face, items: this.items, bitmaps: l.bitmaps, size: this.preset.atlas });
    l.bitmaps.forEach(closeBitmap);
    l.bitmaps.clear();
    f.loading = null;
    this.applyTexture(f, canvas, 'full');
  }

  applyTexture(f, canvas, state) {
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = this.preset.anisotropy;
    tex.generateMipmaps = true;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.onUpdate = () => { tex.onUpdate = null; canvas.width = 1; canvas.height = 1; }; // Canvas nach dem Upload freigeben
    const mat = f.fv.material;
    mat.map = tex;
    mat.color.setRGB(1.3, 1.3, 1.3); // heller als 1: ersetzt die frühere Emissive-Map
    const old = f.tex;
    f.tex = tex;
    f.state = state;
    try { if (this.renderer) this.renderer.initTexture(tex); } catch { /* wird beim ersten Rendern hochgeladen */ }
    if (old) old.dispose();
    if (!this.first) { this.first = true; if (this.onFirst) this.onFirst(); }
  }

  evict(f) {
    this.cancelLoad(f);
    const mat = f.fv.material;
    mat.map = this.blank;
    mat.color.copy(f.fv.flatColor);
    if (f.tex) { f.tex.dispose(); f.tex = null; }
    f.state = 'flat';
    this.composeQueue = this.composeQueue.filter((j) => j.f !== f);
    f.queued = false;
  }

  evictAll() { for (const f of this.faces) this.evict(f); }
  /** Nach Kontextverlust: GPU-Texturen sind weg, alte Objekte nicht mehr dispose()n (sonst WebGL-Warnungen), nur vergessen. */
  invalidateAll() {
    for (const f of this.faces) {
      if (f.tex) { f.tex.onUpdate = null; f.tex = null; }
      this.evict(f);
    }
  }

  /** Aufkleber/Gesehen-Status geändert: betroffene Atlanten neu zeichnen. */
  refreshItem(itemId) {
    for (const f of this.faces) {
      if (!f.tex || f.loading || !f.face.slots.includes(itemId)) continue;
      this.startLoad(f);
    }
    this.pump();
  }

  dispose() {
    this.disposed = true;
    this.queue = [];
    this.composeQueue = [];
    for (const f of this.faces) this.evict(f);
  }
}
