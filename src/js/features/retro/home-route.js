// LENZ//84: Routenlogik und Konstanten der Startseite und der Hubs Filme/Serien. Gehört Worker P1.

export const ROOT_ID = 'lfx-retro-home';
export const ON_CLASS = 'lfx-retro-home-on';

/** Startseite (#/home ohne lfx/tab) oder Hub (#/home?lfx=hub&lib=<id>). Liefert { key, kind, lib } oder null. */
export function retroHomeRoute(route) {
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
