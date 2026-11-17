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
    // Detailseiten, die schon vor dem Hash-Wechsel existierten (z. B. die des vorherigen Titels), zählen nur,
    // wenn Jellyfin sie danach per viewshow für den neuen Titel anzeigt.
    const stale = new Set(document.querySelectorAll('.itemDetailPage'));
    const shown = new WeakSet();
    const onShow = (e) => shown.add(e.target);
    document.addEventListener('viewshow', onShow, true);
    // Stand die Detailseite dieses Titels schon offen (kein Hash-Wechsel, kein viewshow), gibt es nichts auszuschließen.
    const sameBefore = new URLSearchParams(window.location.hash.split('?')[1] || '').get('id') === item.Id;
    // Karenz: Jellyfin blendet die alte Seite binnen Sekundenbruchteilen aus; was danach noch sichtbar ist, ist die (wiederverwendete) aktuelle Seite.
    const grace = Math.min(1000, timeoutMs / 2);
    window.location.hash = `#/details?id=${item.Id}&serverId=${serverId}`;
    const started = Date.now();
    const timer = setInterval(() => {
      const done = (result) => {
        clearInterval(timer);
        document.removeEventListener('viewshow', onShow, true);
        resolve(result);
      };
      // Nutzer ist inzwischen zu einem anderen Titel navigiert: nicht dort auf Play drücken.
      if (new URLSearchParams(window.location.hash.split('?')[1] || '').get('id') !== item.Id) return done(false);
      const page = [...document.querySelectorAll('.itemDetailPage:not(.hide)')].find((p) => sameBefore || !stale.has(p) || shown.has(p) || Date.now() - started > grace);
      const wrap = page && page.querySelector('.mainDetailButtons');
      const visible = (sel) => wrap && [...wrap.querySelectorAll(sel)].find((b) => !b.classList.contains('hide'));
      const target = resume ? visible('.btnPlay') : visible('.btnReplay') || visible('.btnPlay');
      if (target) {
        target.click();
        done(true);
      } else if (Date.now() - started > timeoutMs) {
        done(false);
      }
    }, 150);
  });
}

/**
 * Startet die Wiedergabe von item (Objekt mit Id/Type/MediaType/IsFolder/ServerId/UserData).
 * Rückgabe: Promise<boolean> (true = Klick ausgelöst). noCover: kein Ladebild (2D-Kino im LENZ PALAST zeigt sein eigenes Statusbild).
 */
export async function play(item, { resume = false, timeoutMs = 8000, noCover = false } = {}) {
  if (!item || !item.Id) return false;
  // Signal für den TV-Modus (docs/tvmode.md): stoppt dessen Stream, bevor der Jellyfin-Player startet (synchron, vor Proxy-Klick/Fallback).
  window.dispatchEvent(new CustomEvent('lfx:play', { detail: { id: item.Id } }));
  // Ladebild vor dem Klick (idempotent, wenn das Info-Fenster es schon gezeigt hat).
  if (!noCover) showCover({ item });
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
  if (!noCover) allowCoverRoute('/details');
  const ok = await playViaDetails(item, resume, timeoutMs);
  if (!ok) hideCover();
  return ok;
}
