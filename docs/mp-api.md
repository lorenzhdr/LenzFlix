# LenzFlix Mehrspieler – Vertrag `lfx-mp.1` (Release 1.16.0)

Verbindlicher Vertrag zwischen Worker (Durable Object `MpWorld` im `charts-worker`), Hülle (`features/store/`, Hauptbundle) und 3D-Bundle (`src/js/store3d/net/`, lazy `lenzstore`) für den Mehrspieler der VIDEOTHEK LENZ. Gegenstück zu `docs/charts-api.md`; die Einrichtung des Workers steht in `charts-worker/README.md`, die 3D-Seite in `docs/store3d.md` („Mehrspieler (1.16.0)“).

Schreibweise: Dezimalpunkt in Tabellen und Formeln (`0.35`); Einheiten cm (int), cRad (int, 1/100 rad), cm/s, Server-ms. „Entscheidung:“ markiert eine begründete Festlegung, wo die Entwürfe sich widersprachen.

## 1. Überblick und Wellen

- Eine Welt für alle: ein DO `MpWorld` über `env.WORLD.idFromName('world')`, höchstens 16 Verbindungen. Kein Raum, keine Sharding-Logik.
- Mehrspieler ist standardmäßig AN. Unterschalter: Name zeigen AN, Chat AN, „Mein Film für andere sichtbar“ AUS (privat = kein Titel, kein Mitschauen-Angebot). Einmaliger Hinweis pro Konto: „Andere auf diesem Server sehen dich hier. Abschalten im Menü unter Mehrspieler.“
- Name = Jellyfin-Benutzername; die `uid` verlässt den Worker nie (nur das Pseudonym `k`).
- Format: JSON mit Typfeld `t`. Der Client schickt Frames als JSON-Array `[{t…},…]`, der Server bündelt Ausgang (§7).
- Jede Störung schaltet den Mehrspieler still ab; die VIDEOTHEK verhält sich dann exakt wie 1.15 (keine `.lfx-mp-*`-Elemente, T und Enter werden durchgereicht).
- Rechte-Filter: nur Item-IDs gehen über die Leitung; Cover und Titel zeigt der Betrachter nur aus dem eigenen Katalog, sonst neutrale Hülle.
- Fähigkeiten (`cap`) machen Wellen einzeln auslieferbar:

| Welle | Inhalt | `cap` | Nachrichten |
|---|---|---|---|
| a | Transport, Präsenz, Figuren (inkl. Sitzen `a=7`/`se`) | `pres` | `hi wl b ck rn p hd f bye er`, Text `ping`/`pong` |
| b | Chat, Emotes, Liste, Admin-Kick | `chat` `emote` `admin` | `m e ki` |
| c | Schubsen, Physik, Richard, Wetter | `push` `phys` `rich` `wx` | `pu pc ps pn px rc rs rr` |
| d | Kino-Sync | `kino` | `ks kj kl kc kb` |

Der Server kündigt `kino` erst nach bestandenem Live-Test (Welle d) an. `wx` hat keine eigene Client-Nachricht (nur `wl.wx`).

## 2. Transport und Auth

### 2.1 Ticket: `GET /mp/ticket`, Header `X-Emby-Token`

- Warum GET: Die CORS-Regeln erlauben nur `GET, OPTIONS` (`charts-worker/src/http.js`, `test/http.test.js`). Ein POST scheitert an einem alten Worker schon im Preflight; mit GET liefert der alte Worker ein sauberes 404. `http.js` bleibt unverändert.
- Der Worker löst das Token über `resolveUser(env, token, ctx)` (`src/auth.js`, Cache-Schlüssel `tok2/`) zu `{uid, name, admin}` auf (`getMeInfo`: `Id`, `Name`, `Policy.IsAdministrator`; fehlt `Policy`, Rückfall `GET /Users/{uid}`, sonst `admin=false`). Beim 24-h-Rückfall nach 5xx gilt immer `admin=false`. `/me/stats` bleibt unverändert.
- Ticketformat: `b64url(JSON) + "." + b64url(HMAC-SHA256(MP_SECRET, payloadB64))`. Nutzlast `{v:1, k, n, a, e, j}`:

| Feld | Bedeutung |
|---|---|
| `k` | Pseudonym: erste 12 Hex-Zeichen von HMAC(MP_SECRET, `"k|"+uid`) |
| `n` | Name: NFC, Steuer-/Bidi-/Zero-Width-Zeichen entfernt, höchstens 24 Codepoints, leer wird „Gast“ |
| `a` | 0 oder 1 (Admin) |
| `e` | Ablauf: jetzt + 60 s (ms) |
| `j` | jti, 16 Byte Zufall, einmalig |

- Antwort 200 (`no-store`, CORS): `{v:1, tk, exp, url:"/mp", pv:[1], s:serverMs}`.

| Status | Bedeutung |
|---|---|
| 401 | Token fehlt oder ungültig |
| 429 `rate` | mehr als 6/min je Token-Hash (Isolate-Karte, höchstens 500 Einträge) |
| 502 | Jellyfin nicht erreichbar und kein Cache |
| 503 `mp-disabled` | `MP_SECRET` (mindestens 32 Zeichen) oder Binding `WORLD` fehlt; ohne Jellyfin-Aufruf |
| 404 | alter Worker (Mehrspieler bleibt still aus) |

Warum HMAC statt Ticket im DO-Speicher: Fehlversuche kosten kein DO-Kontingent, die Prüfung übersteht Hibernation, kein zusätzlicher DO-Aufruf je Verbindung. Einmaligkeit über `j:<jti> → e` im DO-Storage.

### 2.2 Upgrade: `GET /mp`

Client: `new WebSocket(wssBase + "/mp", ["lfx-mp.1", "t." + tk])`. Weder Token noch Ticket stehen in der URL. Prüfreihenfolge im Worker:

1. Ohne `Upgrade: websocket` → 426.
2. `Origin` fehlt, ist nicht `ALLOWED_ORIGIN` und nicht in `MP_DEV_ORIGINS` (optional, nur https) → 403 (CORS greift bei WebSockets nicht).
3. `lfx-mp.1` nicht in der Subprotokoll-Liste (an Kommas zerlegt, getrimmt) → 426.
4. `t.`-Eintrag: HMAC über `crypto.subtle.verify`, `e > now`, sonst 401.
5. Weiterleitung an das DO: alle `x-lfx-*` des Clients entfernt, dazu `X-Lfx-Claims: b64url(JSON{k,n,a,e,j})`. Wirft das DO, folgt 503.
6. Das DO antwortet mit 101 und setzt selbst `Sec-WebSocket-Protocol: lfx-mp.1`.

### 2.3 Handshake, Keepalive, Neuprüfung

- Client sendet `hi`, DO antwortet mit `wl`. Kommt binnen 10 s kein `hi`, schließt das DO mit 4408. Entscheidung: Die Frist wird bei jeder Nachricht und im Alarm geprüft, es gibt dafür keinen eigenen Alarm (jeder Alarm kostet einen Request); ein Socket ohne `hi` fällt damit spätestens nach etwa 60 s. Die `hi`-Frist steht bewusst NICHT in `nextDeadline` (nur 60-s-Alarm bzw. nächste Nachricht).
- Keepalive: Client sendet alle 25 s den Text `ping` (Wanduhr), das DO antwortet per `setWebSocketAutoResponse` mit `pong`, ohne aufzuwachen. Bleibt `pong` zweimal aus, verbindet der Client neu.
- Neuprüfung: Das DO sieht nie das Jellyfin-Token. Alle 10 min holt die Hülle ein neues Ticket, der Client sendet `rn {tk}`. `world.js` prüft HMAC per `crypto.subtle` (asynchron) und gibt `renew-ok{claims}` in den Reducer: gleiches `k`, neue jti, dann `x = now + 15 min`; `n` und `a` werden neu übernommen, bei Namensänderung folgt `ev pf`. Läuft `x` ab, schließt das DO mit 4401.
- Logout/Nutzerwechsel: dispose bzw. suspend schließt mit 1000 (kein eigener Haken, kein `revoke`).

### 2.4 Verborgener Tab (W9)

Verborgen: keine Posen, die Verbindung bleibt höchstens 60 s offen, dann Close 1000; sichtbar heißt neu verbinden. Ausnahme: Solange eine Kino-Sitzung aktiv ist (auch VR-Kino, bei dem `suspended` false bleibt), bleibt die Verbindung offen, ohne Posen.

## 3. Close-Codes und Still-aus

Vor jedem Close vom Server geht `bye {c, u?}`.

| Code | `bye.c` | Client-Verhalten |
|---|---|---|
| 1000 | – | normal (Schalter aus, Logout, dispose, suspend) |
| 1001 / 1006 / 1011 | – | Backoff |
| 4000 / 4408 | bad / hello | Backoff, nach 3x aus für die Seitensitzung |
| 4001 | pv | aus, Hinweis „Update nötig“ |
| 4401 | auth | neues Ticket, 1x sofort, dann Backoff |
| 4403 | ban | keine Verbindung bis `u` (ms) |
| 4409 | dup | mehr als 4 Verbindungen gleicher `k`: aus |
| 4429 | rate | 60 s warten |
| 4503 | full / quota | 60 s / 30 min |

- Backoff: 1, 2, 4, 8, 16, 30, 60 s mit ±20 % Jitter, zurückgesetzt nach 60 s stabiler Verbindung. Höchstens 6 Versuche je 10 min, danach 30 min Pause.
- `why`-Codes von `deps.mp.ticket()` (W2): `net` = Backoff, `blocked` = aus.

| `why` | Auslöser | Verhalten |
|---|---|---|
| `nourl` | keine Charts-URL | aus für die Seitensitzung, Panel „nicht eingerichtet“ |
| `gone` | 404 (alter Worker) | aus für die Seitensitzung |
| `off` | 503 | aus für die Seitensitzung |
| `blocked` | `TypeError` bei `fetch` (CORS, CSP) | aus für die Seitensitzung |
| `bad` | Antwort ohne `tk` oder `url !== "/mp"` | aus für die Seitensitzung |
| `auth` | 401 | aus bis Nutzerwechsel |
| `user` | kein Token oder anderer Nutzer | aus bis Nutzerwechsel |
| `rate` | 429 | Backoff |
| `net` | Timeout (8 s), sonstige 5xx, `navigator.onLine===false` | Backoff |

- Ein Upgrade-401 ist im Browser nicht von 1006 unterscheidbar. **Entscheidung:** Schlägt das Öffnen vor `wl` ohne `bye` fehl, holt der Client genau einmal sofort ein neues Ticket und versucht es erneut, danach gilt der normale Backoff.
- Echte Kontingent-Erschöpfung: Client sieht 503/1006, Backoff, nach 6 Fehlversuchen 30 min aus; Spiel wie 1.15.

## 4. Durable Object und Zustand

- `class MpWorld { constructor(ctx, env) }` ohne `import 'cloudflare:workers'` (sonst sind Node-Tests von `src/index.js` unmöglich). Dünne Hülle (`src/mp/world.js`) um den reinen Reducer `src/mp/room.js`: `(state, event, now, rand) → {state, out[], close[], store[], alarmAt}`. `room.js` und alle `src/mp/*` außer `world.js`, `cf.js`, `route.js` sind browserfähiges ESM ohne Node-/CF-APIs (der Fake-Server der Harness lädt sie direkt). CF-Laufzeitstellen nur in `cf.js` (`pair()`, `upgrade(client, proto)`, `autoPing(ctx)`).
- Konfiguration: `durable_objects.bindings [{name:"WORLD", class_name:"MpWorld"}]`, `migrations [{tag:"mp1", new_sqlite_classes:["MpWorld"]}]` (Tag nie umbenennen), Vars `MP_MAX_CONN "16"`, `MP_DAILY_REQ "80000"`, `MP_DEV_ORIGINS ""`, Secret `MP_SECRET`. `compatibility_date` 2026-11-01.
- Hibernation: `ctx.acceptWebSocket`, `webSocketMessage/Close/Error`, `alarm`. Der Konstruktor lädt per `blockConcurrencyWhile` den Storage und baut Peers aus `getWebSockets()` und `deserializeAttachment()`.
- **Keine `setTimeout`/`setInterval` im DO** (sie verhindern Hibernation). Fristen laufen über `alarm()` bzw. die Prüfung im Message-Handler.

| Daten | Ort | Nach Kaltstart |
|---|---|---|
| Peer `{c,k,n,a,f,cap,j,x}`, letzte Pose `q`, Sitz `se`, Hülle `h`, Richard-Autorität `ra:{g,rf,tg}` | Attachment (bei Pose-Änderung neu geschrieben, kein Storage-Zugriff). Ziel unter 1 kB (Test), hartes Maximum 16 KiB | vollständig |
| Kino-Sitzungen | Storage `hall`, bei jeder Änderung | vollständig |
| Bans | `b:<k>` → until | vollständig |
| jti | `j:<jti>` → e (eine Zeile je Verbindung) | vollständig |
| Wetter-Seed | `seed`, einmal zufällig | vollständig |
| Ruhelagen bewegter Requisiten | Speicher + `rest`, höchstens 1x je 5 s, höchstens 96 Einträge, geleert wenn die letzte Verbindung geht | vollständig |
| Physik-Besitz, Rate-Buckets | nur Speicher | leer/voll (Besitz endet mit dem Schlaf) |
| Tageszähler | `quota{d,n}` alle 500 Frames | ±500 |
| Schema | `sv:1` | – |

### 4.1 Verbindung annehmen

1. jti schon benutzt → 401 vor dem accept.
2. accept.
3. Ban aktiv → 4403.
4. Raum voll (`MP_MAX_CONN`) → 4503 `full`.
5. Schon 4 Verbindungen mit gleichem `k` → 4409.
6. Sparwächter bei mindestens 95 % → 4503 `quota`.

`c` ist eine laufende Nummer 1..65535; nach Kaltstart max(c)+1 aus den Attachments.

### 4.2 Alarm

Der Alarm läuft zu min(nächste Frist aus `nextDeadline` der Unter-Reducer, now + 60 s), nur solange Verbindungen bestehen; `setAlarm` nur, wenn keiner gesetzt ist oder der neue früher liegt. Erledigt: tote Sockets schließen (`getWebSocketAutoResponseTimestamp` und letzte Nachricht älter als 90 s, 1011), abgelaufene Renew-Frist `x` (4401), `hi`-Frist (4408), jti/Bans aufräumen, Unter-Reducer-Fristen (Kino-`w`), bei 0 Verbindungen `rest` leeren und keinen neuen Alarm setzen. Jeder Alarm zählt in die Kontingentrechnung (§9).

## 5. Limits

Abweisen spart kein Kontingent (der Frame ist schon berechnet); Schutz heißt deshalb **schließen**. Server-Grenzen liegen bewusst über dem Client-Verhalten (Client: ein Sende-Takt, siehe §6.3).

| Was | Grenze | Verstoß |
|---|---|---|
| Frame | höchstens 2 kB (2048 Zeichen), nur Text, JSON-Array | 4000 |
| Frames | 12/s, Burst 20 | 3 s darüber: 4429 |
| `p` | 10/s | verwerfen |
| `ps` | 8 Einträge je Frame, 12/s | verwerfen |
| `pc` | 10/s | `er deny` |
| `rs` | 6/s, nur von der Autorität | verwerfen |
| `m` | 5 je 10 s, höchstens 200 Zeichen nach Bereinigung, nicht aus VR, nur bei Chat-Flag | `er rate` / `er perm` |
| `e` | 1 je 1.5 s | verwerfen |
| `pu` | 2/s; Abstand höchstens 3.5 m im Netzrahmen; weder Sender noch Ziel in VR; nicht an sich selbst | verwerfen |
| `kc` / `kb` | 2/s / 4/s | verwerfen |
| `ks` / `kj` / `kl` | je 1/s (Ergänzung) | verwerfen |
| `f`, `hd`, `ck` | 2/s | verwerfen |
| `rn` | 1/min | verwerfen |
| `ki` | 1 je 5 s | `er perm` |
| unbekanntes `t` | ignorieren | mehr als 30/min: 4000 |

Klemmen (Netzrahmen): x ∈ [-3000; 5000] cm, z ∈ [-1600; 5400] cm, y ∈ [-200; 1200] cm; Geschwindigkeit ±1600 cm/s; yaw ∈ [-315; 315] cRad, pitch ∈ [-157; 157], tip ∈ [0; 157], ax/az ∈ ±100; Kino-Position `p` ∈ [0; 12 h] ms. Nicht-endliche Zahl: Nachricht verwerfen. Item-IDs `^[0-9a-f]{32}$`, Objekt-IDs `^[A-Za-z0-9._-]{1,24}$`. Unbekannte Anim-/Emote-Codes werden zu 0. Ratenbuckets liegen im Speicher; Beschränkungen je Typ sind Teil der Golden-Dateien (§12).

## 6. Netzrahmen, Codes, Sende-Takt

### 6.1 Netzrahmen (rein, `store3d/net/frame.js`)

Weil Breite `W` und Tiefe `D` des Ladens vom Katalog und „große Hüllen“ abhängen (und die ganze Stadt an `W`/`D` hängt), sind absolute Koordinaten je Nutzer verschieden. Auf der Leitung gilt ein kanonischer Rahmen mit Referenz `W0 = 12.5`, `D0 = 18`, `PW0 = 20`, `sz0 = 28.7`. Die Abbildung (Meter lokal → Meter Netz, danach x100 gerundet) ist stückweise linear, stetig, monoton; die Umkehrung nutzt dieselben Knoten vertauscht.

| Bereich | Knoten lokal | Knoten Netz |
|---|---|---|
| x allgemein | `[0, W/2-4.5, W/2+4.5, W]` | `[0, 1.75, 10.75, 12.5]`; x<0 bleibt, x>W: `x-W+12.5` |
| z | `[0, D]` | `[0, 18]`; z<0 bleibt, z>D: `z-D+18` (sz wird 28.7) |
| x im Palast (innerhalb `city.palast.rect`; beim Dekodieren Referenzrechteck x ∈ [-3.75; 16.25], z ≥ 28.7) | `[px0, W/2-5.5, W/2+5.5, px1]` | `[-3.75, 0.75, 11.75, 16.25]` |

- y und pitch bleiben unverändert; yaw wird vor der Quantisierung auf (-π, π] gewrappt (`Body.yaw` ist ungewrappt). Ohne `layout.city` gilt nur die allgemeine Abbildung.
- **Entscheidung:** Der Palast-Bereich wird nicht nach Geometrie erkannt, sondern über `r` in der Pose: `r=1` (Palast, Halle/Foyer) wählt die Palast-Abbildung für x, sonst die allgemeine. Grund: Bei W=20/28 ist die Geometrie für lokale x ∈ [W, px1+] (`city.js`) nicht injektiv. Der Sender bestimmt `r` über `areaAt` vor der Kodierung, der Empfänger dekodiert nach `r`.
- An der Palasttür sind beide x-Abbildungen gleich (Übergang stetig), daher keine Sprünge beim `r`-Wechsel.
- Vektoren (`encVec`) werden mit der lokalen Steigung am Ort skaliert. **Entscheidung:** `p.q` enthält keine Geschwindigkeit; der Empfänger leitet `vx/vy/vz` für `Body.setNet`/`stepRemote` aus zwei aufeinanderfolgenden Posen ab (spart Bytes, kein Kontingenteffekt). `encVec` bleibt für `ps` (Physik) und `pu` in Gebrauch.
- Exakt (Steigung 1 bzw. Identitätsabschnitt): Türen (Laden bei W/2±1.1, Palast bei W/2±1.5), Straße, Hof-Ost, West, Palast. Nur proportional (Versatz akzeptiert): Ladeninneres und **Kiosk** (Hütte, Verkäuferin, Tresen z ∈ [D-1.9; D+0.2] laufen durch die gestauchte Ladenabbildung 18/D; D=30 gibt 0.4 m Versatz) sowie Feuertreppe/Dach (bis 1.75 m Versatz bei W=28); fremde Figuren können dort „durch Regale“ laufen. **Entscheidung:** Kiosk wird als „nur proportional“ geführt, statt eine zweite z-Abbildung für x>W einzuführen (die wäre an der Ostwand unstetig).
- **Golden-Vektoren** (`tests/fixtures/mp-frame.json`, Besitz Client): Nur bei `W0/D0` (`W=12.5`, `D=18`, `PW=20`) wird die Identität gefordert. Hin und zurück: Abweichung ≤ 0.5 cm x max. Steigung des Abschnitts (bei W=12.5/D=18 also < 1 cm; bei W=28 bis ±2.7 cm, W=20 ±1.6 cm, z bei D>36 > 0.8 cm, weil gestreckt wird). Beide Türen stetig; Eigenschaftstest „Bereichstreue“ (`areaAt` vor und nach Ab-/Rückbildung) für W ∈ {12.5; 16; 20; 28}; `encVec`; `wxRoll`. Belege: `city.js` (PW = clamp(W+4, 20, 28), Feuertreppe), `layout.js` (Türen).

IDs (Physik): `physics/world.js` (`snapshot`, `applyRemote`, `bodyNet`) arbeitet mit der numerischen `b.id`; stabile Plan-IDs stehen nur in `body.data.id` (`props.js`). **Entscheidung:** Netz-ID statischer Requisiten = `data.id` (Slot-IDs, `binL`, `pyr0`, `hoopBall` …); Spawns (geworfene Hüllen) `"<c>.<n>"` (`c` statt `k`, weil `:` die ID-Regex verletzt). `net/phys.js` hält die Tabelle Netz-ID ↔ lokale `b.id` und übersetzt in beide Richtungen; eine lokal fehlende Netz-ID wird ignoriert. Sitz `se:[Reihe 0..5, Anteil 0..1000 über die Reihenbreite]`, der Empfänger nimmt den nächsten freien eigenen Sitz (Sitz-IDs aus `palast/plan.js` sind breitenabhängig und gehen nie über die Leitung). Ort `r`: 0 Laden, 1 Palast (Halle, Foyer), 2 draußen.

### 6.2 Eingefrorene Codes

Tabellen werden nur am Ende ergänzt; Änderungen an Codes/Netzrahmen/Pflichtfeldern brauchen eine neue Major (§13).

**Pose-`a`** (0–6 wertgleich zu `Body.ANIM`, `controls/body.js`):

| a | Bedeutung | `Body.ANIM` | Beim Empfänger spielt `npc/anim.js` `ANIMS`-Name |
|---|---|---|---|
| 0 | Stehen | STAND | `idle` |
| 1 | Gehen | WALK | `walk` |
| 2 | Rennen | RUN | `run` |
| 3 | Luft | AIR | `idle` |
| 4 | Stoß | KNOCK | `stagger` |
| 5 | Hochziehen | MANTLE | `idle` |
| 6 | Schlag | HIT | `hit` |
| 7 | Sitzen | – | `sit` |
| 8 | Wurf | – | `throw` (0.6 s) |

Falle: Die Zahlen von `Body.ANIM` und die Indizes in `npc/anim.js` `ANIMS` (`idle, walk, run, sit, wave, hit, throw, stagger, point, cheer`) stimmen NICHT überein (z. B. 3 = Luft vs. `sit`). Die Abbildung steht ausschließlich als Tabelle in `net/proto.js`; weder `Body.ANIM`-Werte noch `ANIM_CODE` dürfen blind als Leitungscode dienen. Das Gangtempo leitet der Empfänger aus der Interpolation ab. Das lokale Format `{v,a,p,s,t}` aus `npc/anim.js` (NPC-`getNetState`) geht nicht über die Leitung.

**Emote-`e`** (Ereignis):

| e | Emote | `ANIMS`-Name beim Empfänger |
|---|---|---|
| 1 | Winken | `wave` |
| 2 | Jubeln | `cheer` |
| 3 | Zeigen | `point` |
| 4 | Hinsetzen | `sit` (nur lokal ausgelöst; der Zustand läuft über `a=7`) |
| 5 | Tanzen | `dance` (neu) |
| 6 | Klatschen | `clap` (neu) |
| 7 | Daumen hoch | `thumbs` (neu) |
| 8 | Verbeugen | `bow` (neu) |

Neue Animationen werden in `ANIMS` nur am Ende angehängt (`dance, clap, thumbs, bow`); Leitungscodes sind davon unabhängig. Ein Emote endet beim Empfänger, wenn `a` auf 1, 2, 3, 4, 6 oder 8 wechselt, oder nach seiner Dauer.

**Richard (Drahtformat `rs.q`):** `[s, h, r, x, y, z, yaw, a]` mit `s` = Index in `STATES` (`modules/brawl-fsm.js`: `calm, annoyed, shove, throw, chase, banned, grudge`), `h` = Trefferzähler, `r` = Restzeit bis zum zeitgesteuerten Übergang in **ds** (int), `x/y/z` in cm, `yaw` in cRad, `a` = Index in `modules/brawl-pose.js` `ANIMS`. Der Code liefert `getNetState` in Metern, Sekunden und der Reihenfolge x,z,y (`brawl.js`); die Umrechnung auf die Draht-Reihenfolge x,y,z und die Einheiten passiert in `net/richard.js`. **Entscheidung:** `r` ist für jeden Zustand ≠ `calm` definiert: annoyed/shove `DECAY - (t - lastHit)`, throw `THROW_MAX - (t - since)`, chase `CHASE_MAX - (t - since)`, banned/grudge `until - t`. Pflicht für die Umsetzung: `brawl-fsm.applyRemote` muss `lastHit`/`since`/`until` aus `r` rekonstruieren (statt `since = t`; heute wird `lastHit` nie gesetzt, annoyed/shove fielen beim Übernehmer sofort auf `calm` zurück, und `since = t` startet THROW_MAX/CHASE_MAX neu) und `getNetState` entsprechend erweitern.

**Flag-Bits `f`:** 1 Name zeigen, 2 Film sichtbar, 4 Chat, 8 VR aktiv. **`cap`:** `pres`, `chat`, `emote`, `push`, `phys`, `rich`, `wx`, `kino`, `admin`.

### 6.3 Sende-Takt (W8)

Ein eigener Timer im Transport (125 ms, nur solange die Warteschlange nicht leer ist, unabhängig von `requestAnimationFrame`, damit auch Kino im Hintergrund sendet). Alle Kanäle (`p`, `ps`, `rs`, …) fahren im Takt mit: höchstens 8 Frames/s, Client-Bucket höchstens 10 Frames/s. `cf.ph` ist höchstens 8. Chat, Emote, `pu` und `kc` lösen höchstens einen vorgezogenen Takt aus. Passt die Warteschlange nicht in 2 kB, werden `ps`-Einträge niedriger Priorität auf den nächsten Takt verschoben.

Pose `p`: bei Änderung (Position > 2 cm, yaw > 2, pitch > 4, `a`/`r`/`se` neu), höchstens `cf.pr` Hz (Normal 8); beim Stillstand ein Abschluss-Frame sofort; **kein Heartbeat**.

## 7. Nachrichtenkatalog

### 7.1 Client zu Server

| t | Felder | Wann / Frequenz | Grenze |
|---|---|---|---|
| `hi` | `pv` (Minor), `cap[]`, `f`, `cv` (String, höchstens 16; kommt über `deps.mp.cv`) | 1x | – |
| `p` | `q:[x,y,z,yaw,pitch,a,r]`, `se?` | ≤ 8 Hz bei Änderung | 10/s |
| `hd` | `i` (ID oder null) | bei Änderung | 2/s |
| `f` | Bits | bei Änderung | 2/s |
| `e` | `e` (1..8) | Ereignis | 1/1.5 s |
| `m` | `x` (Text) | Ereignis, nicht in VR | 5/10 s, ≤ 200 Zeichen |
| `pu` | `c`, `d:[dx,dz]` (Einheitsvektor x100), `s` 1..100 | Ereignis, nicht in VR | 2/s |
| `pc` | `i`, `g` (zuletzt gesehen, 0 = keine) | beim Anstoßen | 10/s |
| `ps` | `l:[[i,g,x,y,z,vx,vy,vz,yaw,tip,ax,az,s]]`; `s`: 0 wach, 1 schläft (wie `bodyNet`: `s=1` = `sleeping`); `tip` = `tipA` (rad x100), `ax/az` nur bei `tip>0` (sonst 0); `spin` und `g` aus dem Spielkörper werden nicht übertragen (`g` ist das Protokoll-Feld des DO) | ≤ 8 Hz je Besitzer (`cf.ph`) | 8 Einträge, 12/s |
| `pn` | `i:"c.n"`, `it` (ID oder null), `q:[x,y,z,vx,vy,vz,yaw,spin]` | beim Wurf | – |
| `px` | `i` | Hülle zurück/aufgehoben (nur Werfer) | – |
| `rc` | – | Treffer auf Richard | – |
| `rs` | `g`, `q:[s,h,r,x,y,z,yaw,a]`, `tg` (c oder 0) | Autorität: ≤ 5 Hz bei Änderung; 1 Hz solange `s` nicht `calm` | 6/s |
| `rr` | `g` | Autorität gibt ab | – |
| `ks` | `i`, `p` (ms), `dur?` | Film im Saal starten | 1/s |
| `kj` / `kl` | `sid` | mitschauen / verlassen | 1/s |
| `kc` | `sid`, `v`, `o` (1 play, 2 pause, 3 seek), `p` (ms) | absoluter Zielzustand | 2/s |
| `kb` | `sid`, `b` (0/1) | Puffern | 4/s |
| `ki` | `c` | Admin-Kick | 1/5 s |
| `ck` | `a` (Client-ms) | 5x beim Start (1 s Abstand), dann alle 5 min | 2/s |
| `rn` | `tk` | alle 10 min | 1/min |
| Text `ping` | – | alle 25 s | auto-response |

### 7.2 Server zu Client

| t | Felder |
|---|---|
| `wl` | `pv`, `c`, `k`, `s`, `ad`, `cap` (Schnittmenge), `cf:{pr,ph}`, `wx:{sd,l:1800}`, `peers[]`, `po:[[i,o,g,h]]`, `pr:[[i,x,y,z,yaw,tip,ax,az]]`, `ra:{c,g,tg}`, `kh` |
| Peer | `{c,k,n,f,j,ad?,q?,se?,h?}` (`ad` = Admin-Kennung, additiv; erlaubt „nicht kickbar“ ohne `er perm`) |
| `b` | `s`, `p:[[c,x,y,z,yaw,pitch,a,r,d,se?]]` (`d` = ms vor `s` empfangen), `ev[]` |
| `ev`-Typen in `b` | `j{Peer}`, `l{c,r}` (`r` u. a. `"kick"`), `pf{c,f,n,h}`, `e{c,e}`, `ps{c,l}`, `pn{c,i,it,q}`, `px{i}`, `po{i,o,g,h}` (o=0 frei), `ra{c,g,tg}`, `rs{c,g,q,tg}`, `kh{l}`, `cf{pr,ph}` |
| `kh`-Eintrag (nur öffentliche Sitzungen) | `[sid, host, i, anzahl, st, m:[c…], p, at]` (Entscheidung: Positionsfelder; die letzten drei sind die Ergänzung aus §2 des Review, additiv) |
| `x` (empfängerspezifisch) | `ev`: `m{c,x,s}` (auch an den Absender), `pu{c,d,s}`, `kx{sid,v,i,st,p,at,m[],lg[],w?}`, `er{c: bad|rate|stale|deny|perm|off|cap, t?}` |
| `ck` | `a` (Echo), `s` (Server-ms) |
| `bye` | `c`, `u?` |

- Eigene Einträge `c` in `b` ignoriert der Empfänger.
- Empfangene Posen gehen an `Body.applyRemote(state, s - d - offset)` mit 250 ms Anzeigeverzögerung für Fremde (neue Body-Option `netDelay`; der Standard 100 ms bleibt, damit 2D bitgleich bleibt). Nach einer Lücke über 300 ms speist der Empfänger den letzten Stand erneut ein. Chat-Blasen erscheinen nur bis 16 m Abstand.
- `ck`-Abgleich: Probe mit kleinster RTT aus den letzten 8, `serverNow()` aus Wanduhr plus Offset.

### 7.3 Ausgang bündeln

- **Entscheidung:** Kein `setTimeout` im DO (Hibernation, siehe §4). Der Flush läuft am Ende des Message-Handlers: Der gemeinsame Frame `b` (Posen und öffentliche Ereignisse) wird **einmal** serialisiert und an alle gesendet, höchstens alle 100 ms; reine Pose-/`ps`-Frames innerhalb des Fensters bleiben `dirty` und fahren im nächsten Flush mit. Sofortiger Flush bei Endzuständen (`ps` mit allen Einträgen `s=1`, `rs` mit `s=calm`, `rr`), bei Ereignis-Typen (`e m pu pc pn px rc rr kc kb ks kj kl ki f hd`) und bei Abschluss-Posen (`a` ∈ {0, 7}). Ein Rest-Alarm für Nachzügler entfällt, weil jeder Alarm einen Request kostet; die Abschluss-Regel verhindert, dass der letzte Stand hängen bleibt.
- Empfängerspezifisches (Chat an Teilnehmer mit Chat-Flag, `kx` an Mitglieder, `pu` an das Ziel, `er`) geht im selben Flush als Frame `x`. Ungebündelt: `wl`, `ck`, `bye`.
- Keine Interest-Filterung (höchstens 16 Verbindungen).

## 8. Autorität

Eigene Figur: Der Client ist maßgeblich, das DO klemmt nur Wertebereiche. Hausverbot gilt pro Verbindung, Stummschalten und Kick pro `k` (W14).

### 8.1 Physik (Besitzer-Prinzip, `cap phys`)

DO-Tabelle `i → {o, g, h, t}`, höchstens 64 Einträge.

- Anstoßen (Laufen, Schlag, Aufheben): sofort optimistisch lokal simulieren und `pc` senden.
- Vergabe: Das DO verweigert, wenn ein anderer das Ding hält (`h`) oder die letzte Vergabe an einen anderen weniger als 250 ms her ist: dann `po` mit bisherigem Besitzer, der Anfragende schaltet auf fremdgesteuert zurück. Sonst `g+1` und `po` an alle (gehaltene Körper stehen nicht im `snapshot` von `world.js`; Halten läuft über `hd`/Peer-`h` und die Hand der Figur, ein `ps` mit `s=2` gibt es nicht); der letzte Anstoß gewinnt, die Reihenfolge im DO entscheidet.
- `ps` zählt nur vom Besitzer mit aktuellem `g`. Gehalten (`hd.i` bzw. Peer-`h`): Empfänger hängen das Ding an die Hand der Figur. `ps` mit `s=1` (schläft): DO gibt frei und merkt die Ruhelage in `rest`.
- Disconnect: alle Einträge der Verbindung werden frei, Empfänger simulieren lokal vom letzten Stand weiter.
- Lokales Zurücksetzen von Requisiten braucht vorher einen Claim (`net.physGate`).
- Geworfene Hüllen: `pn` vergibt `g=1` an den Werfer; `px` nur vom Werfer. Fremde Hüllen lassen sich anstoßen, nicht aufheben.
- Schubsen (`pu`): Stärkefaktor aus `nav/collide.js`; weder Sender noch Ziel in VR.

### 8.2 Richard (`cap rich`, W12)

- **Entscheidung (W12):** Im Zustand `calm` gibt es keine Autorität (`ra.c = 0`); Richard läuft überall lokal und friedlich. Autorität gibt es nur im Streit.
- Streit: Treffer wird sofort lokal angewandt, dazu `rc`. Das DO vergibt die Autorität mit `rf=1`, `g+1`, `tg = Claimer`. Ausnahme: Richard ist gegen ein anderes `tg` feindlich (`s` ∈ shove, throw, chase, banned): `er deny`.
- Die Autorität sendet `rs` (≤ 5 Hz bei Änderung, 1 Hz solange nicht `calm`); Andere zeigen Richard nur an (Spiegel ohne Tür, HUD, Storage).
- Rückfall: nach `rr` (bei Rückkehr zu `calm`), Disconnect oder 60 s ohne `rs` gilt wieder `calm`/lokal. Die neue Autorität setzt den gespiegelten FSM-Stand fort.
- Hausverbot nur für den Täter: Nur der Client mit `c = tg` sperrt Tür, HUD und `sessionStorage`; `applyRemote` bekommt dafür ein Flag „nicht ich“.
- VR: nie Autorität, nie Claim.

### 8.3 Wetter (`cap wx`)

Für alle gleich, unabhängig von der Tageszeit (die bleibt lokal):
`slot = floor(serverMs / 1_800_000)`; `roll = mulberry32((sd ^ Math.imul(slot, 0x9E3779B1)) >>> 0)()`; Regen, wenn `roll < 0.35`. `sd` kommt aus `wl.wx` (Storage `seed`). Der Client wertet beim Willkommen und alle 15 s aus; Debug-Wert `rainForce` hat Vorrang.

### 8.4 Kino (`cap kino`, Zustand im DO-Storage `hall`)

- Höchstens 8 Sitzungen parallel im Saal (jeder kann seinen eigenen Film schauen). Sitzung `{sid, host, i, pv, v, st (0 wartet, 1 läuft, 2 pause), p, at, m[], buf[], lg[], w}`; bei `er cap` läuft der Film lokal ohne Sitzung.
- `ks` legt die Sitzung mit `st=0` (ohne `w`: wartet auf Start) und `buf=[host]` an. Fehlt beim Host `f&2`, gilt `pv=1`. `pv` folgt live dem `f&2` des **aktuellen** Gastgebers, in beide Richtungen, auch nach Übergabe; private Sitzungen verschwinden aus `kh` und bieten kein Mitschauen (`kj` nur bei öffentlichen).
- Erwartete Position: `st==1 ? p + (now - at) : p`.
- Steuern: `kc` gilt nur mit `v == Sitzung.v`, sonst `er stale` plus aktuelles `kx`. Absoluter Zustand gesetzt, `v+1`, `kx` an alle Mitglieder. Alle Mitglieder dürfen steuern; Echos unterdrückt der Client über `v`; da `togglePause` ein Umschalter ist, vergleicht der Client vor dem Aufruf den Ist-Zustand.
- Puffern (bis etwa 10 s gemeinsam warten): `kb 1` bei `st=1` von einem Mitglied außerhalb `lg` setzt `st=0` und `w = now + 10 s`; `kb 1` bei `st=0` ergänzt `buf` ohne `w` zu verlängern; `kb 1` von Mitgliedern in `lg` wird verworfen. Sind alle `buf` leer: `st=1` mit `at=now`. Läuft `w` ab: `st=1`, Puffernde landen in `lg`, holen per Seek auf und lösen 60 s keine Pause aus.
- Beitritt: `kj` nur bei öffentlichen Sitzungen; der Neue landet sofort in `lg`.
- Verlassen: `kl` oder Disconnect entfernt das Mitglied; leere Sitzungen werden gelöscht; der Host geht an das älteste Mitglied.
- Aufstehen allein: Pause (`kc`, wie 1.15); mit anderen: nichts, der Film läuft weiter.

### 8.5 Gleiche Person mehrfach (gleiches `k`)

Jede Verbindung hat eigene Figur, eigenen Besitz und eigene Kino-Mitgliedschaft. „N hier“ zählt verschiedene `k`; die Liste zeigt „2 Geräte“. Das eigene `k` lässt sich nicht stummschalten; Admins sind nicht kickbar.

### 8.6 Admin-Kick (`cap admin`)

`ki {c}`: Sender `a=1`, Ziel `a=0`. Das DO setzt `b:<k_ziel> = now + 10 min`; alle Verbindungen mit diesem `k` erhalten `bye ban u` und Close 4403; an alle geht `ev l {c, r:"kick"}`.

## 9. Kontingent (Cloudflare Free)

Belegt (Doku, Stand 17.11.2026): 100 000 DO-Requests/Tag, 13 000 GB-s, 100 000 Rows written (Reset 00:00 UTC); eingehende WebSocket-Nachrichten 20:1, ausgehend gratis; Verbindungsaufbau = 1 Request; `setWebSocketAutoResponse` gratis und weckt nicht; jeder `alarm()` = 1 Request; jedes `setAlarm()` = 1 Row written. Das Verhältnis 20:1 und die Alarm-Abrechnung sind im Dashboard an Tag 1 und 7 nach dem Deploy gegen die Schätzung zu prüfen.

Rechnung:

- Pose-Frames je Spielerstunde: 8 Hz x 3600 s x 60 % Bewegung = 17 280, plus etwa 1 500 sonstige = etwa 18 800 Frames, also etwa **940 Requests**.
- Dazu je Verbindung 1 Request (Upgrade).
- Alarme: einer je 60 s, solange Verbindungen bestehen: **etwa 60 Requests/h** insgesamt (nicht je Spieler), plus Kino-Fristen `w`. Jedes `setAlarm` = 1 Row written.
- Ping: Auto-Response gratis (schlimmstenfalls 7/h, unbelegt); `ck` ist selten.
- Reichweite: etwa 100 Spielerstunden/Tag; alle 16 Spieler dauernd in Bewegung (Worst Case: 16 x 8 Hz x 100 % Bewegung): etwa 23 000/h, etwa 4 h. 8 Hz ist deshalb die Obergrenze.
- Laufzeit: ein DO mit 128 MB, höchstens 86 400 s x 0.125 GB = 10 800 GB-s/Tag (unter 13 000).
- Rows written je Stunde: Alarme 60, jti etwa 7 je Spielerstunde, `quota` etwa 1 je 500 Frames (etwa 38/h je Spielerstunde), `hall` je Kino-Änderung, `rest` höchstens 720/h (nur bei Physik); Ziel höchstens etwa 1 000/h gegen 100 000/Tag.
- Worker-Requests (eigenes Kontingent): Ticket, Preflight, Upgrade, `rn` etwa 12 bis 18 je Spielerstunde.
- **Sparwächter** (Tageszähler nach UTC: `Frames/20 + Upgrades + Alarme`):
  - ab 60 % von `MP_DAILY_REQ`: `cf {pr:4, ph:5}`
  - ab 95 %: neue Verbindungen 4503 `quota`, bestehende auf `pr=2`, `ph=2` (Entscheidung: `ph` auf 2, weil die Quelle nur `pr` nennt)
  - neuer Tag: zurück auf Normal (`pr:8`, `ph:8`)

## 10. Datenschutz

- Über die Leitung gehen nur `k`, Name, `c`, Posen, Flags und Item-IDs. Nie Titel, Cover-URLs, Ratings, `uid` oder Jellyfin-Token.
- Rechte-Filter beim Empfänger: Cover/Titel nur, wenn die ID im eigenen Katalog steckt; Mitschauen erst nach erfolgreichem eigenem `getItem`; sonst neutrale Hülle bzw. „Palast – ein Film“.
- Vom Server erzwungen: ohne „Name zeigen“ geht `n=""` raus (Empfänger zeigt „Jemand“, `peerName(c)`); ohne „Film sichtbar“ gehen weder `h` noch `pn.it` noch das Kino-`i` raus (Sitzung privat, nicht in `kh`; der Schalter umfasst also auch die gehaltene Hülle, das gehört in den UI-Untertitel); ohne „Chat“ nimmt das DO keine Chat-Nachrichten an und liefert keine aus.
- Chat wird nur durchgereicht, nie gespeichert; NFC, Steuer-/Bidi-Zeichen raus; Anzeige nur über `textContent`; Fenster zeigt 50 Einträge im Client. Namensschilder, Blasen und Chat-Fenster haben `pointer-events:none`.
- Storage enthält nur `k`, Fristen, jti, Seed, flüchtige Kino-IDs und Ruhelagen.
- Logs: nur feste Fehlercodes (`console.error('mp: do-fetch')`), nie Token, Ticket, Header, Chat, Namen, IDs oder `k`. `observability` bleibt unverändert; ein geloggtes Ticket ist wegen 60 s und jti wertlos.
- Stumm: pro `k` im Client (`mute[]`, höchstens 50, `^[0-9a-f]{12}$`); Chat von stummen `k` wird nicht angezeigt.

## 11. Hülle und 3D-Schnittstelle

### 11.1 `deps.mp` (W1, W3)

Neue Datei `features/store/mp.js`, `home.js` hängt in `buildDeps` an. Es gibt **immer** `deps.mp`, wenn eine `uid` da ist:

```js
deps.mp = {
  uid,                        // nur lokale Schlüssel, nie gesendet
  cv,                         // VERSION aus core/version.js (das 3D-Bundle importiert core/ nicht)
  prefs(),                    // -> {on, name, film, chat, mute:[k…], hint}
  ticket(),                   // -> Promise<{ok:true, tk, url, exp, pv, s} | {ok:false, why}>
};
deps.onPrefs({ mp: {…} });   // einziger Rückschreibweg (Teilmenge der Felder)
```

- Kein `on`, kein `revoke`. Ohne Charts-URL liefert `ticket()` `why:'nourl'`.
- `url` ist absolut (`https:` wird zu `wss:`, plus `/mp`); die Hülle setzt sie zusammen, das 3D-Bundle importiert `core/charts.js` nicht. Nur akzeptiert, wenn die Antwort `url === "/mp"` und `tk` als String enthält.
- `ticket()`: liest Token und uid beim Aufruf aus `api.getAuth()` (nichts vorhanden: `why:'user'`), legt laufende Aufrufe zusammen, `fetch(base+'/mp/ticket', {headers:{'X-Emby-Token':token}, credentials:'omit', cache:'no-store'})`, Timeout 8 s. Die Hülle startet keine Timer; Renew und Reconnect treibt das 3D-Bundle.
- Prefs (`prefs.js`, Schlüssel `lfx.store.<name>.<uid>`; Standard an, nur ein ausdrückliches „0“ schaltet ab): `mpOn`, `mpName`, `mpFilm` (Standard AUS, Entscheidung nach Nutzervorgabe: hier gilt nur ein ausdrückliches „1“ als an), `mpChat`, `mpMute`, `mpHint`. `savePrefs` braucht einen expliziten `p.mp`-Zweig mit Typprüfung je Feld. Mehrspieler-Prefs gehören nicht in `buildOpts` (`store-home`-Test vergleicht exakt).
- Build-Wächter (`build/build.mjs`, harter Abbruch): Hauptbundle ohne `/\bWebSocket\b|lfx-mp\./`; `lenzstore.min.js` ohne `/X-Emby-Token|accessToken|api_key|\/mp\/ticket/`. Nur das Ticket erreicht das 3D-Bundle.

### 11.2 Provider `net` (W7)

```js
ctx.provide('net', {
  active(), me() /* {c,k,admin}|null */, has(cap), count() /* verschiedene k inkl. ich */, serverNow(),
  peers() /* [{c,k,n,r,f,devs}] Kopie */, peerName(c) /* Name oder „Jemand“, Rechte-/Namensfilter angewandt */,
  on(ev /* 'state'|'peers'|'msg:<t>' */, fn) /* -> off; Kino nutzt 'msg:kx' */,
  send(msg) /* in den Sende-Takt; false bei inaktiv oder fehlender cap */,
  physGate(body), menu(), renderMenu(el), onChange(fn), emote(code), say(text),
});
```

Fremde Provider werden nur mit Guard benutzt. Ohne `deps.mp` gibt es keinen Provider, kein DOM, keine Listener. Enter (Chat) und T (Emote) werden nur bei `mode==='play'` verbraucht; im Sitzen (Overlay) bleiben sie unberührt, damit nicht aufgestanden und pausiert wird. `init` wartet nie auf das Netz; die Verbindung entsteht nach dem Ereignis `'enter'`.

### 11.3 Bridge-Haken Kino (`cinema-bridge.js`, Welle d)

- `setPaused(on) -> boolean`: idempotent; `v.paused` live lesen, nur bei Abweichung `click('.btnPause')` (Jellyfin-Weg), fehlt der Knopf: `v.pause()`/`v.play()` direkt. Autoplay-Sperre erkennt die Sync-Logik am Zustand nach 1 s.
- `seekTo(s, {exact})`: mit `exact` und `s` in `v.seekable` direkt `currentTime`, sonst Slider-Weg wie bisher.
- `mode()`: `'direct' | 'hls' | 'other'` (nur Token, nie die URL).
- Puffern wird lazy im Kino-Teil gerechnet; `state()` bleibt unverändert. **`startMs` entfällt in 1.16**; `core/playback.js` und `home.js` bleiben unberührt.
- Sitzen: `a=7` und `se` kommen schon in Welle a über `palast/seatnet.js` und die Provider-Werte `cinema2d.seated`/`seatId`.

## 12. Unter-Reducer-Schnittstelle (W6)

`room.js` wird nach Welle a nie wieder angefasst. Jede Fähigkeit ist ein Modul `src/mp/{chat,phys,rich,kino}.js`; Welle a legt leere Stubs an (`handlers = {}`, `cap = null`). Dispatch: `HANDLERS = {...core, ...chat.handlers, ...phys.handlers, ...rich.handlers, ...kino.handlers}`.

```js
export default {
  cap,                              // string|null, z. B. 'kino'
  handlers: { [t]: (st, peer, msg, ctx) => void },   // Validator + Wirkung je Nachrichtentyp
  onOpen(st, peer, ctx),            // Verbindung nach hi/accept
  onClose(st, peer, ctx, why),      // Freigabe (Besitz, Kino-Mitgliedschaft, Autorität)
  onFlags(st, peer, oldF, newF, ctx), // Privatsphäre-Wechsel (z. B. f&2 → pv)
  welcome(st, peer, ctx) → obj,     // zusätzliche wl-Felder (po, pr, ra, kh)
  nextDeadline(st, now) → ms|null,  // z. B. Kino-w
  onAlarm(st, now, ctx),            // Fristen abarbeiten
  storeKeys: [prefix…],             // Storage-Schlüssel, die der Kaltstart lädt
}
```

`ctx` bietet `now`, `rand`, `emit(ev)` (gemeinsamer Frame `b`), `sendTo(c, xev)`, `close(c, code, bye)`, `put(key, val)`/`del(key)` und Peer-/Kontingent-Lesezugriff; es gibt keine Timer und keine CF-/Node-APIs. Nachrichten einer nicht ausgehandelten `cap` beantwortet der Reducer mit `er cap`. Auf dem Client nutzt `cinema/party.js` den Provider `net`; einen Stub `net/kino.js` gibt es nicht.

## 13. Dateibesitz, Golden-Dateien, Kompatibilität, Tests

Golden-Dateien (je ein Besitzer, werden von Worker- und Client-Tests gelesen; die Client-Proto-Tests lesen die Worker-Dateien mit, damit die Client-Builder den Server-Validator bestehen):

| Datei | Besitzer | Inhalt |
|---|---|---|
| `charts-worker/test/fixtures/mp-golden/core.json` | W-R | rohe Nachrichten und Ergebnis (normalisiert/abgelehnt) für `hi p hd f ck rn`, Klemmen, 2 kB, unbekannte `t` |
| `.../chat.json` | W-B | `m e ki`, Bans, Bereinigung |
| `.../phys.json` | W-C | `pc ps pn px pu`, Besitz, Haltezeit |
| `.../rich.json` | W-C2 | `rc rs rr`, Autorität |
| `.../kino.json` | W-K | `ks kj kl kc kb`, `kh.m`/`p`/`at`, Ratengrenzen `ks/kj/kl` |
| `tests/fixtures/mp-frame.json` | Client | Netzrahmen, `encVec`, `wxRoll` |

Kompatibilität:

- Major im Subprotokoll `lfx-mp.N`; der Server wählt die höchste gemeinsame, `ticket.pv` nennt die unterstützten. Neue Major bei Änderung von Netzrahmen, eingefrorenen Codes oder Pflichtfeldern. Minor nur additiv: unbekannte `t` und Felder werden ignoriert, fehlende optionale Felder bekommen Standardwerte.
- `cap`-Aushandlung (`hi` ↔ `wl`): fehlt eine Fähigkeit auf einer Seite, ist das Feature aus, das DO sendet dazu nichts.
- Ein alter Worker liefert 404 (still aus); ein 1.15-Client verbindet nie. Migrations-Tag `mp1` nie umbenennen, Storage-Schema `sv:1`.
- Notbremse: `wrangler secret delete MP_SECRET` → `/mp/ticket` 503, alle Clients still aus.

Tests (Worker: Node-vitest, keine neue Dependency, kein Netzwerk; die bestehenden Testdateien bleiben unverändert grün):

- `mp-ticket` (Signieren/Prüfen, Manipulation, Ablauf, stabiles `k`, Namensbereinigung), `mp-auth`, `mp-route` (`/mp/ticket`: 401/200/Rückfall ohne Admin/429/503; `/mp`: 426, 403, 401, Weiterleitung an gestubbtes `WORLD`: `X-Lfx-Claims` gesetzt, `x-lfx-*` entfernt), `mp-proto` (tabellengetrieben aus den Golden-Dateien), `mp-room` (Fake-Uhr: `wl`, `j`/`l`, Flush-Regeln aus §7.3, Privatsphäre, Limit 16/4 je `k`, Kick, Renew-Frist, Sparwächter, Kaltstart, Unter-Reducer-Hooks), `mp-world` (Kaltstart, jti), `mp-chat/phys/rich/kino`.
- Client: `net-frame` (Bereichstreue), `net-proto` (eingefrorene Codetabellen, `ANIM`-/`ANIMS`-Mapping), `net-transport` (Handshake, Close-Tabelle, 6 Versuche/10 min, Ping-Timeout, `rn`, Sende-Takt ≤ 8 Frames/s, verborgen 60 s, Kino-Ausnahme), `net-peers`, `net-module`, `desktop-actions` (Enter/T nur bei `play`), `store-mp`, `store-home`, `store-prefs`.
- Harness `?mp=fake&bots=N` (`build/mp-dev/`, Reducer `charts-worker/src/mp/room.js` direkt; Transport per `opts.mpTransport` nur im Debug; nichts davon im Produktionsbundle). Messungen bei `low`: Draw-Calls ≤ 140 an Tür, im Laden und im Saal (mit 5 bzw. 8 Bots), Bots ≤ 8 Frames/s.
- Still-aus-Matrix: ohne Charts-URL, 404 (nur vor dem Deploy gegen den echten Worker, danach per gestubbtem Fetch), 503, 429, WS-Abbruch, Kontingent (`cf` gestubbt). Live braucht zusätzlich ein zweites Konto ohne Admin-Rechte mit eingeschränkter Bibliothek (Rechte-Filter, Stumm, Kick).

## 14. Pflichten für die Umsetzung (W1-W4)

Code-Änderungen, die dieser Vertrag voraussetzt (bestehendes Verhalten sonst unverändert):

- **Worker:** `src/auth.js` neu mit `resolveUser` und `getMeInfo` in `jellyfin.js` (`resolveUid` in `me-stats.js` ist privat, `getMe` liefert nur `uid`; `me-stats.js` bleibt unangetastet). `src/mp/*`, `index.js` (ein Edit: Export `MpWorld`, Routen `GET /mp/ticket`, `GET /mp`), `wrangler.jsonc`.
- **Bridge (`cinema-bridge.js`):** `setPaused(on)` idempotent, `mode()`, `seekTo(s, {exact})` neu; `state()` unverändert; kein `startMs`.
- **Provider `cinema2d`:** muss `seated` und `seatId` bereitstellen (für `palast/seatnet.js`, `a=7`/`se`).
- **Physik (`net/phys.js`):** Netz-ID ↔ lokale `b.id` (statisch `data.id`, Spawns `"<c>.<n>"`); `ps.s` wie `bodyNet` (1 = schläft); Halten über `hd`; `ax/az` nur bei `tip>0`.
- **Richard:** `brawl-fsm.applyRemote` übernimmt `lastHit`, `since`, `until` aus den Restzeiten (§6.2); `getNetState` liefert `r` für alle Zustände ≠ `calm`; `applyRemote` bekommt ein Flag „nicht ich“ für das Hausverbot.
- **Body:** Option `netDelay` (Standard 100 ms); Empfänger leitet die Geschwindigkeit aus zwei Posen ab; `yaw` vor dem Senden auf (-π, π] wrappen.
- **Hülle:** `deps.mp`, `prefs.js` (`mp`-Zweig), Build-Wächter (§11.1).
