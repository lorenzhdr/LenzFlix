// VIDEOTHEK LENZ · Ultra-Registry (1.19.0): Zusatzdetails, die es nur auf der Stufe „ultra“ gibt. Rein, ohne three.
// Provider 'ultra' (von modules/runtime.js bereitgestellt, Muster der anderen Provider):
//   register(key, build, opts?) → remove()   build(ctx) → { object: Object3D, update?(dt, t), dispose?(), onVisible?(bool) }; opts.parent = Elternknoten (Standard: ctx.scene)
//   onVisible(bool) wird bei jedem Wechsel der Sichtbarkeit des Eintrags gerufen (z. B. für Details ohne eigenes Mesh, die Materialien umschalten).
//   Optional api.textures (Array): Texturen, die nicht im object hängen (z. B. spätere Map-Tausche) – sie werden mit hochgeladen.
// Vorwärmen: nach dem Bau eines Eintrags kompiliert ein EIGENES späteres Häppchen (nie im Bau-Häppchen, ein Eintrag je Häppchen) die Programme
// (renderer.compileAsync) und lädt die Texturen hoch (renderer.initTexture), damit der erste Blick keinen Hänger erzeugt. list() meldet warm: true|false.
//   isActive() → bool (Stufe === 'ultra')   has(key) → bool   keys() → string[]   list() → [{ key, built, visible, ms }]
// Bau: LAZY in Leerlauf-Häppchen (requestIdleCallback, Rückfall setTimeout, je Häppchen höchstens ~6 ms; ein Eintrag wird nie geteilt),
// sobald die Stufe >= 'high' ist (damit der Wechsel auf Ultra keinen Hänger erzeugt) oder Ultra aktiv wird.
// Sichtbar = (Stufe === 'ultra') && !abgeschaltet(key). Umschalten setzt nur `visible`, die Basiswelt wird nie neu gebaut.
// update(dt, t) läuft nur für gebaute, sichtbare Einträge. Dev: ctx.opts.dev.ufx = '-key1,-key2' (aus) bzw. 'only:key' (nur dieses).
import { atLeast } from './quality.js';
import { disposeTree } from '../util/geo.js';
import { warmObject } from './warm.js';

const BUDGET_MS = 6;
const warn = (...a) => { try { console.warn('[LenzFlix Store3D]', ...a); } catch { /* egal */ } };
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/** Dev-Filter: "-a,-b" → { off: {a,b} }, "only:a" → { only: 'a' }, sonst leer. */
export function parseUfx(v) {
  const off = new Set();
  let only = null;
  if (typeof v === 'string') {
    for (const raw of v.split(',')) {
      const t = raw.trim();
      if (!t) continue;
      if (t.startsWith('only:')) only = t.slice(5);
      else if (t.startsWith('-')) off.add(t.slice(1));
    }
  }
  return { off, only };
}

/** Standard-Planer: Leerlauf, Rückfall setTimeout. Liefert { cancel }. fn bekommt die verfügbare Zeit in ms. */
function defaultSchedule(fn) {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback((d) => fn(d && typeof d.timeRemaining === 'function' ? d.timeRemaining() : BUDGET_MS), { timeout: 1500 });
    return { cancel: () => { if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id); } };
  }
  const id = setTimeout(() => fn(BUDGET_MS), 16);
  return { cancel: () => clearTimeout(id) };
}

/**
 * @param {object} ctx Modul-ctx (scene, quality(), opts)
 * @param {object} [o] { schedule(fn) → { cancel } } für Tests
 */
export function createUltra(ctx, o = {}) {
  const schedule = o.schedule || defaultSchedule;
  const flt = parseUfx(ctx && ctx.opts && ctx.opts.dev && ctx.opts.dev.ufx);
  const entries = new Map(); // key → { key, build, parent, built, failed, api, ms }
  let job = null;
  let disposed = false;
  let lastActive = false;

  const level = () => { try { return ctx.quality(); } catch { return 'mid'; } };
  const isActive = () => level() === 'ultra';
  const allowed = (key) => (flt.only ? key === flt.only : !flt.off.has(key));
  // Ultra erreichbar? (gleiche Regel wie store.js: opts.ultraOk, nie Handy). Sonst nur bauen, wenn die Stufe wirklich 'ultra' ist.
  const reachable = () => !!(ctx && ctx.opts && ctx.opts.ultraOk === true && !ctx.isPhone);
  const wantBuild = () => (reachable() ? atLeast(level(), 'high') : level() === 'ultra');
  const visibleNow = (e) => !disposed && isActive() && allowed(e.key) && !!e.built;

  function setShown(e, v) {
    if (!!e.shown === v) return;
    e.shown = v;
    if (e.api && typeof e.api.onVisible === 'function') {
      try { e.api.onVisible(v); } catch (err) { warn(`Ultra-Detail "${e.key}".onVisible`, err); }
    }
  }

  function applyVisibility() {
    for (const e of entries.values()) {
      if (!e.built || !e.api.object) continue;
      const v = visibleNow(e);
      e.api.object.visible = v;
      setShown(e, v);
    }
  }

  function buildOne(e) {
    const t0 = now();
    try {
      const api = e.build(ctx);
      if (!api || !api.object) throw new Error('build() liefert kein { object }');
      e.api = api;
      e.built = true;
      api.object.visible = false;
      (e.parent || ctx.scene).add(api.object);
      api.object.visible = visibleNow(e);
      setShown(e, api.object.visible);
    } catch (err) {
      e.failed = true;
      warn(`Ultra-Detail "${e.key}" konnte nicht gebaut werden`, err);
    }
    e.ms = +(now() - t0).toFixed(2);
  }

  function pending() {
    if (!wantBuild()) return [];
    return [...entries.values()].filter((e) => !e.built && !e.failed && allowed(e.key));
  }

  /** Gebaute Einträge, die noch nicht vorgewärmt wurden (nur ab Stufe >= high, wie der Bau). */
  function warmPending() {
    if (!wantBuild()) return [];
    return [...entries.values()].filter((e) => e.built && !e.failed && e.warm === undefined && allowed(e.key));
  }

  function warmOne(e) {
    const r = ctx.renderer;
    if (!r || !ctx.camera || !e.api) { e.warm = false; return; }
    e.warm = true; // sofort markieren (kein Doppelstart), bei Fehler unten zurücksetzen
    const t0 = now();
    try {
      warmObject(r, e.api.object, ctx.camera, ctx.scene, { textures: e.api.textures, debug: !!(ctx.opts && ctx.opts.debug) })
        .then((did) => { if (!did) e.warm = false; }, () => { e.warm = false; });
    } catch (err) { e.warm = false; warn(`Ultra-Detail "${e.key}" warm`, err); }
    e.warmMs = +(now() - t0).toFixed(2);
  }

  function step(avail) {
    job = null;
    if (disposed) return;
    if (!pending().length) { // nur noch Vorwärmen: ein Eintrag je Häppchen, nie im Bau-Häppchen
      const w = warmPending();
      if (w.length) warmOne(w[0]);
      kick();
      return;
    }
    const t0 = now();
    const budget = Math.min(BUDGET_MS, Number.isFinite(avail) && avail >= 0 ? avail : BUDGET_MS);
    let todo = pending();
    // Mindestens ein Eintrag je Häppchen (Fortschritt garantiert), weitere nur solange das Zeitbudget reicht.
    while (todo.length) {
      buildOne(todo[0]);
      todo = pending();
      if (now() - t0 >= budget) break;
    }
    kick(); // weitere Bauten oder das Vorwärmen im nächsten Häppchen
  }

  function kick() {
    if (job || disposed || !(pending().length || warmPending().length)) return;
    job = schedule(step);
  }

  function disposeEntry(e) {
    if (!e.built || !e.api) return;
    try {
      setShown(e, false);
      if (typeof e.api.dispose === 'function') e.api.dispose();
      else if (e.api.object) disposeTree(e.api.object);
      if (e.api.object && e.api.object.removeFromParent) e.api.object.removeFromParent();
    } catch (err) { warn(`Ultra-Detail "${e.key}" dispose`, err); }
    e.built = false;
    e.warm = undefined;
    e.shown = false;
    e.api = null;
  }

  const api = {
    register(key, build, opts = {}) {
      if (disposed || typeof build !== 'function' || typeof key !== 'string' || !key || entries.has(key)) return () => {};
      const e = { key, build, parent: opts && opts.parent ? opts.parent : null, built: false, failed: false, api: null, ms: 0, shown: false, warm: undefined, warmMs: 0 };
      entries.set(key, e);
      kick();
      return () => {
        if (entries.get(key) !== e) return;
        entries.delete(key);
        disposeEntry(e);
      };
    },
    isActive,
    has: (key) => entries.has(key),
    keys: () => [...entries.keys()],
    list: () => [...entries.values()].map((e) => ({ key: e.key, built: e.built, visible: !!(e.built && e.api.object && e.api.object.visible), ms: e.ms, warm: e.warm === true })),
  };

  return {
    api,
    /** Pro Frame (nach den Modulen): update nur für gebaute, sichtbare Einträge. */
    update(dt, t) {
      if (disposed) return;
      const act = isActive();
      if (act !== lastActive) { lastActive = act; applyVisibility(); }
      if (!act) return;
      for (const e of entries.values()) {
        if (!e.built || !e.api || typeof e.api.update !== 'function' || !visibleNow(e)) continue;
        try { e.api.update(dt, t); } catch (err) { warn(`Ultra-Detail "${e.key}".update`, err); }
      }
    },
    /** Stufenwechsel: Sichtbarkeit umschalten, ab >= high im Leerlauf nachbauen. */
    onQuality() {
      if (disposed) return;
      lastActive = isActive();
      applyVisibility();
      kick();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (job) { try { job.cancel(); } catch { /* egal */ } job = null; }
      for (const e of entries.values()) disposeEntry(e);
      entries.clear();
    },
  };
}
