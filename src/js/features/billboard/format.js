// LenzFlix: Billboard – reine Formatierungs-/Auswahl-Logik (testbar ohne DOM).

const DAY = 86400000;
export const NEW_DAYS = 14;

export function hasLogoAndBackdrop(it) {
  return Boolean(it && it.Id && it.ImageTags && it.ImageTags.Logo && it.BackdropImageTags && it.BackdropImageTags.length);
}

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Baut den Billboard-Pool: Zufall zuerst, dann abwechselnd neu/zufällig (Z N Z N … Z Z).
 * - Neue: die `newCount` neuesten (Logo+Backdrop), in zufälliger Reihenfolge.
 * - Zufällige: `randomCount` Stück ohne Überschneidung mit den Neuen.
 * - Slide 1: bevorzugt Zufallstitel mit lokalem Trailer, nie `avoidFirstId` (außer es gibt keine Alternative).
 */
export function buildPool(latest, random, opts = {}) {
  const { newCount = 4, randomCount = 8, avoidFirstId = null, rng = Math.random } = opts;
  const uniq = (list, skip) => {
    const seen = new Set(skip);
    const out = [];
    for (const it of list || []) {
      if (hasLogoAndBackdrop(it) && !seen.has(it.Id)) {
        seen.add(it.Id);
        out.push(it);
      }
    }
    return out;
  };
  const a = shuffled(uniq(latest, []).slice(0, newCount), rng);
  const b = uniq(random, a.map((it) => it.Id)).slice(0, randomCount);
  const fresh = b.filter((it) => it.Id !== avoidFirstId);
  const first = fresh.find((it) => it.LocalTrailerCount > 0) || fresh[0];
  if (first) {
    b.splice(b.indexOf(first), 1);
    b.unshift(first);
  }
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (b[i]) out.push(b[i]);
    if (a[i]) out.push(a[i]);
  }
  return out;
}

/** "1 Std. 46 Min." */
export function formatRuntime(ticks) {
  const total = Math.round((Number(ticks) || 0) / 600000000);
  if (total <= 0) return '';
  const hrs = Math.floor(total / 60);
  const min = total % 60;
  if (!hrs) return `${min} Min.`;
  return min ? `${hrs} Std. ${min} Min.` : `${hrs} Std.`;
}

/** "FSK-12" -> "12"; unbekannte Formate bleiben unverändert. */
export function formatRating(rating) {
  const s = String(rating || '').trim();
  if (!s) return '';
  const m = /^(?:FSK|DE)[\s-]*(\d{1,2})$/i.exec(s);
  return m ? m[1] : s;
}

export function formatSeasons(n) {
  const c = Number(n) || 0;
  if (c <= 0) return '';
  return c === 1 ? '1 Staffel' : `${c} Staffeln`;
}

/** Meta-Zeile als Array von {text, rating?}. */
export function metaParts(item) {
  const parts = [];
  const isSeries = item.Type === 'Series';
  parts.push({ text: isSeries ? 'Serie' : 'Film' });
  if (item.Genres && item.Genres[0]) parts.push({ text: item.Genres[0] });
  if (item.ProductionYear) parts.push({ text: String(item.ProductionYear) });
  const extra = isSeries ? formatSeasons(item.ChildCount) : formatRuntime(item.RunTimeTicks);
  if (extra) parts.push({ text: extra });
  const rating = formatRating(item.OfficialRating);
  if (rating) parts.push({ text: rating, rating: true });
  return parts;
}

/** Mobile Genre-Zeile: bis zu 3 Genres, getrennt mit " • ". */
export function genreLine(item) {
  const g = item && Array.isArray(item.Genres) ? item.Genres.filter(Boolean).slice(0, 3) : [];
  return g.join(' • ');
}

/** Badge-Text oder null (DateCreated < 14 Tage -> "Neu hinzugefügt"). */
export function badgeFor(item, now = Date.now()) {
  const t = item && item.DateCreated ? Date.parse(item.DateCreated) : NaN;
  if (Number.isFinite(t) && now - t >= 0 && now - t < NEW_DAYS * DAY) return 'Neu hinzugefügt';
  return null;
}

export function hasProgress(item) {
  return Boolean(item && item.UserData && item.UserData.PlaybackPositionTicks > 0);
}
