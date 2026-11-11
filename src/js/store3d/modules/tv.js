// VIDEOTHEK LENZ · M4 TV-Ecke (Zone „tv“): Röhrenfernseher auf Holzschrank + kleines Sofa. Bildschirm = Canvas-Textur mit
// Diashow aus Backdrops (Rauschen/Kanalwechsel, Scanlines, gewölbte Scheibe); lokale Trailer als letzte Stufe, abschaltbar
// (nur im Sichtfeld, < 12 m, Qualität ≠ low, nicht suspendiert). Die Trailer-URL enthält api_key und wird nie geloggt.
// Couch: Interactable „Sofa“ → Hinsetzen, TV-Vollbild (960×720, Trailer mit Ton, Knopfleiste), siehe docs/store3d.md „Couch“.
// Bilder laufen per loadBitmap → eigener Canvas (keine Dauer-Texturen). Interactable „Fernseher“ nimmt den gezeigten Titel.
import { Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, RepeatWrapping, CanvasTexture, SRGBColorSpace, LinearFilter } from 'three';
import { box, merge } from '../util/geo.js';
import { makeCanvas, FONT } from '../world/textures.js';
import { loadBitmap, closeBitmap } from '../covers/loader.js';
import { prefersReducedMotion, clamp, adultIds } from './m4-util.js';
import { h, button } from './m3-gfx.js';
import { fitDistance, pickCandidates } from './couch-util.js';

const SW = 320;
const SH = 240;
const BW = 960; // Sitz-Ansicht (TV-Vollbild)
const BH = 720;
const EYE = 1.65; // Augenhöhe im Laden (wie terminal.js)
const VOL_KEY = 'lfx-store-tv-vol';
const SLIDE_S = 8;
const STATIC_S = 0.45;
const TRAILER_S = 20;

function noiseCanvas() {
  const c = makeCanvas(80, 60);
  const x = c.getContext('2d');
  const d = x.createImageData(80, 60);
  for (let i = 0; i < d.data.length; i += 4) { const v = 60 + Math.random() * 180; d.data[i] = v; d.data[i + 1] = v; d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0);
  return c;
}

function overlayCanvas(SW, SH) {
  const c = makeCanvas(SW, SH);
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,0.22)';
  const k = SW / 320;
  for (let y = 0; y < SH; y += 3 * k) x.fillRect(0, y, SW, k);
  const g = x.createRadialGradient(SW / 2, SH / 2, SH * 0.3, SW / 2, SH / 2, SW * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.62)');
  x.fillStyle = g; x.fillRect(0, 0, SW, SH);
  const s = x.createLinearGradient(0, 0, SW * 0.6, SH * 0.5);
  s.addColorStop(0, 'rgba(255,255,255,0.12)'); s.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = s; x.fillRect(0, 0, SW * 0.6, SH * 0.5);
  return c;
}

/** Bild füllend (Querformat) bzw. als Poster mit abgedunkelten Rändern (Hochformat) in den 4:3-Bildschirm zeichnen. */
function drawArt(x, img, SW, SH) {
  const iw = img.width || img.naturalWidth;
  const ih = img.height || img.naturalHeight;
  x.fillStyle = '#05060c'; x.fillRect(0, 0, SW, SH);
  if (!iw || !ih) return;
  if (iw / ih >= 1.2) {
    const k = Math.max(SW / iw, SH / ih);
    x.drawImage(img, (SW - iw * k) / 2, (SH - ih * k) / 2, iw * k, ih * k);
  } else {
    x.globalAlpha = 0.45; x.drawImage(img, 0, 0, SW, SH); x.globalAlpha = 1;
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(0, 0, SW, SH);
    const w = (iw * SH) / ih;
    x.drawImage(img, (SW - w) / 2, 0, w, SH);
  }
}

function fallbackArt(x, title, SW, SH) {
  const g = x.createLinearGradient(0, 0, SW, SH);
  g.addColorStop(0, '#2a2f8a'); g.addColorStop(1, '#0b0f2c');
  x.fillStyle = g; x.fillRect(0, 0, SW, SH);
  x.fillStyle = 'rgba(255,255,255,0.9)'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `bold ${26 * (SW / 320)}px ${FONT}`;
  x.fillText(String(title || 'VIDEOTHEK LENZ').slice(0, 22), SW / 2, SH / 2);
}

export default {
  name: 'tv',
  init(ctx) {
    const L = ctx.layout;
    const zt = L.zones.tv;
    if (!zt) return {};
    const r = zt.rect;
    if (r.x1 - r.x0 < 2.4 || r.z1 - r.z0 < 2.4) return {};
    const reduced = prefersReducedMotion();
    const backX = L.adultRoom ? Math.min(r.x1 + 0.28, L.adultRoom.x0 - 0.04) : r.x1;
    const zc = clamp((r.z0 + r.z1) / 2, r.z0 + 0.8, r.z1 - 0.8);
    const xf = backX - 0.5; // Front der Bildröhre
    const solid = [];
    const WOOD = [0.5, 0.33, 0.19];
    // Schrank
    solid.push(box({ w: 0.55, h: 0.5, d: 1.1, x: backX - 0.275, y: 0.3, z: zc, color: WOOD }));
    solid.push(box({ w: 0.56, h: 0.04, d: 1.14, x: backX - 0.275, y: 0.57, z: zc, color: [0.36, 0.23, 0.12] }));
    for (const sz of [-1, 1]) solid.push(box({ w: 0.08, h: 0.08, d: 0.08, x: backX - 0.275, y: 0.02, z: zc + sz * 0.5, color: [0.2, 0.13, 0.08] }));
    solid.push(box({ w: 0.02, h: 0.28, d: 0.9, x: backX - 0.55, y: 0.32, z: zc, color: [0.12, 0.12, 0.14] })); // Fachfront (dunkel)
    solid.push(box({ w: 0.16, h: 0.06, d: 0.4, x: backX - 0.5, y: 0.2, z: zc, color: [0.55, 0.57, 0.6] })); // Videorekorder
    // Röhrenfernseher: Gehäuse, verjüngter Hinterbau, Rahmen, Knöpfe, Antenne
    solid.push(box({ w: 0.3, h: 0.62, d: 0.8, x: backX - 0.34, y: 0.92, z: zc, color: [0.2, 0.2, 0.23] }));
    solid.push(box({ w: 0.28, h: 0.48, d: 0.62, x: backX - 0.1, y: 0.92, z: zc, color: [0.16, 0.16, 0.19] }));
    for (const [w, h, d, y, z] of [[0.04, 0.05, 0.74, 1.2, 0], [0.04, 0.05, 0.74, 0.66, 0], [0.04, 0.5, 0.05, 0.93, -0.35], [0.04, 0.5, 0.05, 0.93, 0.35]]) {
      solid.push(box({ w, h, d, x: xf - 0.01, y, z: zc + z, color: [0.3, 0.3, 0.34] }));
    }
    for (let i = 0; i < 3; i++) solid.push(box({ w: 0.03, h: 0.035, d: 0.035, x: xf - 0.01, y: 0.84 + i * 0.07, z: zc + 0.355, color: [0.75, 0.75, 0.8] }));
    for (const s of [-1, 1]) solid.push(box({ w: 0.015, h: 0.38, d: 0.015, x: backX - 0.14, y: 1.36, z: zc, rz: 0, rx: s * 0.55, color: [0.7, 0.72, 0.78] }));
    // Sofa (blickt nach +x zum Fernseher): Stoff-Textur, Sitz-/Rückenkissen, Armlehnen, Zierkissen; Couchtisch mit VHS-Stapel; Läufer
    const backEdge = Math.max(r.x0 + 0.02, backX - 3.25);
    const sofaX = backEdge + 0.45;
    const SOFA = [0.92, 0.55, 0.26];
    const dk = (c, f) => c.map((v) => v * f);
    const cloth = [];
    const T = 0.4;
    const legC = [0.2, 0.13, 0.08];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) solid.push(box({ w: 0.07, h: 0.12, d: 0.07, x: sofaX + sx * 0.38, y: 0.06, z: zc + sz * 0.88, color: legC }));
    cloth.push(box({ w: 0.9, h: 0.16, d: 1.9, x: sofaX, y: 0.2, z: zc, color: dk(SOFA, 0.78), tile: T }));
    cloth.push(box({ w: 0.2, h: 0.62, d: 1.9, x: backEdge + 0.1, y: 0.5, z: zc, color: dk(SOFA, 0.85), tile: T }));
    for (const s of [-1, 1]) {
      cloth.push(box({ w: 0.9, h: 0.34, d: 0.2, x: sofaX, y: 0.37, z: zc + s * 0.95, color: dk(SOFA, 0.8), tile: T }));
      cloth.push(box({ w: 0.92, h: 0.07, d: 0.26, x: sofaX, y: 0.56, z: zc + s * 0.95, color: dk(SOFA, 0.92), tile: T }));
      cloth.push(box({ w: 0.62, h: 0.16, d: 0.76, x: sofaX + 0.1, y: 0.36, z: zc + s * 0.38, color: SOFA, tile: T }));
      cloth.push(box({ w: 0.16, h: 0.4, d: 0.74, x: backEdge + 0.28, y: 0.56, z: zc + s * 0.38, rz: 0.14, color: dk(SOFA, 1.05), tile: T }));
    }
    cloth.push(box({ w: 0.14, h: 0.2, d: 0.2, x: sofaX - 0.05, y: 0.62, z: zc - 0.7, rz: 0.4, ry: 0.4, color: [0.2, 0.66, 0.64], tile: T }));
    cloth.push(box({ w: 0.14, h: 0.2, d: 0.2, x: sofaX - 0.05, y: 0.62, z: zc + 0.72, rz: 0.35, ry: -0.3, color: [0.9, 0.25, 0.5], tile: T }));
    // Couchtisch
    const tx = sofaX + 1.25;
    const wood = [0.5, 0.33, 0.19];
    solid.push(box({ w: 0.62, h: 0.04, d: 1.05, x: tx, y: 0.4, z: zc, color: wood }));
    solid.push(box({ w: 0.5, h: 0.025, d: 0.93, x: tx, y: 0.16, z: zc, color: dk(wood, 0.8) }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) solid.push(box({ w: 0.05, h: 0.38, d: 0.05, x: tx + sx * 0.27, y: 0.19, z: zc + sz * 0.48, color: dk(wood, 0.7) }));
    // VHS-Stapel + Fernbedienung
    const TAPE = [[0.1, 0.1, 0.1], [0.82, 0.8, 0.72], [0.12, 0.2, 0.4], [0.1, 0.1, 0.1]];
    TAPE.forEach((c, i) => solid.push(box({ w: 0.19, h: 0.028, d: 0.1, x: tx - 0.05, y: 0.434 + i * 0.03, z: zc - 0.25, ry: (i % 2 ? 0.2 : -0.12), color: c })));
    solid.push(box({ w: 0.05, h: 0.016, d: 0.17, x: tx + 0.1, y: 0.428, z: zc + 0.2, ry: 0.35, color: [0.12, 0.12, 0.14] }));
    solid.push(box({ w: 0.02, h: 0.018, d: 0.03, x: tx + 0.1, y: 0.438, z: zc + 0.22, ry: 0.35, color: [0.9, 0.2, 0.2] }));
    // Läufer (Streifenmuster)
    const rx = (sofaX + xf) / 2 + 0.15;
    solid.push(box({ w: 2.7, h: 0.01, d: 1.25, x: rx, y: 0.006, z: zc, color: [0.13, 0.26, 0.5] }));
    for (const sz of [-0.5, 0.5]) solid.push(box({ w: 2.7, h: 0.012, d: 0.07, x: rx, y: 0.007, z: zc + sz, color: [0.95, 0.75, 0.25] }));
    for (const sx of [-1, 1]) solid.push(box({ w: 0.07, h: 0.012, d: 1.25, x: rx + sx * 1.3, y: 0.007, z: zc, color: [0.95, 0.75, 0.25] }));
    const solidMesh = new Mesh(merge(solid), new MeshLambertMaterial({ vertexColors: true }));
    solidMesh.matrixAutoUpdate = false;
    const fabric = makeCanvas(64, 64);
    {
      const g = fabric.getContext('2d');
      g.fillStyle = '#e8e0d4'; g.fillRect(0, 0, 64, 64);
      g.strokeStyle = 'rgba(80,60,40,0.22)'; g.lineWidth = 1;
      for (let i = 0; i < 64; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); }
    }
    const fabricTex = new CanvasTexture(fabric);
    fabricTex.colorSpace = SRGBColorSpace;
    fabricTex.wrapS = RepeatWrapping;
    fabricTex.wrapT = RepeatWrapping;
    const clothMesh = new Mesh(merge(cloth), new MeshLambertMaterial({ map: fabricTex, vertexColors: true }));
    clothMesh.matrixAutoUpdate = false;
    ctx.track(fabricTex);

    // Bildschirm: leicht gewölbte Ebene mit Canvas-Textur
    const sc = makeCanvas(SW, SH);
    const sx = sc.getContext('2d');
    const tex = new CanvasTexture(sc);
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = LinearFilter;
    tex.generateMipmaps = false;
    const geo = new PlaneGeometry(0.62, 0.465, 8, 6);
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const u = pa.getX(i) / 0.31;
      const v = pa.getY(i) / 0.2325;
      pa.setZ(i, 0.03 * (1 - 0.5 * u * u - 0.5 * v * v));
    }
    geo.computeVertexNormals();
    const screen = new Mesh(geo, new MeshBasicMaterial({ map: tex, toneMapped: false }));
    screen.position.set(xf - 0.014, 0.93, zc - 0.0);
    screen.rotation.y = -Math.PI / 2;
    screen.matrixAutoUpdate = false;
    screen.updateMatrix();
    for (const o of [solidMesh, clothMesh, screen]) { ctx.scene.add(o); ctx.track(o); }
    ctx.track(tex);

    ctx.addCollider({ x0: backX - 0.56, z0: zc - 0.6, x1: backX, z1: zc + 0.6 });
    ctx.addCollider({ x0: backEdge - 0.02, z0: zc - 1.05, x1: backEdge + 0.92, z1: zc + 1.05 });
    ctx.addCollider({ x0: tx - 0.33, z0: zc - 0.55, x1: tx + 0.33, z1: zc + 0.55 });

    // --- Programm: Diashow aus Highlights + einigen zufälligen Titeln mit Backdrop ---
    const items = ctx.catalog.items;
    const adult = adultIds(ctx.catalog);
    const hl = (ctx.catalog.highlights || []).filter((i) => i && i.Id && !adult.has(i.Id));
    const seen = new Set(hl.map((i) => i.Id));
    const extra = [];
    if (items && typeof items.values === 'function') {
      const all = [...items.values()].filter((i) => i && i.Id && !seen.has(i.Id) && !adult.has(i.Id) && i.BackdropImageTags && i.BackdropImageTags.length);
      for (let i = 0; i < 6 && all.length; i++) extra.push(all.splice(Math.floor(Math.random() * all.length), 1)[0]);
    }
    const slides = [...hl.slice(0, 8), ...extra].map((it) => ({ it, id: it.Id, title: it.Name, canvas: null, st: 'idle', big: null, bst: 'idle' }));
    if (!slides.length) {
      sx.fillStyle = '#05060c'; sx.fillRect(0, 0, SW, SH);
      tex.needsUpdate = true;
    }
    const ac = new AbortController();
    const noise = [noiseCanvas(), noiseCanvas(), noiseCanvas()];
    const overSmall = overlayCanvas(SW, SH);

    // Aktives Zeichenziel: klein (320×240, Normalbetrieb) oder groß (960×720, nur beim Sitzen)
    let W = SW;
    let H = SH;
    let gx = sx;
    let over = overSmall;
    let bigCanvas = null;
    let bigTex = null;

    function slideUrl(s, maxWidth) {
      const tag = s.it.BackdropImageTags && s.it.BackdropImageTags[0];
      return tag
        ? ctx.deps.imageUrl(s.id, { type: 'Backdrop', maxWidth, tag })
        : ctx.deps.imageUrl(s.id, { type: 'Primary', maxWidth: Math.round(maxWidth * 0.66), tag: s.it.ImageTags && s.it.ImageTags.Primary });
    }
    function loadSlide(i) {
      const s = slides[i % slides.length];
      if (!s || s.st !== 'idle') return;
      s.st = 'loading';
      loadBitmap(slideUrl(s, 480), ac.signal).then((bm) => {
        if (!bm || ac.signal.aborted) { s.st = 'failed'; closeBitmap(bm); return; }
        const c = makeCanvas(SW, SH);
        try { drawArt(c.getContext('2d'), bm, SW, SH); s.canvas = c; s.st = 'ready'; } catch { s.st = 'failed'; }
        closeBitmap(bm);
      });
    }
    // Sitz-Ansicht: scharfe Backdrops (eigener Cache, nur aktuelle + nächste Folie, beim Aufstehen freigegeben)
    let sitAc = null;
    function freeBig(keep) {
      for (let i = 0; i < slides.length; i++) {
        const s = slides[i];
        if (keep && keep.includes(i)) continue;
        if (s.big) { s.big.width = 0; s.big.height = 0; }
        s.big = null;
        if (s.bst !== 'loading') s.bst = 'idle';
      }
    }
    function loadBig(i) {
      if (!slides.length || !sitAc) return;
      const s = slides[((i % slides.length) + slides.length) % slides.length];
      if (!s || s.bst !== 'idle') return;
      s.bst = 'loading';
      const sig = sitAc.signal;
      loadBitmap(slideUrl(s, 1280), sig).then((bm) => {
        if (!bm || sig.aborted) { s.bst = 'idle'; closeBitmap(bm); return; }
        const c = makeCanvas(BW, BH);
        try { drawArt(c.getContext('2d'), bm, BW, BH); s.big = c; s.bst = 'ready'; } catch { s.bst = 'failed'; }
        closeBitmap(bm);
      });
    }
    function updateBig() {
      const a = idx % slides.length;
      const b = (idx + 1) % slides.length;
      freeBig([a, b]);
      loadBig(a); loadBig(b);
    }
    function useBig(on) {
      const mat = screen.material;
      if (on) {
        bigCanvas = makeCanvas(BW, BH);
        bigTex = new CanvasTexture(bigCanvas);
        bigTex.colorSpace = SRGBColorSpace;
        bigTex.minFilter = LinearFilter;
        bigTex.generateMipmaps = false;
        W = BW; H = BH; gx = bigCanvas.getContext('2d');
        over = overlayCanvas(BW, BH);
        mat.map = bigTex;
      } else {
        W = SW; H = SH; gx = sx; over = overSmall;
        mat.map = tex;
        if (bigTex) bigTex.dispose();
        if (bigCanvas) { bigCanvas.width = 0; bigCanvas.height = 0; }
        bigTex = null; bigCanvas = null;
      }
      mat.needsUpdate = true;
    }

    // --- Trailer (optional): Kandidatenliste, lazy gefunden; höchstens EIN Video-Element, URL (api_key) nie loggen ---
    let trailer = null; // { video, id, title, item } – erst gesetzt, wenn das Video spielbereit ist
    let vid = null;
    let vtoken = 0;
    const trailers = []; // { id, title, item, url }
    const cands = pickCandidates({ highlights: hl, items, adult, max: 12 });
    let cIdx = 0;
    let discovering = null;
    let trIdx = -1;
    let autoTried = false;
    let level = ctx.quality();
    let suspended = false;
    let disposed = false;
    let seat = 'idle'; // idle | in | leaving
    const offCouch = ctx.provide('couch', { seated: () => seat === 'in' });
    let userMuted = false;
    let vol = 0.7;
    try { const sv = parseFloat(sessionStorage.getItem(VOL_KEY)); if (Number.isFinite(sv)) vol = clamp(sv, 0, 1); } catch { /* egal */ }
    const withTimeout = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(() => res(null), ms))]);
    function applyAudio(v) {
      if (!v) return;
      try { v.muted = !(seat === 'in' && !userMuted); v.volume = vol; } catch { /* egal */ }
    }
    function killVideo() {
      vtoken++;
      const v = vid;
      vid = null;
      trailer = null;
      if (!v) return;
      try { v.pause(); v.muted = true; v.removeAttribute('src'); v.load(); } catch { /* egal */ }
    }
    function discover(want) {
      if (!ctx.deps.getItem || !ctx.deps.loadTrailer) return Promise.resolve();
      if (discovering) return discovering;
      discovering = (async () => {
        try {
          while (trailers.length < want && cIdx < cands.length && !ac.signal.aborted) {
            const it = cands[cIdx++];
            try {
              const full = await withTimeout(ctx.deps.getItem(it.Id), 6000);
              if (!full || !(full.LocalTrailerCount > 0)) continue;
              const url = await withTimeout(ctx.deps.loadTrailer(full), 6000);
              if (url && !ac.signal.aborted) trailers.push({ id: it.Id, title: it.Name, item: full, url });
            } catch { /* nächster Kandidat */ }
          }
        } finally { discovering = null; }
      })();
      return discovering;
    }
    function playVideo(v) {
      let pr;
      try { pr = v.play(); } catch { pr = null; }
      if (!pr || !pr.catch) return;
      pr.catch((e) => {
        if (!trailer || trailer.video !== v || (e && e.name === 'AbortError')) return;
        if (!v.muted) { v.muted = true; userMuted = true; refreshUi(); playVideo(v); } else begin('slide');
      });
    }
    // Früh gestartetes play() (noch in der Nutzergeste, vor canplay): Fehler still schlucken; der Zustandsautomat startet danach erneut
    function playQuiet(v) { try { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); } catch { /* egal */ } }
    /** Trailer i in das (wiederverwendete) Video-Element laden; im Sitzen startet play() noch im Geste-Stack (Ton). */
    async function openTrailer(i) {
      const e = trailers[i];
      if (!e || disposed) return false;
      const tk = ++vtoken;
      trailer = null;
      if (!vid) {
        const nv = document.createElement('video');
        nv.muted = true; nv.defaultMuted = true; nv.loop = true; nv.playsInline = true; nv.preload = 'auto';
        nv.setAttribute('playsinline', ''); nv.setAttribute('muted', '');
        nv.crossOrigin = 'anonymous';
        nv.addEventListener('error', () => { if (trailer && trailer.video === nv) { trailer = null; if (state === 'trailer') begin('slide'); } });
        vid = nv;
      }
      const v = vid;
      applyAudio(v);
      const ok = await new Promise((res) => {
        const done = (val) => { clearTimeout(tm); v.removeEventListener('canplay', onOk); v.removeEventListener('error', onErr); res(val); };
        const onOk = () => done(true);
        const onErr = () => done(false);
        const tm = setTimeout(() => done(false), 9000);
        v.addEventListener('canplay', onOk);
        v.addEventListener('error', onErr);
        v.src = e.url;
        if (seat === 'in') playQuiet(v);
      });
      if (tk !== vtoken || disposed || ac.signal.aborted) return false;
      if (!ok) {
        const k = trailers.indexOf(e);
        if (k >= 0) trailers.splice(k, 1);
        try { v.pause(); v.removeAttribute('src'); v.load(); } catch { /* egal */ }
        return false;
      }
      trailer = { video: v, id: e.id, title: e.title, item: e.item };
      trIdx = trailers.indexOf(e);
      return true;
    }
    function autoStart() {
      if (autoTried || reduced || level === 'low' || suspended) return;
      autoTried = true;
      discover(1).then(() => { if (!ac.signal.aborted && !trailer && trailers.length && !suspended) openTrailer(0); });
    }

    // --- Zustandsautomat ---
    let state = 'slide'; // slide | static | trailer
    let after = 'slide';
    let idx = 0;
    let stateT = 0;
    let shown = 0;
    let chan = 3;
    let osdT = 2;
    let drawT = 0;
    let visT = 0;
    let visible = false;
    let near = false;
    let canVideo = false;
    const cam = ctx.camera;

    function begin(kind) {
      state = kind;
      stateT = 0;
      if (kind === 'static') { chan = 1 + ((chan + 2 + Math.floor(Math.random() * 5)) % 9); osdT = 1.6; }
    }
    function current() {
      if (state === 'trailer' && trailer) return { id: trailer.id, title: trailer.title, item: trailer.item };
      const s = slides[idx % slides.length];
      return s ? { id: s.id, title: s.title, item: s.it } : null;
    }
    function gotoSlide(n) {
      idx = n;
      loadSlide(idx); loadSlide(idx + 1); loadSlide(idx + 2);
      if (seat === 'in') updateBig();
    }
    function checkVisible() {
      if (seat === 'in') { near = true; visible = true; canVideo = !suspended; return; } // im Sitzen kostet die Szene kaum etwas: Trailer auch bei Qualität low
      const e = cam.matrixWorld.elements;
      const fx = -e[8];
      const fz = -e[10];
      const px = e[12];
      const pz = e[14];
      const dx = xf - px;
      const dz = zc - pz;
      const d = Math.hypot(dx, dz);
      near = d < 14;
      const dot = d > 0.01 ? (fx * dx + fz * dz) / d : 1;
      const front = px < backX; // Kamera auf der Bildschirmseite
      visible = near && front && (dot > 0.35 || d < 1.2);
      canVideo = visible && d < 12 && level !== 'low' && !suspended;
    }
    function frame() {
      if (!slides.length) return;
      const k = W / SW;
      const s = slides[idx % slides.length];
      const sitting = seat === 'in';
      gx.imageSmoothingEnabled = state !== 'static';
      if (state === 'static') {
        gx.imageSmoothingEnabled = false;
        gx.drawImage(noise[Math.floor(Math.random() * 3)], 0, 0, W, H);
      } else if (state === 'trailer' && trailer && trailer.video.readyState >= 2) {
        const v = trailer.video;
        const vw = v.videoWidth || 16;
        const vh = v.videoHeight || 9;
        // Sitzen: ganzes Bild (Letterbox, nichts abgeschnitten); sonst füllend
        const kk = sitting ? Math.min(W / vw, H / vh) : Math.max(W / vw, H / vh);
        gx.fillStyle = '#000'; gx.fillRect(0, 0, W, H);
        gx.drawImage(v, (W - vw * kk) / 2, (H - vh * kk) / 2, vw * kk, vh * kk);
      } else if (s && ((sitting && s.big) || s.canvas)) {
        gx.drawImage((sitting && s.big) || s.canvas, 0, 0, W, H);
      } else {
        fallbackArt(gx, s && s.title, W, H);
      }
      if (state !== 'static') {
        const cur = current();
        gx.fillStyle = 'rgba(0,0,0,0.55)'; gx.fillRect(0, H - 34 * k, W, 34 * k);
        gx.fillStyle = '#f4f6ff'; gx.textAlign = 'left'; gx.textBaseline = 'middle';
        gx.font = `bold ${15 * k}px ${FONT}`;
        gx.fillText(String((cur && cur.title) || '').slice(0, 30), 12 * k, H - 17 * k);
        gx.fillStyle = '#ffd23f'; gx.textAlign = 'right'; gx.font = `${12 * k}px ${FONT}`;
        gx.fillText(state === 'trailer' ? 'VORSCHAU' : 'KANAL ' + chan, W - 12 * k, H - 17 * k);
      }
      if (osdT > 0) {
        gx.fillStyle = '#6dff8a'; gx.textAlign = 'left'; gx.textBaseline = 'top'; gx.font = `bold ${22 * k}px "Courier New",monospace`;
        gx.fillText('CH ' + String(chan).padStart(2, '0'), 14 * k, 12 * k);
      }
      gx.drawImage(over, 0, 0, W, H);
      (bigTex || tex).needsUpdate = true;
    }

    ctx.addInteractable({
      box: { min: { x: backX - 0.7, y: 0, z: zc - 0.62 }, max: { x: backX, y: 1.3, z: zc + 0.62 } },
      label: 'Fernseher', hint: 'E / Klick: Gezeigten Titel nehmen',
      onUse: () => { const c = current(); if (c && c.id) ctx.items.take(c.id, { from: 'counter' }); },
    });
    const removeSofa = ctx.addInteractable({
      box: { min: { x: backEdge, y: 0.1, z: zc - 0.95 }, max: { x: sofaX + 0.45, y: 0.8, z: zc + 0.95 } },
      label: 'Sofa', hint: 'E / Klick: Hinsetzen',
      onUse: () => sitDown(),
    });

    frame(); // Standbild schon vor dem ersten Näherkommen (Fallback-Grafik)

    function pauseVideo() { if (trailer) { try { trailer.video.pause(); } catch { /* egal */ } } }

    // --- Couch: Hinsetzen, TV-Vollbild, Aufstehen ---
    let snap = null;
    let ui = null;
    let instantLeave = false;
    let afterLeave = null;
    let settled = false;
    let fitKey = '';
    let flyToken = 0;
    const screenX = xf - 0.014;
    const SIT = { x: sofaX, y: 1.0, z: zc };
    const LOOK = { x: screenX, y: 0.93, z: zc };

    const keyOf = () => `${cam.fov.toFixed(2)}|${cam.aspect.toFixed(3)}`;
    function flyClose(ms) {
      const tk = ++flyToken;
      fitKey = keyOf();
      settled = false;
      const d = fitDistance(cam.fov, cam.aspect); // Abstand zur Schirmebene; die Wölbung (0,03 m) liegt davor, Near-Plane (0,05) bleibt frei
      return ctx.player.camera.flyTo({ x: screenX - d, y: 0.93, z: zc }, LOOK, ms).then((ok) => { if (ok && tk === flyToken) settled = true; return ok; });
    }
    function eyeTarget(p) {
      const cp = Math.cos(p.pitch || 0);
      return { x: p.x - Math.sin(p.yaw) * cp, y: EYE + Math.sin(p.pitch || 0), z: p.z - Math.cos(p.yaw) * cp };
    }
    function refit() {
      if (seat !== 'in' || !settled || keyOf() === fitKey) return;
      flyClose(250);
    }

    function buildUi() {
      const root = h('div', 'lfx-store-couch');
      const bar = h('div', 'lfx-store-couch-bar');
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', 'Fernseher');
      const info = h('div', 'lfx-store-couch-info');
      const title = h('span', 'lfx-store-couch-title', '');
      const tag = h('span', 'lfx-store-couch-tag', '');
      info.append(title, tag);
      const row = h('div', 'lfx-store-couch-btns');
      const bStand = button('Aufstehen', 'lfx-store-couch-btn', () => ctx.overlay.close());
      const bNext = button('Nächster', 'lfx-store-couch-btn', () => next());
      const bSnd = button('Ton aus', 'lfx-store-couch-btn', () => {
        userMuted = !userMuted;
        applyAudio(trailer && trailer.video);
        if (trailer && trailer.video.paused) playVideo(trailer.video);
        refreshUi();
      });
      const bDn = button('Leiser', 'lfx-store-couch-btn', () => setVol(vol - 0.15));
      const bUp = button('Lauter', 'lfx-store-couch-btn', () => setVol(vol + 0.15));
      const bWatch = button('Diesen Film ansehen', 'lfx-store-couch-btn is-main', () => watch());
      row.append(bStand, bNext, bSnd, bDn, bUp, bWatch);
      bar.append(info, row);
      root.appendChild(bar);
      return { root, title, tag, bSnd, bDn, bUp, last: '' };
    }
    function refreshUi() {
      if (!ui) return;
      const cur = current();
      const playing = state === 'trailer' && !!trailer;
      const sig = `${(cur && cur.title) || ''}|${playing}|${userMuted}`;
      if (sig === ui.last) return;
      ui.last = sig;
      ui.title.textContent = (cur && cur.title) || 'VIDEOTHEK LENZ';
      ui.tag.textContent = playing ? 'Vorschau' : 'Diashow';
      ui.bSnd.hidden = !playing;
      ui.bDn.hidden = !playing;
      ui.bUp.hidden = !playing;
      ui.bSnd.textContent = userMuted ? 'Ton an' : 'Ton aus';
    }
    function setVol(v) {
      vol = clamp(v, 0, 1);
      try { sessionStorage.setItem(VOL_KEY, String(vol)); } catch { /* egal */ }
      if (vol > 0) userMuted = false;
      applyAudio(trailer && trailer.video);
      if (trailer && trailer.video.paused) playVideo(trailer.video);
      refreshUi();
    }

    function sitDown() {
      if (seat !== 'idle' || disposed || suspended || ctx.overlay.isOpen() || !slides.length) return;
      seat = 'in';
      snap = { ...ctx.player.getPose() };
      instantLeave = false;
      afterLeave = null;
      settled = false;
      ctx.player.freeze(true);
      sitAc = new AbortController();
      useBig(true);
      userMuted = false;
      ui = buildUi();
      ctx.overlay.open(ui.root, { onClose: onClosed });
      const snd = ctx.use('sound');
      if (snd && snd.duck) snd.duck('tv', true);
      { const c = ctx.use('cashier'); if (c && c.event) c.event('couchSit'); }
      checkVisible();
      loadSlide(idx); loadSlide(idx + 1);
      updateBig();
      if (trailer) {
        // Nutzergeste (Klick/Tipp): Ton freischalten und im selben Call-Stack starten
        applyAudio(trailer.video);
        begin('trailer');
        playQuiet(trailer.video);
      } else {
        begin('slide');
        discover(trailers.length ? 0 : 1).then(() => {
          if (seat !== 'in' || trailer || !trailers.length) return;
          openTrailer(0).then((ok) => { if (ok && seat === 'in') { begin('trailer'); if (trailer) playVideo(trailer.video); } });
        });
      }
      frame();
      refreshUi();
      ctx.player.camera.flyTo(SIT, LOOK, 750).then((ok) => { if (ok && seat === 'in') flyClose(800); });
    }

    function next() {
      if (seat !== 'in') return;
      const nextSlide = () => { gotoSlide(idx + 1); after = 'slide'; begin('static'); };
      const target = trIdx + 1;
      const openAt = (i) => {
        begin('static'); after = 'slide';
        openTrailer(i).then((ok) => {
          if (seat !== 'in') return;
          if (ok) { begin('trailer'); if (trailer) playVideo(trailer.video); } else nextSlide();
        });
      };
      if (target < trailers.length) { openAt(target); return; }
      if (cIdx < cands.length && ctx.deps.getItem && ctx.deps.loadTrailer) {
        begin('static'); after = 'slide';
        discover(trailers.length + 1).then(() => {
          if (seat !== 'in') return;
          if (target < trailers.length) openAt(target);
          else if (trailers.length > 1) openAt(0);
          else nextSlide();
        });
        return;
      }
      if (trailers.length > 1) { openAt(0); return; }
      nextSlide();
    }

    function watch() {
      const c = current();
      if (!c || !c.id) return;
      const item = c.item || { Id: c.id, Name: c.title };
      // Wie am Kassen-PC: sofort aufstehen (ohne Rückfahrt) und über deps.play abspielen – derselbe Rückkehr-Weg der Hülle
      instantLeave = true;
      afterLeave = () => { try { ctx.deps.play(item, { resume: false }); } catch { if (ctx.deps.toast) ctx.deps.toast('Wiedergabe nicht möglich'); } };
      ctx.overlay.close();
    }

    function restoreCam() {
      if (snap) ctx.player.teleport(snap.x, snap.z, snap.yaw, snap.pitch);
      ctx.player.camera.release();
    }
    function finishLeave() {
      seat = 'idle';
      ctx.player.freeze(false);
      const a = afterLeave;
      afterLeave = null;
      if (a && !disposed) a();
      if (!disposed) { const c = ctx.use('cashier'); if (c && c.event) c.event('couchStand'); }
    }
    /** Overlay wurde geschlossen (Aufstehen, Esc, Suspend, Qualität low, Abspielen). */
    function onClosed() {
      const u = ui;
      ui = null;
      if (!u || seat === 'idle') return;
      seat = 'leaving';
      flyToken++;
      settled = false;
      if (sitAc) sitAc.abort();
      sitAc = null;
      applyAudio(trailer && trailer.video); // seat !== 'in' → stumm
      freeBig(null);
      useBig(false);
      visT = 1; // Auto-Betrieb prüft Sichtbarkeit im nächsten Takt neu
      frame();
      const snd = ctx.use('sound');
      if (snd && snd.duck) snd.duck('tv', false);
      if (disposed) { ctx.player.camera.release(); ctx.player.freeze(false); seat = 'idle'; return; }
      if (instantLeave || !snap) { restoreCam(); finishLeave(); return; }
      const s = snap;
      ctx.player.camera.flyTo({ x: s.x, y: EYE, z: s.z }, eyeTarget(s), 600).then(() => { if (!disposed) restoreCam(); finishLeave(); });
    }

    return {
      update(dt) {
        if (seat === 'in') refit();
        if (!slides.length || suspended) return;
        visT += dt;
        if (visT > 0.25) {
          visT = 0;
          const was = near;
          checkVisible();
          if (near && !was) { loadSlide(0); loadSlide(1); loadSlide(2); if (!reduced) setTimeout(() => { if (!ac.signal.aborted && near && level !== 'low') autoStart(); }, 5000); }
          if (state === 'trailer' && !canVideo) begin('slide');
          if (state === 'trailer' && trailer && canVideo && trailer.video.paused) playVideo(trailer.video);
          if (!canVideo || state !== 'trailer') pauseVideo();
          if (!trailer && state === 'trailer') begin('slide');
          refreshUi();
        }
        if (!visible) return;
        stateT += dt;
        osdT = Math.max(0, osdT - dt);
        const sitting = seat === 'in';
        if (state === 'slide') {
          if (stateT >= SLIDE_S) {
            shown++;
            gotoSlide(idx + 1);
            after = trailer && canVideo && (sitting || shown % 4 === 0) ? 'trailer' : 'slide';
            begin(reduced ? after : 'static');
            if (reduced) { stateT = 0; osdT = 0; }
          }
        } else if (state === 'static') {
          if (stateT >= STATIC_S) {
            begin(after);
            if (state === 'trailer' && trailer) playVideo(trailer.video);
          }
        } else if (state === 'trailer' && !sitting && stateT >= TRAILER_S) {
          gotoSlide(idx + 1);
          begin('static');
          after = 'slide';
        }
        drawT += dt;
        if (drawT >= (state === 'trailer' ? (sitting ? 1 / 30 : 1 / 24) : 1 / 12)) { drawT = 0; frame(); }
      },
      onQuality(lv) {
        level = lv;
        if (lv === 'low') {
          if (seat !== 'in') { // im Sitzen weiterlaufen lassen
            if (state === 'trailer') begin('slide');
            pauseVideo();
          }
        }
      },
      onSuspend() {
        suspended = true;
        if (seat === 'in' && ui) { instantLeave = true; ctx.overlay.close(); }
        killVideo();
        if (state === 'trailer') begin('slide');
      },
      onResume() { suspended = false; near = false; autoTried = false; },
      dispose() {
        disposed = true;
        ac.abort();
        removeSofa();
        offCouch();
        if (seat !== 'idle') {
          ui = null; // runtime.dispose schließt das Overlay danach; onClosed ist dann ein No-op
          if (sitAc) sitAc.abort();
          sitAc = null;
          freeBig(null);
          useBig(false);
          const snd = ctx.use('sound');
          if (snd && snd.duck) snd.duck('tv', false);
          ctx.player.camera.release();
          ctx.player.freeze(false);
          seat = 'idle';
        }
        killVideo();
      },
    };
  },
};
