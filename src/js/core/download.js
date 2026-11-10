// LenzFlix: Download einzelner Titel und Sammel-Download (Serie/Staffel) mit Auswahl-Sheet.
// Sicherheit: Download-URLs enthalten api_key und werden nie geloggt.
import { getAuth, getUser, getSeasons, getEpisodes } from './api.js';
import { h, mountPoint, unmountPoint } from './dom.js';
import { toast } from './toast.js';
import { computeMenuPosition, anchorRect } from './itemmenu.js';

const SHEET_ID = 'lfx-sheet';
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
  const client = window.ApiClient;
  if (client && typeof client.getItemDownloadUrl === 'function') return client.getItemDownloadUrl(id);
  const { address, token } = getAuth();
  return `${address}/Items/${id}/Download?api_key=${encodeURIComponent(token || '')}`;
}

function triggerDownload(item) {
  const a = document.createElement('a');
  a.href = downloadUrl(item.Id);
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

export async function downloadItem(item) {
  if (!item || !item.Id) return;
  triggerDownload(item);
  toast('Download gestartet');
}

let manyTimer = null;
let manyResolve = null;

export function cancelDownloads() {
  clearTimeout(manyTimer);
  manyTimer = null;
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
  toast(touch ? `${n} Downloads gestartet – falls blockiert, bitte Episoden einzeln laden` : `${n} Downloads gestartet`);
  return new Promise((resolve) => {
    manyResolve = resolve;
    let i = 0;
    const step = () => {
      manyTimer = null;
      triggerDownload(list[i]);
      i += 1;
      if (i < list.length) {
        manyTimer = setTimeout(step, 1000);
      } else {
        manyResolve = null;
        resolve();
      }
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

let chooser = null;

export function isChooserOpen() {
  return chooser !== null;
}

export function closeChooser() {
  const c = chooser;
  if (!c) return;
  chooser = null;
  window.removeEventListener('keydown', c.onKeydown, true);
  c.overlay.removeEventListener('click', c.onOverlayClick);
  unmountPoint(c.overlay);
  document.documentElement.classList.remove('lfx-sheet-open');
  const a = c.anchorEl;
  if (a && typeof a.focus === 'function' && a.isConnected) {
    try {
      a.focus({ preventScroll: true });
    } catch {
      /* Fokus ist optional */
    }
  }
}

function render(c, title, entries) {
  c.title.textContent = title;
  c.list.replaceChildren(
    ...entries.map(({ label, onClick, disabled, primary }) =>
      h(
        'button',
        {
          type: 'button',
          class: `lfx-sheet__item${primary ? ' lfx-sheet__item--primary' : ''}`,
          disabled: disabled ? true : null,
          onclick: onClick,
        },
        [label],
      ),
    ),
  );
  const first = c.list.querySelector('button:not([disabled])');
  if (first) first.focus({ preventScroll: true });
}

function confirmStep(c, episodes) {
  const n = episodes.length;
  render(c, `${n} ${n === 1 ? 'Episode' : 'Episoden'} herunterladen?`, [
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
  const overlay = mountPoint(SHEET_ID, { className: 'lfx-sheet-overlay' });
  const title = h('h2', { class: 'lfx-sheet__title' }, ['Download']);
  const list = h('div', { class: 'lfx-sheet__list' });
  const sheet = h('div', { class: 'lfx-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Download' }, [title, list]);
  overlay.replaceChildren(sheet);

  const pos = computeMenuPosition(anchorEl ? anchorRect(anchorEl) : { left: 0, right: window.innerWidth, top: 0, bottom: 0 });
  sheet.style.setProperty('--lfx-sheet-x', `${Math.round(pos.x)}px`);
  sheet.style.setProperty('--lfx-sheet-y', `${Math.round(pos.y)}px`);

  const c = { overlay, sheet, title, list, anchorEl };
  c.onKeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      closeChooser();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = [...sheet.querySelectorAll('button:not([disabled])')];
    if (!focusable.length) {
      e.preventDefault();
      return;
    }
    const firstEl = focusable[0];
    const lastEl = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (!sheet.contains(active)) {
      e.preventDefault();
      firstEl.focus();
    } else if (e.shiftKey && active === firstEl) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && active === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  };
  c.onOverlayClick = (e) => {
    if (e.target === overlay) closeChooser();
  };
  window.addEventListener('keydown', c.onKeydown, true);
  overlay.addEventListener('click', c.onOverlayClick);
  document.documentElement.classList.add('lfx-sheet-open');
  chooser = c;

  render(c, 'Download', [{ label: 'Lädt …', disabled: true }]);
  sheet.setAttribute('tabindex', '-1');
  sheet.focus({ preventScroll: true });

  let data;
  try {
    data = await loadEpisodes(item);
  } catch {
    data = { seasons: [], episodes: [] };
  }
  if (chooser !== c) return;

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
  const entries = [
    { label: `Ganze Serie (${count(data.episodes.length)})`, onClick: () => confirmStep(c, data.episodes) },
  ];
  for (const season of data.seasons) {
    const eps = data.episodes.filter((ep) => ep.SeasonId === season.Id);
    if (!eps.length) continue;
    entries.push({ label: `${season.Name || 'Staffel'} (${count(eps.length)})`, onClick: () => confirmStep(c, eps) });
  }
  render(c, 'Download', entries);
}
