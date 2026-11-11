// TV-Modus · Inhaltsangaben bei Bedarf (der Katalog hat keine). Vertrag: docs/tvmode.md („Gemeinsame Helfer“, „Inhaltsangaben“).
// Eine Instanz je Engine. request(id) entprellt (Standard 400 ms) und überschreibt eine noch wartende Id: höchstens eine Anfrage je Zappen.
// Antworten werden je Id gecacht, auch leere (kein Wiederholen). Fehlt deps.itemDetails, passiert nichts.

/**
 * @param {{ deps?: { itemDetails?: (ids: string[]) => Promise<Map<string,{overview:string}>> }, delayMs?: number,
 *   setTimer?: typeof setTimeout, clearTimer?: typeof clearTimeout }} [o]
 */
export function createDetails({ deps = {}, delayMs = 400, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const texts = new Map();
  const inflight = new Set();
  const subs = new Set();
  let waitId = null;
  let timer = null;
  let alive = true;

  const can = () => typeof deps.itemDetails === 'function';

  async function load(id) {
    if (!alive || !can() || texts.has(id) || inflight.has(id)) return;
    inflight.add(id);
    let text;
    try {
      const res = await deps.itemDetails([id]);
      const v = res && typeof res.get === 'function' ? res.get(id) : null;
      text = v && typeof v.overview === 'string' ? v.overview : '';
    } catch {
      text = '';
    }
    inflight.delete(id);
    if (!alive) return;
    texts.set(id, text);
    for (const fn of [...subs]) {
      try { fn(id, text); } catch { /* Abonnent-Fehler nicht weiterreichen */ }
    }
  }

  return {
    /** Text oder undefined (noch nicht geladen). Leerer String = geladen, aber ohne Inhaltsangabe. */
    get: (id) => texts.get(id),
    /** Lädt die Inhaltsangabe entprellt; eine noch wartende andere Id wird verworfen. */
    request(id) {
      if (!alive || !id || !can() || texts.has(id) || inflight.has(id)) return;
      waitId = id;
      if (timer) clearTimer(timer);
      timer = setTimer(() => {
        timer = null;
        const next = waitId;
        waitId = null;
        if (next) load(next);
      }, delayMs);
    },
    /** Live-Map id → Text (nur lesen), passend für model.describe(…, { overviews }). */
    map: () => texts,
    on(fn) {
      if (typeof fn !== 'function') return () => {};
      subs.add(fn);
      return () => subs.delete(fn);
    },
    dispose() {
      alive = false;
      if (timer) clearTimer(timer);
      timer = null;
      waitId = null;
      subs.clear();
    },
  };
}
