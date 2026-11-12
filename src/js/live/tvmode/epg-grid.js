// TV-Modus · Programm-Raster (Tagesauswahl, „Jetzt“, Zeitleiste, 18 Senderzeilen). Vertrag: docs/tvmode.md („Programm-Raster (G)“).
// createEpgGrid({ doc, ctl, model, deps, opts }) → { el, update(snap), tick(t), destroy() }.
// opts: onInfo({ no, entry }) (öffnet die Info-Karte), getNow(). Zusatz: reveal({ smooth }) scrollt für „Heute“ zur Jetzt-Linie (nur scrollLeft/scrollTop des Rasters). Breite je Minute: CSS-Variable --lfx-tvm-ppm (Desktop 5, Handy 3).
// Es wird nur der gewählte Sendetag gerendert (lazy). Importiert nur Dateien aus src/js/live/.
import { MIN, dayBounds, broadcastDayOf, formatClock } from '../schedule/time.js';
import { createChannelBadge } from './channel-list.js';

const STEP = 30 * MIN;
const TINY_PX = 48; // schmaler: kein Text (nur title/aria-label)
const SHORT_PX = 90; // schmaler: nur Titel ohne Uhrzeit
const LEAD_MIN = 30; // reveal(): Jetzt-Linie steht so viele Minuten nach dem linken Rand
const DEFAULT_PPM = 5;
const VIS_GAP = 4; // Abstand des nachrückenden Titels zur Senderspalte (px)
const VIS_PAD = 8; // Reserve rechts in der Zelle (px)

export function createEpgGrid({ doc, ctl, model, deps = {}, opts = {} }) {
  void deps;
  const getNow = typeof opts.getNow === 'function' ? opts.getNow : () => Date.now();
  const el = doc.createElement('div');
  el.className = 'lfx-tvm__epg';

  const head = doc.createElement('div');
  head.className = 'lfx-tvm__epg-head';
  const daysEl = doc.createElement('div');
  daysEl.className = 'lfx-tvm__epg-days';
  daysEl.setAttribute('role', 'group');
  daysEl.setAttribute('aria-label', 'Tag wählen');
  const nowBtn = doc.createElement('button');
  nowBtn.type = 'button';
  nowBtn.className = 'lfx-tvm__epg-now';
  nowBtn.textContent = 'Jetzt';
  head.append(daysEl, nowBtn);

  const scroll = doc.createElement('div');
  scroll.className = 'lfx-tvm__epg-scroll';
  const inner = doc.createElement('div');
  inner.className = 'lfx-tvm__epg-inner';
  const scale = doc.createElement('div');
  scale.className = 'lfx-tvm__epg-scale';
  const rowsEl = doc.createElement('div');
  rowsEl.className = 'lfx-tvm__epg-rows';
  const nowline = doc.createElement('div');
  nowline.className = 'lfx-tvm__epg-nowline';
  nowline.hidden = true;
  nowline.setAttribute('aria-hidden', 'true');
  inner.append(scale, rowsEl, nowline);
  scroll.append(inner);
  el.append(head, scroll);

  let alive = true;
  let todayD = broadcastDayOf(getNow());
  let selD = todayD;
  let bounds = dayBounds(selD);
  let current = 0;
  let nowPos = null;
  let cells = []; // { btn, entry, no, mins, filler, cur, past }
  let rowEls = new Map(); // no → row
  let dayBtns = [];
  let lastPpm = DEFAULT_PPM;
  let positioned = false;
  let ro = null;
  let visRaf = 0;
  let visCancel = null;

  const setMin = (node, startMs, endMs) => {
    node.style.setProperty('--tvm-s', String(+((startMs - bounds.start) / MIN).toFixed(3)));
    if (endMs != null) node.style.setProperty('--tvm-w', String(+((endMs - startMs) / MIN).toFixed(3)));
  };

  function renderDays(t) {
    daysEl.replaceChildren();
    dayBtns = [];
    for (const d of model.days(t)) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'lfx-tvm__day';
      b.textContent = d.label;
      b.dataset.tvmDay = String(d.D);
      b.addEventListener('click', () => selectDay(d.D));
      daysEl.append(b);
      dayBtns.push(b);
    }
    markDays();
  }

  function markDays() {
    for (const b of dayBtns) {
      const on = Number(b.dataset.tvmDay) === selD;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function renderScale() {
    scale.replaceChildren();
    const corner = doc.createElement('span');
    corner.className = 'lfx-tvm__epg-corner';
    scale.append(corner);
    for (let at = bounds.start; at < bounds.end; at += STEP) {
      const lab = formatClock(at);
      const m = doc.createElement('span');
      m.className = 'lfx-tvm__epg-hour' + (lab.endsWith(':00') ? '' : ' lfx-tvm__epg-hour--half');
      m.textContent = lab;
      setMin(m, at, null);
      scale.append(m);
    }
    const total = (bounds.end - bounds.start) / MIN;
    inner.style.setProperty('--tvm-total', String(total));
  }

  function renderRows(t) {
    rowsEl.replaceChildren();
    cells = [];
    rowEls = new Map();
    const p = ppm();
    lastPpm = p;
    const rows = model.gridRows({ from: bounds.start, to: bounds.end, D: selD, now: t });
    for (const r of rows) {
      const no = r.channel.no;
      const row = doc.createElement('div');
      row.className = 'lfx-tvm__epg-row';
      row.dataset.tvmNo = String(no);
      const chan = doc.createElement('div');
      chan.className = 'lfx-tvm__epg-chan';
      const nEl = doc.createElement('span');
      nEl.className = 'lfx-tvm__epg-chan-no';
      nEl.textContent = String(no);
      chan.append(nEl, createChannelBadge(doc, r.channel));
      const track = doc.createElement('div');
      track.className = 'lfx-tvm__epg-track';
      for (const c of r.cells) {
        const btn = doc.createElement('button');
        btn.type = 'button';
        let cls = 'lfx-tvm__epg-cell';
        if (c.kind === 'filler' || c.kind === 'fill') cls += ' lfx-tvm__epg-cell--filler';
        if (c.kind === 'fill') cls += ' lfx-tvm__epg-cell--fill';
        if (c.kind === 'closedown') cls += ' lfx-tvm__epg-cell--closedown';
        const mins = (c.end - c.start) / MIN;
        btn.className = cls;
        setMin(btn, c.start, c.end);
        const ti = doc.createElement('span');
        ti.className = 'lfx-tvm__epg-cell-title';
        ti.textContent = c.title;
        const tm = doc.createElement('span');
        tm.className = 'lfx-tvm__epg-cell-time';
        tm.textContent = `${formatClock(c.entry.start)}–${formatClock(c.entry.end)}`;
        const txt = doc.createElement('span');
        txt.className = 'lfx-tvm__epg-cell-text';
        txt.append(ti, tm);
        btn.append(txt);
        btn.title = `${c.title} · ${tm.textContent}`;
        btn.setAttribute('aria-label', `Sender ${no}, ${c.title}, ${tm.textContent}`);
        const rec = { btn, entry: c.entry, no, mins, filler: c.kind === 'filler', cur: false, past: false, vis: null };
        classify(rec, p);
        btn.addEventListener('click', () => onCell(rec));
        btn.addEventListener('keydown', (e) => onKey(e, rec));
        track.append(btn);
        cells.push(rec);
      }
      row.append(chan, track);
      rowsEl.append(row);
      rowEls.set(no, row);
    }
    markCurrentChannel();
    applyTime(t, true);
    updateVis();
  }

  /** Links unter die Senderspalte ragende Zellen: sichtbare Restbreite als --tvm-vis, damit der Titel (sticky) mitrückt. */
  function updateVis() {
    if (!alive) return;
    const chan = rowsEl.querySelector('.lfx-tvm__epg-chan');
    const hidden = !(scroll.clientWidth > 0) || !chan;
    const edge = hidden ? 0 : chan.getBoundingClientRect().right + VIS_GAP;
    const writes = [];
    for (const c of cells) {
      let v = null;
      if (!hidden) {
        const r = c.btn.getBoundingClientRect();
        if (r.width > 0 && r.left < edge) v = Math.max(0, Math.round(r.right - edge - VIS_PAD));
      }
      if (v !== c.vis) writes.push([c, v]);
    }
    for (const [c, v] of writes) {
      c.vis = v;
      if (v == null) c.btn.style.removeProperty('--tvm-vis');
      else c.btn.style.setProperty('--tvm-vis', `${v}px`);
    }
  }
  function scheduleVis() {
    if (visRaf || !alive) return;
    const w = doc.defaultView || window;
    if (typeof w.requestAnimationFrame === 'function') {
      visRaf = w.requestAnimationFrame(() => { visRaf = 0; updateVis(); });
      visCancel = (id) => w.cancelAnimationFrame && w.cancelAnimationFrame(id);
    } else {
      visRaf = setTimeout(() => { visRaf = 0; updateVis(); }, 16);
      visCancel = clearTimeout;
    }
  }
  scroll.addEventListener('scroll', scheduleVis, { passive: true });

  function classify(rec, p) {
    const px = rec.mins * p;
    rec.btn.classList.toggle('lfx-tvm__epg-cell--tiny', px < TINY_PX || (rec.filler && px < SHORT_PX));
    rec.btn.classList.toggle('lfx-tvm__epg-cell--short', px < SHORT_PX);
  }

  function markCurrentChannel() {
    for (const [no, row] of rowEls) row.classList.toggle('is-current-channel', no === current);
  }

  function onCell(rec) {
    if (!alive) return;
    const t = getNow();
    if (rec.entry.start <= t && t < rec.entry.end) ctl.tune(rec.no, { immediate: true });
    else if (typeof opts.onInfo === 'function') opts.onInfo({ no: rec.no, entry: rec.entry });
  }

  function onKey(e, rec) {
    const k = e.key;
    if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowUp' && k !== 'ArrowDown') return;
    let target;
    const same = cells.filter((c) => c.no === rec.no);
    const i = same.indexOf(rec);
    if (k === 'ArrowLeft') target = same[i - 1];
    else if (k === 'ArrowRight') target = same[i + 1];
    else {
      const no = rec.no + (k === 'ArrowUp' ? -1 : 1);
      const at = Math.max(rec.entry.start, bounds.start);
      target = cells.find((c) => c.no === no && c.entry.start <= at && at < c.entry.end);
    }
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      target.btn.focus();
    }
  }

  function applyTime(t, force) {
    const inDay = t >= bounds.start && t < bounds.end;
    nowline.hidden = !inDay;
    if (inDay) {
      const m = +((t - bounds.start) / MIN).toFixed(2);
      if (m !== nowPos) {
        nowPos = m;
        nowline.style.setProperty('--tvm-s', String(m));
      }
    } else nowPos = null;
    for (const c of cells) {
      const cur = c.entry.start <= t && t < c.entry.end;
      const past = c.entry.end <= t;
      if (force || cur !== c.cur) {
        c.cur = cur;
        c.btn.classList.toggle('is-current', cur);
        if (cur) c.btn.setAttribute('aria-current', 'time');
        else c.btn.removeAttribute('aria-current');
      }
      if (force || past !== c.past) {
        c.past = past;
        c.btn.classList.toggle('is-past', past);
      }
      if (cur) {
        const p = ((t - c.entry.start) / Math.max(1, c.entry.end - c.entry.start)) * 100;
        c.btn.style.setProperty('--tvm-p', `${p.toFixed(1)}%`);
      } else if (c.btn.style.getPropertyValue('--tvm-p')) c.btn.style.removeProperty('--tvm-p');
    }
  }

  function ppm() {
    try {
      const v = parseFloat((doc.defaultView || window).getComputedStyle(scroll).getPropertyValue('--lfx-tvm-ppm'));
      return v > 0 ? v : DEFAULT_PPM;
    } catch {
      return DEFAULT_PPM;
    }
  }

  /** Heute: Jetzt-Linie ca. 30 min nach dem linken Rand; nur scrollLeft/scrollTop des Rasters, kein Seitensprung. */
  function reveal(o) {
    if (!alive || selD !== todayD) return;
    const t = getNow();
    if (!(t >= bounds.start && t < bounds.end)) return;
    const left = Math.max(0, ((t - bounds.start) / MIN - LEAD_MIN) * ppm());
    if (o && o.smooth && typeof scroll.scrollTo === 'function') scroll.scrollTo({ left, behavior: 'smooth' });
    else scroll.scrollLeft = left;
    // senkrecht (nur Desktop, dort scrollt das Raster intern) zur Zeile des aktiven Senders
    const row = rowEls.get(current);
    if (row && scroll.scrollHeight > scroll.clientHeight + 1) {
      const top = row.offsetTop;
      const bottom = top + row.offsetHeight;
      const head = scale.offsetHeight;
      if (top - head < scroll.scrollTop) scroll.scrollTop = Math.max(0, top - head);
      else if (bottom > scroll.scrollTop + scroll.clientHeight) scroll.scrollTop = bottom - scroll.clientHeight;
    }
  }

  function renderDay(t) {
    bounds = dayBounds(selD);
    renderScale();
    renderRows(t);
    markDays();
  }

  function selectDay(D) {
    if (!alive) return;
    if (D === selD && cells.length) return;
    selD = D;
    renderDay(getNow());
    scroll.scrollLeft = 0;
    if (D === todayD) reveal();
  }

  nowBtn.addEventListener('click', () => {
    if (!alive) return;
    const first = selD !== todayD;
    if (first) {
      selD = todayD;
      renderDay(getNow());
    }
    reveal({ smooth: !first });
  });

  const t0 = getNow();
  renderDays(t0);
  renderDay(t0);
  try {
    const s = ctl.state && ctl.state();
    if (s && s.on) { current = s.channel; markCurrentChannel(); }
  } catch { /* egal */ }
  // erste Position erst, wenn das Raster eine Breite hat (am Handy ist der Tab anfangs versteckt)
  const RO = (doc.defaultView || window).ResizeObserver;
  if (typeof RO === 'function') {
    ro = new RO(() => {
      if (!alive || !(scroll.clientWidth > 0)) return;
      updateVis();
      const p = ppm();
      if (p !== lastPpm) {
        lastPpm = p;
        for (const c of cells) classify(c, p);
      }
      if (!positioned) {
        positioned = true;
        reveal();
      }
    });
    ro.observe(scroll);
  }

  return {
    el,
    reveal,
    update(snap) {
      if (!alive || !snap) return;
      const no = snap.on ? snap.channel : 0;
      if (no !== current) {
        current = no;
        markCurrentChannel();
      }
      if (!positioned && (!ro || scroll.clientWidth > 0)) {
        positioned = true;
        reveal();
      }
    },
    tick(t) {
      if (!alive) return;
      const D = broadcastDayOf(t);
      if (D !== todayD) {
        const follow = selD === todayD;
        todayD = D;
        if (follow || selD < D || selD > D + 6) selD = D;
        renderDays(t);
        renderDay(t);
        return;
      }
      applyTime(t, false);
    },
    destroy() {
      alive = false;
      scroll.removeEventListener('scroll', scheduleVis);
      if (visRaf && visCancel) visCancel(visRaf);
      visRaf = 0;
      if (ro) ro.disconnect();
      ro = null;
      cells = [];
      rowEls = new Map();
      dayBtns = [];
      el.remove();
    },
  };
}
