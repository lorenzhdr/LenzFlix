// LENZPRIME Titelseite: reine Logik ohne DOM (gut testbar).
import { formatRuntime, hasResume, peopleOf, progressPercent } from '../modal/format.js';

const TICKS_PER_MIN = 600_000_000;

/** Episode/Staffel -> Serie (Staffel/Folge vorgewählt); alles andere bleibt. */
export function resolveTarget(item, id) {
  const sel = { seasonId: null, episodeId: null };
  let targetId = id;
  if (item && item.Type === 'Episode') {
    targetId = item.SeriesId || item.ParentId || id;
    sel.episodeId = item.Id;
    sel.seasonId = item.SeasonId || item.ParentId || null;
  } else if (item && item.Type === 'Season') {
    targetId = item.SeriesId || item.ParentId || id;
    sel.seasonId = item.Id;
  }
  return { targetId, sel };
}

/** "FSK-16" -> {text:'16', tone:'16'}; "FSK-0" -> {text:'0', tone:'6'}; sonst Rohtext. Leer -> null. */
export function ratingChip(rating) {
  const r = String(rating || '').trim();
  if (!r) return null;
  const m = /(\d{1,2})/.exec(r);
  if (!m) return { text: r.slice(0, 6), tone: '16' };
  const n = Number(m[1]);
  return { text: String(n), tone: n >= 16 ? '16' : n >= 12 ? '12' : '6' };
}

/** Meta-Teile der Titelseite (ohne Bewertung als Chip): ['★ 7,4', '2024', '1 Std. 52 Min.' | '3 Staffeln']. */
export function metaItems(item, seasonCount = 0) {
  const out = [];
  const score = Number(item && item.CommunityRating);
  if (score > 0) out.push(`★ ${score.toFixed(1).replace('.', ',')}`);
  if (item && item.ProductionYear) out.push(String(item.ProductionYear));
  if (item && item.Type === 'Series') {
    const n = seasonCount || Number(item.ChildCount) || 0;
    if (n > 0) out.push(`${n} ${n === 1 ? 'Staffel' : 'Staffeln'}`);
  } else {
    const rt = formatRuntime(item && item.RunTimeTicks);
    if (rt) out.push(rt);
  }
  return out;
}

/**
 * Primär-Button: { label, sub, progress, target, resume }.
 * Serie: nächste Folge (nextUp) – "Fortsetzen"/"S1 F3" bzw. "Folge 3"/"Jetzt ansehen"; ohne nextUp "Abspielen".
 */
export function playInfo(main, nextUp) {
  const isSeries = main && main.Type === 'Series';
  if (isSeries && nextUp) {
    const resume = hasResume(nextUp);
    const n = nextUp.IndexNumber != null ? nextUp.IndexNumber : null;
    const s = nextUp.ParentIndexNumber != null ? nextUp.ParentIndexNumber : null;
    const code = s != null && n != null ? `S${s} F${n}` : n != null ? `Folge ${n}` : '';
    return {
      label: resume ? 'Fortsetzen' : n != null ? `Folge ${n}` : 'Abspielen',
      sub: resume ? code : 'Jetzt ansehen',
      progress: resume ? progressPercent(nextUp) : 0,
      target: nextUp,
      resume,
    };
  }
  const resume = !isSeries && hasResume(main);
  return {
    label: resume ? 'Fortsetzen' : 'Abspielen',
    sub: '',
    progress: resume ? progressPercent(main) : 0,
    target: main,
    resume,
  };
}

/** "Noch 43 Min." für angefangene Folgen, sonst ''. */
export function remainingLabel(ep) {
  const ud = ep && ep.UserData;
  if (!ud || !(ud.PlaybackPositionTicks > 0) || !(ep.RunTimeTicks > 0)) return '';
  const left = Math.round((ep.RunTimeTicks - ud.PlaybackPositionTicks) / TICKS_PER_MIN);
  return left > 0 ? `Noch ${left} Min.` : '';
}

/** Laufzeit einer Folge: "46 Min." */
export function episodeRuntime(ep) {
  return formatRuntime(ep && ep.RunTimeTicks);
}

export function episodeTitle(ep) {
  const n = ep && ep.IndexNumber != null ? `${ep.IndexNumber}. ` : '';
  return `${n}${(ep && ep.Name) || ''}`.trim();
}

export function seasonName(season) {
  if (!season) return '';
  if (season.IndexNumber === 0) return season.Name || 'Extras';
  if (season.IndexNumber > 0) return `Staffel ${season.IndexNumber}`;
  return season.Name || 'Staffel';
}

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

function streamsOf(item, type) {
  const out = [];
  for (const src of (item && item.MediaSources) || []) {
    for (const s of src.MediaStreams || []) if (s && s.Type === type) out.push(s);
  }
  return out;
}

/** Info-Kacheln der Details-Registerkarte: [{ id, title, text?, lines?, chips? }] (leere Kacheln entfallen). */
export function detailTiles(item, seasonCount = 0) {
  if (!item) return [];
  const tiles = [];
  const facts = [...metaItems(item, seasonCount)];
  tiles.push({ id: 'info', title: item.Name || '', lines: facts.length ? [facts.join('  ·  ')] : [], text: item.Overview || '' });
  if (item.Genres && item.Genres.length) tiles.push({ id: 'genres', title: 'Genres', chips: item.Genres.slice(0, 12) });
  const actors = peopleOf(item, 'Actor').slice(0, 14);
  if (actors.length) tiles.push({ id: 'cast', title: 'Besetzung', lines: actors.map((p) => (p.Role ? `${p.Name} (${p.Role})` : p.Name)) });
  const directors = peopleOf(item, 'Director');
  const writers = peopleOf(item, 'Writer');
  if (directors.length || writers.length) {
    const lines = [];
    if (directors.length) lines.push(`Regie: ${directors.map((p) => p.Name).join(', ')}`);
    if (writers.length) lines.push(`Drehbuch: ${writers.slice(0, 6).map((p) => p.Name).join(', ')}`);
    tiles.push({ id: 'crew', title: 'Kreative', lines });
  }
  const studios = uniq(((item.Studios) || []).map((s) => s && s.Name));
  if (studios.length) tiles.push({ id: 'studio', title: 'Studio', lines: [studios.join(', ')] });
  const audio = uniq(streamsOf(item, 'Audio').map((s) => s.DisplayLanguage || s.Language));
  if (audio.length) tiles.push({ id: 'audio', title: 'Wiedergabesprachen', chips: audio });
  const subs = uniq(streamsOf(item, 'Subtitle').map((s) => s.DisplayLanguage || s.Language));
  if (subs.length) tiles.push({ id: 'subs', title: 'Untertitel', chips: subs });
  if (item.Type !== 'Series' && item.RunTimeTicks > 0) tiles.push({ id: 'runtime', title: 'Laufzeit', lines: [formatRuntime(item.RunTimeTicks)] });
  return tiles;
}
