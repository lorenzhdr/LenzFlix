// LENZ LIVE – Pausenmusik: prozedurale Wartemusik per Web Audio (keine Audiodateien).
// Läuft nur auf Leerlaufbildern (Pausenbild, Testbild, Störbild). Vertrag: docs/live.md „Pausenmusik“.
// Lookahead-Scheduler (Timer ~25 ms, Vorlauf ~120 ms), Noten als kurzlebige Knoten ohne Lecks.

import { PRESETS, chordTone, midiToHz, mulberry32, loopBars } from './music-presets.js';

const TICK_MS = 25;
const LOOKAHEAD = 0.12;
const FADE_IN = 1.5;
const FADE_OUT = 0.6;
const SWITCH_OUT = 0.3;
const SWITCH_IN = 0.8;
const GAIN_SCALE = 0.45;
const MIN_G = 0.0001;

const safe = (fn) => {
  try {
    const r = fn();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch {
    /* Audio-Fehler sind hier nie fatal */
  }
};

export function createMusic({ AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext, doc = globalThis.document } = {}) {
  let ctx = null;
  let master = null;
  let bus = null;
  let lp = null;
  let wet = null;
  let tail = [];
  let noiseBuf = null;
  let aux = null; // Tremolo-Hilfsknoten (nur plain)
  let timer = null;
  let stopTimer = null;
  let switchTimer = null;
  let disposed = false;
  let enabled = true;
  let vol = 0.7;
  let muted = false;
  let idle = null;
  let styleId = 'flat';
  let preset = PRESETS.flat;
  let playing = false;
  let switching = false;
  let nextTime = 0;
  let step = 0;
  let noiseCount = 0;

  const target = () => (muted ? 0 : vol * GAIN_SCALE);
  const wantsMusic = () => !!(ctx && enabled && idle && target() > 0);

  // ---- Knotengraph ----
  function buildReverbImpulse(sr) {
    const len = Math.floor(sr * 2.2);
    const buf = ctx.createBuffer(2, len, sr);
    const rnd = mulberry32(0x1f3a9c);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const k = 1 - i / len;
        d[i] = (rnd() * 2 - 1) * k * k * k;
      }
    }
    return buf;
  }

  function buildNoise(sr) {
    const len = Math.floor(sr * 1.2);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const rnd = mulberry32(0x51ed27);
    for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
    return buf;
  }

  function ensureCtx() {
    if (ctx || !AudioCtx || disposed) return;
    try {
      ctx = new AudioCtx();
      const sr = ctx.sampleRate || 44100;
      master = ctx.createGain();
      master.gain.value = target();
      bus = ctx.createGain();
      bus.gain.value = 0;
      lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = preset.cutoff;
      lp.Q.value = 0.5;
      const dry = ctx.createGain();
      dry.gain.value = 0.85;
      wet = ctx.createGain();
      wet.gain.value = preset.reverb;
      const conv = ctx.createConvolver();
      conv.buffer = buildReverbImpulse(sr);
      noiseBuf = buildNoise(sr);
      bus.connect(lp);
      lp.connect(dry);
      lp.connect(conv);
      conv.connect(wet);
      let out = master;
      tail = [dry, conv, wet];
      if (typeof ctx.createDynamicsCompressor === 'function') {
        const comp = ctx.createDynamicsCompressor();
        comp.connect(master);
        out = comp;
        tail.push(comp);
      }
      dry.connect(out);
      wet.connect(out);
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
  }

  // ---- Stimmen ----
  function cleanup(first, nodes) {
    first.onended = () => {
      for (const n of nodes) safe(() => n.disconnect());
    };
  }

  // Allgemeine Stimme: mehrere Oszillatoren -> Hüllkurve -> optional Tiefpass -> Bus.
  function voice({ waves, freq, t, dur, a = 0.01, vol: v, cutoff, sustain = false, dest = bus }) {
    const env = ctx.createGain();
    const nodes = [env];
    const end = t + dur;
    env.gain.setValueAtTime(MIN_G, t);
    env.gain.linearRampToValueAtTime(v, t + a);
    if (sustain) {
      env.gain.setValueAtTime(v, Math.max(t + a, end - 0.25));
      env.gain.linearRampToValueAtTime(MIN_G, end);
    } else {
      env.gain.exponentialRampToValueAtTime(MIN_G, end);
    }
    let out = env;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      env.connect(f);
      nodes.push(f);
      out = f;
    }
    out.connect(dest);
    let first = null;
    for (const w of waves) {
      const o = ctx.createOscillator();
      o.type = w.type;
      o.frequency.setValueAtTime(freq * (w.mul || 1), t);
      if (w.detune) o.detune.value = w.detune;
      let src = o;
      if (w.vol !== undefined) {
        const wg = ctx.createGain();
        wg.gain.value = w.vol;
        o.connect(wg);
        nodes.push(wg);
        src = wg;
      }
      src.connect(env);
      o.start(t);
      o.stop(end + 0.05);
      nodes.push(o);
      if (!first) first = o;
    }
    cleanup(first, nodes);
  }

  function noiseHit({ t, dur, type, freq, q = 0.8, vol: v, a = 0.004, dest = bus }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(MIN_G, t);
    env.gain.linearRampToValueAtTime(v, t + a);
    env.gain.exponentialRampToValueAtTime(MIN_G, t + dur);
    src.connect(f);
    f.connect(env);
    env.connect(dest);
    noiseCount = (noiseCount + 1) % 7;
    src.start(t, noiseCount * 0.13);
    src.stop(t + dur + 0.05);
    cleanup(src, [src, f, env]);
  }

  function epianoNote({ freq, t, dur, vol: v, ratio, index }) {
    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.setValueAtTime(freq, t);
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(freq * ratio, t);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(index * freq, t);
    mg.gain.exponentialRampToValueAtTime(freq * 0.02, t + dur * 0.55);
    const env = ctx.createGain();
    env.gain.setValueAtTime(MIN_G, t);
    env.gain.linearRampToValueAtTime(v, t + 0.008);
    env.gain.exponentialRampToValueAtTime(MIN_G, t + dur);
    mod.connect(mg);
    mg.connect(car.frequency);
    car.connect(env);
    env.connect(bus);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
    cleanup(car, [car, mod, mg, env]);
  }

  // ---- Ebenen ----
  const LAYERS = {
    pad(L, ch, st, t, sd, vel) {
      const dur = sd * (L.len || 16);
      for (const i of L.voices) {
        const f = midiToHz(chordTone(ch, i, L.oct));
        voice({
          waves: [
            { type: L.wave, detune: -L.detune },
            { type: L.wave, detune: L.detune },
          ],
          freq: f, t, dur, a: L.attack, vol: L.vol * vel, cutoff: L.cutoff, sustain: true,
        });
      }
    },
    arp(L, ch, st, t, sd, vel, idx) {
      voice({
        waves: [{ type: L.wave }],
        freq: midiToHz(chordTone(ch, idx, L.oct)), t, dur: sd * L.len, a: 0.02, vol: L.vol, cutoff: L.cutoff,
      });
    },
    bass(L, ch, st, t, sd, vel, code) {
      const off = { 1: 0, 3: 3, 5: 7, 8: 12 }[code];
      const third = code === 3 ? (ch.q.startsWith('m') ? 3 : 4) : off;
      voice({
        waves: [{ type: L.wave }, { type: 'sine', mul: 0.5, vol: 0.6 }],
        freq: midiToHz(ch.r + L.oct + third), t, dur: sd * L.len, a: 0.015, vol: L.vol, cutoff: L.cutoff,
      });
    },
    epiano(L, ch, st, t, sd, vel) {
      L.voicing.forEach((i, k) => {
        epianoNote({
          freq: midiToHz(chordTone(ch, i, L.oct)), t: t + k * L.strum, dur: sd * L.len,
          vol: L.vol * vel * (1 - k * 0.08), ratio: L.ratio, index: L.index,
        });
      });
    },
    vibes(L, ch, st, t, sd, vel, idx) {
      const f = midiToHz(chordTone(ch, idx, L.oct));
      const dest = aux ? aux.trem : bus;
      voice({
        waves: [{ type: 'sine' }, { type: 'sine', mul: 4, vol: 0.12 }],
        freq: f, t, dur: sd * L.len * 0.5, a: 0.006, vol: L.vol, dest,
      });
    },
    upright(L, ch, st, t, sd, vel, code) {
      const off = { 1: 0, 3: ch.q.startsWith('m') ? 3 : 4, 5: 7 }[code] || 0;
      voice({
        waves: [{ type: 'triangle' }, { type: 'sine', mul: 2, vol: 0.2 }],
        freq: midiToHz(ch.r + L.oct + off), t, dur: sd * L.len, a: 0.02, vol: L.vol, cutoff: 520,
      });
    },
    kick(L, ch, st, t, sd, vel) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      const env = ctx.createGain();
      env.gain.setValueAtTime(MIN_G, t);
      env.gain.linearRampToValueAtTime(L.vol * vel, t + 0.005);
      env.gain.exponentialRampToValueAtTime(MIN_G, t + 0.32);
      o.connect(env);
      env.connect(bus);
      o.start(t);
      o.stop(t + 0.36);
      cleanup(o, [o, env]);
    },
    snare(L, ch, st, t, sd, vel) {
      noiseHit({ t, dur: 0.14, type: 'bandpass', freq: 1800, q: 0.7, vol: L.vol * vel });
    },
    hat(L, ch, st, t, sd, vel) {
      noiseHit({ t, dur: 0.05, type: 'highpass', freq: 7000, q: 0.5, vol: L.vol * vel });
    },
    brush(L, ch, st, t, sd, vel) {
      noiseHit({ t, dur: 0.16, type: 'bandpass', freq: 4200, q: 0.6, vol: L.vol * vel, a: 0.05 });
    },
  };

  const PITCHED_IDX = { arp: 1, vibes: 1 };

  function scheduleStep(s, t) {
    const sd = 60 / preset.bpm / 4;
    const bar = Math.floor(s / 16) % loopBars(preset);
    const st = s % 16;
    const ch = preset.chords[bar];
    const tt = t + (st % 2) * (preset.swing || 0) * sd;
    for (const L of preset.layers) {
      const v = L.pattern[st];
      if (PITCHED_IDX[L.k] ? !(v >= 0) : !v) continue;
      LAYERS[L.k](L, ch, st, tt, sd, PITCHED_IDX[L.k] ? 1 : v, v);
    }
  }

  function tick() {
    if (!ctx || !playing || switching) return;
    const now = ctx.currentTime;
    if (nextTime < now - 0.5) nextTime = now + 0.05;
    const sd = 60 / preset.bpm / 4;
    while (nextTime < now + LOOKAHEAD) {
      scheduleStep(step, nextTime);
      step = (step + 1) % (loopBars(preset) * 16);
      nextTime += sd;
    }
  }

  // ---- Zustand ----
  function fadeBus(to, secs) {
    const g = bus.gain;
    const now = ctx.currentTime;
    safe(() => g.cancelScheduledValues(now));
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(to, now + secs);
  }

  function startAux() {
    if (aux || !preset.tremolo) return;
    const trem = ctx.createGain();
    trem.gain.value = 1 - preset.tremolo.depth;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = preset.tremolo.rate;
    const depth = ctx.createGain();
    depth.gain.value = preset.tremolo.depth;
    lfo.connect(depth);
    depth.connect(trem.gain);
    trem.connect(bus);
    lfo.start();
    aux = { trem, lfo, depth };
  }

  function stopAux() {
    if (!aux) return;
    const a = aux;
    aux = null;
    safe(() => a.lfo.stop());
    for (const n of [a.lfo, a.depth, a.trem]) safe(() => n.disconnect());
  }

  function applyPreset() {
    preset = PRESETS[styleId] || PRESETS.flat;
    lp.frequency.setTargetAtTime(preset.cutoff, ctx.currentTime, 0.05);
    wet.gain.setTargetAtTime(preset.reverb, ctx.currentTime, 0.05);
    stopAux();
    startAux();
    step = 0;
    nextTime = ctx.currentTime + 0.05;
  }

  function start() {
    clearTimeout(stopTimer);
    stopTimer = null;
    playing = true;
    if (!timer) {
      applyPreset();
      timer = setInterval(tick, TICK_MS);
    }
    fadeBus(1, FADE_IN);
  }

  function stopFade() {
    playing = false;
    clearTimeout(switchTimer);
    switchTimer = null;
    switching = false;
    fadeBus(0, FADE_OUT);
    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => {
      stopTimer = null;
      clearInterval(timer);
      timer = null;
      stopAux();
    }, FADE_OUT * 1000 + 50);
  }

  function sync() {
    if (disposed) return;
    const want = wantsMusic();
    if (want && !playing) start();
    else if (!want && playing) stopFade();
  }

  function onVisibility() {
    if (disposed || !ctx) return;
    if (doc && doc.hidden) safe(() => ctx.suspend());
    else if (wantsMusic()) safe(() => ctx.resume());
  }

  if (doc && typeof doc.addEventListener === 'function') doc.addEventListener('visibilitychange', onVisibility);

  return {
    unlock() {
      if (disposed || !AudioCtx) return;
      ensureCtx();
      if (!ctx) return;
      if (ctx.state !== 'running') safe(() => ctx.resume());
      sync();
    },
    setStyle(id) {
      if (disposed) return;
      const next = PRESETS[id] ? id : 'flat';
      if (next === styleId) return;
      styleId = next;
      if (!playing || !ctx) {
        preset = PRESETS[styleId];
        return;
      }
      switching = true;
      fadeBus(0, SWITCH_OUT);
      clearTimeout(switchTimer);
      switchTimer = setTimeout(() => {
        switchTimer = null;
        applyPreset();
        switching = false;
        if (playing) fadeBus(1, SWITCH_IN);
      }, SWITCH_OUT * 1000 + 30);
    },
    setLevel(v, m) {
      if (disposed) return;
      vol = Math.max(0, Math.min(1, Number(v) || 0));
      muted = !!m;
      if (ctx) master.gain.setTargetAtTime(target(), ctx.currentTime, 0.05);
      sync();
    },
    setEnabled(on) {
      if (disposed) return;
      enabled = !!on;
      sync();
    },
    setIdle(kind) {
      if (disposed) return;
      idle = kind === 'pause' || kind === 'test' || kind === 'error' ? kind : null;
      sync();
    },
    isPlaying() {
      return !disposed && playing;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      playing = false;
      clearInterval(timer);
      clearTimeout(stopTimer);
      clearTimeout(switchTimer);
      timer = stopTimer = switchTimer = null;
      if (doc && typeof doc.removeEventListener === 'function') doc.removeEventListener('visibilitychange', onVisibility);
      if (ctx) {
        stopAux();
        for (const n of [bus, lp, ...tail, master]) safe(() => n.disconnect());
        safe(() => ctx.close());
        ctx = null;
      }
    },
  };
}
