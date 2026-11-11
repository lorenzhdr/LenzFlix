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

// Stabilität (kein Thrashing, Upload-Pacing)
export const CALM_SPEED = 0.5; // m/s: darunter darf hochgestuft werden
export const HI_SELECT_MS = 400; // Seite muss so lange ausgewählt sein
export const HI_HOLD_MS = 3000; // keine Hoch-/Herabstufung derselben Seite innerhalb
export const HI_BEHIND_MS = 2000; // hinter dem Spieler so lange, bevor herabgestuft wird
export const HI_KEEP_D = 9; // weiter weg: Herabstufen
export const HI_UPLOAD_GAP_MS = 600; // zwischen zwei 2048er-Uploads (jeder kostet die GPU ~1 Frame; live gemessen v1.7.7)
export const HI_LRU_MS = 3000; // Hi-Platz nur von Seiten, die so lange nicht mehr gewollt waren
export const SLOW_TURN = 0.8; // rad/s: schneller → keine neuen Hi-Ladevorgänge
export const FAST_TURN = 1.5; // rad/s: Hi-Uploads zurückgestellt
export const EVICT_MARGIN = 3; // m: neue Seite muss so viel näher sein als die entfernteste geladene
export const EVICT_PROTECT_MS = 5000; // frisch geladene Seiten nicht verdrängen

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
    this.hiMax = o.phone ? 2 : 4; // v1.7.7: weniger 2048er-Texturen = weniger Upload-Ruckler beim Stehenbleiben
    this.concurrency = o.phone ? 4 : 8;
    this.maxLoadingFaces = o.phone ? 2 : 5;
    this.onFirst = o.onFirst || null;
    this.lowSize = lowSizeFor(o.faceViews.filter((fv) => fv.mesh).length, this.phone, this.preset.level);
    this.lowEnabled = false;
    this.pre = null;
    this.lowCanvas = null;
    this.evictSync = 0;
    this.now = o.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.poses = []; // { t, x, z, yaw } der letzten ~1 s
    this.calm = false;
    this.zoomed = false;
    this.turnFast = false;
    this.turnSlow = false;
    this.frame = 0;
    this.lastUploadFrame = -9;
    this.lastHiAt = -1e9;
    this.frameDts = [];
    this.lastTickAt = 0;
    this.counters = { coverUploads: 0, hiUp: 0, hiDown: 0, fullLoads: 0, fullEvicts: 0 };
    this.itemFaces = null;
    this.faces = o.faceViews.filter((fv) => fv.mesh).map((fv) => ({
      fv, face: fv.face, state: 'flat', tex: null, score: Infinity, loading: null, ph: false, queued: false,
      hiTex: null, hiLoading: null, hiSkip: false, hiScore: Infinity, d: Infinity, front: 0, dot: 0, lowDirty: false,
      hiSince: null, hiLastWanted: 0, hiBehindSince: null, hiChangedAt: -1e9, loadedAt: -1e9,
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
    const now = this.now();
    this.trackPose(now, px, pz, yaw);
    this.zoomed = zoom > 1.3;
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
      f.score = d + (front < -0.3 ? 9 : 0) + (dot < -0.2 ? 4 : 0); // nur Lade-Reihenfolge, nicht Eviction
      f.d = d;
      f.front = front;
      f.dot = dot;
    }
    const hiSet = this.updateHi(zoom, pitch);
    const radius = this.preset.loadRadius;
    // Budget in Einheiten: 2048er-Atlanten (je HI_COST) werden vom Grund-Budget abgezogen
    const max = Math.max(4, this.preset.maxAtlases - this.hiPending * HI_COST);
    const inRadius = new Set();
    const order = [];
    for (const f of this.faces) if (f.score < radius) { inRadius.add(f); order.push(f); }
    order.sort((a, b) => a.score - b.score);

    // Über Budget (z. B. durch 2048er): entfernteste (nach Distanz) zuerst verdrängen, frisch geladene zuletzt
    let used = this.usedCount;
    if (used > max) {
      const cand = this.faces.filter((f) => f.tex && f.state !== 'low' && !f.loading).sort((a, b) => this.evictRank(b, now) - this.evictRank(a, now));
      for (const f of cand) {
        if (used <= max) break;
        this.evict(f);
        used--;
      }
    }
    // Laufende Ladevorgänge weit entfernter Faces abbrechen
    for (const f of this.faces) if (f.loading && !inRadius.has(f) && f.score > radius * 1.25) this.cancelLoad(f);

    let loadingNow = this.faces.reduce((n, f) => n + (f.loading ? 1 : 0), 0);
    used = this.usedCount;
    let ph = 0;
    for (const f of order) {
      if (f.state === 'flat' && !f.queued && !this.lowEnabled && ph < 2 && used + ph < max) { this.queueCompose(f, 'ph'); ph++; }
      if (f.state !== 'full' && !f.loading && loadingNow < this.maxLoadingFaces) {
        const counted = !!(f.tex && f.state !== 'low');
        if (!counted && used >= max) {
          // Platz nur schaffen, wenn die neue Seite deutlich näher ist als die entfernteste geladene (Hysterese)
          const v = this.pickVictim(f, now);
          if (!v) continue;
          this.evict(v);
          used--;
        }
        if (!counted) used++;
        this.startLoad(f);
        loadingNow++;
      }
    }
    this.startHiLoads(hiSet, now);
    this.pump();
  }

  /** Belegte Grund-Budget-Plätze (fertige ph/full-Atlanten plus laufende Ladevorgänge). */
  get usedCount() { return this.faces.reduce((n, f) => n + ((f.tex && f.state !== 'low') || f.loading ? 1 : 0), 0); }

  /** Eviction-Rang: je größer, desto eher verdrängt (Distanz; frisch geladene zuletzt). */
  evictRank(f, now) { return f.d + (now - f.loadedAt < EVICT_PROTECT_MS ? -1000 : 0); }

  /** Entfernteste geladene Seite (nach Distanz), die nicht geschützt ist und mindestens EVICT_MARGIN weiter weg liegt als nf. */
  pickVictim(nf, now) {
    let best = null;
    for (const f of this.faces) {
      if (f === nf || !f.tex || f.state === 'low' || f.loading) continue;
      if (now - f.loadedAt < EVICT_PROTECT_MS) continue;
      if (f.d < nf.d + EVICT_MARGIN) continue;
      if (!best || f.d > best.d) best = f;
    }
    return best;
  }

  /** Pose-Historie: Geschwindigkeit und Drehrate über >= ~230 ms. */
  trackPose(now, x, z, yaw) {
    const ps = this.poses;
    let ref = null;
    for (let i = ps.length - 1; i >= 0; i--) if (now - ps[i].t >= 230) { ref = ps[i]; break; }
    if (ref) {
      const dt = (now - ref.t) / 1000;
      let dy = yaw - ref.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.calm = Math.hypot(x - ref.x, z - ref.z) / dt < CALM_SPEED;
      this.turnFast = Math.abs(dy) / dt > FAST_TURN;
      this.turnSlow = Math.abs(dy) / dt < SLOW_TURN;
    } else { this.calm = false; this.turnFast = false; this.turnSlow = false; }
    ps.push({ t: now, x, z, yaw });
    while (ps.length > 2 && now - ps[1].t > 800) ps.shift();
  }

  /** Hochstufen nur in Ruhe (langsam) oder bei Zoom, nach Auswahl >= 400 ms, nicht kurz nach Herabstufen; LRU-Platz bei Bedarf. */
  startHiLoads(wanted, now) {
    if (!wanted.length || !(this.calm || this.zoomed) || !(this.turnSlow || this.zoomed)) return;
    const cap = this.hiCap;
    const set = new Set(wanted);
    let hiLoadingNow = this.faces.reduce((n, f) => n + (f.hiLoading ? 1 : 0), 0);
    for (const f of wanted) {
      if (hiLoadingNow >= 2) break;
      if (!(f.state === 'full' && f.tex && !f.loading && !f.hiTex && !f.hiLoading && !f.hiSkip)) continue;
      if (f.hiSince == null || now - f.hiSince < HI_SELECT_MS || now - f.hiChangedAt < HI_HOLD_MS) continue;
      if (this.hiPending >= cap) {
        let v = null;
        for (const g of this.faces) {
          if (set.has(g) || !(g.hiTex || g.hiLoading)) continue;
          if (g.hiTex && now - g.hiChangedAt < HI_HOLD_MS) continue;
          if (now - g.hiLastWanted < HI_LRU_MS) continue;
          if (!v || g.hiLastWanted < v.hiLastWanted) v = g;
        }
        if (!v) break;
        this.dropHi(v);
      }
      this.startHiLoad(f);
      if (f.hiLoading) hiLoadingNow++;
    }
  }

  /**
   * Wählt die Seiten für die Schärfestufe und stuft alle anderen herab.
   * Kandidaten: Betrachter vor dem Regal, Grund-Atlas fertig, nah und im Blickfeld; bei Zoom > 1,3 weiter weg, aber nur
   * in Blickrichtung (Seite nahe der Blickachse zuerst). Bereits hochgestufte Seiten haben Hysterese.
   * @returns {Array} gewählte Seiten (nach Rang, höchstens hiCap)
   */
  updateHi(zoom, pitch) {
    const now = this.now();
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
    for (const f of this.faces) {
      const has = !!(f.hiTex || f.hiLoading);
      if (set.has(f)) {
        if (f.hiSince == null) f.hiSince = now;
        f.hiLastWanted = now;
        f.hiBehindSince = null;
        continue;
      }
      f.hiSince = null;
      if (!has) { f.hiBehindSince = null; continue; }
      if (cap === 0) { this.dropHi(f); continue; }
      // Hysterese: Hi-Textur bleibt, bis sie deutlich aus dem Bereich ist (weit weg / lange hinter dem Spieler)
      const behind = f.front < -0.3 || f.dot < -0.2;
      if (behind) { if (f.hiBehindSince == null) f.hiBehindSince = now; } else f.hiBehindSince = null;
      if (f.hiTex && now - f.hiChangedAt < HI_HOLD_MS) continue;
      if (f.d > HI_KEEP_D || (f.hiBehindSince != null && now - f.hiBehindSince > HI_BEHIND_MS)) this.dropHi(f);
    }
    // Cap geschrumpft (Qualitätswechsel): überzählige Seiten außerhalb der Auswahl (LRU) abgeben
    let over = this.hiPending - cap;
    if (over > 0) {
      const out = this.faces.filter((f) => (f.hiTex || f.hiLoading) && !set.has(f)).sort((a, b) => a.hiLastWanted - b.hiLastWanted);
      for (const f of out) { if (over-- <= 0) break; this.dropHi(f); }
    }
    return wanted;
  }

  /** Frame-Takt festhalten (für das Hi-Upload-Pacing). */
  trackFrame(now) {
    if (this.lastTickAt) {
      this.frameDts.push(now - this.lastTickAt);
      if (this.frameDts.length > 30) this.frameDts.shift();
    }
    this.lastTickAt = now;
  }

  /** Letzte ~5 Frames unauffällig (< 1,5× Median)? Ohne genug Historie: ja. */
  framesSteady() {
    const a = this.frameDts;
    if (a.length < 10) return true;
    const med = [...a].sort((x, y) => x - y)[a.length >> 1];
    return a.slice(-5).every((v) => v < med * 1.5);
  }

  /** 2048er-Upload jetzt erlaubt? Ruhe/Zoom, keine schnelle Drehung, Abstand >= 250 ms, Frames unauffällig. */
  hiUploadOk(now) {
    return (this.calm || this.zoomed) && !this.turnFast && now - this.lastHiAt >= HI_UPLOAD_GAP_MS && this.framesSteady();
  }

  /** Pro Frame höchstens ein Atlas zeichnen + hochladen (Grund-Atlas vor Low-Nachzügler vor Schärfestufe). */
  tick() {
    if (this.disposed) return;
    const now = this.now();
    this.frame++;
    this.trackFrame(now);
    if (this.frame - this.lastUploadFrame < 2) return; // höchstens ein Atlas-Upload alle 2 Frames
    const low = this.lowEnabled ? this.pickLow() : null;
    let job = null;
    if (this.composeQueue.length) {
      const rank = (j) => j.f.score + (j.kind === 'hi' ? 100 : 0); // Grund-Atlanten vor Schärfestufe
      this.composeQueue.sort((a, b) => rank(a) - rank(b));
      const hiOk = this.hiUploadOk(now);
      const at = this.composeQueue.findIndex((j) => j.kind !== 'hi' || hiOk);
      if (at >= 0) job = this.composeQueue[at];
      if (job && low && job.kind === 'hi') job = null;
      if (job) this.composeQueue.splice(at, 1);
    }
    if (!job) {
      if (low) { this.lastUploadFrame = this.frame; this.composeLowSafe(low); }
      return;
    }
    if (job.kind !== 'hi') job.f.queued = false;
    this.lastUploadFrame = this.frame;
    try {
      if (job.kind === 'ph') this.composePlaceholder(job.f);
      else if (job.kind === 'hi') { this.lastHiAt = now; this.composeHi(job.f); } else this.composeFull(job.f);
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
    f.hiChangedAt = this.now();
    this.counters.hiDown++;
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
    this.counters.fullLoads++;
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
    f.hiChangedAt = this.now();
    this.counters.hiUp++;
    this.counters.coverUploads++;
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
    this.counters.coverUploads++;
    if (state !== 'low') f.loadedAt = this.now();
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
    if (!hard && f.state === 'full') this.counters.fullEvicts++;
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
