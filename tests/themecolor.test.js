// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyThemeColor, setThemeColorOverride, removeThemeColor, THEME_COLORS } from '../src/js/core/themecolor.js';

const html = document.documentElement;
const meta = () => document.querySelector('meta[name="theme-color"]');
const content = () => meta().getAttribute('content');
const JF = '<meta id="themeColor" name="theme-color" content="#202020">';

beforeEach(() => {
  document.head.innerHTML = JF;
  html.className = '';
  window.location.hash = '#/home';
});
afterEach(() => {
  setThemeColorOverride(null);
  removeThemeColor();
  document.head.innerHTML = '';
});

describe('themecolor', () => {
  it('Farbe je Design, Wechsel und Wiederherstellung des Originals', () => {
    applyThemeColor('plus');
    expect(content()).toBe('#10131f');
    applyThemeColor('retro');
    expect(content()).toBe('#0a0603');
    for (const [id, c] of Object.entries(THEME_COLORS)) {
      applyThemeColor(id);
      expect(content()).toBe(c);
    }
    removeThemeColor();
    expect(content()).toBe('#202020');
    expect(document.querySelectorAll('meta[name="theme-color"]').length).toBe(1);
  });

  it('ohne vorhandenes Meta: eigenes anlegen und beim Entfernen löschen', () => {
    document.head.innerHTML = '';
    applyThemeColor('flix');
    expect(content()).toBe('#141414');
    removeThemeColor();
    expect(meta()).toBeNull();
  });

  it('Override überstimmt das Design, auch während Designwechsel, und gibt wieder frei', () => {
    applyThemeColor('plus');
    setThemeColorOverride('#000000');
    expect(content()).toBe('#000000');
    applyThemeColor('prime');
    expect(content()).toBe('#000000');
    setThemeColorOverride(null);
    expect(content()).toBe('#00050d');
  });

  it('Override ohne angewandtes Design (pending): wirkt, danach Original zurück', () => {
    setThemeColorOverride('#000000');
    expect(content()).toBe('#000000');
    setThemeColorOverride(null);
    expect(content()).toBe('#202020');
  });

  it('Override ohne Meta: eigenes Meta wird wieder entfernt', () => {
    document.head.innerHTML = '';
    setThemeColorOverride('#000000');
    expect(content()).toBe('#000000');
    setThemeColorOverride(null);
    expect(meta()).toBeNull();
  });

  it('Jellyfin überschreibt: nächster Abgleich korrigiert, neuer Jellyfin-Wert wird das Original', () => {
    applyThemeColor('plus');
    meta().setAttribute('content', '#303030');
    applyThemeColor('plus');
    expect(content()).toBe('#10131f');
    removeThemeColor();
    expect(content()).toBe('#303030');
  });

  it('Jellyfin ersetzt das Meta-Element', () => {
    applyThemeColor('plus');
    document.head.innerHTML = '<meta name="theme-color" content="#404040">';
    applyThemeColor('plus');
    expect(document.querySelectorAll('meta[name="theme-color"]').length).toBe(1);
    expect(content()).toBe('#10131f');
    removeThemeColor();
    expect(content()).toBe('#404040');
  });

  it('Jellyfin legt ein Meta an, obwohl wir ein eigenes haben: nur noch eines', () => {
    document.head.innerHTML = '';
    applyThemeColor('plus');
    document.head.insertAdjacentHTML('afterbegin', '<meta name="theme-color" content="#505050">');
    applyThemeColor('plus');
    expect(document.querySelectorAll('meta[name="theme-color"]').length).toBe(1);
    expect(content()).toBe('#10131f');
    removeThemeColor();
    expect(content()).toBe('#505050');
  });

  it('TV: Originalwert bleibt', () => {
    html.classList.add('layout-tv');
    applyThemeColor('plus');
    expect(content()).toBe('#202020');
    html.classList.remove('layout-tv');
    applyThemeColor('plus');
    expect(content()).toBe('#10131f');
    html.classList.add('layout-tv');
    applyThemeColor('plus');
    expect(content()).toBe('#202020');
  });

  it('Dashboard-Route: Originalwert, Routenwechsel gleicht ab', () => {
    window.location.hash = '#/dashboard';
    applyThemeColor('plus');
    expect(content()).toBe('#202020');
    window.location.hash = '#/home';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(content()).toBe('#10131f');
    window.location.hash = '#/dashboard/users';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(content()).toBe('#202020');
  });
});
