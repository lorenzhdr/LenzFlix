#!/bin/sh
# LENZFLIX Server-Statistik: sammelt Systemwerte, Plattenbelegung und vnstat-Rohdaten
# und meldet sie per HTTPS an den Worker (POST $LFX_URL/srv/report).
# Konfiguration per Umgebung, siehe lenzflix-report.env.example.
# Teilfehler sind erlaubt: Fehlt ein Wert, fehlt nur dieses Feld. Exit-Code ist immer 0.
set -u

PROC="${LFX_PROC:-/proc}"   # nur fuer Tests ueberschreibbar
SYS="${LFX_SYS:-/sys}"
tmp=""
tmpo=""
trap 'rm -f "$tmp" "$tmpo" 2>/dev/null' EXIT
trap 'exit 0' HUP INT TERM

warn() { printf 'lenzflix-report: %s\n' "$1" >&2; }

isnum() { case "$1" in ''|*[!0-9]*) return 1 ;; *) return 0 ;; esac; }

# --- Konfiguration pruefen ---------------------------------------------------
dry="${LFX_DRY:-}"
url="${LFX_URL:-}"
secret="${LFX_SECRET:-}"
if [ -z "$dry" ] || [ "$dry" = "0" ]; then
  dry=""
  case "$url" in
    https://?*) ;;
    *) warn "LFX_URL fehlt oder beginnt nicht mit https://"; exit 0 ;;
  esac
  if [ "${#secret}" -lt 32 ]; then
    warn "LFX_SECRET fehlt oder ist kuerzer als 32 Zeichen"; exit 0
  fi
  url="${url%/}"
fi

# --- Host --------------------------------------------------------------------
host=""
add_host() { if [ -z "$host" ]; then host="$1"; else host="$host,$1"; fi; }

if [ -r "$SYS/class/thermal/thermal_zone0/temp" ]; then
  t=$(cat "$SYS/class/thermal/thermal_zone0/temp" 2>/dev/null)
  if isnum "$t"; then
    add_host "\"tempC\":$(awk -v t="$t" 'BEGIN{printf "%.1f", t/1000}')"
  fi
fi

if [ -r "$PROC/stat" ]; then
  s1=$(sed -n 's/^cpu  *//p' "$PROC/stat" 2>/dev/null | head -n 1)
  sleep 1
  s2=$(sed -n 's/^cpu  *//p' "$PROC/stat" 2>/dev/null | head -n 1)
  if [ -n "$s1" ] && [ -n "$s2" ]; then
    pct=$(printf '%s\n%s\n' "$s1" "$s2" | awk '
      { t=0; for (i=1;i<=8;i++) t+=$i; idle=$4+$5
        if (NR==1) { t1=t; i1=idle } else { t2=t; i2=idle } }
      END { d=t2-t1; if (d>0) printf "%.1f", (d-(i2-i1))*100/d }')
    [ -n "$pct" ] && add_host "\"cpuPct\":$pct"
  fi
fi

if [ -r "$PROC/loadavg" ]; then
  la=$(awk '{ if ($1 ~ /^[0-9.]+$/ && $2 ~ /^[0-9.]+$/ && $3 ~ /^[0-9.]+$/) printf "%s,%s,%s", $1, $2, $3 }' "$PROC/loadavg" 2>/dev/null)
  [ -n "$la" ] && add_host "\"load\":[$la]"
fi

cores=$(nproc 2>/dev/null)
if ! isnum "$cores"; then
  cores=$(grep -c '^processor' "$PROC/cpuinfo" 2>/dev/null)
fi
if isnum "$cores" && [ "$cores" -gt 0 ]; then add_host "\"cores\":$cores"; fi

if [ -r "$PROC/meminfo" ]; then
  mt=$(awk '/^MemTotal:/{print $2}' "$PROC/meminfo" 2>/dev/null)
  ma=$(awk '/^MemAvailable:/{print $2}' "$PROC/meminfo" 2>/dev/null)
  if isnum "$mt"; then add_host "\"memTotal\":$((mt * 1024))"; fi
  if isnum "$ma"; then add_host "\"memAvail\":$((ma * 1024))"; fi
fi

if [ -r "$PROC/uptime" ]; then
  up=$(awk '{ split($1, a, "."); print a[1] }' "$PROC/uptime" 2>/dev/null)
  if isnum "$up"; then add_host "\"uptimeS\":$up"; fi
fi

# --- Platten -----------------------------------------------------------------
# Label: nur A-Z a-z 0-9 Leerzeichen _ - und Umlaute, 1..24 Zeichen.
label_ok() {
  norm=$(printf '%s' "$1" | LC_ALL=C sed 's/ä/a/g;s/ö/a/g;s/ü/a/g;s/Ä/a/g;s/Ö/a/g;s/Ü/a/g;s/ß/a/g')
  [ -n "$norm" ] || return 1
  [ "${#norm}" -le 24 ] || return 1
  rest=$(printf '%s' "$norm" | LC_ALL=C tr -d 'A-Za-z0-9 _-')
  [ -z "$rest" ]
}

disks=""
dlist="${LFX_DISKS:-}"
if [ -n "$dlist" ]; then
  oldifs="$IFS"
  IFS=';'
  for entry in $dlist; do
    IFS="$oldifs"
    dpath="${entry%%=*}"
    dlabel="${entry#*=}"
    if [ "$dpath" != "$entry" ] && [ -n "$dpath" ] && label_ok "$dlabel"; then
      vals=$(df -B1 -P "$dpath" 2>/dev/null | awk 'NR==2 && $2 ~ /^[0-9]+$/ && $3 ~ /^[0-9]+$/ && $4 ~ /^[0-9]+$/ { print $2, $3, $4 }')
      if [ -n "$vals" ]; then
        set -- $vals
        item="{\"l\":\"$dlabel\",\"size\":$1,\"used\":$2,\"avail\":$3}"
        if [ -z "$disks" ]; then disks="$item"; else disks="$disks,$item"; fi
      fi
    fi
    IFS=';'
  done
  IFS="$oldifs"
fi

# --- vnstat ------------------------------------------------------------------
vn_run() {
  # $1 = m|d, $2 = Anzahl
  if [ -n "${LFX_IFACE:-}" ]; then
    out=$(vnstat --json "$1" "$2" -i "$LFX_IFACE" 2>/dev/null)
  else
    out=$(vnstat --json "$1" "$2" 2>/dev/null)
  fi
  rc=$?
  [ "$rc" -eq 0 ] || return 1
  case "$out" in '{'*) return 0 ;; *) return 1 ;; esac
}

vn=""
if command -v vnstat >/dev/null 2>&1; then
  if vn_run m 13; then vn="\"m\":$out"; fi
  if vn_run d 62; then
    if [ -z "$vn" ]; then vn="\"d\":$out"; else vn="$vn,\"d\":$out"; fi
  fi
fi

# --- JSON --------------------------------------------------------------------
body='{"v":1'
[ -n "$host" ] && body="$body,\"host\":{$host}"
[ -n "$disks" ] && body="$body,\"disks\":[$disks]"
[ -n "$vn" ] && body="$body,\"vnstat\":{$vn}"
body="$body}"

if [ -n "$dry" ]; then
  printf '%s\n' "$body"
  exit 0
fi

# --- Senden ------------------------------------------------------------------
tmp=$(mktemp 2>/dev/null) || { warn "mktemp fehlgeschlagen"; exit 0; }
tmpo=$(mktemp 2>/dev/null) || { warn "mktemp fehlgeschlagen"; exit 0; }
printf '%s' "$body" > "$tmp"

# Das Secret kommt ueber stdin (--config -), damit es nicht in der Prozessliste steht.
code=$(printf 'header = "Authorization: Bearer %s"\n' "$secret" | curl --config - -sS \
  --retry 3 --retry-delay 20 --max-time 30 \
  -H 'Content-Type: application/json' --data-binary @"$tmp" \
  -o "$tmpo" -w '%{http_code}' "$url/srv/report" 2>/dev/null)

case "$code" in
  2??) ;;
  ''|000) warn "senden fehlgeschlagen (keine Verbindung)" ;;
  *) warn "senden fehlgeschlagen (HTTP $code)" ;;
esac
exit 0
