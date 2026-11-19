// VIDEOTHEK LENZ · Wetter-Extras (1.19.0): Gewitter (Blitze, Donner), Thermometer an der Ladenfront, Atemwölkchen bei Frost,
// Winterkleidung der Passanten bei Kälte. Liest nur den Provider 'weather' (modules/daytime.js) und fasst sonst nichts an:
// Blitzhelligkeit über weather.flash(k), Donner über sound.thunder(), Winterkleidung über npc.setWinterAll(on) (nur wenn vorhanden).
// Logik/Planung: weather/fx-logic.js (rein, deterministisch). Draw-Calls: Thermometer 1 (nur bei echtem Wetter), Atem 1 (nur bei Frost und
// Stufe >= high), Blitz-Strahl 1 (nur während des Blitzes, ab mid).
import {
  Mesh, Points, PlaneGeometry, BufferGeometry, BufferAttribute, MeshBasicMaterial, ShaderMaterial, AdditiveBlending, DoubleSide,
  Vector3, DynamicDrawUsage,
} from 'three';
import { makeCanvas, toTexture } from '../world/textures.js';
import { getOutdoor } from './outdoor.js';
import { scheduleWarm } from '../engine/warm.js';
import { OUTDOOR_AREAS, areaAt } from '../world/city.js';
import { prefersReducedMotion } from './m4-util.js';
import { atLeast } from '../engine/quality.js';
import { winterNext } from '../weather/state.js';
import {
  lightningGap, flashAt, FLASH_LEN, thunderPlan, lightningOn, lightningVisual, boltVisible, breathOn, breathPhase, BREATH_MAX, thermoText as thermoStr, hash01,
} from '../weather/fx-logic.js';

const BOLT_SEG = 14;
const BOLT_R = 46;

/** Thermometer-Anzeige (Canvas 128x64): dunkle Tafel, Leuchtziffern im Videotheken-Look. */
function thermoCanvas(text) {
  const c = makeCanvas(128, 64);
  const x = c.getContext('2d');
  x.fillStyle = '#080b12';
  x.fillRect(0, 0, 128, 64);
  x.strokeStyle = '#ff3d7f';
  x.lineWidth = 3;
  x.strokeRect(2, 2, 124, 60);
  x.font = 'bold 34px "Courier New", monospace';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = '#ffb703';
  x.shadowBlur = 8;
  x.fillStyle = '#ffd166';
  x.fillText(text, 64, 34);
  return c;
}

const BREATH_VERT = /* glsl */ `
uniform float uPx;
attribute float aPh;
attribute vec2 aDir;
varying float vA;
void main() {
  float t = aPh / 0.38;
  if (aPh < 0.0 || t > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; gl_PointSize = 0.0; return; }
  vec3 p = position + vec3(aDir.x, 0.0, aDir.y) * (0.04 + 0.32 * t) + vec3(0.0, 0.09 * t, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = 0.09 + 0.2 * t;
  gl_PointSize = clamp(size * uPx / max(0.2, -mv.z), 1.0, 48.0);
  vA = smoothstep(0.0, 0.12, t) * (1.0 - t) * (1.0 - t) * 0.6;
}
`;
const BREATH_FRAG = /* glsl */ `
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.2, 1.0, d)) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(0.95, 0.97, 1.0, a);
}
`;

export default {
  name: 'weatherfx',
  init(ctx) {
    const out = getOutdoor(ctx);
    const L = ctx.layout;
    const reduced = prefersReducedMotion();
    const seed = (Date.now() / 1000) | 0;
    const W = () => ctx.use('weather') || null;
    let level = ctx.quality();
    let suspended = false;
    let area = 'shop';
    let areaT = 0;
    const cam = ctx.camera;

    // ---------------------------------------------------------------- Thermometer
    let thermo = null;
    let thermoTex = null;
    let thermoShown = null;
    let warmer = null; // scheduleWarm-Abbruchfunktion (retry nach Stufenwechsel/gesetzter Map)
    const f = L.facade;
    if (f && f.door) {
      const mat = new MeshBasicMaterial({ toneMapped: false });
      thermo = new Mesh(new PlaneGeometry(0.56, 0.28), mat);
      thermo.position.set(f.door.x0 - 0.36, 1.5, L.d + 0.21 + 0.012); // Seite der Tür wie das Schild „Öffnungszeiten“ (build-facade.js), Außenfläche der Verkleidung
      thermo.name = 'wx-thermo';
      thermo.visible = false;
      (out.facade && out.facade.group ? out.facade.group : out.group).add(thermo);
      ctx.track(thermo); ctx.track(thermo.geometry); ctx.track(mat);
    }
    function syncThermo(w) {
      if (!thermo) return;
      const txt = w && w.real ? thermoStr(w.temp) : null;
      if (txt === null) { thermo.visible = false; return; }
      if (txt !== thermoShown) {
        thermoShown = txt;
        const old = thermoTex;
        thermoTex = toTexture(thermoCanvas(txt), { aniso: 2 }); // neue Textur je Text (nie eine Textur nach Canvaswechsel weiterverwenden)
        thermo.material.map = thermoTex;
        thermo.material.needsUpdate = true;
        if (old) old.dispose();
        if (!old && warmer) warmer.retry(); // erste Map gesetzt: jetzt erst das Programm samt Textur vorwärmen
      }
      thermo.visible = true;
    }

    // ---------------------------------------------------------------- Blitz-Strahl
    let bolt = null;
    const boltPos = new Float32Array(BOLT_SEG * 4 * 3);
    {
      const g = new BufferGeometry();
      const pa = new BufferAttribute(boltPos, 3);
      pa.setUsage(DynamicDrawUsage);
      g.setAttribute('position', pa);
      const idx = new Uint16Array(BOLT_SEG * 6);
      for (let i = 0; i < BOLT_SEG; i++) { const b = i * 4; idx.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6); }
      g.setIndex(new BufferAttribute(idx, 1));
      const m = new MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false, toneMapped: false, forceSinglePass: true });
      bolt = new Mesh(g, m);
      bolt.frustumCulled = false;
      bolt.renderOrder = 12;
      bolt.visible = false;
      out.skyRoot.add(bolt);
      ctx.track(g); ctx.track(m);
    }
    function shapeBolt(n) {
      const az = hash01(seed * 3 + n * 17) * Math.PI * 2;
      let x = Math.cos(az) * BOLT_R;
      let z = Math.sin(az) * BOLT_R;
      let y = 44;
      const tx = -Math.sin(az);
      const tz = Math.cos(az);
      for (let i = 0; i < BOLT_SEG; i++) {
        const nx = x + (hash01(n * 101 + i * 7 + 1) - 0.5) * 3.2;
        const nz = z + (hash01(n * 101 + i * 7 + 2) - 0.5) * 3.2;
        const ny = y - 3.0 - hash01(n * 101 + i * 7 + 3) * 0.6;
        const w = 0.28 * (1 - i / (BOLT_SEG * 1.3));
        const a = [x + tx * w, y, z + tz * w];
        const b = [x - tx * w, y, z - tz * w];
        const c = [nx - tx * w, ny, nz - tz * w];
        const d = [nx + tx * w, ny, nz + tz * w];
        boltPos.set([...a, ...b, ...c, ...d], i * 12);
        x = nx; y = ny; z = nz;
      }
      bolt.geometry.attributes.position.needsUpdate = true;
    }

    // ---------------------------------------------------------------- Blitz/Donner-Ablauf
    let lightN = 0;
    let nextAt = null;
    let flashStart = -1;
    let flashing = false;
    function indoorFactor() {
      if (area === 'palastHall') return 0;
      return area === 'shop' || area === 'palastFoyer' || area === 'salon' ? 0.5 : 1;
    }
    function endFlash(w) {
      flashing = false;
      bolt.visible = false;
      if (w && typeof w.flash === 'function') w.flash(0);
    }
    function lightning(t, w) {
      const on = !!w && lightningOn(w) && !suspended;
      if (!on) { if (flashing) endFlash(w); nextAt = null; return; }
      if (nextAt === null) nextAt = t + lightningGap(seed, lightN);
      if (!flashing && t >= nextAt) {
        flashing = true;
        flashStart = t;
        const vis = lightningVisual(reduced);
        if (vis && boltVisible(level)) shapeBolt(lightN);
        const plan = thunderPlan(seed, lightN);
        const snd = ctx.use('sound');
        const ind = indoorFactor();
        if (snd && typeof snd.thunder === 'function' && ctx.soundOn() && ind > 0) snd.thunder(plan.delay, plan.gain * (0.5 + 0.5 * ind));
        lightN += 1;
        nextAt = t + lightningGap(seed, lightN);
      }
      if (flashing) {
        const dt = t - flashStart;
        const k = flashAt(dt) * indoorFactor();
        if (dt >= FLASH_LEN) { endFlash(w); return; }
        if (!lightningVisual(reduced)) return;
        if (typeof w.flash === 'function') w.flash(k);
        bolt.visible = boltVisible(level) && k > 0.3 && indoorFactor() === 1;
      }
    }

    // ---------------------------------------------------------------- Atemwölkchen
    const breathPosA = new Float32Array(BREATH_MAX * 3);
    const breathDirA = new Float32Array(BREATH_MAX * 2);
    const breathPhA = new Float32Array(BREATH_MAX).fill(-1);
    const slots = new Array(BREATH_MAX).fill(null); // Slot → Figur-Handle
    let breath = null;
    let breathU = null;
    {
      const g = new BufferGeometry();
      const pa = new BufferAttribute(breathPosA, 3); pa.setUsage(DynamicDrawUsage);
      const da = new BufferAttribute(breathDirA, 2); da.setUsage(DynamicDrawUsage);
      const ha = new BufferAttribute(breathPhA, 1); ha.setUsage(DynamicDrawUsage);
      g.setAttribute('position', pa); g.setAttribute('aDir', da); g.setAttribute('aPh', ha);
      breathU = { uPx: { value: 600 } };
      const m = new ShaderMaterial({ uniforms: breathU, vertexShader: BREATH_VERT, fragmentShader: BREATH_FRAG, transparent: true, depthWrite: false, fog: false });
      breath = new Points(g, m);
      breath.frustumCulled = false;
      breath.renderOrder = 9;
      breath.visible = false;
      out.group.add(breath);
      ctx.track(g); ctx.track(m);
    }
    const tmp = new Vector3();
    let pickT = 0;
    /** Sichtbar samt Eltern-Gruppen (Salon, Palast-Innenraum werden aus der Ferne ausgeblendet; die Atem-Points hängen nicht darunter). */
    const shownChain = (o) => { for (let q = o; q; q = q.parent) if (q.visible === false) return false; return true; };
    /** Atem nur im Freien: geheizte Innenräume (Laden, Salon, Palast) bleiben ohne Wölkchen. */
    const wv = new Vector3();
    const outside = (p, h) => {
      try {
        let y = 0;
        if (typeof h.root.getWorldPosition === 'function') { h.root.getWorldPosition(wv); y = wv.y; } // Weltposition (root.position.y ist lokal zur Eltern-Gruppe)
        else if (h.root.position) y = h.root.position.y;
        return OUTDOOR_AREAS.includes(areaAt(L, p.x, p.z, Number.isFinite(y) ? y : 0));
      } catch { return false; }
    };
    function pickSlots() {
      const np = ctx.use('npc');
      const list = np && typeof np.people === 'function' ? np.people() : [];
      const cands = [];
      for (const p of list) {
        const h = p.handle;
        if (!h || h.disposed || !h.root || !shownChain(h.root) || p.kind === 'cat' || p.kind === 'pigeon') continue;
        if (!outside(p, h)) continue;
        const d = Math.hypot(p.x - cam.position.x, p.z - cam.position.z);
        if (d <= 14) cands.push({ h, d });
      }
      cands.sort((a, b) => a.d - b.d);
      const keep = cands.slice(0, BREATH_MAX).map((c) => c.h);
      for (let i = 0; i < BREATH_MAX; i++) if (slots[i] && !keep.includes(slots[i])) slots[i] = null;
      for (const h of keep) {
        if (slots.includes(h)) continue;
        const free = slots.indexOf(null);
        if (free >= 0) slots[free] = h;
      }
    }
    function breathUpdate(t, dt, w) {
      const on = !!w && breathOn(w.temp, level) && !suspended && OUTDOOR_AREAS.includes(area);
      if (!on) { breath.visible = false; for (let i = 0; i < BREATH_MAX; i++) slots[i] = null; return; }
      pickT -= dt;
      if (pickT <= 0) { pickT = 0.25; pickSlots(); }
      let any = false;
      for (let i = 0; i < BREATH_MAX; i++) {
        const h = slots[i];
        if (!h || h.disposed || !shownChain(h.root)) { breathPhA[i] = -1; continue; }
        try { (typeof h.faceWorld === 'function' ? h.faceWorld(tmp) : h.headWorld(tmp)); } catch { breathPhA[i] = -1; continue; }
        const ry = h.root.rotation.y;
        breathPosA[i * 3] = tmp.x; breathPosA[i * 3 + 1] = tmp.y - 0.1; breathPosA[i * 3 + 2] = tmp.z;
        breathDirA[i * 2] = Math.sin(ry); breathDirA[i * 2 + 1] = Math.cos(ry);
        breathPhA[i] = breathPhase(t, i);
        any = true;
      }
      const g = breath.geometry;
      g.attributes.position.needsUpdate = true; g.attributes.aDir.needsUpdate = true; g.attributes.aPh.needsUpdate = true;
      const fov = (cam.fov || 60) * Math.PI / 180;
      let hpx = 800;
      try { hpx = ctx.renderer.domElement.height || 800; } catch { /* egal */ }
      breathU.uPx.value = hpx / (2 * Math.tan(fov / 2));
      breath.visible = any;
    }

    // ---------------------------------------------------------------- Winterkleidung
    let winter = false;
    let winterSent = null;
    function syncWinter(w) {
      winter = winterNext(winter, w && w.temp);
      if (winter === winterSent) return;
      const np = ctx.use('npc');
      if (np && typeof np.setWinterAll === 'function') { try { np.setWinterAll(winter); winterSent = winter; } catch { /* egal */ } }
    }

    function onWeather() {
      const w = W();
      syncThermo(w);
      syncWinter(w);
    }
    let offWeather = null;
    let hooked = false;
    function hook() {
      const w = W();
      if (!w || hooked) return;
      hooked = true;
      if (typeof w.onChange === 'function') offWeather = w.onChange(onWeather);
      onWeather();
    }
    hook();
    // Blitz-Strahl, Atem-Points und Thermometer erscheinen erst bei Ereignissen: Programme im Leerlauf nach dem Start vorwärmen,
    // aber nur, was auf der aktuellen Stufe gezeichnet werden kann (Blitz ab mid, Atem ab high, Thermometer erst mit Map).
    const cancelWarm = scheduleWarm(ctx, () => [
      { object: bolt, ok: () => boltVisible(level) },
      { object: breath, ok: () => atLeast(level, 'high') },
      thermo ? { object: thermo, ok: () => !!thermo.material.map } : null,
    ].filter(Boolean));
    warmer = cancelWarm;

    return {
      update(dt, t) {
        if (!hooked) hook();
        areaT += dt;
        if (areaT > 0.3) {
          areaT = 0;
          const a = ctx.use('areas');
          area = a ? a.current() : 'shop';
          if (winterSent === null && hooked) syncWinter(W()); // npc-Provider kam erst später
        }
        const w = W();
        if (!w) return;
        lightning(t, w);
        breathUpdate(t, dt, w);
      },
      onQuality(lv) { level = lv; cancelWarm.retry(); },
      onSuspend() { suspended = true; const w = W(); if (flashing) endFlash(w); breath.visible = false; },
      onResume() { suspended = false; onWeather(); },
      dispose() {
        cancelWarm();
        if (offWeather) { offWeather(); offWeather = null; }
        const w = W();
        if (w && typeof w.flash === 'function') w.flash(0);
        const np = ctx.use('npc');
        if (winterSent && np && typeof np.setWinterAll === 'function') { try { np.setWinterAll(false); } catch { /* egal */ } }
        if (thermoTex) thermoTex.dispose();
        if (thermo && thermo.parent) thermo.parent.remove(thermo);
        if (bolt.parent) bolt.parent.remove(bolt);
        if (breath.parent) breath.parent.remove(breath);
      },
    };
  },
};
