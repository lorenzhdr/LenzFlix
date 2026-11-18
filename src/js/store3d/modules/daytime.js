// VIDEOTHEK LENZ · M4 Tageszeit & Wetter: Blick durch Schaufenster/Tür nach draußen (Himmel nach Uhrzeit, Häuserzeile,
// Laternen), Regen (~35 % der Besuche, nachts öfter) mit Streifen draußen und Tropfen auf der Scheibe, innen nachts
// leicht dunkler/kälter. Provider 'weather' { tod, raining, precip, hour, lampsOn, sheltered(x,z,y), setRaining(on|null), onChange(fn) → off }.
// Debug (nur opts.debug): opts.hour, opts.rain. Den fallenden Niederschlag zeichnet seit 1.19.0 modules/precip.js (Provider 'precip', 1 Draw-Call,
// auch auf low); hier nur die Entscheidung (Regen ja/nein) und die Tropfen auf der Scheibe.
import {
  Mesh, MeshBasicMaterial, DoubleSide, Color,
} from 'three';
import { quad, merge, rng } from '../util/geo.js';
import { makeCanvas, toTexture } from '../world/textures.js';
import { getOutdoor } from './outdoor.js';
import { timeOfDay, rainDecision, skyPalette, prefersReducedMotion } from './m4-util.js';
import { areaAt, OUTDOOR_AREAS } from '../world/city.js';

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

/** Rinnsale für die Scheibe: nur senkrechte Schlieren mit hellem Kopf, vertikal kachelbar (läuft per Shader nach unten). */
function trailCanvas() {
  const S = 256;
  const c = makeCanvas(S, S);
  const x = c.getContext('2d');
  const rt = rng(21);
  for (let i = 0; i < 9; i++) {
    const px = rt() * S;
    const py = rt() * S;
    const len = 50 + rt() * 110;
    const w = 1.4 + rt() * 1.6;
    for (const dy of [-S, 0, S]) {
      const g = x.createLinearGradient(0, py + dy, 0, py + dy + len);
      g.addColorStop(0, 'rgba(210,225,255,0)');
      g.addColorStop(0.75, 'rgba(210,225,255,0.3)');
      g.addColorStop(1, 'rgba(240,248,255,0.65)');
      x.fillStyle = g;
      x.fillRect(px, py + dy, w, len);
    }
  }
  return c;
}

export default {
  name: 'daytime',
  init(ctx) {
    const L = ctx.layout;
    const D = L.d;
    const dbg = !!(ctx.opts && ctx.opts.debug);
    const hourOpt = dbg && Number.isFinite(ctx.opts.hour) ? ctx.opts.hour : undefined;
    const rainForce = dbg && typeof ctx.opts.rain === 'boolean' ? ctx.opts.rain : undefined;
    const reduced = prefersReducedMotion();
    const out = getOutdoor(ctx);
    if (dbg) window.__lfxM4 = { ...window.__lfxM4, scene: ctx.scene, outdoor: out, ctx };
    let tod = timeOfDay(hourOpt);
    const seed = (Math.random() * 4294967296) >>> 0;
    const localRaining = rainDecision(seed, tod, rainForce);
    const raining = localRaining;
    const weather = {
      tod, raining, hour: hourOpt,
      /** Niederschlag für das Modul precip: { kind: 'rain'|'snow'|null, i: 0..1 }. */
      precip: raining ? { kind: 'rain', i: 0.6 } : { kind: null, i: 0 },
      /** Laternen/Neon an (nicht am Tag). */
      get lampsOn() { return this.tod !== 'day'; },
      /** Geschützt vor Regen: im Laden, im Palast, unter dem Vordach. */
      sheltered(x, z, y = 0) {
        const a = areaAt(L, x, z, y);
        if (a === 'shop' || a === 'palastHall' || a === 'palastFoyer' || a === 'salon') return true;
        const c = L.city && L.city.palast && L.city.palast.canopy;
        return !!(c && x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && y < c.y);
      },
    };
    /** Mehrspieler (net/weather.js): Regen für alle gleich (true/false), null = lokale Entscheidung wie 1.15. Der Debug-Wert rain hat Vorrang. */
    weather.setRaining = (on) => {
      if (rainForce !== undefined) return;
      const want = on === true || on === false ? on : localRaining;
      if (want === weather.raining) return;
      weather.raining = want;
      weather.precip = want ? { kind: 'rain', i: 0.6 } : { kind: null, i: 0 };
      if (ready) { apply(); syncVisible(); emit(); }
    };
    const listeners = new Set();
    /** Meldet Änderungen des Wetters (raining, später weitere Felder); Rückgabe = Abmeldefunktion. */
    weather.onChange = (fn) => {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    };
    function emit() {
      for (const fn of [...listeners]) { try { fn(weather); } catch (e) { console.warn('[store3d] weather.onChange', e); } }
    }
    let ready = false;
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

    // --- Tropfen auf der Scheibe ---
    const dropTex = toTexture(dropsCanvas(), { repeat: true, aniso: 2 });
    const trailTex = toTexture(trailCanvas(), { repeat: true, aniso: 2 });
    const timeU = { value: 0 };
    const trailU = { value: trailTex };
    const f = L.facade || {};
    const glassQuads = [];
    for (const wd of f.windows || []) glassQuads.push(quad({ w: wd.x1 - wd.x0, h: wd.y1 - wd.y0, x: (wd.x0 + wd.x1) / 2, y: (wd.y0 + wd.y1) / 2, z: D + 0.078, tile: 1 }));
    if (f.door) glassQuads.push(quad({ w: f.door.w - 0.12, h: 2.0, x: (f.door.x0 + f.door.x1) / 2, y: 1.35, z: D + 0.078, tile: 1 }));
    let drops = null;
    if (glassQuads.length) {
      const dMat = new MeshBasicMaterial({ map: dropTex, transparent: true, depthWrite: false, side: DoubleSide, opacity: 0.8 });
      // Tropfen stehen still, nur die Rinnsale (zweite Textur) laufen per Shader nach unten (uTime) – weiterhin 1 Draw-Call.
      dMat.onBeforeCompile = (sh) => {
        sh.uniforms.uTrail = trailU;
        sh.uniforms.uTime = timeU;
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
uniform sampler2D uTrail;
uniform float uTime;`)
          .replace('#include <map_fragment>', `#include <map_fragment>
  vec4 trl = texture2D(uTrail, vec2(vMapUv.x * 1.3 + 0.37, vMapUv.y * 0.9 + uTime * 0.045));
  diffuseColor.rgb = mix(diffuseColor.rgb, trl.rgb, trl.a * (1.0 - diffuseColor.a));
  diffuseColor.a = diffuseColor.a + trl.a * (1.0 - diffuseColor.a);`);
      };
      dMat.customProgramCacheKey = () => 'lfx-drops-trail';
      drops = new Mesh(merge(glassQuads), dMat);
      drops.renderOrder = 6;
      drops.matrixAutoUpdate = false;
      drops.visible = false;
      ctx.scene.add(drops);
      ctx.track(drops);
    }
    ctx.track(dropTex);
    ctx.track(trailTex);

    let near = false;
    let suspended = false;
    function pushPrecip() {
      const pr = ctx.use('precip');
      if (pr && typeof pr.setWeather === 'function') pr.setWeather(weather.precip);
    }
    function syncVisible() {
      if (drops) drops.visible = weather.raining && !suspended;
      pushPrecip();
    }
    syncVisible();
    ready = true;

    const cam = ctx.camera;
    let checkT = 0;

    return {
      update(dt, t) {
        out.follow(cam);
        if (t - checkT > 0.4) {
          checkT = t;
          const was = near;
          const areas = ctx.use('areas');
          const a = areas ? areas.current() : 'shop';
          near = OUTDOOR_AREAS.includes(a) || (a !== 'palastHall' && a !== 'palastFoyer' && a !== 'salon' && cam.position.z > D + 0.3); // Kamera draußen (Intro) oder Spieler in einem Außenbereich
          if (was !== near) syncVisible();
        }
        if (drops && weather.raining && near && !reduced) timeU.value = t; // reduzierte Bewegung: Rinnsale stehen
      },
      onSuspend() { suspended = true; if (drops) drops.visible = false; },
      onResume() {
        suspended = false;
        const now = timeOfDay(hourOpt);
        if (now !== tod) { tod = now; weather.tod = now; apply(); }
        syncVisible();
      },
      dispose() {
        listeners.clear();
        const pr = ctx.use('precip');
        if (pr && typeof pr.setWeather === 'function') pr.setWeather(null);
        for (const l of lights) { l.o.intensity = l.i; l.o.color.copy(l.c); if (l.g) l.o.groundColor.copy(l.g); }
        for (const d of dirs) { d.o.intensity = d.i; d.o.color.copy(d.c); }
        ctx.renderer.toneMappingExposure = baseExposure;
      },
    };
  },
};
