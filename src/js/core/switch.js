// LenzFlix: iOS-Schalter-Baustein für Menüzeilen (Popover, Sheets, Overlays). Kein Zustand, keine Abhängigkeit zu Datensparmodus.
// Markup: button[role=menuitemcheckbox|switch][aria-checked].is-on > Beschriftung + span.lfx-switch > span.lfx-switch__knob.
import { h } from './dom.js';

export const switchVisual = () => h('span', { class: 'lfx-switch', 'aria-hidden': 'true' }, [h('span', { class: 'lfx-switch__knob' })]);

export function setSwitchState(btn, on) {
  btn.classList.toggle('is-on', Boolean(on));
  btn.setAttribute('aria-checked', String(Boolean(on)));
}

/**
 * Bindet einen Button als Schalter: Zustand aus item.checked, Klick schaltet um und ruft item.onToggle(next)
 * (schließt nie ein Menü). item.watch(cb) (optional) meldet Änderungen von außen: cb(on) → Rückgabe Abmelden;
 * die Meldung meldet sich selbst ab, sobald der Button nicht mehr im Dokument hängt.
 */
export function bindSwitch(btn, item) {
  setSwitchState(btn, item.checked);
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    setSwitchState(btn, next);
    if (typeof item.onToggle === 'function') item.onToggle(next);
  });
  if (typeof item.watch === 'function') {
    const off = item.watch((on) => {
      if (!btn.isConnected) off();
      else setSwitchState(btn, on);
    });
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
