// VIDEOTHEK LENZ · Ultra-Figuren (1.19.0 U4): Detail-Geometrie (Finger, Gürtel, Schuhkappen, Ohren, Brauen …) nur in der Stufe „ultra“ und nur in der Nähe.
// Alle lebenden Figuren (npc/figure.js liveFigures: Passanten, Mitspieler, Personal, eigene Figur in Außenansicht/Spiegel) bekommen setDetail(true),
// solange sie höchstens DETAIL_ON m von der Kamera entfernt sind; erst jenseits DETAIL_OFF m (Hysterese) fällt es zurück. Prüfung höchstens alle 0,5 s,
// höchstens MAX_SWAPS Wechsel je Prüfung (nächste zuerst); beim Verlassen von „ultra“ gehen alle sofort zurück. Kein zusätzlicher Draw-Call (selbes Mesh).
import { Vector3 } from 'three';
import { liveFigures } from '../npc/figure.js';

export const DETAIL_ON = 14;
export const DETAIL_OFF = 16;
export const MAX_SWAPS = 4;
export const CHECK_S = 0.5;
const tmp = new Vector3();

/**
 * Ein LOD-Schritt. figs = Figuren-Handles, (cx, cy, cz) = Kamera. enabled=false → alle Details aus (ohne Wechsellimit).
 * @returns {number} Anzahl der Wechsel
 */
export function stepFigureLod(figs, cx, cy, cz, { enabled = true, on = DETAIL_ON, off = DETAIL_OFF, max = MAX_SWAPS } = {}) {
  const todo = [];
  for (const h of figs) {
    if (!h || h.disposed || typeof h.setDetail !== 'function') continue;
    const has = h.getDetail();
    if (!enabled || (h.isEgo && h.isEgo())) { if (has) todo.push({ h, want: false, d: 0 }); continue; }
    h.root.getWorldPosition(tmp);
    const d = Math.hypot(tmp.x - cx, tmp.y - cy, tmp.z - cz);
    if (!has && d <= on) todo.push({ h, want: true, d });
    else if (has && d > off) todo.push({ h, want: false, d });
  }
  todo.sort((a, b) => a.d - b.d);
  const limit = enabled ? max : Infinity;
  let n = 0;
  for (const t of todo) {
    if (n >= limit) break;
    t.h.setDetail(t.want);
    n++;
  }
  return n;
}

export default {
  name: 'ultra-figures',
  init(ctx) {
    let acc = 0;
    const ultra = () => { try { return ctx.quality() === 'ultra'; } catch { return false; } };
    const cam = new Vector3();
    const run = () => {
      const en = ultra();
      ctx.camera.getWorldPosition(cam);
      stepFigureLod(liveFigures(), cam.x, cam.y, cam.z, { enabled: en });
    };
    return {
      update(dt) {
        acc += dt;
        if (acc < CHECK_S) return;
        acc = 0;
        run();
      },
      onQuality() { acc = 0; run(); },
      dispose() { stepFigureLod(liveFigures(), 0, 0, 0, { enabled: false }); },
    };
  },
};
