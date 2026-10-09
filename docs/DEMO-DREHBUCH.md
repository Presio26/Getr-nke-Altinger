# Demo-Drehbuch – Vorführung bei Getränke Altinger

**Dauer:** ca. 30 Minuten Vorführung (12 Schritte) + Zeit für Fragen – gekürzt auf die Schritte 1–6 und 11 reichen 15 Minuten.
**Ziel:** Der Inhaber erlebt an echten Geräten, wie eine Bestellung vom iPhone der Kundin über den Markt und den
Fahrer bis zur Haustür läuft – live, ohne Neuladen – und wie Geschäftskunden, Click & Collect, Telefonbestellungen
und der Festservice dazupassen.

Im Leitfaden der App (**`/demo`**) stehen dieselben Schritte als abhakbare Liste mit Direkt-Links, QR-Codes und
Schnellaktionen. Dieses Dokument ergänzt Vorbereitung, Sprechtexte und Plan B.

> **Beschriftungen:** Alles in „Anführungszeichen“ steht genau so in der App (Knöpfe, Tabs, Menüs) – abgeglichen mit
> einem vollständigen Durchlauf als Anna und Toni (iPhone 390 × 844) sowie Marktleitung und Gasthaus (Desktop 1440 × 900).

> **Uhrzeit:** Die Vorführung idealerweise **vor 18 Uhr** beginnen. Danach ist für heute kein Lieferfenster mehr
> frei – die Kasse schlägt dann automatisch den nächsten Termin vor („Heute ist keine Lieferung mehr möglich –
> nächster freier Termin: …“, z. B. morgen 8–10 Uhr). Das funktioniert ebenfalls; Annas neue Bestellung wird dann
> für morgen geplant. Die Live-Fahrt zeigt in jedem Fall Annas **vorbereitete Bestellung auf Tour 1** (heute, Barzahlung).

---

## 1. Geräte und Rollen

| Gerät | Rolle in der App | Wer bedient | Anmelden über |
|---|---|---|---|
| **iPhone 1** | Kundin **Anna Berger** | am besten **der Inhaber selbst** – er bestellt „wie ein Kunde“ | QR-Code „Anna Berger“ im Leitfaden (`/demo?als=u-anna`) |
| **iPhone 2** | Fahrer **Toni Huber**, Tour 1 | Vortragende/r oder Assistenz | QR-Code „Toni Huber“ (`/demo?als=u-toni`) |
| **Laptop, Browserprofil 1** | **Marktleitung** (Markt-Dashboard) | Vortragende/r | „Jetzt öffnen“ bei Marktleitung (`/demo?als=u-admin`) |
| **Laptop, Browserprofil 2** | **Gasthaus Zum Mühlbach** (Schritt 7) | Vortragende/r | „Jetzt öffnen“ bei Gasthaus Zum Mühlbach (`/demo?als=u-gasthaus`) |
| **Beamer/Bildschirm** | spiegelt den Laptop | – | HDMI/USB-C |

**Mehrere Rollen auf einem Gerät:** Jeder Browser-Tab behält seine eigene Anmeldung – Anna, Toni und die
Marktleitung können in Tabs nebeneinander offen sein; ein **neuer** Tab startet mit der zuletzt gewählten Rolle.
Für die Vorführung trotzdem **getrennte Geräte bzw. Browserprofile** verwenden – dann kann nichts verwechselt werden.

**Leitfaden und Rollenwechsel auf dem iPhone:** Die Demo-Pille ist auf dem Handy ausgeblendet (echtes App-Gefühl).
Zugang: **dreimal schnell aufs Logo tippen** (Shop und Fahrer-App) → Demo-Umschalter mit „Demo-Leitfaden“, oder
ganz unten im Seitenfuß „Demo-Leitfaden“ bzw. „Rollen wechseln“, oder den QR-Code erneut scannen.
Am Laptop: Kontomenü → „Demo-Leitfaden & Rollen wechseln“, Tastenkürzel **Alt + D** (Mac: ⌥ D) oder im
Markt-Dashboard links unten „Demo-Leitfaden“ / „Rollen wechseln (Demo)“.

Tipp: Die iPhone-Bildschirme bei Bedarf per AirPlay oder Kamera auf den Beamer bringen – meist reicht es,
das iPhone in die Hand zu geben.

---

## 2. Vorbereitung am Vortag

**Bereitstellung**
- [ ] App auf dem **Hetzner-Server** bereitgestellt (siehe [HETZNER.md](HETZNER.md)), Adresse notiert,
      z. B. `https://altinger-demo.presio.eu`
- [ ] `https://<adresse>/api/health` liefert `"ok": true` und `"mode": "remote"`
- [ ] Am Vortag `./update.sh` auf dem Server ausführen, falls es neue Änderungen gibt
- [ ] Leitfaden `/demo` öffnen: Kopfzeile „Server-Modus“, Schnellaktion „Betriebsmodus“ zeigt „Server“ und „Echtzeit verbunden“

**Daten**
- [ ] Schnellaktionen → „Demo-Daten zurücksetzen“ → „Zurücksetzen“ (Haken „Auch die Haken im Drehbuch zurücksetzen“ an)
- [ ] Kurztest: Anna legt einen Artikel in den Warenkorb, Markt sieht nichts Ungewöhnliches; danach erneut zurücksetzen
- [ ] Hinweis: Die Demo-Daten erneuern sich jeden Tag automatisch (Touren „heute“) – am Morgen der Vorführung ist alles frisch

**iPhones**
- [ ] iPhone 1: QR-Code „Anna Berger“ scannen → in Safari **Teilen → „Zum Home-Bildschirm“** → App vom Home-Bildschirm
      öffnen und ggf. erneut über den QR-Code als Anna anmelden
- [ ] iPhone 2: dasselbe mit „Toni Huber“; beim ersten Tourstart **Standortfreigabe „Beim Verwenden der App erlauben“**
- [ ] Mitteilungen erlauben, falls die App danach fragt
- [ ] **Automatische Sperre: Nie**, Helligkeit hoch, **Nicht stören** an, Ton aus
- [ ] Ladestand 100 %, Ladekabel und Powerbank einpacken

**Laptop**
- [ ] Browserprofil 1 (Marktleitung), Tabs: ① `/admin` (Dashboard), ② `/admin/live` (Live-Karte), ③ `/demo` (Leitfaden)
- [ ] Browserprofil 2 (Gasthaus): `/business`
- [ ] Kamera-Freigabe für „Abholungen“ → „QR scannen“ einmal testen (nur über HTTPS)
- [ ] Zoom auf 110–125 % für den Beamer, Lesezeichenleiste und Benachrichtigungen ausblenden
- [ ] Adapter für den Beamer (HDMI/USB-C), Netzteil
- [ ] **Plan B getestet:** lokaler Start auf dem Laptop (siehe Abschnitt 5)
- [ ] **Plan C:** Screenshots der wichtigsten Ansichten in einem Ordner (siehe Abschnitt 5)

**Unterlagen**
- [ ] [KONZEPT.md](KONZEPT.md) ausgedruckt (2×), Liste der offenen Fragen griffbereit

---

## 3. Am Tag – 15 Minuten vorher

1. Laptop (Marktleitung): `/demo` öffnen → Schnellaktionen → „Demo-Daten zurücksetzen“ → „Zurücksetzen“.
2. Schnellaktion **„Fahrt simulieren“** prüfen: „Tour 1 · Garching Mitte“ steht auf „Geplant“ (Toni Huber, 4 Stopps);
   Einstellungen **„8×“**, **„Stopps automatisch zustellen“ an**, **„Annas Stopp selbst zustellen“ an**
   (werden auf dem Gerät gemerkt).
3. Schnellaktion **„Neue Bestellungen bestätigen“**: Schalter „Neue Bestellungen automatisch bestätigen“ **aus** –
   der Markt bestätigt live.
4. iPhone 1 zeigt den Shop als Anna (Begrüßung mit ihrem Namen), iPhone 2 die Fahrer-App von Toni („Ihre Touren heute“ mit Tour 1).
5. Laptop als Marktleitung auf Tab ① „Dashboard“, Ton an (neue Bestellungen klingeln).
6. Netz prüfen (Besprechungs-WLAN oder Hotspot).

---

## 4. Ablauf

| # | Zeit | Schritt | Gerät | Dauer |
|---|---|---|---|---|
| – | 0:00 | Einstieg | Laptop/Beamer | 1 Min. |
| 1 | 0:01 | Anna bestellt per iPhone | iPhone 1 | 3 Min. |
| 2 | 0:04 | Markt sieht die Bestellung live, bestätigt und plant | Laptop | 3 Min. |
| 3 | 0:07 | Tour 1 fährt los – Simulation mit Annas Stopp | Laptop + iPhone 2 | 2 Min. |
| 4 | 0:09 | Anna verfolgt die Lieferung live | iPhone 1 | 2 Min. |
| 5 | 0:11 | Toni am Stopp: Leergut, Alter, Kassieren, Nachweis | iPhone 2 | 3 Min. |
| 6 | 0:14 | Anna sieht „Zugestellt“ und bewertet | iPhone 1 | 1 Min. |
| 7 | 0:15 | Gasthaus: Schnellbestellung und Rechnung | Laptop (Profil 2) | 3 Min. |
| 8 | 0:18 | Click & Collect mit QR-Code und Leergut an der Theke | iPhone 1 + Laptop | 3 Min. |
| 9 | 0:21 | Telefonbestellung durch den Markt | Laptop | 2 Min. |
| 10 | 0:23 | Festservice mit Party-Planer | iPhone 1 | 2 Min. |
| 11 | 0:25 | Markt: Telefon-Entlastung, Statistik und Preise live | Laptop + iPhone 1 | 3 Min. |
| 12 | 0:28 | Demo-Reset (optional vor den Fragen) | Laptop | 1 Min. |
| – | 0:29 | Abschluss und Fragen | – | – |

Zeitangaben sind kumuliert. **Kernbotschaften** sind fett, Sprechtexte als Vorschlag in Anführungszeichen.

### 0:00 · Einstieg (1 Min.) – Laptop/Beamer

Leitfaden `/demo` zeigen, dann „Zum Shop“.

> „Ihre Kunden schätzen Sie für den Service – Kisten bis zum Auto, Pfand sauber erfasst. Wir haben überlegt, wie
> dieser Service aussieht, wenn Ihre Kunden ihn am Handy bestellen. Alles, was Sie gleich sehen, läuft live –
> mehrere Geräte, dieselben Daten.“

**Kernbotschaft: Ihr Service – jetzt auch digital.**

### 0:01 · Schritt 1 – Anna bestellt per iPhone (3 Min.) – iPhone 1

Klickpfad (Inhaber bedient, Sie leiten an):
1. Tab „Sortiment“ → „Bier“ → „Augustiner Lagerbier Hell“ → mit „+“ auf **2** → „In den Warenkorb“
   (alternativ Direkt-Link „Augustiner Hell“ im Leitfaden).
2. Tab „Warenkorb“ → „Leergut zurückgeben“: 2 × „Bierkasten (20er)“; darunter bei „Einzelflaschen“ 3 × „Bierflasche lose“
   → die „Gutschrift Leergut“ erscheint sofort.
3. „Zur Kasse“ → „Lieferung“ → Lieferadresse „Zuhause“ → unter „Lieferfenster wählen“ ein Fenster antippen
   (nach 18 Uhr ist der nächste freie Termin bereits vorgemerkt).
4. „Tragservice bis in die Wohnung“ einschalten → Zahlungsart „Barzahlung“ → Haken „Ich akzeptiere die AGB …“ →
   „Zahlungspflichtig bestellen“ → „Vielen Dank für Ihre Bestellung!“

> „Preise wie im Markt, Pfand separat, das Leergut – auch einzelne Flaschen – wird gleich mitgenommen, und der
> Tragservice ist ein Klick. Die Bestellung dauert keine Minute.“

**Kernbotschaft: Bestellen so einfach wie bei den Großen – mit Ihrem Service.**

### 0:04 · Schritt 2 – Markt sieht die Bestellung live, bestätigt und plant (3 Min.) – Laptop

1. „Dashboard“: Annas Bestellung steht **ohne Neuladen** oben unter „Neue Bestellungen“ mit dem Kennzeichen „Neu“
   (mit Signalton, sofern der Browser Ton erlaubt; die Glocke zählt hoch).
2. „Bestellungen“ (Board mit „Eingegangen“, „Bestätigt“, „Kommissionierung“, „Bereit / Verladen“ …) → Annas Karte
   anklicken → „Bestätigen“ → „Kommissionierung starten“ → „Als verladen markieren“
   (auf den Karten direkt: „Bestätigen“ → „Kommissionieren“ → „Verladen“; „Kommissionierschein“ im Detail).
3. „Touren“ → Liefertag wählen („Heute“ bzw. nach 18 Uhr „Morgen“) → „Automatisch planen“ → **Vorschau**
   „Touren automatisch planen“ zeigt Fahrer, Stopps, Strecke und Auslastung – erst „Tour übernehmen“
   (bei mehreren: „… Touren übernehmen“) speichert; „Verwerfen“ lässt alles unverändert.
4. Optional bei einer Tour „Optimieren“: Die Reihenfolge ändert sich nur bei echter Verbesserung, sonst
   „Die Reihenfolge ist bereits optimal.“

Hinweis: Die vorbereitete Tour 1 (Toni) mit Annas Bestellung als **erstem Stopp** steht schon – die Live-Fahrt in
Schritt 3–5 funktioniert also unabhängig davon, in welche Tour die neue Bestellung kommt.

> „Kein Zettel, kein Abtippen. Sie sehen Zeitfenster, Leergut und Tragservice auf einen Blick – und die Tour
> plant sich fast von selbst. Sie entscheiden, was übernommen wird.“

**Kernbotschaft: Weniger Telefon, planbare Touren.**

### 0:07 · Schritt 3 – Tour 1 fährt los – Simulation mit Annas Stopp (2 Min.) – Laptop + iPhone 2

1. iPhone 2 (Toni): „Tour 1 · Garching Mitte“ antippen → Tab „Ladeliste“ zeigen („Ladeliste: 0 von 10 Positionen verladen“).
2. Laptop: `/demo` → Schnellaktion „Fahrt simulieren“: „8×“, „Stopps automatisch zustellen“ **an**,
   „Annas Stopp selbst zustellen“ **an** → „Tour 1 simulieren“. Die Tour startet, alle Kunden der Tour erhalten
   die Nachricht „Ihre Bestellung ist unterwegs“.
3. Laptop: Tab ② „Live-Karte“ („Flotte live“) – das Fahrzeug fährt die echte Route; die Karte „Demo-Simulation“
   zeigt Zeitraffer und „außer Anna Berger (Fahrer schließt ab)“.

Die Schnellaktion zeigt den Stand der Simulation: „Unterwegs zu Stopp 1 von 4: Anna Berger“ → „Wartet bei Anna Berger“
(gelb). Die übrigen Stopps stellt die Simulation selbst zu. „Anhalten“ hält das Fahrzeug an, „Simulation fortsetzen“
fährt weiter. Ohne Simulation: in der Fahrer-App „Tour starten“ (echtes GPS, nur über HTTPS).

> „Toni hat alles auf dem Handy: was er laden muss, in welcher Reihenfolge er fährt, und die Navigation.
> Sie sehen im Markt jederzeit, wo das Fahrzeug ist.“

**Kernbotschaft: Volle Übersicht für Fahrer und Markt.**

### 0:09 · Schritt 4 – Anna verfolgt die Lieferung live (2 Min.) – iPhone 1

1. iPhone 1: Tab „Start“ → „Live verfolgen“ (oder Tab „Bestellungen“ → Bestellung mit Status „Unterwegs“).
2. Karte mit Fahrzeug und „Live-Position“, voraussichtliche Ankunft, Stopps davor, Knopf „Anrufen“.
3. Hält das Fahrzeug bei Anna, erscheint „Ihr Fahrer ist da“.

> „Wie bei Paketdiensten – nur vom Getränkemarkt um die Ecke. Kein Anruf mehr: ‚Wann kommt ihr denn?‘“

**Kernbotschaft: Weniger Rückfragen, weniger vergebliche Fahrten.**

### 0:11 · Schritt 5 – Toni am Stopp (3 Min.) – iPhone 2

1. Banner „Fahrzeug ist bei Anna Berger angekommen – bitte Zustellung jetzt abschließen“ → „Zum Abschluss“
   (bzw. Stopp 1 öffnen). Status „Vor Ort“, Anna wurde informiert. Ohne Simulation: „Angekommen“ tippen.
2. Hinweis „Alter prüfen (ab 16 Jahren)“ zeigen – die Lieferung enthält Bier.
3. „Leergut erfassen“: angekündigt 2 × „Bierkasten (20er)“ und 1 × „Wasserkasten Glas (12er)“ – bei „Einzelflaschen“
   → „Erfassen“ → 3 × „Bierflasche lose“ dazu.
4. „Kassieren“: „Zu kassieren“ berücksichtigt das tatsächlich zurückgenommene Leergut („Leergut-Abweichung“) →
   „Bar“ → Betrag „70,00 €“ antippen → **Rückgeld** wird angezeigt.
5. „Empfang bestätigen“: „Alter geprüft – Empfänger ist mindestens 16 Jahre alt“ abhaken, „Name des Empfängers“,
   unterschreiben lassen („Hier unterschreiben“), „Foto aufnehmen“.
6. „Zustellung abschließen“ → die App springt zu Stopp 2, die Simulation fährt automatisch weiter.

> „Jede Lieferung ist dokumentiert – Leergut, Jugendschutz, Betrag, Unterschrift, Foto. Das Leergut-Konto jedes
> Kunden ist damit immer aktuell.“

**Kernbotschaft: Leergut-Transparenz, Jugendschutz und Zustellnachweis ohne Papier.**

### 0:14 · Schritt 6 – Anna sieht „Zugestellt“ und bewertet (1 Min.) – iPhone 1

1. Bestellung zeigt „Zugestellt“, die Leergut-Gutschrift und den „Zustellnachweis“.
2. „Wie war Ihre Lieferung?“ → 5 Sterne → „Bewertung senden“.

**Kernbotschaft: Zufriedene Kunden sagen es Ihnen direkt.**

### 0:15 · Schritt 7 – Gasthaus: Schnellbestellung und Rechnung (3 Min.) – Laptop, Browserprofil 2

Leitfaden → Direkt-Link „Schnellbestellung“ (meldet als **Gasthaus Zum Mühlbach** an).
1. „Geschäftskunden-Portal“ → „Übersicht“: „Offene Posten“, „Leergut-Konto“, Daueraufträge, „Ihre Konditionen“.
2. „Schnellbestellung“: Mengen direkt eintragen – **Nettopreise** mit 8 % Kundenrabatt; z. B. 25 × Augustiner
   Lagerbier Hell → Staffelpreis „ab 25“ greift automatisch („Letzte Bestellung übernehmen“ füllt alles vor).
3. „Kostenstelle“ „Biergarten“, „Ihre Bestellreferenz“ → „Direkt zur Kasse“ → Zahlungsart „Kauf auf Rechnung“ →
   „Zahlungspflichtig bestellen“. Die Kasse zeigt „Nettobetrag 19 %“ und „zzgl. MwSt. 19 %“.
4. „Rechnungen“ → eine Rechnung öffnen: „Warenwert netto“, „Pfand netto“, „Leergut-Rücknahme netto“, „Summe netto“,
   „zzgl. MwSt. 19 %“, „Rechnungsbetrag“ → „Drucken / als PDF speichern“.

> „Die Wirtin bestellt abends nach Küchenschluss in zwei Minuten – zu ihren Konditionen, mit Rechnung.
> Pfand ist umsatzsteuerlich richtig ausgewiesen, die MwSt. wird je Satz auf die Netto-Summe gerechnet.“

**Kernbotschaft: Geschäftskunden digital – mit Rechnung, Konditionen und steuerlich sauberem Pfand.**

### 0:18 · Schritt 8 – Click & Collect (3 Min.) – iPhone 1 + Laptop

1. iPhone 1 (Anna): einen Artikel in den Warenkorb → „Zur Kasse“ → „Abholung im Markt“ → „Abholfenster wählen“ →
   „Barzahlung“ → „Zahlungspflichtig bestellen“.
2. Die Bestellung zeigt **QR-Code** und „Abholcode“ (6 Zeichen).
3. Laptop (Marktleitung): „Abholungen“ → „QR scannen“ → iPhone 1 vor die Laptop-Kamera halten
   (oder den Code eintippen → „Prüfen“).
4. „Leergut annehmen“: z. B. 1 × „Bierkasten (20er)“, der mitgebracht wurde → „Abgeholt“.

> „Am Samstag ist die Ware vorbereitet, an der Kasse genügt der Code – Leergut wird gleich verrechnet.
> Das entzerrt die Stoßzeit.“

**Kernbotschaft: Click & Collect entlastet den Samstag.**

### 0:21 · Schritt 9 – Telefonbestellung durch den Markt (2 Min.) – Laptop

1. „Dashboard“ → „Telefonbestellung“ (Direkt-Link: `/admin/bestellungen?neu=telefon`).
2. „Kunde suchen“: Name oder die letzten Ziffern der Telefonnummer → Enter.
3. Artikel: z. B. „3 augustiner hell“ + Enter – oder ein Vorschlag aus „Zuletzt bestellt“ bzw. „Letzte Bestellung übernehmen“.
4. „Lieferung & Zeitfenster“ wählen, „Leergut-Rückgabe“, „Zahlung & Hinweis“ → „Bestellung anlegen“.
   Telefonbestellungen sind sofort bestätigt und tragen im Board das Kennzeichen „Tel.“.

> „Kunden ohne Smartphone rufen weiter an – aber auch diese Bestellung landet ohne Zettel in Tour, Leergut-Konto
> und Statistik.“

**Kernbotschaft: Telefon bleibt – nur ohne Zettelwirtschaft.**

### 0:23 · Schritt 10 – Festservice (2 Min.) – iPhone 1

1. Startseite → Kachel „Festservice“ (oder Seitenfuß „Festservice & Verleih“) → „Party-Planer starten“.
2. „Datum Ihres Festes“, „Gäste“ (z. B. 60), „Dauer in Stunden“ (5), „Getränke-Mix“ „Zünftig bayerisch“,
   Fass wählen, „Feier im Freien“.
3. „Ihre Empfehlung“ (Liter, Fässer, Kästen) → „Alles in den Warenkorb“ – Getränke auf Kommission.
4. Leihartikel (Bierzeltgarnitur, Kühlschrank, Zapfanlage …) mit Verfügbarkeit am Festtag „Hinzufügen“.

> „Die häufigste Frage beim Fest: Wie viel brauche ich? Der Planer gibt die Antwort – und bringt Umsatz mit dem Verleih.“

**Kernbotschaft: Feste planbar machen – mehr Umsatz mit Verleih.**

### 0:25 · Schritt 11 – Markt: Telefon-Entlastung, Statistik, Preise live (3 Min.) – Laptop + iPhone 1

1. „Dashboard“: Kennzahl **„Telefon-Entlastung“** – z. B. „81 % online“, „… ohne Anruf (14 Tage)“, „≈ … Std. Telefonzeit gespart“.
2. „Statistik“ („Auswertungen“): Umsatz je Tag, „Anteile“ (Lieferung/Abholung, Privat/Geschäft), „Top-Artikel“.
3. „Sortiment“ → „Tegernseer Hell“ → „Verkaufspreis brutto“ ändern → „Speichern“ → **iPhone 1 zeigt den neuen Preis
   sofort**, ohne Neuladen (Produktseite „Tegernseer Hell“ vorher öffnen).
4. „Einstellungen“: „Öffnungszeiten“, „Zeitfenster“, „Liefergebiete“, „Gebühren & Regeln“.

> „Sie behalten die Hoheit: Preise, Zeiten und Gebiete pflegen Sie selbst – ohne Agentur, ohne Wartezeit. Und Sie
> sehen schwarz auf weiß, wie viel Telefonzeit die App spart.“

**Kernbotschaft: Alles im Griff – mit Zahlen statt Bauchgefühl.**

### 0:28 · Schritt 12 – Demo-Reset (1 Min.) – Laptop

Leitfaden → „Demo-Daten zurücksetzen“ → „Zurücksetzen“ (alternativ Markt: „Einstellungen“ → „Demo“). Alle Geräte
zeigen nach wenigen Sekunden den Ausgangsstand; Anmeldungen bleiben erhalten.

### 0:29 · Abschluss

> „Das ist eine Web-App: Ihre Kunden brauchen keinen App-Store, nur einen Link oder den QR-Code an der Kasse.
> Im nächsten Schritt würden wir vier bis sechs Wochen mit Ihrem echten Sortiment und ausgewählten Kunden pilotieren.“

Dann: offene Fragen aus [KONZEPT.md](KONZEPT.md), Abschnitt 11 (Öffnungszeiten, Liefergebiete, Warenwirtschaft …).

---

## 5. Plan B

| Problem | Lösung |
|---|---|
| **Keine echte Fahrt möglich / Wetter / Zeit** | Schnellaktion „Fahrt simulieren“ im Leitfaden (Marktleitung oder Toni): „8×“ oder „15×“, „Stopps automatisch zustellen“ an, „Annas Stopp selbst zustellen“ an. Alternativ Markt: „Live-Karte“ → „Demo-Simulation“ bzw. „Touren“ → „Simulation starten“. |
| **GPS wird nicht freigegeben** (kein HTTPS, Standort verweigert) | Simulation verwenden – sie ersetzt die GPS-Position vollständig. |
| **Kamera-Scan klappt nicht** | Abholcode eintippen → „Prüfen“ – gleiches Ergebnis. |
| **Server antwortet nicht / lädt langsam** | Die App zeigt „Verbinde mit Server …“ und versucht es bis zu einer Minute. Auf dem Server `docker compose ps` bzw. `docker compose restart app` (siehe [HETZNER.md](HETZNER.md)). |
| **Verbindung bricht kurz ab** | Oben erscheint „Keine Verbindung zum Server – wird automatisch erneut versucht“; die App verbindet sich selbst neu und lädt verpasste Änderungen nach. Es wird nie still auf lokale Daten umgeschaltet. |
| **Kein Internet** | ① Hotspot vom iPhone. ② **Laptop als Server** (vorher getestet): `npm run build && npm start` → `http://localhost:8787/demo`; iPhones im Laptop-Hotspot mit `http://<Laptop-IP>:8787` (Adresse beim Start „Im WLAN“; QR-Adresse im Leitfaden mit „Adresse ändern“ anpassen). Ohne HTTPS kein GPS und keine Kamera → Simulation und Code-Eingabe. Kartenkacheln nur, soweit zwischengespeichert. |
| **Nur ein Gerät, kein Server** | **Offline-Demo** auf dem Laptop: lokaler Build ohne festen Modus (`npm run build && npm start`), dann `http://localhost:8787/demo?api=local` – alle Rollen laufen im Browser, Tabs für Anna, Toni und Markt gleichen sich live ab. (Auf dem Server ist der Modus fest `remote` – dort gibt es bewusst keinen lokalen Modus.) |
| **Daten durcheinander** | Leitfaden → „Demo-Daten zurücksetzen“ – alle Geräte zeigen nach wenigen Sekunden den Ausgangsstand. |
| **iPhone abgemeldet / falsche Rolle** | QR-Code im Leitfaden auf dem Beamer scannen oder dreimal aufs Logo tippen → Demo-Umschalter. |
| **Ein Schritt funktioniert nicht** | Überspringen, im Leitfaden den nächsten Direkt-Link nutzen. Notfalls **Screenshots** zeigen. |
| **Beamer-Probleme** | Laptop zum Inhaber drehen; das iPhone-Erlebnis trägt die Vorführung auch allein. |

**Screenshots für Plan C** (am Vortag aufnehmen, iPhone-Hochformat bzw. Laptop): Shop-Startseite, Warenkorb mit
Leergut, Kasse, Bestellbestätigung, Live-Tracking mit Fahrzeug, Fahrer-Tour mit Ladeliste, Fahrer-Stopp (Leergut,
Kassieren, Unterschrift), Markt-Dashboard mit „Telefon-Entlastung“, Bestell-Board, Vorschau „Touren automatisch
planen“, Live-Karte, Abholung mit QR, Telefonbestellung, B2B-Schnellbestellung, Rechnung, Party-Planer, Statistik.

---

## 6. Häufige Fragen – kurze Antworten

| Frage | Antwort |
|---|---|
| Was kostet der Betrieb? | Laufend grob 20–100 € im Monat (Hosting, Domain, Karten, E-Mail); Details im Konzept, Abschnitt 10. |
| Muss ich alle Artikel selbst pflegen? | Im Pilot übernehmen wir den Import Ihrer Artikelliste; langfristig Abgleich mit der Warenwirtschaft. |
| Was ist mit Kunden ohne Smartphone? | Telefon und Laden bleiben. Der Markt erfasst Anrufe als „Telefonbestellung“ im selben System (Schritt 9); Angehörige können für ältere Kunden bestellen. |
| Wie viel Telefon spart das? | Das Dashboard zeigt es: „Telefon-Entlastung“ = Anteil der Bestellungen ohne Anruf und geschätzte gesparte Telefonzeit. |
| Wie ist das mit Alkohol und Jugendschutz? | Enthält eine Lieferung Alkohol, muss der Fahrer die Altersprüfung (ab 16 bzw. 18 Jahren) bestätigen, sonst „Problem“ melden; das steht im Zustellnachweis. |
| Ist das Pfand steuerlich richtig? | Ja: Pfand und Leergut-Gutschrift werden mit dem Steuersatz des Artikels behandelt und auf Rechnungen netto mit MwSt. je Satz ausgewiesen. Bitte mit der Steuerberatung abstimmen. |
| Wird der Fahrer überwacht? | Nein – der Standort wird nur während einer gestarteten Tour gesendet und nur für die Lieferung genutzt. |
| Brauchen wir eine App im App-Store? | Nicht nötig. Eine Store-Version ist später ohne Neuentwicklung möglich. |
| Wem gehören die Daten? | Ihnen. Hosting in der EU, Export jederzeit möglich. |
| Wie schnell können wir starten? | Pilot in wenigen Wochen nach Klärung der offenen Fragen, Livegang nach 4–6 Wochen Pilot. |

---

*Alle Personen, Firmen und Bestellungen der Demo sind fiktiv; Preise sind Beispielwerte.*
