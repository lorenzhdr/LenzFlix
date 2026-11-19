// @vitest-environment jsdom
// 1.19.1: Fadenkreuz auch am Touch-Gerät (alle Schemata), gelb bei Ziel; Desktop unverändert nur mit Pointer-Lock/Drag-Umsehen.
import { describe, it, expect } from 'vitest';
import { createHud } from '../src/js/store3d/ui/hud.js';
import { StoreApp } from '../src/js/store3d/store.js';

const crossOf = (host) => host.querySelector('.lfx-store-cross');

describe('HUD-Fadenkreuz', () => {
  it('Touch: startet versteckt, setCross blendet ein und hebt hervor', () => {
    const host = document.createElement('div');
    const hud = createHud(host, { touch: true, getTouchScheme: () => 'touch' });
    const c = crossOf(host);
    expect(c.hidden).toBe(true);
    hud.setCross(true, false);
    expect(c.hidden).toBe(false);
    expect(c.classList.contains('is-aimed')).toBe(false);
    hud.setCross(true, true);
    expect(c.classList.contains('is-aimed')).toBe(true);
    hud.setCross(false, false);
    expect(c.hidden).toBe(true);
    hud.destroy();
  });
  it('Desktop: startet versteckt wie bisher', () => {
    const host = document.createElement('div');
    const hud = createHud(host, { touch: false });
    expect(crossOf(host).hidden).toBe(true);
    hud.setCross(true, false);
    expect(crossOf(host).hidden).toBe(false);
    hud.destroy();
  });
});

describe('StoreApp.crossOn', () => {
  const on = (o) => StoreApp.prototype.crossOn.call(o);
  it('Touch (ohne Desktop-Steuerung): nur im Spiel', () => {
    expect(on({ mode: 'play', desktop: null, touch: true })).toBe(true);
    expect(on({ mode: 'hold', desktop: null, touch: true })).toBe(false);
    expect(on({ mode: 'pause', desktop: null, touch: true })).toBe(false);
  });
  it('Desktop: nur mit Pointer-Lock oder Drag-Umsehen', () => {
    expect(on({ mode: 'play', desktop: { locked: true }, touch: false })).toBe(true);
    expect(on({ mode: 'play', desktop: { locked: false, dragLook: true }, touch: false })).toBe(true);
    expect(on({ mode: 'play', desktop: { locked: false, dragLook: false }, touch: false })).toBe(false);
  });
  it('weder Desktop noch Touch: aus', () => {
    expect(on({ mode: 'play', desktop: null, touch: false })).toBe(false);
  });
});
