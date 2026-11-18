// VIDEOTHEK LENZ · Figur (1.17.0): verbindliche ID-Listen des Render-Looks v2 (rein, ohne three/DOM).
// Die Reihenfolge ist der Leitungscode (Index) und wird NIE umsortiert – neue Einträge nur hinten anhängen.
// Freischalt-Teile (Code ≥ UNLOCK_BASE) stehen in eigenen Listen; Code = UNLOCK_BASE + Index.
// Benutzt von char/look2.js (Kodierung) und npc/figure-parts.js (Geometrie). Vertrag: docs/store3d.md „Figur (1.17.0)“.

export const UNLOCK_BASE = 64;

/** Frisuren; 0–4 = die alten HAIR_STYLES aus npc/looks.js in alter Reihenfolge. */
export const HAIR_STYLES = ['short', 'long', 'bald', 'tuft', 'bob', 'buzz', 'sidepart', 'curls', 'afro', 'ponytail', 'bun', 'mohawk', 'mullet', 'spiky', 'quiff', 'braids', 'pigtails', 'undercut'];
export const EYES = ['dot', 'round', 'narrow', 'sleepy', 'wide', 'wink'];
export const BROWS = ['none', 'thin', 'thick', 'arched', 'angry'];
export const BEARDS = ['none', 'stubble', 'moustache', 'goatee', 'full', 'chin'];
/** Körperform: 0 gerade, 1 breite Schultern, 2 breite Hüfte (neutral, keine Geschlechter-Vorlagen). */
export const SHAPES = ['straight', 'shoulders', 'hips'];

export const TOP_CUTS = ['tee', 'longsleeve', 'hoodie', 'shirt', 'tank', 'sweater', 'jacket', 'vest', 'polo', 'dress'];
export const TOP_PATTERNS = ['plain', 'chest', 'rings', 'vertical', 'twotone', 'check'];
export const BOTTOM_CUTS = ['jeans', 'shorts', 'skirt', 'cargo', 'track', 'wide'];
export const BOTTOM_PATTERNS = ['plain', 'stripe', 'twotone', 'check'];
export const SHOE_MODELS = ['sneaker', 'boot', 'sandal', 'loafer', 'high'];
export const GLASSES = ['none', 'round', 'square', 'sun', 'nerd'];
export const HATS = ['none', 'cap', 'beanie', 'hat', 'bucket', 'band', 'beret'];
export const BAGS = ['none', 'bag', 'backpack', 'shopping'];

/** Freischalt-Teile je Slot (Index i → Code UNLOCK_BASE + i). Zuordnung zu Entdeckungen: char/unlocks.js. */
export const UNLOCK_TOPS = ['cape', 'jersey3', 'banshirt', 'hivis', 'studjacket'];
export const UNLOCK_BOTTOMS = ['zebra'];
export const UNLOCK_SHOES = ['splash'];
export const UNLOCK_GLASSES = ['pilot', '3d', 'bandaid'];
export const UNLOCK_HATS = ['goldcap', 'crown', 'catears', 'canhat', 'usher', 'curlers'];
export const UNLOCK_BAGS = ['chips', 'vhspack', 'catpack'];

/** 1.18.0 Welle 4: neue Codes ohne Geometrie/Freischaltung (Welle 5 füllt beides und leert diese Liste). Bis dahin zeichnen sie den Standard und bleiben gesperrt. */
export const UNLOCK_PENDING = ['studjacket', 'bandaid', 'curlers', 'catpack'];

/** Kuratierte Paletten (je 16 Töne, Index 0..15 = Farbcode; 0x1000000|rgb24 = eigene Farbe). Haut: 14 Töne, keine eigene Farbe. */
export const SKIN = [
  [0.98, 0.84, 0.74], [0.96, 0.78, 0.65], [0.93, 0.74, 0.6], [0.9, 0.7, 0.55], [0.86, 0.64, 0.5], [0.84, 0.62, 0.47], [0.78, 0.56, 0.42],
  [0.7, 0.5, 0.36], [0.62, 0.43, 0.3], [0.56, 0.38, 0.27], [0.5, 0.34, 0.24], [0.44, 0.29, 0.2], [0.38, 0.25, 0.18], [0.3, 0.2, 0.15],
];
export const HAIR_COLORS = [
  [0.1, 0.07, 0.06], [0.24, 0.13, 0.1], [0.36, 0.2, 0.12], [0.45, 0.28, 0.14], [0.62, 0.42, 0.2], [0.8, 0.62, 0.3], [0.93, 0.82, 0.55], [0.7, 0.2, 0.12],
  [0.85, 0.35, 0.15], [0.75, 0.75, 0.78], [0.95, 0.95, 0.95], [0.3, 0.6, 0.85], [0.9, 0.35, 0.65], [0.45, 0.25, 0.7], [0.3, 0.75, 0.45], [0.95, 0.85, 0.2],
];
export const CLOTH_COLORS = [
  [0.85, 0.2, 0.2], [0.2, 0.45, 0.8], [0.95, 0.8, 0.2], [0.25, 0.65, 0.4], [0.55, 0.3, 0.7], [0.95, 0.5, 0.15], [0.9, 0.9, 0.92], [0.2, 0.22, 0.3],
  [0.95, 0.5, 0.65], [0.35, 0.75, 0.8], [0.12, 0.12, 0.14], [0.5, 0.5, 0.52], [0.55, 0.4, 0.25], [0.14, 0.16, 0.3], [0.2, 0.35, 0.3], [0.6, 0.15, 0.3],
];
export const SHOE_COLORS = [
  [0.1, 0.1, 0.12], [0.9, 0.9, 0.92], [0.7, 0.2, 0.15], [0.35, 0.22, 0.12], [0.2, 0.3, 0.6], [0.5, 0.5, 0.52], [0.85, 0.75, 0.2], [0.2, 0.5, 0.3],
  [0.95, 0.5, 0.65], [0.55, 0.3, 0.7], [0.25, 0.18, 0.12], [0.95, 0.5, 0.15], [0.35, 0.75, 0.8], [0.6, 0.15, 0.3], [0.8, 0.65, 0.45], [0.12, 0.16, 0.25],
];
