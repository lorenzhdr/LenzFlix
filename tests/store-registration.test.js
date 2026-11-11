// @vitest-environment jsdom
// VIDEOTHEK LENZ: die Hülle muss in der Feature-Liste stehen (sonst mountet das Design nie).
import { describe, it, expect } from 'vitest';
import { features } from '../src/js/features/index.js';
import { THEMES, THEME_META } from '../src/js/core/theme.js';

describe('store-Registrierung', () => {
  it('store-home und store-bar sind registriert', () => {
    const names = features.map((f) => f.name);
    expect(names).toContain('store-home');
    expect(names).toContain('store-bar');
  });
  it('Design store ist bekannt', () => {
    expect(THEMES).toContain('store');
    expect(THEME_META.store.name).toBe('VIDEOTHEK LENZ');
  });
});
