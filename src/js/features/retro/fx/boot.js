// LENZ//84 retro-fx: Boot-Screen (einmal pro Sitzung). Bernstein-Text tippt, Speichertest zählt, dann Einschalt-Effekt
// (weißer Strich, Hälften fahren auseinander). Überspringbar per Taste/Klick/Tipp; harter Timeout entfernt das Overlay immer.
import { h } from '../../../core/dom.js';
import { createTimers } from './util.js';

export const BOOT_ID = 'lfx-retro-boot';
export const BOOT_FLAG = 'lfx.retro.booted';
export const BOOT_VERSION = 'v1.6';
const HARD_TIMEOUT_MS = 4500;
const REDUCED_MS = 800;

export function hasBooted() {
  try { return window.sessionStorage.getItem(BOOT_FLAG) === '1'; } catch { return false; }
}
export function markBooted() {
  try { window.sessionStorage.setItem(BOOT_FLAG, '1'); } catch { /* egal */ }
}
export function clearBooted() {
  try { window.sessionStorage.removeItem(BOOT_FLAG); } catch { /* egal */ }
}

/**
 * Startet den Boot-Screen. opts: { getName: () => Promise<string>, reduced, onSound(name), onDone() }.
 * Rückgabe: { cancel() } – entfernt das Overlay sofort (ruft onDone nicht auf).
 */
export function runBoot({ getName = async () => '', reduced = false, onSound = () => {}, onDone = () => {} } = {}) {
  const timers = createTimers();
  const text = h('div', { class: 'lfx-retro-boot__text' });
  const top = h('div', { class: 'lfx-retro-boot__half lfx-retro-boot__half--top' });
  const bot = h('div', { class: 'lfx-retro-boot__half lfx-retro-boot__half--bottom' });
  const line = h('div', { class: 'lfx-retro-boot__line' });
  const hint = h('div', { class: 'lfx-retro-boot__hint' }, 'TASTE / TIPPEN ZUM ÜBERSPRINGEN');
  const el = h('div', { id: BOOT_ID, class: `lfx-retro-boot${reduced ? ' is-reduced' : ''}`, role: 'presentation', 'aria-hidden': 'true' }, [top, bot, text, line, hint]);
  let done = false;
  let name = '';
  let nameKnown = false;
  getName().then((n) => { name = String(n || ''); nameKnown = true; }).catch(() => { nameKnown = true; });

  const skipEvents = ['keydown', 'pointerdown', 'touchstart'];

  function cleanup() {
    timers.clearAll();
    for (const ev of skipEvents) document.removeEventListener(ev, skip, true);
    el.remove();
  }
  function finish() {
    if (done) return;
    done = true;
    cleanup();
    try { onDone(); } catch { /* egal */ }
  }
  function skip(e) {
    if (e && e.type === 'keydown' && (e.ctrlKey || e.metaKey || e.altKey)) return;
    if (e && e.cancelable && e.type !== 'keydown') e.preventDefault();
    openUp(true);
  }

  function addLine() {
    const span = h('div', { class: 'lfx-retro-boot__row' });
    text.append(span);
    return span;
  }
  function typeLine(str, ms, then) {
    const span = addLine();
    const n = str.length;
    let i = 0;
    if (!n) { then(span); return; }
    const id = timers.interval(() => {
      i += 1;
      span.textContent = str.slice(0, i);
      if (i >= n) { timers.clear(id); then(span); }
    }, Math.max(8, Math.round(ms / n)));
  }
  function caret(on) {
    for (const c of text.querySelectorAll('.lfx-retro-boot__caret')) c.remove();
    if (on) text.append(h('span', { class: 'lfx-retro-boot__caret' }));
  }

  let opening = false;
  function openUp(fast) {
    if (opening || done) return;
    opening = true;
    timers.clearAll();
    caret(false);
    el.classList.add('is-open');
    timers.timeout(finish, fast ? 420 : 640);
    timers.timeout(finish, HARD_TIMEOUT_MS); // Sicherheitsnetz (finish ist idempotent)
  }

  document.body.append(el);
  for (const ev of skipEvents) document.addEventListener(ev, skip, { capture: true, passive: false });
  timers.timeout(finish, HARD_TIMEOUT_MS);
  try { onSound('boot'); } catch { /* egal */ }

  if (reduced) {
    for (const s of [`LENZ//84 BIOS ${BOOT_VERSION}`, 'SPEICHERTEST ... 640K OK', 'LADE MEDIATHEK ... OK', 'BEREIT.']) addLine().textContent = s;
    timers.timeout(() => { caret(false); el.classList.add('is-open'); }, REDUCED_MS - 300);
    timers.timeout(finish, REDUCED_MS);
    return { cancel() { done = true; cleanup(); } };
  }

  // Zeitplan (ms): BIOS 0-450, Speicher 500-1150, Mediathek 1200-1650, Benutzer 1700-2050, Bereit 2100, Öffnen 2400, Ende ~3050
  timers.timeout(() => {
    typeLine(`LENZ//84 BIOS ${BOOT_VERSION}`, 400, () => {});
  }, 0);
  timers.timeout(() => {
    const span = addLine();
    let kb = 0;
    const id = timers.interval(() => {
      kb = Math.min(640, kb + 32);
      span.textContent = `SPEICHERTEST ... ${kb}K${kb >= 640 ? ' OK' : ''}`;
      if (kb >= 640) timers.clear(id);
    }, 30);
  }, 500);
  timers.timeout(() => {
    typeLine('LADE MEDIATHEK ...', 380, (span) => { span.textContent += ' OK'; });
  }, 1200);
  timers.timeout(() => {
    const who = (nameKnown && name ? name : 'GAST').toUpperCase();
    typeLine(`BENUTZER: ${who}`, 300, () => {});
  }, 1700);
  timers.timeout(() => {
    typeLine('BEREIT.', 160, () => caret(true));
  }, 2100);
  timers.timeout(() => openUp(false), 2450);

  return { cancel() { done = true; cleanup(); } };
}
