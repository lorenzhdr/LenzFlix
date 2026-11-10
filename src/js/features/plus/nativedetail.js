// LENZ+: native Detailseite (#/details?id=…, #itemDetailPage). Setzt Zustandsklassen auf #itemDetailPage:
//  - lfx-plus-nologo: kein Titel-Logo (oder Logo lädt nicht) -> Name wird als Text-Titel gezeigt (modern/detail.css klippt ihn sonst auf 1 px)
//  - lfx-plus-nobackdrop: kein Backdrop-Bild -> dezenter Verlauf statt schwarzer Fläche
// Die Logik steckt in createNativeDetail() und wird auch von LENZPRIME genutzt (prime/nativedetail.js, nur Logo-Klasse).
// Es werden nur Klassen auf dem Seiten-Element gesetzt, keine React-Knoten verändert.
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { isReady } from '../../core/api.js';

const URL_RE = /url\(\s*["']?([^"')]+)["']?\s*\)/;

const bgUrl = (el) => {
  if (!el) return null;
  const css = (el.style && el.style.backgroundImage) || (typeof getComputedStyle === 'function' ? getComputedStyle(el).backgroundImage : '');
  const m = URL_RE.exec(css || '');
  return m ? m[1] : null;
};

function setClass(el, cls, on) {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

/** True, wenn das Logo-Element trotz Bild nicht gezeigt wird (z. B. Jellyfin-Standard display:none am Handy). */
function logoHidden(el) {
  if (typeof getComputedStyle !== 'function') return false;
  return getComputedStyle(el).display === 'none';
}

/**
 * Baut ein Feature für die native Detailseite. nologoClass: Zustandsklasse "kein sichtbares Logo -> Name als Text";
 * nobdClass (optional): "kein Backdrop".
 */
export function createNativeDetail({ name, theme, nologoClass, nobdClass = null }) {
  const NOLOGO = nologoClass;
  const NOBD = nobdClass;
  const ALL = [NOLOGO, NOBD].filter(Boolean);
  const state = { page: null, obs: null, timer: 0, poll: 0, probes: new Map(), tries: 0 };

  function probeLogo(url) {
    if (state.probes.has(url) || typeof Image !== 'function') return;
    state.probes.set(url, 'pending');
    const img = new Image();
    img.onload = () => state.probes.set(url, 'ok');
    img.onerror = () => {
      state.probes.set(url, 'bad');
      evaluate();
    };
    img.src = url;
  }

  /** Berechnet die Zustände und setzt die Klassen (idempotent, ändert nur bei Abweichung). */
  function evaluate() {
    const page = state.page;
    if (!page || !page.isConnected) return;
    const logoEl = page.querySelector('.detailLogo');
    const logoUrl = logoEl && !logoEl.classList.contains('hide') ? bgUrl(logoEl) : null;
    if (logoUrl) probeLogo(logoUrl);
    let noLogo = !logoUrl || state.probes.get(logoUrl) === 'bad';
    if (!noLogo) {
      // Eigene Klasse kurz entfernen, damit deren display:none die Messung nicht selbst auslöst.
      const had = page.classList.contains(NOLOGO);
      if (had) page.classList.remove(NOLOGO);
      noLogo = logoHidden(logoEl);
      if (had) page.classList.add(NOLOGO);
    }
    setClass(page, NOLOGO, noLogo);

    if (NOBD) {
      const bd = page.querySelector('.itemBackdrop');
      const own = bd && !bd.classList.contains('hide') && bgUrl(bd);
      const global = !!document.querySelector('.backdropContainer .displayingBackdropImage');
      const wide = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1000px)').matches;
      setClass(page, NOBD, !own && !(wide && global));
    }
  }

  function schedule() {
    if (state.timer) return;
    state.timer = setTimeout(() => {
      state.timer = 0;
      evaluate();
    }, 60);
  }

  function clearPage() {
    if (state.obs) state.obs.disconnect();
    state.obs = null;
    clearTimeout(state.timer);
    clearTimeout(state.poll);
    state.timer = 0;
    state.poll = 0;
    if (state.page) {
      state.page.classList.remove(...ALL);
      state.page = null;
    }
    for (const p of document.querySelectorAll(ALL.map((c) => `.${c}`).join(', '))) p.classList.remove(...ALL);
    state.probes.clear();
  }

  function attach() {
    const page = document.querySelector('#itemDetailPage:not(.hide)');
    if (!page) {
      if (++state.tries < 30) state.poll = setTimeout(attach, 200);
      return;
    }
    if (state.page === page) return;
    if (state.obs) state.obs.disconnect();
    state.page = page;
    state.obs = new MutationObserver((records) => {
      if (records.every((r) => r.type === 'attributes' && r.target === page)) return;
      schedule();
    });
    state.obs.observe(page, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
    evaluate();
  }

  const feature = {
    name,
    match: (route) => isTheme(theme) && isModern() && !isTv() && isReady() && route.path === '/details',
    mount() {
      state.tries = 0;
      attach();
    },
    update() {
      state.tries = 0;
      clearTimeout(state.poll);
      state.probes.clear();
      const page = document.querySelector('#itemDetailPage:not(.hide)');
      if (page && page !== state.page) clearPage();
      attach();
      evaluate();
    },
    unmount: clearPage,
  };
  return { feature, evaluate };
}

const plus = createNativeDetail({
  name: 'plus-nativedetail',
  theme: 'plus',
  nologoClass: 'lfx-plus-nologo',
  nobdClass: 'lfx-plus-nobackdrop',
});

export const evaluate = plus.evaluate;
export default plus.feature;
