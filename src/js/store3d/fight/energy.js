// VIDEOTHEK LENZ · Energie-Logik (1.18.0; rein, Zeit injiziert in Sekunden): 0..100, nach 6 s ohne Treffer +3,3/s, K.O. bei 0.
// Schutz: 10 s nach dem Aufwachen; „Menü schützt“: ein offenes Menü schützt erst 3 s nach dem Öffnen (Missbrauchssperre),
// danach bis 2 s nach dem Schließen; im Nachlauf wieder geöffnet gilt der Schutz sofort weiter.
const ENERGY_MAX = 100;
export const REGEN_DELAY = 6;
export const REGEN_RATE = 3.3;
export const KO_PROTECT = 10;
export const MENU_TAIL = 2;
export const MENU_LOCK = 3;

export function createEnergy() {
  let e = ENERGY_MAX;
  let from = 0; // ab hier wird aufgefüllt (letzter Treffer + Verzögerung)
  let last = 0;
  let ko = false;
  let protUntil = -Infinity;
  let menuOpen = false;
  let menuFrom = Infinity; // ab hier schützt das offene Menü
  let tailUntil = -Infinity;

  function advance(t) {
    if (ko) { last = t; return; }
    const a = Math.max(from, last);
    if (t > a && e < ENERGY_MAX) e = Math.min(ENERGY_MAX, e + (t - a) * REGEN_RATE);
    last = Math.max(last, t);
  }
  const menuProt = (t) => (menuOpen ? t >= menuFrom : t < tailUntil);
  const isProtected = (t) => t < protUntil || menuProt(t);

  return {
    value(t) { advance(t); return e; },
    isKO() { return ko; },
    protected: isProtected,
    /** Treffer: → { ko, ignored, energy }. Ignoriert bei Schutz oder wenn schon K.O. */
    hit(dmg, t) {
      advance(t);
      if (ko || isProtected(t) || !(dmg > 0)) return { ko: false, ignored: true, energy: e };
      e = Math.max(0, e - dmg);
      from = t + REGEN_DELAY;
      if (e <= 0) { ko = true; return { ko: true, ignored: false, energy: 0 }; }
      return { ko: false, ignored: false, energy: e };
    },
    /** Aufwachen nach K.O.: volle Energie, 10 s Schutz. */
    wake(t) { ko = false; e = ENERGY_MAX; from = t; last = t; protUntil = t + KO_PROTECT; },
    setMenu(open, t) {
      open = !!open;
      if (open === menuOpen) return;
      if (open) {
        menuOpen = true;
        menuFrom = t < tailUntil ? t : t + MENU_LOCK;
      } else {
        const wasProt = t >= menuFrom;
        menuOpen = false;
        menuFrom = Infinity;
        tailUntil = wasProt ? t + MENU_TAIL : -Infinity;
      }
    },
    reset() { e = ENERGY_MAX; from = 0; last = 0; ko = false; protUntil = -Infinity; menuOpen = false; menuFrom = Infinity; tailUntil = -Infinity; },
  };
}
