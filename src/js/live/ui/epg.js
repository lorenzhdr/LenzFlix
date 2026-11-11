// EPG: Programmgitter (18 Sender × 7 Sendetage auf einer durchgehenden Zeitachse), Detailbereich.
// Das Videobild schrumpft per CSS (has-epg). Tage werden lazy gerendert (Sichtbereich ±1, höchstens 3).
import { h, describe, badges, shortName } from './overlay-util.js';

const COL_MIN = 30; // Spaltenbreite der Zeitleiste
const DAYS = 7; // heute + 6
const MIN = 60000;
const DRAG_PX = 6; // Schwelle für Maus-Ziehen
const STEP_MIN = 120; // ◀ / ▶

function boundsOf(ctx, D) {
  let b;
  try {
    b = ctx.dayBounds(D);
  } catch {
    /* Fallback im Aufrufer */
  }
  let s;
  let e;
  if (Array.isArray(b)) [s, e] = b;
  else if (b && typeof b === 'object') {
    s = b.start != null ? b.start : b.from;
    e = b.end != null ? b.end : b.to;
  }
  return e > s ? { start: s, end: e } : null;
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
  const nav = h('div', 'lfx-live-epg__nav');
  nav.setAttribute('role', 'group');
  nav.setAttribute('aria-label', 'Zeitleiste verschieben');
  [
    ['back', '◀', '2 Stunden zurück'],
    ['fwd', '▶', '2 Stunden vor'],
    ['now', 'Jetzt', 'Zu jetzt springen'],
  ].forEach(([act, label, aria]) => {
    const b = h('button', 'lfx-live-epg__navbtn', label);
    b.type = 'button';
    b.dataset.act = act;
    b.setAttribute('aria-label', aria);
    b.addEventListener('click', () => {
      if (act === 'now') onKey('yellow');
      else scrollByMin(act === 'back' ? -STEP_MIN : STEP_MIN);
    });
    nav.append(b);
  });
  const info = h('div', 'lfx-live-epg__info');
  const infoTitle = h('div', 'lfx-live-epg__info-title');
  const infoMeta = h('div', 'lfx-live-epg__info-meta');
  info.append(infoTitle, infoMeta);
  // Tagesleiste und Zeit-Knöpfe in einer Zeile (Kopf bleibt niedrig, das Gitter zeigt mehr Sender)
  const bar = h('div', 'lfx-live-epg__bar');
  bar.append(days, nav);
  top.append(bar, info);

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
  let gen = 0; // Öffnungszähler (veraltete prepare-Antworten verwerfen)
  let day = 0; // aktiver Sendetag
  let today = 0;
  let dayInfo = []; // { D, start, end, off, len } je Tag (Minuten ab Gesamtstart)
  let totalStart = 0;
  let totalMin = 1;
  let rowsByNo = {}; // no → { ch, row, headEl, nameEl, themeEl, secs[], byDay: Map(i → { entries, els }) }
  const rendered = new Set(); // Tagesindizes mit Inhalt
  let corner = null;
  let focus = { no: 1, start: 0 };
  let anchorT = 0;
  let nowLine = null;
  let lastMinute = -1;
  let detailEntry = null; // { no, entry }
  let detailBtns = [];
  let detailIdx = 0;
  let rafId = 0;
  let lock = null; // { i, until }: nach programmatischem Scrollen folgt der Tag nicht der Position
  let lockTimer = 0;
  let drag = null;
  let suppressClick = false;
  const prepared = new Set();
  const planCache = new Map();

  const now = () => ctx.now();
  const clock = (t) => ctx.formatClock(t);
  const dayLabel = (D) => {
    const f = ctx.formatDay(D);
    return f.weekday + ' ' + f.date;
  };
  const clampI = (i) => Math.max(0, Math.min(DAYS - 1, i));
  const channelsFor = (D) => {
    let l;
    try {
      l = ctx.scheduler && typeof ctx.scheduler.channels === 'function' ? ctx.scheduler.channels(D) : ctx.channels();
    } catch {
      l = null;
    }
    return Array.isArray(l) ? l : [];
  };
  const planFor = (no, i) => {
    const key = no + ':' + i;
    let p = planCache.get(key);
    if (!p) {
      try {
        p = Array.from(ctx.scheduler.planDay(no, today + i) || []);
      } catch {
        p = [];
      }
      planCache.set(key, p);
    }
    return p;
  };

  // ---- Maße (px pro Minute aus der Zeitleiste; in jsdom nur mit gemockten Maßen)
  function metrics() {
    const tick = inner.querySelector('.lfx-live-epg__tick');
    const pm = tick ? tick.getBoundingClientRect().width / COL_MIN : 0;
    const chanW = corner ? corner.getBoundingClientRect().width : 0;
    return { pm, chanW, visible: Math.max(0, scroller.clientWidth - chanW) };
  }
  const reduced = () => {
    try {
      return !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return true;
    }
  };
  function scrollX(x, smooth) {
    x = Math.max(0, x);
    if (smooth && !reduced() && typeof scroller.scrollTo === 'function') scroller.scrollTo({ left: x, behavior: 'smooth' });
    else scroller.scrollLeft = x;
  }
  function setLock(i, ms) {
    lock = { i, until: Date.now() + ms };
    clearTimeout(lockTimer);
    lockTimer = setTimeout(scheduleSync, ms + 30);
  }
  function scrollByMin(min) {
    const { pm } = metrics();
    if (pm <= 0) return;
    lock = null;
    scrollX(scroller.scrollLeft + min * pm, true);
  }
  function revealRow(no) {
    const r = rowsByNo[no];
    if (!r) return;
    const ruler = inner.querySelector('.lfx-live-epg__ruler');
    const rh = ruler ? ruler.offsetHeight : 0;
    const t = r.row.offsetTop;
    const hh = r.row.offsetHeight;
    if (t - rh < scroller.scrollTop) scroller.scrollTop = Math.max(0, t - rh);
    else if (t + hh > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = t + hh - scroller.clientHeight;
  }
  /** Horizontal zu Tag D: heute → „jetzt“ (Linie bei ~22 %), sonst Tagesbeginn (05:00). */
  function scrollToDay(D, smooth) {
    const i = D - today;
    if (!dayInfo[i]) return;
    setLock(i, smooth && !reduced() ? 1000 : 150);
    revealRow(focus.no);
    const { pm, visible } = metrics();
    if (pm <= 0) return;
    const x = D === today ? ((now() - totalStart) / MIN) * pm - visible * 0.22 : dayInfo[i].off * pm;
    scrollX(x, smooth);
  }

  // ---- Einträge je Sender über alle gerenderten Tage
  function entriesOf(no) {
    const r = rowsByNo[no];
    const out = [];
    if (!r) return out;
    [...r.byDay.keys()]
      .sort((a, b) => a - b)
      .forEach((di) => {
        const d = r.byDay.get(di);
        d.entries.forEach((en, k) => out.push({ en, node: d.els[k], di }));
      });
    return out;
  }
  const findFocus = () => entriesOf(focus.no).find((x) => x.en.start === focus.start) || null;
  function dayIndexOfTime(t) {
    let r = 0;
    dayInfo.forEach((d, i) => {
      if (d.start <= t) r = i;
    });
    return r;
  }

  // ---- Rendern
  function ensurePrepared(i) {
    const s = ctx.scheduler;
    const D = today + i;
    if (!s || typeof s.prepare !== 'function' || prepared.has(D)) return;
    prepared.add(D);
    const g = gen;
    try {
      const p = s.prepare([D]);
      if (p && typeof p.then === 'function') {
        p.then(
          () => {
            if (!opened || g !== gen) return;
            [...planCache.keys()].filter((k) => k.endsWith(':' + i)).forEach((k) => planCache.delete(k));
            if (rendered.has(i)) {
              Object.values(rowsByNo).forEach((r) => renderRowDay(r, i));
              lastMinute = -1;
              refreshNow();
              syncFocus(false);
            }
            if (i === day - today) updateChanHeads();
          },
          () => {}
        );
      }
    } catch {
      /* Plan ohne Vorarbeit */
    }
  }

  function buildDays() {
    days.textContent = '';
    for (let i = 0; i < DAYS; i++) {
      const D = today + i;
      const b = h('button', 'lfx-live-epg__day', dayLabel(D));
      b.type = 'button';
      b.dataset.day = String(D);
      b.addEventListener('click', () => setDay(D));
      days.append(b);
    }
    updateDays();
  }
  function updateDays() {
    days.querySelectorAll('.lfx-live-epg__day').forEach((b) => {
      const on = Number(b.dataset.day) === day;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) {
        // aktiven Tag in der (horizontal scrollbaren) Leiste sichtbar halten, ohne den Seiten-Scroll zu bewegen
        const l = b.offsetLeft;
        const r = l + b.offsetWidth;
        if (l < days.scrollLeft) days.scrollLeft = Math.max(0, l - 8);
        else if (days.clientWidth && r > days.scrollLeft + days.clientWidth) days.scrollLeft = r - days.clientWidth + 8;
      }
    });
    if (corner) corner.textContent = dayLabel(day);
  }

  /** Sendername und Thementag der Senderspalte für den aktiven Tag. */
  function updateChanHeads() {
    const map = new Map(channelsFor(day).map((c) => [c.no, c]));
    const i = day - today;
    Object.keys(rowsByNo).forEach((no) => {
      const r = rowsByNo[no];
      r.ch = map.get(r.ch.no) || r.ch;
      r.nameEl.textContent = shortName(r.ch) || r.ch.name || '';
      const themed = planFor(r.ch.no, i).find((e) => e.theme);
      if (themed) {
        if (!r.themeEl) {
          r.themeEl = h('span', 'lfx-live-epg__theme');
          r.headEl.append(r.themeEl);
        }
        r.themeEl.textContent = themed.theme;
      } else if (r.themeEl) {
        r.themeEl.remove();
        r.themeEl = null;
      }
    });
  }

  function build() {
    dayInfo = [];
    let prevEnd = null;
    for (let i = 0; i < DAYS; i++) {
      let b = boundsOf(ctx, today + i);
      if (!b) {
        const s0 = prevEnd != null ? prevEnd : 0;
        b = { start: s0, end: s0 + 24 * 60 * MIN };
      }
      dayInfo.push({ D: today + i, start: b.start, end: b.end, off: 0, len: Math.max(1, Math.round((b.end - b.start) / MIN)) });
      prevEnd = b.end;
    }
    totalStart = dayInfo[0].start;
    dayInfo.forEach((d) => {
      d.off = (d.start - totalStart) / MIN;
    });
    const last = dayInfo[DAYS - 1];
    totalMin = Math.max(1, last.off + last.len);
    inner.textContent = '';
    inner.style.setProperty('--lfx-live-epg-total', String(totalMin));
    rowsByNo = {};
    rendered.clear();

    // Zeitleiste: Ticks über alle Tage, an jeder Tagesgrenze ein Tagesmarker
    const ruler = h('div', 'lfx-live-epg__row lfx-live-epg__ruler');
    ruler.setAttribute('role', 'row');
    corner = h('div', 'lfx-live-epg__chan lfx-live-epg__corner', dayLabel(day));
    corner.setAttribute('role', 'columnheader');
    const rtrack = h('div', 'lfx-live-epg__track');
    dayInfo.forEach((d) => {
      const cols = Math.ceil(d.len / COL_MIN);
      for (let c = 0; c < cols; c++) {
        const first = c === 0;
        const t = h('div', 'lfx-live-epg__tick' + (first ? ' is-daymark' : ''));
        t.setAttribute('role', 'columnheader');
        if (first) {
          t.dataset.day = String(d.D);
          t.append(h('span', 'lfx-live-epg__daymark', dayLabel(d.D)));
        } else t.textContent = clock(d.start + c * COL_MIN * MIN);
        t.style.left = `calc(var(--lfx-live-epg-pm) * ${d.off + c * COL_MIN})`;
        t.style.width = `calc(var(--lfx-live-epg-pm) * ${Math.min(COL_MIN, d.len - c * COL_MIN)})`;
        rtrack.append(t);
      }
    });
    ruler.append(corner, rtrack);
    inner.append(ruler);

    const cur = ctx.currentChannel();
    channelsFor(day).forEach((ch) => {
      const row = h('div', 'lfx-live-epg__row');
      row.setAttribute('role', 'row');
      row.dataset.no = String(ch.no);
      if (ch.no === cur) row.classList.add('is-current');
      const head = h('div', 'lfx-live-epg__chan');
      head.setAttribute('role', 'rowheader');
      const nameEl = h('span', 'lfx-live-epg__name', shortName(ch) || ch.name || '');
      head.append(h('span', 'lfx-live-epg__no', String(ch.no)), nameEl);
      const r = { ch, row, headEl: head, nameEl, themeEl: null, secs: [], byDay: new Map() };
      head.addEventListener('click', () => {
        ctx.tune(r.ch.no);
        ctx.closeOverlay();
      });
      const track = h('div', 'lfx-live-epg__track');
      dayInfo.forEach((d, i) => {
        const sec = h('div', 'lfx-live-epg__daysec');
        sec.dataset.day = String(d.D);
        sec.style.left = `calc(var(--lfx-live-epg-pm) * ${d.off})`;
        sec.style.width = `calc(var(--lfx-live-epg-pm) * ${d.len})`;
        r.secs[i] = sec;
        track.append(sec);
      });
      row.append(head, track);
      inner.append(row);
      rowsByNo[ch.no] = r;
    });

    nowLine = h('div', 'lfx-live-epg__nowline');
    nowLine.setAttribute('aria-hidden', 'true');
    inner.append(nowLine);
    lastMinute = -1;
    setWindow(0);
    updateChanHeads();
  }

  function renderRowDay(r, i) {
    const sec = r.secs[i];
    sec.textContent = '';
    const entries = [];
    const els = [];
    planFor(r.ch.no, i).forEach((en) => {
      if (en.type === 'filler') return;
      entries.push(en);
      const node = blockFor(r, en, i);
      els.push(node);
      sec.append(node);
    });
    r.byDay.set(i, { entries, els });
  }

  /** Nur Tage um den Sichtbereich (±1, höchstens 3) tragen Einträge. */
  function setWindow(c) {
    c = clampI(c);
    const want = new Set([c - 1, c, c + 1].filter((i) => i >= 0 && i < DAYS));
    let changed = false;
    [...rendered].forEach((i) => {
      if (want.has(i)) return;
      Object.values(rowsByNo).forEach((r) => {
        r.secs[i].textContent = '';
        r.byDay.delete(i);
      });
      rendered.delete(i);
      changed = true;
    });
    want.forEach((i) => {
      if (rendered.has(i)) return;
      Object.values(rowsByNo).forEach((r) => renderRowDay(r, i));
      rendered.add(i);
      ensurePrepared(i);
      changed = true;
    });
    if (changed) {
      lastMinute = -1;
      refreshNow();
      syncFocus(false);
    }
  }

  function blockFor(r, en, i) {
    const ch = r.ch;
    const d = describe(ctx.scheduler, en);
    const node = h('div', 'lfx-live-epg__ev is-' + en.type);
    node.setAttribute('role', 'gridcell');
    node.tabIndex = -1;
    node.dataset.no = String(ch.no);
    node.dataset.start = String(en.start);
    const minFrom = (en.start - dayInfo[i].start) / MIN;
    const dur = (en.end - en.start) / MIN;
    node.style.left = `calc(var(--lfx-live-epg-pm) * ${minFrom})`;
    node.style.width = `calc(var(--lfx-live-epg-pm) * ${dur})`;
    // Textbox bleibt per CSS (position: sticky) am sichtbaren linken Rand, solange der Block hineinragt
    const text = h('span', 'lfx-live-epg__ev-text');
    const title = h('span', 'lfx-live-epg__ev-title', d.title);
    const meta = h('span', 'lfx-live-epg__ev-meta');
    meta.append(h('span', 'lfx-live-epg__time', clock(en.start)));
    badges(en).forEach((b) => meta.append(h('span', 'lfx-live-epg__badge', b)));
    text.append(title, meta);
    if (en.type === 'fill' || en.type === 'nightfill') {
      text.append(h('span', 'lfx-live-epg__hint', 'Füllprogramm'));
    }
    node.append(text);
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
    Object.values(rowsByNo).forEach((r) => {
      r.byDay.forEach((d) => {
        d.entries.forEach((en, k) => d.els[k].classList.toggle('is-now', en.start <= t && t < en.end));
      });
    });
    if (nowLine) {
      nowLine.hidden = t < totalStart || t > totalStart + totalMin * MIN;
      nowLine.style.left = `calc(var(--lfx-live-epg-chan) + var(--lfx-live-epg-pm) * ${(t - totalStart) / MIN})`;
    }
    const cur = ctx.currentChannel();
    inner.querySelectorAll('.lfx-live-epg__row[data-no]').forEach((r) => r.classList.toggle('is-current', Number(r.dataset.no) === cur));
  }

  function syncFocus(scroll) {
    const f = findFocus();
    const r = rowsByNo[focus.no];
    if (!f || !r) return;
    inner.querySelectorAll('.lfx-live-epg__ev.is-focus').forEach((n) => {
      n.classList.remove('is-focus');
      n.tabIndex = -1;
    });
    const node = f.node;
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
    const d = describe(ctx.scheduler, f.en);
    infoTitle.textContent = d.title;
    infoMeta.textContent = `${clock(f.en.start)}–${clock(f.en.end)} · ${r.ch.no} ${r.ch.name}`;
  }

  function pickAt(no, t) {
    const list = entriesOf(no);
    if (!list.length) return null;
    let best = list[0].en;
    let bd = Infinity;
    for (const { en: e } of list) {
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
    const t = day === today ? now() : dayInfo[day - today].start;
    const cur = ctx.currentChannel();
    const no = rowsByNo[cur] ? cur : Number(Object.keys(rowsByNo)[0]) || 1;
    const e = pickAt(no, t);
    focus = { no, start: e ? e.start : 0 };
    anchorT = t;
  }

  // ---- Scroll-Folge: aktiver Tag und Tagesfenster
  function scheduleSync() {
    if (!opened || rafId) return;
    const raf = window.requestAnimationFrame ? (f) => window.requestAnimationFrame(f) : (f) => setTimeout(f, 16);
    rafId = 1;
    const id = raf(() => {
      rafId = 0;
      syncView();
    });
    if (rafId) rafId = id || 1; // (Rückruf kann synchron gelaufen sein)
  }
  /** Blöcke, die links über den sichtbaren Rand ragen: sichtbare Restbreite als --lfx-live-epg-vis (Text bleibt ganz sichtbar, gekürzt mit …). */
  function updateVis() {
    const { chanW } = metrics();
    const edge = scroller.getBoundingClientRect().left + chanW;
    let em = 16;
    let pad = 0;
    inner.querySelectorAll('.lfx-live-epg__ev').forEach((node) => {
      const r = node.getBoundingClientRect();
      if (r.left < edge && r.right > edge) {
        const cs = typeof getComputedStyle === 'function' ? getComputedStyle(node) : null;
        if (cs) {
          em = parseFloat(cs.fontSize) || em;
          pad = parseFloat(cs.paddingRight) || 0;
        }
        const vis = Math.max(0, r.right - edge - 0.3 * em - pad);
        node.style.setProperty('--lfx-live-epg-vis', Math.round(vis) + 'px');
      } else if (node.style.getPropertyValue('--lfx-live-epg-vis')) {
        node.style.removeProperty('--lfx-live-epg-vis');
      }
    });
  }
  function syncView() {
    if (!opened || !dayInfo.length) return;
    updateVis();
    if (lock && Date.now() < lock.until) {
      setWindow(lock.i);
      return;
    }
    lock = null;
    const { pm, visible } = metrics();
    if (pm <= 0) return;
    // Tag unter der Mitte des sichtbaren Zeitbereichs (links liegt die sticky Senderspalte)
    const centerMin = (scroller.scrollLeft + visible / 2) / pm;
    let c = 0;
    dayInfo.forEach((d, i) => {
      if (d.off <= centerMin) c = i;
    });
    setWindow(c);
    if (today + c !== day) {
      day = today + c;
      updateDays();
      updateChanHeads();
    }
  }

  function setDay(D) {
    D = Math.max(today, Math.min(today + DAYS - 1, D));
    day = D;
    closeDetail();
    setWindow(D - today);
    updateDays();
    updateChanHeads();
    focusDefault();
    syncFocus(false);
    scrollToDay(D, true);
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
    const f = findFocus();
    if (!f) return;
    const m = rowsByNo[focus.no];
    const en = f.en;
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
    let list = entriesOf(focus.no);
    let i = list.findIndex((x) => x.en.start === focus.start);
    if (i < 0) {
      // Fokus liegt in einem inzwischen abgebauten Tag
      setWindow(dayIndexOfTime(focus.start));
      list = entriesOf(focus.no);
      i = list.findIndex((x) => x.en.start === focus.start);
      if (i < 0) return;
    }
    let n = list[i + dx];
    if (!n) {
      // Tagesgrenze: Nachbartag bei Bedarf rendern; Anfang heute / Ende Tag 7 bleiben Grenzen
      const target = list[i].di + dx;
      if (target < 0 || target >= DAYS) return;
      setWindow(target);
      list = entriesOf(focus.no);
      i = list.findIndex((x) => x.en.start === focus.start);
      n = list[i + dx];
      if (!n) return;
    }
    focus.start = n.en.start;
    anchorT = n.en.start;
    syncFocus(true);
  }
  function moveV(dy) {
    const no = focus.no + dy;
    if (!rowsByNo[no]) return;
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
        if (day > today) setDay(day - 1);
        return true;
      case 'green':
        if (day < today + DAYS - 1) setDay(day + 1);
        return true;
      case 'yellow':
        setDay(today);
        return true;
      default:
        return false;
    }
  }

  // ---- Zeiger: Scroll-Folge, Maus-Ziehen, Mausrad über der Zeitleiste
  scroller.addEventListener('scroll', scheduleSync, { passive: true });
  scroller.addEventListener('pointerdown', (e) => {
    lock = null;
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sl: scroller.scrollLeft, st: scroller.scrollTop, active: false };
  });
  scroller.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < DRAG_PX) return;
      drag.active = true;
      scroller.classList.add('is-dragging');
      try {
        scroller.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    scroller.scrollLeft = Math.max(0, drag.sl - dx);
    scroller.scrollTop = Math.max(0, drag.st - dy);
  });
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId != null && e.pointerId !== drag.id)) return;
    const was = drag.active;
    try {
      if (was) scroller.releasePointerCapture(drag.id);
    } catch {
      /* ignore */
    }
    drag = null;
    scroller.classList.remove('is-dragging');
    if (was) {
      suppressClick = true;
      setTimeout(() => {
        suppressClick = false;
      }, 0);
    }
  };
  scroller.addEventListener('pointerup', endDrag);
  scroller.addEventListener('pointercancel', endDrag);
  scroller.addEventListener(
    'click',
    (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    },
    true
  );
  scroller.addEventListener(
    'wheel',
    (e) => {
      lock = null;
      if (e.shiftKey || !e.target || !e.target.closest || !e.target.closest('.lfx-live-epg__ruler')) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      scroller.scrollLeft = Math.max(0, scroller.scrollLeft + e.deltaY * (e.deltaMode === 1 ? 16 : 1));
    },
    { passive: false }
  );

  function open() {
    opened = true;
    gen++;
    el.hidden = false;
    el.classList.add('is-open');
    today = ctx.broadcastDayOf(now());
    day = today;
    prepared.clear();
    planCache.clear();
    detailEntry = null;
    lock = null;
    detail.hidden = true;
    el.classList.remove('has-detail');
    buildDays();
    build();
    focusDefault();
    syncFocus(true);
    scrollToDay(day, false);
  }

  function close() {
    opened = false;
    detailEntry = null;
    drag = null;
    clearTimeout(lockTimer);
    if (rafId && window.cancelAnimationFrame) window.cancelAnimationFrame(rafId);
    rafId = 0;
    el.hidden = true;
    el.classList.remove('is-open', 'has-detail');
    detail.hidden = true;
  }

  function tick() {
    if (opened) refreshNow();
  }

  return { el, open, close, isOpen: () => opened, onKey, tick };
}
