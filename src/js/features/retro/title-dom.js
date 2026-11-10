// LENZ//84: DOM-Bausteine der Titelseite (Poster-Hülle, Aufkleber, Kassetten-Etiketten für Folgen). Gehört Worker P2.
import * as api from '../../core/api.js';
import { h } from '../../core/dom.js';
import { formatRuntime, progressPercent } from '../modal/format.js';
import { landscapeFor } from '../rows/card.js';
import { ratingChip, episodeRuntime, remainingLabel } from '../prime/title-logic.js';

const pad2 = (n) => String(n).padStart(2, '0');

/** S01E03 (leer, wenn Nummern fehlen). */
export function episodeCode(ep) {
  if (!ep || ep.IndexNumber == null) return '';
  return ep.ParentIndexNumber != null ? `S${pad2(ep.ParentIndexNumber)}E${pad2(ep.IndexNumber)}` : `E${pad2(ep.IndexNumber)}`;
}

/** Tab-Beschriftung einer Staffel: TAPE 1, TAPE 2 … (Staffel 0 = EXTRAS). */
export function tapeName(season, index = 0) {
  if (season && season.IndexNumber === 0) return 'EXTRAS';
  if (season && season.IndexNumber > 0) return `TAPE ${season.IndexNumber}`;
  return `TAPE ${index + 1}`;
}

/** Laufzeit-Aufkleber: 1H57 bzw. 45 MIN (leer ohne Laufzeit). */
export function runtimeSticker(ticks) {
  const mins = Math.round((Number(ticks) || 0) / 600_000_000);
  if (mins < 1) return '';
  const hh = Math.floor(mins / 60);
  return hh ? `${hh}H${pad2(mins % 60)}` : `${mins} MIN`;
}

export function backdropUrl(item) {
  return api.imageUrl(item, { type: 'Backdrop', maxWidth: 1920, quality: 70 }) || api.landscapeImage(item, { maxWidth: 1920, quality: 70 });
}

/** Aufkleber der Vorderseite (generisch, keine Marken). */
export function buildStickers(main) {
  const out = [];
  out.push(h('span', { class: 'lfx-rt__sticker lfx-rt__sticker--stereo' }, 'STEREO'));
  if (main.Width && Number(main.Width) >= 1200) out.push(h('span', { class: 'lfx-rt__sticker lfx-rt__sticker--hd' }, 'HD'));
  else out.push(h('span', { class: 'lfx-rt__sticker lfx-rt__sticker--color' }, 'FARBE'));
  const chip = ratingChip(main.OfficialRating);
  if (chip) {
    out.push(h('span', { class: 'lfx-rt__sticker lfx-rt__sticker--fsk', dataset: { tone: chip.tone }, 'aria-label': `Altersfreigabe ${chip.text}` }, [
      h('span', { class: 'lfx-rt__fsk-label', 'aria-hidden': 'true' }, 'FSK'),
      h('span', { class: 'lfx-rt__fsk-num', 'aria-hidden': 'true' }, chip.text),
    ]));
  }
  const rt = main.Type === 'Series' ? '' : runtimeSticker(main.RunTimeTicks);
  if (rt) out.push(h('span', { class: 'lfx-rt__sticker lfx-rt__sticker--time' }, rt));
  return out;
}

/** Vorderseite: Poster in Klarsicht-Hülle mit Folienglanz. */
export function buildFront(main) {
  const src = api.imageUrl(main, { type: 'Primary', maxWidth: 700, quality: 85 });
  const media = src
    ? h('img', { class: 'lfx-rt__poster', src, alt: main.Name || '', decoding: 'async' })
    : h('span', { class: 'lfx-rt__poster lfx-rt__poster--none' }, main.Name || '');
  return h('div', { class: 'lfx-rt__front' }, [
    h('div', { class: 'lfx-rt__sleeve' }, [
      h('div', { class: 'lfx-rt__art' }, [media, h('span', { class: 'lfx-rt__foil', 'aria-hidden': 'true' })]),
      h('div', { class: 'lfx-rt__stickers' }, buildStickers(main)),
      h('span', { class: 'lfx-rt__hinge', 'aria-hidden': 'true' }),
    ]),
  ]);
}

/** Meta-Teile für die Metazeile der Rückseite. */
export function metaList(main) {
  const out = [];
  if (main.ProductionYear) out.push(String(main.ProductionYear));
  if (main.Type === 'Series') {
    const n = Number(main.ChildCount) || 0;
    if (n > 0) out.push(`${n} ${n === 1 ? 'STAFFEL' : 'STAFFELN'}`);
  } else {
    const rt = formatRuntime(main.RunTimeTicks);
    if (rt) out.push(rt);
  }
  const g = (main.Genres || []).slice(0, 3).join(' / ');
  if (g) out.push(g);
  const score = Number(main.CommunityRating);
  if (score > 0) out.push(`WERTUNG ${score.toFixed(1).replace('.', ',')}`);
  return out;
}

/**
 * Folge als Kassetten-Etikett (li > button). Fortschritt = Bandwickel (zwei Spulen, --rt-fill 0..1).
 * opts: { selected, next, onPlay }
 */
export function buildEpisode(ep, { selected = false, next = false, onPlay } = {}) {
  const p = progressPercent(ep);
  const played = Boolean(ep.UserData && ep.UserData.Played === true);
  const fill = played ? 1 : Math.max(0, Math.min(1, p / 100));
  const code = episodeCode(ep);
  const src = api.imageUrl(ep, { type: 'Primary', maxWidth: 480, quality: 80 }) || (landscapeFor(ep, 480) || {}).url || null;
  const mins = episodeRuntime(ep);
  const left = remainingLabel(ep);
  const num = ep.IndexNumber != null ? pad2(ep.IndexNumber) : '--';
  const btn = h('button', {
    type: 'button',
    class: `lfx-rt__ep${selected ? ' is-selected' : ''}${next ? ' is-next' : ''}${played ? ' is-played' : ''}`,
    dataset: { id: ep.Id },
    'aria-label': `${code ? `${code} ` : ''}${ep.Name || ''} abspielen`,
    onclick: () => { if (onPlay) onPlay(ep); },
  }, [
    h('span', { class: 'lfx-rt__ep-no', 'aria-hidden': 'true' }, num),
    h('span', { class: 'lfx-rt__ep-thumb', 'aria-hidden': 'true' }, src ? [h('img', { src, alt: '', loading: 'lazy', decoding: 'async' })] : []),
    h('span', { class: 'lfx-rt__ep-label' }, [
      h('span', { class: 'lfx-rt__ep-meta' }, [code, mins, left].filter(Boolean).join('  ·  ')),
      h('span', { class: 'lfx-rt__ep-title' }, ep.Name || `Folge ${num}`),
      ep.Overview ? h('span', { class: 'lfx-rt__ep-text' }, ep.Overview) : null,
    ]),
    h('span', { class: 'lfx-rt__ep-reels', 'aria-hidden': 'true' }, [
      h('span', { class: 'lfx-rt__reel lfx-rt__reel--l' }),
      h('span', { class: 'lfx-rt__reel lfx-rt__reel--r' }),
    ]),
    next ? h('span', { class: 'lfx-rt__ep-next' }, 'NÄCHSTE') : null,
  ]);
  btn.style.setProperty('--rt-fill', String(Math.round(fill * 100) / 100));
  return h('li', { class: 'lfx-rt__ep-item' }, [btn]);
}
