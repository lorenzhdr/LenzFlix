# LenzFlix JS-Verträge (für alle Feature-Worker)

## Gemeinsamer Kontext
- Repo: `C:\Users\loren\Desktop\Clausi_Projects\NetflixTheme` (eigenes Git-Repo, **nicht** committen/pushen).
- Build `npm run build` → `dist/lenzflix.css` + `dist/lenzflix.js` (esbuild IIFE). Tests `npm test` (vitest + jsdom, `// @vitest-environment jsdom` pro Datei). Lint `npm run lint`.
- Pflichtlektüre: `docs/dom-map.md` (live verifiziert), `src/css/tokens.css` (nur `--lfx-*`-Tokens benutzen; neue Tokens lokal im eigenen CSS definieren und im Report vorschlagen), `src/js/core/*` (API, Cache, Router, Layout, Playback, DOM-Helper, Ambient) – **core nur lesen**, Änderungswünsche im Report melden.
- Jellyfin-Quellcode v12.4 (nur lesen/grep): `C:\Users\loren\AppData\Local\Temp\claude\8b9d54130c035d8c\55b2626a-940d-42b4-ae47-d8bbffea6d7e\scratchpad\jw\src\src\`
- Netflix-Vorlage (Kacheln in CSS-px bei 1206 px Viewport): `…\scratchpad\tiles\t0.png` … `t7.png`.
- Sprache der UI: Deutsch. Keine Netflix-Namen/-Logos/-Assets im Code (Marke heißt „LENZFLIX“, rotes Logo `assets/logo/lenzflix.svg`, Mini-Marke `assets/logo/lenzflix-l.svg`; in CSS `url("../assets/logo/…")` relativ zu dist/).
- Alle JS-UI-Styles nur unter `html.lfx-js`. Nicht auf TV (`html.lfx-tv` / `layout-tv`). Pointer-abhängige Effekte nur unter `(hover:hover) and (pointer:fine)`.
- `window.LenzFlix.destroy()` muss alles entfernen: jedes Feature räumt in `unmount()`/Cleanup Listener, Timer, Knoten auf.
- Keine Tokens/Credentials loggen. Bild-URLs ohne api_key (Jellyfin-Bilder sind ohne Auth abrufbar).
- Keine Netzwerkzugriffe in Tests (fetch/ApiClient mocken).

## Karten-Markup (von rows/top10/modal erzeugt, von hovercard/modal konsumiert)
```html
<div class="lfx-card" data-lfx-id="ITEM_ID" data-lfx-type="Movie|Series|Episode|Season|BoxSet" tabindex="-1">
  <a class="lfx-card__link" href="#/details?id=ITEM_ID&serverId=SERVER_ID" aria-label="Titel">
    <img class="lfx-card__img" src="…" alt="" loading="lazy" decoding="async">
    <!-- optional: <img class="lfx-card__logo"> oder <span class="lfx-card__title"> wenn Bild kein Thumb ist -->
  </a>
  <!-- optional: <span class="lfx-badge">Neu hinzugefügt</span> -->
  <!-- optional (Weiterschauen): <div class="lfx-progress"><div class="lfx-progress__bar" style="width:42%"></div></div> -->
</div>
```
- Item-Daten pro Karte: `itemStore` in `src/js/core/itemstore.js` (`putItems(items)`, `getStoredItem(id)`). Wer Karten rendert, legt die Items dort ab; Hovercard/Modal lesen zuerst dort und laden sonst per `api.getItem`.
- Klicks auf Karten fängt das **Modal-Feature** global (Capture-Phase) ab – Zeilen-Code macht nur den `href`-Fallback.

## Öffentliche Funktionen zwischen Features
- `openModal(itemOrId)` aus `src/js/features/modal.js` (Platzhalter navigiert zur Detailseite).
  - Option `{ overlay: true }`: öffnet die Karte auch unter plus/prime als Overlay (statt Weiterleitung auf `titleHref`); bleibt für alle Öffnungen innerhalb dieses Modals bestehen, ergänzt unter plus/prime den Fußlink „Zur Titelseite“. Nutzer: TV-Modus „Details“ (`docs/tvmode.md`). Am Handy (< 800 px) hält das Modal die Seite per `body{position:fixed}` fest und löst die Sperre in `teardown()` vor dem Entfernen des Overlays.
- `play(item, {resume})` aus `src/js/core/playback.js` (Proxy-Klick; funktioniert auch, wenn die nativen Home-Sektionen per CSS `display:none` sind – der Container muss nur im DOM sein).
- `setAmbient(r,g,b)` aus `src/js/core/ambient.js`.
- `setFavorite(id,bool)` aus `src/js/core/api.js`; Likes: `POST /Users/{userId}/Items/{id}/Rating?likes=true|false`, `DELETE …/Rating`.

- Titelmenü (`src/js/core/itemmenu.js`, natives Jellyfin-Menü per Proxy-Klick, siehe dom-map):
  - `openItemMenu(item, anchor, {siblings, onClose})` → `boolean`. `anchor` ist ein Element oder `{x, y}`. `siblings` nur für Episodenlisten (für „Alles ab hier abspielen“).
  - `isMenuOpen()` ist während der ganzen Sitzung true (inkl. Folgedialoge + 800 ms). `closeItemMenu()` räumt sofort auf.
  - `html.lfx-menu-open` + `--lfx-menu-x/-y` auf `<html>` gelten nur, solange das erste Sheet offen ist. Nur darunter blendet `itemmenu.css` die Einträge `download`, `downloadall`, `multiSelect` aus.
  - `onItemsChanged(fn)` → Abmeldefunktion; `fn({removed, updated})`. Quellen: eigene Menü-Sitzung (Nachladen nach änderndem Befehl) und `LibraryChanged`. Wer Titel anzeigt, abonniert und räumt entfernte Titel weg.
  - `startItemWatch()` / `stopItemWatch()` ruft nur das Feature `contextmenu` auf.
- Download (`src/js/core/download.js`): `canDownload(item)` (async, Policy + `CanDownload`), `startDownload(item, anchorEl)` (Serie/Staffel öffnet die Auswahl `#lfx-sheet`, sonst Direkt-Download), `isChooserOpen()`, `closeChooser()`. Download-Buttons starten mit `hidden`. URLs mit `api_key` nie loggen.
  - `downloadUrl(id)` baut die URL mit `ApiKey` (der native `api_key`-Link liefert 401, siehe dom-map „Download-Endpunkt“). `probeDownload(url, outerSignal?)` → `{ok:true}` | `{ok:false, status}` | `{ok:true, unknown:true}` (Netzwerkfehler/Timeout). `downloadItem`/`downloadMany` testen vor jedem Klick; `cancelDownloads` bricht auch den Vortest ab.
- Statistik-Link (`src/js/core/stats.js`): `getStatsUrl()` → `string | null`. Quelle 1 `window.LenzFlixConfig.statsUrl`, Quelle 2 CSS-Var `--lfx-stats-url` auf `:root`; erlaubt sind https-URLs und same-origin-Pfade mit genau einem führenden `/` (kein `//`, `javascript:`, `data:`, `http:`), kein Default. Nur wenn nicht `null`, erscheint „Meine Statistik“ als normaler `<a href>` (gleicher Tab, kein Hash-Link, **kein `data-key`**, nie aktiv) im „Mehr“-Dropdown (`nav.js`; das Menü erscheint dann auch ohne weitere Bibliotheken, Klasse `lfx-nav__menu-item--stats`) und als letzter Eintrag im Mehr-Overlay (`mobilenav.js`, `overlayItems()` liefert ihn mit `external: true`; nicht in den Pills, nicht in `navItems()`). Seite und Worker: `docs/stats-api.md`.
- Statistik-Hinweis (`src/js/features/statshint.js`, Feature `statshint`): kleiner Toast `#lfx-statshint` „Neu: Meine Statistik“ auf der Startseite. Nur Modern, nicht TV, nur mit `getStatsUrl()`. 7 s sichtbar (Hover pausiert, nur `(hover:hover) and (pointer:fine)`), einmal pro Browser-Sitzung (`sessionStorage lfx.statsHint.shown`), × schließt nur die Sitzung. Endet dauerhaft (`localStorage lfx.statsHint` = `{seen, firstShown}`), sobald ein Statistik-Link des Themes geklickt wurde (`isStatsHref()` in `core/stats.js`, Direktaufruf der URL ist nicht erkennbar) oder 10 Tage nach `firstShown`. Zurücksetzen: Key `lfx.statsHint` löschen.
- Wisch-Schließen (`src/js/core/swipe.js`): `attachSwipeClose(el, {onClose, handleZone=32, canStart, threshold=0.3, velocity=0.5, backdrop, reducedMotion})` → `detach()`.
  - Nur nach unten; Richtung wird nach 8 px festgelegt. Start in der Griffzone (oberste `handleZone` px) oder wenn kein Vorfahr gescrollt ist (`canStart` kann zusätzlich sperren). Während des Ziehens: Klasse `lfx-dragging` + Inline-`transform`. Schließen ab 30 % Weg oder > 0,5 px/ms, sonst Zurückfedern; bei reduced motion sofort.
  - Anbindung: itemmenu (Bottom-Sheet, schließt via `history.back()` wie Escape), download (Auswahl), modal (nur < 800 px, nur bei `overlay.scrollTop` 0 und ohne offenes Menü/Auswahl).
  - CSS: Öffnungsanimationen mit `both !important` überdecken den Inline-Transform, deshalb setzt `.lfx-dragging` `animation:none`. Die Schließanimation (`lfx-menu-out`, Jellyfin wartet auf `animationend`) bleibt bewusst unberührt.
- Modal-Scroll: Das Modal startet immer bei `scrollTop` 0. Bei Episoden-Karten scrollt es nach dem Rendern per rAF sanft (`overlay.scrollTo`, reduced motion → `auto`) zur markierten Folge. Kein `scrollIntoView` (es scrollte auch das Overlay). Staffelwechsel und Refresh scrollen nie; Nutzereingriff (wheel/touchstart/pointerdown/keydown) bricht ab.
- „Meine Liste“-Buttons: aktiv = grüner Haken. Modifier-Klassen `lfx-hc__btn--list`, `lfx-modal__round--fav`, `lfx-np__btn--fav`, `lfx-bb__btn--list`; Tokens `--lfx-green` / `--lfx-green-soft`.
- Gesehen-Status (Detail-Modal und Hover-Popup): `setPlayed(id, bool)` aus `src/js/core/api.js` (`POST`/`DELETE /Users/{userId}/PlayedItems/{id}`, wirft bei Fehler).
  - Button = `lfx-modal__round lfx-modal__round--played` (eckig, `data-scope` = `item` | `series` | `season`), aktiv = weiße Fläche mit dunklem `ICON_EYE_CHECK`; `playedButton`, `setPlayedState`, `setEpisodeSeen` in `modal/render.js`. Orte: Kopf (Film/Episode direkt, Serie mit Rückfrage; nicht bei BoxSet/Season), Folgenzeile (immer sichtbar, `stopPropagation`, Zeile bekommt `is-played`), Folgen-Kopf links neben dem Staffel-Dropdown (`.lfx-modal__eps-tools`, mit Rückfrage), Hover-Popup (Bild unten rechts, Klasse `lfx-hc__played`, `togglePlayed`/`askBulkPlayed` in `hovercard.js`; Film/Folge sofort optimistisch mit Rollback + Toast, Serie/Staffel mit Rückfrage).
  - Staffel/Serie: `setPlayed` auf die Staffel-/Serien-Id (rekursiv serverseitig), danach Folgen neu laden und abweichende Folgen einzeln nachziehen (`bulkPlayed` in `modal.js`). Die Startseite („Weiterschauen“) wird nicht live aktualisiert (`rows.js` reagiert nur auf `removed`).
  - Folgen-Aktionen (`.lfx-modal__epactions`): Hover-Fade nur für Download/⋮, nicht für den Gesehen-Button.
- Sheet (`src/js/core/sheet.js`): `openSheet(anchorEl, label)`, `renderSheet(c, title, entries)`, `closeChooser()`, `isChooserOpen()`, `isCurrent(c)`, `confirmAction({title, confirmLabel, anchorEl, onConfirm})` (Bestätigen schließt zuerst, ruft dann `onConfirm()` ohne await; `onConfirm` fängt eigene Fehler). Es gibt genau ein Sheet; `download.js` re-exportiert `closeChooser`/`isChooserOpen`.
- `toast(text)` aus `src/js/core/toast.js` (Mount `#lfx-toast`).
- Neue Icons in `src/js/core/icons.js` (`ICON_MORE`, `ICON_DOWNLOAD`, `ICON_LIKE`, `ICON_LIKE_OUTLINE`, `ICON_EYE`, `ICON_EYE_CHECK`).
- Feature `contextmenu` (`src/js/features/contextmenu.js`): Rechtsklick bzw. langes Drücken (500 ms) auf `.lfx-card[data-lfx-id]` und `.lfx-modal__ep[data-lfx-id]` öffnet das Titelmenü. Native Karten bleiben unberührt.
- Solange ein natives `.dialogContainer` oder die Download-Auswahl offen ist, reagieren Modal (Escape, Tab-Falle, Klick außerhalb) und Hovercard (Schließen) nicht.

## Startseite
- `src/js/features/home.js` (fertig) legt `#lfx-home` als erstes Kind von `#homeTab` an mit Slots `#lfx-billboard` und `#lfx-rows` und ruft `billboard.render(slot, ctx)` bzw. `rows.render(slot, ctx)` auf (Rückgabe: Cleanup-Funktion). Native Sektionen sind dann per `html.lfx-home-on` versteckt.

## Designs (Umschalter)
Sechs Designs: **LENZFLIX** (`flix`, Standard, das Kern-CSS selbst), **LENZ+** (`plus`: dunkles Navy, Hero-Karussell mit Seitenvorschau, Poster-Zeilen, Bibliotheks-Hubs) **LENZPRIME** (`prime`: Blauschwarz, Vollbild-Hero mit Trailer, Badges, Glas-Kopfzeile) **LENZ//84** (`retro`, Beta: Bernstein-Terminal, Kassetten, Neon-Gitter) **VIDEOTHEK LENZ** (`store`, Beta: begehbare 3D-Videothek) und **LENZ LIVE** (`live`, Beta: lineares Fernsehen aus der Mediathek). Feature-Ordner `src/js/features/plus/`, `features/prime/`, `features/retro/`, `features/store/` und `features/live/` (Listen `plusFeatures`/`primeFeatures`/`retroFeatures` und die Store-/Live-Listen in `features/index.js`), CSS unter `src/css/themes/<id>/`. `core/` und `shared/` nutzen alle Designs gemeinsam. Die Features von LENZFLIX (`home`, `nav`, `mobilenav`, `hovercard`, `statshint`) matchen nur mit `isTheme('flix')`.

### Design-Kern (`src/js/core/theme.js`)
- `THEMES`, `THEME_META` (id, Name, Tagline, Palette), `normalizeTheme(x)` (unbekannt → `flix`).
- `getTheme()` = **wirksame** id (`null` solange `pending`), `getChosenTheme()` = gewählte id (kann bei TV/Fehler abweichen), `getThemeState()` = `'pending' | 'active' | 'failed'`, `isTheme(id)` = `getTheme() === id`, `brandName(id?)` = „LENZFLIX“ / „LENZ+“ / „LENZPRIME“ / „LENZ//84“ / „VIDEOTHEK LENZ“ / „LENZ LIVE“ (für UI-Texte statt hartkodierter Marke).
- `setTheme(id, {source='user'})` → Promise, löst nach Anwenden (bzw. Scheitern) auf. `onThemeChange(fn)` → Abmeldefunktion; `fn({theme, previous})`.
- Zustände: `pending` (erster Start, Design-CSS lädt; `html.lfx-theme-loading` blendet `body` aus, spätestens nach 1,5 s erscheint LENZFLIX, das Design-CSS lädt weiter), `active`, `failed` (Design-CSS nicht ladbar → LENZFLIX + Toast). Genau eine Klasse `html.lfx-theme-<id>`. Der Kern wird aus `main.js` getrieben (`earlyTheme`, `startTheme`, `syncThemeUser`; `applyThemeClass` aus `layout.js`), Features rufen nur die Lese-API und `setTheme`.
- Vorrang der Wahl: Hash-Param `lfxtheme=<id>` (wird sofort aus dem Hash entfernt und gespeichert) → `localStorage lfx.theme.<userId>` → `lfx.theme.last` → `flix`. Zusätzlich pro Benutzer auf dem Server: DisplayPreferences mit id **und** client `lenzflix`, `CustomPrefs.theme` (ganzes Objekt GET → ändern → POST, 400 ms entprellt; einmal pro Benutzer geladen, eine schnellere Nutzerwahl schlägt einen später eintreffenden Server-Wert).
- TV (`html.layout-tv` oder TV-User-Agent) erzwingt immer `flix`; die Wahl bleibt gespeichert. Not-Ausgang: `#/home?lfxtheme=flix`.
- `getTheme()` nie beim Modul-Laden auswerten; Features entscheiden in `match()` per `isTheme(id)`. Ein Wechsel löst `reevaluate()` aus.

### Design-CSS nachladen (`src/js/core/themecss.js`)
- `plus`/`prime`/`retro`/`store` liegen in eigenen Bundles `dist/lenzplus(.min).css`, `dist/lenzprime(.min).css`, `dist/lenzretro(.min).css` und `dist/lenzstore(.min).css` (Build: `build/build.mjs`, Einstiege `src/css/themes/<id>/index.css`, Reihenfolge = Kaskade, keine Globs); `flix` braucht nichts.
- `ensureThemeCss(id, {timeout})` → `Promise<boolean>`: `<link class="lfx-theme-css" data-lfx-theme=id>` am Ende von `<head>`; bei Fehler/Timeout wird der Link entfernt. `removeThemeCss(exceptId)` entfernt alle anderen (der bleibende bekommt `id="lfx-theme-css"`). Außerdem `themeCssUrl(id)`, `getThemeCssLink(id)`.
- Basis-URL (`resolveThemeCssBase()`), Reihenfolge: 1. `window.LenzFlixConfig.themeCssBase` (Verzeichnis-URL; `.min` folgt dem erkannten Kern-CSS) → 2. Dev-Link `#lfx-dev-css` (mit Query) → 3. Ort des eingebundenen Kern-CSS/-JS (`@import`-Regel, `<link>`, Boot-Skript, `<script src>`) → 4. jsDelivr-Fallback `…/LenzFlix@v<VERSION>/dist/` (`VERSION` aus `core/version.js`).
- Asset-URLs in Design-CSS wie im Kern relativ zu `dist/` (`../assets/…`).

### VIDEOTHEK LENZ (`store`, `features/store/`)
- Zwei Bundles: Die Hülle `features/store/` liegt im Hauptbundle und importiert nie `three` (Wächter in `build/build.mjs`); die 3D-Welt `src/js/store3d/**` wird als `dist/lenzstore(.min).js` per `core/themejs.js` erst bei Auswahl nachgeladen (CSS analog über `themecss.js`). Das 3D-Bundle importiert nur `three` und eigene Dateien; Zustandsbehaftetes kommt per `deps` von der Hülle.
- Lebenszyklus-Ausnahme: `unmount()` setzt die 3D-Instanz nur aus (suspend), nach 3 min folgt dispose; Design-Wechsel und `destroy()` disposen sofort.
- `match(route)` wie bei den anderen Designs mit `isTheme('store')`; Vertrag, Module und ctx-API: `docs/store3d.md`.

### LENZ LIVE (`live`, `features/live/`)
- Zwei Bundles wie `store`: Hülle im Hauptbundle, Engine `src/js/live/**` als lazy `dist/lenzlive(.min).js` (nur eigene Dateien, Marker `__LFX_LIVE_ENGINE__`). Vertrag: `docs/live.md`.
- `home.js` mountet `#lfx-live-home` auf `#/home` (ohne `lfx`-Route); `unmount()` → suspend, dispose nach 3 min, bei Design-Wechsel/`destroy()` sofort. Match mit `isTheme('live')`, nur Modern, nicht TV.
- `guard.js` (Routen-Wächter): solange `live` wirksam ist, werden alle Mediathek-Routen per `location.replace` auf `#/home` umgeleitet; erlaubt sind Login-/Setup-Routen, `/dashboard*`, `/mypreferences*`, `/userprofile*`, `/video`, `/queue` und Admin-Seiten.
- `leave.js`: `leaveToLibrary(itemId, meta)` wechselt dauerhaft ins vorherige Design (`getPreviousTheme()` aus `core/theme.js`, nie `live`) und navigiert danach zum Titel.
- `modal` und `newpopular` matchen unter `live` nicht (kein Detail-Overlay, keine „Neu und beliebt“-Seite).

### TV-Modus (`lfx=tv`, `features/tvmode/`, nur flix/plus/prime)
- Eigene Vollseite `#/home?lfx=tv` (Route-Kind `tv` in `shared/routes.js`, `tvModeHref`/`isTvModeRoute`), Einstieg über ein TV-Symbol in der Kopfleiste (flix: `features/tvbtn.js`, plus/prime im eigenen Kopf). Vertrag, Engine, DOM und Lebenszyklus: `docs/tvmode.md`.
- Zwei Bundles: Hülle `features/tvmode/` im Hauptbundle (Server-deps aus `features/live/deps.js`, geteilt mit LENZ LIVE), Engine `src/js/live/tvmode/**` als lazy `dist/lenztvmode(.min).js` (nur Dateien aus `src/js/live/`, Marker `__LFX_TVMODE_ENGINE__`), CSS lazy als `dist/lenztvmode(.min).css`.
- `core/addoncss.js`: `ensureAddonCss(name, {timeout})` lädt ein Zusatz-CSS (Klasse `lfx-addon-css`) aus demselben Ort wie das Kern-CSS (`addonCssUrl(name)`), `removeAddonCss(name)` entfernt es. Anders als `themecss.js` gehört es nicht zum Design-Wechsel (kein `lfx-theme-css`).
- Ereignisse auf `window`: `lfx:play` (`core/playback.js` `play()` feuert es synchron vor dem Proxy-Klick, `detail: { id }`; stoppt den TV-Modus bei jedem normalen Abspielweg) und `lfx:tvmode-intent` (TV-Symbole feuern es synchron im Klick, damit `features/tvmode/unlock.js` ein `<video>` in der Geste entsperrt).
- Wiedergabe-Ausnahme: Wie LENZ LIVE spielt der TV-Modus mit eigenem `<video>` ohne Fortschrittsmeldung, nicht über den Proxy-Klick. „Von vorne“ und „In der Mediathek ansehen“ stoppen den TV und gehen dann normal über `core/playback.js` (`resume:false`).
- Umleitung unter retro/store/live und `html.layout-tv` per `features/themeroute.js` auf `#/home`.

### Player-Bildmitte (`features/osdcenter.js`, Modern, alle Designs außer `live`, nicht `layout-tv`)
- Eigener Container `#lfx-osdc` (body, `position:fixed`, z-index 900: über Video/Player-Seite, unter Dialogen ≥ 1000) mit drei Knöpfen ⟲10 · Play/Pause · ⟳30. CSS `js-ui/osdcenter.css`.
- Klick = Proxy-Klick auf `.btnRewind`/`.btnPause`/`.btnFastForward` der aktiven Seite (`[id="videoOsdPage"]:not(.hide)`); Events der Knöpfe werden nicht weitergereicht (kein Leisten-Toggle durch Tippen aufs Bild). Play-Symbol folgt `play`/`pause` des `video.htmlvideoplayer`.
- Sichtbar (`.is-visible`) nur bei sichtbarer `.videoOsdBottom` (weder `videoOsdBottom-hidden` noch `hide`), ohne offenen Dialog (`.dialogContainer .dialog.opened`) und ohne `.upNextContainer` ohne `.hide`; Proxy mit `.hide` blendet den Knopf aus.
- Erkennung: `match` per Router (viewshow/hashchange) bzw. aktive Seite; gemountet beobachtet ein MutationObserver (childList + `class`) auf body, per rAF gebündelt.

### Ladebild beim Abspielen (`core/startcover.js`, alle Designs außer `live`, nicht `layout-tv`)
- `play()` in `core/playback.js` zeigt vor dem Proxy-Klick `#lfx-startcover` (`show({item})`, idempotent je Item-Id; `hide()`, `destroy()`, `allowRoute(path)`): Backdrop (bei Folgen der Serie), Titel unten links (Folge: Serienname + „S1 · F3 · Titel“), Ladekreis; nur Kern-Tokens. z-index 1250 (über Info-Fenster 1200, unter MUI-Menüs 1300 und Jellyfin-Dialogen). CSS `js-ui/startcover.css`.
- Das Info-Fenster (`features/modal.js`) zeigt es sofort beim Klick auf Abspielen/Folge, dann `closeModal({after: play})`; Abbruch beim Laden von „Nächste Folge“ entfernt es wieder.
- Abbau (Fade 200 ms, MutationObserver auf body nur solange es steht, rAF-gebündelt): sichtbare `[id="videoOsdPage"]:not(.hide)` UND `video.htmlvideoplayer` spielt; offener `.dialogContainer .dialog.opened`; Route weder `/video` noch Ausgangsroute (Fallback `playViaDetails` erlaubt `/details`); anderes Item ersetzt den Inhalt; Sicherheitsnetz 25 s; Esc schließt nur das Ladebild (Event verschluckt).
- Info-Fenster: öffnet immer oben (kein Auto-Scroll zur markierten Folge); am Handy steht die Folgennummer als „1. Titel“ (`data-num` am `.lfx-modal__ep-title`, `::before`); beim Schließen (X, Wischen, Esc) wird `window.scrollY` der Seite wiederhergestellt (sofort, rAF, 150 ms); `attachSwipeClose({holdBackdrop:true})` deckt den Hintergrund beim Wegwischen nicht auf.

### Regeln für Design-Features (`features/plus|prime|retro`)
- `match(route)` beginnt mit `isTheme('plus'|'prime'|'retro')` und prüft `isModern()`/nicht TV; ohne passendes Design mountet nichts.
- LENZFLIX-Kopf (`nav.js`/`mobilenav.js`), nur nach Breite, unabhängig von `layout-desktop`/`layout-mobile`: **< 900 px** (`isNavCompact()`) nur `mobilenav` (Logo, Chips, „Mehr“-Overlay; `#lfx-nav` per CSS aus), **≥ 900 px** nur die große Leiste `#lfx-nav` (bei `layout-mobile` 900–1100 px enger). Nie beide zugleich. Einklappen (`nav.js` `fit()`): Passt die Leiste nicht bis 16 px vor das erste sichtbare rechte Symbol (`header.MuiAppBar-root > .MuiToolbar-root:first-child` mit `.MuiIconButton-root`, `a[href="#/search"]`, `button[aria-haspopup]`, dazu `.lfx-tvbtn`; fehlt es: `innerWidth − 180`), wandern Punkte von hinten ins „Mehr“-Menü: „Meine Liste“, „Neu und beliebt“, „Filme“, „Serien“ („Startseite“ und „Mehr“ bleiben). Eingeklappte Punkte stehen als `.lfx-nav__menu-item--fold` (mit `data-key`, aktiv markiert) oben im Menü; ist einer aktiv, ist „Mehr“ aktiv. Neu gemessen bei `resize` (rAF), `ResizeObserver`/`MutationObserver` an der Toolbar, `document.fonts.ready`, Routenwechsel und Render.
- Eigene Mount-IDs und Klassen mit Präfix `lfx-plus-*`, `lfx-prime-*` bzw. `lfx-retro-*` (z. B. `#lfx-plus-home`, `html.lfx-plus-home-on`); die Mounts von LENZFLIX (`#lfx-home`, `#lfx-nav` …) nicht mitbenutzen. Native Elemente nur per CSS-Klasse verstecken, `unmount()` räumt vollständig auf.
- Karten: Kartenvertrag (oben) bleibt Basis (`.lfx-card`, `data-lfx-id`, `data-lfx-type`, `.lfx-card__img`/`__logo`/`__title`) plus Design-Klasse (`lfx-plus-card`, `lfx-prime-card`; retro: `createTapeCard`, siehe unten); Items in `itemStore`, Wiedergabe über `core/playback.js`.
- Eigene Routen, alle unter `#/home?lfx=…` (der native Router behandelt sie als Startseite): `title&id=`, `hub&lib=`, `browse&lib=[&genre=]`, `search[&q=]` (`new` = „Neu und beliebt“). Links bauen und lesen nur mit `src/js/shared/routes.js` (`titleHref`, `hubHref`, `browseHref`, `searchHref`, `parseLfxRoute`).
- Feature `themeroute` (zuerst registriert): ist das wirksame Design `flix` (geteilter Link, TV, Wechsel) und die Route `title|hub|browse|search`, leitet es per `location.replace` ohne History-Eintrag auf das native Ziel um (Detailseite, Bibliothek, `#/search`, `#/home`).
- Klicks auf Karten fängt weiterhin das Modal-Feature ab (gewollt): `openModal()` leitet bei wirksamem Design `plus`/`prime`/`retro` auf `titleHref(id)` um, statt das Overlay zu öffnen. Eigene Karten brauchen dafür nur den Kartenvertrag.
- Neue Design-Features in `features/plus/index.js`, `features/prime/index.js` bzw. `features/retro/index.js` eintragen.

### CSS-Scoping für Designs
- Alle Regeln: `html.lfx-js.lfx-theme-<id>:not(.layout-tv)` (plus ggf. Feature-Klasse wie `.lfx-plus-header-on`); nie auf TV. Native Overrides zusätzlich mit `body:not(.dashboardDocument)` begrenzen.
- Das Design-CSS ist ein eigenes `<link>` nach dem Kern-CSS und das Custom-CSS-`<style>` hat keinen `@layer`: Die Klasse `lfx-theme-<id>` im Selektor liefert die höhere Spezifität gegenüber Kernregeln, darauf verlassen statt auf die Reihenfolge. Kern-`!important` nur mit `!important` gleicher oder höherer Spezifität übertrumpfen.
- Eigene Tokens in `src/css/themes/<id>/tokens.css` (unter dem Design-Selektor, überschreiben Kern-Tokens). Admin-Overrides nach dem `@import` greifen daher nur in LENZFLIX.
- Design-neutrale UI (`js-ui/themepicker.css`, `js-ui/popover.css`, `js-ui/theme.css`) liegt im Kern-Bundle.

### LENZ//84 (`retro`, `features/retro/`)
- Features (Reihenfolge = `retroFeatures`): `header` (Desktop-Kopfzeile als Terminal-Statuszeile, `#lfx-retro-header`), `tabbar` (Handy: `#lfx-retro-topbar` + Funktionstasten-Leiste `#lfx-retro-tabbar`, „MEHR“-Sheet), `home` (Startseite und Hubs Filme/Serien: Hero mit Neon-Gitter und Sonne, Kassetten-Regal), `title` (Titelseite als Kassettenhülle, Trailer-Overlay), `search` (Suche als Kommandozeile), `browse` (Bibliothek als Verzeichnis-Listing), `nativedetail` (native Detailseite, nutzt die Fabrik `createNativeDetail` aus `features/plus/`), `fx` (siehe unten). Sonst importieren die retro-Features nichts aus `features/plus|prime`.
- Karte: `createTapeCard(item, {variant, progress})` aus `features/retro/card.js`; `variant` = `'spine'` (Kassettenrücken im Regal, Standard) | `'cover'` (Poster 2:3 in Hülle) | `'wide'` (16:9, Episoden/Weiterschauen); `progress` 0..100 für den Bandwickel-Balken (ohne Angabe aus UserData). Erfüllt den Kartenvertrag plus `lfx-retro-card__*`.
- FX-Schnittstelle `features/retro/prefs.js` (Seiten-Features importieren nur diese Datei, nie `fx/`):
  - `getPref(name)` / `setPref(name, value)` / `togglePref(name)`: Vorlieben `sound` (Standard **aus**) und `crt` (Standard an), pro Benutzer in `localStorage` (`lfx.retro.<name>.<userId|anon>`). `setPref` feuert am `document` das Ereignis `PREFS_EVENT` (`lfx-retro-prefs`, `detail: {name, value}`).
  - `emitFx(name, detail?)` meldet ein Effekt-Ereignis (`FX_EVENT` = `lfx-retro-fx`, `detail: {name, …}`), z. B. `'hover'`, `'click'`, `'type'`, `'open'`; retro-fx spielt dazu ggf. einen Sound (nur bei `sound` an). Wirft nie.
  - `LOGO_ATTR` (`data-lfx-retro-logo`): Logos tragen es, damit retro-fx die Gesten erkennt (mehrfaches Tippen = Cheat-Code/Overdrive, Langdruck = Terminal; Klicks aufs Logo werden dabei ggf. unterdrückt). Das Terminal öffnet auch die Taste `^` (`Backquote`).
  - `OVERDRIVE_CLASS` (`lfx-retro-overdrive`): Klasse am `<html>`, solange Overdrive aktiv ist (20 s); CSS darf darauf reagieren. `NO_CRT_CLASS` (`lfx-retro-nocrt`): Klasse am `<html>`, wenn das CRT-Overlay aus ist (setzt nur retro-fx).
- Regel: **`retro-fx` (`features/retro/fx/`) besitzt alle Effekt-Schleifen und globalen Listener** (CRT-Overlay, Boot-Screen, Glitch, Sound, Cheat-Code, Terminal, Code-Regen-Bildschirmschoner). Andere retro-Features starten keine eigenen globalen Schleifen/Listener, sondern melden per `emitFx`. retro-fx ist **aus im Player und auf der Dashboard-Seite** (`shouldRun`: Retro, Modern, nicht TV, eingeloggt, kein sichtbarer Player, kein `body.dashboardDocument`); `unmount()` stoppt Timer/Listener und entfernt `#lfx-retro-crt|boot|terminal|rain`, den Toast und die html-Klassen. Bei `prefers-reduced-motion` laufen keine Schleifen.
- z-index-Stufen (`src/css/themes/retro/fx.css`): CRT-Overlay 1280 (über Header 1101/Modal 1200/Sheet 1250, unter Toast/Menüs ab 1300 und Jellyfin-Dialogen), Overdrive-Toast 1285, Terminal 1380, Code-Regen 1390, Boot-Screen 2000 (nur beim Start). Animiert wird nur `transform`/`opacity`.
- Terminal: Parser und `execute(line, ctx)` in `fx/terminal-commands.js` sind DOM-frei und über `ctx` testbar; Ausgaben sind reiner Text (per `textContent`), nie Tokens/IDs/URLs mit `api_key`.
- Schriften: `LenzRetro Pixel`/`LenzRetro Mono` (`assets/fonts/lenzretro-*.woff2`, Lizenzdateien `LICENSE-SpaceMono.txt`/`LICENSE-VT323.txt`); die Statistik-Seite hat eigene Kopien in `charts-worker/public/lenzflix-stats/`.

### Router (zweiphasig, `core/router.js`)
- Pro Auswertung (`hashchange`, `viewshow`, `reevaluate()`, Registrierung) werden zuerst **alle** `match()` ausgewertet (Stand vor jeder Aktion). Phase 1: alle nicht mehr passenden, gemounteten Features `unmount()`. Phase 2: neue Treffer `mount(route)`, bestehende `update(route)`, in Registrierungsreihenfolge.
- Kein neues Feature sieht dadurch noch DOM/Klassen eines alten (Design- oder Routenwechsel). Wiedereintritt (z. B. `reevaluate()` in `mount`) wird gemerkt und danach mit der neuesten Route wiederholt (max. 10 Durchläufe).

### Design-Dialog und Popover
- `openThemePicker({returnFocus})` / `closeThemePicker()` / `isThemePickerOpen()` (`core/themepicker.js`): Singleton `#lfx-themepicker` an `<body>` (Dialog am Desktop, Bottom-Sheet < 800 px mit Wisch-Schließen), unabhängig von Features, überlebt Design-Wechsel; Klick auf eine Karte ruft `setTheme(id, {source:'user'})`. Aufrufer: „Mehr → Design Einstellungen“ (`nav.js`), Mehr-Overlay (`mobilenav.js`), Profilmenüs der Designs (`shared/profile.js`).
- `openPopover(anchorEl, {label, items, align='end', className})` / `closePopover({restoreFocus})` / `isPopoverOpen()` (`core/popover.js`): Singleton `#lfx-popover`; `items: [{key, label, href?, onClick?, className?, icon?, badge?, hidden?}]`. Klicks auf den Anker zählen nicht als „außerhalb“, der Aufrufer schaltet selbst per `isPopoverOpen()`/`closePopover()` um.
- `badge` (Menüeintrag-Feld, Text z. B. „Beta“): kleine Pille hinter dem Label (`badgePill(text)` in `core/dom.js`, Styles `js-ui/beta.css`); der zugängliche Name wird als „Label (Beta)“ gesetzt (`badgedName(label, badge)`, `aria-label`). „Design Einstellungen“ trägt das Badge „Beta“ in `core/popover.js`, `features/nav.js`, `features/mobilenav.js`, `features/prime/footer.js` und `features/retro/tabbar.js`; neue Menüs mit diesem Eintrag setzen das Feld ebenfalls.

### Statistik-Seite und Design
- `statsHref(theme)` (`core/stats.js`) hängt `theme=<id>` an die Statistik-URL. Die Seite (`charts-worker/public/lenzflix-stats/app.js`, `resolveTheme()` → `applyTheme()`, Whitelist `flix|plus|prime|retro`) löst `?theme=` → `lfx.theme.<userId>` → `lfx.theme.last` → `flix` auf (nur Whitelist). Lokal prüfen: `node build/stats-dev.mjs`.

### Gemeinsame Module (`src/js/shared/`, für plus, prime und retro)
- `routes.js` – Design-Routen (`#/home?lfx=…`) bauen/lesen.
- `libraries.js` – Bibliotheken des Benutzers als einfaches Modell (`getLibraries`).
- `hub.js` – Zeilen-Definitionen und Hero-Pool für Bibliotheks-Hubs (`hubTypes`, `buildHubRowDefs`, `getHubHeroPool`).
- `collections.js` – Sammlungen (BoxSets) für Marken-/Studio-Kacheln (`getCollections`).
- `newcontent.js` – „Neu“-Erkennung und Badges (`getNewContentInfo`, `newBadge`).
- `trend.js` – Trend-/Beliebtheits-Badges aus `core/charts.js` mit Fallback (`getTrendInfo`, `cardBadge`).
- `search.js` – Suche und Genre-Kacheln (`searchItems`, `getGenreTiles`).
- `titleactions.js` – UI-unabhängige Titel-Aktionen (`togglePlayed`, `toggleFavorite`, `setLike`, `startDownloadFor`, `openTitleMenu`).
- `trailer.js` – Trailer-URLs und stumme Vorschau (`createMutedPreview`).
- `profile.js` – Profilmenü-Einträge und Benutzer-Chip für das Popover (`profileEntries`, `getUserChip`, `logout`).

## Vorladen der Startseite (1.11.5, Pause 1.11.6)
`features/rows/prefetch.js` lädt die noch offenen Zeilen der Startseite im Hintergrund, damit beim Scrollen alles da ist.
- **Wo:** nur LENZFLIX (`features/rows.js`), LENZ+ (`plus/rows.js`, Option `prefetch: true`) und LENZPRIME (`prime/home-rows.js`, Option `prefetch`). Hubs (Serien/Filme) und retro nutzen es nicht.
- **Netz-Sperre:** `allowPrefetch()` ist false bei `navigator.connection.saveData`, `type === 'cellular'` oder `effectiveType` slow-2g/2g/3g; ohne API (Safari/Firefox) true.
- **Start erst, wenn oben fertig ist:** Hero ohne Skeleton, Bilder (außer lazy) geladen, kein wartender Trailer; die ersten 3 Zeilen gefüllt und deren ersten 8 Kartenbilder geladen (höchstens 4 s). Obergrenze 15 s nach Mount, dann Start trotzdem. Cache-Treffer (`core/homecache.js`) sind schon gefüllt, betroffen sind nur offene Zeilen (`pending`).
- **Ablauf:** immer eine Zeile, in DOM-Reihenfolge von oben; `load(el, eintrag)` ruft das vorhandene `loadRow` (Zeile wird vorher aus `pending` genommen und beim Observer abgemeldet, keine Doppelladung; vom Nutzer per Scrollen geladene Zeilen werden übersprungen). Danach die ersten 8 Bilder der Zeile `loading='eager'`, Warten auf load/error (max. 4 s), Pause per `requestIdleCallback` (timeout 1000) bzw. 150 ms. Pausiert bei `document.hidden`, `stop()` im `unmount()` baut Timer/Listener ab (Pause-Signale siehe unten). `notify()` meldet nachgelieferte Zeilen (prime „Mehr“).
- **Signale:** `data-lfx-tr` am Hero-Slot (`wait` = Trailer steht aus, `on` = läuft, fehlt = keiner/aufgegeben), gesetzt von `billboard.js` und `prime/hero.js` (prime gibt nach `TRAILER_DELAY_MS` + 4 s still auf); LENZ+ hat keinen Trailer. Das Trailer-Timing und `lfx:rows-ready` bleiben unverändert.
- **Pause (1.11.6, alle Designs, `paused()` in `prefetch.js`):** pausiert bei `document.hidden`, bei der `<html>`-Klasse `lfx-modal-open` (Info-Fenster, `features/modal.js`) oder bei `lfx-tvm-bgplay` UND vorhandenem `#lfx-tvm-bg video` (TV-Modus läuft im Hintergrund-Bild-in-Bild; Klasse gesetzt von der TV-Engine, siehe `docs/tvmode.md`). Eine laufende Zeile lädt fertig, es startet keine neue. Ein `MutationObserver` auf `class` von `<html>` setzt nach `RESUME_MS` (2 s) Ruhe fort, erneutes Öffnen setzt den Zähler zurück, und zwar an derselben Stelle (nächste Zeile aus `pending` in DOM-Reihenfolge). Beim Wiedersichtbarwerden des Tabs geht es sofort weiter. Der TV-Modus selbst baut die Startseite ab (`stop()`).
