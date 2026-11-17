// @vitest-environment jsdom
// Halte-Bild: „Mitnehmen“ (Knopf, carryOut, releaseForCarry).
import { describe, it, expect, vi } from 'vitest';
import { Group } from 'three';
import { HoldView } from '../src/js/store3d/ui/holdview.js';

const ctxStub = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : () => ({ width: 10, addColorStop() {} })),
  set: (t, k, v) => { t[k] = v; return true; },
});
HTMLCanvasElement.prototype.getContext = () => ctxStub;

function make(extra = {}) {
  document.body.innerHTML = '';
  const item = { Id: 'm', Name: 'Film', Type: 'Movie', RunTimeTicks: 6e10 };
  const camera = new Group();
  camera.aspect = 1.6;
  const deps = { imageUrl: () => '', getItem: async () => null, toast() {}, setFavorite: async () => {}, setPlayed: async () => {}, play: async () => {}, getSeasons: async () => [], getEpisodes: async () => [] };
  const setHidden = vi.fn();
  const onClosed = vi.fn();
  const hv = new HoldView({ host: document.body, camera, deps, items: new Map([[item.Id, item]]), shelves: { setHidden, faceViews: [] }, notify() {}, onClosed, ...extra });
  return { hv, setHidden, onClosed };
}

describe('HoldView Mitnehmen', () => {
  it('Knopf nur mit onCarry; Klick ruft onCarry(id)', () => {
    const a = make();
    a.hv.open('m', null, true);
    expect(a.hv.dom.btns.carry).toBeUndefined();
    a.hv.dispose(true);
    const onCarry = vi.fn();
    const b = make({ onCarry });
    b.hv.open('m', null, true);
    const btn = b.hv.dom.btns.carry;
    expect(btn.textContent).toBe('Mitnehmen');
    btn.click();
    expect(onCarry).toHaveBeenCalledWith('m');
    b.hv.dom.root.classList.add('is-closing');
    btn.click();
    expect(onCarry).toHaveBeenCalledTimes(1);
    b.hv.dispose(true);
  });

  it('carryOut: nur im Halten, nicht ohne onCarry', () => {
    const onCarry = vi.fn();
    const { hv } = make({ onCarry });
    expect(hv.carryOut()).toBe(false); // noch zu
    hv.open('m', null, true);
    expect(hv.carryOut()).toBe(true);
    expect(onCarry).toHaveBeenCalledTimes(1);
    hv.dispose(true);
    expect(make().hv.carryOut()).toBe(false);
  });

  it('releaseForCarry: schließt ohne das Regalfach wieder einzublenden, meldet onClosed, liefert Platz und Vorderseite', () => {
    const { hv, setHidden, onClosed } = make({ onCarry() {} });
    const slot = { fv: { face: { x: 1, z: 1, yaw: 0 } }, info: { local: { x: 0, y: 1, z: 0 } } };
    hv.open('m', slot, true);
    expect(setHidden).toHaveBeenLastCalledWith(slot.fv, slot.info, true);
    setHidden.mockClear();
    const r = hv.releaseForCarry();
    expect(r.slot).toBe(slot);
    expect(r.art).toBeTruthy();
    expect(setHidden).not.toHaveBeenCalled(); // Fach bleibt leer
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(hv.isOpen).toBe(false);
    expect(document.querySelector('.lfx-store-hold')).toBe(null);
    expect(hv.releaseForCarry()).toBe(null);
  });
});
