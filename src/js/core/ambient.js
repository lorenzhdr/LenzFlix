// LenzFlix: Ambient-Farbe (Verlauf hinter dem Header). Animation über registrierte @property --lfx-ambient-r/g/b
// (siehe js-ui/header.css). --lfx-ambient (RGB-Tripel) wird zusätzlich sofort gesetzt für andere Regeln.
import { mountPoint, unmountPoint } from './dom.js';

const ID = 'lfx-ambient';
const clamp = (n) => Math.max(0, Math.min(255, Math.round(Number(n) || 0)));

let current = null;

/** Setzt die Ambient-Farbe (0..255 je Kanal). */
export function setAmbient(r, g, b) {
  const [R, G, B] = [clamp(r), clamp(g), clamp(b)];
  current = [R, G, B];
  const s = document.documentElement.style;
  s.setProperty('--lfx-ambient-r', String(R));
  s.setProperty('--lfx-ambient-g', String(G));
  s.setProperty('--lfx-ambient-b', String(B));
  s.setProperty('--lfx-ambient', `${R} ${G} ${B}`);
}

export function getAmbient() {
  return current;
}

export function resetAmbient() {
  current = null;
  const s = document.documentElement.style;
  for (const p of ['--lfx-ambient-r', '--lfx-ambient-g', '--lfx-ambient-b', '--lfx-ambient']) s.removeProperty(p);
}

/** Legt den Verlaufs-Layer als erstes Kind von body an (liegt damit unter positioniertem Content). */
export function mountAmbient() {
  return mountPoint(ID, { before: document.body.firstChild, className: 'lfx-ambient' });
}

export function unmountAmbient() {
  unmountPoint(ID);
  resetAmbient();
}
