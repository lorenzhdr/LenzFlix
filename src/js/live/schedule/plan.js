// LENZ LIVE Zeitplan: Planer für die Sender 1-16 und Kontext für Spezialsender (17/18, siehe specials.js).
//
// createContext(catalog, { channelConfig, getBoxSetItems, now }) → ctx (auch Basis für premiere.js / themeday.js):
//   ctx.catalog, ctx.getBoxSetItems
//   ctx.dayStart(D) → ms                  Sendetagsbeginn (gecacht)
//   ctx.shorts(D) → CatalogItem[]         kurze Titel (≤ 50 min) mit addedAt < dayStart(D), Hash-Reihenfolge (Füllprogramm)
//   ctx.builder(no, D, used?) → Builder   createDayBuilder aus fill.js, mit (lazy) shorts(D) und Hash-Schlüssel String(no)
//   ctx.seriesAt(D) → [{ s, v }]          Serien im Pool zum Stichtag dayStart(D) (v = Sicht, siehe series.js)
//   ctx.tools                             { dayStart, view(s, cut), block(s, wkey, k, b, dayOfK) } (series.js)
//   ctx.dayPool(D) → { cut, movies, series, medianYear, genres[5..16] }   Pool zum Stichtag (nur addedAt < dayStart(D))
//   ctx.channels(D) → Channel[18]
// Spezialsender-Einstieg: registerSpecial(17|18, { prepare?(ctx, Ds), planDay(ctx, D) }) aus specials.js.
import { GRID, MIN, HOUR, dayBounds, weekOf, weekStart, admitDay } from './time.js';
import { keyHash, bitrev32, cmpStr } from './hash.js';
import { normGenre } from './catalog.js';
import { maxAge } from './rating.js';
import { CAP_MS, bucketCount, makeEntries, bucket, rotationWithBorrow, streamOfAge } from './pool.js';
import { createDayBuilder, fillSegment, closedownDay, slotOf } from './fill.js';
import { createSeriesTools } from './series.js';

const SHORT_MAX = 50 * MIN;
const MIN_POOL = 2 * HOUR;
const T_A = 16 * HOUR;
const T_B = 5 * HOUR;
const SLOT_END = 21 * HOUR; // Sender 3: feste Sendeplätze nur in [dayStart, dayStart + 21 h)
const B_SLOT_CAP = 4 * HOUR; // 22:00 bis 02:00
const FIXED = {
  1: { key: 'kino', name: 'LIVE Kino', kind: 'movies' },
  2: { key: 'klassik', name: 'LIVE Klassik', kind: 'movies' },
  3: { key: 'serie', name: 'LIVE Serie', kind: 'series' },
  4: { key: 'marathon', name: 'LIVE Marathon', kind: 'series' },
  17: { key: 'premiere', name: 'LIVE Premiere', kind: 'special' },
  18: { key: 'thema', name: 'LIVE Thementag', kind: 'special' },
};

/** channelConfig ({5:'Action'} oder '5=Action;6=Komödie') → Map<Platz 5-16, normalisiertes Genre>. */
export function parseChannelConfig(cfg) {
  const out = new Map();
  let pairs = [];
  if (typeof cfg === 'string') {
    pairs = cfg.split(';').map((p) => { const i = p.indexOf('='); return i < 0 ? null : [p.slice(0, i), p.slice(i + 1)]; }).filter(Boolean);
  } else if (cfg && typeof cfg === 'object') pairs = Object.keys(cfg).map((k) => [k, cfg[k]]);
  for (const [k, v] of pairs) {
    const no = Number(String(k).trim());
    const g = normGenre(v);
    if (Number.isInteger(no) && no >= 5 && no <= 16 && g) out.set(no, g);
  }
  return out;
}

export function createContext(catalog, opts = {}) {
  const tools = createSeriesTools();
  const { dayStart } = tools;
  const config = parseChannelConfig(opts.channelConfig);
  const knownGenres = new Set(catalog.genres.map((g) => g.norm));
  const pools = new Map();
  const shortsCache = new Map();
  const seriesCache = new Map();

  // Statische Hash-Reihenfolge der kurzen Titel (bitrev32(h); Gleichstand: Katalogreihenfolge, selbst eingabeunabhängig).
  const allShorts = (() => {
    const list = [];
    for (const m of catalog.movies) if (m.durMs <= SHORT_MAX) list.push(m);
    for (const s of catalog.series) for (const e of s.eps) if (e.durMs <= SHORT_MAX) list.push(e);
    const keys = new Float64Array(list.length);
    for (let i = 0; i < list.length; i++) keys[i] = bitrev32(keyHash('fill', list[i].id)) * 2097152 + i;
    keys.sort();
    const items = Array.from(keys, (k) => list[k % 2097152]);
    // wirksames addedAt (Folge: spätere von Folge und Serie), parallel zu items
    const eff = new Float64Array(items.length);
    for (let i = 0; i < items.length; i++) eff[i] = items[i].kind === 'movie' ? items[i].addedAt : Math.max(items[i].addedAt, catalog.items.get(items[i].seriesId).addedAt);
    return { items, eff };
  })();

  function shorts(D) {
    let v = shortsCache.get(D);
    if (!v) {
      const cut = dayStart(D);
      v = [];
      for (let i = 0; i < allShorts.items.length; i++) if (allShorts.eff[i] < cut) v.push(allShorts.items[i]);
      shortsCache.set(D, v);
    }
    return v;
  }

  function seriesAt(D) {
    let v = seriesCache.get(D);
    if (!v) {
      const cut = dayStart(D);
      v = [];
      for (const s of catalog.series) { const view = tools.view(s, cut); if (view) v.push({ s, v: view }); }
      seriesCache.set(D, v);
    }
    return v;
  }

  /** Pool zum Stichtag, Genre-Belegung der Plätze 5-16 und Genre-Zuordnung (jeder Titel auf genau einem Genre-Sender). */
  function dayPool(D) {
    let P = pools.get(D);
    if (P) return P;
    const cut = dayStart(D);
    const movies = catalog.movies.filter((m) => m.addedAt < cut);
    const series = seriesAt(D);
    const years = movies.map((m) => m.year).filter((y) => y != null).sort((a, b) => a - b);
    const medianYear = years.length ? years[Math.floor((years.length - 1) / 2)] : null;
    const counts = new Map();
    for (const t of movies) for (const g of t.genres) counts.set(g, (counts.get(g) || 0) + 1);
    for (const { s } of series) for (const g of s.genres) counts.set(g, (counts.get(g) || 0) + 1);
    const top = [...counts].sort((a, b) => (b[1] - a[1]) || cmpStr(a[0], b[0])).map((x) => x[0]);
    const genres = new Array(17).fill(null);
    const reserved = new Set();
    for (let p = 5; p <= 16; p++) {
      const g = config.get(p);
      if (g && knownGenres.has(g) && !reserved.has(g)) { genres[p] = g; reserved.add(g); }
    }
    let ti = 0;
    for (let p = 5; p <= 16; p++) {
      if (genres[p]) continue;
      while (ti < top.length && reserved.has(top[ti])) ti++;
      if (ti < top.length) genres[p] = top[ti++];
    }
    const places = [];
    for (let p = 5; p <= 16; p++) if (genres[p]) places.push(p);
    const gMovies = new Map();
    const gSeries = new Map();
    for (const p of places) { gMovies.set(p, []); gSeries.set(p, []); }
    const assign = (id, tGenres) => {
      const fit = places.filter((p) => tGenres.includes(genres[p]));
      return fit.length ? fit[keyHash('genre', id) % fit.length] : 0;
    };
    for (const m of movies) { const p = assign(m.id, m.genres); if (p) gMovies.get(p).push(m); }
    for (const sv of series) { const p = assign(sv.s.id, sv.s.genres); if (p) gSeries.get(p).push(sv); }
    P = { cut, movies, series, medianYear, genres, gMovies, gSeries, chPools: new Map(), chList: null };
    pools.set(D, P);
    return P;
  }

  function channels(D) {
    const P = dayPool(D);
    if (P.chList) return P.chList;
    const list = [];
    for (let no = 1; no <= 18; no++) {
      if (FIXED[no]) list.push({ no, ...FIXED[no] });
      else {
        const g = P.genres[no];
        list.push(g ? { no, key: 'genre:' + g, name: 'LIVE ' + catalog.genreLabel(g), kind: 'genre', genreLabel: catalog.genreLabel(g) } : { no, key: 'genre:', name: 'LIVE ' + no, kind: 'genre' });
      }
    }
    P.chList = Object.freeze(list.map((c) => Object.freeze(c)));
    return P.chList;
  }

  function builder(no, D, used) {
    return createDayBuilder({ D, used, shorts: () => shorts(D), key: String(no) });
  }

  // ---- Sender 1, 2, 5-16: Mischsender mit Eimer-Rotation ------------------------------------------------------

  /** Pool eines Senders: { A, B: Entry[] (nach bitrev(h)), totalMs, key } */
  function poolOf(no, D) {
    const P = dayPool(D);
    let cp = P.chPools.get(no);
    if (cp) return cp;
    let key;
    let movies = [];
    let series = [];
    if (no === 1 || no === 2) {
      key = no === 1 ? 'kino' : 'klassik';
      const med = P.medianYear;
      movies = P.movies.filter((m) => (m.year == null || med == null || m.year >= med) === (no === 1));
    } else {
      const g = P.genres[no];
      key = 'genre:' + (g || '');
      if (g) { movies = P.gMovies.get(no); series = P.gSeries.get(no); }
    }
    const items = movies.map((m) => ({ id: m.id, movie: m })).concat(series.map((sv) => ({ id: sv.s.id, s: sv.s, v: sv.v })));
    const msOf = (w) => (w.movie ? w.movie.durMs : w.v.aufMs);
    const ageOf = (w) => (w.movie ? w.movie.age : w.v.age);
    const a = items.filter((w) => streamOfAge(ageOf(w)) === 'A');
    const b = items.filter((w) => streamOfAge(ageOf(w)) === 'B');
    let totalMs = 0;
    for (const m of movies) totalMs += m.durMs;
    for (const sv of series) totalMs += sv.v.totalMs;
    cp = { key, totalMs, A: makeEntries(key, a, msOf), B: makeEntries(key, b, msOf) };
    P.chPools.set(no, cp);
    return cp;
  }

  const poolMs = (entries) => entries.reduce((x, e) => x + e.ms, 0);

  function candOf(D, entry, C, borrowed) {
    const w = entry.it;
    if (w.movie) {
      const m = w.movie;
      return { id: m.id, movie: true, size: slotOf(m.durMs), pieces: [{ itemId: m.id, durMs: m.durMs, age: m.age }] };
    }
    const { s, v } = w;
    const base = Math.floor(v.admit / C);
    const k0 = Math.floor(D / C) - base;
    const k = borrowed ? Math.max(0, k0 - 1) : k0;
    const eps = tools.block(s, s.id + '|m|' + C + '|' + v.admit + '|' + v.b, k, v.b, (kk) => Math.max(v.admit, (base + kk) * C));
    const pieces = eps.map((e) => ({ itemId: e.id, durMs: e.durMs, seriesId: s.id, age: v.age, ...(borrowed ? { rerun: true } : {}) }));
    return { id: s.id, movie: false, size: pieces.reduce((x, p) => x + slotOf(p.durMs), 0), pieces };
  }

  function streamCands(D, sorted, cap) {
    if (!sorted.length) return [];
    const C = bucketCount(poolMs(sorted), cap);
    const { home, borrow } = rotationWithBorrow(sorted, C, D);
    return home.map((e) => candOf(D, e, C, false)).concat(borrow.map((e) => candOf(D, e, C, true)));
  }

  function planMixed(no, D) {
    const cp = poolOf(no, D);
    if (cp.totalMs < MIN_POOL) return closedownDay(D, 'empty');
    const B = builder(no, D);
    const b = B.bounds;
    const candsA = streamCands(D, cp.A, CAP_MS.A);
    const candsB = streamCands(D, cp.B, CAP_MS.B);
    const anchor = candsA.find((c) => c.movie && b.a2015 + c.size <= b.end);
    if (anchor) {
      fillSegment(B, candsA.filter((c) => c !== anchor), { limit: b.a2015, strict: true });
      B.placeBlock(anchor.pieces);
    }
    fillSegment(B, candsA, { limit: b.a2200, strict: false });
    fillSegment(B, candsB, { limit: b.end, strict: true });
    return B.finish();
  }

  // ---- Sender 3: feste Wochen-Sendeplätze -----------------------------------------------------------------------

  const weekTables = new Map();

  /** Slot-Tabelle der Woche W: [{ s, v, off (ms ab dayStart), Cw, admitW }], A zuerst, dann B. Gleiche Wanduhrzeit Mo-So. */
  function weekTable(W) {
    let t = weekTables.get(W);
    if (t) return t;
    const Ws = weekStart(W);
    const svs = seriesAt(Ws);
    const slots = [];
    const streamsOf = { A: [], B: [] };
    for (const sv of svs) streamsOf[streamOfAge(sv.v.age)].push({ id: sv.s.id, s: sv.s, v: sv.v });
    let off = 0;
    for (const S of ['A', 'B']) {
      const sorted = makeEntries('serie', streamsOf[S], (w) => w.v.slotLen);
      const cap = S === 'A' ? CAP_MS.A : B_SLOT_CAP;
      const Cw = sorted.length ? bucketCount(poolMs(sorted), cap) : 1;
      const { home, borrow } = rotationWithBorrow(sorted, Cw, W);
      const list = home.concat(borrow);
      if (S === 'B') off = Math.max(off, CAP_MS.A);
      const deferred = [];
      for (const e of list) {
        const w = e.it;
        if (S === 'B' && w.v.age === 18 && off < 18 * HOUR) { deferred.push(e); continue; }
        if (off < (S === 'A' ? CAP_MS.A : SLOT_END) && off + w.v.slotLen <= SLOT_END) {
          slots.push({ s: w.s, v: w.v, off, Cw, admitW: weekOf(w.v.admit) });
          off += w.v.slotLen;
        }
      }
      if (S === 'B') {
        off = Math.max(off, 18 * HOUR);
        for (const e of deferred) {
          const w = e.it;
          if (off + w.v.slotLen <= SLOT_END) { slots.push({ s: w.s, v: w.v, off, Cw, admitW: weekOf(w.v.admit) }); off += w.v.slotLen; }
        }
      }
    }
    weekTables.set(W, (t = slots));
    return t;
  }

  function slotPieces(slot, D) {
    const { s, v, Cw, admitW } = slot;
    const W = weekOf(D);
    const baseW = Math.floor(admitW / Cw);
    const k = 7 * (Math.floor(W / Cw) - baseW) + (D - weekStart(W));
    const wkey = s.id + '|w|' + Cw + '|' + v.admit + '|' + v.b;
    const eps = tools.block(s, wkey, Math.max(0, k), v.b, (kk) => Math.max(v.admit, weekStart((baseW + Math.floor(kk / 7)) * Cw) + (kk % 7)));
    return eps.map((e) => ({ itemId: e.id, durMs: e.durMs, seriesId: s.id, age: v.age }));
  }

  function planSerie(no, D) {
    const table = weekTable(weekOf(D));
    if (!table.length) return closedownDay(D, 'empty');
    const B = builder(no, D);
    const b = B.bounds;
    for (const slot of table) {
      const start = b.start + slot.off;
      if (B.cursor < start) B.fillUntil(start);
      B.placeBlock(slotPieces(slot, D));
    }
    const nightStart = b.start + SLOT_END;
    if (B.cursor < nightStart) B.fillUntil(nightStart);
    // Nacht bis 05:00: Wiederholung der Folgen von gestern
    const prev = weekTable(weekOf(D - 1));
    const order = prev.filter((x) => x.off >= CAP_MS.A).concat(prev.filter((x) => x.off < CAP_MS.A));
    const cands = [];
    for (const slot of order) {
      const pieces = slotPieces(slot, D - 1).map((p) => ({ ...p, rerun: true }));
      if (pieces.length) cands.push({ id: slot.s.id, movie: false, pieces, size: pieces.reduce((x, p) => x + slotOf(p.durMs), 0) });
    }
    fillSegment(B, cands, { limit: b.end, strict: true });
    return B.finish();
  }

  // ---- Sender 4: Marathon ---------------------------------------------------------------------------------------

  /** Folgen des Marathon-Tags eines Stroms: [Ep], age. */
  function marathonStream(D, S, T) {
    const svs = seriesAt(D).filter((x) => streamOfAge(x.v.age) === S);
    if (!svs.length) return null;
    const sorted = makeEntries('marathon', svs.map((x) => ({ id: x.s.id, ...x })), () => 0);
    const m = sorted.length;
    let C = 1;
    while (C * 2 <= m) C *= 2;
    let bk = bucket(sorted, C, D);
    if (!bk.length && C > 1) bk = bucket(sorted, C, D + C / 2);
    for (let i = 1; !bk.length && i < C; i++) bk = bucket(sorted, C, D + i);
    if (!bk.length) bk = sorted;
    const q = D >>> (31 - Math.clz32(C));
    const first = bk[q % bk.length].it;
    const n = Math.floor(q / bk.length);
    const out = [];
    const v0 = first.v;
    if (v0.totalMs > T) {
      const lo = n * T;
      const hi = lo + T;
      for (let r = Math.floor(lo / v0.totalMs); r * v0.totalMs < hi; r++) {
        let g = r * v0.totalMs;
        for (const e of v0.eps) { if (g >= lo && g < hi) out.push(e); g += e.durMs; }
      }
    } else {
      const order = sorted.map((e) => e.it);
      let at = order.findIndex((w) => w.s === first.s);
      let total = 0;
      for (let i = 0; i < order.length && total < T; i++, at = (at + 1) % order.length) {
        const v = order[at].v;
        let off = 0;
        for (const e of v.eps) { if (total + off >= T) break; out.push(e); off += e.durMs; }
        total += off;
      }
    }
    return { eps: out, age: v0.age, seriesId: first.s.id };
  }

  function planMarathon(no, D) {
    if (!seriesAt(D).length) return closedownDay(D, 'empty');
    const B = builder(no, D);
    const b = B.bounds;
    const run = (st) => {
      for (const e of st.eps) {
        if (!B.placeBlock([{ itemId: e.id, durMs: e.durMs, seriesId: e.seriesId, age: st.age }])) break;
      }
    };
    const A = marathonStream(D, 'A', T_A);
    if (A) run(A);
    if (B.cursor < b.a2200) B.fillUntil(b.a2200);
    const S = marathonStream(D, 'B', T_B);
    if (S) {
      if (S.age === 18 && B.cursor < b.a2300) B.fillUntil(b.a2300);
      run(S);
    }
    return B.finish();
  }

  const ctx = {
    catalog, getBoxSetItems: opts.getBoxSetItems || (async () => []), tools, dayStart, shorts, builder, seriesAt, dayPool, channels,
    GRID, dayBounds, admitDay, maxAge, bitrev32,
  };

  function planBuiltin(no, D) {
    if (no === 1 || no === 2 || (no >= 5 && no <= 16)) return planMixed(no, D);
    if (no === 3) return planSerie(no, D);
    if (no === 4) return planMarathon(no, D);
    return closedownDay(D, 'empty');
  }

  return { ctx, channels, planBuiltin };
}
