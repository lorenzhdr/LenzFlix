// LENZ LIVE Zeitplan: Pools und Eimer-Rotation (rein, deterministisch).
//
// Hilfs-API (auch für premiere.js / themeday.js):
//   streamOfAge(age) → 'A' | 'B'                 Strom A: Freigabe ≤ 12 oder unbekannt (05–22 Uhr), Strom B: ≥ 16 (ab 22 Uhr)
//   CAP_MS = { A, B }                             Kapazität je Sendetag in ms (A 17 h, B 4 h: 22:00-05:00 abzüglich Überlauf des Abendfilms und 23-Uhr-Gate)
//   bucketCount(poolMs, capMs) → C                C = 2^floor(log2(poolMs/capMs)), 1 ≤ C ≤ 4096, nur Ganzzahl-Arithmetik
//   makeEntries(key, items, msOf?) → Entry[]      Eintrag { id, h, br, it, ms }, sortiert nach bitrev32(h), Tie-Break id
//   bucket(sorted, C, D) → Entry[]                 Titel des Tag-Eimers D & (C−1), nach (h, id) sortiert (unrotiert)
//   rotation(sorted, C, D) → Entry[]              Titel des Tag-Eimers D & (C−1), pro Zyklus q = D >>> log2(C) rotiert
//   rotationWithBorrow(sorted, C, D) → { home: Entry[], borrow: Entry[] }   borrow = Eimer (D + C/2) & (C−1), leer bei C = 1
import { bitrev32, keyHash, cmpStr } from './hash.js';
import { HOUR } from './time.js';

export const CAP_MS = { A: 17 * HOUR, B: 4 * HOUR };
export const MAX_C = 4096;

export const streamOfAge = (age) => (age == null || age <= 12 ? 'A' : 'B');

/** Größte Zweierpotenz C ≤ poolMs/capMs (min. 1, max. 4096), ohne Fließkomma-Logarithmus. */
export function bucketCount(poolMs, capMs) {
  let C = 1;
  while (C < MAX_C && C * 2 * capMs <= poolMs) C *= 2;
  return C;
}

const log2i = (C) => 31 - Math.clz32(C);

/** Index-Einträge für Titel (it.id nötig), sortiert nach bitrev32(h) – ein Eimer ist ein zusammenhängender Bereich. */
export function makeEntries(key, items, msOf) {
  const out = items.map((it) => {
    const h = keyHash(key, it.id);
    return { id: it.id, h, br: bitrev32(h), it, ms: msOf ? msOf(it) : it.durMs };
  });
  out.sort((a, b) => (a.br - b.br) || cmpStr(a.id, b.id));
  return out;
}

function lowerBound(arr, br) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (arr[m].br < br) lo = m + 1; else hi = m;
  }
  return lo;
}

/** Titel des Tag-Eimers D & (C−1), nach (h, id) sortiert. */
export function bucket(sorted, C, D) {
  const c = log2i(C);
  const b = D & (C - 1);
  let lo = 0;
  let hi = sorted.length;
  if (c > 0) {
    const r = bitrev32(b) >>> (32 - c);
    const span = 2 ** (32 - c);
    lo = lowerBound(sorted, r * span);
    hi = lowerBound(sorted, (r + 1) * span);
  }
  const out = sorted.slice(lo, hi);
  out.sort((a, x) => (a.h - x.h) || cmpStr(a.id, x.id));
  return out;
}

/** Rotierte Liste des Eimers von Tag D (Zyklus q = D >>> c, Start beim ersten Titel mit h ≥ imul(q, 0x9E3779B9)). */
export function rotation(sorted, C, D) {
  const list = bucket(sorted, C, D);
  if (list.length < 2) return list;
  const s = Math.imul(D >>> log2i(C), 0x9e3779b9) >>> 0;
  let start = 0;
  while (start < list.length && list[start].h < s) start++;
  if (start === list.length) start = 0;
  return start === 0 ? list : list.slice(start).concat(list.slice(0, start));
}

export function rotationWithBorrow(sorted, C, D) {
  return { home: rotation(sorted, C, D), borrow: C > 1 ? rotation(sorted, C, D + C / 2) : [] };
}
