// VIDEOTHEK LENZ · Touch-Steuerung: Ziehen (ein Finger) = Umsehen, Tippen = Gehen/Hülle nehmen (Logik in store.js).

export class TouchControls {
  /** @param {object} ctx { canvas, player, getMode(), onTap(clientX, clientY) } */
  constructor(ctx) {
    this.ctx = ctx;
    this.pointers = new Map();
    this.attached = false;
    this.h = {
      down: (e) => this.onDown(e),
      move: (e) => this.onMove(e),
      up: (e) => this.onUp(e, false),
      cancel: (e) => this.onUp(e, true),
      noCtx: (e) => e.preventDefault(),
    };
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
    this.pointers.clear();
  }

  onDown(e) {
    if (this.ctx.getMode() !== 'play') return;
    try { this.ctx.canvas.setPointerCapture(e.pointerId); } catch { /* egal */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false });
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p || this.ctx.getMode() !== 'play') return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (!p.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 9) p.moved = true;
    if (p.moved && this.pointers.size === 1) this.ctx.player.look(-dx * 0.0045, -dy * 0.0045);
  }

  onUp(e, cancelled) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p || cancelled || p.moved || this.ctx.getMode() !== 'play') return;
    if (performance.now() - p.t < 600 && this.pointers.size === 0) this.ctx.onTap(e.clientX, e.clientY);
  }
}
