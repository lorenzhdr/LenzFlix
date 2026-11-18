// VIDEOTHEK LENZ · M4 Ton: WebAudio-Synthese (Türglocke, Kassen-Piep, Schublade, Klack, Rollladen) und Ambiente
// (leise Lounge-Musik mit Lo-Fi-Beat, Leuchtstoffröhren-Brummen, bei Regen leises Rauschen). Standardmäßig an (ab v1.7.4).
// Provider 'sound' { play(name, opts), ambient(on), duck(key, on) }. Der AudioContext entsteht erst in einer Nutzergeste.

const MASTER = 0.9;
const BPM = 74;
const STEP = 60 / BPM / 2; // Achtel
const LOOKAHEAD = 1.4;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

// Akkorde (MIDI), je 2 Takte: Cmaj9 – Am9 – Fmaj7 – G6
const CHORDS = [
  [48, 55, 59, 64, 71], [45, 52, 55, 60, 67], [41, 48, 52, 57, 64], [43, 50, 55, 59, 64],
];
const PENTA = [72, 74, 76, 79, 81, 84];

export default {
  name: 'sound',
  init(ctx) {
    const Ctor = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
    let ac = null;
    let master = null;
    let fx = null;
    let musicBus = null;
    let musicFilter = null;
    let noiseBuf = null;
    let hum = null;
    let rain = null;
    let offWeather = null;
    let ambientWanted = false;
    const duckKeys = new Set(); // aktive Dämpfungs-Schlüssel: 'cinema' (stumm), 'tv' (stark), 'talk' (mittel)
    let ambientRunning = false;
    let suspended = false;
    let nextStep = 0;
    let stepIdx = 0;
    let lastFilterCheck = 0;
    let filterTarget = 2600;
    const gestureEvents = ['pointerdown', 'keydown', 'touchend'];

    const level = () => (ctx.soundOn() ? (duckKeys.has('cinema') ? 0 : duckKeys.has('tv') ? MASTER * 0.12 : duckKeys.has('talk') ? MASTER * 0.45 : MASTER) : 0);

    function buildGraph() {
      master = ac.createGain();
      master.gain.value = level();
      master.connect(ac.destination);
      // Pseudo-Hall: zwei Delays mit Rückkopplung, dumpf gefiltert
      fx = ac.createGain();
      const verbLp = ac.createBiquadFilter();
      verbLp.type = 'lowpass'; verbLp.frequency.value = 2400;
      const d1 = ac.createDelay(0.5); d1.delayTime.value = 0.113;
      const d2 = ac.createDelay(0.5); d2.delayTime.value = 0.177;
      const fb = ac.createGain(); fb.gain.value = 0.38;
      const wet = ac.createGain(); wet.gain.value = 0.35;
      fx.connect(d1); fx.connect(d2);
      d1.connect(verbLp); d2.connect(verbLp);
      verbLp.connect(fb); fb.connect(d1); fb.connect(d2);
      verbLp.connect(wet); wet.connect(master);
      musicFilter = ac.createBiquadFilter();
      musicFilter.type = 'lowpass'; musicFilter.frequency.value = filterTarget; musicFilter.Q.value = 0.5;
      musicBus = ac.createGain(); musicBus.gain.value = 0.17;
      musicBus.connect(musicFilter); musicFilter.connect(master);
      const n = Math.floor(ac.sampleRate * 2);
      noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
    }

    function unlock() {
      if (!Ctor || !ctx.soundOn()) return;
      try {
        if (!ac) { ac = new Ctor(); buildGraph(); }
        if (ac.state === 'suspended' && !suspended) ac.resume().then(onRunning, () => {});
        else onRunning();
      } catch { ac = null; }
    }
    function onRunning() {
      if (!ac || ac.state !== 'running') return;
      if (master) master.gain.setTargetAtTime(level(), ac.currentTime, 0.05);
      if (ambientWanted && !ambientRunning) startAmbient();
    }
    const onGesture = () => { if (ctx.soundOn()) unlock(); };
    for (const ev of gestureEvents) document.addEventListener(ev, onGesture, { capture: true, passive: true });

    const live = () => ac && ac.state === 'running' && ctx.soundOn() && !suspended;

    // --- Bausteine ---
    function env(g, t, a, d, peak) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    function tone(freq, t, dur, { type = 'sine', gain = 0.1, dest = master, send = 0, attack = 0.005, slide = 0 } = {}) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
      env(g, t, attack, dur, gain);
      o.connect(g); g.connect(dest);
      if (send) { const s = ac.createGain(); s.gain.value = send; g.connect(s); s.connect(fx); }
      o.start(t); o.stop(t + attack + dur + 0.05);
    }
    function noise(t, dur, { type = 'bandpass', freq = 1800, q = 1, gain = 0.1, dest = master, from = 0, loop = false } = {}) {
      const s = ac.createBufferSource();
      s.buffer = noiseBuf; s.loop = loop;
      const f = ac.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, dur / 2));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest);
      s.start(t, from); s.stop(t + dur + 0.02);
      return { f, g };
    }

    // --- Effekte ---
    const SFX = {
      doorbell(t) {
        // Dreiklang: Bell-Ton = Sinus + inharmonischer Oberton, mit Hall
        [[784, 0], [659, 0.42], [523, 0.86]].forEach(([f, d]) => {
          tone(f, t + d, 1.3, { gain: 0.16, send: 0.8, attack: 0.004 });
          tone(f * 2.76, t + d, 0.6, { gain: 0.04, send: 0.5, attack: 0.004 });
        });
      },
      alarm(t) { for (let i = 0; i < 6; i++) tone(i % 2 ? 1040 : 780, t + i * 0.13, 0.12, { type: 'square', gain: 0.045, attack: 0.003 }); },
      // Entdeckung: kleiner aufsteigender Glockenlauf
      discover(t) { [[784, 0], [988, 0.09], [1175, 0.18], [1568, 0.27]].forEach(([f, d]) => { tone(f, t + d, 0.5, { gain: 0.1, send: 0.7, attack: 0.004 }); tone(f * 2.01, t + d, 0.25, { gain: 0.03, send: 0.5, attack: 0.004 }); }); },
      beep(t) { tone(1760, t, 0.07, { type: 'square', gain: 0.035, attack: 0.002 }); },
      beep2(t) { tone(1320, t, 0.05, { type: 'square', gain: 0.03, attack: 0.002 }); tone(1760, t + 0.07, 0.07, { type: 'square', gain: 0.03, attack: 0.002 }); },
      drawer(t) {
        noise(t, 0.18, { freq: 500, q: 0.8, gain: 0.12 });
        tone(150, t, 0.16, { type: 'triangle', gain: 0.18, slide: 0.45 });
        tone(2300, t + 0.14, 0.5, { type: 'triangle', gain: 0.05, send: 0.5 });
        tone(3100, t + 0.15, 0.4, { type: 'sine', gain: 0.03, send: 0.5 });
      },
      clack(t) { noise(t, 0.035, { freq: 2200, q: 3, gain: 0.16 }); tone(240, t, 0.06, { type: 'triangle', gain: 0.12, slide: 0.6 }); },
      clack2(t) { noise(t, 0.04, { freq: 1500, q: 3, gain: 0.13 }); tone(170, t, 0.07, { type: 'triangle', gain: 0.13, slide: 0.6 }); },
      shutter(t, o) {
        const dur = o && o.dur ? o.dur : 2.2;
        const { f } = noise(t, dur, { freq: 480, q: 1.2, gain: 0.22, loop: true });
        f.frequency.setValueAtTime(420, t);
        f.frequency.linearRampToValueAtTime(900, t + dur);
        // Rasseln: Rechteck-LFO auf Zusatzlärm
        const r = noise(t, dur, { freq: 1700, q: 2, gain: 0.07, loop: true });
        const lfo = ac.createOscillator();
        const lg = ac.createGain();
        lfo.type = 'square'; lfo.frequency.value = 22;
        lg.gain.value = 0.05;
        lfo.connect(lg); lg.connect(r.g.gain);
        lfo.start(t); lfo.stop(t + dur + 0.05);
        tone(110, t + dur - 0.12, 0.22, { type: 'triangle', gain: 0.2, slide: 0.5 }); // Anschlag oben
      },
      // --- Physik (Welle 2, Paket physics) ---
      thud(t, o) { const k = o && o.k > 0 ? Math.min(1.6, o.k) : 1; noise(t, 0.09, { freq: 260, q: 1, gain: 0.2 * k }); tone(120, t, 0.12, { type: 'triangle', gain: 0.22 * k, slide: 0.5 }); },
      bounce(t, o) { const k = o && o.k > 0 ? Math.min(1.4, o.k) : 1; tone(190, t, 0.14, { type: 'sine', gain: 0.2 * k, slide: 0.6 }); noise(t, 0.03, { freq: 900, q: 2, gain: 0.05 * k }); },
      whoosh(t) { const { f } = noise(t, 0.22, { freq: 700, q: 0.9, gain: 0.1 }); f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.2); },
      swish(t) { noise(t, 0.3, { freq: 3200, q: 0.7, gain: 0.07 }); },
      cheer(t) { [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.07, 0.35, { type: 'triangle', gain: 0.1, send: 0.4, attack: 0.004 })); },
      clang(t) { tone(420, t, 0.5, { type: 'square', gain: 0.05, slide: 0.9, send: 0.5 }); tone(1130, t, 0.35, { type: 'sine', gain: 0.07, send: 0.5 }); noise(t, 0.05, { freq: 2500, q: 2, gain: 0.1 }); },
      // --- Welle 2 (npc): Straße und Tiere, alles synthetisch ---
      honk(t) { tone(330, t, 0.3, { type: 'sawtooth', gain: 0.07 }); tone(415, t, 0.3, { type: 'sawtooth', gain: 0.06 }); tone(330, t + 0.38, 0.22, { type: 'sawtooth', gain: 0.07 }); tone(415, t + 0.38, 0.22, { type: 'sawtooth', gain: 0.06 }); },
      purr(t) {
        const r = noise(t, 3.4, { type: 'lowpass', freq: 220, q: 1, gain: 0.09, loop: true });
        const lfo = ac.createOscillator();
        const lg = ac.createGain();
        lfo.type = 'sine'; lfo.frequency.value = 24;
        lg.gain.value = 0.06;
        lfo.connect(lg); lg.connect(r.g.gain);
        lfo.start(t); lfo.stop(t + 3.5);
      },
      meow(t) { tone(560, t, 0.42, { type: 'triangle', gain: 0.05, slide: 1.55, attack: 0.08 }); tone(880, t + 0.22, 0.3, { type: 'sine', gain: 0.035, slide: 0.55 }); },
      flap(t) { for (let i = 0; i < 6; i++) noise(t + i * 0.055, 0.045, { type: 'bandpass', freq: 800 + i * 140, q: 1.5, gain: 0.05 }); },
      oof(t) { tone(170, t, 0.14, { type: 'sine', gain: 0.14, slide: 0.5 }); noise(t, 0.05, { freq: 700, q: 1, gain: 0.09 }); },
      buy(t) { tone(988, t, 0.08, { type: 'square', gain: 0.045 }); tone(1319, t + 0.08, 0.22, { type: 'square', gain: 0.045 }); noise(t + 0.02, 0.04, { freq: 3000, q: 4, gain: 0.05 }); },
      munch(t) { noise(t, 0.07, { type: 'bandpass', freq: 1400, q: 2, gain: 0.11 }); tone(190, t, 0.06, { type: 'triangle', gain: 0.07, slide: 0.6 }); },
      // --- Figur (1.17.0): Fotoblitz, Stempel, Vorhang, Schere ---
      flash(t) { noise(t, 0.12, { type: 'highpass', freq: 5000, q: 0.7, gain: 0.16 }); tone(2600, t, 0.1, { type: 'sine', gain: 0.07, slide: 0.5 }); tone(180, t, 0.18, { type: 'triangle', gain: 0.05, slide: 0.4 }); },
      stamp(t) { noise(t, 0.06, { freq: 300, q: 1, gain: 0.22 }); tone(95, t, 0.16, { type: 'triangle', gain: 0.3, slide: 0.5 }); noise(t + 0.05, 0.05, { freq: 1800, q: 2, gain: 0.07 }); },
      curtain(t) {
        const { f } = noise(t, 0.5, { freq: 600, q: 0.8, gain: 0.1 });
        f.frequency.setValueAtTime(400, t);
        f.frequency.exponentialRampToValueAtTime(1600, t + 0.45);
        for (let i = 0; i < 4; i++) tone(3000 + i * 210, t + 0.05 + i * 0.09, 0.05, { type: 'sine', gain: 0.02 });
      },
      snip(t) { for (let k = 0; k < 2; k++) { noise(t + k * 0.09, 0.03, { type: 'highpass', freq: 4200, q: 2, gain: 0.12 }); tone(3600, t + k * 0.09, 0.04, { type: 'square', gain: 0.02 }); } },
      // --- Raufen (1.18.0): alles synthetisch, kurz und dezent ---
      slap(t) { noise(t, 0.05, { type: 'bandpass', freq: 1900, q: 1.2, gain: 0.2 }); noise(t + 0.004, 0.09, { type: 'highpass', freq: 3200, q: 0.7, gain: 0.08 }); tone(210, t, 0.07, { type: 'triangle', gain: 0.12, slide: 0.55 }); },
      belt(t) {
        noise(t, 0.07, { type: 'highpass', freq: 3600, q: 0.8, gain: 0.16 }); // Leder
        noise(t + 0.06, 0.05, { type: 'bandpass', freq: 1500, q: 2, gain: 0.18 }); // Schnalle
        tone(2400, t + 0.07, 0.1, { type: 'square', gain: 0.03, slide: 0.7 });
        tone(140, t + 0.06, 0.08, { type: 'triangle', gain: 0.12, slide: 0.6 });
      },
      whip(t) {
        const { f } = noise(t, 0.16, { type: 'bandpass', freq: 1200, q: 0.9, gain: 0.07 }); // Pfeifen im Schwung
        f.frequency.setValueAtTime(900, t);
        f.frequency.exponentialRampToValueAtTime(5200, t + 0.15);
        noise(t + 0.15, 0.06, { type: 'highpass', freq: 2500, q: 0.8, gain: 0.26 }); // Knall
        tone(1700, t + 0.15, 0.05, { type: 'square', gain: 0.05, slide: 0.4 });
      },
      laser(t, o) {
        const dur = o && o.dur > 0 ? Math.min(4, o.dur) : 0.7;
        tone(118, t, dur, { type: 'sawtooth', gain: 0.025, attack: 0.04 });
        tone(236, t, dur, { type: 'sine', gain: 0.02, attack: 0.04 });
      },
      ouch(t) {
        // stimmlos: gehauchtes „au“ aus zwei wandernden Rauschbändern
        const a = noise(t, 0.26, { type: 'bandpass', freq: 800, q: 4, gain: 0.16 });
        a.f.frequency.setValueAtTime(800, t);
        a.f.frequency.exponentialRampToValueAtTime(420, t + 0.24);
        const b = noise(t, 0.26, { type: 'bandpass', freq: 1500, q: 5, gain: 0.08 });
        b.f.frequency.setValueAtTime(1500, t);
        b.f.frequency.exponentialRampToValueAtTime(900, t + 0.24);
      },
      candy(t) { for (let i = 0; i < 4; i++) { const d = i * 0.06 + (i % 2) * 0.015; noise(t + d, 0.025, { freq: 3400 - i * 300, q: 4, gain: 0.1 }); tone(2100 + i * 230, t + d, 0.04, { type: 'triangle', gain: 0.04 }); } },
      pop(t) { tone(420, t, 0.07, { type: 'sine', gain: 0.16, slide: 0.35 }); noise(t, 0.04, { type: 'highpass', freq: 2200, q: 0.8, gain: 0.12 }); noise(t + 0.05, 0.03, { freq: 1600, q: 3, gain: 0.05 }); },
      ko(t) {
        noise(t, 0.16, { freq: 240, q: 1, gain: 0.26 });
        tone(85, t, 0.28, { type: 'triangle', gain: 0.32, slide: 0.45 });
        for (let i = 0; i < 4; i++) { // Vogelgezwitscher
          const s = t + 0.5 + i * 0.16;
          tone(2400 + (i % 2) * 500, s, 0.09, { type: 'sine', gain: 0.03, slide: 1.35, send: 0.3 });
          tone(3100, s + 0.07, 0.05, { type: 'sine', gain: 0.02, slide: 0.8 });
        }
      },
    };

    function play(name, opts) {
      if (!live()) return;
      const fn = SFX[name];
      if (!fn) return;
      try { fn(ac.currentTime + 0.01, opts); } catch { /* Ton ist optional */ }
    }

    // Laserpointer-Summen als Schleife (solange gehalten); laserLoop(true|false)
    let laserNodes = null;
    function laserLoop(on) {
      if (!on) {
        const n = laserNodes;
        laserNodes = null;
        if (n) { try { n.g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.04); setTimeout(() => { try { n.o1.stop(); n.o2.stop(); } catch { /* egal */ } }, 250); } catch { /* egal */ } }
        return;
      }
      if (laserNodes || !live()) return;
      try {
        const g = ac.createGain();
        g.gain.value = 0.0001;
        g.gain.setTargetAtTime(0.022, ac.currentTime, 0.05);
        const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 118;
        const o2 = ac.createOscillator(); o2.type = 'sine'; o2.frequency.value = 237;
        o1.connect(g); o2.connect(g); g.connect(master);
        o1.start(); o2.start();
        laserNodes = { g, o1, o2 };
      } catch { laserNodes = null; }
    }

    // --- Ambiente ---
    function startHum() {
      if (hum) return;
      const g = ac.createGain();
      g.gain.value = 0.0001;
      g.gain.setTargetAtTime(0.011, ac.currentTime, 0.8);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 100;
      const o2 = ac.createOscillator(); o2.type = 'sine'; o2.frequency.value = 200;
      o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master);
      o1.start(); o2.start();
      hum = { g, o1, o2 };
    }
    /** Regenton gewollt? Nur bei Regen (nicht Schnee); Lautstärke nach Intensität (weather.precip.i, Regen 0,6 = 0,015). */
    function rainWanted() {
      const w = ctx.use('weather');
      if (!w || !w.raining) return 0;
      const p = w.precip;
      if (p && p.kind === 'snow') return 0;
      const i = p && p.kind === 'rain' && Number.isFinite(p.i) ? Math.min(1, Math.max(0, p.i)) : 0.6;
      return i > 0 ? 0.025 * i : 0;
    }
    /** Regenton zur Laufzeit an/aus/lauter/leiser (weather.onChange). */
    function syncRain() {
      if (!ac || !ambientRunning) return;
      const gain = rainWanted();
      if (gain > 0 && !rain) startRain();
      else if (gain > 0 && rain) { try { rain.g.gain.setTargetAtTime(gain, ac.currentTime, 1.2); } catch { /* egal */ } }
      else if (gain === 0 && rain) { stopNodes(rain, (n) => n.s.stop(), 0.3, 1800); rain = null; } // weich ausblenden (e^-6 ≈ 0,25 %), dann erst stoppen
    }
    function startRain() {
      const gain = rainWanted();
      if (rain || !gain) return;
      const s = ac.createBufferSource();
      s.buffer = noiseBuf; s.loop = true;
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; // v1.7.5: weicher und halb so laut
      const g = ac.createGain(); g.gain.value = 0.0001;
      g.gain.setTargetAtTime(gain, ac.currentTime, 1.2);
      s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master);
      s.start();
      rain = { s, g };
    }
    function stopNodes(n, stopFn, tc = 0.2, delay = 900) {
      if (!n) return;
      try { n.g.gain.setTargetAtTime(0.0001, ac.currentTime, tc); setTimeout(() => { try { stopFn(n); } catch { /* egal */ } }, delay); } catch { /* egal */ }
    }
    function startAmbient() {
      if (!ac || ambientRunning) return;
      ambientRunning = true;
      nextStep = ac.currentTime + 0.2;
      stepIdx = 0;
      startHum();
      startRain();
      if (!offWeather) { const w = ctx.use('weather'); if (w && typeof w.onChange === 'function') offWeather = w.onChange(syncRain); }
    }
    function stopAmbient() {
      ambientRunning = false;
      if (offWeather) { offWeather(); offWeather = null; }
      stopNodes(hum, (n) => { n.o1.stop(); n.o2.stop(); });
      hum = null;
      stopNodes(rain, (n) => n.s.stop());
      rain = null;
    }

    function pad(notes, t, dur) {
      for (const m of notes) {
        for (const det of [-6, 6]) {
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.type = 'triangle'; o.frequency.value = mtof(m); o.detune.value = det;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.045, t + 2);
          g.gain.setValueAtTime(0.045, t + dur - 0.5);
          g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.8);
          o.connect(g); g.connect(musicBus);
          o.start(t); o.stop(t + dur + 2);
        }
      }
    }
    function schedule(upTo) {
      // Nach verstecktem Tab nicht alle verpassten Schritte auf einmal einplanen: aufholen statt abspielen.
      const lag = ac.currentTime - nextStep;
      if (lag > STEP) { const k = Math.ceil(lag / STEP); nextStep += k * STEP; stepIdx += k; }
      while (nextStep < upTo) {
        const t = nextStep;
        const barStep = stepIdx % 8;
        const bar = Math.floor(stepIdx / 8);
        const swing = barStep % 2 ? STEP * 0.12 : 0;
        if (barStep === 0 && bar % 2 === 0) pad(CHORDS[(bar / 2) % CHORDS.length], t, STEP * 16);
        // Lo-Fi-Beat, leise
        if (barStep === 0 || barStep === 5) tone(120, t + swing, 0.22, { type: 'sine', gain: 0.55, dest: musicBus, slide: 0.4 });
        if (barStep === 2 || barStep === 6) noise(t + swing, 0.12, { freq: 1700, q: 0.8, gain: 0.2, dest: musicBus });
        noise(t + swing, 0.03, { type: 'highpass', freq: 7000, q: 0.5, gain: barStep % 2 ? 0.05 : 0.09, dest: musicBus });
        // sparsame Pentatonik-Töne (E-Piano-artig)
        if (barStep % 2 === 0 && Math.random() < 0.3) {
          const n = PENTA[Math.floor(Math.random() * PENTA.length)];
          tone(mtof(n), t + swing, 1.1, { gain: 0.16, dest: musicBus, send: 0.6, attack: 0.01 });
        }
        nextStep += STEP;
        stepIdx++;
      }
    }

    function zoneFilterTarget() {
      const p = ctx.player.getPose();
      const L = ctx.layout;
      const inR = (r) => r && p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;
      if (inR(L.adultRoom)) return 700; // dumpfer, wie hinter dem Vorhang
      if (inR(L.kidsRoom)) return 5200; // heller, verspielter
      return 2600;
    }

    const offs = [
      ctx.on('take', () => play('clack')),
      ctx.on('put', () => play('clack2')),
      ctx.on('enter', () => { ambientWanted = true; if (ctx.soundOn()) unlock(); if (ac && ac.state === 'running') startAmbient(); }),
    ];

    if (ctx.opts.debug) window.__lfxM4 = { ...window.__lfxM4, sound: () => ({ state: ac && ac.state, ambient: ambientRunning, wanted: ambientWanted, hum: !!hum, rain: !!rain, step: stepIdx }) };

    ctx.provide('sound', {
      play,
      /** Laser-Summen als Schleife an/aus (1.18.0). */
      laser(on) { laserLoop(!!on); },
      /** Donner (1.19.0): gefiltertes Rauschen, `delay` s nach jetzt (0,5 … 4), Lautstärke gain 0..1 (nach Abstand). Nur bei eingeschaltetem Ton; sonst still. */
      thunder(delay, gain = 1) {
        if (!live() || !noiseBuf) return false;
        const g = Math.min(1, Math.max(0.05, gain));
        const t = ac.currentTime + Math.min(6, Math.max(0, delay || 0));
        noise(t, 0.35, { type: 'bandpass', freq: 700, q: 0.6, gain: 0.06 * g });
        noise(t + 0.02, 2.4 + g, { type: 'lowpass', freq: 190, q: 0.7, gain: 0.3 * g });
        noise(t + 0.6, 1.6, { type: 'lowpass', freq: 120, q: 0.7, gain: 0.18 * g });
        return true;
      },
      /** Audio freischalten (Nutzergeste, z. B. Klick auf „In VR betreten“). */
      unlock() { unlock(); },
      /** Ambiente/Effekte dämpfen (z. B. beim Fernsehen auf der Couch). */
      duck(key, on) {
        if (arguments.length < 2) { on = key; key = 'tv'; } // abwärtskompatibel: duck(bool)
        if (on) duckKeys.add(String(key)); else duckKeys.delete(String(key));
        if (ac && master) master.gain.setTargetAtTime(level(), ac.currentTime, 0.25);
      },
      ambient(on) {
        ambientWanted = !!on;
        if (on && ctx.soundOn()) { unlock(); if (ac && ac.state === 'running') startAmbient(); }
        if (!on && ac) stopAmbient();
      },
    });

    return {
      update(dt, t) {
        if (!ac || ac.state !== 'running' || suspended) return;
        if (ambientRunning && ctx.soundOn()) {
          schedule(ac.currentTime + LOOKAHEAD);
          if (t - lastFilterCheck > 0.6) {
            lastFilterCheck = t;
            const ft = zoneFilterTarget();
            if (ft !== filterTarget) { filterTarget = ft; musicFilter.frequency.setTargetAtTime(ft, ac.currentTime, 0.7); }
          }
        }
      },
      onSound(on) {
        if (!on) {
          if (ac && master) master.gain.setTargetAtTime(0, ac.currentTime, 0.05);
          if (ac) { stopAmbient(); laserLoop(false); }
          return;
        }
        unlock();
        if (ac && master) master.gain.setTargetAtTime(level(), ac.currentTime, 0.05);
        if (ambientWanted && ac && ac.state === 'running') startAmbient();
      },
      onSuspend() {
        suspended = true;
        if (ac) { stopAmbient(); laserLoop(false); try { ac.suspend(); } catch { /* egal */ } }
      },
      onResume() {
        suspended = false;
        if (ac && ctx.soundOn()) { try { ac.resume().then(onRunning, () => {}); } catch { /* egal */ } }
      },
      dispose() {
        for (const ev of gestureEvents) document.removeEventListener(ev, onGesture, { capture: true });
        offs.forEach((o) => o());
        ambientRunning = false;
        if (offWeather) { offWeather(); offWeather = null; }
        if (ac) laserLoop(false);
        if (ac) { try { ac.close(); } catch { /* egal */ } }
        ac = null; master = null; hum = null; rain = null;
        if (window.__lfxM4) delete window.__lfxM4.sound;
      },
    };
  },
};
