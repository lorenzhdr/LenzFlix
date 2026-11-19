// VIDEOTHEK LENZ · create(host, deps, opts) → instance (Vertrag: docs/store3d.md).
import {
  Vector3, Quaternion, Raycaster, Mesh, BoxGeometry, MeshBasicMaterial, AdditiveBlending,
} from 'three';
import { buildLayout } from './world/layout.js';
import { resolveRestore, areaAt } from './world/city.js';
import { createEngine } from './engine/renderer.js';
import { makeTextures, makeCanvas, toTexture } from './world/textures.js';
import { buildRoom, addLights } from './world/build-room.js';
import { buildShelves, slotWorld } from './world/build-shelves.js';
import { buildSigns } from './world/build-signs.js';
import { buildProps } from './world/build-props.js';
import { CoverManager } from './covers/manager.js';
import { Player } from './controls/player.js';
import { DesktopControls } from './controls/desktop.js';
import { TouchControls, SCHEMES, normTune } from './controls/touch.js';
import { createRotateHint } from './ui/rotate.js';
import { pickCover, pickBoxes, wallOccluders } from './controls/pick.js';
import { ModuleHost } from './modules/runtime.js';
import { createHud, DESKTOP_HELP, touchHint } from './ui/hud.js';
import { createPause } from './ui/pause.js';
import { HoldView } from './ui/holdview.js';
import { createHands } from './ui/hands.js';
import { weaponInfo } from './fight/weapons.js';
import { prefersReducedMotion } from './modules/m4-util.js';
import { createFullscreen } from './ui/fullscreen.js';
import { wrapDeps } from './xr/guard.js';
import { XrMode } from './xr/mode.js';
import { PalastCinema } from './cinema/palast.js';
import { palastTest } from './cinema/saal-stub.js';

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

const QUALITY_SETTINGS = ['auto', 'low', 'mid', 'high', 'ultra'];

export function resolveLevel(setting, ultraOk) {
  if (setting === 'ultra') return ultraOk ? 'ultra' : 'high'; // Ultra nur auf freigegebenen Geräten (opts.ultraOk, nie Handy)
  if (setting === 'low' || setting === 'mid' || setting === 'high') return setting;
  return 'mid'; // Start immer auf „mid“, die Automatik schaltet bei stabil > 58 fps hoch
}

/** VR-Prefs (Vertrag): turn snap|smooth, vignette bool, height auto|seated, quality mid|low, seat front|mid|back. */
function normalizeVr(v) {
  const o = v && typeof v === 'object' ? v : {};
  return {
    turn: o.turn === 'smooth' ? 'smooth' : 'snap',
    vignette: o.vignette !== false,
    height: o.height === 'seated' ? 'seated' : 'auto',
    quality: o.quality === 'low' ? 'low' : 'mid',
    seat: o.seat === 'front' || o.seat === 'back' ? o.seat : 'mid',
  };
}

export class StoreApp {
  constructor(host, deps, opts) {
    this.host = host;
    this.xr = null;
    this.deps = wrapDeps(deps, () => this.xr, () => this.cinema2d); // in VR leiten die Wrapper DOM-Wege um (xr/guard.js); 2D-Kino im Palast: wantsPlay()
    this.opts = { ...(opts || {}), vr: normalizeVr(opts && opts.vr) };
    this.vr = this.opts.vr;
    this.phone = !!this.opts.phone;
    this.touch = !!this.opts.touch;
    this.ultraOk = this.opts.ultraOk === true; // Gerätesperre allein über die Hülle (features/store/home.js ultraAllowed): Handy/TV nie, Tablet ja
    this.qualitySetting = QUALITY_SETTINGS.includes(this.opts.quality) ? this.opts.quality : 'auto';
    this.savedQuality = this.qualitySetting; // gespeicherte Wahl bleibt erhalten, bis der Nutzer selbst wählt (setQuality aus dem Menü)
    this.qualityChosen = false;
    if (this.qualitySetting === 'ultra' && !this.ultraOk) this.qualitySetting = 'high'; // gespeichertes Ultra ohne Freigabe: nur wirksam klemmen, die Wahl nicht verwerfen
    this.sound = !!this.opts.sound;
    this.showFps = this.opts.showFps === true;
    this.voiceOnline = this.opts.voiceOnline === true;
    this.voiceName = typeof this.opts.voiceName === 'string' ? this.opts.voiceName : '';
    this.voicePitch = ['normal', 'tief', 'sehrtief'].includes(this.opts.voicePitch) ? this.opts.voicePitch : 'tief';
    this.bigCovers = this.opts.bigCovers !== false;
    this.touchScheme = SCHEMES.includes(this.opts.touchControl) ? this.opts.touchControl : 'game';
    this.touchChosen = false; // Nutzer hat das Schema im Pause-Menü selbst gewählt (nur dann wird es gespeichert)
    this.carried = null; // { id, item, slot, art, reopened } getragene Hülle (Mitnehmen)
    this.carryingOut = false;
    this.released = new Map(); // freigegebene (geworfene) Hüllen: id -> { slot, art, item }, Regalfach bleibt leer bis restoreReleased
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
        level: resolveLevel(this.qualitySetting, this.ultraOk),
        auto: this.qualitySetting === 'auto',
        phone: this.phone,
        maxLevel: this.ultraOk ? 'ultra' : 'high',
        onContextLost: () => this.onContextLost(),
        onContextRestored: () => this.onContextRestored(),
        onAutoLevel: () => this.applyPreset(this.engine.preset),
      });
    } catch (err) {
      this.fail(err);
      return;
    }
    this.xr = new XrMode(this);
    this.cinema2d = new PalastCinema(this); // 2D-Kino im LENZ PALAST (cinema/palast.js); Module: ctx.use('cinema2d')
    this.hud = createHud(host, { touch: this.touch, onMenu: () => this.openPause(), onVr: () => this.xr.enter(), onView: () => this.doView(), getTouchScheme: () => this.touchScheme });
    this.fs = createFullscreen({
      host, isTouch: this.touch, getMode: () => (this.mods && this.mods.locked ? 'locked' : this.mode), userId: (deps.user && (deps.user.id || deps.user.name)) || 'anon', hud: this.hud,
      onChange: () => { if (this.pause) this.pause.refresh(); },
    });
    this.rotate = this.phone ? createRotateHint(host, { getMode: () => this.mode, isWanted: () => !(this.touch && this.touchScheme === 'game') }) : null;
    this.pause = createPause(host, {
      help: this.touch ? '' : DESKTOP_HELP,
      onResume: () => this.resumeFromPause(),
      onVr: () => this.xr.enter(),
      getVr: () => this.xr.supported && !this.xr.presenting,
      onSearch: () => { if (this.mode !== 'paused') return; this.pause.hide(); this.setMode('play'); this.openTerminal(''); }, // ohne requestLock: das Terminal ist ein Overlay
      onClassic: () => this.deps.classicView(),
      onQuality: (q) => { this.qualityChosen = true; this.setQuality(q); this.savePrefs(); },
      onSound: (on) => { this.setSound(on); this.savePrefs(); },
      onFps: (on) => { this.setShowFps(on); this.savePrefs(); },
      onVoice: (p) => { this.setVoicePrefs(p); this.savePrefs(); this.previewVoice(); }, // synchron im Klick (iOS-Nutzergeste)
      getVoicePrefs: () => ({ name: this.voiceName, online: this.voiceOnline, pitch: this.voicePitch }),
      getVoiceList: () => { const c = this.mods && this.mods.ctx.use('cashier'); return c && c.voices ? c.voices() : []; },
      onBigCovers: (on) => this.setBigCovers(on),
      onTouchControl: this.touch ? (s) => { this.touchChosen = true; this.setTouchControl(s); this.savePrefs(); } : null,
      getTouchControl: () => this.touchScheme,
      getInputInfo: () => (this.touchCtl && this.touchScheme === 'game' ? this.touchCtl.diagLine() : null),
      onTouchTune: this.touch ? (p) => { this.setTouchTune(p); this.savePrefs(); } : null,
      getTouchTune: () => this.touchTune,
      onTheme: () => this.deps.openThemePicker(),
      onMenu: (anchor) => this.deps.openMenu(anchor),
      getQuality: () => this.qualitySetting,
      canUltra: () => this.ultraOk,
      getSound: () => this.sound,
      getFps: () => this.showFps,
      getBigCovers: () => this.bigCovers,
      getDiscover: () => { const d = this.mods && this.mods.ctx.use('discover'); return d ? d.summary() : null; },
      // 1.17.0: „Figur …“ / „Mitgliedsausweis“ nur mit echten Daten der Provider (Stubs liefern null → ausgeblendet)
      onFigure: () => {
        if (this.mode !== 'paused') return;
        if (this.mods && this.mods.locked) return; // gesperrte Kamerafahrt (Salon, Kasse, Kino): kein zweiter Editor-Pfad
        const sl = this.modUse('salon');
        if (sl && typeof sl.busy === 'function' && sl.busy()) return;
        const av = this.modUse('avatar');
        if (!av) return;
        this.pause.hide(); this.setMode('play'); // wie onSearch: der Editor ist ein Overlay, kein requestLock
        Promise.resolve().then(() => av.openEditor('pause')).catch((err) => console.warn('[LenzFlix Store3D] Figur-Editor', err));
      },
      getFigureEnabled: () => { const av = this.modUse('avatar'); return !!av && av.code() !== null; },
      onCard: () => {
        const m = this.modUse('member');
        const data = m && m.cardData();
        if (!data) return;
        Promise.resolve().then(() => m.showCard(data, { mode: 'self' })).catch((err) => console.warn('[LenzFlix Store3D] Ausweis', err));
      },
      getCardEnabled: () => { const m = this.modUse('member'); return !!m && m.cardData() !== null; },
      getMp: () => { const n = this.mods && this.mods.ctx.use('net'); return n && n.menu ? n.menu() : null; },
      renderMp: (el) => { const n = this.mods && this.mods.ctx.use('net'); if (n && n.renderMenu) n.renderMenu(el); },
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
    this.player = new Player(L, { reducedMotion: () => prefersReducedMotion() });
    this.player.onJump = (info) => { if (this.mods) this.mods.emit('jump', info); };
    this.player.onLand = (info) => { if (this.mods) this.mods.emit('land', info); };
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
      onCarry: (id) => this.carry(id),
    });
    this.hands = createHands(engine.camera, { quality: () => engine.preset.level });
    this.mods = new ModuleHost(this);
    this.cinema2d.register(this.mods.ctx);
    this.desktop = this.touch ? null : new DesktopControls({
      canvas: engine.canvas,
      player: this.player,
      getMode: () => this.mode,
      onLockLost: () => this.openPause(),
      onLockChange: () => this.syncUi(),
      onTake: (src) => this.doUse(src || 'click'),
      onJump: () => this.doJump(),
      onHit: () => this.doHit('key'),
      onHitUp: () => this.onHitUp(),
      onTakeUp: () => this.onHitUp(),
      onWheel: () => this.onWeaponWheel(true),
      onWheelUp: () => this.onWeaponWheel(false),
      onWeaponPick: (n) => this.onWeaponPick(n),
      onWeaponCycle: (dir) => this.onWeaponCycle(dir),
      onThrow: () => this.doThrow('key'),
      onChat: () => this.doChat('key'),
      onEmote: () => this.doEmote('key'),
      onView: () => this.doView(), // Taste V (1.17.0)
      onCarry: () => this.holdview.carryOut(),
      onZoom: (z) => this.setZoom(z),
      getZoom: () => this.zoom,
      onEscape: () => {
        if (this.mode === 'hold') this.holdview.close(true);
        else if (this.mode === 'overlay') { const ov = this.mods.overlayState; if (!ov || ov.escape !== false) this.mods.overlayClose(); } // Esc-feste Overlays (Gate) bleiben
        else if (this.pause && this.pause.pickOpen) this.pause.closePick();
        else this.resumeFromPause();
      },
    });
    this.touchCtl = this.touch ? new TouchControls({ canvas: engine.canvas, player: this.player, getMode: () => this.mode, onTap: (x, y) => this.onTap(x, y), onZoom: (z) => this.setZoom(z), getZoom: () => this.zoomTarget, scheme: this.touchScheme, getTune: () => this.touchTune, debug: !!this.opts.debug, touchApi: this.opts.touchApi,
      onJump: () => this.doJump(), onUse: () => this.doUse('touch'), onHit: () => this.doHit('touch'), onHitUp: () => this.onHitUp(), onThrow: () => this.doThrow('touch'),
      onView: () => this.doView(), onAux: () => this.onAux(), onAuxUp: () => this.onAuxUp(),
    }) : null;

    this.progress(0.86, 'Module werden geladen');
    this.mods.ctx.on('xr', (on) => this.onXrHold(on));
    await this.mods.init((f) => this.progress(0.86 + f * 0.05, 'Module werden geladen'));
    if (this.disposed) return;
    const mpNet = this.mods.ctx.use('net'); // Mehrspieler: Status-/Schalteränderung baut das Pause-Menü neu (Provider endet mit dem Modul)
    if (mpNet && mpNet.onChange) mpNet.onChange(() => { if (this.pause) this.pause.refresh(); });
    // Startposition / Wiederherstellung
    const r = this.opts.restore;
    const city = this.mods.ctx.use('city');
    if (city) city.partition(); // Szene in Laden-Hülle/Regale/Außenwelt teilen (Sichtbarkeit je Bereich)
    if (r && Number.isFinite(r.x) && Number.isFinite(r.z)) {
      const rr = resolveRestore(L, r); // auch draußen (Position inkl. y)
      this.player.teleport(rr.x, rr.z, rr.yaw, rr.pitch, rr.y);
    }
    const sp = this.opts.debug && this.opts.spawn && L.city ? L.city.spawns[this.opts.spawn] : null; // Harness ?spawn=
    if (sp) { this.player.teleport(sp.x, sp.z, sp.yaw || 0, 0, sp.y || 0); }
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
    if (this.suspended) this.pauseParts();

    await this.startSequence(r);
  }

  /** Boot-Ende (1.17.0): erstes Bild, Figur-Gate (avatar), Intro (außer skipIntro), dann 'enter'. `r` = opts.restore. */
  async startSequence(r) {
    // Erstes Bild immer abwarten (1.17.0), dann Figur-Gate (avatar), dann Intro-Provider (Modul; außer skipIntro)
    const intro = this.mods.ctx.use('intro');
    await new Promise((res) => { this.onReadyHook = res; if (this.ready) res(); });
    if (this.disposed) return;
    const av = this.mods.ctx.use('avatar');
    if (av && av.needsGate()) {
      try { await av.gate(); } catch (err) { console.warn('[LenzFlix Store3D] Figur-Gate', err); }
      if (this.disposed) return;
    }
    if (intro && !this.opts.skipIntro) {
      try { await intro.run(); } catch (err) { console.warn('[LenzFlix Store3D] Intro', err); }
      if (this.disposed) return;
    }
    const enter = () => {
      this.mods.emit('enter');
      if (this.opts.openItemId) this.openItem(this.opts.openItemId);
      else if (r && r.heldId) this.take(r.heldId, { instant: true });
      if (this.opts.openTerminal) this.openTerminal(this.opts.query || '');
    };
    if (this.suspended) this.afterResume = enter; // ausgesetzt: erst bei resume() betreten
    else enter();
  }

  buildOverlays() {
    this.highlight = new Mesh(
      new BoxGeometry(0.17, 0.23, 0.05),
      new MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.22, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
    );
    this.highlight.visible = false;
    this.highlight.renderOrder = 6;
    this.engine.scene.add(this.highlight);
  }

  // --- Modus / UI ---
  setMode(m) { if (m !== 'play') this.pendingTake = this.pendingUse = null; this.mode = m; this.syncUi(); if (this.fs) this.fs.update(); }

  /** Gate-Argumente der Touch-Steuerung: Modus plus Sperrgrund (Kamerafahrt 'cam' bzw. sonstige Sperre 'freeze'). */
  gateArgs() {
    const m = this.mods;
    return { mode: this.mode, lock: m && m.locked ? (m.cam ? 'cam' : 'freeze') : '' };
  }

  syncUi() {
    if (!this.hud) return;
    const xr = this.xr;
    if (this.host && this.host.classList) this.host.classList.toggle('lfx-store-ctl-game', !!(this.touch && this.touchScheme === 'game'));
    if (xr && xr.presenting) {
      // In VR gibt es kein DOM-HUD und keine Desktop-/Touch-Steuerung
      this.hud.setCross(false, false);
      this.hud.showPrompt(false, false);
      this.hud.showMenuBtn(false);
      this.hud.showViewBtn(false);
      this.hud.showVr(false);
      this.hud.setHint(null);
      if (this.touchCtl) this.touchCtl.gate({ xr: true });
      if (this.pause && this.pause.visible) this.pause.hide();
      return;
    }
    const play = this.mode === 'play';
    const locked = this.desktop ? this.desktop.locked || this.desktop.dragLook : true;
    this.hud.setCross(play && !!this.desktop && locked, !!this.aim);
    this.hud.showPrompt(this.ready && play && !!this.desktop && !locked && !this.suspended, !!(this.desktop && this.desktop.relockArmed));
    this.hud.showMenuBtn(play);
    this.hud.showViewBtn(play);
    if (this.touchCtl) this.touchCtl.gate(this.gateArgs());
    if (this.rotate) this.rotate.update();
    // nur im Laufmodus: die Halte-Ebene (z-index 4) läge sonst über dem Knopf und finge das Tippen ab
    this.hud.showVr(this.ready && play && !!xr && xr.supported && !xr.presenting);
    if (!play || !this.aim) this.hud.setHint(null);
    if (this.pause && this.mode !== 'paused' && this.pause.visible) this.pause.hide();
  }

  openPause() {
    if (this.xr && this.xr.presenting) { this.xr.openMenu(); return; }
    if (this.mode !== 'play') return;
    this.player.cancelPath();
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
    const c = this.carried;
    if (c && c.reopened && !this.carryingOut) { this.heldId = null; this.returnCarried(); } // wieder geöffnete Hülle zurückgestellt: ins Regal
    else if (this.heldId && !this.carryingOut) { this.mods.emit('put', this.heldId); this.heldId = null; }
    else this.heldId = null;
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
    if (on && this.carried) this.drop(); // getragene Hülle zurück ins Regal: VR kennt kein Tragen
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
    if (this.carried && this.carried.id === id) return this.holdview.isOpen && this.holdview.itemId === id ? true : this.openCarried(); // schon in der Hand: wieder öffnen
    if (this.carried) this.drop(); // eine andere Hülle in der Hand: erst zurück ins Regal
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
    if (this.desktop) this.desktop.releaseLock();
    this.clearAim();
    if (xr) this.holdview.open(id, slot, instant, { xr: true, anchor: this.holdAnchorFor(hand), hand: hand || 'right', grab: !!grab });
    else this.holdview.open(id, slot, instant);
    this.mods.emit('take', id);
    return true;
  }

  put() { if (this.holdview && this.holdview.isOpen) this.holdview.close(true); }

  /** Alias von doUse (Desktop-Klick/E, Altname). */
  takeAimed(src) { return this.doUse(src || 'key'); }

  // --- Aktionen (Desktop-Tasten, Touch-Knöpfe, ctx.input.onAction) ---
  /** Aktion erlaubt? Nur im Laufmodus, ohne Modul-Sperre, nie in VR. */
  canAct() {
    return !this.disposed && this.mode === 'play' && !!this.mods && !this.mods.locked && !(this.xr && this.xr.presenting);
  }

  /** Interaktionen ohne anyHeight gelten nur am Boden (Füße höchstens 0,5 m hoch). */
  iaReachable(ia) { return !!ia.anyHeight || !(this.player.y > 0.5); }

  /** Wände als Sichtblocker für Interaktions-Strahlen (neu berechnet, wenn Module Kollider hinzufügen oder entfernen). */
  occluders() {
    const cs = (this.layout && this.layout.colliders) || [];
    if (!this._occ || this._occN !== cs.length) { this._occ = wallOccluders(cs); this._occN = cs.length; }
    return this._occ;
  }

  groundIas() {
    const l = this.mods.interactables;
    return this.player.y > 0.5 ? l.filter((i) => i.anyHeight) : l;
  }

  /** Provider eines Moduls (oder undefined, z. B. vor dem Modul-Start). */
  modUse(name) { const c = this.mods && this.mods.ctx; return c && c.use ? c.use(name) : undefined; }

  actionEvent(name, source) {
    const cam = this.engine.camera;
    cam.getWorldDirection(this._d);
    const sv = this.modUse('selfview');
    const origin = sv && sv.mode() === 'third' ? sv.eye(new Vector3()) : cam.position.clone(); // Außenansicht: Auge der Figur statt Kamera
    // 1.18.0: Waffe, Reichweite und Trefferzahl aus der gewählten Waffe (Laser zählt wie die Hand; er sendet nie 'hit')
    const fi = this.modUse('fight');
    const wid = fi && typeof fi.weapon === 'function' ? fi.weapon() : 'hand';
    const wi = weaponInfo(wid === 'laser' ? 'hand' : wid);
    return { name, source, aim: this.aim, origin, dir: this._d.clone(), weapon: wi.id, range: wi.range, max: wi.max };
  }

  /**
   * Zielstrahl (1.17.0). Ego: Kamera und Blickrichtung (bzw. der übergebene Strahl `ray`, z. B. Tippen), bitgleich zu früher.
   * Außenansicht: Ursprung = Projektion des Auges (selfview.eye) auf den Strahl, Richtung = Strahlrichtung.
   * Schreibt in `o`/`d` (Vector3) und gibt `o` zurück.
   */
  aimRay(o, d, ray) {
    const cam = this.engine.camera;
    if (ray) { o.copy(ray.origin); d.copy(ray.direction); } else { o.copy(cam.position); cam.getWorldDirection(d); }
    const sv = this.modUse('selfview');
    if (sv && sv.mode() === 'third') {
      const e = sv.eye(this._e || (this._e = new Vector3()));
      const t = Math.max(0, (e.x - o.x) * d.x + (e.y - o.y) * d.y + (e.z - o.z) * d.z);
      o.addScaledVector(d, t);
    }
    return o;
  }

  /**
   * Benutzen (E / Linksklick / Touch-Knopf). Reihenfolge: Ziel im Fadenkreuz (Hülle, Interaktion) → ctx.input.onAction('use')
   * → getragene Hülle wieder öffnen (nicht bei source 'click') → bei source 'click' ein Schlag ('hit').
   */
  doUse(src = 'key') {
    if (!this.canAct()) return false;
    const a = this.aim;
    // Interaktionen mit noClick lösen nur per E/Touch aus; ein Klick läuft weiter (Aktion 'use' → doHit)
    if (a && (!a.ia || this.iaReachable(a.ia)) && !(src === 'click' && a.ia && a.ia.noClick)) {
      if (a.ia) a.ia.onUse(); else this.take(a.info.itemId);
      return true;
    }
    if (this.mods.action('use', this.actionEvent('use', src))) return true;
    if (this.carried && src !== 'click') { this.openCarried(); return true; }
    if (src === 'click') return this.doHit('click');
    return false;
  }

  /** Schlagen (F; Linksklick ohne Ziel): Arm-Schwung und ctx.input.onAction('hit') / Ereignis 'hit'. */
  doHit(src = 'key') {
    if (!this.canAct()) return false;
    const f = this.modUse('fight');
    if (f && typeof f.weapon === 'function') {
      // 1.18.0: Laser leuchtet, solange gehalten (kein Hieb, nie ein 'hit'-Ereignis); Abklingzeit vor Schwung, Ton und Handlern
      if (f.weapon() === 'laser') return !!(f.laser && f.laser(true));
      if (typeof f.swingOk === 'function' && !f.swingOk()) return false;
    }
    const ev = this.actionEvent('hit', src);
    this.player.swing();
    if (this.hands) this.hands.swing(ev.weapon);
    if (f && typeof f.swung === 'function') f.swung(ev);
    return this.mods.action('hit', ev);
  }

  /** Loslassen von F bzw. der linken Maustaste: Laser aus (1.18.0). */
  onHitUp() { const f = this.modUse('fight'); if (f && typeof f.laser === 'function') f.laser(false); }
  /** Waffenknopf (Touch): tippen = Waffenrad, halten mit Laser = leuchten (1.18.0). */
  onAux() { const f = this.canAct() ? this.modUse('fight') : null; if (f && f.auxDown) f.auxDown(); }
  onAuxUp() { const f = this.modUse('fight'); if (f && f.auxUp) f.auxUp(); }

  /** Werfen (G): ctx.input.onAction('throw') / Ereignis 'throw'; ev.carried = getragene Hülle oder null. Welle 1: nur Animation. */
  doThrow(src = 'key') {
    if (!this.canAct()) return false;
    const ev = this.actionEvent('throw', src);
    ev.carried = this.carried ? { id: this.carried.id, item: this.carried.item } : null;
    if (this.carried && this.hands) this.hands.throwAnim();
    else if (this.hands) this.hands.swing();
    return this.mods.action('throw', ev);
  }

  /** Chat (Enter) und Emote (T): nur im Laufmodus; true = ein Handler (Modul net) hat die Taste verbraucht, sonst bleibt sie unberührt (1.15-Verhalten). */
  doChat(src = 'key') { return this.canAct() && this.mods.action('chat', this.actionEvent('chat', src)); }
  /** Ansicht wechseln (Taste V, HUD- und Gamepad-Knopf, 1.17.0): Ego/Außenansicht, nur wenn Handeln erlaubt ist. */
  doView() {
    const sv = this.modUse('selfview');
    if (!sv || !this.canAct()) return false;
    sv.toggle();
    return true;
  }

  // --- Kampf (1.18.0, Welle 4: leere Nähte; Tasten/Rad belegt Welle 6) ---
  /** Waffenrad öffnen/schließen (R halten). Reicht nur an den Provider fight durch. */
  onWeaponWheel(open) { if (open && !this.canAct()) return false; const f = this.modUse('fight'); return !!(f && f.wheel && f.wheel(!!open)); }
  /** Direktwahl 1–4. */
  onWeaponPick(n) { if (!this.canAct()) return false; const f = this.modUse('fight'); if (!f) return false; const id = ['hand', 'belt', 'whip', 'laser'][(n | 0) - 1]; if (!id) return false; f.setWeapon(id); return true; }
  /** Mausrad: nächste/vorige Waffe (dir = ±1). */
  onWeaponCycle(dir) { if (!this.canAct()) return false; const f = this.modUse('fight'); return !!(f && f.cycle && f.cycle(dir < 0 ? -1 : 1)); }

  doEmote(src = 'key') { return this.canAct() && this.mods.action('emote', this.actionEvent('emote', src)); }

  /** Springen (Leertaste, Knopf). Rückgabe: Sprung ist sofort möglich. */
  doJump() {
    if (!this.canAct()) return false;
    return this.player.jump();
  }

  // --- Tragen ---
  /** Netzzustand: heldId des Spielers = getragene oder gehaltene Hülle. */
  syncHeld() {
    const p = this.player;
    if (p) p.heldId = this.carried ? this.carried.id : (this.holdview && this.holdview.itemId) || null;
  }

  getCarried() { return this.carried ? { id: this.carried.id, item: this.carried.item } : null; }

  /**
   * Hülle in die Hand nehmen (Modus 'play', der Spieler läuft weiter): aus dem Halte-Bild („Mitnehmen“) oder direkt aus dem Regal.
   * Das Regalfach bleibt leer, bis drop() / „Zurückstellen“. Eine andere getragene Hülle geht vorher zurück ins Regal. Nicht in VR.
   */
  carry(id) {
    if (!id || this.disposed || !this.holdview || !this.hands || (this.xr && this.xr.presenting)) return false;
    const item = this.items.get(id);
    if (!item) return false;
    const hv = this.holdview;
    const held = hv.isOpen && hv.itemId === id;
    let c = this.carried;
    if (c && c.id === id && !held) return true;
    if (c && c.id !== id) { this.drop(); c = null; }
    let slot = c ? c.slot : null;
    let art = c ? c.art : null;
    if (held) {
      this.carryingOut = true;
      let rel;
      try { rel = hv.releaseForCarry(); } finally { this.carryingOut = false; }
      if (rel) { if (!c) slot = rel.slot; if (rel.art) art = rel.art; }
    } else if (this.released && this.released.has(id)) { // geworfene Hülle wieder aufgehoben: Ursprungsfach und Cover übernehmen
      const rel = this.released.get(id);
      this.released.delete(id);
      slot = rel.slot;
      art = rel.art || art;
    } else {
      slot = this.findSlot(id);
      if (slot) this.shelves.setHidden(slot.fv, slot.info, true);
    }
    this.carried = { id, item, slot, art, reopened: false };
    this.hands.setCarried({ media: (item.lfx && item.lfx.media) || 'dvd', art });
    this.pendingTake = null;
    if (this.touchCtl) this.touchCtl.setCarrying(true);
    if (this.mods) this.mods.emit('carry', { id });
    return true;
  }

  /** Getragene Hülle zurück ins Regal an den Ursprungsplatz (kam sie von der Theke, verschwindet sie nur aus der Hand). */
  drop() {
    const c = this.carried;
    if (!c) return false;
    const hv = this.holdview;
    if (c.reopened && hv && hv.isOpen && hv.itemId === c.id) { hv.close(false); return true; } // onHoldClosed → returnCarried
    this.returnCarried();
    return true;
  }

  /**
   * Getragene Hülle aus der Hand geben, OHNE sie ins Regal zu stellen (Werfen): Das Fach bleibt leer, bis restoreReleased(id)
   * oder ein erneutes carry(id). Rückgabe { id, item, art (Canvas|null), media } oder null.
   */
  releaseCarried() {
    const c = this.carried;
    if (!c || (this.holdview && this.holdview.isOpen && c.reopened)) return null;
    this.carried = null;
    (this.released || (this.released = new Map())).set(c.id, { slot: c.slot, art: c.art, item: c.item });
    if (this.hands) this.hands.setCarried(null);
    if (this.touchCtl) this.touchCtl.setCarrying(false);
    if (this.mods) this.mods.emit('carry', { id: null });
    return { id: c.id, item: c.item, art: c.art || null, media: (c.item && c.item.lfx && c.item.lfx.media) || 'dvd' };
  }

  /** Freigegebene Hülle zurück ins Ursprungsfach. Rückgabe false, wenn nichts freigegeben war. */
  restoreReleased(id) {
    const r = this.released && this.released.get(id);
    if (!r) return false;
    this.released.delete(id);
    if (r.slot && this.shelves) this.shelves.setHidden(r.slot.fv, r.slot.info, false);
    return true;
  }

  returnCarried() {
    const c = this.carried;
    if (!c) return;
    this.carried = null;
    if (c.slot && this.shelves) this.shelves.setHidden(c.slot.fv, c.slot.info, false);
    if (this.hands) this.hands.setCarried(null);
    if (this.touchCtl) this.touchCtl.setCarrying(false);
    if (this.mods) this.mods.emit('carry', { id: null });
  }

  /** Getragene Hülle wieder im Halte-Bild öffnen („Benutzen“ ohne Ziel); „Zurückstellen“ legt sie ins Regal, „Mitnehmen“ wieder in die Hand. */
  openCarried() {
    const c = this.carried;
    if (!c || !this.holdview || this.holdview.isOpen) return false;
    c.reopened = true;
    if (this.hands) this.hands.setCarried(null);
    this.heldId = c.id;
    this.pendingTake = null;
    this.setMode('hold');
    this.player.cancelPath();
    if (this.desktop) this.desktop.releaseLock();
    this.clearAim();
    this.holdview.open(c.id, null, false);
    return true;
  }

  clearAim() {
    this.aim = null;
    if (this.touchCtl) this.touchCtl.setAimed(false);
    if (this.highlight) this.highlight.visible = false;
    if (this.hud) { this.hud.setHint(null); this.hud.setCross(this.mode === 'play' && !!this.desktop, false); }
  }

  updateAim() {
    const o = this.aimRay(this._ao || (this._ao = new Vector3()), this._d);
    let hit = pickCover(this.shelves.faceViews, o, this._d, 2.5);
    const iaHit = pickBoxes(this.groundIas(), o, this._d, 2.5, this.occluders());
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
      this.hud.setHint(hit.ia.label, this.touch ? touchHint(hit.ia.hint || 'Benutzen') : hit.ia.hint || 'E / Klick: Benutzen');
      this.hud.setCross(true, true);
      if (this.touchCtl) this.touchCtl.setAimed(true);
      return;
    }
    slotWorld(hit.fv, hit.info, this.highlight.position, this.highlight.quaternion);
    this.highlight.visible = true;
    const it = this.items.get(hit.info.itemId);
    this.hud.setHint((it && it.Name) || '', this.touch ? 'Benutzen: Nehmen' : 'E / Klick: Nehmen');
    this.hud.setCross(true, true);
    if (this.touchCtl) this.touchCtl.setAimed(true);
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
    const origin = this.aimRay(this._ao || (this._ao = new Vector3()), this._ad || (this._ad = new Vector3()), this.rc.ray);
    const direction = this._ad;
    this.pendingTake = this.pendingUse = null;
    const hit = pickCover(this.shelves.faceViews, origin, direction, 9);
    const iaHit = pickBoxes(this.groundIas(), origin, direction, 9, this.occluders());
    const far = this.touchScheme === 'joystick' ? 'Halte GEHEN, um hinzulaufen' : this.touchScheme === 'game' ? 'Geh näher heran' : 'Halte gedrückt, um hinzulaufen';
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
    } else this.tapEmpty(clientX, clientY, r);
  }

  /**
   * Tipp ins Leere in den Schemata 'touch'/'joystick' (kein Zielen, kein Benutzen-Knopf): ctx.input.onAction('use'); unten rechts
   * (dort hängt die getragene Hülle) öffnet er sie wieder. Im Schema 'game' übernimmt der Benutzen-Knopf.
   */
  tapEmpty(x, y, r) {
    if (this.touchScheme === 'game' || !this.canAct()) return;
    if (this.mods.action('use', this.actionEvent('use', 'touch'))) return;
    if (this.carried && x > r.left + r.width * 0.62 && y > r.top + r.height * 0.6) this.openCarried();
  }

  lookAtPoint(x, y, z) {
    const dx = x - this.player.x;
    const dz = z - this.player.z;
    this.player.faceYaw(Math.atan2(-dx, -dz), Math.atan2(y - this.player.eyeY(), Math.hypot(dx, dz)));
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
      this.touchCtl.gate(this.gateArgs());
      if (this.touchCtl.padShown) this.touchCtl.tick(dt);
    }
    if (!inXr) {
      if (this.mode === 'play' && !this.mods.locked) p.update(dt, (this.desktop || this.touchCtl) ? (this.desktop || this.touchCtl).input : null);
      else p.update(dt, null);
    }
    this.mods.update(dt, now);
    this.syncHeld();
    if (!inXr && this.cinema2d.active) this.cinema2d.tick(dt, now);
    if (!inXr) {
      p.applyCamera(this.engine.camera);
      this.mods.cameraStep(dt);
      this.engine.camera.updateMatrixWorld();
    }
    if (this.hands) {
      const svm = this.modUse('selfview');
      // 1.18.0: gewählte Waffe in die Ego-Hand (eine getragene Hülle geht vor; nach dem Ablegen kommt die Waffe zurück); der Laser leuchtet nur bei laufendem Strahl
      const fw = this.modUse('fight');
      if (fw && typeof fw.heldWeapon === 'function' && !this.carried && !(this.holdview && this.holdview.isOpen)) {
        const hw = fw.heldWeapon();
        if (hw !== this.hands.weapon) this.hands.setHeld(hw ? { weapon: hw } : null);
        const ls = typeof fw.laserState === 'function' ? fw.laserState() : null;
        this.hands.setLaser(!!(ls && ls.on));
      }
      this.hands.setVisible(!inXr && this.mode === 'play' && !this.mods.cam && !(svm && svm.mode && svm.mode() === 'third'));
      if (!inXr) this.hands.update(dt);
    }
    if (inXr && xr.inCinema) { xr.cinemaTick(dt, now); return; }
    this.holdview.update(dt);
    const aimOn = this.mode === 'play' && !this.mods.locked && ((this.desktop && (this.desktop.locked || this.desktop.dragLook)) || (this.touchCtl && this.touchScheme === 'game'));
    if (aimOn) {
      if (now - this.lastAim > 90) { this.lastAim = now; this.updateAim(); }
    }
    else if (this.aim) this.clearAim();
    if (this.pendingUse && this.mode === 'play' && now >= this.pendingUse.at) {
      const ia = this.pendingUse.ia;
      this.pendingUse = null;
      if ((!ia.enabled || ia.enabled()) && this.iaReachable(ia)) ia.onUse();
    }
    if (this.pendingTake && this.mode === 'play' && now >= this.pendingTake.at) {
      const id = this.pendingTake.id;
      this.pendingTake = null;
      this.take(id);
    }
    // Höchstens ein Atlas-Upload pro Frame; bei langsamen Frames gedrosselt (alle 200 ms), damit schwache Geräte trotzdem Cover bekommen.
    const farOut = p.z - this.layout.d > 25; // weit draußen (Straße südlich): der Cover-Manager lädt dort ohnehin nichts nach
    if (farOut) { /* keine Cover-Arbeit */ } else if (dt < 0.04 || now - (this.lastCoverTick || 0) > 200) {
      this.lastCoverTick = now;
      this.covers.tick();
    }
    if (!farOut && now - this.lastCover > 250) {
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
    const y = Number.isFinite(p.y) && p.y > 0.05 ? { y: Math.round(p.y * 100) / 100 } : null; // nur über dem Boden (Dach, Feuertreppe)
    return { ...p.state, ...y, heldId: this.holdview ? this.holdview.itemId : null };
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
    if (!this.engine || !QUALITY_SETTINGS.includes(q)) return;
    if (q === 'ultra' && !this.ultraOk) q = 'high';
    if (this.xr && this.xr.presenting) q = q === 'low' ? 'low' : 'mid'; // in VR nur low/mid
    this.qualitySetting = q;
    this.engine.setAuto(q === 'auto');
    const level = q === 'auto' ? this.engine.preset.level : q;
    this.applyPreset(this.engine.setLevel(level));
  }

  savePrefs() {
    try { this.deps.onPrefs({ quality: this.qualityChosen ? this.qualitySetting : this.savedQuality, sound: this.sound, fps: this.showFps, bigCovers: this.bigCovers, voiceOnline: this.voiceOnline, voiceName: this.voiceName, voicePitch: this.voicePitch, ...(this.touchChosen ? { touchControl: this.touchScheme, touchControlChosen: true } : {}), ...this.touchTune, vr: { ...this.vr } }); } catch { /* egal */ }
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

  /** Touch-Steuerung: 'game' (Standard: Stick links, Wischen rechts, Knöpfe), 'joystick' (Gehen-Knopf + Joystick) oder 'touch' (Halten = laufen, Wischen = umsehen). */
  setTouchControl(s) {
    if (!SCHEMES.includes(s)) return;
    this.touchScheme = s;
    if (this.touchCtl) this.touchCtl.setScheme(s);
    if (this.pause) this.pause.refresh();
    this.syncUi();
  }

  /** Touch-Feineinstellung (Teilobjekt): holdInvertY/X, lookFlipY/X (bool), touchSens ('low'|'normal'|'high'), touchRegrip ('off'|'short'|'long'). Wirkt sofort. */
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
    const lv = { low: 'Niedrig', mid: 'Mittel', high: 'Hoch', ultra: 'Ultra' }[this.engine.preset.level] || '';
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

  // Während des Boots (mods fehlt noch) zurückstellen; enter() öffnet das Terminal danach.
  openTerminalOrQueue(q) {
    if (this.mods && this.mode !== 'boot') this.openTerminal(q);
    else { this.opts.openTerminal = true; this.opts.query = q || ''; }
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
    this.pendingTake = this.pendingUse = null;
    if (this.cinema2d) this.cinema2d.leave('suspend');
    if (this.xr && this.xr.presenting) this.xr.exit(); // Sitzung zuerst beenden
    this.pauseParts();
    if (this.hud) this.hud.showPrompt(false);
    if (this.fs) this.fs.suspend();
    this.notifyState(true);
  }

  /** Schleife, Steuerung, Cover-Warteschlange und Module anhalten (suspend() und boot(), wenn dort währenddessen ausgesetzt wurde). */
  pauseParts() {
    if (this.engine) this.engine.stop();
    if (this.desktop) this.desktop.detach();
    if (this.touchCtl) this.touchCtl.detach();
    if (this.covers) this.covers.pause();
    if (this.mods) this.mods.hook('onSuspend');
  }

  resume(host) {
    if (!this.suspended || this.disposed) return;
    this.suspended = false;
    if (host && host !== this.host) {
      try { this.host.classList.remove('lfx-store-ctl-game'); } catch { /* egal */ }
      while (this.host.firstChild) host.appendChild(this.host.firstChild);
      this.host = host;
      if (this.engine) this.engine.setHost(host);
      if (this.holdview) this.holdview.setHost(host);
      if (this.fs) this.fs.setHost(host);
    }
    if (this.mode === 'boot') { // Boot läuft noch: boot() startet Engine/Steuerung selbst, nur die Pause der Teile aufheben
      if (this.covers) this.covers.resume();
      if (this.mods) this.mods.hook('onResume');
      if (this.fs) this.fs.resume();
      return;
    }
    if (this.desktop) this.desktop.attach();
    if (this.touchCtl) this.touchCtl.attach();
    if (this.covers) this.covers.resume();
    if (this.mods) this.mods.hook('onResume');
    if (this.engine) { this.engine.resize(); this.engine.start((dt, now, frame) => this.tick(dt, now, frame)); }
    if (this.fs) this.fs.resume();
    this.syncUi();
    if (this.afterResume) { const f = this.afterResume; this.afterResume = null; f(); }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try { if (this.host && this.host.classList) this.host.classList.remove('lfx-store-ctl-game'); } catch { /* egal */ }
    try { if (this.cinema2d) this.cinema2d.dispose(); } catch { /* egal */ }
    try { if (this.xr) this.xr.dispose(); } catch { /* egal */ }
    try { if (this.desktop) this.desktop.detach(); } catch { /* egal */ }
    try { if (this.touchCtl) this.touchCtl.detach(); } catch { /* egal */ }
    try { if (this.rotate) this.rotate.destroy(); } catch { /* egal */ }
    if (this.engine) this.engine.stop();
    if (this.mods) this.mods.dispose();
    if (this.holdview) this.holdview.dispose(true);
    if (this.covers) this.covers.dispose();
    try { if (this.hands) this.hands.dispose(); } catch { /* egal */ }
    for (const part of [this.room, this.shelves, this.signs, this.props]) {
      try { if (part) part.dispose(); } catch { /* egal */ }
    }
    if (this.highlight) { this.highlight.geometry.dispose(); this.highlight.material.dispose(); }
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
      teleport(x, z, yaw = app.player.yaw, y, pitch = 0) { app.player.teleport(x, z, yaw, pitch, y); app.lastCover = 0; },
      lookAt(id) {
        const s = app.findSlot(id);
        if (!s) return false;
        const pos = slotWorld(s.fv, s.info, new Vector3(), new Quaternion()).pos;
        const dx = pos.x - app.player.x;
        const dz = pos.z - app.player.z;
        app.player.look(Math.atan2(-dx, -dz) - app.player.yaw, Math.atan2(pos.y - app.player.eyeY(), Math.hypot(dx, dz)) - app.player.pitch);
        return true;
      },
      take(id) { return app.take(id); },
      put() { app.put(); },
      jump() { return app.player.jump(); },
      discover(cmd) { const d = app.mods && app.mods.ctx.use('discover'); if (!d) return []; if (cmd === 'reset') d.reset(); return d.list(); },
      getNetState() { return app.player.getNetState(); },
      pose() { return app.player.pose; },
      carried() { return app.getCarried(); },
      carry(id) { return app.carry(id); },
      drop() { return app.drop(); },
      release() { return app.releaseCarried(); },
      use(name) { return app.mods ? app.mods.ctx.use(name) : undefined; }, // Provider (Debug), z. B. use('physics')
      restore(id) { return app.restoreReleased(id); },
      act(name, src) { return name === 'hit' ? app.doHit(src || 'key') : name === 'throw' ? app.doThrow(src || 'key') : app.doUse(src || 'key'); }, // Debug: Aktion auslösen (hit|throw|use)
      look(yaw, pitch) { app.player.yaw = yaw; app.player.pitch = pitch || 0; app.player.moved++; },
      spawns() { return app.layout.city ? JSON.parse(JSON.stringify(app.layout.city.spawns)) : {}; },
      area() { return areaAt(app.layout, app.player.x, app.player.z, app.player.y || 0); },
      city() { return app.layout.city; },
      ultra() { return app.mods && app.mods.ultra ? app.mods.ultra.api.list() : []; }, // Ultra-Details: [{ key, built, visible, ms }]
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
      input() { return app.touchCtl ? app.touchCtl.diag() : null; }, // Touch-Eingabe-Diagnose (Slots, Gate, Zähler); null ohne Touch
      palastTest(o) { return palastTest(app, o); }, // Spike: Leinwand + Sitz vor dem Spieler (cinema/saal-stub.js)
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
    openTerminal: (q) => app.openTerminalOrQueue(q),
    getState: () => app.getState(),
    setQuality: (q) => app.setQuality(q),
    setSound: (on) => app.setSound(on),
    isXr: () => !!(app.xr && app.xr.presenting),
    leaveCinema: (reason) => { if (app.xr) app.xr.leaveCinema(reason); if (app.cinema2d && app.cinema2d.active) app.cinema2d.leave(reason); },
    cinema2dSetFull: (on) => !!(app.cinema2d && app.cinema2d.setFull(on)),
  };
  if (opts.debug) Object.defineProperty(api, 'debug', { get: () => app.dbg, enumerable: true });
  return api;
}

