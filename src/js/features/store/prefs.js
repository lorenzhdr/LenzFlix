// VIDEOTHEK LENZ: Vorlieben (localStorage pro Benutzer) und Sitzungszustand (sessionStorage).
import { getUserId } from '../../core/api.js';

const KEY = 'lfx.store.';
const DEFAULTS = { quality: 'auto', sound: true, fps: false, bigCovers: true, voiceOnline: false };
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

/** Ton (Standard an). Neuer Schlüssel „soundOn“; der alte Schlüssel „sound“ (Standard aus) wird ignoriert und entfernt. */
export function getSound() {
  try { window.localStorage.removeItem(storageKey('sound')); } catch { /* egal */ }
  const v = read('localStorage', storageKey('soundOn'));
  return v === null ? DEFAULTS.sound : v !== '0';
}

export function getFps() {
  return read('localStorage', storageKey('fps')) === '1';
}

/** Online-Stimmen für den Kassierer (Standard aus: nur Gerätestimmen, Datenschutz). */
export function getVoiceOnline() {
  return read('localStorage', storageKey('voiceOnline')) === '1';
}

/** Große Hüllen (Standard an): nur ein ausdrückliches „0“ schaltet sie aus. */
export function getBigCovers() {
  const v = read('localStorage', storageKey('bigCovers'));
  return v === null ? DEFAULTS.bigCovers : v !== '0';
}

/** Speichert { quality?, sound?, fps?, bigCovers? } (unbekannte/fehlende Felder werden ignoriert). */
export function savePrefs(p) {
  if (!p) return;
  if (QUALITIES.includes(p.quality)) write('localStorage', storageKey('quality'), p.quality);
  if (typeof p.sound === 'boolean') write('localStorage', storageKey('soundOn'), p.sound ? '1' : '0');
  if (typeof p.fps === 'boolean') write('localStorage', storageKey('fps'), p.fps ? '1' : '0');
  if (typeof p.voiceOnline === 'boolean') write('localStorage', storageKey('voiceOnline'), p.voiceOnline ? '1' : '0');
  if (typeof p.bigCovers === 'boolean') write('localStorage', storageKey('bigCovers'), p.bigCovers ? '1' : '0');
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
