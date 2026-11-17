// VIDEOTHEK LENZ · Mehrspieler: Anzeige „N hier“ bzw. „1 hier · 2 Geräte“ in den W0-Plätzen (.lfx-store-social).
// Touch: oben rechts (Host-Klasse lfx-store-has-social schiebt das FPS-Feld nach unten), Desktop: oben links.
// Touch: zusätzlich Chat- und Emote-Knopf (44 px, rechts neben „N hier“, nur wenn der jeweilige Teil verfügbar ist). Desktop: nur die Anzeige.
// Die Anzeige „N hier“ fängt keine Eingaben ab (pointer-events:none), nur die Knöpfe sind klickbar.
// hud = createHud(ctx, { onChat(), onEmote() }?) → { set(text | null, { chat, emote }?), dispose() }; ctx.renderer.domElement.parentNode ist der Host.
export function createHud(ctx, acts = {}) {
  let root = null;
  let label = null;
  let host = null;
  let shown = '';
  let btnChat = null;
  let btnEmote = null;

  function mkBtn(cls, text, label, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lfx-store-act lfx-mp-hudbtn ' + cls;
    b.textContent = text;
    b.setAttribute('aria-label', label);
    b.hidden = true;
    const stop = (e) => e.stopPropagation();
    b.addEventListener('pointerdown', stop);
    b.addEventListener('touchstart', stop, { passive: true });
    b.addEventListener('click', (e) => { e.stopPropagation(); try { if (typeof fn === 'function') fn(); } catch { /* egal */ } });
    return b;
  }

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
      if (ctx.isTouch) {
        // row-reverse: erstes Kind liegt rechts außen (Reihenfolge von rechts: Emote, Chat, „N hier“)
        btnEmote = mkBtn('lfx-mp-emotebtn', 'Emote', 'Emote-Rad öffnen', acts.onEmote);
        btnChat = mkBtn('lfx-mp-chatbtn', 'Chat', 'Chat öffnen', acts.onChat);
        root.append(btnEmote, btnChat);
      }
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
    set(text, o) {
      const btns = () => {
        if (btnChat) btnChat.hidden = !(text && o && o.chat);
        if (btnEmote) btnEmote.hidden = !(text && o && o.emote);
      };
      if (!text) {
        btns();
        if (root) root.hidden = true;
        if (host && host.classList) host.classList.remove('lfx-store-has-social');
        shown = '';
        return;
      }
      if (!ensure()) return;
      btns();
      root.hidden = false;
      if (ctx.isTouch && host.classList) host.classList.add('lfx-store-has-social');
      if (text !== shown) { label.textContent = text; shown = text; }
    },
    dispose() {
      leaveHost();
      root = null;
      label = null;
      btnChat = null;
      btnEmote = null;
      shown = '';
    },
  };
}
