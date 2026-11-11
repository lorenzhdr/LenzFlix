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
  sound: false,             // Standard aus
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
  onPrefs({ quality, sound }),
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
- Touch: Tippen auf den Boden → A* zum Punkt; Tippen auf eine Hülle → hinlaufen und nehmen; Ziehen → Umsehen.
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

### Provider und Module (Stand M2–M4)

| Provider | Form | Modul | Zweck |
|---|---|---|---|
| `terminal` | `{ open(q) }` | `modules/terminal.js` | Kassen-PC (Overlay mit Suche, Hinführen, „Über den Tresen“); `instance.openTerminal(q)` delegiert hierher, sonst Toast. Ergebnisse werden clientseitig mit `modules/search-rank.js` gerankt (exakt > beginnt mit > Wortanfang > enthält > Rest; Rest entfällt ab 5 Titeltreffern). |
| `intro` | `{ run() → Promise }` | `modules/intro.js` | Rollladen-Intro von draußen; öffnet die echten Türflügel `lfx-door-left`/`lfx-door-right`. Läuft nur ohne `opts.skipIntro`/`restore`/`openItemId`/`openTerminal`. |
| `sound` | `{ play(name, opts), ambient(on) }` | `modules/sound.js` | Web-Audio (synthetisch); folgt `onSound(on)` und `ctx.soundOn()`. Startwert `opts.sound`; der Pause-Menü-Schalter ruft `setSound` → Module `onSound` + `deps.onPrefs`. |
| `weather` | `{ tod: 'day'\|'dusk'\|'night', raining, hour? }` | `modules/daytime.js` | Tageszeit/Regen für Kulisse und Stimmung; andere Module lesen sie (`ctx.use('weather')`). |

Benannte Szenenobjekte (Module greifen per `scene.getObjectByName`): `lfx-door` (Gruppe), `lfx-door-left`, `lfx-door-right` (Pivot am Scharnier, Rotation um y; Kinder `lfx-door-frame`, `lfx-door-glass`), `lfx-backdrop` und `lfx-street` (alte Nachtkulisse, wird von `modules/outdoor.js` ausgeblendet). Der Kassen-PC steht in `layout.pc` (`build-props.js` und `terminal.js` lesen dieselbe Position).

Zonen: `layout.zones[id]` hat Objektposition `x, z, yaw` und optional `view = { x, z, yaw }` (Blickpunkt, von dem man auf das Objekt schaut, nie hinter dem Tresen). `__lfxStore.zones()` liefert `x/z/yaw` = Blickpunkt und `obj` = Objektposition.

Debug (nur bei `opts.debug`, nie im Produktivbetrieb):
- `window.__lfxStore` (`teleport, lookAt, take, put, stats, state, zones`; `stats()` zusätzlich `programs, tickMs, renderMs`).
- `window.__lfxStore.m3.<modul>` (terminal, returns, reserve, staff, showcase) – wird beim Event `'enter'` gesetzt (`modules/m3-debug.js`).
- `window.__lfxM4` (`scene, outdoor, ctx, say, tip, sound(), intro()`) – von `daytime`, `cashier`, `sound`, `intro` gesetzt. Dev-Harness-Parameter: `?hour=23&rain=0|1&intro=1&sound=1`.
