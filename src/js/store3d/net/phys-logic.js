// VIDEOTHEK LENZ · Mehrspieler (lfx-mp.1, Welle c): Physik-Sync, reiner Teil (ohne three/DOM/Provider). Vertrag: docs/mp-api.md §6.1 (IDs), §7 (pc/ps/pn/px), §8.1 (Besitzer-Prinzip).
//   createOwners()  Besitztabelle id → { o, g, h, at, last, sentAt, opt } (+ zuletzt gesehenes g je id für pc)
//   createLimiter(perS, burst)  Token-Eimer: take(nowMs) → bool
//   createTrack/pushSample/sampleTrack  Interpolation fremder Körper (Anzeigeverzögerung PH_DELAY_MS, kurze Extrapolation)
//   encodeEntry/decodeEntry  ps-Eintrag [i,g,x,y,z,vx,vy,vz,yaw,tip,ax,az,s] <-> Meter/rad/m/s (Netzrahmen frame.js)
//   bodyState(b), moved(a, b), handState(pose), pickSend(...)  Zustand eines Körpers, Änderungsschwelle, Auswahl der zu sendenden Einträge
// Orte: Statik rechnet mit r = frame.area (Palast-Abbildung), Würfe/Hüllen ("c.n") immer mit r = 2 (kein r auf der Leitung, beide Seiten gleich).

export const PH_DELAY_MS = 250; // Anzeigeverzögerung fremder Körper (8 Hz + 100 ms Bündelung des DO)
export const EXTRAP_MS = 150; // höchstens so lange mit der letzten Geschwindigkeit weiterlaufen
export const STALE_MS = 3000; // ohne neuen Stand (wach): Besitzer gilt als weg, lokal weiter simulieren
export const HELD_RESEND_MS = 800; // gehaltenes Ding: Hand-Stand mindestens so oft erneuern (Empfänger geben nach STALE_MS frei, das DO nach 30 s)
export const FINAL_MS = 1500; // nach dem Schlaf-Stand ohne `po` o=0: lokal freigeben
export const HOLD_MS = 250; // Haltezeit nach einer Vergabe (spiegelt das DO)
export const DENY_PAUSE_MS = 400; // nach Ablehnung/Zeitüberschreitung so lange kein neuer Anspruch
export const PEND_MS = 700; // Anspruch ohne `po`-Antwort: zurücknehmen
export const CLAIM_PER_S = 8; // pc ≤ 10/s (Server), Eimer darunter
export const CHAIN_MS = 100; // Kettenreaktion: wache freie Körper beanspruchen
export const CHAIN_MAX = 3; // höchstens so viele je Durchlauf
export const MAX_ENTRIES = 8; // ps-Einträge je Nachricht
export const MAX_REMOTE_TAPES = 6;
export const VISIBLE_TAPES = { low: 2, other: 4 };
export const REST_MOVE = 0.02; // m: ab hier gilt ein Körper als bewegt
export const OBJ_ID = /^[A-Za-z0-9._-]{1,24}$/;
export const ITEM_ID = /^[0-9a-f]{32}$/;
export const isTapeId = (id) => typeof id === 'string' && id.includes('.');

const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (v) => (Number.isFinite(v) ? v : 0);

export function createLimiter(perS, burst) {
  let tokens = burst;
  let last = null;
  return {
    take(now) {
      if (last !== null) tokens = Math.min(burst, tokens + ((now - last) / 1000) * perS);
      last = now;
      if (tokens >= 1) { tokens -= 1; return true; }
      return false;
    },
    reset() { tokens = burst; last = null; },
  };
}

// --- Besitz -------------------------------------------------------------------------------------------------------
export function createOwners() {
  const m = new Map();
  const gs = new Map(); // zuletzt gesehenes g je id (bleibt nach dem Freigeben)
  const api = {
    get: (id) => m.get(id) || null,
    g: (id) => gs.get(id) || 0,
    size: () => m.size,
    /** Besitz setzen (aus `po`/`ps`, maßgeblich: `po` kommt auf einem Socket in Reihenfolge, g wird so übernommen, auch ein kleineres); behält den Sendestand bei gleichem Besitzer. */
    set(id, o, g, h, now) {
      const prev = m.get(id);
      const keep = prev && prev.o === o;
      m.set(id, { o, g, h: h | 0, at: keep ? prev.at : now, last: keep ? prev.last : null, sentAt: keep ? prev.sentAt : 0, opt: false });
      gs.set(id, g);
    },
    /** Optimistischer eigener Anspruch (g nur im Eintrag, bis `po` es bestätigt); Rückgabe: zuletzt gesehenes g (Feld `g` von pc). */
    claim(id, me, now) {
      const seen = gs.get(id) || 0;
      m.set(id, { o: me, g: seen + 1, h: 0, at: now, last: null, sentAt: 0, opt: true });
      return seen;
    },
    free(id) { m.delete(id); },
    ownedBy(c) { const out = []; for (const [id, e] of m) if (e.o === c) out.push(id); return out; },
    entries: () => m.entries(),
    clear() { m.clear(); gs.clear(); },
  };
  return api;
}

/** Darf `me` jetzt einen Anspruch auf `id` stellen? (Haltezeit, gehalten, eigener Besitz, Ablehnungspause) */
export function claimAllowed(owners, id, me, now, denyUntil) {
  const e = owners.get(id);
  if (e && e.o === me) return false;
  if (e && e.h && e.h !== me) return false;
  if (e && now - e.at < HOLD_MS) return false;
  if (denyUntil && denyUntil > now) return false;
  return true;
}

// --- Zustand und Kodierung ------------------------------------------------------------------------------------------
/** Zustand eines Physik-Körpers (Meter, rad). */
export function bodyState(b) {
  const tip = b.tipA || 0;
  return { x: b.pos.x, y: b.pos.y, z: b.pos.z, vx: b.vel.x, vy: b.vel.y, vz: b.vel.z, yaw: b.yaw || 0, tip, ax: tip > 0 ? b.tipAx : 0, az: tip > 0 ? b.tipAz : 0, s: b.sleeping ? 1 : 0 };
}

/** Gehaltenes Ding: Position an der rechten Hand der eigenen Figur (Pose {x,y,z,yaw}, y = Füße). */
export function handState(pose) {
  const yaw = fin(pose.yaw);
  const fx = -Math.sin(yaw); const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw); const rz = -Math.sin(yaw);
  return { x: fin(pose.x) + fx * 0.45 + rx * 0.2, y: fin(pose.y) + 1.05, z: fin(pose.z) + fz * 0.45 + rz * 0.2, vx: 0, vy: 0, vz: 0, yaw, tip: 0, ax: 0, az: 0, s: 0 };
}

/** Hat sich der Zustand seit dem letzten Senden merklich geändert? */
export function moved(a, b) {
  if (!a) return true;
  if (a.s !== b.s) return true;
  if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > REST_MOVE) return true;
  if (Math.abs(a.yaw - b.yaw) > 0.03 || Math.abs(a.tip - b.tip) > 0.03) return true;
  return false;
}

/** Zustand -> ps-Eintrag. `rOf`: 'area' (Statik) oder 2 (Hüllen). */
export function encodeEntry(frame, id, g, st, tape) {
  const r = tape ? 2 : frame.area(st.x, st.z, st.y);
  const p = frame.enc(st.x, st.y, st.z, r);
  const sl = st.s === 1;
  const v = sl ? [0, 0] : frame.encVec(st.x, st.z, st.vx, st.vz, r);
  const tip = clamp(Math.round(st.tip * 100), 0, 157);
  return [id, g, p[0], p[1], p[2], v[0], sl ? 0 : Math.round(st.vy * 100), v[1], frame.encYaw(st.yaw), tip,
    tip > 0 ? clamp(Math.round(st.ax * 100), -100, 100) : 0, tip > 0 ? clamp(Math.round(st.az * 100), -100, 100) : 0, sl ? 1 : 0];
}

/** ps-Eintrag -> Zustand in Meter (hintR: Ort der lokalen Gegenfigur, 2 bei Hüllen). */
export function decodeEntry(frame, e, hintR) {
  const r = Number.isInteger(hintR) ? hintR : 2;
  const p = frame.dec(e[2], e[3], e[4], r);
  const v = frame.decVec(e[2], e[4], e[5], e[7], r);
  return { i: e[0], g: e[1], x: p[0], y: p[1], z: p[2], vx: v[0], vy: e[6] / 100, vz: v[1], yaw: frame.decYaw(e[8]), tip: e[9] / 100, ax: e[10] / 100, az: e[11] / 100, s: e[12] === 1 ? 1 : 0 };
}

/** Auswahl der zu sendenden Einträge: Schlaf-/Endstände zuerst, dann die am längsten nicht gesendeten; höchstens MAX_ENTRIES. */
export function pickSend(cands) {
  const sorted = cands.slice().sort((a, b) => (b.final - a.final) || (a.sentAt - b.sentAt));
  return sorted.slice(0, MAX_ENTRIES);
}

// --- Interpolation fremder Körper ------------------------------------------------------------------------------------------
export const createTrack = () => ({ s: [], applied: false, lastRx: 0 });

/** Stand einreihen (t = lokale Empfangszeit ms, monoton). */
export function pushSample(tr, smp) {
  const a = tr.s;
  const last = a[a.length - 1];
  const t = last && smp.t <= last.t ? last.t + 1 : smp.t;
  a.push({ ...smp, t });
  if (a.length > 6) a.shift();
  tr.applied = false;
  tr.lastRx = t;
}

const lerp = (a, b, f) => a + (b - a) * f;
function lerpYaw(a, b, f) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * f;
}

/** Stand zum Zeitpunkt t (lokale ms) oder null. over = ms seit dem letzten Stand, final = Schlaf-Stand erreicht. */
export function sampleTrack(tr, t) {
  const a = tr.s;
  const n = a.length;
  if (!n) return null;
  const last = a[n - 1];
  if (t >= last.t) {
    const over = t - last.t;
    if (last.s === 1) return { p: [last.x, last.y, last.z], v: [0, 0, 0], y: last.yaw, tip: last.tip, ax: last.ax, az: last.az, s: 1, final: true, over };
    const dt = Math.min(over, EXTRAP_MS) / 1000;
    return { p: [last.x + last.vx * dt, last.y + last.vy * dt, last.z + last.vz * dt], v: [last.vx, last.vy, last.vz], y: last.yaw, tip: last.tip, ax: last.ax, az: last.az, s: 0, final: false, over };
  }
  const first = a[0];
  if (t <= first.t) return { p: [first.x, first.y, first.z], v: [first.vx, first.vy, first.vz], y: first.yaw, tip: first.tip, ax: first.ax, az: first.az, s: first.s, final: false, over: 0 };
  let i = 0;
  while (i < n - 2 && t >= a[i + 1].t) i++;
  const p0 = a[i]; const p1 = a[i + 1];
  const f = (t - p0.t) / (p1.t - p0.t);
  return {
    p: [lerp(p0.x, p1.x, f), lerp(p0.y, p1.y, f), lerp(p0.z, p1.z, f)], v: [lerp(p0.vx, p1.vx, f), lerp(p0.vy, p1.vy, f), lerp(p0.vz, p1.vz, f)],
    y: lerpYaw(p0.yaw, p1.yaw, f), tip: lerp(p0.tip, p1.tip, f), ax: p1.ax || p0.ax, az: p1.az || p0.az, s: 0, final: false, over: 0,
  };
}

/** Eintrag für world.applyRemote (numerische Körper-Id). */
export function worldEntry(bodyId, s) {
  return { i: bodyId, p: [r2(s.p[0]), r2(s.p[1]), r2(s.p[2])], v: [r2(s.v[0]), r2(s.v[1]), r2(s.v[2])], y: s.y, t: s.tip, ax: s.ax, az: s.az, s: s.s };
}
