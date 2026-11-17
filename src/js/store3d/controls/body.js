// VIDEOTHEK LENZ · Kinematischer Körper (rein, ohne three): Gehen, Schwerkraft, Sprung (Coyote/Puffer), Stufen, Hochziehen,
// Stoß (knock), Netzzustand. Geteilt von Player (controls/player.js), Richard und NPCs. Kollision: nav/collide.js.
// Koordinaten: x Osten, z Süden, y oben (Füße). Ohne Höhen-Kollider und y = 0 verhält sich der Körper wie die alte 2D-Bewegung.
import {
  RADIUS, GRAV, JUMP_V, VY_MIN, COYOTE, JUMP_BUF, AIR_K, MANTLE_T, STEP_H, BODY_H, EPS,
  resolveCircle3, groundHeight, ceilingY, findMantle,
} from '../nav/collide.js';

export { RADIUS };

/** Animationscodes in getNetState().a */
export const ANIM = { STAND: 0, WALK: 1, RUN: 2, AIR: 3, KNOCK: 4, MANTLE: 5, HIT: 6 };
/** Anzeigeverzögerung der Remote-Interpolation (ms), Puffergröße, Sprungabstand (m). */
export const NET_DELAY_MS = 100;
export const NET_BUFFER = 8;
export const NET_JUMP_DIST = 3;
/** Sekunden, die eine Schlag-Animation (Code 6) dauert. */
export const SWING_T = 0.3;
/** Sekunden ohne neues Hochziehen nach dem Hochziehen. */
export const MANTLE_COOLDOWN = 0.25;
const KNOCK_DECAY = 6;
const KNOCK_SPEED = 4;
const VERTICAL_ONLY = { verticalOnly: true };

const smoothstep = (t) => t * t * (3 - 2 * t);
const r3 = (v) => +v.toFixed(3);
const r2 = (v) => +v.toFixed(2);

function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Body {
  /** @param {{ src, x?, z?, y?, yaw?, pitch?, spawn? }} o  src = Kollider-Quelle (Array | Index | { index, dyn }, siehe nav/collide.js) */
  constructor(o = {}) {
    this.src = o.src || [];
    this.x = o.x || 0;
    this.z = o.z || 0;
    this.y = o.y || 0;
    this.yaw = o.yaw || 0;
    this.pitch = o.pitch || 0;
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.grounded = true;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.mantle = null; // { t, x0, z0, y0, x1, z1, y1, rect } solange hochgezogen wird
    this.knockVx = 0;
    this.knockVz = 0;
    this.shake = 0; // Kamera-Wackeln (Amplitude), von knock() gesetzt; nur die Anzeige (Player.applyCamera)
    this.shakeT = 0;
    this.landDip = 0; // Landungs-Wippen (Meter, ≤ 0), nur die Anzeige
    this.landDipV = 0;
    this.stepOff = 0; // Stufenglättung: Augenhöhen-Versatz nach Stufe/Bordstein (klingt in Player.update ab)
    this.swingT = 0; // > 0 während einer Schlag-Animation
    this.heldId = null; // getragene/gehaltene Hülle (nur für den Netzzustand)
    this.standingOn = null;
    this.cooldownJump = 0;
    this.safeT = 0;
    const sp = o.spawn || { x: this.x, z: this.z };
    this.lastSafe = { x: sp.x, y: 0, z: sp.z };
    this.remote = false;
    this.netBuf = [];
    this.netClock = 0;
    this.onJump = null; // ({ x, y, z })
    this.onLand = null; // ({ impact })
    this.onMantle = null; // ({ y1 })
    this.intent = { tx: 0, tz: 0, manual: false, path: false, dirx: 0, dirz: 0 };
  }

  // --- Aufstellen ---
  /** Position setzen (ohne Blick), danach auf den Boden setzen. */
  place(x, z, y = 0) {
    this.x = x; this.z = z; this.y = y;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.knockVx = 0; this.knockVz = 0;
    this.coyote = 0; this.jumpBuf = 0; this.mantle = null; this.stepOff = 0;
    this.settle();
  }

  /** y auf den Boden unter der aktuellen Höhe setzen (Wiederherstellen, VR); merkt die Stelle als sicher. */
  settle() {
    const g = groundHeight(this.x, this.z, RADIUS, this.y, this.src);
    this.y = g.y;
    this.vy = 0;
    this.grounded = true;
    this.standingOn = g.rect;
    this.lastSafe = { x: this.x, y: this.y, z: this.z };
    this.safeT = 0.5;
  }

  /** Nach dem Sturz in den Abgrund (y < -6): zurück zur letzten sicheren Stelle. Player überschreibt das (Teleport-Zähler). */
  respawn() {
    const s = this.lastSafe;
    this.place(s.x, s.z, s.y);
  }

  cancelPath() { /* nur Player */ }
  abortPath() { this.cancelPath(); }

  // --- Eingaben ---
  /** Sprungwunsch (für JUMP_BUF Sekunden gemerkt). Rückgabe: Sprung ist jetzt sofort möglich. */
  jump() {
    this.jumpBuf = JUMP_BUF;
    return !!(this.grounded || this.coyote > 0);
  }

  /** Stoß: knock({ x, z, up }, strength): Richtung (x, z) wird normiert; Geschwindigkeit 4 m/s * strength, klingt ab. */
  knock(dir, strength = 1) {
    const d = dir || {};
    const l = Math.hypot(d.x || 0, d.z || 0);
    if (l > 1e-6) {
      this.knockVx += (d.x / l) * KNOCK_SPEED * strength;
      this.knockVz += (d.z / l) * KNOCK_SPEED * strength;
    }
    if (d.up) { this.vy += d.up; this.grounded = false; this.standingOn = null; }
    this.shake = 0.04 * strength;
    this.shakeT = 0.35;
    this.mantle = null;
    this.abortPath();
  }

  /** Schlag-Animation starten (Animationscode 6). */
  swing() { this.swingT = SWING_T; }

  land(impact) {
    if (this.onLand) this.onLand({ impact });
  }

  // --- Schritt ---
  /**
   * intent: { tx, tz } Zielgeschwindigkeit (m/s, Welt), manual (Eingabe), path (Pfadfolge: in der Luft ohne Wirkung),
   * dirx/dirz (normierte Eingaberichtung für das Hochziehen). Rückgabe { hit }: Horizontalbewegung wurde blockiert.
   */
  step(dt, intent) {
    if (this.remote) { this.stepRemote(dt); return { hit: false }; }
    const it = intent || this.intent;
    const n = Math.min(5, Math.max(1, Math.ceil(dt / 0.02)));
    const h = dt / n;
    let hit = false;
    for (let i = 0; i < n; i++) if (this.substep(h, it)) hit = true;
    return { hit };
  }

  /** Nur der vertikale Teil (Schwerkraft, Bodenfolgen, Decke): VR, wo Kopf und Stick die Horizontale bestimmen. */
  stepVertical(dt) {
    if (this.remote) return;
    const n = Math.min(5, Math.max(1, Math.ceil(dt / 0.02)));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.substep(h, VERTICAL_ONLY);
  }

  substep(h, it) {
    const vOnly = !!it.verticalOnly;
    this.coyote = Math.max(0, this.coyote - h);
    this.jumpBuf = Math.max(0, this.jumpBuf - h);
    this.cooldownJump = Math.max(0, this.cooldownJump - h);
    if (this.swingT > 0) this.swingT = Math.max(0, this.swingT - h);
    if (this.knockVx || this.knockVz) {
      const f = Math.exp(-h * KNOCK_DECAY);
      this.knockVx *= f; this.knockVz *= f;
      if (Math.abs(this.knockVx) < 0.01 && Math.abs(this.knockVz) < 0.01) { this.knockVx = 0; this.knockVz = 0; }
    }
    if (this.mantle) { if (!vOnly) this.stepMantle(h); return false; }
    const src = this.src;

    if (!vOnly) {
      // Horizontal: Zielgeschwindigkeit; Pfadfolge nur am Boden, in der Luft bleibt die Geschwindigkeit
      if (!(it.path && !this.grounded)) {
        const k = Math.min(1, h * (this.grounded ? (it.manual || it.path ? 11 : 14) : AIR_K));
        this.vx += ((it.tx || 0) + this.knockVx - this.vx) * k;
        this.vz += ((it.tz || 0) + this.knockVz - this.vz) * k;
      }
      if (Math.abs(this.vx) < 0.001 && Math.abs(this.vz) < 0.001) { this.vx = 0; this.vz = 0; }
      // Sprung
      if (this.jumpBuf > 0 && (this.grounded || this.coyote > 0)) {
        this.vy = JUMP_V;
        this.grounded = false;
        this.standingOn = null;
        this.coyote = 0;
        this.jumpBuf = 0;
        this.abortPath();
        if (this.onJump) this.onJump({ x: this.x, y: this.y, z: this.z });
      }
    }

    // Vertikal
    const vy0 = this.vy;
    if (!this.grounded || this.vy > 0) this.vy = Math.max(VY_MIN, this.vy - GRAV * h);
    this.y += (vy0 + this.vy) * 0.5 * h; // Trapez = exakte Parabel bei konstanter Beschleunigung

    // Decke vor dem Horizontalschritt klemmen: sonst zählt eine Platte über dem Kopf (Dach) als Seitenhindernis
    if (this.vy > 0) {
      const c0 = ceilingY(this.x, this.z, RADIUS, this.y, src);
      if (this.y + BODY_H > c0) { this.vy = 0; this.y = c0 - BODY_H; }
    }

    // Horizontal bewegen
    let hit = false;
    let res = null;
    if (!vOnly && (this.vx || this.vz)) {
      res = resolveCircle3(this.x + this.vx * h, this.z + this.vz * h, RADIUS, src, this.y);
      this.x = res.x;
      this.z = res.z;
      hit = res.hit;
    }

    // Abgrund: vor dem Bodenfangen (der Boden liegt nie unter 0)
    if (this.y < -6) { this.respawn(); return false; }

    // Boden
    const gr = groundHeight(this.x, this.z, RADIUS, this.y, src);
    const g = gr.y;
    if (this.vy <= 0 && this.y <= g + EPS) {
      const wasAir = !this.grounded;
      const impact = -this.vy;
      if (!wasAir && Math.abs(this.y - g) > 0.01) this.stepOff = Math.max(-0.4, Math.min(0.4, this.stepOff + this.y - g));
      this.y = g;
      this.vy = 0;
      this.grounded = true;
      this.standingOn = gr.rect;
      if (wasAir) this.land(impact);
    } else if (this.grounded && this.vy <= 0 && this.y - g <= STEP_H) {
      this.stepOff = Math.max(-0.4, Math.min(0.4, this.stepOff + this.y - g));
      this.y = g;
      this.standingOn = gr.rect;
    } else if (this.grounded) {
      this.grounded = false;
      this.standingOn = null;
      this.coyote = COYOTE;
    }

    // Decke
    if (this.vy > 0) {
      const c = ceilingY(this.x, this.z, RADIUS, this.y, src);
      if (this.y + BODY_H > c) { this.vy = 0; this.y = c - BODY_H; }
    }

    // Hochziehen: in der Luft gegen eine Kante laufen
    if (!vOnly && !this.grounded && res && res.mantle && it.manual && (it.dirx || it.dirz) && this.cooldownJump <= 0) {
      const m = findMantle(this.x, this.z, RADIUS, it.dirx, it.dirz, this.y, src);
      if (m) {
        this.mantle = { t: 0, x0: this.x, z0: this.z, y0: this.y, x1: m.x, z1: m.z, y1: m.y1, rect: m.rect };
        this.vx = 0; this.vz = 0; this.vy = 0;
        this.knockVx = 0; this.knockVz = 0;
        this.abortPath();
        if (this.onMantle) this.onMantle({ y1: m.y1 });
      }
    }

    // sicherer Punkt / Abgrund
    this.safeT -= h;
    if (this.grounded && !(this.standingOn && this.standingOn.dynamic) && this.safeT <= 0) {
      this.safeT = 0.5;
      this.lastSafe = { x: this.x, y: this.y, z: this.z };
    }
    return hit;
  }

  stepMantle(h) {
    const m = this.mantle;
    m.t += h / MANTLE_T;
    const k = smoothstep(Math.min(1, m.t));
    this.x = m.x0 + (m.x1 - m.x0) * k;
    this.z = m.z0 + (m.z1 - m.z0) * k;
    this.y = m.y0 + (m.y1 - m.y0) * k;
    if (m.t >= 1) {
      this.x = m.x1; this.z = m.z1; this.y = m.y1;
      this.standingOn = m.rect || null;
      this.mantle = null;
      this.grounded = true;
      this.vy = 0;
      this.cooldownJump = MANTLE_COOLDOWN;
    }
  }

  // --- Netzzustand (Vorbereitung Mehrspieler; reines JSON) ---
  animCode() {
    if (this.mantle) return ANIM.MANTLE;
    if (this.swingT > 0) return ANIM.HIT;
    if (!this.grounded) return ANIM.AIR;
    if (Math.hypot(this.knockVx, this.knockVz) > 1) return ANIM.KNOCK;
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 3) return ANIM.RUN;
    if (sp > 0.3) return ANIM.WALK;
    return ANIM.STAND;
  }

  /** { x, y, z (1 mm), yaw, pitch (0,01 rad), vx, vy, vz (0,01), a: Animationscode, h: heldId | null } */
  getNetState() {
    return {
      x: r3(this.x), y: r3(this.y), z: r3(this.z), yaw: r2(this.yaw), pitch: r2(this.pitch),
      vx: r2(this.vx), vy: r2(this.vy), vz: r2(this.vz), a: this.animCode(), h: this.heldId == null ? null : this.heldId,
    };
  }

  /**
   * Fremden Zustand übernehmen: (now = Zeit in ms, beliebige Uhr, nur Differenzen zählen). Der Körper wird zum Remote-Körper
   * (keine Physik, keine Kollision) und folgt dem Puffer mit NET_DELAY_MS Verzögerung (lineare Interpolation, Winkel über angDiff).
   * Liegt der neue Stand weiter als NET_JUMP_DIST vom aktuellen entfernt, springt der Körper sofort.
   */
  applyRemote(s, now = 0) {
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.z)) return;
    const first = !this.remote || !this.netBuf.length;
    this.remote = true;
    const far = Math.hypot(s.x - this.x, (s.y || 0) - this.y, s.z - this.z) > NET_JUMP_DIST;
    if (first || far) {
      this.netBuf = [];
      this.netClock = now - NET_DELAY_MS;
      this.setNet(s);
    }
    this.netBuf.push({ t: now, s: { ...s } });
    while (this.netBuf.length > NET_BUFFER) this.netBuf.shift();
    this.heldId = s.h == null ? null : s.h;
  }

  setNet(s) {
    this.x = s.x; this.y = s.y || 0; this.z = s.z;
    if (Number.isFinite(s.yaw)) this.yaw = s.yaw;
    if (Number.isFinite(s.pitch)) this.pitch = s.pitch;
    this.vx = s.vx || 0; this.vy = s.vy || 0; this.vz = s.vz || 0;
    this.grounded = (s.a || 0) !== ANIM.AIR;
  }

  stepRemote(dt) {
    const b = this.netBuf;
    if (!b.length) return;
    this.netClock += dt * 1000;
    const c = this.netClock;
    if (c <= b[0].t) { this.setNet(b[0].s); return; }
    const last = b[b.length - 1];
    if (c >= last.t) { this.setNet(last.s); return; }
    let i = 0;
    while (i < b.length - 2 && c > b[i + 1].t) i++;
    const a = b[i];
    const n = b[i + 1];
    const k = (c - a.t) / Math.max(1e-6, n.t - a.t);
    const lerp = (p, q) => p + ((q === undefined ? p : q) - p) * k;
    const as = a.s;
    const ns = n.s;
    this.x = lerp(as.x, ns.x);
    this.y = lerp(as.y || 0, ns.y || 0);
    this.z = lerp(as.z, ns.z);
    this.yaw = (as.yaw || 0) + angDiff(as.yaw || 0, ns.yaw || 0) * k;
    this.pitch = lerp(as.pitch || 0, ns.pitch || 0);
    this.vx = lerp(as.vx || 0, ns.vx || 0);
    this.vy = lerp(as.vy || 0, ns.vy || 0);
    this.vz = lerp(as.vz || 0, ns.vz || 0);
    this.grounded = (ns.a || 0) !== ANIM.AIR;
  }
}
