// VIDEOTHEK LENZ: Vorlieben (localStorage pro Benutzer) und Sitzungszustand (sessionStorage).
import { getUserId } from '../../core/api.js';

const KEY = 'lfx.store.';
const DEFAULTS = { quality: 'auto', sound: true, fps: false, bigCovers: true, voiceOnline: false, voicePitch: 'tief', touchControl: 'joystick' };
export const TOUCH_CONTROLS = ['joystick', 'touch'];
export const VOICE_PITCHES = ['normal', 'tief', 'sehrtief'];
export const QUALITIES = ['auto', 'low', 'mid', 'high'];
export const VR_TURNS = ['snap', 'smooth'];
export const VR_HEIGHTS = ['auto', 'seated'];
export const VR_QUALITIES = ['mid', 'low'];
export const VR_SEATS = ['front', 'mid', 'back'];
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

/** Gewählte Kassierer-Stimme (Name; leer = automatisch). */
export function getVoiceName() {
  return read('localStorage', storageKey('voiceName')) || '';
}

/** Tonlage des Kassierers: 'normal' | 'tief' (Standard) | 'sehrtief'. */
export function getVoicePitch() {
  const v = read('localStorage', storageKey('voicePitch'));
  return VOICE_PITCHES.includes(v) ? v : DEFAULTS.voicePitch;
}

/** Touch-Steuerung: 'joystick' (Standard: Gehen-Knopf + Joystick) oder 'touch' (Halten = laufen, Wischen = umsehen). */
export function getTouchControl() {
  const v = read('localStorage', storageKey('touchControl'));
  return TOUCH_CONTROLS.includes(v) ? v : DEFAULTS.touchControl;
}

/** Große Hüllen (Standard an): nur ein ausdrückliches „0“ schaltet sie aus. */
export function getBigCovers() {
  const v = read('localStorage', storageKey('bigCovers'));
  return v === null ? DEFAULTS.bigCovers : v !== '0';
}

function readEnum(name, list, def) {
  const v = read('localStorage', storageKey(name));
  return list.includes(v) ? v : def;
}
export const getVrTurn = () => readEnum('vrTurn', VR_TURNS, 'snap');
/** Tunnelblick-Vignette beim Gleiten (Standard an): nur ein ausdrückliches „0“ schaltet sie aus. */
export const getVrVignette = () => read('localStorage', storageKey('vrVignette')) !== '0';
export const getVrHeight = () => readEnum('vrHeight', VR_HEIGHTS, 'auto');
export const getVrQuality = () => readEnum('vrQuality', VR_QUALITIES, 'mid');
export const getVrSeat = () => readEnum('vrSeat', VR_SEATS, 'mid');

/** VR-Vorlieben als opts.vr. */
export function getVr() {
  return { turn: getVrTurn(), vignette: getVrVignette(), height: getVrHeight(), quality: getVrQuality(), seat: getVrSeat() };
}

/** Speichert { quality?, sound?, fps?, bigCovers?, voiceOnline?, voiceName?, voicePitch?, touchControl?, vr? { turn, vignette, height, quality, seat } } (unbekannte/fehlende Felder werden ignoriert). */
export function savePrefs(p) {
  if (!p) return;
  if (QUALITIES.includes(p.quality)) write('localStorage', storageKey('quality'), p.quality);
  if (typeof p.sound === 'boolean') write('localStorage', storageKey('soundOn'), p.sound ? '1' : '0');
  if (typeof p.fps === 'boolean') write('localStorage', storageKey('fps'), p.fps ? '1' : '0');
  if (typeof p.voiceOnline === 'boolean') write('localStorage', storageKey('voiceOnline'), p.voiceOnline ? '1' : '0');
  if (typeof p.voiceName === 'string') write('localStorage', storageKey('voiceName'), p.voiceName);
  if (VOICE_PITCHES.includes(p.voicePitch)) write('localStorage', storageKey('voicePitch'), p.voicePitch);
  if (TOUCH_CONTROLS.includes(p.touchControl)) write('localStorage', storageKey('touchControl'), p.touchControl);
  if (typeof p.bigCovers === 'boolean') write('localStorage', storageKey('bigCovers'), p.bigCovers ? '1' : '0');
  const vr = p.vr;
  if (vr && typeof vr === 'object') {
    if (VR_TURNS.includes(vr.turn)) write('localStorage', storageKey('vrTurn'), vr.turn);
    if (typeof vr.vignette === 'boolean') write('localStorage', storageKey('vrVignette'), vr.vignette ? '1' : '0');
    if (VR_HEIGHTS.includes(vr.height)) write('localStorage', storageKey('vrHeight'), vr.height);
    if (VR_QUALITIES.includes(vr.quality)) write('localStorage', storageKey('vrQuality'), vr.quality);
    if (VR_SEATS.includes(vr.seat)) write('localStorage', storageKey('vrSeat'), vr.seat);
  }
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
