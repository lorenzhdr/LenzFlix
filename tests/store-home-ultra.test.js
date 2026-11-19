// @vitest-environment jsdom
// Hülle: Ultra-Gerätesperre (ultraAllowed): Desktop/Tablet erlaubt, Handy (coarse, kleine Seite) und TV nie.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const lay = vi.hoisted(() => ({ tv: false }));
vi.mock('../src/js/core/layout.js', async () => {
  const actual = await vi.importActual('../src/js/core/layout.js');
  return { ...actual, isTv: () => lay.tv };
});
vi.mock('../src/js/core/themejs.js', () => ({ ensureThemeJs: vi.fn(async () => true), removeThemeJs: vi.fn() }));
vi.mock('../src/js/core/themepicker.js', () => ({ openThemePicker: vi.fn() }));

import { ultraAllowed } from '../src/js/features/store/home.js';

function device({ coarse, w, h }) {
  window.matchMedia = vi.fn((q) => ({ matches: coarse && /pointer:\s*coarse/.test(q), addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('screen', { width: w, height: h });
}

beforeEach(() => { lay.tv = false; });
afterEach(() => { vi.unstubAllGlobals(); });

describe('ultraAllowed', () => {
  it('Desktop (fine pointer) erlaubt, auch bei kleinem Fenster', () => {
    device({ coarse: false, w: 1920, h: 1080 });
    expect(ultraAllowed()).toBe(true);
    device({ coarse: false, w: 500, h: 500 });
    expect(ultraAllowed()).toBe(true);
  });
  it('Tablet (coarse, min(screen) >= 600) erlaubt, Grenze 600', () => {
    device({ coarse: true, w: 1024, h: 768 });
    expect(ultraAllowed()).toBe(true);
    device({ coarse: true, w: 600, h: 900 });
    expect(ultraAllowed()).toBe(true);
  });
  it('Handy (coarse, min(screen) < 600) nie, auch quer', () => {
    device({ coarse: true, w: 390, h: 844 });
    expect(ultraAllowed()).toBe(false);
    device({ coarse: true, w: 844, h: 390 });
    expect(ultraAllowed()).toBe(false);
    device({ coarse: true, w: 599, h: 900 });
    expect(ultraAllowed()).toBe(false);
  });
  it('TV nie, auch mit großem Bildschirm', () => {
    lay.tv = true;
    device({ coarse: false, w: 1920, h: 1080 });
    expect(ultraAllowed()).toBe(false);
  });
  it('Fehler bei der Erkennung: nicht erlaubt', () => {
    window.matchMedia = vi.fn(() => { throw new Error('x'); });
    expect(ultraAllowed()).toBe(false);
  });
});
