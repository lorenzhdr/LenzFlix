// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPlayer } from '../src/js/live/player/index.js';
import { createVideoControl } from '../src/js/live/player/video.js';
import { makeVideo, makeDeps } from './live-player-helpers.js';

const origAC = window.AudioContext;
afterEach(() => { vi.useRealTimers(); window.AudioContext = origAC; vi.restoreAllMocks(); });

/** iOS-artig: volume wird ignoriert. */
function iosVideo() {
  const v = makeVideo();
  Object.defineProperty(v, 'volume', { get: () => 1, set: () => {}, configurable: true });
  Object.defineProperty(v, 'paused', { get: () => !!v.__paused, configurable: true });
  v.__paused = false;
  return v;
}

function mockAC({ resume = 'ok', loud = true, throwSource = false } = {}) {
  const made = [];
  window.AudioContext = class {
    constructor() {
      this.state = 'suspended';
      this.destination = {};
      this.closed = false;
      this.gainNode = { gain: { value: 1 }, connect: vi.fn() };
      made.push(this);
    }
    resume() {
      if (resume === 'ok') { this.state = 'running'; return Promise.resolve(); }
      if (resume === 'never') return new Promise(() => {});
      return Promise.resolve(); // bleibt suspended
    }
    createMediaElementSource() { if (throwSource) throw new Error('InvalidStateError'); return { connect: vi.fn() }; }
    createGain() { return this.gainNode; }
    createAnalyser() {
      return { fftSize: 256, getByteTimeDomainData: (b) => { b.fill(128); if (loud) b[3] = 200; } };
    }
    close() { this.closed = true; return Promise.resolve(); }
  };
  return made;
}

const flushMicro = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('WebAudio-Lautstaerke (iOS)', () => {
  it('natives volume: Modus native, kein AudioContext', () => {
    const made = mockAC();
    const p = createPlayer({ video: makeVideo(), deps: makeDeps() });
    p.setVolume(0.3);
    expect(p.volumeMode()).toBe('native');
    expect(p.volumeSupported).toBe(true);
    expect(made.length).toBe(0);
  });

  it('ohne native Lautstärke: erst mute-only; Pegel 1 aktiviert nichts, Pegel < 1 baut den Gain-Pfad', async () => {
    const made = mockAC();
    const p = createPlayer({ video: iosVideo(), deps: makeDeps() });
    expect(p.volumeMode()).toBe('mute-only');
    expect(p.volumeSupported).toBe(false);
    expect(p.volumeCanTry()).toBe(true);
    p.setVolume(1);
    await flushMicro();
    expect(made.length).toBe(0);
    p.setVolume(0.4);
    await flushMicro();
    expect(made.length).toBe(1);
    expect(p.volumeMode()).toBe('gain');
    expect(p.volumeSupported).toBe(true);
    expect(made[0].gainNode.gain.value).toBe(0.4);
    p.setVolume(0.7);
    expect(made[0].gainNode.gain.value).toBe(0.7);
    p.dispose();
  });

  it('Modus-Wechsel wird als Ereignis volume-mode gemeldet', async () => {
    mockAC();
    const p = createPlayer({ video: iosVideo(), deps: makeDeps() });
    const modes = [];
    p.on('volume-mode', (m) => modes.push(m.mode));
    p.setVolume(0.5);
    await flushMicro();
    expect(modes).toEqual(['gain']);
    p.dispose();
  });

  it('Kontext läuft nach resume() nicht: Pfad wird nicht aktiviert (Ton bleibt direkt), später neuer Versuch', async () => {
    const made = mockAC({ resume: 'suspended' });
    const video = iosVideo();
    const p = createPlayer({ video, deps: makeDeps() });
    p.setVolume(0.5);
    await flushMicro();
    expect(p.volumeMode()).toBe('mute-only');
    expect(made[0].closed).toBe(true);
    expect(p.volumeCanTry()).toBe(true);
    mockAC({ resume: 'ok' });
    p.setVolume(0.5);
    await flushMicro();
    expect(p.volumeMode()).toBe('gain');
    p.dispose();
  });

  it('resume() hängt (keine Geste): Timeout schließt den Kontext, kein Gain', async () => {
    vi.useFakeTimers();
    const made = mockAC({ resume: 'never' });
    const p = createPlayer({ video: iosVideo(), deps: makeDeps() });
    p.setVolume(0.5);
    await vi.advanceTimersByTimeAsync(1100);
    expect(made[0].closed).toBe(true);
    expect(p.volumeMode()).toBe('mute-only');
    p.dispose();
  });

  it('createMediaElementSource wirft: Rückfall mute-only, canTry false', async () => {
    mockAC({ throwSource: true });
    const p = createPlayer({ video: iosVideo(), deps: makeDeps() });
    p.setVolume(0.5);
    await flushMicro();
    expect(p.volumeMode()).toBe('mute-only');
    expect(p.volumeCanTry()).toBe(false);
    p.dispose();
  });

  it('kein AudioContext vorhanden: mute-only, nicht versuchbar', () => {
    window.AudioContext = undefined;
    const p = createPlayer({ video: iosVideo(), deps: makeDeps() });
    expect(p.volumeCanTry()).toBe(false);
    p.setVolume(0.5);
    expect(p.volumeMode()).toBe('mute-only');
  });

  it('Selbsttest: nur Stille bei Wiedergabe → gain=1 und mute-only', async () => {
    vi.useFakeTimers();
    const made = mockAC({ loud: false });
    const p = createPlayer({ video: iosVideo(), deps: makeDeps() });
    const modes = [];
    p.on('volume-mode', (m) => modes.push(m.mode));
    p.setVolume(0.3);
    await vi.advanceTimersByTimeAsync(10);
    expect(p.volumeMode()).toBe('gain');
    await vi.advanceTimersByTimeAsync(1700);
    expect(p.volumeMode()).toBe('mute-only');
    expect(made[0].gainNode.gain.value).toBe(1);
    expect(modes).toEqual(['gain', 'mute-only']);
    p.setVolume(0.2); // wirkt nicht mehr
    expect(made[0].gainNode.gain.value).toBe(1);
    p.dispose();
  });

  it('Selbsttest zählt nicht, solange pausiert: kein Fehlalarm', async () => {
    vi.useFakeTimers();
    mockAC({ loud: false });
    const video = iosVideo();
    video.__paused = true;
    const p = createPlayer({ video, deps: makeDeps() });
    p.setVolume(0.3);
    await vi.advanceTimersByTimeAsync(5000);
    expect(p.volumeMode()).toBe('gain');
    p.dispose();
  });

  it('Selbsttest: Ton gemessen → bleibt gain', async () => {
    vi.useFakeTimers();
    mockAC({ loud: true });
    const p = createPlayer({ video: iosVideo(), deps: makeDeps() });
    p.setVolume(0.3);
    await vi.advanceTimersByTimeAsync(4000);
    expect(p.volumeMode()).toBe('gain');
    p.dispose();
  });

  it('Graph bleibt am <video>: neue Steuerung übernimmt ihn, dispose setzt gain auf 1', async () => {
    const made = mockAC();
    const video = iosVideo();
    const a = createVideoControl(video, {});
    a.setVolume(0.2);
    await flushMicro();
    expect(a.volumeMode()).toBe('gain');
    a.dispose();
    expect(made[0].gainNode.gain.value).toBe(1);
    const b = createVideoControl(video, {});
    expect(b.volumeMode()).toBe('gain');
    b.setVolume(0.5);
    expect(made.length).toBe(1);
    expect(made[0].gainNode.gain.value).toBe(0.5);
    b.dispose();
  });
});
