// TV-Modus · Tastatur (Vertrag: docs/tvmode.md). ↑/PageUp = Sender +1, ↓/PageDown = −1, Ziffern (createDigits), M = Stumm, F = Vollbild.
// Greift nur, wenn der Fokus im Root oder auf body liegt, nicht in Eingabefeldern und nicht, wenn blocked() gilt.
// Kein preventDefault für fremde Tasten; beim Zappen per Pfeil wird das Scrollen verhindert.
import { createDigits } from './digits.js';

const ZAP = { ArrowUp: 1, PageUp: 1, ArrowDown: -1, PageDown: -1 };
const FIELD = /^(INPUT|TEXTAREA|SELECT)$/;

/**
 * @param {{ doc?: Document, root: HTMLElement, ctl: object, fullscreen?: { toggle(): void }, blocked?: () => boolean,
 *   onPreview?: (text: string|null) => void, toast?: (text: string) => void, now?: () => number }} o
 * @returns {{ destroy(): void, digits: object }}
 */
export function createKeys({ doc = document, root, ctl, fullscreen = null, blocked = null, onPreview = null, toast = null, now = Date.now } = {}) {
  const digits = createDigits({
    now,
    onCommit: (no) => ctl.tune(no, { immediate: true }),
    onPreview: (t) => { if (onPreview) onPreview(t); },
    onInvalid: (t) => { if (toast) toast(t); },
  });

  const inScope = (target) => {
    if (!target || target === doc.body || target === doc.documentElement || target === doc) return true;
    return !!(root && root.contains(target));
  };
  const typing = (el) => !!el && (FIELD.test(el.tagName || '') || el.isContentEditable === true);

  function onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
    if (!root || !root.isConnected) return;
    if (!inScope(e.target) || typing(e.target) || typing(doc.activeElement)) return;
    if (typeof blocked === 'function' && blocked()) return;
    const st = ctl.state();
    const k = e.key;

    if (ZAP[k] !== undefined) {
      if (!st.on) return;
      e.preventDefault();
      ctl.zap(ZAP[k]);
      return;
    }
    if (/^[0-9]$/.test(k)) {
      if (!st.on || e.shiftKey) return;
      e.preventDefault();
      digits.push(k);
      return;
    }
    if (k === 'm' || k === 'M') {
      if (!st.on) return;
      e.preventDefault();
      ctl.toggleMute();
      return;
    }
    if (k === 'f' || k === 'F') {
      if (!st.on || !fullscreen) return;
      e.preventDefault();
      fullscreen.toggle();
    }
  }

  doc.addEventListener('keydown', onKey);
  return {
    digits,
    destroy() {
      doc.removeEventListener('keydown', onKey);
      digits.dispose();
    },
  };
}
