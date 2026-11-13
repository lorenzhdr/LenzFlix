(() => {
  // src/js/live/schedule/time.js
  var MIN = 6e4;
  var HOUR = 36e5;
  var GRID = 3e5;
  var lastSun = (y, m) => {
    const d = new Date(Date.UTC(y, m + 1, 0));
    return d.getUTCDate() - d.getUTCDay();
  };
  var offsetMs = (u) => {
    const y = new Date(u).getUTCFullYear();
    const s = Date.UTC(y, 2, lastSun(y, 2), 1);
    const e = Date.UTC(y, 9, lastSun(y, 9), 1);
    return (u >= s && u < e ? 2 : 1) * 36e5;
  };
  var wallToUtc = (D, min) => {
    const L = D * 864e5 + min * 6e4;
    return L - offsetMs(L - offsetMs(L));
  };
  var dayBounds = (D) => ({
    start: wallToUtc(D, 300),
    end: wallToUtc(D + 1, 300),
    a2015: wallToUtc(D, 1215),
    a2200: wallToUtc(D, 1320),
    a2300: wallToUtc(D, 1380)
  });
  var broadcastDayOf = (t) => {
    const w = t + offsetMs(t);
    const D = Math.floor(w / 864e5);
    return w - D * 864e5 < 5 * 36e5 ? D - 1 : D;
  };
  var dayOfDate = (y, m, d) => Math.round(Date.UTC(y, m, d) / 864e5);
  var two = (n) => (n < 10 ? "0" : "") + n;
  var formatClock = (t) => {
    const w = t + offsetMs(t);
    const m = Math.floor((w - Math.floor(w / 864e5) * 864e5) / 6e4);
    return two(Math.floor(m / 60)) + ":" + two(m % 60);
  };
  var WD_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  var WD_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  var formatDay = (D) => {
    const wd = ((D + 4) % 7 + 7) % 7;
    const dt = new Date(D * 864e5);
    return { weekday: WD_SHORT[wd], long: WD_LONG[wd], date: two(dt.getUTCDate()) + "." + two(dt.getUTCMonth() + 1) + "." };
  };
  var weekOf = (D) => Math.floor((D + 3) / 7);
  var weekStart = (W) => 7 * W - 3;
  var admitDay = (t) => broadcastDayOf(t) + 1;
  var parseDate = (s) => {
    if (typeof s === "number") return Number.isFinite(s) ? s : null;
    if (typeof s !== "string" || !s) return null;
    let x = s.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(x)) x += "T00:00:00Z";
    else if (/T[\d:.]+$/.test(x)) x += "Z";
    const t = Date.parse(x);
    return Number.isFinite(t) ? t : null;
  };
  var ticksToMs = (t) => {
    const n = Math.round(Number(t) / 1e4);
    return Number.isFinite(n) ? n : 0;
  };

  // src/js/live/schedule/hash.js
  function fnv1a(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function fmix32(h) {
    h ^= h >>> 16;
    h = Math.imul(h, 2246822507);
    h ^= h >>> 13;
    h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  }
  function bitrev32(x) {
    x = x >>> 0;
    x = ((x & 2863311530) >>> 1 | (x & 1431655765) << 1) >>> 0;
    x = ((x & 3435973836) >>> 2 | (x & 858993459) << 2) >>> 0;
    x = ((x & 4042322160) >>> 4 | (x & 252645135) << 4) >>> 0;
    x = ((x & 4278255360) >>> 8 | (x & 16711935) << 8) >>> 0;
    return (x >>> 16 | x << 16) >>> 0;
  }
  var keyHash = (key, id) => fmix32(fnv1a(key + "" + id));
  var cmpStr = (a, b) => a < b ? -1 : a > b ? 1 : 0;

  // src/js/live/schedule/rating.js
  var FIXED = {
    G: 0,
    U: 0,
    "TV-Y": 0,
    "TV-G": 0,
    PG: 6,
    "TV-PG": 6,
    "TV-Y7": 6,
    "TV-Y7-FV": 6,
    R: 16,
    "TV-MA": 16,
    "NC-17": 18,
    X: 18,
    XXX: 18,
    AO: 18,
    R18: 18,
    NR: null,
    UNRATED: null,
    "": null
  };
  function ratingAge(str) {
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
  var maxAge = (a, b) => a == null ? b : b == null ? a : a > b ? a : b;

  // src/js/live/schedule/catalog.js
  var MIN_DUR = 5 * MIN;
  var MAX_DUR = 5 * HOUR;
  var normGenre = (g) => String(g == null ? "" : g).trim().normalize("NFC").toLowerCase();
  var cmpEp = (a, b) => a.season - b.season || a.episode - b.episode || (a.premiere === b.premiere ? 0 : a.premiere < b.premiere ? -1 : 1) || cmpStr(a.id, b.id);
  var lowerMedian = (arr) => arr.length ? arr[Math.floor((arr.length - 1) / 2)] : 0;
  var num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  function yearOf(ProductionYear, premiere) {
    const y = num(ProductionYear);
    if (y && y > 1800 && y < 3e3) return Math.floor(y);
    if (premiere != null && Number.isFinite(premiere)) return new Date(premiere).getUTCFullYear();
    return null;
  }
  function genresOf(list, labelCounts) {
    const norm = [];
    const seen = /* @__PURE__ */ new Set();
    for (const g of Array.isArray(list) ? list : []) {
      const label = String(g == null ? "" : g).trim().normalize("NFC");
      const n = label.toLowerCase();
      if (!n || seen.has(n)) continue;
      seen.add(n);
      norm.push(n);
      let m = labelCounts.get(n);
      if (!m) labelCounts.set(n, m = /* @__PURE__ */ new Map());
      m.set(label, (m.get(label) || 0) + 1);
    }
    norm.sort(cmpStr);
    return norm;
  }
  function dedupe(list) {
    const arr = (Array.isArray(list) ? list : []).filter((x) => x && x.Id != null && x.Id !== "").map((x) => ({ x, id: String(x.Id) }));
    arr.sort((a, b) => cmpStr(a.id, b.id) || cmpStr(JSON.stringify(a.x), JSON.stringify(b.x)));
    const out = [];
    for (const r of arr) if (!out.length || out[out.length - 1].id !== r.id) out.push(r);
    return out;
  }
  function normalizeCatalog(raw) {
    const r = raw || {};
    const labelCounts = /* @__PURE__ */ new Map();
    const items = /* @__PURE__ */ new Map();
    const movies = [];
    for (const { x, id } of dedupe(r.movies)) {
      const durMs = ticksToMs(x.RunTimeTicks);
      if (!(durMs >= MIN_DUR && durMs <= MAX_DUR)) continue;
      const premiere = parseDate(x.PremiereDate);
      const it = {
        id,
        kind: "movie",
        title: String(x.Name == null ? "" : x.Name),
        durMs,
        genres: genresOf(x.Genres, labelCounts),
        year: yearOf(x.ProductionYear, premiere),
        premiere,
        addedAt: parseDate(x.DateCreated) ?? 0,
        age: ratingAge(x.OfficialRating),
        trailer: (num(x.LocalTrailerCount) || 0) > 0
      };
      movies.push(it);
      items.set(id, it);
    }
    const rawSeries = dedupe(r.series);
    const byId = new Map(rawSeries.map((s) => [s.id, s]));
    const epsBy = /* @__PURE__ */ new Map();
    for (const { x, id } of dedupe(r.episodes)) {
      const sid = x.SeriesId == null ? "" : String(x.SeriesId);
      if (!byId.has(sid)) continue;
      const season = num(x.ParentIndexNumber);
      if (season === 0) continue;
      const hasRt = x.RunTimeTicks != null && Number(x.RunTimeTicks) > 0;
      const durMs = hasRt ? ticksToMs(x.RunTimeTicks) : null;
      if (hasRt && !(durMs >= MIN_DUR && durMs <= MAX_DUR)) continue;
      const prem = parseDate(x.PremiereDate);
      let list = epsBy.get(sid);
      if (!list) epsBy.set(sid, list = []);
      list.push({
        id,
        kind: "episode",
        title: String(x.Name == null ? "" : x.Name),
        durMs,
        seriesId: sid,
        seriesTitle: String(x.SeriesName == null ? byId.get(sid).x.Name ?? "" : x.SeriesName),
        season: season == null ? 9999 : season,
        episode: num(x.IndexNumber) == null ? 9999 : num(x.IndexNumber),
        premiere: prem == null ? Infinity : prem,
        addedAt: parseDate(x.DateCreated) ?? 0,
        ownAge: ratingAge(x.OfficialRating)
      });
    }
    const series = [];
    for (const { x, id } of rawSeries) {
      const eps = epsBy.get(id) || [];
      const durs = eps.filter((e) => e.durMs != null).map((e) => e.durMs).sort((a, b) => a - b);
      const med = lowerMedian(durs);
      const keep = durs.length ? eps.filter((e) => {
        if (e.durMs == null) e.durMs = med;
        return true;
      }) : [];
      keep.sort(cmpEp);
      const own = ratingAge(x.OfficialRating);
      const genres2 = genresOf(x.Genres, labelCounts);
      const year = yearOf(x.ProductionYear, null);
      let ageMax = own;
      for (const e of keep) {
        e.age = maxAge(own, e.ownAge);
        ageMax = maxAge(ageMax, e.age);
        e.genres = genres2;
        e.year = year;
        delete e.ownAge;
        Object.freeze(e);
        items.set(e.id, e);
      }
      const s = {
        id,
        kind: "series",
        title: String(x.Name == null ? "" : x.Name),
        genres: genres2,
        year,
        addedAt: parseDate(x.DateCreated) ?? 0,
        age: own,
        ageMax,
        eps: keep,
        epAddedSorted: keep.map((e) => e.addedAt).sort((a, b) => a - b),
        firstEpAdded: 0,
        totalMs: 0,
        durMs: med
      };
      s.firstEpAdded = s.epAddedSorted.length ? s.epAddedSorted[0] : 0;
      for (const e of keep) s.totalMs += e.durMs;
      items.set(id, s);
      if (keep.length) series.push(s);
    }
    const boxsets = dedupe(r.boxsets).map(({ x, id }) => ({ id, name: String(x.Name == null ? "" : x.Name), childCount: num(x.ChildCount) || 0 }));
    const labels = /* @__PURE__ */ new Map();
    for (const [n, m] of labelCounts) {
      let best = null;
      let bc = -1;
      for (const [lab, c] of m) if (c > bc || c === bc && cmpStr(lab, best) < 0) {
        best = lab;
        bc = c;
      }
      labels.set(n, best);
    }
    const counts = /* @__PURE__ */ new Map();
    for (const t of movies.concat(series)) for (const g of t.genres) counts.set(g, (counts.get(g) || 0) + 1);
    const genres = [...counts].map(([n, count]) => ({ norm: n, label: labels.get(n), count })).sort((a, b) => b.count - a.count || cmpStr(a.norm, b.norm)).map((g) => ({ label: g.label, count: g.count, norm: g.norm }));
    return {
      movies,
      series,
      items,
      boxsets,
      genres,
      genreLabel: (n) => labels.get(n) ?? n,
      loadedAt: num(r.loadedAt) ?? 0
    };
  }

  // src/js/live/schedule/pool.js
  var CAP_MS = { A: 17 * HOUR, B: 4 * HOUR };
  var MAX_C = 4096;
  var streamOfAge = (age) => age == null || age <= 12 ? "A" : "B";
  function bucketCount(poolMs, capMs) {
    let C = 1;
    while (C < MAX_C && C * 2 * capMs <= poolMs) C *= 2;
    return C;
  }
  var log2i = (C) => 31 - Math.clz32(C);
  function makeEntries(key, items, msOf) {
    const out = items.map((it) => {
      const h = keyHash(key, it.id);
      return { id: it.id, h, br: bitrev32(h), it, ms: msOf ? msOf(it) : it.durMs };
    });
    out.sort((a, b) => a.br - b.br || cmpStr(a.id, b.id));
    return out;
  }
  function lowerBound(arr, br) {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const m = lo + hi >>> 1;
      if (arr[m].br < br) lo = m + 1;
      else hi = m;
    }
    return lo;
  }
  function bucket(sorted, C, D) {
    const c = log2i(C);
    const b = D & C - 1;
    let lo = 0;
    let hi = sorted.length;
    if (c > 0) {
      const r = bitrev32(b) >>> 32 - c;
      const span = 2 ** (32 - c);
      lo = lowerBound(sorted, r * span);
      hi = lowerBound(sorted, (r + 1) * span);
    }
    const out = sorted.slice(lo, hi);
    out.sort((a, x) => a.h - x.h || cmpStr(a.id, x.id));
    return out;
  }
  function rotation(sorted, C, D) {
    const list = bucket(sorted, C, D);
    if (list.length < 2) return list;
    const s = Math.imul(D >>> log2i(C), 2654435769) >>> 0;
    let start = 0;
    while (start < list.length && list[start].h < s) start++;
    if (start === list.length) start = 0;
    return start === 0 ? list : list.slice(start).concat(list.slice(0, start));
  }
  function rotationWithBorrow(sorted, C, D) {
    return { home: rotation(sorted, C, D), borrow: C > 1 ? rotation(sorted, C, D + C / 2) : [] };
  }

  // src/js/live/schedule/fill.js
  var FILL_LABEL = "F\xFCllprogramm";
  var NIGHT_LABEL = "F\xFCllprogramm \u2013 regul\xE4res Programm ab 5:00";
  var FILLER_MAX = 30 * MIN;
  var DP_HORIZON = 4 * HOUR;
  var DP_MAX_CANDS = 40;
  var slotOf = (durMs) => Math.ceil(durMs / GRID) * GRID;
  function ageAllowed(age, start, b) {
    if (age == null || age <= 12) return true;
    return age >= 18 ? start >= b.a2300 : start >= b.a2200;
  }
  function packSubset(sizes, cap) {
    const n = sizes.length;
    cap = Math.max(0, Math.min(cap, 1200));
    if (!n || !cap) return [];
    const W = cap + 1;
    const suf = new Uint8Array((n + 1) * W);
    suf[n * W] = 1;
    for (let i = n - 1; i >= 0; i--) {
      const s = sizes[i];
      for (let c = 0; c <= cap; c++) suf[i * W + c] = suf[(i + 1) * W + c] || s <= c && suf[(i + 1) * W + c - s] ? 1 : 0;
    }
    let best = cap;
    while (best > 0 && !suf[best]) best--;
    const out = [];
    let rem = best;
    for (let i = 0; i < n && rem > 0; i++) {
      if (sizes[i] <= rem && suf[(i + 1) * W + rem - sizes[i]]) {
        out.push(i);
        rem -= sizes[i];
      }
    }
    return out;
  }
  function closedownDay(D, reason = "empty") {
    const b = dayBounds(D);
    return Object.freeze([Object.freeze({ start: b.start, end: b.end, type: "closedown", reason })]);
  }
  function createDayBuilder({ D, bounds, used, shorts, key }) {
    const b = bounds || dayBounds(D);
    const usedSet = used || /* @__PURE__ */ new Set();
    let list = shorts || [];
    const fkey = "fill" + (key == null ? "" : key);
    const entries = [];
    let cursor = b.start;
    let fillCount = 0;
    function pushFiller(from, to, reason) {
      if (to <= from) return;
      const last = entries[entries.length - 1];
      if (last && last.type === "filler" && last.end === from) last.end = to;
      else entries.push({ start: from, end: to, type: "filler", reason });
    }
    function mkEntry(piece, start, type) {
      const e = { start, end: start + piece.durMs, type, itemId: piece.itemId };
      if (piece.seriesId) e.seriesId = piece.seriesId;
      if (piece.rerun) e.rerun = true;
      if (piece.premiere) e.premiere = piece.premiere;
      if (piece.theme) e.theme = piece.theme;
      if (piece.age != null) e.age = piece.age;
      if (piece.label) e.label = piece.label;
      else if (type === "fill") e.label = FILL_LABEL;
      else if (type === "nightfill") e.label = NIGHT_LABEL;
      return e;
    }
    function lim(opts) {
      return Math.min(opts && opts.limit != null ? opts.limit : b.end, b.end);
    }
    function canPlaceBlock(pieces, opts) {
      const limit = lim(opts);
      let s = cursor;
      const seen = /* @__PURE__ */ new Set();
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
      const type = opts && opts.type || "program";
      for (const p of pieces) {
        const slot = slotOf(p.durMs);
        entries.push(mkEntry(p, cursor, type));
        usedSet.add(p.itemId);
        if (slot > p.durMs) pushFiller(cursor + p.durMs, cursor + slot, "grid");
        cursor += slot;
      }
      return true;
    }
    function pickShort(gap) {
      if (typeof list === "function") list = list() || [];
      const n = list.length;
      if (!n) return null;
      const off = keyHash(fkey, D + ":" + fillCount) % n;
      let best = null;
      let bestSlot = 0;
      let found = 0;
      for (let i = 0; i < n && found < 8; i++) {
        const it = list[(off + i) % n];
        if (usedSet.has(it.id)) continue;
        const slot = slotOf(it.durMs);
        if (slot > gap || !ageAllowed(it.age, cursor, b)) continue;
        found++;
        if (slot > bestSlot) {
          best = it;
          bestSlot = slot;
        }
      }
      return best;
    }
    function fillUntil(until) {
      until = Math.min(until, b.end);
      const atEnd = until === b.end;
      while (cursor < until) {
        const gap = until - cursor;
        if (gap <= FILLER_MAX) {
          pushFiller(cursor, until, atEnd ? "end" : "grid");
          cursor = until;
          break;
        }
        const it = pickShort(gap);
        if (!it) {
          entries.push({ start: cursor, end: until, type: "closedown", reason: "empty" });
          cursor = until;
          break;
        }
        fillCount++;
        placeBlock([{ itemId: it.id, durMs: it.durMs, seriesId: it.seriesId, age: it.age }], { limit: until, type: atEnd ? "nightfill" : "fill" });
      }
    }
    return {
      get cursor() {
        return cursor;
      },
      bounds: b,
      used: usedSet,
      canPlace: (piece, opts) => canPlaceBlock([piece], opts),
      place: (piece, opts) => placeBlock([piece], opts),
      canPlaceBlock,
      placeBlock,
      fillUntil,
      waitUntil: fillUntil,
      closeRest(reason = "end") {
        if (cursor < b.end) entries.push({ start: cursor, end: b.end, type: "closedown", reason });
        cursor = b.end;
      },
      finish() {
        if (cursor < b.end) fillUntil(b.end);
        return Object.freeze(entries.map((e) => Object.freeze(e)));
      }
    };
  }
  function fillSegment(builder, cands, { limit, strict = true }) {
    const pending = cands.slice();
    const valid = (c, l) => builder.canPlaceBlock(c.pieces, { limit: l });
    const take = (c) => {
      pending.splice(pending.indexOf(c), 1);
    };
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
      for (const i of idx) {
        builder.placeBlock(cand[i].pieces, { limit });
        take(cand[i]);
      }
      builder.fillUntil(limit);
    }
  }

  // src/js/live/schedule/series.js
  function createSeriesTools() {
    const views = /* @__PURE__ */ new Map();
    const starts = /* @__PURE__ */ new Map();
    const walks = /* @__PURE__ */ new Map();
    const dayStart = (d) => {
      let v = starts.get(d);
      if (v === void 0) starts.set(d, v = wallToUtc(d, 300));
      return v;
    };
    function view(s, cut) {
      if (s.addedAt >= cut) return null;
      const a = s.epAddedSorted;
      let lo = 0;
      let hi = a.length;
      while (lo < hi) {
        const m = lo + hi >>> 1;
        if (a[m] < cut) lo = m + 1;
        else hi = m;
      }
      if (!lo) return null;
      const key = s.id + "|" + lo;
      let v = views.get(key);
      if (v) return v;
      const eps = s.eps.filter((e) => e.addedAt < cut);
      const durs = eps.map((e) => e.durMs).sort((x, y) => x - y);
      const n = durs.length;
      const medianMs = lowerMedian(durs);
      const p90Ms = durs[Math.ceil(9 * n / 10) - 1];
      let age = s.age;
      let totalMs = 0;
      for (const e of eps) {
        if (e.age != null && (age == null || e.age > age)) age = e.age;
        totalMs += e.durMs;
      }
      const b = Math.min(n, medianMs <= 30 * MIN ? 2 : 1);
      v = Object.freeze({
        s,
        n,
        eps,
        medianMs,
        p90Ms,
        age,
        b,
        aufMs: b * medianMs,
        slotLen: Math.ceil(p90Ms * b / GRID) * GRID,
        totalMs,
        admit: admitDay(Math.max(s.addedAt, s.firstEpAdded))
      });
      views.set(key, v);
      return v;
    }
    function block(s, wkey, k, b, dayOfK) {
      let w = walks.get(wkey);
      if (!w) walks.set(wkey, w = { next: 0, cursor: 0, blocks: [] });
      const eps = s.eps;
      while (w.next <= k) {
        const cutK = dayStart(dayOfK(w.next));
        const picks = [];
        for (let i = 0; i < b; i++) {
          let j = -1;
          for (let pass = 0; pass < 2 && j < 0; pass++) {
            for (let x = w.cursor; x < eps.length; x++) if (eps[x].addedAt < cutK) {
              j = x;
              break;
            }
            if (j < 0) w.cursor = 0;
          }
          if (j >= 0) {
            w.cursor = j + 1;
            picks.push(j);
          }
        }
        w.blocks.push(picks);
        w.next++;
      }
      const seen = /* @__PURE__ */ new Set();
      const out = [];
      for (const j of w.blocks[k]) if (!seen.has(j)) {
        seen.add(j);
        out.push(eps[j]);
      }
      return out;
    }
    return { dayStart, view, block };
  }

  // src/js/live/schedule/plan.js
  var SHORT_MAX = 50 * MIN;
  var MIN_POOL = 2 * HOUR;
  var T_A = 16 * HOUR;
  var T_B = 5 * HOUR;
  var SLOT_END = 21 * HOUR;
  var B_SLOT_CAP = 4 * HOUR;
  var FIXED2 = {
    1: { key: "kino", name: "LIVE Kino", kind: "movies" },
    2: { key: "klassik", name: "LIVE Klassik", kind: "movies" },
    3: { key: "serie", name: "LIVE Serie", kind: "series" },
    4: { key: "marathon", name: "LIVE Marathon", kind: "series" },
    17: { key: "premiere", name: "LIVE Premiere", kind: "special" },
    18: { key: "thema", name: "LIVE Thementag", kind: "special" }
  };
  function parseChannelConfig(cfg) {
    const out = /* @__PURE__ */ new Map();
    let pairs = [];
    if (typeof cfg === "string") {
      pairs = cfg.split(";").map((p) => {
        const i = p.indexOf("=");
        return i < 0 ? null : [p.slice(0, i), p.slice(i + 1)];
      }).filter(Boolean);
    } else if (cfg && typeof cfg === "object") pairs = Object.keys(cfg).map((k) => [k, cfg[k]]);
    for (const [k, v] of pairs) {
      const no = Number(String(k).trim());
      const g = normGenre(v);
      if (Number.isInteger(no) && no >= 5 && no <= 16 && g) out.set(no, g);
    }
    return out;
  }
  function createContext(catalog, opts = {}) {
    const tools = createSeriesTools();
    const { dayStart } = tools;
    const config = parseChannelConfig(opts.channelConfig);
    const knownGenres = new Set(catalog.genres.map((g) => g.norm));
    const pools = /* @__PURE__ */ new Map();
    const shortsCache = /* @__PURE__ */ new Map();
    const seriesCache = /* @__PURE__ */ new Map();
    const allShorts = (() => {
      const list = [];
      for (const m of catalog.movies) if (m.durMs <= SHORT_MAX) list.push(m);
      for (const s of catalog.series) for (const e of s.eps) if (e.durMs <= SHORT_MAX) list.push(e);
      const keys = new Float64Array(list.length);
      for (let i = 0; i < list.length; i++) keys[i] = bitrev32(keyHash("fill", list[i].id)) * 2097152 + i;
      keys.sort();
      const items = Array.from(keys, (k) => list[k % 2097152]);
      const eff = new Float64Array(items.length);
      for (let i = 0; i < items.length; i++) eff[i] = items[i].kind === "movie" ? items[i].addedAt : Math.max(items[i].addedAt, catalog.items.get(items[i].seriesId).addedAt);
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
        for (const s of catalog.series) {
          const view = tools.view(s, cut);
          if (view) v.push({ s, v: view });
        }
        seriesCache.set(D, v);
      }
      return v;
    }
    function dayPool(D) {
      let P = pools.get(D);
      if (P) return P;
      const cut = dayStart(D);
      const movies = catalog.movies.filter((m) => m.addedAt < cut);
      const series = seriesAt(D);
      const years = movies.map((m) => m.year).filter((y) => y != null).sort((a, b) => a - b);
      const medianYear = years.length ? years[Math.floor((years.length - 1) / 2)] : null;
      const counts = /* @__PURE__ */ new Map();
      for (const t of movies) for (const g of t.genres) counts.set(g, (counts.get(g) || 0) + 1);
      for (const { s } of series) for (const g of s.genres) counts.set(g, (counts.get(g) || 0) + 1);
      const top = [...counts].sort((a, b) => b[1] - a[1] || cmpStr(a[0], b[0])).map((x) => x[0]);
      const genres = new Array(17).fill(null);
      const reserved = /* @__PURE__ */ new Set();
      for (let p = 5; p <= 16; p++) {
        const g = config.get(p);
        if (g && knownGenres.has(g) && !reserved.has(g)) {
          genres[p] = g;
          reserved.add(g);
        }
      }
      let ti = 0;
      for (let p = 5; p <= 16; p++) {
        if (genres[p]) continue;
        while (ti < top.length && reserved.has(top[ti])) ti++;
        if (ti < top.length) genres[p] = top[ti++];
      }
      const places = [];
      for (let p = 5; p <= 16; p++) if (genres[p]) places.push(p);
      const gMovies = /* @__PURE__ */ new Map();
      const gSeries = /* @__PURE__ */ new Map();
      for (const p of places) {
        gMovies.set(p, []);
        gSeries.set(p, []);
      }
      const assign = (id, tGenres) => {
        const fit = places.filter((p) => tGenres.includes(genres[p]));
        return fit.length ? fit[keyHash("genre", id) % fit.length] : 0;
      };
      for (const m of movies) {
        const p = assign(m.id, m.genres);
        if (p) gMovies.get(p).push(m);
      }
      for (const sv of series) {
        const p = assign(sv.s.id, sv.s.genres);
        if (p) gSeries.get(p).push(sv);
      }
      P = { cut, movies, series, medianYear, genres, gMovies, gSeries, chPools: /* @__PURE__ */ new Map(), chList: null };
      pools.set(D, P);
      return P;
    }
    function channels(D) {
      const P = dayPool(D);
      if (P.chList) return P.chList;
      const list = [];
      for (let no = 1; no <= 18; no++) {
        if (FIXED2[no]) list.push({ no, ...FIXED2[no] });
        else {
          const g = P.genres[no];
          list.push(g ? { no, key: "genre:" + g, name: "LIVE " + catalog.genreLabel(g), kind: "genre", genreLabel: catalog.genreLabel(g) } : { no, key: "genre:", name: "LIVE " + no, kind: "genre" });
        }
      }
      P.chList = Object.freeze(list.map((c) => Object.freeze(c)));
      return P.chList;
    }
    function builder(no, D, used) {
      return createDayBuilder({ D, used, shorts: () => shorts(D), key: String(no) });
    }
    function poolOf2(no, D) {
      const P = dayPool(D);
      let cp = P.chPools.get(no);
      if (cp) return cp;
      let key;
      let movies = [];
      let series = [];
      if (no === 1 || no === 2) {
        key = no === 1 ? "kino" : "klassik";
        const med = P.medianYear;
        movies = P.movies.filter((m) => (m.year == null || med == null || m.year >= med) === (no === 1));
      } else {
        const g = P.genres[no];
        key = "genre:" + (g || "");
        if (g) {
          movies = P.gMovies.get(no);
          series = P.gSeries.get(no);
        }
      }
      const items = movies.map((m) => ({ id: m.id, movie: m })).concat(series.map((sv) => ({ id: sv.s.id, s: sv.s, v: sv.v })));
      const msOf = (w) => w.movie ? w.movie.durMs : w.v.aufMs;
      const ageOf = (w) => w.movie ? w.movie.age : w.v.age;
      const a = items.filter((w) => streamOfAge(ageOf(w)) === "A");
      const b = items.filter((w) => streamOfAge(ageOf(w)) === "B");
      let totalMs = 0;
      for (const m of movies) totalMs += m.durMs;
      for (const sv of series) totalMs += sv.v.totalMs;
      cp = { key, totalMs, A: makeEntries(key, a, msOf), B: makeEntries(key, b, msOf) };
      P.chPools.set(no, cp);
      return cp;
    }
    const poolMs = (entries) => entries.reduce((x, e) => x + e.ms, 0);
    function candOf2(D, entry, C, borrowed) {
      const w = entry.it;
      if (w.movie) {
        const m = w.movie;
        return { id: m.id, movie: true, size: slotOf(m.durMs), pieces: [{ itemId: m.id, durMs: m.durMs, age: m.age }] };
      }
      const { s, v } = w;
      const base = Math.floor(v.admit / C);
      const k0 = Math.floor(D / C) - base;
      const k = borrowed ? Math.max(0, k0 - 1) : k0;
      const eps = tools.block(s, s.id + "|m|" + C + "|" + v.admit + "|" + v.b, k, v.b, (kk) => Math.max(v.admit, (base + kk) * C));
      const pieces = eps.map((e) => ({ itemId: e.id, durMs: e.durMs, seriesId: s.id, age: v.age, ...borrowed ? { rerun: true } : {} }));
      return { id: s.id, movie: false, size: pieces.reduce((x, p) => x + slotOf(p.durMs), 0), pieces };
    }
    function streamCands2(D, sorted, cap) {
      if (!sorted.length) return [];
      const C = bucketCount(poolMs(sorted), cap);
      const { home, borrow } = rotationWithBorrow(sorted, C, D);
      return home.map((e) => candOf2(D, e, C, false)).concat(borrow.map((e) => candOf2(D, e, C, true)));
    }
    function planMixed(no, D) {
      const cp = poolOf2(no, D);
      if (cp.totalMs < MIN_POOL) return closedownDay(D, "empty");
      const B = builder(no, D);
      const b = B.bounds;
      const candsA = streamCands2(D, cp.A, CAP_MS.A);
      const candsB = streamCands2(D, cp.B, CAP_MS.B);
      const anchor = candsA.find((c) => c.movie && b.a2015 + c.size <= b.end);
      if (anchor) {
        fillSegment(B, candsA.filter((c) => c !== anchor), { limit: b.a2015, strict: true });
        B.placeBlock(anchor.pieces);
      }
      fillSegment(B, candsA, { limit: b.a2200, strict: false });
      fillSegment(B, candsB, { limit: b.end, strict: true });
      return B.finish();
    }
    const weekTables = /* @__PURE__ */ new Map();
    function weekTable(W) {
      let t = weekTables.get(W);
      if (t) return t;
      const Ws = weekStart(W);
      const svs = seriesAt(Ws);
      const slots = [];
      const streamsOf = { A: [], B: [] };
      for (const sv of svs) streamsOf[streamOfAge(sv.v.age)].push({ id: sv.s.id, s: sv.s, v: sv.v });
      let off = 0;
      for (const S of ["A", "B"]) {
        const sorted = makeEntries("serie", streamsOf[S], (w) => w.v.slotLen);
        const cap = S === "A" ? CAP_MS.A : B_SLOT_CAP;
        const Cw = sorted.length ? bucketCount(poolMs(sorted), cap) : 1;
        const { home, borrow } = rotationWithBorrow(sorted, Cw, W);
        const list = home.concat(borrow);
        if (S === "B") off = Math.max(off, CAP_MS.A);
        const deferred = [];
        for (const e of list) {
          const w = e.it;
          if (S === "B" && w.v.age === 18 && off < 18 * HOUR) {
            deferred.push(e);
            continue;
          }
          if (off < (S === "A" ? CAP_MS.A : SLOT_END) && off + w.v.slotLen <= SLOT_END) {
            slots.push({ s: w.s, v: w.v, off, Cw, admitW: weekOf(w.v.admit) });
            off += w.v.slotLen;
          }
        }
        if (S === "B") {
          off = Math.max(off, 18 * HOUR);
          for (const e of deferred) {
            const w = e.it;
            if (off + w.v.slotLen <= SLOT_END) {
              slots.push({ s: w.s, v: w.v, off, Cw, admitW: weekOf(w.v.admit) });
              off += w.v.slotLen;
            }
          }
        }
      }
      weekTables.set(W, t = slots);
      return t;
    }
    function slotPieces(slot, D) {
      const { s, v, Cw, admitW } = slot;
      const W = weekOf(D);
      const baseW = Math.floor(admitW / Cw);
      const k = 7 * (Math.floor(W / Cw) - baseW) + (D - weekStart(W));
      const wkey = s.id + "|w|" + Cw + "|" + v.admit + "|" + v.b;
      const eps = tools.block(s, wkey, Math.max(0, k), v.b, (kk) => Math.max(v.admit, weekStart((baseW + Math.floor(kk / 7)) * Cw) + kk % 7));
      return eps.map((e) => ({ itemId: e.id, durMs: e.durMs, seriesId: s.id, age: v.age }));
    }
    function planSerie(no, D) {
      const table = weekTable(weekOf(D));
      if (!table.length) return closedownDay(D, "empty");
      const B = builder(no, D);
      const b = B.bounds;
      for (const slot of table) {
        const start = b.start + slot.off;
        if (B.cursor < start) B.fillUntil(start);
        B.placeBlock(slotPieces(slot, D));
      }
      const nightStart = b.start + SLOT_END;
      if (B.cursor < nightStart) B.fillUntil(nightStart);
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
    function marathonStream(D, S, T) {
      const svs = seriesAt(D).filter((x) => streamOfAge(x.v.age) === S);
      if (!svs.length) return null;
      const sorted = makeEntries("marathon", svs.map((x) => ({ id: x.s.id, ...x })), () => 0);
      const m = sorted.length;
      let C = 1;
      while (C * 2 <= m) C *= 2;
      let bk = bucket(sorted, C, D);
      if (!bk.length && C > 1) bk = bucket(sorted, C, D + C / 2);
      for (let i = 1; !bk.length && i < C; i++) bk = bucket(sorted, C, D + i);
      if (!bk.length) bk = sorted;
      const q = D >>> 31 - Math.clz32(C);
      const first = bk[q % bk.length].it;
      const n = Math.floor(q / bk.length);
      const out = [];
      const v0 = first.v;
      if (v0.totalMs > T) {
        const lo = n * T;
        const hi = lo + T;
        for (let r = Math.floor(lo / v0.totalMs); r * v0.totalMs < hi; r++) {
          let g = r * v0.totalMs;
          for (const e of v0.eps) {
            if (g >= lo && g < hi) out.push(e);
            g += e.durMs;
          }
        }
      } else {
        const order = sorted.map((e) => e.it);
        let at = order.findIndex((w) => w.s === first.s);
        let total = 0;
        for (let i = 0; i < order.length && total < T; i++, at = (at + 1) % order.length) {
          const v = order[at].v;
          let off = 0;
          for (const e of v.eps) {
            if (total + off >= T) break;
            out.push(e);
            off += e.durMs;
          }
          total += off;
        }
      }
      return { eps: out, age: v0.age, seriesId: first.s.id };
    }
    function planMarathon(no, D) {
      if (!seriesAt(D).length) return closedownDay(D, "empty");
      const B = builder(no, D);
      const b = B.bounds;
      const run = (st) => {
        for (const e of st.eps) {
          if (!B.placeBlock([{ itemId: e.id, durMs: e.durMs, seriesId: e.seriesId, age: st.age }])) break;
        }
      };
      const A = marathonStream(D, "A", T_A);
      if (A) run(A);
      if (B.cursor < b.a2200) B.fillUntil(b.a2200);
      const S = marathonStream(D, "B", T_B);
      if (S) {
        if (S.age === 18 && B.cursor < b.a2300) B.fillUntil(b.a2300);
        run(S);
      }
      return B.finish();
    }
    const ctx = {
      catalog,
      getBoxSetItems: opts.getBoxSetItems || (async () => []),
      tools,
      dayStart,
      shorts,
      builder,
      seriesAt,
      dayPool,
      channels,
      GRID,
      dayBounds,
      admitDay,
      maxAge,
      bitrev32
    };
    function planBuiltin(no, D) {
      if (no === 1 || no === 2 || no >= 5 && no <= 16) return planMixed(no, D);
      if (no === 3) return planSerie(no, D);
      if (no === 4) return planMarathon(no, D);
      return closedownDay(D, "empty");
    }
    return { ctx, channels, planBuiltin };
  }

  // src/js/live/schedule/specials.js
  var registry = /* @__PURE__ */ new Map();
  function registerSpecial(no, impl) {
    registry.set(no, impl);
  }
  function getSpecial(no) {
    return registry.get(no) || null;
  }

  // src/js/live/schedule/premiere.js
  var EPOCH = dayOfDate(2026, 10, 1);
  var MAX_WAIT_DAYS = 15;
  var BLOCK_MAX_EPS = 3;
  var BLOCK_MAX_MS = 2 * HOUR;
  var MIN_POOL_MS = 24 * HOUR;
  var WINDOWS = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 365];
  var infos = /* @__PURE__ */ new WeakMap();
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
    for (const m of catalog.movies) units.push(mkUnit(m.id, "film", m.addedAt, [m]));
    for (const s of catalog.series) {
      const byDay2 = /* @__PURE__ */ new Map();
      for (const e of s.eps) {
        const at = Math.max(e.addedAt, s.addedAt);
        const d = broadcastDayOf(at);
        let g = byDay2.get(d);
        if (!g) byDay2.set(d, g = []);
        g.push({ e, at });
      }
      for (const g of byDay2.values()) {
        let cur = [];
        let sum = 0;
        const flush = () => {
          if (!cur.length) return;
          units.push(mkUnit(cur[0].e.id, "episode", Math.min(...cur.map((x) => x.at)), cur.map((x) => x.e)));
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
    units.sort((a, b) => a.addedAt - b.addedAt || cmpStr(a.id, b.id));
    const byDay = /* @__PURE__ */ new Map();
    const pday = /* @__PURE__ */ new Map();
    let prev = -Infinity;
    for (const u of units) {
      if (u.day < EPOCH) continue;
      const cand = Math.max(u.day + 1, prev + 1);
      if (cand > u.day + MAX_WAIT_DAYS) continue;
      byDay.set(cand, u);
      pday.set(u.id, cand);
      prev = cand;
    }
    info = { units, byDay, pday };
    infos.set(catalog, info);
    return info;
  }
  function rerunPool(info, D) {
    const avail = info.units.filter((u) => u.day < D && !(info.pday.has(u.id) && info.pday.get(u.id) >= D));
    for (const W of WINDOWS) {
      let ms = 0;
      for (const u of avail) if (u.day >= D - W) ms += u.ms;
      if (ms >= MIN_POOL_MS || W === 365) return avail.filter((u) => u.day >= D - W);
    }
    return [];
  }
  var piecesOf = (u, extra) => u.items.map((it) => {
    const p = { itemId: it.id, durMs: it.durMs, age: it.age, ...extra };
    if (it.seriesId) p.seriesId = it.seriesId;
    return p;
  });
  function candOf(u) {
    const pieces = piecesOf(u, { rerun: true });
    return { id: u.id, movie: u.kind === "film", size: pieces.reduce((x, p) => x + slotOf(p.durMs), 0), pieces };
  }
  function streamCands(pool, S, D) {
    if (!pool.length) return [];
    const sorted = makeEntries("premiere", pool, (u) => u.ms);
    const C = bucketCount(sorted.reduce((x, e) => x + e.ms, 0), CAP_MS[S]);
    const { home, borrow } = rotationWithBorrow(sorted, C, D);
    return home.concat(borrow).map((e) => candOf(e.it));
  }
  var premiereImpl = {
    planDay(ctx, D) {
      const info = buildInfo(ctx.catalog);
      const P = info.byDay.get(D) || null;
      const pool = rerunPool(info, D);
      const candsA = streamCands(pool.filter((u) => streamOfAge(u.age) === "A"), "A", D);
      const candsB = streamCands(pool.filter((u) => streamOfAge(u.age) === "B"), "B", D);
      const B = ctx.builder(17, D);
      const b = B.bounds;
      const premPieces = P ? piecesOf(P, P.kind === "film" ? { premiere: "film" } : { premiere: "episode", label: "Neue Folge" }) : null;
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
    }
  };
  registerSpecial(17, premiereImpl);

  // src/js/live/schedule/themeday.js
  var KINDS = ["boxset", "decade", "pilot", "overlength"];
  var OVERLENGTH_MS = 150 * 6e4;
  var DECADE_MIN_MS = 6 * HOUR;
  var MIN_ITEMS = 2;
  var MIN_PILOTS = 3;
  var MAX_LOADS_PER_DAY = 12;
  var DAY_CAP_MS = 24 * HOUR;
  var states = /* @__PURE__ */ new WeakMap();
  var stateOf = (ctx) => {
    let s = states.get(ctx);
    if (!s) states.set(ctx, s = { boxsets: /* @__PURE__ */ new Map(), themes: /* @__PURE__ */ new Map() });
    return s;
  };
  var numCmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  function chrono(a, b) {
    return numCmp(a.year ?? 9999, b.year ?? 9999) || numCmp(a.premiere ?? Infinity, b.premiere ?? Infinity) || numCmp(a.season ?? 0, b.season ?? 0) || numCmp(a.episode ?? 0, b.episode ?? 0) || cmpStr(a.id, b.id);
  }
  function rotated(key, items, D) {
    if (!items.length) return [];
    const sorted = makeEntries(key, items, () => 1);
    const C = bucketCount(sorted.length, 2);
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (let i = 0; i < C; i++) for (const e of rotation(sorted, C, D + i)) if (!seen.has(e.id)) {
      seen.add(e.id);
      out.push(e.it);
    }
    return out;
  }
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
      for (const e of home.concat(borrow)) {
        if (sum >= DAY_CAP_MS) break;
        sel.push(e.it);
        sum += ms(e.it);
      }
    }
    return sel.slice().sort(chrono);
  }
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
  var decadeName = (dec) => dec >= 2e3 || dec < 1900 ? "Die " + dec + "er" : "Die " + (dec - 1900) + "er";
  function boxsetItems(ctx, ids, D) {
    const cut = ctx.dayStart(D);
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const it = ctx.catalog.items.get(id);
      if (!it) continue;
      if (it.kind === "movie") {
        if (it.addedAt < cut) out.push(it);
      } else if (it.kind === "episode") {
        const s = ctx.catalog.items.get(it.seriesId);
        if (s && Math.max(it.addedAt, s.addedAt) < cut) out.push(it);
      }
    }
    return out;
  }
  var boxsetCands = (ctx, D) => rotated("themeday:boxset", ctx.catalog.boxsets.filter((x) => x.childCount >= 2), D);
  function computeTheme(ctx, kind, D) {
    if (kind === "boxset") {
      const cache = stateOf(ctx).boxsets;
      for (const c of boxsetCands(ctx, D)) {
        const ids = cache.get(c.id);
        if (!ids) continue;
        const items = boxsetItems(ctx, ids, D);
        if (items.length >= MIN_ITEMS) return { kind, name: "Filmreihe: " + c.name, items: items.sort(chrono) };
      }
      return null;
    }
    const P = poolOf(ctx, D);
    if (kind === "overlength") {
      const items = P.movies.filter((m) => m.durMs >= OVERLENGTH_MS);
      return items.length >= MIN_ITEMS ? { kind, name: "\xDCberl\xE4nge", items: pickDay(items, "themeday:overlength", D) } : null;
    }
    if (kind === "pilot") {
      return P.pilots.length >= MIN_PILOTS ? { kind, name: "Pilotfolgen-Tag", items: pickDay(P.pilots, "themeday:pilot", D) } : null;
    }
    if (kind === "decade") {
      const byDec = /* @__PURE__ */ new Map();
      for (const it of P.movies.concat(P.eps)) {
        if (it.year == null) continue;
        const dec = Math.floor(it.year / 10) * 10;
        let g = byDec.get(dec);
        if (!g) byDec.set(dec, g = { id: String(dec), dec, items: [], ms: 0 });
        g.items.push(it);
        g.ms += it.durMs;
      }
      const cands = [...byDec.values()].filter((g) => g.ms >= DECADE_MIN_MS);
      const first = rotated("themeday:decade", cands, D)[0];
      return first ? { kind, name: decadeName(first.dec), items: pickDay(first.items, "themeday:decade:" + first.dec, D) } : null;
    }
    return null;
  }
  function themeFor(ctx, kind, D) {
    const memo = stateOf(ctx).themes;
    const key = kind + "|" + D;
    if (!memo.has(key)) memo.set(key, computeTheme(ctx, kind, D));
    return memo.get(key);
  }
  function weekOrder(ctx, W) {
    const D0 = weekStart(W);
    const cache = stateOf(ctx).boxsets;
    const avail = KINDS.filter((k) => {
      if (k === "boxset") {
        for (const ids of cache.values()) if (ids && boxsetItems(ctx, ids, D0 + 6).length >= MIN_ITEMS) return true;
        return false;
      }
      return themeFor(ctx, k, D0) != null;
    });
    return avail.map((k) => ({ k, h: keyHash("themeday", W + ":" + k) })).sort((a, b) => a.h - b.h || cmpStr(a.k, b.k)).map((x) => x.k);
  }
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
    const seen = /* @__PURE__ */ new Set();
    for (const th of themes) {
      for (const it of th.items) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        (streamOfAge(it.age) === "A" ? A : Bq).push({ it, theme: th.name });
      }
    }
    const piece = (x) => ({ itemId: x.it.id, durMs: x.it.durMs, seriesId: x.it.seriesId, age: x.it.age, theme: x.theme });
    while (B.cursor < b.end && (A.length || Bq.length)) {
      const lists = B.cursor >= b.a2200 ? [Bq, A] : [A, Bq];
      let done = false;
      for (const list of lists) {
        const i = list.findIndex((x) => B.canPlace(piece(x)));
        if (i >= 0) {
          B.place(piece(list[i]));
          list.splice(i, 1);
          done = true;
          break;
        }
      }
      if (done) continue;
      const gate = Bq.length ? B.cursor < b.a2200 ? b.a2200 : B.cursor < b.a2300 ? b.a2300 : 0 : 0;
      if (!gate) break;
      B.fillUntil(gate);
    }
    return B.finish();
  }
  var themedayImpl = {
    /** Lädt die Sammlungs-Inhalte, die für die Tage Ds gebraucht werden (sequentiell, mit Cache; Fehler → Kandidat überspringen). */
    async prepare(ctx, Ds) {
      const cache = stateOf(ctx).boxsets;
      const days2 = [...new Set((Array.isArray(Ds) ? Ds : []).filter(Number.isInteger))].sort((a, b) => a - b);
      for (const D of days2) {
        let loads = 0;
        for (const c of boxsetCands(ctx, D)) {
          if (!cache.has(c.id)) {
            if (loads++ >= MAX_LOADS_PER_DAY) break;
            try {
              const r = await ctx.getBoxSetItems(c.id);
              cache.set(c.id, Array.isArray(r) ? r.map(String) : null);
            } catch {
              cache.set(c.id, null);
            }
            stateOf(ctx).themes.clear();
          }
          const ids = cache.get(c.id);
          if (ids && boxsetItems(ctx, ids, D).length >= MIN_ITEMS) break;
        }
      }
    },
    planDay(ctx, D) {
      return planThemes(ctx, D, themesFor(ctx, D));
    }
  };
  registerSpecial(18, themedayImpl);

  // src/js/live/schedule/index.js
  var LOOKAHEAD_DAYS = 3;
  function validPlan(list, b) {
    if (!Array.isArray(list) || !list.length || list[0].start !== b.start || list[list.length - 1].end !== b.end) return false;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!(e.end > e.start) || i && e.start !== list[i - 1].end) return false;
    }
    return true;
  }
  function createScheduler(catalog, opts = {}) {
    const { ctx, channels, planBuiltin } = createContext(catalog, opts);
    const now = opts.now || (() => Date.now());
    const memo = /* @__PURE__ */ new Map();
    const specialFor = (no) => opts.specials && opts.specials[no] || getSpecial(no);
    function planDay(no, D) {
      no = Number(no);
      if (!Number.isInteger(no) || no < 1 || no > 18 || !Number.isInteger(D)) throw new RangeError("planDay: ung\xFCltiger Sender oder Tag");
      const key = no + "|" + D;
      let p = memo.get(key);
      if (p) return p;
      const b = dayBounds(D);
      if (no >= 17) {
        const sp = specialFor(no);
        let list = null;
        if (sp && typeof sp.planDay === "function") list = sp.planDay(ctx, D);
        p = validPlan(list, b) ? Object.freeze(list.map((e) => Object.freeze({ ...e }))) : closedownDay(D, "empty");
      } else p = planBuiltin(no, D);
      memo.set(key, p);
      return p;
    }
    function nowOn(no, t) {
      const D = broadcastDayOf(t);
      const list = planDay(no, D);
      let lo = 0;
      let hi = list.length - 1;
      while (lo < hi) {
        const m = lo + hi + 1 >>> 1;
        if (list[m].start <= t) lo = m;
        else hi = m - 1;
      }
      const entry = list[lo];
      return { entry, offsetMs: t - entry.start, D };
    }
    function upcoming(no, t, n) {
      const { entry, D } = nowOn(no, t);
      const out = [entry];
      let list = planDay(no, D);
      let i = list.indexOf(entry) + 1;
      let day = D;
      while (out.length <= n) {
        if (i >= list.length) {
          day++;
          if (day > D + LOOKAHEAD_DAYS) break;
          list = planDay(no, day);
          i = 0;
          continue;
        }
        const e = list[i++];
        if (e.type === "program" || e.type === "fill" || e.type === "nightfill") out.push(e);
      }
      return out;
    }
    return {
      channels: (D) => channels(Number.isInteger(D) ? D : broadcastDayOf(now())),
      prepare: async (Ds) => {
        const days2 = Array.isArray(Ds) ? Ds : [];
        const jobs = [];
        for (const no of [17, 18]) {
          const sp = specialFor(no);
          if (sp && typeof sp.prepare === "function") jobs.push(sp.prepare(ctx, days2));
        }
        await Promise.all(jobs);
      },
      planDay,
      nowOn,
      upcoming,
      item: (id) => catalog.items.get(String(id)) || null,
      genres: () => catalog.genres.map((g) => ({ label: g.label, count: g.count }))
    };
  }

  // src/js/live/player/events.js
  function createEmitter() {
    const map = /* @__PURE__ */ new Map();
    return {
      on(name, fn) {
        if (typeof fn !== "function") return () => {
        };
        let set = map.get(name);
        if (!set) map.set(name, set = /* @__PURE__ */ new Set());
        set.add(fn);
        return () => set.delete(fn);
      },
      emit(name, payload) {
        const set = map.get(name);
        if (!set) return;
        for (const fn of [...set]) {
          try {
            fn(payload);
          } catch {
          }
        }
      },
      clear() {
        map.clear();
      }
    };
  }

  // src/js/live/player/video.js
  var START_TIMEOUT_MS = 25e3;
  var STALL_REPORT_MS = 1200;
  var MEDIA_ACTIONS = ["pause", "play", "seekbackward", "seekforward", "seekto", "previoustrack", "nexttrack"];
  var JUMP_TOLERANCE_S = 1.5;
  function createVideoControl(video, { now = Date.now, emit = () => {
  } } = {}) {
    let armed = false;
    let playedOnce = false;
    let base = { off: 0, at: 0 };
    let pending = null;
    let timer = null;
    let onMeta = null;
    let trackEl = null;
    let disposed = false;
    let quiet = false;
    let waiting = false;
    let waitCt = 0;
    let stallTimer = null;
    let stallShown = false;
    let phases = { src: null, meta: null, playing: null };
    const newMetrics = () => ({
      target: null,
      jumped: false,
      seekingAt: null,
      seekedAt: null,
      canplayAt: null,
      waitN: 0,
      waitMs: 0,
      waitFrom: null,
      bufSeeked: null,
      bufPlaying: null,
      dev: null
    });
    let m = newMetrics();
    const measuring = () => armed && phases.meta != null && phases.playing == null;
    const endWait = () => {
      if (m.waitFrom != null) {
        m.waitMs += Math.max(0, now() - m.waitFrom);
        m.waitFrom = null;
      }
    };
    const bufRange = () => {
      try {
        const b = video.buffered;
        if (!b || !b.length || m.target == null) return null;
        const t = video.currentTime;
        let i = 0;
        for (let k = 0; k < b.length; k++) {
          if (b.start(k) <= t + 0.05 && b.end(k) >= t - 0.05) {
            i = k;
            break;
          }
        }
        return [b.start(i) - m.target, b.end(i) - m.target];
      } catch {
        return null;
      }
    };
    video.setAttribute("playsinline", "");
    video.setAttribute("disablepictureinpicture", "");
    video.setAttribute("x-webkit-airplay", "deny");
    video.removeAttribute("controls");
    try {
      video.disablePictureInPicture = true;
    } catch {
    }
    const livePos = () => base.off + (now() - base.at);
    const settle = (result) => {
      quiet = false;
      clearTimeout(timer);
      timer = null;
      const p = pending;
      pending = null;
      if (p) p(result);
    };
    const fail2 = (reason, code) => {
      if (!armed || disposed) return;
      const extra = code ? { code } : {};
      if (!(quiet && pending)) {
        emit("state", { phase: "error", reason, ...extra });
        emit("error", { reason, ...extra });
      }
      settle({ ok: false, reason, ...extra });
    };
    function resetStall() {
      clearTimeout(stallTimer);
      stallTimer = null;
      waiting = false;
      stallShown = false;
    }
    function recovered() {
      const was = stallShown;
      resetStall();
      if (was && armed) emit("state", { phase: "playing" });
    }
    const callPlay = (retried = false) => {
      const rejected = (e) => {
        if (!armed || disposed) return;
        const name = e && e.name;
        if (name === "AbortError") return;
        const failPlay = (r, c) => fail2(r, c);
        if (name === "NotAllowedError") {
          if (retried) {
            failPlay("gesture");
            return;
          }
          try {
            video.muted = true;
          } catch {
          }
          callPlay(true);
          return;
        }
        failPlay("browser", "B-PLAY");
      };
      try {
        const p = video.play();
        if (p && p.then) {
          p.then(() => {
            if (retried && armed && !disposed) emit("autoplay-muted", {});
          }, rejected);
        }
      } catch (e) {
        rejected(e);
      }
    };
    let nativeVolume;
    try {
      const prev = video.volume;
      video.volume = 0.5;
      nativeVolume = video.volume === 0.5;
      video.volume = prev;
    } catch {
      nativeVolume = false;
    }
    const listeners = {
      playing: () => {
        if (!armed) return;
        playedOnce = true;
        if (pending && phases.playing == null) {
          if (phases.meta != null) {
            endWait();
            m.bufPlaying = bufRange();
            try {
              m.dev = video.currentTime - livePos() / 1e3;
            } catch {
            }
          }
          phases.playing = now();
        }
        resetStall();
        emit("state", { phase: "playing" });
        settle({ ok: true });
      },
      // 'stalled' feuert auf iOS auch ohne echte Unterbrechung: ignorieren. 'waiting' erst nach ~1,2 s ohne Fortschritt melden.
      seeking: () => {
        if (measuring() && m.seekingAt == null) m.seekingAt = now();
      },
      seeked: () => {
        if (measuring() && m.seekedAt == null) {
          m.seekedAt = now();
          m.bufSeeked = bufRange();
        }
      },
      waiting: () => {
        if (measuring() && m.waitFrom == null) {
          m.waitN += 1;
          m.waitFrom = now();
        }
        if (!armed || !playedOnce || waiting || stallShown) return;
        waiting = true;
        waitCt = video.currentTime;
        stallTimer = setTimeout(() => {
          stallTimer = null;
          if (!armed || !waiting) return;
          if (video.currentTime > waitCt + 0.05) {
            waiting = false;
            return;
          }
          stallShown = true;
          emit("state", { phase: "stalled" });
        }, STALL_REPORT_MS);
      },
      timeupdate: () => {
        if ((waiting || stallShown) && armed && video.currentTime > waitCt + 0.05) recovered();
      },
      canplay: () => {
        if (measuring()) {
          if (m.canplayAt == null) m.canplayAt = now();
          endWait();
        }
        if (waiting || stallShown) recovered();
      },
      ended: () => {
        if (armed) emit("state", { phase: "ended" });
      },
      error: () => {
        if (!armed) return;
        const code = video.error && video.error.code;
        fail2(code === 2 ? "network" : "video", Number.isInteger(code) && code > 0 ? `M${code}` : "M0");
      },
      pause: () => {
        if (!armed || !playedOnce || video.ended) return;
        const d = video.duration;
        const pos = livePos() / 1e3;
        if (Number.isFinite(d) && pos >= d - 0.5) return;
        try {
          video.currentTime = pos;
        } catch {
        }
        callPlay();
      }
    };
    for (const [name, fn] of Object.entries(listeners)) video.addEventListener(name, fn);
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : null;
    if (ms && typeof ms.setActionHandler === "function") {
      for (const a of MEDIA_ACTIONS) {
        try {
          ms.setActionHandler(a, () => {
          });
        } catch {
        }
      }
    }
    function clearSubtitles() {
      if (trackEl) {
        try {
          trackEl.remove();
        } catch {
        }
        trackEl = null;
      }
    }
    function clear(keepSubs) {
      armed = false;
      playedOnce = false;
      resetStall();
      if (onMeta) {
        video.removeEventListener("loadedmetadata", onMeta);
        onMeta = null;
      }
      settle({ ok: false, reason: "aborted" });
      if (!keepSubs) clearSubtitles();
      try {
        video.pause();
        video.removeAttribute("src");
        if (typeof video.load === "function") video.load();
      } catch {
      }
    }
    function start(url, offsetMs2, { quiet: q = false } = {}) {
      clear(true);
      armed = true;
      quiet = !!q;
      base = { off: Math.max(0, Number(offsetMs2) || 0), at: now() };
      phases = { src: null, meta: null, playing: null };
      m = newMetrics();
      let preset = false;
      return new Promise((resolve) => {
        pending = resolve;
        timer = setTimeout(() => fail2("network", "TIMEOUT"), START_TIMEOUT_MS);
        onMeta = () => {
          onMeta = null;
          if (!armed) return;
          phases.meta = now();
          const want = livePos() / 1e3;
          let cur = NaN;
          try {
            cur = video.currentTime;
          } catch {
          }
          if (!preset || !(Math.abs(cur - want) <= JUMP_TOLERANCE_S)) {
            m.jumped = true;
            m.target = want;
            try {
              video.currentTime = want;
            } catch {
            }
          } else {
            m.target = cur;
          }
          callPlay();
        };
        video.addEventListener("loadedmetadata", onMeta, { once: true });
        phases.src = now();
        const aim = livePos() / 1e3;
        video.src = url;
        try {
          video.currentTime = aim;
          preset = true;
        } catch {
        }
      });
    }
    return {
      get volumeSupported() {
        return nativeVolume;
      },
      /** 'native' | 'mute-only' (feste Gerätelautstärke, nur Stumm). */
      volumeMode: () => nativeVolume ? "native" : "mute-only",
      /** Synchron im Klick-Handler: Freigabe für das <video> (iOS). */
      unlock() {
        try {
          const p = video.play();
          if (p && p.catch) p.catch(() => {
          });
        } catch {
        }
      },
      start,
      /** Zeitstempel (now()) des letzten start(): { src, meta, playing } (null = nicht erreicht). */
      phases: () => ({ ...phases }),
      /** Zusatzmessung des letzten start() (Messanzeige): Zeiten in ms ab loadedmetadata, Puffer/Abweichung in s. */
      metrics() {
        const since = (t) => t != null && phases.meta != null ? Math.max(0, t - phases.meta) : null;
        return {
          jumped: phases.meta != null ? m.jumped : null,
          seekingMs: since(m.seekingAt),
          seekedMs: since(m.seekedAt),
          canplayMs: since(m.canplayAt),
          waitCount: m.waitN,
          waitMs: Math.round(m.waitMs + (m.waitFrom != null ? Math.max(0, now() - m.waitFrom) : 0)),
          bufSeeked: m.bufSeeked,
          bufPlaying: m.bufPlaying,
          devS: m.dev
        };
      },
      clear: () => clear(false),
      positionMs: livePos,
      syncTo(offsetMs2) {
        base = { off: Math.max(0, Number(offsetMs2) || 0), at: now() };
        if (!armed || !playedOnce) return;
        if (Math.abs(video.currentTime * 1e3 - base.off) > 1e4) {
          try {
            video.currentTime = base.off / 1e3;
          } catch {
          }
        }
      },
      setVolume(v) {
        const n = Number(v);
        if (!Number.isFinite(n)) return;
        const c = Math.min(1, Math.max(0, n));
        if (nativeVolume) {
          try {
            video.volume = c;
          } catch {
          }
        }
      },
      setMuted(b) {
        video.muted = !!b;
      },
      setSubtitle({ url, label, lang }) {
        clearSubtitles();
        const el = document.createElement("track");
        el.kind = "subtitles";
        el.label = label || "";
        if (lang) el.srclang = lang;
        el.default = true;
        el.src = url;
        video.appendChild(el);
        trackEl = el;
        try {
          if (el.track) el.track.mode = "showing";
        } catch {
        }
      },
      clearSubtitles,
      dispose() {
        if (disposed) return;
        clear(false);
        disposed = true;
        for (const [name, fn] of Object.entries(listeners)) video.removeEventListener(name, fn);
        if (ms && typeof ms.setActionHandler === "function") {
          for (const a of MEDIA_ACTIONS) {
            try {
              ms.setActionHandler(a, null);
            } catch {
            }
          }
        }
      }
    };
  }

  // src/js/live/player/profile.js
  var MKV = 'video/x-matroska; codecs="avc1.64001f, mp4a.40.2"';
  var MP4 = 'video/mp4; codecs="avc1.64001f, mp4a.40.2"';
  var HEVC_MP4 = 'video/mp4; codecs="hvc1.1.6.L120.90"';
  var HEVC_MKV = 'video/x-matroska; codecs="hvc1.1.6.L120.90"';
  var HLS = "application/vnd.apple.mpegurl";
  var AC3 = 'audio/mp4; codecs="ac-3"';
  var EAC3 = 'audio/mp4; codecs="ec-3"';
  function can(video, type) {
    try {
      return !!(video && typeof video.canPlayType === "function" && video.canPlayType(type));
    } catch {
      return false;
    }
  }
  function canHls(video) {
    return can(video, HLS);
  }
  function canHevc(video) {
    try {
      if (typeof MediaSource !== "undefined" && MediaSource && typeof MediaSource.isTypeSupported === "function" && MediaSource.isTypeSupported(HEVC_MP4)) return true;
    } catch {
    }
    return can(video, HEVC_MP4);
  }
  function extraAudioCodecs(video) {
    const out = [];
    if (can(video, AC3)) out.push("ac3");
    if (can(video, EAC3)) out.push("eac3");
    return out;
  }
  var SUB_FORMATS = ["vtt", "srt", "subrip", "ass", "ssa", "pgssub", "dvdsub", "dvbsub", "sub"];
  function buildDeviceProfile(video, opts = {}) {
    const hevc = !(opts && opts.noHevc) && canHevc(video);
    const extra = extraAudioCodecs(video);
    const directAudio = ["aac", "mp3", ...extra].join(",");
    const direct = [];
    const allowDirect = !(opts && opts.noDirect);
    if (allowDirect && can(video, MKV)) {
      direct.push({ Container: "mkv", Type: "Video", VideoCodec: hevc && can(video, HEVC_MKV) ? "h264,hevc" : "h264", AudioCodec: directAudio });
    }
    if (allowDirect && (can(video, MP4) || hevc)) {
      direct.push({ Container: "mp4,m4v", Type: "Video", VideoCodec: hevc ? "h264,hevc" : "h264", AudioCodec: directAudio });
    }
    return {
      Name: "LenzLive",
      MaxStreamingBitrate: 12e7,
      MaxStaticBitrate: 1e8,
      DirectPlayProfiles: direct,
      TranscodingProfiles: [{
        Container: hevc ? "mp4" : "ts",
        Type: "Video",
        Protocol: "hls",
        Context: "Streaming",
        VideoCodec: hevc ? "hevc,h264" : "h264",
        AudioCodec: ["aac", ...extra].join(","),
        MaxAudioChannels: extra.length ? "6" : "2",
        BreakOnNonKeyFrames: true,
        MinSegments: 1
      }],
      SubtitleProfiles: SUB_FORMATS.map((Format) => ({ Format, Method: "External" }))
    };
  }

  // src/js/live/player/tracks.js
  var TEXT_SUBS = /* @__PURE__ */ new Set(["subrip", "srt", "ass", "ssa", "webvtt", "vtt", "mov_text", "text"]);
  var LANG = {
    de: "ger",
    deu: "ger",
    ger: "ger",
    en: "eng",
    eng: "eng",
    fr: "fra",
    fre: "fra",
    fra: "fra",
    es: "spa",
    spa: "spa",
    it: "ita",
    ita: "ita",
    nl: "nld",
    dut: "nld",
    nld: "nld",
    zh: "zho",
    chi: "zho",
    zho: "zho",
    cs: "ces",
    cze: "ces",
    ces: "ces",
    ja: "jpn",
    jpn: "jpn",
    pt: "por",
    por: "por",
    ru: "rus",
    rus: "rus",
    tr: "tur",
    tur: "tur",
    pl: "pol",
    pol: "pol"
  };
  function normLang(l) {
    const s = String(l || "").trim().toLowerCase();
    return LANG[s] || s;
  }
  function labelOf(s, n) {
    return String(s.DisplayTitle || s.Title || s.Language || `Spur ${n}`);
  }
  function buildTracks(mediaSource) {
    const streams = mediaSource && mediaSource.MediaStreams || [];
    const audio = [];
    const subs = [];
    for (const s of streams) {
      if (!s || typeof s.Index !== "number") continue;
      if (s.Type === "Audio") {
        audio.push({ index: s.Index, label: labelOf(s, audio.length + 1), lang: s.Language || "", isDefault: !!s.IsDefault, codec: String(s.Codec || "").toLowerCase() });
      } else if (s.Type === "Subtitle" && TEXT_SUBS.has(String(s.Codec || "").toLowerCase())) {
        subs.push({ index: s.Index, label: labelOf(s, subs.length + 1), lang: s.Language || "", isDefault: !!s.IsDefault, forced: !!s.IsForced, codec: String(s.Codec).toLowerCase() });
      }
    }
    return { audio, subs };
  }
  function serverDefaultAudio(mediaSource, audio) {
    const d = mediaSource && mediaSource.DefaultAudioStreamIndex;
    if (typeof d === "number") return d;
    const def = audio.find((a) => a.isDefault) || audio[0];
    return def ? def.index : null;
  }
  function pickAudio(audio, defaultIndex, user) {
    const want = normLang(user && user.audioLang);
    if (want) {
      const m = audio.filter((a) => normLang(a.lang) === want);
      if (m.length) return (m.find((a) => a.isDefault) || m[0]).index;
    }
    return defaultIndex;
  }
  function pickSubtitle(subs, user) {
    const mode = String(user && user.subMode || "");
    const want = normLang(user && user.subLang);
    if (mode === "Always") {
      const m = subs.filter((s) => want && normLang(s.lang) === want);
      return m.length ? (m.find((s) => !s.forced) || m[0]).index : -1;
    }
    if (mode === "OnlyForced") {
      const f = subs.filter((s) => s.forced);
      const m = f.filter((s) => want && normLang(s.lang) === want);
      const pick = m[0] || (want ? null : f[0]);
      return pick ? pick.index : -1;
    }
    return -1;
  }
  function isPlainAudioCodec(codec) {
    const c = String(codec || "").toLowerCase();
    return c === "aac" || c === "mp3";
  }

  // src/js/live/player/stream.js
  var VIDEO_REASONS = /* @__PURE__ */ new Set([
    "VideoCodecNotSupported",
    "VideoProfileNotSupported",
    "VideoLevelNotSupported",
    "VideoResolutionNotSupported",
    "VideoBitDepthNotSupported",
    "VideoFramerateNotSupported",
    "RefFramesNotSupported",
    "AnamorphicVideoNotSupported",
    "InterlacedVideoNotSupported",
    "VideoBitrateNotSupported",
    "VideoRangeTypeNotSupported",
    "VideoCodecTagNotSupported",
    "ContainerBitrateExceedsLimit",
    "SubtitleCodecNotSupported"
  ]);
  var fail = (reason, code) => code ? { ok: false, mode: "none", reason, code } : { ok: false, mode: "none", reason };
  var CODE_BY_REASON = [
    ["VideoCodecNotSupported", "V-CODEC"],
    ["VideoCodecTagNotSupported", "V-CODEC"],
    ["VideoProfileNotSupported", "V-CODEC"],
    ["VideoRangeTypeNotSupported", "V-RANGE"],
    ["VideoBitDepthNotSupported", "V-10BIT"],
    ["SubtitleCodecNotSupported", "V-SUB"]
  ];
  function videoCode(reasons) {
    for (const [r, c] of CODE_BY_REASON) if (reasons.includes(r)) return c;
    return "V-OTHER";
  }
  var videoOf = (ms) => (ms && ms.MediaStreams || []).find((s) => s && s.Type === "Video");
  function videoCodecOf(ms) {
    const v = videoOf(ms);
    return v && v.Codec ? String(v.Codec).toLowerCase() : "";
  }
  function rangeOf(v) {
    const t = String(v.VideoRangeType || "");
    if (/^(HDR|HLG|DOVI)/i.test(t)) return short(t, 16).toUpperCase();
    if (/smpte2084/i.test(v.ColorTransfer || "")) return "HDR10";
    if (/arib-std-b67/i.test(v.ColorTransfer || "")) return "HLG";
    return String(v.VideoRange || "").toUpperCase() === "HDR" ? "HDR" : "";
  }
  function videoFormatHint(ms) {
    const v = videoOf(ms);
    if (!v) return null;
    const prof = String(v.Profile || "").toLowerCase();
    const pf = String(v.PixelFormat || "").toLowerCase();
    const bd = Number(v.BitDepth) || 0;
    const lv = Number(v.Level) || 0;
    const w = Number(v.Width) || 0;
    if (videoCodecOf(ms) === "h264") {
      if (bd > 8 || /high ?10|hi10/.test(prof)) return `Bildformat h264 ${bd > 8 ? bd : 10} Bit`;
      if (/4:2:2/.test(prof) || /422/.test(pf)) return "Bildformat h264 4:2:2";
      if (/4:4:4/.test(prof) || /444/.test(pf)) return "Bildformat h264 4:4:4";
      if (pf && !/420|nv12|nv21/.test(pf)) return `Bildformat h264 ${short(pf)}`;
      const hdr = rangeOf(v);
      if (hdr) return `Bildformat h264 ${hdr === "HLG" ? "HLG" : "HDR"}`;
      if (lv > 52) return `Bildformat h264 Level ${(lv / 10).toFixed(1)}`;
    }
    return w > 4096 ? `Aufl\xF6sung ${w}\xD7${Number(v.Height) || "?"}` : null;
  }
  function formatInfo(ms) {
    const v = videoOf(ms);
    if (!v) return "";
    const lv = Number(v.Level) || 0;
    const pf = String(v.PixelFormat || "").toLowerCase();
    const w = Number(v.Width) || 0;
    const h = Number(v.Height) || 0;
    return [
      v.Profile ? String(v.Profile).replace(/[^\w :.-]/g, "").slice(0, 16) : "",
      lv > 0 ? `L${videoCodecOf(ms) === "h264" ? +(lv / 10).toFixed(1) : lv}` : "",
      Number(v.BitDepth) > 0 ? `${Number(v.BitDepth)} Bit` : "",
      pf && !/^yuvj?420p(10|12)?(le|be)?$/.test(pf) ? short(pf, 12) : "",
      w && h ? `${w}\xD7${h}` : "",
      v.IsInterlaced ? "interlaced" : "",
      rangeOf(v)
    ].filter(Boolean).join(" ");
  }
  function reasonsOf(ms) {
    const out = [];
    const add = (v) => {
      const list = Array.isArray(v) ? v : String(v || "").split(",");
      for (const r of list) {
        const t = String(r).trim();
        if (t) out.push(t);
      }
    };
    add(ms.TranscodeReasons);
    if (ms.TranscodingUrl) {
      try {
        add(new URL(ms.TranscodingUrl, "http://x.invalid").searchParams.get("TranscodeReasons"));
      } catch {
      }
    }
    return out;
  }
  var short = (x, n = 12) => String(x == null ? "" : x).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, n);
  function sourceInfo(ms, audioIdx, reasons) {
    const a = (ms.MediaStreams || []).find((s) => s && s.Type === "Audio" && s.Index === audioIdx);
    return {
      container: short(String(ms.Container || "").split(",")[0]),
      v: short(videoCodecOf(ms)),
      a: short(a && a.Codec),
      fmt: formatInfo(ms),
      reasons: reasons.slice(0, 2).map((r) => String(r).replace(/NotSupported$/, "").replace(/[^A-Za-z0-9]/g, "").slice(0, 24)).filter(Boolean)
    };
  }
  function absolute(deps, rel) {
    let origin = "";
    try {
      origin = new URL(deps.streamUrl("/")).origin;
    } catch {
    }
    try {
      return new URL(rel, origin || void 0).href;
    } catch {
      return null;
    }
  }
  async function resolveStream({ deps, video, itemId, audioIndex, signal, noHevc = false, noDirect = false }) {
    const post = async (extra) => {
      const body = {
        UserId: deps.user.id,
        DeviceProfile: buildDeviceProfile(video, { noHevc, noDirect }),
        StartTimeTicks: 0,
        SubtitleStreamIndex: -1,
        EnableDirectPlay: !noDirect,
        EnableDirectStream: true,
        EnableTranscoding: true,
        AllowVideoStreamCopy: true,
        AllowAudioStreamCopy: true,
        AutoOpenLiveStream: false,
        ...extra
      };
      return deps.request("POST", `/Items/${encodeURIComponent(itemId)}/PlaybackInfo`, { params: { userId: deps.user.id }, body, signal });
    };
    try {
      let info = await post({});
      const sources = info && Array.isArray(info.MediaSources) ? info.MediaSources : [];
      if (!sources.length) return info && info.ErrorCode ? fail("video", "V-NOSRC") : fail("network", "NET");
      const first = sources[0];
      const tr = buildTracks(first);
      const def = serverDefaultAudio(first, tr.audio);
      const want = tr.audio.some((a) => a.index === audioIndex) ? audioIndex : pickAudio(tr.audio, def, deps.user);
      const remux = want != null && def != null && want !== def;
      let ms = first;
      if (remux) {
        info = await post({ AudioStreamIndex: want, EnableDirectPlay: false });
        const list = info && Array.isArray(info.MediaSources) ? info.MediaSources : [];
        ms = list.find((s) => s.Id === first.Id) || list[0];
        if (!ms) return fail("network", "NET");
      }
      const audioIdx = want != null ? want : def;
      const reasons0 = ms.SupportsDirectPlay && !remux && !noDirect ? [] : reasonsOf(ms);
      const base = { mediaSource: ms, mediaSourceId: ms.Id, playSessionId: info.PlaySessionId, audioIndex: audioIdx, tracks: tr, info: sourceInfo(ms, audioIdx, reasons0) };
      if (ms.SupportsDirectPlay && !remux && !noDirect) {
        const url2 = deps.streamUrl(`/Videos/${encodeURIComponent(itemId)}/stream`, { static: true, MediaSourceId: ms.Id });
        return { ok: true, mode: "direct", url: url2, ...base };
      }
      const reasons = reasonsOf(ms);
      if (reasons.some((r) => VIDEO_REASONS.has(r))) return fail("video", videoCode(reasons));
      if (ms.TranscodingUrl && /[?&]SubtitleMethod=Encode(?:&|$)/i.test(ms.TranscodingUrl)) return fail("video", "V-SUB");
      if (!ms.TranscodingUrl) {
        const a = tr.audio.find((x) => x.index === audioIdx);
        return a && !isPlainAudioCodec(a.codec) ? fail("audio", "A-CODEC") : fail("video", "V-NOURL");
      }
      if (!canHls(video)) return fail("browser", "B-HLS");
      const url = absolute(deps, ms.TranscodingUrl);
      if (!url) return fail("network", "NET");
      return { ok: true, mode: "hls", url, videoCodec: videoCodecOf(ms), offeredHevc: !noHevc && canHevc(video), ...base };
    } catch {
      return signal && signal.aborted ? fail("aborted") : fail("network", "NET");
    }
  }

  // src/js/live/player/fake.js
  var BARS = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];
  var FAKE_TRACKS = {
    audio: [{ index: 1, label: "Deutsch (Test)", lang: "ger", isDefault: true }],
    subs: [{ index: 2, label: "Deutsch (Test)", lang: "ger", isDefault: false }]
  };
  function formatTimecode(ms) {
    const s = Math.max(0, Math.floor(ms / 1e3));
    const p = (n) => String(n).padStart(2, "0");
    return `${p(Math.floor(s / 3600))}:${p(Math.floor(s % 3600 / 60))}:${p(s % 60)}`;
  }
  function createFakePlayer({ canvas, now = Date.now, getInfo } = {}) {
    const em = createEmitter();
    let playing = false;
    let base = { off: 0, at: 0 };
    let raf = null;
    let audioIndex = 1;
    let subtitleIndex = -1;
    let volume = 1;
    let muted = false;
    let lastTiming = null;
    let zapNo = 0;
    const position = () => base.off + (now() - base.at);
    function draw() {
      if (!canvas) return;
      const ctx = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
      if (!ctx) return;
      const w = canvas.width || 640;
      const h = canvas.height || 360;
      const bw = w / BARS.length;
      BARS.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(i * bw, 0, bw + 1, h * 0.7);
      });
      for (let i = 0; i < 8; i++) {
        const g = Math.round(i / 7 * 255);
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.fillRect(i * w / 8, h * 0.7, w / 8 + 1, h * 0.3);
      }
      const info = (typeof getInfo === "function" ? getInfo() : null) || {};
      const bx = w * 0.2;
      const by = h * 0.04;
      ctx.fillStyle = "#000000";
      ctx.fillRect(bx, by, w * 0.6, h * 0.17);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      const small = Math.round(h / 26);
      ctx.font = `bold ${small}px sans-serif`;
      ctx.fillText(String(info.channel || info.channelName || "TESTBILD"), w * 0.36, by + h * 0.075);
      ctx.font = `${small}px monospace`;
      ctx.fillText(formatTimecode(position()), w * 0.66, by + h * 0.075);
      ctx.font = `${small}px sans-serif`;
      ctx.fillText(String(info.title || ""), w / 2, by + h * 0.14);
    }
    function loop() {
      if (!playing) return;
      draw();
      raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame(loop) : setTimeout(loop, 33);
    }
    function cancelLoop() {
      if (raf == null) return;
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
      clearTimeout(raf);
      raf = null;
    }
    function begin(offsetMs2) {
      cancelLoop();
      base = { off: Math.max(0, Number(offsetMs2) || 0), at: now() };
      playing = true;
      em.emit("state", { phase: "loading" });
      loop();
      em.emit("state", { phase: "playing" });
      zapNo += 1;
      const info = 200 + zapNo * 37 % 5 * 100;
      const load = 700 + zapNo * 53 % 7 * 150;
      const start = 150 + zapNo * 29 % 4 * 50;
      lastTiming = { totalMs: info + load + start, infoMs: info, loadMs: load, startMs: start, chain: "D", cached: zapNo % 3 === 0, mode: "direct" };
      return { ok: true, mode: "direct", timing: { ...lastTiming } };
    }
    return {
      volumeSupported: true,
      volumeMode: () => "native",
      lastTiming: () => lastTiming ? { ...lastTiming } : null,
      prefetch: async () => ({ ok: true }),
      unlock() {
      },
      async play({ offsetMs: offsetMs2 = 0, audioIndex: a, subtitleIndex: s } = {}) {
        audioIndex = typeof a === "number" ? a : 1;
        subtitleIndex = typeof s === "number" ? s : -1;
        return begin(offsetMs2);
      },
      async playUrl(_url, offsetMs2 = 0) {
        return begin(offsetMs2);
      },
      async stop() {
        playing = false;
        cancelLoop();
      },
      syncTo(offsetMs2) {
        base = { off: Math.max(0, Number(offsetMs2) || 0), at: now() };
      },
      setVolume(v) {
        const n = Number(v);
        if (Number.isFinite(n)) volume = Math.min(1, Math.max(0, n));
      },
      setMuted(b) {
        muted = !!b;
      },
      get volume() {
        return volume;
      },
      get muted() {
        return muted;
      },
      tracks() {
        return { audio: FAKE_TRACKS.audio.map((t) => ({ ...t })), subs: FAKE_TRACKS.subs.map((t) => ({ ...t })), audioIndex, subtitleIndex };
      },
      async setAudio(index) {
        audioIndex = index;
        return { ok: true, mode: "direct" };
      },
      async setSubtitle(index) {
        subtitleIndex = typeof index === "number" ? index : -1;
      },
      on: em.on,
      dispose() {
        playing = false;
        cancelLoop();
        em.clear();
      }
    };
  }

  // src/js/live/player/warm.js
  var abs = (rel, base) => {
    try {
      return new URL(rel, base).href;
    } catch {
      return null;
    }
  };
  var lines = (text) => String(text || "").split(/\r?\n/).map((l) => l.trim());
  function parseMaster(text, base) {
    const ls = lines(text);
    for (let i = 0; i < ls.length; i++) {
      if (!ls[i].startsWith("#EXT-X-STREAM-INF")) continue;
      for (let j = i + 1; j < ls.length; j++) {
        if (ls[j] && !ls[j].startsWith("#")) return abs(ls[j], base);
      }
    }
    return null;
  }
  function parseMedia(text, base) {
    let init = null;
    const segments = [];
    let dur = null;
    let at = 0;
    for (const l of lines(text)) {
      if (!l) continue;
      if (l.startsWith("#EXT-X-MAP")) {
        const m = /URI="([^"]+)"/.exec(l);
        if (m) init = abs(m[1], base);
      } else if (l.startsWith("#EXTINF:")) {
        const d = parseFloat(l.slice(8));
        dur = Number.isFinite(d) && d > 0 ? d : 0;
      } else if (!l.startsWith("#")) {
        const url = abs(l, base);
        if (url && dur != null) {
          segments.push({ url, start: at, dur });
          at += dur;
        }
        dur = null;
      }
    }
    return { init, segments };
  }
  function pickSegment(segments, offsetS) {
    if (!segments || !segments.length) return null;
    const t = Math.max(0, Number(offsetS) || 0);
    for (const s of segments) if (t < s.start + s.dur) return s;
    return segments[segments.length - 1];
  }
  function resourceStats(perf, srcPerf) {
    try {
      const list = perf.getEntriesByType("resource") || [];
      let n = 0;
      let first = null;
      for (const e of list) {
        if (!(e.startTime >= srcPerf)) continue;
        const name = String(e.name || "");
        const playlist = /\.m3u8(?:[?#]|$)/i.test(name);
        const seg = !playlist && (/\/hls\d*\//i.test(name) || /\/videos\/[^?#]*\.(?:mp4|ts|m4s)(?:[?#]|$)/i.test(name));
        if (!playlist && !seg) continue;
        n++;
        if (seg && e.responseStart > 0 && (first == null || e.responseStart < first)) first = e.responseStart;
      }
      if (!n) return null;
      return { n, firstSegMs: first == null ? null : Math.max(0, Math.round(first - srcPerf)) };
    } catch {
      return null;
    }
  }

  // src/js/live/player/watch.js
  var LATE_MS = 10 * 6e4;
  var GAP_MS = 6e4;
  var SHARE = 0.9;
  var ELIGIBLE = /* @__PURE__ */ new Set(["program", "fill", "nightfill"]);
  var MAX_RECORDS = 60;
  function createWatchTracker({ setPlayed, now = Date.now } = {}) {
    const records = /* @__PURE__ */ new Map();
    let cur = null;
    const check = (rec, entry) => {
      if (rec.done || !rec.ok) return;
      const run = entry.end - entry.start;
      const pos = Math.min(now(), entry.end) - entry.start;
      if (run > 0 && pos >= SHARE * run) {
        rec.done = true;
        try {
          const p = setPlayed && setPlayed(entry.itemId, true);
          if (p && p.catch) p.catch(() => {
          });
        } catch {
        }
      }
    };
    function leave(silent) {
      if (!cur) return;
      const { rec, entry } = cur;
      if (silent !== true) check(rec, entry);
      rec.leftAt = now();
      cur = null;
    }
    return {
      tune(entry, offsetMs2) {
        const key = entry && entry.itemId != null ? `${entry.itemId}@${entry.start}` : null;
        if (cur && key && cur.key === key) return;
        leave();
        if (!key || !ELIGIBLE.has(entry.type)) return;
        let rec = records.get(key);
        const t = now();
        if (!rec) {
          rec = { ok: (Number(offsetMs2) || 0) <= LATE_MS, leftAt: null, done: false };
          records.set(key, rec);
          if (records.size > MAX_RECORDS) records.delete(records.keys().next().value);
        } else if (rec.leftAt != null && t - rec.leftAt >= GAP_MS) {
          rec.ok = false;
        }
        rec.leftAt = null;
        cur = { rec, entry, key };
      },
      tick() {
        if (!cur) return;
        check(cur.rec, cur.entry);
      },
      leave,
      dispose() {
        leave();
        records.clear();
      }
    };
  }

  // src/js/live/player/filler.js
  async function pickFiller(entry, nextEntry, deps, now = Date.now) {
    const card = { kind: "card" };
    if (!entry || entry.type !== "filler" || !nextEntry || nextEntry.itemId == null) return card;
    let t;
    try {
      t = deps && typeof deps.loadTrailer === "function" ? await deps.loadTrailer(nextEntry.itemId) : null;
    } catch {
      t = null;
    }
    if (!t || !t.url || !(t.durMs > 0) || t.durMs > entry.end - entry.start) return card;
    const startAt = entry.end - t.durMs;
    const n = typeof now === "function" ? now() : Number(now);
    if (n >= startAt && n < entry.end) return { kind: "trailer", url: t.url, offsetMs: n - startAt };
    return n < startAt ? { kind: "card", trailerStartMs: startAt } : card;
  }

  // src/js/live/player/index.js
  var aborted = () => ({ ok: false, mode: "none", reason: "aborted" });
  var CACHE_TTL_MS = 10 * 60 * 1e3;
  var CACHE_MAX = 24;
  var MAX_ATTEMPTS = 3;
  var RETRY_DELAY_MS = 500;
  var DF_KEY = "lfx-directfailed";
  var DF_TTL_MS = 7 * 24 * 3600 * 1e3;
  var DF_MAX = 200;
  var FF_KEY = "lfx-fmp4failed";
  var WARM_LOG_MAX = 20;
  var WARM_TTL_MS = 40 * 1e3;
  var WARM_MAX = 2;
  var WARM_REFRESH_MAX = 10;
  var WARM_PENDING_MAX_MS = 25 * 1e3;
  function createPlayer({ video, deps, now = Date.now, fake = false, canvas, getInfo } = {}) {
    if (fake) return createFakePlayer({ canvas, now, getInfo });
    const em = createEmitter();
    const forceHls = !!(deps && deps.forceHls);
    const vc = createVideoControl(video, { now, emit: em.emit });
    const wantNoDirect = (itemId) => forceHls || directFailed.has(itemId);
    let gen = 0;
    let ac = null;
    let session = null;
    let tr = { audio: [], subs: [], audioIndex: null, subtitleIndex: -1 };
    let disposed = false;
    const fmp4Failed = /* @__PURE__ */ new Set();
    const fmp4Fails = /* @__PURE__ */ new Set();
    let fmp4Ok = false;
    const codecs = /* @__PURE__ */ new Map();
    const deviceTs = () => !fmp4Ok && fmp4Fails.size >= 2;
    const wantTs = (id, r) => !!r && !!r.offeredHevc && r.videoCodec === "h264" && (fmp4Failed.has(id) || deviceTs());
    const noHevcFor = (id) => fmp4Failed.has(id) || deviceTs() && codecs.get(id) === "h264";
    const noteCodec = (id, r) => {
      if (!r || !r.ok || r.mode !== "hls") return;
      if (codecs.size >= DF_MAX) codecs.clear();
      codecs.set(id, r.videoCodec);
    };
    const directFailed = /* @__PURE__ */ new Set();
    const rememberDirectFailed = (itemId) => {
      if (directFailed.size >= DF_MAX) directFailed.clear();
      directFailed.add(itemId);
      cache.delete(itemId);
    };
    const store = deps && deps.storage && typeof deps.storage.getItem === "function" ? deps.storage : null;
    const readDf = (key) => {
      try {
        const o = JSON.parse(store.getItem(key) || "{}");
        return o && typeof o === "object" && !Array.isArray(o) ? o : {};
      } catch {
        return {};
      }
    };
    if (store) {
      const t = now();
      for (const [key, set] of [[DF_KEY, directFailed], [FF_KEY, fmp4Failed]]) {
        for (const [id, at] of Object.entries(readDf(key))) if (typeof at === "number" && t - at < DF_TTL_MS && set.size < DF_MAX) set.add(id);
      }
    }
    const persistId = (key, itemId) => {
      if (!store) return;
      try {
        const t = now();
        const all = readDf(key);
        all[itemId] = t;
        const live = Object.entries(all).filter(([, at]) => typeof at === "number" && t - at < DF_TTL_MS).sort((a, b) => b[1] - a[1]).slice(0, DF_MAX);
        store.setItem(key, JSON.stringify(Object.fromEntries(live)));
      } catch {
      }
    };
    const persistDirectFailed = (itemId) => persistId(DF_KEY, itemId);
    let lastCached = false;
    let lastWarm = null;
    let lastTiming = null;
    const cache = /* @__PURE__ */ new Map();
    const inflight = /* @__PURE__ */ new Map();
    const cancelRequests = () => {
      if (ac) {
        try {
          ac.abort();
        } catch {
        }
      }
      ac = null;
    };
    function teardown() {
      const s = session;
      session = null;
      vc.clear();
      if (s && s.mode === "hls" && s.playSessionId) {
        try {
          return Promise.resolve(deps.request("DELETE", "/Videos/ActiveEncodings", {
            params: { deviceId: deps.server && deps.server.deviceId, playSessionId: s.playSessionId }
          })).then(() => {
          }, () => {
          });
        } catch {
        }
      }
      return Promise.resolve();
    }
    const failure = (reason, code, hint) => {
      const extra = { ...code ? { code } : {}, ...hint ? { hint } : {} };
      em.emit("state", { phase: "error", reason, ...extra });
      em.emit("error", { reason, ...extra });
    };
    const fresh = (e) => !!e && now() - e.at < CACHE_TTL_MS;
    function remember(itemId, r) {
      if (!r || !r.ok) return;
      cache.set(itemId, { at: now(), mode: r.mode, r: r.mode === "direct" && !directFailed.has(itemId) ? r : null });
      while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    }
    function prefetch(itemId, { signal } = {}) {
      if (disposed || !itemId) return Promise.resolve({ ok: false, reason: "aborted" });
      if (fresh(cache.get(itemId))) return Promise.resolve({ ok: true, cached: true });
      const running = inflight.get(itemId);
      if (running) return running;
      const p = resolveStream({ deps, video, itemId, signal, noHevc: false, noDirect: wantNoDirect(itemId) }).then((r) => {
        if (!(signal && signal.aborted)) remember(itemId, r);
        return { ok: !!r.ok, mode: r.mode };
      }, () => ({ ok: false, reason: "network" })).finally(() => {
        if (inflight.get(itemId) === p) inflight.delete(itemId);
      });
      inflight.set(itemId, p);
      return p;
    }
    const warm = /* @__PURE__ */ new Map();
    const warmPending = /* @__PURE__ */ new Map();
    let warmStarted = 0;
    let warmDone = 0;
    const warmLog = /* @__PURE__ */ new Map();
    const logWarm = (id, c) => {
      if (!id) return;
      warmLog.delete(id);
      warmLog.set(id, c);
      while (warmLog.size > WARM_LOG_MAX) warmLog.delete(warmLog.keys().next().value);
    };
    let ctlNote = null;
    const noteSkip = (c) => {
      ctlNote = c || null;
    };
    function armPendingTimeout(itemId, rec) {
      const t = setTimeout(() => {
        if (warmPending.get(itemId) !== rec || rec.taken) return;
        logWarm(itemId, "timeout");
        abortWarmPending(itemId);
      }, WARM_PENDING_MAX_MS);
      return () => clearTimeout(t);
    }
    let warmTimer = null;
    const warmFresh = (e) => now() - e.at < WARM_TTL_MS;
    const doFetch = (url, o) => {
      const f = deps && deps.fetch || (typeof fetch === "function" ? fetch : null);
      if (!f) throw new Error("kein fetch");
      return f(url, o);
    };
    async function getText(url, signal) {
      const res = await doFetch(url, { signal });
      if (!res.ok) throw new Error("http");
      return res.text();
    }
    async function firstByte(url, signal) {
      const c = new AbortController();
      const onAbort = () => c.abort();
      signal.addEventListener("abort", onAbort, { once: true });
      const t = now();
      try {
        const res = await doFetch(url, { signal: c.signal });
        if (!res.ok) return { ok: false };
        const reader = res.body && typeof res.body.getReader === "function" ? res.body.getReader() : null;
        if (reader) await reader.read();
        return { ok: true, ms: Math.max(0, now() - t) };
      } finally {
        signal.removeEventListener("abort", onAbort);
        try {
          c.abort();
        } catch {
        }
      }
    }
    async function warmFetch(r, offsetMs2, signal, part) {
      const t0 = now();
      const text = await getText(r.url, signal);
      const variantUrl = parseMaster(text, r.url);
      const mediaText = variantUrl ? await getText(variantUrl, signal) : text;
      const playlistMs = Math.max(0, now() - t0);
      part.playlistMs = playlistMs;
      const { init, segments } = parseMedia(mediaText, variantUrl || r.url);
      let initMs = null;
      if (init) {
        const t1 = now();
        const res = await doFetch(init, { signal });
        if (!res.ok) throw new Error("http");
        await res.arrayBuffer();
        initMs = Math.max(0, now() - t1);
        part.initMs = initMs;
      }
      const seg = pickSegment(segments, offsetMs2 / 1e3);
      let segFirstByteMs = null;
      if (seg) {
        const fb = await firstByte(seg.url, signal);
        if (fb.ok) {
          segFirstByteMs = fb.ms;
          part.segFirstByteMs = fb.ms;
        }
      }
      return { r, at: now(), offsetMs: offsetMs2, timing: { playlistMs, initMs, segFirstByteMs }, refreshes: 0, segments };
    }
    function deleteWarmSession(r) {
      if (!r || !r.playSessionId) return;
      try {
        Promise.resolve(deps.request("DELETE", "/Videos/ActiveEncodings", {
          params: { deviceId: deps.server && deps.server.deviceId, playSessionId: r.playSessionId }
        })).then(() => {
        }, () => {
        });
      } catch {
      }
    }
    function abortWarmPending(itemId) {
      const rec = warmPending.get(itemId);
      if (!rec) return;
      warmPending.delete(itemId);
      try {
        rec.ac.abort();
      } catch {
      }
    }
    function dropWarm(itemId, why) {
      if (why) logWarm(itemId, why);
      const e = warm.get(itemId);
      warm.delete(itemId);
      abortWarmPending(itemId);
      if (e) deleteWarmSession(e.r);
    }
    function armWarmTimer() {
      clearTimeout(warmTimer);
      warmTimer = null;
      if (disposed || !warm.size) return;
      const t = now();
      let next = Infinity;
      for (const e of warm.values()) next = Math.min(next, e.at + WARM_TTL_MS - t);
      warmTimer = setTimeout(() => {
        warmTimer = null;
        const t2 = now();
        for (const [id, e] of [...warm]) if (t2 - e.at >= WARM_TTL_MS) dropWarm(id, "alt");
        armWarmTimer();
      }, Math.max(50, next + 20));
    }
    function storeWarm(itemId, entry) {
      warm.set(itemId, entry);
      while (warm.size > WARM_MAX) {
        let oldest = null;
        for (const [id, e] of warm) if (id !== itemId && (oldest == null || e.at < warm.get(oldest).at)) oldest = id;
        if (oldest == null) break;
        dropWarm(oldest, "verdr\xE4ngt");
      }
      armWarmTimer();
    }
    function takeWarm(itemId) {
      const e = warm.get(itemId);
      const rec = warmPending.get(itemId);
      const fits = (r) => !wantTs(itemId, r);
      if (!e && rec && rec.r) {
        if (fits(rec.r)) {
          rec.taken = true;
          warmPending.delete(itemId);
          try {
            rec.ac.abort();
          } catch {
          }
          return { r: rec.r, at: rec.at, timing: { ...rec.part }, partial: true };
        }
        logWarm(itemId, "kette");
      }
      abortWarmPending(itemId);
      if (!e) return null;
      if (!warmFresh(e)) {
        dropWarm(itemId, "alt");
        return null;
      }
      if (!fits(e.r)) {
        dropWarm(itemId, "kette");
        return null;
      }
      warm.delete(itemId);
      armWarmTimer();
      return e;
    }
    async function runWarm(itemId, offsetMs2, rec) {
      const signal = rec.ac.signal;
      const pf = inflight.get(itemId);
      if (pf) {
        try {
          await pf;
        } catch {
        }
      }
      if (signal.aborted || disposed) return aborted();
      const c = cache.get(itemId);
      if (fresh(c) && c.mode === "direct" && !directFailed.has(itemId)) {
        logWarm(itemId, "direct");
        return { ok: true, mode: "direct" };
      }
      rec.resolving = resolveStream({ deps, video, itemId, signal, noHevc: noHevcFor(itemId), noDirect: wantNoDirect(itemId) }).then((x) => {
        if (x.ok && x.mode === "hls" && !signal.aborted && !disposed) {
          rec.r = x;
          rec.at = now();
          rec.part = {};
          warmStarted++;
          warmLog.delete(itemId);
          noteCodec(itemId, x);
        }
        return x;
      });
      const r = await rec.resolving;
      if (signal.aborted || disposed) return aborted();
      remember(itemId, r);
      if (!r.ok) {
        logWarm(itemId, "err");
        return { ok: false, mode: r.mode };
      }
      if (r.mode !== "hls") {
        logWarm(itemId, "direct");
        return { ok: true, mode: r.mode };
      }
      let stored = false;
      try {
        const entry = await warmFetch(r, offsetMs2, signal, rec.part);
        if (signal.aborted || disposed) return aborted();
        storeWarm(itemId, entry);
        warmDone++;
        stored = true;
        return { ok: true, mode: "hls", warmed: true };
      } finally {
        if (!stored && !rec.taken) deleteWarmSession(r);
      }
    }
    function refreshWarm(itemId, e, offsetMs2) {
      const running = warmPending.get(itemId);
      if (running) {
        logWarm(itemId, "pending");
        return running.p;
      }
      const seg = pickSegment(e.segments, offsetMs2 / 1e3);
      if (e.refreshes >= WARM_REFRESH_MAX || !seg) {
        logWarm(itemId, "max");
        return Promise.resolve({ ok: true, skipped: true });
      }
      const ac2 = new AbortController();
      const rec = { ac: ac2, p: null };
      const clearTo = armPendingTimeout(itemId, rec);
      rec.p = (async () => {
        try {
          const fb = await firstByte(seg.url, ac2.signal);
          if (ac2.signal.aborted || disposed || warm.get(itemId) !== e) return aborted();
          if (!fb.ok) {
            dropWarm(itemId, "err");
            return { ok: false, reason: "network" };
          }
          e.at = now();
          e.offsetMs = offsetMs2;
          e.refreshes++;
          armWarmTimer();
          return { ok: true, refreshed: true };
        } catch {
          if (!ac2.signal.aborted) logWarm(itemId, "err");
          return { ok: false, reason: "network" };
        }
      })().finally(() => {
        clearTo();
        if (warmPending.get(itemId) === rec) warmPending.delete(itemId);
      });
      warmPending.set(itemId, rec);
      return rec.p;
    }
    function prewarm(itemId, offsetMs2 = 0) {
      if (!(deps && deps.zapWarm) || disposed || !itemId) return Promise.resolve({ ok: false, reason: "off" });
      const off = Number(offsetMs2) || 0;
      const e = warm.get(itemId);
      if (e && warmFresh(e)) return refreshWarm(itemId, e, off);
      if (e) dropWarm(itemId, "alt");
      const running = warmPending.get(itemId);
      if (running) {
        logWarm(itemId, "pending");
        return running.p;
      }
      const ac2 = new AbortController();
      const rec = { ac: ac2, p: null };
      const clearTo = armPendingTimeout(itemId, rec);
      rec.p = runWarm(itemId, off, rec).catch(() => {
        if (!ac2.signal.aborted) logWarm(itemId, "fehler");
        return { ok: false, reason: "network" };
      }).finally(() => {
        clearTo();
        if (warmPending.get(itemId) === rec) warmPending.delete(itemId);
      });
      warmPending.set(itemId, rec);
      return rec.p;
    }
    async function resolveFor(itemId, opts, signal) {
      if (opts.audioIndex == null && !opts.noCache) {
        const rec0 = warmPending.get(itemId);
        if (rec0 && rec0.resolving && !rec0.r && !warm.has(itemId)) {
          try {
            await rec0.resolving;
          } catch {
          }
          if (signal.aborted) return { ok: false, mode: "none", reason: "aborted" };
        }
        const w = takeWarm(itemId);
        if (w) {
          lastWarm = { ageMs: Math.max(0, now() - w.at), timing: w.timing, partial: !!w.partial };
          return w.r;
        }
        const pf = inflight.get(itemId);
        if (pf) {
          try {
            await pf;
          } catch {
          }
          if (signal.aborted) return { ok: false, mode: "none", reason: "aborted" };
        }
        const c = cache.get(itemId);
        if (fresh(c) && c.mode === "direct" && c.r && !directFailed.has(itemId)) {
          lastCached = true;
          return c.r;
        }
      }
      let r;
      try {
        r = await resolveStream({ deps, video, itemId, audioIndex: opts.audioIndex, signal, noHevc: !!opts.noHevc || noHevcFor(itemId), noDirect: wantNoDirect(itemId) });
        noteCodec(itemId, r);
      } catch {
        r = { ok: false, mode: "none", reason: signal.aborted ? "aborted" : "network", ...signal.aborted ? {} : { code: "NET" } };
      }
      if (opts.audioIndex == null) remember(itemId, r);
      return r;
    }
    function makeTiming(tm) {
      const ph = vc.phases();
      const dur = (a, b) => a != null && b != null ? Math.max(0, b - a) : null;
      return {
        totalMs: Math.max(0, now() - tm.t0),
        infoMs: tm.infoAt != null ? Math.max(0, tm.infoAt - tm.t0) : null,
        loadMs: dur(ph.src, ph.meta),
        startMs: dur(ph.meta, ph.playing),
        chain: tm.chain.join(">"),
        cached: tm.cached,
        mode: tm.mode,
        ...tm.hint ? { hint: tm.hint } : {},
        ...extraTiming(tm.info || null, tm.warm, tm.itemId)
      };
    }
    function extraTiming(src, wm, itemId) {
      return {
        ...vc.metrics(),
        forced: forceHls,
        src: src ? { container: src.container, v: src.v, a: src.a, fmt: src.fmt || "", reasons: [...src.reasons] } : null,
        warm: warmTiming(wm, itemId),
        res: resTiming()
      };
    }
    function warmTiming(wm, itemId) {
      if (!(deps && deps.zapWarm)) return { on: false };
      const t = wm && wm.timing || {};
      const skip = wm ? null : warmLog.get(itemId) || ctlNote || "keiner";
      return { on: true, used: !!wm, skip, partial: !!(wm && wm.partial), started: warmStarted, done: warmDone, ageMs: wm ? wm.ageMs : null, playlistMs: t.playlistMs ?? null, initMs: t.initMs ?? null, segFirstByteMs: t.segFirstByteMs ?? null };
    }
    function resTiming() {
      try {
        const at = vc.phases().src;
        if (at == null || typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") return null;
        return resourceStats(performance, performance.now() - (now() - at));
      } catch {
        return null;
      }
    }
    async function play(opts = {}) {
      if (disposed) return aborted();
      const tm = { t0: now(), infoAt: null, chain: [], cached: false, mode: "none", info: null, hint: null, itemId: opts.itemId };
      const res = await playCore(opts, tm);
      if (res.reason === "aborted") return res;
      lastTiming = makeTiming(tm);
      ctlNote = null;
      return { ...res, timing: lastTiming };
    }
    async function playCore(opts, tm) {
      if (disposed) return aborted();
      const { itemId, offsetMs: offsetMs2 = 0 } = opts;
      const my = ++gen;
      cancelRequests();
      ac = new AbortController();
      const signal = ac.signal;
      teardown();
      tr = { audio: [], subs: [], audioIndex: null, subtitleIndex: -1 };
      em.emit("state", { phase: "loading" });
      lastCached = false;
      lastWarm = null;
      let r = await resolveFor(itemId, opts, signal);
      if (my !== gen) return aborted();
      tm.cached = lastCached;
      tm.warm = lastWarm;
      tm.infoAt = now();
      if (r.ok && r.mode === "hls" && wantTs(itemId, r)) {
        r = await resolveFor(itemId, { ...opts, audioIndex: opts.audioIndex ?? r.audioIndex, noHevc: true, noCache: true }, signal);
        if (my !== gen) return aborted();
      }
      if (!r.ok) {
        failure(r.reason, r.code);
        return failResult(r);
      }
      const chain = tm.chain;
      let cur = r;
      let noHevc = !!opts.noHevc;
      let res;
      let fromFmp4 = false;
      let fmp4MediaErr = false;
      let hint = null;
      let tsRetried = false;
      let directMediaError = false;
      for (let attempt = 1; ; attempt++) {
        chain.push(attemptLetter(cur));
        tm.mode = cur.mode;
        tm.info = cur.info || null;
        const wasWarm = attempt === 1 && !!tm.warm;
        res = await launch(cur, opts, offsetMs2, itemId, my);
        if (my !== gen) return aborted();
        if (res.ok) {
          if (cur.mode === "hls" && cur.offeredHevc && cur.videoCodec === "h264") fmp4Ok = true;
          if (fromFmp4) {
            if (fmp4Failed.size >= DF_MAX) fmp4Failed.clear();
            fmp4Failed.add(itemId);
            fmp4Fails.add(itemId);
            if (fmp4MediaErr) persistId(FF_KEY, itemId);
          }
          if (directMediaError) persistDirectFailed(itemId);
          return res;
        }
        if (res.reason !== "video" && res.reason !== "browser" || attempt >= MAX_ATTEMPTS) break;
        let delay = 0;
        if (cur.mode === "direct") {
          if (res.reason === "video" && (res.code === "M3" || res.code === "M4")) directMediaError = true;
          rememberDirectFailed(itemId);
        } else if (cur.mode === "hls" && cur.offeredHevc && cur.videoCodec === "h264") {
          hint = res.reason === "video" && res.code === "M3" ? videoFormatHint(cur.mediaSource) : null;
          if (hint) break;
          noHevc = true;
          fromFmp4 = true;
          fmp4MediaErr = !wasWarm && res.reason === "video" && (res.code === "M3" || res.code === "M4");
        } else if (cur.mode === "hls" && !cur.offeredHevc && !tsRetried) {
          tsRetried = true;
          noHevc = true;
          delay = RETRY_DELAY_MS;
        } else {
          break;
        }
        await teardown();
        if (my !== gen) return aborted();
        if (delay) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          if (my !== gen) return aborted();
        }
        const next = await resolveFor(itemId, { ...opts, audioIndex: opts.audioIndex ?? cur.audioIndex, noHevc, noCache: true }, signal);
        if (my !== gen) return aborted();
        if (!next.ok) break;
        cur = next;
      }
      teardown();
      if (res.reason !== "aborted") {
        const code = res.code && /^(M\d+|B-PLAY)$/.test(res.code) ? `${res.code}\xB7${chain.join(">")}` : res.code;
        if (!hint && res.reason === "video" && res.code === "M3") hint = videoFormatHint(cur.mediaSource);
        tm.hint = hint;
        failure(res.reason, code, hint);
        return failResult({ ...res, code }, hint);
      }
      return failResult(res);
    }
    const attemptLetter = (x) => x.mode === "direct" ? "D" : x.offeredHevc ? "F" : "T";
    const failResult = (x, hint) => ({ ok: false, mode: "none", reason: x.reason, ...x.code ? { code: x.code } : {}, ...hint ? { hint } : {} });
    async function launch(r, opts, offsetMs2, itemId, my) {
      session = { kind: "item", itemId, mode: r.mode, playSessionId: r.playSessionId, mediaSourceId: r.mediaSourceId };
      tr = { audio: r.tracks.audio, subs: r.tracks.subs, audioIndex: r.audioIndex, subtitleIndex: -1 };
      const sub = typeof opts.subtitleIndex === "number" ? opts.subtitleIndex : pickSubtitle(tr.subs, deps.user);
      const subTrack = tr.subs.find((s) => s.index === sub);
      if (subTrack) {
        tr.subtitleIndex = sub;
        vc.setSubtitle({ url: subUrl(itemId, r.mediaSourceId, sub), label: subTrack.label, lang: subTrack.lang });
      }
      const res = await vc.start(r.url, offsetMs2, { quiet: true });
      if (my !== gen) return aborted();
      return res.ok ? { ok: true, mode: r.mode } : res;
    }
    const subUrl = (itemId, msid, index) => deps.streamUrl(`/Videos/${encodeURIComponent(itemId)}/${encodeURIComponent(msid)}/Subtitles/${index}/0/Stream.vtt`, {});
    async function playUrl(url, offsetMs2 = 0) {
      if (disposed) return aborted();
      const my = ++gen;
      cancelRequests();
      teardown();
      tr = { audio: [], subs: [], audioIndex: null, subtitleIndex: -1 };
      session = { kind: "url", mode: "direct" };
      em.emit("state", { phase: "loading" });
      const t0 = now();
      const res = await vc.start(url, offsetMs2);
      if (my !== gen) return aborted();
      const ph = vc.phases();
      const dur = (a, b) => a != null && b != null ? Math.max(0, b - a) : null;
      lastTiming = { totalMs: Math.max(0, now() - t0), infoMs: null, loadMs: dur(ph.src, ph.meta), startMs: dur(ph.meta, ph.playing), chain: "D", cached: false, mode: "direct", ...extraTiming(null, null) };
      if (!res.ok) {
        teardown();
        return { ...failResult(res), timing: lastTiming };
      }
      return { ok: true, mode: "direct", timing: lastTiming };
    }
    return {
      unlock: () => vc.unlock(),
      play,
      playUrl,
      prefetch,
      prewarm,
      /** Vom Controller: Grund, warum gerade nicht vorgewärmt wird (Messanzeige 'Grund'). */
      warmNote: noteSkip,
      async stop() {
        gen++;
        cancelRequests();
        tr = { audio: [], subs: [], audioIndex: null, subtitleIndex: -1 };
        await teardown();
      },
      syncTo: (ms) => vc.syncTo(ms),
      setVolume: (v) => vc.setVolume(v),
      setMuted: (b) => vc.setMuted(b),
      // Lautstärke: 'native' | 'mute-only' (iOS: video.volume ist fest, nur Stumm/Ton an). setVolume wirkt nur bei 'native'.
      get volumeSupported() {
        return vc.volumeSupported;
      },
      volumeMode: () => vc.volumeMode(),
      /** Messung des letzten play()/playUrl(): { totalMs, infoMs, loadMs, startMs, chain, cached, mode } oder null. */
      lastTiming: () => lastTiming ? { ...lastTiming } : null,
      tracks() {
        return { audio: tr.audio.map((t) => ({ ...t })), subs: tr.subs.map((t) => ({ ...t })), audioIndex: tr.audioIndex, subtitleIndex: tr.subtitleIndex };
      },
      async setAudio(index) {
        if (!session || session.kind !== "item") return aborted();
        if (index === tr.audioIndex) return { ok: true, mode: session.mode };
        return play({ itemId: session.itemId, offsetMs: vc.positionMs(), audioIndex: index, subtitleIndex: tr.subtitleIndex });
      },
      async setSubtitle(index) {
        if (!session || session.kind !== "item") return;
        const t = tr.subs.find((s) => s.index === index);
        if (!t) {
          vc.clearSubtitles();
          tr.subtitleIndex = -1;
          return;
        }
        vc.setSubtitle({ url: subUrl(session.itemId, session.mediaSourceId, index), label: t.label, lang: t.lang });
        tr.subtitleIndex = index;
      },
      on: em.on,
      dispose() {
        if (disposed) return;
        disposed = true;
        gen++;
        cancelRequests();
        teardown();
        for (const rec of warmPending.values()) {
          try {
            rec.ac.abort();
          } catch {
          }
        }
        warmPending.clear();
        for (const id of [...warm.keys()]) dropWarm(id);
        clearTimeout(warmTimer);
        warmTimer = null;
        vc.dispose();
        cache.clear();
        inflight.clear();
        em.clear();
      }
    };
  }

  // src/js/live/player/neighbors.js
  var NEIGHBOR_MS = 1e3;
  var ERROR_WARM_MS = 2e3;
  var WARM_TICK_MS = 35e3;
  var WARM_TICK_MAX = 10;
  var WARM_AFTER_ERROR = ["video", "browser", "audio"];
  var RETRY_MS = 1e3;
  var RETRY_MAX = 20;
  var safe = (fn) => {
    try {
      return fn();
    } catch {
      return void 0;
    }
  };
  function prefetchItem(player, itemId, signal) {
    if (!player || typeof player.prefetch !== "function") return;
    const p = safe(() => player.prefetch(itemId, signal ? { signal } : {}));
    if (p && typeof p.catch === "function") p.catch(() => {
    });
  }
  function createNeighbors({ player, scheduler, clock = Date.now, deps = {}, getChannel, getPhase, nch = 18 }) {
    let timer = null;
    let tok = 0;
    let ticks = 0;
    const done = /* @__PURE__ */ new Set();
    const warmOn = () => !!(deps && deps.zapWarm && player && typeof player.prewarm === "function");
    const note = (c) => {
      if (player && typeof player.warmNote === "function") safe(() => player.warmNote(c));
    };
    const wait = (fn, ms) => {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
    const count = () => Math.max(1, Number(typeof nch === "function" ? nch() : nch) || 18);
    function neighbors() {
      const ch = getChannel();
      const n = count();
      const out = [];
      for (const no of [(ch - 2 + n) % n + 1, ch % n + 1]) {
        if (no === ch) continue;
        const cur = safe(() => scheduler.nowOn(no, clock()));
        const e = cur && cur.entry;
        if (e && e.type === "program" && e.itemId) out.push({ no, e, off: cur.offsetMs });
      }
      return out;
    }
    function warm() {
      const list = neighbors();
      for (const x of list) {
        const p = safe(() => player.prewarm(x.e.itemId, x.off));
        if (p && typeof p.catch === "function") p.catch(() => {
        });
      }
      if (!list.length) note("filler");
    }
    function prefetch() {
      for (const x of neighbors()) {
        const key = `${x.no}:${x.e.start}:${x.e.itemId}`;
        if (done.has(key)) continue;
        done.add(key);
        if (done.size > 200) done.delete(done.values().next().value);
        prefetchItem(player, x.e.itemId, null);
      }
    }
    function step(t, mode, tries) {
      if (t !== tok) return;
      const ph = getPhase();
      if (ph !== (mode === "error" ? "error" : "playing")) {
        if (mode === "error") return;
        note("phase");
        if (tries < RETRY_MAX) wait(() => step(t, mode, tries + 1), RETRY_MS);
        return;
      }
      if (!warmOn()) {
        if (mode === "play") prefetch();
        return;
      }
      warm();
      if (ticks >= WARM_TICK_MAX) return;
      ticks++;
      wait(() => step(t, mode, 0), WARM_TICK_MS);
    }
    function stop() {
      tok++;
      clearTimeout(timer);
      timer = null;
    }
    return {
      arm(mode = "play") {
        if (mode === "error" && !warmOn()) return;
        stop();
        ticks = 0;
        const t = tok;
        wait(() => step(t, mode, 0), mode === "error" ? ERROR_WARM_MS : NEIGHBOR_MS);
      },
      stop,
      dispose: stop
    };
  }

  // src/js/live/ui/overlay-util.js
  function genreLabels(scheduler, norms) {
    const list = Array.isArray(norms) ? norms : [];
    let map;
    try {
      map = new Map((scheduler && scheduler.genres ? scheduler.genres() : []).map((g) => [String(g.label).trim().normalize("NFC").toLowerCase(), g.label]));
    } catch {
      map = /* @__PURE__ */ new Map();
    }
    return list.map((n) => map.get(n) || (n ? n.charAt(0).toUpperCase() + n.slice(1) : n));
  }
  function describe(scheduler, entry) {
    const out = { title: "", sub: "", year: null, genres: [], runMin: null, kind: "movie", seriesId: entry.seriesId || null, itemId: entry.itemId || null };
    if (entry.type === "closedown") {
      out.title = "Sendeschluss";
      return out;
    }
    const it = entry.itemId && scheduler && scheduler.item ? scheduler.item(entry.itemId) : null;
    if (!it) {
      out.title = entry.label || "";
      return out;
    }
    const name = it.title || "";
    const series = it.seriesTitle || null;
    const known2 = (n) => n != null && n !== 9999 ? n : null;
    const season = known2(it.season);
    const ep = known2(it.episode);
    if (it.kind === "episode") {
      out.kind = "episode";
      let se = "";
      if (season != null) se += "S" + season;
      if (ep != null) se += (se ? " " : "") + "E" + ep;
      out.title = [series, [se, name].filter(Boolean).join(" ")].filter(Boolean).join(" \u2013 ");
      out.seriesId = out.seriesId || it.seriesId || null;
    } else {
      out.title = name;
    }
    out.year = it.year || null;
    out.genres = genreLabels(scheduler, it.genres);
    out.runMin = it.durMs ? Math.round(it.durMs / 6e4) : null;
    return out;
  }
  function badges(entry) {
    const b = [];
    if (entry.premiere === "film") b.push("Premiere");
    else if (entry.premiere === "episode") b.push("Neue Folge");
    if (entry.rerun) b.push("Wdh.");
    if (entry.age === 16 || entry.age === 18) b.push("ab " + entry.age);
    return b;
  }

  // src/js/live/tvmode/model.js
  var clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  var known = (n) => n != null && n !== 9999 ? n : null;
  var KIND = { program: "program", fill: "fill", nightfill: "fill", filler: "filler", closedown: "closedown" };
  function kindOf(entry) {
    return entry && KIND[entry.type] || "program";
  }
  function nextProgram(scheduler, no, e) {
    let cur = e;
    let first = null;
    for (let i = 0; i < 4; i++) {
      let n;
      try {
        n = scheduler.nowOn(no, cur.end).entry;
      } catch {
        return first;
      }
      if (!n || n.start <= cur.start) return first;
      if (!first) first = n;
      if (n.type !== "filler") return n;
      cur = n;
    }
    return first;
  }
  function itemOf(scheduler, entry) {
    try {
      return entry && entry.itemId != null && scheduler.item ? scheduler.item(entry.itemId) : null;
    } catch {
      return null;
    }
  }
  function titleOf(scheduler, entry) {
    if (!entry) return { title: "", sub: "" };
    if (entry.type === "closedown") return { title: "Sendepause", sub: "" };
    const it = itemOf(scheduler, entry);
    if (!it) return { title: entry.label || "", sub: "" };
    const name = it.title || "";
    if (it.kind === "episode" && it.seriesTitle) {
      const s = known(it.season);
      const ep = known(it.episode);
      let code = "";
      if (s != null) code += "S" + s;
      if (ep != null) code += (code ? " " : "") + "E" + ep;
      return { title: it.seriesTitle, sub: [code, name && name !== it.seriesTitle ? name : ""].filter(Boolean).join(" \xB7 ") };
    }
    return { title: name || "Unbekannter Titel", sub: "" };
  }
  var timeRange = (e) => `${formatClock(e.start)}\u2013${formatClock(e.end)}`;
  function nowAll(scheduler, t) {
    const D = broadcastDayOf(t);
    const out = [];
    for (const channel of scheduler.channels(D)) {
      let entry;
      try {
        entry = scheduler.nowOn(channel.no, t).entry;
      } catch {
        entry = null;
      }
      if (!entry) {
        out.push({ channel, entry: null, progress: 0, next: null });
        continue;
      }
      out.push({
        channel,
        entry,
        progress: clamp((t - entry.start) / Math.max(1, entry.end - entry.start), 0, 1),
        next: nextProgram(scheduler, channel.no, entry)
      });
    }
    return out;
  }
  function cellOf(scheduler, no, e, from, to, now) {
    const kind = kindOf(e);
    let title;
    let sub = "";
    if (kind === "closedown") title = "Sendepause";
    else if (kind === "filler") {
      const nx = nextProgram(scheduler, no, e);
      const nt = nx && nx.type !== "closedown" && nx.type !== "filler" ? titleOf(scheduler, nx).title : "";
      title = nt ? `Gleich: ${nt}` : "Kurze Pause";
    } else if (kind === "fill") {
      title = "F\xFCllprogramm";
      sub = titleOf(scheduler, e).title;
    } else ({ title, sub } = titleOf(scheduler, e));
    return {
      entry: e,
      start: Math.max(e.start, from),
      end: Math.min(e.end, to),
      title,
      sub,
      kind,
      now: now != null && e.start <= now && now < e.end
    };
  }
  function gridRows(scheduler, { from, to, D, now } = {}) {
    const D0 = Number.isInteger(D) ? D : broadcastDayOf(from);
    const rows = scheduler.channels(D0).map((channel) => ({ channel, cells: [] }));
    if (!(to > from)) return rows;
    const D1 = broadcastDayOf(to - 1);
    for (const row of rows) {
      for (let d = Math.min(D0, broadcastDayOf(from)); d <= D1; d++) {
        let list;
        try {
          list = scheduler.planDay(row.channel.no, d);
        } catch {
          continue;
        }
        for (const e of list) {
          if (e.end <= from || e.start >= to) continue;
          row.cells.push(cellOf(scheduler, row.channel.no, e, from, to, now));
        }
      }
    }
    return rows;
  }
  function describe2(scheduler, no, entry, t, opts = {}) {
    const kind = kindOf(entry);
    const base = describe(scheduler, entry);
    const it = itemOf(scheduler, entry);
    const tt = kind === "filler" ? { title: cellOf(scheduler, no, entry, entry.start, entry.end, null).title, sub: "" } : kind === "fill" ? { title: "F\xFCllprogramm", sub: titleOf(scheduler, entry).title } : titleOf(scheduler, entry);
    const b = badges(entry);
    if (entry.theme) b.push(`Thementag: ${entry.theme}`);
    if (kind === "fill") b.push(entry.label || "F\xFCllprogramm");
    const seriesId = base.seriesId || null;
    const hasItem = !!(it && entry.itemId != null);
    let overview = "";
    if (it && typeof it.overview === "string") overview = it.overview;
    else if (opts.overviews && entry.itemId != null && typeof opts.overviews.get === "function") overview = opts.overviews.get(entry.itemId) || "";
    return {
      title: tt.title,
      sub: tt.sub,
      time: timeRange(entry),
      progress: clamp((t - entry.start) / Math.max(1, entry.end - entry.start), 0, 1),
      badges: b,
      kind,
      itemId: entry.itemId != null ? entry.itemId : null,
      seriesId,
      imageItemId: hasItem ? it.kind === "episode" && seriesId ? seriesId : entry.itemId : null,
      overview,
      year: base.year,
      genres: base.genres,
      runMin: base.runMin
    };
  }
  function days(t) {
    const D = broadcastDayOf(t);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const f = formatDay(D + i);
      out.push({ D: D + i, label: i === 0 ? "Heute" : i === 1 ? "Morgen" : `${f.weekday} ${f.date}` });
    }
    return out;
  }
  function channelName(channel) {
    if (!channel) return "";
    const raw = String(channel.genreLabel || channel.name || "").replace(/^LIVE\s+/i, "").trim();
    if (!raw || /^\d+$/.test(raw)) return channel.no ? `Sender ${channel.no}` : "";
    return raw;
  }

  // src/js/live/tvmode/controller.js
  var DEBOUNCE_MS = 250;
  var STATS_MAX = 10;
  var RETRY_MS2 = 1e4;
  var SYNC_MS = 3e4;
  var STALL_MS = 6e4;
  var MAX_TIMEOUT = 2147483647;
  var VOL_STEP = 5;
  var VOL_SETTLE_MS = 1e3;
  var PLAYABLE = ["program", "fill", "nightfill"];
  var NCH = 18;
  var clamp2 = (n, a, b) => Math.max(a, Math.min(b, n));
  var ERROR_TEXTS = {
    video: { title: "Kein Empfang auf diesem Ger\xE4t", sub: "Dieses Ger\xE4t kann den Sender nicht empfangen" },
    browser: { title: "Kein Empfang auf diesem Ger\xE4t", sub: "Bitte einen anderen Browser verwenden" },
    audio: { title: "Ton auf diesem Ger\xE4t nicht empfangbar", sub: "Dem Konto fehlt die Berechtigung zur Ton-Umwandlung" },
    gesture: { title: "Zum Starten tippen", sub: "Der Browser braucht einmal ein Tippen" },
    network: { title: "Empfangsst\xF6rung \u2013 erneuter Versuch \u2026", sub: "" }
  };
  var safe2 = (fn) => {
    try {
      return fn();
    } catch {
      return void 0;
    }
  };
  function createTvController({ scheduler, player, watch = null, pickFiller: pickFiller2 = null, deps = {}, now = Date.now, opts = {} } = {}) {
    const em = createEmitter();
    const clock = typeof now === "function" ? now : Date.now;
    const o = opts || {};
    let disposed = false;
    let on = false;
    let channel = clamp2(Math.round(Number(o.lastChannel) || 1), 1, NCH);
    let entry = null;
    let view = null;
    let gen = 0;
    let playing = false;
    let phase = "off";
    let reason = null;
    let card = null;
    let banner = null;
    let needsTap = false;
    let mutedByPolicy = false;
    let stallArmed = false;
    let tickCount = 0;
    let lastDay = null;
    let tickIv = null;
    let snap = null;
    let pfAc = null;
    let tuneAt = 0;
    const zaps = [];
    const T = {};
    const offs = [];
    const volRaw = o.volume == null ? 1 : Number(o.volume);
    let vol = clamp2(Math.round((volRaw > 1 ? volRaw / 100 : volRaw) * 100), 0, 100);
    let muted = !!o.muted;
    const later = (name, fn, ms) => {
      clearTimeout(T[name]);
      T[name] = setTimeout(fn, ms);
    };
    const unlater = (name) => {
      clearTimeout(T[name]);
      T[name] = null;
    };
    function build() {
      return Object.freeze({
        on,
        channel,
        entry: view,
        phase,
        reason,
        card,
        banner,
        needsTap,
        mutedByPolicy,
        volume: vol,
        muted: silent() || mutedByPolicy
      });
    }
    function state() {
      return snap || (snap = build());
    }
    function changed() {
      if (disposed) return;
      snap = null;
      em.emit("change", state());
    }
    const message = (text) => {
      if (!disposed) em.emit("message", text);
    };
    const frozen = (c) => Object.freeze(c);
    const savePrefs = (partial) => {
      if (deps && deps.savePrefs) safe2(() => deps.savePrefs(partial));
    };
    const muteOnly = () => safe2(() => player.volumeMode ? player.volumeMode() : player.volumeSupported === false ? "mute-only" : "native") === "mute-only";
    const silent = () => muted || vol === 0;
    let lastVol = vol > 0 ? vol : 50;
    let volPrev = vol;
    let volAt = clock();
    function noteVol() {
      if (vol === volPrev) return;
      const t = clock();
      if (volPrev > 0 && t - volAt >= VOL_SETTLE_MS) lastVol = volPrev;
      volPrev = vol;
      volAt = t;
    }
    function applyVolume() {
      noteVol();
      safe2(() => player.setVolume && player.setVolume(muteOnly() ? 1 : vol / 100));
      safe2(() => player.setMuted && player.setMuted(silent()));
    }
    const volumeSupported = () => true;
    function setVolume(v) {
      if (disposed) return;
      v = clamp2(Math.round((Number(v) || 0) / VOL_STEP) * VOL_STEP, 0, 100);
      mutedByPolicy = false;
      vol = v;
      muted = false;
      applyVolume();
      savePrefs({ volume: vol / 100, muted });
      changed();
    }
    function setMuted(b) {
      if (disposed) return;
      muted = !!b;
      mutedByPolicy = false;
      const restore = !muted && vol === 0;
      if (restore) vol = lastVol;
      applyVolume();
      savePrefs(restore ? { volume: vol / 100, muted } : { muted });
      changed();
    }
    function toggleMute() {
      if (disposed) return;
      if (mutedByPolicy) {
        mutedByPolicy = false;
        applyVolume();
        if (!muted) {
          changed();
          return;
        }
      }
      setMuted(!silent());
    }
    function watchTune() {
      if (!watch || !entry) return;
      const off = Math.max(0, clock() - entry.start);
      safe2(() => watch.tune(entry, off));
    }
    const watchLeave = (silent2) => {
      if (watch) safe2(() => watch.leave(silent2));
    };
    function clearStall() {
      stallArmed = false;
      unlater("stall");
    }
    function nextTitle(e) {
      const nx = nextProgram(scheduler, channel, e);
      const nt = nx && PLAYABLE.includes(nx.type) ? titleOf(scheduler, nx).title : null;
      return { nx, nt };
    }
    function showPause(e) {
      const { nx, nt } = nextTitle(e);
      phase = "pause";
      reason = null;
      card = nt && nx ? frozen({ kind: "next", title: nt, at: formatClock(nx.start), atMs: nx.start }) : frozen({ kind: "pause", text: "Gleich geht es weiter" });
      changed();
    }
    function showClosedown(e) {
      phase = "closedown";
      reason = e.reason || null;
      if (e.reason === "empty") {
        card = frozen({ kind: "empty", text: "Auf diesem Sender l\xE4uft gerade nichts" });
      } else {
        const nx = nextProgram(scheduler, channel, e);
        card = frozen({ kind: "closedown", text: "Sendepause", until: formatClock(nx ? nx.start : e.end) });
      }
      changed();
    }
    function showError(why, g, code, hint) {
      playing = false;
      clearStall();
      watchLeave(true);
      needsTap = why === "gesture";
      const key = ERROR_TEXTS[why] ? why : "network";
      phase = "error";
      reason = key;
      const shown = code || (key === "network" ? "NET" : "");
      card = frozen({ kind: "error", reason: key, title: ERROR_TEXTS[key].title, sub: ERROR_TEXTS[key].sub, ...shown ? { code: String(shown) } : {}, ...hint ? { hint: `${hint} wird von diesem Ger\xE4t nicht unterst\xFCtzt` } : {} });
      unlater("retry");
      if (key === "network") later("retry", () => {
        if (g === gen && on) start(g, false);
      }, RETRY_MS2);
      if (WARM_AFTER_ERROR.includes(key)) nb.arm("error");
      changed();
    }
    function handleResult(res, g, e) {
      if (g !== gen) return false;
      if (res && res.ok === false) {
        if (res.reason === "aborted") return false;
        showError(res.reason || "network", g, res.code, res.hint);
        if (e === entry) em.emit("zap", { channel, ok: false, reason: res.reason || "network", code: res.code, keyMs: tuneAt ? Math.max(0, clock() - tuneAt) : null, timing: res.timing || null });
        return false;
      }
      card = null;
      reason = null;
      phase = "playing";
      playing = true;
      if (silent()) safe2(() => player.setMuted && player.setMuted(true));
      if (e === entry) watchTune();
      const keyMs = tuneAt ? Math.max(0, clock() - tuneAt) : null;
      if (tuneAt) {
        zaps.push({ channel, ms: keyMs, ...res && res.timing ? { timing: { ...res.timing } } : {} });
        if (zaps.length > STATS_MAX) zaps.shift();
        tuneAt = 0;
      }
      if (e === entry) em.emit("zap", { channel, ok: true, keyMs, timing: res && res.timing || null });
      if (e === entry && e.type === "program") nb.arm("play");
      changed();
      return true;
    }
    function abortPrefetch() {
      if (pfAc) {
        try {
          pfAc.abort();
        } catch {
        }
        pfAc = null;
      }
    }
    const prefetchTarget = (itemId, signal) => prefetchItem(player, itemId, signal);
    const nb = createNeighbors({
      player,
      scheduler,
      clock,
      deps,
      nch: NCH,
      getChannel: () => channel,
      getPhase: () => phase === "error" ? "error" : playing ? phase : "loading"
    });
    function armAdvance(e, g) {
      later("advance", () => advance(g), clamp2(e.end - clock() + 30, 50, MAX_TIMEOUT));
    }
    function advance(g) {
      if (g !== gen || !on) return;
      const t = clock();
      let n;
      try {
        n = scheduler.nowOn(channel, t);
      } catch {
        later("advance", () => advance(g), 1e3);
        return;
      }
      if (entry && n.entry.start === entry.start && t < entry.end) {
        armAdvance(entry, g);
        return;
      }
      const ng = ++gen;
      watchLeave();
      playEntry(n.entry, n.offsetMs, ng);
    }
    async function playEntry(e, offsetMs2, g) {
      entry = e;
      view = e;
      playing = false;
      unlater("retry");
      unlater("trailer");
      nb.stop();
      armAdvance(e, g);
      needsTap = false;
      clearStall();
      watchLeave(true);
      banner = e.type === "fill" ? "F\xFCllprogramm" : e.type === "nightfill" ? e.label || "F\xFCllprogramm \u2013 regul\xE4res Programm ab 5:00" : null;
      if (PLAYABLE.includes(e.type) && e.itemId) {
        phase = "loading";
        reason = null;
        card = null;
        changed();
        let res;
        try {
          res = await player.play({ itemId: e.itemId, offsetMs: offsetMs2 });
        } catch {
          res = { ok: false, reason: "network" };
        }
        handleResult(res, g, e);
        return;
      }
      if (e.type === "filler") {
        phase = "loading";
        reason = null;
        card = null;
        changed();
        await runFiller(e, g);
        return;
      }
      safe2(() => player.stop());
      if (e.type === "fill" || e.type === "nightfill") {
        showPause(e);
        return;
      }
      showClosedown(e);
    }
    async function runFiller(e, g) {
      let next;
      try {
        next = scheduler.nowOn(channel, e.end).entry;
      } catch {
        next = null;
      }
      let pick = { kind: "card" };
      if (pickFiller2) {
        try {
          pick = await pickFiller2(e, next, deps, clock);
        } catch {
          pick = { kind: "card" };
        }
      }
      if (g !== gen) return;
      if (pick && pick.kind === "trailer") {
        let res;
        try {
          res = await player.playUrl(pick.url, pick.offsetMs || 0);
        } catch {
          res = { ok: false, reason: "network" };
        }
        if (g !== gen) return;
        if (res && res.ok !== false) {
          phase = "playing";
          reason = null;
          card = null;
          changed();
          return;
        }
      }
      safe2(() => player.stop());
      showPause(e);
      const ts = pick && pick.trailerStartMs;
      if (ts && ts > clock()) later("trailer", () => {
        if (g === gen && on) runFiller(e, g);
      }, clamp2(ts - clock() + 20, 20, MAX_TIMEOUT));
    }
    async function start(g, save = true) {
      if (g !== gen || !on) return;
      if (save) savePrefs({ lastChannel: channel });
      let n;
      try {
        n = scheduler.nowOn(channel, clock());
      } catch {
        showError("network", g);
        return;
      }
      await playEntry(n.entry, n.offsetMs, g);
    }
    function tune(no, { immediate = false } = {}) {
      if (!on || disposed) return;
      if (!Number.isFinite(Number(no))) return;
      no = ((Math.round(Number(no)) - 1) % NCH + NCH) % NCH + 1;
      if (no === channel && entry) return;
      channel = no;
      const g = ++gen;
      for (const k of ["zap", "advance", "retry", "trailer"]) unlater(k);
      nb.stop();
      abortPrefetch();
      tuneAt = clock();
      clearStall();
      needsTap = false;
      watchLeave();
      if (!immediate) safe2(() => player.stop());
      playing = false;
      entry = null;
      try {
        view = scheduler.nowOn(no, clock()).entry;
      } catch {
        view = null;
      }
      banner = null;
      card = null;
      reason = null;
      phase = "loading";
      changed();
      if (immediate) start(g);
      else {
        if (view && view.itemId && PLAYABLE.includes(view.type)) {
          pfAc = typeof AbortController === "function" ? new AbortController() : null;
          prefetchTarget(view.itemId, pfAc && pfAc.signal);
        }
        later("zap", () => start(g), DEBOUNCE_MS);
      }
    }
    function zap(delta) {
      tune(channel + (Number(delta) || 0));
    }
    function onTick() {
      if (!on || disposed) return;
      const t = clock();
      if (watch) safe2(() => watch.tick());
      tickCount++;
      if (tickCount % (SYNC_MS / 1e3) === 0 && playing && entry && PLAYABLE.includes(entry.type) && entry.itemId) {
        safe2(() => player.syncTo(t - entry.start));
      }
      const D = broadcastDayOf(t);
      if (lastDay != null && D !== lastDay) {
        if (scheduler.prepare) Promise.resolve(safe2(() => scheduler.prepare([0, 1, 2, 3, 4, 5, 6].map((i) => D + i)))).catch(() => {
        });
        em.emit("day", D);
      }
      lastDay = D;
      em.emit("tick", t);
    }
    function start0() {
      if (disposed) return;
      safe2(() => player.unlock && player.unlock());
      if (on) return;
      on = true;
      tickCount = 0;
      lastDay = broadcastDayOf(clock());
      if (!tickIv) tickIv = setInterval(onTick, 1e3);
      applyVolume();
      tune(channel, { immediate: true });
    }
    function stop() {
      if (!on) return;
      gen++;
      for (const k of ["zap", "advance", "retry", "trailer"]) unlater(k);
      nb.stop();
      abortPrefetch();
      tuneAt = 0;
      clearStall();
      if (tickIv) {
        clearInterval(tickIv);
        tickIv = null;
      }
      watchLeave();
      safe2(() => player.stop());
      on = false;
      playing = false;
      needsTap = false;
      mutedByPolicy = false;
      entry = null;
      view = null;
      card = null;
      banner = null;
      reason = null;
      phase = "off";
      changed();
    }
    function gesture() {
      if (disposed) return;
      safe2(() => player.unlock && player.unlock());
      if (!on) return;
      const retry2 = needsTap;
      const policy = mutedByPolicy;
      needsTap = false;
      mutedByPolicy = false;
      if (retry2 || policy) applyVolume();
      if (retry2) {
        card = null;
        reason = null;
        phase = "loading";
        changed();
        start(++gen, false);
      } else if (policy) changed();
    }
    function retry() {
      if (!on || disposed) return;
      for (const k of ["retry", "trailer"]) unlater(k);
      clearStall();
      card = null;
      reason = null;
      phase = "loading";
      changed();
      start(++gen, false);
    }
    function tracks() {
      const tr = safe2(() => player.tracks && player.tracks());
      return tr || { audio: [], subs: [], audioIndex: null, subtitleIndex: -1 };
    }
    async function setAudio(i) {
      let res;
      try {
        res = await player.setAudio(i);
      } catch {
        res = { ok: false };
      }
      if (res && res.ok === false && res.reason !== "aborted") message("Diese Tonspur ist nicht verf\xFCgbar");
      return res;
    }
    async function setSubtitle(i) {
      try {
        await player.setSubtitle(i);
      } catch {
        message("Untertitel nicht verf\xFCgbar");
      }
    }
    function restartTarget() {
      const e = view;
      if (!on || !e || !e.itemId || !PLAYABLE.includes(e.type)) return null;
      const it = safe2(() => scheduler.item(e.itemId));
      const seriesId = e.seriesId || it && it.seriesId || null;
      const type = it && it.kind ? String(it.kind).toLowerCase() : seriesId ? "episode" : "movie";
      return { itemId: e.itemId, type, seriesId };
    }
    if (player && typeof player.on === "function") {
      offs.push(player.on("state", (s) => {
        if (!on) return;
        const ph = s && s.phase;
        if (ph === "stalled") {
          if (!stallArmed && entry) {
            stallArmed = true;
            later("stall", () => watchLeave(true), STALL_MS);
          }
          if (phase === "playing") {
            phase = "loading";
            changed();
          }
        } else if (ph === "loading") {
          if (phase === "playing") {
            phase = "loading";
            changed();
          }
        } else if (ph === "playing") {
          if (stallArmed) clearStall();
          if (playing) watchTune();
          if (phase === "loading" && playing) {
            phase = "playing";
            changed();
          }
        } else if (ph === "error") {
          clearStall();
          watchLeave(true);
        }
        if (ph === "ended" && entry && entry.type === "filler" && !card) showPause(entry);
      }));
      offs.push(player.on("autoplay-muted", () => {
        if (!on) return;
        mutedByPolicy = true;
        if (!muted) message("Ton aus \u2013 zum Einschalten tippen");
        changed();
      }));
      offs.push(player.on("error", (err) => {
        if (!on || !entry || entry.type === "filler" || phase === "error") return;
        showError(err && err.reason || "network", gen, err && err.code, err && err.hint);
      }));
    }
    return {
      start: start0,
      stop,
      tune,
      zap,
      gesture,
      retry,
      setVolume,
      setMuted,
      toggleMute,
      get volumeSupported() {
        return volumeSupported();
      },
      /** 'native' | 'mute-only' (Messanzeige). */
      volumeMode: () => muteOnly() ? "mute-only" : "native",
      tracks,
      setAudio,
      setSubtitle,
      restartTarget,
      state,
      /** Messung für das Debug-Fenster: letzte Umschaltungen (tune → playing) in ms. */
      stats() {
        const ms = zaps.map((z) => z.ms);
        return { zaps: zaps.map((z) => ({ ...z, ...z.timing ? { timing: { ...z.timing } } : {} })), lastMs: ms.length ? ms[ms.length - 1] : null, avgMs: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null };
      },
      on: (name, fn) => em.on(name, fn),
      dispose() {
        if (disposed) return;
        stop();
        disposed = true;
        abortPrefetch();
        nb.dispose();
        for (const k of Object.keys(T)) clearTimeout(T[k]);
        if (tickIv) {
          clearInterval(tickIv);
          tickIv = null;
        }
        for (const off of offs) if (typeof off === "function") safe2(off);
        offs.length = 0;
        if (watch) safe2(() => watch.dispose && watch.dispose());
        if (player) safe2(() => player.dispose && player.dispose());
        em.clear();
      }
    };
  }

  // src/js/live/tvmode/details.js
  function createDetails({ deps = {}, delayMs = 400, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    const texts = /* @__PURE__ */ new Map();
    const inflight = /* @__PURE__ */ new Set();
    const subs = /* @__PURE__ */ new Set();
    let waitId = null;
    let timer = null;
    let alive = true;
    const can2 = () => typeof deps.itemDetails === "function";
    async function load(id) {
      if (!alive || !can2() || texts.has(id) || inflight.has(id)) return;
      inflight.add(id);
      let text;
      try {
        const res = await deps.itemDetails([id]);
        const v = res && typeof res.get === "function" ? res.get(id) : null;
        text = v && typeof v.overview === "string" ? v.overview : "";
      } catch {
        text = "";
      }
      inflight.delete(id);
      if (!alive) return;
      texts.set(id, text);
      for (const fn of [...subs]) {
        try {
          fn(id, text);
        } catch {
        }
      }
    }
    return {
      /** Text oder undefined (noch nicht geladen). Leerer String = geladen, aber ohne Inhaltsangabe. */
      get: (id) => texts.get(id),
      /** Lädt die Inhaltsangabe entprellt; eine noch wartende andere Id wird verworfen. */
      request(id) {
        if (!alive || !id || !can2() || texts.has(id) || inflight.has(id)) return;
        waitId = id;
        if (timer) clearTimer(timer);
        timer = setTimer(() => {
          timer = null;
          const next = waitId;
          waitId = null;
          if (next) load(next);
        }, delayMs);
      },
      /** Live-Map id → Text (nur lesen), passend für model.describe(…, { overviews }). */
      map: () => texts,
      on(fn) {
        if (typeof fn !== "function") return () => {
        };
        subs.add(fn);
        return () => subs.delete(fn);
      },
      dispose() {
        alive = false;
        if (timer) clearTimer(timer);
        timer = null;
        waitId = null;
        subs.clear();
      }
    };
  }

  // src/js/live/ui/fullscreen.js
  function createFullscreen({ target, doc = document, onChange } = {}) {
    let cssOn = false;
    const fsEl = () => doc.fullscreenElement || doc.webkitFullscreenElement || null;
    const canNative = () => {
      const enabled = doc.fullscreenEnabled !== false && doc.webkitFullscreenEnabled !== false;
      return enabled && !!(target && (typeof target.requestFullscreen === "function" || typeof target.webkitRequestFullscreen === "function"));
    };
    const isOn = () => cssOn || fsEl() === target;
    const sync = () => {
      if (target) target.classList.toggle("is-fullscreen", isOn());
      if (onChange) onChange(isOn());
    };
    function enter() {
      if (isOn()) return;
      if (canNative()) {
        try {
          const p = (target.requestFullscreen || target.webkitRequestFullscreen).call(target);
          if (p && typeof p.catch === "function") p.catch(() => {
            cssOn = true;
            sync();
          });
          return;
        } catch {
        }
      }
      cssOn = true;
      sync();
    }
    function exit() {
      if (!isOn()) return;
      cssOn = false;
      if (fsEl() === target) {
        try {
          (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
        } catch {
        }
      }
      sync();
    }
    const onNative = () => {
      if (fsEl() !== target) cssOn = cssOn && !canNative();
      sync();
    };
    doc.addEventListener("fullscreenchange", onNative);
    doc.addEventListener("webkitfullscreenchange", onNative);
    return {
      toggle() {
        if (isOn()) exit();
        else enter();
      },
      enter,
      exit,
      isOn,
      native: () => fsEl() === target,
      destroy() {
        doc.removeEventListener("fullscreenchange", onNative);
        doc.removeEventListener("webkitfullscreenchange", onNative);
        if (fsEl() === target) {
          try {
            (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
          } catch {
          }
        }
        cssOn = false;
        if (target) target.classList.remove("is-fullscreen");
      }
    };
  }

  // src/js/live/ui/zapstats.js
  var AVG_MAX = 10;
  var STYLE = [
    "position:absolute",
    "top:6px",
    "left:6px",
    "z-index:50",
    "max-width:calc(100% - 12px)",
    "box-sizing:border-box",
    "padding:4px 6px",
    "border-radius:4px",
    "background:rgba(0,0,0,.62)",
    "color:#e8e8e8",
    "font:11px/1.35 ui-monospace,Menlo,Consolas,monospace",
    "white-space:pre-wrap",
    "overflow-wrap:anywhere",
    "pointer-events:none"
  ].join(";");
  var sec = (ms) => (Math.max(0, Number(ms) || 0) / 1e3).toFixed(1).replace(".", ",");
  var num2 = (n) => Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "\u2013";
  var sec1 = (ms) => ms == null ? "\u2013" : sec(ms);
  var sgn = (s) => Number.isFinite(s) ? `${s < 0 ? "-" : "+"}${Math.abs(s).toFixed(1).replace(".", ",")}` : "\u2013";
  var range = (r) => Array.isArray(r) ? `${sgn(r[0])}\u2026${sgn(r[1])}` : "\u2013";
  function detailLine(t) {
    if (!t || t.jumped === void 0) return "";
    const p = [];
    const s = t.src;
    if (s) {
      const q = [s.container, s.v, s.a].filter(Boolean).join("\xB7");
      if (q) p.push(`Quelle ${q}${s.fmt ? ` \xB7 ${s.fmt}` : ""}`);
      if (s.reasons && s.reasons.length) p.push(`Grund ${s.reasons.join(",")}`);
    }
    if (t.forced) p.push("HLS erzwungen");
    if (t.jumped != null) {
      p.push(`Sprung ${t.jumped ? "ja" : "nein"}`);
      if (Number.isFinite(t.devS)) p.push(`Abw ${sgn(t.devS)}`);
      p.push(`Seek ${sec1(t.seekingMs)}/${sec1(t.seekedMs)}`, `canplay ${sec1(t.canplayMs)}`);
      p.push(`Puffer ${range(t.bufSeeked)} \u2192 ${range(t.bufPlaying)}`);
      p.push(`Warten ${t.waitCount || 0}\xD7${t.waitCount ? ` ${sec(t.waitMs)} s` : ""}`);
    }
    return p.join(" \xB7 ");
  }
  function warmLine(t) {
    const w = t && t.warm;
    if (!w) return "";
    const r = t.res;
    const res = r ? `Res ${r.n}/${r.firstSegMs == null ? "\u2013" : `${sec(r.firstSegMs)} s`}` : "Res \u2013";
    if (!w.on) return `Vorw\xE4rmen aus \xB7 ${res}`;
    const vw = w.started == null ? [] : [`Vw ${w.done || 0}/${w.started}`];
    if (!w.used) return ["Vorw\xE4rmen an", "genutzt nein", ...vw, `Grund ${w.skip || "\u2013"}`, res].join(" \xB7 ");
    return [
      "Vorw\xE4rmen an",
      w.partial ? "genutzt teilweise" : "genutzt ja",
      `Alter ${w.ageMs == null ? "\u2013" : `${Math.round(w.ageMs / 1e3)} s`}`,
      `Liste ${sec1(w.playlistMs)}`,
      `Init ${sec1(w.initMs)}`,
      `Seg 1. Byte ${sec1(w.segFirstByteMs)}`,
      ...vw,
      res
    ].join(" \xB7 ");
  }
  function createZapStats(parent, { getVideo = null, doc = null } = {}) {
    const d = doc || parent && parent.ownerDocument || document;
    const el = d.createElement("div");
    el.className = "lfx-zapstats";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = STYLE;
    const l1 = d.createElement("div");
    const l2 = d.createElement("div");
    const l3 = d.createElement("div");
    const l4 = d.createElement("div");
    el.append(l1, l2, l3, l4);
    parent.append(el);
    const hist = [];
    let audio = { mode: "", level: null };
    let destroyed = false;
    function renderAudio() {
      const v = typeof getVideo === "function" ? getVideo() : null;
      const mode = audio.mode || "?";
      const muted = v ? v.muted ? "ja" : "nein" : "?";
      const vol = v ? num2(Number(v.volume)) : "?";
      const level = audio.level == null ? "?" : String(Math.round(Number(audio.level)));
      l2.textContent = `Ton: ${mode} \xB7 muted ${muted} \xB7 vol ${vol} \xB7 Regler ${level}`;
    }
    renderAudio();
    return {
      el,
      update(z) {
        if (destroyed || !z) return;
        const t = z.timing || null;
        const parts = [`Sender ${z.channel == null ? "?" : z.channel}`];
        if (z.ok === false) {
          const ch = t && t.chain && !String(z.code || "").includes(t.chain) ? t.chain : "";
          parts.push("FEHLER", [z.code, ch].filter(Boolean).join(" ") || z.reason || "?");
          if (z.hint || t && t.hint) parts.push(z.hint || t.hint);
          if (t) parts.push(`${sec(t.totalMs)} s`);
        } else {
          const total = t ? t.totalMs : z.totalMs;
          if (total != null) {
            hist.push(total);
            if (hist.length > AVG_MAX) hist.shift();
          }
          parts.push(`${total != null ? sec(total) : "?"} s`);
          if (t) {
            if (t.chain) parts.push(t.chain);
            parts.push(`Info ${sec(t.infoMs)}${t.cached ? " Cache" : ""}`);
            if (t.loadMs != null) parts.push(`Laden ${sec(t.loadMs)}`);
            if (t.startMs != null) parts.push(`Start ${sec(t.startMs)}`);
          }
          if (z.keyMs != null) parts.push(`ab Taste ${sec(z.keyMs)} s`);
          if (hist.length) parts.push(`\xD8 ${sec(hist.reduce((a, b) => a + b, 0) / hist.length)} s (${hist.length})`);
        }
        l1.textContent = parts.join(" \xB7 ");
        l3.textContent = detailLine(t);
        l4.textContent = warmLine(t);
        renderAudio();
      },
      updateAudio(info) {
        if (destroyed) return;
        if (info) audio = { mode: info.mode || audio.mode, level: info.level == null ? audio.level : info.level };
        renderAudio();
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        el.remove();
      }
    };
  }

  // src/js/live/tvmode/digits.js
  var MAX_CHANNEL = 18;
  function createDigits({ onCommit, onPreview, onInvalid, now = Date.now, timeoutMs = 1500 } = {}) {
    let buf = "";
    let at = 0;
    let timer = null;
    let disposed = false;
    const call = (fn, arg) => {
      if (typeof fn === "function") {
        try {
          fn(arg);
        } catch {
        }
      }
    };
    const unarm = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const reset = () => {
      unarm();
      const had = buf !== "";
      buf = "";
      if (had) call(onPreview, null);
    };
    const arm = (fn) => {
      unarm();
      at = now();
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, timeoutMs);
    };
    function commitPending() {
      const no = Number(buf);
      reset();
      if (no >= 1 && no <= MAX_CHANNEL) call(onCommit, no);
    }
    return {
      /** Nimmt eine Ziffer 0–9 entgegen; gibt den offenen Puffer zurück ('' wenn die Eingabe abgeschlossen ist). */
      push(d) {
        if (disposed) return "";
        const s = String(d);
        if (!/^[0-9]$/.test(s)) return buf;
        if (buf !== "" && now() - at > timeoutMs) {
          if (buf === "1") commitPending();
          else reset();
        }
        if (buf === "") {
          if (s === "0") {
            buf = "0";
            call(onPreview, "0_");
            arm(reset);
            return buf;
          }
          if (s === "1") {
            buf = "1";
            call(onPreview, "1_");
            arm(commitPending);
            return buf;
          }
          call(onCommit, Number(s));
          return "";
        }
        const no = Number(buf + s);
        reset();
        if (no >= 1 && no <= MAX_CHANNEL) call(onCommit, no);
        else call(onInvalid, "Dieser Sender existiert nicht");
        return "";
      },
      clear() {
        if (!disposed) reset();
      },
      pending: () => buf,
      dispose() {
        if (disposed) return;
        disposed = true;
        unarm();
        buf = "";
      }
    };
  }

  // src/js/live/tvmode/keys.js
  var ZAP = { ArrowUp: 1, PageUp: 1, ArrowDown: -1, PageDown: -1 };
  var FIELD = /^(INPUT|TEXTAREA|SELECT)$/;
  function createKeys({ doc = document, root, ctl, fullscreen = null, blocked = null, onPreview = null, toast = null, now = Date.now } = {}) {
    const digits = createDigits({
      now,
      onCommit: (no) => ctl.tune(no, { immediate: true }),
      onPreview: (t) => {
        if (onPreview) onPreview(t);
      },
      onInvalid: (t) => {
        if (toast) toast(t);
      }
    });
    const inScope = (target) => {
      if (!target || target === doc.body || target === doc.documentElement || target === doc) return true;
      return !!(root && root.contains(target));
    };
    const typing = (el) => !!el && (FIELD.test(el.tagName || "") || el.isContentEditable === true);
    function onKey(e) {
      if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      if (!root || !root.isConnected) return;
      if (!inScope(e.target) || typing(e.target) || typing(doc.activeElement)) return;
      if (typeof blocked === "function" && blocked()) return;
      const st = ctl.state();
      const k = e.key;
      if (ZAP[k] !== void 0) {
        if (!st.on) return;
        e.preventDefault();
        ctl.zap(ZAP[k]);
        return;
      }
      if (/^[0-9]$/.test(k)) {
        if (!st.on || e.shiftKey) return;
        e.preventDefault();
        digits.push(k);
        return;
      }
      if (k === "m" || k === "M") {
        if (!st.on) return;
        e.preventDefault();
        ctl.toggleMute();
        return;
      }
      if (k === "f" || k === "F") {
        if (!st.on || !fullscreen) return;
        e.preventDefault();
        fullscreen.toggle();
      }
    }
    doc.addEventListener("keydown", onKey);
    return {
      digits,
      destroy() {
        doc.removeEventListener("keydown", onKey);
        digits.dispose();
      }
    };
  }

  // src/js/live/ui/logos.js
  var LOGO_COLORS = [
    "#e53935",
    "#fb8c00",
    "#fdd835",
    "#7cb342",
    "#00897b",
    "#00acc1",
    "#1e88e5",
    "#3949ab",
    "#8e24aa",
    "#d81b60",
    "#6d4c41",
    "#546e7a",
    "#f4511e",
    "#c0ca33",
    "#43a047",
    "#039be5",
    "#5e35b1",
    "#ec407a"
  ];
  var FIXED3 = { kino: "KINO", klassik: "KLASSIK", serie: "SERIE", marathon: "MARATHON", premiere: "PREMIERE", thema: "THEMA" };
  var MAX_NAME = 9;
  function channelColor(no) {
    const n = Math.max(1, Math.floor(Number(no) || 1));
    return LOGO_COLORS[(n - 1) % LOGO_COLORS.length];
  }
  function channelInk(no) {
    const c = channelColor(no).slice(1);
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1e3 > 150 ? "#1a1a1a" : "#ffffff";
  }
  function shortName(channel) {
    if (!channel) return "";
    if (FIXED3[channel.key]) return FIXED3[channel.key];
    let base = channel.genreLabel || String(channel.name || "").replace(/^LIVE\s+/i, "") || `P${channel.no}`;
    base = String(base).trim().toUpperCase();
    return base.length > MAX_NAME ? base.slice(0, MAX_NAME).trim() : base;
  }

  // src/js/live/tvmode/thumb.js
  var THUMB_TYPES = ["Thumb", "Backdrop", "Primary"];
  var sharedCache = /* @__PURE__ */ new Map();
  function createThumb({ doc = document, deps = {}, maxWidth = 480, cache = sharedCache } = {}) {
    const el = doc.createElement("div");
    el.className = "lfx-tvm__thumb";
    const img = doc.createElement("img");
    img.className = "lfx-tvm__thumb-img";
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.loading = "lazy";
    img.decoding = "async";
    const no = doc.createElement("span");
    no.className = "lfx-tvm__thumb-no";
    el.append(img, no);
    let cur = { id: null, ch: 0, idx: 0 };
    let alive = true;
    function placeholder() {
      if (cur.id) cache.set(cur.id, -1);
      el.classList.add("lfx-tvm__thumb--ph");
      el.style.background = channelColor(cur.ch || 1);
      el.style.color = channelInk(cur.ch || 1);
      no.textContent = cur.ch ? String(cur.ch) : "";
      img.hidden = true;
      img.removeAttribute("src");
    }
    function attempt(i) {
      const url = i < THUMB_TYPES.length && typeof deps.imageUrl === "function" ? deps.imageUrl(cur.id, { type: THUMB_TYPES[i], maxWidth }) : null;
      if (!url) {
        placeholder();
        return;
      }
      cur.idx = i;
      el.classList.remove("lfx-tvm__thumb--ph");
      el.style.background = "";
      el.style.color = "";
      no.textContent = "";
      img.hidden = false;
      if (img.getAttribute("src") !== url) img.src = url;
    }
    function onError() {
      if (!alive || !cur.id) return;
      if (cur.idx + 1 >= THUMB_TYPES.length) placeholder();
      else attempt(cur.idx + 1);
    }
    function onLoad() {
      if (alive && cur.id) cache.set(cur.id, cur.idx);
    }
    img.addEventListener("error", onError);
    img.addEventListener("load", onLoad);
    return {
      el,
      set(id, channelNo) {
        if (!alive) return;
        const ch = Number(channelNo) || 0;
        const nid = id || null;
        if (nid === cur.id && ch === cur.ch) return;
        cur = { id: nid, ch, idx: 0 };
        if (!nid) {
          placeholder();
          return;
        }
        const known2 = cache.get(nid);
        if (known2 === -1) placeholder();
        else attempt(typeof known2 === "number" ? known2 : 0);
      },
      destroy() {
        alive = false;
        img.removeEventListener("error", onError);
        img.removeEventListener("load", onLoad);
        img.removeAttribute("src");
        el.remove();
      }
    };
  }

  // src/js/live/tvmode/channel-list.js
  var clamp01 = (n) => Math.max(0, Math.min(1, n));
  var pct = (p) => `${(clamp01(p) * 100).toFixed(1)}%`;
  function createChannelBadge(doc, channel) {
    const no = channel ? channel.no : 1;
    const b = doc.createElement("span");
    b.className = "lfx-tvm__chan-badge";
    b.style.background = channelColor(no);
    b.style.color = channelInk(no);
    b.textContent = shortName(channel);
    b.title = channelName(channel);
    return b;
  }
  function createChannelList({ doc, ctl, model, deps = {}, opts = {} }) {
    const getNow = typeof opts.getNow === "function" ? opts.getNow : () => Date.now();
    const el = doc.createElement("div");
    el.className = "lfx-tvm__list";
    el.setAttribute("role", "listbox");
    el.setAttribute("aria-label", "Sender");
    const win = doc.defaultView || window;
    const IO = win.IntersectionObserver;
    let io = null;
    let alive = true;
    let current = 0;
    let revealed = false;
    const rows = [];
    const byBtn = /* @__PURE__ */ new Map();
    if (typeof IO === "function") {
      io = new IO((list) => {
        for (const it of list) {
          if (!it.isIntersecting) continue;
          const r = byBtn.get(it.target);
          if (!r || r.visible) continue;
          r.visible = true;
          io.unobserve(it.target);
          loadThumb(r);
        }
      }, { rootMargin: "120px 0px" });
    }
    function loadThumb(r) {
      if (!alive || io && !r.visible || r.imgId === r.wantImg) return;
      r.imgId = r.wantImg;
      r.btn.classList.toggle("is-loading-img", !!r.wantImg);
      r.thumb.set(r.wantImg, r.no);
    }
    function fill(r, item, t) {
      const { channel, entry, next } = item;
      const sig = `${channel.name}|${entry ? entry.start : ""}|${entry ? entry.itemId : ""}`;
      r.entry = entry;
      if (sig === r.sig) return;
      r.sig = sig;
      let d = null;
      if (entry) d = model.describe(channel.no, entry, t);
      r.title.textContent = d ? d.title : "Kein Programm";
      r.sub.textContent = d ? [d.time, d.sub].filter(Boolean).join(" \xB7 ") : "";
      if (next) {
        const nt = model.titleOf(next).title;
        r.next.textContent = `Danach: ${nt} \xB7 ${formatClock(next.start)}`;
        r.next.hidden = false;
      } else {
        r.next.textContent = "";
        r.next.hidden = true;
      }
      r.btn.classList.toggle("lfx-tvm__row--dim", !!d && d.kind !== "program");
      r.wantImg = d ? d.imageItemId : null;
      if (r.visible || !io) loadThumb(r);
      r.badgeHost.replaceChildren(createChannelBadge(doc, channel));
      r.btn.setAttribute("aria-label", `Sender ${channel.no}, ${channelName(channel) || shortName(channel)}: ${d ? d.title : "Kein Programm"}`);
    }
    function setProgress(r, t) {
      const e = r.entry;
      const p = e ? clamp01((t - e.start) / Math.max(1, e.end - e.start)) : 0;
      const s = pct(p);
      if (s !== r.fillPct) {
        r.fillPct = s;
        r.fill.style.width = s;
      }
    }
    function build() {
      const t = getNow();
      const all = model.nowAll(t);
      for (const item of all) {
        const no = item.channel.no;
        const btn = doc.createElement("button");
        btn.type = "button";
        btn.className = "lfx-tvm__row";
        btn.setAttribute("role", "option");
        btn.setAttribute("aria-selected", "false");
        const noEl = doc.createElement("span");
        noEl.className = "lfx-tvm__row-no";
        noEl.textContent = String(no);
        const logo = doc.createElement("span");
        logo.className = "lfx-tvm__row-logo";
        const thumbHost = doc.createElement("span");
        thumbHost.className = "lfx-tvm__row-thumb";
        thumbHost.setAttribute("aria-hidden", "true");
        const thumb = createThumb({ doc, deps });
        thumb.set(null, no);
        thumbHost.append(thumb.el);
        const body = doc.createElement("span");
        body.className = "lfx-tvm__row-body";
        const title = doc.createElement("span");
        title.className = "lfx-tvm__row-title";
        const sub = doc.createElement("span");
        sub.className = "lfx-tvm__row-sub";
        const bar = doc.createElement("span");
        bar.className = "lfx-tvm__row-bar";
        const fillEl = doc.createElement("span");
        fillEl.className = "lfx-tvm__row-fill";
        bar.append(fillEl);
        const nextEl = doc.createElement("span");
        nextEl.className = "lfx-tvm__row-next";
        body.append(title, sub, bar, nextEl);
        btn.append(noEl, logo, thumbHost, body);
        const r = { no, btn, thumb, title, sub, fill: fillEl, next: nextEl, badgeHost: logo, sig: null, entry: null, visible: false, fillPct: "", imgId: null, wantImg: null };
        const done = () => btn.classList.remove("is-loading-img");
        thumb.el.addEventListener("load", done, true);
        thumb.el.addEventListener("error", done, true);
        btn.addEventListener("click", () => {
          if (alive) ctl.tune(no, { immediate: true });
        });
        rows.push(r);
        byBtn.set(btn, r);
        el.append(btn);
        fill(r, item, t);
        setProgress(r, t);
        if (io) io.observe(btn);
      }
    }
    function reveal(r) {
      const L = el;
      if (L.scrollHeight > L.clientHeight + 1) {
        const top = r.btn.offsetTop;
        const h = r.btn.offsetHeight;
        if (top < L.scrollTop) L.scrollTop = top;
        else if (top + h > L.scrollTop + L.clientHeight) L.scrollTop = top + h - L.clientHeight;
        return;
      }
    }
    function mark(no) {
      for (const r of rows) {
        const on = r.no === no;
        r.btn.classList.toggle("is-current", on);
        r.btn.setAttribute("aria-selected", on ? "true" : "false");
        if (on) r.btn.setAttribute("aria-current", "true");
        else r.btn.removeAttribute("aria-current");
      }
    }
    build();
    try {
      const s = ctl.state && ctl.state();
      if (s && s.on) {
        current = s.channel;
        mark(current);
      }
    } catch {
    }
    return {
      el,
      update(snap) {
        if (!alive || !snap) return;
        const no = snap.on ? snap.channel : 0;
        if (no === current && revealed) return;
        current = no;
        mark(no);
        const r = rows.find((x) => x.no === no);
        if (r) {
          reveal(r);
          revealed = true;
        }
      },
      tick(t) {
        if (!alive) return;
        const stale = rows.some((r) => !r.entry || t >= r.entry.end || t < r.entry.start);
        if (stale) {
          const all = model.nowAll(t);
          for (let i = 0; i < rows.length && i < all.length; i++) fill(rows[i], all[i], t);
        }
        for (const r of rows) setProgress(r, t);
      },
      destroy() {
        alive = false;
        if (io) io.disconnect();
        io = null;
        for (const r of rows) r.thumb.destroy();
        rows.length = 0;
        byBtn.clear();
        el.remove();
      }
    };
  }

  // src/js/live/tvmode/info.js
  var clamp3 = (n, a, b) => Math.max(a, Math.min(b, n));
  var SVG_NS = "http://www.w3.org/2000/svg";
  var ICONS = {
    restart: "M12 5V2L7 6.5 12 11V8a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8Z",
    details: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z"
  };
  function createInfo({ doc = document, ctl, model, deps = {}, opts = {} } = {}) {
    const getNow = typeof opts.getNow === "function" ? opts.getNow : () => Date.now();
    const details = opts.details || null;
    const offs = [];
    let snap = null;
    let key = "";
    let destroyed = false;
    const mk = (tag, cls, text) => {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const btn = (cls, text, icon) => {
      const b = mk("button", `lfx-tvm__btn ${cls}`);
      b.type = "button";
      b.setAttribute("aria-label", text);
      if (icon) {
        const ico = mk("span", "lfx-tvm__btn-ico");
        ico.setAttribute("aria-hidden", "true");
        const svg = doc.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", "18");
        svg.setAttribute("height", "18");
        const path = doc.createElementNS(SVG_NS, "path");
        path.setAttribute("d", ICONS[icon]);
        path.setAttribute("fill", "currentColor");
        svg.append(path);
        ico.append(svg);
        b.append(ico);
      }
      b.append(mk("span", "lfx-tvm__btn-label", text));
      return b;
    };
    const el = mk("div", "lfx-tvm__info");
    el.setAttribute("aria-live", "off");
    const head = mk("div", "lfx-tvm__info-head");
    const noEl = mk("span", "lfx-tvm__info-no");
    const badgeHost = mk("span", "lfx-tvm__info-badge");
    head.setAttribute("role", "group");
    head.append(noEl, badgeHost);
    const titleEl = mk("h2", "lfx-tvm__info-title");
    const subEl = mk("div", "lfx-tvm__info-sub");
    const timeEl = mk("div", "lfx-tvm__info-time");
    const bar = mk("div", "lfx-tvm__info-bar");
    const fill = mk("div", "lfx-tvm__info-fill");
    bar.append(fill);
    const metaEl = mk("div", "lfx-tvm__info-meta");
    const badgesEl = mk("div", "lfx-tvm__badges");
    metaEl.append(timeEl, badgesEl);
    const textEl = mk("p", "lfx-tvm__info-text");
    const moreBtn = mk("button", "lfx-tvm__info-more", "Mehr");
    moreBtn.type = "button";
    moreBtn.setAttribute("aria-expanded", "false");
    const nextEl = mk("div", "lfx-tvm__info-next");
    const actions = mk("div", "lfx-tvm__info-actions");
    const restartBtn = btn("lfx-tvm__btn--primary lfx-tvm__btn--restart", "Von vorne", "restart");
    const detailsBtn = btn("lfx-tvm__btn--ghost lfx-tvm__btn--details", "Details", "details");
    actions.append(restartBtn, detailsBtn);
    el.append(head, titleEl, subEl, metaEl, bar, textEl, moreBtn, nextEl, actions);
    function syncMore() {
      if (destroyed) return;
      if (!textEl.textContent) {
        moreBtn.hidden = true;
        return;
      }
      const open = el.classList.contains("is-expanded");
      const measurable = textEl.clientHeight > 0;
      moreBtn.hidden = !open && measurable && textEl.scrollHeight <= textEl.clientHeight + 1;
    }
    function fitActions() {
      if (destroyed) return;
      actions.classList.remove("is-compact");
      if (actions.clientWidth > 0 && actions.scrollWidth > actions.clientWidth + 1) actions.classList.add("is-compact");
    }
    const toggleMore = () => {
      const open = !el.classList.contains("is-expanded");
      el.classList.toggle("is-expanded", open);
      moreBtn.setAttribute("aria-expanded", open ? "true" : "false");
      moreBtn.textContent = open ? "Weniger" : "Mehr";
      syncMore();
    };
    moreBtn.addEventListener("click", toggleMore);
    restartBtn.addEventListener("click", () => {
      const target = ctl.restartTarget();
      if (!target || !target.itemId) return;
      ctl.stop();
      if (typeof deps.playFromStart === "function") deps.playFromStart(target.itemId);
    });
    detailsBtn.addEventListener("click", () => {
      const target = ctl.restartTarget();
      if (!target || !target.itemId) return;
      if (typeof deps.openDetails === "function") deps.openDetails(target.itemId);
    });
    function channelOf(no, t) {
      try {
        const list = model.channels(broadcastDayOf(t));
        return list.find((c) => c.no === no) || null;
      } catch {
        return null;
      }
    }
    function setText(d) {
      const raw = d.overview || (details && d.itemId != null ? details.get(d.itemId) : "") || "";
      textEl.textContent = raw;
      el.classList.toggle("has-text", !!raw);
    }
    function render() {
      if (destroyed || !snap) return;
      const entry = snap.entry;
      el.classList.toggle("is-empty", !entry);
      if (!entry) {
        key = "";
        for (const b of [restartBtn, detailsBtn]) b.disabled = true;
        return;
      }
      const t = getNow();
      const no = snap.channel;
      const ch = channelOf(no, t);
      const d = model.describe(no, entry, t, { overviews: details ? details.map() : void 0 });
      const k = `${no}|${entry.start}|${entry.itemId}|${d.overview ? 1 : 0}`;
      if (k !== key) {
        key = k;
        noEl.textContent = String(no);
        badgeHost.replaceChildren(createChannelBadge(doc, ch || { no }));
        head.setAttribute("aria-label", `Sender ${no}${ch ? `, ${channelName(ch)}` : ""}`);
        titleEl.textContent = d.title;
        subEl.textContent = d.sub;
        subEl.hidden = !d.sub;
        timeEl.textContent = d.time.replace("\u2013", " \u2013 ");
        const parts = [...d.badges, ...d.genres.slice(0, 3)];
        if (d.year) parts.push(String(d.year));
        badgesEl.textContent = "";
        for (const p of parts) badgesEl.append(mk("span", "lfx-tvm__badge", p));
        badgesEl.hidden = !parts.length;
        if (details && d.itemId != null && d.kind === "program") details.request(d.itemId);
        const nx = model.nextProgram(no, entry);
        if (nx) {
          const nt = model.titleOf(nx).title;
          nextEl.textContent = nt ? `Danach: ${nt} \xB7 ${formatClock(nx.start)}` : "";
        } else nextEl.textContent = "";
        nextEl.hidden = !nextEl.textContent;
      }
      setText(d);
      syncMore();
      fill.style.width = `${(d.progress * 100).toFixed(1)}%`;
      const target = ctl.restartTarget();
      const can2 = !!(target && target.itemId) && d.kind === "program";
      restartBtn.disabled = !can2;
      detailsBtn.disabled = !can2;
      restartBtn.hidden = !can2 && (d.kind === "filler" || d.kind === "closedown");
      detailsBtn.hidden = restartBtn.hidden;
      fitActions();
    }
    if (details) offs.push(details.on(() => render()));
    return {
      el,
      update(s) {
        snap = s;
        render();
      },
      tick(t) {
        if (destroyed || !snap || !snap.entry) return;
        syncMore();
        fitActions();
        const e = snap.entry;
        fill.style.width = `${(clamp3((t - e.start) / Math.max(1, e.end - e.start), 0, 1) * 100).toFixed(1)}%`;
      },
      destroy() {
        destroyed = true;
        for (const off of offs) {
          try {
            off();
          } catch {
          }
        }
        offs.length = 0;
        el.remove();
      }
    };
  }

  // src/js/live/tvmode/track-menu.js
  function createTrackMenu({ doc = document, ctl, trigger = null, onClose = null } = {}) {
    const el = doc.createElement("div");
    el.className = "lfx-tvm__menu lfx-tvm__menu--tracks lfx-tvm__menu--audio lfx-tvm__menu--subs";
    el.setAttribute("role", "menu");
    el.setAttribute("aria-label", "Ton und Untertitel");
    el.hidden = true;
    let opened = false;
    let alive = true;
    const readTracks = () => {
      let t;
      try {
        t = ctl && ctl.tracks && ctl.tracks();
      } catch {
      }
      return {
        audio: t && t.audio || [],
        subs: t && t.subs || [],
        audioIndex: t ? t.audioIndex : null,
        subtitleIndex: t && typeof t.subtitleIndex === "number" ? t.subtitleIndex : -1
      };
    };
    function hasChoice() {
      const t = readTracks();
      return t.audio.length > 1 || t.subs.length > 0;
    }
    const items = () => Array.from(el.querySelectorAll(".lfx-tvm__menu-item"));
    function pick(fn) {
      try {
        const r = fn();
        if (r && typeof r.catch === "function") r.catch(() => {
        });
      } catch {
      }
      close(true);
    }
    function group(kind, title, list, activeIndex, onPick, withOff) {
      const g = doc.createElement("div");
      g.className = `lfx-tvm__menu-group lfx-tvm__menu-group--${kind}`;
      g.setAttribute("role", "group");
      const h = doc.createElement("div");
      h.className = "lfx-tvm__menu-title";
      h.textContent = title;
      g.setAttribute("aria-label", title);
      g.appendChild(h);
      const add = (label, index) => {
        const b = doc.createElement("button");
        b.type = "button";
        b.className = "lfx-tvm__menu-item";
        b.setAttribute("role", "menuitemradio");
        b.tabIndex = -1;
        const active = index === activeIndex;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-checked", active ? "true" : "false");
        const mark = doc.createElement("span");
        mark.className = "lfx-tvm__menu-check";
        mark.setAttribute("aria-hidden", "true");
        mark.textContent = active ? "\u2713" : "";
        const txt = doc.createElement("span");
        txt.className = "lfx-tvm__menu-label";
        txt.textContent = label;
        b.append(mark, txt);
        b.addEventListener("click", () => pick(() => onPick(index)));
        g.appendChild(b);
      };
      if (withOff) add("Aus", -1);
      list.forEach((t, i) => add(t.label || `${title} ${i + 1}`, t.index));
      return g;
    }
    function render() {
      const t = readTracks();
      el.textContent = "";
      if (t.audio.length) {
        el.appendChild(group("audio", "Ton", t.audio, t.audioIndex, (i) => ctl.setAudio(i), false));
      }
      if (t.subs.length) {
        el.appendChild(group("subs", "Untertitel", t.subs, t.subtitleIndex, (i) => ctl.setSubtitle(i), true));
      }
    }
    function onKey(e) {
      if (!opened) return;
      if (e.key === "Escape" || e.key === "Esc") {
        e.preventDefault();
        e.stopPropagation();
        close(true);
        return;
      }
      if (e.key === "Tab") {
        close(false);
        return;
      }
      const list = items();
      if (!list.length || !el.contains(doc.activeElement)) {
        if ((e.key === "ArrowDown" || e.key === "ArrowUp") && list.length) {
          e.preventDefault();
          (e.key === "ArrowDown" ? list[0] : list[list.length - 1]).focus();
        }
        return;
      }
      const at = list.indexOf(doc.activeElement);
      let next = -1;
      if (e.key === "ArrowDown") next = (at + 1) % list.length;
      else if (e.key === "ArrowUp") next = (at - 1 + list.length) % list.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = list.length - 1;
      if (next >= 0) {
        e.preventDefault();
        e.stopPropagation();
        list[next].focus();
      }
    }
    function onOutside(e) {
      const t = e.target;
      if (el.contains(t) || trigger && trigger.contains(t)) return;
      close(false);
    }
    function open() {
      if (!alive || opened || !hasChoice()) return;
      render();
      opened = true;
      el.hidden = false;
      if (trigger) trigger.setAttribute("aria-expanded", "true");
      doc.addEventListener("keydown", onKey, true);
      doc.addEventListener("pointerdown", onOutside, true);
      const list = items();
      const first = list.find((b) => b.classList.contains("is-active")) || list[0];
      if (first) first.focus();
    }
    function close(restoreFocus = false) {
      if (!opened) return;
      opened = false;
      el.hidden = true;
      doc.removeEventListener("keydown", onKey, true);
      doc.removeEventListener("pointerdown", onOutside, true);
      if (trigger) {
        trigger.setAttribute("aria-expanded", "false");
        if (restoreFocus) trigger.focus();
      }
      if (onClose) onClose();
    }
    return {
      el,
      open,
      close,
      toggle() {
        if (opened) close(true);
        else open();
      },
      isOpen: () => opened,
      hasChoice,
      destroy() {
        if (!alive) return;
        close(false);
        alive = false;
        el.remove();
      }
    };
  }

  // src/js/live/tvmode/controls.js
  var SVG = (inner) => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  var ICONS2 = {
    volume: SVG('<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
    muted: SVG('<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
    tracks: SVG('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 10.5h4M13 10.5h4M7 14.5h2.5M12 14.5h5"/>'),
    pip: SVG('<rect x="3" y="5" width="18" height="14" rx="2.5"/><rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor" stroke="none"/>'),
    fullscreen: SVG('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    exitFullscreen: SVG('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
    up: SVG('<path d="M6 15l6-6 6 6"/>'),
    down: SVG('<path d="M6 9l6 6 6-6"/>')
  };
  function createControls({ doc = document, ctl, opts = {} } = {}) {
    const pip = opts.pip || null;
    const fullscreen = opts.fullscreen || null;
    const touchHook = () => {
      if (typeof opts.onInteract === "function") opts.onInteract();
    };
    const el = doc.createElement("div");
    el.className = "lfx-tvm__controls";
    el.setAttribute("role", "toolbar");
    el.setAttribute("aria-label", "Bedienung");
    const cleanups = [];
    function on(target, type, fn) {
      target.addEventListener(type, fn);
      cleanups.push(() => target.removeEventListener(type, fn));
    }
    function btn(mod, label, icon, onClick) {
      const b = doc.createElement("button");
      b.type = "button";
      b.className = `lfx-tvm__btn lfx-tvm__btn--icon lfx-tvm__btn--${mod}`;
      b.setAttribute("aria-label", label);
      b.title = label;
      b.innerHTML = icon;
      on(b, "click", (e) => {
        e.stopPropagation();
        touchHook();
        onClick(e);
      });
      return b;
    }
    function setLabel(b, label) {
      b.setAttribute("aria-label", label);
      b.title = label;
    }
    const left = doc.createElement("div");
    left.className = "lfx-tvm__controls-left";
    const muteBtn = btn("mute", "Ton aus", ICONS2.volume, () => ctl.toggleMute());
    left.appendChild(muteBtn);
    let volWrap = null;
    let range2 = null;
    let dragging = false;
    function ensureRange(supported) {
      if (supported && !volWrap) {
        volWrap = doc.createElement("div");
        volWrap.className = "lfx-tvm__volume";
        range2 = doc.createElement("input");
        range2.type = "range";
        range2.className = "lfx-tvm__range";
        range2.min = "0";
        range2.max = "100";
        range2.step = "5";
        range2.value = "100";
        range2.setAttribute("aria-label", "Lautst\xE4rke");
        range2.title = "Lautst\xE4rke";
        range2.addEventListener("input", onRange);
        range2.addEventListener("pointerdown", onDown);
        range2.addEventListener("pointerup", onUp);
        range2.addEventListener("pointercancel", onUp);
        volWrap.appendChild(range2);
        left.appendChild(volWrap);
      } else if (!supported && volWrap) {
        range2.removeEventListener("input", onRange);
        range2.removeEventListener("pointerdown", onDown);
        range2.removeEventListener("pointerup", onUp);
        range2.removeEventListener("pointercancel", onUp);
        volWrap.remove();
        volWrap = range2 = null;
      }
    }
    function onRange() {
      touchHook();
      ctl.setVolume(Number(range2.value));
    }
    function onDown() {
      dragging = true;
    }
    function onUp() {
      dragging = false;
    }
    const right = doc.createElement("div");
    right.className = "lfx-tvm__controls-right";
    const zapWrap = doc.createElement("div");
    zapWrap.className = "lfx-tvm__zapper";
    const upBtn = btn("zap-up", "N\xE4chster Sender", ICONS2.up, () => ctl.zap(1));
    const downBtn = btn("zap-down", "Vorheriger Sender", ICONS2.down, () => ctl.zap(-1));
    zapWrap.append(upBtn, downBtn);
    const tracksBtn = btn("tracks", "Ton und Untertitel", ICONS2.tracks, () => menu.toggle());
    tracksBtn.classList.add("lfx-tvm__btn--audio", "lfx-tvm__btn--subs");
    tracksBtn.setAttribute("aria-haspopup", "menu");
    tracksBtn.setAttribute("aria-expanded", "false");
    tracksBtn.hidden = true;
    const menu = createTrackMenu({ doc, ctl, trigger: tracksBtn, onClose: touchHook });
    const pipBtn = btn("pip", "Bild-in-Bild", ICONS2.pip, () => {
      if (pip) pip.toggle();
    });
    pipBtn.setAttribute("aria-pressed", "false");
    pipBtn.hidden = true;
    const fsBtn = btn("fullscreen", "Vollbild", ICONS2.fullscreen, () => {
      if (fullscreen) fullscreen.toggle();
      syncFullscreen();
    });
    if (!fullscreen) fsBtn.hidden = true;
    right.append(zapWrap, tracksBtn, pipBtn, fsBtn);
    el.append(left, right);
    let lastMuted = null;
    function syncFullscreen() {
      const act = !!(fullscreen && fullscreen.active && fullscreen.active());
      setLabel(fsBtn, act ? "Vollbild beenden" : "Vollbild");
      fsBtn.innerHTML = act ? ICONS2.exitFullscreen : ICONS2.fullscreen;
    }
    function syncPip() {
      const ok = !!(pip && pip.supported && pip.supported());
      pipBtn.hidden = !ok;
      pipBtn.setAttribute("aria-pressed", ok && pip.active && pip.active() ? "true" : "false");
    }
    if (pip && typeof pip.on === "function") {
      const off = pip.on(syncPip);
      if (typeof off === "function") cleanups.push(off);
    }
    on(doc, "fullscreenchange", syncFullscreen);
    on(doc, "webkitfullscreenchange", syncFullscreen);
    function update(snap) {
      if (!snap) return;
      const muted = !!snap.muted;
      if (muted !== lastMuted) {
        lastMuted = muted;
        setLabel(muteBtn, muted ? "Ton an" : "Ton aus");
        muteBtn.innerHTML = muted ? ICONS2.muted : ICONS2.volume;
      }
      ensureRange(ctl.volumeSupported !== false);
      if (range2 && !dragging) {
        const v = String(muted ? 0 : Number.isFinite(snap.volume) ? snap.volume : 100);
        if (range2.value !== v) range2.value = v;
      }
      const choice = menu.hasChoice();
      tracksBtn.hidden = !choice;
      if (!choice && menu.isOpen()) menu.close(false);
      syncPip();
      syncFullscreen();
    }
    return {
      el,
      menu,
      update,
      tick() {
      },
      isMenuOpen: () => menu.isOpen(),
      closeMenu: () => menu.close(false),
      destroy() {
        menu.destroy();
        ensureRange(false);
        cleanups.splice(0).forEach((fn) => fn());
        el.remove();
      }
    };
  }

  // src/js/live/tvmode/player-view.js
  var ZAP_MS = 4e3;
  var CONTROLS_MS = 3e3;
  var LOADING_DELAY_MS = 300;
  var SWIPE_PX = 50;
  var DOUBLE_TAP_MS = 320;
  var MOUSE_HIDE_MS = 250;
  var MOVE_GUARD_PX = 8;
  var INTERACTIVE = "button, input, a, .lfx-tvm__controls, .lfx-tvm__menu, .lfx-tvm__card, .lfx-tvm__pip-card, .lfx-tvm__unmute, .lfx-tvm__tap";
  function createPlayerView({ doc = document, ctl, model = null, opts = {} } = {}) {
    const pip = opts.pip || null;
    const now = () => typeof opts.getNow === "function" ? opts.getNow() : Date.now();
    const mk = (tag, cls, parent) => {
      const n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (parent) parent.appendChild(n);
      return n;
    };
    const el = mk("div", "lfx-tvm__player");
    const slot = mk("div", "lfx-tvm__video-slot", el);
    const loading = mk("div", "lfx-tvm__loading", el);
    loading.hidden = true;
    loading.setAttribute("role", "status");
    mk("span", "lfx-tvm__spinner", loading);
    mk("span", "lfx-tvm__loading-text", loading).textContent = "Sendersuchlauf";
    const banner = mk("div", "lfx-tvm__banner", el);
    banner.hidden = true;
    const cardHost = mk("div", "lfx-tvm__card-host", el);
    const pipCard = mk("div", "lfx-tvm__pip-card", el);
    pipCard.hidden = true;
    mk("div", "lfx-tvm__pip-card-text", pipCard).textContent = "L\xE4uft im Bild-in-Bild";
    const pipBack = mk("button", "lfx-tvm__btn lfx-tvm__btn--pip-back", pipCard);
    pipBack.type = "button";
    pipBack.textContent = "Zur\xFCckholen";
    const unmute = mk("button", "lfx-tvm__unmute", el);
    unmute.type = "button";
    unmute.hidden = true;
    unmute.textContent = "Ton an";
    const tap = mk("button", "lfx-tvm__tap", el);
    tap.type = "button";
    tap.hidden = true;
    tap.textContent = "Zum Starten tippen";
    const zap = mk("div", "lfx-tvm__zap", el);
    zap.setAttribute("aria-hidden", "true");
    const zapHead = mk("div", "lfx-tvm__zap-head", zap);
    const zapNo = mk("span", "lfx-tvm__zap-no", zapHead);
    const zapName = mk("span", "lfx-tvm__zap-name", zapHead);
    const zapTime = mk("div", "lfx-tvm__zap-time", zapHead);
    const zapBody = mk("div", "lfx-tvm__zap-body", zap);
    const zapTitle = mk("div", "lfx-tvm__zap-title", zapBody);
    const zapSub = mk("div", "lfx-tvm__zap-sub", zapBody);
    const zapFill = mk("div", "lfx-tvm__zap-fill", mk("div", "lfx-tvm__zap-bar", zap));
    const digitsEl = mk("div", "lfx-tvm__digits", el);
    digitsEl.hidden = true;
    digitsEl.setAttribute("role", "status");
    const controls = createControls({ doc, ctl, opts: { ...opts, onInteract: () => armControlsHide() } });
    el.append(controls.el, controls.menu.el);
    let alive = true;
    let snap = null;
    let wasOn = false;
    let shownChannel = null;
    let channelObj = null;
    let cardKey = "";
    let lastTouchAt = 0;
    let lastTapAt = 0;
    let zapTimer = 0;
    let controlsTimer = 0;
    let mouseHideTimer = 0;
    let moveGuard = null;
    let loadingTimer = 0;
    let loadingShown = false;
    const cleanups = [];
    const on = (t, type, fn, o) => {
      t.addEventListener(type, fn, o);
      cleanups.push(() => t.removeEventListener(type, fn, o));
    };
    function attachVideo() {
      const v = opts.video;
      if (!v || pip && pip.active && pip.active()) return;
      if (v.parentNode !== slot) slot.appendChild(v);
      v.classList.add("lfx-tvm__video");
    }
    attachVideo();
    function syncPip() {
      const act = !!(pip && pip.active && pip.active());
      el.classList.toggle("is-pip", act);
      pipCard.hidden = !act;
      if (!act) attachVideo();
    }
    if (pip && typeof pip.on === "function") {
      const off = pip.on(syncPip);
      if (typeof off === "function") cleanups.push(off);
    }
    on(pipBack, "click", () => {
      if (pip && pip.exit) pip.exit();
    });
    on(unmute, "click", () => ctl.gesture());
    on(tap, "click", () => ctl.gesture());
    if (opts.digits && typeof opts.digits.on === "function") {
      const off = opts.digits.on((text) => {
        digitsEl.textContent = text || "";
        digitsEl.hidden = !text;
      });
      if (typeof off === "function") cleanups.push(off);
    }
    function syncLoading(phase) {
      const isLoading = phase === "loading";
      el.classList.toggle("is-loading", isLoading);
      if (isLoading) {
        if (!loadingTimer && !loadingShown) {
          loadingTimer = setTimeout(() => {
            loadingTimer = 0;
            loadingShown = true;
            loading.hidden = false;
          }, LOADING_DELAY_MS);
        }
      } else {
        clearTimeout(loadingTimer);
        loadingTimer = 0;
        loadingShown = false;
        loading.hidden = true;
      }
    }
    function renderCard(card, needsTap) {
      const key = card ? JSON.stringify(card) : "";
      if (key === cardKey) return;
      cardKey = key;
      cardHost.textContent = "";
      el.classList.toggle("has-error", !!(card && card.kind === "error"));
      if (!card) return;
      const c = mk("div", `lfx-tvm__card lfx-tvm__card--${card.kind}`, cardHost);
      const title = mk("div", "lfx-tvm__card-title", c);
      const text = mk("div", "lfx-tvm__card-text", c);
      let title_ = "";
      let text_ = "";
      if (card.kind === "next") title_ = `Gleich: ${card.title} \xB7 ${card.at}`;
      else if (card.kind === "pause") title_ = card.text || "Gleich geht es weiter";
      else if (card.kind === "closedown") {
        title_ = card.text || "Sendepause";
        text_ = card.until ? `Weiter um ${card.until}` : "";
      } else if (card.kind === "empty") title_ = card.text || "Auf diesem Sender l\xE4uft gerade nichts";
      else if (card.kind === "error") {
        title_ = card.title || "Fehler";
        text_ = card.sub || "";
      }
      title.textContent = title_;
      text.textContent = text_;
      text.hidden = !text_;
      if (card.kind === "error") {
        c.setAttribute("role", "alert");
        if (card.hint) {
          const hint = mk("div", "lfx-tvm__card-hint", c);
          hint.textContent = card.hint;
          hint.style.fontSize = "0.85em";
          hint.style.opacity = "0.8";
        }
        if (card.code) {
          const code = mk("div", "lfx-tvm__card-code", c);
          code.textContent = `Code: ${card.code}`;
          code.style.fontSize = "0.7em";
          code.style.opacity = "0.7";
        }
        const act = mk("div", "lfx-tvm__card-actions", c);
        const b = mk("button", "lfx-tvm__btn lfx-tvm__btn--primary", act);
        b.type = "button";
        if (card.reason === "gesture" || needsTap) {
          c.classList.add("lfx-tvm__card--tap");
          b.textContent = "Zum Starten tippen";
          b.addEventListener("click", () => ctl.gesture());
        } else {
          b.textContent = "Erneut versuchen";
          b.addEventListener("click", () => ctl.retry());
        }
      }
    }
    function describeNow(s) {
      if (!model || !s.entry) return null;
      try {
        return model.describe(s.channel, s.entry, now());
      } catch {
        return null;
      }
    }
    function findChannel(no) {
      if (!model || !model.nowAll) return null;
      try {
        const row = model.nowAll(now()).find((r) => r.channel && r.channel.no === no);
        return row ? row.channel : null;
      } catch {
        return null;
      }
    }
    function renderZap() {
      if (!snap) return;
      const no = snap.channel;
      if (!channelObj || channelObj.no !== no) channelObj = findChannel(no) || { no };
      zapNo.textContent = String(no);
      zapName.replaceChildren(createChannelBadge(doc, channelObj));
      zapName.setAttribute("title", channelName(channelObj));
      const d = describeNow(snap);
      zapTitle.textContent = d ? d.title : "";
      zapSub.textContent = d ? d.sub || "" : "";
      zapSub.hidden = !(d && d.sub);
      zapTime.textContent = d ? d.time || "" : "";
      zapFill.style.width = `${Math.round((d ? d.progress : 0) * 100)}%`;
    }
    function showZap() {
      if (!alive) return;
      renderZap();
      el.classList.add("is-zapping");
      clearTimeout(zapTimer);
      zapTimer = setTimeout(() => {
        zapTimer = 0;
        el.classList.remove("is-zapping");
      }, ZAP_MS);
    }
    function controlsPinned() {
      return controls.isMenuOpen() || controls.el.contains(doc.activeElement);
    }
    function armControlsHide() {
      clearTimeout(controlsTimer);
      controlsTimer = setTimeout(function hide() {
        controlsTimer = 0;
        if (controlsPinned()) {
          controlsTimer = setTimeout(hide, CONTROLS_MS);
          return;
        }
        el.classList.remove("is-controls");
      }, CONTROLS_MS);
    }
    function showControls() {
      if (!alive) return;
      el.classList.add("is-controls");
      armControlsHide();
      if (!el.classList.contains("is-zapping")) showZap();
      else showZapKeepTimer();
    }
    function showZapKeepTimer() {
      clearTimeout(zapTimer);
      zapTimer = setTimeout(() => {
        zapTimer = 0;
        el.classList.remove("is-zapping");
      }, ZAP_MS);
    }
    function hideAll() {
      clearTimeout(controlsTimer);
      controlsTimer = 0;
      clearTimeout(zapTimer);
      zapTimer = 0;
      try {
        controls.closeMenu();
      } catch {
      }
      const a = doc.activeElement;
      if (a && a !== doc.body && typeof a.blur === "function" && (controls.el.contains(a) || controls.menu.el.contains(a))) a.blur();
      el.classList.remove("is-controls", "is-zapping");
    }
    function fsDoubleTapAllowed() {
      if (!opts.fullscreen) return false;
      if (typeof opts.canNativeFullscreen === "function") return !!opts.canNativeFullscreen();
      try {
        if (opts.fullscreen.isOn && opts.fullscreen.isOn()) return true;
        const root = doc.documentElement;
        const enabled = doc.fullscreenEnabled === true || doc.webkitFullscreenEnabled === true;
        return enabled && !!root && (typeof root.requestFullscreen === "function" || typeof root.webkitRequestFullscreen === "function");
      } catch {
        return false;
      }
    }
    let swipe = null;
    const isInteractive = (t) => !!(t && t.closest && t.closest(INTERACTIVE));
    function onPointerDown(e) {
      if (e.pointerType !== "touch" || isInteractive(e.target)) {
        swipe = null;
        return;
      }
      swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
    }
    function onPointerUp(e) {
      const interactive = isInteractive(e.target);
      if (e.pointerType === "touch") {
        lastTouchAt = Date.now();
        const s = swipe;
        swipe = null;
        if (!s || interactive) {
          if (interactive && el.classList.contains("is-controls")) armControlsHide();
          return;
        }
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.abs(dy) >= SWIPE_PX && Math.abs(dy) > Math.abs(dx)) {
          ctl.zap(dy < 0 ? 1 : -1);
          return;
        }
        if (Math.abs(dy) > 10 || Math.abs(dx) > 10) return;
        const t = Date.now();
        const onZap = !!(e.target && e.target.closest && e.target.closest(".lfx-tvm__zap"));
        if (!onZap && fsDoubleTapAllowed() && t - lastTapAt < DOUBLE_TAP_MS) {
          lastTapAt = 0;
          if (opts.fullscreen) opts.fullscreen.toggle();
          showControls();
          return;
        }
        if (!onZap && fsDoubleTapAllowed()) lastTapAt = t;
        if (el.classList.contains("is-controls")) hideAll();
        else showControls();
        return;
      }
      if (interactive) return;
      if (mouseHideTimer) {
        clearTimeout(mouseHideTimer);
        mouseHideTimer = 0;
        return;
      }
      if (el.classList.contains("is-controls")) {
        const x = e.clientX;
        const y = e.clientY;
        mouseHideTimer = setTimeout(() => {
          mouseHideTimer = 0;
          if (!alive) return;
          hideAll();
          moveGuard = { x, y };
        }, MOUSE_HIDE_MS);
      } else showControls();
    }
    function onPointerCancel() {
      swipe = null;
    }
    function onPointerMove(e) {
      if (e.pointerType === "touch") return;
      if (moveGuard) {
        if (Math.hypot(e.clientX - moveGuard.x, e.clientY - moveGuard.y) < MOVE_GUARD_PX) return;
        moveGuard = null;
      }
      if (!el.classList.contains("is-controls")) showControls();
      else armControlsHide();
    }
    function onDblClick(e) {
      clearTimeout(mouseHideTimer);
      mouseHideTimer = 0;
      if (Date.now() - lastTouchAt < 700 || isInteractive(e.target)) return;
      if (opts.fullscreen) opts.fullscreen.toggle();
    }
    function onFocusIn() {
      if (controls.el.contains(doc.activeElement)) {
        el.classList.add("is-controls");
        armControlsHide();
      }
    }
    on(el, "pointerdown", onPointerDown);
    on(el, "pointerup", onPointerUp);
    on(el, "pointercancel", onPointerCancel);
    on(el, "pointermove", onPointerMove);
    on(el, "dblclick", onDblClick);
    on(el, "focusin", onFocusIn);
    function update(s) {
      if (!alive || !s) return;
      snap = s;
      attachVideo();
      syncPip();
      syncLoading(s.phase);
      el.classList.toggle("is-muted", !!s.muted);
      renderCard(s.card, s.needsTap);
      const cardTap = !!(s.card && s.card.kind === "error" && cardHost.querySelector(".lfx-tvm__card--tap"));
      tap.hidden = !(s.needsTap && !cardTap);
      unmute.hidden = !s.mutedByPolicy;
      banner.hidden = !s.banner;
      banner.textContent = s.banner || "";
      if (s.on && (!wasOn || s.channel !== shownChannel)) {
        shownChannel = s.channel;
        showZap();
      } else if (s.on && el.classList.contains("is-zapping")) {
        renderZap();
      }
      if (!s.on) shownChannel = null;
      wasOn = !!s.on;
      controls.update(s);
    }
    function tick() {
      if (!alive || !snap || !el.classList.contains("is-zapping")) return;
      const d = describeNow(snap);
      if (d) zapFill.style.width = `${Math.round(d.progress * 100)}%`;
    }
    syncPip();
    return {
      el,
      controls,
      update,
      tick,
      destroy() {
        if (!alive) return;
        alive = false;
        clearTimeout(zapTimer);
        clearTimeout(controlsTimer);
        clearTimeout(mouseHideTimer);
        clearTimeout(loadingTimer);
        cleanups.splice(0).forEach((fn) => fn());
        controls.destroy();
        const v = opts.video;
        if (v && v.parentNode === slot) slot.removeChild(v);
        el.remove();
      }
    };
  }

  // src/js/live/tvmode/epg-grid.js
  var STEP = 30 * MIN;
  var TINY_PX = 48;
  var SHORT_PX = 90;
  var LEAD_MIN = 30;
  var DEFAULT_PPM = 5;
  var VIS_GAP = 4;
  var VIS_PAD = 8;
  function createEpgGrid({ doc, ctl, model, deps = {}, opts = {} }) {
    void deps;
    const getNow = typeof opts.getNow === "function" ? opts.getNow : () => Date.now();
    const el = doc.createElement("div");
    el.className = "lfx-tvm__epg";
    const head = doc.createElement("div");
    head.className = "lfx-tvm__epg-head";
    const daysEl = doc.createElement("div");
    daysEl.className = "lfx-tvm__epg-days";
    daysEl.setAttribute("role", "group");
    daysEl.setAttribute("aria-label", "Tag w\xE4hlen");
    const nowBtn = doc.createElement("button");
    nowBtn.type = "button";
    nowBtn.className = "lfx-tvm__epg-now";
    nowBtn.textContent = "Jetzt";
    head.append(daysEl, nowBtn);
    const scroll = doc.createElement("div");
    scroll.className = "lfx-tvm__epg-scroll";
    const inner = doc.createElement("div");
    inner.className = "lfx-tvm__epg-inner";
    const scale = doc.createElement("div");
    scale.className = "lfx-tvm__epg-scale";
    const rowsEl = doc.createElement("div");
    rowsEl.className = "lfx-tvm__epg-rows";
    const nowline = doc.createElement("div");
    nowline.className = "lfx-tvm__epg-nowline";
    nowline.hidden = true;
    nowline.setAttribute("aria-hidden", "true");
    inner.append(scale, rowsEl, nowline);
    scroll.append(inner);
    el.append(head, scroll);
    let alive = true;
    let todayD = broadcastDayOf(getNow());
    let selD = todayD;
    let bounds = dayBounds(selD);
    let current = 0;
    let nowPos = null;
    let cells = [];
    let rowEls = /* @__PURE__ */ new Map();
    let dayBtns = [];
    let lastPpm = DEFAULT_PPM;
    let positioned = false;
    let ro = null;
    let visRaf = 0;
    let visCancel = null;
    const setMin = (node, startMs, endMs) => {
      node.style.setProperty("--tvm-s", String(+((startMs - bounds.start) / MIN).toFixed(3)));
      if (endMs != null) node.style.setProperty("--tvm-w", String(+((endMs - startMs) / MIN).toFixed(3)));
    };
    function renderDays(t) {
      daysEl.replaceChildren();
      dayBtns = [];
      for (const d of model.days(t)) {
        const b = doc.createElement("button");
        b.type = "button";
        b.className = "lfx-tvm__day";
        b.textContent = d.label;
        b.dataset.tvmDay = String(d.D);
        b.addEventListener("click", () => selectDay(d.D));
        daysEl.append(b);
        dayBtns.push(b);
      }
      markDays();
    }
    function markDays() {
      for (const b of dayBtns) {
        const on = Number(b.dataset.tvmDay) === selD;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      }
    }
    function renderScale() {
      scale.replaceChildren();
      const corner = doc.createElement("span");
      corner.className = "lfx-tvm__epg-corner";
      scale.append(corner);
      for (let at = bounds.start; at < bounds.end; at += STEP) {
        const lab = formatClock(at);
        const m = doc.createElement("span");
        m.className = "lfx-tvm__epg-hour" + (lab.endsWith(":00") ? "" : " lfx-tvm__epg-hour--half");
        m.textContent = lab;
        setMin(m, at, null);
        scale.append(m);
      }
      const total = (bounds.end - bounds.start) / MIN;
      inner.style.setProperty("--tvm-total", String(total));
    }
    function renderRows(t) {
      rowsEl.replaceChildren();
      cells = [];
      rowEls = /* @__PURE__ */ new Map();
      const p = ppm();
      lastPpm = p;
      const rows = model.gridRows({ from: bounds.start, to: bounds.end, D: selD, now: t });
      for (const r of rows) {
        const no = r.channel.no;
        const row = doc.createElement("div");
        row.className = "lfx-tvm__epg-row";
        row.dataset.tvmNo = String(no);
        const chan = doc.createElement("div");
        chan.className = "lfx-tvm__epg-chan";
        const nEl = doc.createElement("span");
        nEl.className = "lfx-tvm__epg-chan-no";
        nEl.textContent = String(no);
        chan.append(nEl, createChannelBadge(doc, r.channel));
        const track = doc.createElement("div");
        track.className = "lfx-tvm__epg-track";
        for (const c of r.cells) {
          const btn = doc.createElement("button");
          btn.type = "button";
          let cls = "lfx-tvm__epg-cell";
          if (c.kind === "filler" || c.kind === "fill") cls += " lfx-tvm__epg-cell--filler";
          if (c.kind === "fill") cls += " lfx-tvm__epg-cell--fill";
          if (c.kind === "closedown") cls += " lfx-tvm__epg-cell--closedown";
          const mins = (c.end - c.start) / MIN;
          btn.className = cls;
          setMin(btn, c.start, c.end);
          const ti = doc.createElement("span");
          ti.className = "lfx-tvm__epg-cell-title";
          ti.textContent = c.title;
          const tm = doc.createElement("span");
          tm.className = "lfx-tvm__epg-cell-time";
          tm.textContent = `${formatClock(c.entry.start)}\u2013${formatClock(c.entry.end)}`;
          const txt = doc.createElement("span");
          txt.className = "lfx-tvm__epg-cell-text";
          txt.append(ti, tm);
          btn.append(txt);
          btn.title = `${c.title} \xB7 ${tm.textContent}`;
          btn.setAttribute("aria-label", `Sender ${no}, ${c.title}, ${tm.textContent}`);
          const rec = { btn, entry: c.entry, no, mins, filler: c.kind === "filler", cur: false, past: false, vis: null };
          classify(rec, p);
          btn.addEventListener("click", () => onCell(rec));
          btn.addEventListener("keydown", (e) => onKey(e, rec));
          track.append(btn);
          cells.push(rec);
        }
        row.append(chan, track);
        rowsEl.append(row);
        rowEls.set(no, row);
      }
      markCurrentChannel();
      applyTime(t, true);
      updateVis();
    }
    function updateVis() {
      if (!alive) return;
      const chan = rowsEl.querySelector(".lfx-tvm__epg-chan");
      const hidden = !(scroll.clientWidth > 0) || !chan;
      const edge = hidden ? 0 : chan.getBoundingClientRect().right + VIS_GAP;
      const writes = [];
      for (const c of cells) {
        let v = null;
        if (!hidden) {
          const r = c.btn.getBoundingClientRect();
          if (r.width > 0 && r.left < edge) v = Math.max(0, Math.round(r.right - edge - VIS_PAD));
        }
        if (v !== c.vis) writes.push([c, v]);
      }
      for (const [c, v] of writes) {
        c.vis = v;
        if (v == null) c.btn.style.removeProperty("--tvm-vis");
        else c.btn.style.setProperty("--tvm-vis", `${v}px`);
      }
    }
    function scheduleVis() {
      if (visRaf || !alive) return;
      const w = doc.defaultView || window;
      if (typeof w.requestAnimationFrame === "function") {
        visRaf = w.requestAnimationFrame(() => {
          visRaf = 0;
          updateVis();
        });
        visCancel = (id) => w.cancelAnimationFrame && w.cancelAnimationFrame(id);
      } else {
        visRaf = setTimeout(() => {
          visRaf = 0;
          updateVis();
        }, 16);
        visCancel = clearTimeout;
      }
    }
    scroll.addEventListener("scroll", scheduleVis, { passive: true });
    function classify(rec, p) {
      const px = rec.mins * p;
      rec.btn.classList.toggle("lfx-tvm__epg-cell--tiny", px < TINY_PX || rec.filler && px < SHORT_PX);
      rec.btn.classList.toggle("lfx-tvm__epg-cell--short", px < SHORT_PX);
    }
    function markCurrentChannel() {
      for (const [no, row] of rowEls) row.classList.toggle("is-current-channel", no === current);
    }
    function onCell(rec) {
      if (!alive) return;
      const t = getNow();
      if (rec.entry.start <= t && t < rec.entry.end) ctl.tune(rec.no, { immediate: true });
      else if (typeof opts.onInfo === "function") opts.onInfo({ no: rec.no, entry: rec.entry });
    }
    function onKey(e, rec) {
      const k = e.key;
      if (k !== "ArrowLeft" && k !== "ArrowRight" && k !== "ArrowUp" && k !== "ArrowDown") return;
      let target;
      const same = cells.filter((c) => c.no === rec.no);
      const i = same.indexOf(rec);
      if (k === "ArrowLeft") target = same[i - 1];
      else if (k === "ArrowRight") target = same[i + 1];
      else {
        const no = rec.no + (k === "ArrowUp" ? -1 : 1);
        const at = Math.max(rec.entry.start, bounds.start);
        target = cells.find((c) => c.no === no && c.entry.start <= at && at < c.entry.end);
      }
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        target.btn.focus();
      }
    }
    function applyTime(t, force) {
      const inDay = t >= bounds.start && t < bounds.end;
      nowline.hidden = !inDay;
      if (inDay) {
        const m = +((t - bounds.start) / MIN).toFixed(2);
        if (m !== nowPos) {
          nowPos = m;
          nowline.style.setProperty("--tvm-s", String(m));
        }
      } else nowPos = null;
      for (const c of cells) {
        const cur = c.entry.start <= t && t < c.entry.end;
        const past = c.entry.end <= t;
        if (force || cur !== c.cur) {
          c.cur = cur;
          c.btn.classList.toggle("is-current", cur);
          if (cur) c.btn.setAttribute("aria-current", "time");
          else c.btn.removeAttribute("aria-current");
        }
        if (force || past !== c.past) {
          c.past = past;
          c.btn.classList.toggle("is-past", past);
        }
        if (cur) {
          const p = (t - c.entry.start) / Math.max(1, c.entry.end - c.entry.start) * 100;
          c.btn.style.setProperty("--tvm-p", `${p.toFixed(1)}%`);
        } else if (c.btn.style.getPropertyValue("--tvm-p")) c.btn.style.removeProperty("--tvm-p");
      }
    }
    function ppm() {
      try {
        const v = parseFloat((doc.defaultView || window).getComputedStyle(scroll).getPropertyValue("--lfx-tvm-ppm"));
        return v > 0 ? v : DEFAULT_PPM;
      } catch {
        return DEFAULT_PPM;
      }
    }
    function reveal(o) {
      if (!alive || selD !== todayD) return;
      const t = getNow();
      if (!(t >= bounds.start && t < bounds.end)) return;
      const left = Math.max(0, ((t - bounds.start) / MIN - LEAD_MIN) * ppm());
      if (o && o.smooth && typeof scroll.scrollTo === "function") scroll.scrollTo({ left, behavior: "smooth" });
      else scroll.scrollLeft = left;
      const row = rowEls.get(current);
      if (row && scroll.scrollHeight > scroll.clientHeight + 1) {
        const top = row.offsetTop;
        const bottom = top + row.offsetHeight;
        const head2 = scale.offsetHeight;
        if (top - head2 < scroll.scrollTop) scroll.scrollTop = Math.max(0, top - head2);
        else if (bottom > scroll.scrollTop + scroll.clientHeight) scroll.scrollTop = bottom - scroll.clientHeight;
      }
    }
    function renderDay(t) {
      bounds = dayBounds(selD);
      renderScale();
      renderRows(t);
      markDays();
    }
    function selectDay(D) {
      if (!alive) return;
      if (D === selD && cells.length) return;
      selD = D;
      renderDay(getNow());
      scroll.scrollLeft = 0;
      if (D === todayD) reveal();
    }
    nowBtn.addEventListener("click", () => {
      if (!alive) return;
      const first = selD !== todayD;
      if (first) {
        selD = todayD;
        renderDay(getNow());
      }
      reveal({ smooth: !first });
    });
    const t0 = getNow();
    renderDays(t0);
    renderDay(t0);
    try {
      const s = ctl.state && ctl.state();
      if (s && s.on) {
        current = s.channel;
        markCurrentChannel();
      }
    } catch {
    }
    const RO = (doc.defaultView || window).ResizeObserver;
    if (typeof RO === "function") {
      ro = new RO(() => {
        if (!alive || !(scroll.clientWidth > 0)) return;
        updateVis();
        const p = ppm();
        if (p !== lastPpm) {
          lastPpm = p;
          for (const c of cells) classify(c, p);
        }
        if (!positioned) {
          positioned = true;
          reveal();
        }
      });
      ro.observe(scroll);
    }
    return {
      el,
      reveal,
      update(snap) {
        if (!alive || !snap) return;
        const no = snap.on ? snap.channel : 0;
        if (no !== current) {
          current = no;
          markCurrentChannel();
        }
        if (!positioned && (!ro || scroll.clientWidth > 0)) {
          positioned = true;
          reveal();
        }
      },
      tick(t) {
        if (!alive) return;
        const D = broadcastDayOf(t);
        if (D !== todayD) {
          const follow = selD === todayD;
          todayD = D;
          if (follow || selD < D || selD > D + 6) selD = D;
          renderDays(t);
          renderDay(t);
          return;
        }
        applyTime(t, false);
      },
      destroy() {
        alive = false;
        scroll.removeEventListener("scroll", scheduleVis);
        if (visRaf && visCancel) visCancel(visRaf);
        visRaf = 0;
        if (ro) ro.disconnect();
        ro = null;
        cells = [];
        rowEls = /* @__PURE__ */ new Map();
        dayBtns = [];
        el.remove();
      }
    };
  }

  // src/js/live/tvmode/info-card.js
  var FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
  function createInfoCard({ doc, ctl, model, deps = {}, opts = {} }) {
    const getNow = typeof opts.getNow === "function" ? opts.getNow : () => Date.now();
    const details = opts.details || null;
    const el = doc.createElement("div");
    el.className = "lfx-tvm__infocard";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "lfx-tvm-infocard-title");
    el.hidden = true;
    const backdrop = doc.createElement("div");
    backdrop.className = "lfx-tvm__infocard-backdrop";
    const box = doc.createElement("div");
    box.className = "lfx-tvm__infocard-box";
    const imgHost = doc.createElement("div");
    imgHost.className = "lfx-tvm__infocard-img";
    const thumb = createThumb({ doc, deps, maxWidth: 960 });
    imgHost.append(thumb.el);
    const chanEl = doc.createElement("div");
    chanEl.className = "lfx-tvm__infocard-chan";
    const titleEl = doc.createElement("h2");
    titleEl.className = "lfx-tvm__infocard-title";
    titleEl.id = "lfx-tvm-infocard-title";
    const subEl = doc.createElement("div");
    subEl.className = "lfx-tvm__infocard-sub";
    const timeEl = doc.createElement("div");
    timeEl.className = "lfx-tvm__infocard-time";
    const metaEl = doc.createElement("div");
    metaEl.className = "lfx-tvm__infocard-meta";
    const badgesEl = doc.createElement("div");
    badgesEl.className = "lfx-tvm__badges";
    const textEl = doc.createElement("p");
    textEl.className = "lfx-tvm__infocard-text";
    const actions = doc.createElement("div");
    actions.className = "lfx-tvm__infocard-actions";
    const closeBtn = doc.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "lfx-tvm__infocard-close";
    closeBtn.setAttribute("aria-label", "Schlie\xDFen");
    closeBtn.textContent = "\xD7";
    box.append(imgHost, chanEl, titleEl, subEl, timeEl, metaEl, badgesEl, textEl, actions, closeBtn);
    el.append(backdrop, box);
    let alive = true;
    let opened = false;
    let target = null;
    let info = null;
    let running = false;
    let trigger = null;
    function btn(label, cls, fn) {
      const b = doc.createElement("button");
      b.type = "button";
      b.className = `lfx-tvm__btn ${cls}`;
      b.textContent = label;
      b.addEventListener("click", fn);
      return b;
    }
    function isRunning(t) {
      return !!target && target.entry.start <= t && t < target.entry.end;
    }
    function renderActions() {
      actions.replaceChildren();
      if (!target) return;
      const { no } = target;
      if (running) {
        actions.append(btn("Jetzt einschalten", "lfx-tvm__btn--primary lfx-tvm__btn--tune", () => {
          close();
          ctl.tune(no, { immediate: true });
        }));
      }
      const id = info && info.itemId;
      if (id == null) return;
      actions.append(btn("Details", `lfx-tvm__btn--details${running ? "" : " lfx-tvm__btn--primary"}`, () => {
        close();
        if (typeof deps.openDetails === "function") deps.openDetails(id);
      }));
      actions.append(btn("In der Mediathek ansehen", "lfx-tvm__btn--ghost lfx-tvm__btn--library", () => {
        close();
        ctl.stop();
        if (typeof deps.playFromStart === "function") deps.playFromStart(id);
      }));
    }
    function renderText() {
      if (!info) return;
      const id = info.itemId;
      let text = info.overview;
      if (!text && id != null && details) text = details.get(id);
      textEl.classList.remove("is-loading", "is-empty");
      if (id == null) {
        textEl.textContent = "";
        textEl.hidden = true;
        return;
      }
      textEl.hidden = false;
      if (text) textEl.textContent = text;
      else if (text === void 0 && details && typeof deps.itemDetails === "function") {
        textEl.textContent = "Inhaltsangabe wird geladen \u2026";
        textEl.classList.add("is-loading");
      } else if (text === "") {
        textEl.textContent = "Keine Inhaltsangabe vorhanden.";
        textEl.classList.add("is-empty");
      } else {
        textEl.textContent = "";
        textEl.hidden = true;
      }
    }
    function channelName2(no, D) {
      try {
        const c = typeof model.channels === "function" ? model.channels(D).find((x) => x.no === no) : null;
        if (c) {
          const n = channelName(c);
          if (n) return n;
        }
      } catch {
      }
      return `Sender ${no}`;
    }
    function render(t) {
      const { no, entry } = target;
      info = model.describe(no, entry, t, { overviews: details ? details.map() : void 0 });
      const D = broadcastDayOf(entry.start);
      const f = formatDay(Math.floor((entry.start + offsetMs(entry.start)) / 864e5));
      chanEl.textContent = `${no} \xB7 ${channelName2(no, D)}`;
      titleEl.textContent = info.title;
      subEl.textContent = info.sub;
      subEl.hidden = !info.sub;
      timeEl.textContent = `${f.weekday} ${f.date} \xB7 ${info.time}`;
      const meta = [];
      if (info.year) meta.push(String(info.year));
      if (info.runMin) meta.push(`${info.runMin} Min.`);
      if (info.genres && info.genres.length) meta.push(info.genres.join(", "));
      metaEl.textContent = meta.join(" \xB7 ");
      metaEl.hidden = meta.length === 0;
      badgesEl.replaceChildren();
      for (const b of info.badges || []) {
        const s = doc.createElement("span");
        s.className = "lfx-tvm__badge";
        s.textContent = b;
        badgesEl.append(s);
      }
      badgesEl.hidden = !(info.badges && info.badges.length);
      thumb.set(info.imageItemId, no);
      if (info.itemId != null && details) details.request(info.itemId);
      renderText();
      running = isRunning(t);
      renderActions();
    }
    function focusables() {
      return [...box.querySelectorAll(FOCUSABLE)].filter((n) => !n.hidden);
    }
    function onKeydown(e) {
      if (!opened) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) {
          e.preventDefault();
          return;
        }
        const first = f[0];
        const last = f[f.length - 1];
        const a = doc.activeElement;
        if (e.shiftKey && (a === first || !box.contains(a))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (a === last || !box.contains(a))) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    function close() {
      if (!opened) return;
      opened = false;
      el.classList.remove("is-open");
      el.hidden = true;
      target = null;
      info = null;
      const back = trigger;
      trigger = null;
      if (back && back.isConnected && typeof back.focus === "function") back.focus();
    }
    const offDetails = details && typeof details.on === "function" ? details.on((id) => {
      if (opened && info && info.itemId === id) renderText();
    }) : null;
    const onBackdrop = () => close();
    backdrop.addEventListener("click", onBackdrop);
    closeBtn.addEventListener("click", close);
    el.addEventListener("keydown", onKeydown);
    return {
      el,
      open(next) {
        if (!alive || !next || !next.entry) return;
        if (!opened) trigger = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null;
        target = { no: next.no, entry: next.entry };
        opened = true;
        el.hidden = false;
        render(getNow());
        el.classList.add("is-open");
        const f = focusables();
        const first = f.find((n) => n !== closeBtn) || closeBtn;
        first.focus();
      },
      close,
      isOpen: () => opened,
      update() {
      },
      tick(t) {
        if (!alive || !opened || !target) return;
        const r = isRunning(t);
        if (r !== running) {
          running = r;
          renderActions();
        }
      },
      destroy() {
        alive = false;
        opened = false;
        if (offDetails) offDetails();
        backdrop.removeEventListener("click", onBackdrop);
        closeBtn.removeEventListener("click", close);
        el.removeEventListener("keydown", onKeydown);
        thumb.destroy();
        trigger = null;
        el.remove();
      }
    };
  }

  // src/js/live/tvmode/app.js
  var PHONE_Q = "(max-width: 799px)";
  var LAND_Q = "(orientation: landscape) and (max-height: 500px)";
  var TOAST_MS = 3500;
  function bindModel(scheduler) {
    return {
      nowAll: (t) => nowAll(scheduler, t),
      gridRows: (o) => gridRows(scheduler, o),
      describe: (no, entry, t, o) => describe2(scheduler, no, entry, t, o),
      nextProgram: (no, entry) => nextProgram(scheduler, no, entry),
      titleOf: (entry) => titleOf(scheduler, entry),
      days: (t) => days(t),
      kindOf,
      channels: (D) => scheduler.channels(D),
      item: (id) => scheduler.item ? scheduler.item(id) : null
    };
  }
  function mqOf(win, q) {
    try {
      return win && typeof win.matchMedia === "function" ? win.matchMedia(q) : null;
    } catch {
      return null;
    }
  }
  function listen(mq, fn) {
    if (!mq) return () => {
    };
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    }
    if (typeof mq.addListener === "function") {
      mq.addListener(fn);
      return () => mq.removeListener(fn);
    }
    return () => {
    };
  }
  function createApp(host, { scheduler, ctl, video, pip = null, deps = {}, opts = {}, canvas = null } = {}) {
    let root = host;
    const doc = host.ownerDocument || document;
    const win = doc.defaultView || window;
    const now = typeof opts.now === "function" ? opts.now : () => Date.now();
    const getNow = () => now();
    const model = bindModel(scheduler);
    const details = createDetails({ deps });
    const cls = {};
    let overlay = null;
    let paused = false;
    let destroyed = false;
    let tab = "now";
    let toastTimer = null;
    const offs = [];
    const digitSubs = /* @__PURE__ */ new Set();
    const setCls = (name, on) => {
      on = !!on;
      cls[name] = on;
      if (root) root.classList.toggle(name, on);
    };
    const applyAll = () => {
      for (const k of Object.keys(cls)) root.classList.toggle(k, cls[k]);
    };
    const mk = (tag, c, text) => {
      const e = doc.createElement(tag);
      if (c) e.className = c;
      if (text != null) e.textContent = text;
      return e;
    };
    const stage = mk("div", "lfx-tvm__stage");
    const main = mk("div", "lfx-tvm__main");
    const side = mk("div", "lfx-tvm__side");
    const tabs = mk("div", "lfx-tvm__tabs");
    tabs.setAttribute("role", "tablist");
    const tabNow = mk("button", "lfx-tvm__tab lfx-tvm__tab--now", "Jetzt im TV");
    const tabEpg = mk("button", "lfx-tvm__tab lfx-tvm__tab--epg", "Programm");
    for (const b of [tabNow, tabEpg]) {
      b.type = "button";
      b.setAttribute("role", "tab");
    }
    tabs.append(tabNow, tabEpg);
    const toast = mk("div", "lfx-tvm__toast");
    toast.setAttribute("role", "status");
    const digits = { on(fn) {
      digitSubs.add(fn);
      return () => digitSubs.delete(fn);
    } };
    const showToast = (text) => {
      if (destroyed || !text) return;
      toast.textContent = text;
      toast.classList.add("is-visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("is-visible"), TOAST_MS);
    };
    const base = { doc, ctl, model, deps };
    const common = { phone: !!opts.phone, touch: !!opts.touch, getNow, details };
    let fullscreen = null;
    const fsProxy = {
      toggle: () => fullscreen && fullscreen.toggle(),
      enter: () => fullscreen && fullscreen.enter(),
      exit: () => fullscreen && fullscreen.exit(),
      active: () => !!(fullscreen && fullscreen.isOn()),
      isOn: () => !!(fullscreen && fullscreen.isOn())
    };
    let infoCard = null;
    const onInfo = (...a) => {
      if (infoCard && typeof infoCard.open === "function") infoCard.open(...a);
    };
    const playerView = createPlayerView({ ...base, opts: { ...common, video, pip, digits, fullscreen: fsProxy, onInfo } });
    const info = createInfo({ ...base, opts: common });
    const list = createChannelList({ ...base, opts: { ...common, onInfo } });
    const epg = createEpgGrid({ ...base, opts: { ...common, onInfo } });
    infoCard = createInfoCard({ ...base, opts: { ...common, onInfo } });
    const comps = [playerView, info, list, epg, infoCard];
    const playerEl = playerView.el;
    playerEl.classList.add("lfx-tvm__player");
    info.el.classList.add("lfx-tvm__info");
    list.el.classList.add("lfx-tvm__list");
    epg.el.classList.add("lfx-tvm__epg");
    infoCard.el.classList.add("lfx-tvm__infocard");
    let zapStats = null;
    if (opts.zapStats) {
      zapStats = createZapStats(playerEl, { getVideo: () => video, doc });
      const audio = () => {
        const st = ctl.state();
        zapStats.updateAudio({ mode: typeof ctl.volumeMode === "function" ? ctl.volumeMode() : "", level: st.volume });
      };
      audio();
      offs.push(ctl.on("zap", (z) => {
        zapStats.update(z);
        audio();
      }));
      offs.push(ctl.on("change", audio));
    }
    main.append(playerEl, info.el);
    side.append(tabs, list.el);
    stage.append(main, side, epg.el);
    const slotOf2 = () => root.querySelector(".lfx-tvm__video-slot");
    const content = [stage, infoCard.el, toast];
    root.append(...content);
    if (canvas) {
      canvas.classList.add("lfx-tvm__fake");
      const slot = slotOf2();
      if (slot) slot.append(canvas);
    }
    fullscreen = createFullscreen({
      target: playerEl,
      doc,
      onChange: (on) => {
        setCls("is-fullscreen", on);
      }
    });
    function revealEpg() {
      if (typeof epg.reveal === "function") {
        try {
          epg.reveal();
        } catch {
        }
      }
    }
    function setTab(name) {
      const was = tab;
      tab = name === "epg" ? "epg" : "now";
      setCls("is-tab-now", tab === "now");
      setCls("is-tab-epg", tab === "epg");
      for (const [b, n] of [[tabNow, "now"], [tabEpg, "epg"]]) {
        b.classList.toggle("is-active", tab === n);
        b.setAttribute("aria-selected", tab === n ? "true" : "false");
        b.tabIndex = tab === n ? 0 : -1;
      }
      if (tab === "epg" && was !== "epg") revealEpg();
    }
    tabNow.addEventListener("click", () => {
      setTab("now");
      try {
        list.update(shown());
      } catch {
      }
    });
    tabEpg.addEventListener("click", () => setTab("epg"));
    tabs.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        setTab(tab === "now" ? "epg" : "now");
        (tab === "now" ? tabNow : tabEpg).focus();
      }
    });
    setTab("now");
    const mqPhone = mqOf(win, PHONE_Q);
    const mqLand = mqOf(win, LAND_Q);
    let padPx = -1;
    const probe = mk("div", "lfx-tvm__probe");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:absolute;top:0;left:0;width:0;height:var(--lfx-tvm-head);visibility:hidden;pointer-events:none";
    stage.append(probe);
    function measureHead() {
      if (!root || !root.isConnected) return;
      try {
        const body = win.document && win.document.body;
        if (body && body.style.position === "fixed") return;
        const head = probe.getBoundingClientRect().height || parseFloat(win.getComputedStyle(root).getPropertyValue("--lfx-tvm-head")) || 0;
        const top = root.getBoundingClientRect().top + (win.scrollY || win.pageYOffset || 0);
        const pad = Math.max(0, Math.round(head - top));
        if (pad !== padPx) {
          padPx = pad;
          root.style.setProperty("--lfx-tvm-pad", pad + "px");
        }
      } catch {
      }
    }
    function layout() {
      const p = !!opts.phone || !!(mqPhone && mqPhone.matches);
      setCls("is-phone", p);
      setCls("is-landscape", p && !!(mqLand && mqLand.matches));
      padPx = -1;
      measureHead();
    }
    offs.push(listen(mqPhone, layout), listen(mqLand, layout));
    const onResize = () => measureHead();
    win.addEventListener("resize", onResize);
    offs.push(() => win.removeEventListener("resize", onResize));
    layout();
    setCls("is-touch", !!opts.touch);
    const shown = () => {
      const s = ctl.state();
      return overlay ? Object.freeze({ ...s, ...overlay }) : s;
    };
    function push() {
      if (destroyed || paused) return;
      const s = shown();
      setCls("is-on", s.on);
      setCls("is-playing", s.phase === "playing");
      setCls("is-paused-card", s.phase === "pause" || s.phase === "closedown" || s.phase === "error");
      setCls("is-error", s.phase === "error");
      setCls("is-pip", !!(pip && pip.active()));
      for (const c of comps) {
        try {
          c.update(s);
        } catch {
        }
      }
    }
    offs.push(ctl.on("change", push));
    offs.push(ctl.on("message", showToast));
    offs.push(ctl.on("tick", (t) => {
      if (destroyed || paused) return;
      measureHead();
      for (const c of comps) {
        try {
          c.tick(t);
        } catch {
        }
      }
    }));
    const makeKeys = () => createKeys({
      doc,
      root,
      ctl,
      fullscreen: fsProxy,
      now,
      blocked: () => paused || infoOpen() || typeof deps.keysBlocked === "function" && !!deps.keysBlocked(),
      onPreview: (text) => {
        for (const fn of [...digitSubs]) {
          try {
            fn(text);
          } catch {
          }
        }
      },
      toast: showToast
    });
    let keys = makeKeys();
    function infoOpen() {
      return typeof infoCard.isOpen === "function" ? !!infoCard.isOpen() : infoCard.el.classList.contains("is-open");
    }
    push();
    revealEpg();
    return {
      model,
      ctl,
      slot: slotOf2,
      isInfoOpen: infoOpen,
      refresh: push,
      setPip(active) {
        setCls("is-pip", active);
        if (!destroyed && !paused) push();
      },
      /** Debug: überlagert den Snapshot, der an die Komponenten geht (nie der Controller). */
      setOverlay(partial) {
        overlay = partial || null;
        push();
      },
      suspend() {
        paused = true;
      },
      resume(newHost) {
        if (destroyed) return;
        if (newHost && newHost !== root) {
          const old = root;
          for (const k of Object.keys(cls)) old.classList.remove(k);
          root = newHost;
          root.append(...content);
          keys.destroy();
          keys = makeKeys();
        }
        applyAll();
        layout();
        paused = false;
        push();
      },
      dispose() {
        if (destroyed) return;
        destroyed = true;
        clearTimeout(toastTimer);
        for (const off of offs) {
          try {
            off();
          } catch {
          }
        }
        offs.length = 0;
        keys.destroy();
        if (zapStats) zapStats.destroy();
        try {
          fullscreen.destroy();
        } catch {
        }
        for (const c of comps) {
          try {
            c.destroy();
          } catch {
          }
        }
        details.dispose();
        for (const k of Object.keys(cls)) root.classList.remove(k);
        toast.remove();
        stage.remove();
      }
    };
  }

  // src/js/live/tvmode/pip.js
  var BG_ID = "lfx-tvm-bg";
  var SAFARI_MODE = "picture-in-picture";
  function createPip({ doc = document, video, getSlot = () => null, onChange } = {}) {
    const subs = /* @__PURE__ */ new Set();
    let last = false;
    let disposed = false;
    const chrome = () => typeof video.requestPictureInPicture === "function" && doc.pictureInPictureEnabled !== false && !video.disablePictureInPicture;
    const safari = () => typeof video.webkitSetPresentationMode === "function" && (typeof video.webkitSupportsPresentationMode !== "function" || !!video.webkitSupportsPresentationMode(SAFARI_MODE));
    const supported = () => !disposed && !!video && (chrome() || safari());
    const active = () => !disposed && !!video && (doc.pictureInPictureElement === video || video.webkitPresentationMode === SAFARI_MODE);
    function bg() {
      let el = doc.getElementById(BG_ID);
      if (!el) {
        el = doc.createElement("div");
        el.id = BG_ID;
        el.setAttribute("aria-hidden", "true");
        const s = el.style;
        s.position = "fixed";
        s.left = "0";
        s.top = "0";
        s.width = "1px";
        s.height = "1px";
        s.opacity = "0";
        s.overflow = "hidden";
        s.pointerEvents = "none";
        (doc.body || doc.documentElement).appendChild(el);
      }
      return el;
    }
    function hold() {
      if (disposed || !video) return;
      const el = bg();
      if (video.parentNode !== el) el.appendChild(video);
    }
    function notify(a, info) {
      for (const fn of [...subs]) {
        try {
          fn(a, info);
        } catch {
        }
      }
      if (typeof onChange === "function") {
        try {
          onChange(a, info);
        } catch {
        }
      }
    }
    function sync() {
      if (disposed) return;
      const now = active();
      if (now === last) return;
      last = now;
      if (now) {
        hold();
        notify(true, { restored: false });
        return;
      }
      const slot = getSlot();
      let restored = false;
      if (slot && slot.isConnected) {
        slot.appendChild(video);
        restored = true;
      }
      if (restored) {
        const el = doc.getElementById(BG_ID);
        if (el && !el.firstChild) el.remove();
      }
      notify(false, { restored });
    }
    const evs = ["enterpictureinpicture", "leavepictureinpicture", "webkitpresentationmodechanged"];
    if (video) for (const e of evs) video.addEventListener(e, sync);
    async function enter() {
      if (!supported() || active()) return active();
      try {
        if (chrome()) await video.requestPictureInPicture();
        else video.webkitSetPresentationMode(SAFARI_MODE);
      } catch {
        return false;
      }
      sync();
      return active();
    }
    async function exit() {
      if (disposed || !active()) return false;
      try {
        if (doc.pictureInPictureElement === video && typeof doc.exitPictureInPicture === "function") await doc.exitPictureInPicture();
        else if (typeof video.webkitSetPresentationMode === "function") video.webkitSetPresentationMode("inline");
      } catch {
        return false;
      }
      sync();
      return true;
    }
    return {
      supported,
      active,
      enter,
      exit,
      toggle: () => active() ? exit() : enter(),
      hold: () => {
        if (active()) hold();
      },
      on(fn) {
        if (typeof fn !== "function") return () => {
        };
        subs.add(fn);
        return () => subs.delete(fn);
      },
      dispose() {
        if (disposed) return;
        const was = active();
        if (video) for (const e of evs) video.removeEventListener(e, sync);
        disposed = true;
        subs.clear();
        if (was) {
          try {
            if (doc.pictureInPictureElement === video && typeof doc.exitPictureInPicture === "function") {
              const p = doc.exitPictureInPicture();
              if (p && typeof p.catch === "function") p.catch(() => {
              });
            } else if (typeof video.webkitSetPresentationMode === "function") video.webkitSetPresentationMode("inline");
          } catch {
          }
        }
        const el = doc.getElementById(BG_ID);
        if (el) el.remove();
      }
    };
  }

  // src/js/live/tvmode/entry.js
  var ENGINE_MARK = "__LFX_TVMODE_ENGINE__";
  var VERSION = 1;
  var DAYS = 7;
  var WATCH_MS = 1e3;
  var VIDEO_ROUTE = /^#!?\/?video(?:[/?]|$)/;
  function cardOverlay(kind) {
    switch (kind) {
      case "pause":
        return { phase: "pause", reason: null, card: { kind: "next", title: "Testfilm", at: "20:15", atMs: 0 } };
      case "closedown":
        return { phase: "closedown", reason: null, card: { kind: "closedown", text: "Sendepause", until: "05:00" } };
      case "error":
        return { phase: "error", reason: "network", card: { kind: "error", reason: "network", ...ERROR_TEXTS.network } };
      case "tap":
        return { phase: "error", reason: "gesture", needsTap: true, card: { kind: "error", reason: "gesture", ...ERROR_TEXTS.gesture } };
      case "muted":
        return { mutedByPolicy: true, muted: true };
      default:
        return null;
    }
  }
  function create(host, deps, opts = {}) {
    const o = opts || {};
    const d = deps || {};
    const now = typeof o.now === "function" ? o.now : () => Date.now();
    const doc = host.ownerDocument || document;
    const win = doc.defaultView || window;
    const video = o.video || doc.createElement("video");
    if (!o.video) {
      video.setAttribute("playsinline", "");
      video.playsInline = true;
    }
    const canvas = o.fakePlayer ? doc.createElement("canvas") : null;
    if (canvas) {
      canvas.width = 640;
      canvas.height = 360;
    }
    let curHost = host;
    let disposed = false;
    let booted = false;
    let wantStart = false;
    let suspended = false;
    let ctl = null;
    let app = null;
    let pip = null;
    let watchIv = null;
    let debugOn = false;
    const unsub = [];
    const progress = (f, label) => {
      try {
        if (d.onProgress) d.onProgress(f, label);
      } catch {
      }
    };
    const stopped = (reason) => {
      try {
        if (d.onStopped) d.onStopped({ reason });
      } catch {
      }
    };
    const isOn = () => !!(ctl && ctl.state().on);
    function stop(reason) {
      if (disposed) return;
      wantStart = false;
      bgCls(false);
      const was = isOn();
      if (ctl) ctl.stop();
      if (pip && pip.active()) pip.exit();
      if (was || reason) stopped(reason || "stop");
    }
    function routeIsVideo() {
      const hash = win.location && win.location.hash || "";
      return VIDEO_ROUTE.test(hash) || !!doc.querySelector("#videoOsdPage:not(.hide)");
    }
    const bgPip = () => suspended && !!(pip && pip.active());
    const bgCls = (on) => doc.documentElement.classList.toggle("lfx-tvm-bgplay", on);
    function bail(reason) {
      if (bgPip()) {
        stopped(reason);
        instance.dispose();
        return;
      }
      stop(reason);
    }
    function watchTick() {
      if (disposed) return;
      const bg = bgPip();
      if (suspended && !bg) {
        disarmWatch();
        return;
      }
      if (!bg && !isOn()) return;
      if (!video.isConnected) {
        bail("detached");
        return;
      }
      if (routeIsVideo()) bail("route-video");
    }
    const armWatch = () => {
      if (!watchIv) watchIv = setInterval(watchTick, WATCH_MS);
    };
    const disarmWatch = () => {
      if (watchIv) {
        clearInterval(watchIv);
        watchIv = null;
      }
    };
    const onLfxPlay = () => {
      if (isOn() || pip && pip.active()) stop("lfx-play");
    };
    const onNav = () => {
      if ((bgPip() || isOn() && !suspended) && routeIsVideo()) bail("route-video");
    };
    win.addEventListener("lfx:play", onLfxPlay);
    win.addEventListener("hashchange", onNav);
    win.addEventListener("popstate", onNav);
    unsub.push(() => {
      win.removeEventListener("lfx:play", onLfxPlay);
      win.removeEventListener("hashchange", onNav);
      win.removeEventListener("popstate", onNav);
    });
    (async () => {
      try {
        progress(0.02, "Sendersuchlauf \u2026");
        const catalog = normalizeCatalog(d.catalog);
        const scheduler = createScheduler(catalog, { channelConfig: d.channelConfig || {}, getBoxSetItems: d.getBoxSetItems, now });
        const D = broadcastDayOf(now());
        for (let i = 0; i < DAYS; i++) {
          await scheduler.prepare([D + i]);
          if (disposed) return;
          progress(0.1 + 0.85 * (i + 1) / DAYS, "Sendersuchlauf \u2026");
        }
        const watch = d.setPlayed ? createWatchTracker({ setPlayed: d.setPlayed, now }) : null;
        let infoFn = () => ({});
        const player = createPlayer({ video, deps: d, now, fake: !!o.fakePlayer, canvas, getInfo: () => infoFn() });
        video.disablePictureInPicture = false;
        ctl = createTvController({
          scheduler,
          player,
          watch,
          pickFiller,
          deps: d,
          now,
          opts: { lastChannel: o.lastChannel, volume: o.volume, muted: o.muted }
        });
        pip = createPip({
          doc,
          video,
          getSlot: () => app ? app.slot() : null,
          onChange: (active, info) => {
            if (disposed) return;
            bgCls(bgPip());
            if (app) app.setPip(active);
            if (d.onPip) {
              try {
                d.onPip(active);
              } catch {
              }
            }
            if (!active && !info.restored) {
              stopped("pip-end");
              instance.dispose();
            }
          }
        });
        app = createApp(curHost, { scheduler, ctl, video, pip, deps: d, opts: o, canvas });
        infoFn = () => {
          const s = ctl.state();
          const t = s.entry ? app.model.titleOf(s.entry).title : "";
          return { channel: `LIVE ${s.channel}`, title: t };
        };
        if (suspended) app.suspend();
        if (o.debug || win && win.__lfxTvmDebug === true) {
          debugOn = true;
          win.__lfxTvm = {
            ctl,
            model: app.model,
            state: () => ctl.state(),
            debugCard: (kind) => app.setOverlay(cardOverlay(kind))
          };
        }
        booted = true;
        progress(1, "Sendersuchlauf \u2026");
        if (d.onReady) d.onReady();
        if (wantStart && !suspended) instance.start();
      } catch (err) {
        if (!disposed && d.onFatal) d.onFatal(err);
      }
    })();
    const instance = {
      start() {
        if (disposed) return;
        if (!booted) {
          wantStart = true;
          return;
        }
        suspended = false;
        ctl.start();
        armWatch();
      },
      stop,
      suspend() {
        if (disposed) return false;
        suspended = true;
        wantStart = false;
        if (app) app.suspend();
        if (pip && pip.active()) {
          bgCls(true);
          armWatch();
          return true;
        }
        disarmWatch();
        stop("leave");
        return false;
      },
      resume(h) {
        if (disposed) return;
        if (h) curHost = h;
        suspended = false;
        bgCls(false);
        if (!app) return;
        app.resume(h);
        if (pip) pip.hold();
        if (isOn()) armWatch();
      },
      isOn,
      isPip: () => !!(pip && pip.active()),
      dispose() {
        if (disposed) return;
        disposed = true;
        bgCls(false);
        disarmWatch();
        for (const off of unsub) {
          try {
            off();
          } catch {
          }
        }
        unsub.length = 0;
        if (debugOn && win.__lfxTvm) {
          try {
            delete win.__lfxTvm;
          } catch {
            win.__lfxTvm = void 0;
          }
        }
        if (pip) {
          try {
            pip.dispose();
          } catch {
          }
        }
        if (app) {
          try {
            app.dispose();
          } catch {
          }
        }
        if (ctl) {
          try {
            ctl.dispose();
          } catch {
          }
        }
        try {
          video.removeAttribute("src");
          video.remove();
        } catch {
        }
        app = null;
        ctl = null;
        pip = null;
        try {
          curHost.textContent = "";
        } catch {
        }
      }
    };
    return instance;
  }
  if (typeof window !== "undefined") {
    window.LenzFlixTvMode = { version: VERSION, create, mark: ENGINE_MARK };
  }
})();
