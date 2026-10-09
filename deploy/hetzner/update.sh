#!/usr/bin/env bash
# Neue Version aus Git holen, neu bauen und starten (Daten bleiben erhalten).
set -euo pipefail
cd "$(dirname "$0")"
git -C ../.. pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
echo "✓ Aktualisiert: https://$(grep '^DOMAIN=' .env | cut -d= -f2)"
