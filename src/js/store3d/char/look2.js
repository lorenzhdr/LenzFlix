// VIDEOTHEK LENZ · Figur (1.17.0): Look-Code (Int-Array, Länge 26) <-> Render-Look v2 (rein, ohne three/DOM, deterministisch).
// Vertrag: .tmp/v117/contracts.md §2 und §3. Zufall nur über die übergebene Funktion `rand` (Werte in [0,1)).
import {
  UNLOCK_BASE, HAIR_STYLES, EYES, BROWS, BEARDS, SHAPES, TOP_CUTS, TOP_PATTERNS, BOTTOM_CUTS, BOTTOM_PATTERNS, SHOE_MODELS, GLASSES, HATS, BAGS,
  UNLOCK_TOPS, UNLOCK_BOTTOMS, UNLOCK_SHOES, UNLOCK_GLASSES, UNLOCK_HATS, UNLOCK_BAGS, SKIN, HAIR_COLORS, CLOTH_COLORS, SHOE_COLORS,
} from './ids.js';

export const LEN = 26;
export const VERSION = 2;
export const CUSTOM_COLOR = 0x1000000;
export const MAX_CODE = 0x1ffffff;

/** Feldindizes im Look-Code. */
export const F = {
  ver: 0, skin: 1, height: 2, build: 3, shape: 4, hairStyle: 5, hairColor: 6, eyes: 7, brows: 8, beard: 9,
  topCut: 10, topColor: 11, topPattern: 12, topColor2: 13, botCut: 14, botColor: 15, botPattern: 16, botColor2: 17,
  shoeModel: 18, shoeColor: 19, sole: 20, glasses: 21, hat: 22, hatColor: 23, bag: 24, bagColor: 25,
};

/** Felder, die in den Outfit-Hash eingehen (nie Haut, Körper, Augen, Brauen). */
export const OUTFIT_FIELDS = [5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];

const DEFAULT = [2, 3, 10, 10, 0, 0, 1, 0, 1, 0, 0, 1, 0, 6, 0, 13, 0, 11, 0, 1, 1, 0, 0, 0, 0, 0];

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const isInt = (v) => typeof v === 'number' && Number.isInteger(v);

export function defaultCode() { return DEFAULT.slice(); }

/** Palettenindex (0..63) bleibt, [r,g,b] (0..1) wird zur eigenen Farbe 0x1000000|rgb24. */
export function encodeColor(c) {
  if (Array.isArray(c)) {
    const b = (v) => Math.round(clamp(Number(v) || 0, 0, 1) * 255);
    return CUSTOM_COLOR | (b(c[0]) << 16) | (b(c[1]) << 8) | b(c[2]);
  }
  return isInt(c) ? clamp(c, 0, 63) : 0;
}

/** Farbcode → [r,g,b] (0..1). Unbekannte Palettenindizes → erster Palettenton. */
export function decodeColor(code, palette) {
  if (isInt(code) && code >= CUSTOM_COLOR && code <= MAX_CODE) {
    return [((code >> 16) & 255) / 255, ((code >> 8) & 255) / 255, (code & 255) / 255];
  }
  const p = palette[isInt(code) && code >= 0 && code < palette.length ? code : 0];
  return [p[0], p[1], p[2]];
}

const validColor = (v, pal) => isInt(v) && ((v >= 0 && v < pal.length) || (v >= CUSTOM_COLOR && v <= MAX_CODE));

/** Auswahlfeld: Index in `base` oder UNLOCK_BASE+i in `unlock` (nur wenn der Eintrag existiert). */
function validPick(v, base, unlock) {
  if (!isInt(v)) return false;
  if (v >= 0 && v < base.length) return true;
  return !!unlock && v >= UNLOCK_BASE && v - UNLOCK_BASE < unlock.length;
}

const RULES = [
  null, // 0 Version
  (v) => isInt(v) && v >= 0 && v < SKIN.length,
  (v) => isInt(v) && v >= 0 && v <= 20,
  (v) => isInt(v) && v >= 0 && v <= 20,
  (v) => validPick(v, SHAPES),
  (v) => validPick(v, HAIR_STYLES),
  (v) => validColor(v, HAIR_COLORS),
  (v) => validPick(v, EYES),
  (v) => validPick(v, BROWS),
  (v) => validPick(v, BEARDS),
  (v) => validPick(v, TOP_CUTS, UNLOCK_TOPS),
  (v) => validColor(v, CLOTH_COLORS),
  (v) => validPick(v, TOP_PATTERNS),
  (v) => validColor(v, CLOTH_COLORS),
  (v) => validPick(v, BOTTOM_CUTS, UNLOCK_BOTTOMS),
  (v) => validColor(v, CLOTH_COLORS),
  (v) => validPick(v, BOTTOM_PATTERNS),
  (v) => validColor(v, CLOTH_COLORS),
  (v) => validPick(v, SHOE_MODELS, UNLOCK_SHOES),
  (v) => validColor(v, SHOE_COLORS),
  (v) => validColor(v, SHOE_COLORS),
  (v) => validPick(v, GLASSES, UNLOCK_GLASSES),
  (v) => validPick(v, HATS, UNLOCK_HATS),
  (v) => validColor(v, CLOTH_COLORS),
  (v) => validPick(v, BAGS, UNLOCK_BAGS),
  (v) => validColor(v, CLOTH_COLORS),
];

/** Toleranter Parser: beliebige Eingabe → gültiger Code (falsche Länge/Version → Standard, sonst je Feld). */
export function decode(raw) {
  const out = defaultCode();
  if (!Array.isArray(raw) || raw.length !== LEN || raw[0] !== VERSION) return out;
  for (let i = 1; i < LEN; i++) if (RULES[i](raw[i])) out[i] = raw[i];
  return out;
}

export function equal(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const SHAPE_NAMES = SHAPES;
const nameOf = (v, base, unlock, fallback) => {
  if (v >= UNLOCK_BASE) return (unlock && unlock[v - UNLOCK_BASE]) || fallback;
  return base[v] || fallback;
};

/** Code → Render-Look v2 (Vertrag §2). Erwartet einen gültigen Code (sonst vorher `decode`). */
export function toRender(code) {
  const c = decode(code);
  const col = (i, pal) => decodeColor(c[i], pal);
  return {
    v: 2,
    skin: decodeColor(c[1], SKIN),
    height: 0.9 + (c[2] / 20) * 0.2,
    build: 0.85 + (c[3] / 20) * 0.4,
    shape: SHAPE_NAMES[c[4]] || 'straight',
    hairStyle: HAIR_STYLES[c[5]] || HAIR_STYLES[0],
    hair: col(6, HAIR_COLORS),
    eyes: EYES[c[7]] || EYES[0],
    brows: BROWS[c[8]] || BROWS[0],
    beard: BEARDS[c[9]] || BEARDS[0],
    top: { cut: nameOf(c[10], TOP_CUTS, UNLOCK_TOPS, 'tee'), color: col(11, CLOTH_COLORS), pattern: TOP_PATTERNS[c[12]] || 'plain', color2: col(13, CLOTH_COLORS) },
    bottom: { cut: nameOf(c[14], BOTTOM_CUTS, UNLOCK_BOTTOMS, 'jeans'), color: col(15, CLOTH_COLORS), pattern: BOTTOM_PATTERNS[c[16]] || 'plain', color2: col(17, CLOTH_COLORS) },
    shoes: { model: nameOf(c[18], SHOE_MODELS, UNLOCK_SHOES, 'sneaker'), color: col(19, SHOE_COLORS), sole: col(20, SHOE_COLORS) },
    glasses: nameOf(c[21], GLASSES, UNLOCK_GLASSES, 'none'),
    hat: { id: nameOf(c[22], HATS, UNLOCK_HATS, 'none'), color: col(23, CLOTH_COLORS) },
    bag: { id: nameOf(c[24], BAGS, UNLOCK_BAGS, 'none'), color: col(25, CLOTH_COLORS) },
    handItem: null,
  };
}

/** 8-stelliger Hex-FNV-1a über die Outfit-Felder (ohne Haut, Körper, Augen, Brauen). */
export function outfitHash(code) {
  const c = Array.isArray(code) ? code : [];
  let h = 0x811c9dc5;
  for (const i of OUTFIT_FIELDS) {
    let v = isInt(c[i]) ? c[i] >>> 0 : 0;
    for (let k = 0; k < 4; k++) {
      h ^= v & 255;
      h = Math.imul(h, 0x01000193) >>> 0;
      v >>>= 8;
    }
    // Feldgrenze, damit Verschiebungen zwischen Feldern verschiedene Hashes ergeben.
    h ^= 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Zufälliger, plausibler Look. Nur Basisteile plus die in `unlocked` ('slot:code') freigeschalteten.
 * `rand` liefert Werte in [0,1); alles bleibt deterministisch zur Eingabefolge.
 */
export function randomLook(rand, unlocked = new Set()) {
  const r = () => { const v = rand(); return v >= 0 && v < 1 ? v : 0; };
  const int = (n) => Math.min(n - 1, Math.floor(r() * n));
  const pick = (arr) => arr[int(arr.length)];
  const has = (slot, code) => unlocked && typeof unlocked.has === 'function' && unlocked.has(slot + ':' + code);
  const pool = (slot, baseLen, unlock) => {
    const a = [];
    for (let i = 0; i < baseLen; i++) a.push(i);
    for (let i = 0; i < unlock.length; i++) if (has(slot, UNLOCK_BASE + i)) a.push(UNLOCK_BASE + i);
    return a;
  };
  const weighted = (noneChance, arr) => (r() < noneChance ? 0 : pick(arr));
  const c = defaultCode();
  c[1] = int(SKIN.length);
  c[2] = 4 + int(13);
  c[3] = 4 + int(13);
  c[4] = int(SHAPES.length);
  c[5] = int(HAIR_STYLES.length);
  c[6] = int(HAIR_COLORS.length);
  c[7] = int(EYES.length);
  c[8] = 1 + int(BROWS.length - 1);
  c[9] = r() < 0.6 ? 0 : 1 + int(BEARDS.length - 1);
  c[10] = pick(pool('top', TOP_CUTS.length, UNLOCK_TOPS));
  c[11] = int(CLOTH_COLORS.length);
  c[12] = r() < 0.55 ? 0 : int(TOP_PATTERNS.length);
  c[13] = int(CLOTH_COLORS.length);
  c[14] = pick(pool('bottom', BOTTOM_CUTS.length, UNLOCK_BOTTOMS));
  // Hose nie in der Farbe des Oberteils.
  c[15] = int(CLOTH_COLORS.length);
  if (c[15] === c[11]) c[15] = (c[15] + 1 + int(CLOTH_COLORS.length - 1)) % CLOTH_COLORS.length;
  c[16] = r() < 0.7 ? 0 : int(BOTTOM_PATTERNS.length);
  c[17] = int(CLOTH_COLORS.length);
  c[18] = pick(pool('shoes', SHOE_MODELS.length, UNLOCK_SHOES));
  c[19] = int(SHOE_COLORS.length);
  c[20] = r() < 0.6 ? 1 : int(SHOE_COLORS.length);
  c[21] = weighted(0.7, pool('glasses', GLASSES.length, UNLOCK_GLASSES).slice(1));
  c[22] = weighted(0.65, pool('hat', HATS.length, UNLOCK_HATS).slice(1));
  c[23] = int(CLOTH_COLORS.length);
  c[24] = weighted(0.6, pool('bag', BAGS.length, UNLOCK_BAGS).slice(1));
  c[25] = int(CLOTH_COLORS.length);
  return c;
}
