// LENZ//84 retro-fx: WebAudio-Synth ohne Dateien. Genau EIN AudioContext pro Seite (Singleton, wird nur suspendiert, nie
// geschlossen: iOS Safari begrenzt Contexts, Design-/Routenwechsel sollen ihn wiederverwenden).
// Erzeugt/aufgeweckt wird er erst nach einer Nutzergeste (unlock()). Alle Fehler werden geschluckt.

let ctx = null;
let master = null;
let rainNode = null;

const MASTER_GAIN = 0.08;
const HOVER_GAP_MS = 60;

function getCtor() {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

/** Context anlegen (nur nach Geste aufrufen). Rückgabe: Context oder null. */
function ensureContext() {
  if (ctx) return ctx;
  const Ctor = getCtor();
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    master.connect(comp);
    comp.connect(ctx.destination);
  } catch {
    ctx = null;
    master = null;
  }
  return ctx;
}

// ---------------------------------------------------------------- Bausteine

function tone(c, { type = 'square', f0, f1 = f0, t0 = 0, dur = 0.1, vol = 0.5, lp = 4000, attack = 0.005 }) {
  const t = c.currentTime + t0;
  const osc = c.createOscillator();
  const gain = c.createGain();
  const filter = c.createBiquadFilter();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  filter.type = 'lowpass';
  filter.frequency.value = lp;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noiseBuffer(c, seconds) {
  const len = Math.max(1, Math.floor(c.sampleRate * seconds));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function noise(c, { t0 = 0, dur = 0.04, vol = 0.4, hp = 1500 }) {
  const t = c.currentTime + t0;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, dur);
  const filter = c.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = hp;
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t);
}

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);

// ---------------------------------------------------------------- Sounds

const SOUNDS = {
  blip: (c) => tone(c, { type: 'square', f0: 1320, f1: 1500, dur: 0.035, vol: 0.12, lp: 3000 }),
  click: (c) => {
    tone(c, { type: 'square', f0: 880, f1: 440, dur: 0.06, vol: 0.4, lp: 2600 });
    noise(c, { dur: 0.015, vol: 0.2, hp: 3000 });
  },
  type: (c) => noise(c, { dur: 0.022, vol: 0.28, hp: 1800 + Math.random() * 1500 }),
  open: (c) => tone(c, { type: 'sawtooth', f0: 220, f1: 880, dur: 0.18, vol: 0.3, lp: 2400 }),
  close: (c) => tone(c, { type: 'sawtooth', f0: 880, f1: 200, dur: 0.16, vol: 0.28, lp: 2400 }),
  nav: (c) => {
    tone(c, { type: 'square', f0: 660, dur: 0.05, vol: 0.3, lp: 3000 });
    tone(c, { type: 'square', f0: 990, t0: 0.05, dur: 0.07, vol: 0.3, lp: 3000 });
  },
  error: (c) => {
    tone(c, { type: 'sawtooth', f0: 160, dur: 0.14, vol: 0.4, lp: 1200 });
    tone(c, { type: 'sawtooth', f0: 120, t0: 0.15, dur: 0.22, vol: 0.4, lp: 1200 });
  },
  boot: (c) => {
    [48, 55, 60, 64, 67, 72].forEach((n, i) => tone(c, { type: i % 2 ? 'square' : 'sawtooth', f0: NOTE(n), t0: i * 0.11, dur: 0.5 - i * 0.04, vol: 0.28, lp: 1800 }));
    tone(c, { type: 'sawtooth', f0: NOTE(36), dur: 1.1, vol: 0.3, lp: 600 });
  },
  jingle: (c) => {
    // 8-Bit-Fanfare, ~2 s
    const melody = [67, 67, 72, 76, 79, 76, 79, 84, 83, 79, 76, 79, 84];
    const len = [0.1, 0.1, 0.1, 0.1, 0.2, 0.1, 0.1, 0.3, 0.1, 0.1, 0.1, 0.1, 0.5];
    let t = 0;
    melody.forEach((n, i) => {
      tone(c, { type: 'square', f0: NOTE(n), t0: t, dur: len[i] * 0.95, vol: 0.3, lp: 5000 });
      tone(c, { type: 'triangle', f0: NOTE(n - 12), t0: t, dur: len[i] * 0.95, vol: 0.3, lp: 2000 });
      t += len[i];
    });
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS).concat('rain');

/**
 * Sound-Steuerung. Ob Sound an ist, fragt isEnabled() ab (getPref('sound')).
 * Rückgabe: { play(name), unlock(), suspend(), startRain(), stopRain(), isRunning() }.
 */
export function createSound(isEnabled) {
  let lastHover = 0;

  function play(name) {
    try {
      if (!isEnabled() || !ctx || ctx.state !== 'running') return false;
      if (name === 'hover') name = 'blip';
      if (name === 'blip') {
        const now = Date.now();
        if (now - lastHover < HOVER_GAP_MS) return false;
        lastHover = now;
      }
      const fn = SOUNDS[name];
      if (!fn) return false;
      fn(ctx);
      return true;
    } catch {
      return false;
    }
  }

  /** Nach Nutzergeste: Context anlegen/aufwecken (nur wenn Sound an). */
  function unlock() {
    try {
      if (!isEnabled()) return false;
      const c = ensureContext();
      if (!c) return false;
      if (c.state === 'suspended' && typeof c.resume === 'function') {
        const p = c.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
      return true;
    } catch {
      return false;
    }
  }

  function stopRain() {
    try {
      if (rainNode) { rainNode.stop(); rainNode.disconnect(); }
    } catch { /* egal */ }
    rainNode = null;
  }

  function suspend() {
    stopRain();
    try {
      if (ctx && ctx.state === 'running' && typeof ctx.suspend === 'function') {
        const p = ctx.suspend();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch { /* egal */ }
  }

  /** Leises Rauschen-Ambient (Code-Regen). */
  function startRain() {
    try {
      if (!isEnabled() || !ctx || ctx.state !== 'running' || rainNode) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 2);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 700;
      const g = ctx.createGain();
      g.gain.value = 0.18;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start();
      rainNode = src;
    } catch { rainNode = null; }
  }

  return { play, unlock, suspend, startRain, stopRain, isRunning: () => Boolean(ctx && ctx.state === 'running') };
}
