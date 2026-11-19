// VIDEOTHEK LENZ · Modul `throw` (Paket physics): Werfen (Taste G / Wurf-Knopf).
//   Hülle in der Hand → fliegt als Physik-Körper (kind 'tape', Cover als Textur) ~9 m/s nach vorn-oben; nach Landung + 6 s
//   wandert sie zurück ins Regal (ctx.items.restore), oder man hebt sie mit „Benutzen“ wieder auf (ctx.items.carry).
//   Hand leer → 1. G hebt ein nahes kleines Ding (Ball, Dose, Hütchen) auf, 2. G wirft es; „Benutzen“ legt es wieder ab.
//   Treffer eines geworfenen Dings: Richard (Provider 'brawl'.hitBy('object', dir)) oder Passant (Provider 'npc').
// Alle Provider-Aufrufe sind gesichert (fehlen sie, passiert nichts). In VR kein Werfen (die Aktion kommt dort nie an).
import { Mesh, MeshBasicMaterial } from 'three';
import { getOutdoor } from './outdoor.js';
import { pickInCone } from '../physics/cone.js';
import { createThrownTape, throwVelocity, THROW_SPEED } from '../physics/throwlife.js';

const HIT_SPEED = 3; // geworfenes Ding muss mindestens so schnell sein, um zu treffen
const warn = (...a) => { try { console.warn('[LenzFlix Store3D]', ...a); } catch { /* egal */ } };

export default {
  name: 'throw',
  init(ctx) {
    const cleanups = [];
    const tapes = []; // { life, body, mesh, geo, mats, tex, id }
    const flying = []; // { body, hit:Set } geworfene Dinge für die Trefferprüfung
    let held = null; // { body, mesh }
    let heldMat = null;
    const phys = () => ctx.use('physics');
    const p0 = phys;
    const play = (n, o) => { const s = ctx.use('sound'); if (s) s.play(n, o); };

    function dirOf(ev) {
      const l = Math.hypot(ev.dir.x, ev.dir.y, ev.dir.z) || 1;
      return { x: ev.dir.x / l, y: ev.dir.y / l, z: ev.dir.z / l };
    }

    // --- Hülle werfen ---
    function throwTape(ev) {
      const p = phys();
      if (!p) return false;
      const rel = ctx.items.release();
      if (!rel) return false;
      const d = dirOf(ev);
      const t = p.tapeMesh(rel.art, rel.media);
      const mesh = new Mesh(t.geometry, t.materials);
      const o = ev.origin;
      const body = p.spawn({
        kind: 'tape', shape: 'box', size: t.size, rr: 0.1, mass: 0.2, owner: 'player', mesh, tipLocal: true,
        pos: { x: o.x + d.x * 0.5, y: o.y - 0.12 + d.y * 0.5, z: o.z + d.z * 0.5 }, vel: throwVelocity(d, THROW_SPEED), tumble: 11, spin: 4,
        data: { tapeId: rel.id },
      });
      tapes.push({ life: createThrownTape(rel.id), body, mesh, geo: t.geometry, mats: t.materials, tex: t.tex, id: rel.id, hit: new Set() });
      flying.push({ body, hit: new Set(), t: 0 });
      play('whoosh');
      return true;
    }

    function disposeTape(t) {
      t.body.remove();
      if (t.mesh) t.mesh.removeFromParent();
      t.geo.dispose();
      for (const m of new Set(t.mats)) m.dispose();
      if (t.tex) t.tex.dispose();
    }
    function endTape(t, restore) {
      const i = tapes.indexOf(t);
      if (i >= 0) tapes.splice(i, 1);
      if (restore) ctx.items.restore(t.id);
      disposeTape(t);
    }

    // --- Ding aufheben / werfen ---
    function ensureHeldMat() {
      if (!heldMat) {
        heldMat = getOutdoor(ctx).tint(new MeshBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }), [1, 1, 1], { snow: false }); // hängt an der Kamera: kein liegender Schnee (Weltposition wandert)
      }
      return heldMat;
    }
    function grab(ev) {
      const p = phys();
      if (!p) return false;
      const pose = ctx.player.getPose();
      const d = dirOf(ev);
      const hit = p.pickable(pose, { x: d.x, z: d.z });
      if (!hit) return false;
      const b = hit.body;
      p.hold(b, true);
      const mesh = new Mesh(p.geometryOf(b.kind), ensureHeldMat());
      mesh.scale.setScalar(0.7);
      mesh.position.set(0.3, -0.27, -0.6);
      mesh.renderOrder = 998;
      ctx.camera.add(mesh);
      held = { body: b, mesh };
      play('thud', { k: 0.5 });
      return true;
    }
    function dropHeld(throwIt, ev) {
      const h = held;
      if (!h) return false;
      held = null;
      h.mesh.removeFromParent();
      const p = phys();
      if (!p) return true;
      const cam = ctx.camera;
      const d = ev ? dirOf(ev) : { x: 0, y: 0, z: -1 };
      const o = ev ? ev.origin : cam.position;
      if (throwIt) {
        const v = throwVelocity(d, 8.5);
        p.launch(h.body, { x: o.x + d.x * 0.45, y: o.y - 0.15 + d.y * 0.45, z: o.z + d.z * 0.45 }, v, 6);
        flying.push({ body: h.body, hit: new Set(), t: 0 });
        play('whoosh');
      } else {
        const hd = Math.hypot(d.x, d.z) || 1;
        p.launch(h.body, { x: o.x + (d.x / hd) * 0.6, y: Math.max(h.body.hy + 0.05, o.y - 1.0), z: o.z + (d.z / hd) * 0.6 }, { x: 0, y: 0, z: 0 }, 0);
        h.body.owner = 'world';
      }
      return true;
    }

    // --- Aktionen ---
    cleanups.push(ctx.input.onAction('throw', (ev) => {
      if (ev.carried) return throwTape(ev);
      if (held) return dropHeld(true, ev);
      return grab(ev);
    }, { prio: 10 }));
    cleanups.push(ctx.input.onAction('use', (ev) => {
      if (held) return dropHeld(false, ev);
      // geworfene Hülle aufheben
      if (ctx.items.carried() || !tapes.length) return false;
      const pose = ctx.player.getPose();
      const d = dirOf(ev);
      const list = tapes.filter((t) => t.life.state.phase === 'landed').map((t) => t.body);
      const hit = pickInCone(list, { x: pose.x, z: pose.z, dx: d.x, dz: d.z, y: pose.y || 0, range: 1.8, deg: 45, bandDown: 0.3 });
      if (!hit) return false;
      const t = tapes.find((q) => q.body === hit.body);
      if (!t || t.life.state.phase !== 'landed' || !ctx.items.carry(t.id)) return false;
      t.life.pickup();
      endTape(t, false);
      play('clack');
      return true;
    }, { prio: 8 }));

    // --- Treffer geworfener Dinge ---
    function checkHits(f) {
      const b = f.body;
      const sp = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
      if (sp < HIT_SPEED) return;
      const dir = { x: b.vel.x / sp, y: b.vel.y / sp, z: b.vel.z / sp };
      if (!f.hit.has('richard')) {
        const z = ctx.layout.zones && ctx.layout.zones.cashier && ctx.layout.zones.cashier.rect;
        const br = ctx.use('brawl');
        const ca = ctx.use('cashier');
        const rp = ca && ca.richard ? ca.richard() : null;
        // Richards echte Position (er ist ein Kollider und verlässt den Platz): Abstand statt fester Zone
        const near = rp
          ? Math.hypot(b.pos.x - rp.pos.x, b.pos.z - rp.pos.z) < 0.9 && b.pos.y < (rp.pos.y || 0) + 2.1 && b.pos.y > (rp.pos.y || 0)
          : !!z && b.pos.x > z.x0 - 0.3 && b.pos.x < z.x1 + 0.3 && b.pos.z > z.z0 - 0.3 && b.pos.z < z.z1 + 0.3 && b.pos.y < 2.1 && b.pos.y > 0;
        if (br && near) {
          f.hit.add('richard');
          try { br.hitBy('object', { x: dir.x, z: dir.z }); } catch (err) { warn('brawl.hitBy', err); }
          play('thud', { k: 1.2 });
        }
      }
      if (!f.hit.has('npc')) {
        const n = ctx.use('npc');
        const person = n && n.nearestPerson ? n.nearestPerson(b.pos.x, b.pos.z, 0.55) : null;
        if (person && person.handle && b.pos.y < 2.1) {
          f.hit.add('npc');
          try { person.handle.hitReact({ x: dir.x, z: dir.z }); } catch (err) { warn('npc.hitReact', err); }
          play('thud', { k: 1.2 });
        }
      }
    }

    function clearAll() {
      if (held) dropHeld(false, null);
      for (const t of tapes.slice()) endTape(t, true);
      flying.length = 0;
    }
    cleanups.push(ctx.on('xr', (on) => { if (on) clearAll(); }));

    return {
      update(dt) {
        for (const t of tapes.slice()) {
          const landed = t.body.grounded || t.body.sleeping;
          if (landed && !t.laid) { t.laid = true; const w = p0() && p0().world; if (w) w.tip(t.body, 0, -1); } // flach hinlegen, Cover nach oben
          const r = t.life.update(dt, landed);
          if (r === 'restore') endTape(t, true);
        }
        for (let i = flying.length - 1; i >= 0; i--) {
          const f = flying[i];
          f.t += dt;
          if (f.body.removed || f.body.sleeping || (f.body.grounded && f.t > 1.5)) { flying.splice(i, 1); continue; }
          checkHits(f);
        }
      },
      dispose() {
        for (const off of cleanups.splice(0)) { try { off(); } catch (err) { warn('throw', err); } }
        clearAll();
        if (heldMat) { heldMat.dispose(); heldMat = null; }
      },
    };
  },
};
