// LENZ LIVE – Pausenmusik: Presets als reine Daten (eigene Komposition, keine fremden Melodien).
// Ein Preset = Tempo + Akkordfolge (ein Akkord pro Takt, Schleife) + Ebenen mit 16-Schritt-Mustern.
// Schritt = Sechzehntel. Akkordwurzeln liegen in der Basslage (MIDI 36–47).
//
// Muster-Bedeutung je Ebene:
//   arp / vibes : Tonindex im (oktavierten) Akkord, -1 = Pause
//   bass        : 1 = Grundton, 3 = Terz, 5 = Quinte, 8 = Oktave, 0 = Pause
//   pad / epiano / kick / snare / hat / brush : Anschlagstärke 0..1

export const QUALITIES = {
  maj: [0, 4, 7],
  m: [0, 3, 7],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  7: [0, 4, 7, 10],
  m7b5: [0, 3, 6, 10],
};

// Reiner Seed-PRNG (kein Systemzufall): Hall-Impuls und Rauschpuffer.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function midiToHz(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// Tonindex i im Akkord (über die Oktave hinaus fortgesetzt) als MIDI-Note.
export function chordTone(chord, i, octShift = 0) {
  const iv = QUALITIES[chord.q] || QUALITIES.maj;
  const n = iv.length;
  const oct = Math.floor(i / n);
  return chord.r + octShift + iv[((i % n) + n) % n] + 12 * oct;
}

export function loopBars(preset) {
  return preset.chords.length;
}

const c = (r, q) => ({ r, q });
const R = { C: 36, D: 38, E: 40, F: 41, G: 43, A: 45, B: 47 };

// Synth-Pop 80er: a-Moll-Schleife, weiche Arpeggien, Flächen, gated Snare.
const crt80 = {
  id: 'crt80',
  bpm: 100,
  swing: 0,
  cutoff: 3200,
  reverb: 0.22,
  chords: [
    c(R.A, 'm'), c(R.F, 'maj'), c(R.C, 'maj'), c(R.G, 'maj'),
    c(R.A, 'm'), c(R.F, 'maj'), c(R.C, 'maj'), c(R.G, 'maj'),
    c(R.F, 'maj'), c(R.C, 'maj'), c(R.D, 'm'), c(R.A, 'm'),
    c(R.F, 'maj'), c(R.G, 'maj'), c(R.E, 'm'), c(R.A, 'm'),
  ],
  layers: [
    { k: 'pad', oct: 12, vol: 0.06, wave: 'sawtooth', detune: 9, cutoff: 1300, attack: 0.7, voices: [0, 1, 2], pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], len: 16 },
    { k: 'arp', oct: 24, vol: 0.045, wave: 'square', cutoff: 2100, len: 1.7, pattern: [0, -1, 1, -1, 2, -1, 1, -1, 3, -1, 2, -1, 1, -1, 2, -1] },
    { k: 'bass', oct: 0, vol: 0.15, wave: 'sawtooth', cutoff: 480, len: 1.8, pattern: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 8, 0] },
    { k: 'snare', vol: 0.05, pattern: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0] },
  ],
};

// Lounge 2000er: Dur-Schleife mit Septakkorden, E-Piano (2-Op-FM), weicher Beat.
const silver = {
  id: 'silver',
  bpm: 88,
  swing: 0.1,
  cutoff: 4200,
  reverb: 0.3,
  chords: [
    c(R.C, 'maj7'), c(R.A, 'm7'), c(R.D, 'm7'), c(R.G, '7'),
    c(R.E, 'm7'), c(R.A, '7'), c(R.D, 'm7'), c(R.G, '7'),
    c(R.C, 'maj7'), c(R.A, 'm7'), c(R.F, 'maj7'), c(R.B, 'm7b5'),
    c(R.E, '7'), c(R.A, 'm7'), c(R.D, 'm7'), c(R.G, '7'),
  ],
  layers: [
    { k: 'epiano', oct: 24, vol: 0.06, ratio: 1, index: 1.6, len: 4, voicing: [1, 2, 3, 4], strum: 0.014, pattern: [1, 0, 0, 0, 0, 0, 0.7, 0, 0, 0, 0.8, 0, 0, 0, 0, 0] },
    { k: 'bass', oct: 0, vol: 0.2, wave: 'sine', cutoff: 600, len: 2.4, pattern: [1, 0, 0, 0, 0, 0, 5, 0, 0, 0, 1, 0, 0, 0, 0, 0] },
    { k: 'kick', vol: 0.2, pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0] },
    { k: 'hat', vol: 0.025, pattern: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0.5] },
  ],
};

// Bossa-Fahrstuhlmusik: ii–V–I–vi, E-Piano im Bossa-Rhythmus, Besen.
const flat = {
  id: 'flat',
  bpm: 108,
  swing: 0,
  cutoff: 3800,
  reverb: 0.26,
  chords: [
    c(R.D, 'm7'), c(R.G, '7'), c(R.C, 'maj7'), c(R.A, 'm7'),
    c(R.D, 'm7'), c(R.G, '7'), c(R.C, 'maj7'), c(R.A, 'm7'),
    c(R.E, 'm7'), c(R.A, '7'), c(R.D, 'm7'), c(R.G, '7'),
    c(R.C, 'maj7'), c(R.A, '7'), c(R.D, 'm7'), c(R.G, '7'),
  ],
  layers: [
    { k: 'epiano', oct: 24, vol: 0.06, ratio: 1, index: 1.3, len: 2.4, voicing: [1, 2, 3, 4], strum: 0.012, pattern: [1, 0, 0, 0.8, 0, 0, 0.9, 0, 0, 0, 0.8, 0, 0, 0.7, 0, 0] },
    { k: 'bass', oct: 0, vol: 0.2, wave: 'sine', cutoff: 600, len: 3, pattern: [1, 0, 0, 0, 0, 0, 5, 0, 1, 0, 0, 0, 0, 0, 5, 0] },
    { k: 'brush', vol: 0.03, pattern: [1, 0, 0.4, 0, 0.7, 0, 0.4, 0, 1, 0, 0.4, 0, 0.7, 0, 0.4, 0] },
  ],
};

// Ruhiges Vibraphon mit Kontrabass, Tremolo.
const plain = {
  id: 'plain',
  bpm: 72,
  swing: 0,
  cutoff: 3000,
  reverb: 0.34,
  tremolo: { rate: 5.2, depth: 0.28 },
  chords: [
    c(R.C, 'maj7'), c(R.A, 'm7'), c(R.F, 'maj7'), c(R.G, '7'),
    c(R.C, 'maj7'), c(R.E, 'm7'), c(R.A, 'm7'), c(R.D, 'm7'),
    c(R.F, 'maj7'), c(R.E, 'm7'), c(R.D, 'm7'), c(R.G, '7'),
    c(R.C, 'maj7'), c(R.A, 'm7'), c(R.D, 'm7'), c(R.G, '7'),
  ],
  layers: [
    { k: 'vibes', oct: 36, vol: 0.07, len: 6, pattern: [3, -1, -1, -1, 2, -1, 4, -1, -1, -1, 1, -1, 2, -1, -1, -1] },
    { k: 'upright', oct: 0, vol: 0.2, len: 4, pattern: [1, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 3, 0] },
  ],
};

export const PRESETS = { crt80, silver, flat, plain };
