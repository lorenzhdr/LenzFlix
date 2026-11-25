// LenzFlix: Jellyfins Profil-Knopf in der Modern-Kopfleiste erkennen (nur lesen, nie mutieren).
// Live (Jellyfin 12.4): button[aria-controls="app-user-menu"] mit .MuiAvatar-root in eigener MuiBox.
// aria-haspopup tragen auch Sync-Play und Cast, aria-label ist lokalisiert – beides taugt nicht (docs/dom-map.md).
const HEADER_SEL = 'header.MuiAppBar-root';
export const PROFILE_MENU_ID = 'app-user-menu';

/** true, wenn `el` Jellyfins Profil-Knopf in der Kopfleiste ist (aria-controls, Rückfall: enthält den Avatar). */
export function isProfileButton(el) {
  if (!el || el.tagName !== 'BUTTON' || !el.closest || !el.closest(HEADER_SEL)) return false;
  return el.getAttribute('aria-controls') === PROFILE_MENU_ID || !!el.querySelector('.MuiAvatar-root');
}

/** Profil-Knopf, in dem das Ereignisziel `target` liegt, sonst null. */
export function profileButtonOf(target) {
  const el = target && target.closest ? target.closest('button') : null;
  return isProfileButton(el) ? el : null;
}

/** Profil-Knopf der Kopfleiste oder null (Jellyfin-Update, Seite ohne Kopfleiste). */
export function findProfileButton() {
  const header = document.querySelector(HEADER_SEL);
  if (!header) return null;
  const byId = header.querySelector(`button[aria-controls="${PROFILE_MENU_ID}"]`);
  if (byId) return byId;
  for (const b of header.querySelectorAll('button')) {
    if (b.querySelector('.MuiAvatar-root')) return b;
  }
  return null;
}
