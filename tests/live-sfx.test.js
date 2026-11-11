// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createSfx } from '../src/js/live/player/sfx.js';

function param() {
  return { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
}
const node = (extra = {}) => ({ connect: vi.fn(), disconnect: vi.fn(), ...extra });

function makeCtxClass(log) {
  return class FakeCtx {
    constructor() {
      this.currentTime = 1;
      this.sampleRate = 8000;
      this.state = 'suspended';
      this.destination = node();
      this.resume = vi.fn(() => Promise.resolve());
      this.close = vi.fn(() => Promise.resolve());
      this.gains = [];
      log.push(this);
    }
    createGain() { const g = node({ gain: param() }); this.gains.push(g); return g; }
    createOscillator() { return node({ type: 'sine', frequency: param(), start: vi.fn(), stop: vi.fn() }); }
    createBiquadFilter() { return node({ type: 'lowpass', frequency: param() }); }
    createBufferSource() { return node({ buffer: null, start: vi.fn() }); }
    createBuffer(ch, len) { const d = new Float32Array(len); return { getChannelData: () => d }; }
  };
}

describe('createSfx', () => {
  it('erzeugt den AudioContext erst im ersten Klick', () => {
    const log = [];
    const sfx = createSfx({ AudioCtx: makeCtxClass(log) });
    expect(log.length).toBe(0);
    sfx.click('press');
    expect(log.length).toBe(1);
    expect(log[0].resume).toHaveBeenCalled();
    sfx.click('detent');
    sfx.click('power');
    expect(log.length).toBe(1);
  });

  it('Pegel = Lautstärke · 0,35, Stumm und 0 bleiben still', () => {
    const log = [];
    const sfx = createSfx({ AudioCtx: makeCtxClass(log) });
    sfx.setLevel(0.5, false);
    sfx.click('press');
    expect(log[0].gains[0].gain.value).toBeCloseTo(0.175, 5);
    const n = log[0].gains.length;
    sfx.setLevel(0.5, true);
    sfx.click('press');
    sfx.setLevel(0, false);
    sfx.click('power');
    expect(log[0].gains.length).toBe(n);
  });

  it('stumm vor dem ersten Klick legt keinen Context an', () => {
    const log = [];
    const sfx = createSfx({ AudioCtx: makeCtxClass(log) });
    sfx.setLevel(1, true);
    sfx.click('press');
    expect(log.length).toBe(0);
  });

  it('ohne AudioContext oder bei Ausnahme: still, keine Exception', () => {
    expect(() => createSfx({ AudioCtx: undefined }).click('press')).not.toThrow();
    const Bad = class { constructor() { throw new Error('nein'); } };
    expect(() => createSfx({ AudioCtx: Bad }).click('press')).not.toThrow();
    const Bad2 = class {
      constructor() { this.sampleRate = 8000; }
      createBuffer() { return { getChannelData: () => new Float32Array(10) }; }
      createGain() { throw new Error('x'); }
    };
    expect(() => createSfx({ AudioCtx: Bad2 }).click('power')).not.toThrow();
  });

  it('dispose schließt den Context, danach still', () => {
    const log = [];
    const sfx = createSfx({ AudioCtx: makeCtxClass(log) });
    sfx.click('press');
    sfx.dispose();
    expect(log[0].close).toHaveBeenCalled();
    sfx.click('press');
    expect(log.length).toBe(1);
    expect(() => sfx.dispose()).not.toThrow();
  });
});
