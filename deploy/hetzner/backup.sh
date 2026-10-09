#!/usr/bin/env bash
# Sichert die App-Daten (Bestellungen, Kunden, Einstellungen) nach ./backups/altinger-<Datum>.tgz
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups
FILE="backups/altinger-$(date +%F-%H%M).tgz"
docker run --rm -v altinger_altinger-data:/data:ro -v "$PWD/backups":/backup alpine \
  tar czf "/backup/$(basename "$FILE")" -C /data .
echo "✓ Gesichert: $FILE"
# Wiederherstellen:
#   docker compose stop app
#   docker run --rm -v altinger_altinger-data:/data -v "$PWD/backups":/backup alpine sh -c "rm -rf /data/* && tar xzf /backup/<datei> -C /data"
#   docker compose start app
