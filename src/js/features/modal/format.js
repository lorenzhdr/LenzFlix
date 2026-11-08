// LenzFlix Modal: reine Formatierungs-Helfer (ohne DOM, gut testbar).

const TICKS_PER_MIN = 600_000_000;

/** 6_720_000_000 -> "1 Std. 52 Min." */
export function formatRuntime(ticks) {
  const mins = Math.round((Number(ticks) || 0) / TICKS_PER_MIN);
  if (mins < 1) return '';
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  if (!hh) return `${mins} Min.`;
  return mm ? `${hh} Std. ${mm} Min.` : `${hh} Std.`;
}

export function seasonsLabel(n) {
  const c = Number(n) || 0;
  if (c < 1) return '';
  return `${c} ${c === 1 ? 'Staffel' : 'Staffeln'}`;
}

/** "HD" ab ~1200 px Breite, "4K" ab ~3000 px; sonst ''. */
export function qualityLabel(item) {
  if (!item) return '';
  let width = Number(item.Width) || 0;
  if (!width) {
    const sources = item.MediaSources || [];
    for (const src of sources) {
      const v = (src.MediaStreams || []).find((s) => s.Type === 'Video' && s.Width);
      if (v) { width = Number(v.Width); break; }
    }
  }
  if (width >= 3000) return '4K';
  if (width >= 1200) return 'HD';
  return '';
}

/** Lesbarer Text zur Altersfreigabe ("FSK-12" -> "Freigegeben ab 12 Jahren"). */
export function ratingText(rating) {
  const r = String(rating || '').trim();
  if (!r) return '';
  const m = /(\d{1,2})/.exec(r);
  if (!m) return /^(fsk[- ]?)?(0|ohne|alle|g)$/i.test(r) ? 'Ohne Altersbeschränkung' : r;
  const n = Number(m[1]);
  return n === 0 ? 'Ohne Altersbeschränkung' : `Freigegeben ab ${n} Jahren`;
}

/** Meta-Zeile: {year, length, quality, rating} (leere Strings, wenn nicht vorhanden). */
export function metaParts(item) {
  if (!item) return { year: '', length: '', quality: '', rating: '' };
  const isSeries = item.Type === 'Series';
  return {
    year: item.ProductionYear ? String(item.ProductionYear) : '',
    length: isSeries ? seasonsLabel(item.ChildCount) : formatRuntime(item.RunTimeTicks),
    quality: qualityLabel(item),
    rating: item.OfficialRating || '',
  };
}

export function peopleOf(item, type) {
  const seen = new Set();
  const out = [];
  for (const p of (item && item.People) || []) {
    if (!p || p.Type !== type || !p.Name || seen.has(p.Name)) continue;
    seen.add(p.Name);
    out.push(p);
  }
  return out;
}

/** Fortschritt 0..100 aus UserData (Position/Laufzeit) oder PlayedPercentage. */
export function progressPercent(item) {
  const ud = item && item.UserData;
  if (!ud) return 0;
  if (ud.PlaybackPositionTicks > 0 && item.RunTimeTicks > 0) {
    return Math.max(0, Math.min(100, (ud.PlaybackPositionTicks / item.RunTimeTicks) * 100));
  }
  return ud.PlayedPercentage > 0 && ud.PlayedPercentage < 100 ? ud.PlayedPercentage : 0;
}

export function hasResume(item) {
  const ud = item && item.UserData;
  return Boolean(ud && ud.PlaybackPositionTicks > 0);
}

export function episodeLabel(ep) {
  return ep && ep.IndexNumber != null ? String(ep.IndexNumber) : '';
}

/** Staffel, die nach dem Öffnen vorgewählt wird. */
export function pickInitialSeason(seasons, preferredId) {
  if (!seasons || !seasons.length) return null;
  if (preferredId && seasons.some((s) => s.Id === preferredId)) return preferredId;
  const regular = seasons.find((s) => s.IndexNumber > 0);
  return (regular || seasons[0]).Id;
}
