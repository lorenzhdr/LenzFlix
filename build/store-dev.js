// Dev-Harness der VIDEOTHEK LENZ: erzeugt einen Fake-Katalog (analog 674 Filme + 157 Serien) und ruft create() des
// 3D-Bundles ohne Jellyfin auf. Keine Netzwerkzugriffe: Cover sind per Canvas generierte data-URLs.
(function () {
  var q = new URLSearchParams(location.search);
  var touch = q.get('touch') === '1';
  var phone = q.get('phone') === '1';
  var total = Number(q.get('n')) || 831;

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
  var rand = rng(20260);
  var pick = function (arr) { return arr[Math.floor(rand() * arr.length)]; };

  var A = ['Nacht', 'Schatten', 'Sommer', 'Zeit', 'Stern', 'Eis', 'Feuer', 'Wolken', 'Straße', 'Insel', 'Berg', 'Meer', 'Stadt', 'Traum', 'Wüste', 'Kometen', 'Turbo', 'Piraten', 'Geister', 'Silber'];
  var B = ['jäger', 'fahrt', 'zug', 'spiel', 'bote', 'kampf', 'reise', 'lied', 'tanz', 'wächter', 'geheimnis', 'rennen', 'ritt', 'wende', 'fieber'];
  var genres = ['Action', 'Komödie', 'Drama', 'Thriller', 'Horror', 'Science-Fiction', 'Krimi', 'Abenteuer', 'Fantasy', 'Dokumentation', 'Animation', 'Familie', 'Romantik', 'Western', 'Musik'];
  var colors = ['#ff6b35', '#ffd23f', '#3ddc97', '#2a9df4', '#c77dff', '#ff3d7f', '#35e6ff', '#f7b267', '#9bdeac', '#ff8fa3', '#8ecae6', '#e9c46a', '#b5179e', '#90be6d', '#f94144'];
  var ratings = ['FSK-0', 'FSK-6', 'FSK-12', 'FSK-12', 'FSK-16', 'FSK-16', 'FSK-18', '12', '16', 'R', 'TV-MA'];
  var NOW = Date.now();

  var items = new Map();
  var films = Math.round(total * 0.81);
  var seriesCount = total - films;

  function make(i, isSeries) {
    var name = pick(A) + pick(B) + (rand() > 0.6 ? ' ' + pick(['II', 'Reloaded', 'Die Rückkehr', 'Der Anfang', '3']) : '');
    var id = (isSeries ? 's' : 'm') + i;
    var year = 1975 + Math.floor(rand() * 51);
    var g = [pick(genres)];
    if (rand() > 0.5) g.push(pick(genres));
    var rating = pick(ratings);
    var progress = rand() > 0.93 ? 0.1 + rand() * 0.8 : 0;
    var watched = !progress && rand() > 0.8;
    var created = NOW - Math.floor(Math.pow(rand(), 3) * 200) * 86400000;
    var it = {
      Id: id, Name: name, SortName: name.toLowerCase(), Type: isSeries ? 'Series' : 'Movie', ProductionYear: year, OfficialRating: rating, Genres: g,
      Overview: 'Ein erfundener Kurzinhalt für „' + name + '“. ' + 'Zwischen Kassetten und Neonlicht beginnt ein Abend, den niemand so schnell vergisst. '.repeat(3),
      RunTimeTicks: isSeries ? 0 : (70 + Math.floor(rand() * 100)) * 600000000, CommunityRating: 4 + rand() * 5.5,
      ChildCount: isSeries ? 1 + Math.floor(rand() * 6) : 0, DateCreated: new Date(created).toISOString(),
      UserData: { Played: watched, PlaybackPositionTicks: progress ? 1e10 : 0, PlayedPercentage: progress * 100, IsFavorite: rand() > 0.95 },
      ImageTags: { Primary: 'x' + (i % 7) }, BackdropImageTags: [], ServerId: 'dev', MediaType: isSeries ? '' : 'Video', IsFolder: isSeries,
    };
    it.lfx = { media: isSeries ? 'box' : (year < 2000 ? 'vhs' : 'dvd'), isNew: NOW - created < 14 * 86400000, progress: progress, watched: watched };
    items.set(id, it);
    return it;
  }
  var filmList = [];
  var seriesList = [];
  for (var i = 0; i < films; i++) filmList.push(make(i, false));
  for (var j = 0; j < seriesCount; j++) seriesList.push(make(j, true));

  // --- Abteilungen nach Vertrag (docs/store3d.md) ---
  var ADULT = ['fsk-18', '18', 'de-18', 'nc-17', 'x', 'r18', 'r18+', 'ao'];
  var KIDS_R = ['fsk-0', 'fsk-6', '0', '6', ''];
  var isAdult = function (it) { return ADULT.indexOf(String(it.OfficialRating || '').toLowerCase()) >= 0; };
  var isKids = function (it) {
    return !isAdult(it) && it.Genres.some(function (g) { return ['Animation', 'Familie', 'Kids', 'Kinder'].indexOf(g) >= 0; }) && KIDS_R.indexOf(String(it.OfficialRating || '').toLowerCase()) >= 0;
  };
  var sortKey = function (a, b) { return a.SortName < b.SortName ? -1 : 1; };
  var all = filmList.concat(seriesList);
  var newest = all.slice().sort(function (a, b) { return a.DateCreated < b.DateCreated ? 1 : -1; }).slice(0, 24);
  var depts = [];
  var colorOf = function (key) { var h = 0; for (var k = 0; k < key.length; k++) h = (h * 31 + key.charCodeAt(k)) >>> 0; return colors[h % colors.length]; };
  var add = function (id, label, kind, color, list) {
    if (list.length) depts.push({ id: id, label: label, kind: kind, color: color, itemIds: list.sort(sortKey).map(function (x) { return x.Id; }) });
  };
  add('new', 'Neuheiten', 'new', '#ff3b3b', newest.slice());
  var rest = all.filter(function (it) { return !isAdult(it) && !isKids(it); });
  var adults = all.filter(isAdult);
  var kids = all.filter(isKids);
  var byGenre = {};
  rest.filter(function (it) { return it.Type !== 'Series'; }).forEach(function (it) { (byGenre[it.Genres[0]] = byGenre[it.Genres[0]] || []).push(it); });
  var misc = [];
  Object.keys(byGenre).sort().forEach(function (g) {
    if (byGenre[g].length < 8) misc = misc.concat(byGenre[g]);
    else add('genre-' + g, g, 'genre', colorOf(g), byGenre[g]);
  });
  add('misc', 'Querbeet', 'misc', '#aab4e8', misc);
  add('kids', 'Kinder', 'kids', '#ffd23f', kids);
  add('adult', 'Ab 18', 'adult', '#ff2d2d', adults);
  var bySeries = {};
  rest.filter(function (it) { return it.Type === 'Series'; }).forEach(function (it) { (bySeries[it.Genres[0]] = bySeries[it.Genres[0]] || []).push(it); });
  var smisc = [];
  Object.keys(bySeries).sort().forEach(function (g) {
    if (bySeries[g].length < 6) smisc = smisc.concat(bySeries[g]);
    else add('series-' + g, 'Serien · ' + g, 'series', colorOf('s' + g), bySeries[g]);
  });
  add('series-misc', 'Serien · Mehr', 'series', '#c77dff', smisc);

  var demoSeries = seriesList[0];
  var demoEp = { Id: demoSeries.Id + '-ep', Name: 'Das Wiedersehen', Type: 'Episode', SeriesId: demoSeries.Id, SeriesName: demoSeries.Name, ParentIndexNumber: 2, IndexNumber: 3, ImageTags: {}, UserData: { PlayedPercentage: 40 }, lfx: { progress: 0.4 } };
  var catalog = {
    items: items, departments: depts,
    resume: [demoEp].concat(all.filter(function (x) { return x.lfx.progress > 0; })), favorites: all.filter(function (x) { return x.UserData.IsFavorite; }), highlights: newest.slice(0, 8),
  };

  // --- Cover (Canvas → JPEG-data-URL, gecacht) ---
  var coverCache = new Map();
  function cover(id, w) {
    var key = id + ':' + w;
    if (coverCache.has(key)) return coverCache.get(key);
    var it = items.get(id);
    var h = Math.round(w * 1.5);
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    var base = colorOf(it.Genres[0] + id.length);
    var g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, base); g.addColorStop(1, '#10122a');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,0.14)';
    x.beginPath(); x.arc(w * 0.75, h * 0.28, w * 0.34, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.textAlign = 'center';
    x.font = 'bold ' + Math.round(w * 0.12) + 'px Arial';
    var words = it.Name.split(' ');
    words.forEach(function (wd, k) { x.fillText(wd, w / 2, h * 0.62 + k * w * 0.14); });
    x.font = Math.round(w * 0.07) + 'px Arial';
    x.fillText(String(it.ProductionYear), w / 2, h * 0.92);
    var url = c.toDataURL('image/jpeg', 0.8);
    coverCache.set(key, url);
    return url;
  }

  var $ = function (id) { return document.getElementById(id); };
  var toastTimer = 0;
  var toast = function (t) {
    var e = $('dev-toast');
    e.textContent = t; e.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { e.style.display = 'none'; }, 2200);
  };
  var delay = function (v, ms) { return new Promise(function (r) { setTimeout(function () { r(v); }, ms || 120); }); };

  var deps = {
    catalog: catalog,
    user: { name: 'Dev' },
    imageUrl: function (id, o) { return cover(id, (o && o.maxWidth) || 200); },
    getItem: function (id) { return delay(items.get(id), 200); },
    getSeasons: function (id) {
      var n = items.get(id).ChildCount || 1;
      return delay(Array.from({ length: n }, function (_, k) { return { Id: id + '-s' + k, Name: 'Staffel ' + (k + 1), IndexNumber: k + 1 }; }));
    },
    getEpisodes: function (id, seasonId) {
      return delay(Array.from({ length: 8 }, function (_, k) {
        return { Id: seasonId + '-e' + k, Name: 'Folge ' + (k + 1) + ': ' + pick(A) + pick(B), IndexNumber: k + 1, Type: 'Episode', UserData: { Played: k < 2, PlaybackPositionTicks: k === 2 ? 1e9 : 0 } };
      }));
    },
    setFavorite: function (id, v) { items.get(id).UserData.IsFavorite = v; return delay(); },
    setPlayed: function (id, v) { items.get(id).UserData.Played = v; return delay(); },
    search: function (q) {
      var n = String(q || '').toLowerCase();
      var hits = all.filter(function (it) { return it.Name.toLowerCase().indexOf(n) >= 0; }).slice(0, 25);
      var ser = hits.filter(function (it) { return it.Type === 'Series'; })[0];
      if (ser) hits.push({ Id: ser.Id + '-ep', Name: 'Pilotfolge', Type: 'Episode', SeriesId: ser.Id, SeriesName: ser.Name, ParentIndexNumber: 1, IndexNumber: 1, ProductionYear: ser.ProductionYear });
      return delay(hits, 150);
    },
    loadTrailer: function () { return Promise.resolve(null); },
    play: function (item, o) { console.log('[dev] play', item.Id, item.Name, o); toast('Abspielen: ' + item.Name + (o && o.resume ? ' (weiter)' : '')); return Promise.resolve(true); },
    toast: toast,
    classicView: function () { toast('Klassische Ansicht (Dev)'); },
    openLibraries: function () { toast('Bibliotheken (Dev)'); },
    openMenu: function () { toast('Menü (Dev)'); },
    openSettings: function () { toast('Einstellungen (Dev)'); },
    openThemePicker: function () { toast('Design wechseln (Dev)'); },
    logout: function () { toast('Abmelden (Dev)'); },
    onProgress: function (f, label) { $('dev-load-text').textContent = label || ''; $('dev-load-bar').style.width = Math.round(f * 100) + '%'; },
    onReady: function () { $('dev-load').style.display = 'none'; console.log('[dev] ready'); },
    onState: function (s) { try { sessionStorage.setItem('store-dev-state', JSON.stringify(s)); } catch { /* egal */ } },
    onFatal: function (e) {
      var f = $('dev-fatal');
      f.style.display = 'flex';
      f.textContent = 'Fatal: ' + (e && e.message ? e.message : e);
    },
  };

  var prefs = { fps: q.get('fps') === '1', bigCovers: q.get('big') !== '0', voiceOnline: q.get('voice') === 'online', voiceName: '', voicePitch: 'tief', touchControl: q.get('ctl') === 'touch' ? 'touch' : 'joystick' };
  deps.onPrefs = function (p) {
    if (typeof p.fps === 'boolean') prefs.fps = p.fps;
    if (typeof p.voiceOnline === 'boolean') prefs.voiceOnline = p.voiceOnline;
    if (typeof p.voiceName === 'string') prefs.voiceName = p.voiceName;
    if (typeof p.voicePitch === 'string') prefs.voicePitch = p.voicePitch;
    if (typeof p.bigCovers === 'boolean') prefs.bigCovers = p.bigCovers;
    if (typeof p.touchControl === 'string') prefs.touchControl = p.touchControl;
    console.log('[dev] prefs', p);
  };
  deps.onBigCovers = function (on) {
    prefs.bigCovers = !!on;
    console.log('[dev] bigCovers', on, '-> Neuaufbau');
    setTimeout(function () {
      if (inst) inst.dispose();
      $('dev-load').style.display = 'block';
      start(true);
    }, 0);
  };

  var host = $('stage');
  var inst = null;
  function start(rebuilt) {
    var restore = null;
    if (rebuilt || q.get('restore') === '1') {
      try { restore = JSON.parse(sessionStorage.getItem('store-dev-state')); } catch { restore = null; }
    }
    inst = window.LenzFlixStore3D.create(host, deps, {
      quality: q.get('quality') || 'auto', sound: q.get('sound') !== '0', showFps: prefs.fps, bigCovers: prefs.bigCovers, voiceOnline: prefs.voiceOnline, voiceName: prefs.voiceName, voicePitch: prefs.voicePitch, touchControl: prefs.touchControl,
      skipIntro: rebuilt || q.get('intro') !== '1', restore: restore, openItemId: rebuilt ? null : q.get('item') || null,
      openTerminal: false, query: '', phone: phone || touch, touch: touch, debug: true,
      hour: q.get('hour') !== null && q.get('hour') !== '' ? Number(q.get('hour')) : undefined, rain: q.get('rain') === '1' ? true : q.get('rain') === '0' ? false : undefined,
    });
    window.__store = inst;
  }
  if (!window.LenzFlixStore3D) { deps.onFatal(new Error('dist/lenzstore.js fehlt – erst npm run build')); return; }
  start(false);
  window.addEventListener('pagehide', function () { if (inst) inst.dispose(); });
}());
