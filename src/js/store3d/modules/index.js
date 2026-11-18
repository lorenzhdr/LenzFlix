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
//   scene, camera, renderer, layout (inkl. zones mit rect), catalog, deps, opts, isPhone, isTouch, quality() → 'low'|'mid'|'high'|'ultra' (ultra nur Desktop/Tablet; Prüfung auf „mindestens high“ per atLeast aus engine/quality.js), soundOn()
//   addCollider(rect) / removeCollider(rect)            rect = { x0, z0, x1, z1, kind? }; wirkt auf Kollision UND Navigationsraster
//   addInteractable({ box, label, hint, onUse, enabled? }) → remove()   box = THREE.Box3 | { min, max } (Weltkoordinaten)
//   player.getPose() → {x,z,yaw,pitch} · teleport(x,z,yaw,pitch?) · walkTo(x,z,{face}) → Promise<bool> · lookAt(x,y,z,ms) → Promise
//         · freeze(bool) · camera.flyTo(pos,target,ms) → Promise<bool> · camera.release()
//   overlay.open(el, { onClose }) · close() · isOpen()
//   items.take(id,{from:'shelf'|'counter'}) · slotOf(id) → {x,y,z,dept,face,run,stand} | null · highlight(id,on)
//   on(event, fn) → off()   Events: 'enter' | 'take'(id) | 'put'(id) | 'play'(item,{resume}) | 'zone'(name) | 'frame'(dt,t)
//   loadTexture(url,{maxWidth}) → Promise<Texture|null> · track(obj) → obj (Geometrie/Material/Textur/Object3D, dispose automatisch)
//   provide(name, impl) → remove() · use(name) → impl|undefined   Provider: 'terminal' { open(q) }, 'intro' { run() → Promise },
//   'areas' { current, at, on }, 'city' { data, groups, signals, visible, partition }, 'door' { override, open, lock, unlock, isLocked, registerActor }
//   'ultra' { register(key, build, opts?) → remove(), isActive, has, keys, list } (engine/ultra.js: Details nur auf Stufe ultra, lazy im Leerlauf gebaut),
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
import city from './city.js';
import door from './door.js';
import intro from './intro.js';
import precip from './precip.js';
import daytime from './daytime.js';
// --- Welle 2 physics: imports ---
import props from './props.js';
import throwModule from './throw.js';
// --- /Welle 2 physics ---
import cashier from './cashier.js';
import brawl from './brawl.js';
import rent from './rent.js';
import snack from './snack.js';
import tv from './tv.js';
// --- Welle 2 npc: imports ---
import npc from './npc.js';
import traffic from './traffic.js';
import kiosk from './kiosk.js';
// --- Paket B palast: imports ---
import palast from './palast.js';
// --- Welle 2 discover: imports ---
import discover from './discover.js';
// --- Figur (1.17): imports ---
import avatar from './avatar.js';
import member from './member.js';
import selfview from './selfview.js';
import shopmirror from './shopmirror.js';
import salon from './salon.js';
import xrchar from './xrchar.js';
// --- Kampf (1.18, Stubs aus Welle 4) ---
import fight from './fight.js';
import gang from './gang.js';
// --- Ultra-Licht (1.19): imports ---
import ultraLight from './ultra-light.js';
// --- Ultra (1.19): imports ---
import ultraCity from './ultra-city.js';
// --- Ultra Innenraum (1.19): imports ---
import ultraRoom from './ultra-room.js';
// --- Mehrspieler (1.16): imports ---
import net from './net.js';

export const MODULES = [
  // --- M4 Atmosphäre (zuerst: Sound-Provider, Intro) ---
  sound,
  city,
  door,
  intro,
  precip, // vor daytime: liefert den Provider 'precip'
  daytime,
  // --- Welle 2 physics (props: Provider 'physics' vor allen Nutzern) ---
  props,
  throwModule,
  cashier,
  brawl,
  rent,
  snack,
  tv,
  // --- Welle 2 npc (nach daytime/city/door; kiosk braucht Provider 'npc') ---
  npc,
  traffic,
  kiosk,
  // --- Paket B palast (nach city: braucht Provider 'city'/'areas') ---
  palast,
  // --- M3 Kasse & Orte ---
  terminal,
  returns,
  reserve,
  staff,
  showcase,
  // --- Welle 2 discover (nach city/daytime: braucht Dachgruppe und Wetter) ---
  discover,
  // --- Figur (1.17, Stubs aus Welle 0; vor net) ---
  avatar,
  member,
  selfview,
  shopmirror,
  salon,
  xrchar,
  // --- Kampf (1.18, Stubs aus Welle 4; vor net) ---
  fight,
  gang,
  // --- Ultra-Licht (1.19, nach city/daytime/npc/traffic/selfview, vor net) ---
  ultraLight,
  // --- Ultra (1.19, Außenwelt-Geometrie; nach city: Provider 'city'/'areas'/'ultra') ---
  ultraCity,
  // --- Ultra Innenraum (1.19; Details nur auf Stufe ultra, Provider 'ultra') ---
  ultraRoom,
  // --- Mehrspieler (1.16, als LETZTES Modul: holt fremde Provider nur bei Gebrauch mit Guard) ---
  net,
];
