// LENZ//84 retro-fx: geheimes Terminal #lfx-retro-terminal (Desktop: fährt von oben herunter, Handy: Vollbild-Sheet).
// Ausgabe nur per textContent. Fokus-Falle, Fokus zurück, Verlauf mit Pfeiltasten (nur im Eingabefeld), Tab-Vervollständigung.
import { h } from '../../../core/dom.js';
import { emitFx } from '../prefs.js';
import { execute, complete, parseCommand } from './terminal-commands.js';
import { createTimers } from './util.js';

export const TERMINAL_ID = 'lfx-retro-terminal';
const PROMPT = 'LENZ84:\\>';
const MAX_LINES = 400;
const MAX_HISTORY = 50;

/**
 * deps: Basis-ctx für terminal-commands (ohne print/error/clear/close/go/sleep – die liefert das Terminal selbst).
 * Rückgabe: { open(), close(), toggle(), isOpen(), destroy(), run(line) }.
 */
export function createTerminal(deps) {
  const timers = createTimers();
  let root = null;
  let out = null;
  let input = null;
  let closeBtn = null;
  let opener = null;
  let alive = false; // Terminal offen? (sleep() bricht ab, sobald es schließt)
  let busy = false;
  const sleepers = new Set();
  const history = [];
  let hIndex = 0;
  let draft = '';

  function print(text, cls) {
    if (!out) return () => {};
    const row = h('div', { class: `lfx-retro-term__row${cls ? ` is-${cls}` : ''}` });
    row.textContent = String(text);
    out.append(row);
    while (out.childElementCount > MAX_LINES) out.firstElementChild.remove();
    out.scrollTop = out.scrollHeight;
    return (t) => { row.textContent = String(t); };
  }

  const ctx = {
    ...deps,
    print,
    error(text) { print(text, 'err'); emitFx('error'); },
    clear() { if (out) out.replaceChildren(); },
    close() { close(); },
    go(href) {
      timers.timeout(() => {
        close();
        try { window.location.hash = href; } catch { /* egal */ }
      }, 700);
    },
    sleep(ms) {
      return new Promise((resolve) => {
        sleepers.add(resolve);
        timers.timeout(() => { sleepers.delete(resolve); resolve(alive); }, ms);
      });
    },
  };

  async function run(line) {
    const raw = String(line || '').trim();
    if (!raw) return;
    print(`${PROMPT} ${raw}`, 'cmd');
    if (history[history.length - 1] !== raw) history.push(raw);
    if (history.length > MAX_HISTORY) history.shift();
    hIndex = history.length;
    draft = '';
    busy = true;
    try {
      await execute(raw, ctx);
    } catch {
      print('INTERNER FEHLER. SYSTEM LÄUFT WEITER.', 'err');
    } finally {
      busy = false;
      if (input && alive) input.focus({ preventScroll: true });
    }
  }

  function onKey(e) {
    e.stopPropagation(); // Seiten-Hotkeys nicht mitlauschen lassen
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {
      if (e.target === input && input.value.trim() && !/\s/.test(input.value.trim())) {
        e.preventDefault();
        const matches = complete(input.value.trim());
        if (matches.length === 1) input.value = `${matches[0]} `;
        else if (matches.length > 1) {
          let prefix = matches[0];
          for (const m of matches) while (!m.startsWith(prefix)) prefix = prefix.slice(0, -1);
          if (prefix.length > input.value.trim().length) input.value = prefix;
          else print(matches.join('  '));
        }
        return;
      }
      // Fokus-Falle: zwischen Eingabe und Schließen-Knopf kreisen
      const items = [input, closeBtn].filter(Boolean);
      const idx = items.indexOf(document.activeElement);
      const next = e.shiftKey ? (idx <= 0 ? items.length - 1 : idx - 1) : (idx + 1) % items.length;
      e.preventDefault();
      items[next].focus();
      return;
    }
    if (e.target !== input) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (hIndex === history.length) draft = input.value;
      if (hIndex > 0) hIndex -= 1;
      input.value = history[hIndex] || '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (hIndex < history.length) hIndex += 1;
      input.value = hIndex >= history.length ? draft : history[hIndex];
    } else if ((e.key === 'l' || e.key === 'L') && e.ctrlKey) {
      e.preventDefault();
      ctx.clear();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      emitFx('type');
    }
  }

  function build() {
    input = h('input', {
      class: 'lfx-retro-term__input', type: 'text', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off',
      spellcheck: 'false', enterkeyhint: 'go', 'aria-label': 'Befehl eingeben', maxlength: '200',
    });
    closeBtn = h('button', { type: 'button', class: 'lfx-retro-term__close', 'aria-label': 'Terminal schließen' }, 'X');
    closeBtn.addEventListener('click', () => close());
    out = h('div', { class: 'lfx-retro-term__out', role: 'log', 'aria-live': 'polite' });
    const form = h('form', { class: 'lfx-retro-term__form', autocomplete: 'off' }, [
      h('label', { class: 'lfx-retro-term__prompt', for: 'lfx-retro-term-input' }, PROMPT),
      input,
    ]);
    input.id = 'lfx-retro-term-input';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (busy) return;
      const v = input.value;
      input.value = '';
      run(v);
    });
    root = h('div', {
      id: TERMINAL_ID, class: 'lfx-retro-term', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'LENZ//84 Terminal',
    }, [
      h('div', { class: 'lfx-retro-term__bar' }, [h('span', { class: 'lfx-retro-term__title' }, 'LENZ//84 TERMINAL  [ESC = ENDE]'), closeBtn]),
      out,
      form,
    ]);
    root.addEventListener('keydown', onKey);
    root.addEventListener('pointerdown', (e) => {
      // Tippen in die Ausgabe holt den Fokus ins Eingabefeld (Auswahl von Text bleibt möglich)
      if (e.target === out && input) timers.timeout(() => { if (alive && !String(window.getSelection && window.getSelection()).length) input.focus({ preventScroll: true }); }, 0);
    });
  }

  function open() {
    if (alive) { if (input) input.focus(); return; }
    opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    busy = false;
    build();
    document.body.append(root);
    document.documentElement.classList.add('lfx-retro-term-open');
    alive = true;
    print('LENZ//84 TERMINAL — TIPPE \'HILFE\' FÜR BEFEHLE.');
    emitFx('open');
    timers.timeout(() => { if (root) root.classList.add('is-open'); input.focus({ preventScroll: true }); }, 20);
  }

  function releaseSleepers() {
    for (const r of [...sleepers]) r(false); // laufende sleep()-Aufrufe lösen mit false auf
    sleepers.clear();
  }

  function teardown() {
    timers.clearAll();
    releaseSleepers();
    alive = false;
    busy = false;
    if (root) root.remove();
    root = out = input = closeBtn = null;
    document.documentElement.classList.remove('lfx-retro-term-open');
  }

  function close() {
    if (!alive) return;
    const el = root;
    const back = opener;
    opener = null;
    emitFx('close');
    alive = false;
    releaseSleepers();
    if (el) el.classList.remove('is-open');
    document.documentElement.classList.remove('lfx-retro-term-open');
    timers.clearAll();
    timers.timeout(() => { if (root === el) teardown(); }, 260);
    if (back && back.isConnected && typeof back.focus === 'function') {
      try { back.focus({ preventScroll: true }); } catch { /* egal */ }
    }
  }

  return {
    open,
    close,
    toggle() { if (alive) close(); else open(); },
    isOpen: () => alive,
    run,
    destroy() { alive = false; opener = null; teardown(); },
  };
}

export { parseCommand };
