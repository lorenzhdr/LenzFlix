export const LIMIT = 50;
/** Halbwertszeit der Aktualität: ein Abruf zählt nach 7 Tagen nur noch halb. */
export const HALF_LIFE_DAYS = 7;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Gewicht eines Abrufs nach Alter in Sekunden; ungültig -> 1, negativ -> 0 Tage (Gewicht 1). */
export function weight(ageSec) {
  if (ageSec === null || ageSec === undefined) return 1;
  const a = Number(ageSec);
  if (!Number.isFinite(a)) return 1;
  return 0.5 ** (Math.max(0, a) / 86400 / HALF_LIFE_DAYS);
}

const round3 = (x) => Math.round(x * 1000) / 1000;

// Alte Rangfolge (Mischliste `all`): ohne Aktualität.
function byRank(a, b) {
  return b.viewers - a.viewers || b.plays - a.plays || b.seconds - a.seconds;
}

const idCmp = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Filme: Score, Zuschauer, Anteil gesehen (nur wenn beide eine Laufzeit haben), Sekunden, Wiedergaben, ID.
function byScoreMovie(a, b) {
  const c = a.completion !== undefined && b.completion !== undefined ? b.completion - a.completion : 0;
  return b.score - a.score || b.viewers - a.viewers || c || b.seconds - a.seconds || b.plays - a.plays || idCmp(a, b);
}

// Serien: Score, Zuschauer, Sekunden, Wiedergaben, ID.
function byScoreSeries(a, b) {
  return b.score - a.score || b.viewers - a.viewers || b.seconds - a.seconds || b.plays - a.plays || idCmp(a, b);
}

/**
 * rows: [{ itemId, itemType, userId, plays, secs, age }] (je Item x Nutzer; age = Sekunden seit letztem Abruf)
 * seriesByEpisode: Map<episodeId, seriesId> (fehlende Einträge -> Episode verworfen)
 * runtimes: Map<movieId, Laufzeit in Sekunden> (optional; liefert `completion` der Filme)
 * Filme: score = Σ Gewicht je Person. Serien: je Person W = Σ Gewicht ihrer Folgen, score = Σ log2(1 + W).
 * Rückgabe enthält KEINE UserIds (nur Zähler).
 */
export function aggregate(rows, seriesByEpisode, limit = LIMIT, runtimes = new Map()) {
  const movies = new Map();
  const series = new Map();
  const add = (map, id, userId, plays, secs, w) => {
    let e = map.get(id);
    if (!e) map.set(id, (e = { users: new Map(), plays: 0, seconds: 0 }));
    const u = e.users.get(userId) ?? { w: 0, secs: 0 };
    u.w += w;
    u.secs += secs;
    e.users.set(userId, u);
    e.plays += plays;
    e.seconds += secs;
  };
  for (const r of rows) {
    if (!r.itemId) continue;
    const w = weight(r.age);
    if (r.itemType === 'Movie') add(movies, r.itemId, r.userId, num(r.plays), num(r.secs), w);
    else if (r.itemType === 'Episode') {
      const sid = seriesByEpisode.get(r.itemId);
      if (sid) add(series, sid, r.userId, num(r.plays), num(r.secs), w);
    }
  }
  const out = (map, type, scoreOf, withCompletion) =>
    [...map].map(([id, e]) => {
      const us = [...e.users.values()];
      const o = { id, type, viewers: us.length, plays: e.plays, seconds: e.seconds, score: round3(scoreOf(us.map((u) => u.w))) };
      const rt = withCompletion ? runtimes.get(id) : undefined;
      if (rt > 0) o.completion = round3(us.reduce((a, u) => a + Math.min(1, u.secs / rt), 0));
      return o;
    });
  const m = out(movies, 'Movie', (ws) => ws.reduce((a, w) => a + w, 0), true);
  const s = out(series, 'Series', (ws) => ws.reduce((a, w) => a + Math.log2(1 + w), 0), false);
  const strip = ({ id, viewers, plays, seconds, score }) => ({ id, viewers, plays, seconds, score });
  const stripMovie = (x) => (x.completion === undefined ? strip(x) : { ...strip(x), completion: x.completion });
  const noScore = ({ id, type, viewers, plays, seconds }) => ({ id, type, viewers, plays, seconds });
  return {
    movies: [...m].sort(byScoreMovie).slice(0, limit).map(stripMovie),
    series: [...s].sort(byScoreSeries).slice(0, limit).map(strip),
    all: [...[...m].sort(byRank), ...[...s].sort(byRank)].sort(byRank).slice(0, limit).map(noScore),
  };
}
