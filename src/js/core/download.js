// LenzFlix: Download einzelner Titel und Sammel-Download (Serie/Staffel) mit Auswahl-Sheet.
// Sicherheit: Download-URLs enthalten ApiKey und werden nie geloggt.
import { getAuth, getUser, getSeasons, getEpisodes } from './api.js';
import { toast } from './toast.js';
import { openSheet, renderSheet, closeChooser, isChooserOpen, isCurrent } from './sheet.js';

const FOLDER_TYPES = ['Series', 'Season'];

// ------------------------------------------------------------ Berechtigung

export async function canDownload(item) {
  if (!item) return false;
  const user = await getUser();
  if (!user || !user.Policy || user.Policy.EnableContentDownloading !== true) return false;
  if (FOLDER_TYPES.includes(item.Type)) return true;
  if (item.IsFolder || item.Type === 'BoxSet') return false;
  return item.CanDownload !== false;
}

// ------------------------------------------------------------ Download

export function downloadUrl(id) {
  const { address, token } = getAuth();
  if (!token) return null;
  // Jellyfin 12.4 akzeptiert für /Download nur ?ApiKey= (api_key= liefert 401).
  return `${address || ''}/Items/${id}/Download?ApiKey=${encodeURIComponent(token)}`;
}

function triggerDownload(item) {
  const url = downloadUrl(item.Id);
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', '');
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.append(a);
  try {
    a.click();
  } finally {
    a.remove();
  }
}

const PROBE_TIMEOUT = 5000;

/** Vortest per Range-Request (HEAD liefert 405). Netzwerkfehler/Timeout blockieren nie (unknown). */
export async function probeDownload(url, outerSignal) {
  const controller = new AbortController();
  const onOuter = () => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) return { ok: true, unknown: true };
    outerSignal.addEventListener('abort', onOuter, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT);
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: controller.signal });
    const result = res.ok ? { ok: true } : { ok: false, status: res.status };
    controller.abort();
    return result;
  } catch {
    return { ok: true, unknown: true };
  } finally {
    clearTimeout(timer);
    if (outerSignal) outerSignal.removeEventListener('abort', onOuter);
  }
}

const failToast = (status) => toast(`Download nicht möglich (Fehler ${status || '?'})`);

export async function downloadItem(item) {
  if (!item || !item.Id) return;
  const url = downloadUrl(item.Id);
  if (!url) {
    toast('Download nicht möglich');
    return;
  }
  const probe = await probeDownload(url);
  if (!probe.ok) {
    failToast(probe.status);
    return;
  }
  triggerDownload(item);
  toast('Download gestartet');
}

let manyTimer = null;
let manyResolve = null;
let manyAbort = null;

export function cancelDownloads() {
  clearTimeout(manyTimer);
  manyTimer = null;
  if (manyAbort) {
    const ac = manyAbort;
    manyAbort = null;
    ac.abort();
  }
  if (manyResolve) {
    const r = manyResolve;
    manyResolve = null;
    r();
  }
}

export function downloadMany(items) {
  cancelDownloads();
  const list = (items || []).filter((i) => i && i.Id);
  if (!list.length) return Promise.resolve();
  const n = list.length;
  const touch = typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches;
  const startMsg = touch ? `${n} Downloads gestartet – falls blockiert, bitte Episoden einzeln laden` : `${n} Downloads gestartet`;
  const ac = new AbortController();
  manyAbort = ac;
  return new Promise((resolve) => {
    manyResolve = resolve;
    let i = 0;
    const finish = () => {
      if (manyAbort === ac) {
        manyAbort = null;
        manyResolve = null;
      }
      resolve();
    };
    const step = async () => {
      manyTimer = null;
      const item = list[i];
      const url = downloadUrl(item.Id);
      const probe = url ? await probeDownload(url, ac.signal) : { ok: false };
      if (ac.signal.aborted) return;
      if (!probe.ok) {
        failToast(probe.status);
        finish();
        return;
      }
      if (i === 0) toast(startMsg);
      triggerDownload(item);
      i += 1;
      if (i < list.length) manyTimer = setTimeout(step, 1000);
      else finish();
    };
    step();
  });
}

export async function startDownload(item, anchorEl) {
  if (!item) return;
  if (FOLDER_TYPES.includes(item.Type)) return openDownloadChooser(item, anchorEl);
  return downloadItem(item);
}

// ------------------------------------------------------------ Chooser

export { closeChooser, isChooserOpen };

function confirmStep(c, episodes) {
  const n = episodes.length;
  renderSheet(c, `${n} ${n === 1 ? 'Episode' : 'Episoden'} herunterladen?`, [
    {
      label: 'Herunterladen',
      primary: true,
      onClick: () => {
        closeChooser();
        downloadMany(episodes);
      },
    },
    { label: 'Abbrechen', onClick: () => closeChooser() },
  ]);
}

const downloadable = (ep) => ep && ep.CanDownload !== false && ep.LocationType !== 'Virtual';

async function loadEpisodes(item) {
  const fields = 'CanDownload';
  if (item.Type === 'Season') {
    const res = await getEpisodes(item.SeriesId || item.ParentId, { seasonId: item.Id, Fields: fields });
    return { seasons: [], episodes: ((res && res.Items) || []).filter(downloadable) };
  }
  const [seasonsRes, epRes] = await Promise.all([getSeasons(item.Id), getEpisodes(item.Id, { Fields: fields })]);
  return {
    seasons: (seasonsRes && seasonsRes.Items) || [],
    episodes: ((epRes && epRes.Items) || []).filter(downloadable),
  };
}

export async function openDownloadChooser(item, anchorEl) {
  if (!item) return;
  closeChooser();
  const c = openSheet(anchorEl, 'Download');
  renderSheet(c, 'Download', [{ label: 'Lädt …', disabled: true }]);

  let data;
  try {
    data = await loadEpisodes(item);
  } catch {
    data = { seasons: [], episodes: [] };
  }
  if (!isCurrent(c)) return;

  if (!data.episodes.length) {
    closeChooser();
    toast('Keine herunterladbaren Episoden');
    return;
  }
  if (item.Type === 'Season') {
    confirmStep(c, data.episodes);
    return;
  }
  const count = (n) => `${n} ${n === 1 ? 'Episode' : 'Episoden'}`;
  // Handy/Tablet (Touch): Safari verlangt je Datei eine Bestätigung, die ganze Serie ist dort nicht sinnvoll.
  const touch = typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches;
  const entries = [
    {
      label: `Ganze Serie (${count(data.episodes.length)})`,
      note: touch ? 'Funktioniert nur am Desktop' : null,
      disabled: touch,
      onClick: () => confirmStep(c, data.episodes),
    },
  ];
  for (const season of data.seasons) {
    const eps = data.episodes.filter((ep) => ep.SeasonId === season.Id);
    if (!eps.length) continue;
    entries.push({ label: `${season.Name || 'Staffel'} (${count(eps.length)})`, onClick: () => confirmStep(c, eps) });
  }
  renderSheet(c, 'Download', entries);
}
