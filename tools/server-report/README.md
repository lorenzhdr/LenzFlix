# Server-Statistik melden

Dieses kleine Skript meldet alle 30 Minuten (um :00 und :30) Systemwerte, Plattenbelegung
und den Netzwerkverkehr des Linux-Servers an den LENZFLIX-Worker. Die Werte erscheinen in der
Server-Statistik in LENZFLIX.

## Voraussetzungen

- Linux mit systemd
- vnstat 2.x, bereits eingerichtet: `vnstat --version`, `vnstat --iflist`
- curl (mit `--retry`, ab 7.12)

## Installation

Die Dateien liegen im Ordner `tools/server-report/`. Vom PC aus auf den Server kopieren:

```sh
scp tools/server-report/lenzflix-report.sh tools/server-report/lenzflix-report.service \
    tools/server-report/lenzflix-report.timer tools/server-report/lenzflix-report.env.example \
    <server>:/tmp/
```

Auf dem Server:

```sh
cd /tmp
sudo install -m 0755 lenzflix-report.sh /usr/local/bin/lenzflix-report.sh
sudo install -m 0644 lenzflix-report.service lenzflix-report.timer /etc/systemd/system/
sudo install -d -m 0755 /etc/lenzflix
sudo install -m 0600 lenzflix-report.env.example /etc/lenzflix/report.env
sudo nano /etc/lenzflix/report.env
```

In der Env-Datei `LFX_URL` (https), `LFX_SECRET` (mindestens 32 Zeichen, gleich wie im Worker),
optional `LFX_IFACE` und `LFX_DISKS` (`Pfad=Label;Pfad=Label`) eintragen.

## Probelauf

Gibt das JSON nur aus, sendet nichts:

```sh
sudo sh -c 'set -a; . /etc/lenzflix/report.env; LFX_DRY=1 /usr/local/bin/lenzflix-report.sh'
```

Dann einmal echt senden und ins Journal sehen:

```sh
sudo systemctl daemon-reload && sudo systemctl start lenzflix-report.service
journalctl -u lenzflix-report -n 20
```

Hinweis: Der Dienst läuft mit `DynamicUser`, das kann andere Leserechte haben als der Probelauf
als root. Der Lauf über systemd ist daher der maßgebliche Test (z. B. bei Platten-Pfaden).
Fehlt ein Wert, fehlt nur dieses Feld, das Skript beendet sich immer mit Exit 0.

## Timer aktivieren

```sh
sudo systemctl enable --now lenzflix-report.timer
systemctl list-timers lenzflix-report.timer
```

## Ohne sudo (Crontab des eigenen Benutzers)

Hat der Benutzer kein sudo ohne Passwort, geht es auch ohne systemd-Units:

```sh
mkdir -p ~/.local/bin ~/.config/lenzflix
install -m 0755 lenzflix-report.sh ~/.local/bin/lenzflix-report.sh
install -m 0600 lenzflix-report.env.example ~/.config/lenzflix/report.env
nano ~/.config/lenzflix/report.env
sh -c 'set -a; . ~/.config/lenzflix/report.env; LFX_DRY=1 ~/.local/bin/lenzflix-report.sh'
(crontab -l 2>/dev/null; echo '0,30 * * * * sh -c '"'"'set -a; . "$HOME/.config/lenzflix/report.env"; exec "$HOME/.local/bin/lenzflix-report.sh"'"'"' 2>&1 | logger -t lenzflix-report') | crontab -
```

Fehlerzeilen landen im Journal unter `lenzflix-report` (`journalctl -t lenzflix-report`). Einen nach einem
Neustart verpassten Lauf holt cron nicht nach; die nächste Meldung kommt zum nächsten :00 bzw. :30.

## Deinstallation

```sh
sudo systemctl disable --now lenzflix-report.timer
sudo rm /etc/systemd/system/lenzflix-report.service /etc/systemd/system/lenzflix-report.timer \
        /usr/local/bin/lenzflix-report.sh
sudo rm -r /etc/lenzflix
sudo systemctl daemon-reload
```

## Fehlersuche

`journalctl -u lenzflix-report -n 20` zeigt eine Zeile wie `senden fehlgeschlagen (HTTP 401)`.

- 401: `LFX_SECRET` stimmt nicht mit dem Secret im Worker überein.
- 404: Der Worker hat noch kein Secret gesetzt (Funktion dort aus).
- 403 oder Fehlercode 1010: Bot-Schutz vor dem Worker. Für den Pfad `/srv/report` eine Ausnahme einrichten.
- Fehlende Platte: Pfad in `LFX_DISKS` prüfen, nicht eingehängte Pfade werden übersprungen.
- Kein Traffic: `vnstat --json m 1` muss auf dem Server funktionieren, ggf. `LFX_IFACE` setzen.

Neustarts und Updates des Servers sind unkritisch: Ausgefallene Läufe holt `Persistent=true`
nach, und fehlende Meldungen zeigt die Oberfläche neutral an.

Zusätzlich zu Monats- und Tageswerten werden auch die Stundenwerte (`vnstat --json h`) übertragen; sie dienen dem Herausrechnen eines regelmäßigen Backups aus dem Upload.
