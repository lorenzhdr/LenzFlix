/* global process */
// @vitest-environment jsdom
// Vollbild-Leiste: reduzierte Reihenfolge per CSS (order), keine Pfeil- und Farbtasten; Markup/Kürzel bleiben vollständig.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRemote, REMOTE_KEYS } from '../src/js/live/ui/remote.js';

const css = readFileSync(resolve(process.cwd(), 'src/css/themes/live/fullscreen.css'), 'utf8');
const flatCss = readFileSync(resolve(process.cwd(), 'src/css/themes/live/tv-flat.css'), 'utf8');

const orders = {};
for (const m of css.matchAll(/\.lfx-live-app\.is-fullscreen \.lfx-live-remote__btn\[data-key="([^"]+)"\]\s*\{\s*order:\s*(\d+);/g)) orders[m[1]] = Number(m[2]);
const sorted = (pred) => Object.keys(orders).filter((k) => pred(orders[k])).sort((a, b) => orders[a] - orders[b]);

describe('Vollbild-Leiste', () => {
  it('Reihe 1: Power, Stumm, Vollbild, 1 2 … 9 0 TXT, i, V+, P+, V−, P−', () => {
    expect(sorted((o) => o < 50)).toEqual([
      'power', 'mute', 'fullscreen', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'txt', 'info', 'vol+', 'ch+', 'vol-', 'ch-',
    ]);
  });

  it('Reihe 2: EPG, Menü, OK, Zurück, Anfang, Ton, UT (nach dem Zeilenumbruch order 50)', () => {
    expect(sorted((o) => o > 50)).toEqual(['epg', 'menu', 'ok', 'back', 'restart', 'audio', 'subs']);
    expect(css).toMatch(/\.lfx-live-remote::after\s*\{[^}]*order:\s*50;[^}]*flex:\s*0 0 100%/);
  });

  it('Pfeil- und Farbtasten sind im Vollbild ausgeblendet, alle anderen Tasten sind sortiert', () => {
    expect(css).toMatch(/\.lfx-live-app\.is-fullscreen \.lfx-live-remote__btn\.is-arrow,\s*\.lfx-live-app\.is-fullscreen \.lfx-live-remote__btn\.is-color\s*\{\s*display:\s*none;/);
    const sortedKeys = new Set(Object.keys(orders));
    const hidden = new Set(['up', 'down', 'left', 'right', 'red', 'green', 'yellow', 'blue']);
    for (const k of REMOTE_KEYS) expect(sortedKeys.has(k) || hidden.has(k), k).toBe(true);
    for (const k of hidden) expect(sortedKeys.has(k), k).toBe(false);
  });

  it('Markup unverändert: Pfeile/Farben tragen is-arrow/is-color (CSS-Haken), Gruppen lösen sich per display:contents', () => {
    const r = createRemote({ onKey() {} });
    for (const k of ['up', 'down', 'left', 'right']) expect(r.el.querySelector(`[data-key="${k}"]`).classList.contains('is-arrow'), k).toBe(true);
    for (const k of ['red', 'green', 'yellow', 'blue']) expect(r.el.querySelector(`[data-key="${k}"]`).classList.contains('is-color'), k).toBe(true);
    expect(r.el.querySelectorAll('button').length).toBe(REMOTE_KEYS.length);
    expect(css).toMatch(/\.lfx-live-app\.is-fullscreen \.lfx-live-remote__group\s*\{\s*display:\s*contents;/);
  });

  it('flat: Rot kommt aus dem Token --lfx-red, TV-Breite nutzt die Fenstergröße (kein fester Pixelwert)', () => {
    expect(flatCss).toMatch(/--lfx-live-osd-accent:\s*var\(--lfx-red, #e50914\)/);
    expect(flatCss).toMatch(/--lfx-live-tv-w:\s*min\(calc\(100vw/);
  });
});
