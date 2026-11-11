// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createKnobs } from '../src/js/live/ui/knobs.js';

// Knopf A (Sender) bei (50,50), Radius 40; Knopf B (Lautstärke) bei (50,150)
function rect(cx, cy) {
  return () => ({ left: cx - 40, top: cy - 40, width: 80, height: 80, right: cx + 40, bottom: cy + 40, x: cx - 40, y: cy - 40 });
}
function make(state = {}) {
  const tv = document.createElement('div');
  tv.innerHTML = '<span class="lfx-live-tv__knob lfx-live-tv__knob--a"></span><span class="lfx-live-tv__knob lfx-live-tv__knob--b"></span>';
  document.body.append(tv);
  const a = tv.querySelector('.lfx-live-tv__knob--a');
  const b = tv.querySelector('.lfx-live-tv__knob--b');
  a.getBoundingClientRect = rect(50, 50);
  b.getBoundingClientRect = rect(50, 150);
  const st = { active: true, channel: 1, count: 18, volume: 50, ...state };
  const calls = { ch: [], vol: [], snd: [], prev: [] };
  const knobs = createKnobs({
    tv,
    getState: () => st,
    onChannel: (n) => { calls.ch.push(n); st.channel = n; knobs.setChannel(n); },
    onVolume: (v) => { calls.vol.push(v); st.volume = v; },
    onSound: (k) => calls.snd.push(k),
    onPreview: (n) => calls.prev.push(n),
    win: window,
  });
  const ang = (el, name) => parseFloat(el.style.getPropertyValue(name));
  return { tv, a, b, st, calls, knobs, ang };
}
const ev = (type, target, x, y, extra = {}) => target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, ...extra }));
const onCircle = (cx, cy, deg, r = 30) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
const wheel = (el, deltaY) => {
  const w = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
  el.dispatchEvent(w);
  return w;
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('Drehknöpfe: Winkel', () => {
  it('Startwinkel: Sender 1 = 0°, Lautstärke 50 % = 0°; Tooltips', () => {
    const { a, b, ang } = make();
    expect(ang(a, '--lfx-live-knob-a')).toBe(0);
    expect(ang(b, '--lfx-live-knob-b')).toBe(0);
    expect(a.title).toBe('Sender wählen');
    expect(b.title).toBe('Lautstärke');
  });

  it('setChannel dreht den kürzesten Weg, endlos 18 → 1', () => {
    const { a, knobs, ang } = make();
    knobs.setChannel(4);
    expect(ang(a, '--lfx-live-knob-a')).toBe(60);
    knobs.setChannel(18);
    expect(ang(a, '--lfx-live-knob-a')).toBe(-20);
    knobs.setChannel(1);
    expect(ang(a, '--lfx-live-knob-a')).toBe(0);
    knobs.setChannel(17); knobs.setChannel(18); knobs.setChannel(1); knobs.setChannel(2);
    expect(ang(a, '--lfx-live-knob-a')).toBe(20);
  });

  it('setVolume: 0 % = −135°, 100 % = +135°', () => {
    const { b, knobs, ang } = make();
    knobs.setVolume(0);
    expect(ang(b, '--lfx-live-knob-b')).toBe(-135);
    knobs.setVolume(100);
    expect(ang(b, '--lfx-live-knob-b')).toBe(135);
    knobs.setVolume(75);
    expect(ang(b, '--lfx-live-knob-b')).toBe(67.5);
  });
});

describe('Drehknöpfe: Senderknopf', () => {
  it('Ziehen über 3 Stufen wechselt erst beim Loslassen auf +3', () => {
    const { a, calls } = make();
    const [x0, y0] = onCircle(50, 50, -90);
    ev('pointerdown', a, x0, y0);
    for (const d of [-80, -70, -60, -50, -40, -30]) { const [x, y] = onCircle(50, 50, d); ev('pointermove', window, x, y); }
    expect(calls.ch).toEqual([]);
    expect(calls.prev).toEqual([2, 3, 4]);
    const [x1, y1] = onCircle(50, 50, -30);
    ev('pointerup', window, x1, y1);
    expect(calls.ch).toEqual([4]);
  });

  it('wechselt 400 ms nach der letzten Stufe auch bei gehaltenem Zug', () => {
    const { a, calls } = make();
    const [x0, y0] = onCircle(50, 50, -90);
    ev('pointerdown', a, x0, y0);
    for (const d of [-80, -70]) { const [x, y] = onCircle(50, 50, d); ev('pointermove', window, x, y); }
    expect(calls.ch).toEqual([]);
    vi.advanceTimersByTime(399);
    expect(calls.ch).toEqual([]);
    vi.advanceTimersByTime(2);
    expect(calls.ch).toEqual([2]);
  });

  it('endlos: Ziehen links herum von Sender 1 landet auf 18', () => {
    const { a, calls } = make();
    const [x0, y0] = onCircle(50, 50, 0);
    ev('pointerdown', a, x0, y0);
    for (const d of [-10, -20]) { const [x, y] = onCircle(50, 50, d); ev('pointermove', window, x, y); }
    const [x, y] = onCircle(50, 50, -20);
    ev('pointerup', window, x, y);
    expect(calls.ch).toEqual([18]);
  });

  it('Klick rechts +1, Klick links −1', () => {
    const { a, calls } = make();
    ev('pointerdown', a, 80, 50);
    ev('pointerup', window, 80, 50);
    expect(calls.ch).toEqual([2]);
    ev('pointerdown', a, 20, 50);
    ev('pointerup', window, 20, 50);
    expect(calls.ch).toEqual([2, 1]);
  });

  it('ein Zug über der Klickschwelle löst keinen zusätzlichen Klick-Wechsel aus', () => {
    const { a, calls } = make();
    ev('pointerdown', a, 80, 50);
    ev('pointermove', window, 80, 52);
    ev('pointerup', window, 80, 52);
    expect(calls.ch).toEqual([2]); // unter 4 px: noch ein Klick
    calls.ch.length = 0;
    ev('pointerdown', a, 80, 50);
    ev('pointermove', window, 80, 60);
    ev('pointermove', window, 80, 62);
    ev('pointerup', window, 80, 62);
    expect(calls.ch.length).toBeLessThanOrEqual(1);
    expect(calls.snd.filter((s) => s === 'detent').length).toBeGreaterThan(0);
  });

  it('Mausrad: nach oben +1 Stufe, Wechsel 400 ms später; preventDefault', () => {
    const { a, calls } = make();
    expect(wheel(a, -100).defaultPrevented).toBe(true);
    wheel(a, -100);
    expect(calls.ch).toEqual([]);
    vi.advanceTimersByTime(401);
    expect(calls.ch).toEqual([3]);
    wheel(a, 100);
    vi.advanceTimersByTime(401);
    expect(calls.ch).toEqual([3, 2]);
  });

  it('spielt pro Stufe einen Rastklick', () => {
    const { a, calls } = make();
    ev('pointerdown', a, 80, 50);
    ev('pointerup', window, 80, 50);
    expect(calls.snd).toEqual(['detent']);
  });
});

describe('Drehknöpfe: Lautstärkeknopf', () => {
  it('Klick rechts/links in 5-%-Stufen', () => {
    const { b, calls, ang } = make();
    ev('pointerdown', b, 80, 150);
    ev('pointerup', window, 80, 150);
    expect(calls.vol).toEqual([55]);
    expect(ang(b, '--lfx-live-knob-b')).toBeCloseTo(13.5, 5);
    ev('pointerdown', b, 20, 150);
    ev('pointerup', window, 20, 150);
    expect(calls.vol).toEqual([55, 50]);
  });

  it('Ziehen ändert live und stoppt am Anschlag', () => {
    const { b, calls, ang } = make({ volume: 90 });
    const [x0, y0] = onCircle(50, 150, -90);
    ev('pointerdown', b, x0, y0);
    for (let d = -80; d <= 60; d += 10) { const [x, y] = onCircle(50, 150, d); ev('pointermove', window, x, y); }
    expect(calls.vol[0]).toBeGreaterThanOrEqual(90);
    expect(calls.vol[calls.vol.length - 1]).toBe(100);
    expect(ang(b, '--lfx-live-knob-b')).toBe(135);
    ev('pointerup', window, 0, 0);
  });

  it('Rad: 5 % je Stufe, am Anschlag nichts', () => {
    const { b, calls } = make({ volume: 100 });
    wheel(b, -100);
    expect(calls.vol).toEqual([]);
    wheel(b, 100);
    expect(calls.vol).toEqual([95]);
  });
});

describe('Drehknöpfe: Aktivierung und Aufräumen', () => {
  it('ohne aktiven Stil keine Wirkung und kein preventDefault', () => {
    const { a, b, calls } = make({ active: false });
    ev('pointerdown', a, 80, 50);
    ev('pointerup', window, 80, 50);
    expect(wheel(b, -100).defaultPrevented).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(calls.ch).toEqual([]);
    expect(calls.vol).toEqual([]);
  });

  it('Mitdrehen von außen ruht während des Ziehens', () => {
    const { a, knobs, ang } = make();
    const [x0, y0] = onCircle(50, 50, -90);
    ev('pointerdown', a, x0, y0);
    for (const d of [-80, -70]) { const [x, y] = onCircle(50, 50, d); ev('pointermove', window, x, y); }
    const mid = ang(a, '--lfx-live-knob-a');
    knobs.setChannel(10);
    expect(ang(a, '--lfx-live-knob-a')).toBe(mid);
  });

  it('dispose entfernt Listener und Timer', () => {
    const { a, knobs, calls } = make();
    ev('pointerdown', a, 80, 50);
    knobs.dispose();
    ev('pointerup', window, 80, 50);
    wheel(a, -100);
    vi.advanceTimersByTime(1000);
    expect(calls.ch).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
