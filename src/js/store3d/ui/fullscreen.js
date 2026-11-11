// VIDEOTHEK LENZ · Vollbild (Touch) und Wisch-Trick für Safaris Leiste am iPhone im Querformat. Nur DOM, kein three.
import { el } from './hud.js';

const SWIPE_COUNT_KEY = 'lfx.store.swipeShown';
const TIP_KEY = 'lfx.store.fsTip.';
const TIP_TEXT = 'Tipp: Über Teilen → Zum Home-Bildschirm startet die Videothek ganz ohne Leiste.';

// ---- Reine Helfer (Parameter injizierbar) ----

/** Als Home-Bildschirm-App / Vollbild-Anzeigemodus gestartet. */
export function isStandalone(win = window) {
  try {
    if (win.navigator && win.navigator.standalone === true) return true;
    if (typeof win.matchMedia === 'function') {
      return !!(win.matchMedia('(display-mode: standalone)').matches || win.matchMedia('(display-mode: fullscreen)').matches);
    }
  } catch { /* egal */ }
  return false;
}

/** Fullscreen-API für Elemente vorhanden (nicht iPhone-Safari). */
export function canElementFullscreen(doc = document) {
  const de = doc.documentElement;
  if (!de) return false;
  const enabled = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
  return enabled && (typeof de.requestFullscreen === 'function' || typeof de.webkitRequestFullscreen === 'function');
}

/** iPhone/iPod (alle iOS-Browser nutzen WebKit). iPad und „Mac mit Touch“ zählen nicht. */
export function isIPhoneSafari(ua, maxTouchPoints = 0) { // eslint-disable-line no-unused-vars
  return /iPhone|iPod/.test(String(ua || ''));
}

/** Safari-Leiste sichtbar: Querformat und Fenster deutlich niedriger als die kurze Bildschirmseite. */
export function barVisible({ innerHeight, screenShort, landscape }) {
  return !!landscape && innerHeight < screenShort - 24;
}

function sget(store, key) { try { return window[store].getItem(key); } catch { return null; } }
function sset(store, key, v) { try { window[store].setItem(key, v); } catch { /* egal */ } }

/**
 * @param {object} o { host, isTouch, getMode(), userId, hud?, onChange?, win?, doc? }
 * @returns {{ kind: 'api'|'guide'|'none', isOn(), toggle(), showGuide(), hideGuide(), update(), suspend(), resume(), setHost(h), destroy() }}
 *   kind: 'api' = Vollbild-API (Android/iPad), 'guide' = iPhone-Anleitung, 'none' = Knopf ausblenden (Desktop, Home-Bildschirm-App).
 */
export function createFullscreen({ host, isTouch, getMode, userId, hud, onChange, win = window, doc = document }) {
  const nav = win.navigator || {};
  const standalone = isStandalone(win);
  const iphone = isIPhoneSafari(nav.userAgent, nav.maxTouchPoints);
  const api = canElementFullscreen(doc);
  let kind = 'none';
  if (isTouch && !standalone) {
    if (api) kind = 'api';
    else if (iphone) kind = 'guide';
  }
  const swipeEligible = iphone && !standalone;

  let hostEl = host;
  let guide = null;
  let guideKeyHandler = null;
  let spacer = null;
  let hint = null;
  let collapsed = false; // Leiste wurde eingeklappt (Wisch erfolgreich)
  let dismissed = false;
  let suspended = false;
  let destroyed = false;
  let tipDone = false;

  const fsElement = () => doc.fullscreenElement || doc.webkitFullscreenElement || null;
  const isOn = () => !!fsElement();

  function toggle() {
    if (kind === 'guide') { showGuide(); return; }
    if (kind !== 'api') return;
    try {
      if (isOn()) {
        const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
        const r = exit && exit.call(doc);
        if (r && r.catch) r.catch(() => {});
      } else {
        const de = doc.documentElement;
        const req = de.requestFullscreen || de.webkitRequestFullscreen;
        const r = req && req.call(de);
        if (r && r.catch) r.catch(() => {});
      }
    } catch { /* egal */ }
  }

  const onFsChange = () => { if (onChange) { try { onChange(isOn()); } catch { /* egal */ } } };

  // ---- Anleitungs-Panel ----
  function showGuide() {
    if (guide || destroyed) return;
    const root = el('div', 'lfx-store-fs-guide');
    const panel = el('div', 'lfx-store-fs-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Vollbild am iPhone');
    panel.append(
      el('div', 'lfx-store-fs-title', 'Vollbild am iPhone'),
      el('p', 'lfx-store-fs-text', 'Teilen → „Zum Home-Bildschirm“ → „Als Web-App öffnen“: Dann startet Jellyfin ohne Safari-Leisten.'),
      el('p', 'lfx-store-fs-text', 'Alternativ: im Querformat einmal nach oben wischen.'),
      el('p', 'lfx-store-fs-text lfx-store-fs-text--muted', 'Kein Ton? Stummschalter am iPhone prüfen.'),
    );
    const ok = el('button', 'lfx-store-act lfx-store-act--primary', 'Verstanden');
    ok.type = 'button';
    ok.addEventListener('click', (e) => { e.stopPropagation(); hideGuide(); });
    panel.appendChild(ok);
    root.appendChild(panel);
    root.addEventListener('click', (e) => { if (e.target === root) hideGuide(); });
    hostEl.appendChild(root);
    guide = root;
    guideKeyHandler = (e) => { if (e.key === 'Escape') { e.stopPropagation(); hideGuide(); } };
    doc.addEventListener('keydown', guideKeyHandler, true);
    try { ok.focus({ preventScroll: true }); } catch { /* egal */ }
    update();
  }

  function hideGuide() {
    if (!guide) return;
    guide.remove();
    guide = null;
    if (guideKeyHandler) doc.removeEventListener('keydown', guideKeyHandler, true);
    guideKeyHandler = null;
    update();
  }

  // ---- Wisch-Trick ----
  const geom = () => {
    const scr = win.screen || {};
    return {
      innerHeight: win.innerHeight,
      screenShort: Math.min(scr.width || Infinity, scr.height || Infinity),
      landscape: win.innerWidth > win.innerHeight,
    };
  };
  const scrollY = () => win.scrollY || win.pageYOffset || 0;

  function ensureActive() {
    if (!spacer) {
      spacer = el('div', 'lfx-store-swipe-spacer');
      spacer.setAttribute('aria-hidden', 'true');
      doc.body.appendChild(spacer);
    }
    doc.documentElement.classList.add('lfx-store-swipe');
  }

  function removeActive() {
    if (spacer) { spacer.remove(); spacer = null; }
    const was = doc.documentElement.classList.contains('lfx-store-swipe');
    doc.documentElement.classList.remove('lfx-store-swipe');
    if (was) { try { win.scrollTo(0, 0); } catch { /* egal */ } }
  }

  function showHint() {
    if (hint) return;
    hint = el('div', 'lfx-store-swipe-hint');
    const arrow = el('div', 'lfx-store-swipe-arrow', '↑');
    arrow.setAttribute('aria-hidden', 'true');
    const text = el('div', 'lfx-store-swipe-text', 'Nach oben wischen für Vollbild');
    const row = el('div', 'lfx-store-swipe-actions');
    const perma = el('button', 'lfx-store-act', 'Dauerhaft ohne Leiste');
    perma.type = 'button';
    perma.addEventListener('click', (e) => { e.stopPropagation(); showGuide(); });
    const close = el('button', 'lfx-store-act lfx-store-swipe-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Schließen');
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissed = true;
      sset('sessionStorage', SWIPE_COUNT_KEY, '99');
      hideHint();
      removeActive();
    });
    row.append(perma, close);
    hint.append(arrow, text, row);
    doc.body.appendChild(hint);
  }

  function hideHint() {
    if (hint) { hint.remove(); hint = null; }
  }

  function teardown() {
    hideHint();
    removeActive();
  }

  function maybeTip() {
    if (tipDone || !hud || typeof hud.note !== 'function') return;
    tipDone = true;
    const key = TIP_KEY + (userId || 'anon');
    if (sget('localStorage', key) === '1') return;
    sset('localStorage', key, '1');
    hud.note(TIP_TEXT, 6500);
  }

  function update() {
    if (destroyed) return;
    if (suspended || !swipeEligible) { teardown(); return; }
    const g = geom();
    if (!g.landscape) { teardown(); collapsed = false; return; }
    maybeTip();
    if (dismissed) return;
    const bar = barVisible(g);
    const play = getMode() === 'play';
    if (!bar || scrollY() > 0) {
      // Leiste weg: Overlay weg, Klasse + Spacer bleiben (sonst klappt die Leiste wieder aus).
      if (!bar) collapsed = true;
      if (scrollY() > 0) collapsed = true;
      hideHint();
      return;
    }
    // Leiste sichtbar
    if (!play || guide) { hideHint(); return; }
    ensureActive();
    if (hint) return;
    if (collapsed) {
      const n = Number(sget('sessionStorage', SWIPE_COUNT_KEY)) || 0;
      if (n >= 2) return;
      sset('sessionStorage', SWIPE_COUNT_KEY, String(n + 1));
      collapsed = false;
    }
    showHint();
  }

  const onViewport = () => update();
  win.addEventListener('resize', onViewport);
  win.addEventListener('orientationchange', onViewport);
  win.addEventListener('scroll', onViewport, { passive: true });
  const vv = win.visualViewport;
  if (vv && vv.addEventListener) vv.addEventListener('resize', onViewport);
  doc.addEventListener('fullscreenchange', onFsChange);
  doc.addEventListener('webkitfullscreenchange', onFsChange);

  return {
    get kind() { return kind; },
    isOn,
    toggle,
    showGuide,
    hideGuide,
    update,
    setHost(h) {
      if (h && h !== hostEl) { hostEl = h; if (guide) h.appendChild(guide); }
    },
    suspend() { suspended = true; teardown(); },
    resume() { suspended = false; update(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      hideGuide();
      teardown();
      win.removeEventListener('resize', onViewport);
      win.removeEventListener('orientationchange', onViewport);
      win.removeEventListener('scroll', onViewport);
      if (vv && vv.removeEventListener) vv.removeEventListener('resize', onViewport);
      doc.removeEventListener('fullscreenchange', onFsChange);
      doc.removeEventListener('webkitfullscreenchange', onFsChange);
    },
  };
}
