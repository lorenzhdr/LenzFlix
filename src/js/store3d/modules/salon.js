// VIDEOTHEK LENZ · Modul `salon` (1.17.0): begehbarer Friseursalon „FRISEUR HAARSCHARF“ (Nordseite, Gebäude SW), Innenraum, Gabi (Haare) und
// Ronny (Mode), Friseurstuhl mit Spiegel, Umkleide. Provider 'salon' (Vertrag .tmp/v117/contracts.md §5):
//   busy() → boolean (Stuhl-/Umkleide-Ablauf läuft) · inside() → boolean (Spieler im Bereich 'salon') · sitting() → boolean (sitzt im Stuhl)
// `sitting()` ist die Naht für net.js (Pose a=7 auf der Leitung, siehe Report); den Pose-Code setzt dort das Mehrspieler-Modul.
// Ablauf Stuhl: einfrieren → Kamerafahrt in den Spiegel → eigene Figur sitzt (selfview.playAnim('sit')) → avatar.openEditor('chair','hair',{live})
// → Kamera zurück, aufstehen. Umkleide: Vorhang zu → openEditor('booth','top'). In VR: Stuhl und Umkleide öffnen das „VR light“-Panel (xrchar).
// Fremde Provider (avatar, selfview, npc, cashier, sound, areas, xrchar) werden bei Gebrauch geholt und mit Guard benutzt.
// 1.18.0: Provokation (Schlag im Salon, nicht während salon.busy, nie in VR): Gabi droht mit dem Föhn (setHandItem 'dryer', Pose threat; beim 2. Schlag
// binnen 8 s auch Hieb), Ronny droht mit dem Kleiderbügel und schlägt (setHandItem 'hanger', Pose swing); Treffer über fight.hitPlayer({ dmg, knock, src: 'npc', from }).
// Gedächtnis/Abklingzeit in npc/aggro-logic.js, Sprüche aus char/salon-lines.js (threat, attack, struck, blinded). Laserblick: Pose cover 2 s.
import { buildSalon, drawPosterAtlas } from '../world/build-salon.js';
import { createMirror, MIRROR_RT } from '../world/mirror.js';
import { canvasTexture } from './m3-gfx.js';
import { FONT } from '../world/textures.js';
import { toRender } from '../char/look2.js';
import { npcCodes, VOICES, pickSalonLine } from '../char/salon-lines.js';
import { debugHook } from './m3-debug.js';
import { createAggro, provoke as aggroProvoke, stepAggro, AGGRO } from '../npc/aggro-logic.js';

const warn = (...a) => { try { console.warn('[LenzFlix Store3D]', ...a); } catch { /* egal */ } };
const GREET_GAP = 45; // s zwischen zwei Begrüßungen
const NEAR = 6.5; // m: so nah reagieren die beiden
const CURTAIN_S = 0.55; // s Vorhangfahrt
const MIRROR_RT_EDIT = 1024; // Auflösung des Spiegelbilds, solange das Live-Blatt offen ist (sonst 256: bei 40° und Vollbild sichtbar unscharf)
const FRAME = {
  chair: { yF: 1.02, h: 1.45, w: 0.8, camY: 1.3, dMin: 1.7, dMax: 3.0 }, // sitzend: Kopf + Oberkörper im Spiegel
  booth: { yF: 1.4, h: 1.0, w: 0.9, camY: 1.5, dMin: 1.5, dMax: 2.7 }, // stehend: Oberkörper im Spiegel
};

export default {
  name: 'salon',
  init(ctx) {
    const sa = ctx.layout && ctx.layout.city && ctx.layout.city.salon;
    let busy = false;
    let sitting = false;
    let disposed = false;
    let abort = null; // Aufräumer des laufenden Ablaufs
    const poseInside = () => {
      if (!sa) return false;
      const p = ctx.player.getPose();
      const r = sa.rect;
      return p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1 && !(p.y > 2.9);
    };
    const inside = () => {
      const a = ctx.use('areas');
      if (a && typeof a.current === 'function') return a.current() === 'salon';
      return poseInside();
    };
    const provider = { busy: () => busy, inside, sitting: () => sitting };
    const offProvider = ctx.provide('salon', provider);
    const cityP = ctx.use('city');
    const parent = cityP && cityP.groups ? cityP.groups.salonInterior : null;
    if (!sa || !parent) return { dispose() { offProvider(); } };

    // ------------------------------------------------------------ Hilfen
    const xr = () => !!(ctx.xr && ctx.xr.presenting && ctx.xr.presenting());
    const toast = (t) => { try { if (xr() && ctx.xr.toast) ctx.xr.toast(t); else ctx.deps.toast(t); } catch { /* egal */ } };
    const sfx = (name) => { const s = ctx.use('sound'); if (s && typeof s.play === 'function') { try { s.play(name); } catch { /* egal */ } } };
    const rand = Math.random;

    // ------------------------------------------------------------ Innenraum + Spiegel
    let posterMap = null;
    try { posterMap = canvasTexture(ctx, 512, 512, (g, w, h) => drawPosterAtlas(g, w, h, FONT)); } catch (err) { warn('salon posters', err); }
    const interior = buildSalon(sa, { posterMap });
    parent.add(interior.group);
    const rects = interior.colliders.map((c) => ctx.addCollider({ ...c }));
    const chairRect = rects[interior.colliders.indexOf(interior.chairCollider)];
    let chairParked = false;
    const mirrors = {
      chair: createMirror(ctx, { ...interior.mirrors.chair, parent, id: 'salon-chair' }),
      booth: createMirror(ctx, { ...interior.mirrors.booth, parent, id: 'salon-booth' }),
    };

    // ------------------------------------------------------------ Gabi und Ronny
    const codes = npcCodes();
    const people = {}; // { gabi: { handle, rect, off, speaker, last } }
    const av = () => ctx.use('avatar');
    function mountPerson(who, anchor) {
      const n = ctx.use('npc');
      if (!n || typeof n.figure !== 'function') return false;
      const handle = n.figure({ look: toRender(codes[who]), parent, pos: { x: anchor.x, z: anchor.z }, yaw: anchor.yaw });
      const rect = ctx.addCollider({ x0: anchor.x - 0.28, z0: anchor.z - 0.28, x1: anchor.x + 0.28, z1: anchor.z + 0.28, y1: 1.8, kind: 'npc', top: false });
      const off = typeof n.registerPerson === 'function' ? n.registerPerson({
        kind: `salon-${who}`, handle,
        onHit: (dir) => {
          handle.hitReact(dir);
          const l = pickSalonLine(who, 'hit', rand, people[who].lastIdx.hit ?? -1);
          if (l) { people[who].lastIdx.hit = l.index; handle.say(l.text, 3600); }
          sfx('oof');
          provoked(who);
        },
        onLaser: () => blinded(who),
      }) : () => {};
      people[who] = { handle, rect, off, speaker: null, speakerOf: null, lastIdx: {}, wave: 6 + rand() * 8, chat: 14 + rand() * 12, anchor, aggro: createAggro(who), strikeAt: null, coverAt: null };
      return true;
    }
    const mountAll = () => {
      if (!people.gabi) mountPerson('gabi', sa.gabi);
      if (!people.ronny) mountPerson('ronny', sa.ronny);
    };
    mountAll();

    // ------------------------------------------------------------ Provokation (1.18.0)
    let clockS = 0; // s aus dt
    const tooFar = (who, p) => Math.hypot(p.x - people[who].handle.root.position.x, p.z - people[who].handle.root.position.z) > AGGRO[who].reach;
    function provoked(who) {
      const p = people[who];
      if (!p || !p.handle || p.handle.disposed || busy || disposed || xr()) return;
      const act = aggroProvoke(p.aggro, clockS);
      if (!act) return;
      try { p.handle.setHandItem(AGGRO[who].item); p.handle.setAnim('threat', { restart: true }); } catch { /* egal */ }
      say(who, 'threat');
    }
    function strike(who) {
      const p = people[who];
      if (!p || !p.handle || p.handle.disposed) return;
      try { p.handle.setAnim('swing', { restart: true }); } catch { /* egal */ }
      say(who, 'attack');
      p.strikeAt = clockS + 0.22;
    }
    function landStrike(who) {
      const p = people[who];
      const f = ctx.use('fight');
      if (!p || !p.handle || p.handle.disposed || busy || xr() || !f || typeof f.hitPlayer !== 'function') return;
      const pl = ctx.player.getPose();
      if (tooFar(who, pl)) return;
      const dx = pl.x - p.handle.root.position.x;
      const dz = pl.z - p.handle.root.position.z;
      const l = Math.hypot(dx, dz) || 1;
      let ok;
      try { ok = f.hitPlayer({ dmg: AGGRO[who].dmg, knock: { x: dx / l, z: dz / l }, src: 'npc', from: { x: p.handle.root.position.x, z: p.handle.root.position.z } }); } catch { ok = false; }
      if (ok) sfx('slap');
    }
    function blinded(who) {
      const p = people[who];
      if (!p || !p.handle || p.handle.disposed || busy) return;
      try { p.handle.setAnim('cover', { restart: true }); } catch { /* egal */ }
      say(who, 'blinded');
      p.coverAt = clockS + 2;
    }
    function stepAggroAll(dt) {
      clockS += dt;
      for (const who of Object.keys(people)) {
        const p = people[who];
        if (!p || !p.handle || p.handle.disposed) continue;
        const a = stepAggro(p.aggro, clockS);
        if (a === 'swing') { if (!busy && !xr() && !tooFar(who, ctx.player.getPose())) strike(who); } else if (a === 'calm') { try { p.handle.setHandItem(null); } catch { /* egal */ } }
        if (p.strikeAt !== null && clockS >= p.strikeAt) { p.strikeAt = null; landStrike(who); }
        if (p.coverAt !== null && clockS >= p.coverAt) { p.coverAt = null; if (p.handle.anim.anim === 'cover') p.handle.setAnim('idle', { restart: true }); }
      }
    }

    /** Gabi während der Stuhl-Sitzung seitlich versetzen (sonst steht ihr Kopf im Spiegel genau über dem der Figur); on=false → Ausgangsplatz. */
    const GABI_SIDE = 0.45;
    function gabiAside(on) {
      const p = people.gabi;
      if (!p || !p.handle || p.handle.disposed) return;
      p.handle.root.position.x = p.anchor.x + (on ? GABI_SIDE : 0); // Kollider bleibt (Spieler sitzt eingefroren, kein Lauf möglich)
    }

    /** Zeile sprechen: Sprecher-Regie (cashier.speaker) wenn vorhanden, bei 'bubble' (oder ohne Regie) als Blase über der Figur. */
    function say(who, cat) {
      const p = people[who];
      if (!p || !p.handle || p.handle.disposed) return Promise.resolve('muted');
      const l = pickSalonLine(who, cat, rand, p.lastIdx[cat] ?? -1);
      if (!l) return Promise.resolve('muted');
      p.lastIdx[cat] = l.index;
      const bubble = () => { try { p.handle.say(l.text, 4200); } catch { /* egal */ } return 'bubble'; };
      const c = ctx.use('cashier');
      if (!c || typeof c.speaker !== 'function') return Promise.resolve(bubble());
      try {
        if (p.speakerOf !== c) {
          const v = VOICES[who];
          p.speaker = c.speaker({ id: who, voiceSeed: v.voiceSeed, pitch: v.pitch, rate: v.rate, prio: v.prio, gender: v.gender, pos: () => ({ x: p.handle.root.position.x, y: 1.6, z: p.handle.root.position.z }) });
          p.speakerOf = c;
        }
        if (!p.speaker || typeof p.speaker.say !== 'function') return Promise.resolve(bubble());
        return Promise.resolve(p.speaker.say(l.text)).then((r) => { if (r === 'bubble') bubble(); return r; }, () => bubble());
      } catch { return Promise.resolve(bubble()); }
    }

    // ------------------------------------------------------------ Ablauf (Stuhl / Umkleide)
    let lastTod = '';
    let curtainK = 0; // aktuell
    let curtainTo = 0;

    const eyeY = () => (typeof ctx.player.eyeY === 'function' ? ctx.player.eyeY() : 1.65);
    /** Kamera-Ziel am Austritt: Augenhöhe, waagerecht in Blickrichtung (passt zum Teleport mit Neigung 0). */
    const exitView = (e) => { const y = eyeY(); return { pos: { x: e.x, y, z: e.z }, target: { x: e.x - Math.sin(e.yaw) * 2, y, z: e.z - Math.cos(e.yaw) * 2 } }; };

    /** Gemeinsamer Rahmen: einfrieren, hineinfahren, `body()`, Kamera zurück, freigeben. Alles im finally. */
    async function session(kind) {
      const spot = kind === 'chair' ? interior.spots.chair : interior.spots.booth;
      const exit = kind === 'chair' ? interior.spots.chairExit : interior.spots.boothExit;
      const other = kind === 'chair' ? mirrors.booth : mirrors.chair;
      const sv = ctx.use('selfview');
      let done = false;
      let exited = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        abort = null;
        for (const mm of [mirrors.chair, mirrors.booth]) { if (typeof mm.setSize === 'function') mm.setSize(MIRROR_RT); }
        other.setSuppressed(false);
        sitting = false;
        // Abbruch/Fehler: Körper vor dem Zurücksetzen des Stuhl-Kollisionskörpers an den Austritt stellen (nicht in den Stuhl)
        if (!exited) { try { ctx.player.teleport(exit.x, exit.z, exit.yaw, 0); } catch { /* egal */ } exited = true; }
        if (kind === 'chair') {
          try { if (sv && sv.playAnim) sv.playAnim('idle'); } catch { /* egal */ }
          gabiAside(false);
          if (chairParked && chairRect) { ctx.moveCollider(chairRect, interior.chairCollider.x0, interior.chairCollider.z0, interior.chairCollider.x1, interior.chairCollider.z1); chairParked = false; }
        } else { curtainTo = 0; }
        try { ctx.player.camera.release(); } catch { /* egal */ }
        try { ctx.player.freeze(false); } catch { /* egal */ }
        busy = false;
      };
      let offFrame = () => {};
      let editing = false; // Editor dieser Sitzung offen
      // Abbruch (Suspend/Dispose): den Editor ohne Übernahme schließen (onClose der Figur beendet die Sitzung als Abbrechen)
      const abortAll = () => {
        offFrame(); offFrame = () => {};
        if (editing) { editing = false; try { ctx.overlay.close(); } catch { /* egal */ } }
        cleanup();
      };
      busy = true;
      abort = abortAll;
      let ok;
      try {
        ctx.player.freeze(true);
        other.setSuppressed(true);
        if (kind === 'chair') gabiAside(true);
        if (kind === 'chair' && chairRect) { ctx.moveCollider(chairRect, -9990, -9990, -9989, -9989); chairParked = true; }
        const fly = ctx.player.camera.flyTo(spot.camPos, spot.camTarget, 950);
        ctx.player.teleport(spot.x, spot.z, spot.yaw, 0);
        if (kind === 'chair') {
          sitting = true;
          try { if (sv && sv.playAnim) sv.playAnim('sit'); } catch { /* egal */ }
        } else { curtainTo = 1; sfx('whoosh'); }
        await fly;
        if (done || disposed) return;
        if (kind === 'chair') say('gabi', 'chair'); else say('ronny', 'booth');
        const a = av();
        if (!a || typeof a.openEditor !== 'function') { toast('Hier tut sich gerade nichts.'); return; }
        const live = ctx.quality() !== 'low' && !xr();
        const mir = mirrors[kind];
        if (live && mir && typeof mir.setSize === 'function') mir.setSize(MIRROR_RT_EDIT);
        const pr = kind === 'chair' ? a.openEditor('chair', 'hair', live ? { live: true } : undefined) : a.openEditor('booth', 'top', live ? { live: true } : undefined);
        editing = true;
        if (live) offFrame = startFrame(kind, spot);
        ok = await pr;
        editing = false;
        offFrame(); offFrame = () => {};
        if (done || disposed) return;
        if (ok) {
          const who = kind === 'chair' ? 'gabi' : 'ronny';
          say(who, kind === 'chair' ? 'chairDone' : 'boothDone');
          try { if (typeof a.markSeen === 'function') a.markSeen(who); } catch { /* egal */ }
        }
        if (kind === 'chair') noteFirstVisit();
        // aufstehen: Kamera zurück an die Austrittsstelle, dann Körper dorthin und freigeben
        if (kind === 'booth') curtainTo = 0;
        const ev = exitView(exit);
        await ctx.player.camera.flyTo(ev.pos, ev.target, 520);
        if (done || disposed) return;
        ctx.player.teleport(exit.x, exit.z, exit.yaw, 0);
        exited = true;
      } catch (err) {
        warn('salon', err);
      } finally {
        offFrame(); offFrame = () => {};
        cleanup();
      }
      return ok;
    }

    /**
     * Live-Blatt offen: Kamera so ausrichten, dass das Spiegelbild der eigenen Figur in der freien Fläche neben (Querformat) bzw. über (Hochformat)
     * dem Blatt liegt. Spiegelbild = Figurpunkt an der Spiegelebene gespiegelt; Kamera blickt senkrecht auf den Spiegel, Schwenk/Neigung legen
     * das Bild in die Mitte der freien Fläche. Bei Resize neu. Rückgabe: Aufräumer.
     */
    function startFrame(kind, spot) {
      const m = interior.mirrors[kind];
      const f = FRAME[kind];
      const cam = ctx.camera;
      const a = av();
      if (!m || !f || !cam || !a || typeof a.freeArea !== 'function') return () => {};
      let stopped = false;
      let raf = 0;
      const apply = (ms) => {
        raf = 0;
        if (stopped || disposed || xr()) return;
        let free;
        try { free = a.freeArea(); } catch { free = null; }
        if (!free) return;
        const asp = cam.aspect || 1.6;
        const tanH = Math.tan(((cam.fov || 40) * Math.PI) / 360);
        const nx = free.x0 + free.x1 - 1;
        const ny = 1 - (free.y0 + free.y1);
        const fw = free.x1 - free.x0;
        const fh = free.y1 - free.y0;
        const D = Math.max(f.dMin, Math.min(f.dMax, Math.max(f.h / (1.3 * fh * tanH), f.w / (1.5 * fw * tanH * asp))));
        const nX = Math.sin(m.yaw);
        const nZ = Math.cos(m.yaw);
        const side = (spot.x - m.x) * nX + (spot.z - m.z) * nZ; // Abstand der Figur zur Spiegelebene (vorn positiv)
        const P = { x: spot.x - 2 * side * nX, z: spot.z - 2 * side * nZ }; // Spiegelbild
        const C = { x: P.x + D * nX, z: P.z + D * nZ }; // Kamera davor, Blick entlang −n
        const cy = f.camY;
        const yaw0 = Math.atan2(-nX, -nZ); // Blickrichtung (−n) als Azimut für forward = (sin, ., cos)
        const psi = yaw0 + Math.atan(nx * tanH * asp);
        const pitch = Math.atan2(f.yF - cy, D) - Math.atan(ny * tanH);
        const fx = Math.cos(pitch) * Math.sin(psi);
        const fy = Math.sin(pitch);
        const fz = Math.cos(pitch) * Math.cos(psi);
        try { ctx.player.camera.flyTo({ x: C.x, y: cy, z: C.z }, { x: C.x + fx * 4, y: cy + fy * 4, z: C.z + fz * 4 }, ms); } catch (err) { warn('salon frame', err); }
      };
      const sched = (ms) => { if (!raf && !stopped) raf = requestAnimationFrame(() => requestAnimationFrame(() => apply(ms))); };
      const onResize = () => sched(1);
      window.addEventListener('resize', onResize);
      sched(650);
      return () => { stopped = true; if (raf) cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
    }

    function noteFirstVisit() {
      try {
        const pr = ctx.deps.profile;
        if (pr && typeof pr.update === 'function' && !(pr.get && pr.get().evt && pr.get().evt.salonChair)) pr.update((d) => { d.evt = d.evt || {}; if (!d.evt.salonChair) d.evt.salonChair = Date.now(); });
      } catch (err) { warn('salon profile', err); }
    }

    function vrLight() {
      const x = ctx.use('xrchar');
      let shown = false;
      try { shown = !!(x && typeof x.open === 'function' && x.open() !== false); } catch (err) { warn('xrchar', err); }
      if (!shown) toast('Die Figur-Auswahl für die VR-Brille ist gerade nicht verfügbar.');
    }

    function useChair() {
      if (busy || disposed) return;
      if (xr()) { vrLight(); return; }
      session('chair');
    }
    function useBooth() {
      if (busy || disposed) return;
      if (xr()) { vrLight(); return; }
      session('booth');
    }

    const removeIa = [
      ctx.addInteractable({ box: interior.ia.chair, label: 'Friseurstuhl', hint: 'E / Klick: Auf den Friseurstuhl', onUse: useChair, enabled: () => !busy }),
      ctx.addInteractable({ box: interior.ia.booth, label: 'Umkleide', hint: 'E / Klick: Umkleide', onUse: useBooth, enabled: () => !busy }),
    ];

    // ------------------------------------------------------------ Begrüßung, Leerlauf, Reaktionen
    let greetCool = 0;
    let wasInside = false;
    let reactT = 1;
    const offArea = (() => {
      const a = ctx.use('areas');
      if (!a || typeof a.on !== 'function') return () => {};
      return a.on((area, prev) => {
        if (area === 'salon' && prev !== 'salon') onEnter();
        else if (prev === 'salon' && area !== 'salon') onLeave();
      });
    })();
    const distTo = (who, p) => (people[who] ? Math.hypot(p.x - people[who].handle.root.position.x, p.z - people[who].handle.root.position.z) : 1e9);
    function nearer(p) { return distTo('gabi', p) <= distTo('ronny', p) ? 'gabi' : 'ronny'; }
    function onEnter() {
      if (greetCool > 0 || busy) return;
      greetCool = GREET_GAP;
      const who = rand() < 0.65 ? 'gabi' : 'ronny';
      say(who, 'greet');
      const p = people[who];
      if (p && p.handle.anim.anim === 'idle') p.handle.setAnim('wave', { restart: true });
    }
    function onLeave() {
      if (busy) return;
      const p = ctx.player.getPose();
      if (greetCool > GREET_GAP - 3) return; // gerade erst begrüßt
      if (rand() < 0.6) say(nearer(p), 'leave');
    }
    function react() {
      const a = av();
      if (!a || typeof a.changedFor !== 'function') return;
      const p = ctx.player.getPose();
      for (const who of ['gabi', 'ronny']) {
        if (!people[who] || distTo(who, p) > NEAR) continue;
        let ch;
        try { ch = !!a.changedFor(who); } catch { ch = false; }
        if (!ch) continue;
        // Art der Änderung kommt vom Avatar-Modul (nur Frisur/Haarfarbe/Bart → Haar-Spruch); unbekannt → Outfit
        let kind;
        try { kind = typeof a.changeKind === 'function' ? a.changeKind(who) : null; } catch { kind = null; }
        const cat = kind === 'hair' ? 'hairNew' : 'outfitNew';
        say(who, cat);
        try { if (typeof a.markSeen === 'function') a.markSeen(who); } catch { /* egal */ }
        return; // eine Reaktion pro Takt
      }
    }

    const offDbg = debugHook(ctx, 'salon', { chair: useChair, booth: useBooth, interior, mirrors, say });

    return {
      update(dt) {
        dt = Math.min(dt, 0.1);
        mountAll();
        stepAggroAll(dt);
        // Vorhang
        if (curtainK !== curtainTo) {
          const step = dt / CURTAIN_S;
          curtainK = curtainTo > curtainK ? Math.min(curtainTo, curtainK + step) : Math.max(curtainTo, curtainK - step);
          interior.setCurtain(curtainK);
        }
        const tod = (ctx.use('weather') || {}).tod || 'day';
        if (tod !== lastTod) { lastTod = tod; interior.setBrightness(tod === 'night' ? 0.62 : tod === 'dusk' ? 0.8 : 1); }
        mirrors.chair.update(dt);
        mirrors.booth.update(dt);
        greetCool = Math.max(0, greetCool - dt);
        const ins = inside();
        if (ins !== wasInside) { wasInside = ins; }
        if (!ins) return;
        const p = ctx.player.getPose();
        for (const who of ['gabi', 'ronny']) {
          const pp = people[who];
          if (!pp) continue;
          const d = distTo(who, p);
          if (d < 7 || sitting) pp.handle.lookAt(p.x, 1.6, p.z); else pp.handle.lookAt(null);
          if (busy) continue;
          pp.wave -= dt;
          pp.chat -= dt;
          if (d < 4 && pp.wave <= 0 && pp.handle.anim.anim === 'idle') { pp.handle.setAnim(rand() < 0.5 ? 'wave' : 'point', { restart: true }); pp.wave = 22 + rand() * 20; }
          if (d < 5 && pp.chat <= 0 && greetCool <= 0) { say(who, 'idle'); pp.chat = 28 + rand() * 25; }
        }
        reactT -= dt;
        if (reactT <= 0 && !busy) { reactT = 1.2; react(); }
      },
      onSuspend() { if (abort) abort(); },
      dispose() {
        disposed = true;
        if (abort) abort();
        offDbg();
        offArea();
        for (const r of removeIa) r();
        for (const who of Object.keys(people)) {
          const pp = people[who];
          try { pp.off(); } catch { /* egal */ }
          ctx.removeCollider(pp.rect);
          if (pp.speaker && typeof pp.speaker.cancel === 'function') { try { pp.speaker.cancel(); } catch { /* egal */ } }
          if (!pp.handle.disposed) pp.handle.dispose();
        }
        for (const r of rects) ctx.removeCollider(r);
        mirrors.chair.dispose();
        mirrors.booth.dispose();
        interior.dispose();
        offProvider();
      },
    };
  },
};
