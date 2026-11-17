// VIDEOTHEK LENZ · Mehrspieler (lfx-mp.1, Welle b): Emotes, rein (ohne three/DOM/Timer). Tabelle der 8 Emotes mit Leitungscode `e`
// (docs/mp-api.md §6.2), Zuordnung auf npc/anim.js ANIMS, Cooldown (Spiegel der Server-Rate 1 je 1,5 s) und der Zustand eines
// Emotes bei Fremdfiguren (Dauer, Ende durch Wechsel der Pose `a`).
//   EMOTES: [{ code, id, anim, label, verb, key }]   code 1..8 (stabil, nur am Ende erweitern)
//   findEmote(x) → Eintrag | null     x = Code (1..8), id ('wave'), Anim-Name oder Beschriftung
//   createCooldown({ ms?, now? }) → { ready(), left(), mark() }
//   startRemote(code, t0) → Zustand | null · stepRemote(st, dt) → true solange aktiv · endedByPose(st, timeline) → bool
import { EMOTE, EMOTE_ANIM, emoteEndsOn } from './proto.js';
import { timedDuration } from '../npc/anim.js';

/** Reihenfolge = Platz im Rad (Index 0 oben, im Uhrzeigersinn) und Zifferntaste 1..8. */
export const EMOTES = [
  { code: EMOTE.WAVE, id: 'wave', label: 'Winken', verb: 'Du winkst' },
  { code: EMOTE.CHEER, id: 'cheer', label: 'Jubeln', verb: 'Du jubelst' },
  { code: EMOTE.POINT, id: 'point', label: 'Zeigen', verb: 'Du zeigst' },
  { code: EMOTE.SIT, id: 'sit', label: 'Hinsetzen', verb: 'Du setzt dich' },
  { code: EMOTE.DANCE, id: 'dance', label: 'Tanzen', verb: 'Du tanzt' },
  { code: EMOTE.CLAP, id: 'clap', label: 'Klatschen', verb: 'Du klatschst' },
  { code: EMOTE.THUMBS, id: 'thumbs', label: 'Daumen hoch', verb: 'Du zeigst den Daumen' },
  { code: EMOTE.BOW, id: 'bow', label: 'Verbeugen', verb: 'Du verbeugst dich' },
].map((e, i) => ({ ...e, anim: EMOTE_ANIM[e.code], key: String(i + 1) }));

/** Mindestabstand zwischen zwei Emotes (ms), gleich dem Server-Limit. */
export const COOLDOWN_MS = 1500;

/** Emote suchen: Code (1..8), id, Anim-Name oder Beschriftung (Groß-/Kleinschreibung egal); sonst null. */
export function findEmote(x) {
  if (typeof x === 'number' || (typeof x === 'string' && /^[1-8]$/.test(x))) {
    const c = Number(x);
    return EMOTES.find((e) => e.code === c) || null;
  }
  if (typeof x !== 'string') return null;
  const s = x.trim().toLowerCase();
  return EMOTES.find((e) => e.id === s || e.anim === s || e.label.toLowerCase() === s) || null;
}

/** Cooldown: mark() nach dem Senden, ready() danach erst nach `ms`. `now` ist injizierbar (Tests). */
export function createCooldown(o = {}) {
  const ms = Number.isFinite(o.ms) ? o.ms : COOLDOWN_MS;
  const now = typeof o.now === 'function' ? o.now : () => Date.now();
  let last = -Infinity;
  return {
    ready: () => now() - last >= ms,
    left: () => Math.max(0, Math.ceil(ms - (now() - last))),
    mark: () => { last = now(); },
  };
}

// --- Emote bei Fremdfiguren ------------------------------------------------------------------------------------------

/**
 * Zustand eines empfangenen Emotes. t0 = Server-ms des Empfangs (Pose-Einträge mit größerem t gehören zur Zeit danach).
 * Hinsetzen hat keine Dauer (Infinity): es endet nur durch die Pose.
 */
export function startRemote(code, t0) {
  const e = findEmote(code);
  if (!e) return null;
  return { code: e.code, name: e.anim, t0: Number.isFinite(t0) ? t0 : 0, age: 0, dur: e.code === EMOTE.SIT ? Infinity : timedDuration(e.anim) || 2.5 };
}

/** Alter fortschreiben; Rückgabe false, sobald die Dauer um ist. */
export function stepRemote(st, dt) {
  if (!st) return false;
  if (dt > 0) st.age += dt;
  return st.age < st.dur;
}

/** true, wenn nach dem Start eine Pose mit endendem Code (a ∈ 1,2,3,4,6,8) eingetroffen ist. timeline = [{ t, a }]. */
export function endedByPose(st, timeline) {
  if (!st || !Array.isArray(timeline)) return false;
  for (const e of timeline) if (e.t > st.t0 && emoteEndsOn(e.a)) return true;
  return false;
}
