// VIDEOTHEK LENZ · Figur (1.17.0): Entdeckung -> Freischalt-Teil (rein, ohne three/DOM).
// UNLOCKS ist erweiterbar (1.18 hängt Einträge hinten an); nichts hier setzt die Anzahl fest.
import { UNLOCK_BASE, UNLOCK_TOPS, UNLOCK_BOTTOMS, UNLOCK_SHOES, UNLOCK_GLASSES, UNLOCK_HATS, UNLOCK_BAGS } from './ids.js';
import { entryOf } from '../discover/catalog.js';

export const SLOT_LISTS = { top: UNLOCK_TOPS, bottom: UNLOCK_BOTTOMS, shoes: UNLOCK_SHOES, glasses: UNLOCK_GLASSES, hat: UNLOCK_HATS, bag: UNLOCK_BAGS };

const mk = (discover, slot, id, title) => {
  const i = SLOT_LISTS[slot].indexOf(id);
  const e = entryOf(discover);
  return { discover, slot, id, code: UNLOCK_BASE + i, title, hint: e ? e.hint : '' };
};

export const UNLOCKS = [
  mk('golden-tape', 'hat', 'goldcap', 'Goldkappe'),
  mk('graffiti', 'shoes', 'splash', 'Farbklecks-Treter'),
  mk('secret-door', 'hat', 'crown', 'Krone des Fundus'),
  mk('roof-rain', 'top', 'cape', 'Regencape'),
  mk('roof', 'glasses', 'pilot', 'Fliegerbrille'),
  mk('cat-pet', 'hat', 'catears', 'Katzenöhrchen'),
  mk('kiosk-snack', 'bag', 'chips', 'Chipstüte am Gurt'),
  mk('hoop-3', 'top', 'jersey3', 'Dreier-Trikot'),
  mk('can-pyramid', 'hat', 'canhat', 'Dosenhut'),
  mk('richard-ban', 'top', 'banshirt', 'Hausverbot-Shirt'),
  mk('richard-rent', 'bag', 'vhspack', 'Kassettenrucksack'),
  mk('palast-film', 'hat', 'usher', 'Platzanweiser-Mütze'),
  mk('palast-tape', 'glasses', '3d', 'Dreidimensionale Brille'),
  mk('zebra', 'bottom', 'zebra', 'Zebrastreifen-Hose'),
  mk('car-honk', 'top', 'hivis', 'Warnweste-Shirt'),
];

const asSet = (found) => (found instanceof Set ? found : new Set(Array.isArray(found) ? found : found && typeof found === 'object' ? Object.keys(found) : []));
const key = (slot, code) => slot + ':' + code;

/** Menge der freigeschalteten Teile als 'slot:code'. */
export function unlockedCodes(foundIds) {
  const f = asSet(foundIds);
  const out = new Set();
  for (const u of UNLOCKS) if (f.has(u.discover)) out.add(key(u.slot, u.code));
  return out;
}

/** Basisteile (Code < UNLOCK_BASE) sind immer frei; Freischalt-Teile nur mit der Entdeckung. */
export function isUnlocked(slot, code, foundIds) {
  if (!(code >= UNLOCK_BASE)) return true;
  const f = asSet(foundIds);
  return UNLOCKS.some((u) => u.slot === slot && u.code === code && f.has(u.discover));
}

export function unlockFor(discoverId) {
  return UNLOCKS.find((u) => u.discover === discoverId) || null;
}

/** Hinweistext der Entdeckung (verrät nie den Titel); leer, wenn es kein Freischalt-Teil ist. */
export function lockHint(slot, code) {
  const u = UNLOCKS.find((x) => x.slot === slot && x.code === code);
  const e = u && entryOf(u.discover);
  return e ? e.hint : '';
}
