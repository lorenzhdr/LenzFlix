// LENZ LIVE: dauerhaft zurück ins vorherige Design und dann zum Titel (docs/live.md „leave.js“).
// Erst das Design wechseln und abwarten, dann navigieren – sonst leitet der Wächter (guard.js) auf #/home zurück.
import { getAuth } from '../../core/api.js';
import { getPreviousTheme, getTheme, onThemeChange, setTheme } from '../../core/theme.js';
import { titleHref } from '../../shared/routes.js';

export const THEME_WAIT_MS = 3000;

function waitForTheme(target, ms = THEME_WAIT_MS) {
  if (getTheme() === target) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    let off = () => {};
    let timer = null;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      off();
      resolve(ok);
    };
    off = onThemeChange(({ theme }) => { if (theme === target) finish(true); });
    timer = setTimeout(() => finish(getTheme() === target), ms);
  });
}

/** Zielhash je Zieldesign. Ohne itemId: Startseite. */
export function targetHash(theme, itemId, { seriesId } = {}) {
  if (!itemId) return '#/home';
  if (theme === 'flix') {
    const { serverId } = getAuth();
    return `#/details?id=${encodeURIComponent(itemId)}${serverId ? `&serverId=${encodeURIComponent(serverId)}` : ''}`;
  }
  if (theme === 'plus') return titleHref(itemId);
  return titleHref(seriesId || itemId); // prime, retro, store: Serie statt Folge
}

/** Rückgabe: true, wenn gewechselt und navigiert wurde. */
export async function leaveToLibrary(itemId, { seriesId } = {}) {
  const target = getPreviousTheme();
  try {
    await setTheme(target, { source: 'user' });
  } catch (e) {
    console.warn('[LenzFlix] live leave', e && e.message ? e.message : e);
    return false;
  }
  if (!(await waitForTheme(target))) return false; // Wechsel gescheitert: setTheme hat bereits gemeldet
  window.location.hash = targetHash(target, itemId || null, { seriesId });
  return true;
}
