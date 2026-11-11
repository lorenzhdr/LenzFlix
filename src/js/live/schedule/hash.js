// LENZ LIVE Zeitplan: Hash/PRNG (32 Bit, deterministisch, unabhängig von der Engine).

/** FNV-1a über UTF-16-Code-Units → uint32. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Murmur3-Finalizer → uint32. */
export function fmix32(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Bits von 32 → 0 spiegeln → uint32. */
export function bitrev32(x) {
  x = x >>> 0;
  x = (((x & 0xaaaaaaaa) >>> 1) | ((x & 0x55555555) << 1)) >>> 0;
  x = (((x & 0xcccccccc) >>> 2) | ((x & 0x33333333) << 2)) >>> 0;
  x = (((x & 0xf0f0f0f0) >>> 4) | ((x & 0x0f0f0f0f) << 4)) >>> 0;
  x = (((x & 0xff00ff00) >>> 8) | ((x & 0x00ff00ff) << 8)) >>> 0;
  return ((x >>> 16) | (x << 16)) >>> 0;
}

/** Mulberry32-PRNG: () → [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Schlüssel-Hash: fmix32(fnv1a(key + '\u0001' + id)). */
export const keyHash = (key, id) => fmix32(fnv1a(key + '\u0001' + id));

/** Code-Unit-Vergleich (kein localeCompare). */
export const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
