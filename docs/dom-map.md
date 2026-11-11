# DOM-Karte Jellyfin-Web 12.4 (Server 12.4.0)

Quellen:
- Quellcode `jellyfin/jellyfin-web` Tag `v12.4`, Commit `0a580ce8`. Ein lokaler Klon (nicht im Repo) liegt unter `%SCRATCHPAD%/jw/src/src/…`.
- Live-Prüfung mit einem Nicht-Admin-Testkonto am 2026-11-08. Live bestätigte Angaben sind mit ✅ markiert.

## Layout-Erkennung
- `html.layout-desktop | .layout-mobile | .layout-tv` (`components/layoutManager.js`). Eine eigene Modern-Klasse gibt es nicht. ✅
- **Modern** erkennt man an `header.MuiAppBar-root` (existiert nur im Modern-Layout) ✅. In CSS: `html:has(header.MuiAppBar-root)` bzw. per JS `html.lfx-modern` setzen.
- **TV** = `html.layout-tv`. Das TV-Layout läuft immer auf Legacy und hat den Header `.skinHeader` mit `.headerTop/.headerLeft/.headerRight` und `.headerTabs`.
  - `.skinHeader` ist eine Flex-Spalte: `.headerTop`, darunter `.headerTabs`. Ab `@media (min-width: 100em)` (also 1920er-TVs) zieht Jellyfin `.headerTabs` per `margin-top:-4.3em; position:relative; align-self:center` in die Logo-Zeile. `tv.css` setzt das zurück. Live geprüft im Chrome-TV-Layout am 2026-11-09. ✅
  - LG webOS 4.x (Jellyfin-App) = Chromium 53. Kein `#rrggbbaa`/`#rgba` (erst ab 62), deshalb hat lightningcss das Target `chrome: 53`. Kein `inset`, kein Flex-`gap`, kein `clamp/min/max` im TV-Pfad. Das JS-Bundle (es2020, `?.`) wird dort nicht geparst. ✅
  - Karten ohne `.show-animation` haben `contain: content`. Der 4px-`box-shadow`-Ring bleibt trotzdem sichtbar, weil er im 0.25em-Rand der `.cardBox` liegt. ✅
- Im Modern-Layout existiert `.skinHeader` ebenfalls im DOM, ist aber versteckt. Selektoren darauf deshalb immer scopen.
- `html[data-theme="dark"]` ✅. Root: `#reactRoot` ✅. Der Seiten-Content liegt in `main.MuiBox-root` → `.mainAnimatedPages.skinBody` → `.page`.
- Routing über den **Hash-Router** ✅: `#/home`, `#/home?tab=1` (Favoriten), `#/movies?topParentId=…&collectionType=movies`, `#/tv?topParentId=…`, `#/details?id=…&serverId=…`, `#/list?parentId=…`, `#/search`, `#/video`, `#/login`, `#/mypreferencesmenu`, `#/mypreferencesdisplay`.

## Theme-Variablen (überschreiben = Basisschicht)
- MUI CSS-Vars mit Prefix `--jf-` liegen auf `:root, [data-theme="dark"]` ✅:
  - `--jf-palette-primary-main` (`#00a4dc`) samt `-light`, `-dark`, `-contrastText`, `-mainChannel` (RGB-Tripel!)
  - `--jf-palette-secondary-*`
  - `--jf-palette-background-default` (`#101010`) und `-paper` (`#202020`) samt `*Channel`
  - `--jf-palette-text-primary/secondary`
  - `--jf-palette-action-*`
  - `--jf-palette-AppBar-defaultBg/transparentBg/gradient/darkBg`
  - `--jf-palette-error-*`
  - `--jf-palette-FilledInput-*`
  - `--jf-palette-Button-inheritContained*`
  - `--jf-shape-borderRadius` (4px)
  - `--jf-font-*`, z. B. `--jf-font-body1: 400 1rem/1.5 "Noto Sans",sans-serif`
- `--jf-card-borderRadius` (0.2em) und `--jf-palette-background-defaultImage` stammen aus `themes/_base/_theme.scss`.
- Custom CSS ist ein `<style>` hinter dem Theme-Link und den Emotion-Styles. Bei gleicher Spezifität gewinnt es. Kein `@layer`.

## JS-Zugänge
- `window.ApiClient` ✅:
  - `serverAddress()`, `getCurrentUserId()`, `accessToken()`, `serverId()`
  - `getUrl(path, params)`, `ajax({type,url,dataType:'json'})`, `getCurrentUser()`
  - `updateFavoriteStatus(userId, id, bool)`
  - `getImageUrl(id, {type, maxWidth, tag})`
- Globale Objekte: `window.Events` (`Events.on(obj,'name',fn)`), `window.Emby.Page` (appRouter: `show(path)`, `showVideoOsd()`), `window.Dashboard`, `window.jQuery` ✅.
- **Nicht** global: `playbackManager` und `ServerConnections` ✅.
- **Wiedergabe per JS (live verifiziert ✅):** „Proxy-Klick“
  1. Hidden `div.itemAction[data-action="play"|"resume"]` mit `data-id`, `data-serverid`, `data-type`, `data-mediatype`, `data-isfolder` in ein **vorhandenes** `.itemsContainer` hängen (das muss Karten enthalten, also ein echter `emby-itemscontainer`).
  2. `.click()` aufrufen. `shortcuts.onClick` startet dann `playbackManager`.
  3. Element danach entfernen.
  4. Fallback, falls kein Container da ist: `#/details?id=…` öffnen und `.detailButton.btnPlay` klicken.
- **Titel-Kontextmenü per JS (live verifiziert 2026-11-10 ✅):** „Proxy-Klick“ mit `data-action="menu"` (`core/itemmenu.js`)
  1. Wrapper `div.lfx-proxywrap.itemsContainer` (display:none) in ein echtes `.itemsContainer` mit Karten hängen, darin `div.lfx-proxy.itemAction[data-action="menu"]` mit `data-id`, `data-serverid`, `data-type`, `data-isfolder`, `data-mediatype`. Funktioniert auf Startseite, `#/home?lfx=new` und den React-Bibliotheksseiten; auch bei verstecktem Container und über dem LenzFlix-Modal.
  2. `.click()` → `shortcuts.showContextMenu` lädt das Item und öffnet `.dialog.actionSheet` (Rechteprüfung inklusive). Ein 404 des Items endet ohne Menü.
  3. Der Wrapper ist nötig: Home-Container mit `fetchData` würden bei „Alles ab hier abspielen“ ihre eigenen Items spielen. `playAllFromHere` sammelt `parent.querySelectorAll('.' + card.classList[0] + '[data-id]')`, deshalb muss `lfx-proxy` die **erste** Klasse sein; Geschwister (Episoden der Staffel) als weitere Proxys in Reihenfolge einhängen.
  4. Der Proxy muss leben, bis alle Dialoge zu sind (`shortcuts.js` nutzt die Karte asynchron weiter). Zwischen Sheet und Folgedialog existiert kurz (~35 ms) kein `.dialogContainer`; Sitzungsende deshalb erst nach 800 ms ohne Dialog.
  5. Position: `positionTo` ist der (unsichtbare) Proxy, das Sheet landet bei `left:10px; top:10px` (Inline-Style). Überschreiben per CSS: `html.lfx-menu-open .dialog.actionSheet{left:var(--lfx-menu-x)!important;top:var(--lfx-menu-y)!important}`.
  6. Einträge sind `button.actionSheetMenuItem[data-id]` mit u. a. `resume`, `playallfromhere`, `queue`, `queuenext`, `shuffle`, `addtocollection`, `addtoplaylist`, `download`, `downloadall`, `copy-stream`, `delete`, `edit`, `editimages`, `editsubtitles`, `identify`, `moremediainfo`, `refresh`, `multiSelect`. Ein Klick (auch programmatisch) führt den Befehl aus und öffnet ggf. den nativen Folgedialog.
  7. History: Jeder Dialog pusht einen State (`usr.dialogs`), Schließen ist `history.back()` → nur `popstate`, kein `hashchange`. Jellyfin fokussiert im Desktop-Layout keinen Eintrag.
  8. Download-URL: `ApiClient.getItemDownloadUrl(id)` (`/Items/{id}/Download?api_key=…`, nie loggen). Nativ erlaubt bei `user.Policy.EnableContentDownloading && item.CanDownload`. **Achtung:** genau diese URL liefert live (12.4) HTTP 401, der Browser speichert die Fehlerantwort als .txt. Siehe „Download-Endpunkt“ unten.
  9. Bibliotheksänderungen: `ApiClient.subscribe(['LibraryChanged'], cb)` → `msg.Data.ItemsRemoved/ItemsUpdated`; Rückgabe ist die Abmeldefunktion (laut Quelltext, nicht live geprüft).
- **Download-Endpunkt** ✅ (live gemessen, 12.4): `/Items/{id}/Download?api_key=<token>` (so baut es `ApiClient.getItemDownloadUrl`) → 401. `?ApiKey=<token>` und `Authorization: MediaBrowser Token="…"` → 206. `X-Emby-Token` → 401, HEAD → 405. `Videos/{id}/stream.mp4?…&api_key=` funktioniert weiter. LenzFlix nutzt deshalb `ApiKey` (`core/download.js` `downloadUrl`) und prüft vorher per Range-GET `bytes=0-0` (`probeDownload`, 5 s Timeout): HTTP-Fehler → Toast „Download nicht möglich (Fehler N)“ ohne Datei; Netzwerkfehler/Timeout → trotzdem versuchen. Token/URL nie loggen.
- Credentials liegen in `localStorage.jellyfin_credentials` ✅ als `{Servers:[{Id, AccessToken, UserId, ManualAddress, LocalAddress, …}]}`.
- Custom Elements sind **nicht** über `customElements` registriert. `document.createElement('div',{is:'emby-…'})` funktioniert also nicht.

## Header (Modern, MUI) ✅
- Aufbau: `header.MuiAppBar-root.MuiAppBar-positionFixed` → `.MuiToolbar-root.MuiToolbar-dense.padded-left.padded-right` → `.MuiStack-root`. Darin liegen:
  - `a[href="#/"]` (Server-Logo-Button mit `img` und Servername)
  - `a[href="#/home?tab=1"]` (Favoriten)
  - Bibliotheks-Buttons `a.MuiButton-root[href*="topParentId"]`, aktiv mit `.MuiButton-textPrimary`
- Rechts:
  - Sync-Play-Button `[aria-label="Synchronwiedergabe"]`
  - Cast-Button `[aria-label="Auf Gerät wiedergeben"]`
  - Suche `a[href="#/search"]`
  - User-Menü `button[aria-haspopup]`
  - Die aria-Labels sind lokalisiert. Deshalb besser über `href` bzw. `[aria-haspopup]` selektieren.
- Zustände: `.MuiAppBar-colorTransparent` am Seitenanfang, beim Scrollen `MuiAppBar-colorDefault` mit Elevation.
- Auf Bibliotheksseiten hängt eine 2. Toolbar mit Filter-, Sortier- und Ansichtsbuttons und Pagination in der AppBar.
- Ein Drawer erscheint erst unter 900 px Breite (MUI-Drawer).
- `/video` hat keine AppBar, sondern `.skinHeader.osdHeader`.
- Login (`isPublicPath`): Die Toolbar zeigt nur den Server-Button.

## Startseite (beide Layouts, Legacy-Controller-DOM) ✅
- `#indexPage.homePage.libraryPage.allLibraryPage.pageWithAbsoluteTabs.withTabs` → `#homeTab.tabContent.pageTabContent.is-active` → `.sections` → `.verticalSection.sectionN.emby-scroller-container`. Ausgeblendete Sektionen tragen `.hide`.
- Titel: `.sectionTitleContainer.sectionTitleContainer-cards.padded-left` → (`a.more.sectionTitleTextButton` →) `h2.sectionTitle.sectionTitle-cards`.
- Scroller: `.emby-scroller.padded-top-focusscale.padded-bottom-focusscale` → `.itemsContainer.scrollSlider.focuscontainer-x.animatedScrollX`. Die Scroll-Buttons sind `.emby-scrollbuttons` → `.emby-scrollbuttons-button[data-direction]`.
- Sektionstitel live: „Meine Medien“ (Bibliothekskacheln, overflowBackdropCard), „Weiterschauen“, „Weiterhören“, „Weiterlesen“, „Als Nächstes“, „Kürzlich hinzugefügt in Filme/Serien“ (overflowPortraitCard).
- Die Seite wird per Legacy-Controller gerendert, nicht per React-Reconciliation. Eigene Mount-Points (z. B. vor `.sections`) sind trotzdem sicherer als Eingriffe in fremde Knoten. Die Sektionen werden beim Wiederanzeigen neu gebaut.

## Karten ✅
- Aufbau: `.card.<shape>Card.card-hoverable.card-withuserdata[data-id][data-serverid][data-type][data-isfolder][data-mediatype][data-collectiontype][data-index][data-prefix]`
  - → `.cardBox(.cardBox-bottompadded)`
  - → `.cardScalable` mit `.cardPadder.cardPadder-<shape>`, `canvas.blurhash-canvas` und `a.cardImageContainer.coveredImage.cardContent.itemAction.lazy[href="#/details?…"][data-action="link"]`
  - → darin `.cardIndicators` (`.playedIndicator`, `.countIndicator`, `.progressring`), `.cardOverlayContainer` (Hover-Buttons `[data-action=play|resume|menu]`)
  - → `.cardFooter` → `.cardText.cardText-first/.cardText-secondary`
  - Fortschritt: `.itemProgressBar > .itemProgressBarForeground`
- Shapes: `overflowBackdropCard`, `overflowPortraitCard`, `overflowSquareCard`, `overflowSmallBackdropCard`, `backdropCard`, `portraitCard`, `squareCard`, `bannerCard`, `mixed*Card`. Die Overflow-Breiten sind vw-basiert (`card.scss`).
- Fallstricke:
  - `.card:not(.show-animation)` hat `contain: layout style paint`, das schneidet Hover-Scale ab.
  - `.card` hat `background:none !important`.
- **Click-Interception:** `document.addEventListener('click', fn, true)` → `e.target.closest('.card[data-id]')`. Strg-, Shift-, Meta- und Mittelklick sowie `.cardOverlayButton` durchlassen.

## Detailseite (Legacy-View, beide Layouts) ✅
- Aufbau: `#itemDetailPage.page.libraryPage.itemDetailPage.noSecondaryNavPage.selfBackdropPage`
  - `#itemBackdrop.itemBackdrop`
  - `.detailLogo`
  - `.detailPageWrapperContainer` → `.detailPagePrimaryContainer`
    - `.detailImageContainer` (`.card.portraitCard`)
    - `.detailRibbon.padded-left.padded-right` → `.infoWrapper` (`.nameContainer`, `.itemMiscInfo-primary/-secondary`) und `.mainDetailButtons`
    - `.detailPagePrimaryContent` → `.detailSection` (`.itemGenres`, `.tagline`, `.overview`, `.trackSelections`, `.itemDetailsGroup`)
  - `.detailPageSecondaryContainer` → `.detailVerticalSection` (`#childrenCollapsible`, `#castCollapsible`/`#castContent`, `#additionalPartsCollapsible`, `.moreFromSeasonSection`, `.nextUpSection`, `#specialsCollapsible`, `#similarCollapsible`)
- Buttons in `.mainDetailButtons`: `button.button-flat.detailButton.emby-button` mit `.btnPlay` (resume), `.btnReplay`, `.btnPlayTrailer`, `.btnShuffle`, `.btnPlaystate`, `.btnUserRating` (Favorit), `.btnMoreCommands`, `.btnDownload`. Innen: `.detailButton-content > .detailButton-icon` und `.detailButtonText`.

## Bibliothek (Modern = React) / Liste (Legacy-View)
- React (`#/movies`, `#/tv`, …): `.page.mainAnimatedPage.libraryPage.pageWithAbsoluteTabs.withTabs` mit `#moviesPage`, `#tvshowsPage`, `#boxsetsPage`, `#playlistsPage`, `#musicPage`.
  - Grid: `Box.padded-bottom-page` → `.itemsContainer`, gleiche Kartenklassen.
  - Die Toolbar liegt in der AppBar (2. `.MuiToolbar-root`, MUI-`ButtonGroup`).
  - AlphaPicker: `.alphaPicker-fixed-right`.
- `/list`: `.page.libraryPage.noSecondaryNavPage` mit `.alphaPicker.alphaPicker-vertical.alphaPicker-fixed`, `.itemsViewSettingsContainer`, `.paging`, `.btnSort/.btnFilter/.btnViewSettings` und `.vertical-wrap.itemsContainer`.

## Suche
- `#searchPage.libraryPage.allLibraryPage.noSecondaryNavPage` → `.searchFields > .searchFieldsInner` → `input#searchTextInput.searchfields-txtSearch`
- Suchfeld-Markup (live geprüft 2026-11-09): `.searchFieldsInner.flex` → `span.searchfields-icon.material-icons` + `.inputContainer` → leeres `label.inputLabel` (inline-block, erzeugt ~20px Zeilenbox über dem Input) + `input#searchTextInput`. Theme blendet das Label aus und setzt die Lupe auf `top:22px` (Input 44px). ✅
- Ergebnisse: `.searchResults` (Sektionen wie auf der Startseite), `.searchSuggestions`

## Player-OSD
- Grundgerüst: `#videoOsdPage.page.libraryPage`, Header `.skinHeader.osdHeader` (Modern), `.upNextContainer`, `.videoPlayerContainer` (`video.htmlvideoplayer`).
- Untere Leiste: `.videoOsdBottom.videoOsdBottom-maincontrols > .osdControls`
  - Texte: `.osdTextContainer.osdMainTextContainer` (`h3.osdTitle`, `.osdMediaStatus`), `.osdSecondaryMediaInfo`
  - Zeit: `.osdPositionText`, `.osdDurationText`
  - Slider: `.sliderContainer > input.osdPositionSlider` (emby-slider), `.sliderMarkerContainer`
  - Buttons in `.buttons.focuscontainer-x`: `.btnPreviousTrack`, `.btnRewind`, `.btnPause`, `.btnFastForward`, `.btnNextTrack`, `.btnPreviousChapter/.btnNextChapter`, `.btnUserRating`, `.btnSubtitles`, `.btnAudio`, `.buttonMute`, `.osdVolumeSlider`, `.btnVideoOsdSettings`, `.btnAirPlay`, `.btnPip`, `.btnFullscreen`, `.osdTimeText > .endsAtText`
  - Icon-Größen: `.xlargePaperIconButton/.largePaperIconButton`
- Mausruhe: `.hide-mouse-idle-tv`, `.mouseIdle`.

### Player für das VR-Kino (live geprüft 2026-11-11, Desktop-Chrome ✅)
Genutzt von `features/store/cinema-bridge.js` (Verhalten: `docs/store3d.md`, „VR-Modus“). Getestet mit HLS/MSE (Audio-Transkodierung, SRT), Direktstream mkv (ASS) und einer Serienfolge mit Up-Next.
- **Video:** `video.htmlvideoplayer` in `.videoPlayerContainer`, direktes Kind von `body`; `crossOrigin="anonymous"`, same-origin.
  - Quelle: Direktstream (`currentSrc` mit `https`) oder HLS (`blob:`, MSE). Beide sind als WebGL-Textur lesbar (`texImage2D(video)`, kein SecurityError). `requestVideoFrameCallback` ist vorhanden.
  - Es bleibt **dasselbe Element** bei Seek, Tonspurwechsel und nächster Folge. Nächste Folge: `currentTime` springt auf 0, Route bleibt `#/video`, `document.title` wechselt.
  - Tonspurwechsel (HLS): ~6–7 s `readyState 0` und `currentTime 0`, dann weiter an der alten Position: kein Fehler. Danach sind die Untertitel aus (`manualTrack` disabled), die gewählte Untertitelspur muss erneut gesetzt werden.
  - Titel: `.osdTitle` ist leer, es gilt `document.title`.
- **Alte Player-Seiten:** Jellyfin behält bei jeder Wiedergabe die vorige Player-Seite versteckt (`.hide`) mit derselben ID `#videoOsdPage` im DOM. OSD-Knöpfe deshalb immer über `[id="videoOsdPage"]:not(.hide) …` suchen (Attribut-Selektor, weil `#id` bei doppelten IDs je nach Engine nur das erste Element trifft); sonst klickt man ab der zweiten Wiedergabe tote Knöpfe.
- **Stopp:** `.skinHeader .headerBackButton` (title „Zurück“) `.click()` stoppt, entfernt das `<video>` und navigiert zur vorigen Route (aus der Videothek `#/home`). Daneben existiert ein MUI-Zurück-Knopf, der klassische genügt.
- **OSD-Proxy** (alle Knöpfe existieren im ausgeblendeten OSD, `.click()` wirkt): `#videoOsdPage .btnPause` (Pause/Weiter), `.btnRewind` (−10 s), `.btnFastForward` (+30 s), `.btnPreviousTrack`/`.btnNextTrack` (mit `.hide`, wenn es kein Vor/Zurück gibt), `.buttonMute`, `input.osdVolumeSlider` (0..100).
  - **Seek:** `input.osdPositionSlider` (0..100 Prozent): `value` setzen und `change` (bubbles) feuern. `.osdPositionText`/`.osdDurationText` zeigen die Restzeit („-1:39:49“); besser `video.currentTime/duration` lesen.
- **Ton/Untertitel (Action-Sheet):** `#videoOsdPage .btnAudio` bzw. `.btnSubtitles` `.click()` → `.dialogContainer > .dialog.actionSheet.opened` (Titel `.actionSheetTitle`).
  - Das Sheet legt einen **History-Eintrag** an (`history.state.usr.dialogs`).
  - Einträge `.actionSheetMenuItem[data-id]`, Text `.actionSheetItemText`. Gewählt ist, wessen `.actionsheetMenuItemIcon` kein inline `visibility:hidden` trägt (nicht `getComputedStyle` nehmen: das Sheet ist beim Einblenden selbst noch unsichtbar, dann wirken alle Einträge abgewählt).
  - Untertitel: `data-id="secondarysubtitle"` überspringen, `"-1"` = Aus, sonst Stream-Index. Tonspur: `data-id` = Stream-Index.
  - Wählen: `item.click()` schließt das Sheet, Hash und Video bleiben, die Spur wechselt.
  - **Schließen ohne Wahl:** Esc-keydown und Backdrop-Klick wirken nicht. `history.back()` schließt nur das Sheet (Wiedergabe läuft weiter), **nur wenn** `history.state?.usr?.dialogs?.length > 0`, sonst verlässt man den Player.
- **Untertitel-Darstellung:** Text (SRT u. ä.) als `video.textTracks` mit Label `manualTrack`, `mode 'showing'`, Text aus `activeCues[i].text` (kann LRM `‎` und Zeilenumbrüche enthalten). ASS/SSA: `.libassjs-canvas-parent > canvas.libassjs-canvas` (absolut über dem Video, transparent), als WebGL-Textur lesbar. `.videoSubtitles .videoSubtitlesInner` kam nicht vor (dritte Quelle, nicht live gesehen). PGS nicht geprüft.
- **Up-Next (Serien):** `.upNextContainer.upNextDialog`, sichtbar ohne `.hide`, ~30–40 s vor dem Ende, Text „Nächste Folge beginnt in N Sekunden“ + Titel. Knöpfe `.btnStartNow` („Jetzt starten“), `.btnHide` („Verbergen“). Danach spielt die Folge im selben `<video>`.
- Nicht geprüft: Jellyfins Fehlerdialoge (generisch `.dialogContainer .dialog:not(.actionSheet)` bei Phase „loading“) und Verhalten in einer echten XR-Session auf der Brille.

## Login (Legacy-View)
- Grundgerüst: `#loginPage.page.standalonePage.backdropPage[data-backdroptype="splashscreen"]` → `div.padded-left.padded-right.padded-bottom-page.margin-auto-y`
- Formular: `form.manualLoginForm` mit `h1.sectionTitle`, `#txtManualName`, `#txtManualPassword`, `.chkRememberLogin`, `button.raised.button-submit.block`, `.btnCancel`
- Weitere Bereiche:
  - `.visualLoginForm` mit `#divUsers` (Benutzerkacheln, bleiben versteckt)
  - `.readOnlyContent` mit `.btnManual`, `.btnQuick`, `.btnForgotPassword`, `.btnSelectServer`
  - Disclaimer: `.loginDisclaimerContainer > .loginDisclaimer`

## Dialoge
- `.dialogContainer > .dialog.focuscontainer.opened(.centeredDialog)`, `.dialogBackdrop(.dialogBackdropOpened)`. Während ein Dialog offen ist, trägt `body` die Klasse `.noScroll`.
- ActionSheet: `.dialog.actionSheet` → `.actionSheetContent` mit `h1.actionSheetTitle`, `button.actionSheetMenuItem` und `.actionSheetItemText`.
- MUI-Menüs: `.MuiPopover-root .MuiMenu-paper`. Live-IDs: `#app-user-menu`, `#app-sync-play-menu`, `#app-remote-play-menu`.

## Fremd-Elemente auf dem Entwicklungs-Server (Beispiel für Konflikte mit anderen Themes/Plugins)
- Server-Custom-CSS mit `@import` von `ahza-code/Netflin` war im Testkonto über „Server-CSS deaktivieren“ aus.
- `/web/ui/spotlight-loader.js` („Abyss Spotlight“) ist ins `index.html` eingebaut. Es erzeugt `iframe.featurediframe` in `#homeTab`, `#abyss-spotlight-backdrop`, `html.abyss-spotlight-visible` und `.abyss-spotlight-active`.
  - Im Dev-Loop neutralisieren: Iframe und Backdrop entfernen, Klassen abziehen und per CSS verstecken.
  - LenzFlix soll in Produktion zusätzlich defensiv `.featurediframe`, `#abyss-spotlight-backdrop` ausblenden, solange `html.lfx-js` aktiv ist.
