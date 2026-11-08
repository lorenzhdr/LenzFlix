// Dev-Loader: wird per javascript_tool in den Jellyfin-Test-Tab eingefügt (nur Entwicklung).
// Neutralisiert das fremde "Abyss Spotlight" und lädt LenzFlix frisch vom lokalen Dev-Server.
(() => {
  const base = 'http://localhost:5179/';
  const ts = Date.now();
  document.querySelectorAll('.featurediframe, #abyss-spotlight-backdrop, #abyss-spotlight-frame-style, #abyss-spotlight-backdrop-style').forEach((e) => e.remove());
  document.documentElement.classList.remove('abyss-spotlight-visible');
  document.querySelectorAll('.abyss-spotlight-active').forEach((e) => e.classList.remove('abyss-spotlight-active'));
  document.getElementById('lfx-dev-css')?.remove();
  const link = Object.assign(document.createElement('link'), { id: 'lfx-dev-css', rel: 'stylesheet', href: `${base}dist/lenzflix.css?${ts}` });
  document.head.appendChild(link);
  if (window.__lfxNoJs) return;
  if (window.LenzFlix?.destroy) window.LenzFlix.destroy();
  document.getElementById('lfx-dev-js')?.remove();
  const s = Object.assign(document.createElement('script'), { id: 'lfx-dev-js', src: `${base}dist/lenzflix.js?${ts}` });
  document.head.appendChild(s);
})();
