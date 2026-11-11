// LenzFlix: TV-Symbol in der Kopfleiste (Feature "tvbtn", nur Design flix, Modern, Desktop + Handy).
// Eigener Link #lfx-tvm-btn außerhalb der React-Knoten; per CSS (js-ui/tvbtn.css) links neben die native Suche
// gesetzt. Klick: Intent-Event synchron in der Nutzergeste (TV-Hülle entsperrt das Video), dann normale Navigation.
import { mountPoint, unmountPoint } from '../core/dom.js';
import { isReady } from '../core/api.js';
import { isModern, isTv } from '../core/layout.js';
import { isTheme } from '../core/theme.js';
import { ICON_TVMODE } from '../core/icons.js';
import { tvModeHref, isTvModeRoute } from '../shared/routes.js';
import { EXCLUDED } from './nav.js';

const ID = 'lfx-tvm-btn';
let el = null;

const intent = () => window.dispatchEvent(new CustomEvent('lfx:tvmode-intent'));

function applyActive(route) {
  if (!el) return;
  const on = isTvModeRoute(route);
  el.classList.toggle('is-active', on);
  if (on) el.setAttribute('aria-current', 'page');
  else el.removeAttribute('aria-current');
}

export const tvbtnFeature = {
  name: 'tvbtn',
  match(route) {
    return isReady() && isModern() && !isTv() && isTheme('flix') && !EXCLUDED.test(route.path);
  },
  mount(route) {
    el = mountPoint(ID, { tag: 'a', className: 'lfx-tvbtn' });
    el.href = tvModeHref;
    el.setAttribute('aria-label', 'TV');
    el.title = 'TV';
    el.dataset.key = 'tv';
    el.innerHTML = ICON_TVMODE;
    el.addEventListener('click', intent);
    document.documentElement.classList.add('lfx-tvbtn-on');
    applyActive(route);
  },
  update(route) {
    applyActive(route);
  },
  unmount() {
    if (el) el.removeEventListener('click', intent);
    unmountPoint(ID);
    document.documentElement.classList.remove('lfx-tvbtn-on');
    el = null;
  },
};

export default tvbtnFeature;
