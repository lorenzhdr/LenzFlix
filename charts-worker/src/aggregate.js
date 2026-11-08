export const LIMIT = 50;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function byRank(a, b) {
  return b.viewers - a.viewers || b.plays - a.plays || b.seconds - a.seconds;
}

/**
 * rows: [{ itemId, itemType, userId, plays, secs }] (je Item x Nutzer)
 * seriesByEpisode: Map<episodeId, seriesId> (fehlende Einträge -> Episode verworfen)
 * Rückgabe enthält KEINE UserIds (nur Zähler).
 */
export function aggregate(rows, seriesByEpisode, limit = LIMIT) {
  const movies = new Map();
  const series = new Map();
  const add = (map, id, userId, plays, secs) => {
    let e = map.get(id);
    if (!e) map.set(id, (e = { users: new Set(), plays: 0, seconds: 0 }));
    e.users.add(userId);
    e.plays += plays;
    e.seconds += secs;
  };
  for (const r of rows) {
    if (!r.itemId) continue;
    if (r.itemType === 'Movie') add(movies, r.itemId, r.userId, num(r.plays), num(r.secs));
    else if (r.itemType === 'Episode') {
      const sid = seriesByEpisode.get(r.itemId);
      if (sid) add(series, sid, r.userId, num(r.plays), num(r.secs));
    }
  }
  const out = (map, type) =>
    [...map].map(([id, e]) => ({ id, type, viewers: e.users.size, plays: e.plays, seconds: e.seconds }));
  const m = out(movies, 'Movie').sort(byRank);
  const s = out(series, 'Series').sort(byRank);
  const strip = ({ id, viewers, plays, seconds }) => ({ id, viewers, plays, seconds });
  return {
    movies: m.slice(0, limit).map(strip),
    series: s.slice(0, limit).map(strip),
    all: [...m, ...s].sort(byRank).slice(0, limit),
  };
}
