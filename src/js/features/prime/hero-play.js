// LENZPRIME: Abspiel-Logik für Hero und Hover (Fortsetzen, Folge N, Serien-Ziel wie im Detail-Modal).
import { play } from '../../core/playback.js';
import * as data from '../modal/data.js';
import { hasResume, pickInitialSeason, progressPercent } from '../modal/format.js';

/** Zu spielende Folge einer Serie: nächste Folge, sonst erste Folge der ersten Staffel; null wenn nichts da ist. */
export async function seriesTarget(series) {
  let target = await data.loadNextUp(series.Id).catch(() => null);
  if (!target) {
    const seasons = await data.loadSeasons(series.Id).catch(() => []);
    const sid = pickInitialSeason(seasons, null);
    const eps = sid ? await data.loadEpisodes(series.Id, sid).catch(() => []) : [];
    target = eps[0] || null;
  }
  return target;
}

/** Spielt Film/Folge direkt, bei Serien die passende Folge. Rückgabe: true, wenn die Wiedergabe ausgelöst wurde. */
export async function playTitle(item) {
  if (!item || !item.Id) return false;
  let target = item;
  if (item.Type === 'Series') target = await seriesTarget(item);
  if (!target) return false;
  return play(target, { resume: hasResume(target) });
}

/**
 * Beschriftung des Abspiel-Knopfs. Film/Folge: „Abspielen“/„Fortsetzen“. Serie mit bekannter nächster Folge `next`:
 * zweizeilig „Folge N“ + „Fortsetzen“/„weiter ansehen“; ohne Vorgeschichte „Abspielen“.
 * Rückgabe { line1, line2|null, progress (0..100) }.
 */
export function playLabel(item, next = null) {
  if (item && item.Type === 'Series') {
    if (!next) return { line1: 'Abspielen', line2: null, progress: 0 };
    const resume = hasResume(next);
    const started = resume || next.IndexNumber > 1 || next.ParentIndexNumber > 1;
    if (!started) return { line1: 'Abspielen', line2: null, progress: 0 };
    const n = next.IndexNumber != null ? `Folge ${next.IndexNumber}` : 'Nächste Folge';
    return { line1: n, line2: resume ? 'Fortsetzen' : 'weiter ansehen', progress: resume ? progressPercent(next) : 0 };
  }
  const resume = hasResume(item);
  return { line1: resume ? 'Fortsetzen' : 'Abspielen', line2: null, progress: resume ? progressPercent(item) : 0 };
}
