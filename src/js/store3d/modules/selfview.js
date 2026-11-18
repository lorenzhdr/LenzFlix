// VIDEOTHEK LENZ · Modul `selfview` (1.17.0): eigener Körper und Außenansicht (Taste V, Knopf „Ansicht“).
// Provider 'selfview' (Vertrag .tmp/v117/contracts.md §5):
//   mode() → 'ego'|'third' (WIRKSAME Ansicht: bei Auto-Ego 'ego') · setMode(m) · toggle() · eye(out: Vector3) → Vector3 (Ego: Kamera, Außenansicht: Auge der Figur)
//   · figure() → Handle | null (volle eigene Figur) · playAnim(name) (null/'idle'/'stand' beendet eine Dauer-Animation wie 'sit').
// Wahl wird in deps.profile (set.cam) gespeichert und beim Start gelesen; Standard 'ego'.
// Außenansicht: ctx.player.camera.setRig(fn) (Kamera hinter dem Auge, char/tpcam.js). Das Rig bleibt dauerhaft eingehängt (in Ego tut es nichts);
//   „Rig lief im letzten Frame“ ist das Signal, dass keine Modul-Kamera (Couch, Kino, Kasse, Intro) aktiv ist.
// Automatisch Ego: Overlay offen, Modul-Kamera, andere Bühne (Studio), VR. Danach zurück zur gewählten Ansicht.
// Ebenen: Layer 1 = Ego-Körper (nur Hauptkamera, aktiviert hier), Layer 2 = volle Figur in der Ego-Sicht (nur Spiegelkameras),
//   Außenansicht: volle Figur auf Layer 0. Draw-Calls: Außenansicht npc.reserve(2,'self') (Figur + Schatten), sonst 0 (Ego-Beine nur beim Blick nach unten).
// Die Figuren werden von modules/npc.js aktualisiert (externals); hier nie update() rufen.
// Fremde Provider (npc, avatar) nur mit Guard und lazy.
import { Mesh, PlaneGeometry, MeshBasicMaterial, CanvasTexture } from 'three';
import { solveTpCam, smoothFrac, hideBody, signBoxes } from '../char/tpcam.js';
import { animFor } from '../net/peers-logic.js';
import { timedDuration, ONE_SHOT } from '../npc/anim.js';
import { debugHook } from './m3-debug.js';

/** Ego-Beine sichtbar, wenn der Blick unter diese Neigung geht (rad; Hysterese zum Ausblenden). */
export const LEGS_ON = -0.5;
export const LEGS_OFF = -0.4;
const DAUER = new Set(['sit']);

const setLayer = (h, n) => { if (h && h.root) h.root.traverse((o) => { o.layers.set(n); }); };

function blobTexture() {
  try {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    if (!g || typeof g.createRadialGradient !== 'function') return null;
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,0.85)');
    gr.addColorStop(0.55, 'rgba(0,0,0,0.45)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return new CanvasTexture(c);
  } catch { return null; }
}

export default {
  name: 'selfview',
  init(ctx) {
    const profile = () => (ctx.deps && ctx.deps.profile) || null;
    const readPref = () => {
      try {
        const p = profile();
        const s = p && p.get && p.get();
        return s && s.set && s.set.cam === 'third' ? 'third' : 'ego';
      } catch { return 'ego'; }
    };
    let want = readPref(); // gewählte Ansicht
    let touched = false; // Nutzer hat in dieser Sitzung gewählt (spätere Konto-Daten überschreiben dann nicht)
    let third = false; // wirksame Außenansicht
    let frame = 0;
    let rigFrame = -10;
    let tsec = 0;
    let frac = 1;
    let bodyHidden = false;
    let legs = false;
    let figFull = null;
    let figEgo = null;
    let shadow = null;
    let shadowTex = null;
    let baseLook = null;
    let previewLook = null;
    let shownLook = null;
    let avRef;
    let offAv = [];
    let reservedWas = -1;
    let override = null; // Dauer-Animation ('sit')
    let lockUntil = 0; // Einmal-/Zeit-Animationen laufen lassen
    let lastA = -1;
    let groundY = 0;
    let extraBoxes = null;
    const eyeTmp = { x: 0, y: 0, z: 0 };

    ctx.camera.layers.enable(1); // Ebene 1 = Ego-Körper (nur Hauptkamera)

    const npc = () => ctx.use('npc');
    const xrOn = () => !!(ctx.xr && ctx.xr.presenting());

    function newFigure(look) {
      const n = npc();
      if (!n || typeof n.figure !== 'function') return null;
      try { return n.figure({ look, parent: ctx.scene }); } catch { return null; }
    }

    function applyLook() {
      const l = previewLook || baseLook;
      if (!l || l === shownLook) return;
      if (!figFull) {
        figFull = newFigure(l);
        if (!figFull) return;
        setLayer(figFull, third ? 0 : 2);
      } else figFull.setLook(l);
      if (figEgo) figEgo.setLook(l);
      shownLook = l;
    }

    function ensureProviders() {
      const av = ctx.use('avatar');
      if (av !== avRef) {
        for (const off of offAv) { try { off(); } catch { /* egal */ } }
        offAv = [];
        avRef = av;
        if (av && typeof av.onChange === 'function') offAv.push(av.onChange((look) => { if (look) { baseLook = look; applyLook(); } }));
        if (av && typeof av.onPreview === 'function') offAv.push(av.onPreview((look) => { previewLook = look || null; applyLook(); }));
        baseLook = null;
      }
      if (!baseLook && av && typeof av.look === 'function') baseLook = av.look() || null;
      applyLook();
    }

    function ensureEgoBody() {
      if (figEgo || !figFull) return;
      const l = previewLook || baseLook;
      figEgo = newFigure(l);
      if (!figEgo) return;
      figEgo.setEgo(true);
      setLayer(figEgo, 1);
      figEgo.root.visible = false;
    }

    function ensureShadow() {
      if (shadow) return;
      shadowTex = blobTexture();
      const g = new PlaneGeometry(0.95, 0.95);
      g.rotateX(-Math.PI / 2);
      const m = new MeshBasicMaterial({ color: 0x000000, map: shadowTex || null, transparent: true, opacity: shadowTex ? 1 : 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      shadow = new Mesh(g, m);
      shadow.renderOrder = 1;
      shadow.visible = false;
      shadow.frustumCulled = false;
      ctx.scene.add(shadow);
    }

    function reserve(n) {
      if (n === reservedWas) return;
      const p = npc();
      if (!p || typeof p.reserve !== 'function') return;
      p.reserve(n, 'self');
      reservedWas = n;
    }

    /** Wirksame Ansicht bestimmen (Auto-Ego). */
    function forcedEgo() {
      if (xrOn()) return true;
      if (ctx.overlay && ctx.overlay.isOpen()) return true;
      if (ctx.stage && !ctx.stage.isStore()) return true;
      if (frame - rigFrame > 1) return true; // Rig lief im letzten Frame nicht = Modul-Kamera aktiv (oder noch nicht gestartet)
      return false;
    }

    function evaluate() {
      const now = want === 'third' && !!figFull && !forcedEgo();
      if (now !== third) {
        third = now;
        frac = 0; // beim Umschalten in die Außenansicht ausfahren
        bodyHidden = false;
        if (figFull) setLayer(figFull, third ? 0 : 2);
        reserve(third ? 2 : 0);
      }
      return third;
    }

    function rig(camera, dt) {
      rigFrame = frame;
      if (!third || !figFull) return false;
      const p = ctx.player.getPose();
      eyeTmp.x = p.x; eyeTmp.y = ctx.player.eyeY(); eyeTmp.z = p.z;
      const src = ctx.layout && (ctx.layout.cidx || ctx.layout.colliders);
      if (!extraBoxes && ctx.layout) extraBoxes = signBoxes(ctx.layout);
      const r = solveTpCam(src, eyeTmp, p.yaw, p.pitch, Number.isFinite(p.y) ? p.y : 0, { extra: extraBoxes || undefined });
      frac = smoothFrac(frac, r.frac, dt);
      camera.position.set(eyeTmp.x + (r.want.x - eyeTmp.x) * frac, eyeTmp.y + (r.want.y - eyeTmp.y) * frac + (r.lift || 0) * (1 - frac), eyeTmp.z + (r.want.z - eyeTmp.z) * frac);
      bodyHidden = hideBody(frac * r.len, bodyHidden);
      figFull.root.visible = !bodyHidden && !xrOn();
      return true;
    }
    ctx.player.camera.setRig(rig);

    function persist(m) {
      try {
        const p = profile();
        if (!p || typeof p.update !== 'function') return;
        const cur = p.get && p.get();
        if (cur && cur.set && cur.set.cam === m) return;
        p.update((d) => { d.set = { ...(d.set || {}), cam: m, t: Date.now() }; });
      } catch { /* egal */ }
    }

    function setMode(m) {
      if (m !== 'ego' && m !== 'third') return;
      touched = true;
      if (m === want) { persist(m); return; }
      want = m;
      persist(m);
      evaluate();
    }

    const offRemote = (() => {
      const p = profile();
      if (!p || typeof p.onRemote !== 'function') return () => {};
      try {
        return p.onRemote(() => { if (touched) return; const m = readPref(); if (m !== want) { want = m; evaluate(); } });
      } catch { return () => {}; }
    })();

    const provider = {
      mode: () => (third ? 'third' : 'ego'),
      setMode,
      toggle() {
        if (xrOn()) return;
        setMode(want === 'third' ? 'ego' : 'third');
        const msg = want === 'third' ? 'Außenansicht (V)' : 'Ich-Ansicht (V)';
        try { if (ctx.deps && typeof ctx.deps.toast === 'function') ctx.deps.toast(msg); } catch { /* egal */ }
      },
      eye(out) {
        // Ego: das Auge ist die Kamera (bitgleich zu früher, auch mit Wackeln); Außenansicht: Auge der Figur, nicht die Kamera
        if (!third) return out.copy(ctx.camera.position);
        const p = ctx.player.getPose();
        return out.set(p.x, ctx.player.eyeY(), p.z);
      },
      figure: () => figFull,
      playAnim(name) {
        if (!name || name === 'idle' || name === 'stand') {
          override = null;
          lockUntil = 0;
          for (const f of [figFull, figEgo]) if (f) f.setAnim('idle', { speed: 0, restart: true });
          return;
        }
        if (DAUER.has(name)) { override = name; lockUntil = 0; return; }
        override = null;
        lockUntil = tsec + (timedDuration(name) || ONE_SHOT[name] || 1);
        for (const f of [figFull, figEgo]) if (f) f.setAnim(name, { restart: true, then: 'idle' });
      },
    };
    const offProvider = ctx.provide('selfview', provider);

    function animate(pose) {
      const net = ctx.player.getNet ? ctx.player.getNet() : null;
      const speed = net ? Math.hypot(net.vx || 0, net.vz || 0) : 0;
      const a = net && Number.isInteger(net.a) ? net.a : 0;
      if (override && (speed > 0.8 || a === 3)) override = null; // Aufstehen beim Loslaufen/Springen
      if (lockUntil && tsec < lockUntil && speed < 1) { lastA = a; return; }
      lockUntil = 0;
      const af = override ? { name: override, speed: 0, restart: false, apply: true } : animFor(a, lastA, speed);
      lastA = a;
      if (!af.apply) return;
      for (const f of [figFull, figEgo]) if (f) f.setAnim(af.name, { speed: af.speed, restart: af.restart, then: 'idle' });
      void pose;
    }

    const offDbg = debugHook(ctx, 'selfview', {
      state: () => ({ want, third, frac, bodyHidden, legs, hasFigure: !!figFull, hasEgo: !!figEgo, reserved: reservedWas, override }),
    });

    return {
      update(dt) {
        frame++;
        tsec += Math.min(0.1, dt || 0);
        ensureProviders();
        if (!figFull) return;
        evaluate();
        reserve(third ? 2 : 0);
        const p = ctx.player.getPose();
        const xr = xrOn();
        const y = Number.isFinite(p.y) ? p.y : 0;
        if (ctx.player.isGrounded()) groundY = y;
        figFull.root.position.set(p.x, y, p.z);
        figFull.root.rotation.y = p.yaw;
        if (!third) figFull.root.visible = !xr;
        // Ego-Körper (Layer 1): nur sichtbar beim Blick nach unten, nie bei Modul-Kamera/Overlay/VR
        if (!third && !xr && !forcedEgo()) {
          if (!legs && p.pitch < LEGS_ON) legs = true;
          else if (legs && p.pitch > LEGS_OFF) legs = false;
        } else legs = false;
        if (legs) ensureEgoBody();
        if (figEgo) {
          figEgo.root.visible = legs;
          if (legs) { figEgo.root.position.set(p.x, y, p.z); figEgo.root.rotation.y = p.yaw; }
        }
        animate(p);
        // Blob-Schatten (1 Draw-Call, nur Außenansicht)
        if (third && !xr) {
          ensureShadow();
          const h = Math.max(0, y - groundY);
          const k = 1 / (1 + h * 0.8);
          shadow.position.set(p.x, groundY + 0.03, p.z);
          shadow.scale.set(k, 1, k);
          shadow.visible = true;
        } else if (shadow) shadow.visible = false;
        if (xr && figEgo) figEgo.root.visible = false;
      },
      dispose() {
        // Kein reserve(0) hier: npc ist (Modulreihenfolge) schon entsorgt, ein Aufheben würde Passanten neu erzeugen.
        for (const off of offAv) { try { off(); } catch { /* egal */ } }
        offAv = [];
        try { offRemote(); } catch { /* egal */ }
        ctx.player.camera.setRig(null);
        for (const f of [figFull, figEgo]) if (f && typeof f.dispose === 'function') f.dispose();
        figFull = null; figEgo = null;
        if (shadow) {
          if (shadow.parent) shadow.parent.remove(shadow);
          shadow.geometry.dispose();
          shadow.material.dispose();
          if (shadowTex) shadowTex.dispose();
          shadow = null;
        }
        ctx.camera.layers.disable(1);
        offDbg();
        offProvider();
      },
    };
  },
};
