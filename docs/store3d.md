# VIDEOTHEK LENZ (`store`, Beta) – Vertrag Hülle ↔ 3D-Bundle

Design-ID `store`, Name „VIDEOTHEK LENZ“. Eine begehbare 3D-Videothek (three.js), späte 90er/frühe 2000er,
stilisiert-warm (Low-Poly, warmes Licht, Neon, blauer Teppich). Alle Modelle/Texturen prozedural im Code,
keine fremden Assets, keine fremden Marken. Seit 1.15.0 eine **Open World**: Der Laden steht in einer kleinen Stadt
(Straße, Hof, Dach, Kiosk, Kino „LENZ PALAST“), man springt, schlägt, wirft und trägt Hüllen; siehe „Open World (1.15.0)“. Seit 1.18.0 gibt es Waffen, Energie und Raufen mit Passanten, Rowdy-Bande und Mitspielern; siehe „NPCs und Raufen (1.18.0)“.

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
  profile?: Profile-Handle,                   // 1.17.0 Konto-Profil (Figur, Ausweis, Entdeckungen), nur mit Jellyfin-Benutzer; fehlt = keine eigene Figur, siehe „Figur, Ausweis, Salon (1.17.0)“ → „Konto-Profil“
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
- Qualitätsautomatik (`engine/quality.js`, `AutoQuality`): Hänger über 250 ms zählen als sehr langsamer Frame (das Fenster wird nicht verworfen); nur Physik/`tick` bekommen für solche Frames `dt = 0,016`. Läuft nicht in XR. Nach `reset()` (Start via `go()`, `setLevel`, `setAuto`, XR-Ende) ignoriert sie die ersten 3 Frames (Shader-Kompilierung, Textur-Neuladen); Dauerruckeln zählt weiter. Settle-Verlängerung (1.19.0): `AutoQuality.extendSettle(sec)` hebt `settleLeft` auf mindestens `sec`. Die Engine-Option `holdAuto()` wird je Bild vor `sample()` geprüft; bei `true` gilt 0,5 s Einschwingen. `StoreApp.holdAuto()` liefert `true`, solange `warmDraw.busy()` UND der letzte Stufenwechsel (Automatik wie `setQuality`, gemerkt in `applyPreset`) höchstens 8 s her ist (`HOLD_AUTO_MAX_MS`, Obergrenze, damit ein ständig nachscannendes Vorab-Zeichnen die Automatik nie dauerhaft blind macht); nur mit `ultraOk`. Grund: das Vorab-Zeichnen nach dem Hochschalten kompiliert im Spiel (Programmbau) länger als 1,5 s, das Fenster fiel unter 55 fps, und die Rückschalt-Regel sperrte die Stufe dauerhaft (Automatik blieb auf `mid`).
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
  E/Linksklick nimmt die anvisierte Hülle (Fadenkreuz), Leertaste springt, F schlägt (seit 1.18.0 mit der gewählten Waffe; R halten/1–4/Mausrad wählen sie, siehe „NPCs und Raufen (1.18.0)“), G wirft/hebt auf, M im Halte-Bild nimmt die Hülle mit (Tragen, siehe „Open World“),
  V (seit 1.17.0) wechselt Ich-/Außenansicht (`ACTIONS.KeyV` → `onView` → `StoreApp.doView()` → `selfview.toggle()`, nur wenn Handeln erlaubt ist; Touch: Knopf „Ansicht“ `.lfx-store-viewbtn` in `ui/hud.js`, im Schema `game` stattdessen `.lfx-store-gp-view` im Gamepad, Standard versteckt).
  Esc/Lock-Verlust → Pause-Menü. Leertaste/F/G nur im Modus `play` abgefangen (in Menüs bleibt die Leertaste für Knöpfe), nur bei Pointer-Lock oder `dragLook`, `repeat` ignoriert; die Relock-Taste führt die Aktion nicht zusätzlich aus. ctx-Rückrufe von `desktop.js`: `onJump`, `onHit`, `onThrow`, `onCarry`, `onTake('click'|'key')`. Tasten nur während
  der Szene aktiv ist, im Capture-Listener mit `stopPropagation()` (Jellyfins globale Tastenkürzel dürfen nichts sehen),
  nie in `input`/`textarea`. Kein Kopfwippen, weiche Beschleunigung.
  Zoom: rechte Maustaste oder `Q` gehalten → `onZoom(2.6)`, loslassen → `onZoom(1)`; Maus-Empfindlichkeit wird durch den Zoom geteilt;
  Rechtsklick öffnet kein Kontextmenü. `StoreApp.setZoom(z)` (1..3) glättet (~0.12 s) und setzt `engine.setZoom` (FOV = Basis-FOV / Zoom); in Terminal/Intro/Couch/Pause wird auf 1 zurückgesetzt.
  Pointer-Lock: Chrome lehnt `requestPointerLock()` ~1 s nach Esc ab → `requestLock()` wartet bis `unlockAt + 1150 ms`, bei Fehler kurz nach Esc genau ein verzögerter Retry. Esc bei offenem Design-Wähler oder Profil-Popover der Hülle (`html.lfx-themepicker-open`/`lfx-popover-open`) gehört diesen Overlays und erreicht das Pause-Menü nicht. Esc im offenen Pause-Menü = „Weiter“ (Entprellung 300 ms nach dem Lock-Verlust, greift auch mit Fokus auf einem Knopf). Esc ist keine Nutzeraktivierung: scheitert der Lock (Fehler oder 400 ms Stille), bleibt der Modus `play`, der HUD zeigt „Klicken zum Weiterspielen“ und `relockArmed` lockt beim nächsten Klick **oder** der nächsten Nicht-Esc-Taste synchron im Handler. `dragLook` (Zieh-Modus) nur ohne `requestPointerLock` oder wenn der allererste Klick-Versuch der Sitzung scheitert.
- Touch-Schemata (ab v1.7.8, `TouchControls({ scheme })`, `setScheme()`, `SCHEMES = ['game', 'joystick', 'touch']`; Pause-Menü „Steuerung“ nur auf Touch als Dreier-Zyklus Spiel → Joystick → Touch,
  `deps.onPrefs` mit `touchControl`). App-Standard seit 1.15.0 `game` (Klassen-Standard von `TouchControls` bleibt `touch`, wegen der Tests). Speicherung/Migration (`features/store/prefs.js`): `touchControl` gilt nur zusammen mit `touchControlChosen = '1'` (setzt nur das Pause-Menü); gespeichertes `joystick` bleibt, `touch` nur mit Marker, alles andere `game`. Wer vorher bewusst „Touch“ gewählt hatte, fällt einmalig auf „Spiel“ zurück. Desktop zeigt statt der Touch-Hilfe die Tastenhilfe-Zeile `DESKTOP_HELP` (`ui/hud.js`); Touch-Hinweise am Ziel verlieren den Präfix „E / Klick:“ (`touchHint`, gilt für alle Touch-Schemata).
  - `game` (Ansicht `ui/gamepad.js`, CSS `themes/store/gamepad.css`, Ebene 1 unter der HUD; Eingabe in `controls/gametouch.js` über `controls/touch.js`; Host-Klasse `lfx-store-ctl-game`): `.lfx-store-gp` ist eine ganzflächige Touch-Fläche (`pointer-events:auto; touch-action:none`, `is-parked` = `visibility:hidden` bei Kamerafahrten). Ruhe-Stick links immer sichtbar (`.is-rest`, Deckkraft 0,45 am Ruheplatz), springt beim Aufsetzen in der Stick-Zone unter den Daumen (Basis ist Kind von `root`, `translate3d` relativ zum `root`-Rect), kehrt beim Loslassen zurück und zieht jenseits des Radius mit. Stick-Zone ist reine Geometrie (`GP_ZONE`, `zoneOf(x, y)`): Querformat x < 42 % und y > 28 %, Hochformat (`innerHeight > innerWidth`) x < 48 % und y > 42 %. Radius `max(48, 0,09 · min(innerWidth, innerHeight))`, Totzone 0,12, danach linear; Rennen ab Auslenkung ≥ 0,92 (Hysterese bis 0,8). Rechts überall Wischen = Umsehen, auch wenn der Finger auf einem Knopf beginnt (der Knopf feuert beim Drücken, Weiterziehen über den Slop = Umsehen). Knöpfe: Springen, Benutzen (hervorgehoben bei Ziel im Fadenkreuz), Schlagen (bei getragener Hülle ersetzt Werfen den Knopf, `btnOf` liefert weiter `act`) und Zoom (halten; Klasse `.lfx-store-gp-zoom`). Zwei Finger lösen nichts aus, kein Pinch. Eigenes Hochformat-Layout (Spalte rechts, 390×844) und Querformat (844×390), beide per `env(safe-area-inset-*)`. Im Schema `game` steht der VR-Knopf als 44-px-Symbol oben links neben dem Menü. Ansichts-API: `createGamepad(host) → { root, btnOf(target), setStick(cx, cy, kx, ky, run), restStick(), press(name, on), setAimed(on), setCarrying(on), carrying, show(on), setParked(on), zoneOf(x, y), destroy() }`. Zielen läuft auch am Handy (Strahl aus der Bildmitte, alle 90 ms). ctx-Felder `onJump, onUse, onHit, onThrow`, `setAimed()`, `setCarrying()`. Tippen auf ein Cover geht wie bisher.
  - Menü „Touch-Steuerung …“ (Pause-Menü, nur Touch; Panel `.lfx-store-touchpick` mit den Klassen des Stimmen-Panels) mit: Steuerung Joystick/Touch, „Cover kippen“ (`holdInvertY`), „Cover drehen“ (`holdInvertX`), „Umschauen hoch/runter“ (`lookFlipY`), „Umschauen links/rechts“ (`lookFlipX`) je Normal/Umgekehrt, „Umgreifen“ (`touchRegrip` off/short/long = Aus/Kurz/Lang, nur bei Steuerung Touch), „Empfindlichkeit“ (`touchSens` low/normal/high = Faktor 0,7/1/1,4 auf Umschauen und Cover-Drehung). Prefs `lfx.store.<name>.<uid>`, `opts.touchTune`, Laufzeit-Setter `StoreApp.setTouchTune(teil)`, `deps.onPrefs` trägt alle Felder. **Standard** (nichts umgekehrt, Empfindlichkeit normal, Umgreifen kurz): „Umgekehrt“ ist ein reiner Vorzeichenwechsel relativ dazu. Umschauen „Normal“ (Flip aus) = Kamera-Konvention wie die Maus: Finger rechts → Blick rechts, Finger hoch → Blick hoch; Joystick rechts/oben → Blick rechts/oben. „Umgekehrt“ (Flip an) = „Szene greifen“ beim Wischen bzw. umgekehrter Stick (der früher als „Umgekehrt“ gespeicherte Wisch-Modus ist jetzt „Normal“; die alten Schlüssel `lookInvertY/X` werden nicht mehr gelesen, alle starten auf dem neuen Normal). `lookFlip*` wirkt auf Wischen und Joystick (`TouchControls` `ctx.getTune`), `holdInvert*`/Empfindlichkeit auf das Ziehen-Overlay der gehaltenen Hülle nur bei `pointerType === 'touch'` (Maus, VR unberührt). Kippen wirkt seit 1.11.1 um die feste X-Achse im Kamera-Rahmen (Euler `'XYZ'` in `holdview.js`), vorne wie hinten gleich (vorher `'YXZ'`: auf der Rückseite umgekehrt).
  - `joystick`: `ui/joypad.js` legt im Host `.lfx-store-pad` an (Ebene 3, eigene Pointer-Events, Multitouch):
    Gehen-Knopf `.lfx-store-pad-walk` unten links (gedrückt = `input.fwd = 1`, Zoom fällt auf 1),
    Joystick `.lfx-store-pad-stick` unten rechts (Totzone 0,12, quadratische Kurve, `shapeStick`). `touchCtl.tick(dt)` pro Frame
    im Laufmodus dreht den Blick: rechts = Blick rechts, oben = Blick oben (`STICK_YAW_RATE` 2,4 / `STICK_PITCH_RATE` 1,5 rad/s).
    Auf dem Canvas: Wischen = Umsehen, Tippen = nehmen, Pinch = Zoom (nur `touch`/`joystick`; im Schema `game` Zoom per Knopf); Halten startet kein Laufen. Pad nur bei `mode === 'play'`
    und ohne `mods.locked` (`showPad`), im Intro per CSS aus.
  - `touch`: wie unten beschrieben.
  - Hochformat-Hinweis (`ui/rotate.js`, nur `opts.phone`): Banner `.lfx-store-rotate` „Für die beste Ansicht das Handy quer
    drehen“ im Hochformat und Laufmodus; verschwindet im Querformat, kommt beim Zurückdrehen wieder, ✕ schließt ihn für den
    Besuch (nichts gespeichert). Im Schema `game` aus (`isWanted`-Option von `createRotateHint`, die Hülle liefert `touchScheme !== 'game'`): das Schema hat ein eigenes Hochformat-Layout.
- Touch (`controls/touch.js`, Schema `touch`): Finger gedrückt halten (> 220 ms, < 9 px Bewegung) → vorwärts in Blickrichtung laufen
  (`touchCtl.input = { fwd: 1 }`, Ring `.lfx-store-walkring` am Finger), Ziehen beim Halten lenkt. Bewegung > 9 px
  vor Ablauf → nur Umsehen (Richtung laut „Umschauen“, Standard Kamera-Konvention). Kurzes Tippen → `onTap`: Hülle/Objekt in Reichweite (≤ 3 m) nehmen/benutzen,
  weiter weg nur Hinweis (kein Auto-Pfad; `store.walkTo`, `approachCover`, `approachInteractable` und der Boden-Marker existieren nicht mehr, Module nutzen `ctx.player.walkTo` bzw. `runtime.walkTo`). Zwei Finger = Pinch-Zoom (nur Schemata `touch`/`joystick`, nicht `game`)
  1..3 (`onZoom`), danach weder Laufen noch Umsehen/Tippen bis alle Finger oben sind; Zoom fällt beim nächsten Loslaufen auf 1.
  Umschauen (Wischen und Stick) wird durch `max(1, Zoom)` geteilt (wie die Maus in `desktop.js`).
  Umgreifen (`touchRegrip`, Standard `short` = 400 ms, `long` = 800 ms, `off`; `REGRIP_MS`): Lässt der laufende Finger in den äußeren 20 % der Breite (links/rechts) los, läuft `input.fwd` weiter bis `coastUntil` (Ring aus); ein neuer einzelner Finger in diesem Fenster läuft sofort weiter (keine 220 ms, kein Tap, Ring am neuen Finger). Abbruch bei zweitem Finger/Pinch, Moduswechsel, `reset()`, `detach()`, `setScheme()` (ein `pointercancel` am Rand, z. B. durch eine System-Geste, zählt wie Loslassen); Loslassen in der Bildmitte stoppt sofort. Zeitquelle `ctx.now()` (Standard `performance.now`).
  Canvas `touch-action:none`, `overscroll-behavior:none`. Hoch- und Querformat.

## Eingabe-Diagnose (Touch-Schema `game`)

- `TouchControls.diag()` liefert immer (auch ohne Debug) `{ v, api: 'touch'|'pointer', scheme, gate: 'on'|'parked'|'off', gateWhy, fingers, roles:{ stick, look, jump, use, act, zoom }, stick, zoom, n:{ start, end, cancel, orphan, reuse, lost, parkResume, rel:{ mode, locked, hidden, pagehide, blur, orient, scheme, detach } }, last, lastHide, layout:{ w, h, portrait, zone, R, rest }, log }`. Die Zähler überstehen Schema-Wechsel und Aussetzen und zählen pro Seitenaufruf neu; `log` (Ringpuffer 40) nur bei `opts.debug`.
- Harness: `window.__lfxStore.input()` (nur mit `opts.debug`).
- Pause-Menü, Panel „Touch-Steuerung …“, nur im Schema `game`: Zeile `.lfx-store-pause-note` (Text auswählbar, jede Sekunde aktualisiert, solange das Panel offen ist), z. B. `Eingabe: 2 Finger (Stick, Blick) · bereinigt 2 · Abbrüche 1 · zuletzt: verwaist am Stick vor 12 s`; ohne Vorfälle `Eingabe: 0 Finger · keine Abbrüche`.
- Die Diagnose macht verwaiste Finger sichtbar (iOS hält `touchend` bei Randgesten teils zurück); der Gerätetest notiert die Zeile bei Auffälligkeiten.

## Debug (`opts.debug`)

`instance.debug` und `window.__lfxStore`:
`teleport(x, z, yaw, y?, pitch?)`, `lookAt(itemId)`, `take(itemId)`, `put()`, `stats()` → `{ fps, frameMs, calls, triangles, textures, geometries, coverSegmentsLoaded, quality }`, `state()`, `input()` (Eingabe-Diagnose, siehe „Eingabe-Diagnose“), `zones()` → Liste benannter Orte mit Koordinaten (Eingang, Kasse, jede Abteilung …). Seit 1.15.0 zusätzlich `jump()`, `getNetState()`, `pose()`, `carried()`, `carry(id)`, `drop()`, `release()`, `restore(id)`, `use(name)` (Provider), `act('hit'|'throw'|'use', src?)`, `look(yaw, pitch)`, `spawns()`, `area()`, `city()`, `discover(cmd?)`, `palastTest(o)`; Übersicht siehe „Open World“ → „Harness und Debug“.

## Module (store3d intern)

Erweiterungen des 3D-Bundles (Kasse, Intro, Snack-Theke …) hängen sich als eigene Dateien in `src/js/store3d/modules/` ein; `store.js` bleibt unberührt.
Registry: `modules/index.js` (`export const MODULES = [...]`, Reihenfolge = Init-Reihenfolge, eine Zeile je Modul). Laufzeit: `modules/runtime.js`.

```js
export default { name: 'beispiel', init(ctx) { …; return { update(dt, t) {}, onSuspend() {}, onResume() {}, onQuality(level) {}, onSound(on) {}, dispose() {} }; } };
```
`init` darf ein Promise liefern (Boot wartet, Fortschritt 86–91 %). Fehler werden per `console.warn` geloggt und beenden die Szene nicht. Alle Handle-Methoden optional. Module importieren `three` selbst.

`ctx`:
- `scene, camera, renderer, layout, catalog, deps, opts, isPhone, isTouch`, `quality()` → `'low'|'mid'|'high'`, `soundOn()`.
- `layout.zones[id] = { id, label, x, z, yaw, rect:{x0,z0,x1,z1,y0?,y1?}, reserved? }`: Laden `entrance, register (+counter), cashier, reserve, returns, snack, tv, staff, window, window2, kids, adult, dept:<id>`; Stadt `store, street, sidewalkN, sidewalkS, road, crossing, sideN, sideS, doorway, theft, alley, yard, escape, roof, kiosk, palast, palastFoyer, palastHall, salon (1.17.0, Label „Friseur“), palastEntrance`. `rect.y0/y1` sind optional (Dach `y0 3,0`; Ladenzonen `y1 2,6`; `checkZones` liest `y0/y1`, nicht `yMin/yMax`). Jede Zone braucht `x/z/yaw/label` (sonst wirft `__lfxStore.zones()`). Reservierte Zonen sind frei von Regalen; Kollider legen die Module an.
- `layout.bounds` ist seit 1.15.0 die **Weltgrenze**, nicht mehr der Laden. Den Laden liefern `layout.zones.store.rect` bzw. `0..w × 0..d`.
- `addCollider(rect, { dynamic? })` / `moveCollider(rect, x0, z0, x1, z1, y0, y1)` / `removeCollider(rect)`: `rect = {x0,z0,x1,z1,kind?,y0?,y1?,top?}` (Höhen siehe „Kollision mit Höhen“); statisch wirkt auf Spielerkollision und A*-Raster (Neuaufbau im nächsten Frame, nur wenn `navBlocks(rect)`), `dynamic: true` liegt nur in `layout.dyn` und nie im Raster. Module im Laden ohne `y1` bekommen automatisch `y1 = layout.ceilH` (das Dach bleibt begehbar); eigene Welt-Kollider setzen `y1` selbst. Nie von Hand mutieren (Hash veraltet), immer `moveCollider`.
- `addInteractable({ box, label, hint, onUse, enabled?, anyHeight?, noClick? })` → `remove()`; `box` = `THREE.Box3` oder `{min,max}` in Weltkoordinaten. Wie eine Hülle: Fadenkreuz-Hint (`label`/`hint`), E/Klick (Reichweite 2,5 m), Touch-Tippen läuft hin und ruft `onUse()`. Ohne `anyHeight` nur am Boden benutzbar (Füße ≤ 0,5 m). `noClick: true` (1.17.0, `runtime.js` Z. 115, `store.js` `doUse`): Bei `src === 'click'` wird die Interaktion übersprungen, der Linksklick läuft weiter zu `doHit` (Schlag); nur E/Touch lösen aus. Gedacht für Interaktionen an Personen („Ausweis ansehen“), damit ein Schlag nie ein Fenster öffnet. Verdeckende Wände zählen beim Anvisieren (`controls/pick.js`: `wallOccluders` nur `kind` `wall` und Gebäude; Requisiten, Regale, Tresen, Türen, Kisten und Autos (`NOT_WALL`) verdecken ihre eigene Box nie).
- `player.getPose()` → `{ x, z, yaw, pitch, y }`, `teleport(x,z,yaw,pitch?,y?)`, `walkTo(x,z,{face})` → `Promise<bool>` (`face` = yaw oder `{x,z}`), `lookAt(x,y,z,ms)` → `Promise`, `freeze(bool)`, `player.camera.flyTo(pos,target,ms)` → `Promise<bool>`, `player.camera.release()`, `player.camera.setRig(fn | null)` (1.17.0: `fn(camera, dt)` läuft nach `player.applyCamera`, aber nur, wenn KEIN `flyTo`/Modul-Kamera aktiv ist; gibt sie `true` zurück, hat sie die Kamera gesetzt; ein Rig, ein Besitzer: `selfview`; wirft das Rig, wird es verworfen); neu `jump()` → bool (in VR immer false), `knock({x,z,up}, strength = 1)` → bool (in VR wirkungslos), `eyeY()`, `getY()`, `isGrounded()`.
- `overlay.open(el, {onClose, modal?, escape?})` (hängt in host, gibt Pointer-Lock frei, Esc schließt, sperrt Spielereingabe), `overlay.close()`, `overlay.isOpen()`. Seit 1.17.0 schließt Esc das Overlay nicht, wenn `modal: true` oder `escape: false` gesetzt ist (`runtime.js` `overlayOpen`, Feld `escape`); dann beendet nur der Besitzer per `overlay.close()` (Pflicht-Gate „Mitgliedsantrag“). In VR gibt es kein DOM-Overlay: Toast „In VR noch nicht verfügbar“ und `onClose` per Microtask.
- `stage` (1.17.0): `stage.setScene(scene | null)` wechselt die gerenderte Szene (`null` = Laden-Szene `engine.storeScene`), `stage.isStore()` meldet, ob die Laden-Szene aktiv ist. Muster wie das VR-Kino (`cinema/cinema.js`); die Kamera-Rig-Gruppe hängt in `storeScene` und muss beim Wechsel mit umgehängt werden (`avatar.js` `stageOn`/`stageOff`). Spiegel und `selfview` prüfen `isStore()` (Auto-Ego bzw. matt, solange eine fremde Bühne läuft).
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

### Qualitätsstufe „Ultra“ (1.19.0)

**Stufen und Freigabe**

- `engine/quality.js`: `LEVELS = low|mid|high|ultra`, `rank(lv)`, `atLeast(lv, min)` (unbekannt = mid). Neue Prüfungen immer als `atLeast(lv, 'high')`, nie `=== 'high'`. Ultra-Werte sind Startwerte (Pixeldichte 2, 16x Anisotropie, Schatten, Ladekreis 34, mehr Passanten/Autos/Vögel, dichterer Niederschlag).
- `presetFor('ultra', phone)` liefert immer die Desktop-Spalte (auch bei `phone = true`, also am Tablet); das Preset trägt `level: 'ultra'`.
- Gerätefreigabe ausschließlich über `opts.ultraOk` der Hülle (`features/store/home.js` `ultraAllowed()`): false bei TV und bei grobem Zeiger (`pointer: coarse`) an einem Bildschirm mit `min(screen.width, screen.height) < 600` (Feature-Erkennung, kein UA-Sniffing). Tablet: ja; Handy: nie; VR bleibt bei low/mid. Das 3D-Bundle entscheidet nichts über die Gerätegröße selbst: `store.js` `resolveLevel(setting, ultraOk)` klemmt `ultra` ohne Freigabe auf `high` (Einstellung, Engine-Decke `maxLevel`, Automatik-Decke); Pause-Menü `canUltra()`.
- Die gespeicherte Wahl bleibt bei der Klemmung erhalten: ein auf dem Handy gesehenes `ultra` wird nur wirksam zu `high`, nicht verworfen oder überschrieben (am Desktop gilt es wieder).
- `AutoQuality(level, { max })`: Decke `max`; `setLevel` und das Hochschalten klemmen darauf. Einschwingen nach `reset()` zeitbasiert (`settleLeft` 1,5 s Echtzeit, nicht in Frames), damit Shader-Kompilierung, Textur-Neuladen und der Ultra-Nachbau nicht als Ruckeln gewertet werden. Ultra wird wie die anderen Stufen behandelt (< 50 fps runter, 5 Fenster >= 58 fps hoch, Sperre nach Rückfall).

**Ultra-Registry (`engine/ultra.js`, Provider `ultra`, von `ModuleHost` bereitgestellt; rein, ohne three)**

- `register(key, build, opts?) → remove()`, `isActive()`, `has(key)`, `keys()`, `list()` (`{ key, built, visible, ms, warm }`). `build(ctx)` liefert `{ object, update?(dt, t), dispose?(), onVisible?(bool), more?(), textures? }`; `opts.parent` (Standard `ctx.scene`), `opts.gate()` (zusätzliche Sichtbarkeitsbedingung, z. B. Bereichs-Culling, pro Frame geprüft; solange false weder `update` noch Zeichnen).
- Bau lazy im Leerlauf (`requestIdleCallback`, Rückfall `setTimeout`; je Häppchen höchstens ~6 ms, ein Eintrag wird nie geteilt). Teilschritte: liefert `build()` zusätzlich `more()` (true = noch Arbeit), läuft danach je EIN Aufruf pro Häppchen; große Einträge (z. B. die 512er-Texturen) sprengen so das Budget nicht.
- Vorbau nur, wenn Ultra erreichbar ist: `opts.ultraOk === true` UND Einstellung `auto` oder `ultra` (`ctx.qualitySetting()`; fehlt sie: wie auto), dann ab Stufe >= `high`. Sonst wird nur gebaut, wenn die Stufe wirklich `ultra` ist (fest gewähltes low/mid/high und Handy bauen nichts vor).
- Sichtbar = Stufe `ultra` && nicht per `?ufx=` abgeschaltet && gebaut && `gate()`. Das Umschalten setzt nur `visible` (und ruft `onVisible`), die Basiswelt wird nie neu gebaut. `update` läuft nur für gebaute, sichtbare Einträge; `dispose()` des Hosts entsorgt alle (`api.dispose` bzw. `disposeTree`).
- Vorwärmen (`engine/warm.js`, rein, Duck-Typing): nach dem Bau (und fertigem `more()`) kompiliert ein EIGENES späteres Häppchen (ein Eintrag je Häppchen) die Programme (`renderer.compileAsync`, Rückfall `compile`) und lädt die Texturen hoch (`renderer.initTexture`), damit der erste Blick keinen Hänger erzeugt. `warmObject(renderer, object, camera, scene, { textures, debug })` zeigt das Objekt dafür kurz sichtbar und stellt die Sichtbarkeit synchron wieder her. `scheduleWarm(ctx, getList, { delayMs })` wärmt einmalige Objekte (Blitz, Atem, Niederschlag) nach dem Start im Leerlauf (Standard 2,5 s Verzögerung, ein Objekt je Häppchen, höchstens einmal je Objekt); `ok()` je Eintrag sagt, ob das Objekt auf der AKTUELLEN Stufe gezeichnet werden kann: nur dann wird gewärmt (keine nie gezeichneten Programme), `cancel.retry()` (nach Stufenwechsel oder gesetzter Textur) nimmt zurückgestellte Objekte erneut dran.
- Warm-Zeichnen (`createWarmDraw` in `engine/warm.js`, 1.19.0, nur `high`/`ultra`, nie XR): `compileAsync` allein reicht nicht, der Treiber baut die Pipeline erst beim ersten ZEICHNEN (je Programm ~8–10 ms blockiert). `store.js` ruft `stepWarmDraw()` je Tick VOR dem Hauptbild: je Programm-Schlüssel (`warmKey`: Material, Instanz-/Skin-Flags, Geometrie-Attribute) ein Vertreter der sichtbaren Szene wird in Häppchen gezeichnet, je Häppchen einmal in ein 16²-Target (`makeTarget`, Spiegelvariante des Überwachungs- und Salonspiegels, linearer Ausgabe-Farbraum) und einmal ins Hauptbild (wird im selben Frame überzeichnet). Technik: Häppchen-Objekte und Lichter bekommen kurz die Hilfsebene `WARM_LAYER` (30), die Kamera sieht nur diese, Culling aus, `info.autoReset`/`shadowMap.autoUpdate` aus; alles wird im `finally` exakt zurückgesetzt. Nach Bereich ausgeblendete Gruppen (Laden, Regale, Hof, Palast-/Salon-Innenraum) meldet der Provider `city.warmRoots()`; sie werden dafür kurz sichtbar. Vor „Fertig“ hält das Ladebild bis zum Ende des Vorwärmens (höchstens 4 s, `warmHold`), mit großem Zeitbudget (Boost); im Spiel höchstens 2 Vertreter je Pass und ~8 ms je Bild. Stufenwechsel/Neu-Sichtbares wird per Rescan (alle 4 s bzw. bei Stufenwechsel) nachgeholt. Gerätesperre: nur mit `ultraOk === true` (Desktop/Laptop/Tablet, Freigabe der Hülle); auf Handys bleibt alles wie 1.18.1 (kein Vorab-Zeichnen, kein Ladebild-Hold), auch auf `high`. Rescan-Kosten: der Programm-Schlüssel je Objekt ist per `WeakMap` gememoisiert (Material-Referenzen, Geometrie, Flags); eine unveränderte Szene baut beim Rescan keine Strings neu. Debug: `__lfxStore.warmDraw()` → `{ done, pending, drawn, chunks, ms, maxChunkMs, keys, failed, scanMs, keyBuilds }` (auf gesperrten Geräten `{ off: true }`). Messbeleg (Netzteil, echte GPU, `gpu-ab.mjs`): Standbilder im Nebel 356–811 ms → höchstens 56 ms (high und ultra, 5/5 Läufe); Laden, Bilder > 33 ms: 49 → 14 (mit Streifen-Upload, 6 Läufe), > 50 ms: 18 → 9. Restwert: ultra/Laden Blickrichtung 0 zeigt reproduzierbar ein ~77-ms-Bild (Ursache offen; Verdacht `copyTextureToTexture` mit je 5 synchronen `getParameter`-Aufrufen oder mehrere 2048²-`texStorage2D` im selben Bild). Messfallen: `gpu.mjs` misst erst 1,2 s nach dem Drehen (SETTLE) und verdeckt dadurch Erstblick-Hänger, dafür `gpu-ab.mjs` nehmen; das Harness-Platzhalter-Cover per `toDataURL` las die GPU zurück (10–1000 ms Hänger je neuem Cover), deshalb jetzt CPU-Leinwand mit `willReadFrequently`.
- Streifen-Upload der 2048²-Hi-Cover (`covers/stripe.js`, 1.19.0): ein Upload am Stück blockiert den GPU-Prozess 25–56 ms. `composeHi` zeichnet den Atlas wie bisher, legt dann eine Zieltextur ohne Daten an (`DataTexture`, `source.dataReady=false`, flipY, sRGB, Mipmap-Filter) und kopiert pro Tick einen von 8 Streifen mit `renderer.copyTextureToTexture` (Quellbereich; Zielposition `y = a`, weil flipY das ganze Bild dreht), Mipmap-Kette erst im letzten. Erst danach hängt die Textur am Material (`stepHiStripes`, `f.hiLoading.stripe` zählt als laufender Hi-Load). Am Handy (`phone`) und ohne `copyTextureToTexture` am Renderer (Test-Attrappen) oder bei nicht teilbarer Höhe lädt `composeHi` wie vorher in einem Stück hoch. Pixelgleich zum Einzel-Upload (Chrome/ANGLE d3d11 geprüft, 2048² und Mip).
- Dev: `?ufx=-key1,-key2` (aus) bzw. `?ufx=only:key` (nur dieses); Debug `__lfxStore.ultra()` (Liste wie `list()`).

**Ultra-Module (Registrierung beim Provider `ultra`; Reihenfolge siehe unten; nur Dekor, keine Kollider, keine Interaktion)**

| Modul | Keys | Inhalt |
|---|---|---|
| `ultra-light` (`world/build-ultra-light.js`) | `neon`, `pools`, `shadows` | Neon-Halos an Schildern, Lichtpools auf dem Boden, Kontaktschatten (Passanten, geparkte Autos über `traffic.parkedCars`, Mitspieler über `net.peerPositions()`). `neon`/`pools` hängen an der Straßengruppe, `shadows` an der Szene |
| `ultra-city` (`world/build-city-ultra.js`, `world/ultra-plan.js`) | `facade`, `street`, `trees`, `skyline` | Gesimse, Fensterrahmen, Fallrohre, Klimageräte, Dachdetails; Bordsteinfasen, Gullys, Poller, Mülleimer, Schilder; Straßenbäume als `InstancedMesh` (Kronen mit Schnee); ferne Silhouetten als Ring um die Kamera (>= 50 m). Folgt den Bereichsgruppen von `city` pro Bild (`gate`/`sync`), damit das Bereichs-Culling greift |
| `ultra-room` (`world/textures-ultra.js`, `world/build-room-ultra.js`) | `tex`, `posters`, `clutter`, `lamps`, `dust` | 512²-Texturen statt 256² (Tausch der `map` per `onVisible`, im Leerlauf eine Textur je Häppchen), Plakate, Tresen-Kleinkram, Preisschilder, Lampen mit Halo, Staub; zusammen +5 Draw-Calls |
| `ultra-figures` | `figures` | Abstands-LOD der Figuren-Details (`setDetail`): Finger, Gürtel, Schuhkappen, Ohren, Brauen in <= 14 m (aus ab > 16 m), Prüfung alle 0,5 s, höchstens 4 Wechsel je Prüfung; kein zusätzlicher Draw-Call. Cache-Schlüssel `|d` (Detail) bzw. `|w` (Winterkleidung); ohne Flag bleibt `makeLook`/die Figur bitgleich |
| `ultra-wet` | `wet` | nasse Straße, siehe „Echtes Wetter in 3D“ |

- Provider `traffic.parkedCars()` → ein Rechteck `{x0,z0,x1,z1}` je geparktem Auto (neben `parked()` mit 3 Kollidern je Auto); von den Kontaktschatten gelesen.

### Provider und Module (Stand 1.19.0)

Reihenfolge in `MODULES` (`modules/index.js`; Provider müssen vor ihren Nutzern stehen, fremde Provider trotzdem erst bei Gebrauch holen): `sound, city, door, intro, precip, daytime, weatherfx, ultra-wet, props, throw, cashier, brawl, rent, snack, tv, npc, traffic, kiosk, palast, terminal, returns, reserve, staff, showcase, discover, avatar, member, selfview, shopmirror, salon, xrchar, fight, gang, ultra-light, ultra-city, ultra-room, ultra-figures, net`. Seit 1.19.0: `precip` (Provider `precip`) vor `daytime`; `weatherfx` und `ultra-wet` direkt nach `daytime` (lesen den Provider `weather`; `ultra-wet` braucht die Straßengruppe von `city`); die Ultra-Module `ultra-light`, `ultra-city`, `ultra-room`, `ultra-figures` stehen nach `gang` und vor `net` (sie lesen `city`, `npc`, `traffic`, `selfview` erst bei Gebrauch). `city` stellt `areas`/`city` vor allen Nutzern bereit; `npc` → `traffic` → `kiosk` (Kiosk braucht `npc`); `palast` nach `city`; `discover` vor den Figur-Modulen (`avatar` liest die Entdeckungen für die Freischaltungen); die Figur-Module (1.17.0) und `fight`, `gang` (1.18.0; `fight` vor `gang`, beide holen `npc`, `cashier`, `net` erst bei Gebrauch) stehen vor `net`, das als letztes bleibt. Ihre Provider holen sie untereinander und aus älteren Modulen erst bei Gebrauch (`ctx.use('x')?.…`).

| Provider | Form | Modul | Zweck |
|---|---|---|---|
| `terminal` | `{ open(q) }` | `modules/terminal.js` | Kassen-PC (Overlay mit Suche, Hinführen, „Über den Tresen“); `instance.openTerminal(q)` delegiert hierher, sonst Toast. Ergebnisse werden clientseitig mit `modules/search-rank.js` gerankt (exakt > beginnt mit > Wortanfang > enthält > Rest; Rest entfällt ab 5 Titeltreffern). Die Auswahl per Pfeiltasten (Fokus bleibt im Suchfeld) wird über eine eigene unsichtbare Live-Region (`role="status"`) angesagt. |
| `intro` | `{ run() → Promise }` | `modules/intro.js` | Rollladen-Intro von draußen; öffnet die echten Türflügel `lfx-door-left`/`lfx-door-right`. Läuft nur ohne `opts.skipIntro`/`restore`/`openItemId`/`openTerminal`. |
| `sound` | `{ play(name, opts), ambient(on), duck(key, on), laser(on) }` | `modules/sound.js` | Web-Audio (synthetisch); folgt `onSound(on)` und `ctx.soundOn()`. Startwert `opts.sound` (Standard an); der Pause-Menü-Schalter ruft `setSound` → Module `onSound` + `deps.onPrefs`. `duck`: Set aktiver Schlüssel, stärkste Dämpfung gilt (`'tv'` ×0,12, `'talk'` ×0,45); `duck(bool)` = `duck('tv', bool)`. Lautlos-Schalter am iPhone wird respektiert (kein `navigator.audioSession`). Seit 1.18.0 `laser(on)` (Summen-Schleife, solange der Laser leuchtet) und die Effekte `slap, belt, whip, laser, ouch, candy, pop, ko`. |
| `cashier` | `{ event('couchSit'\|'couchStand'\|'playerKO'\|'laserHit'), voiceInfo(), richard(), speaker(opts) }` | `modules/cashier.js` | Kassierer Richard: erzwungene Zeile als Blase (auch über offenem Overlay); `richard()` = Hand für `brawl` (siehe „Richard wehrt sich“); `speaker(opts)` = Sprecher-Regie für Personen (1.17.0, siehe „Figur, Ausweis, Salon“; seit 1.18.0 für alle NPCs). `playerKO` (Spieler ging K.O.) und `laserHit` (Laser aufs Gesicht) lassen Richard auch von draußen rufen. |
| `couch` | `{ seated() }` | `modules/tv.js` | Solange man sitzt, spricht Richard nicht von sich aus. |
| `weather` | `{ tod: 'day'\|'dusk'\|'night', raining, hour?, lampsOn, sheltered(x, z, y) }` | `modules/daytime.js` | Tageszeit/Regen für Kulisse und Stimmung; andere Module lesen sie (`ctx.use('weather')`). `lampsOn` = nicht am Tag, `sheltered` = Laden, Palast, unter dem Vordach. |
| `areas` | `{ current(), at(x,z,y), on(fn(id, prev)) → off }` | `modules/city.js` | Bereich des Spielers (`areaAt`), Prüfung alle 0,15 s. |
| `city` | `{ data, groups, signals(), visible(), partition() }` | `modules/city.js` | Stadt, Ampeluhr, Sichtbarkeit; Details „Open World“. |
| `door` | `{ override(v\|null), open(sec), lock(sec)/unlock()/isLocked(), registerActor(fn) → remove, amount(), onChange(fn) → off }` | `modules/door.js` | Automatiktür samt Hausverbot-Sperre. |
| `physics` | `{ spawn, hitTest, bodiesNear, count, pickable, hold, launch, hoopState, … }` | `modules/props.js` | Objekte, Werfen, Korb. |
| `npc` | `{ figure, staff, nearestPerson, people, registerPerson, say, scare, reserve(n, key = 'net'), overflow(), speak, temperOf, laserHit, react, throwProp, attackers }` | `modules/npc.js` | Passanten, Personal, Tiere. 1.18.0: `say` läuft über die Sprecher-Regie, `speak(handle, text, { id, voiceSeed, prio, ms })` → `Promise<'spoken'\|'bubble'\|'muted'>`, `temperOf(handle)` → `'shy'\|'normal'\|'hot'`, `laserHit(handle)`, `react(event, data)`, `throwProp(kind, from, to)`, `attackers()`; `registerPerson` kennt `onHit(dir, { weapon })` und `onLaser()`; Details „NPCs und Raufen (1.18.0)“. `reserve(n, key)` belegt `n` Figuren-Slots (Passanten sinken um die Summe aller Schlüssel; `n <= 0` löscht den Schlüssel, höchstens 64); Schlüssel `net` (Mitspieler, `net/peers.js`) und `self` (Außenansicht, `selfview`). `overflow()` = `max(0, Summe − aktuelle Passanten-Höchstzahl)`; `peers.js` senkt damit sein Figurenlimit um den fremden Überlauf (ohne den eigenen Anteil, sonst schwingt es). Die Passanten sinken höchstens auf 0. |
| `avatar` | `{ look(), code(), slots(), active(), setSlot(i), needsGate(), gate(), openEditor(where, focus?, { live? }), onChange(fn), onPreview(fn), hash(), changedFor(npc), changeKind(npc), markSeen(npc), lastChange(), portrait(code), setCode(code, { commit }), randomize({ commit }), setColor(part, idx) }` | `modules/avatar.js` | Eigene Figur: Konto-Profil, Gate, Editor, Studio; siehe „Figur, Ausweis, Salon (1.17.0)“. |
| `member` | `{ cardData(), ensure(), showCard(data, { mode, ms? }), count(kind, itemId) }` | `modules/member.js` | Mitgliedsausweis und Zähler. |
| `selfview` | `{ mode(), setMode(m), toggle(), eye(out), figure(), playAnim(name) }` | `modules/selfview.js` | Eigener Körper, Außenansicht (V). |
| `salon` | `{ busy(), inside(), sitting() }` | `modules/salon.js` | Friseursalon FRISEUR HAARSCHARF. |
| `shopmirror` | – (keine öffentliche API) | `modules/shopmirror.js` | Überwachungsspiegel über der Ladentür. |
| `xrchar` | `{ open() → bool }` | `modules/xrchar.js` | „VR light“-Figurpanel (nur in VR). |
| `traffic` | `{ zebraClear(edge), cars(), parked(), laserHit(point), blindDriver(ref, { decel?, stand? }) }` | `modules/traffic.js` | Autos; `laserHit`/`blindDriver` seit 1.18.0 (Laser blendet Fahrer). |
| `brawl` | `{ state(), isBanned(), canTalk(), hitBy(source, dir?), getNetState(), applyRemote(net) }` | `modules/brawl.js` | Richards Streit. `hitBy` kennt seit 1.18.0 zusätzlich `'laser'`, `'whip'`, `'belt'`, `'hand'`. |
| `fight` (1.18.0) | `{ weapon(), setWeapon(id), cycle(dir), wheel(open), energy(), protected(), onKO(fn) → off, koSeat(o?), hitPlayer({ dmg, knock:{x,z}, src:'npc'\|'gang'\|'pvp'\|'richard', from }) → bool, blindPlayer(ms) → bool (Alias `blind`), laserState(), onLaser(fn) → off, swingOk(), swung(ev), laser(on) → bool, auxDown(), auxUp(), heldWeapon(), poseCode(), sitting() }` | `modules/fight.js` | Waffen, Energie, K.O., Schutz, Laser, PvP-Empfang; Eingabe-Nähte ruft `store.js`. |
| `gang` (1.18.0) | `{ active(), members() → [{ i, handle, st, hp, pos }], hit(i, weapon, dir?) → bool, role() → 'local'\|'leader'\|'follower' }` | `modules/gang.js` | Rowdy-Bande (geteilte Führung). Bei Fehlen von Stadtdaten oder `?npc=0` eine Attrappe (`active() → false`). |
| `animals` (1.18.0) | `{ laser(point {x,z}\|null) }` | `modules/npc.js` | Laserpunkt für Katze und Tauben; der Aufrufer meldet ihn jeden Tick, ein Punkt gilt 0,35 s. |
| `emotes` (1.18.0) | `{ open() → bool, emote(x) → bool, usable() → bool, onPlayerEmote(fn({ name, code, anim })) → off }` | `modules/net.js` | Emote-Rad auch ohne Mehrspieler; NPC-Reaktionen hängen an `onPlayerEmote`. |
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
- `spawns`: `shop, street, palast, salon, yard, kiosk, alley, roof` (nur `roof` mit `y 3,3`; `salon` seit 1.17.0).
- `sidewalkPaths[]` `{ id, pts, waits }` (`waits[i]` ∈ `null|'main'|'side'|'mid'` für Strecke `i→i+1`): `walkN, walkS, crossW, crossE, crossMid`, Stichleitungen `shopDoor, palastDoor, alleyMouth, kioskFront`. Passanten laufen nie per A*; Fußwege liegen mindestens 0,45 m neben festen Dingen.
- `lanes[]` (`mainW, mainE, sideS, sideN`: `{ dir, z|x, from, to, speed, stop:{ at, axis, signal }, yields }`): Autos sind rein kinematisch und **keine** Rasterkollider. Außerdem `zebras`, `signals` (Ampelmasten), `lights` (Laternen), `signs` (nur „LENZ PALAST“, „KIOSK“, „HINTERHOF“, „LENZSTRASSE“, „BAHNWEG“), `shopFronts[]` (sieben erfundene Läden), `litfass`, `discoverSlots`, `propSlots` (`ball|crate|can|cone|box`), `kiosk { hut, counter, vendor, awning, table }`, `yard { …, hoop, graffiti, laundry }`, `escape` (Feuertreppe), `roof { …, y 3,3, gate }`, `doorPosts[2]`, `doorBlock`.
- Rein: `signalAt(t)` (Ampel, Zyklus 24 s: main grün [0; 10), gelb [10; 11,5); side grün [12; 18,5), gelb [18,5; 20); nie beide grün; dazu `walkMain`/`walkSide`), `areaAt(layout, x, z, y)` → `roof, escape, palastHall, palastFoyer, salon, shop, doorway, yard, alley, kiosk, palastEntrance, crossing, sideN, sideS, street, outside` (`AREAS`; Regen fällt in `OUTDOOR_AREAS`), `visibleGroups`, `resolveRestore`, `standSurfaces`.

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
| F / G | Schlagen (`hit`, seit 1.18.0 mit der gewählten Waffe) / Werfen (`throw`: getragene Hülle werfen, sonst Ding aufheben (1. G) und werfen (2. G)) |
| R halten, 1–4, Mausrad (1.18.0) | Waffenrad (Loslassen wählt das markierte Segment) / Direktwahl Hand, Gürtel, Peitsche, Laser / nächste bzw. vorige Waffe; F oder Linksklick (ohne Ziel) angreifen, beim Laser gehalten = leuchten; Details „NPCs und Raufen (1.18.0)“ |
| T (1.18.0 auch ohne Mehrspieler) | Emote-Rad |
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
- `palast/choice.js` (rein): `createTicketBook()` (`get/has/buyShow/handIn/clear/onChange`, `getNetState()`/`applyRemote()` für den Mehrspieler), `tapeOf`, `showRows` (laufend: „läuft schon – du startest von vorn“; vorbei: „läuft gerade nicht – startet für dich von vorn“), `seatGate`, `ticketText/ticketToast/tearLine`.
- `palast/plan.js` (rein): `buildPlan(city.palast)` → Stufen/Ränge/Sitzblöcke als Kollider mit Höhe, `seats[{ id, x, y, z, yaw, row, base }]`, `aisle`, `bounds`, `screen`, `curtain`, `stations`, `posters`; `stationsOf(p)`, `outerPosterSlots(p)`. Saal: 6 Reihen à 1,1 m, `rise = min(seatBlock.rise, 0,14)` (Stufen ≤ 0,28 m am Eingang), Reihe 0 hinten am höchsten, `aisle` auf Bodenhöhe vor der ersten Reihe. Leinwand `radius 16, bottom 1,8, maxW 10,5, maxH 4,9` (Oberkante 7,3 m unter der Decke 7,5 m), Anker `rotation.y = π`. Weitere Dateien: `hall.js` (Saal, liefert das `saal`-Handle, Sitze instanziert), `foyer.js`, `board.js`, `panel.js` (Kassen-Overlay, DOM, CSS in `themes/store/palast.css`).
- Provider `palast`: `stations` (Weltkoordinaten `ticket`, `popcornStaff`, Tresen `kasse/popcorn/ticketDesk`), `test({ item?, autostart? })`; die Personal-Figuren platziert `npc` selbst über `stationsOf`.
- **Ablauf:** Kasse/Anzeigetafel/Plakat → Overlay `.lfx-store-palast-pick` (Programm; „Eigene Kassette abgeben“, wenn `ctx.items.carried()`) → Ticket → Hinsetzen (`Platz <Reihe><Nr>`, Interaktionen nur im Saal, `anyHeight`) → `cinema2d.sit(id)` + `cinema2d.play(item, { resume })`. Ohne Ticket: Toast „Erst ein Ticket an der Kasse holen“. Kartenabreißer: mit Hülle in der Hand Kassette abgeben (danach `ctx.items.drop()`), sonst Spruch. Das Ticket verfällt, wenn das Kino endet. In VR gibt das Foyer nur einen Toast; Hinsetzen ruft direkt `deps.play` (VR-Kino), keine 2D-Leinwand. Der Saal wird nur in Foyer/Saal (oder VR) gezeichnet. Entdeckungen `palast-film` beim ersten `playing`, `palast-tape` bei mitgebrachter Kassette.

**Kino-Kern** (`cinema/`, VR und 2D teilen sich diese Teile): `startwatch.js` (Start-Watchdog als reine Zustandsmaschine; `WATCH` { `NO_VIDEO_MS` 25000, `STALL_MS` 15000, `MAX_START_MS` 60000, `PREPARE_MS` 8000, `PAUSED_HOLD_MS` 1500, `SLOW_START_MS` 3000 }; `createStartWatch(cfg)` → `{ reset, step, shiftClock, marks, … }`, `step()` liefert unabhängige Felder `{ event: null|'start'|'pausedStart'|'fail', code?, paused?, slow, prepare }`), `feed.js` (`createFeed`, Takt 250/200/100 ms), `failcodes.js` (`FAIL`, `failToast`), `controls.js` (`stepVolume`, `applyVolumeStep`), `ambient.js` (`trackBlack`, `BLACK` { `MIN_VIDEO_S` 10, `WINDOW_MS` 90000 }, Zustand `seen`, Abtaster `.tainted`), `screen.js` (`createScreen({ radius, bottom, maxW, maxH, padW, padH })`, Standard = VR-Maße). `engine.setRenderEnabled(on)` überspringt nur `renderer.render` (`tick` läuft weiter: Bridge-Polling, Watchdog).

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
| `sit(seatId?)` | Spieler einfrieren, Pose merken, Leiste, Kamerafahrt, Ton dämpfen; ohne Id der nächste Sitz; false ohne Saal/Sitz oder bei offenem Overlay. Bereits sitzend: Platzwechsel (`_moveSeat`) = nur Kamerafahrt zum neuen Sitz, `seatId` wechselt, Film/Leiste/Phase unberührt; `modules/palast.js` `sit()` startet dann bei laufendem Kino (`active`) kein erneutes `play` |
| `beforePlay(item)` / `play(item, o)` | Start über `app.deps.play`; der `wrapDeps`-Zweig ruft vorher `beforePlay` (Lauf aufsetzen, Leinwand bauen, sitzen, `deps.onCinema2d({ active: true, full: false })`) und reicht `noCover: true` weiter; `beforePlay` false bei Bau-Fehler (B) → normaler 2D-Weg |
| `stand({ pause = true })` | Aufstehen: pausiert nach frischem Bridge-Zustand `playing` (auch bei Esc), Overlay zu, Kamera frei, Spieler an `aisle`; `active` bleibt wahr; Wiederhinsetzen per `sit()` (Interaktion am Sitz): gleicher Film (`sameFilm(item)`) → kein neues `play`, `resumeAfterStand()` setzt nur eine durch Aufstehen ausgelöste Pause fort (Flag `_pausedByStand`, idempotent); anderes Ticket oder Film zu Ende → Neustart wie bisher (1.16.0) |
| `stopAndRelease()` | Saal verlassen: `bridge.stop()`, dann `leave('stop')`; läuft der Start noch ohne Player, vorgemerkt (`backPending`) |
| `setFull(on, { notice })` | Vollbild (Bühne ausblenden), meldet `{ active, full }`, `engine.setRenderEnabled(!on)`, Desktop-Steuerung ab/an |
| `leave(reason, code)` | `home, stop, fail, suspend, dispose, saal, build`; idempotent; räumt Leinwand/Untertitel/Ambient/Leiste/Wächter, Spieler an `aisle`, Toast („Film beendet“, „Abspann vorbei“, „Kino konnte nicht starten (Code)“) |
| `tick(dt, now)`, `diag()`, `getNetState()`/`applyRemote()` | `tick` aus `StoreApp.tick` (nur aktiv, nicht in XR); `diag()` = `{ phase, active, full, seated, failCode, fallbackCode, videoFrames, marks, renderEnabled }`; Netzform für den Mehrspieler (`getNetState`, `applyRemote`) |

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
| Schwarze Leinwand | `trackBlack` (10 s Videozeit exakt 0, nur in den ersten 90 s und nur, solange die Probe in diesem Lauf noch nie Farbe gezeigt hat – Schwarzblenden im Film lösen also nichts aus; seit 1.16.1, vorher 6 s ohne diese Bedingung) oder Abtaster `tainted`: Vollbild „Leinwand nicht verfügbar“, danach nie wieder (kein Pendeln) |
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
- Reaktionen: annoyed taumelt und wird rot (`hit1`); shove schubst per `ctx.player.knock` (nur < 2,8 m); throw: Sterne (nicht bei `prefers-reduced-motion`), 3 Kassettenwürfe im Abstand 1,4 s über `physics.spawn({ kind: 'tape', owner: 'richard', … })`, `onHit` mit `player: true` → `knock` + `throwHit`; zusätzlich werden Kassetten mit Physikkörper gegen die Spielerpose geprüft (horizontal < 0,75 m, vertikal < 0,9 m), weil die Physik einen stehenden Spieler nicht meldet; chase (ab 1.15.0 robust): Sprung über den Tresen (Skript-Bogen 0,85 s, Scheitel 1,45 m) auf einen freien Punkt der Kundenseite (`landingPoint`: nav-frei, ≥ 1,1 m vom Spieler, seitlich versetzt; nie auf dem Tresen, Wächter `onCounter` springt ihn sonst herunter). Treiben: Schubs-Richtung = nächster Pfadpunkt des A* vom SPIELER zur Tür außen (`driveDir`, `goal = (doorCx, D + 0,9)`; vom Tresen/Pen aus beginnt der Pfad an der Kundenseite), Richard läuft per A* (strict: ohne Pfad keine Luftlinie) 0,9 m hinter dem Spieler, Schubs (Stärke 1,1) alle 0,7 s bei < 2 m. Rückfall (`expelPlayer`): ist der Spieler nach `CHASE_GIVEUP` = 12 s noch im Laden (oder nach `PEN_GIVEUP` = 4 s im geschlossenen Kassenbereich), blendet `.lfx-store-expelveil` ab (bei `prefers-reduced-motion` ohne Animation), Spruch `expel`, Spieler wird per `player.teleport` vor die Tür gesetzt (`(doorCx, D + 2,2)`, Blick nach Norden = zur Tür), dann `expelled` → sofort Hausverbot. Richard verlässt den Laden nie.
- banned: `door.lock(32)` (der Automat entsperrt nach 30 s selbst), Schild „HAUSVERBOT“ (Canvas, `y 1,12` außen an der Tür; Schrift per `measureText` eingepasst), DOM-Countdown `.lfx-store-banhud` (unten, `bottom: 24 %`), Richard steht hinter der Glastür bei `(doorCx, D − 1,5)`. Gesperrt wird erst, wenn der Spieler hinter `doorBlock.z1 + 0,5` steht (`lockPending`), `richard-ban` erst bei wirksamem Hausverbot (`applyBan`). Sicherheitsnetz: steht der Spieler trotzdem im Laden, wird die Tür sofort entsperrt (→ grudge). Bleibt der Spieler nach dem Rauswurf im Türspalt stehen, läuft nur der Countdown (ohne Sperre und Schild).
- grudge (10 min, `sessionStorage['lfx.store.richardGrudge']` = Ablaufzeit in ms): Tür auf, Richard kehrt zurück und springt hinter den Tresen (steht der Spieler auf dem Zielpunkt, wartet er vor dem Tresen und versucht es jede Sekunde erneut); Begrüßung `grudgeGreet`, gelegentlich `grudgeIdle` (alle 45–85 s, im Laden, < 9 m). `canTalk()` (Dialog „Mit Richard reden“) nur in calm/annoyed/grudge und nur am Platz.
- Hand `cashier.richard()` → `{ root, head, mouth, armL, armR, legL, legR, home, pos, collider, inStore(), place(x, z, y, yaw), control(on), setBusy(on), say(cat, vars, opts) }`; `control(true)` schaltet die Leerlauf-Animation ab, `setBusy(true)` unterdrückt Plaudern. Richards Kollider wird per `moveCollider` mitgeführt (kein Nav-Neuaufbau, das Raster behält die Sperre am Tresenplatz). `brawl.js` setzt `root.rotation.order = 'YXZ'` und setzt es in `dispose()` zurück.
- Begrüßung (`cashier.js`): nur, wenn der Spieler in `zones.store` steht; beim Start draußen beim ersten `return` nachgeholt (danach frühestens nach 90 s); draußen spricht `speak()` nur mit `outside: true` (Rufe bei Diebstahl, Chase, Hausverbot).
- Ausleihen (`rent.js`): Mit getragener Hülle zeigt Richard „Hülle ausleihen“ (schon Ausgeliehenes: „Mit Richard reden“); `tryRent()` (Piep, Spruch `rentOk`, Toast), `rent(id)` merkt in `sessionStorage['lfx.store.rented']` (nur Sitzung, nichts an Jellyfin). Diebstahlsicherung: nicht ausgeliehene Hülle in der Hand und Linie `z = D − 0,7` nach außen überschritten → `sound.play('alarm')`, Warnlichter an den Pfosten (`city.doorPosts`) blinken 3,2 s, Richard ruft `theftShout`; ohne Strafe, einmal pro Hülle und Minute (`createTheftGuard`).
- Sprüche (`cashier-lines.js`), neue Kategorien: `hit1–3, shove, throwLine, throwHit, hitObject, chase, expel, ban, banGlass, banEnd, backHome, grudgeGreet, grudgeIdle, rentOk, rentAlready, theftShout`; seit 1.18.0 `playerKO`, `laserHit`, `whipHit`, `beltHit`; keine Beleidigungen, kein Blut. Entdeckungen `richard-ban`, `richard-rent`.
- Waffen (1.18.0): Der Schlag nutzt die Reichweite der gewählten Waffe (`ev.range`, Standard 1,6 m), Gürtel und Peitsche lösen die Sprüche `beltHit`/`whipHit` aus (`doHit(source, dir, kind)`, `modules/brawl.js`). Der Laserblick zählt wie ein Treffer (`brawl.hitBy('laser', dir)`, 0,5 s Verweilzeit auf Richards Kopf): Zustand `annoyed` wie beim ersten Schlag, Pose `cover` (Hände vor den Augen, 1,6 s, `ANIMS` in `brawl-pose.js` um `cover` verlängert, nur anhängen), Spruch `laserHit`, kein Rückstoß. Im Mehrspieler überträgt `getNetState` `cover` als `stagger` (der Worker klemmt `rs.a` auf 0..9, eine Erweiterung träfe alte Clients; `modules/brawl.js` Z. 429).

### Physik und Objekte (`physics/*`, `modules/props.js`, `modules/throw.js`)

- Kern `createWorld` (rein, ohne three): Kugel- und Quaderkörper (Kreis am Boden, keine Rotationsdynamik: Gierdrehung, Rollen, Kippen, Purzeln; `orientationOf(b)`), Festzeitschritt 1/60 s (max. 6 Schritte, Eingabe ≤ 0,1 s), Höchstgeschwindigkeit 16 m/s mit Unterteilung (kein Tunneln dünner Wände). Kollision mit `layout.cidx` + `layout.dyn` über eigene Prüfung (`queryColliders`, **nicht** `resolveCircle3`/`groundHeight`: deren `STEP_H` 0,35 ließe Bälle über die Feuertreppen-Stufen (0,33) hochploppen); Kanten bis 0,2 m werden überrollt. Körper-Körper per Zylinder-Näherung (Stapeln, Impulsstoß). Spieler = kinematischer Zylinder (`setPlayer`; Geschwindigkeit aus dem `getPose()`-Delta, Sprünge > 0,5 m je Frame = Teleport = 0). Schlaf bei `|v|² < 0,0225` für 0,35 s; wache Körper sind auf `presetFor(level, phone).propsMax` begrenzt. Netzformat (1.16.0): `snapshot(all)` → `[{ i, k, p, v, y, t, s, ax?, az? }]`, `applyRemote(list)`.
- Provider `physics`: `spawn({ shape, size|radius, mass, pos, vel, spin?, mesh?, kind, owner?, ttl?, onHit? })` → Körper `{ id, kind, pos, vel, mesh, sleeping, impulse(v), remove() }`, `hitTest(origin, dir, range, coneDeg)`, `bodiesNear`, `count`; `onHit({ other, collider, player, speed })` ab ~1 m/s mit 0,15 s Sperre, `player: true` bei Spielerkontakt ab 2,5 m/s (nicht bei `owner: 'player'`); das Paket ruft nie selbst `knock`. Zusätze `world`, `pickable(pose, dir)` (Kegel 40°, 1,2 m), `hold`, `launch`, `geometryOf`, `tapeMesh`, `hoop`, `hoopState()`, `snapshot()`, `applyRemote()`. `impulse(v)` ist eine Geschwindigkeitsänderung in m/s. Hat ein `spawn`-Mesh keinen Elternknoten, legt das Modul es in `lfx-props`; der Aufrufer räumt sein Mesh bei `remove()` ab.
- Arten (`kinds.js`): `basketball, soccer, can, cone, crate, box, bin, standee, tape`; `throwable`: Bälle, Dose, Hütchen. Plätze: `city.propSlots`, Mülltonnen (`binL/binR`, `binYard`), zwei Aufsteller „Neu im Verleih“ im Laden (`W/2 ± 2,7`, `D − 1,5`), Dosen-Pyramide (6 Dosen) im Hof, zwei Basketbälle vor dem Korb; jeder Platz wird über `findSpot` gegen Kollider geprüft. Alle starten schlafend; `home.js` setzt verschobene Dinge nach 120 s Ruhe zurück, wenn weder Platz noch Körper im Blickfeld (Kegel ~72°, < 45 m) sind. Darstellung: ein `InstancedMesh` je Art (Vertexfarben, Tageszeit-Tönung über `out.tint`), Sichtbarkeit `city.visible()` + Abstand (low 24 m, mid 32 m, high 40 m).
- Schlagen (`hit`, prio 10): Kegel ±25° in XZ, 1,6 m, Höhenband −0,15…+2,1 m ab den Füßen, Impuls in Blickrichtung plus leicht nach oben, Nachbarn < 0,4 m bekommen einen halben Stoß; `thud`/`clang`.
- Werfen (`throw`, prio 10): Hülle in der Hand → `ctx.items.release()` → Körper `tape` (Cover als Textur, 9 m/s nach vorn-oben), liegt nach der Landung flach, nach 6 s zurück ins Regal (`items.restore(id)`); E in 1,8 m Abstand hebt sie wieder auf. Hand leer: 1. G hebt ein aufhebbares Ding in 1,2 m auf, 2. G wirft (8,5 m/s), E legt ab. Wurftreffer (> 3 m/s, einmal je Ziel und Wurf): Richard über `brawl.hitBy('object', dir)` (Trefferzone um Richards echte Position, Radius 0,9 m, Höhe `pos.y .. pos.y + 2,1`; ohne `cashier`-Provider feste Zone an der Kasse), Passanten über `npc.nearestPerson(x, z, 0,55).handle.hitReact(dir)`; fehlende Provider werden still übergangen. VR-Start legt alles ab bzw. zurück.
- Basketballkorb: Anker `city.yard.hoop { x, y, z, yaw, mast, board, ringR }` (Ringmitte `y 3,05`); Mast, Brett, Ring und Netz zeichnet `city`, Kollider `hoopMast` und `hoopBoard` (`y0 2,825`, `y1 3,875`, `top:false`); die Physik liefert nur die Trefferlogik (Ball kreuzt die Ringebene von oben nach unten im Ring); fehlt der Anker, baut `props.js` einen Rückfall-Korb. Serie: Fehlwurf setzt zurück, 3 in Folge → `hoop-3`; Anzeige am Mast, SFX `swish` + `cheer`. Dosen-Pyramide umgeworfen → `can-pyramid`.
- SFX (`sound.js`, synthetisch; `sound.play(name)`): `thud, bounce, whoosh, swish, cheer, clang, alarm, honk, purr, meow, flap, oof, buy, munch, discover, doorbell`; seit 1.17.0 zusätzlich `flash` (Fotoblitz, Gate), `stamp` (Stempel, Gate), `curtain` (Umkleidevorhang) und `snip` (Schere; definiert, bisher ohne Aufrufer); seit 1.18.0 `slap` (Hand), `belt`, `whip`, `laser` (Einzelton; das Summen beim Leuchten ist die Schleife `sound.laser(on)`), `ouch` (Treffer am Spieler), `candy`, `pop` (Wurf Bonbon bzw. Popcorn) und `ko`.

### Figuren und Verkehr (`npc/*`, `modules/npc.js`, `traffic.js`, `kiosk.js`)

- Dateien: `anim.js` (rein: idle/walk/run/sit/wave/hit/throw/stagger/point/cheer, seit 1.17.0 dance/clap/thumbs/bow, seit 1.18.0 threat/sleeves/shake/cover/whip/belt/aim/ko/swing/toss, `Animator`; `ANIMS` nur am Ende anhängen), `looks.js` (rein), `figure.js` (three: `createFigure(look, hooks)`, 1 `SkinnedMesh`, Geometrie je Look gecacht, `disposeFigureCaches()` beim Modul-`dispose`; das Material ist geteilt), `bubbles.js` (Sprechblasen-Pool, 3 DOM-Blasen `lfx-store-bubble is-npc`; in VR `ctx.xr.bubble()`), `lines.js`, `pathgraph.js`, `walker-logic.js`, `animals-logic.js`/`animals.js`, `cars-logic.js`/`cars.js`, `spots.js` (Anker); 1.18.0 dazu `temper-logic.js`, `attack-logic.js`, `aggro-logic.js`, `social-logic.js`, `laser-logic.js`, `throw-logic.js`, `throwpool.js`, `gang-logic.js` (siehe „NPCs und Raufen (1.18.0)“).
- Provider `npc`: `figure({ look?, role?, rain?, name?, pos?, yaw?, parent?, rand? }) → Handle`, `staff('ticket'|'popcorn')`, `nearestPerson(x, z, r = 3) → { kind, handle, dist }`, `people()`, `registerPerson({ kind, handle, onHit?, pos? }) → off`, `say(handle, text, ms)`, `scare(x, z)`. Handle: `{ root, rig, mesh, look, anim, setAnim, lookAt, say, hitReact({ x, z }), setUmbrella, setName, headWorld, show, hide, getNetState, applyRemote, isRemote, update, dispose }`; `figure()`-Handles aktualisiert das Modul selbst, Standard-Elter `city.groups.street`. Netzformat `{ x, y, z (mm), yaw, v: 1, a, p, s, t }`, Codes `ANIM_CODE` (idle 0 … cheer 9) **nie umnummerieren**; der Spieler-Avatar (`Body.getNetState`) hat ein anderes Format.
- Passanten: Anzahl `presetFor(level).npcMax` (nachts ×0,5, Dämmerung ×0,8, Regen ×0,85 mit Schirm und 25 % schneller), Wege auf `sidewalkPaths` (T-Punkte-Graph), Warten an Kanten mit `wait` (`'main'`/`'side'` ↔ `walkMain`/`walkSide` aus `city.signals()`, `'mid'` ↔ `traffic.zebraClear(edge)`), Ausweichen (Spieler < 2,3 m vorn), Anrempeln (< 0,62 m bei Tempo > 3) → taumeln. Schlag (`onAction('hit')`, prio 20, Kegel ±25°, Reichweite und Trefferzahl der Waffe seit 1.18.0 (vorher fest 1,6 m, 1 Ziel), Höhenfilter ±1,2 m, nie in VR) → `hitWalker` (ängstliche taumeln, danach 6 s rennen; normale und hitzköpfige reagieren je Temperament, siehe 1.18.0); Wurftreffer laufen über `handle.hitReact` durch dieselbe Reaktion. Jeder Passant hat einen dynamischen Kollider (`kind:'walker'`, Radius 0,3 m, `y1 1,8`, `top:false`), der nur innerhalb von 8 m um den Spieler folgt (sonst geparkt bei −9990). LOD: < 22 m jede Frame, < 40 m jedes 3., sonst jedes 6.; > 52 m ausgeblendet.
- Tiere: Katze im Hof (flieht bei Annäherung/Schlag, „Streicheln“ nur sitzend/putzend und langsam → `cat-pet`; jagt seit 1.18.0 den Laserpunkt); Tauben (`preset.birds`: low 0, mid 4, high 8, vier Heimatplätze).
- Personal und Kiosk: Anker `city.palast.staff.ticket|popcorn` (Vorrang, sonst `stationsOf(city.palast)`, zuletzt Foyer-Fallback in `spots.js`), `city.kiosk.vendor { x, z, yaw }` (Verkäuferin, 0,56-m-Kollider `kind:'npc'`); „Snack kaufen“ (4 Snacks, `buy`/`munch`, `kiosk-snack`; in VR ein Panel). Die Kioskhütte ist ein Schalenmodell (`hutShell`, Luke 1,0–2,0 m offen).
- Provider `traffic`: `zebraClear(edge)`, `cars()`, `parked()`; bei `?cars=0` eine Attrappe (`zebraClear → true`). Autos: Anzahl `carsMax` (nachts −1 ab 3), kinematisch auf `city.lanes`, dynamische Kollider (`top:false`, `y1 1,4`, 4,2 × 1,8 m, nur im Umkreis 36 m nachgeführt), Ampel über `city.signals()` (Gelb wird ignoriert, wenn der Bremsweg (5,5 m/s²) nicht reicht). Falle: `lane.stop.at` liegt **hinter** dem ersten Zebra der Fahrtrichtung, `effectiveStop()` hält deshalb 0,6 m davor. Hindernisse: Spieler (Füße < 1,0 m) und Passanten im Fahrstreifen (Halteabstand 1,3 m); Hupen nach 1,0 s Blockade (`car-honk`); blockiert der Spieler > 3,8 s, rollt das Auto mit ≤ 1 m/s heran und gibt `knock(…, 0,6)`, Passanten werden nie angefahren. `zebra`: vollständige Querung bei Grün. Parkende Autos: drei Plätze in den Seitenstraßen, je drei Kollider (0,95/1,42/0,95) → Dach per Sprung und Hochziehen erreichbar.

### Entdeckungen (`modules/discover.js`, `discover/*`)

19 Einträge seit 1.18.0 (`discover/catalog.js`, IDs verbindlich, nur am Ende anhängen, Zuständigkeit im Feld `by`): `golden-tape, graffiti, secret-door, roof-rain, roof, cat-pet, kiosk-snack, hoop-3, can-pyramid, richard-ban, richard-rent, palast-film, palast-tape, zebra, car-honk` und neu `cat-laser` (Jagdfieber), `gang-flee` (Haltung bewahrt), `salon-first` (Neuer Schnitt), `knockout` (Lichter aus); Auslöser und Freischaltungen in „NPCs und Raufen (1.18.0)“.
- Provider `discover`: `found(id, { silent? })` → true, wenn neu (Toast „Entdeckung n/19: Titel“ über `ctx.xr.toast`, SFX `discover`; bei 19/19 ein zweiter Toast; unbekannte IDs still false), `has`, `list()` → `[{ id, found, title, desc, hint }]`, `summary()` → `{ count, total, items }`, `onChange(fn(id, n))`, `getNetState()` → `{ found: [ids] }`, `reset()`. Speicherung `localStorage lfx.store.discover.<userId|anon>` = `{ v: 1, found: { id: ms } }`; Müll, fremde IDs und werfender Storage werden ignoriert (dann nur Sitzung).
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
| `city-salon-interior` (1.17.0) | Bereich `salon`, oder < 12 m vor der Salontür (`z < sa.door.z`, nicht im Laden) |
| `city-palast` | immer |

- Zusätzlich (`modules/city.js`): von draußen werden Ladenhülle und Regale nur gezeichnet, wenn Tür oder Schaufenster im Bild sind (bei `low` Regale nur bis 2,2 m vor der Front, einzelne Regale jenseits 11 m nicht); Straßen-Detailmeshes entfallen bei `low` im Laden und im Hof bei jeder Qualität; `area` wird vor `applyVisibility()` gesetzt. Der Cover-Manager ruht, wenn der Spieler > 25 m südlich vom Laden steht.
- **Draw-Call-Ziel:** unter 140 je Bild bei `low` (gemessene Spitzen 134–140 an der Tür, Hof 74–95, Laden 110, Palast 81; Stand 1.19.0: Spitze am Gassenmund bei `low` 131, alle Ultra-Details und das Wetter zählen nur auf `ultra`/je Wetterlage dazu). Neue Meshes pro Material mergen, Instancing nutzen, bei `low` weglassen.
- **Qualitätsstufen** (`presetFor(level, phone)` in `engine/quality.js`, monoton low ≤ mid ≤ high, Handy ≤ Desktop): `npcMax` low 8/5, mid 16/10, high 24/14 (Desktop/Handy); `carsMax` 2/2, 4/3, 6/4; `propsMax` 16/10, 28/16, 40/24; `birds` 0, 4, 8; `rainLines` 0, 380/200, 520/260 (seit 1.19.0 ungenutzt), `precip` 260/180, 900/500, 1400/700, ultra 2200/700; `fogNear/Far` 34/56, 36/58, 38/58. `ultra` (Startwerte) siehe „Qualitätsstufe Ultra“. `ctx.quality()` liefert nur den Level-String (`low|mid|high|ultra`), Zahlen immer über `presetFor`.
- **Nebel:** dauerhaft `scene.fog` (Umschalten würde Shader neu kompilieren); `near = min(far − 8, max(preset.fogNear, Diagonale + 1))`, `far = min(58, preset.fogFar)`, immer vor der Himmelskuppel (`FAR_R = 60`; Ferne ≥ 58 m ist unsichtbar, nicht `camera.far = 90`). `fog:false` auf Himmel, Boden, Sterne, Mond, Glow und Regen. Regenlinien-Volumen 24 × 24 m folgt der Kamera (nie in `low`, nicht in Foyer/Saal).
- **Soft-Budget:** `build/build.mjs` `checkStoreBundle()` warnt (kein Abbruch), wenn `dist/lenzstore.min.js` größer als `STORE_MIN_BUDGET` wird. Stand 1.19.0: 1 700 000 B (1,70 MB, Nutzer-OK für Ultra, Wetter, Niederschlag); `lenzstore.min.js` liegt bei rund 1,64 MB. (1.15.0: 1,25 MB bei rund 1,16 MB; 1.18.0: 1,55 MB.) Das Hauptbundle hat ein eigenes Budget `MAIN_MIN_BUDGET` = 520 KiB (Stand 1.19.0 rund 522 KB = 510 KiB).

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
- Mehrspieler 1.16.0: `getNetState/applyRemote` (Body, Figuren, Physik, Richard, Tickets, Entdeckungen, `cinema2d`) sind seit 1.16.0 verdrahtet, siehe „Mehrspieler (1.16.0)“.
- Teile von `brawl.js`/`city.js` haben CRLF: Edit-Werkzeuge mit LF-Mustern können scheitern.

## Mehrspieler (1.16.0)

Standardmäßig an: Eine Welt für alle Nutzer eines Servers (höchstens 16 Verbindungen), fremde Figuren mit Jellyfin-Namen, Chat, Emote-Rad, synchrone Physik, gemeinsamer Richard und gemeinsames Wetter, gemeinsames Kino. Das Protokoll (Nachrichten, Fähigkeiten `cap`, Server-Regeln, Kontingent) steht in `docs/mp-api.md`; die Einrichtung des Workers in `charts-worker/README.md`. Hier nur die Seite des 3D-Bundles und der Hülle.

- **Hülle/3D-Bundle:** Die Hülle (`features/store/mp.js`) holt per `GET /mp/ticket` (Header `X-Emby-Token`, nur `fetch`) das kurzlebige Ticket und reicht es als `deps.mp.ticket()` an das 3D-Bundle. Das Token gelangt nie ins 3D-Bundle, Ticket und Token stehen nie in einer URL. Das WebSocket (`wss://<Charts-URL>/mp`, Subprotokolle `lfx-mp.1` und `t.<ticket>`) liegt komplett im 3D-Bundle (`net/transport.js`). Ohne `deps.mp` gibt es keinen Provider, kein DOM und keine Listener.
- **Modul `net` (`modules/net.js`)** ist das letzte Modul in `MODULES` und holt fremde Provider nur bei Gebrauch mit Guard. Provider `net`: `{ active(), me(), has(cap), count(), serverNow(), peers(), peerName(c), on(ev), send(msg), physGate(body), menu(), renderMenu(el), onChange(fn), emote(code), openEmotes(), say(text), openChat(), setKino(on) }`; Ereignisse `'state'`, `'peers'`, `'msg:<t>'`. Teile unter `store3d/net/*`: `transport` (Verbindung, Backoff, Keepalive), `frame`/`proto` (Netzrahmen, eingefrorene Codetabellen), `pose`/`peers` (Figuren, Interpolation), `chat*`/`emote*`, `push`, `phys`, `richard`, `weather`, `clock` (Uhrabgleich), `hud` („N hier“), `panel` („Mehrspieler …“), `parts`.
- **Netzrahmen und Transport:** Frames als JSON-Array, höchstens 8 Frames/s. Keepalive-Text `ping` alle 3 s (Auto-Response `pong` im Worker; Cloudflare hat live Workers-WebSockets nach 5 s ohne Servernachricht gekappt). Backoff 1 bis 60 s, höchstens 6 Versuche je 10 min, danach 30 min Pause; eine 60 s stabile Verbindung leert die Zählung. Still aus (VIDEOTHEK wie 1.15): ohne Charts-URL, bei 404/503, bei CSP-Blockade (`connect-src`) oder erschöpftem Kontingent; nur das Panel nennt den Grund. `init` wartet nie aufs Netz, die Verbindung entsteht erst nach `'enter'`.
- **Lebenszyklus:** `onSuspend` (echtes Aussetzen, z. B. Route in den Player) schließt mit 1000, `onResume` verbindet neu; Design-Wechsel und `dispose()` schließen ebenfalls. Ausnahme: Das VR-Kino hält die Verbindung (`ctx.suspended()` ist dann false), verbirgt nur Figuren und DOM; auch ein verborgener Tab schließt nach 60 s, außer das Kino ist aktiv. VR: andere sehen, Chat lesen, mitschauen.
- **Tasten:** Enter (Chat) und T (Emote-Rad) werden nur im Modus `play` mit Pointer-Lock verbraucht (`controls/desktop.js`, `MP_ACTIONS`); im Sitzen (Overlay, Kino) und ohne Mehrspieler bleiben sie unberührt wie in 1.15, damit nicht aufgestanden oder pausiert wird. Am Handy gibt es dafür Knöpfe.
- **Rechte-Filter:** Über die Leitung gehen nur Item-IDs (gehaltene Hülle, Film). Cover und Titel zeigt der Betrachter nur aus dem eigenen Katalog, sonst eine neutrale Hülle. „Mein Film für andere sichtbar“ ist standardmäßig aus (dann kein Titel und kein Mitschauen-Angebot). Private Filme werden nie angeboten.
- **Prefs und Panel:** Panel „Mehrspieler …“ im Pause-Menü (Gesamtschalter, Name, Chat, „Mein Film für andere sichtbar“), Spielerliste mit grobem Ort, „Film: <Titel>“ (seit 1.16.1, `filmTitle` in `modules/net.js`: nur bei öffentlicher Kino-Sitzung des anderen und Film im eigenen Katalog, über `joinOffers`; die eigene Sitzung erscheint nicht), Stummschalten (nur lokal, gespeichert unter dem Pseudonym `k`) und Admin-Kick (10 min). Beim Hinsetzen im Palast erscheint auf Touch im Hochformat einmal der Hinweis „Für die ganze Leinwand: Handy drehen oder Vollbild.“ Einmaliger Hinweis pro Konto. Standardwerte in `modules/net.js` (`DEFAULTS`).
- **Gemeinsam:** Schubsen, Bälle, Dosen, Tonnen und geworfene Hüllen (Besitz je Objekt, `net/phys.js`); Richard und Wetter gemeinsam, das Hausverbot gilt nur für den Täter.

### Gemeinsames Kino (1.16.0)

Im LENZ PALAST wählt man am Platz „Mitschauen“ oder den eigenen Film. Alle dürfen pausieren und spulen. Beim Puffern warten alle höchstens etwa 10 s. Jeder schaut über das eigene Konto mit eigenem Weiterschauen; private Filme werden nicht angeboten. Nachrichten `ks kj kl kc kb`, Fähigkeit `kino` (vom Worker angekündigt, `charts-worker/src/mp/kino.js`), Details in `docs/mp-api.md`.

- **Sync-Kern `cinema/sync.js`** (rein, ohne DOM und Netz, Konstanten `SYNC`): Uhrabgleich über den Server (`serverNow()`, `ck`). Totband 300 ms (`DEAD_MS`). Ratenkorrektur (±8 %, `RATE_CLAMP`) beginnt am festen Totband; der gemessene Landefehler weitet nur das Sprungband, um Sprungzyklen zu vermeiden. Sprung ab 2 s (`RATE_MAX_MS`) mit gelerntem Vorhalt (Start direkt 500 ms, HLS 1500 ms, höchstens 3 s) und Abklingzeit (6 s, HLS 12 s), höchstens 3 Sprünge je 60 s (`SEEK_CAP`), danach wird der Versatz hingenommen. Echo-Unterdrückung (eigene Befehle lösen keine Eingriffserkennung aus) und CAS über die Version `v`; gesteuert wird nur mit absoluten Zielzuständen. Seit 1.16.1: Liegt ein Mitschauender voraus (Landung nach einem Sprung oder Drift über 2×Totband bis `HOLD_MAX_MS` 3000), hält er lokal kurz an statt zu springen oder langsam per Rate aufzuholen (`startHold`, Ende im Tick, gleicher Cooldown und `SEEK_CAP`, kein kc, nicht in `S.land` gebucht; der Gastgeber hält nie an). Während des Anhaltens ist „Pause“ (`toggle`) eine Gruppenpause. Pausiert ein Mitglied, dessen Player mehr als `STUCK_MS` 3000 von der Gruppe abweicht, gilt die Gruppenposition als Pausenstelle. Grund: live landete der Beitritt 1–1,7 s voraus (Vorhalt aus dem langsamen ersten Sprung gelernt, Nachsprung im Puffer sofort fertig).
- **Adapter `cinema/party.js`** nutzt den Provider `net` und die Bridge `features/store/cinema-bridge.js` (`setPaused(on)`, `seekTo(s, { exact })`, `mode()` = `'direct'|'hls'|'other'`). Es gibt keinen Stub `net/kino.js`.
- **Kino-Fix:** Aufstehen und wieder Hinsetzen am selben Platz startet den Film nicht neu (`stand()`/`sit()`, siehe `cinema2d`).

### Harness (Mehrspieler)

`/store-dev.html` (Kopfkommentar von `build/store-dev.js`; Fake-Welt und Bots unter `build/mp-dev/`, nichts davon im Produktionsbundle):
- `?mp=fake&bots=N`: Fake-Welt auf dem echten Reducer (`charts-worker/src/mp/room.js`), N Bots (Straße, Laden, Tür, Palast-Saal, Foyer); `?mplat=<ms>` Latenz (Standard 30).
- Still-aus-Modi: `?mp=off` (kein `deps.mp`), `?mp=nourl|404|503|401|drop`.
- `?mpadmin=1` (ich bin Admin: Kick-Knöpfe), `?mpbotadmin=<Index>`, `?botsocial=0` (Bots chatten/emoten nicht), `?mpchat=0` (Chat-Schalter aus).
- Zwei-Seiten-Test: `?mp=relay&relay=<port>&name=<N>[&admin=1]` mit echtem WebSocket zum Dev-Relay `build/mp-dev/relay.mjs` (Node, echter Reducer, kein Cloudflare).
- Debug: `window.__devMp` (Fake-Welt bzw. Relay-Prefs), `window.__devNet`, `window.__devFigs`; mit `__lfxStoreDebug` zusätzlich `__lfxStore`.
- Kino: `?cinema=1|series|fail|paused|slow` (Fake-Player) und `?subs=srt|ass|off`, `?palast=1` für das 2D-Kino; zusammen mit `?mp=…` lässt sich das gemeinsame Kino im Harness prüfen.

## Figur, Ausweis, Salon (1.17.0)

Release „eigene Figur“: Jeder legt am Anfang einen Mitgliedsantrag an (Figur-Editor im Foto-Studio), sieht sich in der Ich-Ansicht (Beine beim Blick nach unten, Spiegel) oder per Taste V in der Außenansicht, bekommt einen Mitgliedsausweis mit Zählern, kann im Friseursalon FRISEUR HAARSCHARF (Gabi und Ronny) Haare und Outfit ändern und wird von anderen Spielern mit der eigenen Figur gesehen. Das Wire-Protokoll (Fähigkeit `look`) steht in `docs/mp-api.md`. Alles Zustandsbehaftete (Konto-Profil, Mehrspieler-Prefs) kommt über `deps` aus der Hülle; das 3D-Bundle importiert weiter nichts aus `core/`/`shared/`/`features/`. Ohne Konto-Profil (`deps.profile` fehlt) gibt es weder Gate noch eigene Figur: `avatar.code()` ist `null`, „Figur …“ und „Mitgliedsausweis“ im Pause-Menü sind ausgeblendet, `selfview.figure()` ist `null`.

### Look v2 (`char/ids.js`, `char/look2.js`)

Zwei Darstellungen derselben Figur: der **Look-Code** (Leitung, Speicher) und der **Render-Look** (Figuren-Fabrik). Reine Dateien ohne `three`/DOM; Zufall nur über eine übergebene Funktion.

- **Look-Code:** Int-Array der Länge 26 (`LEN`), Index 0 = Version (`VERSION` = 2). Die Feldindizes stehen als `F` in `look2.js`.

| Index | Feld (`F.…`) | Wertebereich |
|---|---|---|
| 0 | Version (`ver`) | 2 |
| 1 | Haut (`skin`) | 0..13 (`SKIN`, 14 Töne, keine eigene Farbe) |
| 2 | Größe (`height`) | 0..20 → 0,90..1,10 |
| 3 | Statur (`build`) | 0..20 → 0,85..1,25 |
| 4 | Form (`shape`) | 0..2 (`straight`, `shoulders`, `hips`) |
| 5 | Frisur (`hairStyle`) | `HAIR_STYLES` (18; 0–4 = die alten Passanten-Frisuren in alter Reihenfolge) |
| 6 | Haarfarbe (C) | `HAIR_COLORS` |
| 7 | Augen (`eyes`) | `EYES` (6) |
| 8 | Brauen (`brows`) | `BROWS` (5) |
| 9 | Bart (`beard`) | `BEARDS` (6) |
| 10 | Oberteil-Schnitt (`topCut`) | `TOP_CUTS` (10) oder Freischalt-Code |
| 11 | Oberteil-Farbe (C) | `CLOTH_COLORS` |
| 12 | Oberteil-Muster (`topPattern`) | `TOP_PATTERNS` (6) |
| 13 | Oberteil-Farbe 2 (C) | `CLOTH_COLORS` |
| 14 | Hosen-Schnitt (`botCut`) | `BOTTOM_CUTS` (6) oder Freischalt-Code |
| 15 | Hosen-Farbe (C) | `CLOTH_COLORS` |
| 16 | Hosen-Muster (`botPattern`) | `BOTTOM_PATTERNS` (4) |
| 17 | Hosen-Farbe 2 (C) | `CLOTH_COLORS` |
| 18 | Schuh-Modell (`shoeModel`) | `SHOE_MODELS` (5) oder Freischalt-Code |
| 19 | Schuh-Farbe (C) | `SHOE_COLORS` |
| 20 | Sohle (`sole`) (C) | `SHOE_COLORS` |
| 21 | Brille (`glasses`) | `GLASSES` (5) oder Freischalt-Code |
| 22 | Kopfbedeckung (`hat`) | `HATS` (7) oder Freischalt-Code |
| 23 | Kopfbedeckungs-Farbe (C) | `CLOTH_COLORS` |
| 24 | Tasche (`bag`) | `BAGS` (4) oder Freischalt-Code |
| 25 | Taschen-Farbe (C) | `CLOTH_COLORS` |

  - **Reihenfolge ist Leitungscode:** Die Listen in `char/ids.js` werden nie umsortiert, neue Einträge nur hinten angehängt (sonst sehen ältere Clients andere Teile).
  - **Farbcode (C):** Palettenindex oder eigene Farbe `0x1000000 | rgb24` (Gesamtbereich 0..`MAX_CODE` = 0x1FFFFFF). **Abweichung vom Entwurf:** Die Paletten haben je 16 Töne, gültig sind also nur die Indizes 0..15 (`validColor` prüft `v < palette.length`), nicht 0..63. Alles andere wird feldweise zum Standard. `encodeColor([r,g,b])`/`decodeColor(code, palette)`; unbekannte Palettenindizes zeichnet `decodeColor` mit dem ersten Palettenton.
  - **Freischalt-Codes:** Teile aus Entdeckungen haben den Code `UNLOCK_BASE + i` (`UNLOCK_BASE` = 64), `i` = Index in der jeweiligen `UNLOCK_*`-Liste. `decode` akzeptiert einen Code ≥ 64 nur, wenn der Listeneintrag existiert; ob der Spieler das Teil besitzt, prüft erst der Editor bzw. `randomLook` (siehe „Freischaltungen“).
  - **`decode(raw)`** ist tolerant: falsche Länge, Version ≠ 2 oder Nicht-Array → kompletter Standard-Look (`defaultCode()`); sonst wird jedes Feld einzeln geprüft und bei Ausreißern zum Standardwert. Ein Code einer neueren Version (z. B. 3) wird deshalb von diesem Client als Standardfigur gezeichnet. `equal(a, b)`, `outfitHash(code)` (siehe „Reaktionen“) und `randomLook(rand, unlocked)` (nur Basisteile plus die freigeschalteten `'slot:code'`; Hose nie in der Farbe des Oberteils).
- **Render-Look:** `toRender(code)` → `{ v: 2, skin, height, build, shape, hairStyle, hair, eyes, brows, beard, top:{cut,color,pattern,color2}, bottom:{cut,color,pattern,color2}, shoes:{model,color,sole}, glasses, hat:{id,color}, bag:{id,color}, handItem: null }`. Farben sind immer `[r,g,b]` (0..1), IDs die Namen aus `ids.js`. `handItem` ist die 1.18-Naht (Gegenstand an der rechten Hand) und in 1.17 immer `null`.
- **`makeLook` ist eingefroren** (`npc/looks.js`): Passanten und Seed-Figuren der Mitspieler ohne `look` nutzen weiter den alten Look ohne `v`. Der Baseline-Test `tests/store3d-figure-baseline.test.js` (64 feste Pseudonyme, Look-JSON und Geometrie-Hash des alten Pfads) darf NIE angepasst werden; ändert sich dort ein Hash, hat sich das Aussehen aller Passanten geändert. Neue Passanten-Frisuren o. Ä. gehören in `ids.js`/den v2-Pfad, nie in `makeLook`.

### Figuren-Fabrik (`npc/figure.js`, `npc/figure-parts.js`)

- `createFigure(look, hooks)` verzweigt in `bodyGeometry` auf `look.v === 2` → `buildV2Parts(look)` (`figure-parts.js`: Boxen/Kugeln mit Vertexfarben je Bone, unbekannte IDs zeichnen als Standard `tee`/`jeans`/`sneaker`/`none`); ohne `v` läuft `oldParts` unverändert. Weiter EIN gemergtes `SkinnedMesh` (1 Draw-Call), gemeinsames Material (`hooks.material` überschreibt, das Studio nutzt ein eigenes).
- **Geometrie-Cache** mit Referenzzählung und LRU: Schlüssel `lookKey(look)` (`npc/looks.js`; v2: alle Render-Felder, Farben auf 1/255 genau, ohne `height`/`build`, die nur das Rig skalieren). `acquire` zählt `refs` hoch, `release` herunter; unreferenzierte Einträge bleiben bis `GEO_FREE_MAX` = 48 (älteste zuerst `dispose`). `figureCacheInfo()` → `{ size, free, refs }` (Tests/Debug); `disposeFigureCaches()` beim Modul-`dispose`.
- **Handle zusätzlich zu den Feldern oben (Open World):** `setLook(look)` ersetzt nur die Geometrie (Skelett bleibt, `height`/`build` werden neu gesetzt, das Namensschild wandert mit); `topY` (Getter, Oberkante inkl. Hut/Frisur in Metern, × `height`; Schilder und Blasen richten sich danach, nur Altlooks nutzen die feste Höhe 1,98); `setEgo(on)`/`isEgo()` (Ego-Variante: Kopf- und Arm-Bones auf Skalierung 0, enge Hüllkugel, Rig 0,12 m nach hinten; Option `hooks.ego`).
- **1.18-Nähte (in 1.18.0 belegt, siehe „NPCs und Raufen (1.18.0)“):** `HAND_R = { bone: 'armR', offset: [0.04, -0.5, -0.12] }` (Export aus `figure.js`) und `handle.setHandItem(id)` (in 1.17 ein Stub; seit 1.18.0 wirksam), dazu `handItem` im Render-Look, `actionEvent` mit `weapon`, `range`, `max` (Standard `'hand'`, 1,6, 1), der `aux`-Platz im Gamepad (`setAux`, Knopf „WAFFE“) und die Pose-Codes 9..15 auf der Leitung.

### Studio und Porträt (`char/studio.js`)

Eigene kleine Szene (`createStudio()` → `{ scene, camera, figure(look), setLook, rotate(dRad), setYaw, getYaw, update(dt), cameraPose(focus), portrait(renderer, look), portraitCacheSize(), dispose() }`): Fotowand im 90er-Stil mit Vorhang, Schachbrettboden, Maßstab (Striche alle 10 cm) und Schild „VIDEOTHEK LENZ“, zwei Lichter, kein Nebel, 3 Draw-Calls (Bühne, Schild, Figur). Die Figur steht bei (0, 0, 0) und blickt nach −z, die Kamera bei −z. Läuft im vorhandenen Renderer (kein zweiter WebGL-Kontext).
- **Bühnenwechsel:** `avatar.js` hängt die Kamera-Rig-Gruppe (`ctx.camera.parent`) in die Studio-Szene und `ctx.stage.setScene(studio.scene)`; beim Verlassen zurück in `ctx.scene` und `setScene(null)` (`stageOn`/`stageOff`). Die Kamera fährt per `player.camera.flyTo` an `cameraPose(focus)` (`STUDIO_FOCUS`: `body, hair, face, top, bottom, shoes, extras`; die Pose richtet sich nach `topY` und `height`); `poseCamera` in `avatar.js` korrigiert sie für den echten FOV (Studio-Posen sind für 30° gedacht) und versetzt die Figur im Querformat nach rechts (Formular links), im Hochformat ins obere Drittel.
- **Porträt:** `portrait(renderer, look)` rendert Kopf und Schultern frontal (FOV 26) in ein `WebGLRenderTarget` 256² (`PORTRAIT_SIZE`), liest die Pixel (Y gespiegelt) in einen Canvas; LRU-Cache nach `lookKey` (`PORTRAIT_CACHE_MAX` = 16), der Canvas gehört dem Cache (nicht verändern). Provider: `avatar.portrait(code)` → `Promise<Canvas | null>` (null ohne Renderer oder bei Fehler).

### Provider (`avatar`, `member`, `selfview`, `salon`, `xrchar`)

Alle fremden Provider nur lazy und mit Guard holen. Tabelle der Formen: „Provider und Module“.

- **`avatar`** (`modules/avatar.js`): Lesen aus `deps.profile` (`fig.act`, `fig.slots`): `look()` (Render-Look oder `null`), `code()` (Kopie oder `null`), `slots()` (drei Plätze, `null` = leer), `active()` (0..2), `setSlot(i)` (Platzwechsel, nur auf belegte Plätze). `needsGate()` = Profil vorhanden und kein gültiger Platz (auch ein vorläufiger `prov`-Platz zählt als gültig), `gate()` Promise (siehe „Gate-Ablauf“). `onChange(fn(look, code))` feuert NUR bei „Übernehmen“, Platzwechsel, Gate-Abschluss oder einem geänderten Konto-Look, nie während der Live-Vorschau; `onPreview(fn(look | null))` meldet die Live-Vorschau (`null` beendet sie). `setCode(code, { commit = true })` (`commit: false` = nur Vorschau), `randomize({ commit })` (nur freigeschaltete Teile), `setColor(part, idx)` für VR light (`part` = `hair|top|top2|bottom|bottom2|shoes|sole|hat|bag`, `idx` 0..15; übernimmt sofort). `hash()` = `outfitHash` des aktiven Codes, `lastChange()` = ms der letzten Änderung (0 = keine in dieser Sitzung). Reaktionen: `changedFor(npc)`, `markSeen(npc)` und (zusätzlich zum Entwurf) `changeKind(npc)`, siehe „Reaktionen“. Konto-Daten, die erst nach dem Start eintreffen (`profile.onRemote`), lösen `onChange` aus, beenden ein offenes Gate (es erübrigt sich) und zeigen den Toast „Deine Figur vom Konto ist geladen.“, wenn der vorherige Stand vorläufig war.
- **`member`** (`modules/member.js`): `cardData()` → `CardData | null` (`null`, solange es keine Figur gibt) mit `{ name | null, no, since (dayNumber), rent, cine, stamps (Bitmaske), total, tier, code }`; der Name nur bei „Name zeigen“ (`deps.mp.prefs().name !== false`; ohne Mehrspieler gibt es keinen Schalter, dann zeigt die eigene Karte den eigenen Namen). `ensure()` vergibt Ausweisnummer (6-stellig, `crypto.getRandomValues`, 100000..999999) und `since`, falls es sie noch nicht gibt (das Gate ruft es nach „Fertig“ auf). `showCard(data, { mode: 'self'|'peer'|'rent'|'gate', ms? })` → Promise, löst beim Schließen auf. `count(kind: 'rent'|'cine', itemId)` → true, wenn gezählt. In VR zeigt `showCard` nur einen Toast „Ausweis Nr. …“ (kein DOM-Overlay).
- **`selfview`** (`modules/selfview.js`): `mode()` = die WIRKSAME Ansicht (`'ego'|'third'`; bei Auto-Ego `'ego'`, auch wenn `'third'` gewählt ist), `setMode(m)`, `toggle()` (Taste V; Toast „Außenansicht (V)“/„Ich-Ansicht (V)“; in VR wirkungslos), `eye(out)` (Ego: die Kamera, bitgleich zu früher; Außenansicht: das Auge der Figur), `figure()` (volle eigene Figur, `null` ohne Figur), `playAnim(name)` (`null`/`'idle'`/`'stand'` beendet eine Dauer-Animation; `'sit'` ist Dauer-Animation, Einmal-Animationen laufen ihre Dauer; Aufstehen beim Loslaufen/Springen).
- **`salon`** (`modules/salon.js`): `busy()` (Stuhl-/Umkleide-Ablauf läuft), `inside()` (Bereich `salon`), `sitting()` (sitzt im Stuhl; dient `net.js` für die Pose `a=7`). Entwurf kannte nur `busy`/`inside`.
- **`xrchar`** (`modules/xrchar.js`): `open()` → bool, nur in einer VR-Sitzung (sonst `false`), schaltet das Panel um (offen → schließen).
- **`shopmirror`:** `{}` ohne API.
- **`npc.reserve(n, key = 'net')`/`overflow()`:** siehe Provider-Tabelle.

### Gate-Ablauf („Mitgliedsantrag“, `store.js` `startSequence`, `modules/avatar.js`)

1. `boot()` ruft `startSequence(r)`: erstes Bild immer abwarten (`onReadyHook`), dann `avatar.needsGate()` → `await avatar.gate()` (auch bei `opts.skipIntro`), danach `intro.run()` (nur ohne `skipIntro`), danach das Ereignis `'enter'`.
2. `gate()` ist eine Schleife `while (!disposed && needsGate())`: wartet, solange VR präsentiert (kein DOM-Formular in VR), startet den Editor mit `where: 'gate'`, `focus: 'body'` und einem Zufalls-Startlook (`randomLook` mit den freigeschalteten Teilen), wartet auf dessen Ende. Wird das Overlay anders geschlossen (Moduswechsel, anderes Overlay), beendet das die Sitzung, die Schleife öffnet einen neuen Antrag.
3. **Esc-fest:** Das Formular öffnet über `ctx.overlay.open(el, { modal: true })` (siehe `overlay.open` in „Module“). Esc und Pointer-Lock-Verlust schließen es nicht; der Editor hat im Gate keinen Abbrechen-Knopf und keinen Reiter „Plätze“.
4. „Fertig“ (`gateDone`): Stempelanimation (380 ms, 150 ms bei `prefers-reduced-motion`, SFX `stamp`) → Fotoblitz (140 bzw. 320 ms, SFX `flash`) → `commit([code, null, null], 0)` → `member.ensure()` → `member.showCard(cardData(), { mode: 'gate' })` → Sitzung zu.
5. Ohne Konto-Profil (`deps.profile` fehlt) gibt es kein Gate. Ist das Konto beim Start noch nicht geladen (`profile.state()` ≠ `'ok'`), schreibt `avatar` neue Plätze als vorläufig (`prov: true`); der Konto-Slot gewinnt später immer (siehe „Konto-Profil“).

### Editor-Orte (`avatar.openEditor(where, focus?, { live? })` → `Promise<bool>`, true = übernommen)

- `where`: `pause` (Pause-Menü „Figur …“; `StoreApp.onFigure` schließt das Menü, Modus `play`, dann der Editor als Overlay), `chair` (Friseurstuhl, Fokus `hair`), `booth` (Umkleide, Fokus `top`), `gate` (nur über `gate()`; `openEditor('gate')` wartet auf das Gate). Unbekannte Werte werden zu `pause`. Läuft schon eine Sitzung, liefert der Aufruf deren Promise. Ohne Figur (`code() === null`) sofort `false`.
- **`live`** ist keine fünfte Ortsangabe, sondern die Option `{ live: true }` (Entwurf führte „live“ unter den Orten): KEIN Studio, die Kamera bleibt, wo der Aufrufer sie hingefahren hat (Salon-Spiegel); die Live-Vorschau geht über `onPreview` an die eigene Figur (`selfview`). Der Salon nutzt es ab Qualität `mid` und nicht in VR; bei `low` läuft das Studio.
- Reiter (`char/editor-model.js` `TABS`, Ansicht `ui/chareditor.js`, Titel „Deine Figur“/„Frisierstuhl“/„Umkleide“/„Mitgliedsantrag“): Körper, Haare, Gesicht, Oberteil, Hose, Schuhe, Extras, Plätze (drei Outfit-Plätze, nicht im Gate). „Übernehmen“ schreibt Plätze und aktiven Platz (`commit`), Esc/Abbrechen verwirft alles. Die Vorschau wird auf höchstens ~30 Hz gedrosselt (33 ms). Knöpfe ≥ 44 px.
- In VR ruft `openEditor` stattdessen `xrchar.open()` und liefert `false`; eine laufende Sitzung endet beim Start von VR.

### Ausweis (`char/card.js`, `modules/member.js`, `ui/membercard.js`)

- **Stufen** (`tierOf`): `uses = rent + cine`; Bronze = Standard, **Silber** ab `uses ≥ 5` und `≥ 4` Entdeckungen, **Gold** ab `uses ≥ 20` und `≥ 10` Entdeckungen.
- **Zähler „je Titel 1× pro Tag“:** `member.count(kind, itemId)` (`kind` = `rent` | `cine`) nutzt `countOnce(cnt.last, '<kind>:<itemId>', dayNumber)`; derselbe Titel zählt je Art nur einmal pro UTC-Tag (`dayNumber = floor(ms / 86400000)`). Gespeichert wird je Geräte-ID in `cnt.rent[<dev>]`/`cnt.cine[<dev>]` (Summe über alle Geräte); `cnt.last` (höchstens 50 Einträge, ältester fliegt) bleibt lokal und wird nie hochgeladen. Aufrufer: `rent.js` (`tryRent`, nur wenn die Hülle in dieser Sitzung noch nicht ausgeliehen war) und `palast.js` (`countCine`: 2D-Kino beim ersten `playing` des Tickets, VR-Kino beim Start über `sitOwn`).
- **Stempel:** Bitmaske der Entdeckungen (`stampsMask`: Bit i = Index i im `CATALOG` von `discover/catalog.js`, höchstens 31 Bit); die Karte zeigt `total` Stempel (nie fest 15).
- **„Richard verlangt den Ausweis“** (`rent.js` `tryRent`): Nach dem Zählen sagt Richard `cardAsk` („Ausweis, bitte.“), `member.showCard(data, { mode: 'rent' })` blendet die Karte kurz ein (1,2 s, `ms` änderbar; ein DOM-Element am Canvas-Host, kein Overlay, kein Moduswechsel), danach `rentOk`. In VR nur der Spruch und 1,5 s Pause (`ASK_MS`).
- **Modi von `showCard`:** `self` (Pause-Menü „Mitgliedsausweis“), `peer` (Titel „Ausweis von <Name>“; aus der Spielerliste-Zeile „Ausweis“ oder per E an einer fremden Figur), `rent`, `gate`. Außer `rent` öffnet die Karte ein Overlay mit Esc zum Schließen.
- **Ausweis ansehen an Mitspielern:** `net/peers.js` legt für Peers mit gültigem `mc` eine Interaktion „Ausweis ansehen“ an (Box folgt der Figur, `noClick: true`, in VR aus); der Name erscheint nur, wenn der Peer „Name zeigen“ gesetzt hat.
- **„Ausweis zeigen“** (Pref `mpCard`, `deps.mp.prefs().card`, Standard an; Schalter im Panel „Mehrspieler …“): aus ⇒ der Client sendet `mc: null`, niemand sieht den Ausweis. Das Abschalten geht ohne Wartezeit raus (Datenschutz).

### Freischaltungen (`char/unlocks.js`)

15 Entdeckungen (seit 1.18.0 19, die vier neuen stehen am Tabellenende) schalten je ein Teil frei (`UNLOCKS`, erweiterbar, nur anhängen). Gesperrte Teile zeigt der Editor mit dem Hinweistext der Entdeckung (`lockHint`, verrät den Titel nicht); die Sperre gilt im Editor und bei `randomize`/`randomLook`, `decode` und die Figuren-Fabrik zeichnen jeden gültigen Code (auch bei Mitspielern).

| Entdeckung (`discover`-ID) | Slot | Teil (ID) | Code |
|---|---|---|---|
| `golden-tape` | Kopfbedeckung | Goldkappe (`goldcap`) | 64 |
| `graffiti` | Schuhe | Farbklecks-Treter (`splash`) | 64 |
| `secret-door` | Kopfbedeckung | Krone des Fundus (`crown`) | 65 |
| `roof-rain` | Oberteil | Regencape (`cape`) | 64 |
| `roof` | Brille | Fliegerbrille (`pilot`) | 64 |
| `cat-pet` | Kopfbedeckung | Katzenöhrchen (`catears`) | 66 |
| `kiosk-snack` | Tasche | Chipstüte am Gurt (`chips`) | 64 |
| `hoop-3` | Oberteil | Dreier-Trikot (`jersey3`) | 65 |
| `can-pyramid` | Kopfbedeckung | Dosenhut (`canhat`) | 67 |
| `richard-ban` | Oberteil | Hausverbot-Shirt (`banshirt`) | 66 |
| `richard-rent` | Tasche | Kassettenrucksack (`vhspack`) | 65 |
| `palast-film` | Kopfbedeckung | Platzanweiser-Mütze (`usher`) | 68 |
| `palast-tape` | Brille | Dreidimensionale Brille (`3d`) | 65 |
| `zebra` | Hose | Zebrastreifen-Hose (`zebra`) | 64 |
| `car-honk` | Oberteil | Warnweste-Shirt (`hivis`) | 67 |
| `cat-laser` (1.18.0) | Tasche | Katzenkopf-Rucksack (`catpack`) | 66 |
| `gang-flee` (1.18.0) | Oberteil | Nietenjacke (`studjacket`) | 68 |
| `salon-first` (1.18.0) | Kopfbedeckung | Lockenwickler-Haube (`curlers`) | 69 |
| `knockout` (1.18.0) | Brille | Pflaster-Veilchen (`bandaid`) | 66 |

API: `unlockedCodes(foundIds)` (Set `'slot:code'`), `isUnlocked(slot, code, foundIds)` (Basisteile < 64 immer frei), `unlockFor(discoverId)`, `lockHint(slot, code)`; Slots `top`, `bottom`, `shoes`, `glasses`, `hat`, `bag` (`SLOT_LISTS`). Die Entdeckungen liest `avatar` aus `discover.list()`.

### Reaktionen (`char/react-logic.js`)

Neues Outfit/neue Frisur wird bemerkt. Maßstab ist der **Outfit-Hash** (`outfitHash(code)`, 8 Hex-Zeichen FNV-1a über `OUTFIT_FIELDS` = Frisur, Haarfarbe, Bart, Oberteil, Hose, Schuhe, Brille, Kopfbedeckung, Tasche samt Farben; nie Haut, Körper, Augen, Brauen). Gesehen-Stände liegen im Profil unter `seen` (`richard|gabi|ronny` = Hash, dazu `<npc>R` = Hash ohne die Haarfelder 5, 6, 9, und `t`).
- `avatar.changedFor(npc)` (`npc` = `richard|gabi|ronny`) = `npcShould(seen[npc], aktuellerHash)`; `markSeen(npc)` speichert beide Hashes. **`changeKind(npc)`** (Ergänzung zum Entwurf) → `'hair'` (nur Frisur/Haarfarbe/Bart seit dem letzten Gesehenen), `'outfit'` (sonst) oder `null` (keine Änderung oder unbekannte Vorgeschichte, also kein `<npc>R`). Sprüche je Art: `hairNew`/`outfitNew`.
- **Richard:** bei der normalen Begrüßung (`cashier.js`, nicht bei Groll), `markSeen('richard')` erst nach erfolgreich gesprochener Zeile. **Gabi und Ronny:** `salon.js` `react()` alle 1,2 s, wenn die Person < 6,5 m entfernt ist, höchstens eine Reaktion je Takt, danach `markSeen`.
- **Passanten** (`modules/npc.js`): Budget `createReactBudget()` mit `noteChange(now, hash)` bei jeder `avatar.onChange`, `passerbyMay(now, id)` und `markSaid(now, id)`: nur innerhalb von `WINDOW_MS` = 90 s nach der Änderung, höchstens `MAX_PASSERBY` = 3 verschiedene Passanten, mindestens `GAP_MS` = 6 s zwischen zwei Sprüchen, nach drei Sprüchen `QUIET_MS` = 5 min Ruhe. Prüftakt 0,4 s, Radius 4 m, nur bei sichtbarer Straßengruppe, nicht in VR und nicht auf dem Dach (Augenhöhe ≥ 1,2 m). Die Kategorie (`HAIR_NEW`/`OUTFIT_NEW`) kommt aus dem Vergleich des alten mit dem neuen Code (`hairOnly`).
- Tonfall: „eher frech“, ohne Beleidigungen und nie über Körper oder Hautfarbe.

### Sprecher-Regie (`modules/voice.js`, Provider `cashier.speaker`)

`cashier.speaker({ id, voiceSeed, pitch, rate, prio, pos: () => ({ x, y, z }) })` → `{ say(text, { volume? }) → Promise<'spoken'|'bubble'|'muted'>, cancel(), release() }` (`createDirector`). Richard (`prio` ≥ `RICHARD_PRIO` = 100) hat Vorrang und unterbricht; sonst spricht nur die nächste Person bis `SPEAK_DIST` = 10 m, alle anderen bekommen `'bubble'`. Höchstens eine Zeile wartet in der Warteschlange. Ist der Ton aus, liefert `say` `'muted'` (der Aufrufer zeigt ebenfalls die Blase); bei `'bubble'` zeigt der Aufrufer die Blase über der Figur (`npc.say`/`handle.say`). Gabi und Ronny haben feste Stimmen (`char/salon-lines.js` `VOICES`, `prio` 50). `voice.js`-Regeln (nur lokale Stimmen, nie Titel loggen) gelten unverändert.

### Außenansicht und Ego-Körper (`modules/selfview.js`, `char/tpcam.js`)

- **Gewählt vs. wirksam:** `set.cam` (`'ego'|'third'`, Standard `ego`) steht im Profil; `mode()` meldet die wirksame Ansicht. **Auto-Ego** (`forcedEgo`): VR, ein offenes Overlay, eine fremde Bühne (`!ctx.stage.isStore()`, z. B. Studio) oder eine Modul-Kamera (Couch, Kino, Kasse, Intro). Letztere wird daran erkannt, dass das Rig im letzten Frame nicht lief (`rigFrame`, `runtime.cameraStep` ruft es nur ohne `flyTo`). Danach zurück zur gewählten Ansicht. Spätere Konto-Daten überschreiben die Wahl nicht, wenn der Nutzer in dieser Sitzung schon gewählt hat.
- **Kamera** (`solveTpCam`): `BACK` = 2,4 m hinter und `UP` = 0,3 m über dem Auge, entlang Blickrichtung (yaw/pitch). Die Strecke Auge → Wunschposition wird gegen statische Kollider (`layout.cidx`) geprüft (`MARGIN` 0,14 m, `FLOOR_GAP`/`CEIL_GAP` 0,12 m): Treffer → sofort einziehen, danach in `EXTEND_T` = 0,25 s wieder ausfahren (`smoothFrac`); unter `HIDE_DIST` = 0,7 m wird die eigene Figur ausgeblendet (`hideBody` mit Hysterese). Das Rig hängt dauerhaft am Spieler (`player.camera.setRig`), in Ego tut es nichts.
- **Zielen und Schlagen** (`store.js` `aimRay`/`actionEvent`): In Ego bleibt alles bitgleich (Kamera und Blickrichtung). In der Außenansicht ist der Ursprung die Projektion des Auges auf den Kamerastrahl; Anvisieren (`updateAim`) reicht 2,5 m ab dort, Tippen (`onTap`) 9 m. `actionEvent` liefert `origin` = Auge (`selfview.eye`) und zusätzlich `weapon: 'hand', range: 1.6, max: 1`. Die Hände unten im Bild (`ui/hands.js`) sind in der Außenansicht aus.
- **Ebenen (Layer):** Layer 1 = Ego-Körper, nur die Hauptkamera aktiviert ihn (`ctx.camera.layers.enable(1)`). Layer 2 = die volle eigene Figur in der Ego-Sicht, nur Spiegelkameras (sie rendern Layer 0 und 2, nie 1). In der Außenansicht steht die volle Figur auf Layer 0 und der Ego-Körper entfällt. So sieht man sich im Spiegel komplett und bekommt in der Ego-Sicht trotzdem keine Kopfinnenansicht.
- **Ego-Beine:** Der Ego-Körper (zweite Figur mit `setEgo(true)`) wird erst beim ersten Blick nach unten gebaut und ist sichtbar, wenn die Neigung unter `LEGS_ON` = −0,5 rad fällt (Hysterese bis `LEGS_OFF` = −0,4), nie bei Auto-Ego.
- **Blob-Schatten** (nur Außenansicht): ein Quad (`MeshBasicMaterial`, Radialverlauf) am Boden, `scale` schrumpft mit der Höhe über dem letzten Bodenpunkt (`groundY`).
- **Draw-Calls:** Außenansicht = Figur + Schatten = 2, ausgeglichen über `npc.reserve(2, 'self')` (sonst 0; die Ego-Beine zählen nur beim Blick nach unten). Die Animation kommt aus `Body.getNet().a` über `animFor` (wie bei Mitspielern); `selfview.dispose` ruft bewusst kein `reserve(0)` (`npc` ist dann schon entsorgt, ein Aufheben würde Passanten neu erzeugen). Die Figuren aktualisiert `modules/npc.js` (externals); `selfview` ruft nie `update()` auf.
- **Debug:** `__lfxStore.m3.selfview.state()` → `{ want, third, frac, bodyHidden, legs, hasFigure, hasEgo, reserved, override }`.

### Spiegel (`world/mirror.js`, `modules/shopmirror.js`)

- **Planspiegel** statt three-`Reflector` (der nutzt HalfFloat, MSAA und kennt keine Layer): `createMirror(ctx, { x, y, z, yaw, w, h, parent, id, maxDist?, … })` → `{ mesh, update(dt), isLive(), wanted(), stats(), setSuppressed(bool), dispose() }`. Spiegelkamera mit schiefer Near-Ebene, `RenderTarget` 256² (`MIRROR_RT`, `UnsignedByteType`, ohne MSAA), Layer 0 + 2, `MIRROR_FAR` = 40 m. Das Mesh blickt mit +z aus der Wand (`yaw = π` = Blick nach −z).
- **Takt und Gating:** `mirrorHz(level)`: `high` 20 Hz, `mid` 10 Hz, `low` 0 (matter statischer Verlauf, kein Render, keine RT). `mirrorGate({ quality, xr, store, visible, facing, dist, maxDist })` (rein): nur im Bild, zugewandt, näher als `MIRROR_MAX_DIST` = 8 m (Überwachungsspiegel `DOME_MAX_DIST` = 10 m), nicht in XR und nur in der Laden-Szene (`stage.isStore()`, im Studio matt). Höchstens EIN Spiegel gleichzeitig live (`liveHub(renderer)`; der nächste gewinnt: Besitzer verloren nach 600 ms oder neuer Spiegel mindestens 0,75 m näher). Außerhalb des Bildes bleibt das letzte Bild stehen, im Bild aber abgewandt oder zu weit wird er matt.
- **Messfalle `renderer.info.autoReset`:** `renderToTarget` setzt `info.autoReset = false` und `shadowMap.autoUpdate = false` für den verschachtelten Render und stellt beides im `finally` wieder her, sonst zählt `stats().calls` die Spiegel-Draw-Calls zum Hauptbild und verfälscht Messungen am 140er-Ziel. Wer selbst verschachtelt rendert, muss dasselbe tun (und das Spiegelmesh währenddessen verstecken, `hide`).
- **Überwachungsspiegel** (`modules/shopmirror.js`, Gruppe `m3-shopmirror`, damit `city.partition()` ihn mit der Ladenhülle ausblendet): gewölbte Kuppel (Halbkugel, Radius 0,17 m) + Rahmen + Stange als EIN Mesh (1 Draw-Call), innen über der Eingangstür unter der Decke (`domeSpot`), Weitwinkelkamera `DOME_FOV` = 110° auf eine 256er-RT, per Shader auf die Kuppel projiziert (mit Randabdunklung). Bei `low` und in XR matter Verlauf.
- **Salon-Spiegel:** zwei Planspiegel (`salon-chair`, `salon-booth`); beim Stuhl-/Umkleide-Ablauf ist der jeweils andere ausgeschaltet (`setSuppressed`).

### Salon FRISEUR HAARSCHARF (`modules/salon.js`, `world/build-salon.js`, `world/city.js`, `char/salon-lines.js`)

- **Feste Lage:** `SALON = { x0: −22, z0: sz, x1: −14, z1: sz + 7 }` im Gebäude SW, unabhängig von der Ladenbreite (die Netzabbildung `net/frame.js` bildet x < 0 unverändert ab, sonst stünden Mitspieler daneben). `buildCity` teilt SW nach der Farbvergabe in West-, Ost- und Rückteil um den Salon herum (Farbfolge bleibt), dazu `salonRoof` über dem Salon. Tür 1,6 m in der Front bei x = −18 (Schaufenster links davon); `city.salon` trägt `rect, wall, ceil, door, window, chair, mirror, booth, rack, gabi, ronny`.
- **Zone/Bereich:** Zone `salon` („Friseur“, Blickpunkt `x = −18, z = sz + 3,5`), Bereich `salon` in `areaAt` (nur unter y 2,9; Priorität nach `palastFoyer`), Spawn `salon`; „Friseur“ in der Spielerliste (`net/panel.js`).
- **Sichtbarkeit:** Gruppe `city-salon-interior` (`groups.salonInterior`, `visibleGroups().salonInterior`) nur im Bereich `salon` oder < 12 m vor der Salontür, nicht aus dem Laden heraus. Mitspieler im Salon zeichnet `peers-logic.regionVisible` nur dann.
- **Innenraum** (`buildSalon`): Fliesenboden, Friseurstuhl, Spiegelrahmen, Waschbecken, Föhnhaube, Theke, Kleiderstange, Umkleide mit Vorhang, Deckenlampen und Plakate mit erfundenen Frisurnamen (`POSTER_NAMES`); 3 Draw-Calls (Festkörper, Plakate, Vorhang) plus die beiden Spiegelflächen. Möbel-Kollider als Daten, `salon.js` legt sie per `ctx.addCollider` an.
- **Gabi (Haare) und Ronny (Mode):** feste v2-Looks (`npcCodes()`), echte Figuren über `npc.figure`, als Personen registriert (`registerPerson`, Schlag → taumeln, Spruch `hit`, SFX `oof`), blicken den Spieler an (< 7 m), winken/zeigen im Leerlauf, Sprüche über die Sprecher-Regie (`greet`, `leave`, `idle`, `chair`, `chairDone`, `booth`, `boothDone`, `hit`, `hairNew`, `outfitNew`; `pickSalonLine` vermeidet Wiederholung). Begrüßung höchstens alle 45 s.
- **Stuhl-Ablauf** (`session('chair')`): Interaktion „Friseurstuhl“ (E/Klick/Tippen) → Spieler einfrieren, Kamerafahrt in den Spiegel (950 ms), eigene Figur sitzt (`selfview.playAnim('sit')`), `avatar.openEditor('chair', 'hair', { live })` → Kamera zurück an die Austrittsstelle (520 ms), Aufstehen, Freigabe; alles im `finally` (Abbruch stellt den Spieler an den Austritt, nie in den Stuhl). **Umkleide** (`session('booth')`): Vorhang fährt zu (0,55 s, SFX `curtain`/`whoosh`), `openEditor('booth', 'top', { live })`. Nach einer Übernahme sagt Gabi bzw. Ronny `chairDone`/`boothDone` und `markSeen`; der erste Stuhlbesuch setzt `profile.evt.salonChair`. `suspend` bricht den Ablauf ab.
- **Sitzen über die Leitung:** Der Stuhl setzt `sitting()`; `modules/net.js` sendet dann die Pose `a = 7` ohne `se` (`r` bleibt der Bereich). `peers.js` nutzt Kinositze nur bei `r === 1`, sonst sitzt die Fremdfigur an der Körperposition.
- **VR:** Stuhl und Umkleide öffnen das „VR light“-Panel (`xrchar.open()`), sonst Toast „Die Figur-Auswahl für die VR-Brille ist gerade nicht verfügbar.“
- **Debug:** `__lfxStore.m3.salon` = `{ chair, booth, interior, mirrors, say }`.

### Mehrspieler-Looks (`net/look.js`, `net/peers.js`)

Protokoll und Grenzen: `docs/mp-api.md` (Fähigkeit `look`).
- **Senden** (`createLook(core)`, Teil `look` des Moduls `net`): nur nach einem `wl` mit der Fähigkeit `look` (sonst nie `lk`/`mc`), zuerst beim Beitritt, danach nach `avatar.onChange` (Übernehmen, Platzwechsel) und, wenn sich der Ausweis ändert (Vergleich alle 5 s, weil Leihen, Kino und Stempel ohne Ereignis wachsen). Nie während der Live-Vorschau (`avatar.onPreview` aktiv). Raten `LK_GAP_S` = 2 s, `MC_GAP_S` = 5 s; gleicher Inhalt wird nie doppelt gesendet. `mc` = `toWire(member.cardData())`, solange „Ausweis zeigen“ gilt und es eine Ausweisnummer gibt, sonst `null`; das Abschalten geht ohne Wartezeit raus.
- **Empfangen** (`createPeers`): `wl.lk`/`wl.mc` (Karten `c` → Wert) und die Ereignisse `lk {c,l}`/`mc {c,m}`. `decode` macht aus jedem Code eine gültige Figur (Unbekanntes wird zum Standard), `setLook` auf der vorhandenen Figur. Eine neue Fremdfigur wartet höchstens `LOOK_WAIT_S` = 0,6 s auf ihren `lk` (nur wenn der Server `look` kann), bevor die Seed-Figur gebaut wird (kein Flackern Seed → eigene Figur). Ohne `lk` bleibt die Seed-Figur (`makeLook(seeded(lookSeed(k)))`).
- **Kompatibilität:** Alter Client + neuer Worker: bietet `look` im `hi` nicht an, bekommt nichts und sieht weiter Seed-Figuren (die anderen sehen ihn auch so, ohne `lk`). Neuer Client + alter Worker: keine Fähigkeit `look`, es wird nichts gesendet, alle Fremden sind Seed-Figuren, die eigene Figur sieht man lokal trotzdem. Erst den Worker deployen, dann den Client veröffentlichen.

### VR light (`modules/xrchar.js`, `xr/charpanel.js`)

Kleine Figur-Auswahl in der Brille, kein Editor: Panel `buildCharSpec(avatar, state, hooks)` mit Outfit-Platz 1–3 (`avatar.setSlot`), Zufall (`randomize`) und einem Reiter je Farbteil (Haare, Oberteil, Hose, Schuhe, Mütze, Tasche) mit den 16 Palettenfeldern (`avatar.setColor`, übernimmt sofort); kein Farbwähler, keine Texteingabe. Einstiege: Eintrag „Figur“ im VR-Menü (`xr/menu.js`, nicht im Kino), Salon-Stuhl/-Umkleide und `avatar.openEditor` in VR. Das Panel zeichnet sich bei Änderungen von außen (`avatar.onChange`) per `handle.update(spec)` neu, ohne die Szene neu aufzubauen. Auch in VR sehen andere die eigene Figur (Look über `net`), die eigene Außenansicht und der Ego-Körper bleiben aus, Spiegel sind matt.

### Konto-Profil (`features/store/profile.js`, `profile-merge.js`, `displayprefs.js`)

- **Hülle:** `home.js` legt mit Jellyfin-Benutzer ein Profil an (`createProfile({ uid, name, storage })`, einmal je Benutzer) und lädt parallel zum Katalog (`profile.load({ timeoutMs: 4000 })`, höchstens 4 s; Zustand `'ok'`/`'local'`/`'unknown'`); es geht als `deps.profile` ins 3D-Bundle. Cache: `localStorage lfx.store.profile.<uid>` = `{ data, dirty }`.
- **Form von `deps.profile`:** `get()` (immer ein Objekt, notfalls leer mit `v: 1`), `update(mutator)` (ändert eine Kopie, normalisiert, schreibt sofort in den Cache, lädt 2 s entprellt hoch), `state()` (`'ok'` Konto gelesen, `'local'` nur Cache, `'unknown'` nichts), `onRemote(fn) → off` (Konto-Daten kamen später oder haben sich geändert), `dev` (Geräte-ID), `load()`, `dispose()`.
- **Daten** (`Profile`): `{ v: 1, fig: { act: 0..2, slots: [{ l: int[26], t: ms, prov?: true } | null ×3] }, set: { cam: 'ego'|'third', t }, mem: { no: '123456', since: dayNumber } (leer = noch keine Nummer), cnt: { rent: { dev: n }, cine: { dev: n }, last: {…} }, disc: { id: ms }, seen: { richard?, gabi?, ronny?, richardR?, gabiR?, ronnyR?, t }, evt: { salonChair?: ms } }`. `normalize` bringt jedes Feld einzeln auf einen gültigen Wert (Müll wird verworfen).
- **Konto:** Jellyfin-`DisplayPreferences` mit der Id `lenzstore`, Client `lenzflix` (die Design-Id `lenzflix` bleibt unberührt), Schlüssel `CustomPrefs.profile` (JSON-String). `updateCustom` liest immer erst das ganze Objekt (GET), ändert nur den eigenen Schlüssel und schreibt das ganze Objekt zurück (POST): fremde `CustomPrefs` bleiben erhalten; ohne erfolgreiches GET nie ein POST. Wiederholung nach 5 s / 30 s / 2 min, `dirty` bleibt bis zum Erfolg und wird beim nächsten Start hochgeladen. `serialize` lässt `cnt.last` weg und kürzt über 6000 Zeichen stufenweise (zuerst `seen`/`evt`, dann Zähler, dann `disc`, dann nicht aktive Plätze).
- **Merge** (`mergeProfiles(local, remote)`): Plätze einzeln, ein Konto-Platz ohne `prov` schlägt einen lokalen `prov`-Platz immer, sonst gewinnt der spätere `t` (Gleichstand: lokal); `act` folgt der Seite mit dem späteren nicht-vorläufigen Platz; `set` und `seen` nach `t`; `mem`: das kleinere `since` (samt Nummer); `cnt.rent`/`cnt.cine` je Geräte-ID das Maximum, höchstens 8 Geräte (der Rest wandert in `_`); `disc` Vereinigung mit dem früheren Zeitstempel; `evt` Vereinigung mit dem späteren; `cnt.last` kommt nur lokal.
- **Geräte-ID:** zufällig, 8 Zeichen `[a-z0-9]`, `localStorage lfx.store.dev`.
- **Alte Entdeckungen:** Einmalig je Gerät (Marker `lfx.store.discmerged.<uid>`) übernimmt das Profil die alten lokalen Entdeckungen aus `lfx.store.discover.<Jellyfin-Name | anon>` (der Schlüssel hängt am Namen, nicht an der Id) nach `disc`; danach vereinigt `discover.js` Profil und lokalen Speicher beim Start und schreibt `found()` zusätzlich ins Profil.

### Harness-Parameter (`build/store-dev.js`, Kopfkommentar)

`opts.dev` enthält alle Query-Parameter einmal (`ctx.opts.dev && ctx.opts.dev.<name>`); Module lesen ihre eigenen. `deps.profile` ist im Harness ein Fake im Speicher (kein Netzwerk, `window.__devProfile`):
- `?profile=ok` (Standard) | `offline` (Zustand `local`) | `slow` (leeres Profil, das Konto kommt nach 6 s per `onRemote`) | `fail` (Zustand `unknown`).
- `?char=keep` (Standard: vorhandener Look) | `new` (leeres Profil → Gate) | `look:<csv>` (Look-Code, 26 Ganzzahlen).
- `?unlock=all` (alle Entdeckungen des Katalogs gesetzt, seit 1.18.0 19); `?member=bronze|silver|gold` (Zähler und Entdeckungen passend zur Stufe, Ausweisnummer 123456).
- Dazu `?spawn=salon` (Startpunkt im Salon), Mehrspieler mit `?mp=fake&bots=N` bzw. `?mp=relay` (siehe „Harness (Mehrspieler)“; Looks und Ausweise gehen dort über den echten Reducer).

### Draw-Calls und Größe

Ziel bleibt ≤ 140 je Bild bei `low` (an der Ladentür, auch mit `?mp=fake&bots=5`, in Ego und Außenansicht).
- Außenansicht +2 (Figur, Schatten), ausgeglichen über `npc.reserve(2, 'self')`; Ego-Beine 0 bei Geradeausblick; Salon innen 0 (Gruppe verborgen, außer im Salon bzw. < 12 m vor der Tür); Überwachungsspiegel +1 (matt bei `low`); Spiegel-Renders erscheinen dank `autoReset`-Wächter nicht im Hauptbild (siehe „Spiegel“); Studio ~3 Calls bei ausgeblendeter Welt; fremde Figuren mit v2-Look sind weiter 1 Call je Figur.
- Neue Shader (Spiegel, Kuppel) kompilieren beim ersten Einsatz.

### Fallen (1.17.0)

- Die ID-Listen in `char/ids.js` nie umsortieren, nur anhängen; `makeLook` und `tests/store3d-figure-baseline.test.js` nicht anfassen (Passanten und Seed-Figuren bleiben bitgleich).
- `CanvasTexture` nach Größenwechsel nie weiterverwenden (siehe VR-Modus; gilt auch für das Studio-Schild und Panels).
- `renderer.info.autoReset`/`shadowMap.autoUpdate` bei jedem verschachtelten Render sichern und im `finally` zurücksetzen (siehe „Spiegel“).
- `onChange` des Providers `avatar` NIE aus der Live-Vorschau speisen: nur `onPreview`. Das Netz (`net/look.js`) sendet während einer Vorschau nichts.
- `selfview.mode()` ist die wirksame Ansicht, nicht die gewählte; wer die Wahl braucht, liest `profile.get().set.cam`.
- Kamera-Rig-Gruppe beim Bühnenwechsel mit umhängen (`stageOn`/`stageOff`); ohne Hülle (`!ctx.renderer`) liefert `portrait` `null`.
- `member.cardData()` und `avatar.code()` sind `null` ohne Figur bzw. Profil, Aufrufer müssen das abfangen (Pause-Menü blendet die Einträge aus).
- Reaktionen nur über `changedFor`/`markSeen` und das Budget aus `react-logic.js`; kein eigener Zeitgeber und nie über Körper oder Hautfarbe.
- Noch nicht belegt: der Zähler `cnt.last` ist lokal; ein zweites Gerät kann denselben Titel am selben Tag zusätzlich zählen.

## NPCs und Raufen (1.18.0)

Additiv zu 1.17.0: Waffen, Energie und Raufen mit Passanten, Personal, Rowdy-Bande und Mitspielern, dazu NPC-Stimmen und -Gesten. Module `fight` und `gang` (`modules/fight.js`, `modules/gang.js`, in `MODULES` vor `net`), reine Logik in `fight/*.js` und `npc/*-logic.js`, Netz `net/fight.js`, `net/gang.js`, `net/peerlaser.js`, Worker `charts-worker/src/mp/fight.js` (Fähigkeit `fight`, Vertrag `docs/mp-api.md` §16), CSS `src/css/themes/store/fight.css`. In VR gibt es keine Waffen, keinen Laser, keine Bande und keine NPC-Angriffe (`fight` ist dort inaktiv, `npc`, `gang`, `traffic` prüfen `xrOn()`).

### Waffen (`fight/weapons.js` Z. 6–11)

Alle vier sind sofort verfügbar, Start `hand`. Die Wahl gilt nur lokal und geht per `wp` an die Mitspieler (dort als Handgegenstand `belt`/`whip`/`laser`, `net/peers.js` Z. 31).

| Waffe | Reichweite | Treffer | Schaden (PvP) | Rückstoß | Abklingzeit | Ton |
|---|---|---|---|---|---|---|
| `hand` | 1,6 m | 1 | 12 | 1,0 | 0,35 s | `slap` |
| `belt` (Gürtel) | 2,2 m | 1 | 20 | 1,6 | 0,6 s | `belt` |
| `whip` (Peitsche) | 3,5 m | ≤ 2 | 26 | 1,4 | 1,0 s | `whip` |
| `laser` (Laserpointer) | 15 m | – | 0 | – | – | `laser` (Schleife) |

- Kegel ±25° (`CONE_DEG`), nächste Ziele zuerst (`selectTargets`). `StoreApp.doHit` (`store.js`) trägt `weapon`, `range`, `max` der gewählten Waffe in `actionEvent` ein (der Laser zählt dort wie `hand`, sendet aber nie `hit`), prüft vorher `fight.swingOk()` (Abklingzeit) und ruft danach `fight.swung(ev)` (Ton, Pose, Abklingzeit).
- `onAction('hit')`-Prioritäten: Richard 30 > Bande 25 (`gang.js` `HIT_PRIO`) = Mitspieler 25 (`fight.js`, Handler `onAction('hit')` am Ende des Moduls) > Personen 20 > Objekte 10. Bei gleicher Priorität gilt die Anmeldereihenfolge (`fight` vor `gang`).
- Ego-Ansicht: `ui/hands.js` zeichnet Gürtel (flacher Hieb), Peitsche (Überkopf-Hieb mit Welle) und Laser-Gerät; `createHands(camera, { quality })`, bei `low` blendet ein leuchtender Laser sein Gerät aus. Außenansicht und Mitspieler: Handgegenstand per `setHandItem` (siehe unten).

### Energie, K.O. und Schutz (`fight/energy.js`, `modules/fight.js`)

- Energie 0..100. Nach 6 s ohne Treffer füllt sie sich mit +3,3/s (`REGEN_DELAY`, `REGEN_RATE`). Anzeige `ui/energy.js`: Balken grün → rot, erscheint bei Schaden, blendet 1,4 s nach voller Energie aus; Sterne und Kamerawackeln beim Treffer (nicht bei `prefers-reduced-motion`, die Sterne stehen dann still).
- Jeder Treffer am Spieler läuft über `fight.hitPlayer({ dmg, knock, src, from })`: prüft Schutz, VR, K.O., zieht Energie ab, `player.knock` (Stärke 0,5–2,2), Ton `ouch`. Schaden: Passant Faust 8, mit Gegenstand 11 (`ATK`), Rowdy 8, Gabi 8, Ronny 10, Bonbon/Popcorn 4 (`npc/throw-logic.js`), Mitspieler je Waffe (Tabelle). Seit 1.18.1 zieht `hitPlayer` bei `src` `'npc'`/`'gang'` (auch Bandenhiebe übers Netz) nur die Hälfte an Energie ab (`NPC_DMG_SCALE` = 0,5 in `modules/fight.js`; Rückstoß unverändert); Mitspieler (`'pvp'`) voll.
- **K.O.** (`startKO`): Energie 0 → Spieler eingefroren, Ton `ko`, `onKO`-Hörer, Schwarzblende mit Sternen (700 ms Ein-/Ausblenden, 1,6 s Halten) → in der Schwärze `items.drop()`, der Spieler sitzt auf der Bank `benchN` vor dem Laden (`layout.city.fixtures`, Sitzhöhe 0,48 m, Animation `sit`; `ctx.player.koSeat(o?)` ist der Haken, `fight.sitting()` bis er wieder läuft), `energy.wake` (volle Energie, 10 s Schutz `KO_PROTECT`, Schild-Anzeige), `cashier.event('playerKO')` (Richard kommentiert aus der Tür, auch draußen), Entdeckung `knockout`, danach `freeze(false)`. Während des K.O. meldet `poseCode()` 9, auf der Bank 7 (nur lokal, siehe „Posen-Codes“).
- **Schutzzonen** (`fight/safezones.js` Z. 3; Reihenfolge der Gründe: `xr`, `menu`, `cinema`, `kids`, `couch`, `salon`): Kinosaal, solange der Film läuft (`cinema2d.active` und Phase `starting|playing|paused`, auch beim Mitschauen), Kinder-Ecke `zones.kids`, Couch (`couch.seated()`), Friseurstuhl und Umkleide (`salon.busy()`/`sitting()`), VR. `fight.protected()` = Zonen ∪ K.O. ∪ Energieschutz. Sie gilt in beide Richtungen: `hitPlayer` und `blindPlayer` verwerfen dort alles, `swingOk()` liefert in einer Schutzzone `false` (kein Schlag, auch nicht auf Passanten oder Objekte), der Laser startet dort nicht und geht beim Betreten aus (`canLaser`), und der Mitspieler-Schlag sendet bei `protReason()` (Zone, K.O.-Schutz, offenes Menü) kein `fh`.
- **Menü schützt** (`energy.setMenu`; „Menü“ = nicht im Laufmodus, Waffenrad nicht offen, nicht im K.O.): Der Schutz greift erst 3 s nach dem Öffnen (`MENU_LOCK`, Missbrauchssperre) und hält bis 2 s nach dem Schließen (`MENU_TAIL`); wird das Menü im Nachlauf wieder geöffnet, gilt er sofort weiter. Sichtbar für die anderen: Posen-Code 15 `away` (Anzeige `idle` plus „⏸“ am Namensschild, `net/peers.js` Z. 402), solange ein Schutz wirkt.
- Der Empfänger prüft zusätzlich selbst: `onFh`/`onLb` prüfen Schutz und Abstand (Toleranz `PEER_HIT_DIST` 4,5 m, der Server rechnet 3,6 m) und rufen `hitPlayer`/`blindPlayer`; Bandentreffer (`src 1`) haben `src: 'gang'` und keine Abstandsprüfung gegen den Absender (`m.c` ist der Führer, der Server prüft gegen die Bandenpositionen), die übrigen `'pvp'`.

### Laser (`modules/fight.js` `laserTick`, `npc/laser-logic.js`, `fight/ray.js`)

- Leuchtet, solange man hält (F/Linksklick, Touch: Waffenknopf länger als 0,22 s `AUX_TAP`). Tick alle 0,1 s (`LASER_TICK`); der Strahl (`castRay`) endet an statischen Kolliderboxen, am Boden oder nach 15 m; in der Außenansicht beginnt er am Auge der Figur.
- Verweilzeit 0,5 s (`DWELL`) auf dem Ziel (Person, Richard, Fahrer, Mitspieler), dann einmal das Ereignis; verlässt der Strahl das Ziel, beginnt es von vorn. Katze und Tauben reagieren sofort über `animals.laser` (keine Verweilzeit).
- Ziele: **Person** (Kopfkugel Radius 0,17 m um die Gesichtsmitte `handle.faceWorld()` = Kopf-Bone + 0,16 m, seit 1.18.1; vorher der Blasen-Anker `headWorld` über dem Kopf; Passanten, Personal, Kiosk, Gabi, Ronny) → `npc.laserHit` (Hände vor die Augen 2 s `BLIND_MS`, danach greift ein Hitzköpfiger an, sonst Flucht); **Richard** (Kopfkugel) → `brawl.hitBy('laser')`, zählt als Treffer; **Fahrer** → `traffic.laserHit(point)` (Fahrerkabine, Box 3,2 m lang, y 0,65–1,75) und `traffic.blindDriver`: Vollbremsung mit 9 m/s² (`BRAKE_DECEL`), danach 2,5 s stehen und hupen (`HONK_S`, Auto-Zustand `blind` in `cars-logic.js`); **Katze**: jagt den Punkt (bis 8 m mit freier Sicht, Provider `animals.laser`, nach 3 s Jagd Entdeckung `cat-laser`; geht der Laser nach mindestens 1 s Jagd aus, springt sie); **Tauben**: ein Punkt näher als 2,5 m scheucht den Schwarm auf; **Mitspieler**: Kopfkugel aus `net.fight.peerPos` → `lb { c }` (der Empfänger wird 2,5 s geblendet).
- Anzeige: Bei `low` nur ein DOM-Punkt `.lfx-store-fight-dot` (0 Draw-Calls, ohne Tiefentest, hinter Wänden gelegentlich sichtbar). Ab `mid` ein Mesh `lfx-laser-dot` (+1 Draw-Call), in der Außenansicht zusätzlich der Strahl `lfx-laser-beam` (+1, additiv, von der Hand der Figur). Mitspieler-Laser: `net/peerlaser.js`, ein gemeinsames Mesh für höchstens 4 Punkte (+1), ab `mid` ein dünner Strahl (+1), Ablauf 6 s ohne neue Meldung (`EXPIRE_S`).
- Aus bei: Menü, K.O., Schutzzone, Waffenwechsel, eigenem Blenden, Suspend, VR. Ton: `sound.laser(on)` (Summen-Schleife).

### Blendschleier (`ui/blindveil.js`)

Weiß, 2,5 s (`VEIL_MS`) mit radialem Nachbild, rein monoton ausblendend (kein Flackern, keine Wiederholung), höchstens einmal je 4 s (`VEIL_GAP_MS`, `start()` liefert sonst `false`); bei `prefers-reduced-motion` ohne bewegtes Nachbild und 1,5 s (`VEIL_REDUCED_MS`). Die Animation steckt in `fight.css`, das Skript setzt nur Klasse und Dauer. `blindPlayer(ms)` setzt für die Dauer die Pose 10 (`cover`) und schaltet den eigenen Laser aus; ein empfangenes `lb` blendet `BLIND_MS + 500` = 2,5 s (nur wenn der Absender ≤ 16 m entfernt ist).

### Eingabe (Waffen)

- Desktop (`controls/desktop.js`): R halten = Waffenrad (`onWheel` beim Drücken, `onWheelUp` beim Loslassen wählt das markierte Segment; Wiederholungen werden verschluckt; R steht nicht in `ACTIONS`), Ziffern 1–4 (`Digit`/`Numpad`) wählen direkt (`onWeaponPick`, im Laufmodus verschluckt), Mausrad = nächste/vorige Waffe (`onWeaponCycle`, 140 ms gedrosselt, nur mit Pointer-Lock oder `dragLook`), F oder Linksklick = Angriff (der Linksklick zählt nur, wenn kein Interaktionsziel anvisiert ist: `doUse('click')` fällt sonst auf `doHit('click')`). Beim Laser leuchtet der Strahl, solange gehalten; Loslassen (`onHitUp`, `onTakeUp`) schaltet ihn aus.
- Touch: Waffenknopf „WAFFE“ neben „Schlagen“ (`ui/gamepad.js` `setAux`, `controls/touch.js` `onAux`/`onAuxUp`, nur Schema `game`): Antippen = Waffenrad, bei Laser länger halten (> 0,22 s) = leuchten. Beschriftung fest „WAFFE“, nicht die aktuelle Waffe.
- Waffenrad `ui/weaponwheel.js`: vier Segmente (Hand, Gürtel, Peitsche, Laserpointer), Maus/Tipp, Pfeiltasten + Enter, Ziffern; R und Esc schließen. Mit `ctx.overlay` gibt es den Pointer-Lock nur kurz frei.
- Die Waffenwahl an die Mitspieler ist entprellt (300 ms, `WP_DEBOUNCE`) und gleiche Wahl wird nicht doppelt gesendet.

### Passanten: Temperament, Angriffe, Gegenstände (`modules/npc.js`, `npc/temper-logic.js`, `attack-logic.js`)

- Temperament je Passant aus dem Seed (`temperOf`): etwa 35 % ängstlich (`shy`), 45 % normal, 20 % hitzköpfig (`hot`). Harness `?temper=hot|shy|normal` erzwingt eines.
- Provokation (Schlag, Waffe, Wurf über `handle.hitReact`; Anrempeln; `walkerProvoked`, `walkerBumped`): ängstlich flieht, normal schimpft (`provokeNormal`), hitzköpfig droht (Ärmel hoch 0,7 s, Drohpose, insgesamt 1,5 s) und greift bei einem Schlag an, oder wenn er schon gedroht hat (Gedächtnis 20 s `THREAT_MEMORY`). Angriff: läuft mit 3,2 m/s hinterher, **höchstens 8 s** (`CHASE_MAX`), schlägt ab 1,3 m (Hieb alle 1,3 s, Faust 8, mit Gegenstand 11). Der Angriff endet bei Schutz oder VR, wenn der Spieler ab 1,2 m Höhe steht (Dach) oder die Straße unsichtbar ist, bei Hindernis länger als 1,2 s oder Abstand über 18 m; danach setzt der Passant im Wegegraph wieder ein (`nearestOnGraph`). Ein Treffer auf ihn bringt ihn kurz aus dem Tritt (`stunAttack`).
- Gegenstände aus dem Look (`attackItem`): Regenschirm, Handtasche/Rucksack (`bag`), Tüte (`shopping`), sonst Faust; gesetzt per `setHandItem`, nach dem Angriff zurück (der Schirm wieder aufgespannt, wenn es regnet).
- Umstehende: Hitzköpfige im Umkreis von 9 m machen mit (`joinBystanders`, `bystanderJoin`), **höchstens 3 Angreifer** gleichzeitig (`MAX_ATTACKERS`, `canAttack` prüft beim Start). Geblendete Hitzköpfe, die danach angreifen würden, zählen mit; beim Übergang von der Blendung zum Angriff wird die Grenze erneut geprüft (`env.canAttack`), sonst flieht er.
- Personal (`npc/aggro-logic.js` `AGGRO`): **Gabi** droht mit dem Föhn (1,2 s) und schlägt ab dem 2. Schlag binnen 8 s (Schaden 8, 5 s Pause, Reichweite 2,6 m), **Ronny** droht mit dem Kleiderbügel (1,0 s) und schlägt ab dem 1. Schlag (Schaden 10); beide nur außerhalb `salon.busy()` (`modules/salon.js`). **Kioskfrau** wirft Bonbons (`candy`, Abklingzeit 3,5 s, `modules/kiosk.js`), das **Kino-Personal** Popcorn (4 s); je Schlag auf sie ein Wurf. Richard bleibt bei seinem Zustandsautomaten.
- **Wurf-Pool** (`npc/throwpool.js`, `throw-logic.js`): ein `InstancedMesh` `npc-throwpool` für alle Geschosse (höchstens 6, nur sichtbar solange etwas fliegt, 1 Draw-Call), Parabel ohne Physik mit 8 m/s (0,25–1,4 s Flugzeit); geprüft wird erst bei der Ankunft (≤ 0,9 m horizontal, Brusthöhe), Ausweichen geht. `npc.throwProp(kind, from, to)`, Töne `candy`/`pop`, Treffer → `fight.hitPlayer`.
- Laserblick auf einen Passanten: `npc.laserHit` (Pose `cover` 2 s, Spruch `blinded`; Hitzköpfige greifen danach an).

### Rowdy-Bande (`modules/gang.js`, `npc/gang-logic.js`, `net/gang.js`)

- **Spawn:** `spawnCount(tod, seed)` deterministisch aus Zeitfenster-Seed (`SLOT_MS` 20 min; Uhr: Server-Zeit bei Mehrspieler, sonst lokal) und Tageszeit (`weather.tod`): nachts 2–3, Dämmerung 0–1, tags selten einer (20 %); höchstens 3 (`GANG_MAX`), bei `low` höchstens 2 Figuren (`figCap`, Z. 116). Startpunkte `spawnPlan` aus dem Raster der Gasse (1,6 m) und des Hofs (3,2 m). Eigener Look `rowdyLook` (Lederjacke, Mütze, nie Freischalt-Teile). Ein neuer Plan wird nur übernommen, wenn alle ruhig sind. Harness `?gang=1|0|day`.
- **Bereiche** (`gangEnv`, `gangAreaOk`): erlaubt Gasse (`alley`), Hof (`yard`) und Feuertreppe (`escape`) sowie höchstens 6 m (`STREET_MARGIN`) daneben; verboten Laden (`store`) und Tür (`doorway`, je +0,3 m) und feste Kollider. Ist der Spieler außerhalb der erlaubten Zone oder geschützt, kehrt die Bande an den Platz zurück. Rowdys auf der Feuertreppe laufen mit `y = 0`, Clipping in die Stufen ist möglich (bekannt). Ist der direkte Schritt gesperrt, gleitet ein Rowdy entlang einer Achse (`moveTo`, 1.18.1); kommt er im `attack` `STUCK_GIVE_UP_S` = 4 s nicht weiter, gibt er auf (`idle`, `GIVE_UP_COOL` = 6 s zurück an den Platz). In 1.18.0 hing ein Rowdy mit versperrtem Weg dauerhaft in `approach`.
- **Ablauf** je Rowdy (`ST`): `idle` → `approach` (Spieler < 12 m) → `taunt` (< 3,2 m oder, seit 1.18.1, versperrter Weg: `STUCK_TAUNT_S` = 1,2 s Stillstand bei < 9 m; 2,5 s, Spruch `rowdyAccost`: sie sprechen zuerst an) → `threaten` (2 s, `rowdyThreat`) → `attack` (Schlag mit 8 Schaden alle 1,2 s, `rowdyAttack`). Rowdy-HP 60: bei ≤ 25 % flieht er 6 s (`rowdyFlee`), bei 0 liegt er 4 s (`beaten`) und flieht dann; er kommt mit mindestens 50 % HP zurück. Wird der Spieler K.O., spricht der nächste `rowdyWin` und die Bande beruhigt sich. Spieler schlagen sie mit `onAction('hit')` (Prio 25), Schaden aus `weaponInfo` (der Laser schlägt nicht).
- **Entdeckung `gang-flee`** erst, wenn die **ganze Bande** flieht oder besiegt ist (`checkDispersed`, `gang.js` Z. 280) und der Spieler selbst in den letzten 25 s getroffen hat.
- **Geteilte Führung** (Muster `rich.js` und `net/richard.js`), Rollen `local | leader | follower` (`gang.role()`): Wer in 35 m (`LEAD_NEAR_M`) Mitglieder sieht und keinen Führer kennt, fordert per `gc` die Führung (der Server vergibt sie nur, wenn frei). Der Führer rechnet die Bande, wählt je Rowdy das nächste Ziel unter sich und den Mitspielern (VR-Mitspieler nie; deren Schutz prüft der Empfänger), sendet `gs` 6/s und Treffer auf Mitspieler als `fh` mit `src 1`; Mitläufer spiegeln die Zustände geglättet, ihre Treffer auf Rowdys gehen als `gh` an den Führer (er führt die HP). Der Führer gibt per `gr` ab (ohne Mitglieder, Suspend, `dispose`). Ein Mitläufer ohne `gs` länger als 6 s (`STALE_S`) lässt die Bande verschwinden. Tageszeit-Phase und Seed des Führers stehen im `gs` und gelten für alle. Ohne Fähigkeit, Verbindung oder Führer läuft alles lokal wie ohne Mehrspieler. Passanten bleiben immer lokal.
- Draw-Calls: je sichtbarer Rowdy eine Figur, `npc.reserve(n, 'gang')` gleicht aus (Überlaufregel aus 1.17.0).

### Stimmen und Gesten (`modules/voice.js`, `npc/social-logic.js`)

- **Alle NPCs sprechen über die Sprecher-Regie** (`cashier.speaker`): `npc.speak(handle, text, { id, voiceSeed, prio, ms })` → `'spoken'|'bubble'|'muted'` (bei `'bubble'`/`'muted'` zeigt sie die Blase), `npc.say` läuft ebenso (ohne Regie direkt als Blase). Nur die nächste Person bis 10 m spricht laut, Richard hat Vorrang (Regeln aus 1.17.0). Die Stimme je Person kommt aus dem Seed: `voiceFor(seed, nVoices)` → `{ pitch, rate }` (bei weniger als 4 lokalen deutschen Stimmen volle Spreizung, pitch 0,7–1,4, rate 0,85–1,15; sonst pitch 0,9–1,15, rate 0,92–1,08); `seedHash(seed)` macht aus Texten (`staff-ticket`, `kiosk`) Zahlen (FNV-1a). Rowdys geben eigene `pitch`/`rate` vor und `prio: 1`. Seit 1.18.1 nimmt `speaker()`/`npc.speak` optional `gender: 'f'|'m'`: `pickVoiceSeeded` wählt dann aus den deutschen Stimmen dieses Geschlechts (Namenslisten `FEMALE`/`MALE` in `voice.js`), sonst wie bisher aus allen; mit passender Frauenstimme dämpft `personPitch` die Abweichung der Tonlage von 1 auf 40 % (Gabi 1,25 → 1,10, Kioskfrau-Seed 0,83 → 0,93). Der Laser blendet Personen auch in ihrem eigenen Kollider (Kioskfrau in der Bude, `insideOwnBox` in `modules/fight.js`): Läuft der Strahl durchs Gesicht und endet vorher an einer Wand, zählen Kollider, die den Standort der Person umschließen, nicht als Verdeckung. Gesetzt bei Gabi (`f`), Ronny (`m`, `VOICES`) und der Kioskfrau (`f`); Passanten, Personal und Rowdys bleiben ohne.
- **Emote-Rad auch ohne Mehrspieler:** Provider `emotes` (`modules/net.js`, `net/emote-ui.js` `createLocalEmotes`): T oder Touch-Knopf öffnet das Rad, die Figur spielt die Animation lokal (`selfview.playAnim`). Mit Mehrspieler zusätzlich `e` senden (die Taste T geht zuerst an den Mehrspieler-Teil, Prio 10, sonst an den lokalen, Prio 0). Das Rad schließt vor dem Abspielen. Hook `emotes.onPlayerEmote(fn({ name, code, anim }))`; der Rückfall ist das ctx-Ereignis `player-emote`.
- **NPC-Reaktionen** (`npc.react(event, data)`): Spieler-Emotes (Tanzen → bis 2 Passanten tanzen 4 s mit, Winken → winken zurück, Verbeugen → klatschen), Ereignisse `basket`, `cans`, `discover` (Jubel/Klatschen), `alarm`, `ban` (Kopfschütteln; `alarm` beim Diebstahlalarm in `rent.js` und wenn Richard jagt (`chase`), `ban` bei Hausverbot (`banned`)), Alltag (Wartende an der Ampel tanzen selten, 60 s Pause; Bekannte, etwa 25 %, winken), Drohen vor dem Angriff. Je Anlass höchstens 2 Personen im Umkreis 9 m (`pickReactors`); gleiche Ereignisart höchstens alle 3 s (Emotes ausgenommen).
- **Inhaltsregel für Sprüche:** Die Rowdy-Kategorien `rowdy*` in `npc/lines.js` dürfen derb sein, mit schwarzem Humor und echten Schimpfwörtern („Arschloch“, „Wichser“, „Vollidiot“, „Loser“). Nicht erlaubt: Diskriminierendes (Herkunft, Hautfarbe, Religion, Geschlecht, Sexualität, Behinderung), sexuelle Gewalt, echte Personen. „Penner“ steht nicht drin, weil es Obdachlose herabsetzt. Für **alle anderen NPCs** (Passanten, Personal, Kiosk, Richard) bleibt es „eher frech, ohne Beleidigungen“.

### Entdeckungen und Freischaltungen

19 Entdeckungen (`discover/catalog.js`, die vier neuen am Ende). Die Freischalt-Teile stehen in der Tabelle unter „Freischaltungen (`char/unlocks.js`)“; die Geometrie (`studjacket`, `bandaid`, `curlers`, `catpack`) steckt in `npc/figure-parts.js`, `UNLOCK_PENDING` in `char/ids.js` ist leer.

| ID | Titel | Auslöser |
|---|---|---|
| `cat-laser` | Jagdfieber | Katze jagt den Laserpunkt 3 s lang (`animals-logic.js` Ereignis `catlaser`) |
| `gang-flee` | Haltung bewahrt | ganze Bande geflohen oder besiegt, siehe oben |
| `salon-first` | Neuer Schnitt | erster Friseurstuhl (`salon.sitting()` oder `profile.evt.salonChair`; Konto-Altbestand wird still nachgetragen, `modules/discover.js`) |
| `knockout` | Lichter aus | K.O. (`fight.js`, in der Schwarzblende) |

### Posen-Codes, `ANIMS`, Handgegenstände

- Leitungscode `a` (Posen-Code, Worker lässt 0..15 durch, `docs/mp-api.md` §6.2): 9 `ko` (liegt), 10 `cover` (geblendet), 11 `whip`, 12 `belt`, 13 `aim` (Laser zielt), 14 `threat`, 15 `away` (Menü offen, Anzeige `idle` plus „⏸“). `NET_A_ANIM` in `net/proto.js` ordnet sie den `ANIMS`-Namen zu; die Hand-Schlag-Pose bleibt `6`/`hit`. `modules/net.js` (`samplePose`, Z. 315) übernimmt `fight.poseCode()` nur im Bereich 9..15 (9 K.O., 10 geblendet, 15 Menü-Schutz, 11/12 für 0,5 s nach dem Hieb, 13 Laser; Reihenfolge der Prüfung in `poseCode`), und nie über `a = 7` (Kinositz mit `se`, Friseurstuhl). Der Code 14 `threat` kommt nur von Rowdys im `gs` (`net/gang.js` `netAnim`). Das K.O.-Sitzen auf der Bank (`poseCode` 7) geht nicht als `a = 7` auf die Leitung, Mitspieler sehen dort die Körperpose. Alte Clients zeigen unbekannte Codes als `idle`.
- `npc/anim.js` `ANIMS` neu am Ende: `threat, sleeves, shake, cover, whip, belt, aim, ko, swing, toss` (Index 14–23); `ONE_SHOT` kennt `whip`, `belt`, `swing`, `toss`; zeitbegrenzt `threat` 2,5 s, `sleeves` 2 s, `shake` 1,6 s. Die Indizes davor bleiben stabil.
- `handle.setHandItem(id)` (`npc/figure.js`, `getHandItem()`): `HAND_ITEMS` = `belt, whip, laser, bag, umbrella, shopping, dryer, hanger, candy, popcorn` (`candy` und `popcorn` zeigen die leere Wurfhand). Der Gegenstand steckt im selben gemergten Mesh (Bone `armR`, Ort `HAND_R`), also 0 zusätzliche Draw-Calls; eigener Cache-Zweig je Gegenstand (`|h:<id>`, beim Schirm mit Farbe); er bleibt über `setLook` erhalten und wird in der Ich-Sicht (Arme ausgeblendet) nicht gebaut. Startwert aus `look.handItem`. `modules/fight.js` hängt die gewählte Waffe an die eigene Figur (Außenansicht), `net/peers.js` an die der Mitspieler.

### Provider (Zusammenfassung)

`fight`, `gang`, `animals`, `emotes` sind neu; `npc`, `traffic`, `brawl`, `cashier`, `sound` erweitert (Tabelle „Provider und Module“). Immer erst bei Gebrauch und mit Guard holen (`ctx.use('fight')?.…`); `ctx.player.koSeat(o)` (`modules/runtime.js`) reicht an `fight.koSeat` durch. `ctx.use('net').fight` (Teil `net/fight.js`) = `{ has(), send(type, payload), on(type, fn) → off, leader(), isLeader(), gen(), peerPos(c) }`, alles in lokalen Einheiten (Meter, rad); die Umrechnung in den Netzrahmen macht der Teil.

### Harness-Parameter (`build/store-dev.js`, Kopfkommentar)

`?gang=1|0|day` (Bande erzwingen, aus, auch tagsüber), `?weapon=hand|belt|whip|laser`, `?hp=<0..100>` (Startenergie), `?ko=1` (K.O. nach 2 s), `?blind=1` (Schleier nach 2 s), `?safe=kids|hall` (Start in der Schutzzone), `?temper=hot|shy|normal`, `?mpcap=nofight` (Fake/Relay wie ein alter Worker ohne `fight`), `?botgang=1` (mit `?mp=fake&bots=N`: Bot 0 ist Bandenführer; Bots wählen zufällige Waffen, schlagen und lasern, `?botfight=0` schaltet das ab). Bots: `build/mp-dev/bots.js` (Debug `hit`, `weapon`, `laser`, `gangLead`, `peers`).

### Draw-Calls und Größe

- Ziel bleibt ≤ 140 bei `low`. Spitze 1.17.0 war 140 am Gassenmund (−1,8 / fz+1,2, Blick 315°, nachts), genau dort steht die Bande; gemessen 1.18.0 (Harness, Commit-Stand): max. 135 mit Bande, Laser und 5 Mitspielern (vorher 146). Ausgleich: **Schaufensterplakate gemergt** (`modules/showcase.js`: außen immer ein Mesh; innen bei `low` ein Mesh ohne Wackeln, sonst einzeln und animiert), Bande höchstens 2 Figuren bei `low` plus `npc.reserve`, Laser bei `low` nur als DOM-Punkt, Waffen und Gegenstände an Figuren in der Figurengeometrie (0), Wurf-Pool +1 nur während Flug, Mitspieler-Laser +1 (ab `mid` +1 Strahl).
- `lenzstore.min.js`: Warnschwelle `STORE_MIN_BUDGET` in `build/build.mjs` auf 1,55 MB angehoben (Nutzer-OK, vorher 1,45 MB).

### Fallen (1.18.0)

- ID-Listen nur anhängen: `ANIMS` (`npc/anim.js`, `brawl-pose.js`), `discover/catalog.js`, `UNLOCKS`, `char/ids.js`, Posen-Codes. Alte Clients zeigen unbekannte Codes als `idle`.
- `cover` (Richard) geht im Netz als `stagger` raus (Worker klemmt `rs.a` auf 0..9); bewusst nicht erweitert.
- Mit ausgehandelter `fight` sendet `net/push.js` kein `pu` mehr, den Rückstoß für alte Clients macht der Server (`fh` → `pu`). Sonst bekäme ein Ziel den Stoß doppelt.
- Der Laser sendet nie `hit` (`doHit` liefert `fight.laser(true)` zurück); wer `onAction('hit')` nutzt, sieht keinen Laser.
- Mitspieler-Schlag (`fight`) und Bande (`gang`) teilen die Prio 25; der erste `true`-Wert beendet die Kette, `fight` ist vorn (Reihenfolge in `MODULES`).
- Schutz gilt in beide Richtungen (Empfänger: `hitPlayer`/`blindPlayer`; Angreifer: `swingOk`, `canLaser`, PvP-`fh`). Der Führer der Bande kennt den Schutz der Mitspieler nicht (`safe: false` in `collectTargets`); den prüft der Empfänger.
- Die Gruppen-Rollen `local/leader/follower` wechseln im Laufen: nach `onSuspend`/`dispose` immer `gr` senden, sonst hält der Server die Führung bis zu 60 s.
- `net.fight.on('lz')` und der Herzschlag: ein stillgehaltener Laser wird alle 2 s neu gesendet, weil Mitspieler Punkte nach 6 s verfallen lassen.
- Laserpunkt bei `low` ist ein DOM-Element im Host (`ctx.renderer.domElement.parentNode`), kein Mesh; er hat keinen Tiefentest.
- `fight.hitPlayer` kennt `src: 'richard'`, `modules/brawl.js` ruft es aber nicht auf: Richards Kassettenwürfe und Schubser stoßen nur zurück (`player.knock`) und kosten keine Energie.
- Das K.O.-Sitzen auf der Bank erscheint bei Mitspielern nicht als `a = 7` (`net.js` übernimmt von `poseCode()` nur 9..15).
- Neue Kollider und Figuren nahe der Gasse: Draw-Call-Spitze liegt am Gassenmund; vor Änderungen dort mit dem Harness nachmessen (`?mp=fake&bots=5`, `low`).

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

## Niederschlag (1.19.0)

- `modules/precip.js` (vor `daytime` registriert) zeichnet Regen und Schnee als EINE Geometrie (N Quads) mit EINEM `ShaderMaterial` = 1 Draw-Call, auch bei `low`. Die Animation läuft im Vertex-Shader über Uniforms (`uTime`, `uCam`, `uWind`, …), kein Buffer-Upload pro Frame. Volumen 24 x 24 m um die Kamera, Höhe Kamera −6 … +10 m (regnet auch auf Dächern). Dichte: Preset-Schlüssel `precip` (low 260/180, mid 900/500, high 1400/700, Desktop/Handy); `rainLines` bleibt, wird nicht mehr genutzt.
- Provider `precip` { setWeather({ kind: 'rain'|'snow'|null, i: 0..1 }), current() }. Der erste Wert gilt sofort, Änderungen blenden über ~15 s (Artwechsel: erst aus, dann ein). Reine Logik in `weather/precip-logic.js`.
- Schutzboxen (Laden, Palast-Foyer/-Saal, Friseur, Palast-Vordach, Kiosk, höchstens 6): Partikel darunter werden im Shader aus dem Clip-Raum geschoben. Sichtbar nur im Außenbereich oder bei Kamera draußen; Suspend blendet aus.
- `weather` (Provider von `daytime`) hat `precip` und `onChange(fn) → off` (feuert bei Änderung von `raining`). `modules/sound.js` abonniert es und startet/stoppt den Regenton zur Laufzeit (Lautstärke nach `precip.i`, Schnee ohne Regenton).
- Zeitbasis: `uTime` zählt ab dem ersten Update des Moduls (nicht Seitenlaufzeit), sonst quantisiert float32 im Shader nach etwa einem Tag offenem Tab die Fallbewegung. Reduzierte Bewegung (`prefers-reduced-motion`, live per change-Ereignis): Niederschlag bleibt sichtbar, fällt aber ruhiger (`calmFor` in `precip-logic.js`: halbe Fallgeschwindigkeit und Wind, Streifen 60 %, Schnee ohne Pendeln).
- Ultra-Licht (`world/build-ultra-light.js`, 1.19.0): der Neon-Halo dämpft im Shader die Schildfläche (Attribut `aR`), damit er die Schrift nicht überstrahlt, folgt dem Nebel und flackert bei reduzierter Bewegung nicht (`uFlick`); Wandwäsche liegt unter der Schild-Unterkante; Pools werden bei liegendem Schnee schwächer (`poolSnowFactor`). Kontaktschatten: Mitspieler nur über `net.peerPositions()`, Blob bleibt auf der Standfläche (`groundHeight`) und schrumpft mit der Höhe (`airShadowScale`). `forceSinglePass` nur am Pool-Material und am Blitz (MeshBasicMaterial, gemessen sonst 2 Durchgänge); an den ShaderMaterialien (Niederschlag, Neon, Nässe) war es wirkungslos (je 1 Draw-Call gemessen).
- Scheibentropfen: Tropfen stehen still, Rinnsale laufen per `onBeforeCompile` + `uTime` (zweite Textur); 1 Draw-Call, `prefers-reduced-motion`: Rinnsale stehen.
- Falle: `Float32BufferAttribute(array, n)` KOPIERT das Array. Wer später in das eigene Array schreibt (`modules/snack.js` Popcorn), nimmt `new BufferAttribute(array, n)`.

## Echtes Wetter in 3D (1.19.0, Darstellung W3b)
- Zustand: `weather/state.js` `resolveWeather({ debug, real, mp, local })`, Vorrang Debug (Harness `?wx`, `?temp`, `?cover`) > echtes Wetter (`deps.weather()`) > Mehrspieler-Seed (`setRaining`) > lokaler Zufall. Abgeleitet: `kind, i, raining` (Niesel/Regen/stark/Gewitter), `snowing, wet` (= Regen oder Schnee), `cover` (liegender Schnee 0..1 aus der Schneehöhe: 0,02 m dünn … 0,15 m voll), `fog, storm, overcast, temp, real`. `setRaining` setzt nur die Mehrspieler-Ebene und wirkt bei echtem Wetter nicht. Nur der Altparameter `?rain=1|0` ist ein Debug-Wert ohne `real` (kein Thermometer).
- Provider `weather` (`modules/daytime.js`): zusätzlich `kind, i, snowing, wet, cover, fog, storm, overcast, temp, real, flash(k)`; `raining` bleibt der abgeleitete Boolean. Echtes Wetter (Kette, `modules/daytime.js`): beim Start Abruf über `deps.weather()`; bis zur Antwort (höchstens `PENDING_MAX_MS` = 8 s) gilt ein trockener Platzhalter, auch die Mehrspieler-Meldung zählt dann nicht (sonst blitzt Regen auf, wenn die Antwort „klar“ lautet; `precip` bekommt den Platzhalter nicht). Danach alle 15 min aktiver Zeit, bei `onResume` und beim Sichtbarwerden des Tabs (jeweils nur, wenn der letzte Abruf älter als fällig ist). Nach einem Abruf ohne Ergebnis wiederholt sich der Abruf nach ~65 s (`RETRY_S`, knapp über der 60-s-Fehlerfrist der Hülle, höchstens 5 Versuche in Folge), danach wieder im 15-min-Takt; ein hängender Abruf wird nach 15 s freigegeben und seine späte Antwort verworfen. Ein Wert gilt 2 h ab EMPFANG (`REAL_KEEP_MS`; Alter nicht aus dem Server-Zeitstempel, damit eine vorgehende Geräteuhr frische Werte nicht verwirft; nur ein als `stale` gemeldeter Wert behält seinen Zeitstempel), danach Rückfall auf Mehrspieler-Seed bzw. lokalen Zufall. `t: null` = Temperatur unbekannt (kein Thermometer, kein Atem, keine Winterkleidung). Die Hülle (`features/store/weather.js`, `createWeatherSource`) holt `GET /wx` mit Token als Header, 6 s Timeout, Ergebnis 14 min gemerkt (404 = Worker ohne Wetter 5 min, sonstige Fehler 60 s), an das Token gebunden und zusammengelegt; ohne Charts-URL oder Token `null`. `onChange` feuert bei jeder Änderung. Verbraucher nutzen `wet` (Passanten, Scheinwerfer, Entdeckung roof-rain) bzw. `raining` (Regenton, Kassierer-Regensprüche).
- Liegender Schnee: `weather/snow-patch.js`, `onBeforeCompile`-Patch nur auf Materialien, die über `out.tinted` (`getOutdoor(ctx).tint(...)`) laufen (Figuren und Innenräume nie). Option `{ snow: false }` am `tint`-Aufruf nimmt ein Material aus (z. B. das an der Kamera hängende Wurfgeschoss in `throw.js`, dessen Weltposition wandert). Der Patch verkettet eine vorhandene `onBeforeCompile` statt sie zu überschreiben. Uniforms immer vorhanden, fester Cache-Schlüssel (`lfx-snow-v1`): ein Wetterwechsel kompiliert nichts neu. Masken = die Schutzboxen von `precip-logic.js`.
- Nebel: `modules/city.js` `fogTarget` (draußen near 20 → 6 m, far 58 → 22 m, drinnen unverändert, Übergang ~1 s). Himmel: `skyPalette(tod, rain, { overcast, fog, snow })`.
- `modules/weatherfx.js`: Gewitter (Blitze 8 bis 25 s, Donner nur bei Ton über `sound.thunder`, bei `prefers-reduced-motion` keine Blitze), Thermometer `wx-thermo` an der Ladenfront (nur bei echtem Wetter), Atemwölkchen (t ≤ 0, Stufe ≥ high, ≤ 8 Figuren, 1 Draw-Call), Winterkleidung über `npc.setWinterAll(on)` (≤ 3 °C an, ≥ 6 °C aus, dazwischen bleibt der Zustand, ohne Temperatur aus; Mütze/Schal als Cache-Zweig `|w` der Figur; nur wenn der Provider es kennt). Schirme folgen dem Wetter (`modules/npc.js`): bei Regen UND Schnee (`weather.wet`) bekommen Passanten deterministisch je Seed (75-%-Quote wie beim Erzeugen) einen Schirm bzw. klappen ihn bei Ende zu, leicht gestaffelt über wenige Sekunden. Ultra: `modules/ultra-wet.js` (Key `wet`, nasse Straße, höchstens 2 Draw-Calls, bei Schnee nie, 10 min Restnässe nach Regenende).
- Harness: `?wx=clear|cloudy|fog|drizzle|rain|heavy|snow|storm`, `?wxi=`, `?cover=`/`?sd=`, `?temp=`, `?fog=`, `?realwx=fake|404|slow` (Werte `?fk ?fi ?fsd ?ft ?ffog`).

### Harness-Parameter (1.19.0, `build/store-dev.js`, Kopfkommentar)
- Ultra: `?quality=ultra` (ohne Freigabe auf `high` geklemmt), `?ultra=0` (`ultraOk = false` erzwingen), `?tablet=1` (zusammen mit `?touch=1`: Ultra erlaubt wie am Tablet; ohne `tablet` sperren `?phone=1` und `?touch=1` Ultra), `?ufx=-key,…` / `?ufx=only:key`.
- Wetter: `?wx=clear|cloudy|fog|drizzle|rain|heavy|snow|storm` (Debug-Wetter, Vorrang vor allem), `?wxi=0..1` (Stärke bzw. Nebeldichte), `?cover=0..1` oder `?sd=<m>` (liegender Schnee), `?temp=<°C>`, `?fog=0..1`, `?realwx=fake|404|slow` (Fake-`deps.weather`; Werte `?fk` Art, `?fi`, `?fsd`, `?ft`, `?ffog`), Altparameter `?rain=1|0`.
- Draw-Call-Messung weiter mit `?npc=0`, `?cars=0`, `?props=0` und `low`.

### Draw-Calls und Größe (1.19.0)
- Ziel bleibt ≤ 140 bei `low`; Spitze am Gassenmund (nachts, Bande, Laser, 5 Mitspieler) gemessen 131. Niederschlag = 1 Draw-Call (auch `low`), Scheibentropfen 1, Atem 1, Thermometer klein; Ultra-Details nur auf `ultra` (z. B. `ultra-room` +5, `ultra-wet` höchstens +2 und nur bei Nässe).
- `lenzstore.min.js` rund 1,64 MB (Schwelle `STORE_MIN_BUDGET` 1,70 MB, Nutzer-OK); Hauptbundle `lenzflix.min.js` 522 122 B ≈ 510 KiB (Budget 520 KiB = 532 480 B).

### Fallen (1.19.0)
- `Float32BufferAttribute(array, n)` kopiert das Array. Wer später ins eigene Array schreibt, nimmt `new BufferAttribute(array, n)` oder schreibt in `geometry.attributes.<name>.array` und setzt `needsUpdate`.
- `forceSinglePass` bei `ShaderMaterial` ist wirkungslos (gemessen je 1 Draw-Call); nur an `MeshBasicMaterial` (Pool, Blitz) sinnvoll.
- `CanvasTexture`-Anisotropie wirkt erst mit `needsUpdate = true` nach dem Setzen.
- Der Skyline-Ring (`ultra-city`) liegt relativ zum Mittelpunkt (Kamera/Stadtmitte), nicht in Weltkoordinaten; Mindestabstand 50 m, Nebelende vor der Himmelskuppel.
- `onBeforeCompile`-Patches verketten (vorherige Funktion sichern und aufrufen), nie überschreiben; sonst verlieren Schnee-Patch und Nässe ihre Wirkung gegenseitig. Programmschlüssel fest halten (`lfx-snow-v1`), damit ein Wetterwechsel nichts neu kompiliert.
- Shader-Zeitbasis (`uTime`) zählt ab dem ersten Update und wird periodisch gewrappt, sonst quantisiert float32 nach langer Laufzeit.
- Vorwärmen nur für Programme der aktuellen Stufe (`scheduleWarm` `ok()`); wer ein Objekt auf Stufen zeichnet, die es nie sieht, wärmt es nicht.
