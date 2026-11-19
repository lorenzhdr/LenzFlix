// @vitest-environment jsdom
// VIDEOTHEK LENZ: QA-Fixes UI (Q5#1 getragene Hülle sichtbar nach Halte-Bild, Q5#6 Hilfe nennt M, Q6#3 Touch-Hinweise, Q4#6 Wandplatte).
import { describe, it, expect } from 'vitest';
import { PerspectiveCamera } from 'three';
import { createHands } from '../src/js/store3d/ui/hands.js';
import { DESKTOP_HELP, touchHint } from '../src/js/store3d/ui/hud.js';
import { readFileSync } from 'node:fs';

const effVisible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

describe('Hände: getragene Hülle', () => {
  it('Q5#1: Mitnehmen bei ausgeblendeten Händen (Halte-Bild), danach setVisible(true) zeigt die Hülle', () => {
    const cam = new PerspectiveCamera();
    const h = createHands(cam);
    h.setVisible(false); // Modus hold
    h.setCarried({ media: 'dvd', art: null });
    h.setVisible(true); // zurück im Spielmodus
    const carry = h.group.children.find((c) => c.children.length === 1);
    expect(effVisible(carry)).toBe(true);
    h.setCarried(null);
    expect(carry.visible).toBe(false);
    h.dispose();
  });
});

describe('Hilfetexte', () => {
  it('Q5#6: Tastenhilfe nennt M', () => { expect(DESKTOP_HELP).toMatch(/M\smitnehmen/); });
  it('Q6#3: touchHint entfernt „E / Klick:“', () => {
    expect(touchHint('E / Klick: Probieren')).toBe('Probieren');
    expect(touchHint('Top-Tipp · E / Klick: Hülle holen')).toBe('Top-Tipp · Hülle holen');
    expect(touchHint('Benutzen')).toBe('Benutzen');
  });
});

describe('Wandplatte', () => {
  it('Q4#6: Interaktionsbox reicht über die Augenhöhe (1,65)', () => {
    const src = readFileSync('src/js/store3d/modules/discover.js', 'utf8');
    const m = /min: \{ x: px - 0\.5, y: 0\.7, z: 0 \}, max: \{ x: px \+ 0\.5, y: ([\d.]+)/.exec(src);
    expect(m && Number(m[1])).toBeGreaterThan(1.7);
  });
});
