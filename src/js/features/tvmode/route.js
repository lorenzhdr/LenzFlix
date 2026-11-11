// TV-Modus (flix/plus/prime): Routen-Konstanten und Match. Vertrag: docs/tvmode.md „Hülle“.
import { isReady } from '../../core/api.js';
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { parseHash } from '../../core/router.js';
import { isTvModeRoute } from '../../shared/routes.js';

export const ROOT_ID = 'lfx-tvm';
export const ON_CLASS = 'lfx-tvm-on';
export const TV_THEMES = ['flix', 'plus', 'prime'];

export const findHomeTab = () => {
  const tab = document.querySelector('#indexPage:not(.hide) #homeTab');
  return tab && tab.isConnected ? tab : null;
};

export const tvModeMatch = (route) => isTvModeRoute(route) && TV_THEMES.some(isTheme) && isModern() && !isTv() && isReady();

/** Liegt die aktuelle Adresse noch auf #/home?lfx=tv? */
export const onTvRoute = () => isTvModeRoute(parseHash(window.location.hash));
