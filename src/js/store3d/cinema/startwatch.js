// VIDEOTHEK LENZ · Kino: Start-Watchdog als eigenständige Logik (aus Cinema._checkStart/_progress, VR und 2D-Palast teilen sie).
// step() verändert nur den Watchdog-Zustand und liefert die Entscheidung; Effekte (Vorhang, Toast, Phase) macht der Aufrufer.
// Abfolge pro Aufruf wie zuvor: start → pausedStart → slow/prepare (Merker, kein Abbruch) → Fehler T1/T2.

export const WATCH = Object.freeze({
  NO_VIDEO_MS: 25000, // Route/<video> nie erreicht -> T1
  STALL_MS: 15000, // Video da, aber so lange ohne jeden Fortschritt -> T2
  MAX_START_MS: 60000, // absolute Obergrenze auch bei Fortschritt -> T2
  PREPARE_MS: 8000, // Hinweis „Der Server bereitet den Film vor …“
  PAUSED_HOLD_MS: 1500, // pausiert mit Bild so lange stabil = pausierter Start (Autoplay geblockt)
  SLOW_START_MS: 3000, // ab hier Vorhang auf, damit das Statusbild zu sehen ist
});

/**
 * @returns {{
 *  reset(): void,
 *  step(i: { now: number, video: object|null, state: object, frames: number, hasFrame: boolean, baseTime: number }): { event: null|'start'|'pausedStart'|'fail', code?: 'T1'|'T2', paused?: boolean, slow: boolean, prepare: boolean },
 *  shiftClock(gapMs: number): void,
 *  marks: object, startAt: number|null, lastProgress: number, prepareShown: boolean }}
 * Ergebnis: event = Endentscheidung des Aufrufs (sonst null); slow = Startzeit > SLOW_START_MS (pegelartig, jeder Aufruf);
 * prepare = erstmals > PREPARE_MS (einmalig je Lauf); paused (bei 'start') = Video startet im Zustand pausiert.
 */
export function createStartWatch(cfg = WATCH) {
  const w = {
    marks: {}, // ms seit Start: video, ready, frame, start
    startAt: null,
    lastProgress: 0,
    prepareShown: false,
    prog: null,
    pausedSince: null,
    reset() {
      w.startAt = null;
      w.lastProgress = 0;
      w.prepareShown = false;
      w.prog = null;
      w.pausedSince = null;
      for (const k of Object.keys(w.marks)) delete w.marks[k];
    },
    /** Fortschritt des Ladens: readyState steigt, buffered-Ende wächst oder currentTime ändert sich. */
    progress(v, now) {
      const rs = Number(v.readyState) || 0;
      let be = 0;
      try { const b = v.buffered; if (b && b.length) be = Number(b.end(b.length - 1)) || 0; } catch { /* egal */ }
      const ct = Number(v.currentTime) || 0;
      const p = w.prog;
      if (!p || p.v !== v) { w.prog = { v, rs, be, ct }; w.lastProgress = now; return; }
      if (rs > p.rs || be > p.be + 0.01 || Math.abs(ct - p.ct) > 0.01) w.lastProgress = now;
      p.rs = rs; p.be = be; p.ct = ct;
    },
    step({ now, video, state, frames, hasFrame, baseTime }) {
      if (w.startAt == null) w.startAt = now;
      const v = video || null;
      const st = state || {};
      const el = now - w.startAt;
      const rs = v ? Number(v.readyState) || 0 : 0;
      const mark = (k) => { if (w.marks[k] == null) w.marks[k] = Math.round(el); };
      if (v) {
        mark('video');
        w.progress(v, now);
        if (rs >= 2) mark('ready');
        if (frames >= 1) mark('frame');
      }
      if (v && rs >= 2 && frames >= 3 && (Math.abs((Number(v.currentTime) || 0) - baseTime) >= 0.3 || st.phase === 'paused')) {
        mark('start');
        return { event: 'start', paused: st.phase === 'paused', slow: false, prepare: false };
      }
      // Pausierter Start: Bild da, aber das Video bleibt pausiert (Browser blockt Autoplay)
      const pausedNow = Boolean(v) && rs >= 2 && Boolean(hasFrame) && (st.phase === 'paused' || v.paused === true);
      if (pausedNow) {
        if (w.pausedSince == null) w.pausedSince = now;
        else if (now - w.pausedSince >= cfg.PAUSED_HOLD_MS) {
          mark('start');
          return { event: 'pausedStart', paused: true, slow: false, prepare: false };
        }
      } else w.pausedSince = null;
      const slow = el > cfg.SLOW_START_MS;
      let prepare = false;
      if (el > cfg.PREPARE_MS && !w.prepareShown) { w.prepareShown = true; prepare = true; }
      if (!v) {
        if (el > cfg.NO_VIDEO_MS) return { event: 'fail', code: 'T1', slow, prepare };
        return { event: null, slow, prepare };
      }
      if (now - w.lastProgress > cfg.STALL_MS || el > cfg.MAX_START_MS) return { event: 'fail', code: 'T2', slow, prepare };
      return { event: null, slow, prepare };
    },
    /** Hintergrund-Tab: die Uhr (now) ist um gapMs gesprungen, ohne dass etwas hätte passieren können. Zeitbezüge mitziehen. */
    shiftClock(gapMs) {
      const g = Number(gapMs);
      if (!(g > 0)) return;
      if (w.startAt != null) w.startAt += g;
      if (w.prog) w.lastProgress += g;
      if (w.pausedSince != null) w.pausedSince += g;
    },
  };
  return w;
}
