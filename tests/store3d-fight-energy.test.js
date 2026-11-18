import { describe, it, expect } from 'vitest';
import { createEnergy } from '../src/js/store3d/fight/energy.js';

describe('fight/energy', () => {
  it('Treffer senken, Regeneration erst nach 6 s mit 3,3/s', () => {
    const en = createEnergy();
    expect(en.hit(20, 10)).toMatchObject({ ko: false, ignored: false });
    expect(en.value(15)).toBe(80);
    expect(en.value(16)).toBe(80);
    expect(en.value(14 + 2)).toBe(80);
    expect(en.value(18)).toBeCloseTo(80 + 2 * 3.3, 5);
    expect(en.value(100)).toBe(100);
  });
  it('neuer Treffer verschiebt die Verzögerung', () => {
    const en = createEnergy();
    en.hit(30, 0);
    en.hit(10, 5);
    expect(en.value(10)).toBe(60);
    expect(en.value(12)).toBeCloseTo(60 + 3.3, 5);
  });
  it('K.O. bei 0, danach Treffer ignoriert, Aufwachen = voll + 10 s Schutz', () => {
    const en = createEnergy();
    expect(en.hit(100, 1).ko).toBe(true);
    expect(en.isKO()).toBe(true);
    expect(en.hit(5, 2).ignored).toBe(true);
    en.wake(20);
    expect(en.value(20)).toBe(100);
    expect(en.hit(10, 25).ignored).toBe(true);
    expect(en.hit(10, 30.5).ignored).toBe(false);
  });
  it('Menü schützt erst 3 s nach dem Öffnen, danach 2 s Nachlauf', () => {
    const en = createEnergy();
    en.setMenu(true, 0);
    expect(en.protected(1)).toBe(false);
    expect(en.protected(3)).toBe(true);
    expect(en.hit(10, 4).ignored).toBe(true);
    en.setMenu(false, 10);
    expect(en.protected(11.9)).toBe(true);
    expect(en.protected(12.1)).toBe(false);
  });
  it('Menü im Nachlauf wieder geöffnet: Schutz nahtlos; kurz geöffnet: kein Nachlauf', () => {
    const en = createEnergy();
    en.setMenu(true, 0); en.setMenu(false, 5);
    en.setMenu(true, 6);
    expect(en.protected(6.1)).toBe(true);
    const e2 = createEnergy();
    e2.setMenu(true, 0); e2.setMenu(false, 1);
    expect(e2.protected(1.5)).toBe(false);
  });
});
