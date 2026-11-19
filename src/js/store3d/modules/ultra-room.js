// VIDEOTHEK LENZ · Ultra-Innenraum (1.19.0): Details „Innenraum der Videothek“, nur auf der Stufe ultra (Registry: engine/ultra.js).
// Schlüssel: tex (512²-Texturen statt 256², Umschaltung per onVisible), posters, clutter, lamps, dust (zusammen +5 Draw-Calls).
// Nur Dekor: keine Kollider, keine Interaktionen. ?ufx=-key schaltet einzelne Details ab (Dev).
import { Group } from 'three';
import { makeUltraTextures } from '../world/textures-ultra.js';
import { buildPosters, buildClutter, buildLamps, buildDust } from '../world/build-room-ultra.js';

const maxAniso = (ctx) => { try { return Math.max(1, Math.min(16, ctx.renderer.capabilities.getMaxAnisotropy())); } catch { return 4; } };

/** 'tex': leere Group; onVisible(true) tauscht die map aller Materialien mit Basistextur (userData.lfxTex) gegen die 512²-Variante. */
function buildTex(ctx) {
  const group = new Group();
  group.name = 'ultra-tex';
  const neu = makeUltraTextures(1); // { key: CanvasTexture } – schon im Leerlauf-Bau erzeugt, der Wechsel auf Ultra tauscht nur noch die map
  const swapped = []; // { mat, old, key }
  let shown = false;
  let acc = 0;
  function collect() {
    const live = new Set();
    ctx.scene.traverse((o) => {
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        live.add(m);
        const k = m.map && m.map.userData && m.map.userData.lfxTex;
        if (k && !swapped.some((s) => s.mat === m)) swapped.push({ mat: m, old: m.map, key: k });
      }
    });
    // Materialien verworfener Szenenteile loslassen (nicht mehr in der Szene)
    for (let i = swapped.length - 1; i >= 0; i--) if (!live.has(swapped[i].mat)) swapped.splice(i, 1);
  }
  function apply() {
    collect();
    for (const s of swapped) {
      const t = neu[s.key];
      if (!t || s.mat.map === t) continue;
      const an = s.old.anisotropy || 1; // Preset-Wert der Basistextur (Ultra: 16)
      if (t.anisotropy !== an) { t.anisotropy = an; t.needsUpdate = true; } // three liest sie nur beim Upload (bei high vorab mit 1 gewärmt)
      s.mat.map = t; // gleicher Programmtyp: kein needsUpdate des Materials (kein Neu-Kompilieren)
    }
  }
  function restore() {
    for (const s of swapped) s.mat.map = s.old;
    swapped.length = 0;
  }
  return {
    object: group,
    textures: Object.values(neu), // vorab hochladen (engine/warm.js): hängen noch an keinem Material
    update(dt) { // Anisotropie folgt den Basistexturen (Preset-Wechsel); alle 2 s neu gebaute Materialien (Rebuilds, späte Teile) nachziehen
      for (const s of swapped) { const t = neu[s.key]; if (t && t.anisotropy !== s.old.anisotropy) { t.anisotropy = s.old.anisotropy; t.needsUpdate = true; } }
      acc += dt || 0;
      if (shown && acc >= 2) { acc = 0; apply(); }
    },
    onVisible(v) { shown = v; acc = 0; if (v) apply(); else restore(); },
    dispose() {
      restore();
      for (const t of Object.values(neu)) t.dispose();
    },
  };
}

export default {
  name: 'ultra-room',
  init(ctx) {
    const u = ctx.use('ultra');
    if (!u) return null;
    const L = ctx.layout;
    const offs = [
      u.register('tex', () => buildTex(ctx)),
      u.register('posters', () => buildPosters(L, { aniso: maxAniso(ctx) })),
      u.register('clutter', () => buildClutter(L)),
      u.register('lamps', () => buildLamps(L)),
      u.register('dust', () => buildDust(L, ctx)),
    ];
    return { dispose() { offs.forEach((f) => f()); } };
  },
};
