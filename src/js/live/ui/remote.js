// LENZ LIVE · anklickbare Fernbedienung. Alle Tasten sind <button type="button" aria-label>, data-key = normalisierter Tastenname.
import { h } from './tv.js';

const SVG_POWER = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 3v9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M6.6 6.8a8 8 0 1 0 10.8 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

// [data-key, Beschriftung, aria-label, Zusatzklasse]
const GROUPS = [
  ['power', [['power', null, 'Ein/Aus', 'is-power'], ['mute', 'Stumm', 'Stumm', 'is-small'], ['fullscreen', '⛶', 'Vollbild', 'is-small']]],
  ['digits', [
    ['1', '1', 'Ziffer 1'], ['2', '2', 'Ziffer 2'], ['3', '3', 'Ziffer 3'],
    ['4', '4', 'Ziffer 4'], ['5', '5', 'Ziffer 5'], ['6', '6', 'Ziffer 6'],
    ['7', '7', 'Ziffer 7'], ['8', '8', 'Ziffer 8'], ['9', '9', 'Ziffer 9'],
    ['txt', 'TXT', 'Videotext', 'is-small'], ['0', '0', 'Ziffer 0'], ['info', 'i', 'Info', 'is-small'],
  ]],
  ['rocker', [
    ['vol+', 'V+', 'Lauter', 'is-rock'], ['ch+', 'P+', 'Programm weiter', 'is-rock'],
    ['vol-', 'V−', 'Leiser', 'is-rock'], ['ch-', 'P−', 'Programm zurück', 'is-rock'],
  ]],
  ['nav', [
    ['epg', 'EPG', 'Programmführer', 'is-small'], ['up', '▲', 'Hoch', 'is-arrow'], ['menu', 'Menü', 'Menü', 'is-small'],
    ['left', '◀', 'Links', 'is-arrow'], ['ok', 'OK', 'OK', 'is-ok'], ['right', '▶', 'Rechts', 'is-arrow'],
    ['back', 'Zurück', 'Zurück', 'is-small'], ['down', '▼', 'Runter', 'is-arrow'], ['restart', 'Anfang', 'Von vorne ansehen', 'is-small'],
  ]],
  ['colors', [
    ['red', '', 'Rot', 'is-color is-red'], ['green', '', 'Grün', 'is-color is-green'],
    ['yellow', '', 'Gelb', 'is-color is-yellow'], ['blue', '', 'Blau', 'is-color is-blue'],
  ]],
  ['extras', [['audio', 'Ton', 'Tonspur wechseln', 'is-small'], ['subs', 'UT', 'Untertitel wechseln', 'is-small'], ['guide', 'Heft', 'Fernsehzeitung', 'is-small is-guide']]],
];

export const REMOTE_KEYS = GROUPS.reduce((acc, g) => acc.concat(g[1].map((b) => b[0])), []);

/**
 * @param {object} o { onKey(name), doc? }
 * @returns {{ el, setOn(bool), destroy() }}
 */
export function createRemote({ onKey, doc = document }) {
  const el = h(doc, 'div', 'lfx-live-remote');
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Fernbedienung');
  el.append(h(doc, 'span', 'lfx-live-remote__led'));
  for (const [gname, buttons] of GROUPS) {
    const g = h(doc, 'div', `lfx-live-remote__group lfx-live-remote__group--${gname}`);
    for (const [key, label, aria, extra] of buttons) {
      const b = h(doc, 'button', `lfx-live-remote__btn${extra ? ` ${extra}` : ''}`);
      b.type = 'button';
      b.dataset.key = key;
      b.setAttribute('aria-label', aria);
      if (key === 'power') b.innerHTML = SVG_POWER; else b.textContent = label;
      g.append(b);
    }
    el.append(g);
  }
  const click = (e) => {
    const b = e.target.closest && e.target.closest('button[data-key]');
    if (b && el.contains(b)) onKey(b.dataset.key);
  };
  // Kein Fokus auf Tasten bei Mausklick (Leertaste/Enter sollen nicht doppelt auslösen).
  const down = (e) => { if (e.target.closest && e.target.closest('button')) e.preventDefault(); };
  el.addEventListener('click', click);
  el.addEventListener('mousedown', down);
  return {
    el,
    setOn(on) { el.classList.toggle('is-on', !!on); },
    destroy() { el.removeEventListener('click', click); el.removeEventListener('mousedown', down); el.remove(); },
  };
}
