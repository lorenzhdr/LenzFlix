// LENZPRIME: Startseite und Hubs Filme/Serien (#/home, #/home?lfx=hub&lib=<id>): Hero, Zeilen, Badges, Mehr-Button, Fußzeile.
// Mount #lfx-prime-home als erstes Kind von #homeTab (Proxy-Klick fürs Abspielen braucht den Legacy-Container);
// die nativen Sektionen verschwinden per html.lfx-prime-home-on. Wechsel Startseite <-> Hub läuft über update().
import * as api from '../../core/api.js';
import { h } from '../../core/dom.js';
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { getHubHeroPool, buildHubRowDefs } from '../../shared/hub.js';
import { getLibraries } from '../../shared/libraries.js';
import { hubHref } from '../../shared/routes.js';
import { buildRowDefs } from '../rows/sources.js';
import { buildFooter, buildMoreButton } from './footer.js';
import { fetchHomePool, renderHero } from './hero.js';
import { findHomeTab, ON_CLASS, primeHomeRoute, ROOT_ID } from './home-route.js';
import { createRows, pickPosterId } from './home-rows.js';

const MORE_STEP = 4;
const BASE_GENRES = 6;

let cleanups = [];
let waitTimer = null;
let gen = 0;
let current = null; // { key, kind, lib }

function teardown() {
  for (const fn of cleanups.splice(0)) {
    try { fn && fn(); } catch (e) { console.error('[LenzFlix] prime-home cleanup', e); }
  }
  document.getElementById(ROOT_ID)?.remove();
  document.documentElement.classList.remove(ON_CLASS);
}

const isGenreDef = (d) => /(^|-)genre-/.test(d.id);

/** „Mehr ansehen ›“-Ziel einer Zeile oder null (nur wo es ein sinnvolles Ziel gibt). */
export function moreHrefFor(def, { hub, libs, lib }) {
  if (hub) {
    if (lib && (def.id === `${lib.id}-latest` || def.id === `${lib.id}-toprated`)) return lib.href;
    return null;
  }
  const byType = (t) => libs.find((l) => l.collectionType === t && l.hubCapable);
  if (def.id === 'latest-movies') { const l = byType('movies'); return l ? hubHref(l.id) : null; }
  if (def.id === 'latest-series') { const l = byType('tvshows'); return l ? hubHref(l.id) : null; }
  if (def.id === 'favorites') return '#/home?tab=1';
  if (def.kind === 'top10') return '#/home?lfx=new';
  return null;
}

async function start(tab, route, myGen) {
  let libs = [];
  try { libs = await getLibraries(); } catch { libs = []; }
  if (myGen !== gen) return;
  const hub = route.kind === 'hub';
  const lib = hub ? libs.find((l) => l.id === route.lib && l.hubCapable) : null;
  if (hub && !lib) return; // unbekannte Bibliothek: native Seite bleibt sichtbar

  teardown();
  const heroSlot = h('section', { id: 'lfx-prime-hero', class: 'lfx-prime-hero-slot', 'aria-label': 'Empfehlung' });
  const rowsSlot = h('div', { class: 'lfx-prime-rows' });
  const moreSlot = h('div', { class: 'lfx-prime-moreslot' });
  const root = h('div', { id: ROOT_ID, class: `lfx-prime-home lfx-prime-home--${hub ? 'hub' : 'home'}` }, [heroSlot, rowsSlot, moreSlot, buildFooter()]);
  tab.prepend(root);
  document.documentElement.classList.add(ON_CLASS);
  current = route;

  cleanups.push(renderHero(heroSlot, { loadPool: () => (hub ? getHubHeroPool(lib) : fetchHomePool()) }));

  const getDefs = (genreCount) => (hub ? buildHubRowDefs(lib, { genreCount }) : buildRowDefs({ genreCount }));
  let defs = [];
  try { defs = await getDefs(BASE_GENRES); } catch (e) {
    console.warn('[LenzFlix] Zeilen konnten nicht aufgebaut werden', e && e.message);
  }
  if (myGen !== gen || !api.isReady()) return;
  const rows = createRows(rowsSlot, {
    posterId: pickPosterId(defs, hub),
    moreHref: (def) => moreHrefFor(def, { hub, libs, lib }),
  });
  cleanups.push(() => rows.destroy());
  rows.add(defs);

  let genreCount = BASE_GENRES;
  const moreBtn = buildMoreButton(async (btn) => {
    if (btn.disabled) return;
    btn.disabled = true;
    genreCount += MORE_STEP;
    try {
      const all = await getDefs(genreCount);
      if (myGen !== gen) return;
      const have = new Set(rows.ids());
      const fresh = all.filter((d) => isGenreDef(d) && !have.has(d.id)).slice(0, MORE_STEP);
      rows.add(fresh);
      if (fresh.length < MORE_STEP) btn.hidden = true;
    } catch (e) {
      console.warn('[LenzFlix] Weitere Zeilen nicht geladen', e && e.message);
    }
    btn.disabled = false;
  });
  if (!defs.some(isGenreDef)) moreBtn.hidden = true;
  moreSlot.append(moreBtn);
}

function ensure(route) {
  clearTimeout(waitTimer);
  const tab = findHomeTab();
  const existing = document.getElementById(ROOT_ID);
  if (tab && existing && tab.contains(existing) && current && current.key === route.key) return;
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

const primeHome = {
  name: 'prime-home',
  match: (route) => isTheme('prime') && isModern() && !isTv() && api.isReady() && Boolean(primeHomeRoute(route)),
  mount: (route) => ensure(primeHomeRoute(route)),
  update: (route) => ensure(primeHomeRoute(route)),
  unmount() {
    gen += 1;
    clearTimeout(waitTimer);
    current = null;
    teardown();
  },
};

export default primeHome;
