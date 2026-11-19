// @vitest-environment jsdom
// Hülle: Ultra-Gerätesperre (ultraAllowed): nur TV nie; Handy-Ultra-Spalte (ultraCompact): coarse + kleiner Bildschirm.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const lay = vi.hoisted(() => ({ tv: false }));
vi.mock('../src/js/core/layout.js', async () => {
  const actual = await vi.importActual('../src/js/core/layout.js');
  return { ...actual, isTv: () => (typeof lay.tv === 'function' ? lay.tv() : lay.tv) };
});
vi.mock('../src/js/core/themejs.js', () => ({ ensureThemeJs: vi.fn(async () => true), removeThemeJs: vi.fn() }));
vi.mock('../src/js/core/themepicker.js', () => ({ openThemePicker: vi.fn() }));

import { ultraAllowed, ultraCompact } from '../src/js/features/store/home.js';

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
  it('Handy (coarse, min(screen) < 600) seit 1.19.1 erlaubt, auch quer', () => {
    device({ coarse: true, w: 390, h: 844 });
    expect(ultraAllowed()).toBe(true);
    device({ coarse: true, w: 844, h: 390 });
    expect(ultraAllowed()).toBe(true);
    device({ coarse: true, w: 599, h: 900 });
    expect(ultraAllowed()).toBe(true);
  });
  it('TV nie, auch mit großem Bildschirm', () => {
    lay.tv = true;
    device({ coarse: false, w: 1920, h: 1080 });
    expect(ultraAllowed()).toBe(false);
  });
  it('Fehler bei der Erkennung (isTv wirft): nicht erlaubt', () => {
    lay.tv = () => { throw new Error('x'); };
    expect(ultraAllowed()).toBe(false);
  });
});

describe('ultraCompact', () => {
  it('Handy (coarse, min(screen) < 600) hoch, quer und an der Grenze 599', () => {
    device({ coarse: true, w: 390, h: 844 });
    expect(ultraCompact()).toBe(true);
    device({ coarse: true, w: 844, h: 390 });
    expect(ultraCompact()).toBe(true);
    device({ coarse: true, w: 599, h: 900 });
    expect(ultraCompact()).toBe(true);
  });
  it('Tablet (coarse, >= 600) und Desktop (fine) nie', () => {
    device({ coarse: true, w: 600, h: 900 });
    expect(ultraCompact()).toBe(false);
    device({ coarse: true, w: 1024, h: 768 });
    expect(ultraCompact()).toBe(false);
    device({ coarse: false, w: 390, h: 844 });
    expect(ultraCompact()).toBe(false);
    device({ coarse: false, w: 1920, h: 1080 });
    expect(ultraCompact()).toBe(false);
  });
  it('Fehler bei der Erkennung: false', () => {
    window.matchMedia = vi.fn(() => { throw new Error('x'); });
    expect(ultraCompact()).toBe(false);
  });
});
