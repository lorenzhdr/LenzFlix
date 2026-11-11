// VIDEOTHEK LENZ · Desktop-Steuerung: Pointer-Lock, WASD/Pfeile, Maus-Look, Shift rennt, E/Klick nimmt.
// Tasten laufen im Capture-Listener und werden verschluckt, damit Jellyfins Tastenkürzel nichts mitbekommen.

const KEYS = {
  KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
};

const ZOOM_IN = 2.6; // Zoom-Faktor bei gehaltener rechter Maustaste / Q
const LOCK_COOLDOWN = 1150; // Chrome lehnt requestPointerLock() kurz nach dem Verlassen per Esc ab
const LOCK_RECENT = 3000;

function typing(t) {
  if (!t || !t.tagName) return false;
  const n = t.tagName;
  return n === 'INPUT' || n === 'TEXTAREA' || n === 'SELECT' || t.isContentEditable;
}

export class DesktopControls {
  /**
   * @param {object} ctx { canvas, player, getMode(), onLockLost(), onLockChange(locked), onTake(), onEscape(), onZoom(z), getZoom() }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.down = new Set();
    this.attached = false;
    this.exiting = false;
    this.dragLook = false; // Fallback, wenn Pointer-Lock nicht verfügbar ist
    this.drag = null;
    this.sens = 0.0022;
    this.unlockAt = -Infinity; // Zeitpunkt des letzten Pointer-Lock-Verlusts
    this.lockTimer = 0;
    this.inflight = false;
    this.retried = false;
    this.zoomKey = false;
    this.zoomBtn = false;
    this.zoomSent = 1;
    this.h = {
      key: (e) => this.onKey(e, true),
      keyUp: (e) => this.onKey(e, false),
      move: (e) => this.onMove(e),
      lock: () => this.onLockChange(),
      lockErr: () => this.onLockFail(),
      down: (e) => this.onDown(e),
      up: (e) => {
        this.drag = null;
        if (e && e.button === 2) { this.zoomBtn = false; this.syncZoom(); }
      },
      blur: () => { this.down.clear(); this.zoomKey = false; this.zoomBtn = false; this.syncZoom(); },
      noCtx: (e) => e.preventDefault(),
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
    c.addEventListener('contextmenu', this.h.noCtx);
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
    c.removeEventListener('contextmenu', this.h.noCtx);
    window.removeEventListener('mouseup', this.h.up);
    this.down.clear();
    this.clearLockTimer();
    this.inflight = false;
    this.zoomKey = false;
    this.zoomBtn = false;
    this.syncZoom();
    this.releaseLock();
  }

  clearLockTimer() {
    if (this.lockTimer) { clearTimeout(this.lockTimer); this.lockTimer = 0; }
  }

  /** Pointer-Lock anfordern; kurz nach einem Esc-Exit verzögert (sonst lehnt Chrome ab). */
  requestLock() {
    const c = this.ctx.canvas;
    this.clearLockTimer();
    if (this.locked) return;
    if (!c.requestPointerLock) { this.dragLook = true; this.ctx.onLockChange(false); return; }
    this.retried = false;
    this.scheduleLock(this.unlockAt + LOCK_COOLDOWN - performance.now(), 0);
  }

  scheduleLock(wait, min) {
    this.clearLockTimer();
    const w = Math.max(min, wait);
    if (w <= 0) { this.doLock(); return; }
    this.lockTimer = setTimeout(() => {
      this.lockTimer = 0;
      if (this.attached && !this.locked && this.ctx.getMode() === 'play') this.doLock();
    }, w);
  }

  doLock() {
    const c = this.ctx.canvas;
    this.inflight = true;
    try {
      const p = c.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => this.onLockFail());
    } catch { this.onLockFail(); }
  }

  onLockFail() {
    if (!this.inflight) return; // pointerlockerror und Promise-Ablehnung melden denselben Fehler
    this.inflight = false;
    const since = performance.now() - this.unlockAt;
    if (since < LOCK_RECENT) {
      // Kürzlich per Esc verlassen: einmal verzögert wiederholen, danach bleibt der Klick-Hinweis
      if (!this.retried && this.attached) {
        this.retried = true;
        this.scheduleLock(this.unlockAt + LOCK_COOLDOWN - performance.now(), 150);
      }
      this.ctx.onLockChange(false);
      return;
    }
    this.dragLook = true;
    this.ctx.onLockChange(false);
  }

  /** Lock absichtlich freigeben (öffnet kein Pause-Menü). */
  releaseLock() {
    if (!this.locked) return;
    this.exiting = true;
    try { document.exitPointerLock(); } catch { this.exiting = false; }
  }

  onLockChange() {
    const locked = this.locked;
    this.inflight = false;
    if (!locked) {
      this.zoomKey = false;
      this.zoomBtn = false;
      this.syncZoom();
      const wasIntentional = this.exiting;
      this.exiting = false;
      if (!wasIntentional) this.unlockAt = performance.now(); // Esc-Exit: Chrome sperrt neue Anfragen ~1 s
      this.down.clear();
      if (!wasIntentional && this.ctx.getMode() === 'play') this.ctx.onLockLost();
    } else {
      this.dragLook = false;
      this.retried = false;
      this.clearLockTimer();
    }
    this.ctx.onLockChange(locked);
  }

  syncZoom() {
    const z = this.zoomKey || this.zoomBtn ? ZOOM_IN : 1;
    if (z === this.zoomSent) return;
    this.zoomSent = z;
    if (this.ctx.onZoom) this.ctx.onZoom(z);
  }

  onDown(e) {
    if (e.button === 2) {
      if (this.ctx.getMode() === 'play') { this.zoomBtn = true; this.syncZoom(); }
      return;
    }
    if (e.button !== 0) return;
    const mode = this.ctx.getMode();
    if (mode !== 'play') return;
    if (this.locked) { this.ctx.onTake(); return; }
    if (this.dragLook) { this.drag = { x: e.clientX, y: e.clientY, moved: 0 }; return; }
    this.requestLock();
  }

  onMove(e) {
    const p = this.ctx.player;
    const zf = this.ctx.getZoom ? Math.max(1, this.ctx.getZoom()) : 1;
    if (this.locked) {
      p.look((-e.movementX * this.sens) / zf, (-e.movementY * this.sens) / zf);
    } else if (this.dragLook && this.drag && (e.buttons & 1)) {
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
      p.look((-dx * 0.004) / zf, (-dy * 0.004) / zf);
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
    if (e.code === 'KeyQ') {
      e.preventDefault();
      e.stopPropagation();
      this.zoomKey = isDown && mode === 'play';
      this.syncZoom();
      return;
    }
    if (e.code === 'KeyE') {
      e.preventDefault();
      e.stopPropagation();
      if (isDown && !e.repeat && mode === 'play' && (this.locked || this.dragLook)) this.ctx.onTake();
    }
  }
}
