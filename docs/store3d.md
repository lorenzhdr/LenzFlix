# VIDEOTHEK LENZ (`store`, Beta) – Vertrag Hülle ↔ 3D-Bundle

Design-ID `store`, Name „VIDEOTHEK LENZ“. Eine begehbare 3D-Videothek (three.js), späte 90er/frühe 2000er,
stilisiert-warm (Low-Poly, warmes Licht, Neon, blauer Teppich). Alle Modelle/Texturen prozedural im Code,
keine fremden Assets, keine fremden Marken.

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
  sound: true,              // Standard an (ab v1.7.4; Hülle: localStorage lfx.store.soundOn.<uid>, alter Schlüssel lfx.store.sound.<uid> wird ignoriert und entfernt)
  showFps: false,           // FPS-Kachel oben rechts (Pause-Menü „FPS-Anzeige“), Standard aus
  bigCovers: true,          // große Hüllen (Standard); false = „Normal“. Wechsel im Pause-Menü baut die Szene neu auf
  skipIntro: false,         // true = Intro (Rollladen) in dieser Sitzung schon gesehen
  restore: null | State,    // letzte Position (sessionStorage) → genau dort starten
  openItemId: null | string,// Route #/home?lfx=title&id=… → mit dieser Hülle in der Hand starten
  openTerminal: false,      // Route #/home?lfx=search → direkt am Kassen-PC (opts.query = Vorbelegung)
  query: '',
  phone: false,             // innerWidth < 800 oder Touch-Gerät ohne feinen Zeiger
  touch: false,             // (pointer:coarse) → Touch-Steuerung statt Pointer-Lock
  touchControl: 'joystick', // nur Touch: 'joystick' (Gehen-Knopf + Joystick) | 'touch' (Halten = laufen); Pref lfx.store.touchControl.<uid>
  vr: { turn: 'snap' | 'smooth', vignette: true, height: 'auto' | 'seated', quality: 'mid' | 'low', seat: 'front' | 'mid' | 'back' }, // VR-Vorlieben (ab v1.8.0), siehe „VR-Modus (Beta)“
  debug: false,             // window.__lfxStoreDebug === true
}
```

### `State` (JSON, von der Hülle in sessionStorage gespiegelt)
```js
{ x, z, yaw, pitch, heldId: null | string }
```

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
}
```

### `instance`
```js
{
  suspend(),          // Schleife aus, Listener ab, Pointer-Lock frei, Audio stumm; Kontext + Texturen bleiben
  resume(host?),      // optional neuer host (Canvas wird umgehängt); Schleife an
  dispose(),          // alles freigeben: Geometrien, Materialien, Texturen, renderer.dispose(), forceContextLoss(), DOM in host leeren
  openItem(id),       // Hülle in die Hand (aus Regal oder „über den Tresen“)
  openTerminal(query),
  getState() → State,
  setQuality(q), setSound(bool),
  isXr() → bool,      // VR-Sitzung präsentiert (die Hülle prüft damit, ob ihre onXr-Meldung noch stimmt)
  leaveCinema(reason),// 'home' | 'stop' | 'fail' | 'sessionend'; idempotent; Schwarzblende, zurück in die Videothek an die gespeicherte Pose
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
- Holdview: Mesh in Hüllengröße der Spezifikation (Regal → Hand ohne Sprung), Hand-Zielgröße wird durch `COVER.h / spec.cover.h` unabhängig von der Hüllengröße gehalten.
- Schärfestufe (`CoverManager`): für die nächsten Regalseiten im Blickfeld (Betrachter vor dem Regal, ≤ 6,5 m, Blickwinkel; bei `zoom > 1,3` ≤ 11 m und nur nahe der Blickachse, `update(x, z, yaw, { zoom, pitch })`) zusätzlich ein Atlas 2048² mit Bildern `maxWidth: 400` (`HI_SIZE`, `HI_WIDTH`). Nicht bei Qualität `low`, nur mit `renderer.capabilities.maxTextureSize >= 2048`. Höchstens 8 Seiten (Handy 4), zusätzlich höchstens die Hälfte des Atlas-Budgets (`preset.maxAtlases`; 2048² = `HI_COST` = 4 Einheiten, wird vom Grund-Budget abgezogen). Hochstufen erst bei fertigem Grund-Atlas; Herabstufen tauscht zuerst auf den Grund-Atlas zurück, dann `dispose()` der großen Textur; laufende Loads werden abgebrochen. Ein Atlas-Upload je `tick()`, Hi-Jobs nach den Grund-Atlanten.
- Ruckler-Bremse (ab v1.7.7, live gemessen: beim Laufen 92 → 0–1 Ausreißer > 25 ms in 20 s): Schärfestufe (2048²) nur bei Ruhe (< 0,5 m/s, Drehung < 0,8 rad/s) oder Zoom > 1,3, Seite ≥ 400 ms gewählt, 3 s Haltezeit je Seite, Herabstufen erst > 9 m oder > 2 s hinter dem Spieler, Hi-Platz per LRU (≥ 3 s ungewollt); höchstens 4 Hi-Seiten (Handy 2), Hi-Uploads ≥ 600 ms auseinander und nur bei ruhigen Frame-Zeiten/Drehung < 1,5 rad/s. Full-Atlanten: Score (Strafen Regal/Rücken) nur für die Lade-Reihenfolge, Eviction nach Distanz mit 3 m Vorsprung, frisch geladene Seiten 5 s geschützt. Höchstens ein Atlas-Upload alle 2 Frames. Konstanten oben in `covers/manager.js`; Debug-Zähler in `stats()`: `coverUploads, hiUp, hiDown, fullLoads, fullEvicts`. Beim Stehenbleiben kostet jeder 2048er-Upload weiterhin ~1 Frame (≤ 4 einzelne Ausreißer).
- Stimmenauswahl (ab v1.7.7): Pause-Knopf „Stimme: <Kurzname|Automatisch>“ öffnet `.lfx-store-voicepick` (Automatisch Gerät / Automatisch Online bevorzugt / alle deutschen Stimmen, männliche zuerst, Online markiert; Klick wählt und spricht synchron eine Probe), „Tonlage: Tief/Sehr tief/Normal“ (`PITCH_FACTOR` 0,8/0,65/1,0, Standard Tief). Prefs `voiceName`, `voicePitch`; `pickVoice(voices, { online, name })`, `listVoices()`, `createVoice({ prefer })`; Provider `cashier.voices()`, `preview()`; Hook `onVoicePrefs`.
- Vorladen (`covers/preload.js`, ab v1.7.5): Im Ladebildschirm holt `CoverPreloader` je Titel ein Mini-Bild (`coverUrl` wie die `full`-Stufe inkl. `tag`, `maxWidth 64`, `quality 60`, über `loadBitmap` → Browser-Cache), Concurrency 12 (Handy 6), nahe Regalseiten zuerst; Fehler/kein Bild zählen als erledigt. Phase „Cover werden vorgeladen“ (`progress 0.92…0.99`), höchstens 20 s, danach lädt der Rest im Hintergrund. Gemessen: 831 Titel beim allerersten Besuch ~53 s (Server rechnet die Größe erst), danach ~0,5 s.
- Stufen je Regalseite: `flat` → (`ph`, nur vor dem Vorladen) → `low` → `full` → `hi`. `low` = eigener Atlas pro Seite im selben UV-Raster, 256² (Handy, Qualität `low` oder > 160 Seiten: 128²), eigenes Budget außerhalb `maxAtlases`; `buildLowAll` im Ladebildschirm (4 je Frame), Nachzügler höchstens 1 Seite je `tick()` nach `full`/`ph`. Evict von `full`/`hi` fällt auf `low` zurück, `evictAll` (Qualitätswechsel) behält `low`. Debug: `stats()` liefert `coversLow/Full/Hi` und `preload { done, total, ms }`.

## Lebenszyklus (Ausnahme vom Unmount-Vertrag)

- Hülle `unmount()` (z. B. Route wechselt in den Player) → `instance.suspend()`, Canvas raus aus dem DOM, Instanz bleibt
  im Modul der Hülle. Erneutes `mount()` innerhalb von 3 min → `resume(newHost)`; sonst `dispose()` nach Ablauf.
- Design-Wechsel weg von `store`, `window.LenzFlix.destroy()` → sofort `dispose()`.
- `webglcontextlost` → Pause-Hinweis; `webglcontextrestored` → Szene neu aufbauen (aus `getState()`).
- `visibilitychange` (hidden) → Schleife pausiert.

## Eingabe

- Desktop (`!opts.touch`): Klick auf Canvas → Pointer-Lock. WASD/Pfeile laufen, Maus schaut, Shift rennt,
  E/Linksklick nimmt die anvisierte Hülle (Fadenkreuz), Esc/Lock-Verlust → Pause-Menü. Tasten nur während
  der Szene aktiv ist, im Capture-Listener mit `stopPropagation()` (Jellyfins globale Tastenkürzel dürfen nichts sehen),
  nie in `input`/`textarea`. Kein Kopfwippen, weiche Beschleunigung.
  Zoom: rechte Maustaste oder `Q` gehalten → `onZoom(2.6)`, loslassen → `onZoom(1)`; Maus-Empfindlichkeit wird durch den Zoom geteilt;
  Rechtsklick öffnet kein Kontextmenü. `StoreApp.setZoom(z)` (1..3) glättet (~0.12 s) und setzt `engine.setZoom` (FOV = Basis-FOV / Zoom); in Terminal/Intro/Couch/Pause wird auf 1 zurückgesetzt.
  Pointer-Lock: Chrome lehnt `requestPointerLock()` ~1 s nach Esc ab → `requestLock()` wartet bis `unlockAt + 1150 ms`, bei Fehler kurz nach Esc genau ein verzögerter Retry. Esc im offenen Pause-Menü = „Weiter“ (Entprellung 300 ms nach dem Lock-Verlust, greift auch mit Fokus auf einem Knopf). Esc ist keine Nutzeraktivierung: scheitert der Lock (Fehler oder 400 ms Stille), bleibt der Modus `play`, der HUD zeigt „Klicken zum Weiterspielen“ und `relockArmed` lockt beim nächsten Klick **oder** der nächsten Nicht-Esc-Taste synchron im Handler. `dragLook` (Zieh-Modus) nur ohne `requestPointerLock` oder wenn der allererste Klick-Versuch der Sitzung scheitert.
- Touch-Schemata (ab v1.7.8, `TouchControls({ scheme })`, `setScheme()`, Esc-Menü „Steuerung: Joystick/Touch“ nur auf Touch,
  Standard `joystick`, `deps.onPrefs` mit `touchControl`):
  - Menü „Touch-Steuerung …“ (Pause-Menü, nur Touch; Panel `.lfx-store-touchpick` mit den Klassen des Stimmen-Panels) mit: Steuerung Joystick/Touch, „Cover kippen“ (`holdInvertY`), „Cover drehen“ (`holdInvertX`), „Umschauen hoch/runter“ (`lookInvertY`), „Umschauen links/rechts“ (`lookInvertX`) je Normal/Umgekehrt, „Empfindlichkeit“ (`touchSens` low/normal/high = Faktor 0,7/1/1,4 auf Umschauen und Cover-Drehung). Prefs `lfx.store.<name>.<uid>`, `opts.touchTune`, Laufzeit-Setter `StoreApp.setTouchTune(teil)`, `deps.onPrefs` trägt alle Felder. **Standard = bisheriges Verhalten** (nichts umgekehrt, normal): „Umgekehrt“ ist ein reiner Vorzeichenwechsel relativ dazu. `lookInvert*` wirkt auf Wischen und Joystick (`TouchControls` `ctx.getTune`), `holdInvert*`/Empfindlichkeit auf das Ziehen-Overlay der gehaltenen Hülle nur bei `pointerType === 'touch'` (Maus, VR unberührt).
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
  vor Ablauf → nur Umsehen („Szene greifen“). Kurzes Tippen → `onTap`: Hülle/Objekt in Reichweite (≤ 3 m) nehmen/benutzen,
  weiter weg nur Hinweis (kein Auto-Pfad mehr; `walkTo`/`approach*` bleiben für Module/Terminal). Zwei Finger = Pinch-Zoom
  1..3 (`onZoom`), danach weder Laufen noch Umsehen/Tippen bis alle Finger oben sind; Zoom fällt beim nächsten Loslaufen auf 1.
  Canvas `touch-action:none`, `overscroll-behavior:none`. Hoch- und Querformat.

## Debug (`opts.debug`)

`instance.debug` und `window.__lfxStore`:
`teleport(x, z, yaw)`, `lookAt(itemId)`, `take(itemId)`, `put()`, `stats()` → `{ fps, frameMs, calls, triangles, textures, geometries, coverSegmentsLoaded, quality }`, `state()`, `zones()` → Liste benannter Orte mit Koordinaten (Eingang, Kasse, jede Abteilung …).

## Module (store3d intern)

Erweiterungen des 3D-Bundles (Kasse, Intro, Snack-Theke …) hängen sich als eigene Dateien in `src/js/store3d/modules/` ein; `store.js` bleibt unberührt.
Registry: `modules/index.js` (`export const MODULES = [...]`, Reihenfolge = Init-Reihenfolge, eine Zeile je Modul). Laufzeit: `modules/runtime.js`.

```js
export default { name: 'beispiel', init(ctx) { …; return { update(dt, t) {}, onSuspend() {}, onResume() {}, onQuality(level) {}, onSound(on) {}, dispose() {} }; } };
```
`init` darf ein Promise liefern (Boot wartet, Fortschritt 86–91 %). Fehler werden per `console.warn` geloggt und beenden die Szene nicht. Alle Handle-Methoden optional. Module importieren `three` selbst.

`ctx`:
- `scene, camera, renderer, layout, catalog, deps, opts, isPhone, isTouch`, `quality()` → `'low'|'mid'|'high'`, `soundOn()`.
- `layout.zones[id] = { id, label, x, z, yaw, rect:{x0,z0,x1,z1}, reserved? }`: `entrance, register (+counter), cashier, reserve, returns, snack, tv, staff, window, window2, kids, adult, dept:<id>`. Reservierte Zonen sind frei von Regalen; Kollider legen die Module an.
- `addCollider(rect)` / `removeCollider(rect)`: `rect = {x0,z0,x1,z1,kind?}`; wirkt auf Spielerkollision und A*-Raster (wird im nächsten Frame neu berechnet).
- `addInteractable({ box, label, hint, onUse, enabled? })` → `remove()`; `box` = `THREE.Box3` oder `{min,max}` in Weltkoordinaten. Wie eine Hülle: Fadenkreuz-Hint (`label`/`hint`), E/Klick (Reichweite 2,5 m), Touch-Tippen läuft hin und ruft `onUse()`.
- `player.getPose()`, `teleport(x,z,yaw,pitch?)`, `walkTo(x,z,{face})` → `Promise<bool>` (`face` = yaw oder `{x,z}`), `lookAt(x,y,z,ms)` → `Promise`, `freeze(bool)`, `player.camera.flyTo(pos,target,ms)` → `Promise<bool>`, `player.camera.release()`.
- `overlay.open(el, {onClose})` (hängt in host, gibt Pointer-Lock frei, Esc schließt, sperrt Spielereingabe), `overlay.close()`, `overlay.isOpen()`.
- `items.take(id, {from:'shelf'|'counter'})`, `items.slotOf(id)` → `{x,y,z,dept,face,run,stand}|null`, `items.highlight(id,on)`. (`setBadge` ist nicht umgesetzt.)
- `on(event, fn)` → `off()`; Events `'enter'`, `'take'(id)`, `'put'(id)`, `'play'(item,{resume})`, `'zone'(zoneId)`, `'frame'(dt,t)`.
- `loadTexture(url,{maxWidth})` → `Promise<Texture|null>` (Queue ≤ 4, automatisch freigegeben), `track(obj)` → `obj` (dispose bei `dispose()`).
- `xr` (VR, siehe „VR-Modus (Beta)“): `presenting()`, `panel.open(spec)`, `toast(text, ms)`, `bubble()`, `exitThen(label, fn)`, `jumpTo(x, z, { face })`; Event `ctx.on('xr', (on) => …)`.
- `provide(name, impl)` → `remove()`, `use(name)`. Provider `terminal { open(q) }` (sonst Toast bei `instance.openTerminal`), `intro { run() → Promise }` (Boot ruft ihn nach dem ersten Bild, wenn `!opts.skipIntro`; danach Event `'enter'`).

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
- Anlässe: Begrüßung (+ `intro` einmal pro Sitzung, `sessionStorage lfx.store.richardIntro`; bei Regen teils `rain`), `take`, `put`, `zone register`, langes Herumstehen, `adultLong` (> 30 s im Ab-18-Raum, einmal pro Aufenthalt), `kidsEnter` (höchstens alle 2 min), Couch hinsetzen/aufstehen.

### Vollbild und Safari-Leiste (`ui/fullscreen.js`)

- Pause-Menü „Vollbild“ nur auf Touch-Geräten (Callbacks `onFullscreen()`, `getFullscreen()`, `fullscreenKind()` → `'api'|'guide'|'none'`; bei `none` ausgeblendet). `api` (Android, iPad): Fullscreen-API am `documentElement`. `guide` (iPhone-Safari, nicht standalone): Panel `.lfx-store-fs-guide` mit Anleitung „Zum Home-Bildschirm → Als Web-App öffnen“. Standalone/Desktop: kein Knopf (Desktop: F11; Esc würde Vollbild und Pointer-Lock zugleich beenden).
- Wisch-Trick (experimentell, nur iPhone-Safari, nicht standalone, Querformat, Modus `play` ohne Modul-Sperre, Leiste sichtbar = `innerHeight < min(screen.w, screen.h) − 24`): `html.lfx-store-swipe` hebt `overflow:hidden` auf, `div.lfx-store-swipe-spacer` am `body` macht die Seite scrollbar, Overlay `.lfx-store-swipe-hint` am `body` („Nach oben wischen für Vollbild“). Erfolg = Leiste weg oder `scrollY > 0` → Overlay weg, Klasse/Spacer bleiben. Wiederanzeige höchstens 2× pro Sitzung (`sessionStorage lfx.store.swipeShown`), „×“ = für die Sitzung aus. Hochformat/suspend/dispose räumen alles ab (`scrollTo(0,0)`). Einmaliger Home-Bildschirm-Tipp per `hud.note` (`localStorage lfx.store.fsTip.<user>`).

### Provider und Module (Stand M2–M4)

| Provider | Form | Modul | Zweck |
|---|---|---|---|
| `terminal` | `{ open(q) }` | `modules/terminal.js` | Kassen-PC (Overlay mit Suche, Hinführen, „Über den Tresen“); `instance.openTerminal(q)` delegiert hierher, sonst Toast. Ergebnisse werden clientseitig mit `modules/search-rank.js` gerankt (exakt > beginnt mit > Wortanfang > enthält > Rest; Rest entfällt ab 5 Titeltreffern). |
| `intro` | `{ run() → Promise }` | `modules/intro.js` | Rollladen-Intro von draußen; öffnet die echten Türflügel `lfx-door-left`/`lfx-door-right`. Läuft nur ohne `opts.skipIntro`/`restore`/`openItemId`/`openTerminal`. |
| `sound` | `{ play(name, opts), ambient(on), duck(key, on) }` | `modules/sound.js` | Web-Audio (synthetisch); folgt `onSound(on)` und `ctx.soundOn()`. Startwert `opts.sound` (Standard an); der Pause-Menü-Schalter ruft `setSound` → Module `onSound` + `deps.onPrefs`. `duck`: Set aktiver Schlüssel, stärkste Dämpfung gilt (`'tv'` ×0,12, `'talk'` ×0,45); `duck(bool)` = `duck('tv', bool)`. Lautlos-Schalter am iPhone wird respektiert (kein `navigator.audioSession`). |
| `cashier` | `{ event('couchSit'\|'couchStand'), voiceInfo() }` | `modules/cashier.js` | Kassierer Richard: erzwungene Zeile als Blase (auch über offenem Overlay). |
| `couch` | `{ seated() }` | `modules/tv.js` | Solange man sitzt, spricht Richard nicht von sich aus. |
| `weather` | `{ tod: 'day'\|'dusk'\|'night', raining, hour? }` | `modules/daytime.js` | Tageszeit/Regen für Kulisse und Stimmung; andere Module lesen sie (`ctx.use('weather')`). |
| `ctx.xr` (kein Provider) | `{ presenting(), panel.open(spec), toast, bubble(), exitThen, jumpTo }` + Event `'xr'` | `modules/runtime.js` → `xr/mode.js` | VR-Zugang der Module. Dazu ab v1.8.0: `instance.isXr()`/`leaveCinema(reason)`, `deps.onXr`/`deps.cinema`, `opts.vr`. Fehlt `app.xr` (Test-`fakeApp`), liefert `presenting()` false. |

Benannte Szenenobjekte (Module greifen per `scene.getObjectByName`): `lfx-door` (Gruppe), `lfx-door-left`, `lfx-door-right` (Pivot am Scharnier, Rotation um y; Kinder `lfx-door-frame`, `lfx-door-glass`), `lfx-backdrop` und `lfx-street` (alte Nachtkulisse, wird von `modules/outdoor.js` ausgeblendet). Der Kassen-PC steht in `layout.pc` (`build-props.js` und `terminal.js` lesen dieselbe Position).

Zonen: `layout.zones[id]` hat Objektposition `x, z, yaw` und optional `view = { x, z, yaw }` (Blickpunkt, von dem man auf das Objekt schaut, nie hinter dem Tresen). `__lfxStore.zones()` liefert `x/z/yaw` = Blickpunkt und `obj` = Objektposition.

Debug (nur bei `opts.debug`, nie im Produktivbetrieb):
- `window.__lfxStore` (`teleport, lookAt, take, put, stats, state, zones`; `stats()` zusätzlich `programs, tickMs, renderMs`; `stats().xr` = `{ supported, presenting, inCinema, phase, videoFrames, visibility, … }`, `__lfxStore.xr` = der `XrMode`, siehe „VR-Modus (Beta)“).
- `window.__lfxStore.m3.<modul>` (terminal, returns, reserve, staff, showcase) – wird beim Event `'enter'` gesetzt (`modules/m3-debug.js`).
- `window.__lfxM4` (`scene, outdoor, ctx, say, tip, voice(), sound(), intro()`) – von `daytime`, `cashier`, `sound`, `intro` gesetzt. Dev-Harness-Parameter: `?hour=23&rain=0|1&intro=1&sound=0`.

## VR-Modus (Beta)

WebXR (`immersive-vr`) für die Videothek samt VR-Kino, ab v1.8.0. Code: `src/js/store3d/xr/*` (Sitzung, Eingabe, Panels), `src/js/store3d/cinema/*` (Kinosaal), `src/js/features/store/cinema-bridge.js` und `stage-park.js` (Hülle). Das 3D-Bundle fasst nie Jellyfin-DOM an: Der Player kommt über `deps.cinema`. Ohne aktive Sitzung bleibt 2D (Desktop, Touch, Handy) bitgleich; einzige Ausnahme ist der VR-Knopf. Keine Marken-/Gerätenamen (Texte: „VR-Brille“, „Controller“, „Hände“), kein UA-Sniffing, keine Controller-/Hand-Modellfabriken von three (laden vom CDN). Echte Geräte-Tests stehen noch aus (bisher nur WebXR-Emulator).

### Einstieg
- `probeXr()` (`xr/session.js`) fragt `navigator.xr.isSessionSupported('immersive-vr')` einmal ab und cached das Ergebnis; Fehler zählen als „nein“. `app.xr.supported` steuert die Knöpfe.
- Einstiege (nur wenn `supported && !presenting`): HUD-Knopf „In VR betreten“ (`.lfx-store-vrbtn`, im Lauf- und Haltemodus; eine gehaltene Hülle wandert beim Betreten in die Hand) und Pause-Eintrag „VR-Modus“.
- `XrMode.enter()` ruft `navigator.xr.requestSession` **synchron im Klick** auf (Nutzeraktivierung), `optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']`; fehlt `local-floor`, fällt die Sitzung auf `local` zurück (Rig rechnet dann mit der Standard-Augenhöhe). Davor werden die Controller-Objekte angelegt (`prepareSources`, sonst ignoriert three neue Eingabequellen) und Ton/Stimme per Geste freigeschaltet (`sound.unlock`, `cashier.unlockVoice`).
- `renderer.xr.enabled` ist **nur während der Sitzung** an. Sitzungsende räumt alles ab (Rig = Identität, Budget/Qualität zurück, Desktop-/Touch-Eingabe wieder an).
- Beim Start: Overlay/Pause/Intro zu, Zoom 1, gehaltene Hülle an die Hand, `deps.onXr({ presenting: true, cinema: false })`, `ctx.on('xr', true)`.

### Rig-Regel
- Der Spieler ist der Kopf: in XR gilt `player.x/z` = Kopfposition auf dem Boden, `player.yaw` = Kopf-Yaw. Das **Rig** (`engine.rig`, Elternteil von Kamera und Controllern) wird pro Frame aus der Kopfpose zurückgerechnet (`xr/rig.js`: `headLocal`, `placeRig`, `turnAboutHead`, `seatedOffset`). Außerhalb von XR ist das Rig die Identität und die Kamera bekommt Weltkoordinaten wie zuvor.
- Gehen ruft `player.update` wie in 2D (gleiche Kollision), Drehen dreht um den Kopf. Die Höhe kommt von der Brille (`vrHeight: 'auto'`); `'seated'` bzw. „Neu ausrichten“ kalibriert die Sitzhöhe.
- `engine.scene` (Getter) ist die aktive Szene (`storeScene` oder Kinoszene), dazu `engine.setScene(s)`, `render(active, cam)`. Die 2D-Zielhilfe (`updateAim`) läuft in XR nicht; die Ziel-Hervorhebung macht der Laser.

### Eingabe (Belegung der Controller, `xr/input.js`, `locomotion.js`, `pointer.js`)
- Linker Stick: gleiten in Kopfrichtung; Stick-Klick links: rennen (bis der Stick wieder mittig ist). Totzone 0,15.
- Rechter Stick: Ruck-Drehung 45° (Auslösen > 0,7, Wieder-Scharfschalten unter 0,3) oder weich 90°/s (`vrTurn`).
- Trigger: Laser-Auswahl (Hülle nehmen, Interactable benutzen, Panel-Treffer; im Kino ins Leere = Bedienpanel umschalten). Liegt der Laser auf einem Panel mit Liste, scrollt der Stick (Y).
- Grip nahe einer Hülle (≤ 0,4 m): greifen (`take(id, { hand, grab: true })`).
- B/Y: oberste Ebene schließen (Panel mit `onClose`), sonst VR-Menü.
- Hände (`inputSource.hand`): Pinch löst `select` aus, kein Stick; Handgelenk-Knopf (Handfläche zum Gesicht, Kind des Rigs, `hands.js`) öffnet das VR-Menü. Controller und Hände werden prozedural gezeichnet.
- Komfort: Vignette beim Gleiten/Drehen (`vrVignette`), Schwarzblende bei Sprüngen (`xr/fade.js`).

### VR-Menü (`xr/menu.js`, Panel „VR-Menü“)
Einträge: Ton, Drehen (Ruck 45° / Weich), Vignette, Größe (Automatisch / Sitzend), Neu ausrichten, Qualität (Mittel / Niedrig), Kassen-PC-Suche, Diagnose; solange das Kino läuft zusätzlich `cinema.menuItems()` (Zurück in die Videothek, Platz, Kino-Bedienung zeigen). Knöpfe: „Weiter“, „VR verlassen“. Änderungen schreiben `app.opts.vr` und gehen über `mode.savePrefs()` → `deps.onPrefs`.

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
`Cinema` (`cinema.js`) hängt an `app.xr.cinema`: `enter(item)`, `leave(reason)`, `tick`, `onSelectEmpty`, `menuItems`, `onVisibility`, `dispose`. Eigene Szene (`hall.js`: prozeduraler Saal, Vorhang, Saallicht, drei Plätze); das Rig wechselt in die Kinoszene, `mode.beforeTick` macht dann nur noch Blende, Laser und Menü (kein Kopf→Spieler-Mapping, keine Fortbewegung). Beim Betreten `holdview.close(false)`, Module bekommen `onSuspend` (beim Verlassen `onResume`), `sound.duck('cinema', …)`.
- **Phasen:** `entering` (Schwarzblende, Saal bauen) → `starting` → `playing` ⇄ `paused`; Fehler: `failed` → `leaving`. `deps.onXr({ cinema: true })` geht unmittelbar vor dem echten `deps.play()` raus (`beforePlay`).
- **Start-Logik:** `starting` gilt als geglückt, wenn `video.readyState ≥ 2`, ≥ 3 Videobilder als Textur hochgeladen und die Zeit sich bewegt (oder der Player pausiert ist).
  - **Pausierter Start:** Blockt der Browser das Autoplay (Jellyfin fängt `NotAllowedError` still ab), bleibt das Video pausiert mit Bild (nur ein Upload). Ist `readyState ≥ 2`, `screen.hasFrame` und der Player ≥ 1,5 s stabil pausiert, gilt das als Start in `paused`: Vorhang auf, Bedienpanel, Hinweis „Zum Starten „Weiter“ drücken“ (der Panel-Klick ist die Nutzergeste → `togglePause` → `.btnPause`). Kein Fehlschlag.
  - **Watchdog in Stufen:** Dauert es > 3 s, geht der Vorhang auf (Statusbild „Film wird gestartet …“); nach 8 s steht dort „Der Server bereitet den Film vor …“. Nie ein `<video>` erreicht → nach 25 s Abbruch `T1`. Video da, aber ohne Fortschritt (readyState steigt, `buffered`-Ende wächst oder `currentTime` ändert sich) 15 s lang → `T2`; mit Fortschritt höchstens 60 s (dann ebenfalls `T2`). Fehlerdialog (`phase 'error'` ohne `reloading`) → sofort `D`.
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
- **Spurwahl:** Panel „Tonspur“/„Untertitel“ mit Liste (`tracks(kind)` → `selectTrack(kind, id)`). Ein Tonspurwechsel dauert im Player einige Sekunden (`reloading`: `readyState 0` nach vorherigem Bild, kein Fehler, kein Watchdog) und setzt die Untertitel zurück; die Bridge setzt die vorher gewählte Untertitelspur danach erneut. Das Panel zeigt währenddessen „Wechsel läuft …“.

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
| 3 | unmount | `presenting && !cinema` | suspend wie Zeile 1 | `suspend()` beendet die Sitzung zuerst |
| 4 | `onXr({ presenting: false })` | geparkt | `instance.suspend()`, Park-Container entfernen, 3-min-Timer, `cinema.activate(false)` | Kino still verlassen; der 2D-Player spielt weiter |
| 5 | `onXr({ presenting: false })` | auf `#/home`, nicht geparkt | nichts | Modus `play`, Rig = Identität, resize/FOV |
| 6 | mount/`start()` | geparkt && `presenting` | `buildUi()`, neues `ui.stage` durch die geparkte Bühne ersetzen, Laden entfernen, `is-ready`, **kein resume**; `instance.leaveCinema('home')`, `cinema.activate(false)`, `applyRoute` | zurück an die alte Pose |
| 7 | Route verlässt `#/video`, aber nicht nach `#/home` | geparkt && `presenting` | Bridge setzt `location.hash = '#/home'` | – |
| 8 | Design-Wechsel/`destroyStore` | – | dispose wie bisher | `dispose()` beendet die Sitzung vor `renderer.dispose()` |
| 9 | `document.hidden` | `presenting` | – | **kein** `halt()` der Schleife |
| 10 | XRSession `visibilitychange` (`hidden`/`visible-blurred`) | – | – | Eingabe pausiert, Kino-Panel zu |
| 11 | `sessionstart` | – | – | Overlay/Pause/Intro zu, gehaltene Hülle an die Hand, Desktop/Touch abhängen |

Die Hülle setzt `deps.onXr` und `deps.cinema` vor `create()`. `deps.cinema` ist eine lazy erzeugte Bridge (`createCinemaBridge()`), die erst mit `activate(true)` pollt.

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
- Qualität in VR fest `low` oder `mid` (`vrQuality`, Standard `mid`): `app.setQuality` erzwingt in der Sitzung nur diese beiden; die gewählte 2D-Qualität wird beim Sitzungsende wiederhergestellt.
- Budgets wie am Handy (`engine.setXrBudget(true)`: kleinere Cover-Atlanten, **keine** Schatten). Keine Hi-Stufe (2048er-Atlanten), keine AutoQuality-Anpassung, kein FOV-Zoom (Zoom bleibt 1).
- Foveation (`engine.setFoveation`): in der Videothek 1, im Kino 0 (volle Schärfe für die Leinwand); beim Verlassen des Kinos wieder 1.
- Gemessen im Emulator (Draw-Calls, stereo): Videothek in VR ~186, Kino ~26–30. Auf echter Hardware nicht gemessen.

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
