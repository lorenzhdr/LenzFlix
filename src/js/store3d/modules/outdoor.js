// VIDEOTHEK LENZ · M4 Außenbereich (gemeinsam von city.js, daytime.js und intro.js genutzt, einmal je Szene):
// Himmelskuppel + Sterne + Mond, Palette (Tageszeit/Regen), Fenster-Sets, Tönung, Nebelfarbe. Die Stadt selbst (Straße, Häuser,
// Laternen, Palast, Hof) baut world/build-city.js, die Fassade world/build-facade.js (beide hängen an `out.group`).
// Alles Basic-Material (unbeleuchtet), per Palette getönt (`out.tint`); Himmel, Boden, Sterne und Mond sind nebelfrei.
// `out.hooks`: Funktionen (tod, rain, pal), die bei jedem setPalette laufen (Stadt: Laternen/Neon an, Ampel-Tönung).
import {
  Group, Mesh, Points, MeshBasicMaterial, PointsMaterial, SphereGeometry, CircleGeometry, BufferGeometry, Float32BufferAttribute,
  AdditiveBlending, BackSide, DoubleSide, PlaneGeometry,
} from 'three';
import { quad, merge, rng } from '../util/geo.js';
import { makeCanvas, toTexture } from '../world/textures.js';
import { shared, skyPalette, timeOfDay, lerp } from './m4-util.js';
import { createSnow } from '../weather/snow-patch.js';

const PI = Math.PI;
export const FAR_R = 60;

export function glowCanvas() {
  const c = makeCanvas(64, 64);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return c;
}

function moonCanvas() {
  const c = makeCanvas(128, 128);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 18, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,248,220,0.55)'); g.addColorStop(1, 'rgba(255,248,220,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#fff6d8'; x.beginPath(); x.arc(64, 64, 17, 0, PI * 2); x.fill();
  x.fillStyle = 'rgba(190,175,140,0.5)';
  x.beginPath(); x.arc(58, 60, 4, 0, PI * 2); x.arc(70, 69, 3, 0, PI * 2); x.fill();
  return c;
}

/** Fenstergitter-Spezifikationen: nach innen (−z) oder außen (+z) gerichtet. */
export function windowGrid(out, x0, x1, y0, floors, z, facing, rand, { w = 0.9, h = 1.3, gap = 1.75, floorH = 2.7 } = {}) {
  const n = Math.max(1, Math.floor((x1 - x0 - 0.6) / gap));
  const pad = (x1 - x0 - n * gap) / 2 + gap / 2;
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < n; i++) {
      out.push({ x: x0 + pad + i * gap, y: y0 + f * floorH + floorH / 2, z, w, h, ry: facing < 0 ? PI : 0, lit: rand() });
    }
  }
}

function buildWindowSet(specs) {
  if (!specs.length) return null;
  const geo = merge(specs.map((s) => quad({ w: s.w, h: s.h, x: s.x, y: s.y, z: s.z, ry: s.ry })));
  const mat = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });
  const mesh = new Mesh(geo, mat);
  mesh.matrixAutoUpdate = false;
  const attr = geo.attributes.color;
  const WARM = [1, 0.8, 0.46];
  const COOL = [0.6, 0.8, 1];
  return {
    mesh,
    recolor(tod, rain) {
      const litP = tod === 'night' ? 0.55 : tod === 'dusk' ? 0.4 : 0.06;
      specs.forEach((s, i) => {
        let c;
        if (s.lit < litP) c = s.lit < litP * 0.7 ? WARM : COOL;
        else if (tod === 'night') c = [0.05, 0.07, 0.15];
        else if (tod === 'dusk') c = [0.28, 0.3, 0.45];
        else c = rain ? [0.42, 0.5, 0.6] : [0.45, 0.62, 0.8];
        for (let k = 0; k < 4; k++) attr.setXYZ(i * 4 + k, c[0], c[1], c[2]);
      });
      attr.needsUpdate = true;
    },
  };
}

function buildOutdoor(ctx) {
  const L = ctx.layout;
  const W = L.w;
  const D = L.d;
  const rand = rng(Math.round(W * 100 + D * 10) + 5);
  const group = new Group();
  group.name = 'm4-outdoor';
  ctx.scene.add(group);
  ctx.track(group);

  // Alte Nachtkulisse und Straßenfläche (benannt in world/build-room.js) ausblenden: ersetzt durch diese Szene.
  for (const n of ['lfx-backdrop', 'lfx-street']) { const o = ctx.scene.getObjectByName(n); if (o) o.visible = false; }

  const textures = [];
  const T = (c, o) => { const t = toTexture(c, { aniso: 2, ...o }); textures.push(t); return t; };
  const tinted = []; // { mat, base:[r,g,b] }
  const snow = createSnow(L); // liegender Schnee (1.19.0): alle getönten Außenmaterialien bekommen den Patch (Figuren/Innenräume nie)
  // opts.snow === false: kein liegender Schnee (kamera-gebundene/bewegte Materialien, z. B. das gehaltene Ding: der Patch rechnet mit der Weltposition)
  const tint = (mat, base = [1, 1, 1], opts = null) => { tinted.push({ mat, base }); if (!(opts && opts.snow === false)) snow.patch(mat); return mat; };
  const windowSets = [];
  const hooks = [];
  const out = { group, tod: 'day', rain: false, wx: null, pal: null, windowSets, tinted, hooks, L, textures, tint, T, fog: null, fogBase: [0.85, 0.9, 1], facade: null, city: null, snow };

  // --- Himmel (folgt der Kamera) ---
  const skyRoot = new Group();
  group.add(skyRoot);
  const skyGeo = new SphereGeometry(FAR_R, 20, 10, 0, PI * 2, 0, PI / 2);
  skyGeo.setAttribute('color', new Float32BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
  const sky = new Mesh(skyGeo, new MeshBasicMaterial({ vertexColors: true, side: BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = 10;
  sky.frustumCulled = false;
  const groundGeo = new CircleGeometry(FAR_R, 24);
  groundGeo.rotateX(-PI / 2);
  groundGeo.setAttribute('color', new Float32BufferAttribute(new Float32Array(groundGeo.attributes.position.count * 3), 3));
  const ground = new Mesh(groundGeo, new MeshBasicMaterial({ vertexColors: true, depthWrite: false, fog: false }));
  ground.renderOrder = -10; // zuerst zeichnen, ohne Tiefe: alles andere (Boden, Gehweg) liegt davor
  ground.position.y = -0.05;
  ground.frustumCulled = false;
  const starPos = [];
  for (let i = 0; i < 420; i++) {
    const a = rand() * PI * 2;
    const e = 0.08 + rand() * 0.9;
    const r = FAR_R * 0.96;
    starPos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
  }
  const starGeo = new BufferGeometry();
  starGeo.setAttribute('position', new Float32BufferAttribute(starPos, 3));
  const stars = new Points(starGeo, new PointsMaterial({ color: 0xffffff, size: 2.8, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
  stars.frustumCulled = false;
  stars.renderOrder = 11;
  const moon = new Mesh(new PlaneGeometry(13, 13), new MeshBasicMaterial({ map: T(moonCanvas()), transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false }));
  moon.position.set(-9, 17, FAR_R * 0.8);
  moon.rotation.y = PI; // Fläche zeigt zum Laden (−z)
  moon.renderOrder = 11;
  moon.frustumCulled = false;
  skyRoot.add(sky, ground, stars, moon);

  // --- Palette ---
  // ex (1.19.0, optional): { overcast, fog 0..1, snow (fällt), cover 0..1 (liegt), wet } aus dem Wetterzustand
  out.setPalette = (tod, rain, ex) => {
    out.tod = tod; out.rain = !!rain; out.wx = ex || null;
    const pal = skyPalette(tod, rain, ex ? { overcast: ex.overcast, fog: ex.fog, snow: ex.snowing } : undefined);
    out.pal = pal;
    const cover = ex && ex.cover > 0 ? ex.cover : 0;
    // Schneefarbe: Palette-Schatten, nachts/abends aufgehellt (bläulich, nie ganz weiß)
    const boost = tod === 'night' ? 2.3 : tod === 'dusk' ? 1.4 : 1;
    const snowRgb = [Math.min(0.97, pal.shade[0] * boost * 0.97), Math.min(0.98, pal.shade[1] * boost * 0.98), Math.min(1, pal.shade[2] * boost)];
    snow.set(cover, snowRgb);
    const pos = skyGeo.attributes.position;
    const col = skyGeo.attributes.color;
    const [zen, mid, hor] = pal.sky;
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, Math.max(0, pos.getY(i) / FAR_R));
      const a = t < 0.35 ? hor : mid;
      const b = t < 0.35 ? mid : zen;
      const k = t < 0.35 ? t / 0.35 : (t - 0.35) / 0.65;
      col.setXYZ(i, lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));
    }
    col.needsUpdate = true;
    const gp = groundGeo.attributes.position;
    const gc = groundGeo.attributes.color;
    const street = [pal.shade[0] * 0.24, pal.shade[1] * 0.25, pal.shade[2] * 0.28];
    for (let i = 0; i < gp.count; i++) {
      const k = Math.min(1, Math.hypot(gp.getX(i), gp.getZ(i)) / FAR_R);
      const sk = cover * (1 - k * 0.6) * 0.85; // Fernboden bei Schnee aufhellen (CPU-Farbe, kein Shader)
      gc.setXYZ(i, lerp(lerp(street[0], snowRgb[0] * 0.9, sk), hor[0], k * k), lerp(lerp(street[1], snowRgb[1] * 0.9, sk), hor[1], k * k), lerp(lerp(street[2], snowRgb[2] * 0.9, sk), hor[2], k * k));
    }
    gc.needsUpdate = true;
    for (const t of tinted) t.mat.color.setRGB(t.base[0] * pal.shade[0], t.base[1] * pal.shade[1], t.base[2] * pal.shade[2]);
    stars.visible = pal.stars > 0.01;
    stars.material.opacity = pal.stars;
    moon.visible = tod === 'night' && !rain && !(ex && (ex.wet || ex.overcast));
    for (const w of windowSets) w.recolor(tod, rain || !!(ex && (ex.overcast || ex.snowing)));
    out.fogBase = [hor[0], hor[1], hor[2]];
    if (out.fog) out.fog.color.setRGB(hor[0], hor[1], hor[2]); // Nebel in Horizontfarbe
    for (const h of hooks) h(tod, !!rain, pal);
  };
  out.follow = (cam) => { skyRoot.position.set(cam.position.x, 0, cam.position.z); };
  out.skyRoot = skyRoot;
  /** Blitzaufhellen (0..1): Himmel/Ferne heller, Nebel zieht mit. Nur Farbwerte (kein Neukompilieren). */
  out.setFlash = (k) => {
    const f = k > 0 ? Math.min(1, k) : 0;
    sky.material.color.setScalar(1 + f * 2.4);
    ground.material.color.setScalar(1 + f * 1.2);
    if (out.fog) {
      const b = out.fogBase;
      out.fog.color.setRGB(b[0] + (1 - b[0]) * f * 0.7, b[1] + (1 - b[1]) * f * 0.7, b[2] + (1 - b[2]) * f * 0.7);
    }
  };
  out.addWindows = (specs) => {
    const ws = buildWindowSet(specs);
    if (!ws) return null;
    ws.recolor(out.tod, out.rain);
    windowSets.push(ws);
    return ws;
  };
  out.setPalette(timeOfDay(), false);
  return out;
}

/** Gemeinsamen Außenbereich holen (legt ihn beim ersten Aufruf an). */
export function getOutdoor(ctx) {
  return shared(ctx.scene, 'outdoor', () => buildOutdoor(ctx));
}
