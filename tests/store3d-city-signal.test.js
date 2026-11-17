import { describe, it, expect } from 'vitest';
import { signalAt, SIGNAL_CYCLE } from '../src/js/store3d/world/city.js';

describe('Ampel (rein, deterministisch)', () => {
  it('ist periodisch (24 s) und deterministisch', () => {
    for (const t of [0, 3.3, 10.2, 11.7, 13, 19, 23.9]) {
      expect(signalAt(t)).toEqual(signalAt(t + SIGNAL_CYCLE));
      expect(signalAt(t)).toEqual(signalAt(t + 5 * SIGNAL_CYCLE));
      expect(signalAt(t)).toEqual(signalAt(t));
    }
    expect(SIGNAL_CYCLE).toBe(24);
  });

  it('Hauptstraße und Seitenstraße sind nie gleichzeitig grün; Gelb folgt auf Grün, Rot auf Gelb', () => {
    let prev = null;
    for (let t = 0; t < 48; t += 0.05) {
      const s = signalAt(t);
      expect(s.main === 'green' && s.side === 'green').toBe(false);
      expect(s.main === 'green' && s.side === 'yellow').toBe(false);
      expect(s.side === 'green' && s.main === 'yellow').toBe(false);
      if (prev && prev.main !== s.main) {
        if (prev.main === 'green') expect(s.main).toBe('yellow');
        if (prev.main === 'yellow') expect(s.main).toBe('red');
      }
      if (prev && prev.side !== s.side) {
        if (prev.side === 'green') expect(s.side).toBe('yellow');
        if (prev.side === 'yellow') expect(s.side).toBe('red');
      }
      prev = s;
    }
  });

  it('Fußgänger-Freigabe ist Rot der jeweiligen Autorichtung', () => {
    for (let t = 0; t < 24; t += 0.1) {
      const s = signalAt(t);
      expect(s.walkMain).toBe(s.main === 'red');
      expect(s.walkSide).toBe(s.side === 'red');
    }
  });

  it('Abschnitte: main grün [0,10), gelb [10,11.5); side grün [12,18.5), gelb [18.5,20)', () => {
    expect(signalAt(0).main).toBe('green');
    expect(signalAt(9.99).main).toBe('green');
    expect(signalAt(10).main).toBe('yellow');
    expect(signalAt(11.5).main).toBe('red');
    expect(signalAt(11.9).side).toBe('red');
    expect(signalAt(12).side).toBe('green');
    expect(signalAt(18.5).side).toBe('yellow');
    expect(signalAt(20).side).toBe('red');
  });

  it('negative und ungültige Zeiten liefern einen gültigen Zustand', () => {
    expect(signalAt(-1)).toEqual(signalAt(23));
    expect(signalAt(NaN)).toEqual(signalAt(0));
  });
});
