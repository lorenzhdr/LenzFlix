// VIDEOTHEK LENZ · Niederschlag (1.19.0), reiner Teil ohne three: Konstanten, Dichte, weicher Wechsel, Schutzboxen, Höhenbereich.
// Genutzt von modules/precip.js (Rendering) und den Tests. Keine Top-Level-Zugriffe auf window/document.

/** Halbbreite des mitlaufenden Volumens (m) in x und z. */
export const HALF = 12;
/** Höhenbereich relativ zur Kamera (m): von Kamera-6 bis Kamera+10 (damit es auch auf Dächern regnet). */
export const Y_BELOW = 6;
export const Y_ABOVE = 10;
/** Dauer des weichen Wechsels in Sekunden. */
export const FADE_S = 15;
/** Höchstzahl der Schutzboxen (Uniform-Array). */
export const MAX_BOXES = 6;
/** Kennzahlen je Art. fall = Fallgeschwindigkeit (m/s, min..max). */
export const KINDS = {
  rain: { id: 0, fallMin: 9, fallMax: 13, alpha: 0.8 },
  snow: { id: 1, fallMin: 1, fallMax: 1.5, alpha: 0.9 },
};

/**
 * Reduzierte Bewegung (prefers-reduced-motion): der Niederschlag fällt weiter, aber ruhiger. fall/wind = Faktor auf Fallgeschwindigkeit
 * und Wind, len = Faktor auf die Streifenlänge (Regen), sway = Faktor auf das Pendeln der Flocken (Schnee).
 */
export function calmFor(reduced) {
  return reduced ? { fall: 0.5, wind: 0.5, len: 0.6, sway: 0 } : { fall: 1, wind: 1, len: 1, sway: 1 };
}

export const clamp01 = (v) => (v > 1 ? 1 : v > 0 ? v : 0);

/** Normiert den Wetterwunsch: { kind: 'rain'|'snow'|null, i: 0..1 }. Ungültiges = kein Niederschlag. */
export function normalizeWeather(w) {
  const kind = w && (w.kind === 'rain' || w.kind === 'snow') ? w.kind : null;
  const i = kind && Number.isFinite(w.i) ? clamp01(w.i) : 0;
  return kind && i > 0 ? { kind, i } : { kind: null, i: 0 };
}

/** Partikelzahl für Intensität i (0..1) bei maximal `max` (Preset 'precip'). Bei i > 0 mindestens 1 (und mindestens 8 % von max). */
export function countFor(max, i) {
  const m = Math.max(0, Math.floor(max || 0));
  const k = clamp01(i);
  if (m === 0 || k <= 0) return 0;
  return Math.min(m, Math.max(Math.ceil(m * 0.08), Math.round(m * k)));
}

/**
 * Weicher Wechsel. st = { kind, a } (aktuell gezeigte Art und Stärke), want = normalizeWeather(...).
 * Gleiche Art: a läuft in FADE_S auf want.i. Andere Art: erst auf 0 abblenden, dann Art wechseln und einblenden.
 * Gibt st zurück (verändert).
 */
export function stepBlend(st, want, dt, fadeS = FADE_S) {
  const rate = Math.max(0, dt) / Math.max(0.001, fadeS);
  if (want.kind !== st.kind && st.a > 0) {
    st.a = Math.max(0, st.a - rate);
    if (st.a <= 0) { st.a = 0; st.kind = want.kind; }
    return st;
  }
  if (want.kind !== st.kind) st.kind = want.kind;
  const to = want.kind ? want.i : 0;
  st.a = st.a < to ? Math.min(to, st.a + rate) : Math.max(to, st.a - rate);
  return st;
}

/** Y-Bereich des Volumens bei Kamerahöhe camY: { lo, hi, span }. */
export function yRange(camY) {
  const lo = camY - Y_BELOW;
  return { lo, hi: camY + Y_ABOVE, span: Y_BELOW + Y_ABOVE };
}

/** Liegt (x,y,z) in einer Schutzbox (xz-Rechteck, unterhalb y1)? Entspricht dem Shader. */
export function inBoxes(boxes, x, y, z) {
  for (const b of boxes) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y < b.y1) return true;
  return false;
}

/**
 * Schutzboxen aus dem Layout: Laden, Palast-Foyer, Palast-Saal, Friseur, Palast-Vordach, Kiosk (Häuschen + Markise). Höchstens MAX_BOXES.
 * Jede Box { x0, z0, x1, z1, y1 }: Partikel darunter (y < y1) werden nicht gezeichnet; darüber (Dach) regnet es.
 */
export function shelterBoxes(layout) {
  const out = [];
  if (!layout) return out;
  const push = (b) => { if (b && [b.x0, b.z0, b.x1, b.z1, b.y1].every(Number.isFinite) && out.length < MAX_BOXES) out.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, y1: b.y1 }); };
  const W = layout.w;
  const D = layout.d;
  push({ x0: 0, z0: 0, x1: W, z1: D, y1: 3.0 });
  const c = layout.city;
  if (c) {
    const p = c.palast;
    if (p) {
      if (p.foyer) push({ x0: p.foyer.x0, z0: p.foyer.z0, x1: p.foyer.x1, z1: p.hall ? p.hall.z0 : p.foyer.z1, y1: p.foyer.ceil || 4 });
      if (p.hall) push({ x0: p.hall.x0, z0: p.hall.z0, x1: p.hall.x1, z1: p.hall.z1, y1: p.hall.ceil || 7.5 });
      if (p.canopy) push({ x0: p.canopy.x0, z0: p.canopy.z0, x1: p.canopy.x1, z1: p.canopy.z1, y1: p.canopy.y });
    }
    const zs = c.zones && c.zones.salon && c.zones.salon.rect;
    if (zs) push({ x0: zs.x0, z0: zs.z0, x1: zs.x1, z1: zs.z1, y1: 3.0 });
    const k = c.kiosk;
    if (k && k.hut && k.awning) {
      const h = k.hut;
      const a = k.awning;
      push({ x0: Math.min(h.x0, a.x0), z0: Math.min(h.z0, a.z0), x1: Math.max(h.x1, a.x1), z1: Math.max(h.z1, a.z1), y1: a.y1 });
    }
  }
  return out;
}

/** Flache Uniform-Daten (immer MAX_BOXES Einträge; unbenutzte sind leer und treffen nie): { xz: Float32Array(4*N), y: Float32Array(N) }. */
export function packBoxes(boxes) {
  const xz = new Float32Array(MAX_BOXES * 4);
  const y = new Float32Array(MAX_BOXES);
  boxes.slice(0, MAX_BOXES).forEach((b, i) => { xz.set([b.x0, b.z0, b.x1, b.z1], i * 4); y[i] = b.y1; });
  return { xz, y };
}
