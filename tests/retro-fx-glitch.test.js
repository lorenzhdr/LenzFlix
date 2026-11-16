// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createGlitch } from '../src/js/features/retro/fx/glitch.js';

describe('A089/A094 Glitch: stop() räumt die Basisklasse an fremden Überschriften auf', () => {
  afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

  it('entfernt lfx-retro-glitch und is-glitching, wenn stop() vor dem 600-ms-Timer läuft', () => {
    document.body.innerHTML = '<h1 id="t">Titel</h1>';
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20 });
    const g = createGlitch({ crt: { glitchStrip() {} } });
    g.start();
    g.fire();
    const el = document.getElementById('t');
    expect(el.classList.contains('is-glitching')).toBe(true);
    g.stop();
    expect(el.classList.contains('is-glitching')).toBe(false);
    expect(el.classList.contains('lfx-retro-glitch')).toBe(false);
  });
});
