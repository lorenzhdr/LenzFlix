// Lokaler Server für die Statistik-Seite (charts-worker/public/lenzflix-stats/) mit Fixture-Daten.
// Start: node build/stats-dev.mjs [--port 5180]   Bindet nur 127.0.0.1, nichts verlässt den Rechner.
//   http://127.0.0.1:5180/lenzflix-stats/dev-login.html?theme=plus   (flix | plus | prime | retro)
//   dev-login.html setzt Dummy-Zugangsdaten (Token "dev") und leitet auf die Statistik weiter.
//   Share-Bild direkt: /lenzflix-stats/dev-share.html?theme=prime&variant=top&format=story (overview|top|activity|binge).
//   Optionen: &store=<id> legt zusätzlich lfx.theme.<userId>/lfx.theme.last an, &noq=1 leitet ohne ?theme= weiter
//   (prüft dann die Speicher-Reihenfolge). Auf der Statistik-Seite immer mit der Produktiv-CSP (ohne Inline-Skripte).
// Beantwortet: /System/Info/Public, /Users/Me, /Users/AuthenticateByName, /Sessions/Logout, /Items?Ids=,
//   /Items/<id>/Images/Primary (SVG-Platzhalter, gleiche Origin), /Shows/NextUp, /lenzflix-stats/api/me/stats?range=.
// Fixtures: tests/fixtures/stats/*.json. Zeitreihen tragen `ago` (Tage/Wochen/Monate vor heute), der Server macht daraus
// die Schlüssel, damit die Diagramme immer zum heutigen Datum passen.
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PAGE_DIR = join(ROOT, 'charts-worker', 'public', 'lenzflix-stats');
const FIX = join(ROOT, 'tests', 'fixtures', 'stats');
const HOST = '127.0.0.1';
const argPort = process.argv.indexOf('--port');
const PORT = argPort > 0 ? Number(process.argv[argPort + 1]) : Number(process.env.PORT) || 5180;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
// wie in Produktion: Skripte, Styles und Schriften nur von der eigenen Origin; Poster als Blob-URL
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' blob: data:; connect-src 'self'";

const fixture = (name) => JSON.parse(readFileSync(join(FIX, name), 'utf8'));
const pad2 = (n) => (n < 10 ? '0' : '') + n;
const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function weekOfYear(d) {
  const yday = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86400000);
  return Math.floor((yday + 7 - ((d.getDay() + 6) % 7)) / 7);
}

function bucketKey(unit, ago, now) {
  if (unit === 'day') return dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - ago));
  if (unit === 'week') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ago * 7);
    return `${d.getFullYear()}-${pad2(weekOfYear(d))}`;
  }
  const d = new Date(now.getFullYear(), now.getMonth() - ago, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function statsFor(range) {
  const name = `stats-${['7d', '30d', 'year', 'all'].includes(range) ? range : '30d'}.json`;
  const s = fixture(name);
  const now = new Date();
  const unit = s.timeline.unit;
  const seen = {};
  s.timeline.buckets = s.timeline.buckets
    .map((b) => ({ key: bucketKey(unit, b.ago, now), seconds: b.seconds }))
    .filter((b) => (seen[b.key] ? false : (seen[b.key] = true)));
  // Jahres-Ansicht: nur Wochen des laufenden Jahres, wie die API
  if (s.range === 'year') s.timeline.buckets = s.timeline.buckets.filter((b) => b.key.slice(0, 4) === String(now.getFullYear()));
  const day = (ago) => dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - ago));
  if (s.binge && s.binge.topDay) s.binge.topDay = { date: day(s.binge.topDay.agoDays), seconds: s.binge.topDay.seconds };
  if (s.binge && s.binge.seriesDay) s.binge.seriesDay = { seriesId: s.binge.seriesDay.seriesId, date: day(s.binge.seriesDay.agoDays), episodes: s.binge.seriesDay.episodes };
  s.computedAt = now.toISOString();
  return s;
}

function posterSvg(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  const items = fixture('items.json').Items;
  const it = items.find((x) => x.Id.toLowerCase() === id.toLowerCase());
  const letter = it ? it.Name.charAt(0).toUpperCase() : '?';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},55%,38%)"/><stop offset="1" stop-color="hsl(${(h + 50) % 360},60%,16%)"/></linearGradient></defs>` +
    `<rect width="300" height="450" fill="url(#g)"/>` +
    `<text x="150" y="270" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="170" font-weight="800" fill="rgba(255,255,255,0.85)">${letter}</text></svg>`
  );
}

function loginPage() {
  const user = fixture('user.json');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Dev-Login</title></head><body><p>Dev-Login …</p><script>
(function () {
  var q = new URLSearchParams(location.search);
  var theme = q.get('theme');
  var uid = ${JSON.stringify(user.Id)};
  localStorage.setItem('jellyfin_credentials', JSON.stringify({ Servers: [{ Id: 'devserver', AccessToken: 'dev', UserId: uid }] }));
  localStorage.removeItem('lfx-stats-auth');
  localStorage.removeItem('lfx-stats-ignore-web');
  var store = q.get('store');
  if (store) { localStorage.setItem('lfx.theme.' + uid, store); localStorage.setItem('lfx.theme.last', store); }
  else { localStorage.removeItem('lfx.theme.' + uid); localStorage.removeItem('lfx.theme.last'); }
  location.replace('/lenzflix-stats/' + (theme && !q.get('noq') ? '?theme=' + encodeURIComponent(theme) : ''));
})();
</script></body></html>`;
}

/** Zeichnet das Share-Bild (ohne Dialog) direkt als Seite: ?theme=plus&variant=top&format=story (zum Prüfen/Screenshot). */
function sharePage() {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Dev-Share</title>
<link rel="stylesheet" href="/lenzflix-stats/app.css"><style>body{margin:0;background:#333}canvas{display:block}</style></head><body>
<div id="lfx-app" style="display:none"></div><canvas id="c"></canvas>
<script>window.__LFX_STATS_TEST__ = true;</script><script src="/lenzflix-stats/app.js"></script>
<script>
(function () {
  var q = new URLSearchParams(location.search);
  var theme = q.get('theme') || 'flix';
  var L = window.LfxStats;
  L.applyTheme(theme);
  var info = L.themeInfo[theme];
  function img(u) { return new Promise(function (ok) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ok(null); }; i.src = u; }); }
  Promise.all([
    fetch('/lenzflix-stats/api/me/stats?range=' + (q.get('range') || '30d')).then(function (r) { return r.json(); }),
    fetch('/Items?Ids=all').then(function (r) { return r.json(); }),
    Promise.all(L.shareFontLoads(theme).map(function (spec) { return document.fonts.load(spec); })),
    info.shareLogo ? img(info.shareLogo) : Promise.resolve(null)
  ]).then(function (r) {
    var stats = r[0], items = {};
    r[1].Items.forEach(function (it) { items[it.Id] = { name: it.Name, tag: it.ImageTags.Primary, type: it.Type }; });
    var entries = L.topEntries(stats.topSeries, items, 6).concat(L.topEntries(stats.topMovies, items, 4));
    return Promise.all(entries.map(function (e) { return img('/Items/' + e.id + '/Images/Primary').then(function (i) { return [e.id, i]; }); })).then(function (ps) {
      var posters = {}; ps.forEach(function (p) { posters[p[0]] = p[1]; });
      L.drawShare(document.getElementById('c'), { variant: q.get('variant') || 'overview', format: q.get('format') || '4:5', stats: stats, items: items, posters: posters, theme: theme, logo: r[3] });
      document.title = 'ready';
    });
  });
})();
</script></body></html>`;
}

function send(res, status, body, type, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra || {}));
  res.end(body);
}
const json = (res, obj, status) => send(res, status || 200, JSON.stringify(obj));

function serveStatic(res, rel) {
  const file = resolve(PAGE_DIR, rel || 'index.html');
  if (file !== PAGE_DIR && !file.startsWith(PAGE_DIR + sep)) return send(res, 403, 'Forbidden', 'text/plain');
  if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'Not found', 'text/plain');
  send(res, 200, readFileSync(file), MIME[extname(file)] || 'application/octet-stream', { 'Content-Security-Policy': CSP });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const p = url.pathname;
  try {
    if (p === '/lenzflix-stats/dev-login.html') return send(res, 200, loginPage(), MIME['.html']);
    if (p === '/lenzflix-stats/dev-share.html') return send(res, 200, sharePage(), MIME['.html']);
    if (p === '/lenzflix-stats/' || p === '/lenzflix-stats') return serveStatic(res, 'index.html');
    if (p === '/lenzflix-stats/api/me/stats') return json(res, statsFor(url.searchParams.get('range')));
    if (p.startsWith('/lenzflix-stats/')) return serveStatic(res, decodeURIComponent(p.slice('/lenzflix-stats/'.length)));
    if (p === '/System/Info/Public') return json(res, fixture('info.json'));
    if (p === '/Users/Me') return json(res, fixture('user.json'));
    if (p === '/Users/AuthenticateByName' && req.method === 'POST') return json(res, { AccessToken: 'dev', User: fixture('user.json') });
    if (p === '/Sessions/Logout') return send(res, 204, '');
    if (p === '/Items') {
      const raw = String(url.searchParams.get('Ids') || '').toLowerCase();
      const ids = raw === 'all' ? null : raw.split(',').filter(Boolean);
      const items = fixture('items.json').Items.filter((x) => !ids || ids.indexOf(x.Id.toLowerCase()) >= 0);
      return json(res, { Items: items, TotalRecordCount: items.length });
    }
    const img = /^\/Items\/([0-9a-fA-F-]+)\/Images\/Primary$/.exec(p);
    if (img) return send(res, 200, posterSvg(img[1].replace(/-/g, '')), 'image/svg+xml');
    if (p === '/Shows/NextUp') return json(res, fixture('nextup.json'));
    if (p === '/') return send(res, 302, '', 'text/plain', { Location: '/lenzflix-stats/dev-login.html' });
    return send(res, 404, 'Not found', 'text/plain');
  } catch (e) {
    return send(res, 500, String(e && e.message), 'text/plain');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Statistik-Dev-Server: http://${HOST}:${PORT}/lenzflix-stats/dev-login.html?theme=flix|plus|prime|retro`);
});
