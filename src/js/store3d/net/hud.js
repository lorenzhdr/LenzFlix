// VIDEOTHEK LENZ · Mehrspieler: Anzeige „N hier“ bzw. „1 hier · 2 Geräte“ in den W0-Plätzen (.lfx-store-social).
// Touch: oben rechts (Host-Klasse lfx-store-has-social schiebt das FPS-Feld nach unten), Desktop: oben links.
// Chat-/Emote-Knöpfe kommen erst in Welle b. Nichts darin fängt Eingaben ab (pointer-events:none).
// hud = createHud(ctx) → { set(text | null), dispose() }; ctx.renderer.domElement.parentNode ist der Host.
export function createHud(ctx) {
  let root = null;
  let label = null;
  let host = null;
  let shown = '';

  const hostEl = () => (ctx.renderer && ctx.renderer.domElement && ctx.renderer.domElement.parentNode) || null;

  function leaveHost() {
    if (host && host.classList) host.classList.remove('lfx-store-has-social');
    if (root && root.parentNode) root.parentNode.removeChild(root);
    host = null;
  }

  function ensure() {
    const h = hostEl();
    if (!h) return false;
    if (root && host === h && root.parentNode === h) return true;
    if (root) leaveHost();
    if (!root) {
      root = document.createElement('div');
      root.className = 'lfx-store-social lfx-mp-social' + (ctx.isTouch ? ' is-touch' : ' is-desk');
      label = document.createElement('div');
      label.className = 'lfx-mp-count';
      label.setAttribute('role', 'status');
      root.appendChild(label);
    }
    h.appendChild(root);
    host = h;
    if (ctx.isTouch) h.classList.add('lfx-store-has-social');
    return true;
  }

  return {
    /** Text zeigen; null/leer = ausblenden (und Platz im Host freigeben). */
    set(text) {
      if (!text) {
        if (root) root.hidden = true;
        if (host && host.classList) host.classList.remove('lfx-store-has-social');
        shown = '';
        return;
      }
      if (!ensure()) return;
      root.hidden = false;
      if (ctx.isTouch && host.classList) host.classList.add('lfx-store-has-social');
      if (text !== shown) { label.textContent = text; shown = text; }
    },
    dispose() {
      leaveHost();
      root = null;
      label = null;
      shown = '';
    },
  };
}
