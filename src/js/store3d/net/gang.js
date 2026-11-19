// VIDEOTHEK LENZ · Mehrspieler 1.18.0: Rowdy-Bande auf der Leitung (rein, ohne three/DOM). Kodierung der Bandenmeldung `gs` (Fähigkeit fight).
// gs.q = [phase, seed, n, (st, x, y, z, yaw, a, tgt, hp) × n≤3]:
//   phase = Tageszeit-Index (0 day, 1 dusk, 2 night) der Uhr des Führers · seed 0..0xffffff (Zeitfenster des Führers) · n Mitglieder
//   st = Index in npc/gang-logic.js ST · x/y/z cm im Netzrahmen (draußen, r = 2) · yaw cRad · a Posen-Code (NET_A_ANIM) ·
//   tgt = Verbindungsnummer des Ziels (0 = keins) · hp 0..100 (Anzeigewert, ROWDY_HP ist 60).
// Die Klemmen entsprechen net/proto.js build.gs (und dem Worker-Validator). frame = net/frame.js createFrame(layout).
import { ST } from '../npc/gang-logic.js';

export const TODS = ['day', 'dusk', 'night'];
const GS_R = 2; // Bereich „draußen“ (Gasse, Hof, Straße)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

/** Tageszeit-Name → Index (unbekannt = 0). */
export const phaseOf = (tod) => Math.max(0, TODS.indexOf(tod));

/**
 * Posen-Code (NET_A_ANIM) eines Mitglieds: ko 9 · threat 14 (drohen/ansprechen) · hit 6 (Schlag) · run 2 · walk 1 · sonst idle 0.
 * speed in m/s (aus dem Positionsunterschied), striking = Schlag läuft gerade.
 */
export function netAnim(st, speed = 0, striking = false) {
  if (st === 'beaten') return 9;
  if (striking) return 6;
  if (st === 'taunt' || st === 'threaten') return 14;
  if (speed > 2.2) return 2;
  if (speed > 0.3) return 1;
  return 0;
}

/**
 * Mitglieder → q. members: [{ st:'idle'|…, x, y?, z, yaw, a?, tgt?, hp }] (Meter, rad), höchstens 3. Gibt null zurück, wenn frame fehlt.
 */
export function encodeGs(frame, { phase = 0, seed = 0, members = [] } = {}) {
  if (!frame) return null;
  const list = members.slice(0, 3);
  const q = [clamp(Math.round(fin(phase)), 0, 255), clamp(Math.round(fin(seed)), 0, 0xffffff), list.length];
  for (const m of list) {
    const [cx, cy, cz] = frame.enc(fin(m.x), fin(m.y), fin(m.z), GS_R);
    q.push(clamp(Math.max(0, ST.indexOf(m.st)), 0, 9), cx, cy, cz, frame.encYaw(fin(m.yaw)), clamp(Math.round(fin(m.a)), 0, 15),
      clamp(Math.round(fin(m.tgt)), 0, 65535), clamp(Math.round(fin(m.hp)), 0, 100));
  }
  return q;
}

/** q → { phase, tod, seed, members:[{ st, x, y, z, yaw, a, tgt, hp }] } (Meter, rad) oder null bei ungültiger Form. */
export function decodeGs(frame, q) {
  if (!frame || !Array.isArray(q) || q.length < 3 || !q.every((v) => Number.isFinite(v))) return null;
  const n = q[2];
  if (!Number.isInteger(n) || n < 0 || n > 3 || q.length !== 3 + 8 * n) return null;
  const members = [];
  for (let i = 0; i < n; i++) {
    const o = 3 + 8 * i;
    const [x, y, z] = frame.dec(q[o + 1], q[o + 2], q[o + 3], GS_R);
    members.push({ st: ST[q[o]] || 'idle', x, y, z, yaw: frame.decYaw(q[o + 4]), a: q[o + 5], tgt: q[o + 6], hp: q[o + 7] });
  }
  return { phase: q[0], tod: TODS[q[0]] || 'day', seed: q[1], members };
}

/** Waffen-Index (0 hand, 1 belt, 2 whip, 3 laser) für `gh`/`fh` aus der Waffen-Id. */
const WEAPON_INDEX = { hand: 0, belt: 1, whip: 2, laser: 3 };
export const weaponIndex = (id) => (Object.prototype.hasOwnProperty.call(WEAPON_INDEX, id) ? WEAPON_INDEX[id] : 0);
export const WEAPON_BY_INDEX = ['hand', 'belt', 'whip', 'laser'];
