// VIDEOTHEK LENZ · Entdeckungen: Hinseh-Erkennung und Zeit-/Wetterregeln (rein, ohne three/DOM).

/**
 * Hinseh-Zähler. Ein Ziel gilt als „angesehen“, wenn die Kamera höchstens `range` m entfernt ist, ungefähr darauf zeigt
 * (Winkel <= maxAngle) und – falls `normal` gesetzt – von der Vorderseite schaut. Die Zeit läuft nur, solange das stimmt;
 * bei Blickverlust setzt sie nach einer kurzen Nachfrist (grace) auf 0. step() gibt true, sobald `dwell` s erreicht sind (einmalig).
 */
export function createGaze({ range = 4, dwell = 1.5, maxAngle = (32 * Math.PI) / 180, grace = 0.25 } = {}) {
  let t = 0;
  let lost = 0;
  let done = false;
  const cosMin = Math.cos(maxAngle);
  function looking(eye, dir, target) {
    const dx = target.x - eye.x;
    const dy = target.y - eye.y;
    const dz = target.z - eye.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > range) return false;
    if (d > 1e-6 && (dx * dir.x + dy * dir.y + dz * dir.z) / d < cosMin) return false;
    const n = target.normal;
    if (n && (eye.x - target.x) * n.x + (eye.z - target.z) * n.z <= 0) return false;
    return true;
  }
  return {
    /** eye {x,y,z}, dir {x,y,z} (normiert), target {x,y,z, normal?:{x,z}}. */
    looking,
    step(dt, eye, dir, target) {
      if (done) return false;
      if (looking(eye, dir, target)) {
        lost = 0;
        t += dt;
        if (t >= dwell) { done = true; return true; }
      } else {
        lost += dt;
        if (lost > grace) t = 0;
      }
      return false;
    },
    progress: () => Math.min(1, t / dwell),
    reset() { t = 0; lost = 0; done = false; },
    get done() { return done; },
  };
}

/** Regennacht auf dem Dach: Bereich „roof“, Regen, Stunde 20 bis 5 Uhr (>= 20 oder < 5). */
export function isRoofRainNight({ area, raining, hour }) {
  if (area !== 'roof' || !raining || !Number.isFinite(hour)) return false;
  return hour >= 20 || hour < 5;
}
