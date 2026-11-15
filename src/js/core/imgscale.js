// LenzFlix: Bildgrößen-Regler (Geheimmenü). Skalierung von maxWidth/maxHeight der Bild-URLs, pro Gerät und Nutzer in
// localStorage (lfx.imgscale.<userId|anon> = JSON {normal, saver}). „normal“ gilt ohne, „saver“ mit Datensparmodus (Teil „images“).
// Jeder Getter liest frisch aus dem Speicher (Nutzerwechsel greift automatisch). Importiert datasaver.js bewusst nicht (Zyklus).
import { getUserId } from './api.js';

const KEY = 'lfx.imgscale.';
export const IMGSCALE_EVENT = 'lfx:imgscale';
/** Standard-Skala im Datensparmodus (exakt 2/3, nicht 0.67: URLs und Server-Cache bleiben gleich). */
export const DATASAVER_SCALE = 2 / 3;
export const NORMAL_RANGE = [0.5, 2];
export const SAVER_RANGE = [0.25, 1];

const storageKey = () => `${KEY}${getUserId() || 'anon'}`;
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
const round05 = (v) => Math.round(v * 20) / 20;
const fix = (v, range) => clamp(round05(v), range);

function read() {
  try {
    const raw = window.localStorage.getItem(storageKey());
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function getNormalScale() {
  const v = num(read().normal);
  return v === null ? 1 : fix(v, NORMAL_RANGE);
}

export function getSaverScale() {
  const v = num(read().saver);
  return v === null ? DATASAVER_SCALE : fix(v, SAVER_RANGE);
}

export function isImageScaleCustom() {
  const o = read();
  return num(o.normal) !== null || num(o.saver) !== null;
}

function emit() {
  window.dispatchEvent(new CustomEvent(IMGSCALE_EVENT, { detail: { normal: getNormalScale(), saver: getSaverScale() } }));
}

/** Skalen setzen (klemmen, auf 0.05 runden, speichern). Nicht übergebene Werte bleiben unverändert. */
export function setImageScales({ normal, saver } = {}) {
  const o = read();
  const next = {};
  const n = num(normal) !== null ? fix(normal, NORMAL_RANGE) : num(o.normal);
  const s = num(saver) !== null ? fix(saver, SAVER_RANGE) : num(o.saver);
  if (n !== null) next.normal = n;
  if (s !== null) next.saver = s;
  try { window.localStorage.setItem(storageKey(), JSON.stringify(next)); } catch { /* Speicher gesperrt */ }
  emit();
}

/** Zurück auf Standard (Schlüssel löschen). */
export function resetImageScales() {
  try { window.localStorage.removeItem(storageKey()); } catch { /* Speicher gesperrt */ }
  emit();
}

/** Abo auf Änderungen: cb({normal, saver}). Rückgabe: Abmelden. */
export function onImageScaleChange(cb) {
  const fn = (e) => cb(e && e.detail);
  window.addEventListener(IMGSCALE_EVENT, fn);
  return () => window.removeEventListener(IMGSCALE_EVENT, fn);
}
