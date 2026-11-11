// VIDEOTHEK LENZ · Cover-Verwaltung: ein Atlas pro Regalseite, LRU-Budget, Ladequeue mit begrenzter Parallelität
// und Priorität nach Nähe/Blickrichtung. Der Texturspeicher ist auf dem iPhone der Engpass – deshalb:
//   flat (nur Farbe) → ph (kleiner Platzhalter-Atlas mit Titeln) → full (Cover-Atlas), Eviction des entferntesten Atlas.
// Schärfestufe "hi": für die nächsten Regalseiten im Blickfeld zusätzlich ein Atlas mit doppelter Kantenlänge (2048², Bilder 400 px).
// Low-Stufe: nach dem Vorladen (preload.js) hat jede Seite einen kleinen Atlas (128/256 px, gleiches Zellraster, eigenes Budget),
// der gilt, bis die Seite 'full' bekommt; Eviction von 'full' fällt auf 'low' zurück (nicht auf flat).
// Er liegt zusätzlich zum Grund-Atlas (f.tex) und zählt im Budget HI_COST (4) Einheiten (Grund-Atlas = 1); Hochstufen nur, wenn der
// Grund-Atlas fertig ist, Herabstufen tauscht zuerst auf den Grund-Atlas zurück und gibt dann die große Textur frei.
import { CanvasTexture, SRGBColorSpace, LinearMipmapLinearFilter } from 'three';
import { drawAtlas } from './atlas.js';
import { loadBitmap, closeBitmap } from './loader.js';
import { shelfSpec } from '../world/layout.js';
import { makeCanvas } from '../world/textures.js';
import { BASE } from './atlasmap.js';
import { CoverPreloader, coverUrl } from './preload.js';

export const HI_SIZE = 2048;
export const HI_WIDTH = 400;
export const HI_COST = (HI_SIZE / 1024) ** 2; // Budgeteinheiten (1 = Atlas 1024²)
export const LOW_SIZE = 256;
export const LOW_SIZE_SMALL = 128;

/** Kantenlänge der Low-Atlanten: Handy/Qualität low oder viele Seiten → 128, sonst 256. */
export function lowSizeFor(faceCount, phone, level) {
  if (phone || level === 'low' || faceCount > 160) return LOW_SIZE_SMALL;
  return LOW_SIZE;
}

export class CoverManager {
  /**
   * @param {object} o { faceViews, items: Map, deps, preset, blankTex, renderer, phone, spec (shelfSpec), onFirst }
   */
  constructor(o) {
    this.deps = o.deps;
    this.items = o.items;
    this.blank = o.blankTex;
    this.renderer = o.renderer;
    this.preset = o.preset;
    this.spec = o.spec || shelfSpec(false);
    this.phone = !!o.phone;
    this.hiMax = o.phone ? 4 : 8;
    this.concurrency = o.phone ? 4 : 8;
    this.maxLoadingFaces = o.phone ? 2 : 5;
    this.onFirst = o.onFirst || null;
    this.lowSize = lowSizeFor(o.faceViews.filter((fv) => fv.mesh).length, this.phone, this.preset.level);
    this.lowEnabled = false;
    this.pre = null;
    this.lowCanvas = null;
    this.evictSync = 0;
    this.itemFaces = null;
    this.faces = o.faceViews.filter((fv) => fv.mesh).map((fv) => ({
      fv, face: fv.face, state: 'flat', tex: null, score: Infinity, loading: null, ph: false, queued: false,
      hiTex: null, hiLoading: null, hiSkip: false, hiScore: Infinity, d: Infinity, front: 0, dot: 0, lowDirty: false,
    }));
    this.byFace = new Map(this.faces.map((f) => [f.face.index, f]));
    this.queue = [];
    this.composeQueue = [];
    this.active = 0;
    this.paused = false;
    this.disposed = false;
    this.first = false;
  }

  /** Atlanten im Grund-Budget (ph/full; Low-Atlanten haben ein eigenes Budget). */
  get loadedCount() { return this.faces.reduce((n, f) => n + (f.tex && f.state !== 'low' ? 1 : 0), 0); }
  get lowCount() { return this.faces.reduce((n, f) => n + (f.state === 'low' ? 1 : 0), 0); }
  get preloadStats() { return this.pre ? this.pre.stats() : { done: 0, total: 0, ms: 0 }; }
  get fullCount() { return this.faces.reduce((n, f) => n + (f.state === 'full' ? 1 : 0), 0); }
  /** Seiten mit fertiger 2048er-Textur. */
  get hiCount() { return this.faces.reduce((n, f) => n + (f.hiTex ? 1 : 0), 0); }
  /** Seiten mit fertiger oder ladender 2048er-Stufe (belegen Budget). */
  get hiPending() { return this.faces.reduce((n, f) => n + (f.hiTex || f.hiLoading ? 1 : 0), 0); }

  /** Schärfestufe erlaubt? Nicht bei Qualität low, nur mit Texturen >= 2048 und Atlas-Grundstufe >= 1024. */
  get hiEnabled() {
    const cap = this.renderer && this.renderer.capabilities;
    const maxTex = (cap && cap.maxTextureSize) || 0;
    return this.preset.level !== 'low' && this.preset.atlas >= 1024 && maxTex >= HI_SIZE;
  }

  /** Höchstzahl 2048er-Atlanten: Limit je Gerät (8 / Handy 4), höchstens die Hälfte des Atlas-Budgets (in Einheiten). */
  get hiCap() {
    if (!this.hiEnabled) return 0;
    return Math.max(0, Math.min(this.hiMax, Math.floor(this.preset.maxAtlases / (2 * HI_COST))));
  }

  setPreset(p) {
    const sizeChanged = p.atlas !== this.preset.atlas;
    this.preset = p;
    const ls = lowSizeFor(this.faces.length, this.phone, p.level);
    const lowChanged = ls !== this.lowSize;
    this.lowSize = ls;
    if (sizeChanged) this.evictAll();
    else for (const f of this.faces) if (f.tex) f.tex.anisotropy = p.anisotropy;
    if (lowChanged && this.lowEnabled) for (const f of this.faces) if (f.state === 'low') f.lowDirty = true; // neu bauen
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; this.pump(); }

  /** Aufruf ca. 4×/s mit der Spielerposition. `extra` optional { zoom, pitch } (Zoom > 1,3: Blickrichtung bevorzugen). */
  update(px, pz, yaw, extra) {
    if (this.disposed) return;
    const zoom = (extra && extra.zoom) || 1;
    const pitch = (extra && extra.pitch) || 0;
    this.evictSync = 2;
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
      f.d = d;
      f.front = front;
      f.dot = dot;
    }
    const hiSet = this.updateHi(zoom, pitch);
    const radius = this.preset.loadRadius;
    // Budget in Einheiten: 2048er-Atlanten (je HI_COST) werden vom Grund-Budget abgezogen
    const max = Math.max(4, this.preset.maxAtlases - this.hiPending * HI_COST);
    const wanted = this.faces.filter((f) => f.score < radius).sort((a, b) => a.score - b.score).slice(0, max);
    const wantedSet = new Set(wanted);

    // Budget: entferntesten Atlas zuerst verdrängen
    const loaded = this.faces.filter((f) => f.tex && f.state !== 'low');
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
      if (f.state === 'flat' && !f.queued && !this.lowEnabled && ph < 2) { this.queueCompose(f, 'ph'); ph++; }
      if (f.state !== 'full' && !f.loading && loadingNow < this.maxLoadingFaces) {
        this.startLoad(f);
        loadingNow++;
      }
    }
    // Hochstufen (höchstens 2 gleichzeitig ladende 2048er-Seiten, nur bei fertigem Grund-Atlas)
    let hiLoadingNow = this.faces.reduce((n, f) => n + (f.hiLoading ? 1 : 0), 0);
    for (const f of hiSet) {
      if (hiLoadingNow >= 2) break;
      if (f.state === 'full' && f.tex && !f.loading && !f.hiTex && !f.hiLoading && !f.hiSkip) {
        this.startHiLoad(f);
        if (f.hiLoading) hiLoadingNow++;
      }
    }
    this.pump();
  }

  /**
   * Wählt die Seiten für die Schärfestufe und stuft alle anderen herab.
   * Kandidaten: Betrachter vor dem Regal, Grund-Atlas fertig, nah und im Blickfeld; bei Zoom > 1,3 weiter weg, aber nur
   * in Blickrichtung (Seite nahe der Blickachse zuerst). Bereits hochgestufte Seiten haben Hysterese.
   * @returns {Array} gewählte Seiten (nach Rang, höchstens hiCap)
   */
  updateHi(zoom, pitch) {
    const cap = this.hiCap;
    const zoomed = zoom > 1.3;
    const cands = [];
    if (cap > 0 && Math.abs(pitch) < 1.1) {
      for (const f of this.faces) {
        if (f.state !== 'full' || !f.tex) continue;
        const had = !!(f.hiTex || f.hiLoading);
        const maxD = (zoomed ? 11 : 6.5) + (had ? 1.5 : 0);
        const minDot = (zoomed ? 0.7 : 0.35) - (had ? 0.1 : 0);
        if (f.front < -0.3 || f.d > maxD || f.dot < minDot) continue;
        f.hiScore = zoomed ? f.d - f.dot * 6 : f.d + (f.dot < 0.7 ? 1.5 : 0);
        if (had) f.hiScore -= 1;
        cands.push(f);
      }
    }
    cands.sort((a, b) => a.hiScore - b.hiScore);
    const wanted = cands.slice(0, cap);
    const set = new Set(wanted);
    for (const f of this.faces) if ((f.hiTex || f.hiLoading) && !set.has(f)) this.dropHi(f);
    return wanted;
  }

  /** Pro Frame höchstens ein Atlas zeichnen + hochladen (Grund-Atlas vor Low-Nachzügler vor Schärfestufe). */
  tick() {
    if (this.disposed) return;
    const low = this.lowEnabled ? this.pickLow() : null;
    if (!this.composeQueue.length) {
      if (low) this.composeLowSafe(low);
      return;
    }
    const rank = (j) => j.f.score + (j.kind === 'hi' ? 100 : 0); // Grund-Atlanten vor Schärfestufe
    this.composeQueue.sort((a, b) => rank(a) - rank(b));
    if (low && this.composeQueue[0].kind === 'hi') { this.composeLowSafe(low); return; }
    const job = this.composeQueue.shift();
    if (job.kind !== 'hi') job.f.queued = false;
    try {
      if (job.kind === 'ph') this.composePlaceholder(job.f);
      else if (job.kind === 'hi') this.composeHi(job.f);
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

  startLoad(f) { this.loadFace(f, false); }

  startHiLoad(f) { this.loadFace(f, true); }

  loadFace(f, hi) {
    const ac = new AbortController();
    const loading = { ac, bitmaps: new Map(), pending: 0, hi };
    if (hi) f.hiLoading = loading; else f.loading = loading;
    const jobs = [];
    f.face.slots.forEach((id, idx) => {
      if (id == null) return;
      const it = this.items.get(id);
      if (!it || !it.ImageTags || !it.ImageTags.Primary) return;
      const url = coverUrl(this.deps, id, it, hi ? HI_WIDTH : 200, hi ? 85 : 80);
      if (url) jobs.push({ f, idx, url, loading });
    });
    loading.pending = jobs.length;
    if (!jobs.length) {
      if (hi) { f.hiLoading = null; f.hiSkip = true; return; } // keine Cover-Bilder: 2048er bringt nichts
      this.queueCompose(f, 'full');
      return;
    }
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

  cancelHiLoad(f) {
    const l = f.hiLoading;
    if (!l) return;
    l.ac.abort();
    l.bitmaps.forEach(closeBitmap);
    l.bitmaps.clear();
    f.hiLoading = null;
    this.queue = this.queue.filter((j) => j.loading !== l);
    this.composeQueue = this.composeQueue.filter((j) => !(j.f === f && j.kind === 'hi'));
  }

  /** Schärfestufe verlassen: erst zurück auf den Grund-Atlas tauschen, dann die 2048er-Textur freigeben. */
  dropHi(f) {
    this.cancelHiLoad(f);
    const t = f.hiTex;
    if (!t) return;
    f.hiTex = null;
    const mat = f.fv.material;
    if (mat.map === t) mat.map = f.tex || this.blank;
    t.onUpdate = null;
    t.dispose();
  }

  pump() {
    while (!this.paused && !this.disposed && this.active < this.concurrency && this.queue.length) {
      let best = 0;
      for (let i = 1; i < this.queue.length; i++) if (this.queue[i].f.score < this.queue[best].f.score) best = i;
      const job = this.queue.splice(best, 1)[0];
      if (job.f.loading !== job.loading && job.f.hiLoading !== job.loading) continue;
      this.active++;
      loadBitmap(job.url, job.loading.ac.signal).then((bm) => {
        this.active--;
        const l = job.loading;
        if (this.disposed || (job.f.loading !== l && job.f.hiLoading !== l)) { closeBitmap(bm); } else {
          if (bm) l.bitmaps.set(job.idx, bm);
          l.pending--;
          if (l.pending <= 0) this.queueCompose(job.f, l.hi ? 'hi' : 'full');
        }
        this.pump();
      });
    }
  }

  // --- Low-Stufe ---
  /** Startet den Vorlader (Mini-Bilder aller Seiten, nahe zuerst). */
  startPreload({ px = 0, pz = 0, onProgress, loadBitmap, closeBitmap, resize, now } = {}) {
    if (this.pre) this.pre.dispose();
    const pl = new CoverPreloader({
      faces: this.faces.map((f) => f.face), items: this.items, deps: this.deps, px, pz, onProgress,
      concurrency: this.phone ? 6 : 12, targetW: Math.max(8, Math.round(this.spec.cellW * this.lowSize / BASE)),
      onItem: (id) => this.markLowItem(id), loadBitmap, closeBitmap, resize, now,
    });
    this.pre = pl;
    return pl.start();
  }

  /** Low-Atlanten aller Seiten (nah zuerst) zeichnen und hochladen; `yieldFn` gibt dem Ladebalken Luft. Seiten mit 'full' entfallen. */
  async buildLowAll(yieldFn) {
    if (!this.pre || this.disposed) return;
    this.lowEnabled = true;
    this.composeQueue = this.composeQueue.filter((j) => j.kind !== 'ph'); // Platzhalter überholt
    for (const f of this.faces) f.queued = false;
    const list = this.faces.filter((f) => f.state !== 'full').sort((a, b) => (a.score < b.score ? -1 : a.score > b.score ? 1 : 0));
    let n = 0;
    for (const f of list) {
      if (this.disposed) return;
      if (f.state === 'full') continue;
      this.composeLowSafe(f);
      if (++n % 4 === 0 && yieldFn) await yieldFn();
    }
    this.releaseLowCanvas();
  }

  /** Nachzügler: Titel hat jetzt ein Mini-Bild → betroffene Seiten neu zeichnen (tick: höchstens 1 pro Frame). */
  markLowItem(id) {
    if (!this.lowEnabled || this.disposed) return;
    if (!this.itemFaces) {
      this.itemFaces = new Map();
      for (const f of this.faces) {
        for (const sid of f.face.slots) {
          if (sid == null) continue;
          const a = this.itemFaces.get(sid);
          if (a) a.push(f); else this.itemFaces.set(sid, [f]);
        }
      }
    }
    for (const f of this.itemFaces.get(id) || []) if (f.state !== 'full') f.lowDirty = true;
  }

  pickLow() {
    let best = null;
    for (const f of this.faces) {
      if (!f.lowDirty) continue;
      if (f.state === 'full') { f.lowDirty = false; continue; }
      if (!best || f.score < best.score) best = f;
    }
    if (!best) this.releaseLowCanvas();
    return best;
  }

  composeLowSafe(f) { try { this.composeLow(f); } catch { /* ein defekter Atlas darf die Szene nicht stoppen */ } }

  composeLow(f) {
    f.lowDirty = false;
    if (f.state === 'full' || !this.pre || this.disposed) return;
    const cache = this.pre.cache;
    const bitmaps = new Map();
    f.face.slots.forEach((id, idx) => { const b = id != null ? cache.get(id) : null; if (b) bitmaps.set(idx, b); });
    const shared = !!this.renderer; // ohne Renderer wird erst beim Rendern hochgeladen → eigenes Canvas
    if (shared && !this.lowCanvas) this.lowCanvas = makeCanvas(1, 1);
    const canvas = drawAtlas({ face: f.face, items: this.items, bitmaps, size: this.lowSize, spec: this.spec, canvas: shared ? this.lowCanvas : null });
    this.applyTexture(f, canvas, 'low', shared);
  }

  releaseLowCanvas() {
    if (this.lowCanvas) {
      try { this.lowCanvas.width = 1; this.lowCanvas.height = 1; } catch { /* egal */ }
      this.lowCanvas = null;
    }
  }

  composePlaceholder(f) {
    if (f.state !== 'flat' || this.lowEnabled) return;
    const size = Math.min(512, this.preset.atlas);
    this.applyTexture(f, drawAtlas({ face: f.face, items: this.items, bitmaps: null, size, spec: this.spec }), 'ph');
  }

  composeFull(f) {
    const l = f.loading;
    if (!l) return;
    const canvas = drawAtlas({ face: f.face, items: this.items, bitmaps: l.bitmaps, size: this.preset.atlas, spec: this.spec });
    l.bitmaps.forEach(closeBitmap);
    l.bitmaps.clear();
    f.loading = null;
    this.applyTexture(f, canvas, 'full');
  }

  composeHi(f) {
    const l = f.hiLoading;
    if (!l) return;
    if (f.state !== 'full' || !f.tex || !this.hiEnabled) { this.cancelHiLoad(f); return; }
    const canvas = drawAtlas({ face: f.face, items: this.items, bitmaps: l.bitmaps, size: HI_SIZE, spec: this.spec });
    l.bitmaps.forEach(closeBitmap);
    l.bitmaps.clear();
    f.hiLoading = null;
    const tex = this.makeTexture(canvas);
    f.fv.material.map = tex;
    f.hiTex = tex;
    try { if (this.renderer) this.renderer.initTexture(tex); } catch { /* wird beim ersten Rendern hochgeladen */ }
  }

  makeTexture(canvas, keepCanvas) {
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = this.preset.anisotropy;
    tex.generateMipmaps = true;
    tex.minFilter = LinearMipmapLinearFilter;
    if (!keepCanvas) tex.onUpdate = () => { tex.onUpdate = null; canvas.width = 1; canvas.height = 1; }; // Canvas nach dem Upload freigeben
    return tex;
  }

  applyTexture(f, canvas, state, keepCanvas) {
    const tex = this.makeTexture(canvas, keepCanvas);
    const mat = f.fv.material;
    mat.map = tex;
    if (f.hiTex && state === 'full') this.dropHi(f); // Grund-Atlas neu gezeichnet (z. B. Aufkleber): 2048er ist veraltet
    mat.color.setRGB(1.3, 1.3, 1.3); // heller als 1: ersetzt die frühere Emissive-Map
    const old = f.tex;
    f.tex = tex;
    f.state = state;
    try { if (this.renderer) this.renderer.initTexture(tex); } catch { /* wird beim ersten Rendern hochgeladen */ }
    if (old) old.dispose();
    if (!this.first) { this.first = true; if (this.onFirst) this.onFirst(); }
  }

  /** Soft: full/ph fällt auf low zurück (Low-Seiten bleiben); hard (dispose/Kontextverlust): alles weg. */
  evict(f, hard = false) {
    this.cancelLoad(f);
    this.dropHi(f);
    f.hiSkip = false;
    this.composeQueue = this.composeQueue.filter((j) => j.f !== f);
    f.queued = false;
    if (!hard && f.state === 'low') return;
    const mat = f.fv.material;
    mat.map = this.blank;
    mat.color.copy(f.fv.flatColor);
    if (f.tex) { f.tex.dispose(); f.tex = null; }
    f.state = 'flat';
    if (!hard && this.lowEnabled) {
      f.lowDirty = true;
      if (this.evictSync > 0) { this.evictSync--; this.composeLowSafe(f); } // wenige sofort, Rest über tick()
    }
  }

  evictAll() { this.evictSync = 2; for (const f of this.faces) this.evict(f); }
  /** Nach Kontextverlust: GPU-Texturen sind weg, alte Objekte nicht mehr dispose()n (sonst WebGL-Warnungen), nur vergessen. */
  invalidateAll() {
    for (const f of this.faces) {
      if (f.tex) { f.tex.onUpdate = null; f.tex = null; }
      if (f.hiTex) { f.hiTex.onUpdate = null; f.hiTex = null; }
      this.evict(f, true);
      if (this.lowEnabled) f.lowDirty = true; // aus dem Cache neu aufbauen (tick)
    }
  }

  /** Aufkleber/Gesehen-Status geändert: betroffene Atlanten neu zeichnen. */
  refreshItem(itemId) {
    for (const f of this.faces) {
      if (!f.tex || f.loading || !f.face.slots.includes(itemId)) continue;
      if (f.state === 'low') { f.lowDirty = true; continue; }
      this.startLoad(f);
    }
    this.pump();
  }

  dispose() {
    this.disposed = true;
    this.queue = [];
    this.composeQueue = [];
    this.lowEnabled = false;
    for (const f of this.faces) this.evict(f, true);
    if (this.pre) { this.pre.dispose(); this.pre = null; }
    this.releaseLowCanvas();
  }
}
