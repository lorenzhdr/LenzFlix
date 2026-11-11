// VIDEOTHEK LENZ · HUD-Overlays im Host: Fadenkreuz, Titel-Hinweis, Start-Hinweis, "Grafik wird neu aufgebaut", Menü-Knopf (Touch).

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const VR_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 8.5C3 7.1 4.1 6 5.5 6h13C19.9 6 21 7.1 21 8.5v6c0 1.4-1.1 2.5-2.5 2.5h-3.2c-.8 0-1.5-.5-1.8-1.2l-.3-.8c-.2-.5-.7-.8-1.2-.8s-1 .3-1.2.8l-.3.8c-.3.7-1 1.2-1.8 1.2H5.5C4.1 17 3 15.9 3 14.5v-6zm2 .5v5.5c0 .3.2.5.5.5h2.6l.1-.3c.5-1.2 1.6-1.9 2.8-1.9s2.3.7 2.8 1.9l.1.3h2.6c.3 0 .5-.2.5-.5V9c0-.3-.2-.5-.5-.5h-13c-.3 0-.5.2-.5.5z"/></svg>';

export function createHud(host, { touch, onMenu, onVr }) {
  const root = el('div', 'lfx-store-ov');
  const cross = el('div', 'lfx-store-cross');
  cross.setAttribute('aria-hidden', 'true');
  const hint = el('div', 'lfx-store-hint');
  const hintTitle = el('div', 'lfx-store-hint-title');
  const hintSub = el('div', 'lfx-store-hint-sub');
  hint.append(hintTitle, hintSub);
  const prompt = el('div', 'lfx-store-prompt');
  const pTitle = el('div', 'lfx-store-prompt-title', touch ? 'Gedrückt halten zum Laufen' : 'Klicken zum Losgehen');
  const pSub = el(
    'div',
    'lfx-store-prompt-sub',
    touch ? 'Wischen zum Umsehen · Tippen zum Nehmen' : 'WASD laufen · Maus umsehen · Shift rennen · E nehmen · Q zoomen · Esc Pause',
  );
  prompt.append(pTitle, pSub);
  const lost = el('div', 'lfx-store-lost', 'Grafik wird neu aufgebaut…');
  lost.hidden = true;
  const toast = el('div', 'lfx-store-note');
  toast.hidden = true;
  const fps = el('div', 'lfx-store-fps');
  fps.setAttribute('aria-hidden', 'true');
  fps.hidden = true;
  root.append(cross, hint, prompt, lost, toast, fps);
  let menuBtn = null;
  if (touch) {
    menuBtn = el('button', 'lfx-store-menubtn');
    menuBtn.type = 'button';
    menuBtn.setAttribute('aria-label', 'Menü');
    menuBtn.innerHTML = '<span></span><span></span><span></span>';
    menuBtn.addEventListener('click', (e) => { e.stopPropagation(); if (onMenu) onMenu(); });
    root.appendChild(menuBtn);
  }
  const vrBtn = el('button', 'lfx-store-vrbtn');
  vrBtn.type = 'button';
  vrBtn.setAttribute('aria-label', 'In VR betreten');
  vrBtn.innerHTML = VR_ICON;
  vrBtn.appendChild(el('span', 'lfx-store-vrbtn-label', 'In VR betreten'));
  vrBtn.hidden = true;
  // Der Canvas-Lock darf nicht greifen; requestSession muss synchron im Klick laufen.
  for (const ev of ['pointerdown', 'mousedown', 'touchstart']) vrBtn.addEventListener(ev, (e) => e.stopPropagation());
  vrBtn.addEventListener('click', (e) => { e.stopPropagation(); if (onVr) onVr(); });
  root.appendChild(vrBtn);
  host.appendChild(root);
  hint.hidden = true;
  cross.hidden = touch;
  let noteTimer = 0;

  return {
    root,
    setHint(title, sub) {
      if (!title) { hint.hidden = true; return; }
      hintTitle.textContent = title;
      hintSub.textContent = sub || '';
      hint.hidden = false;
    },
    setCross(on, aimed) {
      if (touch) return;
      cross.hidden = !on;
      cross.classList.toggle('is-aimed', !!aimed);
    },
    showPrompt(on, again) {
      prompt.classList.toggle('is-on', !!on);
      pTitle.textContent = touch ? 'Gedrückt halten zum Laufen' : again ? 'Klicken zum Weiterspielen' : 'Klicken zum Losgehen';
    },
    /** FPS-Kachel: Text setzen (null/leer blendet aus). */
    setFps(text) {
      if (!text) { fps.hidden = true; return; }
      if (fps.textContent !== text) fps.textContent = text;
      fps.hidden = false;
    },
    showLost(on) { lost.hidden = !on; },
    showMenuBtn(on) { if (menuBtn) menuBtn.hidden = !on; },
    showVr(on) { vrBtn.hidden = !on; },
    note(text, ms = 2200) {
      toast.textContent = text;
      toast.hidden = false;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => { toast.hidden = true; }, ms);
    },
    destroy() { clearTimeout(noteTimer); root.remove(); },
  };
}
