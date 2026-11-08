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

## Startseite
- `src/js/features/home.js` (fertig) legt `#lfx-home` als erstes Kind von `#homeTab` an mit Slots `#lfx-billboard` und `#lfx-rows` und ruft `billboard.render(slot, ctx)` bzw. `rows.render(slot, ctx)` auf (Rückgabe: Cleanup-Funktion). Native Sektionen sind dann per `html.lfx-home-on` versteckt.
