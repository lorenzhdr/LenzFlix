// LENZ//84: Tipp-Effekt für die Beschreibung. Der volle Text bleibt für Screenreader und Layout erhalten
// (unsichtbarer Rest reserviert die Höhe), sichtbar tippt sich nur ein Teil ein. Gehört Worker P2.
import { h } from '../../core/dom.js';
import { emitFx } from './prefs.js';
import { reducedMotion, throttle } from './title-mount.js';

const TICK_MS = 28;
const MAX_TICKS = 34; // ≈ 0,95 s Gesamtdauer, egal wie lang der Text ist

/** Absatz mit Tipp-Effekt. Rückgabe: { el, start(), finish(), stop() }. */
export function createTyped(text, className = '') {
  const full = String(text || '');
  const sr = h('span', { class: 'lfx-rt__sr' }, full);
  const typed = h('span', { class: 'lfx-rt__typed', 'aria-hidden': 'true' });
  const rest = h('span', { class: 'lfx-rt__rest', 'aria-hidden': 'true' }, full);
  const el = h('p', { class: `${className} lfx-retro-caret`.trim() }, [sr, typed, rest]);
  let timer = null;
  let pos = 0;
  const tick = throttle(() => emitFx('type'), 110);

  const paint = () => {
    typed.textContent = full.slice(0, pos);
    rest.textContent = full.slice(pos);
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const finish = () => {
    stop();
    pos = full.length;
    paint();
    el.classList.remove('lfx-retro-caret');
  };
  const start = () => {
    stop();
    if (reducedMotion() || full.length < 2) {
      finish();
      return;
    }
    const step = Math.max(1, Math.ceil(full.length / MAX_TICKS));
    pos = 0;
    paint();
    timer = setInterval(() => {
      pos = Math.min(full.length, pos + step);
      paint();
      tick();
      if (pos >= full.length) finish();
    }, TICK_MS);
  };
  return { el, start, finish, stop };
}
