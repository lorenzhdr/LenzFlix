// TV-Modus · Info-Karte zu einer Sendung (Dialog, am Handy Bottom-Sheet über .is-phone). Vertrag: docs/tvmode.md („Info-Karte (G)“).
// createInfoCard({ doc, ctl, model, deps, opts }) → { el, open({ no, entry }), close(), isOpen(), update(snap), tick(t), destroy() }.
// opts: details (createDetails-Instanz), getNow(). Importiert nur Dateien aus src/js/live/.
import { broadcastDayOf, formatDay, offsetMs } from '../schedule/time.js';
import { createThumb } from './thumb.js';
import { channelName as nameOf } from './model.js';

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function createInfoCard({ doc, ctl, model, deps = {}, opts = {} }) {
  const getNow = typeof opts.getNow === 'function' ? opts.getNow : () => Date.now();
  const details = opts.details || null;

  const el = doc.createElement('div');
  el.className = 'lfx-tvm__infocard';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'lfx-tvm-infocard-title');
  el.hidden = true;

  const backdrop = doc.createElement('div');
  backdrop.className = 'lfx-tvm__infocard-backdrop';
  const box = doc.createElement('div');
  box.className = 'lfx-tvm__infocard-box';
  const imgHost = doc.createElement('div');
  imgHost.className = 'lfx-tvm__infocard-img';
  const thumb = createThumb({ doc, deps, maxWidth: 960 });
  imgHost.append(thumb.el);
  const chanEl = doc.createElement('div');
  chanEl.className = 'lfx-tvm__infocard-chan';
  const titleEl = doc.createElement('h2');
  titleEl.className = 'lfx-tvm__infocard-title';
  titleEl.id = 'lfx-tvm-infocard-title';
  const subEl = doc.createElement('div');
  subEl.className = 'lfx-tvm__infocard-sub';
  const timeEl = doc.createElement('div');
  timeEl.className = 'lfx-tvm__infocard-time';
  const metaEl = doc.createElement('div');
  metaEl.className = 'lfx-tvm__infocard-meta';
  const badgesEl = doc.createElement('div');
  badgesEl.className = 'lfx-tvm__badges';
  const textEl = doc.createElement('p');
  textEl.className = 'lfx-tvm__infocard-text';
  const actions = doc.createElement('div');
  actions.className = 'lfx-tvm__infocard-actions';
  const closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'lfx-tvm__infocard-close';
  closeBtn.setAttribute('aria-label', 'Schließen');
  closeBtn.textContent = '×';
  box.append(imgHost, chanEl, titleEl, subEl, timeEl, metaEl, badgesEl, textEl, actions, closeBtn);
  el.append(backdrop, box);

  let alive = true;
  let opened = false;
  let target = null; // { no, entry }
  let info = null; // describe-Ergebnis
  let running = false;
  let trigger = null;

  function btn(label, cls, fn) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = `lfx-tvm__btn ${cls}`;
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  function isRunning(t) {
    return !!target && target.entry.start <= t && t < target.entry.end;
  }

  function renderActions() {
    actions.replaceChildren();
    if (!target) return;
    const { no } = target;
    if (running) {
      actions.append(btn('Jetzt einschalten', 'lfx-tvm__btn--primary lfx-tvm__btn--tune', () => {
        close();
        ctl.tune(no, { immediate: true });
      }));
    }
    const id = info && info.itemId;
    if (id == null) return;
    actions.append(btn('Details', `lfx-tvm__btn--details${running ? '' : ' lfx-tvm__btn--primary'}`, () => {
      close();
      if (typeof deps.openDetails === 'function') deps.openDetails(id);
    }));
    actions.append(btn('In der Mediathek ansehen', 'lfx-tvm__btn--ghost lfx-tvm__btn--library', () => {
      close();
      ctl.stop();
      if (typeof deps.playFromStart === 'function') deps.playFromStart(id);
    }));
  }

  function renderText() {
    if (!info) return;
    const id = info.itemId;
    let text = info.overview;
    if (!text && id != null && details) text = details.get(id);
    textEl.classList.remove('is-loading', 'is-empty');
    if (id == null) {
      textEl.textContent = '';
      textEl.hidden = true;
      return;
    }
    textEl.hidden = false;
    if (text) textEl.textContent = text;
    else if (text === undefined && details && typeof deps.itemDetails === 'function') {
      textEl.textContent = 'Inhaltsangabe wird geladen …';
      textEl.classList.add('is-loading');
    } else if (text === '') {
      textEl.textContent = 'Keine Inhaltsangabe vorhanden.';
      textEl.classList.add('is-empty');
    } else {
      textEl.textContent = '';
      textEl.hidden = true;
    }
  }

  function channelName(no, D) {
    try {
      const c = typeof model.channels === 'function' ? model.channels(D).find((x) => x.no === no) : null;
      if (c) { const n = nameOf(c); if (n) return n; }
    } catch { /* egal */ }
    return `Sender ${no}`;
  }

  function render(t) {
    const { no, entry } = target;
    info = model.describe(no, entry, t, { overviews: details ? details.map() : undefined });
    const D = broadcastDayOf(entry.start);
    // Kalendertag des Beginns (01:35 in der Nacht gehört zum neuen Datum), nicht der Sendetag ab 05:00
    const f = formatDay(Math.floor((entry.start + offsetMs(entry.start)) / 864e5));
    chanEl.textContent = `${no} · ${channelName(no, D)}`;
    titleEl.textContent = info.title;
    subEl.textContent = info.sub;
    subEl.hidden = !info.sub;
    timeEl.textContent = `${f.weekday} ${f.date} · ${info.time}`;
    const meta = [];
    if (info.year) meta.push(String(info.year));
    if (info.runMin) meta.push(`${info.runMin} Min.`);
    if (info.genres && info.genres.length) meta.push(info.genres.join(', '));
    metaEl.textContent = meta.join(' · ');
    metaEl.hidden = meta.length === 0;
    badgesEl.replaceChildren();
    for (const b of info.badges || []) {
      const s = doc.createElement('span');
      s.className = 'lfx-tvm__badge';
      s.textContent = b;
      badgesEl.append(s);
    }
    badgesEl.hidden = !(info.badges && info.badges.length);
    thumb.set(info.imageItemId, no);
    if (info.itemId != null && details) details.request(info.itemId);
    renderText();
    running = isRunning(t);
    renderActions();
  }

  function focusables() {
    return [...box.querySelectorAll(FOCUSABLE)].filter((n) => !n.hidden);
  }

  function onKeydown(e) {
    if (!opened) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const f = focusables();
      if (!f.length) {
        e.preventDefault();
        return;
      }
      const first = f[0];
      const last = f[f.length - 1];
      const a = doc.activeElement;
      if (e.shiftKey && (a === first || !box.contains(a))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (a === last || !box.contains(a))) { e.preventDefault(); first.focus(); }
    }
  }

  function close() {
    if (!opened) return;
    opened = false;
    el.classList.remove('is-open');
    el.hidden = true;
    target = null;
    info = null;
    const back = trigger;
    trigger = null;
    if (back && back.isConnected && typeof back.focus === 'function') back.focus();
  }

  const offDetails = details && typeof details.on === 'function'
    ? details.on((id) => {
        if (opened && info && info.itemId === id) renderText();
      })
    : null;

  const onBackdrop = () => close();
  backdrop.addEventListener('click', onBackdrop);
  closeBtn.addEventListener('click', close);
  el.addEventListener('keydown', onKeydown);

  return {
    el,
    open(next) {
      if (!alive || !next || !next.entry) return;
      if (!opened) trigger = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null;
      target = { no: next.no, entry: next.entry };
      opened = true;
      el.hidden = false;
      render(getNow());
      el.classList.add('is-open');
      const f = focusables();
      const first = f.find((n) => n !== closeBtn) || closeBtn;
      first.focus();
    },
    close,
    isOpen: () => opened,
    update() {},
    tick(t) {
      if (!alive || !opened || !target) return;
      const r = isRunning(t);
      if (r !== running) {
        running = r;
        renderActions();
      }
    },
    destroy() {
      alive = false;
      opened = false;
      if (offDetails) offDetails();
      backdrop.removeEventListener('click', onBackdrop);
      closeBtn.removeEventListener('click', close);
      el.removeEventListener('keydown', onKeydown);
      thumb.destroy();
      trigger = null;
      el.remove();
    },
  };
}
