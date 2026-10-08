/**
 * Inhalte des Demo-Leitfadens: Rollen-Karten und Drehbuch.
 * Pfade und IDs passen zu den Demo-Daten aus shared/core/seed (Tour 1 = t-1, Fahrer Toni …).
 */
import type { Role } from '@shared/types';

/** Pseudo-Kennung für „ohne Anmeldung“ (QR-Code /demo?als=gast meldet ab) */
export const GUEST_ID = 'gast';

/** Demo-Daten (shared/core/seed): Kundin Anna Berger und ihre vorbereitete Barzahlungs-Bestellung als erster Stopp auf Tour 1 */
export const ANNA_USER_ID = 'u-anna';
export const ANNA_CUSTOMER_ID = 'c-anna';
export const TOUR1_ID = 't-1';

export type DemoDevice = 'iphone' | 'laptop' | 'tablet' | 'any' | 'beamer';

export const DEVICE_LABEL: Record<DemoDevice, string> = {
  iphone: 'iPhone',
  laptop: 'Laptop',
  tablet: 'Tablet',
  any: 'Handy oder Laptop',
  beamer: 'Beamer',
};

export interface DemoRole {
  /** Demo-User-ID oder GUEST_ID */
  id: string;
  group: 'kunden' | 'team';
  role: Role | null;
  /** Anzeige, falls der Server (noch) keine Demo-Nutzer liefert */
  name: string;
  description: string;
  device: DemoDevice;
  /** Farbe für Avatar/Akzent */
  color: string;
  /** abweichende Rollenbezeichnung (z. B. „Fahrerin“) */
  roleLabel?: string;
  highlights: string[];
}

export const ROLE_COLOR: Record<Role, string> = {
  customer: '#0d9488',
  business: '#1d58a0',
  driver: '#16a34a',
  admin: '#d08300',
};

export const DEMO_ROLES: DemoRole[] = [
  {
    id: 'u-anna',
    group: 'kunden',
    role: 'customer',
    name: 'Anna Berger',
    description: 'Privatkundin aus Garching – Lieferung live verfolgen',
    device: 'iphone',
    color: ROLE_COLOR.customer,
    roleLabel: 'Privatkundin',
    highlights: ['Bestellen mit Leergut-Rückgabe (auch lose Flaschen) und Tragservice', 'Lieferung live auf der Karte verfolgen', 'Click & Collect mit Abhol-QR-Code'],
  },
  {
    id: 'u-gasthaus',
    group: 'kunden',
    role: 'business',
    name: 'Gasthaus Zum Mühlbach',
    description: 'Gastronomie: 8 % Rabatt, Rechnungskauf, Dauerauftrag',
    device: 'laptop',
    color: ROLE_COLOR.business,
    highlights: ['Nettopreise mit Gruppenrabatt und Staffelpreisen', 'Schnellbestellung und Daueraufträge', 'Kauf auf Rechnung mit Rechnungsübersicht'],
  },
  {
    id: 'u-nordbyte',
    group: 'kunden',
    role: 'business',
    name: 'NordByte Software GmbH',
    description: 'Büro-Kunde: Büro-Getränke, Kostenstellen, Rechnungen',
    device: 'laptop',
    color: '#4f46e5',
    highlights: ['Büro-Getränke für das Team', 'Kostenstellen und Bestellreferenzen', 'Rechnungen als Druckansicht'],
  },
  {
    id: GUEST_ID,
    group: 'kunden',
    role: null,
    name: 'Gast ohne Anmeldung',
    description: 'So sieht der Shop für Neukunden aus',
    device: 'any',
    color: '#64748b',
    highlights: ['Sortiment, Angebote und Preise mit Pfand', 'Liefergebiet per Postleitzahl prüfen', 'Festservice mit Party-Planer'],
  },
  {
    id: 'u-admin',
    group: 'team',
    role: 'admin',
    name: 'Marktleitung',
    description: 'Markt & Disposition: Bestellungen, Touren, Live-Karte',
    device: 'laptop',
    color: ROLE_COLOR.admin,
    highlights: ['Neue Bestellungen live bestätigen, Telefonbestellungen erfassen', 'Touren automatisch planen (mit Vorschau) und optimieren', 'Live-Karte, Abholungen mit QR-Scan, Telefon-Entlastung'],
  },
  {
    id: 'u-toni',
    group: 'team',
    role: 'driver',
    name: 'Toni Huber',
    description: 'Fahrer · Tour 1 Garching Mitte',
    device: 'iphone',
    color: '#2563eb',
    highlights: ['Ladeliste prüfen und Tour starten', 'GPS-Position live an Markt und Kundin', 'Leergut, Altersprüfung, Kassieren mit Rückgeld, Unterschrift und Foto'],
  },
  {
    id: 'u-lukas',
    group: 'team',
    role: 'driver',
    name: 'Lukas Brandl',
    description: 'Fahrer · Tour 2 Forschungszentrum & Eching',
    device: 'iphone',
    color: '#16a34a',
    highlights: ['Büros und Campus-Café beliefern', 'Kauf auf Rechnung – kein Kassieren nötig', 'Stopps in optimierter Reihenfolge'],
  },
  {
    id: 'u-ayse',
    group: 'team',
    role: 'driver',
    name: 'Ayşe Demir',
    description: 'Fahrerin · Tour 3 Hochbrück & Ismaning',
    device: 'iphone',
    color: '#db2777',
    roleLabel: 'Fahrerin',
    highlights: ['Fünf Stopps mit Bar- und EC-Zahlung', 'Kassieren direkt an der Haustür', 'Nicht angetroffen? Grund erfassen'],
  },
];

export interface StepLink {
  label: string;
  to: string;
  /** Demo-User-ID (vorher anmelden) oder GUEST_ID (abmelden); leer = aktuelle Anmeldung behalten */
  as?: string;
}

export interface GuideStep {
  id: string;
  title: string;
  /** wer führt vor */
  who: string;
  device: DemoDevice;
  minutes: number;
  summary: string;
  /** Klickpfad – Beschriftungen in „…“ stehen genau so in der App */
  path: string[];
  /** Kernbotschaft / Sprechtext */
  message: string;
  /** Hinweis für die Vorführung (optional) */
  note?: string;
  links: StepLink[];
}

/**
 * Drehbuch der Vorführung. Die zitierten Beschriftungen („…“) sind mit der App abgeglichen
 * (Playwright-Durchlauf als Anna/Toni auf dem iPhone, Marktleitung und Gasthaus am Desktop) –
 * bei Änderungen an der Oberfläche bitte hier und in docs/DEMO-DREHBUCH.md mitziehen.
 */
export const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'anna-bestellt',
    title: 'Anna bestellt per iPhone',
    who: 'Anna · Privatkundin',
    device: 'iphone',
    minutes: 3,
    summary: 'Lieferung nach Hause – mit Leergut-Rückgabe (auch lose Flaschen), Tragservice und Barzahlung.',
    path: [
      '„Sortiment“ → „Bier“ → „Augustiner Lagerbier Hell“: mit „+“ auf 2 Kästen, „In den Warenkorb“',
      '„Warenkorb“ → „Leergut zurückgeben“: 2 × „Bierkasten (20er)“, unter „Einzelflaschen“ 3 × „Bierflasche lose“',
      '„Zur Kasse“ → „Lieferung“, Adresse „Zuhause“, Lieferfenster wählen',
      '„Tragservice bis in die Wohnung“ einschalten, „Barzahlung“, AGB-Haken → „Zahlungspflichtig bestellen“',
    ],
    message: 'Bestellen dauert unter einer Minute – Pfand und Leergut werden sauber verrechnet, der Tragservice ist ein Klick.',
    note: 'Am besten vor 18 Uhr vorführen – danach ist heute kein Lieferfenster mehr frei und die Kasse schlägt automatisch den nächsten Termin vor (z. B. morgen 8–10 Uhr).',
    links: [
      { label: 'Augustiner Hell', to: '/produkt/augustiner-hell', as: 'u-anna' },
      { label: 'Warenkorb', to: '/warenkorb', as: 'u-anna' },
      { label: 'Kasse', to: '/kasse', as: 'u-anna' },
    ],
  },
  {
    id: 'markt-bestaetigt',
    title: 'Markt sieht die Bestellung live, bestätigt und plant',
    who: 'Marktleitung',
    device: 'laptop',
    minutes: 3,
    summary: 'Annas Bestellung erscheint ohne Neuladen im Dashboard. Der Markt bestätigt selbst, kommissioniert und plant die Tour.',
    path: [
      '„Dashboard“: Annas Bestellung steht unter „Neue Bestellungen“ mit „Neu“ (mit Signalton)',
      '„Bestellungen“ → Annas Karte öffnen → „Bestätigen“ → „Kommissionierung starten“ → „Als verladen markieren“',
      '„Touren“ → Liefertag wählen („Heute“/„Morgen“) → „Automatisch planen“: Vorschau prüfen → „Tour übernehmen“',
      'Bei einer Tour „Optimieren“ – die Reihenfolge ändert sich nur, wenn die Route wirklich kürzer wird',
    ],
    message: 'Kein Zettel, kein Abtippen: Bestellungen kommen vollständig an – mit Zeitfenster, Leergut, Tragservice und Zahlart. Die Tour plant sich fast von selbst.',
    note: 'Schalter „Neue Bestellungen automatisch bestätigen“ (Schnellaktionen) bleibt für die Vorführung aus – so bestätigt der Markt live.',
    links: [
      { label: 'Dashboard', to: '/admin', as: 'u-admin' },
      { label: 'Bestellungen', to: '/admin/bestellungen', as: 'u-admin' },
      { label: 'Touren', to: '/admin/touren', as: 'u-admin' },
    ],
  },
  {
    id: 'tour-simulation',
    title: 'Tour 1 fährt los – Simulation mit Annas Stopp',
    who: 'Marktleitung + Toni',
    device: 'laptop',
    minutes: 2,
    summary: 'Toni zeigt Tour 1 und die Ladeliste. Die Simulation fährt die echte Route und hält bei Anna, bis Toni selbst zustellt.',
    path: [
      'Toni (iPhone): „Tour 1 · Garching Mitte“ öffnen, Tab „Ladeliste“ zeigen',
      'Leitfaden → Schnellaktionen „Fahrt simulieren“: „8×“, „Stopps automatisch zustellen“ an, „Annas Stopp selbst zustellen“ an',
      '„Tour 1 simulieren“ – die Tour startet, alle Kunden der Tour werden benachrichtigt',
      'Markt: „Live-Karte“ – das Fahrzeug fährt die echte Route',
    ],
    message: 'Der Fahrer hat alles auf dem Handy: Ladeliste, Reihenfolge, Navigation. Der Markt sieht jederzeit, wo das Fahrzeug ist.',
    note: 'Annas vorbereitete Bestellung ist der erste Stopp auf Tour 1 (Barzahlung). Ohne Simulation: in der Fahrer-App „Tour starten“ (GPS nur über HTTPS).',
    links: [
      { label: 'Tour 1 (Toni)', to: '/fahrer/tour/t-1', as: 'u-toni' },
      { label: 'Live-Karte', to: '/admin/live', as: 'u-admin' },
    ],
  },
  {
    id: 'anna-verfolgt',
    title: 'Anna verfolgt die Lieferung live',
    who: 'Anna · Privatkundin',
    device: 'iphone',
    minutes: 2,
    summary: 'Karte mit Fahrzeug, voraussichtlicher Ankunft und Stopps davor – ohne Neuladen.',
    path: [
      'Startseite → „Live verfolgen“ (oder „Bestellungen“ → Bestellung auf Tour 1)',
      'Karte mit „Live-Position“ des Fahrzeugs und voraussichtlicher Ankunft',
      'Beim Halt erscheint „Ihr Fahrer ist da“',
    ],
    message: 'Wie bei den großen Lieferdiensten – nur vom eigenen Getränkemarkt um die Ecke. Kein „Wann kommt ihr denn?“-Anruf mehr.',
    links: [
      { label: 'Meine Bestellungen', to: '/bestellungen', as: 'u-anna' },
      { label: 'Startseite (Anna)', to: '/', as: 'u-anna' },
    ],
  },
  {
    id: 'fahrer-stopp',
    title: 'Toni am Stopp: Leergut, Alter, Kassieren, Nachweis',
    who: 'Toni · Fahrer',
    device: 'iphone',
    minutes: 3,
    summary: 'Digitaler Liefernachweis statt Papier: Leergut zählen, Alter prüfen, bar kassieren mit Rückgeld, Unterschrift und Foto.',
    path: [
      'Fahrzeug hält bei Anna („Vor Ort“) → Stopp öffnen bzw. „Zum Abschluss“ (ohne Simulation: „Angekommen“)',
      '„Leergut erfassen“: Kästen prüfen, „Einzelflaschen“ → „Erfassen“ → z. B. 3 × „Bierflasche lose“',
      '„Kassieren“: „Bar“, z. B. „70,00 €“ antippen → Rückgeld; „Alter geprüft – Empfänger ist mindestens 16 Jahre alt“ abhaken',
      'Unterschreiben lassen, „Foto aufnehmen“ → „Zustellung abschließen“ – die Simulation fährt weiter',
    ],
    message: 'Jede Lieferung ist dokumentiert – Leergut, Jugendschutz, Betrag, Unterschrift und Foto. Das Leergut-Konto jedes Kunden stimmt immer.',
    links: [
      { label: 'Tour 1 (Toni)', to: '/fahrer/tour/t-1', as: 'u-toni' },
      { label: 'Fahrer-App', to: '/fahrer', as: 'u-toni' },
    ],
  },
  {
    id: 'anna-bewertet',
    title: 'Anna sieht „Zugestellt“ und bewertet',
    who: 'Anna · Privatkundin',
    device: 'iphone',
    minutes: 1,
    summary: 'Status, Zustellnachweis und Leergut-Gutschrift – danach eine Bewertung mit einem Fingertipp.',
    path: ['Bestellung zeigt „Zugestellt“ und den „Zustellnachweis“', '„Wie war Ihre Lieferung?“ → 5 Sterne → „Bewertung senden“'],
    message: 'Zufriedene Kunden sagen es Ihnen direkt – und Sie sehen die Bewertungen im Dashboard.',
    links: [{ label: 'Meine Bestellungen', to: '/bestellungen', as: 'u-anna' }],
  },
  {
    id: 'gasthaus',
    title: 'Gasthaus: Schnellbestellung und Rechnung',
    who: 'Gasthaus Zum Mühlbach',
    device: 'laptop',
    minutes: 3,
    summary: 'Nettopreise mit 8 % Rabatt bzw. Staffelpreis, Bestellmatrix, Kauf auf Rechnung – und eine Rechnung mit MwSt. auch auf das Pfand.',
    path: [
      '„Geschäftskunden-Portal“ → „Übersicht“: Offene Posten, Leergut-Konto, Daueraufträge',
      '„Schnellbestellung“: Mengen direkt eintragen, z. B. 25 × Augustiner (Staffelpreis „ab 25“)',
      '„Kostenstelle“ und „Ihre Bestellreferenz“ → „Direkt zur Kasse“ → „Kauf auf Rechnung“ → „Zahlungspflichtig bestellen“',
      '„Rechnungen“ → Rechnung öffnen: Ware, Pfand und Leergut netto, „zzgl. MwSt. 19 %“ → „Drucken / als PDF speichern“',
    ],
    message: 'Die Gastronomie bestellt abends in zwei Minuten – zu ihren Konditionen, mit sauberer Rechnung. Kein Fax, kein Anrufbeantworter.',
    links: [
      { label: 'B2B-Portal', to: '/business', as: 'u-gasthaus' },
      { label: 'Schnellbestellung', to: '/business/schnellbestellung', as: 'u-gasthaus' },
      { label: 'Rechnungen', to: '/business/rechnungen', as: 'u-gasthaus' },
    ],
  },
  {
    id: 'click-collect',
    title: 'Click & Collect mit QR-Code und Leergut an der Theke',
    who: 'Anna + Marktleitung',
    device: 'iphone',
    minutes: 3,
    summary: 'Online reservieren, im Markt nur noch abholen: Der Markt scannt den QR-Code mit der Kamera oder tippt den Abholcode ein.',
    path: [
      'Anna: Warenkorb → „Zur Kasse“ → „Abholung im Markt“ → Abholfenster → „Zahlungspflichtig bestellen“',
      'Die Bestellung zeigt QR-Code und „Abholcode“',
      'Markt: „Abholungen“ → „QR scannen“ (Kamera) oder Code eintippen → „Prüfen“',
      '„Leergut annehmen“ erfassen → „Abgeholt“',
    ],
    message: 'Click & Collect entzerrt den Samstag: Die Ware ist vorbereitet, an der Kasse geht es in Sekunden – Leergut inklusive.',
    note: 'Kamera-Scan braucht HTTPS (z. B. Render) und die Kamerafreigabe im Browser – sonst den Code eintippen.',
    links: [
      { label: 'Warenkorb (Anna)', to: '/warenkorb', as: 'u-anna' },
      { label: 'Abholungen (Markt)', to: '/admin/abholungen', as: 'u-admin' },
    ],
  },
  {
    id: 'telefon',
    title: 'Telefonbestellung durch den Markt',
    who: 'Marktleitung',
    device: 'laptop',
    minutes: 2,
    summary: 'Stammkunden ohne Smartphone rufen weiter an – der Markt erfasst die Bestellung in einer Minute im selben System.',
    path: [
      '„Dashboard“ → „Telefonbestellung“',
      '„Kunde suchen“ (Name oder die letzten Ziffern der Telefonnummer) → Enter',
      'Artikel suchen, z. B. „3 augustiner hell“ + Enter – oder aus „Zuletzt bestellt“',
      'Lieferfenster und Leergut wählen → „Bestellung anlegen“ (sofort bestätigt, Kennzeichen „Tel.“)',
    ],
    message: 'Telefon bleibt – aber ohne Zettel: Auch Anrufe landen sauber in Touren, Leergut-Konto und Statistik.',
    links: [
      { label: 'Telefonbestellung', to: '/admin/bestellungen?neu=telefon', as: 'u-admin' },
      { label: 'Bestellungen', to: '/admin/bestellungen', as: 'u-admin' },
    ],
  },
  {
    id: 'festservice',
    title: 'Festservice mit Party-Planer',
    who: 'Anna oder Gast',
    device: 'any',
    minutes: 2,
    summary: 'Getränkemengen für ein Fest berechnen lassen und Leihartikel wie Garnituren, Kühlschrank oder Zapfanlage dazubuchen.',
    path: [
      '„Festservice“ → „Party-Planer starten“',
      '„Datum Ihres Festes“, „Gäste“, „Dauer in Stunden“ und „Getränke-Mix“ wählen',
      '„Ihre Empfehlung“ prüfen → „Alles in den Warenkorb“ (Getränke auf Kommission)',
      'Leihartikel mit Verfügbarkeit am Festtag „Hinzufügen“',
    ],
    message: 'Die häufigste Frage beim Fest: Wie viel brauche ich? Der Planer gibt die Antwort – und bringt Umsatz mit dem Verleih.',
    links: [{ label: 'Festservice', to: '/fest', as: 'u-anna' }],
  },
  {
    id: 'markt-auswertung',
    title: 'Markt: Telefon-Entlastung, Statistik und Preise live',
    who: 'Marktleitung',
    device: 'laptop',
    minutes: 3,
    summary: 'Wie viele Bestellungen ohne Anruf kommen, Umsatz und Top-Artikel – und eine Preisänderung, die sofort im Shop steht.',
    path: [
      '„Dashboard“: Kennzahl „Telefon-Entlastung“ – Anteil online, gesparte Telefonzeit',
      '„Statistik“: Umsatz je Tag, Lieferung vs. Abholung, Privat vs. Geschäft, Top-Artikel',
      '„Sortiment“ → z. B. „Tegernseer Hell“ → „Verkaufspreis brutto“ ändern → „Speichern“ – Annas iPhone zeigt den Preis sofort',
      '„Einstellungen“: Öffnungszeiten, Zeitfenster, Liefergebiete, Gebühren',
    ],
    message: 'Sie behalten die Hoheit: Preise, Zeiten und Gebiete pflegen Sie selbst – und sehen in Zahlen, wie viel Telefon die App spart.',
    links: [
      { label: 'Dashboard', to: '/admin', as: 'u-admin' },
      { label: 'Statistik', to: '/admin/statistik', as: 'u-admin' },
      { label: 'Tegernseer Hell', to: '/admin/sortiment/tegernseer-hell', as: 'u-admin' },
    ],
  },
  {
    id: 'demo-reset',
    title: 'Demo-Reset für die nächste Runde',
    who: 'Vortragende/r',
    device: 'laptop',
    minutes: 1,
    summary: 'Ein Klick setzt Bestellungen, Touren und Bestände auf allen Geräten auf den Ausgangsstand zurück.',
    path: ['Schnellaktionen → „Demo-Daten zurücksetzen“ → „Zurücksetzen“', 'Alternativ Markt: „Einstellungen“ → „Demo“ → „Demo-Daten zurücksetzen“'],
    message: 'Alles, was Sie gesehen haben, ist echt – und lässt sich jederzeit neu ausprobieren.',
    links: [{ label: 'Einstellungen', to: '/admin/einstellungen', as: 'u-admin' }],
  },
];

export const TOTAL_MINUTES = GUIDE_STEPS.reduce((s, step) => s + step.minutes, 0);
