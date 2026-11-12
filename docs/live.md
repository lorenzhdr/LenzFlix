# LENZ LIVE (`live`, Beta) – Vertrag Hülle ↔ Engine

Design-ID `live`, Name „LENZ LIVE“. Lineares Fernsehen aus der eigenen Mediathek: 18 Sender mit deterministischem
Programm (gleich für alle), ein Fernseher mit anklickbarer Fernbedienung, EPG, Videotext. Keine Pause, nur
Umschalten/Ausschalten. Eigener Player ohne Fortschrittsmeldung → keine Spuren in „Weiterschauen“/Playback Reporting.
Keine fremden Marken-, Sender-, Geräte- oder Dienstnamen in Code und Texten. UI-Sprache Deutsch.

## Zwei Bundles

| Teil | Ort | Bundle | darf importieren |
|---|---|---|---|
| Hülle | `src/js/features/live/*` | `dist/lenzflix(.min).js` (Hauptbundle) | alles aus `core/`, `shared/` |
| Engine | `src/js/live/**` | `dist/lenzlive(.min).js` (IIFE, lazy) | **nur** Dateien in `src/js/live/` |

- Die Engine importiert nichts aus `core/`/`shared/`/`features/` (doppelter Modul-State). Alles Zustandsbehaftete über `deps`.
- Einstieg `src/js/live/entry.js` registriert `window.LenzFlixLive = { version: 1, create }` und enthält den Marker-String
  `'__LFX_LIVE_ENGINE__'` (Build-Wächter: darf nie im Hauptbundle stehen).
- **Drittes Bundle (1.10.0):** Der TV-Modus (`dist/lenztvmode(.min).js`, `docs/tvmode.md`) verwendet `schedule/*`, `player/*` (`index, stream, profile, tracks, video, watch, filler, events, fake`), `ui/logos.js`, `ui/overlay-util.js` und `ui/fullscreen.js` mit. Änderungen an diesen Dateien wirken auf zwei Bundles (`lenzlive` und `lenztvmode`), beide danach bauen und testen.
- Die Server-deps (`buildApiDeps`, `loadUser`, `fatalText`) liegen seit 1.10.0 in `src/js/features/live/deps.js` (vorher in `home.js`) und werden mit dem TV-Modus geteilt.
- CSS: `src/css/themes/live/index.css` → `dist/lenzlive(.min).css` (Design-CSS, per `core/themecss.js` geladen).
- Kein hls.js: Chrome (≥ 142) und Safari spielen HLS nativ, Chrome spielt MKV (h264/aac) direkt. Browser ohne
  beides (z. B. Firefox) → Störbild mit Hinweis (bekannte Grenze, Beta).

## Live geprüfte Server-Befunde (Prüflauf 11.11.2026, Jellyfin 12.x, Testkonto)
- Test-Mediathek: einige hundert Filme (fast alle MKV h264/aac 720p, einzelne HEVC mit DTS/EAC3), gut 150 Serien mit rund 9 000 Folgen, gut 100 Sammlungen.
- `POST /Items/{id}/PlaybackInfo?userId=` mit eigenem DeviceProfile funktioniert. h264-MKV → `SupportsDirectPlay: true`.
  HEVC → `TranscodeReasons` enthält `VideoCodecNotSupported` → für uns „nicht empfangbar“.
- **Immer `SubtitleStreamIndex: -1`** im PlaybackInfo-Body (sonst wählt der Server einen Standard-Untertitel und brennt evtl. ein) –
  **reicht allein nicht**: Eine MKV/HEVC-Folge mit DVDSUB (Default-Flag) lieferte trotz `-1` `SubtitleStreamIndex=3&SubtitleMethod=Encode`
  (`SubtitleCodecNotSupported`, also Einbrennen = Video-Umwandlung). Nötig sind zusätzlich `SubtitleProfiles` mit `Method:'External'` für
  **alle** Formate (`vtt, srt, subrip, ass, ssa, pgssub, dvdsub, dvbsub, sub`); dann fehlen `SubtitleStreamIndex`/`SubtitleMethod`, und
  `TranscodeReasons` ist nur noch `AudioCodecNotSupported` (live bestätigt). Angezeigt werden weiter nur Text-Untertitel. Schutz in
  `stream.js`: `SubtitleMethod=Encode` in der `TranscodingUrl` → „Kein Empfang“.
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

## `create(host, deps, opts) → instance`

- `host`: leeres `<div class="lfx-live-stage">` der Hülle (vollflächig, `position:fixed; inset:0`). Die Engine rendert
  alles (Fernseher, Fernbedienung, Overlays) in `host`. Klassen-Präfix `lfx-live-*`.
- Rückgabe synchron. Laden/Planen läuft async; Fortschritt über `deps.onProgress`, fertig über `deps.onReady`.

### `instance`
```js
{
  suspend(),          // Seite verlassen: Stream sofort stoppen (+ DELETE bei HLS), TV in Standby, Timer aus; Plan bleibt
  resume(host),       // wieder einhängen (Standby, Power nötig)
  dispose(),          // alles freigeben (Design-Wechsel, destroy)
  isOn() → boolean,
}
```

### `opts`
```js
{
  style: 'flat' | 'crt80' | 'silver' | 'plain',   // Standard 'flat'
  volume: 0..1, muted: false,
  lastChannel: 1..18,                              // Standard 1
  audioPref: { [itemId]: audioStreamIndex } | null, // optional, pro Sitzung
  phone: false,  touch: false,                      // wie bei store
  debug: false,                                     // window.__lfxLiveDebug === true → window.__lfxLive
  now: null | (() => ms),                           // Testuhr (Harness ?now=), sonst Date.now
  fakePlayer: false,                                // Harness: Testbild-Canvas statt echter Streams
}
```

### `deps` (von `features/live/home.js` gebaut; die gemeinsamen Server-deps liefert `features/live/deps.js`)
```js
{
  catalog: RawCatalog,                       // siehe unten, von der Hülle geladen (IndexedDB-Cache pro Sendetag)
  user: { id, name, isAdmin, audioLang, subLang, subMode },   // aus /Users/Me (Configuration)
  server: { deviceId },                     // ApiClient.deviceId()
  request(method, path, { params, body, signal }) → Promise<json|null>, // mit Authorization-Header; nie loggen
  streamUrl(path, params) → string,         // absolute URL inkl. ApiKey (nie loggen, nie in Fehlertexte)
  imageUrl(id, { type, maxWidth, maxHeight, tag }) → string,   // ohne api_key
  getBoxSetItems(boxsetId) → Promise<string[]>,                // Ids der Titel einer Sammlung (sortiert egal)
  loadTrailer(itemId) → Promise<{ url, durMs } | null>,        // lokaler Trailer (direkt abspielbar) oder null
  setPlayed(itemId, true) → Promise,                           // nur für die Gesehen-Regel
  channelConfig: { [no]: genreLabel },      // Admin-Belegung der Plätze 5–16 (leer = automatisch)
  savePrefs(partial),                       // { style, volume, muted, lastChannel } → Hülle speichert pro Nutzer
  leaveToLibrary(itemId | null, { type, seriesId }) → Promise,  // dauerhaft zurück ins vorherige Design
  previousThemeName: string,                // z. B. 'LENZFLIX' (für Menütexte)
  openThemePicker(), openDashboard(), logout(),
  toast(text),
  onProgress(fraction, label), onReady(), onFatal(err),
}
```

### `RawCatalog` (schlanke Jellyfin-Items, PascalCase wie vom Server)
```js
{
  movies:   [{ Id, Name, RunTimeTicks, Genres, OfficialRating, ProductionYear, PremiereDate, DateCreated, LocalTrailerCount }],
  series:   [{ Id, Name, Genres, OfficialRating, ProductionYear, DateCreated }],
  episodes: [{ Id, Name, SeriesId, SeriesName, ParentIndexNumber, IndexNumber, RunTimeTicks, PremiereDate, DateCreated, OfficialRating }],
  boxsets:  [{ Id, Name, ChildCount }],
  loadedAt: ms,
}
```

## Zeitplan (`src/js/live/schedule/`, rein, deterministisch)

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
            name: 'LIVE Kino' | 'LIVE ‹Genre›' …, kind: 'movies'|'series'|'genre'|'special', genreLabel?: string }
PlanEntry = { start, end, type: 'program'|'filler'|'fill'|'nightfill'|'closedown',
              itemId?, seriesId?, rerun?: bool, premiere?: 'film'|'episode', theme?: string, age?: number,
              label?: string, reason?: 'grid'|'rating'|'empty'|'end' }
```
- Senderplätze: 1 Kino, 2 Klassik, 3 Serie, 4 Marathon, 5–16 Genres, 17 Premiere, 18 Thementag.
- `filler` = Lücke ≤ 30 min (Trailer der nächsten Sendung oder Pausenbild „Gleich: …“), `fill` = größere Lücke am Tag mit kurzen
  Titeln aus dem Gesamtkatalog (`itemId` gesetzt, Hinweis „Füllprogramm“), `nightfill` = wie `fill` am Tagesende
  (Hinweis „Füllprogramm – reguläres Programm ab 5:00“), `closedown` = Testbild (leerer Sender, Rest < 5 min).
- Regeln und Randfälle sind in den Dateiköpfen von `src/js/live/schedule/*` und in den Tests `tests/live-schedule-*.test.js` / `tests/live-special-*.test.js` dokumentiert.
- Determinismus: kein `Math.random`, keine Lokalzeit, kein `Intl`. Zeit nur über `schedule/time.js`, Zufall nur über Hashes
  (`schedule/hash.js`: `fnv1a`, `keyHash`, `mulberry32` …), Sortierung nach Code-Unit-Reihenfolge, unabhängig von der Eingabereihenfolge.
  Alle Clients berechnen denselben Plan.
- Der Plan wird bei jedem Laden neu berechnet (kein Persistieren); Sammlungsinhalte für den Thementag holt `prepare()` vorab.
- Füller: Lücken bis ~34 min (30 min Schwelle plus Rundung auf das 5-min-Raster) sind `filler`; größere Lücken füllt `fill`.

### Hilfs-API für Spezialsender
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

### Premiere (Sender 17, `schedule/premiere.js`)
Einheiten: Film = 1 Einheit; neue Folgen einer Serie vom selben Sendetag werden in Folgenreihenfolge zu Blöcken (≤ 3 Folgen und ≤ 2 h).
Nur Einheiten mit Hinzufügedatum ab Epoche **01.11.2026** (`EPOCH`) werden Premieren. Kette nach `(addedAt, id)`: Kandidat =
max(Tag nach dem Hinzufügen, vorherige Premiere + 1); liegt er mehr als **15 Tage** (`MAX_WAIT_DAYS`) nach dem frühesten Tag, wird die Einheit
verworfen (keine Premiere). Tagesplan: Premiere 20:15 (Freigabe 16 → 22:00, 18 → 23:00; dann um 20:15 Wiederholung), Rest Wiederholungen
(`rerun`) aus dem Pool der Neuzugänge (Fenster 30 … 365 Tage, kleinstes mit ≥ 24 h), Eimer-Rotation (Schlüssel `premiere`).

### Thementag (Sender 18, `schedule/themeday.js`)
Arten: **Filmreihen** (`boxset`: Sammlungen mit ≥ 2 planbaren Titeln), **Jahrzehnte** (`decade`, ≥ 6 h Material), **Pilotfolgen** (`pilot`: S1E1
verschiedener Serien, ≥ 3) und **Überlänge** (`overlength`: Filme ab 150 min, ≥ 2). Die Art des Tages ergibt eine Permutation der verfügbaren
Arten pro Woche (Hash der Woche), zyklisch über 7 Tage (nie dieselbe Art an zwei aufeinanderfolgenden Tagen, außer bei nur einer Art); ist die Art
nicht planbar, gilt die nächste. `prepare(ctx, Ds)` lädt die Sammlungsinhalte (`getBoxSetItems`, höchstens 12 Ladevorgänge pro Tag), `planDay`
ist synchron und nutzt nur den Cache. Reicht das Material nicht, folgt ein zweites Thema, danach Füllung. Keine Personen-Themen (zu teuer für den Server).

### Bekannte Grenzen
- Kein hls.js: Browser ohne native HLS-/MKV-Wiedergabe (Firefox) zeigen Störbild mit Hinweis.
- Keine Schauspieler-/Regie-Thementage (Personendaten zu langsam).
- Nur Direktwiedergabe und Umpacken (Remux); Video wird nie transkodiert (HEVC u. Ä. = „nicht empfangbar“).
- Plan wird bei jedem Laden neu berechnet; Füller bis ~34 min.

## Player (`src/js/live/player/`)
```js
createPlayer({ video, deps, now, fake: false, canvas, getInfo }) → Player   // getInfo() → { channel, title }: nur für fake (Testbild)
Player = {
  unlock(),                                  // SYNCHRON im Klick-Handler von Power aufrufen (Autoplay-Freigabe für das eine <video>, iOS)
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
- Genau ein `<video class="lfx-live-video" playsinline disablepictureinpicture x-webkit-airplay="deny">` pro Instanz, ohne
  `controls`, nie im DOM umhängen. Pause abfangen (Ereignis `pause` → weiter an Live-Position; Media-Session-Handler `pause`,
  `seekbackward`, `seekforward` als No-op). Zappen entprellt die UI (400 ms), nicht der Player.
- DeviceProfile wie im Prüflauf: DirectPlay `mkv,mp4,m4v` + h264 + `aac,mp3` (nur wenn `canPlayType` es bejaht; Safari: kein mkv);
  Transcoding `ts`/hls, VideoCodec `h264`, AudioCodec `aac`, 2 Kanäle; `AllowVideoStreamCopy: true`, `EnableTranscoding: true`.
  HLS nur, wenn der Browser HLS nativ kann (`canPlayType('application/vnd.apple.mpegurl')`), sonst `reason: 'browser'`.
- Fehlt dem Konto das Recht zur Ton-Umwandlung → `reason: 'audio'` („Ton auf diesem Gerät nicht empfangbar“).
- Gesehen-Regel (`player/watch.js`): Position (jetzt − `entry.start`) ≥ 90 % der Sendedauer, eingeschaltet spätestens 10 min nach `entry.start`,
  Unterbrechung (Wegzappen/Aus) < 60 s toleriert, ab 60 s verworfen; nur `type: 'program'` und `fill`/`nightfill` mit `itemId` – nicht Trailer/Füller. Einmal pro Ausstrahlung.
  Die App ruft `watch.tune` erst nach erfolgreichem Start (Ergebnis `ok`, Offset zu diesem Zeitpunkt aus der Uhr) bzw. nach erneutem `playing`; bei Störbild/Fehler, Stillstand > 60 s, Pausen-/Testbild und Aus ruft sie `watch.leave()` (bei Fehler/Stillstand `leave(true)` = ohne Prüfung, nie gesehen).
- `fake: true`: kein Netzwerk; zeichnet ein Testbild mit Sendername/Titel/Zeitcode auf `canvas` (Harness).

## UI (`src/js/live/ui/`)

DOM in `host` (Engine):
```
.lfx-live-app.lfx-live--style-<style>  [.is-on] [.is-phone] [.is-landscape] [.is-fullscreen] [.has-epg] [.has-ttx] [.has-menu]
  .lfx-live-room
    .lfx-live-tv
      .lfx-live-screen
        video.lfx-live-video
        canvas.lfx-live-noise          // Rauschen beim Umschalten (crt80/silver), Schwarzbild (flat/plain)
        canvas.lfx-live-fake           // nur fakePlayer
        .lfx-live-card                 // Pausenbild / Testbild / Störbild / Füllprogramm-Hinweis
        .lfx-live-osd                  // Senderlogo, Jetzt/Danach, Fortschritt, Lautstärke, Hinweise
        .lfx-live-overlay              // Overlays (EPG, Videotext, Menü) hängen hier
      .lfx-live-tv__led
    .lfx-live-remote
```
Controller mit Abhängigkeits-Injektion (testbar ohne echte Module):
```js
// ui/app.js
createApp(host, { scheduler, player, watch, pickFiller, overlays: { epg, ttx, menu } /* Fabriken */, deps, opts, time }) → instance
// player: Objekt oder Fabrik ({ video, canvas, getInfo }) → Player;  time: { formatClock, formatDay, broadcastDayOf, dayBounds }
// entry.js verdrahtet die echten Module: normalizeCatalog → createScheduler → createPlayer → createApp
```

Overlay-Vertrag (`ui/epg.js`, `ui/teletext.js`, `ui/menu.js` exportieren je eine Fabrik):
```js
createEpg(ctx) / createTeletext(ctx) / createMenu(ctx) → Overlay
Overlay = { el, open(arg?), close(), isOpen() → boolean, onKey(key) → boolean /* true = verbraucht */, tick?(now) }
ctx = {
  scheduler, now(), channels(), currentChannel() → no, tune(no), closeOverlay(),
  formatClock, formatDay, broadcastDayOf, dayBounds,
  style(), setStyle(id), styles: [{ id, name }],
  user, isAdmin, channelConfig, previousThemeName,
  leaveToLibrary(itemId|null, meta), openThemePicker(), openDashboard(), logout(),
  imageUrl, toast,
}
```
Tasten (normalisiert, von Fernbedienung und Tastatur): `power, 0…9, ch+, ch-, vol+, vol-, mute, epg, info, ok, up, down, left, right,
back, menu, txt, red, green, yellow, blue, audio, subs, restart, fullscreen, guide`.
Tastatur am Desktop (`ui/keys.js`): ↑/↓ = ch± (ohne Overlay) bzw. up/down, ←/→, Ziffern, `+`/`-`, `M`, `G` (epg), `I`, `T` (txt),
`Z` (guide = Fernsehzeitung), `F` (fullscreen), `Esc` (esc), `Backspace` (back), `Enter` (ok), Leertaste wird verschluckt. Nicht in Eingabefeldern, nicht bei offenem Picker.
`esc` (nur Tastatur, ab 1.9.3): bei offenem Overlay oder im Vollbild wie `back`, sonst öffnet es das Menü – auch im Standby.
Standby (ab 1.9.3): `menu` und `guide` öffnen ihr Overlay ohne Einschalten; bei offenem Overlay gehen alle Tasten außer `power`/`fullscreen` an das Overlay;
Klick auf den Bildschirm schaltet bei offenem Overlay nicht ein; `ctx.tune(no)` im Standby schaltet auf diesem Sender ein.

## CSS (`src/css/themes/live/`), Scope `html.lfx-js.lfx-theme-live:not(.layout-tv)`
`index.css` importiert in dieser Reihenfolge: `tokens.css, shell.css, tv-crt80.css, tv-silver.css, tv-flat.css, tv-plain.css,
remote.css, osd.css, card.css, epg.css, magazine.css, teletext.css, menu.css, mobile.css, fullscreen.css`.
Nur `--lfx-*`-Tokens aus `tokens.css` (eigene Live-Tokens heißen `--lfx-live-*`). Keine externen Assets, keine Webfonts.

## Hülle (`src/js/features/live/`)
- `home.js`: Startseite `#/home` (ohne `lfx`, ohne `tab=1`) → `#lfx-live-home` als erstes Kind von `#homeTab`,
  `html.lfx-live-home-on`, Ladeanzeige „Sendersuchlauf …“, `ensureThemeJs('live')`, Fallback-Panel (Erneut versuchen,
  Design wechseln, Zu ‹vorherigem Design›, Abmelden). `unmount()` → `instance.suspend()`, Dispose nach 3 min oder sofort bei
  Design-Wechsel/`destroy()` (`destroyLive()` in `main.js`).
- `guard.js`: solange `live` wirksam (Modern, kein TV, bereit): alle Mediathek-Routen per `location.replace` auf `#/home`.
  Erlaubt: `/home` (ohne `lfx`), `/dashboard*`, `/mypreferences*`, `/userprofile*`, `/login`, `/selectserver`, `/addserver`,
  `/startup`, `/wizard`, `/forgotpassword`, `/resetpassword`, `/video`, `/queue`, Admin-Seiten (`body.dashboardDocument`).
- `leave.js`: `leaveToLibrary(itemId, { type, seriesId })` → `await setTheme(getPreviousTheme(), { source: 'user' })`, erst danach
  navigieren: flix `#/details?id=…&serverId=…` (Folge direkt), plus `titleHref(id)` (Folge direkt), prime/retro/store `SeriesId`
  statt Folge (`titleHref` bzw. `#/home?lfx=title&id=`), ohne Id `#/home`.
- `config.js`: `window.LenzFlixConfig.liveChannels` (Objekt `{5:'Action'}` oder String) → sonst CSS-Variable
  `--lfx-live-channels`. Format `"5=Action;6=Komödie"` (Plätze 5–16, Genre-Label wie in Jellyfin; Vergleich nach
  `trim().normalize('NFC').toLowerCase()`). Die Admin-Zeile zum Kopieren: `:root{--lfx-live-channels:"5=Action;6=Komödie"}`.
  Sie gehört im Custom CSS **unterhalb** der `@import`-Zeile (davor ist das `@import` laut CSS-Spezifikation ungültig, das Theme lädt nicht mehr).
- `prefs.js`: `lfx.live.<name>.<uid>` in localStorage (`tvstyle`, `volume`, `muted`, `lastChannel`). Standard-Stil `flat`; der Stil liegt unter `lfx.live.tvstyle.<uid>` (der alte Schlüssel `style` wird nicht mehr gelesen, damit alle einmalig den neuen Standard bekommen) und wird nur bei aktiver Wahl im Menü gespeichert, nie bei Lautstärke-/Senderwechsel.
- `data.js`: lädt RawCatalog (Filme, Serien, Folgen, Sammlungen; schlanke Felder, keine Bilder/UserData), cached pro Nutzer und
  Sendetag in IndexedDB (`lfx-live`, Store `catalog`), Fallback Speicher-Cache. Fortschritt → „Sendersuchlauf …“.
- `core/theme.js`: `prevTheme` – beim Wechsel *zu* `live` wird das bisherige Design gespeichert (lokal `lfx.theme.prev.<uid>`,
  Server `CustomPrefs.prevTheme` im selben Upload); `getPreviousTheme()` → nie `live`, Fallback `flix`.

## Modulübersicht
- `src/js/live/entry.js`: Einstieg, `window.LenzFlixLive`, verdrahtet Katalog → Planer (7 Tage `prepare`) → Player → App.
- `schedule/`: `time.js` (MEZ/MESZ-Arithmetik, Raster), `hash.js`, `rating.js`, `catalog.js` (Normalisierung), `plan.js` (Sender 1–16, Kontext),
  `series.js`, `pool.js` (Eimer-Rotation), `fill.js` (Tagesbaustein), `specials.js` (Registry), `premiere.js`, `themeday.js`, `index.js` (öffentliche API).
- `player/`: `index.js` (API), `stream.js` (PlaybackInfo, Profil in `profile.js`), `video.js` (ein `<video>`, Pause-Abfang, Sync), `tracks.js`,
  `watch.js` (Gesehen-Regel), `filler.js`, `events.js`, `fake.js` (Testbild für Harness/Tests).
- `ui/`: `app.js` (Controller, Zapp-Entprellung, Overlay-Verwaltung), `tv.js`, `remote.js`, `keys.js`, `osd.js`, `card.js`, `logos.js`,
  `fullscreen.js`, `epg.js`, `teletext.js`, `menu.js`, `overlay-util.js`.
- Hülle `src/js/features/live/`: `home.js`, `home-route.js`, `guard.js`, `leave.js`, `config.js`, `prefs.js`, `data.js`, `index.js`.
- Harness `build/live-dev.html|js` (Fake-Katalog, kein Netzwerk; Route `/live-dev.html` über `build/serve.mjs`). Query: `phone=1`, `admin=1`,
  `now=<ISO>` (Testuhr, ohne Zone = lokal), `channels=5=Action;6=Komödie`, `style=`, `channel=`, `debug=1`, `real=1` (echter Player statt Testbild),
  `autopower=1` (mit `zap=`, `overlay=epg|ttx|menu|guide`, `page=`, `fullscreen=1`), `clean=1`, `idle=pause|test|error`, `music=0`, `remote=1`.
- Tests: `tests/live-*.test.js` (Hülle `live-hull-*`, Planer `live-schedule-*`/`live-special-*`, Player `live-player-*`, UI `live-ui-*`, Overlays `live-overlay-*`).

## Erweiterungen 1.9.1 (Vertrag für Pausenmusik, Fernsehzeitung, PDF)

### Pausenmusik `src/js/live/player/music.js` (+ `player/music-presets.js`)
```js
createMusic({ AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext, doc = document } = {})
  → { unlock(), setStyle(id), setLevel(vol01, muted), setEnabled(bool), setIdle(kind|null), isPlaying(), dispose() }
```
- `unlock()` wird **synchron in einer Nutzergeste** gerufen (Power, `userGesture`): legt den AudioContext lazy an bzw. ruft `resume()`. Vorher entsteht kein Context. Ohne `AudioCtx` ist alles ein No-op.
- `setIdle('pause'|'test'|'error')` startet (1,5 s Einblenden), `setIdle(null)` stoppt (0,6 s Ausblenden). Ohne Context, bei `setEnabled(false)` oder Pegel 0 klingt nichts.
- `setLevel(vol01, muted)`: Ziel-Gain = `muted ? 0 : vol01 * 0.45`, per `setTargetAtTime`.
- `setStyle('crt80'|'silver'|'flat'|'plain')`: wechselt das Preset (unbekannt → `flat`); läuft Musik, wird auf das neue Stück übergeblendet.
- `visibilitychange` (hidden) → `ctx.suspend()`, sichtbar und idle → `resume()`. `dispose()` stoppt, entfernt Listener, `ctx.close()`.
- `music-presets.js` exportiert `PRESETS = { crt80, silver, flat, plain }` als reine Daten (Tempo, Akkordfolge, Pattern, Instrument-Parameter). Kein `Math.random` (Rauschen/Hall per eigenem Seed-PRNG). Keine Instrumenten-Markennamen.
- Hülle: Pref `music` (Standard `true`, Schlüssel `lfx.live.music.<uid>`), an die Engine als `opts.music`, gespeichert über `deps.savePrefs({ music })`.

### Heftmodell `src/js/live/magazine/model.js` (rein, deterministisch, kein DOM)
```js
buildMagazine({ scheduler, today, formatClock, formatDay, dayBounds, overviews? }) → Magazine
collectTipIds(magazine) → string[]                     // Item-IDs aller Tipps + Titelseite (für Inhaltsangaben)
loadOverviews(ids, itemDetails) → Promise<Map<id, string>>   // eine Anfrage, gekürzt ~240 Zeichen an Satzgrenze, Fehler → leere Map
```
- `today` = Sendetag D (Zahl aus `broadcastDayOf`). Umfasst D … D+6. `overviews` (Map id→Text) ist optional; fehlt sie, bleibt `overview: null`.
- `Magazine = { title: 'LIVE Programm', subtitle: 'Die Fernsehwoche · 11.–17.11.2026', fileName: 'LIVE-Programm_2026-11-11.pdf', days: [{ D, weekday, date }], cover: CoverData, pages: Page[] }`
- `pages` (30): Index 0 `cover`, dann je Tag `tips`, `evening`, `day` (part 1: Sender 1–9), `day` (part 2: Sender 10–18), zuletzt `back`. Jede Seite hat `{ kind, no (1-basiert), D? }`.
- `Tip = { imageId (itemId oder bei Folgen seriesId), itemId, title, sub, year, genres: string[] (Anzeige-Labels), runMin, channelNo, channelName, time ('20:15'), start, badges: string[], age, overview|null, kindLabel ('Film'|'Serie'|'Premiere'|'Thementag'|'Marathon') }`
- `CoverData = { hero: Tip|null, teasers: [{ D, weekday, label }] }` (Thementage der Woche).
- `tips`-Seite: `{ kind:'tips', D, weekday, date, tips: Tip[] (≤5), theme: string|null }`.
- `evening`-Seite: `{ kind:'evening', D, weekday, date, channels: [{ no, name, rows: Row[] }] }` (Einträge mit Start ≥ 20:15 bzw. laufend um 20:15, bis Tagesende).
- `day`-Seite: `{ kind:'day', D, part: 1|2, weekday, date, channels: [{ no, name, theme|null, rows: Row[] }] }`.
- `Row = { time ('HH:MM'), start, title, sub ('' oder z. B. 'S1 E3–E7'), badges: string[], kind: 'program'|'fill'|'closedown' }`. `filler` fehlt; aufeinanderfolgende `fill`/`nightfill` → eine Zeile „Füllprogramm“; `closedown` → „Sendeschluss“; direkt aufeinanderfolgende Folgen derselben Serie → eine Zeile (Titel = Serie, sub = Folgenspanne).
- `back`-Seite: `{ kind:'back' }` (Impressum/Hinweise, Download-Hinweis).
- Hülle: `deps.itemDetails(ids) → Promise<Map<id, { overview }>>` (eine Anfrage `GET /Items?Ids=…&Fields=Overview&userId=…`).

### Heft-Ansicht `src/js/live/magazine/view.js`, Objekt `magazine/prop.js`, CSS `src/css/themes/live/magazine.css`
```js
createMagazine(ctx) → { el, open(opts?), close(), isOpen(), onKey(key) → boolean, tick?(t) }   // Overlay-Vertrag, Name 'guide'
createMagazineProp({ doc, onOpen, imageUrl }) → { el, setCover(tip|null), setStyle(id), destroy() }
```
- ctx wie andere Overlays plus `ctx.buildMagazine()` → `Promise<Magazine>` (mit Inhaltsangaben) und `ctx.downloadPdf(magazine, onProgress) → Promise<{ url, fileName }>`.
- `open({ autoPdf: true })` startet sofort die PDF-Erzeugung (Menüeintrag „Fernsehzeitung als PDF“).
- Wurzel `.lfx-live-mag` mit `data-style`; Seiten `.lfx-live-mag__page[data-kind]`; Kopfleiste `.lfx-live-mag__bar` (Seitenzahl, Tage, „Als PDF herunterladen“, danach Link `a.lfx-live-mag__pdf[download]`, Schließen).
- Tasten: `left/right` blättern, `red/green` Tag zurück/vor, `back` schließt (`false` zurückgeben, damit app schließt), `ok` auf fokussiertem Knopf.

### PDF `src/js/live/pdf/` (`writer.js`, `winansi.js`, `metrics.js`, `render.js`)
```js
createPdf() → { addPage(w, h) → Page, addJpeg(bytes: Uint8Array) → imgRef, toBytes() → Uint8Array }
Page: { setFill(r,g,b), setStroke(r,g,b), rect(x,y,w,h,{fill,stroke}), line(x1,y1,x2,y2,w), text(str, x, y, { font, size }), image(imgRef, x, y, w, h) }
// font: 'sans' | 'sans-bold' | 'serif' | 'serif-bold' | 'mono'  (Basisschrift-Namen nur in writer.js)
textWidth(str, font, size) → pt;  wrap(str, font, size, maxW) → string[]   (metrics.js)
encodeWinAnsi(str) → Uint8Array   (winansi.js)
renderMagazinePdf(magazine, { style, loadImage(imageId) → Promise<Uint8Array|null>, onProgress(done,total) }) → Promise<Uint8Array>   (render.js)
```
- A4 hoch 595×842 pt, Koordinaten oben-links in der API (writer rechnet um). Bilder als JPEG (`/DCTDecode`, Maße aus SOF). Keine URLs/Tokens im Ergebnis.

### Verdrahtung (Integration 1.9.1)
- `entry.js`: `overlays.guide = createMagazine`, `music = createMusic()`, `pdf = createPdfExport({ imageUrl, doc, now, time })` (`magazine/pdf-export.js`: Bild per `<img crossOrigin=anonymous>` → Canvas ≤ 360 px → JPEG 0,8; Fehler, Timeout 8 s oder tainted → `null` = Heft ohne Bild; Ergebnis Blob-URL) gehen als Parameter an `createApp`.
- `ui/app.js`: Overlay `guide` (Klasse `has-guide`, Taste `Z`, Fernbedienungstaste „Heft“); `openOverlay(name, opts)` reicht Optionen an `open()` durch. ctx zusätzlich: `buildMagazine()` (Heft für den aktuellen Sendetag, Inhaltsangaben per `loadOverviews` erst beim ersten Öffnen, Cache pro Sendetag), `downloadPdf(mag, onProgress)`, `openOverlay`, `musicEnabled()`, `toggleMusic()` (speichert `deps.savePrefs({ music })`).
- Musik: `card.js` meldet Kartenwechsel (`onKind(kind, reason)`); die App ruft `music.setIdle(kind)` nur bei `pause|test|error` und eingeschaltetem Gerät, nie bei „Zum Starten tippen“. `music.unlock()` synchron neben `player.unlock()` (Power, Tippen nach Autoplay-Sperre); `setLevel(vol/100, muted || mutedByPolicy)` (ohne Lautstärke-Unterstützung 1); `setStyle` mit dem TV-Stil; Aus/`stopAll`/Suspend → `setIdle(null)`, `dispose` → `music.dispose()`.
- Heft-Objekt: `.lfx-live-side` (Flex-Spalte neben dem Fernseher) enthält `.lfx-live-side__slot` (freier Raum, `container-type: size`) mit `createMagazineProp` und darunter die Fernbedienung. Passt das Objekt nicht (Slot < 110 px), setzt `onFit(false)` die Klasse `is-guide-key` am App-Wurzelelement, blendet das Objekt aus, und die Heft-Taste erscheint in der Fernbedienung. Handy, Vollbild und ≤ 760 px lösen die Seitenspalte per `display: contents` auf (Fernbedienung wie vorher). Heft-Taste: Desktop nur mit `is-guide-key`, Handy-Hoch- und -Querformat immer, Desktop-Vollbild nie.
- Menü: „Pausenmusik“ (Wert An/Aus, nach „Senderliste“) und „Fernsehzeitung als PDF“ (öffnet `guide` mit `{ autoPdf: true }`).
- Hülle: Pref `music` (`lfx.live.music.<uid>`, Standard an) → `opts.music`; `deps.itemDetails(ids)` → `GET /Items?userId&Ids&Fields=Overview` über `api.requestJson`, `Map(id → { overview })`, Fehler → leere Map.
- Harness: `?overlay=guide` (mit `?page=N` N-mal blättern), `?idle=pause|test|error` (Leerlaufkarte per `app.debugCard`), `?music=0`, `?remote=1` (Leiste einblenden); `deps.itemDetails` liefert Platzhaltertexte.

### Runde 2 (Fernsehzeitung vor der Szene, Heft auf dem Lowboard)
- Das Overlay `guide` hängt an der App-Wurzel (`.lfx-live-app`, `z-index: 40`, abgedunkelter und unscharfer Hintergrund, Doppelseite ~96 % der Höhe, Klick auf den Hintergrund schließt, am Handy Einzelseite bildschirmfüllend); EPG/Videotext/Menü bleiben im Fernsehbild. Tasten gehen weiter über `onKey` ans Heft.
- Röhre und Silber: das Heft-Objekt liegt per `position: absolute` auf dem Lowboard links neben dem Fernseher; der Slot ist quadratisch mit der Breite des freien Raums links (max. 240 px), der Platzwächter (Höhe ≥ 110 px) prüft damit „Breite ≥ 110 px“. Flat und Schlicht: weiter über der Fernbedienung (mit 14 px Sicherheitsabstand oben).
- EPG: Tagesleiste und ◀ ▶ Jetzt in einer Zeile (`.lfx-live-epg__bar`); Blöcke, die links über den sichtbaren Rand ragen, bekommen `--lfx-live-epg-vis` (Restbreite), der mitlaufende Text kürzt sich damit statt unter die Senderspalte zu rutschen.

## Dekor und Röhren-Effekte (1.9.4)
Infrastruktur für die Stile `crt80` und `silver`: Raum-Dekor, Gehäuse-Details und Glas, ohne gemeinsame Dateien anzufassen. Je Stil gehören nur `ui/decor-<id>.js` (Spezifikation) und `src/css/themes/live/decor-<id>.css` (Regeln unter `.lfx-live--style-<id>`).

### `ui/decor.js`
```
createDecor({ room, tv, screen, doc, onAction }) → { el, layers: { room, tv, glass }, setStyle(style), setDisplays({ on, clock, ch }), dispose() }
```
- Ebenen (alle `aria-hidden="true"`, `pointer-events: none`): `.lfx-live-decor` (erstes Kind von `.lfx-live-room`, hinter TV und Seitenspalte), `.lfx-live-tv__deco` (letztes Kind von `.lfx-live-tv`: Antenne, Gitter, Tastenreihen, Klappe), `.lfx-live-screen__glass` (in `.lfx-live-screen`, vor `.lfx-live-overlay` im DOM).
- `setStyle(id)` leert alle drei Ebenen und baut sie aus `SPECS[id]` neu (flat/plain/unbekannt: leer). Die App ruft es beim Aufbau und bei jedem Stilwechsel.
- Spezifikation `ui/decor-<id>.js`: `export default { room: Node[], tv: Node[], glass: Node[] }`, `Node = { cls, tag? = 'div', text?, display?: 'vcr'|'dvd'|'rcv', action?, tip?, count?: n, actionEach?: 'ch', children?: Node[] }`. `count: n` erzeugt n Kinder `<span class="lfx-live-d__i" style="--i:k">` (k = 1…n) vor `children` (z. B. Programmtasten). Neue Klassen heißen `lfx-live-d-…`. Platzhalter tragen `lfx-live-d-todo` (per CSS ausgeblendet).
- Anzeigen: Elemente mit `data-display`. `setDisplays({ on, clock:'20:15', ch:5 })` (fehlende Felder behalten den letzten Wert): `vcr` → immer die Uhrzeit (auch im Standby; `--:--` nur ohne bekannte Uhrzeit); `dvd` → an ? Uhrzeit : leer; `rcv` → an ? `P` + zweistelliger Sender : leer. Zusätzlich an `.lfx-live-decor` die Variablen `--lfx-live-clock-h` (Stundenwinkel in Grad, 0–360) und `--lfx-live-clock-m` (Minutenwinkel) für eine Wanduhr (sie zeigt auch im Standby die Zeit). Geschrieben wird nur bei Änderung.
- Einbau `ui/app.js`: `syncDecor()` bei Ein/Aus, Senderwechsel und Stilwechsel; Uhrzeit über `ctx.formatClock` und einen Minuten-Timer (`later('clock')`, läuft auch im Standby, kein rAF; der Planer bleibt unberührt). `dispose` entfernt die Ebenen.

### Bedienbare Geräte (1.9.5)
Die gezeichneten Geräte der Röhren-Stile sind bedienbar; die Ebenen bleiben `aria-hidden`, die Fernbedienung bleibt der Tastatur-/Screenreader-Weg (Geräteteile sind nicht fokussierbar).
- **Aktionen im Dekor:** Knoten mit `action` (`'power'`, `'ch:N'`, `'key:ch+'`, `'key:ch-'`, `'key:vol+'`, `'key:vol-'`, `'key:epg'`) bekommen `data-action`, `tip` wird zum `title` (Tooltip). `actionEach: 'ch'` (mit `count`) macht Kind k zu `ch:k` mit Tooltip „Sender k“. CSS (`decor.css`) setzt für `[data-action]` `pointer-events: auto`, `cursor: pointer`; `:active` drückt die Taste ein (je Stil in `decor-<id>.css`). `createDecor` lauscht je Ebene per Delegation auf `click` (ein Aufruf pro Klick/Tipp) und ruft `onAction(action)`. `data-on="1|0"` an `.lfx-live-tv__deco` zeigt den Netzschalter eingerastet (crt80) bzw. den LED-Ring blau/rot (silver).
- **Röhre 80er:** Programmtasten 1–8 (`ch:k`, schalten Sender k, bei aus: einschalten auf diesen Sender; die Taste des aktuellen Senders leuchtet), Netzschalter (`power`, bei an eingerastet). Drehknöpfe `.lfx-live-tv__knob--a` (Sender) und `--b` (Lautstärke) per `ui/knobs.js`.
- **Silber-Röhre:** Tastenleiste `P+ P− V+ V− EPG` (`.lfx-live-d-key`) und runder Netzschalter `.lfx-live-d-pwr` mit LED-Ring (rot Standby, blau an).
- **Standby-Verhalten nur für Gerätetasten** (Fernbedienung unverändert): `ch±` schaltet ein, und zwar auf den nächsten/vorherigen Sender ab dem zuletzt gesehenen (1 ↔ 18 endlos); `epg` schaltet ein und öffnet die Programmübersicht; `vol±` ändert nur die Lautstärke (TV bleibt aus, kein OSD); `ch:N` schaltet auf N ein; `power` schaltet um. Verdrahtung: `onDeviceAction` in `ui/app.js`.
- **`ui/knobs.js`:** `createKnobs({ tv, getState, onChannel, onVolume, onSound, onPreview, win })` → `{ setChannel(n), setVolume(v), sync(), dispose() }`; `getState()` → `{ active, channel, count, volume }`, `active` = Stil `crt80` (sonst keine Listener-Wirkung, kein `preventDefault`). Winkel in `--lfx-live-knob-a` / `--lfx-live-knob-b` (deg, am Knopf); das Mitdrehen übernimmt CSS (`transition`, ohne unter `prefers-reduced-motion`). Sender: `count` Raststufen à 360/count (18 × 20°), endlos, kürzester Weg bei Sprüngen; Wechsel erst beim Loslassen bzw. 400 ms nach der letzten Stufe (`onChannel`, in der App `ctx.tune` – schaltet aus dem Standby ein); während des Drehens zeigt das OSD „Sender N“. Lautstärke: 0–100 % auf −135° … +135° mit Anschlägen, 5-%-Stufen live (`onVolume`, in der App absolut mit Clamp, `savePrefs`, wirkt auch im Standby; bei Stumm bleibt der Winkel). Bedienung: Ziehen (Pointer Events inkl. Touch, Winkel um die Knopfmitte, nahe der Mitte senkrecht), Klick links/rechts der Mitte = −/+1 Stufe (kein Klick nach einem Zug, Schwelle 4 px), Mausrad (100 Einheiten = 1 Stufe, nach oben = mehr). Tooltips „Sender wählen“ / „Lautstärke“.
- **Klickgeräusch `player/sfx.js`:** `createSfx({ AudioCtx? }) → { click(kind), setLevel(vol, muted), dispose() }`, Arten `press` (Taste), `detent` (Knopf-Raststufe), `power` (tieferes Klacken). Web Audio, AudioContext lazy im ersten Klick (also in der Nutzergeste), Rauschen aus fester Folge (`mulberry32`, kein `Math.random`), Pegel = Lautstärke · 0,35, stumm/Pegel 0/kein Context/Ausnahme → still. `applyVolume` reicht Lautstärke und Stumm an `sfx.setLevel` weiter; `createApp({ sfx })` ist injizierbar (Tests), sonst eigene Instanz, die `dispose` schließt.
- **Heft bei Flach und Schlicht:** `.lfx-live-mag-prop[data-style="flat"|"plain"]` liegt leicht angelehnt (`perspective(600px) rotateX(10deg) rotate(-5deg)`, Ursprung 50 % 100 %, Hover `translateY(-4%)`), wie das Heft der Röhre auf dem Lowboard. Da es aufrecht steht, braucht es im Slot Höhe 1,3 × Breite: Breite `min(76 %, 74cqh)`.

### Stapelreihenfolge im Bild (z-index in `.lfx-live-screen`)
Video 0, Fake-Player 1, Rauschen 2, Leerlaufkarte 3 (Banner 4), **Glas 4**, OSD 5, Overlay (EPG/Videotext/Menü) 6, Scanlines-`::before` 8, Ein-/Ausschalt-`::after` 20. Raum: `.lfx-live-decor` z 0, TV z 1, Seitenspalte z 2. `.lfx-live-tv__deco` hat keinen eigenen Stapelkontext; Kinder ordnen sich per z-index im TV ein.

### Pref „Röhren-Effekte“ (`fx`)
- Standard an (`lfx.live.fx.<uid>`, `prefs.getFx()`), Hülle `opts.fx`, gespeichert über `deps.savePrefs({ fx })`; Harness `?fx=0`.
- Menü: „Röhren-Effekte“ (Wert An/Aus, Toast „Röhren-Effekte an./aus.“) nur bei `crt80` und `silver`. Aus → Klasse `no-tubefx` an `.lfx-live-app`: Stil-CSS schaltet Animationen/Flackern darunter ab (`.lfx-live-app.no-tubefx …` bzw. `:not(.no-tubefx)`).

### Ausblendregeln
`display: none !important` (damit spätere Stilregeln wie `.lfx-live--style-crt80 .lfx-live-d-foo` mit höherer Spezifität nicht gewinnen): Handy-Hochformat und `≤ 760 px` am Desktop (`mobile.css`): `.lfx-live-decor`, `.lfx-live-tv__deco`; Vollbild und Handy-Querformat (`fullscreen.css`): zusätzlich `.lfx-live-screen__glass`. CSS-Reihenfolge: `tv-*.css`, `decor.css`, `decor-crt80.css`, `decor-silver.css`, `remote.css` … `mobile.css`, `fullscreen.css`.
- Die stilabhängigen Fernbedienungsregeln liegen jetzt in `tv-crt80.css` bzw. `tv-silver.css` (Abschnitt am Dateiende); `remote.css` enthält nur noch Basis, Flach und Schlicht.

## Handy-Rückmeldungen (1.10.x)
- Menü: Tippen (`pointerdown`, Capture an `.lfx-live-app`) außerhalb von Panel, Fernbedienung und `[data-action]`-Gerätetasten schließt es; der folgende `click` wird einmal verschluckt (sonst schaltet `onScreenClick` im Standby ein). Nur Menü, nicht EPG/Videotext/Heft.
- Lautstärke: `player.volumeMode()` → `'native'|'mute-only'` (dynamisch gelesen; ohne API gilt `volumeSupported === false` = mute-only). Die Anzeige 0–100 wird in beiden Modi normal geführt. Pegel 0 ist in JEDEM Modus stumm und läuft immer über `muted` (`silent() = muted || vol === 0`), weil die Volumen-Probe auf iOS fälschlich `native` liefern kann (Wert wird zurückgelesen, aber akustisch ignoriert). Entstummen (Stumm-Taste) bei Pegel 0 stellt den letzten Pegel > 0 wieder her, der mindestens 1 s stand (`VOL_SETTLE_MS`; schnelles V− bis 0 merkt sich nicht die 5; Fallback Startpegel bzw. 50). Nach jedem erfolgreichen Start gilt `if (silent()) setMuted(true)` (nie ohne Geste entstummen). Bei `mute-only` (iOS, `video.volume` fest) gilt: Pegel 0 → stumm, sonst Ton an mit festem `video.volume = 1`; Musik/SFX-Pegel 1. Der Hinweis „Lautstärke bitte am Gerät einstellen“ erscheint höchstens einmal pro Sitzung am OSD.
- Ladeanimation: `is-loading` erst nach `LOADING_DELAY_MS` (400 ms) bei `loading`/`stalled`, jede andere Phase entfernt sie sofort.
- EPG am Handy (`.is-phone`): Schrift `clamp(10px,3.2cqw,14px)`, Zeilenhöhe `--lfx-live-epg-row` (Standard 3.1em, Handy 3.6em), nur Titel + Uhrzeit (Badges/„Füllprogramm“-Zeile aus), obere Zone `auto`, Mini-Bild 23 %. Handy-Hochformat (`.is-phone:not(.is-landscape)`, 1.11.1) im Fernseher-Rahmen verdichtet: Zeile 2.7em, Info-Zeile (Titel/Beschreibung) aus, Mini-Bild 16 %, `__top` mit `min-height` per cqw/cqh, flachere Zeitleiste und Farbtasten (crt80/silver 5 Zeilen, flat/plain 3).
- OSD-Taste „i“ (1.11.1): erneutes Drücken blendet Info UND Kanalnummer/Titel (`is-ch`) sofort aus; Lautstärke (`is-vol`) und Meldung (`is-msg`) bleiben.

## Player: Rückfall, Fehlercodes, Vorauflösung, Lautstärke (gilt für LIVE und TV-Modus)
- Fehlercodes (`code` an `resolveStream`-Fehlern, `play()`-Ergebnis, `state`/`error`-Ereignis, nie URL/Token): `V-CODEC`, `V-RANGE`, `V-10BIT`, `V-SUB`, `V-OTHER` (Server-Gründe), `V-NOURL` (keine TranscodingUrl), `V-NOSRC`, `A-CODEC`, `B-HLS` (kein natives HLS), `B-PLAY` (play() NotSupported), `M<n>` (MediaError am `<video>`, z. B. M3 Decode, M4 Quelle nicht unterstützt), `NET`, `TIMEOUT` (25 s Start). Die Fehlerkarte zeigt klein „Code: X“ (`card.showError(reason, channel, code)`, `data-code`). Startfehler am `<video>` (`M<n>`, `B-PLAY`) tragen die Rückfallkette: `M3·D>T>T` = Direktwiedergabe (D), dann ts-HLS (T), dann ts-Neuversuch (T) scheiterten; Buchstaben: `D` Direct, `F` fMP4-HLS (HEVC angeboten), `T` ts-HLS. Der Code ist der des letzten Fehlers. Andere Codes (`V-*`, `A-*`, `B-HLS`, `NET`, `TIMEOUT`) bleiben unverändert. Die Fehlerkarten von LIVE und TV-Modus zeigen den Text unverändert („Code: M3·D>T>T“).
- Rückfall (max. 3 Starts je `play()`, nur bei `video`/`browser`, nie eine echte Video-Umwandlung): (1) Direct scheitert → `resolveStream({ noDirect: true })` (leere DirectPlayProfiles, `EnableDirectPlay:false`, `noHevc` unverändert) = Remux (fMP4-HLS mit HEVC, wenn der Browser HEVC kann, sonst ts); der Player merkt sich je Item `directFailed` (Auflösung und `prefetch` fragen künftig gleich mit `noDirect`, der Direct-Cache liefert es nicht mehr). (2) fMP4-HLS scheitert bei h264-Quelle mit `offeredHevc` → EINMAL `noHevc: true` (ts/h264); danach fordert der Player h264-Quellen in dieser Sitzung gleich ohne HEVC an (`tsOnly`). HEVC-Quellen: kein ts-Rückfall (wäre Umwandlung). (3) ts-HLS scheitert → genau ein Neuversuch nach ca. 500 ms, vorher wird das `DELETE ActiveEncodings` der gescheiterten Sitzung abgewartet, dann frisch aufgelöst (`noCache`). Alter Job jeweils per DELETE beendet, kein Fehler-Ereignis zwischen den Versuchen; schlägt die Neuauflösung selbst fehl, wird der letzte Startfehler gemeldet.
- Profil: HLS-Ton `aac` plus `ac3`/`eac3`, wenn `canPlayType('audio/mp4; codecs="ac-3"|"ec-3"')` es bejaht (dann `MaxAudioChannels 6`); Direktprofile ebenso.
- `waiting` meldet erst nach 1,2 s ohne `currentTime`-Fortschritt `stalled`, `stalled` wird ignoriert; `timeupdate` mit Fortschritt, `canplay` und `playing` melden wieder `playing`.
- `player.prefetch(itemId, { signal? })` löst PlaybackInfo vorab auf; gecacht (max. 10 min) werden nur Direct-Ergebnisse, bei HLS nur „HLS nötig“ (beim Start frisch). `play()` nutzt Cache und wartet auf eine laufende Vorauflösung; mit `audioIndex` kein Cache.
- Lautstärke ohne natives `volume` (iOS): kein WebAudio-Gain mehr (`player/gain.js` entfällt, in der Praxis wirkungslos). `player.volumeMode()` → `'native'|'mute-only'`, `player.volumeSupported` (nur bei native true). Bei `mute-only` ignoriert `setVolume` den Pegel (`video.volume` bleibt 1), nur `setMuted` wirkt. TV-Modus: der Regler (0–100, Schritt 5) bleibt sichtbar, 0 → stumm, ab 5 Ton an, kein Hinweistext; `ctl.volumeSupported` ist immer true.

### Messung, Messanzeige, dauerhaftes `directFailed` (1.11.2)
- `play()`/`playUrl()` liefern am Ergebnis (Erfolg und Fehler, nicht bei `aborted`) `timing: { totalMs, infoMs, loadMs, startMs, chain, cached, mode }` und `player.lastTiming()` die Kopie davon: `infoMs` bis PlaybackInfo, `loadMs` = `src` → `loadedmetadata`, `startMs` = `loadedmetadata` → `playing` (jeweils der letzte Versuch, `video.js` `phases()`), `chain` = Versuchskette (`D`, `D>T`, `F>T`), `cached` = Direct-Ergebnis aus Cache/Vorauflösung, `mode` = `direct|hls|none`. Keine URLs/Token. `fake.js` liefert eine Attrappe.
- Messanzeige `ui/zapstats.js` (geteilt mit dem TV-Modus, reines DOM mit Inline-Styles, Klasse `lfx-zapstats`, oben links im Bild): Zeile 1 `Sender 4 · 1,8 s · T · Info 0,3 · Laden 1,1 · Start 0,2 · Ø 1,5 s (10)` (Fehler: `FEHLER · Code Kette`), Zeile 2 `Ton: native|mute-only · muted ja/nein · vol 0,00 · Regler 0` (direkt vom `<video>`). Option `opts.zapStats` (Engine); ohne Option kein DOM. In der Hülle schaltet der Hash-Parameter `lfxdebug=1` (z. B. `#/home?lfx=tv&lfxdebug=1`) die Anzeige ein und merkt sich das in `localStorage` (`lfx-zapstats`), `lfxdebug=0` löscht (`features/live/zapflag.js`, von `tvmode/page.js` und `live/home.js` gelesen). Harnesses: `?zapstats=1`.
- `directFailed` wird dauerhaft gemerkt (`deps.storage`, von `features/live/deps.js` = `localStorage`, Key `lfx-directfailed`, `{ itemId: ms }`, max. 200, TTL 7 Tage), aber nur wenn Direct mit Medienfehler `M3`/`M4` scheiterte UND der folgende Versuch lief. `B-PLAY`/`browser` bleibt nur in der Sitzung.

### Startablauf, Startvarianten und erweiterte Messanzeige (1.11.3, gilt für LIVE und TV-Modus)
- **Startablauf** (`player/video.js`, `vc.start`): `src` setzen, dann sofort `video.currentTime = Ziel` (Default-Startposition laut HTML-Spec bei `HAVE_NOTHING`, in try/catch; Ziel = Live-Position zu diesem Zeitpunkt). In `loadedmetadata` wird nur noch nachgesprungen, wenn `|currentTime − Live-Position| > 1,5 s` (oder das Vorab-Setzen nicht griff), danach `play()`. Hintergrund: Safari holte bei HLS erst Segment 0 und sprang dann weit voraus, der Server startete ffmpeg neu (Messung am iPhone: Start 4–8 s). Rückfallkette, Watchdogs (`START_TIMEOUT_MS`, Stall) und Fehlercodes sind unverändert.
- **Varianten** (Hash-Parameter `lfxzap=0|1|2`, gemerkt in `localStorage` `lfx-zapvariant`; `1` oder ungültig = Standard und löscht den Schlüssel; Hülle `features/live/zapflag.js` → `zapVariant()`, von `features/live/deps.js` als `deps.zapVariant` an die Engine gereicht, Player liest es einmal beim Anlegen; wirkt in LIVE und TV-Modus, Seite neu laden):
  - `0` altes Verhalten (kein Vorab-Setzen, Sprung immer in `loadedmetadata`).
  - `1` Standard (Startposition vorab).
  - `2` wie 1 plus Media-Fragment `#t=<s mit 1 Nachkommastelle>` an der Adresse, die dem `<video>` übergeben wird (nie an Server-Requests).
  - Verworfen (live geprüft 12.11.2026): `SegmentLength` an der HLS-URL. Der Server liefert damit unverändert Segmente von 8 s (`#EXTINF:8.0`, Remux richtet sich nach den Keyframes). `lfxzap=3` gilt deshalb als ungültig, also als Standard.
  - Beispiel: `#/home?lfx=tv&lfxdebug=1&lfxzap=0`.
- **`lfxhls=1|0`** (Hash, `localStorage` `lfx-forcehls`, `deps.forceHls`): erzwingt HLS (wie `noDirect`), wirkt nur bei eingeschalteter Messanzeige (`lfxdebug=1`); zum Vergleich der Varianten am PC.
- **Messfelder** zusätzlich in `timing` (`video.js` `metrics()`, `index.js` `extraTiming`): `variant`, `forced`, `jumped` (nach `loadedmetadata` gesprungen), `seekingMs`/`seekedMs`/`canplayMs` (jeweils erstes Ereignis nach den Metadaten, ms ab Metadaten), `waitCount`/`waitMs` (`waiting`-Phasen zwischen Metadaten und `playing`), `bufSeeked`/`bufPlaying` (`[Anfang, Ende]` des Puffers um `currentTime` in s relativ zum Sprungziel, bei `seeked` und bei `playing`), `devS` (`currentTime` − Live-Position bei `playing`, s) und `src: { container, v, a, reasons }` (Kürzel aus PlaybackInfo: Quell-Container, Video-/Ton-Codec, erste 2 `TranscodeReasons` ohne „NotSupported“; nie URL/Token/Pfade). `playUrl()` trägt dieselben Felder (ohne `src`).
- **PC-Messung (Chrome, 12.11.2026, Testkonto, Server abends langsam):** Direct mkv/h264: V1 Start 0,7/6,0/3,1 s, V0 Start 5,1/4,9/4,2 s, also kein Nachteil durch V1. HLS erzwungen (Kette F, Grund `AudioCodec,DirectPlayError`): Laden 4–9 s, Start 6–13 s. Bei so langem Laden springt auch V1 nach. Am iPhone (Laden 0,5–0,8 s) greift das Vorab-Setzen ohne Nachsprung.
- **Zeile 3** der Messanzeige (`zapstats.js` `detailLine`), Beispiel: `Quelle mkv·hevc·eac3 · Grund Container · V1 · Sprung nein · Abw +0,3 · Seek 0,0/0,3 · canplay 0,5 · Puffer +0,0…+2,0 → +0,0…+12,0 · Warten 2× 1,8 s` (`V1 HLS erzwungen` bei `lfxhls`; „–“ = Ereignis nicht eingetreten; darf am Handy umbrechen).

