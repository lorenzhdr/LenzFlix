// VIDEOTHEK LENZ · VR-Kino: eigener Saal, Leinwand mit dem Jellyfin-Video, Vorhang, Saallicht, Bedienpanel.
// Hülle ↔ 3D: alles am Player läuft über app.deps.cinema (Bridge der Hülle). Vertrag: .tmp/vr/contract.md, docs/store3d.md.
// Phasen: entering (Schwarzblende, Saal bauen) → starting (Watchdog) → playing ⇄ paused; Fehler: failed → leave('fail').
import { headLocal, placeRig } from '../xr/rig.js';
import { createHall, SEATS, SEAT_NAMES, SEAT_EYE } from './hall.js';
import { createScreen } from './screen.js';
import { createSubtitles } from './subtitles.js';
import { createAmbientSampler, smoothColor } from './ambient.js';
import { createControls, SEAT_ORDER, SEAT_LABEL } from './controls.js';

// Start-Watchdog in Stufen (Fehlercodes: T1 kein Player, T2 Stillstand/Zeitlimit, D Fehlerdialog, P play() false, B Bau-Fehler)
const NO_VIDEO_MS = 25000; // Route/<video> nie erreicht -> T1
const STALL_MS = 15000; // Video da, aber 15 s ohne jeden Fortschritt -> T2
const MAX_START_MS = 60000; // absolute Obergrenze bei Fortschritt -> T2
const PREPARE_MS = 8000; // Hinweis „Der Server bereitet den Film vor …“
const PAUSED_HOLD_MS = 1500; // pausiert mit Bild so lange stabil = pausierter Start (Autoplay geblockt)
const SLOW_START_MS = 3000;
const STATE_MS = 200;
const VIDEO_MS = 250;
const SUB_MS = 100;
const FAIL_HOLD_MS = 2600;
const warn = (...a) => { try { console.warn('[LenzFlix Store3D]', ...a); } catch { /* egal */ } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Cinema {
  constructor(app) {
    this.app = app;
    this._active = false;
    this.disposed = false;
    this.phase = 'idle';
    this.item = null;
    this.hall = null;
    this.screen = null;
    this.subs = null;
    this.ambient = null;
    this.controls = null;
    this.video = null;
    this.state = {};
    this.saved = null;
    this.seat = 'mid';
    this.gen = 0;
    this.timers = new Set();
    this.offs = [];
    this._enterPromise = null;
    this._leavePromise = null;
    this._leaveAsked = false;
    this._resetRun();
  }

  _resetRun() {
    this.now = 0;
    this.startAt = null;
    this.baseTime = 0;
    this.lastState = -1e9;
    this.lastVideo = -1e9;
    this.lastSub = -1e9;
    this.spillTarget = null;
    this.spillK = 0;
    this.spill = null;
    this.opened = false;
    this.visible = true;
    this.controlsWanted = false;
    this.failCode = null;
    this.marks = {};
    this.prog = null;
    this.lastProgress = 0;
    this.pausedSince = null;
    this.prepareShown = false;
  }

  /** true ab enter() bis leave() abgeschlossen. */
  get active() { return this._active; }

  get _deps() { const d = this.app.deps; return d && d.cinema ? d.cinema : null; }

  get _xr() { return this.app.xr || null; }

  _fade() { const x = this._xr; return x && x.presenting && x.fade ? x.fade : null; }

  _later(ms, fn) {
    const gen = this.gen;
    const id = setTimeout(() => { this.timers.delete(id); if (gen === this.gen && !this.disposed) fn(); }, ms);
    this.timers.add(id);
    return id;
  }

  _clearTimers() { for (const id of this.timers) clearTimeout(id); this.timers.clear(); }

  // ---------------------------------------------------------------- betreten
  enter(item) {
    if (this._active || this.disposed) return;
    this._active = true;
    this._leaveAsked = false;
    this.gen++;
    this.item = item || null;
    this.phase = 'entering';
    this._resetRun();
    const f = this._fade();
    const run = () => this._build(this.gen);
    if (f) this._enterPromise = Promise.resolve(f.jump(run, { out: 250, in: 700 })).catch((err) => warn('Kino betreten', err));
    else run();
  }

  _seatName() {
    const v = this.app.opts && this.app.opts.vr && this.app.opts.vr.seat;
    return SEAT_NAMES.includes(v) ? v : 'mid';
  }

  _build(gen) {
    const app = this.app;
    const eng = app.engine;
    if (gen !== this.gen || this.disposed || this._leaveAsked || !this._active) return;
    try {
      const p = app.player;
      if (p) this.saved = { x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch };
      try { if (app.holdview && typeof app.holdview.close === 'function') app.holdview.close(false); } catch (err) { warn('Hülle schließen', err); }
      if (app.mods) app.mods.hook('onSuspend');
      this._duck(true);
      if (!this.hall) this.hall = createHall();
      const hall = this.hall;
      hall.curtain(false, true);
      hall.setHouseLight(1, true);
      hall.setSpill({ r: 0, g: 0, b: 0 }, 0);
      this.screen = createScreen();
      hall.scene.add(this.screen.group);
      this.subs = createSubtitles({ screen: this.screen });
      this.seat = this._seatName();
      hall.scene.add(eng.rig);
      eng.setScene(hall.scene);
      this._placeSeat();
      eng.setFoveation(0);
      const title = this._title();
      this.screen.setStatus({ title, text: 'Film wird gestartet …', sub: '' });
      this.controls = createControls({
        openPanel: (spec) => this._xr.openPanel(spec),
        cinema: this._deps || {},
        getState: () => this.state,
        getSeat: () => this.seat,
        onSeat: (n) => this.setSeat(n),
        onBack: () => this.backToStore(),
        toast: (t) => { if (this._xr) this._xr.toast(t); },
      });
      const d = this._deps;
      if (d) {
        this.offs.push(d.onVideo((v) => this._setVideo(v)));
        this.offs.push(d.onChange((s) => { this.state = s || this.state; this._onState(); }));
        this._setVideo(d.video());
        this.state = d.state() || {};
      }
      this.phase = 'starting';
    } catch (err) {
      warn('Kino bauen', err);
      this.failCode = 'B';
      this._selfLeave('fail', 'B');
    }
  }

  _title() {
    const it = this.item;
    return String((it && (it.Name || it.name)) || (this.state && this.state.title) || '');
  }

  _duck(on) {
    try {
      const ctx = this.app.mods && this.app.mods.ctx;
      const snd = ctx && ctx.use('sound');
      if (snd && typeof snd.duck === 'function') snd.duck('cinema', on);
    } catch { /* egal */ }
  }

  _placeSeat() {
    const eng = this.app.engine;
    const s = SEATS[this.seat] || SEATS.mid;
    let head = { x: 0, y: SEAT_EYE, z: 0, yaw: 0, pitch: 0 };
    // eng.camera hängt am Rig und trägt die Kopfpose im Rig-Raum (xr.getCamera() ist außerhalb des Frames Welt-Raum)
    try { if (eng.camera) head = headLocal(eng.camera); } catch { /* egal */ }
    const floor = !this._xr || this._xr.floor !== false;
    let off = floor ? clamp(SEAT_EYE - head.y, -0.7, 0.3) : SEAT_EYE - head.y;
    if (!Number.isFinite(off)) off = 0;
    placeRig(eng.rig, { x: s.x, z: s.z, yaw: s.yaw }, head, { y: s.y + off });
    eng.rig.updateMatrixWorld(true);
  }

  // ---------------------------------------------------------------- Platz
  setSeat(name) {
    if (!SEAT_NAMES.includes(name) || !this._active) return Promise.resolve(false);
    const vr = this.app.opts && this.app.opts.vr;
    if (vr) vr.seat = name;
    try { this.app.savePrefs(); } catch (err) { warn('Platz speichern', err); }
    if (name === this.seat || !this.hall || this.phase === 'entering' || this.phase === 'leaving') { this.seat = name; return Promise.resolve(true); }
    const wasVisible = !!(this.controls && this.controls.visible);
    const go = () => {
      this.seat = name;
      if (this.controls) this.controls.hide();
      this._placeSeat();
    };
    const f = this._fade();
    const done = () => { if (this._active && wasVisible && this.controls && !this._leaveAsked) this.controls.show(); return true; };
    if (!f) { go(); return Promise.resolve(done()); }
    return Promise.resolve(f.jump(go, { out: 160, in: 260 })).then(done, done);
  }

  // ---------------------------------------------------------------- Video / Zustand
  _setVideo(v) {
    if (!this.screen || v === this.video) return;
    this.video = v || null;
    this.screen.setVideo(this.video);
    if (this.ambient) { this.ambient.dispose(); this.ambient = null; }
    if (this.video) {
      this.ambient = createAmbientSampler({ video: this.video });
      this.baseTime = Number(this.video.currentTime) || 0;
    }
  }

  _onState() {
    const st = this.state || {};
    if (this.phase === 'starting') {
      if (st.phase === 'error' && !st.reloading) this._fail('D');
      return;
    }
    if (this.phase !== 'playing' && this.phase !== 'paused') return;
    if (st.route === 'home') { this._selfLeave('home'); return; }
    if (st.phase === 'error' && !st.reloading) { this._fail('D'); return; }
    if (st.phase === 'playing' && this.phase !== 'playing') this._setPlaying(false);
    else if ((st.phase === 'paused' || st.phase === 'ended') && this.phase !== 'paused') this._setPaused();
  }

  _setPlaying(first) {
    this.phase = 'playing';
    const hall = this.hall;
    if (hall) { hall.curtain(true); hall.setHouseLight(0.08); }
    this.spillK = 1;
    if (this.controls) { if (first || this.controls.visible) this.controls.show(); else this.controls.touch(); }
  }

  _setPaused() {
    this.phase = 'paused';
    if (this.hall) this.hall.setHouseLight(0.35);
    this.spillK = 0.35;
    if (this.controls) this.controls.show();
  }

  _checkStart(now) {
    if (this.startAt == null) this.startAt = now;
    const v = this.video;
    const st = this.state || {};
    const el = now - this.startAt;
    const rs = v ? Number(v.readyState) || 0 : 0;
    const frames = this.screen ? this.screen.videoFrames : 0;
    const mark = (k) => { if (this.marks[k] == null) this.marks[k] = Math.round(el); };
    if (v) {
      mark('video');
      this._progress(v, now);
      if (rs >= 2) mark('ready');
      if (frames >= 1) mark('frame');
    }
    if (v && rs >= 2 && frames >= 3 && (Math.abs((Number(v.currentTime) || 0) - this.baseTime) >= 0.3 || st.phase === 'paused')) {
      this.opened = true;
      mark('start');
      if (st.phase === 'paused') { this._setPaused(); this.hall.curtain(true); } else this._setPlaying(true);
      return;
    }
    // Pausierter Start: Bild da, aber Video bleibt pausiert (Browser blockt Autoplay). Kein Fehlschlag: „Weiter“ im Panel ist die Nutzergeste.
    const pausedNow = Boolean(v) && rs >= 2 && Boolean(this.screen && this.screen.hasFrame) && (st.phase === 'paused' || v.paused === true);
    if (pausedNow) {
      if (this.pausedSince == null) this.pausedSince = now;
      else if (now - this.pausedSince >= PAUSED_HOLD_MS) {
        this.opened = true;
        mark('start');
        this._setPaused();
        if (this.hall) this.hall.curtain(true);
        if (this._xr) this._xr.toast('Zum Starten „Weiter“ drücken', 5000);
        return;
      }
    } else this.pausedSince = null;
    // Dauert der Start, Vorhang auf, damit das Status-Bild („Film wird gestartet …“) zu sehen ist
    if (el > SLOW_START_MS && this.hall && !this.hall.curtainOpen) this.hall.curtain(true);
    if (el > PREPARE_MS && !this.prepareShown && this.screen) {
      this.prepareShown = true;
      this.screen.setStatus({ title: this._title(), text: 'Film wird gestartet …', sub: 'Der Server bereitet den Film vor …' });
    }
    if (!v) { if (el > NO_VIDEO_MS) this._fail('T1'); return; }
    if (now - this.lastProgress > STALL_MS || el > MAX_START_MS) this._fail('T2');
  }

  /** Fortschritt des Ladens: readyState steigt, buffered-Ende wächst oder currentTime ändert sich. */
  _progress(v, now) {
    const rs = Number(v.readyState) || 0;
    let be = 0;
    try { const b = v.buffered; if (b && b.length) be = Number(b.end(b.length - 1)) || 0; } catch { /* egal */ }
    const ct = Number(v.currentTime) || 0;
    const p = this.prog;
    if (!p || p.v !== v) { this.prog = { v, rs, be, ct }; this.lastProgress = now; return; }
    if (rs > p.rs || be > p.be + 0.01 || Math.abs(ct - p.ct) > 0.01) this.lastProgress = now;
    p.rs = rs; p.be = be; p.ct = ct;
  }

  /** code: P (play() false), T1 (kein Player), T2 (Stillstand/Zeitlimit), D (Fehlerdialog), B (Bau-Fehler). */
  _fail(code) {
    if (this.phase === 'failed' || this.phase === 'leaving' || !this._active || this._leaveAsked) return;
    this.phase = 'failed';
    this.failCode = code;
    this.marks.fail = Math.round(this.startAt == null ? 0 : this.now - this.startAt);
    warn('Kino-Start fehlgeschlagen', code);
    const d = this._deps;
    const st = this.state || {};
    const txt = `Kino konnte nicht starten (${code})`;
    if (this.screen) this.screen.setStatus({ title: this._title(), text: 'Kino konnte nicht starten', sub: `Zurück in die Videothek … (${code})` });
    if (this.controls) this.controls.hide();
    if (this.hall) this.hall.curtain(true);
    if (this._xr) this._xr.toast(txt, FAIL_HOLD_MS + 600);
    const gen = this.gen;
    const stop = async () => {
      try { if (d && (st.route === 'video' || d.video())) await d.stop(); } catch (err) { warn('Stopp', err); }
      if (gen !== this.gen || this.disposed) return;
      this._later(FAIL_HOLD_MS, () => this._selfLeave('fail', code));
    };
    stop();
  }

  /** Selbst-Verlassen: über app.xr.leaveCinema, damit die Hülle die onXr-Meldung bekommt. */
  _selfLeave(reason, code) {
    if (this._leaveAsked) return;
    const x = this._xr;
    if (x && typeof x.leaveCinema === 'function') x.leaveCinema(reason, code);
    else this.leave(reason, code);
  }

  backToStore() {
    if (this._leaveAsked || !this._active) return;
    const d = this._deps;
    const gen = this.gen;
    Promise.resolve(d ? d.stop() : true).catch(() => false).then(() => { if (gen === this.gen) this._selfLeave('stop'); });
  }

  // ---------------------------------------------------------------- Schleife
  tick(dt, now) {
    if (!this._active || this.disposed) return;
    this.now = now;
    const hall = this.hall;
    if (hall) hall.update(dt);
    if (this.phase === 'entering' || this.phase === 'leaving' || !this.screen) return;
    const d = this._deps;
    if (d && now - this.lastVideo >= VIDEO_MS) {
      this.lastVideo = now;
      try { this._setVideo(d.video()); } catch { /* egal */ }
    }
    if (d && now - this.lastState >= STATE_MS) {
      this.lastState = now;
      try { this.state = d.state() || this.state; } catch { /* egal */ }
      this._onState();
      if (this._leaveAsked) return;
    }
    this.screen.update(now);
    if (this.subs) {
      if (d && now - this.lastSub >= SUB_MS && this.phase !== 'failed') {
        this.lastSub = now;
        try { this.subs.set(d.subtitles()); } catch { /* egal */ }
      }
      this.subs.tick(now);
    }
    if (this.ambient && this.screen.hasFrame && (this.phase === 'playing' || this.phase === 'paused')) {
      const c = this.ambient.update(now);
      if (c) this.spillTarget = c;
    }
    if (this.spillTarget) {
      this.spill = smoothColor(this.spill, this.spillTarget, dt, 0.5);
      hall.setSpill(this.spill, this.spillK == null ? 0 : this.spillK);
    }
    if (this.controls && this.phase !== 'failed') this.controls.tick(now);
    if (this.phase === 'starting') this._checkStart(now);
  }

  // ---------------------------------------------------------------- Eingabe-Hooks (mode.js)
  /** Trigger ins Leere: Bedienpanel ein/aus. */
  onSelectEmpty() {
    if (!this._active || !this.controls || this.phase === 'entering' || this.phase === 'leaving' || this.phase === 'failed') return;
    this.controls.toggle();
  }

  menuItems() {
    if (!this._active) return [];
    const next = SEAT_ORDER[(SEAT_ORDER.indexOf(this.seat) + 1) % SEAT_ORDER.length];
    return [
      { label: 'Zurück in die Videothek', onSelect: () => this.backToStore() },
      { label: `Platz: ${SEAT_LABEL[this.seat] || SEAT_LABEL.mid}`, onSelect: () => this.setSeat(next) },
      { label: 'Kino-Bedienung zeigen', onSelect: () => { if (this.controls && !this.controls.visible) this.controls.show(); } },
    ];
  }

  /** XR-Sichtbarkeit: außerhalb von „visible“ Panel zu, danach wieder zeigen. */
  onVisibility(state) {
    if (!this._active || !this.controls) return;
    if (state !== 'visible') {
      this.controlsWanted = this.controls.visible;
      this.controls.hide();
    } else if (this.controlsWanted && this.phase !== 'failed') {
      this.controlsWanted = false;
      this.controls.show();
    }
  }

  diag() {
    const v = this.video;
    return {
      phase: this._active ? this.phase : 'idle',
      videoFrames: this.screen ? this.screen.videoFrames : 0,
      readyState: v ? Number(v.readyState) || 0 : 0,
      failCode: this.failCode,
      // ms seit Start-Phase: erstes Video, readyState>=2, erster Upload, Start, Fehlschlag
      marks: { ...this.marks },
    };
  }

  // ---------------------------------------------------------------- verlassen
  /** reason: 'home' | 'stop' | 'fail' | 'sessionend'; idempotent. Rückgabe: Promise (löst nach der Rückblende auf). */
  leave(reason = 'stop', code) {
    if (!this._active) return Promise.resolve(false);
    if (this._leavePromise) return this._leavePromise;
    if (code) this.failCode = code;
    this._leaveAsked = true;
    this.gen++;
    this._clearTimers();
    const f = this._fade();
    if (reason === 'sessionend' || !f) {
      this._teardown();
      return Promise.resolve(true);
    }
    this.phase = 'leaving';
    const run = () => this._teardown();
    this._leavePromise = Promise.resolve(this._enterPromise).then(() => f.jump(run, { out: 250, in: 500 })).then(() => {
      this._leavePromise = null;
      // Auch nach Fehlschlag + Rücksprung über #/home (Hülle ruft leave('home')) den Code zeigen
      if ((reason === 'fail' || this.failCode) && this._xr) this._xr.toast(this.failCode ? `Kino konnte nicht starten (${this.failCode})` : 'Kino konnte nicht starten', 3200);
      return true;
    }, (err) => { warn('Kino verlassen', err); this._leavePromise = null; if (this._active) this._teardown(); return false; });
    return this._leavePromise;
  }

  _teardown() {
    if (!this._active) return;
    const app = this.app;
    const eng = app.engine;
    for (const off of this.offs.splice(0)) { try { off(); } catch { /* egal */ } }
    if (this.controls) { this.controls.dispose(); this.controls = null; }
    if (this._xr && typeof this._xr.closePanels === 'function') this._xr.closePanels();
    if (this.subs) { this.subs.dispose(); this.subs = null; }
    if (this.ambient) { this.ambient.dispose(); this.ambient = null; }
    if (this.screen) { this.screen.dispose(); this.screen = null; }
    this.video = null;
    if (eng) {
      eng.storeScene.add(eng.rig);
      eng.setScene(eng.storeScene);
      eng.rig.position.set(0, 0, 0);
      eng.rig.rotation.set(0, 0, 0);
      eng.rig.updateMatrixWorld(true);
      eng.setFoveation(1);
    }
    const s = this.saved;
    if (s && app.player) app.player.teleport(s.x, s.z, s.yaw, s.pitch);
    if (app.mods) app.mods.hook('onResume');
    this._duck(false);
    this.saved = null;
    this._active = false;
    this.phase = 'idle';
    this._leavePromise = null;
    this._enterPromise = null;
  }

  dispose() {
    if (this.disposed) return;
    this._clearTimers();
    if (this._active) { this._leaveAsked = true; this._teardown(); }
    this.disposed = true;
    if (this.hall) { this.hall.dispose(); this.hall = null; }
    this.item = null;
  }
}
