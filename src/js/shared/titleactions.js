// LenzFlix: UI-unabhängige Titel-Aktionen (Gesehen, Meine Liste, Bewertung, Download, Titelmenü).
// Logik entspricht dem Detail-Modal (features/modal.js), ohne dessen DOM. Jede Funktion liefert ein Promise mit dem neuen Zustand.
import * as api from '../core/api.js';
import { clearCache } from '../core/cache.js';
import { confirmAction } from '../core/sheet.js';
import { toast } from '../core/toast.js';
import { putItems } from '../core/itemstore.js';
import { startDownload } from '../core/download.js';
import { openItemMenu } from '../core/itemmenu.js';
import * as data from '../features/modal/data.js';

const SAVE_ERROR = 'Konnte nicht gespeichert werden';
const isPlayed = (it) => Boolean(it && it.UserData && it.UserData.Played === true);
const folgen = (n) => (n === 1 ? '1 Folge' : `${n} Folgen`);

function clearPlayedCaches(itemId, seriesId) {
  clearCache(`lfx:modal:item:${itemId}`);
  if (seriesId) {
    clearCache(`lfx:modal:next:${seriesId}`);
    clearCache(`lfx:modal:eps:${seriesId}:`);
  }
}

/** Setzt Gesehen für Serie/Staffel (rekursiv serverseitig) und zieht Folgen mit falschem Status nach. Liefert Anzahl Fehlschläge. */
async function bulkPlayed(seriesId, targetId, seasonIds, next) {
  await api.setPlayed(targetId, next);
  clearPlayedCaches(seriesId, seriesId);
  const wrong = [];
  for (const sid of seasonIds) {
    try {
      for (const e of await data.loadEpisodes(seriesId, sid)) if (isPlayed(e) !== next) wrong.push(e);
    } catch { /* Absicherung best effort */ }
  }
  let failed = 0;
  for (let i = 0; i < wrong.length; i += 6) {
    const res = await Promise.allSettled(wrong.slice(i, i + 6).map((e) => api.setPlayed(e.Id, next)));
    failed += res.filter((r) => r.status === 'rejected').length;
  }
  clearPlayedCaches(seriesId, seriesId);
  return failed;
}

/** Wartet auf die Bestätigung; löst mit true (bestätigt) oder false (Sheet ohne Bestätigung geschlossen). */
function askConfirm({ title, confirmLabel, anchorEl }) {
  return new Promise((resolve) => {
    let done = false;
    let obs = null;
    const settle = (v) => {
      if (done) return;
      done = true;
      if (obs) obs.disconnect();
      resolve(v);
    };
    const sheet = confirmAction({ title, confirmLabel, anchorEl, onConfirm: () => settle(true) });
    const overlay = sheet && sheet.overlay;
    if (overlay && typeof MutationObserver === 'function') {
      obs = new MutationObserver(() => { if (!overlay.isConnected) settle(false); });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  });
}

async function bulkToggle(item, anchorEl) {
  const isSeries = item.Type === 'Series';
  const seriesId = isSeries ? item.Id : item.SeriesId || item.ParentId;
  let seasonIds;
  let episodeLists;
  try {
    if (isSeries) {
      const seasons = await data.loadSeasons(item.Id);
      seasonIds = seasons.map((s) => s.Id);
    } else {
      seasonIds = [item.Id];
    }
    episodeLists = [];
    for (const sid of seasonIds) episodeLists.push(await data.loadEpisodes(seriesId, sid));
  } catch {
    seasonIds = seasonIds || [];
    episodeLists = episodeLists || [];
  }
  const eps = episodeLists.flat();
  const prev = isPlayed(item);
  const next = isSeries ? !prev : !(eps.length > 0 && eps.every(isPlayed));
  const n = eps.length;
  const verb = next ? 'gesehen' : 'ungesehen';
  const ok = await askConfirm({
    title: n ? `${folgen(n)} als ${verb} markieren?` : `Alle Folgen als ${verb} markieren?`,
    confirmLabel: `Als ${verb} markieren`,
    anchorEl,
  });
  if (!ok) return prev;
  try {
    const failed = await bulkPlayed(seriesId, item.Id, seasonIds, next);
    if (failed) {
      toast(SAVE_ERROR);
      return prev;
    }
    item.UserData = { ...(item.UserData || {}), Played: next };
    putItems([item]);
    toast(isSeries ? `Serie als ${verb} markiert` : `${folgen(n)} als ${verb} markiert`);
    return next;
  } catch {
    toast(SAVE_ERROR);
    return prev;
  }
}

/** Gesehen/Ungesehen. Serie/Staffel: mit Bestätigung und Bulk. Liefert den neuen Gesehen-Zustand (bei Abbruch/Fehler den alten). */
export async function togglePlayed(item, { anchorEl } = {}) {
  if (!item || !item.Id) return false;
  if (item.Type === 'Series' || item.Type === 'Season') return bulkToggle(item, anchorEl);
  const prev = { ...(item.UserData || {}) };
  const next = prev.Played !== true;
  item.UserData = { ...prev, Played: next, PlaybackPositionTicks: 0 };
  delete item.UserData.PlayedPercentage;
  try {
    await api.setPlayed(item.Id, next);
  } catch {
    item.UserData = prev;
    toast(SAVE_ERROR);
    return prev.Played === true;
  }
  putItems([item]);
  clearPlayedCaches(item.Id, item.Type === 'Episode' ? item.SeriesId : null);
  return next;
}

/** Meine Liste an/aus (optimistisch, bei Fehler zurückgerollt). Liefert den neuen Favoriten-Zustand. */
export async function toggleFavorite(item) {
  if (!item || !item.Id) return false;
  const prev = Boolean(item.UserData && item.UserData.IsFavorite);
  const next = !prev;
  item.UserData = { ...(item.UserData || {}), IsFavorite: next };
  try {
    await api.setFavorite(item.Id, next);
  } catch {
    item.UserData = { ...(item.UserData || {}), IsFavorite: prev };
    return prev;
  }
  putItems([item]);
  return next;
}

/** Bewertung: true = gefällt, false = gefällt nicht, null = Bewertung entfernen. Liefert den neuen Wert (bei Fehler den alten). */
export async function setLike(item, value) {
  if (!item || !item.Id) return null;
  const want = value === true ? true : value === false ? false : null;
  const prev = item.UserData && typeof item.UserData.Likes === 'boolean' ? item.UserData.Likes : null;
  item.UserData = { ...(item.UserData || {}), Likes: want };
  try {
    if (want === false) {
      const { token, userId } = api.getAuth();
      const res = await fetch(api.buildUrl(`/Users/${userId}/Items/${item.Id}/Rating`, { likes: false }), {
        method: 'POST',
        headers: { Authorization: `MediaBrowser Token="${token}"` },
      });
      if (!res.ok) throw new Error(`LenzFlix API: HTTP ${res.status} (Bewertung)`);
    } else {
      await data.setLike(item.Id, want === true);
    }
  } catch {
    item.UserData = { ...(item.UserData || {}), Likes: prev };
    return prev;
  }
  putItems([item]);
  return want;
}

/** Download starten (Ordner: Auswahl-Sheet). Liefert true, wenn der Start ohne Fehler ausgelöst wurde. */
export async function startDownloadFor(item, { anchorEl } = {}) {
  if (!item || !item.Id) return false;
  try {
    await startDownload(item, anchorEl);
    return true;
  } catch {
    return false;
  }
}

/** Natives Titelmenü (Proxy-Klick). Liefert true, wenn das Menü ausgelöst wurde. */
export async function openTitleMenu(item, anchorEl) {
  if (!item || !item.Id) return false;
  return Boolean(openItemMenu(item, anchorEl));
}
