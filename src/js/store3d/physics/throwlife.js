// VIDEOTHEK LENZ · Wurf-Lebenszyklus einer Hülle (rein): Zustandsautomat flying → landed → (aufgehoben | zurück ins Regal).
export const RETURN_AFTER = 6; // Sekunden nach der Landung
export const THROW_SPEED = 9;
const THROW_UP = 0.28; // Anteil nach oben an der Blickrichtung (vor Normierung)

/** Abwurfgeschwindigkeit aus Blickrichtung dir (normiert): ~9 m/s nach vorn-oben. */
export function throwVelocity(dir, speed = THROW_SPEED) {
  const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const x = dir.x / l; const z = dir.z / l;
  const y = dir.y / l + THROW_UP;
  const n = Math.hypot(x, y, z) || 1;
  return { x: (x / n) * speed, y: (y / n) * speed, z: (z / n) * speed };
}

/** Eine geworfene Hülle. update(dt, landed) liefert 'restore' | null; pickup() beendet (Rückgabe true wenn möglich). */
export function createThrownTape(id) {
  const s = { id, phase: 'flying', t: 0 };
  return {
    state: s,
    update(dt, landed) {
      if (s.phase === 'done') return null;
      if (s.phase === 'flying') { if (landed) { s.phase = 'landed'; s.t = 0; } return null; }
      s.t += dt;
      if (s.t >= RETURN_AFTER) { s.phase = 'done'; return 'restore'; }
      return null;
    },
    /** Aufheben nur nach der Landung. */
    pickup() { if (s.phase !== 'landed') return false; s.phase = 'done'; return true; },
    /** Sofort zurück (Design-Wechsel, VR, dispose). */
    cancel() { const was = s.phase !== 'done'; s.phase = 'done'; return was; },
  };
}
