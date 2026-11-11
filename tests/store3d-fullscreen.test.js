// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isStandalone, canElementFullscreen, isIPhoneSafari, barVisible, createFullscreen } from '../src/js/store3d/ui/fullscreen.js';
import { createPause } from '../src/js/store3d/ui/pause.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

describe('Erkennung', () => {
  it('isIPhoneSafari', () => {
    expect(isIPhoneSafari(IPHONE, 5)).toBe(true);
    expect(isIPhoneSafari(IPAD, 5)).toBe(false);
    expect(isIPhoneSafari(MAC, 5)).toBe(false);
    expect(isIPhoneSafari(ANDROID, 5)).toBe(false);
    expect(isIPhoneSafari(DESKTOP, 0)).toBe(false);
    expect(isIPhoneSafari(undefined, 0)).toBe(false);
  });
  it('isStandalone', () => {
    expect(isStandalone({ navigator: { standalone: true } })).toBe(true);
    expect(isStandalone({ navigator: {}, matchMedia: (q) => ({ matches: q === '(display-mode: fullscreen)' }) })).toBe(true);
    expect(isStandalone({ navigator: {}, matchMedia: (q) => ({ matches: q === '(display-mode: standalone)' }) })).toBe(true);
    expect(isStandalone({ navigator: {}, matchMedia: () => ({ matches: false }) })).toBe(false);
    expect(isStandalone({ navigator: {} })).toBe(false);
  });
  it('canElementFullscreen', () => {
    expect(canElementFullscreen({ fullscreenEnabled: true, documentElement: { requestFullscreen() {} } })).toBe(true);
    expect(canElementFullscreen({ webkitFullscreenEnabled: true, documentElement: { webkitRequestFullscreen() {} } })).toBe(true);
    expect(canElementFullscreen({ fullscreenEnabled: false, documentElement: { requestFullscreen() {} } })).toBe(false);
    expect(canElementFullscreen({ fullscreenEnabled: true, documentElement: {} })).toBe(false);
  });
  it('barVisible Grenzen', () => {
    expect(barVisible({ innerHeight: 300, screenShort: 390, landscape: true })).toBe(true);
    expect(barVisible({ innerHeight: 366, screenShort: 390, landscape: true })).toBe(false); // genau screenShort - 24
    expect(barVisible({ innerHeight: 365, screenShort: 390, landscape: true })).toBe(true);
    expect(barVisible({ innerHeight: 300, screenShort: 390, landscape: false })).toBe(false);
  });
});

function fakeWin(o = {}) {
  const w = new EventTarget();
  Object.assign(w, {
    navigator: { userAgent: IPHONE, maxTouchPoints: 5, standalone: false },
    innerWidth: 844, innerHeight: 300, scrollY: 0, screen: { width: 390, height: 844 },
    scrollTo: vi.fn(), matchMedia: () => ({ matches: false }), ...o,
  });
  return w;
}

describe('Wisch-Trick', () => {
  let mode;
  let hud;
  let win;
  let fs;
  const html = document.documentElement;
  const mk = () => createFullscreen({ host: document.body, isTouch: true, getMode: () => mode, userId: 'u1', hud, win, doc: document });
  beforeEach(() => {
    mode = 'play';
    hud = { note: vi.fn() };
    win = fakeWin();
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '';
    html.className = '';
  });
  afterEach(() => { if (fs) fs.destroy(); fs = null; });

  it('Overlay, Klasse und Spacer erscheinen bei iPhone + Querformat + play + Leiste', () => {
    fs = mk();
    fs.update();
    expect(html.classList.contains('lfx-store-swipe')).toBe(true);
    expect(document.querySelector('.lfx-store-swipe-spacer')).not.toBeNull();
    expect(document.querySelector('.lfx-store-swipe-hint').textContent).toContain('Nach oben wischen für Vollbild');
    expect(hud.note).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('lfx.store.fsTip.u1')).toBe('1');
  });

  it('kein Overlay: Android, Standalone, Hochformat, anderer Modus', () => {
    win = fakeWin({ navigator: { userAgent: ANDROID, maxTouchPoints: 5 } });
    fs = mk(); fs.update();
    expect(document.querySelector('.lfx-store-swipe-hint')).toBeNull();
    fs.destroy();
    win = fakeWin({ navigator: { userAgent: IPHONE, standalone: true } });
    fs = mk(); fs.update();
    expect(document.querySelector('.lfx-store-swipe-hint')).toBeNull();
    fs.destroy();
    win = fakeWin({ innerWidth: 390, innerHeight: 700 });
    fs = mk(); fs.update();
    expect(document.querySelector('.lfx-store-swipe-hint')).toBeNull();
    expect(html.classList.contains('lfx-store-swipe')).toBe(false);
    fs.destroy();
    win = fakeWin();
    mode = 'hold';
    fs = mk(); fs.update();
    expect(document.querySelector('.lfx-store-swipe-hint')).toBeNull();
  });

  it('Tipp nur einmal pro Nutzer', () => {
    localStorage.setItem('lfx.store.fsTip.u1', '1');
    fs = mk(); fs.update();
    expect(hud.note).not.toHaveBeenCalled();
  });

  it('Erfolg per scroll: Overlay weg, Klasse + Spacer bleiben', () => {
    fs = mk(); fs.update();
    win.scrollY = 40;
    win.dispatchEvent(new Event('scroll'));
    expect(document.querySelector('.lfx-store-swipe-hint')).toBeNull();
    expect(html.classList.contains('lfx-store-swipe')).toBe(true);
    expect(document.querySelector('.lfx-store-swipe-spacer')).not.toBeNull();
  });

  it('Erfolg per resize, Wiederanzeige höchstens 2-mal', () => {
    fs = mk(); fs.update();
    const cycle = () => {
      win.innerHeight = 390;
      win.dispatchEvent(new Event('resize'));
      expect(document.querySelector('.lfx-store-swipe-hint')).toBeNull();
      expect(html.classList.contains('lfx-store-swipe')).toBe(true);
      win.innerHeight = 300;
      win.dispatchEvent(new Event('resize'));
    };
    cycle();
    expect(document.querySelector('.lfx-store-swipe-hint')).not.toBeNull();
    cycle();
    expect(document.querySelector('.lfx-store-swipe-hint')).not.toBeNull();
    cycle();
    expect(document.querySelector('.lfx-store-swipe-hint')).toBeNull();
    expect(sessionStorage.getItem('lfx.store.swipeShown')).toBe('2');
  });

  it('× entfernt Overlay, Klasse und Spacer', () => {
    fs = mk(); fs.update();
    document.querySelector('.lfx-store-swipe-close').click();
    expect(document.querySelector('.lfx-store-swipe-hint')).toBeNull();
    expect(document.querySelector('.lfx-store-swipe-spacer')).toBeNull();
    expect(html.classList.contains('lfx-store-swipe')).toBe(false);
    expect(win.scrollTo).toHaveBeenCalledWith(0, 0);
    fs.update();
    expect(document.querySelector('.lfx-store-swipe-hint')).toBeNull();
  });

  it('„Dauerhaft ohne Leiste“ öffnet die Anleitung, Esc schließt', () => {
    fs = mk(); fs.update();
    [...document.querySelectorAll('.lfx-store-swipe-hint button')].find((b) => b.textContent.startsWith('Dauerhaft')).click();
    expect(document.querySelector('.lfx-store-fs-guide').textContent).toContain('Vollbild am iPhone');
    expect(document.querySelector('.lfx-store-swipe-hint')).toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.lfx-store-fs-guide')).toBeNull();
    expect(document.querySelector('.lfx-store-swipe-hint')).not.toBeNull();
  });

  it('Hochformat, suspend und destroy räumen alles ab', () => {
    fs = mk(); fs.update();
    win.innerWidth = 390; win.innerHeight = 700;
    win.dispatchEvent(new Event('resize'));
    expect(document.querySelector('.lfx-store-swipe-hint')).toBeNull();
    expect(document.querySelector('.lfx-store-swipe-spacer')).toBeNull();
    expect(html.classList.contains('lfx-store-swipe')).toBe(false);
    expect(win.scrollTo).toHaveBeenCalledWith(0, 0);
    win.innerWidth = 844; win.innerHeight = 300;
    fs.update();
    expect(html.classList.contains('lfx-store-swipe')).toBe(true);
    fs.suspend();
    expect(html.classList.contains('lfx-store-swipe')).toBe(false);
    fs.resume();
    expect(html.classList.contains('lfx-store-swipe')).toBe(true);
    fs.destroy();
    expect(html.classList.contains('lfx-store-swipe')).toBe(false);
    expect(document.querySelector('.lfx-store-swipe-hint, .lfx-store-swipe-spacer')).toBeNull();
    win.dispatchEvent(new Event('resize'));
    expect(html.classList.contains('lfx-store-swipe')).toBe(false);
  });
});

describe('Vollbild-Knopf', () => {
  const base = () => ({
    onResume() {}, onSearch() {}, onClassic() {}, onQuality() {}, onSound() {}, onFps() {}, onBigCovers() {}, onTheme() {}, onMenu() {},
    getQuality: () => 'auto', getSound: () => true, getFps: () => false, getBigCovers: () => true,
  });
  const btn = (host) => [...host.querySelectorAll('.lfx-store-pause-panel button')].find((b) => b.textContent.startsWith('Vollbild'));

  it('Desktop: Knopf versteckt; Touch + API: „Vollbild: Aus/An“; iPhone: „Vollbild …“', () => {
    let host = document.createElement('div');
    createPause(host, base());
    expect(btn(host).hidden).toBe(true);
    host = document.createElement('div');
    let on = false;
    const toggle = vi.fn(() => { on = !on; });
    createPause(host, { ...base(), fullscreenKind: () => 'api', getFullscreen: () => on, onFullscreen: toggle });
    expect(btn(host).hidden).toBe(false);
    expect(btn(host).textContent).toBe('Vollbild: Aus');
    btn(host).click();
    expect(toggle).toHaveBeenCalled();
    expect(btn(host).textContent).toBe('Vollbild: An');
    const h2 = document.createElement('div');
    createPause(h2, { ...base(), fullscreenKind: () => 'guide' });
    expect(btn(h2).hidden).toBe(false);
    expect(btn(h2).textContent).toBe('Vollbild …');
  });

  it('kind: Desktop none, iPhone guide (Anleitung), Standalone none', () => {
    const mkc = (win, isTouch = true) => createFullscreen({ host: document.body, isTouch, getMode: () => 'play', userId: 'u', win, doc: document });
    const c1 = mkc(fakeWin({ navigator: { userAgent: DESKTOP } }), false);
    expect(c1.kind).toBe('none');
    c1.destroy();
    const c3 = mkc(fakeWin());
    expect(c3.kind).toBe('guide');
    c3.toggle();
    const g = document.querySelector('.lfx-store-fs-guide');
    expect(g.textContent).toContain('Kein Ton? Stummschalter am iPhone prüfen.');
    g.querySelector('.lfx-store-act').click();
    expect(document.querySelector('.lfx-store-fs-guide')).toBeNull();
    c3.destroy();
    const c4 = mkc(fakeWin({ navigator: { userAgent: IPHONE, standalone: true } }));
    expect(c4.kind).toBe('none');
    c4.destroy();
  });

  it('Fullscreen-API-Pfad mit gemocktem requestFullscreen', () => {
    const de = document.documentElement;
    const req = vi.fn(() => Promise.resolve());
    de.requestFullscreen = req;
    document.exitFullscreen = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    let fsEl = null;
    Object.defineProperty(document, 'fullscreenElement', { get: () => fsEl, configurable: true });
    const onChange = vi.fn();
    const c = createFullscreen({ host: document.body, isTouch: true, getMode: () => 'play', userId: 'u', win: fakeWin({ navigator: { userAgent: ANDROID } }), doc: document, onChange });
    expect(c.kind).toBe('api');
    c.toggle();
    expect(req).toHaveBeenCalledTimes(1);
    fsEl = de;
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(c.isOn()).toBe(true);
    c.toggle();
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
    c.destroy();
    delete de.requestFullscreen;
    delete document.exitFullscreen;
    delete document.fullscreenEnabled;
    delete document.fullscreenElement;
  });
});
