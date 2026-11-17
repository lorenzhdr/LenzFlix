# VIDEOTHEK LENZ (`store`, Beta) – Vertrag Hülle ↔ 3D-Bundle

Design-ID `store`, Name „VIDEOTHEK LENZ“. Eine begehbare 3D-Videothek (three.js), späte 90er/frühe 2000er,
stilisiert-warm (Low-Poly, warmes Licht, Neon, blauer Teppich). Alle Modelle/Texturen prozedural im Code,
keine fremden Assets, keine fremden Marken. Seit 1.15.0 eine **Open World**: Der Laden steht in einer kleinen Stadt
(Straße, Hof, Dach, Kiosk, Kino „LENZ PALAST“), man springt, schlägt, wirft und trägt Hüllen; siehe „Open World (1.15.0)“.

## Zwei Bundles

| Teil | Ort | Bundle | darf importieren |
|---|---|---|---|
| Hülle | `src/js/features/store/*` | `dist/lenzflix(.min).js` (Hauptbundle) | alles aus `core/`, `shared/` – **nie `three`** |
| 3D | `src/js/store3d/**` | `dist/lenzstore(.min).js` (IIFE, lazy) | **nur** `three` (+ `three/examples/jsm/...`) und Dateien in `src/js/store3d/` |

Das 3D-Bundle importiert nichts aus `core/`/`shared/`/`features/` (sonst doppelter Modul-State in zwei IIFEs).
Alles Zustandsbehaftete (API, Wiedergabe, Toast, Navigation …) bekommt es über `deps`.

Das 3D-Bundle registriert sich beim Laden als `window.LenzFlixStore3D = { version: 1, create }`.
Die Hülle lädt es per `core/themejs.js` (`ensureThemeJs('store')`, Basis wie `resolveThemeCssBase()`).

## `create(host, deps, opts) → instance`

- `host`: leeres `<div class="lfx-store-stage">`, von der Hülle vollflächig positioniert (`position:fixed; inset:0`).
  Das 3D-Bundle hängt Canvas **und alle eigenen DOM-Overlays** (Holdview-Panel, Pause-Menü, Kassen-PC, Hinweise)
  in `host` ein. Klassen-Präfix `lfx-store-*`. Styles liegen im Design-CSS (`src/css/themes/store/`).
- Rückgabe synchron; das Laden läuft async, Fortschritt über `deps.onProgress`.

### `opts`
```js
{
  quality: 'auto' | 'low' | 'mid' | 'high',
  sound: true,              // Standard an (ab v1.7.4; Hülle: localStorage lfx.store.soundOn.<uid>, der alte Schlüssel lfx.store.sound.<uid> wird nicht mehr gelesen)
  showFps: false,           // FPS-Kachel oben rechts (Pause-Menü „FPS-Anzeige“), Standard aus
  bigCovers: true,          // große Hüllen (Standard); false = „Normal“. Wechsel im Pause-Menü baut die Szene neu auf
  skipIntro: false,         // true = Intro (Rollladen) in dieser Sitzung schon gesehen
  restore: null | State,    // letzte Position (sessionStorage) → genau dort starten
  openItemId: null | string,// Route #/home?lfx=title&id=… → mit dieser Hülle in der Hand starten
  openTerminal: false,      // Route #/home?lfx=search → direkt am Kassen-PC (opts.query = Vorbelegung)
  query: '',
  phone: false,             // innerWidth < 800 oder Touch-Gerät ohne feinen Zeiger
  touch: false,             // (pointer:coarse) → Touch-Steuerung statt Pointer-Lock
  touchControl: 'game',     // nur Touch: 'game' (Standard seit 1.15.0: Stick links, Umsehen rechts, Knöpfe) | 'joystick' (Gehen-Knopf + Joystick) | 'touch' (Halten = laufen); Pref lfx.store.touchControl.<uid>, Migration siehe „Eingabe“
  // nur Debug/Harness: spawn: 'shop'|'street'|'palast'|'yard'|'roof'|'kiosk'|'alley', devFlags: { npc, cars, palast, brawl, props } (live undefined = alles an), hour, rain
  vr: { turn: 'snap' | 'smooth', vignette: true, height: 'auto' | 'seated', quality: 'mid' | 'low', seat: 'front' | 'mid' | 'back' }, // VR-Vorlieben (ab v1.8.0), siehe „VR-Modus (Beta)“
  debug: false,             // window.__lfxStoreDebug === true
}
```

### `State` (JSON, von der Hülle in sessionStorage gespiegelt)
```js
{ x, z, yaw, pitch, heldId: null | string, y? }
```
`y` steht nur, wenn der Spieler über dem Boden steht (> 0,05 m: Dach, Feuertreppe). Beim Wiederherstellen setzt `resolveRestore(layout, r)` (rein, `world/city.js`) ungültige Werte auf den Laden-Spawn, klemmt auf die Weltgrenzen, behält `y > 0,25` nur mit Standfläche (`groundHeight`) und sucht am Boden die nächste freie Zelle (Umkreis 4 m, sonst Laden-Spawn). `heldId` draußen: `take(heldId, { instant: true })` geht ohne Regalplatz. Getragene Hüllen (Mitnehmen) werden nicht wiederhergestellt (`getState().heldId` bleibt dann null).

### `deps`
```js
{
  // Daten (Katalog vorab von der Hülle geladen und eingeteilt, siehe unten)
  catalog: Catalog,
  user: { name: string },                     // Profilname (Kassierer-Sprüche)
  imageUrl(id, { type = 'Primary', maxWidth, maxHeight, tag, quality }) → string,  // ohne api_key, same-origin
  getItem(id) → Promise<Item>,                // volle Details (Overview, People, …)
  getSeasons(seriesId) → Promise<Item[]>,
  getEpisodes(seriesId, seasonId) → Promise<Item[]>,
  setFavorite(id, bool) → Promise<UserData|void>,
  setPlayed(id, bool) → Promise<UserData|void>,
  search(q, { signal }) → Promise<Item[]>,    // shared/search.js
  loadTrailer(item) → Promise<string|null>,   // lokale Trailer-URL (enthält api_key – NIE loggen) oder null
  play(item, { resume }) → Promise<boolean>,  // core/playback.js (Proxy-Klick); danach wechselt die Route zum Player
  // UI/Navigation
  toast(text),
  classicView(),                               // „Klassische Ansicht“: native Startseite/Bibliotheken
  openLibraries(),                             // native Bibliotheksübersicht
  openMenu(anchorEl),                          // Profilmenü (Popover: Profil, Einstellungen, Design, Abmelden)
  openSettings(), openThemePicker(), logout(),
  // Rückmeldungen an die Hülle
  onProgress(fraction 0..1, label),
  onReady(),
  onState(State),                              // bei Bewegung gedrosselt (≤ 2/s) und bei suspend
  onPrefs({ quality, sound, fps, bigCovers, vr }),  // volles Objekt; Hülle speichert pro Benutzer (localStorage, bigCovers Standard true); vr = { turn, vignette, height, quality, seat }
  onBigCovers(on),                             // Pause-Menü „Hüllen: Groß/Normal“: Hülle speichert die Pref, disposed die Instanz und erstellt sie neu (Ladebildschirm, skipIntro, restore = aktuelle Position/gehaltene Hülle)
  onFatal(error),                              // z. B. kein WebGL → Hülle zeigt Fallback mit „Zu LENZFLIX wechseln“
  // VR (ab v1.8.0, Beta; die Hülle setzt beides vor create())
  onXr({ presenting, cinema }),                // bei jeder Änderung der Sitzung: Start {true,false}; unmittelbar vor dem echten deps.play() in VR {true,true}; Kino verlassen {true,false}; Ende {false,false}
  cinema: CinemaBridge,                        // Player-Bridge der Hülle (features/store/cinema-bridge.js), Form siehe „VR-Modus (Beta)“
  // 2D-Kino im LENZ PALAST (ab v1.15.0)
  onCinema2d({ active, full }),                // Kino läuft (active) / Bühne ausgeblendet = Vollbild (full); Hülle setzt <html>-Klassen lfx-store-palast / -palast-full, Bridge an/aus, „Zurück ins Kino“; Typeof-Guard im 3D-Bundle (fehlt sie, bleibt alles 2D wie zuvor)
}
```

### `instance`
```js
{
  suspend(),          // Schleife aus, Listener ab, Pointer-Lock frei, Audio stumm; Kontext + Texturen bleiben
  resume(host?),      // optional neuer host (Canvas wird umgehängt); Schleife an
  dispose(),          // alles freigeben: Geometrien, Materialien, Texturen, renderer.dispose(), forceContextLoss(), DOM in host leeren
  openItem(id),       // Hülle in die Hand (aus Regal oder „über den Tresen“)
  openTerminal(query),  // während des Boots wie openItem zurückgestellt
  getState() → State,
  setQuality(q), setSound(bool),
  isXr() → bool,      // VR-Sitzung präsentiert (die Hülle prüft damit, ob ihre onXr-Meldung noch stimmt)
  leaveCinema(reason),// 'home' | 'stop' | 'fail' | 'sessionend'; idempotent; VR: Schwarzblende, zurück in die Videothek an die gespeicherte Pose; ruft zusätzlich cinema2d.leave(reason), wenn das 2D-Kino aktiv ist
  cinema2dSetFull(on),// Vollbild des 2D-Kinos umschalten (Knopf „Zurück ins Kino“ der Hülle ruft cinema2dSetFull(false))
  debug?              // nur bei opts.debug, siehe unten
}
```

## Katalog (`deps.catalog`)

Von der Hülle (`features/store/data.js` + reines `features/store/departments.js`) gebaut:
```js
{
  items: Map<id, Item>,              // Filme + Serien
  departments: Department[],          // in Laufreihenfolge
  resume: Item[],                     // Weiterschauen (Filme/Folgen) → Rückgabe-Wagen
  favorites: Item[],                  // Merkliste → Reservierungsfach
  highlights: Item[],                 // Schaufenster (neu + hoch bewertet, mit Backdrop)
}
Department = {
  id: string,                         // 'new' | 'kids' | 'adult' | 'series-<genre>' | 'genre-<genre>' | 'misc'
  label: string,                      // Schild, z. B. „Action“, „Neuheiten“, „Kinder“, „Ab 18“, „Serien · Drama“
  kind: 'new' | 'genre' | 'series' | 'kids' | 'adult' | 'misc',
  color: '#rrggbb',                   // Neon-/Schildfarbe
  itemIds: string[],
}
```
Item = Jellyfin-Item (mind. Id, Name, Type, ProductionYear, OfficialRating, Genres, Overview, RunTimeTicks,
CommunityRating, ChildCount, DateCreated, UserData{Played, PlaybackPositionTicks, PlayedPercentage, IsFavorite},
ImageTags, BackdropImageTags, ServerId, MediaType, IsFolder) plus berechnet:
`lfx: { media: 'vhs' | 'dvd' | 'box', isNew: bool, progress: 0..1 | 0, watched: bool }`.

Regeln (gemessen auf dem Entwicklungs-Server: 674 Filme, 157 Serien; Freigaben `FSK-0/6/12/16/18`, vereinzelt `12`, `16`, `R`, `TV-MA`, `NC16`, `MA 15+`):
- `media`: Serie → `box`; Film mit `ProductionYear < 2000` → `vhs`; sonst `dvd`.
- `isNew`: `DateCreated` jünger als 14 Tage. Neuheiten-Abteilung: bis zu 24 neueste Titel (Filme + Serien), stehen **zusätzlich** in ihrer Abteilung.
- `adult` (Ab-18-Raum hinter Vorhang): `OfficialRating` ∈ {`FSK-18`, `18`, `DE-18`, `NC-17`, `X`, `R18`, `R18+`, `AO`} (Groß/Klein egal). Sonst nirgendwo.
- `kids` (Kinder-Ecke): nicht `adult` und (Genre `Animation`/`Familie`/`Kids`/`Kinder` **und** Freigabe in {`FSK-0`,`FSK-6`, `0`, `6`, leer}). Serien und Filme gemischt.
- Serien (Rest): Serien-Wand, Abteilungen `series-<erstes Genre>`; Genres mit < 6 Serien → `series-misc` („Serien · Mehr“).
- Filme (Rest): Abteilung nach erstem Genre; Genres mit < 8 Filmen → `misc` („Querbeet“). Ohne Genre → `misc`.
- Innerhalb einer Abteilung alphabetisch nach `SortName || Name`.

## Hüllengrößen und Schärfestufe (`world/layout.js`, `covers/*`)

- `shelfSpec(big)` (rein, konstant) beschreibt Regalseite und Hülle: `cols`, `rowsTall`/`rowsLow`, `capTall`/`capLow`, `stepTall`/`stepLow` (Fachabstand), `cover` `{ w, h, boxW, boxH, pitch, tilt, zBottom, thick }`, Atlas-Zelle `cellW × cellH` (Raster 1024²).
  - Normal (`bigCovers: false`): 7 Spalten, Hülle 0,14 × 0,20 m, 5 bzw. 3 Fächer, Zelle 146 × 200.
  - Groß (Standard, `opts.bigCovers !== false`): 6 Spalten, Hülle 0,17 × 0,24 m (Pitch 0,19), hohe Regale 4 Fächer à 0,42 m, niedrige 3 à 0,33 m (Kapazität 24 bzw. 18 je Seite), Zelle 170 × 240 (4 × 240 + Farbfeldstreifen ab y = 1004 passen in 1024).
- `buildLayout(departments, { big })` setzt Segmentzahl, Slots und Kapazität nach der Spezifikation und hängt sie als `layout.spec` an. Alle Verbraucher (`build-shelves`, `covers/atlasmap|atlas|manager`, `ui/holdview`) lesen sie von dort bzw. bekommen sie als Parameter (`spec`) – kein modulglobaler Zustand. `COVER`/`COLS`/`CAP_*` bleiben nur als Normal-Werte exportiert.
- Holdview-Panel (2D): `role="dialog"`, Fokus beim Öffnen auf dem Panel (`tabindex="-1"`), nicht auf dem ersten Knopf (Leertaste/Enter starten sonst versehentlich die Wiedergabe), Fokus-Rückgabe beim Schließen. Mesh in Hüllengröße der Spezifikation (Regal → Hand ohne Sprung), Hand-Zielgröße wird durch `COVER.h / spec.cover.h` unabhängig von der Hüllengröße gehalten.
- Schärfestufe (`CoverManager`): für die nächsten Regalseiten im Blickfeld (Betrachter vor dem Regal, ≤ 6,5 m, Blickwinkel; bei `zoom > 1,3` ≤ 11 m und nur nahe der Blickachse, `update(x, z, yaw, { zoom, pitch })`) zusätzlich ein Atlas 2048² mit Bildern `maxWidth: 400` (`HI_SIZE`, `HI_WIDTH`). Nicht bei Qualität `low`, nur mit `renderer.capabilities.maxTextureSize >= 2048`. Höchstens 8 Seiten (Handy 4), zusätzlich höchstens die Hälfte des Atlas-Budgets (`preset.maxAtlases`; 2048² = `HI_COST` = 4 Einheiten, wird vom Grund-Budget abgezogen). Hochstufen erst bei fertigem Grund-Atlas; Herabstufen tauscht zuerst auf den Grund-Atlas zurück, dann `dispose()` der großen Textur; laufende Loads werden abgebrochen. Ein Atlas-Upload je `tick()`, Hi-Jobs nach den Grund-Atlanten.
- Qualitätsautomatik (`engine/quality.js`, `AutoQuality`): Hänger über 250 ms zählen als sehr langsamer Frame (das Fenster wird nicht verworfen); nur Physik/`tick` bekommen für solche Frames `dt = 0,016`. Läuft nicht in XR. Nach `reset()` (Start via `go()`, `setLevel`, `setAuto`, XR-Ende) ignoriert sie die ersten 3 Frames (Shader-Kompilierung, Textur-Neuladen); Dauerruckeln zählt weiter.
- Ruckler-Bremse (ab v1.7.7, live gemessen: beim Laufen 92 → 0–1 Ausreißer > 25 ms in 20 s): Schärfestufe (2048²) nur bei Ruhe (< 0,5 m/s, Drehung < 0,8 rad/s) oder Zoom > 1,3, Seite ≥ 400 ms gewählt, 3 s Haltezeit je Seite, Herabstufen erst > 9 m oder > 2 s hinter dem Spieler, Hi-Platz per LRU (≥ 3 s ungewollt); höchstens 4 Hi-Seiten (Handy 2), Hi-Uploads ≥ 600 ms auseinander und nur bei ruhigen Frame-Zeiten/Drehung < 1,5 rad/s. Full-Atlanten: Score (Strafen Regal/Rücken) nur für die Lade-Reihenfolge, Eviction nach Distanz mit 3 m Vorsprung, frisch geladene Seiten 5 s geschützt. Höchstens ein Atlas-Upload alle 2 Frames. Konstanten oben in `covers/manager.js`; Debug-Zähler in `stats()`: `coverUploads, hiUp, hiDown, fullLoads, fullEvicts`. Beim Stehenbleiben kostet jeder 2048er-Upload weiterhin ~1 Frame (≤ 4 einzelne Ausreißer).
- Stimmenauswahl (ab v1.7.7): Pause-Knopf „Stimme: <Kurzname|Automatisch>“ öffnet `.lfx-store-voicepick` (Automatisch Gerät / Automatisch Online bevorzugt / alle deutschen Stimmen, männliche zuerst, Online markiert; Klick wählt und spricht synchron eine Probe), „Tonlage: Tief/Sehr tief/Normal“ (`PITCH_FACTOR` 0,8/0,65/1,0, Standard Tief). Prefs `voiceName`, `voicePitch`; `pickVoice(voices, { online, name })`, `listVoices()`, `createVoice({ prefer })`; Provider `cashier.voices()`, `preview()`; Hook `onVoicePrefs`.
- Vorladen (`covers/preload.js`, ab v1.7.5): Im Ladebildschirm holt `CoverPreloader` je Titel ein Mini-Bild (`coverUrl` wie die `full`-Stufe inkl. `tag`, `maxWidth 64`, `quality 60`, über `loadBitmap` → Browser-Cache), Concurrency 12 (Handy 6), nahe Regalseiten zuerst; Fehler/kein Bild zählen als erledigt. Phase „Cover werden vorgeladen“ (`progress 0.92…0.99`), höchstens 20 s, danach lädt der Rest im Hintergrund. Gemessen: 831 Titel beim allerersten Besuch ~53 s (Server rechnet die Größe erst), danach ~0,5 s.
- Stufen je Regalseite: `flat` → (`ph`, nur vor dem Vorladen) → `low` → `full` → `hi`. `low` = eigener Atlas pro Seite im selben UV-Raster, 256² (Handy, Qualität `low` oder > 160 Seiten: 128²), eigenes Budget außerhalb `maxAtlases`; `buildLowAll` im Ladebildschirm (4 je Frame), Nachzügler höchstens 1 Seite je `tick()` nach `full`/`ph`. Evict von `full`/`hi` fällt auf `low` zurück, `evictAll` (Qualitätswechsel) behält `low`. Debug: `stats()` liefert `coversLow/Full/Hi` und `preload { done, total, ms }`.

## Lebenszyklus (Ausnahme vom Unmount-Vertrag)

- Hülle `unmount()` (z. B. Route wechselt in den Player) → `instance.suspend()`, Canvas raus aus dem DOM, Instanz bleibt
  im Modul der Hülle. Erneutes `mount()` innerhalb von 3 min → `resume(newHost)`; sonst `dispose()` nach Ablauf. `resume()` während des Boots hebt nur die Pause von Covern, Modulen (`onResume`) und Vollbild-Hilfe auf, startet aber Engine und Steuerung nicht (das tut `boot()`).
- Design-Wechsel weg von `store`, `window.LenzFlix.destroy()` → sofort `dispose()`.
- Die Hülle leert bei `lfx:play` den Katalog-Cache (`store:catalog:`), damit ein Neuaufbau frischen Fortschritt/Weiterschauen lädt; der Listener lebt von `create` bis `dispose`. Ein leerer Katalog erzeugt ein leeres Regalrahmen-Mesh statt eines Fehlers.
- `webglcontextlost` → Pause-Hinweis; `webglcontextrestored` → Szene neu aufbauen (aus `getState()`).
- `visibilitychange` (hidden) → Schleife pausiert.

## Eingabe

- Desktop (`!opts.touch`): Klick auf Canvas → Pointer-Lock. WASD/Pfeile laufen, Maus schaut, Shift rennt,
  E/Linksklick nimmt die anvisierte Hülle (Fadenkreuz), Leertaste springt, F schlägt, G wirft/hebt auf, M im Halte-Bild nimmt die Hülle mit (Tragen, siehe „Open World“),
  Esc/Lock-Verlust → Pause-Menü. Leertaste/F/G nur im Modus `play` abgefangen (in Menüs bleibt die Leertaste für Knöpfe), nur bei Pointer-Lock oder `dragLook`, `repeat` ignoriert; die Relock-Taste führt die Aktion nicht zusätzlich aus. ctx-Rückrufe von `desktop.js`: `onJump`, `onHit`, `onThrow`, `onCarry`, `onTake('click'|'key')`. Tasten nur während
  der Szene aktiv ist, im Capture-Listener mit `stopPropagation()` (Jellyfins globale Tastenkürzel dürfen nichts sehen),
  nie in `input`/`textarea`. Kein Kopfwippen, weiche Beschleunigung.
  Zoom: rechte Maustaste oder `Q` gehalten → `onZoom(2.6)`, loslassen → `onZoom(1)`; Maus-Empfindlichkeit wird durch den Zoom geteilt;
  Rechtsklick öffnet kein Kontextmenü. `StoreApp.setZoom(z)` (1..3) glättet (~0.12 s) und setzt `engine.setZoom` (FOV = Basis-FOV / Zoom); in Terminal/Intro/Couch/Pause wird auf 1 zurückgesetzt.
  Pointer-Lock: Chrome lehnt `requestPointerLock()` ~1 s nach Esc ab → `requestLock()` wartet bis `unlockAt + 1150 ms`, bei Fehler kurz nach Esc genau ein verzögerter Retry. Esc bei offenem Design-Wähler oder Profil-Popover der Hülle (`html.lfx-themepicker-open`/`lfx-popover-open`) gehört diesen Overlays und erreicht das Pause-Menü nicht. Esc im offenen Pause-Menü = „Weiter“ (Entprellung 300 ms nach dem Lock-Verlust, greift auch mit Fokus auf einem Knopf). Esc ist keine Nutzeraktivierung: scheitert der Lock (Fehler oder 400 ms Stille), bleibt der Modus `play`, der HUD zeigt „Klicken zum Weiterspielen“ und `relockArmed` lockt beim nächsten Klick **oder** der nächsten Nicht-Esc-Taste synchron im Handler. `dragLook` (Zieh-Modus) nur ohne `requestPointerLock` oder wenn der allererste Klick-Versuch der Sitzung scheitert.
- Touch-Schemata (ab v1.7.8, `TouchControls({ scheme })`, `setScheme()`, `SCHEMES = ['game', 'joystick', 'touch']`; Pause-Menü „Steuerung“ nur auf Touch als Dreier-Zyklus Spiel → Joystick → Touch,
  `deps.onPrefs` mit `touchControl`). App-Standard seit 1.15.0 `game` (Klassen-Standard von `TouchControls` bleibt `touch`, wegen der Tests). Speicherung/Migration (`features/store/prefs.js`): `touchControl` gilt nur zusammen mit `touchControlChosen = '1'` (setzt nur das Pause-Menü); gespeichertes `joystick` bleibt, `touch` nur mit Marker, alles andere `game`. Wer vorher bewusst „Touch“ gewählt hatte, fällt einmalig auf „Spiel“ zurück. Desktop zeigt statt der Touch-Hilfe die Tastenhilfe-Zeile `DESKTOP_HELP` (`ui/hud.js`); Touch-Hinweise am Ziel verlieren den Präfix „E / Klick:“ (`touchHint`, gilt für alle Touch-Schemata).
  - `game` (`controls/touch.js`, `ui/gamepad.js`, CSS `themes/store/gamepad.css`, Ebene 1 unter der HUD): schwebender Stick in der linken Zone (linke 45 % der Breite, untere 75 % der Höhe), Radius `max(48, 0,09 · min(innerWidth, innerHeight))`, Totzone 0,12, danach linear; Rennen ab Auslenkung ≥ 0,92 (Hysterese bis 0,8). Rechts Wischen = Umsehen (kein Halte-Timer, kein Umgreifen, Pinch-Zoom bleibt). Knöpfe unten rechts: Springen (74 px), Benutzen (58 px, hervorgehoben bei Ziel im Fadenkreuz), Schlagen (58 px; bei getragener Hülle ersetzt Werfen den Schlagen-Knopf); Auslösung bei `pointerdown`. Zielen läuft auch am Handy (Strahl aus der Bildmitte, alle 90 ms). ctx-Felder `onJump, onUse, onHit, onThrow`, `setAimed()`, `setCarrying()`. Tippen auf ein Cover geht wie bisher. Safe-Area per `env(safe-area-inset-*)`.
  - Menü „Touch-Steuerung …“ (Pause-Menü, nur Touch; Panel `.lfx-store-touchpick` mit den Klassen des Stimmen-Panels) mit: Steuerung Joystick/Touch, „Cover kippen“ (`holdInvertY`), „Cover drehen“ (`holdInvertX`), „Umschauen hoch/runter“ (`lookFlipY`), „Umschauen links/rechts“ (`lookFlipX`) je Normal/Umgekehrt, „Umgreifen“ (`touchRegrip` off/short/long = Aus/Kurz/Lang, nur bei Steuerung Touch), „Empfindlichkeit“ (`touchSens` low/normal/high = Faktor 0,7/1/1,4 auf Umschauen und Cover-Drehung). Prefs `lfx.store.<name>.<uid>`, `opts.touchTune`, Laufzeit-Setter `StoreApp.setTouchTune(teil)`, `deps.onPrefs` trägt alle Felder. **Standard** (nichts umgekehrt, Empfindlichkeit normal, Umgreifen kurz): „Umgekehrt“ ist ein reiner Vorzeichenwechsel relativ dazu. Umschauen „Normal“ (Flip aus) = Kamera-Konvention wie die Maus: Finger rechts → Blick rechts, Finger hoch → Blick hoch; Joystick rechts/oben → Blick rechts/oben. „Umgekehrt“ (Flip an) = „Szene greifen“ beim Wischen bzw. umgekehrter Stick (der früher als „Umgekehrt“ gespeicherte Wisch-Modus ist jetzt „Normal“; die alten Schlüssel `lookInvertY/X` werden nicht mehr gelesen, alle starten auf dem neuen Normal). `lookFlip*` wirkt auf Wischen und Joystick (`TouchControls` `ctx.getTune`), `holdInvert*`/Empfindlichkeit auf das Ziehen-Overlay der gehaltenen Hülle nur bei `pointerType === 'touch'` (Maus, VR unberührt). Kippen wirkt seit 1.11.1 um die feste X-Achse im Kamera-Rahmen (Euler `'XYZ'` in `holdview.js`), vorne wie hinten gleich (vorher `'YXZ'`: auf der Rückseite umgekehrt).
  - `joystick`: `ui/joypad.js` legt im Host `.lfx-store-pad` an (Ebene 3, eigene Pointer-Events, Multitouch):
    Gehen-Knopf `.lfx-store-pad-walk` unten links (gedrückt = `input.fwd = 1`, Zoom fällt auf 1),
    Joystick `.lfx-store-pad-stick` unten rechts (Totzone 0,12, quadratische Kurve, `shapeStick`). `touchCtl.tick(dt)` pro Frame
    im Laufmodus dreht den Blick: rechts = Blick rechts, oben = Blick oben (`STICK_YAW_RATE` 2,4 / `STICK_PITCH_RATE` 1,5 rad/s).
    Auf dem Canvas: Wischen = Umsehen, Tippen = nehmen, Pinch = Zoom; Halten startet kein Laufen. Pad nur bei `mode === 'play'`
    und ohne `mods.locked` (`showPad`), im Intro per CSS aus.
  - `touch`: wie unten beschrieben.
  - Hochformat-Hinweis (`ui/rotate.js`, nur `opts.phone`): Banner `.lfx-store-rotate` „Für die beste Ansicht das Handy quer
    drehen“ im Hochformat und Laufmodus; verschwindet im Querformat, kommt beim Zurückdrehen wieder, ✕ schließt ihn für den
    Besuch (nichts gespeichert).
- Touch (`controls/touch.js`, Schema `touch`): Finger gedrückt halten (> 220 ms, < 9 px Bewegung) → vorwärts in Blickrichtung laufen
  (`touchCtl.input = { fwd: 1 }`, Ring `.lfx-store-walkring` am Finger), Ziehen beim Halten lenkt. Bewegung > 9 px
  vor Ablauf → nur Umsehen (Richtung laut „Umschauen“, Standard Kamera-Konvention). Kurzes Tippen → `onTap`: Hülle/Objekt in Reichweite (≤ 3 m) nehmen/benutzen,
  weiter weg nur Hinweis (kein Auto-Pfad; `store.walkTo`, `approachCover`, `approachInteractable` und der Boden-Marker existieren nicht mehr, Module nutzen `ctx.player.walkTo` bzw. `runtime.walkTo`). Zwei Finger = Pinch-Zoom
  1..3 (`onZoom`), danach weder Laufen noch Umsehen/Tippen bis alle Finger oben sind; Zoom fällt beim nächsten Loslaufen auf 1.
  Umschauen (Wischen und Stick) wird durch `max(1, Zoom)` geteilt (wie die Maus in `desktop.js`).
  Umgreifen (`touchRegrip`, Standard `short` = 400 ms, `long` = 800 ms, `off`; `REGRIP_MS`): Lässt der laufende Finger in den äußeren 20 % der Breite (links/rechts) los, läuft `input.fwd` weiter bis `coastUntil` (Ring aus); ein neuer einzelner Finger in diesem Fenster läuft sofort weiter (keine 220 ms, kein Tap, Ring am neuen Finger). Abbruch bei zweitem Finger/Pinch, Moduswechsel, `reset()`, `detach()`, `setScheme()` (ein `pointercancel` am Rand, z. B. durch eine System-Geste, zählt wie Loslassen); Loslassen in der Bildmitte stoppt sofort. Zeitquelle `ctx.now()` (Standard `performance.now`).
  Canvas `touch-action:none`, `overscroll-behavior:none`. Hoch- und Querformat.

## Debug (`opts.debug`)

`instance.debug` und `window.__lfxStore`:
`teleport(x, z, yaw, y?, pitch?)`, `lookAt(itemId)`, `take(itemId)`, `put()`, `stats()` → `{ fps, frameMs, calls, triangles, textures, geometries, coverSegmentsLoaded, quality }`, `state()`, `zones()` → Liste benannter Orte mit Koordinaten (Eingang, Kasse, jede Abteilung …). Seit 1.15.0 zusätzlich `jump()`, `getNetState()`, `pose()`, `carried()`, `carry(id)`, `drop()`, `release()`, `restore(id)`, `use(name)` (Provider), `act('hit'|'throw'|'use', src?)`, `look(yaw, pitch)`, `spawns()`, `area()`, `city()`, `discover(cmd?)`, `palastTest(o)`; Übersicht siehe „Open World“ → „Harness und Debug“.

## Module (store3d intern)

Erweiterungen des 3D-Bundles (Kasse, Intro, Snack-Theke …) hängen sich als eigene Dateien in `src/js/store3d/modules/` ein; `store.js` bleibt unberührt.
Registry: `modules/index.js` (`export const MODULES = [...]`, Reihenfolge = Init-Reihenfolge, eine Zeile je Modul). Laufzeit: `modules/runtime.js`.

```js
export default { name: 'beispiel', init(ctx) { …; return { update(dt, t) {}, onSuspend() {}, onResume() {}, onQuality(level) {}, onSound(on) {}, dispose() {} }; } };
```
`init` darf ein Promise liefern (Boot wartet, Fortschritt 86–91 %). Fehler werden per `console.warn` geloggt und beenden die Szene nicht. Alle Handle-Methoden optional. Module importieren `three` selbst.

`ctx`:
- `scene, camera, renderer, layout, catalog, deps, opts, isPhone, isTouch`, `quality()` → `'low'|'mid'|'high'`, `soundOn()`.
- `layout.zones[id] = { id, label, x, z, yaw, rect:{x0,z0,x1,z1,y0?,y1?}, reserved? }`: Laden `entrance, register (+counter), cashier, reserve, returns, snack, tv, staff, window, window2, kids, adult, dept:<id>`; Stadt `store, street, sidewalkN, sidewalkS, road, crossing, sideN, sideS, doorway, theft, alley, yard, escape, roof, kiosk, palast, palastFoyer, palastHall, palastEntrance`. `rect.y0/y1` sind optional (Dach `y0 3,0`; Ladenzonen `y1 2,6`; `checkZones` liest `y0/y1`, nicht `yMin/yMax`). Jede Zone braucht `x/z/yaw/label` (sonst wirft `__lfxStore.zones()`). Reservierte Zonen sind frei von Regalen; Kollider legen die Module an.
- `layout.bounds` ist seit 1.15.0 die **Weltgrenze**, nicht mehr der Laden. Den Laden liefern `layout.zones.store.rect` bzw. `0..w × 0..d`.
- `addCollider(rect, { dynamic? })` / `moveCollider(rect, x0, z0, x1, z1, y0, y1)` / `removeCollider(rect)`: `rect = {x0,z0,x1,z1,kind?,y0?,y1?,top?}` (Höhen siehe „Kollision mit Höhen“); statisch wirkt auf Spielerkollision und A*-Raster (Neuaufbau im nächsten Frame, nur wenn `navBlocks(rect)`), `dynamic: true` liegt nur in `layout.dyn` und nie im Raster. Module im Laden ohne `y1` bekommen automatisch `y1 = layout.ceilH` (das Dach bleibt begehbar); eigene Welt-Kollider setzen `y1` selbst. Nie von Hand mutieren (Hash veraltet), immer `moveCollider`.
- `addInteractable({ box, label, hint, onUse, enabled?, anyHeight? })` → `remove()`; `box` = `THREE.Box3` oder `{min,max}` in Weltkoordinaten. Wie eine Hülle: Fadenkreuz-Hint (`label`/`hint`), E/Klick (Reichweite 2,5 m), Touch-Tippen läuft hin und ruft `onUse()`. Ohne `anyHeight` nur am Boden benutzbar (Füße ≤ 0,5 m). Verdeckende Wände zählen beim Anvisieren (`controls/pick.js`: `wallOccluders` nur `kind` `wall` und Gebäude; Requisiten, Regale, Tresen, Türen, Kisten und Autos (`NOT_WALL`) verdecken ihre eigene Box nie).
- `player.getPose()` → `{ x, z, yaw, pitch, y }`, `teleport(x,z,yaw,pitch?,y?)`, `walkTo(x,z,{face})` → `Promise<bool>` (`face` = yaw oder `{x,z}`), `lookAt(x,y,z,ms)` → `Promise`, `freeze(bool)`, `player.camera.flyTo(pos,target,ms)` → `Promise<bool>`, `player.camera.release()`; neu `jump()` → bool (in VR immer false), `knock({x,z,up}, strength = 1)` → bool (in VR wirkungslos), `eyeY()`, `getY()`, `isGrounded()`.
- `overlay.open(el, {onClose})` (hängt in host, gibt Pointer-Lock frei, Esc schließt, sperrt Spielereingabe), `overlay.close()`, `overlay.isOpen()`.
- `items.take(id, {from:'shelf'|'counter'})`, `items.slotOf(id)` → `{x,y,z,dept,face,run,stand}|null`, `items.highlight(id,on)`; Tragen: `items.carried()` → `{ id, item } | null`, `items.carry(id)` → bool (false in VR/unbekannt), `items.drop()` (zurück ins Regal), `items.release()` → `{ id, item, art, media } | null` (Werfen: Hand leer, Fach bleibt versteckt), `items.restore(id)` (Fach wieder sichtbar). (`setBadge` ist nicht umgesetzt.)
- `input.onAction(name, fn, { prio = 0 }) → off`; `name` = `'use' | 'hit' | 'throw'`, `fn(ev) → true` = verbraucht; `ev = { name, source: 'key'|'click'|'touch', aim, origin: Vector3, dir: Vector3 }` (bei `throw` zusätzlich `ev.carried`). Reihenfolge `prio` absteigend, dann Anmeldereihenfolge; erster `true`-Wert beendet, Ausnahmen blockieren die anderen nicht, danach `emit(name, ev, consumed)` als Beobachter.
- `on(event, fn)` → `off()`; Events `'enter'`, `'take'(id)`, `'put'(id)`, `'play'(item,{resume})`, `'zone'(zoneId)`, `'zoneExit'(zoneId)`, `'frame'(dt,t)`, `'xr'(on)`; neu `'hit'`/`'throw'(ev, consumed)`, `'jump'({x,y,z})`, `'land'({impact})`, `'carry'({ id } | { id: null })`, `'leave'` / `'return'` (Innenraum `zones.store` verlassen/betreten, Höhe zählt: Dach = draußen; Takt 200 ms, Erstbestimmung ohne Ereignis).
- `loadTexture(url,{maxWidth})` → `Promise<Texture|null>` (Queue ≤ 4, automatisch freigegeben), `track(obj)` → `obj` (dispose bei `dispose()`).
- `xr` (VR, siehe „VR-Modus (Beta)“): `presenting()`, `panel.open(spec)`, `toast(text, ms)`, `bubble()`, `exitThen(label, fn)`, `jumpTo(x, z, { face })`; Event `ctx.on('xr', (on) => …)`.
- `provide(name, impl)` → `remove()`, `use(name)`. Provider `terminal { open(q) }` (sonst Toast bei `instance.openTerminal`), `intro { run() → Promise }` (Boot ruft ihn nach dem ersten Bild, wenn `!opts.skipIntro`; danach Event `'enter'`). Weitere Provider (Stadt, Tür, Physik, Figuren, Richard, Kino, Entdeckungen …): Tabelle unten und „Open World (1.15.0)“. Fremde Provider immer erst bei Gebrauch und mit Guard holen (`ctx.use('x')?.…`).

### Couch / TV-Vollbild (`modules/tv.js`)

Interactable „Sofa“ (E / Klick / Touch-Tipp) setzt den Spieler vor den Röhren-TV. Ablauf: `player.freeze(true)`, `overlay.open` (Knopfleiste unten, CSS `themes/store/couch.css`), `camera.flyTo` zuerst auf die Sofamitte (Augenhöhe 1,0 m), dann nah vor den Schirm. Abstand: `couch-util.js` `fitDistance(fov, aspect)` – die engere Achse bestimmt (Querformat: Höhe 90 %, Hochformat: Breite 92 %); bei Resize/FOV-Änderung während des Sitzens fährt die Kamera kurz nach. Die Near-Plane (0,05) bleibt unverändert (Abstand ≥ 0,25 m, Wölbung 0,03 m).
- Schärfe: nur beim Sitzen läuft der Schirm mit eigener 960×720-Canvas-Textur (Backdrops mit `maxWidth 1280`, nur aktuelle + nächste Folie im Cache, Trailer als Letterbox mit 30 fps); beim Aufstehen wird sie samt Cache verworfen (zurück auf 320×240).
- Trailer: `pickCandidates` (Highlights + Zufallstitel, höchstens 12, nie Ab-18) → lazy per `deps.getItem` (`LocalTrailerCount > 0`) + `deps.loadTrailer`; „Nächster“ springt zum nächsten gefundenen Trailer (sonst nächste Diashow-Folie). Genau ein `<video>`-Element; die URL (api_key) wird nie geloggt.
- Ton: Hinsetzen/„Nächster“ sind die Nutzergeste (`muted=false` + `play()` im selben Call-Stack); schlägt Ton-Autoplay fehl, startet das Video stumm und „Ton an“ ist sichtbar. Lautstärke in `sessionStorage` (`lfx-store-tv-vol`). Provider `sound.duck('tv', on)` dämpft Ambiente/Effekte beim Sitzen. Beim Aufstehen ist das Video wieder stumm.
- „Diesen Film ansehen“: wie am Kassen-PC sofort aufstehen (ohne Rückfahrt) und `deps.play(item, { resume: false })` – dieselbe Rückkehr-Logik der Hülle.
- Aufräumen: `onSuspend` und `dispose` stehen sofort auf (Overlay zu, `freeze(false)`, Kamera zurück, Video entladen); `onQuality('low')` stoppt nur den Auto-Trailer, wenn man nicht sitzt (Sitzen geht auch bei `low`).
- Provider `couch { seated() }`; beim Hinsetzen/Aufstehen ruft das Modul `cashier.event('couchSit'|'couchStand')`.

### Kassierer Richard (`modules/cashier.js`, `cashier-lines.js`, `voice.js`)

- Sprechblase (Untertitel) + echte Stimme über `speechSynthesis`, wenn `soundOn()` und Abstand ≤ 10 m (weiter weg nur Blase; Lautstärke 1 unter 3 m, linear bis 0,5 bei 10 m). Während der Rede `sound.duck('talk')`, Mund (`mouth.scale.y`) flattert. Von sich aus höchstens alle 20 s (Limiter), Hörweite der Blase 16 m. Die `play`-Zeile ist nur Blase, Wiedergabestart bricht die Stimme ab; ebenso Ton aus, suspend, dispose.
- Online-Stimmen (ab v1.7.6, Pref `voiceOnline`, Standard aus, `localStorage lfx.store.voiceOnline.<uid>`, opts `voiceOnline`, `deps.onPrefs` mit `voiceOnline`): Pause-Menü-Knopf „Stimme: Gerät/Online“ (nur bei Ton an). Bei „Online“ wählt `pickVoice(voices, { online: true })` zuerst Online-Stimmen (männliche „Natural“ > andere „Natural“ > übrige, pitch 1,0) – Satz, Profilname und Titel gehen dann an den Stimmendienst des Browsers (Hinweis in der Diagnosezeile). Ohne Online-Stimme (z. B. iPhone) bleibt es bei der Gerätestimme. Umschalten: Hook `onVoiceOnline` → `voice.reselect()`; ctx `voiceOnline()`.
- `voice.js` (Hilfsdatei, kein Registry-Modul): `pickVoice(voices)` → `{ voice, pitch } | null` – **nur `localService === true`** (Online-Stimmen würden Profilname/Titel an Dritte senden), nur `de*`; männliche Namen zuerst (Markus, Martin, Stefan, Conrad, …, pitch 1,0), Novelty-Stimmen zuletzt, sonst irgendeine lokale deutsche mit pitch 0,8; keine → nur Blase. `createVoice({ soundOn, synth, Utterance })` → `{ say(text, { volume }) → Promise, cancel(), speaking, voiceName, unlock(), dispose() }`: `say` bricht ab und spricht einen Tick später (Chrome), hält die Utterance referenziert, Sicherheitstimeout `len×90+1500 ms`; Freischaltung (iOS, ab v1.7.5): nur `touchend`/`click`/`keydown` (nicht Escape, nicht `pointerdown`); `unlocked` erst nach `onstart`, bis dahin versucht jede Geste es erneut (nicht doppelt binnen 2 s), ohne Stimme bleibt es offen. Eine wartende Zeile (`setPending(text, { volume, onBegin, onEnd })`, ≤ 15 s alt, z. B. die Begrüßung vor dem ersten Klick) wird synchron als Freischalt-Äußerung gesprochen, sonst NBSP mit volume 0.01. `say()` spricht im Leerlauf synchron (ohne `cancel`/Timer), während einer Rede `cancel` + ein Tick. `diag` = `'unsupported'|'novoices'|'noLocalDe'|'locked'|'notStarted'|'error:<code>'|'ok'` (+ `voiceName`, `lang`, `onlineDe`); Provider `cashier.voiceInfo()`, Pause-Menü-Zeile `.lfx-store-pause-note` (Callback `getVoiceInfo`, Texte `voiceNote()` in `ui/pause.js`). Texte werden nie geloggt.
- Dialog „Mit Richard reden“ (Overlay `.lfx-store-tip.lfx-store-dialog`): Antwortknöpfe Lustiges/Gruseliges/Kinder/Neu/Überrasch mich/Weiterschauen/Tschüss – ein Knopf nur bei Kandidaten (`dialogPicks(catalog, deptOf)`, Ab-18 immer ausgeschlossen); Antwort mit „Zeig mal“ (`items.take(id, { from: 'counter' })`), „Was anderes“, „Tschüss“. Esc/Klick daneben schließt und bricht die Stimme ab.
- Streit, Hausverbot, Ausleihen und Diebstahlsicherung: siehe „Richard wehrt sich“ (Open World).
- Anlässe: Begrüßung (+ `intro` einmal pro Sitzung, `sessionStorage lfx.store.richardIntro`; bei Regen teils `rain`), `take`, `put`, `zone register`, langes Herumstehen, `adultLong` (> 30 s im Ab-18-Raum, einmal pro Aufenthalt), `kidsEnter` (höchstens alle 2 min), Couch hinsetzen/aufstehen.

### Vollbild und Safari-Leiste (`ui/fullscreen.js`)

- Pause-Menü „Vollbild“ nur auf Touch-Geräten (Callbacks `onFullscreen()`, `getFullscreen()`, `fullscreenKind()` → `'api'|'guide'|'none'`; bei `none` ausgeblendet). `api` (Android, iPad): Fullscreen-API am `documentElement`. `guide` (iPhone-Safari, nicht standalone): Panel `.lfx-store-fs-guide` mit Anleitung „Zum Home-Bildschirm → Als Web-App öffnen“. Standalone/Desktop: kein Knopf (Desktop: F11; Esc würde Vollbild und Pointer-Lock zugleich beenden).
- Wisch-Trick (experimentell, nur iPhone-Safari, nicht standalone, Querformat, Modus `play` ohne Modul-Sperre, Leiste sichtbar = `innerHeight < min(screen.w, screen.h) − 24`): `html.lfx-store-swipe` hebt `overflow:hidden` auf, `div.lfx-store-swipe-spacer` am `body` macht die Seite scrollbar, Overlay `.lfx-store-swipe-hint` am `body` („Nach oben wischen für Vollbild“). Erfolg = Leiste weg oder `scrollY > 0` → Overlay weg, Klasse/Spacer bleiben. Wiederanzeige höchstens 2× pro Sitzung (`sessionStorage lfx.store.swipeShown`), „×“ = für die Sitzung aus. Hochformat/suspend/dispose räumen alles ab (`scrollTo(0,0)`). Einmaliger Home-Bildschirm-Tipp per `hud.note` (`localStorage lfx.store.fsTip.<user>`).

### Provider und Module (Stand 1.15.0)

Reihenfolge in `MODULES` (`modules/index.js`; Provider müssen vor ihren Nutzern stehen, fremde Provider trotzdem erst bei Gebrauch holen): `sound, city, door, intro, daytime, props, throw, cashier, brawl, rent, snack, tv, npc, traffic, kiosk, palast, terminal, returns, reserve, staff, showcase, discover`. `city` stellt `areas`/`city` vor allen Nutzern bereit; `npc` → `traffic` → `kiosk` (Kiosk braucht `npc`); `palast` nach `city`; `discover` zuletzt (braucht Dachgruppe und Wetter).

| Provider | Form | Modul | Zweck |
|---|---|---|---|
| `terminal` | `{ open(q) }` | `modules/terminal.js` | Kassen-PC (Overlay mit Suche, Hinführen, „Über den Tresen“); `instance.openTerminal(q)` delegiert hierher, sonst Toast. Ergebnisse werden clientseitig mit `modules/search-rank.js` gerankt (exakt > beginnt mit > Wortanfang > enthält > Rest; Rest entfällt ab 5 Titeltreffern). Die Auswahl per Pfeiltasten (Fokus bleibt im Suchfeld) wird über eine eigene unsichtbare Live-Region (`role="status"`) angesagt. |
| `intro` | `{ run() → Promise }` | `modules/intro.js` | Rollladen-Intro von draußen; öffnet die echten Türflügel `lfx-door-left`/`lfx-door-right`. Läuft nur ohne `opts.skipIntro`/`restore`/`openItemId`/`openTerminal`. |
| `sound` | `{ play(name, opts), ambient(on), duck(key, on) }` | `modules/sound.js` | Web-Audio (synthetisch); folgt `onSound(on)` und `ctx.soundOn()`. Startwert `opts.sound` (Standard an); der Pause-Menü-Schalter ruft `setSound` → Module `onSound` + `deps.onPrefs`. `duck`: Set aktiver Schlüssel, stärkste Dämpfung gilt (`'tv'` ×0,12, `'talk'` ×0,45); `duck(bool)` = `duck('tv', bool)`. Lautlos-Schalter am iPhone wird respektiert (kein `navigator.audioSession`). |
| `cashier` | `{ event('couchSit'\|'couchStand'), voiceInfo(), richard() }` | `modules/cashier.js` | Kassierer Richard: erzwungene Zeile als Blase (auch über offenem Overlay); `richard()` = Hand für `brawl` (siehe „Richard wehrt sich“). |
| `couch` | `{ seated() }` | `modules/tv.js` | Solange man sitzt, spricht Richard nicht von sich aus. |
| `weather` | `{ tod: 'day'\|'dusk'\|'night', raining, hour?, lampsOn, sheltered(x, z, y) }` | `modules/daytime.js` | Tageszeit/Regen für Kulisse und Stimmung; andere Module lesen sie (`ctx.use('weather')`). `lampsOn` = nicht am Tag, `sheltered` = Laden, Palast, unter dem Vordach. |
| `areas` | `{ current(), at(x,z,y), on(fn(id, prev)) → off }` | `modules/city.js` | Bereich des Spielers (`areaAt`), Prüfung alle 0,15 s. |
| `city` | `{ data, groups, signals(), visible(), partition() }` | `modules/city.js` | Stadt, Ampeluhr, Sichtbarkeit; Details „Open World“. |
| `door` | `{ override(v\|null), open(sec), lock(sec)/unlock()/isLocked(), registerActor(fn) → remove, amount(), onChange(fn) → off }` | `modules/door.js` | Automatiktür samt Hausverbot-Sperre. |
| `physics` | `{ spawn, hitTest, bodiesNear, count, pickable, hold, launch, hoopState, … }` | `modules/props.js` | Objekte, Werfen, Korb. |
| `npc` | `{ figure, staff, nearestPerson, people, registerPerson, say, scare }` | `modules/npc.js` | Passanten, Personal, Tiere. |
| `traffic` | `{ zebraClear(edge), cars(), parked() }` | `modules/traffic.js` | Autos. |
| `brawl` | `{ state(), isBanned(), canTalk(), hitBy(source, dir?), getNetState(), applyRemote(net) }` | `modules/brawl.js` | Richards Streit. |
| `rent` | `{ isRented(id), rent(id), tryRent() }` | `modules/rent.js` | Ausleihen, Diebstahlsicherung. |
| `discover` | `{ found(id, {silent?}), has, list, summary, onChange, getNetState, reset }` | `modules/discover.js` | Entdeckungen. |
| `cinema2d` | `PalastCinema` (`app.cinema2d`, registriert vom `StoreApp`) | `cinema/palast.js` | 2D-Kino im Palast. |
| `palast` | `{ plan, stations, hall, foyer, program(), ticket(), ticketBook, nowMin(), openSelection(), sit(seatId), test(o), clockText() }` | `modules/palast.js` | Programm, Kasse, Tickets, Saal. |
| `ctx.xr` (kein Provider) | `{ presenting(), panel.open(spec), toast, bubble(), exitThen, jumpTo }` + Event `'xr'` | `modules/runtime.js` → `xr/mode.js` | VR-Zugang der Module. Dazu ab v1.8.0: `instance.isXr()`/`leaveCinema(reason)`, `deps.onXr`/`deps.cinema`, `opts.vr`. Fehlt `app.xr` (Test-`fakeApp`), liefert `presenting()` false. |

Benannte Szenenobjekte (Module greifen per `scene.getObjectByName`): `lfx-door` (Gruppe), `lfx-door-left`, `lfx-door-right` (Pivot am Scharnier, Rotation um y; Kinder `lfx-door-frame`, `lfx-door-glass`), `lfx-backdrop` und `lfx-street` (alte Nachtkulisse, wird von `modules/outdoor.js` ausgeblendet). Der Kassen-PC steht in `layout.pc` (`build-props.js` und `terminal.js` lesen dieselbe Position).

Zonen: `layout.zones[id]` hat Objektposition `x, z, yaw` und optional `view = { x, z, yaw }` (Blickpunkt, von dem man auf das Objekt schaut, nie hinter dem Tresen). `__lfxStore.zones()` liefert `x/z/yaw` = Blickpunkt und `obj` = Objektposition.

Debug (nur bei `opts.debug`, nie im Produktivbetrieb):
- `window.__lfxStore` (`teleport, lookAt, take, put, stats, state, zones`; `stats()` zusätzlich `programs, tickMs, renderMs`; `stats().xr` = `{ supported, presenting, inCinema, phase, videoFrames, visibility, … }`, `__lfxStore.xr` = der `XrMode`, siehe „VR-Modus (Beta)“).
- `window.__lfxStore.m3.<modul>` (terminal, returns, reserve, staff, showcase) – wird beim Event `'enter'` gesetzt (`modules/m3-debug.js`).
- `window.__lfxM4` (`scene, outdoor, ctx, say, tip, voice(), sound(), intro()`) – von `daytime`, `cashier`, `sound`, `intro` gesetzt. Dev-Harness-Parameter: `?hour=23&rain=0|1&intro=1&sound=0`.

## Open World (1.15.0)

Der Laden steht in einer kleinen Stadt; man verlässt ihn durch die Tür, springt, schlägt, wirft und trägt Hüllen. Reine Logik liegt ohne `three` in `world/city.js`, `nav/collide.js`, `controls/body.js`, `physics/*`, `palast/{program,choice,plan}.js`, `npc/*-logic.js` und `discover/{catalog,storage,gaze}.js` (getestet, JSON-sicher, deterministisch, kein `Math.random`); Meshes in `world/build-city*.js`, `palast/hall.js` u. a. Module hängen sich wie bisher per Registry ein (`store.js` bleibt dünn). Alles prozedural, nur erfundene Namen (Läden, Filme, Plakate).

### Koordinaten und Stadt (`world/city.js`, `build-city.js`, `build-city-decor.js`, `build-facade.js`)

x Osten, z Süden, y oben. Der Laden steht bei `x 0..W`, `z 0..D` (Eingang in der Südwand, `z = D`). `buildLayout` ruft `buildCity({ w, d, door })` und hängt das Ergebnis als `layout.city` an; `layout.colliders` bekommt `city.colliders`, `layout.zones` die City-Zonen.

| Name (`cityFrame(W, D)`) | Wert |
|---|---|
| Gebäudefront Nordzeile `fz` | `D + 0,21` |
| Gehweg Nord / Fahrbahn / Gehweg Süd | `z D..D+2,6` / `D+2,75..D+8,5` / `D+8,5..D+10,7` |
| Front Südzeile = Palast `sz` | `D + 10,7` |
| Querstraße (Ost) | `x W+14..W+19` (Seitengehwege je 2,4 m) |
| Welt (Gebäude) / `bounds` (Nav + Weltgrenze) | `x −26..W+33,4`, `z −12,5..D+32` / `x −27..W+34,4`, `z −13,5..D+33` |
| Fahrspuren (Rechtsverkehr) | Westfahrt `D+4,325`, Ostfahrt `D+6,925`, Seitenstraße `x = xc0+1,25` (Süd) / `xc1−1,25` (Nord) |
| Palast | Breite `PW = clamp(round((W+4)·2)/2, 20, 28)`, mittig zu `W/2`; Tiefe `sz .. sz+19,75` |

Weltgröße bei W = 12,5, D = 18 rund 72 × 71 m. `layout.bounds` ist die **Weltgrenze**, der Laden steht in `layout.zones.store.rect`. Dazu `layout.navCell` (0,25 m, bei > 160 000 Zellen 0,5 m), `layout.doorBlock`, `layout.facade = { door, windows }` (schon bei `buildLayout`); `rebuildNav(layout)` baut Raster und Hash aus `bounds`/`navCell`.

`buildCity`-Schema (kompakt):
- `buildings[]` `{ id, x0, z0, x1, z1, h, region, color, front }` (Quader, zugleich Kollider `kind:'building'`); `colliders[]`, `zones{}`, `bounds`, `frame`, `signalCycle`.
- `palast`: Hülle als Daten (`rect`, `wall` 0,25, `h` 8,5, Tür 3 m bei `W/2`, `foyer` (Decke 4), `hall` (Decke 7,5), `hallDoors[2]`, `screen`, `seatBlock`, `canopy`, `posterSlots[4]`, `sign`, optional `staff.ticket|popcorn = { x, z, yaw }`). Das Vordach ist bewusst nicht begehbar.
- `spawns`: `shop, street, palast, yard, kiosk, alley, roof` (nur `roof` mit `y 3,3`).
- `sidewalkPaths[]` `{ id, pts, waits }` (`waits[i]` ∈ `null|'main'|'side'|'mid'` für Strecke `i→i+1`): `walkN, walkS, crossW, crossE, crossMid`, Stichleitungen `shopDoor, palastDoor, alleyMouth, kioskFront`. Passanten laufen nie per A*; Fußwege liegen mindestens 0,45 m neben festen Dingen.
- `lanes[]` (`mainW, mainE, sideS, sideN`: `{ dir, z|x, from, to, speed, stop:{ at, axis, signal }, yields }`): Autos sind rein kinematisch und **keine** Rasterkollider. Außerdem `zebras`, `signals` (Ampelmasten), `lights` (Laternen), `signs` (nur „LENZ PALAST“, „KIOSK“, „HINTERHOF“, „LENZSTRASSE“, „BAHNWEG“), `shopFronts[]` (sieben erfundene Läden), `litfass`, `discoverSlots`, `propSlots` (`ball|crate|can|cone|box`), `kiosk { hut, counter, vendor, awning, table }`, `yard { …, hoop, graffiti, laundry }`, `escape` (Feuertreppe), `roof { …, y 3,3, gate }`, `doorPosts[2]`, `doorBlock`.
- Rein: `signalAt(t)` (Ampel, Zyklus 24 s: main grün [0; 10), gelb [10; 11,5); side grün [12; 18,5), gelb [18,5; 20); nie beide grün; dazu `walkMain`/`walkSide`), `areaAt(layout, x, z, y)` → `roof, escape, palastHall, palastFoyer, shop, doorway, yard, alley, kiosk, palastEntrance, crossing, sideN, sideS, street, outside` (`AREAS`; Regen fällt in `OUTDOOR_AREAS`), `visibleGroups`, `resolveRestore`, `standSurfaces`.

Modul `city` (`modules/city.js`, nach `sound`): baut dauerhaft Fassade (`buildFacade(out, { shutter })` → `{ group, setShutter, dropShutter, flicker, … }`; das Intro nutzt nur `setShutter(1)`/`dropShutter()`, nie `dispose()`), Stadt, Nebel und die Provider `areas`/`city`. Gruppen in `out.group`: `city-street`, `city-palast` (Hülle), `city-yard` (Hof, Gasse, Feuertreppe, Dach, Außenhaut des Ladens), `city-palast-interior`. Tageszeit über `out.hooks` (Neon-Flackern nur nachts und ohne `prefers-reduced-motion`, deterministisch).

Tür (`modules/door.js`): Auto-Öffnen, wenn Spieler oder Akteur in `x ∈ [door.x0 − 0,6; door.x1 + 0,6]`, `z ∈ [D − 0,9; D + 1,8]` steht (der Spawn bei `D − 1,4` löst nichts aus); `OPEN_SPEED` 4/s, `CLOSE_SPEED` 1,8/s; Türglocke nur beim Durchschreiten von außen nach innen. `lock(sec)` setzt `layout.doorBlock` per `ctx.addCollider` (ein `rebuildNav`) und blendet das Schild „GESCHLOSSEN“ ein; `sec ≤ 0` = bis `unlock()`. Das Modul besitzt die Türflügel-Materialien dauerhaft.

### Kollision mit Höhen und Bewegung (`nav/collide.js`, `controls/body.js`, `controls/player.js`)

Kollider: `{ x0, z0, x1, z1, kind?, y0 = 0, y1 = Infinity, top?, dynamic? }`. Fehlende Höhe = blockiert immer (alle alten Kollider, bitgleich zur 2D-Bewegung). `top: false` (nur bei endlichem `y1`) = Oberseite nicht begehbar (Zaun, Wand, Regal). `dynamic: true` = beweglich (Auto, Passant): nicht im Raster oder Hash, liegt in `layout.dyn` und wird linear geprüft (erwartet unter 40). Dächer sind Platten `y0 3,0 / y1 3,2–3,3`, ein Tresen zum Daraufstehen bekommt `y1 1,05`. `src` aller Funktionen: Kolliderliste, Index (`createColliderIndex`) oder `{ index, dyn }`; Besitzer `layout.cidx`, `layout.dyn`, `layout.colliders`.

| Konstante (aus `nav/collide.js` importieren, nie eigene Zahlen) | Wert | Bedeutung |
|---|---|---|
| `STEP_H` | 0,35 | Stufenhöhe: Kanten bis hier ohne Sprung |
| `BODY_H` / `RADIUS` / `FOOT_R` | 1,7 / 0,28 / 0,15 | Körperhöhe, Körper-, Fußradius |
| `MANTLE_H` | 1,3 | max. Hochziehhöhe (Kante höchstens so weit über den Füßen, in der Luft gemessen; aus dem Stand ca. 2,3 m Reichweite) |
| `GRAV` / `JUMP_V` / `VY_MIN` | 20 / 6,3 / −30 | m/s², Absprung (Scheitel 0,99 m, Hangzeit ca. 0,63 s), Terminalgeschwindigkeit |
| `COYOTE` / `JUMP_BUF` | 0,10 / 0,12 s | Sprung nach Kantenverlassen / gemerkter Sprungwunsch |
| `AIR_K` / `MANTLE_T` | 3 / 0,28 s | Horizontalglättung in der Luft / Hochziehdauer |

Funktionen: `colliderBlocks`, `navBlocks(q)` (Bodenhindernis fürs Raster: `y0 < STEP_H && y1 > STEP_H`; Dach, Brücke, dynamic nein), `resolveCircle3(x, z, r, src, feetY, bodyH) → { x, z, hit, rect, mantle }`, `groundHeight(x, z, r, feetY, src) → { y, rect }` (kein Boden unter 0), `ceilingY`, `findMantle` (Ziel 0,32 m hinter der Kante, nur wenn frei), `createColliderIndex(rects, cell = 4)` (`query/add/remove/update/has/rebuild`; `add` ignoriert `dynamic`).

`Body` (`controls/body.js`, rein, von Player, Richard und Figuren geteilt): `step(dt, intent)` (Substeps `min(5, ceil(dt/0,02))`; Reihenfolge: Timer, Horizontalgeschwindigkeit, Sprung, Vertikal, Horizontalbewegung, Abgrund `y < −6` → `respawn()`, Boden, Decke, Hochziehen, sicherer Punkt alle 0,5 s), `stepVertical(dt)` (VR), `jump()`, `knock({ x, z, up }, strength)` (4 m/s · strength, klingt mit exp(−6 t) ab, bricht Pfade ab), `swing()`, `place/settle/respawn`; Rückrufe `onJump/onLand/onMantle`. Mantle: in der Luft, Eingabe Richtung Kante, danach 0,25 s Sperre. Netzzustand (Vorbereitung 1.16.0): `getNetState()` = `{ x, y, z, yaw, pitch, vx, vy, vz, a, h }` (`a`: 0 steht, 1 geht, 2 rennt, 3 Luft, 4 Knock, 5 Mantle, 6 Schlag), `applyRemote(s, now)` (Remote-Körper, 100 ms Verzögerung).

`Player extends Body`: `state` bleibt `{ x, z, yaw, pitch }` (sessionStorage), `pose` = `{ x, y, z, yaw, pitch, vy, grounded }`; Augenhöhe `eyeY()` (Boden + 1,65 m plus Landungs-Wippen und Stufenglättung); `teleport(x, z, yaw, pitch, y)` (ohne `y` auf den Boden); `update(dt, input)` (`input` null = nur Physik: Schwerkraft läuft auch bei eingefrorenem Spieler); Pfade nur am Boden, Sprung/Knock/Mantle brechen sie ab. Bei `prefers-reduced-motion` kein Wackeln, Wippen, keine Stufenglättung (Stoß-Impulse bleiben).

### Eingabe der Open World

| Desktop | Aktion |
|---|---|
| WASD/Pfeile, Shift | laufen, rennen |
| Leertaste | springen (nur im Modus `play`) |
| E / Linksklick | Benutzen/Nehmen des Ziels; Linksklick ohne Ziel = Schlag |
| F / G | Schlagen (`hit`) / Werfen (`throw`: getragene Hülle werfen, sonst Ding aufheben (1. G) und werfen (2. G)) |
| M im Halte-Bild | Mitnehmen |
| Q / rechte Maustaste, Esc | Zoom, Pause-Menü |

Touch-Schema `game` (Standard), Migration und Pause-Menü: siehe „Eingabe“. `use`-Reihenfolge (`StoreApp.doUse(src)`): 1. Ziel im Fadenkreuz bzw. Zielstrahl gewinnt immer (Hülle nehmen, Interaktion `onUse`; ohne `anyHeight` nur bei Füßen ≤ 0,5 m); 2. sonst `onAction('use')`-Handler; 3. sonst getragene Hülle wieder öffnen (nur `key`/`touch`); 4. nur `click`: ein Schlag. `doUse/doHit/doThrow/doJump` laufen nur im Modus `play`, ohne Modul-Sperre und nie in VR (`canAct()`). Handler-Prioritäten (`hit`): Richard 30, Passanten 20, Physik 10.

### Tragen („Mitnehmen“)

- Im Halte-Bild Knopf „Mitnehmen“ (Taste M): Die Hülle kommt als kleines Modell unten rechts in die Hand (`ui/hands.js`), der Modus ist `play`, das Regalfach bleibt leer. Kein `put`-Ereignis, sondern `carry { id }`.
- „Benutzen“ ohne Ziel (E, Touch-Knopf) öffnet die getragene Hülle wieder; „Zurückstellen“ legt sie ins Regal (`carry { id: null }`). In den Tipp-Schemata `touch`/`joystick` öffnet ein Tipp unten rechts (x > 62 %, y > 60 %) die Hülle. `take(id)` der getragenen Hülle öffnet sie wieder (kein Doppel-Halten).
- API: `StoreApp.carry(id)`, `drop()`, `openCarried()`, `returnCarried()`, `getCarried()`, `releaseCarried()` (Werfen: Hand leer, Fach bleibt versteckt, Eintrag in `app.released`), `restoreReleased(id)`; `HoldView.carryOut()`/`releaseForCarry()`. Falle: `findSlot` überspringt versteckte Fächer, deshalb `released`.
- Randfälle: `take`/`carry` einer anderen Hülle legt die getragene zuerst zurück; `drop()` bei Hülle ohne Regalplatz (Theke) nimmt sie nur aus der Hand; VR-Start legt sie zurück (`onXrHold`); bei `suspend()` bleibt das Tragen; `getState().heldId` bleibt beim Tragen null.

### ctx-API-Erweiterungen

Siehe „Module (store3d intern)“: `addCollider(rect, { dynamic })`, `moveCollider`, `removeCollider`, `addInteractable({ anyHeight })`, `input.onAction`, `player.jump/knock/eyeY/getY/isGrounded`, `getPose().y`, `teleport(…, y)`, `items.carried/carry/drop/release/restore`, Ereignisse `hit, throw, jump, land, carry, zoneExit, leave, return, xr`. In VR liefern `jump()`/`knock()`/`carry()` false.

### LENZ PALAST und 2D-Kino

**Gebäude und Programm.** Hülle, Maße und Anker kommen aus `city.palast`; den Innenausbau besitzt das Modul `palast` (`modules/palast.js`).
- `palast/program.js` (rein): `buildProgram(catalog, dayKey)` → `{ dayKey, shows[{ slot, time, minutes, tag, line, itemId, title, year, runtimeMin, resume }], footer }`. Nur `Type === 'Movie'`, nie Ab-18; Sortierung nach Id (Seed = FNV-1a von `palast|<Tag>`), Platz 1 = erster Weiterschauen-Film (`resume: true`); vier Zeiten 15:30/18:00/20:15/22:45 (`SLOTS`), bei weniger Filmen die späteren. Hilfen `dayKeyOf`, `minutesOf`, `clockText`, `highlightIndex`, `showState`.
- `palast/choice.js` (rein): `createTicketBook()` (`get/has/buyShow/handIn/clear/onChange`, `getNetState()`/`applyRemote()` für 1.16), `tapeOf`, `showRows` (laufend: „läuft schon – du startest von vorn“; vorbei: „läuft gerade nicht – startet für dich von vorn“), `seatGate`, `ticketText/ticketToast/tearLine`.
- `palast/plan.js` (rein): `buildPlan(city.palast)` → Stufen/Ränge/Sitzblöcke als Kollider mit Höhe, `seats[{ id, x, y, z, yaw, row, base }]`, `aisle`, `bounds`, `screen`, `curtain`, `stations`, `posters`; `stationsOf(p)`, `outerPosterSlots(p)`. Saal: 6 Reihen à 1,1 m, `rise = min(seatBlock.rise, 0,14)` (Stufen ≤ 0,28 m am Eingang), Reihe 0 hinten am höchsten, `aisle` auf Bodenhöhe vor der ersten Reihe. Leinwand `radius 16, bottom 1,8, maxW 10,5, maxH 4,9` (Oberkante 7,3 m unter der Decke 7,5 m), Anker `rotation.y = π`. Weitere Dateien: `hall.js` (Saal, liefert das `saal`-Handle, Sitze instanziert), `foyer.js`, `board.js`, `panel.js` (Kassen-Overlay, DOM, CSS in `themes/store/palast.css`).
- Provider `palast`: `stations` (Weltkoordinaten `ticket`, `popcornStaff`, Tresen `kasse/popcorn/ticketDesk`), `test({ item?, autostart? })`; die Personal-Figuren platziert `npc` selbst über `stationsOf`.
- **Ablauf:** Kasse/Anzeigetafel/Plakat → Overlay `.lfx-store-palast-pick` (Programm; „Eigene Kassette abgeben“, wenn `ctx.items.carried()`) → Ticket → Hinsetzen (`Platz <Reihe><Nr>`, Interaktionen nur im Saal, `anyHeight`) → `cinema2d.sit(id)` + `cinema2d.play(item, { resume })`. Ohne Ticket: Toast „Erst ein Ticket an der Kasse holen“. Kartenabreißer: mit Hülle in der Hand Kassette abgeben (danach `ctx.items.drop()`), sonst Spruch. Das Ticket verfällt, wenn das Kino endet. In VR gibt das Foyer nur einen Toast; Hinsetzen ruft direkt `deps.play` (VR-Kino), keine 2D-Leinwand. Der Saal wird nur in Foyer/Saal (oder VR) gezeichnet. Entdeckungen `palast-film` beim ersten `playing`, `palast-tape` bei mitgebrachter Kassette.

**Kino-Kern** (`cinema/`, VR und 2D teilen sich diese Teile): `startwatch.js` (Start-Watchdog als reine Zustandsmaschine; `WATCH` { `NO_VIDEO_MS` 25000, `STALL_MS` 15000, `MAX_START_MS` 60000, `PREPARE_MS` 8000, `PAUSED_HOLD_MS` 1500, `SLOW_START_MS` 3000 }; `createStartWatch(cfg)` → `{ reset, step, shiftClock, marks, … }`, `step()` liefert unabhängige Felder `{ event: null|'start'|'pausedStart'|'fail', code?, paused?, slow, prepare }`), `feed.js` (`createFeed`, Takt 250/200/100 ms), `failcodes.js` (`FAIL`, `failToast`), `controls.js` (`stepVolume`, `applyVolumeStep`), `ambient.js` (`trackBlack`, `BLACK` { `MIN_VIDEO_S` 6, `WINDOW_MS` 90000 }, Abtaster `.tainted`), `screen.js` (`createScreen({ radius, bottom, maxW, maxH, padW, padH })`, Standard = VR-Maße). `engine.setRenderEnabled(on)` überspringt nur `renderer.render` (`tick` läuft weiter: Bridge-Polling, Watchdog).

**`PalastCinema` (`cinema/palast.js`, `app.cinema2d`, Provider `cinema2d`).** Die Leinwand ist Teil der **Weltszene** (`saal.anchor.add(screen.group)`), kein eigener Saal, kein `setScene`. Der Spieler sitzt per Kamerafahrt (Couch-Muster), die Bedienleiste (`bar2d.js`) ist ein DOM-Overlay (`ctx.overlay.open`, Modus `overlay`). Während des Films liegt die Bühne sichtbar über Jellyfins Player (`#/video`).

```js
saal = {
  anchor: Object3D,   // Weltposition/-rotation der Leinwand, lokales +z zeigt zum Publikum
  screenOpts: { radius, bottom, maxW, maxH, padW?, padH? },
  seats: [{ id, x, y, z, yaw }],   // y = Augenhöhe sitzend
  aisle: { x, z, yaw },            // Aufsteh-Punkt, MUSS in bounds liegen (sonst „Saal verlassen“ sofort)
  bounds: { x0, z0, x1, z1 },      // stehend außerhalb bei aktivem Kino (nicht sitzend, nicht Vollbild) = stopAndRelease() im tick
  curtain?(open, instant), light?(k), spill?({ r, g, b }, k), dispose?()
}
```

| Aufruf | Verhalten |
|---|---|
| `attachSaal(saal)` → Abmelder / `detachSaal()` | Saal an-/abmelden (Abmelden beendet ein laufendes Kino) |
| `wantsPlay()` | true, wenn Saal da, keine XR-Sitzung und (Kino aktiv oder Spieler in `bounds`) |
| `sit(seatId?)` | Spieler einfrieren, Pose merken, Leiste, Kamerafahrt, Ton dämpfen; ohne Id der nächste Sitz; false ohne Saal/Sitz oder bei offenem Overlay |
| `beforePlay(item)` / `play(item, o)` | Start über `app.deps.play`; der `wrapDeps`-Zweig ruft vorher `beforePlay` (Lauf aufsetzen, Leinwand bauen, sitzen, `deps.onCinema2d({ active: true, full: false })`) und reicht `noCover: true` weiter; `beforePlay` false bei Bau-Fehler (B) → normaler 2D-Weg |
| `stand({ pause = true })` | Aufstehen: pausiert nach frischem Bridge-Zustand `playing` (auch bei Esc), Overlay zu, Kamera frei, Spieler an `aisle`; `active` bleibt wahr; Wiederhinsetzen per `sit()` (Interaktion am Sitz) |
| `stopAndRelease()` | Saal verlassen: `bridge.stop()`, dann `leave('stop')`; läuft der Start noch ohne Player, vorgemerkt (`backPending`) |
| `setFull(on, { notice })` | Vollbild (Bühne ausblenden), meldet `{ active, full }`, `engine.setRenderEnabled(!on)`, Desktop-Steuerung ab/an |
| `leave(reason, code)` | `home, stop, fail, suspend, dispose, saal, build`; idempotent; räumt Leinwand/Untertitel/Ambient/Leiste/Wächter, Spieler an `aisle`, Toast („Film beendet“, „Abspann vorbei“, „Kino konnte nicht starten (Code)“) |
| `tick(dt, now)`, `diag()`, `getNetState()`/`applyRemote()` | `tick` aus `StoreApp.tick` (nur aktiv, nicht in XR); `diag()` = `{ phase, active, full, seated, failCode, fallbackCode, videoFrames, marks, renderEnabled }`; Netzform für 1.16 (`applyRemote` Platzhalter) |

Phasen: `idle → starting → playing ⇄ paused`; `fallback` (Vollbild-Rückfall), `failed` (Statusbild, dann `leave('fail')`). Nicht behandelt: ein XR-Start bei laufendem 2D-Kino.

**Vollbild und „Zurück ins Kino“.** `deps.onCinema2d({ active, full })` setzt in der Hülle `palast`, die `<html>`-Klassen `lfx-store-palast` (Bühne auf z-index 1240) und `lfx-store-palast-full` (Bühne `visibility:hidden; pointer-events:none`, nie `display:none`, das `<video>` bleibt im Spiel), aktiviert die Bridge (nie während `xr.cinema`) und zeigt bei `full` den Knopf „Zurück ins Kino“ (`features/store/palast-back.js`, `position:fixed`, oben mittig, z-index 1260, `is-idle` nach 3 s, `onBack` = `instance.cinema2dSetFull(false)`). `.dialogContainer` im Kino `opacity:0` (nicht `visibility`, sonst erkennt die Bridge Fehlerdialoge nicht), im Vollbild normal. `deps.play(item, { resume, noCover })`: `noCover` geht nur bei `true` an `core/playback.js` und überspringt dort `showCover`/`allowCoverRoute` (`lfx:play` feuert weiter); der Standardaufruf bleibt bitgleich.

**Tastenwächter (`cinema/keyguard.js`).** Aktiv, solange das Kino `active` und nicht im Vollbild ist (auch im Stehen): Capture-Listener am `window` für `keydown/keyup/keypress`, `stopPropagation` für alles außer Strg/Alt/Meta, F1–F12, Tab, Eingabefelder; `preventDefault` nur für belegte Tasten. Sitzend: Leertaste/K Pause, J/← −10 s, L/→ +30 s, ↑/↓ Lautstärke (`stepVolume`), M Stumm, F Vollbild. Esc ist nicht belegt (`desktop.js` → `overlayClose` → Aufstehen). Space-`keyup` wird entschärft (Firefox), Wiederholungen schalten nicht mehrfach (nur die Lautstärke).

**Vollbild-Falle (Desktop-Steuerung).** Im Vollbild bleibt der Modus `overlay`; `desktop.js` würde Esc/WASD vor Jellyfin schlucken und Esc „Aufstehen“ bei unsichtbarer Bühne auslösen. Deshalb ruft der Adapter bei `setFull(true)` `app.desktop.detach()` und bei Rückkehr/`leave()` `attach()` (wenn nicht suspendiert); `desktop.js` bleibt unangetastet.

**Fehler und Rückfall (2D, Codes P/T1/T2/D/B wie im VR-Kino).**

| Auslöser | Verhalten |
|---|---|
| `deps.play` false/Ablehnung | `leave('fail', 'P')` (Zweig in `xr/guard.js`) |
| T1 (kein `<video>` nach 25 s) | Route `video`: Rückfall Vollbild („Leinwand nicht verfügbar (T1)“); sonst Statusbild, `bridge.stop()`, nach 1,8 s `leave('fail', 'T1')` |
| T2 / D (Stillstand, Fehlerdialog) | Rückfall Vollbild mit Hinweis; Jellyfin zeigt seinen eigenen Fehler, „Zurück ins Kino“ bleibt |
| B (Bau-Fehler) | `leave('build', 'B')`, normaler 2D-Weg |
| Schwarze Leinwand | `trackBlack` (6 s Videozeit exakt 0, nur in den ersten 90 s, einmal je Lauf) oder Abtaster `tainted`: Vollbild „Leinwand nicht verfügbar“, danach nie wieder (kein Pendeln) |
| Route `home` (Zurück, Filmende) | `leave('home')`; die Hülle ruft dasselbe beim Mount über `instance.leaveCinema('home')` |

### Richard wehrt sich (`modules/brawl.js`, `brawl-fsm.js`, `brawl-logic.js`, `brawl-pose.js`, `rent.js`)

Zustandsautomat (`brawl-fsm.js`, Zeit injiziert in Sekunden): `calm → annoyed (1. Treffer) → shove (2.) → throw (3.) → chase → banned → grudge → calm`.

| Konstante `BRAWL` | Wert |
|---|---|
| `HIT_GAP` | 0,45 s (zwei Treffer im selben Augenblick zählen einmal) |
| `DECAY` | 25 s (annoyed/shove → calm) |
| `THROW_MAX` / `CHASE_MAX` | 9 s / 45 s (danach `grudge` ohne Hausverbot) |
| `BAN` / `GRUDGE` | 30 s / 600 s |

Treffer in `throw/chase/banned` zählen nicht, in `grudge` springt Richard sofort auf `chase`. Ereignisse `throwDone`, `expelled` (Spieler hat `zones.store` verlassen), `giveUp`. Netzformat `getNetState(t)` = `{ v: 1, s, h, r }`, der Modul-Provider ergänzt Ort und Animationsindex.
- Schlag: `onAction('hit', …, { prio: 30 })`, Kegel ±25° horizontal, 1,6 m (+0,25 Körperradius), senkrecht ±50°, Ziel Brustmitte; verbraucht auch über den Tresen, nicht in `banned`, nie in VR.
- Reaktionen: annoyed taumelt und wird rot (`hit1`); shove schubst per `ctx.player.knock` (nur < 2,8 m); throw: Sterne (nicht bei `prefers-reduced-motion`), 3 Kassettenwürfe im Abstand 1,4 s über `physics.spawn({ kind: 'tape', owner: 'richard', … })`, `onHit` mit `player: true` → `knock` + `throwHit`; zusätzlich werden Kassetten mit Physikkörper gegen die Spielerpose geprüft (horizontal < 0,75 m, vertikal < 0,9 m), weil die Physik einen stehenden Spieler nicht meldet; chase: Sprung über den Tresen (Skript-Bogen 0,85 s, Scheitel 1,45 m), dann A* (`findPath`, Neuplanung alle 0,4 s, 4 m/s), schubst bei < 1,1 m alle 0,8 s Richtung Tür; steht der Spieler im Pen (hinter dem Tresen), wartet Richard auf der Kundenseite. Richard verlässt den Laden nie.
- banned: `door.lock(32)` (der Automat entsperrt nach 30 s selbst), Schild „HAUSVERBOT“ (Canvas, `y 1,12` außen an der Tür; Schrift per `measureText` eingepasst), DOM-Countdown `.lfx-store-banhud` (unten, `bottom: 24 %`), Richard steht hinter der Glastür bei `(doorCx, D − 1,5)`. Gesperrt wird erst, wenn der Spieler hinter `doorBlock.z1 + 0,5` steht (`lockPending`), `richard-ban` erst bei wirksamem Hausverbot (`applyBan`). Sicherheitsnetz: steht der Spieler trotzdem im Laden, wird die Tür sofort entsperrt (→ grudge). Bleibt der Spieler nach dem Rauswurf im Türspalt stehen, läuft nur der Countdown (ohne Sperre und Schild).
- grudge (10 min, `sessionStorage['lfx.store.richardGrudge']` = Ablaufzeit in ms): Tür auf, Richard kehrt zurück und springt hinter den Tresen; Begrüßung `grudgeGreet`, gelegentlich `grudgeIdle` (alle 45–85 s, im Laden, < 9 m). `canTalk()` (Dialog „Mit Richard reden“) nur in calm/annoyed/grudge und nur am Platz.
- Hand `cashier.richard()` → `{ root, head, mouth, armL, armR, legL, legR, home, pos, collider, inStore(), place(x, z, y, yaw), control(on), setBusy(on), say(cat, vars, opts) }`; `control(true)` schaltet die Leerlauf-Animation ab, `setBusy(true)` unterdrückt Plaudern. Richards Kollider wird per `moveCollider` mitgeführt (kein Nav-Neuaufbau, das Raster behält die Sperre am Tresenplatz). `brawl.js` setzt `root.rotation.order = 'YXZ'` und setzt es in `dispose()` zurück.
- Begrüßung (`cashier.js`): nur, wenn der Spieler in `zones.store` steht; beim Start draußen beim ersten `return` nachgeholt (danach frühestens nach 90 s); draußen spricht `speak()` nur mit `outside: true` (Rufe bei Diebstahl, Chase, Hausverbot).
- Ausleihen (`rent.js`): Mit getragener Hülle zeigt Richard „Hülle ausleihen“ (schon Ausgeliehenes: „Mit Richard reden“); `tryRent()` (Piep, Spruch `rentOk`, Toast), `rent(id)` merkt in `sessionStorage['lfx.store.rented']` (nur Sitzung, nichts an Jellyfin). Diebstahlsicherung: nicht ausgeliehene Hülle in der Hand und Linie `z = D − 0,7` nach außen überschritten → `sound.play('alarm')`, Warnlichter an den Pfosten (`city.doorPosts`) blinken 3,2 s, Richard ruft `theftShout`; ohne Strafe, einmal pro Hülle und Minute (`createTheftGuard`).
- Sprüche (`cashier-lines.js`), neue Kategorien: `hit1–3, shove, throwLine, throwHit, hitObject, chase, ban, banGlass, banEnd, backHome, grudgeGreet, grudgeIdle, rentOk, rentAlready, theftShout`; keine Beleidigungen, kein Blut. Entdeckungen `richard-ban`, `richard-rent`.

### Physik und Objekte (`physics/*`, `modules/props.js`, `modules/throw.js`)

- Kern `createWorld` (rein, ohne three): Kugel- und Quaderkörper (Kreis am Boden, keine Rotationsdynamik: Gierdrehung, Rollen, Kippen, Purzeln; `orientationOf(b)`), Festzeitschritt 1/60 s (max. 6 Schritte, Eingabe ≤ 0,1 s), Höchstgeschwindigkeit 16 m/s mit Unterteilung (kein Tunneln dünner Wände). Kollision mit `layout.cidx` + `layout.dyn` über eigene Prüfung (`queryColliders`, **nicht** `resolveCircle3`/`groundHeight`: deren `STEP_H` 0,35 ließe Bälle über die Feuertreppen-Stufen (0,33) hochploppen); Kanten bis 0,2 m werden überrollt. Körper-Körper per Zylinder-Näherung (Stapeln, Impulsstoß). Spieler = kinematischer Zylinder (`setPlayer`; Geschwindigkeit aus dem `getPose()`-Delta, Sprünge > 0,5 m je Frame = Teleport = 0). Schlaf bei `|v|² < 0,0225` für 0,35 s; wache Körper sind auf `presetFor(level, phone).propsMax` begrenzt. Netzformat (1.16.0): `snapshot(all)` → `[{ i, k, p, v, y, t, s, ax?, az? }]`, `applyRemote(list)`.
- Provider `physics`: `spawn({ shape, size|radius, mass, pos, vel, spin?, mesh?, kind, owner?, ttl?, onHit? })` → Körper `{ id, kind, pos, vel, mesh, sleeping, impulse(v), remove() }`, `hitTest(origin, dir, range, coneDeg)`, `bodiesNear`, `count`; `onHit({ other, collider, player, speed })` ab ~1 m/s mit 0,15 s Sperre, `player: true` bei Spielerkontakt ab 2,5 m/s (nicht bei `owner: 'player'`); das Paket ruft nie selbst `knock`. Zusätze `world`, `pickable(pose, dir)` (Kegel 40°, 1,2 m), `hold`, `launch`, `geometryOf`, `tapeMesh`, `hoop`, `hoopState()`, `snapshot()`, `applyRemote()`. `impulse(v)` ist eine Geschwindigkeitsänderung in m/s. Hat ein `spawn`-Mesh keinen Elternknoten, legt das Modul es in `lfx-props`; der Aufrufer räumt sein Mesh bei `remove()` ab.
- Arten (`kinds.js`): `basketball, soccer, can, cone, crate, box, bin, standee, tape`; `throwable`: Bälle, Dose, Hütchen. Plätze: `city.propSlots`, Mülltonnen (`binL/binR`, `binYard`), zwei Aufsteller „Neu im Verleih“ im Laden (`W/2 ± 2,7`, `D − 1,5`), Dosen-Pyramide (6 Dosen) im Hof, zwei Basketbälle vor dem Korb; jeder Platz wird über `findSpot` gegen Kollider geprüft. Alle starten schlafend; `home.js` setzt verschobene Dinge nach 120 s Ruhe zurück, wenn weder Platz noch Körper im Blickfeld (Kegel ~72°, < 45 m) sind. Darstellung: ein `InstancedMesh` je Art (Vertexfarben, Tageszeit-Tönung über `out.tint`), Sichtbarkeit `city.visible()` + Abstand (low 24 m, mid 32 m, high 40 m).
- Schlagen (`hit`, prio 10): Kegel ±25° in XZ, 1,6 m, Höhenband −0,15…+2,1 m ab den Füßen, Impuls in Blickrichtung plus leicht nach oben, Nachbarn < 0,4 m bekommen einen halben Stoß; `thud`/`clang`.
- Werfen (`throw`, prio 10): Hülle in der Hand → `ctx.items.release()` → Körper `tape` (Cover als Textur, 9 m/s nach vorn-oben), liegt nach der Landung flach, nach 6 s zurück ins Regal (`items.restore(id)`); E in 1,8 m Abstand hebt sie wieder auf. Hand leer: 1. G hebt ein aufhebbares Ding in 1,2 m auf, 2. G wirft (8,5 m/s), E legt ab. Wurftreffer (> 3 m/s, einmal je Ziel und Wurf): Richard über `brawl.hitBy('object', dir)` (Trefferzone um Richards echte Position, Radius 0,9 m, Höhe `pos.y .. pos.y + 2,1`; ohne `cashier`-Provider feste Zone an der Kasse), Passanten über `npc.nearestPerson(x, z, 0,55).handle.hitReact(dir)`; fehlende Provider werden still übergangen. VR-Start legt alles ab bzw. zurück.
- Basketballkorb: Anker `city.yard.hoop { x, y, z, yaw, mast, board, ringR }` (Ringmitte `y 3,05`); Mast, Brett, Ring und Netz zeichnet `city`, Kollider `hoopMast` und `hoopBoard` (`y0 2,825`, `y1 3,875`, `top:false`); die Physik liefert nur die Trefferlogik (Ball kreuzt die Ringebene von oben nach unten im Ring); fehlt der Anker, baut `props.js` einen Rückfall-Korb. Serie: Fehlwurf setzt zurück, 3 in Folge → `hoop-3`; Anzeige am Mast, SFX `swish` + `cheer`. Dosen-Pyramide umgeworfen → `can-pyramid`.
- SFX (`sound.js`, synthetisch; `sound.play(name)`): `thud, bounce, whoosh, swish, cheer, clang, alarm, honk, purr, meow, flap, oof, buy, munch, discover, doorbell`.

### Figuren und Verkehr (`npc/*`, `modules/npc.js`, `traffic.js`, `kiosk.js`)

- Dateien: `anim.js` (rein: idle/walk/run/sit/wave/hit/throw/stagger/point/cheer, `Animator`), `looks.js` (rein), `figure.js` (three: `createFigure(look, hooks)`, 1 `SkinnedMesh`, Geometrie je Look gecacht, `disposeFigureCaches()` beim Modul-`dispose`; das Material ist geteilt), `bubbles.js` (Sprechblasen-Pool, 3 DOM-Blasen `lfx-store-bubble is-npc`; in VR `ctx.xr.bubble()`), `lines.js`, `pathgraph.js`, `walker-logic.js`, `animals-logic.js`/`animals.js`, `cars-logic.js`/`cars.js`, `spots.js` (Anker).
- Provider `npc`: `figure({ look?, role?, rain?, name?, pos?, yaw?, parent?, rand? }) → Handle`, `staff('ticket'|'popcorn')`, `nearestPerson(x, z, r = 3) → { kind, handle, dist }`, `people()`, `registerPerson({ kind, handle, onHit?, pos? }) → off`, `say(handle, text, ms)`, `scare(x, z)`. Handle: `{ root, rig, mesh, look, anim, setAnim, lookAt, say, hitReact({ x, z }), setUmbrella, setName, headWorld, show, hide, getNetState, applyRemote, isRemote, update, dispose }`; `figure()`-Handles aktualisiert das Modul selbst, Standard-Elter `city.groups.street`. Netzformat `{ x, y, z (mm), yaw, v: 1, a, p, s, t }`, Codes `ANIM_CODE` (idle 0 … cheer 9) **nie umnummerieren**; der Spieler-Avatar (`Body.getNetState`) hat ein anderes Format.
- Passanten: Anzahl `presetFor(level).npcMax` (nachts ×0,5, Dämmerung ×0,8, Regen ×0,85 mit Schirm und 25 % schneller), Wege auf `sidewalkPaths` (T-Punkte-Graph), Warten an Kanten mit `wait` (`'main'`/`'side'` ↔ `walkMain`/`walkSide` aus `city.signals()`, `'mid'` ↔ `traffic.zebraClear(edge)`), Ausweichen (Spieler < 2,3 m vorn), Anrempeln (< 0,62 m bei Tempo > 3) → taumeln. Schlag (`onAction('hit')`, prio 20, Kegel ±25°, 1,6 m, Höhenfilter ±1,2 m, nie in VR) → `hitWalker` (taumeln, danach 6 s rennen); Wurftreffer laufen über `handle.hitReact` durch dieselbe Reaktion. Jeder Passant hat einen dynamischen Kollider (`kind:'walker'`, Radius 0,3 m, `y1 1,8`, `top:false`), der nur innerhalb von 8 m um den Spieler folgt (sonst geparkt bei −9990). LOD: < 22 m jede Frame, < 40 m jedes 3., sonst jedes 6.; > 52 m ausgeblendet.
- Tiere: Katze im Hof (flieht bei Annäherung/Schlag, „Streicheln“ nur sitzend/putzend und langsam → `cat-pet`); Tauben (`preset.birds`: low 0, mid 4, high 8, vier Heimatplätze).
- Personal und Kiosk: Anker `city.palast.staff.ticket|popcorn` (Vorrang, sonst `stationsOf(city.palast)`, zuletzt Foyer-Fallback in `spots.js`), `city.kiosk.vendor { x, z, yaw }` (Verkäuferin, 0,56-m-Kollider `kind:'npc'`); „Snack kaufen“ (4 Snacks, `buy`/`munch`, `kiosk-snack`; in VR ein Panel). Die Kioskhütte ist ein Schalenmodell (`hutShell`, Luke 1,0–2,0 m offen).
- Provider `traffic`: `zebraClear(edge)`, `cars()`, `parked()`; bei `?cars=0` eine Attrappe (`zebraClear → true`). Autos: Anzahl `carsMax` (nachts −1 ab 3), kinematisch auf `city.lanes`, dynamische Kollider (`top:false`, `y1 1,4`, 4,2 × 1,8 m, nur im Umkreis 36 m nachgeführt), Ampel über `city.signals()` (Gelb wird ignoriert, wenn der Bremsweg (5,5 m/s²) nicht reicht). Falle: `lane.stop.at` liegt **hinter** dem ersten Zebra der Fahrtrichtung, `effectiveStop()` hält deshalb 0,6 m davor. Hindernisse: Spieler (Füße < 1,0 m) und Passanten im Fahrstreifen (Halteabstand 1,3 m); Hupen nach 1,0 s Blockade (`car-honk`); blockiert der Spieler > 3,8 s, rollt das Auto mit ≤ 1 m/s heran und gibt `knock(…, 0,6)`, Passanten werden nie angefahren. `zebra`: vollständige Querung bei Grün. Parkende Autos: drei Plätze in den Seitenstraßen, je drei Kollider (0,95/1,42/0,95) → Dach per Sprung und Hochziehen erreichbar.

### Entdeckungen (`modules/discover.js`, `discover/*`)

15 Einträge (`discover/catalog.js`, IDs verbindlich, Zuständigkeit im Feld `by`): `golden-tape, graffiti, secret-door, roof-rain, roof, cat-pet, kiosk-snack, hoop-3, can-pyramid, richard-ban, richard-rent, palast-film, palast-tape, zebra, car-honk`.
- Provider `discover`: `found(id, { silent? })` → true, wenn neu (Toast „Entdeckung n/15: Titel“ über `ctx.xr.toast`, SFX `discover`; bei 15/15 ein zweiter Toast; unbekannte IDs still false), `has`, `list()` → `[{ id, found, title, desc, hint }]`, `summary()` → `{ count, total, items }`, `onChange(fn(id, n))`, `getNetState()` → `{ found: [ids] }`, `reset()`. Speicherung `localStorage lfx.store.discover.<userId|anon>` = `{ v: 1, found: { id: ms } }`; Müll, fremde IDs und werfender Storage werden ignoriert (dann nur Sitzung).
- Eigene Fundstücke: goldene Kassette (Lüftungsbox `kind:'vent'` auf dem Dach an `discoverSlots.roofCenter`, nur per Sprung/Hochziehen), Graffiti an `city.yard.graffiti` (Hinsehen 1,5 s aus ≤ 4 m, ≤ 32°), lose Wandplatte (Nordwand innen, 2,8 m rechts neben `zones.staff.x`; Box bis `y 1,95`; Overlay „Kammer“, in VR nur Toast), `roof` beim ersten Aufenthalt auf dem Dach, `roof-rain` nach 3 s auf dem Dach bei Regen und Stunde ≥ 20 oder < 5.
- Pause-Menü: `createPause(host, { getDiscover?() })`, Eintrag „Entdeckungen (n/N)“ (ohne `getDiscover` ausgeblendet), Unterpanel `.lfx-store-discoverpick` (gefunden = Titel + Beschreibung, offen = „???“ + Hinweis; Tab-Falle, Esc/„Zurück“, „Zurück“ klebt unten).

### Sichtbarkeit und Performance

- **Szenen-Partition:** `store.js` ruft nach `mods.init` den Provider `city.partition()`; er hängt `room`, `signs`, `props` und alle `m3-*`-Gruppen unter `city-shopshell` und `shelves` unter `city-shelves`; alles andere bleibt oben und immer sichtbar. In VR ist alles sichtbar.

| Gruppe | sichtbar wenn |
|---|---|
| `city-shopshell` | Bereich `shop`/`doorway`, oder draußen vor der Front (`z > D`, `z − D < 14`, `\|x − W/2\| < W/2 + 8`; nicht Hof, Dach, Palast) |
| `city-shelves` | Bereich `shop`, oder draußen mit `0 < z − D < 5` |
| `city-street` | immer außer `palastHall` |
| `city-yard` | Bereich `yard/alley/escape/roof`, oder draußen < 16 m am Gassenmund (nie drinnen) |
| `city-palast-interior` | Bereich Palast, oder Abstand zur Palast-Tür < 12 m und davor (nicht im Laden); der Saal (`hall.root`) nur in Foyer/Saal |
| `city-palast` | immer |

- Zusätzlich (`modules/city.js`): von draußen werden Ladenhülle und Regale nur gezeichnet, wenn Tür oder Schaufenster im Bild sind (bei `low` Regale nur bis 2,2 m vor der Front, einzelne Regale jenseits 11 m nicht); Straßen-Detailmeshes entfallen bei `low` im Laden und im Hof bei jeder Qualität; `area` wird vor `applyVisibility()` gesetzt. Der Cover-Manager ruht, wenn der Spieler > 25 m südlich vom Laden steht.
- **Draw-Call-Ziel:** unter 140 je Bild bei `low` (gemessene Spitzen 134–140 an der Tür, Hof 74–95, Laden 110, Palast 81). Neue Meshes pro Material mergen, Instancing nutzen, bei `low` weglassen.
- **Qualitätsstufen** (`presetFor(level, phone)` in `engine/quality.js`, monoton low ≤ mid ≤ high, Handy ≤ Desktop): `npcMax` low 8/5, mid 16/10, high 24/14 (Desktop/Handy); `carsMax` 2/2, 4/3, 6/4; `propsMax` 16/10, 28/16, 40/24; `birds` 0, 4, 8; `rainLines` 0, 380/200, 520/260; `fogNear/Far` 34/56, 36/58, 38/58. `ctx.quality()` liefert nur den Level-String, Zahlen immer über `presetFor`.
- **Nebel:** dauerhaft `scene.fog` (Umschalten würde Shader neu kompilieren); `near = min(far − 8, max(preset.fogNear, Diagonale + 1))`, `far = min(58, preset.fogFar)`, immer vor der Himmelskuppel (`FAR_R = 60`; Ferne ≥ 58 m ist unsichtbar, nicht `camera.far = 90`). `fog:false` auf Himmel, Boden, Sterne, Mond, Glow und Regen. Regenlinien-Volumen 24 × 24 m folgt der Kamera (nie in `low`, nicht in Foyer/Saal).
- **Soft-Budget:** `build/build.mjs` `checkStoreBundle()` warnt (kein Abbruch), wenn `dist/lenzstore.min.js` größer als `STORE_MIN_BUDGET` = 1 250 000 B (1,25 MB) wird; Stand 1.15.0 rund 1,16 MB.

### Harness und Debug (Open World)

`/store-dev.html`, zusätzlich zu den VR-/Kino-Parametern: `?spawn=shop|street|palast|yard|roof|kiosk|alley` (Startpunkt), `?npc=0`, `?cars=0`, `?props=0` (Modul aus, Basis für Draw-Call-Messungen), `?palast=1` (2D-Kino, Vorgabe `cinema=1`; setzt den Spieler in den Saal und startet den Fake-Player, `window.__palast` = Handle), `?brawl=1`, `?hour=22`, `?rain=1`, `?quality=low|mid|high`, `?ctl=game|joystick|touch`, `?touch=1`/`?phone=1`, `?discover=reset`, `?intro=1` (Rollladen-Intro, sonst übersprungen), `?restore=1`, `?item=`, `?sound=0`. `window.__lfxStore` (nur bei `__lfxStoreDebug`/`opts.debug`): siehe „Debug“; zusätzlich `m3.<modul>` (`palast`, `npc`, `traffic` … nach `'enter'`), `window.__lfxBrawl { fsm, api, state(), hit(src?), force(state), say(cat) }`, `window.__lfxRent { ledger, guard, tryRent, alarm }` und `__lfxStore.palastTest({ autostart, item })` (nutzt den echten Saal, Rückfall `cinema/saal-stub.js`; Rückgabe `{ saal, sit(), play(item?), stand(), full(on), stop(), diag(), dispose() }`). Debug `__lfxStore.teleport(x, z, yaw, y?, pitch?)`, z. B. vor den Tresen `teleport(W-2.9, D-4.6, Math.PI)`.

### Fallen (Open World)

- `layout.bounds` ist die Welt, nicht der Laden; Kollider im Laden brauchen `y1`, sonst blockieren sie auf dem Dach (Module bekommen es automatisch).
- Zonen: `checkZones` liest `rect.y0/y1`; jede Zone braucht `x/z/yaw/label`. Dach-/Hof-Koordinaten immer aus `layout.city.*` lesen (Tiefe `d` hängt vom Katalog ab), nie festverdrahten.
- Das Nav-Raster kennt nur Boden-Hindernisse (`navBlocks`). `groundHeight` kennt keinen Boden unter 0, der Abgrund-Test (`y < −6`) läuft deshalb vor dem Bodenfangen. `resolveCircle3` liefert `mantle` nur für Kollider mit endlichem `y1`. Bewegliche Plattformen werden nicht mitgenommen; ein Auto, das den stehenden Spieler schiebt, braucht `ctx.player.knock`.
- Nur der Kollider der Südwand hat die Türlücke (`walls` als Optik bleibt ganz); Hausverbot = `doorBlock`. Dekor ab `y 0,012` (Z-Fighting). Dekor-Geometrien müssen dieselben Attribute tragen (position/normal/uv/color, indiziert), sonst scheitert `merge`.
- `index.query` teilt eine `seen`-Menge: nie verschachtelt aufrufen. Kein `Math.random` in Logik/Physik/Planung (Variation per Platz-Id/Position). `ctx.opts.devFlags` gibt es nur im Harness (live undefined = alles an).
- Interaktionen: Reichweite ~2 m, der Blick muss im Kasten liegen (Box nicht unter Augenhöhe 1,65 m enden lassen). Touch-Hinweise ohne „E / Klick:“.
- Headless-Tests: Chrome cachet `lenzstore.js` heuristisch (`Network.setCacheDisabled` setzen); auf geteilten Rechnern einen eigenen Dev-Server-Port nehmen.
- Mehrspieler 1.16.0: nur Formate vorbereitet (`getNetState/applyRemote` an Body, Figuren, Physik, Richard, Tickets, Entdeckungen, `cinema2d`), nichts ist verdrahtet.
- Teile von `brawl.js`/`city.js` haben CRLF: Edit-Werkzeuge mit LF-Mustern können scheitern.

## VR-Modus (Beta)

WebXR (`immersive-vr`) für die Videothek samt VR-Kino, ab v1.8.0. Code: `src/js/store3d/xr/*` (Sitzung, Eingabe, Panels), `src/js/store3d/cinema/*` (Kinosaal), `src/js/features/store/cinema-bridge.js` und `stage-park.js` (Hülle). Das 3D-Bundle fasst nie Jellyfin-DOM an: Der Player kommt über `deps.cinema`. Seit 1.15.0 ist in VR auch die ganze Stadt begehbar (Straße, Hof, Dach, Palast-Foyer; die Rig-Höhe folgt der Bodenhöhe des Spielers), es gibt aber keinen Sprung, kein Schlagen/Werfen/Stoßen und kein Tragen (siehe „Verhalten in XR“). Ohne aktive Sitzung bleibt 2D (Desktop, Touch, Handy) bitgleich; einzige Ausnahme ist der VR-Knopf. Das 2D-Kino im LENZ PALAST ist ein eigener Weg ohne XR-Sitzung (siehe „LENZ PALAST und 2D-Kino“); in VR gibt es weiter nur das VR-Kino. Keine Marken-/Gerätenamen (Texte: „VR-Brille“, „Controller“, „Hände“), kein UA-Sniffing, keine Controller-/Hand-Modellfabriken von three (laden vom CDN). Echte Geräte-Tests stehen noch aus (bisher nur WebXR-Emulator).

### Einstieg
- `probeXr()` (`xr/session.js`) fragt `navigator.xr.isSessionSupported('immersive-vr')` einmal ab und cached das Ergebnis; Fehler zählen als „nein“. `app.xr.supported` steuert die Knöpfe.
- Einstiege (nur wenn `supported && !presenting`): HUD-Knopf „In VR betreten“ (`.lfx-store-vrbtn`, nur im Laufmodus; mit gehaltener Hülle erst zurückstellen, weil die Halte-Ebene sonst das Tippen abfängt) und Pause-Eintrag „VR-Modus“.
- `XrMode.enter()` ruft `navigator.xr.requestSession` **synchron im Klick** auf (Nutzeraktivierung), `optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']`; fehlt `local-floor`, fällt die Sitzung auf `local` zurück (Rig rechnet dann mit der Standard-Augenhöhe). Davor werden die Controller-Objekte angelegt (`prepareSources`, sonst ignoriert three neue Eingabequellen) und Ton/Stimme per Geste freigeschaltet (`sound.unlock`, `cashier.unlockVoice`).
- `renderer.xr.enabled` ist **nur während der Sitzung** an. Sitzungsende räumt alles ab (Rig = Identität, Budget/Qualität zurück, Desktop-/Touch-Eingabe wieder an).
- Beim Start: Overlay/Pause/Intro zu, Zoom 1, gehaltene Hülle an die Hand, `deps.onXr({ presenting: true, cinema: false })`, `ctx.on('xr', true)`.

### Rig-Regel
- Der Spieler ist der Kopf: in XR gilt `player.x/z` = Kopfposition auf dem Boden, `player.yaw` = Kopf-Yaw. Das **Rig** (`engine.rig`, Elternteil von Kamera und Controllern) wird pro Frame aus der Kopfpose zurückgerechnet (`xr/rig.js`: `headLocal`, `placeRig`, `turnAboutHead`, `seatedOffset`). Außerhalb von XR ist das Rig die Identität und die Kamera bekommt Weltkoordinaten wie zuvor.
- Gehen ruft `player.update` wie in 2D (gleiche Kollision), Drehen dreht um den Kopf. Die Höhe kommt von der Brille (`vrHeight: 'auto'`); `'seated'` bzw. „Neu ausrichten“ kalibriert die Sitzhöhe. Im Kino rechnet „Neu ausrichten“ die Sitzhöhe sofort neu (`Cinema.recenter()`).
- `engine.scene` (Getter) ist die aktive Szene (`storeScene` oder Kinoszene), dazu `engine.setScene(s)`, `render(active, cam)`. Die 2D-Zielhilfe (`updateAim`) läuft in XR nicht; die Ziel-Hervorhebung macht der Laser.

### Eingabe (Belegung der Controller, `xr/input.js`, `locomotion.js`, `pointer.js`)
- Linker Stick: gleiten in Kopfrichtung; Stick-Klick links: rennen (bis der Stick wieder mittig ist). Totzone 0,15.
- Rechter Stick: Ruck-Drehung 45° (Auslösen > 0,7, Wieder-Scharfschalten unter 0,3) oder weich 90°/s (`vrTurn`).
- Trigger: Laser-Auswahl (Hülle nehmen, Interactable benutzen, Panel-Treffer; im Kino ins Leere = Bedienpanel umschalten). Liegt der Laser auf einem Panel mit Liste, scrollt der Stick (Y).
- Grip nahe einer Hülle (≤ 0,4 m): greifen (`take(id, { hand, grab: true })`).
- B/Y: oberste Ebene schließen (Panel mit `onClose`), sonst VR-Menü.
- Hände (`inputSource.hand`): Pinch löst `select` aus, kein Stick; Listen-Panels haben dafür ▲/▼-Knöpfe am rechten Rand (Treffer `kind: 'scroll'`); Handgelenk-Knopf (Handfläche zum Gesicht, Kind des Rigs, `hands.js`) öffnet das VR-Menü. Controller und Hände werden prozedural gezeichnet.
- Komfort: Vignette beim Gleiten/Drehen (`vrVignette`), Schwarzblende bei Sprüngen (`xr/fade.js`).

### VR-Menü (`xr/menu.js`, Panel „VR-Menü“)
Einträge: Ton, Drehen (Ruck 45° / Weich), Vignette, Größe (Automatisch / Sitzend), Neu ausrichten, Qualität (Mittel / Niedrig), Kassen-PC-Suche, Diagnose; im Kino entfallen „Größe“ und „Kassen-PC-Suche“ (der Laden ist unsichtbar), zusätzlich gibt es solange das Kino läuft `cinema.menuItems()` (Zurück in die Videothek, Platz, Kino-Bedienung zeigen). Knöpfe: „Weiter“, „VR verlassen“. Änderungen schreiben `app.opts.vr` und gehen über `mode.savePrefs()` → `deps.onPrefs`.

### Panels (`xr/panel.js`)
Ersatz für DOM-Overlays: Canvas-Textur auf einer Fläche (`toneMapped: false`), Treffer per UV, Hover, Scroll.
```js
spec = {
  title?, text?, lines?: string[],
  tabs?: [{ label, on, onSelect() }],
  list?: { rows: [{ label, sub?, tag?, selected?, onSelect?(), actions?: [{ label, primary?, onSelect() }] }], visible? },
  input?: { value, placeholder, onInput(v), onEnter(v) },     // zeigt die VR-Tastatur unter dem Feld
  progress?: { value /*0..1*/, label?, onSeek?(f) },
  buttons?: [{ label, primary?, on?, disabled?, onSelect() }],
  width?,                                                       // Meter
  anchor?: 'front' | 'low' | Object3D | { object, offset, follow: true },
  onClose?(),
}
handle = { update(spec), close(), get open }
```
- Anker: `'front'` (Standard, auch `'hand'`/`'seat'`) weltfest vor dem Kopf, nur Yaw zum Kopf; `'low'` näher und tiefer, zum Kopf geneigt (Couch/Kino-Bedienung); `Object3D` als Kind dieses Objekts; `{ object, offset, follow: true }` weltfest, folgt dem Objekt träge; `{ head: true, offset, follow: true }` weltfest neben dem Kopf, folgt erst bei > 35° Drehung oder > 0,6 m Weg (HoldView). `'front'` rückt vor Regalen heran (`clearance` gegen die Kollider, min. 0,5 m, Winkelgröße bleibt), Panels sind höchstens ~55° breit. Panels zeichnen immer oben (`depthTest: false`, `renderOrder` 900), Laser und Endpunkt danach (950/951).
- Listen: Treffer-Arten `kind: 'key'` (Tastatur) und `'scroll'` (▲/▼, scrollt um eine Zeile).
- Tastatur: QWERTZ mit Umlauten, Shift, Löschen, Leertaste und „Suchen“; die Tasten sind Treffer `kind: 'key'` (`xr/keyboard.js`, rein).
- Ein Panel zählt als Overlay (`overlay.isOpen()` true, Modus `overlay`); B/Y oder `handle.close()` schließt. `mode.closePanels()` räumt alle (auch beim Sitzungsende).
- Sprechblasen (`xr/bubble3d.js`): Billboard mit Canvas-Textur, Spitze auf der Position, höchstens 3 Zeilen, wächst mit der Entfernung.

### `ctx.xr` für Module (`modules/runtime.js`)
```js
ctx.xr = {
  presenting() → bool,           // lazy: liest app.xr erst beim Aufruf (fakeApp hat kein app.xr)
  panel: { open(spec) → handle },
  toast(text, ms = 2600),        // in XR als kopffester Hinweis, sonst deps.toast
  bubble() → { show(text, { x, y, z }), hide(), dispose() },
  exitThen(label, fn),           // Bestätigungs-Panel mit [VR verlassen und fortfahren] [Abbrechen]; bei Ja Sitzung beenden, dann fn()
  jumpTo(x, z, { face }) → Promise<true>,   // Schwarzblende + Teleport; face = yaw | { x, z }
}
```
Event `ctx.on('xr', (on) => …)` bei Sitzungsbeginn/-ende (das Intro endet sofort, Richards Blase wechselt zwischen DOM und 3D).

### Verhalten in XR
- `player.walkTo` und `camera.flyTo` werden zu `jumpTo` (Sprung mit Blende, löst mit `true` auf); `lookAt` löst sofort ohne Drehung auf; `camera.release` ist ein No-op.
- Die Welt ist begehbar: `door` sperrt in VR weder den Türspalt noch teleportiert er zurück (nur `lock()` sperrt, z. B. Hausverbot); alle Stadtgruppen sind sichtbar (Szenen-Partition aus). Richard bleibt in VR friedlich (`brawl` ignoriert Treffer, ein laufender Streit wird beim VR-Start zurückgesetzt), `hit`/`throw` kommen nie an, getragene und freigegebene Hüllen werden beim Start zurückgelegt.
- Rohes `overlay.open(el)` (DOM) öffnet nichts: Hinweis „In VR noch nicht verfügbar“, `onClose` läuft per `queueMicrotask`. Module brauchen für VR ein eigenes Panel (`ctx.xr.panel.open`).
- `guard`/`wrapDeps` (`xr/guard.js`; `store.js` wickelt `deps` damit ein) betrifft Funktionen, die nur außerhalb von VR gehen: Solange eine Sitzung präsentiert, leitet `toast` auf den VR-Hinweis um; `play` meldet vorher `beforePlay` (Kino starten) und verlässt das Kino bei Fehlschlag (`leaveCinema('fail')`); `classicView`, `openLibraries`, `openSettings`, `openThemePicker`, `openMenu`, `logout`, `onBigCovers` laufen über `exitThen('Das geht nur außerhalb von VR', …)`; `onFatal` beendet die Sitzung zuerst. Ohne Sitzung rufen alle Wrapper die Originale unverändert auf.

### Stationen in VR
- **Richard (Kassierer):** Sprechblase als 3D-Blase; „Mit Richard reden“ als Panel mit denselben Antwortknöpfen (`dialogFlow` ist die gemeinsame Logik). Die Stimme ist optional: Brillen-Browser haben oft keine Sprachausgabe, dann bleibt nur die Blase (`cashier.unlockVoice()` im Einstiegsklick ist dann ein No-op).
- **Kassen-PC (`terminal.js`):** Suche als Panel mit VR-Tastatur, gleiche Rangliste (`search-rank.js`), Aktionen je Treffer als Panel-Aktionen.
- **Couch (`tv.js`):** Hinsetzen per Sprung auf den Platz (Sofa-Kollider für die Dauer entfernt), keine Kamerafahrt; Knopfleiste als Panel (Anker `'low'`, `couchSpec`), B/Y = Aufstehen.
- **Rückgabe-Wagen (`returns.js`) und Reservierung (`reserve.js`):** Panel mit Liste statt Karte/Hülle; leer → Hinweis. Abspielen läuft über `deps.play` (also ins Kino).
- **Personalraum (`staff.js`):** Einstellungen, Design und Abmelden gehen nur außerhalb von VR → `exitThen` mit Hinweis.
- **HoldView (`ui/holdview.js`):** Die Hülle fliegt in die Hand (Anker = Grip-Raum der Hand, `app.xr.holdAnchor(hand)`, mit Tiefentest), das Panel (`buildVrSpec`: Beschreibung, Staffeln/Folgen, Abspielen) schwebt weltfest neben dem Kopf zur freien Hand hin (Anker `head`). Beim Betreten/Verlassen von VR wird die Hülle umgehängt (`reanchor`); das Kino schließt sie beim Betreten.

### Kino (`cinema/*`)
`Cinema` (`cinema.js`) hängt an `app.xr.cinema`: `enter(item)` (`false` nur nach `dispose`; läuft noch die Rückblende, wird der Start danach nachgeholt und `true` geliefert), `leave(reason)`, `tick`, `onSelectEmpty`, `menuItems`, `onVisibility`, `dispose`. Eigene Szene (`hall.js`: prozeduraler Saal, Vorhang, Saallicht, drei Plätze); das Rig wechselt in die Kinoszene, `mode.beforeTick` macht dann nur noch Blende, Laser und Menü (kein Kopf→Spieler-Mapping, keine Fortbewegung). Beim Betreten `holdview.close(false)`, Module bekommen `onSuspend` (beim Verlassen `onResume`), `sound.duck('cinema', …)`.
- **Phasen:** `entering` (Schwarzblende, Saal bauen) → `starting` → `playing` ⇄ `paused`; Fehler: `failed` → `leaving`. `deps.onXr({ cinema: true })` geht unmittelbar vor dem echten `deps.play()` raus (`beforePlay`).
- **Start-Logik:** `starting` gilt als geglückt, wenn `video.readyState ≥ 2`, ≥ 3 Videobilder als Textur hochgeladen und die Zeit sich bewegt (oder der Player pausiert ist).
  - **Pausierter Start:** Blockt der Browser das Autoplay (Jellyfin fängt `NotAllowedError` still ab), bleibt das Video pausiert mit Bild (nur ein Upload). Ist `readyState ≥ 2`, `screen.hasFrame` und der Player ≥ 1,5 s stabil pausiert, gilt das als Start in `paused`: Vorhang auf, Bedienpanel, Hinweis „Zum Starten „Weiter“ drücken“ (der Panel-Klick ist die Nutzergeste → `togglePause` → `.btnPause`). Kein Fehlschlag.
  - **Watchdog in Stufen:** Dauert es > 3 s, geht der Vorhang auf (Statusbild „Film wird gestartet …“); nach 8 s steht dort „Der Server bereitet den Film vor …“. Nie ein `<video>` erreicht → nach 25 s Abbruch `T1`. „Zurück in die Videothek“ in dieser Startphase ohne Player/Route wird vorgemerkt (`backPending`, Toast „Wird beendet, sobald der Film startet …“) und beim ersten Video bzw. bei Route `video` ausgeführt; `T1` greift weiterhin. Video da, aber ohne Fortschritt (readyState steigt, `buffered`-Ende wächst oder `currentTime` ändert sich) 15 s lang → `T2`; mit Fortschritt höchstens 60 s (dann ebenfalls `T2`). Fehlerdialog (`phase 'error'` ohne `reloading`) → sofort `D`.
  - **Fehlschlag** (`failed`): Statuszeile „Zurück in die Videothek … (Code)“, Toast „Kino konnte nicht starten (Code)“ (auch nach dem Verlassen), `cinema.stop()`, nach kurzer Haltezeit `leaveCinema('fail', code)`. **Fallback bleibt in VR**: zurück in die Videothek, die Sitzung läuft weiter.
  - **Fehlercodes** (in der Brille gibt es keine Konsole): `P` `deps.play()` lieferte false/Fehler (`xr/guard.js` → `leaveCinema('fail', 'P')`), `T1` kein Player, `T2` Stillstand/Zeitlimit, `D` Fehlerdialog, `B` Fehler beim Bauen des Saals. `Cinema.diag()` liefert zusätzlich `failCode` und `marks` (ms seit Start-Phase: `video`, `ready`, `frame`, `start`, `fail`). `console.warn` loggt nur den Code.
- **Lautstärke (kubisch):** Jellyfin setzt `video.volume = (Regler/100)^3` und zeigt `round(100 · volume^(1/3))`. Die Bridge liefert deshalb `state().volume` als Kubikwurzel von `video.volume` (auf 0,01 gerundet, 0..1) und `setVolume(f)` setzt den Regler auf `round(f·100)` (input + change); ohne Regler `video.volume = f³`. Wird lauter gestellt, während das Video stumm ist, hebt die Bridge die Stummschaltung zuvor über `.buttonMute` auf. Das Panel stellt in ganzen 10 %-Schritten vom Pegel; bei 100 % steht „Lautstärke 100 % (max.)“ und „Lauter“ meldet „Schon volle Lautstärke“, bei 0 % „Leiser“ → „Schon ganz leise“.
- **Selbst-Verlassen:** Route `home` (Player gestoppt), „Zurück in die Videothek“ (`backToStore`: erst `cinema.stop()`, dann `leaveCinema('stop')`), `sessionend` (ohne Blende). Verlassen läuft immer über `app.xr.leaveCinema`, damit `onXr({ presenting: true, cinema: false })` an die Hülle geht.
- **Vorhang/Licht/Streulicht:** Vorhang auf, sobald das Bild läuft; Saallicht aus beim Spielen, gedimmt bei Pause; Streulicht der Leinwand aus der Durchschnittsfarbe des Videos (`ambient.js`, kleines Raster, wenige Hz, geglättet).
- **Leinwand (`screen.js`):** gewölbte Fläche, Seitenverhältnis wird eingepasst; Video als `VideoTexture`-Ableger mit Polling und Frame-Zähler (`videoFrames`). Das `<video>` bleibt bei Spur-/Folgenwechsel dasselbe Element, `deps.cinema.onVideo` meldet trotzdem jeden Wechsel.
- **Platzwahl:** `vrSeat` `front`/`mid`/`back` (Standard `mid`), Wechsel per Panelknopf oder VR-Menü mit kurzer Blende; wird als Pref gesichert.
- **Untertitel (`subtitles.js`):** Quelle `deps.cinema.subtitles()`. `{ kind: 'text' }` wird in eine eigene Canvas gezeichnet (höchstens 3 Zeilen, Umriss), `{ kind: 'canvas' }` (libass) wird mit höchstens ~30 Hz in eine eigene Kopie-Canvas übertragen. Beides als transparente Fläche über der Leinwand.
- **Bedienpanel (`controls.js`, Anker `'low'`):** Fortschritt mit Seek, Pause/Weiter, −10 s/+30 s, Folge zurück/vor (nur wenn der Player sie anbietet), Tonspur, Untertitel, Leiser/Lauter, Platz, „Zurück in die Videothek“. Erscheint beim Start, nach Pause und per Trigger ins Leere; blendet sich beim Spielen nach 6 s ohne Bedienung aus. Solange die Sitzung nicht `visible` ist (Brille abgenommen, Systemmenü), ist das Panel zu und kommt danach zurück.
- **Up-Next:** Erscheint `state().upNext`, zeigt das Panel „Nächste Folge in N s“ mit „Jetzt starten“/„Verbergen“ (`deps.cinema.upNext(...)`) und blendet sich nicht aus.
- **Spurwahl:** Panel „Tonspur“/„Untertitel“ mit Liste (`tracks(kind)` → `selectTrack(kind, id)`). Ein Tonspurwechsel dauert im Player einige Sekunden (`reloading`: `readyState 0` nach vorherigem Bild, kein Fehler, kein Watchdog) und setzt die Untertitel zurück; die Bridge setzt die vorher gewählte Untertitelspur danach erneut. Das Panel zeigt währenddessen „Wechsel läuft …“. Das Spurwahl-Panel ersetzt das Bedienpanel vorübergehend (es wird geschlossen und nach dem Schließen wieder gezeigt).

#### `deps.cinema` (Player-Bridge, Hülle)
```js
cinema = {
  activate(on),                       // nur Hülle intern (Polling 250 ms); das 3D-Bundle ruft es nicht
  state() → { route: 'video'|'home'|'other', phase: 'idle'|'loading'|'playing'|'paused'|'ended'|'error',
              time, duration, title, hasPrev, hasNext, upNext: { text, seconds } | null,
              error: string | null, volume, muted, reloading: bool },
  video() → HTMLVideoElement | null,
  onVideo(fn) → off,                  // fn(videoOrNull) bei jedem Wechsel des Elements
  onChange(fn) → off,                 // fn(state) bei Phasen- oder Routenwechsel
  subtitles() → { kind: 'text', text } | { kind: 'canvas', canvas } | null,
  togglePause(), seekBy(s), seekTo(s), next(), prev(), setVolume(v), toggleMute(),
  tracks('audio' | 'subtitle') → Promise<[{ id, label, selected }]>,
  selectTrack(kind, id) → Promise<bool>,      // Aufrufe laufen nacheinander (Warteschlange)
  upNext('start' | 'hide'),
  stop() → Promise<bool>,             // true, sobald #/video verlassen ist; sorgt für #/home (ohne offenen Player: kein Klick, sofort true)
}
```
Alles läuft über die (ausgeblendeten) OSD-Knöpfe; Selektoren und Fallstricke: `docs/dom-map.md` („Player für das VR-Kino“). Verlässt der Player `#/video` Richtung anderswo als `#/home`, setzt die Bridge `#/home`. Die Bridge loggt weder URLs noch Titel. Im Harness gibt es dieselbe API gegen ein Fake-OSD mit identischem DOM.

### Hülle × XR (`features/store/home.js`, `stage-park.js`)
Die Hülle hält `xr = { presenting, cinema }` aus `deps.onXr` (und prüft zusätzlich `instance.isXr()`). Läuft das Kino, öffnet Jellyfin `#/video` und die Hülle wird ausgehängt. Die Bühne (mit der Canvas der laufenden Sitzung) wird dann in einen unsichtbaren Container an `body` **geparkt** (`parkStage`: 1×1 px, `opacity: 0`, `pointer-events: none`; `unparkStage()` gibt sie zurück), damit der Renderer weiterläuft.

| # | Ereignis | Bedingung | Hülle | Instanz |
|---|---|---|---|---|
| 1 | unmount | nicht `presenting` | wie bisher (suspend, 3-min-Timer, teardownUi) | suspend |
| 2 | unmount | `presenting && cinema` | `ui.stage` vor `teardownUi` parken; **kein** suspend, kein Timer; `cinema.activate(true)` | Kino läuft |
| 2b | unmount | `palast.active` (2D-Kino, Jellyfin navigiert auf `#/video`) | Bühne **sichtbar** parken (`parkStage(…, { visible: true })`), kein suspend, kein Timer, Bridge an | Kino läuft |
| 3 | unmount | `presenting && !cinema` | suspend wie Zeile 1 | `suspend()` beendet die Sitzung zuerst |
| 4 | `onXr({ presenting: false })` | geparkt | `instance.suspend()`, Park-Container entfernen, 3-min-Timer, `cinema.activate(false)` | Kino still verlassen; der 2D-Player spielt weiter |
| 4b | `onCinema2d({ active: false })` | geparkt | wie Zeile 4 (`releaseParked()`: suspend, Container weg, 3-min-Timer, Bridge aus) | – |
| 5 | `onXr({ presenting: false })` | auf `#/home`, nicht geparkt | nichts | Modus `play`, Rig = Identität, resize/FOV |
| 6 | mount/`start()` | geparkt && `presenting` | `buildUi()`, neues `ui.stage` durch die geparkte Bühne ersetzen, Laden entfernen, `is-ready`, **kein resume**; `instance.leaveCinema('home')`, `cinema.activate(false)`, `applyRoute` | zurück an die alte Pose |
| 6b | mount | geparkt && `palast.active` | alte Bühne zurück, kein resume, `instance.leaveCinema('home')` (Spieler steht am Gang), Route anwenden | `cinema2d.leave('home')` |
| 7 | Route verlässt `#/video`, aber nicht nach `#/home` | geparkt && `presenting` | Bridge setzt `location.hash = '#/home'` | – |
| 8 | Design-Wechsel/`destroyStore` | – | dispose wie bisher | `dispose()` beendet die Sitzung vor `renderer.dispose()` |
| 9 | `document.hidden` | `presenting` | – | **kein** `halt()` der Schleife |
| 10 | XRSession `visibilitychange` (`hidden`/`visible-blurred`) | – | – | Eingabe pausiert, Kino-Panel zu |
| 11 | `sessionstart` | – | – | Overlay/Pause/Intro zu, gehaltene Hülle an die Hand, Desktop/Touch abhängen |

Zeile 8 gilt auch für das 2D-Kino: `instance.suspend()` ruft zuerst `cinema2d.leave('suspend')`, `dispose()`/`destroyStore()` zuerst `cinema2d.dispose()` (Hülle räumt Knopf, `<html>`-Klassen und Park-Container). `stage-park.js`: `parkStage(stage, { visible })`; `visible: true` = Container `display:block; height:0; overflow:visible` ohne `position`/`z-index`/`opacity`/`pointer-events` (kein Stapelkontext, die Bühne liegt über ihr eigenes CSS vollflächig); ohne Option unverändert 1×1 px unsichtbar.

Die Hülle setzt `deps.onXr`, `deps.onCinema2d` und `deps.cinema` vor `create()`. `deps.cinema` ist eine lazy erzeugte Bridge (`createCinemaBridge()`), die erst mit `activate(true)` pollt.

### Prefs
Hülle `features/store/prefs.js`, `localStorage lfx.store.<name>.<uid>`; Mapping auf `opts.vr = { turn, vignette, height, quality, seat }`, Änderungen kommen über `deps.onPrefs({ …, vr })` zurück.

| Name | Werte (Standard zuerst) |
|---|---|
| `vrTurn` | `'snap'` \| `'smooth'` |
| `vrVignette` | `true` \| `false` |
| `vrHeight` | `'auto'` \| `'seated'` |
| `vrQuality` | `'mid'` \| `'low'` |
| `vrSeat` | `'mid'` \| `'front'` \| `'back'` |

### Performance
- Qualität in VR fest `low` oder `mid` (`vrQuality`, Standard `mid`): `app.setQuality` erzwingt in der Sitzung nur diese beiden; die gewählte 2D-Qualität wird beim Sitzungsende wiederhergestellt, bei „Automatisch“ auch die zuletzt automatisch gewählte Stufe (`prevLevel`).
- Budgets wie am Handy (`engine.setXrBudget(true)`: kleinere Cover-Atlanten, **keine** Schatten). Keine Hi-Stufe (2048er-Atlanten), keine AutoQuality-Anpassung (läuft in XR nicht), kein FOV-Zoom (Zoom bleibt 1).
- Foveation (`engine.setFoveation`): in der Videothek 1, im Kino 0 (volle Schärfe für die Leinwand); beim Verlassen des Kinos wieder 1.
- Gemessen im Emulator (Draw-Calls, stereo, vor der Open World): Videothek in VR ~186, Kino ~26–30. Mit Stadt (alle Gruppen sichtbar) nicht neu gemessen. Auf echter Hardware nicht gemessen.

### Fallstricke
- **`CanvasTexture` nach Größenwechsel:** three legt den Texturspeicher fest an. Ändert sich die Canvas-Größe (Panel-Höhe, Untertitel-Kopie-Canvas), die alte Textur mit `dispose()` freigeben, eine neue anlegen und am Material neu binden (`mat.map`, `needsUpdate`). Sonst Geisterbild oder kein Update.
- **Messfalle bei Emulator-Screenshots:** Der Emulator hängt seine Canvas in einen eigenen Vollbild-Container, die Bühne (`.lfx-store-stage`, im Harness `#stage`) liegt darüber und verdeckt sie, der Screenshot ist dann einfarbig dunkel. Im Harness `?xrshot=1` setzen (blendet die Bühne in XR aus) und `device.stereoEnabled = true` für Side-by-Side.
- Stimme in VR ggf. nicht verfügbar (Brillen-Browser ohne `speechSynthesis`/deutsche Stimme): dann nur Blase/Panel.
- In VR fasst nichts DOM-Overlays an (kein Pointer-Lock, kein `overlay.open`): neue Stationen brauchen ein Panel (`ctx.xr.panel.open`) und einen `exitThen`-Weg für Dinge, die nur außerhalb von VR gehen.
- Echte Geräte-Tests (Foveation, Frame-Zeiten, Handverfolgung, Controller-Belegung, Player in der Sitzung) stehen noch aus.

### Debug und Harness
- `window.__lfxStore.stats().xr` = `{ supported, presenting, inCinema, phase, videoFrames, visibility, … }` (Kino-Felder aus `cinema.diag()`, u. a. `readyState`); `window.__lfxStore.xr` = der `XrMode`. Das VR-Menü hat einen Diagnose-Schalter.
- Dev-Harness `build/store-dev.html` (über serve `/store-dev.html`), Parameter:
  - `?xremu=1` lädt den WebXR-Emulator (`/xr-emu.js`).
  - `?xrshot=1` blendet die Bühne in XR aus (Screenshot-Hilfe, siehe Messfalle).
  - `?cinema=1|series|fail|paused|slow` Fake-Jellyfin-Player (Film / Serie mit Up-Next / Wiedergabefehler / bleibt nach dem Laden pausiert bis `.btnPause` / erstes Bild erst nach 15 s mit wachsendem `buffered`) mit identischem DOM, dazu die echte Bridge.
  - `?subs=srt|ass|off` Untertitelart des Fake-Players.
- `build/serve.mjs` liefert zusätzlich `/xr-emu.js` aus `.tmp/xr-emu.js` (404, wenn nicht vorhanden) und `/cinema-bridge.js` (die Bridge der Hülle als Modul).
- Der Emulator wird separat in `.tmp/` gebündelt (IIFE, legt ein emuliertes Gerät samt `window.__xrEmu` zum Steuern von Kopf, Controllern, Händen, Tasten und Sticks an) und **nicht committet**. Ein Test ohne VR-Brille ist damit nur lokal möglich.
