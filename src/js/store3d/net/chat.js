// VIDEOTHEK LENZ · Mehrspieler: Chat-Modell (rein, ohne DOM/three). Vertrag: docs/mp-api.md §5 (m: 5 je 10 s, ≤ 200 Zeichen), §10 (nichts gespeichert,
// Stumm pro k, Fenster 50 Einträge). Nichts hier schreibt Inhalte irgendwohin (kein Storage, kein Log): der Ring lebt nur im Speicher der Sitzung.
//   clean(text) → bereinigter Text ('' = leer)            bubbleMs(text) → Anzeigedauer der Blase in ms
//   inHearing(dx, dz[, r]) → bool (Hörweite, Standard 16 m)
//   normMute(list) / withMute(list, k, on, ownK) → neue Stummliste (gültige k, ≤ 50, das eigene k nie)
//   createLimiter({ max, win }) → { take(now) → 0 (frei) | Wartezeit ms }
//   createChat({ now, lookup(c) → {k, name}|null, me() → {c,k}|null, mute() → [k], enabled() → bool }) →
//     { receive(ev) → Eintrag|null, visible(n?) → Einträge (ohne Stumme, neueste zuletzt), all(), clear(), size(), mine(c) }
import { sanitize, LIM } from './proto.js';

export const RING_MAX = 50;
export const HEAR_M = 16;
const SEND_MAX = 5;
const SEND_WIN_MS = 10000;
export const MUTE_MAX = 50;
const K_RE = /^[0-9a-f]{12}$/;

/** NFC, Steuer-/Bidi-Zeichen raus, ≤ 200 Zeichen (gleiche Regel wie der Server). */
export const clean = (text) => sanitize(text, LIM.textMax);

/** Dauer der Blase: 3 s Grundzeit plus 55 ms je Zeichen, 3 bis 9 s. */
export function bubbleMs(text) {
  const n = typeof text === 'string' ? Array.from(text).length : 0;
  return Math.max(3000, Math.min(9000, 3000 + n * 55));
}

/** Hörweite waagerecht (Meter); nicht endlich = außer Reichweite. */
export function inHearing(dx, dz, r = HEAR_M) {
  return Number.isFinite(dx) && Number.isFinite(dz) && Math.hypot(dx, dz) <= r;
}

export function normMute(list) {
  const out = [];
  if (Array.isArray(list)) for (const k of list) if (typeof k === 'string' && K_RE.test(k) && !out.includes(k)) out.push(k);
  return out.slice(0, MUTE_MAX);
}

/** Stummliste mit/ohne k. Das eigene k ist nicht stummschaltbar; bei voller Liste (50) fällt der älteste Eintrag heraus. */
export function withMute(list, k, on, ownK) {
  const cur = normMute(list);
  if (typeof k !== 'string' || !K_RE.test(k) || (ownK && k === ownK)) return cur;
  const rest = cur.filter((x) => x !== k);
  if (!on) return rest;
  rest.push(k);
  return rest.slice(-MUTE_MAX);
}

/** Sende-Spiegel: höchstens max Nachrichten je win ms. take(now) → 0 = erlaubt (und gezählt), sonst Wartezeit bis zur nächsten freien Stelle. */
export function createLimiter({ max = SEND_MAX, win = SEND_WIN_MS } = {}) {
  const hits = [];
  return {
    take(now) {
      while (hits.length && now - hits[0] >= win) hits.shift();
      if (hits.length >= max) return Math.max(1, win - (now - hits[0]));
      hits.push(now);
      return 0;
    },
    reset() { hits.length = 0; },
  };
}

export function createChat(o = {}) {
  const now = o.now || (() => Date.now());
  const lookup = o.lookup || (() => null);
  const me = o.me || (() => null);
  const muteList = o.mute || (() => []);
  const enabled = o.enabled || (() => true);
  const ring = [];
  let seq = 0;

  const api = {
    /** ev = { c, x, s? } vom Server (Frame x/b). Rückgabe: aufgenommener Eintrag oder null (Chat aus, leer, ungültig, stumm). */
    receive(ev) {
      if (!enabled() || !ev || !Number.isInteger(ev.c)) return null;
      const text = clean(ev.x);
      if (!text) return null;
      const self = me();
      const mine = !!self && self.c === ev.c;
      const who = mine ? { k: self.k, name: 'Du' } : lookup(ev.c);
      const k = who && typeof who.k === 'string' ? who.k : '';
      if (!mine && k && muteList().includes(k)) return null;
      const e = { id: ++seq, c: ev.c, k, name: mine ? 'Du' : (who && who.name) || 'Jemand', text, t: now(), mine };
      ring.push(e);
      while (ring.length > RING_MAX) ring.shift();
      return e;
    },
    /** Sichtbare Einträge (Stumme zur Anzeigezeit herausgefiltert), die letzten n (Standard alle), neueste zuletzt. */
    visible(n = RING_MAX) {
      const mu = muteList();
      const v = ring.filter((e) => e.mine || !e.k || !mu.includes(e.k));
      return n >= v.length ? v : v.slice(v.length - n);
    },
    all: () => ring.slice(),
    size: () => ring.length,
    clear() { ring.length = 0; },
  };
  return api;
}
