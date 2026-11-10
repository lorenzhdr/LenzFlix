// LENZ//84: Startseite und Hubs Filme/Serien (#/home, #/home?lfx=hub&lib=<id>): Hero, Kassetten-Regal, „READY.“-Fußzeile.
// Mount #lfx-retro-home als erstes Kind von #homeTab (Proxy-Klick fürs Abspielen braucht den Legacy-Container);
// die nativen Sektionen verschwinden per html.lfx-retro-home-on. Wechsel Startseite <-> Hub läuft über update(). Gehört Worker P1.
import * as api from '../../core/api.js';
import { h } from '../../core/dom.js';
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { getHubHeroPool, buildHubRowDefs } from '../../shared/hub.js';
import { getLibraries } from '../../shared/libraries.js';
import { browseHref, hubHref } from '../../shared/routes.js';
import { buildRowDefs } from '../rows/sources.js';
import { fetchHomePool, renderHero } from './home-hero.js';
import { createRows } from './home-rows.js';
import { findHomeTab, ON_CLASS, retroHomeRoute, ROOT_ID } from './home-route.js';
import { isPhone } from './header-nav.js';

const MORE_STEP = 4;
const BASE_GENRES = 6;
export const SYSTEM_LINE = 'LENZ//84 BIOS v1.6 · 640K OK';

let cleanups = [];
let waitTimer = null;
let gen = 0;
let current = null; // { key, kind, lib }
let builtPhone = false; // Layout, mit dem die Seite gebaut wurde (Fensterwechsel < / >= 800 px baut neu auf)

function teardown() {
  for (const fn of cleanups.splice(0)) {
    try { fn && fn(); } catch (e) { console.error('[LenzFlix] retro-home cleanup', e); }
  }
  document.getElementById(ROOT_ID)?.remove();
  document.documentElement.classList.remove(ON_CLASS);
}

const isGenreDef = (d) => /(^|-)genre-/.test(d.id);

/** „Alle anzeigen“-Ziel einer Zeile oder null (nur wo es ein sinnvolles Ziel gibt). */
export function moreHrefFor(def, { hub, libs, lib }) {
  if (hub) {
    if (lib && (def.id === `${lib.id}-latest` || def.id === `${lib.id}-toprated`)) return browseHref(lib.id);
    return null;
  }
  const byType = (t) => libs.find((l) => l.collectionType === t && l.hubCapable);
  if (def.id === 'latest-movies') { const l = byType('movies'); return l ? hubHref(l.id) : null; }
  if (def.id === 'latest-series') { const l = byType('tvshows'); return l ? hubHref(l.id) : null; }
  if (def.id === 'favorites') return '#/home?tab=1';
  if (def.kind === 'top10') return '#/home?lfx=new';
  return null;
}

/** Fußzeile: „READY.“ mit blinkendem Cursor und Systemzeile (reine Deko). */
export function buildFooter() {
  return h('footer', { class: 'lfx-retro-footer', 'aria-hidden': 'true' }, [
    h('p', { class: 'lfx-retro-footer__ready lfx-retro-caret' }, 'READY.'),
    h('p', { class: 'lfx-retro-footer__sys' }, SYSTEM_LINE),
  ]);
}

async function start(tab, route, myGen) {
  let libs = [];
  try { libs = await getLibraries(); } catch { libs = []; }
  if (myGen !== gen) return;
  const hub = route.kind === 'hub';
  const lib = hub ? libs.find((l) => l.id === route.lib && l.hubCapable) : null;
  if (hub && !lib) return; // unbekannte Bibliothek: native Seite bleibt sichtbar

  teardown();
  const heroSlot = h('section', { id: 'lfx-retro-hero', class: 'lfx-retro-hero-slot', 'aria-label': 'Empfehlung' });
  const rowsSlot = h('div', { class: 'lfx-retro-rows' });
  const moreSlot = h('div', { class: 'lfx-retro-moreslot' });
  const root = h('div', { id: ROOT_ID, class: `lfx-retro-home lfx-retro-home--${hub ? 'hub' : 'home'}` }, [heroSlot, rowsSlot, moreSlot, buildFooter()]);
  tab.prepend(root);
  document.documentElement.classList.add(ON_CLASS);
  current = route;
  builtPhone = isPhone();

  cleanups.push(renderHero(heroSlot, { loadPool: () => (hub ? getHubHeroPool(lib) : fetchHomePool()) }));

  const getDefs = (genreCount) => (hub ? buildHubRowDefs(lib, { genreCount }) : buildRowDefs({ genreCount }));
  let defs = [];
  try { defs = await getDefs(BASE_GENRES); } catch (e) {
    console.warn('[LenzFlix] Zeilen konnten nicht aufgebaut werden', e && e.message);
  }
  if (myGen !== gen || !api.isReady()) return;
  const rows = createRows(rowsSlot, { moreHref: (def) => moreHrefFor(def, { hub, libs, lib }) });
  cleanups.push(() => rows.destroy());
  rows.add(defs);

  let genreCount = BASE_GENRES;
  const moreBtn = h('button', { type: 'button', class: 'lfx-retro-btn lfx-retro-more' }, 'Mehr laden');
  moreBtn.addEventListener('click', async () => {
    if (moreBtn.disabled) return;
    moreBtn.disabled = true;
    genreCount += MORE_STEP;
    try {
      const all = await getDefs(genreCount);
      if (myGen !== gen) return;
      const have = new Set(rows.ids());
      const fresh = all.filter((d) => isGenreDef(d) && !have.has(d.id)).slice(0, MORE_STEP);
      rows.add(fresh);
      if (fresh.length < MORE_STEP) moreBtn.hidden = true;
    } catch (e) {
      console.warn('[LenzFlix] Weitere Zeilen nicht geladen', e && e.message);
    }
    moreBtn.disabled = false;
  });
  if (!defs.some(isGenreDef)) moreBtn.hidden = true;
  moreSlot.append(moreBtn);
}

function ensure(route) {
  clearTimeout(waitTimer);
  const tab = findHomeTab();
  const existing = document.getElementById(ROOT_ID);
  if (tab && existing && tab.contains(existing) && current && current.key === route.key && builtPhone === isPhone()) return;
  gen += 1;
  const myGen = gen;
  let tries = 0;
  const poll = () => {
    if (myGen !== gen) return;
    const t = findHomeTab();
    if (t) start(t, route, myGen);
    else if (++tries < 30) waitTimer = setTimeout(poll, 200);
  };
  if (tab) poll();
  else waitTimer = setTimeout(poll, 200);
}

const retroHome = {
  name: 'retro-home',
  match: (route) => isTheme('retro') && isModern() && !isTv() && api.isReady() && Boolean(retroHomeRoute(route)),
  mount: (route) => ensure(retroHomeRoute(route)),
  update: (route) => ensure(retroHomeRoute(route)),
  unmount() {
    gen += 1;
    clearTimeout(waitTimer);
    waitTimer = null;
    current = null;
    teardown();
  },
};

export default retroHome;
