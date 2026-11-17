// Unter-Reducer "chat" (Welle b): Chat `m`, Emote `e`, Admin-Kick `ki` (docs/mp-api.md §5, §7, §8.6, §10).
// Chat wird nur durchgereicht, nie gespeichert (kein Ringpuffer, keine Logs). Gespeichert wird einzig
// der Bann `b:<k>` -> until (Room-Kern räumt abgelaufene Einträge auf).
import { V, FLAG } from './protocol.js';

export const cap = ['chat', 'emote', 'admin'];
export const BAN_MS = 10 * 60000;

function perm(cx, p, t) {
  cx.sendTo(p.c, { t: 'er', c: 'perm', y: t });
}

const handlers = {
  // Chat: Absender braucht Chat-Flag, nicht aus VR. Empfänger: Chat-Flag und Fähigkeit `chat`.
  m(st, p, raw, cx) {
    const m = V.m(raw);
    if (!m) return;
    if (!(p.f & FLAG.CHAT) || p.f & FLAG.VR) { perm(cx, p, 'm'); return; }
    const ev = { t: 'm', c: p.c, x: m.x, s: cx.now };
    for (const q of cx.peers()) {
      if (q.f & FLAG.CHAT && q.cap.includes('chat')) cx.sendTo(q.c, ev);
    }
  },
  // Emote: öffentliches Ereignis an alle.
  e(st, p, raw, cx) {
    const m = V.e(raw);
    if (!m) return;
    cx.emit({ t: 'e', c: p.c, e: m.e });
  },
  // Kick: nur Admin aus dem Ticket (p.a), Admins sind nicht kickbar. Bann gilt pro k.
  ki(st, p, raw, cx) {
    const m = V.ki(raw);
    if (!m) return;
    const target = cx.peer(m.c);
    if (!p.a || !target || !target.live || target.a || target.k === p.k) { perm(cx, p, 'ki'); return; }
    const until = cx.now + BAN_MS;
    cx.put('b:' + target.k, until);
    const all = cx.peers().filter((q) => q.k === target.k).map((q) => q.c);
    for (const c of all) cx.close(c, 4403, { c: 'ban', u: until }, 'kick');
  },
};

export { handlers };
export default {
  cap,
  handlers,
  onOpen() {},
  onClose() {},
  onFlags() {},
  welcome() { return {}; },
  nextDeadline() { return null; },
  onAlarm() {},
  storeKeys: [],
};
