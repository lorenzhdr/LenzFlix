// VIDEOTHEK LENZ · Modul `npc` (Welle 2, Paket E): Figuren-Provider, Passanten, Kino-Personal, Katze, Tauben, Schlag-Handler (prio 20).
// Provider 'npc' { figure(opts) → Handle, staff(role) → Handle|null, nearestPerson(x,z,r) → { kind, handle, dist }|null,
//   registerPerson({ kind, handle, onHit(dir), pos?() }) → off, people() → [{ kind, handle, x, z }], say(handle, text, ms), scare(x,z),
//   reserve(n, key = 'net') → n (1.16.0: n Figuren-Slots für Mitspieler belegen; Passanten-Zahl sinkt um n, Draw-Call-Ausgleich bei low;
//   1.17.0: Werte je Schlüssel, Summe zählt, n <= 0 löscht den Schlüssel), overflow() → max(0, Summe − Passanten-Höchstzahl) }.
// 1.18.0 (Welle 6): speak(handle, text, { id, voiceSeed, prio, ms }) → Promise<'spoken'|'bubble'|'muted'> (Sprecher-Regie cashier.speaker, sonst Blase),
//   temperOf(handle) → 'shy'|'normal'|'hot', laserHit(handle) → bool (Laserblick: Hände vor die Augen, 2 s; hitzköpfig greift danach an, sonst Flucht),
//   react(event, data) (event 'emote' {name} | 'basket' | 'cans' | 'discover' | 'alarm' | 'ban': Gesten naher Passanten),
//   throwProp(kind 'candy'|'popcorn', from {x,y,z}, to {x,y,z}) → bool (Wurf-Pool, 1 InstancedMesh, Treffer → fight.hitPlayer), attackers() → Anzahl.
//   registerPerson({ …, onHit(dir, { weapon }), onLaser?() }). Provider 'animals' { laser(point {x,z}|null) } (Katze jagt den Punkt, Tauben flattern auf).
// Passanten (1.18.0): Temperament aus dem Seed (temper-logic.js): ängstlich flieht, normal schimpft, hitzköpfig droht, greift an und verfolgt höchstens 8 s
//   (attack-logic.js; Gegenstand aus dem Look per setHandItem; Treffer am Spieler über ctx.use('fight').hitPlayer({ dmg, knock, src: 'npc', from })),
//   Umstehende (hitzköpfig) machen mit (höchstens 3). Kein Angriff in VR. Alltag/Reaktionen: social-logic.js.
// Passanten laufen auf layout.city.sidewalkPaths (npc/pathgraph.js), warten an Zebrastreifen auf Fußgänger-Grün, weichen dem Spieler aus.
// ?npc=0 (ctx.opts.devFlags.npc === false): figure() geht weiter, staff()/nearestPerson() liefern null, keine Passanten/Tiere.
// Vor-/Nachbedingungen: Passanten hängen in city.groups.street (unsichtbar im Laden), Personal in palastInterior, Katze in yard.
// Fremde Provider (discover, sound, traffic, weather, city) werden bei Gebrauch geholt, nie in init.
import { presetFor } from '../engine/quality.js';
import { createFigure, disposeFigureCaches } from '../npc/figure.js';
import { makeLook } from '../npc/looks.js';
import { createBubbles } from '../npc/bubbles.js';
import { buildGraph } from '../npc/pathgraph.js';
import { createWalker, stepWalker, hitWalker, walkerCount, yawOf, SPUR_PATHS } from '../npc/walker-logic.js';
import { staffAnchors, catSpots, pigeonHomes } from '../npc/spots.js';
import { createCat as createCatLogic, stepCat, petCat, catPettable, scareCat, lineFree, createFlock, stepFlock } from '../npc/animals-logic.js';
import { createCat as createCatMesh, createPigeons, disposeAnimalCaches } from '../npc/animals.js';
import { pickLine } from '../npc/lines.js';
import { temperOf, reactToProvocation, bystanderJoin, MAX_ATTACKERS, CHASE_MAX } from '../npc/temper-logic.js';
import { createAttack, createBlind, stepAttack, stunAttack, attackItem, nearestOnGraph, ATK } from '../npc/attack-logic.js';
import { createThrowPool } from '../npc/throwpool.js';
import { THROW_DMG, THROW_SOUND } from '../npc/throw-logic.js';
import { createAggro, provoke as aggroProvoke } from '../npc/aggro-logic.js';
import { emoteReaction, eventForDiscover, pickReactors, EVENT_REACT, AMBIENT } from '../npc/social-logic.js';
import { selectTargets, weaponInfo } from '../fight/weapons.js';
import { debugHook } from './m3-debug.js';
import { createReactBudget, OUTFIT_NEW, HAIR_NEW } from '../char/react-logic.js';
import { OUTFIT_FIELDS } from '../char/look2.js';

const FAR = 52; // m: darüber Figuren ausblenden (Nebelende ≈ 56)
const PARK = -9990; // Kollider unbenutzter/ferner Passanten
const COL_NEAR = 8; // m: nur nahe Passanten blockieren den Spieler
const COL_R = 0.3;
const REACT_R = 4; // m: so nah muss ein Passant sein, um das neue Outfit zu kommentieren (1.17.0)
const THREAT_MEMORY = 20; // s: so lange eskaliert ein zweiter Schubser eines gedrohten Hitzköpfigen zum Angriff
const REACT_EVERY = 0.4; // s: Prüftakt der Outfit-Reaktionen
/** Hat sich seit prev NUR die Frisur (Stil/Farbe, Felder 5/6) geändert? (rein; Code-Arrays laut char/look2.js) */
export function hairOnly(prev, cur) {
  if (!Array.isArray(prev) || !Array.isArray(cur)) return false;
  let hair = false;
  for (const i of OUTFIT_FIELDS) {
    if (prev[i] === cur[i]) continue;
    if (i === 5 || i === 6) hair = true; else return false;
  }
  return hair;
}

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
    // Outfit-Reaktionen der Passanten (1.17.0): Budget aus char/react-logic.js, eigene ms-Uhr (aus dt), avatar lazy (Guard)
    const react = { budget: createReactBudget(), cat: OUTFIT_NEW, avRef: undefined, off: null, prev: null, ms: 0, acc: 0, seq: 0, ids: new WeakMap() };
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
    // Sprecher-Regie (cashier.speaker, 1.18.0): jede Person bekommt einen Sprecher (Stimme aus dem Seed, Färbung macht die Regie per voiceFor); 'bubble'/'muted' → Blase.
    const speakerOf = new WeakMap(); // handle → { c, sp }
    const speakerSet = new Set();
    const voiceIds = new WeakMap(); // handle → { id, voiceSeed }
    let speakSeq = 0;
    const hasRegie = () => { const c = ctx.use('cashier'); return !!(c && typeof c.speaker === 'function'); };
    function releaseSpeaker(handle) {
      const rec = speakerOf.get(handle);
      if (!rec) return;
      speakerOf.delete(handle);
      speakerSet.delete(rec);
      try { if (rec.sp && typeof rec.sp.release === 'function') rec.sp.release(); } catch { /* egal */ }
    }
    function speak(handle, text, o = {}) {
      const ms = o.ms || 3600;
      const bubble = () => { try { if (handle && !handle.disposed) bubbles.show(handle, text, ms); } catch { /* egal */ } };
      const c = ctx.use('cashier');
      if (!handle || !c || typeof c.speaker !== 'function') { bubble(); return Promise.resolve('bubble'); }
      try {
        let rec = speakerOf.get(handle);
        if (!rec || rec.c !== c) {
          if (rec) speakerSet.delete(rec);
          const id = o.id !== undefined ? o.id : `p${++speakSeq}`;
          rec = { c, sp: c.speaker({ id, voiceSeed: o.voiceSeed !== undefined ? o.voiceSeed : id, prio: Number.isFinite(o.prio) ? o.prio : 0, pos: () => ({ x: handle.root.position.x, y: 1.6, z: handle.root.position.z }) }) };
          speakerOf.set(handle, rec);
          speakerSet.add(rec);
        }
        if (!rec.sp || typeof rec.sp.say !== 'function') { bubble(); return Promise.resolve('bubble'); }
        return Promise.resolve(rec.sp.say(text)).then((r) => { if (r !== 'spoken') bubble(); return r; }, () => { bubble(); return 'bubble'; });
      } catch { bubble(); return Promise.resolve('bubble'); }
    }
    function sayCat(handle, cat, force) {
      if (!force && speakGap > 0) return false;
      const t = line(cat);
      if (!t) return false;
      speakGap = 1.6;
      if (!hasRegie()) return bubbles.show(handle, t, 3600);
      speak(handle, t, voiceIds.get(handle) || {});
      return true;
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
        h.dispose = () => { externals.delete(h); bubbles.hideFor(h); releaseSpeaker(h); dispose(); };
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
      /** Sprechen: über die Sprecher-Regie (Stimme je Person aus dem Seed), 'bubble'/'muted' → Blase; ohne Regie direkt Blase. Rückgabe wie bubbles.show bzw. true. */
      say: (h, text, ms) => {
        if (!hasRegie()) return bubbles.show(h, text, ms);
        speak(h, text, { ...(voiceIds.get(h) || {}), ms });
        return true;
      },
      scare(x, z) { if (cat && Math.hypot(cat.logic.x - x, cat.logic.z - z) < 3) scareCat(cat.logic, catEnv()); },
      /** Slots für Fremdfiguren (Mehrspieler): je Slot ein Passant weniger. Rückgabe: gültiger Wert; 0 hebt auf. */
      reserve(n, key = 'net') {
        const v = Number.isFinite(n) ? Math.max(0, Math.min(64, Math.floor(n))) : 0;
        const before = reservedSum();
        if (v > 0) reservedBy.set(key, v); else reservedBy.delete(key);
        if (reservedSum() !== before && enabled && graph) adjustWalkers();
        return v;
      },
      /** Wie viele reservierte Slots die aktuelle Passanten-Höchstzahl übersteigen (max(0, Summe − Höchstzahl)); 1.17.0. */
      overflow() { return Math.max(0, reservedSum() - walkerCount(preset.npcMax, tod(), raining())); },
      /** 1.18.0: Sprecher-Regie; o = { id, voiceSeed, prio, ms }. */
      speak,
      /** Temperament einer Person: Passanten aus dem Seed, alle anderen 'normal'. */
      temperOf(handle) { const e = walkers.find((x) => x.handle === handle); return e ? e.temper : 'normal'; },
      /** Laserblick traf die Person: Hände vor die Augen (2 s), Hitzköpfe greifen danach an, die übrigen fliehen. */
      laserHit(handle) { return laserHit(handle); },
      /** Gesten naher Passanten: 'emote' { name }, 'basket' | 'cans' | 'discover' | 'alarm' | 'ban'. */
      react(event, data) { return reactEvent(event, data); },
      /** Wurf-Pool (Bonbon/Popcorn), ein InstancedMesh; Treffer am Spieler → fight.hitPlayer. */
      throwProp(kind, from, to) { return throwProp(kind, from, to); },
      attackers: () => countAttackers(),
    };
    const offProvider = ctx.provide('npc', provider);
    let lz = null; // Laserpunkt { x, z, t } (Provider 'animals')
    const laserPoint = () => (lz && clock - lz.t < 0.35 ? lz : null);
    const offAnimals = ctx.provide('animals', {
      /** Laserpunkt am Boden ({x,z}) oder null; der Aufrufer meldet ihn jeden Frame, solange der Laser leuchtet. */
      laser(pt) { lz = pt && Number.isFinite(pt.x) && Number.isFinite(pt.z) ? { x: pt.x, z: pt.z, t: clock } : null; },
    });

    // ------------------------------------------------------------ Zustand
    const walkers = [];
    const staffMap = new Map();
    let cat = null;
    let flock = null;
    let pigeons = null;
    let graph = null;
    let frame = 0;
    const reservedBy = new Map(); // provider.reserve(n, key): Schlüssel → n
    const reservedSum = () => { let s = 0; for (const v of reservedBy.values()) s += v; return s; };
    let px = 0; let pz = 0; let py = 0; let pSpeed = 0; let havePose = false;
    let clock = 0; // s aus dt (Provokation/Verfolgung)
    let stopNow = false; // Angriffe beenden (VR, Schutz, Spieler oben/drinnen)
    const timers = [];
    const later = (sec, fn) => { timers.push({ t: clock + sec, fn }); };
    let pool = null;
    const statics = (city && city.colliders ? city.colliders : []).filter((c) => !c.dynamic);
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
      const seed = Math.floor(rand() * 1e9);
      const temper = temperOf(seed);
      w.temper = temper;
      // Wurftreffer (throw.js ruft nur handle.hitReact) sollen wie der Schlag wirken: Walker-Automat auf stagger setzen, sonst überschreibt er die Animation jeden Frame.
      const rawReact = handle.hitReact.bind(handle);
      const entry = { w, handle, acc: 0, rawReact, col: null, look, seed, temper, tst: { temper }, act: null, pend: null, pose: null, known: rand() < 0.25, waved: false, danceCool: 0 };
      voiceIds.set(handle, { id: `w${seed}`, voiceSeed: seed });
      handle.hitReact = (dir) => walkerProvoked(entry, 'hit', dir);
      entry.col = ctx.addCollider({ x0: PARK, z0: PARK, x1: PARK + 0.5, z1: PARK + 0.5, y1: 1.8, top: false, kind: 'walker' }, { dynamic: true });
      walkers.push(entry);
      return entry;
    }
    function removeWalker(entry) {
      const i = walkers.indexOf(entry);
      if (i >= 0) walkers.splice(i, 1);
      bubbles.hideFor(entry.handle);
      releaseSpeaker(entry.handle);
      if (entry.col) ctx.removeCollider(entry.col);
      entry.handle.dispose();
    }

    // ------------------------------------------------------------ Provokation, Angriff, Gesten (1.18.0)
    const fightP = () => ctx.use('fight');
    const protectedNow = () => { const f = fightP(); return !!(f && typeof f.protected === 'function' && f.protected()); };
    const countAttackers = () => { let n = 0; for (const e of walkers) if (e.act && e.act.attack) n++; return n; };
    const canAttack = () => !xrOn() && countAttackers() < MAX_ATTACKERS && !protectedNow();
    function restoreItem(e) {
      const h = e.handle;
      try { if (h.getHandItem && h.getHandItem()) h.setHandItem(null); if (e.look && e.look.umbrella && raining()) h.setUmbrella(true); } catch { /* egal */ }
    }
    function provokeCat(e, kind, action, ev) {
      if (e.temper === 'hot') return action === 'attack' ? 'attackHot' : 'provokeHot';
      if (e.temper === 'normal') return kind === 'hit' && e.w.hitCount <= 1 && ev && ev.cat ? ev.cat : 'provokeNormal';
      return kind === 'hit' && ev && ev.cat ? ev.cat : 'provokeShy';
    }
    /** Schlag/Waffe/Wurf auf einen Passanten (kind 'hit'): ängstlich flieht (wie bisher), normal schimpft, hitzköpfig droht bzw. greift an. */
    function walkerProvoked(e, kind, dir) {
      const w = e.w;
      e.pose = null;
      if (e.act && e.act.phase !== 'blind') { stunAttack(e.act); e.rawReact(dir); sayCat(e.handle, 'struck', true); return; }
      if (e.act) { e.act = null; restoreItem(e); }
      const r = reactToProvocation(e.tst, kind, clock);
      const attackOk = r.action === 'attack' && canAttack();
      const ev = hitWalker(w, dir, rand, e.temper);
      e.rawReact(dir);
      if (e.temper === 'hot') e.pend = { attack: attackOk, until: r.until !== undefined ? r.until : clock + CHASE_MAX };
      sayCat(e.handle, provokeCat(e, kind, attackOk ? 'attack' : 'threat', ev), true);
    }
    /** Anrempeln durch den Spieler (Automat steht bereits im Taumeln): Zustand nach dem Taumeln je Temperament, Hitzkopf droht/greift an. */
    function walkerBumped(e) {
      const w = e.w;
      e.pose = null;
      if (e.tst.threatened && clock - (e.threatAt || 0) > THREAT_MEMORY) e.tst.threatened = false;
      const r = reactToProvocation(e.tst, 'shove', clock);
      if (r.action === 'threat') e.threatAt = clock;
      w.after = e.temper === 'shy' ? null : e.temper === 'normal' ? 'walk' : 'hold';
      if (e.temper === 'hot') {
        const attackOk = r.action === 'attack' && canAttack();
        e.pend = { attack: attackOk, until: r.until !== undefined ? r.until : clock + CHASE_MAX };
        sayCat(e.handle, attackOk ? 'attackHot' : 'provokeHot', true);
      }
    }
    function beginAct(e, o) {
      const w = e.w;
      const h = e.handle;
      const item = attackItem(e.look);
      e.pose = null; e.pend = null;
      e.act = createAttack({ x: w.x, z: w.z, yaw: w.yaw, item, until: o.until, attack: o.attack });
      w.state = 'hold'; w.timer = 99; w.v = 0; w.recoil.x = 0; w.recoil.z = 0;
      try { if (item) { if (item === 'umbrella') h.setUmbrella(false); h.setHandItem(item); } } catch { /* egal */ }
      if (o.attack) joinBystanders(e);
    }
    /** Umstehende (hitzköpfig, nah am Spieler) machen mit, höchstens 3 Angreifer. */
    function joinBystanders(src) {
      let n = countAttackers();
      for (const o of walkers) {
        if (o === src || o.act || o.temper !== 'hot' || !o.handle.root.visible || !havePose) continue;
        if (Math.hypot(o.w.x - px, o.w.z - pz) > 9 || !bystanderJoin(n, o.temper)) continue;
        o.tst.threatened = true;
        o.tst.chaseUntil = clock + CHASE_MAX;
        beginAct(o, { attack: true, until: o.tst.chaseUntil });
        n++;
      }
    }
    function endAct(e, then) {
      const w = e.w;
      if (e.act && e.act.attack) e.tst.threatened = false; // nach einem echten Angriff wieder bei null; eine reine Drohung bleibt im Gedächtnis (THREAT_MEMORY)
      e.act = null;
      restoreItem(e);
      const g = graph ? nearestOnGraph(graph, w.x, w.z, (ed) => SPUR_PATHS.has(ed.path)) : null;
      if (g) { const ed = graph.edges[g.edge]; w.edge = g.edge; w.dir = rand() < 0.5 ? 1 : -1; w.s = (w.dir === 1 ? g.t : 1 - g.t) * ed.len; }
      w.pending = null; w.after = null; w.timer = 0; w.recoil.x = 0; w.recoil.z = 0;
      if (then === 'flee') { w.state = 'flee'; w.fleeT = 6; w.rush = 1.9; w.anim = 'run'; } else { w.state = 'walk'; w.fleeT = 0; w.rush = 1; w.anim = 'walk'; }
    }
    function stopCond() {
      if (xrOn() || !havePose || py >= 1.2) return true;
      const g = groups();
      if (!visible(g && g.street)) return true;
      return protectedNow();
    }
    function strike(e, ev) {
      const f = fightP();
      if (!f || typeof f.hitPlayer !== 'function' || xrOn()) return;
      let ok;
      try { ok = f.hitPlayer({ dmg: ev.dmg, knock: { x: ev.dir.x, z: ev.dir.z }, src: 'npc', from: { x: ev.from.x, z: ev.from.z } }); } catch { ok = false; }
      if (ok) sound('slap');
    }
    function stepAct(e, step) {
      const a = e.act;
      const w = e.w;
      const h = e.handle;
      const evs = stepAttack(a, step, { clock, target: havePose ? { x: px, z: pz } : null, free: (p, q) => lineFree(statics, p, q), stop: stopNow, rand });
      w.x = a.x; w.z = a.z; w.yaw = a.yaw;
      w.v = a.phase === 'chase' && a.runAnim ? ATK.speed : 0;
      w.anim = a.phase === 'chase' && a.runAnim ? 'run' : 'idle';
      for (const ev of evs) {
        if (ev.type === 'anim') h.setAnim(ev.name, { restart: !!ev.restart, speed: ev.speed });
        else if (ev.type === 'say') sayCat(h, ev.cat, true);
        else if (ev.type === 'strike') strike(e, ev);
        else if (ev.type === 'end') { endAct(e, ev.then); return; }
      }
    }
    function laserHit(handle) {
      if (!enabled || !handle || xrOn()) return false;
      const e = walkers.find((x) => x.handle === handle);
      if (e) {
        if (e.act && e.act.phase === 'blind') return false;
        if (e.act) restoreItem(e);
        const w = e.w;
        const then = e.temper === 'hot' && canAttack() ? 'attack' : 'flee';
        const item = attackItem(e.look);
        e.pose = null; e.pend = null;
        e.act = createBlind({ x: w.x, z: w.z, yaw: w.yaw, then, item, until: clock });
        w.state = 'hold'; w.timer = 99; w.v = 0; w.recoil.x = 0; w.recoil.z = 0;
        if (then === 'attack' && item) { try { if (item === 'umbrella') handle.setUmbrella(false); handle.setHandItem(item); } catch { /* egal */ } }
        return true;
      }
      for (const p of collectPeople(false)) {
        if (p.handle !== handle) continue;
        if (typeof p.onLaser === 'function') { try { p.onLaser(); } catch { /* egal */ } return true; }
        handle.setAnim('cover', { restart: true });
        sayCat(handle, 'blinded', true);
        later(2, () => { if (!handle.disposed && handle.anim.anim === 'cover') handle.setAnim('idle', { restart: true }); });
        return true;
      }
      return false;
    }
    /** Walker kurz stehen lassen und eine Geste zeigen (blickt den Spieler an). */
    function holdWalker(e, anim, secs) {
      const w = e.w;
      if (e.act || w.state === 'stagger' || w.state === 'flee') return false;
      w.state = 'hold'; w.timer = secs; w.v = 0; w.anim = 'idle';
      if (havePose) w.yaw = yawOf(px - w.x, pz - w.z);
      e.pose = { t: secs };
      e.handle.setAnim(anim, { restart: true });
      return true;
    }
    function reactPeople(anim, cat, secs, n) {
      if (!enabled || xrOn() || !havePose) return 0;
      const g = groups();
      if (!visible(g && g.street)) return 0;
      const cands = [];
      for (const e of walkers) {
        if (!e.handle.root.visible || !e.handle.root.parent || e.act || e.w.state === 'stagger' || e.w.state === 'flee') continue;
        cands.push({ x: e.w.x, z: e.w.z, e });
      }
      const picks = pickReactors(cands, { x: px, z: pz }, { r: 9, n });
      let done = 0;
      picks.forEach((c, i) => {
        if (i > 0 && rand() > 0.7) return;
        if (holdWalker(c.e, anim, secs)) { done++; if (i === 0) sayCat(c.e.handle, cat, true); }
      });
      return done;
    }
    const evLast = {};
    let pendingEv = null; // { kind, until }: Ereignis im Laden, die Straße war unsichtbar
    function reactEvent(event, data) {
      if (!enabled) return false;
      if (event === 'emote') {
        const r = emoteReaction(data && typeof data === 'object' ? (data.name || data.id || data.anim) : data);
        return !!r && reactPeople(r.anim, r.cat, r.secs, 2) > 0;
      }
      const r = EVENT_REACT[event];
      if (!r) return false;
      if (evLast[event] !== undefined && clock - evLast[event] < 3) return false;
      evLast[event] = clock;
      const n = reactPeople(r.anim, r.cat, r.secs, 2);
      if (!n && (event === 'alarm' || event === 'ban')) pendingEv = { kind: event, until: clock + 8 };
      return n > 0;
    }
    function throwProp(kind, from, to) {
      if (!enabled || xrOn() || !from || !to) return false;
      if (!pool) pool = createThrowPool(ctx.scene, rand);
      const ok = pool.launch(kind, from, to);
      if (ok) sound(THROW_SOUND[kind] || 'pop');
      return ok;
    }
    function onPropArrive(p, hit) {
      if (!hit) return;
      const f = fightP();
      if (!f || typeof f.hitPlayer !== 'function' || xrOn()) return;
      const dx = p.to.x - p.from.x;
      const dz = p.to.z - p.from.z;
      const l = Math.hypot(dx, dz) || 1;
      try { f.hitPlayer({ dmg: THROW_DMG[p.kind] || 4, knock: { x: dx / l, z: dz / l }, src: 'npc', from: { x: p.from.x, z: p.from.z } }); } catch { /* egal */ }
    }
    function popcornProvoked(e) {
      if (!e.aggro || !havePose || xrOn()) return;
      if (aggroProvoke(e.aggro, clock) !== 'throw') return;
      const h = e.handle;
      try { h.setHandItem('popcorn'); h.setAnim('toss', { restart: true }); } catch { /* egal */ }
      later(0.4, () => { if (!h.disposed) throwProp('popcorn', { x: h.root.position.x, y: 1.3, z: h.root.position.z }, { x: px, y: py + 1.2, z: pz }); });
      later(1.4, () => { if (!h.disposed) h.setHandItem(null); });
    }
    /** Alltag: an der Ampel tanzen (selten), Bekannte winken. */
    function ambientTick(e, step, dd) {
      const w = e.w;
      e.danceCool = Math.max(0, e.danceCool - step);
      if (w.state === 'wait' && e.danceCool <= 0 && dd < AMBIENT.radius && rand() < step * AMBIENT.dance) {
        e.danceCool = AMBIENT.danceCool;
        if (holdWalker(e, 'dance', 3.5)) sayCat(e.handle, 'trafficLight', false);
        return;
      }
      if (e.known && !e.waved && w.state === 'walk' && dd < 4 && dd > 1.4 && pSpeed < 2 && rand() < step * AMBIENT.wave) {
        e.waved = true;
        if (holdWalker(e, 'wave', 2.4)) sayCat(e.handle, 'greetKnown', false);
      }
    }
    const disc = { ref: undefined, off: null };
    function watchDiscover() {
      const d = ctx.use('discover');
      if (d === disc.ref) return;
      if (disc.off) { try { disc.off(); } catch { /* egal */ } disc.off = null; }
      disc.ref = d;
      if (!d || typeof d.onChange !== 'function') return;
      disc.off = d.onChange((id) => { const k = eventForDiscover(id); if (k) reactEvent(k, { id }); });
    }
    const emo = { ref: undefined, off: null };
    let emoteAt = -9;
    function onEmote(ev) { if (clock - emoteAt < 0.3) return; emoteAt = clock; reactEvent('emote', ev); }
    function watchEmotes() {
      const e = ctx.use('emotes');
      if (e === emo.ref) return;
      if (emo.off) { try { emo.off(); } catch { /* egal */ } emo.off = null; }
      emo.ref = e;
      if (!e || typeof e.onPlayerEmote !== 'function') return;
      emo.off = e.onPlayerEmote((ev) => onEmote(ev));
    }
    let brawlLast;
    function brawlWatch() {
      const b = ctx.use('brawl');
      const st = b && typeof b.state === 'function' ? b.state() : null;
      if (st === brawlLast) return;
      const prev = brawlLast;
      brawlLast = st;
      if (prev === undefined || prev === null) return;
      if (st === 'chase' && prev !== 'throw') reactEvent('alarm');
      else if (st === 'banned') reactEvent('ban');
    }
    function adjustWalkers() {
      const want = enabled && graph ? Math.max(0, walkerCount(preset.npcMax, tod(), raining()) - reservedSum()) : 0;
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
        voiceIds.set(handle, { id: `staff-${role}`, voiceSeed: `staff-${role}` });
        const entry = { role, handle, baseYaw: a.yaw || 0, x: a.x, z: a.z, chatCool: 10 + rand() * 20, waveCool: 0, aggro: role === 'popcorn' ? createAggro('popcorn') : null };
        staffMap.set(role, entry);
      }
    }

    function catEnv() {
      return {
        rand, spots: cat.spots, player: havePose ? { x: px, z: pz, speed: pSpeed, y: py } : null,
        free: (a, b) => lineFree(cat.statics, a, b), laser: laserPoint(),
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
          hit: (dir) => { e.handle.hitReact(dir); sayCat(e.handle, e.role === 'ticket' ? 'ticketHit' : 'popcornHit', true); sound('oof'); e.flinch = 1.2; popcornProvoked(e); },
        });
      }
      for (const r of registered) {
        if (!r.handle || !r.handle.root.visible || !r.handle.root.parent) continue;
        const pos = r.pos ? r.pos() : { x: r.handle.root.position.x, z: r.handle.root.position.z };
        out.push({ kind: r.kind, handle: r.handle, x: pos.x, z: pos.z, hit: (dir, info) => r.onHit && r.onHit(dir, info), onLaser: r.onLaser });
      }
      void forHit;
      return out;
    }

    if (enabled) {
      offs.push(ctx.input.onAction('hit', (ev) => {
        if (xrOn() || !ev || !ev.origin || !ev.dir) return false;
        const f = fightP();
        const wid = ev.weapon || (f && typeof f.weapon === 'function' ? f.weapon() : 'hand');
        if (wid === 'laser') return false; // der Laser trifft nicht, er blendet (laserHit)
        const info = weaponInfo(wid);
        const people = collectPeople(true);
        if (!people.length) return false;
        const eyeY = ev.origin.y;
        const y = ctx.player.getY();
        const cands = people.filter((p) => Math.abs((p.handle.root.position.y || 0) - y) < 1.2 && eyeY - (p.handle.root.position.y || 0) < 3);
        const picks = selectTargets(ev.origin, ev.dir, cands, info);
        if (!picks.length) return false;
        const l = Math.hypot(ev.dir.x, ev.dir.z) || 1;
        for (const c of picks) c.cand.hit({ x: ev.dir.x / l, z: ev.dir.z / l }, { weapon: info.id });
        sound('oof');
        return true;
      }, { prio: 20 }));
      // Katze: Schlag in der Nähe erschreckt (Beobachter, verbraucht nichts)
      offs.push(ctx.on('hit', (ev) => {
        if (!cat || !ev || !ev.origin) return;
        if (Math.hypot(cat.logic.x - ev.origin.x, cat.logic.z - ev.origin.z) < 2.2) scareCat(cat.logic, catEnv());
      }));
      // Spieler-Emotes (Emote-Rad, 1.18.0): Tanzen → mittanzen, Winken → zurückwinken, Verbeugen → Applaus
      offs.push(ctx.on('player-emote', (ev) => onEmote(ev))); // Rückfall; der Weg ist Provider 'emotes'.onPlayerEmote (watchEmotes)
    }

    // ------------------------------------------------------------ Outfit-Reaktionen
    function watchAvatar() {
      const av = ctx.use('avatar');
      if (av === react.avRef) return;
      if (react.off) { try { react.off(); } catch { /* egal */ } react.off = null; }
      react.avRef = av;
      if (!av || typeof av.onChange !== 'function') return;
      react.prev = typeof av.code === 'function' && Array.isArray(av.code()) ? av.code().slice() : null;
      react.off = av.onChange((look, code) => {
        const h = typeof av.hash === 'function' ? av.hash() : '';
        react.cat = hairOnly(react.prev, code) ? HAIR_NEW : OUTFIT_NEW;
        react.prev = Array.isArray(code) ? code.slice() : null;
        react.budget.noteChange(react.ms, h);
      });
    }
    function reactTick() {
      if (xrOn() || !havePose || !graph || py >= 1.2) return;
      const g = groups();
      if (!visible(g && g.street)) return;
      for (const e of walkers) {
        const h = e.handle;
        if (!h.root.visible || !h.root.parent || Math.hypot(e.w.x - px, e.w.z - pz) >= REACT_R) continue;
        let id = react.ids.get(h);
        if (!id) { id = ++react.seq; react.ids.set(h, id); }
        if (!react.budget.passerbyMay(react.ms, id)) continue;
        if (sayCat(h, react.cat, false)) { react.budget.markSaid(react.ms, id); break; }
      }
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
        if (e.act) stepAct(e, step);
        else {
          const evs = stepWalker(w, step, env);
          const bumped = evs.some((ev) => ev.type === 'bump');
          for (const ev of evs) {
            if (ev.type === 'say' && lod === 0) {
              if (bumped && e.temper === 'hot') continue; // Hitzkopf droht statt „Hoppla“ (walkerBumped)
              sayCat(e.handle, ev.cat, false);
              if (ev.cat === 'poster' && w.state === 'browse' && !e.pose) { e.pose = { t: 2.2 }; e.handle.setAnim('point', { restart: true }); }
            } else if (ev.type === 'bump') { sound('oof'); e.rawReact({ x: w.recoil.x, z: w.recoil.z }); walkerBumped(e); }
          }
          if (e.pend && w.state === 'hold') beginAct(e, e.pend.attack && !canAttack() ? { ...e.pend, attack: false } : e.pend); // Obergrenze erst beim Start prüfen
          else if (lod === 0 && !e.pose && havePose && w.state !== 'stagger') ambientTick(e, step, dd);
        }
        const h = e.handle;
        h.root.position.set(w.x + w.recoil.x * 0.1, 0, w.z + w.recoil.z * 0.1);
        h.root.rotation.y = w.yaw;
        h.root.visible = dd < FAR;
        if (e.col) {
          if (dd < COL_NEAR && h.root.visible) ctx.moveCollider(e.col, h.root.position.x - COL_R, h.root.position.z - COL_R, h.root.position.x + COL_R, h.root.position.z + COL_R);
          else if (e.col.x0 > PARK + 1) ctx.moveCollider(e.col, PARK, PARK, PARK + 0.5, PARK + 0.5);
        }
        if (e.pose) { e.pose.t -= step; if (e.pose.t <= 0) e.pose = null; } else if (e.act) { /* Anim kommt aus dem Angriff */ } else if (w.state !== 'stagger') h.setAnim(w.anim, { speed: w.v });
        else if (!h.anim.busy()) h.setAnim('stagger', { restart: true, then: 'idle' });
        if (lod <= 1 && h.root.visible) h.update(step, ctx.camera);
      }
    }

    function updateCat(dt) {
      if (!cat) return;
      if (cat.group && !visible(cat.group)) return;
      const evs = stepCat(cat.logic, dt, catEnv());
      for (const ev of evs) { if (ev.type === 'meow') sound('meow'); else if (ev.type === 'startle') sound('meow'); else if (ev.type === 'catlaser') found('cat-laser'); }
      cat.mesh.setPose(cat.logic);
      cat.place();
    }

    function updateFlock(dt) {
      if (!flock || !pigeons) return;
      const g = groups();
      if (g && g.street && !visible(g.street)) return;
      const evs = stepFlock(flock.list, dt, { rand, homes: flock.homes, player: havePose ? { x: px, z: pz, speed: pSpeed } : null, bounds: city.bounds, laser: laserPoint() });
      if (evs.length) sound('flap');
      pigeons.set(flock.list);
    }

    const offDbg = debugHook(ctx, 'npc', {
      walkers: () => walkers.map((e) => ({ x: e.w.x, z: e.w.z, state: e.w.state, anim: e.w.anim })),
      cat: () => cat && { ...cat.logic },
      flock: () => flock && flock.list.map((p) => ({ state: p.state, x: p.x, z: p.z, y: p.y })),
      staff: () => [...staffMap.keys()],
      counts: () => ({ walkers: walkers.length, staff: staffMap.size, birds: flock ? flock.list.length : 0, externals: externals.size, reserved: reservedSum(), attackers: countAttackers() }),
      tempers: () => walkers.map((e) => e.temper),
    });

    return {
      update(dt) {
        react.ms += Math.max(0, dt) * 1000;
        dt = Math.min(dt, 0.1);
        clock += dt;
        frame++;
        speakGap = Math.max(0, speakGap - dt);
        const pose = ctx.player.getPose();
        if (havePose && dt > 0) pSpeed += (Math.hypot(pose.x - px, pose.z - pz) / dt - pSpeed) * Math.min(1, dt * 8);
        px = pose.x; pz = pose.z; py = Number.isFinite(pose.y) ? pose.y : 0; havePose = true;
        for (const h of externals) { if (h.root.visible && h.root.parent) h.update(dt, ctx.camera); }
        bubbles.update(dt);
        for (let i = timers.length - 1; i >= 0; i--) {
          if (clock < timers[i].t) continue;
          const t = timers.splice(i, 1)[0];
          try { t.fn(); } catch { /* egal */ }
        }
        if (pool) pool.update(dt, { x: px, z: pz, y: py }, onPropArrive);
        if (!enabled || !city) return;
        const g = groups();
        stopNow = stopCond();
        if (graph && walkers.length && visible(g && g.street)) updateWalkers(dt);
        updateStaff(dt);
        updateCat(dt);
        updateFlock(dt);
        watchAvatar();
        watchDiscover();
        watchEmotes();
        react.acc += dt;
        if (react.acc >= REACT_EVERY) {
          react.acc = 0;
          reactTick();
          brawlWatch();
          if (pendingEv) { if (clock > pendingEv.until) pendingEv = null; else if (visible(g && g.street) && reactPeople(EVENT_REACT[pendingEv.kind].anim, EVENT_REACT[pendingEv.kind].cat, EVENT_REACT[pendingEv.kind].secs, 2) > 0) pendingEv = null; }
        }
      },
      onQuality() { preset = presetFor(ctx.quality(), ctx.isPhone); adjustWalkers(); disposePigeons(); if (enabled && city) buildPigeons(); },
      onSuspend() { for (const s of [...walkers]) { bubbles.hideFor(s.handle); if (s.act) endAct(s, 'walk'); } },
      dispose() {
        for (const off of offs) { try { off(); } catch { /* egal */ } }
        if (react.off) { try { react.off(); } catch { /* egal */ } react.off = null; }
        if (disc.off) { try { disc.off(); } catch { /* egal */ } disc.off = null; }
        if (emo.off) { try { emo.off(); } catch { /* egal */ } emo.off = null; }
        offProvider();
        offAnimals();
        if (pool) { pool.dispose(); pool = null; }
        timers.length = 0;
        for (const rec of [...speakerSet]) { try { if (rec.sp && typeof rec.sp.release === 'function') rec.sp.release(); } catch { /* egal */ } }
        speakerSet.clear();
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
