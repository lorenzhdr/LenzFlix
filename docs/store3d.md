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
  touch: false,             // (pointer:coarse) → Tippen-zum-Gehen statt Pointer-Lock
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
  onPrefs({ quality, sound, fps, bigCovers }),  // volles Objekt; Hülle speichert pro Benutzer (localStorage, bigCovers Standard true)
  onBigCovers(on),                             // Pause-Menü „Hüllen: Groß/Normal“: Hülle speichert die Pref, disposed die Instanz und erstellt sie neu (Ladebildschirm, skipIntro, restore = aktuelle Position/gehaltene Hülle)
  onFatal(error),                              // z. B. kein WebGL → Hülle zeigt Fallback mit „Zu LENZFLIX wechseln“
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
  Pointer-Lock: Chrome lehnt `requestPointerLock()` ~1 s nach Esc ab → `requestLock()` wartet bis `unlockAt + 1150 ms`, bei Fehler kurz nach Esc genau ein verzögerter Retry (kein Zieh-Fallback); bleibt er erfolglos, zeigt der HUD-Hinweis „Klicken …“, ein Canvas-Klick lockt.
- Touch (`controls/touch.js`): Finger gedrückt halten (> 220 ms, < 9 px Bewegung) → vorwärts in Blickrichtung laufen
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
- `voice.js` (Hilfsdatei, kein Registry-Modul): `pickVoice(voices)` → `{ voice, pitch } | null` – **nur `localService === true`** (Online-Stimmen würden Profilname/Titel an Dritte senden), nur `de*`; männliche Namen zuerst (Markus, Martin, Stefan, Conrad, …, pitch 1,0), Novelty-Stimmen zuletzt, sonst irgendeine lokale deutsche mit pitch 0,8; keine → nur Blase. `createVoice({ soundOn, synth, Utterance })` → `{ say(text, { volume }) → Promise, cancel(), speaking, voiceName, unlock(), dispose() }`: `say` bricht ab und spricht einen Tick später (Chrome), hält die Utterance referenziert, Sicherheitstimeout `len×90+1500 ms`; `unlock()` spricht bei der ersten Geste (pointerdown/keydown/touchend/click, nur wenn Ton an) einmal leer mit volume 0 (iOS). Texte werden nie geloggt.
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
| `cashier` | `{ event('couchSit'\|'couchStand') }` | `modules/cashier.js` | Kassierer Richard: erzwungene Zeile als Blase (auch über offenem Overlay). |
| `couch` | `{ seated() }` | `modules/tv.js` | Solange man sitzt, spricht Richard nicht von sich aus. |
| `weather` | `{ tod: 'day'\|'dusk'\|'night', raining, hour? }` | `modules/daytime.js` | Tageszeit/Regen für Kulisse und Stimmung; andere Module lesen sie (`ctx.use('weather')`). |

Benannte Szenenobjekte (Module greifen per `scene.getObjectByName`): `lfx-door` (Gruppe), `lfx-door-left`, `lfx-door-right` (Pivot am Scharnier, Rotation um y; Kinder `lfx-door-frame`, `lfx-door-glass`), `lfx-backdrop` und `lfx-street` (alte Nachtkulisse, wird von `modules/outdoor.js` ausgeblendet). Der Kassen-PC steht in `layout.pc` (`build-props.js` und `terminal.js` lesen dieselbe Position).

Zonen: `layout.zones[id]` hat Objektposition `x, z, yaw` und optional `view = { x, z, yaw }` (Blickpunkt, von dem man auf das Objekt schaut, nie hinter dem Tresen). `__lfxStore.zones()` liefert `x/z/yaw` = Blickpunkt und `obj` = Objektposition.

Debug (nur bei `opts.debug`, nie im Produktivbetrieb):
- `window.__lfxStore` (`teleport, lookAt, take, put, stats, state, zones`; `stats()` zusätzlich `programs, tickMs, renderMs`).
- `window.__lfxStore.m3.<modul>` (terminal, returns, reserve, staff, showcase) – wird beim Event `'enter'` gesetzt (`modules/m3-debug.js`).
- `window.__lfxM4` (`scene, outdoor, ctx, say, tip, voice(), sound(), intro()`) – von `daytime`, `cashier`, `sound`, `intro` gesetzt. Dev-Harness-Parameter: `?hour=23&rain=0|1&intro=1&sound=0`.
