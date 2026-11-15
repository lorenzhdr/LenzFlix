// LENZ//84: Röhren-Look des TV-Modus (Feature "retro-tvlook"). Setzt nur die <html>-Klasse lfx-retro-tvcrt (Scanlines + Vignette über dem
// TV-Bild, CSS in themes/retro/tvmode.css), solange die Retro-Vorliebe „crt“ an ist; folgt PREFS_EVENT. Alle Schleifen/Effekte gehören retro-fx (dort aus).
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { isTvModeRoute } from '../../shared/routes.js';
import { PREFS_EVENT, getPref } from './prefs.js';

export const TVCRT_CLASS = 'lfx-retro-tvcrt';

let onPrefs = null;

function sync() {
  document.documentElement.classList.toggle(TVCRT_CLASS, getPref('crt'));
}

function mount() {
  if (onPrefs) return;
  onPrefs = (e) => {
    const d = e && e.detail;
    if (!d || d.name === 'crt') sync();
  };
  document.addEventListener(PREFS_EVENT, onPrefs);
  sync();
}

function unmount() {
  if (onPrefs) document.removeEventListener(PREFS_EVENT, onPrefs);
  onPrefs = null;
  document.documentElement.classList.remove(TVCRT_CLASS);
}

export default {
  name: 'retro-tvlook',
  match: (route) => isTheme('retro') && isModern() && !isTv() && isTvModeRoute(route),
  mount,
  update() {},
  unmount,
};
