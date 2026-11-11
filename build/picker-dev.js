// Dev-Harness des Design-Menüs: gefälschte Jellyfin-Umgebung (ApiClient, fetch, Charts) + der echte Picker aus src/js/core/.
// Keine Netzwerkzugriffe: fetch wird komplett ersetzt, Cover sind per Canvas erzeugte data-URLs.
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
const indexOf = (id) => Number(String(id).replace(/\D/g, '')) || 0;
const item = (id) => ({ Id: id, Name: TITLES[indexOf(id) % TITLES.length], ImageTags: { Primary: `tag-${id}` } });
const json = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });

// Charts: je 12 Filme/Serien; Katalog: 30 „neueste“ Titel (n0…n29)
const chartList = (p) => Array.from({ length: 12 }, (_, i) => ({ id: `${p}${i + 1}`, viewers: 12 - i, plays: 20 - i }));
const CHARTS = { version: 1, windowDays: 30, movies: chartList('m'), series: chartList('s'), all: chartList('m') };
// Eingeschränktes Profil: die Serie s3 sieht dieser Nutzer nicht (kommt nicht in der Items-Antwort vor)
const HIDDEN = new Set(['s3']);

window.fetch = async (input) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (url.pathname.endsWith('/charts')) return json(CHARTS);
  if (url.pathname === '/Items') {
    const ids = (url.searchParams.get('Ids') || '').split(',').filter(Boolean);
    const list = ids.length ? ids.filter((i) => !HIDDEN.has(i)) : Array.from({ length: 30 }, (_, i) => `n${i}`);
    return json({ Items: list.map(item), TotalRecordCount: list.length });
  }
  return new Response('not found', { status: 404 });
};

// Cover-Bilder: die Picker-URLs (…/Items/<id>/Images/Primary?…) gegen Canvas-data-URLs tauschen, optional verzögert
const delay = q.get('delay') === '1';
new MutationObserver((records) => {
  for (const r of records) {
    for (const n of r.addedNodes) {
      if (!(n instanceof HTMLImageElement) || !n.classList.contains('lfx-tp__coverimg')) continue;
      const m = /\/Items\/([^/]+)\/Images\//.exec(n.getAttribute('src') || '');
      if (!m) continue;
      const data = cover(indexOf(m[1]));
      if (delay) setTimeout(() => { n.src = data; }, 300 + Math.random() * 1500);
      else n.src = data;
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });

const { openThemePicker } = await import('/src/js/core/themepicker.js');
document.getElementById('dev-open').addEventListener('click', () => openThemePicker({ returnFocus: document.getElementById('dev-open') }));
openThemePicker({});
document.documentElement.dataset.pickerDevReady = '1';
