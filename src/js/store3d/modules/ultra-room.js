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
  let neu = null; // { key: CanvasTexture }
  const swapped = []; // { mat, old, key }
  function collect() {
    const seen = new Set();
    ctx.scene.traverse((o) => {
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        const k = m.map && m.map.userData && m.map.userData.lfxTex;
        if (k && !seen.has(m)) { seen.add(m); if (!swapped.some((s) => s.mat === m)) swapped.push({ mat: m, old: m.map, key: k }); }
      }
    });
  }
  function apply() {
    if (!neu) neu = makeUltraTextures(1);
    collect();
    for (const s of swapped) {
      const t = neu[s.key];
      if (!t) continue;
      t.anisotropy = s.old.anisotropy || 1; // Preset-Wert der Basistextur (Ultra: 16)
      s.mat.map = t; // gleicher Programmtyp: kein needsUpdate des Materials (kein Neu-Kompilieren)
    }
  }
  function restore() {
    for (const s of swapped) s.mat.map = s.old;
    swapped.length = 0;
  }
  return {
    object: group,
    update() { // Anisotropie folgt den Basistexturen (Preset-Wechsel)
      for (const s of swapped) { const t = neu && neu[s.key]; if (t && t.anisotropy !== s.old.anisotropy) { t.anisotropy = s.old.anisotropy; t.needsUpdate = true; } }
    },
    onVisible(v) { if (v) apply(); else restore(); },
    dispose() {
      restore();
      if (neu) { for (const t of Object.values(neu)) t.dispose(); neu = null; }
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
