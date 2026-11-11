// VIDEOTHEK LENZ: Vorlieben (localStorage pro Benutzer) und Sitzungszustand (sessionStorage).
import { getUserId } from '../../core/api.js';

const KEY = 'lfx.store.';
const DEFAULTS = { quality: 'auto', sound: false };
export const QUALITIES = ['auto', 'low', 'mid', 'high'];
const SESSION_INTRO = 'lfx.store.introSeen';
const SESSION_STATE = 'lfx.store.state';

const storageKey = (name) => `${KEY}${name}.${getUserId() || 'anon'}`;

function read(store, key) {
  try { return window[store].getItem(key); } catch { return null; }
}
function write(store, key, value) {
  try { window[store].setItem(key, value); } catch { /* Speicher gesperrt */ }
}

export function getQuality() {
  const v = read('localStorage', storageKey('quality'));
  return QUALITIES.includes(v) ? v : DEFAULTS.quality;
}

export function getSound() {
  return read('localStorage', storageKey('sound')) === '1';
}

/** Speichert { quality?, sound? } (unbekannte/fehlende Felder werden ignoriert). */
export function savePrefs(p) {
  if (!p) return;
  if (QUALITIES.includes(p.quality)) write('localStorage', storageKey('quality'), p.quality);
  if (typeof p.sound === 'boolean') write('localStorage', storageKey('sound'), p.sound ? '1' : '0');
}

export const getIntroSeen = () => read('sessionStorage', SESSION_INTRO) === '1';
export const setIntroSeen = () => write('sessionStorage', SESSION_INTRO, '1');

export function getState() {
  const raw = read('sessionStorage', SESSION_STATE);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s && [s.x, s.z, s.yaw, s.pitch].every((n) => Number.isFinite(n)) ? s : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  if (!state || typeof state !== 'object') return;
  write('sessionStorage', SESSION_STATE, JSON.stringify(state));
}

export function clearState() {
  try { window.sessionStorage.removeItem(SESSION_STATE); } catch { /* egal */ }
}
