(() => {
  // src/js/live/schedule/time.js
  var MIN = 6e4;
  var HOUR = 36e5;
  var GRID = 3e5;
  var lastSun = (y, m) => {
    const d2 = new Date(Date.UTC(y, m + 1, 0));
    return d2.getUTCDate() - d2.getUTCDay();
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
  var dayOfDate = (y, m, d2) => Math.round(Date.UTC(y, m, d2) / 864e5);
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
  var weekStart = (W2) => 7 * W2 - 3;
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
    const items2 = /* @__PURE__ */ new Map();
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
      items2.set(id, it);
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
        items2.set(e.id, e);
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
      items2.set(id, s);
      if (keep.length) series.push(s);
    }
    const boxsets = dedupe(r.boxsets).map(({ x, id }) => ({ id, name: String(x.Name == null ? "" : x.Name), childCount: num(x.ChildCount) || 0 }));
    const labels = /* @__PURE__ */ new Map();
    for (const [n, m] of labelCounts) {
      let best = null;
      let bc = -1;
      for (const [lab, c2] of m) if (c2 > bc || c2 === bc && cmpStr(lab, best) < 0) {
        best = lab;
        bc = c2;
      }
      labels.set(n, best);
    }
    const counts = /* @__PURE__ */ new Map();
    for (const t of movies.concat(series)) for (const g of t.genres) counts.set(g, (counts.get(g) || 0) + 1);
    const genres = [...counts].map(([n, count]) => ({ norm: n, label: labels.get(n), count })).sort((a, b) => b.count - a.count || cmpStr(a.norm, b.norm)).map((g) => ({ label: g.label, count: g.count, norm: g.norm }));
    return {
      movies,
      series,
      items: items2,
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
  function makeEntries(key, items2, msOf) {
    const out = items2.map((it) => {
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
    const c2 = log2i(C);
    const b = D & C - 1;
    let lo = 0;
    let hi = sorted.length;
    if (c2 > 0) {
      const r = bitrev32(b) >>> 32 - c2;
      const span = 2 ** (32 - c2);
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
    const W2 = cap + 1;
    const suf = new Uint8Array((n + 1) * W2);
    suf[n * W2] = 1;
    for (let i = n - 1; i >= 0; i--) {
      const s = sizes[i];
      for (let c2 = 0; c2 <= cap; c2++) suf[i * W2 + c2] = suf[(i + 1) * W2 + c2] || s <= c2 && suf[(i + 1) * W2 + c2 - s] ? 1 : 0;
    }
    let best = cap;
    while (best > 0 && !suf[best]) best--;
    const out = [];
    let rem = best;
    for (let i = 0; i < n && rem > 0; i++) {
      if (sizes[i] <= rem && suf[(i + 1) * W2 + rem - sizes[i]]) {
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
    const valid = (c2, l) => builder.canPlaceBlock(c2.pieces, { limit: l });
    const take = (c2) => {
      pending.splice(pending.indexOf(c2), 1);
    };
    if (!strict) {
      while (builder.cursor < limit) {
        const c2 = pending.find((x) => valid(x));
        if (!c2) break;
        builder.placeBlock(c2.pieces);
        take(c2);
      }
      if (builder.cursor < limit) builder.fillUntil(limit);
      return;
    }
    while (builder.cursor < limit && limit - builder.cursor > DP_HORIZON) {
      const c2 = pending.find((x) => valid(x, limit));
      if (!c2) break;
      builder.placeBlock(c2.pieces, { limit });
      take(c2);
    }
    if (builder.cursor < limit) {
      const cand = pending.filter((x) => valid(x, limit)).slice(0, DP_MAX_CANDS);
      const idx = packSubset(cand.map((c2) => Math.round(c2.size / GRID)), Math.floor((limit - builder.cursor) / GRID));
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
    const dayStart = (d2) => {
      let v = starts.get(d2);
      if (v === void 0) starts.set(d2, v = wallToUtc(d2, 300));
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
      const items2 = Array.from(keys, (k) => list[k % 2097152]);
      const eff = new Float64Array(items2.length);
      for (let i = 0; i < items2.length; i++) eff[i] = items2[i].kind === "movie" ? items2[i].addedAt : Math.max(items2[i].addedAt, catalog.items.get(items2[i].seriesId).addedAt);
      return { items: items2, eff };
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
      P.chList = Object.freeze(list.map((c2) => Object.freeze(c2)));
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
      const items2 = movies.map((m) => ({ id: m.id, movie: m })).concat(series.map((sv) => ({ id: sv.s.id, s: sv.s, v: sv.v })));
      const msOf = (w) => w.movie ? w.movie.durMs : w.v.aufMs;
      const ageOf = (w) => w.movie ? w.movie.age : w.v.age;
      const a = items2.filter((w) => streamOfAge(ageOf(w)) === "A");
      const b = items2.filter((w) => streamOfAge(ageOf(w)) === "B");
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
      const anchor = candsA.find((c2) => c2.movie && b.a2015 + c2.size <= b.end);
      if (anchor) {
        fillSegment(B, candsA.filter((c2) => c2 !== anchor), { limit: b.a2015, strict: true });
        B.placeBlock(anchor.pieces);
      }
      fillSegment(B, candsA, { limit: b.a2200, strict: false });
      fillSegment(B, candsB, { limit: b.end, strict: true });
      return B.finish();
    }
    const weekTables = /* @__PURE__ */ new Map();
    function weekTable(W2) {
      let t = weekTables.get(W2);
      if (t) return t;
      const Ws = weekStart(W2);
      const svs = seriesAt(Ws);
      const slots = [];
      const streamsOf = { A: [], B: [] };
      for (const sv of svs) streamsOf[streamOfAge(sv.v.age)].push({ id: sv.s.id, s: sv.s, v: sv.v });
      let off = 0;
      for (const S of ["A", "B"]) {
        const sorted = makeEntries("serie", streamsOf[S], (w) => w.v.slotLen);
        const cap = S === "A" ? CAP_MS.A : B_SLOT_CAP;
        const Cw = sorted.length ? bucketCount(poolMs(sorted), cap) : 1;
        const { home, borrow } = rotationWithBorrow(sorted, Cw, W2);
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
      weekTables.set(W2, t = slots);
      return t;
    }
    function slotPieces(slot, D) {
      const { s, v, Cw, admitW } = slot;
      const W2 = weekOf(D);
      const baseW = Math.floor(admitW / Cw);
      const k = 7 * (Math.floor(W2 / Cw) - baseW) + (D - weekStart(W2));
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
  function mkUnit(id, kind, addedAt, items2) {
    let age = null;
    let ms = 0;
    for (const it of items2) {
      if (it.age != null && (age == null || it.age > age)) age = it.age;
      ms += it.durMs;
    }
    return { id, kind, addedAt, day: broadcastDayOf(addedAt), items: items2, age, ms };
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
        const d2 = broadcastDayOf(at);
        let g = byDay2.get(d2);
        if (!g) byDay2.set(d2, g = []);
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
    for (const W2 of WINDOWS) {
      let ms = 0;
      for (const u of avail) if (u.day >= D - W2) ms += u.ms;
      if (ms >= MIN_POOL_MS || W2 === 365) return avail.filter((u) => u.day >= D - W2);
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
        const anchor = candsA.find((c2) => c2.size <= b.a2200 - b.a2015);
        fillSegment(B, candsA.filter((c2) => c2 !== anchor), { limit: b.a2015, strict: true });
        if (anchor) B.placeBlock(anchor.pieces, { limit: b.a2200 });
        fillSegment(B, candsA, { limit: b.a2200, strict: true });
        if (at > b.a2200) fillSegment(B, candsB, { limit: at, strict: true });
        if (B.cursor < at) B.fillUntil(at);
        B.placeBlock(premPieces);
        fillSegment(B, candsB, { limit: b.end, strict: true });
        return B.finish();
      }
      const anchorMovie = P ? null : candsA.find((c2) => c2.movie && b.a2015 + c2.size <= b.end);
      fillSegment(B, candsA.filter((c2) => c2 !== anchorMovie), { limit: b.a2015, strict: true });
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
  function rotated(key, items2, D) {
    if (!items2.length) return [];
    const sorted = makeEntries(key, items2, () => 1);
    const C = bucketCount(sorted.length, 2);
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (let i = 0; i < C; i++) for (const e of rotation(sorted, C, D + i)) if (!seen.has(e.id)) {
      seen.add(e.id);
      out.push(e.it);
    }
    return out;
  }
  function pickDay(items2, key, D) {
    const ms = (it) => slotOf(it.durMs);
    const total = items2.reduce((x, it) => x + ms(it), 0);
    let sel = items2;
    if (total > DAY_CAP_MS) {
      const sorted = makeEntries(key, items2, ms);
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
      for (const c2 of boxsetCands(ctx, D)) {
        const ids = cache.get(c2.id);
        if (!ids) continue;
        const items2 = boxsetItems(ctx, ids, D);
        if (items2.length >= MIN_ITEMS) return { kind, name: "Filmreihe: " + c2.name, items: items2.sort(chrono) };
      }
      return null;
    }
    const P = poolOf(ctx, D);
    if (kind === "overlength") {
      const items2 = P.movies.filter((m) => m.durMs >= OVERLENGTH_MS);
      return items2.length >= MIN_ITEMS ? { kind, name: "\xDCberl\xE4nge", items: pickDay(items2, "themeday:overlength", D) } : null;
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
  function weekOrder(ctx, W2) {
    const D0 = weekStart(W2);
    const cache = stateOf(ctx).boxsets;
    const avail = KINDS.filter((k) => {
      if (k === "boxset") {
        for (const ids of cache.values()) if (ids && boxsetItems(ctx, ids, D0 + 6).length >= MIN_ITEMS) return true;
        return false;
      }
      return themeFor(ctx, k, D0) != null;
    });
    return avail.map((k) => ({ k, h: keyHash("themeday", W2 + ":" + k) })).sort((a, b) => a.h - b.h || cmpStr(a.k, b.k)).map((x) => x.k);
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
        for (const c2 of boxsetCands(ctx, D)) {
          if (!cache.has(c2.id)) {
            if (loads++ >= MAX_LOADS_PER_DAY) break;
            try {
              const r = await ctx.getBoxSetItems(c2.id);
              cache.set(c2.id, Array.isArray(r) ? r.map(String) : null);
            } catch {
              cache.set(c2.id, null);
            }
            stateOf(ctx).themes.clear();
          }
          const ids = cache.get(c2.id);
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
        const failPlay = (r, c2) => fail2(r, c2);
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
        const d2 = video.duration;
        const pos = livePos() / 1e3;
        if (Number.isFinite(d2) && pos >= d2 - 0.5) return;
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
        const c2 = Math.min(1, Math.max(0, n));
        if (nativeVolume) {
          try {
            video.volume = c2;
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
    const d2 = mediaSource && mediaSource.DefaultAudioStreamIndex;
    if (typeof d2 === "number") return d2;
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
    const c2 = String(codec || "").toLowerCase();
    return c2 === "aac" || c2 === "mp3";
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
    for (const [r, c2] of CODE_BY_REASON) if (reasons.includes(r)) return c2;
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
    const h3 = Number(v.Height) || 0;
    return [
      v.Profile ? String(v.Profile).replace(/[^\w :.-]/g, "").slice(0, 16) : "",
      lv > 0 ? `L${videoCodecOf(ms) === "h264" ? +(lv / 10).toFixed(1) : lv}` : "",
      Number(v.BitDepth) > 0 ? `${Number(v.BitDepth)} Bit` : "",
      pf && !/^yuvj?420p(10|12)?(le|be)?$/.test(pf) ? short(pf, 12) : "",
      w && h3 ? `${w}\xD7${h3}` : "",
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
      if (body.SubtitleStreamIndex === void 0) delete body.SubtitleStreamIndex;
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
        info = await post({ AudioStreamIndex: want, MediaSourceId: first.Id, EnableDirectPlay: false, SubtitleStreamIndex: void 0 });
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
      const h3 = canvas.height || 360;
      const bw = w / BARS.length;
      BARS.forEach((c2, i) => {
        ctx.fillStyle = c2;
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
        const d2 = parseFloat(l.slice(8));
        dur = Number.isFinite(d2) && d2 > 0 ? d2 : 0;
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
        const seg2 = !playlist && (/\/hls\d*\//i.test(name) || /\/videos\/[^?#]*\.(?:mp4|ts|m4s)(?:[?#]|$)/i.test(name));
        if (!playlist && !seg2) continue;
        n++;
        if (seg2 && e.responseStart > 0 && (first == null || e.responseStart < first)) first = e.responseStart;
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
    let keep = false;
    function teardown() {
      const s = session;
      session = null;
      vc.clear();
      if (s && s.mode === "hls" && s.playSessionId) {
        try {
          return Promise.resolve(deps.request("DELETE", "/Videos/ActiveEncodings", {
            params: { deviceId: deps.server && deps.server.deviceId, playSessionId: s.playSessionId },
            ...keep ? { keepalive: true } : {}
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
    const logWarm = (id, c2) => {
      if (!id) return;
      warmLog.delete(id);
      warmLog.set(id, c2);
      while (warmLog.size > WARM_LOG_MAX) warmLog.delete(warmLog.keys().next().value);
    };
    let ctlNote = null;
    const noteSkip = (c2) => {
      ctlNote = c2 || null;
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
      const c2 = new AbortController();
      const onAbort = () => c2.abort();
      signal.addEventListener("abort", onAbort, { once: true });
      const t = now();
      try {
        const res = await doFetch(url, { signal: c2.signal });
        if (!res.ok) return { ok: false };
        const reader = res.body && typeof res.body.getReader === "function" ? res.body.getReader() : null;
        if (reader) await reader.read();
        return { ok: true, ms: Math.max(0, now() - t) };
      } finally {
        signal.removeEventListener("abort", onAbort);
        try {
          c2.abort();
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
      const seg2 = pickSegment(segments, offsetMs2 / 1e3);
      let segFirstByteMs = null;
      if (seg2) {
        const fb = await firstByte(seg2.url, signal);
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
          params: { deviceId: deps.server && deps.server.deviceId, playSessionId: r.playSessionId },
          ...keep ? { keepalive: true } : {}
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
    function releaseWarm() {
      for (const [id, rec] of [...warmPending]) {
        if (rec.r && !rec.taken) {
          rec.released = true;
          deleteWarmSession(rec.r);
        }
        abortWarmPending(id);
      }
      for (const id of [...warm.keys()]) dropWarm(id, "weg");
      clearTimeout(warmTimer);
      warmTimer = null;
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
      const c2 = cache.get(itemId);
      if (fresh(c2) && c2.mode === "direct" && !directFailed.has(itemId)) {
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
        if (!stored && !rec.taken && !rec.released) deleteWarmSession(r);
      }
    }
    function refreshWarm(itemId, e, offsetMs2) {
      const running = warmPending.get(itemId);
      if (running) {
        logWarm(itemId, "pending");
        return running.p;
      }
      const seg2 = pickSegment(e.segments, offsetMs2 / 1e3);
      if (e.refreshes >= WARM_REFRESH_MAX || !seg2) {
        logWarm(itemId, "max");
        return Promise.resolve({ ok: true, skipped: true });
      }
      const ac2 = new AbortController();
      const rec = { ac: ac2, p: null };
      const clearTo = armPendingTimeout(itemId, rec);
      rec.p = (async () => {
        try {
          const fb = await firstByte(seg2.url, ac2.signal);
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
        const c2 = cache.get(itemId);
        if (fresh(c2) && c2.mode === "direct" && c2.r && !directFailed.has(itemId)) {
          lastCached = true;
          return c2.r;
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
      /** Verlassen: alle vorgewärmten Sitzungen (und laufende Vorwärm-Abrufe) sofort beenden; Vorwärmen bleibt danach möglich. */
      releaseWarm,
      /** Nur synchron um stop()/releaseWarm() beim Seite-Verlassen: DELETE mit keepalive. */
      setKeepalive(b) {
        keep = !!b;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        gen++;
        cancelRequests();
        teardown();
        releaseWarm();
        vc.dispose();
        cache.clear();
        inflight.clear();
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
  var DRAG_PX = 6;
  var STEP_MIN = 120;
  function boundsOf(ctx, D) {
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
    return e > s ? { start: s, end: e } : null;
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
    const nav = h("div", "lfx-live-epg__nav");
    nav.setAttribute("role", "group");
    nav.setAttribute("aria-label", "Zeitleiste verschieben");
    [
      ["back", "\u25C0", "2 Stunden zur\xFCck"],
      ["fwd", "\u25B6", "2 Stunden vor"],
      ["now", "Jetzt", "Zu jetzt springen"]
    ].forEach(([act, label, aria]) => {
      const b = h("button", "lfx-live-epg__navbtn", label);
      b.type = "button";
      b.dataset.act = act;
      b.setAttribute("aria-label", aria);
      b.addEventListener("click", () => {
        if (act === "now") onKey("yellow");
        else scrollByMin(act === "back" ? -STEP_MIN : STEP_MIN);
      });
      nav.append(b);
    });
    const info = h("div", "lfx-live-epg__info");
    const infoTitle = h("div", "lfx-live-epg__info-title");
    const infoMeta = h("div", "lfx-live-epg__info-meta");
    info.append(infoTitle, infoMeta);
    const bar = h("div", "lfx-live-epg__bar");
    bar.append(days, nav);
    top.append(bar, info);
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
    ].forEach(([c2, t, key]) => {
      const b = h("button", "lfx-live-epg__key is-" + c2, t);
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
    let gen = 0;
    let day = 0;
    let today = 0;
    let dayInfo = [];
    let totalStart = 0;
    let totalMin = 1;
    let rowsByNo = {};
    const rendered = /* @__PURE__ */ new Set();
    let corner = null;
    let focus = { no: 1, start: 0 };
    let anchorT = 0;
    let nowLine = null;
    let lastMinute = -1;
    let detailEntry = null;
    let detailBtns = [];
    let detailIdx = 0;
    let rafId = 0;
    let lock = null;
    let lockTimer = 0;
    let drag = null;
    let suppressClick = false;
    const prepared = /* @__PURE__ */ new Set();
    const planCache = /* @__PURE__ */ new Map();
    const now = () => ctx.now();
    const clock = (t) => ctx.formatClock(t);
    const dayLabel = (D) => {
      const f = ctx.formatDay(D);
      return f.weekday + " " + f.date;
    };
    const clampI = (i) => Math.max(0, Math.min(DAYS - 1, i));
    const channelsFor = (D) => {
      let l;
      try {
        l = ctx.scheduler && typeof ctx.scheduler.channels === "function" ? ctx.scheduler.channels(D) : ctx.channels();
      } catch {
        l = null;
      }
      return Array.isArray(l) ? l : [];
    };
    const planFor = (no, i) => {
      const key = no + ":" + i;
      let p = planCache.get(key);
      if (!p) {
        try {
          p = Array.from(ctx.scheduler.planDay(no, today + i) || []);
        } catch {
          p = [];
        }
        planCache.set(key, p);
      }
      return p;
    };
    function metrics() {
      const tick2 = inner.querySelector(".lfx-live-epg__tick");
      const pm = tick2 ? tick2.getBoundingClientRect().width / COL_MIN : 0;
      const chanW = corner ? corner.getBoundingClientRect().width : 0;
      return { pm, chanW, visible: Math.max(0, scroller.clientWidth - chanW) };
    }
    const reduced = () => {
      try {
        return !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch {
        return true;
      }
    };
    function scrollX(x, smooth) {
      x = Math.max(0, x);
      if (smooth && !reduced() && typeof scroller.scrollTo === "function") scroller.scrollTo({ left: x, behavior: "smooth" });
      else scroller.scrollLeft = x;
    }
    function setLock(i, ms) {
      lock = { i, until: Date.now() + ms };
      clearTimeout(lockTimer);
      lockTimer = setTimeout(scheduleSync, ms + 30);
    }
    function scrollByMin(min) {
      const { pm } = metrics();
      if (pm <= 0) return;
      lock = null;
      scrollX(scroller.scrollLeft + min * pm, true);
    }
    function revealRow(no) {
      const r = rowsByNo[no];
      if (!r) return;
      const ruler = inner.querySelector(".lfx-live-epg__ruler");
      const rh = ruler ? ruler.offsetHeight : 0;
      const t = r.row.offsetTop;
      const hh = r.row.offsetHeight;
      if (t - rh < scroller.scrollTop) scroller.scrollTop = Math.max(0, t - rh);
      else if (t + hh > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = t + hh - scroller.clientHeight;
    }
    function scrollToDay(D, smooth) {
      const i = D - today;
      if (!dayInfo[i]) return;
      setLock(i, smooth && !reduced() ? 1e3 : 150);
      revealRow(focus.no);
      const { pm, visible } = metrics();
      if (pm <= 0) return;
      const x = D === today ? (now() - totalStart) / MIN2 * pm - visible * 0.22 : dayInfo[i].off * pm;
      scrollX(x, smooth);
    }
    function entriesOf(no) {
      const r = rowsByNo[no];
      const out = [];
      if (!r) return out;
      [...r.byDay.keys()].sort((a, b) => a - b).forEach((di) => {
        const d2 = r.byDay.get(di);
        d2.entries.forEach((en, k) => out.push({ en, node: d2.els[k], di }));
      });
      return out;
    }
    const findFocus = () => entriesOf(focus.no).find((x) => x.en.start === focus.start) || null;
    function dayIndexOfTime(t) {
      let r = 0;
      dayInfo.forEach((d2, i) => {
        if (d2.start <= t) r = i;
      });
      return r;
    }
    function ensurePrepared(i) {
      const s = ctx.scheduler;
      const D = today + i;
      if (!s || typeof s.prepare !== "function" || prepared.has(D)) return;
      prepared.add(D);
      const g = gen;
      try {
        const p = s.prepare([D]);
        if (p && typeof p.then === "function") {
          p.then(
            () => {
              if (!opened || g !== gen) return;
              [...planCache.keys()].filter((k) => k.endsWith(":" + i)).forEach((k) => planCache.delete(k));
              if (rendered.has(i)) {
                Object.values(rowsByNo).forEach((r) => renderRowDay(r, i));
                lastMinute = -1;
                refreshNow();
                syncFocus(false);
              }
              if (i === day - today) updateChanHeads();
            },
            () => {
            }
          );
        }
      } catch {
      }
    }
    function buildDays() {
      days.textContent = "";
      for (let i = 0; i < DAYS; i++) {
        const D = today + i;
        const b = h("button", "lfx-live-epg__day", dayLabel(D));
        b.type = "button";
        b.dataset.day = String(D);
        b.addEventListener("click", () => setDay(D));
        days.append(b);
      }
      updateDays();
    }
    function updateDays() {
      days.querySelectorAll(".lfx-live-epg__day").forEach((b) => {
        const on = Number(b.dataset.day) === day;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
        if (on) {
          const l = b.offsetLeft;
          const r = l + b.offsetWidth;
          if (l < days.scrollLeft) days.scrollLeft = Math.max(0, l - 8);
          else if (days.clientWidth && r > days.scrollLeft + days.clientWidth) days.scrollLeft = r - days.clientWidth + 8;
        }
      });
      if (corner) corner.textContent = dayLabel(day);
    }
    function updateChanHeads() {
      const map = new Map(channelsFor(day).map((c2) => [c2.no, c2]));
      const i = day - today;
      Object.keys(rowsByNo).forEach((no) => {
        const r = rowsByNo[no];
        r.ch = map.get(r.ch.no) || r.ch;
        r.nameEl.textContent = shortName(r.ch) || r.ch.name || "";
        const themed = planFor(r.ch.no, i).find((e) => e.theme);
        if (themed) {
          if (!r.themeEl) {
            r.themeEl = h("span", "lfx-live-epg__theme");
            r.headEl.append(r.themeEl);
          }
          r.themeEl.textContent = themed.theme;
        } else if (r.themeEl) {
          r.themeEl.remove();
          r.themeEl = null;
        }
      });
    }
    function build() {
      dayInfo = [];
      let prevEnd = null;
      for (let i = 0; i < DAYS; i++) {
        let b = boundsOf(ctx, today + i);
        if (!b) {
          const s0 = prevEnd != null ? prevEnd : 0;
          b = { start: s0, end: s0 + 24 * 60 * MIN2 };
        }
        dayInfo.push({ D: today + i, start: b.start, end: b.end, off: 0, len: Math.max(1, Math.round((b.end - b.start) / MIN2)) });
        prevEnd = b.end;
      }
      totalStart = dayInfo[0].start;
      dayInfo.forEach((d2) => {
        d2.off = (d2.start - totalStart) / MIN2;
      });
      const last = dayInfo[DAYS - 1];
      totalMin = Math.max(1, last.off + last.len);
      inner.textContent = "";
      inner.style.setProperty("--lfx-live-epg-total", String(totalMin));
      rowsByNo = {};
      rendered.clear();
      const ruler = h("div", "lfx-live-epg__row lfx-live-epg__ruler");
      ruler.setAttribute("role", "row");
      corner = h("div", "lfx-live-epg__chan lfx-live-epg__corner", dayLabel(day));
      corner.setAttribute("role", "columnheader");
      const rtrack = h("div", "lfx-live-epg__track");
      dayInfo.forEach((d2) => {
        const cols = Math.ceil(d2.len / COL_MIN);
        for (let c2 = 0; c2 < cols; c2++) {
          const first = c2 === 0;
          const t = h("div", "lfx-live-epg__tick" + (first ? " is-daymark" : ""));
          t.setAttribute("role", "columnheader");
          if (first) {
            t.dataset.day = String(d2.D);
            t.append(h("span", "lfx-live-epg__daymark", dayLabel(d2.D)));
          } else t.textContent = clock(d2.start + c2 * COL_MIN * MIN2);
          t.style.left = `calc(var(--lfx-live-epg-pm) * ${d2.off + c2 * COL_MIN})`;
          t.style.width = `calc(var(--lfx-live-epg-pm) * ${Math.min(COL_MIN, d2.len - c2 * COL_MIN)})`;
          rtrack.append(t);
        }
      });
      ruler.append(corner, rtrack);
      inner.append(ruler);
      const cur = ctx.currentChannel();
      channelsFor(day).forEach((ch) => {
        const row2 = h("div", "lfx-live-epg__row");
        row2.setAttribute("role", "row");
        row2.dataset.no = String(ch.no);
        if (ch.no === cur) row2.classList.add("is-current");
        const head = h("div", "lfx-live-epg__chan");
        head.setAttribute("role", "rowheader");
        const nameEl = h("span", "lfx-live-epg__name", shortName(ch) || ch.name || "");
        head.append(h("span", "lfx-live-epg__no", String(ch.no)), nameEl);
        const r = { ch, row: row2, headEl: head, nameEl, themeEl: null, secs: [], byDay: /* @__PURE__ */ new Map() };
        head.addEventListener("click", () => {
          ctx.tune(r.ch.no);
          ctx.closeOverlay();
        });
        const track = h("div", "lfx-live-epg__track");
        dayInfo.forEach((d2, i) => {
          const sec2 = h("div", "lfx-live-epg__daysec");
          sec2.dataset.day = String(d2.D);
          sec2.style.left = `calc(var(--lfx-live-epg-pm) * ${d2.off})`;
          sec2.style.width = `calc(var(--lfx-live-epg-pm) * ${d2.len})`;
          r.secs[i] = sec2;
          track.append(sec2);
        });
        row2.append(head, track);
        inner.append(row2);
        rowsByNo[ch.no] = r;
      });
      nowLine = h("div", "lfx-live-epg__nowline");
      nowLine.setAttribute("aria-hidden", "true");
      inner.append(nowLine);
      lastMinute = -1;
      setWindow(0);
      updateChanHeads();
    }
    function renderRowDay(r, i) {
      const sec2 = r.secs[i];
      sec2.textContent = "";
      const entries = [];
      const els = [];
      planFor(r.ch.no, i).forEach((en) => {
        if (en.type === "filler") return;
        entries.push(en);
        const node = blockFor(r, en, i);
        els.push(node);
        sec2.append(node);
      });
      r.byDay.set(i, { entries, els });
    }
    function setWindow(c2) {
      c2 = clampI(c2);
      const want = new Set([c2 - 1, c2, c2 + 1].filter((i) => i >= 0 && i < DAYS));
      let changed = false;
      [...rendered].forEach((i) => {
        if (want.has(i)) return;
        Object.values(rowsByNo).forEach((r) => {
          r.secs[i].textContent = "";
          r.byDay.delete(i);
        });
        rendered.delete(i);
        changed = true;
      });
      want.forEach((i) => {
        if (rendered.has(i)) return;
        Object.values(rowsByNo).forEach((r) => renderRowDay(r, i));
        rendered.add(i);
        ensurePrepared(i);
        changed = true;
      });
      if (changed) {
        lastMinute = -1;
        refreshNow();
        syncFocus(false);
      }
    }
    function blockFor(r, en, i) {
      const ch = r.ch;
      const d2 = describe(ctx.scheduler, en);
      const node = h("div", "lfx-live-epg__ev is-" + en.type);
      node.setAttribute("role", "gridcell");
      node.tabIndex = -1;
      node.dataset.no = String(ch.no);
      node.dataset.start = String(en.start);
      const minFrom = (en.start - dayInfo[i].start) / MIN2;
      const dur = (en.end - en.start) / MIN2;
      node.style.left = `calc(var(--lfx-live-epg-pm) * ${minFrom})`;
      node.style.width = `calc(var(--lfx-live-epg-pm) * ${dur})`;
      const text = h("span", "lfx-live-epg__ev-text");
      const title = h("span", "lfx-live-epg__ev-title", d2.title);
      const meta = h("span", "lfx-live-epg__ev-meta");
      meta.append(h("span", "lfx-live-epg__time", clock(en.start)));
      badges(en).forEach((b) => meta.append(h("span", "lfx-live-epg__badge", b)));
      text.append(title, meta);
      if (en.type === "fill" || en.type === "nightfill") {
        text.append(h("span", "lfx-live-epg__hint", "F\xFCllprogramm"));
      }
      node.append(text);
      node.setAttribute("aria-label", `${clock(en.start)} ${d2.title}${badges(en).length ? ", " + badges(en).join(", ") : ""}`);
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
      Object.values(rowsByNo).forEach((r) => {
        r.byDay.forEach((d2) => {
          d2.entries.forEach((en, k) => d2.els[k].classList.toggle("is-now", en.start <= t && t < en.end));
        });
      });
      if (nowLine) {
        nowLine.hidden = t < totalStart || t > totalStart + totalMin * MIN2;
        nowLine.style.left = `calc(var(--lfx-live-epg-chan) + var(--lfx-live-epg-pm) * ${(t - totalStart) / MIN2})`;
      }
      const cur = ctx.currentChannel();
      inner.querySelectorAll(".lfx-live-epg__row[data-no]").forEach((r) => r.classList.toggle("is-current", Number(r.dataset.no) === cur));
    }
    function syncFocus(scroll) {
      const f = findFocus();
      const r = rowsByNo[focus.no];
      if (!f || !r) return;
      inner.querySelectorAll(".lfx-live-epg__ev.is-focus").forEach((n) => {
        n.classList.remove("is-focus");
        n.tabIndex = -1;
      });
      const node = f.node;
      node.classList.add("is-focus");
      node.tabIndex = 0;
      if (opened && !detailEntry) {
        try {
          node.focus({ preventScroll: true });
        } catch {
        }
      }
      if (scroll && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "nearest", inline: "nearest" });
      const d2 = describe(ctx.scheduler, f.en);
      infoTitle.textContent = d2.title;
      infoMeta.textContent = `${clock(f.en.start)}\u2013${clock(f.en.end)} \xB7 ${r.ch.no} ${r.ch.name}`;
    }
    function pickAt(no, t) {
      const list = entriesOf(no);
      if (!list.length) return null;
      let best = list[0].en;
      let bd = Infinity;
      for (const { en: e } of list) {
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
      const t = day === today ? now() : dayInfo[day - today].start;
      const cur = ctx.currentChannel();
      const no = rowsByNo[cur] ? cur : Number(Object.keys(rowsByNo)[0]) || 1;
      const e = pickAt(no, t);
      focus = { no, start: e ? e.start : 0 };
      anchorT = t;
    }
    function scheduleSync() {
      if (!opened || rafId) return;
      const raf = window.requestAnimationFrame ? (f) => window.requestAnimationFrame(f) : (f) => setTimeout(f, 16);
      rafId = 1;
      const id = raf(() => {
        rafId = 0;
        syncView();
      });
      if (rafId) rafId = id || 1;
    }
    function updateVis() {
      const { chanW } = metrics();
      const edge = scroller.getBoundingClientRect().left + chanW;
      let em = 16;
      let pad = 0;
      inner.querySelectorAll(".lfx-live-epg__ev").forEach((node) => {
        const r = node.getBoundingClientRect();
        if (r.left < edge && r.right > edge) {
          const cs = typeof getComputedStyle === "function" ? getComputedStyle(node) : null;
          if (cs) {
            em = parseFloat(cs.fontSize) || em;
            pad = parseFloat(cs.paddingRight) || 0;
          }
          const vis = Math.max(0, r.right - edge - 0.3 * em - pad);
          node.style.setProperty("--lfx-live-epg-vis", Math.round(vis) + "px");
        } else if (node.style.getPropertyValue("--lfx-live-epg-vis")) {
          node.style.removeProperty("--lfx-live-epg-vis");
        }
      });
    }
    function syncView() {
      if (!opened || !dayInfo.length) return;
      updateVis();
      if (lock && Date.now() < lock.until) {
        setWindow(lock.i);
        return;
      }
      lock = null;
      const { pm, visible } = metrics();
      if (pm <= 0) return;
      const centerMin = (scroller.scrollLeft + visible / 2) / pm;
      let c2 = 0;
      dayInfo.forEach((d2, i) => {
        if (d2.off <= centerMin) c2 = i;
      });
      setWindow(c2);
      if (today + c2 !== day) {
        day = today + c2;
        updateDays();
        updateChanHeads();
      }
    }
    function setDay(D) {
      D = Math.max(today, Math.min(today + DAYS - 1, D));
      day = D;
      closeDetail();
      setWindow(D - today);
      updateDays();
      updateChanHeads();
      focusDefault();
      syncFocus(false);
      scrollToDay(D, true);
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
      const f = findFocus();
      if (!f) return;
      const m = rowsByNo[focus.no];
      const en = f.en;
      detailEntry = { no: focus.no, entry: en };
      const d2 = describe(ctx.scheduler, en);
      detail.textContent = "";
      detail.append(h("h2", "lfx-live-epg__d-title", d2.title));
      const lines2 = [
        `${clock(en.start)}\u2013${clock(en.end)} \xB7 ${statusText(en)}`,
        `Sender ${m.ch.no} \xB7 ${m.ch.name}`,
        [d2.year, d2.genres.slice(0, 3).join(", "), d2.runMin ? d2.runMin + " min" : ""].filter(Boolean).join(" \xB7 ")
      ];
      if (en.theme) lines2.push("Thementag: " + en.theme);
      if (en.type === "fill" || en.type === "nightfill") lines2.push(en.type === "nightfill" ? "F\xFCllprogramm \u2013 regul\xE4res Programm ab 5:00" : "F\xFCllprogramm");
      lines2.filter(Boolean).forEach((l) => detail.append(h("p", "lfx-live-epg__d-line", l)));
      const bs = badges(en);
      if (bs.length) {
        const wrap2 = h("p", "lfx-live-epg__d-badges");
        bs.forEach((b) => wrap2.append(h("span", "lfx-live-epg__badge", b)));
        detail.append(wrap2);
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
      if (d2.itemId) {
        mk("library", "Von vorne ansehen", `In ${ctx.previousThemeName || "der Mediathek"} ansehen`, () => {
          ctx.leaveToLibrary(d2.itemId, { type: d2.kind, seriesId: d2.seriesId });
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
      let list = entriesOf(focus.no);
      let i = list.findIndex((x) => x.en.start === focus.start);
      if (i < 0) {
        setWindow(dayIndexOfTime(focus.start));
        list = entriesOf(focus.no);
        i = list.findIndex((x) => x.en.start === focus.start);
        if (i < 0) return;
      }
      let n = list[i + dx];
      if (!n) {
        const target = list[i].di + dx;
        if (target < 0 || target >= DAYS) return;
        setWindow(target);
        list = entriesOf(focus.no);
        i = list.findIndex((x) => x.en.start === focus.start);
        n = list[i + dx];
        if (!n) return;
      }
      focus.start = n.en.start;
      anchorT = n.en.start;
      syncFocus(true);
    }
    function moveV(dy) {
      const no = focus.no + dy;
      if (!rowsByNo[no]) return;
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
          if (day > today) setDay(day - 1);
          return true;
        case "green":
          if (day < today + DAYS - 1) setDay(day + 1);
          return true;
        case "yellow":
          setDay(today);
          return true;
        default:
          return false;
      }
    }
    scroller.addEventListener("scroll", scheduleSync, { passive: true });
    scroller.addEventListener("pointerdown", (e) => {
      lock = null;
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sl: scroller.scrollLeft, st: scroller.scrollTop, active: false };
    });
    scroller.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.active) {
        if (Math.hypot(dx, dy) < DRAG_PX) return;
        drag.active = true;
        scroller.classList.add("is-dragging");
        try {
          scroller.setPointerCapture(e.pointerId);
        } catch {
        }
      }
      scroller.scrollLeft = Math.max(0, drag.sl - dx);
      scroller.scrollTop = Math.max(0, drag.st - dy);
    });
    const endDrag = (e) => {
      if (!drag || e && e.pointerId != null && e.pointerId !== drag.id) return;
      const was = drag.active;
      try {
        if (was) scroller.releasePointerCapture(drag.id);
      } catch {
      }
      drag = null;
      scroller.classList.remove("is-dragging");
      if (was) {
        suppressClick = true;
        setTimeout(() => {
          suppressClick = false;
        }, 0);
      }
    };
    scroller.addEventListener("pointerup", endDrag);
    scroller.addEventListener("pointercancel", endDrag);
    scroller.addEventListener(
      "click",
      (e) => {
        if (!suppressClick) return;
        suppressClick = false;
        e.stopPropagation();
        e.preventDefault();
      },
      true
    );
    scroller.addEventListener(
      "wheel",
      (e) => {
        lock = null;
        if (e.shiftKey || !e.target || !e.target.closest || !e.target.closest(".lfx-live-epg__ruler")) return;
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        e.preventDefault();
        scroller.scrollLeft = Math.max(0, scroller.scrollLeft + e.deltaY * (e.deltaMode === 1 ? 16 : 1));
      },
      { passive: false }
    );
    function open() {
      opened = true;
      gen++;
      el.hidden = false;
      el.classList.add("is-open");
      today = ctx.broadcastDayOf(now());
      day = today;
      prepared.clear();
      planCache.clear();
      detailEntry = null;
      lock = null;
      detail.hidden = true;
      el.classList.remove("has-detail");
      buildDays();
      build();
      focusDefault();
      syncFocus(true);
      scrollToDay(day, false);
    }
    function close() {
      opened = false;
      detailEntry = null;
      drag = null;
      clearTimeout(lockTimer);
      if (rafId && window.cancelAnimationFrame) window.cancelAnimationFrame(rafId);
      rafId = 0;
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
    let items2 = [];
    let rows = [];
    let lastMinute = -1;
    let headerEl = null;
    const prepared = /* @__PURE__ */ new Set();
    const now = () => ctx.now();
    const chans = () => {
      const l = ctx.channels ? ctx.channels() : ctx.scheduler.channels();
      return Array.isArray(l) ? l : [];
    };
    const chanOf = (no) => chans().find((c2) => c2.no === no) || { no, name: "Sender " + no };
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
        [cs[i], cs[i + half]].forEach((c2) => {
          if (!c2) return;
          segs.push(seg(fit(300 + c2.no + " " + shortName(c2), 20), "cyan", { act: { page: 300 + c2.no } }));
        });
        out.push(row(segs));
      }
      return out;
    }
    function lineFor(entry) {
      if (!entry) return { title: "", start: "" };
      const d2 = describe(ctx.scheduler, entry);
      return { title: d2.title || (entry.type === "filler" ? entry.label || "Pause" : ""), start: ctx.formatClock(entry.start) };
    }
    function pageNow() {
      const t = now();
      const cs = chans();
      subCount = Math.max(1, Math.ceil(cs.length / CH_PER_SUB));
      sub = Math.min(sub, subCount - 1);
      const out = [row([seg(fit("JETZT & DANACH", 28), "yellow"), seg(fit(sub + 1 + "/" + subCount, 12).trimEnd(), "white")], { dbl: true, bg: "blue" })];
      cs.slice(sub * CH_PER_SUB, (sub + 1) * CH_PER_SUB).forEach((c2) => {
        let cur = null;
        let nxt = null;
        try {
          const n = ctx.scheduler.nowOn(c2.no, t);
          cur = n && n.entry;
          const list = ctx.scheduler.upcoming(c2.no, t, 3) || [];
          nxt = list.find((e) => cur && e.start >= cur.end) || null;
        } catch {
        }
        const a = lineFor(cur);
        const b = lineFor(nxt);
        const act = { tune: c2.no };
        out.push(row([seg(fit(c2.no, 3).slice(0, 3), "yellow", { act }), seg(fit(shortName(c2), 10) + " ", "cyan", { act, nocursor: true }), seg(a.start + " ", "white", { act, nocursor: true }), seg(fit(a.title, 20), "white", { act, nocursor: true })]));
        out.push(row([seg(fit("", 4), "white"), seg(fit("Danach " + b.start + " " + b.title, 36), "green", { act, nocursor: true })]));
      });
      return out;
    }
    function pageChannel() {
      const no = page - 300;
      const c2 = chanOf(no);
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
      const out = [row([seg(fit(page + " " + shortName(c2), 28), "yellow"), seg(sub + 1 + "/" + subCount, "white")], { dbl: true, bg: "blue" })];
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
      items2 = [];
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
            if (!s.nocursor) items2.push({ r: ri, node: n, act: s.act, c: items2.filter((i) => i.r === ri).length });
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
      cursor = keepCursor ? Math.min(cursor, Math.max(0, items2.length - 1)) : Math.min(hint, Math.max(0, items2.length - 1));
      paintCursor();
    }
    function paintCursor() {
      items2.forEach((it, i) => it.node.classList.toggle("is-cursor", i === cursor));
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
      if (!items2.length) return;
      const cur = items2[cursor];
      if (dx) {
        const same = items2.filter((i) => i.r === cur.r);
        const k = same.indexOf(cur) + dx;
        if (same[k]) cursor = items2.indexOf(same[k]);
      } else {
        const cand = items2.filter((i) => dy > 0 ? i.r > cur.r : i.r < cur.r);
        if (cand.length) {
          const rr = dy > 0 ? Math.min(...cand.map((i) => i.r)) : Math.max(...cand.map((i) => i.r));
          const rowItems = cand.filter((i) => i.r === rr);
          cursor = items2.indexOf(rowItems.find((i) => i.c === cur.c) || rowItems[rowItems.length - 1]);
        }
      }
      paintCursor();
      const n = items2[cursor].node;
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
          const d2 = key === "right" ? 1 : -1;
          if (subCount > 1) {
            sub = (sub + d2 + subCount) % subCount;
            input = "";
            rebuild(false);
          } else moveCursor(0, d2);
          return true;
        }
        case "up":
          moveCursor(-1, 0);
          return true;
        case "down":
          moveCursor(1, 0);
          return true;
        case "ok":
          if (items2[cursor]) activate(items2[cursor].act);
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
      const items2 = [
        { label: "TV-Stil", value: (ctx.styles.find((s) => s.id === ctx.style()) || {}).name || "", act: () => push("style") },
        { label: "Senderliste", act: () => push("channels") }
      ];
      if (ctx.toggleMusic) {
        const musicLabel = () => ctx.musicEnabled && ctx.musicEnabled() ? "An" : "Aus";
        items2.push({
          label: "Pausenmusik",
          value: musicLabel(),
          act: () => {
            const on = ctx.toggleMusic();
            ctx.toast(on ? "Pausenmusik an." : "Pausenmusik aus.");
            render();
          }
        });
      }
      if (ctx.toggleFx && (ctx.style() === "crt80" || ctx.style() === "silver")) {
        items2.push({
          label: "R\xF6hren-Effekte",
          value: ctx.fxEnabled && ctx.fxEnabled() ? "An" : "Aus",
          act: () => {
            const on = ctx.toggleFx();
            ctx.toast(on ? "R\xF6hren-Effekte an." : "R\xF6hren-Effekte aus.");
            render();
          }
        });
      }
      if (ctx.openOverlay) {
        items2.push({ label: "Fernsehzeitung als PDF", act: () => closeThen(() => ctx.openOverlay("guide", { autoPdf: true })) });
      }
      if (isAdmin()) items2.push({ label: "Senderbelegung", act: () => {
        loadSel();
        push("assign");
      } });
      items2.push({ label: `Mediathek (${prev()})`, act: () => closeThen(() => ctx.leaveToLibrary(null)) });
      items2.push({ label: "Design wechseln", act: () => closeThen(() => ctx.openThemePicker()) });
      if (isAdmin()) items2.push({ label: "Dashboard", act: () => closeThen(() => ctx.openDashboard()) });
      items2.push({ label: "Abmelden", act: () => push("logout", null, 1) });
      return { title: "Men\xFC", items: items2 };
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
        items: chans().map((c2) => ({
          label: `${c2.no}  ${shortName(c2) || c2.name}`,
          check: c2.no === cur,
          act: () => closeThen(() => ctx.tune(c2.no))
        }))
      };
    }
    function viewAssign() {
      const cs = chans();
      const items2 = [];
      for (let no = FIRST; no <= LAST; no++) {
        const c2 = cs.find((x) => x.no === no) || {};
        const cur = c2.genreLabel || shortName(c2);
        items2.push({
          label: `Platz ${no}`,
          value: sel[no] ? sel[no] : `Automatisch${cur ? " (derzeit " + cur + ")" : ""}`,
          cls: sel[no] ? "is-set" : "",
          act: () => push("pick", no)
        });
      }
      items2.push({ label: "Zeile kopieren", cls: "is-primary", act: copyLine });
      items2.push({ label: "Zur\xFCck", act: pop });
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
      return { title: "Senderbelegung", items: items2, extra, wide: true };
    }
    function viewPick(no) {
      const items2 = [
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
        (g) => items2.push({
          label: g.label,
          value: String(g.count),
          check: sel[no] === g.label,
          act: () => {
            sel[no] = g.label;
            pop();
          }
        })
      );
      return { title: `Platz ${no}: Genre w\xE4hlen`, items: items2 };
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

  // src/js/live/magazine/view.js
  var FLIP_MS = 600;
  var SINGLE_MS = 320;
  var SWIPE_PX = 40;
  function reducedMotion() {
    try {
      return !!(globalThis.matchMedia && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch {
      return false;
    }
  }
  function pairSpreads(pages, mode) {
    const n = pages.length;
    if (mode === "single") return pages.map((_, i) => [null, i]);
    const out = [];
    if (!n) return out;
    out.push([null, 0]);
    let end = n;
    const hasBack = n > 1 && pages[n - 1].kind === "back";
    if (hasBack) end = n - 1;
    for (let i = 1; i < end; i += 2) out.push([i, i + 1 < end ? i + 1 : null]);
    if (hasBack) out.push([n - 1, null]);
    return out;
  }
  function createMagazine(ctx) {
    const el = h("div", "lfx-live-mag");
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Fernsehzeitung");
    el.dataset.style = "flat";
    const bar = h("div", "lfx-live-mag__bar");
    const mast = h("div", "lfx-live-mag__mast", "LIVE Programm");
    const pageInfo = h("div", "lfx-live-mag__pageinfo");
    pageInfo.setAttribute("aria-live", "polite");
    const daysEl = h("div", "lfx-live-mag__days");
    daysEl.setAttribute("role", "group");
    daysEl.setAttribute("aria-label", "Tag w\xE4hlen");
    const pdfBtn = h("button", "lfx-live-mag__btn lfx-live-mag__pdfbtn", "Als PDF herunterladen");
    pdfBtn.type = "button";
    pdfBtn.setAttribute("aria-label", "Als PDF herunterladen");
    const pdfLink = h("a", "lfx-live-mag__pdf", "PDF fertig \u2013 herunterladen");
    pdfLink.hidden = true;
    const closeBtn = h("button", "lfx-live-mag__btn lfx-live-mag__close", "Schlie\xDFen");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Fernsehzeitung schlie\xDFen");
    pdfBtn.setAttribute("title", "Als PDF herunterladen");
    bar.append(mast, pageInfo, daysEl, pdfBtn, pdfLink, closeBtn);
    const stage = h("div", "lfx-live-mag__stage");
    const book = h("div", "lfx-live-mag__book");
    const slotL = h("div", "lfx-live-mag__slot is-left");
    const slotR = h("div", "lfx-live-mag__slot is-right");
    const edgePrev = h("div", "lfx-live-mag__edge is-prev");
    const edgeNext = h("div", "lfx-live-mag__edge is-next");
    edgePrev.setAttribute("aria-hidden", "true");
    edgeNext.setAttribute("aria-hidden", "true");
    const fold = h("div", "lfx-live-mag__fold");
    book.append(slotL, slotR, fold, edgePrev, edgeNext);
    const status = h("div", "lfx-live-mag__status");
    status.setAttribute("role", "status");
    stage.append(book, status);
    el.append(bar, stage);
    let opened = false;
    let magazine = null;
    let spreads = [];
    let cur = 0;
    let mode = "single";
    let token = 0;
    let busy = false;
    let queued = 0;
    let flipTimer = null;
    let leaf = null;
    let pdfState = "idle";
    let wantAuto = false;
    let barFocus = -1;
    let ro = null;
    let rafs = /* @__PURE__ */ new Set();
    const pages = () => magazine ? magazine.pages : [];
    const animOn = () => ctx.animate !== false && !reducedMotion();
    function resolveMode() {
      const m = typeof ctx.mode === "function" ? ctx.mode() : ctx.mode;
      if (m === "double" || m === "single") return m;
      if (el.closest && el.closest(".lfx-live-app.is-phone")) return "single";
      const w = el.clientWidth;
      const hh = el.clientHeight;
      return w > 760 && w > hh ? "double" : "single";
    }
    function img(tip, maxWidth) {
      const fig = h("span", "lfx-live-mag__img");
      const initial = h("span", "lfx-live-mag__initial", String(tip && tip.title || "?").trim().charAt(0).toUpperCase());
      fig.append(initial);
      if (tip && tip.imageId) {
        const im = document.createElement("img");
        im.loading = "lazy";
        im.decoding = "async";
        im.alt = "";
        im.src = ctx.imageUrl(tip.imageId, { maxWidth });
        im.addEventListener("error", () => {
          fig.classList.add("is-failed");
          im.remove();
        });
        fig.append(im);
      } else fig.classList.add("is-failed");
      return fig;
    }
    function badgeEls(list) {
      const w = h("span", "lfx-live-mag__badges");
      (list || []).forEach((b) => w.append(h("span", "lfx-live-mag__badge" + (/^ab \d+/.test(b) ? " is-age" : ""), b)));
      return w;
    }
    function dayTag(p) {
      return p.weekday ? p.weekday + (p.date ? " " + p.date : "") : "";
    }
    function head(p) {
      const hd = h("div", "lfx-live-mag__head");
      hd.append(h("span", "lfx-live-mag__head-title", magazine.title || "LIVE Programm"), h("span", "lfx-live-mag__head-day", dayTag(p)));
      return hd;
    }
    function foot(p) {
      const f = h("div", "lfx-live-mag__foot");
      const n = h("span", "lfx-live-mag__foot-no", String(p.no));
      const d2 = h("span", "lfx-live-mag__foot-day", dayTag(p));
      f.append(p.no % 2 === 0 ? n : d2, p.no % 2 === 0 ? d2 : n);
      return f;
    }
    function meta(t) {
      return [t.kindLabel, t.year, (t.genres || []).join(", "), t.runMin ? t.runMin + " Min." : ""].filter(Boolean).join(" \xB7 ");
    }
    function bodyCover(p, body) {
      const c2 = magazine.cover || {};
      const mh = h("div", "lfx-live-mag__masthead");
      mh.append(h("h2", "lfx-live-mag__mh-title", magazine.title || "LIVE Programm"), h("div", "lfx-live-mag__mh-sub", magazine.subtitle || ""));
      body.append(mh);
      if (c2.hero) {
        const t = c2.hero;
        const hero = h("div", "lfx-live-mag__hero");
        const txt = h("div", "lfx-live-mag__hero-text");
        txt.append(
          h("div", "lfx-live-mag__kicker", t.kindLabel || "Tipp der Woche"),
          h("h3", "lfx-live-mag__hero-title", t.title),
          h("div", "lfx-live-mag__when", [t.time, t.channelName].filter(Boolean).join(" \xB7 ")),
          h("div", "lfx-live-mag__meta", meta(t))
        );
        if (t.overview) txt.append(h("p", "lfx-live-mag__overview", t.overview));
        txt.append(badgeEls(t.badges));
        hero.append(img(t, 600), txt);
        body.append(hero);
      }
      const ts = c2.teasers || [];
      if (ts.length) {
        const box = h("div", "lfx-live-mag__teasers");
        box.append(h("div", "lfx-live-mag__teasers-h", "Thementage"));
        const ul = h("ul", "lfx-live-mag__teasers-l");
        ts.forEach((t) => {
          const li = h("li");
          li.append(h("b", null, t.weekday), document.createTextNode(" " + (t.label || "")));
          ul.append(li);
        });
        box.append(ul);
        body.append(box);
      }
    }
    function bodyTips(p, body) {
      const list = h("ol", "lfx-live-mag__tips");
      (p.tips || []).forEach((t) => {
        const li = h("li", "lfx-live-mag__tip");
        const txt = h("div", "lfx-live-mag__tip-text");
        txt.append(
          h("div", "lfx-live-mag__when", [t.time, t.channelName].filter(Boolean).join(" \xB7 ")),
          h("h3", "lfx-live-mag__tip-title", t.title)
        );
        if (t.sub) txt.append(h("div", "lfx-live-mag__sub", t.sub));
        txt.append(h("div", "lfx-live-mag__meta", meta(t)), badgeEls(t.badges));
        if (t.overview) txt.append(h("p", "lfx-live-mag__overview", t.overview));
        li.append(img(t, 300), txt);
        list.append(li);
      });
      if (p.theme) body.append(h("div", "lfx-live-mag__theme", p.theme));
      body.append(list);
    }
    function rowEl(r) {
      const li = h("li", "lfx-live-mag__row is-" + (r.kind || "program"));
      li.append(h("b", "lfx-live-mag__time", r.time || ""));
      const t = h("span", "lfx-live-mag__rt");
      t.append(h("span", "lfx-live-mag__rtitle", r.title || ""));
      if (r.sub) t.append(h("span", "lfx-live-mag__rsub", " " + r.sub));
      li.append(t);
      (r.badges || []).forEach((b) => li.append(h("span", "lfx-live-mag__badge is-mini" + (/^ab \d+/.test(b) ? " is-age" : ""), b)));
      return li;
    }
    function cellEl(ch) {
      const cell = h("section", "lfx-live-mag__cell");
      const hd = h("h4", "lfx-live-mag__cell-h");
      hd.append(h("b", "lfx-live-mag__cell-no", String(ch.no)), document.createTextNode(" " + String(ch.name || "").replace(/^LIVE\s+/i, "")));
      cell.append(hd);
      if (ch.theme) cell.append(h("div", "lfx-live-mag__cell-theme", ch.theme));
      const ul = h("ul", "lfx-live-mag__rows");
      (ch.rows || []).forEach((r) => ul.append(rowEl(r)));
      cell.append(ul);
      return cell;
    }
    function bodyGrid(p, body, cls, title) {
      if (title) body.append(h("div", "lfx-live-mag__section", title));
      const grid = h("div", "lfx-live-mag__grid " + cls);
      (p.channels || []).forEach((ch) => grid.append(cellEl(ch)));
      body.append(grid);
    }
    function bodyBack(p, body) {
      body.append(h("h3", "lfx-live-mag__back-h", "Hinweise"));
      const ul = h("ul", "lfx-live-mag__notes");
      [
        "F\xFCr alle Zuschauer l\xE4uft zur selben Zeit dasselbe Programm \u2013 wer einschaltet, steigt mitten in der Sendung ein.",
        "Sendungen ab 16 und ab 18 Jahren sind gekennzeichnet. Das Abendprogramm ab 22 Uhr (ab 18 ab 23 Uhr) ist f\xFCr Erwachsene gedacht.",
        "Nachts l\xE4uft ein F\xFCllprogramm, einige Sender beenden ihren Sendetag mit dem Sendeschluss.",
        "\xC4nderungen der Mediathek k\xF6nnen das Programm verschieben; ma\xDFgeblich ist die Anzeige am Fernseher.",
        "Diese Zeitung l\xE4sst sich als PDF herunterladen, zum Ausdrucken im A4-Format."
      ].forEach((t) => ul.append(h("li", null, t)));
      body.append(ul, h("div", "lfx-live-mag__imprint", (magazine.title || "LIVE Programm") + " \xB7 " + (magazine.subtitle || "")));
    }
    function buildPage(i) {
      const p = pages()[i];
      const page = h("article", "lfx-live-mag__page");
      page.dataset.kind = p.kind;
      page.dataset.no = String(p.no);
      page.dataset.index = String(i);
      page.setAttribute("aria-label", "Seite " + p.no);
      const body = h("div", "lfx-live-mag__body");
      if (p.kind === "cover") bodyCover(p, body);
      else if (p.kind === "tips") bodyTips(p, body);
      else if (p.kind === "evening") bodyGrid(p, body, "is-evening", "Abendprogramm ab 20:15 Uhr");
      else if (p.kind === "day") bodyGrid(p, body, "is-day", "Tagesprogramm \xB7 Sender " + (p.part === 2 ? "10\u201318" : "1\u20139"));
      else if (p.kind === "back") bodyBack(p, body);
      if (p.kind === "cover" || p.kind === "back") page.append(body);
      else page.append(head(p), body, foot(p));
      if (p.kind === "day" || p.kind === "evening") scheduleFit(page);
      return page;
    }
    function scheduleFit(page) {
      const raf = globalThis.requestAnimationFrame;
      if (typeof raf !== "function") return;
      const id = raf(() => {
        rafs.delete(id);
        fitCells(page);
      });
      rafs.add(id);
    }
    function fitCells(page) {
      page.querySelectorAll(".lfx-live-mag__rows").forEach((ul) => {
        if (ul.scrollHeight <= ul.clientHeight + 1) return;
        const more = h("li", "lfx-live-mag__row is-more", "\u2026");
        ul.append(more);
        while (ul.scrollHeight > ul.clientHeight + 1 && ul.children.length > 2) ul.children[ul.children.length - 2].remove();
      });
    }
    function slotFill(slot, idx) {
      slot.textContent = "";
      slot.classList.toggle("is-empty", idx == null);
      if (idx != null) slot.append(buildPage(idx));
    }
    function showSpread(i) {
      const s = spreads[i] || [null, null];
      slotFill(slotL, s[0]);
      slotFill(slotR, s[1]);
      updateChrome();
    }
    function pagesOf(i) {
      return (spreads[i] || []).filter((x) => x != null);
    }
    function currentDayIdx() {
      const ps = pagesOf(cur).map((x) => pages()[x]);
      const withD = ps.find((p) => p.D != null);
      if (!withD) return -1;
      return (magazine.days || []).findIndex((d2) => d2.D === withD.D);
    }
    function updateChrome() {
      const ps = pagesOf(cur).map((x) => pages()[x]);
      const total = pages().length;
      if (ps.length) {
        const nos = ps.map((p) => p.no);
        pageInfo.textContent = "Seite " + (nos.length > 1 ? nos[0] + "\u2013" + nos[nos.length - 1] : nos[0]) + " von " + total;
      } else pageInfo.textContent = "";
      const di = currentDayIdx();
      [...daysEl.children].forEach((b, k) => {
        b.classList.toggle("is-active", k === di);
        if (k === di) b.setAttribute("aria-current", "true");
        else b.removeAttribute("aria-current");
      });
      book.classList.toggle("is-first", cur <= 0);
      book.classList.toggle("is-last", cur >= spreads.length - 1);
      book.dataset.spread = String(cur);
    }
    function buildDays() {
      daysEl.textContent = "";
      (magazine.days || []).forEach((d2, k) => {
        const b = h("button", "lfx-live-mag__day", d2.weekday);
        b.type = "button";
        b.setAttribute("aria-label", "Zu " + d2.weekday + " " + (d2.date || ""));
        b.title = d2.weekday + " " + (d2.date || "");
        b.addEventListener("click", () => jumpDay(k));
        daysEl.append(b);
      });
    }
    function applyMode(keepPage) {
      const m = resolveMode();
      book.classList.toggle("is-double", m === "double");
      book.classList.toggle("is-single", m !== "double");
      el.dataset.mode = m;
      if (m === mode && spreads.length) return;
      const pageIdx = spreads.length ? pagesOf(cur)[0] : 0;
      mode = m;
      spreads = pairSpreads(pages(), mode);
      if (keepPage && pageIdx != null) {
        const f = spreads.findIndex((s) => s.includes(pageIdx));
        cur = f < 0 ? 0 : f;
      } else cur = 0;
      if (magazine) {
        finishFlip();
        showSpread(cur);
      }
    }
    function finishFlip() {
      if (flipTimer) {
        clearTimeout(flipTimer);
        flipTimer = null;
      }
      if (leaf) {
        leaf.remove();
        leaf = null;
      }
      slotR.classList.remove("is-flipping-in-next", "is-flipping-in-prev");
      slotL.classList.remove("is-flipping-in-next", "is-flipping-in-prev");
      book.classList.remove("is-flipping");
      busy = false;
    }
    function goTo(target) {
      if (!magazine || !spreads.length) return;
      target = Math.max(0, Math.min(spreads.length - 1, target));
      if (target === cur) return;
      if (busy) {
        queued = target > cur ? 1 : -1;
        return;
      }
      const dir = target > cur ? 1 : -1;
      const from = spreads[cur];
      const to = spreads[target];
      const adjacent = Math.abs(target - cur) === 1;
      const ms = ctx.flipMs != null ? ctx.flipMs : mode === "double" ? FLIP_MS : SINGLE_MS;
      if (!animOn() || !adjacent || ms <= 0) {
        cur = target;
        showSpread(cur);
        return;
      }
      busy = true;
      book.classList.add("is-flipping");
      const prev = cur;
      if (mode === "double") {
        leaf = h("div", "lfx-live-mag__leaf " + (dir > 0 ? "is-next" : "is-prev"));
        const front = h("div", "lfx-live-mag__face is-front");
        const back = h("div", "lfx-live-mag__face is-back");
        const fi = dir > 0 ? from[1] : from[0];
        const bi = dir > 0 ? to[0] : to[1];
        if (fi != null) front.append(buildPage(fi));
        if (bi != null) back.append(buildPage(bi));
        const shade = h("div", "lfx-live-mag__leaf-shade");
        leaf.append(front, back, shade);
        leaf.style.transitionDuration = ms + "ms";
        book.append(leaf);
        if (dir > 0) slotFill(slotR, to[1]);
        else slotFill(slotL, to[0]);
        void leaf.offsetWidth;
        leaf.classList.add("is-turning");
      } else {
        showSpread(target);
        slotR.classList.add(dir > 0 ? "is-flipping-in-next" : "is-flipping-in-prev");
      }
      cur = target;
      flipTimer = setTimeout(() => {
        flipTimer = null;
        finishFlip();
        showSpread(cur);
        const q = queued;
        queued = 0;
        if (q && cur + q >= 0 && cur + q < spreads.length && prev !== cur) goTo(cur + q);
      }, ms + 30);
      updateChrome();
    }
    const step = (d2) => goTo(cur + d2);
    function pageSpread(pageIdx) {
      const f = spreads.findIndex((s) => s.includes(pageIdx));
      return f < 0 ? 0 : f;
    }
    function jumpDay(k) {
      const d2 = (magazine.days || [])[k];
      if (!d2) return;
      const idx = pages().findIndex((p) => p.kind === "tips" && p.D === d2.D);
      if (idx >= 0) goTo(pageSpread(idx));
    }
    function stepDay(dir) {
      if (!magazine) return;
      const n = (magazine.days || []).length;
      let di = currentDayIdx();
      if (di < 0) {
        const onBack = pagesOf(cur).some((x) => pages()[x].kind === "back");
        di = onBack ? n : -1;
      }
      const t = di + dir;
      if (t < 0 || t >= n) return;
      jumpDay(t);
    }
    function setStatus(text, kind) {
      status.textContent = text || "";
      status.dataset.kind = kind || "";
      status.hidden = !text;
    }
    function resetPdf() {
      if (pdfLink.href && /^blob:/.test(pdfLink.getAttribute("href") || "")) {
        try {
          URL.revokeObjectURL(pdfLink.getAttribute("href"));
        } catch {
        }
      }
      pdfState = "idle";
      pdfLink.hidden = true;
      pdfLink.removeAttribute("href");
      pdfLink.removeAttribute("download");
      pdfBtn.hidden = false;
      pdfBtn.disabled = false;
      pdfBtn.textContent = "Als PDF herunterladen";
    }
    async function startPdf() {
      if (pdfState !== "idle" || !magazine) return;
      pdfState = "busy";
      pdfBtn.disabled = true;
      const myMag = magazine;
      const total = myMag.pages.length;
      pdfBtn.textContent = "PDF wird erstellt \u2026 0/" + total;
      try {
        const r = await ctx.downloadPdf(myMag, (done, tot) => {
          if (magazine === myMag && pdfState === "busy") pdfBtn.textContent = "PDF wird erstellt \u2026 " + done + "/" + (tot || total);
        });
        if (magazine !== myMag || !opened) {
          if (r && r.url && /^blob:/.test(r.url)) {
            try {
              URL.revokeObjectURL(r.url);
            } catch {
            }
          }
          return;
        }
        pdfLink.href = r.url;
        pdfLink.setAttribute("download", r.fileName);
        pdfLink.hidden = false;
        pdfBtn.hidden = true;
        pdfState = "done";
        if (ctx.toast) ctx.toast("PDF fertig.");
      } catch {
        if (magazine !== myMag) return;
        pdfState = "idle";
        pdfBtn.disabled = false;
        pdfBtn.textContent = "Als PDF herunterladen";
        if (ctx.toast) ctx.toast("Das PDF konnte nicht erstellt werden.");
        else setStatus("Das PDF konnte nicht erstellt werden.", "error");
      }
    }
    function open(opts) {
      const o = opts || {};
      opened = true;
      el.hidden = false;
      el.dataset.style = ctx.style() || "flat";
      wantAuto = !!o.autoPdf;
      barFocus = -1;
      finishFlip();
      queued = 0;
      const my = ++token;
      magazine = null;
      spreads = [];
      cur = 0;
      mode = "";
      slotL.textContent = "";
      slotR.textContent = "";
      daysEl.textContent = "";
      pageInfo.textContent = "";
      resetPdf();
      pdfBtn.disabled = true;
      book.hidden = true;
      el.classList.add("is-loading");
      setStatus("Heft wird gedruckt \u2026", "loading");
      let p;
      try {
        p = Promise.resolve(ctx.buildMagazine());
      } catch (e) {
        p = Promise.reject(e);
      }
      p.then(
        (m) => {
          if (my !== token || !opened) return;
          if (!m || !Array.isArray(m.pages) || !m.pages.length) {
            el.classList.remove("is-loading");
            setStatus("Das Heft konnte nicht gedruckt werden.", "error");
            return;
          }
          magazine = m;
          el.classList.remove("is-loading");
          setStatus("");
          book.hidden = false;
          pdfBtn.disabled = false;
          buildDays();
          applyMode(false);
          if (wantAuto) {
            wantAuto = false;
            startPdf();
          }
        },
        () => {
          if (my !== token || !opened) return;
          el.classList.remove("is-loading");
          setStatus("Das Heft konnte nicht gedruckt werden. Bitte sp\xE4ter noch einmal versuchen.", "error");
        }
      );
      if (typeof ResizeObserver === "function" && !ro) {
        ro = new ResizeObserver(() => {
          if (opened && magazine) applyMode(true);
        });
        ro.observe(el);
      }
    }
    function close() {
      if (!opened) return;
      opened = false;
      token++;
      finishFlip();
      el.hidden = true;
      if (ro) {
        ro.disconnect();
        ro = null;
      }
      const cancel = globalThis.cancelAnimationFrame;
      rafs.forEach((id) => typeof cancel === "function" && cancel(id));
      rafs.clear();
      slotL.textContent = "";
      slotR.textContent = "";
      magazine = null;
      resetPdf();
    }
    const barButtons = () => [...daysEl.children, pdfBtn, pdfLink, closeBtn].filter((b) => !b.hidden && !b.disabled);
    function focusBar(i) {
      const bs = barButtons();
      if (!bs.length) return;
      barFocus = Math.max(0, Math.min(bs.length - 1, i));
      bs[barFocus].focus();
    }
    function onKey(key) {
      if (!opened) return false;
      switch (key) {
        case "left":
        case "right": {
          if (barFocus >= 0) {
            focusBar(barFocus + (key === "right" ? 1 : -1));
            return true;
          }
          step(key === "right" ? 1 : -1);
          return true;
        }
        case "red":
          stepDay(-1);
          return true;
        case "green":
          stepDay(1);
          return true;
        case "up":
          focusBar(barFocus < 0 ? barButtons().length - 1 : barFocus);
          return true;
        case "down":
          if (barFocus >= 0 && document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
          barFocus = -1;
          return true;
        case "ok": {
          if (barFocus < 0) return false;
          const b = barButtons()[barFocus];
          if (b) b.click();
          return true;
        }
        default:
          return false;
      }
    }
    pdfBtn.addEventListener("click", startPdf);
    closeBtn.addEventListener("click", () => {
      close();
      if (ctx.closeOverlay) ctx.closeOverlay();
    });
    el.addEventListener("click", (e) => {
      if (e.target === el || e.target === stage) {
        close();
        if (ctx.closeOverlay) ctx.closeOverlay();
      }
    });
    bar.addEventListener("focusin", (e) => {
      const i = barButtons().indexOf(e.target);
      if (i >= 0) barFocus = i;
    });
    bar.addEventListener("focusout", () => {
      barFocus = -1;
    });
    let swiped = false;
    let down = null;
    edgePrev.addEventListener("click", () => {
      if (!swiped) step(-1);
    });
    edgeNext.addEventListener("click", () => {
      if (!swiped) step(1);
    });
    book.addEventListener("pointerdown", (e) => {
      swiped = false;
      down = { x: e.clientX, y: e.clientY };
    });
    const endSwipe = (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      down = null;
      if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
        swiped = true;
        step(dx < 0 ? 1 : -1);
      }
    };
    book.addEventListener("pointerup", endSwipe);
    book.addEventListener("pointercancel", () => {
      down = null;
    });
    return { el, open, close, isOpen: () => opened, onKey };
  }

  // src/js/live/pdf/winansi.js
  var C1 = {
    8364: 128,
    8218: 130,
    402: 131,
    8222: 132,
    8230: 133,
    8224: 134,
    8225: 135,
    710: 136,
    8240: 137,
    352: 138,
    8249: 139,
    338: 140,
    381: 142,
    8216: 145,
    8217: 146,
    8220: 147,
    8221: 148,
    8226: 149,
    8211: 150,
    8212: 151,
    732: 152,
    8482: 153,
    353: 154,
    8250: 155,
    339: 156,
    382: 158,
    376: 159
  };
  function codeOf(cp) {
    if (cp >= 32 && cp <= 126) return cp;
    if (cp >= 160 && cp <= 255) return cp;
    return C1[cp] || 0;
  }
  function encodeWinAnsi(str) {
    const out = [];
    for (const ch of String(str == null ? "" : str)) {
      const cp = ch.codePointAt(0);
      if (cp < 32 || cp === 127) {
        out.push(32);
        continue;
      }
      let c2 = codeOf(cp);
      if (c2) {
        out.push(c2);
        continue;
      }
      const base = ch.normalize("NFKD");
      let any = false;
      for (const b of base) {
        const bp = b.codePointAt(0);
        if (bp >= 768 && bp <= 879) continue;
        const bc = codeOf(bp);
        out.push(bc || 63);
        any = true;
      }
      if (!any) out.push(63);
    }
    return Uint8Array.from(out);
  }

  // src/js/live/pdf/writer.js
  var BASE = {
    "sans": "Helvetica",
    "sans-bold": "Helvetica-Bold",
    "serif": "Times-Roman",
    "serif-bold": "Times-Bold",
    "mono": "Courier"
  };
  var FONT_KEYS = Object.keys(BASE);
  function num2(n) {
    n = Number(n);
    if (!Number.isFinite(n)) return "0";
    const s = (Math.round(n * 1e3) / 1e3).toFixed(3).replace(/\.?0+$/, "");
    return s === "-0" || s === "" ? "0" : s;
  }
  function color(r, g, b) {
    if (typeof r === "string") {
      const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(r);
      if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)].map((v) => num2(v / 255)).join(" ");
      return "0 0 0";
    }
    const c2 = (v) => num2(Math.max(0, Math.min(255, Number(v) || 0)) / 255);
    return c2(r) + " " + c2(g) + " " + c2(b);
  }
  function pdfString(str) {
    const b = encodeWinAnsi(str);
    let s = "(";
    for (let i = 0; i < b.length; i++) {
      const c2 = b[i];
      if (c2 === 40 || c2 === 41 || c2 === 92) s += "\\" + String.fromCharCode(c2);
      else if (c2 < 32 || c2 > 126) s += "\\" + c2.toString(8).padStart(3, "0");
      else s += String.fromCharCode(c2);
    }
    return s + ")";
  }
  function parseJpeg(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216) return null;
    let i = 2;
    while (i + 3 < bytes.length) {
      if (bytes[i] !== 255) {
        i++;
        continue;
      }
      let m = bytes[i + 1];
      if (m === 255) {
        i++;
        continue;
      }
      i += 2;
      if (m === 216 || m === 1 || m >= 208 && m <= 215) continue;
      if (m === 217 || m === 218) return null;
      const len = bytes[i] << 8 | bytes[i + 1];
      if (len < 2 || i + len > bytes.length) return null;
      if (m === 192 || m === 193 || m === 194) {
        if (len < 8) return null;
        const precision = bytes[i + 2];
        const height = bytes[i + 3] << 8 | bytes[i + 4];
        const width = bytes[i + 5] << 8 | bytes[i + 6];
        const comps = bytes[i + 7];
        if (precision !== 8 || !width || !height || comps !== 1 && comps !== 3 && comps !== 4) return null;
        return { width, height, comps };
      }
      i += len;
    }
    return null;
  }
  var ascii = (s) => {
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
    return b;
  };
  function createPdf(opts = {}) {
    const pages = [];
    const images = [];
    const title = opts && opts.title ? String(opts.title) : "";
    function addJpeg(bytes) {
      const info = parseJpeg(bytes);
      if (!info) return null;
      const ref = { index: images.length, name: "Im" + (images.length + 1), ...info, bytes };
      images.push(ref);
      return ref;
    }
    function addPage(w, h3) {
      const W2 = Number(w) || 595;
      const H = Number(h3) || 842;
      const ops = [];
      const used = /* @__PURE__ */ new Set();
      const usedImgs = /* @__PURE__ */ new Set();
      const page = {
        width: W2,
        height: H,
        setFill(r, g, b) {
          ops.push(color(r, g, b) + " rg");
        },
        setStroke(r, g, b) {
          ops.push(color(r, g, b) + " RG");
        },
        rect(x, y, rw, rh, o = {}) {
          const stroke = !!o.stroke;
          const fill = o.fill === void 0 ? !stroke : !!o.fill;
          if (!fill && !stroke) return;
          if (stroke && o.lineWidth) ops.push(num2(o.lineWidth) + " w");
          ops.push(num2(x) + " " + num2(H - y - rh) + " " + num2(rw) + " " + num2(rh) + " re " + (fill && stroke ? "B" : fill ? "f" : "S"));
        },
        line(x1, y1, x2, y2, lw = 1) {
          ops.push(num2(lw) + " w " + num2(x1) + " " + num2(H - y1) + " m " + num2(x2) + " " + num2(H - y2) + " l S");
        },
        text(str, x, y, o = {}) {
          const font = FONT_KEYS.includes(o.font) ? o.font : "sans";
          const size = Number(o.size) || 10;
          used.add(font);
          ops.push("BT /F" + (FONT_KEYS.indexOf(font) + 1) + " " + num2(size) + " Tf " + num2(x) + " " + num2(H - y) + " Td " + pdfString(str) + " Tj ET");
        },
        image(ref, x, y, iw, ih) {
          if (!ref || !ref.name) return;
          usedImgs.add(ref.index);
          ops.push("q " + num2(iw) + " 0 0 " + num2(ih) + " " + num2(x) + " " + num2(H - y - ih) + " cm /" + ref.name + " Do Q");
        },
        _ops: ops,
        _imgs: usedImgs
      };
      pages.push(page);
      return page;
    }
    function toBytes() {
      const fontNo = (k) => 4 + k;
      const imgNo = (i) => 4 + FONT_KEYS.length + i;
      const pageBase = 4 + FONT_KEYS.length + images.length;
      const pageNo = (p) => pageBase + p * 2;
      const chunks = [];
      const offsets = [];
      let pos = 0;
      const push = (b) => {
        chunks.push(b);
        pos += b.length;
      };
      const pushStr = (s) => push(ascii(s));
      const beginObj = (n) => {
        offsets[n] = pos;
        pushStr(n + " 0 obj\n");
      };
      const endObj = () => pushStr("\nendobj\n");
      pushStr("%PDF-1.4\n");
      push(Uint8Array.from([37, 226, 227, 207, 211, 10]));
      beginObj(1);
      pushStr("<< /Type /Catalog /Pages 2 0 R >>");
      endObj();
      beginObj(2);
      pushStr("<< /Type /Pages /Count " + pages.length + " /Kids [" + pages.map((_, i) => pageNo(i) + " 0 R").join(" ") + "] >>");
      endObj();
      beginObj(3);
      pushStr("<< /Producer " + pdfString("LENZ LIVE") + (title ? " /Title " + pdfString(title) : "") + " >>");
      endObj();
      FONT_KEYS.forEach((k, i) => {
        beginObj(fontNo(i));
        pushStr("<< /Type /Font /Subtype /Type1 /BaseFont /" + BASE[k] + " /Encoding /WinAnsiEncoding >>");
        endObj();
      });
      images.forEach((im, i) => {
        beginObj(imgNo(i));
        const cs = im.comps === 1 ? "/DeviceGray" : im.comps === 4 ? "/DeviceCMYK" : "/DeviceRGB";
        const dec = im.comps === 4 ? " /Decode [1 0 1 0 1 0 1 0]" : "";
        pushStr("<< /Type /XObject /Subtype /Image /Width " + im.width + " /Height " + im.height + " /ColorSpace " + cs + dec + " /BitsPerComponent 8 /Filter /DCTDecode /Length " + im.bytes.length + " >>\nstream\n");
        push(im.bytes);
        pushStr("\nendstream");
        endObj();
      });
      pages.forEach((p, i) => {
        const fonts = FONT_KEYS.map((_, k) => "/F" + (k + 1) + " " + fontNo(k) + " 0 R").join(" ");
        const xo = [...p._imgs].sort((a, b) => a - b).map((idx) => "/" + images[idx].name + " " + imgNo(idx) + " 0 R").join(" ");
        beginObj(pageNo(i));
        pushStr("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + num2(p.width) + " " + num2(p.height) + "] /Resources << /Font << " + fonts + " >>" + (xo ? " /XObject << " + xo + " >>" : "") + " >> /Contents " + (pageNo(i) + 1) + " 0 R >>");
        endObj();
        const content = p._ops.join("\n");
        beginObj(pageNo(i) + 1);
        pushStr("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream");
        endObj();
      });
      const size = pageBase + pages.length * 2;
      const xrefPos = pos;
      let x = "xref\n0 " + size + "\n0000000000 65535 f \n";
      for (let n = 1; n < size; n++) x += String(offsets[n]).padStart(10, "0") + " 00000 n \n";
      pushStr(x);
      pushStr("trailer\n<< /Size " + size + " /Root 1 0 R /Info 3 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF\n");
      const out = new Uint8Array(pos);
      let o = 0;
      for (const c2 of chunks) {
        out.set(c2, o);
        o += c2.length;
      }
      return out;
    }
    return { addPage, addJpeg, toBytes };
  }

  // src/js/live/pdf/metrics.js
  var FIRST2 = 32;
  var W = {
    "sans": [
      278,
      278,
      355,
      556,
      556,
      889,
      667,
      191,
      333,
      333,
      389,
      584,
      278,
      333,
      278,
      278,
      556,
      556,
      556,
      556,
      556,
      556,
      556,
      556,
      556,
      556,
      278,
      278,
      584,
      584,
      584,
      556,
      1015,
      667,
      667,
      722,
      722,
      667,
      611,
      778,
      722,
      278,
      500,
      667,
      556,
      833,
      722,
      778,
      667,
      778,
      722,
      667,
      611,
      722,
      667,
      944,
      667,
      667,
      611,
      278,
      278,
      278,
      469,
      556,
      333,
      556,
      556,
      500,
      556,
      556,
      278,
      556,
      556,
      222,
      222,
      500,
      222,
      833,
      556,
      556,
      556,
      556,
      333,
      500,
      278,
      556,
      500,
      722,
      500,
      500,
      500,
      334,
      260,
      334,
      584,
      350,
      556,
      350,
      222,
      556,
      333,
      1e3,
      556,
      556,
      333,
      1e3,
      667,
      333,
      1e3,
      350,
      611,
      350,
      350,
      222,
      222,
      333,
      333,
      350,
      556,
      1e3,
      333,
      1e3,
      500,
      333,
      944,
      350,
      500,
      667,
      278,
      333,
      556,
      556,
      556,
      556,
      260,
      556,
      333,
      737,
      370,
      556,
      584,
      333,
      737,
      333,
      400,
      584,
      333,
      333,
      333,
      556,
      537,
      278,
      333,
      333,
      365,
      556,
      834,
      834,
      834,
      611,
      667,
      667,
      667,
      667,
      667,
      667,
      1e3,
      722,
      667,
      667,
      667,
      667,
      278,
      278,
      278,
      278,
      722,
      722,
      778,
      778,
      778,
      778,
      778,
      584,
      778,
      722,
      722,
      722,
      722,
      667,
      667,
      611,
      556,
      556,
      556,
      556,
      556,
      556,
      889,
      500,
      556,
      556,
      556,
      556,
      278,
      278,
      278,
      278,
      556,
      556,
      556,
      556,
      556,
      556,
      556,
      584,
      611,
      556,
      556,
      556,
      556,
      500,
      556,
      500
    ],
    "sans-bold": [
      278,
      333,
      474,
      556,
      556,
      889,
      722,
      238,
      333,
      333,
      389,
      584,
      278,
      333,
      278,
      278,
      556,
      556,
      556,
      556,
      556,
      556,
      556,
      556,
      556,
      556,
      333,
      333,
      584,
      584,
      584,
      611,
      975,
      722,
      722,
      722,
      722,
      667,
      611,
      778,
      722,
      278,
      556,
      722,
      611,
      833,
      722,
      778,
      667,
      778,
      722,
      667,
      611,
      722,
      667,
      944,
      667,
      667,
      611,
      333,
      278,
      333,
      584,
      556,
      333,
      556,
      611,
      556,
      611,
      556,
      333,
      611,
      611,
      278,
      278,
      556,
      278,
      889,
      611,
      611,
      611,
      611,
      389,
      556,
      333,
      611,
      556,
      778,
      556,
      556,
      500,
      389,
      280,
      389,
      584,
      350,
      556,
      350,
      278,
      556,
      500,
      1e3,
      556,
      556,
      333,
      1e3,
      667,
      333,
      1e3,
      350,
      611,
      350,
      350,
      278,
      278,
      500,
      500,
      350,
      556,
      1e3,
      333,
      1e3,
      556,
      333,
      944,
      350,
      500,
      667,
      278,
      333,
      556,
      556,
      556,
      556,
      280,
      556,
      333,
      737,
      370,
      556,
      584,
      333,
      737,
      333,
      400,
      584,
      333,
      333,
      333,
      611,
      556,
      278,
      333,
      333,
      365,
      556,
      834,
      834,
      834,
      611,
      722,
      722,
      722,
      722,
      722,
      722,
      1e3,
      722,
      667,
      667,
      667,
      667,
      278,
      278,
      278,
      278,
      722,
      722,
      778,
      778,
      778,
      778,
      778,
      584,
      778,
      722,
      722,
      722,
      722,
      667,
      667,
      611,
      556,
      556,
      556,
      556,
      556,
      556,
      889,
      556,
      556,
      556,
      556,
      556,
      278,
      278,
      278,
      278,
      611,
      611,
      611,
      611,
      611,
      611,
      611,
      584,
      611,
      611,
      611,
      611,
      611,
      556,
      611,
      556
    ],
    "serif": [
      250,
      333,
      408,
      500,
      500,
      833,
      778,
      180,
      333,
      333,
      500,
      564,
      250,
      333,
      250,
      278,
      500,
      500,
      500,
      500,
      500,
      500,
      500,
      500,
      500,
      500,
      278,
      278,
      564,
      564,
      564,
      444,
      921,
      722,
      667,
      667,
      722,
      611,
      556,
      722,
      722,
      333,
      389,
      722,
      611,
      889,
      722,
      722,
      556,
      722,
      667,
      556,
      611,
      722,
      722,
      944,
      722,
      722,
      611,
      333,
      278,
      333,
      469,
      500,
      333,
      444,
      500,
      444,
      500,
      444,
      333,
      500,
      500,
      278,
      278,
      500,
      278,
      778,
      500,
      500,
      500,
      500,
      333,
      389,
      278,
      500,
      500,
      722,
      500,
      500,
      444,
      480,
      200,
      480,
      541,
      350,
      500,
      350,
      333,
      500,
      444,
      1e3,
      500,
      500,
      333,
      1e3,
      556,
      333,
      889,
      350,
      611,
      350,
      350,
      333,
      333,
      444,
      444,
      350,
      500,
      1e3,
      333,
      980,
      389,
      333,
      722,
      350,
      444,
      722,
      250,
      333,
      500,
      500,
      500,
      500,
      200,
      500,
      333,
      760,
      276,
      500,
      564,
      333,
      760,
      333,
      400,
      564,
      300,
      300,
      333,
      500,
      453,
      250,
      333,
      300,
      310,
      500,
      750,
      750,
      750,
      444,
      722,
      722,
      722,
      722,
      722,
      722,
      889,
      667,
      611,
      611,
      611,
      611,
      333,
      333,
      333,
      333,
      722,
      722,
      722,
      722,
      722,
      722,
      722,
      564,
      722,
      722,
      722,
      722,
      722,
      722,
      556,
      500,
      444,
      444,
      444,
      444,
      444,
      444,
      667,
      444,
      444,
      444,
      444,
      444,
      278,
      278,
      278,
      278,
      500,
      500,
      500,
      500,
      500,
      500,
      500,
      564,
      500,
      500,
      500,
      500,
      500,
      500,
      500,
      500
    ],
    "serif-bold": [
      250,
      333,
      555,
      500,
      500,
      1e3,
      833,
      278,
      333,
      333,
      500,
      570,
      250,
      333,
      250,
      278,
      500,
      500,
      500,
      500,
      500,
      500,
      500,
      500,
      500,
      500,
      333,
      333,
      570,
      570,
      570,
      500,
      930,
      722,
      667,
      722,
      722,
      667,
      611,
      778,
      778,
      389,
      500,
      778,
      667,
      944,
      722,
      778,
      611,
      778,
      722,
      556,
      667,
      722,
      722,
      1e3,
      722,
      722,
      667,
      333,
      278,
      333,
      581,
      500,
      333,
      500,
      556,
      444,
      556,
      444,
      333,
      500,
      556,
      278,
      333,
      556,
      278,
      833,
      556,
      500,
      556,
      556,
      444,
      389,
      333,
      556,
      500,
      722,
      500,
      500,
      444,
      394,
      220,
      394,
      520,
      350,
      500,
      350,
      333,
      500,
      500,
      1e3,
      500,
      500,
      333,
      1e3,
      556,
      333,
      1e3,
      350,
      667,
      350,
      350,
      333,
      333,
      500,
      500,
      350,
      500,
      1e3,
      333,
      1e3,
      389,
      333,
      722,
      350,
      444,
      722,
      250,
      333,
      500,
      500,
      500,
      500,
      220,
      500,
      333,
      747,
      300,
      500,
      570,
      333,
      747,
      333,
      400,
      570,
      300,
      300,
      333,
      556,
      540,
      250,
      333,
      300,
      330,
      500,
      750,
      750,
      750,
      500,
      722,
      722,
      722,
      722,
      722,
      722,
      1e3,
      722,
      667,
      667,
      667,
      667,
      389,
      389,
      389,
      389,
      722,
      722,
      778,
      778,
      778,
      778,
      778,
      570,
      778,
      722,
      722,
      722,
      722,
      722,
      611,
      556,
      500,
      500,
      500,
      500,
      500,
      500,
      722,
      444,
      444,
      444,
      444,
      444,
      278,
      278,
      278,
      278,
      500,
      556,
      500,
      500,
      500,
      500,
      500,
      570,
      500,
      556,
      556,
      556,
      556,
      500,
      556,
      500
    ]
  };
  var widthOf = (font, code) => {
    if (font === "mono") return 600;
    const t = W[font] || W.sans;
    const w = t[code - FIRST2];
    return w == null ? t[0] : w;
  };
  function textWidth(str, font, size) {
    const b = encodeWinAnsi(String(str == null ? "" : str));
    let w = 0;
    for (let i = 0; i < b.length; i++) w += widthOf(font, b[i]);
    return w * size / 1e3;
  }
  function charWidths(str, font, size) {
    const out = [];
    for (const ch of String(str)) out.push(textWidth(ch, font, size));
    return out;
  }
  function ellipsize(str, font, size, maxW) {
    str = String(str == null ? "" : str);
    if (textWidth(str, font, size) <= maxW) return str;
    const ell = "\u2026";
    const ew = textWidth(ell, font, size);
    const chars = Array.from(str);
    const cw = charWidths(str, font, size);
    let w = 0;
    let n = 0;
    while (n < chars.length && w + cw[n] + ew <= maxW) {
      w += cw[n];
      n++;
    }
    const head = chars.slice(0, n).join("").replace(/\s+$/, "");
    return n === 0 && ew > maxW ? "" : head + ell;
  }
  function wrap(str, font, size, maxW) {
    const lines2 = [];
    const words = String(str == null ? "" : str).split(/\s+/).filter(Boolean);
    const space = textWidth(" ", font, size);
    let cur = "";
    let curW = 0;
    const flush = () => {
      if (cur) lines2.push(cur);
      cur = "";
      curW = 0;
    };
    for (const word of words) {
      const ww = textWidth(word, font, size);
      if (ww > maxW) {
        flush();
        let piece = "";
        let pw = 0;
        for (const ch of Array.from(word)) {
          const cwid = textWidth(ch, font, size);
          if (piece && pw + cwid > maxW) {
            lines2.push(piece);
            piece = "";
            pw = 0;
          }
          piece += ch;
          pw += cwid;
        }
        cur = piece;
        curW = pw;
        continue;
      }
      if (!cur) {
        cur = word;
        curW = ww;
      } else if (curW + space + ww <= maxW) {
        cur += " " + word;
        curW += space + ww;
      } else {
        flush();
        cur = word;
        curW = ww;
      }
    }
    flush();
    return lines2;
  }

  // src/js/live/pdf/render.js
  var PW = 595;
  var PH = 842;
  var M = 28;
  var CW = PW - 2 * M;
  var TOP = 88;
  var BOT = 806;
  var hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  var STYLES = {
    crt80: {
      bg: hex("#f3e9cf"),
      ink: hex("#1d1710"),
      muted: hex("#6b5d44"),
      accent: hex("#c8281e"),
      accent2: hex("#f2b705"),
      head: hex("#c8281e"),
      headInk: hex("#fff4d6"),
      zebra: hex("#eadfc0"),
      panel: hex("#e4d6ad"),
      rule: hex("#1d1710"),
      bandInk: hex("#fff4d6"),
      title: "serif-bold",
      body: "sans",
      bold: "sans-bold",
      chipInk: hex("#fff4d6")
    },
    silver: {
      bg: hex("#ffffff"),
      ink: hex("#1a2230"),
      muted: hex("#5d6b7e"),
      accent: hex("#1f5fbf"),
      accent2: hex("#9cc2ff"),
      head: hex("#1f5fbf"),
      headInk: hex("#ffffff"),
      zebra: hex("#eef1f5"),
      panel: hex("#dde4ee"),
      rule: hex("#b8c2d1"),
      bandInk: hex("#ffffff"),
      title: "sans-bold",
      body: "sans",
      bold: "sans-bold",
      chipInk: hex("#ffffff")
    },
    flat: {
      bg: hex("#141414"),
      ink: hex("#ffffff"),
      muted: hex("#a8a8a8"),
      accent: hex("#e50914"),
      accent2: null,
      head: hex("#2b2b2b"),
      headInk: hex("#ffffff"),
      zebra: hex("#1e1e1e"),
      panel: hex("#2b2b2b"),
      rule: hex("#3a3a3a"),
      bandInk: hex("#ffffff"),
      title: "sans-bold",
      body: "sans",
      bold: "sans-bold",
      chipInk: hex("#ffffff")
    },
    plain: {
      bg: hex("#ffffff"),
      ink: hex("#000000"),
      muted: hex("#666666"),
      accent: hex("#000000"),
      accent2: null,
      head: hex("#e6e6e6"),
      headInk: hex("#000000"),
      zebra: hex("#f4f4f4"),
      panel: hex("#e6e6e6"),
      rule: hex("#999999"),
      bandInk: hex("#ffffff"),
      title: "sans-bold",
      body: "sans",
      bold: "sans-bold",
      chipInk: hex("#ffffff")
    }
  };
  var BADGE_SHORT = { "Premiere": "Prem.", "Neue Folge": "Neu", "Wdh.": "Wdh.", "ab 16": "16", "ab 18": "18" };
  function makeCtx(P, st) {
    const fill = (c2) => P.setFill(c2[0], c2[1], c2[2]);
    const T = (str, x, y, font, size, col) => {
      fill(col || st.ink);
      P.text(str, x, y, { font, size });
    };
    const TR = (str, xr, y, font, size, col) => T(str, xr - textWidth(str, font, size), y, font, size, col);
    const TC = (str, xc, y, font, size, col) => T(str, xc - textWidth(str, font, size) / 2, y, font, size, col);
    const R2 = (x, y, w, h3, col) => {
      fill(col);
      P.rect(x, y, w, h3, { fill: true });
    };
    const para = (text, x, y, w, font, size, lead, maxLines, col) => {
      let lines2 = wrap(text, font, size, w);
      if (lines2.length > maxLines) {
        lines2 = lines2.slice(0, maxLines);
        const last = lines2[maxLines - 1].replace(/[\s.,;:!?–-]+$/, "") + "\u2026";
        lines2[maxLines - 1] = ellipsize(last, font, size, w);
      }
      for (const l of lines2) {
        T(l, x, y, font, size, col);
        y += lead;
      }
      return y;
    };
    return { fill, T, TR, TC, R: R2, para };
  }
  var ageText = (age) => age != null && age > 0 ? "ab " + age : "";
  function metaLine(tip) {
    return [tip.year, (tip.genres || []).slice(0, 3).join(", "), tip.runMin ? tip.runMin + " Min." : "", ageText(tip.age)].filter(Boolean).join(" \xB7 ");
  }
  function dayLabelOf(mag, tip) {
    if (!tip || !(tip.start > 0)) return "";
    const D = Math.floor((tip.start - 3 * 36e5) / 864e5);
    const d2 = (mag.days || []).find((x) => x.D === D);
    return d2 ? d2.weekday + " " + d2.date : "";
  }
  function chips(c2, st, list, x, y) {
    for (const b of list.slice(0, 4)) {
      const w = textWidth(b, st.bold, 6.5) + 7;
      c2.R(x, y - 8, w, 10.5, st.accent);
      c2.T(b, x + 3.5, y - 0.5, st.bold, 6.5, st.chipInk);
      x += w + 4;
    }
  }
  function frame(c2, P, st, mag, page, label, total) {
    c2.R(0, 0, PW, PH, st.bg);
    c2.R(0, 0, PW, 14, st.accent);
    if (st.accent2) c2.R(0, 14, PW, 3, st.accent2);
    c2.T("LIVE Programm", M, 30, st.bold, 8, st.accent);
    if (label) c2.TR(label, PW - M, 30, st.body, 8, st.muted);
    P.setStroke(...st.rule);
    P.line(M, 818, PW - M, 818, 0.5);
    c2.T(mag.subtitle || "", M, 830, st.body, 7, st.muted);
    c2.TR("Seite " + page.no + " von " + total, PW - M, 830, st.bold, 7.5, st.muted);
  }
  function pageTitle(c2, P, st, text, sub) {
    c2.T(ellipsize(text, st.title, 22, CW), M, 66, st.title, 22, st.ink);
    if (sub) c2.TR(ellipsize(sub, st.body, 9, 200), PW - M, 66, st.body, 9, st.muted);
    c2.R(M, 72, CW, 2.5, st.accent);
  }
  function drawImage(c2, P, st, ref, x, y, w, h3, initial) {
    c2.R(x, y, w, h3, st.panel);
    if (ref) {
      const s = Math.min(w / ref.width, h3 / ref.height);
      const iw = ref.width * s;
      const ih = ref.height * s;
      P.image(ref, x + (w - iw) / 2, y + (h3 - ih) / 2, iw, ih);
    } else {
      const ch = String(initial || "").trim().charAt(0).toUpperCase() || "L";
      c2.TC(ch, x + w / 2, y + h3 / 2 + h3 * 0.12, st.title, Math.min(w, h3) * 0.5, st.muted);
    }
  }
  function cover(c2, P, st, mag, getImg) {
    return (async () => {
      c2.R(0, 0, PW, PH, st.bg);
      c2.R(0, 0, PW, 172, st.accent);
      if (st.accent2) c2.R(0, 172, PW, 8, st.accent2);
      else {
        P.setStroke(...st.rule);
        P.line(0, 172, PW, 172, 1);
      }
      c2.T("LIVE", M, 108, st.title, 60, st.bandInk);
      c2.T("Programm", M + textWidth("LIVE ", st.title, 60) + 2, 108, st.title, 60, st.bandInk);
      c2.T(ellipsize(mag.subtitle || "", st.body, 15, CW), M, 148, st.body, 15, st.bandInk);
      const hero = mag.cover && mag.cover.hero;
      if (hero) {
        const ref = await getImg(hero.imageId);
        drawImage(c2, P, st, ref, M, 200, 230, 345, hero.title);
        const x = M + 230 + 18;
        const w = PW - M - x;
        let y = 214;
        c2.T(String(hero.kindLabel || "").toUpperCase(), x, y, st.bold, 9, st.accent);
        y += 16;
        const when = [dayLabelOf(mag, hero), hero.time, hero.channelName].filter(Boolean).join(" \xB7 ");
        c2.T(ellipsize(when, st.bold, 10, w), x, y, st.bold, 10, st.muted);
        y += 26;
        const tl = wrap(hero.title, st.title, 24, w).slice(0, 3);
        for (const l of tl) {
          c2.T(l, x, y, st.title, 24, st.ink);
          y += 27;
        }
        if (hero.sub) {
          y = c2.para(hero.sub, x, y + 2, w, st.body, 10, 13, 2, st.muted);
        }
        const meta = metaLine(hero);
        if (meta) {
          y += 4;
          c2.T(ellipsize(meta, st.body, 9.5, w), x, y, st.body, 9.5, st.ink);
          y += 8;
        }
        if (hero.badges && hero.badges.length) {
          y += 12;
          chips(c2, st, hero.badges, x, y);
          y += 6;
        }
        if (hero.overview) {
          y += 22;
          c2.para(hero.overview, x, y, w, st.body, 10, 13.5, Math.max(3, Math.floor((545 - y) / 13.5)), st.ink);
        }
      } else {
        c2.T("Das Programm der Woche", M, 260, st.title, 26, st.ink);
      }
      const teasers = mag.cover && mag.cover.teasers || [];
      c2.R(M, 566, CW, 2.5, st.accent);
      c2.T("Thementage der Woche", M, 590, st.title, 14, st.ink);
      if (!teasers.length) c2.T("Diese Woche keine Thementage.", M, 612, st.body, 9.5, st.muted);
      const cols = 4;
      const gap = 8;
      const bw = (CW - gap * (cols - 1)) / cols;
      const bh = 78;
      teasers.slice(0, 8).forEach((t, i) => {
        const x = M + i % cols * (bw + gap);
        const y = 604 + Math.floor(i / cols) * (bh + gap);
        c2.R(x, y, bw, bh, st.panel);
        c2.R(x, y, 3, bh, st.accent);
        c2.T(t.weekday || "", x + 10, y + 18, st.bold, 12, st.accent);
        c2.para(t.label || "", x + 10, y + 34, bw - 16, st.body, 8.5, 10.5, 4, st.ink);
      });
      P.setStroke(...st.rule);
      P.line(M, 818, PW - M, 818, 0.5);
      c2.T("Das Programm ist f\xFCr alle gleich \xB7 LENZ LIVE", M, 830, st.body, 7, st.muted);
      c2.TR("Seite 1 von " + mag.pages.length, PW - M, 830, st.bold, 7.5, st.muted);
    })();
  }
  function tipsPage(c2, P, st, mag, page, getImg) {
    return (async () => {
      pageTitle(c2, P, st, "Tipps des Tages", page.weekday + " " + page.date);
      let y = TOP;
      if (page.theme) {
        c2.T(ellipsize("Thementag: " + page.theme, st.bold, 9, CW), M, y + 6, st.bold, 9, st.accent);
        y += 14;
      }
      const tips = page.tips || [];
      if (!tips.length) c2.T("F\xFCr diesen Tag gibt es keine Programmtipps.", M, y + 20, st.body, 10, st.muted);
      const pitch = page.theme ? 134 : 138;
      const ih = pitch - 10;
      const iw = 86;
      for (let i = 0; i < tips.length; i++) {
        const t = tips[i];
        const by = y + i * pitch;
        const ref = await getImg(t.imageId);
        drawImage(c2, P, st, ref, M, by, iw, ih, t.title);
        const x = M + iw + 14;
        const w = PW - M - x;
        let ty = by + 11;
        const head = [t.time, t.channelName, t.kindLabel].filter(Boolean).join(" \xB7 ");
        c2.T(ellipsize(head, st.bold, 9, w), x, ty, st.bold, 9, st.accent);
        ty += 17;
        const tl = wrap(t.title, st.title, 14.5, w);
        const shown = tl.slice(0, 2);
        if (tl.length > 2) shown[1] = ellipsize(shown[1] + "\u2026", st.title, 14.5, w);
        for (const l of shown) {
          c2.T(l, x, ty, st.title, 14.5, st.ink);
          ty += 16.5;
        }
        if (t.sub) {
          c2.T(ellipsize(t.sub, st.body, 9, w), x, ty - 2, st.body, 9, st.muted);
          ty += 11;
        }
        const meta = metaLine(t);
        if (meta) {
          c2.T(ellipsize(meta, st.body, 8.5, w), x, ty - 2, st.body, 8.5, st.ink);
          ty += 11;
        }
        if (t.badges && t.badges.length) {
          chips(c2, st, t.badges, x, ty + 3);
          ty += 14;
        }
        if (t.overview) {
          const room = Math.floor((by + ih - ty + 2) / 11);
          if (room >= 1) c2.para(t.overview, x, ty, w, st.body, 8.5, 11, room, st.ink);
        }
        if (i < tips.length - 1) {
          P.setStroke(...st.rule);
          P.line(M, by + pitch - 5, PW - M, by + pitch - 5, 0.4);
        }
      }
    })();
  }
  function channelBlock(c2, P, st, x, y, w, h3, ch, size) {
    const headH = size + 7;
    c2.R(x, y, w, headH, st.head);
    c2.T(String(ch.no), x + 4, y + headH - 4, st.bold, size + 1.5, st.headInk);
    const nm = String(ch.name || "").replace(/^LIVE\s+/i, "");
    c2.T(ellipsize(nm, st.bold, size + 1, w - 24), x + 20, y + headH - 4, st.bold, size + 1, st.headInk);
    const pitch = size + 1.8;
    let ry = y + headH;
    const rows = ch.rows || [];
    let extra = 0;
    if (ch.theme) extra = 1;
    const maxRows = Math.max(1, Math.floor((h3 - headH - 1) / pitch) - extra);
    const cut = rows.length > maxRows;
    const list = cut ? rows.slice(0, maxRows - 1) : rows;
    if (ch.theme) {
      c2.T(ellipsize(ch.theme, st.bold, size, w - 6), x + 3, ry + size + 0.2, st.bold, size, st.accent);
      ry += pitch;
    }
    const tw = textWidth("00:00", st.bold, size) + 3;
    list.forEach((r, i) => {
      if (i % 2 === 1) c2.R(x, ry, w, pitch, st.zebra);
      const base = ry + size + 0.3;
      const closed = r.kind === "closedown" || r.kind === "fill";
      c2.T(r.time, x + 2, base, st.bold, size, closed ? st.muted : st.accent);
      const badge = (r.badges || []).filter((b) => BADGE_SHORT[b]).map((b) => BADGE_SHORT[b]).join(" ");
      const bw = badge ? textWidth(badge, st.bold, size - 0.5) + 2 : 0;
      if (badge) c2.TR(badge, x + w - 2, base, st.bold, size - 0.5, st.accent);
      const tx = x + 2 + tw;
      const avail = w - 4 - tw - bw;
      const title = closed ? r.title : ellipsize(r.title, st.body, size, avail);
      c2.T(closed ? ellipsize(title, st.body, size, avail) : title, tx, base, st.body, size, closed ? st.muted : st.ink);
      if (r.sub && !closed) {
        const used = textWidth(title, st.body, size) + 3;
        const rest = avail - used;
        if (rest > 18) c2.T(ellipsize(r.sub, st.body, size - 0.5, rest), tx + used, base, st.body, size - 0.5, st.muted);
      }
      ry += pitch;
    });
    if (cut) c2.T("\u2026", x + 2 + tw, ry + size, st.bold, size, st.muted);
    P.setStroke(...st.rule);
    P.line(x, y + h3, x + w, y + h3, 0.3);
  }
  function fitSize(channels, h3, min, max) {
    for (let s = max; s > min; s -= 0.2) {
      const pitch = s + 1.8;
      if (channels.every((ch) => s + 7 + ((ch.rows || []).length + (ch.theme ? 1 : 0)) * pitch + 1 <= h3)) return s;
    }
    return min;
  }
  function eveningPage(c2, P, st, page) {
    pageTitle(c2, P, st, "Abendprogramm", page.weekday + " " + page.date + " \xB7 ab 20:15");
    const cols = 3;
    const gap = 10;
    const bw = (CW - gap * (cols - 1)) / cols;
    const rows = Math.ceil((page.channels || []).length / cols) || 1;
    const bh = (BOT - TOP - gap * (rows - 1)) / rows;
    const size = fitSize(page.channels || [], bh, 6.8, 8.6);
    (page.channels || []).forEach((ch, i) => {
      channelBlock(c2, P, st, M + i % cols * (bw + gap), TOP + Math.floor(i / cols) * (bh + gap), bw, bh, ch, size);
    });
  }
  function dayPage(c2, P, st, page) {
    pageTitle(c2, P, st, "Tagesprogramm", page.weekday + " " + page.date + (page.part === 1 ? " \xB7 Sender 1\u20139" : " \xB7 Sender 10\u201318"));
    const cols = 3;
    const gap = 10;
    const bw = (CW - gap * (cols - 1)) / cols;
    const rows = Math.ceil((page.channels || []).length / cols) || 1;
    const bh = (BOT - TOP - gap * (rows - 1)) / rows;
    const size = fitSize(page.channels || [], bh, 6.6, 8.4);
    (page.channels || []).forEach((ch, i) => {
      channelBlock(c2, P, st, M + i % cols * (bw + gap), TOP + Math.floor(i / cols) * (bh + gap), bw, bh, ch, size);
    });
  }
  function backPage(c2, P, st, mag, opts) {
    pageTitle(c2, P, st, "Hinweise", "LIVE Programm");
    const paras = [
      ["Programm f\xFCr alle gleich", "Das Programm wird aus der Mediathek berechnet und ist auf allen Ger\xE4ten identisch: Wer um 20:15 einschaltet, sieht dieselbe Sendung an derselben Stelle."],
      ["Jugendschutz", "Titel ab 16 Jahren laufen fr\xFChestens ab 22 Uhr, Titel ab 18 Jahren fr\xFChestens ab 23 Uhr."],
      ["F\xFCllprogramm", "Nachts und in Programml\xFCcken l\xE4uft F\xFCllprogramm mit kurzen Titeln. Das regul\xE4re Programm beginnt jeden Sendetag um 5:00 Uhr."],
      ["Premieren und Thementage", "Auf LIVE Premiere laufen neu hinzugekommene Titel zum ersten Mal um 20:15 Uhr, auf dem Thementag-Sender wechselt das Motto t\xE4glich."],
      ["\xC4nderungen vorbehalten", "Die Fernsehzeitung zeigt den Stand beim Erzeugen. Kommen Titel hinzu oder fallen weg, kann sich das Programm \xE4ndern."]
    ];
    let y = TOP + 8;
    for (const [h3, t] of paras) {
      c2.T(h3, M, y, st.title, 13, st.accent);
      y = c2.para(t, M, y + 17, CW, st.body, 10.5, 14.5, 5, st.ink) + 14;
    }
    const range2 = String(mag.subtitle || "").replace(/^Die Fernsehwoche\s*·\s*/, "");
    c2.R(M, y + 6, CW, 1, st.rule);
    c2.T("Sendewoche " + range2 + (opts && opts.created ? " \xB7 erzeugt am " + opts.created : ""), M, y + 26, st.bold, 9.5, st.ink);
    c2.T("Als PDF erzeugt von LENZ LIVE.", M, y + 42, st.body, 9, st.muted);
  }
  async function renderMagazinePdf(magazine, opts = {}) {
    const st = STYLES[opts.style] || STYLES.flat;
    const pdf = createPdf({ title: magazine.title || "LIVE Programm" });
    const cache = /* @__PURE__ */ new Map();
    const getImg = async (id) => {
      if (!id || typeof opts.loadImage !== "function") return null;
      if (cache.has(id)) return cache.get(id);
      let ref;
      try {
        const bytes = await opts.loadImage(id);
        ref = bytes ? pdf.addJpeg(bytes) : null;
      } catch {
        ref = null;
      }
      cache.set(id, ref);
      return ref;
    };
    const pages = magazine.pages || [];
    const total = pages.length;
    for (let i = 0; i < total; i++) {
      const pg = pages[i];
      const P = pdf.addPage(PW, PH);
      const c2 = makeCtx(P, st);
      if (pg.kind === "cover") await cover(c2, P, st, magazine, getImg);
      else {
        const label = { tips: "Tipps des Tages", evening: "Abendprogramm", day: "Tagesprogramm", back: "Hinweise" }[pg.kind] || "";
        frame(c2, P, st, magazine, pg, label, total);
        if (pg.kind === "tips") await tipsPage(c2, P, st, magazine, pg, getImg);
        else if (pg.kind === "evening") eveningPage(c2, P, st, pg);
        else if (pg.kind === "day") dayPage(c2, P, st, pg);
        else if (pg.kind === "back") backPage(c2, P, st, magazine, opts);
      }
      if (typeof opts.onProgress === "function") {
        try {
          opts.onProgress(i + 1, total);
        } catch {
        }
      }
    }
    return pdf.toBytes();
  }

  // src/js/live/magazine/pdf-export.js
  var IMG_MAX_W = 360;
  var IMG_TIMEOUT_MS = 8e3;
  var JPEG_QUALITY = 0.8;
  function createPdfExport({ imageUrl, doc = document, win = null, now = null, time = {} } = {}) {
    const w = win || doc.defaultView || (typeof window !== "undefined" ? window : null);
    const clockNow = typeof now === "function" ? now : () => Date.now();
    function loadImage(imageId) {
      return new Promise((resolve) => {
        if (!imageId || typeof imageUrl !== "function") {
          resolve(null);
          return;
        }
        let done = false;
        let timer = null;
        const finish = (v) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(v);
        };
        timer = setTimeout(() => finish(null), IMG_TIMEOUT_MS);
        try {
          const img = new (w && w.Image ? w.Image : Image)();
          img.crossOrigin = "anonymous";
          img.onerror = () => finish(null);
          img.onload = () => {
            try {
              const iw = img.naturalWidth || img.width;
              const ih = img.naturalHeight || img.height;
              if (!iw || !ih) {
                finish(null);
                return;
              }
              const k = Math.min(1, IMG_MAX_W / iw);
              const cw = Math.max(1, Math.round(iw * k));
              const ch = Math.max(1, Math.round(ih * k));
              const canvas = doc.createElement("canvas");
              canvas.width = cw;
              canvas.height = ch;
              const c2 = canvas.getContext("2d");
              if (!c2) {
                finish(null);
                return;
              }
              c2.fillStyle = "#fff";
              c2.fillRect(0, 0, cw, ch);
              c2.drawImage(img, 0, 0, cw, ch);
              canvas.toBlob((blob) => {
                if (!blob) {
                  finish(null);
                  return;
                }
                blobBytes(blob).then(finish, () => finish(null));
              }, "image/jpeg", JPEG_QUALITY);
            } catch {
              finish(null);
            }
          };
          img.src = imageUrl(imageId, { maxWidth: IMG_MAX_W });
        } catch {
          finish(null);
        }
      });
    }
    async function blobBytes(blob) {
      if (typeof blob.arrayBuffer === "function") return new Uint8Array(await blob.arrayBuffer());
      return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(new Uint8Array(r.result));
        r.onerror = () => rej(r.error);
        r.readAsArrayBuffer(blob);
      });
    }
    function createdText() {
      try {
        const t = clockNow();
        if (!time.formatDay || !time.broadcastDayOf || !time.formatClock) return void 0;
        const d2 = time.formatDay(time.broadcastDayOf(t));
        return `${d2.date} ${time.formatClock(t)} Uhr`;
      } catch {
        return void 0;
      }
    }
    async function downloadPdf(magazine, style, onProgress) {
      const bytes = await renderMagazinePdf(magazine, { style, loadImage, onProgress, created: createdText() });
      const blob = new Blob([bytes], { type: "application/pdf" });
      return { url: URL.createObjectURL(blob), fileName: magazine.fileName || "LIVE-Programm.pdf" };
    }
    return { downloadPdf, loadImage };
  }

  // src/js/live/player/music-presets.js
  var QUALITIES = {
    maj: [0, 4, 7],
    m: [0, 3, 7],
    maj7: [0, 4, 7, 11],
    m7: [0, 3, 7, 10],
    7: [0, 4, 7, 10],
    m7b5: [0, 3, 6, 10]
  };
  function mulberry322(seed) {
    let a = seed >>> 0;
    return function next() {
      a = a + 1831565813 >>> 0;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function midiToHz(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }
  function chordTone(chord, i, octShift = 0) {
    const iv = QUALITIES[chord.q] || QUALITIES.maj;
    const n = iv.length;
    const oct = Math.floor(i / n);
    return chord.r + octShift + iv[(i % n + n) % n] + 12 * oct;
  }
  function loopBars(preset) {
    return preset.chords.length;
  }
  var c = (r, q) => ({ r, q });
  var R = { C: 36, D: 38, E: 40, F: 41, G: 43, A: 45, B: 47 };
  var crt80 = {
    id: "crt80",
    bpm: 100,
    swing: 0,
    cutoff: 3200,
    reverb: 0.22,
    chords: [
      c(R.A, "m"),
      c(R.F, "maj"),
      c(R.C, "maj"),
      c(R.G, "maj"),
      c(R.A, "m"),
      c(R.F, "maj"),
      c(R.C, "maj"),
      c(R.G, "maj"),
      c(R.F, "maj"),
      c(R.C, "maj"),
      c(R.D, "m"),
      c(R.A, "m"),
      c(R.F, "maj"),
      c(R.G, "maj"),
      c(R.E, "m"),
      c(R.A, "m")
    ],
    layers: [
      { k: "pad", oct: 12, vol: 0.06, wave: "sawtooth", detune: 9, cutoff: 1300, attack: 0.7, voices: [0, 1, 2], pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], len: 16 },
      { k: "arp", oct: 24, vol: 0.045, wave: "square", cutoff: 2100, len: 1.7, pattern: [0, -1, 1, -1, 2, -1, 1, -1, 3, -1, 2, -1, 1, -1, 2, -1] },
      { k: "bass", oct: 0, vol: 0.15, wave: "sawtooth", cutoff: 480, len: 1.8, pattern: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 8, 0] },
      { k: "snare", vol: 0.05, pattern: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0] }
    ]
  };
  var silver = {
    id: "silver",
    bpm: 88,
    swing: 0.1,
    cutoff: 4200,
    reverb: 0.3,
    chords: [
      c(R.C, "maj7"),
      c(R.A, "m7"),
      c(R.D, "m7"),
      c(R.G, "7"),
      c(R.E, "m7"),
      c(R.A, "7"),
      c(R.D, "m7"),
      c(R.G, "7"),
      c(R.C, "maj7"),
      c(R.A, "m7"),
      c(R.F, "maj7"),
      c(R.B, "m7b5"),
      c(R.E, "7"),
      c(R.A, "m7"),
      c(R.D, "m7"),
      c(R.G, "7")
    ],
    layers: [
      { k: "epiano", oct: 24, vol: 0.06, ratio: 1, index: 1.6, len: 4, voicing: [1, 2, 3, 4], strum: 0.014, pattern: [1, 0, 0, 0, 0, 0, 0.7, 0, 0, 0, 0.8, 0, 0, 0, 0, 0] },
      { k: "bass", oct: 0, vol: 0.2, wave: "sine", cutoff: 600, len: 2.4, pattern: [1, 0, 0, 0, 0, 0, 5, 0, 0, 0, 1, 0, 0, 0, 0, 0] },
      { k: "kick", vol: 0.2, pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0] },
      { k: "hat", vol: 0.025, pattern: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0.5] }
    ]
  };
  var flat = {
    id: "flat",
    bpm: 108,
    swing: 0,
    cutoff: 3800,
    reverb: 0.26,
    chords: [
      c(R.D, "m7"),
      c(R.G, "7"),
      c(R.C, "maj7"),
      c(R.A, "m7"),
      c(R.D, "m7"),
      c(R.G, "7"),
      c(R.C, "maj7"),
      c(R.A, "m7"),
      c(R.E, "m7"),
      c(R.A, "7"),
      c(R.D, "m7"),
      c(R.G, "7"),
      c(R.C, "maj7"),
      c(R.A, "7"),
      c(R.D, "m7"),
      c(R.G, "7")
    ],
    layers: [
      { k: "epiano", oct: 24, vol: 0.06, ratio: 1, index: 1.3, len: 2.4, voicing: [1, 2, 3, 4], strum: 0.012, pattern: [1, 0, 0, 0.8, 0, 0, 0.9, 0, 0, 0, 0.8, 0, 0, 0.7, 0, 0] },
      { k: "bass", oct: 0, vol: 0.2, wave: "sine", cutoff: 600, len: 3, pattern: [1, 0, 0, 0, 0, 0, 5, 0, 1, 0, 0, 0, 0, 0, 5, 0] },
      { k: "brush", vol: 0.03, pattern: [1, 0, 0.4, 0, 0.7, 0, 0.4, 0, 1, 0, 0.4, 0, 0.7, 0, 0.4, 0] }
    ]
  };
  var plain = {
    id: "plain",
    bpm: 72,
    swing: 0,
    cutoff: 3e3,
    reverb: 0.34,
    tremolo: { rate: 5.2, depth: 0.28 },
    chords: [
      c(R.C, "maj7"),
      c(R.A, "m7"),
      c(R.F, "maj7"),
      c(R.G, "7"),
      c(R.C, "maj7"),
      c(R.E, "m7"),
      c(R.A, "m7"),
      c(R.D, "m7"),
      c(R.F, "maj7"),
      c(R.E, "m7"),
      c(R.D, "m7"),
      c(R.G, "7"),
      c(R.C, "maj7"),
      c(R.A, "m7"),
      c(R.D, "m7"),
      c(R.G, "7")
    ],
    layers: [
      { k: "vibes", oct: 36, vol: 0.07, len: 6, pattern: [3, -1, -1, -1, 2, -1, 4, -1, -1, -1, 1, -1, 2, -1, -1, -1] },
      { k: "upright", oct: 0, vol: 0.2, len: 4, pattern: [1, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 3, 0] }
    ]
  };
  var PRESETS = { crt80, silver, flat, plain };

  // src/js/live/player/music.js
  var TICK_MS = 25;
  var LOOKAHEAD = 0.12;
  var FADE_IN = 1.5;
  var FADE_OUT = 0.6;
  var SWITCH_OUT = 0.3;
  var SWITCH_IN = 0.8;
  var GAIN_SCALE = 0.45;
  var MIN_G = 1e-4;
  var safe = (fn) => {
    try {
      const r = fn();
      if (r && typeof r.catch === "function") r.catch(() => {
      });
    } catch {
    }
  };
  function createMusic({ AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext, doc = globalThis.document } = {}) {
    let ctx = null;
    let master = null;
    let bus = null;
    let lp = null;
    let wet = null;
    let tail = [];
    let noiseBuf = null;
    let aux = null;
    let timer = null;
    let stopTimer = null;
    let switchTimer = null;
    let disposed = false;
    let enabled = true;
    let vol = 0.7;
    let muted = false;
    let idle = null;
    let styleId = "flat";
    let preset = PRESETS.flat;
    let playing = false;
    let switching = false;
    let nextTime = 0;
    let step = 0;
    let noiseCount = 0;
    const target = () => muted ? 0 : vol * GAIN_SCALE;
    const wantsMusic = () => !!(ctx && enabled && idle && target() > 0);
    function buildReverbImpulse(sr) {
      const len = Math.floor(sr * 2.2);
      const buf = ctx.createBuffer(2, len, sr);
      const rnd = mulberry322(2046620);
      for (let ch = 0; ch < 2; ch++) {
        const d2 = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const k = 1 - i / len;
          d2[i] = (rnd() * 2 - 1) * k * k * k;
        }
      }
      return buf;
    }
    function buildNoise(sr) {
      const len = Math.floor(sr * 1.2);
      const buf = ctx.createBuffer(1, len, sr);
      const d2 = buf.getChannelData(0);
      const rnd = mulberry322(5369127);
      for (let i = 0; i < len; i++) d2[i] = rnd() * 2 - 1;
      return buf;
    }
    function ensureCtx() {
      if (ctx || !AudioCtx || disposed) return;
      try {
        ctx = new AudioCtx();
        const sr = ctx.sampleRate || 44100;
        master = ctx.createGain();
        master.gain.value = target();
        bus = ctx.createGain();
        bus.gain.value = 0;
        lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = preset.cutoff;
        lp.Q.value = 0.5;
        const dry = ctx.createGain();
        dry.gain.value = 0.85;
        wet = ctx.createGain();
        wet.gain.value = preset.reverb;
        const conv = ctx.createConvolver();
        conv.buffer = buildReverbImpulse(sr);
        noiseBuf = buildNoise(sr);
        bus.connect(lp);
        lp.connect(dry);
        lp.connect(conv);
        conv.connect(wet);
        let out = master;
        tail = [dry, conv, wet];
        if (typeof ctx.createDynamicsCompressor === "function") {
          const comp = ctx.createDynamicsCompressor();
          comp.connect(master);
          out = comp;
          tail.push(comp);
        }
        dry.connect(out);
        wet.connect(out);
        master.connect(ctx.destination);
      } catch {
        ctx = null;
      }
    }
    function cleanup(first, nodes) {
      first.onended = () => {
        for (const n of nodes) safe(() => n.disconnect());
      };
    }
    function voice({ waves, freq, t, dur, a = 0.01, vol: v, cutoff, sustain = false, dest = bus }) {
      const env = ctx.createGain();
      const nodes = [env];
      const end = t + dur;
      env.gain.setValueAtTime(MIN_G, t);
      env.gain.linearRampToValueAtTime(v, t + a);
      if (sustain) {
        env.gain.setValueAtTime(v, Math.max(t + a, end - 0.25));
        env.gain.linearRampToValueAtTime(MIN_G, end);
      } else {
        env.gain.exponentialRampToValueAtTime(MIN_G, end);
      }
      let out = env;
      if (cutoff) {
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = cutoff;
        env.connect(f);
        nodes.push(f);
        out = f;
      }
      out.connect(dest);
      let first = null;
      for (const w of waves) {
        const o = ctx.createOscillator();
        o.type = w.type;
        o.frequency.setValueAtTime(freq * (w.mul || 1), t);
        if (w.detune) o.detune.value = w.detune;
        let src = o;
        if (w.vol !== void 0) {
          const wg = ctx.createGain();
          wg.gain.value = w.vol;
          o.connect(wg);
          nodes.push(wg);
          src = wg;
        }
        src.connect(env);
        o.start(t);
        o.stop(end + 0.05);
        nodes.push(o);
        if (!first) first = o;
      }
      cleanup(first, nodes);
    }
    function noiseHit({ t, dur, type, freq, q = 0.8, vol: v, a = 4e-3, dest = bus }) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const env = ctx.createGain();
      env.gain.setValueAtTime(MIN_G, t);
      env.gain.linearRampToValueAtTime(v, t + a);
      env.gain.exponentialRampToValueAtTime(MIN_G, t + dur);
      src.connect(f);
      f.connect(env);
      env.connect(dest);
      noiseCount = (noiseCount + 1) % 7;
      src.start(t, noiseCount * 0.13);
      src.stop(t + dur + 0.05);
      cleanup(src, [src, f, env]);
    }
    function epianoNote({ freq, t, dur, vol: v, ratio, index }) {
      const car = ctx.createOscillator();
      car.type = "sine";
      car.frequency.setValueAtTime(freq, t);
      const mod = ctx.createOscillator();
      mod.type = "sine";
      mod.frequency.setValueAtTime(freq * ratio, t);
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(index * freq, t);
      mg.gain.exponentialRampToValueAtTime(freq * 0.02, t + dur * 0.55);
      const env = ctx.createGain();
      env.gain.setValueAtTime(MIN_G, t);
      env.gain.linearRampToValueAtTime(v, t + 8e-3);
      env.gain.exponentialRampToValueAtTime(MIN_G, t + dur);
      mod.connect(mg);
      mg.connect(car.frequency);
      car.connect(env);
      env.connect(bus);
      car.start(t);
      mod.start(t);
      car.stop(t + dur + 0.05);
      mod.stop(t + dur + 0.05);
      cleanup(car, [car, mod, mg, env]);
    }
    const LAYERS = {
      pad(L, ch, st, t, sd, vel) {
        const dur = sd * (L.len || 16);
        for (const i of L.voices) {
          const f = midiToHz(chordTone(ch, i, L.oct));
          voice({
            waves: [
              { type: L.wave, detune: -L.detune },
              { type: L.wave, detune: L.detune }
            ],
            freq: f,
            t,
            dur,
            a: L.attack,
            vol: L.vol * vel,
            cutoff: L.cutoff,
            sustain: true
          });
        }
      },
      arp(L, ch, st, t, sd, vel, idx) {
        voice({
          waves: [{ type: L.wave }],
          freq: midiToHz(chordTone(ch, idx, L.oct)),
          t,
          dur: sd * L.len,
          a: 0.02,
          vol: L.vol,
          cutoff: L.cutoff
        });
      },
      bass(L, ch, st, t, sd, vel, code) {
        const off = { 1: 0, 3: 3, 5: 7, 8: 12 }[code];
        const third = code === 3 ? ch.q.startsWith("m") ? 3 : 4 : off;
        voice({
          waves: [{ type: L.wave }, { type: "sine", mul: 0.5, vol: 0.6 }],
          freq: midiToHz(ch.r + L.oct + third),
          t,
          dur: sd * L.len,
          a: 0.015,
          vol: L.vol,
          cutoff: L.cutoff
        });
      },
      epiano(L, ch, st, t, sd, vel) {
        L.voicing.forEach((i, k) => {
          epianoNote({
            freq: midiToHz(chordTone(ch, i, L.oct)),
            t: t + k * L.strum,
            dur: sd * L.len,
            vol: L.vol * vel * (1 - k * 0.08),
            ratio: L.ratio,
            index: L.index
          });
        });
      },
      vibes(L, ch, st, t, sd, vel, idx) {
        const f = midiToHz(chordTone(ch, idx, L.oct));
        const dest = aux ? aux.trem : bus;
        voice({
          waves: [{ type: "sine" }, { type: "sine", mul: 4, vol: 0.12 }],
          freq: f,
          t,
          dur: sd * L.len * 0.5,
          a: 6e-3,
          vol: L.vol,
          dest
        });
      },
      upright(L, ch, st, t, sd, vel, code) {
        const off = { 1: 0, 3: ch.q.startsWith("m") ? 3 : 4, 5: 7 }[code] || 0;
        voice({
          waves: [{ type: "triangle" }, { type: "sine", mul: 2, vol: 0.2 }],
          freq: midiToHz(ch.r + L.oct + off),
          t,
          dur: sd * L.len,
          a: 0.02,
          vol: L.vol,
          cutoff: 520
        });
      },
      kick(L, ch, st, t, sd, vel) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(130, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        const env = ctx.createGain();
        env.gain.setValueAtTime(MIN_G, t);
        env.gain.linearRampToValueAtTime(L.vol * vel, t + 5e-3);
        env.gain.exponentialRampToValueAtTime(MIN_G, t + 0.32);
        o.connect(env);
        env.connect(bus);
        o.start(t);
        o.stop(t + 0.36);
        cleanup(o, [o, env]);
      },
      snare(L, ch, st, t, sd, vel) {
        noiseHit({ t, dur: 0.14, type: "bandpass", freq: 1800, q: 0.7, vol: L.vol * vel });
      },
      hat(L, ch, st, t, sd, vel) {
        noiseHit({ t, dur: 0.05, type: "highpass", freq: 7e3, q: 0.5, vol: L.vol * vel });
      },
      brush(L, ch, st, t, sd, vel) {
        noiseHit({ t, dur: 0.16, type: "bandpass", freq: 4200, q: 0.6, vol: L.vol * vel, a: 0.05 });
      }
    };
    const PITCHED_IDX = { arp: 1, vibes: 1 };
    function scheduleStep(s, t) {
      const sd = 60 / preset.bpm / 4;
      const bar = Math.floor(s / 16) % loopBars(preset);
      const st = s % 16;
      const ch = preset.chords[bar];
      const tt = t + st % 2 * (preset.swing || 0) * sd;
      for (const L of preset.layers) {
        const v = L.pattern[st];
        if (PITCHED_IDX[L.k] ? !(v >= 0) : !v) continue;
        LAYERS[L.k](L, ch, st, tt, sd, PITCHED_IDX[L.k] ? 1 : v, v);
      }
    }
    function tick() {
      if (!ctx || !playing || switching) return;
      const now = ctx.currentTime;
      if (nextTime < now - 0.5) nextTime = now + 0.05;
      const sd = 60 / preset.bpm / 4;
      while (nextTime < now + LOOKAHEAD) {
        scheduleStep(step, nextTime);
        step = (step + 1) % (loopBars(preset) * 16);
        nextTime += sd;
      }
    }
    function fadeBus(to, secs) {
      const g = bus.gain;
      const now = ctx.currentTime;
      safe(() => g.cancelScheduledValues(now));
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(to, now + secs);
    }
    function startAux() {
      if (aux || !preset.tremolo) return;
      const trem = ctx.createGain();
      trem.gain.value = 1 - preset.tremolo.depth;
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = preset.tremolo.rate;
      const depth = ctx.createGain();
      depth.gain.value = preset.tremolo.depth;
      lfo.connect(depth);
      depth.connect(trem.gain);
      trem.connect(bus);
      lfo.start();
      aux = { trem, lfo, depth };
    }
    function stopAux() {
      if (!aux) return;
      const a = aux;
      aux = null;
      safe(() => a.lfo.stop());
      for (const n of [a.lfo, a.depth, a.trem]) safe(() => n.disconnect());
    }
    function applyPreset() {
      preset = PRESETS[styleId] || PRESETS.flat;
      lp.frequency.setTargetAtTime(preset.cutoff, ctx.currentTime, 0.05);
      wet.gain.setTargetAtTime(preset.reverb, ctx.currentTime, 0.05);
      stopAux();
      startAux();
      step = 0;
      nextTime = ctx.currentTime + 0.05;
    }
    function start() {
      clearTimeout(stopTimer);
      stopTimer = null;
      playing = true;
      if (!timer) {
        applyPreset();
        timer = setInterval(tick, TICK_MS);
      }
      fadeBus(1, FADE_IN);
    }
    function stopFade() {
      playing = false;
      clearTimeout(switchTimer);
      switchTimer = null;
      switching = false;
      fadeBus(0, FADE_OUT);
      clearTimeout(stopTimer);
      stopTimer = setTimeout(() => {
        stopTimer = null;
        clearInterval(timer);
        timer = null;
        stopAux();
      }, FADE_OUT * 1e3 + 50);
    }
    function sync() {
      if (disposed) return;
      const want = wantsMusic();
      if (want && !playing) start();
      else if (!want && playing) stopFade();
    }
    function onVisibility() {
      if (disposed || !ctx) return;
      if (doc && doc.hidden) safe(() => ctx.suspend());
      else if (wantsMusic()) safe(() => ctx.resume());
    }
    if (doc && typeof doc.addEventListener === "function") doc.addEventListener("visibilitychange", onVisibility);
    return {
      unlock() {
        if (disposed || !AudioCtx) return;
        ensureCtx();
        if (!ctx) return;
        if (ctx.state !== "running") safe(() => ctx.resume());
        sync();
      },
      setStyle(id) {
        if (disposed) return;
        const next = PRESETS[id] ? id : "flat";
        if (next === styleId) return;
        styleId = next;
        if (!playing || !ctx) {
          preset = PRESETS[styleId];
          return;
        }
        switching = true;
        fadeBus(0, SWITCH_OUT);
        clearTimeout(switchTimer);
        switchTimer = setTimeout(() => {
          switchTimer = null;
          applyPreset();
          switching = false;
          if (playing) fadeBus(1, SWITCH_IN);
        }, SWITCH_OUT * 1e3 + 30);
      },
      setLevel(v, m) {
        if (disposed) return;
        vol = Math.max(0, Math.min(1, Number(v) || 0));
        muted = !!m;
        if (ctx) master.gain.setTargetAtTime(target(), ctx.currentTime, 0.05);
        sync();
      },
      setEnabled(on) {
        if (disposed) return;
        enabled = !!on;
        sync();
      },
      setIdle(kind) {
        if (disposed) return;
        idle = kind === "pause" || kind === "test" || kind === "error" ? kind : null;
        sync();
      },
      isPlaying() {
        return !disposed && playing;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        playing = false;
        clearInterval(timer);
        clearTimeout(stopTimer);
        clearTimeout(switchTimer);
        timer = stopTimer = switchTimer = null;
        if (doc && typeof doc.removeEventListener === "function") doc.removeEventListener("visibilitychange", onVisibility);
        if (ctx) {
          stopAux();
          for (const n of [bus, lp, ...tail, master]) safe(() => n.disconnect());
          safe(() => ctx.close());
          ctx = null;
        }
      }
    };
  }

  // src/js/live/ui/tv.js
  var STYLES2 = [
    { id: "flat", name: "Flachbild" },
    { id: "crt80", name: "R\xF6hre 80er" },
    { id: "silver", name: "Silber-R\xF6hre" },
    { id: "plain", name: "Schlicht" }
  ];
  var DEFAULT_STYLE = "flat";
  function normStyle(id) {
    return STYLES2.some((s) => s.id === id) ? id : DEFAULT_STYLE;
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
      const d2 = img.data;
      for (let i = 0; i < d2.length; i += 4) {
        const v = Math.random() * 255 | 0;
        d2[i] = d2[i + 1] = d2[i + 2] = v;
        d2[i + 3] = 255;
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
    ["extras", [["audio", "Ton", "Tonspur wechseln", "is-small"], ["subs", "UT", "Untertitel wechseln", "is-small"], ["guide", "Heft", "Fernsehzeitung", "is-small is-guide"]]]
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

  // src/js/live/ui/decor-crt80.js
  var pre = (cls) => cls.split(" ").map((c2) => c2.startsWith("lfx-") ? c2 : `lfx-live-d-${c2}`).join(" ");
  var d = (cls, children, extra) => ({ cls: pre(cls), ...children ? { children } : {}, ...extra || {} });
  var items = (cls, n) => d(cls, null, { count: n });
  var antenna = d("ant", [
    d("ant__rod ant__rod--l", [d("ant__seg"), d("ant__seg"), d("ant__seg"), d("ant__tip")]),
    d("ant__rod ant__rod--r", [d("ant__seg"), d("ant__seg"), d("ant__seg"), d("ant__tip")]),
    d("ant__base"),
    d("ant__hub")
  ]);
  var tape = (v) => d(`tape lfx-live-d-tape--${v}`, [
    d("tape__label"),
    d("tape__win", [d("tape__reel"), d("tape__reel")])
  ]);
  var decor_crt80_default = {
    room: [
      d("wallglow"),
      d("tvshade"),
      d("shade"),
      // Stufe 2
      d("frame lfx-live-d-frame--a", [d("frame__mat", [d("frame__art lfx-live-d-frame__art--sun")])]),
      d("frame lfx-live-d-frame--b", [d("frame__mat", [d("frame__art lfx-live-d-frame__art--hills")])]),
      d("clock", [
        d("clock__rim", [
          d("clock__face", [
            items("clock__ticks", 12),
            d("clock__h"),
            d("clock__m"),
            d("clock__pin")
          ])
        ])
      ]),
      // Stufe 3
      d("lamp", [
        d("lamp__glow"),
        d("lamp__cone"),
        d("lamp__shade"),
        d("lamp__pole"),
        d("lamp__base")
      ]),
      d("rug", [d("rug__pattern"), d("rug__edge")]),
      // Stufe 1: Lowboard mit Türen, Fach, Videorekorder und Kassetten
      d("board", [
        d("board__shadow"),
        d("board__legs", [d("board__leg"), d("board__leg"), d("board__leg"), d("board__leg")]),
        d("board__body", [
          d("board__door board__door--l", [d("board__handle")]),
          d("board__niche", [
            d("vcr", [
              d("vcr__top"),
              d("vcr__front", [
                d("vcr__slot"),
                d("vcr__disp", null, { display: "vcr" }),
                d("vcr__btns", null, { count: 5 })
              ]),
              d("vcr__feet")
            ]),
            d("tapes", [tape("a"), tape("b"), tape("c")])
          ]),
          d("board__door board__door--r", [d("board__handle")])
        ]),
        d("board__top")
      ]),
      d("plant", [
        d("plant__shadow"),
        d("plant__leaves", null, { count: 11 }),
        d("plant__pot")
      ])
    ],
    tv: [
      antenna,
      d("feet", [d("foot"), d("foot")]),
      d("topface"),
      d("rim"),
      d("bezel", [d("bezel__shine")]),
      d("plate", [
        d("scale lfx-live-d-scale--a", null, { count: 9 }),
        d("scale lfx-live-d-scale--b", null, { count: 9 }),
        d("btns", null, { count: 8, actionEach: "ch" }),
        d("power", null, { action: "power", tip: "Ein/Aus" })
      ])
    ],
    glass: [
      d("g-vig"),
      d("g-mask"),
      d("g-scan"),
      d("g-fringe"),
      d("g-flicker"),
      d("g-roll"),
      d("g-glare")
    ]
  };

  // src/js/live/ui/decor-silver.js
  var dev = (cls, display, kids) => ({
    cls: `lfx-live-d-dev ${cls}`,
    children: [
      { cls: "lfx-live-d-dev__shadow" },
      { cls: "lfx-live-d-dev__body" },
      { cls: "lfx-live-d-dev__seam" },
      { cls: "lfx-live-d-dev__tray" },
      { cls: "lfx-live-d-dev__disp", display },
      { cls: "lfx-live-d-dev__btns", count: 4 },
      { cls: "lfx-live-d-dev__knob" },
      ...kids || []
    ]
  });
  var decor_silver_default = {
    room: [
      { cls: "lfx-live-d-wall", children: [{ cls: "lfx-live-d-wall__light" }] },
      { cls: "lfx-live-d-tvshadow" },
      { cls: "lfx-live-d-clock", children: [{ cls: "lfx-live-d-clock__ticks", count: 12 }, { cls: "lfx-live-d-clock__h" }, { cls: "lfx-live-d-clock__m" }, { cls: "lfx-live-d-clock__cap" }] },
      { cls: "lfx-live-d-baseboard" },
      { cls: "lfx-live-d-floor", children: [{ cls: "lfx-live-d-floor__shine" }] },
      // Wandregal mit DVD-Rücken (Stufe 2)
      {
        cls: "lfx-live-d-wshelf",
        children: [
          { cls: "lfx-live-d-wshelf__row", count: 9 },
          { cls: "lfx-live-d-wshelf__board", children: [{ cls: "lfx-live-d-wshelf__face" }] }
        ]
      },
      // Pflanze: Bambus im Topf (Stufe 2)
      {
        cls: "lfx-live-d-plant",
        children: [
          { cls: "lfx-live-d-plant__stalks", count: 8 },
          { cls: "lfx-live-d-plant__pot", children: [{ cls: "lfx-live-d-plant__soil" }] },
          { cls: "lfx-live-d-plant__shadow" }
        ]
      },
      // Standlautsprecher (Stufe 3)
      { cls: "lfx-live-d-spk lfx-live-d-spk--l", children: [{ cls: "lfx-live-d-spk__cloth" }, { cls: "lfx-live-d-spk__tw" }, { cls: "lfx-live-d-spk__wf" }, { cls: "lfx-live-d-spk__wf lfx-live-d-spk__wf--2" }] },
      { cls: "lfx-live-d-spk lfx-live-d-spk--r", children: [{ cls: "lfx-live-d-spk__cloth" }, { cls: "lfx-live-d-spk__tw" }, { cls: "lfx-live-d-spk__wf" }, { cls: "lfx-live-d-spk__wf lfx-live-d-spk__wf--2" }] },
      // Glas-Rack mit Chromfüßen (Platte und zwei Böden, je mit Kante und Fläche)
      {
        cls: "lfx-live-d-rack",
        children: [
          { cls: "lfx-live-d-rack__shadow" },
          { cls: "lfx-live-d-rack__leg lfx-live-d-rack__leg--l" },
          { cls: "lfx-live-d-rack__leg lfx-live-d-rack__leg--il" },
          { cls: "lfx-live-d-rack__leg lfx-live-d-rack__leg--ir" },
          { cls: "lfx-live-d-rack__leg lfx-live-d-rack__leg--r" },
          { cls: "lfx-live-d-rack__shelf lfx-live-d-rack__shelf--2", children: [{ cls: "lfx-live-d-rack__face" }] },
          { cls: "lfx-live-d-rack__shelf lfx-live-d-rack__shelf--1", children: [{ cls: "lfx-live-d-rack__face" }] },
          { cls: "lfx-live-d-rack__top", children: [{ cls: "lfx-live-d-rack__face" }] }
        ]
      },
      // Geräte im Rack (Raum-Ebene, mittig unter dem Fernseher über --lfx-s-m)
      dev("lfx-live-d-dvd", "dvd"),
      dev("lfx-live-d-rcv", "rcv"),
      // Subwoofer: Würfel vor dem linken Rack-Ende (Stufe 3)
      { cls: "lfx-live-d-sub", children: [{ cls: "lfx-live-d-sub__drv" }] }
    ],
    tv: [
      // Gehäuse
      { cls: "lfx-live-d-top" },
      { cls: "lfx-live-d-rim" },
      { cls: "lfx-live-d-grille", children: [{ cls: "lfx-live-d-grille__dots" }] },
      { cls: "lfx-live-d-logo" },
      // Gerätetasten unten rechts: Programm ±, Lautstärke ±, Programmübersicht; daneben der Netzschalter mit LED-Ring
      {
        cls: "lfx-live-d-flap",
        children: [{
          cls: "lfx-live-d-flap__keys",
          children: [
            { cls: "lfx-live-d-key", text: "P+", action: "key:ch+", tip: "Programm +" },
            { cls: "lfx-live-d-key", text: "P\u2212", action: "key:ch-", tip: "Programm \u2212" },
            { cls: "lfx-live-d-key", text: "V+", action: "key:vol+", tip: "Lauter" },
            { cls: "lfx-live-d-key", text: "V\u2212", action: "key:vol-", tip: "Leiser" },
            { cls: "lfx-live-d-key", text: "EPG", action: "key:epg", tip: "Programm\xFCbersicht" }
          ]
        }]
      },
      { cls: "lfx-live-d-pwr", action: "power", tip: "Ein/Aus" },
      { cls: "lfx-live-d-foot" },
      { cls: "lfx-live-d-contact" }
    ],
    glass: [
      { cls: "lfx-live-d-g-vignette" },
      { cls: "lfx-live-d-g-lines" },
      { cls: "lfx-live-d-g-flicker" },
      { cls: "lfx-live-d-g-roll" },
      { cls: "lfx-live-d-g-fringe" },
      { cls: "lfx-live-d-g-reflex" }
    ]
  };

  // src/js/live/ui/decor.js
  var SPECS = { crt80: decor_crt80_default, silver: decor_silver_default };
  var KINDS2 = ["vcr", "dvd", "rcv"];
  var p2 = (n) => String(n).padStart(2, "0");
  function buildNode(doc, node) {
    const e = doc.createElement(node.tag || "div");
    if (node.cls) e.className = node.cls;
    if (node.text != null) e.textContent = node.text;
    if (node.display && KINDS2.includes(node.display)) e.dataset.display = node.display;
    if (node.action) e.dataset.action = node.action;
    if (node.tip) e.title = node.tip;
    const n = Math.max(0, Math.floor(Number(node.count) || 0));
    for (let i = 1; i <= n; i++) {
      const c2 = doc.createElement("span");
      c2.className = "lfx-live-d__i";
      c2.style.setProperty("--i", String(i));
      if (node.actionEach === "ch") {
        c2.dataset.action = `ch:${i}`;
        c2.title = `Sender ${i}`;
      }
      e.append(c2);
    }
    if (Array.isArray(node.children)) for (const c2 of node.children) e.append(buildNode(doc, c2));
    return e;
  }
  function createDecor({ room, tv, screen, doc = document, onAction }) {
    const mk = (cls) => {
      const e = doc.createElement("div");
      e.className = cls;
      e.setAttribute("aria-hidden", "true");
      return e;
    };
    const decor = mk("lfx-live-decor");
    const deco = mk("lfx-live-tv__deco");
    const glass = mk("lfx-live-screen__glass");
    room.prepend(decor);
    tv.append(deco);
    const ov = screen.querySelector(":scope > .lfx-live-overlay");
    if (ov) screen.insertBefore(glass, ov);
    else screen.append(glass);
    const onClick = (e) => {
      const t = e.target && e.target.closest ? e.target.closest("[data-action]") : null;
      if (!t || !e.currentTarget.contains(t)) return;
      if (typeof onAction === "function") onAction(t.dataset.action, t);
    };
    decor.addEventListener("click", onClick);
    deco.addEventListener("click", onClick);
    let state = { on: false, clock: null, ch: 1 };
    const shown = /* @__PURE__ */ new WeakMap();
    let angles = "";
    function put(e, text) {
      if (shown.get(e) === text) return;
      shown.set(e, text);
      e.textContent = text;
    }
    function render() {
      const { on, clock, ch } = state;
      for (const layer of [decor, deco, glass]) {
        for (const e of layer.querySelectorAll("[data-display]")) {
          const k = e.dataset.display;
          if (k === "vcr") put(e, clock || "--:--");
          else if (k === "dvd") put(e, on && clock ? clock : "");
          else if (k === "rcv") put(e, on ? `P${p2(ch)}` : "");
        }
      }
      const chAttr = on ? String(ch) : "";
      if (deco.dataset.ch !== chAttr) deco.dataset.ch = chAttr;
      const onAttr = on ? "1" : "0";
      if (deco.dataset.on !== onAttr) deco.dataset.on = onAttr;
      const m = /^(\d{1,2}):(\d{2})/.exec(clock || "");
      if (m) {
        const h3 = Number(m[1]) % 12;
        const min = Number(m[2]);
        const key = `${h3}:${min}`;
        if (key !== angles) {
          angles = key;
          decor.style.setProperty("--lfx-live-clock-h", String(h3 * 30 + min * 0.5));
          decor.style.setProperty("--lfx-live-clock-m", String(min * 6));
        }
      }
    }
    return {
      el: decor,
      layers: { room: decor, tv: deco, glass },
      setStyle(style) {
        const spec = SPECS[style] || {};
        for (const [layer, key] of [[decor, "room"], [deco, "tv"], [glass, "glass"]]) {
          layer.textContent = "";
          for (const node of spec[key] || []) layer.append(buildNode(doc, node));
        }
        render();
      },
      setDisplays(p = {}) {
        state = {
          on: p.on === void 0 ? state.on : !!p.on,
          clock: p.clock === void 0 ? state.clock : p.clock,
          ch: p.ch === void 0 ? state.ch : p.ch
        };
        render();
      },
      dispose() {
        decor.removeEventListener("click", onClick);
        deco.removeEventListener("click", onClick);
        decor.remove();
        deco.remove();
        glass.remove();
      }
    };
  }

  // src/js/live/ui/knobs.js
  var COMMIT_MS = 400;
  var DRAG_PX2 = 4;
  var VOL_STEP = 5;
  var VOL_MIN = -135;
  var VOL_RANGE = 270;
  var WHEEL_UNIT = 100;
  var clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  var norm180 = (a) => ((a + 180) % 360 + 360) % 360 - 180;
  function createKnobs({ tv, getState, onChannel, onVolume, onSound, onPreview, win = globalThis.window }) {
    const elA = tv.querySelector(".lfx-live-tv__knob--a");
    const elB = tv.querySelector(".lfx-live-tv__knob--b");
    const st = () => {
      const s = getState && getState() || {};
      return { active: !!s.active, channel: s.channel || 1, count: Math.max(2, s.count || 18), volume: clamp(Number(s.volume) || 0, 0, 100) };
    };
    const stepDeg = () => 360 / st().count;
    const sound = (k) => {
      if (onSound) try {
        onSound(k);
      } catch {
      }
    };
    let angA = 0;
    let angB = 0;
    let angStart = 0;
    let busy = false;
    let commitTimer = null;
    let pending = null;
    let drag = null;
    let wheelAcc = 0;
    let wheelDir = 0;
    const write = (el, name, deg) => {
      if (el) el.style.setProperty(name, `${deg}deg`);
    };
    const volAngle = (v) => VOL_MIN + clamp(v, 0, 100) / 100 * VOL_RANGE;
    const wrapCh = (n, count) => ((n - 1) % count + count) % count + 1;
    function setChannel(n) {
      if (busy) return;
      const target = (wrapCh(n, st().count) - 1) * stepDeg();
      const diff = norm180(target - angA);
      if (Math.abs(diff) < 1e-3) return;
      angA += diff;
      write(elA, "--lfx-live-knob-a", angA);
    }
    function setVolume(v) {
      if (drag && drag.which === "b") return;
      angB = volAngle(v);
      write(elB, "--lfx-live-knob-b", angB);
    }
    function sync() {
      const s = st();
      setChannel(s.channel);
      setVolume(s.volume);
    }
    function flush() {
      clearTimeout(commitTimer);
      commitTimer = null;
      const p = pending;
      pending = null;
      busy = !!drag && drag.which === "a";
      if (p != null && onChannel) onChannel(p);
      if (!busy) {
        const s = st();
        setChannel(s.channel);
      }
    }
    function armCommit() {
      clearTimeout(commitTimer);
      commitTimer = setTimeout(() => {
        commitTimer = null;
        const p = pending;
        flush();
        if (drag && drag.which === "a") {
          drag.baseCh = p != null ? p : drag.baseCh;
          drag.steps = 0;
          drag.cum = 0;
          angStart = angA;
          busy = true;
        }
      }, COMMIT_MS);
    }
    function stepChannel(base, steps) {
      const s = st();
      const next = wrapCh(base + steps, s.count);
      angA = angStart + steps * stepDeg();
      write(elA, "--lfx-live-knob-a", angA);
      if (pending !== next) {
        pending = next;
        sound("detent");
        if (onPreview) try {
          onPreview(next);
        } catch {
        }
      }
    }
    function applyVolumeAngle(ang) {
      angB = clamp(ang, VOL_MIN, VOL_MIN + VOL_RANGE);
      const v = clamp(Math.round((angB - VOL_MIN) / VOL_RANGE * 100 / VOL_STEP) * VOL_STEP, 0, 100);
      angB = volAngle(v);
      write(elB, "--lfx-live-knob-b", angB);
      return v;
    }
    function volStep(dir) {
      const cur = Math.round((angB - VOL_MIN) / VOL_RANGE * 100 / VOL_STEP) * VOL_STEP;
      const v = clamp(cur + dir * VOL_STEP, 0, 100);
      if (v === cur) return;
      applyVolumeAngle(volAngle(v));
      sound("detent");
      if (onVolume) onVolume(v);
    }
    function chanSteps(dir) {
      const s = st();
      const base = pending != null ? pending : s.channel;
      busy = true;
      angStart = angA;
      const next = wrapCh(base + dir, s.count);
      angA += dir * stepDeg();
      write(elA, "--lfx-live-knob-a", angA);
      pending = next;
      sound("detent");
      if (onPreview) try {
        onPreview(next);
      } catch {
      }
      armCommit();
    }
    function chanImmediate(dir) {
      chanSteps(dir);
      flush();
    }
    function center(el) {
      const r = el.getBoundingClientRect();
      const w = el.offsetWidth || Math.min(r.width, r.height);
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: w / 2 };
    }
    function onDown(which, e) {
      if (!st().active) return;
      if (e.button != null && e.button > 0) return;
      if (drag) return;
      const el = which === "a" ? elA : elB;
      const c2 = center(el);
      drag = {
        which,
        el,
        c: c2,
        id: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        lx: e.clientX,
        ly: e.clientY,
        moved: false,
        cum: 0,
        start: angB,
        baseCh: pending != null ? pending : st().channel,
        steps: 0
      };
      if (which === "a") {
        busy = true;
        angStart = angA;
      }
      el.classList.add("is-drag");
      try {
        if (e.pointerId != null && el.setPointerCapture) el.setPointerCapture(e.pointerId);
      } catch {
      }
      win.addEventListener("pointermove", onMove);
      win.addEventListener("pointerup", onUp);
      win.addEventListener("pointercancel", onCancel);
      if (e.cancelable && e.preventDefault) e.preventDefault();
    }
    function onMove(e) {
      const d2 = drag;
      if (!d2 || d2.id != null && e.pointerId != null && e.pointerId !== d2.id) return;
      const dx = e.clientX - d2.c.x;
      const dy = e.clientY - d2.c.y;
      const px = d2.lx - d2.c.x;
      const py = d2.ly - d2.c.y;
      let delta;
      if (Math.hypot(dx, dy) >= d2.c.r * 0.4 && Math.hypot(px, py) >= d2.c.r * 0.4) {
        delta = norm180((Math.atan2(dy, dx) - Math.atan2(py, px)) * 180 / Math.PI);
      } else {
        delta = (d2.ly - e.clientY) * 1.5;
      }
      d2.lx = e.clientX;
      d2.ly = e.clientY;
      if (!d2.moved) {
        if (Math.hypot(e.clientX - d2.sx, e.clientY - d2.sy) <= DRAG_PX2) return;
        d2.moved = true;
      }
      if (d2.which === "a") {
        d2.cum += delta;
        const steps = Math.round(d2.cum / stepDeg());
        if (steps !== d2.steps) {
          d2.steps = steps;
          stepChannel(d2.baseCh, steps);
          armCommit();
        }
      } else {
        d2.cum = clamp(d2.cum + delta, VOL_MIN - d2.start, VOL_MIN + VOL_RANGE - d2.start);
        const before = Math.round((angB - VOL_MIN) / VOL_RANGE * 100 / VOL_STEP) * VOL_STEP;
        const v = applyVolumeAngle(d2.start + d2.cum);
        if (v !== before) {
          sound("detent");
          if (onVolume) onVolume(v);
        }
      }
    }
    function end() {
      const d2 = drag;
      drag = null;
      win.removeEventListener("pointermove", onMove);
      win.removeEventListener("pointerup", onUp);
      win.removeEventListener("pointercancel", onCancel);
      if (d2) {
        d2.el.classList.remove("is-drag");
        try {
          if (d2.id != null && d2.el.releasePointerCapture) d2.el.releasePointerCapture(d2.id);
        } catch {
        }
      }
      return d2;
    }
    function onUp(e) {
      const d2 = drag;
      if (!d2 || d2.id != null && e.pointerId != null && e.pointerId !== d2.id) return;
      end();
      if (d2.moved) {
        if (d2.which === "a") flush();
        return;
      }
      const dir = e.clientX < d2.c.x ? -1 : 1;
      if (d2.which === "a") chanImmediate(dir);
      else volStep(dir);
    }
    function onCancel() {
      const d2 = end();
      if (d2 && d2.which === "a") flush();
    }
    function onWheel(which, e) {
      if (!st().active) return;
      e.preventDefault();
      const dy = Number(e.deltaY) || 0;
      if (!dy) return;
      const dir = dy < 0 ? 1 : -1;
      if (dir !== wheelDir) {
        wheelAcc = 0;
        wheelDir = dir;
      }
      wheelAcc += Math.abs(dy);
      while (wheelAcc >= WHEEL_UNIT) {
        wheelAcc -= WHEEL_UNIT;
        if (which === "a") chanSteps(dir);
        else volStep(dir);
      }
    }
    const hs = [];
    for (const [which, el, tip] of [["a", elA, "Sender w\xE4hlen"], ["b", elB, "Lautst\xE4rke"]]) {
      if (!el) continue;
      el.title = tip;
      const down = (e) => onDown(which, e);
      const wheel = (e) => onWheel(which, e);
      el.addEventListener("pointerdown", down);
      el.addEventListener("wheel", wheel, { passive: false });
      hs.push(() => {
        el.removeEventListener("pointerdown", down);
        el.removeEventListener("wheel", wheel);
      });
    }
    write(elA, "--lfx-live-knob-a", 0);
    write(elB, "--lfx-live-knob-b", 0);
    sync();
    return {
      setChannel,
      setVolume,
      sync,
      dispose() {
        end();
        clearTimeout(commitTimer);
        commitTimer = null;
        pending = null;
        for (const off of hs) off();
      }
    };
  }

  // src/js/live/player/sfx.js
  var SCALE = 0.35;
  var KINDS3 = {
    // noise: [highpass Hz, lowpass Hz, Dauer s, Gewicht]; tone: [von Hz, nach Hz, Dauer s, Gewicht]
    press: { noise: [2200, 9e3, 0.03, 1], tone: [1700, 800, 0.025, 0.35] },
    detent: { noise: [3e3, 8e3, 0.014, 0.8], tone: [2600, 1900, 0.012, 0.25] },
    power: { noise: [200, 1800, 0.07, 0.8], tone: [150, 62, 0.09, 0.9] }
  };
  function createSfx({ AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
    let ctx = null;
    let noiseBuf = null;
    let disposed = false;
    let vol = 1;
    let muted = false;
    let n = 0;
    const level = () => muted ? 0 : vol * SCALE;
    function ensure() {
      if (ctx || disposed || !AudioCtx) return ctx;
      try {
        ctx = new AudioCtx();
        const sr = ctx.sampleRate || 44100;
        const len = Math.floor(sr * 0.5);
        noiseBuf = ctx.createBuffer(1, len, sr);
        const d2 = noiseBuf.getChannelData(0);
        const rnd = mulberry322(8141597);
        for (let i = 0; i < len; i++) d2[i] = rnd() * 2 - 1;
      } catch {
        ctx = null;
        noiseBuf = null;
      }
      return ctx;
    }
    function play(kind, g) {
      const k = KINDS3[kind] || KINDS3.press;
      const t = ctx.currentTime;
      const out = ctx.createGain();
      out.gain.value = g;
      out.connect(ctx.destination);
      const dead = [out];
      const [hp, lp, nd, nw] = k.noise;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const f1 = ctx.createBiquadFilter();
      f1.type = "highpass";
      f1.frequency.value = hp;
      const f2 = ctx.createBiquadFilter();
      f2.type = "lowpass";
      f2.frequency.value = lp;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(nw, t);
      ng.gain.exponentialRampToValueAtTime(1e-3, t + nd);
      src.connect(f1);
      f1.connect(f2);
      f2.connect(ng);
      ng.connect(out);
      n = (n + 1) % 7;
      src.start(t, n * 0.05, nd + 0.01);
      dead.push(src, f1, f2, ng);
      const [f0, f9, td, tw] = k.tone;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f9, t + td);
      const og = ctx.createGain();
      og.gain.setValueAtTime(tw, t);
      og.gain.exponentialRampToValueAtTime(1e-3, t + td);
      osc.connect(og);
      og.connect(out);
      osc.start(t);
      osc.stop(t + td + 0.01);
      dead.push(osc, og);
      osc.onended = () => {
        for (const x of dead) {
          try {
            x.disconnect();
          } catch {
          }
        }
      };
    }
    return {
      click(kind = "press") {
        const g = level();
        if (disposed || g <= 0) return;
        try {
          if (!ensure()) return;
          if (ctx.state === "suspended" && typeof ctx.resume === "function") {
            const r = ctx.resume();
            if (r && typeof r.catch === "function") r.catch(() => {
            });
          }
          play(kind, g);
        } catch {
        }
      },
      setLevel(v, m) {
        vol = Math.max(0, Math.min(1, Number(v) || 0));
        muted = !!m;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        if (ctx) {
          try {
            const r = ctx.close();
            if (r && typeof r.catch === "function") r.catch(() => {
            });
          } catch {
          }
          ctx = null;
        }
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
        return "esc";
      // App: in Overlay/Vollbild wie back, sonst Menü öffnen
      case "Backspace":
        return "back";
      case "m":
      case "M":
        return "mute";
      case "g":
      case "G":
        return "epg";
      case "z":
      case "Z":
        return "guide";
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
    const c2 = channelColor(no).slice(1);
    const r = parseInt(c2.slice(0, 2), 16);
    const g = parseInt(c2.slice(2, 4), 16);
    const b = parseInt(c2.slice(4, 6), 16);
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
      /** Erweitertes OSD; erneuter Aufruf bei sichtbarem Info schließt Info UND Kanalnummer/Titel (Lautstärke/Meldung bleiben). */
      showInfo(data) {
        if (el.classList.contains("is-info")) {
          this.hideInfo();
          win.clearTimeout(T.ch);
          el.classList.remove("is-ch");
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
      showVolume({ percent, muted, hint, hintOnly }) {
        volFill.style.width = `${muted ? 0 : percent}%`;
        volNum.textContent = muted ? "Stumm" : `${percent}`;
        volHint.textContent = hint || "";
        volLabel.textContent = hintOnly ? muted ? "Stumm" : "Ton an" : "Lautst\xE4rke";
        vol.classList.toggle("is-hint-only", !!hintOnly);
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
  function createCard(container, { formatClock: formatClock2 = (t) => new Date(t).toTimeString().slice(0, 5), doc = document, win = window, onKind } = {}) {
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
    function notify() {
      if (typeof onKind === "function") {
        try {
          onKind(kind, kind === "error" ? el.dataset.reason || null : null);
        } catch {
        }
      }
    }
    function reset(k) {
      el.textContent = "";
      el.hidden = false;
      el.dataset.kind = k;
      delete el.dataset.code;
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
        notify();
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
        notify();
      },
      /** Störbild je Grund (video|browser|audio|network); code (optional): Kurzcode („Code: X“); hint (optional): Grund, z. B. „Bildformat h264 HDR“. */
      showError(reason, channel, code, hint) {
        reset("error");
        const t = errorText(reason);
        el.dataset.reason = ERROR_TEXTS[reason] ? reason : "network";
        if (code) el.dataset.code = String(code);
        el.append(h2(doc, "div", "lfx-live-card__snow"));
        if (channel) el.append(createLogo(channel, { doc, number: true }));
        el.append(h2(doc, "div", "lfx-live-card__title", t.title));
        if (t.sub) el.append(h2(doc, "div", "lfx-live-card__sub", t.sub));
        if (hint) {
          const x = h2(doc, "div", "lfx-live-card__hint", `${hint} wird von diesem Ger\xE4t nicht unterst\xFCtzt`);
          x.style.fontSize = "0.85em";
          x.style.opacity = "0.8";
          el.append(x);
        }
        if (code) {
          const c2 = h2(doc, "div", "lfx-live-card__code", `Code: ${code}`);
          c2.style.fontSize = "0.7em";
          c2.style.opacity = "0.7";
          el.append(c2);
        }
        notify();
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
        const was = kind;
        el.hidden = true;
        el.textContent = "";
        delete el.dataset.kind;
        delete el.dataset.code;
        kind = null;
        clockEl = null;
        countEl = null;
        if (was) notify();
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
  var num22 = (n) => Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "\u2013";
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
    const d2 = doc || parent && parent.ownerDocument || document;
    const el = d2.createElement("div");
    el.className = "lfx-zapstats";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = STYLE;
    const l1 = d2.createElement("div");
    const l2 = d2.createElement("div");
    const l3 = d2.createElement("div");
    const l4 = d2.createElement("div");
    el.append(l1, l2, l3, l4);
    parent.append(el);
    const hist = [];
    let audio = { mode: "", level: null };
    let destroyed = false;
    function renderAudio() {
      const v = typeof getVideo === "function" ? getVideo() : null;
      const mode = audio.mode || "?";
      const muted = v ? v.muted ? "ja" : "nein" : "?";
      const vol = v ? num22(Number(v.volume)) : "?";
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

  // src/js/live/player/neighbors.js
  var NEIGHBOR_MS = 1e3;
  var ERROR_WARM_MS = 2e3;
  var WARM_TICK_MS = 35e3;
  var WARM_TICK_MAX = 10;
  var WARM_AFTER_ERROR = ["video", "browser", "audio"];
  var RETRY_MS = 1e3;
  var RETRY_MAX = 20;
  var safe2 = (fn) => {
    try {
      return fn();
    } catch {
      return void 0;
    }
  };
  function prefetchItem(player, itemId, signal) {
    if (!player || typeof player.prefetch !== "function") return;
    const p = safe2(() => player.prefetch(itemId, signal ? { signal } : {}));
    if (p && typeof p.catch === "function") p.catch(() => {
    });
  }
  function createNeighbors({ player, scheduler, clock = Date.now, deps = {}, getChannel, getPhase, nch = 18 }) {
    let timer = null;
    let tok = 0;
    let ticks = 0;
    const done = /* @__PURE__ */ new Set();
    const warmOn = () => !!(deps && deps.zapWarm && player && typeof player.prewarm === "function");
    const note = (c2) => {
      if (player && typeof player.warmNote === "function") safe2(() => player.warmNote(c2));
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
        const cur = safe2(() => scheduler.nowOn(no, clock()));
        const e = cur && cur.entry;
        if (e && e.type === "program" && e.itemId) out.push({ no, e, off: cur.offsetMs });
      }
      return out;
    }
    function warm() {
      const list = neighbors();
      for (const x of list) {
        const p = safe2(() => player.prewarm(x.e.itemId, x.off));
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

  // src/js/live/magazine/model.js
  var DAYS2 = 7;
  var OVERVIEW_MAX = 240;
  var known = (n) => n != null && n !== 9999 ? n : null;
  function episodeSpan(a, b) {
    const sa = known(a.season);
    const ea = known(a.episode);
    const sb = known(b.season);
    const eb = known(b.episode);
    const one = (s, e) => [s != null ? "S" + s : "", e != null ? "E" + e : ""].filter(Boolean).join(" ");
    if (a === b || sa === sb && ea === eb) return one(sa, ea);
    if (sa != null && sb != null && (sb < sa || sb === sa && ea != null && eb != null && eb < ea)) return "ab " + one(sa, ea);
    if (sa === sb) {
      if (ea == null || eb == null) return one(sa, ea != null ? ea : eb);
      return (sa != null ? "S" + sa + " " : "") + "E" + ea + "\u2013E" + eb;
    }
    return one(sa, ea) + " \u2013 " + one(sb, eb);
  }
  var sigOf = (e) => (e.premiere || "") + "|" + (e.rerun ? "r" : "") + "|" + (e.age || "") + "|" + (e.theme || "");
  function badgesOf(entry) {
    const b = badges(entry);
    if (entry.theme) b.push("Thementag");
    return b;
  }
  function buildRows(scheduler, formatClock2, entries) {
    const list = entries.filter((e) => e.type !== "filler");
    const rows = [];
    for (let i = 0; i < list.length; ) {
      const e = list[i];
      if (e.type === "fill" || e.type === "nightfill") {
        let j = i + 1;
        while (j < list.length && (list[j].type === "fill" || list[j].type === "nightfill")) j++;
        rows.push({ time: formatClock2(e.start), start: e.start, title: "F\xFCllprogramm", sub: "", badges: [], kind: "fill" });
        i = j;
        continue;
      }
      if (e.type === "closedown") {
        let j = i + 1;
        while (j < list.length && list[j].type === "closedown") j++;
        rows.push({ time: formatClock2(e.start), start: e.start, title: "Sendeschluss", sub: "", badges: [], kind: "closedown" });
        i = j;
        continue;
      }
      const it = e.itemId && scheduler.item ? scheduler.item(e.itemId) : null;
      if (e.type === "program" && it && it.kind === "episode") {
        const sid = e.seriesId || it.seriesId || null;
        let j = i + 1;
        let last = it;
        while (j < list.length) {
          const n = list[j];
          const ni = n.type === "program" && n.itemId ? scheduler.item(n.itemId) : null;
          if (!ni || ni.kind !== "episode" || (n.seriesId || ni.seriesId || null) !== sid || sigOf(n) !== sigOf(e)) break;
          last = ni;
          j++;
        }
        rows.push({ time: formatClock2(e.start), start: e.start, title: it.seriesTitle || it.title || "", sub: episodeSpan(it, last), badges: badgesOf(e), kind: "program" });
        i = j;
        continue;
      }
      const d2 = describe(scheduler, e);
      rows.push({ time: formatClock2(e.start), start: e.start, title: d2.title || "\u2013", sub: "", badges: badgesOf(e), kind: "program" });
      i++;
    }
    return rows;
  }
  function makeTip(ctx, ch, list, idx, kindLabel, overviews) {
    const { scheduler, formatClock: formatClock2 } = ctx;
    const e = list[idx];
    const d2 = describe(scheduler, e);
    const it = e.itemId ? scheduler.item(e.itemId) : null;
    const isEp = it && it.kind === "episode";
    let title = d2.title;
    let sub = "";
    let imageId = e.itemId || null;
    if (isEp) {
      const sid = e.seriesId || it.seriesId || null;
      let last = it;
      for (let j = idx + 1; j < list.length; j++) {
        const n = list[j];
        if (n.type === "filler") continue;
        const ni = n.type === "program" && n.itemId ? scheduler.item(n.itemId) : null;
        if (!ni || ni.kind !== "episode" || (n.seriesId || ni.seriesId || null) !== sid) break;
        last = ni;
      }
      title = it.seriesTitle || it.title || "";
      const span = episodeSpan(it, last);
      sub = it === last && it.title && it.title !== title ? [span, it.title].filter(Boolean).join(" \xB7 ") : span;
      imageId = sid || e.itemId;
    }
    if (e.theme) sub = [e.theme, sub].filter(Boolean).join(" \xB7 ");
    const age = e.age != null ? e.age : it && it.age != null ? it.age : null;
    return {
      imageId,
      itemId: e.itemId || null,
      title,
      sub,
      year: d2.year,
      genres: d2.genres,
      runMin: d2.runMin,
      channelNo: ch.no,
      channelName: ch.name,
      time: formatClock2(e.start),
      start: e.start,
      badges: badgesOf(e),
      age,
      overview: overviews && e.itemId && overviews.get(e.itemId) || null,
      kindLabel: kindLabel || (isEp ? "Serie" : "Film")
    };
  }
  function dayTips(ctx, D, chans, overviews) {
    const { scheduler, dayBounds: dayBounds2 } = ctx;
    const b = dayBounds2(D);
    const chOf = (no) => chans.find((c2) => c2.no === no);
    const plan = (no) => scheduler.planDay(no, D);
    const tips = [];
    for (const no of [1, 2]) {
      const ch = chOf(no);
      if (!ch) continue;
      const list = plan(no);
      let idx = list.findIndex((e) => e.type === "program" && e.itemId && e.start === b.a2015);
      if (idx < 0) idx = list.findIndex((e) => e.type === "program" && e.itemId && e.start >= b.a2015);
      if (idx >= 0) tips.push(makeTip(ctx, ch, list, idx, null, overviews));
    }
    const ch17 = chOf(17);
    if (ch17) {
      const list = plan(17);
      const idx = list.findIndex((e) => e.type === "program" && e.itemId && e.premiere);
      if (idx >= 0) tips.push(makeTip(ctx, ch17, list, idx, "Premiere", overviews));
    }
    let theme = null;
    const ch18 = chOf(18);
    if (ch18) {
      const list = plan(18);
      const first = list.find((e) => e.theme);
      theme = first ? first.theme : null;
      const idx = list.findIndex((e) => e.type === "program" && e.itemId && e.theme);
      if (idx >= 0) tips.push(makeTip(ctx, ch18, list, idx, "Thementag", overviews));
    }
    const ch4 = chOf(4);
    if (ch4) {
      const list = plan(4);
      const count = /* @__PURE__ */ new Map();
      list.forEach((e, i) => {
        if (e.type !== "program" || !e.itemId) return;
        const it = scheduler.item(e.itemId);
        const key = it && it.kind === "episode" ? e.seriesId || it.seriesId : e.itemId;
        const c2 = count.get(key);
        if (c2) c2.n++;
        else count.set(key, { n: 1, i });
      });
      let best = null;
      for (const c2 of count.values()) if (!best || c2.n > best.n || c2.n === best.n && c2.i < best.i) best = c2;
      if (best) tips.push(makeTip(ctx, ch4, list, best.i, "Marathon", overviews));
    }
    return { tips: tips.slice(0, 5), theme };
  }
  function rangeText(D0, D1) {
    const a = new Date(D0 * 864e5);
    const b = new Date(D1 * 864e5);
    const [da, ma, ya] = [a.getUTCDate(), a.getUTCMonth() + 1, a.getUTCFullYear()];
    const [db, mb, yb] = [b.getUTCDate(), b.getUTCMonth() + 1, b.getUTCFullYear()];
    if (ya !== yb) return da + "." + ma + "." + ya + "\u2013" + db + "." + mb + "." + yb;
    if (ma !== mb) return da + "." + ma + ".\u2013" + db + "." + mb + "." + yb;
    return da + ".\u2013" + db + "." + mb + "." + yb;
  }
  var p22 = (n) => (n < 10 ? "0" : "") + n;
  function buildMagazine(ctx) {
    const { scheduler, today: D0, formatDay: formatDay2, formatClock: formatClock2, dayBounds: dayBounds2 } = ctx;
    const overviews = ctx.overviews instanceof Map ? ctx.overviews : null;
    const c2 = { scheduler, formatClock: formatClock2, dayBounds: dayBounds2, formatDay: formatDay2 };
    const days = [];
    const pages = [{ kind: "cover", no: 1 }];
    const teasers = [];
    let premiereTip = null;
    let kinoTip = null;
    for (let i = 0; i < DAYS2; i++) {
      const D = D0 + i;
      const fd = formatDay2(D);
      days.push({ D, weekday: fd.weekday, date: fd.date });
      const chans = scheduler.channels(D);
      const { tips, theme } = dayTips(c2, D, chans, overviews);
      if (theme) teasers.push({ D, weekday: fd.weekday, label: theme });
      if (!premiereTip) premiereTip = tips.find((t) => t.kindLabel === "Premiere") || null;
      if (i === 0) kinoTip = tips.find((t) => t.channelNo === 1) || null;
      const b = dayBounds2(D);
      const head = { D, weekday: fd.weekday, date: fd.date };
      pages.push({ kind: "tips", no: pages.length + 1, ...head, tips, theme });
      pages.push({
        kind: "evening",
        no: pages.length + 1,
        ...head,
        channels: chans.map((ch) => ({
          no: ch.no,
          name: ch.name,
          rows: buildRows(scheduler, formatClock2, scheduler.planDay(ch.no, D).filter((e) => e.end > b.a2015))
        }))
      });
      for (const part of [1, 2]) {
        const sel = chans.filter((ch) => part === 1 ? ch.no <= 9 : ch.no >= 10);
        pages.push({
          kind: "day",
          no: pages.length + 1,
          part,
          ...head,
          channels: sel.map((ch) => {
            const plan = scheduler.planDay(ch.no, D);
            const th = plan.find((e) => e.theme);
            return { no: ch.no, name: ch.name, theme: th ? th.theme : null, rows: buildRows(scheduler, formatClock2, plan) };
          })
        });
      }
    }
    pages.push({ kind: "back", no: pages.length + 1 });
    const hero = premiereTip || kinoTip;
    const d0 = new Date(D0 * 864e5);
    return {
      title: "LIVE Programm",
      subtitle: "Die Fernsehwoche \xB7 " + rangeText(D0, D0 + DAYS2 - 1),
      fileName: "LIVE-Programm_" + d0.getUTCFullYear() + "-" + p22(d0.getUTCMonth() + 1) + "-" + p22(d0.getUTCDate()) + ".pdf",
      days,
      cover: { hero: hero ? { ...hero } : null, teasers },
      pages
    };
  }
  function collectTipIds(magazine) {
    const seen = /* @__PURE__ */ new Set();
    const add = (t) => {
      if (t && t.itemId) seen.add(t.itemId);
    };
    if (!magazine) return [];
    add(magazine.cover && magazine.cover.hero);
    for (const p of magazine.pages || []) if (p.kind === "tips") for (const t of p.tips || []) add(t);
    return [...seen];
  }
  function shorten(text) {
    const s = String(text || "").replace(/\s+/g, " ").trim();
    if (s.length <= OVERVIEW_MAX) return s;
    const cut = s.slice(0, OVERVIEW_MAX);
    let end = -1;
    const re = /[.!?…](?=\s|$)/g;
    let m;
    while (m = re.exec(cut)) end = m.index;
    if (end >= 80) return cut.slice(0, end + 1);
    const sp = cut.lastIndexOf(" ");
    return (sp > 40 ? cut.slice(0, sp) : cut).replace(/[\s,;:–-]+$/, "") + "\u2026";
  }
  async function loadOverviews(ids, itemDetails) {
    const out = /* @__PURE__ */ new Map();
    const list = [...new Set((ids || []).filter(Boolean))];
    if (!list.length || typeof itemDetails !== "function") return out;
    try {
      const res = await itemDetails(list);
      const entries = res instanceof Map ? [...res.entries()] : res && typeof res === "object" ? Object.entries(res) : [];
      for (const [id, v] of entries) {
        const raw = typeof v === "string" ? v : v && v.overview;
        const t = raw ? shorten(raw) : "";
        if (t) out.set(id, t);
      }
    } catch {
      return /* @__PURE__ */ new Map();
    }
    return out;
  }

  // src/js/live/magazine/prop.js
  var PROP_MIN_PX = 110;
  function createMagazineProp({ doc = document, onOpen, imageUrl, onFit, slot } = {}) {
    const el = doc.createElement("button");
    el.type = "button";
    el.className = "lfx-live-mag-prop";
    el.setAttribute("aria-label", "Fernsehzeitung \xF6ffnen");
    el.dataset.style = "flat";
    const sheet = doc.createElement("span");
    sheet.className = "lfx-live-mag-prop__sheet";
    const mast = doc.createElement("span");
    mast.className = "lfx-live-mag-prop__mast";
    mast.textContent = "LIVE Programm";
    const pic = doc.createElement("span");
    pic.className = "lfx-live-mag-prop__pic";
    const week = doc.createElement("span");
    week.className = "lfx-live-mag-prop__week";
    week.textContent = "Mo Di Mi Do Fr Sa So";
    sheet.append(mast, pic, week);
    el.append(sheet);
    let cover2 = null;
    let imgEl = null;
    let fit2 = true;
    let ro = null;
    let watched = null;
    let dead = false;
    function setCover(tip) {
      cover2 = tip || null;
      if (imgEl) {
        imgEl.remove();
        imgEl = null;
      }
      pic.classList.toggle("has-img", false);
      if (!cover2 || !cover2.imageId || typeof imageUrl !== "function") return;
      const im = doc.createElement("img");
      im.loading = "lazy";
      im.decoding = "async";
      im.alt = "";
      im.src = imageUrl(cover2.imageId, { maxWidth: 200 });
      im.addEventListener("error", () => {
        im.remove();
        if (imgEl === im) imgEl = null;
        pic.classList.remove("has-img");
      });
      imgEl = im;
      pic.append(im);
      pic.classList.add("has-img");
    }
    function setStyle(id) {
      el.dataset.style = id || "flat";
    }
    function measure() {
      if (dead) return fit2;
      const s = watched || slot || el.parentElement;
      if (!s) return fit2;
      const next = s.clientHeight >= PROP_MIN_PX;
      if (next !== fit2) {
        fit2 = next;
        if (typeof onFit === "function") onFit(fit2);
      }
      return fit2;
    }
    function watch(s) {
      if (dead || !s || s === watched) return;
      if (ro) ro.disconnect();
      watched = s;
      if (typeof ResizeObserver === "function") {
        ro = new ResizeObserver(() => measure());
        ro.observe(s);
      }
      measure();
    }
    const click = () => {
      if (typeof onOpen === "function") onOpen();
    };
    el.addEventListener("click", click);
    if (slot) watch(slot);
    return {
      el,
      setCover,
      setStyle,
      fits: () => fit2,
      measure,
      watch,
      destroy() {
        dead = true;
        if (ro) ro.disconnect();
        ro = null;
        el.removeEventListener("click", click);
        el.remove();
        imgEl = null;
      }
    };
  }

  // src/js/live/ui/app.js
  var DEBOUNCE_MS = 400;
  var DIGIT_WAIT_MS = 1500;
  var RETRY_MS2 = 1e4;
  var SYNC_MS = 3e4;
  var LOADING_DELAY_MS = 400;
  var MAX_TIMEOUT = 2147483647;
  var VOL_STEP2 = 5;
  var VOL_SETTLE_MS = 1e3;
  var PLAYABLE = ["program", "fill", "nightfill"];
  var OVERLAY_FACTORY = { epg: "epg", txt: "ttx", menu: "menu", guide: "guide" };
  var OVERLAY_CLASS = { epg: "has-epg", txt: "has-ttx", menu: "has-menu", guide: "has-guide" };
  var IDLE_KINDS = ["pause", "test", "error"];
  var p23 = (n) => String(n).padStart(2, "0");
  var clamp2 = (n, a, b) => Math.max(a, Math.min(b, n));
  function defaultClock(t) {
    const d2 = new Date(t);
    return `${p23(d2.getHours())}:${p23(d2.getMinutes())}`;
  }
  function pick(it, ...keys) {
    for (const k of keys) if (it[k] != null && it[k] !== "") return it[k];
    return null;
  }
  function itemFields(it, scheduler) {
    if (!it) return { genres: [] };
    const known2 = (n) => n != null && n !== 9999 ? n : null;
    const g = Array.isArray(it.genres) ? it.genres : [];
    return {
      title: pick(it, "title"),
      seriesName: pick(it, "seriesTitle"),
      season: known2(pick(it, "season")),
      episode: known2(pick(it, "episode")),
      year: pick(it, "year"),
      genres: scheduler ? genreLabels(scheduler, g) : g,
      runtimeMs: pick(it, "durMs"),
      age: pick(it, "age"),
      seriesId: pick(it, "seriesId"),
      type: pick(it, "kind")
    };
  }
  function createApp(host, { scheduler, player: playerArg, watch, pickFiller: pickFiller2, overlays = {}, music = null, sfx: sfxArg, pdf = null, deps = {}, opts = {}, time = {} }) {
    const doc = host.ownerDocument || document;
    const win = typeof window !== "undefined" ? window : doc.defaultView;
    const clock = typeof opts.now === "function" ? opts.now : () => Date.now();
    const formatClock2 = time.formatClock || defaultClock;
    const NCH = () => scheduler.channels && scheduler.channels().length || 18;
    const refs = buildTv({ style: opts.style, fakePlayer: !!opts.fakePlayer, doc });
    const { app, room, screen, video, overlay: overlayEl } = refs;
    const noise = createNoise(refs.noise, { win });
    let knobs = null;
    const sfx = sfxArg === void 0 ? createSfx() : sfxArg;
    const decor = createDecor({ room, tv: refs.tv, screen, doc, onAction: (a) => onDeviceAction(a) });
    decor.setStyle(normStyle(opts.style));
    const card = createCard(screen, { formatClock: formatClock2, doc, win, onKind: () => syncMusic() });
    const osd = createOsd(screen, { doc, win });
    screen.append(overlayEl);
    const remote = createRemote({ onKey: (k) => press(k), doc });
    const side = h2(doc, "div", "lfx-live-side");
    const slot = h2(doc, "div", "lfx-live-side__slot");
    const propSlot = h2(doc, "div", "lfx-live-room__prop");
    side.append(slot, remote.el);
    room.append(side, propSlot);
    host.append(app);
    let prop = null;
    if (overlays.guide) {
      prop = createMagazineProp({ doc, onOpen: () => press("guide"), imageUrl: deps.imageUrl });
      slot.append(prop.el);
      prop.setStyle(normStyle(opts.style));
    }
    if (opts.phone) app.classList.add("is-phone");
    if (opts.touch) app.classList.add("is-touch");
    app.classList.toggle("no-tubefx", opts.fx === false);
    let style = normStyle(opts.style);
    let on = false;
    let suspended = false;
    let disposed = false;
    let channel = clamp2(Math.round(Number(opts.lastChannel) || 1), 1, 18);
    let entry = null;
    let gen = 0;
    let playing = false;
    let vol = clamp2(Math.round((opts.volume == null ? 1 : Number(opts.volume)) * 100), 0, 100);
    let muted = !!opts.muted;
    let digitBuf = "";
    let pendingRestart = null;
    let mutedByPolicy = false;
    let needsTap = false;
    let stallArmed = false;
    let tickCount = 0;
    let lastDay = null;
    let musicOn = opts.music !== false;
    let fxOn = opts.fx !== false;
    let magCache = null;
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
    const safe3 = (fn) => {
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
    let lastPh = null;
    const nb = createNeighbors({
      player,
      scheduler,
      clock,
      deps,
      nch: NCH,
      getChannel: () => channel,
      getPhase: () => card.kind() === "error" ? "error" : on && playing && lastPh !== "loading" && lastPh !== "stalled" ? "playing" : "loading"
    });
    const zapStats = opts.zapStats ? createZapStats(screen, { getVideo: () => video, doc }) : null;
    let tuneAt = 0;
    const zapAudio = () => {
      if (zapStats) safe3(() => zapStats.updateAudio({ mode: player && player.volumeMode ? player.volumeMode() : "", level: vol }));
    };
    function channelOf(no) {
      const list = scheduler.channels && scheduler.channels() || [];
      return list.find((c2) => c2.no === no) || { no, key: "", name: `LIVE ${no}` };
    }
    function titleOf(e) {
      if (!e) return { title: "", sub: null };
      if (e.type === "closedown") return { title: e.reason === "empty" ? "Kein Programm" : "Sendeschluss", sub: null };
      if (e.type === "filler") return { title: "Kurze Pause", sub: null };
      const f = itemFields(e.itemId ? scheduler.item(e.itemId) : null, scheduler);
      if (f.seriesName) {
        const code = f.season != null && f.episode != null ? `S${p23(f.season)}E${p23(f.episode)}` : null;
        const sub = [code, f.title && f.title !== f.seriesName ? f.title : null].filter(Boolean).join(" \xB7 ");
        return { title: f.seriesName, sub: sub || null };
      }
      return { title: f.title || "Unbekannter Titel", sub: null };
    }
    function badgesOf2(e) {
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
        badges: badgesOf2(e),
        progress: clamp2((t - e.start) / Math.max(1, e.end - e.start), 0, 1),
        next: nx ? { title: titleOf(nx).title, from: formatClock2(nx.start) } : null,
        meta: []
      };
      const f = itemFields(e.itemId ? scheduler.item(e.itemId) : null, scheduler);
      const age = e.age != null ? e.age : f.age;
      const ageText2 = typeof age === "number" && age > 0 ? `ab ${age}` : null;
      const mins = f.runtimeMs ? Math.round(Number(f.runtimeMs) / 6e4) : null;
      data.meta = [f.year, f.genres.length ? f.genres.slice(0, 3).join(", ") : null, mins ? `${mins} Min.` : null, ageText2].filter((x) => x != null && x !== "");
      return data;
    }
    const ctx = {
      scheduler,
      now: clock,
      channels: () => scheduler.channels(),
      currentChannel: () => channel,
      // Senderliste im Standby-Menü: direkt auf diesem Sender einschalten
      tune: (no) => {
        if (on) {
          tune(no);
          return;
        }
        if (no >= 1 && no <= NCH()) channel = Math.round(no);
        powerOn();
      },
      closeOverlay: () => closeOverlays(),
      formatClock: formatClock2,
      formatDay: time.formatDay,
      broadcastDayOf: time.broadcastDayOf,
      dayBounds: time.dayBounds,
      style: () => style,
      setStyle: (id) => setStyle(id),
      styles: STYLES2,
      user: deps.user,
      isAdmin: !!(deps.user && deps.user.isAdmin),
      channelConfig: deps.channelConfig || {},
      previousThemeName: deps.previousThemeName,
      leaveToLibrary: (...a) => deps.leaveToLibrary && deps.leaveToLibrary(...a),
      openThemePicker: () => deps.openThemePicker && deps.openThemePicker(),
      openDashboard: () => deps.openDashboard && deps.openDashboard(),
      logout: () => deps.logout && deps.logout(),
      imageUrl: deps.imageUrl,
      toast: (t) => deps.toast && deps.toast(t),
      buildMagazine: () => buildFullMagazine(),
      downloadPdf: (mag, onProgress) => {
        if (!pdf || typeof pdf.downloadPdf !== "function") return Promise.reject(new Error("kein PDF-Export"));
        return pdf.downloadPdf(mag, style, onProgress);
      },
      openOverlay: (name, o) => openOverlay(name, o),
      musicEnabled: () => musicOn,
      toggleMusic: () => toggleMusic(),
      fxEnabled: () => fxOn,
      toggleFx: () => toggleFx()
    };
    function overlayInst(name) {
      if (made[name]) return made[name];
      const factory = overlays[OVERLAY_FACTORY[name]];
      if (!factory) return null;
      const inst = factory(ctx);
      made[name] = inst;
      if (inst && inst.el) (name === "guide" ? app : overlayEl).append(inst.el);
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
      for (const n of Object.keys(made)) if (made[n] && made[n].isOpen()) safe3(() => made[n].close());
      syncOverlayClasses();
    }
    function openOverlay(name, o) {
      const inst = overlayInst(name);
      if (!inst) return;
      for (const n of Object.keys(made)) if (n !== name && made[n] && made[n].isOpen()) made[n].close();
      if (o === void 0) inst.open();
      else inst.open(o);
      syncOverlayClasses();
    }
    function magInput(overviews) {
      const D = time.broadcastDayOf(clock());
      return { scheduler, today: D, formatClock: formatClock2, formatDay: time.formatDay, dayBounds: time.dayBounds, overviews };
    }
    function baseMagazine() {
      if (!time.broadcastDayOf || !time.formatDay || !time.dayBounds) return null;
      const D = time.broadcastDayOf(clock());
      if (magCache && magCache.D === D) return magCache.base;
      const base = buildMagazine(magInput(void 0));
      magCache = { D, base, full: null };
      return base;
    }
    function buildFullMagazine() {
      let base;
      try {
        base = baseMagazine();
      } catch (e) {
        return Promise.reject(e);
      }
      if (!base) return Promise.reject(new Error("kein Zeitmodul"));
      const cache = magCache;
      if (cache.full) return cache.full;
      const full = (async () => {
        const overviews = await loadOverviews(collectTipIds(base), deps.itemDetails);
        return buildMagazine(magInput(overviews));
      })();
      cache.full = full;
      full.catch(() => {
        if (cache.full === full) cache.full = null;
      });
      return full;
    }
    function refreshPropCover() {
      if (!prop) return;
      try {
        const m = baseMagazine();
        prop.setCover(m && m.cover ? m.cover.hero : null);
      } catch {
      }
    }
    function propCandidates() {
      if (style === "crt80" || style === "silver") return [["lowboard", propSlot], ["above", slot]];
      if (style === "plain") return [["above", slot], ["above-low", slot]];
      return [["above", slot]];
    }
    function placeProp() {
      if (!prop || disposed) return;
      let found = null;
      for (const [name, el] of propCandidates()) {
        app.dataset.prop = name;
        if (el.clientHeight >= PROP_MIN_PX) {
          found = [name, el];
          break;
        }
      }
      if (found) {
        app.dataset.prop = found[0];
        if (prop.el.parentNode !== found[1]) found[1].append(prop.el);
        prop.el.hidden = false;
        app.classList.remove("is-guide-key");
      } else {
        delete app.dataset.prop;
        prop.el.hidden = true;
        app.classList.add("is-guide-key");
      }
    }
    let propRo = null;
    let propRaf = 0;
    function schedulePlace() {
      if (propRaf) return;
      const raf = win.requestAnimationFrame ? (f) => win.requestAnimationFrame(f) : (f) => setTimeout(f, 16);
      propRaf = raf(() => {
        propRaf = 0;
        placeProp();
      }) || 1;
    }
    function syncMusic() {
      if (!music) return;
      const kind = card.kind();
      const reason = card.el && card.el.dataset ? card.el.dataset.reason : null;
      const idle = on && !suspended && !disposed && IDLE_KINDS.includes(kind) && !needsTap && !(kind === "error" && reason === "gesture");
      safe3(() => music.setIdle(idle ? kind : null));
    }
    function toggleMusic() {
      musicOn = !musicOn;
      if (music) safe3(() => music.setEnabled(musicOn));
      savePrefs({ music: musicOn });
      return musicOn;
    }
    function toggleFx() {
      fxOn = !fxOn;
      app.classList.toggle("no-tubefx", !fxOn);
      savePrefs({ fx: fxOn });
      return fxOn;
    }
    function syncDecor() {
      safe3(() => decor.setDisplays({ on, clock: formatClock2(clock()), ch: channel }));
      safe3(() => knobs.sync());
    }
    function scheduleClock() {
      later("clock", () => {
        syncDecor();
        scheduleClock();
      }, 6e4 - clock() % 6e4 + 50);
    }
    function muteOnly() {
      if (player && typeof player.volumeMode === "function") {
        const m = safe3(() => player.volumeMode());
        if (m === "native") return false;
        if (m === "mute-only") return true;
      }
      return !!player && player.volumeSupported === false;
    }
    const level = () => muteOnly() ? 1 : vol / 100;
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
    let volHintShown = false;
    function applyVolume() {
      noteVol();
      safe3(() => player.setVolume && player.setVolume(muteOnly() ? 1 : vol / 100));
      safe3(() => player.setMuted && player.setMuted(silent()));
      if (music) safe3(() => music.setLevel(level(), silent() || mutedByPolicy));
      if (sfx) safe3(() => sfx.setLevel(level(), silent()));
      safe3(() => knobs.setVolume(vol));
      zapAudio();
    }
    function savePrefs(partial) {
      if (deps.savePrefs) safe3(() => deps.savePrefs(partial));
    }
    function showVol() {
      if (!on) return;
      const hint = muteOnly() && !volHintShown ? "Lautst\xE4rke bitte am Ger\xE4t einstellen" : "";
      if (hint) volHintShown = true;
      osd.showVolume({ percent: vol, muted: silent(), hint });
    }
    function changeVolume(key) {
      if (key === "mute") {
        muted = !silent();
        if (!muted && vol === 0) vol = lastVol;
      } else {
        vol = clamp2(vol + (key === "vol+" ? VOL_STEP2 : -VOL_STEP2), 0, 100);
        muted = false;
      }
      applyVolume();
      showVol();
      savePrefs({ volume: vol / 100, muted });
    }
    function setVolumeAbs(v) {
      if (disposed || suspended) return;
      v = clamp2(Math.round(Number(v) || 0), 0, 100);
      vol = v;
      muted = false;
      applyVolume();
      showVol();
      savePrefs({ volume: vol / 100, muted });
    }
    function onDeviceAction(action) {
      if (disposed || suspended || !action) return;
      const N = NCH();
      const wrap2 = (n) => ((n - 1) % N + N) % N + 1;
      safe3(() => sfx && sfx.click(action === "power" ? "power" : "press"));
      const m = /^ch:(\d+)$/.exec(action);
      if (m) {
        const no = Number(m[1]);
        if (no >= 1 && no <= N) ctx.tune(no);
        return;
      }
      if (action === "power") {
        press("power");
        return;
      }
      const key = action.startsWith("key:") ? action.slice(4) : "";
      if (key === "ch+" || key === "ch-") {
        if (on) press(key);
        else ctx.tune(wrap2(channel + (key === "ch+" ? 1 : -1)));
      } else if (key === "vol+" || key === "vol-") {
        if (on) press(key);
        else changeVolume(key);
      } else if (key === "epg") {
        if (on) press("epg");
        else {
          powerOn();
          openOverlay("epg");
        }
      }
    }
    function watchTune() {
      if (!watch || !entry) return;
      const off = Math.max(0, clock() - entry.start);
      safe3(() => watch.tune(entry, off));
    }
    function watchLeave(silent2) {
      if (watch) safe3(() => watch.leave(silent2));
    }
    function clearStall() {
      stallArmed = false;
      unlater("stall");
    }
    function showError(reason, g, code, hint) {
      playing = false;
      clearStall();
      watchLeave(true);
      needsTap = reason === "gesture";
      card.showError(reason, channelOf(channel), code || (reason === "network" ? "NET" : void 0), hint);
      unlater("retry");
      if (reason === "network") later("retry", () => {
        if (g === gen && on) start(g, false);
      }, RETRY_MS2);
      if (on && WARM_AFTER_ERROR.includes(reason)) nb.arm("error");
    }
    function handleResult(res, g, e) {
      if (g !== gen) return false;
      if (res && res.ok === false) {
        if (res.reason === "aborted") return false;
        showError(res.reason || "network", g, res.code, res.hint);
        if (zapStats && e === entry) safe3(() => zapStats.update({ channel, ok: false, reason: res.reason || "network", code: res.code, keyMs: tuneAt ? clock() - tuneAt : null, timing: res.timing || null }));
        return false;
      }
      card.hide();
      playing = true;
      if (zapStats && e === entry) {
        safe3(() => zapStats.update({ channel, ok: true, keyMs: tuneAt ? clock() - tuneAt : null, timing: res && res.timing || null }));
        zapAudio();
      }
      tuneAt = 0;
      lastPh = null;
      if (e === entry && e.type === "program") nb.arm("play");
      if (silent()) safe3(() => player.setMuted && player.setMuted(true));
      if (e === entry) watchTune();
      return true;
    }
    function userGesture(key) {
      if (needsTap) {
        if (key === "power" || key === "fullscreen") return false;
        needsTap = false;
        safe3(() => player.unlock && player.unlock());
        if (music) safe3(() => music.unlock());
        mutedByPolicy = false;
        applyVolume();
        card.hide();
        start(++gen, false);
        return true;
      }
      if (mutedByPolicy) {
        mutedByPolicy = false;
        if (music) safe3(() => music.unlock());
        osd.hideMessage();
        applyVolume();
        return key === "mute" && !muted;
      }
      return false;
    }
    function armAdvance(e, g) {
      const delay = clamp2(e.end - clock() + 30, 50, MAX_TIMEOUT);
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
      nb.stop();
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
        safe3(() => player.stop());
        const nx = nextProgram(channel, e);
        const nt = nx && PLAYABLE.includes(nx.type) ? titleOf(nx).title : null;
        card.showPause({ channel: channelOf(channel), title: nt, at: nx ? nx.start : 0, until: e.end, now: clock() });
        return;
      }
      safe3(() => player.stop());
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
      safe3(() => player.stop());
      const nt = next && PLAYABLE.includes(next.type) ? titleOf(next).title : null;
      card.showPause({ channel: channelOf(channel), title: nt, at: next ? next.start : 0, until: e.end, now: clock() });
      const ts = pickRes && pickRes.trailerStartMs;
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
      if (!on) return;
      no = ((Math.round(no) - 1) % NCH() + NCH()) % NCH() + 1;
      if (no === channel && entry) {
        osd.showChannel(describe2(channel, entry, clock()));
        return;
      }
      channel = no;
      const g = ++gen;
      tuneAt = clock();
      unlater("zap");
      unlater("advance");
      unlater("retry");
      unlater("trailer");
      nb.stop();
      cancelRestart();
      clearStall();
      needsTap = false;
      watchLeave();
      if (!immediate) safe3(() => player.stop());
      playing = false;
      entry = null;
      card.hide();
      card.hideBanner();
      syncDecor();
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
      if (entry) osd.setProgress(clamp2((t - entry.start) / Math.max(1, entry.end - entry.start), 0, 1));
      for (const n of Object.keys(made)) if (made[n] && made[n].isOpen() && made[n].tick) safe3(() => made[n].tick(t));
      if (watch) safe3(() => watch.tick());
      tickCount++;
      if (tickCount % (SYNC_MS / 1e3) === 0 && playing && entry && PLAYABLE.includes(entry.type) && entry.itemId) {
        safe3(() => player.syncTo(t - entry.start));
      }
      if (time.broadcastDayOf) {
        const D = time.broadcastDayOf(t);
        if (lastDay != null && D !== lastDay && scheduler.prepare) {
          const ds = [0, 1, 2, 3, 4, 5, 6].map((i) => D + i);
          Promise.resolve(safe3(() => scheduler.prepare(ds))).catch(() => {
          });
        }
        if (lastDay != null && D !== lastDay) refreshPropCover();
        lastDay = D;
      }
      syncOverlayClasses();
    }
    function powerOn() {
      if (on) return;
      safe3(() => player.unlock && player.unlock());
      if (music) safe3(() => music.unlock());
      on = true;
      syncDecor();
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
      nb.stop();
      for (const k of ["zap", "advance", "retry", "trailer", "digit", "restart", "blend"]) unlater(k);
      digitBuf = "";
      pendingRestart = null;
      clearStall();
      needsTap = false;
      mutedByPolicy = false;
      watchLeave();
      safe3(() => player.stop());
      noise.stop();
      card.hide();
      card.hideBanner();
      osd.hide();
      closeOverlays();
      playing = false;
      entry = null;
      if (music) safe3(() => music.setIdle(null));
    }
    function powerOff() {
      if (!on) return;
      stopAll();
      on = false;
      syncDecor();
      stopIntervals();
      unlater("loading");
      app.classList.remove("is-on", "is-powering-on", "is-blend", "is-loading");
      app.classList.add("is-powering-off");
      remote.setOn(false);
      later("pw", () => app.classList.remove("is-powering-off"), 600);
    }
    function digit(d2) {
      const n = Number(d2);
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
      const no = Number(first + d2);
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
      const tr = safe3(() => player.tracks && player.tracks());
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
      const tr = safe3(() => player.tracks && player.tracks());
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
      if (music) safe3(() => music.setStyle(style));
      decor.setStyle(style);
      safe3(() => knobs.sync());
      if (prop) {
        prop.setStyle(style);
        placeProp();
      }
      savePrefs({ style });
    }
    function routeOverlay(open, key) {
      const consumed = safe3(() => made[open].onKey(key));
      syncOverlayClasses();
      if (consumed) return true;
      if (key === "back") {
        closeOverlays();
        return true;
      }
      if (OVERLAY_CLASS[key]) {
        if (key === open) closeOverlays();
        else openOverlay(key);
        return true;
      }
      return false;
    }
    function press(key) {
      if (disposed || suspended) return;
      if (key === "fullscreen") {
        fs.toggle();
        return;
      }
      if (key === "esc") key = openName() || fs.isOn() ? "back" : "menu";
      if (!on) {
        if (key === "power") {
          powerOn();
          return;
        }
        const openOff = openName();
        if (openOff) {
          routeOverlay(openOff, key);
          return;
        }
        if (key === "menu" || key === "guide") {
          openOverlay(key);
          return;
        }
        if (key === "ok") powerOn();
        else if (key === "back" && fs.isOn()) fs.exit();
        return;
      }
      if ((needsTap || mutedByPolicy) && userGesture(key)) return;
      if (key === "power") {
        powerOff();
        return;
      }
      if (pendingRestart && key !== "ok") cancelRestart();
      const open = openName();
      if (open && routeOverlay(open, key)) return;
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
        case "guide":
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
    let swallowClick = false;
    const onOutsidePointer = (e) => {
      if (disposed || suspended || openName() !== "menu") return;
      const t = e.target;
      if (t && t.closest && t.closest(".lfx-live-menu__panel, .lfx-live-remote, [data-action]")) return;
      closeOverlays();
      swallowClick = true;
      later("swallow", () => {
        swallowClick = false;
      }, 700);
    };
    const onOutsideClick = (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      unlater("swallow");
      e.stopPropagation();
      e.preventDefault();
    };
    app.addEventListener("pointerdown", onOutsidePointer, true);
    app.addEventListener("click", onOutsideClick, true);
    const onDbl = () => press("fullscreen");
    const onScreenClick = () => {
      if (!on) {
        if (!openName()) press("power");
      } else if (!suspended && !disposed && (needsTap || mutedByPolicy)) userGesture(null);
    };
    const onCtx = (e) => e.preventDefault();
    screen.addEventListener("dblclick", onDbl);
    screen.addEventListener("click", onScreenClick);
    video.addEventListener("contextmenu", onCtx);
    const mq = win.matchMedia ? safe3(() => win.matchMedia("(orientation: landscape)")) : null;
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
        lastPh = phase || null;
        if (phase === "loading" || phase === "stalled") {
          if (!T.loading && !app.classList.contains("is-loading")) {
            later("loading", () => {
              T.loading = null;
              app.classList.add("is-loading");
            }, LOADING_DELAY_MS);
          }
        } else {
          unlater("loading");
          app.classList.remove("is-loading");
        }
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
        if (music) safe3(() => music.setLevel(level(), true));
        if (!muted) osd.showMessage("Ton aus \u2013 zum Einschalten tippen oder Stumm-Taste dr\xFCcken", 8e3);
      }));
      offs.push(player.on("error", (err) => {
        if (!on || !entry || entry.type === "filler" || card.kind() === "error") return;
        showError(err && err.reason || "network", gen, err && err.code, err && err.hint);
      }));
    }
    const keys = createKeys({
      onKey: press,
      isActive: () => !suspended && !disposed && app.isConnected,
      isOverlayOpen: () => !!openName(),
      win
    });
    keys.attach();
    let hideSuspended = false;
    function onPageHide() {
      if (disposed || suspended) return;
      hideSuspended = true;
      safe3(() => player.setKeepalive && player.setKeepalive(true));
      try {
        instance.suspend();
      } finally {
        safe3(() => player.setKeepalive && player.setKeepalive(false));
      }
    }
    function onPageShow(e) {
      if (!hideSuspended) return;
      hideSuspended = false;
      if (e && e.persisted && !disposed) instance.resume();
    }
    if (win.addEventListener) {
      win.addEventListener("pagehide", onPageHide);
      win.addEventListener("pageshow", onPageShow);
    }
    knobs = createKnobs({
      tv: refs.tv,
      getState: () => ({ active: style === "crt80" && !disposed && !suspended, channel, count: NCH(), volume: vol }),
      onChannel: (n) => {
        if (!disposed && !suspended) ctx.tune(n);
      },
      onVolume: (v) => setVolumeAbs(v),
      onSound: (k) => safe3(() => sfx && sfx.click(k)),
      onPreview: (n) => {
        if (on) safe3(() => osd.showMessage(`Sender ${n}`, 1200));
      },
      win
    });
    syncDecor();
    scheduleClock();
    if (music) {
      safe3(() => music.setStyle(style));
      safe3(() => music.setEnabled(musicOn));
    }
    if (prop) {
      placeProp();
      if (typeof ResizeObserver === "function") {
        propRo = new ResizeObserver(() => schedulePlace());
        propRo.observe(room);
      }
      later("propcover", refreshPropCover, 0);
    }
    const instance = {
      el: app,
      press,
      tune: (no) => tune(no),
      isOn: () => on,
      /** Nur Harness/Debug: zeigt eine Leerlaufkarte zur Ansicht (pause|test|error); Musik folgt wie im Betrieb. */
      debugCard(kind) {
        if (!on) return;
        const t = clock();
        const ch = channelOf(channel);
        safe3(() => player.stop());
        if (kind === "pause") card.showPause({ channel: ch, title: "Platzhalter-Film", at: t + 3e5, until: t + 3e5, now: t });
        else if (kind === "test") card.showTest({ channel: ch, text: "Sendeschluss", now: t });
        else if (kind === "error") card.showError("network", ch);
      },
      channel: () => channel,
      style: () => style,
      suspend() {
        if (disposed) return;
        powerOff();
        safe3(() => player.releaseWarm && player.releaseWarm());
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
        nb.dispose();
        disposed = true;
        stopIntervals();
        for (const k of Object.keys(T)) clearTimeout(T[k]);
        keys.destroy();
        fs.destroy();
        if (win.removeEventListener) {
          win.removeEventListener("pagehide", onPageHide);
          win.removeEventListener("pageshow", onPageShow);
        }
        app.removeEventListener("pointermove", onPointer);
        app.removeEventListener("pointerdown", onPointer);
        app.removeEventListener("pointerdown", onOutsidePointer, true);
        app.removeEventListener("click", onOutsideClick, true);
        screen.removeEventListener("dblclick", onDbl);
        screen.removeEventListener("click", onScreenClick);
        video.removeEventListener("contextmenu", onCtx);
        if (mq) {
          if (mq.removeEventListener) mq.removeEventListener("change", applyOrient);
          else if (mq.removeListener) mq.removeListener(applyOrient);
        }
        for (const off of offs) if (typeof off === "function") safe3(off);
        for (const n of Object.keys(made)) {
          const o = made[n];
          if (o) {
            safe3(() => o.close());
            if (o.el) o.el.remove();
          }
        }
        noise.dispose();
        if (zapStats) zapStats.destroy();
        knobs.dispose();
        decor.dispose();
        if (sfx && sfxArg === void 0) safe3(() => sfx.dispose());
        osd.dispose();
        card.dispose();
        remote.destroy();
        if (propRo) propRo.disconnect();
        if (prop) prop.destroy();
        propSlot.remove();
        side.remove();
        if (music) safe3(() => music.dispose());
        if (watch) safe3(() => watch.dispose && watch.dispose());
        if (player) safe3(() => player.dispose && player.dispose());
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
  var DAYS3 = 7;
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
        for (let i = 0; i < DAYS3; i++) {
          await scheduler.prepare([D + i]);
          if (disposed) return;
          progress(0.1 + 0.85 * (i + 1) / DAYS3, "Sendersuchlauf \u2026");
        }
        const watch = createWatchTracker({ setPlayed: deps.setPlayed, now });
        const time = { formatClock, formatDay, broadcastDayOf, dayBounds };
        const doc = curHost.ownerDocument || document;
        app = createApp(curHost, {
          scheduler,
          player: ({ video, canvas, getInfo }) => createPlayer({ video, deps, now, fake: !!o.fakePlayer, canvas, getInfo }),
          watch,
          pickFiller,
          overlays: { epg: createEpg, ttx: createTeletext, menu: createMenu, guide: createMagazine },
          music: createMusic({ doc }),
          pdf: createPdfExport({ imageUrl: deps.imageUrl, doc, now, time }),
          deps,
          opts: o,
          time
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
