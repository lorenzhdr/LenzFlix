// LENZ LIVE – Klickgeräusche der Gerätetasten und Drehknöpfe (synthetisch per Web Audio, keine Audiodateien).
// createSfx({ AudioCtx? }) → { click(kind), setLevel(vol, muted), dispose() }
//   kind: 'press' (kurzer Tastenklick) · 'detent' (Rastklick eines Knopfs) · 'power' (tieferes Klacken).
//   Der AudioContext entsteht lazy im ersten click() – das geschieht in der Nutzergeste (Klick/Zeigerereignis).
//   Pegel = vol · 0,35; stumm, Pegel 0, kein AudioContext oder jede Ausnahme → Stille. Kein Math.random (Rauschen aus fester Folge).
import { mulberry32 } from './music-presets.js';

const SCALE = 0.35;

const KINDS = {
  // noise: [highpass Hz, lowpass Hz, Dauer s, Gewicht]; tone: [von Hz, nach Hz, Dauer s, Gewicht]
  press: { noise: [2200, 9000, 0.03, 1], tone: [1700, 800, 0.025, 0.35] },
  detent: { noise: [3000, 8000, 0.014, 0.8], tone: [2600, 1900, 0.012, 0.25] },
  power: { noise: [200, 1800, 0.07, 0.8], tone: [150, 62, 0.09, 0.9] },
};

export function createSfx({ AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
  let ctx = null;
  let noiseBuf = null;
  let disposed = false;
  let vol = 1;
  let muted = false;
  let n = 0; // Zähler: jede Wiedergabe liest das Rauschen ab einer anderen, aber festen Stelle
  const level = () => (muted ? 0 : vol * SCALE);

  function ensure() {
    if (ctx || disposed || !AudioCtx) return ctx;
    try {
      ctx = new AudioCtx();
      const sr = ctx.sampleRate || 44100;
      const len = Math.floor(sr * 0.5);
      noiseBuf = ctx.createBuffer(1, len, sr);
      const d = noiseBuf.getChannelData(0);
      const rnd = mulberry32(0x7c3b1d);
      for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
    } catch {
      ctx = null;
      noiseBuf = null;
    }
    return ctx;
  }

  function play(kind, g) {
    const k = KINDS[kind] || KINDS.press;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = g;
    out.connect(ctx.destination);
    const dead = [out];
    // Rauschimpuls
    const [hp, lp, nd, nw] = k.noise;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f1 = ctx.createBiquadFilter();
    f1.type = 'highpass';
    f1.frequency.value = hp;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'lowpass';
    f2.frequency.value = lp;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(nw, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + nd);
    src.connect(f1);
    f1.connect(f2);
    f2.connect(ng);
    ng.connect(out);
    n = (n + 1) % 7;
    src.start(t, n * 0.05, nd + 0.01);
    dead.push(src, f1, f2, ng);
    // Tonanteil (Klack)
    const [f0, f9, td, tw] = k.tone;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f9, t + td);
    const og = ctx.createGain();
    og.gain.setValueAtTime(tw, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + td);
    osc.connect(og);
    og.connect(out);
    osc.start(t);
    osc.stop(t + td + 0.01);
    dead.push(osc, og);
    osc.onended = () => {
      for (const x of dead) {
        try { x.disconnect(); } catch { /* schon getrennt */ }
      }
    };
  }

  return {
    click(kind = 'press') {
      const g = level();
      if (disposed || g <= 0) return;
      try {
        if (!ensure()) return;
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
          const r = ctx.resume();
          if (r && typeof r.catch === 'function') r.catch(() => {});
        }
        play(kind, g);
      } catch {
        /* Audio-Fehler sind hier nie fatal */
      }
    },
    setLevel(v, m) {
      vol = Math.max(0, Math.min(1, Number(v) || 0));
      muted = !!m;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (ctx) {
        try {
          const r = ctx.close();
          if (r && typeof r.catch === 'function') r.catch(() => {});
        } catch { /* ignorieren */ }
        ctx = null;
      }
    },
  };
}
