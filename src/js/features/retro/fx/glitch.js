// LENZ//84 retro-fx: gelegentlicher Glitch (alle 20-40 s) auf einer sichtbaren Überschrift + Streifen im CRT-Overlay.
import { createTimers, rand } from './util.js';

const TARGETS = '.lfx-retro-glitch, #lfx-retro-home h1, .lfx-retro-hero__title, h1, h2.sectionTitle, .lfx-retro-label';

function inViewport(el) {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  return r.bottom > 0 && r.top < (window.innerHeight || 800) && r.right > 0 && r.left < (window.innerWidth || 1200);
}

/** Sichtbarer Kandidat (nicht im Player) oder null. */
export function pickTarget(root = document) {
  const list = [...root.querySelectorAll(TARGETS)].filter((el) => !el.closest('#videoOsdPage') && inViewport(el));
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

export function createGlitch({ crt, enabled = () => true, minMs = 20000, maxMs = 40000 }) {
  const timers = createTimers();
  let running = false;

  function fire() {
    if (!running) return;
    if (enabled() && !document.hidden) {
      const target = pickTarget();
      if (target) {
        const addedBase = !target.classList.contains('lfx-retro-glitch');
        target.classList.add('lfx-retro-glitch', 'is-glitching');
        timers.timeout(() => {
          target.classList.remove('is-glitching');
          if (addedBase) target.classList.remove('lfx-retro-glitch');
        }, 600);
      }
      crt.glitchStrip();
    }
    schedule();
  }

  function schedule() {
    if (running) timers.timeout(fire, rand(minMs, maxMs));
  }

  return {
    start() {
      if (running) return;
      running = true;
      schedule();
    },
    stop() {
      running = false;
      timers.clearAll();
      for (const el of document.querySelectorAll('.is-glitching')) el.classList.remove('is-glitching');
    },
    fire,
  };
}
