// Videotext: 40-Spalten-Blockgrafik-Seiten (100, 300, 301–318). Deckt das Bild ganz ab (has-ttx).
import { h, fit, describe, shortName, secondsOf, pad2 } from './overlay-util.js';

const COLS = 40;
const MIN = 60000;
const CH_PER_SUB = 9; // Seite 300: Sender je Unterseite
const ROWS_PER_SUB = 18; // Seiten 3xx: Zeilen je Unterseite

const seg = (t, fg, extra) => Object.assign({ t, fg: fg || 'white' }, extra || {});
const row = (segs, opts) => Object.assign({ segs: Array.isArray(segs) ? segs : [segs] }, opts || {});
const blank = () => row(seg(''));

function isValidPage(p) {
  return p === 100 || p === 300 || (p >= 301 && p <= 318);
}

export function createTeletext(ctx) {
  const el = h('div', 'lfx-live-ttx');
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Videotext');
  const screen = h('div', 'lfx-live-ttx__screen');
  el.append(screen);

  let opened = false;
  let page = 100;
  let sub = 0;
  let subCount = 1;
  let input = '';
  let cursor = 0;
  let items = []; // [{ r, s }] auswählbare Segmente
  let rows = [];
  let lastMinute = -1;
  let headerEl = null;
  const prepared = new Set();

  const now = () => ctx.now();
  const chans = () => {
    const l = ctx.channels ? ctx.channels() : ctx.scheduler.channels();
    return Array.isArray(l) ? l : [];
  };
  const chanOf = (no) => chans().find((c) => c.no === no) || { no, name: 'Sender ' + no };

  function ensurePrepared() {
    const D = ctx.broadcastDayOf(now());
    const s = ctx.scheduler;
    if (!s || typeof s.prepare !== 'function' || prepared.has(D)) return;
    prepared.add(D);
    let p;
    try {
      p = s.prepare([D]);
    } catch {
      return;
    }
    if (p && typeof p.then === 'function') {
      p.then(
        () => {
          if (opened) rebuild(true);
        },
        () => {}
      );
    }
  }

  // ---- Seiten bauen
  function headerSegs() {
    const t = now();
    const f = ctx.formatDay(ctx.broadcastDayOf(t));
    const left = input ? 'P' + input.padEnd(3, '-') : 'P' + page;
    const clockTxt = ctx.formatClock(t) + ':' + pad2(secondsOf(t));
    return [seg(left, input ? 'yellow' : 'white'), seg('  LIVE-TEXT  ', 'yellow'), seg(f.weekday + ' ' + f.date + '  ', 'white'), seg(clockTxt, 'cyan', { clock: true })];
  }

  function footerSegs() {
    const cur = ctx.currentChannel();
    const base = page >= 301 && page <= 318 ? page - 300 : cur;
    const next = (base % 18) + 1;
    return [
      seg(fit('Übersicht', 10), 'white', { bg: 'red', act: { page: 100 }, nocursor: true }),
      seg(fit('Jetzt+Danach', 12), 'black', { bg: 'green', act: { page: 300 }, nocursor: true }),
      seg(fit(shortName(chanOf(cur)), 9), 'black', { bg: 'yellow', act: { page: 300 + cur }, nocursor: true }),
      seg(fit(shortName(chanOf(next)), 9), 'white', { bg: 'blue', act: { page: 300 + next }, nocursor: true }),
    ];
  }

  function pageIndex() {
    const out = [row(seg(fit('LIVE-TEXT', 20), 'yellow'), { dbl: true, bg: 'blue' }), blank()];
    out.push(row([seg(fit('300', 4), 'yellow', { act: { page: 300 } }), seg('Jetzt & Danach, alle Sender', 'white')]));
    out.push(row([seg(fit('301–318', 8), 'yellow'), seg('Tagesprogramm je Sender', 'white')]));
    out.push(blank());
    out.push(row(seg('Sender', 'green')));
    const cs = chans();
    const half = Math.ceil(cs.length / 2);
    for (let i = 0; i < half; i++) {
      const segs = [];
      [cs[i], cs[i + half]].forEach((c) => {
        if (!c) return;
        segs.push(seg(fit(300 + c.no + ' ' + shortName(c), 20), 'cyan', { act: { page: 300 + c.no } }));
      });
      out.push(row(segs));
    }
    return out;
  }

  function lineFor(entry) {
    if (!entry) return { title: '', start: '' };
    const d = describe(ctx.scheduler, entry);
    return { title: d.title || (entry.type === 'filler' ? entry.label || 'Pause' : ''), start: ctx.formatClock(entry.start) };
  }

  function pageNow() {
    const t = now();
    const cs = chans();
    subCount = Math.max(1, Math.ceil(cs.length / CH_PER_SUB));
    sub = Math.min(sub, subCount - 1);
    const out = [row([seg(fit('JETZT & DANACH', 28), 'yellow'), seg(fit(sub + 1 + '/' + subCount, 12).trimEnd(), 'white')], { dbl: true, bg: 'blue' })];
    cs.slice(sub * CH_PER_SUB, (sub + 1) * CH_PER_SUB).forEach((c) => {
      let cur = null;
      let nxt = null;
      try {
        const n = ctx.scheduler.nowOn(c.no, t);
        cur = n && n.entry;
        const list = ctx.scheduler.upcoming(c.no, t, 3) || [];
        nxt = list.find((e) => cur && e.start >= cur.end) || null;
      } catch {
        /* Plan nicht verfügbar */
      }
      const a = lineFor(cur);
      const b = lineFor(nxt);
      const act = { tune: c.no };
      out.push(row([seg(fit(c.no, 3).slice(0, 3), 'yellow', { act }), seg(fit(shortName(c), 10) + ' ', 'cyan', { act, nocursor: true }), seg(a.start + ' ', 'white', { act, nocursor: true }), seg(fit(a.title, 20), 'white', { act, nocursor: true })]));
      out.push(row([seg(fit('', 4), 'white'), seg(fit('Danach ' + b.start + ' ' + b.title, 36), 'green', { act, nocursor: true })]));
    });
    return out;
  }

  function pageChannel() {
    const no = page - 300;
    const c = chanOf(no);
    const D = ctx.broadcastDayOf(now());
    let plan;
    try {
      plan = (ctx.scheduler.planDay(no, D) || []).filter((e) => e.type !== 'filler');
    } catch {
      plan = [];
    }
    subCount = Math.max(1, Math.ceil(plan.length / ROWS_PER_SUB));
    sub = Math.min(sub, subCount - 1);
    const f = ctx.formatDay(D);
    const out = [row([seg(fit(page + ' ' + shortName(c), 28), 'yellow'), seg(sub + 1 + '/' + subCount, 'white')], { dbl: true, bg: 'blue' })];
    const theme = plan.find((e) => e.theme);
    out.push(row(seg(fit(f.weekday + ' ' + f.date + (theme ? '  Thema: ' + theme.theme : ''), COLS), 'green')));
    const t = now();
    let hint = 0;
    let idx = 0;
    plan.slice(sub * ROWS_PER_SUB, (sub + 1) * ROWS_PER_SUB).forEach((e) => {
      const l = lineFor(e);
      const live = e.start <= t && t < e.end;
      if (live) hint = idx;
      idx++;
      const act = { tune: no };
      out.push(row([seg(l.start + ' ', live ? 'yellow' : 'cyan', { act }), seg(fit(l.title, 34), live ? 'yellow' : 'white', { act, nocursor: true })]));
    });
    out.hint = hint;
    return out;
  }

  function pageMissing() {
    return [row(seg(fit('SEITE NICHT VORHANDEN', 24), 'white'), { dbl: true, bg: 'red' }), blank(), row(seg('Bitte eine andere Seite wählen:', 'yellow')), row(seg('100 Übersicht', 'cyan')), row(seg('300 Jetzt & Danach', 'cyan')), row(seg('301–318 Tagesprogramm', 'cyan'))];
  }

  function build() {
    subCount = 1;
    let body;
    if (!isValidPage(page)) body = pageMissing();
    else if (page === 100) body = pageIndex();
    else if (page === 300) body = pageNow();
    else body = pageChannel();
    return body;
  }

  // ---- DOM
  function rebuild(keepCursor) {
    const body = build();
    const hint = body.hint || 0;
    rows = [row(headerSegs()), ...body];
    screen.textContent = '';
    items = [];
    rows.forEach((r, ri) => {
      const rowEl = h('div', 'lfx-live-ttx__row');
      if (r.dbl) rowEl.classList.add('is-dbl');
      if (r.bg) rowEl.classList.add('b-' + r.bg);
      const inner = r.dbl ? h('span', 'lfx-live-ttx__dbl') : rowEl;
      r.segs.forEach((s) => {
        let n;
        if (s.act) {
          n = h('button', 'lfx-live-ttx__seg is-act', s.t);
          n.type = 'button';
          n.tabIndex = -1;
          n.addEventListener('click', () => activate(s.act));
          if (!s.nocursor) items.push({ r: ri, node: n, act: s.act, c: items.filter((i) => i.r === ri).length });
        } else {
          n = h('span', 'lfx-live-ttx__seg', s.t);
        }
        n.classList.add('c-' + s.fg);
        if (s.bg) n.classList.add('b-' + s.bg);
        if (s.clock) headerEl = n;
        inner.append(n);
      });
      if (r.dbl) rowEl.append(inner);
      screen.append(rowEl);
    });
    const foot = h('div', 'lfx-live-ttx__row lfx-live-ttx__foot');
    footerSegs().forEach((s) => {
      const n = h('button', 'lfx-live-ttx__seg is-act c-' + s.fg + ' b-' + s.bg, s.t);
      n.type = 'button';
      n.tabIndex = -1;
      n.addEventListener('click', () => activate(s.act));
      foot.append(n);
    });
    screen.append(foot);
    cursor = keepCursor ? Math.min(cursor, Math.max(0, items.length - 1)) : Math.min(hint, Math.max(0, items.length - 1));
    paintCursor();
  }

  function paintCursor() {
    items.forEach((it, i) => it.node.classList.toggle('is-cursor', i === cursor));
    screen.dataset.page = String(page);
    screen.dataset.sub = String(sub);
  }

  function goPage(p, s) {
    input = '';
    page = p;
    sub = s || 0;
    // Senderseite: Unterseite mit der laufenden Sendung vorwählen
    if (p >= 301 && p <= 318 && s == null) {
      try {
        const t = now();
        const D = ctx.broadcastDayOf(t);
        const plan = (ctx.scheduler.planDay(p - 300, D) || []).filter((e) => e.type !== 'filler');
        const i = plan.findIndex((e) => e.start <= t && t < e.end);
        if (i >= 0) sub = Math.floor(i / ROWS_PER_SUB);
      } catch {
        /* egal */
      }
    }
    rebuild(false);
  }

  function activate(act) {
    if (!act) return;
    if (act.page != null) goPage(act.page);
    else if (act.tune != null) {
      ctx.tune(act.tune);
      ctx.closeOverlay();
    }
  }

  function moveCursor(dy, dx) {
    if (!items.length) return;
    const cur = items[cursor];
    if (dx) {
      const same = items.filter((i) => i.r === cur.r);
      const k = same.indexOf(cur) + dx;
      if (same[k]) cursor = items.indexOf(same[k]);
    } else {
      const cand = items.filter((i) => (dy > 0 ? i.r > cur.r : i.r < cur.r));
      if (cand.length) {
        const rr = dy > 0 ? Math.min(...cand.map((i) => i.r)) : Math.max(...cand.map((i) => i.r));
        const rowItems = cand.filter((i) => i.r === rr);
        cursor = items.indexOf(rowItems.find((i) => i.c === cur.c) || rowItems[rowItems.length - 1]);
      }
    }
    paintCursor();
    const n = items[cursor].node;
    if (typeof n.scrollIntoView === 'function') n.scrollIntoView({ block: 'nearest' });
  }

  function onKey(key) {
    if (!opened) return false;
    if (/^[0-9]$/.test(key)) {
      input += key;
      if (input.length >= 3) goPage(Number(input));
      else rebuild(true);
      return true;
    }
    switch (key) {
      case 'ch+':
      case 'ch-': {
        const list = [100, 300];
        for (let n = 301; n <= 318; n++) list.push(n);
        const fwd = key === 'ch+';
        const next = fwd ? list.find((n) => n > page) : [...list].reverse().find((n) => n < page);
        goPage(next != null ? next : fwd ? list[0] : list[list.length - 1]);
        return true;
      }
      case 'left':
      case 'right': {
        const d = key === 'right' ? 1 : -1;
        if (subCount > 1) {
          sub = (sub + d + subCount) % subCount;
          input = '';
          rebuild(false);
        } else moveCursor(0, d);
        return true;
      }
      case 'up':
        moveCursor(-1, 0);
        return true;
      case 'down':
        moveCursor(1, 0);
        return true;
      case 'ok':
        if (items[cursor]) activate(items[cursor].act);
        return true;
      case 'back':
        if (input) {
          input = '';
          rebuild(true);
          return true;
        }
        return false;
      case 'red':
        goPage(100);
        return true;
      case 'green':
        goPage(300);
        return true;
      case 'yellow':
        goPage(300 + ctx.currentChannel());
        return true;
      case 'blue': {
        const base = page >= 301 && page <= 318 ? page - 300 : ctx.currentChannel();
        goPage(300 + (base % 18) + 1);
        return true;
      }
      default:
        return false;
    }
  }

  function open(arg) {
    opened = true;
    el.hidden = false;
    el.classList.add('is-open');
    const p = Number(arg);
    page = Number.isInteger(p) && p >= 100 && p <= 899 ? p : 100;
    sub = 0;
    input = '';
    lastMinute = Math.floor(now() / MIN);
    goPage(page);
    ensurePrepared();
  }

  function close() {
    opened = false;
    input = '';
    el.hidden = true;
    el.classList.remove('is-open');
  }

  function tick(t) {
    if (!opened) return;
    const tt = t != null ? t : now();
    if (headerEl) headerEl.textContent = ctx.formatClock(tt) + ':' + pad2(secondsOf(tt));
    const m = Math.floor(tt / MIN);
    if (m !== lastMinute) {
      lastMinute = m;
      rebuild(true);
    }
  }

  return { el, open, close, isOpen: () => opened, onKey, tick };
}
