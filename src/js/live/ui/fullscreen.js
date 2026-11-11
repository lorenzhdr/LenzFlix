// LENZ LIVE · Vollbild. Fullscreen-API am Host (.lfx-live-app), nie am <video>; Fallback (iOS) = CSS-Klasse .is-fullscreen.

/**
 * @param {object} o { target, doc?, onChange? }
 * @returns {{ toggle(), enter(), exit(), isOn(), native(), destroy() }}
 */
export function createFullscreen({ target, doc = document, onChange } = {}) {
  let cssOn = false;

  const fsEl = () => doc.fullscreenElement || doc.webkitFullscreenElement || null;
  const canNative = () => {
    const enabled = doc.fullscreenEnabled !== false && doc.webkitFullscreenEnabled !== false;
    return enabled && !!(target && (typeof target.requestFullscreen === 'function' || typeof target.webkitRequestFullscreen === 'function'));
  };
  const isOn = () => cssOn || fsEl() === target;
  const sync = () => {
    if (target) target.classList.toggle('is-fullscreen', isOn());
    if (onChange) onChange(isOn());
  };

  function enter() {
    if (isOn()) return;
    if (canNative()) {
      try {
        const p = (target.requestFullscreen || target.webkitRequestFullscreen).call(target);
        if (p && typeof p.catch === 'function') p.catch(() => { cssOn = true; sync(); });
        return;
      } catch { /* Fallback */ }
    }
    cssOn = true;
    sync();
  }

  function exit() {
    if (!isOn()) return;
    cssOn = false;
    if (fsEl() === target) {
      try { (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc); } catch { /* egal */ }
    }
    sync();
  }

  const onNative = () => {
    if (fsEl() !== target) cssOn = cssOn && !canNative();
    sync();
  };
  doc.addEventListener('fullscreenchange', onNative);
  doc.addEventListener('webkitfullscreenchange', onNative);

  return {
    toggle() { if (isOn()) exit(); else enter(); },
    enter,
    exit,
    isOn,
    native: () => fsEl() === target,
    destroy() {
      doc.removeEventListener('fullscreenchange', onNative);
      doc.removeEventListener('webkitfullscreenchange', onNative);
      if (fsEl() === target) { try { (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc); } catch { /* egal */ } }
      cssOn = false;
      if (target) target.classList.remove('is-fullscreen');
    },
  };
}
