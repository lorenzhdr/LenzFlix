// VIDEOTHEK LENZ · Figur (1.17.0): Mitgliedsausweis-Logik (rein, ohne three/DOM).
// Vertrag: .tmp/v117/contracts.md §4/§5/§7 (mc-Leitungsformat [1, no, since, rent, cine, stamps]).
import { CATALOG, TOTAL } from '../discover/catalog.js';
import { defaultCode } from './look2.js';

const DAY = 86400000;
const MAX_INT = 2147483647;
/** Stempelmaske: 31 Bit passen sicher in die Leitung (Ganzzahl bis 2^31-1). */
const MAX_BITS = 31;

export const dayNumber = (ms) => Math.floor(ms / DAY);

export function tierOf({ rent = 0, cine = 0, found = 0 } = {}) {
  const uses = (Number(rent) || 0) + (Number(cine) || 0);
  const f = Number(found) || 0;
  if (uses >= 20 && f >= 10) return 'gold';
  if (uses >= 5 && f >= 4) return 'silver';
  return 'bronze';
}

const idsOf = (found) => (found instanceof Set ? [...found] : Array.isArray(found) ? found : found && typeof found === 'object' ? Object.keys(found) : []);

/** Bit i = Index i im CATALOG. */
export function stampsMask(foundIds) {
  const set = new Set(idsOf(foundIds));
  let mask = 0;
  const n = Math.min(CATALOG.length, MAX_BITS);
  for (let i = 0; i < n; i++) if (set.has(CATALOG[i].id)) mask += 2 ** i;
  return mask;
}

export function foundFromMask(mask) {
  const m = Number.isInteger(mask) && mask >= 0 ? mask : 0;
  const out = [];
  const n = Math.min(CATALOG.length, MAX_BITS);
  for (let i = 0; i < n; i++) if (Math.floor(m / 2 ** i) % 2 === 1) out.push(CATALOG[i].id);
  return out;
}

const sumObj = (o) => {
  let s = 0;
  if (o && typeof o === 'object') for (const k of Object.keys(o)) { const v = Number(o[k]); if (Number.isFinite(v) && v > 0) s += Math.floor(v); }
  return s;
};

/** Profil-`cnt` (je Gerät) → Summen. */
export function sumCounts(cnt) {
  const c = cnt && typeof cnt === 'object' ? cnt : {};
  return { rent: sumObj(c.rent), cine: sumObj(c.cine) };
}

/** Frühester Tag: kleinste Entdeckungszeit bzw. mem.since. Ohne beides: heute (`now`). */
export function memberSince(profile, now = Date.now()) {
  const p = profile || {};
  let best = Infinity;
  if (p.disc && typeof p.disc === 'object') {
    for (const k of Object.keys(p.disc)) { const t = Number(p.disc[k]); if (Number.isFinite(t) && t > 0) best = Math.min(best, dayNumber(t)); }
  }
  const s = p.mem && Number(p.mem.since);
  if (Number.isFinite(s) && s > 0) best = Math.min(best, Math.floor(s));
  return Number.isFinite(best) ? best : dayNumber(now);
}

export function formatNo(no) {
  const s = String(no == null ? '' : no).replace(/\D/g, '');
  return s.padStart(6, '0');
}

export function formatDay(day) {
  const d = new Date((Number(day) || 0) * DAY);
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getUTCDate()) + '.' + p(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear();
}

export function cardData(profile, { name = null, showName = false, code = null, foundIds = null, now } = {}) {
  const p = profile || {};
  const ids = foundIds != null ? idsOf(foundIds) : p.disc ? Object.keys(p.disc) : [];
  const known = new Set(CATALOG.map((e) => e.id));
  const found = ids.filter((id) => known.has(id));
  const { rent, cine } = sumCounts(p.cnt);
  return {
    name: showName && name ? String(name) : null,
    no: formatNo(p.mem && p.mem.no),
    since: memberSince(p, now),
    rent,
    cine,
    stamps: stampsMask(found),
    total: TOTAL,
    tier: tierOf({ rent, cine, found: new Set(found).size }),
    code: Array.isArray(code) ? code : defaultCode(),
  };
}

export function toWire(card) {
  const c = card || {};
  const n = (v) => { const x = Math.floor(Number(v)); return Number.isFinite(x) ? Math.min(MAX_INT, Math.max(0, x)) : 0; };
  return [1, n(Number(c.no)), n(c.since), n(c.rent), n(c.cine), n(c.stamps)];
}

const popcount = (m) => { let c = 0; for (let i = 0; i < MAX_BITS; i++) if (Math.floor(m / 2 ** i) % 2 === 1) c++; return c; };

/** Leitung → CardData (ohne Namen/Code) oder null bei Müll. Länge 2..12, nur die ersten 6 Felder zählen. */
export function fromWire(arr) {
  if (!Array.isArray(arr) || arr.length < 2 || arr.length > 12) return null;
  for (const v of arr) if (!Number.isInteger(v) || v < 0 || v > MAX_INT) return null;
  if (arr[0] < 1) return null;
  const [, no, since = 0, rent = 0, cine = 0, stamps = 0] = arr;
  return { name: null, no: formatNo(no), since, rent, cine, stamps, total: TOTAL, tier: tierOf({ rent, cine, found: popcount(stamps) }), code: null };
}

/** Sperre „je Titel einmal pro Tag“: `last` = { itemId: dayNumber }, höchstens 50 Einträge. */
export function countOnce(last, itemId, day) {
  const l = last && typeof last === 'object' ? last : {};
  if (!itemId || l[itemId] === day) return { ok: false, last: l };
  const next = { ...l };
  delete next[itemId];
  next[itemId] = day;
  const keys = Object.keys(next);
  if (keys.length > 50) {
    const drop = keys.sort((a, b) => next[a] - next[b] || 0).slice(0, keys.length - 50);
    for (const k of drop) if (k !== itemId) delete next[k];
  }
  return { ok: true, last: next };
}
