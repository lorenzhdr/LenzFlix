/* global process */
// Overlays der VIDEOTHEK (Pause, Stimmenwahl, Kassen-Modals, Programmtafel) beginnen unterhalb der oberen Leiste.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = (f) => readFileSync(resolve(process.cwd(), 'src/css/themes/store', f), 'utf8');
const P = 'html.lfx-js.lfx-theme-store:not(.layout-tv)';
const rule = (src, sel) => {
  const i = src.indexOf(`${sel} {`);
  if (i < 0) return '';
  return src.slice(i, src.indexOf('}', i));
};
const BAR = /padding(-top)?:[^;]*var\(--lfx-store-hud-h[^;]*var\(--lfx-store-safe-top/;

describe('Overlays unterhalb der Leiste', () => {
  const scene = css('scene.css');
  const palast = css('palast.css');
  it('Pause-Menue und Stimmenwahl halten Abstand zur Leiste', () => {
    expect(rule(scene, `${P} .lfx-store-pause`)).toMatch(BAR);
    expect(rule(scene, `${P} .lfx-store-voicepick`)).toMatch(BAR);
  });
  it('Panels fuellen hoechstens die restliche Hoehe', () => {
    expect(rule(scene, `${P} .lfx-store-pause-panel`)).toMatch(/max-height:\s*100%/);
    expect(rule(scene, `${P} .lfx-store-voicepick-panel`)).toMatch(/max-height:\s*100%/);
  });
  it('Kassen-Modals (m3) und Programmtafel halten Abstand zur Leiste', () => {
    expect(rule(scene, `${P} .lfx-store-stage .lfx-store-m3`)).toMatch(BAR);
    expect(rule(palast, `${P} .lfx-store-m3.lfx-store-palast-pick`)).toMatch(BAR);
  });
});
