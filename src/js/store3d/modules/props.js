// VIDEOTHEK LENZ · Modul `props` (Paket physics): Physik-Welt, Objekte der Stadt, Schlagen, Basketballkorb. Provider 'physics':
//   spawn({ shape:'box'|'sphere', size:[x,y,z]|radius, mass, pos, vel, spin?, mesh?, kind, owner?, ttl?, onHit? }) → body
//        { id, kind, pos, vel, mesh, sleeping, impulse(v), remove() }; mesh (Object3D) wird je Frame synchronisiert (Position +
//        Orientierung); hängt es noch nirgends, legt das Modul es in die eigene Gruppe und räumt es beim Entfernen ab.
//   hitTest(origin, dir, range, coneDeg?) → { body, dist } | null     bodiesNear(x, z, r) → body[]     count()
//   Zusätze: world (Kern, rein), pickable(pose, dir) → { body, dist } | null (aufhebbare Dinge), hold(body, on), launch(body, pos, vel),
//   geometryOf(kind), tapeMesh(art, media), hoop (Korb) und snapshot()/applyRemote() (Netzzustand, 1.16.0).
//   Mehrspieler (1.16.0): byNetId(id) → body|null und netIdOf(body) → id|null (Netz-ID = data.id statischer Requisiten bzw. data.net eines Spawns "<c>.<n>"),
//   Reset-Gate: ein verschobenes Ding wird nur zurückgesetzt, wenn net.physGate(body) es erlaubt (fremdgesteuerte nie).
// Objekte schlafen an ihrem Platz (layout.city.propSlots + eigene Plätze) und setzen sich nach ~2 min Ruhe unsichtbar zurück.
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, CanvasTexture, SRGBColorSpace, Vector3, DoubleSide } from 'three';
import { getOutdoor } from './outdoor.js';
import { presetFor } from '../engine/quality.js';
import { makeCanvas } from '../world/textures.js';
import { box, merge } from '../util/geo.js';
import { createWorld, orientationOf, queryColliders } from '../physics/world.js';
import { KINDS } from '../physics/kinds.js';
import { createShapes } from '../physics/shapes.js';
import { createInstancer } from '../physics/instancer.js';
import { pickInCone, HIT_RANGE, HIT_CONE_DEG, GRAB_RANGE } from '../physics/cone.js';
import { resolveHoop, createHoopTracker } from '../physics/hoop.js';
import { shouldReset, pyramidDown } from '../physics/home.js';

const CULL_DIST = { low: 24, mid: 32, high: 40 };
const NET_ID_RE = /^[A-Za-z0-9._-]{1,24}$/;

/** Netz-ID eines Körpers (rein): data.net (Spawn "<c>.<n>") vor data.id (statische Requisiten), nur im Format der Leitung. */
export function netIdOf(b) {
  const d = b && b.data;
  if (!d) return null;
  const id = d.net || d.id;
  return typeof id === 'string' && NET_ID_RE.test(id) ? id : null;
}
const warn = (...a) => { try { console.warn('[LenzFlix Store3D]', ...a); } catch { /* egal */ } };

/** Ist der Kreis (x, z, r) auf Höhe y (Füße) frei von Kollidern? (rein; für Platzwahl) */
function spotFree(src, x, z, r, y = 0, h = 1) {
  let free = true;
  queryColliders(src, x - r, z - r, x + r, z + r, (q) => {
    if (!free) return;
    const y0 = q.y0 === undefined ? 0 : q.y0;
    const y1 = q.y1 === undefined ? Infinity : q.y1;
    if (!(y0 < y + h && y1 > y + 0.05)) return;
    const nx = Math.min(Math.max(x, q.x0), q.x1);
    const nz = Math.min(Math.max(z, q.z0), q.z1);
    if ((x - nx) ** 2 + (z - nz) ** 2 < r * r) free = false;
  });
  return free;
}

/** Platzwahl: erste freie Stelle nahe (x, z) (Mitte, dann Ring 0,45 m / 0,9 m) oder null. */
export function findSpot(src, x, z, r, y = 0, h = 1) {
  if (spotFree(src, x, z, r, y, h)) return { x, z };
  for (const d of [0.45, 0.9]) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      if (spotFree(src, px, pz, r, y, h)) return { x: px, z: pz };
    }
  }
  return null;
}

/** Plan der Ruheplätze (rein, ohne three): [{ kind, x, y, z, yaw, id, group }] aus Stadt-Slots + eigenen Plätzen. */
export function planProps(layout, hoop) {
  const city = layout.city;
  const src = layout.cidx ? { index: layout.cidx, dyn: null } : layout.colliders;
  const out = [];
  const W = layout.w;
  const D = layout.d;
  const add = (kind, id, x, z, y, yaw = 0, group = 'misc') => {
    const k = KINDS[kind];
    const r = k.shape === 'sphere' ? k.size : (k.rr || Math.max(k.size[0], k.size[2]) / 2);
    const hh = k.shape === 'sphere' ? k.size * 2 : k.size[1];
    const s = findSpot(src, x, z, r + 0.05, y, hh);
    if (!s) return;
    out.push({ kind, id, x: s.x, z: s.z, y, yaw, group });
  };
  if (city) {
    let ballN = 0;
    for (const s of city.propSlots || []) {
      const kind = s.kind === 'ball' ? (ballN++ % 2 === 0 ? 'soccer' : 'basketball') : s.kind;
      if (!KINDS[kind]) continue;
      add(kind, s.id, s.x, s.z, s.y || 0, (s.x * 7 + s.z * 3) % 6.28, 'slot');
    }
    // Mülltonnen: Gehweg vor dem Laden und im Hof (die festen Hof-Tonnen gehören der Stadt)
    add('bin', 'binL', W * 0.12, D + 0.6, 0, 0.3, 'bin');
    add('bin', 'binR', W * 0.88, D + 0.6, 0, -0.4, 'bin');
    add('bin', 'binYard', W * 0.72, -2.0, 0, 0.8, 'bin');
  }
  // Aufsteller „Neu im Verleih“ im Laden, neben der Tür (Platz über Kollider geprüft)
  add('standee', 'standeeL', W / 2 - 2.7, D - 1.5, 0, 0.1, 'standee');
  add('standee', 'standeeR', W / 2 + 2.7, D - 1.5, 0, -0.1, 'standee');
  // Dosen-Pyramide auf der mittleren Kiste im Hof
  if (city) {
    const crate = (city.colliders || []).find((q) => q.id === 'crateB');
    if (crate) {
      const cx = (crate.x0 + crate.x1) / 2;
      const cz = (crate.z0 + crate.z1) / 2;
      const top = crate.y1;
      const hy = KINDS.can.size[1] / 2;
      const rows = [[-0.11, 0, 0], [0, 0, 0], [0.11, 0, 0], [-0.055, 1, 0], [0.055, 1, 0], [0, 2, 0]];
      rows.forEach((r, i) => out.push({ kind: 'can', id: `pyr${i}`, x: cx + r[0], z: cz, y: top + r[1] * (hy * 2 + 0.002), yaw: 0, group: 'pyramid' }));
    }
    if (hoop) {
      add('basketball', 'hoopBall', hoop.x - 1.6, hoop.z + 0.4, 0, 0, 'hoop');
      add('basketball', 'hoopBall2', hoop.x - 2.2, hoop.z - 0.6, 0, 0, 'hoop');
    }
  }
  return out;
}

function hoopVisual(hoop, tint) {
  // Rückfall (Paket A liefert keinen Korb): Mast, Brett, Ring und Netz als ein Mesh. Ring zeigt nach Westen (-x), Brett im Osten.
  const parts = [];
  const mx = hoop.mast ? hoop.mast.x : hoop.x + 0.95;
  parts.push(box({ w: 0.14, h: 3.7, d: 0.14, x: mx, y: 1.85, z: hoop.z, color: [0.45, 0.47, 0.52] }));
  parts.push(box({ w: 0.05, h: 0.8, d: 1.15, x: hoop.x + hoop.r + 0.15, y: hoop.y + 0.38, z: hoop.z, color: [0.96, 0.96, 0.98] }));
  parts.push(box({ w: 0.052, h: 0.34, d: 0.5, x: hoop.x + hoop.r + 0.13, y: hoop.y + 0.2, z: hoop.z, color: [0.9, 0.2, 0.15] }));
  parts.push(box({ w: hoop.r + 0.35, h: 0.06, d: 0.06, x: hoop.x + (hoop.r + 0.35) / 2, y: hoop.y - 0.02, z: hoop.z, color: [0.45, 0.47, 0.52] }));
  const seg = 12;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const rx = Math.cos(a) * hoop.r;
    const rz = Math.sin(a) * hoop.r;
    parts.push(box({ w: 0.06, h: 0.05, d: 0.06, x: hoop.x + rx, y: hoop.y, z: hoop.z + rz, ry: -a, color: [0.95, 0.4, 0.1] }));
    parts.push(box({ w: 0.015, h: 0.38, d: 0.015, x: hoop.x + rx * 0.82, y: hoop.y - 0.2, z: hoop.z + rz * 0.82, color: [0.96, 0.96, 0.96] }));
  }
  const mesh = new Mesh(merge(parts), tint(new MeshBasicMaterial({ vertexColors: true })));
  mesh.name = 'lfx-hoop';
  return mesh;
}

export default {
  name: 'props',
  init(ctx) {
    const flags = (ctx.opts && ctx.opts.devFlags) || {};
    if (flags.props === false) return null;
    const L = ctx.layout;
    const out = getOutdoor(ctx);
    const group = new Group();
    group.name = 'lfx-props';
    ctx.scene.add(group);
    ctx.track(group);
    const shapes = createShapes(makeCanvas);
    const baseMat = out.tint(new MeshBasicMaterial({ vertexColors: true }));
    const src = L.cidx ? { index: L.cidx, dyn: L.dyn } : L.colliders;
    const maxActive = () => presetFor(ctx.quality(), ctx.isPhone).propsMax || 40;
    const world = createWorld({ src, maxActive: maxActive() });
    const hoop = L.city ? resolveHoop(L.city.yard) : null;
    const plan = planProps(L, hoop);
    const counts = {};
    for (const p of plan) counts[p.kind] = (counts[p.kind] || 0) + 1;
    const instancer = createInstancer(group, shapes, baseMat, () => shapes.standeeMaterial((m) => out.tint(m)), counts);
    const _v = new Vector3();
    const cam = ctx.camera;
    const extra = new Set(); // von außen gespawnte Körper mit mesh, die wir in die Gruppe gelegt haben
    let vis = { street: true, yard: false, shopShell: true };
    let cullDist = CULL_DIST[ctx.quality()] || 32;
    let visT = 0;
    let resetT = 0;
    let sfxT = 0;
    let lastPose = null;
    const cleanups = [];

    // --- Körper anlegen ---
    const homes = [];
    for (const p of plan) {
      const k = KINDS[p.kind];
      const b = world.spawn({ kind: p.kind, pos: { x: p.x, y: p.y + (k.shape === 'sphere' ? k.size : k.size[1] / 2) + 0.001, z: p.z }, yaw: p.yaw, sleeping: true, owner: 'world', data: { id: p.id, group: p.group } });
      world.setHome(b, b.pos.x, b.pos.y, b.pos.z, p.yaw);
      b.inst = instancer.alloc(p.kind);
      b.vis = false;
      homes.push(b);
    }
    const netIndex = new Map(); // Netz-ID → Körper (Statik fest, Spawns beim ersten Zugriff)
    for (const b of homes) { const id = netIdOf(b); if (id) netIndex.set(id, b); }
    const pyramid = homes.filter((b) => b.data.group === 'pyramid');
    const hoopBalls = homes.filter((b) => b.data.group === 'hoop');
    let pyramidDone = false;

    // --- Sichtbarkeit und Orientierung ---
    function regionVisible(x, z, y) {
      const areas = ctx.use('areas');
      const a = areas ? areas.at(x, z, y) : 'street';
      if (a === 'shop') return vis.shopShell !== false;
      if (a === 'yard' || a === 'alley' || a === 'escape' || a === 'roof') return !!vis.yard;
      if (a === 'palastHall' || a === 'palastFoyer') return !!vis.palastInterior;
      if (a === 'salon') return !!vis.salonInterior;
      return vis.street !== false;
    }
    function updateVisibility() {
      const city = ctx.use('city');
      if (city && city.visible) vis = city.visible();
      const p = lastPose || ctx.player.getPose();
      for (const b of world.bodies) {
        if (b.held) { b.vis = false; b.dirty = true; continue; }
        const near = Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < cullDist;
        const v = near && (b.mesh || regionVisible(b.pos.x, b.pos.z, b.pos.y));
        if (v !== b.vis) { b.vis = v; b.dirty = true; }
      }
    }
    function syncBody(b) {
      b.dirty = false;
      const q = orientationOf(b);
      if (b.mesh) {
        b.mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
        b.mesh.quaternion.set(q.x, q.y, q.z, q.w);
        b.mesh.visible = !b.held;
      } else if (b.inst >= 0 && b.inst !== undefined) {
        instancer.set(b.kind, b.inst, b.pos, q, b.vis && !b.held);
      }
    }
    function inView(x, y, z) {
      cam.getWorldDirection(_v);
      const dx = x - cam.position.x; const dy = y - cam.position.y; const dz = z - cam.position.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      if (d < 3) return true;
      if (d > 45) return false;
      return (dx * _v.x + dy * _v.y + dz * _v.z) / d > 0.3;
    }
    const view = { inView };

    // --- Korb ---
    let hoopMesh = null;
    let display = null;
    const tracker = hoop ? createHoopTracker(hoop, {
      onScore(st) {
        drawDisplay();
        const s = ctx.use('sound');
        if (s) { s.play('swish'); s.play('cheer'); }
        if (st.streak >= 3) { const d = ctx.use('discover'); if (d) d.found('hoop-3'); }
      },
      onMiss() { drawDisplay(); },
    }) : null;
    if (hoop) {
      if (hoop.fallback) {
        hoopMesh = hoopVisual(hoop, (m) => out.tint(m));
        group.add(hoopMesh);
        const mx = hoop.mast ? hoop.mast.x : hoop.x + 0.95;
        ctx.addCollider({ x0: mx - 0.07, z0: hoop.z - 0.07, x1: mx + 0.07, z1: hoop.z + 0.07, y1: 3.7, top: false, kind: 'hoop' });
        ctx.addCollider({ x0: hoop.x + hoop.r + 0.12, z0: hoop.z - 0.57, x1: hoop.x + hoop.r + 0.18, z1: hoop.z + 0.57, y0: hoop.y - 0.05, y1: hoop.y + 0.8, top: false, kind: 'hoop' });
      }
      const c = makeCanvas(256, 128);
      const tex = new CanvasTexture(c);
      tex.colorSpace = SRGBColorSpace;
      const mat = new MeshBasicMaterial({ map: tex, toneMapped: false, side: DoubleSide });
      const geo = new PlaneGeometry(0.8, 0.4);
      const mesh = new Mesh(geo, mat);
      mesh.position.set((hoop.mast ? hoop.mast.x : hoop.x + 0.95) - 0.1, 2.15, hoop.mast ? hoop.mast.z : hoop.z);
      mesh.rotation.y = -Math.PI / 2;
      mesh.name = 'lfx-hoop-display';
      group.add(mesh);
      display = { c, tex, mat, geo, mesh };
      drawDisplay();
    }
    function drawDisplay() {
      if (!display) return;
      const x = display.c.getContext('2d');
      if (!x) return;
      const st = tracker.state;
      x.fillStyle = '#10121c'; x.fillRect(0, 0, 256, 128);
      x.strokeStyle = '#ff6a3d'; x.lineWidth = 6; x.strokeRect(4, 4, 248, 120);
      x.fillStyle = '#ff6a3d'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold 26px monospace'; x.fillText('KORB', 128, 26);
      x.font = 'bold 40px monospace'; x.fillText(`${st.hits} TREFFER`, 128, 66);
      x.font = 'bold 22px monospace'; x.fillStyle = st.streak >= 3 ? '#ffe45e' : '#ffb08a'; x.fillText(`SERIE ${st.streak}  BESTE ${st.best}`, 128, 104);
      display.tex.needsUpdate = true;
    }

    // --- Sound bei Aufprall ---
    cleanups.push(world.on((ev) => {
      if (ev.type !== 'impact') return;
      const b = ev.body;
      if (tracker && b.kind === 'basketball' && ev.surface === 'ground') tracker.landed(b.id);
      if (ev.speed < 1.8) return;
      const p = lastPose;
      if (p && Math.hypot(b.pos.x - p.x, b.pos.z - p.z) > 14) return;
      const now = world.time;
      if (now - sfxT < 0.07) return;
      sfxT = now;
      const s = ctx.use('sound');
      if (!s) return;
      const k = Math.min(1.5, ev.speed / 6);
      if (b.kind === 'bin') s.play('clang', { k });
      else s.play(b.shape === 'sphere' ? 'bounce' : 'thud', { k });
    }));

    // --- Schlagen (prio 10) ---
    const offHit = ctx.input.onAction('hit', (ev) => {
      const p = ctx.player.getPose();
      const yaw = p.yaw;
      const hit = pickInCone(world.bodies, { x: p.x, z: p.z, dx: -Math.sin(yaw), dz: -Math.cos(yaw), y: p.y || 0, range: Number.isFinite(ev.range) && ev.range > 0 ? ev.range : HIT_RANGE, deg: HIT_CONE_DEG }); // 1.18.0: Reichweite der Waffe (Gürtel 2,2 m, Peitsche 3,5 m)
      if (!hit) return false;
      const b = hit.body;
      const hx = Math.hypot(ev.dir.x, ev.dir.z) || 1;
      const k = 7 / (0.8 + Math.sqrt(b.mass));
      world.impulse(b, { x: (ev.dir.x / hx) * k, y: 1.6 + 1.2 / (1 + b.mass), z: (ev.dir.z / hx) * k });
      // Streuung: Nachbarn des getroffenen Dings (Dosen-Pyramide!) bekommen einen halben Stoß
      for (const n of world.bodies) {
        if (n === b || n.held || Math.hypot(n.pos.x - b.pos.x, n.pos.z - b.pos.z, n.pos.y - b.pos.y) > 0.4) continue;
        const kn = k * 0.5;
        world.impulse(n, { x: (ev.dir.x / hx) * kn + (n.pos.x - b.pos.x) * 3, y: 0.8, z: (ev.dir.z / hx) * kn + (n.pos.z - b.pos.z) * 3 });
      }
      b.spin = (b.id % 2 ? 1 : -1) * 3;
      if (b.kind === 'basketball' && tracker) { b.owner = 'player'; tracker.shot(b.id); }
      const s = ctx.use('sound');
      if (s) s.play(b.kind === 'bin' ? 'clang' : 'thud', { k: 1.1 });
      return true;
    }, { prio: 10 });
    cleanups.push(offHit);

    // --- Provider ---
    const provider = {
      world,
      hoop,
      hoopState: () => (tracker ? { ...tracker.state } : null),
      spawn(spec) {
        const b = world.spawn({ ...spec, owner: spec.owner || 'ext' });
        if (b.mesh) {
          if (!b.mesh.parent) { group.add(b.mesh); extra.add(b); }
          syncBody(b);
        }
        return b;
      },
      hitTest: (origin, dir, range, coneDeg) => world.hitTest(origin, dir, range, coneDeg),
      bodiesNear: (x, z, r) => world.bodiesNear(x, z, r),
      count: () => world.count(),
      /** Aufhebbares kleines Ding (throwable) im Kegel vor dem Spieler. */
      pickable(pose, dir) {
        const list = world.bodies.filter((b) => KINDS[b.kind] && KINDS[b.kind].throwable);
        return pickInCone(list, { x: pose.x, z: pose.z, dx: dir.x, dz: dir.z, y: pose.y || 0, range: GRAB_RANGE, deg: 40 });
      },
      hold(b, on) { world.setHeld(b, on); syncBody(b); },
      /** Körper abwerfen: Position/Geschwindigkeit setzen, wieder simulieren (Besitzer Spieler). */
      launch(b, pos, vel, spin = 0) {
        b.pos.x = pos.x; b.pos.y = pos.y; b.pos.z = pos.z;
        b.vel.x = vel.x; b.vel.y = vel.y; b.vel.z = vel.z;
        b.spin = spin; b.owner = 'player';
        world.setHeld(b, false);
        if (b.kind === 'basketball' && tracker) tracker.shot(b.id);
        b.prevY = b.pos.y;
        syncBody(b);
      },
      geometryOf: (kind) => shapes.geometry(kind),
      tapeMesh: (art, media) => shapes.tapeMesh(art, media),
      snapshot: (all) => world.snapshot(all),
      applyRemote: (list) => world.applyRemote(list),
      netIdOf,
      byNetId(id) {
        const k = netIndex.get(id);
        if (k && !k.removed) return k;
        netIndex.delete(id);
        for (const b of world.bodies) if (netIdOf(b) === id) { netIndex.set(id, b); return b; }
        return null;
      },
    };
    cleanups.push(ctx.provide('physics', provider));

    updateVisibility();
    for (const b of world.bodies) syncBody(b);
    instancer.flush();

    return {
      update(dt) {
        if (!(dt > 0)) return;
        const p = ctx.player.getPose();
        let vx = 0; let vz = 0;
        if (lastPose) {
          const dx = p.x - lastPose.x; const dz = p.z - lastPose.z;
          if (Math.hypot(dx, dz) < 0.5) { vx = dx / dt; vz = dz / dt; }
        }
        lastPose = p;
        world.setPlayer({ x: p.x, z: p.z, y: p.y || 0, vx, vz });
        const hb = tracker ? hoopBalls.concat(world.bodies.filter((b) => b.kind === 'basketball' && !hoopBalls.includes(b))) : [];
        for (const b of hb) { b.px = b.pos.x; b.py = b.pos.y; b.pz = b.pos.z; }
        world.step(dt);
        if (tracker) for (const b of hb) { if (!b.held && !b.netRemote) tracker.feed(b.id, { x: b.px, y: b.py, z: b.pz }, b.pos, b.r); }
        visT += dt; resetT += dt;
        if (visT > 0.3) { visT = 0; updateVisibility(); }
        for (const b of world.bodies) if (b.dirty) syncBody(b);
        instancer.flush();
        if (resetT > 0.6) {
          resetT = 0;
          const net = ctx.use('net');
          for (const b of world.bodies) {
            if (b.netRemote || !shouldReset(b, view)) continue;
            if (net && typeof net.physGate === 'function' && !net.physGate(b)) continue; // Mehrspieler: erst Anspruch, dann Reset
            world.reset(b);
          }
          if (!pyramidDone && pyramid.length && pyramidDown(pyramid)) {
            pyramidDone = true;
            const d = ctx.use('discover');
            if (d) d.found('can-pyramid');
          }
        }
      },
      onQuality(level) {
        world.setMaxActive(presetFor(level, ctx.isPhone).propsMax || 40);
        cullDist = CULL_DIST[level] || 32;
      },
      dispose() {
        for (const off of cleanups.splice(0)) { try { off(); } catch (err) { warn('props', err); } }
        for (const b of extra) if (b.mesh) b.mesh.removeFromParent();
        extra.clear();
        instancer.dispose();
        if (display) { display.tex.dispose(); display.mat.dispose(); display.geo.dispose(); display.mesh.removeFromParent(); }
        if (hoopMesh) { hoopMesh.geometry.dispose(); hoopMesh.material.dispose(); hoopMesh.removeFromParent(); }
        shapes.dispose();
        baseMat.dispose();
        world.dispose();
      },
    };
  },
};
