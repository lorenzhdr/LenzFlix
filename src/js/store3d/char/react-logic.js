// VIDEOTHEK LENZ · Figur (1.17.0): Reaktions-Budget für Outfit-Kommentare (rein, Zeit in ms wird injiziert).

export const OUTFIT_NEW = 'outfitNew';
export const HAIR_NEW = 'hairNew';

export const WINDOW_MS = 90000;
export const MAX_PASSERBY = 3;
export const GAP_MS = 6000;
export const QUIET_MS = 300000;

export function createReactBudget() {
  let hash = '';
  let changeAt = -Infinity;
  let said = new Set();
  let lastSaid = -Infinity;
  let quietUntil = -Infinity;
  return {
    /** Neue Änderung (leerer oder gleicher Hash zählt nicht). Setzt Zähler und Passantenliste zurück. */
    noteChange(now, h) {
      if (!h || h === hash) return;
      hash = h;
      changeAt = now;
      said = new Set();
    },
    /** Darf dieser Passant jetzt etwas sagen? Ohne Nebenwirkung; erst `markSaid` verbraucht das Budget. */
    passerbyMay(now, personId) {
      if (!personId || changeAt === -Infinity) return false;
      if (now < changeAt || now - changeAt > WINDOW_MS) return false;
      if (now < quietUntil) return false;
      if (said.size >= MAX_PASSERBY || said.has(personId)) return false;
      if (now - lastSaid < GAP_MS) return false;
      return true;
    },
    markSaid(now, personId) {
      said.add(personId);
      lastSaid = now;
      if (said.size >= MAX_PASSERBY) quietUntil = now + QUIET_MS;
    },
  };
}

/** Richard/Gabi/Ronny kommentieren, wenn sich das Outfit seit dem letzten Gesehenen geändert hat. */
export function npcShould(seenHash, currentHash) {
  return !!currentHash && seenHash !== currentHash;
}
