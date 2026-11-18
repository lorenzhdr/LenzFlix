// Hilfsdatei (kein Test): Minimaler Modul-Kontext für die fight-Tests (1.18.0, Muster store3d-selfview).
import { Scene, PerspectiveCamera } from 'three';

/** Minimaler Modul-Kontext (Muster store3d-selfview). */
export function makeCtx(over = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  camera.position.set(10, 1.65, 10);
  camera.lookAt(10, 1.65, 0); // Blick nach −z
  camera.updateMatrixWorld(true);
  const providers = new Map();
  const state = { playing: true, xr: false, overlay: false, quality: 'mid' };
  const pose = { x: 10, y: 0, z: 10, yaw: 0, pitch: 0 };
  const net = { vx: 0, vz: 0 };
  const calls = { knock: [], teleport: [], freeze: [], drop: 0, sounds: [], toast: [], overlayOpen: 0, overlayClose: 0 };
  const actions = new Map();
  const listeners = new Map();
  const ctx = {
    scene, camera, renderer: { domElement: canvas }, isTouch: false, opts: { devFlags: {} },
    layout: {
      colliders: [],
      zones: { kids: { rect: { x0: 0, z0: 0, x1: 5, z1: 5, y1: 2.6 } } },
      city: { fixtures: [{ id: 'benchN', x0: 20, z0: 30.3, x1: 21.6, z1: 30.7, y1: 0.48 }] },
    },
    deps: { toast: (t) => calls.toast.push(t) },
    quality: () => state.quality,
    playing: () => state.playing,
    provide: (n, i) => { providers.set(n, i); return () => { if (providers.get(n) === i) providers.delete(n); }; },
    use: (n) => providers.get(n),
    on: (ev, fn) => { const l = listeners.get(ev) || []; l.push(fn); listeners.set(ev, l); return () => l.splice(l.indexOf(fn), 1); },
    input: { onAction: (name, fn, o) => { const h = { fn, prio: (o && o.prio) || 0 }; const l = actions.get(name) || []; l.push(h); actions.set(name, l); return () => l.splice(l.indexOf(h), 1); } },
    xr: { presenting: () => state.xr },
    overlay: {
      open: (el) => { calls.overlayOpen++; state.overlay = true; state.playing = false; host.appendChild(el); return true; },
      close: () => { calls.overlayClose++; state.overlay = false; state.playing = true; },
      isOpen: () => state.overlay,
    },
    items: { drop: () => { calls.drop++; return true; } },
    player: {
      getPose: () => ({ ...pose }), getY: () => pose.y, getNet: () => ({ ...net }),
      knock: (d, s) => { calls.knock.push([d, s]); return true; },
      teleport: (x, z, yaw, pitch, y) => { calls.teleport.push([x, z, yaw, pitch, y]); pose.x = x; pose.z = z; pose.y = y || 0; },
      freeze: (on) => calls.freeze.push(!!on),
    },
    ...over,
  };
  providers.set('sound', { play: (n) => calls.sounds.push(n), laser: (on) => calls.sounds.push('laser:' + on) });
  const fire = (name, ev) => { const l = [...(actions.get(name) || [])].sort((a, b) => b.prio - a.prio); for (const h of l) if (h.fn(ev) === true) return true; return false; };
  return { ctx, state, pose, net, calls, providers, scene, camera, host, fire, listeners };
}
