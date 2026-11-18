// VIDEOTHEK LENZ · Eingabeschicht des Touch-Schemas „Spiel“ (game), Spiel-Steuerung 2.0.
// Touch Events mit festen Rollen-Slots (Stick, Blick, Springen, Benutzen, Schlagen/Werfen, Zoom). Bei jedem Ereignis werden die Slots gegen
// e.touches abgeglichen (verwaiste Finger fallen raus), dazu Watchdogs, ein Gate (on/parked/off) und eine Diagnose. Die Ansicht
// (ui/gamepad.js: createGamepad) zeichnet nur; hier steckt die Logik. Der Kern (start/move/end/reconcile/releaseAll) ist
// ereignisquellen-neutral: Touch-Binder und Pointer-Rückfall (Maus/Stift, ?tapi=pointer) rufen dieselben Methoden.
import { stickVector, stickRadius } from '../ui/gamepad.js';
import { ZOOM_IN } from './desktop.js';

/** Tipp: höchstens so lange (ms) und so weit (px). */
export const TAP_MS = 250;
export const TAP_SLOP = 9;
/** Knopf: ab diesem Weg (px) wird der Finger zum Blick-Finger (Durchziehen). */
export const DRAG_SLOP = 12;
/** Geparkt (Kamerafahrt/Sperre): so lange (ms) bleiben liegende Finger gehalten, danach werden sie gelöst. */
export const PARK_MAX_MS = 1500;

const ROLES = ['stick', 'look', 'jump', 'use', 'act', 'zoom', 'view', 'aux'];
const BUTTONS = ['jump', 'use', 'act', 'zoom', 'view', 'aux'];
/**
 * Knopf-Liste (1.17.0): Name -> Rückrufe in den Optionen. onDown beim Drücken, onUp (optional, 1.18-Naht) beim Lösen
 * (Loslassen, Abbruch, Durchziehen zum Blick, Gate/Schema/Detach). 'act' wählt je nach Ansicht zwischen onHit und onThrow, 'zoom' liefert den Zoom-Wert.
 * 'aux' ist der freie Platz neben Schlagen (Knopf im Gamepad bleibt versteckt, solange er nicht per setAux gezeigt wird).
 */
const BUTTON_CBS = { jump: ['onJump', 'onJumpUp'], use: ['onUse', 'onUseUp'], act: ['onHit', 'onHitUp'], zoom: ['onZoom', null], view: ['onView', 'onViewUp'], aux: ['onAux', 'onAuxUp'] };
const LOG_MAX = 40;

const WHY_DE = {
  cancel: 'Systemabbruch', orphan: 'verwaist', reuse: 'ID doppelt', lost: 'Erfassung verloren', hidden: 'App verlassen', pagehide: 'Seite verlassen', blur: 'Fokus weg',
  orient: 'Drehen', 'mode:paused': 'Menü', 'mode:hold': 'Hülle', 'mode:overlay': 'Überlagerung', 'mode:off': 'Aus', xr: 'VR-Modus', scheme: 'Schema', detach: 'Aussetzen', reset: 'Zurücksetzen',
};
const ROLE_DE = { stick: 'am Stick', look: 'beim Umsehen', jump: 'am Knopf Springen', use: 'am Knopf Benutzen', act: 'am Knopf Schlagen', zoom: 'am Knopf Zoom', view: 'am Knopf Ansicht', aux: 'am Zusatzknopf' };
const ROLE_NAME = { stick: 'Stick', look: 'Blick', jump: 'Springen', use: 'Benutzen', act: 'Schlagen', zoom: 'Zoom', view: 'Ansicht', aux: 'Zusatz' };

function whyDe(w) {
  if (WHY_DE[w]) return WHY_DE[w];
  if (typeof w === 'string' && w.indexOf('mode:') === 0) return 'Modus';
  if (typeof w === 'string' && w.indexOf('locked:') === 0) return 'Kamerafahrt';
  return String(w || '');
}

/** Diagnose (GameTouch.diag()) → ein bis zwei Zeilen für das Pause-Menü (reine Funktion). */
export function diagLine(d) {
  if (!d) return '';
  const n = d.n || {};
  const names = Object.keys(d.roles || {}).filter((r) => d.roles[r] !== null && d.roles[r] !== undefined).map((r) => ROLE_NAME[r] || r);
  const parts = [`Eingabe: ${d.fingers || 0} Finger${names.length ? ` (${names.join(', ')})` : ''}`];
  const cleaned = (n.orphan || 0) + (n.reuse || 0);
  if (cleaned > 0) parts.push(`bereinigt ${cleaned}`);
  if ((n.cancel || 0) > 0) parts.push(`Abbrüche ${n.cancel}`);
  if (!cleaned && !(n.cancel > 0) && !d.last) parts.push('keine Abbrüche');
  if (d.last) parts.push(`zuletzt: ${whyDe(d.last.why)}${d.last.role && ROLE_DE[d.last.role] ? ` ${ROLE_DE[d.last.role]}` : ''} vor ${Math.round(d.last.ago)} s`);
  const lines = [parts.join(' · ')];
  if (d.lastHide) lines.push(`Pad aus zuletzt: ${whyDe(d.lastHide.why)} vor ${Math.round(d.lastHide.ago)} s${n.parkResume > 0 ? ` · fortgesetzt ${n.parkResume}×` : ''}`);
  return lines.join('\n');
}

export class GameTouch {
  /**
   * @param {object} o {
   *   now?() → ms, look(dx, dy) (Pixel-Delta des Blick-Fingers), onTap(x, y), onZoom(z), onJump(), onUse(), onHit(), onThrow(),
   *   onView() (Knopf Ansicht), optional Loslass-Rückrufe onJumpUp/onUseUp/onHitUp/onViewUp, onAux()/onAuxUp() (freier Knopf, 1.18-Naht),
   *   debug?: bool (Ereignis-Ringpuffer in diag().log), api?: 'touch' | 'pointer' (Binder; Standard 'touch', 'pointer' = Plan B),
   *   win?, doc? }
   */
  constructor(o = {}) {
    this.o = o;
    this.win = o.win || (typeof window !== 'undefined' ? window : null);
    this.doc = o.doc || (typeof document !== 'undefined' ? document : null);
    this.api = o.api === 'pointer' ? 'pointer' : 'touch';
    this.debug = !!o.debug;
    this.view = null;
    this.root = null;
    this.L = [];
    this.mq = null;
    this.slots = { stick: null, look: null, jump: null, use: null, act: null, zoom: null, view: null, aux: null };
    this.out = { fwd: 0, strafe: 0, scale: 0, run: false };
    this.state = 'on';
    this.why = '';
    this.parkSince = 0;
    this.fingers = 0;
    this.last = null;
    this.lastHide = null;
    this.log = [];
    this.layout = { w: 0, h: 0, portrait: false, R: 48, half: Infinity };
    this.n = { start: 0, end: 0, cancel: 0, orphan: 0, reuse: 0, lost: 0, parkResume: 0, rel: { mode: 0, locked: 0, xr: 0, hidden: 0, pagehide: 0, blur: 0, orient: 0, scheme: 0, detach: 0, reset: 0 } };
  }

  now() { return this.o.now ? this.o.now() : performance.now(); }

  /** Laufeingabe { fwd, strafe, scale, run } für Player.update (nur im Zustand 'on' ungleich 0). */
  get input() { return this.out; }

  get padShown() { return this.state === 'on'; }

  // --- Anbindung an die Ansicht ---
  attach(view) {
    if (this.view) this.detach('detach');
    this.view = view;
    this.root = view.root;
    this.refreshLayout();
    const r = this.root;
    const add = (t, type, fn, opts) => { t.addEventListener(type, fn, opts); this.L.push([t, type, fn, opts]); };
    const prevent = (e) => { if (e.cancelable) e.preventDefault(); };
    add(r, 'contextmenu', prevent);
    add(r, 'gesturestart', prevent);
    add(r, 'gesturechange', prevent);
    if (this.api === 'touch') {
      add(r, 'touchstart', (e) => this.onTouchStart(e), { passive: false });
      add(r, 'touchmove', (e) => this.onTouchMove(e), { passive: false });
      add(r, 'touchend', (e) => this.onTouchEnd(e, false), { passive: false });
      add(r, 'touchcancel', (e) => this.onTouchEnd(e, true), { passive: false });
    }
    // Pointer: im Standard nur Maus/Stift (Rückfall); bei api 'pointer' auch Touch (Plan B)
    add(r, 'pointerdown', (e) => this.onPtrDown(e));
    add(r, 'pointermove', (e) => this.onPtrMove(e));
    add(r, 'pointerup', (e) => this.onPtrUp(e, false));
    add(r, 'pointercancel', (e) => this.onPtrUp(e, true));
    add(r, 'lostpointercapture', (e) => this.onPtrLost(e));
    // Watchdogs
    if (this.doc) add(this.doc, 'visibilitychange', () => { if (this.doc.visibilityState === 'hidden' || this.doc.hidden === true) this.releaseAll('hidden'); });
    if (this.win) {
      add(this.win, 'pagehide', () => this.releaseAll('pagehide'));
      add(this.win, 'blur', () => this.releaseAll('blur'));
      add(this.win, 'orientationchange', () => this.releaseAll('orient'));
      add(this.win, 'resize', () => this.refreshLayout());
      let mq;
      try { mq = this.win.matchMedia ? this.win.matchMedia('(orientation: portrait)') : null; } catch { mq = null; }
      if (mq) {
        const fn = () => this.releaseAll('orient');
        if (mq.addEventListener) mq.addEventListener('change', fn);
        else if (mq.addListener) mq.addListener(fn);
        this.mq = { mq, fn };
      }
    }
    this.applyView();
  }

  detach(why = 'detach') {
    if (!this.view) return;
    this.releaseAll(why);
    for (const [t, type, fn, opts] of this.L) t.removeEventListener(type, fn, opts);
    this.L = [];
    if (this.mq) {
      const { mq, fn } = this.mq;
      if (mq.removeEventListener) mq.removeEventListener('change', fn);
      else if (mq.removeListener) mq.removeListener(fn);
      this.mq = null;
    }
    this.view = null;
    this.root = null;
  }

  applyView() {
    if (!this.view) return;
    this.view.show(this.state !== 'off');
    this.view.setParked(this.state === 'parked');
  }

  refreshLayout() {
    const w = this.win ? this.win.innerWidth || 0 : 0;
    const h = this.win ? this.win.innerHeight || 0 : 0;
    const L = this.layout;
    L.w = w; L.h = h; L.portrait = h > w;
    L.R = stickRadius(w || 800, h || 600);
  }

  /** Halbe Breite der Stick-Basis (px), falls die Ansicht sie schon gemessen hat; sonst unbegrenzt. */
  baseHalf() {
    const b = this.root && this.root.querySelector ? this.root.querySelector('.lfx-store-gp-base') : null;
    const w = b && b.offsetWidth;
    return w > 0 ? w / 2 : Infinity;
  }

  // --- Gate ---
  /** state: 'on' | 'parked' | 'off', why: Grund (z. B. 'mode:paused', 'locked:cam', 'xr'). Wird pro Frame aufgerufen und vergleicht billig. */
  setGate(state, why = '', now = this.now()) {
    const prev = this.state;
    if (state === 'parked' && prev === 'parked') {
      this.why = why;
      if (this.parkSince && now - this.parkSince > PARK_MAX_MS) { this.parkSince = 0; this.releaseAll(why); }
      return;
    }
    if (state === prev && why === this.why) return;
    this.state = state;
    this.why = why;
    if (state === 'off') {
      this.releaseAll(why);
      this.lastHide = { why, t: now };
    } else if (state === 'parked') {
      this.parkSince = now;
      this.lastHide = { why, t: now };
    }
    if (prev === 'parked' && state === 'on') {
      this.parkSince = 0;
      if (ROLES.some((r) => this.slots[r])) {
        this.n.parkResume++;
        if (this.slots.zoom && this.o.onZoom) this.o.onZoom(ZOOM_IN);
        if (this.slots.stick) this.applyStick();
      }
    }
    if (state !== 'on') this.clearOut();
    this.applyView();
  }

  // --- Rollen ---
  rolesOf(id) {
    const a = [];
    for (const r of ROLES) if (this.slots[r] && this.slots[r].id === id) a.push(r);
    return a;
  }

  clearOut() {
    const o = this.out;
    o.fwd = 0; o.strafe = 0; o.scale = 0; o.run = false;
  }

  /** Eine Rolle lösen. why 'end' = normales Loslassen (kein Protokoll), sonst Abbruch bei liegendem Finger. */
  drop(role, why) {
    const s = this.slots[role];
    if (!s) return;
    this.slots[role] = null;
    if (role === 'stick') {
      this.clearOut();
      if (this.view) this.view.restStick();
    } else if (role === 'zoom') {
      if (this.o.onZoom) this.o.onZoom(1);
      if (this.view) this.view.press('zoom', false);
    } else if (BUTTONS.includes(role) && this.view) {
      this.view.press(role, false);
    }
    if (BUTTONS.includes(role) && role !== 'zoom') this.up(role);
    if (why === 'end') return;
    const key = why.indexOf(':') > 0 ? why.slice(0, why.indexOf(':')) : why;
    if (why === 'orphan') this.n.orphan++;
    else if (why === 'reuse') this.n.reuse++;
    else if (why === 'cancel') this.n.cancel++;
    else if (why === 'lost') this.n.lost++;
    else if (Object.prototype.hasOwnProperty.call(this.n.rel, key)) this.n.rel[key]++;
    const t = this.now();
    this.last = { why, role, t, x: s.x !== undefined ? s.x : s.sx, y: s.y !== undefined ? s.y : s.sy };
    this.dlog('rel', s.id, role, this.last.x, this.last.y);
  }

  /** Loslass-Rückruf eines Knopfes (falls vorhanden). */
  up(role) {
    const cb = BUTTON_CBS[role] && BUTTON_CBS[role][1];
    if (cb && typeof this.o[cb] === 'function') this.o[cb]();
  }

  /** Alle Slots lösen (Grund für die Diagnose). */
  releaseAll(why) {
    for (const r of ROLES) this.drop(r, why);
  }

  /** Slots, deren Finger nicht mehr in der Liste liegen (Touch-ID-Liste e.touches), lösen. Pointer-Einträge (String-IDs) bleiben unberührt. */
  reconcile(ids) {
    for (const r of ROLES) {
      const s = this.slots[r];
      if (s && typeof s.id === 'number' && !ids.includes(s.id)) { this.dlog('orph', s.id, r, s.x, s.y); this.drop(r, 'orphan'); }
    }
  }

  dlog(code, id, role, x, y) {
    if (!this.debug) return;
    this.log.push([Math.round(this.now()), code, id, role, Math.round(x || 0), Math.round(y || 0)]);
    if (this.log.length > LOG_MAX) this.log.shift();
  }

  // --- Kern: Start / Bewegung / Ende ---
  /** Neuer Finger. Rückgabe true, wenn er eine Rolle bekommen hat. */
  start(id, x, y, target) {
    this.n.start++;
    this.dlog('ts', id, '', x, y);
    if (this.state !== 'on' || !this.view) return false;
    const v = this.view;
    const name = v.btnOf ? v.btnOf(target) : null;
    if (name && BUTTONS.includes(name)) {
      if (this.slots[name]) return false;
      this.slots[name] = { id, sx: x, sy: y, x, y, dragged: false };
      v.press(name, true);
      this.haptic(8);
      if (name === 'jump') { if (this.o.onJump) this.o.onJump(); }
      else if (name === 'use') { if (this.o.onUse) this.o.onUse(); }
      else if (name === 'act') { if (v.carrying) { if (this.o.onThrow) this.o.onThrow(); } else if (this.o.onHit) this.o.onHit(); }
      else if (name === 'zoom') { if (this.o.onZoom) this.o.onZoom(ZOOM_IN); }
      else if (name === 'view') { if (this.o.onView) this.o.onView(); }
      else if (name === 'aux') { if (this.o.onAux) this.o.onAux(); }
      return true;
    }
    if (!this.slots.stick && v.zoneOf(x, y)) {
      this.refreshLayout();
      this.layout.half = this.baseHalf();
      this.slots.stick = { id, ox: x, oy: y, sx: x, sy: y, x, y, t0: this.now(), moved: 0, latch: false };
      v.setStick(x, y, 0, 0, false);
      return true;
    }
    if (!this.slots.look) {
      this.slots.look = { id, x, y, sx: x, sy: y, t0: this.now(), moved: false };
      return true;
    }
    return false;
  }

  move(id, x, y) {
    this.dlog('tm', id, '', x, y);
    for (const r of this.rolesOf(id)) {
      if (r === 'stick') this.moveStick(x, y);
      else if (r === 'look') this.moveLook(x, y);
      else this.moveButton(r, x, y);
    }
  }

  moveStick(x, y) {
    const s = this.slots.stick;
    s.x = x; s.y = y;
    s.moved = Math.max(s.moved, Math.hypot(x - s.sx, y - s.sy));
    if (this.state === 'on') this.applyStick();
  }

  applyStick() {
    const s = this.slots.stick;
    const L = this.layout;
    const R = Math.min(L.R, L.half);
    let dx = s.x - s.ox;
    let dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { // Mitziehen: die Basis folgt, bleibt aber vollständig im Bild
      const k = (d - R) / d;
      s.ox += dx * k;
      s.oy += dy * k;
      const hb = Number.isFinite(L.half) ? L.half : R;
      if (L.w > 2 * hb) s.ox = Math.max(hb, Math.min(L.w - hb, s.ox));
      if (L.h > 2 * hb) s.oy = Math.max(hb, Math.min(L.h - hb, s.oy));
      dx = s.x - s.ox;
      dy = s.y - s.oy;
    }
    const v = stickVector(dx, dy, R, s.latch);
    if (v.run && !s.latch) this.haptic(12);
    s.latch = v.run;
    const o = this.out;
    o.fwd = v.fwd; o.strafe = v.strafe; o.scale = v.scale; o.run = v.run;
    s.m = v.m;
    if (this.view) this.view.setStick(s.ox, s.oy, v.kx, v.ky, v.run);
  }

  moveLook(x, y) {
    const s = this.slots.look;
    const dx = x - s.x;
    const dy = y - s.y;
    s.x = x; s.y = y;
    if (!s.moved && Math.hypot(x - s.sx, y - s.sy) > TAP_SLOP) s.moved = true;
    if (s.moved && this.state === 'on' && this.o.look) this.o.look(dx, dy);
  }

  moveButton(role, x, y) {
    const s = this.slots[role];
    s.x = x; s.y = y;
    if (s.dragged || Math.hypot(x - s.sx, y - s.sy) <= DRAG_SLOP || this.slots.look || this.state !== 'on') return;
    // Durchziehen: der Finger wird ab der aktuellen Position zum Blick-Finger (ohne Sprung)
    s.dragged = true;
    if (this.view) this.view.press(role, false);
    this.slots.look = { id: s.id, x, y, sx: x, sy: y, t0: this.now(), moved: true };
    if (role !== 'zoom') { this.slots[role] = null; this.up(role); } // der Zoom bleibt aktiv, solange der Finger liegt
  }

  /** Finger weg (cancelled = Systemabbruch). */
  end(id, cancelled) {
    this.dlog(cancelled ? 'tc' : 'te', id, '', 0, 0);
    this.n.end++;
    const live = this.state === 'on';
    for (const r of this.rolesOf(id)) {
      const s = this.slots[r];
      if (cancelled) { this.drop(r, 'cancel'); continue; }
      const tapOk = live && (r === 'stick' ? s.moved <= TAP_SLOP : r === 'look' ? !s.moved : false) && this.now() - s.t0 <= TAP_MS;
      const x = s.x;
      const y = s.y;
      this.drop(r, 'end');
      if (tapOk && this.o.onTap) this.o.onTap(x, y);
    }
  }

  // --- Touch-Binder ---
  idsOf(list) {
    const a = [];
    if (list) for (let i = 0; i < list.length; i++) a.push(list[i].identifier);
    return a;
  }

  onTouchStart(e) {
    if (!this.view) return;
    if (e.cancelable) e.preventDefault();
    this.fingers = e.touches ? e.touches.length : 0;
    const ch = e.changedTouches || [];
    for (let i = 0; i < ch.length; i++) { // Chrome recycelt IDs: ein neuer Finger mit einer vergebenen ID löst den alten Eintrag
      for (const r of this.rolesOf(ch[i].identifier)) this.drop(r, 'reuse');
    }
    this.reconcile(this.idsOf(e.touches));
    for (let i = 0; i < ch.length; i++) {
      const t = ch[i];
      this.start(t.identifier, t.clientX, t.clientY, t.target);
    }
  }

  onTouchMove(e) {
    if (!this.view) return;
    if (e.cancelable) e.preventDefault();
    this.fingers = e.touches ? e.touches.length : 0;
    this.reconcile(this.idsOf(e.touches));
    const ch = e.changedTouches || [];
    for (let i = 0; i < ch.length; i++) this.move(ch[i].identifier, ch[i].clientX, ch[i].clientY);
  }

  onTouchEnd(e, cancelled) {
    if (!this.view) return;
    this.fingers = e.touches ? e.touches.length : 0;
    const ch = e.changedTouches || [];
    for (let i = 0; i < ch.length; i++) this.end(ch[i].identifier, cancelled);
    this.reconcile(this.idsOf(e.touches));
  }

  // --- Pointer-Binder (Maus/Stift; bei api 'pointer' auch Touch) ---
  ptrOk(e) { return this.api === 'pointer' || e.pointerType !== 'touch'; }

  onPtrDown(e) {
    if (!this.view || !this.ptrOk(e)) return;
    if (this.api === 'pointer' && e.isPrimary && ROLES.some((r) => this.slots[r])) this.releaseAll('orphan'); // primärer Pointer = keine anderen aktiven Touches
    if (e.cancelable) e.preventDefault();
    const id = `p${e.pointerId}`;
    for (const r of this.rolesOf(id)) this.drop(r, 'reuse');
    if (this.start(id, e.clientX, e.clientY, e.target)) { try { this.root.setPointerCapture(e.pointerId); } catch { /* egal */ } }
  }

  onPtrMove(e) {
    if (!this.view || !this.ptrOk(e)) return;
    this.move(`p${e.pointerId}`, e.clientX, e.clientY);
  }

  onPtrUp(e, cancelled) {
    if (!this.view || !this.ptrOk(e)) return;
    this.end(`p${e.pointerId}`, cancelled);
  }

  onPtrLost(e) {
    if (!this.view || !this.ptrOk(e)) return;
    const id = `p${e.pointerId}`;
    for (const r of this.rolesOf(id)) this.drop(r, 'lost'); // feuert auch nach normalem pointerup: dann ist kein Slot mehr da
  }

  haptic(ms) {
    try { if (typeof navigator !== 'undefined' && navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(ms); } catch { /* egal */ }
  }

  // --- Diagnose ---
  diag() {
    const t = this.now();
    const S = this.slots;
    const roles = {};
    for (const r of ROLES) roles[r] = S[r] ? S[r].id : null;
    const s = S.stick;
    const base = this.root && this.root.querySelector ? this.root.querySelector('.lfx-store-gp-base') : null;
    let rest = null;
    try {
      const br = base && base.getBoundingClientRect ? base.getBoundingClientRect() : null;
      if (br && br.width > 0) rest = [Math.round(br.left + br.width / 2), Math.round(br.top + br.height / 2)];
    } catch { /* egal */ }
    const L = this.layout;
    return {
      v: 1,
      api: this.api,
      scheme: 'game',
      gate: this.state,
      gateWhy: this.why,
      fingers: this.fingers,
      roles,
      stick: s ? { x: Math.round(s.x - s.ox), y: Math.round(s.y - s.oy), m: +(s.m || 0).toFixed(2), run: !!s.latch, follow: Math.round(Math.hypot(s.ox - s.sx, s.oy - s.sy)) } : null,
      zoom: S.zoom ? ZOOM_IN : 1,
      n: { start: this.n.start, end: this.n.end, cancel: this.n.cancel, orphan: this.n.orphan, reuse: this.n.reuse, lost: this.n.lost, parkResume: this.n.parkResume, rel: { ...this.n.rel } },
      last: this.last ? { why: this.last.why, role: this.last.role, ago: +((t - this.last.t) / 1000).toFixed(1), x: Math.round(this.last.x), y: Math.round(this.last.y) } : null,
      lastHide: this.lastHide ? { why: this.lastHide.why, ago: +((t - this.lastHide.t) / 1000).toFixed(1) } : null,
      layout: { w: L.w, h: L.h, portrait: L.portrait, zone: this.view && this.view.zoneRect ? this.view.zoneRect() : null, R: Math.round(Math.min(L.R, L.half)), rest },
      log: this.debug ? this.log.slice() : [],
    };
  }
}
