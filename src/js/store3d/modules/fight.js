// VIDEOTHEK LENZ · Modul `fight` (1.18.0, Welle 6): Waffenwahl, Angriff, Laser, Energie, K.O., Schutz, PvP-Empfang.
// Provider 'fight' (Vertrag .tmp/v118/contracts.md §4, erweitert):
//   weapon() → 'hand'|'belt'|'whip'|'laser' · setWeapon(id) → bool · cycle(dir ±1) · wheel(open) → bool (R halten: false = markiertes Segment wählen)
//   energy() → 0..100 · protected() → bool · onKO(fn) → off · koSeat(o?) (Aufwachen sitzend, Bank benchN)
//   hitPlayer({ dmg, knock:{x,z}, src:'npc'|'gang'|'pvp'|'richard', from }) → bool (false bei Schutz/VR/Menü/K.O.)
//   blindPlayer(ms) → bool (Schleier, höchstens alle 4 s; false bei Schutz) · blind(ms) (Alias)
//   laserState() → { on, point:{x,y,z}|null } · onLaser(fn(state)) → off
//   Eingabe-Nähte (store.js): swingOk() · swung(ev) · laser(on) → bool · auxDown() · auxUp() · heldWeapon() → 'belt'|'whip'|'laser'|null
//   poseCode() → Posen-Code 7|9|10|13|15|11|12 oder null (Wert für net.js samplePose, siehe Report) · sitting() → K.O.-Bank
// Netz (lazy, `fight` steht vor `net` in der Registry): ctx.use('net').fight = { has, send, on, leader, isLeader, peerPos } (Vertrag Coder C).
//   Gesendet (lokale Einheiten, net/fight.js kodiert): wp (Waffe), fh {c, w, dir:{x,z} WELT-Richtung}, lz {on, point:{x,y,z} Meter}, lb {c}. Empfangen: fh/lb mit {c = Sender, w, dir:{x,z} WELT-Richtung, src}.
// Schutz (beide Richtungen): Saal läuft, Kinder-Ecke, Couch, Friseurstuhl/Umkleide, offenes Menü (3 s Sperre, 2 s Nachlauf), 10 s nach dem K.O., VR.
// Geschützt heißt auch als Angreifer: in Schutzzonen liefert swingOk() false (kein Schlag, auch nicht auf Passanten/Objekte; Laser: canLaser),
// und der PvP-Schlag (onAction 'hit') sendet bei protReason() (Zone, K.O.-Schutz, Menü) kein fh.
// VR: Modul inaktiv (keine Waffen, keine Angriffe). Draw-Calls: bei `low` 0 (Laserpunkt als DOM-Punkt, kein Strahl); ab `mid` Punkt +1 (Strahl nur in der Außenansicht +1).
// Dev (ctx.opts.dev, Harness-Parameter): weapon=hand|belt|whip|laser (Startwaffe), hp=0..100 (Startenergie), ko=1 (K.O. nach 2 s), blind=1 (Schleier nach 2 s), safe=kids|hall (Start in der Schutzzone).
import { Mesh, SphereGeometry, BoxGeometry, MeshBasicMaterial, Vector3, AdditiveBlending } from 'three';
import { createEnergy } from '../fight/energy.js';
import { isSafe } from '../fight/safezones.js';
import { weaponInfo, selectTargets, WEAPON_IDS } from '../fight/weapons.js';
import { castRay } from '../fight/ray.js';
import { rayHitsHead, createLaserDwell, stepLaser, LASER_RANGE, BLIND_MS, BRAKE_DECEL, HONK_S } from '../npc/laser-logic.js';
import { createEnergyHud, SHIELD_MS, KO_HOLD_MS } from '../ui/energy.js';
import { createWeaponWheel, cycleWeapon } from '../ui/weaponwheel.js';
import { createBlindVeil } from '../ui/blindveil.js';
import { debugHook } from './m3-debug.js';

const warn = (what, err) => { try { console.warn('[LenzFlix Store3D] fight', what, err && err.message ? err.message : ''); } catch { /* egal */ } };

export const LASER_TICK = 0.1; // s: Strahl-Takt
export const AUX_TAP = 0.22; // s: Waffenknopf (Touch) kürzer gehalten = Waffenrad, länger mit Laser = leuchten
export const LZ_GAP = 0.25; // s: Laserpunkt an Mitspieler höchstens 4/s
export const PEER_HIT_DIST = 4.5; // m: Toleranz für eingehende Treffer (Server 3,6 m, Figuren laufen 250 ms hinterher)
export const WP_DEBOUNCE = 0.3;
const SIT_Y = 0.48; // Bankhöhe (benchN, y1)
const NAME = { hand: 'Hand', belt: 'Gürtel', whip: 'Peitsche', laser: 'Laserpointer' };
const POSE = { sit: 7, ko: 9, cover: 10, whip: 11, belt: 12, aim: 13, away: 15 };

export default {
  name: 'fight',
  init(ctx) {
    const flags = (ctx.opts && ctx.opts.devFlags) || {};
    const host = (ctx.renderer && ctx.renderer.domElement && ctx.renderer.domElement.parentNode) || null;
    const L = ctx.layout || {};
    const offs = [];
    const koFns = new Set();
    const laserFns = new Set();
    const xrOn = () => !!(ctx.xr && ctx.xr.presenting && ctx.xr.presenting());
    const sound = (n) => { try { const s = ctx.use('sound'); if (s && s.play) s.play(n); } catch { /* egal */ } };
    const found = (id) => { try { const d = ctx.use('discover'); if (d && d.found) d.found(id); } catch { /* egal */ } };

    let T = 0; // s, aus update(dt)
    let weapon = 'hand';
    let nextSwing = 0;
    let swingPose = null; // 'whip'|'belt' bis swingPoseUntil
    let swingPoseUntil = 0;
    let koing = false;
    let seatedKO = false;
    let koSeq = 0;
    let menuNow = false;
    let coverUntil = 0;
    let hudVal = 100; // zuletzt an die Anzeige gemeldeter Wert (kein DOM-Schreiben pro Frame)
    let auxHeld = false;
    let auxStart = 0;
    let auxLaser = false;
    let wpSent = null;
    let wpDue = -1;
    let disposed = false;

    // Dev-Parameter (Harness, build/store-dev.js → ctx.opts.dev); ohne Wert nichts davon aktiv
    const dev = (ctx.opts && ctx.opts.dev) || {};
    if (WEAPON_IDS.includes(dev.weapon) && !xrOn()) weapon = dev.weapon;
    const devHp = Number(dev.hp);
    const devTodo = {
      safe: dev.safe === 'kids' || dev.safe === 'hall' ? { at: 0.4, v: dev.safe } : null,
      hp: dev.hp !== undefined && dev.hp !== '' && Number.isFinite(devHp) && devHp < 100 ? { at: 0.8, v: Math.max(0, devHp) } : null,
      ko: dev.ko === '1' ? { at: 2 } : null,
      blind: dev.blind === '1' ? { at: 2 } : null,
    };
    const energy = createEnergy();
    const hud = createEnergyHud(host, { touch: !!ctx.isTouch });
    const veil = createBlindVeil(host);
    const wheel = createWeaponWheel(host, {
      ctx,
      touch: !!ctx.isTouch,
      onPick: (id) => { setWeapon(id); return true; },
    });

    // ------------------------------------------------------------ Schutz
    function zoneState() {
      const s = { xr: xrOn() };
      try {
        const c2 = ctx.use('cinema2d');
        s.cinemaPlaying = !!(c2 && c2.active === true && (c2.phase === 'playing' || c2.phase === 'paused' || c2.phase === 'starting'));
      } catch { /* egal */ }
      try {
        const z = L.zones && L.zones.kids;
        const p = ctx.player.getPose();
        const r = z && z.rect;
        s.inKids = !!(r && p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1 && (r.y1 === undefined || (p.y || 0) <= r.y1));
      } catch { /* egal */ }
      try { const c = ctx.use('couch'); s.couchSeated = !!(c && c.seated && c.seated()); } catch { /* egal */ }
      try { const sa = ctx.use('salon'); s.salonBusy = !!(sa && ((sa.busy && sa.busy()) || (sa.sitting && sa.sitting()))); } catch { /* egal */ }
      return s;
    }
    /** Grund des Schutzes oder null (Zonen, VR, Energie-Schutz inkl. Menü-Regel). */
    function protReason() {
      const z = isSafe(zoneState());
      if (z) return z;
      if (energy.isKO()) return 'ko';
      if (energy.protected(T)) return 'energy';
      return null;
    }

    // ------------------------------------------------------------ Netz (lazy)
    let netRef;
    let netOffs = [];
    const netFight = () => { const n = ctx.use('net'); return (n && n.fight) || null; };
    const netOn = () => { const f = netFight(); return !!(f && typeof f.has === 'function' && f.has()); };
    function ensureNet() {
      const f = netFight();
      if (f === netRef) return;
      for (const off of netOffs) { try { off(); } catch { /* egal */ } }
      netOffs = [];
      netRef = f;
      wpSent = null;
      if (f && typeof f.on === 'function') {
        for (const [t, fn] of [['fh', onFh], ['lb', onLb]]) { try { netOffs.push(f.on(t, fn)); } catch (err) { warn('on ' + t, err); } }
      }
    }
    const peerPos = (c) => { const f = netFight(); try { return f && f.peerPos ? f.peerPos(c) : null; } catch { return null; } };
    const netSend = (type, payload) => { const f = netFight(); try { return !!(f && f.has && f.has() && f.send(type, payload)); } catch { return false; } };
    function peerList() {
      const n = ctx.use('net');
      try { return n && n.peers ? n.peers().map((p) => p.c).filter((c) => c != null) : []; } catch { return []; }
    }

    // ------------------------------------------------------------ Treffer am Spieler
    function strengthOf(dmg) { return Math.max(0.3, Math.min(1, dmg / 26)); }

    function hitPlayer(o) {
      if (disposed || !o || xrOn() || flags.fight === false) return false;
      if (protReason()) return false;
      const dmg = Number(o.dmg);
      if (!(dmg > 0)) return false;
      const r = energy.hit(dmg, T);
      if (r.ignored) return false;
      const k = strengthOf(dmg);
      const kn = o.knock || {};
      try { ctx.player.knock({ x: Number(kn.x) || 0, z: Number(kn.z) || 0 }, Math.max(0.5, Math.min(2.2, Number(o.kmul) || 0.8 + k * 0.8))); } catch { /* egal */ }
      hudVal = r.energy;
      hud.set(r.energy);
      hud.hit(k);
      sound('ouch');
      if (r.ko) startKO();
      return true;
    }

    function blindPlayer(ms) {
      if (disposed || xrOn() || flags.fight === false) return false;
      if (protReason()) return false;
      if (!veil.start(ms > 0 ? ms : undefined)) return false;
      coverUntil = T + (ms > 0 ? ms : 2500) / 1000;
      if (laserOn) setLaser(false);
      return true;
    }

    function onFh(m) {
      if (!m || xrOn()) return;
      const info = weaponInfo(WEAPON_IDS[m.w | 0]);
      if (!(info.dmg > 0)) return;
      let dx; let dz;
      if (Array.isArray(m.d)) { dx = Number(m.d[0]); dz = Number(m.d[1]); } else if (m.dir) { dx = Number(m.dir.x); dz = Number(m.dir.z); }
      if (!Number.isFinite(dx) || !Number.isFinite(dz) || (!dx && !dz)) return;
      // Bandentreffer (src 1): m.c ist der Führer, der Schlag kommt von einem Bandenmitglied; der Server prüft schon gegen deren letzte
      // gemeldete Positionen (<= 3,6 m), eine Distanzprüfung gegen die Führer-Pose würde sie verwerfen.
      const sp = m.src ? null : peerPos(m.c);
      if (sp) {
        const p = ctx.player.getPose();
        if (Math.hypot(sp.x - p.x, sp.z - p.z) > PEER_HIT_DIST) return;
      }
      hitPlayer({ dmg: info.dmg, knock: { x: dx, z: dz }, kmul: 0.6 + info.knock * 0.5, src: m.src ? 'gang' : 'pvp', from: m.c });
    }
    function onLb(m) {
      if (!m || xrOn()) return;
      const sp = peerPos(m.c);
      if (sp) {
        const p = ctx.player.getPose();
        if (Math.hypot(sp.x - p.x, sp.z - p.z) > LASER_RANGE + 1) return;
      }
      blindPlayer(BLIND_MS + 500);
    }

    // ------------------------------------------------------------ K.O.
    function benchSpot() {
      const fx = L.city && Array.isArray(L.city.fixtures) ? L.city.fixtures.find((f) => f && f.id === 'benchN') : null;
      return fx ? { x: (fx.x0 + fx.x1) / 2, z: (fx.z0 + fx.z1) / 2, y: fx.y1 !== undefined ? fx.y1 : SIT_Y } : null;
    }
    function seat(o) {
      const sp = benchSpot();
      const x = o && Number.isFinite(o.x) ? o.x : sp ? sp.x : null;
      const z = o && Number.isFinite(o.z) ? o.z : sp ? sp.z : null;
      if (x == null || z == null) return false;
      const y = o && Number.isFinite(o.y) ? o.y : sp ? sp.y : SIT_Y;
      try { ctx.player.teleport(x, z, o && Number.isFinite(o.yaw) ? o.yaw : 0, 0, y); } catch (err) { warn('teleport', err); return false; }
      seatedKO = true;
      try { const sv = ctx.use('selfview'); if (sv && sv.playAnim) sv.playAnim('sit'); } catch { /* egal */ }
      return true;
    }
    function startKO() {
      if (koing) return;
      koing = true;
      seatedKO = false;
      const my = ++koSeq;
      if (laserOn) setLaser(false);
      if (wheel.isOpen()) wheel.close();
      veil.stop();
      coverUntil = 0;
      try { ctx.player.freeze(true); } catch { /* egal */ }
      sound('ko');
      for (const fn of [...koFns]) { try { fn(); } catch (err) { warn('onKO', err); } }
      const ok = hud.knockout({
        hold: KO_HOLD_MS,
        onBlack: () => {
          if (my !== koSeq || disposed) return;
          try { ctx.items.drop(); } catch { /* egal */ }
          seat();
          energy.wake(T);
          hudVal = 100;
          hud.set(100);
          hud.shield(SHIELD_MS);
          try { const c = ctx.use('cashier'); if (c && c.event) c.event('playerKO'); } catch { /* egal */ }
          found('knockout');
        },
        onDone: () => { if (my === koSeq) finishKO(); },
      });
      if (!ok) { // Schwarzblende läuft schon: ohne sie sofort aufwachen
        energy.wake(T);
        seat();
        finishKO();
      }
    }
    function finishKO() {
      koing = false;
      try { ctx.player.freeze(false); } catch { /* egal */ }
    }

    function runDev() {
      for (const k of Object.keys(devTodo)) {
        const d = devTodo[k];
        if (!d || T < d.at) continue;
        devTodo[k] = null;
        try {
          if (k === 'safe') {
            const z = L.zones && (d.v === 'kids' ? L.zones.kids : L.zones.palastHall);
            const r = z && z.rect;
            if (z) {
              const x = d.v === 'kids' && Number.isFinite(z.x) ? z.x : r ? (r.x0 + r.x1) / 2 : z.x;
              const zz = d.v === 'kids' && Number.isFinite(z.z) ? z.z : r ? (r.z0 + r.z1) / 2 : z.z;
              ctx.player.teleport(x, zz, Number.isFinite(z.yaw) ? z.yaw : 0, 0, r && r.y0 ? r.y0 : 0);
            }
          } else if (k === 'hp') {
            const r = energy.hit(100 - d.v, T);
            hudVal = r.energy;
            hud.set(r.energy);
            if (r.ko) startKO();
          } else if (k === 'ko') {
            const r = energy.hit(1000, T);
            hudVal = r.energy;
            hud.set(r.energy);
            startKO();
          } else if (k === 'blind') blindPlayer(2500);
        } catch (err) { warn('dev ' + k, err); }
      }
    }

    // ------------------------------------------------------------ Waffe
    function setWeapon(id) {
      if (!WEAPON_IDS.includes(id) || xrOn() || disposed) return false;
      if (id === weapon) return true;
      if (laserOn) setLaser(false);
      weapon = id;
      wpDue = T + WP_DEBOUNCE;
      try { if (ctx.deps && typeof ctx.deps.toast === 'function') ctx.deps.toast('Waffe: ' + NAME[id]); } catch { /* egal */ }
      return true;
    }

    // ------------------------------------------------------------ Laser
    let laserOn = false;
    let laserAcc = 0;
    let lzAt = -9;
    let lzOnSent = false;
    let point = null;
    const dwell = new Map();
    const tmpO = new Vector3();
    const tmpD = new Vector3();
    const tmpH = new Vector3();
    let dot = null;
    let beam = null;
    let dot2d = null; // DOM-Punkt (bei `low`: 0 Draw-Calls)
    const tmpP = new Vector3();
    const stateOut = () => ({ on: laserOn, point: laserOn && point ? { ...point } : null });
    const emitLaser = () => { const s = stateOut(); for (const fn of [...laserFns]) { try { fn(s); } catch (err) { warn('onLaser', err); } } };

    function ensureGfx() {
      if (dot) return;
      dot = new Mesh(new SphereGeometry(0.05, 8, 6), new MeshBasicMaterial({ color: 0xff2a2a, fog: false }));
      dot.visible = false;
      dot.frustumCulled = false;
      dot.name = 'lfx-laser-dot';
      ctx.scene.add(dot);
    }
    function ensureBeam() {
      if (beam) return;
      beam = new Mesh(new BoxGeometry(0.04, 0.04, 1), new MeshBasicMaterial({ color: 0xff2a1c, transparent: true, opacity: 0.85, fog: false, depthWrite: false, blending: AdditiveBlending }));
      beam.visible = false;
      beam.frustumCulled = false;
      beam.name = 'lfx-laser-beam';
      ctx.scene.add(beam);
    }
    function ensureDot2d() {
      if (dot2d || !host) return;
      dot2d = document.createElement('div');
      dot2d.className = 'lfx-store-fight-dot';
      dot2d.setAttribute('aria-hidden', 'true');
      dot2d.hidden = true;
      host.appendChild(dot2d);
    }
    function hideGfx() { if (dot) dot.visible = false; if (beam) beam.visible = false; if (dot2d) dot2d.hidden = true; }
    /** DOM-Punkt (nur `low`) pro Bild an die Bildschirmstelle des Treffpunkts. */
    function placeDot2d() {
      if (!dot2d || !point || !ctx.camera) return;
      const cv = ctx.renderer && ctx.renderer.domElement;
      if (!cv) return;
      tmpP.set(point.x, point.y, point.z).project(ctx.camera);
      if (!(tmpP.z < 1) || Math.abs(tmpP.x) > 1.05 || Math.abs(tmpP.y) > 1.05) { dot2d.hidden = true; return; }
      dot2d.hidden = false;
      const x = cv.offsetLeft + (tmpP.x * 0.5 + 0.5) * cv.clientWidth;
      const y = cv.offsetTop + (-tmpP.y * 0.5 + 0.5) * cv.clientHeight;
      dot2d.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) translate(-50%,-50%)';
    }

    function canLaser() {
      return !disposed && !xrOn() && !koing && !energy.isKO() && weapon === 'laser' && flags.fight !== false && ctx.playing() && !isSafe(zoneState());
    }
    function setLaser(on) {
      on = !!on;
      if (on === laserOn) return on;
      if (on && !canLaser()) return false;
      laserOn = on;
      laserAcc = LASER_TICK; // sofort der erste Strahl
      try { const s = ctx.use('sound'); if (s && s.laser) s.laser(on); } catch { /* egal */ }
      if (!on) {
        dwell.clear();
        point = null;
        hideGfx();
        const a = animalsProv();
        try { if (a && a.laser) a.laser(null); } catch { /* egal */ }
        if (lzOnSent) { netSend('lz', { on: 0 }); lzOnSent = false; }
        try { const sv = ctx.use('selfview'); if (sv && sv.playAnim && aimPlayed) sv.playAnim(null); } catch { /* egal */ }
        aimPlayed = false;
      } else {
        try { const sv = ctx.use('selfview'); if (sv && sv.playAnim) { sv.playAnim('aim'); aimPlayed = true; } } catch { /* egal */ }
      }
      emitLaser();
      return on;
    }
    let aimPlayed = false;
    const animalsProv = () => ctx.use('animals') || ctx.use('npc');

    function aimRay(o, d) {
      ctx.camera.getWorldDirection(d);
      o.copy(ctx.camera.position);
      let sv = null;
      try { sv = ctx.use('selfview'); } catch { /* egal */ }
      if (sv && sv.mode && sv.mode() === 'third') {
        const e = sv.eye(tmpH);
        const t = Math.max(0, (e.x - o.x) * d.x + (e.y - o.y) * d.y + (e.z - o.z) * d.z);
        o.addScaledVector(d, t);
      }
    }

    function laserTick() {
      aimRay(tmpO, tmpD);
      const o = { x: tmpO.x, y: tmpO.y, z: tmpO.z };
      const d = { x: tmpD.x, y: tmpD.y, z: tmpD.z };
      const hit = castRay(o, d, L.colliders, LASER_RANGE);
      point = hit.point;
      const dir = hit.dir;
      const seen = new Set();
      const step = (key, kind, onTarget, pt) => {
        let st = dwell.get(key);
        if (!st) { st = createLaserDwell(); dwell.set(key, st); }
        seen.add(key);
        return stepLaser(st, LASER_TICK, kind, onTarget, pt);
      };
      // Personen und Richard (Kopfkugel)
      const n = ctx.use('npc');
      let people = [];
      try { people = n && n.people ? n.people() : []; } catch { /* egal */ }
      for (const p of people) {
        if (!p || !p.handle || p.kind === 'peer' || typeof p.handle.headWorld !== 'function') continue;
        if (p.handle.root && p.handle.root.visible === false) continue;
        const hw = p.handle.headWorld(tmpH);
        const on = rayHitsHead(o, d, hw, 0.17, hit.t);
        for (const ev of step(p.handle, 'person', on, null)) {
          if (ev.type === 'blind') { try { if (n && n.laserHit) n.laserHit(p.handle); } catch (err) { warn('npc.laserHit', err); } }
        }
      }
      try {
        const c = ctx.use('cashier');
        const r = c && c.richard ? c.richard() : null;
        if (r && r.pos && r.inStore !== false) {
          const on = rayHitsHead(o, d, { x: r.pos.x, y: (r.pos.y || 0) + 1.65, z: r.pos.z }, 0.2, hit.t);
          for (const ev of step('richard', 'richard', on, null)) {
            if (ev.type === 'hit') { const br = ctx.use('brawl'); if (br && br.hitBy) br.hitBy('laser', { x: dir.x, z: dir.z }); }
          }
        }
      } catch (err) { warn('richard', err); }
      // Fahrer: Fahrerkabine entlang des Strahls
      try {
        const tr = ctx.use('traffic');
        if (tr && tr.laserHit) {
          let ref = null;
          for (let t = 1; t <= hit.t && !ref; t += 0.75) ref = tr.laserHit({ x: o.x + dir.x * t, y: o.y + dir.y * t, z: o.z + dir.z * t });
          const key = ref ? 'car:' + ref.id : 'car:-';
          for (const ev of step(key, 'driver', !!ref, null)) {
            if (ev.type === 'brake' && tr.blindDriver) tr.blindDriver(ref, { decel: BRAKE_DECEL, stand: ev.honk || HONK_S });
          }
        }
      } catch (err) { warn('traffic', err); }
      // Katze und Tauben: Besitzer setzt es um (Punkt am Boden/Wand)
      try { const a = animalsProv(); if (a && a.laser) a.laser({ x: point.x, y: point.y, z: point.z }); } catch (err) { warn('animals.laser', err); }
      // Mitspieler: Kopf aus peerPos
      if (netOn()) {
        for (const c of peerList()) {
          const pp = peerPos(c);
          if (!pp) continue;
          const on = rayHitsHead(o, d, { x: pp.x, y: (pp.y || 0) + 1.55, z: pp.z }, 0.2, hit.t);
          for (const ev of step('peer:' + c, 'person', on, null)) if (ev.type === 'blind') netSend('lb', { c });
        }
      }
      for (const k of [...dwell.keys()]) if (!seen.has(k)) dwell.delete(k);
      // Anzeige: bei `low` nur ein DOM-Punkt (kein Draw-Call), sonst Kugel (wächst mit der Entfernung) und in der Außenansicht ein Strahl
      let third = false;
      try { const sv = ctx.use('selfview'); third = !!(sv && sv.mode && sv.mode() === 'third'); } catch { /* egal */ }
      if (ctx.quality() === 'low') {
        if (dot) dot.visible = false;
        if (beam) beam.visible = false;
        ensureDot2d();
        placeDot2d();
      } else {
        if (dot2d) dot2d.hidden = true;
        ensureGfx();
        dot.position.set(point.x - dir.x * 0.03, point.y - dir.y * 0.03, point.z - dir.z * 0.03);
        dot.scale.setScalar(Math.min(4, Math.max(1, hit.t * 0.22)));
        dot.visible = true;
        if (third) {
          ensureBeam();
          // Strahl startet an der Hand der Figur (rechts unterhalb der Augen), nicht im Auge: sonst läuft er in der Außenansicht exakt auf der Blickachse und verschwindet
          const sx = o.x - d.z * 0.25 + d.x * 0.3;
          const sy = o.y - 0.4;
          const sz = o.z + d.x * 0.25 + d.z * 0.3;
          const len = Math.max(0.05, Math.hypot(point.x - sx, point.y - sy, point.z - sz));
          beam.position.set((sx + point.x) / 2, (sy + point.y) / 2, (sz + point.z) / 2);
          beam.scale.set(1, 1, len);
          beam.lookAt(point.x, point.y, point.z);
          beam.visible = true;
        } else if (beam) beam.visible = false;
      }
      // Punkt an Mitspieler (nur bei Änderung, höchstens 4/s)
      if (netOn() && T - lzAt >= LZ_GAP) {
        lzAt = T;
        if (netSend('lz', { on: 1, point: { x: point.x, y: point.y, z: point.z } })) lzOnSent = true;
      }
      emitLaser();
    }

    // ------------------------------------------------------------ Angriff
    function swingOk() {
      // Schutzzonen gelten in beide Richtungen: dort kein Schlag (wie canLaser), auch nicht auf Passanten/Objekte
      return !disposed && !xrOn() && !koing && !energy.isKO() && T >= nextSwing && flags.fight !== false && !isSafe(zoneState());
    }
    function swung(ev) {
      const info = weaponInfo(ev && ev.weapon ? ev.weapon : weapon);
      nextSwing = T + info.cooldown;
      sound(info.sfx);
      if (info.id === 'whip' || info.id === 'belt') {
        swingPose = info.id;
        swingPoseUntil = T + 0.5;
        try { const sv = ctx.use('selfview'); if (sv && sv.playAnim) sv.playAnim(info.id); } catch { /* egal */ }
      }
    }

    // PvP: Treffer auf Mitspieler (prio 25: nach Richard 30, vor Personen 20); ohne Fähigkeit `fight` bleibt der alte Stoß (pu) der Personen-Logik
    offs.push(ctx.input.onAction('hit', (ev) => {
      if (disposed || xrOn() || !ev || !ev.origin || !ev.dir || !netOn() || weapon === 'laser') return false;
      if (protReason()) return false; // Angreifer geschützt (Zone, K.O.-Schutz, Menü): kein fh an Mitspieler
      const info = weaponInfo(ev.weapon || weapon);
      if (!(info.max > 0)) return false;
      const cands = [];
      for (const c of peerList()) { const pp = peerPos(c); if (pp) cands.push({ x: pp.x, y: pp.y || 0, z: pp.z, c }); }
      if (!cands.length) return false;
      const y = ctx.player.getY();
      const pool = cands.filter((q) => Math.abs(q.y - y) < 1.2);
      const o = ctx.player.getPose();
      const dirs = { x: ev.dir.x, z: ev.dir.z };
      const sel = selectTargets({ x: o.x, z: o.z }, dirs, pool, info);
      if (!sel.length) return false;
      const l = Math.hypot(dirs.x, dirs.z) || 1;
      const wi = WEAPON_IDS.indexOf(info.id);
      for (const s of sel) netSend('fh', { c: s.cand.c, w: wi, dir: { x: dirs.x / l, z: dirs.z / l }, src: 0 });
      return true;
    }, { prio: 25 }));

    // ------------------------------------------------------------ Eingabe (Nähte aus store.js)
    function wheelCtl(open) {
      if (open) {
        if (disposed || xrOn() || koing || !ctx.playing()) return false;
        return wheel.open(weapon);
      }
      if (!wheel.isOpen()) return false;
      wheel.commit();
      return true;
    }

    // ------------------------------------------------------------ Provider
    const provider = {
      weapon: () => weapon,
      setWeapon,
      cycle(dir) { return setWeapon(cycleWeapon(weapon, dir)); },
      wheel: wheelCtl,
      energy: () => energy.value(T),
      protected: () => !!protReason(),
      onKO(fn) { if (typeof fn !== 'function') return () => {}; koFns.add(fn); return () => koFns.delete(fn); },
      koSeat: (o) => seat(o),
      hitPlayer,
      blindPlayer,
      blind: blindPlayer,
      laserState: stateOut,
      onLaser(fn) { if (typeof fn !== 'function') return () => {}; laserFns.add(fn); return () => laserFns.delete(fn); },
      swingOk,
      swung,
      laser: (on) => setLaser(on),
      auxDown() { auxHeld = true; auxStart = T; auxLaser = false; },
      auxUp() {
        const held = auxHeld;
        auxHeld = false;
        if (!held) return;
        if (auxLaser) { auxLaser = false; setLaser(false); return; }
        wheelCtl(true);
      },
      heldWeapon: () => (!xrOn() && !koing && (weapon === 'belt' || weapon === 'whip' || weapon === 'laser') ? weapon : null),
      sitting: () => seatedKO,
      poseCode() {
        if (disposed || xrOn()) return null;
        if (energy.isKO() || (koing && !seatedKO)) return POSE.ko;
        if (T < coverUntil || veil.active()) return POSE.cover;
        if (menuNow && energy.protected(T)) return POSE.away;
        if (swingPose && T < swingPoseUntil) return POSE[swingPose];
        if (laserOn) return POSE.aim;
        if (seatedKO) return POSE.sit;
        return null;
      },
    };
    const offProvider = ctx.provide('fight', provider);
    const offDbg = debugHook(ctx, 'fight', { state: () => ({ weapon, energy: energy.value(T), koing, laserOn, point, menuNow, prot: protReason() }) });
    offs.push(ctx.on('xr', (on) => {
      if (!on) return;
      if (laserOn) setLaser(false);
      if (wheel.isOpen()) wheel.close();
      veil.stop();
      hud.show(false);
    }));

    return {
      update(dt) {
        if (disposed) return;
        T += Math.min(0.25, Math.max(0, dt || 0));
        ensureNet();
        const xr = xrOn();
        if (xr) { if (laserOn) setLaser(false); return; }
        runDev();
        // Menü schützt (die offene Waffenwahl zählt nicht)
        const wo = wheel.isOpen();
        menuNow = !ctx.playing() && !wo && !koing;
        energy.setMenu(menuNow, T);
        // Energie-Anzeige (Regeneration)
        if (!koing) { const ev = energy.value(T); if (Math.abs(ev - hudVal) >= 0.5 || (ev >= 100 && hudVal < 100)) { hudVal = ev; hud.set(ev); } }
        if (seatedKO && (ctx.player.getNet ? Math.hypot((ctx.player.getNet() || {}).vx || 0, (ctx.player.getNet() || {}).vz || 0) > 0.8 : false)) seatedKO = false;
        // Waffe an die eigene Figur
        try {
          const sv = ctx.use('selfview');
          const fig = sv && sv.figure ? sv.figure() : null;
          if (fig && fig.setHandItem) {
            const want = weapon === 'belt' || weapon === 'whip' || weapon === 'laser' ? weapon : null;
            if ((fig.getHandItem ? fig.getHandItem() : null) !== want) fig.setHandItem(want);
          }
        } catch { /* egal */ }
        // Waffenwahl an die Mitspieler (entprellt)
        if (wpDue >= 0 && T >= wpDue) {
          if (netOn()) { if (wpSent !== weapon && netSend('wp', { w: WEAPON_IDS.indexOf(weapon) })) wpSent = weapon; wpDue = -1; } else wpDue = T + 1;
        } else if (wpDue < 0 && netOn() && wpSent == null && weapon !== 'hand') wpDue = T;
        // Waffenknopf (Touch): lange halten mit Laser = leuchten
        if (auxHeld && !auxLaser && weapon === 'laser' && T - auxStart >= AUX_TAP) auxLaser = setLaser(true);
        // Laser
        if (laserOn) {
          placeDot2d();
          if (!ctx.playing() || koing || weapon !== 'laser' || isSafe(zoneState())) setLaser(false);
          else {
            laserAcc += dt || 0;
            if (laserAcc >= LASER_TICK) { laserAcc = 0; laserTick(); }
          }
        }
      },
      onSuspend() { if (laserOn) setLaser(false); if (wheel.isOpen()) wheel.close(); },
      dispose() {
        disposed = true;
        koSeq++;
        if (koing) { try { ctx.player.freeze(false); } catch { /* egal */ } }
        koing = false;
        if (laserOn) { try { const s = ctx.use('sound'); if (s && s.laser) s.laser(false); } catch { /* egal */ } }
        laserOn = false;
        for (const off of netOffs) { try { off(); } catch { /* egal */ } }
        netOffs = [];
        for (const off of offs) { try { off(); } catch { /* egal */ } }
        for (const m of [dot, beam]) {
          if (!m) continue;
          if (m.parent) m.parent.remove(m);
          m.geometry.dispose();
          m.material.dispose();
        }
        dot = null; beam = null;
        if (dot2d && dot2d.parentNode) dot2d.parentNode.removeChild(dot2d);
        dot2d = null;
        hud.dispose(); veil.dispose(); wheel.dispose();
        offDbg();
        offProvider();
      },
    };
  },
};
