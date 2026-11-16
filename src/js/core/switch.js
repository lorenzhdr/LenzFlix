// LenzFlix: iOS-Schalter-Baustein für Menüzeilen (Popover, Sheets, Overlays). Kein Zustand, keine Abhängigkeit zu Datensparmodus.
// Markup: button[role=menuitemcheckbox|switch][aria-checked].is-on > Beschriftung + span.lfx-switch > span.lfx-switch__knob.
import { h } from './dom.js';

const switchVisual = () => h('span', { class: 'lfx-switch', 'aria-hidden': 'true' }, [h('span', { class: 'lfx-switch__knob' })]);

export function setSwitchState(btn, on) {
  btn.classList.toggle('is-on', Boolean(on));
  btn.setAttribute('aria-checked', String(Boolean(on)));
}

/**
 * Bindet einen Button als Schalter: Zustand aus item.checked, Klick schaltet um und ruft item.onToggle(next)
 * (schließt nie ein Menü). item.watch(cb) (optional) meldet Änderungen von außen: cb(on) → Rückgabe Abmelden;
 * abgemeldet wird beim Schließen des Menüs (releaseSwitches) bzw. spätestens bei der nächsten Meldung, wenn der Button nicht mehr im Dokument hängt.
 */
const bound = new Set(); // aktive watch-Anmeldungen: { btn, off }

/** Meldet alle watch-Anmeldungen der Schalter unterhalb von root ab (Menü/Sheet wird geschlossen oder neu gezeichnet). */
export function releaseSwitches(root) {
  if (!root) return;
  for (const e of [...bound]) if (root === e.btn || root.contains(e.btn)) e.off();
}

function bindSwitch(btn, item) {
  setSwitchState(btn, item.checked);
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    setSwitchState(btn, next);
    if (typeof item.onToggle === 'function') item.onToggle(next);
  });
  if (typeof item.watch === 'function') {
    const entry = { btn, off: () => {} };
    let released = false;
    const unwatch = item.watch((on) => {
      if (released) return;
      if (!btn.isConnected) entry.off();
      else setSwitchState(btn, on);
    });
    entry.off = () => {
      if (released) return;
      released = true;
      bound.delete(entry);
      if (typeof unwatch === 'function') unwatch();
    };
    bound.add(entry);
  }
  return btn;
}

/** Fertiger Schalter-Button (Beschriftung links, Schieber rechts). */
export function switchButton(item, { className, role = 'menuitemcheckbox', labelClass } = {}) {
  const btn = h('button', { type: 'button', class: className, role, 'aria-label': item.label, dataset: { key: item.key || '' } }, [
    labelClass ? h('span', { class: labelClass }, item.label) : item.label,
    switchVisual(),
  ]);
  return bindSwitch(btn, item);
}
