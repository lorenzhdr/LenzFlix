// VIDEOTHEK LENZ · Mehrspieler (lfx-mp.1), Fremdfiguren: reine Logik (kein three, kein DOM, keine Timer). Gegenstück: net/peers.js.
// Enthält: Aussehen aus k (deterministisch), Pose-Dekodierung und Geschwindigkeitsableitung aus zwei Posen, Animations-Zeitleiste,
// Sichtbarkeit nach Bereich, LOD-Grenzen (low/mid/high/VR), Auswahl der Figuren (nächste zuerst, mit Trägheit), Namensregel.
// Die Code-Tabellen (Pose-a → ANIMS-Name NET_A_ANIM, Flag-Bits F, ITEM_RE) stehen ausschließlich in net/proto.js.
import { presetFor } from '../engine/quality.js';
import { NET_A_ANIM, F, ITEM_RE } from './proto.js';

/** Abtast-Verzögerung der Anzeige für Fremde (ms), Vertrag §7.2. */
export const PEER_DELAY_MS = 250;
/** Lücke (ms), ab der der letzte Stand vor dem neuen erneut eingespeist wird (gegen Sprünge). */
export const GAP_MS = 300;
/** Versatz (ms) vor dem neuen Stand, an dem der alte Stand erneut eingespeist wird. */
export const REFEED_MS = 125;
/** Größte abgeleitete Geschwindigkeit (m/s), entspricht ±1600 cm/s der Klemmen. */
export const V_MAX = 16;
/** Ferne, ab der Figuren nie gezeigt werden (m), wie npc.js FAR. */
export const FAR = 52;
/** Größe der Zeitleiste je Peer. */
export const TIMELINE = 12;
/** Neubewertungsintervall (s). */
export const EVAL_S = 0.3;

/** Animationsnamen, die einmal laufen (nur bei Codewechsel auslösen, sonst spielt die Figur sie in Dauerschleife). */
export const ONE_SHOT = new Set(['hit', 'throw', 'stagger']);

/** FNV-1a 32 Bit über einen String. */
export function fnv1a32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Seed für das Aussehen einer Figur (nur aus k, nie aus uid). */
export const lookSeed = (k) => fnv1a32('lfx-mp-look|' + String(k));

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------- Pose
/**
 * Rohe Pose (Netzeinheiten) → Zustand für Body.applyRemote (Meter, rad). frame.dec(x, y, z, r) liefert {x,y,z} (oder [x,y,z]) in Metern;
 * x, y, z sind cm (ints), yaw/pitch cRad. a: Code laut Vertrag 0..8. Rückgabe null bei ungültigen Zahlen.
 */
export function decodePose(frame, e) {
  if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.z)) return null;
  const y = num(e.y);
  const raw = frame && typeof frame.dec === 'function' ? frame.dec(e.x, y, e.z, e.r | 0) : { x: e.x / 100, y: y / 100, z: e.z / 100 };
  const o = Array.isArray(raw) ? { x: raw[0], y: raw[1], z: raw[2] } : raw;
  if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.z)) return null;
  return {
    x: o.x, y: Number.isFinite(o.y) ? o.y : 0, z: o.z,
    yaw: num(e.yaw) / 100, pitch: num(e.pitch) / 100,
    a: Number.isInteger(e.a) && e.a >= 0 && e.a <= 8 ? e.a : 0, r: e.r | 0, se: Array.isArray(e.se) ? e.se : null,
  };
}

/** Zustand für Body.applyRemote aus Pose und Vorgänger { s, t }: vx/vy/vz aus zwei Posen (Vertrag §6.1). */
export function bodyState(cur, prev, t) {
  let vx = 0; let vy = 0; let vz = 0;
  if (prev && t > prev.t) {
    const dt = (t - prev.t) / 1000;
    vx = clamp((cur.x - prev.s.x) / dt, -V_MAX, V_MAX);
    vy = clamp((cur.y - prev.s.y) / dt, -V_MAX, V_MAX);
    vz = clamp((cur.z - prev.s.z) / dt, -V_MAX, V_MAX);
  }
  // Body.ANIM kennt nur 0..6; 7 (Sitzen) und 8 (Wurf) sind am Boden → 0
  return { x: cur.x, y: cur.y, z: cur.z, yaw: cur.yaw, pitch: cur.pitch, vx, vy, vz, a: cur.a <= 6 ? cur.a : 0, h: null };
}

/** Lücke: alter Stand soll vor dem neuen erneut eingespeist werden. */
export const needRefeed = (lastT, t) => Number.isFinite(lastT) && t - lastT > GAP_MS;

/** Zeitleiste fortschreiben ({ t, a, r, se }), höchstens TIMELINE Einträge. */
export function pushTimeline(tl, t, pose) {
  if (tl.length && t <= tl[tl.length - 1].t) return false;
  tl.push({ t, a: pose.a, r: pose.r, se: pose.se });
  while (tl.length > TIMELINE) tl.shift();
  return true;
}

/** Eintrag der Zeitleiste zur Anzeigezeit t (letzter mit .t ≤ t, sonst der erste). */
export function entryAt(tl, t) {
  if (!tl.length) return null;
  let best = tl[0];
  for (const e of tl) { if (e.t <= t) best = e; else break; }
  return best;
}

/** Pose-Code → ANIMS-Name (Tabelle NET_A_ANIM aus proto). */
export function animName(a) {
  const n = NET_A_ANIM[a];
  return typeof n === 'string' ? n : 'idle';
}

/** Tempo glätten (m/s), k = 8. */
export function smoothSpeed(prev, dist, dt) {
  if (!(dt > 0)) return prev;
  const inst = Math.min(V_MAX, dist / dt);
  return prev + (inst - prev) * Math.min(1, dt * 8);
}

/**
 * Welche Animation läuft jetzt? Rückgabe { name, speed, restart }: restart nur für Einmal-Animationen beim Codewechsel.
 * Laufen/Rennen/Stehen werden jedes Mal gesetzt (setzt nur das Tempo), Luft/Hochziehen zeigen `idle` laut Tabelle.
 */
export function animFor(a, lastA, speed) {
  const name = animName(a);
  if (ONE_SHOT.has(name)) return { name, speed, restart: a !== lastA, apply: a !== lastA };
  return { name, speed: name === 'walk' || name === 'run' ? speed : 0, restart: false, apply: true };
}

// ---------------------------------------------------------------- Sichtbarkeit / LOD
/** Bereich → sichtbar (gleiche Regel wie props.js regionVisible; vis = city.visible()). */
export function regionVisible(area, vis) {
  const v = vis || {};
  if (area === 'shop') return v.shopShell !== false;
  if (area === 'yard' || area === 'alley' || area === 'escape' || area === 'roof') return !!v.yard;
  if (area === 'palastHall' || area === 'palastFoyer') return !!v.palastInterior;
  return v.street !== false;
}

/** Bereichsnamen, in denen eine Figur auf der Straßenseite (Passanten-Ausgleich) steht. */
export const OUTDOOR = new Set(['street', 'crossing', 'sideN', 'sideS', 'yard', 'alley', 'roof', 'escape', 'kiosk', 'palastEntrance', 'outside', 'doorway']);

/**
 * LOD-Grenzen (Entwurf net3d §6). max = Figuren, tagDist = DOM-Schild (m), tag3d = Anzahl 3D-Schilder (VR), tag3dDist (m),
 * hand = 'none' | 'cover' | 'neutral', coverDist = bis hier mit Cover (sonst neutral).
 */
export function lodFor(level, phone, xr) {
  const lv = level === 'low' || level === 'high' ? level : 'mid';
  if (xr) return { max: lv === 'low' ? 3 : 4, tagDist: 0, tag3d: 3, tag3dDist: 10, hand: 'neutral', coverDist: 0 };
  if (lv === 'low') return { max: presetFor('low', !!phone).npcMax, tagDist: 12, tag3d: 0, tag3dDist: 0, hand: 'none', coverDist: 0 };
  if (lv === 'mid') return { max: 10, tagDist: 16, tag3d: 0, tag3dDist: 0, hand: 'cover', coverDist: 10 };
  return { max: 16, tagDist: 20, tag3d: 0, tag3dDist: 0, hand: 'cover', coverDist: 14 };
}

/**
 * Figuren auswählen: cands = [{ c, d (m), has (Figur vorhanden) }], die nächsten `max`; vorhandene Figuren bekommen 1,5 m Bonus
 * (gegen Flackern an der Grenze). Rückgabe: Set der c.
 */
export function pickFigures(cands, max) {
  const list = cands.filter((e) => e && Number.isFinite(e.d) && e.d <= FAR).map((e) => ({ c: e.c, s: e.d - (e.has ? 1.5 : 0) }));
  list.sort((a, b) => a.s - b.s || a.c - b.c);
  return new Set(list.slice(0, Math.max(0, max | 0)).map((e) => e.c));
}

// ---------------------------------------------------------------- Peer-Daten
/** Anzeigename: leer oder ohne Namens-Flag → „Jemand“. */
export function displayName(n, f) {
  const s = typeof n === 'string' ? n : '';
  return s && (f & F.NAME) ? s : 'Jemand';
}

/** Gültige Item-ID (32 Hex-Zeichen) oder null. */
export function cleanItemId(id) {
  return typeof id === 'string' && ITEM_RE.test(id) ? id : null;
}

/** Geräte je k: Map k → Anzahl. */
export function deviceCounts(peers, meK) {
  const m = new Map();
  for (const p of peers) m.set(p.k, (m.get(p.k) || 0) + 1);
  if (meK) m.set(meK, (m.get(meK) || 0) + 1);
  return m;
}
