// Kurz-Loader (nur Entwicklung): per Konsole oder Lesezeichen von der Dev-Server-/Tunnel-URL geladen.
// Leitet die Basis-URL aus der eigenen Skript-Adresse ab und macht dasselbe wie build/dev-inject.js.
// Optional vorher setzen: window.__lfxDevTheme = 'store' | 'flix' | … (Standard 'store').
(() => {
  const me = document.currentScript && document.currentScript.src;
  const base = me ? me.replace(/boot\.js.*$/, '') : window.__lfxDevBase;
  if (!base) return;
  window.__lfxDevBase = base;
  const ts = Date.now();
  const theme = window.__lfxDevTheme || 'store';
  history.replaceState(history.state, '', `${location.pathname}#/home?lfxtheme=${encodeURIComponent(theme)}`);
  document.querySelectorAll('.featurediframe, #abyss-spotlight-backdrop').forEach((e) => e.remove());
  document.getElementById('lfx-dev-css')?.remove();
  document.querySelectorAll('link.lfx-theme-css, script.lfx-theme-js').forEach((e) => e.remove());
  const customStyle = [...document.querySelectorAll('style')].find((s) => /@import[^;]*lenzflix/i.test(s.textContent || ''));
  const link = Object.assign(document.createElement('link'), { id: 'lfx-dev-css', rel: 'stylesheet', href: `${base}dist/lenzflix.css?${ts}` });
  if (customStyle) customStyle.after(link);
  else document.body.appendChild(link);
  if (window.LenzFlix?.destroy) window.LenzFlix.destroy();
  delete window.LenzFlixStore3D; // altes 3D-Bundle (VIDEOTHEK LENZ) verwerfen, damit der frische Stand nachgeladen wird
  delete window.LenzFlixLive; // altes Engine-Bundle (LENZ LIVE) verwerfen
  delete window.LenzFlixTvMode; // altes TV-Modus-Bundle verwerfen
  document.getElementById('lfx-dev-js')?.remove();
  document.head.appendChild(Object.assign(document.createElement('script'), { id: 'lfx-dev-js', src: `${base}dist/lenzflix.js?${ts}` }));
})();
