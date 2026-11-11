// VIDEOTHEK LENZ · Pause-Menü (DOM im Host).
import { el } from './hud.js';

const QUALITY_LABEL = { auto: 'Auto', low: 'Niedrig', mid: 'Mittel', high: 'Hoch' };
const QUALITY_NEXT = { auto: 'low', low: 'mid', mid: 'high', high: 'auto' };

/**
 * @param {HTMLElement} host
 * @param {object} a { onResume, onSearch, onClassic, onQuality(q), onSound(on), onFps(on), onBigCovers(on), onTheme, onMenu(anchor), getQuality, getSound, getFps, getBigCovers }
 */
export function createPause(host, a) {
  const root = el('div', 'lfx-store-pause');
  root.hidden = true;
  const panel = el('div', 'lfx-store-pause-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Pause');
  const title = el('div', 'lfx-store-pause-title', 'Pause');
  panel.appendChild(title);
  const mk = (label, fn, cls = '') => {
    const b = el('button', `lfx-store-act ${cls}`.trim(), label);
    b.type = 'button';
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(b); });
    panel.appendChild(b);
    return b;
  };
  mk('Weiter', () => a.onResume(), 'lfx-store-act--primary');
  mk('Suche', () => a.onSearch());
  mk('Klassische Ansicht', () => a.onClassic());
  const q = mk('', () => {
    const next = QUALITY_NEXT[a.getQuality()] || 'auto';
    a.onQuality(next);
    refresh();
  });
  const s = mk('', () => { a.onSound(!a.getSound()); refresh(); });
  const f = mk('', () => { a.onFps(!a.getFps()); refresh(); });
  const bc = mk('', () => { a.onBigCovers(!a.getBigCovers()); refresh(); });
  mk('Design wechseln', () => a.onTheme());
  mk('Menü', (b) => a.onMenu(b));
  function refresh() {
    q.textContent = `Qualität: ${QUALITY_LABEL[a.getQuality()] || 'Auto'}`;
    s.textContent = `Ton: ${a.getSound() ? 'An' : 'Aus'}`;
    f.textContent = `FPS-Anzeige: ${a.getFps() ? 'An' : 'Aus'}`;
    bc.textContent = `Hüllen: ${a.getBigCovers() ? 'Groß' : 'Normal'}`;
  }
  root.appendChild(panel);
  root.addEventListener('click', (e) => { if (e.target === root) a.onResume(); });
  host.appendChild(root);
  refresh();
  let focusBack = null;
  return {
    root,
    get visible() { return !root.hidden; },
    show() {
      refresh();
      focusBack = document.activeElement;
      root.hidden = false;
      const first = panel.querySelector('button');
      if (first) { try { first.focus({ preventScroll: true }); } catch { /* egal */ } }
    },
    hide() {
      root.hidden = true;
      if (focusBack && typeof focusBack.focus === 'function') { try { focusBack.focus({ preventScroll: true }); } catch { /* egal */ } }
      focusBack = null;
    },
    refresh,
    destroy() { root.remove(); },
  };
}
