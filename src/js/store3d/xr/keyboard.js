// VIDEOTHEK LENZ · VR-Tastatur (rein, ohne three): QWERTZ-Layout und Tastenlogik für Panels mit `input`.
export const KEY_H = 64;
export const KEY_GAP = 8;
export const KEY_ROWS = 5;
export const MAX_LEN = 80;

/** Höhe der Tastatur in Pixeln. */
export const keyboardHeight = () => KEY_ROWS * KEY_H + (KEY_ROWS - 1) * KEY_GAP;

const chars = (s) => [...s].map((c) => ({ w: 1, key: c }));
const ROWS = [
  chars('1234567890ß'),
  chars('qwertzuiopü'),
  chars('asdfghjklöä'),
  [{ w: 1.5, key: 'shift', label: '⇧' }, ...chars('yxcvbnm-'), { w: 1.5, key: 'back', label: '⌫' }],
  [{ w: 8, key: 'space', label: 'Leertaste' }, { w: 3, key: 'enter', label: 'Suchen' }],
];

const isLetter = (c) => c !== 'ß' && c.toLowerCase() !== c.toUpperCase();

/**
 * Tasten für eine Tastatur der Breite W (Koordinaten relativ zur linken oberen Ecke der Tastatur).
 * Rückgabe: [{ x, y, w, h, label, key }]; key = Zeichen (klein) | 'shift' | 'back' | 'space' | 'enter'.
 */
export function keyboardLayout(W, { shift = false } = {}) {
  const out = [];
  ROWS.forEach((row, r) => {
    const units = row.reduce((a, k) => a + k.w, 0);
    const unit = (W - (row.length - 1) * KEY_GAP) / units;
    let x = 0;
    for (const k of row) {
      const w = k.w * unit;
      const label = k.label || (shift && isLetter(k.key) ? k.key.toUpperCase() : k.key);
      out.push({ x, y: r * (KEY_H + KEY_GAP), w, h: KEY_H, label, key: k.key });
      x += w + KEY_GAP;
    }
  });
  return out;
}

/** Taste anwenden. Rückgabe { value, shift, enter } (Shift gilt nur für den nächsten Buchstaben). */
export function applyKey(value, key, { shift = false } = {}) {
  const v = value == null ? '' : String(value);
  if (key === 'shift') return { value: v, shift: !shift, enter: false };
  if (key === 'enter') return { value: v, shift, enter: true };
  if (key === 'back') return { value: [...v].slice(0, -1).join(''), shift, enter: false };
  if (key === 'space') return { value: v.length >= MAX_LEN ? v : `${v} `, shift, enter: false };
  if (typeof key === 'string' && [...key].length === 1) {
    if (v.length >= MAX_LEN) return { value: v, shift, enter: false };
    const c = shift && isLetter(key) ? key.toUpperCase() : key;
    return { value: v + c, shift: false, enter: false };
  }
  return { value: v, shift, enter: false };
}
