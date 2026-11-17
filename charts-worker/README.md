# lenzflix-charts

Cloudflare Worker, der aus dem Jellyfin-Plugin **Playback Reporting** serverweite Charts berechnet
(Top Filme, Top Serien, „Am häufigsten geschaut“) und nur an eingeloggte Jellyfin-Nutzer ausliefert.
Vertrag: [`../docs/charts-api.md`](../docs/charts-api.md).

- Cron `0 * * * *` (stündlich) berechnet die Charts und schreibt sie in KV (`CHARTS`, Key `charts:v1`).
- `GET /charts` (Header `X-Emby-Token`), `GET /health`, `POST /refresh` (Header `X-Refresh-Secret`); Mehrspieler: `GET /mp/ticket`, `GET /mp` (siehe unten).

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
`MIN_SECONDS` (0–3600, Default 300). Ungültige Werte fallen auf den Default zurück.

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
