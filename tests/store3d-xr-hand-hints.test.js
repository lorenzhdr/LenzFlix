// @vitest-environment jsdom
// VR-Hinweise für Hände: Pinch statt Trigger.
import { describe, it, expect, vi } from 'vitest';
import { Vector3 } from 'three';
import { vrHint } from '../src/js/store3d/xr/hud3d.js';
import { Pointer } from '../src/js/store3d/xr/pointer.js';

describe('Hinweise für Hände', () => {
  it('vrHint: Pinch statt Trigger', () => {
    expect(vrHint('E / Klick: Nehmen', undefined, true)).toBe('Zusammenkneifen: Nehmen');
    expect(vrHint(undefined, undefined, true)).toBe('Zusammenkneifen: Benutzen');
    expect(vrHint('E / Klick: Nehmen')).toBe('Trigger: Nehmen');
  });

  function labelFor(target, hand) {
    const setLabel = vi.fn();
    const rec = { source: { hand }, pt: { target, o: new Vector3(), d: new Vector3(0, 0, -1) } };
    const mode = { hud3d: { setLabel, hideLabel() {} }, aimHand: 'right', recFor: () => rec, app: { items: { get: () => ({ Name: 'Film' }) } } };
    new Pointer(mode).updateLabel();
    return setLabel.mock.calls[0];
  }

  it('Hülle, Interaktion und Handgelenk-Knopf', () => {
    expect(labelFor({ kind: 'cover', t: 1, info: { itemId: 'a' } }, false)[1]).toBe('Trigger: Nehmen · Grip: Greifen');
    expect(labelFor({ kind: 'cover', t: 1, info: { itemId: 'a' } }, true)[1]).toBe('Zusammenkneifen: Nehmen');
    expect(labelFor({ kind: 'ia', t: 1, ia: { label: 'PC', hint: 'E / Klick: Suchen' } }, true)[1]).toBe('Zusammenkneifen: Suchen');
    expect(labelFor({ kind: 'wrist', t: 1 }, true)[1]).toBe('Zusammenkneifen: Öffnen');
    expect(labelFor({ kind: 'wrist', t: 1 }, false)[1]).toBe('Trigger: Öffnen');
  });
});

