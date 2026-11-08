# lenzflix-charts

Cloudflare Worker, der aus dem Jellyfin-Plugin **Playback Reporting** serverweite Charts berechnet
(Top Filme, Top Serien, „Am häufigsten geschaut“) und nur an eingeloggte Jellyfin-Nutzer ausliefert.
Vertrag: [`../docs/charts-api.md`](../docs/charts-api.md).

- Cron `0 * * * *` (stündlich) berechnet die Charts und schreibt sie in KV (`CHARTS`, Key `charts:v1`).
- `GET /charts` (Header `X-Emby-Token`), `GET /health`, `POST /refresh` (Header `X-Refresh-Secret`).

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
`MIN_SECONDS` (0–3600, Default 120). Ungültige Werte fallen auf den Default zurück.

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
