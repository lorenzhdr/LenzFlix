// VIDEOTHEK LENZ · 2D-Kino im LENZ PALAST (PalastCinema). Die Leinwand liegt in der WELTSZENE (kein eigener Saal wie im VR-Kino):
// screen.js/subtitles.js/ambient.js werden wiederverwendet, der Saal (Welle 2) liefert nur ein `saal`-Handle (attachSaal).
// Ablauf: sit(seatId) → play(item) (über deps.play, der wrapDeps-Zweig ruft beforePlay) → Start-Watchdog (startwatch.js) →
// playing ⇄ paused; Rückfall „Leinwand nicht verfügbar“ = Vollbild (Bühne ausblenden, Jellyfin-OSD sichtbar).
// Hülle ↔ 3D: Player nur über app.deps.cinema (Bridge), Zustand an die Hülle über app.deps.onCinema2d({ active, full }).
// Vertrag: docs/store3d.md („2D-Kino im LENZ PALAST“). Kein Jellyfin-DOM, kein `three`-fremder Import.
import { Vector3 } from 'three';
import { createScreen } from './screen.js';
import { createSubtitles } from './subtitles.js';
import { createAmbientSampler, smoothColor, newBlackState, trackBlack } from './ambient.js';
import { createStartWatch } from './startwatch.js';
import { createFeed } from './feed.js';
import { failToast } from './failcodes.js';
import { createBar } from './bar2d.js';
import { createKeyGuard } from './keyguard.js';
import { stepVolume, applyVolumeStep } from './controls.js';

const FAIL_HOLD_MS = 1800; // Statusbild „Kino konnte nicht starten“ bleibt so lange stehen
const GAP_MS = 2000; // größere Lücke zwischen zwei Ticks = Hintergrund-Tab (Uhr des Watchdogs nachziehen)
const warn = (...a) => { try { console.warn('[LenzFlix Store3D]', ...a); } catch { /* egal */ } };
const call = (o, name, ...a) => { if (o && typeof o[name] === 'function') { try { return o[name](...a); } catch (err) { warn(name, err); } } return undefined; };

/** Liegt (x, z) im Saal? bounds = { x0, z0, x1, z1 } (Reihenfolge der Ecken egal). */
export function inBounds(b, x, z) {
  if (!b) return false;
  return x >= Math.min(b.x0, b.x1) && x <= Math.max(b.x0, b.x1) && z >= Math.min(b.z0, b.z1) && z <= Math.max(b.z0, b.z1);
}

/** Sitz wählen (rein): per id, sonst der dem Spieler nächste. seats = [{ id, x, y, z, yaw }]. */
export function pickSeat(seats, id, pos) {
  const list = Array.isArray(seats) ? seats.filter((s) => s && Number.isFinite(s.x) && Number.isFinite(s.z)) : [];
  if (!list.length) return null;
  if (id != null) { const hit = list.find((s) => s.id === id); if (hit) return hit; }
  if (!pos) return list[0];
  let best = list[0];
  let bd = Infinity;
  for (const s of list) { const d = (s.x - pos.x) ** 2 + (s.z - pos.z) ** 2; if (d < bd) { bd = d; best = s; } }
  return best;
}

export class PalastCinema {
  /** app: StoreApp (oder Attrappe): deps, engine, player, mods, desktop, xr. */
  constructor(app) {
    this.app = app;
    this.saal = null;
    this.disposed = false;
    this.active = false; // ab beforePlay bis leave
    this.full = false;
    this.seated = false;
    this.seatId = null;
    this.phase = 'idle'; // idle | starting | playing | paused | fallback | failed
    this.item = null;
    this.state = {};
    this.video = null;
    this.screen = null;
    this.subs = null;
    this.ambient = null;
    this.bar = null;
    this.snap = null;
    this.gen = 0;
    this.timers = new Set();
    this.watch = createStartWatch();
    this.feed = createFeed({ getDeps: () => this._bridge });
    this.guard = null;
    this.overlayMine = false;
    this.deskDetached = false;
    this._pauseOnStand = true;
    this.fallbackCode = null;
    this.failCode = null;
    this.black = newBlackState();
    this.blackIgnored = false;
    this._resetRun();
  }

  _resetRun() {
    this.now = 0;
    this.lastNow = null;
    this.baseTime = 0;
    this.spillTarget = null;
    this.spill = null;
    this.spillK = 0;
    this.startPending = false;
    this.opened = false;
    this.reloadShown = null;
    this.stopping = false;
    this.backPending = false;
    this.failCode = null;
    this.fallbackCode = null;
    this.black = newBlackState();
    this.blackIgnored = false;
    this.watch.reset();
    this.feed.reset();
  }

  // ---------------------------------------------------------------- Zugriffe
  get _bridge() { const d = this.app.deps; return d && d.cinema ? d.cinema : null; }

  get _ctx() { return this.app.mods && this.app.mods.ctx ? this.app.mods.ctx : null; }

  _inXr() { const x = this.app.xr; return Boolean(x && x.presenting); }

  _toast(text) { try { const d = this.app.deps; if (d && typeof d.toast === 'function') d.toast(text); } catch { /* egal */ } }

  _notify() {
    const d = this.app.deps;
    if (d && typeof d.onCinema2d === 'function') { try { d.onCinema2d({ active: this.active, full: this.active && this.full }); } catch (err) { warn('onCinema2d', err); } }
  }

  _later(ms, fn) {
    const gen = this.gen;
    const id = setTimeout(() => { this.timers.delete(id); if (gen === this.gen && !this.disposed) fn(); }, ms);
    this.timers.add(id);
    return id;
  }

  _clearTimers() { for (const id of this.timers) clearTimeout(id); this.timers.clear(); }

  /** Beim Modul-Host anmelden: ctx.use('cinema2d') liefert diese Instanz (Welle 2). */
  register(ctx) { if (ctx && typeof ctx.provide === 'function') return ctx.provide('cinema2d', this); return null; }

  // ---------------------------------------------------------------- Saal
  /** saal: { anchor: Object3D, screenOpts, seats, aisle, bounds, curtain?(open, instant), light?(k), spill?({r,g,b}, k), dispose?() }. Rückgabe: Abmelder. */
  attachSaal(saal) {
    if (this.disposed || !saal || !saal.anchor) return () => {};
    if (this.saal && this.saal !== saal) this.detachSaal();
    this.saal = saal;
    return () => { if (this.saal === saal) this.detachSaal(); };
  }

  detachSaal() {
    if (this.active) this.leave('saal');
    else if (this.seated) this.stand({ pause: false });
    this.saal = null;
  }

  /** Soll deps.play den 2D-Weg nehmen? Nicht in VR; sonst: Kino läuft schon, oder der Spieler steht im Saal. */
  wantsPlay() {
    if (this.disposed || !this.saal || this._inXr()) return false;
    if (this.active) return true;
    const p = this.app.player;
    return Boolean(p && inBounds(this.saal.bounds, p.x, p.z));
  }

  /** Saal verlassen (Zone-Exit): Film stoppen, Jellyfin zurück, Kino beenden. */
  stopAndRelease() { return this._stopThenLeave('stop'); }

  // ---------------------------------------------------------------- Sitzen
  /** Hinsetzen (Couch-Muster aus modules/tv.js): Spieler einfrieren, Kamera fliegt auf den Sitz, Leiste als Overlay. */
  sit(seatId) {
    const ctx = this._ctx;
    if (this.disposed || !this.saal || !ctx || this._inXr()) return false;
    if (this.seated) return true;
    if (ctx.overlay.isOpen()) return false;
    const seat = pickSeat(this.saal.seats, seatId, this.app.player);
    if (!seat) return false;
    this.seated = true;
    this.seatId = seat.id;
    this.snap = { ...ctx.player.getPose() };
    ctx.player.freeze(true);
    this._duck(true);
    this._ensureBar();
    this.overlayMine = true;
    ctx.overlay.open(this.bar.el, { onClose: () => this._afterStand() });
    const eye = { x: seat.x, y: Number.isFinite(seat.y) ? seat.y : 1.15, z: seat.z };
    ctx.player.camera.flyTo(eye, this._lookTarget(seat, eye), 750);
    return true;
  }

  _lookTarget(seat, eye) {
    const v = new Vector3();
    if (this.screen) { this.screen.group.getWorldPosition(v); return { x: v.x, y: v.y, z: v.z }; }
    const s = this.saal;
    if (s && s.anchor && typeof s.anchor.getWorldPosition === 'function') { s.anchor.getWorldPosition(v); return { x: v.x, y: eye.y + 0.4, z: v.z }; }
    const yaw = Number(seat.yaw) || 0;
    return { x: eye.x - Math.sin(yaw) * 5, y: eye.y, z: eye.z - Math.cos(yaw) * 5 };
  }

  /** Aufstehen (Leiste „Aufstehen“, Esc): Film pausieren, Spieler an den Gang. active bleibt wahr (Jellyfin-Player läuft im Hintergrund). */
  stand({ pause = true } = {}) {
    if (!this.seated) return false;
    this._pauseOnStand = pause;
    const ctx = this._ctx;
    if (this.overlayMine && ctx) ctx.overlay.close(); // → _afterStand
    else this._afterStand();
    return true;
  }

  /** Jellyfin läuft laut frischem Bridge-Zustand (nicht nach der Adapter-Phase: auch nach Rückfall/Vollbild richtig). */
  _isPlaying() {
    let st = this.state;
    try { const d = this._bridge; if (d) st = d.state() || st; } catch { /* egal */ }
    return Boolean(st && st.phase === 'playing');
  }

  _afterStand() {
    if (!this.seated) return;
    this.seated = false;
    this.overlayMine = false;
    // Aufstehen pausiert den Film – auch bei Esc (desktop.js → overlayClose ruft hier direkt an); leave/dispose übergeben pause:false
    const pause = this._pauseOnStand !== false && this.active;
    this._pauseOnStand = true;
    if (pause && this._isPlaying()) call(this._bridge, 'togglePause');
    const ctx = this._ctx;
    const a = this.saal && this.saal.aisle;
    if (ctx) {
      call(ctx.player.camera, 'release');
      if (a && Number.isFinite(a.x)) ctx.player.teleport(a.x, a.z, Number.isFinite(a.yaw) ? a.yaw : undefined, 0);
      ctx.player.freeze(false);
    }
    if (this.bar) { this.bar.dispose(); this.bar = null; }
    this._duck(false);
  }

  _ensureBar() {
    if (this.bar) return;
    this.bar = createBar({
      bridge: this._bridge || {},
      getState: () => this._barState(),
      onStand: () => this.stand(),
      onFull: () => this.setFull(true),
      toast: (t) => this._toast(t),
    });
  }

  _barState() {
    const st = this.state || {};
    return { ...st, startPending: this.startPending, ended: st.phase === 'ended', canFull: this.active };
  }

  _duck(on) {
    try {
      const ctx = this._ctx;
      const snd = ctx && ctx.use('sound');
      if (snd && typeof snd.duck === 'function') snd.duck('cinema', on);
    } catch { /* egal */ }
  }

  // ---------------------------------------------------------------- Wiedergabe starten
  /** Film starten: über deps.play (wrapDeps-Zweig → beforePlay → echtes play mit noCover). Nicht-VR. */
  play(item, o = {}) {
    const d = this.app.deps;
    if (this.disposed || !d || typeof d.play !== 'function') return Promise.resolve(false);
    return Promise.resolve(d.play(item, o));
  }

  /** Vom wrapDeps-Zweig VOR dem echten deps.play gerufen: Lauf aufsetzen, sitzen, Hülle benachrichtigen. */
  beforePlay(item) {
    if (this.disposed || !this.saal) return false;
    const fresh = !this.active;
    this.gen++;
    this._clearTimers();
    this.item = item || null;
    this._resetRun();
    this.active = true;
    this.phase = 'starting';
    if (this.full) this._setFull(false);
    if (fresh || !this.screen) this._build();
    else if (this.screen) this.screen.setStatus({ title: this._title(), text: 'Film wird gestartet …', sub: '' });
    if (!this.active) return false; // Bau-Fehler (B) hat das Kino schon verlassen
    call(this.app.holdview, 'close', false); // gehaltene Hülle weg, sonst bliebe Modus „hold“ unter dem Overlay
    if (!this.seated) this.sit(null);
    this._attachGuard();
    this._notify();
    return true;
  }

  _build() {
    try {
      const saal = this.saal;
      this.screen = createScreen(saal.screenOpts || {});
      saal.anchor.add(this.screen.group);
      this.subs = createSubtitles({ screen: this.screen });
      this.screen.setStatus({ title: this._title(), text: 'Film wird gestartet …', sub: '' });
      call(saal, 'curtain', false, true);
      call(saal, 'light', 1);
      call(saal, 'spill', { r: 0, g: 0, b: 0 }, 0);
      const d = this._bridge;
      if (d) {
        this.feed.subscribe({ onVideo: (v) => this._setVideo(v), onChange: (s) => { this.state = s || this.state; this._onState(); } });
        this._setVideo(d.video());
        this.state = d.state() || {};
      }
    } catch (err) {
      warn('Palast-Kino bauen', err);
      this.leave('build', 'B'); // kein Toast: der Aufrufer (wrapDeps) fällt auf den normalen 2D-Weg zurück
    }
  }

  _title() {
    const it = this.item;
    const st = this.state || {};
    const live = this.phase === 'playing' || this.phase === 'paused';
    return String((live && st.title) || (it && (it.Name || it.name)) || st.title || '');
  }

  _attachGuard() {
    if (!this.guard) {
      this.guard = createKeyGuard({
        isActive: () => this.active && !this.full,
        isSeated: () => this.seated && this.phase !== 'failed',
        handlers: {
          pause: () => { if (this.bar) this.bar.touch(); call(this._bridge, 'togglePause'); },
          seekBy: (d) => { if (this.bar) this.bar.touch(); call(this._bridge, 'seekBy', d); },
          volume: (dir) => { if (this.bar) this.bar.touch(); applyVolumeStep(stepVolume(this.state, dir), this._bridge || {}, (t) => this._toast(t)); },
          mute: () => { if (this.bar) this.bar.touch(); call(this._bridge, 'toggleMute'); },
          full: () => this.setFull(true),
        },
      });
    }
    this.guard.attach();
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
      if (st.phase === 'error' && !st.reloading) this._giveUp('D');
      return;
    }
    if (this.phase !== 'playing' && this.phase !== 'paused' && this.phase !== 'fallback') return;
    if (st.route === 'home') { this.leave('home'); return; }
    if (this.phase === 'fallback') return;
    if (st.phase === 'error' && !st.reloading) { this._giveUp('D'); return; }
    if (st.phase === 'playing' && this.phase !== 'playing') this._setPlaying();
    else if ((st.phase === 'paused' || st.phase === 'ended') && this.phase !== 'paused') this._setPaused();
  }

  _setPlaying() {
    this.phase = 'playing';
    this.startPending = false;
    call(this.saal, 'curtain', true);
    call(this.saal, 'light', 0.08);
    this.spillK = 1;
  }

  _setPaused() {
    this.phase = 'paused';
    call(this.saal, 'light', 0.35);
    this.spillK = 0.35;
  }

  _checkStart(now) {
    const r = this.watch.step({
      now, video: this.video, state: this.state, frames: this.screen ? this.screen.videoFrames : 0, hasFrame: Boolean(this.screen && this.screen.hasFrame), baseTime: this.baseTime,
    });
    if (r.event === 'start') {
      this.opened = true;
      call(this.saal, 'curtain', true);
      if (r.paused) { this._setPaused(); this.startPending = true; } else this._setPlaying();
      return;
    }
    if (r.event === 'pausedStart') {
      // Autoplay gesperrt: „Starten“ in der Leiste ist die Nutzergeste (togglePause synchron im Klick)
      this.opened = true;
      call(this.saal, 'curtain', true);
      this._setPaused();
      this.startPending = true;
      this._toast('Zum Starten „Starten“ drücken');
      return;
    }
    if (r.slow) call(this.saal, 'curtain', true);
    if (r.prepare && this.screen) this.screen.setStatus({ title: this._title(), text: 'Film wird gestartet …', sub: 'Der Server bereitet den Film vor …' });
    if (r.event === 'fail') this._giveUp(r.code);
  }

  // ---------------------------------------------------------------- Fehler / Rückfall
  /**
   * Start gescheitert (T1/T2/D). Läuft Jellyfins Player-Seite (Route video), zeigt Vollbild dessen eigene Meldung bzw. das Bild
   * („Leinwand nicht verfügbar“); sonst gibt es nichts zu zeigen: aufstehen und das Kino verlassen.
   */
  _giveUp(code) {
    if (!this.active || this.phase === 'failed' || this.phase === 'fallback') return;
    const onVideoRoute = (this.state || {}).route === 'video' || Boolean(this.video);
    if (code === 'T1' && !onVideoRoute) { this._failLeave(code); return; }
    this._fallback(code);
  }

  _fallback(code) {
    this.phase = 'fallback';
    this.fallbackCode = code || null;
    this.failCode = code || null;
    this._clearTimers();
    this.setFull(true, { notice: code ? `Leinwand nicht verfügbar (${code})` : 'Leinwand nicht verfügbar' });
  }

  _failLeave(code) {
    if (!this.active || this.phase === 'failed') return;
    this.phase = 'failed';
    this.failCode = code;
    const d = this._bridge;
    const st = this.state || {};
    if (this.screen) this.screen.setStatus({ title: this._title(), text: 'Kino konnte nicht starten', sub: `Zurück in die Videothek … (${code})` });
    this._toast(failToast(code));
    const gen = this.gen;
    const run = async () => {
      try { if (d && (st.route === 'video' || d.video())) await d.stop(); } catch (err) { warn('Stopp', err); }
      if (gen !== this.gen || this.disposed) return;
      this._later(FAIL_HOLD_MS, () => this.leave('fail', code));
    };
    run();
  }

  /** deps.play false/Fehler (wrapDeps) oder ein anderer Abbruch: sofort verlassen. */
  _stopThenLeave(reason) {
    if (!this.active || this.stopping) return Promise.resolve(false);
    const d = this._bridge;
    const st = this.state || {};
    if (d && this.phase === 'starting' && !this.video && st.route !== 'video' && !d.video()) { this.backPending = true; return Promise.resolve(true); }
    this.stopping = true;
    this.backPending = false;
    const gen = this.gen;
    return Promise.resolve(d ? d.stop() : true).catch(() => false).then(() => { if (gen === this.gen) { this.stopping = false; return this.leave(reason); } return false; });
  }

  // ---------------------------------------------------------------- Vollbild
  /** Vollbild = Bühne ausblenden (Hülle setzt die Klasse), Jellyfin-OSD ist bedienbar; Rückkehr über „Zurück ins Kino“. */
  setFull(on, { notice } = {}) {
    if (!this.active || this.disposed) return false;
    on = Boolean(on);
    if (this.full === on) return true;
    this._setFull(on);
    if (notice) this._toast(notice);
    this._notify();
    return true;
  }

  _setFull(on) {
    this.full = on;
    const eng = this.app.engine;
    call(eng, 'setRenderEnabled', !on);
    const dk = this.app.desktop;
    // Vollbild: Desktop-Steuerung ab, sonst schluckt sie Esc/WASD vor Jellyfin (Esc würde „aufstehen“ bei unsichtbarer Bühne)
    if (on && dk && !this.deskDetached) { call(dk, 'detach'); this.deskDetached = true; }
    else if (!on && this.deskDetached) { this._reattachDesk(); }
    if (this.bar) { if (on) this.bar.hide(); else this.bar.show(); }
    // Zurück aus dem Rückfall: ab hier wieder normale Übergänge (der nächste Zustand setzt playing/paused samt Saallicht)
    if (!on && this.phase === 'fallback') this.phase = 'paused';
  }

  _reattachDesk() {
    this.deskDetached = false;
    const a = this.app;
    if (a.desktop && !a.suspended && !a.disposed) call(a.desktop, 'attach');
  }

  // ---------------------------------------------------------------- Schleife
  tick(dt, now) {
    if (!this.active || this.disposed) return;
    if (this.lastNow != null && now - this.lastNow > GAP_MS) this.watch.shiftClock(now - this.lastNow);
    this.lastNow = now;
    this.now = now;
    if (!this.screen) return;
    const pv = this.feed.pollVideo(now);
    if (pv) { try { this._setVideo(pv.value); } catch { /* egal */ } }
    const ps = this.feed.pollState(now);
    if (ps) {
      this.state = ps.value || this.state;
      this._onState();
      if (!this.active) return;
    }
    if (this.backPending && (this.video || (this.state || {}).route === 'video')) { this.backPending = false; this._stopThenLeave('stop'); if (!this.active) return; }
    this.screen.update(now);
    const live = this.phase === 'playing' || this.phase === 'paused';
    if (live && !this.screen.hasFrame) {
      const title = this._title();
      if (this.reloadShown !== title) { this.reloadShown = title; this.screen.setStatus({ title, text: 'Wird geladen …', sub: '' }); }
    } else this.reloadShown = null;
    if (this.subs) {
      const pu = this.feed.pollSubs(now, this.phase !== 'failed', this.screen.hasFrame);
      if (pu) { try { this.subs.set(pu.value); } catch { /* egal */ } }
      this.subs.tick(now);
    }
    this._ambient(dt, now);
    if (!this.active) return;
    // Saal verlassen (stehend, außerhalb der Saal-Zone): Film stoppen, Jellyfin zurück, Kino beenden
    const b = this.saal && this.saal.bounds;
    const p = this.app.player;
    if (b && p && !this.seated && !this.full && !this.stopping && this.phase !== 'failed' && !inBounds(b, p.x, p.z)) { this._stopThenLeave('stop'); if (!this.active) return; }
    if (this.bar) this.bar.update(this._barState());
    if (this.phase === 'starting') this._checkStart(now);
  }

  _ambient(dt, now) {
    const amb = this.ambient;
    if (!amb || this.phase === 'failed' || this.phase === 'fallback') return;
    const c = amb.update(now);
    if (c) {
      if (this.screen.hasFrame && (this.phase === 'playing' || this.phase === 'paused')) this.spillTarget = c;
      const v = this.video;
      if (!this.blackIgnored && trackBlack(c, now, this.black, { ready: (Number(v && v.readyState) || 0) >= 2, currentTime: v ? v.currentTime : 0 })) this._blackScreen();
    } else if (amb.tainted && !this.blackIgnored) this._blackScreen();
    if (this.spillTarget) {
      this.spill = smoothColor(this.spill, this.spillTarget, dt, 0.5);
      call(this.saal, 'spill', this.spill, this.spillK == null ? 0 : this.spillK);
    }
  }

  /** Leinwand liefert nur Schwarz (z. B. natives HLS am iPhone) oder das Video ist nicht lesbar: einmal je Lauf Vollbild. */
  _blackScreen() {
    this.blackIgnored = true;
    if (this.phase === 'fallback' || this.phase === 'failed') return;
    this._fallback(null);
  }

  // ---------------------------------------------------------------- Verlassen
  /**
   * reason: 'home' (Route #/home) | 'stop' | 'fail' (code) | 'suspend' | 'dispose' | 'saal'; idempotent.
   * Beendet den Lauf (Leinwand, Leiste, Wächter), stellt Render/Desktop wieder her, setzt den Spieler an den Gang und meldet die Hülle.
   */
  leave(reason = 'stop', code) {
    if (!this.active) return Promise.resolve(false);
    const st = this.state || {};
    const ended = st.phase === 'ended' || (st.duration > 0 && st.time >= st.duration - 1);
    this.active = false;
    this.gen++;
    this._clearTimers();
    this.phase = 'idle';
    if (code) this.failCode = code;
    this.feed.unsubscribe();
    if (this.guard) this.guard.detach();
    if (this.full) { this.full = false; call(this.app.engine, 'setRenderEnabled', true); }
    if (this.deskDetached) this._reattachDesk();
    if (this.seated) this.stand({ pause: false });
    if (this.bar) { this.bar.dispose(); this.bar = null; }
    if (this.subs) { this.subs.dispose(); this.subs = null; }
    if (this.ambient) { this.ambient.dispose(); this.ambient = null; }
    if (this.screen) { this.screen.dispose(); this.screen = null; }
    this.video = null;
    this.item = null;
    this.startPending = false;
    const s = this.saal;
    if (s) { call(s, 'curtain', false); call(s, 'light', 1); call(s, 'spill', { r: 0, g: 0, b: 0 }, 0); }
    this._notify();
    if (reason === 'fail') this._toast(failToast(code || this.failCode));
    else if (reason === 'home' || reason === 'stop') this._toast(reason === 'home' && ended ? 'Abspann vorbei' : 'Film beendet');
    return Promise.resolve(true);
  }

  /** Für Mehrspieler (1.16): Form des synchronisierbaren Zustands. */
  getNetState() {
    const st = this.state || {};
    return { active: this.active, phase: this.phase, seatId: this.seatId, time: Number(st.time) || 0, itemId: this.item ? (this.item.Id || this.item.id || null) : null };
  }

  /** Platzhalter für Mehrspieler (1.16): noch nicht umgesetzt. */
  applyRemote() { return false; }

  diag() {
    return {
      phase: this.phase, active: this.active, full: this.full, seated: this.seated, failCode: this.failCode, fallbackCode: this.fallbackCode,
      videoFrames: this.screen ? this.screen.videoFrames : 0, marks: { ...this.watch.marks }, renderEnabled: !this.full,
    };
  }

  dispose() {
    if (this.disposed) return;
    if (this.active) this.leave('dispose');
    else if (this.seated) this.stand({ pause: false });
    this.disposed = true;
    this._clearTimers();
    this.feed.dispose();
    if (this.guard) { this.guard.detach(); this.guard = null; }
    if (this.bar) { this.bar.dispose(); this.bar = null; }
    this.saal = null;
  }
}
