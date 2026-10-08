/**
 * API-Vertrag zwischen Frontend und Core.
 *
 * Es gibt genau EINE Schnittstelle (`Api`). Sie wird
 *  - im Browser über `src/api/client.ts` bereitgestellt (Proxy), entweder
 *      * remote:  POST /api/rpc/<methode>  { args: [...] }  → { result } | { error }
 *      * local:   direkter Aufruf des Cores im Browser (Daten in localStorage)
 *  - im Core (`shared/core/*`) implementiert: jede Methode bekommt zusätzlich als
 *    ersten Parameter den Aufruf-Kontext (`Ctx`) mit dem angemeldeten Nutzer.
 *
 * Neue Methoden IMMER hier ergänzen und im Core implementieren.
 */
import type {
  Address,
  AddressInput,
  AppNotification,
  Bootstrap,
  BusinessRequestInput,
  CheckoutInput,
  Coupon,
  Customer,
  CustomerPatch,
  DeliveryProofInput,
  DeliveryZone,
  DemoUser,
  Driver,
  DriverStatus,
  DriverToday,
  EmptiesLine,
  FulfillmentType,
  GeoPositionInput,
  ID,
  Invoice,
  Order,
  OrderStatus,
  Product,
  ProductInput,
  Quote,
  RegisterInput,
  Session,
  SlotQuery,
  Stats,
  StoreSettings,
  Subscription,
  SubscriptionInput,
  TimeSlot,
  Tour,
  TourInput,
  TourWithOrders,
  TrackingInfo,
  User,
  ApiErrorCode,
  DayString,
} from './types';

export interface AdminOrderQuery {
  status?: OrderStatus[];
  /** Liefer-/Abholtag (slot.date) */
  date?: DayString;
  fulfillment?: FulfillmentType;
  customerId?: ID;
  /** Freitextsuche: Nummer, Kunde, Ort */
  q?: string;
}

export interface SimulationOptions {
  /** Zeitraffer, Default 4 */
  speedFactor?: number;
  /** Stopps automatisch zustellen, Default true */
  autoComplete?: boolean;
}

export interface RentalAvailability {
  productId: ID;
  /** verfügbare Stückzahl am gewünschten Datum */
  available: number;
  total: number;
}

export interface Api {
  // ── System ───────────────────────────────────────────────
  /** Grunddaten für den App-Start (öffentlich) */
  getBootstrap(): Promise<Bootstrap>;
  /** Setzt alle Daten auf den Demo-Stand zurück (Admin; im local-Modus jeder) */
  resetDemo(): Promise<void>;

  // ── Anmeldung ────────────────────────────────────────────
  getDemoUsers(): Promise<DemoUser[]>;
  /** Passwort für alle Demo-Zugänge: "demo" */
  login(email: string, password: string): Promise<Session>;
  /** Ein-Klick-Anmeldung mit Demo-Nutzer (für die Präsentation) */
  demoLogin(userId: ID): Promise<Session>;
  /** Registrierung Privatkunde → direkt angemeldet */
  register(input: RegisterInput): Promise<Session>;
  /** Antrag Geschäftskunde → angemeldet, Konto-Status 'pending' bis Freischaltung */
  requestBusinessAccount(input: BusinessRequestInput): Promise<Session>;
  logout(): Promise<void>;
  /** aktuelle Sitzung zum Token oder null */
  me(): Promise<Session | null>;

  // ── Sortiment & Preise (öffentlich; Preise je nach angemeldetem Kunden) ──
  listProducts(): Promise<Product[]>;
  getProduct(productId: ID): Promise<Product>;
  validateCoupon(code: string, itemsGross: number): Promise<Coupon>;
  /** Liefergebiet zur PLZ oder null (nicht im Liefergebiet) */
  checkZip(zip: string): Promise<DeliveryZone | null>;
  listSlots(query: SlotQuery): Promise<TimeSlot[]>;
  /** Preisberechnung/Prüfung ohne Bestellung (auch anonym = Privatkundenpreise) */
  quote(input: CheckoutInput): Promise<Quote>;
  /** Verfügbarkeit von Leihartikeln an einem Datum */
  rentalAvailability(date: DayString): Promise<RentalAvailability[]>;
  /** Adresssuche (Geocoding) – liefert Vorschläge mit Koordinaten */
  searchAddress(query: string): Promise<AddressInput[]>;

  // ── Kunde (Rolle customer | business) ───────────────────
  getMyCustomer(): Promise<Customer>;
  updateMyCustomer(patch: CustomerPatch): Promise<Customer>;
  /** neue Adresse (ohne id) oder Änderung (mit id) */
  saveAddress(address: AddressInput): Promise<Customer>;
  deleteAddress(addressId: ID): Promise<Customer>;
  toggleFavorite(productId: ID): Promise<Customer>;
  /** B2B: Kostenstellen pflegen */
  setCostCenters(costCenters: string[]): Promise<Customer>;
  placeOrder(input: CheckoutInput): Promise<Order>;
  listMyOrders(): Promise<Order[]>;
  /** Kunde: eigene; Fahrer: zugewiesene; Admin: alle */
  getOrder(orderId: ID): Promise<Order>;
  /** nur solange Status pending/confirmed */
  cancelOrder(orderId: ID, reason?: string): Promise<Order>;
  rateOrder(orderId: ID, stars: number, comment?: string): Promise<Order>;
  getTracking(orderId: ID): Promise<TrackingInfo>;
  listMySubscriptions(): Promise<Subscription[]>;
  saveSubscription(input: SubscriptionInput): Promise<Subscription>;
  deleteSubscription(subscriptionId: ID): Promise<void>;
  /** B2B */
  listMyInvoices(): Promise<Invoice[]>;
  /** Kunde: eigene; Admin: alle */
  getInvoice(invoiceId: ID): Promise<{ invoice: Invoice; orders: Order[]; customer: Customer; settings: StoreSettings }>;
  /** Benachrichtigungen des angemeldeten Nutzers (inkl. Rollen-Broadcasts), neueste zuerst */
  listNotifications(): Promise<AppNotification[]>;
  /** ohne ids = alle als gelesen markieren */
  markNotificationsRead(ids?: ID[]): Promise<void>;

  // ── Fahrer (Rolle driver) ───────────────────────────────
  getDriverToday(): Promise<DriverToday>;
  setDriverStatus(status: DriverStatus): Promise<Driver>;
  /** Tour starten: Bestellungen → out_for_delivery, Kunden werden benachrichtigt */
  startTour(tourId: ID): Promise<Tour>;
  finishTour(tourId: ID): Promise<Tour>;
  /** GPS-Position senden (ca. alle 3–5 s während der Tour) */
  updateDriverPosition(position: GeoPositionInput): Promise<void>;
  /** "Ich bin da" – Kunde bekommt Hinweis */
  arriveAtStop(orderId: ID): Promise<Order>;
  completeDelivery(orderId: ID, proof: DeliveryProofInput): Promise<Order>;
  failDelivery(orderId: ID, reason: string): Promise<Order>;
  /** Demo: Fahrt entlang der Route simulieren (Admin oder Fahrer der Tour) */
  simulateTour(tourId: ID, options?: SimulationOptions): Promise<Tour>;
  stopSimulation(tourId: ID): Promise<Tour>;

  // ── Markt / Admin (Rolle admin) ─────────────────────────
  adminListOrders(query?: AdminOrderQuery): Promise<Order[]>;
  /**
   * Statuswechsel durch den Markt. `emptiesCollected` (optional, bei 'picked_up'/'delivered'):
   * tatsächlich angenommenes Leergut – sonst gilt die (geprüfte) Anmeldung der Bestellung.
   */
  adminUpdateOrderStatus(orderId: ID, status: OrderStatus, note?: string, emptiesCollected?: EmptiesLine[]): Promise<Order>;
  /** Abholcode oder QR-Inhalt prüfen → Bestellung */
  adminFindPickup(codeOrQr: string): Promise<Order>;
  adminListDrivers(): Promise<Driver[]>;
  adminSaveDriver(driver: Driver): Promise<Driver>;
  adminListTours(date: DayString): Promise<TourWithOrders[]>;
  adminSaveTour(input: TourInput): Promise<Tour>;
  adminDeleteTour(tourId: ID): Promise<void>;
  /** Stopp-Reihenfolge optimieren (Nearest-Neighbor + 2-Opt) und Route neu berechnen */
  adminOptimizeTour(tourId: ID): Promise<Tour>;
  /** Offene Lieferungen eines Tages automatisch auf verfügbare Fahrer verteilen */
  adminAutoPlanTours(date: DayString): Promise<TourWithOrders[]>;
  adminListCustomers(): Promise<Customer[]>;
  adminGetCustomer(customerId: ID): Promise<{ customer: Customer; orders: Order[]; invoices: Invoice[]; subscriptions: Subscription[]; users: User[] }>;
  adminSaveCustomer(customer: Customer): Promise<Customer>;
  /** Leergut-Konto eines Kunden korrigieren */
  adminAdjustDeposit(customerId: ID, depositTypeId: ID, delta: number, note?: string): Promise<Customer>;
  adminSaveProduct(product: ProductInput): Promise<Product>;
  adminAdjustStock(productId: ID, delta: number, reason?: string): Promise<Product>;
  adminSaveSettings(settings: StoreSettings): Promise<StoreSettings>;
  adminGetStats(days: number): Promise<Stats>;
  adminListInvoices(): Promise<Invoice[]>;
  /** Rechnung für alle gelieferten, noch nicht abgerechneten Rechnungs-Bestellungen eines B2B-Kunden erstellen */
  adminCreateInvoice(customerId: ID): Promise<Invoice>;
  adminMarkInvoicePaid(invoiceId: ID): Promise<Invoice>;
  adminListSubscriptions(): Promise<Subscription[]>;
  /** fällige Abos/Daueraufträge bis einschließlich Datum in Bestellungen umwandeln */
  adminRunSubscriptions(untilDate: DayString): Promise<Order[]>;
  /** Benachrichtigung an Kunden senden (z. B. Aktion) */
  adminBroadcast(input: { title: string; body: string; audience: 'all' | 'b2c' | 'b2b'; link?: string }): Promise<number>;
}

export type ApiMethod = keyof Api;

/** Aufruf-Kontext im Core */
export interface Ctx {
  /** angemeldeter Nutzer oder null (Gast) */
  user: User | null;
  /** Token der aktuellen Sitzung (für logout) */
  token?: string;
  /** aktuelle Zeit – injizierbar für Tests */
  now: Date;
}

/** Core-Implementierung: wie Api, aber mit Ctx als erstem Parameter. Darf synchron oder async sein. */
export type CoreHandlers = {
  [K in ApiMethod]: (
    ctx: Ctx,
    ...args: Parameters<Api[K]>
  ) => Awaited<ReturnType<Api[K]>> | Promise<Awaited<ReturnType<Api[K]>>>;
};

/** Fehler mit deutscher, UI-tauglicher Meldung */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details?: unknown;
  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

/** HTTP-Status je Fehlercode (Server) */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 422,
  conflict: 409,
  internal: 500,
};

/** Re-Export für bequemen Import */
export type { Address };
