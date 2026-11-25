// LenzFlix: Profil-Menü-Einträge und Benutzer-Chip (für Popover in den Designs plus/prime).
import { getUser, getUserId, getJson, buildUrl } from '../core/api.js';
import { cached } from '../core/cache.js';
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

const QC_KEY = 'qc:enabled';
const QC_OK_TTL = 10 * 60_000;
const QC_ERR_TTL = 30_000;

/** Ist Quick Connect am Server aktiv? Nur `true` zählt; Fehler → false (30 s gemerkt), Erfolg 10 min. */
export async function quickConnectEnabled() {
  const r = await cached(
    QC_KEY,
    async () => {
      try { return (await getJson('/QuickConnect/Enabled')) === true ? 1 : 0; } catch { return -1; }
    },
    (v) => (v < 0 ? QC_ERR_TTL : QC_OK_TTL),
  );
  return r === 1;
}

/**
 * Einträge für openPopover/Profilblatt in vier Gruppen (Trenner nur zwischen nicht-leeren Gruppen):
 * 1 Statistik, Design, Datensparmodus · 2 Profil, Einstellungen · 3 Admin: Übersicht, Metadaten-Manager · 4 Quick Connect, Abmelden.
 */
export async function profileEntries({ theme, returnFocus } = {}) {
  const [user, qc] = await Promise.all([
    getUser().catch(() => null), // ohne Admin-Gruppe weiter
    quickConnectEnabled().catch(() => false),
  ]);
  const g1 = [];
  if (getStatsUrl()) {
    g1.push({ key: 'stats', label: 'Meine Statistik', href: statsHref(theme) || getStatsUrl(), className: 'is-stats' });
  }
  g1.push({ key: 'design', label: 'Design-Einstellungen', onClick: () => openThemePicker({ returnFocus }) });
  if (DATASAVER_THEMES.includes(theme || getTheme() || 'flix')) g1.push(dataSaverItem());
  const g2 = [];
  const uid = (user && user.Id) || getUserId();
  if (uid) g2.push({ key: 'profile', label: 'Profil', href: `#/userprofile?userId=${encodeURIComponent(uid)}` });
  g2.push({ key: 'settings', label: 'Einstellungen', href: '#/mypreferencesmenu' });
  const g3 = [];
  if (user && user.Policy && user.Policy.IsAdministrator) {
    g3.push({ key: 'dashboard', label: 'Übersicht', href: '#/dashboard' });
    g3.push({ key: 'metadata', label: 'Metadaten-Manager', href: '#/metadata' });
  }
  const g4 = [];
  if (qc === true) g4.push({ key: 'quickconnect', label: 'Quick Connect', href: '#/quickconnect' });
  g4.push({ key: 'logout', label: 'Abmelden', onClick: () => logout() });
  const out = [];
  for (const g of [g1, g2, g3, g4]) {
    if (!g.length) continue;
    if (out.length) out.push({ key: 'sep', separator: true });
    out.push(...g);
  }
  return out;
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
