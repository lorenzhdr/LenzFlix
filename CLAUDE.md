# LenzFlix – CLAUDE.md

Inoffizielles Netflix-artiges Theme für Jellyfin-Web 12.4: CSS-Kern (wirkt allein) + optionales JS (Billboard, Zeilen, Hovercard, Modal, „Neu und beliebt“, Handy-Nav, Ambient) + optionales begehbares 3D-Design (VIDEOTHEK LENZ) + TV-Modus (IPTV-Seite in LENZFLIX/LENZ+/LENZPRIME). Ausgabe: `dist/lenzflix(.min).css|js`, `dist/lenzstore(.min).css|js`, `dist/lenzlive(.min).css|js`, `dist/lenztvmode(.min).css|js`. Keine fremden Marken-/Dienstnamen, -Logos oder -Assets im Code und in Texten (Repo ist öffentlich; Marken „LENZFLIX“, „LENZ+“, „LENZPRIME“, „LENZ//84“, „VIDEOTHEK LENZ“, „LENZ LIVE“); UI-Sprache Deutsch.

## Befehle
- `npm run build` (lightningcss → CSS, esbuild → IIFE-JS), `npm run dev` (Watch, unminifiziert), `npm test` (vitest + jsdom, `// @vitest-environment jsdom` pro Datei), `npm run lint`, `npm run serve` (Dev-Server :5179, bindet nur 127.0.0.1, liefert nur `dist/` und `assets/` plus explizit `/store-dev.html|js`, `/live-dev.html|js`, `/picker-dev.html|js`, `/tvmode-dev.html|js` und `/boot.js` aus `build/` sowie lesend `src/js/**/*.js` (Picker-Harness); Port per `PORT=`).
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
  - Eigener Player ohne Fortschrittsmeldung (keine Spuren in „Weiterschauen“). Server-Fallen: nie `StartTimeTicks` an die HLS-URL (bricht die Playlist), erst `<video>` leeren, dann `DELETE /Videos/ActiveEncodings` (sonst startet der Job neu), `ApiKey` statt `api_key`, im PlaybackInfo `SubtitleStreamIndex: -1` UND alle Untertitelformate als `External` im DeviceProfile (sonst brennt der Server Default-Untertitel ein = Video-Umwandlung); HEVC nur per Remux (fMP4-HLS), wenn der Browser HEVC kann.
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
  - Fallen: Kopfabstand — Jellyfin rückt `<main>` bei flix/plus schon unter die Kopfleiste ein, bei prime nicht; `app.js` misst den fehlenden Abstand mit einem Messelement (wegen `calc()` in prime) und setzt `--lfx-tvm-pad`. Die plus-Kopfleiste nutzt `space-between` → `margin-left:auto` am TV-Symbol. Bild-in-Bild: das `<video>` wird in den Halter `#lfx-tvm-bg` umgehängt (Eigentümer: Engine, `pip.js`), die Hülle legt ihn nie an; ohne PiP stoppt das Verlassen sofort. Am Handy nie automatisch zur aktuellen Senderzeile scrollen. Die Info-Karte zeigt das Kalenderdatum des Beginns, nicht den Sendetag.
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
Stand 12.11.2026 (1.11.1). Bei jedem Release aktualisieren, knapp halten. Verträge stehen in `docs/live.md`, `docs/store3d.md` und `docs/tvmode.md`.
- **Version:** v1.11.1 (Tag `v1.11.1`, jsDelivr), 2211 Tests, Lint und Build grün. Hauptbundle-Budget 440 KiB (`build/build.mjs`).
- **Inhalt 1.11.1 (iPhone-Rückmeldungen Runde 2, live geprüft 12.11.2026 in Chrome, Konto claude, Desktop + 390/932-px-iframe):**
  - **TV-Modus „Details“** öffnet in flix/plus/prime die Karte (`openModal(id, { overlay: true })`) über dem weiterlaufenden TV (Bild + Ton, kein Stopp/Neustart mehr); plus/prime mit Skin `src/css/themes/<id>/modal.css` und Link „Zur Titelseite“; ähnliche Titel bleiben in der Karte. Abspielen stoppt weiter per `lfx:play`.
  - **LIVE/TV-Player:** Rückfallkette beim Start (Direct → Remux per `noDirect` → fMP4→ts nur h264 → ein ts-Neuversuch), gescheitertes Direct pro Item gemerkt; Fehlercode mit Kette (`M3·D>T`). Lautstärke am iPhone ohne WebAudio (`gain.js` entfernt): Modus `mute-only`, Regler 0 = stumm, ab 5 = voller Ton.
  - **LENZ LIVE:** zweites „i“ blendet Info und Kanalnummer/Titel sofort aus; EPG am Handy-Hochformat verdichtet (crt80/silver 5, flat/plain 3 Zeilen).
  - **Info-Fenster am Handy (≤ 799 px):** Scroll-Sperre per `body{position:fixed;top:-y}`, Wiederherstellen vor dem Entfernen (gegen Startseiten-Blitz beim Wischen). LENZPRIME-Titelseite scrollt nicht mehr zur Folge.
  - **Sonstiges:** flix-Kopfleiste 8 px Abstand zum Logo (`header.css`, auch 900–1100 px `layout-mobile`), Trailer frühestens 3 s nach dem Titelbild, Safari-Rückfall (`play()` ohne Pufferfortschritt nach `TRAILER_STALL_MS`, abgelehntes `play()` gibt sofort auf), Videothek-Cover kippt vorne wie hinten gleich.
- **Inhalt 1.11.0 (iPhone-Rückmeldungen, live geprüft 12.11.2026 in Chrome mit Konto claude, Desktop + 390/844/932-px-iframe):**
  - **Ladebild beim Abspielen** in allen Designs (`core/startcover.js`, aus `core/playback.js` `play()`): Titelbild + Ladekreis bis der Player läuft bzw. das erste Bild bereit ist; Jellyfins `.docspinner` ist solange aus (`html.lfx-startcover-on`). flix-Info-Fenster: Ladebild vor `closeModal({after})`, die Startseite blitzt nicht mehr auf.
  - **Info-Fenster (flix)** öffnet immer oben (kein Auto-Scroll zur Folge, Folge bleibt markiert), am Handy „1. Titel“, Wegwischen stellt `scrollY` wieder her (`core/swipe.js` `holdBackdrop`).
  - **Startseite schneller:** Zeilen warten nicht mehr auf die „Neue Folgen“-Abfrage (Limit 200, sessionStorage), Top-10-Platzhalter werden nachgefüllt (Charts-Timeout 3 s), Billboard 2×12 statt 2×40 Titel und kleinere Bilder, `UserViews` einmal, `main.js`-Takt 3 s. Trailer lädt erst nach Bild + ersten Zeilen und erscheint frühestens nach 5 s, nur abspielbereit. Gemessen (PC, Navigation zur Startseite): erste Karte ~1,9–2,6 s → ~1,1 s, Titelbild ~2,4–4,1 s → ~1,8 s.
  - **TV-Modus/LIVE-Player** (gemeinsam, `live/player/*`): Ladekreis nur bei echtem Stillstand (> 1,2 s ohne Fortschritt, `stalled` ignoriert), ts-Rückfall für h264, wenn fMP4-HLS im Browser scheitert, Ton ac3/eac3 laut `canPlayType`, Fehlerkarten mit Kurzcode („Code: M3“ usw., Liste in `docs/live.md`), Umschalten schneller (Entprellung 250 ms, PlaybackInfo-Vorauflösung + Nachbarsender, `ctl.stats()`; live 1,4–2,9 s), Lautstärke am iPhone per WebAudio-Gain mit Selbstprüfung und Rückfall auf „nur Stumm“ (`player/gain.js`). TV-Modus: Doppeltipp-Vollbild nur mit echtem Element-Vollbild, Fehlerkarte verdeckt die Zapp-Einblendung nicht.
  - **LENZ LIVE:** Menü schließt bei Tippen daneben (folgender Klick wird verschluckt), Ladeanimation erst nach 400 ms, EPG am Handy einzeilig ohne Badges (Zeilenhöhe `--lfx-live-epg-row`).
  - **LENZFLIX Handy:** Player-Hintergrund schwarz (`features/playerbg.js`, `html.lfx-in-player`, `theme-color`), Querformat: < 900 px Handy-Menü (`isNavCompact()`), ab 900 px nur die große Leiste (engere Punkte bei `layout-mobile`); prime-Handy-UI hängt an `isNarrow()` (< 800 px).
  - **VIDEOTHEK:** Pause-Menü „Touch-Steuerung …“ (Joystick/Touch, Cover kippen/drehen umkehren, Umschauen umkehren, Empfindlichkeit), Standard unverändert (Prefs in `docs/store3d.md`).
- **Inhalt 1.10.1 (iPhone-Rückmeldungen):** Knöpfe in der Bildmitte des normalen Players (⟲10 · Play/Pause · ⟳30, `features/osdcenter.js`, Proxy-Klick, sichtbar mit der Leiste, alle Modern-Designs außer live). Player-Kopf am Handy einzeilig (Titel kürzt, die rechten Knöpfe wurden vorher in eine abgeschnittene zweite Zeile geschoben; `modern/player.css`). TV-Modus ohne eigenen Bild-in-Bild-Knopf unter dem Player (nur noch in der Leiste). Live geprüft in Chrome (Desktop-Klicks, 390-px-iframe); Touch am iPhone offen.
- **Inhalt 1.10.0:** TV-Modus für LENZFLIX/LENZ+/LENZPRIME (IPTV-Seite `#/home?lfx=tv`: 18 Sender und Plan von LENZ LIVE, Senderliste, Info, 7-Tage-EPG, Bild-in-Bild, Handy-Layout; Vertrag `docs/tvmode.md`, live getestet am 12.11.2026 mit Chrome Desktop und 390-px-iframe). Bugfix LENZFLIX: Das Info-Fenster (`features/modal.js`) schließt nach „Abspielen“ zuerst (`closeModal({after})`), dann folgt der Proxy-Klick. Die Server-deps sind aus `features/live/home.js` nach `features/live/deps.js` umgezogen; `dist/lenzlive.*` ist byte-gleich.
- **Inhalt 1.9.5:** bedienbare Geräte an den Röhren-TVs (`ui/knobs.js`, `player/sfx.js`, decor-Aktionen; siehe `docs/live.md` „Bedienbare Geräte (1.9.5)“), Videorekorder zeigt immer die Uhrzeit, Fernsehzeitung bei flat/plain angelehnt. Offen: echtes Touch und Klickgeräusch am Gerät testen.
- **Inhalt 1.9.4:**
  - VR-Kino:
    - „Lauter“ rechnet jetzt wie Jellyfin kubisch (Pegel = ∛`video.volume`).
    - Ein pausierter Start (Autoplay blockiert) zeigt „Weiter“ statt abzubrechen.
    - Der Watchdog wartet bei Fortschritt bis 60 s.
    - Fehlercodes P/T1/T2/D/B stehen auf der Leinwand und im Toast.
  - LENZ LIVE:
    - „Röhre 80er“ ist als Holz-Truhe im Wohnzimmer um 1982 neu gestaltet.
    - „Silber-Röhre“ ist als Silbergerät auf einem Glas-Rack um 2000 neu gestaltet.
    - Neues Raum-Dekor-System und Schalter „Röhren-Effekte“.
- **Offen:**
  - Am iPhone ungeprüft (1.11.1): M3-Rückfall/Code-Kette (bei Fehler Code notieren), Lautstärke 0/5 in LIVE und TV, Trailer am Handy, Wegwischen ohne Startseiten-Blitz, Karte über dem TV am Handy. LENZ LIVE „i“ zweimal nur per Test geprüft.
  - Test mit echter VR-Brille: „Lauter“ und Kino-Start beim ersten Versuch. Scheitert der Start, den angezeigten Code (z. B. „T2“) notieren. Bedeutung siehe `docs/store3d.md`.
  - Die Autoplay-Ursache für „erst beim zweiten Mal“ ist nur aus dem Code hergeleitet, mit Brille noch nicht bestätigt.
  - iPhone-Safari (aus 1.9.1): Pausenmusik bei Stummschalter, PDF-Download.
  - LENZ LIVE live ungetestet: Ton- und Untertitelwechsel, Gesehen-Regel.
  - TV-Modus (1.10.0) live geprüft (Chrome, Konto claude, nur Direktwiedergabe): Symbol und Seite in allen drei Designs (Desktop + 390-px-iframe), Autostart mit Ton, Zappen per Pfeil, keine Spuren, Details (Stopp/Resume), Von vorne, Bild-in-Bild inkl. Seitenwechsel und Stopp beim normalen Player, Info-Karte, LENZ LIVE weiter lauffähig. Live UNGETESTET: Remux/HLS-Pfad (`DELETE /Videos/ActiveEncodings`), Ton-/Untertitelwechsel, Gesehen-Regel, Vollbild, Lautstärke, Ziffern, Umschalten per Listen-/EPG-Klick, Laden über jsDelivr (bisher nur Tunnel), iPhone-Safari (Autostart mit Ton, Bild-in-Bild über `webkitSetPresentationMode`, Wischen, Querformat, Safe-Area), Touch an echten Geräten, Dauerbetrieb, Fußabstand über den Tabbars von LENZ+/LENZPRIME am Handy (evtl. doppelt). Am iPhone ungeprüft (1.11.0): Fehlercode bei „Kein Empfang“ ablesen (Ursache bisher unbekannt; Server liefert für alle Formate Video-Copy, Verdacht fMP4-HLS im Safari → ts-Rückfall), WebAudio-Lautstärke in LIVE/TV, Ladebild bei pausiertem Start, Wegwischen ohne Springen, weiße Leiste im Player, Querformat-Kopf, Videothek-Touch-Menü, Trailer-Zeitpunkt (Safari ignoriert preload evtl. → Bild bleibt bis 25 s), Knöpfe in der Bildmitte per Touch; LENZ+/LENZPRIME am iPhone. Zu entscheiden: ↓ schaltet wie bei LENZ LIVE auf den vorherigen Sender (1 → 18).
- **Weitermachen:**
  - Screenshots der TV-Stile mit Headless-Chrome über `.tmp/verify/lib.mjs`. Vorlagen sind `r-shot.mjs` (crt80), `s-shot.mjs` (silver) und `h.mjs`. Server `PORT=<frei> node build/serve.mjs`, Harness-Parameter siehe oben.
  - Kino im Harness mit `?cinema=paused|slow|fail`.
