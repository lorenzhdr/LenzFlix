// VIDEOTHEK LENZ · Physik: Rücksetzen verschobener Objekte an ihren Platz (rein).
const RESET_AFTER = 120; // Sekunden Ruhe

/** Weit genug vom Platz weg (oder umgekippt), um zurückgesetzt zu werden? */
export function displaced(b) {
  if (!b.home) return false;
  if (b.tipA > 0.05) return true;
  return Math.hypot(b.pos.x - b.home.x, b.pos.z - b.home.z) > 0.25 || Math.abs(b.pos.y - b.home.y) > 0.25;
}

/**
 * Soll b jetzt (unsichtbar) zurück? view = { inView(x, y, z) → bool }, nie im Blickfeld.
 * Bedingungen: schläft seit RESET_AFTER s, verschoben, nicht gehalten.
 */
export function shouldReset(b, view, after = RESET_AFTER) {
  if (!b.home || b.held || !b.sleeping || b.restT < after) return false;
  if (!displaced(b)) return false;
  return !view.inView(b.pos.x, b.pos.y, b.pos.z) && !view.inView(b.home.x, b.home.y, b.home.z);
}

/** Dosen-Pyramide umgeworfen: alle bewegt/gefallen und zur Ruhe gekommen. */
export function pyramidDown(cans, minMove = 0.25) {
  if (!cans.length) return false;
  return cans.every((b) => b.sleeping && b.home && (Math.hypot(b.pos.x - b.home.x, b.pos.z - b.home.z) > minMove || b.pos.y < b.home.y - 0.2 || b.pos.y > b.home.y + 0.2 || b.tipA > 0));
}
