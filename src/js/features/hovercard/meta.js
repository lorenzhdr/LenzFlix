// LenzFlix Hovercard: reine Formatierungs- und Positionsfunktionen (ohne DOM-Zugriff, gut testbar).

const TICKS_PER_MIN = 600_000_000;

/** „FSK-12“ -> „12“, „FSK 0“ -> „0“; andere Freigaben (PG-13, TV-MA …) bleiben unverändert. */
export function formatRating(rating) {
  if (!rating) return '';
  const s = String(rating).trim();
  const m = /^(?:DE[-\s_:]*)?(?:FSK)[-\s_:]*(\d+)$/i.exec(s) || /^DE[-\s_:]*(\d+)$/i.exec(s);
  return m ? m[1] : s;
}

/** Minuten -> „1 Std. 46 Min.“ / „2 Std.“ / „46 Min.“ ; 0 -> ''. */
export function formatMinutes(totalMin) {
  const min = Math.round(totalMin);
  if (!(min > 0)) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} Std. ${m} Min.`;
  if (h) return `${h} Std.`;
  return `${m} Min.`;
}

export function formatRuntimeTicks(ticks) {
  return ticks > 0 ? formatMinutes(ticks / TICKS_PER_MIN) : '';
}

/** Laufzeit bzw. Umfang: Film „1 Std. 46 Min.“, Serie „N Staffeln“ (Miniserie: „N Folgen“). */
export function formatDuration(item) {
  if (!item) return '';
  const count = item.ChildCount || 0;
  switch (item.Type) {
    case 'Series': {
      const episodes = item.RecursiveItemCount || 0;
      if (count === 1 && episodes > 0) return `${episodes} ${episodes === 1 ? 'Folge' : 'Folgen'}`;
      if (count > 0) return `${count} ${count === 1 ? 'Staffel' : 'Staffeln'}`;
      return episodes > 0 ? `${episodes} ${episodes === 1 ? 'Folge' : 'Folgen'}` : '';
    }
    case 'Season':
      return count > 0 ? `${count} ${count === 1 ? 'Folge' : 'Folgen'}` : '';
    case 'BoxSet':
      return count > 0 ? `${count} Titel` : '';
    default:
      return formatRuntimeTicks(item.RunTimeTicks);
  }
}

/** „4K“ (Breite ≥ 3800), „HD“ (≥ 1200) oder null. Breite aus Item.Width bzw. dem ersten Video-Stream. */
export function qualityBadge(item) {
  if (!item) return null;
  let width = item.Width || 0;
  if (!width) {
    const sources = item.MediaSources || [];
    for (const src of sources) {
      const v = (src.MediaStreams || []).find((s) => s.Type === 'Video' && s.Width);
      if (v) {
        width = v.Width;
        break;
      }
    }
  }
  if (width >= 3800) return '4K';
  if (width >= 1200) return 'HD';
  return null;
}

/** Fortschritt in Prozent (0–100) aus UserData; 0 wenn nicht begonnen. */
export function progressPercent(item) {
  const ud = item && item.UserData;
  if (!ud) return 0;
  let pct = 0;
  if (item.RunTimeTicks > 0 && ud.PlaybackPositionTicks > 0) pct = (ud.PlaybackPositionTicks / item.RunTimeTicks) * 100;
  else if (ud.PlayedPercentage > 0) pct = ud.PlayedPercentage;
  return Math.max(0, Math.min(100, pct));
}

/** „noch 38 Min.“ bzw. „noch 1 Std. 5 Min.“ (aufgerundet) oder ''. */
export function remainingText(item) {
  const ud = item && item.UserData;
  if (!item || !(item.RunTimeTicks > 0) || !ud || !(ud.PlaybackPositionTicks > 0)) return '';
  const left = Math.ceil((item.RunTimeTicks - ud.PlaybackPositionTicks) / TICKS_PER_MIN);
  const text = formatMinutes(Math.max(1, left));
  return `noch ${text}`;
}

/** Episodenzeile: F3 „Titel“. */
export function episodeLabel(item) {
  if (!item) return '';
  const name = item.Name ? `„${item.Name}“` : '';
  const n = item.IndexNumber;
  return [n || n === 0 ? `F${n}` : '', name].filter(Boolean).join(' ');
}

export function genreList(item, max = 3) {
  const g = (item && item.Genres) || [];
  return g.filter(Boolean).slice(0, max);
}

/**
 * Popup-Rechteck aus Kartenrechteck.
 * - Breite = max(cardW * scale, minWidth); Bildteil (16:9) vertikal an der Kartenmitte zentriert.
 * - Horizontal zentriert; ragt es links/rechts über den Viewport, bündig mit der Karte (linke bzw. rechte Kante);
 *   zuletzt hart in [pad, viewportW - pad - width] geklemmt.
 * Rückgabe: {left, top, width, imageHeight}
 */
export function computePopupRect(cardRect, viewportW, scale = 1.5, { minWidth = 0, pad = 8, viewportH } = {}) {
  const cardW = cardRect.width !== undefined ? cardRect.width : cardRect.right - cardRect.left;
  const cardH = cardRect.height !== undefined ? cardRect.height : cardRect.bottom - cardRect.top;
  const cardLeft = cardRect.left;
  const cardTop = cardRect.top;
  const width = Math.min(Math.max(cardW * scale, minWidth), Math.max(0, viewportW - 2 * pad));
  const imageHeight = (width * 9) / 16;
  let left = cardLeft + cardW / 2 - width / 2;
  if (left < pad) left = cardLeft;
  else if (left + width > viewportW - pad) left = cardLeft + cardW - width;
  left = Math.max(pad, Math.min(left, viewportW - pad - width));
  let top = cardTop + cardH / 2 - imageHeight / 2;
  if (viewportH) top = Math.max(pad, Math.min(top, viewportH - pad - imageHeight));
  return { left, top, width, imageHeight };
}
