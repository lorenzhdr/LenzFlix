// VIDEOTHEK LENZ · VR-Laser: Strahl je Hand, Ziele (Panel > Hülle/Interaktion), Hervorhebung, Auslösen (Trigger/Pinch, Grip).
import { Raycaster, Vector3, Mesh, BoxGeometry, SphereGeometry, CylinderGeometry, MeshBasicMaterial, AdditiveBlending } from 'three';
import { pickCover, pickBoxes } from '../controls/pick.js';
import { slotWorld } from '../world/build-shelves.js';
import { vrHint } from './hud3d.js';

const COVER_REACH = 4;
const IA_REACH = 3;
const PANEL_REACH = 8;
const GRIP_REACH = 0.4;
const PICK_MS = 50;
const IDLE_MS = 300;
const SCROLL_PX_PER_S = 700;
const COLORS = { panel: 0xffd23f, panelIdle: 0x8f9bd8, cover: 0xffe9a0, ia: 0xff3d7f, wrist: 0xffd23f, none: 0x8f9bd8 };

/**
 * Ziel wählen (rein). Priorität: Handgelenk-Knopf (wenn näher als ein Panel) > Panel > Hülle/Interaktion (die nähere).
 * panelHit { t, panel, uv, hit }, coverHit { fv, info, t }, iaHit { ia, t }, wristHit = Abstand (Zahl) oder { t }.
 * @returns {{kind:'wrist'|'panel'|'cover'|'ia', t:number}|null}
 */
export function choose(panelHit, coverHit, iaHit, wristHit) {
  if (wristHit != null) {
    const wt = typeof wristHit === 'number' ? wristHit : wristHit.t;
    if (!panelHit || wt <= panelHit.t) return { kind: 'wrist', t: wt };
  }
  if (panelHit) return { kind: 'panel', ...panelHit };
  if (coverHit && (!iaHit || coverHit.t <= iaHit.t)) return { kind: 'cover', ...coverHit };
  if (iaHit) return { kind: 'ia', ...iaHit };
  return null;
}

const _sp = new Vector3();

/** Nächste Hülle im Radius r um p (Welt); { fv, info, d } oder null. */
export function nearestCover(faceViews, p, r = GRIP_REACH) {
  let best = null;
  const lim = (r + 1.2) * (r + 1.2);
  for (const fv of faceViews) {
    if (!fv.mesh) continue;
    const f = fv.face;
    const rx = p.x - f.x;
    const rz = p.z - f.z;
    if (rx * rx + rz * rz > lim) continue;
    for (const info of fv.infos) {
      if (info.hidden) continue;
      slotWorld(fv, info, _sp);
      const d = Math.hypot(_sp.x - p.x, _sp.y - p.y, _sp.z - p.z);
      if (d <= r && (!best || d < best.d)) best = { fv, info, d };
    }
  }
  return best;
}

/** Panel mit scrollbarer Liste? */
export function scrollable(panel) {
  const s = panel && panel.spec;
  const l = s && s.list;
  return !!(l && Array.isArray(l.rows) && l.rows.length > (l.visible || 6));
}

export class Pointer {
  constructor(mode) {
    this.mode = mode;
    this.rc = new Raycaster();
    this.blocks = { left: false, right: false };
    this.dirty = true;
    this.geos = [];
    this.mats = [];
    this.attached = false;
    this._o = new Vector3();
    this._d = new Vector3();
    this._pt = new Vector3();
  }

  mat(color, o = {}) {
    const m = new MeshBasicMaterial({ color, toneMapped: false, fog: false, ...o });
    this.mats.push(m);
    return m;
  }

  /** Visuals an die Strahlobjekte hängen (nach dem Anlegen der Quellen). */
  attach() {
    if (this.attached) return;
    this.attached = true;
    const laserGeo = new CylinderGeometry(0.0025, 0.0025, 1, 6, 1, true);
    laserGeo.rotateX(-Math.PI / 2);
    laserGeo.translate(0, 0, -0.5);
    const dotGeo = new SphereGeometry(0.009, 12, 8);
    const boxGeo = new BoxGeometry(1, 1, 1);
    this.geos.push(laserGeo, dotGeo, boxGeo);
    const storeScene = this.mode.app.engine.storeScene;
    for (const rec of this.mode.sources) {
      const laser = new Mesh(laserGeo, this.mat(COLORS.none, { transparent: true, opacity: 0.8, depthWrite: false }));
      laser.name = 'lfx-xr-laser';
      laser.renderOrder = 950; // nach den Panels (900), die keine Tiefe schreiben
      laser.frustumCulled = false;
      laser.visible = false;
      const dot = new Mesh(dotGeo, this.mat(COLORS.none, { depthTest: false }));
      dot.name = 'lfx-xr-laserdot';
      dot.renderOrder = 951;
      dot.visible = false;
      rec.ray.add(laser, dot);
      const hl = new Mesh(boxGeo, this.mat(0xffe9a0, { transparent: true, opacity: 0.3, depthWrite: false, blending: AdditiveBlending }));
      hl.name = 'lfx-xr-highlight';
      hl.renderOrder = 6;
      hl.visible = false;
      storeScene.add(hl);
      rec.pt = { laser, dot, hl, o: new Vector3(), d: new Vector3(0, 0, -1), at: -1e9, target: null, hover: null, len: -1, color: -1 };
    }
  }

  invalidate() { this.dirty = true; }

  /** Ziel der Hand ('left'|'right'|Index) für Diagnose/Tests. */
  targetOf(hand) {
    const rec = typeof hand === 'number' ? this.mode.sources[hand] : this.mode.recFor(hand);
    const t = rec && rec.pt ? rec.pt.target : null;
    if (!t) return null;
    return { kind: t.kind, t: t.t, id: t.info ? t.info.itemId : null, label: t.ia ? t.ia.label : null, hit: t.hit ? t.hit.kind : null };
  }

  rayOf(rec) {
    const ray = rec.ray;
    ray.updateWorldMatrix(true, false);
    this._o.setFromMatrixPosition(ray.matrixWorld);
    this._d.set(0, 0, -1).transformDirection(ray.matrixWorld);
    return { o: this._o, d: this._d };
  }

  raycastPanels(o, d) {
    let best = null;
    this.rc.set(o, d);
    this.rc.far = PANEL_REACH;
    for (const panel of this.mode.panels) {
      const mesh = panel.mesh;
      if (!mesh || !mesh.parent || !mesh.visible || !panel.open) continue;
      mesh.updateWorldMatrix(true, false);
      const hits = this.rc.intersectObject(mesh, false);
      const h = hits[0];
      if (h && h.uv && (!best || h.distance < best.t)) best = { t: h.distance, panel, uv: { x: h.uv.x, y: h.uv.y } };
    }
    if (best) best.hit = best.panel.hover(best.uv);
    return best;
  }

  canPickWorld() {
    const m = this.mode;
    const app = m.app;
    return app.mode === 'play' && !(app.mods && app.mods.locked) && !m.inCinema && !!app.shelves;
  }

  pick(rec, now) {
    const m = this.mode;
    const app = m.app;
    const pt = rec.pt;
    const { o, d } = this.rayOf(rec);
    pt.at = now;
    pt.o.copy(o);
    pt.d.copy(d);
    const panelHit = this.raycastPanels(o, d);
    let coverHit = null;
    let iaHit = null;
    if (this.canPickWorld()) {
      coverHit = pickCover(app.shelves.faceViews, o, d, COVER_REACH);
      iaHit = app.mods ? pickBoxes(app.mods.interactables, o, d, IA_REACH) : null;
    }
    let wristHit = null;
    if (m.wrist && rec.side !== 'left') wristHit = m.wrist.hit(o, d);
    // Hover-Zustand: Panel verlassen → Hervorhebung löschen
    const target = choose(panelHit, coverHit, iaHit, wristHit);
    const hov = target && target.kind === 'panel' ? target.panel : null;
    if (pt.hover && pt.hover !== hov && pt.hover.open) pt.hover.hover(null);
    pt.hover = hov;
    pt.target = target;
    return target;
  }

  clearRec(rec) {
    const pt = rec.pt;
    if (!pt) return;
    if (pt.hover && pt.hover.open) pt.hover.hover(null);
    pt.hover = null;
    pt.target = null;
    pt.at = -1e9;
    pt.laser.visible = false;
    pt.dot.visible = false;
    pt.hl.visible = false;
  }

  hideAll() {
    for (const rec of this.mode.sources) this.clearRec(rec);
    this.blocks.left = false;
    this.blocks.right = false;
    if (this.mode.hud3d) this.mode.hud3d.hideLabel();
  }

  update(dt, now) {
    const m = this.mode;
    if (!this.attached) return;
    const active = m.inputActive();
    this.blocks.left = false;
    this.blocks.right = false;
    if (!active) { this.hideAll(); return; }
    for (const rec of m.sources) {
      const pt = rec.pt;
      if (!pt) continue;
      if (!rec.source || !rec.ray.visible) { this.clearRec(rec); continue; }
      const { o, d } = this.rayOf(rec);
      const moved = o.distanceToSquared(pt.o) > 1.6e-5 || 1 - d.dot(pt.d) > 1.5e-6;
      const age = now - pt.at;
      if (this.dirty || age >= IDLE_MS || (moved && age >= PICK_MS)) this.pick(rec, now);
      this.render(rec);
      const tg = pt.target;
      if (tg && tg.kind === 'panel' && scrollable(tg.panel) && rec.side) {
        this.blocks[rec.side] = true;
        const sy = rec.pad ? rec.pad.stick.y : 0;
        if (sy) tg.panel.scroll(sy * SCROLL_PX_PER_S * dt);
      }
    }
    this.dirty = false;
    this.updateLabel();
  }

  render(rec) {
    const pt = rec.pt;
    const tg = pt.target;
    const m = this.mode;
    const len = tg ? Math.min(tg.t, PANEL_REACH) : 1.6;
    const color = !tg ? COLORS.none : tg.kind === 'panel' ? (tg.hit ? COLORS.panel : COLORS.panelIdle) : COLORS[tg.kind];
    pt.laser.visible = true;
    pt.laser.scale.set(1, 1, Math.max(0.02, len));
    if (color !== pt.color) {
      pt.color = color;
      pt.laser.material.color.setHex(color);
      pt.dot.material.color.setHex(color);
    }
    pt.laser.material.opacity = tg ? 0.9 : 0.45;
    pt.dot.visible = !!tg;
    if (tg) pt.dot.position.set(0, 0, -len);
    const hl = pt.hl;
    if (tg && tg.kind === 'cover' && !m.inCinema) {
      slotWorld(tg.fv, tg.info, hl.position, hl.quaternion);
      const h = tg.info.half;
      hl.scale.set(h ? h.x * 2 + 0.015 : 0.17, h ? h.y * 2 + 0.015 : 0.23, 0.05);
      hl.visible = true;
    } else hl.visible = false;
  }

  updateLabel() {
    const m = this.mode;
    const hud = m.hud3d;
    if (!hud) return;
    const order = m.aimHand === 'left' ? ['left', 'right'] : ['right', 'left'];
    for (const side of order) {
      const rec = m.recFor(side);
      const tg = rec && rec.pt ? rec.pt.target : null;
      if (!tg || tg.kind === 'panel') continue;
      let title = '';
      let hint = '';
      if (tg.kind === 'cover') {
        const it = m.app.items.get(tg.info.itemId);
        title = (it && it.Name) || '';
        hint = 'Trigger: Nehmen · Grip: Greifen';
      } else if (tg.kind === 'ia') {
        title = tg.ia.label || '';
        hint = vrHint(tg.ia.hint);
      } else if (tg.kind === 'wrist') { title = 'Menü'; hint = 'Trigger: Öffnen'; }
      const len = Math.min(tg.t, 4);
      this._pt.copy(rec.pt.o).addScaledVector(rec.pt.d, len);
      hud.setLabel(title, hint, this._pt);
      return;
    }
    hud.hideLabel();
  }

  /** Trigger/Pinch losgelassen→gedrückt: frisch zielen und auslösen. */
  trigger(rec, now) {
    const m = this.mode;
    if (!this.attached || !rec.pt || !rec.source) return;
    if (rec.side) m.aimHand = rec.side;
    const tg = this.pick(rec, now);
    const app = m.app;
    this.dirty = true;
    if (!tg) {
      if (m.inCinema && m.cinema && typeof m.cinema.onSelectEmpty === 'function') m.cinema.onSelectEmpty();
      return;
    }
    if (tg.kind === 'wrist') { m.openMenu(); return; }
    if (tg.kind === 'panel') { if (tg.hit) tg.panel.activate(tg.hit); return; }
    if (!this.canPickWorld()) return;
    if (tg.kind === 'cover') app.take(tg.info.itemId, { hand: rec.side || 'right' });
    else if (tg.kind === 'ia') { if (!tg.ia.enabled || tg.ia.enabled()) tg.ia.onUse(); }
  }

  /** Grip gedrückt: Hülle in Reichweite greifen. */
  grip(rec, now) {
    const m = this.mode;
    void now;
    if (!this.attached || !rec.source || !this.canPickWorld()) return;
    if (rec.side) m.aimHand = rec.side;
    const p = rec.source.hand ? this.rayOf(rec).o : rec.grip.getWorldPosition(this._pt);
    const hit = nearestCover(m.app.shelves.faceViews, p, GRIP_REACH);
    if (hit) m.app.take(hit.info.itemId, { hand: rec.side || 'right', grab: true });
  }

  dispose() {
    for (const rec of this.mode.sources) {
      const pt = rec && rec.pt;
      if (!pt) continue;
      if (pt.hover && pt.hover.open) { try { pt.hover.hover(null); } catch { /* egal */ } }
      pt.laser.removeFromParent();
      pt.dot.removeFromParent();
      pt.hl.removeFromParent();
      rec.pt = null;
    }
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.geos = [];
    this.mats = [];
    this.attached = false;
  }
}
