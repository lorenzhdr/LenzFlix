// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { choose, nearestCover, scrollable } from '../src/js/store3d/xr/pointer.js';
import { vrHint } from '../src/js/store3d/xr/hud3d.js';

const panel = (t, hit = null) => ({ t, panel: { id: 'p' }, uv: { x: 0.5, y: 0.5 }, hit });
const cover = (t) => ({ fv: {}, info: { itemId: 'a' }, t });
const ia = (t) => ({ ia: { label: 'Kasse' }, t });

describe('xr/pointer choose', () => {
  it('nichts getroffen → null', () => {
    expect(choose(null, null, null)).toBeNull();
  });
  it('Panel hat Vorrang vor Hülle und Interaktion', () => {
    const r = choose(panel(2), cover(1), ia(0.5));
    expect(r.kind).toBe('panel');
    expect(r.t).toBe(2);
  });
  it('ohne Panel gewinnt das nähere von Hülle und Interaktion', () => {
    expect(choose(null, cover(1), ia(2)).kind).toBe('cover');
    expect(choose(null, cover(2), ia(1)).kind).toBe('ia');
    expect(choose(null, cover(1), null).kind).toBe('cover');
    expect(choose(null, null, ia(1)).kind).toBe('ia');
  });
  it('Handgelenk-Knopf gewinnt, wenn er näher als ein Panel liegt', () => {
    expect(choose(panel(1), cover(0.5), null, 0.4).kind).toBe('wrist');
    expect(choose(panel(0.3), null, null, 0.4).kind).toBe('panel');
  });
});

describe('xr/pointer Hilfen', () => {
  it('scrollable: nur Listen mit mehr Zeilen als sichtbar', () => {
    expect(scrollable(null)).toBe(false);
    expect(scrollable({ spec: { list: { rows: [1, 2, 3] } } })).toBe(false);
    expect(scrollable({ spec: { list: { rows: new Array(9).fill(0), visible: 6 } } })).toBe(true);
  });

  it('nearestCover findet die Hülle im Radius, ignoriert versteckte', () => {
    const fv = {
      mesh: {},
      face: { x: 0, z: 0, yaw: 0 },
      infos: [
        { itemId: 'far', local: { x: 0.5, y: 1, z: 0 } },
        { itemId: 'near', local: { x: 0, y: 1, z: 0.05 } },
        { itemId: 'hid', hidden: true, local: { x: 0, y: 1, z: 0.01 } },
      ],
    };
    const r = nearestCover([fv], { x: 0, y: 1, z: 0.2 }, 0.4);
    expect(r.info.itemId).toBe('near');
    expect(nearestCover([fv], { x: 5, y: 1, z: 5 }, 0.4)).toBeNull();
    expect(nearestCover([fv], { x: 0, y: 3, z: 0 }, 0.4)).toBeNull();
  });

  it('vrHint ersetzt „E / Klick:“ durch „Trigger:“', () => {
    expect(vrHint('E / Klick: Nehmen')).toBe('Trigger: Nehmen');
    expect(vrHint('E/Klick: Benutzen')).toBe('Trigger: Benutzen');
    expect(vrHint(undefined)).toBe('Trigger: Benutzen');
    expect(vrHint('Etwas anderes')).toBe('Etwas anderes');
  });
});
