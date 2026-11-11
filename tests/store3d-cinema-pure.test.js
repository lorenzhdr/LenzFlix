// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { averageColor, smoothColor } from '../src/js/store3d/cinema/ambient.js';
import { wrapLines } from '../src/js/store3d/cinema/subtitles.js';
import { screenGeometry, fitScreen, PolledVideoTexture } from '../src/js/store3d/cinema/screen.js';
import { controlsSpec, trackSpec, fmtTime } from '../src/js/store3d/cinema/controls.js';

describe('cinema/ambient', () => {
  it('averageColor mittelt RGB auf 0..1', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const c = averageColor({ data });
    expect(c.r).toBeCloseTo(0.5, 5);
    expect(c.g).toBeCloseTo(0.5, 5);
    expect(c.b).toBe(0);
    expect(averageColor(null)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('smoothColor: ohne prev sofort, sonst exponentiell Richtung next', () => {
    expect(smoothColor(null, { r: 1, g: 0, b: 0 }, 0.1)).toEqual({ r: 1, g: 0, b: 0 });
    const a = smoothColor({ r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 }, 0.1, 0.5);
    expect(a.r).toBeGreaterThan(0);
    expect(a.r).toBeLessThan(1);
    const b = smoothColor({ r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 }, 10, 0.5);
    expect(b.r).toBeGreaterThan(0.99);
    expect(smoothColor({ r: 0.3, g: 0.3, b: 0.3 }, { r: 1, g: 1, b: 1 }, 0)).toEqual({ r: 0.3, g: 0.3, b: 0.3 });
  });
});

describe('cinema/subtitles wrapLines', () => {
  const m = (s) => s.length * 10;
  it('bricht an Wortgrenzen um und behält Zeilenumbrüche', () => {
    expect(wrapLines('eins zwei drei', 100, m)).toEqual(['eins zwei', 'drei']);
    expect(wrapLines('a\nb', 1000, m)).toEqual(['a', 'b']);
    expect(wrapLines('', 100, m)).toEqual([]);
  });
  it('höchstens 3 Zeilen, letzte mit Ellipse', () => {
    const r = wrapLines('aaaa bbbb cccc dddd eeee', 45, m, 3);
    expect(r.length).toBe(3);
    expect(r[2].endsWith('…')).toBe(true);
  });
});

describe('cinema/screen', () => {
  it('screenGeometry: Bogenlänge, Wölbung zum Publikum, UV 0..1', () => {
    const g = screenGeometry({ radius: 14, width: 14, aspect: 16 / 9 });
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    let minX = 1e9; let maxX = -1e9; let minY = 1e9; let maxY = -1e9; let minZ = 1e9; let maxZ = -1e9;
    for (let i = 0; i < p.count; i++) {
      minX = Math.min(minX, p.getX(i)); maxX = Math.max(maxX, p.getX(i));
      minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i));
      minZ = Math.min(minZ, p.getZ(i)); maxZ = Math.max(maxZ, p.getZ(i));
    }
    const chord = 2 * 14 * Math.sin(0.5);
    expect(maxX - minX).toBeCloseTo(chord, 4);
    expect(maxY - minY).toBeCloseTo(14 / (16 / 9), 4);
    expect(minZ).toBeCloseTo(0, 6);
    expect(maxZ).toBeCloseTo(14 * (1 - Math.cos(0.5)), 4);
    expect(g.userData.arc).toBeCloseTo(1, 6);
    let umin = 1; let umax = 0; let vmin = 1; let vmax = 0;
    for (let i = 0; i < uv.count; i++) { umin = Math.min(umin, uv.getX(i)); umax = Math.max(umax, uv.getX(i)); vmin = Math.min(vmin, uv.getY(i)); vmax = Math.max(vmax, uv.getY(i)); }
    expect([umin, umax, vmin, vmax]).toEqual([0, 1, 0, 1]);
    const n = g.attributes.normal;
    let best = 0;
    for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i)) < Math.abs(p.getX(best))) best = i;
    expect(n.getZ(best)).toBeGreaterThan(0.99);
  });

  it('fitScreen: breit begrenzt auf 16 m, Höhe auf 9 m', () => {
    expect(fitScreen(16 / 9).width).toBe(16);
    const sq = fitScreen(4 / 3);
    expect(sq.height).toBeLessThanOrEqual(9.0001);
    expect(sq.width).toBeLessThan(16);
    expect(fitScreen(NaN).aspect).toBeCloseTo(16 / 9, 6);
  });

  it('PolledVideoTexture lädt nur bei readyState>=2 und Änderung bzw. Laufen hoch', () => {
    const v = { readyState: 1, currentTime: 0, paused: false, ended: false };
    const t = new PolledVideoTexture(v);
    expect(t.update(0)).toBe(false);
    v.readyState = 4;
    expect(t.update(100)).toBe(true);
    expect(t.uploads).toBe(1);
    expect(t.update(105)).toBe(false);
    v.currentTime = 0.04;
    expect(t.update(140)).toBe(true);
    expect(t.update(150)).toBe(false);
    expect(t.update(190)).toBe(true);
    v.paused = true;
    expect(t.update(400)).toBe(false);
    v.currentTime = 5;
    expect(t.update(500)).toBe(true);
    expect(t.uploads).toBe(4);
    t.dispose();
  });
});

describe('cinema/controls Spec', () => {
  const h = new Proxy({ seat: 'mid' }, { get: (o, k) => (k in o ? o[k] : () => {}) });
  const labels = (s) => s.buttons.map((b) => b.label);
  const base = { title: 'Film', phase: 'playing', time: 65, duration: 3600, volume: 0.5 };

  it('fmtTime', () => {
    expect(fmtTime(65)).toBe('01:05');
    expect(fmtTime(3725)).toBe('1:02:05');
    expect(fmtTime(NaN)).toBe('00:00');
  });

  it('Standardknöpfe, Fortschritt und Platz-Markierung', () => {
    const s = controlsSpec(base, h);
    expect(s.anchor).toBe('low');
    expect(s.title).toBe('Film');
    expect(s.progress.label).toBe('01:05 / 1:00:00');
    expect(typeof s.progress.onSeek).toBe('function');
    expect(labels(s)).toEqual(expect.arrayContaining(['Pause', '−10 s', '+30 s', 'Tonspur', 'Untertitel', 'Leiser', 'Lauter', 'Platz vorn', 'Platz Mitte', 'Platz hinten', 'Zurück in die Videothek']));
    expect(s.buttons.find((b) => b.label === 'Platz Mitte').on).toBe(true);
    expect(s.buttons.find((b) => b.label === 'Platz vorn').on).toBe(false);
    expect(labels(s)).not.toContain('◀ Folge');
    expect(labels(s)).not.toContain('Folge ▶');
    expect(labels(controlsSpec({ ...base, phase: 'paused' }, h))).toContain('Weiter');
  });

  it('Folge-Knöpfe nur bei hasPrev/hasNext, Up-Next mit Leiste', () => {
    const s = controlsSpec({ ...base, hasPrev: true, hasNext: true }, h);
    expect(labels(s)).toEqual(expect.arrayContaining(['◀ Folge', 'Folge ▶']));
    const u = controlsSpec({ ...base, upNext: { text: 'x', seconds: 12 } }, h);
    expect(u.text).toBe('Nächste Folge in 12 s');
    expect(labels(u).slice(0, 2)).toEqual(['Jetzt starten', 'Verbergen']);
    expect(controlsSpec(base, h).text).toBeUndefined();
  });

  it('ohne Dauer kein Seek; Knöpfe rufen die Handler', () => {
    const calls = [];
    const hh = { seat: 'front', onSeekBy: (d) => calls.push(['by', d]), onVolume: (d) => calls.push(['vol', d]), onSeat: (n) => calls.push(['seat', n]), onUpNext: (a) => calls.push(['up', a]) };
    const s = controlsSpec({ phase: 'playing', time: 0, duration: 0, upNext: { seconds: 5 } }, hh);
    expect(s.progress.onSeek).toBeUndefined();
    for (const l of ['−10 s', '+30 s', 'Leiser', 'Platz hinten', 'Jetzt starten', 'Verbergen']) s.buttons.find((b) => b.label === l).onSelect();
    expect(calls).toEqual([['by', -10], ['by', 30], ['vol', -0.1], ['seat', 'back'], ['up', 'start'], ['up', 'hide']]);
  });

  it('Lautstärke-Zeile: Prozent, max., stumm', () => {
    expect(controlsSpec({ ...base, volume: 0.5 }, h).lines[0]).toBe('Lautstärke 50 %');
    expect(controlsSpec({ ...base, volume: 1 }, h).lines[0]).toBe('Lautstärke 100 % (max.)');
    expect(controlsSpec({ ...base, muted: true }, h).lines[0]).toBe('Lautstärke stumm');
  });

  it('trackSpec: Laden, Liste, Wechsel', () => {
    const opts = { onPick() {}, onBack() {} };
    expect(trackSpec('audio', null, opts).text).toBe('Lade …');
    const s = trackSpec('subtitle', [{ id: '-1', label: 'Aus', selected: true }, { id: '3', label: 'Deutsch', selected: false }], opts);
    expect(s.title).toBe('Untertitel');
    expect(s.list.rows.length).toBe(2);
    expect(s.list.rows[0].selected).toBe(true);
    const b = trackSpec('audio', [{ id: '1', label: 'x' }], { ...opts, busy: true });
    expect(b.list).toBeUndefined();
    expect(b.text).toMatch(/Wechsel/);
  });
});
