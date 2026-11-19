// VIDEOTHEK LENZ · Modul `city`: legt die Außenwelt dauerhaft an (Fassade, Stadt, Nebel), teilt die Szene in Sichtbarkeits-Gruppen
// und liefert die Provider
//   'areas' { current() → Bereichsname, at(x,z,y), on(fn) → off }   fn(id, prev) bei jedem Bereichswechsel
//   'city'  { data (buildCity-Ergebnis), groups { street, palast, yard, palastInterior }, signals() → { main, side, walkMain, walkSide },
//             visible() → visibleGroups-Zustand, partition() }
// Welle 2 hängt Innenausbau/NPCs/Autos an `city.groups.*` (Sichtbarkeit steuert dieses Modul).
// Reihenfolge in modules/index.js: nach `sound`, vor `door`/`intro`/`daytime`.
import { Box3, Fog, Frustum, Group, Matrix4, Vector3 } from 'three';
import { getOutdoor, FAR_R } from './outdoor.js';
import { buildFacade } from '../world/build-facade.js';
import { buildCityMeshes } from '../world/build-city.js';
import { areaAt, visibleGroups, signalAt } from '../world/city.js';
import { presetFor } from '../engine/quality.js';
import { introWanted } from './m4-util.js';

const SHOP_NAMES = new Set(['room', 'signs', 'props']);

/** Öffnungen der Ladenfront (Tür + Schaufenster) als Boxen: nur durch sie sieht man von draußen in den Laden. */
export function frontOpenings(L) {
  const f = L.facade;
  if (!f || !f.door) return [];
  const z = L.d;
  const list = [{ x0: f.door.x0, x1: f.door.x1, y0: 0, y1: 2.4 }, ...(f.windows || []).map((w) => ({ x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1 }))];
  return list.map((o) => new Box3(new Vector3(o.x0, o.y0, z - 0.3), new Vector3(o.x1, o.y1, z + 0.3)));
}

/** Regal-Teilmeshes bei low jenseits dieser Entfernung (m) nicht zeichnen (Draw-Call-Budget ≤ 140). */
export const SHELF_FAR_LOW = 11;

/** Straßen-Detailmeshes: bei low aus dem Laden heraus (durch die Tür) und aus dem Hof nicht gezeichnet. */
const STREET_DETAIL = new Set(['city-marks', 'city-signal-poles', 'city-signal-lamps', 'city-signs', 'city-shopsigns', 'city-shopglass', 'city-fahrplan', 'city-litfass', 'city-decor', 'city-ped-lamps', 'city-street-props', 'city-lamps']);

/** Reichweite (m vor der Front), bis zu der die Regale durchs Fenster gezeichnet werden: low spart Draw-Calls. */
export const shelfRange = (level) => (level === 'low' ? 2.2 : level === 'ultra' ? 8 : 5);

/** Nebelbereich: Innenraum-Diagonale bleibt unberührt, Ende vor der Himmelskuppel (FAR_R). */
export function fogRange(preset, layout) {
  const diag = Math.hypot(layout.w || 0, layout.d || 0);
  const far = Math.min(FAR_R - 2, Math.max(preset.fogFar || 58, 0));
  const near = Math.min(far - 8, Math.max(preset.fogNear || 34, diag + 1));
  return { near, far };
}

/**
 * Nebelbereich bei Wetter-Nebel (fog 0..1, 1.19.0): draußen near 20 → 6 m, far 58 → 22 m (nie weiter als der Normalbereich `base`),
 * drinnen (Laden, Palast, Salon) und ohne Nebel unverändert.
 */
export function fogTarget(base, fog, indoor, out = {}) {
  const f = Number.isFinite(fog) ? Math.min(1, Math.max(0, fog)) : 0;
  if (indoor || f <= 0) { out.near = base.near; out.far = base.far; return out; }
  out.near = Math.min(base.near, 20 - 14 * f);
  out.far = Math.min(base.far, 58 - 36 * f);
  return out;
}
const INDOOR_AREAS = new Set(['shop', 'palastHall', 'palastFoyer', 'salon']);

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
    let fr = fogRange(presetFor(ctx.quality(), ctx.isPhone), L);
    const fog = new Fog(0x8cc4f2, fr.near, fr.far);
    ctx.scene.fog = fog;
    out.fog = fog;
    out.setPalette(out.tod, out.rain, out.wx);

    // --- Bereich und Sichtbarkeit ---
    const listeners = [];
    let area = 'shop';
    let vis = { shopShell: true, shelves: true, street: true, yard: false, palastInterior: false, salonInterior: false, palastExterior: true };
    let shopShell = null;
    let shelves = null;
    let xrOn = false;
    let acc = 1;
    let level = ctx.quality();
    const openings = L.city ? frontOpenings(L) : [];
    const frus = new Frustum();
    const pv = new Matrix4();
    let sees = true;
    let poseZ = 0;
    let sigAcc = 1;
    const fogTmp = { near: 0, far: 0 }; // wiederverwendetes Nebel-Ziel (kein Objekt pro Frame)

    function applyVisibility() {
      const all = xrOn;
      // Von draußen nur zeichnen, wenn Tür/Fenster im Bild sind (Regale zusätzlich nur nah davor, bei low kürzer)
      const out0 = area !== 'shop' && area !== 'doorway';
      if (shopShell) shopShell.visible = all || (vis.shopShell && (!out0 || sees));
      if (shelves) shelves.visible = all || (vis.shelves && (!out0 || (sees && poseZ - L.d < shelfRange(level))));
      if (cm) {
        cm.groups.street.visible = all || vis.street;
        cm.groups.yard.visible = all || vis.yard;
        cm.groups.palast.visible = true;
        cm.groups.palastInterior.visible = all || vis.palastInterior;
        cm.groups.salonInterior.visible = all || vis.salonInterior;
      }
    }

    const cp = new Vector3();
    /** Regal-Meshes ausblenden, die bei low weiter als SHELF_FAR_LOW von der Kamera stehen (sonst alle sichtbar). */
    function cullShelves() {
      if (cm) {
        const hide = ((level === 'low' && area === 'shop') || area === 'yard') && !xrOn; // aus dem Hof sieht man die Straße nicht (6 m hohe Wände)
        for (const m of cm.groups.street.children) if (STREET_DETAIL.has(m.name)) m.visible = !hide;
      }
      if (!shelves) return;
      const on = level === 'low' && shelves.visible;
      shelves.traverse((o) => {
        if (!o.isMesh) return;
        if (!on) { if (o.userData.lfxFar) { o.visible = true; o.userData.lfxFar = false; } return; }
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        const bs = o.geometry.boundingSphere;
        cp.copy(bs.center).applyMatrix4(o.matrixWorld);
        const far = cp.distanceTo(ctx.camera.position) - bs.radius * 0.5 > SHELF_FAR_LOW;
        if (far) { o.visible = false; o.userData.lfxFar = true; } else if (o.userData.lfxFar) { o.visible = true; o.userData.lfxFar = false; }
      });
    }

    function refresh() {
      const p = ctx.player.getPose();
      const y = Number.isFinite(p.y) ? p.y : 0;
      poseZ = p.z;
      const next = areaAt(L, p.x, p.z, y);
      vis = visibleGroups(L, next, p.x, p.z);
      const prev = area;
      area = next;
      applyVisibility();
      cullShelves();
      if (next !== prev) {
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
      /** Dieselben Werte ohne Kopie (nur lesen, nie behalten): für Frame-Pfade ohne Allokation. */
      visibleRef: () => vis,
      /** Wird die Ladenhülle (Innenraum samt Ultra-Innenraum) gerade gezeichnet? Allokationsfrei, pro Frame lesbar. */
      shellVisible: () => !shopShell || shopShell.visible !== false,
      /** Nach Bereich ein-/ausgeblendete Gruppen (Laden, Regale, Hof, Palast-/Salon-Innenraum): engine/warm.js zeichnet sie einmal auch im Ausgeblendeten vor. */
      warmRoots: () => [shopShell, shelves, ...(cm ? [cm.groups.yard, cm.groups.palastInterior, cm.groups.salonInterior] : [])].filter(Boolean),
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
        if (openings.length && !xrOn) { // Sicht durch die Ladenfront pro Bild prüfen (billig: wenige Boxen)
          const cam = ctx.camera;
          cam.updateMatrixWorld();
          pv.multiplyMatrices(cam.projectionMatrix, pv.copy(cam.matrixWorld).invert());
          frus.setFromProjectionMatrix(pv);
          const s2 = openings.some((b) => frus.intersectsBox(b));
          if (s2 !== sees) { sees = s2; applyVisibility(); }
        }
        if (acc >= 0.15) { acc = 0; refresh(); }
        // Wetter-Nebel: nur Fog-Parameter, weich in ~1 s (kein Neukompilieren)
        const wx = ctx.use('weather');
        const tg = fogTarget(fr, wx && wx.fog, INDOOR_AREAS.has(area), fogTmp);
        if (Math.abs(tg.near - fog.near) > 0.02 || Math.abs(tg.far - fog.far) > 0.02) {
          const k = 1 - Math.exp(-Math.min(dt, 0.25) * 3.5);
          fog.near += (tg.near - fog.near) * k;
          fog.far += (tg.far - fog.far) * k;
        }
        if (cm) cm.update(dt);
        sigAcc += dt;
        if (cm && sigAcc >= 0.25) { sigAcc = 0; cm.setSignals(signalAt(Date.now() / 1000)); }
      },
      onQuality(lv) {
        level = lv;
        cullShelves();
        fr = fogRange(presetFor(lv, ctx.isPhone), L);
        fog.near = fr.near;
        fog.far = fr.far;
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
