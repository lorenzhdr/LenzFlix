// VIDEOTHEK LENZ (Paket physics): Hülle freigeben (Werfen) und zurückstellen, ohne dass das Regalfach früh frei wird.
import { describe, it, expect, vi } from 'vitest';
import { StoreApp } from '../src/js/store3d/store.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import { planProps, findSpot } from '../src/js/store3d/modules/props.js';

const SLOT = { fv: { id: 'fv' }, info: { id: 'slot' } };

function make() {
  const emitted = [];
  const app = Object.assign(Object.create(StoreApp.prototype), {
    mode: 'play', disposed: false, xr: null, carried: null, carryingOut: false, heldId: null, pendingTake: null,
    items: new Map([['a', { Id: 'a', lfx: { media: 'dvd' } }]]),
    mods: { locked: false, emit: vi.fn((...a) => emitted.push(a)), interactables: [], action: vi.fn(() => false) },
    holdview: { isOpen: false, itemId: null },
    hands: { setCarried: vi.fn() }, touchCtl: { setCarrying: vi.fn() }, shelves: { setHidden: vi.fn() },
    player: { cancelPath: vi.fn() }, findSlot: vi.fn(() => SLOT),
  });
  return { app, emitted };
}

describe('release / restore', () => {
  it('release lässt das Fach leer, restore stellt zurück', () => {
    const { app, emitted } = make();
    app.carry('a');
    const rel = app.releaseCarried();
    expect(rel).toMatchObject({ id: 'a', media: 'dvd' });
    expect(app.getCarried()).toBeNull();
    expect(app.hands.setCarried).toHaveBeenLastCalledWith(null);
    expect(emitted.filter((e) => e[0] === 'carry').pop()[1]).toEqual({ id: null });
    expect(app.shelves.setHidden).not.toHaveBeenCalledWith(SLOT.fv, SLOT.info, false);
    expect(app.restoreReleased('a')).toBe(true);
    expect(app.shelves.setHidden).toHaveBeenLastCalledWith(SLOT.fv, SLOT.info, false);
    expect(app.restoreReleased('a')).toBe(false);
  });

  it('erneutes carry einer freigegebenen Hülle übernimmt das Ursprungsfach (kein zweites Fach)', () => {
    const { app } = make();
    app.carry('a');
    app.releaseCarried();
    app.findSlot.mockReturnValue(null); // das Fach ist versteckt: findSlot findet nichts
    expect(app.carry('a')).toBe(true);
    expect(app.carried.slot).toBe(SLOT);
    app.drop();
    expect(app.shelves.setHidden).toHaveBeenLastCalledWith(SLOT.fv, SLOT.info, false);
  });

  it('release ohne getragene Hülle: null', () => {
    expect(make().app.releaseCarried()).toBeNull();
  });
});

describe('Platzplan der Objekte', () => {
  const lay = buildLayout([{ id: 'g', label: 'G', kind: 'genre', color: '#0f0', itemIds: Array.from({ length: 80 }, (_, i) => `t${i}`) }], { big: false });
  it('plant Pyramide (6 Dosen), Tonnen, Aufsteller und Bälle auf freien Plätzen, ohne Kollider zu überlappen', () => {
    const plan = planProps(lay, { x: lay.w + 6, z: -6.8, y: 3.05, r: 0.3 });
    expect(plan.filter((p) => p.group === 'pyramid').length).toBe(lay.city ? 6 : 0);
    expect(plan.some((p) => p.kind === 'bin')).toBe(!!lay.city);
    expect(plan.some((p) => p.kind === 'standee')).toBe(true);
    const src = { index: lay.cidx, dyn: null };
    for (const p of plan.filter((q) => q.group !== 'pyramid')) {
      expect(findSpot(src, p.x, p.z, 0.05, p.y, 0.3), p.id).toEqual({ x: p.x, z: p.z });
    }
  });
});
