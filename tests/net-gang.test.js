// VIDEOTHEK LENZ · 1.18.0 net/gang.js: gs-Kodierung der Rowdy-Bande (rein), Posen-Code, Phase, Waffen-Index. Die Rollen (lokal/Führer/Mitläufer) prüft
// tests/store3d-gang-module.test.js, die Sende-Raten tests/net-fight.test.js.
import { describe, it, expect } from 'vitest';
import { encodeGs, decodeGs, netAnim, phaseOf, weaponIndex } from '../src/js/store3d/net/gang.js';
import { createFrame } from '../src/js/store3d/net/frame.js';
import { normalizeOut } from '../src/js/store3d/net/proto.js';

const frame = createFrame({ w: 12.5, d: 18 });

describe('net/gang: gs-Kodierung', () => {
  it('Rundlauf Meter ↔ cm, Zustand, Posen-Code, Klemmen', () => {
    const members = [
      { st: 'taunt', x: -1.8, y: 0, z: 3.2, yaw: 1.5, a: 14, tgt: 12, hp: 60 },
      { st: 'beaten', x: 4, z: -6, yaw: -3, a: 9, tgt: 0, hp: 0 },
    ];
    const q = encodeGs(frame, { phase: 2, seed: 0x123456, members });
    expect(q).toHaveLength(3 + 16);
    const d = decodeGs(frame, q);
    expect(d).toMatchObject({ phase: 2, tod: 'night', seed: 0x123456 });
    expect(d.members[0]).toMatchObject({ st: 'taunt', a: 14, tgt: 12, hp: 60 });
    expect(d.members[0].x).toBeCloseTo(-1.8, 1);
    expect(d.members[0].z).toBeCloseTo(3.2, 1);
    expect(d.members[1].st).toBe('beaten');
    expect(decodeGs(frame, [0, 0, 2])).toBeNull();
    expect(decodeGs(frame, null)).toBeNull();
    const big = encodeGs(frame, { phase: 999, seed: 2 ** 30, members: [{ st: 'x', x: 0, z: 0, yaw: 0, a: 99, hp: 900 }] });
    expect(big[0]).toBe(255);
    expect(big[1]).toBe(0xffffff);
    expect(big[8]).toBe(15);
    expect(big[10]).toBe(100);
    expect(normalizeOut({ t: 'gs', g: 1, q: big })).toBeTruthy();
    expect(encodeGs(frame, { members: [1, 2, 3, 4].map(() => ({ st: 'idle', x: 0, z: 0, yaw: 0, hp: 1 })) })[2]).toBe(3);
  });
  it('Hilfen: Posen-Code, Phase, Waffen-Index', () => {
    expect(netAnim('beaten')).toBe(9);
    expect(netAnim('idle', 0, true)).toBe(6);
    expect(netAnim('threaten')).toBe(14);
    expect(netAnim('approach', 3)).toBe(2);
    expect(netAnim('flee', 1)).toBe(1);
    expect(netAnim('idle', 0)).toBe(0);
    expect(phaseOf('night')).toBe(2);
    expect(phaseOf('x')).toBe(0);
    expect(weaponIndex('whip')).toBe(2);
    expect(weaponIndex('nix')).toBe(0);
  });
});

