import { describe, it, expect } from 'vitest';
import { pad2 } from '../src/js/core/format.js';

describe('pad2', () => {
  it('füllt einstellige Zahlen mit führender Null', () => {
    expect(pad2(0)).toBe('00');
    expect(pad2(5)).toBe('05');
  });
  it('lässt zweistellige Zahlen unverändert', () => {
    expect(pad2(12)).toBe('12');
  });
  it('kürzt längere Zahlen nicht', () => {
    expect(pad2(123)).toBe('123');
  });
});
