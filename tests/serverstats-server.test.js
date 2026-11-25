// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from '../src/js/serverstats/app.js';

const ok = (data) => ({ ok: true, status: 200, data });
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

const FULL = {
  v: 1,
  health: {
    ageS: 120,
    stale: false,
    tempC: 74,
    cpuPct: 12,
    mem: { total: 8e9, avail: 4e9 },
    uptimeS: 3 * 86400 + 4 * 3600,
  },
  disks: {
    ageS: 60,
    list: [{ l: 'Medien', size: 4e12, used: 1.2e12, avail: 2.8e12 }],
  },
  traffic: {
    ageS: 60,
    days: [
      { d: '2026-11-01', rx: 5e9, tx: 2e9 },
      { d: '2026-11-02', rx: 1e9, tx: 3e9 },
    ],
    months: [
      { ym: '2026-10', rx: 1e12, tx: 4e11 },
      { ym: '2026-11', rx: 2e11, tx: 1e11 },
    ],
  },
  library: {
    movies: 681,
    series: 157,
    episodes: 9224,
    newMovies: 12,
    newEpisodes: 80,
    ym: '2026-11',
    runtimeS: 312 * 86400,
  },
  records: {
    day: { d: '2026-03-01', secs: 8 * 3600 },
    month: { ym: '2026-01', secs: 400 * 3600 },
    conc: { n: 5, date: '2026-10-03' },
    binge: { n: 14, date: '2026-03-12' },
    tx: { ym: '2026-10', bytes: 2e12 },
  },
};

function mk(get) {
  const app = create({
    get,
    img: () => null,
    openItem: vi.fn(),
    tabs: ['server'],
    maxM: 0,
  });
  document.body.append(app.el);
  return app;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('serverstats Reiter Server', () => {
  it('zeigt alle Abschnitte', async () => {
    const get = vi.fn(() => Promise.resolve(ok(FULL)));
    const app = mk(get);
    await flush();
    const t = app.el.textContent;
    expect(t).toContain('3 Tage 4 h');
    expect(t).toContain('1,2 TB von 4,0 TB belegt');
    expect(t).toContain('681 Filme · 157 Serien · 9.224 Folgen');
    expect(t).toContain('312 Tage');
    expect(t).toContain('Neu im November');
    expect(t).toContain('12 Filme · 80 Folgen');
    expect(t).toContain('5 Streams · 03.10.2026');
    expect(t).toContain('14 Folgen an einem Tag · 12.03.2026');
    expect(t).toContain('Upload-Rekord');
    expect(app.el.querySelectorAll('.lfx-srv-months__row')).toHaveLength(2);
    expect(app.el.querySelectorAll('.lfx-srv-days.is-traffic .lfx-srv-day')).toHaveLength(2);
    const temp = app.el.querySelector('[aria-label=Temperatur]');
    expect(temp.classList.contains('is-warn')).toBe(true);
    app.dispose();
  });

  it('lässt fehlende Abschnitte weg; ganz leer: Hinweis', async () => {
    const get = vi.fn(() => Promise.resolve(ok({ v: 1, library: FULL.library })));
    const app = mk(get);
    await flush();
    const heads = [...app.el.querySelectorAll('.lfx-srv-h')].map((x) => x.textContent);
    expect(heads).toEqual(['Bibliothek']);
    app.dispose();

    const app2 = mk(vi.fn(() => Promise.resolve(ok({ v: 1 }))));
    await flush();
    expect(app2.el.textContent).toContain('Noch keine Daten vom Server.');
    app2.dispose();
  });

  it('newCapped zeigt 600+, stale zeigt „vor 2 h“', async () => {
    const d = {
      v: 1,
      health: { ageS: 7200, stale: true, tempC: 40 },
      library: {
        ...FULL.library,
        newMovies: 600,
        newEpisodes: 600,
        newCapped: 1,
      },
    };
    const app = mk(vi.fn(() => Promise.resolve(ok(d))));
    await flush();
    expect(app.el.textContent).toContain('Letzte Meldung des Servers vor 2 h');
    expect(app.el.textContent).toContain('600+ Filme · 600+ Folgen');
    app.dispose();
  });

  it('lädt beim erneuten Öffnen nur nach 60 s neu', async () => {
    const get = vi.fn(() => Promise.resolve(ok(FULL)));
    const app = create({
      get,
      img: () => null,
      openItem: vi.fn(),
      tabs: ['now', 'server'],
      maxM: 0,
    });
    document.body.append(app.el);
    const tabs = app.el.querySelectorAll('[role=tab]');
    const calls = () => get.mock.calls.filter((c) => c[0] === '/srv/server').length;
    tabs[1].click();
    await flush();
    expect(calls()).toBe(1);
    tabs[0].click();
    tabs[1].click();
    await flush();
    expect(calls()).toBe(1);
    tabs[0].click();
    await flush(61000);
    tabs[1].click();
    await flush();
    expect(calls()).toBe(2);
    app.dispose();
  });
});
