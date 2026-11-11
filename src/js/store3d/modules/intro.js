// VIDEOTHEK LENZ · M4 Intro (~7 s): Kamera draußen vor dem Laden (Leuchtschild, Öffnungszeiten), Rollladen fährt hoch,
// Tür schwingt auf, Türglocke, Gleitflug hinein bis zur Startposition. Provider 'intro' { run() → Promise }.
// Überspringen: Knopf, Klick/Tippen irgendwo, Esc (läuft als ctx.overlay → Esc/Pointer-Lock-Freigabe wie bei Modulen).
// Kein Intro bei opts.skipIntro, wiederhergestelltem Zustand, direkter Titel-/Suchroute und prefers-reduced-motion.
import { EYE } from '../controls/player.js';
import { getOutdoor, addFacade } from './outdoor.js';
import { prefersReducedMotion, clamp } from './m4-util.js';

const ease = (t) => t * t * (3 - 2 * t);
const T = { fly1: 0.6, fly1Dur: 2400, shutter: 1.5, shutterDur: 2.2, door: 3.5, doorDur: 1.0, fly2: 3.9, fly2Dur: 3300 };

export default {
  name: 'intro',
  init(ctx) {
    const o = ctx.opts || {};
    if (o.skipIntro || o.restore || o.openItemId || o.openTerminal || prefersReducedMotion()) {
      ctx.provide('intro', { run: () => Promise.resolve() });
      return {};
    }
    const L = ctx.layout;
    const W = L.w;
    const D = L.d;
    const out = getOutdoor(ctx);
    const facade = addFacade(ctx, out);
    const player = ctx.player;
    const touch = ctx.isTouch;

    // Die echten Türflügel des Raums (build-room.js: 'lfx-door-left' / 'lfx-door-right') öffnen sich; keine eigene Kopie.
    const left = ctx.scene.getObjectByName('lfx-door-left');
    const right = ctx.scene.getObjectByName('lfx-door-right');
    const leafMats = [left, right].filter(Boolean).map((g) => g.getObjectByName('lfx-door-frame').material);
    out.tinted.push(...leafMats.map((mat) => ({ mat, base: [1, 1, 1] })));
    out.setPalette(out.tod, out.rain);

    let started = false;
    let done = false;
    let tl = 0;
    let idle = 0;
    let resolveRun = null;
    let step = 0;
    let belled = false;
    let pose = null;
    let overlayEl = null;
    let startedFly1 = false;
    let startedFly2 = false;
    let shutterSound = false;
    const stage = [];

    function finish() {
      if (done) return;
      done = true;
      for (const [t, ty, fn] of stage) t.removeEventListener(ty, fn, true);
      player.camera.release();
      player.freeze(false);
      const p = pose || player.getPose();
      player.teleport(p.x, p.z, p.yaw, p.pitch);
      if (left) left.rotation.y = 0;
      if (right) right.rotation.y = 0;
      facade.dispose();
      for (const mat of leafMats) { const i = out.tinted.findIndex((q) => q.mat === mat); if (i >= 0) out.tinted.splice(i, 1); mat.color.setRGB(1, 1, 1); }
      if (overlayEl && overlayEl.parentNode) ctx.overlay.close();
      const host = ctx.renderer.domElement.parentNode;
      if (host) host.classList.remove('lfx-store-intro-on');
      if (resolveRun) { const r = resolveRun; resolveRun = null; r(); }
    }

    // Hochformat: weiter zurück, damit das Schild ins Bild passt
    const back = ctx.camera.aspect < 1.2 ? 1.55 : 1;
    // Anfangsbild schon im ersten gerenderten Frame: Kamera draußen vor dem Rollladen, Spieler eingefroren.
    player.freeze(true);
    player.camera.flyTo({ x: W / 2 - 1.5, y: 1.6, z: D + 7.4 * back }, { x: W / 2, y: 3.3, z: D }, 1);

    ctx.provide('intro', {
      run() {
        if (done) return Promise.resolve();
        started = true;
        pose = { ...player.getPose() };
        overlayEl = document.createElement('div');
        overlayEl.className = 'lfx-store-intro';
        const skip = document.createElement('button');
        skip.type = 'button';
        skip.className = 'lfx-store-intro-skip' + (touch ? ' is-touch' : '');
        skip.textContent = 'Überspringen';
        overlayEl.appendChild(skip);
        overlayEl.addEventListener('pointerdown', (e) => { e.preventDefault(); finish(); });
        ctx.overlay.open(overlayEl, { onClose: finish });
        const host = ctx.renderer.domElement.parentNode;
        if (host) host.classList.add('lfx-store-intro-on');
        const key = (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(); } };
        window.addEventListener('keydown', key, true);
        stage.push([window, 'keydown', key]);
        return new Promise((res) => { resolveRun = res; });
      },
    });

    ctx.on('xr', (on) => { if (on) finish(); }); // VR: Intro sofort beenden

    if (o.debug) window.__lfxM4 = { ...window.__lfxM4, intro: () => ({ tl, started, done, step, shutter: facade.openAmount }) };

    function toFinal() {
      const cp = Math.cos(pose.pitch);
      return {
        pos: { x: pose.x, y: EYE, z: pose.z },
        target: { x: pose.x - Math.sin(pose.yaw) * cp, y: EYE + Math.sin(pose.pitch), z: pose.z - Math.cos(pose.yaw) * cp },
      };
    }

    return {
      update(dt) {
        if (done) return;
        out.follow(ctx.camera);
        if (!started) {
          idle += dt;
          facade.flicker(idle);
          if (idle > 20) finish(); // Sicherung: run() wurde nie aufgerufen
          return;
        }
        tl += dt;
        facade.flicker(tl);
        if (!startedFly1 && tl >= T.fly1) {
          startedFly1 = true;
          player.camera.flyTo({ x: W / 2 - 1.5, y: 1.6, z: D + 3.9 * (back > 1 ? 1.45 : 1) }, { x: W / 2, y: 1.7, z: D }, T.fly1Dur);
        }
        if (tl >= T.shutter) {
          if (!shutterSound) { shutterSound = true; const s = ctx.use('sound'); if (s) s.play('shutter', { dur: T.shutterDur }); }
          facade.setShutter(ease(clamp((tl - T.shutter) / T.shutterDur, 0, 1)));
        }
        if (tl >= T.door) {
          const a = ease(clamp((tl - T.door) / T.doorDur, 0, 1)) * 1.45;
          if (left) left.rotation.y = -a;
          if (right) right.rotation.y = a;
        }
        if (!startedFly2 && tl >= T.fly2) {
          startedFly2 = true;
          const f = toFinal();
          step = 1;
          player.camera.flyTo(f.pos, f.target, T.fly2Dur).then((ok) => { if (ok) finish(); });
        }
        if (step === 1 && !belled && ctx.camera.position.z < D + 0.4) {
          belled = true;
          const s = ctx.use('sound');
          if (s) s.play('doorbell');
        }
      },
      onSuspend() { finish(); },
      dispose() { finish(); if (window.__lfxM4) delete window.__lfxM4.intro; },
    };
  },
};
