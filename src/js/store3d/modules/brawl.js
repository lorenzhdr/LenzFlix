// VIDEOTHEK LENZ · Welle 2 „brawl“: Richard wehrt sich. Zustandsautomat in brawl-fsm.js (rein), Trefferkegel/Pfad/Wurf in
// brawl-logic.js, Posen in brawl-pose.js. Dieses Modul verbindet sie mit der Figur aus cashier.js (Provider 'cashier'.richard()):
// Schlag erkennen (ctx.input.onAction('hit'), prio 30), Taumeln, Schubsen, Kassetten werfen, Tresen-Sprung und Verfolgung (A*),
// Hausverbot (Tür zu, Schild, Countdown), spitze Phase (sessionStorage). Nie in VR: dort bleibt Richard friedlich.
// Provider 'brawl' { state(), isBanned(), canTalk(), hitBy(source, dir), getNetState(), applyRemote(net) }.
// Debug: ctx.opts.debug oder ?brawl=1 → window.__lfxBrawl { state, hit(), force(state), say(cat), fsm }.
import { Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, BoxGeometry, OctahedronGeometry, PlaneGeometry, DoubleSide } from 'three';
import { findPath, isFree } from '../nav/path.js';
import { makeCanvas, toTexture, FONT } from '../world/textures.js';
import { createBrawlFsm, STATES, BRAWL } from './brawl-fsm.js';
import { inCone, stepAlong, hopPoint, aimVelocity, ballisticStep } from './brawl-logic.js';
import { poseFor, NEUTRAL, ANIMS, REDNESS } from './brawl-pose.js';
import { prefersReducedMotion, angDiff } from './m4-util.js';

const GRUDGE_KEY = 'lfx.store.richardGrudge';
const RUN_SPEED = 4.0;
const WALK_SPEED = 2.6;
const HOP_SEC = 0.85;
const THROWS = 3;
const THROW_GAP = 1.4;
const WIND = 0.45;
const SAY_GAP = 3.2; // Mindestabstand zwischen Rufen
const CHASE_GIVEUP = 12; // s Verfolgung, danach Rauswurf-Rückfall (Spieler noch im Laden oder kein Pfad)
const PEN_GIVEUP = 4; // s: Spieler hinter dem Tresen (Kassenbereich ist geschlossen) -> Rückfall früher
const DRIVE_BEHIND = 0.9; // Richard läuft so weit hinter dem Spieler (auf der dem Ziel abgewandten Seite)
const EXPEL_FADE = 0.4; // s Abblenden vor dem Versetzen


function banCanvas() {
  const c = makeCanvas(256, 128);
  const x = c.getContext('2d');
  x.fillStyle = '#f7f3e4'; x.fillRect(0, 0, 256, 128);
  x.strokeStyle = '#b3261e'; x.lineWidth = 8; x.strokeRect(6, 6, 244, 116);
  x.fillStyle = '#b3261e'; x.textAlign = 'center'; x.textBaseline = 'middle';
  let px = 40;
  do { x.font = `bold ${px}px ${FONT}`; px -= 2; } while (x.measureText('HAUSVERBOT').width > 224 && px > 12);
  x.fillText('HAUSVERBOT', 128, 46);
  x.fillStyle = '#222'; x.font = `bold 20px ${FONT}`;
  x.fillText('Richard sagt: Nein.', 128, 92);
  return c;
}

export default {
  name: 'brawl',
  init(ctx) {
    const cash = ctx.use('cashier');
    const R = cash && cash.richard ? cash.richard() : null;
    if (!R) return {};
    const L = ctx.layout;
    const D = L.d;
    const doorR = (L.facade && L.facade.door) || L.door;
    const doorCx = (doorR.x0 + doorR.x1) / 2;
    const gateIn = { x: doorCx, z: D - 1.5 }; // hier steht Richard hinter der Glastür
    const counter = L.counter;
    const front = { x: R.home.x, z: counter.z0 - 0.6 }; // Tresen-Vorderseite (Kundenseite)
    const reduced = prefersReducedMotion();
    const host = ctx.renderer.domElement.parentNode;
    const offs = [];
    const fsm = createBrawlFsm();
    const xrOn = () => !!(ctx.xr && ctx.xr.presenting());
    const pose = () => ctx.player.getPose();
    const door = () => ctx.use('door');

    R.root.rotation.order = 'YXZ';
    const rest = { x: R.home.x, z: R.home.z, y: 0, yaw: 0 };
    const recoil = { x: 0, z: 0 };
    let T = 0;
    let lastSay = -Infinity;
    let task = null; // { type: 'walk', path, i, speed, onDone } | { type: 'hop', a, b, u, then }
    let anim = { name: 'idle', t: 0, dur: Infinity };
    let base = 'idle';
    const cur = { ...NEUTRAL };
    let redCur = 0;
    let controlling = false;
    let starsT = 0;
    let timers = []; // { at, fn }
    let throwsLeft = 0;
    let nextThrow = 0;
    let throwEnd = 0;
    let pathAt = -Infinity;
    let pushAt = 0;
    let idleAt = 0;
    let banSayAt = 0;
    let restoreSec = 0;
    let lockedByMe = false;
    let yawCur = 0;
    const tapes = [];
    let discoveredBan = false;
    let lockPending = false; // Hausverbot gilt, Tür sperrt erst, wenn der Spieler hinter dem Türblock steht
    let chaseSince = 0;
    let penSince = -1;
    let expelling = false; // Rückfall-Rauswurf läuft (Abblender)
    const goal = { x: doorCx, z: D + 0.9 }; // Treibeziel: vor der Tür, außen

    // --- Persistenz der spitzen Phase (nur Sitzung) ---
    const store = (() => { try { return window.sessionStorage; } catch { return null; } })();
    const saveGrudge = (sec) => { try { if (store) { if (sec > 0) store.setItem(GRUDGE_KEY, String(Date.now() + sec * 1000)); else store.removeItem(GRUDGE_KEY); } } catch { /* egal */ } };
    try { const v = store && Number(store.getItem(GRUDGE_KEY)); if (v && v > Date.now()) restoreSec = (v - Date.now()) / 1000; } catch { /* egal */ }

    // --- Anzeige: HUD-Countdown, Schild, Sterne, Kassetten ---
    const hud = document.createElement('div');
    hud.className = 'lfx-store-banhud';
    hud.hidden = true;
    hud.setAttribute('role', 'status');
    Object.assign(hud.style, { position: 'absolute', bottom: '24%', left: '50%', transform: 'translateX(-50%)', padding: '8px 16px', background: 'rgba(179,38,30,0.92)', color: '#fff', font: 'bold 15px/1.3 system-ui, sans-serif', borderRadius: '8px', pointerEvents: 'none', zIndex: '5', textAlign: 'center' });
    if (host) host.appendChild(hud);
    let hudSec = -1;

    // Bildschirm-Abblender für den Rückfall-Rauswurf (ohne Animation bei „reduzierte Bewegung“)
    const veil = document.createElement('div');
    veil.className = 'lfx-store-expelveil';
    veil.hidden = true;
    Object.assign(veil.style, { position: 'absolute', inset: '0', background: '#000', opacity: '0', pointerEvents: 'none', zIndex: '6' });
    if (!reduced) veil.style.transition = 'opacity 0.4s ease';
    if (host) host.appendChild(veil);
    const veilTo = (on) => { if (reduced) { veil.hidden = true; return; } veil.hidden = false; veil.style.opacity = on ? '1' : '0'; };

    let sign = null;
    function ensureSign() {
      if (sign) return sign;
      sign = new Mesh(new PlaneGeometry(0.9, 0.45), new MeshBasicMaterial({ map: toTexture(banCanvas(), { aniso: 2 }), side: DoubleSide }));
      sign.position.set(doorCx, 1.12, D + 0.12); // unter dem Schild GESCHLOSSEN (door.js, y 1,5 bis 1,8)
      sign.visible = false;
      ctx.scene.add(sign);
      ctx.track(sign);
      return sign;
    }

    const stars = new Group();
    stars.visible = false;
    {
      const g = new OctahedronGeometry(0.04);
      const m = new MeshBasicMaterial({ color: 0xffd93b });
      for (let i = 0; i < 3; i++) { const s = new Mesh(g, m); stars.add(s); }
      stars.position.set(0, 0.34, 0);
      R.head.add(stars);
      ctx.track(g); ctx.track(m);
    }
    const tapeGeo = ctx.track(new BoxGeometry(0.19, 0.03, 0.105));
    const tapeMat = ctx.track(new MeshLambertMaterial({ color: 0x1b1b22 }));

    // --- Hilfen ---
    const hostile = () => fsm.isHostile() || fsm.isBanned();
    const away = (p) => { const dx = p.x - R.pos.x; const dz = p.z - R.pos.z; const l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l }; };
    const playerInPen = (p) => p.x >= counter.x0 - 0.1 && p.z >= counter.z1 - 0.05 && !(p.y > 0.3);
    const inPen = () => R.pos.x >= counter.x0 - 0.1 && R.pos.z >= counter.z1 - 0.05 && R.pos.y < 0.3;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const onCounter = (q) => q.x >= counter.x0 - 0.05 && q.x <= counter.x1 + 0.05 && q.z > counter.z0 + 0.02 && q.z < counter.z1 - 0.02;
    /** Freier Landepunkt auf der Kundenseite vor dem Tresen: nie auf dem Tresen, nie im Spieler (seitlich/nach hinten versetzt). */
    function landingPoint(p) {
      const nav = ctx.layout.nav;
      const bx = clamp(R.pos.x, counter.x0 + 0.5, counter.x1 - 0.5);
      for (const dz of [0.6, 1.0, 1.4, 1.8]) {
        for (const dx of [0, 0.9, -0.9, 1.8, -1.8, 2.7, -2.7]) {
          const x = clamp(bx + dx, counter.x0 + 0.3, counter.x1 - 0.3);
          const z = counter.z0 - dz;
          if (nav && !isFree(nav, x, z)) continue;
          if (p && Math.hypot(p.x - x, p.z - z) < 1.1) continue;
          return { x, z };
        }
      }
      return { x: bx, z: counter.z0 - 1.8 };
    }
    /** Richtung (normiert) vom Spieler zur Tür: nächster Pfadpunkt des A* über layout.nav; ohne Pfad Luftlinie. */
    function driveDir(p) {
      const nav = ctx.layout.nav;
      let path = null;
      if (nav) {
        path = findPath(nav, { x: p.x, z: p.z }, goal);
        // auf dem Tresen / dahinter: der Pfad beginnt auf der Kundenseite
        if (!path && (onCounter(p) || playerInPen(p))) path = findPath(nav, { x: clamp(p.x, counter.x0, counter.x1), z: counter.z0 - 0.6 }, goal);
      }
      let w = null;
      if (path) { for (const q of path) { if (Math.hypot(q.x - p.x, q.z - p.z) > 0.6) { w = q; break; } } if (!w && path.length) w = path[path.length - 1]; }
      const ok = !!w;
      if (!w) w = goal;
      const dx = w.x - p.x; const dz = w.z - p.z; const l = Math.hypot(dx, dz) || 1;
      return { x: dx / l, z: dz / l, ok };
    }
    function play(name, dur = Infinity) { anim = { name, t: 0, dur }; }
    function later(sec, fn) { timers.push({ at: T + sec, fn }); }
    function say(cat, vars, o) {
      if (T - lastSay < SAY_GAP && !(o && o.always)) return false;
      if (R.say(cat, vars, o)) { lastSay = T; return true; }
      return false;
    }
    function lockDoor(on) {
      const d = door();
      if (!d) return;
      if (on) { d.lock(BRAWL.BAN + 2); lockedByMe = true; } else if (lockedByMe) { d.unlock(); lockedByMe = false; }
    }
    const doorBlockZ1 = (L.doorBlock ? L.doorBlock.z1 : D + 0.22) + 0.5;
    // Spieler steht draußen und frei vom Türblock (sonst schöbe ihn der Kollider zurück in den Laden)
    const playerClear = () => pose().z > doorBlockZ1;
    function applyBan() {
      lockPending = false;
      lockDoor(true);
      ensureSign().visible = true;
      if (!discoveredBan) { discoveredBan = true; found('richard-ban'); }
    }
    function found(id) { const d = ctx.use('discover'); if (d && d.found) { try { d.found(id); } catch { /* egal */ } } }

    // strict: ohne Pfad nicht in Luftlinie laufen (sonst durch den Tresen); Rückgabe false = kein Weg
    function walkTo(target, speed, onDone, strict) {
      if (inPen()) { hopTo(landingPoint(pose()), () => walkTo(target, speed, onDone, strict)); return true; }
      const nav = ctx.layout.nav;
      const path = nav ? findPath(nav, { x: R.pos.x, z: R.pos.z }, target) : null;
      if (strict && nav && !(path && path.length)) return false;
      task = { type: 'walk', path: path && path.length ? path : [{ x: target.x, z: target.z }], i: 0, speed, onDone };
      return true;
    }
    function hopTo(b, then) {
      task = { type: 'hop', a: { x: R.pos.x, z: R.pos.z }, b, u: 0, then };
      play('hop');
    }
    function goHome() {
      if (inPen() && Math.hypot(R.pos.x - R.home.x, R.pos.z - R.home.z) < 0.4) { settle(); return; }
      // Rückweg: erst zur Tresenfront, dann zurück über den Tresen (nur wenn der Spieler nicht auf dem Zielpunkt steht)
      walkTo(front, WALK_SPEED, () => {
        const q = pose();
        if (Math.hypot(q.x - R.home.x, q.z - R.home.z) < 0.9) { task = null; later(1, goHome); return; }
        hopTo({ x: R.home.x, z: R.home.z }, () => { settle(); say('backHome', {}, { always: true }); });
      });
    }
    function settle() {
      task = null; base = 'idle'; anim = { name: 'idle', t: 0, dur: Infinity };
      rest.x = R.home.x; rest.z = R.home.z; rest.y = 0; rest.yaw = 0;
    }

    // --- Zustandswechsel ---
    function onTransition(tr) {
      if (!tr) return;
      const to = tr.to;
      R.setBusy(to === 'shove' || to === 'throw' || to === 'chase' || to === 'banned');
      if (to === 'annoyed') { play('stagger', 0.8); say(tr.reason === 'objectHit' ? 'hitObject' : 'hit1', {}, { always: true }); }
      if (to === 'shove') {
        play('armsup', 0.6);
        say('hit2', {}, { always: true });
        later(0.9, () => {
          if (fsm.state !== 'shove') return;
          const q = pose();
          play('shove', 0.6);
          const d = away(q);
          if (Math.hypot(q.x - R.pos.x, q.z - R.pos.z) < 2.8) ctx.player.knock({ x: d.x, z: d.z }, 1.2);
          say('shove', {}, { always: true });
        });
      }
      if (to === 'throw') {
        play('armsup', 0.8);
        starsT = 1.6;
        say('hit3', {}, { always: true });
        throwsLeft = THROWS;
        nextThrow = T + 1.2;
        throwEnd = 0;
      }
      if (to === 'chase') {
        pathAt = -Infinity; pushAt = T + 0.8;
        chaseSince = T; penSince = -1; expelling = false;
        say('chase', {}, { always: true });
        if (inPen()) hopTo(landingPoint(pose()), () => { task = null; });
      }
      if (to === 'banned') {
        if (playerClear()) applyBan(); else lockPending = true;
        task = null;
        say('ban', {}, { always: true });
        banSayAt = T + 6;
        walkTo(gateIn, RUN_SPEED, () => { rest.x = gateIn.x; rest.z = gateIn.z; rest.yaw = Math.PI; task = null; base = 'cross'; play('cross'); });
      }
      if (to === 'grudge') {
        lockPending = false;
        lockDoor(false);
        if (sign) sign.visible = false;
        hud.hidden = true; hudSec = -1;
        saveGrudge(fsm.grudgeRemaining(T));
        idleAt = T + 40 + Math.random() * 30;
        if (tr.reason === 'banEnd') say('banEnd', {}, { always: true });
        base = 'idle';
        goHome();
      }
      if (to === 'calm') { saveGrudge(0); base = 'idle'; if (!task) goHome(); }
    }

    /** Rückfall: comic-hafter Rauswurf. Abblenden, Spieler vor die Tür setzen (Blick zur Tür), dann sofort Hausverbot. */
    function expelPlayer() {
      if (expelling || fsm.state !== 'chase') return;
      expelling = true;
      say('expel', {}, { always: true });
      play('shove', 0.6);
      veilTo(true);
      later(reduced ? 0 : EXPEL_FADE, () => {
        if (fsm.state !== 'chase') { expelling = false; veilTo(false); return; }
        ctx.player.teleport(doorCx, D + 2.2, 0, 0);
        task = null;
        expelling = false;
        onTransition(fsm.event('expelled', T));
        veilTo(false);
      });
    }

    function reactHit(dir) {
      if (dir) { recoil.x = dir.x * 0.28; recoil.z = dir.z * 0.28; }
      if (!hostile() || fsm.state === 'throw') play('stagger', 0.8);
    }

    function doHit(source, dir) {
      const res = fsm.hit(source, T);
      if (res.accepted) {
        onTransition(res.transition);
        if (source === 'object' && res.transition.to !== 'annoyed' && res.transition.to !== 'throw') say('hitObject', {}, { always: true });
        reactHit(dir);
      } else if (fsm.state !== 'banned') {
        reactHit(dir);
      }
    }

    // --- Schlag ---
    offs.push(ctx.input.onAction('hit', (ev) => {
      if (xrOn() || !ev || !ev.origin || !ev.dir) return false;
      if (fsm.state === 'banned') return false;
      const c = inCone(ev.origin, ev.dir, { x: R.pos.x, y: R.pos.y + 1.0, z: R.pos.z });
      if (!c.hit) return false;
      doHit('player', { x: ev.dir.x, z: ev.dir.z });
      return true;
    }, { prio: 30 }));

    // --- Kassetten werfen ---
    function hitPlayer(tp) {
      if (tp.hit) return;
      tp.hit = true;
      const p = pose();
      const d = tp.p ? { x: p.x - tp.p.x, z: p.z - tp.p.z } : away(p);
      ctx.player.knock({ x: d.x, z: d.z }, 0.8);
      say('throwHit', {}, { always: false });
    }
    function launchTape() {
      const p = pose();
      const eye = Number.isFinite(p.y) ? p.y + ctx.player.eyeY() : ctx.player.eyeY();
      const from = { x: R.pos.x, y: R.pos.y + 1.45, z: R.pos.z };
      const to = { x: p.x, y: eye - 0.25, z: p.z };
      const dist = Math.hypot(to.x - from.x, to.z - from.z);
      const sec = Math.min(1.1, Math.max(0.35, dist / 9));
      const vel = aimVelocity(from, to, sec);
      const mesh = new Mesh(tapeGeo, tapeMat);
      mesh.position.set(from.x, from.y, from.z);
      ctx.scene.add(mesh);
      const tp = { mesh, p: { ...from }, v: vel, age: 0, hit: false, body: null, grounded: false };
      const phys = ctx.use('physics');
      if (phys && typeof phys.spawn === 'function') {
        try {
          tp.body = phys.spawn({
            shape: 'box', size: [0.19, 0.03, 0.105], mass: 0.25, pos: { ...from }, vel: { ...vel }, spin: { x: 6, y: 3, z: 0 }, mesh,
            kind: 'tape', owner: 'richard', ttl: 6, onHit: (info) => { if (info && info.player) hitPlayer(tp); },
          });
        } catch { tp.body = null; }
      }
      tapes.push(tp);
      say('throwLine', {}, { always: true });
    }
    function updateTapes(dt) {
      for (let i = tapes.length - 1; i >= 0; i--) {
        const tp = tapes[i];
        tp.age += dt;
        if (!tp.body && !tp.grounded) {
          tp.grounded = ballisticStep(tp.p, tp.v, dt);
          tp.mesh.position.set(tp.p.x, tp.p.y, tp.p.z);
          tp.mesh.rotation.x += dt * 9; tp.mesh.rotation.y += dt * 5;
          const q = pose();
          const py = (Number.isFinite(q.y) ? q.y : 0) + ctx.player.eyeY() - 0.35;
          if (!tp.hit && Math.hypot(q.x - tp.p.x, q.z - tp.p.z, (py - tp.p.y) * 0.6) < 0.5) hitPlayer(tp);
        }
        if (tp.body && !tp.hit && tp.body.pos) {
          // stehender Spieler löst im Physik-Kontakt kein Ereignis aus: Treffer selbst prüfen
          const q = pose();
          const py = (Number.isFinite(q.y) ? q.y : 0) + ctx.player.eyeY() - 0.35;
          const bp = tp.body.pos;
          if (Math.hypot(q.x - bp.x, q.z - bp.z) < 0.75 && Math.abs(py - bp.y) < 0.9) { tp.p = { x: bp.x, y: bp.y, z: bp.z }; hitPlayer(tp); }
        }
        if (tp.age > (tp.body ? 6.5 : 4)) {
          ctx.scene.remove(tp.mesh);
          if (tp.body && typeof tp.body.remove === 'function') { try { tp.body.remove(); } catch { /* egal */ } }
          tapes.splice(i, 1);
        }
      }
    }

    // --- Provider ---
    const api = {
      state: () => fsm.state,
      isBanned: () => fsm.isBanned(),
      canTalk: () => !task && (fsm.state === 'calm' || fsm.state === 'annoyed' || fsm.state === 'grudge'),
      /** Treffer durch ein geworfenes Objekt (Paket „physics“ ruft das auf). dir = { x, z } vom Objekt weg oder null. */
      hitBy(source, dir) { if (xrOn()) return; doHit(source === 'player' ? 'player' : 'object', dir || null); },
      /** Netzformat (1.16.0): Zustand + Ort + Animation. */
      getNetState() {
        return { v: 1, f: fsm.getNetState(T), x: Math.round(R.pos.x * 100) / 100, z: Math.round(R.pos.z * 100) / 100, y: Math.round(R.pos.y * 100) / 100, yaw: Math.round(R.pos.yaw * 100) / 100, a: Math.max(0, ANIMS.indexOf(anim.name)) };
      },
      applyRemote(net) {
        if (!net || net.v !== 1 || !fsm.applyRemote(net.f, T)) return false;
        task = null; rest.x = net.x; rest.z = net.z; rest.y = net.y || 0; rest.yaw = net.yaw || 0;
        anim = { name: ANIMS[net.a] || 'idle', t: 0, dur: Infinity };
        return true;
      },
    };
    const offProvide = ctx.provide('brawl', api);

    function reset() {
      fsm.reset(T);
      task = null; timers = []; throwsLeft = 0; starsT = 0; lockPending = false; expelling = false; veil.hidden = true; veil.style.opacity = '0';
      lockDoor(false);
      if (sign) sign.visible = false;
      hud.hidden = true; hudSec = -1;
      R.setBusy(false);
      settle();
    }
    offs.push(ctx.on('xr', (on) => { if (on && fsm.state !== 'calm') reset(); }));

    if (ctx.opts.debug || (ctx.opts.devFlags && ctx.opts.devFlags.brawl)) {
      window.__lfxBrawl = {
        fsm, api,
        state: () => fsm.state,
        hit: (src) => doHit(src || 'player', null),
        force(s) {
          reset();
          const n = STATES.indexOf(s);
          if (n < 0) return false;
          fsm.applyRemote({ v: 1, s: n, h: Math.min(n, 3), r: s === 'banned' ? BRAWL.BAN : s === 'grudge' ? BRAWL.GRUDGE : 0 }, T);
          if (n > 0) onTransition({ from: 'calm', to: s, reason: 'debug' });
          return true;
        },
        say: (cat) => say(cat, {}, { always: true }),
      };
    }

    function applyPose(dt) {
      const k = 1 - Math.exp(-18 * dt);
      const tgt = poseFor(anim.name, anim.t, task && task.type === 'walk' ? task.speed / RUN_SPEED : 1);
      for (const key of Object.keys(NEUTRAL)) cur[key] += (tgt[key] - cur[key]) * k;
      R.armL.rotation.x = cur.armLx; R.armL.rotation.z = cur.armLz;
      R.armR.rotation.x = cur.armRx; R.armR.rotation.z = cur.armRz;
      R.legL.rotation.x = cur.legL; R.legR.rotation.x = cur.legR;
      R.root.rotation.x = cur.tiltX; R.root.rotation.z = cur.tiltZ;
      R.head.rotation.x = cur.headX;
    }

    function place() {
      const useRecoil = !task;
      R.place(rest.x + (useRecoil ? recoil.x : 0), rest.z + (useRecoil ? recoil.z : 0), rest.y, yawCur);
      R.root.position.y = rest.y + cur.bob;
    }

    return {
      update(dt, t) {
        T = t;
        if (xrOn()) { if (fsm.state !== 'calm') reset(); return; }
        if (restoreSec > 0) { fsm.startGrudge(T, restoreSec); idleAt = T + 30; restoreSec = 0; R.setBusy(false); }
        // Zeitablauf
        const tr = fsm.update(T);
        if (tr) onTransition(tr);
        const p = pose();
        const inside = R.inStore();
        // Sicherheit: Hausverbot, aber Spieler im Laden (Teleport u. a.) -> Tür auf
        if (fsm.state === 'banned' && lockPending && !inside && playerClear()) applyBan();
        // Spieler blieb nach dem Rauswurf im Türspalt (draußen, aber noch im Türblock): sanft weiter nach draußen schubsen, bis die Sperre greift
        if (fsm.state === 'banned' && lockPending && !inside && !playerClear() && T >= pushAt) {
          pushAt = T + 0.7;
          ctx.player.knock({ x: 0, z: 1 }, 0.8);
        }
        if (fsm.state === 'banned' && inside) { lockDoor(false); fsm.startGrudge(T); onTransition({ to: 'grudge', reason: 'safety' }); }
        // Wurfphase
        if (fsm.state === 'throw') {
          if (!inside) onTransition(fsm.event('throwDone', T));
          else if (throwsLeft > 0 && T >= nextThrow) {
            throwsLeft--; nextThrow = T + THROW_GAP;
            play('wind', WIND);
            later(WIND, () => { if (fsm.state === 'throw') { play('throw', 0.4); launchTape(); } });
            if (throwsLeft === 0) throwEnd = T + WIND + 1.0;
          } else if (throwsLeft === 0 && throwEnd && T >= throwEnd) { throwEnd = 0; onTransition(fsm.event('throwDone', T)); }
        }
        // Verfolgung: Richard treibt den Spieler per Pfad zur Tür (Schubser in Pfadrichtung); Rückfall: Rauswurf nach CHASE_GIVEUP
        if (fsm.state === 'chase') {
          if (!inside) { onTransition(fsm.event('expelled', T)); veilTo(false); }
          else if (!expelling) {
            const inP = playerInPen(p);
            if (inP) { if (penSince < 0) penSince = T; } else penSince = -1;
            if (T - chaseSince > CHASE_GIVEUP || (penSince >= 0 && T - penSince > PEN_GIVEUP)) expelPlayer();
            else if (!task || task.type !== 'hop') {
              if (inPen() || (!task && onCounter(R.pos))) hopTo(landingPoint(p), () => { task = null; });
              else if (inP) {
                // Spieler hinter dem Tresen: Richard wartet an der Kundenseite (Rückfall nach PEN_GIVEUP)
                if (Math.hypot(R.pos.x - front.x, R.pos.z - front.z) > 0.5 && T - pathAt > 0.4) { pathAt = T; walkTo({ x: front.x, z: front.z }, RUN_SPEED, null, true); }
              } else {
                const dd = driveDir(p);
                const dist = Math.hypot(p.x - R.pos.x, p.z - R.pos.z);
                const tx = p.x - dd.x * DRIVE_BEHIND; const tz = p.z - dd.z * DRIVE_BEHIND;
                if (dist > 1.9 || Math.hypot(R.pos.x - tx, R.pos.z - tz) > 0.7) {
                  if (T - pathAt > 0.35) { pathAt = T; if (!walkTo({ x: tx, z: tz }, RUN_SPEED, null, true)) walkTo({ x: p.x, z: p.z }, RUN_SPEED, null, true); }
                } else if (task) task = null;
                if (dist < 2.0 && T >= pushAt) {
                  pushAt = T + 0.7;
                  play('shove', 0.6);
                  ctx.player.knock({ x: dd.x, z: dd.z }, 1.1);
                }
              }
            }
          }
        }
        // Hausverbot: Rufe durchs Glas, Countdown
        if (fsm.state === 'banned') {
          if (T >= banSayAt && Math.hypot(p.x - R.pos.x, p.z - R.pos.z) < 16) { if (say('banGlass', {}, { always: true })) banSayAt = T + 11; else banSayAt = T + 1; }
          const sec = Math.ceil(fsm.banRemaining(T));
          if (sec !== hudSec) { hudSec = sec; hud.textContent = `HAUSVERBOT · noch ${sec} s`; hud.hidden = false; }
        }
        // Spitze Phase: gelegentlich Sticheleien
        if (fsm.state === 'grudge' && !task && T >= idleAt) {
          idleAt = T + 45 + Math.random() * 40;
          if (inside && Math.hypot(p.x - R.pos.x, p.z - R.pos.z) < 9) say('grudgeIdle', {}, { always: true });
        }
        // Timer
        if (timers.length) { const due = timers.filter((x) => T >= x.at); if (due.length) { timers = timers.filter((x) => T < x.at); due.forEach((x) => x.fn()); } }
        // Bewegung
        if (task && task.type === 'walk') {
          const s = stepAlong(rest, task.path, task.i, task.speed, dt);
          rest.x = s.x; rest.z = s.z; task.i = s.i;
          if (s.yaw !== null) rest.yaw = s.yaw;
          base = 'run';
          if (s.done) { const cb = task.onDone; task = null; base = 'idle'; if (cb) cb(); }
        } else if (task && task.type === 'hop') {
          task.u += dt / HOP_SEC;
          const hp = hopPoint(task.a, task.b, task.u, 1.45, 0);
          rest.x = hp.x; rest.z = hp.z; rest.y = Math.max(0, hp.y); rest.yaw = Math.atan2(-(task.b.x - task.a.x), -(task.b.z - task.a.z));
          if (task.u >= 1) { rest.y = 0; const cb = task.then; task = null; base = 'idle'; anim = { name: 'idle', t: 0, dur: Infinity }; if (cb) cb(); }
        } else if (fsm.state !== 'banned' || base !== 'cross') {
          // Stehend: dem Spieler zugewandt
          if (Math.hypot(p.x - R.pos.x, p.z - R.pos.z) < 9 && fsm.state !== 'banned') rest.yaw = Math.atan2(-(p.x - R.pos.x), -(p.z - R.pos.z));
        }
        // Rückstoß klingt ab
        const rk = Math.exp(-3.5 * dt);
        recoil.x *= rk; recoil.z *= rk;
        if (Math.abs(recoil.x) + Math.abs(recoil.z) < 0.004) { recoil.x = 0; recoil.z = 0; }
        // Animation
        anim.t += dt;
        if (anim.t >= anim.dur) {
          const b = task && task.type === 'walk' ? 'run' : (hostile() && fsm.state === 'throw' ? 'armsup' : base);
          anim = { name: b, t: 0, dur: Infinity };
        } else if (anim.dur === Infinity && task && task.type === 'walk' && anim.name !== 'run') anim = { name: 'run', t: 0, dur: Infinity };
        else if (anim.dur === Infinity && !task && anim.name === 'run') anim = { name: base === 'run' ? 'idle' : base, t: 0, dur: Infinity };
        // Rötung
        const rt = REDNESS[fsm.state] || 0;
        redCur += (rt - redCur) * Math.min(1, dt * (rt > redCur ? 3 : 0.4));
        R.head.material.color.setRGB(1, 1 - 0.55 * redCur, 1 - 0.6 * redCur);
        // Sterne
        if (starsT > 0) {
          starsT -= dt;
          stars.visible = starsT > 0 && !reduced;
          stars.children.forEach((s, i) => { const a = T * 6 + i * 2.094; s.position.set(Math.cos(a) * 0.16, Math.sin(T * 9 + i) * 0.02, Math.sin(a) * 0.16); });
        } else if (stars.visible) stars.visible = false;
        // Steuerung an/aus
        const need = hostile() || !!task || anim.name !== 'idle' || redCur > 0.02 || starsT > 0 || recoil.x !== 0 || recoil.z !== 0 || fsm.state === 'annoyed';
        if (need !== controlling) { controlling = need; R.control(need); if (!need) { R.place(R.home.x, R.home.z, 0, 0); } }
        if (controlling) {
          const dy = angDiff(yawCur, rest.yaw);
          yawCur += dy * Math.min(1, dt * 12);
          applyPose(dt);
          place();
        }
        updateTapes(dt);
        void inside;
      },
      onSuspend() { /* Zustand bleibt; Zeit läuft über update(t) weiter */ },
      dispose() {
        offs.forEach((o) => o());
        offProvide();
        lockDoor(false);
        for (const tp of tapes) { ctx.scene.remove(tp.mesh); if (tp.body && typeof tp.body.remove === 'function') { try { tp.body.remove(); } catch { /* egal */ } } }
        tapes.length = 0;
        if (sign) ctx.scene.remove(sign);
        R.head.remove(stars);
        hud.remove();
        veil.remove();
        R.head.material.color.setRGB(1, 1, 1);
        R.root.rotation.order = 'XYZ';
        R.setBusy(false);
        R.control(false);
        R.place(R.home.x, R.home.z, 0, 0);
        if (window.__lfxBrawl) delete window.__lfxBrawl;
      },
    };
  },
};
