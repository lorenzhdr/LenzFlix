// TV-Modus · Bedienleiste unten im Player. Vertrag: docs/tvmode.md („Player (F)“).
// createControls({ doc, ctl, model, deps, opts }) → { el, menu, update(snap), tick(t), isMenuOpen(), closeMenu(), destroy() }
// opts: pip ({ supported(), active(), toggle(), on(fn) }), fullscreen ({ toggle(), active() }), onInteract() (optional, hält die Leiste offen).
import { createTrackMenu } from './track-menu.js';

const SVG = (inner) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

const ICONS = {
  volume: SVG('<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  muted: SVG('<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  tracks: SVG('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 10.5h4M13 10.5h4M7 14.5h2.5M12 14.5h5"/>'),
  pip: SVG('<rect x="3" y="5" width="18" height="14" rx="2.5"/><rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor" stroke="none"/>'),
  fullscreen: SVG('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  exitFullscreen: SVG('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  up: SVG('<path d="M6 15l6-6 6 6"/>'),
  down: SVG('<path d="M6 9l6 6 6-6"/>'),
};

export function createControls({ doc = document, ctl, opts = {} } = {}) {
  const pip = opts.pip || null;
  const fullscreen = opts.fullscreen || null;
  const touchHook = () => {
    if (typeof opts.onInteract === 'function') opts.onInteract();
  };

  const el = doc.createElement('div');
  el.className = 'lfx-tvm__controls';
  el.setAttribute('role', 'toolbar');
  el.setAttribute('aria-label', 'Bedienung');

  const cleanups = [];
  function on(target, type, fn) {
    target.addEventListener(type, fn);
    cleanups.push(() => target.removeEventListener(type, fn));
  }

  function btn(mod, label, icon, onClick) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = `lfx-tvm__btn lfx-tvm__btn--icon lfx-tvm__btn--${mod}`;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.innerHTML = icon;
    on(b, 'click', (e) => {
      e.stopPropagation();
      touchHook();
      onClick(e);
    });
    return b;
  }
  function setLabel(b, label) {
    b.setAttribute('aria-label', label);
    b.title = label;
  }

  // Links: Stumm + Lautstärke
  const left = doc.createElement('div');
  left.className = 'lfx-tvm__controls-left';
  const muteBtn = btn('mute', 'Ton aus', ICONS.volume, () => ctl.toggleMute());
  left.appendChild(muteBtn);
  let volWrap = null;
  let range = null;
  let dragging = false;

  function ensureRange(supported) {
    if (supported && !volWrap) {
      volWrap = doc.createElement('div');
      volWrap.className = 'lfx-tvm__volume';
      range = doc.createElement('input');
      range.type = 'range';
      range.className = 'lfx-tvm__range';
      range.min = '0';
      range.max = '100';
      range.step = '5';
      range.value = '100';
      range.setAttribute('aria-label', 'Lautstärke');
      range.title = 'Lautstärke';
      range.addEventListener('input', onRange);
      range.addEventListener('pointerdown', onDown);
      range.addEventListener('pointerup', onUp);
      range.addEventListener('pointercancel', onUp);
      volWrap.appendChild(range);
      left.appendChild(volWrap);
    } else if (!supported && volWrap) {
      range.removeEventListener('input', onRange);
      range.removeEventListener('pointerdown', onDown);
      range.removeEventListener('pointerup', onUp);
      range.removeEventListener('pointercancel', onUp);
      volWrap.remove();
      volWrap = range = null;
    }
  }
  function onRange() {
    touchHook();
    ctl.setVolume(Number(range.value));
  }
  function onDown() {
    dragging = true;
  }
  function onUp() {
    dragging = false;
  }

  // Rechts: Sender ±, Ton/Untertitel, Bild-in-Bild, Vollbild
  const right = doc.createElement('div');
  right.className = 'lfx-tvm__controls-right';

  const zapWrap = doc.createElement('div');
  zapWrap.className = 'lfx-tvm__zapper';
  const upBtn = btn('zap-up', 'Nächster Sender', ICONS.up, () => ctl.zap(1));
  const downBtn = btn('zap-down', 'Vorheriger Sender', ICONS.down, () => ctl.zap(-1));
  zapWrap.append(upBtn, downBtn);

  // Der Knopf trägt --audio und --subs (Vertrag listet beide), ein gemeinsames Menü bedient sie.
  const tracksBtn = btn('tracks', 'Ton und Untertitel', ICONS.tracks, () => menu.toggle());
  tracksBtn.classList.add('lfx-tvm__btn--audio', 'lfx-tvm__btn--subs');
  tracksBtn.setAttribute('aria-haspopup', 'menu');
  tracksBtn.setAttribute('aria-expanded', 'false');
  tracksBtn.hidden = true;

  const menu = createTrackMenu({ doc, ctl, trigger: tracksBtn, onClose: touchHook });

  const pipBtn = btn('pip', 'Bild-in-Bild', ICONS.pip, () => {
    if (pip) pip.toggle();
  });
  pipBtn.setAttribute('aria-pressed', 'false');
  pipBtn.hidden = true;

  const fsBtn = btn('fullscreen', 'Vollbild', ICONS.fullscreen, () => {
    if (fullscreen) fullscreen.toggle();
    // Zustand des Schalters kann asynchron kippen: auch beim fullscreenchange nachziehen
    syncFullscreen();
  });
  if (!fullscreen) fsBtn.hidden = true;

  right.append(zapWrap, tracksBtn, pipBtn, fsBtn);
  el.append(left, right);

  let lastMuted = null;
  function syncFullscreen() {
    const act = !!(fullscreen && fullscreen.active && fullscreen.active());
    setLabel(fsBtn, act ? 'Vollbild beenden' : 'Vollbild');
    fsBtn.innerHTML = act ? ICONS.exitFullscreen : ICONS.fullscreen;
  }
  function syncPip() {
    const ok = !!(pip && pip.supported && pip.supported());
    pipBtn.hidden = !ok;
    pipBtn.setAttribute('aria-pressed', ok && pip.active && pip.active() ? 'true' : 'false');
  }
  if (pip && typeof pip.on === 'function') {
    const off = pip.on(syncPip);
    if (typeof off === 'function') cleanups.push(off);
  }
  on(doc, 'fullscreenchange', syncFullscreen);
  on(doc, 'webkitfullscreenchange', syncFullscreen);

  function update(snap) {
    if (!snap) return;
    const muted = !!snap.muted;
    if (muted !== lastMuted) {
      lastMuted = muted;
      setLabel(muteBtn, muted ? 'Ton an' : 'Ton aus');
      muteBtn.innerHTML = muted ? ICONS.muted : ICONS.volume;
    }
    ensureRange(ctl.volumeSupported !== false);
    if (range && !dragging) {
      const v = String(muted ? 0 : Number.isFinite(snap.volume) ? snap.volume : 100);
      if (range.value !== v) range.value = v;
    }
    const choice = menu.hasChoice();
    tracksBtn.hidden = !choice;
    if (!choice && menu.isOpen()) menu.close(false);
    syncPip();
    syncFullscreen();
  }

  return {
    el,
    menu,
    update,
    tick() {},
    isMenuOpen: () => menu.isOpen(),
    closeMenu: () => menu.close(false),
    destroy() {
      menu.destroy();
      ensureRange(false);
      cleanups.splice(0).forEach((fn) => fn());
      el.remove();
    },
  };
}
