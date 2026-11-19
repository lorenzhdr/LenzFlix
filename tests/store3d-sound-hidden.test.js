// @vitest-environment jsdom
// Sound-Modul: versteckter Tab pausiert den AudioContext (Brummen/Regenton), Sichtbarwerden setzt nur bei Ton an fort. Kein Netzwerk.
import { describe, it, expect, afterEach } from 'vitest';
import sound from '../src/js/store3d/modules/sound.js';

const node = () => new Proxy(function fake() {}, {
  get: (t, k) => {
    if (k === 'then') return undefined;
    if (k === 'gain' || k === 'frequency' || k === 'detune' || k === 'delayTime' || k === 'Q') return node();
    return () => node();
  },
  set: () => true,
});
let log;
class FakeAC {
  constructor() { this.state = 'running'; this.currentTime = 1; this.sampleRate = 4; this.destination = node(); }
  createOscillator() { return node(); }
  createGain() { return node(); }
  createBiquadFilter() { return node(); }
  createDelay() { return node(); }
  createBufferSource() { return node(); }
  createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
  suspend() { log.push('suspend'); this.state = 'suspended'; return Promise.resolve(); }
  resume() { log.push('resume'); this.state = 'running'; return Promise.resolve(); }
  close() {}
}
const setHidden = (h) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('sound: versteckter Tab', () => {
  afterEach(() => { delete window.AudioContext; delete document.hidden; });
  function make(on = true) {
    log = [];
    window.AudioContext = FakeAC;
    const handlers = {};
    const st = { on };
    const ctx = {
      opts: {}, use: () => null, soundOn: () => st.on, layout: { adultRoom: null, kidsRoom: null }, player: { getPose: () => ({ x: 0, z: 0 }) },
      on: (n, fn) => { handlers[n] = fn; return () => {}; }, provide: () => {}, deps: {},
    };
    const mod = sound.init(ctx);
    handlers.enter();
    return { mod, st };
  }

  it('verbergen suspendiert, Sichtbarwerden setzt fort', async () => {
    const { mod } = make();
    setHidden(true);
    expect(log).toEqual(['suspend']);
    setHidden(true); // doppeltes Ereignis: nicht erneut
    expect(log).toEqual(['suspend']);
    setHidden(false);
    expect(log).toEqual(['suspend', 'resume']);
    mod.dispose();
  });

  it('Ton inzwischen aus: Sichtbarwerden setzt nicht fort', () => {
    const { mod, st } = make();
    setHidden(true);
    st.on = false;
    setHidden(false);
    expect(log).toEqual(['suspend']);
    mod.dispose();
  });

  it('ohne AudioContext (nie freigeschaltet) bleibt alles still; dispose entfernt den Listener', () => {
    const { mod } = make(false);
    setHidden(true);
    setHidden(false);
    expect(log).toEqual([]);
    mod.dispose();
    const { mod: m2 } = make();
    m2.dispose();
    log.length = 0;
    setHidden(true);
    expect(log).toEqual([]);
  });
});
