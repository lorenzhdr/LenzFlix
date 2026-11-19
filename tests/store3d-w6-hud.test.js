// @vitest-environment jsdom
// 1.19.0 W6-Fix HUD: „N hier“-Pille (Solo/aus), Waffenlage je Bildformat, Tastenhilfe ohne Umbruch zwischen Taste und Aktion, CSS-Regeln
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createHud } from '../src/js/store3d/net/hud.js';
import { weaponPos } from '../src/js/store3d/ui/hands.js';
import { DESKTOP_HELP } from '../src/js/store3d/ui/hud.js';

const mkHost = () => { const h = document.createElement('div'); document.body.appendChild(h); const cv = document.createElement('canvas'); h.appendChild(cv); return { host: h, ctx: { isTouch: true, renderer: { domElement: cv } } }; };

describe('W6 net/hud.js Pille', () => {
  it('Solo: nur Knöpfe, Label leer und versteckt', () => {
    const { ctx, host } = mkHost();
    const hud = createHud(ctx, {});
    hud.set('', { emote: true, solo: true });
    const c = host.querySelector('.lfx-mp-count');
    expect(c.hidden).toBe(true);
    expect(c.textContent).toBe('');
    hud.dispose();
  });
  it('mit Text sichtbar, nach Ausblenden kein veralteter Text', () => {
    const { ctx, host } = mkHost();
    const hud = createHud(ctx, {});
    hud.set('4 hier', { chat: true });
    const c = host.querySelector('.lfx-mp-count');
    expect(c.hidden).toBe(false);
    expect(c.textContent).toBe('4 hier');
    hud.set(null);
    hud.set('', { solo: true, emote: true });
    expect(c.textContent).toBe('');
    expect(c.hidden).toBe(true);
    hud.dispose();
  });
});

describe('W6 Waffenlage', () => {
  it('Desktop 16:9 bleibt unverändert', () => {
    expect(weaponPos(70, 16 / 9, false)).toEqual([0.27, -0.27, -0.44]);
  });
  it('hochkant bleibt im Bild (x + halbe Waffenbreite < halbe Bildbreite)', () => {
    const [x, , z] = weaponPos(100, 0.461, true);
    const halfW = Math.tan((100 * Math.PI) / 360) * 0.461 * Math.abs(z);
    expect(x + 0.1).toBeLessThan(halfW);
    expect(x).toBeLessThan(0.27);
  });
  it('Touch quer weiter links als Desktop', () => {
    expect(weaponPos(70, 2.17, true)[0]).toBeLessThan(0.27);
  });
});

describe('W6 Tastenhilfe', () => {
  it('Taste und Aktion durch geschütztes Leerzeichen verbunden', () => {
    expect(DESKTOP_HELP).toContain('F\u00a0schlagen');
    expect(DESKTOP_HELP).toContain('Esc\u00a0Pause');
    expect(DESKTOP_HELP).not.toMatch(/\bF schlagen/);
  });
});

describe('W6 CSS-Regeln', () => {
  const net = fs.readFileSync('src/css/themes/store/net.css', 'utf8');
  it('Log über der offenen Eingabe, Pille neben dem Ansicht-Knopf, Log im Editor versteckt', () => {
    expect(net).toMatch(/\.lfx-mp-chatlog\.is-desk\.is-open \{\s*bottom: calc\(/);
    expect(net).toContain('+ 54px');
    expect(net).toContain(':has(.lfx-store-viewbtn[hidden]) > .lfx-mp-social.is-desk');
    expect(net).toMatch(/:has\(> \.lfx-store-char\) > \.lfx-mp-chatlog/);
  });
});
