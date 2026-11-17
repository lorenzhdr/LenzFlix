// VIDEOTHEK LENZ · Kino: Video-/Zustands-/Untertitel-Polling mit festen Intervallen und An-/Abmeldung an der Bridge.
// Gemeinsam für das VR-Kino (cinema.js) und das 2D-Kino (palast.js). Die Auswertung (_onState, Phasen) bleibt beim Aufrufer.

const FEED = Object.freeze({ VIDEO_MS: 250, STATE_MS: 200, SUB_MS: 100 });

/**
 * createFeed({ getDeps }): getDeps() → deps.cinema (Bridge der Hülle) oder null.
 * pollVideo/pollState/pollSubs(now): nur wenn fällig (und Bridge da), Rückgabe { value } bzw. null (nicht fällig/Fehler).
 */
export function createFeed({ getDeps, intervals = FEED } = {}) {
  let lastVideo = -1e9;
  let lastState = -1e9;
  let lastSub = -1e9;
  let offs = [];
  const due = (now, last, ms) => now - last >= ms;
  const dep = () => { try { return getDeps ? getDeps() : null; } catch { return null; } };
  const feed = {
    reset() { lastVideo = -1e9; lastState = -1e9; lastSub = -1e9; },
    pollVideo(now) {
      const d = dep();
      if (!d || !due(now, lastVideo, intervals.VIDEO_MS)) return null;
      lastVideo = now;
      try { return { value: d.video() }; } catch { return null; }
    },
    pollState(now) {
      const d = dep();
      if (!d || !due(now, lastState, intervals.STATE_MS)) return null;
      lastState = now;
      try { return { value: d.state() }; } catch { return null; }
    },
    /** enabled=false: Takt steht (Phase failed). wantData=false: leere Untertitel melden (Leinwand noch ohne Videobild). */
    pollSubs(now, enabled = true, wantData = true) {
      const d = dep();
      if (!d || !enabled || !due(now, lastSub, intervals.SUB_MS)) return null;
      lastSub = now;
      try { return { value: wantData ? d.subtitles() : null }; } catch { return null; }
    },
    /** onVideo/onChange an der Bridge anmelden. Rückgabe: Abmelder (auch in feed.dispose enthalten). */
    subscribe({ onVideo, onChange } = {}) {
      const d = dep();
      const mine = [];
      if (d) {
        if (onVideo) mine.push(d.onVideo(onVideo));
        if (onChange) mine.push(d.onChange(onChange));
      }
      offs.push(...mine);
      return mine;
    },
    unsubscribe() {
      for (const off of offs.splice(0)) { try { if (typeof off === 'function') off(); } catch { /* egal */ } }
      offs = [];
    },
    dispose() { feed.unsubscribe(); },
  };
  return feed;
}
