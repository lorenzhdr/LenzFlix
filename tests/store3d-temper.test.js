import { describe, it, expect } from 'vitest';
import { temperOf, reactToProvocation, chaseStep, bystanderJoin, TEMPERS } from '../src/js/store3d/npc/temper-logic.js';

describe('npc/temper-logic', () => {
  it('deterministisch, nur bekannte Werte, Verteilung grob 35/45/20', () => {
    expect(temperOf(7)).toBe(temperOf(7));
    const c = { shy: 0, normal: 0, hot: 0 };
    for (let i = 0; i < 2000; i++) { const t = temperOf(i); expect(TEMPERS).toContain(t); c[t]++; }
    expect(c.shy / 2000).toBeGreaterThan(0.29); expect(c.shy / 2000).toBeLessThan(0.41);
    expect(c.normal / 2000).toBeGreaterThan(0.39); expect(c.normal / 2000).toBeLessThan(0.51);
    expect(c.hot / 2000).toBeGreaterThan(0.14); expect(c.hot / 2000).toBeLessThan(0.26);
  });
  it('shy flieht, normal schimpft', () => {
    expect(reactToProvocation({ temper: 'shy' }, 'hit', 0).action).toBe('flee');
    expect(reactToProvocation({ temper: 'normal' }, 'hit', 0).action).toBe('scold');
  });
  it('hot: droht bei Anpöbeln, schlägt bei Treffer zurück, Verfolgung höchstens 8 s', () => {
    const s = { temper: 'hot' };
    expect(reactToProvocation(s, 'insult', 0).action).toBe('threat');
    expect(reactToProvocation(s, 'hit', 1)).toMatchObject({ action: 'attack', until: 9 });
    expect(chaseStep(s, 8.9)).toBe('chase');
    expect(chaseStep(s, 9)).toBe('done');
    expect(reactToProvocation({ temper: 'hot' }, 'hit', 0).action).toBe('attack');
  });
  it('Umstehende: höchstens 3 Angreifer, nur hitzköpfige', () => {
    expect(bystanderJoin(2, 'hot')).toBe(true);
    expect(bystanderJoin(3, 'hot')).toBe(false);
    expect(bystanderJoin(0, 'shy')).toBe(false);
  });
});
