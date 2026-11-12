// LenzFlix rows: horizontales Blättern (nativer Scroll-Container mit scroll-snap + Pfeile + Seitenindikator).

const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polyline points="8,3 17,12 8,21" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function chevronButton(dir, label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `lfx-row__arrow lfx-row__arrow--${dir}`;
  b.setAttribute('aria-label', label);
  b.tabIndex = -1;
  b.hidden = true;
  b.innerHTML = CHEVRON;
  return b;
}

// Ein gemeinsamer, rAF-gebündelter resize-Listener für alle Zeilen.
const resizeSubs = new Set();
let resizeRaf = 0;
function onResize() {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    for (const fn of [...resizeSubs]) fn();
  });
}
function subscribeResize(fn) {
  if (!resizeSubs.size) window.addEventListener('resize', onResize);
  resizeSubs.add(fn);
  return () => {
    resizeSubs.delete(fn);
    if (resizeSubs.size) return;
    window.removeEventListener('resize', onResize);
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = 0;
  };
}

/** Hängt Blätter-Logik an. Rückgabe: destroy(). */
export function attachScroller({ track, prev, next, indicator }) {
  let raf = 0;
  let shownPages = 0;
  const cards = () => Array.from(track.querySelectorAll('.lfx-card'));

  const visible = () => {
    const v = parseFloat(getComputedStyle(track).getPropertyValue('--lfx-cards-visible'));
    return v > 0 ? v : 4;
  };

  function pageWidth() {
    const cs = cards();
    if (cs.length > 1 && cs[1].offsetLeft > cs[0].offsetLeft) return (cs[1].offsetLeft - cs[0].offsetLeft) * visible();
    return track.clientWidth || 1;
  }

  function update() {
    raf = 0;
    const left = track.scrollLeft;
    const max = track.scrollWidth - track.clientWidth;
    const pw = pageWidth();
    const pages = Math.max(1, Math.ceil(cards().length / visible()));
    prev.hidden = left <= 2;
    next.hidden = !(max > 2) || left >= max - 2;
    if (indicator) {
      if (pages !== shownPages) {
        shownPages = pages;
        indicator.textContent = '';
        for (let i = 0; i < pages; i++) indicator.append(document.createElement('span'));
      }
      indicator.hidden = pages <= 1;
      const page = left >= max - 2 && max > 2 ? pages - 1 : Math.min(pages - 1, Math.round(left / pw));
      Array.from(indicator.children).forEach((s, i) => s.classList.toggle('is-active', i === page));
    }
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };

  function go(dir) {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const left = Math.max(0, track.scrollLeft + dir * pageWidth());
    if (typeof track.scrollTo === 'function') track.scrollTo({ left, behavior: reduce ? 'auto' : 'smooth' });
    else track.scrollLeft = left;
  }
  const onPrev = () => go(-1);
  const onNext = () => go(1);

  function links() { return Array.from(track.querySelectorAll('.lfx-card__link')); }
  function onFocusIn(e) {
    const a = e.target.closest && e.target.closest('.lfx-card__link');
    if (!a) return;
    for (const l of links()) l.tabIndex = l === a ? 0 : -1;
  }
  function onKey(e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const a = e.target.closest && e.target.closest('.lfx-card__link');
    if (!a) return;
    const ls = links();
    const t = ls[ls.indexOf(a) + (e.key === 'ArrowRight' ? 1 : -1)];
    if (t) { e.preventDefault(); t.focus(); }
  }

  prev.addEventListener('click', onPrev);
  next.addEventListener('click', onNext);
  track.addEventListener('scroll', schedule, { passive: true });
  track.addEventListener('focusin', onFocusIn);
  track.addEventListener('keydown', onKey);
  const unsubResize = subscribeResize(() => {
    if (raf) cancelAnimationFrame(raf);
    update();
  });

  const ls = links();
  ls.forEach((l, i) => { l.tabIndex = i === 0 ? 0 : -1; });
  schedule();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    prev.removeEventListener('click', onPrev);
    next.removeEventListener('click', onNext);
    track.removeEventListener('scroll', schedule);
    track.removeEventListener('focusin', onFocusIn);
    track.removeEventListener('keydown', onKey);
    unsubResize();
  };
}
