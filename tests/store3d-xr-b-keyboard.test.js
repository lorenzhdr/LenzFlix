// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { keyboardLayout, applyKey, keyboardHeight } from '../src/js/store3d/xr/keyboard.js';

describe('xr/keyboard layout', () => {
  it('fünf QWERTZ-Reihen innerhalb der Breite, ohne Überlappung', () => {
    const W = 828;
    const keys = keyboardLayout(W);
    const rows = [...new Set(keys.map((k) => k.y))];
    expect(rows).toHaveLength(5);
    expect(keys.filter((k) => k.y === rows[0]).map((k) => k.key).join('')).toBe('1234567890ß');
    expect(keys.filter((k) => k.y === rows[1]).map((k) => k.key).join('')).toBe('qwertzuiopü');
    expect(keys.filter((k) => k.y === rows[2]).map((k) => k.key).join('')).toBe('asdfghjklöä');
    expect(keys.filter((k) => k.y === rows[3]).map((k) => k.key)).toEqual(['shift', 'y', 'x', 'c', 'v', 'b', 'n', 'm', '-', 'back']);
    expect(keys.filter((k) => k.y === rows[4]).map((k) => k.label)).toEqual(['Leertaste', 'Suchen']);
    for (const k of keys) { expect(k.x).toBeGreaterThanOrEqual(0); expect(k.x + k.w).toBeLessThanOrEqual(W + 0.001); }
    for (const y of rows) {
      const r = keys.filter((k) => k.y === y).sort((a, b) => a.x - b.x);
      for (let i = 1; i < r.length; i++) expect(r[i].x).toBeGreaterThanOrEqual(r[i - 1].x + r[i - 1].w);
    }
    expect(Math.max(...keys.map((k) => k.y + k.h))).toBe(keyboardHeight());
  });

  it('Shift zeigt Großbuchstaben, Zahlen und ß bleiben', () => {
    const labels = (s) => keyboardLayout(800, { shift: s }).map((k) => k.label);
    expect(labels(false)).toContain('ü');
    expect(labels(true)).toContain('Ü');
    expect(labels(true)).toContain('ß');
    expect(labels(true)).toContain('5');
  });
});

describe('xr/keyboard applyKey', () => {
  it('hängt Zeichen an, auch Umlaute', () => {
    let r = applyKey('', 'ä');
    r = applyKey(r.value, 'ö');
    r = applyKey(r.value, 'ü');
    r = applyKey(r.value, 'ß');
    expect(r.value).toBe('äöüß');
    expect(r.enter).toBe(false);
  });
  it('Shift gilt einmalig und schaltet um', () => {
    const r = applyKey('', 'shift', { shift: false });
    expect(r.shift).toBe(true);
    expect(applyKey('', 'a', { shift: true })).toEqual({ value: 'A', shift: false, enter: false });
    expect(applyKey('', 'ü', { shift: true }).value).toBe('Ü');
    expect(applyKey('', 'ß', { shift: true }).value).toBe('ß');
    expect(applyKey('', '5', { shift: true }).shift).toBe(false);
    expect(applyKey('x', 'shift', { shift: true }).shift).toBe(false);
  });
  it('löschen, Leertaste, Suchen', () => {
    expect(applyKey('abc', 'back').value).toBe('ab');
    expect(applyKey('', 'back').value).toBe('');
    expect(applyKey('ab', 'space').value).toBe('ab ');
    expect(applyKey('film', 'enter')).toEqual({ value: 'film', shift: false, enter: true });
  });
});
