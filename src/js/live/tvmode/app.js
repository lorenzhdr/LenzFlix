// TV-Modus · App: Gerüst, Root-Modifier, matchMedia, Tabs, Verdrahtung aller Komponenten (Vertrag: docs/tvmode.md).
// createApp(host, { scheduler, ctl, video, pip, deps, opts, canvas }) →
//   { model, ctl, setPip(active), setOverlay(partial|null), slot(), suspend(), resume(newHost), refresh(), isInfoOpen(), dispose() }
// Importiert nur Dateien aus src/js/live/.
import * as M from './model.js';
import { createDetails } from './details.js';
import { createFullscreen } from '../ui/fullscreen.js';
import { createKeys } from './keys.js';
import { createInfo } from './info.js';
import { createPlayerView } from './player-view.js';
import { createChannelList } from './channel-list.js';
import { createEpgGrid } from './epg-grid.js';
import { createInfoCard } from './info-card.js';

const PHONE_Q = '(max-width: 799px)';
const LAND_Q = '(orientation: landscape) and (max-height: 500px)';
const TOAST_MS = 3500;

/** Modell mit gebundenem Scheduler (ohne erstes Argument). */
export function bindModel(scheduler) {
  return {
    nowAll: (t) => M.nowAll(scheduler, t),
    gridRows: (o) => M.gridRows(scheduler, o),
    describe: (no, entry, t, o) => M.describe(scheduler, no, entry, t, o),
    nextProgram: (no, entry) => M.nextProgram(scheduler, no, entry),
    titleOf: (entry) => M.titleOf(scheduler, entry),
    days: (t) => M.days(t),
    kindOf: M.kindOf,
    channels: (D) => scheduler.channels(D),
    item: (id) => (scheduler.item ? scheduler.item(id) : null),
  };
}

function mqOf(win, q) {
  try { return win && typeof win.matchMedia === 'function' ? win.matchMedia(q) : null; } catch { return null; }
}
function listen(mq, fn) {
  if (!mq) return () => {};
  if (typeof mq.addEventListener === 'function') { mq.addEventListener('change', fn); return () => mq.removeEventListener('change', fn); }
  if (typeof mq.addListener === 'function') { mq.addListener(fn); return () => mq.removeListener(fn); }
  return () => {};
}

export function createApp(host, { scheduler, ctl, video, pip = null, deps = {}, opts = {}, canvas = null } = {}) {
  let root = host;
  const doc = host.ownerDocument || document;
  const win = doc.defaultView || window;
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
  const getNow = () => now();
  const model = bindModel(scheduler);
  const details = createDetails({ deps });

  const cls = {}; // Name → Boolean (an den Root gespiegelt, auch beim Umhängen)
  let overlay = null;
  let paused = false;
  let destroyed = false;
  let tab = 'now';
  let toastTimer = null;
  const offs = [];
  const digitSubs = new Set();

  const setCls = (name, on) => { on = !!on; cls[name] = on; if (root) root.classList.toggle(name, on); };
  const applyAll = () => { for (const k of Object.keys(cls)) root.classList.toggle(k, cls[k]); };

  const mk = (tag, c, text) => {
    const e = doc.createElement(tag);
    if (c) e.className = c;
    if (text != null) e.textContent = text;
    return e;
  };

  // ---------- Gerüst ----------
  const stage = mk('div', 'lfx-tvm__stage');
  const main = mk('div', 'lfx-tvm__main');
  const side = mk('div', 'lfx-tvm__side');
  const tabs = mk('div', 'lfx-tvm__tabs');
  tabs.setAttribute('role', 'tablist');
  const tabNow = mk('button', 'lfx-tvm__tab lfx-tvm__tab--now', 'Jetzt im TV');
  const tabEpg = mk('button', 'lfx-tvm__tab lfx-tvm__tab--epg', 'Programm');
  for (const b of [tabNow, tabEpg]) { b.type = 'button'; b.setAttribute('role', 'tab'); }
  tabs.append(tabNow, tabEpg);
  const toast = mk('div', 'lfx-tvm__toast');
  toast.setAttribute('role', 'status');

  const digits = { on(fn) { digitSubs.add(fn); return () => digitSubs.delete(fn); } };

  const showToast = (text) => {
    if (destroyed || !text) return;
    toast.textContent = text;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), TOAST_MS);
  };

  // Komponenten
  const base = { doc, ctl, model, deps };
  const common = { phone: !!opts.phone, touch: !!opts.touch, getNow, details };

  let fullscreen = null; // { toggle, enter, exit, active, isOn }
  const fsProxy = {
    toggle: () => fullscreen && fullscreen.toggle(),
    enter: () => fullscreen && fullscreen.enter(),
    exit: () => fullscreen && fullscreen.exit(),
    active: () => !!(fullscreen && fullscreen.isOn()),
    isOn: () => !!(fullscreen && fullscreen.isOn()),
  };

  let infoCard = null;
  const onInfo = (...a) => { if (infoCard && typeof infoCard.open === 'function') infoCard.open(...a); };

  const playerView = createPlayerView({ ...base, opts: { ...common, video, pip, digits, fullscreen: fsProxy, onInfo } });
  const info = createInfo({ ...base, opts: common });
  const list = createChannelList({ ...base, opts: { ...common, onInfo } });
  const epg = createEpgGrid({ ...base, opts: { ...common, onInfo } });
  infoCard = createInfoCard({ ...base, opts: { ...common, onInfo } });
  const comps = [playerView, info, list, epg, infoCard];

  const playerEl = playerView.el;
  playerEl.classList.add('lfx-tvm__player');
  info.el.classList.add('lfx-tvm__info');
  list.el.classList.add('lfx-tvm__list');
  epg.el.classList.add('lfx-tvm__epg');
  infoCard.el.classList.add('lfx-tvm__infocard');

  main.append(playerEl, info.el);
  side.append(tabs, list.el);
  stage.append(main, side, epg.el);
  const slotOf = () => root.querySelector('.lfx-tvm__video-slot');
  const content = [stage, infoCard.el, toast];
  root.append(...content);
  if (canvas) {
    canvas.classList.add('lfx-tvm__fake');
    const slot = slotOf();
    if (slot) slot.append(canvas);
  }

  fullscreen = createFullscreen({
    target: playerEl,
    doc,
    onChange: (on) => { setCls('is-fullscreen', on); },
  });

  // ---------- Tabs ----------
  function revealEpg() {
    if (typeof epg.reveal === 'function') { try { epg.reveal(); } catch { /* egal */ } }
  }
  function setTab(name) {
    const was = tab;
    tab = name === 'epg' ? 'epg' : 'now';
    setCls('is-tab-now', tab === 'now');
    setCls('is-tab-epg', tab === 'epg');
    for (const [b, n] of [[tabNow, 'now'], [tabEpg, 'epg']]) {
      b.classList.toggle('is-active', tab === n);
      b.setAttribute('aria-selected', tab === n ? 'true' : 'false');
      b.tabIndex = tab === n ? 0 : -1;
    }
    if (tab === 'epg' && was !== 'epg') revealEpg(); // Handy: beim Wechsel auf „Programm“ zur Uhrzeit scrollen
  }
  tabNow.addEventListener('click', () => { setTab('now'); try { list.update(shown()); } catch { /* egal */ } });
  tabEpg.addEventListener('click', () => setTab('epg'));
  tabs.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      setTab(tab === 'now' ? 'epg' : 'now');
      (tab === 'now' ? tabNow : tabEpg).focus();
    }
  });
  setTab('now');

  // ---------- Layout-Umschaltung ----------
  const mqPhone = mqOf(win, PHONE_Q);
  const mqLand = mqOf(win, LAND_Q);
  // Fehlender Kopfabstand: Jellyfin rückt <main> je nach Design schon unter die Kopfleiste ein (LENZFLIX/LENZ+), bei LENZPRIME
  // nicht. Darum Kopfhöhe minus Dokument-Oberkante des Roots messen und als --lfx-tvm-pad setzen (CSS-Fallback: volle Kopfhöhe).
  let padPx = -1;
  // Messelement: löst --lfx-tvm-head auch als calc() auf (LENZPRIME-Handy: „calc(0px + 52px)“ inkl. Safe-Area).
  const probe = mk('div', 'lfx-tvm__probe');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;top:0;left:0;width:0;height:var(--lfx-tvm-head);visibility:hidden;pointer-events:none';
  stage.append(probe);
  function measureHead() {
    if (!root || !root.isConnected) return;
    try {
      // Gesperrter Body (Info-Karte am Handy: position:fixed, scrollY = 0) liefert falsche Werte → nicht messen.
      const body = win.document && win.document.body;
      if (body && body.style.position === 'fixed') return;
      const head = probe.getBoundingClientRect().height || parseFloat(win.getComputedStyle(root).getPropertyValue('--lfx-tvm-head')) || 0;
      const top = root.getBoundingClientRect().top + (win.scrollY || win.pageYOffset || 0);
      const pad = Math.max(0, Math.round(head - top));
      if (pad !== padPx) { padPx = pad; root.style.setProperty('--lfx-tvm-pad', pad + 'px'); }
    } catch { /* ohne Layout (Tests) bleibt der CSS-Fallback */ }
  }
  function layout() {
    const p = !!opts.phone || !!(mqPhone && mqPhone.matches);
    setCls('is-phone', p);
    setCls('is-landscape', p && !!(mqLand && mqLand.matches));
    padPx = -1;
    measureHead();
  }
  offs.push(listen(mqPhone, layout), listen(mqLand, layout));
  const onResize = () => measureHead();
  win.addEventListener('resize', onResize);
  offs.push(() => win.removeEventListener('resize', onResize));
  layout();
  setCls('is-touch', !!opts.touch);

  // ---------- Snapshot-Verdrahtung ----------
  const shown = () => {
    const s = ctl.state();
    return overlay ? Object.freeze({ ...s, ...overlay }) : s;
  };
  function push() {
    if (destroyed || paused) return;
    const s = shown();
    setCls('is-on', s.on);
    setCls('is-playing', s.phase === 'playing');
    setCls('is-paused-card', s.phase === 'pause' || s.phase === 'closedown' || s.phase === 'error');
    setCls('is-error', s.phase === 'error');
    setCls('is-pip', !!(pip && pip.active()));
    for (const c of comps) { try { c.update(s); } catch { /* eine Komponente darf die anderen nicht stoppen */ } }
  }
  offs.push(ctl.on('change', push));
  offs.push(ctl.on('message', showToast));
  offs.push(ctl.on('tick', (t) => {
    if (destroyed || paused) return;
    measureHead();
    for (const c of comps) { try { c.tick(t); } catch { /* egal */ } }
  }));

  const makeKeys = () => createKeys({
    doc,
    root,
    ctl,
    fullscreen: fsProxy,
    now,
    blocked: () => paused || infoOpen() || (typeof deps.keysBlocked === 'function' && !!deps.keysBlocked()),
    onPreview: (text) => { for (const fn of [...digitSubs]) { try { fn(text); } catch { /* egal */ } } },
    toast: showToast,
  });
  let keys = makeKeys();
  function infoOpen() { return typeof infoCard.isOpen === 'function' ? !!infoCard.isOpen() : infoCard.el.classList.contains('is-open'); }

  push();
  revealEpg(); // Desktop: Raster ist sofort sichtbar → einmal zur aktuellen Uhrzeit

  return {
    model,
    ctl,
    slot: slotOf,
    isInfoOpen: infoOpen,
    refresh: push,
    setPip(active) {
      setCls('is-pip', active);
      if (!destroyed && !paused) push();
    },
    /** Debug: überlagert den Snapshot, der an die Komponenten geht (nie der Controller). */
    setOverlay(partial) {
      overlay = partial || null;
      push();
    },
    suspend() { paused = true; },
    resume(newHost) {
      if (destroyed) return;
      if (newHost && newHost !== root) {
        const old = root;
        for (const k of Object.keys(cls)) old.classList.remove(k);
        root = newHost;
        root.append(...content);
        keys.destroy();
        keys = makeKeys();
      }
      applyAll();
      layout();
      paused = false;
      push();
    },
    dispose() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(toastTimer);
      for (const off of offs) { try { off(); } catch { /* egal */ } }
      offs.length = 0;
      keys.destroy();
      try { fullscreen.destroy(); } catch { /* egal */ }
      for (const c of comps) { try { c.destroy(); } catch { /* egal */ } }
      details.dispose();
      for (const k of Object.keys(cls)) root.classList.remove(k);
      toast.remove();
      stage.remove();
    },
  };
}
