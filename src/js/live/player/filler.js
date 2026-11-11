// LENZ LIVE Player: Füller (Lücke bis 30 min): Trailer der nächsten Sendung am Ende der Lücke, davor Pausenbild.

/**
 * pickFiller(entry, nextEntry, deps, now?) → { kind:'trailer', url, offsetMs } | { kind:'card', trailerStartMs? }
 * Der Trailer läuft deterministisch im Fenster [entry.end - durMs, entry.end); offsetMs ist relativ zum Trailer.
 * Vor dem Fenster: Karte (trailerStartMs = Zeitpunkt, an dem der Trailer beginnt, damit die App neu fragen kann).
 */
export async function pickFiller(entry, nextEntry, deps, now = Date.now) {
  const card = { kind: 'card' };
  if (!entry || entry.type !== 'filler' || !nextEntry || nextEntry.itemId == null) return card;
  let t;
  try { t = deps && typeof deps.loadTrailer === 'function' ? await deps.loadTrailer(nextEntry.itemId) : null; } catch { t = null; }
  if (!t || !t.url || !(t.durMs > 0) || t.durMs > entry.end - entry.start) return card;
  const startAt = entry.end - t.durMs;
  const n = typeof now === 'function' ? now() : Number(now);
  if (n >= startAt && n < entry.end) return { kind: 'trailer', url: t.url, offsetMs: n - startAt };
  return n < startAt ? { kind: 'card', trailerStartMs: startAt } : card;
}
