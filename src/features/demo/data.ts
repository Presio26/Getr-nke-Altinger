/**
 * Inhalte des Demo-Leitfadens: Rollen-Karten und Drehbuch.
 * Pfade und IDs passen zu den Demo-Daten aus shared/core/seed (Tour 1 = t-1, Fahrer Toni …).
 */
import type { Role } from '@shared/types';

/** Pseudo-Kennung für „ohne Anmeldung“ (QR-Code /demo?als=gast meldet ab) */
export const GUEST_ID = 'gast';

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
    highlights: ['Bestellen mit Leergut-Rückgabe und Tragservice', 'Lieferung live auf der Karte verfolgen', 'Click & Collect mit Abhol-QR-Code'],
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
    highlights: ['Neue Bestellungen live bestätigen', 'Touren planen und Route optimieren', 'Live-Karte, Abholungen, Statistik'],
  },
  {
    id: 'u-toni',
    group: 'team',
    role: 'driver',
    name: 'Toni Huber',
    description: 'Fahrer · Tour 1 Garching Mitte',
    device: 'iphone',
    color: '#2563eb',
    highlights: ['Ladeliste prüfen und Tour starten', 'GPS-Position live an Markt und Kundin', 'Leergut, Unterschrift und Foto am Stopp'],
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
  /** Klickpfad */
  path: string[];
  /** Kernbotschaft / Sprechtext */
  message: string;
  links: StepLink[];
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'anna-bestellt',
    title: 'Anna bestellt per iPhone',
    who: 'Anna · Privatkundin',
    device: 'iphone',
    minutes: 3,
    summary: 'Lieferung nach Hause – mit Leergut-Rückgabe und Tragservice bis in die Wohnung.',
    path: [
      'Sortiment öffnen, z. B. 2 Kästen Augustiner Lagerbier Hell in den Warenkorb legen',
      'Im Warenkorb die Leergut-Rückgabe eintragen (z. B. 2 leere Bierkästen)',
      'Zur Kasse: Lieferung, heutiges Zeitfenster und Adresse „Zuhause“ wählen',
      'Tragservice zuschalten, Zahlart wählen und verbindlich bestellen',
    ],
    message: 'Bestellen dauert unter einer Minute – Pfand und Leergut werden sauber verrechnet, der Tragservice ist ein Klick.',
    links: [
      { label: 'Sortiment', to: '/sortiment', as: 'u-anna' },
      { label: 'Augustiner Hell', to: '/produkt/augustiner-hell', as: 'u-anna' },
      { label: 'Warenkorb', to: '/warenkorb', as: 'u-anna' },
    ],
  },
  {
    id: 'markt-bestaetigt',
    title: 'Markt sieht die Bestellung live, bestätigt und plant die Tour',
    who: 'Marktleitung',
    device: 'laptop',
    minutes: 2,
    summary: 'Die neue Bestellung erscheint ohne Neuladen im Markt-Dashboard und wird einer Tour zugeordnet.',
    path: [
      'Dashboard: Hinweis „Neue Bestellung“ erscheint sofort',
      'Bestellungen: Annas Bestellung öffnen und bestätigen',
      'Tourenplanung: Bestellung Tour 1 zuordnen (oder automatisch planen)',
      'Route optimieren – Reihenfolge und Fahrzeit werden neu berechnet',
    ],
    message: 'Keine Zettel, kein Abtippen vom Telefon: Bestellungen landen strukturiert im System und die Tour plant sich fast von selbst.',
    links: [
      { label: 'Dashboard', to: '/admin', as: 'u-admin' },
      { label: 'Bestellungen', to: '/admin/bestellungen', as: 'u-admin' },
      { label: 'Tourenplanung', to: '/admin/touren', as: 'u-admin' },
    ],
  },
  {
    id: 'fahrer-startet',
    title: 'Fahrer startet die Tour – oder die Simulation',
    who: 'Toni · Fahrer',
    device: 'iphone',
    minutes: 2,
    summary: 'Toni prüft die Ladeliste und startet Tour 1. Ohne echte Fahrt übernimmt die Simulation die GPS-Position.',
    path: [
      'Fahrer-App: Tour 1 · Garching Mitte öffnen',
      'Ladeliste und Stopps prüfen',
      '„Tour starten“ – alle Kundinnen und Kunden werden benachrichtigt',
      'Alternativ rechts unter Schnellaktionen „Tour 1 simulieren“',
    ],
    message: 'Der Fahrer hat alles auf dem Handy: Ladeliste, Reihenfolge, Navigation. Der Markt sieht jederzeit, wo das Fahrzeug ist.',
    links: [
      { label: 'Fahrer-App', to: '/fahrer', as: 'u-toni' },
      { label: 'Tour 1', to: '/fahrer/tour/t-1', as: 'u-toni' },
      { label: 'Live-Karte (Markt)', to: '/admin/live', as: 'u-admin' },
    ],
  },
  {
    id: 'anna-verfolgt',
    title: 'Anna verfolgt die Lieferung live und bewertet',
    who: 'Anna · Privatkundin',
    device: 'iphone',
    minutes: 2,
    summary: 'Karte mit Fahrzeug, Ankunftszeit und Anzahl der Stopps davor – nach der Zustellung folgt die Bewertung.',
    path: [
      'Meine Bestellungen: aktuelle Bestellung öffnen',
      'Karte zeigt das Fahrzeug in Bewegung und die voraussichtliche Ankunft',
      'Benachrichtigung „Fahrer ist gleich da“ abwarten',
      'Nach der Zustellung mit Sternen bewerten',
    ],
    message: 'Wie bei den großen Lieferdiensten – nur vom eigenen Getränkemarkt um die Ecke. Kein „Wann kommt ihr denn?“-Anruf mehr.',
    links: [
      { label: 'Meine Bestellungen', to: '/bestellungen', as: 'u-anna' },
      { label: 'Benachrichtigungen', to: '/konto/benachrichtigungen', as: 'u-anna' },
    ],
  },
  {
    id: 'fahrer-stopp',
    title: 'Fahrer am Stopp: Leergut, Unterschrift, Foto',
    who: 'Toni · Fahrer',
    device: 'iphone',
    minutes: 2,
    summary: 'Digitaler Liefernachweis statt Papier: Leergut zählen, kassieren, unterschreiben lassen, Foto machen.',
    path: [
      'Tour 1: nächsten Stopp öffnen und „Ich bin da“ tippen',
      'Zurückgenommenes Leergut erfassen – Pfand wird gutgeschrieben',
      'Bei Barzahlung kassieren, Unterschrift auf dem Display',
      'Foto der Abstellung aufnehmen und „Zugestellt“ bestätigen',
    ],
    message: 'Jede Lieferung ist dokumentiert – Leergut, Unterschrift und Foto. Das spart Rückfragen und schafft Transparenz beim Pfand.',
    links: [
      { label: 'Tour 1 (Toni)', to: '/fahrer/tour/t-1', as: 'u-toni' },
      { label: 'Fahrer-App', to: '/fahrer', as: 'u-toni' },
    ],
  },
  {
    id: 'gasthaus',
    title: 'Gasthaus: Schnellbestellung mit Netto- und Staffelpreisen',
    who: 'Gasthaus Zum Mühlbach',
    device: 'laptop',
    minutes: 3,
    summary: 'Geschäftskunden sehen Nettopreise mit Rabatt, bestellen per Mengenmatrix und kaufen auf Rechnung.',
    path: [
      'Geschäftskunden-Portal: Übersicht mit offenen Rechnungen und Daueraufträgen',
      'Schnellbestellung: Mengen direkt in der Liste eintragen – Staffelpreise greifen automatisch',
      'Kostenstelle und Referenz angeben, Zahlart „Rechnung“',
      'Rechnungen: vorhandene Rechnung öffnen und als PDF drucken',
    ],
    message: 'Die Gastronomie bestellt abends in zwei Minuten – ohne Fax und Anrufbeantworter. Rechnungen sind sofort digital verfügbar.',
    links: [
      { label: 'B2B-Portal', to: '/business', as: 'u-gasthaus' },
      { label: 'Schnellbestellung', to: '/business/schnellbestellung', as: 'u-gasthaus' },
      { label: 'Rechnungen', to: '/business/rechnungen', as: 'u-gasthaus' },
    ],
  },
  {
    id: 'click-collect',
    title: 'Click & Collect mit QR-Code und Abholung im Markt',
    who: 'Anna + Marktleitung',
    device: 'iphone',
    minutes: 2,
    summary: 'Online reservieren, im Markt nur noch abholen: Der Markt prüft den QR-Code bzw. Abholcode an der Kasse.',
    path: [
      'Anna: Warenkorb → Kasse → „Abholung im Markt“ mit Abholzeitfenster',
      'Bestelldetail zeigt QR-Code und Abholcode',
      'Markt: Abholungen öffnen, Code eingeben oder scannen',
      'Bestellung als „abgeholt“ markieren',
    ],
    message: 'Click & Collect entzerrt den Samstag: Ware ist vorbereitet, an der Kasse geht es in Sekunden.',
    links: [
      { label: 'Warenkorb (Anna)', to: '/warenkorb', as: 'u-anna' },
      { label: 'Abholungen (Markt)', to: '/admin/abholungen', as: 'u-admin' },
    ],
  },
  {
    id: 'festservice',
    title: 'Festservice mit Party-Planer',
    who: 'Anna oder Gast',
    device: 'any',
    minutes: 2,
    summary: 'Getränkemengen für ein Fest berechnen lassen und Leihartikel wie Garnituren oder Kühlschränke reservieren.',
    path: [
      'Festservice öffnen',
      'Party-Planer: Anzahl Gäste, Dauer und Art des Festes eingeben',
      'Vorschlag prüfen und in den Warenkorb übernehmen',
      'Leihartikel mit Verfügbarkeit am Wunschtermin hinzufügen',
    ],
    message: 'Vom Kindergeburtstag bis zum Vereinsfest: Der Planer nimmt die Unsicherheit bei der Menge – und bringt Umsatz mit Leihartikeln.',
    links: [{ label: 'Festservice', to: '/fest', as: 'u-anna' }],
  },
  {
    id: 'markt-auswertung',
    title: 'Markt: Statistik, Sortiment und Einstellungen',
    who: 'Marktleitung',
    device: 'laptop',
    minutes: 2,
    summary: 'Umsatz, Bestellwege und Top-Artikel auf einen Blick, Sortiment und Bestand pflegen, Liefergebiete einstellen.',
    path: [
      'Statistik: Umsatz, Lieferungen und Abholungen, Top-Artikel',
      'Sortiment: Preis oder Bestand eines Artikels ändern – sofort live im Shop',
      'Einstellungen: Öffnungszeiten, Zeitfenster, Liefergebiete und Gebühren',
    ],
    message: 'Der Markt behält die Hoheit: Preise, Zeiten und Gebiete selbst pflegen – ohne Agentur, ohne Wartezeit.',
    links: [
      { label: 'Statistik', to: '/admin/statistik', as: 'u-admin' },
      { label: 'Sortiment', to: '/admin/sortiment', as: 'u-admin' },
      { label: 'Einstellungen', to: '/admin/einstellungen', as: 'u-admin' },
    ],
  },
];

export const TOTAL_MINUTES = GUIDE_STEPS.reduce((s, step) => s + step.minutes, 0);
