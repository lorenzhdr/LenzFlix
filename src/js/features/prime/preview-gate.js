// LENZPRIME: Videos sparsam halten. Ein Video pausiert, solange es aus dem Viewport gescrollt ist, der Tab verborgen ist
// oder eine Poster-Vorschau läuft (Hold-Event auf document), und läuft danach weiter.
export const HOLD_EVENT = 'lfx-prime-preview-hold';
export const VISIBLE_RATIO = 0.2;

/** Meldet, dass eine andere Vorschau (Poster-Hover) läuft (on = true) bzw. endet (on = false). */
export function setPreviewHold(on) {
  document.dispatchEvent(new CustomEvent(HOLD_EVENT, { detail: { on: Boolean(on) } }));
}

/**
 * Hält `video` im Takt mit Sichtbarkeit, document.hidden und (optional) Hold-Event.
 * Rückgabe: { stop() } räumt Observer/Listener auf (das Video selbst wird nicht angefasst).
 */
export function autoPause(video, { respectHold = false } = {}) {
  let visible = true;
  let held = false;
  let stopped = false;
  let io = null;

  const sync = () => {
    if (stopped || !video) return;
    const want = visible && !held && !document.hidden;
    try {
      if (want && video.paused) {
        const p = video.play && video.play();
        if (p && p.catch) p.catch(() => {});
      } else if (!want && !video.paused) {
        video.pause();
      }
    } catch { /* jsdom */ }
  };
  const onVis = () => sync();
  const onHold = (e) => { held = Boolean(e.detail && e.detail.on); sync(); };

  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (!e) return;
      visible = e.isIntersecting && e.intersectionRatio >= VISIBLE_RATIO;
      sync();
    }, { threshold: [0, VISIBLE_RATIO, 1] });
    io.observe(video);
  }
  document.addEventListener('visibilitychange', onVis);
  if (respectHold) document.addEventListener(HOLD_EVENT, onHold);

  return {
    stop() {
      stopped = true;
      if (io) io.disconnect();
      io = null;
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener(HOLD_EVENT, onHold);
    },
  };
}
