// LENZ LIVE Player: Hilfen fürs Vorwärmen der Nachbarsender (Test, docs/live.md „Vorwärmen“). Reine Funktionen, kein Zustand.
// URLs tragen das Token: nie loggen, nie in Ergebnisse/Messwerte übernehmen.

const abs = (rel, base) => { try { return new URL(rel, base).href; } catch { return null; } };
const lines = (text) => String(text || '').split(/\r?\n/).map((l) => l.trim());

/** Master-Playlist → absolute URL der ersten Variante (Zeile nach #EXT-X-STREAM-INF) oder null. */
export function parseMaster(text, base) {
  const ls = lines(text);
  for (let i = 0; i < ls.length; i++) {
    if (!ls[i].startsWith('#EXT-X-STREAM-INF')) continue;
    for (let j = i + 1; j < ls.length; j++) {
      if (ls[j] && !ls[j].startsWith('#')) return abs(ls[j], base);
    }
  }
  return null;
}

/** Medien-Playlist → { init: absolute URL | null, segments: [{ url, start, dur }] } (Zeiten in Sekunden, kumuliert). */
export function parseMedia(text, base) {
  let init = null;
  const segments = [];
  let dur = null;
  let at = 0;
  for (const l of lines(text)) {
    if (!l) continue;
    if (l.startsWith('#EXT-X-MAP')) {
      const m = /URI="([^"]+)"/.exec(l);
      if (m) init = abs(m[1], base);
    } else if (l.startsWith('#EXTINF:')) {
      const d = parseFloat(l.slice(8));
      dur = Number.isFinite(d) && d > 0 ? d : 0;
    } else if (!l.startsWith('#')) {
      const url = abs(l, base);
      if (url && dur != null) {
        segments.push({ url, start: at, dur });
        at += dur;
      }
      dur = null;
    }
  }
  return { init, segments };
}

/** Segment, das offsetS abdeckt (vor dem Anfang → erstes, hinter dem Ende → letztes); leer → null. */
export function pickSegment(segments, offsetS) {
  if (!segments || !segments.length) return null;
  const t = Math.max(0, Number(offsetS) || 0);
  for (const s of segments) if (t < s.start + s.dur) return s;
  return segments[segments.length - 1];
}

/**
 * Messung der Ressourceneinträge seit src-Setzen (best effort, nur Zahlen): { n, firstSegMs } oder null.
 * srcPerf: performance.now()-Zeitpunkt des src-Setzens. Namen/URLs werden nie übernommen.
 */
export function resourceStats(perf, srcPerf) {
  try {
    const list = perf.getEntriesByType('resource') || [];
    let n = 0;
    let first = null;
    for (const e of list) {
      if (!(e.startTime >= srcPerf)) continue;
      const name = String(e.name || '');
      const playlist = /\.m3u8(?:[?#]|$)/i.test(name);
      const seg = !playlist && (/\/hls\d*\//i.test(name) || /\/videos\/[^?#]*\.(?:mp4|ts|m4s)(?:[?#]|$)/i.test(name));
      if (!playlist && !seg) continue;
      n++;
      if (seg && e.responseStart > 0 && (first == null || e.responseStart < first)) first = e.responseStart;
    }
    if (!n) return null;
    return { n, firstSegMs: first == null ? null : Math.max(0, Math.round(first - srcPerf)) };
  } catch { return null; }
}
