// VIDEOTHEK LENZ · Spielerzustand: Position, Blick, weiche Beschleunigung, Kollision, Pfadfolge (Touch).
import { resolveCircle } from '../nav/path.js';

export const EYE = 1.65;
const RADIUS = 0.28;
const WALK = 2.2;
const RUN = 4.0;
const PITCH_MAX = 1.25;

function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Player {
  constructor(layout) {
    this.rects = layout.colliders;
    this.x = layout.spawn.x;
    this.z = layout.spawn.z;
    this.yaw = layout.spawn.yaw;
    this.pitch = 0;
    this.vx = 0;
    this.vz = 0;
    this.path = null;
    this.onArrive = null;
    this.turnTo = null; // { yaw, pitch } sanft einnehmen
    this.tp = 0; // Zähler für Teleports (VR-Rig setzt sich bei Änderung neu)
    this.moved = 0; // Zähler für "bewegt sich" (State-Drosselung)
    this.lastLook = 0;
  }

  teleport(x, z, yaw = this.yaw, pitch = 0) {
    this.x = x; this.z = z; this.yaw = yaw; this.pitch = pitch;
    this.vx = 0; this.vz = 0;
    this.cancelPath();
    this.turnTo = null;
    this.tp++;
    this.moved++;
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

  get walking() { return !!this.path; }

  faceYaw(yaw, pitch = 0.05) { this.turnTo = { yaw, pitch }; }

  /** input: { fwd, strafe } in -1..1, run: bool, scale 0..1 (Standard 1). Bewegung relativ zum Blick. */
  update(dt, input) {
    let tx = 0;
    let tz = 0;
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
      tx = ((-sy * f + cy * s) / len) * speed;
      tz = ((-cy * f - sy * s) / len) * speed;
    } else if (this.path) {
      const p = this.path[0];
      const dx = p.x - this.x;
      const dz = p.z - this.z;
      const d = Math.hypot(dx, dz);
      const last = this.path.length === 1;
      if (d < (last ? 0.08 : 0.2)) {
        this.path.shift();
        if (!this.path.length) {
          this.path = null;
          const cb = this.onArrive;
          this.onArrive = null;
          this.vx = 0; this.vz = 0;
          if (cb) cb();
        }
      } else {
        speed = 2.0;
        const slow = last ? Math.min(1, d / 0.6 + 0.25) : 1;
        tx = (dx / d) * speed * slow;
        tz = (dz / d) * speed * slow;
        // Blick sanft in Laufrichtung drehen
        const want = Math.atan2(-dx, -dz);
        const diff = angDiff(this.yaw, want);
        this.yaw += Math.max(-3 * dt, Math.min(3 * dt, diff));
        this.pitch += (0 - this.pitch) * Math.min(1, dt * 2);
      }
    }
    const k = Math.min(1, dt * (manual || this.path ? 11 : 14));
    this.vx += (tx - this.vx) * k;
    this.vz += (tz - this.vz) * k;
    if (Math.abs(this.vx) < 0.001 && Math.abs(this.vz) < 0.001) { this.vx = 0; this.vz = 0; }
    if (this.vx || this.vz) {
      const r = resolveCircle(this.x + this.vx * dt, this.z + this.vz * dt, RADIUS, this.rects);
      this.x = r.x;
      this.z = r.z;
      this.moved++;
      if (r.hit && this.path) {
        // Zwischenpunkt blockiert (z. B. Kante): Pfad aufgeben
        this.path = null;
        const cb = this.onArrive;
        this.onArrive = null;
        if (cb) cb();
      }
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
  }

  applyCamera(camera) {
    camera.position.set(this.x, EYE, this.z);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  get state() { return { x: +this.x.toFixed(3), z: +this.z.toFixed(3), yaw: +this.yaw.toFixed(3), pitch: +this.pitch.toFixed(3) }; }
}
