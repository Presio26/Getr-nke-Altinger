/**
 * Core der Getränke-Altinger-App – läuft unverändert im Browser (local-Modus) und in Node (Server).
 *
 * Hält den Datenstand, prüft Berechtigungen, implementiert alle Api-Methoden, verteilt
 * Echtzeit-Ereignisse und treibt die Demo-Simulation voran. Siehe docs/ARCHITECTURE.md §4.1.
 */
import { ApiError, type ApiMethod, type CoreHandlers, type Ctx } from '../api';
import type { Audience, RealtimeEvent, User } from '../types';
import { SCHEMA_VERSION, type Db } from './db';
import { createEngine, type Engine } from './engine';
import { osrmRouting, photonGeocoder, type Geocoder, type RoutingProvider } from './routing';
import { advanceSimulation } from './simulator';
import { transitionOrder } from './orderOps';
import { dayString } from '../time';
import { clone, publicUser } from './util';
import { systemHandlers } from './handlers/system';
import { authHandlers } from './handlers/auth';
import { catalogHandlers } from './handlers/catalog';
import { customerHandlers } from './handlers/customer';
import { demoAutoConfirmEnabled, orderHandlers } from './handlers/orders';
import { driverHandlers } from './handlers/driver';
import { tourHandlers } from './handlers/tours';
import { adminHandlers } from './handlers/admin';
import { invoiceHandlers } from './handlers/invoices';
import { subscriptionHandlers } from './handlers/subscriptions';
import { notificationHandlers } from './handlers/notifications';

export type { Db } from './db';
export { SCHEMA_VERSION } from './db';
export { createSeedDb, reseedDb } from './seed';
export { priceProduct, calculateQuote, type ProductPrice, type QuoteContext } from './pricing';
export { generateSlots, findSlot, parseSlotId, slotIdOf } from './slots';
export {
  osrmRouting,
  photonGeocoder,
  straightLineRouting,
  plzGeocoder,
  type RoutingProvider,
  type Geocoder,
  type OsrmOptions,
  type PhotonOptions,
} from './routing';
export { CORE_VERSION } from './handlers/system';
export { ORDER_TRANSITIONS, canTransition } from './orderOps';
export { invoiceStatus } from './invoices';
export { haversine, zoneForZip, PLZ_INFO } from './geo';
export { B2C_PAYMENT_METHODS, B2B_EXTRA_PAYMENT_METHODS, isOfferValid } from './pricing';
export { DEMO_USER_INFO, DEMO_PASSWORD } from './seed/people';

export interface CoreOptions {
  db: Db;
  mode: 'remote' | 'local';
  /** Ereignis an Empfänger verteilen (Server: socket.io-Räume, local: BroadcastChannel) */
  emit: (event: RealtimeEvent, audience: Audience) => void;
  /** nach jeder Änderung aufgerufen (Server: entprellt in Datei schreiben, local: sofort localStorage) */
  persist: (db: Db) => void;
  now?: () => Date;
  /** Default: OSRM (router.project-osrm.org) mit Luftlinien-Fallback, Timeout 4 s */
  routing?: RoutingProvider;
  /** Default: Photon (photon.komoot.io) mit PLZ-Zentrum-Fallback */
  geocoder?: Geocoder;
  /** Demo-Modus: resetDemo für alle erlaubt, Ein-Klick-Login, automatische Bestätigung nur mit settings.demoAutoConfirm (Default true) */
  demoMode?: boolean;
}

export interface Core {
  handlers: CoreHandlers;
  userForToken(token: string | null | undefined): User | null;
  ctx(token?: string | null): Ctx;
  /** RPC-Dispatch per Methodenname; wirft ApiError('not_found') bei unbekannter Methode */
  call(method: string, ctx: Ctx, args: unknown[]): Promise<unknown>;
  /** Simulationen voranschieben – Host ruft ca. 1×/s auf */
  tick(): void;
  getDb(): Db;
  /** Daten ersetzen ohne persist (z. B. Sync aus anderem Tab) */
  replaceDb(db: Db): void;
  /** true, solange tick() etwas zu tun hat (laufende Simulation oder ausstehende Demo-Bestätigung) */
  hasRunningSimulation(): boolean;
}

/** Methoden ohne Datenänderung (kein persist nötig) */
const READ_ONLY = new Set<ApiMethod>([
  'getBootstrap',
  'getDemoUsers',
  'me',
  'listProducts',
  'getProduct',
  'validateCoupon',
  'checkZip',
  'listSlots',
  'quote',
  'rentalAvailability',
  'searchAddress',
  'getMyCustomer',
  'listMyOrders',
  'getOrder',
  'getTracking',
  'listMySubscriptions',
  'listMyInvoices',
  'getInvoice',
  'listNotifications',
  'getDriverToday',
  'adminListOrders',
  'adminFindPickup',
  'adminListDrivers',
  'adminListTours',
  'adminListCustomers',
  'adminGetCustomer',
  'adminGetStats',
  'adminListInvoices',
  'adminListSubscriptions',
  'adminQuote',
]);

/** Persist-Takt für reine Positionsänderungen der Simulation */
const SIM_PERSIST_INTERVAL_MS = 1000;

const INTERNAL_MESSAGE = 'Es ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es erneut.';

function isApiError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError ||
    (!!err && typeof err === 'object' && (err as { name?: unknown }).name === 'ApiError' && typeof (err as { code?: unknown }).code === 'string')
  );
}

function buildHandlers(e: Engine): CoreHandlers {
  return {
    ...systemHandlers(e),
    ...authHandlers(e),
    ...catalogHandlers(e),
    ...customerHandlers(e),
    ...orderHandlers(e),
    ...subscriptionHandlers(e),
    ...invoiceHandlers(e),
    ...notificationHandlers(e),
    ...driverHandlers(e),
    ...tourHandlers(e),
    ...adminHandlers(e),
  };
}

export function createCore(options: CoreOptions): Core {
  const engine = createEngine({
    db: options.db,
    mode: options.mode,
    emit: options.emit,
    persist: options.persist,
    now: options.now ?? (() => new Date()),
    routing: options.routing ?? osrmRouting(),
    geocoder: options.geocoder ?? photonGeocoder(),
    demoMode: options.demoMode ?? true,
  });
  const raw = buildHandlers(engine);

  // Öffentliche Handler: Ergebnis als tiefe Kopie, persist nach ändernden Methoden
  const handlers = {} as Record<string, (ctx: Ctx, ...args: unknown[]) => Promise<unknown>>;
  for (const name of Object.keys(raw) as ApiMethod[]) {
    const fn = raw[name] as unknown as (ctx: Ctx, ...args: unknown[]) => unknown;
    handlers[name] = async (ctx: Ctx, ...args: unknown[]) => {
      const result = await fn(ctx, ...args);
      if (!READ_ONLY.has(name)) engine.persist();
      return clone(result);
    };
  }

  function userForToken(token: string | null | undefined): User | null {
    if (!token || typeof token !== 'string') return null;
    const userId = engine.db.sessions[token];
    if (!userId) return null;
    const user = engine.db.users.find((u) => u.id === userId);
    return user ? publicUser(user) : null;
  }

  function ctx(token?: string | null): Ctx {
    const user = userForToken(token);
    const c: Ctx = { user, now: engine.now() };
    if (token && user) c.token = token;
    return c;
  }

  async function call(method: string, context: Ctx, args: unknown[]): Promise<unknown> {
    if (typeof method !== 'string' || !Object.prototype.hasOwnProperty.call(handlers, method)) {
      throw new ApiError('not_found', `Unbekannte API-Funktion „${String(method).slice(0, 64)}“.`);
    }
    const list = Array.isArray(args) ? args : [];
    try {
      return await handlers[method](context, ...list);
    } catch (err) {
      if (isApiError(err)) throw err;
      console.error(`[core] ${method} fehlgeschlagen:`, err);
      throw new ApiError('internal', INTERNAL_MESSAGE);
    }
  }

  function tick(): void {
    const now = engine.now();
    const db = engine.db;
    let changed = false;
    let moved = false;

    // Demo: neue Bestellungen nach kurzer Zeit automatisch bestätigen – nur, solange der Markt das eingeschaltet hat
    if (db.autoConfirm?.length) {
      const enabled = demoAutoConfirmEnabled(engine);
      const due = enabled ? db.autoConfirm.filter((x) => Date.parse(x.at) <= now.getTime()) : db.autoConfirm;
      if (due.length) {
        db.autoConfirm = enabled ? db.autoConfirm.filter((x) => Date.parse(x.at) > now.getTime()) : [];
        changed = true;
        if (enabled) {
          for (const item of due) {
            const order = db.orders.find((o) => o.id === item.orderId);
            if (order?.status !== 'pending') continue;
            try {
              transitionOrder(engine, order, 'confirmed', now, { by: 'Markt', note: 'Automatisch bestätigt' });
            } catch (err) {
              console.error('[core] Automatische Bestätigung fehlgeschlagen:', err);
            }
          }
        }
      }
    }

    for (const tour of db.tours) {
      if (!tour.simulation?.running) continue;
      try {
        const r = advanceSimulation(engine, tour, now);
        changed ||= r.changed;
        moved ||= r.moved;
      } catch (err) {
        console.error(`[core] Simulation von ${tour.id} angehalten:`, err);
        tour.simulation.running = false;
        changed = true;
      }
    }

    if (changed || (moved && Date.now() - engine.lastPersistAt >= SIM_PERSIST_INTERVAL_MS)) engine.persist();
  }

  return {
    handlers: handlers as unknown as CoreHandlers,
    userForToken,
    ctx,
    call,
    tick,
    getDb: () => engine.db,
    replaceDb(db: Db) {
      engine.setDb(db);
    },
    hasRunningSimulation() {
      const db = engine.db;
      return db.tours.some((t) => t.simulation?.running) || !!db.autoConfirm?.length;
    },
  };
}

/** true, wenn die Demo-Daten von einem früheren Kalendertag stammen (dann neu seeden) */
export function isSeedStale(db: Db, now: Date): boolean {
  if (!db || typeof db !== 'object' || db.schemaVersion !== SCHEMA_VERSION || !db.seededAt) return true;
  const seeded = new Date(db.seededAt);
  if (Number.isNaN(seeded.getTime())) return true;
  return dayString(seeded) !== dayString(now);
}

