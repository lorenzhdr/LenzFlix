import { describe, it, expect } from 'vitest';
import { createReactBudget, npcShould, OUTFIT_NEW, HAIR_NEW } from '../src/js/store3d/char/react-logic.js';

describe('react-logic', () => {
  it('Kategorien', () => {
    expect(OUTFIT_NEW).toBe('outfitNew');
    expect(HAIR_NEW).toBe('hairNew');
  });

  it('ohne Änderung nie', () => {
    const b = createReactBudget();
    expect(b.passerbyMay(1000, 'p1')).toBe(false);
    b.noteChange(0, '');
    expect(b.passerbyMay(1000, 'p1')).toBe(false);
  });

  it('Fenster 90 s, jeder Passant einmal, 6 s Abstand', () => {
    const b = createReactBudget();
    b.noteChange(1000, 'aaaa0000');
    expect(b.passerbyMay(2000, 'p1')).toBe(true);
    expect(b.passerbyMay(2000, '')).toBe(false);
    expect(b.passerbyMay(91000, 'p1')).toBe(true);
    expect(b.passerbyMay(91001, 'p1')).toBe(false);
    b.markSaid(2000, 'p1');
    expect(b.passerbyMay(3000, 'p1')).toBe(false);
    expect(b.passerbyMay(7999, 'p2')).toBe(false);
    expect(b.passerbyMay(8000, 'p2')).toBe(true);
  });

  it('höchstens 3 Passanten, danach 5 min Ruhe', () => {
    const b = createReactBudget();
    b.noteChange(0, 'h1');
    b.markSaid(1000, 'p1');
    b.markSaid(8000, 'p2');
    expect(b.passerbyMay(15000, 'p3')).toBe(true);
    b.markSaid(15000, 'p3');
    expect(b.passerbyMay(30000, 'p4')).toBe(false);
    // neue Änderung innerhalb der Ruhe: weiter still
    b.noteChange(40000, 'h2');
    expect(b.passerbyMay(50000, 'p4')).toBe(false);
    // nach der Ruhe und ohne neue Änderung im Fenster: nichts
    expect(b.passerbyMay(15000 + 300000 + 1, 'p4')).toBe(false);
    // frische Änderung nach der Ruhe: wieder erlaubt, auch für frühere Passanten
    b.noteChange(400000, 'h3');
    expect(b.passerbyMay(401000, 'p1')).toBe(true);
  });

  it('gleicher Hash setzt das Fenster nicht zurück', () => {
    const b = createReactBudget();
    b.noteChange(0, 'h1');
    b.noteChange(80000, 'h1');
    expect(b.passerbyMay(100000, 'p1')).toBe(false);
    b.noteChange(80000, 'h2');
    expect(b.passerbyMay(100000, 'p1')).toBe(true);
  });

  it('npcShould', () => {
    expect(npcShould(undefined, 'abc')).toBe(true);
    expect(npcShould('abc', 'abc')).toBe(false);
    expect(npcShould('abc', 'abd')).toBe(true);
    expect(npcShould('abc', '')).toBe(false);
    expect(npcShould('abc', undefined)).toBe(false);
  });
});
