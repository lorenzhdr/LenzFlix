// VIDEOTHEK LENZ · Richards Posen (rein): Gliedwinkel je Animation und Zeit, in rad.
// arm*x: nach vorn (+ schwingt die Hand nach vorn, -z); arm*z: seitlich (L: + einwärts, R: - einwärts; 2,5 = oben).
// tiltX: Rumpf nach hinten (+) bzw. vorn (-); bob: Höhe (m); headX: Kopfnicken.
export const ANIMS = ['idle', 'stagger', 'armsup', 'shove', 'wind', 'throw', 'run', 'hop', 'cross', 'point', 'cover']; // nur anhängen (Index = Netzleitung)

export const NEUTRAL = Object.freeze({ armLx: 0, armLz: 0, armRx: 0, armRz: 0, legL: 0, legR: 0, tiltX: 0, tiltZ: 0, bob: 0, headX: 0 });

const env = (u) => Math.sin(Math.min(1, Math.max(0, u)) * Math.PI);

export function poseFor(name, t, speed = 1) {
  const p = { ...NEUTRAL };
  switch (name) {
    case 'stagger': { // Taumeln: Rumpf kippt zurück, Arme rudern
      const e = env(t / 0.8);
      p.tiltX = 0.4 * e; p.tiltZ = Math.sin(t * 14) * 0.08 * e;
      p.armLx = 1.2 * e; p.armRx = 1.2 * e; p.armLz = 0.5 * e; p.armRz = -0.5 * e;
      p.legL = 0.3 * e; p.legR = -0.3 * e; p.headX = -0.3 * e;
      break;
    }
    case 'armsup': // Arme hoch, wackelt vor Wut
      p.armLz = 2.6; p.armRz = -2.6; p.armLx = Math.sin(t * 18) * 0.15; p.armRx = Math.sin(t * 18 + 1) * 0.15;
      p.tiltZ = Math.sin(t * 16) * 0.05;
      break;
    case 'shove': { // Vorstoßen mit beiden Armen
      const e = env(t / 0.6);
      p.armLx = 1.55 * e; p.armRx = 1.55 * e; p.tiltX = -0.35 * e; p.legL = -0.4 * e; p.legR = 0.2 * e;
      break;
    }
    case 'wind': { // Ausholen, t 0..0.45
      const u = Math.min(1, t / 0.45);
      p.armRz = -2.3 * u; p.armRx = -0.9 * u; p.tiltX = 0.2 * u; p.armLx = 0.6 * u;
      break;
    }
    case 'throw': { // Wurf, t 0..0.3
      const u = Math.min(1, t / 0.3);
      p.armRz = -2.3 * (1 - u); p.armRx = -0.9 + 2.6 * u; p.tiltX = 0.2 - 0.55 * u; p.armLx = 0.6 * (1 - u);
      break;
    }
    case 'run': { // Lauf: Beine und Arme gegengleich
      const s = Math.sin(t * 11 * speed);
      p.legL = 0.9 * s; p.legR = -0.9 * s; p.armLx = -0.9 * s; p.armRx = 0.9 * s; p.tiltX = -0.12;
      p.bob = Math.abs(Math.cos(t * 11 * speed)) * 0.05;
      break;
    }
    case 'hop': // Sprung über den Tresen: Arme hoch, Beine angezogen
      p.armLz = 2.2; p.armRz = -2.2; p.legL = 0.7; p.legR = -0.2; p.tiltX = -0.1;
      break;
    case 'cross': // Arme verschränkt, atmet
      p.armLx = 1.45; p.armRx = 1.45; p.armLz = 0.85; p.armRz = -0.85; p.bob = Math.sin(t * 1.7) * 0.004; p.headX = 0.08;
      break;
    case 'point': // zeigt zur Tür
      p.armRx = 1.5; p.armRz = -0.1; p.armLx = 0.3; p.tiltX = -0.05; p.headX = Math.sin(t * 8) * 0.05;
      break;
    case 'cover': // geblendet: Arme vor das Gesicht, Kopf gesenkt, taumelt leicht
      p.armLx = 2.0; p.armRx = 2.0; p.armLz = 0.55; p.armRz = -0.55; p.headX = 0.3; p.tiltX = -0.1;
      p.tiltZ = Math.sin(t * 5) * 0.06; p.legL = Math.sin(t * 5) * 0.15; p.legR = -Math.sin(t * 5) * 0.15;
      break;
    default: break;
  }
  return p;
}

/** Rötung des Gesichts je Zustand 0..1. */
export const REDNESS = { calm: 0, annoyed: 0.35, shove: 0.65, throw: 1, chase: 1, banned: 0.8, grudge: 0 };
