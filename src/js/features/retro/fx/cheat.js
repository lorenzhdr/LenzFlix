// LENZ//84 retro-fx: Cheat-Code (Pfeile + B A) und 7x-Tipp-Geste. Reine Erkennungslogik, ohne DOM-Listener.

export const CHEAT_SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

/** e.key normalisieren: Buchstaben klein, Rest unverändert. */
export function normalizeKey(key) {
  return typeof key === 'string' && key.length === 1 ? key.toLowerCase() : key;
}

/** feed(key) -> true, sobald die Folge vollständig am Ende des Eingabestroms steht (danach Puffer leer). */
export function createSequence(seq = CHEAT_SEQUENCE) {
  let buf = [];
  return {
    feed(key) {
      buf.push(normalizeKey(key));
      if (buf.length > seq.length) buf = buf.slice(-seq.length);
      if (buf.length === seq.length && buf.every((k, i) => k === seq[i])) {
        buf = [];
        return true;
      }
      return false;
    },
    reset() { buf = []; },
  };
}

/** Schnelles Mehrfach-Tippen: tap(now) -> aktuelle Anzahl in Folge (Abstand < gap ms); reset() setzt zurück. */
export function createTapCounter({ gap = 400 } = {}) {
  let count = 0;
  let last = -Infinity;
  return {
    tap(now = Date.now()) {
      count = now - last < gap ? count + 1 : 1;
      last = now;
      return count;
    },
    get count() { return count; },
    reset() { count = 0; last = -Infinity; },
  };
}
