# Server-Statistik (ab 1.22.0) – Vertrag Hülle ↔ Nachlade-Bundle ↔ Worker ↔ Server-Skript

Zeigt allen angemeldeten Konten ohne Nutzernamen, was auf dem Server läuft: Reiter **Jetzt** (laufende Wiedergaben), **Monat** (Schauzeit aller Konten, Rekorde, Upload) und **Server** (Systemwerte, Platten, Traffic, Bibliothek, Rekorde). Sichtbar für jedes Konto, nur im Design LENZFLIX (`flix`), als Unteransicht des Geheimmenüs (Abschnitt „Server“). Das Geheimmenü steht bewusst nicht in der README; der Öffnungsweg wird hier nicht wiederholt (siehe `docs/js-contracts.md`, „Geheimmenü“). Ohne konfigurierte Charts-URL oder ohne Antwort der Probe bleibt der Abschnitt verborgen.

## Bundles, Wächter, Importgrenze

| Teil | Pfad | Ausgabe |
|---|---|---|
| Hülle | `src/js/features/secretmenu/serverstats.js` (Hauptbundle) | Abschnitt „Server“ im Geheimmenü, Probe, deps |
| Nachlade-Bundle | `src/js/serverstats/**` (Einstieg `entry.js`) | lazy `dist/lenzserverstats(.min).js`, Global `window.LenzFlixServerStats = { version: 1, mark: '__LFX_SRVSTATS_UI__', create }` |
| CSS | `src/css/serverstats/**` (`index.css` + `now|month|server.css`) | lazy `dist/lenzserverstats(.min).css` per `core/addoncss.js` (Name `lenzserverstats`) |
| Worker | `charts-worker/src/srv/*.js`, Einbindung in `charts-worker/src/index.js` | `/srv/*`, Cron-Slot |
| Server-Skript | `tools/server-report/` | systemd-Timer, meldet an `POST /srv/report` |

- **Laden:** erst beim Tippen auf den Knopf („Server-Statistik“): `ensureAddonCss('lenzserverstats')` + `ensureThemeJs('serverstats')`. Danach prüft die Hülle `g.version === 1` und `typeof g.create === 'function'`; sonst „Konnte nicht geladen werden.“ mit „Erneut versuchen“.
- **Build-Wächter** (`build/build.mjs`, `checkMainBundle` und `checkServerStatsBundle`):
  - `dist/lenzflix.min.js` darf den Marker `__LFX_SRVSTATS_UI__` nie enthalten (Abbruch).
  - `dist/lenzserverstats.min.js` muss den Marker tragen (Abbruch sonst) und darf `X-Emby-Token|accessToken|api_key|MediaBrowser Token` nie enthalten: Das Token kennt nur die Hülle.
  - Importgrenze: Das esbuild-Metafile des Eintrags darf nur Dateien unter `src/js/serverstats/` listen (Abbruch sonst); das Bundle importiert nichts aus `core/`, `shared/` o. Ä. (eigene Kopien `dom.js`, `format.js`).
  - Warnung (kein Abbruch) ab 48 KiB für `lenzserverstats.min.js`.
- Das Hauptbundle importiert nie `src/js/serverstats/`. `dist/lenztvmode.min.*`, `lenzstore.min.*`, `lenzupnext.min.js` bleiben byte-gleich.

## deps-Schnittstelle (Hülle → `create(deps)`)

```js
deps = {
  get(path, { signal }) -> Promise<{ ok:true, status, data } | { ok:false, status }>, // wirft nie; status 0 = Netz/Timeout/Abbruch/kein Token
  img(id, tag, w)       -> string | null,   // Bild-URL ohne Token (api.imageUrlFor)
  openItem(id),         // schließt das Geheimmenü und öffnet das Detail-Fenster
  tabs: ['now','month','server'],  // aus der Probe, nur bekannte; leer -> Hülle zeigt nichts
  maxM: number,         // ältester abrufbarer Monat (0..35)
}
// Rückgabe: { el, dispose() }
```

- `deps.get` setzt `X-Emby-Token` (nur Header, `credentials: 'omit'`, `cache: 'no-store'`); Timeout 8 s (Probe 4 s). Die Probe wird je Token 60 s gemerkt (`clearServerProbeCache()` für Tests).
- Das Bundle ruft nur `/srv/now`, `/srv/month?m=…`, `/srv/server` über `deps.get`; ein Abruf gleichzeitig je Reiter (`api.js` `createFetcher`, abbrechbar). Reiter: ARIA-Tabs, Pfeiltasten/Home/End; Reiter ohne Sichtbarkeit des Dokuments (`document.hidden`) laufen nicht (Stopp/Start per `visibilitychange`).
- `dispose()` stoppt alle Timer und Abrufe; die Hülle ruft es beim Zurück/Schließen (über `offs` der Ansicht).

### Ansichten-Stapel im Geheimmenü (`secretmenu/panel.js`)

- `pushView({ title, node, offs, trigger })` legt eine Unteransicht über die Hauptansicht (Hauptansicht wird aus dem Body ausgehängt, nicht versteckt; Zustand bleibt). `popView()` entfernt die oberste (ruft ihre `offs`), stellt Scrollstand und Fokus (`trigger`) wieder her; `false` ohne Unteransicht. `closeSecretMenu()` ruft die `offs` aller Ansichten.
- Kopf: Zurück-Knopf (`←`, nur mit Unteransicht) und Titel der obersten Ansicht. Esc: erst `popView()`, danach Schließen. Fokusfalle (Tab) über Kopf und aktive Ansicht; Fokus geht beim Push auf den Zurück-Knopf.
- Die Hülle bekommt `ctx = { pushView, close }`.

## Anonymitätsregeln

- **Whitelist statt Filter:** Antworten entstehen nur aus benannten Feldern. Konto-IDs, Kontonamen, Geräte-/Client-Namen, Sitzungs-IDs, IPs und Pfade verlassen die Worker-Dateien nie (`now.js` `reduce` verwirft alles andere sofort; `month.js` reduziert Client/Gerät auf `deviceKind`: `tv|phone|web|other`, der Name selbst wird nicht ausgegeben).
- **Keine stabilen IDs für fremde Wiedergaben:** Verborgene Zeilen enthalten weder Item-ID noch Titel noch Bild (siehe `/srv/now`); eigene und sichtbare Zeilen tragen die Item-ID, die der Betrachter ohnehin sehen darf. Es gibt keine Kennung, die Zeilen über Abrufe oder Konten hinweg einem Konto zuordnet.
- **Rechte-Filter fail-closed, mit dem Token des Betrachters:** Für fremde Wiedergaben fragt der Worker `GET /Items?Ids=…` mit dem Token des Betrachters. Nur zurückgegebene IDs gelten als sichtbar. Schlägt die Prüfung fehl (HTTP-Fehler, Form, Timeout), sind alle fremden Zeilen verborgen. Live belegt ist nur der Positivfall (alle Konten sehen alles); der Negativfall (Konto ohne Recht) ist heute wegen fehlender Konten nur per Unit-Test belegt.
- **Eigene Wiedergaben** (`uid` = Betrachter) werden immer mit Titel gezeigt (`me: 1`).
- **Ignorierliste** (Plugin „Playback Reporting“, Tabelle `UserList`): in **jeder** SQL-Abfrage ausgeschlossen (Monat und Rekorde: ja). `/srv/now` basiert auf Live-Sitzungen, nicht auf dem Plugin: **Jetzt: nein**, auch ignorierte Konten erscheinen dort (anonym).
- Logs: nur feste Codes (`console.error('srv: …')`), nie Token, Namen, IDs, IPs.

## Endpunkte

Alle GET-Routen: Header `X-Emby-Token` (Pflicht), `v: 1`, `Cache-Control: no-store`, CORS wie die übrigen Worker-Routen (`ALLOWED_ORIGIN`, nur GET/OPTIONS). Reihenfolge der Prüfungen: kein Token → 401 `unauthorized`; IP-Limit (SHA-256 der IP, ohne `CF-Connecting-IP` der gemeinsame Schlüssel `noip`; 429 `rate`) **vor** der Anmeldung; `resolveUser` (401 `unauthorized`, 502 `upstream-unreachable`); Token-Limit (429 `rate`). Falsche Methode: 405 `method`; unbekannter Pfad unter `/srv`: 404 `not-found`. Limits je Minute, Isolate-lokal (Fenster 60 s):

| Route | Token | IP |
|---|---|---|
| `GET /srv` (Probe) | 20 | 60 |
| `GET /srv/now` | 12 | 60 |
| `GET /srv/month` | 30 | 90 |
| `GET /srv/server` | 12 | 60 |

### `GET /srv` (Probe)
`{ "v": 1, "tabs": ["now","month","server"?], "maxM": 0..35 }`. `now` und `month` immer; `server` nur, wenn die letzte Meldung jünger als 7 Tage ist **oder** ein Tageslauf-Datensatz existiert. `maxM` aus der Monats-Meta (Fehler → 0). Im Isolate 60 s gemerkt (gemeinsam für alle Konten).

### `GET /srv/now`
Nie ein 4xx/5xx durch Jellyfin-Fehler: `{ "v": 1, "down": 1 }` mit 200. Sonst:
```json
{ "v": 1, "n": 3, "mbps": 14.2, "rows": [ … ] }
```
`n` = Zahl aller Zeilen, `mbps` = Summe der Bitraten aller Wiedergaben (eine Nachkommastelle). Reihenfolge: eigene (nach Titel, `de`), sichtbare fremde (nach Titel), verborgene (nach Fortschritt absteigend).
- **Sichtbare Zeile:** `{ id, t:'movie'|'episode'|'other', title, ep?, s?, e?, img?:{id,tag}, pos, dur, paused:0|1, tc:0|1, mbps, dev:'tv'|'phone'|'web'|'other', me?:1 }`. Bei Folgen ist `title` der Serienname, `ep` der Folgenname, `img` das Serienbild (sonst Primärbild des Items); `pos`/`dur` in Sekunden; `mbps` Zahl oder `null`; `tc` = Umwandlung (Video oder Ton).
- **Verborgene Zeile:** `{ hidden:1, p:0..1 (zwei Stellen), paused, tc, mbps, dev }` – keine ID, kein Titel, kein Bild.
- **Quelle/Cache:** `GET /Sessions?ActiveWithinSeconds=960` mit dem Admin-Key (Timeout 8 s, Antwort ≤ 512 KB), je Isolate 10 s gemeinsam gecacht und sofort auf eine interne Liste reduziert (Fehlschlag 5 s). Sichtbarkeitsprüfung (je Betrachter und ID-Menge) 60 s gecacht (höchstens 200 Einträge), in Blöcken à 100 IDs. Fehlende Bitrate: Rückfall `MediaSources[0].Bitrate` je Item 1 h gecacht, höchstens 5 Abrufe je Anfrage. Bitrate: bei Umwandlung `TranscodingInfo.Bitrate`, sonst Video- plus gewählte (sonst erste) Tonspur.

### `GET /srv/month?m=0..35`
`m` = Monate zurück (0 = laufender Monat); alles außer `^\d{1,2}$` ≤ 35 → 400 `{ "error": "bad-month" }`. Monatsgrenzen in der Lokalzeit der Datenbank.
```json
{ "v": 1, "ym": "2026-11", "m": 0, "maxM": 14, "partial": true, "stale": 1?,
  "totals": { "secs": 0, "plays": 0, "users": 0 },
  "prev": { "ym": "2026-10", "secs": 0 },
  "days": [ { "d": "2026-11-01", "secs": 0 } ],
  "top": { "d": "…", "secs": 0 } | null,
  "heat": [ [dow 0..6 (0 = So), hour 0..23, secs] ],
  "mix": { "dev": {"tv","phone","web","other"}, "method": {"direct","transcode"}, "type": {"movie","episode"} },
  "tx": { "tx": 0, "rx": 0 }? }
```
`partial` = `m === 0` (Monat läuft noch; `days` reicht dann bis heute). `stale: 1` = abgelaufene Kopie, weil die Neuberechnung scheiterte. Einzelne Teile fehlen, wenn nur Teilabfragen gelangen (Rückfall von einer UNION-ALL-Abfrage auf Einzelabfragen). `tx` (Bytes) nur, wenn der Monat im gemeldeten Traffic liegt. Nur Typen Film/Folge zählen.
- **Cache (Cache API, Schlüssel unter dem aufgelösten `ym`, nicht unter `m`):** laufender Monat 10 min, vergangene Monate 24 h; Aufbewahrung 7 Tage; ein als „laufend“ abgelegter Eintrag gilt nach dem Monatswechsel nicht mehr als frisch. Meta (`ym`, `maxM`, `today`, `monthStartUtc`) 10 min im Isolate, bei Fehler der letzte Wert.
- **Fehler:** Ohne Meta wird nur eine abgelaufene Kopie (Monat aus UTC-Uhr geschätzt) mit `stale: 1` geliefert; ohne jede Kopie 503 `{ "error": "unavailable" }` (ebenso, wenn die Berechnung scheitert und keine Kopie existiert).

### `GET /srv/server`
Letzter bekannter Stand aus dem KV, 60 s im Isolate; wirft nie, immer 200 (im Notfall `{ "v": 1 }`); fehlende Teile fehlen.
```json
{ "v": 1,
  "health":  { "ageS": 0, "stale": false, "tempC"?, "cpuPct"?, "load"?: [n,n,n], "cores"?, "mem"?: { "total", "avail" }, "uptimeS"? },
  "disks":   { "ageS": 0, "list": [ { "l", "size", "used", "avail" } ] },
  "traffic": { "ageS": 0, "days": [ { "d", "rx", "tx" } ], "months": [ { "ym", "rx", "tx" } ] },
  "library": { "movies", "series", "episodes", "newMovies", "newEpisodes", "newCapped"?: 1, "ym", "runtimeS"? },
  "records": { "day"?: { "d", "secs" }, "month"?: { "ym", "secs" }, "conc"?: { "n", "date" }, "binge"?: { "n", "date" }, "tx"?: { "ym", "bytes" }, "approx"?: 1 } }
```
`health` fehlt, wenn die Meldung älter als 24 h ist; `health.stale` ab 75 min Alter. Bytes in Byte, Zeiten in Sekunden. `records.approx`: mindestens ein Rekord ist eine Näherung (Rückfall-Berechnung).

### `POST /srv/report` (Server zu Server, ohne CORS)
`Authorization: Bearer <SERVER_REPORT_SECRET>` (≥ 32 Zeichen, zeitkonstanter Vergleich über SHA-256 + XOR), `Content-Type: application/json`, Body ≤ 64 KB.
- 404 `srv-off` (Secret fehlt/zu kurz), 401 `unauthorized` bzw. 429 `rate` (mehr als 6 Fehlversuche je IP und Minute), 415 `unsupported-media-type`, 413 `too-large` (Content-Length oder gelesene Bytes), 400 `bad-body` (kein JSON oder nichts Verwertbares), 503 `kv`, 405 `method`. Erfolg: 200 `{ "ok": true }`, bei Schreibbremse `{ "ok": true, "skipped": 1 }`.
- Body: `{ v:1, host:{ tempC, cpuPct, load:[3], cores, memTotal, memAvail, uptimeS }, disks:[{ l, size, used, avail }], vnstat:{ m, d } }` mit `m`/`d` = vnstat-`--json`-Rohausgabe (nur `jsonversion "2"`, erste Schnittstelle). Jeder Schlüssel ist optional.
- **Whitelist/Klemmen:** Zahlen müssen endlich sein und werden geklemmt (Temperatur −40..150, CPU 0..100, Load je 0..1000, Kerne 1..1024, Laufzeit ≤ 10 Jahre, Bytes ≤ 1e16); Platten höchstens 6, Etikett `^[\p{L}\p{N} _-]{1,24}$` (Pfade werden nie gemeldet); Traffic höchstens 62 Tage und 24 Monate.

### `POST /srv/refresh[?full=1]`
Header `X-Refresh-Secret` (wie `/refresh`; gleiches `REFRESH_SECRET`): 401 `unauthorized`, 405 `method`. Führt den Tageslauf aus: 200 `{ "ok": true }`, sonst 502 `{ "error": "refresh-failed", "code": "meta|all|put|partial"|null }`. `full=1` = ganze Historie, **ersetzt** die Rekorde (statt Maximum zu bilden).

## KV (Binding `CHARTS`) und Merge-Regeln

| Schlüssel | Schreiber | Inhalt |
|---|---|---|
| `srv:report:v1` | `/srv/report` | `{ v:1, at, health:{at,tempC?,cpuPct?,load?,cores?,mem?:{total,avail},uptimeS?}, disks:{at,list}, traffic:{at,days,months}, rec:{tx:{ym,bytes}} }`, jeder Teil optional |
| `srv:daily:v1` | Tageslauf | `{ v:1, at, monthStartUtc, library:{…}, records:{ day?, month?, conc?, binge?, approx? } }` |
| `srv:lib:v1` | Cron-Slot | `{ v:1, cursor, partS, startedAt, runtimeS?, doneAt? }` (Laufzeit der Bibliothek stückweise) |

- **Meldung (Merge):** Fehlende Teile behalten den alten Stand. Traffic wird je Tag/Monat zusammengeführt mit dem **Maximum** von `rx`/`tx` (vnstat-Zähler wachsen nur; ein Neustart des Zählers senkt nie), aufsteigend sortiert, auf 62/24 gekürzt. `rec.tx` = Upload-Rekordmonat: Maximum aus altem Rekord und allen bekannten Monaten, bleibt auch erhalten, wenn der Monat später aus der Liste fällt.
- **Schreibbremse:** höchstens ein KV-Put je 10 min (KV-`at` und Isolate-Merker); sonst 200 `skipped: 1`. Bei 30-min-Meldungen etwa 48 Schreibzugriffe pro Tag, höchstens 144; Tageslauf 1–2.
- **Rekorde (Tageslauf, nicht `full`):** je Rekord das Maximum aus Alt und Neu (Rekordtag/-monat: bei Gleichstand der neue Wert; gleichzeitige Streams und Marathon: bei Gleichstand der alte); nur der laufende und der Vormonat werden neu gescannt. `full=1` rechnet die ganze Historie und ersetzt. Scheitert ein Teil, bleibt sein alter Wert.
- **Rekord-Definitionen** (`sql.js`): Rekordtag/-monat nach Schauzeit; gleichzeitige Streams (nur Wiedergaben ≥ 60 s; Sweep per SQL, Rückfall auf Zeilen bis 5000 im Worker mit `approx`); Marathon = meiste Folgen **derselben Serie** durch ein Konto an einem Tag (je Folge ≥ 300 s; Serien über `resolveSeries`, höchstens 300 IDs, sonst `approx`).

## Cron-Slot und Nachholen

- `wrangler.jsonc`: `"crons": ["0 * * * *", "23 */6 * * *"]`. `scheduled()` unterscheidet über `event.cron === '23 */6 * * *'` (`SRV_CRON`); alles andere bleibt der Charts-Lauf (unberührt). In `wrangler.local.jsonc` ebenfalls eintragen.
- **Slot** (`daily.js` `runSlot`, wirft nie): (a) Tageslauf, wenn `srv:daily:v1.at` älter als 20 h ist oder fehlt; (b) ein Bibliotheks-Abschnitt (2000 Einträge je Slot, Cursor in `srv:lib:v1`; Laufzeit = Summe der `RunTimeTicks`; nach Abschluss 20 h Pause, ein Lauf, der älter als 7 Tage ist, beginnt neu). Höchstens etwa 30 Subrequests je Slot.
- **Nachholen:** Scheitert der Tageslauf (z. B. Server-Update nachts) oder gelingt er nur teilweise, bleibt das alte KV; bei Teilfehlern wird `at` auf „vor 19 h“ gesetzt, sodass der nächste Slot (6 h später) den Lauf nachholt. Kosten: ein KV-Lesezugriff je Slot.
- Das Neuzugangs-Zählwerk zählt Filme/Folgen seit Monatsbeginn (höchstens 3 Seiten à 200, sonst `newCapped: 1`).

## Ausfallsicherheit bei Server-Neustarts

Server, Jellyfin oder das Statistik-Plugin dürfen jederzeit weg sein; die Oberfläche bleibt neutral.
- **Jetzt:** Worker liefert `{ v:1, down:1 }`; UI zeigt „Der Server ist gerade nicht erreichbar …“ und fragt mit Backoff (10 s, verdoppelt bis 60 s) weiter. Netz-/Server-Fehler: Backoff, ab dem zweiten Fehler Fehlerbox; 429: 30 s Pause.
- **Monat:** abgelaufene Kopie mit `stale: 1` (Hinweis im UI); ohne Kopie 503 → neutraler Hinweis. Ein Wiederholversuch nach 3 s, dann Fehlerbox mit „Erneut versuchen“.
- **Server:** nie 4xx/5xx; `ageS` und `health.stale` (ab 75 min) statt Fehler, UI: „Letzte Meldung des Servers vor …“; ältere Meldungen als 24 h blenden die Systemwerte aus. Fehlt ein Teil, fehlt nur er.
- Das Skript meldet mit `Persistent=true` nach: ein beim Neustart ausgefallener Lauf wird nach dem Hochfahren einmal nachgeholt; die Schreibbremse fängt Doppelungen ab.

## Zurücksetzen der Maxima

Rekorde und Upload-Rekord liegen im KV. Zurücksetzen:
1. `wrangler kv key delete` für den gewünschten Schlüssel (`srv:daily:v1` für Rekorde/Bibliothek, `srv:report:v1` löscht auch Traffic-Verlauf und Upload-Rekord; Namespace-Bindung `CHARTS` bzw. dessen ID angeben).
2. `POST /srv/refresh?full=1` (mit `X-Refresh-Secret`) rechnet die Rekorde aus der ganzen Historie neu. Der Upload-Rekord baut sich aus den nächsten Meldungen wieder auf (nur aus den dann gemeldeten 24 Monaten).

## Datensparmodus

- Das Abfragen von `/srv/now` (10 s) ist kein Hintergrund-Lader im Sinn von `docs/js-contracts.md` („Datensparmodus“): Es läuft nur bei sichtbarem Reiter und geöffneter Ansicht und lädt keine Medien. Es prüft `isDataSaver(…)` bewusst nicht.
- Cover der Jetzt-Zeilen (`deps.img(id, tag, 96)` → `api.imageUrlFor`) folgen der Bildskala (`core/imgscale.js`, Regler im Geheimmenü); kein Token in der URL.

## Bekannte Lücken

- **TV-Modus:** Der eigene Player des TV-Modus meldet keine Wiedergaben an Jellyfin (keine Sitzung, keine Plugin-Zeile): Seine Zuschauer fehlen in Jetzt und Monat.
- `/srv/now` filtert die Ignorierliste nicht (siehe oben); Monat und Rekorde schon.
- Der Negativfall des Rechte-Filters ist live nicht belegt (nur Positivfall).
- Der Reiter „Server“ erscheint nur, wenn die Probe ihn meldet (Meldung < 7 Tage oder Tageslauf vorhanden); Jetzt und Monat gibt es immer.

## Entwicklung und Tests

- **Harness** `build/serverstats-dev.html|js` (über `npm run serve`, Pfad `/serverstats-dev.html`; Fake-deps, kein Netzwerk; lädt den echten Code als Modul aus `src/js/`, CSS aus `dist/`, fehlt es läuft er trotzdem). Parameter: `?tab=now|month|server`, `?state=normal|loading|empty|error|down|stale|hidden|partial`, `?rows=0..8` (Zeilen in Jetzt, Standard 4), `?phone=1` (375 px), `?tabs=now,month,server`, `?maxM=35`, `?delay=300` (ms). Titel sind neutrale Fantasietitel.
- **Tests** (`tests/serverstats-*.test.js`, vitest + jsdom, ohne Netzwerk): `app`, `boundary` (Importgrenze/Token), `format`, `hull`, `month`, `now`, `server`; Worker-Tests `charts-worker/test/srv-*.test.js` (Anonymität, fail-closed, `m`-Whitelist, `UserList` in jeder Abfrage, Meldung 401/404/413/415 und Bremse, Charts-Cron unberührt).
- **Server-Skript** `tools/server-report/` (`lenzflix-report.sh`, `.service`, `.timer`, `.env.example`): meldet alle 30 min (um :00 und :30) Systemwerte, Platten und vnstat-Traffic des Linux-Servers; Installation, Probelauf (`LFX_DRY=1`) und Fehlersuche in `tools/server-report/README.md`. Fehlende Werte lassen nur ihr Feld weg, das Skript beendet sich immer mit Exit 0.
- **Secrets:** `SERVER_REPORT_SECRET` (nur für `/srv/report`, ≥ 32 Zeichen; gleich im Skript als `LFX_SECRET`), `REFRESH_SECRET` (`/srv/refresh`), `JELLYFIN_API_KEY` (Sitzungen, SQL, Bibliothek). Nie ins Repo.
