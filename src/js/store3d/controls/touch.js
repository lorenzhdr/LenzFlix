// VIDEOTHEK LENZ · Touch-Steuerung. Drei Schemata:
//  'game':     (Standard der App) schwebender Stick links = Laufen/Rennen, rechts überall wischen = Umsehen, Knöpfe Springen/Benutzen/Schlagen|Werfen/Zoom (ui/gamepad.js = Ansicht, controls/gametouch.js = Eingabe auf Touch Events).
//  'touch':    Gedrückt halten = vorwärts laufen (Ziehen lenkt), kurzes Wischen = Umsehen.
//  'joystick': Gehen-Knopf unten links = vorwärts, Joystick unten rechts = Blick drehen (ui/joypad.js); Wischen sieht zusätzlich um.
// Alle: kurzes Tippen = Hülle nehmen/benutzen (Logik in store.js); Pinch = Zoom nur bei 'touch'/'joystick' (bei 'game': Zoom-Knopf).
import { createJoypad } from '../ui/joypad.js';
import { createGamepad } from '../ui/gamepad.js';
import { GameTouch, diagLine } from './gametouch.js';

/** Bogenmaß pro Pixel beim Wischen/Lenken. */
export const TOUCH_LOOK = 0.0045;
/** Haltezeit (ms), ab der ein ruhender Finger zum Laufen wird. */
const TOUCH_HOLD_MS = 220;
/** Bewegungsschwelle (px) für „Finger ruht“. */
const TOUCH_SLOP = 9;
/** Joystick: Drehrate (rad/s) bei voller Auslenkung. */
export const STICK_YAW_RATE = 2.4;
export const STICK_PITCH_RATE = 1.5;
export const SCHEMES = ['game', 'joystick', 'touch'];
/** Empfindlichkeit (Faktor auf Umschauen und Cover-Drehung). */
export const SENS_FACTOR = { low: 0.7, normal: 1, high: 1.4 };

/** Umgreifen: Nachlauf (ms) nach dem Loslassen am Rand. */
const REGRIP_MS = { off: 0, short: 400, long: 800 };
/** Randzone (Anteil der Breite links/rechts), in der Loslassen den Nachlauf startet. */
const REGRIP_EDGE = 0.2;

/**
 * Touch-Feineinstellung normalisieren: { holdInvertY, holdInvertX, lookFlipY, lookFlipX, touchSens, touchRegrip }.
 * Standard: Umschauen „Normal“ (Flip aus), Umgreifen 'short'.
 */
export function normTune(t) {
  const o = t && typeof t === 'object' ? t : {};
  return {
    holdInvertY: o.holdInvertY === true,
    holdInvertX: o.holdInvertX === true,
    lookFlipY: o.lookFlipY === true,
    lookFlipX: o.lookFlipX === true,
    touchSens: Object.prototype.hasOwnProperty.call(SENS_FACTOR, o.touchSens) ? o.touchSens : 'normal',
    touchRegrip: Object.prototype.hasOwnProperty.call(REGRIP_MS, o.touchRegrip) ? o.touchRegrip : 'short',
  };
}
/** Blick-Delta (rad) aus einem Pixel-Delta des Fingers: Normal = Finger rechts → Blick rechts; Flip = „Szene greifen“; bei Zoom schwächer. Geteilt von Canvas-Wischen und Schema 'game'. */
export function lookDelta(dx, dy, tune, zoom) {
  const k = TOUCH_LOOK * SENS_FACTOR[tune.touchSens] / Math.max(1, zoom);
  return [dx * k * (tune.lookFlipX ? 1 : -1), dy * k * (tune.lookFlipY ? 1 : -1)];
}
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

export class TouchControls {
  /** @param {object} ctx { canvas, player, getMode(), onTap(x, y), onZoom?(z), getZoom?(), now?() → ms (Standard performance.now), getTune?() → Feineinstellung (normTune), scheme?: 'game' | 'touch' | 'joystick' (Klassen-Standard 'touch'; die App übergibt 'game'), padHost?, onJump?(), onUse?(), onHit?(), onThrow?(), onView?() (Schema 'game'; onView zeigt den Knopf „Ansicht“), debug?: bool (Eingabe-Ringpuffer), touchApi?: 'pointer' (Plan B: Pointer statt Touch Events im Schema 'game') } */
  constructor(ctx) {
    this.ctx = ctx;
    this.scheme = SCHEMES.includes(ctx.scheme) ? ctx.scheme : 'touch';
    this.pad = null;
    this.padWalk = false;
    this.stick = { x: 0, y: 0 };
    this.padShown = true;
    this.aimed = false; // Schema 'game': Ziel im Fadenkreuz (Benutzen-Knopf hervorheben)
    this.carrying = false; // Schema 'game': Hülle getragen (Werfen statt Schlagen)
    this.pointers = new Map();
    this.gateState = { state: 'on', why: '' }; // Gate (on/parked/off), siehe gate()
    const c = ctx;
    this.game = new GameTouch({
      now: () => this.now(),
      look: (dx, dy) => { const [a, b] = lookDelta(dx, dy, this.tune(), this.currentZoom()); this.ctx.player.look(a, b); },
      onTap: (x, y) => { if (c.getMode() === 'play' && c.onTap) c.onTap(x, y); },
      onZoom: (z) => this.setZoom(z),
      onJump: () => { if (c.onJump) c.onJump(); },
      onUse: () => { if (c.onUse) c.onUse(); },
      onHit: () => { if (c.onHit) c.onHit(); },
      onHitUp: () => { if (c.onHitUp) c.onHitUp(); },
      onAux: () => { if (c.onAux) c.onAux(); },
      onAuxUp: () => { if (c.onAuxUp) c.onAuxUp(); },
      onThrow: () => { if (c.onThrow) c.onThrow(); },
      onView: () => { if (c.onView) c.onView(); },
      debug: !!ctx.debug,
      api: ctx.touchApi,
    });
    this.attached = false;
    this.walkId = null; // pointerId des Fingers, der gerade läuft
    this.timer = 0;
    this.coastUntil = 0; // Umgreifen: Laufen läuft bis zu diesem Zeitpunkt (ms, now()) nach dem Loslassen weiter
    this.zoom = 1;
    this.pinch = null; // { d0, z0 }
    this.ring = null;
    this.h = {
      down: (e) => this.onDown(e),
      move: (e) => this.onMove(e),
      up: (e) => this.onUp(e, false),
      cancel: (e) => this.onUp(e, true),
      lost: (e) => { if (this.scheme !== 'game' && this.pointers.has(e.pointerId)) this.onUp(e, true); },
      noCtx: (e) => e.preventDefault(),
    };
  }

  /** Aktuelle Feineinstellung (ctx.getTune, zur Laufzeit änderbar). */
  tune() { return normTune(this.ctx.getTune ? this.ctx.getTune() : null); }

  now() { return this.ctx.now ? this.ctx.now() : performance.now(); }

  coasting() {
    if (!this.coastUntil) return false;
    if (this.ctx.getMode() !== 'play' || this.now() >= this.coastUntil) { this.coastUntil = 0; return false; }
    return true;
  }

  /** Eingabe für Player.update(): läuft nur im Laufmodus. */
  get input() {
    if (this.scheme === 'game') {
      if (this.ctx.getMode() !== 'play' && this.game.state === 'on') this.gate({ mode: this.ctx.getMode() });
      return this.game.input;
    }
    if ((this.walkId !== null || this.padWalk) && this.ctx.getMode() !== 'play') { this.stopWalk(); if (this.pad) this.pad.reset(); }
    return { fwd: this.walkId !== null || this.padWalk || this.coasting() ? 1 : 0, strafe: 0, run: false };
  }

  /** Pro Frame (nur im Laufmodus aufrufen): Joystick-Auslenkung → Blickdrehung. Rechts = Blick rechts, oben = Blick oben (lookFlip kehrt um). Bei Zoom schwächer. */
  tick(dt) {
    const { x, y } = this.stick;
    if ((!x && !y) || !(dt > 0)) return;
    if (this.ctx.getMode() !== 'play') return;
    const t = Math.min(dt, 0.1);
    const tu = this.tune();
    const f = SENS_FACTOR[tu.touchSens] / Math.max(1, this.currentZoom());
    this.ctx.player.look(-x * STICK_YAW_RATE * t * f * (tu.lookFlipX ? -1 : 1), -y * STICK_PITCH_RATE * t * f * (tu.lookFlipY ? -1 : 1));
  }

  /** Schema wechseln ('game' | 'joystick' | 'touch'): laufende Gesten enden, Pad wird erzeugt bzw. entfernt. */
  setScheme(s) {
    if (!SCHEMES.includes(s) || s === this.scheme) return;
    this.scheme = s;
    this.reset('scheme');
    if (this.attached) this.syncPad();
  }

  /**
   * Gate (pro Frame billig aufrufen): { play?, mode?, lock?: 'cam' | 'freeze' | '', xr? }.
   * 'on' = Laufmodus ohne Sperre; 'parked' = Laufmodus, aber Kamerafahrt/Sperre (Schema 'game': liegende Finger bleiben bis PARK_MAX_MS, Ausgabe 0);
   * 'off' = Pause/Hülle/Überlagerung/VR (alle Finger lösen). Schemata 'touch'/'joystick': nur 'on' zeigt das Pad.
   */
  gate(g = {}) {
    const play = g.play !== undefined ? !!g.play : g.mode === undefined ? true : g.mode === 'play';
    let state = 'on';
    let why = '';
    if (g.xr) { state = 'off'; why = 'xr'; }
    else if (!play) { state = 'off'; why = `mode:${g.mode || 'off'}`; }
    else if (g.lock) { state = 'parked'; why = `locked:${g.lock}`; }
    this.gateState = { state, why };
    const shown = state === 'on';
    const changed = shown !== this.padShown;
    this.padShown = shown;
    this.game.setGate(state, why);
    if (this.pad && this.padKind !== 'game' && changed) this.pad.show(shown);
  }

  /** Pad ein-/ausblenden (Kompatibilität, = gate({ play: on })). */
  showPad(on) { this.gate({ play: !!on }); }

  /** Eingabe-Diagnose (Zähler überstehen Schema-Wechsel und Aussetzen). */
  diag() {
    const d = this.game.diag();
    d.scheme = this.scheme;
    if (this.scheme !== 'game') { d.gate = this.gateState.state === 'on' ? 'on' : 'off'; d.gateWhy = this.gateState.why; }
    return d;
  }

  /** Zeile(n) für das Pause-Menü (nur Schema 'game'), sonst null. */
  diagLine() { return this.scheme === 'game' ? diagLine(this.diag()) : null; }

  /** Schema 'game': Ziel im Fadenkreuz / Hülle getragen (wirkt auch auf ein später erzeugtes Pad). */
  setAimed(on) { this.aimed = !!on; if (this.pad && this.pad.setAimed) this.pad.setAimed(this.aimed); }

  setCarrying(on) { this.carrying = !!on; if (this.pad && this.pad.setCarrying) this.pad.setCarrying(this.carrying); }

  syncPad() {
    if (this.pad && (!this.attached || this.padKind !== this.scheme)) { // anderes Schema oder abgehängt: altes Pad entfernen
      if (this.padKind === 'game') this.game.detach(this.attached ? 'scheme' : 'detach');
      this.pad.destroy();
      this.pad = null;
      this.padWalk = false;
      this.stick = { x: 0, y: 0 };
    }
    if (this.scheme === 'game' && this.attached) {
      if (!this.pad) {
        const host = this.ctx.padHost || this.ctx.canvas.parentElement || document.body;
        const c = this.ctx;
        this.pad = createGamepad(host, { now: c.now });
        this.pad.setAimed(this.aimed);
        this.pad.setCarrying(this.carrying);
        if (this.pad.setViewShown) this.pad.setViewShown(!!c.onView);
        if (this.pad.setAux && c.onAux) this.pad.setAux(true, 'WAFFE'); // 1.18.0: Waffenknopf neben „Schlagen“ (tippen = Rad, halten mit Laser = leuchten)
        this.padKind = 'game';
        this.game.attach(this.pad); // übernimmt den aktuellen Gate-Zustand
      }
    } else if (this.scheme === 'joystick' && this.attached) {
      if (!this.pad) {
        const host = this.ctx.padHost || this.ctx.canvas.parentElement || document.body;
        this.pad = createJoypad(host, {
          onWalk: (on) => {
            this.padWalk = !!on && this.ctx.getMode() === 'play';
            if (this.padWalk && this.currentZoom() !== 1) this.setZoom(1);
          },
          onLook: (x, y) => { this.stick = { x, y }; },
        });
        this.padKind = 'joystick';
      }
      this.pad.show(this.padShown);
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
    c.addEventListener('lostpointercapture', this.h.lost);
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
    c.removeEventListener('lostpointercapture', this.h.lost);
    c.removeEventListener('contextmenu', this.h.noCtx);
    this.reset('detach');
    this.syncPad();
    if (this.ring) { this.ring.remove(); this.ring = null; }
  }

  reset(why = 'reset') {
    this.game.releaseAll(why);
    if (this.pad && this.padKind === 'game' && this.zoom !== 1) this.setZoom(1);
    this.clearTimer();
    this.coastUntil = 0;
    this.walkId = null;
    this.pinch = null;
    this.pointers.clear();
    this.hideRing();
    if (this.pad && this.padKind !== 'game' && this.pad.reset) this.pad.reset();
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
    if (this.scheme === 'game') return; // Schema 'game': die Eingabe liegt in controls/gametouch.js
    if (this.ctx.getMode() !== 'play') return;
    if (e.isPrimary && e.pointerType === 'touch' && this.pointers.size > 0) { // verwaister Rest (ein primärer Pointer entsteht nur ohne andere aktive Touches)
      this.pointers.clear();
      this.clearTimer();
      this.stopWalk();
      this.pinch = null;
    }
    try { this.ctx.canvas.setPointerCapture(e.pointerId); } catch { /* egal */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, dead: false, walked: false });
    this.clearTimer();
    const wasCoasting = this.coasting();
    this.coastUntil = 0;
    if (this.pointers.size === 1) {
      const id = e.pointerId;
      if (this.scheme === 'touch' && wasCoasting) this.startWalk(id); // Umgreifen: sofort weiterlaufen, keine Haltezeit
      else if (this.scheme === 'touch') this.timer = setTimeout(() => { this.timer = 0; this.startWalk(id); }, TOUCH_HOLD_MS);
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
    try { if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(8); } catch { /* egal */ }
  }

  onMove(e) {
    if (this.scheme === 'game') return;
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
    // Normal (Flip aus): Kamera-Konvention wie die Maus – Finger nach rechts → Blick nach rechts, Finger nach oben → Blick nach oben.
    // Umgekehrt (Flip an) = „Szene greifen“. Bei Zoom schwächer (wie desktop.js).
    if (p.moved || p.walked) {
      const [ya, pi] = lookDelta(dx, dy, this.tune(), this.currentZoom());
      this.ctx.player.look(ya, pi);
    }
    if (p.walked) this.moveRing(e.clientX, e.clientY);
  }

  onUp(e, cancelled) {
    if (this.scheme === 'game') return;
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.clearTimer();
    const wasWalk = this.walkId === e.pointerId;
    if (wasWalk) this.stopWalk();
    if (wasWalk && this.scheme === 'touch' && this.ctx.getMode() === 'play') { // auch pointercancel (System-Geste am Rand)
      const ms = REGRIP_MS[this.tune().touchRegrip];
      const w = window.innerWidth;
      if (ms > 0 && w > 0 && (e.clientX < w * REGRIP_EDGE || e.clientX > w * (1 - REGRIP_EDGE))) this.coastUntil = this.now() + ms;
    }
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
