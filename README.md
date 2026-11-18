# LenzFlix

Ein Theme im Streaming-Stil für das Jellyfin-Web-Frontend (Version 12.4): dunkles Design mit roter Akzentfarbe, Modern-Layout für Desktop und Mobil sowie ein Legacy-TV-Layout.

- Der **CSS-Kern** funktioniert allein und braucht kein JavaScript.
- Das **optionale JavaScript** ergänzt: Billboard (Hero), Streaming-artige Zeilen inklusive Top 10 und Badges, Hover-Popup, Detail-Modal, „Neu und beliebt“, Handy-Navigation im App-Stil und eine Ambient-Farbe aus dem Billboard-Bild.

> **Haftungsausschluss:** LenzFlix ist ein inoffizielles Fan-Theme. Es steht in keiner Verbindung zu Streaming-Anbietern oder zum Jellyfin-Projekt und enthält keine fremden Marken, Logos oder Assets. Logo und Name „LENZFLIX“ sind eigene Gestaltung.

## Kompatibilität

- Jellyfin Server und Web **12.4**, getestet im Browser. Android-App und TV-Webclients, die das Web-Frontend laden, sollten funktionieren (zu prüfen: nicht auf jedem Gerät getestet).
- Native Apps (Android TV, Swiftfin, Findroid, Streamyfin) ignorieren Custom CSS/JS und zeigen weiter ihr eigenes Design.

## Installation

### 1. CSS

Dashboard → **Branding** → *Benutzerdefiniertes CSS* (seit Jellyfin 10.11 eigener Menüpunkt „Branding“):

```css
@import url("https://cdn.jsdelivr.net/gh/lorenzhdr/LenzFlix@v1.18.0/dist/lenzflix.min.css");
```

- Die Version im Beispiel ist der aktuelle Release-Tag; bei Updates CSS und JS auf denselben Tag setzen. `@latest` wird bei jsDelivr lange gecacht.
- Vorher altes Theme-CSS (andere Themes, `@import`s) entfernen.

### 2. JavaScript (optional)

1. Plugin **JavaScript Injector** (n00bcodr) installieren. Die Repository-URL für den Plugin-Katalog steht in der Plugin-README (siehe Plugin-README).
2. Im Plugin einen Skript-Eintrag anlegen:
   - mit externer URL `https://cdn.jsdelivr.net/gh/lorenzhdr/LenzFlix@v1.18.0/dist/lenzflix.min.js` (externe URLs muss der Admin im Plugin erlauben), **oder**
   - den Inhalt von `dist/lenzflix.min.js` direkt einfügen.
3. Empfohlene Benutzer-Einstellungen: Anzeige → Detailbanner an. Die Startseite-Abschnitte sind bei aktivem JS egal, LenzFlix rendert eigene Zeilen. Andere Home-Slider/Media-Bars sollten entfernt werden (LenzFlix blendet bekannte iframes `.featurediframe` aus).

### 3. Konfiguration (optional)

Die optionalen Werte `chartsUrl`, `statsUrl`, `tvChannels` und `themeCssBase` (siehe die Abschnitte unten) setzt man in einem eigenen JavaScript-Injector-Eintrag **vor** `lenzflix.min.js`. Mehrere einzelne Zuweisungen überschreiben sich gegenseitig, deshalb zusammenführen:

```js
window.LenzFlixConfig = Object.assign(window.LenzFlixConfig || {}, {
  chartsUrl: "https://charts.example.com",
  statsUrl: "/lenzflix-stats/",
});
```

### 4. Reverse-Proxy mit CSP

Falls ein Reverse-Proxy eine Content-Security-Policy setzt, muss `cdn.jsdelivr.net` erlaubt sein (Stylesheet, Skript und die Schrift-Dateien). Die zusätzlichen Design-Dateien (`lenzplus.min.css`, `lenzprime.min.css`, `lenzretro.min.css`, `lenzstore.min.css`, `lenzstore.min.js`, `lenztvmode.min.css`, `lenztvmode.min.js`) und deren Schriften liegen am selben Ort wie `lenzflix.min.css`, es ist keine weitere Freigabe nötig. Für den Mehrspieler der VIDEOTHEK LENZ (siehe unten) muss zusätzlich `connect-src` die Adresse des Charts-Workers als `wss://<charts-url>` erlauben (neben `https://<charts-url>`, das für die Charts schon nötig ist).

## Designs

Mit aktivem JavaScript gibt es fünf Designs:

- **LENZFLIX** (Standard): das klassische Design mit roten Akzenten.
- **LENZ+**: dunkles Navy, Hero-Karussell mit Seitenvorschau, Poster-Zeilen, Bibliotheks-Hubs.
- **LENZPRIME**: Blauschwarz, Vollbild-Hero mit Trailer, Badges, Glas-Kopfzeile.
- **LENZ//84**: Cyber-Retro mit Bernstein-Terminal, Kassetten-Regal und Neon-Gitter samt Sonne im Hero, dazu CRT-Effekte und ein paar versteckte Überraschungen. Sound ist standardmäßig aus und lässt sich in der Kopfzeile einschalten. Tipp: Ein Terminal öffnet sich mit der Taste `^` (am Handy: Logo lange drücken), und mit dem richtigen Cheat-Code passiert etwas Besonderes.
- **VIDEOTHEK LENZ** (Beta): begehbare 3D-Videothek, seit 1.15.0 mit einer kleinen Stadt drumherum (siehe unten). Ton ist standardmäßig an (im Esc-Menü abschaltbar), Kassierer Richard spricht mit der deutschen Gerätestimme. Lädt rund 1,5 MB zusätzlich (übertragen etwa 0,5 MB) nur bei Auswahl und braucht WebGL.

Die Auswahl öffnet sich über **Mehr → Design-Einstellungen** (bei LENZ+/LENZPRIME/LENZ//84 über das Profilmenü bzw. „Mehr“; VIDEOTHEK LENZ trägt in der Auswahl die Marke „Beta“, das Menü selbst trägt kein Badge). Die Vorschau von VIDEOTHEK LENZ zeigt eine Regalwand mit echten Covern der Top-Titel (LENZFLIX-Charts, täglich neu gemischt; ohne Charts die neuesten Titel). Die Wahl wird pro Jellyfin-Benutzer gespeichert (im Browser und in den eigenen Anzeige-Einstellungen auf dem Server) und gilt auf allen Geräten. Auf TV-Clients ist immer LENZFLIX aktiv. Nicht erreichbar oder verirrt? Notausgang: `#/home?lfxtheme=flix` an die Jellyfin-Adresse anhängen.

Der Browser-Tab passt sich dem Design an: Er trägt dessen Icon und Namen, auf Unterseiten zum Beispiel „Meine Liste · LENZ+“. Auch das Icon beim Hinzufügen zum Home-Bildschirm und die Farbe der Browserleiste am Handy wechseln mit.

Das Design-CSS lädt LenzFlix automatisch nach, aus demselben Pfad wie das eingebundene `lenzflix.min.css` (gleiche jsDelivr-Version). Nur falls es woanders liegt, den Ordner (mit `/` am Ende) setzen: `window.LenzFlixConfig = { themeCssBase: "https://example.com/lenzflix/dist/" }`. Eigene Token-Overrides nach dem `@import` (siehe „Anpassen“) gelten nur für LENZFLIX.

**Wichtig bei Updates:** CSS-`@import` und JS-URL immer auf **denselben** Release-Tag setzen. Das Design-CSS wird aus dem Pfad des eingebundenen CSS abgeleitet. Steht das CSS noch auf einer älteren Version (ohne `lenzplus`/`lenzprime`/`lenzretro`), schlägt das Nachladen fehl. Dann fällt LenzFlix auf LENZFLIX zurück, und der Design-Dialog ist ungestylt.

### Eigene Seiten für Serien, Filme und Meine Liste (LENZFLIX)

In LENZFLIX führen „Serien“ und „Filme“ auf eigene Seiten, die alle Serien- bzw. alle Film-Bibliotheken zusammenfassen: Billboard und Zeilen (Weiterschauen, Top 10, Neu hinzugefügt, Genre-Zeilen, Hochbewertet, Zufall), ein Genre-Menü („Genres ▾“) und eine Rasteransicht mit vier Sortierungen. „Meine Liste“ ist ebenfalls eine eigene Seite mit Filter (Filme/Serien) und Sortierung (auch in LENZ//84).

### Datensparmodus (LENZFLIX, LENZ+, LENZPRIME, LENZ//84)

Für Mobilfunk und knappe Leitungen: Die Zeile **Datensparmodus** mit Schieber steht direkt unter „Design-Einstellungen“ (LENZFLIX: „Mehr“ bzw. Handy-Menü, LENZ+/LENZPRIME: Profilmenü, LENZ//84: Profilmenü am Desktop bzw. „MEHR“-Blatt am Handy). Solange er an ist, zeigt die Kopfleiste ein kleines Tacho-Symbol zum schnellen Ausschalten.

- **Weniger Daten im Hintergrund:** keine automatischen Trailer (die Trailer-Knöpfe funktionieren weiter), nur 5 Titel in der Hero-Rotation, Bilder in 2/3 der Größe, keine Vorladung unterer Startseiten-Zeilen, im TV-Modus kein Vorwärmen der Nachbarsender (Umschalten dauert dadurch etwas länger).
- **Unverändert:** Videoqualität beim Abspielen. Der Modus gilt pro Gerät und Benutzer und ist standardmäßig aus; in VIDEOTHEK LENZ gibt es ihn nicht.

### TV-Modus (LENZFLIX, LENZ+, LENZPRIME, LENZ//84)

Ein modernes Fernsehprogramm als eigene Seite: Das TV-Symbol in der Kopfleiste (neben der Suche, am Desktop und am Handy) öffnet `#/home?lfx=tv`. Dort laufen dieselben 18 Sender mit einem Programm, das für alle gleich ist (Sender 1 bis 18, Plätze 5 bis 16 nach Genre belegbar), aber ohne Fernseher-Optik.

- **Desktop:** Player links, Senderliste mit Vorschaubildern rechts, darunter Infos zur Sendung mit „Von vorne“, „Details“ und „Bild-in-Bild“ und ein Programmraster über 7 Tage mit „Jetzt“-Knopf. Ein Klick auf eine künftige Sendung zeigt eine Info-Karte.
- **Handy:** Player oben, darunter die Tabs „Jetzt im TV“ und „Programm“. Wischen im Bild schaltet um, im Querformat füllt das Bild den Schirm.
- **Bedienung:** Pfeiltasten ↑/↓ oder Ziffern wechseln den Sender, `M` schaltet stumm, `F` Vollbild. Ton- und Untertitelspur sowie Lautstärke wählt man in der Leiste unter dem Bild.
- **Keine Spuren:** Der eigene Player meldet keinen Fortschritt, Umschalten taucht nicht in „Weiterschauen“ auf. Beim Verlassen der Seite stoppt der Stream, außer Bild-in-Bild ist aktiv.
- Die Optik folgt dem gewählten Design (in LENZ//84 mit Rauschen beim Umschalten und Programmnummer „P07“). Auf TV-Clients und in VIDEOTHEK LENZ gibt es den TV-Modus nicht. Gespielt wird nur per Direktwiedergabe bzw. Umpacken, nie mit Video-Transkodierung (Titel, die der Browser so nicht abspielt, sind „nicht empfangbar“); Firefox ohne native HLS-Wiedergabe zeigt ein Störbild.

### TV-Modus: Voraussetzungen und Senderbelegung

- **Konten:** Benutzer brauchen im Jellyfin-Dashboard die Rechte „Audio-Transkodierung“ und „Remux“ (Umpacken). Fehlt eines, ist der Ton bzw. Stream nicht empfangbar.
- **Senderbelegung (Admin):** Die Plätze 5 bis 16 sind automatisch mit Genres belegt. Die gewünschte Belegung (Administratoren) als Zeile unter Dashboard → **Branding** → *Benutzerdefiniertes CSS* **unterhalb** der `@import`-Zeile einfügen (nie davor, sonst lädt das Theme nicht) und speichern. Die Belegung gilt nach dem Neuladen für alle Nutzer. Format:

```css
@import url("https://cdn.jsdelivr.net/gh/lorenzhdr/LenzFlix@v1.18.0/dist/lenzflix.min.css");
:root { --lfx-tv-channels: "5=Action;6=Komödie"; }
```

  Pro Eintrag `Platz=Genre` (Genre wie in Jellyfin geschrieben), getrennt durch `;`. Alternativ per JS (siehe „Konfiguration“): `window.LenzFlixConfig = { tvChannels: { 5: "Action", 6: "Komödie" } }` (hat Vorrang). Die früheren Namen `liveChannels` und `--lfx-live-channels` (aus LENZ LIVE, bis 1.14.0) werden weiter gelesen.

### Open World (Beta, VIDEOTHEK LENZ)

Die Videothek steht in einer kleinen Stadt: Durch die Tür geht es auf die Straße, dazu gibt es einen Hinterhof, ein Dach, einen Kiosk und das Kino **LENZ PALAST**. Ampeln, Autos, Passanten, Tauben und eine Katze beleben die Straße; Tageszeit und Regen ändern die Stimmung.

- **Steuerung am PC:** WASD/Pfeile laufen, Shift rennt, Leertaste springt (an Kanten hochziehen geht auch), Maus schaut, `E`/Linksklick nimmt oder benutzt, `F` schlägt, `G` wirft, `Q`/Rechtsklick zoomt, Esc öffnet die Pause. Im Halte-Bild nimmt `M` die Hülle mit; getragene Hüllen kann man wieder öffnen, zurückstellen oder werfen.
- **Steuerung am Handy:** Standard ist die Spiel-Steuerung: Stick links zum Gehen, rechts wischen zum Umsehen, Knöpfe für Springen, Benutzen und Schlagen (bzw. Werfen mit Hülle in der Hand). Joystick und „Halten = laufen“ bleiben im Pause-Menü unter „Steuerung“ wählbar; eine bisher gespeicherte Auswahl „Touch“ springt dabei einmalig auf „Spiel“.
- **LENZ PALAST:** An der Kasse ein Ticket für das Tagesprogramm holen (vier Vorstellungen aus der eigenen Mediathek, jede Vorstellung startet für dich von vorn), im Saal einen Platz wählen und den Film auf der großen Leinwand ansehen. Pause, Spulen, Lautstärke und Vollbild liegen in der Leiste; im Vollbild bringt „Zurück ins Kino“ in den Saal zurück, mit Esc steht man auf. Eigene Kassetten kann man mitbringen und am Eingang abgeben. Läuft die Leinwand nicht, fällt das Kino automatisch auf den normalen Player zurück.
- **Richard, Ausleihen, Physik:** Wer Richard schlägt, bekommt Ärger; mit Hausverbot bleibt die Tür eine Weile zu. Hüllen lassen sich an der Kasse ausleihen, Bälle, Dosen und Kisten rollen, kippen und lassen sich schlagen und werfen. Im Hof hängt ein Basketballkorb.
- **Entdeckungen:** Überall sind 19 Kleinigkeiten versteckt. Das Pause-Menü zeigt, wie viele schon gefunden sind, und gibt Hinweise ohne die Lösung zu verraten. Seit 1.17.0 wird der Stand am Jellyfin-Konto gespeichert (geräteübergreifend), und jede Entdeckung schaltet ein besonderes Kleidungsstück für die eigene Figur frei.
- **Hinweise:** Beim Neuladen steht man wieder an der letzten Position (auch in der Stadt); ist die Stelle ungültig oder belegt, geht es zum nächsten freien Punkt in der Nähe, sonst in den Laden. Auf schwachen Geräten helfen „Qualität“ im Pause-Menü und ein kleinerer Datenumfang (Hüllen „Normal“).

### Mehrspieler (Beta, VIDEOTHEK LENZ)

Alle Nutzer eines Servers laufen in derselben Videothek: Man sieht andere Figuren mit ihrem Jellyfin-Namen („N hier“ in der Anzeige, Spielerliste im Esc-Menü), kann chatten (Enter am PC, Knopf am Handy), mit dem Emote-Rad (`T` bzw. Knopf) Gesten zeigen und Bälle, Dosen, Tonnen und Hüllen gemeinsam schubsen und werfen. Richard und das Wetter sind für alle gleich; ein Hausverbot trifft nur den Täter. Im **LENZ PALAST** kann man am Platz „Mitschauen“ wählen oder einen eigenen Film starten; jeder schaut über das eigene Konto (eigenes Weiterschauen), alle dürfen pausieren und spulen. Private Filme werden nicht angeboten, und Cover oder Titel erscheinen nur, wenn sie in der eigenen Bibliothek liegen, sonst als neutrale Hülle. Höchstens 16 Verbindungen gleichzeitig. Am Handy ist die Spiel-Steuerung neu: Ruhe-Stick links (springt unter den Daumen), rechts überall wischen, Zoom per Knopf, eigenes Hoch- und Querformat. Stummschalten ist lokal, Administratoren können Spieler für 10 Minuten entfernen.

- **Standardmäßig an**, im Esc-Menü unter „Mehrspieler …“ abschaltbar (auch Name, Chat und „Mein Film für andere sichtbar“, Standard aus). Beim ersten Mal erscheint ein einmaliger Hinweis.
- **Voraussetzung:** der Charts-Worker mit Durable Object und dem Secret `MP_SECRET` (Einrichtung in [`charts-worker/README.md`](charts-worker/README.md)) und gesetzter `chartsUrl`. Ohne ihn, bei einer älteren Worker-Version oder bei Störungen verhält sich die VIDEOTHEK wie bisher.
- **CSP:** Wer eine Content-Security-Policy setzt, muss `connect-src` für `wss://<charts-url>` erlauben (siehe „Reverse-Proxy mit CSP“).

### Eigene Figur (Beta, VIDEOTHEK LENZ)

Seit 1.17.0 läuft man mit einer eigenen, gestaltbaren Figur durch die Videothek, und alle Mitspieler sehen sie.

- **Mitgliedsantrag:** Beim ersten Betreten (auch für bisherige Besucher) füllt man einmal einen Antrag im Stil der 90er aus: Figur gestalten, „Fertig“, Blitz fürs Ausweisfoto, dann gibt es den **Mitgliedsausweis** mit Nummer, „Mitglied seit“, Ausleihen, Kinobesuchen und Stempeln für Entdeckungen. Die Kartenfarbe steigt von Bronze über Silber bis Gold.
- **Gestalten:** Hautton, Größe, Statur und Körperform, 18 Frisuren mit Haarfarbe, Augen, Brauen, Bart, Oberteil, Hose und Schuhe mit Farben und Mustern, Brille, Kopfbedeckung und Tasche, dazu ein Zufallsknopf und drei Outfit-Plätze. Neben den Paletten gibt es „Eigene Farbe …“. Geändert wird im Pause-Menü unter „Figur …“ oder im begehbaren **FRISEUR HAARSCHARF** gegenüber (Friseurstuhl mit Spiegel und Umkleide, Gabi und Ronny haben dazu eine Meinung). In VR gibt es eine vereinfachte Auswahl (Platz, Zufall, Farben).
- **Selbst sehen:** `V` (am Handy der Knopf „Ansicht“) schaltet zwischen Ego-Sicht und Außenansicht; beim Blick nach unten sieht man die eigenen Beine. Spiegel im Salon und ein Überwachungsspiegel über der Ladentür zeigen die Figur (bei Qualität „niedrig“ matt).
- **Ausweis anderer:** Im Mehrspieler zeigt `E` beim Anschauen einer Figur (oder der Knopf „Ausweis“ in der Spielerliste) deren Ausweis. „Ausweis zeigen“ lässt sich im Mehrspieler-Menü abschalten.
- **Speicherung:** Figur, Ausweis und Entdeckungen liegen in den eigenen Anzeige-Einstellungen am Jellyfin-Server und gelten damit auf allen Geräten. Ältere Clients und ein älterer Charts-Worker sehen weiterhin die bisherige Zufallsfigur.

### NPCs und Raufen (Beta, VIDEOTHEK LENZ)

Seit 1.18.0 ist die Stadt lebendiger und rauer.

- **Stimmen und Gesten:** Alle Leute sprechen mit der Gerätestimme, jede Person klingt etwas anders. Es spricht immer die nächste Person, der Rest erscheint als Sprechblase. Passanten reagieren auf deine Emotes (Emote-Rad mit `T`, jetzt auch ohne Mehrspieler): Sie tanzen mit, winken zurück und klatschen.
- **Temperament:** Wer Passanten schlägt, blendet oder anrempelt, bekommt Reaktionen. Ängstliche fliehen, andere schimpfen, Hitzköpfe drohen und schlagen mit Handtasche, Schirm oder Faust zurück. Die Kioskfrau wirft mit Bonbons, das Kino-Personal mit Popcorn, im Salon wehren sich Gabi und Ronny.
- **Rowdy-Bande:** Nachts treiben sich in Gasse und Hof ein paar Rowdys mit derbem Mundwerk herum, tagsüber selten. Sie suchen von sich aus Streit. Wer sie vertreibt, findet eine Entdeckung.
- **Waffen:** Hand, Gürtel, Peitsche und Laserpointer, alle sofort verfügbar. `R` halten öffnet das Waffenrad, `1`–`4` und das Mausrad wählen, `F` oder Linksklick greift an (Laser: halten). Am Handy gibt es einen Waffenknopf. Der Laser blendet Leute, lässt Autofahrer bremsen, schreckt Tauben auf, und die Katze jagt den Punkt.
- **Energie und K.O.:** Treffer kosten Energie, die sich langsam wieder füllt. Bei null wacht man auf der Bank vor dem Laden auf, mit 10 Sekunden Schutz. Kinosaal (während des Films), Kinder-Ecke, Couch, Friseurstuhl und offene Menüs schützen.
- **Mehrspieler:** Waffen wirken auch auf andere Spieler: Rückstoß, Energie, Blenden (kräftiger Schleier ohne Flackern, höchstens alle 4 Sekunden). Die Rowdy-Bande ist für alle dieselbe. In VR gibt es keine Waffen und keine Angriffe. Mit einem älteren Charts-Worker oder einer älteren Version bleibt es beim bisherigen Schubsen.
- **Entdeckungen:** vier neue (jetzt 19), jede mit eigenem Kleidungsstück für die Figur.

### VR-Modus (Beta, VIDEOTHEK LENZ)

Die Videothek lässt sich mit einer VR-Brille begehen, samt Kinosaal für die Wiedergabe. Seit 1.15.0 ist dabei auch die Stadt begehbar (ohne Sprung, Schlagen und Werfen; Richard bleibt friedlich); das Kino im LENZ PALAST gibt es nur am Bildschirm, in VR läuft der VR-Kinosaal.

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
- **Detail-Modal:** öffnet oben; bei Episoden-Karten steht die Folgenliste auf der markierten Folge.
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
@import url("https://cdn.jsdelivr.net/gh/lorenzhdr/LenzFlix@v1.18.0/dist/lenzflix.min.css");
:root {
  --lfx-red: #1db954;
  --lfx-card-radius: 4px;
  --lfx-hover-delay: 300ms;
}
```

**Logo-Klassen:** `.lfx-logo` (Wortmarke „LENZFLIX“, 88 × 25 px) und `.lfx-logo--l` (nur das „L“, 24 px breit) sind Hilfsklassen für eigenes HTML, z. B. im Jellyfin-Branding (Login-Hinweis): `<span class="lfx-logo"></span>`. Die Größe lässt sich per `width`/`height` überschreiben.

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

**Dev-Loop:** `npm run dev` und `npm run serve` laufen lassen. Den Inhalt von `build/dev-inject.js` in die Konsole eines eingeloggten Jellyfin-Tabs einfügen. Das Skript entfernt bekannte Fremd-Spotlight-Elemente, lädt CSS und JS frisch vom Dev-Server und ruft vorher `window.LenzFlix.destroy()` auf. Mit `window.__lfxNoJs = true` wird nur das CSS geladen. `build/dev-boot.js` (über `npm run serve` als `/boot.js`) tut dasselbe als Kurz-Loader, setzt aber zusätzlich das Design per `#/home?lfxtheme=<Design>`. Chrome: in den Seiteneinstellungen des Jellyfin-Tabs den Zugriff auf das **lokale Netzwerk** erlauben, sonst blockiert Chrome den Zugriff von https auf localhost.

### Projektstruktur

```
build/        build.mjs (lightningcss + esbuild), serve.mjs (Dev-Server), dev-inject.js und dev-boot.js (Dev-Loader), *-dev.html/js (Dev-Harnesses)
dist/         Build-Ausgabe (lenzflix[.min].css/.js, lenzplus[.min].css, lenzprime[.min].css, lenzretro[.min].css, lenzstore[.min].css/.js, lenztvmode[.min].css/.js)
assets/       Schriften Inter und LenzRetro (woff2) und Logo-SVGs, jeweils mit Lizenzdatei
docs/         dom-map.md (Jellyfin-DOM), js-contracts.md (Verträge zwischen Features), store3d.md, tvmode.md, charts-api.md, stats-api.md
src/css/      index.css (Einstieg, Reihenfolge = Kaskade), tokens.css, fonts.css, logo.css
  modern/     Kern-CSS für das Modern-Layout (wirkt ohne JS)
  legacy-tv/  TV-Layout
  js-ui/      Styles der JS-Komponenten (nur unter html.lfx-js)
src/js/       main.js (Einstieg, setzt window.LenzFlix); store3d/ (3D-Engine) und tv/ (TV-Modus-Engine samt Planer und Player) als lazy Bundles
  core/       API, Cache, Router, Layout, Playback, DOM-Helper, Ambient, Item-Store
  features/   nav, mobilenav, home (Billboard + Zeilen), hovercard, modal, newpopular; plus/, prime/, retro/ (LENZ+, LENZPRIME, LENZ//84), store/, tvmode/, tvdata/ (Hüllen für VIDEOTHEK LENZ und TV-Modus, gemeinsame Server-Daten des TV-Modus)
  shared/     von plus, prime und retro genutzte Module (Routen, Hubs, Suche, Titel-Aktionen)
src/css/themes/  plus/, prime/, retro/, store/ (je index.css = Bundle-Einstieg)
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
