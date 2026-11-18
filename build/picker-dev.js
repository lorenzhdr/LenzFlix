// Dev-Harness des Design-Menüs: gefälschte Jellyfin-Umgebung (ApiClient, fetch, Charts) + der echte Picker aus src/js/core/.
// Keine Netzwerkzugriffe: fetch wird komplett ersetzt, Cover sind per Canvas erzeugte data-URLs.
// ?online=3|1|0|err|slow: Antwort von /mp/online (Online-Pille auf der Kachel „store“; Standard 3, err = 503, slow = 2,5 s verzögert).
const q = new URLSearchParams(location.search);
const fakeDay = q.get('day'); // YYYY-MM-DD: Systemdatum für die Tagesmischung
if (fakeDay && /^\d{4}-\d{2}-\d{2}$/.test(fakeDay)) {
  const [y, m, d] = fakeDay.split('-').map(Number);
  const RealDate = Date;
  const fixed = new RealDate(y, m - 1, d, 12, 0, 0).getTime();
  globalThis.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [fixed])); }
    static now() { return fixed; }
  };
}

if (q.get('api') !== '0') {
  window.ApiClient = {
    serverAddress: () => location.origin,
    getCurrentUserId: () => 'dev-user',
    accessToken: () => 'dev-token',
    serverId: () => 'dev-server',
  };
}
if (q.get('charts') !== '0') window.LenzFlixConfig = { chartsUrl: 'https://charts.dev.invalid' };

const TITLES = ['Nachtjäger', 'Sommerfahrt', 'Sternenreise', 'Eisfeuer', 'Wolkenlied', 'Inselkampf', 'Bergzug', 'Meerwächter', 'Stadtfieber',
  'Traumtanz', 'Wüstenritt', 'Kometenspiel', 'Turborennen', 'Piratenlied', 'Geisterstadt', 'Silberwende', 'Mondbote', 'Glasreise',
  'Nebelkampf', 'Honigzug', 'Rotes Licht', 'Letzte Fahrt', 'Der Anfang', 'Stille See', 'Blaue Stunde', 'Kaltes Herz', 'Neon', 'Echo',
  'Zeitsprung', 'Schattenfeld'];
const HUES = [338, 187, 46, 98, 276, 32, 210, 0, 160, 300];

function cover(index) {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 240;
  const g = c.getContext('2d');
  const hue = HUES[index % HUES.length];
  const grad = g.createLinearGradient(0, 0, 160, 240);
  grad.addColorStop(0, `hsl(${hue} 80% 55%)`);
  grad.addColorStop(1, `hsl(${(hue + 40) % 360} 70% 18%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 160, 240);
  g.fillStyle = 'rgb(0 0 0 / 0.28)';
  g.fillRect(0, 150, 160, 90);
  g.fillStyle = '#fff';
  g.font = '800 20px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(TITLES[index % TITLES.length], 80, 196, 140);
  return c.toDataURL('image/jpeg', 0.8);
}
// Präfix m/s/n zählt mit (s +12, n +24), damit mN und sN verschiedene Titel/Cover bekommen
const PREFIX_OFFSET = { m: 0, s: 12, n: 24 };
const indexOf = (id) => (Number(String(id).replace(/\D/g, '')) || 0) + (PREFIX_OFFSET[String(id)[0]] || 0);
const item = (id) => ({ Id: id, Name: TITLES[indexOf(id) % TITLES.length], ImageTags: { Primary: `tag-${id}` } });
const json = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });

// Charts: je 12 Filme/Serien; Katalog: 30 „neueste“ Titel (n0…n29)
const chartList = (p) => Array.from({ length: 12 }, (_, i) => ({ id: `${p}${i + 1}`, viewers: 12 - i, plays: 20 - i }));
const CHARTS = { version: 1, windowDays: 30, movies: chartList('m'), series: chartList('s'), all: chartList('m') };
// Eingeschränktes Profil: die Serie s3 sieht dieser Nutzer nicht (kommt nicht in der Items-Antwort vor)
const HIDDEN = new Set(['s3']);

window.fetch = async (input) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (url.pathname === '/mp/online') {
    const o = q.get('online');
    if (o === 'err') return new Response('{}', { status: 503 });
    const n = o === null ? 3 : Number(o);
    const body = json({ v: 1, n: Number.isInteger(n) ? n : 0 });
    return o === 'slow' ? new Promise((r) => setTimeout(() => r(json({ v: 1, n: 3 })), 2500)) : body;
  }
  if (url.pathname.endsWith('/charts')) return json(CHARTS);
  if (url.pathname === '/Items') {
    const ids = (url.searchParams.get('Ids') || '').split(',').filter(Boolean);
    const list = ids.length ? ids.filter((i) => !HIDDEN.has(i)) : Array.from({ length: 30 }, (_, i) => `n${i}`);
    return json({ Items: list.map(item), TotalRecordCount: list.length });
  }
  if (url.pathname.startsWith('/DisplayPreferences/')) return json({});
  return new Response('not found', { status: 404 });
};

// Cover-Bilder: den src-Setter der Picker-Covers abfangen. Die echte URL (…/Items/<id>/Images/…) gelangt nie ins Netz (kein 404,
// der Fehler-Handler des Pickers würde das <img> sonst entfernen); stattdessen wird die Canvas-data-URL gesetzt, optional verzögert.
const delay = q.get('delay') === '1';
const srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', {
  ...srcDesc,
  set(value) {
    const m = this.classList.contains('lfx-tp__coverimg') && /\/Items\/([^/]+)\/Images\//.exec(String(value));
    if (!m) { srcDesc.set.call(this, value); return; }
    const data = cover(indexOf(m[1]));
    if (delay) setTimeout(() => srcDesc.set.call(this, data), 300 + Math.random() * 1500);
    else srcDesc.set.call(this, data);
  },
});

const { openThemePicker } = await import('/src/js/core/themepicker.js');
document.getElementById('dev-open').addEventListener('click', () => openThemePicker({ returnFocus: document.getElementById('dev-open') }));
openThemePicker({});
document.documentElement.dataset.pickerDevReady = '1';
