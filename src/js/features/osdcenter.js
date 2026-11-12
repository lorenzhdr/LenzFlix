// LenzFlix: Knöpfe in der Bildmitte des Video-Players (Feature "osdcenter"): ⟲10 · Play/Pause · ⟳30.
// Sichtbar genau dann, wenn Jellyfins untere Leiste sichtbar ist. Klick = Proxy-Klick auf die Knöpfe der AKTIVEN
// Player-Seite (alte Seiten bleiben mit .hide und gleicher ID im DOM). Kein Mount unter layout-tv und LENZ LIVE.
// Erkennung: Router-Events (viewshow/hashchange; Jellyfin wechselt per pushState) + solange gemountet ein
// MutationObserver auf body (childList + Klassen), per rAF gebündelt. Mausruhe-Timer: echte Zeigerbewegung über
// unseren Knöpfen erreicht Jellyfins document-Listener ohnehin (pointermove wird nicht gestoppt).
import { mountPoint, unmountPoint } from '../core/dom.js';
import { isTv } from '../core/layout.js';
import { isTheme } from '../core/theme.js';

const ID = 'lfx-osdc';
const PAGE = '[id="videoOsdPage"]:not(.hide)';
const svg = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;
const num = (n) => `<text x="12" y="15.2" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" font-family="inherit">${n}</text>`;
const ICON = {
  back: svg(`<path fill="currentColor" d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/>${num(10)}`),
  fwd: svg(`<path fill="currentColor" d="M12 5V2l5 4-5 4V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/>${num(30)}`),
  play: svg('<path fill="currentColor" d="M8 5v14l11-7z"/>'),
  pause: svg('<path fill="currentColor" d="M6 5h4v14H6zM14 5h4v14h-4z"/>'),
};
const STOP = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click'];

let el = null;
let mo = null;
let raf = 0;
let video = null;
let paused = true;
let btns = null;

const page = () => document.querySelector(PAGE);

function setPlayIcon() {
  if (!btns) return;
  btns.play.innerHTML = paused ? ICON.play : ICON.pause;
  btns.play.setAttribute('aria-label', paused ? 'Abspielen' : 'Pause');
}

function onVideoState() {
  if (video) paused = video.paused;
  setPlayIcon();
}

function bindVideo() {
  const v = document.querySelector('video.htmlvideoplayer');
  if (v === video) return;
  if (video) for (const t of ['play', 'pause', 'emptied']) video.removeEventListener(t, onVideoState);
  video = v;
  if (video) for (const t of ['play', 'pause', 'emptied']) video.addEventListener(t, onVideoState);
  onVideoState();
}

function sync() {
  raf = 0;
  if (!el) return;
  bindVideo();
  const p = page();
  const bar = p && p.querySelector('.videoOsdBottom');
  const up = p && p.querySelector('.upNextContainer');
  const on = Boolean(bar)
    && !bar.classList.contains('videoOsdBottom-hidden') && !bar.classList.contains('hide')
    && !(up && !up.classList.contains('hide'))
    && !document.querySelector('.dialogContainer .dialog.opened');
  el.classList.toggle('is-visible', on);
  el.setAttribute('aria-hidden', on ? 'false' : 'true');
  for (const [k, sel] of [['back', '.btnRewind'], ['play', '.btnPause'], ['fwd', '.btnFastForward']]) {
    const proxy = p && p.querySelector(sel);
    btns[k].classList.toggle('is-off', !proxy || proxy.classList.contains('hide'));
  }
}

function schedule() {
  if (raf) return;
  raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(sync) : setTimeout(sync, 0);
}

function press(key, sel) {
  const proxy = page() && page().querySelector(sel);
  if (!proxy) return;
  if (key === 'play') {
    paused = !paused; // optimistisch, play/pause-Events korrigieren
    setPlayIcon();
  }
  proxy.click();
}

function stop(e) {
  if (!e.target.closest || !e.target.closest('button')) return;
  e.stopPropagation();
  if (e.type === 'click') e.preventDefault();
}

function btn(key, label, sel) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `lfx-osdc__btn lfx-osdc__btn--${key}`;
  b.setAttribute('aria-label', label);
  b.innerHTML = ICON[key] || '';
  b.addEventListener('click', () => press(key, sel));
  return b;
}

export const osdcenterFeature = {
  name: 'osdcenter',
  match(route) {
    return !isTv() && !isTheme('live') && Boolean(page() || (route && route.path === '/video'));
  },
  mount() {
    el = mountPoint(ID, { className: 'lfx-osdc' });
    btns = {
      back: btn('back', '10 Sekunden zurück', '.btnRewind'),
      play: btn('play', 'Abspielen', '.btnPause'),
      fwd: btn('fwd', '30 Sekunden vor', '.btnFastForward'),
    };
    el.append(btns.back, btns.play, btns.fwd);
    for (const t of STOP) el.addEventListener(t, stop);
    mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    sync();
  },
  update() {
    schedule();
  },
  unmount() {
    if (mo) mo.disconnect();
    mo = null;
    if (raf) { if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf); clearTimeout(raf); }
    raf = 0;
    if (video) for (const t of ['play', 'pause', 'emptied']) video.removeEventListener(t, onVideoState);
    video = null;
    unmountPoint(ID);
    el = null;
    btns = null;
  },
};

export default osdcenterFeature;
