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
- **Nur feste, im Code hinterlegte SELECT-Abfragen** (keine Nutzereingaben im SQL!). Die einzige Variable ist das Zeitfenster als Zahl aus der Worker-Konfiguration (Integer-validiert).
- Abfrage (distinct Paare Item×Benutzer im Fenster, Mindestdauer 120 s):
  ```sql
  SELECT ItemId, ItemType, UserId, COUNT(*) AS plays, SUM(PlayDuration) AS secs
  FROM PlaybackActivity
  WHERE ItemType IN ('Movie','Episode')
    AND PlayDuration >= 120
    AND DateCreated >= datetime('now','localtime','-30 days')
    AND UserId NOT IN (SELECT UserId FROM UserList)
  GROUP BY ItemId, UserId
  ```
- Episoden → Serie: `GET {JELLYFIN_URL}/Items?Ids=<id1,id2,…>&Fields=SeriesId&EnableImages=false` (API-Key, in Blöcken à 100 IDs). Episoden ohne auflösbare SeriesId werden verworfen; gelöschte Items ebenso.
- Aggregation: Filme pro ItemId, Serien pro SeriesId. `viewers` = Anzahl verschiedener UserIds, `plays` = Summe Wiedergaben, `seconds` = Summe Dauer. Sortierung: viewers desc, plays desc, seconds desc.

## Speicherung
- Cron (stündlich, `0 * * * *`) schreibt das Ergebnis als JSON in KV-Namespace `CHARTS`, Key `charts:v1`.
- Zusätzlich manuell auslösbar: `POST /refresh` nur mit Header `X-Refresh-Secret: <REFRESH_SECRET>` (Secret, optional).

## Auslieferung (Theme → Worker)
- `GET {CHARTS_URL}/charts`
  - Header vom Browser: `X-Emby-Token: <Jellyfin-AccessToken des eingeloggten Nutzers>`
  - Worker prüft das Token: `GET {JELLYFIN_URL}/Users/Me` mit `Authorization: MediaBrowser Token="<token>"` → 200 = gültig. Ergebnis pro Token-Hash (SHA-256) 10 min im Cache (Cache API oder Memory), Tokens werden nie gespeichert/geloggt (nur Hash).
  - Antworten:
    - `200` `application/json`:
      ```json
      {
        "version": 1,
        "generatedAt": "2026-11-08T19:00:00Z",
        "windowDays": 30,
        "metric": "viewers",
        "movies": [{ "id": "…", "viewers": 3, "plays": 5, "seconds": 18000 }],
        "series": [{ "id": "…", "viewers": 2, "plays": 14, "seconds": 36000 }],
        "all":    [{ "id": "…", "type": "Movie|Series", "viewers": 3, "plays": 5, "seconds": 18000 }]
      }
      ```
      `movies`/`series` je max. 50, `all` max. 50 (gemischt, gleiche Sortierung).
    - `401` ohne/ungültiges Token, `503` `{"error":"no-data"}` wenn noch kein Cron-Lauf, `502` wenn Jellyfin für die Token-Prüfung nicht erreichbar.
  - `Cache-Control: private, max-age=300`.
- CORS: `Access-Control-Allow-Origin` = exakt `ALLOWED_ORIGIN` (Var, z. B. `https://jellyfin.example.com`), `Access-Control-Allow-Headers: X-Emby-Token`, `Access-Control-Allow-Methods: GET, OPTIONS`, `Vary: Origin`. Preflight `OPTIONS` → 204.
- `GET /health` → `{"ok":true,"generatedAt":…}` ohne Auth (keine Item-Daten).

## Worker-Konfiguration
- Vars: `JELLYFIN_URL` (z. B. `https://jellyfin.example.com`), `ALLOWED_ORIGIN`, `WINDOW_DAYS` (Default 30), `MIN_SECONDS` (Default 120).
- Secrets (setzt der Betreiber selbst per `wrangler secret put`): `JELLYFIN_API_KEY`, optional `REFRESH_SECRET`.
- Route: Custom Domain `charts.example.com` (Zone liegt bei Cloudflare).

## Theme-Konfiguration
- Charts-URL wird NICHT hartkodiert. Quelle in dieser Reihenfolge:
  1. `window.LenzFlixConfig?.chartsUrl`
  2. CSS-Custom-Property `--lfx-charts-url` auf `:root` (z. B. im Custom-CSS: `:root { --lfx-charts-url: "https://charts.example.com"; }`), per `getComputedStyle(document.documentElement).getPropertyValue('--lfx-charts-url')`, Anführungszeichen entfernen.
  3. keine → Charts aus, bisheriger Fallback.
- Verwendung: „Top 10 Serien“, „Top 10 Filme“ (Neu und beliebt) und „Am häufigsten geschaut“ (`all`). Auf der Startseite: Top-10-Zeile(n) aus den Charts, sobald je ≥ 5 Titel vorhanden; sonst „Top 10: Neu auf LENZFLIX“ wie bisher.
- Items lädt das Theme mit dem Nutzer-Token selbst (`/Items?Ids=…`); IDs ohne Zugriff fallen dabei weg; danach auf 10 kürzen.
