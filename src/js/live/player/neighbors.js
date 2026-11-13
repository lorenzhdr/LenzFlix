// Nachbarsender ±1 vorwärmen bzw. vorauflösen (schnelleres Zappen), gemeinsam für LENZ LIVE und den TV-Modus.
// createNeighbors({ player, scheduler, clock, deps, getChannel, getPhase, nch }) → { arm(mode), stop(), dispose() }
//   getPhase(): 'playing' (Sendung läuft stabil) | 'error' (Fehlerkarte steht) | sonst (Puffern/Pause/aus).
//   arm('play'):  nach NEIGHBOR_MS stabilem „playing“: mit deps.zapWarm player.prewarm für die Nachbarn (danach alle WARM_TICK_MS,
//                 max. WARM_TICK_MAX×), sonst player.prefetch (PlaybackInfo, einmal je Sendung). Steht der Sender gerade im
//                 kurzen Puffern, nach 1 s erneut (max. 20×).
//   arm('error'): nach ERROR_WARM_MS Fehlerkarte nur mit Vorwärmen (gleicher Takt); endet die Karte, ist Schluss.
//   stop(): Zappen, neue Sendung, Pause, Ausschalten, Verlassen, dispose. Importiert nur Dateien aus src/js/live/.
export const NEIGHBOR_MS = 1000;
export const ERROR_WARM_MS = 2000;
export const WARM_TICK_MS = 35000;
export const WARM_TICK_MAX = 10;
export const WARM_AFTER_ERROR = ['video', 'browser', 'audio']; // nicht bei Netzwerk-/Tipp-Fehlern
const RETRY_MS = 1000;
const RETRY_MAX = 20;

const safe = (fn) => { try { return fn(); } catch { return undefined; } };

/** player.prefetch ohne Wurf und ohne unbehandelte Ablehnung (signal optional). */
export function prefetchItem(player, itemId, signal) {
  if (!player || typeof player.prefetch !== 'function') return;
  const p = safe(() => player.prefetch(itemId, signal ? { signal } : {}));
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

export function createNeighbors({ player, scheduler, clock = Date.now, deps = {}, getChannel, getPhase, nch = 18 }) {
  let timer = null;
  let tok = 0;
  let ticks = 0;
  const done = new Set();

  const warmOn = () => !!(deps && deps.zapWarm && player && typeof player.prewarm === 'function');
  const note = (c) => { if (player && typeof player.warmNote === 'function') safe(() => player.warmNote(c)); };
  const wait = (fn, ms) => { clearTimeout(timer); timer = setTimeout(fn, ms); };
  const count = () => Math.max(1, Number(typeof nch === 'function' ? nch() : nch) || 18);

  // Laufende Sendung (nur Programm) der Nachbarsender mit Planposition.
  function neighbors() {
    const ch = getChannel();
    const n = count();
    const out = [];
    for (const no of [((ch - 2 + n) % n) + 1, (ch % n) + 1]) {
      if (no === ch) continue;
      const cur = safe(() => scheduler.nowOn(no, clock()));
      const e = cur && cur.entry;
      if (e && e.type === 'program' && e.itemId) out.push({ no, e, off: cur.offsetMs });
    }
    return out;
  }

  function warm() {
    const list = neighbors();
    for (const x of list) {
      const p = safe(() => player.prewarm(x.e.itemId, x.off));
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    if (!list.length) note('filler'); // beide Nachbarn ohne Programm (Füller/Nachtprogramm/Sendepause)
  }

  // Ohne Vorwärmen: je Sendung einmal die PlaybackInfo der Nachbarn (max. 2 Anfragen).
  function prefetch() {
    for (const x of neighbors()) {
      const key = `${x.no}:${x.e.start}:${x.e.itemId}`;
      if (done.has(key)) continue;
      done.add(key);
      if (done.size > 200) done.delete(done.values().next().value);
      prefetchItem(player, x.e.itemId, null);
    }
  }

  function step(t, mode, tries) {
    if (t !== tok) return;
    const ph = getPhase();
    if (ph !== (mode === 'error' ? 'error' : 'playing')) {
      if (mode === 'error') return; // Karte weg (Neuversuch/Zappen): nichts mehr vorwärmen
      note('phase');
      if (tries < RETRY_MAX) wait(() => step(t, mode, tries + 1), RETRY_MS);
      return;
    }
    // Mit Vorwärmen löst player.prewarm die Nachbarn selbst auf: kein zusätzlicher prefetch (sonst PlaybackInfo doppelt).
    if (!warmOn()) { if (mode === 'play') prefetch(); return; }
    warm();
    if (ticks >= WARM_TICK_MAX) return;
    ticks++;
    wait(() => step(t, mode, 0), WARM_TICK_MS);
  }

  function stop() {
    tok++;
    clearTimeout(timer);
    timer = null;
  }

  return {
    arm(mode = 'play') {
      if (mode === 'error' && !warmOn()) return;
      stop();
      ticks = 0;
      const t = tok;
      wait(() => step(t, mode, 0), mode === 'error' ? ERROR_WARM_MS : NEIGHBOR_MS);
    },
    stop,
    dispose: stop,
  };
}
