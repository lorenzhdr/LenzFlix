# LenzFlix

Ein Theme im Stil von Netflix für das Jellyfin-Web-Frontend (Version 12.4): dunkles Design mit roter Akzentfarbe, Modern-Layout für Desktop und Mobil sowie ein Legacy-TV-Layout.

- Der **CSS-Kern** funktioniert allein und braucht kein JavaScript.
- Das **optionale JavaScript** ergänzt: Billboard (Hero), Netflix-artige Zeilen inklusive Top 10 und Badges, Hover-Popup, Detail-Modal, „Neu und beliebt“, Handy-Navigation im App-Stil und eine Ambient-Farbe aus dem Billboard-Bild.

> **Haftungsausschluss:** LenzFlix ist ein inoffizielles Fan-Theme. Es hat keine Verbindung zu Netflix oder zum Jellyfin-Projekt und enthält keine Netflix-Marken, -Logos oder -Assets. „Netflix“ wird nur beschreibend für den Look verwendet. Logo und Name „LENZFLIX“ sind eigene Gestaltung.

## Kompatibilität

- Jellyfin Server und Web **12.4**, getestet im Browser. Android-App und TV-Webclients, die das Web-Frontend laden, sollten funktionieren (zu prüfen: nicht auf jedem Gerät getestet).
- Native Apps (Android TV, Swiftfin, Findroid, Streamyfin) ignorieren Custom CSS/JS und zeigen weiter ihr eigenes Design.

## Installation

### 1. CSS

Dashboard → **Branding** → *Benutzerdefiniertes CSS* (seit Jellyfin 10.11 eigener Menüpunkt „Branding“):

```css
@import url("https://cdn.jsdelivr.net/gh/lorenzhdr/LenzFlix@v1.11.8/dist/lenzflix.min.css");
```

- `v1.0.0` ist ein Platzhalter. Auf den **aktuellen Release-Tag pinnen**. `@latest` wird bei jsDelivr lange gecacht.
- Vorher altes Theme-CSS (andere Themes, `@import`s) entfernen.

### 2. JavaScript (optional)

1. Plugin **JavaScript Injector** (n00bcodr) installieren. Die Repository-URL für den Plugin-Katalog steht in der Plugin-README (siehe Plugin-README).
2. Im Plugin einen Skript-Eintrag anlegen:
   - mit externer URL `https://cdn.jsdelivr.net/gh/lorenzhdr/LenzFlix@v1.11.8/dist/lenzflix.min.js` (externe URLs muss der Admin im Plugin erlauben), **oder**
   - den Inhalt von `dist/lenzflix.min.js` direkt einfügen.
3. Empfohlene Benutzer-Einstellungen: Anzeige → Detailbanner an. Die Startseite-Abschnitte sind bei aktivem JS egal, LenzFlix rendert eigene Zeilen. Andere Home-Slider/Media-Bars sollten entfernt werden (LenzFlix blendet bekannte iframes `.featurediframe` aus).

### 3. Reverse-Proxy mit CSP

Falls ein Reverse-Proxy eine Content-Security-Policy setzt, muss `cdn.jsdelivr.net` erlaubt sein (Stylesheet, Skript und die Schrift-Dateien). Die zusätzlichen Design-Dateien (`lenzplus.min.css`, `lenzprime.min.css`, `lenzretro.min.css`, `lenzstore.min.css`, `lenzstore.min.js`, `lenzlive.min.css`, `lenzlive.min.js`, `lenztvmode.min.css`, `lenztvmode.min.js`) und deren Schriften liegen am selben Ort wie `lenzflix.min.css`, es ist keine weitere Freigabe nötig.

## Designs

Mit aktivem JavaScript gibt es sechs Designs:

- **LENZFLIX** (Standard): das klassische Design mit roten Akzenten.
- **LENZ+**: dunkles Navy, Hero-Karussell mit Seitenvorschau, Poster-Zeilen, Bibliotheks-Hubs.
- **LENZPRIME**: Blauschwarz, Vollbild-Hero mit Trailer, Badges, Glas-Kopfzeile.
- **LENZ//84** (Beta): Cyber-Retro mit Bernstein-Terminal, Kassetten-Regal und Neon-Gitter samt Sonne im Hero, dazu CRT-Effekte und ein paar versteckte Überraschungen. Sound ist standardmäßig aus und lässt sich in der Kopfzeile einschalten. Tipp: Ein Terminal öffnet sich mit der Taste `^` (am Handy: Logo lange drücken), und mit dem richtigen Cheat-Code passiert etwas Besonderes.
- **VIDEOTHEK LENZ** (Beta): begehbare 3D-Videothek. Ton ist standardmäßig an (im Esc-Menü abschaltbar), Kassierer Richard spricht mit der deutschen Gerätestimme. Lädt ~0,7 MB zusätzlich nur bei Auswahl und braucht WebGL.
- **LENZ LIVE** (Beta): lineares Fernsehen aus der eigenen Mediathek. 18 Sender mit einem Programm, das für alle gleich ist, dazu Programmführer (EPG) und Videotext. Es gibt keine Pause, nur Umschalten und Ausschalten. Der eigene Player meldet keinen Fortschritt, daher hinterlässt LENZ LIVE keine Spuren in „Weiterschauen“. Gespielt wird nur per Direktwiedergabe bzw. Umpacken, nie mit Video-Transkodierung (Titel, die der Browser so nicht abspielt, sind „nicht empfangbar“). Firefox ohne native HLS-Wiedergabe zeigt ein Störbild.
  - **Pausenmusik:** Bei Pausenbild, Sendeschluss/Testbild und Störbild „Kein Empfang“ läuft Hintergrundmusik, die im Browser erzeugt wird (Klang je TV-Stil, folgt Lautstärke und Stumm). Im Menü unter „Pausenmusik“ an- und abschaltbar.
  - **EPG:** durchgehend über 7 Tage scrollbar (Wischen, Ziehen, Mausrad über der Zeitleiste, ◀ ▶ und „Jetzt“); der Text langer Sendungen läuft am linken Rand mit.
  - **Fernsehzeitung „LIVE Programm“:** liegt neben dem Fernseher bzw. der Fernbedienung (Taste „Heft“ oder `Z`), blättert in 3D und passt sich dem TV-Stil an. 30 Seiten mit Tipps samt Inhaltsangaben sowie Abend- und Tagesprogramm. Als A4-PDF herunterladbar (im Heft oder im Menü „Fernsehzeitung als PDF“). Titelbilder erscheinen im PDF nur, wenn der Server Bilder per CORS freigibt, sonst stehen Platzhalter.
  - **Röhren-Stile (1.9.4):** „Röhre 80er“ als Holz-Truhe im Wohnzimmer um 1982 (Zimmerantenne, Videorekorder, Stehlampe) und „Silber-Röhre“ als Silbergerät auf einem Glas-Rack um 2000 (DVD-Player, Receiver, Lautsprecher). Wölbung, Zeilen, Flimmern und Rollbalken lassen sich im Menü unter „Röhren-Effekte“ abschalten. Auf Handy, im Vollbild und in schmalen Fenstern bleibt die Deko ausgeblendet.
  - **Bedienbare Geräte (1.9.5):** Bei der Röhre 80er schalten Netzschalter und Programmtasten 1–8 am Gerät, die Drehknöpfe (Sender, Lautstärke) lassen sich ziehen, anklicken oder per Mausrad drehen, und der Videorekorder zeigt immer die Uhrzeit. Die Silber-Röhre hat Gerätetasten P+/P−/V+/V−/EPG und einen Netzschalter. Gerätetasten klicken hörbar und schalten aus dem Standby ein (außer V±).

Die Auswahl öffnet sich über **Mehr → Design Einstellungen** (bei LENZ+/LENZPRIME/LENZ//84 über das Profilmenü bzw. „Mehr“; LENZ//84, VIDEOTHEK LENZ und LENZ LIVE tragen das Badge „Beta“). Die Vorschau von VIDEOTHEK LENZ zeigt eine Regalwand mit echten Covern der Top-Titel (LENZFLIX-Charts, täglich neu gemischt; ohne Charts die neuesten Titel). Die Wahl wird pro Jellyfin-Benutzer gespeichert (im Browser und in den eigenen Anzeige-Einstellungen auf dem Server) und gilt auf allen Geräten. Auf TV-Clients ist immer LENZFLIX aktiv. Nicht erreichbar oder verirrt? Notausgang: `#/home?lfxtheme=flix` an die Jellyfin-Adresse anhängen.

Das Design-CSS lädt LenzFlix automatisch nach, aus demselben Pfad wie das eingebundene `lenzflix.min.css` (gleiche jsDelivr-Version). Nur falls es woanders liegt, den Ordner (mit `/` am Ende) setzen: `window.LenzFlixConfig = { themeCssBase: "https://example.com/lenzflix/dist/" }`. Eigene Token-Overrides nach dem `@import` (siehe „Anpassen“) gelten nur für LENZFLIX.

**Wichtig bei Updates:** CSS-`@import` und JS-URL immer auf **denselben** Release-Tag setzen. Das Design-CSS wird aus dem Pfad des eingebundenen CSS abgeleitet. Steht das CSS noch auf einer älteren Version (ohne `lenzplus`/`lenzprime`/`lenzretro`), schlägt das Nachladen fehl. Dann fällt LenzFlix auf LENZFLIX zurück, und der Design-Dialog ist ungestylt.

### TV-Modus (LENZFLIX, LENZ+, LENZPRIME)

Ein modernes Fernsehprogramm als eigene Seite: Das TV-Symbol in der Kopfleiste (neben der Suche, am Desktop und am Handy) öffnet `#/home?lfx=tv`. Dort laufen dieselben 18 Sender mit demselben Programm wie in LENZ LIVE, aber ohne Fernseher-Optik.

- **Desktop:** Player links, Senderliste mit Vorschaubildern rechts, darunter Infos zur Sendung mit „Von vorne“, „Details“ und „Bild-in-Bild“ und ein Programmraster über 7 Tage mit „Jetzt“-Knopf. Ein Klick auf eine künftige Sendung zeigt eine Info-Karte.
- **Handy:** Player oben, darunter die Tabs „Jetzt im TV“ und „Programm“. Wischen im Bild schaltet um, im Querformat füllt das Bild den Schirm.
- **Bedienung:** Pfeiltasten ↑/↓ oder Ziffern wechseln den Sender, `M` schaltet stumm, `F` Vollbild. Ton- und Untertitelspur sowie Lautstärke wählt man in der Leiste unter dem Bild.
- **Keine Spuren:** Wie bei LENZ LIVE meldet der Player keinen Fortschritt, Umschalten taucht nicht in „Weiterschauen“ auf. Beim Verlassen der Seite stoppt der Stream, außer Bild-in-Bild ist aktiv.
- Die Optik folgt dem gewählten Design. Auf TV-Clients und in LENZ//84, VIDEOTHEK LENZ und LENZ LIVE gibt es den TV-Modus nicht.

### LENZ LIVE (Beta): Voraussetzungen und Senderbelegung

- **Konten:** Benutzer brauchen im Jellyfin-Dashboard die Rechte „Audio-Transkodierung“ und „Remux“ (Umpacken). Fehlt eines, ist der Ton bzw. Stream nicht empfangbar.
- **Mediathek-Seiten:** Solange LENZ LIVE aktiv ist, leitet das Theme Bibliotheksseiten auf die Startseite um. Über das Menü der Fernbedienung geht es zurück in das vorherige Design.
- **Senderbelegung (Admin):** Die Plätze 5 bis 16 sind automatisch mit Genres belegt. Im Menü von LENZ LIVE (Administratoren) gibt es eine Kopierzeile mit der gewünschten Belegung. Diese Zeile unter Dashboard → **Branding** → *Benutzerdefiniertes CSS* **unterhalb** der `@import`-Zeile einfügen (nie davor, sonst lädt das Theme nicht) und speichern. Die Belegung gilt nach dem Neuladen für alle Nutzer. Format:

```css
@import url("https://cdn.jsdelivr.net/gh/lorenzhdr/LenzFlix@v1.11.8/dist/lenzflix.min.css");
:root { --lfx-live-channels: "5=Action;6=Komödie"; }
```

  Pro Eintrag `Platz=Genre` (Genre wie in Jellyfin geschrieben), getrennt durch `;`. Alternativ per JS: `window.LenzFlixConfig = { liveChannels: { 5: "Action", 6: "Komödie" } }` (hat Vorrang).

### VR-Modus (Beta, VIDEOTHEK LENZ)

Die Videothek lässt sich mit einer VR-Brille begehen, samt Kinosaal für die Wiedergabe.

- **Voraussetzung:** VR-Brille mit WebXR-fähigem Browser, Jellyfin über HTTPS erreichbar. Ohne unterstützte Brille erscheint kein VR-Knopf, am Desktop und Handy ändert sich nichts.
- **Starten:** In der Videothek auf „In VR betreten“ tippen bzw. klicken, oder im Pause-Menü „VR-Modus“ wählen.
- **Bedienung:**
  - Linker Stick: gehen (in Blickrichtung), Stick-Klick: rennen. Rechter Stick: drehen (Ruck-Drehung oder weich, einstellbar).
  - Trigger: mit dem Laser auswählen, Hüllen nehmen, Panels bedienen. Grip nahe einer Hülle: greifen.
  - B/Y: VR-Menü bzw. oberste Ebene schließen. Mit Händen: Pinch zum Auswählen, Handfläche zum Gesicht für das Menü.
  - Das VR-Menü bietet Ton, Drehen, Vignette, Größe (automatisch/sitzend), Neu ausrichten, Qualität (mittel/niedrig) und die Kassen-PC-Suche.
- **Kino:** Ein Film läuft im Kinosaal auf einer großen Leinwand. Das Kino-Bedienpanel (Pause, Spulen, Lautstärke, Tonspur, Untertitel, Platz vorn/Mitte/hinten, nächste Folge) erscheint per Trigger ins Leere. Einstellungen, Design-Wechsel und Abmelden gibt es nur außerhalb von VR.
- **Hinweis:** Beta, bisher nur im Emulator geprüft. Rückmeldungen (Brille, Browser, Ruckler, Fehler) sind willkommen.

## Echte Charts (optional)

Ohne weitere Einrichtung zeigt LenzFlix keine echten Charts: „Top 10: Neu auf LENZFLIX“ auf der Startseite sind die zuletzt hinzugefügten Titel, in „Neu und beliebt“ erscheinen „Neueste Serien“ / „Neueste Filme“, und „Am häufigsten geschaut“ nutzt deine eigene Wiedergabezahl (sonst die Community-Bewertung).

Für serverweite Charts („Top 10 Serien/Filme auf LENZFLIX“, meistgesehen der letzten 30 Tage) gibt es einen optionalen Cloudflare Worker, der die Daten aus dem Jellyfin-Plugin Playback Reporting aggregiert. Einrichtung: siehe [`charts-worker/README.md`](charts-worker/README.md); das Datenformat steht in [`docs/charts-api.md`](docs/charts-api.md). Danach die Worker-URL im Custom-CSS eintragen:

```css
:root { --lfx-charts-url: "https://charts.example.com"; }
```

Alternativ per JS: `window.LenzFlixConfig = { chartsUrl: "https://charts.example.com" }` (hat Vorrang). Nur `https://`-URLs werden akzeptiert. Der Browser sendet dein Jellyfin-Token an den Worker (Header `X-Emby-Token`) und der Worker braucht die passende CORS-Freigabe; ist der Worker nicht erreichbar, greift automatisch der Fallback oben. Bei weniger als 3 (Neu und beliebt) bzw. 5 (Startseite) auflösbaren Chart-Titeln wird ebenfalls der Fallback verwendet.

## Meine Statistik (optional)

Ohne Konfiguration zeigt LenzFlix keinen Statistik-Link. Läuft unter deiner Domain eine eigenständige Statistik-Seite (z. B. `/lenzflix-stats/`), erscheint „Meine Statistik“ im „Mehr“-Menü der Navigation und im „Mehr“-Overlay am Handy. Die URL im Custom-CSS eintragen:

```css
:root { --lfx-stats-url: "/lenzflix-stats/"; }
```

Alternativ per JS: `window.LenzFlixConfig = { statsUrl: "/lenzflix-stats/" }` (hat Vorrang). Erlaubt sind `https://`-URLs und Pfade mit einem einzelnen führenden `/` auf derselben Domain. Der Link öffnet die Seite im selben Tab und übergibt das gewählte Design per `?theme=`; für die Layouts von LENZ+, LENZPRIME und LENZ//84 muss der `charts-worker` neu deployt werden (die Seite liegt in dessen `public/`). Die Seite selbst braucht einen Worker plus Reverse-Proxy und gehört nicht zum Theme: Einrichtung und Datenformat siehe [`docs/stats-api.md`](docs/stats-api.md).

## Bedienung

- **Billboard:** rotiert alle 10 s. Trailer werden nur bei lokalen Trailern abgespielt.
- **Top 10:** die 10 neuesten Filme/Serien der Bibliothek (nicht nach Beliebtheit).
- **Badges** „Neu hinzugefügt“ / „Neue Folgen“: Zeitraum 14 Tage.
- **Meine Liste:** entspricht den Jellyfin-Favoriten. Aktiv wird der Button wie der rote Daumen hervorgehoben, aber mit grünem Haken.
- **Hover-Popup:** nur mit Maus (Hover-fähige Geräte, kein TV, nicht mobil).
- **Klick auf eine Karte** öffnet das Detail-Modal. **Strg/Shift/Meta-Klick oder Mittelklick** öffnet die native Detailseite.
- **Mehr-Menü (⋮):** in Hover-Popup, Detail-Modal, Episodenzeilen, Billboard und „Neu und beliebt“ sowie per Rechtsklick bzw. langem Drücken auf Karten und Episodenzeilen. Es öffnet das native Jellyfin-Titelmenü (inkl. Rechteprüfung) im LenzFlix-Stil, am Handy als Bottom-Sheet, das sich per Wischen nach unten schließen lässt (ebenso die Download-Auswahl und das Detail-Modal).
- **Download-Button:** neben dem Daumen, nur mit Download-Recht. Bei Serien erst Auswahl „Ganze Serie / Staffel“, dann Rückfrage. Auf Touch-Geräten (Handy/Tablet) ist „Ganze Serie“ ausgegraut („Funktioniert nur am Desktop“), weil Safari jede Datei einzeln bestätigen lässt; einzelne Staffeln bleiben wählbar.
- **Detail-Modal:** bei Episoden-Karten scrollt es nach dem Öffnen sanft zur Folge.
- **Daumen (Gefällt mir):** aktiv gefüllt in Rot.
- **Gesehen-Button (Detail-Modal):** eckiger Button mit Auge, aktiv = weiß. Im Kopf bei Filmen und Folgen direkt, bei Serien für die ganze Serie (mit Rückfrage). In jeder Folgenzeile für die einzelne Folge und im Folgen-Kopf als ein Block mit der Staffel-Auswahl (links daneben, gemeinsame Kontur) für die ganze Staffel (mit Rückfrage). Auch im Hover-Popup unten rechts im Bild. Die Startseite zeigt die Änderung nach dem nächsten Laden.
- **Neu und beliebt:** eigene Ansicht unter `#/home?lfx=new`.
- Handy (< 800 px): Logo, Filter-Pills und Mehr-Overlay im App-Stil.

## Anpassen

Alle wichtigen Werte sind CSS-Variablen (`src/css/tokens.css`). Überschreiben im Custom-CSS **nach** dem `@import`:

| Token | Bedeutung | Standard |
| --- | --- | --- |
| `--lfx-red` | Akzentfarbe (Hover `--lfx-red-hover`, aktiv `--lfx-red-active`) | `#e50914` |
| `--lfx-bg` | Seitenhintergrund | `#141414` |
| `--lfx-surface` | Karten-/Flächenfarbe | `#181818` |
| `--lfx-gutter` | Seitenrand links/rechts (breitenabhängig) | `36px` |
| `--lfx-cards-visible` | volle Karten pro Zeile (2–6 je Breite) | `4` |
| `--lfx-card-radius` | Kartenradius | `8px` |
| `--lfx-billboard-radius` | Billboard-Radius | `18px` |
| `--lfx-row-gap` | Abstand zwischen Zeilen | `40px` |
| `--lfx-hover-delay` | Verzögerung des Hover-Popups | `500ms` |

```css
@import url("https://cdn.jsdelivr.net/gh/lorenzhdr/LenzFlix@v1.11.8/dist/lenzflix.min.css");
:root {
  --lfx-red: #1db954;
  --lfx-card-radius: 4px;
  --lfx-hover-delay: 300ms;
}
```

Hinweis: `--lfx-cards-visible` und `--lfx-gutter` werden in Media-Queries pro Breite gesetzt. Ein Override im Custom-CSS gilt dadurch für alle Breiten, sofern nicht selbst per Media-Query eingeschränkt.

## Entwicklung

```bash
npm install
npm run build   # dist/lenzflix(.min).css und dist/lenzflix(.min).js
npm run dev     # Watch-Modus (nicht minifiziert)
npm test        # vitest + jsdom
npm run lint    # eslint
npm run serve   # Dev-Server http://localhost:5179/dist/ (liefert dist/ und assets/ mit CORS)
```

**Dev-Loop:** `npm run dev` und `npm run serve` laufen lassen. Den Inhalt von `build/dev-inject.js` in die Konsole eines eingeloggten Jellyfin-Tabs einfügen. Das Skript entfernt bekannte Fremd-Spotlight-Elemente, lädt CSS und JS frisch vom Dev-Server und ruft vorher `window.LenzFlix.destroy()` auf. Mit `window.__lfxNoJs = true` wird nur das CSS geladen. Chrome: in den Seiteneinstellungen des Jellyfin-Tabs den Zugriff auf das **lokale Netzwerk** erlauben, sonst blockiert Chrome den Zugriff von https auf localhost.

### Projektstruktur

```
build/        build.mjs (lightningcss + esbuild), serve.mjs (Dev-Server), dev-inject.js (Dev-Loader)
dist/         Build-Ausgabe (lenzflix[.min].css/.js, lenzplus[.min].css, lenzprime[.min].css, lenzretro[.min].css, lenzstore[.min].css/.js, lenzlive[.min].css/.js, lenztvmode[.min].css/.js)
assets/       Schriften Inter und LenzRetro (woff2) und Logo-SVGs, jeweils mit Lizenzdatei
docs/         dom-map.md (Jellyfin-DOM), js-contracts.md (Verträge zwischen Features)
src/css/      index.css (Einstieg, Reihenfolge = Kaskade), tokens.css, fonts.css, logo.css
  modern/     Kern-CSS für das Modern-Layout (wirkt ohne JS)
  legacy-tv/  TV-Layout
  js-ui/      Styles der JS-Komponenten (nur unter html.lfx-js)
src/js/       main.js (Einstieg, setzt window.LenzFlix)
  core/       API, Cache, Router, Layout, Playback, DOM-Helper, Ambient, Item-Store
  features/   nav, mobilenav, home (Billboard + Zeilen), hovercard, modal, newpopular; plus/, prime/ und retro/ (LENZ+, LENZPRIME, LENZ//84)
  shared/     von beiden Designs genutzte Module (Routen, Hubs, Suche, Titel-Aktionen)
src/css/themes/  plus/, prime/ und retro/ (je index.css = Bundle-Einstieg)
tests/        vitest-Tests (jsdom)
```

### Architekturregeln

- **Keine React-Knoten mutieren.** Jellyfin 12.4 rendert den Header per React. Eigene UI hängt an eigenen Mount-Points (z. B. `#lfx-nav`, `#lfx-home`), native Elemente werden nur per CSS-Klasse ausgeblendet.
- **Wiedergabe per Proxy-Klick:** ein verstecktes `.itemAction[data-action=play]` wird in einen vorhandenen `.itemsContainer` gehängt und geklickt (siehe `docs/dom-map.md`).
- **Scoping:** Modern-Regeln unter `html:not(.layout-tv)`, TV-Regeln unter `html.layout-tv`, JS-UI-Styles nur unter `html.lfx-js`. Details in `CLAUDE.md`.
- `window.LenzFlix.destroy()` muss alles wieder entfernen (Listener, Timer, Knoten).

## Lizenz

Der Code steht unter der **MIT-Lizenz**, siehe `LICENSE`.

Schriften:
- **Inter** (SIL OFL 1.1), Lizenz: `assets/fonts/LICENSE-Inter.txt`
- **Anton** (SIL OFL 1.1), nur als Pfade im Logo verwendet, Lizenz: `assets/logo/LICENSE-font.txt`
