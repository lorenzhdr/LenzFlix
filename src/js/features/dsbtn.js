// LenzFlix: Datensparmodus-Symbol in der Kopfleiste (Feature "dsbtn", nur Design flix, Modern, Desktop + Handy).
// Eigener Button #lfx-ds-btn außerhalb der React-Knoten, links neben dem TV-Symbol (js-ui/switch.css).
// Immer gemountet, sichtbar nur mit html.lfx-datasaver (reines CSS, kein Neuaufbau beim Umschalten).
import { mountPoint, unmountPoint } from '../core/dom.js';
import { isReady } from '../core/api.js';
import { isModern, isTv } from '../core/layout.js';
import { isTheme } from '../core/theme.js';
import { createDataSaverButton } from '../shared/dsbtn.js';
import { EXCLUDED } from './nav.js';

const ID = 'lfx-ds-btn';

export const dsbtnFeature = {
  name: 'dsbtn',
  match(route) {
    return isReady() && isModern() && !isTv() && isTheme('flix') && !EXCLUDED.test(route.path);
  },
  mount() {
    const el = mountPoint(ID, { tag: 'button' });
    el.type = 'button';
    createDataSaverButton({ el });
    document.documentElement.classList.add('lfx-dsbtn-on');
  },
  unmount() {
    unmountPoint(ID);
    document.documentElement.classList.remove('lfx-dsbtn-on');
  },
};

export default dsbtnFeature;
