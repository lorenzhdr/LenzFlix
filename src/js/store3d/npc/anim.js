// VIDEOTHEK LENZ · NPC-Animation (rein, ohne three/DOM): Gangzyklus, Posen, Übergänge, Netzformat der Figuren.
// Ein Animator hält { anim, phase, age, speed, pose }. step(dt) rechnet die Zielpose der aktiven Animation und glättet die
// Pose exponentiell dorthin (weiche Übergänge). Einmal-Animationen (hit, throw, stagger) fallen nach ihrer Dauer auf `then` zurück.
// Winkel in rad. Konvention der Pose (die Figur setzt sie auf die Gelenke):
//   armLx/armRx  >0 = Arm schwingt nach vorn (−z der Figur) · armLz/armRz >0 = Arm hebt sich seitlich nach außen
//   legLx/legRx  >0 = Bein nach vorn · lean >0 = Oberkörper nach vorn · roll = Neigung zur Seite · hipDrop = Hüfte tiefer (m)
//   bob = Hüfte hoch/runter (m) · headX >0 = Kopf nickt nach unten · headY = Kopf dreht nach links (+)

export const ANIMS = ['idle', 'walk', 'run', 'sit', 'wave', 'hit', 'throw', 'stagger', 'point', 'cheer'];
/** Codes für das Netzformat (Index in ANIMS, stabil halten). */
export const ANIM_CODE = Object.fromEntries(ANIMS.map((n, i) => [n, i]));
/** Einmal-Animationen: Dauer in s, danach `idle`. */
export const ONE_SHOT = { hit: 0.45, throw: 0.6, stagger: 1.0 };
/** Zeitbegrenzte Dauer-Animationen (kehren nach der Zeit zu idle zurück): wave, point, cheer. */
const TIMED = { wave: 2.4, point: 2.2, cheer: 2.6 };
export const POSE_KEYS = ['bob', 'hipDrop', 'lean', 'roll', 'headX', 'headY', 'armLx', 'armLz', 'armRx', 'armRz', 'legLx', 'legRx'];
const NET_VERSION = 1;
const TAU = Math.PI * 2;
const MAX_RATE = 18;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

function zeroPose() {
  const p = {};
  for (const k of POSE_KEYS) p[k] = 0;
  return p;
}

/** Gangfrequenz (rad/s) aus Geschwindigkeit (m/s): ein Doppelschritt ≈ 1,5 m. */
export function gaitRate(speed) {
  return Math.min(MAX_RATE, clamp((Number(speed) || 0) / 1.5, 0, 4) * TAU);
}

/**
 * Zielpose einer Animation (rein). phase = Gangphase in rad (läuft mit gaitRate), age = Sekunden seit Start,
 * dur = Dauer der Einmal-Animation.
 */
export function targetPose(anim, phase, age, dur = 1) {
  const p = zeroPose();
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const k = clamp(age / Math.max(0.01, dur), 0, 1);
  switch (anim) {
    case 'walk':
    case 'run': {
      const run = anim === 'run';
      const amp = run ? 0.95 : 0.55;
      const arm = run ? 1.0 : 0.5;
      p.legLx = s * amp; p.legRx = -s * amp;
      p.armLx = -s * arm; p.armRx = s * arm;
      p.bob = Math.abs(c) * (run ? 0.06 : 0.028);
      p.lean = run ? 0.28 : 0.06;
      p.roll = s * (run ? 0.04 : 0.025);
      if (run) { p.armLz = 0.12; p.armRz = 0.12; }
      break;
    }
    case 'sit':
      p.hipDrop = 0.33; p.legLx = 1.5; p.legRx = 1.5; p.armLx = 0.5; p.armRx = 0.5; p.lean = -0.04;
      p.headY = Math.sin(age * 0.6) * 0.12;
      break;
    case 'wave':
      p.armRz = 2.7 + Math.sin(age * 9) * 0.32; p.armRx = 0.1; p.headY = -0.12 + Math.sin(age * 1.4) * 0.05;
      p.bob = Math.sin(age * 1.8) * 0.004;
      break;
    case 'hit': {
      const e = Math.sin(k * Math.PI);
      p.armRx = 1.75 * e; p.armLx = -0.5 * e; p.lean = 0.3 * e; p.headX = 0.1 * e;
      break;
    }
    case 'throw': {
      // Ausholen (erste 45 %): Arm nach hinten/oben, dann schnell nach vorn
      const wind = clamp(k / 0.45, 0, 1);
      p.armRx = k < 0.45 ? -2.5 * wind : Math.min(1.6, -2.5 + ((k - 0.45) / 0.2) * 4.1);
      p.armRz = 0.3; p.lean = k < 0.45 ? -0.2 * wind : 0.35 * (1 - k); p.armLx = 0.5;
      break;
    }
    case 'stagger': {
      const w = Math.sin(age * 14) * (1 - k);
      p.roll = w * 0.22; p.lean = -0.3 * (1 - k * 0.6); p.armLz = 0.9 + w * 0.5; p.armRz = 0.9 - w * 0.5;
      p.legLx = w * 0.5; p.legRx = -w * 0.5; p.headX = -0.2; p.bob = Math.abs(w) * 0.03;
      break;
    }
    case 'point':
      p.armRx = 1.55; p.armRz = 0.05; p.headY = 0.1; p.lean = 0.04;
      break;
    case 'cheer': {
      const j = Math.abs(Math.sin(age * 8));
      p.armLz = 2.75 + Math.sin(age * 11) * 0.2; p.armRz = 2.75 - Math.sin(age * 11) * 0.2;
      p.bob = j * 0.09; p.legLx = 0.18 * j; p.legRx = -0.18 * j; p.headX = -0.15;
      break;
    }
    default: { // idle: atmen, leichtes Schwanken, Kopf schaut sich um
      p.bob = Math.sin(age * 1.9) * 0.004;
      p.armLx = Math.sin(age * 1.3) * 0.04; p.armRx = -Math.sin(age * 1.3) * 0.04;
      p.armLz = 0.05; p.armRz = 0.05;
      p.headY = Math.sin(age * 0.45 + 1.3) * 0.28; p.headX = Math.sin(age * 0.31) * 0.04;
      p.roll = Math.sin(age * 0.7) * 0.012;
    }
  }
  return p;
}

export class Animator {
  constructor(initial = 'idle') {
    this.anim = ANIMS.includes(initial) ? initial : 'idle';
    this.phase = 0;
    this.age = 0;
    this.speed = 0;
    this.then = 'idle';
    this.pose = targetPose(this.anim, 0, 0, 1);
    this.dur = this.durationOf(this.anim);
    this.sharpness = 14;
  }

  durationOf(name) { return ONE_SHOT[name] || TIMED[name] || 0; }

  /** Animation setzen. Gleiche Animation nur bei opts.restart neu starten; speed = m/s (walk/run). */
  setAnim(name, opts = {}) {
    if (!ANIMS.includes(name)) return false;
    if (typeof opts.speed === 'number' && Number.isFinite(opts.speed)) this.speed = Math.max(0, opts.speed);
    if (name === this.anim && !opts.restart) return true;
    this.anim = name;
    this.age = 0;
    this.dur = this.durationOf(name);
    this.then = opts.then && ANIMS.includes(opts.then) ? opts.then : 'idle';
    return true;
  }

  /** true, solange eine Einmal-Animation läuft. */
  busy() { return !!ONE_SHOT[this.anim]; }

  step(dt) {
    if (!(dt > 0)) return this.pose;
    this.age += dt;
    if (this.dur && this.age >= this.dur) this.setAnim(this.then, { restart: true });
    if (this.anim === 'walk' || this.anim === 'run') this.phase = (this.phase + gaitRate(this.speed) * dt) % TAU;
    const tgt = targetPose(this.anim, this.phase, this.age, this.dur || 1);
    const a = 1 - Math.exp(-this.sharpness * dt);
    for (const k of POSE_KEYS) this.pose[k] += (tgt[k] - this.pose[k]) * a;
    return this.pose;
  }

  /** Netzformat { v, a: Code, p: Phase 0..1, s: Tempo m/s, t: Alter der Animation s }. */
  getNetState() {
    return { v: NET_VERSION, a: ANIM_CODE[this.anim], p: r3(this.phase / TAU), s: r2(this.speed), t: r2(this.age) };
  }

  /** Fremden Zustand übernehmen (ungültige Eingaben werden ignoriert). Rückgabe: true bei Erfolg. */
  applyNetState(n) {
    if (!n || n.v !== NET_VERSION || !Number.isInteger(n.a) || n.a < 0 || n.a >= ANIMS.length) return false;
    const name = ANIMS[n.a];
    const changed = name !== this.anim;
    if (changed) this.setAnim(name, { restart: true });
    this.speed = Number.isFinite(n.s) ? clamp(n.s, 0, 12) : 0;
    if (Number.isFinite(n.p)) this.phase = (((n.p % 1) + 1) % 1) * TAU;
    if (changed && Number.isFinite(n.t)) this.age = Math.max(0, n.t);
    return true;
  }
}
