# LenzFlix Charts – Vertrag Worker ⇄ Theme

Ziel: echte serverweite Charts („Top 10 Serien“, „Top 10 Filme“, „Am häufigsten geschaut“) aus dem
Jellyfin-Plugin **Playback Reporting** (v19, Jellyfin 12.x). Ein Cloudflare Worker berechnet sie per Cron
mit einem Admin-API-Key und liefert sie nur an eingeloggte Jellyfin-Nutzer aus.

## Datenquelle (Worker → Jellyfin)
- `POST {JELLYFIN_URL}/user_usage_stats/submit_custom_query` (nur Admin/API-Key; Policy RequiresElevation)
  - Header: `Authorization: MediaBrowser Token="<JELLYFIN_API_KEY>"`, `Content-Type: application/json`
  - Body: `{"CustomQueryString":"<SQL>","ReplaceUserId":false}`
  - Antwort: `{"colums":[...], "results":[[...string...]], "message":"..."}` (Key heißt wirklich `colums`; alle Zellen sind Strings)
- Tabelle `PlaybackActivity(DateCreated DATETIME, UserId TEXT, ItemId TEXT, ItemType TEXT, ItemName TEXT, PlaybackMethod TEXT, ClientName TEXT, DeviceName TEXT, PlayDuration INT)`; `UserList(UserId)` = ignorierte Benutzer. IDs = GUID ohne Bindestriche. `DateCreated` = lokale Serverzeit.
- **Nur feste, im Code hinterlegte SELECT-Abfragen** (keine Nutzereingaben im SQL!). Variabel sind nur drei Integer aus der Worker-Konfiguration: `WINDOW_DAYS` (1–365), `MIN_SECONDS` (0–3600, Folgen, Default 300) und `MIN_SECONDS_MOVIE` (0–3600, Filme, Default 800), alle validiert, sonst Default.
- Abfrage (je Paar Item×Benutzer im Fenster; Filme zählen ab 800 s, Folgen ab 300 s Wiedergabe je Zeile/Sitzung; `age` = Alter des letzten Abrufs in ganzen Kalendertagen, ausgedrückt in Sekunden (immer ein Vielfaches von 86400; Mitternacht heute minus Mitternacht des Abruftags, alles vom selben Tag zählt gleich), `DateCreated` ist lokale Serverzeit wie `'now','localtime'`):
  ```sql
  SELECT ItemId, ItemType, UserId, COUNT(*) AS plays, SUM(PlayDuration) AS secs,
         (strftime('%s','now','localtime','start of day') - strftime('%s', substr(MAX(DateCreated),1,10))) AS age
  FROM PlaybackActivity
  WHERE ((ItemType = 'Movie' AND PlayDuration >= 800)
      OR (ItemType = 'Episode' AND PlayDuration >= 300))
    AND DateCreated >= datetime('now','localtime','-30 days')
    AND UserId NOT IN (SELECT UserId FROM UserList)
  GROUP BY ItemId, UserId
  ```
- **Fehlerfall ohne `age`:** Hat die Antwort Zeilen, aber keine einzige mit gültigem `age` (Spalte fehlt oder alle Zellen nicht als Zahl lesbar), wirft `computeCharts` (`charts: age column missing`). Der Cron behält dann das alte KV-Ergebnis, `POST /refresh` antwortet `502 {"error":"refresh-failed"}`. Eine leere Antwort ist kein Fehler.
- Episoden → Serie: `GET {JELLYFIN_URL}/Items?Ids=<id1,id2,…>&Fields=SeriesId&EnableImages=false` (API-Key, in Blöcken à 100 IDs). Episoden ohne auflösbare SeriesId werden verworfen; gelöschte Items ebenso. Der Cron löst höchstens 2000 Episoden auf (stärkste zuerst: Zuschauer, dann Sekunden) = 20 Blöcke, mit Abfrage und `/Users` etwa 22 Subrequests je Lauf (Free-Plan-Limit 50). Serien, die nur über seltene Episoden jenseits der 2000 vorkommen, können in den Charts fehlen; dabei fallen Folgen mit nur einer Person zuerst weg (betrifft erst mehr als 2000 verschiedene Folgen in 30 Tagen).
- Filmlaufzeiten (nur für den Gleichstand): `resolveRuntimes` holt `GET {JELLYFIN_URL}/Items?Ids=<…>&EnableImages=false` (API-Key, `RunTimeTicks` ist im Standard-DTO enthalten, in Sekunden = Ticks / 10 000 000), höchstens 5 Blöcke à 100 (500 Filme, stärkste nach Zuschauern zuerst) plus ein weiterer `/Users`-Aufruf. Ein Fehler dabei ergibt eine leere Map und bricht den Lauf nicht ab. Subrequests je Lauf im ungünstigsten Fall: 1 Abfrage + 1 `/Users` + 20 Episoden-Blöcke + 1 `/Users` + 5 Laufzeit-Blöcke = 28 (nur mit Filmen im Fenster; ohne Filme bleibt es bei 22).
- Aggregation: Filme pro ItemId, Serien pro SeriesId. `viewers` = Anzahl verschiedener UserIds, `plays` = Summe Wiedergaben, `seconds` = Summe Dauer.
  - **Aktualität:** Gewicht je Zeile (Item×Person) `w = 0.5 ** (ageDays / 7)` (Halbwertszeit 7 Tage, `ageDays` = Alter des letzten Abrufs in ganzen Kalendertagen: heute 1, gestern 0.5^(1/7), …). Ungültiges oder fehlendes `age` zählt als `w = 1`, negatives Alter wird auf 0 geklemmt (also `w = 1`).
  - **Filme:** `score = Σ w` über Personen (jede Person höchstens 1 Punkt, daher `score ≤ viewers`).
  - **Serien:** je Person `W = Σ w` über ihre Folgen der Serie, `score = Σ log2(1 + W)` über Personen. Eine Person mit 1/3/7/15 frischen Folgen bringt 1/2/3/4 Punkte.
  - `score` wird auf 3 Nachkommastellen gerundet.
  - **`completion` (nur Filme):** Σ über Personen `min(1, secsDerPerson / Laufzeit)` (je Person auf 1 gekappt), 3 Nachkommastellen. Ohne bekannte Laufzeit (nicht aufgelöst, 0, ungültig) fehlt das Feld.
  - **Sortierung `movies`:** `score` desc, `viewers` desc, `completion` desc (nur wenn beide Filme eins haben, sonst übersprungen), `seconds` desc, `plays` desc, `id` asc (deterministisch).
  - **Sortierung `series`:** `score` desc, `viewers` desc, `seconds` desc, `plays` desc, `id` asc.
  - **`all`** (Mischliste aus den vollständigen Film- und Serienlisten) bleibt bei der alten Regel ohne Aktualität: `viewers` desc, `plays` desc, `seconds` desc, Einträge ohne `score`. Die 800-s-Schwelle für Filme gilt wegen der gemeinsamen SQL auch dort.

## Speicherung
- Cron (stündlich, `0 * * * *`) schreibt das Ergebnis als JSON in KV-Namespace `CHARTS`, Key `charts:v1`.
- Zusätzlich manuell auslösbar: `POST /refresh` nur mit Header `X-Refresh-Secret: <REFRESH_SECRET>` (Secret, optional). Antworten: `200 {"ok":true,"generatedAt":…}`; `401`, wenn Header oder `REFRESH_SECRET` fehlt oder nicht passt; `502 {"error":"refresh-failed"}`, wenn die Berechnung scheitert (altes KV-Ergebnis bleibt); sonst `404`/`500 {"error":"internal"}`.

## Auslieferung (Theme → Worker)
- `GET {CHARTS_URL}/charts`
  - Header vom Browser: `X-Emby-Token: <Jellyfin-AccessToken des eingeloggten Nutzers>`
  - Worker prüft das Token: `GET {JELLYFIN_URL}/Users/Me` mit `Authorization: MediaBrowser Token="<token>"` → 200 = gültig. Ergebnis pro Token-Hash (SHA-256) im Memory-Cache des Isolates: gültig 10 min, ungültig nur 60 s (Negativ-Cache), Tokens werden nie gespeichert/geloggt (nur Hash).
  - Antworten:
    - `200` `application/json`:
      ```json
      {
        "version": 1,
        "generatedAt": "2026-11-08T19:00:00Z",
        "windowDays": 30,
        "metric": "score",
        "rules": { "halfLifeDays": 7, "ageUnit": "day", "minSecondsMovie": 800, "minSecondsEpisode": 300 },
        "movies": [{ "id": "…", "viewers": 3, "plays": 5, "seconds": 18000, "score": 2.375, "completion": 2.4 }],
        "series": [{ "id": "…", "viewers": 2, "plays": 14, "seconds": 36000, "score": 3.17 }],
        "all":    [{ "id": "…", "type": "Movie|Series", "viewers": 3, "plays": 5, "seconds": 18000 }]
      }
      ```
      `movies`/`series` je max. 50 (nach `score`), `all` max. 50 (gemischt, nach `viewers`, ohne `score`). `rules` nennt die tatsächlich wirksamen (validierten) Werte; `ageUnit: 'day'` = Alter in Kalendertagen. `completion` ist optional (nur Filme mit bekannter Laufzeit).
    - `401` ohne/ungültiges Token, `503` `{"error":"no-data"}` wenn noch kein Cron-Lauf, `502` wenn Jellyfin für die Token-Prüfung nicht erreichbar.
  - `Cache-Control: private, max-age=300`.
- CORS: `Access-Control-Allow-Origin` = exakt `ALLOWED_ORIGIN` (Var, z. B. `https://jellyfin.example.com`), `Access-Control-Allow-Headers: X-Emby-Token`, `Access-Control-Allow-Methods: GET, OPTIONS`, `Vary: Origin`. Preflight `OPTIONS` → 204.
- `GET /health` → `{"ok":true,"generatedAt":…}` ohne Auth (keine Item-Daten).

## Worker-Konfiguration
- Vars: `JELLYFIN_URL` (z. B. `https://jellyfin.example.com`), `ALLOWED_ORIGIN`, `WINDOW_DAYS` (Default 30), `MIN_SECONDS` (Folgen, Default 300), `MIN_SECONDS_MOVIE` (Filme, Default 800).
- Secrets (setzt der Betreiber selbst per `wrangler secret put`): `JELLYFIN_API_KEY`, optional `REFRESH_SECRET`.
- Route: Custom Domain `charts.example.com` (Zone liegt bei Cloudflare).

## Theme-Konfiguration
- Charts-URL wird NICHT hartkodiert. Quelle in dieser Reihenfolge:
  1. `window.LenzFlixConfig?.chartsUrl`
  2. CSS-Custom-Property `--lfx-charts-url` auf `:root` (z. B. im Custom-CSS: `:root { --lfx-charts-url: "https://charts.example.com"; }`), per `getComputedStyle(document.documentElement).getPropertyValue('--lfx-charts-url')`, Anführungszeichen entfernen.
  3. keine → Charts aus, bisheriger Fallback.
- Verwendung: „Top 10 Serien“, „Top 10 Filme“ (Neu und beliebt) und „Am häufigsten geschaut“ (`all`). Auf der Startseite: Top-10-Zeile(n) aus den Charts, sobald je ≥ 5 Titel vorhanden; sonst „Top 10: Neu auf LENZFLIX“ wie bisher.
- Items lädt das Theme mit dem Nutzer-Token selbst (`/Items?Ids=…`); IDs ohne Zugriff fallen dabei weg; danach auf 10 kürzen.
