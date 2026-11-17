// VIDEOTHEK LENZ · Modul `city`: legt die Außenwelt dauerhaft an (Fassade, Stadt, Nebel), teilt die Szene in Sichtbarkeits-Gruppen
// und liefert die Provider
//   'areas' { current() → Bereichsname, at(x,z,y), on(fn) → off }   fn(id, prev) bei jedem Bereichswechsel
//   'city'  { data (buildCity-Ergebnis), groups { street, palast, yard, palastInterior }, signals() → { main, side, walkMain, walkSide },
//             visible() → visibleGroups-Zustand, partition() }
// Welle 2 hängt Innenausbau/NPCs/Autos an `city.groups.*` (Sichtbarkeit steuert dieses Modul).
// Reihenfolge in modules/index.js: nach `sound`, vor `door`/`intro`/`daytime`.
import { Fog, Group } from 'three';
import { getOutdoor, FAR_R } from './outdoor.js';
import { buildFacade } from '../world/build-facade.js';
import { buildCityMeshes } from '../world/build-city.js';
import { areaAt, visibleGroups, signalAt } from '../world/city.js';
import { presetFor } from '../engine/quality.js';
import { introWanted } from './m4-util.js';

const SHOP_NAMES = new Set(['room', 'signs', 'props']);

/** Nebelbereich: Innenraum-Diagonale bleibt unberührt, Ende vor der Himmelskuppel (FAR_R). */
export function fogRange(preset, layout) {
  const diag = Math.hypot(layout.w || 0, layout.d || 0);
  const far = Math.min(FAR_R - 2, Math.max(preset.fogFar || 58, 0));
  const near = Math.min(far - 8, Math.max(preset.fogNear || 34, diag + 1));
  return { near, far };
}

export default {
  name: 'city',
  init(ctx) {
    const L = ctx.layout;
    const out = getOutdoor(ctx);
    const opts = ctx.opts || {};
    if (!out.facade) out.facade = buildFacade(out, { shutter: introWanted(opts) });
    let cm = null;
    if (L.city) {
      cm = buildCityMeshes(out, L.city, L);
      out.city = cm;
    }

    // --- Nebel (dauerhaft: kein Umschalten, das Shader neu kompiliert) ---
    const fr = fogRange(presetFor(ctx.quality(), ctx.isPhone), L);
    const fog = new Fog(0x8cc4f2, fr.near, fr.far);
    ctx.scene.fog = fog;
    out.fog = fog;
    out.setPalette(out.tod, out.rain);

    // --- Bereich und Sichtbarkeit ---
    const listeners = [];
    let area = 'shop';
    let vis = { shopShell: true, shelves: true, street: true, yard: false, palastInterior: false, palastExterior: true };
    let shopShell = null;
    let shelves = null;
    let xrOn = false;
    let acc = 1;
    let sigAcc = 1;

    function applyVisibility() {
      const all = xrOn;
      if (shopShell) shopShell.visible = all || vis.shopShell;
      if (shelves) shelves.visible = all || vis.shelves;
      if (cm) {
        cm.groups.street.visible = all || vis.street;
        cm.groups.yard.visible = all || vis.yard;
        cm.groups.palast.visible = true;
        cm.groups.palastInterior.visible = all || vis.palastInterior;
      }
    }

    function refresh() {
      const p = ctx.player.getPose();
      const y = Number.isFinite(p.y) ? p.y : 0;
      const next = areaAt(L, p.x, p.z, y);
      vis = visibleGroups(L, next, p.x, p.z);
      applyVisibility();
      if (next !== area) {
        const prev = area;
        area = next;
        for (const fn of listeners.slice()) { try { fn(area, prev); } catch (err) { console.warn('[LenzFlix Store3D] areas', err); } }
      }
    }

    ctx.provide('areas', {
      current: () => area,
      at: (x, z, y) => areaAt(L, x, z, y || 0),
      on(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    });
    ctx.provide('city', {
      data: L.city,
      groups: cm ? cm.groups : null,
      signals: () => signalAt(Date.now() / 1000),
      visible: () => ({ ...vis }),
      /** Szene aufteilen (store.js ruft das nach mods.init): Laden-Hülle und Regale werden je Bereich ein-/ausgeblendet. */
      partition() {
        if (shopShell || !cm) { refresh(); return; }
        shopShell = new Group();
        shopShell.name = 'city-shopshell';
        shelves = new Group();
        shelves.name = 'city-shelves';
        const kids = ctx.scene.children.slice();
        for (const c of kids) {
          if (c.name === 'shelves') shelves.add(c);
          else if (SHOP_NAMES.has(c.name) || (c.name && c.name.startsWith('m3-'))) shopShell.add(c);
        }
        ctx.scene.add(shopShell, shelves);
        refresh();
      },
    });

    ctx.on('xr', (on) => { xrOn = !!on; applyVisibility(); });
    if (opts.debug) window.__lfxM4 = { ...window.__lfxM4, city: () => ({ area, vis, fog: { near: fog.near, far: fog.far } }) };
    if (cm) cm.setSignals(signalAt(Date.now() / 1000));

    return {
      update(dt) {
        out.follow(ctx.camera);
        acc += dt;
        if (acc >= 0.15) { acc = 0; refresh(); }
        sigAcc += dt;
        if (cm && sigAcc >= 0.25) { sigAcc = 0; cm.setSignals(signalAt(Date.now() / 1000)); }
      },
      onQuality(lv) {
        const r = fogRange(presetFor(lv, ctx.isPhone), L);
        fog.near = r.near;
        fog.far = r.far;
      },
      dispose() {
        if (ctx.scene.fog === fog) ctx.scene.fog = null;
        out.fog = null;
        if (out.facade) { out.facade.dispose(); out.facade = null; }
        if (cm) cm.dispose();
        if (window.__lfxM4) delete window.__lfxM4.city;
      },
    };
  },
};
