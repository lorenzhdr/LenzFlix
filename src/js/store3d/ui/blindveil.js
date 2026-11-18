// VIDEOTHEK LENZ · Blend-Schleier „weiß“ (1.18.0): Laser-Treffer am Spieler. Vertrag .tmp/v118/contracts.md §1.
// Weiß, kräftig, 2,5 s mit Nachbild (radialer Fleck), GLEICHMÄSSIG ausblendend (rein monotone Deckkraft, kein Flackern,
// keine Wiederholung), höchstens einmal je 4 s. prefers-reduced-motion: ohne bewegtes Nachbild, 1,5 s.
// Die Animation steckt im CSS (fight.css); das Skript setzt nur Klasse und Dauer.
//   createBlindVeil(host, { reduced() → bool, now() → ms }) → { start(ms?) → bool, stop(), active(), dispose(), el }

export const VEIL_MS = 2500;
export const VEIL_REDUCED_MS = 1500;
export const VEIL_GAP_MS = 4000;

const reducedDefault = () => {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export function createBlindVeil(host, opts = {}) {
  const reduced = typeof opts.reduced === 'function' ? opts.reduced : reducedDefault;
  const now = typeof opts.now === 'function' ? opts.now : () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const el = document.createElement('div');
  el.className = 'lfx-store-fight-veil';
  el.setAttribute('aria-hidden', 'true');
  el.hidden = true;
  const spot = document.createElement('div');
  spot.className = 'lfx-store-fight-veil-spot';
  el.appendChild(spot);
  if (host) host.appendChild(el);

  let timer = 0;
  let last = -Infinity;
  let on = false;
  let disposed = false;

  function end() {
    if (timer) { clearTimeout(timer); timer = 0; }
    on = false;
    el.classList.remove('is-on', 'is-calm');
    el.hidden = true;
  }

  /** Startet den Schleier. Rückgabe false = gedrosselt (weniger als 4 s seit dem letzten Start) oder entsorgt. */
  function start(ms) {
    if (disposed) return false;
    const t = now();
    if (t - last < VEIL_GAP_MS) return false;
    last = t;
    const calm = reduced();
    const dur = calm ? VEIL_REDUCED_MS : ms > 0 ? ms : VEIL_MS;
    end();
    el.style.setProperty('--lfx-fight-veil-ms', Math.round(dur) + 'ms');
    el.hidden = false;
    el.classList.toggle('is-calm', calm);
    void el.offsetWidth; // Animation sauber neu ansetzen
    el.classList.add('is-on');
    on = true;
    timer = setTimeout(end, dur);
    return true;
  }

  return {
    el,
    start,
    stop: end,
    active: () => on,
    dispose() {
      if (disposed) return;
      end();
      disposed = true;
      if (el.parentNode) el.parentNode.removeChild(el);
    },
  };
}
