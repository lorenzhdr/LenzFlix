// LENZ LIVE Zeitplan: Altersfreigabe → 0|6|12|16|18|null (null = unbekannt, gilt als erlaubt).

const FIXED = {
  G: 0, U: 0, 'TV-Y': 0, 'TV-G': 0,
  PG: 6, 'TV-PG': 6, 'TV-Y7': 6, 'TV-Y7-FV': 6,
  R: 16, 'TV-MA': 16,
  'NC-17': 18, X: 18, XXX: 18, AO: 18, R18: 18,
  NR: null, UNRATED: null, '': null,
};

export function ratingAge(str) {
  if (str == null) return null;
  const s = String(str).trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(FIXED, s)) return FIXED[s];
  const m = /(\d{1,2})\+?A?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  if (n >= 18) return 18;
  if (n >= 15) return 16;
  if (n >= 12) return 12;
  if (n >= 6) return 6;
  return 0;
}

/** Strengere von zwei Freigaben (null = unbekannt zählt als schwächer). */
export const maxAge = (a, b) => (a == null ? b : b == null ? a : a > b ? a : b);
