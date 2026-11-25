(() => {
  // src/js/serverstats/format.js
  var MONTHS = [
    "Januar",
    "Februar",
    "M\xE4rz",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember"
  ];
  var WEEKDAYS = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];
  var T = {
    down: "Der Server ist gerade nicht erreichbar, vermutlich ein Neustart. Die Werte erscheinen gleich wieder.",
    downStale: "Der Server ist gerade nicht erreichbar, vermutlich ein Neustart. Gezeigt wird der zuletzt gespeicherte Stand.",
    error: "Statistik gerade nicht abrufbar.",
    retry: "Erneut versuchen",
    loading: "Lade \u2026",
    idle: "Gerade l\xE4uft nichts.",
    noData: "Noch keine Daten vom Server."
  };
  var isNum = (n) => typeof n === "number" && Number.isFinite(n);
  var pos0 = (n) => isNum(n) && n > 0 ? n : 0;
  function num(n, dec = 0) {
    if (!isNum(n)) return "\u2013";
    const s2 = Math.abs(n).toFixed(dec);
    const neg = n < 0 && Number(s2) !== 0;
    const [i, f] = s2.split(".");
    return (neg ? "\u2212" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (f ? "," + f : "");
  }
  var p2 = (n) => (n < 10 ? "0" : "") + n;
  function fmtClock(secs, long) {
    const t = Math.max(0, Math.floor(isNum(secs) ? secs : 0));
    const h2 = Math.floor(t / 3600);
    const m = Math.floor(t % 3600 / 60);
    const s2 = t % 60;
    return long || h2 > 0 ? `${h2}:${p2(m)}:${p2(s2)}` : `${m}:${p2(s2)}`;
  }
  function fmtHm(secs) {
    const total = Math.round(pos0(secs) / 60);
    const h2 = Math.floor(total / 60);
    const m = total % 60;
    if (!h2) return `${m} min`;
    return m ? `${num(h2)} h ${m} min` : `${num(h2)} h`;
  }
  function fmtBytes(b, dec) {
    if (!isNum(b) || b < 0) return "\u2013";
    const u = ["B", "kB", "MB", "GB", "TB", "PB"];
    let i = 0;
    let v = b;
    while (v >= 1e3 && i < u.length - 1) {
      v /= 1e3;
      i++;
    }
    const d = dec !== void 0 ? dec : i < 2 ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : 2;
    return `${num(v, d)} ${u[i]}`;
  }
  function fmtDelta(cur, prev) {
    if (!(prev > 0)) return cur > 0 ? "neu" : "\u2013";
    const r = Math.round((pos0(cur) - prev) / prev * 100);
    return r > 0 ? `+${num(r)} %` : r < 0 ? `\u2212${num(-r)} %` : "0 %";
  }
  function fmtMbps(n) {
    return isNum(n) ? `${num(n, 1)} Mbit/s` : "";
  }
  function plural(n, one, many) {
    return `${num(n)} ${n === 1 ? one : many}`;
  }
  function ymParts(ym) {
    const m = /^(\d{4})-(\d{2})/.exec(String(ym || ""));
    if (!m || +m[2] < 1 || +m[2] > 12) return null;
    return { y: m[1], m: +m[2] };
  }
  function monthName(ym, only) {
    const p = ymParts(ym);
    if (!p) return "";
    return only ? MONTHS[p.m - 1] : `${MONTHS[p.m - 1]} ${p.y}`;
  }
  function fmtDate(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
    return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
  }
  function fmtDayShort(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
    if (!m) return "";
    const wd = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
    return `${WEEKDAYS[wd]}, ${m[3]}.${m[2]}.`;
  }
  function fmtUptime(secs) {
    if (!isNum(secs) || secs < 0) return "";
    const d = Math.floor(secs / 86400);
    const h2 = Math.floor(secs % 86400 / 3600);
    const m = Math.floor(secs % 3600 / 60);
    if (d) return `${d} ${d === 1 ? "Tag" : "Tage"} ${h2} h`;
    if (h2) return `${h2} h ${m} min`;
    return `${m} min`;
  }
  function fmtAgo(secs) {
    const s2 = pos0(secs);
    if (s2 < 3600) return `${Math.max(1, Math.round(s2 / 60))} min`;
    if (s2 < 86400) return `${Math.round(s2 / 3600)} h`;
    const d = Math.round(s2 / 86400);
    return d === 1 ? "1 Tag" : `${d} Tagen`;
  }

  // src/js/serverstats/dom.js
  var SVG = "http://www.w3.org/2000/svg";
  function apply(el, attrs) {
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === void 0 || v === null || v === false) continue;
      if (k === "class") el.setAttribute("class", v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  function addKids(el, children) {
    for (const c of [].concat(children ?? [])) {
      if (c === null || c === void 0 || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }
  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    apply(el, attrs);
    addKids(el, children);
    return el;
  }
  function s(tag, attrs, children) {
    const el = document.createElementNS(SVG, tag);
    apply(el, attrs);
    addKids(el, children);
    return el;
  }
  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }
  function note(text) {
    return h("p", { class: "lfx-srv-note" }, text);
  }
  function errorBox(onRetry) {
    return h("div", { class: "lfx-srv-error" }, [
      h("p", { class: "lfx-srv-error__t" }, T.error),
      h("button", { type: "button", class: "lfx-srv-btn", onclick: onRetry }, T.retry)
    ]);
  }

  // src/js/serverstats/api.js
  var FAIL = { ok: false, status: 0 };
  function createFetcher(get) {
    let ctrl = null;
    function abort() {
      if (ctrl) {
        try {
          ctrl.abort();
        } catch {
        }
        ctrl = null;
      }
    }
    function run(path, cb) {
      abort();
      const c = new AbortController();
      ctrl = c;
      let p;
      try {
        p = Promise.resolve(get(path, { signal: c.signal }));
      } catch {
        p = Promise.resolve(FAIL);
      }
      p.then(
        (r) => r && typeof r === "object" ? r : FAIL,
        () => FAIL
      ).then((r) => {
        if (c.signal.aborted) return;
        if (ctrl === c) ctrl = null;
        try {
          cb(r);
        } catch {
        }
      });
    }
    return { run, abort };
  }

  // src/js/serverstats/charts.js
  var pct = (v, max) => max > 0 ? Math.max(0, Math.min(100, v / max * 100)) : 0;
  function meter(frac, level, label) {
    const f = isNum(frac) ? Math.max(0, Math.min(1, frac)) : 0;
    return h(
      "span",
      {
        class: "lfx-srv-meter" + (level ? " is-" + level : ""),
        role: "meter",
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": Math.round(f * 100),
        "aria-label": label
      },
      [
        h("span", {
          class: "lfx-srv-meter__fill",
          style: { width: f * 100 + "%" }
        })
      ]
    );
  }
  function dayBars(days, topD) {
    const list = (Array.isArray(days) ? days : []).filter((d) => d && typeof d.d === "string");
    const max = list.reduce((a, d) => Math.max(a, pos0(d.secs)), 0);
    const wrap = h("div", {
      class: "lfx-srv-days",
      role: "img",
      "aria-label": "Schauzeit pro Tag"
    });
    for (const d of list) {
      const secs = pos0(d.secs);
      wrap.append(
        h(
          "span",
          {
            class: "lfx-srv-day" + (d.d === topD ? " is-top" : ""),
            title: `${fmtDayShort(d.d)}: ${fmtHm(secs)}`
          },
          [
            h("span", {
              class: "lfx-srv-day__fill",
              style: { height: pct(secs, max) + "%" }
            })
          ]
        )
      );
    }
    return wrap;
  }
  function heatmap(heat) {
    const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const e of Array.isArray(heat) ? heat : []) {
      if (!Array.isArray(e)) continue;
      const dow = Math.floor(e[0]);
      const hr = Math.floor(e[1]);
      if (!(dow >= 0 && dow <= 6 && hr >= 0 && hr <= 23)) continue;
      grid[(dow + 6) % 7][hr] += pos0(e[2]);
    }
    let max = 0;
    for (const r of grid) for (const v of r) max = Math.max(max, v);
    const LW = 18;
    const C = 13;
    const svg = s("svg", {
      class: "lfx-srv-heat",
      viewBox: `0 0 ${LW + 24 * C} ${7 * C + 12}`,
      role: "img",
      "aria-label": "Sto\xDFzeiten nach Wochentag und Uhrzeit",
      preserveAspectRatio: "xMidYMid meet"
    });
    const order = [1, 2, 3, 4, 5, 6, 0];
    grid.forEach((row, r) => {
      svg.append(s("text", { class: "lfx-srv-heat__l", x: 0, y: r * C + 10 }, WEEKDAYS[order[r]].replace(".", "")));
      row.forEach((v, hr) => {
        const rect = s(
          "rect",
          {
            class: "lfx-srv-heat__c" + (v > 0 ? "" : " is-0"),
            x: LW + hr * C,
            y: r * C,
            width: C - 1.5,
            height: C - 1.5,
            rx: 2
          },
          [s("title", {}, `${WEEKDAYS[order[r]]} ${hr} Uhr: ${fmtHm(v)}`)]
        );
        if (v > 0) rect.setAttribute("fill-opacity", (0.18 + 0.82 * (v / max)).toFixed(2));
        svg.append(rect);
      });
    });
    for (const hr of [0, 6, 12, 18])
      svg.append(s("text", { class: "lfx-srv-heat__l", x: LW + hr * C, y: 7 * C + 10 }, String(hr)));
    return svg;
  }
  function splitBar(parts) {
    const list = parts.filter((p) => pos0(p.value) > 0);
    const total = list.reduce((a, p) => a + p.value, 0);
    if (!total) return null;
    const bar = h("span", { class: "lfx-srv-split__bar" });
    const legend = h("ul", { class: "lfx-srv-split__legend" });
    list.forEach((p, i) => {
      bar.append(
        h("span", {
          class: "lfx-srv-split__seg c" + i,
          style: { flexGrow: String(p.value) }
        })
      );
      legend.append(
        h("li", {}, [
          h("i", { class: "lfx-srv-split__dot c" + i }),
          `${p.label} ${Math.round(p.value / total * 100) < 1 ? "< 1" : num(Math.round(p.value / total * 100))} %`
        ])
      );
    });
    return h("div", { class: "lfx-srv-split" }, [bar, legend]);
  }
  function trafficDays(days) {
    const list = (Array.isArray(days) ? days : []).filter((d) => d && typeof d.d === "string");
    if (!list.length) return null;
    const max = list.reduce((a, d) => Math.max(a, pos0(d.tx), pos0(d.rx)), 0);
    const wrap = h("div", {
      class: "lfx-srv-days is-traffic",
      role: "img",
      "aria-label": "Traffic pro Tag"
    });
    for (const d of list) {
      wrap.append(
        h(
          "span",
          {
            class: "lfx-srv-day",
            title: `${fmtDayShort(d.d)}: Up ${fmtBytes(pos0(d.tx))}, Down ${fmtBytes(pos0(d.rx))}`
          },
          [
            h("span", {
              class: "lfx-srv-day__fill is-up",
              style: { height: pct(pos0(d.tx), max) + "%" }
            }),
            h("span", {
              class: "lfx-srv-day__fill is-down",
              style: { height: pct(pos0(d.rx), max) + "%" }
            })
          ]
        )
      );
    }
    return wrap;
  }
  function trafficMonths(months) {
    const list = (Array.isArray(months) ? months : []).filter((m) => m && monthName(m.ym)).slice(-12).reverse();
    if (!list.length) return null;
    const max = list.reduce((a, m) => Math.max(a, pos0(m.tx) + pos0(m.rx)), 0);
    const ul = h("ul", { class: "lfx-srv-months" });
    for (const m of list) {
      ul.append(
        h("li", { class: "lfx-srv-months__row" }, [
          h("span", { class: "lfx-srv-months__l" }, monthName(m.ym)),
          h("span", { class: "lfx-srv-months__track" }, [
            h(
              "span",
              {
                class: "lfx-srv-months__fill",
                style: {
                  width: pct(pos0(m.tx) + pos0(m.rx), max) + "%"
                }
              },
              [
                h("span", {
                  class: "lfx-srv-months__up",
                  style: { flexGrow: String(pos0(m.tx)) }
                }),
                h("span", {
                  class: "lfx-srv-months__down",
                  style: { flexGrow: String(pos0(m.rx)) }
                })
              ]
            )
          ]),
          h("span", { class: "lfx-srv-months__v" }, `\u2191 ${fmtBytes(pos0(m.tx))} \xB7 \u2193 ${fmtBytes(pos0(m.rx))}`)
        ])
      );
    }
    return ul;
  }
  function legendUpDown() {
    return h("p", { class: "lfx-srv-split__legend lfx-srv-legend" }, [
      h("span", {}, [h("i", { class: "lfx-srv-split__dot c0" }), "Up"]),
      h("span", {}, [h("i", { class: "lfx-srv-split__dot c1" }), "Down"])
    ]);
  }

  // src/js/serverstats/tab-month.js
  function createMonthTab(deps, ctx) {
    const fetcher = createFetcher(deps.get);
    let maxM = isNum(deps.maxM) && deps.maxM > 0 ? Math.floor(deps.maxM) : 0;
    let m = 0;
    let fails = 0;
    let retryT = 0;
    let running = false;
    let inflight = false;
    const cache = /* @__PURE__ */ new Map();
    const prev = h(
      "button",
      {
        type: "button",
        class: "lfx-srv-nav",
        "aria-label": "Vorheriger Monat",
        onclick: () => go(m + 1)
      },
      "\u2039"
    );
    const next = h(
      "button",
      {
        type: "button",
        class: "lfx-srv-nav",
        "aria-label": "N\xE4chster Monat",
        onclick: () => go(m - 1)
      },
      "\u203A"
    );
    const label = h("span", { class: "lfx-srv-monthnav__l" }, "\u2026");
    const body = h("div", { class: "lfx-srv-month__body" });
    const el = h("div", { class: "lfx-srv-month" }, [h("div", { class: "lfx-srv-monthnav" }, [prev, label, next]), body]);
    function buttons() {
      prev.disabled = m >= maxM;
      next.disabled = m <= 0;
    }
    function kpi(l, v) {
      return h("div", { class: "lfx-srv-kpi" }, [
        h("span", { class: "lfx-srv-kpi__v" }, v),
        h("span", { class: "lfx-srv-kpi__l" }, l)
      ]);
    }
    function section(title, node) {
      return node ? h("section", { class: "lfx-srv-sec" }, [h("h3", { class: "lfx-srv-h" }, title), node]) : null;
    }
    function mixSection(d) {
      const mix = d && typeof d.mix === "object" && d.mix ? d.mix : {};
      const dev = mix.dev || {};
      const method = mix.method || {};
      const type = mix.type || {};
      const groups = [
        [
          "Ger\xE4te",
          [
            { label: "TV", value: dev.tv },
            { label: "Handy", value: dev.phone },
            { label: "Browser", value: dev.web },
            { label: "Sonstige", value: dev.other }
          ]
        ],
        [
          "Wiedergabe",
          [
            { label: "Direkt", value: method.direct },
            { label: "Umwandlung", value: method.transcode }
          ]
        ],
        [
          "Inhalte",
          [
            { label: "Filme", value: type.movie },
            { label: "Folgen", value: type.episode }
          ]
        ]
      ];
      const nodes = [];
      for (const [t, parts] of groups) {
        const sb = splitBar(parts);
        if (sb) nodes.push(h("div", { class: "lfx-srv-mixg" }, [h("span", { class: "lfx-srv-mixg__t" }, t), sb]));
      }
      return nodes.length ? h("div", {}, nodes) : null;
    }
    function render(d, stale) {
      clear(body);
      if (!d) return;
      const t = d.totals || {};
      const secs = pos0(t.secs);
      const ps = d.prev ? pos0(d.prev.secs) : 0;
      const elapsed = d.partial && Array.isArray(d.days) ? d.days.length : 0;
      const prevYm = d.prev && typeof d.prev.ym === "string" ? d.prev.ym : "";
      const prevDays = /^\d{4}-\d{2}$/.test(prevYm) ? new Date(Date.UTC(+prevYm.slice(0, 4), +prevYm.slice(5, 7), 0)).getUTCDate() : 0;
      const avg = elapsed > 0 && prevDays > 0;
      const delta = avg ? fmtDelta(secs / elapsed, ps / prevDays) : fmtDelta(secs, ps);
      const tx = d.tx && isNum(d.tx.tx) ? fmtBytes(d.tx.tx) : "\u2013";
      if (stale) body.append(note(T.downStale));
      if (d.partial) body.append(note("Der Monat l\xE4uft noch, die Werte wachsen weiter."));
      body.append(
        h("div", { class: "lfx-srv-kpis" }, [
          kpi("Schauzeit", fmtHm(secs)),
          kpi("Upload", tx),
          kpi(avg ? "Tagesschnitt gg\xFC. Vormonat" : "gg\xFC. Vormonat", delta),
          kpi("Aktive Konten", isNum(t.users) ? num(t.users) : "\u2013")
        ])
      );
      const days = Array.isArray(d.days) ? d.days : [];
      if (days.length) {
        const top = d.top && typeof d.top.d === "string" ? d.top : null;
        const wrap = h("div", {}, [dayBars(days, top && top.d)]);
        if (top) wrap.append(h("p", { class: "lfx-srv-note" }, `Rekordtag: ${fmtDayShort(top.d)} \xB7 ${fmtHm(top.secs)}`));
        body.append(section("Schauzeit pro Tag", wrap));
      }
      if (Array.isArray(d.heat) && d.heat.length) body.append(section("Sto\xDFzeiten", heatmap(d.heat)));
      body.append(section("Mix", mixSection(d)));
    }
    function show(d, stale) {
      const name = d ? monthName(d.ym) : "";
      label.textContent = name || "\u2026";
      buttons();
      render(d, stale);
      if (name) ctx.say(name);
    }
    function load() {
      clearTimeout(retryT);
      buttons();
      const want = m;
      if (cache.has(want)) {
        show(cache.get(want), false);
        return;
      }
      label.textContent = "\u2026";
      clear(body).append(h("p", { class: "lfx-srv-note" }, T.loading));
      inflight = true;
      fetcher.run("/srv/month?m=" + want, (r) => {
        inflight = false;
        if (!running || want !== m) return;
        const d = r && r.ok && r.data && typeof r.data === "object" ? r.data : null;
        if (d && !d.error) {
          fails = 0;
          if (isNum(d.maxM)) maxM = Math.max(0, Math.floor(d.maxM));
          if (!d.stale) cache.set(want, d);
          show(d, !!d.stale);
          return;
        }
        if (r && r.status === 503) {
          fails = 0;
          label.textContent = "\u2026";
          clear(body).append(note(T.down));
          return;
        }
        if (++fails < 2) {
          retryT = setTimeout(load, 3e3);
          return;
        }
        clear(body).append(
          errorBox(() => {
            fails = 0;
            load();
          })
        );
        ctx.say(T.error);
      });
    }
    function go(to) {
      const n = Math.max(0, Math.min(maxM, to));
      if (n === m) return;
      m = n;
      fails = 0;
      if (running) load();
    }
    function stop() {
      running = false;
      inflight = false;
      clearTimeout(retryT);
      fetcher.abort();
    }
    buttons();
    return {
      el,
      stop,
      dispose: stop,
      start() {
        if (running) return;
        running = true;
        if (!inflight) load();
      }
    };
  }

  // src/js/serverstats/tab-now.js
  var POLL = 1e4;
  var DEV = { tv: "TV", phone: "Handy", web: "Browser" };
  var back = (n) => Math.min(6e4, POLL * Math.pow(2, n));
  function createNowTab(deps, ctx) {
    const fetcher = createFetcher(deps.get);
    const head = h("p", { class: "lfx-srv-now__head" });
    const hint = h("p", { class: "lfx-srv-note", hidden: true }, T.down);
    const list = h("ul", { class: "lfx-srv-list" });
    const errHost = h("div", { hidden: true });
    const el = h("div", { class: "lfx-srv-now" }, [head, hint, list, errHost]);
    let running = false;
    let loaded = false;
    let down = false;
    let err = false;
    let fails = 0;
    let downN = 0;
    let data = { n: 0, mbps: null, rows: [] };
    let timer = 0;
    let tick = 0;
    let live = [];
    function stopTick() {
      if (tick) clearInterval(tick);
      tick = 0;
    }
    function onTick() {
      const now = Date.now();
      for (const it of live) {
        const pos = Math.min(it.dur, it.pos + (now - it.t0) / 1e3);
        it.time.textContent = `${fmtClock(pos, it.dur >= 3600)} / ${fmtClock(it.dur, it.dur >= 3600)}`;
        it.fill.style.width = pos / it.dur * 100 + "%";
      }
    }
    function meta(r) {
      const bits = [];
      if (r.paused)
        bits.push(
          h(
            "span",
            {
              class: "lfx-srv-pause",
              role: "img",
              "aria-label": "Pausiert"
            },
            "\u275A\u275A"
          )
        );
      bits.push(h("span", { class: "lfx-srv-chip" + (r.tc ? " is-tc" : "") }, r.tc ? "Umwandlung" : "Direkt"));
      const mb = fmtMbps(r.mbps);
      if (mb) bits.push(h("span", { class: "lfx-srv-chip" }, mb));
      if (DEV[r.dev]) bits.push(h("span", { class: "lfx-srv-chip" }, DEV[r.dev]));
      return h("span", { class: "lfx-srv-row__meta" }, bits);
    }
    function bar(frac) {
      const fill = h("span", {
        class: "lfx-srv-bar__fill",
        style: { width: Math.max(0, Math.min(1, frac)) * 100 + "%" }
      });
      return { fill, el: h("span", { class: "lfx-srv-bar" }, fill) };
    }
    function rowEl(r) {
      if (!r || typeof r !== "object") return null;
      if (r.hidden) {
        const p = isNum(r.p) ? r.p : 0;
        return h(
          "li",
          {},
          h("div", { class: "lfx-srv-row is-hidden" }, [
            h("span", { class: "lfx-srv-row__cover is-empty" }),
            h("span", { class: "lfx-srv-row__main" }, [
              h("span", { class: "lfx-srv-row__title" }, "Verborgener Titel"),
              bar(p).el,
              meta(r)
            ])
          ])
        );
      }
      const title = typeof r.title === "string" && r.title ? r.title : "Unbekannter Titel";
      const sub = r.t === "episode" ? [isNum(r.s) ? "S" + r.s : "", isNum(r.e) ? "F" + r.e : "", r.ep || ""].filter(Boolean).join(" \xB7 ") : "";
      const dur = isNum(r.dur) && r.dur > 0 ? r.dur : 0;
      const pos = isNum(r.pos) && r.pos > 0 ? Math.min(r.pos, dur || r.pos) : 0;
      const src = r.img && deps.img ? deps.img(r.img.id, r.img.tag, 96) : null;
      const b = dur ? bar(pos / dur) : null;
      const time = dur ? h("span", { class: "lfx-srv-row__time" }, `${fmtClock(pos, dur >= 3600)} / ${fmtClock(dur, dur >= 3600)}`) : null;
      if (dur && !r.paused) live.push({ fill: b.fill, time, pos, dur, t0: Date.now() });
      const label = [title, sub, r.paused ? "pausiert" : "l\xE4uft", r.me ? "deine Wiedergabe" : "", "Details \xF6ffnen"].filter(Boolean).join(", ");
      return h(
        "li",
        {},
        h(
          "button",
          {
            type: "button",
            class: "lfx-srv-row",
            "aria-label": label,
            onclick: () => r.id != null && deps.openItem(r.id)
          },
          [
            src ? h("img", {
              class: "lfx-srv-row__cover",
              src,
              alt: "",
              decoding: "async",
              loading: "lazy"
            }) : h("span", { class: "lfx-srv-row__cover is-empty" }),
            h("span", { class: "lfx-srv-row__main" }, [
              h("span", { class: "lfx-srv-row__title" }, [
                title,
                r.me ? h("span", { class: "lfx-srv-badge" }, "Du") : null
              ]),
              sub ? h("span", { class: "lfx-srv-row__sub" }, sub) : null,
              b ? b.el : null,
              time,
              meta(r)
            ])
          ]
        )
      );
    }
    function render() {
      stopTick();
      live = [];
      clear(list);
      clear(errHost);
      errHost.hidden = !err;
      hint.hidden = !down;
      if (err) {
        head.textContent = "";
        list.hidden = true;
        errHost.append(errorBox(retry));
        return;
      }
      list.hidden = false;
      if (!loaded) {
        head.textContent = down ? "" : T.loading;
        return;
      }
      const rows = data.rows;
      const n = isNum(data.n) ? data.n : rows.length;
      const mb = fmtMbps(data.mbps);
      head.textContent = n > 0 ? `${n === 1 ? "1 l\xE4uft" : num(n) + " laufen"} gerade${mb ? " \xB7 " + mb : ""}` : T.idle;
      for (const r of rows) {
        const li = rowEl(r);
        if (li) list.append(li);
      }
      if (live.length && running) tick = setInterval(onTick, 1e3);
    }
    function schedule(delay) {
      clearTimeout(timer);
      timer = setTimeout(poll, delay);
    }
    function onRes(r) {
      if (!running) return;
      const d = r && r.ok ? r.data : null;
      let delay = POLL;
      const wasErr = err;
      if (d && typeof d === "object" && d.down) {
        down = true;
        fails = 0;
        err = false;
        delay = back(++downN);
      } else if (d && typeof d === "object") {
        down = false;
        err = false;
        fails = 0;
        downN = 0;
        loaded = true;
        data = {
          n: d.n,
          mbps: d.mbps,
          rows: Array.isArray(d.rows) ? d.rows : []
        };
      } else if (r && r.status === 429) {
        delay = 3e4;
      } else {
        fails++;
        delay = back(fails);
        if (fails >= 2) err = true;
      }
      if (err && !wasErr) ctx.say(T.error);
      render();
      schedule(delay);
    }
    function poll() {
      if (!running) return;
      fetcher.run("/srv/now", onRes);
    }
    function retry() {
      fails = 0;
      err = false;
      loaded = false;
      render();
      clearTimeout(timer);
      poll();
    }
    function stop() {
      running = false;
      clearTimeout(timer);
      fetcher.abort();
      stopTick();
    }
    render();
    return {
      el,
      stop,
      dispose: stop,
      start() {
        if (running) return;
        running = true;
        render();
        poll();
      }
    };
  }

  // src/js/serverstats/tab-server.js
  var REFRESH = 6e4;
  function createServerTab(deps, ctx) {
    const fetcher = createFetcher(deps.get);
    const el = h("div", { class: "lfx-srv-server" });
    let running = false;
    let loadedAt = 0;
    let fails = 0;
    let retryT = 0;
    const sec = (title, kids) => {
      const list = [].concat(kids).filter(Boolean);
      return list.length ? h("section", { class: "lfx-srv-sec" }, [h("h3", { class: "lfx-srv-h" }, title), ...list]) : null;
    };
    const line = (l, v, extra) => h("div", { class: "lfx-srv-line" }, [
      h("span", { class: "lfx-srv-line__l" }, l),
      h("span", { class: "lfx-srv-line__v" }, v),
      extra || null
    ]);
    const gauge = (l, v, frac, level) => h("div", { class: "lfx-srv-gauge" }, [
      h("div", { class: "lfx-srv-line" }, [
        h("span", { class: "lfx-srv-line__l" }, l),
        h("span", { class: "lfx-srv-line__v" }, v)
      ]),
      meter(frac, level, l)
    ]);
    function health(hl) {
      if (!hl || typeof hl !== "object") return null;
      const kids = [];
      if (hl.stale) kids.push(note(`Letzte Meldung des Servers vor ${fmtAgo(hl.ageS)}`));
      if (isNum(hl.tempC))
        kids.push(
          gauge(
            "Temperatur",
            `${num(hl.tempC, 0)} \xB0C`,
            hl.tempC / 100,
            hl.tempC >= 80 ? "hot" : hl.tempC >= 70 ? "warn" : ""
          )
        );
      if (isNum(hl.cpuPct)) kids.push(gauge("CPU", `${num(hl.cpuPct, 0)} %`, hl.cpuPct / 100, ""));
      const mem = hl.mem;
      if (mem && mem.total > 0 && isNum(mem.avail)) {
        const used = Math.max(0, mem.total - mem.avail);
        kids.push(gauge("Arbeitsspeicher", `${fmtBytes(used, 1)} von ${fmtBytes(mem.total, 1)}`, used / mem.total, ""));
      }
      const up = fmtUptime(hl.uptimeS);
      if (up) kids.push(line("Laufzeit", up));
      return sec("Zustand", kids);
    }
    function disks(d) {
      const list = d && Array.isArray(d.list) ? d.list.filter((x) => x && x.size > 0) : [];
      return sec(
        "Speicherplatz",
        list.map(
          (x) => h("div", { class: "lfx-srv-gauge" }, [
            h("div", { class: "lfx-srv-line" }, [
              h("span", { class: "lfx-srv-line__l" }, String(x.l || "Platte")),
              h("span", { class: "lfx-srv-line__v" }, `${fmtBytes(pos0(x.used), 1)} von ${fmtBytes(x.size, 1)} belegt`)
            ]),
            meter(
              pos0(x.used) / x.size,
              x.used / x.size >= 0.9 ? "hot" : x.used / x.size >= 0.8 ? "warn" : "",
              String(x.l || "Platte")
            )
          ])
        )
      );
    }
    function traffic(t) {
      if (!t || typeof t !== "object") return null;
      const days = Array.isArray(t.days) ? t.days.filter((d) => d && typeof d.d === "string") : [];
      const ym = days.length ? days[days.length - 1].d.slice(0, 7) : "";
      const cur = days.filter((d) => d.d.startsWith(ym));
      const kids = [];
      if (cur.length) kids.push(h("p", { class: "lfx-srv-sub" }, monthName(ym)), trafficDays(cur));
      const months = trafficMonths(t.months);
      if (months) kids.push(h("p", { class: "lfx-srv-sub" }, "Letzte 12 Monate"), months);
      if (kids.length) kids.unshift(legendUpDown());
      return sec("Traffic", kids);
    }
    function library(l) {
      if (!l || typeof l !== "object") return null;
      const kids = [];
      if (isNum(l.movies) && isNum(l.series) && isNum(l.episodes))
        kids.push(
          h(
            "p",
            { class: "lfx-srv-p" },
            `${plural(l.movies, "Film", "Filme")} \xB7 ${num(l.series)} ${l.series === 1 ? "Serie" : "Serien"} \xB7 ${plural(l.episodes, "Folge", "Folgen")}`
          )
        );
      if (isNum(l.runtimeS) && l.runtimeS > 0)
        kids.push(line("Alles am St\xFCck", plural(Math.round(l.runtimeS / 86400), "Tag", "Tage")));
      const cap = (n, one, many) => l.newCapped && n >= 600 ? `600+ ${many}` : plural(n, one, many);
      if (isNum(l.newMovies) && isNum(l.newEpisodes)) {
        const mn = monthName(l.ym, true);
        kids.push(
          line(
            mn ? `Neu im ${mn}` : "Neu",
            `${cap(l.newMovies, "Film", "Filme")} \xB7 ${cap(l.newEpisodes, "Folge", "Folgen")}`
          )
        );
      }
      return sec("Bibliothek", kids);
    }
    function records(r) {
      if (!r || typeof r !== "object") return null;
      const kids = [];
      if (r.day && r.day.secs > 0) kids.push(line("Rekordtag", `${fmtHm(r.day.secs)} \xB7 ${fmtDate(r.day.d)}`));
      if (r.month && r.month.secs > 0)
        kids.push(line("Rekordmonat", `${fmtHm(r.month.secs)} \xB7 ${monthName(r.month.ym)}`));
      if (r.conc && r.conc.n > 0)
        kids.push(line("Meiste gleichzeitig", `${plural(r.conc.n, "Stream", "Streams")} \xB7 ${fmtDate(r.conc.date)}`));
      if (r.binge && r.binge.n > 0)
        kids.push(
          line(
            "L\xE4ngster Serien-Marathon",
            `${plural(r.binge.n, "Folge", "Folgen")} an einem Tag \xB7 ${fmtDate(r.binge.date)}`
          )
        );
      if (r.tx && r.tx.bytes > 0) kids.push(line("Upload-Rekord", `${fmtBytes(r.tx.bytes)} \xB7 ${monthName(r.tx.ym)}`));
      if (kids.length && r.approx) kids.push(note("\xC4ltere Werte sind N\xE4herungen."));
      return sec("Rekorde", kids);
    }
    function render(d) {
      clear(el);
      const parts = [health(d.health), disks(d.disks), traffic(d.traffic), library(d.library), records(d.records)].filter(
        Boolean
      );
      if (parts.length) el.append(...parts);
      else el.append(note(T.noData));
    }
    function load() {
      clearTimeout(retryT);
      if (!loadedAt) clear(el).append(note(T.loading));
      fetcher.run("/srv/server", (r) => {
        if (!running) return;
        const d = r && r.ok && r.data && typeof r.data === "object" ? r.data : null;
        if (d) {
          fails = 0;
          loadedAt = Date.now();
          render(d);
          return;
        }
        if (loadedAt) return;
        if (++fails < 2) {
          retryT = setTimeout(load, 3e3);
          return;
        }
        clear(el).append(
          errorBox(() => {
            fails = 0;
            load();
          })
        );
        ctx.say(T.error);
      });
    }
    function stop() {
      running = false;
      clearTimeout(retryT);
      fetcher.abort();
    }
    return {
      el,
      stop,
      dispose: stop,
      start() {
        if (running) return;
        running = true;
        if (!loadedAt || Date.now() - loadedAt > REFRESH) load();
      }
    };
  }

  // src/js/serverstats/app.js
  var DEFS = {
    now: ["Jetzt", createNowTab],
    month: ["Monat", createMonthTab],
    server: ["Server", createServerTab]
  };
  var ORDER = ["now", "month", "server"];
  var uid = 0;
  function create(deps) {
    const d = deps && typeof deps === "object" ? deps : {};
    const given = Array.isArray(d.tabs) ? d.tabs : [];
    let ids = ORDER.filter((id) => given.includes(id));
    if (!ids.length) ids = ["now"];
    const base = "lfx-srv-" + ++uid;
    const status = h("p", {
      class: "lfx-srv__sr",
      role: "status",
      "aria-live": "polite"
    });
    let lastSay = "";
    const ctx = {
      say(t) {
        if (t && t !== lastSay) status.textContent = t;
        lastSay = t;
      }
    };
    const bar = h("div", {
      class: "lfx-srv__tabs",
      role: "tablist",
      "aria-label": "Server-Statistik"
    });
    const panels = h("div", { class: "lfx-srv__panels" });
    const el = h("div", { class: "lfx-srv" }, [bar, panels, status]);
    const tabs = {};
    let active = "";
    let disposed = false;
    function tabOf(id) {
      if (!tabs[id]) {
        const t = DEFS[id][1](d, ctx);
        t.panel = h(
          "div",
          {
            class: "lfx-srv__panel",
            role: "tabpanel",
            id: `${base}-p-${id}`,
            "aria-labelledby": `${base}-t-${id}`,
            hidden: true
          },
          t.el
        );
        panels.append(t.panel);
        tabs[id] = t;
      }
      return tabs[id];
    }
    function select(id, focus) {
      if (disposed) return;
      if (active && tabs[active]) {
        tabs[active].stop();
        tabs[active].panel.hidden = true;
      }
      active = id;
      for (const b of bar.children) {
        const on = b.dataset.id === id;
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
        b.classList.toggle("is-on", on);
        if (on && focus) b.focus();
      }
      const t = tabOf(id);
      t.panel.hidden = false;
      if (!document.hidden) t.start();
    }
    function onKey(e) {
      const i = ids.indexOf(active);
      let n = -1;
      if (e.key === "ArrowRight") n = (i + 1) % ids.length;
      else if (e.key === "ArrowLeft") n = (i - 1 + ids.length) % ids.length;
      else if (e.key === "Home") n = 0;
      else if (e.key === "End") n = ids.length - 1;
      if (n < 0) return;
      e.preventDefault();
      select(ids[n], true);
    }
    bar.addEventListener("keydown", onKey);
    for (const id of ids) {
      bar.append(
        h(
          "button",
          {
            type: "button",
            class: "lfx-srv__tab",
            role: "tab",
            id: `${base}-t-${id}`,
            "aria-controls": `${base}-p-${id}`,
            "aria-selected": "false",
            tabindex: "-1",
            "data-id": id,
            onclick: () => select(id)
          },
          DEFS[id][0]
        )
      );
    }
    function onVis() {
      const t = tabs[active];
      if (disposed || !t) return;
      if (document.hidden) t.stop();
      else t.start();
    }
    document.addEventListener("visibilitychange", onVis);
    select(ids[0]);
    return {
      el,
      dispose() {
        if (disposed) return;
        disposed = true;
        document.removeEventListener("visibilitychange", onVis);
        bar.removeEventListener("keydown", onKey);
        for (const id of Object.keys(tabs)) {
          try {
            tabs[id].dispose();
          } catch {
          }
        }
      }
    };
  }

  // src/js/serverstats/entry.js
  window.LenzFlixServerStats = { version: 1, mark: "__LFX_SRVSTATS_UI__", create };
})();
