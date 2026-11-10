// LenzFlix: Link zur eigenständigen Statistik-Seite (siehe docs/stats-api.md).
// Nur sichtbar, wenn konfiguriert; das öffentliche Theme bleibt sonst neutral.

/** Erlaubt: https-URL oder same-origin-Pfad mit genau einem führenden "/". */
function clean(raw) {
  const s = String(raw == null ? '' : raw).trim().replace(/^["'\s]+|["'\s]+$/g, '');
  if (!s || /[\s"'\\<>]/.test(s)) return null;
  if (/^https:\/\/[^/]/i.test(s)) return s;
  if (/^\/(?![/\\])/.test(s)) return s;
  return null;
}

/** Stats-URL: window.LenzFlixConfig.statsUrl -> CSS-Var --lfx-stats-url -> null. */
export function getStatsUrl() {
  const fromConfig = clean(window.LenzFlixConfig && window.LenzFlixConfig.statsUrl);
  if (fromConfig) return fromConfig;
  try {
    return clean(getComputedStyle(document.documentElement).getPropertyValue('--lfx-stats-url'));
  } catch {
    return null;
  }
}

export const STATS_LABEL = 'Meine Statistik';

/** Ziel-Vergleich ohne Hash/Query: zeigt href auf die konfigurierte Statistik-Seite? */
export function isStatsHref(href) {
  const stats = getStatsUrl();
  if (!stats || !href) return false;
  try {
    const a = new URL(href, window.location.href);
    const b = new URL(stats, window.location.href);
    return a.origin === b.origin && a.pathname.replace(/\/+$/, '') === b.pathname.replace(/\/+$/, '');
  } catch {
    return false;
  }
}
