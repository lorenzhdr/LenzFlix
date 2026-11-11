// Fernsehzeitung „LIVE Programm“: blätterbares Heft als Overlay (Name 'guide'). Vertrag: docs/live.md („Heft-Ansicht“).
// Importiert nur Dateien aus src/js/live/. Das Magazin kommt per ctx.buildMagazine() (Promise<Magazine>), nie per Import.
//
// ctx: style() → 'crt80'|'silver'|'flat'|'plain', imageUrl(id,{maxWidth}), buildMagazine(), downloadPdf(mag,onProgress) → {url,fileName},
//      toast?(text), closeOverlay(). Optional für Tests/Sonderfälle: ctx.mode ('double'|'single'|Funktion, sonst automatisch per Größe),
//      ctx.animate (false = ohne Umblätter-Animation), ctx.flipMs (Standard 600).
import { h } from '../ui/overlay-util.js';

const FLIP_MS = 600;
const SINGLE_MS = 320;
const SWIPE_PX = 40;

function reducedMotion() {
  try {
    return !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/** Doppelseiten-Paarung: Cover allein (rechts), dann Paare, Rückseite allein (links). Einträge: [links, rechts] (Index oder null). */
export function pairSpreads(pages, mode) {
  const n = pages.length;
  if (mode === 'single') return pages.map((_, i) => [null, i]);
  const out = [];
  if (!n) return out;
  out.push([null, 0]);
  let end = n;
  const hasBack = n > 1 && pages[n - 1].kind === 'back';
  if (hasBack) end = n - 1;
  for (let i = 1; i < end; i += 2) out.push([i, i + 1 < end ? i + 1 : null]);
  if (hasBack) out.push([n - 1, null]);
  return out;
}

export function createMagazine(ctx) {
  const el = h('div', 'lfx-live-mag');
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Fernsehzeitung');
  el.dataset.style = 'flat';

  // ---- Kopfleiste
  const bar = h('div', 'lfx-live-mag__bar');
  const mast = h('div', 'lfx-live-mag__mast', 'LIVE Programm');
  const pageInfo = h('div', 'lfx-live-mag__pageinfo');
  pageInfo.setAttribute('aria-live', 'polite');
  const daysEl = h('div', 'lfx-live-mag__days');
  daysEl.setAttribute('role', 'group');
  daysEl.setAttribute('aria-label', 'Tag wählen');
  const pdfBtn = h('button', 'lfx-live-mag__btn lfx-live-mag__pdfbtn', 'Als PDF herunterladen');
  pdfBtn.type = 'button';
  pdfBtn.setAttribute('aria-label', 'Als PDF herunterladen');
  const pdfLink = h('a', 'lfx-live-mag__pdf', 'PDF fertig – herunterladen');
  pdfLink.hidden = true;
  const closeBtn = h('button', 'lfx-live-mag__btn lfx-live-mag__close', 'Schließen');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Fernsehzeitung schließen');
  pdfBtn.setAttribute('title', 'Als PDF herunterladen');
  bar.append(mast, pageInfo, daysEl, pdfBtn, pdfLink, closeBtn);

  // ---- Bühne
  const stage = h('div', 'lfx-live-mag__stage');
  const book = h('div', 'lfx-live-mag__book');
  const slotL = h('div', 'lfx-live-mag__slot is-left');
  const slotR = h('div', 'lfx-live-mag__slot is-right');
  const edgePrev = h('div', 'lfx-live-mag__edge is-prev');
  const edgeNext = h('div', 'lfx-live-mag__edge is-next');
  edgePrev.setAttribute('aria-hidden', 'true');
  edgeNext.setAttribute('aria-hidden', 'true');
  const fold = h('div', 'lfx-live-mag__fold');
  book.append(slotL, slotR, fold, edgePrev, edgeNext);
  const status = h('div', 'lfx-live-mag__status');
  status.setAttribute('role', 'status');
  stage.append(book, status);
  el.append(bar, stage);

  // ---- Zustand
  let opened = false;
  let magazine = null;
  let spreads = [];
  let cur = 0; // Index in spreads
  let mode = 'single';
  let token = 0;
  let busy = false;
  let queued = 0; // gepufferte Richtung (−1/+1), nur eine
  let flipTimer = null;
  let leaf = null;
  let pdfState = 'idle'; // idle | busy | done
  let wantAuto = false;
  let barFocus = -1;
  let ro = null;
  let rafs = new Set();

  const pages = () => (magazine ? magazine.pages : []);
  const animOn = () => ctx.animate !== false && !reducedMotion();

  function resolveMode() {
    const m = typeof ctx.mode === 'function' ? ctx.mode() : ctx.mode;
    if (m === 'double' || m === 'single') return m;
    // Handy (auch im Querformat): immer Einzelseite, vertikal scrollbar
    if (el.closest && el.closest('.lfx-live-app.is-phone')) return 'single';
    const w = el.clientWidth;
    const hh = el.clientHeight;
    return w > 760 && w > hh ? 'double' : 'single';
  }

  // ---- Seiten bauen
  function img(tip, maxWidth) {
    const fig = h('span', 'lfx-live-mag__img');
    const initial = h('span', 'lfx-live-mag__initial', String((tip && tip.title) || '?').trim().charAt(0).toUpperCase());
    fig.append(initial);
    if (tip && tip.imageId) {
      const im = document.createElement('img');
      im.loading = 'lazy';
      im.decoding = 'async';
      im.alt = '';
      im.src = ctx.imageUrl(tip.imageId, { maxWidth });
      im.addEventListener('error', () => {
        fig.classList.add('is-failed');
        im.remove();
      });
      fig.append(im);
    } else fig.classList.add('is-failed');
    return fig;
  }

  function badgeEls(list) {
    const w = h('span', 'lfx-live-mag__badges');
    (list || []).forEach((b) => w.append(h('span', 'lfx-live-mag__badge' + (/^ab \d+/.test(b) ? ' is-age' : ''), b)));
    return w;
  }

  function dayTag(p) {
    return p.weekday ? p.weekday + (p.date ? ' ' + p.date : '') : '';
  }

  function head(p) {
    const hd = h('div', 'lfx-live-mag__head');
    hd.append(h('span', 'lfx-live-mag__head-title', magazine.title || 'LIVE Programm'), h('span', 'lfx-live-mag__head-day', dayTag(p)));
    return hd;
  }

  function foot(p) {
    const f = h('div', 'lfx-live-mag__foot');
    const n = h('span', 'lfx-live-mag__foot-no', String(p.no));
    const d = h('span', 'lfx-live-mag__foot-day', dayTag(p));
    f.append(p.no % 2 === 0 ? n : d, p.no % 2 === 0 ? d : n);
    return f;
  }

  function meta(t) {
    return [t.kindLabel, t.year, (t.genres || []).join(', '), t.runMin ? t.runMin + ' Min.' : ''].filter(Boolean).join(' · ');
  }

  function bodyCover(p, body) {
    const c = magazine.cover || {};
    const mh = h('div', 'lfx-live-mag__masthead');
    mh.append(h('h2', 'lfx-live-mag__mh-title', magazine.title || 'LIVE Programm'), h('div', 'lfx-live-mag__mh-sub', magazine.subtitle || ''));
    body.append(mh);
    if (c.hero) {
      const t = c.hero;
      const hero = h('div', 'lfx-live-mag__hero');
      const txt = h('div', 'lfx-live-mag__hero-text');
      txt.append(
        h('div', 'lfx-live-mag__kicker', t.kindLabel || 'Tipp der Woche'),
        h('h3', 'lfx-live-mag__hero-title', t.title),
        h('div', 'lfx-live-mag__when', [t.time, t.channelName].filter(Boolean).join(' · ')),
        h('div', 'lfx-live-mag__meta', meta(t))
      );
      if (t.overview) txt.append(h('p', 'lfx-live-mag__overview', t.overview));
      txt.append(badgeEls(t.badges));
      hero.append(img(t, 600), txt);
      body.append(hero);
    }
    const ts = c.teasers || [];
    if (ts.length) {
      const box = h('div', 'lfx-live-mag__teasers');
      box.append(h('div', 'lfx-live-mag__teasers-h', 'Thementage'));
      const ul = h('ul', 'lfx-live-mag__teasers-l');
      ts.forEach((t) => {
        const li = h('li');
        li.append(h('b', null, t.weekday), document.createTextNode(' ' + (t.label || '')));
        ul.append(li);
      });
      box.append(ul);
      body.append(box);
    }
  }

  function bodyTips(p, body) {
    const list = h('ol', 'lfx-live-mag__tips');
    (p.tips || []).forEach((t) => {
      const li = h('li', 'lfx-live-mag__tip');
      const txt = h('div', 'lfx-live-mag__tip-text');
      txt.append(
        h('div', 'lfx-live-mag__when', [t.time, t.channelName].filter(Boolean).join(' · ')),
        h('h3', 'lfx-live-mag__tip-title', t.title)
      );
      if (t.sub) txt.append(h('div', 'lfx-live-mag__sub', t.sub));
      txt.append(h('div', 'lfx-live-mag__meta', meta(t)), badgeEls(t.badges));
      if (t.overview) txt.append(h('p', 'lfx-live-mag__overview', t.overview));
      li.append(img(t, 300), txt);
      list.append(li);
    });
    if (p.theme) body.append(h('div', 'lfx-live-mag__theme', p.theme));
    body.append(list);
  }

  function rowEl(r) {
    const li = h('li', 'lfx-live-mag__row is-' + (r.kind || 'program'));
    li.append(h('b', 'lfx-live-mag__time', r.time || ''));
    const t = h('span', 'lfx-live-mag__rt');
    t.append(h('span', 'lfx-live-mag__rtitle', r.title || ''));
    if (r.sub) t.append(h('span', 'lfx-live-mag__rsub', ' ' + r.sub));
    li.append(t);
    (r.badges || []).forEach((b) => li.append(h('span', 'lfx-live-mag__badge is-mini' + (/^ab \d+/.test(b) ? ' is-age' : ''), b)));
    return li;
  }

  function cellEl(ch) {
    const cell = h('section', 'lfx-live-mag__cell');
    const hd = h('h4', 'lfx-live-mag__cell-h');
    hd.append(h('b', 'lfx-live-mag__cell-no', String(ch.no)), document.createTextNode(' ' + String(ch.name || '').replace(/^LIVE\s+/i, '')));
    cell.append(hd);
    if (ch.theme) cell.append(h('div', 'lfx-live-mag__cell-theme', ch.theme));
    const ul = h('ul', 'lfx-live-mag__rows');
    (ch.rows || []).forEach((r) => ul.append(rowEl(r)));
    cell.append(ul);
    return cell;
  }

  function bodyGrid(p, body, cls, title) {
    if (title) body.append(h('div', 'lfx-live-mag__section', title));
    const grid = h('div', 'lfx-live-mag__grid ' + cls);
    (p.channels || []).forEach((ch) => grid.append(cellEl(ch)));
    body.append(grid);
  }

  function bodyBack(p, body) {
    body.append(h('h3', 'lfx-live-mag__back-h', 'Hinweise'));
    const ul = h('ul', 'lfx-live-mag__notes');
    [
      'Für alle Zuschauer läuft zur selben Zeit dasselbe Programm – wer einschaltet, steigt mitten in der Sendung ein.',
      'Sendungen ab 16 und ab 18 Jahren sind gekennzeichnet. Das Abendprogramm ab 22 Uhr (ab 18 ab 23 Uhr) ist für Erwachsene gedacht.',
      'Nachts läuft ein Füllprogramm, einige Sender beenden ihren Sendetag mit dem Sendeschluss.',
      'Änderungen der Mediathek können das Programm verschieben; maßgeblich ist die Anzeige am Fernseher.',
      'Diese Zeitung lässt sich als PDF herunterladen, zum Ausdrucken im A4-Format.'
    ].forEach((t) => ul.append(h('li', null, t)));
    body.append(ul, h('div', 'lfx-live-mag__imprint', (magazine.title || 'LIVE Programm') + ' · ' + (magazine.subtitle || '')));
  }

  function buildPage(i) {
    const p = pages()[i];
    const page = h('article', 'lfx-live-mag__page');
    page.dataset.kind = p.kind;
    page.dataset.no = String(p.no);
    page.dataset.index = String(i);
    page.setAttribute('aria-label', 'Seite ' + p.no);
    const body = h('div', 'lfx-live-mag__body');
    if (p.kind === 'cover') bodyCover(p, body);
    else if (p.kind === 'tips') bodyTips(p, body);
    else if (p.kind === 'evening') bodyGrid(p, body, 'is-evening', 'Abendprogramm ab 20:15 Uhr');
    else if (p.kind === 'day') bodyGrid(p, body, 'is-day', 'Tagesprogramm · Sender ' + (p.part === 2 ? '10–18' : '1–9'));
    else if (p.kind === 'back') bodyBack(p, body);
    if (p.kind === 'cover' || p.kind === 'back') page.append(body);
    else page.append(head(p), body, foot(p));
    if (p.kind === 'day' || p.kind === 'evening') scheduleFit(page);
    return page;
  }

  /** Überlauf je Sender-Spalte sauber abschneiden („…“), sobald das Layout steht. */
  function scheduleFit(page) {
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf !== 'function') return;
    const id = raf(() => {
      rafs.delete(id);
      fitCells(page);
    });
    rafs.add(id);
  }
  function fitCells(page) {
    page.querySelectorAll('.lfx-live-mag__rows').forEach((ul) => {
      if (ul.scrollHeight <= ul.clientHeight + 1) return;
      const more = h('li', 'lfx-live-mag__row is-more', '…');
      ul.append(more);
      while (ul.scrollHeight > ul.clientHeight + 1 && ul.children.length > 2) ul.children[ul.children.length - 2].remove();
    });
  }

  // ---- Anzeige
  function slotFill(slot, idx) {
    slot.textContent = '';
    slot.classList.toggle('is-empty', idx == null);
    if (idx != null) slot.append(buildPage(idx));
  }

  function showSpread(i) {
    const s = spreads[i] || [null, null];
    slotFill(slotL, s[0]);
    slotFill(slotR, s[1]);
    updateChrome();
  }

  function pagesOf(i) {
    return (spreads[i] || []).filter((x) => x != null);
  }

  function currentDayIdx() {
    const ps = pagesOf(cur).map((x) => pages()[x]);
    const withD = ps.find((p) => p.D != null);
    if (!withD) return -1;
    return (magazine.days || []).findIndex((d) => d.D === withD.D);
  }

  function updateChrome() {
    const ps = pagesOf(cur).map((x) => pages()[x]);
    const total = pages().length;
    if (ps.length) {
      const nos = ps.map((p) => p.no);
      pageInfo.textContent = 'Seite ' + (nos.length > 1 ? nos[0] + '–' + nos[nos.length - 1] : nos[0]) + ' von ' + total;
    } else pageInfo.textContent = '';
    const di = currentDayIdx();
    [...daysEl.children].forEach((b, k) => {
      b.classList.toggle('is-active', k === di);
      if (k === di) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    book.classList.toggle('is-first', cur <= 0);
    book.classList.toggle('is-last', cur >= spreads.length - 1);
    book.dataset.spread = String(cur);
  }

  function buildDays() {
    daysEl.textContent = '';
    (magazine.days || []).forEach((d, k) => {
      const b = h('button', 'lfx-live-mag__day', d.weekday);
      b.type = 'button';
      b.setAttribute('aria-label', 'Zu ' + d.weekday + ' ' + (d.date || ''));
      b.title = d.weekday + ' ' + (d.date || '');
      b.addEventListener('click', () => jumpDay(k));
      daysEl.append(b);
    });
  }

  function applyMode(keepPage) {
    const m = resolveMode();
    book.classList.toggle('is-double', m === 'double');
    book.classList.toggle('is-single', m !== 'double');
    el.dataset.mode = m;
    if (m === mode && spreads.length) return;
    const pageIdx = spreads.length ? pagesOf(cur)[0] : 0;
    mode = m;
    spreads = pairSpreads(pages(), mode);
    if (keepPage && pageIdx != null) {
      const f = spreads.findIndex((s) => s.includes(pageIdx));
      cur = f < 0 ? 0 : f;
    } else cur = 0;
    if (magazine) {
      finishFlip();
      showSpread(cur);
    }
  }

  // ---- Blättern
  function finishFlip() {
    if (flipTimer) {
      clearTimeout(flipTimer);
      flipTimer = null;
    }
    if (leaf) {
      leaf.remove();
      leaf = null;
    }
    slotR.classList.remove('is-flipping-in-next', 'is-flipping-in-prev');
    slotL.classList.remove('is-flipping-in-next', 'is-flipping-in-prev');
    book.classList.remove('is-flipping');
    busy = false;
  }

  function goTo(target) {
    if (!magazine || !spreads.length) return;
    target = Math.max(0, Math.min(spreads.length - 1, target));
    if (target === cur) return;
    if (busy) {
      queued = target > cur ? 1 : -1;
      return;
    }
    const dir = target > cur ? 1 : -1;
    const from = spreads[cur];
    const to = spreads[target];
    const adjacent = Math.abs(target - cur) === 1;
    const ms = ctx.flipMs != null ? ctx.flipMs : mode === 'double' ? FLIP_MS : SINGLE_MS;
    if (!animOn() || !adjacent || ms <= 0) {
      cur = target;
      showSpread(cur);
      return;
    }
    busy = true;
    book.classList.add('is-flipping');
    const prev = cur;
    if (mode === 'double') {
      // Blatt: vorwärts über der rechten Hälfte (Vorderseite = rechte Seite, Rückseite = linke Seite des Ziels)
      leaf = h('div', 'lfx-live-mag__leaf ' + (dir > 0 ? 'is-next' : 'is-prev'));
      const front = h('div', 'lfx-live-mag__face is-front');
      const back = h('div', 'lfx-live-mag__face is-back');
      const fi = dir > 0 ? from[1] : from[0];
      const bi = dir > 0 ? to[0] : to[1];
      if (fi != null) front.append(buildPage(fi));
      if (bi != null) back.append(buildPage(bi));
      const shade = h('div', 'lfx-live-mag__leaf-shade');
      leaf.append(front, back, shade);
      leaf.style.transitionDuration = ms + 'ms';
      book.append(leaf);
      // darunter liegt schon die Zielseite der Gegenseite
      if (dir > 0) slotFill(slotR, to[1]);
      else slotFill(slotL, to[0]);
      void leaf.offsetWidth;
      leaf.classList.add('is-turning');
    } else {
      showSpread(target);
      slotR.classList.add(dir > 0 ? 'is-flipping-in-next' : 'is-flipping-in-prev');
    }
    cur = target;
    flipTimer = setTimeout(() => {
      flipTimer = null;
      finishFlip();
      showSpread(cur);
      const q = queued;
      queued = 0;
      if (q && cur + q >= 0 && cur + q < spreads.length && prev !== cur) goTo(cur + q);
    }, ms + 30);
    updateChrome();
  }

  const step = (d) => goTo(cur + d);

  function pageSpread(pageIdx) {
    const f = spreads.findIndex((s) => s.includes(pageIdx));
    return f < 0 ? 0 : f;
  }

  function jumpDay(k) {
    const d = (magazine.days || [])[k];
    if (!d) return;
    const idx = pages().findIndex((p) => p.kind === 'tips' && p.D === d.D);
    if (idx >= 0) goTo(pageSpread(idx));
  }

  function stepDay(dir) {
    if (!magazine) return;
    const n = (magazine.days || []).length;
    let di = currentDayIdx();
    if (di < 0) {
      const onBack = pagesOf(cur).some((x) => pages()[x].kind === 'back');
      di = onBack ? n : -1;
    }
    const t = di + dir;
    if (t < 0 || t >= n) return;
    jumpDay(t);
  }

  // ---- Laden
  function setStatus(text, kind) {
    status.textContent = text || '';
    status.dataset.kind = kind || '';
    status.hidden = !text;
  }

  function resetPdf() {
    if (pdfLink.href && /^blob:/.test(pdfLink.getAttribute('href') || '')) {
      try {
        URL.revokeObjectURL(pdfLink.getAttribute('href'));
      } catch {
        /* egal */
      }
    }
    pdfState = 'idle';
    pdfLink.hidden = true;
    pdfLink.removeAttribute('href');
    pdfLink.removeAttribute('download');
    pdfBtn.hidden = false;
    pdfBtn.disabled = false;
    pdfBtn.textContent = 'Als PDF herunterladen';
  }

  async function startPdf() {
    if (pdfState !== 'idle' || !magazine) return;
    pdfState = 'busy';
    pdfBtn.disabled = true;
    const myMag = magazine;
    const total = myMag.pages.length;
    pdfBtn.textContent = 'PDF wird erstellt … 0/' + total;
    try {
      const r = await ctx.downloadPdf(myMag, (done, tot) => {
        if (magazine === myMag && pdfState === 'busy') pdfBtn.textContent = 'PDF wird erstellt … ' + done + '/' + (tot || total);
      });
      if (magazine !== myMag || !opened) {
        if (r && r.url && /^blob:/.test(r.url)) {
          try {
            URL.revokeObjectURL(r.url);
          } catch {
            /* egal */
          }
        }
        return;
      }
      pdfLink.href = r.url;
      pdfLink.setAttribute('download', r.fileName);
      pdfLink.hidden = false;
      pdfBtn.hidden = true;
      pdfState = 'done';
      if (ctx.toast) ctx.toast('PDF fertig.');
    } catch {
      if (magazine !== myMag) return;
      pdfState = 'idle';
      pdfBtn.disabled = false;
      pdfBtn.textContent = 'Als PDF herunterladen';
      if (ctx.toast) ctx.toast('Das PDF konnte nicht erstellt werden.');
      else setStatus('Das PDF konnte nicht erstellt werden.', 'error');
    }
  }

  function open(opts) {
    const o = opts || {};
    opened = true;
    el.hidden = false;
    el.dataset.style = ctx.style() || 'flat';
    wantAuto = !!o.autoPdf;
    barFocus = -1;
    finishFlip();
    queued = 0;
    const my = ++token;
    magazine = null;
    spreads = [];
    cur = 0;
    mode = '';
    slotL.textContent = '';
    slotR.textContent = '';
    daysEl.textContent = '';
    pageInfo.textContent = '';
    resetPdf();
    pdfBtn.disabled = true;
    book.hidden = true;
    el.classList.add('is-loading');
    setStatus('Heft wird gedruckt …', 'loading');
    let p;
    try {
      p = Promise.resolve(ctx.buildMagazine());
    } catch (e) {
      p = Promise.reject(e);
    }
    p.then(
      (m) => {
        if (my !== token || !opened) return;
        if (!m || !Array.isArray(m.pages) || !m.pages.length) {
          el.classList.remove('is-loading');
          setStatus('Das Heft konnte nicht gedruckt werden.', 'error');
          return;
        }
        magazine = m;
        el.classList.remove('is-loading');
        setStatus('');
        book.hidden = false;
        pdfBtn.disabled = false;
        buildDays();
        applyMode(false);
        if (wantAuto) {
          wantAuto = false;
          startPdf();
        }
      },
      () => {
        if (my !== token || !opened) return;
        el.classList.remove('is-loading');
        setStatus('Das Heft konnte nicht gedruckt werden. Bitte später noch einmal versuchen.', 'error');
      }
    );
    if (typeof ResizeObserver === 'function' && !ro) {
      ro = new ResizeObserver(() => {
        if (opened && magazine) applyMode(true);
      });
      ro.observe(el);
    }
  }

  function close() {
    if (!opened) return;
    opened = false;
    token++;
    finishFlip();
    el.hidden = true;
    if (ro) {
      ro.disconnect();
      ro = null;
    }
    const cancel = globalThis.cancelAnimationFrame;
    rafs.forEach((id) => typeof cancel === 'function' && cancel(id));
    rafs.clear();
    slotL.textContent = '';
    slotR.textContent = '';
    magazine = null;
    resetPdf();
  }

  // ---- Eingaben
  const barButtons = () => [...daysEl.children, pdfBtn, pdfLink, closeBtn].filter((b) => !b.hidden && !b.disabled);

  function focusBar(i) {
    const bs = barButtons();
    if (!bs.length) return;
    barFocus = Math.max(0, Math.min(bs.length - 1, i));
    bs[barFocus].focus();
  }

  function onKey(key) {
    if (!opened) return false;
    switch (key) {
      case 'left':
      case 'right': {
        if (barFocus >= 0) {
          focusBar(barFocus + (key === 'right' ? 1 : -1));
          return true;
        }
        step(key === 'right' ? 1 : -1);
        return true;
      }
      case 'red':
        stepDay(-1);
        return true;
      case 'green':
        stepDay(1);
        return true;
      case 'up':
        focusBar(barFocus < 0 ? barButtons().length - 1 : barFocus);
        return true;
      case 'down':
        if (barFocus >= 0 && document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
        barFocus = -1;
        return true;
      case 'ok': {
        if (barFocus < 0) return false;
        const b = barButtons()[barFocus];
        if (b) b.click();
        return true;
      }
      default:
        return false;
    }
  }

  pdfBtn.addEventListener('click', startPdf);
  closeBtn.addEventListener('click', () => {
    close();
    if (ctx.closeOverlay) ctx.closeOverlay();
  });
  // Klick auf den abgedunkelten Hintergrund (neben Heft und Kopfleiste) schließt
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target === stage) {
      close();
      if (ctx.closeOverlay) ctx.closeOverlay();
    }
  });
  bar.addEventListener('focusin', (e) => {
    const i = barButtons().indexOf(e.target);
    if (i >= 0) barFocus = i;
  });
  bar.addEventListener('focusout', () => {
    barFocus = -1;
  });

  // Rand-Klick und Wischen
  let swiped = false;
  let down = null;
  edgePrev.addEventListener('click', () => {
    if (!swiped) step(-1);
  });
  edgeNext.addEventListener('click', () => {
    if (!swiped) step(1);
  });
  book.addEventListener('pointerdown', (e) => {
    swiped = false;
    down = { x: e.clientX, y: e.clientY };
  });
  const endSwipe = (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down = null;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      swiped = true;
      step(dx < 0 ? 1 : -1);
    }
  };
  book.addEventListener('pointerup', endSwipe);
  book.addEventListener('pointercancel', () => {
    down = null;
  });

  return { el, open, close, isOpen: () => opened, onKey };
}

