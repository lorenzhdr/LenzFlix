// VIDEOTHEK LENZ: Routenlogik und Konstanten der 3D-Startseite.
import { parseLfxRoute } from '../../shared/routes.js';

export const ROOT_ID = 'lfx-store-home';
export const ON_CLASS = 'lfx-store-home-on';
export const BAR_ID = 'lfx-store-bar';
export const BAR_CLASS = 'lfx-store-bar-on';

/**
 * 3D-Videothek zeigen für: #/home (ohne lfx/tab), lfx=new, lfx=title&id=…, lfx=search[&q=…].
 * Liefert { kind: 'home'|'title'|'search', id, q } oder null (z. B. lfx=classic, hub, browse, tab=1, andere Pfade).
 */
export function storeHomeRoute(route) {
  if (!route || route.path !== '/home' || !route.params) return null;
  const lfx = route.params.get('lfx');
  if (!lfx) return route.params.get('tab') === '1' ? null : { kind: 'home', id: null, q: null };
  const r = parseLfxRoute(route);
  if (r.kind === 'new') return { kind: 'home', id: null, q: null };
  if (r.kind === 'title' && r.id) return { kind: 'title', id: r.id, q: null };
  if (r.kind === 'search') return { kind: 'search', id: null, q: r.q || '' };
  return null;
}

export function findHomeTab() {
  const tab = document.querySelector('#indexPage:not(.hide) #homeTab');
  return tab && tab.isConnected ? tab : null;
}
