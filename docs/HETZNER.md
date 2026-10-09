# Getränke Altinger auf einem Hetzner-Server

Schritt-für-Schritt-Anleitung für einen eigenen Server in Deutschland (Hetzner Cloud), mit fester Adresse wie
`https://altinger-demo.presio.eu` und automatischem HTTPS. Aufwand: ca. 30 Minuten, Kosten: ca. 4–6 € im Monat.

Was auf dem Server läuft (alles in `deploy/hetzner/`):

| Datei | Zweck |
|---|---|
| `docker-compose.yml` | App-Container (Server + Oberfläche) und Caddy (HTTPS, Let's Encrypt) |
| `Caddyfile` | leitet `https://<Domain>` auf die App, HTTP → HTTPS, `noindex`-Header |
| `.env.example` | Vorlage für Domain, E-Mail, Demo-Modus |
| `install.sh` | Ersteinrichtung: Docker, Firewall, Konfiguration, Start, Prüfung |
| `update.sh` | neue Version holen und neu starten (Daten bleiben) |
| `backup.sh` | Daten sichern nach `deploy/hetzner/backups/` |

Der Aufbau wurde mit Docker getestet: Build, HTTPS über Caddy, Weiterleitung HTTP → HTTPS, Echtzeit (WebSocket),
alle Klicktests der Demo-Abläufe, Daten nach Neustart erhalten, Backup.

---

## 1. Server bei Hetzner anlegen (ca. 5 Min.)

1. In der [Hetzner Cloud Console](https://console.hetzner.cloud) ein Projekt anlegen → **Server hinzufügen**.
2. **Standort:** Nürnberg oder Falkenstein (Deutschland).
3. **Image:** Ubuntu 24.04.
4. **Typ:** kleinster Shared-vCPU-Typ mit **mindestens 4 GB RAM** (z. B. CX22 bzw. das aktuelle Nachfolgemodell).
   Mit 2 GB RAM kann der erste Build an Speicher scheitern.
5. **SSH-Schlüssel** hinzufügen (eigener öffentlicher Schlüssel, z. B. `~/.ssh/id_ed25519.pub`).
6. Optional **Firewall** anlegen und zuweisen: eingehend TCP 22, 80, 443 und UDP 443.
   (Das Installationsskript richtet zusätzlich die Ubuntu-Firewall `ufw` ein.)
7. **Erstellen** → die **IPv4-Adresse** des Servers notieren, z. B. `203.0.113.10`.

## 2. Domain auf den Server zeigen lassen (ca. 2 Min. + Wartezeit)

Beim Anbieter eurer Domain (z. B. für `presio.eu`) einen DNS-Eintrag anlegen:

| Typ | Name | Wert |
|---|---|---|
| A | `altinger-demo` | IPv4 des Servers (z. B. `203.0.113.10`) |
| AAAA (optional) | `altinger-demo` | IPv6 des Servers |

Prüfen (am Laptop): `nslookup altinger-demo.presio.eu` liefert die Server-IP. Das kann einige Minuten dauern.

## 3. Code auf den Server holen (ca. 5 Min.)

Per SSH verbinden: `ssh root@203.0.113.10`

Das Repository ist privat. Am einfachsten mit einem **Deploy-Key** (nur Lesezugriff, nur dieses Repo):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/altinger_deploy -N "" -C "altinger-server"
cat ~/.ssh/altinger_deploy.pub
```

Den ausgegebenen Schlüssel auf GitHub eintragen: Repository **Presio26/Getr-nke-Altinger → Settings → Deploy keys →
Add deploy key** (Titel z. B. „Hetzner“, **ohne** Schreibrecht).

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/altinger_deploy
EOF

git clone git@github.com:Presio26/Getr-nke-Altinger.git /opt/altinger
```

> **Branch:** Solange die App noch nicht in `main` gemergt ist, mit Branch klonen:
> `git clone -b claude/getranke-altinger-app-qpeq6f git@github.com:Presio26/Getr-nke-Altinger.git /opt/altinger`

## 4. Installieren und starten (ca. 10 Min.)

```bash
cd /opt/altinger/deploy/hetzner
./install.sh
```

Das Skript

1. installiert Docker (falls nötig),
2. öffnet in der Firewall nur SSH, HTTP und HTTPS,
3. fragt **Domain** (`altinger-demo.presio.eu`) und **E-Mail** (für das Zertifikat) ab und legt `.env` an,
4. prüft, ob die Domain schon auf diesen Server zeigt,
5. baut die App (erster Build ca. 3–6 Min.) und startet App + Caddy,
6. wartet, bis die App antwortet, und gibt die Adresse aus.

Caddy holt das HTTPS-Zertifikat beim ersten Aufruf automatisch. Fertig, wenn
`https://altinger-demo.presio.eu/api/health` die Antwort `{"ok":true,"mode":"remote",…}` liefert.

## 5. Für die Demo vorbereiten

- Laptop: `https://altinger-demo.presio.eu/demo` öffnen → „Jetzt öffnen“ bei **Marktleitung**.
- iPhones: die QR-Codes „Anna Berger“ und „Toni Huber“ vom Laptop scannen → direkt in der richtigen Rolle angemeldet.
  Optional in Safari **Teilen → „Zum Home-Bildschirm“**.
- Checkliste: [DEPLOYMENT.md, Abschnitt 6](DEPLOYMENT.md#6-nach-dem-deployment-prüfen) und Ablauf im
  [Demo-Drehbuch](DEMO-DREHBUCH.md).
- Demo-Daten werden jeden Morgen automatisch frisch erzeugt (`RESEED_STALE=true`) und lassen sich jederzeit über
  `/demo` → „Demo-Daten zurücksetzen“ neu erzeugen.

## Betrieb

```bash
cd /opt/altinger/deploy/hetzner
docker compose ps              # Status
docker compose logs -f app     # Logs der App (Strg+C beendet die Anzeige)
docker compose logs caddy      # Logs von Caddy (z. B. Zertifikat)
./update.sh                    # neue Version aus GitHub holen und neu starten
./backup.sh                    # Daten sichern (backups/altinger-<Datum>.tgz)
docker compose restart app     # App neu starten (Daten bleiben)
docker compose down            # alles stoppen (Daten bleiben im Docker-Volume)
```

Einstellungen in `.env` (danach `docker compose up -d`):

| Variable | Bedeutung |
|---|---|
| `DOMAIN` | Adresse der App |
| `ACME_EMAIL` | E-Mail für Let's Encrypt |
| `DEMO_MODE` | `true` = Ein-Klick-Anmeldung, QR-Codes, Zurücksetzen für alle · `false` für den Pilotbetrieb |
| `RESEED_STALE` | `true` = Demo-Daten jeden Morgen neu · `false` für den Pilotbetrieb |

## Häufige Probleme

| Problem | Lösung |
|---|---|
| Browser meldet Zertifikatsfehler | DNS zeigt noch nicht auf den Server, oder Port 80/443 ist in der Hetzner-Firewall zu. `docker compose logs caddy` zeigt den Grund; nach dem Beheben `docker compose restart caddy`. |
| Build bricht ab (`Killed`, Speicher) | Server mit mindestens 4 GB RAM wählen (in der Console unter **Skalieren** möglich). |
| `git clone` verweigert | Deploy-Key fehlt oder falscher Schlüssel – Schritt 3 prüfen (`ssh -T git@github.com`). |
| iPhone fragt nicht nach GPS/Kamera | Nur über `https://` möglich – Adresse mit Schloss-Symbol öffnen. |
| Seite zeigt „Verbinde mit Server …“ | `docker compose ps` – läuft die App? Sonst `docker compose logs app`. |

## Datenschutz

Server und Daten liegen in Deutschland. Für einen Pilotbetrieb mit echten Kundendaten einen
Auftragsverarbeitungsvertrag (AVV) mit Hetzner abschließen (in der Hetzner-Konsole verfügbar) und die Hinweise in
[KONZEPT.md](KONZEPT.md) zum Datenschutz beachten. Die Demo ist per `X-Robots-Tag: noindex` von Suchmaschinen
ausgenommen, aber für jeden mit dem Link erreichbar.
