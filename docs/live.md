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

### `deps` (von `features/live/home.js` gebaut)
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
  setVolume(v), setMuted(b), volumeSupported: boolean,   // iOS: false → Lautstärketasten = Stumm/Laut
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
back, menu, txt, red, green, yellow, blue, audio, subs, restart, fullscreen`.
Tastatur am Desktop (`ui/keys.js`): ↑/↓ = ch± (ohne Overlay) bzw. up/down, ←/→, Ziffern, `+`/`-`, `M`, `G` (epg), `I`, `T` (txt),
`F` (fullscreen), `Esc` (back), `Enter` (ok), Leertaste wird verschluckt. Nicht in Eingabefeldern, nicht bei offenem Picker.

## CSS (`src/css/themes/live/`), Scope `html.lfx-js.lfx-theme-live:not(.layout-tv)`
`index.css` importiert in dieser Reihenfolge: `tokens.css, shell.css, tv-crt80.css, tv-silver.css, tv-flat.css, tv-plain.css,
remote.css, osd.css, card.css, epg.css, teletext.css, menu.css, mobile.css, fullscreen.css`.
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
  `autopower=1` (mit `zap=`, `overlay=`, `page=`, `fullscreen=1`), `clean=1`.
- Tests: `tests/live-*.test.js` (Hülle `live-hull-*`, Planer `live-schedule-*`/`live-special-*`, Player `live-player-*`, UI `live-ui-*`, Overlays `live-overlay-*`).
