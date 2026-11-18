// VIDEOTHEK LENZ · Mehrspieler (1.17.0): Teil „look“ des Moduls net (Fabrik createLook, net/parts.js). Sendet den eigenen Figuren-Look (`lk`)
// und die Ausweisdaten (`mc`) an die Fähigkeit `look` des Servers; Empfang und Anzeige der anderen machen net/peers.js.
//   - Gesendet wird NUR nach einem `wl` mit der Fähigkeit `look` (alter Worker: nie `lk`/`mc`), zuerst beim Beitritt, danach bei „Übernehmen“
//     (avatar.onChange, nie Live-Vorschau: während avatar.onPreview aktiv ist, bleibt alles stehen) und beim Platzwechsel.
//   - Raten: lk höchstens alle 2 s, mc höchstens alle 5 s (entprellt über tick, keine Timer); gleicher Inhalt wird nie doppelt gesendet.
//   - mc = toWire(member.cardData()), solange das Pref „Ausweis zeigen“ (core.prefs().card, Standard an) gilt und eine Ausweisnummer existiert,
//     sonst `null`. Ein Wechsel auf „aus“ (callParts('prefs')) geht ohne Wartezeit raus (Datenschutz), alle anderen mc-Änderungen entprellt.
//     Der Ausweis wird alle 5 s verglichen (Leihen/Kino/Stempel ändern sich ohne Ereignis).
//   createLook(core) → { welcome(wl), tick(dt), prefs(), stop(), dispose(), stats() }
import { decode } from '../char/look2.js';
import { toWire } from '../char/card.js';
import { build } from './proto.js';

export const LK_GAP_S = 2;
export const MC_GAP_S = 5;
export const MC_POLL_S = 5;

export function createLook(core) {
  const ctx = core.ctx;
  let enabled = false;
  let previewing = false;
  let sentLk = null; // String des zuletzt gesendeten Codes
  let sentMc; // String ('null' | 'a,b,…') des zuletzt gesendeten mc; undefined = noch nichts
  let sinceLk = Infinity;
  let sinceMc = Infinity;
  let lkDirty = false;
  let mcDirty = false;
  let mcNow = false; // Pref-Wechsel: ohne Wartezeit senden
  let poll = 0;
  let offChange = null;
  let offPreview = null;
  let sends = 0;

  const avatar = () => { try { return ctx.use('avatar'); } catch { return null; } };

  function hook() {
    if (offChange) return;
    const a = avatar();
    if (!a || typeof a.onChange !== 'function') return;
    const off = a.onChange(() => { lkDirty = true; });
    offChange = typeof off === 'function' ? off : () => {};
    if (typeof a.onPreview === 'function') {
      const o2 = a.onPreview((l) => { previewing = !!l; });
      offPreview = typeof o2 === 'function' ? o2 : () => {};
    }
  }
  function unhook() {
    if (offChange) { try { offChange(); } catch { /* egal */ } offChange = null; }
    if (offPreview) { try { offPreview(); } catch { /* egal */ } offPreview = null; }
    previewing = false;
  }

  /** Eigener Code (26 Ganzzahlen) oder null (keine Figur). */
  function myCode() {
    const a = avatar();
    if (!a || typeof a.code !== 'function') return null;
    try {
      if (typeof a.needsGate === 'function' && a.needsGate() === true) return null;
      const c = a.code();
      return Array.isArray(c) ? decode(c) : null;
    } catch { return null; }
  }

  /** Gewünschtes mc: Array, null (nichts zeigen) oder undefined (nichts zu sagen). */
  function wantedMc() {
    let pr = null;
    try { pr = core.prefs(); } catch { /* Standard */ }
    if (pr && pr.card === false) return null;
    const m = ctx.use('member');
    if (!m || typeof m.cardData !== 'function') return undefined;
    let cd;
    try { cd = m.cardData(); } catch { cd = null; }
    if (!cd) return undefined;
    if (!(Number(cd.no) > 0)) return null; // noch keine Ausweisnummer = kein Ausweis
    return toWire(cd);
  }

  function flush() {
    if (!enabled || !core.active() || !core.cap('look')) return;
    hook();
    if (lkDirty && !previewing && sinceLk >= LK_GAP_S) {
      const code = myCode();
      if (!code) lkDirty = false;
      else {
        const s = code.join(',');
        if (s === sentLk) lkDirty = false;
        else {
          const msg = build.lk(code);
          if (msg && core.send(msg)) { sentLk = s; sinceLk = 0; lkDirty = false; sends++; }
        }
      }
    }
    if (mcDirty && (sinceMc >= MC_GAP_S || mcNow)) {
      const w = wantedMc();
      if (w === undefined) { mcDirty = false; mcNow = false; return; }
      const s = w ? w.join(',') : 'null';
      if (s === sentMc) { mcDirty = false; mcNow = false; return; }
      if (mcNow && w !== null) mcNow = false; // Sofort nur beim Abschalten
      if (mcNow || sinceMc >= MC_GAP_S) {
        const msg = build.mc(w);
        if (msg && core.send(msg)) { sentMc = s; sinceMc = 0; mcDirty = false; mcNow = false; sends++; }
      }
    }
  }

  return {
    welcome() {
      sentLk = null; sentMc = undefined; sinceLk = Infinity; sinceMc = Infinity; poll = 0; previewing = false;
      enabled = !!core.cap('look');
      if (!enabled) return; // alter Worker: nie lk/mc
      lkDirty = true; mcDirty = true; mcNow = false;
      flush();
    },
    tick(dt) {
      if (!enabled) return;
      sinceLk = Math.min(sinceLk + dt, 1e6);
      sinceMc = Math.min(sinceMc + dt, 1e6);
      poll += dt;
      if (poll >= MC_POLL_S) { poll = 0; mcDirty = true; }
      flush();
    },
    /** Pref „Ausweis zeigen“ (oder ein anderes) hat gewechselt. */
    prefs() {
      if (!enabled) return;
      mcDirty = true;
      mcNow = true; // flush() nimmt das nur für den Abschalt-Fall (null) ernst
      flush();
    },
    stop() { enabled = false; lkDirty = false; mcDirty = false; mcNow = false; sentLk = null; sentMc = undefined; unhook(); },
    dispose() { enabled = false; unhook(); },
    stats() { return { enabled, sends, sentLk, sentMc }; },
  };
}
