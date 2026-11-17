// VIDEOTHEK LENZ · Mehrspieler: Namensschilder über Fremdfiguren. 2D: ein DOM-Element `.lfx-mp-tag` je sichtbarer Figur (pointer-events:none,
// nur textContent, projiziert wie npc/bubbles.js); VR: 3D-Schild über fig.setName() NUR bei presenting, höchstens `tag3d` Stück.
// Das Aussehen (Schrift, Hintergrund) steht in css/themes/store/net.css; inline nur Lage und pointer-events.
//   createTags(ctx) → { sync(items, lod), update(), clear(), dispose(), stats() }
//   items: [{ c, fig, text, dist }]  (nur Figuren, die ein Schild zeigen dürfen: Name-Flag gesetzt, sichtbar)
//   lod: { tagDist, tag3d, tag3dDist } aus peers-logic lodFor().
import { Vector3 } from 'three';

const tmp = new Vector3();

export function createTags(ctx) {
  const host = ctx.renderer && ctx.renderer.domElement && ctx.renderer.domElement.parentNode;
  const tags = new Map(); // c → { el, fig, text, dom (aktiv), name3d }
  const xrOn = () => !!(ctx.xr && ctx.xr.presenting());

  function makeEl() {
    const el = document.createElement('div');
    el.className = 'lfx-mp-tag' + (ctx.isTouch ? ' is-touch' : '');
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    el.style.pointerEvents = 'none';
    el.style.whiteSpace = 'nowrap';
    if (host) host.appendChild(el);
    return el;
  }
  function untag3d(t) {
    if (t.name3d && t.fig && !t.fig.disposed) { try { t.fig.setName(null); } catch { /* egal */ } }
    t.name3d = '';
  }
  function remove(c) {
    const t = tags.get(c);
    if (!t) return;
    untag3d(t);
    if (t.el.parentNode) t.el.parentNode.removeChild(t.el);
    tags.delete(c);
  }

  return {
    /** Schilder neu bewerten (mit der Figurenbewertung, nicht jeden Frame). */
    sync(items, lod) {
      const xr = xrOn();
      const seen = new Set();
      const list = Array.isArray(items) ? items.filter((i) => i && i.fig && !i.fig.disposed && i.text) : [];
      let allow3d = null;
      if (xr) {
        const n = Math.max(0, (lod && lod.tag3d) | 0);
        const d3 = (lod && lod.tag3dDist) || 0;
        allow3d = new Set(list.filter((i) => i.dist <= d3).sort((a, b) => a.dist - b.dist).slice(0, n).map((i) => i.c));
      }
      for (const it of list) {
        let t = tags.get(it.c);
        if (!t) { t = { el: makeEl(), fig: it.fig, text: '', dom: false, name3d: '' }; tags.set(it.c, t); }
        if (t.fig !== it.fig) { untag3d(t); t.fig = it.fig; }
        seen.add(it.c);
        if (xr) {
          t.dom = false;
          t.el.hidden = true;
          if (allow3d.has(it.c)) {
            if (t.name3d !== it.text) { it.fig.setName(it.text); t.name3d = it.text; }
          } else untag3d(t);
        } else {
          untag3d(t);
          t.dom = it.dist <= ((lod && lod.tagDist) || 0);
          if (t.text !== it.text) { t.el.textContent = it.text; t.text = it.text; }
          if (!t.dom) t.el.hidden = true;
        }
      }
      for (const c of [...tags.keys()]) if (!seen.has(c)) remove(c);
    },
    /** Pro Frame: aktive DOM-Schilder nachführen. */
    update() {
      if (xrOn()) return;
      const cam = ctx.camera;
      for (const t of tags.values()) {
        if (!t.dom) continue;
        const h = t.fig;
        if (!h || h.disposed || !h.root.visible) { t.el.hidden = true; continue; }
        h.headWorld(tmp);
        tmp.y += 0.12;
        tmp.project(cam);
        const on = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && tmp.y > -1.05 && tmp.y < 1.05;
        t.el.hidden = !on;
        if (on && host) {
          const w = host.clientWidth || window.innerWidth;
          const hh = host.clientHeight || window.innerHeight;
          t.el.style.transform = `translate(${((tmp.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * hh).toFixed(1)}px) translate(-50%, -100%)`;
        }
      }
    },
    clear() { for (const c of [...tags.keys()]) remove(c); },
    stats() {
      let dom = 0; let d3 = 0;
      for (const t of tags.values()) { if (t.dom && !t.el.hidden) dom++; if (t.name3d) d3++; }
      return { tags: tags.size, dom, d3 };
    },
    dispose() { for (const c of [...tags.keys()]) remove(c); },
  };
}
