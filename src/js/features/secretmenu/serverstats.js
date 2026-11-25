// LenzFlix: Hülle der Server-Statistik im Geheimmenü (Abschnitt „Server“). Das Nachlade-Bundle (dist/lenzserverstats(.min).js|css,
// window.LenzFlixServerStats) kommt erst beim Tippen auf den Knopf; die Hülle prüft vorher nur per GET /srv am Charts-Worker, ob es ihn gibt.
// Das Jellyfin-Token geht nur als Header an den Worker (X-Emby-Token); nie loggen, nie in eine URL.
import { h } from '../../core/dom.js';
import * as api from '../../core/api.js';
import { getChartsUrl } from '../../core/charts.js';
import { ensureAddonCss, removeAddonCss } from '../../core/addoncss.js';
import { ensureThemeJs } from '../../core/themejs.js';
import { openModal } from '../modal.js';

const ADDON = 'lenzserverstats';
const PROBE_TIMEOUT_MS = 4000;
const GET_TIMEOUT_MS = 8000;
const PROBE_CACHE_MS = 60000;
const TABS = ['now', 'month', 'server'];

let probeCache = null; // { token, at, info }
export function clearServerProbeCache() {
  probeCache = null;
}

/** GET <chartsUrl><path>. Wirft nie: { ok:true, status, data } | { ok:false, status } (status 0 = Netz/Timeout/Abbruch/kein Token). */
async function request(path, signal, timeoutMs) {
  let timer = null;
  let onAbort = null;
  try {
    const base = getChartsUrl();
    const token = base ? api.getAuth().token : null;
    if (!base || !token) return { ok: false, status: 0 };
    const ctrl = new AbortController();
    if (signal) {
      if (signal.aborted) return { ok: false, status: 0 };
      onAbort = () => ctrl.abort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
    timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${base}${path}`, {
      headers: { 'X-Emby-Token': token, Accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, status: res.status, data: await res.json() };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  }
}

/** Probe GET /srv (60 s je Token gemerkt): { tabs, maxM } oder null bei jedem Fehler. */
async function probe(signal) {
  let token = null;
  try { token = api.getAuth().token; } catch { /* ohne Token keine Probe */ }
  if (!token) return null;
  const now = Date.now();
  if (probeCache && probeCache.token === token && now - probeCache.at >= 0 && now - probeCache.at < PROBE_CACHE_MS) return probeCache.info;
  const r = await request('/srv', signal, PROBE_TIMEOUT_MS);
  const d = r.ok ? r.data : null;
  if (!d || d.v !== 1 || !Array.isArray(d.tabs)) return null;
  const tabs = TABS.filter((t) => d.tabs.includes(t));
  if (!tabs.length) return null;
  const info = { tabs, maxM: Number.isInteger(d.maxM) && d.maxM > 0 ? d.maxM : 0 };
  probeCache = { token, at: Date.now(), info };
  return info;
}

/** Abschnitt „Server“ fürs Geheimmenü. `ctx`: { pushView, close } aus panel.js. Bleibt verborgen, bis die Probe gelingt. */
export function serverSection(offs, ctx) {
  const ctrl = new AbortController();
  offs.push(() => ctrl.abort());
  offs.push(() => removeAddonCss(ADDON));
  const btn = h('button', { type: 'button', class: 'lfx-secret__btn', hidden: true }, 'Server-Statistik');
  const sec = h('section', { class: 'lfx-secret__sec', hidden: true }, [h('h3', { class: 'lfx-secret__h' }, 'Server'), btn]);
  let info = null;

  const open = () => {
    const host = h('div', { class: 'lfx-srv-host' });
    const viewOffs = [];
    let alive = true;
    let inst = null;
    viewOffs.push(() => {
      alive = false;
      if (inst) { try { inst.dispose(); } catch { /* egal */ } inst = null; }
    });
    const deps = {
      get: (path, { signal } = {}) => request(path, signal, GET_TIMEOUT_MS),
      img: (id, tag, w) => (id && tag ? api.imageUrlFor(id, { type: 'Primary', maxWidth: w, tag }) : null),
      openItem: (id) => { ctx.close(); openModal(id); },
      tabs: info.tabs,
      maxM: info.maxM,
    };
    const load = async () => {
      host.replaceChildren(h('p', { class: 'lfx-secret__note', role: 'status' }, 'Wird geladen …'));
      let ok = false;
      try {
        const [css, js] = await Promise.all([ensureAddonCss(ADDON), ensureThemeJs('serverstats')]);
        ok = Boolean(css && js);
      } catch { /* Rückfall unten */ }
      if (!alive) return;
      const g = window.LenzFlixServerStats;
      if (ok && g && g.version === 1 && typeof g.create === 'function') {
        try {
          const made = g.create(deps);
          inst = made;
          host.replaceChildren(made.el);
          return;
        } catch { inst = null; }
      }
      host.replaceChildren(
        h('p', { class: 'lfx-secret__note', role: 'status' }, 'Konnte nicht geladen werden.'),
        h('button', { type: 'button', class: 'lfx-secret__btn', onclick: () => { load(); } }, 'Erneut versuchen'),
      );
    };
    ctx.pushView({ title: 'Server-Statistik', node: host, offs: viewOffs, trigger: btn });
    load();
  };
  btn.addEventListener('click', open);

  probe(ctrl.signal).then((res) => {
    if (!res || ctrl.signal.aborted) return;
    info = res;
    sec.hidden = false;
    btn.hidden = false;
  }, () => {});
  return sec;
}
