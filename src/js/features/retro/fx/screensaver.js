// LENZ//84 retro-fx: Bildschirmschoner "Code-Regen" (fallende Bernstein-Zeichen auf Canvas, ~30 fps, DPR <= 2).
// Startet nach 3 min ohne Eingabe (nicht im Player, bei Dialog/Terminal/Video/hidden), jede Eingabe beendet ihn und
// wird nicht an die Seite durchgereicht (Klick/Taste geschluckt). getContext() == null -> still aus.
import { h } from '../../../core/dom.js';
import { createTimers } from './util.js';

export const RAIN_ID = 'lfx-retro-rain';
export const IDLE_MS = 3 * 60 * 1000;
const CHARS = '0123456789ABCDEF0123456789ABCDEFGHIJKLMNOPRSTUVWXYZ#%&$+=<>/\\|:;▓▒░█▌▐'.split('');
const FRAME_MS = 1000 / 30;

/**
 * opts: { idleMs, isBlocked() -> bool, getTitles() -> string[], reduced, onStart(), onStop() }
 * Rückgabe: { start(), stop() (komplett aus), run() (sofort), end() (nur Overlay beenden), isActive() }
 */
export function createScreensaver({ idleMs = IDLE_MS, isBlocked = () => false, getTitles = () => [], reduced = false, onStart = () => {}, onStop = () => {} } = {}) {
  const timers = createTimers();
  let started = false;
  let active = false;
  let lastInput = Date.now();
  let el = null;
  let canvas = null;
  let ctx = null;
  let titleEl = null;
  let raf = 0;
  let lastFrame = 0;
  let drops = [];
  let cols = 0;
  let fontPx = 18;
  let dpr = 1;
  let swallowClickUntil = 0;
  let lastMove = null;
  let nextFlash = 0;

  const idleEvents = ['pointermove', 'keydown', 'touchstart', 'wheel', 'scroll', 'pointerdown'];

  function noteInput(e) {
    if (active) return;
    if (e && e.type === 'pointermove') {
      // winzige Bewegungen (Sensorrauschen) zählen nicht
      const p = { x: e.clientX, y: e.clientY };
      if (lastMove && Math.abs(p.x - lastMove.x) + Math.abs(p.y - lastMove.y) < 3) return;
      lastMove = p;
    }
    lastInput = Date.now();
  }

  function size() {
    if (!canvas) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth || 800;
    const hgt = window.innerHeight || 600;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(hgt * dpr));
    fontPx = Math.round((w < 800 ? 16 : 20) * dpr);
    const n = Math.ceil(canvas.width / fontPx);
    const old = drops;
    drops = Array.from({ length: n }, (_, i) => (i < old.length ? old[i] : -Math.floor(Math.random() * 40)));
    cols = n;
    if (ctx) {
      ctx.fillStyle = '#0a0603';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function frame(now) {
    raf = 0;
    if (!active || !ctx) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const step = reduced ? FRAME_MS * 2 : FRAME_MS;
    if (now - lastFrame < step) return;
    lastFrame = now;
    ctx.fillStyle = 'rgba(10, 6, 3, 0.14)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${fontPx}px "LenzRetro Pixel", "VT323", monospace`;
    ctx.textBaseline = 'top';
    for (let i = 0; i < cols; i++) {
      const y = drops[i];
      if (y >= 0) {
        const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
        // Kopf hell, Spur Bernstein
        ctx.fillStyle = '#ffe2a8';
        ctx.fillText(ch, i * fontPx, y * fontPx);
        ctx.fillStyle = 'rgba(255, 176, 0, 0.9)';
        ctx.fillText(CHARS[Math.floor(Math.random() * CHARS.length)], i * fontPx, (y - 1) * fontPx);
      }
      drops[i] = y * fontPx > canvas.height && Math.random() > 0.975 ? -Math.floor(Math.random() * 20) : y + (reduced ? 0.5 : 1);
    }
    flashTitle(Date.now());
  }

  function flashTitle(t) {
    if (!titleEl || t < nextFlash) return;
    const titles = (() => { try { return getTitles(); } catch { return []; } })();
    const pool = ['LENZ//84', ...titles.slice(0, 20)];
    titleEl.textContent = Math.random() < 0.4 ? pool[0] : pool[Math.floor(Math.random() * pool.length)];
    titleEl.classList.remove('is-flash');
    void titleEl.offsetWidth; // Animation neu starten
    titleEl.classList.add('is-flash');
    nextFlash = t + 5000 + Math.random() * 4000;
  }

  function onResize() { size(); }
  function onVisibility() {
    if (!active) return;
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf) raf = requestAnimationFrame(frame);
  }

  function swallow(e) {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }
  function onActiveInput(e) {
    if (!active) return;
    if (e.type === 'pointermove' || e.type === 'mousemove') {
      const p = { x: e.clientX, y: e.clientY };
      if (!lastMove) { lastMove = p; return; }
      if (Math.abs(p.x - lastMove.x) + Math.abs(p.y - lastMove.y) < 12) return;
    } else if (e.type !== 'wheel') {
      swallow(e); // Taste/Klick/Tippen gehört nur dem Bildschirmschoner
      swallowClickUntil = Date.now() + 600;
    }
    end();
  }
  function onClickGuard(e) {
    if (Date.now() < swallowClickUntil) swallow(e);
  }
  const activeEvents = ['keydown', 'pointerdown', 'mousedown', 'touchstart', 'wheel', 'pointermove'];

  function run(manual = true) {
    if (active) return true;
    if (typeof requestAnimationFrame !== 'function') return false;
    canvas = h('canvas', { class: 'lfx-retro-rain__canvas' });
    let c;
    try { c = canvas.getContext('2d'); } catch { c = null; }
    if (!c) { canvas = null; return false; }
    ctx = c;
    titleEl = h('div', { class: 'lfx-retro-rain__title', 'aria-hidden': 'true' });
    el = h('div', { id: RAIN_ID, class: 'lfx-retro-rain', role: 'presentation', 'aria-hidden': 'true' }, [canvas, titleEl]);
    document.body.append(el);
    active = true;
    lastMove = null;
    nextFlash = Date.now() + 1500;
    size();
    for (const ev of activeEvents) window.addEventListener(ev, onActiveInput, { capture: true, passive: false });
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(frame);
    try { onStart(manual); } catch { /* egal */ }
    return true;
  }

  function end() {
    if (!active) return;
    active = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    for (const ev of activeEvents) window.removeEventListener(ev, onActiveInput, true);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    if (el) el.remove();
    el = canvas = ctx = titleEl = null;
    drops = [];
    lastInput = Date.now();
    try { onStop(); } catch { /* egal */ }
  }

  function check() {
    if (active || document.hidden) return;
    if (reduced) return; // reduced-motion: nur per Befehl
    if (Date.now() - lastInput < idleMs) return;
    if (isBlocked()) { lastInput = Date.now() - idleMs + 15000; return; } // in 15 s erneut prüfen
    run(false);
  }

  function start() {
    if (started) return;
    started = true;
    lastInput = Date.now();
    for (const ev of idleEvents) window.addEventListener(ev, noteInput, { capture: true, passive: true });
    window.addEventListener('click', onClickGuard, true);
    timers.interval(check, 5000);
  }

  function stop() {
    end();
    if (started) {
      for (const ev of idleEvents) window.removeEventListener(ev, noteInput, true);
      window.removeEventListener('click', onClickGuard, true);
    }
    started = false;
    swallowClickUntil = 0;
    timers.clearAll();
  }

  return { start, stop, run, end, isActive: () => active };
}
