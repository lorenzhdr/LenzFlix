// VIDEOTHEK LENZ · Desktop-Steuerung: Pointer-Lock, WASD/Pfeile, Maus-Look, Shift rennt, E/Klick nimmt.
// Tasten laufen im Capture-Listener und werden verschluckt, damit Jellyfins Tastenkürzel nichts mitbekommen.

const KEYS = {
  KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
};

function typing(t) {
  if (!t || !t.tagName) return false;
  const n = t.tagName;
  return n === 'INPUT' || n === 'TEXTAREA' || n === 'SELECT' || t.isContentEditable;
}

export class DesktopControls {
  /**
   * @param {object} ctx { canvas, player, getMode(), onLockLost(), onLockChange(locked), onTake(), onEscape() }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.down = new Set();
    this.attached = false;
    this.exiting = false;
    this.dragLook = false; // Fallback, wenn Pointer-Lock nicht verfügbar ist
    this.drag = null;
    this.sens = 0.0022;
    this.h = {
      key: (e) => this.onKey(e, true),
      keyUp: (e) => this.onKey(e, false),
      move: (e) => this.onMove(e),
      lock: () => this.onLockChange(),
      lockErr: () => { this.dragLook = true; this.ctx.onLockChange(false); },
      down: (e) => this.onDown(e),
      up: () => { this.drag = null; },
      blur: () => this.down.clear(),
    };
  }

  get locked() { return document.pointerLockElement === this.ctx.canvas; }

  get input() {
    const d = this.down;
    return {
      fwd: (d.has('fwd') ? 1 : 0) - (d.has('back') ? 1 : 0),
      strafe: (d.has('right') ? 1 : 0) - (d.has('left') ? 1 : 0),
      run: d.has('run'),
    };
  }

  attach() {
    if (this.attached) return;
    this.attached = true;
    const c = this.ctx.canvas;
    window.addEventListener('keydown', this.h.key, true);
    window.addEventListener('keyup', this.h.keyUp, true);
    window.addEventListener('blur', this.h.blur);
    document.addEventListener('mousemove', this.h.move);
    document.addEventListener('pointerlockchange', this.h.lock);
    document.addEventListener('pointerlockerror', this.h.lockErr);
    c.addEventListener('mousedown', this.h.down);
    window.addEventListener('mouseup', this.h.up);
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    const c = this.ctx.canvas;
    window.removeEventListener('keydown', this.h.key, true);
    window.removeEventListener('keyup', this.h.keyUp, true);
    window.removeEventListener('blur', this.h.blur);
    document.removeEventListener('mousemove', this.h.move);
    document.removeEventListener('pointerlockchange', this.h.lock);
    document.removeEventListener('pointerlockerror', this.h.lockErr);
    c.removeEventListener('mousedown', this.h.down);
    window.removeEventListener('mouseup', this.h.up);
    this.down.clear();
    this.releaseLock();
  }

  requestLock() {
    const c = this.ctx.canvas;
    if (this.locked || !c.requestPointerLock) return;
    try {
      const p = c.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => { /* ohne Geste nicht möglich: Hinweis bleibt */ });
    } catch { /* egal */ }
  }

  /** Lock absichtlich freigeben (öffnet kein Pause-Menü). */
  releaseLock() {
    if (!this.locked) return;
    this.exiting = true;
    try { document.exitPointerLock(); } catch { this.exiting = false; }
  }

  onLockChange() {
    const locked = this.locked;
    if (!locked) {
      const wasIntentional = this.exiting;
      this.exiting = false;
      this.down.clear();
      if (!wasIntentional && this.ctx.getMode() === 'play') this.ctx.onLockLost();
    } else {
      this.dragLook = false;
    }
    this.ctx.onLockChange(locked);
  }

  onDown(e) {
    if (e.button !== 0) return;
    const mode = this.ctx.getMode();
    if (mode !== 'play') return;
    if (this.locked) { this.ctx.onTake(); return; }
    if (this.dragLook) { this.drag = { x: e.clientX, y: e.clientY, moved: 0 }; return; }
    this.requestLock();
  }

  onMove(e) {
    const p = this.ctx.player;
    if (this.locked) {
      p.look(-e.movementX * this.sens, -e.movementY * this.sens);
    } else if (this.dragLook && this.drag && (e.buttons & 1)) {
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
      p.look(-dx * 0.004, -dy * 0.004);
    }
  }

  onKey(e, isDown) {
    const mode = this.ctx.getMode();
    if (typing(e.target)) return;
    if (isDown && e.code === 'Escape') {
      if (mode === 'hold' || mode === 'paused' || mode === 'overlay') {
        e.preventDefault();
        e.stopPropagation();
        this.ctx.onEscape();
      } else if (mode === 'play' && this.dragLook && !this.locked) {
        e.preventDefault();
        e.stopPropagation();
        this.ctx.onLockLost(); // ohne Pointer-Lock (Fallback) öffnet Esc das Pause-Menü selbst
      }
      return;
    }
    const k = KEYS[e.code];
    if (k) {
      if (mode !== 'play' && e.code.startsWith('Arrow')) return;
      e.preventDefault();
      e.stopPropagation();
      if (mode === 'play' && isDown) this.down.add(k);
      else this.down.delete(k);
      if (!isDown) this.down.delete(k);
      return;
    }
    if (e.code === 'KeyE') {
      e.preventDefault();
      e.stopPropagation();
      if (isDown && !e.repeat && mode === 'play' && (this.locked || this.dragLook)) this.ctx.onTake();
    }
  }
}
