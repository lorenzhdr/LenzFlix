// VIDEOTHEK LENZ · VR-Modus: Sitzung, Rig folgt dem Kopf, Eingabequellen (Controller/Hände), Fortbewegung, Laser, Menü, Hinweise.
// Paket A: input/locomotion/pointer/hands/vignette/menu/hud3d; Paket F: cinema/cinema.js.
import { Group } from 'three';
import { resolveCircle, isFree, nearestFree } from '../nav/path.js';
import { EYE } from '../controls/player.js';
import { XrSession, probeXr } from './session.js';
import { headLocal, headWorld, placeRig, turnAboutHead, seatedOffset } from './rig.js';
import { createFade } from './fade.js';
import { openPanel, rayClearance } from './panel.js';
import { createBubble3d } from './bubble3d.js';
import { readPad, emptyPad } from './input.js';
import { createLoco, stepLoco } from './locomotion.js';
import { createVignette } from './vignette.js';
import { Pointer } from './pointer.js';
import { attachVisuals, WristButton } from './hands.js';
import { Hud3d, diagLines } from './hud3d.js';
import { buildMenuSpec } from './menu.js';
import { Cinema } from '../cinema/cinema.js';

const RADIUS = 0.28;
const warn = (...a) => { try { console.warn('[LenzFlix Store3D]', ...a); } catch { /* egal */ } };

export class XrMode {
  constructor(app) {
    this.app = app;
    this.supported = false;
    this.visibility = 'visible';
    this.floor = true;
    /** Fortbewegung (Stick) schreibt hier hinein; scale 0..1. */
    this.input = { fwd: 0, strafe: 0, run: false, scale: 1 };
    this.fade = null;
    this.cinema = new Cinema(app);
    this.cinemaReported = false;
    this.panels = new Set();
    this.confirmPanel = null;
    this.menuPanel = null;
    this.afterEnd = [];
    this.placed = false;
    this.lastTp = 0;
    this.rigY = 0;
    this.lastX = 0;
    this.lastZ = 0;
    this.prevQuality = null;
    this.disposed = false;
    // Eingabe
    this.sources = []; // Eingabequellen-Datensätze (Index 0/1 des Renderers)
    this.loco = createLoco();
    this.locoOut = { fwd: 0, strafe: 0, run: false, scale: 1, turn: 0 };
    this.pointer = null;
    this.hud3d = null;
    this.vignette = null;
    this.wrist = null;
    this.bubbles = new Set();
    this.anchorFallback = null;
    this.selectQueue = [];
    this.aimHand = 'right';
    this.diagOn = false;
    this.diagAcc = 0;
    this.jumping = false;
    this.speed = 0;
    this.turnRate = 0;
    this.session = new XrSession({
      renderer: app.engine.renderer,
      onStart: (info) => this.onSessionStart(info),
      onEnd: () => this.onSessionEnd(),
      onVisibility: (v) => this.onVisibility(v),
    });
  }

  get presenting() { return this.session.presenting; }

  get inCinema() { return !!this.cinema.active; }

  probe() {
    return probeXr().then((v) => { this.supported = !!v; return this.supported; });
  }

  report(state) {
    try { const f = this.app.deps && this.app.deps.onXr; if (typeof f === 'function') f(state); } catch (err) { warn('onXr', err); }
  }

  /** Muss synchron aus einem Klick laufen. */
  enter() {
    this.prepareSources(); // Controller-Objekte müssen vor der Sitzung existieren, sonst ignoriert three neue Eingabequellen
    const p = this.session.enter(); // requestSession zuerst, synchron in der Nutzeraktivierung
    try {
      const ctx = this.app.mods && this.app.mods.ctx;
      const snd = ctx && ctx.use('sound');
      if (snd && typeof snd.unlock === 'function') snd.unlock();
      const cash = ctx && ctx.use('cashier');
      if (cash && typeof cash.unlockVoice === 'function') cash.unlockVoice();
    } catch (err) { warn('Entsperren', err); }
    Promise.resolve(p).then((ok) => { if (!ok && !this.presenting) this.releaseSources(); }, () => { if (!this.presenting) this.releaseSources(); });
    return p;
  }

  exit() { return this.session.exit(); }

  // --- Eingabequellen ---
  /** Controller/Grip/Hand-Objekte des Renderers holen und Ereignisse abonnieren (idempotent, noch nicht im Rig). */
  prepareSources() {
    if (this.sources.length || this.disposed) return;
    const xr = this.app.engine.renderer.xr;
    for (let i = 0; i < 2; i++) {
      const rec = { i, ray: xr.getController(i), grip: xr.getControllerGrip(i), handGroup: xr.getHand(i), source: null, side: null, pad: emptyPad(), pt: null, vis: null, off: [] };
      const on = (type, fn) => { rec.ray.addEventListener(type, fn); rec.off.push(() => rec.ray.removeEventListener(type, fn)); };
      on('connected', (e) => this.onConnected(rec, e.data));
      on('disconnected', () => this.onDisconnected(rec));
      on('selectstart', () => this.onSelect(rec));
      rec.vis = attachVisuals(rec);
      this.sources.push(rec);
    }
  }

  /** Abonnements und Objekte der Quellen entfernen. */
  releaseSources() {
    for (const rec of this.sources) {
      for (const off of rec.off) { try { off(); } catch { /* egal */ } }
      rec.off = [];
      if (rec.vis) { rec.vis.dispose(); rec.vis = null; }
      rec.ray.removeFromParent();
      rec.grip.removeFromParent();
      rec.handGroup.removeFromParent();
      rec.source = null;
    }
    this.sources = [];
    this.selectQueue.length = 0;
  }

  onConnected(rec, src) {
    if (!src) return;
    rec.source = src;
    rec.side = src.handedness === 'left' ? 'left' : 'right';
    rec.pad = emptyPad();
    if (rec.vis) rec.vis.setKind(!!src.hand);
  }

  onDisconnected(rec) {
    rec.source = null;
    rec.side = null;
    rec.pad = emptyPad();
    if (this.pointer) this.pointer.clearRec(rec);
  }

  onSelect(rec) {
    if (!this.inputActive() || !rec.source) return;
    if (!this.selectQueue.includes(rec)) this.selectQueue.push(rec);
  }

  /** Eingabe aktiv: Sitzung läuft und Sichtbarkeit „visible“. */
  inputActive() { return !this.disposed && this.presenting && this.visibility === 'visible'; }

  recFor(side) {
    for (const r of this.sources) if (r.source && r.side === side) return r;
    return null;
  }

  /** Pro Frame Gamepads lesen (Sticks, Knöpfe, Flanken). Trigger/Pinch kommen über select-Ereignisse. */
  pollInput() {
    const active = this.inputActive();
    for (const rec of this.sources) {
      if (!rec.source) continue;
      rec.pad = active ? readPad(rec.source.gamepad, rec.pad) : emptyPad();
    }
  }

  /** Grip-/B-Flanken und Trigger-Warteschlange abarbeiten (nach der Rig-Platzierung). */
  processActions(now) {
    if (!this.inputActive()) { this.selectQueue.length = 0; return; }
    for (const rec of this.sources) {
      if (!rec.source) continue;
      const e = rec.pad.edges;
      if (e.gripDown && this.pointer) this.pointer.grip(rec, now);
      if (e.bDown) this.back();
    }
    const q = this.selectQueue.splice(0);
    for (const rec of q) { if (rec.source && this.pointer) this.pointer.trigger(rec, now); }
  }

  /** Grip-Objekt der Hand (Hände: Zielstrahl-Ursprung). Ohne Quelle: Gruppe 0,45 m vor dem Kopf. */
  holdAnchor(hand) {
    const rec = this.recFor(hand === 'left' ? 'left' : 'right');
    if (rec) {
      const isHand = !!rec.source.hand;
      const o = isHand ? rec.ray : rec.grip;
      if (o.visible) { o.userData.lfxHold = isHand ? 'ray' : 'grip'; return o; } // Ausrichtung der Hülle (holdview.gripQuat)
    }
    if (!this.anchorFallback) {
      const g = new Group();
      g.name = 'lfx-xr-holdanchor';
      g.position.set(0, -0.1, -0.45);
      this.app.engine.camera.add(g);
      this.anchorFallback = g;
    }
    return this.anchorFallback;
  }

  bubble() {
    const eng = this.app.engine;
    const b = createBubble3d({ getScene: () => eng.scene, camera: eng.camera });
    this.bubbles.add(b);
    const dispose = b.dispose;
    b.dispose = () => { this.bubbles.delete(b); if (typeof dispose === 'function') dispose.call(b); };
    return b;
  }

  /** Zielobjekte für Diagnose/Tests: { kind, t, id, label, hit } oder null. */
  pointerInfo(hand) { return this.pointer ? this.pointer.targetOf(hand) : null; }

  // --- Sitzung ---
  onSessionStart({ floor }) {
    const app = this.app;
    if (this.disposed || app.disposed) { this.session.exit(); return; }
    this.floor = floor !== false;
    this.placed = false;
    this.lastTp = -1;
    // Desktop/Touch zuerst abhängen (Schließen von Overlay/Pause würde sonst Pointer-Lock anfordern)
    if (app.desktop) app.desktop.detach();
    if (app.touchCtl) { app.touchCtl.detach(); app.touchCtl.showPad(false); }
    if (app.mods) {
      if (app.mods.overlayState) app.mods.overlayClose();
      app.mods.release();
      if (app.mods.look) { const l = app.mods.look; app.mods.look = null; l.resolve(false); }
    }
    if (app.pause) { app.pause.closePick(); app.pause.hide(); }
    if (app.mode === 'paused' || app.mode === 'overlay') app.setMode('play');
    const p = app.player;
    p.cancelPath();
    p.turnTo = null;
    p.vx = 0; p.vz = 0;
    app.zoomTarget = 1;
    app.zoom = 1;
    app.engine.setZoom(1);
    app.clearAim();
    if (app.hud) { app.hud.showPrompt(false); app.hud.setCross(false, false); app.hud.setHint(null); }
    // Budget wie am Handy; Qualität nur low/mid
    this.prevQuality = app.qualitySetting;
    app.engine.setXrBudget(true);
    const vr = app.opts.vr || {};
    app.setQuality(vr.quality === 'low' ? 'low' : 'mid');
    app.engine.setFoveation(1);
    this.fade = createFade(app.engine.camera);
    this.input.fwd = 0; this.input.strafe = 0; this.input.run = false;
    this.setupXr();
    if (app.mods) app.mods.emit('xr', true);
    this.report({ presenting: true, cinema: false });
    app.syncUi();
  }

  /** Quellen ins Rig hängen, Laser/Anzeigen/Vignette/Handgelenk-Knopf anlegen. */
  setupXr() {
    this.prepareSources();
    const eng = this.app.engine;
    const rig = eng.rig;
    for (const rec of this.sources) rig.add(rec.ray, rec.grip, rec.handGroup);
    this.pointer = new Pointer(this);
    this.pointer.attach();
    this.hud3d = new Hud3d({ rig, camera: eng.camera });
    this.vignette = createVignette(eng.camera);
    this.wrist = new WristButton(rig);
    this.loco.running = false;
    this.loco.snapArmed = true;
    this.speed = 0;
    this.turnRate = 0;
    this.diagAcc = 0;
  }

  /** Alles abbauen, was setupXr()/prepareSources() angelegt hat (Sitzungsende und dispose). */
  teardownXr() {
    if (this.pointer) { this.pointer.dispose(); this.pointer = null; }
    if (this.hud3d) { this.hud3d.dispose(); this.hud3d = null; }
    if (this.vignette) { this.vignette.dispose(); this.vignette = null; }
    if (this.wrist) { this.wrist.dispose(); this.wrist = null; }
    for (const b of [...this.bubbles]) { try { b.dispose(); } catch { /* egal */ } }
    this.bubbles.clear();
    if (this.anchorFallback) { this.anchorFallback.removeFromParent(); this.anchorFallback = null; }
    this.releaseSources();
    this.loco.running = false;
    this.input.fwd = 0; this.input.strafe = 0; this.input.run = false; this.input.scale = 1;
    this.menuPanel = null;
  }

  onSessionEnd() {
    const app = this.app;
    const wasCinema = this.cinemaReported || this.cinema.active;
    this.closePanels();
    if (wasCinema) { this.cinema.leave('sessionend'); this.cinemaReported = false; }
    if (this.fade) { this.fade.dispose(); this.fade = null; }
    this.teardownXr();
    this.jumping = false;
    this.placed = false;
    const rig = app.engine && app.engine.rig;
    if (rig) { rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0); rig.updateMatrixWorld(true); }
    if (!app.disposed && app.engine) {
      app.engine.setXrBudget(false);
      if (this.prevQuality) app.setQuality(this.prevQuality);
      app.engine.setZoom(1);
      const p = app.player;
      if (p) { p.vx = 0; p.vz = 0; p.moved++; }
      if (!app.suspended) {
        if (app.desktop) { app.desktop.attach(); app.desktop.relockArmed = true; }
        if (app.touchCtl) app.touchCtl.attach();
      }
      if (!(app.holdview && app.holdview.isOpen)) app.setMode('play');
      else app.syncUi();
      if (app.mods) app.mods.emit('xr', false);
    }
    this.prevQuality = null;
    this.report({ presenting: false, cinema: false });
    if (!app.disposed) app.syncUi();
    const q = this.afterEnd.splice(0);
    for (const fn of q) { try { fn(); } catch (err) { warn('exitThen', err); } }
  }

  onVisibility(state) {
    this.visibility = state;
    if (state !== 'visible') {
      this.closeToast();
      this.selectQueue.length = 0;
      for (const rec of this.sources) rec.pad = emptyPad();
      this.input.fwd = 0; this.input.strafe = 0; this.input.run = false;
      this.loco.running = false;
      if (this.pointer) this.pointer.hideAll();
    }
    try { if (this.cinema && typeof this.cinema.onVisibility === 'function') this.cinema.onVisibility(state); } catch (err) { warn('Kino-Sichtbarkeit', err); }
  }

  // --- Schleife ---
  isFading() { return this.jumping || !!(this.fade && this.fade.alpha > 0.01); }

  /** Pro Frame in XR vor allem anderen: Eingabe lesen, Kopfpose → Spielerpose, Drehen/Gehen, Rig zurückrechnen, Laser. */
  beforeTick(dt, now, frame) {
    const app = this.app;
    const p = app.player;
    const eng = app.engine;
    if (this.fade) this.fade.update(dt);
    if (!frame || !p) return;
    this.pollInput();
    const head = headLocal(eng.renderer.xr.getCamera());
    const rig = eng.rig;
    const i = this.input;
    this.speed = 0;
    this.turnRate = 0;
    if (this.inCinema) {
      // Rig-Platzierung und Szene gehören dem Kino: kein Kopf→Spieler-Mapping, keine Fortbewegung
      i.fwd = 0; i.strafe = 0; i.run = false; i.scale = 1;
      this.loco.running = false;
    } else {
      const vr = app.opts.vr || {};
      const left = this.recFor('left');
      const right = this.recFor('right');
      const blocks = this.pointer ? this.pointer.blocks : { left: false, right: false };
      const res = stepLoco(this.loco, {
        left: left ? left.pad : null,
        right: right ? right.pad : null,
        dt,
        turnMode: vr.turn === 'smooth' ? 'smooth' : 'snap',
        locked: !!(app.mods && app.mods.locked) || this.isFading(),
        blockLeft: blocks.left,
        blockRight: blocks.right,
      });
      if (!this.placed || p.tp !== this.lastTp) {
        this.lastTp = p.tp;
        this.placed = true;
        this.rigY = this.heightFor(head);
        placeRig(rig, { x: p.x, z: p.z, yaw: p.yaw }, head, { y: this.rigY });
        p.pitch = head.pitch;
        this.lastX = p.x; this.lastZ = p.z;
      } else {
        const w = headWorld(rig, head);
        let yaw = w.yaw;
        if (res.turn) { turnAboutHead(rig, head, res.turn); yaw += res.turn; p.moved++; this.turnRate = dt > 0 ? Math.abs(res.turn) / dt : 0; }
        const r = resolveCircle(w.x, w.z, RADIUS, app.layout.colliders);
        p.x = r.x; p.z = r.z; p.yaw = yaw; p.pitch = head.pitch;
        i.fwd = res.fwd; i.strafe = res.strafe; i.run = res.run; i.scale = res.scale;
        this.locomote(dt);
        if (Math.abs(p.x - w.x) > 1e-5 || Math.abs(p.z - w.z) > 1e-5) {
          placeRig(rig, { x: p.x, z: p.z, yaw: p.yaw }, head, { y: this.rigY });
        }
        if (Math.hypot(p.x - this.lastX, p.z - this.lastZ) > 0.01) { this.lastX = p.x; this.lastZ = p.z; p.moved++; }
        this.speed = Math.hypot(p.vx, p.vz);
      }
    }
    this.afterPlace(dt, now);
  }

  /** Nach der Rig-Platzierung: Laser, Handgelenk-Knopf, Aktionen, Anzeigen, Panels, Blasen, Vignette. */
  afterPlace(dt, now) {
    const app = this.app;
    const eng = app.engine;
    if (this.wrist) this.wrist.update(this.recFor('left'), eng.camera.position); // Kopf im Rig-Raum (XR-Kamera)
    eng.rig.updateMatrixWorld(true);
    if (this.pointer) this.pointer.update(dt, now);
    this.processActions(now);
    if (this.hud3d) {
      this.hud3d.update(dt);
      if (this.diagOn) { this.diagAcc -= dt; if (this.diagAcc <= 0) { this.diagAcc = 0.5; this.hud3d.setDiag(this.diag()); } }
    }
    for (const h of [...this.panels]) { if (typeof h.tick === 'function') { try { h.tick(dt); } catch (err) { warn('Panel', err); } } }
    for (const b of this.bubbles) { try { b.update(dt); } catch (err) { warn('Blase', err); } }
    if (this.vignette) this.vignette.update(dt, !!(app.opts.vr && app.opts.vr.vignette !== false) && !this.inCinema, this.speed, this.turnRate);
  }

  /** Stick-Fortbewegung (Eingabe aus this.input; ohne Eingabe stehen). */
  locomote(dt) {
    const i = this.input;
    const p = this.app.player;
    if (i && (i.fwd || i.strafe)) {
      p.update(dt, i);
    } else { p.vx = 0; p.vz = 0; }
  }

  heightFor(head) {
    const pref = this.app.opts.vr && this.app.opts.vr.height;
    if (pref === 'seated') return seatedOffset(head.y, EYE);
    return this.floor ? 0 : EYE;
  }

  /** Neu ausrichten: Höhe und Rig beim nächsten Frame aus der Kopfpose neu berechnen. */
  recenter() { this.placed = false; }

  cinemaTick(dt, now) { this.cinema.tick(dt, now); }

  // --- Bewegung ---
  /** Schwarzblende + Teleport; face = yaw oder { x, z }. */
  async jumpTo(x, z, { face } = {}) {
    const app = this.app;
    const p = app.player;
    let yaw = p.yaw;
    if (typeof face === 'number') yaw = face;
    else if (face && Number.isFinite(face.x) && Number.isFinite(face.z)) yaw = Math.atan2(-(face.x - x), -(face.z - z));
    let tx = x;
    let tz = z;
    const nav = app.layout && app.layout.nav;
    if (nav && !isFree(nav, x, z)) { const n = nearestFree(nav, x, z); if (n) { tx = n.x; tz = n.z; } }
    const go = () => { p.teleport(tx, tz, yaw, 0); };
    if (this.fade && this.presenting) {
      this.jumping = true;
      try { await this.fade.jump(go); } finally { this.jumping = false; }
    } else go();
    return true;
  }

  // --- Panels / Hinweise ---
  openPanel(spec) {
    const app = this.app;
    const h = openPanel(spec, { anchor: (spec && spec.anchor) || 'front', camera: app.engine.camera, scene: app.engine.scene, clearance: this.inCinema ? null : (x, z, dx, dz, max) => rayClearance(app.layout && app.layout.colliders, x, z, dx, dz, max) });
    this.panels.add(h);
    const close = h.close;
    h.close = () => { this.panels.delete(h); close(); if (this.pointer) this.pointer.invalidate(); };
    if (this.pointer) this.pointer.invalidate();
    return h;
  }

  closePanels() {
    this.closeToast();
    for (const h of [...this.panels]) { try { h.close(); } catch { /* egal */ } }
    this.panels.clear();
    this.confirmPanel = null;
    this.menuPanel = null;
  }

  closeToast() { if (this.hud3d) this.hud3d.closeToast(); }

  toast(text, ms = 2600) {
    if (this.disposed || !this.presenting || !this.hud3d) return;
    this.hud3d.toast(text, ms);
  }

  /** Bestätigungs-Panel; bei „Ja“ Sitzung beenden, dann fn(). */
  exitThen(label, fn) {
    if (!this.presenting) { try { fn(); } catch (err) { warn('exitThen', err); } return true; }
    if (this.confirmPanel) { this.confirmPanel.close(); this.confirmPanel = null; }
    this.confirmFn = fn;
    this.confirmPanel = this.openPanel({
      text: label,
      width: 0.9,
      buttons: [
        { label: 'VR verlassen und fortfahren', primary: true, onSelect: () => this._confirm() },
        { label: 'Abbrechen', onSelect: () => this._cancel() },
      ],
      onClose: () => { this.confirmFn = null; this.confirmPanel = null; },
    });
    return true;
  }

  _confirm() {
    const fn = this.confirmFn;
    this.confirmFn = null;
    if (this.confirmPanel) { this.confirmPanel.close(); this.confirmPanel = null; }
    if (!fn) return;
    if (this.presenting) { this.afterEnd.push(fn); this.exit(); } else fn();
  }

  _cancel() {
    this.confirmFn = null;
    if (this.confirmPanel) { this.confirmPanel.close(); this.confirmPanel = null; }
  }

  // --- Menü ---
  openMenu() {
    if (!this.presenting || !this.hud3d) return;
    if (this.menuPanel) { this.closeMenu(); return; }
    this.menuPanel = this.openPanel(buildMenuSpec(this));
  }

  closeMenu() {
    const m = this.menuPanel;
    this.menuPanel = null;
    if (m && m.open) m.close();
  }

  refreshMenu() {
    const m = this.menuPanel;
    if (m && m.open) m.update(buildMenuSpec(this));
  }

  /** B/Y bzw. Handgelenk-Knopf: oberste Ebene (zuletzt geöffnetes Panel mit onClose) schließen, sonst Menü auf/zu. */
  back() {
    let top = null;
    for (const h of this.panels) { if (h.open && h.spec && typeof h.spec.onClose === 'function') top = h; }
    if (top) { top.close(); return true; }
    this.openMenu();
    return true;
  }

  /** Einstellungen sichern; in VR bleibt die 2D-Qualität erhalten (setQuality erzwingt dort nur low/mid). */
  savePrefs() {
    const app = this.app;
    const cur = app.qualitySetting;
    if (this.presenting && this.prevQuality) app.qualitySetting = this.prevQuality;
    try { app.savePrefs(); } finally { app.qualitySetting = cur; }
  }

  setDiag(on) {
    this.diagOn = !!on;
    this.diagAcc = 0;
    if (!this.diagOn && this.hud3d) this.hud3d.setDiag(null);
  }

  /** Diagnose-Zeilen (Sitzung, Raum, Eingabequellen, Kino). */
  diag() {
    let cin;
    try { cin = this.cinema && typeof this.cinema.diag === 'function' ? this.cinema.diag() : null; } catch { cin = null; }
    const sources = this.sources.filter((r) => r.source).map((r) => `${r.side === 'left' ? 'links' : 'rechts'} ${r.source.hand ? 'Hand' : 'Controller'}`);
    return diagLines({ visibility: this.visibility, space: this.floor ? 'local-floor' : 'local', sources, cinema: cin });
  }

  // --- Kino (Paket F) ---
  /** Vor dem echten deps.play() in VR. */
  beforePlay(item) {
    this.cinemaReported = true;
    this.report({ presenting: true, cinema: true });
    this.cinemaEnter(item);
  }

  cinemaEnter(item) { this.cinema.enter(item); }

  /** reason: 'home' | 'stop' | 'fail' | 'sessionend'; idempotent. */
  leaveCinema(reason, code) {
    if (!this.cinemaReported && !this.cinema.active) return;
    this.cinema.leave(reason, code);
    this.cinemaReported = false;
    if (reason !== 'sessionend' && this.presenting) this.report({ presenting: true, cinema: false });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.afterEnd = [];
    const was = this.presenting;
    this.closePanels();
    if (this.fade) { this.fade.dispose(); this.fade = null; }
    this.teardownXr();
    this.cinema.dispose();
    if (was) this.report({ presenting: false, cinema: false });
    this.session.dispose();
  }
}
