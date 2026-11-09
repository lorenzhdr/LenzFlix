// LenzFlix: Das JS ist nur sinnvoll, solange das LenzFlix-CSS aktiv ist. tokens.css setzt dafür
// `--lfx-css: 1` auf :root. Deaktiviert ein Nutzer das Custom-CSS (Einstellungen → Anzeige), fehlt der Marker.
export function cssActive() {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue('--lfx-css').trim() === '1';
  } catch {
    return false;
  }
}
