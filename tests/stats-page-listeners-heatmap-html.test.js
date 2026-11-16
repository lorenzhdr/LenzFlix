// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve(import.meta.dirname, '../charts-worker/public/lenzflix-stats');
let L;

beforeAll(() => {
  window.__LFX_STATS_TEST__ = true;
  new Function(readFileSync(resolve(DIR, 'app.js'), 'utf8'))();
  L = window.LfxStats;
});

beforeEach(() => {
  document.body.innerHTML = '<div id="lfx-app"></div>';
  L.state.range = '30d';
});

afterEach(() => vi.restoreAllMocks());

const TL = { unit: 'day', buckets: [{ key: '2026-11-09', seconds: 3600 }, { key: '2026-11-10', seconds: 1800 }] };

describe('Klick-Listener des Verlaufs', () => {
  it('Ansichtswechsel entfernt den document-Listener, auch ohne Klick', () => {
    const added = [];
    const removed = [];
    const add = document.addEventListener.bind(document);
    const rem = document.removeEventListener.bind(document);
    vi.spyOn(document, 'addEventListener').mockImplementation((t, fn, o) => {
      if (t === 'click') added.push(fn);
      return add(t, fn, o);
    });
    vi.spyOn(document, 'removeEventListener').mockImplementation((t, fn, o) => {
      if (t === 'click') removed.push(fn);
      return rem(t, fn, o);
    });
    const box = document.createElement('div');
    document.getElementById('lfx-app').appendChild(box);
    L.renderTimeline(box, { timeline: TL });
    L.renderTimeline(box, { timeline: TL }); // zweiter Aufruf ersetzt den ersten Listener
    L.showLoading('Lade …', 1, 2); // setView
    expect(added.length).toBe(2);
    added.forEach((fn) => expect(removed).toContain(fn));
  });
  it('Dashboard: Balkenklick wählt aus, Klick daneben hebt die Auswahl auf', () => {
    const buckets = [];
    for (let i = 0; i < 10; i++) buckets.push({ key: '2026-11-' + String(i + 1).padStart(2, '0'), seconds: 600 * (i + 1) });
    L.drawDashboard({
      range: '30d',
      totals: { seconds: 33000, episodes: 3, movies: 1, series: 1, activeDays: 10 },
      timeline: { unit: 'day', buckets },
      heatmap: [],
    });
    const hits = document.querySelectorAll('.hit');
    expect(hits.length).toBeGreaterThan(3);
    hits[3].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.tl-detail .tl-t')).not.toBeNull();
    document.body.click();
    expect(document.querySelector('.tl-detail .tl-t')).toBeNull();
    expect(document.querySelector('.tl-detail').textContent).toContain('Tippe auf einen Balken');
  });
});

describe('Heatmap-Textalternative', () => {
  it('aria-label nennt die stärkste Zelle', () => {
    const box = document.createElement('div');
    L.renderHeatmap(box, { heatmap: [{ dow: 6, hour: 21, seconds: 7500 }, { dow: 1, hour: 8, seconds: 600 }] });
    const label = box.querySelector('svg').getAttribute('aria-label');
    expect(label).toContain('Samstag');
    expect(label).toContain('21 Uhr');
    expect(label).toContain('2 Std');
  });

  it('ohne Daten bleibt das allgemeine Label', () => {
    const box = document.createElement('div');
    L.renderHeatmap(box, { heatmap: [] });
    expect(box.querySelector('svg').getAttribute('aria-label')).toBe('Wann du schaust: Wochentage und Uhrzeiten');
  });
});

describe('index.html und CSS', () => {
  const html = readFileSync(resolve(DIR, 'index.html'), 'utf8');
  const css = readFileSync(resolve(DIR, 'app.css'), 'utf8');

  it('main trägt kein aria-live (Ansagen laufen über role=status)', () => {
    expect(html).not.toMatch(/<main[^>]*aria-live/);
    expect(html).toContain('role="status"');
  });

  it('das Logo lädt erst per JS passend zum Design (kein statisches lenzflix.svg)', () => {
    expect(html).not.toMatch(/src="lenzflix\.svg"/);
  });

  it('vor der Designwahl (body ohne Klasse) wird keine Webschrift referenziert', () => {
    const m = /body:not\(\[class\]\)\s*\{([^}]*)\}/.exec(css);
    expect(m).not.toBeNull();
    expect(m[1]).toMatch(/--lfx-font:/);
    expect(m[1]).not.toMatch(/LenzFlix Sans/);
  });
});
