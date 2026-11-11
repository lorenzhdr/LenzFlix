// VIDEOTHEK LENZ · Laufzeit der Modul-Schnittstelle (ctx, Events, Interaktionen, Overlay, Kamera-Übernahme). Siehe modules/index.js.
import { Mesh, BoxGeometry, MeshBasicMaterial, AdditiveBlending, Matrix4, Quaternion, Vector3, CanvasTexture, SRGBColorSpace } from 'three';
import { MODULES } from './index.js';
import { rebuildNav } from '../world/layout.js';
import { findPath } from '../nav/path.js';
import { slotWorld } from '../world/build-shelves.js';
import { loadBitmap, closeBitmap } from '../covers/loader.js';
import { makeCanvas } from '../world/textures.js';
import { disposeTree } from '../util/geo.js';
import { PITCH_FACTOR } from './voice.js';

const ease = (t) => t * t * (3 - 2 * t);
const warn = (...a) => { try { console.warn('[LenzFlix Store3D]', ...a); } catch { /* egal */ } };
function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class ModuleHost {
  constructor(app) {
    this.app = app;
    this.handles = [];
    this.listeners = new Map();
    this.providers = new Map();
    this.interactables = [];
    this.tracked = [];
    this.highlights = new Map();
    this.frozen = false;
    this.cam = null;
    this.look = null;
    this.walkPending = null;
    this.overlayState = null;
    this.navDirty = false;
    this.zoneIn = new Set();
    this.zoneT = 0;
    this.texQueue = [];
    this.texActive = 0;
    this.ac = new AbortController();
    this.ctx = this.makeCtx();
  }

  /** Eingabe gesperrt (freeze() oder Kamera-Übernahme). */
  get locked() { return this.frozen || !!this.cam; }

  makeCtx() {
    const app = this.app;
    const self = this;
    const ctx = {
      scene: app.engine.scene, camera: app.engine.camera, renderer: app.engine.renderer, layout: app.layout,
      catalog: app.deps.catalog, deps: app.deps, opts: app.opts, isPhone: app.phone, isTouch: app.touch,
      quality: () => app.engine.preset.level,
      soundOn: () => app.sound,
      voiceOnline: () => !!app.voiceOnline,
      voicePrefs: () => ({ online: !!app.voiceOnline, name: app.voiceName || '', pitchFactor: PITCH_FACTOR[app.voicePitch] || PITCH_FACTOR.tief }),
      addCollider(rect) {
        if (!rect || app.layout.colliders.includes(rect)) return rect;
        if (!rect.kind) rect.kind = 'prop';
        app.layout.colliders.push(rect);
        self.navDirty = true;
        return rect;
      },
      removeCollider(rect) {
        const i = app.layout.colliders.indexOf(rect);
        if (i >= 0) { app.layout.colliders.splice(i, 1); self.navDirty = true; }
      },
      addInteractable(o) {
        const b = o.box;
        const ia = { box: { min: b.min, max: b.max }, label: o.label || '', hint: o.hint || '', onUse: o.onUse || (() => {}), enabled: o.enabled };
        self.interactables.push(ia);
        return () => { const i = self.interactables.indexOf(ia); if (i >= 0) self.interactables.splice(i, 1); };
      },
      player: {
        getPose: () => app.player.state,
        teleport: (x, z, yaw, pitch) => { app.player.teleport(x, z, yaw === undefined ? app.player.yaw : yaw, pitch || 0); },
        walkTo: (x, z, o) => self.walkTo(x, z, o || {}),
        lookAt: (x, y, z, ms) => self.lookAt(x, y, z, ms),
        freeze: (on) => { self.frozen = !!on; if (on) app.player.cancelPath(); },
        camera: {
          flyTo: (pos, target, ms) => self.flyTo(pos, target, ms),
          release: () => self.release(),
        },
      },
      overlay: {
        open: (el, o) => self.overlayOpen(el, o || {}),
        close: () => self.overlayClose(),
        isOpen: () => !!self.overlayState,
      },
      items: {
        take: (id, o) => app.take(id, { fromCounter: !!(o && o.from === 'counter') }),
        slotOf: (id) => self.slotOf(id),
        highlight: (id, on) => self.highlight(id, on),
      },
      on: (ev, fn) => {
        const l = self.listeners.get(ev) || [];
        l.push(fn);
        self.listeners.set(ev, l);
        return () => { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
      },
      loadTexture: (url, o) => self.loadTexture(url, o || {}),
      track: (obj) => { self.tracked.push(obj); return obj; },
      provide: (name, impl) => { self.providers.set(name, impl); return () => { if (self.providers.get(name) === impl) self.providers.delete(name); }; },
      use: (name) => self.providers.get(name),
    };
    return ctx;
  }

  async init(progress) {
    const n = MODULES.length;
    for (let i = 0; i < n; i++) {
      const m = MODULES[i];
      try {
        const h = await m.init(this.ctx);
        if (h) this.handles.push({ name: m.name, h });
      } catch (err) { warn(`Modul "${m && m.name}" konnte nicht starten`, err); }
      if (progress) progress((i + 1) / n);
    }
  }

  emit(ev, ...args) {
    const l = this.listeners.get(ev);
    if (!l) return;
    for (const fn of l.slice()) { try { fn(...args); } catch (err) { warn(`Event ${ev}`, err); } }
  }

  hook(name, ...args) {
    for (const { name: mn, h } of this.handles) {
      if (typeof h[name] !== 'function') continue;
      try { h[name](...args); } catch (err) { warn(`Modul "${mn}".${name}`, err); }
    }
  }

  flushNav() {
    if (!this.navDirty) return;
    this.navDirty = false;
    rebuildNav(this.app.layout);
  }

  /** Pro Frame (nach player.update). */
  update(dt, now) {
    this.flushNav();
    this.stepLook(dt);
    this.hook('update', dt, now / 1000);
    this.emit('frame', dt, now / 1000);
    if (now - this.zoneT > 200) { this.zoneT = now; this.checkZones(); }
  }

  checkZones() {
    const p = this.app.player;
    const inside = new Set();
    for (const z of Object.values(this.app.layout.zones)) {
      const r = z.rect;
      if (r && p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1) inside.add(z.id);
    }
    for (const id of inside) if (!this.zoneIn.has(id)) this.emit('zone', id);
    this.zoneIn = inside;
  }

  // --- Spieler ---
  walkTo(x, z, o) {
    const app = this.app;
    this.flushNav();
    if (this.walkPending) { this.walkPending(false); this.walkPending = null; }
    return new Promise((resolve) => {
      const path = findPath(app.layout.nav, { x: app.player.x, z: app.player.z }, { x, z });
      if (!path) { resolve(false); return; }
      this.walkPending = resolve;
      app.player.walkTo(path, () => {
        this.walkPending = null;
        if (typeof o.face === 'number') app.player.faceYaw(o.face);
        else if (o.face && Number.isFinite(o.face.x)) app.player.faceYaw(Math.atan2(-(o.face.x - app.player.x), -(o.face.z - app.player.z)));
        resolve(true);
      });
    });
  }

  lookAt(x, y, z, ms = 400) {
    const p = this.app.player;
    if (this.look) this.look.resolve(false);
    const dx = x - p.x;
    const dz = z - p.z;
    const ty = Math.atan2(-dx, -dz);
    const tp = Math.atan2(y - 1.65, Math.hypot(dx, dz));
    p.turnTo = null;
    return new Promise((resolve) => {
      this.look = { y0: p.yaw, dy: angDiff(p.yaw, ty), p0: p.pitch, dp: tp - p.pitch, t: 0, dur: Math.max(1, ms) / 1000, resolve };
    });
  }

  stepLook(dt) {
    const l = this.look;
    if (!l) return;
    l.t = Math.min(1, l.t + dt / l.dur);
    const k = ease(l.t);
    const p = this.app.player;
    p.yaw = l.y0 + l.dy * k;
    p.pitch = l.p0 + l.dp * k;
    p.moved++;
    if (l.t >= 1) { this.look = null; l.resolve(true); }
  }

  // --- Kamera-Übernahme ---
  flyTo(pos, target, ms = 1000) {
    const cam = this.app.engine.camera;
    if (this.cam && this.cam.resolve) this.cam.resolve(false);
    const eye = new Vector3(pos.x, pos.y, pos.z);
    const m = new Matrix4().lookAt(eye, new Vector3(target.x, target.y, target.z), new Vector3(0, 1, 0));
    const toQuat = new Quaternion().setFromRotationMatrix(m);
    return new Promise((resolve) => {
      this.cam = {
        fromPos: cam.position.clone(), fromQuat: cam.quaternion.clone(), toPos: eye, toQuat, t: 0, dur: Math.max(1, ms) / 1000, resolve,
      };
    });
  }

  /** Nach player.applyCamera aufrufen; liefert true, solange die Modul-Kamera aktiv ist. */
  cameraStep(dt) {
    const c = this.cam;
    if (!c) return false;
    const cam = this.app.engine.camera;
    if (c.t < 1) {
      c.t = Math.min(1, c.t + dt / c.dur);
      const k = ease(c.t);
      cam.position.lerpVectors(c.fromPos, c.toPos, k);
      cam.quaternion.slerpQuaternions(c.fromQuat, c.toQuat, k);
      if (c.t >= 1 && c.resolve) { const r = c.resolve; c.resolve = null; r(true); }
    } else {
      cam.position.copy(c.toPos);
      cam.quaternion.copy(c.toQuat);
    }
    return true;
  }

  release() {
    if (!this.cam) return;
    const r = this.cam.resolve;
    this.cam = null;
    if (r) r(false);
  }

  // --- Overlay ---
  overlayOpen(el, o) {
    const app = this.app;
    if (this.overlayState) this.overlayClose();
    this.overlayState = { el, onClose: o.onClose, prev: app.mode };
    app.host.appendChild(el);
    if (app.desktop) app.desktop.releaseLock();
    app.player.cancelPath();
    app.setMode('overlay');
  }

  overlayClose() {
    const st = this.overlayState;
    if (!st) return;
    this.overlayState = null;
    const app = this.app;
    if (st.el.parentNode) st.el.parentNode.removeChild(st.el);
    try { if (st.onClose) st.onClose(); } catch (err) { warn('overlay.onClose', err); }
    app.setMode(st.prev === 'hold' && app.holdview.isOpen ? 'hold' : 'play');
    if (app.mode === 'play' && app.desktop && !app.suspended) app.desktop.requestLock();
  }

  // --- Hüllen ---
  slotOf(id) {
    const app = this.app;
    const s = app.findSlot(id);
    if (!s) return null;
    const pos = slotWorld(s.fv, s.info, new Vector3(), new Quaternion()).pos;
    const f = s.fv.face;
    const run = app.layout.runs.findIndex((r) => r.id === f.run);
    return { x: pos.x, y: pos.y, z: pos.z, dept: f.dept, face: f.index, run: run + 1, stand: { ...f.stand } };
  }

  highlight(id, on) {
    const old = this.highlights.get(id);
    if (!on) {
      if (old) { old.removeFromParent(); old.geometry.dispose(); old.material.dispose(); this.highlights.delete(id); }
      return;
    }
    if (old) return;
    const s = this.app.findSlot(id);
    if (!s) return;
    const m = new Mesh(
      new BoxGeometry(0.17, 0.23, 0.05),
      new MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.35, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
    );
    slotWorld(s.fv, s.info, m.position, m.quaternion);
    m.renderOrder = 6;
    this.app.engine.scene.add(m);
    this.highlights.set(id, m);
  }

  // --- Texturen ---
  loadTexture(url, o) {
    return new Promise((resolve) => {
      this.texQueue.push({ url, o, resolve });
      this.pumpTex();
    });
  }

  pumpTex() {
    while (this.texActive < 4 && this.texQueue.length) {
      const j = this.texQueue.shift();
      this.texActive++;
      loadBitmap(j.url, this.ac.signal).then((bm) => {
        this.texActive--;
        let tex = null;
        if (bm) {
          const maxW = j.o.maxWidth || 512;
          const sw = bm.width || bm.naturalWidth;
          const sh = bm.height || bm.naturalHeight;
          const k = Math.min(1, maxW / sw);
          const c = makeCanvas(Math.max(1, Math.round(sw * k)), Math.max(1, Math.round(sh * k)));
          try { c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height); tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace; this.tracked.push(tex); } catch { tex = null; }
          closeBitmap(bm);
        }
        j.resolve(tex);
        this.pumpTex();
      });
    }
  }

  // --- Lebenszyklus ---
  dispose() {
    this.ac.abort();
    this.texQueue.forEach((j) => j.resolve(null));
    this.texQueue = [];
    this.hook('dispose');
    this.handles = [];
    this.overlayClose();
    this.release();
    for (const id of [...this.highlights.keys()]) this.highlight(id, false);
    for (const t of this.tracked) {
      try {
        if (t && t.isObject3D) { disposeTree(t); if (t.removeFromParent) t.removeFromParent(); } else if (t && typeof t.dispose === 'function') t.dispose();
      } catch { /* egal */ }
    }
    this.tracked = [];
    this.interactables = [];
    this.listeners.clear();
    this.providers.clear();
  }
}
