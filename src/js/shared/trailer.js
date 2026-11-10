// LenzFlix: Trailer-Helfer (Billboard und stumme Vorschau). Keine UI-Fehlermeldungen; api_key nur in der Stream-URL, nie geloggt.
import { getJson, getUserId, getAuth } from '../core/api.js';

const DIRECT_VIDEO = /\.(mp4|m4v|webm)(\?|#|$)/i;

/** Stream-URL eines lokalen Trailer-Items (enthält das Token: nicht loggen). */
export function trailerUrl(trailerId) {
  const c = window.ApiClient;
  if (c && typeof c.getUrl === 'function') {
    return c.getUrl(`Videos/${trailerId}/stream.mp4`, { static: true, api_key: c.accessToken() });
  }
  const { address, token } = getAuth();
  return `${address}/Videos/${trailerId}/stream.mp4?static=true&api_key=${encodeURIComponent(token || '')}`;
}

/** Erster lokaler Trailer des Titels (Item mit Id) oder null. Wirft bei Netzwerkfehlern. */
export async function loadLocalTrailer(item) {
  if (!item || !(item.LocalTrailerCount > 0)) return null;
  const list = await getJson(`/Users/${getUserId()}/Items/${item.Id}/LocalTrailers`);
  const t = Array.isArray(list) ? list[0] : null;
  return t && t.Id ? t : null;
}

/** Direkt abspielbarer Remote-Trailer (nur Videodatei-URLs, keine Plattform-Links) oder null. */
export function directRemoteTrailerUrl(item) {
  const list = item && Array.isArray(item.RemoteTrailers) ? item.RemoteTrailers : [];
  for (const r of list) {
    const u = r && typeof r.Url === 'string' ? r.Url : '';
    if (/^https?:\/\//i.test(u) && DIRECT_VIDEO.test(u)) return u;
  }
  return null;
}

/** Springt nach den Metadaten auf `startAt` Sekunden, wenn das Video lang genug ist (überspringt Freigabe-Vorspänne). */
export function applyStartAt(v, startAt) {
  if (!(startAt > 0)) return;
  const apply = () => {
    const d = v.duration;
    if (Number.isFinite(d) && d > 30 && d > startAt + 20) {
      try { v.currentTime = startAt; } catch { /* egal */ }
    }
  };
  if (v.readyState >= 1) apply();
  else v.addEventListener('loadedmetadata', apply, { once: true });
}

/**
 * Stumme Trailer-Vorschau im Container: startet nach `delay` ms einen <video>, sofern ein direkt abspielbarer
 * Trailer existiert. onStart beim ersten „playing“, onEnd bei Ende/Fehler nach dem Start (nicht bei cancel()).
 * cancel() räumt alles auf (Timer, Video, src, load()). Option startAt: Startsekunde (nur bei langen Videos).
 */
export function createMutedPreview(container, item, { delay = 1500, onStart, onEnd, startAt = 0 } = {}) {
  let dead = false;
  let video = null;
  let started = false;

  const cleanup = () => {
    if (video) {
      const v = video;
      video = null;
      try {
        v.pause();
        v.removeAttribute('src');
        if (v.load) v.load();
      } catch { /* jsdom: nicht implementiert */ }
      v.remove();
    }
  };
  const finish = () => {
    if (dead) return;
    dead = true;
    clearTimeout(timer);
    const wasStarted = started;
    cleanup();
    if (wasStarted && typeof onEnd === 'function') onEnd();
  };

  const start = async () => {
    timer = null;
    if (dead || !container) return;
    let src;
    try {
      const t = await loadLocalTrailer(item);
      src = t ? trailerUrl(t.Id) : directRemoteTrailerUrl(item);
    } catch {
      src = directRemoteTrailerUrl(item);
    }
    if (dead || !src) return;
    const v = document.createElement('video');
    v.className = 'lfx-preview__video';
    v.setAttribute('playsinline', '');
    v.setAttribute('aria-hidden', 'true');
    v.preload = 'auto';
    v.muted = true;
    v.setAttribute('muted', '');
    v.addEventListener('playing', () => {
      if (dead || video !== v || started) return;
      started = true;
      if (typeof onStart === 'function') onStart(v);
    });
    v.addEventListener('ended', finish);
    v.addEventListener('error', finish);
    video = v;
    applyStartAt(v, startAt);
    v.src = src;
    container.append(v);
    try {
      const p = v.play && v.play();
      if (p && p.catch) p.catch(finish);
    } catch { finish(); }
  };

  let timer = setTimeout(start, delay);

  return {
    cancel() {
      if (dead) return;
      dead = true;
      clearTimeout(timer);
      timer = null;
      cleanup();
    },
  };
}
