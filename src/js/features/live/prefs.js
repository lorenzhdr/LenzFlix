// LENZ LIVE: Vorlieben (localStorage pro Benutzer): lfx.live.<name>.<uid>.
import { getUserId } from '../../core/api.js';

const KEY = 'lfx.live.';
export const STYLES = ['flat', 'crt80', 'silver', 'plain'];
export const DEFAULTS = { style: 'flat', volume: 0.8, muted: false, lastChannel: 1, music: true, fx: true };

// Stil unter eigenem Schlüssel (lfx.live.tvstyle.<uid>): der frühere Schlüssel „style“ wurde mit dem Standard crt80
// automatisch beschrieben und wird bewusst nicht mehr gelesen, damit alle einmalig den neuen Standard (flat) bekommen.
const storageKey = (name) => `${KEY}${name}.${getUserId() || 'anon'}`;

function read(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* Speicher gesperrt */ }
}

export function getStyle() {
  const v = read(storageKey('tvstyle'));
  return STYLES.includes(v) ? v : DEFAULTS.style;
}

export function getVolume() {
  const raw = read(storageKey('volume'));
  if (raw === null || raw === '') return DEFAULTS.volume;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULTS.volume;
}

export function getMuted() {
  return read(storageKey('muted')) === '1';
}

/** Pausenmusik (Standard an; nur '0' schaltet aus). */
export function getMusic() {
  return read(storageKey('music')) !== '0';
}

/** Röhren-Effekte (Standard an; nur '0' schaltet aus). */
export function getFx() {
  return read(storageKey('fx')) !== '0';
}

export function getLastChannel() {
  const v = Number(read(storageKey('lastChannel')));
  return Number.isInteger(v) && v >= 1 && v <= 18 ? v : DEFAULTS.lastChannel;
}

/** Speichert { style?, volume?, muted?, lastChannel?, music?, fx? }; ungültige/fehlende Felder werden ignoriert. */
export function savePrefs(p) {
  if (!p || typeof p !== 'object') return;
  if (STYLES.includes(p.style)) write(storageKey('tvstyle'), p.style);
  if (typeof p.volume === 'number' && Number.isFinite(p.volume) && p.volume >= 0 && p.volume <= 1) write(storageKey('volume'), String(p.volume));
  if (typeof p.muted === 'boolean') write(storageKey('muted'), p.muted ? '1' : '0');
  if (typeof p.music === 'boolean') write(storageKey('music'), p.music ? '1' : '0');
  if (typeof p.fx === 'boolean') write(storageKey('fx'), p.fx ? '1' : '0');
  if (Number.isInteger(p.lastChannel) && p.lastChannel >= 1 && p.lastChannel <= 18) write(storageKey('lastChannel'), String(p.lastChannel));
}
