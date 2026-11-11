// VIDEOTHEK LENZ · M4 Tageszeit & Wetter: Blick durch Schaufenster/Tür nach draußen (Himmel nach Uhrzeit, Häuserzeile,
// Laternen), Regen (~35 % der Besuche, nachts öfter) mit Streifen draußen und Tropfen auf der Scheibe, innen nachts
// leicht dunkler/kälter. Provider 'weather' { tod, raining, hour }. Debug (nur opts.debug): opts.hour, opts.rain.
import {
  LineSegments, LineBasicMaterial, BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, DoubleSide, Color,
} from 'three';
import { quad, merge, rng } from '../util/geo.js';
import { makeCanvas, toTexture } from '../world/textures.js';
import { getOutdoor } from './outdoor.js';
import { timeOfDay, rainDecision, skyPalette, prefersReducedMotion, clamp } from './m4-util.js';

const COOL = new Color(0.72, 0.82, 1.08);

function dropsCanvas() {
  const S = 256;
  const c = makeCanvas(S, S);
  const x = c.getContext('2d');
  const wrap = (fn) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { x.save(); x.translate(dx, dy); fn(); x.restore(); } };
  // Schlieren
  wrap(() => {
    const rs = rng(5);
    for (let i = 0; i < 14; i++) {
      const px = rs() * S;
      const py = rs() * S;
      const len = 30 + rs() * 90;
      const g = x.createLinearGradient(0, py, 0, py + len);
      g.addColorStop(0, 'rgba(210,225,255,0)');
      g.addColorStop(0.7, 'rgba(210,225,255,0.22)');
      g.addColorStop(1, 'rgba(235,245,255,0.5)');
      x.fillStyle = g;
      x.fillRect(px, py, 1.6 + rs() * 1.6, len);
    }
  });
  // Tropfen
  wrap(() => {
    const rd = rng(9);
    for (let i = 0; i < 46; i++) {
      const px = rd() * S;
      const py = rd() * S;
      const rad = 1.6 + rd() * 4.2;
      x.fillStyle = 'rgba(190,210,245,0.35)';
      x.beginPath(); x.ellipse(px, py, rad, rad * 1.3, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.75)';
      x.beginPath(); x.arc(px - rad * 0.3, py - rad * 0.4, Math.max(0.8, rad * 0.28), 0, Math.PI * 2); x.fill();
    }
  });
  return c;
}

export default {
  name: 'daytime',
  init(ctx) {
    const L = ctx.layout;
    const W = L.w;
    const D = L.d;
    const dbg = !!(ctx.opts && ctx.opts.debug);
    const hourOpt = dbg && Number.isFinite(ctx.opts.hour) ? ctx.opts.hour : undefined;
    const rainForce = dbg && typeof ctx.opts.rain === 'boolean' ? ctx.opts.rain : undefined;
    const reduced = prefersReducedMotion();
    const out = getOutdoor(ctx);
    if (dbg) window.__lfxM4 = { ...window.__lfxM4, scene: ctx.scene, outdoor: out, ctx };
    let tod = timeOfDay(hourOpt);
    const seed = (Math.random() * 4294967296) >>> 0;
    const raining = rainDecision(seed, tod, rainForce);
    const weather = { tod, raining, hour: hourOpt };
    ctx.provide('weather', weather);
    out.setPalette(tod, raining);

    // --- Innenstimmung: vorhandene Lichter sanft nachtönen (Basis merken, bei dispose zurücksetzen) ---
    const lights = [];
    ctx.scene.traverse((o) => { if (o.isLight && !o.isDirectionalLight) lights.push({ o, i: o.intensity, c: o.color.clone(), g: o.groundColor ? o.groundColor.clone() : null }); });
    const dirs = [];
    ctx.scene.traverse((o) => { if (o.isDirectionalLight) dirs.push({ o, i: o.intensity, c: o.color.clone() }); });
    const baseExposure = ctx.renderer.toneMappingExposure;
    const tmp = new Color();
    function applyMood(pal) {
      const cool = pal.cool * 0.5;
      for (const l of lights) {
        l.o.intensity = l.i * pal.hemi;
        l.o.color.copy(l.c).lerp(tmp.copy(COOL).multiply(l.c), cool);
        if (l.g) l.o.groundColor.copy(l.g).lerp(tmp.copy(COOL).multiply(l.g), cool);
      }
      for (const d of dirs) { d.o.intensity = d.i * pal.hemi * 0.95; d.o.color.copy(d.c).lerp(tmp.copy(COOL).multiply(d.c), cool); }
      ctx.renderer.toneMappingExposure = baseExposure * pal.exposure;
    }
    function apply() {
      const pal = skyPalette(tod, weather.raining);
      out.setPalette(tod, weather.raining);
      applyMood(pal);
    }
    apply();

    // --- Regen draußen (Linien) ---
    const N = ctx.isPhone ? 150 : 280;
    const X0 = -8;
    const XW = W + 16;
    const Z0 = D + 0.6;
    const ZD = 9;
    const pos = new Float32Array(N * 6);
    const vel = new Float32Array(N);
    const rr = rng(33);
    const LEN = 0.55;
    const SLANT = 0.06;
    for (let i = 0; i < N; i++) {
      const x = X0 + rr() * XW;
      const y = rr() * 9;
      const z = Z0 + rr() * ZD;
      pos.set([x, y, z, x + SLANT, y + LEN, z], i * 6);
      vel[i] = 9 + rr() * 4;
    }
    const rainGeo = new BufferGeometry();
    rainGeo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const rainMat = new LineBasicMaterial({ color: 0xbfd2ff, transparent: true, opacity: 0.38, depthWrite: false });
    const rain = new LineSegments(rainGeo, rainMat);
    rain.frustumCulled = false;
    rain.renderOrder = 8;
    rain.visible = false;
    out.group.add(rain);

    // --- Tropfen auf der Scheibe ---
    const dropTex = toTexture(dropsCanvas(), { repeat: true, aniso: 2 });
    const f = L.facade || {};
    const glassQuads = [];
    for (const wd of f.windows || []) glassQuads.push(quad({ w: wd.x1 - wd.x0, h: wd.y1 - wd.y0, x: (wd.x0 + wd.x1) / 2, y: (wd.y0 + wd.y1) / 2, z: D + 0.078, tile: 1 }));
    if (f.door) glassQuads.push(quad({ w: f.door.w - 0.12, h: 2.0, x: (f.door.x0 + f.door.x1) / 2, y: 1.35, z: D + 0.078, tile: 1 }));
    let drops = null;
    if (glassQuads.length) {
      const dMat = new MeshBasicMaterial({ map: dropTex, transparent: true, depthWrite: false, side: DoubleSide, opacity: 0.8 });
      drops = new Mesh(merge(glassQuads), dMat);
      drops.renderOrder = 6;
      drops.matrixAutoUpdate = false;
      drops.visible = false;
      ctx.scene.add(drops);
      ctx.track(drops);
    }
    ctx.track(dropTex);
    ctx.track(rainGeo);
    ctx.track(rainMat);
    ctx.track(rain);

    let level = ctx.quality();
    let near = false;
    let suspended = false;
    function syncVisible() {
      const r = weather.raining;
      rain.visible = r && level !== 'low' && near && !suspended;
      if (drops) drops.visible = r;
    }
    syncVisible();

    const p = ctx.player;
    const cam = ctx.camera;
    let checkT = 0;
    const speed = reduced ? 0.012 : 0.03;

    return {
      update(dt, t) {
        out.follow(cam);
        if (t - checkT > 0.4) {
          checkT = t;
          const pose = p.getPose();
          const was = near;
          near = pose.z > D - 16 || cam.position.z > D;
          if (was !== near) syncVisible();
        }
        if (drops && weather.raining && near) dropTex.offset.y += dt * speed;
        if (rain.visible) {
          const dd = clamp(dt, 0, 0.05);
          for (let i = 0; i < N; i++) {
            const k = i * 6;
            let y = pos[k + 1] - vel[i] * dd;
            if (y < 0) y += 9;
            pos[k + 1] = y;
            pos[k + 4] = y + LEN;
          }
          rainGeo.attributes.position.needsUpdate = true;
        }
      },
      onQuality(lv) { level = lv; syncVisible(); },
      onSuspend() { suspended = true; syncVisible(); },
      onResume() {
        suspended = false;
        const now = timeOfDay(hourOpt);
        if (now !== tod) { tod = now; weather.tod = now; apply(); }
        syncVisible();
      },
      dispose() {
        for (const l of lights) { l.o.intensity = l.i; l.o.color.copy(l.c); if (l.g) l.o.groundColor.copy(l.g); }
        for (const d of dirs) { d.o.intensity = d.i; d.o.color.copy(d.c); }
        ctx.renderer.toneMappingExposure = baseExposure;
      },
    };
  },
};
