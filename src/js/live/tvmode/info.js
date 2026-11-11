// TV-Modus · Info unter dem Player (Vertrag: docs/tvmode.md „Info unter dem Player“).
// createInfo({ doc, ctl, model, deps, opts }) → { el, update(snap), tick(t), destroy() }
//   opts: { details (createDetails-Instanz), pip (pip.js), getNow() }
// Knöpfe: [Von vorne] (TV stoppen, dann deps.playFromStart), [Details] (deps.openDetails), [Bild-in-Bild] (opts.pip.toggle()).
import { broadcastDayOf, formatClock } from '../schedule/time.js';
import { channelName } from './model.js';
import { createChannelBadge } from './channel-list.js';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const SVG_NS = 'http://www.w3.org/2000/svg';
// Kleine Icons für die Knopfzeile (nur sichtbar, wenn die Zeile zu schmal ist: .is-compact)
const ICONS = {
  restart: 'M12 5V2L7 6.5 12 11V8a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8Z',
  details: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z',
  pip: 'M19 7H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Zm0 10h-6v-4h6v4Z',
};

export function createInfo({ doc = document, ctl, model, deps = {}, opts = {} } = {}) {
  const getNow = typeof opts.getNow === 'function' ? opts.getNow : () => Date.now();
  const details = opts.details || null;
  const pip = opts.pip || null;
  const offs = [];
  let snap = null;
  let key = '';
  let destroyed = false;

  const mk = (tag, cls, text) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const btn = (cls, text, icon) => {
    const b = mk('button', `lfx-tvm__btn ${cls}`);
    b.type = 'button';
    b.setAttribute('aria-label', text);
    if (icon) {
      const ico = mk('span', 'lfx-tvm__btn-ico');
      ico.setAttribute('aria-hidden', 'true');
      const svg = doc.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '18');
      svg.setAttribute('height', '18');
      const path = doc.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', ICONS[icon]);
      path.setAttribute('fill', 'currentColor');
      svg.append(path);
      ico.append(svg);
      b.append(ico);
    }
    b.append(mk('span', 'lfx-tvm__btn-label', text));
    return b;
  };

  const el = mk('div', 'lfx-tvm__info');
  el.setAttribute('aria-live', 'off');

  const head = mk('div', 'lfx-tvm__info-head');
  const noEl = mk('span', 'lfx-tvm__info-no');
  const badgeHost = mk('span', 'lfx-tvm__info-badge');
  head.setAttribute('role', 'group');
  head.append(noEl, badgeHost);

  const titleEl = mk('h2', 'lfx-tvm__info-title');
  const subEl = mk('div', 'lfx-tvm__info-sub');
  const timeEl = mk('div', 'lfx-tvm__info-time');
  const bar = mk('div', 'lfx-tvm__info-bar');
  const fill = mk('div', 'lfx-tvm__info-fill');
  bar.append(fill);
  const metaEl = mk('div', 'lfx-tvm__info-meta');
  const badgesEl = mk('div', 'lfx-tvm__badges');
  metaEl.append(timeEl, badgesEl);
  const textEl = mk('p', 'lfx-tvm__info-text');
  const moreBtn = mk('button', 'lfx-tvm__info-more', 'Mehr');
  moreBtn.type = 'button';
  moreBtn.setAttribute('aria-expanded', 'false');
  const nextEl = mk('div', 'lfx-tvm__info-next');
  const actions = mk('div', 'lfx-tvm__info-actions');
  const restartBtn = btn('lfx-tvm__btn--primary lfx-tvm__btn--restart', 'Von vorne', 'restart');
  const detailsBtn = btn('lfx-tvm__btn--ghost lfx-tvm__btn--details', 'Details', 'details');
  const pipBtn = btn('lfx-tvm__btn--ghost lfx-tvm__btn--info-pip', 'Bild-in-Bild', 'pip');
  actions.append(restartBtn, detailsBtn, pipBtn);
  el.append(head, titleEl, subEl, metaEl, bar, textEl, moreBtn, nextEl, actions);

  // „Mehr“ nur zeigen, wenn der Text abgeschnitten ist (oder gerade aufgeklappt); ohne Layout (jsdom) bleibt er sichtbar.
  function syncMore() {
    if (destroyed) return;
    if (!textEl.textContent) { moreBtn.hidden = true; return; }
    const open = el.classList.contains('is-expanded');
    const measurable = textEl.clientHeight > 0;
    moreBtn.hidden = !open && measurable && textEl.scrollHeight <= textEl.clientHeight + 1;
  }
  // Knopfzeile: reicht der Platz nicht, bleiben nur die Icons (aria-label steht immer)
  function fitActions() {
    if (destroyed) return;
    actions.classList.remove('is-compact');
    if (actions.clientWidth > 0 && actions.scrollWidth > actions.clientWidth + 1) actions.classList.add('is-compact');
  }
  const toggleMore = () => {
    const open = !el.classList.contains('is-expanded');
    el.classList.toggle('is-expanded', open);
    moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    moreBtn.textContent = open ? 'Weniger' : 'Mehr';
    syncMore();
  };
  moreBtn.addEventListener('click', toggleMore);

  restartBtn.addEventListener('click', () => {
    const target = ctl.restartTarget();
    if (!target || !target.itemId) return;
    ctl.stop(); // das TV stoppt zuerst, dann startet der Jellyfin-Player
    if (typeof deps.playFromStart === 'function') deps.playFromStart(target.itemId);
  });
  detailsBtn.addEventListener('click', () => {
    const target = ctl.restartTarget();
    if (!target || !target.itemId) return;
    if (typeof deps.openDetails === 'function') deps.openDetails(target.itemId);
  });
  pipBtn.addEventListener('click', () => { if (pip) pip.toggle(); });

  function channelOf(no, t) {
    try {
      const list = model.channels(broadcastDayOf(t));
      return list.find((c) => c.no === no) || null;
    } catch { return null; }
  }

  function setText(d) {
    const raw = d.overview || (details && d.itemId != null ? details.get(d.itemId) : '') || '';
    textEl.textContent = raw;
    el.classList.toggle('has-text', !!raw);
  }

  function render() {
    if (destroyed || !snap) return;
    const entry = snap.entry;
    el.classList.toggle('is-empty', !entry);
    if (!entry) {
      key = '';
      for (const b of [restartBtn, detailsBtn]) b.disabled = true;
      pipBtn.hidden = !(pip && pip.supported());
      return;
    }
    const t = getNow();
    const no = snap.channel;
    const ch = channelOf(no, t);
    const d = model.describe(no, entry, t, { overviews: details ? details.map() : undefined });
    const k = `${no}|${entry.start}|${entry.itemId}|${d.overview ? 1 : 0}`;
    if (k !== key) {
      key = k;
      noEl.textContent = String(no);
      badgeHost.replaceChildren(createChannelBadge(doc, ch || { no }));
      head.setAttribute('aria-label', `Sender ${no}${ch ? `, ${channelName(ch)}` : ''}`);
      titleEl.textContent = d.title;
      subEl.textContent = d.sub;
      subEl.hidden = !d.sub;
      timeEl.textContent = d.time.replace('–', ' – ');
      const parts = [...d.badges, ...d.genres.slice(0, 3)];
      if (d.year) parts.push(String(d.year));
      badgesEl.textContent = '';
      for (const p of parts) badgesEl.append(mk('span', 'lfx-tvm__badge', p));
      badgesEl.hidden = !parts.length;
      if (details && d.itemId != null && d.kind === 'program') details.request(d.itemId);
      const nx = model.nextProgram(no, entry);
      if (nx) {
        const nt = model.titleOf(nx).title;
        nextEl.textContent = nt ? `Danach: ${nt} · ${formatClock(nx.start)}` : '';
      } else nextEl.textContent = '';
      nextEl.hidden = !nextEl.textContent;
    }
    setText(d);
    syncMore();
    fill.style.width = `${(d.progress * 100).toFixed(1)}%`;
    const target = ctl.restartTarget();
    const can = !!(target && target.itemId) && d.kind === 'program';
    restartBtn.disabled = !can;
    detailsBtn.disabled = !can;
    restartBtn.hidden = !can && (d.kind === 'filler' || d.kind === 'closedown');
    detailsBtn.hidden = restartBtn.hidden;
    pipBtn.hidden = !(pip && pip.supported());
    fitActions();
  }

  if (details) offs.push(details.on(() => render()));

  return {
    el,
    update(s) { snap = s; render(); },
    tick(t) {
      if (destroyed || !snap || !snap.entry) return;
      syncMore();
      fitActions();
      const e = snap.entry;
      fill.style.width = `${(clamp((t - e.start) / Math.max(1, e.end - e.start), 0, 1) * 100).toFixed(1)}%`;
    },
    destroy() {
      destroyed = true;
      for (const off of offs) { try { off(); } catch { /* egal */ } }
      offs.length = 0;
      el.remove();
    },
  };
}
