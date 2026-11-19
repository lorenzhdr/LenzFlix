// VIDEOTHEK LENZ · Foto-Studio (1.17.0): kleine eigene Szene für Editor-Vorschau und Ausweisporträt – Fotowand im 90er-Stil
// (Vorhang, Maßstriche für die Körpergröße, Schild), zwei Lichter, kein Nebel, 3 Draw-Calls (Bühne, Schild, Figur).
// Läuft im Kontext des vorhandenen Renderers (kein zweiter WebGL-Kontext); Kamera des Editors = player.camera.flyTo(cameraPose(fokus)).
// createStudio() → { scene, camera, figure(look), setLook(look), rotate(dRad), setYaw(y), getYaw(), update(dt), cameraPose(focus, opts?),
//   portrait(renderer, look) → HTMLCanvasElement 256×256, dispose() }. Die Figur steht bei (0,0,0) und blickt nach −z, die Kamera steht bei −z
//   (Blick nach +z, waagerecht, immer von vorn).
// cameraPose(focus, { aspect, fov, free }) → { pos:[x,y,z], look:[x,y,z] } – fertige Pose (kein Nachskalieren/Verschieben nötig):
//   · focus: 'body' (Ganzkörper, Standard, ~10 % Rand oben inkl. Hut und unten mit Schuhen + Boden), 'hair'/'face'/'extras' (Kopf + Schultern
//     komplett inkl. Hut/Brille), 'top' (Oberkörper + ganzer Kopf), 'bottom' (Hose + Schuhe), 'shoes' (Knie bis Boden).
//   Die Pose hängt vom Look ab (Hut/Frisur/Größe → topY): nach jedem Look-Wechsel neu aufrufen (topY() zeigt die Änderung).
//   · aspect = Breite/Höhe des Bildes, fov = VERTIKALER Öffnungswinkel der Kamera in Grad (Standard: 1 und 30 = klassische Studio-Pose).
//   · free = freie Fläche des Bildes (normiert 0..1, y von oben): { x0, x1, y0, y1 }, Standard ganzes Bild. Die Figur wird in diese Fläche
//     eingepasst und mittig darin platziert (Querformat z. B. { x0: 0.4, x1: 1, y0: 0, y1: 1 } rechts neben dem Formular; Hochformat
//     { x0: 0, x1: 1, y0: 0, y1: 0.42 } im oberen Bereich). Ohne opts liefert sie die alte Pose (30°, zentriert).
//   Ohne Figur gilt eine Standardgröße (1,75 m). Die Pose ist unabhängig vom Bildseitenverhältnis (Breite wird mitgeprüft).
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
const RULER_X = -1.75; // Maßstab weit seitlich: nur im Ganzkörperbild (Querformat/Hochformat) überhaupt im Bild

/**
 * Kamera-Pose, die den Bereich y0..y1 (Meter, Breite w) der Figur (bei x=0, z=0) in die freie Bildfläche einpasst.
 * margin = Rand-Anteil oben/unten der freien Fläche. Die Kamera steht immer auf der Mittelachse der Figur (x = 0, auf Höhe der Bereichsmitte,
 * bei −z, also von vorn); die Figur wird per Schwenk (Blickpunkt seitlich/höher bzw. tiefer) in die freie Fläche gelegt, nicht durch Verschieben
 * der Kamera – so bleibt die Ansicht frontal und die Kamera nie unter dem Boden.
 */
function framePose(y0, y1, w, { aspect = 1, fov = 30, free = null, margin = 0.1, minDist = 0.3 } = {}) {
  const fr = { x0: 0, x1: 1, y0: 0, y1: 1, ...(free || {}) };
  const fw = Math.max(0.05, fr.x1 - fr.x0);
  const fh = Math.max(0.05, fr.y1 - fr.y0);
  const asp = aspect > 0 ? aspect : 1;
  const tanH = Math.tan(((fov > 1 && fov < 170 ? fov : 30) * Math.PI) / 360);
  const yc = (y0 + y1) / 2;
  // Zielwerte in Bildkoordinaten (NDC, x rechts, y oben): Mitte der freien Fläche und erlaubter Bereich mit Rand
  const nx = (fr.x0 + fr.x1) - 1;
  const ny = 1 - (fr.y0 + fr.y1);
  const halfH = fh * (1 - 2 * margin); // halbe erlaubte Höhe in NDC
  const halfW = fw * (1 - 0.12);
  let Z = Math.max(minDist, (y1 - y0) / (1 - 2 * margin) / (2 * tanH * fh), w / (1 - 0.12) / (2 * tanH * asp * fw)); // Tiefe entlang der Blickachse (erste Näherung)
  let pose = null;
  for (let it = 0; it < 8; it++) {
    // Bereichsmitte im Kameraraum: X nach rechts, Y nach oben, Z nach vorn; daraus Abstand D sowie Schwenk (yaw) und Neigung (pitch)
    const X = nx * Z * tanH * asp;
    const Y = ny * Z * tanH;
    const D = Math.hypot(X, Y, Z);
    const yaw = Math.atan2(X, Z);
    const pitch = Math.asin(Y / D);
    // Blickachse: nach +z, um yaw zu +x gedreht (Weltachse +x liegt links im Bild → Figur rechts) und um pitch nach unten geneigt
    const fx = Math.cos(pitch) * Math.sin(yaw);
    const fy = -Math.sin(pitch);
    const fz = Math.cos(pitch) * Math.cos(yaw);
    pose = { pos: [0, yc, -D], look: [fx * D, yc + fy * D, -D + fz * D] };
    // rechts = f × (0,1,0), oben = rechts × f
    let rx = -fz;
    let rz = fx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    const ux = -fy * rz;
    const uy = rz * fx - rx * fz;
    const uz = fy * rx;
    const proj = (px, py, pz) => {
      const vx = px;
      const vy = py - yc;
      const vz = pz + D;
      const zz = vx * fx + vy * fy + vz * fz;
      return [(vx * rx + vz * rz) / (zz * tanH * asp), (vx * ux + vy * uy + vz * uz) / (zz * tanH)];
    };
    const top = proj(0, y1, 0)[1] - ny;
    const bot = ny - proj(0, y0, 0)[1];
    const sideL = Math.abs(proj(-w / 2, yc, 0)[0] - nx);
    const sideR = Math.abs(proj(w / 2, yc, 0)[0] - nx);
    const k = Math.max(top / halfH, bot / halfH, Math.max(sideL, sideR) / halfW);
    if (Math.abs(k - 1) < 0.004 && it > 0) break;
    Z = Math.max(minDist, Z * k);
  }
  return pose;
}

/** Fotowand als EIN gemergtes Mesh (Vertexfarben): Vorhangfalten, Boden-Schachbrett, Maßstab mit Strichen alle 10 cm. */
function stageGeometry() {
  const parts = [];
  const n = 40;
  const sw = 13 / n;
  for (let i = 0; i < n; i++) {
    parts.push(box({ w: sw - 0.01, h: 4, d: 0.1, x: -6.5 + sw * (i + 0.5), y: 2, z: WALL_Z + (i % 2 ? 0.04 : 0), color: i % 2 ? CURTAIN_B : CURTAIN_A }));
  }
  for (let ix = 0; ix < 20; ix++) {
    for (let iz = 0; iz < 16; iz++) {
      const dark = (ix + iz) % 2 === 0;
      parts.push(box({ w: 0.64, h: 0.04, d: 0.64, x: -6.4 + ix * 0.64 + 0.32, y: -0.02, z: -9.1 + iz * 0.64 + 0.32, color: dark ? [0.16, 0.16, 0.2] : [0.78, 0.76, 0.7] }));
    }
  }
  // Maßstab links an der Wand: Brett + Striche (0,5 … 2,0 m), Hauptstriche bei 1,0/1,5/2,0 m
  parts.push(box({ w: 0.26, h: 1.6, d: 0.02, x: RULER_X, y: 1.25, z: WALL_Z - 0.07, color: [0.93, 0.9, 0.82] }));
  for (let i = 0; i <= 15; i++) {
    const y = 0.5 + i * 0.1;
    const major = Math.abs(y * 2 - Math.round(y * 2)) < 1e-6;
    parts.push(box({ w: major ? 0.2 : 0.12, h: major ? 0.016 : 0.01, d: 0.01, x: RULER_X - (major ? 0 : 0.04), y, z: WALL_Z - 0.085, color: major ? [0.75, 0.1, 0.15] : [0.15, 0.15, 0.2] }));
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
  x.fillText('VIDEOTHEK LENZ', 256, 68, 460);
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
  const signGeo = new PlaneGeometry(1.2, 0.3);
  const sign = new Mesh(signGeo, signMat);
  sign.rotation.y = Math.PI; // Fläche zeigt nach −z (zur Kamera)
  sign.position.set(1.45, 2.05, WALL_Z - 0.08); // seitlich und hoch: nie hinter dem Kopf der Figur
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
    /** Oberkante der gezeigten Figur (m, inkl. Hut/Frisur/Größe): ändert sie sich beim Look-Wechsel, muss die Kamera neu gesetzt werden (cameraPose). */
    topY: () => (fig ? fig.topY : 1.75),
    update(dt) { if (fig) fig.update(dt); },
    /** Kamera-Pose (Position + Blickpunkt) je Fokus, von vorn; Kopfbereiche nach topY (Hut/Frisur), Breite nach build. Siehe Kopf. */
    cameraPose(focus, opts) {
      const top = fig ? fig.topY : 1.75;
      const k = fig && fig.look && fig.look.height ? fig.look.height : 1;
      const bw = fig && fig.look && fig.look.build ? fig.look.build : 1;
      const o = opts && typeof opts === 'object' ? opts : {};
      switch (focus) {
        case 'hair': return framePose(1.3 * k, top + 0.04, 0.5 * bw, { ...o, margin: 0.08 });
        case 'face': return framePose(1.36 * k, top + 0.04, 0.46 * bw, { ...o, margin: 0.08 });
        case 'extras': return framePose(1.22 * k, top + 0.04, 0.6 * bw, { ...o, margin: 0.08 });
        case 'top': return framePose(0.8 * k, top + 0.05, 0.7 * bw, { ...o, margin: 0.06 }); // Oberkörper + ganzer Kopf (inkl. Hut)
        case 'bottom': return framePose(-0.03, 0.92 * k, 0.46 * bw, { ...o, margin: 0.08 });
        case 'shoes': return framePose(-0.03, 0.5 * k, 0.44 * bw, { ...o, margin: 0.1 });
        default: return framePose(-0.06, top, 0.78 * bw, { ...o, margin: 0.1 });
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
      const kk = look.height || 1;
      const pp = framePose(1.3 * kk, top + 0.03, 0.46 * (look.build || 1), { aspect: 1, fov: 26, margin: 0.08 }); // Kopf + Schultern, frontal
      pcam.position.set(...pp.pos);
      pcam.lookAt(...pp.look);
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
