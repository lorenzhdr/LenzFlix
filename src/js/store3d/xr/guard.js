// VIDEOTHEK LENZ · deps-Wächter: In VR führen DOM-Wege (Toast, Menüs, Klassische Ansicht …) ins Leere.
// wrapDeps liefert ein neues deps-Objekt; solange keine Sitzung präsentiert, rufen alle Wrapper die Originalfunktion unverändert auf.

const EXIT_THEN = ['classicView', 'openLibraries', 'openSettings', 'openThemePicker', 'openMenu', 'logout', 'onBigCovers'];
const EXIT_LABEL = 'Das geht nur außerhalb von VR';

export function wrapDeps(deps, getXr) {
  if (!deps || typeof deps !== 'object') return deps;
  const out = { ...deps };
  const live = () => { const x = getXr && getXr(); return x && x.presenting ? x : null; };

  if (typeof deps.toast === 'function') {
    out.toast = (...a) => { const x = live(); return x ? x.toast(a[0]) : deps.toast(...a); };
  }
  if (typeof deps.play === 'function') {
    out.play = (item, o) => {
      const x = live();
      if (!x) return deps.play(item, o);
      x.beforePlay(item, o);
      const res = deps.play(item, o);
      const fail = () => { if (typeof x.leaveCinema === 'function') x.leaveCinema('fail'); };
      if (res && typeof res.then === 'function') res.then((ok) => { if (ok === false) fail(); }, fail);
      else if (res === false) fail();
      return res;
    };
  }
  for (const name of EXIT_THEN) {
    if (typeof deps[name] !== 'function') continue;
    out[name] = (...a) => {
      const x = live();
      if (!x) return deps[name](...a);
      return x.exitThen(EXIT_LABEL, () => deps[name](...a));
    };
  }
  if (typeof deps.onFatal === 'function') {
    out.onFatal = (...a) => {
      const x = live();
      if (x) { try { x.exit(); } catch { /* egal */ } }
      return deps.onFatal(...a);
    };
  }
  return out;
}
