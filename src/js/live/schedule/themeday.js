// LENZ LIVE Zeitplan: Sender 18 „LIVE Thementag“ (registerSpecial(18, …), siehe specials.js).
//
// Arten: boxset (Filmreihe, Sammlungs-Inhalte per ctx.getBoxSetItems, async in prepare()), decade (≥ 6 h), pilot (erste Folgen),
// overlength (Filme ab 150 min). Art des Tages: Permutation der verfügbaren Arten per hash(Woche), zyklisch über die 7 Tage
// (nie dieselbe Art an zwei aufeinanderfolgenden Tagen der Woche, außer bei nur einer Art). Ist die Art am Tag D nicht planbar,
// gilt die nächste Art der Permutation; ist keine planbar, folgt nur Füllprogramm/Nachtfüllung.
// Tagesplan: Thema chronologisch, Jugendschutz hat Vorrang (A-Titel bis 22:00, B-Titel ab 22:00/23:00); reicht das Material
// nicht für den Tag, kommt ein zweites Thema (nächste Art) dahinter, danach Füllung. planDay ist synchron und nutzt nur den Cache.
import { HOUR, dayBounds, weekOf, weekStart } from './time.js';
import { registerSpecial } from './specials.js';
import { makeEntries, bucketCount, rotation, rotationWithBorrow, streamOfAge } from './pool.js';
import { slotOf } from './fill.js';
import { keyHash, cmpStr } from './hash.js';

export const KINDS = ['boxset', 'decade', 'pilot', 'overlength'];
export const OVERLENGTH_MS = 150 * 60000;
export const DECADE_MIN_MS = 6 * HOUR;
const MIN_ITEMS = 2;
const MIN_PILOTS = 3;
const MAX_LOADS_PER_DAY = 12;
const DAY_CAP_MS = 24 * HOUR;

const states = new WeakMap(); // ctx → { boxsets: Map<id, string[]|null>, themes: Map<'kind|D', Theme|null> }
const stateOf = (ctx) => { let s = states.get(ctx); if (!s) states.set(ctx, (s = { boxsets: new Map(), themes: new Map() })); return s; };

const numCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** Chronologisch: Jahr, Premierendatum, Staffel, Folge, id (fehlende Werte zuletzt). */
function chrono(a, b) {
  return numCmp(a.year ?? 9999, b.year ?? 9999) || numCmp(a.premiere ?? Infinity, b.premiere ?? Infinity)
    || numCmp(a.season ?? 0, b.season ?? 0) || numCmp(a.episode ?? 0, b.episode ?? 0) || cmpStr(a.id, b.id);
}

/** Alle Kandidaten (Objekte mit id) in Rotationsreihenfolge für Tag D: eigener Eimer zuerst, dann die folgenden. */
function rotated(key, items, D) {
  if (!items.length) return [];
  const sorted = makeEntries(key, items, () => 1);
  const C = bucketCount(sorted.length, 2);
  const out = [];
  const seen = new Set();
  for (let i = 0; i < C; i++) for (const e of rotation(sorted, C, D + i)) if (!seen.has(e.id)) { seen.add(e.id); out.push(e.it); }
  return out;
}

/** Teilmenge von items für den Tag (Hash-Rotation, bis ~24 h), chronologisch sortiert. */
function pickDay(items, key, D) {
  const ms = (it) => slotOf(it.durMs);
  const total = items.reduce((x, it) => x + ms(it), 0);
  let sel = items;
  if (total > DAY_CAP_MS) {
    const sorted = makeEntries(key, items, ms);
    const C = bucketCount(total, DAY_CAP_MS);
    const { home, borrow } = rotationWithBorrow(sorted, C, D);
    sel = [];
    let sum = 0;
    for (const e of home.concat(borrow)) { if (sum >= DAY_CAP_MS) break; sel.push(e.it); sum += ms(e.it); }
  }
  return sel.slice().sort(chrono);
}

/** Pool zum Tag D: Filme und Serienfolgen mit addedAt < dayStart(D). */
function poolOf(ctx, D) {
  const cut = ctx.dayStart(D);
  const movies = ctx.catalog.movies.filter((m) => m.addedAt < cut);
  const eps = [];
  const pilots = [];
  for (const { v } of ctx.seriesAt(D)) {
    for (const e of v.eps) eps.push(e);
    pilots.push(v.eps.find((e) => e.season === 1 && e.episode === 1) || v.eps[0]);
  }
  return { cut, movies, eps, pilots };
}

const decadeName = (dec) => (dec >= 2000 || dec < 1900 ? 'Die ' + dec + 'er' : 'Die ' + (dec - 1900) + 'er');

/** Planbare Titel einer Sammlung zum Tag D (Filme/Folgen im Pool, einmalig). */
function boxsetItems(ctx, ids, D) {
  const cut = ctx.dayStart(D);
  const out = [];
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const it = ctx.catalog.items.get(id);
    if (!it) continue;
    if (it.kind === 'movie') { if (it.addedAt < cut) out.push(it); }
    else if (it.kind === 'episode') {
      const s = ctx.catalog.items.get(it.seriesId);
      if (s && Math.max(it.addedAt, s.addedAt) < cut) out.push(it);
    }
  }
  return out;
}

const boxsetCands = (ctx, D) => rotated('themeday:boxset', ctx.catalog.boxsets.filter((x) => x.childCount >= 2), D);

function computeTheme(ctx, kind, D) {
  if (kind === 'boxset') {
    const cache = stateOf(ctx).boxsets;
    for (const c of boxsetCands(ctx, D)) {
      const ids = cache.get(c.id);
      if (!ids) continue;
      const items = boxsetItems(ctx, ids, D);
      if (items.length >= MIN_ITEMS) return { kind, name: 'Filmreihe: ' + c.name, items: items.sort(chrono) };
    }
    return null;
  }
  const P = poolOf(ctx, D);
  if (kind === 'overlength') {
    const items = P.movies.filter((m) => m.durMs >= OVERLENGTH_MS);
    return items.length >= MIN_ITEMS ? { kind, name: 'Überlänge', items: pickDay(items, 'themeday:overlength', D) } : null;
  }
  if (kind === 'pilot') {
    return P.pilots.length >= MIN_PILOTS ? { kind, name: 'Pilotfolgen-Tag', items: pickDay(P.pilots, 'themeday:pilot', D) } : null;
  }
  if (kind === 'decade') {
    const byDec = new Map();
    for (const it of P.movies.concat(P.eps)) {
      if (it.year == null) continue;
      const dec = Math.floor(it.year / 10) * 10;
      let g = byDec.get(dec);
      if (!g) byDec.set(dec, (g = { id: String(dec), dec, items: [], ms: 0 }));
      g.items.push(it);
      g.ms += it.durMs;
    }
    const cands = [...byDec.values()].filter((g) => g.ms >= DECADE_MIN_MS);
    const first = rotated('themeday:decade', cands, D)[0];
    return first ? { kind, name: decadeName(first.dec), items: pickDay(first.items, 'themeday:decade:' + first.dec, D) } : null;
  }
  return null;
}

function themeFor(ctx, kind, D) {
  const memo = stateOf(ctx).themes;
  const key = kind + '|' + D;
  if (!memo.has(key)) memo.set(key, computeTheme(ctx, kind, D));
  return memo.get(key);
}

/** Verfügbare Arten der Woche W in Permutationsreihenfolge (hash(W)). Boxset: sobald eine Sammlung geladen und ≥ 2 Titel hat. */
function weekOrder(ctx, W) {
  const D0 = weekStart(W);
  const cache = stateOf(ctx).boxsets;
  const avail = KINDS.filter((k) => {
    if (k === 'boxset') {
      for (const ids of cache.values()) if (ids && boxsetItems(ctx, ids, D0 + 6).length >= MIN_ITEMS) return true;
      return false;
    }
    return themeFor(ctx, k, D0) != null;
  });
  return avail.map((k) => ({ k, h: keyHash('themeday', W + ':' + k) }))
    .sort((a, b) => (a.h - b.h) || cmpStr(a.k, b.k)).map((x) => x.k);
}

/** Themen des Tages: [erstes, ggf. zweites]. */
function themesFor(ctx, D) {
  const order = weekOrder(ctx, weekOf(D));
  const n = order.length;
  if (!n) return [];
  const i = D - weekStart(weekOf(D));
  const out = [];
  for (let j = 0; j < n && out.length < 2; j++) {
    const th = themeFor(ctx, order[(i + j) % n], D);
    if (th) out.push(th);
    if (out.length === 1) {
      const b = dayBounds(D);
      if (th && th.items.reduce((x, it) => x + slotOf(it.durMs), 0) >= b.end - b.start - HOUR) break;
    }
  }
  return out;
}

function planThemes(ctx, D, themes) {
  const B = ctx.builder(18, D);
  const b = B.bounds;
  const A = [];
  const Bq = [];
  const seen = new Set();
  for (const th of themes) {
    for (const it of th.items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      (streamOfAge(it.age) === 'A' ? A : Bq).push({ it, theme: th.name });
    }
  }
  const piece = (x) => ({ itemId: x.it.id, durMs: x.it.durMs, seriesId: x.it.seriesId, age: x.it.age, theme: x.theme });
  while (B.cursor < b.end && (A.length || Bq.length)) {
    const lists = B.cursor >= b.a2200 ? [Bq, A] : [A, Bq];
    let done = false;
    for (const list of lists) {
      const i = list.findIndex((x) => B.canPlace(piece(x)));
      if (i >= 0) { B.place(piece(list[i])); list.splice(i, 1); done = true; break; }
    }
    if (done) continue;
    const gate = Bq.length ? (B.cursor < b.a2200 ? b.a2200 : B.cursor < b.a2300 ? b.a2300 : 0) : 0;
    if (!gate) break;
    B.fillUntil(gate);
  }
  return B.finish();
}

export const themedayImpl = {
  /** Lädt die Sammlungs-Inhalte, die für die Tage Ds gebraucht werden (sequentiell, mit Cache; Fehler → Kandidat überspringen). */
  async prepare(ctx, Ds) {
    const cache = stateOf(ctx).boxsets;
    const days = [...new Set((Array.isArray(Ds) ? Ds : []).filter(Number.isInteger))].sort((a, b) => a - b);
    for (const D of days) {
      let loads = 0;
      for (const c of boxsetCands(ctx, D)) {
        if (!cache.has(c.id)) {
          if (loads++ >= MAX_LOADS_PER_DAY) break;
          try {
            const r = await ctx.getBoxSetItems(c.id);
            cache.set(c.id, Array.isArray(r) ? r.map(String) : null);
          } catch { cache.set(c.id, null); }
          // neue Daten können früher berechnete Themen ändern
          stateOf(ctx).themes.clear();
        }
        const ids = cache.get(c.id);
        if (ids && boxsetItems(ctx, ids, D).length >= MIN_ITEMS) break;
      }
    }
  },
  planDay(ctx, D) {
    return planThemes(ctx, D, themesFor(ctx, D));
  },
};

registerSpecial(18, themedayImpl);
