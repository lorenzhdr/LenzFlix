import { describe, it, expect } from 'vitest';
import { createFakeWorld } from './helpers/mp-fake.js';

function frames(w, claims, log) {
  return w.connect(claims, { onMessage: (d) => { try { const j = JSON.parse(d); (Array.isArray(j) ? j : [j]).forEach((m) => { log.push(m); (m.ev || []).forEach((e) => log.push(e)); }); } catch { /* egal */ } } });
}
const CL = { k: 'abcdef012345', n: 'Du', a: 0, e: 9e15, j: 'x1' };
const hi = (cap) => JSON.stringify([{ t: 'hi', pv: 1, cap, f: 0, cv: 't' }]);

describe('Mehrspieler-Harness: Raufen', () => {
  it('Bots melden die Fähigkeit fight, noFight entfernt sie', () => {
    for (const noFight of [false, true]) {
      const w = createFakeWorld({ virtual: true, bots: 2, noFight, botSocial: false });
      w.advance(1000);
      const caps = Object.values(w.state.peers).map((p) => p.cap.includes('fight'));
      expect(caps.length).toBe(2);
      expect(caps.every((x) => x === !noFight)).toBe(true);
      w.dispose();
    }
  });
  it('noFight strippt fight auch aus dem hi eines Clients', () => {
    const w = createFakeWorld({ virtual: true, noFight: true });
    const log = [];
    const c = frames(w, CL, log);
    c.send(hi(['pres', 'fight']));
    w.advance(500);
    expect(log.find((m) => m.t === 'wl').cap).not.toContain('fight');
    w.dispose();
  });
  it('Bandenführer-Bot erhält die Führung und schickt gs', () => {
    const w = createFakeWorld({ virtual: true, bots: 1, botGang: 0, botSocial: false });
    const log = [];
    const c = frames(w, CL, log);
    c.send(hi(['pres', 'fight']));
    w.advance(4000);
    expect(log.some((m) => (m.t === 'ga' && m.c > 0) || (m.t === 'wl' && m.gl > 0))).toBe(true);
    expect(log.some((m) => m.t === 'gs')).toBe(true);
    w.dispose();
  });
  it('Debug-API: weapon, laser, hit liefern true und Laser erreicht Peers mit fight', () => {
    const w = createFakeWorld({ virtual: true, bots: 1, botSocial: false });
    const log = [];
    const c = frames(w, CL, log);
    c.send(hi(['pres', 'fight']));
    w.advance(1000);
    expect(w.bots.weapon(0, 2)).toBe(true);
    expect(w.bots.laser(0, true, 100, 150, 100)).toBe(true);
    expect(w.bots.hit(0, 9999)).toBe(true);
    w.advance(1000);
    expect(log.some((m) => m.t === 'lz')).toBe(true);
    w.dispose();
  });
});
