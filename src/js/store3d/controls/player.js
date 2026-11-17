// VIDEOTHEK LENZ · Spielerzustand: Position, Blick, weiche Beschleunigung, Kollision mit Höhen, Sprung, Pfadfolge (Touch).
// Physik und Netzzustand liegen im geteilten Körper (controls/body.js); der Player ergänzt Blick, Pfad und Kamera-Effekte.
import { Body } from './body.js';
import { angDiff } from '../modules/m4-util.js';

export const EYE = 1.65;
const WALK = 2.2;
const RUN = 4.0;
const PITCH_MAX = 1.25;
const DIP_MIN = -0.12;


export class Player extends Body {
  /**
   * @param {object} layout { colliders, spawn, cidx?, dyn? } (mit cidx: Raster-Hash + dynamische Kollider)
   * @param {{ reducedMotion?: () => boolean }} [opts] reducedMotion wahr: kein Kamera-Wackeln, kein Landungs-Wippen (Stöße bleiben)
   */
  constructor(layout, opts = {}) {
    const src = layout.cidx ? { index: layout.cidx, dyn: layout.dyn } : layout.colliders;
    super({ src, x: layout.spawn.x, z: layout.spawn.z, yaw: layout.spawn.yaw, spawn: layout.spawn });
    this.rects = layout.colliders;
    this.reducedMotion = (opts && opts.reducedMotion) || (() => false);
    this.path = null;
    this.onArrive = null;
    this.turnTo = null; // { yaw, pitch } sanft einnehmen
    this.tp = 0; // Zähler für Teleports (VR-Rig setzt sich bei Änderung neu)
    this.moved = 0; // Zähler für "bewegt sich" (State-Drosselung)
    this.lastLook = 0;
  }

  /** Teleport; y fehlt = 0. Danach steht der Spieler auf dem Boden unter y (settle). */
  teleport(x, z, yaw = this.yaw, pitch = 0, y) {
    this.yaw = yaw; this.pitch = pitch;
    this.place(x, z, y === undefined ? 0 : y);
    this.cancelPath();
    this.turnTo = null;
    this.tp++;
    this.moved++;
  }

  respawn() {
    const s = this.lastSafe;
    this.teleport(s.x, s.z, this.yaw, this.pitch, s.y);
  }

  look(dyaw, dpitch) {
    this.yaw += dyaw;
    this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch + dpitch));
    this.turnTo = null;
    this.lastLook = performance.now();
    this.moved++;
  }

  walkTo(points, onArrive) {
    this.path = points && points.length ? points.slice() : null;
    this.onArrive = onArrive || null;
    if (!this.path && onArrive) { this.onArrive = null; onArrive(); }
  }

  cancelPath() { this.path = null; this.onArrive = null; }

  /** Pfad aufgeben und den Rückruf mit false benachrichtigen (Sprung, Stoß, Hochziehen). */
  abortPath() {
    if (!this.path && !this.onArrive) return;
    const cb = this.onArrive;
    this.path = null;
    this.onArrive = null;
    if (cb) cb(false);
  }

  get walking() { return !!this.path; }

  faceYaw(yaw, pitch = 0.05) { this.turnTo = { yaw, pitch }; }

  land(impact) {
    if (impact > 3 && !this.reducedMotion()) this.landDipV = -Math.min(1.2, impact * 0.09);
    super.land(impact);
  }

  /** input: { fwd, strafe } in -1..1, run: bool, scale 0..1 (Standard 1). Bewegung relativ zum Blick. input null = nur Physik/Pfad. */
  update(dt, input) {
    const it = this.intent;
    it.tx = 0; it.tz = 0; it.manual = false; it.path = false; it.dirx = 0; it.dirz = 0;
    let speed = (input && input.run ? RUN : WALK) * (input && Number.isFinite(input.scale) ? Math.max(0, Math.min(1, input.scale)) : 1);
    const manual = input && (input.fwd || input.strafe);
    if (manual) {
      this.cancelPath();
      const f = input.fwd || 0;
      const s = input.strafe || 0;
      const len = Math.hypot(f, s) || 1;
      const sy = Math.sin(this.yaw);
      const cy = Math.cos(this.yaw);
      // vorwärts = (-sin, -cos), rechts = (cos, -sin)
      it.dirx = (-sy * f + cy * s) / len;
      it.dirz = (-cy * f - sy * s) / len;
      it.tx = it.dirx * speed;
      it.tz = it.dirz * speed;
      it.manual = true;
    } else if (this.path) {
      it.path = true;
      if (this.grounded) {
        const p = this.path[0];
        const dx = p.x - this.x;
        const dz = p.z - this.z;
        const d = Math.hypot(dx, dz);
        const last = this.path.length === 1;
        if (d < (last ? 0.08 : 0.2)) {
          this.path.shift();
          if (!this.path.length) {
            this.path = null;
            it.path = false;
            const cb = this.onArrive;
            this.onArrive = null;
            this.vx = 0; this.vz = 0;
            if (cb) cb();
          }
        } else {
          speed = 2.0;
          const slow = last ? Math.min(1, d / 0.6 + 0.25) : 1;
          it.tx = (dx / d) * speed * slow;
          it.tz = (dz / d) * speed * slow;
          // Blick sanft in Laufrichtung drehen
          const want = Math.atan2(-dx, -dz);
          const diff = angDiff(this.yaw, want);
          this.yaw += Math.max(-3 * dt, Math.min(3 * dt, diff));
          this.pitch += (0 - this.pitch) * Math.min(1, dt * 2);
        }
      }
    }
    const y0 = this.y;
    const res = this.step(dt, it);
    if (this.vx || this.vz || this.y !== y0) this.moved++;
    if (res.hit && it.path && this.path) {
      // Zwischenpunkt blockiert (z. B. Kante): Pfad aufgeben
      this.abortPath();
    }
    if (this.turnTo && !manual) {
      const t = this.turnTo;
      const dy = angDiff(this.yaw, t.yaw);
      const step = Math.min(1, dt * 7);
      this.yaw += dy * step;
      this.pitch += (t.pitch - this.pitch) * step;
      if (Math.abs(dy) < 0.003 && Math.abs(t.pitch - this.pitch) < 0.003) this.turnTo = null;
      this.moved++;
    }
    this.stepEffects(dt);
  }

  /** Kamera-Effekte (nur Anzeige): Wackeln, Landungs-Wippen, Stufenglättung abklingen lassen. */
  stepEffects(dt) {
    if (!(dt > 0)) return;
    this.shakeT += dt;
    this.shake *= Math.exp(-dt * 7);
    if (this.shake < 1e-4) this.shake = 0;
    if (this.stepOff) { this.stepOff *= Math.exp(-dt * 14); if (Math.abs(this.stepOff) < 1e-3) this.stepOff = 0; }
    if (this.reducedMotion()) { this.landDip = 0; this.landDipV = 0; this.stepOff = 0; return; }
    if (this.landDip || this.landDipV) {
      let left = Math.min(dt, 0.1);
      while (left > 0) {
        const h = Math.min(left, 0.016);
        left -= h;
        this.landDipV += (-this.landDip * 180 - this.landDipV * 16) * h;
        this.landDip += this.landDipV * h;
        if (this.landDip < DIP_MIN) { this.landDip = DIP_MIN; if (this.landDipV < 0) this.landDipV = 0; }
      }
      if (Math.abs(this.landDip) < 1e-4 && Math.abs(this.landDipV) < 1e-3) { this.landDip = 0; this.landDipV = 0; }
    }
  }

  /** Augenhöhe in der Welt: Füße + 1,65 m + Landungs-Wippen + Stufenglättung. */
  eyeY() { return this.y + EYE + this.landDip + this.stepOff; }

  applyCamera(camera) {
    camera.position.set(this.x, this.eyeY(), this.z);
    const sh = this.reducedMotion() ? 0 : this.shake;
    if (sh > 0) {
      camera.rotation.set(
        this.pitch + sh * Math.sin(this.shakeT * 60) * 0.5,
        this.yaw + sh * Math.cos(this.shakeT * 47) * 0.4,
        sh * Math.sin(this.shakeT * 38),
        'YXZ',
      );
    } else camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  get state() { return { x: +this.x.toFixed(3), z: +this.z.toFixed(3), yaw: +this.yaw.toFixed(3), pitch: +this.pitch.toFixed(3) }; }

  get pose() { return { x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, vy: this.vy, grounded: this.grounded }; }
}

