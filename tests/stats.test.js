// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { getStatsUrl } from '../src/js/core/stats.js';

const setVar = (v) => document.documentElement.style.setProperty('--lfx-stats-url', v);

describe('getStatsUrl', () => {
  afterEach(() => {
    delete window.LenzFlixConfig;
    document.documentElement.style.removeProperty('--lfx-stats-url');
  });

  it('ohne Konfiguration: null', () => {
    expect(getStatsUrl()).toBeNull();
  });
  it('LenzFlixConfig.statsUrl (Pfad und https)', () => {
    window.LenzFlixConfig = { statsUrl: '/lenzflix-stats/' };
    expect(getStatsUrl()).toBe('/lenzflix-stats/');
    window.LenzFlixConfig = { statsUrl: 'https://stats.example.com/x/' };
    expect(getStatsUrl()).toBe('https://stats.example.com/x/');
  });
  it('CSS-Variable, Anführungszeichen werden entfernt', () => {
    setVar('"/lenzflix-stats/"');
    expect(getStatsUrl()).toBe('/lenzflix-stats/');
  });
  it('Config hat Vorrang vor der CSS-Variable', () => {
    setVar('"/aus-css/"');
    window.LenzFlixConfig = { statsUrl: '/aus-config/' };
    expect(getStatsUrl()).toBe('/aus-config/');
  });
  it.each(['javascript:alert(1)', '//evil.com', '//evil.com/x', 'http://example.com/', 'data:text/html,x', '/\\evil.com', 'lenzflix-stats', '', '   ', 'https://'])(
    'ungültig: %s -> null',
    (v) => {
      window.LenzFlixConfig = { statsUrl: v };
      expect(getStatsUrl()).toBeNull();
      delete window.LenzFlixConfig;
      setVar(JSON.stringify(v));
      expect(getStatsUrl()).toBeNull();
    },
  );
  it('Nicht-String in Config: null', () => {
    window.LenzFlixConfig = { statsUrl: 42 };
    expect(getStatsUrl()).toBeNull();
  });
});
