# LenzFlix – CLAUDE.md

Inoffizielles Netflix-artiges Theme für Jellyfin-Web 12.4: CSS-Kern (wirkt allein) + optionales JS (Billboard, Zeilen, Hovercard, Modal, „Neu und beliebt“, Handy-Nav, Ambient). Ausgabe: `dist/lenzflix(.min).css|js`. Keine Netflix-Namen/-Logos/-Assets im Code (Marke „LENZFLIX“); UI-Sprache Deutsch.

## Befehle
- `npm run build` (lightningcss → CSS, esbuild → IIFE-JS), `npm run dev` (Watch, unminifiziert), `npm test` (vitest + jsdom, `// @vitest-environment jsdom` pro Datei), `npm run lint`, `npm run serve` (Dev-Server :5179, bindet nur 127.0.0.1, liefert nur `dist/` und `assets/`).
- `src/css/index.css`: keine Globs, neue CSS-Dateien dort eintragen (Reihenfolge = Kaskade). Neue Features in `src/js/features/index.js` eintragen.
- CSS-Asset-URLs relativ zu `dist/` schreiben (`../assets/...`), der Build schreibt sie nicht um.
- Keine Netzwerkzugriffe in Tests (fetch/ApiClient mocken).

## Dev-Loop
`build/dev-inject.js` per Konsole/`javascript_tool` in einen eingeloggten Jellyfin-Tab einfügen: entfernt Fremd-Spotlight, ruft `window.LenzFlix.destroy()`, lädt CSS+JS von `http://localhost:5179`. `window.__lfxNoJs = true` → nur CSS. Chrome muss „Lokales Netzwerk“ für die Seite erlauben. Der Dev-`<link>` steht nach Jellyfins Theme-CSS und dem Custom-CSS-`<style>` (Kaskade wie live); `window.__lfxDevNoLiveCss = true` entfernt zusätzlich nur die `@import`-Regel des Custom-CSS (`--lfx-stats-url`/`--lfx-charts-url` bleiben).
Im Claude-in-Chrome-Tab sind Requests an localhost aktuell gesperrt (seit Nov 2026). Workaround: temporärer cloudflared-Tunnel (`cloudflared tunnel --no-autoupdate --url http://127.0.0.1:5179`, nur mit Zustimmung des Nutzers, nach dem Test beenden) und vor dem Loader `window.__lfxDevBase = '<tunnel-url>/'` setzen.

## Architektur & Verträge
- Maßgeblich: `docs/dom-map.md` (live verifizierte Jellyfin-DOM-Karte, Proxy-Klick für Wiedergabe, Selektoren) und `docs/js-contracts.md` (Kartenmarkup, öffentliche Feature-Funktionen, Regeln für Feature-Autoren). Vor Änderungen dort nachlesen.
- Keine React-Knoten mutieren; eigene Mount-Points (`#lfx-nav`, `#lfx-home`, `#lfx-newpopular`, `#lfx-hovercard`), native Elemente nur per CSS-Klasse (`html.lfx-nav-on`, `lfx-home-on`, …) verstecken.
- Wiedergabe immer über `core/playback.js` (Proxy-Klick), nicht über `playbackManager` (nicht global).
- Jedes Feature räumt in `unmount()` alles auf; `destroy()` entfernt alles. Keine Tokens/Credentials loggen, Bild-URLs ohne api_key.
- Nur `--lfx-*`-Tokens aus `tokens.css` nutzen.

## Scoping-Regeln
- Modern: `html:not(.layout-tv)` (Modern-Layout erkennt man an `header.MuiAppBar-root`; es gibt keine eigene Modern-Klasse von Jellyfin).
- TV: `html.layout-tv`, **ohne `:has` und ohne CSS-Nesting** (alte TV-Browser).
- JS-UI-Styles: nur unter `html.lfx-js`; pointerabhängige Effekte nur unter `(hover:hover) and (pointer:fine)`; nicht auf TV.
- `.skinHeader` existiert im Modern-Layout versteckt im DOM, Selektoren darauf immer scopen.

## Fallstricke (aus dom-map)
- Kartentexte stehen in `.cardFooter` **oder** `.cardBox > .cardText`, beides abdecken.
- Desktop-Backdrop der Detailseite liegt im globalen `.backdropContainer`, nicht in `#itemBackdrop`.
- `#videoOsdPage` trägt `.libraryPage`: Bibliotheks-Regeln dürfen den Player nicht treffen.
- `.card:not(.show-animation)` hat `contain: layout style paint` (schneidet Hover-Scale ab); `.card` hat `background:none !important`.
- Custom CSS ist ein `<style>` ohne `@layer`: bei gleicher Spezifität gewinnt die spätere Regel.
- Das Testkonto auf dem Entwicklungs-Server hat keine Transkodierung (für Player-Tests h264-Titel nehmen). Fremd-Elemente dort (Abyss Spotlight, `.featurediframe`) im Dev-Loop neutralisieren.
- Jellyfin 12.4 ignoriert `MinDateCreated` bei `/Items` (live geprüft) – nach `DateCreated` absteigend sortieren und clientseitig filtern.
- Version vor jedem Release in `package.json`, `VERSION` (`src/js/core/version.js`) und den jsDelivr-URLs der README angleichen; Release = Tag `vX.Y.Z` (jsDelivr pinnt darauf).

## Verbote
- `reference/` und `.tmp/` nie committen (stehen in `.gitignore`).
- Öffentliches Repo `lorenzhdr/LenzFlix` (Submodul `NetflixTheme` im Hauptrepo `Clausi_Projects`): nicht ungefragt committen/pushen/taggen. `charts-worker/wrangler.local.jsonc` (echte Domains, gitignored) nie committen.
