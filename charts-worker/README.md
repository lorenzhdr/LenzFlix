# lenzflix-charts

Cloudflare Worker, der aus dem Jellyfin-Plugin **Playback Reporting** serverweite Charts berechnet
(Top Filme, Top Serien, „Am häufigsten geschaut“) und nur an eingeloggte Jellyfin-Nutzer ausliefert.
Vertrag: [`../docs/charts-api.md`](../docs/charts-api.md).

- Cron `0 * * * *` (stündlich) berechnet die Charts und schreibt sie in KV (`CHARTS`, Key `charts:v1`).
- `GET /charts` (Header `X-Emby-Token`), `GET /health`, `POST /refresh` (Header `X-Refresh-Secret`); Mehrspieler: `GET /mp/ticket`, `GET /mp`, `GET /mp/online`; Wetter: `GET /wx` (siehe unten).

## Einrichtung (Schritt für Schritt)

1. **Jellyfin-API-Schlüssel**: Dashboard → API-Schlüssel → neuen Schlüssel „LenzFlix Charts“ anlegen und kopieren.
2. **Projekt vorbereiten**:
   ```
   cd charts-worker
   npm install
   npx wrangler login          # öffnet den Browser
   npx wrangler kv namespace create CHARTS
   ```
   Die ausgegebene ID in deine lokale `wrangler.local.jsonc` (Kopie von `wrangler.jsonc`, gitignored, mit deinen echten Domains) statt `REPLACE_WITH_KV_ID` eintragen.
3. **Secrets setzen**:
   ```
   npx wrangler secret put JELLYFIN_API_KEY -c wrangler.local.jsonc # Schlüssel aus Schritt 1 einfügen
   npx wrangler secret put REFRESH_SECRET -c wrangler.local.jsonc # optional, für manuelles /refresh
   ```
4. **Deploy**: `npx wrangler deploy -c wrangler.local.jsonc` (legt die Custom Domain aus deiner lokalen Konfiguration an, z. B. `charts.example.com`; die Zone muss bei Cloudflare liegen).
5. **Ersten Lauf auslösen** (oder auf den nächsten Stundenwechsel warten) und prüfen:
   ```
   curl -X POST https://charts.example.com/refresh -H "X-Refresh-Secret: …"
   curl https://charts.example.com/health
   ```
6. **Theme anbinden**: In Jellyfin unter Custom-CSS ergänzen:
   ```css
   :root { --lfx-charts-url: "https://charts.example.com"; }
   ```

Konfiguration (Vars in `wrangler.jsonc`): `JELLYFIN_URL`, `ALLOWED_ORIGIN`, `WINDOW_DAYS` (1–365, Default 30),
`MIN_SECONDS` (Folgen, 0–3600, Default 300), `MIN_SECONDS_MOVIE` (Filme, 0–3600, Default 800). Ungültige Werte fallen auf den Default zurück.
Die Charts werden nach Aktualität gewichtet (Halbwertszeit 7 Tage, Serien mit log2-Dämpfung je Person); Regeln: [`../docs/charts-api.md`](../docs/charts-api.md).

## Mehrspieler (VIDEOTHEK LENZ, ab 1.16.0)

Derselbe Worker trägt die gemeinsame Welt der VIDEOTHEK: ein Durable Object `MpWorld` (eine Welt für alle, höchstens 16 Verbindungen). Vertrag: [`../docs/mp-api.md`](../docs/mp-api.md).

- Routen: `GET /mp/ticket` (Header `X-Emby-Token`, liefert ein kurzlebiges, signiertes Ticket) und `GET /mp` (WebSocket-Upgrade mit den Subprotokollen `lfx-mp.1` und `t.<ticket>`, nur von `ALLOWED_ORIGIN` bzw. `MP_DEV_ORIGINS`).
- Binding `WORLD` → Klasse `MpWorld`, Migration `mp1` (siehe `wrangler.jsonc`; den Tag `mp1` nie umbenennen). Das Durable Object nutzt SQLite-Speicher, der auch im Free-Plan verfügbar ist.
- Vars (alle optional): `MP_MAX_CONN` (gleichzeitige Verbindungen, Default 16), `MP_DAILY_REQ` (Tageskontingent in Requests, Default 80000), `MP_DEV_ORIGINS` (zusätzliche erlaubte `https`-Origins für Tests, kommagetrennt, Default leer).
- **Secret `MP_SECRET`** setzen (langer Zufallswert, mindestens 32 Zeichen), sonst bleibt der Mehrspieler aus (`/mp/ticket` antwortet 503, die VIDEOTHEK läuft wie bisher):
  ```
  npx wrangler secret put MP_SECRET -c wrangler.local.jsonc
  ```
  Ein Drehen des Secrets ändert alle Pseudonyme `k` der Spieler; lokale Stummschaltlisten und laufende Sperren (Kick) verfallen dadurch.
- **Kill-Schalter:** Wird `MP_SECRET` entfernt (`npx wrangler secret delete MP_SECRET`), antwortet `/mp/ticket` mit 503, und das Durable Object schließt beim nächsten Alarm alle Verbindungen still.
- **Free-Plan:** Ein Sparwächter zählt Requests pro UTC-Tag gegen `MP_DAILY_REQ`. Ab 60 % senkt er die Sende-Raten der Clients, ab 95 % nimmt er keine neuen Verbindungen mehr an (Close-Code 4503), bestehende laufen mit minimaler Rate weiter. Die VIDEOTHEK fällt dann still auf das Verhalten ohne Mehrspieler zurück.
- Deploy wie oben (`npx wrangler deploy -c wrangler.local.jsonc`); die Migration `mp1` legt das Durable Object beim ersten Deploy an. Im Theme muss `chartsUrl` gesetzt sein; Hinweis zur CSP (`connect-src wss://…`) in der Haupt-README.

## Echtes Wetter für die VIDEOTHEK (`GET /wx`, ab 1.19.0)

Liefert das aktuelle Wetter an einem festen Ort, damit die VIDEOTHEK Regen, Schnee, Nebel und Gewitter passend zeigt. Quelle ist eine öffentliche Wetter-API (Quelle und Lizenz siehe README im Projektstamm). Optional: Ohne Konfiguration bleibt alles wie vorher (zufälliges Wetter im Client).

- **Konfiguration:** die Vars `WX_LAT` und `WX_LON` (Breite und Länge als Zeichenketten, Dezimalpunkt) tragen nur in der **lokalen, gitignorierten** `wrangler.local.jsonc` den Ort ein. Die Vorlage `wrangler.jsonc` enthält leere Platzhalter und bleibt so; echte Werte gehören nie ins Repository. Ungültige oder fehlende Werte zählen als nicht konfiguriert.
- **Nicht konfiguriert:** `GET /wx` antwortet 404 `wx-off`; der Client fällt still auf das Zufallswetter zurück (und fragt erst nach einigen Minuten wieder).
- **Aufruf:** Header `X-Emby-Token` wie bei `/charts`. Reihenfolge: 404 ohne Konfiguration, 401 ohne Token, dann Limit 30 Anfragen/min je IP (vor der Prüfung des Tokens bei Jellyfin), 401 bei ungültigem Token, 502 wenn Jellyfin nicht erreichbar ist, 503 `wx-down`, wenn weder frische noch brauchbare ältere Daten vorliegen.
- **Cache:** Isolate-Speicher, dann KV (`CHARTS`, Key `wx:v1`) mit 15 min Frische, dann die Wetter-API (Timeout 4 s, ein gemeinsamer Abruf für alle Wartenden). Nach einem Fehler der Quelle 60 s kein neuer Abruf. Ältere Daten bis 2 h werden mit `"stale": 1` ausgeliefert, danach 503. Antwort mit `Cache-Control: private, max-age=300`.
- **Antwort 200:** `{ "v": 1, "k": "clear|cloudy|fog|drizzle|rain|heavy|snow|storm", "i": 0..1, "sd": <Schneehöhe in m>, "fog": 0..1, "t": <ganze °C> | null, "day": 0|1, "ts": <ms>, "stale"?: 1 }`. Fehlende Messwerte bleiben `null` (Temperatur) bzw. 0 (Schneehöhe, Nebel); ein fehlender Wettercode macht die ganze Antwort ungültig (kein erfundenes „klar“). Die Antwort enthält **nie** Koordinaten, Ortsnamen, Höhe oder Zeitzone.
- Pro Client wird `/wx` höchstens alle 14 Minuten abgefragt; Kosten im Free-Plan: wenige Worker-Requests je Stunde und Spieler, KV: ein Put je Frischwechsel (höchstens 4 je Stunde).

## Online-Anzeige (`GET /mp/online`, ab 1.19.0)

Zahl der gerade in der VIDEOTHEK anwesenden Konten für die Pille „N online“ im Design-Menü. Vertrag: [`../docs/mp-api.md`](../docs/mp-api.md) §17.

- Header `X-Emby-Token`; Antwort `{ "v": 1, "n": <Anzahl> }` mit `Cache-Control: private, max-age=30`. Keine Namen, keine IDs.
- Limits: 12/min je Token, 60/min je IP (eigener Zähler). Ein Isolate-Cache von 45 s sorgt dafür, dass das Durable Object höchstens alle 45 s geweckt wird.
- 503 bei ausgeschaltetem Mehrspieler (`MP_SECRET` fehlt) oder Fehler des Durable Objects; ein älterer Worker ohne die Route antwortet 404, der Client zeigt dann nichts an.

## Server-Statistik (`/srv`, ab 1.22.0)

Zeigt allen angemeldeten Konten ohne Nutzernamen, was auf dem Server läuft (Jetzt, Monat, Server). Vertrag: [`../docs/server-stats.md`](../docs/server-stats.md).

- **Lesen (Header `X-Emby-Token`):** `GET /srv` (Probe: Reiter und ältester Monat), `GET /srv/now`, `GET /srv/month?m=0..35`, `GET /srv/server`. Reihenfolge: 401 ohne Token, IP-Limit vor der Anmeldung, 401/502 bei der Anmeldung, dann das Token-Limit (429 `rate`). Limits je Minute (Token/IP): Probe 20/60, Jetzt 12/60, Monat 30/90, Server 12/60.
- **Melden:** `POST /srv/report` mit `Authorization: Bearer <SERVER_REPORT_SECRET>` und JSON (höchstens 64 KB). Das Secret mit mindestens 32 Zeichen per `npx wrangler secret put SERVER_REPORT_SECRET` setzen; ohne Secret antwortet die Route 404 `srv-off`. Der Worker übernimmt nur Whitelist-Felder, führt Meldungen zusammen (Traffic: je Monat/Tag das Maximum, fehlende Teile behalten den alten Stand) und schreibt höchstens alle 10 min ins KV. Das Skript für den Server liegt in [`../tools/server-report/`](../tools/server-report/).
- **Tageslauf:** `POST /srv/refresh[?full=1]` mit `X-Refresh-Secret` (wie `/refresh`). Der Cron `23 */6 * * *` führt ihn nur aus, wenn der letzte Erfolg älter als 20 h ist, und lädt je Slot einen Abschnitt der Bibliothek. In `wrangler.local.jsonc` ebenfalls eintragen.
- Antworten enthalten nie Konto- oder Gerätenamen, IDs oder IPs.

## Entwicklung

```
npm test                 # vitest (Mocks, kein Netzwerk)
npx wrangler deploy --dry-run --outdir .tmp-dry   # Build-Check ohne Login
```

## Datenschutz

- Im KV liegen nur **Item-IDs und Zählwerte** (viewers, plays, seconds) sowie Zeitstempel/Zeitfenster.
  Es werden **keine Nutzer-IDs** gespeichert oder ausgeliefert; Nutzer-IDs werden nur im Speicher zum
  Zählen verschiedener Zuschauer verwendet.
- Jellyfin-Tokens der Nutzer werden nie geloggt oder gespeichert; gemerkt wird nur ein SHA-256-Hash
  (10 min im Speicher des Workers).
- Zuschauer, die im Plugin Playback Reporting in der **Ignorierliste** stehen, zählen nicht mit.
