// VIDEOTHEK LENZ · HUD-Overlays im Host: Fadenkreuz, Titel-Hinweis, Start-Hinweis, "Grafik wird neu aufgebaut", Menü-Knopf (Touch).

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function createHud(host, { touch, onMenu }) {
  const root = el('div', 'lfx-store-ov');
  const cross = el('div', 'lfx-store-cross');
  cross.setAttribute('aria-hidden', 'true');
  const hint = el('div', 'lfx-store-hint');
  const hintTitle = el('div', 'lfx-store-hint-title');
  const hintSub = el('div', 'lfx-store-hint-sub');
  hint.append(hintTitle, hintSub);
  const prompt = el('div', 'lfx-store-prompt');
  const pTitle = el('div', 'lfx-store-prompt-title', touch ? 'Tippen zum Gehen' : 'Klicken zum Losgehen');
  const pSub = el(
    'div',
    'lfx-store-prompt-sub',
    touch ? 'Ziehen zum Umsehen · Hülle antippen zum Nehmen' : 'WASD laufen · Maus umsehen · Shift rennen · E nehmen · Esc Pause',
  );
  prompt.append(pTitle, pSub);
  const lost = el('div', 'lfx-store-lost', 'Grafik wird neu aufgebaut…');
  lost.hidden = true;
  const toast = el('div', 'lfx-store-note');
  toast.hidden = true;
  root.append(cross, hint, prompt, lost, toast);
  let menuBtn = null;
  if (touch) {
    menuBtn = el('button', 'lfx-store-menubtn');
    menuBtn.type = 'button';
    menuBtn.setAttribute('aria-label', 'Menü');
    menuBtn.innerHTML = '<span></span><span></span><span></span>';
    menuBtn.addEventListener('click', (e) => { e.stopPropagation(); if (onMenu) onMenu(); });
    root.appendChild(menuBtn);
  }
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
    showPrompt(on) { prompt.classList.toggle('is-on', !!on); },
    showLost(on) { lost.hidden = !on; },
    showMenuBtn(on) { if (menuBtn) menuBtn.hidden = !on; },
    note(text, ms = 2200) {
      toast.textContent = text;
      toast.hidden = false;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => { toast.hidden = true; }, ms);
    },
    destroy() { clearTimeout(noteTimer); root.remove(); },
  };
}
