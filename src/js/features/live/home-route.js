// LENZ LIVE: Routenlogik und Konstanten der Startseite.
export const ROOT_ID = 'lfx-live-home';
export const ON_CLASS = 'lfx-live-home-on';

/** Fernseher zeigen für #/home ohne lfx-Parameter und ohne tab=1 (native Startseiten-Tabs). */
export function liveHomeRoute(route) {
  if (!route || route.path !== '/home' || !route.params) return false;
  if (route.params.get('lfx')) return false;
  return route.params.get('tab') !== '1';
}

export function findHomeTab() {
  const tab = document.querySelector('#indexPage:not(.hide) #homeTab');
  return tab && tab.isConnected ? tab : null;
}
