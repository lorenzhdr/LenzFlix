// VIDEOTHEK LENZ · Touch-Steuerung. Zwei Schemata:
//  'touch':    Gedrückt halten = vorwärts laufen (Ziehen lenkt), kurzes Wischen = Umsehen.
//  'joystick': Gehen-Knopf unten links = vorwärts, Joystick unten rechts = Blick drehen (ui/joypad.js); Wischen sieht zusätzlich um.
// Beide: kurzes Tippen = Hülle nehmen/benutzen (Logik in store.js), Pinch = Zoom.
import { createJoypad } from '../ui/joypad.js';

/** Bogenmaß pro Pixel beim Wischen/Lenken. */
export const TOUCH_LOOK = 0.0045;
/** Haltezeit (ms), ab der ein ruhender Finger zum Laufen wird. */
export const TOUCH_HOLD_MS = 220;
/** Bewegungsschwelle (px) für „Finger ruht“. */
export const TOUCH_SLOP = 9;
/** Joystick: Drehrate (rad/s) bei voller Auslenkung. */
export const STICK_YAW_RATE = 2.4;
export const STICK_PITCH_RATE = 1.5;
export const SCHEMES = ['joystick', 'touch'];
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

export class TouchControls {
  /** @param {object} ctx { canvas, player, getMode(), onTap(x, y), onZoom?(z), getZoom?(), scheme?: 'touch' | 'joystick', padHost? } */
  constructor(ctx) {
    this.ctx = ctx;
    this.scheme = SCHEMES.includes(ctx.scheme) ? ctx.scheme : 'touch';
    this.pad = null;
    this.padWalk = false;
    this.stick = { x: 0, y: 0 };
    this.padShown = true;
    this.pointers = new Map();
    this.attached = false;
    this.walkId = null; // pointerId des Fingers, der gerade läuft
    this.timer = 0;
    this.zoom = 1;
    this.pinch = null; // { d0, z0 }
    this.ring = null;
    this.h = {
      down: (e) => this.onDown(e),
      move: (e) => this.onMove(e),
      up: (e) => this.onUp(e, false),
      cancel: (e) => this.onUp(e, true),
      noCtx: (e) => e.preventDefault(),
    };
  }

  /** Eingabe für Player.update(): läuft nur im Laufmodus. */
  get input() {
    if ((this.walkId !== null || this.padWalk) && this.ctx.getMode() !== 'play') { this.stopWalk(); if (this.pad) this.pad.reset(); }
    return { fwd: this.walkId !== null || this.padWalk ? 1 : 0, strafe: 0, run: false };
  }

  /** Pro Frame (nur im Laufmodus aufrufen): Joystick-Auslenkung → Blickdrehung. Rechts = Blick rechts, oben = Blick oben. */
  tick(dt) {
    const { x, y } = this.stick;
    if ((!x && !y) || !(dt > 0)) return;
    if (this.ctx.getMode() !== 'play') return;
    const t = Math.min(dt, 0.1);
    this.ctx.player.look(-x * STICK_YAW_RATE * t, -y * STICK_PITCH_RATE * t);
  }

  /** Schema wechseln ('joystick' | 'touch'): laufende Gesten enden, Pad wird erzeugt bzw. entfernt. */
  setScheme(s) {
    if (!SCHEMES.includes(s) || s === this.scheme) return;
    this.scheme = s;
    this.reset();
    if (this.attached) this.syncPad();
  }

  /** Pad ein-/ausblenden (z. B. nur im Laufmodus). */
  showPad(on) {
    this.padShown = !!on;
    if (this.pad) this.pad.show(this.padShown);
  }

  syncPad() {
    if (this.scheme === 'joystick' && this.attached) {
      if (!this.pad) {
        const host = this.ctx.padHost || this.ctx.canvas.parentElement || document.body;
        this.pad = createJoypad(host, {
          onWalk: (on) => {
            this.padWalk = !!on && this.ctx.getMode() === 'play';
            if (this.padWalk && this.currentZoom() !== 1) this.setZoom(1);
          },
          onLook: (x, y) => { this.stick = { x, y }; },
        });
      }
      this.pad.show(this.padShown);
    } else if (this.pad) {
      this.pad.destroy();
      this.pad = null;
      this.padWalk = false;
      this.stick = { x: 0, y: 0 };
    }
  }

  attach() {
    if (this.attached) return;
    this.attached = true;
    const c = this.ctx.canvas;
    c.style.touchAction = 'none';
    c.style.overscrollBehavior = 'none';
    c.addEventListener('pointerdown', this.h.down);
    c.addEventListener('pointermove', this.h.move);
    c.addEventListener('pointerup', this.h.up);
    c.addEventListener('pointercancel', this.h.cancel);
    c.addEventListener('contextmenu', this.h.noCtx);
    this.syncPad();
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    const c = this.ctx.canvas;
    c.removeEventListener('pointerdown', this.h.down);
    c.removeEventListener('pointermove', this.h.move);
    c.removeEventListener('pointerup', this.h.up);
    c.removeEventListener('pointercancel', this.h.cancel);
    c.removeEventListener('contextmenu', this.h.noCtx);
    this.reset();
    this.syncPad();
    if (this.ring) { this.ring.remove(); this.ring = null; }
  }

  reset() {
    this.clearTimer();
    this.walkId = null;
    this.pinch = null;
    this.pointers.clear();
    this.hideRing();
    if (this.pad) this.pad.reset();
    this.padWalk = false;
    this.stick = { x: 0, y: 0 };
  }

  clearTimer() {
    if (this.timer) { clearTimeout(this.timer); this.timer = 0; }
  }

  stopWalk() {
    this.walkId = null;
    this.hideRing();
  }

  onDown(e) {
    if (this.ctx.getMode() !== 'play') return;
    try { this.ctx.canvas.setPointerCapture(e.pointerId); } catch { /* egal */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, dead: false, walked: false });
    this.clearTimer();
    if (this.pointers.size === 1) {
      const id = e.pointerId;
      if (this.scheme === 'touch') this.timer = setTimeout(() => { this.timer = 0; this.startWalk(id); }, TOUCH_HOLD_MS);
    } else if (this.pointers.size === 2) {
      // Pinch: kein Laufen, kein Umsehen, kein Tippen
      this.stopWalk();
      for (const p of this.pointers.values()) p.dead = true;
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), z0: this.currentZoom() };
    } else {
      for (const p of this.pointers.values()) p.dead = true;
    }
  }

  currentZoom() {
    const z = this.ctx.getZoom ? this.ctx.getZoom() : this.zoom;
    return Number.isFinite(z) ? z : this.zoom;
  }

  setZoom(z) {
    this.zoom = z;
    if (this.ctx.onZoom) this.ctx.onZoom(z);
  }

  startWalk(id) {
    const p = this.pointers.get(id);
    if (!p || p.dead || p.moved || this.pointers.size !== 1 || this.ctx.getMode() !== 'play') return;
    this.walkId = id;
    p.walked = true;
    if (this.currentZoom() !== 1) this.setZoom(1);
    this.showRing(p.x, p.y);
    try { if (navigator.vibrate) navigator.vibrate(8); } catch { /* egal */ }
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p || this.ctx.getMode() !== 'play') return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (this.pointers.size >= 2) {
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.pinch.z0 * (Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.d0)));
        this.setZoom(z);
      }
      return;
    }
    if (p.dead) return;
    if (!p.moved && !p.walked && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > TOUCH_SLOP) {
      p.moved = true;
      this.clearTimer();
    }
    // Touch = „Szene greifen“ (wie bei Karten/360°-Fotos): Finger nach rechts zieht das Bild mit → Blick dreht nach links;
    // Finger nach unten → Blick nach oben. (Maus/Pointer-Lock in desktop.js bleibt Kamera-Konvention.)
    if (p.moved || p.walked) this.ctx.player.look(dx * TOUCH_LOOK, dy * TOUCH_LOOK);
    if (p.walked) this.moveRing(e.clientX, e.clientY);
  }

  onUp(e, cancelled) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.clearTimer();
    if (this.walkId === e.pointerId) this.stopWalk();
    if (this.pointers.size < 2) this.pinch = null;
    if (!p || cancelled || p.dead || p.moved || p.walked || this.ctx.getMode() !== 'play') return;
    if (this.pointers.size === 0) this.ctx.onTap(e.clientX, e.clientY);
  }

  // --- Ring am Finger ---
  showRing(x, y) {
    if (!this.ring) {
      const host = this.ctx.canvas.parentElement || document.body;
      const r = document.createElement('div');
      r.className = 'lfx-store-walkring';
      host.appendChild(r);
      this.ring = r;
    }
    this.moveRing(x, y);
    this.ring.classList.add('is-on');
  }

  moveRing(x, y) {
    if (this.ring) this.ring.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
  }

  hideRing() {
    if (this.ring) this.ring.classList.remove('is-on');
  }
}
