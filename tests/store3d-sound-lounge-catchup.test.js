// @vitest-environment jsdom
// Sound-Modul: Lounge-Musik holt verpasste Schritte nicht vollständig auf.
import { describe, it, expect } from 'vitest';
import sound from '../src/js/store3d/modules/sound.js';

describe('Lounge-Musik holt verpasste Schritte auf', () => {
  it('nach langer Pause werden nicht alle verpassten Schritte eingeplant', () => {
    let oscs = 0;
    const node = () => new Proxy(function fake() {}, {
      get: (t, k) => {
        if (k === 'then') return undefined;
        if (k === 'gain' || k === 'frequency' || k === 'detune' || k === 'delayTime' || k === 'Q') return node();
        return () => node();
      },
      set: () => true,
    });
    class FakeAC {
      constructor() { this.state = 'running'; this.currentTime = 1; this.sampleRate = 4; this.destination = node(); FakeAC.inst = this; }
      createOscillator() { oscs++; return node(); }
      createGain() { return node(); }
      createBiquadFilter() { return node(); }
      createDelay() { return node(); }
      createBufferSource() { return node(); }
      createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
      suspend() { return Promise.resolve(); }
      resume() { return Promise.resolve(); }
      close() {}
    }
    window.AudioContext = FakeAC;
    const handlers = {};
    const ctx = {
      opts: {}, use: () => null, soundOn: () => true, layout: { adultRoom: null, kidsRoom: null }, player: { getPose: () => ({ x: 0, z: 0 }) },
      on: (n, fn) => { handlers[n] = fn; return () => {}; }, provide: () => {}, deps: {},
    };
    const mod = sound.init(ctx);
    handlers.enter();
    mod.update(0.016, 0);
    const before = oscs;
    FakeAC.inst.currentTime = 600; // 10 min versteckter Tab
    mod.update(0.016, 1);
    
    expect(oscs - before).toBeLessThan(40);
    mod.dispose();
    delete window.AudioContext;
  });
});

