// Dev-Harness der LENZ LIVE (docs/live.md): erzeugt einen Fake-Katalog (RawCatalog, deterministisch per seeded PRNG) und ruft
// create() der Engine (dist/lenzlive.js) ohne Jellyfin auf. Keine Netzwerkzugriffe: Cover sind per Canvas generierte data-URLs.
(function () {
  var q = new URLSearchParams(location.search);
  var phone = q.get('phone') === '1';
  var admin = q.get('admin') === '1';
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

  // --- Toast / Laden / Fatal ---
  var toastTimer = 0;
  function toast(text) {
    var el = $('dev-toast');
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.display = 'none'; }, 2600);
    console.info('[live-dev] toast:', text);
  }

  // --- Cover (Canvas-Data-URL, gecacht) ---
  var covers = {};
  function cover(id) {
    if (covers[id]) return covers[id];
    try {
      var c = document.createElement('canvas');
      c.width = 80; c.height = 120;
      var x = c.getContext('2d');
      var h = 0;
      for (var j = 0; j < id.length; j++) h = (h * 31 + id.charCodeAt(j)) % 360;
      x.fillStyle = 'hsl(' + h + ',55%,38%)';
      x.fillRect(0, 0, 80, 120);
      x.fillStyle = 'rgba(255,255,255,.85)';
      x.font = '14px sans-serif';
      x.fillText(id, 8, 64);
      covers[id] = c.toDataURL('image/png');
    } catch { covers[id] = ''; }
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
  var startWall = q.get('now') ? Date.parse(q.get('now')) : NaN; // ohne Zone = lokale Zeit
  var t0 = performance.now();
  var startNow = isNaN(startWall) ? Date.now() : startWall;
  var offset = 0; // Dev-Panel „Uhr +1 h“
  var nowFn = function () { return startNow + (performance.now() - t0) + offset; };

  var prefs = {};
  try { prefs = JSON.parse(sessionStorage.getItem('lfx.liveDev.prefs') || '{}'); } catch { prefs = {}; }
  var played = [];
  var requests = [];
  window.__liveDev = { played: played, requests: requests, catalog: catalog, boxMap: boxMap, toast: toast };

  var deps = {
    catalog: catalog,
    user: { id: 'dev-user', name: 'Testnutzer', isAdmin: admin, audioLang: 'ger', subLang: 'ger', subMode: 'Default' },
    server: { deviceId: 'dev' },
    request: function (method, path) {
      requests.push({ method: method, path: path });
      console.info('[live-dev] request (nicht beantwortet):', method, path);
      return Promise.resolve(null);
    },
    streamUrl: function () { return 'about:blank#'; },
    imageUrl: function (id) { return cover(String(id)); },
    getBoxSetItems: function (id) { return Promise.resolve((boxMap[id] || []).slice()); },
    loadTrailer: function () { return Promise.resolve(rand() < 0.3 ? { url: 'fake://trailer', durMs: 120000 } : null); },
    setPlayed: function (id) { console.info('[live-dev] setPlayed', id); played.push(id); return Promise.resolve(); },
    channelConfig: parseChannels(q.get('channels')),
    // Inhaltsangaben der Fernsehzeitung (Platzhaltertexte, keine echten Inhalte)
    itemDetails: function (ids) {
      var out = new Map();
      var T1 = ['Eine Geschichte voller Wendungen, erzählt in ruhigen Bildern.', 'Platzhaltertext für die Inhaltsangabe dieses Titels.', 'Zwei Welten treffen aufeinander. Nichts bleibt, wie es war.'];
      (ids || []).forEach(function (id, i) {
        out.set(id, { overview: T1[i % T1.length] + ' Dies ist ein Beispieltext aus dem Dev-Harness. Er dient nur zur Ansicht der Fernsehzeitung und enthält keine echten Inhalte.' });
      });
      requests.push({ method: 'GET', path: '/Items?Ids=' + (ids || []).length + ' Stück' });
      return Promise.resolve(out);
    },
    savePrefs: function (partial) {
      Object.keys(partial || {}).forEach(function (k) { prefs[k] = partial[k]; });
      try { sessionStorage.setItem('lfx.liveDev.prefs', JSON.stringify(prefs)); } catch { /* egal */ }
    },
    leaveToLibrary: function (itemId, meta) {
      toast('→ Mediathek (LENZFLIX) mit Titel ' + (itemId || '–') + (meta && meta.type ? ' (' + meta.type + ')' : ''));
      return Promise.resolve();
    },
    previousThemeName: 'LENZFLIX',
    openThemePicker: function () { toast('Design-Auswahl (Harness)'); },
    openDashboard: function () { toast('Dashboard (Harness)'); },
    logout: function () { toast('Abmelden (Harness)'); },
    toast: toast,
    onProgress: function (f, label) {
      $('dev-load-text').textContent = (label || 'Sendersuchlauf …') + ' ' + Math.round((f || 0) * 100) + ' %';
      $('dev-load-bar').style.width = Math.round((f || 0) * 100) + '%';
    },
    onReady: function () {
      var l = $('dev-load');
      if (l) l.remove();
      automate();
    },
    onFatal: function (err) {
      var l = $('dev-load');
      if (l) l.remove();
      var f = $('dev-fatal');
      f.textContent = 'Fehler: ' + (err && err.message ? err.message : String(err));
      f.style.display = 'flex';
      document.documentElement.dataset.liveDevReady = 'error';
    },
  };

  var style = q.get('style') || prefs.style || 'flat';
  var opts = {
    style: style, volume: prefs.volume != null ? prefs.volume : 0.5, muted: prefs.muted != null ? prefs.muted : false,
    lastChannel: Number(q.get('channel')) || prefs.lastChannel || 1, audioPref: null,
    phone: phone, touch: phone, debug: q.get('debug') === '1' || !!q.get('idle'), music: q.get('music') !== '0' && prefs.music !== false, now: nowFn, fakePlayer: q.get('real') !== '1',
  };
  if (opts.debug) window.__lfxLiveDebug = true;
  if (phone) document.documentElement.classList.add('lfx-phone');

  // --- Automatisierung (Screenshots) ---
  var stage = $('stage');
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function key(k) {
    var el = stage.querySelector('[data-key="' + k + '"]');
    if (!el) { console.warn('[live-dev] Taste nicht gefunden:', k); return false; }
    el.click();
    return true;
  }
  function automate() {
    var done = function () { document.documentElement.dataset.liveDevReady = '1'; };
    var steps = Promise.resolve();
    if (q.get('autopower') === '1') {
      steps = steps.then(function () { return wait(300); }).then(function () { key('power'); return wait(400); });
      var zap = Number(q.get('zap')) || 0;
      for (var z = 0; z < zap; z++) steps = steps.then(function () { key('ch+'); return wait(450); });
      var ov = q.get('overlay');
      if (ov === 'epg' || ov === 'ttx' || ov === 'menu' || ov === 'guide') {
        steps = steps.then(function () { key(ov === 'ttx' ? 'txt' : ov); return wait(ov === 'guide' ? 900 : 400); });
        var page = q.get('page');
        if (ov === 'ttx' && page) {
          page.split('').forEach(function (d) { steps = steps.then(function () { key(d); return wait(150); }); });
        }
        if (ov === 'guide' && Number(page) > 1) {
          // Heft: pro Doppelseite einmal blättern (rechts); ?page=N = N-te Seite (1-basiert, grob)
          for (var pg = 1; pg < Number(page); pg++) steps = steps.then(function () { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); return wait(250); });
        }
      }
      if (q.get('remote') === '1') steps = steps.then(function () { var ap = stage.querySelector('.lfx-live-app'); setInterval(function () { if (ap) ap.classList.add('show-remote'); }, 200); return wait(900); });
      var idle = q.get('idle');
      if (idle === 'pause' || idle === 'test' || idle === 'error') {
        steps = steps.then(function () { var a = window.__lfxLive && window.__lfxLive.app; if (a && a.debugCard) a.debugCard(idle); return wait(300); });
      }
      if (q.get('fullscreen') === '1') {
        steps = steps.then(function () { if (!key('fullscreen')) { var app = stage.querySelector('.lfx-live-app'); if (app) app.classList.add('is-fullscreen'); } return wait(300); });
      }
    }
    steps.then(function () { return wait(300); }).then(done, done);
  }

  // --- Dev-Panel ---
  if (q.get('clean') !== '1') {
    var panel = document.createElement('details');
    panel.id = 'dev-panel';
    var sum = document.createElement('summary');
    sum.textContent = 'Dev';
    panel.appendChild(sum);
    var row = document.createElement('div');
    var sel = document.createElement('select');
    ['flat', 'crt80', 'silver', 'plain'].forEach(function (s2) {
      var o = document.createElement('option');
      o.value = s2; o.textContent = s2; if (s2 === style) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function () { var u = new URL(location.href); u.searchParams.set('style', sel.value); location.href = u.href; };
    var plus = document.createElement('button');
    plus.textContent = 'Uhr +1 h';
    plus.onclick = function () { offset += 3600000; toast('Uhr +1 h'); };
    var adm = document.createElement('button');
    adm.textContent = admin ? 'Admin aus' : 'Admin an';
    adm.onclick = function () { var u = new URL(location.href); if (admin) u.searchParams.delete('admin'); else u.searchParams.set('admin', '1'); location.href = u.href; };
    row.appendChild(sel); row.appendChild(plus); row.appendChild(adm);
    panel.appendChild(row);
    document.body.appendChild(panel);
  }

  // --- Start ---
  if (!window.LenzFlixLive || typeof window.LenzFlixLive.create !== 'function') {
    deps.onFatal(new Error('window.LenzFlixLive fehlt – erst npm run build ausführen (dist/lenzlive.js)'));
    return;
  }
  try {
    window.__liveDev.instance = window.LenzFlixLive.create(stage, deps, opts);
  } catch (err) {
    deps.onFatal(err);
  }
})();
