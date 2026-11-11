// VIDEOTHEK LENZ · Pause-Menü (DOM im Host).
import { el } from './hud.js';

const QUALITY_LABEL = { auto: 'Auto', low: 'Niedrig', mid: 'Mittel', high: 'Hoch' };
const QUALITY_NEXT = { auto: 'low', low: 'mid', mid: 'high', high: 'auto' };

/** Diagnosezeile zur Kassierer-Stimme (nur Zustand, nie Gesprochenes). */
export function voiceNote(info) {
  if (!info || !info.diag) return '';
  const d = String(info.diag);
  const name = info.voiceName || '';
  if (d === 'ok') return `Stimme: ${name} (${info.lang || ''})`;
  if (d === 'locked') return 'Stimme: wartet auf ersten Tipp';
  if (d === 'notStarted') return `Stimme: ${name} – Gerät hat nicht gesprochen (Stummschalter?)`;
  if (d === 'noLocalDe') return 'Stimme: keine deutsche Gerätestimme – Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen → Deutsch';
  if (d === 'novoices') return 'Stimme: keine Stimmen gefunden';
  if (d === 'unsupported') return 'Stimme: vom Browser nicht unterstützt';
  if (d.startsWith('error:')) return `Stimme: Fehler (${d.slice(6)})`;
  return '';
}

/**
 * @param {HTMLElement} host
 * @param {object} a { onResume, onSearch, onClassic, onQuality(q), onSound(on), onFps(on), onBigCovers(on), onTheme, onMenu(anchor), getQuality, getSound, getFps, getBigCovers,
 *   getVoiceInfo?() → { diag, voiceName, lang, onlineDe } | null (Diagnosezeile unter „Ton“, nur bei Ton an),
 *   onFullscreen?(), getFullscreen?() → bool, fullscreenKind?() → 'api' | 'guide' | 'none' (nur Touch; fehlt/none = Knopf ausgeblendet) }
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
  const note = el('div', 'lfx-store-pause-note');
  note.hidden = true;
  panel.appendChild(note);
  const f = mk('', () => { a.onFps(!a.getFps()); refresh(); });
  const bc = mk('', () => { a.onBigCovers(!a.getBigCovers()); refresh(); });
  const fs = mk('', () => { if (a.onFullscreen) a.onFullscreen(); refresh(); }, 'lfx-store-act--fs');
  mk('Design wechseln', () => a.onTheme());
  mk('Menü', (b) => a.onMenu(b));
  function refresh() {
    q.textContent = `Qualität: ${QUALITY_LABEL[a.getQuality()] || 'Auto'}`;
    s.textContent = `Ton: ${a.getSound() ? 'An' : 'Aus'}`;
    f.textContent = `FPS-Anzeige: ${a.getFps() ? 'An' : 'Aus'}`;
    bc.textContent = `Hüllen: ${a.getBigCovers() ? 'Groß' : 'Normal'}`;
    const vt = a.getSound() ? voiceNote(a.getVoiceInfo ? a.getVoiceInfo() : null) : '';
    note.textContent = vt;
    note.hidden = !vt;
    const fk = a.fullscreenKind ? a.fullscreenKind() : 'none';
    fs.hidden = fk !== 'api' && fk !== 'guide';
    fs.textContent = fk === 'guide' ? 'Vollbild …' : `Vollbild: ${a.getFullscreen && a.getFullscreen() ? 'An' : 'Aus'}`;
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
