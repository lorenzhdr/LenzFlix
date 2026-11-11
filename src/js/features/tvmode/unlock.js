// TV-Modus: entsperrt in der Nutzergeste (lfx:tvmode-intent der Kopfleisten-Symbole) synchron ein <video playsinline> (iOS/Autoplay).
// Das Video wird ca. 30 s gemerkt und einmalig per takeIntentVideo() an die Engine gereicht (opts.video).
export const INTENT_TTL_MS = 30000;

let held = null;
let timer = null;
let bound = false;

function drop() {
  clearTimeout(timer);
  timer = null;
  held = null;
}

function onIntent() {
  drop();
  try {
    const v = document.createElement('video');
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
    held = v;
    timer = setTimeout(drop, INTENT_TTL_MS);
  } catch { /* ohne Intent-Video: die Engine erzeugt eines */ }
}

/** Einmalig: das gemerkte Video herausgeben (oder null). */
export function takeIntentVideo() {
  const v = held;
  drop();
  return v;
}

export function initUnlock() {
  if (bound) return;
  bound = true;
  window.addEventListener('lfx:tvmode-intent', onIntent);
}

export function destroyUnlock() {
  if (bound) window.removeEventListener('lfx:tvmode-intent', onIntent);
  bound = false;
  drop();
}
