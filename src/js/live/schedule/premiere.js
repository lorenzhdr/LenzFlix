// LENZ LIVE Zeitplan: Sender 17 „LIVE Premiere“ (registerSpecial(17, …), siehe specials.js).
//
// Einheiten: ein Film = 1 Einheit; neue Folgen einer Serie vom selben Sendetag (addedAt) in Folgenreihenfolge zu Blöcken
// (höchstens 3 Folgen, ~2 h). Premieren-Kette (unabhängig vom berechneten Tag, pro Katalog memoisiert): alle Einheiten mit
// addedDay ≥ EPOCH nach (addedAt, id); Kandidat = max(addedDay + 1, vorherigePremiere + 1); liegt er mehr als MAX_WAIT_DAYS
// Tage nach dem frühesten Tag (addedDay + 1), wird die Einheit verworfen (keine Premiere, Kette rückt nicht weiter).
// Tagesplan: Premiere 20:15 (Alter 16: 22:00, 18: 23:00, dann um 20:15 eine Wiederholung), Rest = Wiederholungen aus dem
// Pool der Neuzugänge im Fenster W (30, 60, … 365 Tage, kleinstes mit ≥ 24 h), Eimer-Rotation (Schlüssel 'premiere').
import { HOUR, dayOfDate, broadcastDayOf } from './time.js';
import { registerSpecial } from './specials.js';
import { makeEntries, bucketCount, rotationWithBorrow, streamOfAge, CAP_MS } from './pool.js';
import { slotOf, fillSegment } from './fill.js';
import { cmpStr } from './hash.js';

export const EPOCH = dayOfDate(2026, 10, 1); // 01.11.2026
export const MAX_WAIT_DAYS = 15; // Premiere höchstens am 15. Tag nach dem Hinzufügen (addedDay + 1 … addedDay + 15)
export const BLOCK_MAX_EPS = 3;
export const BLOCK_MAX_MS = 2 * HOUR;
const MIN_POOL_MS = 24 * HOUR;
const WINDOWS = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 365];

const infos = new WeakMap(); // Katalog → { units, byDay: Map<Tag, Einheit>, pday: Map<id, Tag> }

function mkUnit(id, kind, addedAt, items) {
  let age = null;
  let ms = 0;
  for (const it of items) {
    if (it.age != null && (age == null || it.age > age)) age = it.age;
    ms += it.durMs;
  }
  return { id, kind, addedAt, day: broadcastDayOf(addedAt), items, age, ms };
}

function buildInfo(catalog) {
  let info = infos.get(catalog);
  if (info) return info;
  const units = [];
  for (const m of catalog.movies) units.push(mkUnit(m.id, 'film', m.addedAt, [m]));
  for (const s of catalog.series) {
    const byDay = new Map();
    for (const e of s.eps) {
      const at = Math.max(e.addedAt, s.addedAt);
      const d = broadcastDayOf(at);
      let g = byDay.get(d);
      if (!g) byDay.set(d, (g = []));
      g.push({ e, at });
    }
    for (const g of byDay.values()) {
      let cur = [];
      let sum = 0;
      const flush = () => {
        if (!cur.length) return;
        units.push(mkUnit(cur[0].e.id, 'episode', Math.min(...cur.map((x) => x.at)), cur.map((x) => x.e)));
        cur = [];
        sum = 0;
      };
      for (const x of g) {
        const slot = slotOf(x.e.durMs);
        if (cur.length && (cur.length >= BLOCK_MAX_EPS || sum + slot > BLOCK_MAX_MS)) flush();
        cur.push(x);
        sum += slot;
      }
      flush();
    }
  }
  units.sort((a, b) => (a.addedAt - b.addedAt) || cmpStr(a.id, b.id));
  const byDay = new Map();
  const pday = new Map();
  let prev = -Infinity;
  for (const u of units) {
    if (u.day < EPOCH) continue;
    const cand = Math.max(u.day + 1, prev + 1);
    if (cand > u.day + MAX_WAIT_DAYS) continue; // definiert verworfen
    byDay.set(cand, u);
    pday.set(u.id, cand);
    prev = cand;
  }
  info = { units, byDay, pday };
  infos.set(catalog, info);
  return info;
}

/** Pool der Wiederholungen zum Tag D (nur bereits sendbare Einheiten, keine künftigen Premieren), Fenster-Verlängerung. */
function rerunPool(info, D) {
  const avail = info.units.filter((u) => u.day < D && !(info.pday.has(u.id) && info.pday.get(u.id) >= D));
  for (const W of WINDOWS) {
    let ms = 0;
    for (const u of avail) if (u.day >= D - W) ms += u.ms;
    if (ms >= MIN_POOL_MS || W === 365) return avail.filter((u) => u.day >= D - W);
  }
  return [];
}

const piecesOf = (u, extra) => u.items.map((it) => {
  const p = { itemId: it.id, durMs: it.durMs, age: it.age, ...extra };
  if (it.seriesId) p.seriesId = it.seriesId;
  return p;
});

function candOf(u) {
  const pieces = piecesOf(u, { rerun: true });
  return { id: u.id, movie: u.kind === 'film', size: pieces.reduce((x, p) => x + slotOf(p.durMs), 0), pieces };
}

function streamCands(pool, S, D) {
  if (!pool.length) return [];
  const sorted = makeEntries('premiere', pool, (u) => u.ms);
  const C = bucketCount(sorted.reduce((x, e) => x + e.ms, 0), CAP_MS[S]);
  const { home, borrow } = rotationWithBorrow(sorted, C, D);
  return home.concat(borrow).map((e) => candOf(e.it));
}

export const premiereImpl = {
  planDay(ctx, D) {
    const info = buildInfo(ctx.catalog);
    const P = info.byDay.get(D) || null;
    const pool = rerunPool(info, D);
    const candsA = streamCands(pool.filter((u) => streamOfAge(u.age) === 'A'), 'A', D);
    const candsB = streamCands(pool.filter((u) => streamOfAge(u.age) === 'B'), 'B', D);
    const B = ctx.builder(17, D);
    const b = B.bounds;
    const premPieces = P ? piecesOf(P, P.kind === 'film' ? { premiere: 'film' } : { premiere: 'episode', label: 'Neue Folge' }) : null;
    const late = P && P.age != null && P.age > 12;
    if (late) {
      const at = P.age >= 18 ? b.a2300 : b.a2200;
      const anchor = candsA.find((c) => c.size <= b.a2200 - b.a2015);
      fillSegment(B, candsA.filter((c) => c !== anchor), { limit: b.a2015, strict: true });
      if (anchor) B.placeBlock(anchor.pieces, { limit: b.a2200 });
      fillSegment(B, candsA, { limit: b.a2200, strict: true });
      if (at > b.a2200) fillSegment(B, candsB, { limit: at, strict: true });
      if (B.cursor < at) B.fillUntil(at);
      B.placeBlock(premPieces);
      fillSegment(B, candsB, { limit: b.end, strict: true });
      return B.finish();
    }
    const anchorMovie = P ? null : candsA.find((c) => c.movie && b.a2015 + c.size <= b.end);
    fillSegment(B, candsA.filter((c) => c !== anchorMovie), { limit: b.a2015, strict: true });
    if (P) B.placeBlock(premPieces);
    else if (anchorMovie) B.placeBlock(anchorMovie.pieces);
    fillSegment(B, candsA, { limit: b.a2200, strict: false });
    fillSegment(B, candsB, { limit: b.end, strict: true });
    return B.finish();
  },
};

/** Premieren-Kette des Katalogs (Tag → Einheit-Id), nur für Tests/Diagnose. */
export function premiereChain(catalog) {
  const { byDay } = buildInfo(catalog);
  return new Map([...byDay].map(([d, u]) => [d, u.id]));
}

registerSpecial(17, premiereImpl);
