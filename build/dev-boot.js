// Kurz-Loader (nur Entwicklung): per Konsole oder Lesezeichen von der Dev-Server-/Tunnel-URL geladen.
// Leitet die Basis-URL aus der eigenen Skript-Adresse ab und macht dasselbe wie build/dev-inject.js.
// Optional vorher setzen: window.__lfxDevTheme = 'store' | 'flix' | … (Standard 'store'),
// window.__lfxNoJs = true (nur CSS), window.__lfxDevNoLiveCss = true (@import-Regel des Custom-CSS entfernen).
(() => {
  const me = document.currentScript && document.currentScript.src;
  const base = me ? me.replace(/boot\.js.*$/, '') : window.__lfxDevBase;
  if (!base) return;
  window.__lfxDevBase = base;
  const ts = Date.now();
  const theme = window.__lfxDevTheme || 'store';
  history.replaceState(history.state, '', `${location.pathname}#/home?lfxtheme=${encodeURIComponent(theme)}`);
  document.querySelectorAll('.featurediframe, #abyss-spotlight-backdrop, #abyss-spotlight-frame-style, #abyss-spotlight-backdrop-style').forEach((e) => e.remove());
  document.documentElement.classList.remove('abyss-spotlight-visible');
  document.querySelectorAll('.abyss-spotlight-active').forEach((e) => e.classList.remove('abyss-spotlight-active'));
  document.getElementById('lfx-dev-css')?.remove();
  document.querySelectorAll('link.lfx-theme-css, script.lfx-theme-js').forEach((e) => e.remove());
  const customStyle = [...document.querySelectorAll('style')].find((s) => /@import[^;]*lenzflix/i.test(s.textContent || ''));
  if (window.__lfxDevNoLiveCss && customStyle?.sheet) {
    const rules = customStyle.sheet.cssRules;
    for (let i = rules.length - 1; i >= 0; i--) {
      if (rules[i].type === CSSRule.IMPORT_RULE && /lenzflix/i.test(rules[i].href || '')) customStyle.sheet.deleteRule(i);
    }
  }
  const link = Object.assign(document.createElement('link'), { id: 'lfx-dev-css', rel: 'stylesheet', href: `${base}dist/lenzflix.css?${ts}` });
  if (customStyle) customStyle.after(link);
  else document.body.appendChild(link);
  if (window.__lfxNoJs) return;
  if (window.LenzFlix?.destroy) window.LenzFlix.destroy();
  delete window.LenzFlixStore3D; // altes 3D-Bundle (VIDEOTHEK LENZ) verwerfen, damit der frische Stand nachgeladen wird
  delete window.LenzFlixTvMode; // altes TV-Modus-Bundle verwerfen
  document.getElementById('lfx-dev-js')?.remove();
  document.head.appendChild(Object.assign(document.createElement('script'), { id: 'lfx-dev-js', src: `${base}dist/lenzflix.js?${ts}` }));
})();
