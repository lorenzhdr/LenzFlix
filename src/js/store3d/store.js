// VIDEOTHEK LENZ · create(host, deps, opts) → instance (Vertrag: docs/store3d.md).
import {
  Vector3, Quaternion, Raycaster, Mesh, BoxGeometry, RingGeometry, MeshBasicMaterial, AdditiveBlending, DoubleSide,
} from 'three';
import { buildLayout } from './world/layout.js';
import { findPath, nearestFree, isFree } from './nav/path.js';
import { createEngine } from './engine/renderer.js';
import { makeTextures, makeCanvas, toTexture } from './world/textures.js';
import { buildRoom, addLights } from './world/build-room.js';
import { buildShelves, slotWorld } from './world/build-shelves.js';
import { buildSigns } from './world/build-signs.js';
import { buildProps } from './world/build-props.js';
import { CoverManager } from './covers/manager.js';
import { Player, EYE } from './controls/player.js';
import { DesktopControls } from './controls/desktop.js';
import { TouchControls, SCHEMES, normTune } from './controls/touch.js';
import { createRotateHint } from './ui/rotate.js';
import { pickCover, pickBoxes } from './controls/pick.js';
import { ModuleHost } from './modules/runtime.js';
import { createHud } from './ui/hud.js';
import { createPause } from './ui/pause.js';
import { HoldView } from './ui/holdview.js';
import { createFullscreen } from './ui/fullscreen.js';
import { wrapDeps } from './xr/guard.js';
import { XrMode } from './xr/mode.js';

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

function resolveLevel(setting) {
  if (setting === 'low' || setting === 'mid' || setting === 'high') return setting;
  return 'mid'; // Start immer auf „mid“, die Automatik schaltet bei stabil > 58 fps hoch
}

/** VR-Prefs (Vertrag): turn snap|smooth, vignette bool, height auto|seated, quality mid|low, seat front|mid|back. */
export function normalizeVr(v) {
  const o = v && typeof v === 'object' ? v : {};
  return {
    turn: o.turn === 'smooth' ? 'smooth' : 'snap',
    vignette: o.vignette !== false,
    height: o.height === 'seated' ? 'seated' : 'auto',
    quality: o.quality === 'low' ? 'low' : 'mid',
    seat: o.seat === 'front' || o.seat === 'back' ? o.seat : 'mid',
  };
}

class StoreApp {
  constructor(host, deps, opts) {
    this.host = host;
    this.xr = null;
    this.deps = wrapDeps(deps, () => this.xr); // in VR leiten die Wrapper DOM-Wege um (xr/guard.js)
    this.opts = { ...(opts || {}), vr: normalizeVr(opts && opts.vr) };
    this.vr = this.opts.vr;
    this.phone = !!this.opts.phone;
    this.touch = !!this.opts.touch;
    this.qualitySetting = ['auto', 'low', 'mid', 'high'].includes(this.opts.quality) ? this.opts.quality : 'auto';
    this.sound = !!this.opts.sound;
    this.showFps = this.opts.showFps === true;
    this.voiceOnline = this.opts.voiceOnline === true;
    this.voiceName = typeof this.opts.voiceName === 'string' ? this.opts.voiceName : '';
    this.voicePitch = ['normal', 'tief', 'sehrtief'].includes(this.opts.voicePitch) ? this.opts.voicePitch : 'tief';
    this.bigCovers = this.opts.bigCovers !== false;
    this.touchScheme = SCHEMES.includes(this.opts.touchControl) ? this.opts.touchControl : 'joystick';
    this.touchTune = normTune(this.opts.touchTune);
    this.zoomTarget = 1;
    this.zoom = 1;
    this.lastFps = 0;
    this.disposed = false;
    this.suspended = false;
    this.ready = false;
    this.failed = false;
    this.mode = 'boot'; // boot | play | hold | paused
    this.takingNext = false;
    this.pendingTake = null;
    this.lastMoved = -1;
    this.lastNotify = 0;
    this.lastCover = 0;
    this.lastAim = 0;
    this.readyFrames = 0;
    this.aim = null;
    this.stateCache = { x: 0, z: 0, yaw: 0, pitch: 0, heldId: null };
    this.rc = new Raycaster();
    this._v = new Vector3();
    this._q = new Quaternion();
    this._d = new Vector3();

    const items = deps.catalog && deps.catalog.items;
    this.items = items instanceof Map ? items : new Map(Object.entries(items || {}));

    try {
      this.engine = createEngine({
        host,
        level: resolveLevel(this.qualitySetting),
        auto: this.qualitySetting === 'auto',
        phone: this.phone,
        onContextLost: () => this.onContextLost(),
        onContextRestored: () => this.onContextRestored(),
        onAutoLevel: () => this.applyPreset(this.engine.preset),
      });
    } catch (err) {
      this.fail(err);
      return;
    }
    this.xr = new XrMode(this);
    this.hud = createHud(host, { touch: this.touch, onMenu: () => this.openPause(), onVr: () => this.xr.enter() });
    this.fs = createFullscreen({
      host, isTouch: this.touch, getMode: () => (this.mods && this.mods.locked ? 'locked' : this.mode), userId: (deps.user && (deps.user.id || deps.user.name)) || 'anon', hud: this.hud,
      onChange: () => { if (this.pause) this.pause.refresh(); },
    });
    this.rotate = this.phone ? createRotateHint(host, { getMode: () => this.mode }) : null;
    this.pause = createPause(host, {
      onResume: () => this.resumeFromPause(),
      onVr: () => this.xr.enter(),
      getVr: () => this.xr.supported && !this.xr.presenting,
      onSearch: () => { this.resumeFromPause(); this.openTerminal(''); },
      onClassic: () => this.deps.classicView(),
      onQuality: (q) => { this.setQuality(q); this.savePrefs(); },
      onSound: (on) => { this.setSound(on); this.savePrefs(); },
      onFps: (on) => { this.setShowFps(on); this.savePrefs(); },
      onVoice: (p) => { this.setVoicePrefs(p); this.savePrefs(); this.previewVoice(); }, // synchron im Klick (iOS-Nutzergeste)
      getVoicePrefs: () => ({ name: this.voiceName, online: this.voiceOnline, pitch: this.voicePitch }),
      getVoiceList: () => { const c = this.mods && this.mods.ctx.use('cashier'); return c && c.voices ? c.voices() : []; },
      onBigCovers: (on) => this.setBigCovers(on),
      onTouchControl: this.touch ? (s) => { this.setTouchControl(s); this.savePrefs(); } : null,
      getTouchControl: () => this.touchScheme,
      onTouchTune: this.touch ? (p) => { this.setTouchTune(p); this.savePrefs(); } : null,
      getTouchTune: () => this.touchTune,
      onTheme: () => this.deps.openThemePicker(),
      onMenu: (anchor) => this.deps.openMenu(anchor),
      getQuality: () => this.qualitySetting,
      getSound: () => this.sound,
      getFps: () => this.showFps,
      getBigCovers: () => this.bigCovers,
      getVoiceInfo: () => { const c = this.mods && this.mods.ctx.use('cashier'); return c && c.voiceInfo ? c.voiceInfo() : null; },
      onFullscreen: () => this.fs.toggle(),
      getFullscreen: () => this.fs.isOn(),
      fullscreenKind: () => this.fs.kind,
    });
    this.boot().catch((err) => this.fail(err));
  }

  fail(err) {
    this.failed = true;
    try { console.warn('[LenzFlix Store3D]', err); } catch { /* egal */ }
    try { if (this.deps.onFatal) this.deps.onFatal(err); } catch { /* egal */ }
  }

  progress(f, label) { try { if (this.deps.onProgress) this.deps.onProgress(f, label); } catch { /* egal */ } }

  async boot() {
    const { engine } = this;
    const deps = this.deps;
    const preset = engine.preset;
    this.progress(0.02, 'Grundriss wird berechnet');
    const big = this.opts.bigCovers !== false;
    this.layout = buildLayout((deps.catalog && deps.catalog.departments) || [], { big });
    const L = this.layout;
    await yieldFrame();
    if (this.disposed) return;

    this.progress(0.12, 'Teppich wird verlegt');
    const bc = makeCanvas(8, 8);
    const bx = bc.getContext('2d');
    bx.fillStyle = '#fff';
    bx.fillRect(0, 0, 8, 8);
    this.blank = toTexture(bc, { mips: false });
    this.tex = makeTextures(preset);
    await yieldFrame();
    if (this.disposed) return;

    this.progress(0.3, 'Wände und Decke werden gebaut');
    this.room = buildRoom(L, this.tex);
    this.lights = addLights(engine.scene, L);
    this.lights.setShadows(preset.shadows);
    engine.scene.add(this.room.group);
    await yieldFrame();
    if (this.disposed) return;

    this.progress(0.5, 'Regale werden aufgestellt');
    this.shelves = buildShelves(L, this.items, this.blank, this.tex.wood);
    this.shelves.frameMesh.castShadow = true;
    engine.scene.add(this.shelves.group);
    await yieldFrame();
    if (this.disposed) return;

    this.progress(0.66, 'Neonschilder leuchten auf');
    this.signs = buildSigns(L, preset);
    engine.scene.add(this.signs.group);
    this.props = buildProps(L, preset);
    engine.scene.add(this.props.group);
    this.buildOverlays();
    await yieldFrame();
    if (this.disposed) return;

    this.progress(0.8, 'Cover werden geholt');
    this.player = new Player(L);
    this.covers = new CoverManager({
      faceViews: this.shelves.faceViews, items: this.items, deps, preset, blankTex: this.blank, renderer: engine.renderer, phone: this.phone, spec: L.spec,
    });
    this.holdview = new HoldView({
      host: this.host, camera: engine.camera, deps, items: this.items, shelves: this.shelves, covers: this.covers, layout: L,
      notify: () => this.notifyState(true),
      onClosed: () => this.onHoldClosed(),
      openPanel: (spec) => this.xr.openPanel(spec),
      isXr: () => !!(this.xr && this.xr.presenting),
      getTune: () => this.touchTune,
      onPlay: (item, resume) => this.mods && this.mods.emit('play', item, { resume }),
    });
    this.mods = new ModuleHost(this);
    this.desktop = this.touch ? null : new DesktopControls({
      canvas: engine.canvas,
      player: this.player,
      getMode: () => this.mode,
      onLockLost: () => this.openPause(),
      onLockChange: () => this.syncUi(),
      onTake: () => this.takeAimed(),
      onZoom: (z) => this.setZoom(z),
      getZoom: () => this.zoom,
      onEscape: () => {
        if (this.mode === 'hold') this.holdview.close(true);
        else if (this.mode === 'overlay') this.mods.overlayClose();
        else if (this.pause && this.pause.pickOpen) this.pause.closePick();
        else this.resumeFromPause();
      },
    });
    this.touchCtl = this.touch ? new TouchControls({ canvas: engine.canvas, player: this.player, getMode: () => this.mode, onTap: (x, y) => this.onTap(x, y), onZoom: (z) => this.setZoom(z), getZoom: () => this.zoomTarget, scheme: this.touchScheme, getTune: () => this.touchTune }) : null;

    this.progress(0.86, 'Module werden geladen');
    this.mods.ctx.on('xr', (on) => this.onXrHold(on));
    await this.mods.init((f) => this.progress(0.86 + f * 0.05, 'Module werden geladen'));
    if (this.disposed) return;
    // Startposition / Wiederherstellung
    const r = this.opts.restore;
    if (r && Number.isFinite(r.x) && Number.isFinite(r.z)) {
      const free = isFree(L.nav, r.x, r.z) ? { x: r.x, z: r.z } : nearestFree(L.nav, r.x, r.z) || L.spawn;
      this.player.teleport(free.x, free.z, Number.isFinite(r.yaw) ? r.yaw : 0, Number.isFinite(r.pitch) ? r.pitch : 0);
    }
    this.player.applyCamera(engine.camera);
    this.covers.update(this.player.x, this.player.z, this.player.yaw, { zoom: this.zoom, pitch: this.player.pitch });
    await yieldFrame();
    if (this.disposed) return;

    // Cover aller Regale in niedriger Qualität vorladen (höchstens 20 s, der Rest lädt im Hintergrund weiter)
    this.progress(0.92, 'Cover werden vorgeladen');
    const pre = this.covers.startPreload({
      px: this.player.x, pz: this.player.z,
      onProgress: (done, total) => this.progress(0.92 + 0.07 * (total ? done / total : 1), 'Cover werden vorgeladen'),
    });
    await pre.wait(20000);
    if (this.disposed) return;
    this.progress(0.99, 'Erste Cover werden gezeichnet');
    this.covers.update(this.player.x, this.player.z, this.player.yaw, { zoom: this.zoom, pitch: this.player.pitch });
    await this.covers.buildLowAll(yieldFrame);
    if (this.disposed) return;
    for (let i = 0; i < 3; i++) this.covers.tick();
    if (!r && engine.camera.aspect < 1) this.player.pitch = -0.25; // Hochformat: weniger Decke, mehr Regal
    this.mode = 'play';
    if (this.desktop) this.desktop.attach();
    if (this.touchCtl) this.touchCtl.attach();
    if (this.opts.debug) this.exposeDebug();
    this.engine.start((dt, now, frame) => this.tick(dt, now, frame));
    this.syncUi();
    this.xr.probe().then(() => { if (!this.disposed) this.syncUi(); });
    if (this.suspended) { this.engine.stop(); this.desktop && this.desktop.detach(); }

    // Intro-Provider (Modul): nach dem ersten Bild, außer es wurde in dieser Sitzung schon gesehen
    const intro = this.mods.ctx.use('intro');
    if (intro && !this.opts.skipIntro) {
      await new Promise((res) => { this.onReadyHook = res; if (this.ready) res(); });
      if (this.disposed) return;
      try { await intro.run(); } catch (err) { console.warn('[LenzFlix Store3D] Intro', err); }
      if (this.disposed) return;
    }
    this.mods.emit('enter');
    if (this.opts.openItemId) this.openItem(this.opts.openItemId);
    else if (r && r.heldId) this.take(r.heldId, { instant: true });
    if (this.opts.openTerminal) this.openTerminal(this.opts.query || '');
  }

  buildOverlays() {
    this.highlight = new Mesh(
      new BoxGeometry(0.17, 0.23, 0.05),
      new MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.22, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
    );
    this.highlight.visible = false;
    this.highlight.renderOrder = 6;
    this.engine.scene.add(this.highlight);
    this.marker = new Mesh(
      new RingGeometry(0.16, 0.22, 40),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, side: DoubleSide, toneMapped: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.marker.renderOrder = 6;
    this.engine.scene.add(this.marker);
  }

  // --- Modus / UI ---
  setMode(m) { this.mode = m; this.syncUi(); if (this.fs) this.fs.update(); }

  syncUi() {
    if (!this.hud) return;
    const xr = this.xr;
    if (xr && xr.presenting) {
      // In VR gibt es kein DOM-HUD und keine Desktop-/Touch-Steuerung
      this.hud.setCross(false, false);
      this.hud.showPrompt(false, false);
      this.hud.showMenuBtn(false);
      this.hud.showVr(false);
      this.hud.setHint(null);
      if (this.touchCtl) this.touchCtl.showPad(false);
      if (this.pause && this.pause.visible) this.pause.hide();
      return;
    }
    const play = this.mode === 'play';
    const locked = this.desktop ? this.desktop.locked || this.desktop.dragLook : true;
    this.hud.setCross(play && !!this.desktop && locked, !!this.aim);
    this.hud.showPrompt(this.ready && play && !!this.desktop && !locked && !this.suspended, !!(this.desktop && this.desktop.relockArmed));
    this.hud.showMenuBtn(play);
    if (this.touchCtl) this.touchCtl.showPad(play && !(this.mods && this.mods.locked));
    if (this.rotate) this.rotate.update();
    // auch mit Hülle in der Hand (z. B. nach Wiederherstellung): sie wandert beim Betreten in die Hand
    this.hud.showVr(this.ready && (play || this.mode === 'hold') && !!xr && xr.supported && !xr.presenting);
    if (!play || !this.aim) this.hud.setHint(null);
    if (this.pause && this.mode !== 'paused' && this.pause.visible) this.pause.hide();
  }

  openPause() {
    if (this.xr && this.xr.presenting) { this.xr.openMenu(); return; }
    if (this.mode !== 'play') return;
    this.player.cancelPath();
    this.marker.visible = false;
    this.setMode('paused');
    if (this.desktop) this.desktop.releaseLock();
    this.pause.show();
  }

  resumeFromPause() {
    if (this.mode !== 'paused') return;
    this.pause.hide();
    this.setMode('play');
    if (this.desktop) this.desktop.requestLock();
  }

  onHoldClosed() {
    if (this.disposed || this.takingNext) return;
    if (this.heldId) { this.mods.emit('put', this.heldId); this.heldId = null; }
    this.setMode('play');
    if (this.desktop && !this.suspended) this.desktop.requestLock();
    this.notifyState(true);
  }

  // --- Hülle nehmen ---
  findSlot(id) {
    const pl = (this.layout.placements[id] || []).slice().sort((a, b) => (a.dept === 'new') - (b.dept === 'new'));
    for (const p of pl) {
      const fv = this.shelves.faceViews[p.face];
      const info = fv && fv.byIdx.get(p.slot);
      if (info && !info.hidden) return { fv, info };
    }
    return null;
  }

  /** VR-Start/-Ende: offene Hülle in die rechte Hand bzw. zurück an die Kamera (2D-Pose, DOM-Panel). */
  onXrHold(on) {
    const hv = this.holdview;
    if (!hv || this.disposed || !hv.isOpen) return;
    if (on) hv.reanchor(this.holdAnchorFor('right'), { xr: true, hand: 'right' });
    else hv.reanchor(this.engine.camera, { xr: false });
  }

  holdAnchorFor(hand) {
    const a = this.xr && typeof this.xr.holdAnchor === 'function' ? this.xr.holdAnchor(hand || 'right') : null;
    return a || this.engine.camera;
  }

  take(id, { instant = false, fromCounter = false, hand, grab = false, from } = {}) {
    if (!this.holdview || this.disposed || !id) return false;
    if (this.holdview.isOpen) {
      this.takingNext = true;
      this.holdview.close(false);
      this.takingNext = false;
    }
    const xr = !!(this.xr && this.xr.presenting);
    const slot = fromCounter || from === 'counter' ? null : this.findSlot(id);
    this.heldId = id;
    this.setMode('hold');
    this.pendingTake = null;
    this.player.cancelPath();
    this.marker.visible = false;
    if (this.desktop) this.desktop.releaseLock();
    this.clearAim();
    if (xr) this.holdview.open(id, slot, instant, { xr: true, anchor: this.holdAnchorFor(hand), hand: hand || 'right', grab: !!grab });
    else this.holdview.open(id, slot, instant);
    this.mods.emit('take', id);
    return true;
  }

  put() { if (this.holdview && this.holdview.isOpen) this.holdview.close(true); }

  takeAimed() {
    if (this.mode !== 'play' || !this.aim || this.mods.locked) return;
    if (this.aim.ia) this.aim.ia.onUse();
    else this.take(this.aim.info.itemId);
  }

  clearAim() {
    this.aim = null;
    if (this.highlight) this.highlight.visible = false;
    if (this.hud) { this.hud.setHint(null); this.hud.setCross(this.mode === 'play' && !!this.desktop, false); }
  }

  updateAim() {
    const { camera } = this.engine;
    camera.getWorldDirection(this._d);
    let hit = pickCover(this.shelves.faceViews, camera.position, this._d, 2.5);
    const iaHit = pickBoxes(this.mods.interactables, camera.position, this._d, 2.5);
    if (iaHit && (!hit || iaHit.t < hit.t)) hit = iaHit;
    const prev = this.aim;
    if (!hit) {
      if (prev) this.clearAim();
      return;
    }
    if (prev && (prev.info || prev.ia) === (hit.info || hit.ia)) return;
    this.aim = hit;
    if (hit.ia) {
      this.highlight.visible = false;
      this.hud.setHint(hit.ia.label, hit.ia.hint || 'E / Klick: Benutzen');
      this.hud.setCross(true, true);
      return;
    }
    slotWorld(hit.fv, hit.info, this.highlight.position, this.highlight.quaternion);
    this.highlight.visible = true;
    const it = this.items.get(hit.info.itemId);
    this.hud.setHint((it && it.Name) || '', 'E / Klick: Nehmen');
    this.hud.setCross(true, true);
  }

  // --- Touch: Tippen ---
  onTap(clientX, clientY) {
    if (this.mode !== 'play' || this.mods.locked) return;
    this.mods.flushNav();
    const { camera, canvas } = this.engine;
    const r = canvas.getBoundingClientRect();
    const ndc = { x: ((clientX - r.left) / r.width) * 2 - 1, y: -((clientY - r.top) / r.height) * 2 + 1 };
    camera.updateMatrixWorld(true);
    this.rc.setFromCamera(ndc, camera);
    const { origin, direction } = this.rc.ray;
    this.pendingTake = null;
    const hit = pickCover(this.shelves.faceViews, origin, direction, 9);
    const iaHit = pickBoxes(this.mods.interactables, origin, direction, 9);
    const far = this.touchScheme === 'joystick' ? 'Halte GEHEN, um hinzulaufen' : 'Halte gedrückt, um hinzulaufen';
    const p = this.player;
    if (iaHit && (!hit || iaHit.t < hit.t)) {
      const { min, max } = iaHit.ia.box;
      const d = Math.hypot(p.x - Math.min(Math.max(p.x, min.x), max.x), p.z - Math.min(Math.max(p.z, min.z), max.z));
      if (d > 3) { this.hud.note(far); return; }
      p.cancelPath();
      this.lookAtPoint((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
      this.pendingUse = { ia: iaHit.ia, at: performance.now() + 250 };
      return;
    }
    if (hit) {
      const f = hit.fv.face;
      const pos = slotWorld(hit.fv, hit.info, this._v, this._q).pos;
      const dist = Math.hypot(pos.x - p.x, pos.z - p.z);
      if (dist > 3 || (p.x - f.x) * f.nx + (p.z - f.z) * f.nz <= 0.2) { this.hud.note(far); return; }
      p.cancelPath();
      this.lookAtPoint(pos.x, pos.y, pos.z);
      this.pendingTake = { id: hit.info.itemId, at: performance.now() + 280 };
    }
  }

  walkTo(pt) {
    const path = findPath(this.layout.nav, { x: this.player.x, z: this.player.z }, pt);
    if (!path) { this.hud.note('Da komme ich nicht hin'); return false; }
    const end = path[path.length - 1];
    this.marker.position.set(end.x, 0.02, end.z);
    this.marker.visible = true;
    this.player.walkTo(path, () => { this.marker.visible = false; });
    return true;
  }

  approachCover(hit) {
    const { fv, info } = hit;
    const f = fv.face;
    const pos = slotWorld(fv, info, this._v, this._q).pos;
    const dist = Math.hypot(pos.x - this.player.x, pos.z - this.player.z);
    const id = info.itemId;
    if (dist <= 2.3 && (this.player.x - f.x) * f.nx + (this.player.z - f.z) * f.nz > 0.2) {
      this.player.cancelPath();
      this.lookAtPoint(pos.x, pos.y, pos.z);
      this.pendingTake = { id, at: performance.now() + 280 };
      return;
    }
    const dest = { x: pos.x + f.nx * 1.1, z: pos.z + f.nz * 1.1 };
    const path = findPath(this.layout.nav, { x: this.player.x, z: this.player.z }, dest);
    if (!path) { this.hud.note('Da komme ich nicht hin'); return; }
    const end = path[path.length - 1];
    this.marker.position.set(end.x, 0.02, end.z);
    this.marker.visible = true;
    this.player.walkTo(path, () => {
      this.marker.visible = false;
      this.player.faceYaw(f.yaw, 0.12);
      this.pendingTake = { id, at: performance.now() + 380 };
    });
  }

  approachInteractable(ia) {
    const { min, max } = ia.box;
    const p = this.player;
    const cx = (min.x + max.x) / 2;
    const cy = (min.y + max.y) / 2;
    const cz = (min.z + max.z) / 2;
    const nx = Math.min(Math.max(p.x, min.x), max.x);
    const nz = Math.min(Math.max(p.z, min.z), max.z);
    const dx = p.x - nx;
    const dz = p.z - nz;
    const d = Math.hypot(dx, dz);
    if (d <= 2.0) { this.lookAtPoint(cx, cy, cz); this.pendingUse = { ia, at: performance.now() + 250 }; return; }
    const dest = { x: nx + (dx / d) * 1.1, z: nz + (dz / d) * 1.1 };
    const path = findPath(this.layout.nav, { x: p.x, z: p.z }, dest);
    if (!path) { this.hud.note('Da komme ich nicht hin'); return; }
    const end = path[path.length - 1];
    this.marker.position.set(end.x, 0.02, end.z);
    this.marker.visible = true;
    p.walkTo(path, () => {
      this.marker.visible = false;
      this.lookAtPoint(cx, cy, cz);
      this.pendingUse = { ia, at: performance.now() + 350 };
    });
  }

  lookAtPoint(x, y, z) {
    const dx = x - this.player.x;
    const dz = z - this.player.z;
    this.player.faceYaw(Math.atan2(-dx, -dz), Math.atan2(y - EYE, Math.hypot(dx, dz)));
  }

  // --- Schleife ---
  tick(dt, now, frame) {
    const p = this.player;
    if (!p) return;
    const xr = this.xr;
    const inXr = !!(xr && xr.presenting);
    if (inXr) xr.beforeTick(dt, now, frame);
    this.mods.flushNav();
    if (!inXr) this.stepZoom(dt);
    if (now - this.lastFps >= 500) { this.lastFps = now; this.updateFps(); if (this.fs) this.fs.update(); }
    if (this.touchCtl && !inXr) {
      const padOn = this.mode === 'play' && !this.mods.locked;
      if (padOn !== this.touchCtl.padShown) this.touchCtl.showPad(padOn);
      if (padOn) this.touchCtl.tick(dt);
    }
    if (!inXr) {
      if (this.mode === 'play' && !this.mods.locked) p.update(dt, (this.desktop || this.touchCtl) ? (this.desktop || this.touchCtl).input : null);
      else p.update(dt, null);
    }
    this.mods.update(dt, now);
    if (!inXr) {
      p.applyCamera(this.engine.camera);
      this.mods.cameraStep(dt);
      this.engine.camera.updateMatrixWorld();
    }
    if (inXr && xr.inCinema) { xr.cinemaTick(dt, now); return; }
    this.holdview.update(dt);
    if (this.mode === 'play' && !this.mods.locked && this.desktop && (this.desktop.locked || this.desktop.dragLook)) {
      if (now - this.lastAim > 90) { this.lastAim = now; this.updateAim(); }
    }
    else if (this.aim) this.clearAim();
    if (this.marker.visible) {
      const s = 1 + 0.12 * Math.sin(now / 180);
      this.marker.scale.set(s, s, s);
    }
    if (this.pendingUse && this.mode === 'play' && now >= this.pendingUse.at) {
      const ia = this.pendingUse.ia;
      this.pendingUse = null;
      if (!ia.enabled || ia.enabled()) ia.onUse();
    }
    if (this.pendingTake && this.mode === 'play' && now >= this.pendingTake.at) {
      const id = this.pendingTake.id;
      this.pendingTake = null;
      this.take(id);
    }
    // Höchstens ein Atlas-Upload pro Frame; bei langsamen Frames gedrosselt (alle 200 ms), damit schwache Geräte trotzdem Cover bekommen.
    if (dt < 0.04 || now - (this.lastCoverTick || 0) > 200) {
      this.lastCoverTick = now;
      this.covers.tick();
    }
    if (now - this.lastCover > 250) {
      this.lastCover = now;
      this.covers.update(p.x, p.z, p.yaw, { zoom: this.zoom, pitch: p.pitch });
    }
    if (p.moved !== this.lastMoved && now - this.lastNotify >= 500) this.notifyState(false, now);
    if (!this.ready && ++this.readyFrames >= 2) {
      this.ready = true;
      this.progress(1, 'Fertig');
      if (this.onReadyHook) this.onReadyHook();
      this.syncUi();
      try { this.deps.onReady(); } catch { /* egal */ }
    }
  }

  getState() {
    const p = this.player;
    if (!p) return this.opts.restore ? { ...this.stateCache, ...this.opts.restore } : this.stateCache;
    return { ...p.state, heldId: this.holdview ? this.holdview.itemId : null };
  }

  notifyState(force, now = performance.now()) {
    if (!this.player) return;
    this.lastMoved = this.player.moved;
    this.lastNotify = now;
    try { this.deps.onState(this.getState()); } catch { /* egal */ }
  }

  // --- Kontext ---
  onContextLost() {
    if (this.hud) this.hud.showLost(true);
    if (this.covers) this.covers.pause();
  }

  onContextRestored() {
    // Geometrie/Materialien bleiben als JS-Objekte erhalten (three lädt sie neu hoch); Cover-Atlanten werden neu aufgebaut.
    if (this.covers) { this.covers.invalidateAll(); this.covers.resume(); }
    if (this.hud) this.hud.showLost(false);
  }

  // --- Qualität ---
  applyPreset(preset) {
    if (this.covers) this.covers.setPreset(preset);
    if (this.tex) this.tex.setAnisotropy(preset.anisotropy);
    if (this.lights) this.lights.setShadows(preset.shadows);
    if (this.pause) this.pause.refresh();
    if (this.mods) this.mods.hook('onQuality', preset.level);
  }

  setQuality(q) {
    if (!this.engine || !['auto', 'low', 'mid', 'high'].includes(q)) return;
    if (this.xr && this.xr.presenting) q = q === 'low' ? 'low' : 'mid'; // in VR nur low/mid
    this.qualitySetting = q;
    this.engine.setAuto(q === 'auto');
    const level = q === 'auto' ? this.engine.preset.level : q;
    this.applyPreset(this.engine.setLevel(level));
  }

  savePrefs() {
    try { this.deps.onPrefs({ quality: this.qualitySetting, sound: this.sound, fps: this.showFps, bigCovers: this.bigCovers, voiceOnline: this.voiceOnline, voiceName: this.voiceName, voicePitch: this.voicePitch, touchControl: this.touchScheme, ...this.touchTune, vr: { ...this.vr } }); } catch { /* egal */ }
  }

  /** Kassierer-Stimme: Gerät (lokal, Standard) oder Online-Stimmen des Browsers (Text geht an deren Dienst). */
  setVoiceOnline(on) {
    this.voiceOnline = !!on;
    if (this.mods) this.mods.hook('onVoiceOnline', this.voiceOnline);
    if (this.pause) this.pause.refresh();
  }

  /** Stimmwahl { name?, pitch?, online? }: name '' = automatisch (online bestimmt dann Gerät/Online). */
  setVoicePrefs(p) {
    if (!p) return;
    if (typeof p.name === 'string') this.voiceName = p.name;
    if (['normal', 'tief', 'sehrtief'].includes(p.pitch)) this.voicePitch = p.pitch;
    if (typeof p.online === 'boolean') this.voiceOnline = p.online;
    if (this.mods) this.mods.hook('onVoicePrefs', { name: this.voiceName, pitch: this.voicePitch, online: this.voiceOnline });
    if (this.pause) this.pause.refresh();
  }

  previewVoice() {
    const c = this.mods && this.mods.ctx.use('cashier');
    if (c && c.preview) c.preview();
  }

  /** Touch-Steuerung: 'joystick' (Gehen-Knopf + Joystick, Standard) oder 'touch' (Halten = laufen, Wischen = umsehen). */
  setTouchControl(s) {
    if (!SCHEMES.includes(s)) return;
    this.touchScheme = s;
    if (this.touchCtl) this.touchCtl.setScheme(s);
    if (this.pause) this.pause.refresh();
    this.syncUi();
  }

  /** Touch-Feineinstellung (Teilobjekt): holdInvertY/X, lookInvertY/X (bool), touchSens ('low'|'normal'|'high'). Wirkt sofort. */
  setTouchTune(p) {
    if (!p) return;
    this.touchTune = normTune({ ...this.touchTune, ...p });
    if (this.pause) this.pause.refresh();
  }

  setShowFps(on) {
    this.showFps = !!on;
    this.lastFps = 0;
    if (this.hud && !this.showFps) this.hud.setFps(null);
    if (this.pause) this.pause.refresh();
  }

  updateFps() {
    if (!this.hud) return;
    if (!this.showFps) return;
    const lv = { low: 'Niedrig', mid: 'Mittel', high: 'Hoch' }[this.engine.preset.level] || '';
    this.hud.setFps(`${Math.round(this.engine.fps)} FPS · ${lv}${this.qualitySetting === 'auto' ? ' (Auto)' : ''}`);
  }

  /** Hüllengröße umschalten: Prefs sichern, dann baut die Hülle die Szene neu auf. */
  setBigCovers(on) {
    on = !!on;
    if (on === this.bigCovers) return;
    this.bigCovers = on;
    if (this.pause) this.pause.refresh();
    this.savePrefs();
    this.notifyState(true);
    try { if (this.deps.onBigCovers) this.deps.onBigCovers(on); } catch { /* egal */ }
  }

  /** Zoom-Ziel (1..3): Desktop rechte Maustaste/Q, Touch Pinch. */
  setZoom(z) {
    const v = Number(z);
    this.zoomTarget = Number.isFinite(v) ? Math.min(3, Math.max(1, v)) : 1;
  }

  stepZoom(dt) {
    if (this.mode !== 'play' || (this.mods && this.mods.locked)) this.zoomTarget = 1;
    const d = this.zoomTarget - this.zoom;
    if (Math.abs(d) < 0.001) { if (this.zoom !== this.zoomTarget) { this.zoom = this.zoomTarget; this.engine.setZoom(this.zoom); } return; }
    this.zoom += d * (1 - Math.exp(-dt / 0.12 * 1.0));
    this.engine.setZoom(this.zoom);
  }

  setSound(on) { this.sound = !!on; if (this.pause) this.pause.refresh(); if (this.mods) this.mods.hook('onSound', this.sound); }

  openTerminal(q) {
    const t = this.mods && this.mods.ctx.use('terminal');
    if (t) { try { t.open(q || ''); } catch (err) { console.warn('[LenzFlix Store3D] Terminal', err); } return; }
    try { this.deps.toast('Kassen-PC kommt bald'); } catch { /* egal */ }
  }

  openItem(id) {
    if (!this.holdview || !this.layout) return;
    const slot = this.findSlot(id);
    if (slot) {
      const s = slot.fv.face.stand;
      this.player.teleport(s.x, s.z, s.yaw, 0.05);
      this.player.applyCamera(this.engine.camera);
    }
    this.take(id);
  }

  // --- Lebenszyklus ---
  suspend() {
    if (this.suspended || this.disposed) return;
    this.suspended = true;
    if (this.xr && this.xr.presenting) this.xr.exit(); // Sitzung zuerst beenden
    if (this.engine) this.engine.stop();
    if (this.desktop) this.desktop.detach();
    if (this.touchCtl) this.touchCtl.detach();
    if (this.covers) this.covers.pause();
    if (this.mods) this.mods.hook('onSuspend');
    if (this.hud) this.hud.showPrompt(false);
    if (this.fs) this.fs.suspend();
    this.notifyState(true);
  }

  resume(host) {
    if (!this.suspended || this.disposed) return;
    this.suspended = false;
    if (host && host !== this.host) {
      while (this.host.firstChild) host.appendChild(this.host.firstChild);
      this.host = host;
      if (this.engine) this.engine.setHost(host);
      if (this.holdview) this.holdview.setHost(host);
      if (this.fs) this.fs.setHost(host);
    }
    if (!this.ready && !this.player) return; // Boot läuft noch: boot() startet den Rest selbst
    if (this.desktop) this.desktop.attach();
    if (this.touchCtl) this.touchCtl.attach();
    if (this.covers) this.covers.resume();
    if (this.mods) this.mods.hook('onResume');
    if (this.engine) { this.engine.resize(); this.engine.start((dt, now, frame) => this.tick(dt, now, frame)); }
    if (this.fs) this.fs.resume();
    this.syncUi();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try { if (this.xr) this.xr.dispose(); } catch { /* egal */ }
    try { if (this.desktop) this.desktop.detach(); } catch { /* egal */ }
    try { if (this.touchCtl) this.touchCtl.detach(); } catch { /* egal */ }
    try { if (this.rotate) this.rotate.destroy(); } catch { /* egal */ }
    if (this.engine) this.engine.stop();
    if (this.mods) this.mods.dispose();
    if (this.holdview) this.holdview.dispose(true);
    if (this.covers) this.covers.dispose();
    for (const part of [this.room, this.shelves, this.signs, this.props]) {
      try { if (part) part.dispose(); } catch { /* egal */ }
    }
    if (this.highlight) { this.highlight.geometry.dispose(); this.highlight.material.dispose(); }
    if (this.marker) { this.marker.geometry.dispose(); this.marker.material.dispose(); }
    if (this.lights) this.lights.dispose();
    if (this.tex) this.tex.dispose();
    if (this.blank) this.blank.dispose();
    if (this.fs) this.fs.destroy();
    if (this.hud) this.hud.destroy();
    if (this.pause) this.pause.destroy();
    if (this.engine) this.engine.dispose();
    while (this.host && this.host.firstChild) this.host.removeChild(this.host.firstChild);
    if (typeof window !== 'undefined' && window.__lfxStore === this.dbg) delete window.__lfxStore;
  }

  // --- Debug ---
  exposeDebug() {
    const app = this;
    this.dbg = {
      teleport(x, z, yaw = app.player.yaw) { app.player.teleport(x, z, yaw, 0); app.lastCover = 0; },
      lookAt(id) {
        const s = app.findSlot(id);
        if (!s) return false;
        const pos = slotWorld(s.fv, s.info, new Vector3(), new Quaternion()).pos;
        const dx = pos.x - app.player.x;
        const dz = pos.z - app.player.z;
        app.player.look(Math.atan2(-dx, -dz) - app.player.yaw, Math.atan2(pos.y - EYE, Math.hypot(dx, dz)) - app.player.pitch);
        return true;
      },
      take(id) { return app.take(id); },
      put() { app.put(); },
      stats() {
        const info = app.engine.renderer.info;
        return {
          fps: Math.round(app.engine.fps), frameMs: +app.engine.frameMs.toFixed(1), calls: info.render.calls, triangles: info.render.triangles,
          textures: info.memory.textures, programs: info.programs ? info.programs.length : 0, tickMs: +app.engine.tickMs.toFixed(2), renderMs: +app.engine.renderMs.toFixed(2), geometries: info.memory.geometries,
          coverSegmentsLoaded: app.covers ? app.covers.loadedCount : 0, coverFull: app.covers ? app.covers.fullCount : 0,
          coversLow: app.covers ? app.covers.lowCount : 0, coversFull: app.covers ? app.covers.fullCount : 0, coversHi: app.covers ? app.covers.hiCount : 0,
          preload: app.covers ? app.covers.preloadStats : { done: 0, total: 0, ms: 0 },
          ...(app.covers ? app.covers.counters : { coverUploads: 0, hiUp: 0, hiDown: 0, fullLoads: 0, fullEvicts: 0 }),
          quality: app.engine.preset.level, qualitySetting: app.qualitySetting,
          xr: { supported: !!(app.xr && app.xr.supported), presenting: !!(app.xr && app.xr.presenting), inCinema: !!(app.xr && app.xr.inCinema), phase: null, videoFrames: 0, visibility: app.xr ? app.xr.visibility : 'visible', ...((app.xr && app.xr.cinema && typeof app.xr.cinema.diag === 'function' && app.xr.cinema.diag()) || {}) },
        };
      },
      state() { return app.getState(); },
      zones() { return Object.values(app.layout.zones).map((z) => { const v = z.view || z; return { id: z.id, label: z.label, x: +v.x.toFixed(2), z: +v.z.toFixed(2), yaw: v.yaw, obj: { x: +z.x.toFixed(2), z: +z.z.toFixed(2) } }; }); }, // x/z/yaw = Blickpunkt, obj = Objektposition
    };
    this.dbg.xr = this.xr;
    window.__lfxStore = this.dbg;
  }
}

export function create(host, deps, opts = {}) {
  const app = new StoreApp(host, deps, opts);
  const api = {
    suspend: () => app.suspend(),
    resume: (h) => app.resume(h),
    dispose: () => app.dispose(),
    openItem: (id) => { if (app.holdview && app.mode !== 'boot') app.openItem(id); else app.opts.openItemId = id; },
    openTerminal: (q) => app.openTerminal(q),
    getState: () => app.getState(),
    setQuality: (q) => app.setQuality(q),
    setSound: (on) => app.setSound(on),
    isXr: () => !!(app.xr && app.xr.presenting),
    leaveCinema: (reason) => { if (app.xr) app.xr.leaveCinema(reason); },
  };
  if (opts.debug) Object.defineProperty(api, 'debug', { get: () => app.dbg, enumerable: true });
  return api;
}

