// VIDEOTHEK LENZ · Hinweis am Handy im Hochformat: „Für die beste Ansicht das Handy quer drehen“ (Banner oben, wegtippbar).
// Erscheint bei jedem Besuch im Hochformat, verschwindet beim Drehen ins Querformat und kommt beim Zurückdrehen wieder,
// bis man ihn mit ✕ schließt (nur für diesen Besuch, nichts wird gespeichert). Spielen im Hochformat bleibt möglich.

const ICON = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">'
  + '<rect x="7" y="2.5" width="10" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>'
  + '<path d="M3.5 13.5a8.5 8.5 0 0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
  + '<path d="M9.2 19.6l2.4 1.9-2 2.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
  + '</svg>';

export const ROTATE_TEXT = 'Für die beste Ansicht das Handy quer drehen';

/** Hochformat? matchMedia, sonst Fensterseiten. */
export function isPortrait(win = window) {
  try {
    const mq = win.matchMedia && win.matchMedia('(orientation: portrait)');
    if (mq && typeof mq.matches === 'boolean') return mq.matches;
  } catch { /* egal */ }
  return (win.innerHeight || 0) > (win.innerWidth || 0);
}

/**
 * @param {HTMLElement} host
 * @param {object} o { getMode() → Modus; sichtbar nur bei 'play', win? }
 */
export function createRotateHint(host, { getMode = () => 'play', win = window } = {}) {
  const root = document.createElement('div');
  root.className = 'lfx-store-rotate';
  root.setAttribute('role', 'status');
  root.hidden = true;
  const icon = document.createElement('span');
  icon.className = 'lfx-store-rotate-icon';
  icon.innerHTML = ICON;
  const text = document.createElement('span');
  text.className = 'lfx-store-rotate-text';
  text.textContent = ROTATE_TEXT;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lfx-store-rotate-close';
  close.setAttribute('aria-label', 'Hinweis schließen');
  close.textContent = '✕';
  root.append(icon, text, close);
  host.appendChild(root);

  let dismissed = false;
  let destroyed = false;

  function update() {
    if (destroyed) return;
    const mode = getMode();
    root.hidden = dismissed || mode !== 'play' || !isPortrait(win);
  }
  close.addEventListener('click', () => { dismissed = true; update(); });

  let mq = null;
  try { mq = win.matchMedia ? win.matchMedia('(orientation: portrait)') : null; } catch { mq = null; }
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', update);
    else if (mq.addListener) mq.addListener(update);
  }
  win.addEventListener('resize', update);
  win.addEventListener('orientationchange', update);
  update();

  return {
    root,
    update,
    get visible() { return !root.hidden; },
    get dismissed() { return dismissed; },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (mq) {
        if (mq.removeEventListener) mq.removeEventListener('change', update);
        else if (mq.removeListener) mq.removeListener(update);
      }
      win.removeEventListener('resize', update);
      win.removeEventListener('orientationchange', update);
      root.remove();
    },
  };
}
