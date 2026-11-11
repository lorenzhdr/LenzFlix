// VIDEOTHEK LENZ · VR-Kino: gewölbte Leinwand, Video-Textur (per Polling) und Status-Bild.
// screenGeometry/fitScreen sind rein (nur BufferGeometry); createScreen hängt Meshes und Texturen daran.
import {
  BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Group, CanvasTexture, VideoTexture,
  SRGBColorSpace, LinearFilter, FrontSide,
} from 'three';

export const SCREEN_RADIUS = 14;
export const SCREEN_MAX_W = 16;
export const SCREEN_MAX_H = 9;
export const SCREEN_BOTTOM = 1.5;

/**
 * Zylindersegment, Innenseite zum Publikum (+z). width = Bogenlänge in Metern, Mittelpunkt im Ursprung,
 * Bogenmitte bei z = 0, die Ränder liegen bei z > 0 (zum Publikum hin). UV 0..1 (v oben = 1).
 */
export function screenGeometry({ radius = SCREEN_RADIUS, width = SCREEN_MAX_W, aspect = 16 / 9, height } = {}) {
  const R = Math.max(1, Number(radius) || SCREEN_RADIUS);
  const w = Math.max(0.1, Number(width) || SCREEN_MAX_W);
  const a = aspect > 0 ? aspect : 16 / 9;
  const h = height > 0 ? height : w / a;
  const arc = Math.min(w / R, Math.PI * 0.9);
  const n = Math.max(4, Math.min(96, Math.ceil(arc / 0.05)));
  const pos = [];
  const nor = [];
  const uv = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const th = (f - 0.5) * arc;
    const x = R * Math.sin(th);
    const z = R * (1 - Math.cos(th));
    for (let j = 0; j < 2; j++) {
      pos.push(x, (j - 0.5) * h, z);
      nor.push(-Math.sin(th), 0, Math.cos(th));
      uv.push(f, j);
    }
  }
  const idx = [];
  for (let i = 0; i < n; i++) {
    const a0 = i * 2;
    const b0 = (i + 1) * 2;
    idx.push(a0, b0, b0 + 1, a0, b0 + 1, a0 + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.userData = { radius: R, width: arc * R, height: h, arc, chord: 2 * R * Math.sin(arc / 2) };
  return g;
}

/** Größe für ein Seitenverhältnis: höchstens maxW breit und maxH hoch. */
export function fitScreen(aspect, { maxW = SCREEN_MAX_W, maxH = SCREEN_MAX_H } = {}) {
  const a = Number.isFinite(aspect) && aspect > 0.3 && aspect < 6 ? aspect : 16 / 9;
  const width = Math.min(maxW, maxH * a);
  return { width, height: width / a, aspect: a };
}

const MIN_GAP = 22; // ms, höchstens ~45 Uploads/s
const PLAY_GAP = 33; // ms, bei laufendem Video auch ohne sichtbare currentTime-Änderung

/** VideoTexture ohne requestVideoFrameCallback: update() entscheidet anhand von readyState/currentTime. */
export class PolledVideoTexture extends VideoTexture {
  constructor(video) {
    super(video);
    try {
      if (this._requestVideoFrameCallbackId && typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(this._requestVideoFrameCallbackId);
    } catch { /* egal */ }
    this._requestVideoFrameCallbackId = 0;
    this.colorSpace = SRGBColorSpace;
    this.minFilter = LinearFilter;
    this.magFilter = LinearFilter;
    this.generateMipmaps = false;
    this.uploads = 0;
    this._lastTime = -1;
    this._lastAt = -1e9;
  }

  /** @returns {boolean} true, wenn ein Upload angefordert wurde. */
  update(now = typeof performance !== 'undefined' ? performance.now() : Date.now()) {
    const v = this.image;
    if (!v || (Number(v.readyState) || 0) < 2) return false;
    const t = Number(v.currentTime);
    const gap = now - this._lastAt;
    let go = false;
    if (t !== this._lastTime) go = gap >= MIN_GAP;
    else if (!v.paused && !v.ended) go = gap >= PLAY_GAP;
    if (!go) return false;
    this._lastTime = t;
    this._lastAt = now;
    this.uploads++;
    this.needsUpdate = true;
    return true;
  }
}

function ctx2d(canvas) {
  try { return canvas.getContext ? canvas.getContext('2d') : null; } catch { return null; }
}

/** Status-Bild („Film wird gestartet …“, „Kino konnte nicht starten“). */
export function drawStatus(canvas, { title = '', text = '', sub = '' } = {}) {
  const g = ctx2d(canvas);
  if (!g) return false;
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = '#05060b';
  g.fillRect(0, 0, W, H);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffd23f';
  g.font = `700 ${Math.round(H * 0.058)}px system-ui, "Segoe UI", Arial, sans-serif`;
  g.fillText('VIDEOTHEK LENZ', W / 2, H * 0.2, W * 0.9);
  if (title) {
    g.fillStyle = '#aab4e8';
    g.font = `600 ${Math.round(H * 0.06)}px system-ui, "Segoe UI", Arial, sans-serif`;
    g.fillText(String(title).slice(0, 80), W / 2, H * 0.42, W * 0.9);
  }
  g.fillStyle = '#f4f6ff';
  g.font = `700 ${Math.round(H * 0.095)}px system-ui, "Segoe UI", Arial, sans-serif`;
  g.fillText(String(text), W / 2, H * 0.58, W * 0.92);
  if (sub) {
    g.fillStyle = '#aab4e8';
    g.font = `500 ${Math.round(H * 0.048)}px system-ui, "Segoe UI", Arial, sans-serif`;
    g.fillText(String(sub).slice(0, 90), W / 2, H * 0.74, W * 0.9);
  }
  return true;
}

/**
 * Leinwand + schwarze Maskierung. Gruppe zeigt zur Videothek-Seite (+z). Rückgabe:
 * { group, dims, setVideo(el|null), setStatus({title,text,sub}), update(now), videoFrames, hasFrame, video, dispose() }
 */
export function createScreen({ radius = SCREEN_RADIUS, bottom = SCREEN_BOTTOM } = {}) {
  const group = new Group();
  group.name = 'lfx-cinema-screen';
  const statusCanvas = document.createElement('canvas');
  statusCanvas.width = 1280;
  statusCanvas.height = 720;
  const statusTex = new CanvasTexture(statusCanvas);
  statusTex.colorSpace = SRGBColorSpace;
  statusTex.generateMipmaps = false;
  statusTex.minFilter = LinearFilter;
  const statusMat = new MeshBasicMaterial({ map: statusTex, toneMapped: false, side: FrontSide });
  const videoMat = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: FrontSide });
  const maskMat = new MeshBasicMaterial({ color: 0x000000, toneMapped: false, side: FrontSide });
  const mesh = new Mesh(new BufferGeometry(), statusMat);
  mesh.name = 'lfx-cinema-screen-surface';
  const mask = new Mesh(new BufferGeometry(), maskMat);
  mask.name = 'lfx-cinema-screen-mask';
  group.add(mask, mesh);

  const dims = { radius, bottom, width: SCREEN_MAX_W, height: SCREEN_MAX_W * 9 / 16, aspect: 16 / 9, centerY: 0, version: 0 };
  let video = null;
  let tex = null;
  let disposed = false;
  let status = { title: '', text: '', sub: '' };

  function rebuild(aspect) {
    const f = fitScreen(aspect);
    dims.width = f.width;
    dims.height = f.height;
    dims.aspect = f.aspect;
    dims.centerY = bottom + f.height / 2;
    dims.version++;
    mesh.geometry.dispose();
    mask.geometry.dispose();
    mesh.geometry = screenGeometry({ radius, width: f.width, aspect: f.aspect });
    mask.geometry = screenGeometry({ radius, width: f.width + 1.6, height: f.height + 1.2 });
    mask.position.z = -0.06;
    group.position.y = dims.centerY;
  }
  rebuild(16 / 9);

  const api = {
    group,
    dims,
    get video() { return video; },
    get videoFrames() { return tex ? tex.uploads : 0; },
    get hasFrame() { return Boolean(video && tex && tex.uploads >= 1 && (Number(video.readyState) || 0) >= 2 && (Number(video.videoWidth) || 0) > 0); },
    get texture() { return tex; },
    setVideo(el) {
      if (disposed || el === video) return;
      if (tex) { tex.dispose(); tex = null; }
      video = el || null;
      if (video) {
        tex = new PolledVideoTexture(video);
        videoMat.map = tex;
      } else videoMat.map = null;
      videoMat.needsUpdate = true;
      mesh.material = statusMat;
    },
    setStatus(s) {
      status = { ...status, ...(s || {}) };
      drawStatus(statusCanvas, status);
      statusTex.needsUpdate = true;
    },
    update(now) {
      if (disposed) return;
      if (tex) {
        tex.update(now);
        const vw = Number(video.videoWidth) || 0;
        const vh = Number(video.videoHeight) || 0;
        if (vw > 0 && vh > 0 && Math.abs(vw / vh - dims.aspect) > 0.01) rebuild(vw / vh);
      }
      const m = api.hasFrame ? videoMat : statusMat;
      if (mesh.material !== m) mesh.material = m;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (tex) tex.dispose();
      tex = null;
      video = null;
      statusTex.dispose();
      statusMat.dispose();
      videoMat.dispose();
      maskMat.dispose();
      mesh.geometry.dispose();
      mask.geometry.dispose();
      group.removeFromParent();
    },
  };
  return api;
}
