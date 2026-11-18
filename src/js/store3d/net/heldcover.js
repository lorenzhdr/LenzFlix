// VIDEOTHEK LENZ · Mehrspieler: Hülle in der Hand einer Fremdfigur (three). Rechte-Filter (Vertrag lfx-mp.1 §10): über die Leitung geht nur
// die Item-ID; Cover zeigt dieser Client NUR, wenn die ID im EIGENEN Katalog (ctx.catalog.items) steckt, sonst eine neutrale Hülle.
// Draw-Calls: neutral = 1 (eine Box), mit Cover = 2 (Box + Fläche mit Cover). Texturen in einem LRU (höchstens 8 unbenutzte).
//   createHeldCover(ctx) → { set(c, fig, id, mode), clear(c), has(c), stats(), dispose() }
//   mode: 'none' (nichts) | 'neutral' | 'cover' (Cover nur mit Katalogtreffer, sonst neutral).
import { BoxGeometry, PlaneGeometry, Mesh, Group, MeshBasicMaterial } from 'three';
import { coverRef } from '../modules/m3-util.js';
import { HAND_R } from '../npc/figure.js';

const W = 0.135;
const H = 0.19;
const D = 0.016;
const SIDE = 0x23305a;
const NEUTRAL = 0x3a4a78; // wie physics/shapes.js tapeMesh
const LRU_MAX = 8;
const ID_RE = /^[0-9a-f]{32}$/;

export function createHeldCover(ctx) {
  let boxGeo = null;
  let planeGeo = null;
  let sideMat = null;
  let neutralMat = null;
  const lru = new Map(); // id → { tex, mat, refs, state: 'loading'|'ok'|'fail' } (Einfügereihenfolge = Alter)
  const held = new Map(); // c → { fig, id, mode, group, token, entry, plane, box }
  let disposed = false;
  let seq = 0;

  const catalogItem = (id) => {
    const it = ctx.catalog && ctx.catalog.items;
    if (!it || !ID_RE.test(id)) return null;
    return (it instanceof Map ? it.get(id) : it[id]) || null;
  };
  function geo() {
    if (!boxGeo) {
      boxGeo = new BoxGeometry(W, H, D);
      planeGeo = new PlaneGeometry(W * 0.94, H * 0.94);
      sideMat = new MeshBasicMaterial({ color: SIDE });
      neutralMat = new MeshBasicMaterial({ color: NEUTRAL });
    }
  }

  function evict() {
    if (lru.size <= LRU_MAX) return;
    for (const [id, e] of lru) {
      if (lru.size <= LRU_MAX) break;
      if (e.refs > 0 || e.state === 'loading') continue;
      lru.delete(id);
      if (e.tex) e.tex.dispose();
      if (e.mat) e.mat.dispose();
    }
  }
  function release(entry) { if (entry) entry.refs = Math.max(0, entry.refs - 1); }

  function entryFor(id, it) {
    let e = lru.get(id);
    if (e) { lru.delete(id); lru.set(id, e); return e; } // als jüngster neu einreihen
    e = { tex: null, mat: null, refs: 0, state: 'loading', waiters: [] };
    lru.set(id, e);
    const url = (() => { try { const ref = coverRef(it); return ctx.deps.imageUrl(ref.id, { type: 'Primary', maxWidth: 160, tag: ref.tag }) || ''; } catch { return ''; } })();
    const done = (tex) => {
      if (disposed) { if (tex) tex.dispose(); return; }
      if (tex) { e.tex = tex; e.mat = new MeshBasicMaterial({ map: tex }); e.state = 'ok'; } else e.state = 'fail';
      for (const fn of e.waiters.splice(0)) fn(e);
      evict();
    };
    if (!url || typeof ctx.loadTexture !== 'function') done(null);
    else Promise.resolve(ctx.loadTexture(url, { maxWidth: 160 })).then(done, () => done(null));
    evict();
    return e;
  }

  function drop(c) {
    const h = held.get(c);
    if (!h) return;
    held.delete(c);
    h.token = -1;
    release(h.entry);
    if (h.group.parent) h.group.parent.remove(h.group);
  }

  function build(c, fig, id, mode) {
    geo();
    const group = new Group();
    group.name = 'lfx-mp-held';
    const box = new Mesh(boxGeo, neutralMat);
    group.add(box);
    // Hand am rechten Arm (Bone hängt nach unten, Vorderseite = −z der Figur)
    group.position.set(HAND_R.offset[0], HAND_R.offset[1], HAND_R.offset[2]);
    group.rotation.set(0, 0, 0);
    const arm = fig.bones && fig.bones[HAND_R.bone];
    (arm || fig.root).add(group);
    const h = { fig, id, mode, group, box, plane: null, entry: null, token: ++seq };
    held.set(c, h);
    if (mode === 'cover') {
      const it = catalogItem(id); // Rechte-Filter: nur der eigene Katalog
      if (it) {
        const e = entryFor(id, it);
        e.refs++;
        h.entry = e;
        const apply = () => {
          if (h.token < 0 || !held.has(c) || held.get(c) !== h || e.state !== 'ok') return;
          box.material = sideMat;
          const plane = new Mesh(planeGeo, e.mat);
          plane.position.set(0, 0, -D / 2 - 0.0008);
          plane.rotation.y = Math.PI; // Vorderseite nach −z
          group.add(plane);
          h.plane = plane;
        };
        if (e.state === 'ok') apply();
        else if (e.state === 'loading') e.waiters.push(apply);
      }
    }
    return h;
  }

  return {
    /** Hülle an die Hand der Figur hängen (oder wechseln/entfernen). id = Item-ID | null. */
    set(c, fig, id, mode) {
      if (disposed) return;
      const wantId = id && ID_RE.test(id) ? id : null;
      if (!fig || fig.disposed || !wantId || mode === 'none' || (mode !== 'neutral' && mode !== 'cover')) { drop(c); return; }
      const h = held.get(c);
      if (h && h.fig === fig && h.id === wantId && h.mode === mode) return;
      drop(c);
      build(c, fig, wantId, mode);
    },
    clear(c) { drop(c); },
    has: (c) => held.has(c),
    stats() {
      let withCover = 0;
      for (const h of held.values()) if (h.plane) withCover++;
      return { held: held.size, withCover, textures: lru.size };
    },
    dispose() {
      if (disposed) return;
      for (const c of [...held.keys()]) drop(c);
      disposed = true;
      for (const e of lru.values()) { if (e.tex) e.tex.dispose(); if (e.mat) e.mat.dispose(); }
      lru.clear();
      if (boxGeo) boxGeo.dispose();
      if (planeGeo) planeGeo.dispose();
      if (sideMat) sideMat.dispose();
      if (neutralMat) neutralMat.dispose();
      boxGeo = null; planeGeo = null; sideMat = null; neutralMat = null;
    },
  };
}
