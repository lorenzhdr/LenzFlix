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
