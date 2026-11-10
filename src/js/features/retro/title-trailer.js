// LENZ//84: Trailer-Overlay der Titelseite (Vollbild-Dialog mit Röhren-Rahmen). Gehört Worker P2.
import { h, mountPoint, unmountPoint } from '../../core/dom.js';
import { toast } from '../../core/toast.js';
import { emitFx } from './prefs.js';

export const TRAILER_ID = 'lfx-retro-trailer';

export function closeTrailer() {
  const el = document.getElementById(TRAILER_ID);
  if (!el) return;
  const v = el.querySelector('video');
  if (v) {
    try {
      v.pause();
      v.removeAttribute('src');
      if (v.load) v.load();
    } catch { /* jsdom */ }
  }
  if (typeof el.__lfxCleanup === 'function') el.__lfxCleanup();
  unmountPoint(el);
}

export function openTrailer(src, returnFocus) {
  closeTrailer();
  const overlay = mountPoint(TRAILER_ID, { className: 'lfx-retro-trailer' });
  overlay.replaceChildren();
  const video = h('video', { class: 'lfx-retro-trailer__video', controls: true, autoplay: true, playsinline: true });
  const close = () => {
    closeTrailer();
    emitFx('close');
    if (returnFocus && returnFocus.isConnected && returnFocus.focus) {
      try { returnFocus.focus({ preventScroll: true }); } catch { /* egal */ }
    }
  };
  const closeBtn = h('button', { type: 'button', class: 'lfx-retro-btn lfx-retro-trailer__close', onclick: close }, 'Schließen');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Trailer');
  overlay.append(h('div', { class: 'lfx-retro-trailer__tube' }, [h('p', { class: 'lfx-retro-trailer__tag lfx-retro-label' }, 'Trailer'), video]), closeBtn);
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  const onBackdrop = (e) => { if (e.target === overlay) close(); };
  window.addEventListener('keydown', onKey, true);
  overlay.addEventListener('click', onBackdrop);
  overlay.__lfxCleanup = () => {
    window.removeEventListener('keydown', onKey, true);
    overlay.removeEventListener('click', onBackdrop);
  };
  video.addEventListener('error', () => {
    emitFx('error');
    toast('Trailer konnte nicht abgespielt werden');
    close();
  });
  video.addEventListener('ended', close);
  video.src = src;
  try {
    const p = video.play && video.play();
    if (p && p.catch) p.catch(() => {});
  } catch { /* Autoplay-Sperre: Bedienelemente bleiben */ }
  emitFx('open');
  closeBtn.focus();
}
