# TV-Modus (`lfx=tv`, flix/plus/prime) – Vertrag Hülle ↔ Engine ↔ CSS

Moderner TV-Modus im Stil eines IPTV-Webangebots als **eigene Vollseite `#/home?lfx=tv`** (wie „Neu und beliebt“), erreichbar über ein
TV-Symbol in der Kopfleiste (`ICON_TVMODE` in `core/icons.js`; flix: `features/tvbtn.js`, plus/prime im eigenen Kopf). Er nutzt Sender (18, Admin-Belegung 5–16),
deterministischen Plan und spurlosen Player von LENZ LIVE (`docs/live.md`), hat aber **keine Fernbedienung und keinen Röhren-Look**.
Gilt nur in `flix`, `plus`, `prime` auf Modern; nie auf `html.layout-tv`, nie in `retro`, `store`, `live`.

Status: seit 1.10.0 vollständig umgesetzt und live getestet. Namen, Klassen und Signaturen hier sind bindend; die Wellen-/Eigentümer-Angaben (A, E, F, G, H, W1–W3)
sind Entstehungshistorie.

## Präfix, Dateibaum, Bundles
- Präfix **`lfx-tvm`** (`html.lfx-tv` heißt schon das TV-Layout). **Verboten** in allen TV-Modus-Dateien: die Klasse `.lfx-card` und das Attribut
  `data-lfx-id` (sonst fangen Modal, Hovercard und Kontextmenü die Klicks ab). Ebenso kein `lfx-live-*` (Marker `lfx-live-remote` ist ein Build-Wächter).
- Dateien:

| Teil | Pfad | Ausgabe |
|---|---|---|
| Engine | `src/js/live/tvmode/**` | lazy `dist/lenztvmode(.min).js` per `core/themejs.js` (Name `tvmode`), Global `window.LenzFlixTvMode` |
| CSS | `src/css/tvmode/{index,layout,player,list,epg,phone,designs}.css` | lazy `dist/lenztvmode(.min).css` per `core/addoncss.js` (`ensureAddonCss('lenztvmode')`, Klasse `lfx-addon-css`) |
| Kern-CSS (ca. 1 KB) | `src/css/js-ui/tvmode.css` (im Hauptbundle-CSS) | versteckt native Sektionen/Ladezustand unter `html.lfx-tvm-on` (Muster `js-ui/newpopular.css`) |
| Hülle | `src/js/features/tvmode/{route,page,prefs,unlock}.js` | im Hauptbundle (≤ ca. 8 KB min) |
| gemeinsame deps | `src/js/features/live/deps.js` (`buildApiDeps`, `loadUser`, `fatalText`) | Hauptbundle, geteilt mit LENZ LIVE |
| Harness | `build/tvmode-dev.html`, `build/tvmode-dev.js` | über `serve` als `/tvmode-dev.html|js` |

- **Importgrenze:** Die Engine (`src/js/live/tvmode/**`) importiert **nur** Dateien aus `src/js/live/**` (und eigene). Erlaubt/vorgesehen:
  `schedule/*`, `player/{index,stream,profile,tracks,video,watch,filler,events,fake}.js`, `ui/logos.js`, `ui/overlay-util.js`
  (`describe`, `badges`, `genreLabels`), `ui/fullscreen.js`, `ui/zapstats.js`. **Nicht** importieren: `ui/app.js`, `ui/remote.js`, `ui/tv.js`, `ui/decor*.js`,
  `ui/knobs.js`, `player/music*.js`, `player/sfx.js`, `magazine/*`, `pdf/*`, `live/entry.js`. Hülle, `core/` und `shared/` importieren **nie** aus `src/js/live/`.
  Alles Zustandsbehaftete (Jellyfin, Theme, Router, Prefs) kommt per `deps` von der Hülle.
- `src/js/live/{ui,schedule,player,magazine,pdf}/**`, `live/entry.js`, `src/css/themes/live/**` und die `tests/live-*.test.js` bleiben unangetastet
  (sha256 von `dist/lenzlive.min.js|css` vor/nach gleich).
- Build-Wächter (`build/build.mjs`): Hauptbundle enthält nie `__LFX_TVMODE_ENGINE__`; `lenztvmode.min.js` enthält nie `__LFX_LIVE_ENGINE__` und nie
  `lfx-live-remote`; Warnung ab 120 KB. Marker `__LFX_TVMODE_ENGINE__` steht in `src/js/live/tvmode/entry.js`.
- Status: final umgesetzt und live getestet (1.10.0). Der frühere Stub aus W0 ist durch die echte Engine ersetzt.

## Global und `create`
```js
window.LenzFlixTvMode = { version: 1, create, mark: '__LFX_TVMODE_ENGINE__' }
create(host, deps, opts) → instance      // synchron; Planen läuft async (deps.onProgress / onReady / onFatal)
```
- `host`: `<div id="lfx-tvm" class="lfx-tvm">` der Hülle (Block im Fluss von `#homeTab`, kein `position:fixed`). Die Engine rendert alles hinein
  und setzt/entfernt die Zustands-Modifier **am Host** (siehe „DOM“). Das Host-Element gehört der Hülle.
- Wie `live/entry.js`: Katalog normalisieren, `createScheduler`, **alle 7 Tage vorab planen** (`scheduler.prepare([D … D+6])`, weil `schedule/index.js`
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
- `live/player/video.js` setzt `disablePictureInPicture = true`; die TV-Engine setzt es auf **ihrem eigenen** Element direkt nach `createPlayer` wieder auf `false`
  (keine Änderung an `video.js`). Der Pause-Abfang dort bleibt (bei Live-TV gewollt).
- `pip.js` (E): `createPip({ doc, video, getSlot, onChange }) → { supported() , active(), enter(), exit(), toggle(), on(fn) → off, dispose() }`.
  Die Komponenten bekommen ihn als `opts.pip` (`app.js` reicht durch) und das Video als `opts.video`; sie hängen nie selbst um.

### `deps` (Hülle baut sie aus `features/live/deps.js` + TV-eigenen Feldern)
Pflicht (wie LIVE, `docs/live.md`): `catalog`, `user`, `server`, `request`, `streamUrl`, `imageUrl`, `getBoxSetItems`, `loadTrailer`, `setPlayed`,
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
`imageUrl` und `itemDetails` stehen in `buildApiDeps` (`features/live/deps.js`); **Signatur dort maßgeblich** (`imageUrl: (id, o = {}) => api.imageUrlFor(id, o)`).
Der Controller selbst nutzt von `deps` nur `savePrefs` (optional) und reicht `deps` an `pickFiller` (`loadTrailer`) durch.
Nicht vorhanden (LIVE-spezifisch): `leaveToLibrary`, `previousThemeName`, `openThemePicker`, `openDashboard`, `logout`, `onLive*`.
Fortschrittsmeldungen an Jellyfin gibt es nie (nur `setPlayed` über die Gesehen-Regel).

### `opts`
```js
{
  video: HTMLVideoElement | null,   // vorab in der Geste entsperrtes <video playsinline> (features/tvmode/unlock.js); null → Engine erzeugt eines
  lastChannel: 1..18,               // Standard 1
  volume: 0..1, muted: false,       // wie LIVE; Controller rundet auf 5-%-Schritte (Werte > 1 gelten als Prozent)
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
`play()` darauf auf (wie `unlock` in `live/player/video.js:151-156`), merkt es sich und reicht es als `opts.video` an `create()`. Ohne Geste (Reload, direkter Link)
gibt es kein Intent-Video: die Engine erzeugt ihr eigenes, der Start kann stumm sein → „Ton an“. Ein nicht verbrauchtes Intent-Video verfällt nach ca. 30 s.

## Controller (`controller.js`, Welle A, fertig) – UI-frei
Der Code ist maßgeblich (Tests `tests/tvmode-controller.test.js`).
```js
import { createTvController, DEBOUNCE_MS, RETRY_MS, SYNC_MS, STALL_MS, ERROR_TEXTS } from './controller.js'
createTvController({ scheduler, player, watch = null, pickFiller = null, deps = {}, now = Date.now, opts = {} }) → ctl
//   player: createPlayer()-Instanz · watch: createWatchTracker() oder null · pickFiller: wie LIVE (Trailer/Karte) oder null
//   opts: { lastChannel (Standard 1), volume (0..1; Werte > 1 = Prozent), muted }
//   deps: nur savePrefs({ lastChannel | volume | muted }) (optional, Fehler werden geschluckt) und Durchreichen an pickFiller
// Konstanten: DEBOUNCE_MS 400 · RETRY_MS 10000 (network-Neuversuch) · SYNC_MS 30000 · STALL_MS 60000
ctl = {
  start(),                       // SYNCHRON in der Geste: player.unlock(), dann Sender (lastChannel) sofort einschalten; idempotent
  stop(),                        // Stream stoppen, Timer aus; phase 'off' (kein Argument; den Stopp-Grund meldet die Engine selbst)
  tune(no, { immediate } = {}),  // Sender 1..18 (Umlauf per Modulo); entprellt 400 ms, immediate:true sofort. Gleicher Sender → nichts. Nur wenn on.
  zap(delta),                    // = tune(channel + delta); ArrowUp/Wischen hoch = +1, ArrowDown/Wischen runter = −1
  gesture(),                     // Nutzer hat getippt: player.unlock() synchron; hebt mutedByPolicy auf; bei needsTap neuer Versuch („Zum Starten tippen“/„Ton an“)
  retry(),                       // nach Fehlerkarte neu versuchen
  setVolume(v),                  // v in PROZENT 0..100, gerundet auf 5er-Schritte; hebt mutedByPolicy auf; speichert { volume: 0..1, muted }
                                 //   ohne volumeSupported (iOS): nur stumm/laut (v < aktuell = stumm), Meldung per 'message'
  setMuted(b), toggleMute(),     // toggleMute hebt bei mutedByPolicy zuerst nur die Autoplay-Sperre auf (Ton an), erst der nächste Aufruf schaltet stumm
  get volumeSupported,           // boolean (false = keinen Lautstärke-Regler rendern, nur Stumm-Knopf)
  tracks() → { audio, subs, audioIndex, subtitleIndex },   // wie Player.tracks(); ohne Player leer ({ [], [], null, -1 })
  setAudio(index) → Promise, setSubtitle(index | -1) → Promise,   // Fehler → 'message'
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
- Nachbildung von `live/ui/app.js` (ohne dessen Dateien zu ändern) ist erledigt: Entprellung, Umlauf, Generationszähler, `armAdvance`, Füller/Trailer, `closedown`/`empty` (kein Testbild,
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
Verhalten wie LIVE: `0` wartet auf die zweite Ziffer (Timeout verwirft), `1` wartet (Timeout schaltet Sender 1), `2`–`9` sofort; zweite Ziffer 1–18 gültig, sonst `onInvalid('Dieser Sender existiert nicht')`.
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
**ausschließlich** über `.is-phone`/`.is-landscape` am Root um (kein eigenes `@media` für Layout). Komponenten, die das wissen müssen (z. B. Wischen nur bei Touch), lesen `opts.phone`/`opts.touch`
bzw. prüfen die Root-Klasse bei Bedarf; Wischgesten nur bei `pointerType === 'touch'`.

### Gemeinsame Helfer (Eigentümer G; E und F importieren sie)
- **`details.js`** (G): Inhaltsangaben. `createDetails({ deps, delayMs = 400 }) → { get(id) → string | undefined, request(id), map() → Map<id,string>, on(fn(id, text)) → off, dispose() }`.
  Der Katalog hat keine Inhaltsangaben; `request(id)` lädt `overview` über `deps.itemDetails([id])`. Pro Instanz per Id gecacht (auch leere Antworten, kein Wiederholen); `request` entprellt
  400 ms und überschreibt eine noch wartende Id (**max. eine Anfrage je Zappen**); fehlt `deps.itemDetails`, tut es nichts. `map()` wird als `opts.overviews` an `model.describe` gereicht.
  Eine Instanz je Engine (`app.js` erzeugt sie, reicht sie als `opts.details` an `info.js` und `info-card.js`/`channel-list.js`).
- **`thumb.js`** (G): 16:9-Vorschaubild. `createThumb({ doc, deps }) → { el, set(imageItemId, channelNo), destroy() }`; Regeln siehe „Bilder“.

Alle Dateien der Tabelle sind umgesetzt (Spalte „Welle“ = Entstehungshistorie).

| Datei (`src/js/live/tvmode/`) | Welle | Zuständigkeit |
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
- URL über `deps.imageUrl(id, { type, maxWidth })` (= `imageUrlFor`; Signatur siehe `features/live/deps.js`). Reihenfolge der Typen: **`Thumb` → `Backdrop` → `Primary`**, `maxWidth` 480
  (Liste/Karte; Info-Karte 960). Bei `onerror` des `<img>` wird der nächste Typ versucht; nach dem letzten ein Platzhalter: `.lfx-tvm__thumb--ph` mit Hintergrund
  `channelColor(no)` aus `ui/logos.js` (Textfarbe `channelInk(no)`) und Sendernummer. Das Ergebnis wird je `id` im `thumb.js` gemerkt (kein erneutes Durchprobieren).
- **Bild-Kennung `tag`** (Browser-Cache, Server antwortet mit `max-age=31536000, immutable`; ohne `tag` nur `public` = Rückfrage je Anzeige): Die Hülle (`features/live/deps.js` `taggedImageUrl`) ergänzt `tag` aus dem Katalog (`features/live/data.js`: Filme/Serien laden `ImageTags` Thumb/Primary + erstes `BackdropImageTags`; Folgen nutzen die Serien-Id). Unbekannt (z. B. Cache-Eintrag von vor 1.11.8, Typ fehlt) → URL ohne `tag`, nie `null` (sonst Platzhalter statt Typ-Fallback). Gilt auch für LENZ LIVE (Fernsehzeitung/PDF).
- Bild-URLs ohne `api_key`/Token (CLAUDE.md): niemals `streamUrl`, nie `ApiKey`/`api_key` anhängen oder loggen; die Bild-Endpunkte sind ohne Schlüssel erreichbar.
- Lazy: `loading="lazy"`/`IntersectionObserver` in der Liste; Rasterzellen haben keine Bilder.

### Inhaltsangaben
Der Katalog hat keine. Info-Bereich (`info.js`) und Info-Karte (`info-card.js`) rufen `opts.details.request(id)` (siehe `details.js`: Cache je Instanz, 400 ms Entprellung,
höchstens eine Anfrage je Zappen) und zeigen `details.get(id)` bzw. lassen den Text leer; bei der Antwort (`details.on`) aktualisieren sie sich. Id = `describe().itemId`
(bei Folgen die Folgen-Id, die den eigenen Text hat; **nicht** `imageItemId`).


## DOM und BEM-Klassenverzeichnis
Block `lfx-tvm`; Elemente `lfx-tvm__x`; Modifier als `is-*` (Zustand) bzw. `lfx-tvm__x--y` (Variante). Daten in `data-*` nur mit Präfix `data-tvm-*`.

### Root (= `host`, `#lfx-tvm`) und Zustands-Modifier
| Klasse | gesetzt von | Bedeutung |
|---|---|---|
| `lfx-tvm` | Hülle | Root |
| `is-loading` | Hülle | Engine/Plan noch nicht bereit („Sendersuchlauf“); entfernt bei `onReady` |
| `is-phone` | E (app.js) | Handy-Layout: `opts.phone` oder `matchMedia('(max-width: 799px)')` (einzige Quelle für CSS; kein eigenes `@media` für Layoutumschaltung); Aufräumen in `destroy()` |
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
Info-Bereich mit den Knöpfen [Von vorne] [Details] (Bild-in-Bild nur in der Player-Leiste), darunter direkt das EPG-Raster über die volle Breite **ohne Tabs**, mit Tagesauswahl (7 Tage) und „Jetzt“-Knopf.
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
  .lfx-tvm__unmute                   // „Ton an“-Knopf (snap.mutedByPolicy), deutlich, mittig-unten (→ ctl.gesture())
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
    .lfx-tvm__epg-days > .lfx-tvm__day (button; is-active)      // 7 Tage wie LIVE (time.formatDay: Mo 11.11.)
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

### Info-Karte (G, `info-card.js`)
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
  `lfx==='tv' && ['flix','plus','prime'].some(isTheme) && isModern() && !isTv() && isReady()`. Lazy: `ensureAddonCss('lenztvmode')` + `ensureThemeJs('tvmode')`.
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
(Modal, Hovercard, Titelseiten, „Von vorne“). Der Stopp kommt **vor** dem Start des Jellyfin-Players (sonst löscht `video.js` beim Dispose die mediaSession-Handler
des neuen Players). `modal.js` bekommt keinen Haken.

## Lebenszyklus
- **Verlassen = Stopp:** `unmount` ohne aktives PiP → `instance.suspend()` (= `false`, `<video>` leeren, `DELETE /Videos/ActiveEncodings`) und danach `dispose()`. Kein Mini-Player.
- **Ausnahme aktives Bild-in-Bild** (Regeln siehe „Bild-in-Bild“): `suspend()` → `true`, die Instanz bleibt bestehen, der Controller läuft weiter, das `<video>` liegt schon in `#lfx-tvm-bg`
  (Besitzer: Engine). Rückkehr auf die Seite → `resume(newHost)`; PiP-Ende → zurück in den Slot (Seite gemountet) bzw. `dispose()` mit Stopp-Grund `pip-end` (Seite nicht gemountet).
  Das Umhängen übersteht PiP (S1 bestätigt); ein Geometrie-Sync ist **nicht** nötig.
- **Stopp-Gründe** (`deps.onStopped({ reason })`): `leave` (Seite verlassen, kein PiP), `lfx-play` (Ereignis), `route-video` (Route `/video`), `pip-end` (`leavepictureinpicture`
  außerhalb der Seite), `detached` (`!video.isConnected`), `theme` (Design-Wechsel), `destroy`, `modal` (flix-Details), `error` (nicht behebbar).
  Weitere Gründe nur nach Absprache. Wer löst aus: Engine (`entry.js`/`pip.js`): `lfx-play`, `pip-end`, `detached`; Hülle (H): `leave`, `route-video` (Route `/video` bzw. `#videoOsdPage:not(.hide)`), `theme`, `destroy`, `modal`;
  `error` kommt vom Controller (nicht behebbarer Fehler) über die Engine.
- **Design-Wechsel/`destroy()`:** sofort `dispose()` (die Engine entfernt dabei `#lfx-tvm-bg`), `removeAddonCss('lenztvmode')`, `removeThemeJs` wie bei den anderen lazy Bundles.
- **Details:** in `flix` öffnet `deps.openDetails` `openModal` über der TV-Seite. Die Hülle beobachtet per `MutationObserver` die Klasse `html.lfx-modal-open`:
  Öffnen → `instance.stop('modal')`; Schließen → nur dann wieder einschalten (`start()`), wenn (a) während des Schließens **kein** `lfx:play` kam
  (der Modal-Fix ruft `play()` synchron im `after` auf, der Observer läuft danach als Microtask), (b) die Route noch `lfx=tv` ist und (c) `#videoOsdPage:not(.hide)` fehlt.
  In `plus`/`prime` ist „Details“ eine Navigation (`titleHref`), also ein Verlassen mit Stopp.
- **„Von vorne“ / „In der Mediathek ansehen“:** TV stoppen, dann `deps.playFromStart(id)` (Jellyfin-Player ab Anfang, `core/playback.js`, `resume:false`).
  Erzeugt bewusst einen normalen „Weiterschauen“-Eintrag.
- **Zappen** meldet keinen Fortschritt (nie `/Sessions/Playing*`, nie `StartTimeTicks` an der HLS-URL; Server-Fallen siehe `docs/live.md`).
- **Pausen:** `filler`/`fill`/`nightfill` wie LIVE (Trailer, „Gleich: …“, Füllprogramm); `closedown` = ruhige Karte „Sendepause – weiter um 05:00“.
- Jede Komponente und die Engine räumt in `destroy()`/`dispose()` vollständig auf.

## Routen-Nebenwirkungen
- `lfx=tv` ist **nie** Startseite: `features/home.js`, `mobilenav.js` (flix), `plus/switcher.js`, `plus/favempty.js`, `live/home-route.js`, `plus/home.js`, `prime/home-route.js`,
  `retro/home-route.js` prüfen ohnehin auf beliebiges `lfx` und sind zuständig-frei (Test `tests/tvmode-route.test.js`). Kein Billboard, kein Switcher, kein Fav-Leerzustand.
- **Umleitung:** `features/themeroute.js` leitet `lfx=tv` unter `retro`, `store`, `live` und `html.layout-tv` per `location.replace('#/home')` zurück (kein History-Eintrag);
  unter `live` greift zusätzlich der Wächter `features/live/guard.js`. Unter `flix`/`plus`/`prime` gibt es keine Umleitung.
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
- Layoutumschaltung nur über `.is-phone` / `.is-landscape` am Root (siehe oben), nicht über eigene `@media`.
- Jellyfin-Fallen: `.card` und `.libraryPage` nicht verwenden/treffen; nichts an `#videoOsdPage`; keine React-Knoten mutieren.

## Dev-Harness `build/tvmode-dev.html|js` (Welle W3)
Über `serve` als `/tvmode-dev.html` (Fake-Katalog aus `build/live-dev.js` **kopiert**, kein Netzwerk, `fakePlayer: true`). Parameter:
`design=flix|plus|prime` (Klasse `lfx-theme-<id>` + Design-CSS), `phone=1`, `now=<ISO>` (Testuhr), `channel=N`, `state=playing|pause|closedown|error|gesture|muted|loading`,
`chrome=1` (Attrappe der Jellyfin-Kopfleiste mit `--lfx-header-h`), optional `tab=now|epg`, `landscape=1`, `debug=1` (`window.__lfxTvm`). Marker: `html[data-tvm-dev-ready]` sobald
`onReady` kam. Lädt `dist/lenztvmode.js|css` (bzw. `src/` per Modul) wie `live-dev.html`.

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
- `DEBOUNCE_MS` 250. Beim `tune()` stößt der Controller sofort `player.prefetch(itemId, { signal })` für das Ziel an (Folgedruck bricht ab); `play()` übernimmt Cache/laufende Anfrage (Details: `docs/live.md` „Player: Rückfall, Fehlercodes, Vorauflösung, Gain“). Nach 1 s stabilem `playing` (nur Programm) werden Sender ±1 vorausgelöst (max. 2, einmal je Sendung, nichts bei Füllern/Sendepause; mit Vorwärmen stattdessen `prewarm`, siehe „Startablauf und Vorwärmen“). `ctl.stats()` → `{ zaps:[{channel,ms}], lastMs, avgMs }` (letzte 10 Umschaltungen tune → playing; Debug: `window.__lfxTvm.ctl.stats()`).
- Snapshot: `card.code` (Fehlerkarte, Kurzcode, `NET` bei network ohne Code); die Ansicht zeigt „Code: X“ (`.lfx-tvm__card-code`, Größe/Deckkraft inline gesetzt).
- Doppeltipp (Touch) schaltet Vollbild nur mit echtem Element-Vollbild (`document.fullscreenEnabled`/`webkitFullscreenEnabled` + `requestFullscreen` am Root, oder Vollbild ist schon an; Override `opts.canNativeFullscreen()`). Tipps auf `.lfx-tvm__zap` zählen nicht zum Doppeltipp.
- Tipp/Klick-Toggle (Touch und Maus): Ist die Leiste (`is-controls`) sichtbar, blendet der nächste Tipp/Klick ins Bild alles aus (`hideAll()`: Leiste, Senderkarte `is-zapping`, Timer, offenes Menü per `controls.closeMenu()`, Fokus in der Leiste per `blur()`). Ist nur die Senderkarte oder nichts sichtbar, zeigt er die Leiste. Maus: Ausblenden um `MOUSE_HIDE_MS` (250 ms) verzögert, `dblclick`/zweiter Klick verwirft es (Vollbild flackert nicht); danach blendet `pointermove` erst ab 8 px Abstand zur Klickposition wieder ein (Chrome feuert Pseudo-Bewegungen).
- Handy-Player (`phone.css`): `top: calc(var(--lfx-tvm-head) - 2px)`, weil die echte Kopfleiste am iPhone bruchzahlig hoch ist und sonst ein 1–2-px-Spalt die Liste durchscheinen lässt.
- EPG-Raster: Titel und Zeit stehen in `.lfx-tvm__epg-cell-text` (sticky, `left` = Senderspaltenbreite + 4 px, `max-width: min(100%, var(--tvm-vis))`); die Zelle ist `overflow: clip`. `epg-grid.js` setzt `--tvm-vis` (sichtbare Restbreite) per rAF-gedrosseltem Scroll-Listener, nach `renderRows`/Tageswechsel und im ResizeObserver nur auf links unter die Senderspalte ragende Zellen (bei verstecktem Raster nichts).
- `ctl.volumeSupported` ist true bei nativem `volume`, aktivem Gain oder offenem Gain-Versuch (`player.volumeCanTry()`); scheitert er (`volume-mode` → `mute-only`), springt der Pegel auf 100 und der Hinweis „nur stumm“ erscheint.

## Tests (Wellen)
Controller (Zappen, Offset, Sync, Füller/Sendeschluss, Gesehen, Autoplay, Aufräumen ActiveEncodings), Modell (`gridRows` über 05:00, `nowAll`), Hülle (match/mount/unmount/teardown,
PiP-Ausnahme, keine Fortschrittsmeldung, Design-Matching, Umleitung), Importgrenzen-Test (Engine importiert nur `src/js/live/**`; Hülle/core/shared nie daraus),
Token-Test (nur Kern-`--lfx-*`), Build-Wächter. `// @vitest-environment jsdom` pro Datei, keine Netzwerkzugriffe.

## Details-Karte (seit 1.11.1)
- „Details“ (Info-Bereich, Info-Karte) öffnet in flix, plus und prime die Detailkarte (`features/modal.js`) als Overlay über dem laufenden TV: `openModal(id, { overlay: true })`. Der TV wird weder gestoppt noch neu gestartet, Bild und Ton laufen weiter (die frühere Stopp/Resume-Logik in `features/tvmode/page.js` ist entfernt).
- Die Tasten bleiben gesperrt (`BLOCK` enthält `.lfx-modal-open`), damit Zappen nicht im Modal greift.
- plus/prime zeigen die Karte im Look des Designs (`src/css/themes/plus|prime/modal.css`) und im Fuß einen Link „Zur Titelseite“ (schließt, dann `titleHref`). Das Verlassen der Seite stoppt den TV wie üblich.
- „Abspielen“ in der Karte geht über `core/playback.js` und feuert `lfx:play`; die Engine (`live/tvmode/entry.js`) stoppt dann den TV.

### Lautstärke 0 (1.11.2)

Pegel 0 ist in jedem Modus stumm und läuft immer über `muted` (`silent() = muted || vol === 0`), da die Volumen-Probe auf iOS fälschlich `native` liefern kann. `setMuted(false)`/`toggleMute` bei Pegel 0 stellt den letzten Pegel > 0 wieder her, der mindestens 1 s stand (`VOL_SETTLE_MS`; Zwischenwerte beim Ziehen zählen nicht; Fallback Startpegel bzw. 50, Pref `volume` wird gespeichert). Nach jedem erfolgreichen Start wird nur in Richtung stumm abgesichert (`if (silent()) player.setMuted(true)`), nie ohne Nutzergeste entstummt (Autoplay-Sperre `mutedByPolicy` bleibt erhalten).

### Messanzeige und Vorauflösung (1.11.2)
- `NEIGHBOR_MS` ist 1000 (Nachbarsender ±1 schon 1 s nach stabilem `playing` vorauflösen).
- `opts.zapStats` (Hülle: Hash `lfxdebug=1`/`0`, gemerkt in `localStorage` `lfx-zapstats`; Harness `?zapstats=1`) mountet `ui/zapstats.js` (geteilte Datei, wirkt auf LIVE und TV-Modus, Klasse `lfx-zapstats`) in `.lfx-tvm__player`. Der Controller feuert dafür `zap` (`{ channel, ok, keyMs, timing, code?, reason? }`; `keyMs` = ab Tastendruck inkl. Entprellung, `timing` = `res.timing` des Players) und bietet `ctl.volumeMode()`. `ctl.stats().zaps[]` trägt zusätzlich `timing`. Details: `docs/live.md` „Messung, Messanzeige …“.

### Startablauf und Vorwärmen (1.11.3, Varianten 1.11.5 entfernt)
- Der TV-Modus nutzt den gemeinsamen Player: Die Startposition wird beim Setzen der Quelle vorab als Default-Startposition gesetzt, `loadedmetadata` springt nur bei mehr als 1,5 s Abweichung nach (fest; die Weiche `lfxzap` ist entfernt, iPhone-Messung ohne belastbaren Unterschied). Debug-Schalter `lfxhls=1` zusammen mit `lfxdebug=1`. Die Messanzeige zeigt eine dritte Zeile (Quelle, Grund, Sprung, Puffer, Warten).
- „Vorwärmen“ ist seit 1.11.6 **Standard an** (Hash `lfxwarm=0|1`, `deps.zapWarm` als Getter, Netzregel). Der Controller nutzt den gemeinsamen Nachbar-Vorwärmer `live/player/neighbors.js` (`createNeighbors`, geteilt mit LENZ LIVE; Importgrenze bleibt `src/js/live/**`): `arm('play')` wärmt die Nachbarsender ±1 per `player.prewarm(itemId, offsetMs)` vor (Playlist, Init, erstes Segmentbyte, alle 35 s erneut, max. 10×), `arm('error')` tut das 2 s nach einer Fehlerkarte (nur `video`/`browser`/`audio`); `stop()` bei Zappen, neuer Sendung, Pause/Stopp, dispose. `NEIGHBOR_MS` und `WARM_TICK_MS` exportiert `controller.js` weiter. Zeile 4 der Messanzeige zeigt Ergebnis und Grund. Details: `docs/live.md`, Abschnitte „Startablauf und erweiterte Messanzeige“ und „Vorwärmen“.
- **Fehlerkarte mit Grund (1.11.6):** Meldet der Player ein `hint` (M3 bei ungeeignetem Bildformat, z. B. h264 HDR), setzt der Controller `card.hint = '<hint> wird von diesem Gerät nicht unterstützt'`; `player-view.js` zeigt es als `.lfx-tvm__card-hint` unter dem Code (Details und Liste: `docs/live.md`, „Player: Rückfall, Fehlercodes …“).
- **Klasse `lfx-tvm-bgplay` (1.11.6):** Die Engine (`entry.js`, Helfer `bgCls`) setzt sie auf `<html>`, solange der TV im Hintergrund-Bild-in-Bild weiterläuft (in `suspend()` bei aktivem PiP und im PiP-`onChange`); entfernt bei `resume()`, PiP-Ende, `stop()` (auch `lfx:play`/`bail`) und `dispose()`. Zweck: Das Vorladen der Startseite (`features/rows/prefetch.js`) pausiert dann (zusätzlich muss `#lfx-tvm-bg video` existieren, gegen eine hängende Klasse). Eigentümer ist die Engine, die Hülle setzt sie nie. Das Öffnen des TV-Modus selbst beendet das Vorladen (`stop()`); fertige Zeilen bleiben im 10-min-Cache.
- **Datensparmodus (1.12.0, Vertrag `docs/js-contracts.md` „Datensparmodus“):** `defineZapWarm(deps)` (`features/live/zapflag.js`) setzt neben `deps.zapWarm` den Getter `deps.zapPrefetch` (= `!isDataSaver()`); `zapWarmEnabled()` ist bei aktivem Modus false (kein Vorwärmen). Unter LENZ LIVE ist der Modus nie aktiv, dort gilt weiter alles wie bisher. Wie `zapWarm` ein Getter: nach `{ ...deps }` erneut `defineZapWarm` aufrufen. Der Controller reicht `createNeighbors` einen **Delegations-Player** (`Object.assign(Object.create(player), { prefetch })`, `controller.js`): `prefetch` liefert bei `deps.zapPrefetch === false` `{ ok:false, reason:'off' }`, alles andere (`prewarm`, `warmNote`, …) läuft über den Prototyp weiter. So bleibt `live/player/neighbors.js` unverändert und `dist/lenzlive.*` byte-gleich. Die Vorauflösung des **gewählten** Zielsenders (Liste/Ziffern) bleibt, sie ist eine Nutzeraktion. `instance.releaseWarm()` (`entry.js` → `controller.releaseWarm()`: Nachbar-Takt `stop()` + `player.releaseWarm()`; der laufende Sender bleibt unberührt): die Hülle (`features/tvmode/page.js`) ruft es bei `lfx:datasaver` (active) auf, vorgewärmte Sitzungen enden sofort statt nach <= 40 s. Senderbilder werden über `deps.imageUrl` (= `imageUrlFor`) automatisch kleiner, die Engine ist dafür unverändert.
- **Budget:** Die Engine (`dist/lenztvmode.min.js`) darf bis 128 KiB (131.072 B, `TVMODE_MIN_BUDGET` in `build/build.mjs`; 1.11.6: 127.392 B). Vorher 120/124 KiB.
