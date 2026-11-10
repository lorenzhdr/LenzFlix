/* LENZFLIX · Meine Statistik. Klassisches Script (ES2016, kein async/await, kein ?. / ??) für Chromium 53 (webOS 4).
   Sicherheit: Daten nur per textContent; Passwort wird nie gespeichert/geloggt; Token nur in localStorage und Headern; kein console-Logging. */
(function () {
  'use strict';

  var API_STATS = '/lenzflix-stats/api/me/stats';
  var KEY_AUTH = 'lfx-stats-auth';
  var KEY_DEVICE = 'lfx-stats-device';
  var KEY_IGNORE = 'lfx-stats-ignore-web';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  var DOW_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  var RANGES = [
    { key: '7d', label: '7 Tage' },
    { key: '30d', label: '30 Tage' },
    { key: 'year', label: 'Dieses Jahr' },
    { key: 'all', label: 'Gesamt' },
  ];
  var RANGE_TITLES = { '7d': 'Letzte 7 Tage', '30d': 'Letzte 30 Tage', year: 'Dieses Jahr', all: 'Gesamtzeit' };
  var METHOD_LABELS = { directPlay: 'Direkt abspielen', directStream: 'Direkt streamen', transcode: 'Transkodiert', other: 'Sonstige' };

  /* ---------- reine Helfer ---------- */

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function fmtInt(n) {
    var v = Number(n) || 0;
    try {
      return v.toLocaleString('de-DE');
    } catch (e) {
      return String(v);
    }
  }

  /** "x Std y Min"; ab 2 Tagen "N Tage x Std". */
  function fmtDuration(sec) {
    var s = Number(sec) || 0;
    if (s <= 0) return '0 Min';
    var m = Math.round(s / 60);
    if (m < 1) return '< 1 Min';
    var days = Math.floor(m / 1440);
    if (days >= 2) {
      var dh = Math.floor((m % 1440) / 60);
      return days + ' Tage' + (dh ? ' ' + dh + ' Std' : '');
    }
    var h = Math.floor(m / 60);
    var mm = m % 60;
    if (!h) return mm + ' Min';
    return h + ' Std' + (mm ? ' ' + mm + ' Min' : '');
  }

  /** Kurzform für Durchschnitte: "27 Std" bzw. "40 Min". */
  function fmtDurationShort(sec) {
    var s = Number(sec) || 0;
    if (s < 3600) return Math.round(s / 60) + ' Min';
    return Math.round(s / 3600) + ' Std';
  }

  /** "2026-11-02" (auch mit Uhrzeit) → "2. November 2026". Manuell, damit alte Browser identisch ausgeben. */
  function fmtDate(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || ''));
    if (!m) return '';
    return parseInt(m[3], 10) + '. ' + MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1];
  }

  /** ISO-Zeitstempel → lokales "10. November 2026, 18:00". */
  function fmtDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getDate() + '. ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ', ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /** Gleicher Auswahlalgorithmus wie src/js/core/api.js (readStoredServer). */
  function pickServer(raw) {
    try {
      var data = typeof raw === 'string' ? JSON.parse(raw || 'null') : raw;
      var servers = (data && data.Servers) || [];
      var found = null;
      for (var i = 0; i < servers.length; i++) {
        if (servers[i] && servers[i].AccessToken && servers[i].UserId) {
          found = servers[i];
          break;
        }
      }
      return found || servers[0] || null;
    } catch (e) {
      return null;
    }
  }

  /** → { token, userId } oder null, wenn kein Token vorhanden ist. */
  function pickCredentials(raw) {
    var s = pickServer(raw);
    if (!s || !s.AccessToken) return null;
    return { token: String(s.AccessToken), userId: s.UserId ? String(s.UserId) : null };
  }

  function stripQuotes(v) {
    return String(v == null ? '' : v).replace(/["\\\r\n]/g, '');
  }

  /** Mit token: `MediaBrowser Token="…"`; sonst Login-Header mit eigener Client-/Geräte-ID. */
  function buildAuthHeader(o) {
    var opt = o || {};
    if (opt.token) return 'MediaBrowser Token="' + stripQuotes(opt.token) + '"';
    return (
      'MediaBrowser Client="LenzFlix Statistik", Device="' + encodeURIComponent(opt.device || 'Browser') +
      '", DeviceId="' + stripQuotes(opt.deviceId) + '", Version="' + stripQuotes(opt.version || '1.0.0') + '"'
    );
  }

  function dayKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** SQLite-%W: Woche des Jahres, Montag = erster Tag, Tage vor dem ersten Montag = Woche 0. */
  function weekOfYear(d) {
    var yday = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86400000);
    return Math.floor((yday + 7 - ((d.getDay() + 6) % 7)) / 7);
  }

  /** Füllt Lücken der dünn besetzten Buckets. opts: { days (nur day), now (Date) }. → [{key, seconds}] sortiert. */
  function fillTimeline(unit, buckets, opts) {
    var o = opts || {};
    var now = o.now || new Date();
    var map = {};
    var list = buckets || [];
    var i;
    for (i = 0; i < list.length; i++) map[list[i].key] = Number(list[i].seconds) || 0;
    var keys = {};
    Object.keys(map).forEach(function (k) {
      keys[k] = true;
    });
    var sortedExisting = Object.keys(map).sort();

    if (unit === 'day') {
      var n = o.days || 0;
      if (!n && sortedExisting.length) {
        var f = /^(\d{4})-(\d{2})-(\d{2})/.exec(sortedExisting[0]);
        var start0 = new Date(Number(f[1]), Number(f[2]) - 1, Number(f[3]));
        var today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        n = Math.round((today0.getTime() - start0.getTime()) / 86400000) + 1;
      }
      for (i = 0; i < n; i++) keys[dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1 - i)))] = true;
    } else if (unit === 'week') {
      var y = now.getFullYear();
      var w0 = weekOfYear(new Date(y, 0, 1));
      var w1 = weekOfYear(now);
      for (i = w0; i <= w1; i++) keys[y + '-' + pad2(i)] = true;
    } else if (unit === 'month' && sortedExisting.length) {
      var p = /^(\d{4})-(\d{2})/.exec(sortedExisting[0]);
      var yy = Number(p[1]);
      var mm = Number(p[2]);
      var endKey = now.getFullYear() * 12 + now.getMonth();
      while (yy * 12 + (mm - 1) <= endKey) {
        keys[yy + '-' + pad2(mm)] = true;
        mm++;
        if (mm > 12) {
          mm = 1;
          yy++;
        }
      }
    }
    return Object.keys(keys)
      .sort()
      .map(function (k) {
        return { key: k, seconds: map[k] || 0 };
      });
  }

  function heatLevel(sec, max) {
    if (!(sec > 0) || !(max > 0)) return 0;
    var l = Math.ceil((sec / max) * 5);
    return l < 1 ? 1 : l > 5 ? 5 : l;
  }

  /** API-dow 0 = Sonntag → Zeile 6 (Zeilen Mo…So). → { matrix[7][24], levels[7][24], max } */
  function buildHeatmap(cells) {
    var matrix = [];
    var d, h;
    for (d = 0; d < 7; d++) {
      matrix.push([]);
      for (h = 0; h < 24; h++) matrix[d].push(0);
    }
    var list = cells || [];
    for (var i = 0; i < list.length; i++) {
      var dow = Number(list[i].dow);
      var hour = Number(list[i].hour);
      if (!(dow >= 0 && dow <= 6 && hour >= 0 && hour <= 23)) continue;
      matrix[(dow + 6) % 7][hour] += Number(list[i].seconds) || 0;
    }
    var max = 0;
    for (d = 0; d < 7; d++) for (h = 0; h < 24; h++) if (matrix[d][h] > max) max = matrix[d][h];
    var levels = matrix.map(function (row) {
      return row.map(function (v) {
        return heatLevel(v, max);
      });
    });
    return { matrix: matrix, levels: levels, max: max };
  }

  /** Anteile der Wiedergabearten (nach Sekunden, ersatzweise Plays); nur Einträge > 0. */
  function methodShares(methods) {
    var m = methods || {};
    var keys = ['directPlay', 'directStream', 'transcode', 'other'];
    var totalSec = 0;
    var totalPlays = 0;
    keys.forEach(function (k) {
      totalSec += (m[k] && Number(m[k].seconds)) || 0;
      totalPlays += (m[k] && Number(m[k].plays)) || 0;
    });
    var bySeconds = totalSec > 0;
    var total = bySeconds ? totalSec : totalPlays;
    var out = [];
    keys.forEach(function (k) {
      var v = m[k] ? Number(bySeconds ? m[k].seconds : m[k].plays) || 0 : 0;
      if (v > 0 && total > 0) out.push({ key: k, label: METHOD_LABELS[k], value: v, share: v / total, seconds: (m[k] && Number(m[k].seconds)) || 0 });
    });
    return out;
  }

  /** Top-5-Geräte nach Watchtime mit Anteil an der Gesamtzeit aller Geräte. */
  function deviceShares(devices) {
    var list = (devices || []).slice().sort(function (a, b) {
      return (Number(b.seconds) || 0) - (Number(a.seconds) || 0);
    });
    var total = 0;
    list.forEach(function (d) {
      total += Number(d.seconds) || 0;
    });
    return list.slice(0, 5).map(function (d) {
      var name = d.device || d.client || 'Unbekannt';
      var label = d.client && d.device && d.client !== d.device ? name + ' · ' + d.client : name;
      return { label: label, seconds: Number(d.seconds) || 0, share: total > 0 ? (Number(d.seconds) || 0) / total : 0 };
    });
  }

  function episodeLabel(season, index) {
    if (season == null || index == null) return '';
    return 'S' + pad2(Number(season)) + 'E' + pad2(Number(index));
  }

  function normId(id) {
    return String(id || '').replace(/-/g, '').toLowerCase();
  }

  function compareText(c) {
    if (!c) return '';
    return 'Platz ' + c.rank + ' von ' + c.of + ' · Ø ' + fmtDurationShort(c.avgSeconds);
  }

  function isEmptyStats(s) {
    var t = (s && s.totals) || {};
    return !(Number(t.seconds) > 0) && !(Number(t.plays) > 0);
  }

  function collectIds(stats) {
    var seen = {};
    var out = [];
    function add(id) {
      var n = normId(id);
      if (n && !seen[n]) {
        seen[n] = true;
        out.push(n);
      }
    }
    (stats.topSeries || []).forEach(function (x) {
      add(x.id);
    });
    (stats.topMovies || []).forEach(function (x) {
      add(x.id);
    });
    if (stats.binge && stats.binge.seriesDay) add(stats.binge.seriesDay.seriesId);
    return out;
  }

  /* ---------- Requests (Token nur im Header) ---------- */

  function buildStatsRequest(range, token) {
    return {
      url: API_STATS + '?range=' + encodeURIComponent(range),
      init: { method: 'GET', headers: { 'X-Emby-Token': token }, credentials: 'omit' },
    };
  }

  function buildLoginRequest(username, password, device, deviceId) {
    return {
      url: '/Users/AuthenticateByName',
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: buildAuthHeader({ device: device, deviceId: deviceId, version: '1.0.0' }),
        },
        body: JSON.stringify({ Username: username, Pw: password }),
        credentials: 'omit',
      },
    };
  }

  function safeParse(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  function requestJson(url, init) {
    return window.fetch(url, init).then(function (res) {
      return res.text().then(function (text) {
        return { status: res.status, ok: res.ok, json: safeParse(text) };
      });
    });
  }

  function jfInit(token) {
    return { method: 'GET', headers: { Authorization: buildAuthHeader({ token: token }) }, credentials: 'omit' };
  }

  function fail(code) {
    var e = new Error(code);
    e.code = code;
    return e;
  }

  /** → Promise<stats>; Fehler mit .code 'unauthorized' | 'unreachable'. */
  function loadStats(range, token) {
    var r = buildStatsRequest(range, token);
    return requestJson(r.url, r.init).then(
      function (res) {
        if (res.status === 401 || res.status === 403) throw fail('unauthorized');
        if (res.ok && res.json && res.json.totals) return res.json;
        throw fail('unreachable');
      },
      function () {
        throw fail('unreachable');
      }
    );
  }

  /** → Promise<{ [normId]: {name, tag, type} }>; Fehler → leere Map. */
  function loadItems(ids, token, userId) {
    if (!ids.length) return Promise.resolve({});
    var url = '/Items?Ids=' + ids.join(',') + '&Fields=PrimaryImageAspectRatio&EnableImages=true&EnableUserData=false' + (userId ? '&userId=' + encodeURIComponent(userId) : '');
    return requestJson(url, jfInit(token)).then(
      function (res) {
        var map = {};
        var items = (res.ok && res.json && res.json.Items) || [];
        items.forEach(function (it) {
          if (it && it.Id) map[normId(it.Id)] = { name: it.Name || '', tag: (it.ImageTags && it.ImageTags.Primary) || '', type: it.Type || '' };
        });
        return map;
      },
      function () {
        return {};
      }
    );
  }

  /* ---------- DOM-Helfer (nur textContent) ---------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function svgEl(tag, attrs, text) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      n.setAttribute(k, String(attrs[k]));
    });
    if (text != null) n.textContent = text;
    return n;
  }

  function clear(n) {
    while (n.firstChild) n.removeChild(n.firstChild);
  }

  var blobUrls = [];
  function revokeBlobs() {
    blobUrls.forEach(function (u) {
      try {
        URL.revokeObjectURL(u);
      } catch (e) {
        /* ignorieren */
      }
    });
    blobUrls = [];
    posterCache = {};
  }

  var S = { token: null, userId: null, own: false, range: '30d', items: {}, stats: null };

  /** Poster per fetch + Auth-Header → Blob-URL (kein Token in der Bild-URL). */
  var posterCache = {};

  /** → Promise<blob-URL | null>; pro Item-ID nur ein Request (auch fürs Share-Bild). */
  function fetchPosterUrl(id, tag) {
    if (!id || !tag || !S.token || !window.fetch) return Promise.resolve(null);
    if (posterCache[id]) return posterCache[id];
    var url = '/Items/' + encodeURIComponent(id) + '/Images/Primary?maxWidth=300&tag=' + encodeURIComponent(tag);
    posterCache[id] = window.fetch(url, jfInit(S.token)).then(function (res) {
      if (!res.ok) return null;
      return res.blob();
    }).then(function (blob) {
      if (!blob) return null;
      var u = URL.createObjectURL(blob);
      blobUrls.push(u);
      return u;
    }).catch(function () {
      return null;
    });
    return posterCache[id];
  }

  function fillPoster(box, id, tag) {
    fetchPosterUrl(id, tag).then(function (u) {
      if (!u || !box.parentNode) return;
      var img = document.createElement('img');
      img.alt = '';
      img.src = u;
      clear(box);
      box.appendChild(img);
    });
  }

  function makePoster(title, id, tag) {
    var box = el('div', 'poster', (title || '?').charAt(0).toUpperCase());
    fillPoster(box, id, tag);
    return box;
  }

  /** Posterreihe für Top-Serien/-Filme. Fehlende Items werden übersprungen. → Anzahl gezeigter Karten. */
  function renderTopList(container, list, items, kind) {
    var shown = 0;
    (list || []).forEach(function (entry) {
      var id = normId(entry.id);
      var it = items[id];
      if (!it) return;
      shown++;
      var card = el('div', 'tcard');
      card.appendChild(el('div', 'rank', String(shown)));
      card.appendChild(makePoster(it.name, id, it.tag));
      var name = el('div', 'tname', it.name);
      name.setAttribute('title', it.name);
      card.appendChild(name);
      var meta = fmtDuration(entry.seconds);
      if (kind === 'series') meta += ' · ' + fmtInt(entry.episodes) + (entry.episodes === 1 ? ' Folge' : ' Folgen');
      else if (entry.plays > 1) meta += ' · ' + fmtInt(entry.plays) + 'x';
      card.appendChild(el('div', 'tmeta', meta));
      container.appendChild(card);
    });
    return shown;
  }

  function renderShareBars(container, rows) {
    rows.forEach(function (r) {
      var wrap = el('div', 'share');
      var head = el('div', 'share-h');
      head.appendChild(el('span', null, r.label));
      head.appendChild(el('span', null, Math.round(r.share * 100) + ' % · ' + fmtDuration(r.seconds)));
      wrap.appendChild(head);
      var track = el('div', 'track');
      var fill = el('div', 'fill');
      fill.style.width = Math.max(1, Math.round(r.share * 100)) + '%';
      track.appendChild(fill);
      wrap.appendChild(track);
      container.appendChild(wrap);
    });
  }

  function bucketLabel(unit, key) {
    if (unit === 'day') return fmtDate(key);
    if (unit === 'month') {
      var m = /^(\d{4})-(\d{2})$/.exec(key);
      return m ? MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1] : key;
    }
    var w = /^(\d{4})-(\d{2})$/.exec(key);
    return w ? 'Woche ' + parseInt(w[2], 10) + ', ' + w[1] : key;
  }

  function axisLabel(unit, key) {
    if (unit === 'day') {
      var d = /^\d{4}-(\d{2})-(\d{2})/.exec(key);
      return d ? parseInt(d[2], 10) + '.' + parseInt(d[1], 10) + '.' : key;
    }
    if (unit === 'month') {
      var m = /^(\d{4})-(\d{2})$/.exec(key);
      return m ? MONTHS_SHORT[parseInt(m[2], 10) - 1] + ' ' + m[1].slice(2) : key;
    }
    var w = /^\d{4}-(\d{2})$/.exec(key);
    return w ? 'KW ' + parseInt(w[1], 10) : key;
  }

  function renderTimeline(container, stats) {
    var unit = (stats.timeline && stats.timeline.unit) || 'day';
    var days = S.range === '7d' ? 7 : S.range === '30d' ? 30 : 0;
    var data = fillTimeline(unit, (stats.timeline && stats.timeline.buckets) || [], { days: days, now: new Date() });
    if (!data.length) {
      container.appendChild(el('p', 'sub', 'Keine Daten im Zeitraum.'));
      return;
    }
    var W = 600;
    var H = 140;
    var max = 0;
    data.forEach(function (b) {
      if (b.seconds > max) max = b.seconds;
    });
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + (H + 22), class: 'chart', role: 'img', 'aria-label': 'Watchtime im Verlauf', preserveAspectRatio: 'xMidYMid meet' });
    var slot = W / data.length;
    var bw = Math.max(1, slot * 0.72);
    data.forEach(function (b, i) {
      var h = max > 0 && b.seconds > 0 ? Math.max(2, (b.seconds / max) * (H - 6)) : 0;
      var rect = svgEl('rect', { class: 'bar', x: (i * slot + (slot - bw) / 2).toFixed(2), y: (H - h).toFixed(2), width: bw.toFixed(2), height: h.toFixed(2), rx: 1.5 });
      rect.appendChild(svgEl('title', {}, bucketLabel(unit, b.key) + ': ' + fmtDuration(b.seconds)));
      svg.appendChild(rect);
    });
    svg.appendChild(svgEl('line', { x1: 0, x2: W, y1: H + 0.5, y2: H + 0.5, stroke: '#404040', 'stroke-width': 1 }));
    var last = data.length - 1;
    var mid = Math.floor(last / 2);
    svg.appendChild(svgEl('text', { x: 0, y: H + 16, 'text-anchor': 'start' }, axisLabel(unit, data[0].key)));
    if (last >= 2) svg.appendChild(svgEl('text', { x: (mid * slot + slot / 2).toFixed(1), y: H + 16, 'text-anchor': 'middle' }, axisLabel(unit, data[mid].key)));
    if (last >= 1) svg.appendChild(svgEl('text', { x: W, y: H + 16, 'text-anchor': 'end' }, axisLabel(unit, data[last].key)));
    container.appendChild(svg);
  }

  function renderHeatmap(container, stats) {
    var hm = buildHeatmap(stats.heatmap);
    var LW = 26;
    var CW = 20;
    var svg = svgEl('svg', { viewBox: '0 0 ' + (LW + 24 * CW) + ' ' + (7 * CW + 18), class: 'chart', role: 'img', 'aria-label': 'Wann du schaust: Wochentage und Uhrzeiten' });
    var d, h;
    for (d = 0; d < 7; d++) {
      svg.appendChild(svgEl('text', { x: 0, y: d * CW + 14 }, DOW_LABELS[d]));
      for (h = 0; h < 24; h++) {
        var lv = hm.levels[d][h];
        var rect = svgEl('rect', { x: LW + h * CW, y: d * CW, width: CW - 2, height: CW - 2, rx: 3, class: lv ? 'hm-cell lv' + lv : 'hm-empty' });
        if (lv) {
          rect.setAttribute('fill-opacity', String([0, 0.2, 0.4, 0.6, 0.8, 1][lv]));
          rect.appendChild(svgEl('title', {}, DOW_LABELS[d] + ', ' + h + ' Uhr: ' + fmtDuration(hm.matrix[d][h])));
        }
        svg.appendChild(rect);
      }
    }
    [0, 6, 12, 18].forEach(function (hh) {
      svg.appendChild(svgEl('text', { x: LW + hh * CW, y: 7 * CW + 14 }, hh + ' Uhr'));
    });
    container.appendChild(svg);
  }

  function kpi(label, value, wide) {
    var k = el('div', wide ? 'kpi wide' : 'kpi');
    k.appendChild(el('div', 'kpi-v', value));
    k.appendChild(el('div', 'kpi-l', label));
    return k;
  }

  function panel(title, half) {
    var p = el('section', half ? 'panel half' : 'panel');
    if (title) p.appendChild(el('h2', null, title));
    return p;
  }

  /* ---------- Ansichten ---------- */

  var root = null;

  function setView(node) {
    if (!root || !document.body.contains(root)) root = document.getElementById('lfx-app') || root;
    closeShareDialog(false);
    revokeBlobs();
    clear(root);
    root.appendChild(node);
  }

  /**
   * Ladeanzeige: laufender Balken (unbestimmt, ehrlich: der Server meldet keinen Fortschritt),
   * Titel, „Schritt n von m“ und ein optionaler Hinweis, wenn es länger dauert.
   */
  function showLoading(label, step, total) {
    var wrap = el('div', 'loading');
    wrap.setAttribute('role', 'status');
    var title = el('p', 'loading-title', label);
    var bar = el('div', 'progress');
    bar.appendChild(el('div', 'progress-run'));
    var meta = el('p', 'loading-sub', total ? 'Schritt ' + step + ' von ' + total : '');
    var hint = el('p', 'loading-sub');
    wrap.appendChild(title);
    wrap.appendChild(bar);
    wrap.appendChild(meta);
    wrap.appendChild(hint);
    setView(wrap);
    return {
      step: function (text, n) {
        title.textContent = text;
        meta.textContent = total ? 'Schritt ' + n + ' von ' + total : '';
      },
      hint: function (text) {
        hint.textContent = text;
      },
    };
  }

  function showMessage(text, retry) {
    var wrap = el('div');
    wrap.appendChild(el('p', 'notice', text));
    if (retry) {
      var b = el('button', 'btn', 'Erneut versuchen');
      b.type = 'button';
      b.addEventListener('click', retry);
      wrap.appendChild(b);
    }
    setView(wrap);
  }

  function showWrongOrigin() {
    showMessage('Diese Seite muss über deinen Jellyfin-Server geöffnet werden.');
  }

  function randomId() {
    var out = '';
    var arr = null;
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        arr = new Uint8Array(16);
        window.crypto.getRandomValues(arr);
      }
    } catch (e) {
      arr = null;
    }
    for (var i = 0; i < 16; i++) {
      var b = arr ? arr[i] : Math.floor(Math.random() * 256);
      out += (b < 16 ? '0' : '') + b.toString(16);
    }
    return out;
  }

  function deviceId() {
    var id = null;
    try {
      id = window.localStorage.getItem(KEY_DEVICE);
      if (!id) {
        id = randomId();
        window.localStorage.setItem(KEY_DEVICE, id);
      }
    } catch (e) {
      id = id || randomId();
    }
    return id;
  }

  function deviceName() {
    var ua = (window.navigator && window.navigator.userAgent) || '';
    if (/iPhone|iPad|iPod/.test(ua)) return 'iPhone/iPad Browser';
    if (/Android/.test(ua)) return 'Android Browser';
    if (/Web0S|webOS|SmartTV|Tizen/i.test(ua)) return 'Smart-TV Browser';
    return 'Browser';
  }

  function storeAuth(a) {
    try {
      window.localStorage.setItem(KEY_AUTH, JSON.stringify({ token: a.token, userId: a.userId, own: true }));
    } catch (e) {
      /* ohne Speicher: nur für diese Sitzung */
    }
  }

  function dropAuth() {
    S.token = null;
    S.userId = null;
    S.own = false;
    try {
      window.localStorage.removeItem(KEY_AUTH);
    } catch (e) {
      /* ignorieren */
    }
  }

  function showLogin(message) {
    var wrap = el('div', 'login');
    wrap.appendChild(el('h1', null, 'Meine Statistik'));
    wrap.appendChild(el('p', 'sub', 'Melde dich mit deinem Jellyfin-Konto an. Es werden nur deine eigenen Daten angezeigt.'));
    var form = el('form');
    form.setAttribute('autocomplete', 'on');
    var l1 = el('label', null, 'Benutzername');
    l1.setAttribute('for', 'lfx-user');
    var user = el('input');
    user.type = 'text';
    user.id = 'lfx-user';
    user.name = 'username';
    user.setAttribute('autocomplete', 'username');
    user.setAttribute('autocapitalize', 'none');
    user.setAttribute('autocorrect', 'off');
    var l2 = el('label', null, 'Passwort');
    l2.setAttribute('for', 'lfx-pw');
    var pw = el('input');
    pw.type = 'password';
    pw.id = 'lfx-pw';
    pw.name = 'password';
    pw.setAttribute('autocomplete', 'current-password');
    var err = el('p', 'err', message || '');
    var btn = el('button', 'btn', 'Anmelden');
    btn.type = 'submit';
    form.appendChild(l1);
    form.appendChild(user);
    form.appendChild(l2);
    form.appendChild(pw);
    form.appendChild(err);
    form.appendChild(btn);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = user.value;
      var pass = pw.value;
      if (!name) {
        err.textContent = 'Bitte Benutzernamen eingeben.';
        return;
      }
      btn.disabled = true;
      err.textContent = '';
      var r = buildLoginRequest(name, pass, deviceName(), deviceId());
      requestJson(r.url, r.init).then(
        function (res) {
          pw.value = '';
          if (res.status === 401 || res.status === 400) {
            btn.disabled = false;
            err.textContent = 'Benutzername oder Passwort falsch';
            return;
          }
          if (!res.ok || !res.json || !res.json.AccessToken || !res.json.User) {
            btn.disabled = false;
            err.textContent = 'Server gerade nicht erreichbar';
            return;
          }
          S.token = String(res.json.AccessToken);
          S.userId = String(res.json.User.Id || '');
          S.own = true;
          storeAuth(S);
          loadAll();
        },
        function () {
          pw.value = '';
          btn.disabled = false;
          err.textContent = 'Server gerade nicht erreichbar';
        }
      );
    });
    wrap.appendChild(form);
    setView(wrap);
  }

  function logout() {
    var wasOwn = S.own;
    var token = S.token;
    if (wasOwn && token) {
      window.fetch('/Sessions/Logout', { method: 'POST', headers: { Authorization: buildAuthHeader({ token: token }) }, credentials: 'omit' }).catch(function () {
        /* lokal wird trotzdem abgemeldet */
      });
    } else {
      try {
        window.localStorage.setItem(KEY_IGNORE, '1');
      } catch (e) {
        /* ignorieren */
      }
    }
    dropAuth();
    showLogin('');
  }

  function drawDashboard(stats) {
    var wrap = el('div');
    wrap.appendChild(el('h1', null, 'Meine Statistik'));

    var tabs = el('div', 'tabs');
    RANGES.forEach(function (r) {
      var t = el('button', r.key === S.range ? 'tab on' : 'tab', r.label);
      t.type = 'button';
      t.addEventListener('click', function () {
        if (S.range === r.key) return;
        S.range = r.key;
        loadAll();
      });
      tabs.appendChild(t);
    });
    wrap.appendChild(tabs);

    if (stats.stale) wrap.appendChild(el('p', 'notice warn', 'Stand: ' + fmtDateTime(stats.computedAt) + ' – Server gerade nicht erreichbar'));
    if (stats.ignored) {
      wrap.appendChild(el('p', 'notice', 'Für dein Konto werden keine Statistiken erfasst.'));
    } else if (isEmptyStats(stats)) {
      wrap.appendChild(el('p', 'notice', 'In diesem Zeitraum hast du noch nichts geschaut. Starte einen Film oder eine Serie, dann füllt sich diese Seite.'));
    } else {
      drawStats(wrap, stats);
    }

    var actions = el('div', 'actions');
    if (!stats.ignored && !isEmptyStats(stats)) {
      var save = el('button', 'btn', 'Als Bild speichern');
      save.type = 'button';
      save.addEventListener('click', function () {
        openShareDialog(stats, save);
      });
      actions.appendChild(save);
    }
    var out = el('button', 'btn ghost', 'Abmelden');
    out.type = 'button';
    out.addEventListener('click', logout);
    actions.appendChild(out);
    wrap.appendChild(actions);
    wrap.appendChild(el('p', 'foot', 'Es werden nur deine eigenen Wiedergaben angezeigt. Das Bild wird auf deinem Gerät erzeugt und nirgends hochgeladen.'));
    setView(wrap);
    loadNextUp();
  }

  function drawStats(wrap, stats) {
    var t = stats.totals || {};
    var kp = el('div', 'row');
    kp.appendChild(kpi('Watchtime', fmtDuration(t.seconds), true));
    kp.appendChild(kpi('Folgen', fmtInt(t.episodes)));
    kp.appendChild(kpi('Filme', fmtInt(t.movies)));
    kp.appendChild(kpi('Serien', fmtInt(t.series)));
    kp.appendChild(kpi('Aktive Tage', fmtInt(t.activeDays)));
    wrap.appendChild(kp);

    if (stats.compare) {
      var cp = el('div', 'panel');
      cp.appendChild(el('p', 'big', compareText(stats.compare)));
      cp.appendChild(el('p', 'sub', 'Dein Platz nach Watchtime unter allen aktiven Nutzern. Mehr Details über andere gibt es nicht.'));
      wrap.appendChild(cp);
    }
    if (stats.approx) wrap.appendChild(el('p', 'notice warn', 'Die Serien-Zuordnung ist bei sehr vielen Folgen nur näherungsweise.'));

    var topS = panel('Top-Serien', false);
    var rail1 = el('div', 'rail');
    if (renderTopList(rail1, stats.topSeries, S.items, 'series')) {
      topS.appendChild(rail1);
      wrap.appendChild(topS);
    }
    var topM = panel('Top-Filme', false);
    var rail2 = el('div', 'rail');
    if (renderTopList(rail2, stats.topMovies, S.items, 'movie')) {
      topM.appendChild(rail2);
      wrap.appendChild(topM);
    }

    var row = el('div', 'row');
    var pv = panel('Verlauf', true);
    pv.appendChild(el('p', 'sub', RANGE_TITLES[stats.range] || ''));
    renderTimeline(pv, stats);
    row.appendChild(pv);
    var ph = panel('Wann du schaust', true);
    ph.appendChild(el('p', 'sub', 'Je dunkler, desto weniger – je roter, desto mehr.'));
    renderHeatmap(ph, stats);
    row.appendChild(ph);
    wrap.appendChild(row);

    var b = stats.binge || {};
    if (b.topDay || b.seriesDay) {
      var pb = panel('Bester Binge', false);
      if (b.topDay) pb.appendChild(el('p', 'big', fmtDate(b.topDay.date) + ' · ' + fmtDuration(b.topDay.seconds)));
      if (b.topDay) pb.appendChild(el('p', 'sub', 'Dein Tag mit der meisten Watchtime.'));
      if (b.seriesDay) {
        var sd = S.items[normId(b.seriesDay.seriesId)];
        var n = Number(b.seriesDay.episodes) || 0;
        pb.appendChild(el('p', null, n + (n === 1 ? ' Folge' : ' Folgen') + ' von ' + (sd ? sd.name : 'einer Serie') + ' am ' + fmtDate(b.seriesDay.date)));
      }
      wrap.appendChild(pb);
    }

    var row2 = el('div', 'row');
    var dev = deviceShares(stats.devices);
    if (dev.length) {
      var pd = panel('Geräte', true);
      renderShareBars(pd, dev);
      row2.appendChild(pd);
    }
    var met = methodShares(stats.methods);
    if (met.length) {
      var pm = panel('Wiedergabeart', true);
      renderShareBars(pm, met);
      row2.appendChild(pm);
    }
    wrap.appendChild(row2);

    var next = panel('Weiterschauen', false);
    next.id = 'lfx-nextup';
    next.hidden = true;
    wrap.appendChild(next);
  }

  /** „Angefangen, nicht beendet“; Fehler blenden den Abschnitt nur aus. */
  function loadNextUp() {
    var sec = document.getElementById('lfx-nextup');
    if (!sec || !S.userId) return;
    var url = '/Shows/NextUp?userId=' + encodeURIComponent(S.userId) + '&Limit=12&Fields=PrimaryImageAspectRatio&EnableImages=true';
    requestJson(url, jfInit(S.token)).then(function (res) {
      var items = (res.ok && res.json && res.json.Items) || [];
      if (!items.length || !sec.parentNode) return;
      var rail = el('div', 'rail');
      items.forEach(function (it) {
        if (!it || !it.Id) return;
        var series = it.SeriesName || it.Name || '';
        var card = el('div', 'tcard');
        var useSeries = it.SeriesId && it.SeriesPrimaryImageTag;
        card.appendChild(makePoster(series, normId(useSeries ? it.SeriesId : it.Id), useSeries ? it.SeriesPrimaryImageTag : (it.ImageTags && it.ImageTags.Primary) || ''));
        var nm = el('div', 'tname', series);
        nm.setAttribute('title', series);
        card.appendChild(nm);
        var ep = episodeLabel(it.ParentIndexNumber, it.IndexNumber);
        card.appendChild(el('div', 'tmeta', ep || it.Name || ''));
        rail.appendChild(card);
      });
      sec.appendChild(rail);
      sec.hidden = false;
    }).catch(function () {
      /* Abschnitt bleibt versteckt */
    });
  }

  /* ---------- Bild teilen (Dialog mit Vorschau, Varianten und Formaten) ---------- */

  var SHARE_FONT = '"LenzFlix Sans", Helvetica, Arial, sans-serif';
  var FORMATS = {
    '4:5': { w: 1080, h: 1350, file: '4x5', label: '4:5' },
    story: { w: 1080, h: 1920, file: 'story', label: 'Story 9:16' },
  };
  var FORMAT_KEYS = ['4:5', 'story'];
  var VARIANTS = [
    { key: 'overview', label: 'Überblick' },
    { key: 'top', label: 'Top' },
    { key: 'activity', label: 'Verlauf' },
    { key: 'binge', label: 'Binge' },
  ];
  var HEAT_ALPHA = [0, 0.2, 0.4, 0.6, 0.8, 1];

  function fitText(ctx, text, maxW) {
    var t = String(text || '');
    if (ctx.measureText(t).width <= maxW) return t;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  function shareFileName(variant, format) {
    var f = FORMATS[format] || FORMATS['4:5'];
    return 'lenzflix-' + variant + '-' + f.file + '.png';
  }

  function heatColor(level) {
    return level > 0 ? 'rgba(229, 9, 20, ' + HEAT_ALPHA[level] + ')' : '#232323';
  }

  /** Einträge einer Top-Liste, zu denen ein Item (Name) bekannt ist; höchstens max. */
  function topEntries(list, items, max) {
    var out = [];
    (list || []).forEach(function (entry) {
      if (out.length >= max) return;
      var id = normId(entry && entry.id);
      var it = items && items[id];
      if (it) out.push({ id: id, name: it.name || '', tag: it.tag || '', entry: entry });
    });
    return out;
  }

  function shareMethods(stats) {
    return methodShares(stats.methods).filter(function (m) {
      return m.seconds > 0;
    });
  }

  function shareDevices(stats) {
    return deviceShares(stats.devices).filter(function (d) {
      return d.seconds > 0;
    });
  }

  /** Schlüssel der Varianten, für die Daten vorliegen (Reihenfolge wie VARIANTS). */
  function shareVariants(stats, items) {
    var s = stats || {};
    var out = ['overview'];
    if (topEntries(s.topSeries, items, 1).length || topEntries(s.topMovies, items, 1).length) out.push('top');
    var hasTl = !!(s.timeline && s.timeline.buckets && s.timeline.buckets.length);
    var hasBuckets = hasTl && s.timeline.buckets.some(function (x) {
      return Number(x.seconds) > 0;
    });
    if (hasBuckets || buildHeatmap(s.heatmap).max > 0) out.push('activity');
    var b = s.binge || {};
    if (b.topDay || b.seriesDay || shareDevices(s).length || shareMethods(s).length) out.push('binge');
    return out;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    var rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function stxt(g, s, x, y, size, weight, color, maxW, align) {
    var ctx = g.ctx;
    ctx.font = weight + ' ' + size + 'px ' + SHARE_FONT;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.fillText(maxW ? fitText(ctx, s, maxW) : String(s), x, y);
  }

  function drawFrame(g) {
    var ctx = g.ctx;
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, g.W, g.H);
    ctx.fillStyle = '#e50914';
    ctx.fillRect(0, 0, g.W, 14);
    ctx.textBaseline = 'alphabetic';
    stxt(g, 'LENZFLIX', g.x, g.top + 170, 76, 800, '#e50914');
    stxt(g, 'Meine Statistik · ' + (RANGE_TITLES[g.stats.range] || ''), g.x, g.top + 235, 40, 500, '#b3b3b3', g.cw);
    stxt(g, 'Inoffizielles Jellyfin-Theme', g.x, g.footY, 34, 500, '#808080', g.cw);
  }

  function drawOverview(g) {
    var t = g.stats.totals || {};
    var f = g.f;
    var y = g.y0;
    stxt(g, 'Watchtime', g.x, y + 50 * f, 44, 500, '#b3b3b3');
    var wt = fmtDuration(t.seconds);
    var wsize = 130;
    g.ctx.font = '800 ' + wsize + 'px ' + SHARE_FONT;
    while (wsize > 56 && g.ctx.measureText(wt).width > g.cw) {
      wsize -= 10;
      g.ctx.font = '800 ' + wsize + 'px ' + SHARE_FONT;
    }
    stxt(g, wt, g.x, y + 200 * f, wsize, 800, '#ffffff', g.cw);
    var counts =
      fmtInt(t.episodes) + (Number(t.episodes) === 1 ? ' Folge' : ' Folgen') + ' · ' +
      fmtInt(t.movies) + (Number(t.movies) === 1 ? ' Film' : ' Filme') + ' · ' +
      fmtInt(t.series) + (Number(t.series) === 1 ? ' Serie' : ' Serien');
    stxt(g, counts, g.x, y + 320 * f, 52, 600, '#ffffff', g.cw);
    stxt(g, fmtInt(t.activeDays) + (Number(t.activeDays) === 1 ? ' aktiver Tag' : ' aktive Tage'), g.x, y + 395 * f, 44, 500, '#b3b3b3', g.cw);
    if (g.stats.compare) stxt(g, compareText(g.stats.compare), g.x, y + 465 * f, 44, 500, '#b3b3b3', g.cw);
    var top = topEntries(g.stats.topSeries, g.items, 1)[0];
    if (top) {
      stxt(g, 'Top-Serie', g.x, y + 620 * f, 44, 500, '#b3b3b3');
      stxt(g, top.name, g.x, y + 710 * f, 72, 700, '#ffffff', g.cw);
    }
  }

  function drawPoster(g, x, y, w, h, name, img) {
    var ctx = g.ctx;
    var done = false;
    if (img && (img.naturalWidth || img.width)) {
      try {
        var sw = img.naturalWidth || img.width;
        var sh = img.naturalHeight || img.height;
        var sc = Math.max(w / sw, h / sh);
        var cw = w / sc;
        var ch = h / sc;
        ctx.save();
        roundRectPath(ctx, x, y, w, h, 8);
        ctx.clip();
        ctx.drawImage(img, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, w, h);
        ctx.restore();
        done = true;
      } catch (e) {
        done = false;
      }
    }
    if (done) return;
    ctx.fillStyle = '#2f2f2f';
    roundRectPath(ctx, x, y, w, h, 8);
    ctx.fill();
    stxt(g, (name || '?').charAt(0).toUpperCase(), x + w / 2, y + h / 2 + h * 0.14, Math.round(h * 0.4), 800, '#808080', 0, 'center');
  }

  function drawTopRow(g, e, rank, y, rh, kind) {
    var ph = rh - 14;
    var pw = Math.round((ph * 2) / 3);
    var px = g.x + 60;
    var tx = px + pw + 24;
    var maxW = g.W - g.x - tx;
    stxt(g, String(rank), g.x, y + ph / 2 + 14, 40, 800, '#e50914');
    drawPoster(g, px, y, pw, ph, e.name, g.posters[e.id]);
    var meta = fmtDuration(e.entry.seconds);
    if (kind === 'series') meta += ' · ' + fmtInt(e.entry.episodes) + (Number(e.entry.episodes) === 1 ? ' Folge' : ' Folgen');
    else if (Number(e.entry.plays) > 1) meta += ' · ' + fmtInt(e.entry.plays) + 'x';
    var nameSize = rh >= 100 ? 40 : 34;
    stxt(g, e.name, tx, y + ph / 2 - 4, nameSize, 700, '#ffffff', maxW);
    stxt(g, meta, tx, y + ph / 2 + 34, 32, 500, '#b3b3b3', maxW);
  }

  function drawTop(g) {
    var ser = topEntries(g.stats.topSeries, g.items, g.story ? 6 : 5);
    var mov = topEntries(g.stats.topMovies, g.items, g.story ? 4 : 3);
    var total = ser.length + mov.length;
    var heads = (ser.length ? 1 : 0) + (mov.length ? 1 : 0);
    if (!total) return;
    var rh = Math.min(130, Math.floor((g.y1 - g.y0 - heads * 100) / total));
    var y = g.y0;
    function block(title, list, kind) {
      if (!list.length) return;
      stxt(g, title, g.x, y + 40, 44, 500, '#b3b3b3');
      y += 80;
      list.forEach(function (e, i) {
        drawTopRow(g, e, i + 1, y, rh, kind);
        y += rh;
      });
      y += 20;
    }
    block('Top-Serien', ser, 'series');
    block('Top-Filme', mov, 'movie');
  }

  function drawActivity(g) {
    var st = g.stats;
    var f = g.f;
    var ctx = g.ctx;
    var y = g.y0;
    var unit = (st.timeline && st.timeline.unit) || 'day';
    var days = st.range === '7d' ? 7 : st.range === '30d' ? 30 : 0;
    var data = fillTimeline(unit, (st.timeline && st.timeline.buckets) || [], { days: days, now: g.now });
    var max = 0;
    data.forEach(function (b) {
      if (b.seconds > max) max = b.seconds;
    });
    if (data.length && max > 0) {
      var chartH = Math.round(260 * f);
      var base = y + 70 + chartH;
      stxt(g, 'Verlauf', g.x, y + 40, 44, 500, '#b3b3b3');
      var slot = g.cw / data.length;
      var bw = Math.max(1, slot * 0.72);
      ctx.fillStyle = '#e50914';
      data.forEach(function (b, i) {
        if (!(b.seconds > 0)) return;
        var h = Math.max(3, (b.seconds / max) * chartH);
        ctx.fillRect(g.x + i * slot + (slot - bw) / 2, base - h, bw, h);
      });
      ctx.fillStyle = '#404040';
      ctx.fillRect(g.x, base, g.cw, 2);
      var last = data.length - 1;
      var mid = Math.floor(last / 2);
      stxt(g, axisLabel(unit, data[0].key), g.x, base + 36, 28, 500, '#808080', 0, 'left');
      if (last >= 2) stxt(g, axisLabel(unit, data[mid].key), g.x + mid * slot + slot / 2, base + 36, 28, 500, '#808080', 0, 'center');
      if (last >= 1) stxt(g, axisLabel(unit, data[last].key), g.x + g.cw, base + 36, 28, 500, '#808080', 0, 'right');
      y = base + 36 + 50 * f;
    }
    var hm = buildHeatmap(st.heatmap);
    if (hm.max > 0) {
      var lw = 70;
      var cs = Math.floor((g.cw - lw) / 24);
      var chh = Math.round(cs * (f > 1.2 ? 1.3 : 1));
      var gy = y + 70;
      stxt(g, 'Wann du schaust', g.x, y + 40, 44, 500, '#b3b3b3');
      var d, h;
      for (d = 0; d < 7; d++) {
        stxt(g, DOW_LABELS[d], g.x, gy + d * chh + chh * 0.7, 26, 500, '#b3b3b3', 0, 'left');
        for (h = 0; h < 24; h++) {
          var lv = hm.levels[d][h];
          var cx = g.x + lw + h * cs;
          var cy = gy + d * chh;
          ctx.fillStyle = '#232323';
          ctx.fillRect(cx, cy, cs - 4, chh - 4);
          if (lv > 0) {
            ctx.fillStyle = heatColor(lv);
            ctx.fillRect(cx, cy, cs - 4, chh - 4);
          }
        }
      }
      [0, 6, 12, 18].forEach(function (hh) {
        stxt(g, hh + ' Uhr', g.x + lw + hh * cs, gy + 7 * chh + 32, 26, 500, '#808080', 0, 'left');
      });
    }
  }

  function drawShareRows(g, rows, y, rh) {
    var ctx = g.ctx;
    var size = Math.min(34, Math.floor(rh * 0.5));
    rows.forEach(function (r) {
      var right = Math.round(r.share * 100) + ' % · ' + fmtDuration(r.seconds);
      stxt(g, right, g.x + g.cw, y + size, size, 500, '#b3b3b3', 0, 'right');
      var rw = ctx.measureText(right).width;
      stxt(g, r.label, g.x, y + size, size, 600, '#ffffff', Math.max(100, g.cw - rw - 24), 'left');
      ctx.fillStyle = '#2f2f2f';
      roundRectPath(ctx, g.x, y + size + 12, g.cw, 12, 6);
      ctx.fill();
      ctx.fillStyle = '#e50914';
      roundRectPath(ctx, g.x, y + size + 12, Math.max(12, g.cw * r.share), 12, 6);
      ctx.fill();
      y += rh;
    });
  }

  function drawBinge(g) {
    var b = g.stats.binge || {};
    var dev = shareDevices(g.stats);
    var met = shareMethods(g.stats);
    var y = g.y0;
    if (b.topDay) {
      stxt(g, 'Bester Tag', g.x, y + 40, 44, 500, '#b3b3b3');
      stxt(g, fmtDate(b.topDay.date) + ' · ' + fmtDuration(b.topDay.seconds), g.x, y + 110, 56, 700, '#ffffff', g.cw);
      y += 150;
    }
    if (b.seriesDay) {
      var sd = g.items[normId(b.seriesDay.seriesId)];
      var n = Number(b.seriesDay.episodes) || 0;
      stxt(g, n + (n === 1 ? ' Folge' : ' Folgen') + ' von ' + (sd ? sd.name : 'einer Serie') + ' am ' + fmtDate(b.seriesDay.date), g.x, y + 30, 38, 500, '#ffffff', g.cw);
      y += 70;
    }
    y += 20;
    var heads = (dev.length ? 1 : 0) + (met.length ? 1 : 0);
    var rows = dev.length + met.length;
    if (!rows) return;
    var rh = Math.max(52, Math.min(84, Math.floor((g.y1 - y - heads * 80) / rows)));
    if (dev.length) {
      stxt(g, 'Top-Geräte', g.x, y + 40, 44, 500, '#b3b3b3');
      y += 80;
      drawShareRows(g, dev, y, rh);
      y += dev.length * rh + 10;
    }
    if (met.length) {
      stxt(g, 'Wiedergabeart', g.x, y + 40, 44, 500, '#b3b3b3');
      y += 80;
      drawShareRows(g, met, y, rh);
    }
  }

  /** Zeichnet das Share-Bild synchron auf canvas. o: { variant, format, stats, items, posters, now }. */
  function drawShare(canvas, o) {
    var fmt = FORMATS[o.format] || FORMATS['4:5'];
    canvas.width = fmt.w;
    canvas.height = fmt.h;
    var ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    var story = fmt.h > 1500;
    var g = { ctx: ctx, W: fmt.w, H: fmt.h, story: story, stats: o.stats || {}, items: o.items || {}, posters: o.posters || {}, now: o.now || new Date(), x: 80, cw: fmt.w - 160 };
    g.top = story ? 110 : 0;
    g.y0 = g.top + 310;
    g.footY = fmt.h - (story ? 140 : 80);
    g.y1 = g.footY - 90;
    g.f = (g.y1 - g.y0) / 870;
    drawFrame(g);
    if (o.variant === 'top') drawTop(g);
    else if (o.variant === 'activity') drawActivity(g);
    else if (o.variant === 'binge') drawBinge(g);
    else drawOverview(g);
    return canvas;
  }

  function loadImage(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        resolve(null);
      };
      img.src = url;
    });
  }

  /** Lädt fehlende Poster (aus bereits geladenen Blob-URLs) in cache[id] (Image oder null). Verwirft nie. */
  function posterReady(entries, cache) {
    return entries.every(function (e) {
      return Object.prototype.hasOwnProperty.call(cache, e.id);
    });
  }

  function loadPosters(entries, cache, pending) {
    return Promise.all(
      entries.map(function (e) {
        if (Object.prototype.hasOwnProperty.call(cache, e.id)) return null;
        if (pending[e.id]) return pending[e.id];
        pending[e.id] = fetchPosterUrl(e.id, e.tag)
          .then(function (u) {
            return u ? loadImage(u) : null;
          })
          .then(function (img) {
            cache[e.id] = img;
          })
          .catch(function () {
            cache[e.id] = null;
          });
        return pending[e.id];
      })
    ).then(function () {
      return cache;
    });
  }

  function download(blob, name) {
    var u = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = u;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () {
      URL.revokeObjectURL(u);
    }, 4000);
  }

  /** Teilen-Sheet, wenn Dateien teilbar sind; sonst Download. Nichts wird hochgeladen. */
  function deliverBlob(blob, name) {
    var file = null;
    try {
      file = new File([blob], name, { type: 'image/png' });
    } catch (e) {
      /* ohne File: Download */
    }
    var nav = window.navigator;
    if (file && nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
      nav.share({ files: [file] }).catch(function () {
        /* abgebrochen */
      });
    } else {
      download(blob, name);
    }
  }

  var shareDlg = null;

  function closeShareDialog(restoreFocus) {
    var st = shareDlg;
    if (!st) return;
    shareDlg = null;
    st.seq++;
    document.removeEventListener('keydown', st.onKey, true);
    st.overlay.removeEventListener('click', st.onOverlay);
    if (st.overlay.parentNode) st.overlay.parentNode.removeChild(st.overlay);
    document.body.style.overflow = st.prevOverflow;
    st.posters = {};
    st.pending = {};
    if (restoreFocus !== false && st.trigger && document.body.contains(st.trigger)) {
      try {
        st.trigger.focus();
      } catch (e) {
        /* ignorieren */
      }
    }
  }

  function setOn(btn, on) {
    btn.className = on ? 'tab on' : 'tab';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  /** Öffnet den Dialog (nur einer gleichzeitig). → Overlay-Element. */
  function openShareDialog(stats, trigger) {
    if (shareDlg) return shareDlg.overlay;
    var st = {
      stats: stats,
      items: S.items,
      variant: 'overview',
      format: '4:5',
      trigger: trigger || null,
      posters: {},
      pending: {},
      seq: 0,
      ready: null,
      prevOverflow: document.body.style.overflow,
    };
    var variants = shareVariants(stats, st.items);

    var overlay = el('div', 'share-overlay');
    var dlg = el('div', 'share-dialog');
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-label', 'Als Bild speichern');
    dlg.tabIndex = -1;

    var stage = el('div', 'share-stage');
    var canvas = el('canvas', 'share-canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Vorschau des Statistik-Bildes');
    stage.appendChild(canvas);
    dlg.appendChild(stage);

    function paint() {
      var seq = ++st.seq;
      var o = { variant: st.variant, format: st.format, stats: stats, items: st.items, posters: st.posters };
      try {
        drawShare(canvas, o);
      } catch (e) {
        return;
      }
      if (st.variant === 'top') {
        var n = FORMATS[st.format].h > 1500;
        var need = topEntries(stats.topSeries, st.items, n ? 6 : 5).concat(topEntries(stats.topMovies, st.items, n ? 4 : 3));
        if (posterReady(need, st.posters)) {
          st.ready = null;
          return;
        }
        /* Auch laufende Ladungen abwarten; nur der neueste Zeichenvorgang zeichnet nach. */
        st.ready = loadPosters(need, st.posters, st.pending).then(function () {
          if (shareDlg !== st || seq !== st.seq) return;
          st.ready = null;
          try {
            drawShare(canvas, o);
          } catch (e) {
            /* Vorschau bleibt ohne Poster */
          }
        });
      } else {
        st.ready = null;
      }
    }

    var vBar = el('div', 'tabs share-tabs');
    vBar.setAttribute('role', 'group');
    vBar.setAttribute('aria-label', 'Variante');
    var vBtns = {};
    VARIANTS.forEach(function (v) {
      if (variants.indexOf(v.key) < 0) return;
      var b = el('button', 'tab', v.label);
      b.type = 'button';
      b.addEventListener('click', function () {
        if (st.variant === v.key) return;
        st.variant = v.key;
        Object.keys(vBtns).forEach(function (k) {
          setOn(vBtns[k], k === v.key);
        });
        paint();
      });
      vBtns[v.key] = b;
      vBar.appendChild(b);
    });
    dlg.appendChild(vBar);

    var fBar = el('div', 'tabs share-tabs');
    fBar.setAttribute('role', 'group');
    fBar.setAttribute('aria-label', 'Format');
    var fBtns = {};
    FORMAT_KEYS.forEach(function (k) {
      var b = el('button', 'tab', FORMATS[k].label);
      b.type = 'button';
      b.addEventListener('click', function () {
        if (st.format === k) return;
        st.format = k;
        Object.keys(fBtns).forEach(function (kk) {
          setOn(fBtns[kk], kk === k);
        });
        paint();
      });
      fBtns[k] = b;
      fBar.appendChild(b);
    });
    dlg.appendChild(fBar);

    var actions = el('div', 'actions share-actions');
    var save = el('button', 'btn', 'Speichern / Teilen');
    save.type = 'button';
    save.addEventListener('click', function () {
      if (!canvas.toBlob) return;
      save.disabled = true;
      function exportNow() {
        /* Dialog wurde währenddessen geschlossen: nichts mehr exportieren. */
        if (shareDlg !== st) return;
        /* Variante/Format wurden gewechselt und die neue Zeichnung lädt noch Poster: darauf warten. */
        if (st.ready) {
          st.ready.then(exportNow);
          return;
        }
        var variant = st.variant;
        var format = st.format;
        canvas.toBlob(function (blob) {
          save.disabled = false;
          if (blob) deliverBlob(blob, shareFileName(variant, format));
        }, 'image/png');
      }
      /* Ohne laufende Poster-Ladung läuft das synchron (Share braucht die Nutzergeste). */
      exportNow();
    });
    var close = el('button', 'btn ghost', 'Schließen');
    close.type = 'button';
    close.addEventListener('click', function () {
      closeShareDialog();
    });
    actions.appendChild(save);
    actions.appendChild(close);
    dlg.appendChild(actions);
    overlay.appendChild(dlg);

    st.overlay = overlay;
    st.onOverlay = function (ev) {
      if (ev.target === overlay) closeShareDialog();
    };
    st.onKey = function (ev) {
      if (ev.key === 'Escape' || ev.key === 'Esc' || ev.keyCode === 27) {
        ev.preventDefault();
        closeShareDialog();
        return;
      }
      if (ev.key === 'Tab' || ev.keyCode === 9) {
        var f = dlg.querySelectorAll('button:not([disabled])');
        if (!f.length) return;
        var first = f[0];
        var lastB = f[f.length - 1];
        var act = document.activeElement;
        if (!dlg.contains(act) || act === dlg) {
          ev.preventDefault();
          (ev.shiftKey ? lastB : first).focus();
        } else if (ev.shiftKey && act === first) {
          ev.preventDefault();
          lastB.focus();
        } else if (!ev.shiftKey && act === lastB) {
          ev.preventDefault();
          first.focus();
        }
      }
    };
    overlay.addEventListener('click', st.onOverlay);
    document.addEventListener('keydown', st.onKey, true);

    setOn(vBtns.overview, true);
    setOn(fBtns['4:5'], true);
    shareDlg = st;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    paint();
    dlg.focus();
    return overlay;
  }

  /* ---------- Ablauf ---------- */

  function loadAll() {
    var ui = showLoading('Statistik wird berechnet …', 1, 2);
    /* Nach längerer Pause rechnet der Server alles neu (mehrere Abfragen an Jellyfin). */
    var slow = window.setTimeout(function () {
      ui.hint('Nach längerer Pause dauert die Berechnung einen Moment. Bitte kurz warten.');
    }, 3500);
    var token = S.token;
    loadStats(S.range, token).then(
      function (stats) {
        S.stats = stats;
        ui.step('Titel und Poster werden geladen …', 2);
        return loadItems(collectIds(stats), token, S.userId).then(function (items) {
          window.clearTimeout(slow);
          S.items = items;
          drawDashboard(stats);
        });
      },
      function (err) {
        window.clearTimeout(slow);
        if (err && err.code === 'unauthorized') {
          dropAuth();
          showLogin('Bitte melde dich erneut an.');
        } else {
          showMessage('Server gerade nicht erreichbar', loadAll);
        }
      }
    );
  }

  function readOwnAuth() {
    try {
      var a = JSON.parse(window.localStorage.getItem(KEY_AUTH) || 'null');
      if (a && a.token && a.own) return { token: String(a.token), userId: a.userId ? String(a.userId) : null };
    } catch (e) {
      /* kaputter Eintrag */
    }
    return null;
  }

  function resolveAuth() {
    var own = readOwnAuth();
    if (own) {
      S.token = own.token;
      S.userId = own.userId;
      S.own = true;
      return Promise.resolve(true);
    }
    var ignore = false;
    try {
      ignore = window.localStorage.getItem(KEY_IGNORE) === '1';
    } catch (e) {
      /* ohne Speicher: nicht ignorieren */
    }
    var cred = ignore ? null : pickCredentials(window.localStorage.getItem('jellyfin_credentials'));
    if (!cred) return Promise.resolve(false);
    return requestJson('/Users/Me', jfInit(cred.token)).then(
      function (res) {
        if (res.status === 200 && res.json && res.json.Id) {
          S.token = cred.token;
          S.userId = String(res.json.Id);
          S.own = false;
          return true;
        }
        return false;
      },
      function () {
        return false;
      }
    );
  }

  function start() {
    root = document.getElementById('lfx-app');
    requestJson('/System/Info/Public', { method: 'GET', credentials: 'omit' }).then(
      function (res) {
        if (!(res.ok && res.json && (res.json.ServerName || res.json.Version))) {
          showWrongOrigin();
          return;
        }
        resolveAuth().then(function (ok) {
          if (ok) loadAll();
          else showLogin('');
        });
      },
      function () {
        showMessage('Server gerade nicht erreichbar', start);
      }
    );
  }

  window.LfxStats = {
    fmtDuration: fmtDuration,
    fmtDurationShort: fmtDurationShort,
    fmtDate: fmtDate,
    fmtDateTime: fmtDateTime,
    pickServer: pickServer,
    pickCredentials: pickCredentials,
    buildAuthHeader: buildAuthHeader,
    buildStatsRequest: buildStatsRequest,
    buildLoginRequest: buildLoginRequest,
    loadStats: loadStats,
    fillTimeline: fillTimeline,
    weekOfYear: weekOfYear,
    buildHeatmap: buildHeatmap,
    methodShares: methodShares,
    deviceShares: deviceShares,
    episodeLabel: episodeLabel,
    compareText: compareText,
    collectIds: collectIds,
    normId: normId,
    renderTopList: renderTopList,
    renderHeatmap: renderHeatmap,
    renderTimeline: renderTimeline,
    fitText: fitText,
    shareVariants: shareVariants,
    shareFileName: shareFileName,
    heatColor: heatColor,
    topEntries: topEntries,
    drawShare: drawShare,
    openShareDialog: openShareDialog,
    closeShareDialog: closeShareDialog,
    showLoading: showLoading,
    loadAll: loadAll,
    formats: FORMATS,
    state: S,
  };

  if (!window.__LFX_STATS_TEST__ && document.getElementById('lfx-app')) start();
})();
