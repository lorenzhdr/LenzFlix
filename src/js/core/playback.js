// LenzFlix: Wiedergabe über „Proxy-Klick“ auf ein verstecktes .itemAction in einem echten .itemsContainer.
// (playbackManager ist nicht global; Jellyfins shortcuts.onClick startet die Wiedergabe.)
import { getAuth } from './api.js';
import { show as showCover, hide as hideCover, allowRoute as allowCoverRoute } from './startcover.js';

function isVisible(el) {
  return el.getClientRects().length > 0;
}

/** Sichtbaren .itemsContainer mit mindestens einer .card bevorzugen. */
export function findProxyContainer() {
  const all = [...document.querySelectorAll('.itemsContainer')].filter((c) => c.querySelector('.card'));
  return all.find(isVisible) || all[0] || null;
}

export function buildProxy(item, resume) {
  const el = document.createElement('div');
  el.className = 'itemAction lfx-proxy';
  el.style.display = 'none';
  el.setAttribute('data-action', resume ? 'resume' : 'play');
  el.setAttribute('data-id', item.Id);
  el.setAttribute('data-serverid', item.ServerId || getAuth().serverId || '');
  el.setAttribute('data-type', item.Type || '');
  el.setAttribute('data-mediatype', item.MediaType || '');
  el.setAttribute('data-isfolder', String(Boolean(item.IsFolder)));
  const ticks = resume && item.UserData ? item.UserData.PlaybackPositionTicks || 0 : 0;
  if (ticks) el.setAttribute('data-positionticks', String(ticks));
  return el;
}

function playViaDetails(item, resume, timeoutMs) {
  return new Promise((resolve) => {
    const serverId = item.ServerId || getAuth().serverId || '';
    window.location.hash = `#/details?id=${item.Id}&serverId=${serverId}`;
    const started = Date.now();
    const timer = setInterval(() => {
      const wrap = document.querySelector('.itemDetailPage:not(.hide) .mainDetailButtons');
      const visible = (sel) => wrap && [...wrap.querySelectorAll(sel)].find((b) => !b.classList.contains('hide'));
      const target = resume ? visible('.btnPlay') : visible('.btnReplay') || visible('.btnPlay');
      if (target) {
        clearInterval(timer);
        target.click();
        resolve(true);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, 150);
  });
}

/**
 * Startet die Wiedergabe von item (Objekt mit Id/Type/MediaType/IsFolder/ServerId/UserData).
 * Rückgabe: Promise<boolean> (true = Klick ausgelöst).
 */
export async function play(item, { resume = false, timeoutMs = 8000 } = {}) {
  if (!item || !item.Id) return false;
  // Signal für den TV-Modus (docs/tvmode.md): stoppt dessen Stream, bevor der Jellyfin-Player startet (synchron, vor Proxy-Klick/Fallback).
  window.dispatchEvent(new CustomEvent('lfx:play', { detail: { id: item.Id } }));
  // Ladebild vor dem Klick (idempotent, wenn das Info-Fenster es schon gezeigt hat).
  showCover({ item });
  const container = findProxyContainer();
  if (container) {
    const proxy = buildProxy(item, resume);
    container.append(proxy);
    try {
      proxy.click();
    } finally {
      proxy.remove();
    }
    return true;
  }
  allowCoverRoute('/details');
  const ok = await playViaDetails(item, resume, timeoutMs);
  if (!ok) hideCover();
  return ok;
}
