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
  document.body.innerHTML = '<div id="lfx-app"></div>';
  L.state.range = '30d';
});

const FULL = {
  range: '30d',
  totals: { seconds: 7200, episodes: 3, movies: 1, series: 1, activeDays: 2 },
  timeline: { unit: 'day', buckets: [{ key: '2026-11-09', seconds: 3600 }] },
  heatmap: [],
};
const EMPTY = { range: '30d', totals: { seconds: 0, episodes: 0, movies: 0, series: 0, activeDays: 0 } };

describe('Statistik-Seite: Reiter und Fußtext', () => {
  it('Reiter tragen aria-pressed passend zum Zeitraum', () => {
    L.drawDashboard(FULL);
    const tabs = [...document.querySelectorAll('.tabs .tab')];
    expect(tabs.length).toBe(4);
    expect(tabs.filter((t) => t.getAttribute('aria-pressed') === 'true').map((t) => t.className)).toEqual(['tab on']);
    expect(tabs.filter((t) => t.getAttribute('aria-pressed') === 'false').length).toBe(3);
  });

  it('Fokus bleibt nach Zeitraumwechsel auf dem aktiven Reiter', () => {
    vi.stubGlobal('fetch', () => new Promise(() => {})); // kein Netzwerk
    L.drawDashboard(FULL);
    document.querySelectorAll('.tabs .tab')[0].click(); // 7 Tage -> Neuladen (loadAll) zeichnet später neu
    expect(L.state.range).not.toBe('30d');
    L.drawDashboard({ ...FULL, range: L.state.range });
    expect(document.activeElement.classList.contains('tab')).toBe(true);
    expect(document.activeElement.classList.contains('on')).toBe(true);
    vi.unstubAllGlobals();
  });

  it('Bild-Satz im Fußtext nur mit Speichern-Button', () => {
    L.drawDashboard(FULL);
    expect(document.querySelector('.actions .btn:not(.ghost)')).not.toBeNull();
    expect(document.querySelector('.foot').textContent).toContain('Das Bild wird');
    L.drawDashboard(EMPTY);
    expect(document.querySelector('.actions .btn:not(.ghost)')).toBeNull();
    expect(document.querySelector('.foot').textContent).not.toContain('Bild');
    L.drawDashboard({ ...FULL, ignored: true });
    expect(document.querySelector('.foot').textContent).not.toContain('Bild');
  });
});

describe('Statistik-Seite: Verlauf-Achsen am Handy', () => {
  const css = readFileSync(resolve(import.meta.dirname, '../charts-worker/public/lenzflix-stats/app.css'), 'utf8');
  const FS = 20;

  it('Achsenschrift im Handy-Block >= 20 Einheiten (ca. 10 px bei Faktor 0,53)', () => {
    const m = css.match(/\.chart \.ytick, \.theme-retro \.chart \.ytick \{ font-size: (\d+)px/);
    const t = css.match(/\.chart text, \.theme-retro \.chart text \{ font-size: (\d+)px/);
    expect(Number(m[1])).toBeGreaterThanOrEqual(FS);
    expect(Number(t[1])).toBeGreaterThanOrEqual(FS);
  });

  it('Y-Ticks (Kurzform) passen im Worst Case (Courier 0,6 em) in den linken Rand und oben ins viewBox', () => {
    const c = document.createElement('div');
    document.body.appendChild(c);
    const mk = (s) => ({ range: '30d', timeline: { unit: 'day', buckets: [{ key: '2026-11-09', seconds: s }, { key: '2026-11-10', seconds: s / 2 }] } });
    for (const secs of [3600 * 40, 3600 * 4, 3600 * 1.5, 1800]) {
      c.innerHTML = '';
      L.renderTimeline(c, mk(secs));
      const svg = c.querySelector('svg');
      const vbH = Number(svg.getAttribute('viewBox').split(' ')[3]);
      const ticks = [...svg.querySelectorAll('.ytick')];
      expect(ticks.length).toBeGreaterThan(1);
      for (const tk of ticks) {
        const txt = tk.textContent;
        expect(txt).toMatch(/^(0|\d+[hm])$/);
        expect(Number(tk.getAttribute('x')) - txt.length * FS * 0.6).toBeGreaterThanOrEqual(2);
        const y = Number(tk.getAttribute('y'));
        expect(y - FS * 0.75).toBeGreaterThanOrEqual(0);
        expect(y + FS * 0.25).toBeLessThanOrEqual(vbH);
      }
    }
  });
});

describe('Statistik-Seite: Verlauf', () => {
  it('Balken sind ein Tab-Stopp (roving tabindex) mit Pfeiltasten', () => {
    const c = document.createElement('div');
    document.body.appendChild(c);
    L.renderTimeline(c, { range: '7d', timeline: { unit: 'day', buckets: [] } });
    const hits = [...c.querySelectorAll('.hit')];
    expect(hits.filter((h) => h.getAttribute('tabindex') === '0').length).toBe(1);
    hits[0].focus();
    hits[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(hits[1].getAttribute('tabindex')).toBe('0');
    expect(hits[0].getAttribute('tabindex')).toBe('-1');
    expect(hits.filter((h) => h.getAttribute('tabindex') === '0').length).toBe(1);
    hits[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(hits.at(-1).getAttribute('tabindex')).toBe('0');
  });

  it('Detailtext: „pro aktiver Woche“ (grammatisch korrekt), Tag/Monat bleiben „aktivem“', () => {
    const c = document.createElement('div');
    document.body.appendChild(c);
    const yr = new Date().getFullYear();
    const mk = (unit, keys) => ({ range: 'year', timeline: { unit, buckets: keys.map((k, i) => ({ key: k, seconds: 3600 * (i + 1) })) } });
    L.renderTimeline(c, mk('week', [yr + '-01', yr + '-02']));
    const hit = [...c.querySelectorAll('.hit')].find((h) => h.getAttribute('aria-label').endsWith(': 2 Std'));
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const text = c.querySelector('.tl-detail').textContent;
    expect(text).toContain('pro aktiver Woche');
    expect(text).not.toContain('aktivem Woche');
  });
});
