// @vitest-environment jsdom
/* global process */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { createMusic } from '../src/js/live/player/music.js';
import { PRESETS } from '../src/js/live/player/music-presets.js';

function param(v = 0) {
  return {
    value: v,
    targets: [],
    setValueAtTime: vi.fn(function (x) { this.value = x; }),
    setTargetAtTime: vi.fn(function (x, t, tc) { this.targets.push([x, t, tc]); }),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}
function node(extra = {}) {
  return { connect: vi.fn(), disconnect: vi.fn(), ...extra };
}

let made;
function makeCtxClass() {
  made = [];
  return class FakeCtx {
    constructor() {
      this.currentTime = 0;
      this.sampleRate = 8000;
      this.state = 'suspended';
      this.destination = node();
      this.oscs = [];
      this.gains = [];
      this.resume = vi.fn(() => Promise.resolve());
      this.suspend = vi.fn(() => Promise.resolve());
      this.close = vi.fn(() => Promise.resolve());
      made.push(this);
    }
    createGain() { const g = node({ gain: param(1) }); this.gains.push(g); return g; }
    createOscillator() {
      const o = node({ type: 'sine', frequency: param(), detune: param(), start: vi.fn(), stop: vi.fn() });
      this.oscs.push(o);
      return o;
    }
    createBiquadFilter() { return node({ type: 'lowpass', frequency: param(), Q: param() }); }
    createConvolver() { return node({ buffer: null }); }
    createDynamicsCompressor() { return node(); }
    createBuffer(ch, len) {
      const data = new Float32Array(len);
      return { getChannelData: () => data };
    }
    createBufferSource() { return node({ buffer: null, loop: false, start: vi.fn(), stop: vi.fn() }); }
  };
}

let Fake;
beforeEach(() => {
  vi.useFakeTimers();
  Fake = makeCtxClass();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const advance = (ctx, secs) => {
  // Zeit in 25-ms-Schritten vorspulen, Audio-Uhr mitführen
  for (let t = 0; t < secs; t += 0.025) {
    ctx.currentTime += 0.025;
    vi.advanceTimersByTime(25);
  }
};

describe('Pausenmusik', () => {
  it('legt den Context erst in unlock() an, nur einmal', () => {
    const m = createMusic({ AudioCtx: Fake });
    expect(made).toHaveLength(0);
    m.unlock();
    expect(made).toHaveLength(1);
    expect(made[0].resume).toHaveBeenCalled();
    m.unlock();
    expect(made).toHaveLength(1);
  });

  it('setIdle startet den Scheduler, setIdle(null) stoppt ihn', () => {
    const m = createMusic({ AudioCtx: Fake });
    m.unlock();
    const ctx = made[0];
    expect(ctx.oscs).toHaveLength(0);
    m.setIdle('pause');
    expect(m.isPlaying()).toBe(true);
    advance(ctx, 1);
    expect(ctx.oscs.length).toBeGreaterThan(0);
    m.setIdle('test'); // andere Art: weiterlaufen
    expect(m.isPlaying()).toBe(true);
    m.setIdle(null);
    expect(m.isPlaying()).toBe(false);
    advance(ctx, 1);
    const n = ctx.oscs.length;
    advance(ctx, 2);
    expect(ctx.oscs.length).toBe(n);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('setIdle vor unlock startet nach unlock', () => {
    const m = createMusic({ AudioCtx: Fake });
    m.setIdle('error');
    expect(m.isPlaying()).toBe(false);
    m.unlock();
    expect(m.isPlaying()).toBe(true);
  });

  it('setLevel setzt das Ziel-Gain', () => {
    const m = createMusic({ AudioCtx: Fake });
    m.unlock();
    const master = made[0].gains[0];
    m.setLevel(0.5, false);
    expect(master.gain.targets.at(-1)[0]).toBeCloseTo(0.225);
    expect(master.gain.targets.at(-1)[2]).toBeCloseTo(0.05);
    m.setLevel(0.5, true);
    expect(master.gain.targets.at(-1)[0]).toBe(0);
  });

  it('setEnabled(false) verhindert/beendet Musik', () => {
    const m = createMusic({ AudioCtx: Fake });
    m.unlock();
    m.setEnabled(false);
    m.setIdle('pause');
    advance(made[0], 0.5);
    expect(made[0].oscs).toHaveLength(0);
    expect(m.isPlaying()).toBe(false);
    m.setEnabled(true);
    expect(m.isPlaying()).toBe(true);
    m.setEnabled(false);
    expect(m.isPlaying()).toBe(false);
  });

  it('setStyle wechselt das Preset, unbekannt -> flat', () => {
    const types = (id) => {
      const m = createMusic({ AudioCtx: Fake });
      m.setStyle(id);
      m.unlock();
      m.setIdle('pause');
      advance(made.at(-1), 3);
      const t = new Set(made.at(-1).oscs.map((o) => o.type));
      m.dispose();
      return [...t].sort().join(',');
    };
    const crt = types('crt80');
    const plain = types('plain');
    expect(crt).toContain('square');
    expect(plain).toContain('triangle');
    expect(plain).not.toContain('square');
    expect(types('gibtsnicht')).toBe(types('flat'));
  });

  it('setStyle während der Musik blendet über', () => {
    const m = createMusic({ AudioCtx: Fake });
    m.unlock();
    m.setIdle('pause');
    advance(made[0], 0.5);
    m.setStyle('crt80');
    advance(made[0], 2);
    expect(made[0].oscs.some((o) => o.type === 'square')).toBe(true);
    expect(m.isPlaying()).toBe(true);
  });

  it('visibilitychange: hidden -> suspend, sichtbar + idle -> resume', () => {
    const m = createMusic({ AudioCtx: Fake });
    m.unlock();
    m.setIdle('pause');
    const ctx = made[0];
    ctx.resume.mockClear();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ctx.suspend).toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ctx.resume).toHaveBeenCalled();
    m.dispose();
  });

  it('dispose schließt, entfernt Listener, danach No-ops', () => {
    const rm = vi.spyOn(document, 'removeEventListener');
    const m = createMusic({ AudioCtx: Fake });
    m.unlock();
    m.setIdle('pause');
    m.dispose();
    expect(made[0].close).toHaveBeenCalled();
    expect(rm).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    expect(() => {
      m.unlock(); m.setStyle('crt80'); m.setLevel(1, false); m.setEnabled(true); m.setIdle('pause'); m.dispose();
    }).not.toThrow();
    expect(m.isPlaying()).toBe(false);
    expect(made).toHaveLength(1);
  });

  it('ohne AudioContext keine Fehler', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const m = createMusic();
    expect(() => {
      m.unlock(); m.setIdle('pause'); m.setLevel(1, false); m.setStyle('silver'); m.setEnabled(true);
    }).not.toThrow();
    expect(m.isPlaying()).toBe(false);
    expect(() => m.dispose()).not.toThrow();
  });
});

describe('Presets', () => {
  it('vier Presets mit Tempo und 16–32 Takten', () => {
    expect(Object.keys(PRESETS).sort()).toEqual(['crt80', 'flat', 'plain', 'silver']);
    for (const p of Object.values(PRESETS)) {
      expect(p.bpm).toBeGreaterThan(0);
      expect(p.chords.length).toBeGreaterThanOrEqual(16);
      expect(p.chords.length).toBeLessThanOrEqual(32);
      for (const L of p.layers) expect(L.pattern).toHaveLength(16);
    }
  });

  it('kein Math.random in den Dateien', () => {
    for (const f of ['music.js', 'music-presets.js']) {
      const src = fs.readFileSync(`${process.cwd()}/src/js/live/player/${f}`, 'utf8');
      expect(src).not.toMatch(/Math\.random/);
    }
  });
});
