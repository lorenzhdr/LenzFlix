// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from '../src/js/serverstats/app.js';

const ok = (data) => ({ ok: true, status: 200, data });
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

function month(m, over) {
  const ym = m === 0 ? '2026-11' : m === 1 ? '2026-10' : '2026-09';
  return {
    v: 1,
    ym,
    m,
    maxM: 2,
    partial: m === 0,
    totals: { secs: 182 * 3600 + 900, plays: 10, users: 4 },
    prev: { ym: '2026-10', secs: 160 * 3600 },
    days: [
      { d: '2026-11-11', secs: 3600 },
      { d: '2026-11-12', secs: 6 * 3600 + 1200 },
    ],
    top: { d: '2026-11-12', secs: 6 * 3600 + 1200 },
    heat: [
      [0, 20, 7200],
      [1, 21, 3600],
      [9, 99, 5],
    ],
    mix: {
      dev: { tv: 6, phone: 3, web: 1, other: 0 },
      method: { direct: 9, transcode: 1 },
      type: { movie: 5, episode: 5 },
    },
    tx: { tx: 1.42e12, rx: 1e12 },
    ...over,
  };
}

function mk(get) {
  const app = create({
    get,
    img: () => null,
    openItem: vi.fn(),
    tabs: ['now', 'month'],
    maxM: 2,
  });
  document.body.append(app.el);
  return app;
}
const open = async (app) => {
  app.el.querySelectorAll('[role=tab]')[1].click();
  await flush();
};
const monthGets = (get) => get.mock.calls.map((c) => c[0]).filter((p) => p.startsWith('/srv/month'));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('serverstats Reiter Monat', () => {
  it('lädt erst beim Öffnen und zeigt KPIs, Rekordtag, Heatmap, Mix', async () => {
    const get = vi.fn((p) => Promise.resolve(p.startsWith('/srv/month') ? ok(month(0)) : ok({ n: 0, rows: [] })));
    const app = mk(get);
    await flush();
    expect(monthGets(get)).toHaveLength(0);
    await open(app);
    expect(monthGets(get)).toEqual(['/srv/month?m=0']);
    const el = app.el;
    expect(el.querySelector('.lfx-srv-monthnav__l').textContent).toBe('November 2026');
    const kpis = [...el.querySelectorAll('.lfx-srv-kpi')].map((k) => k.textContent);
    expect(kpis[0]).toBe('182 h 15 minSchauzeit');
    expect(kpis[1]).toBe('1,42 TBUpload');
    expect(kpis[2]).toBe('+1.666 %Tagesschnitt ggü. Vormonat'); // laufender Monat: Tagesschnitt (2 Tage) gegen Oktober (31 Tage)
    expect(kpis[3]).toBe('4Aktive Konten');
    const top = el.querySelector('.lfx-srv-day.is-top');
    expect(top.getAttribute('title')).toBe('Do., 12.11.: 6 h 20 min');
    expect(el.querySelectorAll('.lfx-srv-day')).toHaveLength(2);
    const svg = el.querySelector('svg.lfx-srv-heat');
    expect(svg.getAttribute('viewBox')).toBeTruthy();
    expect(svg.querySelectorAll('rect')).toHaveLength(168);
    expect(svg.querySelectorAll('rect:not(.is-0)')).toHaveLength(2);
    // Sonntag 20 Uhr steht in der letzten Zeile (Index 6)
    const rects = [...svg.querySelectorAll('rect')];
    expect(rects[6 * 24 + 20].classList.contains('is-0')).toBe(false);
    expect(el.querySelectorAll('.lfx-srv-split')).toHaveLength(3);
    expect(el.querySelector('.lfx-srv-split__legend').textContent).toContain('TV 60 %');
    app.dispose();
  });

  it('blättert mit Grenzen und merkt Antworten je m', async () => {
    const get = vi.fn((p) =>
      Promise.resolve(p.startsWith('/srv/month') ? ok(month(+p.split('=')[1])) : ok({ n: 0, rows: [] })),
    );
    const app = mk(get);
    await open(app);
    const [prev, next] = app.el.querySelectorAll('.lfx-srv-nav');
    expect(next.disabled).toBe(true);
    expect(prev.disabled).toBe(false);
    prev.click();
    await flush();
    expect(app.el.querySelector('.lfx-srv-monthnav__l').textContent).toBe('Oktober 2026');
    prev.click();
    await flush();
    expect(prev.disabled).toBe(true);
    expect(app.el.querySelector('.lfx-srv-monthnav__l').textContent).toBe('September 2026');
    next.click();
    next.click();
    await flush();
    expect(app.el.querySelector('.lfx-srv-monthnav__l').textContent).toBe('November 2026');
    expect(monthGets(get)).toEqual(['/srv/month?m=0', '/srv/month?m=1', '/srv/month?m=2']);
    expect(next.disabled).toBe(true);
    app.dispose();
  });

  it('Vormonat 0 → „neu“, Upload ohne tx → „–“', async () => {
    const get = vi.fn((p) =>
      Promise.resolve(
        p.startsWith('/srv/month')
          ? ok(
              month(0, {
                prev: { ym: '2026-10', secs: 0 },
                tx: undefined,
              }),
            )
          : ok({ n: 0, rows: [] }),
      ),
    );
    const app = mk(get);
    await open(app);
    const kpis = [...app.el.querySelectorAll('.lfx-srv-kpi')].map((k) => k.textContent);
    expect(kpis[1]).toBe('–Upload');
    expect(kpis[2]).toBe('neuTagesschnitt ggü. Vormonat');
    app.dispose();
  });

  it('503 zeigt den neutralen Hinweis, stale-Antworten werden nicht gemerkt', async () => {
    const get = vi.fn((p) =>
      Promise.resolve(p.startsWith('/srv/month') ? { ok: false, status: 503 } : ok({ n: 0, rows: [] })),
    );
    const app = mk(get);
    await open(app);
    expect(app.el.textContent).toContain('vermutlich ein Neustart');
    expect(app.el.querySelector('.lfx-srv-error')).toBeNull();
    app.dispose();

    const get2 = vi.fn((p) =>
      Promise.resolve(p.startsWith('/srv/month') ? ok(month(0, { stale: 1 })) : ok({ n: 0, rows: [] })),
    );
    const app2 = mk(get2);
    await open(app2);
    expect(app2.el.textContent).toContain('zuletzt gespeicherte Stand');
    const tabs = app2.el.querySelectorAll('[role=tab]');
    tabs[0].click();
    tabs[1].click();
    await flush();
    expect(monthGets(get2)).toHaveLength(2);
    app2.dispose();
  });

  it('echter Fehler: ein stiller Neuversuch, dann Fehlerzustand', async () => {
    const get = vi.fn((p) =>
      Promise.resolve(p.startsWith('/srv/month') ? { ok: false, status: 0 } : ok({ n: 0, rows: [] })),
    );
    const app = mk(get);
    await open(app);
    expect(app.el.querySelector('.lfx-srv-error')).toBeNull();
    await flush(3000);
    expect(monthGets(get)).toHaveLength(2);
    expect(app.el.querySelector('.lfx-srv-error')).not.toBeNull();
    app.dispose();
  });
});
