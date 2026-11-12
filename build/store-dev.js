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

  var prefs = { fps: q.get('fps') === '1', bigCovers: q.get('big') !== '0', voiceOnline: q.get('voice') === 'online', voiceName: '', voicePitch: 'tief', touchControl: q.get('ctl') === 'joystick' ? 'joystick' : 'touch' };
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

  // --- VR-Kino-Harness: echte Bridge (Hülle) + Fake-Jellyfin-Player mit identischem DOM (docs/store3d.md, Kino) ---
  // ?cinema=1|series|fail|paused|slow  Fake-Player (Film / Serie mit Up-Next / Wiedergabefehler / Start pausiert / Bild erst nach 15 s)   ?subs=srt|ass|off  Untertitelart
  // ?xremu=1 lädt den Emulator (/xr-emu.js, nur lokal in .tmp/)   ?xrshot=1 blendet die Bühne während XR aus (Screenshot-Hilfe)
  var cinemaQ = q.get('cinema');
  var cinemaMode = cinemaQ === '1' ? 'movie' : cinemaQ === 'series' ? 'series' : cinemaQ === 'fail' ? 'fail' : cinemaQ === 'paused' ? 'paused' : cinemaQ === 'slow' ? 'slow' : null;
  var xrshot = q.get('xrshot') === '1';
  var subsMode = q.get('subs') === 'ass' ? 'ass' : q.get('subs') === 'off' ? 'off' : 'srt';
  var xrState = { presenting: false, cinema: false };
  var bridge = null;
  var inst = null;
  var host = $('stage');
  var routePath = function () { return String(location.hash || '').replace(/^#!?/, '').split('?')[0]; };

  function syncStage() {
    // Bühne bleibt im Harness immer im DOM; unsichtbar nur für Screenshots in XR bzw. solange der Fake-Player 2D läuft
    var hide = (xrshot && xrState.presenting) || (cinemaMode && routePath() === '/video' && !xrState.presenting);
    host.style.visibility = hide ? 'hidden' : '';
  }

  // Vereinfachte Nachbildung der Hülle (features/store/home.js: onXr, Zeile 4/6)
  deps.onXr = function (s) {
    xrState.presenting = !!(s && s.presenting);
    xrState.cinema = xrState.presenting && !!(s && s.cinema);
    syncStage();
    if (!bridge) return;
    if (xrState.presenting && xrState.cinema) bridge.activate(true);
    else bridge.activate(false);
  };
  window.addEventListener('hashchange', function () {
    syncStage();
    if (routePath() === '/home' && xrState.presenting && xrState.cinema && inst) {
      try { if (typeof inst.leaveCinema === 'function') inst.leaveCinema('home'); } catch (e) { console.warn('[dev] leaveCinema', e && e.message); }
      if (bridge) bridge.activate(false);
    }
  });

  var fake = null;
  var origTitle = document.title;
  var nativeReadyState = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState').get;
  var mk = function (tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var clock = function (s) { s = Math.max(0, Math.floor(s)); return pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor(s / 60) % 60) + ':' + pad2(s % 60); };
  var SUB_ROWS = [['secondarysubtitle', 'Zweiter Untertitel'], ['-1', 'Aus'], ['3', 'Deutsch - SRT'], ['4', 'Englisch - SRT']];
  var AUDIO_ROWS = [['1', 'Deutsch - AAC - Stereo'], ['2', 'Englisch - AC3 - 5.1']];
  var dialogDepth = function () { return history.state && history.state.usr && history.state.usr.dialogs ? history.state.usr.dialogs.length : 0; };

  function removeSheet() {
    if (fake && fake.sheet) { fake.sheet.remove(); fake.sheet = null; }
  }

  function applySubs(f) {
    var video = f.video;
    if (f.ass) { f.ass.remove(); f.ass = null; }
    if (f.sub === '-1') { if (f.track) f.track.mode = 'disabled'; return; }
    if (subsMode === 'ass') {
      var parent = mk('div', 'libassjs-canvas-parent', f.cont);
      parent.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;';
      var cv = mk('canvas', 'libassjs-canvas', parent);
      cv.width = 1280; cv.height = 720;
      cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;';
      f.ass = parent; f.assCanvas = cv;
      return;
    }
    if (!f.track) {
      f.track = video.addTextTrack('subtitles', 'manualTrack');
      f.cueList = [];
      f.cueSlots = {};
      // Die echte Cue-Aktivierung hängt an der internen Medienzeit; hier zählt die virtuelle Uhr
      Object.defineProperty(f.track, 'activeCues', {
        configurable: true,
        get: function () {
          if (f.track.mode !== 'showing') return null;
          var t = nowT(f);
          ensureCues(f, t);
          return f.cueList.filter(function (c) { return c.startTime <= t && t < c.endTime; });
        },
      });
    }
    f.track.mode = 'showing';
  }

  function ensureCues(f, t) {
    var slot = Math.floor(t / 3);
    for (var s = slot; s < slot + 4; s++) {
      if (f.cueSlots[s]) continue;
      f.cueSlots[s] = true;
      var en = f.sub === '4';
      var txt = '‎' + (en ? 'Sentence ' : 'Satz ') + (s + 1) + (s % 2 ? '\n' + (en ? 'second line' : 'zweite Zeile') : '');
      var cue = new VTTCue(s * 3, s * 3 + 2.6, txt);
      f.track.addCue(cue);
      f.cueList.push(cue);
    }
  }

  function nowT(f) {
    var n = performance.now();
    var dt = (n - f.last) / 1000;
    f.last = n;
    if (!f.fail && !f.video.paused && n >= f.reloadUntil && f.t < f.dur) {
      f.t = Math.min(f.dur, f.t + dt);
      if (f.t >= f.dur) f.video.pause();
    }
    return f.t;
  }

  function seek(f, s) {
    nowT(f);
    f.t = Math.max(0, Math.min(f.dur, Number(s) || 0));
    f.video.dispatchEvent(new Event('seeking'));
    f.video.dispatchEvent(new Event('seeked'));
  }

  function startNext(f) {
    f.epNo += 1;
    f.t = 0;
    f.upHidden = false;
    f.up.classList.add('hide');
    document.title = '0:45 - S1:E' + f.epNo + ' - Folge ' + f.epNo + ' (2019)';
    f.video.dispatchEvent(new Event('seeked'));
  }

  function draw(f) {
    var c = f.g;
    var t = nowT(f);
    var W = 1280, H = 720;
    c.fillStyle = 'hsl(' + (Math.floor(t / 2) % 6) * 60 + ',70%,28%)';
    c.fillRect(0, 0, W, H);
    var bars = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff'];
    for (var i = 0; i < bars.length; i++) { c.fillStyle = bars[i]; c.fillRect(i * (W / 7), 0, W / 7 + 1, 230); }
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(160, 270, 960, 190);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 150px monospace'; c.fillText(clock(t), W / 2, 365);
    c.font = 'bold 44px Arial';
    c.fillText(document.title.slice(0, 40), W / 2, 520);
    c.font = '28px Arial';
    c.fillText(f.video.paused ? 'PAUSE' : 'läuft', W / 2, 580);
    c.fillStyle = '#fff'; c.fillRect((t * 90) % (W - 40), 640, 40, 40);
    if (f.assCanvas) {
      var a = f.assCanvas.getContext('2d');
      a.clearRect(0, 0, 1280, 720);
      a.font = 'bold 54px Arial'; a.textAlign = 'center'; a.fillStyle = '#ffe600'; a.strokeStyle = '#000'; a.lineWidth = 5;
      var line = 'Satz ' + (Math.floor(t / 3) + 1);
      a.strokeText(line, 640, 650); a.fillText(line, 640, 650);
    }
  }

  function tickFake(f) {
    var t = nowT(f);
    var rem = f.dur - t;
    if (f.isSeries) {
      var showUp = rem <= 40 && rem > 0 && !f.upHidden;
      if (showUp) {
        f.up.classList.remove('hide');
        f.upText.textContent = 'Nächste Folge beginnt in ' + Math.ceil(rem) + ' Sekunden';
      } else if (!f.up.classList.contains('hide')) f.up.classList.add('hide');
      if (rem <= 0) startNext(f);
    }
    var sl = f.osd.querySelector('.osdPositionSlider');
    if (document.activeElement !== sl) sl.value = String((t / f.dur) * 100);
    f.osd.querySelector('.osdPositionText').textContent = clock(t);
    f.osd.querySelector('.osdDurationText').textContent = '-' + clock(rem);
    f.video.dispatchEvent(new Event('timeupdate'));
  }

  function showError(f) {
    var box = mk('div', 'dialogContainer', document.body);
    box.style.cssText = 'position:fixed;inset:0;z-index:30000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);';
    var dlg = mk('div', 'dialog', box);
    dlg.style.cssText = 'background:#222;color:#fff;padding:20px 28px;border-radius:8px;';
    mk('h2', 'dialogTitle', dlg, 'Wiedergabefehler');
    mk('p', '', dlg, 'Die Wiedergabe ist fehlgeschlagen.');
    var ok = mk('button', 'btnOk', dlg, 'OK');
    ok.addEventListener('click', function () { stopFake(); location.hash = '#/home'; });
    f.errBox = box;
  }

  function openSheet(f, kind) {
    removeSheet();
    var rows = kind === 'audio' ? AUDIO_ROWS : SUB_ROWS;
    var cur = kind === 'audio' ? f.audio : f.sub;
    var box = mk('div', 'dialogContainer', document.body);
    box.style.cssText = 'position:fixed;inset:0;z-index:30000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);';
    var dlg = mk('div', 'dialog actionSheet opened', box);
    dlg.style.cssText = 'background:#222;color:#fff;padding:16px;border-radius:8px;min-width:280px;';
    mk('h1', 'actionSheetTitle', dlg, kind === 'audio' ? 'Tonspur' : 'Untertitel');
    var scroller = mk('div', 'actionSheetScroller', dlg);
    rows.forEach(function (r) {
      var b = mk('button', 'listItem actionSheetMenuItem', scroller);
      b.setAttribute('data-id', r[0]);
      b.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:inherit;padding:8px;font-size:16px;text-align:left;';
      var ic = mk('span', 'actionsheetMenuItemIcon material-icons', b, '✓');
      ic.style.visibility = r[0] === cur ? 'visible' : 'hidden';
      var body = mk('div', 'listItemBody actionsheetListItemBody', b);
      mk('div', 'listItemBodyText actionSheetItemText', body, r[1]);
      b.addEventListener('click', function () {
        if (r[0] !== 'secondarysubtitle') choose(f, kind, r[0]);
        if (dialogDepth() > 0) history.back(); else removeSheet();
      });
    });
    history.pushState({ usr: { dialogs: ['dlg' + Date.now()] } }, '');
    f.sheet = box;
  }

  function choose(f, kind, id) {
    if (kind === 'audio') {
      if (id === f.audio) return;
      f.audio = id;
      // Echte Eigenheit: Spurwechsel lädt neu (readyState 0), danach sind die Untertitel aus
      nowT(f);
      f.reloadUntil = performance.now() + 2000;
      f.sub = '-1';
      applySubs(f);
    } else {
      f.sub = id;
      applySubs(f);
    }
  }

  function stopFake() {
    var f = fake;
    if (!f) return;
    fake = null;
    f.timers.forEach(clearInterval);
    try { f.stream.getTracks().forEach(function (t) { t.stop(); }); } catch { /* egal */ }
    try { if (f.ac) f.ac.close(); } catch { /* egal */ }
    try { f.video.pause(); } catch { /* egal */ }
    [f.cont, f.osd, f.header, f.up, f.sheet, f.errBox].forEach(function (n) { if (n) n.remove(); });
    f.video.removeAttribute('src');
    document.title = origTitle;
    syncStage();
  }

  function startFake(item, o) {
    stopFake();
    var isSeries = cinemaMode === 'series' || item.Type === 'Episode';
    var f = { item: item, isSeries: isSeries, fail: cinemaMode === 'fail', dur: isSeries ? 2700 : 5400, t: 0, last: performance.now(), reloadUntil: 0, audio: '1', sub: subsMode === 'off' ? '-1' : '3', epNo: 1, timers: [], upHidden: false, sheet: null, errBox: null, track: null, ass: null, assCanvas: null };
    fake = f;
    if (o && o.resume) f.t = item.lfx && item.lfx.progress ? Math.round(item.lfx.progress * f.dur) : 600;
    document.title = item.Name;

    f.header = mk('header', 'skinHeader', document.body);
    f.header.style.cssText = 'position:fixed;left:0;top:0;z-index:20000;';
    var back = mk('button', 'headerBackButton', f.header, '← Zurück');
    back.title = 'Zurück';
    back.addEventListener('click', function () { stopFake(); location.hash = '#/home'; });

    f.cont = mk('div', 'videoPlayerContainer', document.body);
    f.cont.style.cssText = 'position:fixed;inset:0;z-index:10;background:#000;';
    var video = mk('video', 'htmlvideoplayer', f.cont);
    video.crossOrigin = 'anonymous';
    video.playsInline = true;
    video.style.cssText = 'width:100%;height:100%;object-fit:contain;';
    f.video = video;
    var def = function (name, get, set) { Object.defineProperty(video, name, { configurable: true, get: get, set: set }); };
    def('currentTime', function () { nowT(f); return performance.now() < f.reloadUntil ? 0 : f.t; }, function (v) { seek(f, v); });
    def('duration', function () { return f.fail ? NaN : f.dur; });
    def('ended', function () { return !f.fail && f.t >= f.dur - 0.01; });
    def('readyState', function () { return f.fail || performance.now() < f.reloadUntil ? 0 : nativeReadyState.call(video); });

    if (!f.fail) {
      var canvas = mk('canvas');
      canvas.width = 1280; canvas.height = 720;
      f.g = canvas.getContext('2d');
      f.stream = canvas.captureStream(30);
      try { // leiser Piep 1x/s
        f.ac = new (window.AudioContext || window.webkitAudioContext)();
        var osc = f.ac.createOscillator();
        var gain = f.ac.createGain();
        var dest = f.ac.createMediaStreamDestination();
        gain.gain.value = 0;
        osc.frequency.value = 880;
        osc.connect(gain); gain.connect(dest); osc.start();
        f.stream.addTrack(dest.stream.getAudioTracks()[0]);
        f.timers.push(setInterval(function () {
          if (video.paused || performance.now() < f.reloadUntil) return;
          gain.gain.setValueAtTime(0.04, f.ac.currentTime);
          gain.gain.setValueAtTime(0, f.ac.currentTime + 0.1);
        }, 1000));
      } catch { f.ac = null; }
      draw(f);
      f.timers.push(setInterval(function () { draw(f); }, 33));
      var attach = function () {
        if (fake !== f) return;
        video.srcObject = f.stream;
        var pr = video.play();
        if (cinemaQ === 'paused') {
          // Autoplay geblockt: das Video bleibt nach dem Laden pausiert, bis .btnPause geklickt wird
          video.addEventListener('playing', function once() { video.removeEventListener('playing', once); video.pause(); });
        } else if (pr && pr.catch) pr.catch(function () { video.muted = true; var p2 = video.play(); if (p2 && p2.catch) p2.catch(function () {}); });
      };
      if (cinemaQ === 'slow') {
        // Langsamer Start: erstes Bild erst nach 15 s, buffered wächst währenddessen
        var t0 = performance.now();
        def('buffered', function () {
          var e = Math.min(30, (performance.now() - t0) / 1000 * 2);
          return { length: 1, start: function () { return 0; }, end: function () { return e; } };
        });
        f.timers.push(setTimeout(attach, 15000));
      } else attach();
    } else {
      setTimeout(function () { if (fake === f) showError(f); }, 3000);
    }

    // OSD (im echten Jellyfin ausgeblendet, die Knöpfe wirken trotzdem); hier zur Handbedienung sichtbar
    f.osd = mk('div', 'page libraryPage', document.body);
    f.osd.id = 'videoOsdPage';
    f.osd.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:15;padding:8px;background:rgba(0,0,0,.6);color:#fff;display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;';
    var btn = function (cls, label, fn) { var b = mk('button', cls, f.osd, label); b.addEventListener('click', fn); return b; };
    btn('btnPreviousTrack hide', 'Zurück-Titel', function () { seek(f, 0); });
    btn('btnRewind', '−10 s', function () { seek(f, nowT(f) - 10); });
    btn('btnPause', 'Pause/Weiter', function () {
      if (video.paused) { if (f.t >= f.dur) f.t = 0; var p = video.play(); if (p && p.catch) p.catch(function () {}); } else video.pause();
    });
    btn('btnFastForward', '+30 s', function () { seek(f, nowT(f) + 30); });
    var nextB = btn('btnNextTrack' + (isSeries ? '' : ' hide'), 'Nächste Folge', function () { startNext(f); });
    nextB.title = 'Nächste Folge';
    btn('btnSubtitles', 'Untertitel', function () { openSheet(f, 'subtitle'); });
    btn('btnAudio', 'Ton', function () { openSheet(f, 'audio'); });
    btn('buttonMute', 'Stumm', function () { video.muted = !video.muted; });
    var pos = mk('input', 'osdPositionSlider', f.osd);
    pos.type = 'range'; pos.min = '0'; pos.max = '100'; pos.step = 'any'; pos.value = '0'; pos.style.width = '30%';
    pos.addEventListener('change', function () { seek(f, (Number(pos.value) / 100) * f.dur); });
    mk('span', 'osdPositionText', f.osd, '00:00:00');
    mk('span', 'osdDurationText', f.osd, '');
    var vol = mk('input', 'osdVolumeSlider', f.osd);
    vol.type = 'range'; vol.min = '0'; vol.max = '100'; vol.value = '100';
    vol.addEventListener('input', function () { video.volume = Math.pow(Math.max(0, Math.min(1, Number(vol.value) / 100)), 3); }); // kubisch wie Jellyfin

    f.up = mk('div', 'upNextContainer upNextDialog hide', document.body);
    f.up.style.cssText = 'position:fixed;right:16px;bottom:70px;z-index:16;background:#222;color:#fff;padding:12px 16px;border-radius:6px;';
    f.upText = mk('div', 'upNextDialog-countdownText', f.up, '');
    mk('div', 'upNextDialog-nextVideoText', f.up, 'Nächste Folge');
    var start = mk('button', 'btnStartNow', f.up, 'Jetzt starten');
    start.addEventListener('click', function () { startNext(f); });
    var hide = mk('button', 'btnHide', f.up, 'Verbergen');
    hide.addEventListener('click', function () { f.upHidden = true; f.up.classList.add('hide'); });

    applySubs(f);
    f.timers.push(setInterval(function () { tickFake(f); }, 100));
    if (!location.hash || routePath() !== '/video') location.hash = '#/video';
    syncStage();
  }

  window.addEventListener('popstate', function () { if (fake && fake.sheet) removeSheet(); });

  if (cinemaMode) {
    deps.play = function (item, o) {
      console.log('[dev] play (fake)', item.Id, o);
      startFake(item, o);
      return Promise.resolve(true);
    };
    if (!location.hash) history.replaceState(null, '', location.pathname + location.search + '#/home');
  }
  window.__devCatalog = catalog;
  window.__devDeps = deps;
  window.__devFake = function () { return fake; };

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
  function boot() {
    start(false);
    window.addEventListener('pagehide', function () { if (bridge) bridge.dispose(); if (inst) inst.dispose(); });
  }
  if (!window.LenzFlixStore3D) { deps.onFatal(new Error('dist/lenzstore.js fehlt – erst npm run build')); return; }
  if (cinemaMode || q.get('xremu') === '1') {
    // Echte Bridge der Hülle (reines DOM, ohne Imports) als Modul laden
    import('/cinema-bridge.js').then(function (m) { bridge = m.createCinemaBridge(); deps.cinema = bridge; window.__devBridge = bridge; }).catch(function (e) { console.warn('[dev] cinema-bridge', e && e.message); }).then(boot);
  } else boot();
}());
