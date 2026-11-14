// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const t = vi.hoisted(() => ({ theme: 'flix', listeners: new Set() }));
vi.mock('../src/js/core/api.js', () => ({
  getViews: vi.fn(async () => ({ Items: [{ Id: 'm1', Name: 'Filme', CollectionType: 'movies' }] })),
  getUserId: () => 'u1',
  isReady: () => true,
  setImageScale: vi.fn(),
}));
vi.mock('../src/js/core/theme.js', () => ({
  isTheme: (id) => t.theme === id,
  getTheme: () => t.theme,
  onThemeChange: (fn) => {
    t.listeners.add(fn);
    return () => t.listeners.delete(fn);
  },
}));
vi.mock('../src/js/core/themepicker.js', () => ({ openThemePicker: vi.fn() }));

import nav from '../src/js/features/nav.js';
import mobilenav from '../src/js/features/mobilenav.js';
import dsbtnFeature from '../src/js/features/dsbtn.js';
import { features } from '../src/js/features/index.js';
import { createDataSaverButton } from '../src/js/shared/dsbtn.js';
import { sheetEntries } from '../src/js/features/plus/tabbar.js';
import { openSheet, renderSheet, closeChooser, isChooserOpen } from '../src/js/core/sheet.js';
import { closePopover, isPopoverOpen } from '../src/js/core/popover.js';
import { isDataSaverOn, setDataSaver, syncDataSaver, destroyDataSaver } from '../src/js/core/datasaver.js';
import { parseHash } from '../src/js/core/router.js';
import { clearCache } from '../src/js/core/cache.js';
import { removeAllMounts } from '../src/js/core/dom.js';

beforeEach(() => {
  window.localStorage.clear();
  t.theme = 'flix';
  clearCache();
  document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
  document.documentElement.className = '';
  syncDataSaver();
});
afterEach(() => {
  nav.unmount();
  mobilenav.unmount();
  dsbtnFeature.unmount();
  closePopover();
  closeChooser();
  destroyDataSaver();
  removeAllMounts();
  document.documentElement.className = '';
});

describe('Datensparmodus: flix Mehr-Menü', () => {
  it('Schalterzeile nach dem Design-Eintrag; Klick schaltet um und schließt das Menü nicht', async () => {
    nav.mount(parseHash('#/home'));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-nav__item').length).toBe(5));
    const menu = document.querySelector('.lfx-nav__menu');
    const design = menu.querySelector('.lfx-nav__menu-item--design');
    const sw = menu.querySelector('.lfx-nav__menu-item--datasaver');
    expect(design.nextElementSibling).toBe(sw);
    expect(sw.getAttribute('role')).toBe('menuitemcheckbox');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.className).not.toMatch(/--fold/);
    const wrap = document.querySelector('.lfx-nav__more');
    wrap.dispatchEvent(new MouseEvent('mouseenter'));
    expect(wrap.classList.contains('is-open')).toBe(true);
    sw.click();
    expect(isDataSaverOn()).toBe(true);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(wrap.classList.contains('is-open')).toBe(true);
    // Umschalten von außen (z. B. Symbol) zieht den Schalter nach
    setDataSaver(false);
    expect(sw.getAttribute('aria-checked')).toBe('false');
    // Design-Klick schließt weiterhin
    design.click();
    expect(wrap.classList.contains('is-open')).toBe(false);
  });

  it('Pfeiltasten erreichen den Schalter', async () => {
    nav.mount(parseHash('#/home'));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-nav__item').length).toBe(5));
    const design = document.querySelector('.lfx-nav__menu-item--design');
    const sw = document.querySelector('.lfx-nav__menu-item--datasaver');
    design.focus();
    design.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(sw);
  });

  it('Datensparmodus-Ereignis löst die Neuberechnung der Leiste aus, Listener fällt in unmount weg', async () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    nav.mount(parseHash('#/home'));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-nav__item').length).toBe(5));
    await new Promise((r) => setTimeout(r, 50));
    raf.mockClear();
    setDataSaver(true);
    expect(raf).toHaveBeenCalled();
    nav.unmount();
    raf.mockClear();
    setDataSaver(false);
    expect(raf).not.toHaveBeenCalled();
    raf.mockRestore();
  });
});

describe('Datensparmodus: flix-Handy-Menü', () => {
  it('Overlay bleibt beim Umschalten offen', async () => {
    document.documentElement.className = 'layout-mobile';
    mobilenav.mount(parseHash('#/home'));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-mnav-overlay__link').length).toBeGreaterThan(5));
    document.querySelector('.lfx-mnav__pill--cats').click();
    const overlay = document.getElementById('lfx-mnav-overlay');
    const sw = overlay.querySelector('.lfx-mnav-overlay__link--datasaver');
    expect(sw.getAttribute('role')).toBe('switch');
    expect(overlay.querySelector('.lfx-mnav-overlay__link--design').parentElement.nextElementSibling.firstElementChild).toBe(sw);
    sw.click();
    expect(overlay.hidden).toBe(false);
    expect(isDataSaverOn()).toBe(true);
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });
});

describe('Datensparmodus: Symbol', () => {
  it('Klick öffnet Popover mit Hinweis und Ausschalten, zweiter Klick schließt', () => {
    const btn = createDataSaverButton();
    document.body.append(btn);
    expect(btn.classList.contains('lfx-dsbtn')).toBe(true);
    expect(btn.getAttribute('aria-label')).toBe('Datensparmodus an');
    expect(btn.title).toBe('Datensparmodus an');
    btn.click();
    expect(isPopoverOpen()).toBe(true);
    const pop = document.getElementById('lfx-popover');
    expect(pop.querySelector('.lfx-popover__note').textContent).toBe('Datensparmodus ist an');
    expect(pop.querySelectorAll('[role="menuitem"]').length).toBe(1);
    btn.click();
    expect(isPopoverOpen()).toBe(false);
  });

  it('Ausschalten schaltet den Modus aus und schließt das Popover', () => {
    setDataSaver(true);
    const btn = createDataSaverButton();
    document.body.append(btn);
    btn.click();
    document.querySelector('#lfx-popover [data-key="ds-off"]').click();
    expect(isDataSaverOn()).toBe(false);
    expect(document.documentElement.classList.contains('lfx-datasaver')).toBe(false);
    expect(isPopoverOpen()).toBe(false);
  });

  it('flix-Feature: #lfx-ds-btn wird gemountet und entfernt, match wie das TV-Symbol', () => {
    expect(features).toContain(dsbtnFeature);
    expect(dsbtnFeature.match(parseHash('#/home'))).toBe(true);
    expect(dsbtnFeature.match(parseHash('#/video'))).toBe(false);
    t.theme = 'plus';
    expect(dsbtnFeature.match(parseHash('#/home'))).toBe(false);
    t.theme = 'flix';
    dsbtnFeature.mount();
    const el = document.getElementById('lfx-ds-btn');
    expect(el.tagName).toBe('BUTTON');
    expect(el.classList.contains('lfx-dsbtn')).toBe(true);
    expect(document.documentElement.classList.contains('lfx-dsbtn-on')).toBe(true);
    dsbtnFeature.unmount();
    expect(document.getElementById('lfx-ds-btn')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-dsbtn-on')).toBe(false);
  });
});

describe('Datensparmodus: Sheets (LENZ+ Tabbar, core/sheet)', () => {
  const sw = { key: 'datasaver', label: 'Datensparmodus', switch: true, checked: false, onToggle: vi.fn() };

  it('sheetEntries reicht Schalter-Einträge durch', () => {
    const e = sheetEntries([], [{ key: 'design', label: 'Design', onClick: () => {} }, sw], { go: () => {}, close: () => {} });
    expect(e.at(-1)).toBe(sw);
  });

  it('renderSheet: Schalter-Zeile schaltet um und schließt das Blatt nicht', () => {
    const c = openSheet(null, 'Profil');
    renderSheet(c, 'Profil', [{ label: 'Eins', onClick: () => {} }, { ...sw, onToggle: vi.fn() }]);
    const btn = c.list.querySelector('.lfx-sheet__item--switch');
    expect(btn.getAttribute('role')).toBe('switch');
    expect(btn.getAttribute('aria-checked')).toBe('false');
    btn.click();
    expect(btn.getAttribute('aria-checked')).toBe('true');
    expect(isChooserOpen()).toBe(true);
  });
});
