# LenzFlix „Meine Statistik“ – Vertrag Worker ⇄ Statistikseite

Eigene Statistik pro Jellyfin-Nutzer aus dem Plugin Playback Reporting. Die Seite liegt unter
`https://<jellyfin-domain>/lenzflix-stats/` (Caddy → Worker, Static Assets), die Daten kommen von
`GET /lenzflix-stats/api/me/stats?range=<range>` (Alias: `GET /me/stats`). Verwandt mit `docs/charts-api.md`.

## Anfrage
- Header `X-Emby-Token: <Jellyfin-AccessToken des Nutzers>` (Pflicht).
- `range` ∈ `7d | 30d | year | all` (Whitelist, Default `30d`; `year` = laufendes Kalenderjahr). Alles andere → `400 {"error":"bad-range"}`.
- **Es gibt keinen Parameter für die UserId.** Sie kommt ausschließlich aus `GET {JELLYFIN_URL}/Users/Me` mit dem Token
  (Antwort muss Status 200, JSON und `Id` im GUID-Format haben; sonst gilt das Ergebnis nicht als gültig). Query/Body/Header-Versuche werden ignoriert.

## Antwort `200 application/json`
```json
{
  "version": 1,
  "range": "30d",
  "computedAt": "2026-11-10T18:00:00Z",
  "stale": false,
  "approx": false,
  "ignored": false,
  "totals": { "seconds": 123456, "plays": 80, "episodes": 60, "movies": 3, "series": 5, "activeDays": 21,
              "firstAt": "2026-10-12 20:11:03", "lastAt": "2026-11-09 22:40:11" },
  "topSeries": [{ "id": "<seriesId>", "seconds": 40000, "episodes": 22 }],
  "topMovies": [{ "id": "<itemId>", "seconds": 7000, "plays": 1 }],
  "timeline": { "unit": "day|week|month", "buckets": [{ "key": "2026-11-09", "seconds": 5400 }] },
  "heatmap": [{ "dow": 0, "hour": 21, "seconds": 8000 }],
  "binge": { "topDay": { "date": "2026-11-02", "seconds": 21000 },
             "seriesDay": { "date": "2026-11-02", "seriesId": "<id>", "episodes": 7 } },
  "devices": [{ "client": "Jellyfin Web", "device": "Chrome", "plays": 40, "seconds": 70000 }],
  "methods": { "directPlay": { "plays": 60, "seconds": 90000 }, "directStream": { "plays": 0, "seconds": 0 },
               "transcode": { "plays": 20, "seconds": 33456 }, "other": { "plays": 0, "seconds": 0 } },
  "compare": { "rank": 2, "of": 7, "avgSeconds": 98000 },
  "volume": { "bytes": 52000000000, "share": 0.31, "scaled": true, "upBytes": 168000000000, "cov": 0.97,
              "timeline": [{ "bucket": "2026-11-09", "bytes": 3100000000 }],
              "compare": { "rank": 2, "of": 5, "avgBytes": 41000000000 } }
}
```
- `devices` max. 5 (nach Sekunden). `topSeries`/`topMovies` max. 10, IDs normalisiert (32 Hex ohne Bindestriche, klein). Titel/Poster lädt die Seite selbst mit dem Nutzer-Token.
- `timeline.buckets` sind dünn besetzt (nur Buckets mit Daten), `key` = `YYYY-MM-DD` (day), `YYYY-WW` (week, SQLite `%W`: Woche 0 = Tage vor dem ersten Montag; die Seite rechnet daraus die ISO-Kalenderwoche des Wochenmontags), `YYYY-MM` (month). Einheit: `7d`/`30d` → day, `year` → week, `all` → month. Lücken füllt die Seite.
- `heatmap`: `dow` 0 = Sonntag … 6 = Samstag (SQLite `%w`), `hour` 0–23, nur Zellen mit Daten. Zeit = lokale Serverzeit (Europe/Berlin), keine Umrechnung. Die Dauer einer Wiedergabe wird der Startstunde zugerechnet.
- `methods`: `PlaybackMethod` wird per Präfix normalisiert (`DirectPlay` → directPlay, `DirectStream` und `Transcode (v:direct a:direct)` (nur Remux, laut echten Daten häufig) → directStream, übrige `Transcode…` → transcode, sonst other).
- `compare` ist `null`, wenn weniger als 3 aktive Nutzer im Zeitraum (Ignorierliste ausgenommen) existieren, wenn der Nutzer selbst im Zeitraum keine Wiedergabe hat oder wenn er ignoriert wird. Es enthält **nie** Daten anderer Nutzer außer dem Durchschnitt; `rank = 1 + Anzahl Nutzer mit mehr Watchtime`.
- `ignored: true` (Nutzer steht auf der Ignorierliste von Playback Reporting): alle Zahlen 0/leer, `compare: null`.
- `approx: true`, wenn mehr als 3000 Episoden für die Serien-Zuordnung angefallen sind (Subrequest-Limit) oder die Abfrage der gezählten Items (Filme und Folgen) bzw. der Tagesfolgen bei 3000 Zeilen abgeschnitten wurde (auch durch Filme). Dann sind `topSeries`/`binge.seriesDay` Näherungen; `totals.episodes`/`movies`/`seconds` bleiben exakt.
- `stale: true`: Neuberechnung ist fehlgeschlagen (Jellyfin/Tunnel down), ausgeliefert wird der letzte Stand aus dem Cache; `computedAt` zeigt dessen Alter.

## Feld `volume` (optional, Datenvolumen)
Geschätzter Datenverbrauch des Kontos. Das Feld **fehlt**, wenn das KV `srv:vol:v1` (schreibt der Cron) fehlt oder nicht lesbar ist, `ranges[range].cov < 0,9`, `ranges[range].est` nicht > 0 ist, Qv fehlschlägt oder bei 5000 Zeilen abgeschnitten wurde. Die übrige Antwort bleibt dann unverändert.
- **Kalenderfenster** (nicht die rollierenden Fenster der übrigen Abfragen, Lokalzeit der DB): `7d` = `date('now','localtime','-6 days')`, `30d` = `'-29 days'`, `year` = `'start of year'`, `all` = keine Grenze. Buckets wie `timeline` (Tag/Woche/Monat).
- Qv: `SELECT <bucket> b, ItemId i, MAX(ItemType) t, SUM(PlayDuration) s … GROUP BY b, i LIMIT 5000`, ohne Mindestdauer.
- Formel: Bytes je Zeile = `s * kbps * 125`; `kbps` = `br[normId(ItemId)]` aus dem KV, sonst `fb.movie` bzw. `fb.episode` (ohne Wert 8000/4000). `e` = Summe.
- `bytes = e * k` (k = `ranges[range].k`, Skalierung auf den echten Upload); `share = e / ranges[range].est` (auf 0..1 geklemmt); `upBytes = est * k`; `scaled`, `cov` aus dem KV; `timeline[]` = je Bucket Σ `s*kbps*125*k`, aufsteigend.
- `compare` (optional): Liste = `users[range]` des KV, der eigene Eintrag durch `bytes` ersetzt bzw. hinzugefügt; nur ab 3 Konten. `rank = 1 + Anzahl Werte > bytes`, `of`, `avgBytes` = Mittelwert. Die Antwort enthält **nie** UIDs oder Werte anderer Konten.

## Zählregeln
- **Watchtime, Plays, Verlauf, Heatmap, Geräte, Methoden:** jede Zeile aus `PlaybackActivity` des Nutzers (`ItemType IN ('Movie','Episode')`), ohne Mindestdauer.
- **„Zählt“ als Film/Folge** (`totals.episodes|movies|series`, Top-Listen, Binge-Folgen): Summe von `PlayDuration` pro Item im Zeitraum **≥ 300 s** (`HAVING SUM(PlayDuration) >= 300`).
- `totals.series` = Anzahl verschiedener Serien der gezählten Folgen. `topSeries[].episodes` = gezählte Folgen der Serie. `topSeries[].seconds` = Summe der Sekunden dieser gezählten Folgen.
- `binge.seriesDay`: Serie mit den meisten gezählten (Tag-bezogen ≥ 300 s pro Folge und Tag) Folgen an einem Kalendertag.

## Fehler
| Status | Body | Bedeutung |
|---|---|---|
| 400 | `{"error":"bad-range"}` | unbekannter `range` |
| 401 | `{"error":"unauthorized"}` | Token fehlt/ungültig/widerrufen (Jellyfin antwortet 401/403) |
| 502 | `{"error":"upstream-unreachable"}` | Jellyfin/Tunnel nicht erreichbar oder Antwort nicht JSON, und es gibt keinen Altstand |
| 500 | `{"error":"internal"}` | unerwarteter Fehler (eigenes Error-Handling, beeinflusst `/charts`, `/health`, `/refresh`, Cron nicht) |
- Alle Antworten: `Cache-Control: no-store` (die Server-Caches laufen über die Cache API, nicht über den Browser).

## Cache (Cache API, keine KV-Writes)
- Statistik: Key = `uid` + `range` (nie das Token). Frisch 5 min; der Eintrag bleibt 24 h liegen. Neuberechnung fehlgeschlagen → Altstand mit `stale: true`.
- Token → UserId: Key = SHA-256(Token), frisch 10 min. Als Fallback 24 h **nur** bei Netzwerkfehler/5xx/Nicht-JSON von `/Users/Me`, **nie** bei 401/403. Bekannte Grenze: Ein widerrufenes Token sieht während eines Ausfalls (bis ca. 10 min danach) noch den eigenen Altstand.

## Subrequest-Budget (Free: 50 pro Request)
`/Users/Me` 1 + Cache API 4 + SQL 11 (inkl. Qv) + KV-Get 1 = 17 → für `/Items` bleiben höchstens 30 Blöcke à 100 Episoden (= 3000). Darüber hinaus nur die 3000 mit den meisten Sekunden zuordnen, `approx: true`.
