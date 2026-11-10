// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let L;

beforeAll(() => {
  window.__LFX_STATS_TEST__ = true;
  const src = readFileSync(resolve(import.meta.dirname, '../charts-worker/public/lenzflix-stats/app.js'), 'utf8');
  new Function(src)();
  L = window.LfxStats;
});

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Credentials-Auswahl', () => {
  it('nimmt den Server mit Token + UserId, auch wenn er nicht der erste ist', () => {
    const raw = JSON.stringify({ Servers: [{ Id: 'a' }, { Id: 'b', AccessToken: 'tok-b', UserId: 'u-b' }] });
    expect(L.pickCredentials(raw)).toEqual({ token: 'tok-b', userId: 'u-b' });
  });
  it('fällt auf Servers[0] zurück; ohne Token → null', () => {
    expect(L.pickServer({ Servers: [{ Id: 'a' }, { Id: 'b' }] }).Id).toBe('a');
    expect(L.pickCredentials(JSON.stringify({ Servers: [{ Id: 'a' }] }))).toBeNull();
    expect(L.pickCredentials(null)).toBeNull();
    expect(L.pickCredentials('kaputt{')).toBeNull();
  });
});

describe('Authorization-Header', () => {
  it('Token-Header mit Quotes, Anführungszeichen im Token werden entfernt', () => {
    expect(L.buildAuthHeader({ token: 'abc' })).toBe('MediaBrowser Token="abc"');
    expect(L.buildAuthHeader({ token: 'a"b' })).toBe('MediaBrowser Token="ab"');
  });
  it('Login-Header: Gerätename URL-kodiert, eigene DeviceId', () => {
    const h = L.buildAuthHeader({ device: 'Lorenz Handy ä', deviceId: 'xyz', version: '1.0.0' });
    expect(h).toBe('MediaBrowser Client="LenzFlix Statistik", Device="Lorenz%20Handy%20%C3%A4", DeviceId="xyz", Version="1.0.0"');
  });
});

describe('fmtDuration', () => {
  it('Formate', () => {
    expect(L.fmtDuration(0)).toBe('0 Min');
    expect(L.fmtDuration(20)).toBe('< 1 Min');
    expect(L.fmtDuration(2700)).toBe('45 Min');
    expect(L.fmtDuration(3600)).toBe('1 Std');
    expect(L.fmtDuration(5400)).toBe('1 Std 30 Min');
    expect(L.fmtDuration(123456)).toBe('34 Std 18 Min');
    expect(L.fmtDuration(3 * 86400 + 5 * 3600)).toBe('3 Tage 5 Std');
    expect(L.fmtDurationShort(98000)).toBe('27 Std');
  });
  it('Datum', () => {
    expect(L.fmtDate('2026-11-02')).toBe('2. November 2026');
    expect(L.fmtDate('2026-03-15 20:11:03')).toBe('15. März 2026');
    expect(L.fmtDate('x')).toBe('');
  });
});

describe('fillTimeline', () => {
  it('day: jeder Tag im Zeitraum', () => {
    const now = new Date(2026, 10, 10, 12);
    const r = L.fillTimeline('day', [{ key: '2026-11-09', seconds: 60 }], { days: 7, now });
    expect(r.map((b) => b.key)).toEqual(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10']);
    expect(r[5].seconds).toBe(60);
    expect(r[0].seconds).toBe(0);
  });
  it('day über Monatsgrenze', () => {
    const r = L.fillTimeline('day', [], { days: 30, now: new Date(2026, 2, 3) });
    expect(r).toHaveLength(30);
    expect(r[0].key).toBe('2026-02-02');
    expect(r[29].key).toBe('2026-03-03');
  });
  it('week: durchgehend vom Jahresanfang bis jetzt (SQLite %W)', () => {
    const now = new Date(2026, 10, 10); // Dienstag
    const r = L.fillTimeline('week', [{ key: '2026-44', seconds: 5 }], { now });
    expect(r[0].key).toBe('2026-00'); // 1.1.2026 ist Donnerstag → Woche 0
    expect(r[r.length - 1].key).toBe('2026-45');
    expect(r.find((b) => b.key === '2026-44').seconds).toBe(5);
    expect(r).toHaveLength(46);
  });
  it('month: vom ersten Bucket bis zum aktuellen Monat', () => {
    const r = L.fillTimeline('month', [{ key: '2025-11', seconds: 1 }, { key: '2026-02', seconds: 2 }], { now: new Date(2026, 3, 1) });
    expect(r.map((b) => b.key)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04']);
    expect(r[3].seconds).toBe(2);
  });
});

describe('Verlauf: Y-Achse und Balken-Details', () => {
  it('niceAxis: runde Schritte, Maximum deckt den höchsten Wert ab', () => {
    expect(L.niceAxis(0)).toEqual({ step: 300, count: 2, max: 600 });
    expect(L.niceAxis(5400)).toEqual({ step: 1800, count: 3, max: 5400 });
    const a = L.niceAxis(9000); // 2,5 Std
    expect(a.step).toBe(3600);
    expect(a.max).toBeGreaterThanOrEqual(9000);
    expect(a.count).toBeLessThanOrEqual(4);
    expect(L.niceAxis(86400 * 40).max).toBeGreaterThanOrEqual(86400 * 40);
  });
  it('axisTickLabel: Std bei vollen Stunden, sonst Min', () => {
    expect(L.axisTickLabel(0, 1800)).toBe('0');
    expect(L.axisTickLabel(5400, 1800)).toBe('90 Min');
    expect(L.axisTickLabel(7200, 3600)).toBe('2 Std');
  });
  it('bucketDetails: Anteil, Rang, Abweichung vom Schnitt, Wochentag im Titel', () => {
    const data = [
      { key: '2026-11-08', seconds: 3600 },
      { key: '2026-11-09', seconds: 0 },
      { key: '2026-11-10', seconds: 7200 },
    ];
    const d = L.bucketDetails('day', data, 2);
    expect(d.title).toBe('Dienstag, 10. November 2026');
    expect(d.share).toBeCloseTo(2 / 3);
    expect(d.rank).toBe(1);
    expect(d.active).toBe(2);
    expect(d.avg).toBe(5400);
    expect(d.vsAvg).toBeCloseTo(7200 / 5400 - 1);
    const z = L.bucketDetails('day', data, 1);
    expect(z.share).toBeUndefined();
  });
  it('renderTimeline: Klick auf Balken zeigt Details, zweiter Klick blendet sie aus', () => {
    const c = document.createElement('div');
    document.body.appendChild(c);
    L.renderTimeline(c, { range: '7d', timeline: { unit: 'day', buckets: [{ key: '2026-11-09', seconds: 3600 }] } });
    const hits = c.querySelectorAll('.hit');
    expect(hits.length).toBeGreaterThanOrEqual(7);
    expect(c.querySelector('.tl-detail').textContent).toContain('Tippe');
    hits[3].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(c.querySelector('.tl-detail .tl-t')).not.toBeNull();
    expect(c.querySelectorAll('.bar.sel').length).toBe(1);
    hits[3].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(c.querySelector('.tl-detail .tl-t')).toBeNull();
    expect(c.querySelectorAll('.bar.sel').length).toBe(0);
  });
});

describe('Heatmap', () => {
  it('Sonntag (dow 0) landet in der letzten Zeile, Montag (dow 1) in der ersten', () => {
    const hm = L.buildHeatmap([
      { dow: 0, hour: 21, seconds: 8000 },
      { dow: 1, hour: 0, seconds: 4000 },
      { dow: 6, hour: 23, seconds: 100 },
    ]);
    expect(hm.matrix[6][21]).toBe(8000);
    expect(hm.matrix[0][0]).toBe(4000);
    expect(hm.matrix[5][23]).toBe(100);
    expect(hm.max).toBe(8000);
    expect(hm.levels[6][21]).toBe(5);
    expect(hm.levels[0][0]).toBe(3);
    expect(hm.levels[1][1]).toBe(0);
    expect(hm.matrix).toHaveLength(7);
    expect(hm.matrix[0]).toHaveLength(24);
  });
});

describe('Anteile', () => {
  it('Methoden: nur > 0, Summe 1', () => {
    const r = L.methodShares({ directPlay: { plays: 60, seconds: 75 }, directStream: { plays: 0, seconds: 0 }, transcode: { plays: 20, seconds: 25 }, other: { plays: 0, seconds: 0 } });
    expect(r.map((x) => x.key)).toEqual(['directPlay', 'transcode']);
    expect(r[0].share).toBeCloseTo(0.75);
  });
  it('Geräte: Top 5 nach Watchtime', () => {
    const devs = [];
    for (let i = 1; i <= 7; i++) devs.push({ client: 'C' + i, device: 'D' + i, plays: 1, seconds: i * 100 });
    const r = L.deviceShares(devs);
    expect(r).toHaveLength(5);
    expect(r[0].label).toBe('D7 · C7');
  });
  it('Vergleichssatz und Folgenlabel', () => {
    expect(L.compareText({ rank: 2, of: 7, avgSeconds: 98000 })).toBe('Platz 2 von 7 · Ø 27 Std');
    expect(L.compareText(null)).toBe('');
    expect(L.episodeLabel(1, 5)).toBe('S01E05');
    expect(L.episodeLabel(null, 5)).toBe('');
  });
});

describe('Requests', () => {
  it('Statistik-Request: Token nur im Header X-Emby-Token', () => {
    const r = L.buildStatsRequest('30d', 'SECRET-TOKEN');
    expect(r.url).toBe('/lenzflix-stats/api/me/stats?range=30d');
    expect(r.url).not.toContain('SECRET');
    expect(r.init.body).toBeUndefined();
    expect(Object.keys(r.init.headers)).toEqual(['X-Emby-Token']);
    expect(r.init.headers['X-Emby-Token']).toBe('SECRET-TOKEN');
  });

  it('loadStats schickt über fetch weder Passwort noch Token in URL/Body', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ totals: { seconds: 1 } })) }));
    window.fetch = fetchMock;
    const stats = await L.loadStats('7d', 'SECRET-TOKEN');
    expect(stats.totals.seconds).toBe(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.startsWith('/lenzflix-stats/api/')).toBe(true);
    expect(url).not.toContain('SECRET');
    expect(init.body).toBeUndefined();
    expect(JSON.stringify(init.headers)).toBe('{"X-Emby-Token":"SECRET-TOKEN"}');
  });

  it('loadStats: 401 → unauthorized, 502/Nicht-JSON/Netzfehler → unreachable', async () => {
    window.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 401, text: () => Promise.resolve('{"error":"unauthorized"}') }));
    await expect(L.loadStats('30d', 't')).rejects.toMatchObject({ code: 'unauthorized' });
    window.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 502, text: () => Promise.resolve('{"error":"upstream-unreachable"}') }));
    await expect(L.loadStats('30d', 't')).rejects.toMatchObject({ code: 'unreachable' });
    window.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<html>') }));
    await expect(L.loadStats('30d', 't')).rejects.toMatchObject({ code: 'unreachable' });
    window.fetch = vi.fn(() => Promise.reject(new Error('net')));
    await expect(L.loadStats('30d', 't')).rejects.toMatchObject({ code: 'unreachable' });
  });

  it('Login-Request: Passwort nur im Body an /Users/AuthenticateByName, nie im Header/URL', () => {
    const r = L.buildLoginRequest('anna', 'geheim', 'Handy', 'dev123');
    expect(r.url).toBe('/Users/AuthenticateByName');
    expect(JSON.parse(r.init.body)).toEqual({ Username: 'anna', Pw: 'geheim' });
    expect(JSON.stringify(r.init.headers)).not.toContain('geheim');
    expect(r.init.headers['Content-Type']).toBe('application/json');
    expect(r.init.headers.Authorization).toContain('DeviceId="dev123"');
  });
});

describe('Textinjektion', () => {
  it('Titel mit HTML bleibt Text', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const items = { abc123: { name: evil, tag: '', type: 'Series' } };
    const n = L.renderTopList(container, [{ id: 'ABC123', seconds: 3600, episodes: 2 }, { id: 'missing', seconds: 1, episodes: 1 }], items, 'series');
    expect(n).toBe(1);
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain(evil);
    expect(container.querySelector('.tname').getAttribute('title')).toBe(evil);
  });
});

describe('Share-Dialog', () => {
  const ITEMS = {
    s1: { name: 'Serie Eins', tag: '', type: 'Series' },
    s2: { name: 'Serie Zwei', tag: '', type: 'Series' },
    m1: { name: 'Film Eins', tag: '', type: 'Movie' },
  };
  const fullStats = () => ({
    range: '30d',
    totals: { seconds: 123456, plays: 9, episodes: 7, movies: 2, series: 2, activeDays: 5 },
    compare: { rank: 3, of: 12, avgSeconds: 98000 },
    topSeries: [{ id: 'S1', seconds: 7200, episodes: 4 }, { id: 'S2', seconds: 3600, episodes: 3 }],
    topMovies: [{ id: 'M1', seconds: 5400, plays: 1 }],
    timeline: { unit: 'day', buckets: [{ key: '2026-11-09', seconds: 3600 }] },
    heatmap: [{ dow: 1, hour: 0, seconds: 100 }, { dow: 0, hour: 5, seconds: 400 }],
    binge: { topDay: { date: '2026-11-02', seconds: 9000 }, seriesDay: { seriesId: 's1', date: '2026-11-02', episodes: 5 } },
    devices: [{ client: 'Web', device: 'Chrome', plays: 3, seconds: 500 }],
    methods: { directPlay: { plays: 3, seconds: 500 } },
  });

  let origGetContext;
  let origToBlob;

  function makeCtx() {
    const rec = { calls: [] };
    ['fillRect', 'fillText', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'closePath', 'fill', 'clip', 'save', 'restore', 'drawImage'].forEach((m) => {
      rec[m] = (...args) => {
        rec.calls.push({ m, args, fillStyle: rec.fillStyle });
      };
    });
    rec.measureText = (t) => ({ width: String(t).length * 10 });
    return rec;
  }

  beforeEach(() => {
    origGetContext = HTMLCanvasElement.prototype.getContext;
    origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.getContext = function () {
      if (!this.__ctx) this.__ctx = makeCtx();
      return this.__ctx;
    };
    HTMLCanvasElement.prototype.toBlob = function (cb) {
      cb(new Blob(['x'], { type: 'image/png' }));
    };
    L.closeShareDialog(false);
    L.state.token = null;
    L.state.items = ITEMS;
    document.body.style.overflow = '';
  });

  afterEach(() => {
    L.closeShareDialog(false);
    HTMLCanvasElement.prototype.getContext = origGetContext;
    HTMLCanvasElement.prototype.toBlob = origToBlob;
  });

  const texts = (ctx) => ctx.calls.filter((c) => c.m === 'fillText').map((c) => c.args[0]);
  const tabByLabel = (label) => [...document.querySelectorAll('.share-dialog .tab')].find((b) => b.textContent === label);
  const btnByLabel = (label) => [...document.querySelectorAll('.share-dialog .btn')].find((b) => b.textContent === label);

  it('Varianten-Verfügbarkeit je nach Datenlage', () => {
    expect(L.shareVariants(fullStats(), ITEMS)).toEqual(['overview', 'top', 'activity', 'binge']);
    const noTop = { ...fullStats(), topSeries: [], topMovies: [] };
    expect(L.shareVariants(noTop, ITEMS)).not.toContain('top');
    expect(L.shareVariants(fullStats(), {})).not.toContain('top');
    const noBinge = { ...fullStats(), binge: {}, devices: [], methods: {} };
    expect(L.shareVariants(noBinge, ITEMS)).not.toContain('binge');
    const noAct = { ...fullStats(), timeline: { unit: 'day', buckets: [] }, heatmap: [] };
    expect(L.shareVariants(noAct, ITEMS)).not.toContain('activity');
    expect(L.shareVariants({ totals: {} }, {})).toEqual(['overview']);
  });

  it('Format bestimmt die Canvas-Höhe; Dateiname', () => {
    const c = document.createElement('canvas');
    L.drawShare(c, { variant: 'overview', format: '4:5', stats: fullStats(), items: ITEMS });
    expect([c.width, c.height]).toEqual([1080, 1350]);
    L.drawShare(c, { variant: 'overview', format: 'story', stats: fullStats(), items: ITEMS });
    expect([c.width, c.height]).toEqual([1080, 1920]);
    expect(L.shareFileName('top', '4:5')).toBe('lenzflix-top-4x5.png');
    expect(L.shareFileName('binge', 'story')).toBe('lenzflix-binge-story.png');
  });

  it('fitText kürzt mit Ellipse', () => {
    const ctx = { measureText: (t) => ({ width: t.length * 10 }) };
    expect(L.fitText(ctx, 'kurz', 100)).toBe('kurz');
    const r = L.fitText(ctx, 'ein sehr langer Titel hier', 100);
    expect(r.endsWith('…')).toBe(true);
    expect(r.length * 10).toBeLessThanOrEqual(100);
    expect(L.fitText(ctx, null, 100)).toBe('');
  });

  it('Overview zeigt Rahmen, Watchtime, Platz und Top-Serie', () => {
    const c = document.createElement('canvas');
    L.drawShare(c, { variant: 'overview', format: '4:5', stats: fullStats(), items: ITEMS });
    const t = texts(c.__ctx);
    expect(t).toContain('LENZFLIX');
    expect(t).toContain('Meine Statistik · Letzte 30 Tage');
    expect(t).toContain('Inoffizielles Jellyfin-Theme');
    expect(t).toContain('34 Std 18 Min');
    expect(t).toContain('7 Folgen · 2 Filme · 2 Serien');
    expect(t).toContain('Platz 3 von 12 · Ø 27 Std');
    expect(t).toContain('Serie Eins');
  });

  it('Overview nutzt bei genau 1 die Einzahl (Folge, Film, Serie)', () => {
    const c = document.createElement('canvas');
    const stats = fullStats();
    stats.totals = Object.assign({}, stats.totals, { episodes: 1, movies: 1, series: 1 });
    L.drawShare(c, { variant: 'overview', format: '4:5', stats: stats, items: ITEMS });
    expect(texts(c.__ctx)).toContain('1 Folge · 1 Film · 1 Serie');
    const z = document.createElement('canvas');
    stats.totals = Object.assign({}, stats.totals, { episodes: 0, movies: 0, series: 0 });
    L.drawShare(z, { variant: 'overview', format: '4:5', stats: stats, items: ITEMS });
    expect(texts(z.__ctx)).toContain('0 Folgen · 0 Filme · 0 Serien');
  });

  it('Heatmap im Share-Layout: Montag zuerst, Sonntag zuletzt', () => {
    const c = document.createElement('canvas');
    L.drawShare(c, { variant: 'activity', format: '4:5', stats: fullStats(), items: ITEMS });
    const ctx = c.__ctx;
    const labels = texts(ctx).filter((x) => ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].includes(x));
    expect(labels).toEqual(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']);
    const red = ctx.calls.filter((cl) => cl.m === 'fillRect' && String(cl.fillStyle).indexOf('rgba(229, 9, 20') === 0 && cl.args[2] < 40);
    expect(red).toHaveLength(2);
    const mon = red.find((cl) => cl.args[0] === 80 + 70); // Stunde 0
    const sun = red.find((cl) => cl.args[0] === 80 + 70 + 5 * 35); // Stunde 5
    expect(mon.args[1]).toBeLessThan(sun.args[1]);
  });

  it('Dialog öffnen: ARIA, Fokus, nur einer gleichzeitig; Schließen per Button', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const ov = L.openShareDialog(fullStats(), trigger);
    const dlg = document.querySelector('[role="dialog"]');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(dlg.getAttribute('aria-label')).toBeTruthy();
    expect(document.activeElement).toBe(dlg);
    expect(document.body.style.overflow).toBe('hidden');
    expect(L.openShareDialog(fullStats(), trigger)).toBe(ov);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(tabByLabel('Überblick').getAttribute('aria-pressed')).toBe('true');
    expect(tabByLabel('4:5').classList.contains('on')).toBe(true);
    btnByLabel('Schließen').click();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe('');
  });

  it('Esc und Klick auf den Hintergrund schließen; Klick im Dialog nicht', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    L.openShareDialog(fullStats(), trigger);
    document.querySelector('.share-dialog').click();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    L.openShareDialog(fullStats(), trigger);
    document.querySelector('.share-overlay').click();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.share-overlay')).toBeNull();
  });

  it('Tab- und Formatwechsel zeichnen mit der richtigen Variante/Höhe', () => {
    L.openShareDialog(fullStats(), null);
    const canvas = document.querySelector('.share-canvas');
    expect(canvas.height).toBe(1350);
    tabByLabel('Top').click();
    expect(texts(canvas.__ctx)).toContain('Top-Serien');
    expect(tabByLabel('Top').getAttribute('aria-pressed')).toBe('true');
    expect(tabByLabel('Überblick').getAttribute('aria-pressed')).toBe('false');
    tabByLabel('Binge').click();
    expect(texts(canvas.__ctx)).toContain('Top-Geräte');
    expect(texts(canvas.__ctx)).toContain('Wiedergabeart');
    tabByLabel('Verlauf').click();
    expect(texts(canvas.__ctx)).toContain('Wann du schaust');
    tabByLabel('Story 9:16').click();
    expect(canvas.height).toBe(1920);
    expect(tabByLabel('Story 9:16').classList.contains('on')).toBe(true);
  });

  it('Varianten ohne Daten fehlen in der Leiste', () => {
    const s = { ...fullStats(), topSeries: [], topMovies: [], binge: {}, devices: [], methods: {} };
    L.openShareDialog(s, null);
    expect(tabByLabel('Top')).toBeUndefined();
    expect(tabByLabel('Binge')).toBeUndefined();
    expect(tabByLabel('Verlauf')).toBeDefined();
  });

  it('Speichern erzeugt PNG-Download mit Dateiname (ohne Share-API)', async () => {
    const created = [];
    URL.createObjectURL = () => 'blob:fake';
    URL.revokeObjectURL = () => {};
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      created.push(this.download);
    };
    try {
      L.openShareDialog(fullStats(), null);
      tabByLabel('Top').click();
      tabByLabel('Story 9:16').click();
      btnByLabel('Speichern / Teilen').click();
      await new Promise((r) => setTimeout(r, 20));
      expect(created).toEqual(['lenzflix-top-story.png']);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });

  it('Titel mit HTML bleibt im Dialog/Canvas Text', () => {
    const evil = '<img src=x onerror=alert(1)>';
    L.state.items = { s1: { name: evil, tag: '', type: 'Series' } };
    L.openShareDialog({ ...fullStats(), topMovies: [] }, null);
    tabByLabel('Top').click();
    expect(document.querySelector('.share-overlay img')).toBeNull();
    expect(document.querySelector('[onerror]')).toBeNull();
    expect(texts(document.querySelector('.share-canvas').__ctx).some((t) => t.indexOf('<img') === 0)).toBe(true);
  });
  it('Poster-Race: Wechsel während des Ladens zeichnet Poster im aktuellen Format nach; Speichern wartet', async () => {
    const origImage = globalThis.Image;
    const origFetch = window.fetch;
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    window.fetch = () => gate.then(() => ({ ok: true, blob: () => Promise.resolve(new Blob(['p'])) }));
    URL.createObjectURL = () => 'blob:poster';
    URL.revokeObjectURL = () => {};
    globalThis.Image = function () {
      const img = { width: 100, height: 150 };
      Object.defineProperty(img, 'src', {
        set() {
          setTimeout(() => img.onload && img.onload(), 0);
        },
      });
      return img;
    };
    const exported = [];
    HTMLCanvasElement.prototype.toBlob = function (cb) {
      exported.push({ height: this.height, draws: this.__ctx.calls.filter((c) => c.m === 'drawImage').length });
      cb(new Blob(['x'], { type: 'image/png' }));
    };
    HTMLAnchorElement.prototype.click = function () {};
    try {
      L.state.token = 'tok';
      L.state.items = { s1: { name: 'Serie Eins', tag: 't1', type: 'Series' } };
      L.openShareDialog({ ...fullStats(), topSeries: [{ id: 's1', seconds: 60, episodes: 1 }], topMovies: [] }, null);
      const canvas = document.querySelector('.share-canvas');
      tabByLabel('Top').click();
      tabByLabel('Story 9:16').click();
      btnByLabel('Speichern / Teilen').click();
      await new Promise((r) => setTimeout(r, 10));
      expect(exported).toHaveLength(0); // wartet auf Poster
      release();
      await new Promise((r) => setTimeout(r, 50));
      expect(canvas.height).toBe(1920);
      expect(canvas.__ctx.calls.filter((c) => c.m === 'drawImage').length).toBeGreaterThan(0);
      expect(exported).toHaveLength(1);
      expect(exported[0].height).toBe(1920);
      expect(exported[0].draws).toBeGreaterThan(0);
      // Poster im Cache: Export läuft synchron im Klick-Handler
      btnByLabel('Speichern / Teilen').click();
      expect(exported).toHaveLength(2);
    } finally {
      globalThis.Image = origImage;
      window.fetch = origFetch;
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      HTMLAnchorElement.prototype.click = origClick;
    }
  });

  it('Randfälle: leere Daten → keine Varianten; Watchtime-Schrift schrumpft statt zu kürzen', () => {
    const zero = { ...fullStats(), timeline: { unit: 'day', buckets: [{ key: '2026-11-09', seconds: 0 }] }, heatmap: [{ dow: 1, hour: 1, seconds: 0 }], binge: {}, devices: [{ device: 'X', seconds: 0 }], methods: { directPlay: { plays: 2, seconds: 0 } } };
    const v = L.shareVariants(zero, ITEMS);
    expect(v).not.toContain('activity');
    expect(v).not.toContain('binge');
    const c = document.createElement('canvas');
    const st = { ...fullStats(), totals: { ...fullStats().totals, seconds: 5 * 86400 + 3 * 3600 } };
    L.drawShare(c, { variant: 'overview', format: '4:5', stats: st, items: ITEMS });
    const t = c.__ctx.calls.filter((x) => x.m === 'fillText').map((x) => x.args[0]);
    expect(t).toContain('5 Tage 3 Std');
    expect(t.some((x) => x.endsWith('…'))).toBe(false);
  });
  /* ---- Poster-Races (Fetch-Gate + Fake-Image) ---- */
  function posterEnv(prefix, mode) {
    const orig = {
      Image: globalThis.Image,
      fetch: window.fetch,
      create: URL.createObjectURL,
      revoke: URL.revokeObjectURL,
      click: HTMLAnchorElement.prototype.click,
    };
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    window.fetch = () =>
      gate.then(() => {
        if (mode === 'reject') throw new Error('net');
        if (mode === '404') return { ok: false, blob: () => Promise.resolve(null) };
        return { ok: true, blob: () => Promise.resolve(new Blob(['p'])) };
      });
    URL.createObjectURL = () => 'blob:poster';
    URL.revokeObjectURL = () => {};
    globalThis.Image = function () {
      const img = { width: 100, height: 150 };
      Object.defineProperty(img, 'src', {
        set() {
          setTimeout(() => img.onload && img.onload(), 0);
        },
      });
      return img;
    };
    const downloads = [];
    HTMLAnchorElement.prototype.click = function () {
      downloads.push(this.download);
    };
    const exported = [];
    HTMLCanvasElement.prototype.toBlob = function (cb) {
      exported.push({ height: this.height, draws: lastFrameDraws(this) });
      cb(new Blob(['x'], { type: 'image/png' }));
    };
    const items = {};
    const series = [];
    const movies = [];
    for (let i = 1; i <= 6; i++) {
      items[prefix + 's' + i] = { name: 'Serie ' + i, tag: 't', type: 'Series' };
      series.push({ id: prefix + 's' + i, seconds: 600 * (7 - i), episodes: i });
    }
    for (let i = 1; i <= 4; i++) {
      items[prefix + 'm' + i] = { name: 'Film ' + i, tag: 't', type: 'Movie' };
      movies.push({ id: prefix + 'm' + i, seconds: 300 * (5 - i), plays: 1 });
    }
    L.state.token = 'tok';
    L.state.items = items;
    return {
      stats: { ...fullStats(), topSeries: series, topMovies: movies },
      release,
      exported,
      downloads,
      restore() {
        globalThis.Image = orig.Image;
        window.fetch = orig.fetch;
        URL.createObjectURL = orig.create;
        URL.revokeObjectURL = orig.revoke;
        HTMLAnchorElement.prototype.click = orig.click;
      },
    };
  }

  /** drawImage-Aufrufe seit dem letzten Hintergrund-fillRect (= letzter vollständiger Zeichenvorgang). */
  function lastFrameDraws(canvas) {
    const calls = canvas.__ctx.calls;
    let start = 0;
    calls.forEach((c, i) => {
      if (c.m === 'fillRect' && c.args[0] === 0 && c.args[1] === 0 && c.args[2] === 1080 && c.args[3] > 1000) start = i;
    });
    return calls.slice(start).filter((c) => c.m === 'drawImage').length;
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  it('Save, dann Formatwechsel während des Ladens: ein Export im aktuellen Format mit Postern', async () => {
    const env = posterEnv('a', 'ok');
    try {
      L.openShareDialog(env.stats, null);
      const canvas = document.querySelector('.share-canvas');
      tabByLabel('Top').click();
      btnByLabel('Speichern / Teilen').click();
      tabByLabel('Story 9:16').click();
      await wait(10);
      expect(env.exported).toHaveLength(0);
      env.release();
      await wait(60);
      expect(env.exported).toHaveLength(1);
      expect(env.exported[0].height).toBe(1920);
      expect(env.exported[0].draws).toBe(10);
      expect(canvas.height).toBe(1920);
      expect(env.downloads).toEqual(['lenzflix-top-story.png']);
      expect(btnByLabel('Speichern / Teilen').disabled).toBe(false);
    } finally {
      env.restore();
    }
  });

  it('Save, dann Schließen während des Ladens: kein Export, keine Exception', async () => {
    const env = posterEnv('b', 'ok');
    try {
      L.openShareDialog(env.stats, null);
      tabByLabel('Top').click();
      btnByLabel('Speichern / Teilen').click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      env.release();
      await wait(60);
      expect(env.exported).toHaveLength(0);
      expect(env.downloads).toEqual([]);
    } finally {
      env.restore();
    }
  });

  it('Race Top → Überblick → Top: letzter Zeichenvorgang hat alle 8 Poster', async () => {
    const env = posterEnv('c', 'ok');
    try {
      L.openShareDialog(env.stats, null);
      const canvas = document.querySelector('.share-canvas');
      tabByLabel('Top').click();
      tabByLabel('Überblick').click();
      tabByLabel('Top').click();
      env.release();
      await wait(60);
      expect(canvas.height).toBe(1350);
      expect(lastFrameDraws(canvas)).toBe(8);
    } finally {
      env.restore();
    }
  });

  it('Race 4:5 → Story → 4:5 in Top: 8 Poster im 4:5-Frame; Story zeigt 10', async () => {
    const env = posterEnv('d', 'ok');
    try {
      L.openShareDialog(env.stats, null);
      const canvas = document.querySelector('.share-canvas');
      tabByLabel('Top').click();
      tabByLabel('Story 9:16').click();
      tabByLabel('4:5').click();
      env.release();
      await wait(60);
      expect(canvas.height).toBe(1350);
      expect(lastFrameDraws(canvas)).toBe(8);
      tabByLabel('Story 9:16').click();
      await wait(30);
      expect(canvas.height).toBe(1920);
      expect(lastFrameDraws(canvas)).toBe(10);
    } finally {
      env.restore();
    }
  });

  it.each(['reject', '404'])('Poster-Fetch fehlgeschlagen (%s): Platzhalter, Save wieder aktiv, Export läuft', async (mode) => {
    const env = posterEnv('e' + mode.charAt(0), mode);
    try {
      L.openShareDialog(env.stats, null);
      const canvas = document.querySelector('.share-canvas');
      tabByLabel('Top').click();
      btnByLabel('Speichern / Teilen').click();
      expect(btnByLabel('Speichern / Teilen').disabled).toBe(true);
      env.release();
      await wait(60);
      expect(lastFrameDraws(canvas)).toBe(0);
      expect(canvas.__ctx.calls.some((c) => c.m === 'fillText' && c.args[0] === 'S')).toBe(true); // Platzhalter-Buchstabe
      expect(btnByLabel('Speichern / Teilen').disabled).toBe(false);
      expect(env.exported).toHaveLength(1);
      expect(env.downloads).toEqual(['lenzflix-top-4x5.png']);
    } finally {
      env.restore();
    }
  });
});

describe('Ladeanzeige', () => {
  const SERIES_ID = 'a'.repeat(32);
  const STATS = {
    version: 1,
    range: '30d',
    computedAt: '2026-11-10T12:00:00Z',
    stale: false,
    approx: false,
    ignored: false,
    totals: { seconds: 3600, plays: 2, episodes: 1, movies: 0, series: 1, activeDays: 1, firstAt: null, lastAt: null },
    topSeries: [{ id: SERIES_ID, seconds: 3000, episodes: 1 }],
    topMovies: [],
    timeline: { unit: 'day', buckets: [] },
    heatmap: [],
    binge: { topDay: null, seriesDay: null },
    devices: [],
    methods: {
      directPlay: { plays: 0, seconds: 0 },
      directStream: { plays: 0, seconds: 0 },
      transcode: { plays: 0, seconds: 0 },
      other: { plays: 0, seconds: 0 },
    },
    compare: null,
  };

  function gate() {
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  function json(body) {
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  beforeEach(() => {
    document.body.innerHTML = '<main id="lfx-app"></main>';
    L.state.token = 'tok';
    L.state.userId = 'u1';
    L.state.range = '30d';
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('showLoading: Statusbereich mit laufendem Balken, Schritt-Anzeige und Hinweis', () => {
    const ui = L.showLoading('Statistik wird berechnet …', 1, 2);
    const box = document.querySelector('#lfx-app .loading');
    expect(box.getAttribute('role')).toBe('status');
    expect(box.querySelector('.progress .progress-run')).not.toBeNull();
    expect(box.querySelector('.loading-title').textContent).toBe('Statistik wird berechnet …');
    expect(box.textContent).toContain('Schritt 1 von 2');
    ui.step('Titel und Poster werden geladen …', 2);
    expect(box.querySelector('.loading-title').textContent).toBe('Titel und Poster werden geladen …');
    expect(box.textContent).toContain('Schritt 2 von 2');
    ui.hint('Bitte kurz warten.');
    expect(box.textContent).toContain('Bitte kurz warten.');
    // kein Inline-Style, kein HTML aus Daten
    expect(box.innerHTML).not.toContain('style=');
  });

  it('loadAll: nach 3,5 s erscheint der Hinweis zur längeren Berechnung', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    L.loadAll();
    const box = () => document.querySelector('#lfx-app .loading');
    expect(box().textContent).toContain('Statistik wird berechnet');
    expect(box().textContent).not.toContain('Nach längerer Pause');
    vi.advanceTimersByTime(3000);
    expect(box().textContent).not.toContain('Nach längerer Pause');
    vi.advanceTimersByTime(600);
    expect(box().textContent).toContain('Nach längerer Pause');
  });

  it('loadAll: Schritt 1 (berechnen) → Schritt 2 (Titel/Poster) → Dashboard ohne Ladebalken', async () => {
    const statsGate = gate();
    const itemsGate = gate();
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        const u = String(url);
        if (u.indexOf('/lenzflix-stats/api/me/stats') >= 0) return statsGate.promise;
        if (u.indexOf('/Items?') >= 0) return itemsGate.promise;
        return Promise.resolve(new Response('', { status: 404 }));
      })
    );
    L.loadAll();
    const text = () => (document.getElementById('lfx-app') || document.body).textContent;
    expect(text()).toContain('Statistik wird berechnet');
    expect(text()).toContain('Schritt 1 von 2');
    statsGate.resolve(json(STATS));
    await vi.waitFor(() => expect(text()).toContain('Titel und Poster werden geladen'));
    expect(text()).toContain('Schritt 2 von 2');
    expect(document.querySelector('.progress-run')).not.toBeNull();
    itemsGate.resolve(json({ Items: [{ Id: SERIES_ID, Name: 'Serie Eins', Type: 'Series', ImageTags: {} }] }));
    await vi.waitFor(() => expect(text()).toContain('Watchtime'));
    expect(document.querySelector('.loading')).toBeNull();
    expect(document.querySelector('.progress-run')).toBeNull();
  });

  it('loadAll: Serverfehler ersetzt den Ladebalken durch die Fehlermeldung', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    L.loadAll();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Server gerade nicht erreichbar'));
    expect(document.querySelector('.loading')).toBeNull();
  });
});
