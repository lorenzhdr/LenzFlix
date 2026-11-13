// Startseiten-Zeilen im Hintergrund vorladen, sobald oben alles fertig ist (Hero, erste Zeilen, Trailer).
// Gemeinsam für flix/plus/prime (nur Startseite, nie Hubs). Eine Zeile nach der anderen, von oben nach unten.
const MAX_WAIT = 15000; // spätestens dann starten, auch wenn „oben“ nicht fertig meldet
const IMG_WAIT = 4000;
const POLL = 250;
const TOP_ROWS = 3;
const TOP_CARDS = 8;

/** false bei Datensparen, Mobilfunk oder langsamem Netz; ohne API (Safari/Firefox) true. */
export function allowPrefetch() {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null;
  if (!c) return true;
  return !(c.saveData || c.type === 'cellular' || /^(slow-2g|2g|3g)$/.test(c.effectiveType || ''));
}

/** Hero fertig: kein Skeleton, Bilder (außer lazy) geladen, kein wartender Trailer (data-lfx-tr="wait"). */
export function heroSettled(slot) {
  if (!slot || slot.hidden) return true;
  if (slot.classList.contains('is-loading') || slot.querySelector('.lfx-bb--skel')) return false;
  if (slot.dataset.lfxTr === 'wait') return false;
  return [...slot.querySelectorAll('img')].every((i) => i.getAttribute('loading') === 'lazy' || i.complete);
}

const cardImgs = (row) => [...row.querySelectorAll('.lfx-card')].slice(0, TOP_CARDS).flatMap((c) => [...c.querySelectorAll('img')]);

/**
 * opts: { slot (Zeilen-Container), pending: Map<el, eintrag> (live), load(el, eintrag) -> Promise (entfernt aus Observer, lädt),
 * hero: () => Hero-Slot|null }. Rückgabe: { stop(), notify() } (notify: neue Zeilen in pending, z. B. prime „Mehr“).
 */
export function startRowPrefetch({ slot, pending, load, hero }) {
  if (!allowPrefetch()) return { stop() {}, notify() {} };
  const t0 = Date.now();
  const offs = [];
  let dead = false;
  let go = false;
  let busy = false;
  let imgSince = 0;
  let timer = null;
  let idleId = null;

  const later = (fn, ms) => { clearTimeout(timer); timer = setTimeout(fn, ms); };
  const idle = (fn) => {
    if (dead) return;
    if (typeof requestIdleCallback === 'function') idleId = requestIdleCallback(fn, { timeout: 1000 });
    else later(fn, 150);
  };

  function topReady() {
    const rows = [...slot.children].filter((c) => c.dataset && c.dataset.lfxRow !== undefined).slice(0, TOP_ROWS);
    if (!slot.querySelector('.lfx-card')) return !pending.size;
    const imgs = [];
    for (const r of rows) {
      if (r.classList.contains('is-loading')) { if (!pending.has(r)) return false; continue; } // lädt gerade
      imgs.push(...cardImgs(r));
    }
    if (!imgSince) imgSince = Date.now();
    return Date.now() - imgSince >= IMG_WAIT || imgs.every((i) => i.complete);
  }

  function waitImgs(imgs, done) {
    let left = 0;
    let fin = false;
    const end = () => { if (fin) return; fin = true; clearTimeout(tm); done(); };
    const tm = setTimeout(end, IMG_WAIT);
    offs.push(() => clearTimeout(tm));
    for (const i of imgs) {
      i.loading = 'eager';
      if (i.complete) continue;
      left++;
      const one = () => { if (--left <= 0) end(); };
      i.addEventListener('load', one, { once: true });
      i.addEventListener('error', one, { once: true });
      offs.push(() => { i.removeEventListener('load', one); i.removeEventListener('error', one); });
    }
    if (!left) end();
  }

  function next() {
    if (dead || busy || document.hidden) return;
    let el = null;
    for (const e of pending.keys()) {
      if (!e.isConnected || !e.classList.contains('is-loading')) { pending.delete(e); continue; }
      if (!el || (el.compareDocumentPosition(e) & 2)) el = e; // 2 = e liegt davor
    }
    if (!el) return; // nichts offen; notify() weckt wieder
    const entry = pending.get(el);
    pending.delete(el);
    busy = true;
    Promise.resolve().then(() => load(el, entry)).catch(() => {}).then(() => {
      if (dead) return;
      waitImgs(cardImgs(el), () => { busy = false; idle(next); });
    });
  }

  function tick() {
    if (dead || document.hidden) return;
    if (!go) {
      go = Date.now() - t0 >= MAX_WAIT || (heroSettled(hero && hero()) && topReady());
      if (!go) { later(tick, POLL); return; }
    }
    next();
  }

  const onVis = () => { if (!document.hidden && !dead && !busy) later(tick, 0); };
  document.addEventListener('visibilitychange', onVis);
  later(tick, POLL);

  return {
    stop() {
      dead = true;
      clearTimeout(timer);
      if (idleId != null && typeof cancelIdleCallback === 'function') cancelIdleCallback(idleId);
      document.removeEventListener('visibilitychange', onVis);
      offs.splice(0).forEach((f) => f());
    },
    notify() { if (go && !busy && !dead) idle(next); },
  };
}
