// LenzFlix: Profil-Menü-Einträge und Benutzer-Chip (für Popover in den Designs plus/prime).
import { getUser, getUserId, buildUrl } from '../core/api.js';
import { getStatsUrl, statsHref } from '../core/stats.js';
import { openThemePicker } from '../core/themepicker.js';
import { getTheme } from '../core/theme.js';
import { DATASAVER_THEMES } from '../core/datasaver.js';
import { dataSaverItem } from './dsswitch.js';

/**
 * Abmelden. Bevorzugt Jellyfins eigenes Dashboard.logout(). Fehlt es (docs/dom-map.md dokumentiert keinen
 * Logout-Weg), landet der Nutzer auf '#/mypreferencesmenu', wo Jellyfin die native Abmelden-Schaltfläche anbietet
 * – bewusst kein ApiClient.logout() (würde Jellyfins Sitzungs-/Redirect-Logik umgehen).
 */
export function logout() {
  const d = window.Dashboard;
  if (d && typeof d.logout === 'function') {
    d.logout();
    return;
  }
  window.location.hash = '#/mypreferencesmenu';
}

/** Einträge für openPopover: Statistik (falls konfiguriert), Design, Datensparmodus (nur flix/plus/prime), Einstellungen, Dashboard (Admin), Abmelden. */
export async function profileEntries({ theme, returnFocus } = {}) {
  const entries = [];
  if (getStatsUrl()) {
    entries.push({ key: 'stats', label: 'Meine Statistik', href: statsHref(theme) || getStatsUrl(), className: 'is-stats' });
  }
  entries.push({ key: 'design', label: 'Design Einstellungen', badge: 'Beta', onClick: () => openThemePicker({ returnFocus }) });
  if (DATASAVER_THEMES.includes(theme || getTheme() || 'flix')) entries.push(dataSaverItem());
  entries.push({ key: 'settings', label: 'Einstellungen', href: '#/mypreferencesmenu' });
  let user = null;
  try { user = await getUser(); } catch { /* ohne Admin-Eintrag weiter */ }
  if (user && user.Policy && user.Policy.IsAdministrator) {
    entries.push({ key: 'dashboard', label: 'Dashboard', href: '#/dashboard' });
  }
  entries.push({ key: 'logout', label: 'Abmelden', onClick: () => logout() });
  return entries;
}

/**
 * Name und Profilbild-URL (ohne api_key) des angemeldeten Benutzers.
 * `retries`: Beim Seitenstart kennt Jellyfin den Benutzer evtl. noch nicht (getUser() → null).
 * Dann bis zu `retries`-mal im Abstand `delay` erneut fragen; `isAlive()` false bricht ab.
 */
export async function getUserChip({ retries = 0, delay = 500, isAlive = () => true } = {}) {
  let user;
  for (let i = 0; ; i++) {
    try { user = await getUser(); } catch { user = null; }
    if (user || i >= retries || !isAlive()) break;
    await new Promise((r) => setTimeout(r, delay));
    if (!isAlive()) break;
  }
  const name = (user && user.Name) || '';
  const tag = user && user.PrimaryImageTag;
  const id = (user && user.Id) || getUserId();
  const imageUrl = tag && id ? buildUrl(`/Users/${id}/Images/Primary`, { tag, maxWidth: 96 }) : null;
  return { name, imageUrl };
}
