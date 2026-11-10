// LENZPRIME: Routenlogik und gemeinsame Konstanten der Startseite und der Hubs Filme/Serien.

export const ROOT_ID = 'lfx-prime-home';
export const ON_CLASS = 'lfx-prime-home-on';

/** Startseite (#/home ohne lfx/tab) oder Hub (#/home?lfx=hub&lib=<id>). Liefert { key, kind, lib } oder null. */
export function primeHomeRoute(route) {
  if (!route || route.path !== '/home' || !route.params) return null;
  const lfx = route.params.get('lfx');
  if (lfx === 'hub') {
    const lib = route.params.get('lib');
    return lib ? { key: `hub:${lib}`, kind: 'hub', lib } : null;
  }
  if (lfx || route.params.get('tab') === '1') return null;
  return { key: 'home', kind: 'home', lib: null };
}

export function findHomeTab() {
  const tab = document.querySelector('#indexPage:not(.hide) #homeTab');
  return tab && tab.isConnected ? tab : null;
}
