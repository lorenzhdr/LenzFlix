// TV-Modus: Vorlieben (localStorage pro Benutzer): lfx.tvm.<name>.<uid>.
import { getUserId } from '../../core/api.js';

export const DEFAULTS = { volume: 0.8, muted: false, lastChannel: 1 };

const storageKey = (name) => `lfx.tvm.${name}.${getUserId() || 'anon'}`;
const read = (key) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { window.localStorage.setItem(key, value); } catch { /* Speicher gesperrt */ } };

export function getVolume() {
  const raw = read(storageKey('volume'));
  if (raw === null || raw === '') return DEFAULTS.volume;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULTS.volume;
}

export const getMuted = () => read(storageKey('muted')) === '1';

export function getLastChannel() {
  const v = Number(read(storageKey('lastChannel')));
  return Number.isInteger(v) && v >= 1 && v <= 18 ? v : DEFAULTS.lastChannel;
}

/** Speichert { volume?, muted?, lastChannel? }; ungültige/fehlende Felder werden ignoriert. */
export function savePrefs(p) {
  if (!p || typeof p !== 'object') return;
  if (typeof p.volume === 'number' && Number.isFinite(p.volume) && p.volume >= 0 && p.volume <= 1) write(storageKey('volume'), String(p.volume));
  if (typeof p.muted === 'boolean') write(storageKey('muted'), p.muted ? '1' : '0');
  if (Number.isInteger(p.lastChannel) && p.lastChannel >= 1 && p.lastChannel <= 18) write(storageKey('lastChannel'), String(p.lastChannel));
}
