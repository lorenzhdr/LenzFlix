// VIDEOTHEK LENZ · Modul `gang` (1.18.0, Welle 6): Rowdy-Bande. Nachts 2–3, abends 0–1, tags selten einer; nur in Gasse, Hof und auf der Feuertreppe
// (höchstens 6 m in die Straße, nie im Laden und an der Tür). Ablauf je Rowdy (npc/gang-logic.js): ansprechen (rowdyAccost) → drohen (sleeves/threat,
// rowdyThreat) → angreifen (swing, fight.hitPlayer src 'gang') → getroffen (rowdyHit) → Flucht (rowdyFlee, Entdeckung gang-flee) / Sieg (rowdyWin bei K.O.).
// Provider 'gang' (Vertrag .tmp/v118/contracts.md §4): active() → bool · members() → [{ i, handle, st, hp, pos:{x,z} }] · hit(i, weapon, dir?) → bool · role() → 'local'|'leader'|'follower'.
//
// Mehrspieler (Muster rich.js/net/richard.js, über ctx.use('net').fight, Vertrag Welle 6): Der Führer (Rolle 'leader') rechnet die Bande, wählt je Rowdy
// das nächste Ziel unter sich und den Peers (Treffer auf Peers als `fh` src 1) und sendet `gs` mit höchstens 6/s (nur mit Mitspielern und bei Änderung, sonst Herzschlag alle 4 s); Mitläufer ('follower') spiegeln Zustände (Orte
// geglättet, Sprüche und Posen aus dem Zustandswechsel), eigene Treffer gehen als `gh` an den Führer. Ohne Fähigkeit/Verbindung oder ohne Führer
// läuft alles lokal ('local', wie 1.17 ohne Mehrspieler); wer sich in der Nähe befindet und keinen Führer sieht, fordert die Führung an (`gc`).
// Die Uhr des Führers gilt: Tageszeit-Phase und Seed stehen im `gs`. Der Empfang von `fh` src 1 (Schaden an mir) gehört dem Modul fight, nicht hier.
// Draw-Calls: je sichtbarer Rowdy eine Figur (1 Draw-Call), npc.reserve(n, 'gang') gleicht aus, bei `low` höchstens 2 Figuren; in VR keine Bande.
import { createGang, createRowdy, hitRowdy, stepRowdy, gangAreaOk, spawnCount, GANG_MAX } from '../npc/gang-logic.js';
import { weaponInfo, selectTargets } from '../fight/weapons.js';
import { pickLine } from '../npc/lines.js';
import { makeLook } from '../npc/looks.js';
import { timedDuration } from '../npc/anim.js';
import { regionVisible } from '../net/peers-logic.js';
import { netAnim, phaseOf, TODS, weaponIndex, WEAPON_BY_INDEX } from '../net/gang.js';
import { seeded } from './m4-util.js';

const warn = (what, err) => { try { console.warn('[LenzFlix Store3D] gang', what, err && err.message ? err.message : ''); } catch { /* egal */ } };
export const SLOT_MS = 20 * 60 * 1000; // Zeitfenster des Spawn-Seeds
export const NEAR_M = 44; // Figuren ab hier bauen, ab FAR_M wieder abbauen
export const FAR_M = 52;
export const LEAD_NEAR_M = 35; // so nah muss man der Bande sein, um die Führung anzufordern
export const GS_EVERY_S = 0.17;
export const GS_BEAT_S = 4; // Herzschlag des Führers bei unverändertem Zustand oder ohne Mitspieler (Server: 60 s Frist, Mitläufer: STALE_S)
export const STALE_S = 6; // Mitläufer: so lange ohne gs, dann Bande weg
export const HIT_PRIO = 25; // zwischen Richard (30) und Personen (20)
const WALL_GROW = 0.3;
const LEATHER = [[0.09, 0.08, 0.08], [0.16, 0.1, 0.07], [0.1, 0.1, 0.13]];
const HATS = ['beanie', 'cap', 'beanie'];
const HAIRS = ['tuft', 'bald', 'short'];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/** Derber Look je Rowdy (Lederjacke, Nietenstreifen, Mütze; nie Freischalt-Teile): deterministisch aus Seed und Index. */
export function rowdyLook(seed, i) {
  const r = seeded((Math.imul(seed | 0, 2654435761) ^ Math.imul(i + 1, 40503)) >>> 0);
  const base = makeLook(r, {});
  const k = Math.floor(r() * LEATHER.length);
  return {
    ...base,
    role: null,
    top: LEATHER[k],
    bottom: [0.1, 0.12, 0.2],
    shoes: [0.06, 0.06, 0.07],
    hat: HATS[Math.floor(r() * HATS.length)],
    hatColor: LEATHER[(k + 1) % LEATHER.length],
    hairStyle: HAIRS[Math.floor(r() * HAIRS.length)],
    glasses: false,
    bag: null,
    umbrella: false,
    stripe: r() < 0.7 ? [0.72, 0.72, 0.78] : [0.8, 0.1, 0.1], // Nieten / Warnstreifen
    height: 1.0 + r() * 0.08,
    build: 1.05 + r() * 0.15,
  };
}

const rects = (zn, ids) => ids.map((id) => zn[id] && zn[id].rect).filter(Boolean);
const grow = (r, g) => ({ x0: r.x0 - g, z0: r.z0 - g, x1: r.x1 + g, z1: r.z1 + g });

/** Bereiche der Bande aus layout.city: allowed (Gasse, Hof, Feuertreppe), forbidden (Laden, Tür, feste Hindernisse), spots (Startpunkte). */
export function gangEnv(city) {
  const zn = city && city.zones;
  if (!zn || !zn.alley || !zn.yard || !zn.store) return null;
  const allowed = rects(zn, ['alley', 'yard', 'escape']);
  const solid = (city.colliders || []).filter((c) => c && c.kind !== 'escape' && !c.dynamic && (c.y1 === undefined || c.y1 > 0.4) && Number.isFinite(c.x0)).map((c) => ({ x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1 }));
  const shut = [...rects(zn, ['store', 'doorway']).map((r) => grow(r, WALL_GROW)), ...solid];
  const clear = (x, z) => !shut.some((r) => x > r.x0 - 0.7 && x < r.x1 + 0.7 && z > r.z0 - 0.7 && z < r.z1 + 0.7);
  const spots = [];
  const grid = (r, step) => {
    for (let x = r.x0 + 0.9; x <= r.x1 - 0.9; x += step) for (let z = r.z0 + 0.9; z <= r.z1 - 0.9; z += step) if (clear(x, z)) spots.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
  };
  grid(zn.alley.rect, 1.6); // Gassenmund bevorzugt (dichteres Raster)
  grid(zn.yard.rect, 3.2);
  return { allowed, forbidden: shut, spots };
}

export default {
  name: 'gang',
  init(ctx) {
    const env = gangEnv(ctx.layout && ctx.layout.city);
    const opts = ctx.opts || {};
    const off = !env || !env.spots.length || (opts.devFlags && opts.devFlags.npc === false);
    if (off) {
      const offProvider = ctx.provide('gang', { active: () => false, members: () => [], hit: () => false, role: () => 'local' });
      return { dispose() { offProvider(); } };
    }

    let disposed = false;
    let entered = false;
    let clockT = 0; // eigene Uhr (s)
    let members = []; // Logik-Rowdys (npc/gang-logic.js) mit Anzeigefeldern
    let curSeed = 0;
    let curTod = 'day';
    let planKey = '';
    let role = 'local';
    let lastGc = -1e9;
    let gsAcc = 0;
    let gsSig = ''; // Zustand der zuletzt gesendeten Bande
    let gsBeat = 0; // s seit dem letzten gs
    let hadOthers = false;
    let lastGs = null; // jüngster gs des Führers
    let lastGsT = -1e9;
    let appliedGs = null;
    let lastMyHit = -1e9;
    let foundFlee = false;
    let reserved = -1;
    let sentRelease = false;
    let koOff = null;
    let koTries = 0;
    let netBound = null; // fight-Anteil des Providers net, an dem die Hörer hängen
    let netOffs = [];
    let gangSayT = -1e9;

    const xrOn = () => !!(ctx.xr && ctx.xr.presenting && ctx.xr.presenting());
    const quality = () => (typeof ctx.quality === 'function' ? ctx.quality() : 'mid');
    const figCap = () => (quality() === 'low' ? 2 : GANG_MAX);
    const poseOf = () => { try { return ctx.player.getPose(); } catch { return null; } };
    const fightProv = () => ctx.use('fight');
    /** Weitere Mitspieler da? Ohne sie braucht niemand gs (Kontingent: allein ≈ 0 Sendungen). */
    const othersOn = () => { try { const n = ctx.use('net'); const l = n && typeof n.peers === 'function' ? n.peers() : null; return !!(l && l.length > 0); } catch { return false; } };
    const netFight = () => { const n = ctx.use('net'); return n && n.fight ? n.fight : null; };
    const myC = () => { const n = ctx.use('net'); const me = n && typeof n.me === 'function' ? n.me() : null; return me ? me.c : 0; };

    // ------------------------------------------------------------ Mitglieder
    function view(m) {
      m.fig = null;
      m.speaker = null;
      m.shown = m.st;
      m.px = m.x; m.pz = m.z; m.spd = 0;
      m.tx = m.x; m.tz = m.z; m.tyaw = m.yaw;
      m.tgt = 0;
      m.lockUntil = 0; m.striking = 0; m.hitT = -1e9; m.sayT = -1e9;
      m.anim = ''; m.lastA = 0;
      m.lastIdx = {};
      return m;
    }
    function destroyFig(m) {
      if (m.speaker) { try { m.speaker.release(); } catch { /* egal */ } m.speaker = null; }
      if (m.fig) {
        const f = m.fig;
        m.fig = null;
        if (!f.disposed) { try { f.dispose(); } catch (err) { warn('dispose', err); } }
      }
      m.anim = '';
    }
    function destroyAll() { for (const m of members) destroyFig(m); members = []; planKey = ''; foundFlee = false; }
    function setReserve(n) {
      if (n === reserved) return;
      const np = ctx.use('npc');
      if (np && typeof np.reserve === 'function') { try { np.reserve(n, 'gang'); reserved = n; } catch (err) { warn('reserve', err); } }
    }

    function wantPlan() {
      const w = ctx.use('weather');
      let tod = (w && TODS.includes(w.tod) ? w.tod : 'day');
      let seedBase = Date.now();
      try { const n = ctx.use('net'); const s = n && n.active && n.active() && typeof n.serverNow === 'function' ? n.serverNow() : null; if (Number.isFinite(s)) seedBase = s; } catch { /* lokale Uhr */ }
      let seed = Math.floor(seedBase / SLOT_MS) & 0xffffff;
      let n = spawnCount(tod, seed);
      if (opts.debug && Number.isFinite(opts.gang)) { n = clamp(Math.round(opts.gang), 0, GANG_MAX); tod = 'night'; seed = 1; }
      const dg = opts.dev && opts.dev.gang; // Harness ?gang=1|0|day (1.18.0)
      if (dg === '0') n = 0;
      else if (dg === '1') { n = 2; tod = 'night'; seed = 1; } else if (dg === 'day') n = Math.max(1, n);
      return { tod, seed, n: Math.min(n, figCap()) };
    }
    const allCalm = () => members.every((m) => m.st === 'idle');
    function rebuild(seed, n, tod) {
      destroyAll();
      curSeed = seed;
      curTod = tod;
      members = createGang(seed, n, env.spots).members.map(view);
    }
    function applyPlan() {
      const p = wantPlan();
      const key = `${p.tod}:${p.seed}:${p.n}`;
      if (key === planKey) return;
      if (members.length && !allCalm()) return; // mitten im Streit nicht neu würfeln
      rebuild(p.seed, p.n, p.tod);
      planKey = key;
    }

    // ------------------------------------------------------------ Sprüche
    function say(m, cat, force) {
      if (!m.fig) return;
      if (!force && (clockT - m.sayT < 2.5 || clockT - gangSayT < 1.2)) return;
      const L = pickLine(cat, Math.random, m.lastIdx[cat] ?? -1);
      if (!L) return;
      m.lastIdx[cat] = L.index;
      m.sayT = clockT;
      gangSayT = clockT;
      const np = ctx.use('npc');
      const bubble = () => { if (np && typeof np.say === 'function' && m.fig && !m.fig.disposed) { try { np.say(m.fig, L.text, 3800); } catch { /* egal */ } } };
      const c = ctx.use('cashier');
      if (!c || typeof c.speaker !== 'function') { bubble(); return; }
      try {
        if (!m.speaker) m.speaker = c.speaker({ id: `rowdy${m.i}`, voiceSeed: curSeed * 13 + m.i + 3, pitch: 0.72 + ((curSeed + m.i * 5) % 7) * 0.03, rate: 0.95 + ((curSeed + m.i * 3) % 5) * 0.03, prio: 1, pos: () => ({ x: m.x, y: 1.6, z: m.z }) });
        Promise.resolve(m.speaker.say(L.text)).then((r) => { if (r !== 'spoken') bubble(); }, bubble);
      } catch (err) { warn('say', err); bubble(); }
    }
    const play = (m, name, restart = true) => {
      if (!m.fig || m.fig.disposed) return;
      try { m.fig.setAnim(name, { restart, then: 'idle' }); } catch (err) { warn('anim', err); }
    };
    /** Zustandswechsel (Führer wie Mitläufer): Spruch und Pose. */
    function enter(m) {
      const st = m.st;
      m.shown = st;
      m.anim = '';
      if (st === 'taunt') { play(m, 'sleeves'); m.lockUntil = clockT + timedDuration('sleeves'); say(m, 'rowdyAccost', true); }
      else if (st === 'threaten') { play(m, 'threat'); m.lockUntil = clockT + timedDuration('threat'); say(m, 'rowdyThreat', true); }
      else if (st === 'attack') say(m, 'rowdyAttack');
      else if (st === 'flee') say(m, 'rowdyFlee', true);
      else if (st === 'beaten') { play(m, 'ko'); m.anim = 'ko'; }
      else if (st === 'idle') play(m, 'idle');
    }
    function swing(m) {
      m.striking = 0.5;
      m.lockUntil = clockT + 0.5;
      play(m, 'swing');
    }

    // ------------------------------------------------------------ Treffer auf Rowdys
    /** Schaden und Reaktion; Führer/lokal rechnen, byMe merkt die eigenen Treffer für die Entdeckung. */
    function applyHit(m, dmg, dir, byMe) {
      const ev = hitRowdy(m, dmg);
      const alive = m.st !== 'beaten' && m.st !== 'flee';
      if (alive && dmg > 0 && ['idle', 'approach', 'taunt', 'threaten'].includes(m.st)) m.st = 'attack';
      if (dir) { // kleiner Rückstoß, nur in erlaubter Fläche
        const nx = m.x + dir.x * 0.45; const nz = m.z + dir.z * 0.45;
        if (gangAreaOk(nx, nz, env.allowed, env.forbidden)) { m.x = nx; m.z = nz; }
      }
      m.striking = 0;
      if (m.fig && dir) { try { m.fig.hitReact(dir); } catch { /* egal */ } }
      if (byMe) lastMyHit = clockT;
      // Flucht/K.O. (ev gefüllt): den Wechsel meldet enter() im nächsten Schritt; sonst ein normaler Treffer-Spruch
      if (!ev.length && alive) say(m, 'rowdyHit');
      else if (m.st === 'beaten') say(m, 'rowdyHit', true);
    }
    function hitMember(i, weapon, dir) {
      const m = members[i];
      if (!m || xrOn() || !m.fig || clockT - m.hitT < 0.25) return false;
      const wid = typeof weapon === 'string' ? weapon : 'hand';
      if (wid === 'laser') return false;
      m.hitT = clockT;
      const l = dir ? Math.hypot(dir.x, dir.z) : 0;
      const d = l > 1e-4 ? { x: dir.x / l, z: dir.z / l } : { x: 0, z: -1 };
      const w = weaponInfo(wid);
      if (role === 'follower') {
        const fn = netFight();
        if (!fn || !fn.send('gh', { i, w: weaponIndex(wid) })) return false;
        lastMyHit = clockT;
        if (m.fig) { try { m.fig.hitReact(d); } catch { /* egal */ } }
        return true;
      }
      applyHit(m, w.dmg, d, true);
      return true;
    }
    function onGh(e) { // Führer: Treffer eines Mitspielers
      if (role !== 'leader' || !e) return;
      const m = members[e.i];
      if (!m || m.st === 'beaten') return;
      const fn = netFight();
      const pp = fn ? fn.peerPos(e.c) : null;
      let d = { x: 0, z: -1 };
      if (pp) { const dx = m.x - pp.x; const dz = m.z - pp.z; const l = Math.hypot(dx, dz) || 1; d = { x: dx / l, z: dz / l }; }
      applyHit(m, weaponInfo(WEAPON_BY_INDEX[e.w] || 'hand').dmg, d, false);
    }
    const onHitAction = (ev) => {
      if (disposed || !ev || !members.length || xrOn()) return false;
      const wid = typeof ev.weapon === 'string' ? ev.weapon : 'hand';
      if (wid === 'laser' || !ev.origin || !ev.dir) return false;
      const cands = [];
      members.forEach((m, i) => { if (m.fig && m.st !== 'beaten') cands.push({ x: m.x, z: m.z, i }); });
      const sel = selectTargets(ev.origin, ev.dir, cands, wid);
      let any = false;
      for (const s of sel) if (hitMember(s.cand.i, wid, { x: ev.dir.x, z: ev.dir.z })) any = true;
      return any;
    };
    let offHit = null;
    try { if (ctx.input && typeof ctx.input.onAction === 'function') offHit = ctx.input.onAction('hit', onHitAction, { prio: HIT_PRIO }); } catch (err) { warn('Aktion hit', err); }

    function checkDispersed() {
      if (foundFlee || !members.length || clockT - lastMyHit > 25) return;
      if (!members.every((m) => m.st === 'flee' || m.st === 'beaten')) return;
      foundFlee = true;
      const d = ctx.use('discover');
      if (d && typeof d.found === 'function') { try { d.found('gang-flee'); } catch (err) { warn('found', err); } }
    }

    // ------------------------------------------------------------ Netz
    function bindNet() {
      const fn = netFight();
      if (fn === netBound) return fn;
      for (const o of netOffs) { try { o(); } catch { /* egal */ } }
      netOffs = [];
      netBound = fn;
      if (fn) {
        netOffs.push(fn.on('gs', (e) => { if (e && fn.leader() === e.c && !fn.isLeader()) { lastGs = e; lastGsT = clockT; } }));
        netOffs.push(fn.on('gh', onGh));
      }
      return fn;
    }
    function decideRole(fn) {
      if (fn && fn.has()) {
        if (fn.isLeader()) return 'leader';
        if (fn.leader()) return 'follower';
      }
      return 'local';
    }
    function applyGs(e) {
      if (!e || e === appliedGs) return;
      appliedGs = e;
      if (e.seed !== curSeed || e.members.length !== members.length) {
        destroyAll();
        curSeed = e.seed;
        curTod = e.tod;
        members = e.members.map((d, i) => view(createRowdy(i, { x: d.x, z: d.z }, e.seed)));
        planKey = 'gs';
      }
      e.members.forEach((d, i) => {
        const m = members[i];
        if (!m) return;
        if (Math.hypot(d.x - m.x, d.z - m.z) > 3) { m.x = d.x; m.z = d.z; m.px = d.x; m.pz = d.z; m.yaw = d.yaw; }
        m.st = d.st; m.hp = d.hp; m.tgt = d.tgt;
        m.tx = d.x; m.tz = d.z; m.tyaw = d.yaw;
        if (d.a === 6 && m.lastA !== 6) swing(m);
        m.lastA = d.a;
      });
    }

    // ------------------------------------------------------------ Schritt
    function collectTargets(fn) {
      const out = [];
      const pose = poseOf();
      if (pose) {
        const fp = fightProv();
        out.push({ c: myC(), self: true, x: pose.x, z: pose.z, safe: !entered || !!(fp && typeof fp.protected === 'function' && fp.protected()) });
      }
      if (role === 'leader' && fn && fn.has()) {
        const n = ctx.use('net');
        const list = n && typeof n.peers === 'function' ? n.peers() : [];
        for (const p of list) {
          if (p.f & 8) continue; // VR: kein Ziel
          const pp = fn.peerPos(p.c);
          if (pp) out.push({ c: p.c, self: false, x: pp.x, z: pp.z, safe: false });
        }
      }
      return out;
    }
    function strike(m, e, target, fn) {
      if (!target) return;
      const dx = target.x - m.x; const dz = target.z - m.z;
      const l = Math.hypot(dx, dz) || 1;
      const dir = { x: dx / l, z: dz / l };
      swing(m);
      if (target.self) {
        const fp = fightProv();
        if (fp && typeof fp.hitPlayer === 'function') { try { fp.hitPlayer({ dmg: e.dmg, knock: dir, src: 'gang', from: { x: m.x, z: m.z } }); } catch (err) { warn('hitPlayer', err); } }
      } else if (fn) fn.send('fh', { c: target.c, w: 0, dir, src: 1, from: { x: m.x, z: m.z } });
    }
    function stepLogic(dt, fn) {
      if (role === 'follower') {
        const k = Math.min(1, dt * 9);
        for (const m of members) {
          m.x += (m.tx - m.x) * k;
          m.z += (m.tz - m.z) * k;
          m.yaw += wrapPi(m.tyaw - m.yaw) * k;
        }
        return;
      }
      const targets = entered ? collectTargets(fn) : [];
      for (const m of members) {
        let best = null;
        let bd = Infinity;
        for (const t of targets) {
          if (t.safe || !gangAreaOk(t.x, t.z, env.allowed, env.forbidden)) continue;
          const d = Math.hypot(t.x - m.x, t.z - m.z);
          if (d < bd) { bd = d; best = t; }
        }
        m.tgt = best ? best.c : 0;
        const evs = stepRowdy(m, dt, { allowed: env.allowed, forbidden: env.forbidden, player: best ? { x: best.x, z: best.z, safe: false } : null });
        for (const e of evs) if (e.type === 'strike') strike(m, e, best, fn);
      }
    }

    function onKO() {
      let near = null;
      let nd = 10;
      const pose = poseOf();
      for (const m of members) {
        if (!['attack', 'threaten', 'taunt'].includes(m.st) || !m.fig || !pose) continue;
        const d = Math.hypot(pose.x - m.x, pose.z - m.z);
        if (d < nd) { nd = d; near = m; }
      }
      if (near) say(near, 'rowdyWin', true);
      if (role !== 'follower') for (const m of members) if (m.st === 'attack' || m.st === 'threaten' || m.st === 'taunt' || m.st === 'approach') { m.st = 'idle'; m.t = 0; }
    }
    function tryBindKO() {
      if (koOff || koTries > 40) return;
      const fp = fightProv();
      if (!fp || typeof fp.onKO !== 'function') { koTries++; return; }
      try { koOff = fp.onKO(onKO); } catch (err) { warn('onKO', err); koTries = 99; }
    }

    // ------------------------------------------------------------ Figuren
    /** Tempo-Glättung und Hieb-Abklingen für ALLE Mitglieder, unabhängig von der Figur (sonst bleibt a=6 im gs hängen). */
    function decayMembers(dt) {
      for (const m of members) {
        const inst = dt > 0 ? Math.hypot(m.x - m.px, m.z - m.pz) / dt : 0;
        m.spd += (Math.min(inst, 8) - m.spd) * Math.min(1, dt * 6);
        m.px = m.x; m.pz = m.z;
        if (m.striking > 0) m.striking = Math.max(0, m.striking - dt);
      }
    }
    function renderFigures() {
      const np = ctx.use('npc');
      const cam = ctx.camera && ctx.camera.position;
      if (!np || typeof np.figure !== 'function' || !cam) return;
      const cityP = ctx.use('city');
      const vis = cityP && cityP.visible ? cityP.visible() : null;
      const areas = ctx.use('areas');
      const cands = [];
      members.forEach((m, i) => {
        const d = Math.hypot(cam.x - m.x, cam.z - m.z);
        let area = 'street';
        if (areas && areas.at) { try { area = areas.at(m.x, m.z, 0) || 'street'; } catch { area = 'street'; } }
        const ok = d <= (m.fig ? FAR_M : NEAR_M) && (!vis || regionVisible(area, vis));
        if (ok) cands.push({ i, d });
      });
      cands.sort((a, b) => a.d - b.d);
      const chosen = new Set(cands.slice(0, figCap()).map((c) => c.i));
      let figs = 0;
      members.forEach((m, i) => {
        if (!chosen.has(i)) { if (m.fig) destroyFig(m); return; }
        if (!m.fig) {
          try { m.fig = np.figure({ look: rowdyLook(curSeed, m.i), parent: ctx.scene, pos: { x: m.x, y: 0, z: m.z }, yaw: m.yaw }); } catch (err) { warn('figure', err); m.fig = null; }
          if (m.fig) { m.shown = m.st; m.anim = ''; if (m.st === 'beaten') { play(m, 'ko'); m.anim = 'ko'; } }
        }
        if (!m.fig) return;
        figs++;
        const f = m.fig;
        f.root.position.set(m.x, 0, m.z);
        f.root.rotation.y = m.yaw;
        if (m.st === 'beaten') { if (m.anim !== 'ko') { play(m, 'ko'); m.anim = 'ko'; } return; }
        if (clockT < m.lockUntil) return;
        const name = m.spd > 2.2 ? 'run' : m.spd > 0.3 ? 'walk' : 'idle';
        if (m.anim !== name || name !== 'idle') { try { f.setAnim(name, { speed: m.spd, restart: false, then: 'idle' }); } catch (err) { warn('anim', err); } m.anim = name; }
      });
      setReserve(figs);
    }

    // ------------------------------------------------------------ Provider
    const provider = {
      active: () => members.length > 0,
      members: () => members.map((m, i) => ({ i, handle: m.fig, st: m.st, hp: m.hp, pos: { x: m.x, z: m.z } })),
      hit: (i, weapon, dir) => hitMember(i, weapon, dir),
      role: () => role,
    };
    const removeProvider = ctx.provide('gang', provider);
    const offEnter = typeof ctx.on === 'function' ? ctx.on('enter', () => { entered = true; }) : null;

    function releaseLead(fn) {
      if (role === 'leader' && fn && !sentRelease) { fn.send('gr', {}); sentRelease = true; }
    }

    return {
      update(dt) {
        if (disposed) return;
        dt = Math.min(Math.max(dt || 0, 0), 0.1);
        clockT += dt;
        tryBindKO();
        const fn = bindNet();
        if (xrOn()) { // VR: keine Bande, keine Angriffe
          releaseLead(fn);
          if (members.length) destroyAll();
          setReserve(0);
          return;
        }
        const next = decideRole(fn);
        if (next !== role) {
          if (next !== 'leader') sentRelease = false;
          if (role === 'follower' && members.length) { const p = wantPlan(); planKey = `${p.tod}:${p.seed}:${p.n}`; } // Führer weg: die gespiegelte Bande bleibt, bis die eigene Uhr einen neuen Plan verlangt
          role = next;
          gsAcc = 0; gsSig = ''; gsBeat = 0; hadOthers = false;
          if (role === 'follower') appliedGs = null;
        }
        if (role === 'follower') {
          if (lastGs && lastGs.c === (fn && fn.leader())) { applyGs(lastGs); }
          if (clockT - lastGsT > STALE_S && members.length) destroyAll(); // Führer schweigt: Bande weg, bis er wieder sendet oder die Führung frei wird
        } else {
          applyPlan();
          if (role === 'local' && fn && fn.has() && members.length && clockT - lastGc > 1.5 && othersOn()) {
            const pose = poseOf();
            if (pose && members.some((m) => Math.hypot(pose.x - m.x, pose.z - m.z) < LEAD_NEAR_M)) { lastGc = clockT; fn.send('gc', {}); }
          }
        }
        stepLogic(dt, fn);
        for (const m of members) if (m.st !== m.shown) enter(m);
        if (role === 'leader' && fn) {
          if (!members.length) releaseLead(fn);
          else {
            gsAcc += dt;
            gsBeat += dt;
            if (gsAcc >= GS_EVERY_S) {
              const others = othersOn();
              const out = members.map((m) => ({ st: m.st, x: m.x, y: 0, z: m.z, yaw: m.yaw, a: netAnim(m.st, m.spd, m.striking > 0), tgt: m.tgt, hp: m.hp }));
              const sig = curSeed + ':' + phaseOf(curTod) + ':' + out.map((m) => [m.st, Math.round(m.x * 100), Math.round(m.z * 100), Math.round(m.yaw * 100), m.a, m.tgt, m.hp].join(',')).join(';');
              // nur mit Mitspielern UND bei geänderter Bande (6/s); sonst Herzschlag, damit die Führung nicht verfällt; neuer Mitspieler = sofort
              const due = others ? (sig !== gsSig || !hadOthers || gsBeat >= GS_BEAT_S) : gsBeat >= GS_BEAT_S;
              hadOthers = others;
              if (due) {
                gsAcc = 0;
                if (fn.send('gs', { g: fn.gen(), phase: phaseOf(curTod), seed: curSeed, members: out })) { gsSig = sig; gsBeat = 0; }
              } else gsAcc = GS_EVERY_S; // beim nächsten Schritt erneut prüfen, ohne den Takt zu verlieren
            }
          }
        }
        checkDispersed();
        decayMembers(dt);
        renderFigures();
      },
      onSuspend() { for (const m of members) destroyFig(m); setReserve(0); releaseLead(netFight()); },
      dispose() {
        if (disposed) return;
        disposed = true;
        releaseLead(netFight());
        if (offHit) { try { offHit(); } catch { /* egal */ } }
        if (koOff) { try { koOff(); } catch { /* egal */ } }
        if (offEnter) { try { offEnter(); } catch { /* egal */ } }
        for (const o of netOffs) { try { o(); } catch { /* egal */ } }
        netOffs = [];
        destroyAll();
        setReserve(0);
        removeProvider();
      },
    };
  },
};
