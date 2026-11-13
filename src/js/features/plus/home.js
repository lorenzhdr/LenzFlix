// LENZ+: Startseite "Für dich" und Bibliotheks-Hubs (Hero-Karussell, Sammlungs-Kacheln, Zeilen).
// Eigener Container #lfx-plus-home als erstes Kind von #homeTab; native Sektionen werden per html.lfx-plus-home-on versteckt.
import { h } from '../../core/dom.js';
import { isTv, isModern } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import * as api from '../../core/api.js';
import { getLibraries } from '../../shared/libraries.js';
import { buildHubRowDefs, getHubHeroPool } from '../../shared/hub.js';
import { getNewContentInfo } from '../../shared/newcontent.js';
import { buildRowDefs, peekRowDefs } from '../rows/sources.js';
import { createHero, loadHomeHeroPool } from './hero.js';
import { renderBrands } from './brands.js';
import { renderRows } from './rows.js';
import { isPhone } from './mobile.js';

const ROOT_ID = 'lfx-plus-home';
const ON_CLASS = 'lfx-plus-home-on';

let cleanups = [];
let waitTimer = null;
let token = 0;
let currentKey = null;
let currentPhone = false; // Hero-Variante beim Aufbau (Handy-Karussell vs. Desktop)

/** 'home' | 'hub:<id>' | null (nicht zuständig). */
export function routeKey(route) {
  if (!route || route.path !== '/home') return null;
  const lfx = route.params.get('lfx');
  if (lfx === 'hub') {
    const lib = route.params.get('lib');
    return lib ? `hub:${lib}` : null;
  }
  if (lfx || route.params.get('tab') === '1') return null;
  return 'home';
}

function findHomeTab() {
  const tab = document.querySelector('#indexPage:not(.hide) #homeTab');
  return tab && tab.isConnected ? tab : null;
}

function teardown() {
  token++;
  for (const fn of cleanups.splice(0)) {
    try { fn && fn(); } catch (e) { console.error('[LenzFlix] plus-home cleanup', e); }
  }
  document.getElementById(ROOT_ID)?.remove();
  document.documentElement.classList.remove(ON_CLASS);
  currentKey = null;
  currentPhone = false;
}

async function build(tab, key) {
  teardown();
  const my = token;
  const isHub = key.startsWith('hub:');
  const heroSlot = h('div', { class: 'lfx-plus-home__hero is-loading' });
  const rowsSlot = h('div', { class: 'lfx-plus-rows' });
  const root = h('div', { id: ROOT_ID, class: `lfx-plus-home${isHub ? ' lfx-plus-home--hub' : ''}` }, [heroSlot, rowsSlot]);
  tab.prepend(root);
  document.documentElement.classList.add(ON_CLASS);
  currentKey = key;
  currentPhone = isPhone();
  const alive = () => my === token;

  let lib = null;
  if (isHub) {
    try {
      const libs = await getLibraries();
      lib = libs.find((l) => l.id === key.slice(4)) || null;
    } catch { lib = null; }
    if (!alive()) return;
  }

  // Hero
  (async () => {
    try {
      const [pool, info] = await Promise.all([
        isHub ? (lib ? getHubHeroPool(lib) : []) : loadHomeHeroPool(),
        getNewContentInfo(),
      ]);
      if (!alive() || !pool.length) return;
      const hero = createHero(pool, { info });
      if (!hero) return;
      heroSlot.classList.remove('is-loading');
      heroSlot.append(hero.el);
      cleanups.push(() => hero.destroy());
    } catch (e) {
      console.warn('[LenzFlix] Hero nicht geladen', e && e.message);
    } finally {
      heroSlot.classList.remove('is-loading');
    }
  })();

  // Sammlungen (nur Startseite)
  if (!isHub) cleanups.push(renderBrands(root, rowsSlot));

  // Zeilen
  cleanups.push(renderRows(rowsSlot, () => (isHub ? (lib ? buildHubRowDefs(lib) : []) : buildRowDefs()), isHub ? null : () => peekRowDefs(), { prefetch: !isHub, hero: () => heroSlot }));
}

function ensure(route) {
  clearTimeout(waitTimer);
  const key = routeKey(route);
  if (!key) return;
  const existing = document.getElementById(ROOT_ID);
  const tab = findHomeTab();
  if (tab && existing && tab.contains(existing) && currentKey === key && currentPhone === isPhone()) return;
  let tries = 0;
  const poll = () => {
    const t = findHomeTab();
    if (t) build(t, key);
    else if (++tries < 30) waitTimer = setTimeout(poll, 200);
  };
  if (tab) build(tab, key);
  else waitTimer = setTimeout(poll, 200);
}

export default {
  name: 'plus-home',
  match: (route) => isTheme('plus') && isModern() && !isTv() && api.isReady() && routeKey(route) !== null,
  mount: (route) => ensure(route),
  update: (route) => ensure(route),
  unmount: () => { clearTimeout(waitTimer); teardown(); },
};
