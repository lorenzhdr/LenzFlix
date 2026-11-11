// LenzFlix: kleiner Tages-Seed für deterministische Mischungen (gleicher Tag = gleiche Reihenfolge).
// Eigene Kopie der Idee aus features/rows/logic.js (core/ darf nicht aus features/ importieren).

/** Lokales Datum als YYYY-MM-DD. */
export function dayKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** FNV-1a (32 Bit). */
export function hashString(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Zufallsfolge [0,1) aus einem Seed-String (mulberry32). */
export function seededRandom(seed) {
  let a = hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Neue, per Seed gemischte Kopie (Fisher-Yates). */
export function seededShuffle(list, seed) {
  const out = Array.isArray(list) ? list.slice() : [];
  const rnd = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
