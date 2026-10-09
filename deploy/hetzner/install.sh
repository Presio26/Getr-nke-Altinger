#!/usr/bin/env bash
# Einrichtung auf einem frischen Ubuntu-Server (Hetzner Cloud, Ubuntu 24.04), als root ausführen:
#   cd /opt/altinger/deploy/hetzner && ./install.sh
# Installiert Docker + Firewall, fragt Domain und E-Mail ab, baut und startet die App mit HTTPS.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Bitte als root ausführen (z. B. sudo ./install.sh)."

# ── 1. Docker ───────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  say "Docker installieren …"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "docker compose fehlt – bitte Docker-Installation prüfen."

# ── 2. Firewall: nur SSH, HTTP, HTTPS ──────────────────────
if command -v ufw >/dev/null 2>&1; then
  say "Firewall einrichten (SSH, HTTP, HTTPS) …"
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 443/udp >/dev/null
  ufw --force enable >/dev/null
fi

# ── 3. Konfiguration ───────────────────────────────────────
if [ ! -f .env ]; then
  say "Konfiguration"
  read -rp "Domain der App (z. B. altinger-demo.presio.eu): " DOMAIN
  read -rp "E-Mail für das HTTPS-Zertifikat: " ACME_EMAIL
  [ -n "$DOMAIN" ] && [ -n "$ACME_EMAIL" ] || die "Domain und E-Mail sind Pflicht."
  sed -e "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" -e "s|^ACME_EMAIL=.*|ACME_EMAIL=${ACME_EMAIL}|" .env.example > .env
fi
# shellcheck disable=SC1091
. ./.env

# ── 4. DNS prüfen (Zertifikat klappt nur, wenn die Domain auf diesen Server zeigt) ──
SERVER_IP="$(curl -fsS4 https://ifconfig.me 2>/dev/null || true)"
DNS_IP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)"
if [ -n "$SERVER_IP" ] && [ "$SERVER_IP" != "$DNS_IP" ]; then
  printf '\n\033[1;33m! %s zeigt auf "%s", dieser Server hat %s.\033[0m\n' "$DOMAIN" "${DNS_IP:-nichts}" "$SERVER_IP"
  echo "  Bitte beim Domain-Anbieter einen A-Eintrag ${DOMAIN} → ${SERVER_IP} anlegen."
  read -rp "  Trotzdem fortfahren? (Zertifikat wird dann später automatisch geholt) [j/N] " ok
  [ "${ok:-n}" = "j" ] || exit 1
fi

# ── 5. Bauen und starten ───────────────────────────────────
say "App bauen und starten (der erste Build dauert einige Minuten) …"
docker compose up -d --build

say "Warte, bis die App bereit ist …"
for _ in $(seq 1 60); do
  if docker compose exec -T app wget -q -O /dev/null http://127.0.0.1:8787/api/health 2>/dev/null; then
    printf '\n\033[1;32m✓ Fertig!\033[0m  https://%s\n' "$DOMAIN"
    echo "  Demo-Leitfaden mit QR-Codes für die iPhones: https://${DOMAIN}/demo"
    echo "  Logs: docker compose logs -f   ·   Update: ./update.sh   ·   Backup: ./backup.sh"
    exit 0
  fi
  sleep 3
done
die "App antwortet nicht – Logs ansehen mit: docker compose logs app"
