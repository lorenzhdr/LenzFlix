// VIDEOTHEK LENZ · Modul `npc` (Welle 2, Paket E): Figuren-Provider, Passanten, Kino-Personal, Katze, Tauben, Schlag-Handler (prio 20).
// Provider 'npc' { figure(opts) → Handle, staff(role) → Handle|null, nearestPerson(x,z,r) → { kind, handle, dist }|null,
//   registerPerson({ kind, handle, onHit(dir), pos?() }) → off, people() → [{ kind, handle, x, z }], say(handle, text, ms), scare(x,z) }.
// Passanten laufen auf layout.city.sidewalkPaths (npc/pathgraph.js), warten an Zebrastreifen auf Fußgänger-Grün, weichen dem Spieler aus.
// ?npc=0 (ctx.opts.devFlags.npc === false): figure() geht weiter, staff()/nearestPerson() liefern null, keine Passanten/Tiere.
// Vor-/Nachbedingungen: Passanten hängen in city.groups.street (unsichtbar im Laden), Personal in palastInterior, Katze in yard.
// Fremde Provider (discover, sound, traffic, weather, city) werden bei Gebrauch geholt, nie in init.
import { presetFor } from '../engine/quality.js';
import { createFigure, disposeFigureCaches } from '../npc/figure.js';
import { makeLook } from '../npc/looks.js';
import { createBubbles } from '../npc/bubbles.js';
import { buildGraph } from '../npc/pathgraph.js';
import { createWalker, stepWalker, hitWalker, pickInCone, walkerCount, SPUR_PATHS } from '../npc/walker-logic.js';
import { staffAnchors, catSpots, pigeonHomes } from '../npc/spots.js';
import { createCat as createCatLogic, stepCat, petCat, catPettable, scareCat, lineFree, createFlock, stepFlock } from '../npc/animals-logic.js';
import { createCat as createCatMesh, createPigeons, disposeAnimalCaches } from '../npc/animals.js';
import { pickLine } from '../npc/lines.js';
import { debugHook } from './m3-debug.js';

const FAR = 52; // m: darüber Figuren ausblenden (Nebelende ≈ 56)
const HIT_RANGE = 1.6;
const PARK = -9990; // Kollider unbenutzter/ferner Passanten
const COL_NEAR = 8; // m: nur nahe Passanten blockieren den Spieler
const COL_R = 0.3;

export default {
  name: 'npc',
  init(ctx) {
    const flags = (ctx.opts && ctx.opts.devFlags) || {};
    const enabled = flags.npc !== false;
    const L = ctx.layout;
    const city = L.city || null;
    const rand = Math.random;
    const bubbles = createBubbles(ctx);
    const externals = new Set(); // von Fremdpaketen erzeugte Figuren (werden hier aktualisiert)
    const registered = new Set(); // registerPerson-Einträge
    const lastLine = {};
    let speakGap = 0;
    const offs = [];
    const sound = (name) => { const s = ctx.use('sound'); if (s && s.play) s.play(name); };
    const found = (id) => { const d = ctx.use('discover'); if (d && d.found) { try { d.found(id); } catch { /* egal */ } } };
    const groups = () => { const c = ctx.use('city'); return (c && c.groups) || null; };
    const xrOn = () => !!(ctx.xr && ctx.xr.presenting());
    const weather = () => ctx.use('weather') || {};

    const hooks = { say: (h, text, ms) => bubbles.show(h, text, ms) };
    function line(cat) {
      const r = pickLine(cat, rand, lastLine[cat] === undefined ? -1 : lastLine[cat]);
      if (!r) return '';
      lastLine[cat] = r.index;
      return r.text;
    }
    function sayCat(handle, cat, force) {
      if (!force && speakGap > 0) return false;
      const t = line(cat);
      if (!t) return false;
      speakGap = 1.6;
      return bubbles.show(handle, t, 3600);
    }

    // ------------------------------------------------------------ Provider
    const provider = {
      figure(o = {}) {
        const look = o.look || makeLook(o.rand || rand, { role: o.role, rain: !!o.rain });
        const h = createFigure(look, { ...hooks, name: o.name });
        if (o.pos) h.root.position.set(o.pos.x, o.pos.y || 0, o.pos.z);
        if (typeof o.yaw === 'number') h.root.rotation.y = o.yaw;
        const g = groups();
        (o.parent || (g && g.street) || ctx.scene).add(h.root);
        externals.add(h);
        const dispose = h.dispose;
        h.dispose = () => { externals.delete(h); bubbles.hideFor(h); dispose(); };
        return h;
      },
      staff(role) { return enabled && staffMap.get(role) ? staffMap.get(role).handle : null; },
      people() { return collectPeople(false).map((p) => ({ kind: p.kind, handle: p.handle, x: p.x, z: p.z })); },
      nearestPerson(x, z, r = 3) {
        if (!enabled) return null;
        let best = null;
        for (const p of collectPeople(false)) {
          const d = Math.hypot(p.x - x, p.z - z);
          if (d <= r && (!best || d < best.dist)) best = { kind: p.kind, handle: p.handle, dist: d };
        }
        return best;
      },
      registerPerson(o) { const e = { ...o }; registered.add(e); return () => registered.delete(e); },
      say: (h, text, ms) => bubbles.show(h, text, ms),
      scare(x, z) { if (cat && Math.hypot(cat.logic.x - x, cat.logic.z - z) < 3) scareCat(cat.logic, catEnv()); },
    };
    const offProvider = ctx.provide('npc', provider);

    // ------------------------------------------------------------ Zustand
    const walkers = [];
    const staffMap = new Map();
    let cat = null;
    let flock = null;
    let pigeons = null;
    let graph = null;
    let frame = 0;
    let px = 0; let pz = 0; let py = 0; let pSpeed = 0; let havePose = false;
    let preset = presetFor(ctx.quality(), ctx.isPhone);

    const raining = () => !!weather().raining;
    const tod = () => weather().tod || 'day';

    function walkerGroup() { const g = groups(); return (g && g.street) || ctx.scene; }
    function spawnWalker() {
      if (!graph) return null;
      const ok = graph.edges.filter((e) => !e.wait && !SPUR_PATHS.has(e.path) && e.len > 4);
      if (!ok.length) return null;
      const e = ok[Math.floor(rand() * ok.length)];
      const rain = raining();
      const look = makeLook(rand, { rain });
      const handle = createFigure(look, hooks);
      handle.setUmbrella(look.umbrella && rain);
      walkerGroup().add(handle.root);
      const w = createWalker(graph, rand, { edge: e.id, id: walkers.length, rush: rain ? 1.25 : 1 });
      // Wurftreffer (throw.js ruft nur handle.hitReact) sollen wie der Schlag wirken: Walker-Automat auf stagger setzen, sonst überschreibt er die Animation jeden Frame.
      const rawReact = handle.hitReact.bind(handle);
      const entry = { w, handle, acc: 0, rawReact, col: null };
      handle.hitReact = (dir) => { const ev = hitWalker(w, dir, rand); rawReact(dir); if (ev && ev.cat) sayCat(handle, ev.cat, true); };
      entry.col = ctx.addCollider({ x0: PARK, z0: PARK, x1: PARK + 0.5, z1: PARK + 0.5, y1: 1.8, top: false, kind: 'walker' }, { dynamic: true });
      walkers.push(entry);
      return entry;
    }
    function removeWalker(entry) {
      const i = walkers.indexOf(entry);
      if (i >= 0) walkers.splice(i, 1);
      bubbles.hideFor(entry.handle);
      if (entry.col) ctx.removeCollider(entry.col);
      entry.handle.dispose();
    }
    function adjustWalkers() {
      const want = enabled && graph ? walkerCount(preset.npcMax, tod(), raining()) : 0;
      while (walkers.length < want) if (!spawnWalker()) break;
      while (walkers.length > want) removeWalker(walkers[walkers.length - 1]);
    }

    function buildStaff() {
      const g = groups();
      const anchors = staffAnchors(city);
      for (const role of ['ticket', 'popcorn']) {
        const a = anchors[role];
        const handle = createFigure(makeLook(rand, { role }), hooks);
        handle.root.position.set(a.x, 0, a.z);
        handle.root.rotation.y = a.yaw || 0;
        ((g && g.palastInterior) || ctx.scene).add(handle.root);
        const entry = { role, handle, baseYaw: a.yaw || 0, x: a.x, z: a.z, chatCool: 10 + rand() * 20, waveCool: 0 };
        staffMap.set(role, entry);
      }
    }

    function catEnv() {
      return {
        rand, spots: cat.spots, player: havePose ? { x: px, z: pz, speed: pSpeed, y: py } : null,
        free: (a, b) => lineFree(cat.statics, a, b),
      };
    }
    function buildCat() {
      const g = groups();
      const spots = catSpots(city);
      const statics = (city.colliders || []).filter((c) => !c.dynamic);
      const logic = createCatLogic(spots, rand);
      const mesh = createCatMesh();
      ((g && g.yard) || ctx.scene).add(mesh.root);
      cat = { logic, mesh, spots, statics, group: g && g.yard };
      mesh.setPose(logic);
      const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
      const place = () => {
        box.min.x = logic.x - 0.45; box.max.x = logic.x + 0.45;
        box.min.z = logic.z - 0.45; box.max.z = logic.z + 0.45;
        box.min.y = logic.y; box.max.y = logic.y + 0.6;
      };
      place();
      cat.place = place;
      cat.removeIa = ctx.addInteractable({
        box, label: 'Katze', hint: 'E / Klick: Streicheln',
        enabled: () => !!cat && !xrOn() && catPettable(logic, havePose ? { x: px, z: pz, speed: pSpeed } : null),
        onUse: () => {
          if (petCat(logic)) {
            sound('purr');
            if (ctx.xr.presenting()) ctx.xr.toast('Die Katze schnurrt.'); else { try { ctx.deps.toast('Die Katze schnurrt. Du hast jetzt einen Freund auf vier Pfoten.'); } catch { /* egal */ } }
            found('cat-pet');
          }
        },
      });
    }
    function buildPigeons() {
      const n = preset.birds | 0;
      if (n <= 0) return;
      const g = groups();
      const homes = pigeonHomes(city);
      flock = { list: createFlock(homes, n, rand), homes };
      pigeons = createPigeons(n);
      ((g && g.street) || ctx.scene).add(pigeons.root);
      pigeons.set(flock.list);
    }
    function disposePigeons() {
      if (pigeons) { if (pigeons.root.parent) pigeons.root.parent.remove(pigeons.root); pigeons.dispose(); pigeons = null; }
      flock = null;
    }

    if (enabled && city && city.sidewalkPaths) {
      graph = buildGraph(city.sidewalkPaths);
      adjustWalkers();
      buildStaff();
      if (city.yard) buildCat();
      buildPigeons();
    }

    // ------------------------------------------------------------ Schlag
    function collectPeople(forHit) {
      const out = [];
      for (const e of walkers) {
        if (!e.handle.root.visible || !e.handle.root.parent) continue;
        out.push({ kind: 'walker', handle: e.handle, x: e.w.x, z: e.w.z, hit: (dir) => { e.handle.hitReact(dir); } });
      }
      for (const e of staffMap.values()) {
        const g = groups();
        if (g && g.palastInterior && !g.palastInterior.visible) continue;
        out.push({
          kind: e.role, handle: e.handle, x: e.handle.root.position.x, z: e.handle.root.position.z,
          hit: (dir) => { e.handle.hitReact(dir); sayCat(e.handle, e.role === 'ticket' ? 'ticketHit' : 'popcornHit', true); sound('oof'); e.flinch = 1.2; },
        });
      }
      for (const r of registered) {
        if (!r.handle || !r.handle.root.visible || !r.handle.root.parent) continue;
        const pos = r.pos ? r.pos() : { x: r.handle.root.position.x, z: r.handle.root.position.z };
        out.push({ kind: r.kind, handle: r.handle, x: pos.x, z: pos.z, hit: (dir) => r.onHit && r.onHit(dir) });
      }
      void forHit;
      return out;
    }

    if (enabled) {
      offs.push(ctx.input.onAction('hit', (ev) => {
        if (xrOn() || !ev || !ev.origin || !ev.dir) return false;
        const people = collectPeople(true);
        if (!people.length) return false;
        const eyeY = ev.origin.y;
        const y = ctx.player.getY();
        const c = pickInCone(people.filter((p) => Math.abs((p.handle.root.position.y || 0) - y) < 1.2 && eyeY - (p.handle.root.position.y || 0) < 3), ev.origin, ev.dir, HIT_RANGE, 25);
        if (!c) return false;
        const pool = people.filter((p) => Math.abs((p.handle.root.position.y || 0) - y) < 1.2 && eyeY - (p.handle.root.position.y || 0) < 3);
        const target = pool[c.index];
        const l = Math.hypot(ev.dir.x, ev.dir.z) || 1;
        target.hit({ x: ev.dir.x / l, z: ev.dir.z / l });
        sound('oof');
        return true;
      }, { prio: 20 }));
      // Katze: Schlag in der Nähe erschreckt (Beobachter, verbraucht nichts)
      offs.push(ctx.on('hit', (ev) => {
        if (!cat || !ev || !ev.origin) return;
        if (Math.hypot(cat.logic.x - ev.origin.x, cat.logic.z - ev.origin.z) < 2.2) scareCat(cat.logic, catEnv());
      }));
    }

    // ------------------------------------------------------------ Update
    const visible = (g) => !g || g.visible || xrOn();
    function walkerEnv() {
      const c = ctx.use('city');
      const sig = c && c.signals ? c.signals() : { walkMain: true, walkSide: true };
      const t = ctx.use('traffic');
      return {
        graph, rand, signal: sig, player: havePose && py < 1.2 ? { x: px, z: pz, speed: pSpeed } : null, roadMid: city.frame.roadMid,
        night: tod() !== 'day', raining: raining(), zebraClear: t && t.zebraClear ? (e) => t.zebraClear(e) : null,
      };
    }

    function updateStaff(dt) {
      const g = groups();
      if (g && g.palastInterior && !g.palastInterior.visible && !xrOn()) return;
      for (const e of staffMap.values()) {
        const h = e.handle;
        const d = havePose ? Math.hypot(px - e.x, pz - e.z) : 99;
        e.chatCool -= dt;
        e.waveCool -= dt;
        if (e.flinch > 0) e.flinch -= dt;
        if (d < 7 && havePose && !(e.flinch > 0)) {
          h.lookAt(px, 1.6, pz);
          if (d < 5.5 && e.waveCool <= 0 && !h.anim.busy() && h.anim.anim === 'idle') { h.setAnim('wave'); e.waveCool = 18 + rand() * 10; }
          if (d < 6 && e.chatCool <= 0) { sayCat(h, e.role, false); e.chatCool = 28 + rand() * 25; }
        } else h.lookAt(null);
        if (d < 40) h.update(dt, ctx.camera);
      }
    }

    function updateWalkers(dt) {
      const env = walkerEnv();
      for (let i = 0; i < walkers.length; i++) {
        const e = walkers[i];
        const w = e.w;
        const dd = havePose ? Math.hypot(w.x - px, w.z - pz) : 0;
        const lod = dd < 22 ? 0 : dd < 40 ? 1 : 2;
        e.acc += dt;
        const every = lod === 0 ? 1 : lod === 1 ? 3 : 6;
        if ((frame + i) % every !== 0) continue;
        const step = Math.min(e.acc, 0.25);
        e.acc = 0;
        const evs = stepWalker(w, step, env);
        for (const ev of evs) {
          if (ev.type === 'say' && lod === 0) sayCat(e.handle, ev.cat, false);
          else if (ev.type === 'bump') { sound('oof'); e.rawReact({ x: w.recoil.x, z: w.recoil.z }); }
        }
        const h = e.handle;
        h.root.position.set(w.x + w.recoil.x * 0.1, 0, w.z + w.recoil.z * 0.1);
        h.root.rotation.y = w.yaw;
        h.root.visible = dd < FAR;
        if (e.col) {
          if (dd < COL_NEAR && h.root.visible) ctx.moveCollider(e.col, h.root.position.x - COL_R, h.root.position.z - COL_R, h.root.position.x + COL_R, h.root.position.z + COL_R);
          else if (e.col.x0 > PARK + 1) ctx.moveCollider(e.col, PARK, PARK, PARK + 0.5, PARK + 0.5);
        }
        if (w.state !== 'stagger') h.setAnim(w.anim, { speed: w.v });
        else if (!h.anim.busy()) h.setAnim('stagger', { restart: true, then: 'idle' });
        if (lod <= 1 && h.root.visible) h.update(step, ctx.camera);
      }
    }

    function updateCat(dt) {
      if (!cat) return;
      if (cat.group && !visible(cat.group)) return;
      const evs = stepCat(cat.logic, dt, catEnv());
      for (const ev of evs) { if (ev.type === 'meow') sound('meow'); else if (ev.type === 'startle') sound('meow'); }
      cat.mesh.setPose(cat.logic);
      cat.place();
    }

    function updateFlock(dt) {
      if (!flock || !pigeons) return;
      const g = groups();
      if (g && g.street && !visible(g.street)) return;
      const evs = stepFlock(flock.list, dt, { rand, homes: flock.homes, player: havePose ? { x: px, z: pz, speed: pSpeed } : null, bounds: city.bounds });
      if (evs.length) sound('flap');
      pigeons.set(flock.list);
    }

    const offDbg = debugHook(ctx, 'npc', {
      walkers: () => walkers.map((e) => ({ x: e.w.x, z: e.w.z, state: e.w.state, anim: e.w.anim })),
      cat: () => cat && { ...cat.logic },
      flock: () => flock && flock.list.map((p) => ({ state: p.state, x: p.x, z: p.z, y: p.y })),
      staff: () => [...staffMap.keys()],
      counts: () => ({ walkers: walkers.length, staff: staffMap.size, birds: flock ? flock.list.length : 0, externals: externals.size }),
    });

    return {
      update(dt) {
        dt = Math.min(dt, 0.1);
        frame++;
        speakGap = Math.max(0, speakGap - dt);
        const pose = ctx.player.getPose();
        if (havePose && dt > 0) pSpeed += (Math.hypot(pose.x - px, pose.z - pz) / dt - pSpeed) * Math.min(1, dt * 8);
        px = pose.x; pz = pose.z; py = Number.isFinite(pose.y) ? pose.y : 0; havePose = true;
        for (const h of externals) { if (h.root.visible && h.root.parent) h.update(dt, ctx.camera); }
        bubbles.update(dt);
        if (!enabled || !city) return;
        const g = groups();
        if (graph && walkers.length && visible(g && g.street)) updateWalkers(dt);
        updateStaff(dt);
        updateCat(dt);
        updateFlock(dt);
      },
      onQuality() { preset = presetFor(ctx.quality(), ctx.isPhone); adjustWalkers(); disposePigeons(); if (enabled && city) buildPigeons(); },
      onSuspend() { for (const s of [...walkers]) bubbles.hideFor(s.handle); },
      dispose() {
        for (const off of offs) { try { off(); } catch { /* egal */ } }
        offProvider();
        for (const e of walkers) { if (e.col) ctx.removeCollider(e.col); e.handle.dispose(); }
        walkers.length = 0;
        for (const e of staffMap.values()) e.handle.dispose();
        staffMap.clear();
        for (const h of [...externals]) h.dispose();
        if (cat) { if (cat.removeIa) cat.removeIa(); if (cat.mesh.root.parent) cat.mesh.root.parent.remove(cat.mesh.root); cat = null; }
        disposePigeons();
        bubbles.dispose();
        disposeFigureCaches();
        disposeAnimalCaches();
        offDbg();
      },
    };
  },
};
