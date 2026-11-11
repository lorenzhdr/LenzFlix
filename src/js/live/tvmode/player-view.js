// TV-Modus · Player-Ansicht: Video-Slot, Zustandskarten, Zapp-Einblendung, Wischgesten, Bedienleiste.
// Vertrag: docs/tvmode.md („Player (F)“). Zustands-Modifier nur am eigenen Element .lfx-tvm__player.
// createPlayerView({ doc, ctl, model, deps, opts }) → { el, controls, update(snap), tick(t), destroy() }
// opts: video, pip, digits, fullscreen, getNow(); die Bedienleiste (controls.js) und das Ton-Menü baut diese Ansicht selbst ein.
import { channelName } from './model.js';
import { createChannelBadge } from './channel-list.js';
import { createControls } from './controls.js';

export const ZAP_MS = 4000;
export const CONTROLS_MS = 3000;
export const LOADING_DELAY_MS = 300;
export const SWIPE_PX = 50;
const DOUBLE_TAP_MS = 320;
const INTERACTIVE = 'button, input, a, .lfx-tvm__controls, .lfx-tvm__menu, .lfx-tvm__card, .lfx-tvm__pip-card, .lfx-tvm__unmute, .lfx-tvm__tap';

export function createPlayerView({ doc = document, ctl, model = null, opts = {} } = {}) {
  const pip = opts.pip || null;
  const now = () => (typeof opts.getNow === 'function' ? opts.getNow() : Date.now());
  const mk = (tag, cls, parent) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  };

  const el = mk('div', 'lfx-tvm__player');
  const slot = mk('div', 'lfx-tvm__video-slot', el);

  const loading = mk('div', 'lfx-tvm__loading', el);
  loading.hidden = true;
  loading.setAttribute('role', 'status');
  mk('span', 'lfx-tvm__spinner', loading);
  mk('span', 'lfx-tvm__loading-text', loading).textContent = 'Sendersuchlauf';

  const banner = mk('div', 'lfx-tvm__banner', el);
  banner.hidden = true;

  const cardHost = mk('div', 'lfx-tvm__card-host', el);

  const pipCard = mk('div', 'lfx-tvm__pip-card', el);
  pipCard.hidden = true;
  mk('div', 'lfx-tvm__pip-card-text', pipCard).textContent = 'Läuft im Bild-in-Bild';
  const pipBack = mk('button', 'lfx-tvm__btn lfx-tvm__btn--pip-back', pipCard);
  pipBack.type = 'button';
  pipBack.textContent = 'Zurückholen';

  const unmute = mk('button', 'lfx-tvm__unmute', el);
  unmute.type = 'button';
  unmute.hidden = true;
  unmute.textContent = 'Ton an';

  const tap = mk('button', 'lfx-tvm__tap', el);
  tap.type = 'button';
  tap.hidden = true;
  tap.textContent = 'Zum Starten tippen';

  const zap = mk('div', 'lfx-tvm__zap', el);
  zap.setAttribute('aria-hidden', 'true');
  const zapHead = mk('div', 'lfx-tvm__zap-head', zap);
  const zapNo = mk('span', 'lfx-tvm__zap-no', zapHead);
  const zapName = mk('span', 'lfx-tvm__zap-name', zapHead);
  const zapTime = mk('div', 'lfx-tvm__zap-time', zapHead);
  const zapBody = mk('div', 'lfx-tvm__zap-body', zap);
  const zapTitle = mk('div', 'lfx-tvm__zap-title', zapBody);
  const zapSub = mk('div', 'lfx-tvm__zap-sub', zapBody);
  const zapFill = mk('div', 'lfx-tvm__zap-fill', mk('div', 'lfx-tvm__zap-bar', zap));

  const digitsEl = mk('div', 'lfx-tvm__digits', el);
  digitsEl.hidden = true;
  digitsEl.setAttribute('role', 'status');

  const controls = createControls({ doc, ctl, opts: { ...opts, onInteract: () => armControlsHide() } });
  el.append(controls.el, controls.menu.el);

  let alive = true;
  let snap = null;
  let wasOn = false;
  let shownChannel = null;
  let channelObj = null;
  let cardKey = '';
  let lastTouchAt = 0;
  let lastTapAt = 0;
  let zapTimer = 0;
  let controlsTimer = 0;
  let loadingTimer = 0;
  let loadingShown = false;
  const cleanups = [];
  const on = (t, type, fn, o) => {
    t.addEventListener(type, fn, o);
    cleanups.push(() => t.removeEventListener(type, fn, o));
  };

  // ---- Video ----
  function attachVideo() {
    const v = opts.video;
    if (!v || (pip && pip.active && pip.active())) return;
    if (v.parentNode !== slot) slot.appendChild(v);
    v.classList.add('lfx-tvm__video');
  }
  attachVideo();

  // ---- Bild-in-Bild ----
  function syncPip() {
    const act = !!(pip && pip.active && pip.active());
    el.classList.toggle('is-pip', act);
    pipCard.hidden = !act;
    if (!act) attachVideo();
  }
  if (pip && typeof pip.on === 'function') {
    const off = pip.on(syncPip);
    if (typeof off === 'function') cleanups.push(off);
  }
  on(pipBack, 'click', () => {
    if (pip && pip.exit) pip.exit();
  });
  on(unmute, 'click', () => ctl.gesture());
  on(tap, 'click', () => ctl.gesture());

  // ---- Ziffern ----
  if (opts.digits && typeof opts.digits.on === 'function') {
    const off = opts.digits.on((text) => {
      digitsEl.textContent = text || '';
      digitsEl.hidden = !text;
    });
    if (typeof off === 'function') cleanups.push(off);
  }

  // ---- Ladezustand (Spinner erst nach 300 ms) ----
  function syncLoading(phase) {
    const isLoading = phase === 'loading';
    el.classList.toggle('is-loading', isLoading);
    if (isLoading) {
      if (!loadingTimer && !loadingShown) {
        loadingTimer = setTimeout(() => {
          loadingTimer = 0;
          loadingShown = true;
          loading.hidden = false;
        }, LOADING_DELAY_MS);
      }
    } else {
      clearTimeout(loadingTimer);
      loadingTimer = 0;
      loadingShown = false;
      loading.hidden = true;
    }
  }

  // ---- Zustandskarten ----
  function renderCard(card, needsTap) {
    const key = card ? JSON.stringify(card) : '';
    if (key === cardKey) return;
    cardKey = key;
    cardHost.textContent = '';
    if (!card) return;
    const c = mk('div', `lfx-tvm__card lfx-tvm__card--${card.kind}`, cardHost);
    const title = mk('div', 'lfx-tvm__card-title', c);
    const text = mk('div', 'lfx-tvm__card-text', c);
    let title_ = '';
    let text_ = '';
    if (card.kind === 'next') title_ = `Gleich: ${card.title} · ${card.at}`;
    else if (card.kind === 'pause') title_ = card.text || 'Gleich geht es weiter';
    else if (card.kind === 'closedown') {
      title_ = card.text || 'Sendepause';
      text_ = card.until ? `Weiter um ${card.until}` : '';
    } else if (card.kind === 'empty') title_ = card.text || 'Auf diesem Sender läuft gerade nichts';
    else if (card.kind === 'error') {
      title_ = card.title || 'Fehler';
      text_ = card.sub || '';
    }
    title.textContent = title_;
    text.textContent = text_;
    text.hidden = !text_;
    if (card.kind === 'error') {
      c.setAttribute('role', 'alert');
      const act = mk('div', 'lfx-tvm__card-actions', c);
      const b = mk('button', 'lfx-tvm__btn lfx-tvm__btn--primary', act);
      b.type = 'button';
      if (card.reason === 'gesture' || needsTap) {
        c.classList.add('lfx-tvm__card--tap');
        b.textContent = 'Zum Starten tippen';
        b.addEventListener('click', () => ctl.gesture());
      } else {
        b.textContent = 'Erneut versuchen';
        b.addEventListener('click', () => ctl.retry());
      }
    }
  }

  // ---- Zapp-Einblendung ----
  function describeNow(s) {
    if (!model || !s.entry) return null;
    try {
      return model.describe(s.channel, s.entry, now());
    } catch {
      return null;
    }
  }
  function findChannel(no) {
    if (!model || !model.nowAll) return null;
    try {
      const row = model.nowAll(now()).find((r) => r.channel && r.channel.no === no);
      return row ? row.channel : null;
    } catch {
      return null;
    }
  }
  function renderZap() {
    if (!snap) return;
    const no = snap.channel;
    if (!channelObj || channelObj.no !== no) channelObj = findChannel(no) || { no };
    zapNo.textContent = String(no);
    zapName.replaceChildren(createChannelBadge(doc, channelObj));
    zapName.setAttribute('title', channelName(channelObj));
    const d = describeNow(snap);
    zapTitle.textContent = d ? d.title : '';
    zapSub.textContent = d ? d.sub || '' : '';
    zapSub.hidden = !(d && d.sub);
    zapTime.textContent = d ? d.time || '' : '';
    zapFill.style.width = `${Math.round((d ? d.progress : 0) * 100)}%`;
  }
  function showZap() {
    if (!alive) return;
    renderZap();
    el.classList.add('is-zapping');
    clearTimeout(zapTimer);
    zapTimer = setTimeout(() => {
      zapTimer = 0;
      el.classList.remove('is-zapping');
    }, ZAP_MS);
  }

  // ---- Bedienleiste ein-/ausblenden ----
  function controlsPinned() {
    return controls.isMenuOpen() || controls.el.contains(doc.activeElement);
  }
  function armControlsHide() {
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(function hide() {
      controlsTimer = 0;
      if (controlsPinned()) {
        controlsTimer = setTimeout(hide, CONTROLS_MS);
        return;
      }
      el.classList.remove('is-controls');
    }, CONTROLS_MS);
  }
  function showControls() {
    if (!alive) return;
    el.classList.add('is-controls');
    armControlsHide();
    if (!el.classList.contains('is-zapping')) showZap();
    else showZapKeepTimer();
  }
  function showZapKeepTimer() {
    clearTimeout(zapTimer);
    zapTimer = setTimeout(() => {
      zapTimer = 0;
      el.classList.remove('is-zapping');
    }, ZAP_MS);
  }
  function hideControls() {
    clearTimeout(controlsTimer);
    controlsTimer = 0;
    if (controlsPinned()) return;
    el.classList.remove('is-controls');
  }

  // ---- Zeigergesten ----
  // touch-action: pan-x (CSS, nur im Player): der Browser behält das horizontale Wischen, senkrechte Gesten
  // kommen als Pointer-Events bei uns an und lösen das Zappen aus, ohne dass die Seite scrollt.
  let swipe = null;
  const isInteractive = (t) => !!(t && t.closest && t.closest(INTERACTIVE));
  function onPointerDown(e) {
    if (e.pointerType !== 'touch' || isInteractive(e.target)) {
      swipe = null;
      return;
    }
    swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }
  function onPointerUp(e) {
    const interactive = isInteractive(e.target);
    if (e.pointerType === 'touch') {
      lastTouchAt = Date.now();
      const s = swipe;
      swipe = null;
      if (!s || interactive) {
        if (interactive && el.classList.contains('is-controls')) armControlsHide();
        return;
      }
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dy) >= SWIPE_PX && Math.abs(dy) > Math.abs(dx)) {
        ctl.zap(dy < 0 ? 1 : -1);
        return;
      }
      if (Math.abs(dy) > 10 || Math.abs(dx) > 10) return; // Wischen in andere Richtung: nichts auslösen
      const t = Date.now();
      if (t - lastTapAt < DOUBLE_TAP_MS) {
        lastTapAt = 0;
        if (opts.fullscreen) opts.fullscreen.toggle();
        showControls();
        return;
      }
      lastTapAt = t;
      if (el.classList.contains('is-controls')) hideControls();
      else showControls();
      return;
    }
    if (!interactive) showControls();
  }
  function onPointerCancel() {
    swipe = null;
  }
  function onPointerMove(e) {
    if (e.pointerType === 'touch') return;
    if (!el.classList.contains('is-controls')) showControls();
    else armControlsHide();
  }
  function onDblClick(e) {
    if (Date.now() - lastTouchAt < 700 || isInteractive(e.target)) return;
    if (opts.fullscreen) opts.fullscreen.toggle();
  }
  function onFocusIn() {
    if (controls.el.contains(doc.activeElement)) {
      el.classList.add('is-controls');
      armControlsHide();
    }
  }
  on(el, 'pointerdown', onPointerDown);
  on(el, 'pointerup', onPointerUp);
  on(el, 'pointercancel', onPointerCancel);
  on(el, 'pointermove', onPointerMove);
  on(el, 'dblclick', onDblClick);
  on(el, 'focusin', onFocusIn);

  // ---- Komponenten-API ----
  function update(s) {
    if (!alive || !s) return;
    snap = s;
    attachVideo();
    syncPip();
    syncLoading(s.phase);
    el.classList.toggle('is-muted', !!s.muted);

    renderCard(s.card, s.needsTap);
    const cardTap = !!(s.card && s.card.kind === 'error' && cardHost.querySelector('.lfx-tvm__card--tap'));
    tap.hidden = !(s.needsTap && !cardTap);
    unmute.hidden = !s.mutedByPolicy;
    banner.hidden = !s.banner;
    banner.textContent = s.banner || '';

    if (s.on && (!wasOn || s.channel !== shownChannel)) {
      shownChannel = s.channel;
      showZap();
    } else if (s.on && el.classList.contains('is-zapping')) {
      renderZap(); // Vorschau-Eintrag kann sich beim Entprellen ändern
    }
    if (!s.on) shownChannel = null;
    wasOn = !!s.on;
    controls.update(s);
  }

  function tick() {
    if (!alive || !snap || !el.classList.contains('is-zapping')) return;
    const d = describeNow(snap);
    if (d) zapFill.style.width = `${Math.round(d.progress * 100)}%`;
  }

  syncPip();

  return {
    el,
    controls,
    update,
    tick,
    destroy() {
      if (!alive) return;
      alive = false;
      clearTimeout(zapTimer);
      clearTimeout(controlsTimer);
      clearTimeout(loadingTimer);
      cleanups.splice(0).forEach((fn) => fn());
      controls.destroy();
      const v = opts.video;
      if (v && v.parentNode === slot) slot.removeChild(v);
      el.remove();
    },
  };
}
