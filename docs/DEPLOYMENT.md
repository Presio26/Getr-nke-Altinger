# Deployment – Getränke Altinger

Die App besteht aus **einem Node-Prozess**: Er liefert die gebaute Oberfläche (`dist/`) aus, beantwortet die API
(`/api/rpc/*`), hält die Echtzeit-Verbindungen (`/socket.io`) und speichert alle Daten in einer JSON-Datei
(`DATA_FILE`). Ohne Server läuft die Oberfläche auch rein statisch im **lokalen Modus** (Daten im Browser).

| Ziel | Empfehlung für | HTTPS | Echtzeit zwischen Geräten | Daten |
|---|---|---|---|---|
| [Render](#1-render-empfohlen-für-die-vorführung) | **Vorführung**, Pilot | automatisch | ja | Datei (free: flüchtig) |
| [Railway / Fly.io](#2-railway-und-flyio) | Pilot | automatisch | ja | Datei auf Volume |
| [Eigener Server (Docker)](#3-eigener-server-mit-docker) | Pilot, Livebetrieb | über Reverse-Proxy | ja | Datei auf Volume |
| [Static-Hosting (Netlify/Vercel)](#4-static-hosting-netlify-vercel--nur-lokaler-modus) | Offline-Demo, Link zum Ausprobieren | automatisch | nur Tabs eines Browsers | im Browser |
| [Lokales WLAN mit mkcert](#5-lokales-wlan-mit-https-mkcert) | Vorführung ohne Internet-Hosting | selbst signiert | ja | Datei |

**Wichtig für alle Varianten mit Server:** Genau **eine Instanz** betreiben (keine horizontale Skalierung) –
Daten und Echtzeit-Verbindungen liegen im Speicher dieses einen Prozesses.

**Warum HTTPS?** Safari auf dem iPhone gibt die **GPS-Ortung** (Fahrer-App) und die Kamera nur über HTTPS frei
(Ausnahme: `localhost`). Ohne HTTPS funktioniert alles andere – für die Fahrt nutzt man dann die eingebaute
Simulation.

---

## Konfiguration (Kurzüberblick)

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `8787` | Port (Render/Railway/Fly setzen ihn selbst) |
| `HOST` | `0.0.0.0` | Bind-Adresse |
| `DATA_FILE` | `data/db.json` | Datendatei (Verzeichnis wird angelegt) |
| `DEMO_MODE` | `true` | Ein-Klick-Demo-Anmeldung und Demo-Reset für alle |
| `RESEED_STALE` | `true` | Demo-Daten vom Vortag automatisch erneuern (Touren „heute“) |
| `HTTPS_CERT` / `HTTPS_KEY` | – | PEM-Dateien → Server spricht selbst HTTPS |
| `CORS_ORIGIN` | alle | erlaubte Herkünfte, wenn Oberfläche und Server getrennt laufen |
| `NODE_ENV` | – | `production` → Auslieferung von `dist/` (setzt `npm start` selbst) |
| `VITE_API_MODE` | `auto` | **Build-Zeit:** `remote`, `local` oder `auto` |
| `VITE_API_URL` | leer | **Build-Zeit:** Server-Adresse, wenn die Oberfläche woanders liegt |

Build und Start (überall gleich):

```bash
npm ci          # inkl. devDependencies (TypeScript, Vite) – nötig für den Build
npm run build   # tsc -b && vite build → dist/
npm start       # NODE_ENV=production tsx server/index.ts
```

`tsx` ist eine reguläre Abhängigkeit – der Server läuft ohne separaten Compile-Schritt direkt aus TypeScript.

---

## 1. Render (empfohlen für die Vorführung)

Render stellt die App mit **HTTPS-Adresse** bereit (`https://<name>.onrender.com`), unterstützt WebSockets und
hat ein Rechenzentrum in **Frankfurt**. Damit funktioniert auch das **GPS auf dem iPhone**.

### Mit Blueprint (`render.yaml`)

1. Repository auf GitHub/GitLab bereitstellen.
2. Bei [render.com](https://render.com) anmelden → **New → Blueprint** → Repository wählen.
3. Render liest `render.yaml` und legt den Web Service **getraenke-altinger** an:
   - Build: `npm ci && npm run build`
   - Start: `npm start`
   - Health-Check: `/api/health`
   - Umgebung: `NODE_ENV=production`, `DEMO_MODE=true`, `RESEED_STALE=true`, `NODE_VERSION=22`,
     `NPM_CONFIG_INCLUDE=dev`
4. **Apply** → der erste Build dauert einige Minuten.
5. Prüfen: `https://<name>.onrender.com/api/health` → `{"ok":true,"mode":"remote",…}`,
   danach `https://<name>.onrender.com/demo`.

> **Warum `NPM_CONFIG_INCLUDE=dev`?** Render setzt die Umgebungsvariablen auch beim Build. Mit
> `NODE_ENV=production` würde `npm ci` die devDependencies (TypeScript, Vite, Tailwind) auslassen und der Build
> scheitern. Die Variable sorgt dafür, dass sie trotzdem installiert werden.

### Ohne Blueprint (manuell)

**New → Web Service** → Repository → Runtime **Node**, Region **Frankfurt**,
Build Command `npm ci && npm run build`, Start Command `npm start`, Health Check Path `/api/health`,
Umgebungsvariablen wie oben.

### Tarif und Daten

- **Free:** schläft nach ca. 15 Minuten ohne Aufruf ein; der erste Aufruf dauert dann bis zu einer Minute.
  Das Dateisystem ist flüchtig – nach Neustart oder Deploy entstehen frische Demo-Daten (für Demos ideal).
- **Starter** (kostenpflichtig): kein Einschlafen – **für die Vorführwoche empfohlen**.
- **Pilot mit echten Daten:** kostenpflichtiger Tarif + **Persistent Disk** (z. B. eingehängt unter `/var/data`) und
  `DATA_FILE=/var/data/db.json`, `RESEED_STALE=false`.

### Eigene Domain

Settings → **Custom Domains** → z. B. `bestellen.getraenke-altinger.de` → beim Domain-Anbieter einen
**CNAME** auf `<name>.onrender.com` setzen. Das Zertifikat stellt Render automatisch aus.

---

## 2. Railway und Fly.io

Beide verwenden das mitgelieferte **Dockerfile** (mehrstufig: `node:22-alpine`, `npm ci`, `npm run build`,
Laufzeit nur mit Produktionsabhängigkeiten, Daten unter `/app/data`).

### Railway

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo** → Repository wählen.
   Railway erkennt das Dockerfile automatisch.
2. **Variables:** `DEMO_MODE=true` (weitere Standardwerte setzt das Dockerfile). `PORT` setzt Railway selbst.
3. **Settings → Networking → Generate Domain** → HTTPS-Adresse `https://<name>.up.railway.app`.
4. Optional für dauerhafte Daten: **Volume** anlegen und unter `/app/data` einhängen.
5. Prüfen: `/api/health` und `/demo`.

### Fly.io

```bash
fly launch --no-deploy            # erkennt das Dockerfile; Region "fra" (Frankfurt) wählen
fly volumes create altinger_data --region fra --size 1
```

In der erzeugten `fly.toml` ergänzen bzw. prüfen:

```toml
[http_service]
  internal_port = 8787
  force_https = true
  auto_stop_machines = "off"     # für Vorführungen: nicht schlafen legen
  min_machines_running = 1

[mounts]
  source = "altinger_data"
  destination = "/app/data"
```

```bash
fly deploy
fly scale count 1                 # genau eine Instanz
```

Adresse: `https://<name>.fly.dev`.

---

## 3. Eigener Server mit Docker

Für Pilot und Livebetrieb auf einem Server in der EU (z. B. vServer in Deutschland).

```bash
docker build -t getraenke-altinger .
docker volume create altinger-data
docker run -d --name altinger --restart unless-stopped \
  -p 127.0.0.1:8787:8787 \
  -v altinger-data:/app/data \
  -e DEMO_MODE=true \
  getraenke-altinger
```

Das Image startet als Nutzer `node`, prüft sich selbst über `/api/health` (HEALTHCHECK) und speichert beim
Beenden (`docker stop`) den letzten Stand.

**HTTPS per Reverse-Proxy** – am einfachsten mit [Caddy](https://caddyserver.com) (holt das Zertifikat automatisch,
WebSockets funktionieren ohne Zusatzkonfiguration):

```
# /etc/caddy/Caddyfile
bestellen.getraenke-altinger.de {
    encode gzip
    reverse_proxy 127.0.0.1:8787
}
```

Alternativ nginx – wichtig sind die Upgrade-Header für socket.io:

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**Betrieb**

- Update: `git pull && docker build -t getraenke-altinger . && docker rm -f altinger && docker run …` (wie oben).
- Backup: Volume sichern, z. B.
  `docker run --rm -v altinger-data:/data -v "$PWD":/backup alpine tar czf /backup/altinger-$(date +%F).tgz -C /data .`
- Logs: `docker logs -f altinger`.
- Demo-Daten neu erzeugen: in der App (Leitfaden `/demo` oder Markt → Einstellungen) oder Datei im Volume löschen
  und Container neu starten.

---

## 4. Static-Hosting (Netlify, Vercel) – nur lokaler Modus

Ohne Node-Server läuft die komplette App **im Browser**: Daten in `localStorage`, Echtzeit nur zwischen Tabs
desselben Browsers. Ideal als Link zum Ausprobieren oder als Offline-Demo – **nicht** für die Vorführung mit
mehreren Geräten.

Gemeinsame Einstellungen:

| Einstellung | Wert |
|---|---|
| Build-Befehl | `npm run build` |
| Ausgabeordner | `dist` |
| Umgebungsvariable | `VITE_API_MODE=local` |
| Node-Version | 22 |

Alle Pfade müssen auf `index.html` zurückfallen (Single-Page-App):

**Netlify** – `netlify.toml` im Projektordner:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  VITE_API_MODE = "local"
  NODE_VERSION = "22"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**Vercel** – Framework „Vite“, Umgebungsvariable `VITE_API_MODE=local`, dazu `vercel.json`:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

**Variante: Oberfläche statisch, Server getrennt** – beim Build `VITE_API_MODE=remote` und
`VITE_API_URL=https://<server-adresse>` setzen, am Server `CORS_ORIGIN=https://<oberflächen-adresse>`.

---

## 5. Lokales WLAN mit HTTPS (mkcert)

Für eine Vorführung ohne Internet-Hosting – Laptop als Server, iPhones im selben WLAN (oder im Hotspot des Laptops).
Ohne Zertifikat funktioniert alles außer GPS (`http://<Laptop-IP>:5173` mit `npm run dev`, Fahrt per Simulation).
Mit Zertifikat geht auch das echte GPS:

1. **mkcert installieren** – macOS: `brew install mkcert` · Windows: `choco install mkcert` ·
   Linux: Paket `mkcert` bzw. Release von GitHub.
2. Lokale Zertifizierungsstelle anlegen und Zertifikat für die WLAN-Adresse des Laptops erzeugen
   (IP z. B. aus der Server-Ausgabe „Im WLAN“):

   ```bash
   mkcert -install
   mkdir -p certs
   mkcert -cert-file certs/lan.pem -key-file certs/lan-key.pem 192.168.1.20 localhost 127.0.0.1
   ```

   Der Ordner `certs/` gehört nicht ins Repository.
3. **Stammzertifikat aufs iPhone:** Datei `rootCA.pem` aus `mkcert -CAROOT` per AirDrop aufs iPhone senden →
   **Einstellungen → Profil geladen → Installieren** → anschließend
   **Einstellungen → Allgemein → Info → Zertifikatsvertrauenseinstellungen** → für „mkcert …“ **volles Vertrauen** aktivieren.
4. App bauen und mit HTTPS starten:

   ```bash
   npm run build
   HTTPS_CERT=certs/lan.pem HTTPS_KEY=certs/lan-key.pem npm start
   ```

5. Auf dem iPhone `https://192.168.1.20:8787/demo` öffnen – das Schloss-Symbol erscheint, GPS kann freigegeben werden.

Hinweise: Ändert sich die IP-Adresse (anderes WLAN), Zertifikat neu erzeugen. Die Firewall des Laptops muss
Port 8787 zulassen. Der Vite-Entwicklungsserver (`npm run dev`) bleibt HTTP – für HTTPS den Produktions-Build verwenden.
Die QR-Codes im Leitfaden zeigen automatisch auf die Adresse, unter der der Leitfaden geöffnet wurde; läuft er über
`localhost`, kann die WLAN-Adresse dort eingetragen werden.

---

## 6. Nach dem Deployment prüfen

- [ ] `/api/health` liefert `"ok": true` und `"mode": "remote"`
- [ ] `/demo` zeigt Betriebsmodus **Server** und **Echtzeit verbunden**
- [ ] Anmeldung als Anna auf dem iPhone per QR-Code, als Marktleitung am Laptop
- [ ] Eine Testbestellung von Anna erscheint ohne Neuladen im Markt-Dashboard
- [ ] „Tour 1 simulieren“ – Fahrzeug bewegt sich auf der Live-Karte und in Annas Sendungsverfolgung
- [ ] App auf dem iPhone installiert („Zum Home-Bildschirm“) und startet im Vollbild
- [ ] GPS-Freigabe in der Fahrer-App (nur über HTTPS)
- [ ] „Demo-Daten zurücksetzen“ – alle Geräte zeigen den Ausgangsstand

---

## 7. Vom Demo- zum Pilotbetrieb

- `DEMO_MODE=false` – keine Ein-Klick-Anmeldung, Zurücksetzen nur noch für die Marktleitung.
- `RESEED_STALE=false` – Daten werden nicht mehr täglich neu erzeugt.
- Demo-Bestand durch echte Stammdaten ersetzen (Sortiment, Preise, Liefergebiete, Kunden); die Demo-Zugänge mit
  Passwort „demo“ dürfen im Pilot nicht mehr existieren.
- Dauerhafter Speicher mit **täglichem Backup**; für den Livebetrieb Umstieg auf eine Datenbank vorgesehen.
- Eigene Domain mit HTTPS, Impressum und Datenschutzerklärung, AV-Vertrag mit dem Hoster (siehe [KONZEPT.md](KONZEPT.md)).
