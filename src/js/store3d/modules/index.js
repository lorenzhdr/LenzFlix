// VIDEOTHEK LENZ · Modul-Registry des 3D-Bundles. Neue Funktion = neue Datei in modules/ + EINE Zeile hier (store.js bleibt unberührt).
// Reihenfolge = Init-Reihenfolge. Modul-Form:
//
//   export default {
//     name: 'beispiel',
//     init(ctx) { …; return { update(dt, t) {}, onSuspend() {}, onResume() {}, onQuality(level) {}, onSound(on) {}, dispose() {} }; },
//   };
//   // init darf async sein; Fehler werden per console.warn geloggt und töten die Szene nicht. Alle Handle-Methoden optional.
//
// ctx (stabil; Details und Semantik: docs/store3d.md, Abschnitt „Module (store3d intern)“). three importieren Module selbst.
//   scene, camera, renderer, layout (inkl. zones mit rect), catalog, deps, opts, isPhone, isTouch, quality() → 'low'|'mid'|'high', soundOn()
//   addCollider(rect) / removeCollider(rect)            rect = { x0, z0, x1, z1, kind? }; wirkt auf Kollision UND Navigationsraster
//   addInteractable({ box, label, hint, onUse, enabled? }) → remove()   box = THREE.Box3 | { min, max } (Weltkoordinaten)
//   player.getPose() → {x,z,yaw,pitch} · teleport(x,z,yaw,pitch?) · walkTo(x,z,{face}) → Promise<bool> · lookAt(x,y,z,ms) → Promise
//         · freeze(bool) · camera.flyTo(pos,target,ms) → Promise<bool> · camera.release()
//   overlay.open(el, { onClose }) · close() · isOpen()
//   items.take(id,{from:'shelf'|'counter'}) · slotOf(id) → {x,y,z,dept,face,run,stand} | null · highlight(id,on)
//   on(event, fn) → off()   Events: 'enter' | 'take'(id) | 'put'(id) | 'play'(item,{resume}) | 'zone'(name) | 'frame'(dt,t)
//   loadTexture(url,{maxWidth}) → Promise<Texture|null> · track(obj) → obj (Geometrie/Material/Textur/Object3D, dispose automatisch)
//   provide(name, impl) → remove() · use(name) → impl|undefined   Provider: 'terminal' { open(q) }, 'intro' { run() → Promise },
//   'cashier' { event('couchSit'|'couchStand') }, 'couch' { seated() → bool }, 'sound' { play, ambient(on), duck(key, on) }
// Imports bitte nur im eigenen Block ergänzen (parallele Arbeit, Konflikte vermeiden).
// --- M3 Kasse & Orte: imports ---
import terminal from './terminal.js';
import returns from './returns.js';
import reserve from './reserve.js';
import staff from './staff.js';
import showcase from './showcase.js';
// --- M4 Atmosphäre: imports ---
import sound from './sound.js';
import intro from './intro.js';
import daytime from './daytime.js';
import cashier from './cashier.js';
import snack from './snack.js';
import tv from './tv.js';

export const MODULES = [
  // --- M4 Atmosphäre (zuerst: Sound-Provider, Intro) ---
  sound,
  intro,
  daytime,
  cashier,
  snack,
  tv,
  // --- M3 Kasse & Orte ---
  terminal,
  returns,
  reserve,
  staff,
  showcase,
];
