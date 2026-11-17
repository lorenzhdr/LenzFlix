// VIDEOTHEK LENZ · Sprechblasen der NPC (kleiner Pool aus 3 DOM-Blasen mit der Klasse `lfx-store-bubble`, projiziert; in VR die 3D-Blase
// aus ctx.xr.bubble()). Eine Blase gehört zu einer Figur; ist sie außerhalb des Bildes oder zu weit weg, wird sie nicht gezeigt (anders als
// Richards Randblase). show(handle, text, ms) → true wenn gezeigt. update(dt) projiziert nach, Dispose räumt alles auf.
import { Vector3 } from 'three';

const POOL = 3;
const MAX_DIST = 14;
const tmp = new Vector3();

export function createBubbles(ctx) {
  const host = ctx.renderer && ctx.renderer.domElement && ctx.renderer.domElement.parentNode;
  const slots = [];
  const xrOn = () => !!(ctx.xr && ctx.xr.presenting());
  function slot() {
    for (const s of slots) if (!s.handle) return s;
    if (slots.length < POOL) {
      const el = document.createElement('div');
      el.className = 'lfx-store-bubble is-npc' + (ctx.isTouch ? ' is-touch' : '');
      el.hidden = true;
      el.setAttribute('role', 'status');
      const txt = document.createElement('span');
      txt.className = 'lfx-store-bubble-text';
      el.appendChild(txt);
      if (host) host.appendChild(el);
      const s = { el, txt, handle: null, left: 0, b3d: null };
      slots.push(s);
      return s;
    }
    // ältesten Platz recyceln
    return slots.slice().sort((a, b) => a.left - b.left)[0];
  }
  function free(s) {
    s.handle = null;
    s.left = 0;
    s.el.hidden = true;
    if (s.b3d) s.b3d.hide();
  }
  function place(s) {
    const h = s.handle;
    if (!h || h.disposed || !h.root.visible) { free(s); return; }
    h.headWorld(tmp);
    const cam = ctx.camera;
    const dx = tmp.x - cam.position.x;
    const dz = tmp.z - cam.position.z;
    if (Math.hypot(dx, dz) > MAX_DIST) { s.el.hidden = true; if (s.b3d) s.b3d.hide(); return; }
    if (xrOn()) {
      s.el.hidden = true;
      if (!s.b3d) s.b3d = ctx.xr.bubble();
      s.b3d.show(s.text, { x: tmp.x, y: tmp.y + 0.25, z: tmp.z });
      return;
    }
    if (s.b3d) s.b3d.hide();
    tmp.project(cam);
    const on = tmp.z < 1 && Math.abs(tmp.x) < 0.95 && tmp.y > -0.9 && tmp.y < 0.92;
    s.el.hidden = !on;
    if (on && host) {
      const w = host.clientWidth || window.innerWidth;
      const hh = host.clientHeight || window.innerHeight;
      s.el.style.transform = `translate(${((tmp.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * hh).toFixed(1)}px) translate(-50%, -100%)`;
    }
  }
  return {
    show(handle, text, ms = 3800) {
      if (!handle || !text) return false;
      for (const s of slots) if (s.handle === handle) { s.txt.textContent = text; s.text = text; s.left = ms / 1000; place(s); return true; }
      const s = slot();
      if (s.handle) free(s);
      s.handle = handle;
      s.text = text;
      s.txt.textContent = text;
      s.left = ms / 1000;
      place(s);
      return true;
    },
    hideFor(handle) { for (const s of slots) if (s.handle === handle) free(s); },
    update(dt) {
      for (const s of slots) {
        if (!s.handle) continue;
        s.left -= dt;
        if (s.left <= 0) { free(s); continue; }
        place(s);
      }
    },
    active: () => slots.filter((s) => s.handle).length,
    dispose() {
      for (const s of slots) { if (s.b3d && s.b3d.dispose) s.b3d.dispose(); s.el.remove(); }
      slots.length = 0;
    },
  };
}
