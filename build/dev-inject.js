// Dev-Loader: wird per javascript_tool in den Jellyfin-Test-Tab eingefügt (nur Entwicklung).
// Neutralisiert das fremde "Abyss Spotlight" und lädt LenzFlix frisch vom lokalen Dev-Server.
// Optionen (vor dem Loader auf window setzen):
//   __lfxDevBase      Basis-URL des Dev-Servers (Standard http://localhost:5179/); Tunnel-URL mit Slash am Ende,
//                     wenn localhost im Browser gesperrt ist.
//   __lfxNoJs         true -> nur CSS laden.
//   __lfxDevNoLiveCss true -> die @import-Regel des Custom-CSS (Live-Version) entfernen; andere Regeln
//                     (z. B. --lfx-stats-url/--lfx-charts-url) bleiben erhalten.
// Der Dev-<link> steht NACH Jellyfins Theme-CSS und dem Custom-CSS-<style>, damit er wie live in der Kaskade wirkt.
(() => {
  const base = window.__lfxDevBase || 'http://localhost:5179/';
  const ts = Date.now();
  document.querySelectorAll('.featurediframe, #abyss-spotlight-backdrop, #abyss-spotlight-frame-style, #abyss-spotlight-backdrop-style').forEach((e) => e.remove());
  document.documentElement.classList.remove('abyss-spotlight-visible');
  document.querySelectorAll('.abyss-spotlight-active').forEach((e) => e.classList.remove('abyss-spotlight-active'));
  document.getElementById('lfx-dev-css')?.remove();
  document.querySelectorAll('link.lfx-theme-css').forEach((e) => e.remove());
  // Custom-CSS-<style> mit @import ...lenzflix finden (Jellyfin hängt es in <head> an)
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
  delete window.LenzFlixLive; // altes Engine-Bundle (LENZ LIVE) verwerfen
  document.getElementById('lfx-dev-js')?.remove();
  const s = Object.assign(document.createElement('script'), { id: 'lfx-dev-js', src: `${base}dist/lenzflix.js?${ts}` });
  document.head.appendChild(s);
})();
