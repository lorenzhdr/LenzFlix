# LenzFlix – CLAUDE.md

Inoffizielles Netflix-artiges Theme für Jellyfin-Web 12.4: CSS-Kern (wirkt allein) + optionales JS (Billboard, Zeilen, Hovercard, Modal, „Neu und beliebt“, Handy-Nav, Ambient) + optionales begehbares 3D-Design (VIDEOTHEK LENZ). Ausgabe: `dist/lenzflix(.min).css|js`, `dist/lenzstore(.min).css|js`. Keine fremden Marken-/Dienstnamen, -Logos oder -Assets im Code und in Texten (Repo ist öffentlich; Marken „LENZFLIX“, „LENZ+“, „LENZPRIME“, „LENZ//84“, „VIDEOTHEK LENZ“); UI-Sprache Deutsch.

## Befehle
- `npm run build` (lightningcss → CSS, esbuild → IIFE-JS), `npm run dev` (Watch, unminifiziert), `npm test` (vitest + jsdom, `// @vitest-environment jsdom` pro Datei), `npm run lint`, `npm run serve` (Dev-Server :5179, bindet nur 127.0.0.1, liefert nur `dist/` und `assets/` plus explizit `/store-dev.html|js` und `/boot.js` aus `build/`; Port per `PORT=`).
- `src/css/index.css`: keine Globs, neue CSS-Dateien dort eintragen (Reihenfolge = Kaskade). Neue Features in `src/js/features/index.js` eintragen.
- CSS-Asset-URLs relativ zu `dist/` schreiben (`../assets/...`), der Build schreibt sie nicht um.
- Keine Netzwerkzugriffe in Tests (fetch/ApiClient mocken).
- `npm i`-Falle: npm entfernt optionale `@rolldown/binding-*`-Einträge aus `package-lock.json` → Lockfile nach `npm i` prüfen (Diff).

## Dev-Loop
`build/dev-inject.js` per Konsole/`javascript_tool` in einen eingeloggten Jellyfin-Tab einfügen: entfernt Fremd-Spotlight, ruft `window.LenzFlix.destroy()`, lädt CSS+JS von `http://localhost:5179`. `window.__lfxNoJs = true` → nur CSS. Chrome muss „Lokales Netzwerk“ für die Seite erlauben. Der Dev-`<link>` steht nach Jellyfins Theme-CSS und dem Custom-CSS-`<style>` (Kaskade wie live); `window.__lfxDevNoLiveCss = true` entfernt zusätzlich nur die `@import`-Regel des Custom-CSS (`--lfx-stats-url`/`--lfx-charts-url` bleiben).
Im Claude-in-Chrome-Tab sind Requests an localhost aktuell gesperrt (seit Nov 2026). Kurz-Loader `build/dev-boot.js` (über serve als `/boot.js`, leitet die Basis-URL aus der Skript-Adresse ab, tut dasselbe wie `dev-inject.js`): `document.head.appendChild(Object.assign(document.createElement('script'),{src:'<base>/boot.js?'+Date.now()}))`; `window.__lfxDevTheme` wählt das Design (Standard `store`); entfernt altes `window.LenzFlixStore3D`.
Workaround: temporärer cloudflared-Tunnel, Ablauf siehe unten.

### Live-Test im Jellyfin-Tab über Tunnel
Den Tunnel nur mit ausdrücklicher Zustimmung des Nutzers starten, weil er den Dev-Server öffentlich erreichbar macht. Nach dem Test immer beenden.
1. `npm run build` ausführen. Der Tunnel liefert `dist/` aus, nicht `src/`.
2. Den Dev-Server im Hintergrund auf eigenem Port starten: `PORT=5191 node build/serve.mjs`.
3. Den Tunnel im Hintergrund starten: `.tmp/tools/cloudflared.exe tunnel --no-autoupdate --url http://127.0.0.1:5191 > .tmp/tunnel.log 2>&1`.
   - Das Binary ist gitignored. Fehlt es, mit Zustimmung `cloudflared-windows-amd64.exe` von den offiziellen Releases auf GitHub (`cloudflare/cloudflared`) dorthin laden.
   - Die URL steht nach etwa 5 bis 10 s im Log: `grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' .tmp/tunnel.log`. Jeder Start erzeugt eine neue URL.
   - Blockiert die Auto-Mode-Prüfung den Start, den Nutzer um ausdrückliche Freigabe bitten.
4. Im eingeloggten Jellyfin-Tab laden (Claude-in-Chrome, eigener neuer Tab, `javascript_tool`):
   ```js
   const base = '<tunnel-url>/';
   window.__lfxStoreDebug = true;   // optional: window.__lfxStore (stats/teleport/take/zones)
   window.__lfxDevBase = base;
   window.__lfxDevTheme = 'store';  // Design, Standard 'store'
   document.head.appendChild(Object.assign(document.createElement('script'), { src: base + 'boot.js?' + Date.now() }));
   ```
   - VR-Emulator (optional): vorher `base + 'xr-emu.js'` als Skript laden und `onload` abwarten, danach `window.__xrEmu.device.stereoEnabled = true` setzen. Dafür muss `.tmp/xr-emu.js` gebaut sein.
   - Am Handy funktionieren dieselben Zeilen als Lesezeichen mit dem Präfix `javascript:void `. Das Lesezeichen veraltet mit jeder neuen Tunnel-URL.
5. Nach Code-Änderungen erneut `npm run build` ausführen und den Loader neu starten. Er räumt per `destroy()` auf und lädt das 3D-Bundle frisch.
6. Aufräumen:
   - `boot.js` stellt das Design per Hash um, und das bleibt gespeichert. Am Ende `#/home?lfxtheme=<vorheriges Design>` aufrufen.
   - Im Player verstellte Ton- und Untertitelspuren zurückstellen.
   - Tunnel und Server per PID beenden, in PowerShell mit `Get-Process cloudflared` und `Get-NetTCPConnection -LocalPort 5191 -State Listen`, dann `Stop-Process -Id …`.
   - Die Test-Tabs schließen.
   - Zum Schluss prüfen, dass weder `cloudflared` noch `serve.mjs` mehr läuft.

## Designs (LENZFLIX `flix` Standard, LENZ+ `plus`, LENZPRIME `prime`, LENZ//84 `retro`, VIDEOTHEK LENZ `store`; retro/store Beta)
- Design-Kern `core/theme.js` (+ `themecss.js`, `themepicker.js`, `popover.js`), Features in `features/plus|prime|retro/`, CSS in `src/css/themes/<id>/` (eigene Bundles `dist/lenzplus|lenzprime|lenzretro(.min).css`, per JS nachgeladen). `core/` und `shared/` gehören allen Designs, Änderungen dort wirken auf alle: nie Verhalten von LENZFLIX brechen. Details und Regeln: `docs/js-contracts.md` („Designs“).
- Design-CSS nur unter `html.lfx-js.lfx-theme-<id>:not(.layout-tv)`; TV ist immer LENZFLIX. Design-Features matchen per `isTheme(id)`, Router ist zweiphasig (erst alle Unmounts, dann Mounts).
- LENZ//84 (`retro`, Beta; Menüeintrag „Design Einstellungen“ trägt `badge: 'Beta'`): Alle Schleifen/globalen Listener (CRT, Boot, Glitch, Sound, Cheat-Code, Terminal, Code-Regen) gehören `features/retro/fx/`, andere retro-Features melden nur per `emitFx` aus `features/retro/prefs.js`; fx ist im Player und auf dem Dashboard aus. Sound standardmäßig aus. Texte ohne fremde Marken („Kassette“, „Cheat-Code“, „Code-Regen“). Die Statistik-Seite führt die retro-Schriften/Logo als eigene Kopien in `charts-worker/public/lenzflix-stats/`.
- VIDEOTHEK LENZ (`store`, Beta, begehbare 3D-Videothek), Vertrag: `docs/store3d.md`:
  - Zwei Bundles: Hülle `features/store/` im Hauptbundle (importiert nie `three`, Build-Wächter in `build/build.mjs`); 3D `src/js/store3d/**` → lazy `dist/lenzstore.js` per `core/themejs.js`, importiert nur `three` + eigene Dateien, alles Zustandsbehaftete (Jellyfin, Theme, Router) per `deps` von der Hülle.
  - Erweiterungen als Module (`store3d/modules/`, Registry `modules/index.js`, ctx-API).
  - Lebenszyklus-Ausnahme: `unmount()` → suspend, nach 3 min dispose; Design-Wechsel/`destroy()` → dispose sofort.
  - Dev-Harness `build/store-dev.html` (über serve `/store-dev.html`); Debug: `window.__lfxStoreDebug = true` → `window.__lfxStore`.
  - Die Statistik-Seite kennt `store` nicht und zeigt den LENZFLIX-Look.
  - VR-Modus (Beta, WebXR): `store3d/xr/` + `store3d/cinema/` (Kino), Player-Bridge nur in der Hülle `features/store/cinema-bridge.js` (Jellyfin-DOM nie im 3D-Bundle); Vertrag in `docs/store3d.md` („VR-Modus“). Ohne XR-Session muss 2D bitgleich bleiben; keine Marken-/Gerätenamen von Brillen/Controllern (Texte: „VR-Brille“, „Controller“, „Hände“), kein UA-Sniffing.
  - Test ohne Brille: Harness `/store-dev.html?xremu=1&xrshot=1&cinema=1` (Fake-Player; `?cinema=series|fail`, `?subs=srt|ass|off`), Emulator-Bundle `.tmp/xr-emu.js` selbst bauen (nicht committen, `serve` liefert 404 ohne). Emulator-Canvas liegt unter der Bühne: `xrshot=1` blendet sie in XR aus. Fahrskript (CDP, Headless-Chrome, gitignored): `node .tmp/vr/e2e/xr-e2e.mjs --list` bzw. `--only enter,take`. Pro Chrome-Start einen eigenen CDP-Port nehmen, weil derselbe Port mit demselben Profil direkt nacheinander hängt.
  - Falle: `CanvasTexture` nach Größenwechsel der Canvas nie weiterverwenden (three legt den Speicher fest an) → alte Textur `dispose()`, neue anlegen (`xr/panel.js`, `cinema/subtitles.js`).
- Statistik-Seite lokal: `node build/stats-dev.mjs` (127.0.0.1:5180), `/lenzflix-stats/dev-login.html?theme=flix|plus|prime|retro`; Produktiv-CSP (keine Inline-Skripte) beachten. Style-Regression: `build/style-snapshot.js` in der Konsole vor/nach der Änderung, dann `node build/style-diff.mjs alt.json neu.json`.

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
