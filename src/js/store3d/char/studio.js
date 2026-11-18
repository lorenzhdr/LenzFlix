// VIDEOTHEK LENZ · Foto-Studio (1.17.0): kleine eigene Szene für Editor-Vorschau und Ausweisporträt – Fotowand im 90er-Stil
// (Vorhang, Maßstriche für die Körpergröße, Schild), zwei Lichter, kein Nebel, 3 Draw-Calls (Bühne, Schild, Figur).
// Läuft im Kontext des vorhandenen Renderers (kein zweiter WebGL-Kontext); Kamera des Editors = player.camera.flyTo(cameraPose(fokus)).
// createStudio() → { scene, camera, figure(look), setLook(look), rotate(dRad), setYaw(y), getYaw(), update(dt), cameraPose(focus),
//   portrait(renderer, look) → HTMLCanvasElement 256×256, dispose() }. Die Figur steht bei (0,0,0) und blickt nach −z, die Kamera steht bei −z.
import {
  Scene, Color, PerspectiveCamera, HemisphereLight, DirectionalLight, MeshLambertMaterial, MeshBasicMaterial, Mesh, PlaneGeometry,
  WebGLRenderTarget, SRGBColorSpace, UnsignedByteType, RGBAFormat,
} from 'three';
import { box, merge } from '../util/geo.js';
import { makeCanvas, toTexture, FONT } from '../world/textures.js';
import { createFigure } from '../npc/figure.js';
import { lookKey } from '../npc/looks.js';

export const PORTRAIT_SIZE = 256;
export const PORTRAIT_CACHE_MAX = 16;
export const STUDIO_FOCUS = ['body', 'hair', 'face', 'top', 'bottom', 'shoes', 'extras'];

const CURTAIN_A = [0.5, 0.08, 0.15];
const CURTAIN_B = [0.4, 0.05, 0.12];
const WALL_Z = 1.1;

/** Fotowand als EIN gemergtes Mesh (Vertexfarben): Vorhangfalten, Boden-Schachbrett, Maßstab mit Strichen alle 10 cm. */
function stageGeometry() {
  const parts = [];
  const n = 16;
  const sw = 3.84 / n;
  for (let i = 0; i < n; i++) {
    parts.push(box({ w: sw - 0.01, h: 3, d: 0.1, x: -1.92 + sw * (i + 0.5), y: 1.5, z: WALL_Z + (i % 2 ? 0.04 : 0), color: i % 2 ? CURTAIN_B : CURTAIN_A }));
  }
  for (let ix = 0; ix < 6; ix++) {
    for (let iz = 0; iz < 5; iz++) {
      const dark = (ix + iz) % 2 === 0;
      parts.push(box({ w: 0.64, h: 0.04, d: 0.64, x: -1.6 + ix * 0.64, y: -0.02, z: -1.9 + iz * 0.64 + 0.32, color: dark ? [0.16, 0.16, 0.2] : [0.78, 0.76, 0.7] }));
    }
  }
  // Maßstab links an der Wand: Brett + Striche (0,5 … 2,0 m), Hauptstriche bei 1,0/1,5/2,0 m
  parts.push(box({ w: 0.26, h: 1.6, d: 0.02, x: -1.2, y: 1.25, z: WALL_Z - 0.07, color: [0.93, 0.9, 0.82] }));
  for (let i = 0; i <= 15; i++) {
    const y = 0.5 + i * 0.1;
    const major = Math.abs(y * 2 - Math.round(y * 2)) < 1e-6;
    parts.push(box({ w: major ? 0.2 : 0.12, h: major ? 0.016 : 0.01, d: 0.01, x: -1.2 - (major ? 0 : 0.04), y, z: WALL_Z - 0.085, color: major ? [0.75, 0.1, 0.15] : [0.15, 0.15, 0.2] }));
  }
  return merge(parts);
}

function signTexture() {
  const c = makeCanvas(512, 128);
  const x = c.getContext('2d');
  if (!x) return null;
  x.fillStyle = '#16327a'; x.fillRect(0, 0, 512, 128);
  x.fillStyle = '#ffd166'; x.fillRect(0, 0, 512, 8); x.fillRect(0, 120, 512, 8);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `bold 56px ${FONT}`;
  x.fillText('VIDEOTHEK LENZ', 256, 68);
  return toTexture(c, { aniso: 2 });
}

export function createStudio() {
  const scene = new Scene();
  scene.name = 'lfx-studio';
  scene.background = new Color(0.07, 0.05, 0.09);
  const stageMat = new MeshLambertMaterial({ vertexColors: true });
  const stage = new Mesh(stageGeometry(), stageMat);
  scene.add(stage);
  const tex = signTexture();
  const signMat = new MeshBasicMaterial(tex ? { map: tex } : { color: new Color(0.9, 0.7, 0.25) });
  const signGeo = new PlaneGeometry(1.6, 0.4);
  const sign = new Mesh(signGeo, signMat);
  sign.rotation.y = Math.PI; // Fläche zeigt nach −z (zur Kamera)
  sign.position.set(0.55, 2.45, WALL_Z - 0.08);
  scene.add(sign);
  const hemi = new HemisphereLight(0xfff3e0, 0x30203a, 1.15);
  const key = new DirectionalLight(0xffffff, 1.6);
  key.position.set(1.5, 3, -3);
  scene.add(hemi, key, key.target);

  const figMat = new MeshLambertMaterial({ vertexColors: true });
  const camera = new PerspectiveCamera(30, 1, 0.1, 30);
  let fig = null;
  let yaw = 0;
  let disposed = false;
  let rt = null;
  const cache = new Map(); // Schlüssel → Canvas (LRU, höchstens PORTRAIT_CACHE_MAX)

  const api = {
    scene,
    camera,
    /** Figur anlegen bzw. (falls schon vorhanden) den Look tauschen. */
    figure(look) {
      if (disposed) return null;
      if (fig) { fig.setLook(look); return fig; }
      fig = createFigure(look, { material: figMat });
      fig.root.rotation.y = yaw;
      scene.add(fig.root);
      return fig;
    },
    setLook(look) { return api.figure(look); },
    rotate(d) { return api.setYaw(yaw + (Number.isFinite(d) ? d : 0)); },
    setYaw(y) { yaw = Number.isFinite(y) ? y : 0; if (fig) fig.root.rotation.y = yaw; return yaw; },
    getYaw: () => yaw,
    update(dt) { if (fig) fig.update(dt); },
    /** Kamera-Ziel (Position + Blickpunkt) je Fokus; richtet sich nach der Oberkante der Figur. */
    cameraPose(focus) {
      const top = fig ? fig.topY : 1.75;
      const k = fig && fig.look && fig.look.height ? fig.look.height : 1;
      const head = 1.58 * k;
      switch (focus) {
        case 'hair': return { pos: [0.25, top - 0.06, -1.05], look: [0, top - 0.12, 0] };
        case 'face': return { pos: [0.1, head, -0.85], look: [0, head - 0.01, 0] };
        case 'top': return { pos: [0, 1.15 * k, -1.8], look: [0, 1.1 * k, 0] };
        case 'bottom': return { pos: [0, 0.5 * k, -1.9], look: [0, 0.45 * k, 0] };
        case 'shoes': return { pos: [0, 0.3 * k, -1.25], look: [0, 0.08 * k, 0] };
        case 'extras': return { pos: [0, 1.0 * k, -2.6], look: [0, 0.95 * k, 0] };
        default: return { pos: [0, top * 0.55, -3.6], look: [0, top * 0.5, 0] };
      }
    },
    /**
     * Ausweisporträt 256×256 (Kopf und Schultern, frontal) per RenderTarget im vorhandenen Renderer.
     * Cache nach Look-Schlüssel (Outfit + Haut; ohne Größe/Statur), höchstens 16; der Canvas gehört dem Cache (nicht verändern).
     */
    portrait(renderer, look) {
      if (disposed || !renderer || !look) return null;
      const key = lookKey(look);
      const hit = cache.get(key);
      if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
      const S = PORTRAIT_SIZE;
      if (!rt) {
        rt = new WebGLRenderTarget(S, S, { type: UnsignedByteType, format: RGBAFormat, depthBuffer: true, samples: 0 });
        rt.texture.colorSpace = SRGBColorSpace;
      }
      const tmp = createFigure(look, { material: figMat });
      if (fig) fig.root.visible = false;
      scene.add(tmp.root);
      const top = tmp.topY;
      const pcam = new PerspectiveCamera(26, 1, 0.1, 30);
      pcam.position.set(0, top - 0.17, -1.7);
      pcam.lookAt(0, top - 0.2, 0);
      pcam.updateMatrixWorld(true);
      const buf = new Uint8Array(S * S * 4);
      const prev = renderer.getRenderTarget();
      try {
        scene.updateMatrixWorld(true);
        renderer.setRenderTarget(rt);
        renderer.render(scene, pcam);
        renderer.readRenderTargetPixels(rt, 0, 0, S, S, buf);
      } finally {
        renderer.setRenderTarget(prev);
        scene.remove(tmp.root);
        tmp.dispose();
        if (fig) fig.root.visible = true;
      }
      const canvas = makeCanvas(S, S);
      const ctx = canvas.getContext('2d');
      if (ctx && typeof ctx.createImageData === 'function') {
        const img = ctx.createImageData(S, S);
        for (let y = 0; y < S; y++) img.data.set(buf.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4); // Y spiegeln
        ctx.putImageData(img, 0, 0);
      }
      cache.set(key, canvas);
      while (cache.size > PORTRAIT_CACHE_MAX) cache.delete(cache.keys().next().value);
      return canvas;
    },
    /** Größe des Porträt-Caches (Tests). */
    portraitCacheSize: () => cache.size,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (fig) { scene.remove(fig.root); fig.dispose(); fig = null; }
      stage.geometry.dispose();
      stageMat.dispose();
      signGeo.dispose();
      if (tex) tex.dispose();
      signMat.dispose();
      figMat.dispose();
      if (rt) { rt.dispose(); rt = null; }
      cache.clear();
      scene.clear();
    },
  };
  return api;
}
