// Unter-Reducer "phys" (Welle c): Besitz-Prinzip für geteilte Physik und Schubsen (docs/mp-api.md §7, §8.1, §12).
// Keine Timer, keine Cloudflare-/Node-APIs, nichts wird gespeichert (die Tabelle lebt nur im Speicher des DO).
//
// Zustand `st.ph` (lazy): { tab: {<netId>: Eintrag}, rest: {<netId>: [x,y,z,yaw,tip,ax,az]} }
//   Eintrag = { o: Besitzer-c (0 = frei), g: Vergabe-Nummer 1..65535, at: letzte Vergabe (ms), t: letzte Aktivität (ms),
//               th?: Werfer-c (nur geworfene Hüllen "<c>.<n>"), it?: Item-ID, last: letzter Stand }
// Netz-Id = `data.id` statischer Requisiten bzw. "<c>.<n>" für Spawns (§14). Höchstens 64 Einträge.
import { V, FLAG, RE_NETID } from './protocol.js';
import { take } from './limits.js';

export const cap = ['phys', 'push'];
export const MAX_ENTRIES = 64;
export const HOLD_MS = 250; // Haltezeit nach einer Vergabe gegen Flattern
export const MAX_SPAWNS = 4; // geworfene Hüllen je Werfer
export const PUSH_RANGE = 350; // cm im Netzrahmen (3,5 m, horizontal)
export const IDLE_OWNER_MS = 30000; // Besitzer ohne ps gilt als weg
export const SPAWN_TTL_MS = 60000; // geworfene Hülle ohne Aktivität wird entfernt
const PN_LIMIT = { n: 3, per: 1000, burst: 3 }; // Server-Grenzen liegen über dem Client-Verhalten
const PX_LIMIT = { n: 6, per: 1000, burst: 6 };

const isSpawnId = (i) => RE_NETID.test(i);
const get = (st) => st.ph || (st.ph = { tab: {}, rest: {} });
const size = (ph) => Object.keys(ph.tab).length;
const nextG = (g) => (g >= 65535 ? 1 : g + 1);

function emitPo(cx, i, e) {
  cx.emit({ t: 'po', i, o: e.o, g: e.g, h: 0 }); // h: das DO kennt keine gehaltenen Körper (Halten läuft über hd/Peer-h)
}

function drop(cx, ph, i) {
  const e = ph.tab[i];
  delete ph.tab[i];
  delete ph.rest[i];
  if (e && e.th) cx.emit({ t: 'px', i });
}

// Besitz abgeben: die Ruhelage (letzter Stand) merken, damit Spätankömmlinge sie sehen.
function release(cx, ph, i, e) {
  e.o = 0;
  if (!e.th && e.last) ph.rest[i] = e.last.slice();
  emitPo(cx, i, e);
}

// Platz schaffen: ältester freier Eintrag. false, wenn alles belegt ist.
function makeRoom(ph) {
  if (size(ph) < MAX_ENTRIES) return true;
  let best = null;
  for (const [i, e] of Object.entries(ph.tab)) if (!e.o && (!best || e.t < ph.tab[best].t)) best = i;
  if (best === null) return false;
  delete ph.tab[best];
  delete ph.rest[best];
  return true;
}

const handlers = {
  // Besitz-Anspruch (Anstoßen). Das DO-Eintreffen entscheidet; die Haltezeit verhindert Flattern.
  pc(st, p, raw, cx) {
    const m = V.pc(raw);
    if (!m) return;
    const ph = get(st);
    const now = cx.now;
    let e = ph.tab[m.i];
    if (!e) {
      if (isSpawnId(m.i) || !makeRoom(ph)) { cx.sendTo(p.c, { t: 'er', c: 'deny', y: 'pc' }); return; }
      e = ph.tab[m.i] = { o: p.c, g: 1, at: now, t: now, last: null };
      emitPo(cx, m.i, e);
      return;
    }
    if (e.o === p.c) { e.t = now; return; }
    if (e.o && now - e.at < HOLD_MS) { emitPo(cx, m.i, e); return; } // verweigert: bisheriger Besitzer an alle (idempotent)
    e.o = p.c;
    e.g = nextG(e.g);
    e.at = now;
    e.t = now;
    delete ph.rest[m.i];
    emitPo(cx, m.i, e);
  },

  // Zustand vom Besitzer: nur mit passendem g, höchstens cf.ph Frames/s.
  ps(st, p, raw, cx) {
    const m = V.ps(raw);
    if (!m) return;
    const ph = get(st);
    const now = cx.now;
    const hz = cx.cf().ph;
    if (!take(p.rl, 'ps:ph', now, { n: hz, per: 1000, burst: hz + 2 })) return;
    const ok = [];
    let sleeping = 0;
    for (const en of m.l) {
      const i = en[0];
      let e = ph.tab[i];
      if (!e) {
        // Nach Hibernation/Kaltstart ist die Tabelle leer: ein weiterlaufender Besitzer übernimmt still wieder (kein bekannter Besitzer).
        if (isSpawnId(i) || en[1] < 1 || !makeRoom(ph)) continue;
        e = ph.tab[i] = { o: p.c, g: en[1], at: now, t: now, last: null };
        emitPo(cx, i, e);
      }
      if (e.o !== p.c || e.g !== en[1]) continue;
      e.t = now;
      e.last = [en[2], en[3], en[4], en[8], en[9], en[10], en[11]];
      ok.push(en);
      if (en[12] === 1) { sleeping++; release(cx, ph, i, e); } else delete ph.rest[i];
    }
    if (!ok.length) return;
    // ps-Ereignisse desselben Senders im selben Flush-Fenster zusammenfassen (je Id gilt der neueste Eintrag).
    const prev = st.evq.find((ev) => ev.t === 'ps' && ev.c === p.c);
    if (prev) {
      for (const en of ok) {
        const k = prev.l.findIndex((x) => x[0] === en[0]);
        if (k >= 0) prev.l[k] = en; else prev.l.push(en);
      }
    } else cx.emit({ t: 'ps', c: p.c, l: ok });
    if (sleeping === ok.length) cx.flushNow(); // Endzustand sofort
  },

  // Spawn einer geworfenen Hülle: Werfer wird Besitzer (g=1). Nicht aus VR; Id muss "<eigenes c>.<n>" sein.
  pn(st, p, raw, cx) {
    const m = V.pn(raw);
    if (!m) return;
    if (p.f & FLAG.VR) { cx.sendTo(p.c, { t: 'er', c: 'perm', y: 'pn' }); return; }
    if (!take(p.rl, 'pn', cx.now, PN_LIMIT)) return;
    if (m.i.split('.')[0] !== String(p.c)) return;
    const ph = get(st);
    if (ph.tab[m.i]) return;
    const own = Object.entries(ph.tab).filter(([, e]) => e.th === p.c).sort((a, b) => a[1].t - b[1].t);
    while (own.length >= MAX_SPAWNS) drop(cx, ph, own.shift()[0]);
    if (!makeRoom(ph)) return;
    const it = p.f & FLAG.FILM ? m.it : null; // Item-ID nur bei geteiltem Film (Privatsphäre)
    ph.tab[m.i] = { o: p.c, g: 1, at: cx.now, t: cx.now, th: p.c, it, last: [m.q[0], m.q[1], m.q[2], m.q[6], 0, 0, 0] };
    cx.emit({ t: 'pn', c: p.c, i: m.i, it, q: m.q });
  },

  // Entfernen: nur der Werfer.
  px(st, p, raw, cx) {
    const m = V.px(raw);
    if (!m) return;
    if (!take(p.rl, 'px', cx.now, PX_LIMIT)) return;
    const ph = get(st);
    const e = ph.tab[m.i];
    if (!e || e.th !== p.c) return;
    drop(cx, ph, m.i);
  },

  // Schubs: nur an die Ziel-Verbindung. Nicht an sich selbst, nicht aus/in VR, höchstens 3,5 m (Netzrahmen).
  pu(st, p, raw, cx) {
    const m = V.pu(raw);
    if (!m) return;
    const t = cx.peer(m.c);
    if (!t || !t.live || t.c === p.c || !t.cap.includes('push')) return;
    if (p.f & FLAG.VR || t.f & FLAG.VR) return;
    if (!p.q || !t.q) return;
    const dx = p.q[0] - t.q[0];
    const dz = p.q[2] - t.q[2];
    if (dx * dx + dz * dz > PUSH_RANGE * PUSH_RANGE) return;
    cx.sendTo(t.c, { t: 'pu', c: p.c, d: m.d, s: m.s });
  },
};

export { handlers };
export default {
  cap,
  handlers,
  onOpen() {},
  // Trennung: geworfene Hüllen des Werfers verschwinden, übrige Körper werden frei (Empfänger simulieren lokal weiter).
  onClose(st, p, cx) {
    const ph = st.ph;
    if (!ph) return;
    for (const [i, e] of Object.entries(ph.tab)) {
      if (e.th === p.c) drop(cx, ph, i);
      else if (e.o === p.c) release(cx, ph, i, e);
    }
  },
  onFlags() {},
  welcome(st, p) {
    if (!p.cap.includes('phys')) return {};
    const ph = get(st);
    const po = [];
    for (const [i, e] of Object.entries(ph.tab)) if (e.o && !e.th) po.push([i, e.o, e.g, 0]);
    const pr = Object.entries(ph.rest).map(([i, r]) => [i, ...r]);
    return { po, pr };
  },
  nextDeadline() { return null; }, // der 60-s-Alarm der Hülle genügt, jeder zusätzliche Alarm kostet einen Request
  onAlarm(st, now, cx) {
    const ph = st.ph;
    if (!ph) return;
    for (const [i, e] of Object.entries(ph.tab)) {
      if (e.th && now - e.t > SPAWN_TTL_MS) drop(cx, ph, i);
      else if (!e.th && e.o && now - e.t > IDLE_OWNER_MS) release(cx, ph, i, e);
    }
  },
  storeKeys: [],
};
