// Sicht-Harness der Server-Statistik (src/js/serverstats/**), Fake-deps ohne Netzwerk (nur der eigene Dev-Server).
// Der ECHTE Code wird als ES-Modul aus src/js/ geladen (serve liefert /src/js/ aus), CSS aus dist/ (nach `npm run build`;
// fehlt ein Stylesheet, läuft der Harness trotzdem). Die Panel-Hülle ist die statische Nachbildung von
// src/js/features/secretmenu/panel.js (Klassen lfx-secret, __panel, __head, __back, __title, __body).
//
// Parameter:
//   ?tab=now|month|server     Reiter beim Start (Standard now; erst wählbar, wenn in ?tabs enthalten)
//   ?state=normal|loading|empty|error|down|stale|hidden|partial
//        loading  Abrufe bleiben offen (bis Abbruch per signal)
//        empty    /srv/now ohne Zeilen, Monat ohne Daten, /srv/server nur {v:1}
//        error    alle Abrufe liefern { ok:false, status:0 }
//        down     /srv/now {v:1,down:1}, /srv/month 503 {error:'unavailable'}
//        stale    health.stale (ageS 2 h) und Monat stale:1
//        hidden   jede zweite Zeile verborgen ({hidden:1,p,...})
//        partial  /srv/server nur health + library
//   ?rows=0..8                Zeilen im Reiter Jetzt (Standard 4)
//   ?phone=1                  Panel-Breite 375 px
//   ?tabs=now,month,server    deps.tabs (Standard alle drei)
//   ?maxM=35                  deps.maxM bzw. maxM der Monatsantwort (Standard 35)
//   ?delay=300                künstliche Antwortzeit in ms
//
// Titel sind neutrale Fantasietitel. Im Node-Test importierbar: fakeApi(path, opts) und makeDeps(opts) (kein DOM-Zugriff beim Import).

const SEED = 20261125;
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pad = (n) => String(n).padStart(2, '0');

const TITLES = [
  { id: 'a01', t: 'movie', title: 'Der blaue Leuchtturm', dur: 6300 },
  { id: 'a02', t: 'episode', title: 'Nordlicht-Archiv', s: 2, e: 5, ep: 'Das stille Tal', dur: 2700 },
  { id: 'a03', t: 'movie', title: 'Sandsturm im Februar', dur: 7200 },
  { id: 'a04', t: 'episode', title: 'Die Kartenmacher', s: 1, e: 9, ep: 'Letzte Ausfahrt', dur: 3000 },
  { id: 'a05', t: 'movie', title: 'Wolkenfabrik', dur: 5400 },
  { id: 'a06', t: 'episode', title: 'Hafenlichter', s: 4, e: 12, ep: 'Ebbe', dur: 2580 },
  { id: 'a07', t: 'movie', title: 'Kupfer und Salz', dur: 8100 },
  { id: 'a08', t: 'other', title: 'Hausaufnahme Sommer', dur: 900 },
];
const DEVS = ['tv', 'phone', 'web', 'other'];

function nowRows(n, hidden) {
  const r = rng(SEED + n);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const T = TITLES[i % TITLES.length];
    const tc = i % 3 === 1 ? 1 : 0;
    const base = { paused: i % 4 === 2 ? 1 : 0, tc, mbps: tc ? 3.2 + Math.round(r() * 40) / 10 : (i % 5 === 4 ? null : 8 + Math.round(r() * 120) / 10), dev: DEVS[i % 4] };
    if (hidden && i % 2 === 1) { rows.push({ hidden: 1, p: Math.round(r() * 100) / 100, ...base }); continue; }
    const row = { id: T.id, t: T.t, title: T.title, pos: Math.round(T.dur * (0.1 + r() * 0.8)), dur: T.dur, ...base, img: { id: T.id, tag: 'tag' + i } };
    if (T.t === 'episode') { row.s = T.s; row.e = T.e; row.ep = T.ep; }
    if (i === 0) row.me = 1;
    rows.push(row);
  }
  return rows;
}

function monthData(m, maxM, stale) {
  const base = new Date(Date.UTC(2026, 10, 15)); // Anker: Nov 2026 (m=0)
  const mk = (k) => { const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - k, 1)); return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1 }; };
  const { y, mo } = mk(m);
  const prev = mk(m + 1);
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const lastDay = m === 0 ? 25 : dim;
  const r = rng(SEED + m * 7);
  const days = [];
  let total = 0, top = null;
  for (let d = 1; d <= lastDay; d++) {
    const wk = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
    const secs = Math.round((3600 * (1.5 + r() * 5) * (wk === 0 || wk === 6 ? 1.7 : 1)) / 60) * 60;
    days.push({ d: `${y}-${pad(mo)}-${pad(d)}`, secs });
    total += secs;
    if (!top || secs > top.secs) top = { d: `${y}-${pad(mo)}-${pad(d)}`, secs };
  }
  const heat = [];
  for (let dow = 0; dow < 7; dow++) for (let hr = 0; hr < 24; hr++) {
    const evening = Math.exp(-Math.pow((hr - 21) / 2.6, 2)) * 5400 + Math.exp(-Math.pow((hr - 14) / 3, 2)) * 900;
    const secs = Math.round((evening * (dow === 0 || dow === 6 ? 1.5 : 1) * (0.6 + r() * 0.8)) / 60) * 60;
    if (secs > 0) heat.push([dow, hr, secs]);
  }
  const split = (k, parts) => { const o = {}; let left = k; parts.forEach(([key, f], i) => { const v = i === parts.length - 1 ? left : Math.round(k * f); o[key] = v; left -= v; }); return o; };
  return {
    v: 1, ym: `${y}-${pad(mo)}`, m, maxM, partial: m === 0 ? 1 : 0, ...(stale ? { stale: 1 } : {}),
    totals: { secs: total, plays: 40 + Math.round(r() * 60), users: 4 },
    prev: { ym: `${prev.y}-${pad(prev.mo)}`, secs: Math.round(total * (0.8 + r() * 0.4)) },
    days, top,
    heat,
    mix: {
      dev: split(total, [['tv', 0.46], ['phone', 0.2], ['web', 0.28], ['other', 0]]),
      method: split(total, [['direct', 0.78], ['transcode', 0]]),
      type: split(total, [['movie', 0.42], ['episode', 0]]),
    },
    tx: { tx: Math.round((180 + r() * 120) * 1e9), rx: Math.round((2 + r() * 3) * 1e9) },
  };
}

function monthEmpty(m, maxM) {
  const d = monthData(m, maxM, false);
  return { ...d, totals: { secs: 0, plays: 0, users: 0 }, prev: { ym: d.prev.ym, secs: 0 }, days: [], top: null, heat: [], mix: { dev: { tv: 0, phone: 0, web: 0, other: 0 }, method: { direct: 0, transcode: 0 }, type: { movie: 0, episode: 0 } }, tx: undefined };
}

function serverData(state) {
  const r = rng(SEED + 3);
  const stale = state === 'stale';
  const days = [];
  for (let d = 1; d <= 25; d++) days.push({ d: `2026-11-${pad(d)}`, rx: Math.round((1.5 + r() * 4) * 1e9), tx: Math.round((3 + r() * 14) * 1e9) });
  const months = [];
  for (let k = 11; k >= 0; k--) {
    const dt = new Date(Date.UTC(2026, 10 - k, 1));
    months.push({ ym: `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}`, rx: Math.round((60 + r() * 40) * 1e9), tx: Math.round((250 + r() * 300) * 1e9) });
  }
  const health = { ageS: stale ? 7200 : 24, stale: stale ? 1 : 0, tempC: 52, cpuPct: 23, load: [0.62, 0.55, 0.48], cores: 8, mem: { total: 16 * 1024 ** 3, avail: Math.round(9.4 * 1024 ** 3) }, uptimeS: 41 * 86400 + 5 * 3600 };
  const library = { movies: 681, series: 157, episodes: 9224, newMovies: 4, newEpisodes: 37, newCapped: 0, ym: '2026-11', runtimeS: Math.round(312.4 * 86400) };
  if (state === 'partial') return { v: 1, health, library };
  return {
    v: 1, health,
    disks: { ageS: stale ? 7200 : 24, list: [{ l: 'Medien', size: 8e12, used: 5.9e12, avail: 2.1e12 }, { l: 'System', size: 480e9, used: 131e9, avail: 349e9 }] },
    traffic: { ageS: 30, days, months },
    library,
    records: { day: { d: '2026-03-14', secs: 61200 }, month: { ym: '2026-01', secs: 1480000 }, conc: { n: 6, date: '2026-02-08' }, binge: { n: 9, date: '2026-04-19' }, approx: 0, tx: { ym: '2026-01', bytes: 612e9 } },
  };
}

// Antwort nach den Formen aus .tmp/srvstats/ui-iface.md; opts: { state, rows, maxM }
export function fakeApi(path, opts = {}) {
  const state = opts.state || 'normal';
  const maxM = opts.maxM ?? 35;
  if (state === 'error') return { ok: false, status: 0 };
  const [p, qs] = String(path).split('?');
  if (p === '/srv') return { ok: true, status: 200, data: { v: 1, tabs: ['now', 'month', 'server'], maxM } };
  if (p === '/srv/now') {
    if (state === 'down') return { ok: true, status: 200, data: { v: 1, down: 1 } };
    const n = state === 'empty' ? 0 : Math.max(0, Math.min(8, opts.rows ?? 4));
    const rows = nowRows(n, state === 'hidden');
    const mbps = Math.round(rows.reduce((a, x) => a + (x.mbps || 0), 0) * 10) / 10;
    return { ok: true, status: 200, data: { v: 1, n, mbps, rows } };
  }
  if (p === '/srv/month') {
    const m = Number(new URLSearchParams(qs || '').get('m'));
    if (!Number.isInteger(m) || m < 0 || m > maxM) return { ok: false, status: 400 };
    if (state === 'down') return { ok: false, status: 503 };
    return { ok: true, status: 200, data: state === 'empty' ? monthEmpty(m, maxM) : monthData(m, maxM, state === 'stale') };
  }
  if (p === '/srv/server') {
    if (state === 'empty') return { ok: true, status: 200, data: { v: 1 } };
    return { ok: true, status: 200, data: serverData(state) };
  }
  return { ok: false, status: 404 };
}

const hueOf = (id) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export function placeholder(id, w) {
  const hue = hueOf(id), width = w || 120, height = Math.round(width * 1.5);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 40 60"><rect width="40" height="60" fill="hsl(${hue},45%,32%)"/><circle cx="20" cy="26" r="9" fill="hsl(${hue},50%,48%)"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export function makeDeps(opts = {}, log = () => {}) {
  const state = opts.state || 'normal';
  const delay = opts.delay ?? 300;
  return {
    get(path, { signal } = {}) {
      return new Promise((resolve) => {
        if (state === 'loading') { signal?.addEventListener('abort', () => resolve({ ok: false, status: 0 })); return; }
        const t = setTimeout(() => resolve(fakeApi(path, opts)), delay);
        signal?.addEventListener('abort', () => { clearTimeout(t); resolve({ ok: false, status: 0 }); });
      });
    },
    img: (id, tag, w) => (id && tag ? placeholder(id, w) : null),
    openItem: (id) => log('openItem(' + id + ')'),
    tabs: opts.tabs || ['now', 'month', 'server'],
    maxM: opts.maxM ?? 35,
  };
}

function boot() {
  const q = new URLSearchParams(location.search);
  const ORDER = ['now', 'month', 'server'];
  const tabsP = (q.get('tabs') || '').split(',').filter((x) => ORDER.includes(x));
  const opts = {
    state: q.get('state') || 'normal',
    rows: q.has('rows') ? Number(q.get('rows')) : 4,
    maxM: q.has('maxM') ? Number(q.get('maxM')) : 35,
    delay: q.has('delay') ? Number(q.get('delay')) : 300,
    tabs: tabsP.length ? ORDER.filter((x) => tabsP.includes(x)) : ORDER,
  };
  const logEl = document.getElementById('dev-log');
  const log = (s) => { logEl.textContent = s; };

  const h = (tag, attrs = {}, kids = []) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); for (const c of [].concat(kids)) e.append(c); return e; };
  const back = h('button', { type: 'button', class: 'lfx-secret__back', 'aria-label': 'Zurück' }, '‹');
  back.addEventListener('click', () => log('Zurück'));
  const body = h('div', { class: 'lfx-secret__body' });
  const panel = h('div', { class: 'lfx-secret__panel', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' }, [
    h('div', { class: 'lfx-secret__head' }, [back, h('h2', { class: 'lfx-secret__title' }, 'Server-Statistik')]),
    body,
  ]);
  if (q.get('phone') === '1') { panel.style.width = '375px'; panel.style.maxWidth = '375px'; }
  document.body.append(h('div', { id: 'lfx-secret', class: 'lfx-secret' }, [panel]));
  document.documentElement.classList.add('lfx-secret-open');

  import('/src/js/serverstats/entry.js').then(() => {
    const api = window.LenzFlixServerStats;
    if (!api) { log('window.LenzFlixServerStats fehlt'); return; }
    const inst = api.create(makeDeps(opts, log));
    body.append(inst.el);
    const want = q.get('tab');
    if (want && opts.tabs.includes(want)) {
      const idx = opts.tabs.indexOf(want);
      body.querySelectorAll('[role="tab"]')[idx]?.click();
    }
    window.__srvInst = inst;
  }).catch((e) => log('Fehler: ' + (e && e.message)));
}

if (typeof document !== 'undefined') boot();
