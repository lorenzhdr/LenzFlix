// VIDEOTHEK LENZ: Mehrspieler-Ticket (docs/mp-api.md 2.1, 11.1). Nur fetch, kein WebSocket (das liegt im 3D-Bundle).
// Das Jellyfin-Token verlässt diese Datei nur als Header an den Charts-Worker; nie loggen, nie in eine URL.
import * as api from '../../core/api.js';
import { getChartsUrl } from '../../core/charts.js';

const TIMEOUT_MS = 8000;

/** Ticket-Abruf für `uid`: Promise<{ok:true, tk, url, exp, pv, s} | {ok:false, why}>; laufende Aufrufe werden zusammengelegt. */
export function createTicket(uid) {
  let pending = null;
  async function run() {
    const base = getChartsUrl();
    if (!base) return { ok: false, why: 'nourl' };
    const a = api.getAuth();
    if (!a.token || a.userId !== uid) return { ok: false, why: 'user' };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, why: 'net' };
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
    try {
      const res = await fetch(`${base}/mp/ticket`, {
        headers: { 'X-Emby-Token': a.token },
        credentials: 'omit',
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined,
      });
      const st = res.status;
      if (st === 404) return { ok: false, why: 'gone' };
      if (st === 503) return { ok: false, why: 'off' };
      if (st === 401) return { ok: false, why: 'auth' };
      if (st === 429) return { ok: false, why: 'rate' };
      if (!res.ok) return { ok: false, why: st >= 500 ? 'net' : 'bad' };
      const d = await res.json();
      if (!d || typeof d.tk !== 'string' || !d.tk || d.url !== '/mp') return { ok: false, why: 'bad' };
      return { ok: true, tk: d.tk, url: `${base.replace(/^https:/i, 'wss:')}/mp`, exp: d.exp, pv: Array.isArray(d.pv) ? d.pv : [1], s: d.s };
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, why: 'net' };
      if (e instanceof SyntaxError) return { ok: false, why: 'bad' };
      return { ok: false, why: e instanceof TypeError ? 'blocked' : 'net' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return () => {
    if (!pending) pending = run().finally(() => { pending = null; });
    return pending;
  };
}
