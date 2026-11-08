# DOM-Karte Jellyfin-Web 12.4 (Server 12.4.0)

Quellen:
- Quellcode `jellyfin/jellyfin-web` Tag `v12.4`, Commit `0a580ce8`. Ein lokaler Klon (nicht im Repo) liegt unter `%SCRATCHPAD%/jw/src/src/…`.
- Live-Prüfung im Testkonto am 2026-11-08. Live bestätigte Angaben sind mit ✅ markiert.

## Layout-Erkennung
- `html.layout-desktop | .layout-mobile | .layout-tv` (`components/layoutManager.js`). Eine eigene Modern-Klasse gibt es nicht. ✅
- **Modern** erkennt man an `header.MuiAppBar-root` (existiert nur im Modern-Layout) ✅. In CSS: `html:has(header.MuiAppBar-root)` bzw. per JS `html.lfx-modern` setzen.
- **TV** = `html.layout-tv`. Das TV-Layout läuft immer auf Legacy und hat den Header `.skinHeader` mit `.headerTop/.headerLeft/.headerRight` und `.headerTabs`.
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

## Fremd-Elemente auf Lorenz' Server (werden beim Release entfernt)
- Server-Custom-CSS mit `@import` von `ahza-code/Netflin` ist im Testkonto über „Server-CSS deaktivieren“ aus.
- `/web/ui/spotlight-loader.js` („Abyss Spotlight“) ist ins `index.html` eingebaut. Es erzeugt `iframe.featurediframe` in `#homeTab`, `#abyss-spotlight-backdrop`, `html.abyss-spotlight-visible` und `.abyss-spotlight-active`.
  - Im Dev-Loop neutralisieren: Iframe und Backdrop entfernen, Klassen abziehen und per CSS verstecken.
  - LenzFlix soll in Produktion zusätzlich defensiv `.featurediframe`, `#abyss-spotlight-backdrop` ausblenden, solange `html.lfx-js` aktiv ist.
