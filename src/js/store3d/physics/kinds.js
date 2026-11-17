// VIDEOTHEK LENZ · Physik: Eigenschaften der Objektarten (rein, ohne three). Maße in m (voll), Masse in kg.
// shape 'sphere' (size = Radius) oder 'box' (size = [x, y, z]); rr = Kreisradius am Boden (Standard max(hx, hz));
// lieHy = halbe Höhe im umgekippten Zustand (nur tippable); throwable = kleines Objekt (<= 1,2 m), das man aufheben und werfen kann.
export const KINDS = {
  basketball: { shape: 'sphere', size: 0.12, mass: 0.6, e: 0.78, mu: 0.25, throwable: true, label: 'Basketball' },
  soccer: { shape: 'sphere', size: 0.11, mass: 0.45, e: 0.72, mu: 0.3, throwable: true, label: 'Fußball' },
  can: { shape: 'box', size: [0.08, 0.12, 0.08], mass: 0.15, e: 0.3, mu: 5, throwable: true, label: 'Dose' },
  cone: { shape: 'box', size: [0.3, 0.45, 0.3], mass: 0.8, e: 0.25, mu: 4, throwable: true, label: 'Hütchen' },
  crate: { shape: 'box', size: [0.5, 0.3, 0.36], mass: 2, e: 0.2, mu: 5, label: 'Kassettenkiste' },
  box: { shape: 'box', size: [0.45, 0.4, 0.45], mass: 1.2, e: 0.2, mu: 5, label: 'Karton' },
  bin: { shape: 'box', size: [0.6, 0.95, 0.6], mass: 6, e: 0.15, mu: 5, tippable: true, lieHy: 0.3, label: 'Mülltonne' },
  standee: { shape: 'box', size: [0.55, 1.6, 0.1], rr: 0.22, mass: 1.5, e: 0.15, mu: 5, tippable: true, lieHy: 0.05, label: 'Aufsteller' },
  tape: { shape: 'box', size: [0.14, 0.2, 0.03], rr: 0.1, mass: 0.2, e: 0.3, mu: 5, label: 'Kassette' },
};

/** Spawn-Parameter aus Art + Überschreibungen (rein): { shape, r, hx, hy, hz, mass, e, mu, tippable, lieHy, kind }. */
export function dimsOf(spec) {
  const k = KINDS[spec.kind] || {};
  const shape = spec.shape || k.shape || 'box';
  let hx; let hy; let hz;
  if (shape === 'sphere') {
    const rad = Number.isFinite(spec.radius) ? spec.radius : (typeof spec.size === 'number' ? spec.size : (typeof k.size === 'number' ? k.size : 0.12));
    hx = hy = hz = rad;
  } else {
    const s = Array.isArray(spec.size) ? spec.size : (Array.isArray(k.size) ? k.size : [0.4, 0.4, 0.4]);
    hx = s[0] / 2; hy = s[1] / 2; hz = s[2] / 2;
  }
  const r = shape === 'sphere' ? hx : (spec.rr || k.rr || Math.max(hx, hz));
  return {
    shape, r, hx, hy, hz,
    mass: spec.mass || k.mass || 1,
    e: spec.e !== undefined ? spec.e : (k.e !== undefined ? k.e : 0.3),
    mu: spec.mu !== undefined ? spec.mu : (k.mu !== undefined ? k.mu : 4),
    tippable: spec.tippable !== undefined ? !!spec.tippable : !!k.tippable,
    lieHy: k.lieHy || Math.min(hx, hz),
  };
}
