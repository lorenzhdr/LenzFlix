// @vitest-environment jsdom
// iPhone-Vollbildanleitung: Fokusrückgabe und Aufräumen bei suspend.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFullscreen } from '../src/js/store3d/ui/fullscreen.js';

describe('iPhone-Vollbildanleitung', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const mk = () => {
    const win = new EventTarget();
    Object.assign(win, { navigator: { userAgent: IPHONE, maxTouchPoints: 5, standalone: false }, innerWidth: 844, innerHeight: 300, scrollY: 0, screen: { width: 390, height: 844 }, scrollTo: vi.fn(), matchMedia: () => ({ matches: false }) });
    return createFullscreen({ host: document.body, isTouch: true, getMode: () => 'play', userId: 'u', win, doc: document });
  };
  beforeEach(() => { document.body.innerHTML = ''; });
  it('Schließen gibt den Fokus an den vorherigen Knopf zurück', () => {
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    btn.focus();
    const fs = mk();
    fs.showGuide();
    expect(document.activeElement).not.toBe(btn);
    fs.hideGuide();
    expect(document.activeElement).toBe(btn);
    fs.destroy();
  });
  it('suspend entfernt Anleitung und Escape-Listener', () => {
    const fs = mk();
    fs.showGuide();
    fs.suspend();
    expect(document.querySelector('.lfx-store-fs-guide')).toBeNull();
    const e = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true });
    const spy = vi.spyOn(e, 'stopPropagation');
    document.dispatchEvent(e);
    expect(spy).not.toHaveBeenCalled();
    fs.destroy();
  });
});

