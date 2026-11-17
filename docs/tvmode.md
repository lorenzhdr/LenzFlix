# TV-Modus (`lfx=tv`, flix/plus/prime/retro) – Vertrag Hülle ↔ Engine ↔ CSS

Moderner TV-Modus im Stil eines IPTV-Webangebots als **eigene Vollseite `#/home?lfx=tv`** (wie „Neu und beliebt“), erreichbar über ein
TV-Symbol in der Kopfleiste (`ICON_TVMODE` in `core/icons.js`; flix: `features/tvbtn.js`, plus/prime im eigenen Kopf). Er nutzt Sender (18, Admin-Belegung 5–16),
deterministischen Plan und spurlosen Player aus dem geteilten Unterbau (Abschnitt „Geteilter Unterbau“ unten; bis 1.14.0 teilte er ihn mit dem Design „LENZ LIVE“, das mit 1.15.0 entfernt wurde), hat aber **keine Fernbedienung und keinen Röhren-Look**.
Gilt nur in `flix`, `plus`, `prime` und seit 1.13.0 `retro` (`TV_THEMES` in `features/tvmode/route.js`) auf Modern; nie auf `html.layout-tv`, nie in `store`.

**LENZ//84 (1.13.0):** TV-Symbol in `retro/header-ui.js` und der Topbar. Der Look kommt rein per CSS aus `src/css/themes/retro/tvmode.css` (Bundle `dist/lenzretro.css`; Details-Karte: `themes/retro/modal.css`): Bild ohne Scanlines/Vignette (1.13.1 entfernt, Feature `retro-tvlook` entfällt), Rauschen an `.lfx-tvm__player.is-loading`, Programmnummer per `content:"P" attr(data-tvm-no)`. Einzige Engine-Änderung: `tv/tvmode/player-view.js` `renderZap` setzt `data-tvm-no` (2-stellig). `retro/fx/index.js` `shouldRun` ist auf der TV-Route aus. Datensparmodus (Teil `tvwarm`) gilt wie in den anderen Designs.

Status: seit 1.10.0 vollständig umgesetzt und live getestet. Namen, Klassen und Signaturen hier sind bindend; die Wellen-/Eigentümer-Angaben (A, E, F, G, H, W1–W3)
sind Entstehungshistorie.

## Präfix, Dateibaum, Bundles
- Präfix **`lfx-tvm`** (`html.lfx-tv` heißt schon das TV-Layout). **Verboten** in allen TV-Modus-Dateien: die Klasse `.lfx-card` und das Attribut
  `data-lfx-id` (sonst fangen Modal, Hovercard und Kontextmenü die Klicks ab). Ebenso kein `lfx-live-*` (Build-Wächter: `lenztvmode.min.js` enthält nie `lfx-live-`).
- Dateien:

| Teil | Pfad | Ausgabe |
|---|---|---|
| Engine | `src/js/tv/tvmode/**` | lazy `dist/lenztvmode(.min).js` per `core/themejs.js` (Name `tvmode`), Global `window.LenzFlixTvMode` |
| CSS | `src/css/tvmode/{index,layout,player,list,epg,phone,designs}.css` | lazy `dist/lenztvmode(.min).css` per `core/addoncss.js` (`ensureAddonCss('lenztvmode')`, Klasse `lfx-addon-css`) |
| Kern-CSS (ca. 1 KB) | `src/css/js-ui/tvmode.css` (im Hauptbundle-CSS) | versteckt native Sektionen/Ladezustand unter `html.lfx-tvm-on` (Muster `js-ui/newpopular.css`) |
| Hülle | `src/js/features/tvmode/{route,page,prefs,unlock}.js` | im Hauptbundle (≤ ca. 8 KB min) |
| Server-deps, Katalog, Senderbelegung | `src/js/features/tvdata/{deps,data,zapflag,config}.js` (`buildApiDeps`, `loadUser`, `fatalText`) | Hauptbundle |
| Harness | `build/tvmode-dev.html`, `build/tvmode-dev.js` | über `serve` als `/tvmode-dev.html|js` |

- **Importgrenze:** Die Engine (`src/js/tv/tvmode/**`) importiert **nur** Dateien aus `src/js/tv/**` (und eigene). Erlaubt/vorgesehen:
  `schedule/*`, `player/*` (`index, stream, profile, tracks, video, watch, filler, events, fake, neighbors, warm`), `ui/{logos,overlay-util,fullscreen,zapstats}.js`.
  Hülle, `core/` und `shared/` importieren **nie** aus `src/js/tv/`. Alles Zustandsbehaftete (Jellyfin, Theme, Router, Prefs) kommt per `deps` von der Hülle.
- Seit 1.15.0 ist der TV-Modus der einzige Verbraucher von `src/js/tv/{schedule,player,ui}/**` (Gründe und Verträge: Abschnitt „Geteilter Unterbau“).
- **Prüfregel:** `dist/lenztvmode.min.js|css` bleiben bei Änderungen außerhalb des TV-Modus (Design-Features, Store, Kern-CSS …) byte-gleich (sha256 vor/nach vergleichen). Die unminifizierte `lenztvmode.js` enthält Pfadkommentare und ist deshalb kein Maßstab. Bewusste Änderungen am Unterbau (Planer, Player) ändern das Bundle und setzen die Basis neu.
- Build-Wächter (`build/build.mjs`): Hauptbundle enthält nie `__LFX_TVMODE_ENGINE__`; `lenztvmode.min.js` enthält nie `lfx-live-`; Warnung ab 128 KiB. Marker `__LFX_TVMODE_ENGINE__` steht in `src/js/tv/tvmode/entry.js`.
- Status: final umgesetzt und live getestet (1.10.0). Der frühere Stub aus W0 ist durch die echte Engine ersetzt.

## Global und `create`
```js
window.LenzFlixTvMode = { version: 1, create, mark: '__LFX_TVMODE_ENGINE__' }
create(host, deps, opts) → instance      // synchron; Planen läuft async (deps.onProgress / onReady / onFatal)
```
- `host`: `<div id="lfx-tvm" class="lfx-tvm">` der Hülle (Block im Fluss von `#homeTab`, kein `position:fixed`). Die Engine rendert alles hinein
  und setzt/entfernt die Zustands-Modifier **am Host** (siehe „DOM“). Das Host-Element gehört der Hülle.
- Katalog normalisieren, `createScheduler`, **alle 7 Tage vorab planen** (`scheduler.prepare([D … D+6])`, weil `schedule/index.js`
  einen ungültigen Plan der Sender 17/18 dauerhaft memoisiert), dann Controller + UI bauen, `deps.onReady()`. Fehler → `deps.onFatal(err)`.
- Die Engine hört auf `window` `lfx:play` (auch im Bild-in-Bild-Hintergrund) und stoppt dann (Stopp-Grund `lfx-play`).

### `instance` (Eigentümer: E, `entry.js`)
```js
{
  start(),            // = controller.start(); SYNCHRON in der Nutzergeste aufrufen (unlock + play). Spielt den letzten Sender (opts.lastChannel)
  stop(reason?),      // Stream stoppen (<video> leeren, DELETE /Videos/ActiveEncodings), UI und Plan bleiben; phase 'off'; meldet deps.onStopped({ reason })
  suspend() → boolean,// Seite verlassen. Ohne aktives Bild-in-Bild: stop('leave'), Timer aus, UI-Updates aus, → false (Hülle ruft danach dispose() oder
                      //   behält die Instanz zum Wiederverwenden). MIT aktivem PiP: Instanz läuft weiter, UI-Updates aus, das <video> liegt schon in
                      //   #lfx-tvm-bg, → true (Hülle behält die Instanz).
  resume(host),       // an einen (neuen) host hängen und UI neu rendern/andocken; startet NICHT von selbst (nach suspend()===false ruft die Hülle start()).
                      //   Bei laufendem PiP bleibt das <video> im Halter, bis PiP endet (dann zurück in den Slot).
  isOn() → boolean,   // Controller aktiv (phase ≠ 'off')
  isPip() → boolean,  // das <video> ist im Bild-in-Bild (document.pictureInPictureElement bzw. Safari webkitPresentationMode === 'picture-in-picture')
  dispose(),          // alles freigeben (Stopp, Listener, Timer, DOM von host leeren, #lfx-tvm-bg entfernen, video verwerfen, controller.dispose())
}
```
Die Instanz ist nach `dispose()` unbrauchbar. Es gibt **kein** `detachVideo()`/`attachVideo()` in der öffentlichen API mehr (das Umhängen macht `pip.js` intern).

### Bild-in-Bild (Spike S1, live in Chrome geprüft – verbindlich)
Befund: Jellyfin entfernt beim Wechsel zu `#/details` die komplette `#indexPage` samt `#homeTab`; bei einem Wechsel nur der Query auf `#/home` bleibt sie.
Bild-in-Bild übersteht `display:none`, das Umhängen des `<video>` an `body`, Seitenwechsel und das Zurückhängen.
Regel:
- Das `<video>` sitzt normal in `.lfx-tvm__video-slot`. Bei `enterpictureinpicture` (Safari: `webkitpresentationmodechanged` → `picture-in-picture`) hängt die
  Engine es **sofort** in den versteckten `body`-Halter `#lfx-tvm-bg` um. **Eigentümer des Halters ist die Engine-Instanz** (`pip.js`, E): sie legt ihn bei Bedarf an
  (`position:fixed; width:1px; height:1px; opacity:0; pointer-events:none`, nicht `display:none`) und entfernt ihn in `dispose()`. Die Hülle (H) legt ihn nie an.
- Der Slot zeigt dann die Karte „Läuft im Bild-in-Bild“ (`.lfx-tvm__pip-card`, F) mit Knopf „Zurückholen“ (`.lfx-tvm__btn--pip-back`, beendet PiP über `pip.exit()`).
- Bei `leavepictureinpicture`: ist die TV-Seite gemountet (host verbunden), wird das Video in den Slot zurückgehängt; sonst stoppt die Instanz (`dispose`, Stopp-Grund `pip-end`).
- `unmount` der Hülle stoppt sofort, **außer** PiP ist aktiv (`suspend()` → `true`): dann bleibt die Instanz bestehen und wird beim nächsten `mount` per `resume(newHost)` wieder angedockt.
- Stopp immer bei `!video.isConnected` (`detached`), bei `lfx:play`, bei der Route `/video` bzw. `#videoOsdPage:not(.hide)`, bei Design-Wechsel und `destroy()`.
- `tv/player/video.js` setzt `disablePictureInPicture = true`; die TV-Engine setzt es auf **ihrem eigenen** Element direkt nach `createPlayer` wieder auf `false`
  (keine Änderung an `video.js`). Der Pause-Abfang dort bleibt (beim linearen Programm gewollt).
- `pip.js` (E): `createPip({ doc, video, getSlot, onChange }) → { supported() , active(), enter(), exit(), toggle(), on(fn) → off, dispose() }`.
  Die Komponenten bekommen ihn als `opts.pip` (`app.js` reicht durch) und das Video als `opts.video`; sie hängen nie selbst um.

### `deps` (Hülle baut sie aus `features/tvdata/deps.js` + TV-eigenen Feldern)
Pflicht (Typen siehe „Geteilter Unterbau“): `catalog`, `user`, `server`, `request`, `streamUrl`, `imageUrl`, `getBoxSetItems`, `loadTrailer`, `setPlayed`,
`channelConfig`. Dazu:
```js
{
  imageUrl(id, { type?, maxWidth?, … }) → string,   // aus buildApiDeps (= core/api.js imageUrlFor); URL ohne api_key/Token (siehe „Bilder“)
  itemDetails(ids: string[]) → Promise<Map<id,{overview:string}>>,   // aus buildApiDeps (eine Anfrage, Fehler → leere Map); fehlt es, entfällt die Inhaltsangabe
  savePrefs(partial),                                // { volume, muted, lastChannel } → Hülle speichert pro Nutzer (lfx.tvm.<name>.<uid>)
  openDetails(itemId),                               // alle Designs: openModal(id, {overlay:true}) – Karte über dem weiterlaufenden TV (Bild und Ton laufen weiter)
  playFromStart(itemId),                             // TV-Stopp ist bereits erfolgt; Jellyfin-Player ab Anfang über core/playback.js play(item,{resume:false})
  keysBlocked() → boolean,                           // optional: Picker/Popover/Modal offen → keys.js greift nicht
  toast(text),                                       // optional
  onProgress(fraction, label), onReady(), onFatal(err),
  onStopped({ reason }),                             // Engine hat von sich aus gestoppt (reason siehe Stopp-Gründe), z. B. lfx-play im Hintergrund
  onPip(active: boolean),                            // PiP betreten/verlassen
}
```
`imageUrl` und `itemDetails` stehen in `buildApiDeps` (`features/tvdata/deps.js`); **Signatur dort maßgeblich** (`imageUrl: (id, o = {}) => api.imageUrlFor(id, o)`).
Der Controller selbst nutzt von `deps` nur `savePrefs` (optional) und reicht `deps` an `pickFiller` (`loadTrailer`) durch.
Nicht vorhanden: Design-/Dashboard-Rückrufe (`leaveToLibrary`, `previousThemeName`, `openThemePicker`, `openDashboard`, `logout`).
Fortschrittsmeldungen an Jellyfin gibt es nie (nur `setPlayed` über die Gesehen-Regel).

### `opts`
```js
{
  video: HTMLVideoElement | null,   // vorab in der Geste entsperrtes <video playsinline> (features/tvmode/unlock.js); null → Engine erzeugt eines
  lastChannel: 1..18,               // Standard 1
  volume: 0..1, muted: false,       // Controller rundet auf 5-%-Schritte (Werte > 1 gelten als Prozent)
  phone: false,                     // erzwingt is-phone (sonst Media Query <800 px)
  touch: false,                     // (pointer:coarse)
  now: null | (() => ms),           // Testuhr (Harness ?now=)
  fakePlayer: false,                // Harness: Testbild-Canvas statt Streams (player/fake.js)
  debug: false,                     // window.__lfxTvmDebug === true → window.__lfxTvm = { ctl, model, state }
}
```
Die Engine übernimmt `opts.video` (sonst erzeugt sie ein eigenes `<video playsinline>`; dann kann der Start stumm sein → „Ton an“), erzeugt
`createPlayer({ video, deps, now, fake })` und setzt danach **auf diesem `<video>`** `video.disablePictureInPicture = false` (siehe „Bild-in-Bild“).
Der Player gibt sein `<video>` nicht heraus; die Engine hält es und reicht es den Komponenten als `opts.video`.

### Ereignis `lfx:tvmode-intent`
Die TV-Symbole in den Kopfleisten (flix/plus/prime) feuern `window.dispatchEvent(new CustomEvent('lfx:tvmode-intent'))` **synchron im Click-Handler**, ohne
`preventDefault` (die Navigation läuft normal weiter). Die Hülle (`features/tvmode/unlock.js`) hört darauf, erzeugt **synchron** ein `<video playsinline>`, ruft
`play()` darauf auf (wie `unlock` in `tv/player/video.js`), merkt es sich und reicht es als `opts.video` an `create()`. Ohne Geste (Reload, direkter Link)
gibt es kein Intent-Video: die Engine erzeugt ihr eigenes, der Start kann stumm sein → „Ton an“. Ein nicht verbrauchtes Intent-Video verfällt nach ca. 30 s.

## Controller (`controller.js`, Welle A, fertig) – UI-frei
Der Code ist maßgeblich (Tests `tests/tvmode-controller.test.js`).
```js
import { createTvController, DEBOUNCE_MS, RETRY_MS, ERROR_TEXTS } from './controller.js'
createTvController({ scheduler, player, watch = null, pickFiller = null, deps = {}, now = Date.now, opts = {} }) → ctl
//   player: createPlayer()-Instanz · watch: createWatchTracker() oder null · pickFiller: Trailer/Karte oder null
//   opts: { lastChannel (Standard 1), volume (0..1; Werte > 1 = Prozent), muted }
//   deps: nur savePrefs({ lastChannel | volume | muted }) (optional, Fehler werden geschluckt) und Durchreichen an pickFiller
// Konstanten: DEBOUNCE_MS 250 · RETRY_MS 10000 (network-Neuversuch); intern, nicht exportiert: SYNC_MS 30000 · STALL_MS 60000
ctl = {
  start(),                       // SYNCHRON in der Geste: player.unlock(), dann Sender (lastChannel) sofort einschalten; idempotent
  stop(),                        // Stream stoppen, Timer aus; phase 'off' (kein Argument; den Stopp-Grund meldet die Engine selbst)
  tune(no, { immediate } = {}),  // Sender 1..18 (Umlauf per Modulo); entprellt 250 ms, immediate:true sofort. Gleicher Sender → nichts. Nur wenn on.
  zap(delta),                    // = tune(channel + delta); ArrowUp/Wischen hoch = +1, ArrowDown/Wischen runter = −1
  gesture(),                     // Nutzer hat getippt: player.unlock() synchron; hebt mutedByPolicy auf; bei needsTap neuer Versuch („Zum Starten tippen“/„Ton an“)
  retry(),                       // nach Fehlerkarte neu versuchen
  setVolume(v),                  // v in PROZENT 0..100, gerundet auf 5er-Schritte; hebt mutedByPolicy auf; speichert { volume: 0..1, muted }
                                 //   ohne volumeSupported (iOS): nur stumm/laut (v < aktuell = stumm), Meldung per 'message'
  setMuted(b), toggleMute(),     // toggleMute hebt bei mutedByPolicy zuerst nur die Autoplay-Sperre auf (Ton an), erst der nächste Aufruf schaltet stumm
  get volumeSupported,           // boolean (false = keinen Lautstärke-Regler rendern, nur Stumm-Knopf)
  tracks() → { audio, subs, audioIndex, subtitleIndex },   // wie Player.tracks(); ohne Player leer ({ [], [], null, -1 })
  setAudio(index) → Promise, setSubtitle(index | -1) → Promise,   // Fehler → 'message'
                                 //   setAudio nutzt `keepOnFail`: ist die Spur nicht auflösbar, bleibt das laufende Bild unverändert
                                 //   (Ergebnis { ok:false, reason }, Meldung „Diese Tonspur ist nicht verfügbar“, kein 'error'-Ereignis)
  restartTarget() → { itemId, type, seriesId } | null,     // Sendung der aktuellen Ansicht (snapshot.entry); type 'movie'|'episode'|Katalogart; null bei Pause/Sendeschluss/aus
  state() → Snapshot,            // eingefroren (Object.freeze); wird nach jedem 'change' neu gebaut
  on(event, fn) → off,           // 'change' (Snapshot) | 'message' (string) | 'tick' (ms, 1/s) | 'day' (Sendetag D, Wechsel um 05:00)
  dispose(),                     // stop(), Timer/Listener weg, ruft watch.dispose() UND player.dispose() auf
}
Snapshot = {                     // alle Felder immer vorhanden
  on: boolean,
  channel: number,               // Sendernummer 1..18 (NICHT das Channel-Objekt; Senderkopf über model.nowAll bzw. scheduler.channels(D))
  entry: PlanEntry | null,       // Ansicht: aktuelle Sendung. Bei Zappen-Entprellung gilt phase 'loading' und entry ist nur eine VORSCHAU des neuen Senders
                                 //   (restartTarget bezieht sich auf diese Ansicht); null wenn aus
  phase: 'off' | 'loading' | 'playing' | 'pause' | 'closedown' | 'error',
  reason: null | 'network' | 'gesture' | 'browser' | 'video' | 'audio' | 'empty',
  card: null | Card,             // Zustandskarte im Player; null bei loading/playing
  banner: null | string,         // KEINE Zapp-Einblendung: nur Hinweistext bei fill/nightfill ('Füllprogramm' bzw. entry.label / 'Füllprogramm – reguläres Programm ab 5:00')
  needsTap: boolean,             // Wiedergabe braucht eine Geste (error mit reason 'gesture')
  mutedByPolicy: boolean,        // Autoplay nur stumm erlaubt → UI zeigt deutliches „Ton an“ (ctl.gesture() oder toggleMute() hebt auf)
  volume: number,                // 0..100 (Prozent, 5er-Schritte)
  muted: boolean,                // = Nutzer-Stumm ODER mutedByPolicy
}
Card =                           // eingefroren; das Feld `kind` bestimmt die Form
  { kind: 'next',      title: string, at: 'HH:MM', atMs: number }        // phase 'pause' mit Folgesendung („Gleich: <title> um <at>“)
| { kind: 'pause',     text: 'Gleich geht es weiter' }                    // phase 'pause' ohne Folgetitel
| { kind: 'closedown', text: 'Sendepause', until: 'HH:MM' }              // phase 'closedown' („Sendepause – weiter um <until>“)
| { kind: 'empty',     text: 'Auf diesem Sender läuft gerade nichts' }   // phase 'closedown', reason 'empty'
| { kind: 'error',     reason, title, sub }                              // phase 'error'; Texte aus ERROR_TEXTS (reason 'gesture' = „Zum Starten tippen“)
```
- **Die Zapp-Einblendung gibt der Controller nicht vor.** `player-view.js` (F) blendet sie ca. 4 s lang ein, sobald sich `snap.channel` ändert oder `start()` den ersten Sender
  schaltet (Daten aus `snap.channel` + `snap.entry` über `model.describe`/`nowAll`; Fortschrittsbalken aus `tick`). Sie erscheint auch in `phase 'loading'` (Vorschau-Eintrag).
- Karten-Klassen: `lfx-tvm__card--next|--pause|--closedown|--empty|--error`; bei `kind 'error'` mit `reason 'gesture'` zusätzlich `lfx-tvm__card--tap` (Tippen = `ctl.gesture()`),
  sonst „Erneut versuchen“ → `ctl.retry()`. `reason 'network'` versucht nach 10 s selbst neu.
- Ablauf im Controller: Entprellung, Umlauf, Generationszähler, `armAdvance`, Füller/Trailer, `closedown`/`empty` (kein Testbild,
  keine Musik), Autoplay (`autoplay-muted` → `mutedByPolicy`), Takt 1 s mit `watch.tick`, `syncTo` alle 30 s, Tageswechsel 05:00 (`'day'`, plant dann die 7 Tage nach),
  Gesehen-Zählung (Stillstand > 60 s wird verworfen). **Keine Fortschrittsmeldung, kein „Weiterschauen“.**
- Den Stopp-Grund ergänzt die Engine: `instance.stop(reason)` → `ctl.stop()` + `deps.onStopped({ reason })`.

## Modell (`model.js`, Welle A, fertig) – rein, kein DOM
Reine Funktionen auf der Scheduler-API (kein `createModel`, kein `time`-Argument); `scheduler` ist immer das erste Argument.
```js
import { nowAll, gridRows, describe, days, nextProgram, titleOf, kindOf, KIND } from './model.js'
nowAll(scheduler, t) → [{ channel, entry, progress /*0..1*/, next /*PlanEntry|null, ohne Füller*/ }]   // 18 Einträge nach no; Sender aus scheduler.channels(Sendetag von t)
gridRows(scheduler, { from, to, D?, now? }) → [{ channel, cells: [{ entry, start, end, title, sub, kind, now }] }]
//   Fenster [from,to) in ms; start/end sind AUF DAS FENSTER ZUGESCHNITTEN (Originalzeiten: cell.entry.start/end); D = Sendetag der Senderköpfe (Standard: Tag von from);
//   `now:true` an der laufenden Zelle, wenn opts.now gesetzt; kind = 'program'|'fill'|'filler'|'closedown'; title/sub fertig formatiert (Füller „Gleich: …“/„Kurze Pause“)
describe(scheduler, no, entry, t, { overviews? }) → {
  title, sub, time: '20:15–22:05', progress /*0..1*/, badges: string[], kind, itemId, seriesId,
  imageItemId, overview, year, genres: string[], runMin
}
//   imageItemId: bei Folgen die Serien-Id, sonst die itemId der Sendung; null ohne Katalogtitel (Füller, Sendepause)
//   overview: '' außer item.overview oder opts.overviews (Map id → Text) liefert sie → Komponenten reichen ihre Inhaltsangaben-Map durch (siehe „Inhaltsangaben“)
days(t) → [{ D, label }] ×7     // ab Sendetag von t: 'Heute', 'Morgen', dann 'Fr 14.11.'
nextProgram(scheduler, no, entry) → PlanEntry | null   // überspringt Füller (max. 4 Schritte)
titleOf(scheduler, entry) → { title, sub }             // Serie: Serienname + 'S1 E3 · Folgentitel'
kindOf(entry) → 'program'|'fill'|'filler'|'closedown';  KIND = { program, fill, nightfill→'fill', filler, closedown }
```
Zeit/Tage kommen aus `schedule/time.js` (`formatClock`, `formatDay`, `broadcastDayOf`). Es gibt kein `model.channels()`/`model.item()`: Sender über `scheduler.channels(D)`.
**Bindung für Komponenten:** `app.js` (E) baut `bindModel(scheduler)` und übergibt den Komponenten ein `model` mit denselben Namen **ohne** das erste Argument
(`model.nowAll(t)`, `model.gridRows({…})`, `model.describe(no, entry, t, opts)`, `model.nextProgram(no, entry)`, `model.titleOf(entry)`, `model.days(t)`, `model.kindOf`)
plus `model.channels(D)` (= `scheduler.channels(D)`) und `model.item(id)` (= `scheduler.item(id)`). Komponenten importieren `model.js` nie selbst.

## Ziffern (`digits.js`, Welle A, fertig)
```js
createDigits({ onCommit(no), onPreview(text|null), onInvalid?(text), now = Date.now, timeoutMs = 1500 }) → { push(d), clear(), pending(), dispose() }
```
Verhalten: `0` wartet auf die zweite Ziffer (Timeout verwirft), `1` wartet (Timeout schaltet Sender 1), `2`–`9` sofort; zweite Ziffer 1–18 gültig, sonst `onInvalid('Dieser Sender existiert nicht')`.
`push` gibt den offenen Puffer zurück (`''` = abgeschlossen); `onPreview('1_')` zeigt die Eingabe, `onPreview(null)` leert sie. `keys.js` (E) besitzt die Instanz (`onCommit` → `ctl.tune(no, { immediate: true })`,
`onInvalid` → Toast); die Anzeige `.lfx-tvm__digits` rendert `player-view.js` (F) über `opts.digits` (`{ on(fn(text|null)) → off }`, von `app.js` aus `onPreview` verdrahtet).

## Komponentenschema (UI)
Jede Komponente (E/F/G) ist eine Fabrik:
```js
createX({ doc, ctl, model, deps, opts }) → { el: HTMLElement, update(snap), tick(t), destroy() }
```
- `doc`: Document (`host.ownerDocument`); `ctl`: Controller; `model`: an den Scheduler gebundenes Modell (siehe „Modell“); `deps`: die Engine-deps (nur lesen, z. B. `imageUrl`, `openDetails`,
  `playFromStart`, `toast`); `el` ist **nicht** eingehängt (das macht `app.js`).
- `opts` (von `app.js` pro Komponente zusammengestellt, nur was gebraucht wird): `video` (das `<video>`), `pip` (`pip.js`), `digits` (Vorschau-Quelle), `details` (`details.js`),
  `phone`/`touch` (Booleans), `fullscreen` (`ui/fullscreen.js`-Schalter `{ toggle(), active() }`), `onInfo(itemId|entry)` (G: Info-Karte öffnen), `getNow()` (Uhr der Engine).
- `update(snap)` wird bei jedem `'change'` aufgerufen, `tick(t)` einmal pro Sekunde (`'tick'`, ms). Komponenten halten **keinen** eigenen Zustand außer UI-Zustand
  (z. B. Tab, Tag) und rufen nur `ctl.*`/`deps.*` auf. `destroy()` entfernt alle Listener/Observer/Timer (auch IntersectionObserver).
- Alle Texte auf Deutsch. Keine Markennamen.

### Layout-Umschaltung (wer setzt `is-phone`/`is-landscape`)
Nur `app.js` (E) setzt am Root `is-phone` (`opts.phone` **oder** `matchMedia('(max-width: 799px)')`) und `is-landscape` (nur mit `is-phone`:
`matchMedia('(orientation: landscape) and (max-height: 500px)')`) per `change`-Listener der `MediaQueryList`en; `destroy()` entfernt Listener und Klassen. Das CSS (E/F/G) schaltet das Layout
**ausschließlich** über `.is-phone`/`.is-landscape` am Root um (kein eigenes `@media` für Layout (einzige dokumentierte Ausnahme: die Senderliste lässt bis ca. 1466 px Fensterbreite das Sender-Badge weg, `src/css/tvmode/list.css`)). Komponenten, die das wissen müssen (z. B. Wischen nur bei Touch), lesen `opts.phone`/`opts.touch`
bzw. prüfen die Root-Klasse bei Bedarf; Wischgesten nur bei `pointerType === 'touch'`.

### Gemeinsame Helfer (Eigentümer G; E und F importieren sie)
- **`details.js`** (G): Inhaltsangaben. `createDetails({ deps, delayMs = 400 }) → { get(id) → string | undefined, request(id, immediate?), map() → Map<id,string>, on(fn(id, text)) → off, dispose() }`.
  Der Katalog hat keine Inhaltsangaben; `request(id)` lädt `overview` über `deps.itemDetails([id])`. Pro Instanz per Id gecacht (auch leere Antworten, kein Wiederholen); `request` entprellt
  400 ms und überschreibt eine noch wartende Id (**max. eine Anfrage je Zappen**); `request(id, true)` lädt sofort, ohne die wartende Id der Infoleiste zu verdrängen (die Info-Karte nutzt das); fehlt `deps.itemDetails`, tut es nichts. `map()` wird als `opts.overviews` an `model.describe` gereicht.
  Eine Instanz je Engine (`app.js` erzeugt sie, reicht sie als `opts.details` an `info.js` und `info-card.js`/`channel-list.js`).
- **`thumb.js`** (G): 16:9-Vorschaubild. `createThumb({ doc, deps }) → { el, set(imageItemId, channelNo), destroy() }`; Regeln siehe „Bilder“.

Alle Dateien der Tabelle sind umgesetzt (Spalte „Welle“ = Entstehungshistorie).

| Datei (`src/js/tv/tvmode/`) | Welle | Zuständigkeit |
|---|---|---|
| `controller.js`, `model.js`, `digits.js` (+ `tests/tvmode-*.test.js`) | A | fertig: Zustandsautomat, Plan-Modell, Ziffern-Eingabe |
| `entry.js` | E | Boot, `create()`, `lfx:play`-Listener, Instanz-API, Marker, Halter-Aufräumen in `dispose` |
| `app.js` | E | Gerüst/Grid, Root-Modifier (`is-phone`, `is-landscape`, `is-touch`, `is-on`, `is-playing`, `is-paused-card`, `is-error`, `is-pip`, `is-fullscreen`, `is-tab-*`), `matchMedia`, Tabs (`__tabs`, nur Handy), `bindModel`, Verdrahtung aller Komponenten, Toast, Info-Karte öffnen/schließen |
| `pip.js` | E | Bild-in-Bild-Steuerung (`createPip`), Halter `#lfx-tvm-bg`, Umhängen, `isPip` |
| `keys.js` | E | Tastatur: ↑/↓ (und PageUp/Down) zappen, Ziffern (`createDigits`), `M` Stumm, `F` Vollbild; greift nur, wenn der Fokus im Root oder auf `body` liegt und `deps.keysBlocked()` nicht gilt |
| `info.js` | E | Info unter dem Player (`__info`) inkl. Knöpfen [Von vorne] [Details] (seit 1.10.1 ohne eigenen Bild-in-Bild-Knopf); Aktionen über `deps.playFromStart(itemId)`/`deps.openDetails(itemId)` (Ziel = `ctl.restartTarget().itemId`) |
| `player-view.js` | F | `<video>`-Slot (`opts.video`), Ladezustand, Zustandskarten, „Ton an“, PiP-Karte „Läuft im Bild-in-Bild“, **Zapp-Einblendung** (≈ 4 s), **Wischgesten** (nur Touch: hoch = `ctl.zap(1)`, runter = `ctl.zap(-1)`), Ziffernanzeige, Klick/Tippen blendet Bedienung ein (`is-controls`) |
| `controls.js` | F | Leiste: Stumm/Lautstärke, Ton/Untertitel-Knopf, **Bild-in-Bild-Knopf `--pip`**, Vollbild |
| `track-menu.js` | F | Popover für Ton- und Untertitelwahl |
| `channel-list.js` | G | Senderliste „Jetzt im TV“ (Nummer, Badge `ui/logos.js`, 16:9-Bild, Titel, Fortschritt, „Danach“) |
| `epg-grid.js` | G | Programm-Raster (Tagesauswahl 7 Tage, „Jetzt“-Knopf, Tage lazy gerendert, Handy-Variante: Sender links fest, Zeit quer) |
| `info-card.js` | G | Info-Karte zu einer nicht laufenden Sendung (Bild, Zeit, Inhaltsangabe, [Details], [In der Mediathek ansehen]) |
| `details.js`, `thumb.js` | G | gemeinsame Helfer (siehe oben) |

CSS (`src/css/tvmode/`): `index.css` (nur `@import`s, Reihenfolge = Kaskade) und `layout.css`, `phone.css`, `designs.css` → E;
`player.css` → F; `list.css`, `epg.css` → G. Hülle/Kern-CSS (`features/tvmode/*`, `css/js-ui/tvmode.css`) → H.
Jede Datei hat genau einen Eigentümer; fehlt einem Worker Klasse oder Funktion einer fremden Datei, Rücksprache statt Fremd-Edit. Die Klassen unter „DOM“ gehören der Datei
(= dem Worker), die den jeweiligen Teil rendert; das zugehörige CSS steht in der CSS-Datei desselben Workers. Gemeinsame Bausteine (`__btn`, `__badge`, `__spinner`) definiert E in `layout.css`.

### Bilder (Vorschau 16:9)
- `describe().imageItemId` ist bei Folgen die Serien-Id, sonst die `itemId` der Sendung (`null` ohne Katalogtitel → direkt Platzhalter).
- URL über `deps.imageUrl(id, { type, maxWidth })` (= `imageUrlFor`; Signatur siehe `features/tvdata/deps.js`). Reihenfolge der Typen: **`Thumb` → `Backdrop` → `Primary`**, `maxWidth` 480
  (Liste/Karte; Info-Karte 960). Bei `onerror` des `<img>` wird der nächste Typ versucht; nach dem letzten ein Platzhalter: `.lfx-tvm__thumb--ph` mit Hintergrund
  `channelColor(no)` aus `ui/logos.js` (Textfarbe `channelInk(no)` nach WCAG-Kontrast: `#1a1a1a` oder `#ffffff`) und Sendernummer. Das Ergebnis wird je `id` im `thumb.js` gemerkt (kein erneutes Durchprobieren).
- **Bild-Kennung `tag`** (Browser-Cache, Server antwortet mit `max-age=31536000, immutable`; ohne `tag` nur `public` = Rückfrage je Anzeige): Die Hülle (`features/tvdata/deps.js` `taggedImageUrl`) ergänzt `tag` aus dem Katalog (`features/tvdata/data.js`: Filme/Serien laden `ImageTags` Thumb/Primary + erstes `BackdropImageTags`; Folgen nutzen die Serien-Id). Unbekannt (z. B. Cache-Eintrag von vor 1.11.8, Typ fehlt) → URL ohne `tag`, nie `null` (sonst Platzhalter statt Typ-Fallback).
- Bild-URLs ohne `api_key`/Token (CLAUDE.md): niemals `streamUrl`, nie `ApiKey`/`api_key` anhängen oder loggen; die Bild-Endpunkte sind ohne Schlüssel erreichbar.
- Lazy: `loading="lazy"`/`IntersectionObserver` in der Liste; Rasterzellen haben keine Bilder.

### Inhaltsangaben
Der Katalog hat keine. Info-Bereich (`info.js`) und Info-Karte (`info-card.js`) rufen `opts.details.request(id)` (siehe `details.js`: Cache je Instanz, 400 ms Entprellung,
höchstens eine Anfrage je Zappen; die Info-Karte ruft `request(id, true)` = sofort) und zeigen `details.get(id)` bzw. lassen den Text leer; bei der Antwort (`details.on`) aktualisieren sie sich. Id = `describe().itemId`
(bei Folgen die Folgen-Id, die den eigenen Text hat; **nicht** `imageItemId`).


## DOM und BEM-Klassenverzeichnis
Block `lfx-tvm`; Elemente `lfx-tvm__x`; Modifier als `is-*` (Zustand) bzw. `lfx-tvm__x--y` (Variante). Daten in `data-*` nur mit Präfix `data-tvm-*`.

### Root (= `host`, `#lfx-tvm`) und Zustands-Modifier
| Klasse | gesetzt von | Bedeutung |
|---|---|---|
| `lfx-tvm` | Hülle | Root |
| `is-loading` | Hülle | Engine/Plan noch nicht bereit („Sendersuchlauf“); entfernt bei `onReady` |
| `is-phone` | E (app.js) | Handy-Layout: `opts.phone` oder `matchMedia('(max-width: 799px)')` (einzige Quelle für CSS; kein eigenes `@media` für Layoutumschaltung (einzige dokumentierte Ausnahme: die Senderliste lässt bis ca. 1466 px Fensterbreite das Sender-Badge weg, `src/css/tvmode/list.css`)); Aufräumen in `destroy()` |
| `is-landscape` | E | nur zusammen mit `is-phone`: `matchMedia('(orientation: landscape) and (max-height: 500px)')`; Player füllt den Schirm |
| `is-touch` | E | `opts.touch` |
| `is-on` | E | `snap.on` |
| `is-playing`, `is-paused-card` | E | `snap.phase === 'playing'` bzw. Zustandskarte sichtbar (`pause`/`closedown`/`error`) |
| `is-error` | E | `phase 'error'` |
| `is-pip` | E | Video ist im Bild-in-Bild (`pip.active()`) |
| `is-fullscreen` | E | Player im Vollbild (`ui/fullscreen.js`) |
| `is-tab-now`, `is-tab-epg` | E | aktiver Handy-Tab (genau eine; auf dem Desktop ohne Wirkung) |

Zustände, die F selbst verwaltet, stehen **am Element `.lfx-tvm__player`** (F darf den Root nicht anfassen): `is-zapping` (Zapp-Einblendung sichtbar, ≈ 4 s), `is-controls`
(Bedienleiste sichtbar: Maus/Tippen, danach ca. 3 s), `is-muted` (`snap.muted`), `is-pip` (Spiegel von `pip.active()`, für die PiP-Karte). CSS-Selektoren dafür beginnen mit `.lfx-tvm__player.is-…`.

### Gerüst (E)
```
.lfx-tvm
  .lfx-tvm__stage                    // Grid (Desktop: links Haupt, rechts Liste; darunter EPG über volle Breite)
    .lfx-tvm__main                   // linke Spalte: Player + Info
      .lfx-tvm__player               // 16:9 (Handy: sticky oben); Vollbild-Ziel   → F füllt
      .lfx-tvm__info                 // → E (info.js)
    .lfx-tvm__side                   // rechte Spalte (Desktop) bzw. Bereich unter Info (Handy)
      .lfx-tvm__tabs[role=tablist]   // nur Handy sichtbar; Tabs: .lfx-tvm__tab.lfx-tvm__tab--now „Jetzt im TV“, .lfx-tvm__tab.lfx-tvm__tab--epg „Programm“ (+ is-active, aria-selected)
      .lfx-tvm__list                 // → G (channel-list.js); Handy nur bei is-tab-now
    .lfx-tvm__epg                    // → G (epg-grid.js); Desktop immer, Handy nur bei is-tab-epg
  .lfx-tvm__infocard                 // → G (info-card.js), Overlay-Dialog über allem (role=dialog)
  .lfx-tvm__toast                    // kurzer Hinweis (ctl 'message')
```
**Desktop-Layout (final, Nutzerentscheidung):** Player 16:9 links, Senderliste rechts (Zeile = Nummer, Sender-Badge, kleines 16:9-Bild, Titel, Fortschritt, „Danach“), unter dem Player der
Info-Bereich mit den Knöpfen [Von vorne] [Details] (Bild-in-Bild nur in der Player-Leiste), darunter direkt das EPG-Raster über die volle Breite **ohne Tabs**, mit Tagesauswahl (7 Tage) und „Jetzt“-Knopf. Bis ca. 1466 px Fensterbreite (Seitenleiste schmaler als 440 px) entfällt das Sender-Badge in der Senderliste (Spalten `28px 132px 1fr`, damit die Titel lesbar bleiben; vom Nutzer am 16.11.2026 bestätigt).
Umsetzung: `.lfx-tvm__stage` Grid mit zwei Spalten `minmax(0, 1fr) clamp(320px, 30vw, 440px)`, `gap: var(--lfx-gutter)`; `__main` links, `__side` rechts
(Höhe an `__main` gebunden, Liste scrollt intern); `__epg` darunter über die volle Breite (`grid-column: 1 / -1`); `__tabs` ist auf dem Desktop `display:none`, Liste und EPG sind immer sichtbar.
**Handy hochkant** (`is-phone`): eine Spalte; `__player` `position: sticky; top: var(--lfx-header-h)` (16:9), darunter `__info`, dann `__tabs` ([Jetzt im TV] [Programm], nur Handy), dann je nach Tab
(`is-tab-now`/`is-tab-epg`) die Liste bzw. das Raster (Sender links fest, Zeit quer wischbar). Wischen hoch/runter im Player zappt (nur Touch). Zapp-Einblendung ca. 4 s im Bild.
Querformat (`is-phone is-landscape`): `__player` füllt den Schirm (`position: fixed; inset: 0`, höchstes `z-index` unter Jellyfin-Dialogen), alles andere (`__info`, `__side`, `__epg`, `__tabs`) ausgeblendet.
Root-Hintergrund `var(--lfx-bg)`, oberer Abstand für die Kopfleiste `var(--lfx-header-h)`; Seite kann scrollen.

### Player (F)
```
.lfx-tvm__player
  .lfx-tvm__video-slot               // Platzhalter; nimmt das <video> auf (nie lfx-live-video)
    video.lfx-tvm__video
  .lfx-tvm__loading                  // Spinner/„Sendersuchlauf“; sichtbar bei phase 'loading'
  .lfx-tvm__card.lfx-tvm__card--next|--pause|--closedown|--empty|--error (+ --tap bei error/gesture)   // Zustandskarte (snap.card.kind, Formen siehe „Controller“)
    .lfx-tvm__card-title / .lfx-tvm__card-text / .lfx-tvm__card-actions (> .lfx-tvm__btn „Erneut versuchen“)
  .lfx-tvm__pip-card                 // „Läuft im Bild-in-Bild“ (sichtbar bei pip.active(), deckt den Slot)
    .lfx-tvm__pip-card-text / .lfx-tvm__btn.lfx-tvm__btn--pip-back „Zurückholen“ (→ opts.pip.exit())
  .lfx-tvm__unmute                   // „Ton an“-Knopf (snap.mutedByPolicy), deutlich; Desktop mittig-oben (fest, springt nicht, nie von Zapp-Karte/Leiste verdeckt), Handy unten (→ ctl.gesture())
  .lfx-tvm__zap                      // Zapp-Einblendung (≈ 4 s nach Kanalwechsel/Start, Daten aus snap.channel + snap.entry), oben links; is-zapping am .lfx-tvm__player
    .lfx-tvm__zap-no / .lfx-tvm__zap-name / .lfx-tvm__zap-title / .lfx-tvm__zap-time
    .lfx-tvm__zap-bar > .lfx-tvm__zap-fill      // Breite in % per style.width
  .lfx-tvm__digits                   // Ziffern-Eingabe (Vorschau '1_' aus opts.digits), oben rechts
  .lfx-tvm__controls                 // Leiste unten (is-controls am Root)
    .lfx-tvm__btn.lfx-tvm__btn--mute / --audio / --subs / --pip / --fullscreen     // je Icon-Knopf mit aria-label
    .lfx-tvm__volume                 // <input type=range class="lfx-tvm__range">; bei iOS (kein Lautstärke-Support) nicht gerendert
  .lfx-tvm__menu.lfx-tvm__menu--audio|--subs      // track-menu.js (Popover über der Leiste), Einträge .lfx-tvm__menu-item (+ is-active)
```

### Info unter dem Player (E, `info.js`)
```
.lfx-tvm__info
  .lfx-tvm__info-head                // .lfx-tvm__info-no („12“), Logo (ui/logos.js createLogo), .lfx-tvm__info-chan (Sendername)
  .lfx-tvm__info-title / .lfx-tvm__info-sub (Folge, Jahr, Dauer, Genres)
  .lfx-tvm__info-time                // „20:15 – 21:45“
  .lfx-tvm__info-bar > .lfx-tvm__info-fill
  .lfx-tvm__badges > .lfx-tvm__badge // describe/badges: „Premiere“, „Neue Folge“, „Wdh.“, „ab 16“
  .lfx-tvm__info-text                // kurze Inhaltsangabe (opts.details, lazy über deps.itemDetails)
  .lfx-tvm__info-actions             // .lfx-tvm__btn.lfx-tvm__btn--restart „Von vorne“, --details „Details“
```
Knöpfe `--restart`/`--details` sind deaktiviert (`disabled`), wenn `ctl.restartTarget()` null ist (Pause/Sendeschluss); Aktionen: `deps.playFromStart(target.itemId)` bzw. `deps.openDetails(target.itemId)`.
Seit 1.10.1 gibt es unter dem Player keinen eigenen Bild-in-Bild-Knopf mehr (Nutzerwunsch): Bild-in-Bild nur über `--pip` in der Leiste (`controls.js`).

### Senderliste (G, `channel-list.js`)
```
.lfx-tvm__list
  .lfx-tvm__row (button, role=option; is-current, is-loading-img)     // eine Zeile je Sender
    .lfx-tvm__row-no               // Nummer
    .lfx-tvm__row-logo             // Sender-Badge (ui/logos.js)
    .lfx-tvm__row-thumb            // enthält thumb.js (.lfx-tvm__thumb > img, 16:9, lazy per IntersectionObserver; Regeln siehe „Bilder“; Platzhalter .lfx-tvm__thumb--ph)
    .lfx-tvm__row-body
      .lfx-tvm__row-title / .lfx-tvm__row-sub
      .lfx-tvm__row-bar > .lfx-tvm__row-fill
      .lfx-tvm__row-next           // „Danach: <Titel> 21:45“
```
Klick → `ctl.tune(no, { immediate: true })`.

### Programm-Raster (G, `epg-grid.js`)
```
.lfx-tvm__epg
  .lfx-tvm__epg-head
    .lfx-tvm__epg-days > .lfx-tvm__day (button; is-active)      // 7 Tage (time.formatDay: Mo 11.11.)
    .lfx-tvm__epg-now (button „Jetzt“)                            // springt zur aktuellen Zeit/zum aktuellen Tag
  .lfx-tvm__epg-scroll               // scrollt horizontal (Zeit) und vertikal
    .lfx-tvm__epg-scale > .lfx-tvm__epg-hour                      // Zeitleiste, eine Marke je Stunde
    .lfx-tvm__epg-rows > .lfx-tvm__epg-row (je Sender, is-current-channel)
      .lfx-tvm__epg-chan           // Sender links fest (position: sticky; left: 0): Nummer + Badge
      .lfx-tvm__epg-track          // Zellen absolut positioniert (left/width aus Zeit)
        .lfx-tvm__epg-cell (is-current | is-past; --filler für filler/fill/nightfill, --closedown)
          .lfx-tvm__epg-cell-title / .lfx-tvm__epg-cell-time
    .lfx-tvm__epg-nowline          // senkrechte Jetzt-Linie
```
Klick auf eine laufende Zelle (`cell.now`) → `ctl.tune(no, { immediate: true })` (Umschalten); jede andere Zelle öffnet die Info-Karte (`opts.onInfo`) mit
[Details] und [In der Mediathek ansehen]. Zellen kommen aus `model.gridRows(…, { now })`; Zeitachse pro Tag (Sendetag 05:00–05:00), Tage lazy gerendert.
Tastatur im Raster: Roving Tabindex (nur eine Zelle ist Tab-Stopp, `tabIndex 0`, folgt dem Fokus). Pfeil links/rechts bewegt den Fokus innerhalb des Senders, hoch/runter zum Sender darüber/darunter (Zelle zur selben Zeit). Die Pfeile bewegen nur den Fokus und bleiben am Rand stehen (kein Zappen, `stopPropagation` gegen `keys.js`).

### Info-Karte (G, `info-card.js`)
Z-Ebene: `--lfx-tvm-z-full` + 2 (1292), über Kopfleisten und Tabbars, unter Dialogen (1300).
```
.lfx-tvm__infocard (role=dialog, aria-modal; is-open)
  .lfx-tvm__infocard-backdrop
  .lfx-tvm__infocard-box
    .lfx-tvm__infocard-img           // enthält thumb.js (16:9, Bildtyp-Fallback wie „Bilder“)
    .lfx-tvm__infocard-title / .lfx-tvm__infocard-time (Sender, Tag, Uhrzeit) / .lfx-tvm__infocard-text (Inhaltsangabe)
    .lfx-tvm__infocard-actions       // .lfx-tvm__btn „Details“ (deps.openDetails) und „In der Mediathek ansehen“ (deps.playFromStart)
    .lfx-tvm__infocard-close         // Schließen (Esc, Backdrop)
```
Gemeinsame Bausteine: `.lfx-tvm__btn` (Knopf; Varianten `--primary`, `--ghost`, `--icon`), `.lfx-tvm__badge`, `.lfx-tvm__spinner`.

### Hülle (H)
`#lfx-tvm` (Root), `html.lfx-tvm-on` (aktive TV-Seite; versteckt per Kern-CSS native `#homeTab`-Sektionen),
`.lfx-tvm__fallback` mit `.lfx-tvm__fallback-text` und `.lfx-tvm__fallback-actions` („Erneut versuchen“, „Zur Startseite“) bei Ladefehler.

## Hülle `features/tvmode/` (Welle H)
- `route.js`: `ROOT_ID = 'lfx-tvm'`, `ON_CLASS = 'lfx-tvm-on'`; Route `#/home?lfx=tv` (`tvModeHref`, `isTvModeRoute` aus `shared/routes.js`, `'tv'` ist in `KINDS`).
- `page.js`: nach dem Muster `features/newpopular.js` (Mount in `#homeTab` per Poll, Neu-Einhängen bei Ersetzen des Tabs). Match:
  `lfx==='tv' && TV_THEMES.some(isTheme) && isModern() && !isTv() && isReady()`. Lazy: `ensureAddonCss('lenztvmode')` + `ensureThemeJs('tvmode')`.
  Exportiert `destroyTvMode()` (für `main.js` und Design-Wechsel).
- `prefs.js`: Schlüssel `lfx.tvm.<name>.<uid>` für `volume`, `muted`, `lastChannel`.
- `unlock.js`: hört auf `window` `lfx:tvmode-intent` (siehe „Ereignis `lfx:tvmode-intent`“), erzeugt synchron ein `<video playsinline>`, ruft `play()` auf, merkt es sich (`takeIntentVideo()`) und
  die Hülle reicht es als `opts.video` an `create()`. Ohne Geste: Engine-eigenes Video, Start ggf. stumm mit „Ton an“. Die TV-Symbole (W1-B/C/D) feuern nur das Ereignis (ohne `preventDefault`) und navigieren normal.
- Nach `onReady` ruft die Hülle `instance.start()` (bei Intent-Video noch in der Geste unmöglich; das Intent-Video ist bereits entsperrt, `ctl.start()` ruft zusätzlich `player.unlock()`).
- Bild-in-Bild: Die Hülle besitzt **keinen** Halter; `unmount` ruft `suspend()`: `true` → Instanz behalten (keine Teardown-Aktionen außer UI abhängen), `false` → `dispose()`; nächstes `mount` mit
  behaltener Instanz → `resume(newHost)` statt `create()`. `onStopped`/`onPip` der Engine steuern, wann eine behaltene Instanz verworfen wird (`pip-end` ohne gemountete Seite → Engine `dispose` selbst,
  Hülle vergisst die Instanz). Design-Wechsel/`destroy()`: sofort `dispose()`.

## Ereignis `lfx:play`
`core/playback.js` `play(item, opts)` feuert **synchron am Anfang** (vor dem Proxy-Klick bzw. Fallback)
`window.dispatchEvent(new CustomEvent('lfx:play', { detail: { id } }))`. Es feuert nicht ohne Item/Id. Damit stoppt der TV-Modus bei **jedem** normalen Abspielweg
(Modal, Hovercard, Titelseiten, „Von vorne“). Der Stopp kommt **vor** dem Start des Jellyfin-Players, damit nie zwei Wiedergaben gleichzeitig laufen. (`player/video.js` setzt keine Media-Session-Handler mehr; sie sind global und nicht wiederherstellbar.) `modal.js` bekommt keinen Haken.

## Lebenszyklus
- **Verlassen = Stopp:** `unmount` ohne aktives PiP → `instance.suspend()` (= `false`, `<video>` leeren, `DELETE /Videos/ActiveEncodings`) und danach `dispose()`. Kein Mini-Player.
- **Ausnahme aktives Bild-in-Bild** (Regeln siehe „Bild-in-Bild“): `suspend()` → `true`, die Instanz bleibt bestehen, der Controller läuft weiter, das `<video>` liegt schon in `#lfx-tvm-bg`
  (Besitzer: Engine). Rückkehr auf die Seite → `resume(newHost)`; PiP-Ende → zurück in den Slot (Seite gemountet) bzw. `dispose()` mit Stopp-Grund `pip-end` (Seite nicht gemountet).
  Das Umhängen übersteht PiP (S1 bestätigt); ein Geometrie-Sync ist **nicht** nötig.
- **Stopp-Gründe** (`deps.onStopped({ reason })`): `leave` (Seite verlassen, kein PiP), `lfx-play` (Ereignis), `route-video` (Route `/video`), `pip-end` (`leavepictureinpicture`
  außerhalb der Seite), `detached` (`!video.isConnected`), `theme` (Design-Wechsel), `destroy`, `error` (nicht behebbar).
  Weitere Gründe nur nach Absprache. Wer löst aus: Engine (`entry.js`/`pip.js`): `lfx-play`, `pip-end`, `detached`; Hülle (H): `leave`, `route-video` (Route `/video` bzw. `#videoOsdPage:not(.hide)`), `theme`, `destroy`;
  `error` kommt vom Controller (nicht behebbarer Fehler) über die Engine.
- **Design-Wechsel/`destroy()`:** sofort `dispose()` (die Engine entfernt dabei `#lfx-tvm-bg`), `removeAddonCss('lenztvmode')`, `removeThemeJs` wie bei den anderen lazy Bundles.
- **Details:** in allen Designs öffnet `deps.openDetails` `openModal(id, { overlay: true })` als Overlay über dem laufenden TV: kein Stopp, kein Observer, Bild und Ton laufen weiter. Die Tasten bleiben per `BLOCK` gesperrt (siehe unten).
- **„Von vorne“ / „In der Mediathek ansehen“:** TV stoppen, dann `deps.playFromStart(id)` (Jellyfin-Player ab Anfang, `core/playback.js`, `resume:false`).
  Erzeugt bewusst einen normalen „Weiterschauen“-Eintrag.
- **Zappen** meldet keinen Fortschritt (nie `/Sessions/Playing*`, nie `StartTimeTicks` an der HLS-URL; Server-Fallen siehe „Geteilter Unterbau“).
- **Pausen:** `filler`/`fill`/`nightfill` (Trailer, „Gleich: …“, Füllprogramm); `closedown` = ruhige Karte „Sendepause – weiter um 05:00“.
- Jede Komponente und die Engine räumt in `destroy()`/`dispose()` vollständig auf.

## Routen-Nebenwirkungen
- `lfx=tv` ist **nie** Startseite: `features/home.js`, `mobilenav.js` (flix), `plus/switcher.js`, `plus/favempty.js`, `plus/home.js`, `prime/home-route.js`,
  `retro/home-route.js` prüfen ohnehin auf beliebiges `lfx` und sind zuständig-frei (Test `tests/tvmode-route.test.js`). Kein Billboard, kein Switcher, kein Fav-Leerzustand.
- **Umleitung:** `features/themeroute.js` leitet `lfx=tv` unter `store` und `html.layout-tv` per `location.replace('#/home')` zurück (kein History-Eintrag; seit 1.13.0 nicht mehr unter `retro`);
  unter `flix`/`plus`/`prime`/`retro` gibt es keine Umleitung.
- Aktiv-Hervorhebung des TV-Symbols (`activeKey`/`tabKey`/`mobileTitle`) für `kind === 'tv'`: Aufgabe von W1-B/C/D (`nav.js`, `plus/header.js`, `plus/mobilehead.js`,
  `plus/tabbar.js`, `prime/header.js`, `prime/tabbar.js`, `prime/profile-sheet.js`).

## Tokens und CSS-Regeln
- Nur Kern-`--lfx-*` aus `src/css/tokens.css`: `--lfx-red` (Akzent-Slot; plus/prime überschreiben ihn), `--lfx-red-hover`, `--lfx-red-active`, `--lfx-bg`, `--lfx-bg-deep`,
  `--lfx-surface`, `--lfx-surface-2`, `--lfx-surface-3`, `--lfx-border`, `--lfx-text`, `--lfx-text-body`, `--lfx-text-muted`, `--lfx-text-soft`, `--lfx-gold`, `--lfx-green`,
  `--lfx-glass`, `--lfx-glass-hover`, `--lfx-progress-rail`, `--lfx-font`, `--lfx-fs-*`, `--lfx-fw-*`, `--lfx-gutter`, `--lfx-header-h`, `--lfx-card-gap`, `--lfx-card-radius`,
  `--lfx-btn-h`, `--lfx-btn-radius`, `--lfx-btn-gap`, `--lfx-badge-h`, `--lfx-popup-radius`, `--lfx-modal-radius`, `--lfx-ease`, `--lfx-dur*`, `--lfx-shadow-*`.
  **Keine** `--lfx-live-*`, `--lfx-plus-*`, `--lfx-prime-*`, `--lfx-retro-*`. Eigene Hilfsvariablen heißen `--lfx-tvm-*` und werden in `.lfx-tvm` definiert.
- Basisregeln beginnen mit `.lfx-tvm` (das Bundle lädt nur, wenn der TV-Modus aktiv sein darf). Feinschliff je Design nur in `designs.css` unter
  `html.lfx-js.lfx-theme-<id>:not(.layout-tv) .lfx-tvm` (`<id>` = `plus`|`prime`; flix = Basis). Pointerabhängige Effekte nur unter `(hover:hover) and (pointer:fine)`.
- Kein `:has`, kein CSS-Nesting (Konvention des Repos). Asset-URLs relativ zu `dist/`.
- Layoutumschaltung nur über `.is-phone` / `.is-landscape` am Root (siehe oben), nicht über eigene `@media` (einzige dokumentierte Ausnahme: die Senderliste lässt bis ca. 1466 px Fensterbreite das Sender-Badge weg, `src/css/tvmode/list.css`).
- Jellyfin-Fallen: `.card` und `.libraryPage` nicht verwenden/treffen; nichts an `#videoOsdPage`; keine React-Knoten mutieren.

## Dev-Harness `build/tvmode-dev.html|js` (Welle W3)
Über `serve` als `/tvmode-dev.html` (Fake-Katalog, kein Netzwerk, `fakePlayer: true`). Parameter:
`design=flix|plus|prime|retro` (Klasse `lfx-theme-<id>` + Design-CSS), `phone=1`, `now=<ISO>` (Testuhr), `channel=N`,
`state=loading|pause|closedown|error|gesture|tap|muted` (`loading` hält den Ladezustand; `playing` ist der Normalablauf, kein `state` nötig), `thin=1` (ausgedünnter Katalog, nur Filme ab 120 min, für echte Sendepause),
`chrome=0` (Kopfleisten-/Tabbar-Attrappe aus; Standard an, `chrome=1` wirkungslos), optional `tab=now|epg`, `info=1`, `landscape=1` (nur Hinweis für Skripte), `debug=1` (`window.__lfxTvm`); weitere Parameter im Kopfkommentar von `build/tvmode-dev.js` (maßgeblich). Marker: `html[data-tvm-dev-ready]` sobald
`onReady` kam. Lädt `dist/lenztvmode.js|css` (kein `src/`-Modus).

## Live-Befunde 1.10.0
Live getestet am 12.11.2026 (Testkonto, Chrome Desktop und 390-px-iframe, Screenshot-Skript `.tmp/verify/tvm-shot.mjs`, gitignored). Gefunden und behoben:
- **Kopfabstand:** Jellyfin rückt `<main>` bei flix/plus schon unter die Kopfleiste ein, bei prime nicht. `app.js` misst deshalb den fehlenden Abstand
  (Kopfhöhe minus Dokument-Oberkante des Roots) mit einem Messelement (wegen `calc()` in prime) und setzt `--lfx-tvm-pad` (CSS-Fallback: volle Kopfhöhe).
- **plus-Kopfleiste:** Sie nutzt `justify-content: space-between`, deshalb trägt das TV-Symbol `margin-left: auto`.
- **Handy:** Die Seite scrollt nie automatisch zur aktuellen Senderzeile.
- **Info-Karte:** Sie zeigt das Kalenderdatum des Beginns, nicht den Sendetag (Sendungen nach Mitternacht gehören noch zum Vortag).
- **Modal-Bugfix (LENZFLIX):** Im Info-Fenster (`features/modal.js`) blieb nach „Abspielen“ das Fenster offen, während der Player dahinter startete (Jellyfin navigiert per
  `pushState` ohne Hash-Ereignis). Jetzt schließt das Modal zuerst (`closeModal({after})`), dann folgt der Proxy-Klick.
- **Offen (ungetestet):** iPhone-Safari (Autostart mit Ton, Bild-in-Bild über `webkitSetPresentationMode`, Wischen, Querformat, Safe-Area), Touch an echten Geräten, mehrere Stunden Dauerbetrieb.

## Schnelleres Zappen, Codes, Gain
- `DEBOUNCE_MS` 250. Beim `tune()` stößt der Controller sofort `player.prefetch(itemId, { signal })` für das Ziel an (Folgedruck bricht ab); `play()` übernimmt Cache/laufende Anfrage (Details: „Player: Rückfall, Fehlercodes, Vorauflösung, Gain“). Nach 1 s stabilem `playing` (nur Programm) werden Sender ±1 vorausgelöst (max. 2, einmal je Sendung, nichts bei Füllern/Sendepause; mit Vorwärmen stattdessen `prewarm`, siehe „Startablauf und Vorwärmen“). `ctl.stats()` → `{ zaps:[{channel,ms}], lastMs, avgMs }` (letzte 10 Umschaltungen tune → playing; Debug: `window.__lfxTvm.ctl.stats()`).
- Snapshot: `card.code` (Fehlerkarte, Kurzcode, `NET` bei network ohne Code); die Ansicht zeigt „Code: X“ (`.lfx-tvm__card-code`, Größe/Deckkraft inline gesetzt).
- Doppeltipp (Touch) schaltet Vollbild nur mit echtem Element-Vollbild (`document.fullscreenEnabled`/`webkitFullscreenEnabled` + `requestFullscreen` am Root, oder Vollbild ist schon an; Override `opts.canNativeFullscreen()`). Tipps auf `.lfx-tvm__zap` zählen nicht zum Doppeltipp.
- Tipp/Klick-Toggle (Touch und Maus): Ist die Leiste (`is-controls`) sichtbar, blendet der nächste Tipp/Klick ins Bild alles aus (`hideAll()`: Leiste, Senderkarte `is-zapping`, Timer, offenes Menü per `controls.closeMenu()`, Fokus in der Leiste per `blur()`). Ist nur die Senderkarte oder nichts sichtbar, zeigt er die Leiste. Maus: Ausblenden um `MOUSE_HIDE_MS` (250 ms) verzögert, `dblclick`/zweiter Klick verwirft es (Vollbild flackert nicht); danach blendet `pointermove` erst ab 8 px Abstand zur Klickposition wieder ein (Chrome feuert Pseudo-Bewegungen).
- Handy-Player (`phone.css`): `top: calc(var(--lfx-tvm-head) - 2px)`, weil die echte Kopfleiste am iPhone bruchzahlig hoch ist und sonst ein 1–2-px-Spalt die Liste durchscheinen lässt.
- EPG-Raster: Titel und Zeit stehen in `.lfx-tvm__epg-cell-text` (sticky, `left` = Senderspaltenbreite + 4 px, `max-width: min(100%, var(--tvm-vis))`); die Zelle ist `overflow: clip`. `epg-grid.js` setzt `--tvm-vis` (sichtbare Restbreite) per rAF-gedrosseltem Scroll-Listener, nach `renderRows`/Tageswechsel und im ResizeObserver nur auf links unter die Senderspalte ragende Zellen (bei verstecktem Raster nichts).
- `ctl.volumeSupported` ist true bei nativem `volume`, aktivem Gain oder offenem Gain-Versuch (`player.volumeCanTry()`); scheitert er (`volume-mode` → `mute-only`), springt der Pegel auf 100 und der Hinweis „nur stumm“ erscheint.

## Tests (Wellen)
Controller (Zappen, Offset, Sync, Füller/Sendeschluss, Gesehen, Autoplay, Aufräumen ActiveEncodings), Modell (`gridRows` über 05:00, `nowAll`), Hülle (match/mount/unmount/teardown,
PiP-Ausnahme, keine Fortschrittsmeldung, Design-Matching, Umleitung), Importgrenzen-Test (Engine importiert nur `src/js/tv/**`; Hülle/core/shared nie daraus),
Token-Test (nur Kern-`--lfx-*`), Build-Wächter. `// @vitest-environment jsdom` pro Datei, keine Netzwerkzugriffe.

## Details-Karte (seit 1.11.1)
- „Details“ (Info-Bereich, Info-Karte) öffnet in flix, plus und prime die Detailkarte (`features/modal.js`) als Overlay über dem laufenden TV: `openModal(id, { overlay: true })`. Der TV wird weder gestoppt noch neu gestartet, Bild und Ton laufen weiter (die frühere Stopp/Resume-Logik in `features/tvmode/page.js` ist entfernt).
- Die Tasten bleiben gesperrt (`BLOCK` enthält `.lfx-modal-open`), damit Zappen nicht im Modal greift.
- plus/prime zeigen die Karte im Look des Designs (`src/css/themes/plus|prime/modal.css`) und im Fuß einen Link „Zur Titelseite“ (schließt, dann `titleHref`). Das Verlassen der Seite stoppt den TV wie üblich.
- „Abspielen“ in der Karte geht über `core/playback.js` und feuert `lfx:play`; die Engine (`tv/tvmode/entry.js`) stoppt dann den TV.

### Lautstärke 0 (1.11.2)

Pegel 0 ist in jedem Modus stumm und läuft immer über `muted` (`silent() = muted || vol === 0`), da die Volumen-Probe auf iOS fälschlich `native` liefern kann. `setMuted(false)`/`toggleMute` bei Pegel 0 stellt den letzten Pegel > 0 wieder her, der mindestens 1 s stand (`VOL_SETTLE_MS`; Zwischenwerte beim Ziehen zählen nicht; Fallback Startpegel bzw. 50, Pref `volume` wird gespeichert). Nach jedem erfolgreichen Start wird nur in Richtung stumm abgesichert (`if (silent()) player.setMuted(true)`), nie ohne Nutzergeste entstummt (Autoplay-Sperre `mutedByPolicy` bleibt erhalten).

### Messanzeige und Vorauflösung (1.11.2)
- `NEIGHBOR_MS` ist 1000 (Nachbarsender ±1 schon 1 s nach stabilem `playing` vorauflösen).
- `opts.zapStats` (Hülle: Hash `lfxdebug=1`/`0`, gemerkt in `localStorage` `lfx-zapstats`; Harness `?zapstats=1`) mountet `ui/zapstats.js` (Klasse `lfx-zapstats`) in `.lfx-tvm__player`. Der Controller feuert dafür `zap` (`{ channel, ok, keyMs, timing, code?, reason? }`; `keyMs` = ab Tastendruck inkl. Entprellung, `timing` = `res.timing` des Players) und bietet `ctl.volumeMode()`. `ctl.stats().zaps[]` trägt zusätzlich `timing`. Details: „Messung, Messanzeige, dauerhaftes `directFailed`“ im Abschnitt „Geteilter Unterbau“.

### Startablauf und Vorwärmen (1.11.3, Varianten 1.11.5 entfernt)
- Der TV-Modus nutzt den gemeinsamen Player: Die Startposition wird beim Setzen der Quelle vorab als Default-Startposition gesetzt, `loadedmetadata` springt nur bei mehr als 1,5 s Abweichung nach (fest; die Weiche `lfxzap` ist entfernt, iPhone-Messung ohne belastbaren Unterschied). Debug-Schalter `lfxhls=1` zusammen mit `lfxdebug=1`. Die Messanzeige zeigt eine dritte Zeile (Quelle, Grund, Sprung, Puffer, Warten).
- „Vorwärmen“ ist seit 1.11.6 **Standard an** (Hash `lfxwarm=0|1`, `deps.zapWarm` als Getter, Netzregel). Der Controller nutzt den gemeinsamen Nachbar-Vorwärmer `tv/player/neighbors.js` (`createNeighbors`; Importgrenze bleibt `src/js/tv/**`): `arm('play')` wärmt die Nachbarsender ±1 per `player.prewarm(itemId, offsetMs)` vor (Playlist, Init, erstes Segmentbyte, alle 35 s erneut, max. 10×), `arm('error')` tut das 2 s nach einer Fehlerkarte (nur `video`/`browser`/`audio`); `stop()` bei Zappen, neuer Sendung, Pause/Stopp, dispose. `NEIGHBOR_MS` und `WARM_TICK_MS` exportiert `controller.js` weiter. Zeile 4 der Messanzeige zeigt Ergebnis und Grund. Details: Abschnitte „Startablauf und erweiterte Messanzeige“ und „Vorwärmen“ im „Geteilten Unterbau“.
- **Fehlerkarte mit Grund (1.11.6):** Meldet der Player ein `hint` (M3 bei ungeeignetem Bildformat, z. B. h264 HDR), setzt der Controller `card.hint = '<hint> wird von diesem Gerät nicht unterstützt'`; `player-view.js` zeigt es als `.lfx-tvm__card-hint` unter dem Code (Details und Liste: Abschnitt „Geteilter Unterbau“ unten, „Player: Rückfall, Fehlercodes …“).
- **Klasse `lfx-tvm-bgplay` (1.11.6):** Die Engine (`entry.js`, Helfer `bgCls`) setzt sie auf `<html>`, solange der TV im Hintergrund-Bild-in-Bild weiterläuft (in `suspend()` bei aktivem PiP und im PiP-`onChange`); entfernt bei `resume()`, PiP-Ende, `stop()` (auch `lfx:play`/`bail`) und `dispose()`. Zweck: Das Vorladen der Startseite (`features/rows/prefetch.js`) pausiert dann, und der Billboard-Trailer startet nicht (gemeinsamer Helfer `tvBgPlaying()` in `features/rows/prefetch.js`; zusätzlich muss `#lfx-tvm-bg video` existieren, gegen eine hängende Klasse). Eigentümer ist die Engine, die Hülle setzt sie nie. Das Öffnen des TV-Modus selbst beendet das Vorladen (`stop()`); fertige Zeilen bleiben im 10-min-Cache.
- **Datensparmodus (1.12.0, Vertrag `docs/js-contracts.md` „Datensparmodus“):** `defineZapWarm(deps)` (`features/tvdata/zapflag.js`) setzt neben `deps.zapWarm` den Getter `deps.zapPrefetch` (= `!isDataSaver('tvwarm')`); `zapWarmEnabled()` ist bei aktivem Modus false (kein Vorwärmen). Wie `zapWarm` ein Getter: nach `{ ...deps }` erneut `defineZapWarm` aufrufen. `tv/player/neighbors.js` prüft `deps.zapPrefetch` selbst (1.14.0): bei `false` ruft der Nachbar-Takt kein `prefetch` auf und verbraucht keinen Schlüssel, er versucht es im `WARM_TICK_MS`-Takt erneut (der frühere Delegations-Player im Controller ist entfernt). Die Vorauflösung des **gewählten** Zielsenders (Liste/Ziffern) bleibt, sie ist eine Nutzeraktion. `instance.releaseWarm()` (`entry.js` → `controller.releaseWarm()`: Nachbar-Takt `stop()` + `player.releaseWarm()`; der laufende Sender bleibt unberührt): die Hülle (`features/tvmode/page.js`) ruft es bei `onDataSaverChange` und `onDataSaverPartsChange` auf, sobald `isDataSaver('tvwarm')` gilt, vorgewärmte Sitzungen enden sofort statt nach <= 40 s. Senderbilder werden über `deps.imageUrl` (= `imageUrlFor`) automatisch kleiner, die Engine ist dafür unverändert.
- **Budget:** Die Engine (`dist/lenztvmode.min.js`) darf bis 128 KiB (131.072 B, `TVMODE_MIN_BUDGET` in `build/build.mjs`; 1.11.6: 127.392 B). Vorher 120/124 KiB.

## Geteilter Unterbau: Server, Planer, Player (aus `docs/live.md`)
Seit 1.15.0 gibt es kein Design „LENZ LIVE“ mehr (bis 1.14.0 teilte es sich diesen Unterbau mit dem TV-Modus; `docs/live.md` ist in diesen Abschnitt aufgegangen). Der Code liegt in `src/js/tv/{schedule,player,ui}/` (vorher `src/js/live/`) und `src/js/features/tvdata/` (vorher `features/live/`). Der TV-Modus ist der einzige Verbraucher.

### Server-Befunde der Wiedergabe (Prüflauf 11.11.2026, Jellyfin 12.x, Testkonto)
- Test-Mediathek: einige hundert Filme (fast alle MKV h264/aac 720p, einzelne HEVC mit DTS/EAC3), gut 150 Serien mit rund 9 000 Folgen, gut 100 Sammlungen.
- `POST /Items/{id}/PlaybackInfo?userId=` mit eigenem DeviceProfile funktioniert. h264-MKV → `SupportsDirectPlay: true`.
  HEVC → `TranscodeReasons` enthält `VideoCodecNotSupported` → für uns „nicht empfangbar“.
- **Immer `SubtitleStreamIndex: -1`** im PlaybackInfo-Body (sonst wählt der Server einen Standard-Untertitel und brennt evtl. ein) –
  **reicht allein nicht**: Eine MKV/HEVC-Folge mit DVDSUB (Default-Flag) lieferte trotz `-1` `SubtitleStreamIndex=3&SubtitleMethod=Encode`
  (`SubtitleCodecNotSupported`, also Einbrennen = Video-Umwandlung). Nötig sind zusätzlich `SubtitleProfiles` mit `Method:'External'` für
  **alle** Formate (`vtt, srt, subrip, ass, ssa, pgssub, dvdsub, dvbsub, sub`); dann fehlen `SubtitleStreamIndex`/`SubtitleMethod`, und
  `TranscodeReasons` ist nur noch `AudioCodecNotSupported` (live bestätigt). Angezeigt werden weiter nur Text-Untertitel. Schutz in
  `stream.js`: `SubtitleMethod=Encode` in der `TranscodingUrl` → „Kein Empfang“.
- **Zweite PlaybackInfo-Anfrage (Tonspurwahl): `MediaSourceId` mitschicken, `SubtitleStreamIndex` weglassen (1.11.7, live geprüft 13.11.2026):**
  - Ohne `MediaSourceId` ignoriert der Server `AudioStreamIndex` (Body wie Query) und liefert die Standardspur. Das war die Regression in 1.11.6.
  - `MediaSourceId` zusammen mit `SubtitleStreamIndex: -1` → die `TranscodingUrl` trägt `SubtitleMethod=Encode`, ohne Index schreibt der Server aber nichts ein; gebrannt wird nur, wenn die URL zusätzlich einen `SubtitleStreamIndex` enthält (Befund Babylon Berlin: mkv, h264, ac3 5.1 deu/eng, eingebettete SRT „deu forced + default“). `AlwaysBurnInSubtitleWhenTranscoding: false` und die Methode `Hls` helfen nicht.
  - **V-SUB-Korrektur 1.13.0 (live geprüft 15.11.2026):** `player/stream.js` meldet `V-SUB` bzw. den Grund `SubtitleCodecNotSupported` nur noch, wenn die `TranscodingUrl` `SubtitleStreamIndex=<Zahl>` enthält. `SubtitleMethod=Encode` ohne Index brennt nichts ein (Sender 11 Suits mit erzwungener DVDSUB-Standardspur und Babylon Berlin mit erzwungener SRT → `IsVideoDirect=true`). Dadurch änderte sich damals bewusst das Bundle (neue Basis für die Byte-Gleichheit).
  - `MediaSourceId` **ohne** `SubtitleStreamIndex` (oder `null`): richtige Tonspur, keine Untertitel, kein Einbrennen (PC- und iOS-Profil, Babylon Berlin + 24 zufällige Titel mit Untertiteln; Tonspurwechsel 1↔2 im echten Player).
  - Die erste Anfrage bleibt ohne `MediaSourceId` und mit `SubtitleStreamIndex: -1` (`stream.js` `post`, ein `undefined`-Wert wird aus dem Body entfernt).
- **HEVC-Remux:** Mit HEVC im Profil (DirectPlay `h264,hevc`; Transcoding `mp4`/fMP4, hls, `hevc,h264`, aac) liefert der Server für HEVC+AC3
  `SegmentContainer=mp4`, `VideoCodec=hevc,h264`, nur `AudioCodecNotSupported`; Chrome 157 spielt das nativ (≈ 3 s ab Minute 10).
  Ohne HEVC im Profil: `VideoCodecNotSupported` → „Kein Empfang“. Erkennung: `MediaSource.isTypeSupported` oder `canPlayType`
  mit `video/mp4; codecs="hvc1.1.6.L120.90"` (`profile.js`, `canHevc`).
- Token-Parameter: `ApiKey` und `api_key` werden beide akzeptiert → **`ApiKey`** verwenden (der Server nutzt es selbst in `TranscodingUrl`).
- Direktwiedergabe `/Videos/{id}/stream?static=true&MediaSourceId={msid}&ApiKey=…`: Range wird bedient, Sprung per
  `currentTime` auf Minute 30 → `playing` nach ~2 s.
- HLS-Remux (`TranscodingUrl`, `master.m3u8`): Chrome 157 spielt nativ. Die Playlist umfasst den **ganzen Titel**
  (absolute Zeitbasis, `duration` = Laufzeit). Start ab Position: `currentTime = sek` nach `loadedmetadata`
  (≈ 6–10 s bis `playing`) oder Fragment `#t=sek` (≈ 10 s). **`&StartTimeTicks=` an der URL bricht die Playlist (Fehler 4) – nie anhängen.**
- Nach mehreren Minuten Wiedergabe auf beiden Wegen: UserData (Played, Position, PlayCount, LastPlayedDate) und
  `/UserItems/Resume` unverändert → keine Spuren.
- `DELETE /Videos/ActiveEncodings?deviceId=&playSessionId=` → 204. Fordert der Client danach weiter Segmente an,
  startet der Server den Job neu → **erst** `<video>` stoppen (`pause()`, `removeAttribute('src')`, `load()`), **dann** DELETE.
- Katalog-Ladezeiten (Pi): Filme 0,5 s, Serien 0,3 s, Sammlungen 0,4 s, **Folgen 4,6 s / 7,9 MB** → IndexedDB-Cache pro Sendetag.
- Personendaten (`Fields=People` 53 s, `/Persons` > 20 s) sind zu teuer → **keine Schauspieler-/Regie-Thementage**.
- Video-Gründe in `TranscodeReasons` (→ ablehnen): `VideoCodecNotSupported, VideoProfileNotSupported, VideoLevelNotSupported,
  VideoResolutionNotSupported, VideoBitDepthNotSupported, VideoFramerateNotSupported, RefFramesNotSupported,
  AnamorphicVideoNotSupported, InterlacedVideoNotSupported, VideoBitrateNotSupported, VideoRangeTypeNotSupported,
  VideoCodecTagNotSupported, ContainerBitrateExceedsLimit, SubtitleCodecNotSupported` (letzteres würde Einbrennen bedeuten).

### `RawCatalog` (Hülle → Engine, schlanke Jellyfin-Items, PascalCase wie vom Server)
```js
{
  movies:   [{ Id, Name, RunTimeTicks, Genres, OfficialRating, ProductionYear, PremiereDate, DateCreated, LocalTrailerCount }],
  series:   [{ Id, Name, Genres, OfficialRating, ProductionYear, DateCreated }],
  episodes: [{ Id, Name, SeriesId, SeriesName, ParentIndexNumber, IndexNumber, RunTimeTicks, PremiereDate, DateCreated, OfficialRating }],
  boxsets:  [{ Id, Name, ChildCount }],
  loadedAt: ms,
}
```

### Zeitplan (`src/js/tv/schedule/`, rein, deterministisch)

Öffentliche API (`schedule/index.js`):
```js
normalizeCatalog(raw) → Catalog
createScheduler(catalog, { channelConfig, getBoxSetItems, now, specials }) → Scheduler
//   now() → ms: nur für channels() ohne Argument (Standard Date.now);  specials { 17: impl, 18: impl } überschreibt die globale Registry (Tests)
// Hilfs-API für Spezialsender: siehe „Hilfs-API für Spezialsender“
// Zeit (schedule/time.js), Planzone MEZ/MESZ arithmetisch:
offsetMs(t), wallToUtc(D, min), dayBounds(D), broadcastDayOf(t), dayOfDate(y, m, d), formatClock(t) → 'HH:MM',
formatDay(D) → { weekday: 'Mo'…'So', long: 'Montag', date: '11.11.' }
ratingAge(str) → 0|6|12|16|18|null
```
```js
Scheduler = {
  channels(D?) → Channel[18],               // für Sendetag D, ohne Argument der aktuelle (now())
  prepare(Ds: number[]) → Promise,          // async Vorarbeit (Sammlungs-Inhalte für Thementage); danach planDay synchron
  planDay(no, D) → PlanEntry[],             // lückenlos [dayStart, dayEnd), memoisiert, Object.freeze
  nowOn(no, t) → { entry, offsetMs, D },    // offsetMs = t − entry.start
  upcoming(no, t, n) → PlanEntry[],         // aktuelle + n folgende Programm-Einträge
  item(id) → CatalogItem | null,            // normalisiert, siehe unten
  genres() → [{ label, count }],            // Anzeigelabels + Anzahl Titel (Filme + Serien), für die Senderbelegung im Menü
}
// CatalogItem (schedule/catalog.js), eingefroren bzw. unveränderlich zu behandeln:
//   Film:  { id, kind:'movie', title, durMs, genres: string[], year, premiere, addedAt, age, trailer: bool }
//   Folge: { id, kind:'episode', title, durMs, seriesId, seriesTitle, season, episode, premiere, addedAt, age, genres, year }
//   Serie: { id, kind:'series', title, genres, year, addedAt, age, ageMax, eps, totalMs, durMs (Median der Folgen) … }
// - `age` = 0|6|12|16|18|null (aus OfficialRating, bei Folgen/Serien die strengere Freigabe); es gibt keinen Freigabetext.
// - Fehlende Staffel/Folge → 9999 (UI zeigt dann nichts), fehlendes Premierendatum bei Folgen → Infinity.
// - `genres` sind normalisierte Schlüssel (klein, NFC); Anzeigelabels nur über `scheduler.genres()` (häufigste Schreibweise).
// - Filme/Folgen < 5 min oder > 5 h und Staffel 0 (Extras) fallen aus dem Katalog; Folgen ohne Laufzeit erhalten den Median der Serie.
Channel = { no: 1..18, key: 'kino'|'klassik'|'serie'|'marathon'|'genre:<norm>'|'premiere'|'thema',
            name: 'LIVE Kino' | 'LIVE ‹Genre›' … /* Planer-Namen; die TV-Modus-UI schneidet „LIVE “ ab */, kind: 'movies'|'series'|'genre'|'special', genreLabel?: string }
PlanEntry = { start, end, type: 'program'|'filler'|'fill'|'nightfill'|'closedown',
              itemId?, seriesId?, rerun?: bool, premiere?: 'film'|'episode', theme?: string, age?: number,
              label?: string, reason?: 'grid'|'rating'|'empty'|'end' }
```
- Senderplätze: 1 Kino, 2 Klassik, 3 Serie, 4 Marathon, 5–16 Genres, 17 Premiere, 18 Thementag.
- `filler` = Lücke ≤ 30 min (Trailer der nächsten Sendung oder Pausenbild „Gleich: …“), `fill` = größere Lücke am Tag mit kurzen
  Titeln aus dem Gesamtkatalog (`itemId` gesetzt, Hinweis „Füllprogramm“), `nightfill` = wie `fill` am Tagesende
  (Hinweis „Füllprogramm – reguläres Programm ab 5:00“), `closedown` = Testbild (leerer Sender, Rest < 5 min).
- Regeln und Randfälle sind in den Dateiköpfen von `src/js/tv/schedule/*` und in den Tests `tests/tv-schedule-*.test.js` / `tests/tv-special-*.test.js` dokumentiert.
- Determinismus: kein `Math.random`, keine Lokalzeit, kein `Intl`. Zeit nur über `schedule/time.js`, Zufall nur über Hashes
  (`schedule/hash.js`: `fnv1a`, `keyHash`, `mulberry32` …), Sortierung nach Code-Unit-Reihenfolge, unabhängig von der Eingabereihenfolge.
  Alle Clients berechnen denselben Plan.
- Der Plan wird bei jedem Laden neu berechnet (kein Persistieren); Sammlungsinhalte für den Thementag holt `prepare()` vorab.
- Füller: Lücken bis ~34 min (30 min Schwelle plus Rundung auf das 5-min-Raster) sind `filler`; größere Lücken füllt `fill`.

#### Hilfs-API für Spezialsender
Sender 17/18 sind über `registerSpecial(no, impl)` / `unregisterSpecial` / `getSpecial` (`schedule/specials.js`) angebunden;
`premiere.js` und `themeday.js` registrieren sich beim Import (`schedule/index.js` importiert beide). Ohne Registrierung oder bei
ungültigem Plan liefert der Sender einen `closedown`-Tag.
```js
impl = { prepare?(ctx, Ds) → Promise|void,  planDay(ctx, D) → PlanEntry[] /* lückenlos [dayStart, dayEnd) */ }
```
Exporte aus `schedule/index.js` (Bausteine in `fill.js`, `pool.js`):
- `createDayBuilder({ D, bounds?, used?, shorts?, key? })` → DayBuilder: `cursor`, `bounds`, `used`, `canPlace/place(piece, { limit?, type? })`,
  `canPlaceBlock/placeBlock(pieces)` (alles oder nichts), `fillUntil(t)`/`waitUntil(t)`, `closeRest(reason)`, `finish()` (füllt bis Tagesende, friert ein).
  `piece = { itemId, durMs, seriesId?, rerun?, premiere?, theme?, age?, label? }`; `place` hängt bei Bedarf `filler` bis zum 5-min-Raster an und
  verweigert Doppelte (`used`) und Jugendschutz-Verstöße (`ageAllowed`: ab 16 erst 22:00, ab 18 erst 23:00).
- `fillSegment(builder, cands, { limit, strict? })`: Kandidaten `{ pieces[], size }` platzieren; strict (Standard) überschreitet `limit` nie und
  wählt ab Rest ≤ 4 h per Teilsummen-DP (`packSubset`, ≤ 40 Kandidaten) die maximale Füllung; `strict:false` lässt den letzten überlaufen.
- Rotation: `makeEntries`, `bucketCount`, `bucket`, `rotation`, `rotationWithBorrow`, `streamOfAge`, `CAP_MS` (Hash-Eimer, tageweise Rotation durch den Pool).
- weiter: `slotOf`, `ageAllowed`, `closedownDay`.

#### Premiere (Sender 17, `schedule/premiere.js`)
Einheiten: Film = 1 Einheit; neue Folgen einer Serie vom selben Sendetag werden in Folgenreihenfolge zu Blöcken (≤ 3 Folgen und ≤ 2 h).
Nur Einheiten mit Hinzufügedatum ab Epoche **01.11.2026** (`EPOCH`) werden Premieren. Kette nach `(addedAt, id)`: Kandidat =
max(Tag nach dem Hinzufügen, vorherige Premiere + 1); liegt er mehr als **15 Tage** (`MAX_WAIT_DAYS`) nach dem frühesten Tag, wird die Einheit
verworfen (keine Premiere). Die Premieren-Titel sind im Tagesplan vorab gesperrt (das Füllprogramm sendet sie nicht vorher) und werden erst beim Platzieren freigegeben. Tagesplan: Premiere 20:15 (Freigabe 16 → 22:00, 18 → 23:00; dann um 20:15 Wiederholung), Rest Wiederholungen
(`rerun`) aus dem Pool der Neuzugänge (Fenster 30 … 365 Tage, kleinstes mit ≥ 24 h), Eimer-Rotation (Schlüssel `premiere`).

#### Thementag (Sender 18, `schedule/themeday.js`)
Arten: **Filmreihen** (`boxset`: Sammlungen mit ≥ 2 planbaren Titeln), **Jahrzehnte** (`decade`, ≥ 6 h Material), **Pilotfolgen** (`pilot`: S1E1
verschiedener Serien, ≥ 3) und **Überlänge** (`overlength`: Filme ab 150 min, ≥ 2). Die Art des Tages ergibt eine Permutation der verfügbaren
Arten pro Woche (Hash der Woche), zyklisch über 7 Tage (nie dieselbe Art an zwei aufeinanderfolgenden Tagen, außer bei nur einer Art); ist die Art
nicht planbar, gilt die nächste. `prepare(ctx, Ds)` lädt die Sammlungsinhalte (`getBoxSetItems`), `planDay`
ist synchron und nutzt nur den Cache. Kandidaten je Tag sind die **ersten 12 der Rotation** (`MAX_LOADS_PER_DAY`; Position in der Rotation, nicht der Cache-Zustand, damit alle Clients gleich planen); `weekOrder` prüft damit alle sieben Tage der Woche. Restgrenze: Der Cache enthält nur vorbereitete (`prepare`) Tage, für nicht vorbereitete Wochentage kann `weekOrder` weiter abweichen. Reicht das Material nicht, folgt ein zweites Thema, danach Füllung. Keine Personen-Themen (zu teuer für den Server).

#### Bekannte Grenzen
- Kein hls.js: Browser ohne native HLS-/MKV-Wiedergabe (Firefox) zeigen Störbild mit Hinweis.
- Keine Schauspieler-/Regie-Thementage (Personendaten zu langsam).
- Nur Direktwiedergabe und Umpacken (Remux); Video wird nie transkodiert (HEVC u. Ä. = „nicht empfangbar“).
- Plan wird bei jedem Laden neu berechnet; Füller bis ~34 min.

### Player (`src/js/tv/player/`)
```js
createPlayer({ video, deps, now, fake: false, canvas, getInfo }) → Player   // getInfo() → { channel, title }: nur für fake (Testbild)
Player = {
  unlock(),                                  // SYNCHRON in der Nutzergeste aufrufen (TV-Symbol, siehe lfx:tvmode-intent) (Autoplay-Freigabe für das eine <video>, iOS)
  play({ itemId, offsetMs, audioIndex?, subtitleIndex? }) → Promise<Result>,  // löst Stream auf, springt an offsetMs, startet
  playUrl(url, offsetMs) → Promise<Result>,  // Trailer (direkt)
  stop() → Promise,                          // <video> leeren, dann ggf. DELETE ActiveEncodings
  syncTo(offsetMs),                          // Live-Position halten (Abweichung > 10 s → springen)
  setVolume(v), setMuted(b), volumeSupported: boolean, volumeMode(),   // iOS: 'mute-only' → Pegel 0 = stumm, sonst Ton an (volume fest 1)
  tracks() → { audio: Track[], subs: Track[], audioIndex, subtitleIndex },   // Track = { index, label, lang, isDefault, codec, forced? (nur Untertitel) }
  setAudio(index) → Promise<Result>,         // Nicht-Standardspur → Remux mit AudioStreamIndex
  setSubtitle(index | -1) → Promise,         // nur Text-Untertitel als VTT-<track>; Bild-Untertitel nicht in der Liste
  on(event, fn) → off,                       // 'state' {phase:'loading'|'playing'|'stalled'|'error'|'ended'}, 'error', 'autoplay-muted' {} (play() abgelehnt, stumm gelungen)
  dispose(),
}
Result = { ok: boolean, mode: 'direct'|'hls'|'none', reason?: 'video'|'audio'|'browser'|'network'|'gesture'|'aborted' }
// 'gesture': play() mit NotAllowedError abgelehnt, auch stumm. Die App zeigt „Zum Starten tippen“; Tippen/Taste → unlock() synchron, Sendung neu starten.
// 'browser' nur bei echter Unfähigkeit (z. B. NotSupportedError, HLS fehlt). Bei Autoplay-Sperre startet video.js erst stumm (video.muted = true).
createWatchTracker({ setPlayed, now }) → { tune(entry, offsetMs), tick(), leave(silent?), dispose() }   // Gesehen-Regel
pickFiller(entry, nextEntry, deps, now?) → Promise<{ kind: 'trailer', url, offsetMs } | { kind: 'card', trailerStartMs? }>
// Trailer läuft deterministisch im Fenster [entry.end − durMs, entry.end); davor Karte mit trailerStartMs (Zeitpunkt des Trailerstarts, die App fragt dann neu)
```
- Genau ein `<video playsinline x-webkit-airplay="deny">` pro Instanz, ohne
  `controls`, nie im DOM umhängen. Pause abfangen (Ereignis `pause` → weiter an Live-Position; keine Media-Session-Handler: sie sind global und nicht
  wiederherstellbar, die Handler von Jellyfin bleiben erhalten; Pause per Kopfhörer oder Medientaste fängt der `pause`-Listener ab). Zappen entprellt die UI (400 ms), nicht der Player.
- DeviceProfile wie im Prüflauf: DirectPlay `mkv,mp4,m4v` + h264 + `aac,mp3` (nur wenn `canPlayType` es bejaht; Safari: kein mkv);
  Transcoding `ts`/hls, VideoCodec `h264`, AudioCodec `aac`, 2 Kanäle; `AllowVideoStreamCopy: true`, `EnableTranscoding: true`.
  HLS nur, wenn der Browser HLS nativ kann (`canPlayType('application/vnd.apple.mpegurl')`), sonst `reason: 'browser'`.
- Fehlt dem Konto das Recht zur Ton-Umwandlung → `reason: 'audio'` („Ton auf diesem Gerät nicht empfangbar“).
- Gesehen-Regel (`player/watch.js`): Position (jetzt − `entry.start`) ≥ 90 % der Sendedauer, eingeschaltet spätestens 10 min nach `entry.start`,
  Unterbrechung (Wegzappen/Aus) < 60 s toleriert, ab 60 s verworfen; nur `type: 'program'` und `fill`/`nightfill` mit `itemId` – nicht Trailer/Füller. Einmal pro Ausstrahlung.
  Der Controller ruft `watch.tune` erst nach erfolgreichem Start (Ergebnis `ok`, Offset zu diesem Zeitpunkt aus der Uhr) bzw. nach erneutem `playing`; bei Störbild/Fehler, Stillstand > 60 s, Pausenbild und Stopp ruft er `watch.leave()` (bei Fehler/Stillstand `leave(true)` = ohne Prüfung, nie gesehen).
- `fake: true`: kein Netzwerk; zeichnet ein Testbild mit Sendername/Titel/Zeitcode auf `canvas` (Harness).

### Hülle: Senderbelegung, Katalog-Cache, Messschalter (`src/js/features/tvdata/`)
- `deps.js`: `buildApiDeps`, `loadUser`, `fatalText` (Server-deps; Quelle für `request`, `streamUrl`, `imageUrl`, `getBoxSetItems`, `loadTrailer`, `setPlayed`, `itemDetails`, `storage`, `zapWarm`).
- `config.js` (Senderbelegung der Plätze 5–16, Admin): `window.LenzFlixConfig.tvChannels` (Objekt `{5:'Action'}` oder String) → sonst CSS-Variable `--lfx-tv-channels`. Format `"5=Action;6=Komödie"` (Genre-Label wie in Jellyfin; Vergleich nach `trim().normalize('NFC').toLowerCase()`). **Rückfall (Kompatibilität mit Konfigurationen aus LENZ LIVE):** `LenzFlixConfig.liveChannels` und `--lfx-live-channels` werden weiter gelesen. Reihenfolge: `tvChannels`, `liveChannels`, `--lfx-tv-channels`, `--lfx-live-channels`; der erste nicht leere Wert gewinnt. Die Zeile gehört im Custom CSS **unterhalb** der `@import`-Zeile (davor ist das `@import` laut CSS-Spezifikation ungültig, das Theme lädt nicht mehr): `:root{--lfx-tv-channels:"5=Action;6=Komödie"}`.
- `data.js`: lädt den RawCatalog (Filme, Serien, Folgen, Sammlungen; schlanke Felder, keine Bilder/UserData), Cache pro Nutzer und Sendetag in IndexedDB. Der DB-Name `lfx-live` (Store `catalog`) ist historisch und darf nicht geändert werden (Nutzerdaten liegen darunter); Fallback Speicher-Cache.
- `zapflag.js`: Hash-Schalter `lfxdebug`, `lfxwarm`, `lfxhls` (siehe „Vorwärmen“).
- `core/theme.js` migriert einmalig ein gespeichertes Design `live` (lokal und `CustomPrefs.theme`) auf das zuletzt davor gewählte Design (`prevTheme`, sonst die lokale Wahl, sonst `flix`); `?lfxtheme=live` wird ignoriert (Test `tests/theme-migration-live.test.js`).
- Tests: `tests/tv-*.test.js` (Hülle `tv-hull-*`, Planer `tv-schedule-*`/`tv-special-*`, Player `tv-player-*`).

### Player: Rückfall, Fehlercodes, Vorauflösung, Lautstärke
- Fehlercodes (`code` an `resolveStream`-Fehlern, `play()`-Ergebnis, `state`/`error`-Ereignis, nie URL/Token): `V-CODEC`, `V-RANGE`, `V-10BIT`, `V-SUB`, `V-OTHER` (Server-Gründe), `V-NOURL` (keine TranscodingUrl), `V-NOSRC`, `A-CODEC`, `B-HLS` (kein natives HLS), `B-PLAY` (play() NotSupported), `M<n>` (MediaError am `<video>`, z. B. M3 Decode, M4 Quelle nicht unterstützt), `NET`, `TIMEOUT` (25 s Start). Die Fehlerkarte zeigt klein „Code: X“ (`card.showError(reason, channel, code)`, `data-code`). Startfehler am `<video>` (`M<n>`, `B-PLAY`) tragen die Rückfallkette: `M3·D>T>T` = Direktwiedergabe (D), dann ts-HLS (T), dann ts-Neuversuch (T) scheiterten; Buchstaben: `D` Direct, `F` fMP4-HLS (HEVC angeboten), `T` ts-HLS. Der Code ist der des letzten Fehlers. Andere Codes (`V-*`, `A-*`, `B-HLS`, `NET`, `TIMEOUT`) bleiben unverändert. Die Fehlerkarte des TV-Modus zeigt den Text unverändert („Code: M3·D>T>T“).
- Rückfall (max. 3 Starts je `play()`, nur bei `video`/`browser`, nie eine echte Video-Umwandlung): (1) Direct scheitert → `resolveStream({ noDirect: true })` (leere DirectPlayProfiles, `EnableDirectPlay:false`, `noHevc` unverändert) = Remux (fMP4-HLS mit HEVC, wenn der Browser HEVC kann, sonst ts); der Player merkt sich je Item `directFailed` (Auflösung und `prefetch` fragen künftig gleich mit `noDirect`, der Direct-Cache liefert es nicht mehr). (2) fMP4-HLS scheitert bei h264-Quelle mit `offeredHevc` → EINMAL `noHevc: true` (ts/h264). Das Ergebnis wird **pro Titel** gemerkt (seit 1.11.6, `tsOnly` entfällt): Set `fmp4Failed` plus Persistenz `lfx-fmp4failed` (`deps.storage`, wie `lfx-directfailed`: 7 Tage, max. 200). Gezählt wird nur, wenn T danach lief; dauerhaft nur, wenn F frisch aufgelöst war (keine übernommene Vorwärm-Sitzung) und mit M3/M4 scheiterte. Bekannte Titel starten gleich mit ts (eine PlaybackInfo statt Doppelanfrage). Geräteweiter ts-Modus nur in der Sitzung: wenn F nie lief und mindestens 2 Titel mit gezähltem F-Fehler vorliegen (unbekannte Codecs kosten dann noch eine Doppelanfrage). HEVC-Quellen: kein ts-Rückfall (wäre Umwandlung). (3) ts-HLS scheitert → genau ein Neuversuch nach ca. 500 ms, vorher wird das `DELETE ActiveEncodings` der gescheiterten Sitzung abgewartet, dann frisch aufgelöst (`noCache`). Alter Job jeweils per DELETE beendet, kein Fehler-Ereignis zwischen den Versuchen; schlägt die Neuauflösung selbst fehl, wird der letzte Startfehler gemeldet.
- **M3 mit ungeeignetem Bildformat (1.11.6, `stream.js` `videoFormatHint(ms)`):** bekannt nicht dekodierbar sind h264 mit mehr als 8 Bit/High 10, 4:2:2, 4:4:4, anderem PixelFormat ohne 420/nv12/nv21, HDR (VideoRangeType HDR*/HLG/DOVI, VideoRange HDR, ColorTransfer smpte2084/arib-std-b67) und Level > 5.2; bei allen Codecs Breite > 4096. Scheitert F mit M3 und liegt ein Grund vor, entfällt T: sofort Fehler, Ergebnis und Ereignis tragen `hint` (z. B. `Bildformat h264 HDR`), Code z. B. `M3·F`. Endet eine Kette ohne F mit M3, wird der Grund ebenfalls ermittelt. Die Fehlerkarte zeigt „<hint> wird von diesem Gerät nicht unterstützt“ (TV-Modus `.lfx-tvm__card-hint`, Text aus `tvmode/controller.js`). Live-Befund: ein 720p-Titel mit h264 High L3.1, 8 Bit, yuvj420p und HDR10 (smpte2084/bt2020) → iPhone M3 bei F und T (iPhones spielen HDR nur mit HEVC); Abbruch nach F in 5,5 s statt 11,8 s. Abhilfe liegt in der Mediathek (Datei als SDR oder HEVC neu kodieren).
- Profil: HLS-Ton `aac` plus `ac3`/`eac3`, wenn `canPlayType('audio/mp4; codecs="ac-3"|"ec-3"')` es bejaht (dann `MaxAudioChannels 6`); Direktprofile ebenso.
- `waiting` meldet erst nach 1,2 s ohne `currentTime`-Fortschritt `stalled`, `stalled` wird ignoriert; `timeupdate` mit Fortschritt, `canplay` und `playing` melden wieder `playing`.
- `player.prefetch(itemId, { signal? })` löst PlaybackInfo vorab auf; gecacht (max. 10 min) werden nur Direct-Ergebnisse, bei HLS nur „HLS nötig“ (beim Start frisch). `play()` nutzt Cache und wartet auf eine laufende Vorauflösung; mit `audioIndex` kein Cache.
- Lautstärke ohne natives `volume` (iOS): kein WebAudio-Gain mehr (`player/gain.js` entfällt, in der Praxis wirkungslos). `player.volumeMode()` → `'native'|'mute-only'`, `player.volumeSupported` (nur bei native true). Bei `mute-only` ignoriert `setVolume` den Pegel (`video.volume` bleibt 1), nur `setMuted` wirkt. TV-Modus: der Regler (0–100, Schritt 5) bleibt sichtbar, 0 → stumm, ab 5 Ton an, kein Hinweistext; `ctl.volumeSupported` ist immer true.

#### Messung, Messanzeige, dauerhaftes `directFailed` (1.11.2)
- `play()`/`playUrl()` liefern am Ergebnis (Erfolg und Fehler, nicht bei `aborted`) `timing: { totalMs, infoMs, loadMs, startMs, chain, cached, mode }` und `player.lastTiming()` die Kopie davon: `infoMs` bis PlaybackInfo, `loadMs` = `src` → `loadedmetadata`, `startMs` = `loadedmetadata` → `playing` (jeweils der letzte Versuch, `video.js` `phases()`), `chain` = Versuchskette (`D`, `D>T`, `F>T`), `cached` = Direct-Ergebnis aus Cache/Vorauflösung, `mode` = `direct|hls|none`. Keine URLs/Token. `fake.js` liefert eine Attrappe.
- Messanzeige `ui/zapstats.js` (geteilt mit dem TV-Modus, reines DOM mit Inline-Styles, Klasse `lfx-zapstats`, oben links im Bild): Zeile 1 `Sender 4 · 1,8 s · T · Info 0,3 · Laden 1,1 · Start 0,2 · Ø 1,5 s (10)` (Fehler: `FEHLER · Code Kette`), Zeile 2 `Ton: native|mute-only · muted ja/nein · vol 0,00 · Regler 0` (direkt vom `<video>`). Option `opts.zapStats` (Engine); ohne Option kein DOM. In der Hülle schaltet der Hash-Parameter `lfxdebug=1` (z. B. `#/home?lfx=tv&lfxdebug=1`) die Anzeige ein und merkt sich das in `localStorage` (`lfx-zapstats`), `lfxdebug=0` löscht (`features/tvdata/zapflag.js`, von `tvmode/page.js` gelesen). Harnesses: `?zapstats=1`.
- `directFailed` wird dauerhaft gemerkt (`deps.storage`, von `features/tvdata/deps.js` = `localStorage`, Key `lfx-directfailed`, `{ itemId: ms }`, max. 200, TTL 7 Tage), aber nur wenn Direct mit Medienfehler `M3`/`M4` scheiterte UND der folgende Versuch lief. `B-PLAY`/`browser` bleibt nur in der Sitzung.

#### Startablauf und erweiterte Messanzeige (1.11.3, Weiche 1.11.5 entfernt)
- **Startablauf** (`player/video.js`, `vc.start`, fest): `src` setzen, dann sofort `video.currentTime = Ziel` (Default-Startposition laut HTML-Spec bei `HAVE_NOTHING`, in try/catch; Ziel = Live-Position zu diesem Zeitpunkt). In `loadedmetadata` wird nur noch nachgesprungen, wenn `|currentTime − Live-Position| > 1,5 s` (`JUMP_TOLERANCE_S`) oder das Vorab-Setzen nicht griff, danach `play()`. Hintergrund: Safari holte bei HLS erst Segment 0 und sprang dann weit voraus, der Server startete ffmpeg neu. Rückfallkette, Watchdogs (`START_TIMEOUT_MS`, Stall) und Fehlercodes sind unverändert. Die seit `play()` vergangene Zeit (Auflösung, Rückfallkette) wird je Startversuch zum `offsetMs` addiert, damit die Live-Position nicht zurückbleibt.
- **Startvarianten entfernt (1.11.5):** Die Weiche `lfxzap=0|1|2` (`deps.zapVariant`, `localStorage` `lfx-zapvariant`, Variante 0 = Sprung immer in `loadedmetadata`, Variante 2 = zusätzlich `#t=` an der `<video>`-Adresse) ist weg, das frühere „V1“ ist fest. Der alte `localStorage`-Schlüssel `lfx-zapvariant` wird nicht mehr aufgeräumt (keine Migration). Das Messfeld `variant` und das Kürzel „V<n>“ in Zeile 3 entfallen.
  - **iPhone-Ergebnis (1.11.4, 13.11.2026, mkv·h264·aac, Kette F, je 3 Messungen):** V0 Ø ≈ 7,3 s, V1 ≈ 8,3 s, V2 ≈ 6,9 s. „Start“ (Metadaten → playing) 5–9 s, das ist ein Seek. Kein belastbarer Unterschied (Rauschen), deshalb V1 fest.
  - Verworfen (live geprüft 12.11.2026): `SegmentLength` an der HLS-URL. Der Server liefert damit unverändert Segmente von 8 s (`#EXTINF:8.0`, Remux richtet sich nach den Keyframes).
- **`lfxhls=1|0`** (Hash, `localStorage` `lfx-forcehls`, `deps.forceHls`): erzwingt HLS (wie `noDirect`), wirkt nur bei eingeschalteter Messanzeige (`lfxdebug=1`).
- **Messfelder** zusätzlich in `timing` (`video.js` `metrics()`, `index.js` `extraTiming`): `forced`, `jumped` (nach `loadedmetadata` gesprungen), `seekingMs`/`seekedMs`/`canplayMs` (jeweils erstes Ereignis nach den Metadaten, ms ab Metadaten), `waitCount`/`waitMs` (`waiting`-Phasen zwischen Metadaten und `playing`), `bufSeeked`/`bufPlaying` (`[Anfang, Ende]` des Puffers um `currentTime` in s relativ zum Sprungziel, bei `seeked` und bei `playing`), `devS` (`currentTime` − Live-Position bei `playing`, s) und `src: { container, v, a, fmt, reasons }` (Kürzel aus PlaybackInfo: Quell-Container, Video-/Ton-Codec, Dateiinfo `fmt`, erste 2 `TranscodeReasons` ohne „NotSupported“; nie URL/Token/Pfade). `fmt` (`stream.js` `formatInfo`, 1.11.6): Profil, Level, Bit-Tiefe, PixelFormat nur wenn nicht 4:2:0, Auflösung, `interlaced`, Bereich nur bei Nicht-SDR, z. B. `High L3.1 8 Bit 1280×720 HDR10`. `playUrl()` trägt dieselben Felder (ohne `src`). Seit 1.11.5 außerdem `warm` und `res` (siehe „Vorwärmen“).
- **PC-Messung (Chrome, 12.11.2026, Testkonto, Server abends langsam):** Direct mkv/h264: Start 0,7/6,0/3,1 s (Startposition vorab) gegen 5,1/4,9/4,2 s (altes Verhalten). HLS erzwungen (Kette F, Grund `AudioCodec,DirectPlayError`): Laden 4–9 s, Start 6–13 s. Bei so langem Laden springt der Player trotz Vorab-Setzen nach.
- **Zeile 3** der Messanzeige (`zapstats.js` `detailLine`), Beispiel: `Quelle mkv·hevc·eac3 · Main 10 L153 10 Bit 3840×1600 · Grund Container · Sprung nein · Abw +0,3 · Seek 0,0/0,3 · canplay 0,5 · Puffer +0,0…+2,0 → +0,0…+12,0 · Warten 2× 1,8 s` (`HLS erzwungen` bei `lfxhls`; „–“ = Ereignis nicht eingetreten; darf am Handy umbrechen). Zeile 1 bei Fehlern: `Sender N · FEHLER · <Code> · <hint> · <s>`; die Kette steht nur dann zusätzlich da, wenn der Code sie nicht schon trägt (seit 1.11.6 nicht mehr doppelt).

#### Vorwärmen (1.11.5 Test, seit 1.11.6 Standard an)
Der Server beginnt für die Nachbarsender ±1 schon vorher mit dem Remux, das Umschalten im HLS-Pfad (Kette F/T) wird dadurch schneller. Messung iPhone 1.11.5: genutzt 1,6–2,3 s, sonst 6,3–9,5 s.
- **Schalter:** Standard **an**. Hash `lfxwarm=0` speichert `'0'` (aus, `localStorage` `lfx-zapwarm`), `lfxwarm=1` speichert `'1'` (wieder an), unabhängig von `lfxdebug`. Netzregel `netOk()` in `features/tvdata/zapflag.js` (`saveData`, `cellular`, `slow-2g/2g/3g` → aus, auch bei `lfxwarm=1`; ohne API an). `zapWarmEnabled()` → `deps.zapWarm` (`features/tvdata/deps.js`) ist ein **Getter** (`defineZapWarm(deps)`) und wird bei jedem Zugriff neu ausgewertet. Falle: `{ ...deps }` friert den Getter ein, darum ruft `features/tvmode/page.js` `defineZapWarm` nach dem Spread erneut auf. Ist es aus, gibt es keinen zusätzlichen Request außer der einfachen PlaybackInfo-Vorauflösung (`player.prewarm` ist No-op). Datensparmodus (1.12.0): `zapWarmEnabled()` ist zusätzlich bei `isDataSaver('tvwarm')` false; Näheres siehe „Datensparmodus (1.12.0)“ weiter oben.
- **Ablauf** (`player/index.js` `prewarm(itemId, offsetMs)`, Hilfen in `player/warm.js`): PlaybackInfo wie `prefetch` (gleiche Optionen inkl. `noDirect` und `noHevc` für Titel mit gemerktem fMP4-Fehler bzw. geräteweitem ts-Modus; ein laufender `prefetch` wird abgewartet, ein Direct-Treffer im Cache beendet den Ablauf). Ist das Ergebnis `direct`, passiert nichts weiter. Bei HLS: `master.m3u8` laden, daraus die erste Variante, daraus `#EXT-X-MAP` (Init) und die Segmentliste (`#EXTINF` kumuliert), das Segment wählen, das `offsetMs` abdeckt. Init komplett laden, dann das Segment anfragen, nach dem ersten Chunk (`body.getReader().read()`, ohne Stream nach den Headern) per `AbortController` abbrechen. Abrufe per `deps.fetch` bzw. globalem `fetch` (URLs tragen `ApiKey`, nie loggen).
- **Cache `warm`:** `itemId → { r, at, offsetMs, timing, refreshes, segments }`, max. 2 Einträge (ältester wird verdrängt), gültig 40 s (`WARM_TTL_MS`; der Server beendet untätige HLS-Jobs nach ~60 s). Verdrängte, verfallene (Zeitgeber), bei `dispose()` und bei `releaseWarm()` (Verlassen/`suspend()`/`pagehide`; auch laufende Vorwärm-Vorgänge mit aufgelöster Sitzung) alle Einträge; Ausschalten am Gerät (`powerOff`) und `stop()` fassen sie nicht an (Ablaufzeit 40 s): `DELETE /Videos/ActiveEncodings` mit `deviceId` + `playSessionId` des Eintrags (wie `teardown()`), Fehler ignoriert; vorher laufende Abrufe abgebrochen. Ein abgebrochener oder gescheiterter Ablauf beendet die Sitzung ebenfalls.
- **Übernahme:** `resolveFor` nimmt einen frischen Eintrag EINMAL (nur `audioIndex == null && !noCache`), er wird zur aktiven Sitzung (kein DELETE, kein zweites PlaybackInfo; `lastWarm` statt `lastCached`). Die Regel „HLS-Ergebnisse im normalen `cache` nie wiederverwenden“ bleibt. Ein Eintrag, der nach der ts-Regel (Titel in `fmp4Failed` oder geräteweiter ts-Modus) nicht mehr passt (fMP4 angeboten, h264), wird verworfen (Grund `kette`).
- **Auffrischen:** `prewarm` auf einen frischen Eintrag desselben Items macht kein neues PlaybackInfo, nur einen erneuten Segmentabruf (erstes Byte, Abbruch) an der neuen Position, setzt `at` neu, `refreshes++`; nach 10 Auffrischungen verfällt der Eintrag. Antwortet der Server am Segment mit Fehler, wird der Eintrag verworfen.
- **Auslöser: gemeinsamer Nachbar-Vorwärmer `player/neighbors.js`** (1.11.6): `createNeighbors({ player, scheduler, clock, deps, getChannel, getPhase, nch })` → `{ arm(mode), stop(), dispose() }`, genutzt vom TV-Modus (`tvmode/controller.js`); importiert nur Dateien aus `src/js/tv/`. Konstanten `NEIGHBOR_MS` 1 s, `ERROR_WARM_MS` 2 s, `WARM_TICK_MS` 35 s, `WARM_TICK_MAX` 10, `WARM_AFTER_ERROR` `['video','browser','audio']`.
  - `arm('play')` nach stabilem `playing` (`NEIGHBOR_MS`), nur bei Programm-Einträgen: mit `deps.zapWarm` `player.prewarm(itemId, offsetMs)` für die Sender ±1 (`offsetMs` = Planposition `scheduler.nowOn(ch, now).offsetMs`), danach alle 35 s erneut, höchstens 10×; ohne Vorwärmen `player.prefetch` je Sendung einmal. Mit Vorwärmen gibt es keinen zusätzlichen `prefetch` (sonst PlaybackInfo doppelt).
  - `arm('error')` 2 s nach einer Fehlerkarte, nur mit Vorwärmen und nur bei `video`/`browser`/`audio` (nicht bei `network`/Tipp-Fehlern): der nächste Sender ist beim Weiterschalten schon warm. Endet die Karte (Neuversuch, Zappen), ist Schluss.
  - Puffern am Start: steht der Sender kurz in `loading`/`stalled`, versucht der Vorwärmer es jede Sekunde erneut (max. 20×, Grund `phase`), ohne den 35-s-Zähler zu verbrauchen.
  - `stop()`: TV-Modus bei Zappen, neuer Sendung (`playEntry`), Pause/Stopp, `dispose()`. Die Phase liefert die jeweilige Hülle über `getPhase()` (`playing`/`error`/sonst).
- **Teilübernahme:** Schaltet der Nutzer um, während das Vorwärmen noch läuft und PlaybackInfo (HLS) schon da ist, übernimmt `takeWarm` dieses Ergebnis: laufende Abrufe werden abgebrochen, die (evtl. schon gestartete) Server-Sitzung wird NICHT gelöscht (`taken`-Flag, `runWarm` beendet sie dann nicht per DELETE). Messung `used: true, partial: true` mit den bis dahin gemessenen Zeiten (fehlende `null`, Zeile 4 „–“). Ohne PlaybackInfo wird wie bisher abgebrochen. Die ts-Regel pro Titel gilt auch hier; `prewarm`/`takeWarm` arbeiten pro Titel.
- **Zähler:** `timing.warm.started`/`done` (seit Engine-Start: HLS-Vorwärmungen gestartet/fertig gespeichert), Zeile 4 zeigt `Vw fertig/gestartet`; „genutzt teilweise“ bei `partial`.
- **Live-Befund Pi (1.11.5) und Fixes:** (1) Der Controller rief mit Vorwärmen zusätzlich `prefetchNeighbors` auf, `prewarm` löste dann dasselbe Item nochmal auf (zwei PlaybackInfo hintereinander, am Pi mehrere Sekunden): mit `zapWarm` ruft der Controller nur noch `prewarm` (löst selbst auf und merkt Direct im Cache). (2) `started` zählte erst nach PlaybackInfo, und `play()` brach einen Vorgang ohne PlaybackInfo ab (Zähler 0/0, „genutzt nein“): `play()` wartet jetzt auf das laufende PlaybackInfo des Vorwärmens (`rec.resolving`) und übernimmt es teilweise. (3) Ein hängender Vorgang wird nach 25 s abgebrochen (`WARM_PENDING_MAX_MS`, Grund `timeout`, Sitzung per DELETE beendet).
- **Grund pro Umschalten `timing.warm.skip`** (seit 1.11.6, Zeile 4: `Grund …` bei „genutzt nein“): Der Player führt ein Protokoll pro Titel (`warmLog`, max. 20 Titel) mit `kette` (Eintrag passte nach der ts-Regel nicht mehr), `alt` (verfallen), `verdrängt` (Cache voll, max. 2), `fehler` (Segmentabruf gescheitert), `err` (Auflösung/Abruf gescheitert), `pending` (Vorgang lief schon), `timeout`, `direct` (Direct, kein Vorwärmen nötig), `max` (10 Auffrischungen erreicht). Gibt es für den Titel keinen Eintrag, gilt die Controller-Notiz seit dem letzten Umschalten (`phase`, `filler` = beide Nachbarn ohne Programm; gemeldet über `player.warmNote(code)`), sonst `keiner`.
- **Messung:** `timing.warm = { on, used, ageMs, playlistMs, initMs, segFirstByteMs }` (bei aus nur `{ on: false }`; `playlistMs` = master + Variante, `segFirstByteMs` = bis zum ersten Byte des Segments, jeweils vom Vorwärmen) und best effort `timing.res = { n, firstSegMs } | null` aus `performance.getEntriesByType('resource')` (Playlist-/Segment-Einträge ab `src`-Setzen, `firstSegMs` = `responseStart` des ersten Segments minus `src`-Zeitpunkt; ohne Eintrag oder bei Cross-Origin ohne Timing-Freigabe `null`). Nur Zahlen, nie Namen/URLs.
- **Zeile 4** der Messanzeige (`zapstats.js` `warmLine`), nur wenn `timing.warm` vorhanden: `Vorwärmen an · genutzt ja · Alter 12 s · Liste 0,3 · Init 0,2 · Seg 1. Byte 4,8 · Res 3/5,1 s`, ungenutzt `Vorwärmen an · genutzt nein · Res …`, aus `Vorwärmen aus · Res –`.
- **Interpretation:** Kurzes „Seg 1. Byte“ und trotzdem langes „Start“ → Übertragung bzw. Safari-Puffer/Seek ist der Engpass, Vorwärmen hilft kaum. Langes „Seg 1. Byte“ → der Serverstart (ffmpeg) dominiert; dann sollte „genutzt ja“ das „Laden“/„Start“ beim Umschalten spürbar kürzen. Vergleich: gleiche Sender mit `lfxwarm=1` und `lfxwarm=0`, je mehrere Umschaltungen nach > 10 s auf dem Ausgangssender.
- **Messung 13.11.2026 (PC, Chrome, `lfxhls=1`, Vorwärmen Standard, über Tunnel):** TV-Modus 5× umgeschaltet, alle genutzt: 4,1 / 2,4 / 2,3 / 1,7 / 3,0 s (erster kalter Sender 11,6 s); nach simulierter Fehlerkarte Nachbarn nach 2 s vorgewärmt, nächster Sender genutzt (4,7 s).
- **Hash-Schalter nur auf den Zielseiten:** `lfxdebug=0` und `lfxhls=0` wertet die Hülle nur auf der TV-Seite aus; auf `#/home` ohne `lfx=tv` bleibt `lfx-zapstats` gesetzt.
