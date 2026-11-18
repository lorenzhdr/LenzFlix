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
import { resolveWeather } from '../weather/state.js';
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
    // --- Quellen (1.19.0): Debug (Harness ?wx/?rain) > echtes Wetter (deps.weather) > Mehrspieler-Seed > lokaler Zufall ---
    const dev = (ctx.opts && ctx.opts.dev) || null;
    const num = (v) => (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
    const debugWx = (() => {
      if (dev && (dev.wx || num(dev.temp) !== undefined || num(dev.cover) !== undefined || num(dev.sd) !== undefined)) {
        return { kind: dev.wx || undefined, i: num(dev.wxi), cover: num(dev.cover), sd: num(dev.sd), fog: num(dev.fog), temp: num(dev.temp) };
      }
      if (rainForce !== undefined) return { kind: rainForce ? 'rain' : 'clear', legacy: true };
      return null;
    })();
    const getReal = ctx.deps && typeof ctx.deps.weather === 'function' && !debugWx ? ctx.deps.weather : null;
    let real = null;
    let mp = null;
    let pending = !!getReal; // bis zur Antwort (höchstens 1,5 s) kein Zufallsregen, damit nichts aufblitzt
    // Letzter echter Wert bleibt bei Folgeabfragen ohne Ergebnis (null/Fehler) höchstens 2 h gültig (REAL_KEEP_MS), danach Rückfall auf mp/lokal.
    const REAL_KEEP_MS = 2 * 3600 * 1000;
    let realAt = 0;
    const realFresh = () => (real && Date.now() - realAt <= REAL_KEEP_MS ? real : null);
    // Solange auf echtes Wetter gewartet wird (pending), gilt auch die Mehrspieler-Meldung nicht (sonst blitzt Regen auf, wenn die Antwort 'klar' lautet).
    const state0 = () => resolveWeather({ debug: debugWx, real: realFresh(), mp: pending ? null : mp, local: pending ? false : localRaining });
    const st0 = state0();
    const raining = st0.raining;
    const precipOf = (s) => (s.i > 0 ? { kind: s.snowing ? 'snow' : 'rain', i: s.i } : { kind: null, i: 0 });
    let nowT = 0; // Zeit (s) des letzten update(), gleiche Basis wie die Module
    let wetEndT = null; // Zeitpunkt (s) des letzten Regenendes; null = kein Ende bekannt/es regnet
    const weather = {
      tod, raining, hour: hourOpt,
      /** Sekunden seit dem Regenende (0 bei Regen, null = unbekannt); läuft in jeder Stufe mit (für die Restnässe in ultra-wet). */
      sinceWet() { return this.raining ? 0 : wetEndT === null ? null : Math.max(0, nowT - wetEndT); },
      kind: st0.kind, i: st0.i, snowing: st0.snowing, wet: st0.wet, cover: st0.cover, fog: st0.fog, storm: st0.storm, overcast: st0.overcast, temp: st0.temp, real: st0.real,
      /** Niederschlag für das Modul precip: { kind: 'rain'|'snow'|null, i: 0..1 }. */
      precip: precipOf(st0),
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
    /** Seit 1.19.0 setzt das nur die Mehrspieler-Ebene; bei echtem Wetter (oder Debug) wird der Wert ignoriert. */
    weather.setRaining = (on) => {
      mp = on === true || on === false ? on : null;
      recompute();
    };
    let lastKey = '';
    const keyOf = (s) => [s.kind, s.i, s.cover, s.fog, s.temp, s.real ? 1 : 0].join('|');
    lastKey = keyOf(st0);
    function recompute() {
      const s = state0();
      const k = keyOf(s);
      if (k === lastKey) return;
      lastKey = k;
      if (s.raining) wetEndT = null; else if (weather.raining) wetEndT = nowT;
      Object.assign(weather, {
        kind: s.kind, i: s.i, raining: s.raining, snowing: s.snowing, wet: s.wet, cover: s.cover, fog: s.fog, storm: s.storm, overcast: s.overcast, temp: s.temp, real: s.real,
        precip: precipOf(s),
      });
      if (ready) { apply(); syncVisible(); emit(); }
    }
    // --- echtes Wetter holen: beim Start (höchstens 1,5 s Wartezeit), danach alle 15 min aktiver Zeit und beim Fortsetzen (wenn älter) ---
    const REFRESH_S = 900;
    let fetchedAt = 0;
    let activeS = 0;
    let gone = false;
    let waitTimer = null;
    function fetchReal() {
      if (!getReal) return;
      fetchedAt = Date.now();
      activeS = 0;
      let p;
      try { p = getReal(); } catch { p = null; }
      // null/Fehler = keine neue Info: letzten echten Wert behalten (realFresh begrenzt auf 2 h)
      Promise.resolve(p).then((v) => {
        if (gone) return;
        if (v && typeof v === 'object') { real = v; realAt = Number.isFinite(v.ts) && v.ts > 1e12 && v.ts <= Date.now() ? v.ts : Date.now(); }
        pending = false;
        recompute();
      }, () => { if (!gone) { pending = false; recompute(); } });
    }
    if (getReal) {
      waitTimer = setTimeout(() => { waitTimer = null; if (pending) { pending = false; recompute(); } }, 1500);
      fetchReal();
    }
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
    let flashK = 0;
    let curPal = null;
    /** Blitz (0..1): Exposition und Himmel kurz heller (modules/weatherfx.js, nur ohne reduzierte Bewegung). */
    weather.flash = (k) => {
      flashK = k > 0 ? Math.min(1, k) : 0;
      if (curPal) ctx.renderer.toneMappingExposure = baseExposure * curPal.exposure * (1 + flashK * 0.9);
      out.setFlash(flashK);
    };
    ctx.provide('weather', weather);
    out.setPalette(tod, raining, weather);

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
      curPal = pal;
      ctx.renderer.toneMappingExposure = baseExposure * pal.exposure * (1 + flashK * 0.9);
    }
    function apply() {
      const pal = skyPalette(tod, weather.raining, { overcast: weather.overcast, fog: weather.fog, snow: weather.snowing });
      out.setPalette(tod, weather.raining, weather);
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
        nowT = t;
        out.follow(cam);
        if (getReal && !suspended) { activeS += dt; if (activeS >= REFRESH_S) fetchReal(); }
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
        if (now !== tod) { tod = now; weather.tod = now; apply(); emit(); }
        if (getReal && Date.now() - fetchedAt > REFRESH_S * 1000) fetchReal();
        syncVisible();
      },
      dispose() {
        gone = true;
        if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
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
