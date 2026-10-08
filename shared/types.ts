/**
 * Domänenmodell der Getränke-Altinger-App.
 *
 * Konventionen:
 *  - Geldbeträge sind IMMER ganzzahlige Cent-Beträge (number). 1999 = 19,99 €.
 *  - Zeitpunkte sind ISO-8601-Strings (z. B. "2026-10-08T14:30:00.000Z").
 *  - Kalendertage sind "YYYY-MM-DD", Uhrzeiten "HH:mm" (lokale Zeit Europe/Berlin).
 *  - Koordinaten als { lat, lng } bzw. Tupel [lat, lng] (LatLng).
 *  - Alle Texte für Endkunden sind auf Deutsch.
 */

export type ID = string;
export type ISODate = string; // "2026-10-08T14:30:00.000Z"
export type DayString = string; // "2026-10-08"
export type TimeString = string; // "14:30"
export type LatLng = [number, number]; // [lat, lng]

// ───────────────────────────── Nutzer & Rollen ─────────────────────────────

/** customer = Privatkunde (B2C), business = Geschäftskunde (B2B), driver = Fahrer, admin = Markt/Disposition */
export type Role = 'customer' | 'business' | 'driver' | 'admin';

export interface User {
  id: ID;
  role: Role;
  name: string;
  email: string;
  phone?: string;
  /** für customer/business: verknüpfter Kunde */
  customerId?: ID;
  /** für driver: verknüpfter Fahrer */
  driverId?: ID;
  createdAt: ISODate;
}

export interface Session {
  token: string;
  user: User;
}

export interface DemoUser {
  id: ID;
  role: Role;
  name: string;
  email: string;
  /** kurze Beschreibung für den Demo-Umschalter, z. B. "Privatkundin aus Garching" */
  description: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  address?: AddressInput;
}

/** Antrag auf Geschäftskundenkonto (wird vom Markt freigeschaltet). */
export interface BusinessRequestInput {
  companyName: string;
  contactName: string;
  email: string;
  password: string;
  phone: string;
  vatId?: string;
  segment: BusinessSegment;
  address: AddressInput;
  message?: string;
}

// ───────────────────────────── Adressen & Geo ─────────────────────────────

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Address extends GeoPoint {
  id: ID;
  /** z. B. "Zuhause", "Büro", "Gaststätte" */
  label: string;
  /** Empfängername auf dem Lieferschein */
  name: string;
  street: string; // "Mühlgasse 6"
  zip: string; // "85748"
  city: string; // "Garching b. München"
  /** Hinweise für Fahrer, z. B. "Hinterhof, Klingel Berger" */
  notes?: string;
  floor?: number; // 0 = EG
  hasElevator?: boolean;
}

/** Eingabe für neue/geänderte Adresse. Fehlen lat/lng, ermittelt der Core eine Näherung über die PLZ. */
export type AddressInput = Omit<Address, 'id' | 'lat' | 'lng'> & {
  id?: ID;
  lat?: number;
  lng?: number;
};

export interface GeoPosition extends GeoPoint {
  /** Fahrtrichtung in Grad (0 = Nord), falls bekannt */
  heading?: number;
  /** m/s */
  speed?: number;
  /** Genauigkeit in Metern */
  accuracy?: number;
  timestamp: ISODate;
  /** true, wenn die Position aus der Demo-Simulation stammt */
  simulated?: boolean;
}

export type GeoPositionInput = Omit<GeoPosition, 'timestamp' | 'simulated'> & { timestamp?: ISODate };

// ───────────────────────────── Sortiment ─────────────────────────────

export interface Category {
  id: ID; // "bier"
  name: string; // "Bier"
  /** Name eines lucide-react Icons, z. B. "Beer" */
  icon: string;
  /** Hex-Farbe für Kacheln */
  color: string;
  description: string;
  sort: number;
}

export type Material = 'glas' | 'pet' | 'dose' | 'fass' | 'tetra' | 'sonstiges';

/** Pfandart, z. B. "Bierkasten 20 × 0,5 l" = 3,10 € */
export interface DepositType {
  id: ID; // "kasten-bier-20"
  name: string; // "Bierkasten 20 × 0,5 l (Mehrweg)"
  /** kurzer Name für Leergut-Eingaben, z. B. "Bierkasten (20er)" */
  shortName: string;
  /** Pfandbetrag in Cent pro Gebinde (inkl. Flaschen) */
  amount: number;
  /** Ob dieses Leergut als ganzer Kasten zurückgegeben werden kann (für Leergut-Rückgabe-Auswahl) */
  returnable: boolean;
}

export interface TierPrice {
  /** ab dieser Menge (Gebinde) */
  minQty: number;
  /** Netto-Stückpreis in Cent */
  priceNet: number;
}

export interface ProductOffer {
  /** Angebotspreis brutto in Cent */
  priceGross: number;
  validUntil: DayString;
  label?: string; // "Angebot der Woche"
}

export interface Product {
  id: ID;
  sku: string; // Artikelnummer
  /** EAN/GTIN – optional, Demo */
  ean?: string;
  name: string; // "Lagerbier Hell"
  brand: string; // "Augustiner"
  categoryId: ID;
  description: string;
  /** Gebinde-Text, z. B. "20 × 0,5 l Glas" */
  packaging: string;
  /** Anzahl Einheiten im Gebinde (Flaschen/Dosen); bei Fass/Leihartikel 1 */
  unitCount: number;
  /** Volumen pro Einheit in Litern (0 bei Leihartikeln) */
  unitVolumeL: number;
  material: Material;
  /** Verkaufspreis brutto (inkl. MwSt.) pro Gebinde in Cent – Privatkundenpreis */
  priceGross: number;
  /** MwSt.-Satz in Prozent */
  vatRate: 19 | 7;
  /** Verweis auf DepositType, falls pfandpflichtig */
  depositTypeId?: ID;
  /** Alkoholgehalt in % vol */
  alcoholPercent?: number;
  /** z. B. 'regional', 'bio', 'alkoholfrei', 'neu', 'vegan', 'glutenfrei', 'bestseller' */
  tags: string[];
  /** Bestand in Gebinden (bei Leihartikeln: Anzahl vorhandener Leihartikel) */
  stock: number;
  /** Meldebestand */
  minStock: number;
  active: boolean;
  offer?: ProductOffer;
  /** B2B-Staffelpreise (netto) */
  tierPrices?: TierPrice[];
  /** Herkunft, z. B. "München", "Tegernsee" */
  origin?: string;
  /** Primärfarbe der Illustration (Hex) */
  color: string;
  /** Sekundärfarbe der Illustration (Hex) */
  accent: string;
  /** Leihartikel für Feste (Bierzeltgarnitur, Zapfanlage, …) – Preis gilt pro Veranstaltung */
  isRental?: boolean;
  /** Ø Kundenbewertung 1–5 */
  rating?: number;
  /** Lagerplatz im Markt, z. B. "Gang 3" */
  location?: string;
}

/** Eingabe für Anlegen/Bearbeiten im Admin. Ohne id = neu. */
export type ProductInput = Omit<Product, 'id'> & { id?: ID };

// ───────────────────────────── Kunden ─────────────────────────────

export type CustomerType = 'b2c' | 'b2b';
export type BusinessSegment = 'gastronomie' | 'buero' | 'verein' | 'hotel' | 'handel' | 'sonstiges';
export type PriceGroup = 'standard' | 'gastro' | 'gastro_plus' | 'verein';

export interface BusinessInfo {
  companyName: string;
  segment: BusinessSegment;
  vatId?: string;
  /** Kundennummer, z. B. "K-20117" */
  customerNumber: string;
  priceGroup: PriceGroup;
  /** Rabatt in Prozent auf Netto-Listenpreise (Staffelpreise haben Vorrang, wenn günstiger) */
  discountPercent: number;
  /** Zahlungsziel in Tagen */
  paymentTermsDays: number;
  /** Kreditlimit in Cent */
  creditLimit: number;
  /** Kauf auf Rechnung erlaubt */
  allowInvoice: boolean;
  /** Lieferung immer frei Haus */
  freeDelivery: boolean;
  costCenters: string[];
  /** Freischaltungsstatus des Geschäftskundenkontos */
  status: 'pending' | 'active' | 'blocked';
  /** zuständiger Ansprechpartner im Markt */
  accountManager?: string;
}

export interface Customer {
  id: ID;
  type: CustomerType;
  /** Anzeigename: Person (B2C) oder Firma (B2B) */
  name: string;
  contactName: string;
  email: string;
  phone: string;
  addresses: Address[];
  defaultAddressId?: ID;
  /** Produkt-IDs */
  favorites: ID[];
  /** Treuepunkte (B2C): 1 Punkt pro vollem Euro Warenwert */
  loyaltyPoints: number;
  /**
   * Leergut-Konto: Anzahl Gebinde je DepositType, die der Kunde aktuell von uns hat
   * (positiv = Kunde hat unser Leergut; wird bei Lieferung erhöht und bei Rückgabe verringert).
   */
  depositBalance: Record<ID, number>;
  b2b?: BusinessInfo;
  marketingOptIn?: boolean;
  createdAt: ISODate;
  /** interne Notiz des Markts */
  internalNote?: string;
}

/** Felder, die der Kunde selbst ändern darf */
export type CustomerPatch = Partial<Pick<Customer, 'name' | 'contactName' | 'phone' | 'defaultAddressId' | 'marketingOptIn'>>;

// ───────────────────────────── Lieferung, Zonen & Zeitfenster ─────────────────────────────

export type FulfillmentType = 'delivery' | 'pickup';

export interface DeliveryZone {
  id: ID;
  name: string; // "Garching & Hochbrück"
  zips: string[];
  /** Liefergebühr brutto in Cent */
  fee: number;
  /** Mindestbestellwert (Warenwert brutto, ohne Pfand) in Cent */
  minOrder: number;
  /** ab diesem Warenwert (brutto, ohne Pfand) liefern wir kostenlos */
  freeFrom: number;
  color: string;
  /** Mittelpunkt für Kartendarstellung */
  center: GeoPoint;
  /** Radius in Metern für Kartendarstellung */
  radiusM: number;
}

export interface SlotTemplate {
  /** 0 = Sonntag … 6 = Samstag (wie Date.getDay()) */
  weekday: number;
  start: TimeString;
  end: TimeString;
  /** maximale Anzahl Bestellungen in diesem Fenster */
  capacity: number;
}

export interface TimeSlot {
  /** `${type}|${date}|${start}-${end}` */
  id: ID;
  type: FulfillmentType;
  date: DayString;
  start: TimeString;
  end: TimeString;
  capacity: number;
  booked: number;
  /** false, wenn ausgebucht oder Bestellschluss überschritten */
  available: boolean;
  /** z. B. "Ausgebucht", "Bestellschluss überschritten" */
  reason?: string;
}

export interface SlotQuery {
  type: FulfillmentType;
  /** erster Tag (Default heute) */
  from?: DayString;
  /** Anzahl Tage (Default 7) */
  days?: number;
}

export interface OpeningHours {
  /** 0 = Sonntag … 6 = Samstag; null = geschlossen */
  [weekday: number]: { open: TimeString; close: TimeString } | null;
}

export interface Coupon {
  code: string; // "WILLKOMMEN10"
  description: string;
  type: 'percent' | 'fixed';
  /** Prozent (10 = 10 %) bzw. Cent bei 'fixed' */
  value: number;
  /** Mindestwarenwert brutto in Cent */
  minOrder?: number;
  validUntil?: DayString;
  /** nur für Privatkunden */
  b2cOnly?: boolean;
  active: boolean;
}

export interface StoreSettings {
  name: string; // "Getränke Altinger"
  legalName: string; // "Getränke-Altinger GmbH"
  street: string;
  zip: string;
  city: string;
  phone: string;
  email: string;
  location: GeoPoint;
  openingHours: OpeningHours;
  deliverySlots: SlotTemplate[];
  pickupSlots: SlotTemplate[];
  zones: DeliveryZone[];
  /** Bestellschluss vor Beginn eines Zeitfensters in Minuten */
  orderCutoffMinutes: number;
  /** Bestellschluss für Abholfenster in Minuten (Default 30) */
  pickupCutoffMinutes?: number;
  /** Wie lange eine Click-&-Collect-Reservierung gehalten wird (Stunden) */
  pickupHoldHours: number;
  /** Tragservice (bis in die Wohnung) brutto in Cent pro Bestellung */
  carryServiceFee: number;
  /** Treuepunkte pro Euro (B2C) */
  loyaltyPointsPerEuro: number;
  coupons: Coupon[];
  /** Hinweisbanner auf der Startseite (optional) */
  announcement?: string;
  /** Demo: neue Bestellungen nach wenigen Sekunden automatisch bestätigen (Default false = Markt bestätigt selbst) */
  demoAutoConfirm?: boolean;
}

// ───────────────────────────── Bestellungen ─────────────────────────────

/**
 * Status-Abläufe:
 *  Lieferung: pending → confirmed → picking → ready → out_for_delivery → delivered
 *  Abholung:  pending → confirmed → picking → ready → picked_up
 *  jederzeit vor Auslieferung/Abholung: → cancelled ; bei Lieferproblem: out_for_delivery → failed
 */
export type OrderStatus =
  | 'pending' // eingegangen
  | 'confirmed' // bestätigt
  | 'picking' // wird kommissioniert
  | 'ready' // Lieferung: verladen / Abholung: abholbereit
  | 'out_for_delivery' // unterwegs
  | 'delivered' // zugestellt
  | 'picked_up' // abgeholt
  | 'failed' // Zustellung fehlgeschlagen
  | 'cancelled'; // storniert

export type PaymentMethod =
  | 'cash' // Bar bei Lieferung/Abholung
  | 'ec' // EC-/Girocard bei Lieferung/Abholung
  | 'paypal' // PayPal (Demo)
  | 'card' // Kreditkarte (Demo)
  | 'invoice' // Rechnung (nur B2B mit allowInvoice)
  | 'sepa'; // SEPA-Lastschrift (nur B2B)

export type PaymentStatus = 'open' | 'paid' | 'invoiced';

export interface EmptiesLine {
  depositTypeId: ID;
  qty: number;
}

export interface OrderLine {
  productId: ID;
  name: string; // "Augustiner Lagerbier Hell"
  packaging: string;
  qty: number;
  vatRate: number;
  /** Netto-Stückpreis nach allen Rabatten (Cent) */
  unitNet: number;
  /** Brutto-Stückpreis nach allen Rabatten (Cent) */
  unitGross: number;
  /** regulärer Brutto-Stückpreis vor Angebot/Rabatt – zum Durchstreichen */
  regularUnitGross: number;
  lineNet: number;
  lineGross: number;
  depositTypeId?: ID;
  /** Pfand pro Gebinde (Cent) */
  depositUnit: number;
  depositTotal: number;
  isRental?: boolean;
  /** Hinweis wie "Angebot", "Staffelpreis ab 10", "Gastro-Rabatt 8 %" */
  priceNote?: string;
}

export interface Totals {
  /** Summe Warenwert brutto (nach Artikelrabatten, vor Gutschein) */
  itemsGross: number;
  itemsNet: number;
  /** Gutschein-Rabatt brutto (positiv) */
  discount: number;
  /** Pfand für gelieferte Gebinde */
  deposit: number;
  /** Gutschrift für zurückgegebenes Leergut (positiv) */
  depositRefund: number;
  deliveryFee: number;
  carryFee: number;
  /** enthaltene MwSt. (auch auf Pfand; die Leergut-Gutschrift mindert sie) */
  vat: number;
  /** Endbetrag brutto = itemsGross − discount + deposit − depositRefund + deliveryFee + carryFee (kann bei viel Leergut negativ sein = Auszahlung) */
  total: number;
  /** MwSt.-Aufschlüsselung je Satz (Netto/MwSt. inkl. Pfand, Gebühren, abzgl. Gutschriften) – für Kasse und Rechnung */
  vatBreakdown?: VatBreakdownLine[];
}

export interface VatBreakdownLine {
  /** MwSt.-Satz in Prozent */
  rate: number;
  net: number;
  vat: number;
}

export interface CheckoutItem {
  productId: ID;
  qty: number;
}

export interface CheckoutInput {
  items: CheckoutItem[];
  fulfillment: FulfillmentType;
  /** gespeicherte Adresse des Kunden (Lieferung) */
  addressId?: ID;
  /** alternativ: neue Adresse (wird dem Kunden gespeichert) */
  address?: AddressInput;
  /** TimeSlot.id */
  slotId?: ID;
  emptiesReturn: EmptiesLine[];
  carryService: boolean;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  /** Hinweis für Markt/Fahrer */
  notes?: string;
  /** B2B: Bestellreferenz / Bestellnummer des Kunden */
  reference?: string;
  /** B2B: Kostenstelle */
  costCenter?: string;
  /** Leihartikel/Fest: Datum der Veranstaltung */
  eventDate?: DayString;
  /** Kommissionsware: volle, ungeöffnete Gebinde dürfen nach dem Fest zurückgegeben werden */
  commission?: boolean;
}

export interface QuoteMessage {
  code: string; // 'min_order', 'zone', 'stock', 'coupon', 'slot', 'rental_date', 'credit_limit', …
  message: string; // deutsch, für UI
}

export interface Quote {
  customerType: CustomerType;
  lines: OrderLine[];
  totals: Totals;
  zone?: DeliveryZone;
  /** Fehlbetrag bis Mindestbestellwert (Cent), 0 wenn erreicht */
  missingForMinOrder: number;
  /** Fehlbetrag bis zur kostenlosen Lieferung (Cent), 0 wenn erreicht */
  missingForFreeDelivery: number;
  coupon?: Coupon;
  loyaltyPointsEarned: number;
  /** Blockierende Fehler – Bestellung nicht möglich */
  errors: QuoteMessage[];
  /** Hinweise */
  warnings: QuoteMessage[];
  /** erlaubte Zahlarten für diesen Kunden/diese Lieferart */
  paymentMethods: PaymentMethod[];
}

export interface StatusChange {
  status: OrderStatus;
  at: ISODate;
  note?: string;
  /** Name/Rolle des Auslösers, z. B. "Kunde", "Markt", "Fahrer Toni" */
  by?: string;
}

export interface DeliveryProof {
  receivedBy?: string;
  /** PNG Data-URL der Unterschrift */
  signatureDataUrl?: string;
  /** JPEG Data-URL (verkleinert) als Zustellnachweis */
  photoDataUrl?: string;
  at: ISODate;
  /** tatsächlich vom Fahrer mitgenommenes Leergut */
  emptiesCollected: EmptiesLine[];
  /** kassierter Betrag (Cent), falls bar/EC */
  amountCollected?: number;
  note?: string;
}

export interface DeliveryProofInput {
  receivedBy?: string;
  signatureDataUrl?: string;
  photoDataUrl?: string;
  emptiesCollected: EmptiesLine[];
  amountCollected?: number;
  note?: string;
}

/** Herkunft einer Bestellung (für Auswertung „Telefon-Entlastung“) */
export type OrderSource = 'app' | 'phone' | 'subscription';

export interface Order {
  id: ID;
  /** Herkunft: App/Web (Default), telefonisch vom Markt erfasst, aus Abo/Dauerauftrag */
  source?: OrderSource;
  /** Bestellnummer für Menschen, z. B. "AL-24851" */
  number: string;
  customerId: ID;
  customerType: CustomerType;
  customerName: string;
  customerPhone?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  status: OrderStatus;
  statusHistory: StatusChange[];
  fulfillment: FulfillmentType;
  slot: { id: ID; date: DayString; start: TimeString; end: TimeString };
  /** Lieferadresse (Kopie zum Bestellzeitpunkt) */
  address?: Address;
  lines: OrderLine[];
  emptiesReturn: EmptiesLine[];
  carryService: boolean;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  totals: Totals;
  couponCode?: string;
  notes?: string;
  reference?: string;
  costCenter?: string;
  eventDate?: DayString;
  commission?: boolean;
  /** Abholcode (Click & Collect), z. B. "K7Q2X9" – QR-Inhalt: "ALTINGER:<orderId>:<pickupCode>" */
  pickupCode?: string;
  /** Reservierung gültig bis (Click & Collect) */
  holdUntil?: ISODate;
  tourId?: ID;
  driverId?: ID;
  /** voraussichtliche Ankunft (Lieferung) */
  eta?: ISODate;
  /** Fahrer ist beim Kunden angekommen */
  arrivedAt?: ISODate;
  proof?: DeliveryProof;
  failureReason?: string;
  rating?: { stars: number; comment?: string; at: ISODate };
  subscriptionId?: ID;
  invoiceId?: ID;
  loyaltyPointsEarned?: number;
}

// ───────────────────────────── Abos / Daueraufträge ─────────────────────────────

export type SubscriptionInterval = 'weekly' | 'biweekly' | 'monthly';

export interface Subscription {
  id: ID;
  customerId: ID;
  /** z. B. "Wasser alle 2 Wochen" */
  name: string;
  items: CheckoutItem[];
  interval: SubscriptionInterval;
  /** 1 = Montag … 6 = Samstag */
  weekday: number;
  /** Start des Lieferfensters, z. B. "09:00" */
  slotStart: TimeString;
  addressId: ID;
  paymentMethod: PaymentMethod;
  active: boolean;
  nextDate: DayString;
  /** Leergut automatisch mitnehmen (gleiche Menge wie geliefert) */
  autoEmptiesReturn: boolean;
  createdAt: ISODate;
  lastOrderId?: ID;
}

export type SubscriptionInput = Omit<Subscription, 'id' | 'customerId' | 'createdAt' | 'lastOrderId' | 'nextDate'> & {
  id?: ID;
  nextDate?: DayString;
};

// ───────────────────────────── Rechnungen (B2B) ─────────────────────────────

export type InvoiceStatus = 'open' | 'paid' | 'overdue';

export interface Invoice {
  id: ID;
  /** "RE-2026-00123" */
  number: string;
  customerId: ID;
  customerName: string;
  orderIds: ID[];
  date: DayString;
  dueDate: DayString;
  /** Nettobetrag Ware + Gebühren − Rabatt; net + vat + deposit − depositRefund = gross */
  net: number;
  /** MwSt. gesamt (inkl. MwSt. auf Pfand, gemindert um die Leergut-Gutschrift) */
  vat: number;
  /** Pfand netto */
  deposit: number;
  /** Leergut-Gutschrift netto */
  depositRefund: number;
  gross: number;
  status: InvoiceStatus;
  paidAt?: ISODate;
  /** MwSt.-Aufschlüsselung je Satz */
  vatBreakdown?: VatBreakdownLine[];
}

// ───────────────────────────── Fahrer & Touren ─────────────────────────────

export type DriverStatus = 'off' | 'available' | 'on_tour' | 'break';

export interface Driver {
  id: ID;
  name: string;
  phone: string;
  /** z. B. "Mercedes Sprinter · M-GA 2041" */
  vehicle: string;
  /** Kennfarbe auf Karten */
  color: string;
  status: DriverStatus;
  position?: GeoPosition;
  /** Max. Gebinde pro Fahrt */
  capacityCrates: number;
}

export type TourStatus = 'planned' | 'active' | 'completed';
export type StopStatus = 'pending' | 'arrived' | 'delivered' | 'failed';

export interface TourStop {
  orderId: ID;
  status: StopStatus;
  /** geplante Ankunft */
  eta?: ISODate;
  arrivedAt?: ISODate;
  doneAt?: ISODate;
}

export interface RouteLeg {
  /** Linienzug [lat, lng][] */
  coords: LatLng[];
  /** Meter */
  distance: number;
  /** Sekunden */
  duration: number;
}

export interface TourSimulation {
  running: boolean;
  /** Zeitraffer-Faktor (1 = Echtzeit) */
  speedFactor: number;
  /** Stopps automatisch abschließen (unbeaufsichtigte Demo) */
  autoComplete: boolean;
  /** aktueller Abschnitt (Index in route.legs) */
  legIndex: number;
  /** zurückgelegte Meter im aktuellen Abschnitt */
  progressM: number;
  /** wartet am Stopp bis zu diesem Zeitpunkt */
  dwellUntil?: ISODate;
  /** Zeitpunkt des letzten Simulationsschritts (für zeitbasierten Fortschritt) */
  lastTickAt?: ISODate;
  /** Diese Aufträge werden auch bei autoComplete NICHT automatisch zugestellt (Demo: Fahrer schließt sie live ab) */
  manualOrderIds?: ID[];
}

export interface Tour {
  id: ID;
  /** z. B. "Tour 1 · Vormittag" */
  name: string;
  date: DayString;
  driverId: ID;
  status: TourStatus;
  /** Stopps in Fahrreihenfolge */
  stops: TourStop[];
  /**
   * Route ab Markt: legs[i] führt zu stops[i]; legs[stops.length] führt zurück zum Markt.
   * Wird bei Änderung der Stopps neu berechnet (OSRM, Fallback Luftlinie).
   */
  route?: { legs: RouteLeg[]; distance: number; duration: number };
  /** Index des nächsten offenen Stopps (stops.length = alle erledigt / Rückfahrt) */
  currentStopIndex: number;
  plannedStart?: TimeString;
  startedAt?: ISODate;
  finishedAt?: ISODate;
  simulation?: TourSimulation;
}

export interface TourInput {
  id?: ID;
  name?: string;
  date: DayString;
  driverId: ID;
  orderIds: ID[];
  plannedStart?: TimeString;
}

export interface TourWithOrders extends Tour {
  orders: Order[];
  driver?: Driver;
}

export interface DriverToday {
  driver: Driver;
  tours: TourWithOrders[];
}

/** Sicht des Kunden auf die Sendungsverfolgung */
export interface TrackingInfo {
  order: Order;
  store: GeoPoint & { name: string; phone: string };
  driver?: Pick<Driver, 'id' | 'name' | 'phone' | 'vehicle' | 'color' | 'position' | 'status'>;
  tour?: {
    id: ID;
    status: TourStatus;
    /** Index dieses Auftrags in der Tour */
    stopIndex: number;
    currentStopIndex: number;
    /** Anzahl Stopps vor diesem Auftrag, die noch offen sind */
    stopsBefore: number;
    /** Linienzug vom aktuellen Abschnitt bis zu diesem Kunden */
    routeToCustomer?: LatLng[];
  };
  /** Minuten bis zur Ankunft (geschätzt) */
  etaMinutes?: number;
}

// ───────────────────────────── Benachrichtigungen ─────────────────────────────

export interface AppNotification {
  id: ID;
  /** Empfänger: User-ID; für Admin-Broadcast 'admin', für alle Fahrer 'drivers' */
  recipient: ID | 'admin' | 'drivers';
  title: string;
  body: string;
  createdAt: ISODate;
  read: boolean;
  /** App-interner Link, z. B. "/bestellung/o-123" */
  link?: string;
  kind: 'order' | 'delivery' | 'system' | 'promo' | 'stock' | 'invoice';
}

// ───────────────────────────── Statistik ─────────────────────────────

export interface Stats {
  days: number;
  /** Bestellungen nach Herkunft (Anzahl) – zeigt die Entlastung von Telefon/Fax */
  bySource?: { app: number; phone: number; subscription: number };
  revenueByDay: { date: DayString; b2c: number; b2b: number; orders: number }[];
  revenueTotal: number;
  ordersTotal: number;
  avgOrderValue: number;
  today: {
    orders: number;
    revenue: number;
    openDeliveries: number;
    openPickups: number;
    deliveredToday: number;
  };
  /** Anzahl Bestellungen im Zeitraum je Lieferart */
  byFulfillment: { delivery: number; pickup: number };
  /** Anzahl Bestellungen im Zeitraum je Kundenart (Umsatz je Kundenart: revenueByDay) */
  byCustomerType: { b2c: number; b2b: number };
  topProducts: { productId: ID; name: string; qty: number; revenue: number }[];
  byCategory: { categoryId: ID; name: string; revenue: number }[];
  /** Bestellungen pro Stunde (0–23) im Zeitraum */
  ordersByHour: number[];
  lowStock: Product[];
  /** Summe Leergut-Pfand, das Kunden aktuell halten (Cent) */
  depositOutstanding: number;
  ratingAvg: number;
  ratingCount: number;
  newCustomers: number;
  /** Summe aller unbezahlten Rechnungen (offen + überfällig), Cent */
  openInvoicesAmount: number;
  /** davon überfällig, Cent */
  overdueInvoicesAmount: number;
}

// ───────────────────────────── Bootstrap ─────────────────────────────

export interface Bootstrap {
  settings: StoreSettings;
  categories: Category[];
  depositTypes: DepositType[];
  demoUsers: DemoUser[];
  /** 'remote' = Node-Server, 'local' = alles im Browser (Offline-/Static-Demo) */
  mode: 'remote' | 'local';
  version: string;
  serverTime: ISODate;
}

// ───────────────────────────── Echtzeit ─────────────────────────────

export type RealtimeEvent =
  | { type: 'order.created'; order: Order }
  | { type: 'order.updated'; order: Order }
  | { type: 'tour.updated'; tour: Tour }
  | { type: 'tour.deleted'; tourId: ID }
  | { type: 'driver.position'; driverId: ID; position: GeoPosition; tourId?: ID }
  | { type: 'driver.updated'; driver: Driver }
  | { type: 'product.updated'; product: Product }
  | { type: 'customer.updated'; customer: Customer }
  | { type: 'notification'; notification: AppNotification }
  | { type: 'settings.updated'; settings: StoreSettings }
  | { type: 'invoice.updated'; invoice: Invoice }
  | { type: 'subscription.updated'; subscription: Subscription }
  /** komplette Daten wurden ersetzt (Demo-Reset) – Clients laden alles neu */
  | { type: 'data.reset' };

/** An wen ein Ereignis zugestellt wird. */
export interface Audience {
  /** an alle verbundenen Clients (z. B. Produktänderungen) */
  all?: boolean;
  /** an alle Admins */
  admin?: boolean;
  /** an alle Fahrer */
  drivers?: boolean;
  /** an Nutzer, die zu diesen Kunden gehören */
  customerIds?: ID[];
  /** an Nutzer, die zu diesen Fahrern gehören */
  driverIds?: ID[];
  /** an bestimmte Nutzer */
  userIds?: ID[];
}

// ───────────────────────────── Fehler ─────────────────────────────

export type ApiErrorCode =
  | 'unauthorized' // nicht angemeldet
  | 'forbidden' // keine Berechtigung
  | 'not_found'
  | 'validation' // Eingabe ungültig
  | 'conflict' // z. B. Zeitfenster ausgebucht, Status-Übergang ungültig
  | 'internal';

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string; // deutsch, für die UI geeignet
  details?: unknown;
}
