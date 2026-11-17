// TV-Modus · Bild-in-Bild-Steuerung (Vertrag: docs/tvmode.md „Bild-in-Bild“).
// Chrome: requestPictureInPicture / document.pictureInPictureElement · Safari: webkitSetPresentationMode / webkitpresentationmodechanged.
// Beim Eintritt hängt pip.js das <video> SOFORT in den versteckten body-Halter #lfx-tvm-bg (1 px, opacity 0, nie display:none), beim
// Austritt zurück in den Slot, falls der Host noch verbunden ist. Sonst meldet onChange(false, { restored: false }) → Engine stoppt (pip-end).
// Importiert nichts.

export const BG_ID = 'lfx-tvm-bg';
const SAFARI_MODE = 'picture-in-picture';

/**
 * @param {{ doc?: Document, video: HTMLVideoElement, getSlot?: () => (Element|null), onChange?: (active: boolean, info: { restored: boolean }) => void }} o
 * @returns {{ supported(): boolean, active(): boolean, enter(): Promise<boolean>, exit(): Promise<boolean>, toggle(): Promise<boolean>,
 *   hold(): void, on(fn): () => void, dispose(): void }}
 */
export function createPip({ doc = document, video, getSlot = () => null, onChange } = {}) {
  const subs = new Set();
  let last = false;
  let disposed = false;

  const chrome = () => typeof video.requestPictureInPicture === 'function' && doc.pictureInPictureEnabled !== false && !video.disablePictureInPicture;
  const safari = () => typeof video.webkitSetPresentationMode === 'function'
    && (typeof video.webkitSupportsPresentationMode !== 'function' || !!video.webkitSupportsPresentationMode(SAFARI_MODE));

  const supported = () => !disposed && !!video && (chrome() || safari());
  const active = () => !disposed && !!video && (doc.pictureInPictureElement === video || video.webkitPresentationMode === SAFARI_MODE);

  function bg() {
    let el = doc.getElementById(BG_ID);
    if (!el) {
      el = doc.createElement('div');
      el.id = BG_ID;
      el.setAttribute('aria-hidden', 'true');
      const s = el.style;
      s.position = 'fixed';
      s.left = '0';
      s.top = '0';
      s.width = '1px';
      s.height = '1px';
      s.opacity = '0';
      s.overflow = 'hidden';
      s.pointerEvents = 'none';
      (doc.body || doc.documentElement).appendChild(el);
    }
    return el;
  }

  /** Video in den Halter hängen (nur wenn nötig). */
  function hold() {
    if (disposed || !video) return;
    const el = bg();
    if (video.parentNode !== el) el.appendChild(video);
  }

  function notify(a, info) {
    for (const fn of [...subs]) { try { fn(a, info); } catch { /* Hörerfehler egal */ } }
    if (typeof onChange === 'function') { try { onChange(a, info); } catch { /* egal */ } }
  }

  function sync() {
    if (disposed) return;
    const now = active();
    if (now === last) return;
    last = now;
    if (now) {
      hold(); // sofort umhängen
      notify(true, { restored: false });
      return;
    }
    const slot = getSlot();
    let restored = false;
    if (slot && slot.isConnected) {
      slot.appendChild(video);
      restored = true;
    }
    if (restored) { const el = doc.getElementById(BG_ID); if (el && !el.firstChild) el.remove(); }
    notify(false, { restored });
  }

  const evs = ['enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged'];
  if (video) for (const e of evs) video.addEventListener(e, sync);

  async function enter() {
    if (!supported() || active()) return active();
    try {
      if (chrome()) await video.requestPictureInPicture();
      else video.webkitSetPresentationMode(SAFARI_MODE);
    } catch {
      return false;
    }
    sync();
    return active();
  }

  async function exit() {
    if (disposed || !active()) return false;
    try {
      if (doc.pictureInPictureElement === video && typeof doc.exitPictureInPicture === 'function') await doc.exitPictureInPicture();
      else if (typeof video.webkitSetPresentationMode === 'function') video.webkitSetPresentationMode('inline');
    } catch {
      return false;
    }
    sync();
    return true;
  }

  return {
    supported,
    active,
    enter,
    exit,
    toggle: () => (active() ? exit() : enter()),
    hold: () => { if (active()) hold(); },
    on(fn) {
      if (typeof fn !== 'function') return () => {};
      subs.add(fn);
      return () => subs.delete(fn);
    },
    dispose() {
      if (disposed) return;
      const was = active();
      if (video) for (const e of evs) video.removeEventListener(e, sync);
      disposed = true;
      subs.clear();
      if (was) {
        try {
          if (doc.pictureInPictureElement === video && typeof doc.exitPictureInPicture === 'function') {
            const p = doc.exitPictureInPicture();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } else if (typeof video.webkitSetPresentationMode === 'function') video.webkitSetPresentationMode('inline');
        } catch { /* egal */ }
      }
      const el = doc.getElementById(BG_ID);
      if (el) el.remove();
    },
  };
}
