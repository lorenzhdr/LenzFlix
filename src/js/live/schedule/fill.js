// LENZ LIVE Zeitplan: Tagesbaustein (Platzieren, Teilsummen-DP, Füller / Füllprogramm / Nachtfüllung).
//
// Öffentliche Hilfs-API (premiere.js / themeday.js bauen darauf):
//   slotOf(durMs) → ms                       auf 5 min aufgerundete Platzlänge
//   ageAllowed(age, start, bounds) → bool    Jugendschutz am Startzeitpunkt (≥16 ab a2200, 18 ab a2300, null/≤12 immer)
//   packSubset(sizesUnits[], capUnits) → number[]   Indizes (aufsteigend) der Teilmenge mit maximaler Summe ≤ cap (Gleichstand: frühere Kandidaten)
//   closedownDay(D, reason?) → PlanEntry[]   ganzer Tag Testbild (eingefroren)
//   createDayBuilder({ D, bounds?, used?, shorts?, key? }) → Builder
//     shorts: kurze Titel für Füllprogramm (CatalogItem[] oder () => CatalogItem[], lazy; Reihenfolge = Hash-Reihenfolge); key: Hash-Schlüssel (z. B. String(no))
//     Builder.cursor            aktuelle Zeit (Start = bounds.start, immer im 5-min-Raster ab dayStart)
//     Builder.bounds / .used    Tagesgrenzen / Set der bereits gesendeten itemIds (Sender × Tag)
//     Builder.canPlace(piece, { limit? }) / .place(piece, { limit?, type? }) → bool   piece = { itemId, durMs, seriesId?, rerun?, premiere?, theme?, age?, label? }
//         place hängt Programm (Ende start+durMs) und ggf. Rundungs-`filler` bis zum Slot-Ende an, Cursor rückt auf Slot-Ende.
//         Verweigert (false) bei: itemId schon benutzt, Slot-Ende > min(limit, dayEnd), Jugendschutz am Start verletzt.
//     Builder.canPlaceBlock(pieces, opts) / .placeBlock(pieces, opts) → bool   mehrere Stücke nacheinander, alles oder nichts
//     Builder.fillUntil(until)  Lücke [cursor, until) füllen: ≤ 30 min `filler`, sonst `fill` (bei until = dayEnd `nightfill`) mit kurzen
//                               Titeln, Rest ≤ 30 min / < 5 min `filler`; ohne passenden Titel `closedown` (reason 'empty')
//     Builder.waitUntil(t)      = fillUntil(t) (t > cursor)
//     Builder.closeRest(reason) Rest des Tages als `closedown`
//     Builder.finish() → PlanEntry[]   füllt bis dayEnd, prüft Lückenlosigkeit, friert ein
//   fillSegment(builder, cands, { limit, strict? })   Kandidaten { pieces[], size } nacheinander platzieren; strict (Standard): nichts überschreitet
//                               `limit`, ab Rest ≤ 4 h wählt eine Teilsummen-DP (≤ 40 Kandidaten) die maximale Füllung, danach fillUntil(limit);
//                               strict:false: platziert, solange cursor < limit (der letzte darf überlaufen, höchstens bis dayEnd)
import { GRID, MIN, HOUR, dayBounds } from './time.js';
import { keyHash } from './hash.js';

export const FILL_LABEL = 'Füllprogramm';
export const NIGHT_LABEL = 'Füllprogramm – reguläres Programm ab 5:00';
export const FILLER_MAX = 30 * MIN;
export const DP_HORIZON = 4 * HOUR;
export const DP_MAX_CANDS = 40;

export const slotOf = (durMs) => Math.ceil(durMs / GRID) * GRID;

export function ageAllowed(age, start, b) {
  if (age == null || age <= 12) return true;
  return age >= 18 ? start >= b.a2300 : start >= b.a2200;
}

/** Teilsummen-DP: Indizes (aufsteigend) mit maximaler Summe ≤ cap; bei Gleichstand werden frühere Kandidaten bevorzugt. */
export function packSubset(sizes, cap) {
  const n = sizes.length;
  cap = Math.max(0, Math.min(cap, 1200));
  if (!n || !cap) return [];
  const W = cap + 1;
  const suf = new Uint8Array((n + 1) * W);
  suf[n * W] = 1;
  for (let i = n - 1; i >= 0; i--) {
    const s = sizes[i];
    for (let c = 0; c <= cap; c++) suf[i * W + c] = suf[(i + 1) * W + c] || (s <= c && suf[(i + 1) * W + c - s]) ? 1 : 0;
  }
  let best = cap;
  while (best > 0 && !suf[best]) best--;
  const out = [];
  let rem = best;
  for (let i = 0; i < n && rem > 0; i++) {
    if (sizes[i] <= rem && suf[(i + 1) * W + rem - sizes[i]]) { out.push(i); rem -= sizes[i]; }
  }
  return out;
}

export function closedownDay(D, reason = 'empty') {
  const b = dayBounds(D);
  return Object.freeze([Object.freeze({ start: b.start, end: b.end, type: 'closedown', reason })]);
}

export function createDayBuilder({ D, bounds, used, shorts, key }) {
  const b = bounds || dayBounds(D);
  const usedSet = used || new Set();
  let list = shorts || [];
  const fkey = 'fill\u0001' + (key == null ? '' : key);
  const entries = [];
  let cursor = b.start;
  let fillCount = 0;

  function pushFiller(from, to, reason) {
    if (to <= from) return;
    const last = entries[entries.length - 1];
    if (last && last.type === 'filler' && last.end === from) last.end = to;
    else entries.push({ start: from, end: to, type: 'filler', reason });
  }

  function mkEntry(piece, start, type) {
    const e = { start, end: start + piece.durMs, type, itemId: piece.itemId };
    if (piece.seriesId) e.seriesId = piece.seriesId;
    if (piece.rerun) e.rerun = true;
    if (piece.premiere) e.premiere = piece.premiere;
    if (piece.theme) e.theme = piece.theme;
    if (piece.age != null) e.age = piece.age;
    if (piece.label) e.label = piece.label;
    else if (type === 'fill') e.label = FILL_LABEL;
    else if (type === 'nightfill') e.label = NIGHT_LABEL;
    return e;
  }

  function lim(opts) { return Math.min(opts && opts.limit != null ? opts.limit : b.end, b.end); }

  function canPlaceBlock(pieces, opts) {
    const limit = lim(opts);
    let s = cursor;
    const seen = new Set();
    for (const p of pieces) {
      if (!(p.durMs > 0) || usedSet.has(p.itemId) || seen.has(p.itemId)) return false;
      if (!ageAllowed(p.age, s, b)) return false;
      s += slotOf(p.durMs);
      if (s > limit) return false;
      seen.add(p.itemId);
    }
    return pieces.length > 0;
  }

  function placeBlock(pieces, opts) {
    if (!canPlaceBlock(pieces, opts)) return false;
    const type = (opts && opts.type) || 'program';
    for (const p of pieces) {
      const slot = slotOf(p.durMs);
      entries.push(mkEntry(p, cursor, type));
      usedSet.add(p.itemId);
      if (slot > p.durMs) pushFiller(cursor + p.durMs, cursor + slot, 'grid');
      cursor += slot;
    }
    return true;
  }

  function pickShort(gap) {
    if (typeof list === 'function') list = list() || [];
    const n = list.length;
    if (!n) return null;
    const off = keyHash(fkey, D + ':' + fillCount) % n;
    let best = null;
    let bestSlot = 0;
    let found = 0;
    for (let i = 0; i < n && found < 8; i++) {
      const it = list[(off + i) % n];
      if (usedSet.has(it.id)) continue;
      const slot = slotOf(it.durMs);
      if (slot > gap || !ageAllowed(it.age, cursor, b)) continue;
      found++;
      if (slot > bestSlot) { best = it; bestSlot = slot; }
    }
    return best;
  }

  function fillUntil(until) {
    until = Math.min(until, b.end);
    const atEnd = until === b.end;
    while (cursor < until) {
      const gap = until - cursor;
      if (gap <= FILLER_MAX) {
        pushFiller(cursor, until, atEnd ? 'end' : 'grid');
        cursor = until;
        break;
      }
      const it = pickShort(gap);
      if (!it) {
        entries.push({ start: cursor, end: until, type: 'closedown', reason: 'empty' });
        cursor = until;
        break;
      }
      fillCount++;
      placeBlock([{ itemId: it.id, durMs: it.durMs, seriesId: it.seriesId, age: it.age }], { limit: until, type: atEnd ? 'nightfill' : 'fill' });
    }
  }

  return {
    get cursor() { return cursor; },
    bounds: b,
    used: usedSet,
    canPlace: (piece, opts) => canPlaceBlock([piece], opts),
    place: (piece, opts) => placeBlock([piece], opts),
    canPlaceBlock,
    placeBlock,
    fillUntil,
    waitUntil: fillUntil,
    closeRest(reason = 'end') {
      if (cursor < b.end) entries.push({ start: cursor, end: b.end, type: 'closedown', reason });
      cursor = b.end;
    },
    finish() {
      if (cursor < b.end) fillUntil(b.end);
      return Object.freeze(entries.map((e) => Object.freeze(e)));
    },
  };
}

export function fillSegment(builder, cands, { limit, strict = true }) {
  const pending = cands.slice();
  const valid = (c, l) => builder.canPlaceBlock(c.pieces, { limit: l });
  const take = (c) => { pending.splice(pending.indexOf(c), 1); };
  if (!strict) {
    while (builder.cursor < limit) {
      const c = pending.find((x) => valid(x));
      if (!c) break;
      builder.placeBlock(c.pieces);
      take(c);
    }
    if (builder.cursor < limit) builder.fillUntil(limit);
    return;
  }
  while (builder.cursor < limit && limit - builder.cursor > DP_HORIZON) {
    const c = pending.find((x) => valid(x, limit));
    if (!c) break;
    builder.placeBlock(c.pieces, { limit });
    take(c);
  }
  if (builder.cursor < limit) {
    const cand = pending.filter((x) => valid(x, limit)).slice(0, DP_MAX_CANDS);
    const idx = packSubset(cand.map((c) => Math.round(c.size / GRID)), Math.floor((limit - builder.cursor) / GRID));
    for (const i of idx) { builder.placeBlock(cand[i].pieces, { limit }); take(cand[i]); }
    builder.fillUntil(limit);
  }
}

