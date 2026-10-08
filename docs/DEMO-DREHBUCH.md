# Demo-Drehbuch – Vorführung bei Getränke Altinger

**Dauer:** 15–20 Minuten Vorführung + Zeit für Fragen
**Ziel:** Der Inhaber erlebt an echten Geräten, wie eine Bestellung vom iPhone der Kundin über den Markt und den
Fahrer bis zur Haustür läuft – live, ohne Neuladen – und wie Geschäftskunden, Click & Collect und Festservice
dazupassen.

Im Leitfaden der App (**`/demo`**) stehen dieselben Schritte als abhakbare Liste mit Direkt-Links, QR-Codes und
Schnellaktionen. Dieses Dokument ergänzt Vorbereitung, Sprechtexte und Plan B.

---

## 1. Geräte und Rollen

| Gerät | Rolle in der App | Wer bedient | Anmelden über |
|---|---|---|---|
| **iPhone 1** | Kundin **Anna Berger** | am besten **der Inhaber selbst** – er bestellt „wie ein Kunde“ | QR-Code „Anna Berger“ im Leitfaden (`/demo?als=u-anna`) |
| **iPhone 2** (oder Tablet) | Fahrer **Toni Huber**, Tour 1 | Vortragende/r oder Assistenz | QR-Code „Toni Huber“ (`/demo?als=u-toni`) |
| **Laptop** | **Marktleitung** (Markt-Dashboard) | Vortragende/r | „Jetzt öffnen“ bei Marktleitung (`/demo?als=u-admin`) |
| **Beamer/Bildschirm** | spiegelt den Laptop | – | HDMI/USB-C |

Tipp: Die iPhone-Bildschirme bei Bedarf per AirPlay oder Kamera auf den Beamer bringen – meist reicht es,
das iPhone in die Hand zu geben.

---

## 2. Vorbereitung am Vortag

**Bereitstellung**
- [ ] App auf **Render** bereitgestellt (siehe [DEPLOYMENT.md](DEPLOYMENT.md)), Adresse notiert, z. B. `https://getraenke-altinger.onrender.com`
- [ ] `https://<adresse>/api/health` liefert `"ok": true`
- [ ] Für die Vorführwoche den Render-Tarif **Starter** wählen (kein Einschlafen) – oder die App 10 Minuten vorher aufrufen
- [ ] Leitfaden `/demo` öffnen: Betriebsmodus „**Server**“, „**Echtzeit verbunden**“

**Daten**
- [ ] Im Leitfaden **„Demo-Daten zurücksetzen“** (Haken im Drehbuch gleich mit zurücksetzen)
- [ ] Kurztest: Anna legt einen Artikel in den Warenkorb, Markt sieht nichts Ungewöhnliches; danach erneut zurücksetzen
- [ ] Hinweis: Die Demo-Daten erneuern sich jeden Tag automatisch (Touren „heute“) – am Morgen der Vorführung ist alles frisch

**iPhones**
- [ ] iPhone 1: QR-Code „Anna Berger“ scannen → in Safari **Teilen → „Zum Home-Bildschirm“** → App vom Home-Bildschirm öffnen
      und ggf. erneut über den QR-Code bzw. den Demo-Umschalter als Anna anmelden
- [ ] iPhone 2: dasselbe mit „Toni Huber“; beim ersten Tourstart **Standortfreigabe „Beim Verwenden der App erlauben“**
- [ ] Mitteilungen erlauben, falls die App danach fragt
- [ ] **Automatische Sperre: Nie**, Helligkeit hoch, **Nicht stören** an, Ton aus
- [ ] Ladestand 100 %, Ladekabel und Powerbank einpacken

**Laptop**
- [ ] Browser-Tabs vorbereiten: ① `/admin` (Dashboard), ② `/admin/live` (Live-Karte), ③ `/demo` (Leitfaden)
- [ ] Zoom auf 110–125 % für den Beamer, Lesezeichenleiste und Benachrichtigungen ausblenden
- [ ] Adapter für den Beamer (HDMI/USB-C), Netzteil
- [ ] **Plan B getestet:** `/demo?api=local` öffnet den lokalen Modus (siehe Abschnitt 5)
- [ ] **Plan C:** Screenshots der wichtigsten Ansichten in einem Ordner (Shop, Kasse, Tracking, Fahrer-Stopp, Dashboard, Tourenplanung)

**Unterlagen**
- [ ] [KONZEPT.md](KONZEPT.md) ausgedruckt (2×), Liste der offenen Fragen griffbereit

---

## 3. Am Tag – 15 Minuten vorher

1. Laptop: `/demo` öffnen, **Demo-Daten zurücksetzen**, Echtzeit „verbunden“ prüfen.
2. Schnellaktionen: Tour 1 steht auf „**Geplant**“ (Toni Huber, 4 Stopps).
3. iPhone 1 zeigt den Shop als Anna, iPhone 2 die Fahrer-App von Toni („Heute“ mit Tour 1).
4. Laptop als Marktleitung auf Tab ① Dashboard.
5. Netz prüfen (Besprechungs-WLAN oder Hotspot).

---

## 4. Ablauf

Zeitangaben sind kumuliert. **Kernbotschaften** sind fett, Sprechtexte als Vorschlag in Anführungszeichen.

### 0:00 · Einstieg (1 Min.) – Laptop/Beamer

Leitfaden `/demo` zeigen, dann zum Shop (`/`).

> „Ihre Kunden schätzen Sie für den Service – Kisten bis zum Auto, Pfand sauber erfasst. Wir haben überlegt, wie
> dieser Service aussieht, wenn Ihre Kunden ihn am Handy bestellen. Alles, was Sie gleich sehen, läuft live –
> drei Geräte, dieselben Daten.“

**Kernbotschaft: Ihr Service – jetzt auch digital.**

### 0:01 · Schritt 1 – Anna bestellt per iPhone (3 Min.) – iPhone 1

Klickpfad (Inhaber bedient, Sie leiten an):
1. Tab **Sortiment** → **Bier** → **Augustiner Lagerbier Hell** → **2 Kästen** in den Warenkorb
   (alternativ Direkt-Link „Augustiner Hell“ im Leitfaden).
2. Optional: **Wasser** → Adelholzener → 1 Kasten.
3. **Warenkorb** → Leergut-Rückgabe: **2 Bierkästen** eintragen → Pfand-Gutschrift erscheint.
4. **Zur Kasse** → **Lieferung** → Adresse „Zuhause“ → nächstes freies **Zeitfenster heute**.
5. **Tragservice** zuschalten → Zahlart (z. B. PayPal oder bar) → **verbindlich bestellen**.

> „Preise wie im Markt, Pfand separat, das Leergut wird gleich mitgenommen – und der Tragservice ist ein Klick.
> Die Bestellung dauert keine Minute.“

**Kernbotschaft: Bestellen so einfach wie bei den Großen – mit Ihrem Service.**

### 0:04 · Schritt 2 – Markt sieht die Bestellung live (2 Min.) – Laptop

1. Dashboard: Die neue Bestellung ist **ohne Neuladen** erschienen (Glocke/Hinweis).
2. **Bestellungen** → Annas Bestellung öffnen → **Bestätigen** (→ Kommissionieren → Bereit).
3. **Touren** → Bestellung **Tour 1** zuordnen oder **automatisch planen** → **Route optimieren**.

Hinweis: Anna hat zusätzlich eine vorbereitete Bestellung, die bereits **erster Stopp auf Tour 1** ist – das Tracking
in Schritt 4 funktioniert also in jedem Fall, auch wenn das gewählte Zeitfenster nicht zu Tour 1 passt.

> „Kein Zettel, kein Abtippen. Sie sehen Zeitfenster, Leergut und Tragservice auf einen Blick – und die Tour
> plant sich fast von selbst.“

**Kernbotschaft: Weniger Telefon, planbare Touren.**

### 0:06 · Schritt 3 – Fahrer startet die Tour (2 Min.) – iPhone 2 + Laptop

1. iPhone 2 (Toni): **Tour 1 · Garching Mitte** → Ladeliste zeigen → **Tour starten**.
2. **Für die Vorführung ohne echte Fahrt:** Laptop → `/demo` → Schnellaktionen **„Tour 1 simulieren“**
   mit **8× Zeitraffer** und **„Stopps automatisch zustellen“ AUS** – das Fahrzeug fährt die echte Route und wartet
   am ersten Stopp, bis Toni zustellt.
3. Laptop: Tab ② **Live-Karte** – das Fahrzeug bewegt sich.

> „Toni hat alles auf dem Handy: was er laden muss, in welcher Reihenfolge er fährt, und die Navigation.
> Sie sehen im Markt jederzeit, wo das Fahrzeug ist.“

**Kernbotschaft: Volle Übersicht für Fahrer und Markt.**

### 0:08 · Schritt 4 – Anna verfolgt die Lieferung (2 Min.) – iPhone 1

1. iPhone 1: **Bestellungen** → Bestellung auf Tour 1 öffnen.
2. Karte mit Fahrzeug, **voraussichtliche Ankunft**, Stopps davor.
3. Benachrichtigung „Ihr Fahrer ist unterwegs“ bzw. „gleich da“ zeigen.

> „Wie bei Paketdiensten – nur vom Getränkemarkt um die Ecke. Kein Anruf mehr: ‚Wann kommt ihr denn?‘“

**Kernbotschaft: Weniger Rückfragen, weniger vergebliche Fahrten.**

(Die **Bewertung** zeigt Anna nach Schritt 5, sobald die Bestellung zugestellt ist.)

### 0:10 · Schritt 5 – Fahrer am Stopp (2 Min.) – iPhone 2

1. Das Fahrzeug erreicht Annas Adresse → Stopp öffnen → **„Ich bin da“** (Anna bekommt einen Hinweis).
2. **Leergut erfassen:** 2 Bierkästen, 1 Wasserkasten → Pfand wird gutgeschrieben.
3. Bei Barzahlung **kassieren**, **Unterschrift** auf dem Display, **Foto** der Abstellung.
4. **Zugestellt** → die Simulation fährt zum nächsten Stopp weiter.
5. Zurück zu iPhone 1: Status „Zugestellt“ → **Bewertung** mit 5 Sternen.

> „Jede Lieferung ist dokumentiert – Leergut, Unterschrift, Foto. Das Leergut-Konto jedes Kunden ist damit immer
> aktuell.“

**Kernbotschaft: Leergut-Transparenz und Zustellnachweis ohne Papier.**

### 0:12 · Schritt 6 – Gasthaus bestellt (3 Min.) – Laptop

Leitfaden → „Schnellbestellung“ (meldet als **Gasthaus Zum Mühlbach** an).
1. **B2B-Portal:** offene Rechnungen, Dauerauftrag.
2. **Schnellbestellung:** Mengen direkt eintragen – **Nettopreise** mit 8 % Rabatt, **Staffelpreise** ab
   größeren Mengen.
3. Kostenstelle „Biergarten“, Referenz, Zahlart **Rechnung** → bestellen.
4. **Rechnungen:** eine Rechnung öffnen → Druckansicht/PDF.

> „Die Wirtin bestellt abends nach Küchenschluss in zwei Minuten – zu ihren Konditionen, mit Rechnung.
> Kein Fax, kein Anrufbeantworter.“

**Kernbotschaft: Geschäftskunden digital – mit Rechnung und Konditionen.**

### 0:15 · Schritt 7 – Click & Collect (2 Min.) – iPhone 1 + Laptop

1. iPhone 1 (Anna): Artikel in den Warenkorb → Kasse → **Abholung im Markt** → Abholzeitfenster → bestellen.
2. Bestelldetail: **QR-Code und Abholcode**.
3. Laptop als Marktleitung: **Abholungen** → Code eingeben (bzw. scannen) → Bestellung **ausgeben/abgeholt**.

> „Am Samstag ist die Ware vorbereitet, an der Kasse genügt der Code. Das entzerrt die Stoßzeit.“

**Kernbotschaft: Click & Collect entlastet den Samstag.**

### 0:17 · Schritt 8 – Festservice (1–2 Min.) – iPhone 1

1. **Festservice** → **Party-Planer**: z. B. 60 Gäste, 5 Stunden, Gartenfest.
2. Vorschlag (Bier, alkoholfrei, Wasser) in den Warenkorb.
3. **Leihartikel**: Bierzeltgarnituren, Kühlschrank, Zapfanlage – mit Verfügbarkeit am Wunschtermin.

> „Die häufigste Frage beim Fest: Wie viel brauche ich? Der Planer gibt die Antwort – und bringt Umsatz mit dem Verleih.“

**Kernbotschaft: Feste planbar machen – mehr Umsatz mit Verleih.**

### 0:18 · Schritt 9 – Markt-Auswertungen (2 Min.) – Laptop

1. **Statistik:** Umsatz, Lieferungen vs. Abholungen, Top-Artikel, B2B-Anteil.
2. **Sortiment:** Preis oder Bestand eines Artikels ändern → erscheint sofort im Shop (iPhone 1 zeigen).
3. **Einstellungen:** Öffnungszeiten, Zeitfenster, Liefergebiete mit Gebühr und Mindestbestellwert.

> „Sie behalten die Hoheit: Preise, Zeiten und Gebiete pflegen Sie selbst – ohne Agentur, ohne Wartezeit.“

**Kernbotschaft: Alles im Griff – mit Zahlen statt Bauchgefühl.**

### 0:20 · Abschluss

> „Das ist eine Web-App: Ihre Kunden brauchen keinen App-Store, nur einen Link oder den QR-Code an der Kasse.
> Im nächsten Schritt würden wir vier bis sechs Wochen mit Ihrem echten Sortiment und ausgewählten Kunden pilotieren.“

Dann: offene Fragen aus [KONZEPT.md](KONZEPT.md), Abschnitt 11 (Öffnungszeiten, Liefergebiete, Warenwirtschaft …).

---

## 5. Plan B

| Problem | Lösung |
|---|---|
| **Keine echte Fahrt möglich / Wetter / Zeit** | Schnellaktion „Tour 1 simulieren“ im Leitfaden (Marktleitung oder Toni). Zeitraffer 8× oder 15×. |
| **GPS wird nicht freigegeben** (kein HTTPS, Standort verweigert) | Simulation verwenden – sie ersetzt die GPS-Position vollständig. |
| **Render schläft noch / lädt langsam** | Adresse aufrufen und 30–60 Sekunden warten; für die Vorführwoche Tarif Starter. |
| **Kein Internet** | ① Hotspot vom iPhone. ② **Lokaler Modus** auf dem Laptop: `https://<adresse>/demo?api=local` – alle Rollen laufen im Browser, Tabs für Anna, Toni und Markt synchronisieren sich live. Voraussetzung: Die App wurde auf dem Laptop vorher einmal online geöffnet (wird dann zwischengespeichert). Karten zeigen nur bereits geladene Ausschnitte. |
| **Server komplett weg** | Lokal auf dem Laptop: `npm run build && npm start` → `http://localhost:8787`; iPhones über den Laptop-Hotspot mit `http://<Laptop-IP>:8787` (ohne GPS → Simulation). |
| **Daten durcheinander** | Leitfaden → „Demo-Daten zurücksetzen“ – alle Geräte zeigen nach wenigen Sekunden den Ausgangsstand. |
| **iPhone abgemeldet / falsche Rolle** | QR-Code im Leitfaden auf dem Beamer scannen oder Demo-Umschalter (Pille unten links). |
| **Ein Schritt funktioniert nicht** | Überspringen, im Leitfaden den nächsten Direkt-Link nutzen. Notfalls **Screenshots** (Plan C) zeigen. |
| **Beamer-Probleme** | Laptop zum Inhaber drehen; das iPhone-Erlebnis trägt die Vorführung auch allein. |

---

## 6. Häufige Fragen – kurze Antworten

| Frage | Antwort |
|---|---|
| Was kostet der Betrieb? | Laufend grob 20–100 € im Monat (Hosting, Domain, Karten, E-Mail); Details im Konzept, Abschnitt 10. |
| Muss ich alle Artikel selbst pflegen? | Im Pilot übernehmen wir den Import Ihrer Artikelliste; langfristig Abgleich mit der Warenwirtschaft. |
| Was ist mit Kunden ohne Smartphone? | Telefon und Laden bleiben selbstverständlich. Angehörige können für ältere Kunden bestellen; eine Erfassung telefonischer Bestellungen durch den Markt ist als Ausbaustufe vorgesehen. |
| Wird der Fahrer überwacht? | Nein – der Standort wird nur während einer gestarteten Tour gesendet und nur für die Lieferung genutzt. |
| Brauchen wir eine App im App-Store? | Nicht nötig. Eine Store-Version ist später ohne Neuentwicklung möglich. |
| Wem gehören die Daten? | Ihnen. Hosting in der EU, Export jederzeit möglich. |
| Wie schnell können wir starten? | Pilot in wenigen Wochen nach Klärung der offenen Fragen, Livegang nach 4–6 Wochen Pilot. |

---

*Alle Personen, Firmen und Bestellungen der Demo sind fiktiv; Preise sind Beispielwerte.*
