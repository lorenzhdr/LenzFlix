// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
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
