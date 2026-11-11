// LENZ LIVE Player: Gesehen-Regel (wie Jellyfins Fortschrittsgrenze). Eine Ausstrahlung gilt als gesehen, wenn
// (a) spätestens 10 min nach entry.start eingeschaltet wurde und (b) die Sendeposition (t - entry.start) mindestens
// 90 % von entry.end - entry.start erreicht hat, während man seit dem Einschalten auf dem Sender war. Unterbrechungen
// (Wegzappen/Aus) unter 60 s sind erlaubt, ab 60 s ist die Ausstrahlung verworfen. Einmal pro Ausstrahlung (itemId + start).
const LATE_MS = 10 * 60000;
const GAP_MS = 60000;
const SHARE = 0.9;
const ELIGIBLE = new Set(['program', 'fill', 'nightfill']);
const MAX_RECORDS = 60;

export function createWatchTracker({ setPlayed, now = Date.now } = {}) {
  const records = new Map();
  let cur = null; // { rec, entry, key }

  const check = (rec, entry) => {
    if (rec.done || !rec.ok) return;
    const run = entry.end - entry.start;
    const pos = Math.min(now(), entry.end) - entry.start;
    if (run > 0 && pos >= SHARE * run) {
      rec.done = true;
      try {
        const p = setPlayed && setPlayed(entry.itemId, true);
        if (p && p.catch) p.catch(() => {});
      } catch { /* egal */ }
    }
  };

  // silent = true: ohne Prüfung verlassen (Störbild/Ausfall: es lief nichts, also nie als gesehen werten).
  function leave(silent) {
    if (!cur) return;
    const { rec, entry } = cur;
    if (silent !== true) check(rec, entry);
    rec.leftAt = now();
    cur = null;
  }

  return {
    tune(entry, offsetMs) {
      const key = entry && entry.itemId != null ? `${entry.itemId}@${entry.start}` : null;
      if (cur && key && cur.key === key) return;
      leave();
      if (!key || !ELIGIBLE.has(entry.type)) return;
      let rec = records.get(key);
      const t = now();
      if (!rec) {
        rec = { ok: (Number(offsetMs) || 0) <= LATE_MS, leftAt: null, done: false };
        records.set(key, rec);
        if (records.size > MAX_RECORDS) records.delete(records.keys().next().value);
      } else if (rec.leftAt != null && t - rec.leftAt >= GAP_MS) {
        rec.ok = false;
      }
      rec.leftAt = null;
      cur = { rec, entry, key };
    },
    tick() {
      if (!cur) return;
      check(cur.rec, cur.entry);
    },
    leave,
    dispose() {
      leave();
      records.clear();
    },
  };
}
