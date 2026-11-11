// VIDEOTHEK LENZ · Couch/TV-Vollbild: reine Helfer (three-frei, Node-testbar).

export const SCREEN_W = 0.62;
export const SCREEN_H = 0.465;

/**
 * Abstand der Kamera zur Bildschirmebene, damit der Schirm die Sicht füllt. fov = vertikales Sichtfeld in Grad.
 * Maßgeblich ist die engere Achse: Höhe füllt `fillV` der Bildhöhe, Breite höchstens `fillH` der Bildbreite
 * (Hochformat → Breite bestimmt, Querformat → Höhe bestimmt); der größere Abstand gewinnt, nichts wird abgeschnitten.
 */
export function fitDistance(fov, aspect, { w = SCREEN_W, h = SCREEN_H, fillV = 0.9, fillH = 0.92 } = {}) {
  const f = Number.isFinite(fov) && fov > 5 && fov < 170 ? fov : 70;
  const a = Number.isFinite(aspect) && aspect > 0.1 ? aspect : 16 / 9;
  const t = Math.tan((f * Math.PI) / 360);
  const dV = h / (fillV * 2 * t);
  const dH = w / (fillH * 2 * t * a);
  return Math.max(0.2, dV, dH);
}

/**
 * Trailer-Kandidaten: erst Highlights, dann zufällige weitere Titel; ohne Ab-18, ohne Duplikate, höchstens `max`.
 * items = Map|Objekt-Werte-Iterable; rand() → [0,1).
 */
export function pickCandidates({ highlights = [], items = null, adult = new Set(), max = 12, rand = Math.random } = {}) {
  const out = [];
  const seen = new Set();
  const ok = (i) => i && i.Id && !seen.has(i.Id) && !adult.has(i.Id);
  for (const i of highlights) {
    if (out.length >= max) break;
    if (ok(i)) { seen.add(i.Id); out.push(i); }
  }
  if (items && typeof items.values === 'function') {
    const rest = [...items.values()].filter(ok);
    while (out.length < max && rest.length) {
      const [i] = rest.splice(Math.floor(rand() * rest.length), 1);
      if (ok(i)) { seen.add(i.Id); out.push(i); }
    }
  }
  return out;
}
