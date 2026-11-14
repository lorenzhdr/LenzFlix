# LenzFlix – CLAUDE.md

Inoffizielles Netflix-artiges Theme für Jellyfin-Web 12.4: CSS-Kern (wirkt allein) + optionales JS (Billboard, Zeilen, Hovercard, Modal, „Neu und beliebt“, Handy-Nav, Ambient) + optionales begehbares 3D-Design (VIDEOTHEK LENZ) + TV-Modus (IPTV-Seite in LENZFLIX/LENZ+/LENZPRIME). Ausgabe: `dist/lenzflix(.min).css|js`, `dist/lenzstore(.min).css|js`, `dist/lenzlive(.min).css|js`, `dist/lenztvmode(.min).css|js`. Keine fremden Marken-/Dienstnamen, -Logos oder -Assets im Code und in Texten (Repo ist öffentlich; Marken „LENZFLIX“, „LENZ+“, „LENZPRIME“, „LENZ//84“, „VIDEOTHEK LENZ“, „LENZ LIVE“); UI-Sprache Deutsch.

## Befehle
- `npm run build` (lightningcss → CSS, esbuild → IIFE-JS), `npm run dev` (Watch, unminifiziert), `npm test` (vitest + jsdom, `// @vitest-environment jsdom` pro Datei; die volle Suite läuft unter Last teils in Timeouts (~15 zeitkritische Tests) → ggf. `npx vitest run --maxWorkers=3`), `npm run lint`, `npm run serve` (Dev-Server :5179, bindet nur 127.0.0.1, liefert nur `dist/` und `assets/` plus explizit `/store-dev.html|js`, `/live-dev.html|js`, `/picker-dev.html|js`, `/tvmode-dev.html|js` und `/boot.js` aus `build/` sowie lesend `src/js/**/*.js` (Picker-Harness); Port per `PORT=`).
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

## Designs (LENZFLIX `flix` Standard, LENZ+ `plus`, LENZPRIME `prime`, LENZ//84 `retro`, VIDEOTHEK LENZ `store`, LENZ LIVE `live`; retro/store/live Beta)
- Design-Kern `core/theme.js` (+ `themecss.js`, `themepicker.js`, `popover.js`), Features in `features/plus|prime|retro/`, CSS in `src/css/themes/<id>/` (eigene Bundles `dist/lenzplus|lenzprime|lenzretro(.min).css`, per JS nachgeladen). `core/` und `shared/` gehören allen Designs, Änderungen dort wirken auf alle: nie Verhalten von LENZFLIX brechen. Details und Regeln: `docs/js-contracts.md` („Designs“).
- Design-CSS nur unter `html.lfx-js.lfx-theme-<id>:not(.layout-tv)`; TV ist immer LENZFLIX. Design-Features matchen per `isTheme(id)`, Router ist zweiphasig (erst alle Unmounts, dann Mounts).
- LENZ//84 (`retro`, Beta; Menüeintrag „Design Einstellungen“ trägt `badge: 'Beta'`): Alle Schleifen/globalen Listener (CRT, Boot, Glitch, Sound, Cheat-Code, Terminal, Code-Regen) gehören `features/retro/fx/`, andere retro-Features melden nur per `emitFx` aus `features/retro/prefs.js`; fx ist im Player und auf dem Dashboard aus. Sound standardmäßig aus. Texte ohne fremde Marken („Kassette“, „Cheat-Code“, „Code-Regen“). Die Statistik-Seite führt die retro-Schriften/Logo als eigene Kopien in `charts-worker/public/lenzflix-stats/`.
- VIDEOTHEK LENZ (`store`, Beta, begehbare 3D-Videothek), Vertrag: `docs/store3d.md`:
  - Zwei Bundles: Hülle `features/store/` im Hauptbundle (importiert nie `three`, Build-Wächter in `build/build.mjs`); 3D `src/js/store3d/**` → lazy `dist/lenzstore.js` per `core/themejs.js`, importiert nur `three` + eigene Dateien, alles Zustandsbehaftete (Jellyfin, Theme, Router) per `deps` von der Hülle.
  - Erweiterungen als Module (`store3d/modules/`, Registry `modules/index.js`, ctx-API).
  - Lebenszyklus-Ausnahme: `unmount()` → suspend, nach 3 min dispose; Design-Wechsel/`destroy()` → dispose sofort.
  - Dev-Harness `build/store-dev.html` (über serve `/store-dev.html`); Debug: `window.__lfxStoreDebug = true` → `window.__lfxStore`.
  - Die Statistik-Seite kennt `store` (und `live`) nicht und zeigt den LENZFLIX-Look.
  - VR-Modus (Beta, WebXR): `store3d/xr/` + `store3d/cinema/` (Kino), Player-Bridge nur in der Hülle `features/store/cinema-bridge.js` (Jellyfin-DOM nie im 3D-Bundle); Vertrag in `docs/store3d.md` („VR-Modus“). Ohne XR-Session muss 2D bitgleich bleiben; keine Marken-/Gerätenamen von Brillen/Controllern (Texte: „VR-Brille“, „Controller“, „Hände“), kein UA-Sniffing.
  - Test ohne Brille: Harness `/store-dev.html?xremu=1&xrshot=1&cinema=1` (Fake-Player; `?cinema=series|fail|paused|slow`, `?subs=srt|ass|off`; Kino-Startfehler zeigen einen Code P/T1/T2/D/B, siehe `docs/store3d.md`), Emulator-Bundle `.tmp/xr-emu.js` selbst bauen (nicht committen, `serve` liefert 404 ohne). Emulator-Canvas liegt unter der Bühne: `xrshot=1` blendet sie in XR aus. Fahrskript (CDP, Headless-Chrome, gitignored): `node .tmp/vr/e2e/xr-e2e.mjs --list` bzw. `--only enter,take`. Pro Chrome-Start einen eigenen CDP-Port nehmen, weil derselbe Port mit demselben Profil direkt nacheinander hängt.
  - Falle: `CanvasTexture` nach Größenwechsel der Canvas nie weiterverwenden (three legt den Speicher fest an) → alte Textur `dispose()`, neue anlegen (`xr/panel.js`, `cinema/subtitles.js`).
- LENZ LIVE (`live`, Beta, lineares Fernsehen aus der Mediathek: 18 Sender, EPG, Videotext), Vertrag: `docs/live.md`:
  - Zwei Bundles: Hülle `features/live/` im Hauptbundle, Engine `src/js/live/**` → lazy `dist/lenzlive.js` per `core/themejs.js`; die Engine importiert nur Dateien aus `src/js/live/` (Zustandsbehaftetes per `deps`). Marker `__LFX_LIVE_ENGINE__` in `live/entry.js`, Build-Wächter in `build/build.mjs` (nie im Hauptbundle).
  - Eigener Player ohne Fortschrittsmeldung (keine Spuren in „Weiterschauen“). Server-Fallen: nie `StartTimeTicks` an die HLS-URL (bricht die Playlist), erst `<video>` leeren, dann `DELETE /Videos/ActiveEncodings` (sonst startet der Job neu), `ApiKey` statt `api_key`, im PlaybackInfo `SubtitleStreamIndex: -1` UND alle Untertitelformate als `External` im DeviceProfile (sonst brennt der Server Default-Untertitel ein = Video-Umwandlung), aber in der zweiten Anfrage zur Tonspurwahl `MediaSourceId` mit und `SubtitleStreamIndex` weglassen (mit `-1` + `MediaSourceId` brennt er erzwungene Untertitel ein, ohne `MediaSourceId` ignoriert er die Tonspur); HEVC nur per Remux (fMP4-HLS), wenn der Browser HEVC kann.
  - Admin-Senderbelegung (Plätze 5–16) per CSS-Variable `--lfx-live-channels` (Format `"5=Action;6=Komödie"`) oder `LenzFlixConfig.liveChannels`.
  - `core/theme.js` merkt beim Wechsel zu `live` das vorherige Design (`prevTheme`, `getPreviousTheme()`, nie `live`, Fallback `flix`); `leaveToLibrary` wechselt dauerhaft dorthin. `modal` und `newpopular` matchen unter `live` nicht, `guard.js` leitet Mediathek-Routen auf `#/home`.
  - Pausenmusik (`live/player/music.js`, im Browser erzeugt, `unlock()` synchron in der Nutzergeste, kein `Math.random`), Fernsehzeitung (`live/magazine/`, Taste Z) und PDF-Export (`live/pdf/`, eigener Schreiber): die Importgrenze der Engine gilt auch dort. `pdf/metrics.js` ist aus Core-14-AFM generiert, nie von Hand ändern. Cover im PDF nur bei CORS-freigegebenen Bildern (sonst Platzhalter). Vertrag: `docs/live.md` („Erweiterungen 1.9.1“).
  - Raum-Dekor der Röhren-Stile (1.9.4): `live/ui/decor.js` baut aus `decor-crt80.js`/`decor-silver.js` drei Ebenen (`.lfx-live-decor` im Raum, `.lfx-live-tv__deco` am Gerät, `.lfx-live-screen__glass` über dem Bild, unter dem Overlay), CSS in `decor-<stil>.css`. Pro Stil eigene Dateien, damit zwei Stile parallel bearbeitet werden können. Dekor ist reines DOM/CSS ohne Schrift oder Logos (außer „LENZ LIVE“) und wird im Handy-, Vollbild- und <760px-Layout per `!important` ausgeblendet. Effekte-Schalter `fx` (Menü „Röhren-Effekte“, Klasse `no-tubefx`). Vertrag: `docs/live.md` („Dekor und Röhren-Effekte“).
  - Planer (`src/js/live/schedule/`) muss deterministisch bleiben (gleicher Plan auf allen Clients): kein `Math.random`, keine Lokalzeit, kein `Intl`; Zeit nur über `schedule/time.js` (MEZ/MESZ arithmetisch), Zufall nur über `schedule/hash.js`.
  - Dev-Harness `build/live-dev.html` (über serve `/live-dev.html`, Fake-Katalog ohne Netzwerk): `?phone=1&admin=1&now=<ISO>&style=flat|crt80|silver|plain&channel=&autopower=1&overlay=epg|ttx|menu|guide&page=N&idle=pause|test|error&music=0&fx=0&remote=1&fullscreen=1&real=1&debug=1`; Debug im Hauptbundle: `window.__lfxLiveDebug = true` → `window.__lfxLive`.
  - Dev-Harness `build/picker-dev.html` (über serve `/picker-dev.html`, lädt den echten Design-Picker aus `src/js/`, Fake-API): `?charts=0` (ohne Charts), `?api=0` (ohne API), `?delay=1` (verzögerte Antworten), `?day=YYYY-MM-DD` (Systemdatum für die Tagesmischung, `core/dayseed.js`).
- TV-Modus (`lfx=tv`, flix/plus/prime, Seite `#/home?lfx=tv`, Einstieg TV-Symbol in der Kopfleiste), Vertrag: `docs/tvmode.md`:
  - Zwei Bundles: Hülle `features/tvmode/` im Hauptbundle (Server-deps geteilt mit LENZ LIVE in `features/live/deps.js`), Engine `src/js/live/tvmode/**` → lazy `dist/lenztvmode.js` per `core/themejs.js`, CSS lazy per `core/addoncss.js`. Marker `__LFX_TVMODE_ENGINE__`, Build-Wächter in `build/build.mjs`. Importgrenze: nur `src/js/live/**`, nie `ui/app.js`/`remote.js`/`decor*`/`knobs.js`, `music*`, `sfx.js`, `magazine/`, `pdf/`. Geteilte Dateien (`schedule/*`, `player/*`, `ui/logos.js`, `ui/overlay-util.js`, `ui/fullscreen.js`) wirken auf LIVE und TV-Modus. `dist/lenzlive.*` muss bei TV-Modus-Änderungen byte-gleich bleiben.
  - Präfix `lfx-tvm`; nie `.lfx-card`/`data-lfx-id` (Modal/Hovercard fangen sonst Klicks) und nie `lfx-live-*`. Kein CSS-Nesting, kein `:has`; nur Kern-`--lfx-*`-Tokens, Layout nur über `.is-phone`/`.is-landscape`.
  - Ereignisse: `lfx:play` (aus `core/playback.js`, stoppt den TV) und `lfx:tvmode-intent` (TV-Symbol feuert synchron im Klick; `features/tvmode/unlock.js` entsperrt das `<video>` in der Geste). Route-Kind `tv` in `shared/routes.js`; `features/themeroute.js` leitet unter retro/store/live/`layout-tv` auf `#/home` um.
  - Fallen: Kopfabstand — Jellyfin rückt `<main>` bei flix/plus schon unter die Kopfleiste ein, bei prime nicht; `app.js` misst den fehlenden Abstand mit einem Messelement (wegen `calc()` in prime) und setzt `--lfx-tvm-pad`. Die plus-Kopfleiste nutzt `space-between` → `margin-left:auto` am TV-Symbol. Bild-in-Bild: das `<video>` wird in den Halter `#lfx-tvm-bg` umgehängt (Eigentümer: Engine, `pip.js`), die Hülle legt ihn nie an; ohne PiP stoppt das Verlassen sofort. Im Hintergrund-PiP setzt die Engine die `<html>`-Klasse `lfx-tvm-bgplay` (pausiert das Startseiten-Vorladen). Vorwärmen: `deps.zapWarm` ist ein Getter (`defineZapWarm`), `{ ...deps }` friert ihn ein → nach dem Spread erneut aufrufen. Am Handy nie automatisch zur aktuellen Senderzeile scrollen. Die Info-Karte zeigt das Kalenderdatum des Beginns, nicht den Sendetag.
  - Dev-Harness `build/tvmode-dev.html|js` (Fake-Katalog, kein Netzwerk): `?design=flix|plus|prime&phone=1&now=<ISO>&channel=&state=playing|loading|pause|closedown|error|gesture|tap|muted&tab=now|epg&info=1&chrome=0&debug=1` (weitere im Kopfkommentar von `build/tvmode-dev.js`); Debug im Hauptbundle: `window.__lfxTvmDebug = true` → `window.__lfxTvm`. Live-Test: die Dev-Loader (`dev-boot.js`, `dev-inject.js`) verwerfen auch `window.LenzFlixTvMode`; Screenshot-Skript `.tmp/verify/tvm-shot.mjs` (gitignored).
- Statistik-Seite lokal: `node build/stats-dev.mjs` (127.0.0.1:5180), `/lenzflix-stats/dev-login.html?theme=flix|plus|prime|retro`; Produktiv-CSP (keine Inline-Skripte) beachten. Style-Regression: `build/style-snapshot.js` in der Konsole vor/nach der Änderung, dann `node build/style-diff.mjs alt.json neu.json`.

## Architektur & Verträge
- Maßgeblich: `docs/dom-map.md` (live verifizierte Jellyfin-DOM-Karte, Proxy-Klick für Wiedergabe, Selektoren) und `docs/js-contracts.md` (Kartenmarkup, öffentliche Feature-Funktionen, Regeln für Feature-Autoren). Vor Änderungen dort nachlesen.
- Keine React-Knoten mutieren; eigene Mount-Points (`#lfx-nav`, `#lfx-home`, `#lfx-newpopular`, `#lfx-hovercard`), native Elemente nur per CSS-Klasse (`html.lfx-nav-on`, `lfx-home-on`, …) verstecken.
- Wiedergabe immer über `core/playback.js` (Proxy-Klick), nicht über `playbackManager` (nicht global). Ausnahme: LENZ LIVE und der TV-Modus spielen bewusst mit eigenem `<video>` ohne Fortschrittsmeldung (`src/js/live/player/`, `src/js/live/tvmode/`). `core/playback.js` feuert dafür synchron `lfx:play` (stoppt den TV-Modus vor dem Jellyfin-Player).
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
- Handy-Breiten: `isMobile()` ist bei `layout-mobile` auch im iPhone-Querformat (bis 932 px) wahr. Handy-UI zusätzlich an `isNarrow()` (< 800 px) bzw. für die flix-Kopfleiste an `isNavCompact()` (< 900 px) binden, sonst erscheinen Handy- und Desktop-Kopf doppelt.
- Das Testkonto auf dem Entwicklungs-Server hat keine Transkodierung (für Player-Tests h264-Titel nehmen). Fremd-Elemente dort (Abyss Spotlight, `.featurediframe`) im Dev-Loop neutralisieren.
- Jellyfin 12.4 ignoriert `MinDateCreated` bei `/Items` (live geprüft) – nach `DateCreated` absteigend sortieren und clientseitig filtern.
- Version vor jedem Release in `package.json`, `VERSION` (`src/js/core/version.js`) und den jsDelivr-URLs der README angleichen; Release = Tag `vX.Y.Z` (jsDelivr pinnt darauf).

## Verbote
- `reference/` und `.tmp/` nie committen (stehen in `.gitignore`).
- Öffentliches Repo `lorenzhdr/LenzFlix` (Submodul `NetflixTheme` im Hauptrepo `Clausi_Projects`): nicht ungefragt committen/pushen/taggen. `charts-worker/wrangler.local.jsonc` (echte Domains, gitignored) nie committen.

## Aktueller Stand und offene Punkte
Stand 14.11.2026 (1.11.8, gebaut, noch nicht getaggt/veröffentlicht). Bei jedem Release aktualisieren, knapp halten. Verträge stehen in `docs/live.md`, `docs/store3d.md` und `docs/tvmode.md`.
- **Version:** v1.11.8 (Version in package.json/version.js/README gesetzt, Tag `v1.11.8` erst nach Freigabe), 2431 Tests (201 Dateien), Lint und Build grün. Hauptbundle 445.744 B von 450.560 B Budget (440 KiB), TV-Modus-Engine 127.622 B von 131.072 B (128 KiB; beides `build/build.mjs`), `lenzlive.min.js` 195.055 B (kein Budget).
- **Inhalt 1.11.8 (14.11.2026, nur Unit-Tests, live ungeprüft):**
  - **LENZ LIVE beendet beim Verlassen alles sofort** (Entscheidung B): Player `releaseWarm()` (`live/player/index.js`, Warm-Teil von `dispose()`, ohne `disposed`), Aufruf in `suspend()` (`live/ui/app.js`) = Seite verlassen, Design-Wechsel, Wechsel in den Jellyfin-Player (Route `#/video` unmountet die Hülle → suspend). `pagehide` → suspend mit `keepalive`-DELETE (`setKeepalive`, `core/api.js` `requestJson({keepalive})`), `pageshow` aus bfcache → `resume()`. **Ausschalten am Gerät bleibt ausgenommen** (Nutzerwunsch): vorgewärmte Nachbarn enden nach ≤ 40 s. TV-Modus unverändert (kein pagehide).
  - **flix-Kopfleiste:** „Mehr“ trägt `has-fold` (leichte Pille, Token `--lfx-pill-soft`), sobald Punkte eingeklappt sind; aktive Seite im Menü → weiterhin `is-active` (helle Pille, gewinnt).
  - **Info-Fenster** fordert Hero (Backdrop 1280) und Logo vor `loadItem` an (`modal.js` `preloadImages`, gleiche URL-Funktionen `heroImage`/`logoUrl` aus `modal/render.js`); live gemessen sparte das ~0,3–0,4 s.
  - **Senderbilder mit `tag`** (TV-Modus, LIVE, Fernsehzeitung): Hülle lädt Film-/Serien-Katalog mit `ImageTags`/`BackdropImageTags` (`features/live/data.js`, nur Thumb/Primary + erster Backdrop), `deps.imageUrl` hängt `tag` an (`features/live/deps.js` `taggedImageUrl`); ohne bekannten Tag URL wie bisher (nie `null`, sonst bricht der Typ-Fallback in `thumb.js`). Wirkt erst mit neuem Katalog-Cache (nächster Sendetag). Engines unverändert.
  - **Prüfbericht Cache/Vorladen** (Desktop „Prüfbericht Cache 1.11.7.pdf“, live 14.11.2026 am PC): Bilder mit `tag` → `public, max-age=31536000, immutable`, ohne `tag` nur `public` (jedes Mal 304-Rückfrage); Startseiten-Datencache und Zeilen-Vorladen funktionieren (alle Zeilen nach ~34 s, Rückkehr ohne Anfragen). Bewusst gelassen: Jellyfins versteckte eigene Startseite (6 Anfragen/Besuch), Ladebild-Größen ≠ Billboard außer flix/PC. Entscheidungen A (fMP4 dauerhaft merken) nein, C (HDR-Datei neu kodieren) ignoriert.
- **Inhalt 1.11.7 (Regression aus 1.11.6, live geprüft 13.11.2026):** Tonspurwahl in LIVE/TV-Modus: zweite PlaybackInfo-Anfrage wieder mit `MediaSourceId` (sonst ignoriert der Server `AudioStreamIndex`), dafür ohne `SubtitleStreamIndex` (mit `-1` brennt der Server erzwungene Standard-Untertitel ein = V-SUB). Live: Tonspur 1↔2 im echten Player, kein Einbrennen. Außerdem live belegt: Sitzungsbilanz TV-Modus (10/10 nach Verlassen sofort beendet) und LIVE (17/17; Ausschalten beendet die laufende sofort, vorgewärmte nach ≤ 40 s Ablaufzeit).
- **Inhalt 1.11.6 (13.11.2026; iPhone-Ergebnisse 1.11.5: Vorwärmen genutzt 1,6–2,3 s, sonst 6,3–9,5 s). Live in Chrome über Tunnel (Konto lorenz) gesehen: Info-Fenster-Pause, Vorwärmen TV/LIVE, Fehlerkarte mit Grund (simuliert), PiP-Klasse. Nur per Unit-Test: Pause bei PiP (Startseite kam live aus dem Cache), Hover-Regel im „Mehr“-Menü:**
  - **Vorladen der Startseite pausiert** (`features/rows/prefetch.js`, alle Designs): bei `document.hidden`, `lfx-modal-open` (Info-Fenster) oder `lfx-tvm-bgplay` + `#lfx-tvm-bg video` (TV im Hintergrund-PiP); laufende Zeile lädt fertig, Fortsetzung nach 2 s Ruhe an derselben Stelle. Die Klasse setzt die TV-Engine (`entry.js` `bgCls`). Vertrag: `docs/js-contracts.md`.
  - **Vorwärmen ist Standard** (TV-Modus und LENZ LIVE): `lfxwarm=0` schaltet aus, Netzregel (`saveData`, `cellular`, ≤ 3g). Gemeinsamer Vorwärmer `live/player/neighbors.js` (auch 2 s nach einer Fehlerkarte). Messung PC: TV 1,7–4,1 s (kalt 11,6 s), LIVE 1,4–1,9 s, alle genutzt.
  - **fMP4-Fehler pro Titel** statt globalem `tsOnly` (Set + `lfx-fmp4failed`, geräteweiter ts-Modus nur in der Sitzung); Ursache der langen iPhone-Zeiten war das globale `tsOnly` nach F>T (Sender 10, SDR, aac 5.1) und fehlendes Vorwärmen nach Fehlerkarte. Dauerhaft (7 Tage) gemerkt wird nur ein Fehler beim frisch aufgelösten Start; da mit Vorwärmen meist eine vorbereitete Sitzung übernommen wird, gilt der Merker dann nur bis zum Neuladen.
  - **Messanzeige:** Zeile 4 mit Grund je Umschalten (`kette`, `alt`, `verdrängt`, `fehler`, `err`, `pending`, `timeout`, `direct`, `max`, `phase`, `filler`, `keiner`), Zeile 3 mit Dateiinfos (`High L3.1 8 Bit 1280×720 HDR10`), FEHLER-Zeile ohne doppelte Kette.
  - **M3 bei ungeeignetem Bildformat** (h264 HDR/10 Bit/4:2:2 …, `stream.js` `videoFormatHint`): F-Fehler bricht ohne T ab, Fehlerkarte „<Grund> wird von diesem Gerät nicht unterstützt“. Befund: Sender 7 (h264 High L3.1, yuvj420p, HDR10) → iPhone M3 bei F und T (iPhones spielen HDR nur mit HEVC).
  - **V-SUB:** in 1.11.6 per Weglassen von `MediaSourceId` „behoben“, das brach die Tonspurwahl → richtig gelöst in 1.11.7 (siehe oben, Falle in `docs/live.md`).
  - **flix-Kopfleiste:** aktiver Eintrag im „Mehr“-Menü bleibt beim Drüberfahren markiert (`header.css`). Filme/Serien klappen am PC zwischen 900–1100 px nie ein.
  - Kleinkram: `lfxdebug=0`/`lfxhls=0` wertet die Hülle nur auf der TV- bzw. LIVE-Seite aus.
- **Inhalt 1.11.5:** Umschalten V1 fest (Weiche `lfxzap` entfernt), Vorwärmen als Test (`lfxwarm`), Startseite lädt untere Zeilen vor (`rows/prefetch.js`, erst wenn oben fertig, aus bei Netzsparen), flix-Kopfleiste klappt Punkte einzeln ins „Mehr“ (`nav.js` `fit`; unter 900 px immer Handy-Kopf).
- **Inhalt 1.11.4/1.11.3:** Startseiten-Cache 10 min (`core/cache.js`, `core/homecache.js`, leert sich auch bei Player-Wechsel per pushState); TV-Modus ohne Spalt unter der Kopfleiste, Tipp blendet aus, EPG-Titel rücken nach; Startposition vorab beim Umschalten; LENZ+-Chipleiste ohne vertikales Scrollen; VIDEOTHEK: Touch Standard, Umschauen „Normal“ = Kamera-Konvention, „Umgreifen“ (`touchRegrip`); Querformat-Wisch-Trick unverändert (Verdacht bei Ausfall: `SWIPE_COUNT_KEY`).
- **Inhalt 1.11.2/1.11.1:** Lautstärke 0 = immer stumm (`silent() = muted || vol === 0`, iOS-Volumen-Probe lügt); Messanzeige `lfxdebug=1`; Nachbar-Vorauflösung nach 1 s; Direct-Fehler M3/M4 7 Tage gemerkt. TV-Modus „Details“ öffnet die Karte als Overlay über dem laufenden TV; Rückfallkette Direct → Remux → ts mit Fehlercode samt Kette; Info-Fenster am Handy mit Scroll-Sperre per `body{position:fixed}`.
- **Inhalt 1.11.0/1.10.x:** Ladebild beim Abspielen in allen Designs (`core/startcover.js`), Info-Fenster öffnet oben, Startseite schneller (Billboard 2×12, Trailer erst nach Bild + ersten Zeilen), Player-Hintergrund am Handy schwarz, Knöpfe in der Bildmitte des Players (`features/osdcenter.js`), TV-Modus für flix/plus/prime (1.10.0), bedienbare Röhren-TV-Geräte (1.9.5), VR-Kino (1.9.4).
- **Offen:**
  - Release 1.11.8: Commit, Tag `v1.11.8`, Push nur nach ausdrücklicher Freigabe.
  - Testliste „Testen 1.11.8.pdf“: „Mehr“-Pille am PC, LIVE verlassen/Tab schließen → Sitzungen sofort weg, Ausschalten unverändert, Info-Fenster-Bild, Senderbilder ab neuem Sendetag. Testliste 1.11.7 erledigt (iPhone: Vorwärmen genutzt 2,9–4,1 s, erster Sender kalt 11 s; Info-/PiP-Pause, Tonspur ok; „Kein Empfang“ mit Grund nicht reproduziert). V-SUB (Babylon Berlin) und Querformat-Wisch-Trick werden beobachtet.
  - HDR-Titel (h264 HDR10) laufen am iPhone nicht (Sender 7); Neu-Kodieren (Punkt C) hat der Nutzer zurückgestellt („ignorieren“).
  - Test mit echter VR-Brille: „Lauter“ und Kino-Start beim ersten Versuch. Scheitert der Start, den angezeigten Code (z. B. „T2“) notieren (Bedeutung: `docs/store3d.md`). Die Autoplay-Ursache für „erst beim zweiten Mal“ ist nur aus dem Code hergeleitet.
  - iPhone-Safari (aus 1.9.1): Pausenmusik bei Stummschalter, PDF-Download.
  - LENZ LIVE live ungetestet: Ton- und Untertitelwechsel, Gesehen-Regel.
  - TV-Modus live ungetestet: Ton-/Untertitelwechsel, Gesehen-Regel, Vollbild, Ziffern, Umschalten per Listen-/EPG-Klick, Laden über jsDelivr, iPhone-Safari (Autostart mit Ton, PiP über `webkitSetPresentationMode`, Wischen, Querformat, Safe-Area), Dauerbetrieb, Fußabstand über den Tabbars von LENZ+/LENZPRIME am Handy. Am iPhone ungeprüft (1.11.0): Ladebild bei pausiertem Start, Wegwischen ohne Springen, weiße Leiste im Player, Querformat-Kopf, Videothek-Touch-Menü, Trailer-Zeitpunkt, Knöpfe in der Bildmitte per Touch. Zu entscheiden: ↓ schaltet wie bei LENZ LIVE auf den vorherigen Sender (1 → 18).
- **Weitermachen:**
  - Screenshots der TV-Stile mit Headless-Chrome über `.tmp/verify/lib.mjs`. Vorlagen sind `r-shot.mjs` (crt80), `s-shot.mjs` (silver) und `h.mjs`. Server `PORT=<frei> node build/serve.mjs`, Harness-Parameter siehe oben.
  - Kino im Harness mit `?cinema=paused|slow|fail`.
