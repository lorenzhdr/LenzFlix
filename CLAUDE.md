# LenzFlix – CLAUDE.md

Inoffizielles Streaming-artiges Theme für Jellyfin-Web 12.4: CSS-Kern (wirkt allein) + optionales JS (Billboard, Zeilen, Hovercard, Modal, „Neu und beliebt“, Handy-Nav, Ambient) + optionales begehbares 3D-Design (VIDEOTHEK LENZ) + TV-Modus (IPTV-Seite in LENZFLIX/LENZ+/LENZPRIME). Ausgabe: `dist/lenzflix(.min).css|js`, `dist/lenzstore(.min).css|js`, `dist/lenztvmode(.min).css|js`. Keine fremden Marken-/Dienstnamen, -Logos oder -Assets im Code und in Texten (Repo ist öffentlich; Marken „LENZFLIX“, „LENZ+“, „LENZPRIME“, „LENZ//84“, „VIDEOTHEK LENZ“); UI-Sprache Deutsch.

## Befehle
- `npm run build` (lightningcss → CSS, esbuild → IIFE-JS), `npm run dev` (Watch, unminifiziert), `npm test` (vitest + jsdom, `// @vitest-environment jsdom` pro Datei; die volle Suite läuft unter Last teils in Timeouts (~15 zeitkritische Tests) → ggf. `npx vitest run --maxWorkers=3`), `npm run lint`, `npm run serve` (Dev-Server :5179, bindet nur 127.0.0.1, liefert nur `dist/` und `assets/` plus explizit `/store-dev.html|js`, `/picker-dev.html|js`, `/tvmode-dev.html|js` und `/boot.js` aus `build/` sowie lesend `src/js/**/*.js` (Picker-Harness); Port per `PORT=`).
- `src/css/index.css`: keine Globs, neue CSS-Dateien dort eintragen (Reihenfolge = Kaskade). Neue Features in `src/js/features/index.js` eintragen.
- CSS-Asset-URLs relativ zu `dist/` schreiben (`../assets/...`), der Build schreibt sie nicht um.
- Keine Netzwerkzugriffe in Tests (fetch/ApiClient mocken).
- `npm i`-Falle: npm entfernt optionale `@rolldown/binding-*`-Einträge aus `package-lock.json` → Lockfile nach `npm i` prüfen (Diff).

## Dev-Loop
`build/dev-inject.js` per Konsole/`javascript_tool` in einen eingeloggten Jellyfin-Tab einfügen: entfernt Fremd-Spotlight, ruft `window.LenzFlix.destroy()`, lädt CSS+JS von `http://localhost:5179`. `window.__lfxNoJs = true` → nur CSS. Chrome muss „Lokales Netzwerk“ für die Seite erlauben. Der Dev-`<link>` steht nach Jellyfins Theme-CSS und dem Custom-CSS-`<style>` (Kaskade wie live); `window.__lfxDevNoLiveCss = true` entfernt zusätzlich nur die `@import`-Regel des Custom-CSS (`--lfx-stats-url`/`--lfx-charts-url` bleiben).
Im Claude-in-Chrome-Tab sind Requests an localhost aktuell gesperrt (seit Nov 2026). Kurz-Loader `build/dev-boot.js` (über serve als `/boot.js`, leitet die Basis-URL aus der Skript-Adresse ab, tut dasselbe wie `dev-inject.js`, wertet also auch `__lfxNoJs` und `__lfxDevNoLiveCss` aus, setzt aber zusätzlich per `replaceState` `#/home?lfxtheme=<Design>`): `document.head.appendChild(Object.assign(document.createElement('script'),{src:'<base>/boot.js?'+Date.now()}))`; `window.__lfxDevTheme` wählt das Design (Standard `store`, wird immer per Hash gesetzt); entfernt altes `window.LenzFlixStore3D`.
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

## Designs (LENZFLIX `flix` Standard, LENZ+ `plus`, LENZPRIME `prime`, LENZ//84 `retro`, VIDEOTHEK LENZ `store`; store Beta; das Design „LENZ LIVE“ gibt es seit 1.15.0 nicht mehr, ein gespeichertes `live` migriert `core/theme.js` einmalig)
- Design-Kern `core/theme.js` (+ `themecss.js`, `themepicker.js`, `popover.js`), Features in `features/plus|prime|retro/`, CSS in `src/css/themes/<id>/` (eigene Bundles `dist/lenzplus|lenzprime|lenzretro(.min).css`, per JS nachgeladen). `core/` und `shared/` gehören allen Designs, Änderungen dort wirken auf alle: nie Verhalten von LENZFLIX brechen. Details und Regeln: `docs/js-contracts.md` („Designs“).
- Design-CSS nur unter `html.lfx-js.lfx-theme-<id>:not(.layout-tv)`; TV ist immer LENZFLIX. Design-Features matchen per `isTheme(id)`, Router ist zweiphasig (erst alle Unmounts, dann Mounts).
- Datensparmodus (flix/plus/prime/retro, 1.12.0, retro seit 1.13.0): Kern `core/datasaver.js` (`isDataSaver(part?)` mit Teilschaltern trailer|hero|images|prefetch|lazy|tvwarm, Events `lfx:datasaver`/`lfx:datasaver-parts`), Bildgrößen `core/imgscale.js` (VIDEOTHEK ausgenommen), Vertrag `docs/js-contracts.md` („Datensparmodus“). Neue Hintergrund-Lader/Autoplays in diesen Designs müssen `isDataSaver(<Teil>)` prüfen und für laufende Vorgänge auf `onDataSaverChange` UND `onDataSaverPartsChange` reagieren.
- LENZFLIX-Seiten (1.13.0, nur `flix`): `#/home?lfx=series|movies[&genre=][&view=grid][&sort=]` (`features/library.js`, `library/*`) und `lfx=mylist[&type=][&sort=]` (`features/mylist.js`, auch retro). Falle: Def-Ids/Pool-Schlüssel mit Präfix `lib:<kind>:<genre|all>:`; als `ctx.pool.fetch` den UNGECACHTEN `fetchLibraryHeroPool` nehmen (Billboard cacht selbst unter `libraryPoolKey`, gleicher Schlüssel in beiden Ebenen = Billboard hängt im Skelett). Vertrag: `docs/js-contracts.md` („Bibliotheksseiten“).
- Geheimmenü (nur flix, `features/secretmenu.js`): 5 Klicks in 3 s aufs Logo; PC-Logo ist der native Link, per Capture-Delegation, nie mutieren. Bewusst nicht in der README.
- Retro-Fallen (1.13.0): Kassetten-Vorschau (`retro/hover.js`) ist die dokumentierte Ausnahme mit delegiertem `mouseover`/`mouseout` am `document` (nur `.lfx-retro-card[data-lfx-id]`). Player-Leiste: der Kern färbt per `#videoOsdPage` → gleiche ID-Spezifität nötig, `[id=…]` reicht nicht. Retro-TV-Look rein per CSS (`themes/retro/tvmode.css`), einzige Engine-Änderung `data-tvm-no` in `player-view.js`.
- LENZ//84 (`retro`): Alle Schleifen/globalen Listener (CRT, Boot, Glitch, Sound, Cheat-Code, Terminal, Code-Regen) gehören `features/retro/fx/`, andere retro-Features melden nur per `emitFx` aus `features/retro/prefs.js`; fx ist im Player und auf dem Dashboard aus. Sound standardmäßig aus. Texte ohne fremde Marken („Kassette“, „Cheat-Code“, „Code-Regen“). Die Statistik-Seite führt die retro-Schriften/Logo als eigene Kopien in `charts-worker/public/lenzflix-stats/`.
- VIDEOTHEK LENZ (`store`, Beta, begehbare 3D-Videothek), Vertrag: `docs/store3d.md`:
  - Zwei Bundles: Hülle `features/store/` im Hauptbundle (importiert nie `three`, Build-Wächter in `build/build.mjs`); 3D `src/js/store3d/**` → lazy `dist/lenzstore.js` per `core/themejs.js`, importiert nur `three` + eigene Dateien, alles Zustandsbehaftete (Jellyfin, Theme, Router) per `deps` von der Hülle.
  - Erweiterungen als Module (`store3d/modules/`, Registry `modules/index.js`, ctx-API).
  - Lebenszyklus-Ausnahme: `unmount()` → suspend, nach 3 min dispose; Design-Wechsel/`destroy()` → dispose sofort. Ausnahme davon: läuft das 2D-Kino im LENZ PALAST, parkt die Hülle die Bühne über `#/video` (`stage-park.js`), kein Suspend.
  - Open World (1.15.0, Vertrag `docs/store3d.md` „Open World“): Physik-Konstanten nur aus `nav/collide.js` (Kollider `{x0,z0,x1,z1,y0,y1,top,dynamic}`), Stadt rein in `world/city.js` (`layout.city`, `layout.bounds` = Welt, Laden = `zones.store`), Module sprechen nur über Provider (`city`, `areas`, `door`, `physics`, `npc`, `brawl`, `rent`, `discover`, `cinema2d`, `palast`) mit Guard, Schlag-Prio Richard 30 > Personen 20 > Objekte 10. Draw-Call-Ziel ≤140 bei `low`; neue Kollider nahe Gehwegen brechen `store3d-city-nav`. Jellyfin-Tastenkürzel unter der geparkten Bühne fängt `cinema/keyguard.js` ab.
  - Dev-Harness `build/store-dev.html` (über serve `/store-dev.html`); Debug: `window.__lfxStoreDebug = true` → `window.__lfxStore`.
  - Die Statistik-Seite kennt `store` nicht und zeigt den LENZFLIX-Look.
  - VR-Modus (Beta, WebXR): `store3d/xr/` + `store3d/cinema/` (Kino), Player-Bridge nur in der Hülle `features/store/cinema-bridge.js` (Jellyfin-DOM nie im 3D-Bundle); Vertrag in `docs/store3d.md` („VR-Modus“). Ohne XR-Session muss 2D bitgleich bleiben; keine Marken-/Gerätenamen von Brillen/Controllern (Texte: „VR-Brille“, „Controller“, „Hände“), kein UA-Sniffing.
  - Test ohne Brille: Harness `/store-dev.html?xremu=1&xrshot=1&cinema=1` (Fake-Player; `?cinema=series|fail|paused|slow`, `?subs=srt|ass|off`; Kino-Startfehler zeigen einen Code P/T1/T2/D/B, siehe `docs/store3d.md`), Emulator-Bundle `.tmp/xr-emu.js` selbst bauen (nicht committen, `serve` liefert 404 ohne). Emulator-Canvas liegt unter der Bühne: `xrshot=1` blendet sie in XR aus. Fahrskript (CDP, Headless-Chrome, gitignored): `node .tmp/vr/e2e/xr-e2e.mjs --list` bzw. `--only enter,take`. Pro Chrome-Start einen eigenen CDP-Port nehmen, weil derselbe Port mit demselben Profil direkt nacheinander hängt.
  - Falle: `CanvasTexture` nach Größenwechsel der Canvas nie weiterverwenden (three legt den Speicher fest an) → alte Textur `dispose()`, neue anlegen (`xr/panel.js`, `cinema/subtitles.js`).
- Dev-Harness `build/picker-dev.html` (über serve `/picker-dev.html`, lädt den echten Design-Picker aus `src/js/`, Fake-API): `?charts=0` (ohne Charts), `?api=0` (ohne API), `?delay=1` (Cover verzögert einblenden), `?day=YYYY-MM-DD` (Systemdatum für die Tagesmischung, `core/dayseed.js`).
- TV-Modus (`lfx=tv`, flix/plus/prime/retro, retro seit 1.13.0, Seite `#/home?lfx=tv`, Einstieg TV-Symbol in der Kopfleiste), Vertrag: `docs/tvmode.md`:
  - Zwei Bundles: Hülle `features/tvmode/` im Hauptbundle (Server-deps in `features/tvdata/deps.js`), Engine `src/js/tv/tvmode/**` → lazy `dist/lenztvmode.js` per `core/themejs.js`, CSS lazy per `core/addoncss.js`. Marker `__LFX_TVMODE_ENGINE__`, Build-Wächter in `build/build.mjs`. Importgrenze: nur `src/js/tv/**` (`schedule/`, `player/`, `ui/{logos,overlay-util,fullscreen,zapstats}.js`, `tvmode/`). `dist/lenztvmode.min.*` bleibt bei Änderungen außerhalb des TV-Modus byte-gleich (sha256 vor/nach; die unminifizierte `.js` trägt Pfadkommentare). Seit 1.15.0 (LENZ LIVE entfernt) ist der TV-Modus alleiniger Verbraucher von `src/js/tv/` (vorher `live/`) und `features/tvdata/` (vorher `features/live/`); Vertrag des Unterbaus: `docs/tvmode.md` („Geteilter Unterbau“).
  - Eigener Player ohne Fortschrittsmeldung (keine Spuren in „Weiterschauen“). Server-Fallen: nie `StartTimeTicks` an die HLS-URL (bricht die Playlist), erst `<video>` leeren, dann `DELETE /Videos/ActiveEncodings` (sonst startet der Job neu), `ApiKey` statt `api_key`, im PlaybackInfo `SubtitleStreamIndex: -1` UND alle Untertitelformate als `External` im DeviceProfile (sonst brennt der Server Default-Untertitel ein = Video-Umwandlung), aber in der zweiten Anfrage zur Tonspurwahl `MediaSourceId` mit und `SubtitleStreamIndex` weglassen (mit `-1` + `MediaSourceId` trägt die URL `SubtitleMethod=Encode`; gebrannt wird nur, wenn sie auch einen `SubtitleStreamIndex` enthält, `stream.js` wertet V-SUB nur dann; ohne `MediaSourceId` ignoriert der Server die Tonspur); HEVC nur per Remux (fMP4-HLS), wenn der Browser HEVC kann.
  - Planer (`src/js/tv/schedule/`) muss deterministisch bleiben (gleicher Plan auf allen Clients): kein `Math.random`, keine Lokalzeit, kein `Intl`; Zeit nur über `schedule/time.js` (MEZ/MESZ arithmetisch), Zufall nur über `schedule/hash.js`.
  - Admin-Senderbelegung (Plätze 5–16) per `LenzFlixConfig.tvChannels` oder CSS-Variable `--lfx-tv-channels` (Format `"5=Action;6=Komödie"`, `features/tvdata/config.js`); Rückfall auf die alten Namen `liveChannels` / `--lfx-live-channels` bleibt. Der IndexedDB-Name `lfx-live` in `features/tvdata/data.js` ist historisch und darf nicht geändert werden.
  - Präfix `lfx-tvm`; nie `.lfx-card`/`data-lfx-id` (Modal/Hovercard fangen sonst Klicks) und nie `lfx-live-*` (Build-Wächter). Kein CSS-Nesting, kein `:has`; nur Kern-`--lfx-*`-Tokens, Layout nur über `.is-phone`/`.is-landscape`.
  - Ereignisse: `lfx:play` (aus `core/playback.js`, stoppt den TV) und `lfx:tvmode-intent` (TV-Symbol feuert synchron im Klick; `features/tvmode/unlock.js` entsperrt das `<video>` in der Geste). Route-Kind `tv` in `shared/routes.js`; `features/themeroute.js` leitet unter store/`layout-tv` auf `#/home` um.
  - Fallen: Kopfabstand — Jellyfin rückt `<main>` bei flix/plus schon unter die Kopfleiste ein, bei prime nicht; `app.js` misst den fehlenden Abstand mit einem Messelement (wegen `calc()` in prime) und setzt `--lfx-tvm-pad`. Die plus-Kopfleiste nutzt `space-between` → `margin-left:auto` am TV-Symbol. Bild-in-Bild: das `<video>` wird in den Halter `#lfx-tvm-bg` umgehängt (Eigentümer: Engine, `pip.js`), die Hülle legt ihn nie an; ohne PiP stoppt das Verlassen sofort. Im Hintergrund-PiP setzt die Engine die `<html>`-Klasse `lfx-tvm-bgplay` (pausiert das Startseiten-Vorladen). Vorwärmen: `deps.zapWarm` ist ein Getter (`defineZapWarm`), `{ ...deps }` friert ihn ein → nach dem Spread erneut aufrufen. Am Handy nie automatisch zur aktuellen Senderzeile scrollen. Die Info-Karte zeigt das Kalenderdatum des Beginns, nicht den Sendetag.
  - Dev-Harness `build/tvmode-dev.html|js` (Fake-Katalog, kein Netzwerk): `?design=flix|plus|prime|retro&phone=1&now=<ISO>&channel=&state=loading|pause|closedown|error|gesture|tap|muted&thin=1&tab=now|epg&info=1&chrome=0&debug=1` (`loading` hält den Ladezustand, `thin=1` dünnt den Katalog aus für echte Sendepause, Normalablauf ohne `state`) (weitere im Kopfkommentar von `build/tvmode-dev.js`); Debug im Hauptbundle: `window.__lfxTvmDebug = true` → `window.__lfxTvm`. Live-Test: die Dev-Loader (`dev-boot.js`, `dev-inject.js`) verwerfen auch `window.LenzFlixTvMode`; Screenshot-Skript `.tmp/verify/tvm-shot.mjs` (gitignored).
- Statistik-Seite lokal: `node build/stats-dev.mjs` (127.0.0.1:5180), `/lenzflix-stats/dev-login.html?theme=flix|plus|prime|retro`; Produktiv-CSP (keine Inline-Skripte) beachten. Style-Regression: `build/style-snapshot.js` in der Konsole vor/nach der Änderung, dann `node build/style-diff.mjs alt.json neu.json`.

## Architektur & Verträge
- Maßgeblich: `docs/dom-map.md` (live verifizierte Jellyfin-DOM-Karte, Proxy-Klick für Wiedergabe, Selektoren) und `docs/js-contracts.md` (Kartenmarkup, öffentliche Feature-Funktionen, Regeln für Feature-Autoren). Vor Änderungen dort nachlesen.
- Keine React-Knoten mutieren; eigene Mount-Points (`#lfx-nav`, `#lfx-home`, `#lfx-newpopular`, `#lfx-hovercard`), native Elemente nur per CSS-Klasse (`html.lfx-nav-on`, `lfx-home-on`, …) verstecken.
- Wiedergabe immer über `core/playback.js` (Proxy-Klick), nicht über `playbackManager` (nicht global). Ausnahme: der TV-Modus spielt bewusst mit eigenem `<video>` ohne Fortschrittsmeldung (`src/js/tv/player/`, `src/js/tv/tvmode/`). `core/playback.js` feuert dafür synchron `lfx:play` (stoppt den TV-Modus vor dem Jellyfin-Player).
- Jedes Feature räumt in `unmount()` alles auf; `destroy()` entfernt alles. Keine Tokens/Credentials loggen, Bild-URLs ohne api_key.
- Nur `--lfx-*`-Tokens aus `tokens.css` nutzen.

## Scoping-Regeln
- Modern: `html:not(.layout-tv)` (Modern-Layout erkennt man an `header.MuiAppBar-root`; es gibt keine eigene Modern-Klasse von Jellyfin).
- TV: `html.layout-tv`, **ohne `:has` und ohne CSS-Nesting** (alte TV-Browser).
- JS-UI-Styles: nur unter `html.lfx-js`; pointerabhängige Effekte nur unter `(hover:hover) and (pointer:fine)`; nicht auf TV.
- `.skinHeader` existiert im Modern-Layout versteckt im DOM, Selektoren darauf immer scopen.

## Fallstricke (aus dom-map)
- Chromium 53 (LG webOS 4) nutzt variable Schriften mit `font-weight`-Bereich nur als 400: die Gewichte 600–800 der TV-Regeln werden künstlich gefettet. Bewusst so gelassen (kein zusätzlicher Schrift-Download).
- Kartentexte stehen in `.cardFooter` **oder** `.cardBox > .cardText`, beides abdecken.
- Desktop-Backdrop der Detailseite liegt im globalen `.backdropContainer`, nicht in `#itemBackdrop`.
- `#videoOsdPage` trägt `.libraryPage`: Bibliotheks-Regeln dürfen den Player nicht treffen.
- `.card:not(.show-animation)` hat `contain: layout style paint` (schneidet Hover-Scale ab); `.card` hat `background:none !important`.
- Custom CSS ist ein `<style>` ohne `@layer`: bei gleicher Spezifität gewinnt die spätere Regel.
- Handy-Breiten: `isMobile()` ist bei `layout-mobile` auch im iPhone-Querformat (bis 932 px) wahr. Handy-UI zusätzlich an `isNarrow()` (< 800 px) bzw. für die flix-Kopfleiste an `isNavCompact()` (< 900 px) binden, sonst erscheinen Handy- und Desktop-Kopf doppelt.
- Das Testkonto auf dem Entwicklungs-Server hat keine Transkodierung (für Player-Tests h264-Titel nehmen). Fremd-Elemente dort (Abyss Spotlight, `.featurediframe`) im Dev-Loop neutralisieren.
- Jellyfin 12.4 ignoriert `MinDateCreated` bei `/Items` (live geprüft) – nach `DateCreated` absteigend sortieren und clientseitig filtern.
- Version vor jedem Release in `package.json`, `VERSION` (`src/js/core/version.js`) und den jsDelivr-URLs der README angleichen; Release = Tag `vX.Y.Z` (jsDelivr pinnt darauf).

## Verbote
- `reference/` und `.tmp/` nie committen (stehen in `.gitignore`).
- Öffentliches Repo `lorenzhdr/LenzFlix` (Submodul `NetflixTheme` im Hauptrepo `Clausi_Projects`): nicht ungefragt committen/pushen/taggen. `charts-worker/wrangler.local.jsonc` (echte Domains, gitignored) nie committen.

## Aktueller Stand und offene Punkte
Stand 19.11.2026 (1.19.1 veröffentlicht). Bei jedem Release aktualisieren, knapp halten. Verträge stehen in `docs/store3d.md`, `docs/tvmode.md`, `docs/mp-api.md` und `docs/js-contracts.md`.
- **Version:** 1.19.0 veröffentlicht (Tag `v1.19.0` auf 214119c, `main` vorgespult; jsDelivr: 5/9 Dateien byte-gleich; `lenzflix|lenzprime|lenzretro|lenzstore.min.css` liefert jsDelivr unter `@v1.19.0` auch nach Purge als eigene clean-css-Fassung („Minified by jsDelivr“; semantisch verglichen: gleiche Regeln, dvh-/env-/:has-/!important-Zahlen gleich; einzige echte Abweichung: in `lenzretro.min.css` verliert ein `:-webkit-any(…)`-Rückfallselektor seine Leerzeichen, wirkt nur in Browsern ohne `:is()`, nie auf TV), unter `@214119c` das Original). Worker deployt (Version f99352d1, rein additiv: `GET /wx`, `GET /mp/online`, Fähigkeit `rich2`). Arbeitsdateien (gitignored): `.tmp/v119/` (LEITPLANKEN, STATUS, Befunde `audit/befunde.md`, Messungen `perf/`). Gerätetests 1.19.0 vom Nutzer erledigt (alle ok). Gerätetests 1.17/1.18 weiter offen: https://claude.ai/artifact/QsUrMptLU13nRStbkFei72.
- **1.19.1 veröffentlicht (Tag `v1.19.1` auf 5e91362, `main` vorgespult, jsDelivr 9/9 Dateien byte-gleich; Worker unverändert; Arbeitsdateien `.tmp/v1191/` LEITPLANKEN/STATUS/reports/shots):** nach erledigter Testliste 1.19.0. (1) Handy-Ultra: `ultraAllowed()` = `!isTv()`, `ultraCompact()` (coarse+min(screen)<600) → `presetFor('ultra', phone, compact)` mit 40 Cover-Atlanten (statt 80, ≈ 225 MB), hiMax 2, Ladekreis 26, Handy-Mengen; Tablet behält volles Ultra; `ctx.isCompact` an allen presetFor-Aufrufern. Absturzschutz `features/store/ultraguard.js` (Merker `ultraLive`/`ultraBlock`, `deps.onLevel` ← `StoreApp.reportLevel`): nach Absturz unter Ultra Automatik-Decke `autoMax: 'high'`, manuelles Ultra bleibt und hebt die Sperre auf. (2) Fadenkreuz auch am Touch-Gerät in allen Schemata (`StoreApp.crossOn()`), gelb nur Desktop/Schema `game`. (3) Fix: `#/home?lfx=classic` (Klassische Ansicht der VIDEOTHEK) blieb nach Designwechsel stehen → Startseiten der anderen Designs mounteten nicht (nur native Zeilen, kein Billboard); `features/themeroute.js` leitet außerhalb von store auf `#/home` um. Geprüft: 4892 Tests (460 Dateien), Lint 0, Hauptbundle 523.376 B, `lenzstore.min.js` 1.642.222 B, TV-Hashes gleich. Harness (iPhone-Emulation): Ultra-Zyklus, compact-Preset, Fadenkreuz in allen Schemata, Desktop unverändert, Draw-Calls low ≤ 90; Harness-Parameter `?ultraauto=0`. Offen: Gerätetests 1.19.1 https://claude.ai/artifact/3TqZWhJvP238PEfe471kqD (Ultra-fps/Absturz am echten iPhone, Fadenkreuz, Klassische Ansicht → Designwechsel live).
- **Inhalt 1.19.0 (Vertrag `docs/store3d.md` „Ultra-Stufe (1.19.0)“, „Niederschlag“, „Echtes Wetter in 3D“, `docs/mp-api.md` §17, `docs/js-contracts.md` „Web-App (1.19.0)“):**
  - Qualitätsstufe `ultra` (LEVELS/rank/atLeast in `engine/quality.js`): nur über `opts.ultraOk` der Hülle (`features/store/home.js` `ultraAllowed`: seit 1.19.1 nur kein TV; Handy über `ultraCompact` mit Handy-Ultra-Spalte, VR nie). Registry `engine/ultra.js` (lazy Bau im Leerlauf, Vorbau nur wenn Ultra erreichbar), Module `ultra-light|city|room|figures|wet`, Dev-Parameter `?ufx=`. AutoQuality mit Decke, zeitbasiertem Einschwingen und Halt während des Vorab-Zeichnens (`holdAuto`/`extendSettle`, höchstens 8 s nach einem Stufenwechsel).
  - Erstblick-Hänger: `engine/warm.js` `createWarmDraw` zeichnet die Basisszene vorab (Haupt- und Spiegel-Render-Target-Variante, nur ultraOk + high/ultra, Ladebild-Hold ≤ 4 s, Schlüssel-Memo); `covers/stripe.js` lädt 2048²-Cover in 8 Streifen hoch (nicht am Handy).
  - Niederschlag neu (`modules/precip.js`, `weather/precip-logic.js`, 1 Draw-Call auch auf low; Regen bewegte sich vorher nicht: `Float32BufferAttribute` kopiert das Array). Waffen detaillierter (`ui/hands.js`, `npc/figure-parts.js`).
  - Echtes Wetter: Worker `charts-worker/src/wx.js` (`GET /wx`, Ort nur als `WX_LAT`/`WX_LON` in der gitignorierten `wrangler.local.jsonc`, unkonfiguriert 404 → Zufallswetter; Cache Isolate → KV `wx:v1` 15 min; Antwort ohne Ort), Hülle `features/store/weather.js`, Vorrang Debug > echt > Mehrspieler > lokal (`weather/state.js`). Schnee fallend/liegend (nur `out.tinted`), Nebel, Gewitter, Winterkleidung, Atem, Thermometer. Wetterdienst-Name nur in README + Worker-Code.
  - Online-Pille im Design-Menü (`core/online.js`, `core/themepicker.js`; Worker `GET /mp/online`, Isolate-Cache 45 s, Abruf nur bei offenem Picker alle 30 s, zählt Konten).
  - iPhone-Web-App (`core/webapp.js`: `html.lfx-standalone`, Manifest-Override als Blob-URL nur bei `'standalone' in navigator`, Backoff 2/5/15/60 s; `features/sabback.js` Zurück-Knopf; dvh-Paare).
  - Audit W6 (53 bestätigte Befunde behoben, u. a. K.O.-Sitzen im Netz als Pose 7, `rich2` mit Trefferart), Performance W7 (Spiegel-/Upload-Gates, DOM-Schwelle, Raum-Matrizen), Aufräumen (`clamp` vereinheitlicht, `FAIL_TEXT` und Physik-Re-Exporte entfernt, tote Exporte).
  - Geprüft: 4864 (458 Dateien) Root-Tests, 521 Worker-Tests, Lint 0, Hauptbundle 522.122 B (Budget 520 KiB), `lenzstore.min.js` 1.641.244 B (Schwelle 1,70 MB), TV-Hashes gleich, Draw-Calls low ≤ 131. GPU (Laptop, Adreno X1-85, 90 Hz, Netzteil): Ultra in 10 Szenen im Mittel 89,3–90 fps, p99 ≤ 22 ms, längstes Bild ≤ 78 ms; Automatik 180 s am Gassenmund durchgehend Ultra; Hoch verschränkt gegen 1.18.1: Bilder > 50 ms 4 statt 15, längstes Bild 89 statt 556 ms (Messung `.tmp/v119/perf/schluss-run.log`).
  - Fallen: `gpu.mjs` misst erst 1,2 s nach dem Drehen (verdeckt Erstblick-Hänger) → `.tmp/v119/perf/gpu-ab.mjs`; Harness-Cover per `toDataURL` lasen die GPU zurück (jetzt `willReadFrequently`); Akku und 60 Hz verfälschen Messungen; `forceSinglePass` wirkt bei ShaderMaterial nicht; Render-Target-Spiegel brauchen eigene Programmvarianten; `compileAsync` allein verhindert Erstblick-Hänger nicht; `Page.captureScreenshot` per CDP kann bei verdecktem Fenster die Sitzung blockieren.
  - Offen: Geschmacksfragen (Ultra-Deckenlampen-Leuchtstreifen, Pfützenrand, Starkregen am Handy, Schnee unter Markisen, Schneeflecken, grüne Laubbäume bei Frost); Ideen in `.tmp/v119/audit/befunde.md` („Ideen“); Ultra am echten Tablet, iPhone-Manifest-Name, Zurück-Knopf vs. Wiedergabeleiste nur emuliert. Live im Claude-Tab geprüft (nur Funktion; am 19.11. abends auch das veröffentlichte Release vom Server): alter 1.18.1-Client gegen den neuen Worker fehlerfrei, alle fünf Designs laden 1.19.0 ohne Konsolenfehler, jsDelivr-CSS im Computed-Style-Vergleich aller Elemente gleich wie das Original (nur gleichwertige Schreibweisen; Messfalle: nach Stylesheet-Tausch zur Laufzeit behalten `<select>` eine veraltete Höhe), echtes Wetter samt Thermometer, Ultra-Zyklus, Waffen, „1 online“, Zurück-Knopf auf Titel- und Einstellungsseite und im Player aus; nicht live: iPhone-Breite (Fenster maximiert), Online-Pille mit zweitem Konto. Live-fps im Claude-Tab nicht aussagekräftig (Fenster gedrosselt, rAF 1/s → Automatik auf low, bei 1.18.1 ebenso); das Klettern bis Ultra ist nur im Harness belegt (Idee I41).
- **1.18.x / 1.17.0:** 1.18.1 (Tag `v1.18.1` auf 444b8ef): Laser auf Gesichtsmitte, halbe NPC-Treffer, Sprecher-Regie mit `gender`, Rowdys gleiten. 1.18.0 (8404090): Waffen, Energie/K.O., Passanten mit Temperament, Rowdy-Bande, Mehrspieler-Fähigkeit `fight` (Vertrag `docs/store3d.md` „NPCs und Raufen (1.18.0)“, `docs/mp-api.md` §16). 1.17.0 (4c5e13e): eigene Figur, Ausweis, Salon, Spiegel, Konto-Profil (`docs/store3d.md` „Figur, Ausweis, Salon (1.17.0)“, `docs/mp-api.md` §15). Fallen: `makeLook` eingefroren (Baseline-Test nie anpassen), Flag `f` klemmt 0..15, CustomPrefs immer GET→ändern→POST.
- **Vorher 1.16.2:** veröffentlicht (Tag `v1.16.2` auf 5c3e247, jsDelivr geprüft). Vorher v1.16.1 (dc60324).
- **Inhalt 1.16.2 (Tab je Design, Vertrag `docs/js-contracts.md` „Tab-Text, Tab-Icon und Browserleiste“):**
  - Den Tab-Text schreibt nur `core/doctitle.js`: „Seite · Design“, Seitennamen aus `shared/pagetitle.js`. Features lesen Jellyfins Titel über `jellyfinTitle()`, die Kino-Bridge über die Option `readTitle`.
  - `theme-color` gehört nur `core/themecolor.js`, `playerbg` setzt einen Override.
  - Tab-Icons `assets/logo/favicon-<id>.svg` sind als kompakte data-URI in `core/favicon.js` eingebettet. Home-Bildschirm-Icons `touch-<id>.png` sind Dateien, relativ zu `resolveThemeCssBase()`.
  - Budget des Hauptbundles auf 500 KiB angehoben; es liegt bei 508.914 B. Tests: 3801 in 368 Dateien.
  - Live geprüft: alle 5 Designs mit Startseite, Unterseiten, Titelseiten, LENZFLIX-Info-Fenster, Player (Leiste schwarz, danach zurück) und Einstellungen. Die Tab-Icons hat der Nutzer im normalen Tab angesehen; im Claude-Tab setzt die Erweiterung ein eigenes Icon.
  - Offen am Gerät: Home-Bildschirm-Icon und -Name am iPhone, Farbe der iPhone-Leiste. Android-Installation über Jellyfins `manifest.json` behält das Jellyfin-Icon. Titel des VIDEOTHEK-Kinos ohne Zusatz nur per Unit-Test belegt.
  - Worker mit dem Close-Fix bereits deployt (Version a6248d8d, Rauchtest ok).
  - Prüfung 1.16.1: 3759 Root-Tests (365 Dateien), 352 Worker-Tests, Lint 0, TV-Hashes gleich, Hauptbundle 499.367 B, `lenzstore.min.js` 1.291.157 B, w0–w4 PASS (w4 share 32/0, private 14/0).
- **Inhalt 1.16.1 (Befunde aus dem Live-Test mit zwei Konten, Liste in `.tmp/v116/devtest/befunde.md`):**
  - Kino: Schwarzbild-Rückfall nur, solange die Leinwand nie Bild gezeigt hat (Schwelle 10 s, `cinema/ambient.js`).
  - Mitschauen: Vorsprung von Mitschauenden per kurzem lokalem Anhalten (`sync.js` `startHold`, nicht beim Gastgeber); Pause eines > 3 s abweichenden Mitglieds nutzt die Gruppenposition.
  - Worker: `MpWorld.webSocketClose` antwortet mit `ws.close` (1000 statt 1006 nach 5 s).
  - Spielerliste: Film-Spalte (`filmTitle` in `modules/net.js`, Rechte-Filter; eigene Sitzung wird nicht angezeigt). Text „Name zeigen“ korrigiert.
  - Darstellung: Touch-Chatprotokoll unter dem Menü-Knopf, Overlays unterhalb der Leiste, Palast-Schilder innen lesbar, Hinweis „drehen“ beim Hinsetzen im Hochformat.
  - Live nachgeprüft: Beitritt < 0,5 s nach ca. 5 s, Schwarzblenden ohne Rückfall, 10 min gemeinsam ohne Abbruch (max. 0,09 s), Rechte-Filter (neutrale Hülle, kein Angebot, kein Titel), Admin-Kick (4403, 10 min).
- **Stand 1.16.0:**
  - charts-worker deployt (Mehrspieler-DO `MpWorld`, Migration `mp1`); `MP_SECRET` ist gesetzt.
  - Tests: 3737 Root-Tests (361 Dateien) und 351 Worker-Tests; Lint und Build grün.
  - Hauptbundle 499.367 B.
  - TV-Modus-Engine seit 1.14.0 byte-gleich; Basis-Hashes in `.tmp/v115/tv-base.sha256`.
  - `lenzstore.min.js` 1.289.420 B (Warnschwelle 1,35 MB, freigegeben).
- **Inhalt 1.16.0:**
  - **Spiel-Steuerung 2.0**
    - Touch-Schema `game` in `controls/gametouch.js`; `ui/gamepad.js` ist eine reine Ansicht.
    - Ruhe-Stick; Rollen-Slots mit Abgleich gegen `e.touches`.
    - Gate on/parked/off; Durchziehen; Zoom-Knopf.
    - Eigenes Hoch- und Querformat; Diagnosezeile.
    - Dazu der Kino-Fix: Wiederhinsetzen startet den Film nicht neu.
  - **Mehrspieler** (Vertrag `docs/mp-api.md`, Doku `docs/store3d.md` „Mehrspieler (1.16.0)“)
    - Worker in `charts-worker/src/mp/*`: Ticket, Route und das DO als dünne Hülle um den reinen Reducer `room.js` mit `chat`, `phys`, `rich` und `kino`.
    - Client in `store3d/net/*` mit dem Provider `net`; Hülle `features/store/mp.js`.
    - Figuren, Chat, Emote-Rad, Spielerliste, Stummschalten, Admin-Kick.
    - Synchrone Physik; Richard und Wetter gemeinsam; in VR sehen und Chat lesen.
  - **Gemeinsames Kino**
    - Kern in `cinema/sync.js` und `cinema/party.js`; Bridge mit `setPaused`, `seekTo` und `mode`.
    - Totband 300 ms. Die Ratenkorrektur setzt ab dem festen Totband ein, der Landefehler weitet nur das Sprungband.
  - **Live-Befunde (behoben)**
    - Cloudflare kappte Workers-WebSockets nach genau 5 s ohne Servernachricht. Deshalb pingt der Client jetzt alle 3 s (Memory `cloudflare-ws-idle-cut`).
    - Nach dem Spulen blieben 1,3 s Abstand stehen.
    - Die Sturmgrenze zählte auch stabile Verbindungen mit.
    - Ohne Verbindung bot die Platzwahl veraltete Angebote an.
  - **Abschluss-Review:** 4 bestätigte Befunde behoben.
    - Physik-Besitz höchstens 16 Einträge je Verbindung.
    - Host der Schilder und Blasen wird dynamisch ermittelt.
    - Toggle bei lokal gehaltenem Player.
    - Die Rate wird beim Sitzungsende zurückgesetzt.
  - **Geprüft:**
    - Harness headless: `gp2-measure` mit 4 Viewports, iPhone-Emulation, `w1`- bis `w4`-Skripte über den Dev-Relay.
    - Lokaler DO-Test.
    - Live mit zwei Desktop-Tabs desselben Kontos am echten Worker: Präsenz, Mitschauen, Pause, Spulen, Aufstehen, Verbindung länger als 3 min.
  - Arbeitsdateien (gitignored): `.tmp/v116/` mit Plan, Design, Wellen-Reports und `review-final.json`.
- **Ältere Stände (Details in Git und Verträgen):**
  - 1.15.0: LENZ LIVE entfernt; VIDEOTHEK als Open World mit LENZ PALAST (Vertrag „Open World (1.15.0)“).
  - 1.14.0: Gesamt-Audit, gut 400 Befunde behoben; Testliste vom Nutzer erledigt.
  - 1.13.x: LENZFLIX-Seiten Serien, Filme und Meine Liste; Datensparmodus auch retro; Geheimmenü; LENZ//84-TV-Modus.
  - 1.12.0: Datensparmodus.
  - 1.11.x: Vorwärmen und Vorladen, Startseiten-Cache, Fehlercodes und Rückfallkette im Player.
  - 1.10.x: TV-Modus, Ladebild, Player-Bildmitte.
  - 1.9.x: Röhren-Geräte und VR-Kino.
- **Offen:**
  - **Gerätetests 1.16.0 erledigt:** Steuerung und VR vom Nutzer am Gerät; Palast, Mehrspieler und Mitschauen von Claude live mit zwei Konten (iPhone-Punkte p4/m2 nur emuliert, echtes Puffern in Chrome nicht erzwingbar).
  - **Nur per Unit-Test/Harness belegt (1.16.1):** Gruppenposition bei Pause, Anhalten im Drift-Teil, Hochformat-Hinweis, Palast-Schilder, Lage des Chatprotokolls.
  - **Zurückgestellt (1.16.1):** Bei 844×390 überdeckt der einmalige Mehrspieler-Hinweis kurz die untere Knopfreihe des Pause-Menüs; Echtes Puffern (k5) live ungetestet; Safari-Leinwand am iPhone (p4) unbelegt, der Rückfall dort kommt jetzt nach 10 s statt 6 s; hängender Sprung (`seeking` dauerhaft) nicht reproduziert, bliebe ohne kb/Hinweis. Ideen: Angebotszeit „läuft bei“ friert im offenen Panel ein; Join-Ticket bleibt nach Sitzungsende; Programmtafel je Konto verschieden.
  - **Beobachten:**
    - Ob das Cloudflare-Idle-Kappen dauerhaft ist.
    - Free-Kontingent im Dashboard an Tag 1 und Tag 7. Der Ping alle 3 s kostet bis etwa 60 Requests pro Spielerstunde.
  - **Zurückgestellt (1.16.0):**
    - Rejoin ohne Flackern.
    - Ein schlafender Remote-Körper drückt den Spieler heraus.
    - Stummschalten, wenn der Absender schon weg ist.
    - Filmende serverseitig in `kino.js`.
    - `Bridge.mode()` liefert nie `'other'`.
    - Die `hi`-Frist greift erst bei der nächsten Nachricht oder beim nächsten Alarm.
    - Entzogene Admin-Rechte gelten bis etwa 25 min weiter (Cache).
    - Ein Neuladen über den Dev-Loader mitten im Film lässt den Jellyfin-Player stehen (nur Dev).
  - Zurückgestellt (1.15.0): `navBlocks` für Palast-Stufen (Saal im Nav-Raster gesperrt, nur für Pfade relevant); Draw-Calls bei `low` an der 140er-Grenze; kleine Doppelungen (mulberry32/FNV-Kopien) im 3D-Bundle; Richard: steht der Spieler direkt am Tresen, schiebt `driveDir` ihn live nach Norden statt um den Tresen zur Tür, der Rauswurf kommt dann über den Rückfall nach 12 s (Abblende) – Pfadpunkte nahe am Start überspringen.
  - Ideen (aus dem Audit 1.14.0): VIDEOTHEK Umsehen/Nehmen per Tastatur ohne Maus, Mittelregal-Stirnseite nur Holz, Hinweis am Reservierungsfach veraltet, VR-Knopf liest nie definiertes `--lfx-store-safe-bottom`; Design-Picker Pfeiltasten/Home/End; LENZFLIX „Z–A“ auch auf Meine Liste, Startseiten-Zeile „Meine Liste“ erst nach Neuaufruf aktuell; `core/download.js` schickt `ApiKey` in der Query; LENZ+ Hero reagiert nur beim Aufbau auf den Datensparmodus, Posterreihe ohne Scrollbar; LENZ//84 Altlast `tab=1`; Statistik-Seite Login-Fehlermeldung bleibt stehen.
  - Beobachten: kurzzeitige Server-503 beim ersten Boot (Startseite leer); HDR-Titel am iPhone (zurückgestellt); V-SUB; VR-Kino „erst beim zweiten Mal“ (nur aus Code hergeleitet). TV-Modus live ungetestet: Ton-/Untertitelwechsel, Gesehen-Regel, iPhone-PiP/Autostart, Dauerbetrieb.
  - Dev-Loader: `__lfxNoJs` lädt nur das Dev-CSS und lässt die laufende Live-Version unangetastet; für reine CSS-Tests vorher `window.LenzFlix.destroy()`. Tunnel-DNS braucht nach dem Start teils 10–30 s.
- **Weitermachen:**
  - Worktree-Arbeit: Worktrees manuell aus dem Feature-Branch anlegen (`git worktree add .tmp/wt/<name> -b <name> <branch>`, dort `npm ci`). Workflow-Worktrees (`isolation`) zweigen von main ab und nutzen eine `node_modules`-Junction – `git worktree remove` leert dann das `node_modules` des Hauptprojekts (`npm ci` stellt es wieder her). Kein `git stash` in Worktrees (repo-weit geteilt).
  - Headless-Prüfung: `.tmp/verify/lib.mjs`, QA-Skripte unter `.tmp/v115/qa/`, Harness-Parameter im Kopf von `build/store-dev.js`.
  - Mehrspieler prüfen: Prüfskripte `.tmp/verify/w0-iphone-emu.mjs`, `gp2-measure.mjs`, `w1-mp.mjs`, `w2-mp.mjs`, `w3-two.mjs`, `w4-kino.mjs` (Dev-Relay `build/mp-dev/relay.mjs` mit echtem Reducer), lokal das DO mit `w1-do-idle.mjs`/`w4-do-idle-all.mjs` (wrangler dev). Live im Claude-Tab: vor dem Klick in die Szene die Pointer-Lock-Attrappe aus `lib.mjs` einspritzen, Abbrüche per WebSocket-Hook analysieren (Close-Zeit gegen letzte Nachricht). `MP_SECRET` nie für Diagnosen drehen (ändert alle Pseudonyme).
