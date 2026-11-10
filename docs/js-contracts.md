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
