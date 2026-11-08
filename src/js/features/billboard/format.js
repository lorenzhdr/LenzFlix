// LenzFlix: Billboard – reine Formatierungs-/Auswahl-Logik (testbar ohne DOM).

const DAY = 86400000;
export const NEW_DAYS = 14;

export function hasLogoAndBackdrop(it) {
  return Boolean(it && it.Id && it.ImageTags && it.ImageTags.Logo && it.BackdropImageTags && it.BackdropImageTags.length);
}

/** Mischt abwechselnd neu/zufällig, entfernt Duplikate und Items ohne Logo+Backdrop. */
export function mixPool(latest, random, perList = 6) {
  const a = (latest || []).filter(hasLogoAndBackdrop).slice(0, perList);
  const b = (random || []).filter(hasLogoAndBackdrop).slice(0, perList);
  const out = [];
  const seen = new Set();
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    for (const it of [a[i], b[i]]) {
      if (it && !seen.has(it.Id)) {
        seen.add(it.Id);
        out.push(it);
      }
    }
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
