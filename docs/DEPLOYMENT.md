# Deployment – Getränke Altinger (Version 1.0.0)

Die App besteht aus **einem Node-Prozess**: Er liefert die gebaute Oberfläche (`dist/`) aus, beantwortet die API
(`/api/rpc/*`), hält die Echtzeit-Verbindungen (`/socket.io`) und speichert alle Daten in einer JSON-Datei
(`DATA_FILE`). Render-Blueprint und Dockerfile bauen die Oberfläche fest im **Server-Modus** (`VITE_API_MODE=remote`):
Server und App liegen zusammen, die App schaltet nie still auf lokale Browser-Daten um. Nur für reines Static-Hosting
gibt es den **lokalen Modus** (Daten im Browser, Abschnitt 4).

---

## In 10 Minuten online für die Demo

Voraussetzung: ein GitHub-Konto mit diesem Repository und ein (kostenloses) Konto bei [render.com](https://render.com).

1. **Repo verbinden:** Bei Render anmelden → **New → Blueprint** → GitHub verbinden → Repository auswählen.
2. **Blueprint übernehmen:** Render liest `render.yaml` und zeigt den Web Service **getraenke-altinger**
   (Region Frankfurt, Node 22, `VITE_API_MODE=remote`, Health-Check `/api/health`) → **Apply**.
   Der erste Build dauert ca. 3–5 Minuten (Logs unter „Events“).
3. **URL notieren:** Im Dienst oben die Adresse kopieren, z. B. `https://getraenke-altinger.onrender.com`.
   Kurztest: `https://…/api/health` → `{"ok":true,"mode":"remote",…}`.
4. **Laptop:** `https://…/demo` öffnen → „Jetzt öffnen“ bei **Marktleitung**. Die QR-Codes im Leitfaden zeigen
   automatisch auf diese HTTPS-Adresse.
5. **iPhones:** Mit der Kamera-App die QR-Codes „Anna Berger“ bzw. „Toni Huber“ vom Laptop-Bildschirm scannen →
   das iPhone ist sofort in der richtigen Rolle angemeldet (`/demo?als=u-anna`, `/demo?als=u-toni`).
   Optional in Safari **Teilen → „Zum Home-Bildschirm“**.
6. **Für die Vorführwoche:** Im Dienst unter **Settings → Instance Type** auf **Starter** umstellen (kein Einschlafen).
   Auf dem Free-Tarif die App 10 Minuten vor der Vorführung einmal aufrufen.

Fertig – weiter mit dem [Demo-Drehbuch](DEMO-DREHBUCH.md), Abschnitt 2–3.

> **Kaltstart (Free-Tarif):** Nach ca. 15 Minuten ohne Aufruf schläft der Dienst. Der nächste Aufruf weckt ihn – das
> dauert bis zu einer Minute; die App zeigt solange „Verbinde mit Server …“ und lädt danach von selbst. Nach jedem
> Neustart oder Deploy entstehen frische Demo-Daten (das Dateisystem ist flüchtig).
>
> **HTTPS:** Render liefert automatisch HTTPS – Voraussetzung für **GPS** in der Fahrer-App und die **Kamera**
> („QR scannen“ bei Abholungen) auf dem iPhone.

| Ziel | Empfehlung für | HTTPS | Echtzeit zwischen Geräten | Daten |
|---|---|---|---|---|
| [Render](#1-render-empfohlen-für-die-vorführung) | **Vorführung**, Pilot | automatisch | ja | Datei (Free: flüchtig) |
| [Railway / Fly.io](#2-railway-und-flyio) | Pilot | automatisch | ja | Datei auf Volume |
| [Eigener Server (Docker)](#3-eigener-server-mit-docker) | Pilot, Livebetrieb | über Reverse-Proxy | ja | Datei auf Volume |
| [Static-Hosting (Netlify/Vercel)](#4-static-hosting-netlify-vercel--nur-lokaler-modus) | Offline-Demo, Link zum Ausprobieren | automatisch | nur Tabs eines Browsers | im Browser |
| [Lokales WLAN mit mkcert](#5-lokales-wlan-mit-https-mkcert) | Vorführung ohne Internet-Hosting | selbst signiert | ja | Datei |

**Wichtig für alle Varianten mit Server:** Genau **eine Instanz** betreiben (keine horizontale Skalierung) –
Daten und Echtzeit-Verbindungen liegen im Speicher dieses einen Prozesses.

**Warum HTTPS?** Safari auf dem iPhone gibt die **GPS-Ortung** (Fahrer-App) und die **Kamera** (QR-Scan bei
Abholungen) nur über HTTPS frei (Ausnahme: `localhost`). Ohne HTTPS funktioniert alles andere – für die Fahrt nutzt man
dann die eingebaute Simulation, bei Abholungen die Code-Eingabe.

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
| `VITE_API_MODE` | `auto` | **Build-Zeit:** `remote` (Render-Blueprint und Dockerfile: Server und App zusammen, nie lokal), `local` (nur Static-Hosting) oder `auto` (lokale Entwicklung: Server-Prüfung, `?api=local` für Tests) |
| `VITE_API_URL` | leer | **Build-Zeit:** Server-Adresse, wenn die Oberfläche woanders liegt |

Build und Start (überall gleich):

```bash
npm ci                              # inkl. devDependencies (TypeScript, Vite) – nötig für den Build
VITE_API_MODE=remote npm run build  # tsc -b && vite build → dist/ (fester Server-Modus)
npm start                           # NODE_ENV=production tsx server/index.ts
```

**Health-Check:** `GET /api/health` → `{"ok":true,"mode":"remote","version":"1.0.0","time":…}` (Render: `healthCheckPath`,
Docker: `HEALTHCHECK`). Die App selbst prüft denselben Endpunkt beim Start und wartet bei einem Kaltstart bis zu 60 s.

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
   - Health-Check: `/api/health`, eine Instanz (`numInstances: 1`)
   - Umgebung: `NODE_VERSION=22`, `NODE_ENV=production`, **`VITE_API_MODE=remote`**, `DEMO_MODE=true`, `RESEED_STALE=true`,
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
Umgebungsvariablen wie oben – **`VITE_API_MODE=remote` nicht vergessen** (wirkt beim Build).

### Tarif und Daten

- **Free:** schläft nach ca. 15 Minuten ohne Aufruf ein; der erste Aufruf dauert dann bis zu einer Minute
  (die App zeigt „Verbinde mit Server …“ und verbindet sich selbst). Das Dateisystem ist flüchtig – nach Neustart oder
  Deploy entstehen frische Demo-Daten (für Demos ideal).
- **Starter** (kostenpflichtig): kein Einschlafen – **für die Vorführwoche empfohlen**.
- **Pilot mit echten Daten:** kostenpflichtiger Tarif + **Persistent Disk** (z. B. eingehängt unter `/var/data`) und
  `DATA_FILE=/var/data/db.json`, `RESEED_STALE=false`.

### Eigene Domain

Settings → **Custom Domains** → z. B. `bestellen.getraenke-altinger.de` → beim Domain-Anbieter einen
**CNAME** auf `<name>.onrender.com` setzen. Das Zertifikat stellt Render automatisch aus.

---

## 2. Railway und Fly.io

Beide verwenden das mitgelieferte **Dockerfile** (mehrstufig: `node:22-alpine`, `npm ci`, `npm run build` mit
`VITE_API_MODE=remote`, Laufzeit nur mit Produktionsabhängigkeiten, Daten unter `/app/data`, `HEALTHCHECK` auf `/api/health`).

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
Beenden (`docker stop`) den letzten Stand. Die Oberfläche ist mit `VITE_API_MODE=remote` gebaut; abweichend z. B.
`docker build --build-arg VITE_API_URL=https://api.example.de -t getraenke-altinger .`

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

**Offline-Demo als Plan B:** Auf Render bzw. im Docker-Image gibt es bewusst keinen lokalen Modus. Für eine Vorführung
ohne Internet die App auf dem Laptop bauen **ohne** `VITE_API_MODE` (also `auto`): `npm run build && npm start` →
`http://localhost:8787/demo?api=local` (alle Rollen im Browser, Tabs synchron) – oder die iPhones über den
Laptop-Hotspot mit `http://<Laptop-IP>:8787` verbinden (siehe Abschnitt 5).

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

5. Auf dem iPhone `https://192.168.1.20:8787/demo` öffnen – das Schloss-Symbol erscheint, GPS und Kamera können freigegeben werden.

Hinweise: Ändert sich die IP-Adresse (anderes WLAN), Zertifikat neu erzeugen. Die Firewall des Laptops muss
Port 8787 zulassen. Der Vite-Entwicklungsserver (`npm run dev`) bleibt HTTP – für HTTPS den Produktions-Build verwenden.
Die QR-Codes im Leitfaden zeigen automatisch auf die Adresse, unter der der Leitfaden geöffnet wurde; läuft er über
`localhost`, kann die WLAN-Adresse dort eingetragen werden.

---

## 6. Nach dem Deployment prüfen

- [ ] `/api/health` liefert `"ok": true` und `"mode": "remote"`
- [ ] `/demo` zeigt „Server-Modus“, in der Schnellaktion „Betriebsmodus“ **Server**, **Echtzeit verbunden** und
      „Fest eingestellt über VITE_API_MODE=remote.“
- [ ] Anmeldung als Anna auf dem iPhone per QR-Code, als Marktleitung am Laptop
- [ ] Eine Testbestellung von Anna erscheint ohne Neuladen im Markt-Dashboard
- [ ] Schnellaktion „Neue Bestellungen automatisch bestätigen“ ist aus (der Markt bestätigt live)
- [ ] „Tour 1 simulieren“ (8×, „Stopps automatisch zustellen“ und „Annas Stopp selbst zustellen“ an) – Fahrzeug bewegt sich
      auf der Live-Karte und in Annas Sendungsverfolgung, hält bei Anna, bis Toni „Zustellung abschließen“ tippt
- [ ] „Abholungen“ → „QR scannen“ – Kamerafreigabe auf dem Laptop erteilt
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
