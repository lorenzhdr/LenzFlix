// VIDEOTHEK LENZ · Modul `discover`: Entdeckungen (Paket F). Provider 'discover'
//   found(id, opts?) → true wenn neu (Toast „Entdeckung n/19: Titel“ + Jingle; opts.silent unterdrückt beides) · has(id) · list() → [{id,found,title,desc,hint}]
//   (1.17.0) Konto: deps.profile.disc wird beim Start mit dem lokalen Speicher vereinigt, found() schreibt zusätzlich ins Profil.
//   summary() → { count, total, items } (Pause-Menü) · onChange(fn) → off · getNetState() → { found: [ids] } (Mehrspieler vorbereitet) · reset()
// Eigene Fundstücke: Goldene Kassette (Dach, Lüftungsbox, nur per Sprung/Klettern), Graffiti (Hinterhof, Hinsehen), lose Wandplatte
// (Nordwand neben der Personaltür), „roof“ (Dach betreten), „roof-rain“ (Dach, Regen, 20 bis 5 Uhr).
// Speicherung: localStorage lfx.store.discover.<userId|anon>, unabhängig von den Design-Einstellungen.
import { Vector3 } from 'three';
import { CATALOG, TOTAL, entryOf, isKnownId } from '../discover/catalog.js';
import { createDiscoverStore, parseFound } from '../discover/storage.js';
import { createGaze, isRoofRainNight } from '../discover/gaze.js';
import { buildVent, buildGoldenTape, buildGraffiti, buildPanel } from '../discover/scene.js';
import { ROOF_Y, areaAt } from '../world/city.js';
import { openPanel, h, button } from './m3-gfx.js';
import { hourOf } from './m4-util.js';

const VENT_H = 1.15;
const PANEL_DX = 2.8; // rechts neben der Personaltür
const ROOF_RAIN_SEC = 3;

function safeStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

export default {
  name: 'discover',
  init(ctx) {
    const L = ctx.layout;
    const user = ctx.deps && ctx.deps.user;
    const storage = safeStorage();
    let stamp = 0; // Zeitstempel für übernommene Konto-Funde (der Speicher setzt sonst „jetzt“)
    const store = createDiscoverStore({ storage, userId: user && (user.id || user.name), now: () => stamp || Date.now() });
    const prof = ctx.deps && ctx.deps.profile && typeof ctx.deps.profile.get === 'function' ? ctx.deps.profile : null;
    const changeFns = new Set();
    let disposed = false;
    const timers = [];
    const later = (fn, ms) => { const t = setTimeout(() => { if (!disposed) fn(); }, ms); timers.push(t); };

    /** Profil → lokal (leise, ohne Toast) und lokal → Profil; Ergebnis: neu lokal übernommene IDs. */
    function syncProfile() {
      if (!prof) return [];
      const added = [];
      let remote = {};
      try { remote = (prof.get() && prof.get().disc) || {}; } catch { remote = {}; }
      for (const id of Object.keys(remote)) {
        if (!isKnownId(id) || store.has(id)) continue;
        stamp = Number(remote[id]) > 0 ? Number(remote[id]) : 0;
        if (store.add(id)) added.push(id);
        stamp = 0;
      }
      let local = {};
      try { local = storage ? parseFound(storage.getItem(store.key)) : {}; } catch { local = {}; }
      const missing = Object.keys(local).filter((id) => isKnownId(id) && !remote[id]);
      if (missing.length && typeof prof.update === 'function') {
        try { prof.update((d) => { d.disc = d.disc && typeof d.disc === 'object' ? d.disc : {}; for (const id of missing) if (!d.disc[id]) d.disc[id] = local[id]; }); } catch { /* egal */ }
      }
      return added;
    }
    syncProfile();
    const offRemote = prof && typeof prof.onRemote === 'function' ? prof.onRemote(() => {
      if (disposed) return;
      const added = syncProfile();
      if (added.length) { const n = store.count(); for (const id of added) for (const fn of [...changeFns]) { try { fn(id, n); } catch { /* egal */ } } }
    }) : null;

    const items = () => CATALOG.map((e) => ({ id: e.id, found: store.has(e.id), title: e.title, desc: e.desc, hint: e.hint }));
    const api = {
      found(id, opts) {
        if (disposed || !store.add(id)) return false;
        const n = store.count();
        if (prof && typeof prof.update === 'function') {
          try { prof.update((d) => { d.disc = d.disc && typeof d.disc === 'object' ? d.disc : {}; if (!d.disc[id]) d.disc[id] = Date.now(); }); } catch { /* egal */ }
        }
        if (!(opts && opts.silent)) {
          const e = entryOf(id);
          try { ctx.xr.toast(`Entdeckung ${n}/${TOTAL}: ${e.title}`, 3800); } catch { /* egal */ }
          const snd = ctx.use('sound');
          if (snd) snd.play('discover');
          if (n === TOTAL) later(() => { try { ctx.xr.toast('Alle Entdeckungen gefunden! Richard ist beeindruckt. Ein bisschen.', 4500); } catch { /* egal */ } }, 3900);
        }
        for (const fn of [...changeFns]) { try { fn(id, n); } catch { /* egal */ } }
        return true;
      },
      has: (id) => store.has(id),
      list: items,
      summary: () => ({ count: store.count(), total: TOTAL, items: items() }),
      onChange(fn) { changeFns.add(fn); return () => changeFns.delete(fn); },
      getNetState: () => ({ found: store.ids() }),
      reset() {
        store.reset();
        if (prof && typeof prof.update === 'function') { try { prof.update((d) => { d.disc = {}; }); } catch { /* egal */ } } for (const fn of [...changeFns]) { try { fn(null, 0); } catch { /* egal */ } }
      },
    };
    const removeProvider = ctx.provide('discover', api);

    const city = ctx.use('city');
    const parent = (city && city.groups && city.groups.yard) || ctx.scene;
    const cleanups = [];
    const cd = L.city;
    let graffitiTarget = null;

    // --- Goldene Kassette auf der Lüftungsbox (Dach) ---
    let tape = null;
    if (cd) {
      const slot = cd.discoverSlots.find((s) => s.id === 'roofCenter');
      if (slot) {
        const rect = { x0: slot.x - 0.8, z0: slot.z - 0.6, x1: slot.x + 0.8, z1: slot.z + 0.6 };
        const vent = buildVent(rect, ROOF_Y, VENT_H);
        parent.add(vent);
        ctx.track(vent);
        const col = ctx.addCollider({ ...rect, y0: ROOF_Y, y1: ROOF_Y + VENT_H, kind: 'vent' });
        cleanups.push(() => ctx.removeCollider(col), () => vent.removeFromParent());
        if (!store.has('golden-tape')) {
          tape = buildGoldenTape();
          const ty = ROOF_Y + VENT_H + 0.28;
          tape.position.set(slot.x, ty, slot.z);
          parent.add(tape);
          ctx.track(tape);
          const rm = ctx.addInteractable({
            box: { min: { x: slot.x - 0.85, y: ROOF_Y + VENT_H, z: slot.z - 0.65 }, max: { x: slot.x + 0.85, y: ty + 0.45, z: slot.z + 0.65 } },
            label: 'Goldene Kassette',
            hint: 'E / Klick: Einsammeln',
            anyHeight: true,
            enabled: () => ctx.player.getY() > ROOF_Y + VENT_H - 0.4,
            onUse: () => {
              if (!tape) return;
              api.found('golden-tape');
              tape.removeFromParent();
              tape = null;
              rm();
            },
          });
          cleanups.push(rm, () => { if (tape) tape.removeFromParent(); });
        }
      }

      // --- Graffiti an der vorbereiteten Hofwand (layout.city.yard.graffiti, Blick nach +z) ---
      const g = cd.yard && cd.yard.graffiti;
      if (g) {
        const gw = g.w - 0.2;
        const gh = Math.min(gw / 2, g.h - 0.2); // Textur 2:1
        const gz = g.z + 0.08; // Fläche steht ca. 5 cm vor der Wand
        const gr = buildGraffiti({ x: g.x, y: g.y, z: gz }, gh * 2, gh, 0);
        parent.add(gr);
        ctx.track(gr);
        cleanups.push(() => gr.removeFromParent());
        graffitiTarget = { x: g.x, y: g.y, z: gz, normal: { x: 0, z: 1 } };
      }
    }

    // --- Lose Wandplatte neben der Personaltür ---
    const sz = L.zones && L.zones.staff;
    let panel = null;
    if (sz) {
      const px = sz.x + PANEL_DX;
      panel = buildPanel(px, 1.15);
      ctx.scene.add(panel);
      ctx.track(panel);
      let opened = api.has('secret-door');
      let fall = opened ? 1 : 0;
      let falling = false;
      if (opened) { panel.userData.recess.visible = true; panel.userData.plate.visible = false; }
      const openChamber = () => {
        if (ctx.xr.presenting()) {
          try { ctx.xr.toast('Hinter der Platte: alte Kassetten und ein Poster. Mehr dazu außerhalb von VR.', 4000); } catch { /* egal */ }
          return;
        }
        openPanel(ctx, {
          cls: 'lfx-store-staff', label: 'Geheimkammer',
          build(p, close) {
            const head = h('div', 'lfx-store-staff-head');
            head.append(h('div', 'lfx-store-staff-title', 'KAMMER'), h('div', 'lfx-store-staff-sub', 'Dahinter: der Fundus. Seit 1989 unberührt.'));
            const shelf = h('div', '');
            shelf.style.cssText = 'display:flex;gap:6px;justify-content:center;align-items:flex-end;margin:12px 0';
            const cols = ['#c4182b', '#2a6bd8', '#e8b020', '#2f9e5b', '#8b3bb8', '#e8742a'];
            cols.forEach((c, i) => {
              const stack = h('div', '');
              stack.style.cssText = 'display:flex;flex-direction:column;gap:2px';
              for (let k = 0; k < 2 + (i % 3); k++) {
                const t = h('div', '');
                t.style.cssText = `width:44px;height:14px;background:${c};border-radius:2px;transform:rotate(${(k % 2 ? 3 : -3)}deg);box-shadow:inset 0 -3px rgba(0,0,0,.25)`;
                stack.append(t);
              }
              shelf.append(stack);
            });
            const poster = h('div', '');
            poster.style.cssText = 'margin:8px auto;max-width:260px;padding:12px 14px;background:#f6efd6;color:#1c2a6b;border:3px solid #c4182b;text-align:center;font-weight:700;transform:rotate(-1.5deg)';
            poster.append(h('div', '', 'MITARBEITER DES MONATS'), h('div', '', 'Richard'), h('div', '', '(seit 1989)'));
            p.append(head, shelf, poster, h('div', 'lfx-store-staff-sub', 'Unter den Kassetten liegt ein Zettel: „Zurückspulen nicht vergessen.“'), button('Platte wieder andrücken', 'lfx-store-act lfx-store-staff-back', close));
          },
        });
      };
      let rmPanel = null;
      const mkPanelIa = () => {
        if (rmPanel) rmPanel();
        rmPanel = ctx.addInteractable({
          box: { min: { x: px - 0.5, y: 0.7, z: 0 }, max: { x: px + 0.5, y: 1.95, z: 0.45 } }, // bis über die Augenhöhe: auch bei geradem Blick anvisierbar
          label: opened ? 'Nische hinter der Wandplatte' : 'Lose Wandplatte',
          hint: opened ? 'E / Klick: Hineinschauen' : 'E / Klick: Wackeln',
          onUse: () => {
            if (opened) { openChamber(); return; }
            opened = true;
            falling = true;
            panel.userData.recess.visible = true;
            api.found('secret-door');
            mkPanelIa(); // Beschriftung wechselt auf „Hineinschauen“
            later(openChamber, 900);
          },
        });
      };
      mkPanelIa();
      cleanups.push(() => { if (rmPanel) rmPanel(); }, () => panel.removeFromParent());
      panel.userData.step = (dt) => {
        if (!falling) return;
        fall = Math.min(1, fall + dt * 1.6);
        panel.userData.plate.rotation.x = fall * 1.35;
        panel.userData.plate.position.y = -0.35 - fall * 0.28;
        if (fall >= 1) { falling = false; panel.userData.plate.visible = false; }
      };
    }

    // --- 1.18.0 „Neuer Schnitt“ (salon-first): erster Frisörstuhl. Das Salon-Modul setzt profile.evt.salonChair und sitting(); hier nur beobachten.
    //     Ist der Eintrag schon da (Konto-Altbestand), wird die Entdeckung leise nachgetragen. ---
    const salonSeen = () => {
      try { const sa = ctx.use('salon'); if (sa && typeof sa.sitting === 'function' && sa.sitting()) return true; } catch { /* egal */ }
      try { const e = prof && prof.get() && prof.get().evt; return !!(e && e.salonChair); } catch { return false; }
    };
    if (!api.has('salon-first') && prof) { try { const e = prof.get() && prof.get().evt; if (e && e.salonChair) api.found('salon-first', { silent: true }); } catch { /* egal */ } }

    // --- Dach-Funde und Hinseh-Erkennung ---
    const gaze = createGaze({ range: 4, dwell: 1.5 });
    const dir = new Vector3();
    const eye = { x: 0, y: 0, z: 0 };
    let roofRainT = 0;
    let acc = 0;

    return {
      update(dt, t) {
        if (disposed) return;
        if (tape) {
          tape.rotation.y = t * 1.6;
          tape.position.y = ROOF_Y + VENT_H + 0.28 + Math.sin(t * 2.2) * 0.04;
          if (tape.userData.glow) tape.userData.glow.material.opacity = 0.6 + 0.3 * Math.sin(t * 4);
        }
        if (panel && panel.userData.step) panel.userData.step(dt);
        acc += dt;
        if (acc < 0.1) return;
        const step = acc;
        acc = 0;
        if (!api.has('salon-first') && salonSeen()) api.found('salon-first');
        const pose = ctx.player.getPose();
        const area = areaAt(L, pose.x, pose.z, pose.y || 0);
        if (area === 'roof') {
          api.found('roof');
          const w = ctx.use('weather');
          const hour = w && Number.isFinite(w.hour) ? w.hour : hourOf();
          if (isRoofRainNight({ area, raining: !!(w && (w.wet !== undefined ? w.wet : w.raining)), hour })) {
            roofRainT += step;
            if (roofRainT >= ROOF_RAIN_SEC) api.found('roof-rain');
          } else roofRainT = 0;
        } else roofRainT = 0;
        if (graffitiTarget && !gaze.done && !api.has('graffiti') && (area === 'yard' || area === 'alley')) {
          ctx.camera.getWorldDirection(dir);
          eye.x = ctx.camera.position.x; eye.y = ctx.camera.position.y; eye.z = ctx.camera.position.z;
          if (gaze.step(step, eye, dir, graffitiTarget)) api.found('graffiti');
        } else if (!gaze.done) gaze.reset();
      },
      dispose() {
        disposed = true;
        timers.forEach(clearTimeout);
        for (const c of cleanups) { try { c(); } catch { /* egal */ } }
        changeFns.clear();
        if (offRemote) offRemote();
        removeProvider();
      },
    };
  },
};
