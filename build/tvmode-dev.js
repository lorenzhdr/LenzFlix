// Dev-Harness des TV-Modus (docs/tvmode.md, Welle W3): Fake-Katalog (aus build/live-dev.js kopiert, deterministisch) + create() der Engine
// (dist/lenztvmode.js) ohne Jellyfin und ohne Netzwerk. HTML: build/tvmode-dev.html (lädt CSS/JS je nach design/min).
//
// Parameter:
//   design=flix|plus|prime   Klasse lfx-theme-<id> + Design-CSS (lenzplus/lenzprime)    phone=1   Handy-Layout (opts.phone + opts.touch, Kopfleiste 56 px)
//   landscape=1              nur Hinweis für Skripte (Viewport quer per Emulation setzen; keine Wirkung im Harness)
//   now=<ISO>                Testuhr (Standard: Fr 2026-11-13T20:30+01:00; ohne Zone = lokale Zeit)
//   channel=N                opts.lastChannel (Standard 1)   min=1  .min-Dateien   chrome=0  Kopfleisten-/Tabbar-Attrappe aus (Standard an)
//   autostart=0              kein instance.start() nach onReady   real=1  kein fakePlayer (Standard fakePlayer)   debug=1  window.__lfxTvm
//   tab=now|epg              Klick auf .lfx-tvm__tab--now|--epg (Handy)   info=1  Info-Karte einer künftigen Sendung (Klick auf EPG-Zelle, am Handy nach Tab Programm)
//   img=0                    imageUrl → null (Platzhalter testen)   muted=1  opts.muted
//   state=playing|loading|pause|closedown|error|gesture|tap|muted   Zustand erzwingen (siehe unten)
//
// Zustände erzwingen (state=… schaltet debug automatisch ein):
//   muted     → opts.muted = true (Nutzer-Stumm; mutedByPolicy braucht einen Hook).
//   closedown → now = Sa 03:30 MEZ (falls now fehlt), danach Sender 1..18 per ctl.tune(immediate) durchschalten, bis snap.phase === 'closedown'.
//   pause     → gleiches Durchschalten bis snap.phase === 'pause' (ggf. now= anpassen).
//   error     → bevorzugt Hook debugCard('error'); fehlt er, läuft der echte Player (fakePlayer aus) gegen about:blank → Fehlerkarte.
//   gesture/tap → nur per Hook debugCard('tap'); ohne Hook bleibt der Zustand unverändert (Warnung in der Konsole).
// ERWARTETE Hooks von E (optional): window.__lfxTvm = { ctl, model, state } laut Vertrag (debug:true). Wunsch: window.__lfxTvm.debugCard(kind) oder
//   ctl.debugCard(kind) mit kind 'pause'|'closedown'|'error'|'tap'|'muted' (erzwingt die Karte/mutedByPolicy). Ohne ihn gelten die Fallbacks oben.
// Marker: html[data-tvm-dev-ready="1"] nach onReady + start + Zustand + zwei rAF; Fehler → html[data-tvm-dev-error].
(function () {
  var q = new URLSearchParams(location.search);
  var $ = function (id) { return document.getElementById(id); };

  // --- Zufall ---
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rand = rng(11112026);
  var pick = function (arr) { return arr[Math.floor(rand() * arr.length)]; };
  var int = function (a, b) { return a + Math.floor(rand() * (b - a + 1)); };

  // --- Fake-Katalog ---
  var A = ['Nacht', 'Schatten', 'Sommer', 'Zeit', 'Stern', 'Eis', 'Feuer', 'Wolken', 'Straße', 'Insel', 'Berg', 'Meer', 'Stadt', 'Traum', 'Wüste', 'Kometen', 'Turbo', 'Piraten', 'Geister', 'Silber', 'Mond', 'Glas', 'Nebel', 'Honig'];
  var B = ['jäger', 'fahrt', 'zug', 'spiel', 'bote', 'kampf', 'reise', 'lied', 'tanz', 'wächter', 'geheimnis', 'rennen', 'ritt', 'wende', 'fieber', 'stadt'];
  var SUFFIX = ['II', 'Reloaded', 'Die Rückkehr', 'Der Anfang', '3', 'Finale'];
  var GENRES = ['Action', 'Komödie', 'Drama', 'Thriller', 'Horror', 'Science-Fiction', 'Krimi', 'Abenteuer', 'Fantasy', 'Dokumentation', 'Animation', 'Familie', 'Romantik', 'Western', 'Musik'];
  var RATINGS = ['FSK-0', 'FSK-6', 'FSK-12', 'FSK-12', 'FSK-16', 'FSK-16', 'FSK-18', 'R', 'TV-MA', ''];
  var NOW0 = Date.parse('2026-11-11T12:00:00Z');
  var DAY = 86400000;
  var TICKS_MIN = 600000000;
  var used = {};
  function title() {
    var n;
    do { n = pick(A) + pick(B); } while (used[n] && rand() < 0.9);
    used[n] = 1;
    return n + (rand() > 0.85 ? ' ' + pick(SUFFIX) : '');
  }
  function genres() {
    var g = [pick(GENRES)];
    if (rand() > 0.5) { var g2 = pick(GENRES); if (g2 !== g[0]) g.push(g2); }
    return g;
  }
  function created() {
    var d = rand() < 0.04 ? rand() * 10 : rand() * 400;
    return new Date(NOW0 - Math.floor(d * DAY)).toISOString();
  }

  var catalog = { movies: [], series: [], episodes: [], boxsets: [], loadedAt: NOW0 };
  var movieIds = [];
  for (var i = 0; i < 420; i++) {
    var year = int(1950, 2026);
    var m = {
      Id: 'm' + i, Name: title(), RunTimeTicks: int(75, 180) * TICKS_MIN, Genres: genres(), OfficialRating: pick(RATINGS),
      ProductionYear: year, PremiereDate: new Date(Date.UTC(year, int(0, 11), int(1, 28))).toISOString(),
      DateCreated: created(), LocalTrailerCount: rand() < 0.3 ? 1 : 0,
    };
    catalog.movies.push(m);
    movieIds.push(m.Id);
  }
  for (var s = 0; s < 60; s++) {
    var sid = 's' + s;
    var sname = title();
    var sr = pick(RATINGS);
    var sg = genres();
    var sy = int(1970, 2025);
    catalog.series.push({ Id: sid, Name: sname, Genres: sg, OfficialRating: sr, ProductionYear: sy, DateCreated: created() });
    var total = int(6, 40);
    var seasons = Math.min(int(1, 4), total);
    var runtime = int(22, 60) * TICKS_MIN;
    var perSeason = Math.ceil(total / seasons);
    var n = 0;
    for (var se = 1; se <= seasons && n < total; se++) {
      for (var e = 1; e <= perSeason && n < total; e++, n++) {
        var ep = {
          Id: 'e' + s + '_' + n, Name: 'Folge ' + (n + 1) + ': ' + pick(A) + pick(B), SeriesId: sid, SeriesName: sname,
          ParentIndexNumber: se, RunTimeTicks: runtime + int(-2, 2) * TICKS_MIN, DateCreated: created(), OfficialRating: sr,
          PremiereDate: new Date(Date.UTC(sy + se - 1, int(0, 11), int(1, 28))).toISOString(),
        };
        if (rand() > 0.04) ep.IndexNumber = e; // einige ohne IndexNumber
        catalog.episodes.push(ep);
      }
    }
    if (s % 9 === 0) { // ein paar Staffel-0-Specials
      for (var sp = 1; sp <= int(1, 3); sp++) {
        catalog.episodes.push({
          Id: 'e' + s + '_sp' + sp, Name: 'Special ' + sp, SeriesId: sid, SeriesName: sname, ParentIndexNumber: 0, IndexNumber: sp,
          RunTimeTicks: int(10, 45) * TICKS_MIN, DateCreated: created(), OfficialRating: sr,
        });
      }
    }
  }
  var boxMap = {}; // boxsetId → Filmids
  var pool = movieIds.slice();
  for (var b = 0; b < 20; b++) {
    var cnt = int(2, 6);
    var members = [];
    for (var k = 0; k < cnt && pool.length; k++) members.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    var byId = {};
    catalog.movies.forEach(function (mm) { byId[mm.Id] = mm; });
    members.sort(function (x, y) { return byId[x].ProductionYear - byId[y].ProductionYear; });
    var bid = 'b' + b;
    boxMap[bid] = members;
    catalog.boxsets.push({ Id: bid, Name: pick(A) + pick(B) + '-Saga', ChildCount: members.length });
  }

  // --- Toast ---
  var toastTimer = 0;
  function toast(text) {
    var el = $('dev-toast');
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.display = 'none'; }, 2600);
    console.info('[tvmode-dev] toast:', text);
  }

  // --- Szenenbild-Platzhalter (SVG-data-URL je Id, gecacht) ---
  var covers = {};
  function cover(id) {
    if (covers[id]) return covers[id];
    var h = 0;
    for (var j = 0; j < id.length; j++) h = (h * 31 + id.charCodeAt(j)) % 360;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(' + h + ',55%,42%)"/><stop offset="1" stop-color="hsl(' + ((h + 50) % 360) + ',60%,18%)"/></linearGradient></defs>' +
      '<rect width="480" height="270" fill="url(#g)"/><circle cx="360" cy="80" r="40" fill="rgba(255,255,255,.18)"/>' +
      '<path d="M0 270 L120 150 L220 230 L320 140 L480 270Z" fill="rgba(0,0,0,.35)"/>' +
      '<text x="20" y="250" font-family="sans-serif" font-size="22" fill="rgba(255,255,255,.85)">' + id + '</text></svg>';
    covers[id] = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    return covers[id];
  }

  // --- Query ---
  function parseChannels(str) {
    var out = {};
    (str || '').split(';').forEach(function (part) {
      var p = part.split('=');
      var no = Number(p[0]);
      if (no && p[1]) out[no] = p.slice(1).join('=').trim();
    });
    return out;
  }
  var phone = q.get('phone') === '1';
  var state = q.get('state') || '';
  var DEFAULT_NOW = '2026-11-13T20:30:00+01:00'; // Freitag 20:30 MEZ
  var nowParam = q.get('now') || (state === 'closedown' ? '2026-11-14T03:30:00+01:00' : DEFAULT_NOW);
  var startNow = Date.parse(nowParam);
  if (isNaN(startNow)) startNow = Date.parse(DEFAULT_NOW);
  var t0 = performance.now();
  var nowFn = function () { return startNow + (performance.now() - t0); };

  var prefs = {};
  var played = [];
  var requests = [];
  window.__tvmDev = { played: played, requests: requests, catalog: catalog, boxMap: boxMap, toast: toast };

  var OVERVIEWS = [
    'Eine Geschichte voller Wendungen, erzählt in ruhigen Bildern. Beispieltext aus dem Dev-Harness.',
    'Platzhaltertext für die Inhaltsangabe dieses Titels. Er enthält keine echten Inhalte und dient nur der Ansicht.',
    'Zwei Welten treffen aufeinander, und nichts bleibt, wie es war. Dies ist ein erfundener Beispieltext.',
  ];
  var deps = {
    catalog: catalog,
    user: { id: 'dev-user', name: 'Testnutzer', isAdmin: false, audioLang: 'ger', subLang: 'ger', subMode: 'Default' },
    server: { deviceId: 'dev' },
    request: function (method, path) {
      requests.push({ method: method, path: path });
      return Promise.resolve(null);
    },
    streamUrl: function () { return 'about:blank#'; },
    imageUrl: function (id) { return q.get('img') === '0' ? null : cover(String(id)); },
    getBoxSetItems: function (id) { return Promise.resolve((boxMap[id] || []).slice()); },
    loadTrailer: function () { return Promise.resolve(null); },
    setPlayed: function (id) { console.info('[tvmode-dev] setPlayed', id); played.push(id); return Promise.resolve(); },
    channelConfig: parseChannels(q.get('channels')),
    itemDetails: function (ids) {
      var out = new Map();
      (ids || []).forEach(function (id, i) { out.set(id, { overview: OVERVIEWS[i % OVERVIEWS.length] }); });
      requests.push({ method: 'GET', path: '/Items?Ids=' + (ids || []).length + ' Stück' });
      return new Promise(function (r) { setTimeout(function () { r(out); }, 300); });
    },
    savePrefs: function (partial) { Object.keys(partial || {}).forEach(function (k) { prefs[k] = partial[k]; }); },
    openDetails: function (id) { console.info('[tvmode-dev] openDetails', id); toast('Details: ' + id); },
    playFromStart: function (id) { console.info('[tvmode-dev] playFromStart', id); toast('Von vorne: ' + id); },
    keysBlocked: function () { return false; },
    toast: toast,
    onProgress: function (f, label) {
      $('dev-load-text').textContent = (label || 'Sendersuchlauf …') + ' ' + Math.round((f || 0) * 100) + ' %';
      $('dev-load-bar').style.width = Math.round((f || 0) * 100) + '%';
    },
    onReady: function () {
      var l = $('dev-load');
      if (l) l.remove();
      host.classList.remove('is-loading');
      automate();
    },
    onFatal: function (err) { fail(err); },
    onStopped: function (o) { console.info('[tvmode-dev] onStopped', o && o.reason); },
    onPip: function (a) { console.info('[tvmode-dev] onPip', a); },
  };

  function fail(err) {
    var l = $('dev-load');
    if (l) l.remove();
    var f = $('dev-fatal');
    var msg = 'Fehler: ' + (err && err.message ? err.message : String(err));
    f.textContent = msg;
    f.style.display = 'flex';
    document.documentElement.dataset.tvmDevError = msg;
  }

  var forced = ['pause', 'closedown', 'error', 'gesture', 'tap'].indexOf(state) >= 0;
  var opts = {
    video: null,
    lastChannel: Number(q.get('channel')) || 1,
    volume: 0.5,
    muted: q.get('muted') === '1' || state === 'muted',
    phone: phone,
    touch: phone,
    now: nowFn,
    fakePlayer: q.get('real') === '1' ? false : (state === 'error' ? false : true),
    debug: q.get('debug') === '1' || forced,
  };
  if (opts.debug) window.__lfxTvmDebug = true;

  // --- Automatisierung (Screenshots) ---
  var host = $('lfx-tvm');
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var raf2 = function () { return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); }); };
  var inst = null;

  function snap() {
    var d = window.__lfxTvm;
    return d && d.ctl && typeof d.ctl.state === 'function' ? d.ctl.state() : null;
  }
  // Sender 1..18 durchschalten, bis die Phase passt (Fallback ohne debugCard).
  function scan(phase) {
    var d = window.__lfxTvm;
    if (!d || !d.ctl) { console.warn('[tvmode-dev] kein window.__lfxTvm – state=' + state + ' nicht erzwingbar'); return Promise.resolve(); }
    var p = Promise.resolve();
    var found = false;
    var s0 = snap();
    if (s0 && s0.phase === phase) return Promise.resolve();
    for (var no = 1; no <= 18; no++) {
      (function (n) {
        p = p.then(function () {
          if (found) return null;
          d.ctl.tune(n, { immediate: true });
          return wait(350).then(function () { var s = snap(); if (s && s.phase === phase) found = true; });
        });
      })(no);
    }
    return p.then(function () { if (!found) console.warn('[tvmode-dev] kein Sender mit Phase ' + phase + ' zur Zeit ' + new Date(nowFn()).toISOString()); });
  }
  function forceState() {
    var d = window.__lfxTvm;
    var hook = d && (d.debugCard || (d.ctl && d.ctl.debugCard));
    if (hook && ['pause', 'closedown', 'error', 'gesture', 'tap', 'muted'].indexOf(state) >= 0) {
      hook.call(d.debugCard ? d : d.ctl, state === 'gesture' ? 'tap' : state);
      return wait(300);
    }
    if (state === 'pause' || state === 'closedown') return scan(state);
    if (state === 'error' && !hook) return wait(1500); // real=1 gegen about:blank → Fehlerkarte
    if (state === 'tap' || state === 'gesture') console.warn('[tvmode-dev] state=tap braucht den Hook debugCard');
    return Promise.resolve();
  }
  function clickSel(sel) {
    var el = host.querySelector(sel);
    if (!el) { console.warn('[tvmode-dev] nicht gefunden:', sel); return false; }
    el.click();
    return true;
  }
  function automate() {
    var finish = function () { raf2().then(function () { document.documentElement.dataset.tvmDevReady = '1'; }); };
    var steps = Promise.resolve();
    if (q.get('autostart') !== '0' && inst && typeof inst.start === 'function') {
      steps = steps.then(function () { inst.start(); return wait(500); }).then(forceState);
    }
    if (q.get('tab') === 'epg' || q.get('tab') === 'now') {
      steps = steps.then(function () { clickSel('.lfx-tvm__tab--' + q.get('tab')); return wait(400); });
    }
    if (q.get('info') === '1') {
      steps = steps.then(function () {
        if (phone && !host.classList.contains('is-tab-epg')) { clickSel('.lfx-tvm__tab--epg'); return wait(500); }
        return null;
      }).then(function () {
        var cell = host.querySelector('.lfx-tvm__epg-cell:not(.is-current):not(.is-past):not(.lfx-tvm__epg-cell--filler):not(.lfx-tvm__epg-cell--closedown)');
        if (cell) cell.click(); else console.warn('[tvmode-dev] keine künftige EPG-Zelle gefunden');
        return wait(500);
      });
    }
    steps.then(finish, function (e) { fail(e); finish(); });
  }

  // --- Start ---
  if (!window.LenzFlixTvMode || typeof window.LenzFlixTvMode.create !== 'function') {
    fail(new Error('window.LenzFlixTvMode fehlt – erst npm run build ausführen (dist/lenztvmode.js)'));
    return;
  }
  try {
    inst = window.LenzFlixTvMode.create(host, deps, opts);
    window.__tvmDev.instance = inst;
  } catch (err) {
    fail(err);
  }
})();
