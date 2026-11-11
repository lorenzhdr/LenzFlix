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
    let h3 = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h3 ^= str.charCodeAt(i);
      h3 = Math.imul(h3, 16777619);
    }
    return h3 >>> 0;
  }
  function fmix32(h3) {
    h3 ^= h3 >>> 16;
    h3 = Math.imul(h3, 2246822507);
    h3 ^= h3 >>> 13;
    h3 = Math.imul(h3, 3266489909);
    h3 ^= h3 >>> 16;
    return h3 >>> 0;
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
      const h3 = keyHash(key, it.id);
      return { id: it.id, h: h3, br: bitrev32(h3), it, ms: msOf ? msOf(it) : it.durMs };
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
        const fit2 = places.filter((p) => tGenres.includes(genres[p]));
        return fit2.length ? fit2[keyHash("genre", id) % fit2.length] : 0;
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
      const days = [...new Set((Array.isArray(Ds) ? Ds : []).filter(Number.isInteger))].sort((a, b) => a - b);
      for (const D of days) {
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
        const days = Array.isArray(Ds) ? Ds : [];
        const jobs = [];
        for (const no of [17, 18]) {
          const sp = specialFor(no);
          if (sp && typeof sp.prepare === "function") jobs.push(sp.prepare(ctx, days));
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
  var MEDIA_ACTIONS = ["pause", "play", "seekbackward", "seekforward", "seekto", "previoustrack", "nexttrack"];
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
      clearTimeout(timer);
      timer = null;
      const p = pending;
      pending = null;
      if (p) p(result);
    };
    const fail2 = (reason) => {
      if (!armed || disposed) return;
      emit("state", { phase: "error", reason });
      emit("error", { reason });
      settle({ ok: false, reason });
    };
    const callPlay = (retried = false) => {
      const rejected = (e) => {
        if (!armed || disposed) return;
        const name = e && e.name;
        if (name === "AbortError") return;
        if (name === "NotAllowedError") {
          if (retried) {
            fail2("gesture");
            return;
          }
          try {
            video.muted = true;
          } catch {
          }
          callPlay(true);
          return;
        }
        fail2("browser");
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
    let volumeSupported;
    try {
      const prev = video.volume;
      video.volume = 0.5;
      volumeSupported = video.volume === 0.5;
      video.volume = prev;
    } catch {
      volumeSupported = false;
    }
    const listeners = {
      playing: () => {
        if (!armed) return;
        playedOnce = true;
        emit("state", { phase: "playing" });
        settle({ ok: true });
      },
      waiting: () => {
        if (armed && playedOnce) emit("state", { phase: "stalled" });
      },
      stalled: () => {
        if (armed && playedOnce) emit("state", { phase: "stalled" });
      },
      ended: () => {
        if (armed) emit("state", { phase: "ended" });
      },
      error: () => {
        if (!armed) return;
        const code = video.error && video.error.code;
        fail2(code === 2 ? "network" : "video");
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
    function start(url, offsetMs2) {
      clear(true);
      armed = true;
      base = { off: Math.max(0, Number(offsetMs2) || 0), at: now() };
      return new Promise((resolve) => {
        pending = resolve;
        timer = setTimeout(() => fail2("network"), START_TIMEOUT_MS);
        onMeta = () => {
          onMeta = null;
          if (!armed) return;
          try {
            video.currentTime = livePos() / 1e3;
          } catch {
          }
          callPlay();
        };
        video.addEventListener("loadedmetadata", onMeta, { once: true });
        video.src = url;
      });
    }
    return {
      volumeSupported,
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
        try {
          video.volume = Math.min(1, Math.max(0, n));
        } catch {
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
  var SUB_FORMATS = ["vtt", "srt", "subrip", "ass", "ssa", "pgssub", "dvdsub", "dvbsub", "sub"];
  function buildDeviceProfile(video) {
    const hevc = canHevc(video);
    const direct = [];
    if (can(video, MKV)) {
      direct.push({ Container: "mkv", Type: "Video", VideoCodec: hevc && can(video, HEVC_MKV) ? "h264,hevc" : "h264", AudioCodec: "aac,mp3" });
    }
    if (can(video, MP4) || hevc) {
      direct.push({ Container: "mp4,m4v", Type: "Video", VideoCodec: hevc ? "h264,hevc" : "h264", AudioCodec: "aac,mp3" });
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
        AudioCodec: "aac",
        MaxAudioChannels: "2",
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
      const pick2 = m[0] || (want ? null : f[0]);
      return pick2 ? pick2.index : -1;
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
  var fail = (reason) => ({ ok: false, mode: "none", reason });
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
  async function resolveStream({ deps, video, itemId, audioIndex, signal }) {
    const post = async (extra) => {
      const body = {
        UserId: deps.user.id,
        DeviceProfile: buildDeviceProfile(video),
        StartTimeTicks: 0,
        SubtitleStreamIndex: -1,
        EnableDirectPlay: true,
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
      if (!sources.length) return fail(info && info.ErrorCode ? "video" : "network");
      const first = sources[0];
      const tr = buildTracks(first);
      const def = serverDefaultAudio(first, tr.audio);
      const want = tr.audio.some((a) => a.index === audioIndex) ? audioIndex : pickAudio(tr.audio, def, deps.user);
      const remux = want != null && def != null && want !== def;
      let ms = first;
      if (remux) {
        info = await post({ AudioStreamIndex: want, MediaSourceId: first.Id, EnableDirectPlay: false });
        const list = info && Array.isArray(info.MediaSources) ? info.MediaSources : [];
        ms = list.find((s) => s.Id === first.Id) || list[0];
        if (!ms) return fail("network");
      }
      const audioIdx = want != null ? want : def;
      const base = { mediaSource: ms, mediaSourceId: ms.Id, playSessionId: info.PlaySessionId, audioIndex: audioIdx, tracks: tr };
      if (ms.SupportsDirectPlay && !remux) {
        const url2 = deps.streamUrl(`/Videos/${encodeURIComponent(itemId)}/stream`, { static: true, MediaSourceId: ms.Id });
        return { ok: true, mode: "direct", url: url2, ...base };
      }
      const reasons = reasonsOf(ms);
      if (reasons.some((r) => VIDEO_REASONS.has(r))) return fail("video");
      if (ms.TranscodingUrl && /[?&]SubtitleMethod=Encode(?:&|$)/i.test(ms.TranscodingUrl)) return fail("video");
      if (!ms.TranscodingUrl) {
        const a = tr.audio.find((x) => x.index === audioIdx);
        return fail(a && !isPlainAudioCodec(a.codec) ? "audio" : "video");
      }
      if (!canHls(video)) return fail("browser");
      const url = absolute(deps, ms.TranscodingUrl);
      if (!url) return fail("network");
      return { ok: true, mode: "hls", url, ...base };
    } catch {
      return fail(signal && signal.aborted ? "aborted" : "network");
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
    const position = () => base.off + (now() - base.at);
    function draw() {
      if (!canvas) return;
      const ctx = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
      if (!ctx) return;
      const w = canvas.width || 640;
      const h3 = canvas.height || 360;
      const bw = w / BARS.length;
      BARS.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(i * bw, 0, bw + 1, h3 * 0.7);
      });
      for (let i = 0; i < 8; i++) {
        const g = Math.round(i / 7 * 255);
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.fillRect(i * w / 8, h3 * 0.7, w / 8 + 1, h3 * 0.3);
      }
      const info = (typeof getInfo === "function" ? getInfo() : null) || {};
      const bx = w * 0.2;
      const by = h3 * 0.04;
      ctx.fillStyle = "#000000";
      ctx.fillRect(bx, by, w * 0.6, h3 * 0.17);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      const small = Math.round(h3 / 26);
      ctx.font = `bold ${small}px sans-serif`;
      ctx.fillText(String(info.channel || info.channelName || "TESTBILD"), w * 0.36, by + h3 * 0.075);
      ctx.font = `${small}px monospace`;
      ctx.fillText(formatTimecode(position()), w * 0.66, by + h3 * 0.075);
      ctx.font = `${small}px sans-serif`;
      ctx.fillText(String(info.title || ""), w / 2, by + h3 * 0.14);
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
      return { ok: true, mode: "direct" };
    }
    return {
      volumeSupported: true,
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
  function createPlayer({ video, deps, now = Date.now, fake = false, canvas, getInfo } = {}) {
    if (fake) return createFakePlayer({ canvas, now, getInfo });
    const em = createEmitter();
    const vc = createVideoControl(video, { now, emit: em.emit });
    let gen = 0;
    let ac = null;
    let session = null;
    let tr = { audio: [], subs: [], audioIndex: null, subtitleIndex: -1 };
    let disposed = false;
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
    const failure = (reason) => {
      em.emit("state", { phase: "error", reason });
      em.emit("error", { reason });
    };
    async function play(opts = {}) {
      if (disposed) return aborted();
      const { itemId, offsetMs: offsetMs2 = 0 } = opts;
      const my = ++gen;
      cancelRequests();
      ac = new AbortController();
      const signal = ac.signal;
      teardown();
      tr = { audio: [], subs: [], audioIndex: null, subtitleIndex: -1 };
      em.emit("state", { phase: "loading" });
      let r;
      try {
        r = await resolveStream({ deps, video, itemId, audioIndex: opts.audioIndex, signal });
      } catch {
        r = { ok: false, mode: "none", reason: signal.aborted ? "aborted" : "network" };
      }
      if (my !== gen) return aborted();
      if (!r.ok) {
        failure(r.reason);
        return { ok: false, mode: "none", reason: r.reason };
      }
      session = { kind: "item", itemId, mode: r.mode, playSessionId: r.playSessionId, mediaSourceId: r.mediaSourceId };
      tr = { audio: r.tracks.audio, subs: r.tracks.subs, audioIndex: r.audioIndex, subtitleIndex: -1 };
      const sub = typeof opts.subtitleIndex === "number" ? opts.subtitleIndex : pickSubtitle(tr.subs, deps.user);
      const subTrack = tr.subs.find((s) => s.index === sub);
      if (subTrack) {
        tr.subtitleIndex = sub;
        vc.setSubtitle({ url: subUrl(itemId, r.mediaSourceId, sub), label: subTrack.label, lang: subTrack.lang });
      }
      const res = await vc.start(r.url, offsetMs2);
      if (my !== gen) return aborted();
      if (!res.ok) {
        teardown();
        return { ok: false, mode: "none", reason: res.reason };
      }
      return { ok: true, mode: r.mode };
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
      const res = await vc.start(url, offsetMs2);
      if (my !== gen) return aborted();
      if (!res.ok) {
        teardown();
        return { ok: false, mode: "none", reason: res.reason };
      }
      return { ok: true, mode: "direct" };
    }
    return {
      unlock: () => vc.unlock(),
      play,
      playUrl,
      async stop() {
        gen++;
        cancelRequests();
        tr = { audio: [], subs: [], audioIndex: null, subtitleIndex: -1 };
        await teardown();
      },
      syncTo: (ms) => vc.syncTo(ms),
      setVolume: (v) => vc.setVolume(v),
      setMuted: (b) => vc.setMuted(b),
      volumeSupported: vc.volumeSupported,
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
        vc.dispose();
        em.clear();
      }
    };
  }

  // src/js/live/ui/overlay-util.js
  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  var pad2 = (n) => String(n).padStart(2, "0");
  function fit(s, n) {
    s = String(s == null ? "" : s);
    if (s.length > n) return n > 1 ? s.slice(0, n - 1) + "\u2026" : s.slice(0, n);
    return s.padEnd(n, " ");
  }
  function flag(v) {
    return typeof v === "function" ? !!v() : !!v;
  }
  function shortName(ch) {
    return String(ch && ch.name || "").replace(/^LIVE\s+/i, "");
  }
  function secondsOf(t) {
    return Math.floor(t / 1e3) % 60;
  }
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
    const known = (n) => n != null && n !== 9999 ? n : null;
    const season = known(it.season);
    const ep = known(it.episode);
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
  function labelOk(label) {
    return typeof label === "string" && label.trim() !== "" && !/[;="]/.test(label);
  }
  function buildChannelLine(sel) {
    const parts = [];
    for (let no = 5; no <= 16; no++) {
      const l = sel[no];
      if (labelOk(l)) parts.push(no + "=" + l);
    }
    return parts.length ? ':root{--lfx-live-channels:"' + parts.join(";") + '"}' : "";
  }

  // src/js/live/ui/epg.js
  var COL_MIN = 30;
  var DAYS = 7;
  var MIN2 = 6e4;
  function boundsOf(ctx, D, rows) {
    let b;
    try {
      b = ctx.dayBounds(D);
    } catch {
    }
    let s;
    let e;
    if (Array.isArray(b)) [s, e] = b;
    else if (b && typeof b === "object") {
      s = b.start != null ? b.start : b.from;
      e = b.end != null ? b.end : b.to;
    }
    if (!(e > s)) {
      const all = rows.flat();
      s = all.length ? all[0].start : 0;
      e = all.length ? all[all.length - 1].end : s + 24 * 60 * MIN2;
    }
    return { start: s, end: e };
  }
  function createEpg(ctx) {
    const el = h("div", "lfx-live-epg");
    el.hidden = true;
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Programm\xFCbersicht");
    const top = h("div", "lfx-live-epg__top");
    const days = h("div", "lfx-live-epg__days");
    days.setAttribute("role", "group");
    days.setAttribute("aria-label", "Sendetag");
    const info = h("div", "lfx-live-epg__info");
    const infoTitle = h("div", "lfx-live-epg__info-title");
    const infoMeta = h("div", "lfx-live-epg__info-meta");
    info.append(infoTitle, infoMeta);
    top.append(days, info);
    const scroller = h("div", "lfx-live-epg__scroller");
    scroller.setAttribute("role", "grid");
    scroller.setAttribute("aria-label", "Programm");
    const inner = h("div", "lfx-live-epg__inner");
    scroller.append(inner);
    const legend = h("div", "lfx-live-epg__legend");
    [
      ["red", "Tag zur\xFCck", "red"],
      ["green", "Tag vor", "green"],
      ["yellow", "Jetzt", "yellow"],
      ["blue", "Details", "blue"]
    ].forEach(([c, t, key]) => {
      const b = h("button", "lfx-live-epg__key is-" + c, t);
      b.type = "button";
      b.addEventListener("click", () => onKey(key));
      legend.append(b);
    });
    const detail = h("div", "lfx-live-epg__detail");
    detail.hidden = true;
    detail.setAttribute("role", "dialog");
    detail.setAttribute("aria-modal", "true");
    detail.setAttribute("aria-label", "Sendungsdetails");
    el.append(top, scroller, legend, detail);
    let opened = false;
    let day = 0;
    let today = 0;
    let model = {};
    let focus = { no: 1, start: 0 };
    let anchorT = 0;
    let nowLine = null;
    let dayStart = 0;
    let lastMinute = -1;
    let detailEntry = null;
    let detailBtns = [];
    let detailIdx = 0;
    const prepared = /* @__PURE__ */ new Set();
    const now = () => ctx.now();
    const channelList = () => {
      const l = ctx.channels ? ctx.channels() : ctx.scheduler.channels();
      return Array.isArray(l) ? l : [];
    };
    const clock = (t) => ctx.formatClock(t);
    const dayLabel = (D) => {
      const f = ctx.formatDay(D);
      return f.weekday + " " + f.date;
    };
    function ensurePrepared(D) {
      const s = ctx.scheduler;
      if (!s || typeof s.prepare !== "function" || prepared.has(D)) return;
      prepared.add(D);
      try {
        const p = s.prepare([D]);
        if (p && typeof p.then === "function") {
          p.then(
            () => {
              if (opened && day === D) render();
            },
            () => {
            }
          );
        }
      } catch {
      }
    }
    function renderDays() {
      days.textContent = "";
      for (let i = 0; i < DAYS; i++) {
        const D = today + i;
        const b = h("button", "lfx-live-epg__day", dayLabel(D));
        b.type = "button";
        b.dataset.day = String(D);
        if (D === day) {
          b.classList.add("is-active");
          b.setAttribute("aria-pressed", "true");
        } else b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", () => setDay(D));
        days.append(b);
      }
    }
    function render() {
      renderDays();
      const chans = channelList();
      const plans = chans.map((ch) => {
        let p;
        try {
          p = ctx.scheduler.planDay(ch.no, day) || [];
        } catch {
          p = [];
        }
        return Array.from(p);
      });
      const b = boundsOf(ctx, day, plans);
      dayStart = b.start;
      const totalMin = Math.max(1, Math.round((b.end - b.start) / MIN2));
      const cols = Math.ceil(totalMin / COL_MIN);
      inner.textContent = "";
      inner.style.setProperty("--lfx-live-epg-total", String(totalMin));
      model = {};
      const ruler = h("div", "lfx-live-epg__row lfx-live-epg__ruler");
      ruler.setAttribute("role", "row");
      const corner = h("div", "lfx-live-epg__chan lfx-live-epg__corner", dayLabel(day));
      corner.setAttribute("role", "columnheader");
      const rtrack = h("div", "lfx-live-epg__track");
      for (let i = 0; i < cols; i++) {
        const c = h("div", "lfx-live-epg__tick", clock(b.start + i * COL_MIN * MIN2));
        c.setAttribute("role", "columnheader");
        c.style.left = `calc(var(--lfx-live-epg-pm) * ${i * COL_MIN})`;
        c.style.width = `calc(var(--lfx-live-epg-pm) * ${COL_MIN})`;
        rtrack.append(c);
      }
      ruler.append(corner, rtrack);
      inner.append(ruler);
      const cur = ctx.currentChannel();
      chans.forEach((ch, i) => {
        const plan = plans[i];
        const row2 = h("div", "lfx-live-epg__row");
        row2.setAttribute("role", "row");
        row2.dataset.no = String(ch.no);
        if (ch.no === cur) row2.classList.add("is-current");
        const head = h("div", "lfx-live-epg__chan");
        head.setAttribute("role", "rowheader");
        head.append(h("span", "lfx-live-epg__no", String(ch.no)), h("span", "lfx-live-epg__name", shortName(ch) || ch.name || ""));
        const themed = plan.find((e) => e.theme);
        if (themed) head.append(h("span", "lfx-live-epg__theme", themed.theme));
        head.addEventListener("click", () => {
          ctx.tune(ch.no);
          ctx.closeOverlay();
        });
        const track = h("div", "lfx-live-epg__track");
        const entries = [];
        const els = [];
        plan.forEach((en) => {
          if (en.type === "filler") return;
          entries.push(en);
          const node = blockFor(ch, en);
          els.push(node);
          track.append(node);
        });
        row2.append(head, track);
        inner.append(row2);
        model[ch.no] = { ch, entries, els };
      });
      nowLine = h("div", "lfx-live-epg__nowline");
      nowLine.setAttribute("aria-hidden", "true");
      inner.append(nowLine);
      lastMinute = -1;
      refreshNow();
      syncFocus(false);
    }
    function blockFor(ch, en) {
      const d = describe(ctx.scheduler, en);
      const node = h("div", "lfx-live-epg__ev is-" + en.type);
      node.setAttribute("role", "gridcell");
      node.tabIndex = -1;
      node.dataset.no = String(ch.no);
      node.dataset.start = String(en.start);
      const minFrom = (en.start - dayStart) / MIN2;
      const dur = (en.end - en.start) / MIN2;
      node.style.left = `calc(var(--lfx-live-epg-pm) * ${minFrom})`;
      node.style.width = `calc(var(--lfx-live-epg-pm) * ${dur})`;
      const title = h("span", "lfx-live-epg__ev-title", d.title);
      const meta = h("span", "lfx-live-epg__ev-meta");
      meta.append(h("span", "lfx-live-epg__time", clock(en.start)));
      badges(en).forEach((b) => meta.append(h("span", "lfx-live-epg__badge", b)));
      node.append(title, meta);
      if (en.type === "fill" || en.type === "nightfill") {
        node.append(h("span", "lfx-live-epg__hint", "F\xFCllprogramm"));
      }
      node.setAttribute("aria-label", `${clock(en.start)} ${d.title}${badges(en).length ? ", " + badges(en).join(", ") : ""}`);
      node.addEventListener("click", () => {
        focus = { no: ch.no, start: en.start };
        anchorT = en.start;
        syncFocus(true);
        openDetail();
      });
      return node;
    }
    function refreshNow() {
      const t = now();
      const min = Math.floor(t / MIN2);
      if (min === lastMinute) return;
      lastMinute = min;
      const isToday = day === today;
      Object.keys(model).forEach((no) => {
        const m = model[no];
        m.entries.forEach((en, i) => {
          m.els[i].classList.toggle("is-now", isToday && en.start <= t && t < en.end);
        });
      });
      if (nowLine) {
        const inDay = t >= dayStart;
        nowLine.hidden = !inDay || !isToday;
        nowLine.style.left = `calc(var(--lfx-live-epg-chan) + var(--lfx-live-epg-pm) * ${(t - dayStart) / MIN2})`;
      }
      const cur = ctx.currentChannel();
      inner.querySelectorAll(".lfx-live-epg__row[data-no]").forEach((r) => r.classList.toggle("is-current", Number(r.dataset.no) === cur));
    }
    function syncFocus(scroll) {
      const m = model[focus.no];
      if (!m) return;
      const idx = m.entries.findIndex((e) => e.start === focus.start);
      inner.querySelectorAll(".lfx-live-epg__ev.is-focus").forEach((n) => {
        n.classList.remove("is-focus");
        n.tabIndex = -1;
      });
      const node = idx >= 0 ? m.els[idx] : null;
      if (!node) return;
      node.classList.add("is-focus");
      node.tabIndex = 0;
      if (opened && !detailEntry) {
        try {
          node.focus({ preventScroll: true });
        } catch {
        }
      }
      if (scroll && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "nearest", inline: "nearest" });
      const d = describe(ctx.scheduler, m.entries[idx]);
      infoTitle.textContent = d.title;
      infoMeta.textContent = `${clock(m.entries[idx].start)}\u2013${clock(m.entries[idx].end)} \xB7 ${m.ch.no} ${m.ch.name}`;
    }
    function pickAt(no, t) {
      const m = model[no];
      if (!m || !m.entries.length) return null;
      let best = m.entries[0];
      let bd = Infinity;
      for (const e of m.entries) {
        if (e.start <= t && t < e.end) return e;
        const dist = t < e.start ? e.start - t : t - e.end;
        if (dist < bd) {
          bd = dist;
          best = e;
        }
      }
      return best;
    }
    function focusDefault() {
      const t = day === today ? now() : dayStart + 20 * 60 * MIN2;
      const cur = ctx.currentChannel();
      const no = model[cur] ? cur : Number(Object.keys(model)[0]) || 1;
      const e = pickAt(no, t);
      focus = { no, start: e ? e.start : 0 };
      anchorT = t;
    }
    function scrollToNow() {
      const t = day === today ? now() : dayStart + 20 * 60 * MIN2;
      const node = inner.querySelector(".lfx-live-epg__ev.is-focus");
      if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "nearest", inline: "nearest" });
      const tick2 = inner.querySelector(".lfx-live-epg__tick");
      const pm = tick2 ? tick2.getBoundingClientRect().width / COL_MIN : 0;
      if (pm > 0) {
        const corner = inner.querySelector(".lfx-live-epg__corner");
        const chanW = corner ? corner.getBoundingClientRect().width : 0;
        const visible = Math.max(0, scroller.clientWidth - chanW);
        scroller.scrollLeft = Math.max(0, (t - dayStart) / MIN2 * pm - visible * 0.22);
      }
    }
    function setDay(D) {
      D = Math.max(today, Math.min(today + DAYS - 1, D));
      if (D === day && Object.keys(model).length) return;
      day = D;
      closeDetail();
      render();
      focusDefault();
      syncFocus(true);
      scrollToNow();
      ensurePrepared(D);
    }
    function statusText(en) {
      const t = now();
      if (en.start <= t && t < en.end) return "l\xE4uft gerade";
      if (t < en.start) {
        const m = Math.max(1, Math.round((en.start - t) / MIN2));
        return m >= 60 ? `beginnt in ${Math.floor(m / 60)} h ${m % 60} min` : `beginnt in ${m} min`;
      }
      return "bereits gelaufen";
    }
    function openDetail() {
      const m = model[focus.no];
      const en = m && m.entries.find((e) => e.start === focus.start);
      if (!en) return;
      detailEntry = { no: focus.no, entry: en };
      const d = describe(ctx.scheduler, en);
      detail.textContent = "";
      detail.append(h("h2", "lfx-live-epg__d-title", d.title));
      const lines = [
        `${clock(en.start)}\u2013${clock(en.end)} \xB7 ${statusText(en)}`,
        `Sender ${m.ch.no} \xB7 ${m.ch.name}`,
        [d.year, d.genres.slice(0, 3).join(", "), d.runMin ? d.runMin + " min" : ""].filter(Boolean).join(" \xB7 ")
      ];
      if (en.theme) lines.push("Thementag: " + en.theme);
      if (en.type === "fill" || en.type === "nightfill") lines.push(en.type === "nightfill" ? "F\xFCllprogramm \u2013 regul\xE4res Programm ab 5:00" : "F\xFCllprogramm");
      lines.filter(Boolean).forEach((l) => detail.append(h("p", "lfx-live-epg__d-line", l)));
      const bs = badges(en);
      if (bs.length) {
        const wrap = h("p", "lfx-live-epg__d-badges");
        bs.forEach((b) => wrap.append(h("span", "lfx-live-epg__badge", b)));
        detail.append(wrap);
      }
      const acts = h("div", "lfx-live-epg__d-actions");
      detailBtns = [];
      const mk = (act, label, sub, fn) => {
        const b = h("button", "lfx-live-epg__btn");
        b.type = "button";
        b.dataset.act = act;
        b.append(h("span", "lfx-live-epg__btn-label", label));
        if (sub) b.append(h("span", "lfx-live-epg__btn-sub", sub));
        b.addEventListener("click", fn);
        detailBtns.push(b);
        acts.append(b);
      };
      mk("tune", "Umschalten", null, () => {
        const no = m.ch.no;
        closeDetail();
        ctx.tune(no);
        ctx.closeOverlay();
      });
      if (d.itemId) {
        mk("library", "Von vorne ansehen", `In ${ctx.previousThemeName || "der Mediathek"} ansehen`, () => {
          ctx.leaveToLibrary(d.itemId, { type: d.kind, seriesId: d.seriesId });
        });
      }
      mk("close", "Schlie\xDFen", null, () => closeDetail());
      detail.append(acts);
      detail.hidden = false;
      el.classList.add("has-detail");
      detailIdx = 0;
      setDetailFocus(0);
    }
    function setDetailFocus(i) {
      detailIdx = (i + detailBtns.length) % detailBtns.length;
      detailBtns.forEach((b, k) => b.classList.toggle("is-focus", k === detailIdx));
      try {
        detailBtns[detailIdx].focus({ preventScroll: true });
      } catch {
      }
    }
    function closeDetail() {
      if (!detailEntry) return false;
      detailEntry = null;
      detail.hidden = true;
      detail.textContent = "";
      detailBtns = [];
      el.classList.remove("has-detail");
      syncFocus(false);
      return true;
    }
    function moveH(dx) {
      const m = model[focus.no];
      if (!m) return;
      const i = m.entries.findIndex((e) => e.start === focus.start);
      const n = m.entries[i + dx];
      if (!n) return;
      focus.start = n.start;
      anchorT = n.start;
      syncFocus(true);
    }
    function moveV(dy) {
      const no = focus.no + dy;
      if (!model[no]) return;
      const e = pickAt(no, anchorT);
      if (!e) return;
      focus = { no, start: e.start };
      syncFocus(true);
    }
    function onKey(key) {
      if (!opened) return false;
      if (detailEntry) {
        switch (key) {
          case "left":
          case "up":
            setDetailFocus(detailIdx - 1);
            return true;
          case "right":
          case "down":
            setDetailFocus(detailIdx + 1);
            return true;
          case "ok":
            detailBtns[detailIdx].click();
            return true;
          case "back":
          case "blue":
            closeDetail();
            return true;
          default:
            return false;
        }
      }
      switch (key) {
        case "left":
          moveH(-1);
          return true;
        case "right":
          moveH(1);
          return true;
        case "up":
          moveV(-1);
          return true;
        case "down":
          moveV(1);
          return true;
        case "ok":
        case "blue":
          openDetail();
          return true;
        case "red":
          setDay(day - 1);
          return true;
        case "green":
          setDay(day + 1);
          return true;
        case "yellow":
          if (day !== today) setDay(today);
          focusDefault();
          syncFocus(true);
          scrollToNow();
          return true;
        default:
          return false;
      }
    }
    function open() {
      opened = true;
      el.hidden = false;
      el.classList.add("is-open");
      today = ctx.broadcastDayOf(now());
      day = today;
      prepared.clear();
      detailEntry = null;
      detail.hidden = true;
      el.classList.remove("has-detail");
      render();
      focusDefault();
      syncFocus(true);
      scrollToNow();
      ensurePrepared(day);
    }
    function close() {
      opened = false;
      detailEntry = null;
      el.hidden = true;
      el.classList.remove("is-open", "has-detail");
      detail.hidden = true;
    }
    function tick() {
      if (opened) refreshNow();
    }
    return { el, open, close, isOpen: () => opened, onKey, tick };
  }

  // src/js/live/ui/teletext.js
  var COLS = 40;
  var MIN3 = 6e4;
  var CH_PER_SUB = 9;
  var ROWS_PER_SUB = 18;
  var seg = (t, fg, extra) => Object.assign({ t, fg: fg || "white" }, extra || {});
  var row = (segs, opts) => Object.assign({ segs: Array.isArray(segs) ? segs : [segs] }, opts || {});
  var blank = () => row(seg(""));
  function isValidPage(p) {
    return p === 100 || p === 300 || p >= 301 && p <= 318;
  }
  function createTeletext(ctx) {
    const el = h("div", "lfx-live-ttx");
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Videotext");
    const screen = h("div", "lfx-live-ttx__screen");
    el.append(screen);
    let opened = false;
    let page = 100;
    let sub = 0;
    let subCount = 1;
    let input = "";
    let cursor = 0;
    let items = [];
    let rows = [];
    let lastMinute = -1;
    let headerEl = null;
    const prepared = /* @__PURE__ */ new Set();
    const now = () => ctx.now();
    const chans = () => {
      const l = ctx.channels ? ctx.channels() : ctx.scheduler.channels();
      return Array.isArray(l) ? l : [];
    };
    const chanOf = (no) => chans().find((c) => c.no === no) || { no, name: "Sender " + no };
    function ensurePrepared() {
      const D = ctx.broadcastDayOf(now());
      const s = ctx.scheduler;
      if (!s || typeof s.prepare !== "function" || prepared.has(D)) return;
      prepared.add(D);
      let p;
      try {
        p = s.prepare([D]);
      } catch {
        return;
      }
      if (p && typeof p.then === "function") {
        p.then(
          () => {
            if (opened) rebuild(true);
          },
          () => {
          }
        );
      }
    }
    function headerSegs() {
      const t = now();
      const f = ctx.formatDay(ctx.broadcastDayOf(t));
      const left = input ? "P" + input.padEnd(3, "-") : "P" + page;
      const clockTxt = ctx.formatClock(t) + ":" + pad2(secondsOf(t));
      return [seg(left, input ? "yellow" : "white"), seg("  LIVE-TEXT  ", "yellow"), seg(f.weekday + " " + f.date + "  ", "white"), seg(clockTxt, "cyan", { clock: true })];
    }
    function footerSegs() {
      const cur = ctx.currentChannel();
      const base = page >= 301 && page <= 318 ? page - 300 : cur;
      const next = base % 18 + 1;
      return [
        seg(fit("\xDCbersicht", 10), "white", { bg: "red", act: { page: 100 }, nocursor: true }),
        seg(fit("Jetzt+Danach", 12), "black", { bg: "green", act: { page: 300 }, nocursor: true }),
        seg(fit(shortName(chanOf(cur)), 9), "black", { bg: "yellow", act: { page: 300 + cur }, nocursor: true }),
        seg(fit(shortName(chanOf(next)), 9), "white", { bg: "blue", act: { page: 300 + next }, nocursor: true })
      ];
    }
    function pageIndex() {
      const out = [row(seg(fit("LIVE-TEXT", 20), "yellow"), { dbl: true, bg: "blue" }), blank()];
      out.push(row([seg(fit("300", 4), "yellow", { act: { page: 300 } }), seg("Jetzt & Danach, alle Sender", "white")]));
      out.push(row([seg(fit("301\u2013318", 8), "yellow"), seg("Tagesprogramm je Sender", "white")]));
      out.push(blank());
      out.push(row(seg("Sender", "green")));
      const cs = chans();
      const half = Math.ceil(cs.length / 2);
      for (let i = 0; i < half; i++) {
        const segs = [];
        [cs[i], cs[i + half]].forEach((c) => {
          if (!c) return;
          segs.push(seg(fit(300 + c.no + " " + shortName(c), 20), "cyan", { act: { page: 300 + c.no } }));
        });
        out.push(row(segs));
      }
      return out;
    }
    function lineFor(entry) {
      if (!entry) return { title: "", start: "" };
      const d = describe(ctx.scheduler, entry);
      return { title: d.title || (entry.type === "filler" ? entry.label || "Pause" : ""), start: ctx.formatClock(entry.start) };
    }
    function pageNow() {
      const t = now();
      const cs = chans();
      subCount = Math.max(1, Math.ceil(cs.length / CH_PER_SUB));
      sub = Math.min(sub, subCount - 1);
      const out = [row([seg(fit("JETZT & DANACH", 28), "yellow"), seg(fit(sub + 1 + "/" + subCount, 12).trimEnd(), "white")], { dbl: true, bg: "blue" })];
      cs.slice(sub * CH_PER_SUB, (sub + 1) * CH_PER_SUB).forEach((c) => {
        let cur = null;
        let nxt = null;
        try {
          const n = ctx.scheduler.nowOn(c.no, t);
          cur = n && n.entry;
          const list = ctx.scheduler.upcoming(c.no, t, 3) || [];
          nxt = list.find((e) => cur && e.start >= cur.end) || null;
        } catch {
        }
        const a = lineFor(cur);
        const b = lineFor(nxt);
        const act = { tune: c.no };
        out.push(row([seg(fit(c.no, 3).slice(0, 3), "yellow", { act }), seg(fit(shortName(c), 10) + " ", "cyan", { act, nocursor: true }), seg(a.start + " ", "white", { act, nocursor: true }), seg(fit(a.title, 20), "white", { act, nocursor: true })]));
        out.push(row([seg(fit("", 4), "white"), seg(fit("Danach " + b.start + " " + b.title, 36), "green", { act, nocursor: true })]));
      });
      return out;
    }
    function pageChannel() {
      const no = page - 300;
      const c = chanOf(no);
      const D = ctx.broadcastDayOf(now());
      let plan;
      try {
        plan = (ctx.scheduler.planDay(no, D) || []).filter((e) => e.type !== "filler");
      } catch {
        plan = [];
      }
      subCount = Math.max(1, Math.ceil(plan.length / ROWS_PER_SUB));
      sub = Math.min(sub, subCount - 1);
      const f = ctx.formatDay(D);
      const out = [row([seg(fit(page + " " + shortName(c), 28), "yellow"), seg(sub + 1 + "/" + subCount, "white")], { dbl: true, bg: "blue" })];
      const theme = plan.find((e) => e.theme);
      out.push(row(seg(fit(f.weekday + " " + f.date + (theme ? "  Thema: " + theme.theme : ""), COLS), "green")));
      const t = now();
      let hint = 0;
      let idx = 0;
      plan.slice(sub * ROWS_PER_SUB, (sub + 1) * ROWS_PER_SUB).forEach((e) => {
        const l = lineFor(e);
        const live = e.start <= t && t < e.end;
        if (live) hint = idx;
        idx++;
        const act = { tune: no };
        out.push(row([seg(l.start + " ", live ? "yellow" : "cyan", { act }), seg(fit(l.title, 34), live ? "yellow" : "white", { act, nocursor: true })]));
      });
      out.hint = hint;
      return out;
    }
    function pageMissing() {
      return [row(seg(fit("SEITE NICHT VORHANDEN", 24), "white"), { dbl: true, bg: "red" }), blank(), row(seg("Bitte eine andere Seite w\xE4hlen:", "yellow")), row(seg("100 \xDCbersicht", "cyan")), row(seg("300 Jetzt & Danach", "cyan")), row(seg("301\u2013318 Tagesprogramm", "cyan"))];
    }
    function build() {
      subCount = 1;
      let body;
      if (!isValidPage(page)) body = pageMissing();
      else if (page === 100) body = pageIndex();
      else if (page === 300) body = pageNow();
      else body = pageChannel();
      return body;
    }
    function rebuild(keepCursor) {
      const body = build();
      const hint = body.hint || 0;
      rows = [row(headerSegs()), ...body];
      screen.textContent = "";
      items = [];
      rows.forEach((r, ri) => {
        const rowEl = h("div", "lfx-live-ttx__row");
        if (r.dbl) rowEl.classList.add("is-dbl");
        if (r.bg) rowEl.classList.add("b-" + r.bg);
        const inner = r.dbl ? h("span", "lfx-live-ttx__dbl") : rowEl;
        r.segs.forEach((s) => {
          let n;
          if (s.act) {
            n = h("button", "lfx-live-ttx__seg is-act", s.t);
            n.type = "button";
            n.tabIndex = -1;
            n.addEventListener("click", () => activate(s.act));
            if (!s.nocursor) items.push({ r: ri, node: n, act: s.act, c: items.filter((i) => i.r === ri).length });
          } else {
            n = h("span", "lfx-live-ttx__seg", s.t);
          }
          n.classList.add("c-" + s.fg);
          if (s.bg) n.classList.add("b-" + s.bg);
          if (s.clock) headerEl = n;
          inner.append(n);
        });
        if (r.dbl) rowEl.append(inner);
        screen.append(rowEl);
      });
      const foot = h("div", "lfx-live-ttx__row lfx-live-ttx__foot");
      footerSegs().forEach((s) => {
        const n = h("button", "lfx-live-ttx__seg is-act c-" + s.fg + " b-" + s.bg, s.t);
        n.type = "button";
        n.tabIndex = -1;
        n.addEventListener("click", () => activate(s.act));
        foot.append(n);
      });
      screen.append(foot);
      cursor = keepCursor ? Math.min(cursor, Math.max(0, items.length - 1)) : Math.min(hint, Math.max(0, items.length - 1));
      paintCursor();
    }
    function paintCursor() {
      items.forEach((it, i) => it.node.classList.toggle("is-cursor", i === cursor));
      screen.dataset.page = String(page);
      screen.dataset.sub = String(sub);
    }
    function goPage(p, s) {
      input = "";
      page = p;
      sub = s || 0;
      if (p >= 301 && p <= 318 && s == null) {
        try {
          const t = now();
          const D = ctx.broadcastDayOf(t);
          const plan = (ctx.scheduler.planDay(p - 300, D) || []).filter((e) => e.type !== "filler");
          const i = plan.findIndex((e) => e.start <= t && t < e.end);
          if (i >= 0) sub = Math.floor(i / ROWS_PER_SUB);
        } catch {
        }
      }
      rebuild(false);
    }
    function activate(act) {
      if (!act) return;
      if (act.page != null) goPage(act.page);
      else if (act.tune != null) {
        ctx.tune(act.tune);
        ctx.closeOverlay();
      }
    }
    function moveCursor(dy, dx) {
      if (!items.length) return;
      const cur = items[cursor];
      if (dx) {
        const same = items.filter((i) => i.r === cur.r);
        const k = same.indexOf(cur) + dx;
        if (same[k]) cursor = items.indexOf(same[k]);
      } else {
        const cand = items.filter((i) => dy > 0 ? i.r > cur.r : i.r < cur.r);
        if (cand.length) {
          const rr = dy > 0 ? Math.min(...cand.map((i) => i.r)) : Math.max(...cand.map((i) => i.r));
          const rowItems = cand.filter((i) => i.r === rr);
          cursor = items.indexOf(rowItems.find((i) => i.c === cur.c) || rowItems[rowItems.length - 1]);
        }
      }
      paintCursor();
      const n = items[cursor].node;
      if (typeof n.scrollIntoView === "function") n.scrollIntoView({ block: "nearest" });
    }
    function onKey(key) {
      if (!opened) return false;
      if (/^[0-9]$/.test(key)) {
        input += key;
        if (input.length >= 3) goPage(Number(input));
        else rebuild(true);
        return true;
      }
      switch (key) {
        case "ch+":
        case "ch-": {
          const list = [100, 300];
          for (let n = 301; n <= 318; n++) list.push(n);
          const fwd = key === "ch+";
          const next = fwd ? list.find((n) => n > page) : [...list].reverse().find((n) => n < page);
          goPage(next != null ? next : fwd ? list[0] : list[list.length - 1]);
          return true;
        }
        case "left":
        case "right": {
          const d = key === "right" ? 1 : -1;
          if (subCount > 1) {
            sub = (sub + d + subCount) % subCount;
            input = "";
            rebuild(false);
          } else moveCursor(0, d);
          return true;
        }
        case "up":
          moveCursor(-1, 0);
          return true;
        case "down":
          moveCursor(1, 0);
          return true;
        case "ok":
          if (items[cursor]) activate(items[cursor].act);
          return true;
        case "back":
          if (input) {
            input = "";
            rebuild(true);
            return true;
          }
          return false;
        case "red":
          goPage(100);
          return true;
        case "green":
          goPage(300);
          return true;
        case "yellow":
          goPage(300 + ctx.currentChannel());
          return true;
        case "blue": {
          const base = page >= 301 && page <= 318 ? page - 300 : ctx.currentChannel();
          goPage(300 + base % 18 + 1);
          return true;
        }
        default:
          return false;
      }
    }
    function open(arg) {
      opened = true;
      el.hidden = false;
      el.classList.add("is-open");
      const p = Number(arg);
      page = Number.isInteger(p) && p >= 100 && p <= 899 ? p : 100;
      sub = 0;
      input = "";
      lastMinute = Math.floor(now() / MIN3);
      goPage(page);
      ensurePrepared();
    }
    function close() {
      opened = false;
      input = "";
      el.hidden = true;
      el.classList.remove("is-open");
    }
    function tick(t) {
      if (!opened) return;
      const tt = t != null ? t : now();
      if (headerEl) headerEl.textContent = ctx.formatClock(tt) + ":" + pad2(secondsOf(tt));
      const m = Math.floor(tt / MIN3);
      if (m !== lastMinute) {
        lastMinute = m;
        rebuild(true);
      }
    }
    return { el, open, close, isOpen: () => opened, onKey, tick };
  }

  // src/js/live/ui/menu.js
  var FIRST = 5;
  var LAST = 16;
  function createMenu(ctx) {
    const el = h("div", "lfx-live-menu");
    el.hidden = true;
    const panel = h("div", "lfx-live-menu__panel");
    el.append(panel);
    let opened = false;
    let stack = [];
    let current = [];
    let sel = {};
    let lineEl = null;
    const isAdmin = () => flag(ctx.isAdmin);
    const prev = () => ctx.previousThemeName || "Mediathek";
    const chans = () => {
      const l = ctx.channels ? ctx.channels() : ctx.scheduler.channels();
      return Array.isArray(l) ? l : [];
    };
    const top = () => stack[stack.length - 1];
    function loadSel() {
      sel = {};
      const cfg = ctx.channelConfig || {};
      for (let no = FIRST; no <= LAST; no++) {
        const v = cfg[no];
        if (labelOk(v)) sel[no] = v.trim();
      }
    }
    const push = (id, arg, focus) => {
      stack.push({ id, arg, focus: focus || 0 });
      render();
    };
    const pop = () => {
      stack.pop();
      render();
    };
    const closeThen = (fn) => {
      ctx.closeOverlay();
      fn();
    };
    function viewMain() {
      const items = [
        { label: "TV-Stil", value: (ctx.styles.find((s) => s.id === ctx.style()) || {}).name || "", act: () => push("style") },
        { label: "Senderliste", act: () => push("channels") }
      ];
      if (isAdmin()) items.push({ label: "Senderbelegung", act: () => {
        loadSel();
        push("assign");
      } });
      items.push({ label: `Mediathek (${prev()})`, act: () => closeThen(() => ctx.leaveToLibrary(null)) });
      items.push({ label: "Design wechseln", act: () => closeThen(() => ctx.openThemePicker()) });
      if (isAdmin()) items.push({ label: "Dashboard", act: () => closeThen(() => ctx.openDashboard()) });
      items.push({ label: "Abmelden", act: () => push("logout", null, 1) });
      return { title: "Men\xFC", items };
    }
    function viewStyle() {
      const cur = ctx.style();
      return {
        title: "TV-Stil",
        items: ctx.styles.map((s) => ({
          label: s.name,
          check: s.id === cur,
          act: () => {
            ctx.setStyle(s.id);
            render();
          }
        }))
      };
    }
    function viewChannels() {
      const cur = ctx.currentChannel();
      return {
        title: "Senderliste",
        items: chans().map((c) => ({
          label: `${c.no}  ${shortName(c) || c.name}`,
          check: c.no === cur,
          act: () => closeThen(() => ctx.tune(c.no))
        }))
      };
    }
    function viewAssign() {
      const cs = chans();
      const items = [];
      for (let no = FIRST; no <= LAST; no++) {
        const c = cs.find((x) => x.no === no) || {};
        const cur = c.genreLabel || shortName(c);
        items.push({
          label: `Platz ${no}`,
          value: sel[no] ? sel[no] : `Automatisch${cur ? " (derzeit " + cur + ")" : ""}`,
          cls: sel[no] ? "is-set" : "",
          act: () => push("pick", no)
        });
      }
      items.push({ label: "Zeile kopieren", cls: "is-primary", act: copyLine });
      items.push({ label: "Zur\xFCck", act: pop });
      const line = buildChannelLine(sel);
      const extra = [];
      const used = {};
      Object.keys(sel).forEach((no) => {
        (used[sel[no]] = used[sel[no]] || []).push(no);
      });
      const dup = Object.keys(used).filter((l) => used[l].length > 1);
      if (dup.length) extra.push(h("p", "lfx-live-menu__warn", "Hinweis: " + dup.map((l) => `\u201E${l}\u201C ist mehrfach belegt (Pl\xE4tze ${used[l].join(", ")})`).join("; ") + "."));
      if (line) {
        lineEl = h("code", "lfx-live-menu__line", line);
        extra.push(lineEl);
      } else {
        lineEl = null;
        extra.push(h("p", "lfx-live-menu__note", "Alles automatisch \u2013 keine Zeile n\xF6tig."));
      }
      extra.push(h("p", "lfx-live-menu__note", "Im Jellyfin-Dashboard unter Branding \u2192 Benutzerdefiniertes CSS unterhalb der @import-Zeile einf\xFCgen (nie davor, sonst l\xE4dt das Theme nicht) und speichern. Die Belegung gilt nach dem Neuladen f\xFCr alle Nutzer."));
      return { title: "Senderbelegung", items, extra, wide: true };
    }
    function viewPick(no) {
      const items = [
        {
          label: "Automatisch",
          check: !sel[no],
          act: () => {
            delete sel[no];
            pop();
          }
        }
      ];
      let gs;
      try {
        gs = ctx.scheduler.genres() || [];
      } catch {
        gs = [];
      }
      gs.filter((g) => labelOk(g.label)).forEach(
        (g) => items.push({
          label: g.label,
          value: String(g.count),
          check: sel[no] === g.label,
          act: () => {
            sel[no] = g.label;
            pop();
          }
        })
      );
      return { title: `Platz ${no}: Genre w\xE4hlen`, items };
    }
    function viewLogout() {
      return {
        title: "Wirklich abmelden?",
        items: [
          { label: "OK", act: () => closeThen(() => ctx.logout()) },
          { label: "Zur\xFCck", act: pop }
        ]
      };
    }
    function view(s) {
      switch (s.id) {
        case "style":
          return viewStyle();
        case "channels":
          return viewChannels();
        case "assign":
          return viewAssign();
        case "pick":
          return viewPick(s.arg);
        case "logout":
          return viewLogout();
        default:
          return viewMain();
      }
    }
    function copyLine() {
      const line = buildChannelLine(sel);
      if (!line) {
        ctx.toast("Alles automatisch \u2013 keine Zeile n\xF6tig.");
        return;
      }
      const fallback = () => {
        if (lineEl) {
          try {
            const r = document.createRange();
            r.selectNodeContents(lineEl);
            const sl = window.getSelection();
            sl.removeAllRanges();
            sl.addRange(r);
          } catch {
          }
        }
        ctx.toast("Zeile markiert \u2013 bitte mit Strg+C kopieren.");
      };
      const cb = typeof navigator !== "undefined" && navigator.clipboard;
      if (cb && typeof cb.writeText === "function") {
        let p;
        try {
          p = cb.writeText(line);
        } catch {
          fallback();
          return;
        }
        Promise.resolve(p).then(() => ctx.toast("Zeile kopiert."), fallback);
      } else fallback();
    }
    function render() {
      const s = top();
      if (!s) return;
      const v = view(s);
      current = v.items;
      s.focus = Math.max(0, Math.min(s.focus, current.length - 1));
      panel.textContent = "";
      panel.classList.toggle("is-wide", !!v.wide);
      panel.dataset.view = s.id;
      panel.append(h("h2", "lfx-live-menu__title", v.title));
      const list = h("div", "lfx-live-menu__list");
      list.setAttribute("role", "menu");
      list.setAttribute("aria-label", v.title);
      current.forEach((it, i) => {
        const b = h("button", "lfx-live-menu__item" + (it.cls ? " " + it.cls : ""));
        b.type = "button";
        b.tabIndex = i === s.focus ? 0 : -1;
        if (it.check !== void 0) {
          b.setAttribute("role", "menuitemradio");
          b.setAttribute("aria-checked", it.check ? "true" : "false");
          if (it.check) b.classList.add("is-checked");
        } else b.setAttribute("role", "menuitem");
        if (i === s.focus) b.classList.add("is-focus");
        b.append(h("span", "lfx-live-menu__label", it.label));
        if (it.value) b.append(h("span", "lfx-live-menu__value", it.value));
        b.addEventListener("click", () => {
          s.focus = i;
          it.act();
        });
        list.append(b);
      });
      panel.append(list);
      (v.extra || []).forEach((n) => panel.append(n));
      const f = list.children[s.focus];
      if (opened && f) {
        try {
          f.focus({ preventScroll: true });
        } catch {
        }
        if (typeof f.scrollIntoView === "function") f.scrollIntoView({ block: "nearest" });
      }
    }
    function onKey(key) {
      if (!opened) return false;
      const s = top();
      switch (key) {
        case "up":
        case "down": {
          const n = current.length;
          if (n) {
            s.focus = (s.focus + (key === "down" ? 1 : -1) + n) % n;
            render();
          }
          return true;
        }
        case "ok":
          if (current[s.focus]) current[s.focus].act();
          return true;
        case "left":
        case "back":
          if (stack.length > 1) {
            pop();
            return true;
          }
          return key === "left";
        case "right":
          return true;
        default:
          return false;
      }
    }
    function open() {
      opened = true;
      el.hidden = false;
      el.classList.add("is-open");
      stack = [{ id: "main", focus: 0 }];
      loadSel();
      render();
    }
    function close() {
      opened = false;
      el.hidden = true;
      el.classList.remove("is-open");
      stack = [];
    }
    return { el, open, close, isOpen: () => opened, onKey };
  }

  // src/js/live/ui/tv.js
  var STYLES = [
    { id: "flat", name: "Flachbild" },
    { id: "crt80", name: "R\xF6hre 80er" },
    { id: "silver", name: "Silber-R\xF6hre" },
    { id: "plain", name: "Schlicht" }
  ];
  var DEFAULT_STYLE = "flat";
  function normStyle(id) {
    return STYLES.some((s) => s.id === id) ? id : DEFAULT_STYLE;
  }
  function h2(doc, tag, cls, text) {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function buildTv({ style, fakePlayer = false, doc = document }) {
    const app = h2(doc, "div", `lfx-live-app lfx-live--style-${normStyle(style)}`);
    const room = h2(doc, "div", "lfx-live-room");
    room.append(h2(doc, "span", "lfx-live-room__lamp"), h2(doc, "span", "lfx-live-room__shelf"));
    const tv = h2(doc, "div", "lfx-live-tv");
    const screen = h2(doc, "div", "lfx-live-screen");
    const video = doc.createElement("video");
    video.className = "lfx-live-video";
    video.setAttribute("playsinline", "");
    video.playsInline = true;
    video.setAttribute("disablepictureinpicture", "");
    video.setAttribute("x-webkit-airplay", "deny");
    video.removeAttribute("controls");
    const noise = h2(doc, "canvas", "lfx-live-noise");
    noise.width = 160;
    noise.height = 90;
    let fake = null;
    screen.append(video, noise);
    if (fakePlayer) {
      fake = h2(doc, "canvas", "lfx-live-fake");
      fake.width = 640;
      fake.height = 360;
      screen.append(fake);
    }
    const overlay = h2(doc, "div", "lfx-live-overlay");
    const led = h2(doc, "span", "lfx-live-tv__led");
    led.setAttribute("aria-hidden", "true");
    const panel = h2(doc, "div", "lfx-live-tv__panel");
    panel.setAttribute("aria-hidden", "true");
    panel.append(
      h2(doc, "span", "lfx-live-tv__knob lfx-live-tv__knob--a"),
      h2(doc, "span", "lfx-live-tv__knob lfx-live-tv__knob--b"),
      h2(doc, "span", "lfx-live-tv__grille")
    );
    const brand = h2(doc, "span", "lfx-live-tv__brand", "LENZ LIVE");
    brand.setAttribute("aria-hidden", "true");
    const stand = h2(doc, "span", "lfx-live-tv__stand");
    stand.setAttribute("aria-hidden", "true");
    screen.append(overlay);
    tv.append(screen, panel, brand, led, stand);
    room.append(tv);
    app.append(room);
    return { app, room, tv, screen, video, noise, fake, overlay, led };
  }
  function createNoise(canvas, { win = window } = {}) {
    let ctx = null;
    try {
      ctx = canvas.getContext && canvas.getContext("2d");
    } catch {
      ctx = null;
    }
    let iv = null;
    let off = null;
    let img = null;
    function draw() {
      if (!ctx) return;
      if (!img) img = ctx.createImageData(canvas.width, canvas.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() * 255 | 0;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }
    function stop() {
      if (iv) {
        win.clearInterval(iv);
        iv = null;
      }
      if (off) {
        win.clearTimeout(off);
        off = null;
      }
      canvas.classList.remove("is-active", "is-black");
    }
    return {
      flash(styleId, ms) {
        stop();
        const black = styleId === "flat" || styleId === "plain";
        canvas.classList.add("is-active");
        if (black) canvas.classList.add("is-black");
        else {
          draw();
          iv = win.setInterval(draw, 60);
        }
        off = win.setTimeout(stop, ms || (black ? 250 : 500));
      },
      stop,
      dispose() {
        stop();
      }
    };
  }

  // src/js/live/ui/remote.js
  var SVG_POWER = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 3v9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M6.6 6.8a8 8 0 1 0 10.8 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
  var GROUPS = [
    ["power", [["power", null, "Ein/Aus", "is-power"], ["mute", "Stumm", "Stumm", "is-small"], ["fullscreen", "\u26F6", "Vollbild", "is-small"]]],
    ["digits", [
      ["1", "1", "Ziffer 1"],
      ["2", "2", "Ziffer 2"],
      ["3", "3", "Ziffer 3"],
      ["4", "4", "Ziffer 4"],
      ["5", "5", "Ziffer 5"],
      ["6", "6", "Ziffer 6"],
      ["7", "7", "Ziffer 7"],
      ["8", "8", "Ziffer 8"],
      ["9", "9", "Ziffer 9"],
      ["txt", "TXT", "Videotext", "is-small"],
      ["0", "0", "Ziffer 0"],
      ["info", "i", "Info", "is-small"]
    ]],
    ["rocker", [
      ["vol+", "V+", "Lauter", "is-rock"],
      ["ch+", "P+", "Programm weiter", "is-rock"],
      ["vol-", "V\u2212", "Leiser", "is-rock"],
      ["ch-", "P\u2212", "Programm zur\xFCck", "is-rock"]
    ]],
    ["nav", [
      ["epg", "EPG", "Programmf\xFChrer", "is-small"],
      ["up", "\u25B2", "Hoch", "is-arrow"],
      ["menu", "Men\xFC", "Men\xFC", "is-small"],
      ["left", "\u25C0", "Links", "is-arrow"],
      ["ok", "OK", "OK", "is-ok"],
      ["right", "\u25B6", "Rechts", "is-arrow"],
      ["back", "Zur\xFCck", "Zur\xFCck", "is-small"],
      ["down", "\u25BC", "Runter", "is-arrow"],
      ["restart", "Anfang", "Von vorne ansehen", "is-small"]
    ]],
    ["colors", [
      ["red", "", "Rot", "is-color is-red"],
      ["green", "", "Gr\xFCn", "is-color is-green"],
      ["yellow", "", "Gelb", "is-color is-yellow"],
      ["blue", "", "Blau", "is-color is-blue"]
    ]],
    ["extras", [["audio", "Ton", "Tonspur wechseln", "is-small"], ["subs", "UT", "Untertitel wechseln", "is-small"]]]
  ];
  var REMOTE_KEYS = GROUPS.reduce((acc, g) => acc.concat(g[1].map((b) => b[0])), []);
  function createRemote({ onKey, doc = document }) {
    const el = h2(doc, "div", "lfx-live-remote");
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", "Fernbedienung");
    el.append(h2(doc, "span", "lfx-live-remote__led"));
    for (const [gname, buttons] of GROUPS) {
      const g = h2(doc, "div", `lfx-live-remote__group lfx-live-remote__group--${gname}`);
      for (const [key, label, aria, extra] of buttons) {
        const b = h2(doc, "button", `lfx-live-remote__btn${extra ? ` ${extra}` : ""}`);
        b.type = "button";
        b.dataset.key = key;
        b.setAttribute("aria-label", aria);
        if (key === "power") b.innerHTML = SVG_POWER;
        else b.textContent = label;
        g.append(b);
      }
      el.append(g);
    }
    const click = (e) => {
      const b = e.target.closest && e.target.closest("button[data-key]");
      if (b && el.contains(b)) onKey(b.dataset.key);
    };
    const down = (e) => {
      if (e.target.closest && e.target.closest("button")) e.preventDefault();
    };
    el.addEventListener("click", click);
    el.addEventListener("mousedown", down);
    return {
      el,
      setOn(on) {
        el.classList.toggle("is-on", !!on);
      },
      destroy() {
        el.removeEventListener("click", click);
        el.removeEventListener("mousedown", down);
        el.remove();
      }
    };
  }

  // src/js/live/ui/keys.js
  var FKEYS = { F1: "red", F2: "green", F3: "yellow", F4: "blue" };
  function isEditable(t) {
    if (!t || !t.tagName) return false;
    const tag = String(t.tagName).toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || !!t.isContentEditable;
  }
  function pickerOpen(doc) {
    return !!doc.querySelector(".lfx-tp, .lfx-popover.is-open");
  }
  function keyName(e, overlayOpen = false) {
    const k = e.key;
    if (typeof k === "string" && k.length === 1 && k >= "0" && k <= "9") return k;
    if (FKEYS[k]) return FKEYS[k];
    switch (k) {
      case "ArrowUp":
        return overlayOpen ? "up" : "ch+";
      case "ArrowDown":
        return overlayOpen ? "down" : "ch-";
      case "ArrowLeft":
        return "left";
      case "ArrowRight":
        return "right";
      case "PageUp":
        return "ch+";
      case "PageDown":
        return "ch-";
      case "+":
      case "=":
        return "vol+";
      case "-":
      case "_":
        return "vol-";
      case "Enter":
        return "ok";
      case "Escape":
      case "Backspace":
        return "back";
      case "m":
      case "M":
        return "mute";
      case "g":
      case "G":
        return "epg";
      case "i":
      case "I":
        return "info";
      case "t":
      case "T":
        return "txt";
      case "f":
      case "F":
        return "fullscreen";
      default:
        return null;
    }
  }
  function createKeys({ onKey, isActive, isOverlayOpen = () => false, win = window }) {
    const doc = win.document;
    let attached = false;
    function handler(e) {
      if (!isActive()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (isEditable(t)) return;
      if (t && t.closest && t.closest(".lfx-tp") || pickerOpen(doc)) return;
      if ((e.key === "Enter" || e.key === " ") && t && t.closest && t.closest(".lfx-live-remote")) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const name = keyName(e, !!isOverlayOpen());
      if (!name) return;
      e.preventDefault();
      e.stopPropagation();
      onKey(name);
    }
    return {
      attach() {
        if (!attached) {
          win.addEventListener("keydown", handler, true);
          attached = true;
        }
      },
      detach() {
        if (attached) {
          win.removeEventListener("keydown", handler, true);
          attached = false;
        }
      },
      destroy() {
        if (attached) {
          win.removeEventListener("keydown", handler, true);
          attached = false;
        }
      },
      handler
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
  function shortName2(channel) {
    if (!channel) return "";
    if (FIXED3[channel.key]) return FIXED3[channel.key];
    let base = channel.genreLabel || String(channel.name || "").replace(/^LIVE\s+/i, "") || `P${channel.no}`;
    base = String(base).trim().toUpperCase();
    return base.length > MAX_NAME ? base.slice(0, MAX_NAME).trim() : base;
  }
  function createLogo(channel, { number = false, doc = document } = {}) {
    const no = channel ? channel.no : 1;
    const root = doc.createElement("div");
    root.className = "lfx-live-logo";
    root.style.setProperty("--lfx-live-logo-bg", channelColor(no));
    root.style.setProperty("--lfx-live-logo-ink", channelInk(no));
    const mark = doc.createElement("span");
    mark.className = "lfx-live-logo__mark";
    mark.textContent = "LIVE";
    const name = doc.createElement("span");
    name.className = "lfx-live-logo__name";
    name.textContent = shortName2(channel);
    root.append(mark, name);
    if (number) {
      const n = doc.createElement("span");
      n.className = "lfx-live-logo__no";
      n.textContent = String(no);
      root.append(n);
    }
    return root;
  }

  // src/js/live/ui/osd.js
  var SHOW_MS = 5e3;
  var INFO_MS = 8e3;
  function createOsd(container, { doc = document, win = window } = {}) {
    const el = h2(doc, "div", "lfx-live-osd");
    el.setAttribute("aria-live", "polite");
    const chBox = h2(doc, "div", "lfx-live-osd__ch");
    const chNo = h2(doc, "span", "lfx-live-osd__no");
    const logoHost = h2(doc, "span", "lfx-live-osd__logo");
    chBox.append(chNo, logoHost);
    const input = h2(doc, "div", "lfx-live-osd__input");
    const msg = h2(doc, "div", "lfx-live-osd__msg");
    const vol = h2(doc, "div", "lfx-live-osd__vol");
    const volLabel = h2(doc, "span", "lfx-live-osd__vol-label", "Lautst\xE4rke");
    const volRail = h2(doc, "span", "lfx-live-osd__vol-rail");
    const volFill = h2(doc, "span", "lfx-live-osd__vol-fill");
    volRail.append(volFill);
    const volNum = h2(doc, "span", "lfx-live-osd__vol-num");
    const volHint = h2(doc, "span", "lfx-live-osd__vol-hint");
    vol.append(volLabel, volRail, volNum, volHint);
    const bar = h2(doc, "div", "lfx-live-osd__bar");
    const nowRow = h2(doc, "div", "lfx-live-osd__row lfx-live-osd__row--now");
    const nowTime = h2(doc, "span", "lfx-live-osd__time");
    const nowTitle = h2(doc, "span", "lfx-live-osd__title");
    const nowBadges = h2(doc, "span", "lfx-live-osd__badges");
    nowRow.append(nowTime, nowTitle, nowBadges);
    const rail = h2(doc, "div", "lfx-live-osd__progress");
    const fill = h2(doc, "span", "lfx-live-osd__progress-fill");
    rail.append(fill);
    const nextRow = h2(doc, "div", "lfx-live-osd__row lfx-live-osd__row--next");
    const nextTime = h2(doc, "span", "lfx-live-osd__time");
    const nextTitle = h2(doc, "span", "lfx-live-osd__title");
    nextRow.append(nextTime, nextTitle);
    bar.append(nowRow, rail, nextRow);
    const info = h2(doc, "div", "lfx-live-osd__info");
    const infoTitle = h2(doc, "div", "lfx-live-osd__info-title");
    const infoSub = h2(doc, "div", "lfx-live-osd__info-sub");
    const infoMeta = h2(doc, "div", "lfx-live-osd__info-meta");
    const infoBadges = h2(doc, "div", "lfx-live-osd__badges");
    const infoTime = h2(doc, "div", "lfx-live-osd__info-time");
    const infoNext = h2(doc, "div", "lfx-live-osd__info-next");
    info.append(infoTitle, infoSub, infoMeta, infoBadges, infoTime, infoNext);
    el.append(chBox, input, msg, vol, bar, info);
    container.append(el);
    const T = {};
    function timer(name, cls, ms) {
      el.classList.add(cls);
      win.clearTimeout(T[name]);
      if (ms) T[name] = win.setTimeout(() => el.classList.remove(cls), ms);
    }
    function badges2(host, list) {
      host.textContent = "";
      for (const b of list || []) host.append(h2(doc, "span", "lfx-live-osd__badge", b));
    }
    let lastLogoNo = null;
    return {
      el,
      /** data: { no, channel, title, sub, from, to, badges[], progress, next: { title, from } | null } */
      showChannel(data, ms = SHOW_MS) {
        chNo.textContent = String(data.no);
        if (lastLogoNo !== data.no) {
          logoHost.textContent = "";
          logoHost.append(createLogo(data.channel, { doc }));
          lastLogoNo = data.no;
        }
        nowTime.textContent = data.from && data.to ? `${data.from} \u2013 ${data.to}` : "";
        nowTitle.textContent = data.sub ? `${data.title} \xB7 ${data.sub}` : data.title || "";
        badges2(nowBadges, data.badges);
        fill.style.width = `${Math.round(Math.max(0, Math.min(1, data.progress || 0)) * 100)}%`;
        rail.classList.toggle("is-empty", data.progress == null);
        nextTime.textContent = data.next ? `Danach ${data.next.from}` : "";
        nextTitle.textContent = data.next ? data.next.title : "";
        nextRow.hidden = !data.next;
        timer("ch", "is-ch", ms);
      },
      setProgress(f) {
        if (f == null) return;
        fill.style.width = `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
      },
      /** Erweitertes OSD; erneuter Aufruf bei sichtbarem Info schließt es. */
      showInfo(data) {
        if (el.classList.contains("is-info")) {
          this.hideInfo();
          return;
        }
        infoTitle.textContent = data.title || "";
        infoSub.textContent = data.sub || "";
        infoMeta.textContent = (data.meta || []).join(" \xB7 ");
        badges2(infoBadges, data.badges);
        infoTime.textContent = data.from && data.to ? `${data.from} \u2013 ${data.to}` : "";
        infoNext.textContent = data.next ? `Danach ${data.next.from}: ${data.next.title}` : "";
        this.showChannel(data, INFO_MS);
        timer("info", "is-info", INFO_MS);
      },
      hideInfo() {
        win.clearTimeout(T.info);
        el.classList.remove("is-info");
      },
      showInput(text) {
        input.textContent = text;
        timer("input", "is-input", 0);
      },
      clearInput() {
        win.clearTimeout(T.input);
        el.classList.remove("is-input");
      },
      /** { percent, muted, hint } */
      showVolume({ percent, muted, hint }) {
        volFill.style.width = `${muted ? 0 : percent}%`;
        volNum.textContent = muted ? "Stumm" : `${percent}`;
        volHint.textContent = hint || "";
        el.classList.toggle("is-muted", !!muted);
        timer("vol", "is-vol", hint ? 4e3 : 2e3);
      },
      showMessage(text, ms = 3e3) {
        msg.textContent = text;
        timer("msg", "is-msg", ms);
      },
      hideMessage() {
        win.clearTimeout(T.msg);
        el.classList.remove("is-msg");
      },
      hide() {
        for (const k of Object.keys(T)) win.clearTimeout(T[k]);
        el.classList.remove("is-ch", "is-vol", "is-msg", "is-info", "is-input", "is-muted");
      },
      dispose() {
        for (const k of Object.keys(T)) win.clearTimeout(T[k]);
        el.remove();
      }
    };
  }

  // src/js/live/ui/card.js
  var ERROR_TEXTS = {
    video: { title: "Kein Empfang auf diesem Ger\xE4t", sub: "Dieses Ger\xE4t kann den Sender nicht empfangen" },
    browser: { title: "Kein Empfang auf diesem Ger\xE4t", sub: "Bitte einen anderen Browser verwenden" },
    audio: { title: "Ton auf diesem Ger\xE4t nicht empfangbar", sub: "Dem Konto fehlt die Berechtigung zur Ton-Umwandlung" },
    gesture: { title: "Zum Starten tippen", sub: "Der Browser braucht einmal ein Tippen" },
    network: { title: "Empfangsst\xF6rung \u2013 erneuter Versuch \u2026", sub: "" }
  };
  function errorText(reason) {
    return ERROR_TEXTS[reason] || ERROR_TEXTS.network;
  }
  function mmss(ms) {
    const s = Math.max(0, Math.ceil(ms / 1e3));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  }
  function createCard(container, { formatClock: formatClock2 = (t) => new Date(t).toTimeString().slice(0, 5), doc = document, win = window } = {}) {
    const el = h2(doc, "div", "lfx-live-card");
    el.hidden = true;
    const banner = h2(doc, "div", "lfx-live-banner");
    banner.hidden = true;
    container.append(el, banner);
    let kind = null;
    let until = 0;
    let clockEl = null;
    let countEl = null;
    let bannerT = null;
    function reset(k) {
      el.textContent = "";
      el.hidden = false;
      el.dataset.kind = k;
      kind = k;
      clockEl = null;
      countEl = null;
    }
    return {
      el,
      banner,
      kind: () => kind,
      /** { channel, title, at (ms), until (ms), now } */
      showPause({ channel, title, at, until: end, now }) {
        reset("pause");
        until = end || 0;
        el.append(createLogo(channel, { doc, number: true }));
        el.append(h2(doc, "div", "lfx-live-card__kicker", "Kurze Pause"));
        const line = title && at ? `Gleich: ${title} um ${formatClock2(at)}` : "Gleich geht es weiter";
        el.append(h2(doc, "div", "lfx-live-card__title", line));
        countEl = h2(doc, "div", "lfx-live-card__count");
        el.append(countEl);
        this.tick(now == null ? Date.now() : now);
      },
      /** { channel, text, sub, now } – eigenes Testbild: Farbbalken, Kreis, Logo, Uhrzeit. */
      showTest({ channel, text, sub, now }) {
        reset("test");
        const bars = h2(doc, "div", "lfx-live-card__bars");
        for (let i = 0; i < 7; i++) bars.append(h2(doc, "span", `lfx-live-card__bar lfx-live-card__bar--${i}`));
        const mid = h2(doc, "div", "lfx-live-card__mid");
        mid.append(h2(doc, "span", "lfx-live-card__circle"), createLogo(channel, { doc, number: true }));
        clockEl = h2(doc, "div", "lfx-live-card__clock");
        const grey = h2(doc, "div", "lfx-live-card__grey");
        for (let i = 0; i < 8; i++) grey.append(h2(doc, "span", `lfx-live-card__step lfx-live-card__step--${i}`));
        el.append(bars, mid, grey, h2(doc, "div", "lfx-live-card__title", text || ""));
        if (sub) el.append(h2(doc, "div", "lfx-live-card__sub", sub));
        el.append(clockEl);
        this.tick(now == null ? Date.now() : now);
      },
      /** Störbild je Grund (video|browser|audio|network). */
      showError(reason, channel) {
        reset("error");
        const t = errorText(reason);
        el.dataset.reason = ERROR_TEXTS[reason] ? reason : "network";
        el.append(h2(doc, "div", "lfx-live-card__snow"));
        if (channel) el.append(createLogo(channel, { doc, number: true }));
        el.append(h2(doc, "div", "lfx-live-card__title", t.title));
        if (t.sub) el.append(h2(doc, "div", "lfx-live-card__sub", t.sub));
      },
      showBanner(text, ms = 1e4) {
        banner.textContent = text;
        banner.hidden = false;
        win.clearTimeout(bannerT);
        if (ms) bannerT = win.setTimeout(() => {
          banner.hidden = true;
        }, ms);
      },
      hideBanner() {
        win.clearTimeout(bannerT);
        banner.hidden = true;
      },
      hide() {
        el.hidden = true;
        el.textContent = "";
        delete el.dataset.kind;
        kind = null;
        clockEl = null;
        countEl = null;
      },
      /** Jede Sekunde: Countdown bzw. Uhr im Testbild. */
      tick(now) {
        if (countEl) countEl.textContent = until ? `in ${mmss(until - now)}` : "";
        if (clockEl) clockEl.textContent = formatClock2(now);
      },
      dispose() {
        win.clearTimeout(bannerT);
        el.remove();
        banner.remove();
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

  // src/js/live/ui/app.js
  var DEBOUNCE_MS = 400;
  var DIGIT_WAIT_MS = 1500;
  var RETRY_MS = 1e4;
  var SYNC_MS = 3e4;
  var MAX_TIMEOUT = 2147483647;
  var VOL_STEP = 5;
  var PLAYABLE = ["program", "fill", "nightfill"];
  var OVERLAY_FACTORY = { epg: "epg", txt: "ttx", menu: "menu" };
  var OVERLAY_CLASS = { epg: "has-epg", txt: "has-ttx", menu: "has-menu" };
  var p2 = (n) => String(n).padStart(2, "0");
  var clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  function defaultClock(t) {
    const d = new Date(t);
    return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  function pick(it, ...keys) {
    for (const k of keys) if (it[k] != null && it[k] !== "") return it[k];
    return null;
  }
  function itemFields(it, scheduler) {
    if (!it) return { genres: [] };
    const known = (n) => n != null && n !== 9999 ? n : null;
    const g = Array.isArray(it.genres) ? it.genres : [];
    return {
      title: pick(it, "title"),
      seriesName: pick(it, "seriesTitle"),
      season: known(pick(it, "season")),
      episode: known(pick(it, "episode")),
      year: pick(it, "year"),
      genres: scheduler ? genreLabels(scheduler, g) : g,
      runtimeMs: pick(it, "durMs"),
      age: pick(it, "age"),
      seriesId: pick(it, "seriesId"),
      type: pick(it, "kind")
    };
  }
  function createApp(host, { scheduler, player: playerArg, watch, pickFiller: pickFiller2, overlays = {}, deps = {}, opts = {}, time = {} }) {
    const doc = host.ownerDocument || document;
    const win = typeof window !== "undefined" ? window : doc.defaultView;
    const clock = typeof opts.now === "function" ? opts.now : () => Date.now();
    const formatClock2 = time.formatClock || defaultClock;
    const NCH = () => scheduler.channels && scheduler.channels().length || 18;
    const refs = buildTv({ style: opts.style, fakePlayer: !!opts.fakePlayer, doc });
    const { app, room, screen, video, overlay: overlayEl } = refs;
    const noise = createNoise(refs.noise, { win });
    const card = createCard(screen, { formatClock: formatClock2, doc, win });
    const osd = createOsd(screen, { doc, win });
    screen.append(overlayEl);
    const remote = createRemote({ onKey: (k) => press(k), doc });
    room.append(remote.el);
    host.append(app);
    if (opts.phone) app.classList.add("is-phone");
    if (opts.touch) app.classList.add("is-touch");
    let style = normStyle(opts.style);
    let on = false;
    let suspended = false;
    let disposed = false;
    let channel = clamp(Math.round(Number(opts.lastChannel) || 1), 1, 18);
    let entry = null;
    let gen = 0;
    let playing = false;
    let vol = clamp(Math.round((opts.volume == null ? 1 : Number(opts.volume)) * 100), 0, 100);
    let muted = !!opts.muted;
    let digitBuf = "";
    let pendingRestart = null;
    let mutedByPolicy = false;
    let needsTap = false;
    let stallArmed = false;
    let tickCount = 0;
    let lastDay = null;
    const T = {};
    let tickIv = null;
    const made = {};
    const later = (name, fn, ms) => {
      clearTimeout(T[name]);
      T[name] = setTimeout(fn, ms);
    };
    const unlater = (name) => {
      clearTimeout(T[name]);
      T[name] = null;
    };
    const safe = (fn) => {
      try {
        return fn();
      } catch {
        return void 0;
      }
    };
    const player = typeof playerArg === "function" ? playerArg({
      video,
      canvas: refs.fake,
      getInfo: () => ({ channel: channelOf(channel).name, title: entry ? titleOf(entry).title : "" })
    }) : playerArg;
    function channelOf(no) {
      const list = scheduler.channels && scheduler.channels() || [];
      return list.find((c) => c.no === no) || { no, key: "", name: `LIVE ${no}` };
    }
    function titleOf(e) {
      if (!e) return { title: "", sub: null };
      if (e.type === "closedown") return { title: e.reason === "empty" ? "Kein Programm" : "Sendeschluss", sub: null };
      if (e.type === "filler") return { title: "Kurze Pause", sub: null };
      const f = itemFields(e.itemId ? scheduler.item(e.itemId) : null, scheduler);
      if (f.seriesName) {
        const code = f.season != null && f.episode != null ? `S${p2(f.season)}E${p2(f.episode)}` : null;
        const sub = [code, f.title && f.title !== f.seriesName ? f.title : null].filter(Boolean).join(" \xB7 ");
        return { title: f.seriesName, sub: sub || null };
      }
      return { title: f.title || "Unbekannter Titel", sub: null };
    }
    function badgesOf(e) {
      const b = [];
      if (e.rerun) b.push("Wdh.");
      if (e.premiere === "film") b.push("Premiere");
      else if (e.premiere === "episode") b.push("Neue Folge");
      if (e.theme) b.push(`Thementag: ${e.theme}`);
      if (e.type === "fill") b.push("F\xFCllprogramm");
      else if (e.type === "nightfill") b.push(e.label || "F\xFCllprogramm");
      return b;
    }
    function nextProgram(no, e) {
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
    function describe2(no, e, t) {
      const { title, sub } = titleOf(e);
      const nx = nextProgram(no, e);
      const data = {
        no,
        channel: channelOf(no),
        title,
        sub,
        from: formatClock2(e.start),
        to: formatClock2(e.end),
        badges: badgesOf(e),
        progress: clamp((t - e.start) / Math.max(1, e.end - e.start), 0, 1),
        next: nx ? { title: titleOf(nx).title, from: formatClock2(nx.start) } : null,
        meta: []
      };
      const f = itemFields(e.itemId ? scheduler.item(e.itemId) : null, scheduler);
      const age = e.age != null ? e.age : f.age;
      const ageText = typeof age === "number" && age > 0 ? `ab ${age}` : null;
      const mins = f.runtimeMs ? Math.round(Number(f.runtimeMs) / 6e4) : null;
      data.meta = [f.year, f.genres.length ? f.genres.slice(0, 3).join(", ") : null, mins ? `${mins} Min.` : null, ageText].filter((x) => x != null && x !== "");
      return data;
    }
    const ctx = {
      scheduler,
      now: clock,
      channels: () => scheduler.channels(),
      currentChannel: () => channel,
      tune: (no) => tune(no),
      closeOverlay: () => closeOverlays(),
      formatClock: formatClock2,
      formatDay: time.formatDay,
      broadcastDayOf: time.broadcastDayOf,
      dayBounds: time.dayBounds,
      style: () => style,
      setStyle: (id) => setStyle(id),
      styles: STYLES,
      user: deps.user,
      isAdmin: !!(deps.user && deps.user.isAdmin),
      channelConfig: deps.channelConfig || {},
      previousThemeName: deps.previousThemeName,
      leaveToLibrary: (...a) => deps.leaveToLibrary && deps.leaveToLibrary(...a),
      openThemePicker: () => deps.openThemePicker && deps.openThemePicker(),
      openDashboard: () => deps.openDashboard && deps.openDashboard(),
      logout: () => deps.logout && deps.logout(),
      imageUrl: deps.imageUrl,
      toast: (t) => deps.toast && deps.toast(t)
    };
    function overlayInst(name) {
      if (made[name]) return made[name];
      const factory = overlays[OVERLAY_FACTORY[name]];
      if (!factory) return null;
      const inst = factory(ctx);
      made[name] = inst;
      if (inst && inst.el) overlayEl.append(inst.el);
      return inst;
    }
    function syncOverlayClasses() {
      for (const n of Object.keys(OVERLAY_CLASS)) {
        app.classList.toggle(OVERLAY_CLASS[n], !!(made[n] && made[n].isOpen()));
      }
    }
    function openName() {
      for (const n of Object.keys(made)) if (made[n] && made[n].isOpen()) return n;
      return null;
    }
    function closeOverlays() {
      for (const n of Object.keys(made)) if (made[n] && made[n].isOpen()) safe(() => made[n].close());
      syncOverlayClasses();
    }
    function openOverlay(name) {
      const inst = overlayInst(name);
      if (!inst) return;
      for (const n of Object.keys(made)) if (n !== name && made[n] && made[n].isOpen()) made[n].close();
      inst.open();
      syncOverlayClasses();
    }
    function applyVolume() {
      safe(() => player.setVolume && player.setVolume(vol / 100));
      safe(() => player.setMuted && player.setMuted(muted));
    }
    function savePrefs(partial) {
      if (deps.savePrefs) safe(() => deps.savePrefs(partial));
    }
    function changeVolume(key) {
      if (player.volumeSupported === false) {
        muted = key === "vol+" ? false : key === "vol-" ? true : !muted;
        applyVolume();
        osd.showVolume({ percent: vol, muted, hint: "Lautst\xE4rke bitte am Ger\xE4t einstellen" });
        savePrefs({ muted });
        return;
      }
      if (key === "mute") muted = !muted;
      else {
        vol = clamp(vol + (key === "vol+" ? VOL_STEP : -VOL_STEP), 0, 100);
        muted = false;
      }
      applyVolume();
      osd.showVolume({ percent: vol, muted });
      savePrefs({ volume: vol / 100, muted });
    }
    function watchTune() {
      if (!watch || !entry) return;
      const off = Math.max(0, clock() - entry.start);
      safe(() => watch.tune(entry, off));
    }
    function watchLeave(silent) {
      if (watch) safe(() => watch.leave(silent));
    }
    function clearStall() {
      stallArmed = false;
      unlater("stall");
    }
    function showError(reason, g) {
      playing = false;
      clearStall();
      watchLeave(true);
      needsTap = reason === "gesture";
      card.showError(reason, channelOf(channel));
      unlater("retry");
      if (reason === "network") later("retry", () => {
        if (g === gen && on) start(g, false);
      }, RETRY_MS);
    }
    function handleResult(res, g, e) {
      if (g !== gen) return false;
      if (res && res.ok === false) {
        if (res.reason === "aborted") return false;
        showError(res.reason || "network", g);
        return false;
      }
      card.hide();
      playing = true;
      if (e === entry) watchTune();
      return true;
    }
    function userGesture(key) {
      if (needsTap) {
        if (key === "power" || key === "fullscreen") return false;
        needsTap = false;
        safe(() => player.unlock && player.unlock());
        applyVolume();
        mutedByPolicy = false;
        card.hide();
        start(++gen, false);
        return true;
      }
      if (mutedByPolicy) {
        mutedByPolicy = false;
        osd.hideMessage();
        applyVolume();
        return key === "mute" && !muted;
      }
      return false;
    }
    function armAdvance(e, g) {
      const delay = clamp(e.end - clock() + 30, 50, MAX_TIMEOUT);
      later("advance", () => advance(g), delay);
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
      playEntry(n.entry, n.offsetMs, ng, { blend: true });
    }
    async function playEntry(e, offsetMs2, g, { blend = false } = {}) {
      entry = e;
      playing = false;
      unlater("retry");
      unlater("trailer");
      armAdvance(e, g);
      needsTap = false;
      clearStall();
      watchLeave(true);
      app.classList.toggle("is-blend", blend);
      if (blend) later("blend", () => app.classList.remove("is-blend"), 500);
      const t = clock();
      osd.showChannel(describe2(channel, e, t));
      card.hideBanner();
      if (e.type === "fill") card.showBanner("F\xFCllprogramm");
      else if (e.type === "nightfill") card.showBanner(e.label || "F\xFCllprogramm \u2013 regul\xE4res Programm ab 5:00");
      if (PLAYABLE.includes(e.type) && e.itemId) {
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
        await runFiller(e, g);
        return;
      }
      if (e.type === "fill" || e.type === "nightfill") {
        safe(() => player.stop());
        const nx = nextProgram(channel, e);
        const nt = nx && PLAYABLE.includes(nx.type) ? titleOf(nx).title : null;
        card.showPause({ channel: channelOf(channel), title: nt, at: nx ? nx.start : 0, until: e.end, now: clock() });
        return;
      }
      safe(() => player.stop());
      card.showTest({
        channel: channelOf(channel),
        text: e.type === "closedown" && e.reason === "empty" ? "Auf diesem Sender l\xE4uft gerade nichts" : "Sendeschluss",
        now: clock()
      });
    }
    async function runFiller(e, g) {
      let next;
      try {
        next = scheduler.nowOn(channel, e.end).entry;
      } catch {
        next = null;
      }
      let pickRes = { kind: "card" };
      if (pickFiller2) {
        try {
          pickRes = await pickFiller2(e, next, deps, clock);
        } catch {
          pickRes = { kind: "card" };
        }
      }
      if (g !== gen) return;
      if (pickRes && pickRes.kind === "trailer") {
        let res;
        try {
          res = await player.playUrl(pickRes.url, pickRes.offsetMs || 0);
        } catch {
          res = { ok: false, reason: "network" };
        }
        if (g !== gen) return;
        if (res && res.ok !== false) {
          card.hide();
          return;
        }
      }
      safe(() => player.stop());
      const nt = next && PLAYABLE.includes(next.type) ? titleOf(next).title : null;
      card.showPause({ channel: channelOf(channel), title: nt, at: next ? next.start : 0, until: e.end, now: clock() });
      const ts = pickRes && pickRes.trailerStartMs;
      if (ts && ts > clock()) later("trailer", () => {
        if (g === gen && on) runFiller(e, g);
      }, clamp(ts - clock() + 20, 20, MAX_TIMEOUT));
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
      if (!on) return;
      no = ((Math.round(no) - 1) % NCH() + NCH()) % NCH() + 1;
      if (no === channel && entry) {
        osd.showChannel(describe2(channel, entry, clock()));
        return;
      }
      channel = no;
      const g = ++gen;
      unlater("zap");
      unlater("advance");
      unlater("retry");
      unlater("trailer");
      cancelRestart();
      clearStall();
      needsTap = false;
      watchLeave();
      if (!immediate) safe(() => player.stop());
      playing = false;
      entry = null;
      card.hide();
      card.hideBanner();
      noise.flash(style);
      const t = clock();
      try {
        osd.showChannel(describe2(no, scheduler.nowOn(no, t).entry, t));
      } catch {
      }
      if (immediate) start(g);
      else later("zap", () => start(g), DEBOUNCE_MS);
    }
    function startIntervals() {
      if (tickIv) return;
      tickIv = setInterval(onTick, 1e3);
    }
    function stopIntervals() {
      if (tickIv) {
        clearInterval(tickIv);
        tickIv = null;
      }
    }
    function onTick() {
      if (!on) return;
      const t = clock();
      card.tick(t);
      if (entry) osd.setProgress(clamp((t - entry.start) / Math.max(1, entry.end - entry.start), 0, 1));
      for (const n of Object.keys(made)) if (made[n] && made[n].isOpen() && made[n].tick) safe(() => made[n].tick(t));
      if (watch) safe(() => watch.tick());
      tickCount++;
      if (tickCount % (SYNC_MS / 1e3) === 0 && playing && entry && PLAYABLE.includes(entry.type) && entry.itemId) {
        safe(() => player.syncTo(t - entry.start));
      }
      if (time.broadcastDayOf) {
        const D = time.broadcastDayOf(t);
        if (lastDay != null && D !== lastDay && scheduler.prepare) {
          const ds = [0, 1, 2, 3, 4, 5, 6].map((i) => D + i);
          Promise.resolve(safe(() => scheduler.prepare(ds))).catch(() => {
          });
        }
        lastDay = D;
      }
      syncOverlayClasses();
    }
    function powerOn() {
      if (on) return;
      safe(() => player.unlock && player.unlock());
      on = true;
      app.classList.add("is-on", "is-powering-on");
      app.classList.remove("is-powering-off");
      remote.setOn(true);
      later("pw", () => app.classList.remove("is-powering-on"), 700);
      applyVolume();
      startIntervals();
      tune(channel, { immediate: true });
    }
    function stopAll() {
      gen++;
      for (const k of ["zap", "advance", "retry", "trailer", "digit", "restart", "blend"]) unlater(k);
      digitBuf = "";
      pendingRestart = null;
      clearStall();
      needsTap = false;
      mutedByPolicy = false;
      watchLeave();
      safe(() => player.stop());
      noise.stop();
      card.hide();
      card.hideBanner();
      osd.hide();
      closeOverlays();
      playing = false;
      entry = null;
    }
    function powerOff() {
      if (!on) return;
      stopAll();
      on = false;
      stopIntervals();
      app.classList.remove("is-on", "is-powering-on", "is-blend", "is-loading");
      app.classList.add("is-powering-off");
      remote.setOn(false);
      later("pw", () => app.classList.remove("is-powering-off"), 600);
    }
    function digit(d) {
      const n = Number(d);
      if (digitBuf === "") {
        if (n === 0) {
          digitBuf = "0";
          osd.showInput("0_");
          later("digit", cancelDigits, DIGIT_WAIT_MS);
          return;
        }
        if (n === 1) {
          digitBuf = "1";
          osd.showInput("1_");
          later("digit", commitDigits, DIGIT_WAIT_MS);
          return;
        }
        osd.clearInput();
        tune(n);
        return;
      }
      const first = digitBuf;
      digitBuf = "";
      unlater("digit");
      osd.clearInput();
      const no = Number(first + d);
      if (no >= 1 && no <= NCH()) tune(no);
      else osd.showMessage("Dieser Sender existiert nicht");
    }
    function commitDigits() {
      const no = Number(digitBuf);
      digitBuf = "";
      osd.clearInput();
      if (no >= 1) tune(no);
    }
    function cancelDigits() {
      digitBuf = "";
      osd.clearInput();
    }
    function cancelRestart() {
      pendingRestart = null;
      unlater("restart");
    }
    function restart() {
      const e = entry;
      if (!e || !e.itemId || !PLAYABLE.includes(e.type)) {
        osd.showMessage("Von vorne ansehen ist hier nicht m\xF6glich");
        return;
      }
      const f = itemFields(scheduler.item(e.itemId), scheduler);
      const seriesId = e.seriesId || f.seriesId || null;
      const type = f.type ? String(f.type).toLowerCase() : seriesId ? "episode" : "movie";
      pendingRestart = { itemId: e.itemId, meta: { type, seriesId } };
      osd.showMessage(`In ${deps.previousThemeName || "der Mediathek"} von vorne ansehen? OK dr\xFCcken`, 8e3);
      later("restart", cancelRestart, 8e3);
    }
    async function confirmRestart() {
      const r = pendingRestart;
      cancelRestart();
      osd.hideMessage();
      if (!r || !deps.leaveToLibrary) return;
      try {
        await deps.leaveToLibrary(r.itemId, r.meta);
      } catch {
        if (deps.toast) deps.toast("Der Wechsel hat nicht geklappt.");
      }
    }
    function resultFailed(res) {
      return !!res && res.ok === false;
    }
    async function cycleAudio() {
      const tr = safe(() => player.tracks && player.tracks());
      const list = tr && tr.audio || [];
      if (list.length < 2) {
        osd.showMessage("Keine weiteren Tonspuren");
        return;
      }
      const pos = list.findIndex((x) => x.index === tr.audioIndex);
      const nx = list[(pos + 1) % list.length];
      osd.showMessage(`Ton: ${nx.label || nx.lang || "Spur"}`);
      let res;
      try {
        res = await player.setAudio(nx.index);
      } catch {
        res = { ok: false };
      }
      if (resultFailed(res)) osd.showMessage("Diese Tonspur ist nicht verf\xFCgbar");
    }
    async function cycleSubs() {
      const tr = safe(() => player.tracks && player.tracks());
      const subs = tr && tr.subs || [];
      if (!subs.length) {
        osd.showMessage("Keine Untertitel verf\xFCgbar");
        return;
      }
      const list = [{ index: -1, label: "aus" }].concat(subs);
      const cur = tr.subtitleIndex == null ? -1 : tr.subtitleIndex;
      const pos = Math.max(0, list.findIndex((x) => x.index === cur));
      const nx = list[(pos + 1) % list.length];
      osd.showMessage(`Untertitel: ${nx.index === -1 ? "aus" : nx.label || nx.lang || "an"}`);
      try {
        await player.setSubtitle(nx.index);
      } catch {
        osd.showMessage("Untertitel nicht verf\xFCgbar");
      }
    }
    function setStyle(id) {
      const s = normStyle(id);
      if (s === style) {
        savePrefs({ style });
        return;
      }
      app.classList.remove(`lfx-live--style-${style}`);
      style = s;
      app.classList.add(`lfx-live--style-${style}`);
      savePrefs({ style });
    }
    function press(key) {
      if (disposed || suspended) return;
      if (key === "fullscreen") {
        fs.toggle();
        return;
      }
      if (!on) {
        if (key === "power" || key === "ok") powerOn();
        return;
      }
      if ((needsTap || mutedByPolicy) && userGesture(key)) return;
      if (key === "power") {
        powerOff();
        return;
      }
      if (pendingRestart && key !== "ok") cancelRestart();
      const open = openName();
      if (open) {
        const consumed = safe(() => made[open].onKey(key));
        syncOverlayClasses();
        if (consumed) return;
        if (key === "back") {
          closeOverlays();
          return;
        }
        if (OVERLAY_CLASS[key]) {
          if (key === open) closeOverlays();
          else openOverlay(key);
          return;
        }
      }
      if (key !== "back" && digitBuf && !/^[0-9]$/.test(key)) {
        unlater("digit");
        cancelDigits();
      }
      if (/^[0-9]$/.test(key)) {
        digit(key);
        return;
      }
      switch (key) {
        case "ch+":
        case "up":
          tune(channel + 1);
          break;
        case "ch-":
        case "down":
          tune(channel - 1);
          break;
        case "vol+":
        case "right":
          changeVolume("vol+");
          break;
        case "vol-":
        case "left":
          changeVolume("vol-");
          break;
        case "mute":
          changeVolume("mute");
          break;
        case "epg":
        case "txt":
        case "menu":
          openOverlay(key);
          break;
        case "info":
          if (entry) osd.showInfo(describe2(channel, entry, clock()));
          break;
        case "audio":
          cycleAudio();
          break;
        case "subs":
          cycleSubs();
          break;
        case "restart":
          restart();
          break;
        case "ok":
          if (pendingRestart) confirmRestart();
          else if (entry) osd.showChannel(describe2(channel, entry, clock()));
          break;
        case "back":
          if (fs.isOn()) fs.exit();
          else osd.hide();
          break;
        default:
          break;
      }
    }
    const fs = createFullscreen({ target: app, doc, onChange: () => revealRemote(3e3) });
    function revealRemote(ms) {
      app.classList.add("show-remote");
      later("reveal", () => app.classList.remove("show-remote"), ms);
    }
    const onPointer = (e) => {
      if (e.target && e.target.closest && e.target.closest(".lfx-live-remote")) {
        revealRemote(4e3);
        return;
      }
      const landscape = app.classList.contains("is-landscape");
      if (landscape && e.type === "pointerdown") revealRemote(4e3);
      else if (app.classList.contains("is-fullscreen")) revealRemote(3e3);
    };
    app.addEventListener("pointermove", onPointer);
    app.addEventListener("pointerdown", onPointer);
    const onDbl = () => press("fullscreen");
    const onScreenClick = () => {
      if (!on) press("power");
      else if (!suspended && !disposed && (needsTap || mutedByPolicy)) userGesture(null);
    };
    const onCtx = (e) => e.preventDefault();
    screen.addEventListener("dblclick", onDbl);
    screen.addEventListener("click", onScreenClick);
    video.addEventListener("contextmenu", onCtx);
    const mq = win.matchMedia ? safe(() => win.matchMedia("(orientation: landscape)")) : null;
    const applyOrient = () => app.classList.toggle("is-landscape", !!(opts.phone && mq && mq.matches));
    applyOrient();
    if (mq) {
      if (mq.addEventListener) mq.addEventListener("change", applyOrient);
      else if (mq.addListener) mq.addListener(applyOrient);
    }
    const offs = [];
    if (player && typeof player.on === "function") {
      offs.push(player.on("state", (s) => {
        const phase = s && s.phase;
        app.classList.toggle("is-loading", phase === "loading" || phase === "stalled");
        if (phase === "stalled") {
          if (!stallArmed && on && entry) {
            stallArmed = true;
            later("stall", () => watchLeave(true), 6e4);
          }
        } else if (phase === "playing") {
          if (stallArmed) clearStall();
          if (on && playing) watchTune();
        } else if (phase === "error") {
          clearStall();
          watchLeave(true);
        }
        if (phase === "ended" && on && entry && entry.type === "filler" && !card.kind()) {
          const nx = nextProgram(channel, entry);
          card.showPause({ channel: channelOf(channel), title: nx ? titleOf(nx).title : null, at: nx ? nx.start : 0, until: entry.end, now: clock() });
        }
      }));
      offs.push(player.on("autoplay-muted", () => {
        if (!on) return;
        mutedByPolicy = true;
        if (!muted) osd.showMessage("Ton aus \u2013 zum Einschalten tippen oder Stumm-Taste dr\xFCcken", 8e3);
      }));
      offs.push(player.on("error", (err) => {
        if (!on || !entry || entry.type === "filler" || card.kind() === "error") return;
        showError(err && err.reason || "network", gen);
      }));
    }
    const keys = createKeys({
      onKey: press,
      isActive: () => !suspended && !disposed && app.isConnected,
      isOverlayOpen: () => !!openName(),
      win
    });
    keys.attach();
    const instance = {
      el: app,
      press,
      tune: (no) => tune(no),
      isOn: () => on,
      channel: () => channel,
      style: () => style,
      suspend() {
        if (disposed) return;
        powerOff();
        closeOverlays();
        app.classList.remove("is-powering-off");
        suspended = true;
        keys.detach();
        fs.exit();
      },
      resume(newHost) {
        if (disposed) return;
        if (newHost) host = newHost;
        if (!app.isConnected || app.parentNode !== host) host.append(app);
        suspended = false;
        keys.attach();
      },
      dispose() {
        if (disposed) return;
        powerOff();
        stopAll();
        disposed = true;
        stopIntervals();
        for (const k of Object.keys(T)) clearTimeout(T[k]);
        keys.destroy();
        fs.destroy();
        app.removeEventListener("pointermove", onPointer);
        app.removeEventListener("pointerdown", onPointer);
        screen.removeEventListener("dblclick", onDbl);
        screen.removeEventListener("click", onScreenClick);
        video.removeEventListener("contextmenu", onCtx);
        if (mq) {
          if (mq.removeEventListener) mq.removeEventListener("change", applyOrient);
          else if (mq.removeListener) mq.removeListener(applyOrient);
        }
        for (const off of offs) if (typeof off === "function") safe(off);
        for (const n of Object.keys(made)) {
          const o = made[n];
          if (o) {
            safe(() => o.close());
            if (o.el) o.el.remove();
          }
        }
        noise.dispose();
        osd.dispose();
        card.dispose();
        remote.destroy();
        if (watch) safe(() => watch.dispose && watch.dispose());
        if (player) safe(() => player.dispose && player.dispose());
        app.remove();
        if (win.__lfxLive && win.__lfxLive.app === instance) delete win.__lfxLive;
      }
    };
    if (opts.debug) {
      win.__lfxLive = {
        scheduler,
        tune: (no) => tune(no),
        now: clock,
        plan: (no, D) => scheduler.planDay(no, D),
        app: instance
      };
    }
    return instance;
  }

  // src/js/live/entry.js
  var ENGINE_MARK = "__LFX_LIVE_ENGINE__";
  var VERSION = 1;
  var DAYS2 = 7;
  function create(host, deps, opts = {}) {
    const o = opts || {};
    const now = typeof o.now === "function" ? o.now : () => Date.now();
    let app = null;
    let disposed = false;
    let curHost = host;
    let wantSuspend = false;
    const progress = (f, label) => {
      try {
        if (deps.onProgress) deps.onProgress(f, label);
      } catch {
      }
    };
    (async () => {
      try {
        progress(0.02, "Sendersuchlauf \u2026");
        const catalog = normalizeCatalog(deps.catalog);
        const scheduler = createScheduler(catalog, { channelConfig: deps.channelConfig || {}, getBoxSetItems: deps.getBoxSetItems, now });
        const D = broadcastDayOf(now());
        for (let i = 0; i < DAYS2; i++) {
          await scheduler.prepare([D + i]);
          if (disposed) return;
          progress(0.1 + 0.85 * (i + 1) / DAYS2, "Sendersuchlauf \u2026");
        }
        const watch = createWatchTracker({ setPlayed: deps.setPlayed, now });
        app = createApp(curHost, {
          scheduler,
          player: ({ video, canvas, getInfo }) => createPlayer({ video, deps, now, fake: !!o.fakePlayer, canvas, getInfo }),
          watch,
          pickFiller,
          overlays: { epg: createEpg, ttx: createTeletext, menu: createMenu },
          deps,
          opts: o,
          time: { formatClock, formatDay, broadcastDayOf, dayBounds }
        });
        if (wantSuspend) app.suspend();
        progress(1, "Sendersuchlauf \u2026");
        if (deps.onReady) deps.onReady();
      } catch (err) {
        if (!disposed && deps.onFatal) deps.onFatal(err);
      }
    })();
    return {
      suspend() {
        wantSuspend = true;
        if (app) app.suspend();
      },
      resume(h3) {
        wantSuspend = false;
        if (h3) curHost = h3;
        if (app) app.resume(h3);
      },
      dispose() {
        disposed = true;
        if (app) app.dispose();
        app = null;
      },
      isOn() {
        return !!(app && app.isOn());
      }
    };
  }
  if (typeof window !== "undefined") {
    window.LenzFlixLive = { version: VERSION, create, mark: ENGINE_MARK };
  }
})();
