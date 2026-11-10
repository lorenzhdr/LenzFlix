// LenzFlix: Startseiten-Hülle (Feature "home").
// Hängt einen eigenen Container #lfx-home als erstes Kind in #homeTab (Legacy-Controller-DOM, kein React)
// mit zwei Slots: #lfx-billboard (Billboard) und #lfx-rows (Netflix-Zeilen). Die nativen Sektionen
// werden per CSS (html.lfx-home-on) ausgeblendet. Billboard/Zeilen liefern je render(slot, ctx) -> cleanup.
import { h } from '../core/dom.js';
import { isTv } from '../core/layout.js';
import { isTheme } from '../core/theme.js';
import * as billboard from './billboard.js';
import * as rows from './rows.js';

const HOME_ID = 'lfx-home';
let cleanups = [];
let waitTimer = null;

function isHomeRoute(route) {
  return route.path === '/home' && route.params.get('tab') !== '1' && !route.params.get('lfx');
}

function findHomeTab() {
  const tab = document.querySelector('#indexPage:not(.hide) #homeTab');
  return tab && tab.isConnected ? tab : null;
}

function teardown() {
  for (const fn of cleanups.splice(0)) {
    try { fn && fn(); } catch (e) { console.error('[LenzFlix] home cleanup', e); }
  }
  document.getElementById(HOME_ID)?.remove();
  document.documentElement.classList.remove('lfx-home-on');
}

function build(tab) {
  teardown();
  const billboardSlot = h('section', { id: 'lfx-billboard', class: 'lfx-billboard', 'aria-label': 'Empfehlung' });
  const rowsSlot = h('div', { id: 'lfx-rows', class: 'lfx-rows' });
  const root = h('div', { id: HOME_ID, class: 'lfx-home' }, [billboardSlot, rowsSlot]);
  tab.prepend(root);
  document.documentElement.classList.add('lfx-home-on');
  const ctx = { root };
  for (const [mod, slot] of [[billboard, billboardSlot], [rows, rowsSlot]]) {
    try {
      cleanups.push(mod.render(slot, ctx));
    } catch (e) {
      console.error('[LenzFlix] home render', e);
    }
  }
}

function ensure() {
  clearTimeout(waitTimer);
  const existing = document.getElementById(HOME_ID);
  const tab = findHomeTab();
  if (tab && existing && tab.contains(existing)) return;
  if (tab) { build(tab); return; }
  // #homeTab erscheint erst nach dem Legacy-Controller – kurz warten (max ~6 s)
  let tries = 0;
  const poll = () => {
    const t = findHomeTab();
    if (t) build(t);
    else if (++tries < 30) waitTimer = setTimeout(poll, 200);
  };
  waitTimer = setTimeout(poll, 200);
}

const homeFeature = {
  name: 'home',
  match: (route) => isHomeRoute(route) && !isTv() && isTheme('flix'),
  mount: () => ensure(),
  update: () => ensure(),
  unmount: () => { clearTimeout(waitTimer); teardown(); },
};

export default homeFeature;
