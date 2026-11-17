// Zeitabgleich (net/clock.js): Probe mit kleinster RTT aus den letzten 8, serverNow, Seed, Altersgrenze.
import { describe, it, expect } from 'vitest';
import { createClock } from '../src/js/store3d/net/clock.js';

function make(start = 1000000) {
  const t = { v: start };
  const c = createClock({ now: () => t.v });
  return { t, c };
}

describe('createClock', () => {
  it('ohne Probe null', () => {
    const { c } = make();
    expect(c.serverNow()).toBe(null);
    expect(c.offset()).toBe(null);
    expect(c.rtt()).toBe(null);
    expect(c.toLocal(5)).toBe(null);
  });
  it('Seed liefert eine grobe Zeit, bis eine echte Probe vorliegt', () => {
    const { c, t } = make(1000);
    c.seed(51000);
    expect(c.serverNow()).toBe(51000);
    t.v += 500;
    expect(c.serverNow()).toBe(51500);
    expect(c.sample(1000, 51200)).toBe(500); // rtt 500, Server war bei 51200 -> Offset 51200 + 250 - 1500 = 49950
    expect(c.offset()).toBe(49950);
  });
  it('Offset aus der Probe: serverMs + rtt/2 - jetzt', () => {
    const { c, t } = make(10000);
    t.v = 10100; // 100 ms RTT
    expect(c.sample(10000, 90050)).toBe(100);
    expect(c.offset()).toBe(90050 + 50 - 10100);
    t.v += 1000;
    expect(c.serverNow()).toBe(10100 + 1000 + (90050 + 50 - 10100));
  });
  it('nimmt die kleinste RTT aus den letzten 8', () => {
    const { c, t } = make(0);
    // Probe 1: rtt 400, Offset 1000; Probe 2: rtt 40, Offset 2000 (gewinnt); Probe 3: rtt 300, Offset 3000
    t.v = 400; c.sample(0, 1000 + 400 - 200);
    expect(c.offset()).toBe(1000);
    t.v = 1040; c.sample(1000, 2000 + 1040 - 20);
    expect(c.offset()).toBe(2000);
    expect(c.rtt()).toBe(40);
    t.v = 2300; c.sample(2000, 3000 + 2300 - 150);
    expect(c.offset()).toBe(2000);
    expect(c.probeCount()).toBe(3);
  });
  it('behält nur 8 Proben: die beste fällt irgendwann heraus', () => {
    const { c, t } = make(0);
    t.v = 10; c.sample(0, 500 + 10 - 5); // rtt 10, Offset 500
    for (let i = 0; i < 8; i++) { const a = t.v; t.v += 200; c.sample(a, 9000 + t.v - 100); } // rtt 200, Offset 9000
    expect(c.probeCount()).toBe(8);
    expect(c.rtt()).toBe(200);
    expect(c.offset()).toBe(9000);
  });
  it('verwirft Proben älter als 15 min', () => {
    const { c, t } = make(0);
    t.v = 10; c.sample(0, 500 + 10 - 5);
    t.v = 16 * 60 * 1000; const a = t.v - 300; c.sample(a, 7000 + t.v - 150);
    expect(c.probeCount()).toBe(1);
    expect(c.offset()).toBe(7000);
  });
  it('ungültige Proben', () => {
    const { c, t } = make(1000);
    expect(c.sample(NaN, 5)).toBe(null);
    expect(c.sample(1000, Infinity)).toBe(null);
    expect(c.sample(2000, 5)).toBe(null); // negative RTT
    t.v = 200000;
    expect(c.sample(1000, 5)).toBe(null); // über 60 s
    expect(c.probeCount()).toBe(0);
  });
  it('toLocal und reset', () => {
    const { c, t } = make(100);
    t.v = 200;
    c.sample(100, 1050);
    expect(c.toLocal(c.serverNow())).toBe(200);
    c.reset();
    expect(c.serverNow()).toBe(null);
  });
});
