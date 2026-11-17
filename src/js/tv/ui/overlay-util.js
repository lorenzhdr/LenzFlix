// Hilfen für den TV-Modus: Beschreibung und Badges eines Plan-Eintrags. Rein, keine Importe außerhalb von src/js/tv/.

/** Normalisierte Genre-Schlüssel (klein) → Anzeige-Labels aus scheduler.genres(); unbekannte werden groß geschrieben. */
function genreLabels(scheduler, norms) {
  const list = Array.isArray(norms) ? norms : [];
  let map;
  try {
    map = new Map((scheduler && scheduler.genres ? scheduler.genres() : []).map((g) => [String(g.label).trim().normalize('NFC').toLowerCase(), g.label]));
  } catch { map = new Map(); }
  return list.map((n) => map.get(n) || (n ? n.charAt(0).toUpperCase() + n.slice(1) : n));
}

/**
 * Beschreibt einen Plan-Eintrag. Liest die normalisierten CatalogItem-Felder (schedule/catalog.js):
 * title, seriesTitle, season, episode (9999 = unbekannt), year, genres[] (normalisiert), durMs, kind ('movie'|'episode'), seriesId.
 */
export function describe(scheduler, entry) {
  const out = { title: '', sub: '', year: null, genres: [], runMin: null, kind: 'movie', seriesId: entry.seriesId || null, itemId: entry.itemId || null };
  if (entry.type === 'closedown') {
    out.title = 'Sendeschluss';
    return out;
  }
  const it = entry.itemId && scheduler && scheduler.item ? scheduler.item(entry.itemId) : null;
  if (!it) {
    out.title = entry.label || '';
    return out;
  }
  const name = it.title || '';
  const series = it.seriesTitle || null;
  const known = (n) => (n != null && n !== 9999 ? n : null);
  const season = known(it.season);
  const ep = known(it.episode);
  if (it.kind === 'episode') {
    out.kind = 'episode';
    let se = '';
    if (season != null) se += 'S' + season;
    if (ep != null) se += (se ? ' ' : '') + 'E' + ep;
    out.title = [series, [se, name].filter(Boolean).join(' ')].filter(Boolean).join(' – ');
    out.seriesId = out.seriesId || it.seriesId || null;
  } else {
    out.title = name;
  }
  out.year = it.year || null;
  out.genres = genreLabels(scheduler, it.genres);
  out.runMin = it.durMs ? Math.round(it.durMs / 60000) : null;
  return out;
}

/** Badge-Texte eines Eintrags. */
export function badges(entry) {
  const b = [];
  if (entry.premiere === 'film') b.push('Premiere');
  else if (entry.premiere === 'episode') b.push('Neue Folge');
  if (entry.rerun) b.push('Wdh.');
  if (entry.age === 16 || entry.age === 18) b.push('ab ' + entry.age);
  return b;
}
