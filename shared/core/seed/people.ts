/**
 * Demo-Personen: Fahrer, Kunden (B2C/B2B), Zugänge. Alle Namen sind fiktiv.
 * Die Koordinaten der Tour-Kunden passen exakt zu den Routen in routes.json.
 */
import type { Address, BusinessInfo, Customer, Driver, DemoUser } from '../../types';
import { addDays, berlinDate } from '../../time';
import type { StoredUser } from '../db';
import { PLZ_INFO } from '../geo';
import { int, pick, type Rng } from './prng';
import { STORE_LOCATION } from './settings';

export const DEMO_PASSWORD = 'demo';

/** Demo-Zugänge (Reihenfolge = Anzeige im Demo-Umschalter) */
export const DEMO_USER_INFO: Pick<DemoUser, 'id' | 'description'>[] = [
  { id: 'u-anna', description: 'Privatkundin aus Garching – Lieferung live verfolgen' },
  { id: 'u-gasthaus', description: 'Gastronomie: 8 % Rabatt, Rechnungskauf, Dauerauftrag' },
  { id: 'u-nordbyte', description: 'Büro-Kunde: Büro-Getränke, Kostenstellen, Rechnungen' },
  { id: 'u-toni', description: 'Fahrer · Tour 1 Garching Mitte' },
  { id: 'u-lukas', description: 'Fahrer · Tour 2 Forschungszentrum & Eching' },
  { id: 'u-ayse', description: 'Fahrerin · Tour 3 Hochbrück & Ismaning' },
  { id: 'u-admin', description: 'Markt & Disposition: Bestellungen, Touren, Live-Karte' },
];

export function buildDrivers(now: Date): Driver[] {
  const position = { ...STORE_LOCATION, heading: 0, speed: 0, timestamp: now.toISOString() };
  return [
    { id: 'd-toni', name: 'Toni Huber', phone: '0151 5550 2041', vehicle: 'Mercedes Sprinter · M-GA 2041', color: '#2563eb', status: 'available', capacityCrates: 80, position: { ...position } },
    { id: 'd-lukas', name: 'Lukas Brandl', phone: '0151 5550 2042', vehicle: 'MAN TGE · M-GA 2042', color: '#16a34a', status: 'available', capacityCrates: 80, position: { ...position } },
    { id: 'd-ayse', name: 'Ayşe Demir', phone: '0151 5550 2043', vehicle: 'VW Crafter · M-GA 2043', color: '#db2777', status: 'available', capacityCrates: 60, position: { ...position } },
  ];
}

interface PersonDef {
  id: string;
  name: string;
  contact?: string;
  email: string;
  phone: string;
  street: string;
  zip: string;
  city?: string;
  lat: number;
  lng: number;
  label?: string;
  notes?: string;
  floor?: number;
  elevator?: boolean;
  /** Tage seit Anlage */
  since: number;
  favorites?: string[];
  b2b?: Partial<BusinessInfo> & Pick<BusinessInfo, 'segment' | 'customerNumber' | 'priceGroup' | 'discountPercent'>;
  marketing?: boolean;
  note?: string;
}

/** Routen-Schlüssel (routes.json) → Kunde */
export const ROUTE_KEYS: Record<string, string> = {
  muehlgasse: 'c-anna',
  angermair: 'c-wagner',
  muehlfeld: 'c-hofmann',
  telschow: 'c-gasthaus',
  lichtenberg: 'c-campus',
  meissner: 'c-nordbyte',
  eching: 'c-bauer',
  roemerhof: 'c-schneider',
  heideweg: 'c-klein',
  daimler: 'c-fchochbrueck',
  schleissheimer: 'c-pizzeria',
  ismaning: 'c-wimmer',
};

const NAMED: PersonDef[] = [
  {
    id: 'c-anna', name: 'Anna Berger', email: 'anna.berger@example.com', phone: '0176 5550 1201',
    street: 'Mühlgasse 6', zip: '85748', lat: 48.2484249, lng: 11.6538629, label: 'Zuhause',
    notes: 'Hinterhof, Klingel Berger', floor: 1, elevator: false, since: 420, marketing: true,
    favorites: ['augustiner-hell', 'adelholzener-classic-075', 'paulaner-spezi', 'tegernseer-hell', 'granini-orange'],
  },
  {
    id: 'c-wagner', name: 'Thomas Wagner', email: 'thomas.wagner@example.com', phone: '0176 5550 1202',
    street: 'Professor-Angermair-Ring 40', zip: '85748', lat: 48.2446482, lng: 11.6591768, label: 'Zuhause',
    notes: 'Garage ist offen – Kästen bitte in die Garage stellen', since: 610, favorites: ['tegernseer-hell', 'erdinger-alkoholfrei'],
  },
  {
    id: 'c-hofmann', name: 'Lena Hofmann', email: 'lena.hofmann@example.com', phone: '0176 5550 1203',
    street: 'Mühlfeldweg 4', zip: '85748', lat: 48.2468205, lng: 11.654395, label: 'Zuhause',
    notes: '3. OG links, bitte vorher klingeln', floor: 3, elevator: false, since: 190, marketing: true,
  },
  {
    id: 'c-bauer', name: 'Julia Bauer', email: 'julia.bauer@example.com', phone: '0176 5550 1204',
    street: 'Bahnhofstraße 10', zip: '85386', lat: 48.2988161, lng: 11.6204222, label: 'Zuhause', since: 260,
  },
  {
    id: 'c-schneider', name: 'Familie Schneider', contact: 'Martin Schneider', email: 'martin.schneider@example.com', phone: '0176 5550 1205',
    street: 'Römerhofweg 10', zip: '85748', lat: 48.2501611, lng: 11.6547245, label: 'Zuhause', notes: 'Einfahrt rechts, Hund ist lieb', since: 820,
  },
  {
    id: 'c-klein', name: 'Markus Klein', email: 'markus.klein@example.com', phone: '0176 5550 1206',
    street: 'Heideweg 5', zip: '85748', lat: 48.2497424, lng: 11.6422872, label: 'Zuhause', since: 350,
  },
  {
    id: 'c-wimmer', name: 'Sophie Wimmer', email: 'sophie.wimmer@example.com', phone: '0176 5550 1207',
    street: 'Schloßstraße 6', zip: '85737', city: 'Ismaning', lat: 48.2289349, lng: 11.6736517, label: 'Zuhause', since: 150, marketing: true,
  },
  {
    id: 'c-fischer', name: 'Michael Fischer', email: 'michael.fischer@example.com', phone: '0176 5550 1208',
    street: 'Keltenweg 12', zip: '85748', lat: 48.2499637, lng: 11.6392702, label: 'Zuhause', since: 95,
  },
  {
    id: 'c-koch', name: 'Sabine Koch', email: 'sabine.koch@example.com', phone: '0176 5550 1209',
    street: 'Ismaninger Straße 21', zip: '85748', lat: 48.2417822, lng: 11.6487757, label: 'Zuhause', since: 480,
  },
  {
    id: 'c-richter', name: 'Daniel Richter', email: 'daniel.richter@example.com', phone: '0176 5550 1210',
    street: 'Alexander-Pachmann-Straße 20', zip: '85716', lat: 48.2857461, lng: 11.5789661, label: 'Zuhause', since: 21,
  },
  {
    id: 'c-lehmann', name: 'Katharina Lehmann', email: 'katharina.lehmann@example.com', phone: '0176 5550 1211',
    street: 'Situlistraße 50', zip: '80939', lat: 48.192581, lng: 11.6181243, label: 'Zuhause', notes: 'Hinterhaus, 2. Klingel von oben', since: 12,
  },
  {
    id: 'c-wolf', name: 'Peter Wolf', email: 'peter.wolf@example.com', phone: '0176 5550 1212',
    street: 'Bahnhofstraße 30', zip: '85375', lat: 48.3166316, lng: 11.6624902, label: 'Zuhause', since: 230,
  },
  // ───── Geschäftskunden ─────
  {
    id: 'c-gasthaus', name: 'Gasthaus Zum Mühlbach', contact: 'Franz Obermaier', email: 'einkauf@gasthaus-muehlbach.de', phone: '089 5550 4410',
    street: 'Telschowstraße 4', zip: '85748', lat: 48.2503492, lng: 11.6501206, label: 'Gaststätte',
    notes: 'Anlieferung über den Hof, Kellerabgang links', since: 1460,
    favorites: ['augustiner-hell', 'augustiner-edelstoff', 'adelholzener-classic-075', 'paulaner-spezi', 'augustiner-hell-fass-30'],
    b2b: {
      segment: 'gastronomie', customerNumber: 'K-20117', priceGroup: 'gastro', discountPercent: 8, vatId: 'DE298114577',
      paymentTermsDays: 14, creditLimit: 500000, allowInvoice: true, freeDelivery: true,
      costCenters: ['Küche', 'Schank', 'Biergarten'], status: 'active', accountManager: 'Sabine Lechner (Gastro-Service)',
    },
    note: 'Stammkunde seit vielen Jahren. Biergarten-Saison April bis September – dann deutlich höhere Mengen.',
  },
  {
    id: 'c-campus', name: 'Campus Café Garching', contact: 'Miriam Seitz', email: 'cafe@campus-cafe-garching.example', phone: '089 5550 4420',
    street: 'Lichtenbergstraße 8', zip: '85748', lat: 48.2686442, lng: 11.6645205, label: 'Café',
    notes: 'Anlieferung Hintereingang über die Rampe', since: 900,
    b2b: {
      segment: 'gastronomie', customerNumber: 'K-20121', priceGroup: 'gastro_plus', discountPercent: 10, vatId: 'DE301557902',
      paymentTermsDays: 14, creditLimit: 300000, allowInvoice: true, freeDelivery: true, costCenters: ['Café', 'Catering'], status: 'active',
    },
  },
  {
    id: 'c-nordbyte', name: 'NordByte Software GmbH', contact: 'Julia Reiter', email: 'office@nordbyte.example', phone: '089 5550 4430',
    street: 'Walther-Meißner-Straße 3', zip: '85748', lat: 48.2651173, lng: 11.6738972, label: 'Büro',
    notes: 'Empfang 2. OG, Lastenaufzug im Treppenhaus', floor: 2, elevator: true, since: 540,
    favorites: ['adelholzener-naturell-075', 'club-mate', 'fritz-kola', 'adelholzener-apfelschorle'],
    b2b: {
      segment: 'buero', customerNumber: 'K-20133', priceGroup: 'standard', discountPercent: 3, vatId: 'DE318640021',
      paymentTermsDays: 30, creditLimit: 200000, allowInvoice: true, freeDelivery: false,
      costCenters: ['Office München-Nord', 'Events'], status: 'active',
    },
  },
  {
    id: 'c-fchochbrueck', name: 'FC Hochbrück 09 e.V.', contact: 'Hans Rieder', email: 'kasse@fc-hochbrueck.example', phone: '089 5550 4440',
    street: 'Daimlerstraße 5', zip: '85748', city: 'Garching-Hochbrück', lat: 48.2477318, lng: 11.6304554, label: 'Vereinsheim',
    notes: 'Zufahrt über den Parkplatz, Kühlraum neben der Umkleide', since: 1100,
    b2b: {
      segment: 'verein', customerNumber: 'K-20125', priceGroup: 'verein', discountPercent: 6,
      paymentTermsDays: 14, creditLimit: 100000, allowInvoice: false, freeDelivery: false, costCenters: ['Vereinsheim', 'Sommerfest'], status: 'active',
    },
  },
  {
    id: 'c-pizzeria', name: 'Pizzeria Bella Isar', contact: 'Giuseppe Moretti', email: 'info@bella-isar.example', phone: '089 5550 4450',
    street: 'Schleißheimer Straße 30', zip: '85748', lat: 48.2503565, lng: 11.6460936, label: 'Restaurant', since: 700,
    b2b: {
      segment: 'gastronomie', customerNumber: 'K-20129', priceGroup: 'gastro', discountPercent: 8,
      paymentTermsDays: 14, creditLimit: 150000, allowInvoice: false, freeDelivery: false, costCenters: [], status: 'active',
    },
  },
];

/** weitere Geschäftskunden ohne Zugang (Historie, Kundenliste) */
const EXTRA_B2B: { id: string; name: string; contact: string; segment: BusinessInfo['segment']; group: BusinessInfo['priceGroup']; pct: number; nr: string; street: string; zip: string; status?: BusinessInfo['status']; since: number }[] = [
  { id: 'c-hotel', name: 'Hotel Isarblick Garching', contact: 'Sandra Kölbl', segment: 'hotel', group: 'gastro', pct: 8, nr: 'K-20136', street: 'Bürgermeister-Amann-Straße 12', zip: '85748', since: 980 },
  { id: 'c-kanzlei', name: 'Kanzlei Reindl & Partner', contact: 'Dr. Stefan Reindl', segment: 'buero', group: 'standard', pct: 3, nr: 'K-20138', street: 'Bürgerplatz 7', zip: '85748', since: 410 },
  { id: 'c-tennis', name: 'TC Garching-Nord e.V.', contact: 'Petra Lindner', segment: 'verein', group: 'verein', pct: 6, nr: 'K-20140', street: 'Untere Straße 40', zip: '85748', since: 1300 },
  { id: 'c-metzgerei', name: 'Metzgerei Hartl', contact: 'Josef Hartl', segment: 'handel', group: 'standard', pct: 0, nr: 'K-20142', street: 'Freisinger Landstraße 8', zip: '85748', since: 1700 },
  { id: 'c-techlab', name: 'TechLab Hochbrück GmbH', contact: 'Nina Albrecht', segment: 'buero', group: 'standard', pct: 3, nr: 'K-20144', street: 'Carl-von-Linde-Straße 15', zip: '85748', since: 320 },
  { id: 'c-sonnenschein', name: 'Café Sonnenschein Eching', contact: 'Marion Huber', segment: 'gastronomie', group: 'standard', pct: 0, nr: 'K-20146', street: 'Untere Hauptstraße 3', zip: '85386', status: 'pending', since: 1 },
];
export const LAST_CUSTOMER_NUMBER = 20146;

const EXTRA_B2C_NAMES = [
  'Stefan Maier', 'Claudia Wenger', 'Markus Brandstetter', 'Andreas Lechner', 'Monika Steiner', 'Florian Gruber',
  'Christina Pichler', 'Sabrina Moser', 'Tobias Hofer', 'Verena Kraus', 'Matthias Bichler', 'Elisabeth Rauch',
  'Benedikt Seidl', 'Theresa Lang', 'Sebastian Winkler', 'Kathrin Baumann', 'Dominik Schuster', 'Lisa Fuchs',
  'Maximilian Ertl', 'Johanna Auer', 'Korbinian Mayr', 'Magdalena Wild', 'Quirin Holzer', 'Franziska Ostermeier',
  'Leonhard Brunner', 'Veronika Kainz', 'Simon Thaler', 'Barbara Hölzl', 'Georg Schmid', 'Carina Obermeier',
];

const STREETS: Record<string, string[]> = {
  '85748': [
    'Bürgermeister-Amann-Straße', 'Untere Straße', 'Egerlandstraße', 'Riemerfeldring', 'Lärchenweg', 'Watzmannstraße',
    'Am Mühlbach', 'Brunnenweg', 'Ludwig-Prandtl-Straße', 'Zugspitzstraße', 'Wettersteinstraße', 'Karwendelstraße',
    'Kirchenstraße', 'Uhlandstraße', 'Goethestraße', 'Schillerstraße', 'Kopernikusstraße', 'Hochbrücker Straße',
  ],
  '85386': ['Untere Hauptstraße', 'Danziger Straße', 'Heidestraße'],
  '85737': ['Freisinger Straße', 'Aschheimer Straße', 'Seidl-Kreuz-Straße'],
  '85716': ['Bezirksstraße', 'Landshuter Straße', 'Siemensstraße'],
  '85375': ['Echinger Straße', 'Grünecker Straße'],
  '85764': ['Feierabendstraße', 'Mittenheimer Straße'],
  '80939': ['Heidemannstraße', 'Freimanner Bahnhofstraße'],
};

function asciiMail(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z ]/g, '')
    .trim()
    .replace(/\s+/g, '.');
}

function address(id: string, d: Pick<PersonDef, 'name' | 'street' | 'zip' | 'city' | 'lat' | 'lng' | 'label' | 'notes' | 'floor' | 'elevator'>): Address {
  const a: Address = {
    id,
    label: d.label ?? 'Zuhause',
    name: d.name,
    street: d.street,
    zip: d.zip,
    city: d.city ?? PLZ_INFO[d.zip]?.city ?? 'Garching b. München',
    lat: d.lat,
    lng: d.lng,
  };
  if (d.notes) a.notes = d.notes;
  if (d.floor !== undefined) a.floor = d.floor;
  if (d.elevator !== undefined) a.hasElevator = d.elevator;
  return a;
}

function createdAt(today: string, daysAgo: number, rng: Rng): string {
  return berlinDate(addDays(today, -daysAgo), `${String(int(rng, 8, 20)).padStart(2, '0')}:${String(int(rng, 0, 59)).padStart(2, '0')}`).toISOString();
}

function businessInfo(name: string, b: NonNullable<PersonDef['b2b']>): BusinessInfo {
  const info: BusinessInfo = {
    companyName: name,
    segment: b.segment,
    customerNumber: b.customerNumber,
    priceGroup: b.priceGroup,
    discountPercent: b.discountPercent,
    paymentTermsDays: b.paymentTermsDays ?? 14,
    creditLimit: b.creditLimit ?? 0,
    allowInvoice: b.allowInvoice ?? false,
    freeDelivery: b.freeDelivery ?? false,
    costCenters: b.costCenters ?? [],
    status: b.status ?? 'active',
  };
  if (b.vatId) info.vatId = b.vatId;
  if (b.accountManager) info.accountManager = b.accountManager;
  return info;
}

/** Alle Demo-Kunden (benannte + weitere für Historie und Kundenliste) */
export function buildCustomers(today: string, rng: Rng): Customer[] {
  const out: Customer[] = [];
  for (const d of NAMED) {
    const short = d.id.replace(/^c-/, '');
    const a = address(`a-${short}`, { ...d, name: d.b2b ? d.name : d.contact ?? d.name });
    const c: Customer = {
      id: d.id,
      type: d.b2b ? 'b2b' : 'b2c',
      name: d.name,
      contactName: d.contact ?? d.name,
      email: d.email,
      phone: d.phone,
      addresses: [a],
      defaultAddressId: a.id,
      favorites: [...(d.favorites ?? [])],
      loyaltyPoints: 0,
      depositBalance: {},
      createdAt: createdAt(today, d.since, rng),
    };
    if (d.marketing) c.marketingOptIn = true;
    if (d.b2b) c.b2b = businessInfo(d.name, d.b2b);
    if (d.note) c.internalNote = d.note;
    out.push(c);
  }
  for (const x of EXTRA_B2B) {
    const center = PLZ_INFO[x.zip].center;
    const a = address(`a-${x.id.replace(/^c-/, '')}`, {
      name: x.name,
      street: x.street,
      zip: x.zip,
      lat: Math.round((center.lat + (rng() - 0.5) * 0.008) * 1e7) / 1e7,
      lng: Math.round((center.lng + (rng() - 0.5) * 0.012) * 1e7) / 1e7,
      label: 'Firma',
    });
    const c: Customer = {
      id: x.id,
      type: 'b2b',
      name: x.name,
      contactName: x.contact,
      email: `info@${asciiMail(x.name.split(' ').slice(0, 2).join(' ')).replace(/\./g, '-')}.example`,
      phone: `089 5550 ${4500 + out.length}`,
      addresses: [a],
      defaultAddressId: a.id,
      favorites: [],
      loyaltyPoints: 0,
      depositBalance: {},
      createdAt: createdAt(today, x.since, rng),
      b2b: businessInfo(x.name, {
        segment: x.segment,
        customerNumber: x.nr,
        priceGroup: x.group,
        discountPercent: x.pct,
        paymentTermsDays: 14,
        creditLimit: x.status === 'pending' ? 0 : 100000,
        allowInvoice: false,
        freeDelivery: false,
        costCenters: [],
        status: x.status ?? 'active',
      }),
    };
    if (x.status === 'pending') c.internalNote = 'Nachricht zum Antrag: Wir eröffnen im November und suchen einen festen Getränkelieferanten.';
    out.push(c);
  }
  EXTRA_B2C_NAMES.forEach((name, i) => {
    const zip = i % 10 < 7 ? '85748' : pick(rng, ['85386', '85737', '85716', '85375', '85764', '80939']);
    const center = PLZ_INFO[zip].center;
    const id = `c-k${String(i + 1).padStart(2, '0')}`;
    const a = address(`a-k${String(i + 1).padStart(2, '0')}`, {
      name,
      street: `${pick(rng, STREETS[zip])} ${int(rng, 1, 48)}`,
      zip,
      lat: Math.round((center.lat + (rng() - 0.5) * 0.009) * 1e7) / 1e7,
      lng: Math.round((center.lng + (rng() - 0.5) * 0.013) * 1e7) / 1e7,
    });
    // vier Neukunden in den letzten 30 Tagen
    const since = i % 8 === 3 ? int(rng, 2, 28) : int(rng, 40, 900);
    out.push({
      id,
      type: 'b2c',
      name,
      contactName: name,
      email: `${asciiMail(name)}@example.com`,
      phone: `0176 5550 ${String(1300 + i)}`,
      addresses: [a],
      defaultAddressId: a.id,
      favorites: [],
      loyaltyPoints: 0,
      depositBalance: {},
      createdAt: createdAt(today, since, rng),
      ...(rng() < 0.4 ? { marketingOptIn: true } : {}),
    });
  });
  return out;
}

export function buildUsers(customers: Customer[], today: string): StoredUser[] {
  const since = (id: string, fallbackDays: number) => customers.find((c) => c.id === id)?.createdAt ?? berlinDate(addDays(today, -fallbackDays), '09:00').toISOString();
  const staff = berlinDate(addDays(today, -800), '08:00').toISOString();
  return [
    { id: 'u-anna', role: 'customer', name: 'Anna Berger', email: 'anna.berger@example.com', phone: '0176 5550 1201', customerId: 'c-anna', createdAt: since('c-anna', 420), password: DEMO_PASSWORD },
    { id: 'u-gasthaus', role: 'business', name: 'Gasthaus Zum Mühlbach', email: 'einkauf@gasthaus-muehlbach.de', phone: '089 5550 4410', customerId: 'c-gasthaus', createdAt: since('c-gasthaus', 900), password: DEMO_PASSWORD },
    { id: 'u-nordbyte', role: 'business', name: 'NordByte Software GmbH', email: 'office@nordbyte.example', phone: '089 5550 4430', customerId: 'c-nordbyte', createdAt: since('c-nordbyte', 540), password: DEMO_PASSWORD },
    { id: 'u-toni', role: 'driver', name: 'Toni Huber', email: 'toni@altinger.example', phone: '0151 5550 2041', driverId: 'd-toni', createdAt: staff, password: DEMO_PASSWORD },
    { id: 'u-lukas', role: 'driver', name: 'Lukas Brandl', email: 'lukas@altinger.example', phone: '0151 5550 2042', driverId: 'd-lukas', createdAt: staff, password: DEMO_PASSWORD },
    { id: 'u-ayse', role: 'driver', name: 'Ayşe Demir', email: 'ayse@altinger.example', phone: '0151 5550 2043', driverId: 'd-ayse', createdAt: staff, password: DEMO_PASSWORD },
    { id: 'u-admin', role: 'admin', name: 'Marktleitung', email: 'markt@altinger.example', phone: '089 3202562', createdAt: staff, password: DEMO_PASSWORD },
  ];
}
