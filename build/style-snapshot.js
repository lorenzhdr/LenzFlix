/*
 * LENZFLIX Style-Snapshot (Regressionswerkzeug)
 *
 * Zweck: berechnete Styles des Designs vor/nach einer Änderung vergleichen (Soll: Diff = 0).
 *
 * Benutzung:
 *   1. Eingeloggten Jellyfin-Tab mit aktivem LENZFLIX öffnen, Seite laden lassen
 *      (gleiche Seite + gleiche Fensterbreite für Vorher/Nachher!).
 *   2. Diese Datei komplett in die Konsole bzw. per Chrome-javascript_tool ausführen.
 *      Der letzte Ausdruck ist ein JSON-String; zusätzlich liegt das Objekt in window.__lfxSnapshot.
 *   3. JSON-String in Datei speichern (z. B. .tmp/vorher.json), Änderung machen, erneut ausführen
 *      (.tmp/nachher.json), dann:  node build/style-diff.mjs .tmp/vorher.json .tmp/nachher.json
 *
 * Nur lesend: keine DOM-/Storage-Änderungen. Transitions/Animationen und --lfx-ambient* werden nicht erfasst.
 * Bild-URLs werden zu url() normalisiert, IDs in der URL zu ":id".
 */
(function () {
  'use strict';

  var PROPS = [
    'color', 'background-color', 'background-image', 'font-family', 'font-size', 'font-weight',
    'line-height', 'letter-spacing', 'text-transform', 'border-radius',
    'border-top-width', 'border-top-style', 'border-top-color', 'outline', 'box-shadow',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-bottom', 'width', 'height', 'display', 'position', 'opacity',
    'transform', 'gap', 'aspect-ratio', 'z-index', 'object-fit'
  ];
  var PSEUDO_PROPS = [
    'content', 'color', 'background-color', 'background-image', 'width', 'height', 'display',
    'position', 'opacity', 'transform', 'box-shadow', 'border-radius'
  ];

  // Selektoren (echte Klassennamen aus src/js/features/** und src/css/**).
  var LIB = ".libraryPage:not(#videoOsdPage)";
  var SELECTORS = [
    'html', 'body',
    // Header / Navigation
    'header.MuiAppBar-root', '.skinHeader',
    '#lfx-nav', '.lfx-nav__item', '.lfx-nav__item.is-active', '.lfx-nav__more', '.lfx-nav__more-btn', '.lfx-nav__caret',
    '.lfx-nav__menu', '.lfx-nav__menu-item', '.lfx-nav__menu-item--stats',
    '#lfx-mnav', '.lfx-mnav__logo', '.lfx-mnav__pills', '.lfx-mnav__pill', '.lfx-mnav__pill--cats', '.lfx-mnav__caret',
    '.lfx-mnav-overlay', '.lfx-mnav-overlay__link', '.lfx-mnav-overlay__link--stats', '.lfx-mnav-overlay__close',
    // Startseite / Billboard
    '#lfx-home', '.lfx-billboard', '.lfx-bb', '.lfx-bb__media', '.lfx-bb__img', '.lfx-bb__shade', '.lfx-bb__text',
    '.lfx-bb__logo', '.lfx-bb__title', '.lfx-bb__meta', '.lfx-bb__rating', '.lfx-bb__badge', '.lfx-bb__genres', '.lfx-bb__desc',
    '.lfx-bb__buttons', '.lfx-bb__btn--play', '.lfx-bb__btn--info', '.lfx-bb__btn--list', '.lfx-bb__btn--dl', '.lfx-bb__btn--menu',
    '.lfx-bb__mute', '.lfx-bb__dots', '.lfx-bb__dot',
    // Zeilen / Karten
    '.lfx-rows', '.lfx-row', '.lfx-row__head', '.lfx-row__title', '.lfx-row__viewport', '.lfx-row__track', '.lfx-row__pages',
    '.lfx-row__arrow', '.lfx-row--poster',
    '.lfx-card', '.lfx-card__link', '.lfx-card__img', '.lfx-card__title', '.lfx-card__logo', '.lfx-card__action',
    '.lfx-card--top10', '.lfx-card__rank', '.lfx-card__rank--wide', '.lfx-row--poster .lfx-card',
    '.lfx-progress', '.lfx-progress__bar', '.lfx-skel',
    // Hovercard
    '#lfx-hovercard', '.lfx-hc', '.lfx-hc__media', '.lfx-hc__img', '.lfx-hc__logo', '.lfx-hc__title', '.lfx-hc__body',
    '.lfx-hc__actions', '.lfx-hc__btn', '.lfx-hc__btn--play', '.lfx-hc__meta', '.lfx-hc__badge', '.lfx-hc__genres', '.lfx-hc__progress', '.lfx-hc__fill',
    // Modal
    '#lfx-modal', '.lfx-modal-overlay', '.lfx-modal', '.lfx-modal__close', '.lfx-modal__hero', '.lfx-modal__hero-img',
    '.lfx-modal__hero-fade', '.lfx-modal__logo', '.lfx-modal__title', '.lfx-modal__actions', '.lfx-modal__play',
    '.lfx-modal__round', '.lfx-modal__meta', '.lfx-modal__badge', '.lfx-modal__overview', '.lfx-modal__body',
    '.lfx-modal__label', '.lfx-modal__value', '.lfx-modal__eps-head', '.lfx-modal__ep', '.lfx-modal__ep-num',
    '.lfx-modal__ep-title', '.lfx-modal__ep-desc', '.lfx-modal__seasonbtn', '.lfx-modal__card', '.lfx-modal__section',
    // Neu und beliebt
    '#lfx-newpopular', '.lfx-np__heading', '.lfx-np__tabs', '.lfx-np__pill', '.lfx-np__section', '.lfx-np__month',
    '.lfx-np__entry', '.lfx-np__date', '.lfx-np__img', '.lfx-np__name', '.lfx-np__overview', '.lfx-np__btn', '.lfx-np__genres',
    // Sonstige JS-UI
    '#lfx-sheet', '.lfx-sheet-overlay', '.lfx-sheet__title', '.lfx-sheet__item', '.lfx-sheet__item--primary',
    '#lfx-toast', '.lfx-toast__msg',
    '#lfx-statshint', '.lfx-statshint__box', '.lfx-statshint__text', '.lfx-statshint__link', '.lfx-statshint__badge', '.lfx-statshint__close',
    // Nativ: Home / Karten
    '.homePage .verticalSection', '.homePage .sectionTitle',
    LIB + ' .card', LIB + ' .cardBox', LIB + ' .cardImageContainer',
    LIB + ' .cardText', LIB + ' .cardFooter', LIB + ' .itemsContainer',
    // Nativ: Detailseite
    '#itemDetailPage', '#itemDetailPage .detailPagePrimaryContainer', '#itemDetailPage .itemName', '#itemDetailPage .itemMiscInfo',
    '#itemDetailPage .mediaInfoItem', '#itemDetailPage .mainDetailButtons', '#itemDetailPage .btnPlay', '#itemDetailPage .btnPlaystate',
    '#itemDetailPage .overview', '#itemDetailPage .detailSection', '#itemDetailPage .sectionTitle', '#itemDetailPage .cardText',
    // Nativ: Suche / Login / Player / Dialoge
    '#searchPage', '#searchPage .sectionTitle', '#searchPage input',
    '#loginPage', '#loginPage input', '#loginPage .raised', '#loginPage .cardScalable',
    '#videoOsdPage', '#videoOsdPage .videoOsdBottom', '#videoOsdPage .osdControls', '#videoOsdPage .btnPause',
    '#videoOsdPage .sliderContainer', '#videoOsdPage .paper-icon-button-light',
    '.dialog', '.dialogContainer', '.actionSheet', '.actionSheetMenuItem', '.actionSheetScroller'
  ];
  var PSEUDO_SELECTORS = [
    'html', 'body', '.lfx-nav__item', '.lfx-bb', '.lfx-bb__shade', '.lfx-card', '.lfx-card__img', '.lfx-card__rank',
    '.lfx-row__arrow', '.lfx-hc', '.lfx-modal', '.lfx-modal__hero', '.lfx-np__pill',
    LIB + ' .card', LIB + ' .cardBox', '#itemDetailPage .btnPlay'
  ];
  var VAR_PREFIXES = ['--lfx-', '--jf-'];
  var VAR_SKIP = /^--lfx-ambient/;

  function normUrl(h) {
    return String(h || '')
      .replace(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi, ':id')
      .replace(/[0-9a-f]{32}/gi, ':id');
  }
  function normValue(prop, v) {
    if (prop === 'background-image' || prop === 'content') {
      return String(v).replace(/url\((?:[^()"']|"[^"]*"|'[^']*')*\)/g, 'url()');
    }
    return v;
  }
  function collectVarNames() {
    var names = {};
    function walk(rules) {
      for (var i = 0; i < rules.length; i++) {
        var r = rules[i];
        if (r.style) {
          for (var j = 0; j < r.style.length; j++) {
            var n = r.style[j];
            if (VAR_PREFIXES.some(function (p) { return n.indexOf(p) === 0; }) && !VAR_SKIP.test(n)) names[n] = 1;
          }
        }
        if (r.cssRules) { try { walk(r.cssRules); } catch { /* ignorieren */ } }
      }
    }
    var sheets = document.styleSheets;
    for (var s = 0; s < sheets.length; s++) {
      try { walk(sheets[s].cssRules || []); } catch { /* CORS-geschütztes Sheet */ }
    }
    return Object.keys(names).sort();
  }

  var hasLayout = document.documentElement.getClientRects().length > 0 || document.documentElement.offsetWidth > 0;
  function isVisible(el) {
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (!hasLayout) return true; // z. B. jsdom ohne Layout
    return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
  }
  function readStyle(cs, props) {
    var o = {};
    for (var i = 0; i < props.length; i++) o[props[i]] = normValue(props[i], cs.getPropertyValue(props[i]));
    return o;
  }

  var rootCs = getComputedStyle(document.documentElement);
  var vars = {};
  collectVarNames().forEach(function (n) { vars[n] = rootCs.getPropertyValue(n).trim(); });

  var els = {};
  SELECTORS.forEach(function (sel) {
    var list;
    try { list = document.querySelectorAll(sel); } catch { els[sel] = { error: 'invalid selector' }; return; }
    var first = null;
    for (var i = 0; i < list.length; i++) { if (isVisible(list[i])) { first = list[i]; break; } }
    var entry = { count: list.length };
    if (first) {
      entry.style = readStyle(getComputedStyle(first), PROPS);
      if (PSEUDO_SELECTORS.indexOf(sel) !== -1) {
        entry.before = readStyle(getComputedStyle(first, '::before'), PSEUDO_PROPS);
        entry.after = readStyle(getComputedStyle(first, '::after'), PSEUDO_PROPS);
      }
    }
    els[sel] = entry;
  });

  var snap = {
    version: 1,
    url: normUrl(location.hash.replace(/\?.*$/, function (q) { return q.replace(/=[^&]*/g, '=:id'); })),
    innerWidth: window.innerWidth,
    htmlClasses: Array.prototype.slice.call(document.documentElement.classList).sort(),
    vars: vars,
    els: els
  };
  window.__lfxSnapshot = snap;
  return JSON.stringify(snap);
})()
