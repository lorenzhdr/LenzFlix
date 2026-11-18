import { describe, it, expect } from 'vitest';
import { UNLOCKS, unlockedCodes, isUnlocked, unlockFor, lockHint } from '../src/js/store3d/char/unlocks.js';
import { UNLOCK_BASE, UNLOCK_HATS, UNLOCK_TOPS, UNLOCK_BOTTOMS, UNLOCK_SHOES, UNLOCK_GLASSES, UNLOCK_BAGS, UNLOCK_PENDING } from '../src/js/store3d/char/ids.js';
import { entryOf, CATALOG } from '../src/js/store3d/discover/catalog.js';

describe('unlocks', () => {
  it('15 Zuordnungen, Entdeckungen existieren, Codes eindeutig je Slot', () => {
    expect(UNLOCKS).toHaveLength(19);
    const seen = new Set();
    for (const u of UNLOCKS) {
      expect(entryOf(u.discover), u.discover).toBeTruthy();
      expect(u.code).toBeGreaterThanOrEqual(UNLOCK_BASE);
      expect(u.title.length).toBeGreaterThan(2);
      const k = u.slot + ':' + u.code;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
    expect(new Set(UNLOCKS.map((u) => u.discover)).size).toBe(19);
  });

  it('jedes Freischalt-Teil aus ids.js ist genau einmal vergeben', () => {
    const n = (s) => UNLOCKS.filter((u) => u.slot === s).length;
    expect(n('top')).toBe(UNLOCK_TOPS.filter((x) => !UNLOCK_PENDING.includes(x)).length);
    expect(n('bottom')).toBe(UNLOCK_BOTTOMS.filter((x) => !UNLOCK_PENDING.includes(x)).length);
    expect(n('shoes')).toBe(UNLOCK_SHOES.filter((x) => !UNLOCK_PENDING.includes(x)).length);
    expect(n('glasses')).toBe(UNLOCK_GLASSES.filter((x) => !UNLOCK_PENDING.includes(x)).length);
    expect(n('hat')).toBe(UNLOCK_HATS.filter((x) => !UNLOCK_PENDING.includes(x)).length);
    expect(n('bag')).toBe(UNLOCK_BAGS.filter((x) => !UNLOCK_PENDING.includes(x)).length);
  });

  it('Zuordnung laut Brief', () => {
    expect(unlockFor('golden-tape')).toMatchObject({ slot: 'hat', id: 'goldcap', code: UNLOCK_BASE + UNLOCK_HATS.indexOf('goldcap') });
    expect(unlockFor('palast-tape')).toMatchObject({ slot: 'glasses', id: '3d' });
    expect(unlockFor('zebra')).toMatchObject({ slot: 'bottom', id: 'zebra' });
    expect(unlockFor('nope')).toBeNull();
  });

  it('unlockedCodes / isUnlocked', () => {
    expect(unlockedCodes([]).size).toBe(0);
    const s = unlockedCodes(['golden-tape', 'zebra', 'unbekannt']);
    expect(s).toEqual(new Set(['hat:' + UNLOCK_BASE, 'bottom:' + UNLOCK_BASE]));
    expect(unlockedCodes(new Set(['golden-tape'])).size).toBe(1);
    expect(unlockedCodes({ 'golden-tape': 5 }).size).toBe(1);
    expect(isUnlocked('hat', 3, [])).toBe(true);
    expect(isUnlocked('hat', UNLOCK_BASE, [])).toBe(false);
    expect(isUnlocked('hat', UNLOCK_BASE, ['golden-tape'])).toBe(true);
    expect(isUnlocked('top', UNLOCK_BASE, ['golden-tape'])).toBe(false);
  });

  it('lockHint ist der Hinweis der Entdeckung und verrät den Titel nicht', () => {
    for (const u of UNLOCKS) {
      const h = lockHint(u.slot, u.code);
      expect(h).toBe(entryOf(u.discover).hint);
      expect(h).toBe(u.hint);
      expect(h.length).toBeGreaterThan(5);
      expect(h).not.toContain(entryOf(u.discover).title);
    }
    expect(lockHint('hat', 1)).toBe('');
  });

  it('alle Entdeckungen des Katalogs bleiben gültige Quellen', () => {
    const ids = new Set(CATALOG.map((e) => e.id));
    for (const u of UNLOCKS) expect(ids.has(u.discover)).toBe(true);
  });
});
