// LenzFlix: gemeinsame Netzregel für Hintergrund-Laden (Zeilen-Vorladen, Vorwärmen im TV-Modus/LENZ LIVE).

/** false bei Datensparen, Mobilfunk oder langsamem Netz; ohne API (Safari/Firefox) true. */
export function netOk() {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null;
  if (!c) return true;
  return !(c.saveData || c.type === 'cellular' || /^(slow-2g|2g|3g)$/.test(c.effectiveType || ''));
}
