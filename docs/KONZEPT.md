# Getränke Altinger digital

**Konzept für eine Bestell-, Liefer- und Markt-App**
Gesprächsgrundlage für das Treffen mit der Getränke-Altinger GmbH · Stand: Oktober 2026

---

## Auf einen Blick

- **Eine App für alle:** Privatkunden, Gastronomie, Büros und Vereine bestellen online – zur Lieferung oder zur
  Abholung im Markt. Fahrer arbeiten mit dem iPhone, der Markt steuert alles über ein Dashboard.
- **Ihr Service, digital verlängert:** Tragservice, Leergut-Rücknahme und persönliche Betreuung bleiben – sie
  werden nur planbarer und für die Kundschaft sichtbar.
- **Sofort startklar:** Web-App (PWA) statt App-Store – läuft auf iPhone, Android und PC, Installation mit zwei Fingertipps.
- **Live-Lieferverfolgung** wie bei den großen Lieferdiensten – aber vom Getränkemarkt aus der Nachbarschaft.
- **Geringe laufende Kosten** (Richtwert: unter 100 € im Monat für Hosting, Domain, Karten und Benachrichtigungen),
  Hosting in der EU, Datenschutz von Anfang an mitgedacht.
- **Weg in den Betrieb:** Vorführung → 4–6 Wochen Pilot mit echten Daten → Livegang → schrittweiser Ausbau.

Die Demo ist voll funktionsfähig und kann während des Gesprächs auf eigenen Geräten ausprobiert werden.

---

## 1. Ausgangslage

**Getränke-Altinger GmbH** · Freisinger Landstraße 19 · 85748 Garching b. München · Tel. 089 3202562

- **Getränkemarkt mit Lieferservice** in Garching – für Privathaushalte, Gastronomie, Unternehmen und Vereine.
- **Hervorragender Ruf:** Laut Branchenverzeichnis **4,9 von 5 Sternen bei 221 Google-Bewertungen**.
  Immer wieder hervorgehoben wird der persönliche Service: **Kisten werden bis zum Auto getragen**,
  **Pfand und Leergut werden zuverlässig erfasst**, die Beratung ist freundlich und kompetent.
- **Starkes Umfeld:** Garching mit dem Forschungscampus der TU München und vielen Studierenden, Gewerbe in
  Hochbrück, Nachbarorte wie Eching, Ismaning und Unterschleißheim sowie der Münchner Norden.
- **Wettbewerb:** Überregionale Online-Lieferdienste haben die Erwartungen verändert – bestellen am Handy,
  Zeitfenster wählen, Lieferung live verfolgen. Lokale Märkte punkten mit Service und Nähe, sind aber online oft
  schwer erreichbar.

**Typische Situation ohne App (bitte im Gespräch bestätigen):** Bestellungen kommen per Telefon, E-Mail, Fax oder
im Markt; Touren werden aus Erfahrung geplant; Kundinnen und Kunden fragen telefonisch nach, wann die Lieferung
kommt; Leergut wird auf Papier notiert; Rechnungen für Geschäftskunden entstehen gesondert.

---

## 2. Ziele

| Ziel | Woran wir es messen |
|---|---|
| Bestellungen strukturiert und rund um die Uhr annehmen | Anteil Online-Bestellungen, weniger Telefon- und Faxbestellungen |
| Lieferungen planbar machen | Bestellungen mit Zeitfenster, Touren je Tag, gefahrene Kilometer je Lieferung |
| Weniger Rückfragen und Leerfahrten | Anrufe „Wann kommt …?“, Fehlfahrten („nicht angetroffen“) |
| Leergut und Pfand transparent | Leergut-Konto je Kunde, Abweichungen bei der Rücknahme |
| Kundschaft binden | wiederkehrende Kunden, Abos/Daueraufträge, Bewertungen |
| Geschäftskunden digital bedienen | B2B-Bestellungen online, Rechnungen digital, Zahlungseingang |
| Samstag entlasten | Click-&-Collect-Abholungen, Wartezeit an der Kasse |

---

## 3. Zielgruppen und Personas

| Persona | Bedarf | Was die App bietet |
|---|---|---|
| **Familie Berger, Garching** – Privathaushalt | Wasser und Bier regelmäßig, schwer zu tragen, wenig Zeit | Lieferung im Zeitfenster, Tragservice, Abo „alle zwei Wochen“, Leergut-Rückgabe, Live-Tracking |
| **Frau Maier, 76** – ältere Kundin | Sicherheit, einfache Bedienung, Hilfe beim Tragen | klare Darstellung mit großen Schaltflächen, Wiederholbestellung mit einem Fingertipp, Bezahlung bar oder EC an der Tür, Telefon bleibt möglich – Angehörige können für sie bestellen |
| **Studierende am TUM-Campus** – WG oder Fachschaft | kleine Budgets, spontane Feiern, kein Auto | Angebote, Click & Collect, Festservice mit Party-Planer, Lieferung in den Campus |
| **Gasthaus Zum Mühlbach** – Gastronomie | feste Lieferrhythmen, Fässer, Rechnung, späte Bestellung am Abend | Nettopreise mit Rabatt/Staffel, Schnellbestellung, Dauerauftrag, Kauf auf Rechnung, Kostenstellen |
| **NordByte GmbH** – Büro im Forschungszentrum | Büro-Getränke, Beleg für die Buchhaltung, mehrere Standorte | Bestellreferenz, Kostenstellen, Lieferstandorte, Sammelrechnungen als PDF |
| **FC Hochbrück** – Verein und Feste | Heimspiele, Vereinsfeste, Leihartikel | Party-Planer (Menge nach Gästezahl), Leihartikel wie Garnituren, Kühlschrank und Zapfanlage mit Verfügbarkeit, Lieferung zum Festplatz |

---

## 4. Funktionsumfang je Rolle

### Kundinnen und Kunden (Handy und PC)

- Sortiment mit Suche, Kategorien und Angeboten; Preise inkl. MwSt., Pfand separat, Grundpreis je Liter
- Warenkorb mit **Leergut-Rückgabe**, Gutscheine, Prüfung des Liefergebiets per Postleitzahl
- **Lieferung** im Zeitfenster (mit Bestellschluss) oder **Abholung im Markt** mit Abholcode und QR-Code
- **Tragservice** bis in die Wohnung als Zusatzleistung
- **Live-Tracking** mit Karte, Ankunftszeit und Benachrichtigungen; Bewertung nach der Lieferung
- Kundenkonto mit Bestellhistorie, Adressen, Favoriten, **Abos**, **Leergut-Konto** und Treuepunkten
- **Festservice:** Leihartikel mit Verfügbarkeitsprüfung und Party-Planer

### Geschäftskunden

- Nettopreise mit Gruppenrabatt oder **Staffelpreisen** (der günstigste Preis gilt automatisch)
- **Schnellbestellung** als Mengenliste, **Daueraufträge**, mehrere **Lieferstandorte**, **Kostenstellen**
- **Kauf auf Rechnung** mit Zahlungsziel, Rechnungsübersicht und Druckansicht
- Online-Antrag „Geschäftskunde werden“ – Freischaltung und Konditionen legt der Markt fest

### Fahrerinnen und Fahrer (iPhone)

- Tagesübersicht, **Ladeliste**, Stopps in optimierter Reihenfolge, Navigation über die Karten-App
- „Tour starten“ benachrichtigt alle Kunden der Tour; Standort wird **nur während der Tour** übertragen
- Am Stopp: „Ich bin da“, **Leergut erfassen**, kassieren (bar/EC), **Unterschrift**, **Foto** als Zustellnachweis,
  „Nicht angetroffen“ mit Grund

### Markt und Disposition (PC oder Tablet)

- Dashboard mit Tageslage; **neue Bestellungen erscheinen live**
- Bestellungen bestätigen, kommissionieren, bereitstellen; Abholungen per Code/QR ausgeben
- **Tourenplanung** mit automatischer Verteilung und **Routenoptimierung**; **Live-Karte** aller Fahrzeuge
- Sortiment, Preise und Bestand; Kunden und B2B-Konditionen; Leergut-Korrekturen
- Rechnungen, Abos und Daueraufträge, **Statistik**
- Einstellungen: Öffnungszeiten, Zeitfenster und Kapazitäten, Liefergebiete mit Gebühren und Mindestbestellwert,
  Gutscheine, Hinweis-Banner

---

## 5. Nutzen für den Markt

| Nutzen | Wie die App hilft |
|---|---|
| **Weniger Telefon- und Fax-Bestellungen** | Bestellungen kommen vollständig und lesbar an – mit Adresse, Zeitfenster, Leergut und Zahlart. Kein Abtippen, keine Missverständnisse. |
| **Planbare Touren** | Zeitfenster mit Kapazitäten und Bestellschluss; Touren werden vorgeschlagen und optimiert. |
| **Weniger Leerfahrten** | Kunden wissen, wann der Fahrer kommt, und werden kurz vorher benachrichtigt – weniger „nicht angetroffen“. |
| **Leergut-Transparenz** | Rückgabe wird bei der Bestellung angekündigt und am Stopp erfasst; jedes Kundenkonto zeigt den Pfandstand. |
| **Kundenbindung** | Abos und Daueraufträge sorgen für planbaren Umsatz; Treuepunkte, Favoriten und Wiederholbestellungen halten Kunden beim Markt. |
| **B2B-Digitalisierung mit Rechnung** | Gastronomie und Büros bestellen selbstständig zu ihren Konditionen; Rechnungen entstehen aus den Lieferungen. |
| **Click & Collect entlastet den Samstag** | Ware wird vorab kommissioniert, an der Kasse genügt der Abholcode – kürzere Schlangen in der Stoßzeit. |
| **Sichtbarkeit** | Eigener Online-Shop unter eigener Adresse, auffindbar und teilbar – ohne Provision an Plattformen. |

**Beispielrechnung (Annahme, bitte mit echten Zahlen ersetzen):** Kommen pro Woche 60 Bestellungen telefonisch
an und dauert jede Annahme samt Notiz 4 Minuten, sind das 4 Stunden pro Woche. Wandert die Hälfte in die App,
gewinnt das Team rund **2 Stunden pro Woche** – zusätzlich zu weniger Rückfragen und Fehlern.

---

## 6. Technik

### Web-App (PWA) statt nativer App

| | **PWA (dieser Vorschlag)** | Native App (App Store / Play Store) |
|---|---|---|
| Verfügbarkeit | sofort über Link oder QR-Code | erst nach Prüfung durch Apple/Google |
| Geräte | iPhone, Android, Tablet, PC – eine Codebasis | getrennte Veröffentlichung je Store |
| Updates | automatisch beim nächsten Öffnen | Store-Freigabe, Nutzer müssen aktualisieren |
| Installation | „Zum Home-Bildschirm“, Vollbild wie eine App | Store-Download |
| Kosten | keine Store-Gebühren | Apple-Entwicklerkonto (99 USD/Jahr), Store-Pflege |
| Benachrichtigungen | Web-Push (auf dem iPhone für installierte Web-Apps), E-Mail/SMS | Push |

**Später optional:** Dieselbe App kann mit **Capacitor** in eine App-Store-Version verpackt werden, falls Sichtbarkeit
im Store gewünscht ist – ohne Neuentwicklung.

### Architektur

```
 Kunden-Handy      Fahrer-iPhone      Markt-PC
      │                  │                │
      └──── HTTPS + Echtzeit (WebSocket) ─┘
                         │
              App-Server (Node.js, EU-Hosting)
              ├─ Fachkern: Preise, Pfand, Zeitfenster, Touren, Berechtigungen
              ├─ Echtzeit: Bestellungen, Fahrerpositionen, Benachrichtigungen
              └─ Datenspeicher (Pilot: Datei · Livebetrieb: Datenbank mit Backup)
                         │
        Karten & Routing (OpenStreetMap)  ·  später: WaWi/Kasse, Zahlung, DATEV
```

- **Echtzeit:** Jede Änderung (neue Bestellung, Tourstart, Fahrerposition) erreicht alle berechtigten Geräte sofort.
- **Ein Fachkern:** Preise, Pfand, Rabatte und Berechtigungen werden an genau einer Stelle berechnet – im Shop,
  in der Kasse, in der Rechnung identisch.
- **Offline-Fähigkeit:** Die App lädt auch bei schwachem Netz; für Vorführungen gibt es einen vollständig lokalen Modus.
- **Sicherheit:** HTTPS, Rollenrechte (Kunde sieht nur eigene Daten, Fahrer nur zugewiesene Touren), keine
  Tracking-Cookies.
- **Bewährte Technik:** React, TypeScript, Node.js, OpenStreetMap – verbreitet, gut wartbar, kein Hersteller-Lock-in.

---

## 7. Datenschutz (DSGVO)

| Thema | Umsetzung |
|---|---|
| **Fahrer-Standort** | Wird **nur während einer aktiven Tour** gesendet und nur dem Markt sowie den Kunden mit Lieferung auf dieser Tour angezeigt. Keine Ortung in Pausen oder nach Feierabend. Fahrer werden vorab informiert; Regelung im Arbeitsvertrag bzw. per Vereinbarung (Beschäftigtendatenschutz). |
| **Hosting in der EU** | Server und Daten in einem EU-Rechenzentrum (z. B. Frankfurt). |
| **Auftragsverarbeitung** | AV-Verträge nach Art. 28 DSGVO mit Hoster, E-Mail/SMS-Dienst und Zahlungsanbieter. |
| **Datensparsamkeit** | Nur Daten, die für Bestellung, Lieferung und Abrechnung nötig sind; keine Werbe-Tracker. Technisch notwendige Speicherung im Browser (Anmeldung, Warenkorb) nach § 25 Abs. 2 TDDDG. |
| **Löschkonzept** | Positionsdaten kurz nach Tourende verdichten bzw. löschen; Zustellfotos und Unterschriften nach einer festgelegten Frist (z. B. 90 Tage); Kundenkonten auf Wunsch löschen; Bestell- und Rechnungsdaten nach den gesetzlichen Aufbewahrungsfristen (AO/HGB). |
| **Transparenz** | Datenschutzerklärung, Verzeichnis von Verarbeitungstätigkeiten, Auskunft und Export für Kunden. |
| **Zugriff** | Persönliche Zugänge für Mitarbeiter, Rollenrechte, Protokoll der Statusänderungen je Bestellung. |

Die genaue Ausgestaltung (Fristen, Rechtsgrundlagen, Texte) stimmen wir mit Ihrem Datenschutzbeauftragten bzw.
Ihrer Steuer- und Rechtsberatung ab.

---

## 8. Integrationen für den Livebetrieb

| Baustein | Zweck | Optionen |
|---|---|---|
| **Warenwirtschaft / Kasse** | Artikel, Preise und Bestände nicht doppelt pflegen; Abholungen an der Kasse buchen | Schnittstelle des vorhandenen Systems oder regelmäßiger CSV-Abgleich |
| **Zahlungsanbieter** | Online-Zahlung (PayPal, Karte, Apple Pay, SEPA) | PayPal, Stripe oder Mollie – Abrechnung direkt auf das Konto des Marktes |
| **DATEV-Export** | Rechnungen und Zahlungen an die Steuerkanzlei | DATEV-Buchungsstapel bzw. Belegexport |
| **Benachrichtigungen** | „Fahrer ist gleich da“, Abholung bereit, Rechnungen | Web-Push, E-Mail, optional SMS für Kunden ohne Smartphone |
| **Routenoptimierung** | Reihenfolge und Fahrzeiten im Echtbetrieb | eigener Routing-Server (OSRM/GraphHopper) oder kommerzieller Dienst |
| **Karten** | Kartenkacheln für Shop, Tracking und Disposition | OpenStreetMap über einen kommerziellen Kachel-Anbieter oder eigener Kachelserver |
| **Rechtstexte** | Impressum, Datenschutz, AGB, Widerrufsbelehrung | Erstellung bzw. Prüfung durch Rechtsberatung |

---

## 9. Roadmap

| Phase | Dauer | Inhalt | Ergebnis |
|---|---|---|---|
| **0 · Vorführung** | jetzt | Demo mit Beispieldaten, Ausprobieren auf eigenen Geräten | gemeinsames Bild, offene Fragen geklärt |
| **1 · Pilot** | 4–6 Wochen | echtes Sortiment und Preise, Liefergebiete und Zeitfenster des Marktes, 1–2 Fahrer, ausgewählte Stamm- und Geschäftskunden, eigene Domain mit HTTPS | Praxiserfahrung, Kennzahlen, Feinschliff |
| **2 · Livegang** | ca. 2 Wochen | Zahlungsanbieter, Rechtstexte, Datenbank mit Backup, Schulung des Teams, Ankündigung im Markt (Plakat/QR-Code an der Kasse, Kassenbon) | App für alle Kunden geöffnet |
| **3 · Ausbau** | laufend | WaWi-/Kassen-Anbindung, DATEV-Export, Web-Push/SMS, Treueprogramm, Vereins- und Festpakete, optional App-Store-Version (Capacitor) | Automatisierung und Wachstum |

---

## 10. Betriebskosten (Schätzung)

Richtwerte pro Monat, netto, Stand 2026 – abhängig von Anbieter und Nutzung, ohne Gewähr:

| Posten | Pilot | Livebetrieb |
|---|---|---|
| Hosting App-Server (EU, z. B. Render oder Hetzner) | 0–10 € | 10–30 € |
| Datenbank mit täglichem Backup | – | 0–20 € |
| Domain (z. B. bestellen.getraenke-altinger.de) | ca. 1–2 € (12–20 € im Jahr) | ca. 1–2 € |
| Karten und Routing | 0 € (Demo-Dienste) | 0–40 € |
| E-Mail-Versand | 0 € | 0–15 € |
| SMS (optional) | – | ca. 7–9 Cent je SMS |
| **Summe** | **unter 15 €** | **ca. 20–100 €** |

Zahlungsanbieter berechnen **Gebühren je Transaktion** (Prozentsatz plus Fixbetrag, je nach Anbieter und Zahlart).
Einmalige Leistungen (Einrichtung, Datenübernahme, Anbindungen, Schulung) werden separat angeboten.

---

## 11. Offene Fragen an den Markt

**Öffnungszeiten**
- Zwei Verzeichnisse nennen unterschiedliche Zeiten: **Mo–Fr 6:30–19:00 / Sa 6:30–14:00** gegenüber
  **Mo–Fr 7:30–20:00 / Sa 7:30–16:00**. Welche gelten aktuell? (Die Demo nutzt die zweite Variante.)
- Gibt es abweichende Zeiten für Lieferungen, Abholungen oder Feiertage?

**Lieferung**
- Liefergebiete (Postleitzahlen/Orte), Liefergebühren und Mindestbestellwert je Gebiet?
- Lieferzeiten und Zeitfenster, Kapazität je Fenster, Bestellschluss (z. B. 90 Minuten vorher oder am Vortag)?
- Tragservice: Preis, Bedingungen (Stockwerk, Aufzug)?
- Wie viele Fahrer und Fahrzeuge, welche Ladekapazität (Kästen je Fahrzeug)?

**Sortiment, Preise, Schnittstelle**
- Welche Warenwirtschaft bzw. welches Kassensystem ist im Einsatz – gibt es eine Schnittstelle oder einen Export?
- Wer pflegt Preise und Angebote, wie oft ändern sie sich? Pfandbeträge je Gebinde?
- Sollen alle Artikel online bestellbar sein oder eine Auswahl?

**Zahlung**
- Welche Zahlarten online (PayPal, Karte, Lastschrift) und an der Tür (bar, EC)?
- Bestehendes Konto bei einem Zahlungsanbieter?

**Geschäftskunden**
- Konditionen: Rabattgruppen, Staffelpreise, Zahlungsziele, Kreditlimits, Kauf auf Rechnung?
- Wie werden Rechnungen heute erstellt und an die Steuerkanzlei übergeben (DATEV)?

**Festservice**
- Bestand an Leihartikeln (Garnituren, Kühlschränke, Zapfanlagen, Gläser), Mietpreise, Kaution, Rückgabe nicht
  angebrochener Ware?

**Organisation**
- Wer im Team betreut Bestellungen und Disposition, wer ist Ansprechpartner für die Einführung?
- Gibt es eine **Filiale in Neufahrn** (laut Verzeichnis Lohweg 25), die einbezogen werden soll?
- Wunschtermin für den Pilot, geeignete Pilotkunden?

---

## 12. Nächste Schritte

1. Vorführung und gemeinsames Ausprobieren (ca. 20 Minuten, siehe Demo-Drehbuch).
2. Offene Fragen klären; Unterlagen erhalten: Artikelliste mit Preisen, Liefergebiete, Konditionen.
3. Pilot vereinbaren: Zeitraum, Pilotkunden, Fahrer, Domain.
4. Angebot für Pilot und Livebetrieb auf Basis der geklärten Anforderungen.

*Alle Namen, Firmen und Bestellungen in der Demo sind fiktiv; Preise sind Beispielwerte.*
