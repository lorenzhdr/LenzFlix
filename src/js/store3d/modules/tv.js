// VIDEOTHEK LENZ · M4 TV-Ecke (Zone „tv“): Röhrenfernseher auf Holzschrank + kleines Sofa. Bildschirm = Canvas-Textur mit
// Diashow aus Backdrops (Rauschen/Kanalwechsel, Scanlines, gewölbte Scheibe); lokale Trailer als letzte Stufe, abschaltbar
// (nur im Sichtfeld, < 12 m, Qualität ≠ low, nicht suspendiert). Die Trailer-URL enthält api_key und wird nie geloggt.
// Bilder laufen per loadBitmap → eigener Canvas (keine Dauer-Texturen). Interactable „Fernseher“ nimmt den gezeigten Titel.
import { Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, RepeatWrapping, CanvasTexture, SRGBColorSpace, LinearFilter } from 'three';
import { box, merge } from '../util/geo.js';
import { makeCanvas, FONT } from '../world/textures.js';
import { loadBitmap, closeBitmap } from '../covers/loader.js';
import { prefersReducedMotion, clamp, adultIds } from './m4-util.js';

const SW = 320;
const SH = 240;
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

function overlayCanvas() {
  const c = makeCanvas(SW, SH);
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < SH; y += 3) x.fillRect(0, y, SW, 1);
  const g = x.createRadialGradient(SW / 2, SH / 2, SH * 0.3, SW / 2, SH / 2, SW * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.62)');
  x.fillStyle = g; x.fillRect(0, 0, SW, SH);
  const s = x.createLinearGradient(0, 0, SW * 0.6, SH * 0.5);
  s.addColorStop(0, 'rgba(255,255,255,0.12)'); s.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = s; x.fillRect(0, 0, SW * 0.6, SH * 0.5);
  return c;
}

/** Bild füllend (Querformat) bzw. als Poster mit abgedunkelten Rändern (Hochformat) in den 4:3-Bildschirm zeichnen. */
function drawArt(x, img) {
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

function fallbackArt(x, title) {
  const g = x.createLinearGradient(0, 0, SW, SH);
  g.addColorStop(0, '#2a2f8a'); g.addColorStop(1, '#0b0f2c');
  x.fillStyle = g; x.fillRect(0, 0, SW, SH);
  x.fillStyle = 'rgba(255,255,255,0.9)'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `bold 26px ${FONT}`;
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
    const slides = [...hl.slice(0, 8), ...extra].map((it) => ({ it, id: it.Id, title: it.Name, canvas: null, st: 'idle' }));
    if (!slides.length) {
      sx.fillStyle = '#05060c'; sx.fillRect(0, 0, SW, SH);
      tex.needsUpdate = true;
    }
    const ac = new AbortController();
    const noise = [noiseCanvas(), noiseCanvas(), noiseCanvas()];
    const over = overlayCanvas();

    function loadSlide(i) {
      const s = slides[i % slides.length];
      if (!s || s.st !== 'idle') return;
      s.st = 'loading';
      const tag = s.it.BackdropImageTags && s.it.BackdropImageTags[0];
      const url = tag
        ? ctx.deps.imageUrl(s.id, { type: 'Backdrop', maxWidth: 480, tag })
        : ctx.deps.imageUrl(s.id, { type: 'Primary', maxWidth: 320, tag: s.it.ImageTags && s.it.ImageTags.Primary });
      loadBitmap(url, ac.signal).then((bm) => {
        if (!bm || ac.signal.aborted) { s.st = 'failed'; closeBitmap(bm); return; }
        const c = makeCanvas(SW, SH);
        try { drawArt(c.getContext('2d'), bm); s.canvas = c; s.st = 'ready'; } catch { s.st = 'failed'; }
        closeBitmap(bm);
      });
    }

    // --- Trailer (optional) ---
    let trailer = null; // { video, id, title }
    let trailerTried = false;
    let level = ctx.quality();
    let suspended = false;
    const withTimeout = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(() => res(null), ms))]);
    function killVideo() {
      if (!trailer) return;
      const v = trailer.video;
      trailer = null;
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch { /* egal */ }
    }
    async function findTrailer() {
      if (trailerTried || !ctx.deps.getItem || !ctx.deps.loadTrailer) return;
      trailerTried = true;
      for (const it of hl.slice(0, 4)) {
        if (ac.signal.aborted) return;
        try {
          const full = await withTimeout(ctx.deps.getItem(it.Id), 6000);
          if (!full || !(full.LocalTrailerCount > 0)) continue;
          const url = await withTimeout(ctx.deps.loadTrailer(full), 6000);
          if (!url || ac.signal.aborted) continue;
          const v = document.createElement('video');
          v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
          v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
          v.crossOrigin = 'anonymous';
          const ok = await new Promise((res) => {
            const done = (val) => { clearTimeout(tm); v.removeEventListener('canplay', onOk); v.removeEventListener('error', onErr); res(val); };
            const onOk = () => done(true);
            const onErr = () => done(false);
            const tm = setTimeout(() => done(false), 9000);
            v.addEventListener('canplay', onOk);
            v.addEventListener('error', onErr);
            v.src = url;
          });
          if (ok && !ac.signal.aborted) {
            v.addEventListener('error', () => { if (trailer && trailer.video === v) { if (state === 'trailer') begin('slide'); killVideo(); } });
            trailer = { video: v, id: it.Id, title: it.Name };
            return;
          }
          try { v.removeAttribute('src'); v.load(); } catch { /* egal */ }
        } catch { /* nächster Kandidat */ }
      }
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
      if (state === 'trailer' && trailer) return { id: trailer.id, title: trailer.title };
      const s = slides[idx % slides.length];
      return s ? { id: s.id, title: s.title } : null;
    }
    function checkVisible() {
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
      const s = slides[idx % slides.length];
      sx.imageSmoothingEnabled = state !== 'static';
      if (state === 'static') {
        sx.imageSmoothingEnabled = false;
        sx.drawImage(noise[Math.floor(Math.random() * 3)], 0, 0, SW, SH);
      } else if (state === 'trailer' && trailer && trailer.video.readyState >= 2) {
        const v = trailer.video;
        const vw = v.videoWidth || 16;
        const vh = v.videoHeight || 9;
        const k = Math.max(SW / vw, SH / vh);
        sx.fillStyle = '#000'; sx.fillRect(0, 0, SW, SH);
        sx.drawImage(v, (SW - vw * k) / 2, (SH - vh * k) / 2, vw * k, vh * k);
      } else if (s && s.canvas) {
        sx.drawImage(s.canvas, 0, 0);
      } else {
        fallbackArt(sx, s && s.title);
      }
      if (state !== 'static') {
        const cur = current();
        sx.fillStyle = 'rgba(0,0,0,0.55)'; sx.fillRect(0, SH - 34, SW, 34);
        sx.fillStyle = '#f4f6ff'; sx.textAlign = 'left'; sx.textBaseline = 'middle';
        sx.font = `bold 15px ${FONT}`;
        sx.fillText(String((cur && cur.title) || '').slice(0, 30), 12, SH - 17);
        sx.fillStyle = '#ffd23f'; sx.textAlign = 'right'; sx.font = `12px ${FONT}`;
        sx.fillText(state === 'trailer' ? 'VORSCHAU' : 'KANAL ' + chan, SW - 12, SH - 17);
      }
      if (osdT > 0) {
        sx.fillStyle = '#6dff8a'; sx.textAlign = 'left'; sx.textBaseline = 'top'; sx.font = `bold 22px "Courier New",monospace`;
        sx.fillText('CH ' + String(chan).padStart(2, '0'), 14, 12);
      }
      sx.drawImage(over, 0, 0);
      tex.needsUpdate = true;
    }

    ctx.addInteractable({
      box: { min: { x: backX - 0.7, y: 0, z: zc - 0.62 }, max: { x: backX, y: 1.3, z: zc + 0.62 } },
      label: 'Fernseher', hint: 'E / Klick: Gezeigten Titel nehmen',
      onUse: () => { const c = current(); if (c && c.id) ctx.items.take(c.id, { from: 'counter' }); },
    });

    frame(); // Standbild schon vor dem ersten Näherkommen (Fallback-Grafik)

    function pauseVideo() { if (trailer) { try { trailer.video.pause(); } catch { /* egal */ } } }

    return {
      update(dt) {
        if (!slides.length || suspended) return;
        visT += dt;
        if (visT > 0.25) {
          visT = 0;
          const was = near;
          checkVisible();
          if (near && !was) { loadSlide(0); loadSlide(1); loadSlide(2); if (!reduced) setTimeout(() => { if (!ac.signal.aborted && near && level !== 'low') findTrailer(); }, 5000); }
          if (state === 'trailer' && !canVideo) begin('slide');
          if (state === 'trailer' && trailer && canVideo && trailer.video.paused) { const pr = trailer.video.play(); if (pr && pr.catch) pr.catch(() => begin('slide')); }
          if (!canVideo || state !== 'trailer') pauseVideo();
          if (!trailer && state === 'trailer') begin('slide');
        }
        if (!visible) return;
        stateT += dt;
        osdT = Math.max(0, osdT - dt);
        if (state === 'slide') {
          if (stateT >= SLIDE_S) {
            shown++;
            idx++;
            loadSlide(idx + 1); loadSlide(idx + 2);
            after = trailer && canVideo && shown % 4 === 0 ? 'trailer' : 'slide';
            begin(reduced ? after : 'static');
            if (reduced) { stateT = 0; osdT = 0; }
          }
        } else if (state === 'static') {
          if (stateT >= STATIC_S) {
            begin(after);
            if (state === 'trailer' && trailer) { const pr = trailer.video.play(); if (pr && pr.catch) pr.catch(() => begin('slide')); }
          }
        } else if (state === 'trailer' && stateT >= TRAILER_S) {
          idx++;
          begin('static');
          after = 'slide';
        }
        drawT += dt;
        if (drawT >= (state === 'trailer' ? 1 / 24 : 1 / 12)) { drawT = 0; frame(); }
      },
      onQuality(lv) { level = lv; if (lv === 'low') { if (state === 'trailer') begin('slide'); pauseVideo(); } },
      onSuspend() { suspended = true; killVideo(); if (state === 'trailer') begin('slide'); },
      onResume() { suspended = false; near = false; trailerTried = false; },
      dispose() { ac.abort(); killVideo(); },
    };
  },
};
