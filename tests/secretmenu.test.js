// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const st = { theme: 'flix', modern: true, tv: false, ready: true };
vi.mock('../src/js/core/theme.js', () => ({ isTheme: (id) => st.theme === id, getTheme: () => st.theme, onThemeChange: () => () => {} }));
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => st.modern, isTv: () => st.tv }));
vi.mock('../src/js/core/api.js', () => ({ isReady: () => st.ready, getUserId: () => 'u1', setImageScale: () => {} }));

import secretmenu, { resetSecretClicks } from '../src/js/features/secretmenu.js';
import { isSecretMenuOpen, closeSecretMenu } from '../src/js/features/secretmenu/panel.js';
import { getNormalScale, getSaverScale } from '../src/js/core/imgscale.js';
import { getDataSaverParts } from '../src/js/core/datasaver.js';

function setup() {
  document.body.innerHTML = '<header class="MuiAppBar-root"><a href="#/" id="logo"><img></a></header><a class="lfx-mnav__logo" href="#/home" id="mlogo"></a>';
}
function click(id) {
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
  document.getElementById(id).dispatchEvent(ev);
  return ev;
}
const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

describe('Geheimmenü', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
    Object.assign(st, { theme: 'flix', modern: true, tv: false, ready: true });
    localStorage.clear();
    resetSecretClicks();
    setup();
    secretmenu.mount();
  });
  afterEach(() => {
    secretmenu.unmount();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('match nur unter flix, Modern, nicht TV', () => {
    expect(secretmenu.match({})).toBe(true);
    st.theme = 'plus';
    expect(secretmenu.match({})).toBe(false);
    st.theme = 'retro';
    expect(secretmenu.match({})).toBe(false);
    Object.assign(st, { theme: 'flix', tv: true });
    expect(secretmenu.match({})).toBe(false);
    Object.assign(st, { tv: false, modern: false });
    expect(secretmenu.match({})).toBe(false);
  });

  it('4 Klicks öffnen nichts, der 5. öffnet und verhindert Navigation', () => {
    for (let i = 0; i < 4; i++) {
      expect(click('logo').defaultPrevented).toBe(false);
      vi.advanceTimersByTime(500);
    }
    expect(isSecretMenuOpen()).toBe(false);
    const ev = click('logo');
    expect(ev.defaultPrevented).toBe(true);
    expect(isSecretMenuOpen()).toBe(true);
    const dlg = document.querySelector('[role="dialog"]');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(dlg.textContent).toContain('Geheimmenü');
  });

  it('Abstand über 3 s setzt den Zähler zurück', () => {
    for (let i = 0; i < 4; i++) click('logo');
    vi.advanceTimersByTime(3500);
    expect(click('logo').defaultPrevented).toBe(false);
    expect(isSecretMenuOpen()).toBe(false);
  });

  it('Handy-Logo zählt auch, gemischt mit PC-Logo', () => {
    click('mlogo'); click('logo'); click('mlogo'); click('logo');
    expect(click('mlogo').defaultPrevented).toBe(true);
    expect(isSecretMenuOpen()).toBe(true);
  });

  it('nach unmount reagiert nichts mehr und das Menü ist weg', () => {
    for (let i = 0; i < 5; i++) click('logo');
    expect(isSecretMenuOpen()).toBe(true);
    secretmenu.unmount();
    expect(isSecretMenuOpen()).toBe(false);
    expect(document.getElementById('lfx-secret')).toBeNull();
    for (let i = 0; i < 5; i++) click('logo');
    expect(isSecretMenuOpen()).toBe(false);
  });

  describe('Panel', () => {
    beforeEach(() => { for (let i = 0; i < 5; i++) click('logo'); });

    it('Regler: input ändert nur Anzeige, change speichert', () => {
      const r = document.getElementById('lfx-secret-normal');
      expect(r.value).toBe('100');
      r.value = '150';
      fire(r, 'input');
      expect(getNormalScale()).toBe(1);
      expect(document.querySelector('.lfx-secret__val').textContent).toBe('150 %');
      expect(document.querySelector('.lfx-secret__slider .lfx-secret__note').textContent).toContain('Poster 450 px');
      fire(r, 'change');
      expect(getNormalScale()).toBe(1.5);
      const s = document.getElementById('lfx-secret-saver');
      expect(s.value).toBe('67');
      s.value = '50';
      fire(s, 'change');
      expect(getSaverScale()).toBe(0.5);
    });

    it('Zurücksetzen stellt 100 % / 67 % her', () => {
      const r = document.getElementById('lfx-secret-normal');
      r.value = '150';
      fire(r, 'change');
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Zurücksetzen');
      btn.click();
      expect(getNormalScale()).toBe(1);
      expect(document.getElementById('lfx-secret-normal').value).toBe('100');
      expect(document.getElementById('lfx-secret-saver').value).toBe('67');
    });

    it('Teilschalter und „Alle wieder an“', () => {
      const sw = document.querySelector('button[data-key="trailer"]');
      expect(sw.getAttribute('aria-checked')).toBe('true');
      sw.click();
      expect(getDataSaverParts().trailer).toBe(false);
      const all = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Alle wieder an');
      all.click();
      expect(getDataSaverParts().trailer).toBe(true);
      expect(document.querySelector('button[data-key="trailer"]').getAttribute('aria-checked')).toBe('true');
    });

    it('Wiedergabe: Auto-Weiter-Schalter (Startwert vom Server, Toggle schreibt)', async () => {
      const get = vi.fn(() => Promise.resolve({ Id: 'lenzflix-player', CustomPrefs: { autoNext: '0', other: 'x' } }));
      const upd = vi.fn(() => Promise.resolve());
      window.ApiClient = { getCurrentUserId: () => 'u1', getDisplayPreferences: get, updateDisplayPreferences: upd };
      closeSecretMenu();
      resetSecretClicks();
      for (let i = 0; i < 5; i++) click('logo');
      expect(isSecretMenuOpen()).toBe(true);
      const heads = [...document.querySelectorAll('.lfx-secret__h')].map((e) => e.textContent);
      expect(heads.indexOf('Wiedergabe')).toBeGreaterThanOrEqual(0);
      expect(heads.indexOf('Wiedergabe')).toBe(heads.indexOf('TV (Test)') - 1);
      const sw = document.querySelector('button[data-key="autonext"]');
      expect(sw.getAttribute('role')).toBe('switch');
      expect(sw.getAttribute('aria-checked')).toBe('true'); // Spiegel fehlend = an
      for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(sw.getAttribute('aria-checked')).toBe('false'); // Server sagt aus
      sw.click();
      for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(sw.getAttribute('aria-checked')).toBe('true');
      expect(upd).toHaveBeenCalledTimes(1);
      expect(upd.mock.calls[0][1].CustomPrefs).toEqual({ other: 'x', autoNext: '1' });
      delete window.ApiClient;
    });

    it('TV-Schalter schreiben in den Speicher', () => {
      document.querySelector('button[data-key="zapstats"]').click();
      expect(Object.values(localStorage).length).toBeGreaterThan(0);
    });

    it('Esc schließt, Hintergrundklick schließt', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(isSecretMenuOpen()).toBe(false);
      for (let i = 0; i < 5; i++) click('logo');
      expect(isSecretMenuOpen()).toBe(true);
      document.getElementById('lfx-secret').click();
      expect(isSecretMenuOpen()).toBe(false);
      closeSecretMenu();
    });
  });
});
