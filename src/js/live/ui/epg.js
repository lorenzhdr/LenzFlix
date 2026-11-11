// EPG: Programmgitter (18 Sender × Sendetag), Detailbereich. Das Videobild schrumpft per CSS (has-epg).
import { h, describe, badges, shortName } from './overlay-util.js';

const COL_MIN = 30; // Spaltenbreite der Zeitleiste
const DAYS = 7; // heute + 6
const MIN = 60000;

function boundsOf(ctx, D, rows) {
  let b;
  try {
    b = ctx.dayBounds(D);
  } catch {
    /* Fallback unten */
  }
  let s;
  let e;
  if (Array.isArray(b)) [s, e] = b;
  else if (b && typeof b === 'object') {
    s = b.start != null ? b.start : b.from;
    e = b.end != null ? b.end : b.to;
  }
  if (!(e > s)) {
    const all = rows.flat();
    s = all.length ? all[0].start : 0;
    e = all.length ? all[all.length - 1].end : s + 24 * 60 * MIN;
  }
  return { start: s, end: e };
}

export function createEpg(ctx) {
  const el = h('div', 'lfx-live-epg');
  el.hidden = true;
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Programmübersicht');

  // ---- Gerüst
  const top = h('div', 'lfx-live-epg__top');
  const days = h('div', 'lfx-live-epg__days');
  days.setAttribute('role', 'group');
  days.setAttribute('aria-label', 'Sendetag');
  const info = h('div', 'lfx-live-epg__info');
  const infoTitle = h('div', 'lfx-live-epg__info-title');
  const infoMeta = h('div', 'lfx-live-epg__info-meta');
  info.append(infoTitle, infoMeta);
  top.append(days, info);

  const scroller = h('div', 'lfx-live-epg__scroller');
  scroller.setAttribute('role', 'grid');
  scroller.setAttribute('aria-label', 'Programm');
  const inner = h('div', 'lfx-live-epg__inner');
  scroller.append(inner);

  const legend = h('div', 'lfx-live-epg__legend');
  [
    ['red', 'Tag zurück', 'red'],
    ['green', 'Tag vor', 'green'],
    ['yellow', 'Jetzt', 'yellow'],
    ['blue', 'Details', 'blue'],
  ].forEach(([c, t, key]) => {
    const b = h('button', 'lfx-live-epg__key is-' + c, t);
    b.type = 'button';
    b.addEventListener('click', () => onKey(key));
    legend.append(b);
  });

  const detail = h('div', 'lfx-live-epg__detail');
  detail.hidden = true;
  detail.setAttribute('role', 'dialog');
  detail.setAttribute('aria-modal', 'true');
  detail.setAttribute('aria-label', 'Sendungsdetails');

  el.append(top, scroller, legend, detail);

  // ---- Zustand
  let opened = false;
  let day = 0;
  let today = 0;
  let model = {}; // no → { ch, entries[], els[] }
  let focus = { no: 1, start: 0 };
  let anchorT = 0;
  let nowLine = null;
  let dayStart = 0;
  let lastMinute = -1;
  let detailEntry = null; // { no, entry }
  let detailBtns = [];
  let detailIdx = 0;
  const prepared = new Set();

  const now = () => ctx.now();
  const channelList = () => {
    const l = ctx.channels ? ctx.channels() : ctx.scheduler.channels();
    return Array.isArray(l) ? l : [];
  };
  const clock = (t) => ctx.formatClock(t);
  const dayLabel = (D) => {
    const f = ctx.formatDay(D);
    return f.weekday + ' ' + f.date;
  };

  function ensurePrepared(D) {
    const s = ctx.scheduler;
    if (!s || typeof s.prepare !== 'function' || prepared.has(D)) return;
    prepared.add(D);
    try {
      const p = s.prepare([D]);
      if (p && typeof p.then === 'function') {
        p.then(
          () => {
            if (opened && day === D) render();
          },
          () => {}
        );
      }
    } catch {
      /* Plan ohne Vorarbeit */
    }
  }

  // ---- Rendern
  function renderDays() {
    days.textContent = '';
    for (let i = 0; i < DAYS; i++) {
      const D = today + i;
      const b = h('button', 'lfx-live-epg__day', dayLabel(D));
      b.type = 'button';
      b.dataset.day = String(D);
      if (D === day) {
        b.classList.add('is-active');
        b.setAttribute('aria-pressed', 'true');
      } else b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => setDay(D));
      days.append(b);
    }
  }

  function render() {
    renderDays();
    const chans = channelList();
    const plans = chans.map((ch) => {
      let p;
      try {
        p = ctx.scheduler.planDay(ch.no, day) || [];
      } catch {
        p = [];
      }
      return Array.from(p);
    });
    const b = boundsOf(ctx, day, plans);
    dayStart = b.start;
    const totalMin = Math.max(1, Math.round((b.end - b.start) / MIN));
    const cols = Math.ceil(totalMin / COL_MIN);
    inner.textContent = '';
    inner.style.setProperty('--lfx-live-epg-total', String(totalMin));
    model = {};

    // Zeitleiste
    const ruler = h('div', 'lfx-live-epg__row lfx-live-epg__ruler');
    ruler.setAttribute('role', 'row');
    const corner = h('div', 'lfx-live-epg__chan lfx-live-epg__corner', dayLabel(day));
    corner.setAttribute('role', 'columnheader');
    const rtrack = h('div', 'lfx-live-epg__track');
    for (let i = 0; i < cols; i++) {
      const c = h('div', 'lfx-live-epg__tick', clock(b.start + i * COL_MIN * MIN));
      c.setAttribute('role', 'columnheader');
      c.style.left = `calc(var(--lfx-live-epg-pm) * ${i * COL_MIN})`;
      c.style.width = `calc(var(--lfx-live-epg-pm) * ${COL_MIN})`;
      rtrack.append(c);
    }
    ruler.append(corner, rtrack);
    inner.append(ruler);

    const cur = ctx.currentChannel();
    chans.forEach((ch, i) => {
      const plan = plans[i];
      const row = h('div', 'lfx-live-epg__row');
      row.setAttribute('role', 'row');
      row.dataset.no = String(ch.no);
      if (ch.no === cur) row.classList.add('is-current');
      const head = h('div', 'lfx-live-epg__chan');
      head.setAttribute('role', 'rowheader');
      head.append(h('span', 'lfx-live-epg__no', String(ch.no)), h('span', 'lfx-live-epg__name', shortName(ch) || ch.name || ''));
      const themed = plan.find((e) => e.theme);
      if (themed) head.append(h('span', 'lfx-live-epg__theme', themed.theme));
      head.addEventListener('click', () => {
        ctx.tune(ch.no);
        ctx.closeOverlay();
      });
      const track = h('div', 'lfx-live-epg__track');
      const entries = [];
      const els = [];
      plan.forEach((en) => {
        if (en.type === 'filler') return;
        entries.push(en);
        const node = blockFor(ch, en);
        els.push(node);
        track.append(node);
      });
      row.append(head, track);
      inner.append(row);
      model[ch.no] = { ch, entries, els };
    });

    nowLine = h('div', 'lfx-live-epg__nowline');
    nowLine.setAttribute('aria-hidden', 'true');
    inner.append(nowLine);
    lastMinute = -1;
    refreshNow();
    syncFocus(false);
  }

  function blockFor(ch, en) {
    const d = describe(ctx.scheduler, en);
    const node = h('div', 'lfx-live-epg__ev is-' + en.type);
    node.setAttribute('role', 'gridcell');
    node.tabIndex = -1;
    node.dataset.no = String(ch.no);
    node.dataset.start = String(en.start);
    const minFrom = (en.start - dayStart) / MIN;
    const dur = (en.end - en.start) / MIN;
    node.style.left = `calc(var(--lfx-live-epg-pm) * ${minFrom})`;
    node.style.width = `calc(var(--lfx-live-epg-pm) * ${dur})`;
    const title = h('span', 'lfx-live-epg__ev-title', d.title);
    const meta = h('span', 'lfx-live-epg__ev-meta');
    meta.append(h('span', 'lfx-live-epg__time', clock(en.start)));
    badges(en).forEach((b) => meta.append(h('span', 'lfx-live-epg__badge', b)));
    node.append(title, meta);
    if (en.type === 'fill' || en.type === 'nightfill') {
      node.append(h('span', 'lfx-live-epg__hint', 'Füllprogramm'));
    }
    node.setAttribute('aria-label', `${clock(en.start)} ${d.title}${badges(en).length ? ', ' + badges(en).join(', ') : ''}`);
    node.addEventListener('click', () => {
      focus = { no: ch.no, start: en.start };
      anchorT = en.start;
      syncFocus(true);
      openDetail();
    });
    return node;
  }

  function refreshNow() {
    const t = now();
    const min = Math.floor(t / MIN);
    if (min === lastMinute) return;
    lastMinute = min;
    const isToday = day === today;
    Object.keys(model).forEach((no) => {
      const m = model[no];
      m.entries.forEach((en, i) => {
        m.els[i].classList.toggle('is-now', isToday && en.start <= t && t < en.end);
      });
    });
    if (nowLine) {
      const inDay = t >= dayStart;
      nowLine.hidden = !inDay || !isToday;
      nowLine.style.left = `calc(var(--lfx-live-epg-chan) + var(--lfx-live-epg-pm) * ${(t - dayStart) / MIN})`;
    }
    const cur = ctx.currentChannel();
    inner.querySelectorAll('.lfx-live-epg__row[data-no]').forEach((r) => r.classList.toggle('is-current', Number(r.dataset.no) === cur));
  }

  function syncFocus(scroll) {
    const m = model[focus.no];
    if (!m) return;
    const idx = m.entries.findIndex((e) => e.start === focus.start);
    inner.querySelectorAll('.lfx-live-epg__ev.is-focus').forEach((n) => {
      n.classList.remove('is-focus');
      n.tabIndex = -1;
    });
    const node = idx >= 0 ? m.els[idx] : null;
    if (!node) return;
    node.classList.add('is-focus');
    node.tabIndex = 0;
    if (opened && !detailEntry) {
      try {
        node.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }
    if (scroll && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const d = describe(ctx.scheduler, m.entries[idx]);
    infoTitle.textContent = d.title;
    infoMeta.textContent = `${clock(m.entries[idx].start)}–${clock(m.entries[idx].end)} · ${m.ch.no} ${m.ch.name}`;
  }

  function pickAt(no, t) {
    const m = model[no];
    if (!m || !m.entries.length) return null;
    let best = m.entries[0];
    let bd = Infinity;
    for (const e of m.entries) {
      if (e.start <= t && t < e.end) return e;
      const dist = t < e.start ? e.start - t : t - e.end;
      if (dist < bd) {
        bd = dist;
        best = e;
      }
    }
    return best;
  }

  function focusDefault() {
    const t = day === today ? now() : dayStart + 20 * 60 * MIN;
    const cur = ctx.currentChannel();
    const no = model[cur] ? cur : Number(Object.keys(model)[0]) || 1;
    const e = pickAt(no, t);
    focus = { no, start: e ? e.start : 0 };
    anchorT = t;
  }

  function scrollToNow() {
    const t = day === today ? now() : dayStart + 20 * 60 * MIN;
    // Erst vertikal zum Fokus, dann horizontal setzen (scrollIntoView darf den Zeitversatz nicht überschreiben)
    const node = inner.querySelector('.lfx-live-epg__ev.is-focus');
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const tick = inner.querySelector('.lfx-live-epg__tick');
    const pm = tick ? tick.getBoundingClientRect().width / COL_MIN : 0;
    if (pm > 0) {
      const corner = inner.querySelector('.lfx-live-epg__corner');
      const chanW = corner ? corner.getBoundingClientRect().width : 0;
      const visible = Math.max(0, scroller.clientWidth - chanW); // sichtbare Zeitleiste ohne Senderspalte
      // Jetzt-Linie bei ca. 22 % der sichtbaren Zeitleiste
      scroller.scrollLeft = Math.max(0, ((t - dayStart) / MIN) * pm - visible * 0.22);
    }
  }

  function setDay(D) {
    D = Math.max(today, Math.min(today + DAYS - 1, D));
    if (D === day && Object.keys(model).length) return;
    day = D;
    closeDetail();
    render();
    focusDefault();
    syncFocus(true);
    scrollToNow();
    ensurePrepared(D);
  }

  // ---- Detail
  function statusText(en) {
    const t = now();
    if (en.start <= t && t < en.end) return 'läuft gerade';
    if (t < en.start) {
      const m = Math.max(1, Math.round((en.start - t) / MIN));
      return m >= 60 ? `beginnt in ${Math.floor(m / 60)} h ${m % 60} min` : `beginnt in ${m} min`;
    }
    return 'bereits gelaufen';
  }

  function openDetail() {
    const m = model[focus.no];
    const en = m && m.entries.find((e) => e.start === focus.start);
    if (!en) return;
    detailEntry = { no: focus.no, entry: en };
    const d = describe(ctx.scheduler, en);
    detail.textContent = '';
    detail.append(h('h2', 'lfx-live-epg__d-title', d.title));
    const lines = [
      `${clock(en.start)}–${clock(en.end)} · ${statusText(en)}`,
      `Sender ${m.ch.no} · ${m.ch.name}`,
      [d.year, d.genres.slice(0, 3).join(', '), d.runMin ? d.runMin + ' min' : ''].filter(Boolean).join(' · '),
    ];
    if (en.theme) lines.push('Thementag: ' + en.theme);
    if (en.type === 'fill' || en.type === 'nightfill') lines.push(en.type === 'nightfill' ? 'Füllprogramm – reguläres Programm ab 5:00' : 'Füllprogramm');
    lines.filter(Boolean).forEach((l) => detail.append(h('p', 'lfx-live-epg__d-line', l)));
    const bs = badges(en);
    if (bs.length) {
      const wrap = h('p', 'lfx-live-epg__d-badges');
      bs.forEach((b) => wrap.append(h('span', 'lfx-live-epg__badge', b)));
      detail.append(wrap);
    }
    const acts = h('div', 'lfx-live-epg__d-actions');
    detailBtns = [];
    const mk = (act, label, sub, fn) => {
      const b = h('button', 'lfx-live-epg__btn');
      b.type = 'button';
      b.dataset.act = act;
      b.append(h('span', 'lfx-live-epg__btn-label', label));
      if (sub) b.append(h('span', 'lfx-live-epg__btn-sub', sub));
      b.addEventListener('click', fn);
      detailBtns.push(b);
      acts.append(b);
    };
    mk('tune', 'Umschalten', null, () => {
      const no = m.ch.no;
      closeDetail();
      ctx.tune(no);
      ctx.closeOverlay();
    });
    if (d.itemId) {
      mk('library', 'Von vorne ansehen', `In ${ctx.previousThemeName || 'der Mediathek'} ansehen`, () => {
        ctx.leaveToLibrary(d.itemId, { type: d.kind, seriesId: d.seriesId });
      });
    }
    mk('close', 'Schließen', null, () => closeDetail());
    detail.append(acts);
    detail.hidden = false;
    el.classList.add('has-detail');
    detailIdx = 0;
    setDetailFocus(0);
  }

  function setDetailFocus(i) {
    detailIdx = (i + detailBtns.length) % detailBtns.length;
    detailBtns.forEach((b, k) => b.classList.toggle('is-focus', k === detailIdx));
    try {
      detailBtns[detailIdx].focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  function closeDetail() {
    if (!detailEntry) return false;
    detailEntry = null;
    detail.hidden = true;
    detail.textContent = '';
    detailBtns = [];
    el.classList.remove('has-detail');
    syncFocus(false);
    return true;
  }

  // ---- Navigation
  function moveH(dx) {
    const m = model[focus.no];
    if (!m) return;
    const i = m.entries.findIndex((e) => e.start === focus.start);
    const n = m.entries[i + dx];
    if (!n) return;
    focus.start = n.start;
    anchorT = n.start;
    syncFocus(true);
  }
  function moveV(dy) {
    const no = focus.no + dy;
    if (!model[no]) return;
    const e = pickAt(no, anchorT);
    if (!e) return;
    focus = { no, start: e.start };
    syncFocus(true);
  }

  function onKey(key) {
    if (!opened) return false;
    if (detailEntry) {
      switch (key) {
        case 'left':
        case 'up':
          setDetailFocus(detailIdx - 1);
          return true;
        case 'right':
        case 'down':
          setDetailFocus(detailIdx + 1);
          return true;
        case 'ok':
          detailBtns[detailIdx].click();
          return true;
        case 'back':
        case 'blue':
          closeDetail();
          return true;
        default:
          return false;
      }
    }
    switch (key) {
      case 'left':
        moveH(-1);
        return true;
      case 'right':
        moveH(1);
        return true;
      case 'up':
        moveV(-1);
        return true;
      case 'down':
        moveV(1);
        return true;
      case 'ok':
      case 'blue':
        openDetail();
        return true;
      case 'red':
        setDay(day - 1);
        return true;
      case 'green':
        setDay(day + 1);
        return true;
      case 'yellow':
        if (day !== today) setDay(today);
        focusDefault();
        syncFocus(true);
        scrollToNow();
        return true;
      default:
        return false;
    }
  }

  function open() {
    opened = true;
    el.hidden = false;
    el.classList.add('is-open');
    today = ctx.broadcastDayOf(now());
    day = today;
    prepared.clear();
    detailEntry = null;
    detail.hidden = true;
    el.classList.remove('has-detail');
    render();
    focusDefault();
    syncFocus(true);
    scrollToNow();
    ensurePrepared(day);
  }

  function close() {
    opened = false;
    detailEntry = null;
    el.hidden = true;
    el.classList.remove('is-open', 'has-detail');
    detail.hidden = true;
  }

  function tick() {
    if (opened) refreshNow();
  }

  return { el, open, close, isOpen: () => opened, onKey, tick };
}
