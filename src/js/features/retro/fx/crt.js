// LENZ//84 retro-fx: CRT-Overlay #lfx-retro-crt (Scanlines, Vignette, Subpixel-Raster, Rollbalken, Glitch-Streifen).
// Reines DOM; alle Animationen laufen per CSS (opacity/transform) in fx.css. pointer-events:none.
import { h } from '../../../core/dom.js';
import { NO_CRT_CLASS } from '../prefs.js';

export const CRT_ID = 'lfx-retro-crt';

export function createCrt() {
  let el = null;
  let stripTimer = 0;
  let shakeTimer = 0;

  function mount() {
    if (el && el.isConnected) return el;
    el = h('div', { id: CRT_ID, class: 'lfx-retro-crt', 'aria-hidden': 'true' }, [
      h('div', { class: 'lfx-retro-crt__flicker' }),
      h('div', { class: 'lfx-retro-crt__scan' }),
      h('div', { class: 'lfx-retro-crt__mask' }),
      h('div', { class: 'lfx-retro-crt__vignette' }),
      h('div', { class: 'lfx-retro-crt__roll' }),
      h('div', { class: 'lfx-retro-crt__strip' }),
    ]);
    document.body.append(el);
    return el;
  }

  function unmount() {
    clearTimeout(stripTimer);
    clearTimeout(shakeTimer);
    stripTimer = shakeTimer = 0;
    if (el) el.remove();
    el = null;
  }

  /** Overlay gemäß Vorliebe an-/ausschalten (Klasse am html + DOM). */
  function sync(on) {
    document.documentElement.classList.toggle(NO_CRT_CLASS, !on);
    if (on) mount();
    else unmount();
  }

  /** Kurzer Bildversatz-Streifen (Glitch). */
  function glitchStrip(ms = 180) {
    if (!el) return;
    const strip = el.querySelector('.lfx-retro-crt__strip');
    if (!strip) return;
    strip.style.top = `${Math.round(8 + Math.random() * 80)}%`;
    strip.style.height = `${Math.round(2 + Math.random() * 7)}%`;
    el.classList.add('is-strip');
    clearTimeout(stripTimer);
    stripTimer = setTimeout(() => { if (el) el.classList.remove('is-strip'); }, ms);
  }

  /** Bildschirm-Wackler (Overdrive). */
  function shake(ms = 700) {
    if (!el) return;
    el.classList.add('is-shaking');
    clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => { if (el) el.classList.remove('is-shaking'); }, ms);
  }

  return { mount, unmount, sync, glitchStrip, shake, get el() { return el; } };
}
