// LENZ+: Leerzustand für "Meine Liste" (#/home?tab=1, nativer Favoriten-Tab). Jellyfin zeigt bei 0 Favoriten gar nichts;
// hier erscheint ein Hinweis als eigenes Element (#lfx-plus-favempty) vor den nativen Sektionen, nur solange keine Karte vorhanden ist.
import { h } from '../../core/dom.js';
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { isReady } from '../../core/api.js';

const ID = 'lfx-plus-favempty';
export const EMPTY_TEXT = 'Noch nichts auf deiner Liste. Füge Titel über + hinzu.';
const SETTLE_MS = 1500;

const state = { tab: null, obs: null, timer: 0, poll: 0, tries: 0 };

export const isFavRoute = (route) => route && route.path === '/home' && route.params.get('tab') === '1' && !route.params.get('lfx');

function findTab() {
  const tab = document.querySelector('#indexPage:not(.hide) #favoritesTab');
  return tab && tab.isConnected ? tab : null;
}

const hasCards = (tab) => !!tab.querySelector('.card, .listItem');

function check() {
  state.timer = 0;
  const tab = state.tab;
  if (!tab || !tab.isConnected) return;
  const mine = document.getElementById(ID);
  if (hasCards(tab)) {
    if (mine) mine.remove();
  } else if (!mine) {
    tab.prepend(h('p', { id: ID, class: 'lfx-plus-favempty' }, EMPTY_TEXT));
  }
}

function schedule(delay = SETTLE_MS) {
  clearTimeout(state.timer);
  state.timer = setTimeout(check, delay);
}

function teardown() {
  if (state.obs) state.obs.disconnect();
  state.obs = null;
  clearTimeout(state.timer);
  clearTimeout(state.poll);
  state.timer = 0;
  state.poll = 0;
  state.tab = null;
  document.getElementById(ID)?.remove();
}

function attach() {
  const tab = findTab();
  if (!tab) {
    if (++state.tries < 30) state.poll = setTimeout(attach, 200);
    return;
  }
  if (state.tab === tab) return;
  teardown();
  state.tab = tab;
  state.obs = new MutationObserver((records) => {
    // Eigene Einfügung/Entfernung ignorieren
    if (records.every((r) => [...r.addedNodes, ...r.removedNodes].every((n) => n.id === ID))) return;
    schedule();
  });
  state.obs.observe(tab, { childList: true, subtree: true });
  schedule();
}

export default {
  name: 'plus-favempty',
  match: (route) => isTheme('plus') && isModern() && !isTv() && isReady() && isFavRoute(route),
  mount() {
    state.tries = 0;
    attach();
  },
  update() {
    state.tries = 0;
    attach();
  },
  unmount: teardown,
};
