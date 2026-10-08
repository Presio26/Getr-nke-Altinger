/**
 * Berechtigungsprüfungen und Lookups mit deutschen Fehlermeldungen.
 */
import { ApiError, type Ctx } from '../api';
import type { Customer, Driver, Invoice, Order, Product, Role, Subscription, Tour, User } from '../types';
import type { Engine } from './engine';

export const MSG = {
  unauthorized: 'Bitte melden Sie sich an.',
  forbidden: 'Für diese Aktion fehlt Ihnen die Berechtigung.',
  orderNotFound: 'Die Bestellung wurde nicht gefunden.',
  tourNotFound: 'Die Tour wurde nicht gefunden.',
  productNotFound: 'Der Artikel wurde nicht gefunden.',
  customerNotFound: 'Der Kunde wurde nicht gefunden.',
  driverNotFound: 'Der Fahrer wurde nicht gefunden.',
  invoiceNotFound: 'Die Rechnung wurde nicht gefunden.',
  subscriptionNotFound: 'Das Abo wurde nicht gefunden.',
} as const;

export function requireUser(ctx: Ctx): User {
  if (!ctx.user) throw new ApiError('unauthorized', MSG.unauthorized);
  return ctx.user;
}

export function requireRole(ctx: Ctx, ...roles: Role[]): User {
  const user = requireUser(ctx);
  if (!roles.includes(user.role)) throw new ApiError('forbidden', MSG.forbidden);
  return user;
}

export function requireAdmin(ctx: Ctx): User {
  return requireRole(ctx, 'admin');
}

/** Angemeldeter Kunde (Privat oder Geschäftskunde) samt Kundendatensatz */
export function requireCustomer(e: Engine, ctx: Ctx): { user: User; customer: Customer } {
  const user = requireRole(ctx, 'customer', 'business');
  const customer = user.customerId ? e.db.customers.find((c) => c.id === user.customerId) : undefined;
  if (!customer) throw new ApiError('not_found', 'Zu Ihrem Zugang gehört kein Kundenkonto.');
  return { user, customer };
}

/** Angemeldeter Fahrer samt Fahrerdatensatz */
export function requireDriver(e: Engine, ctx: Ctx): { user: User; driver: Driver } {
  const user = requireRole(ctx, 'driver');
  const driver = user.driverId ? e.db.drivers.find((d) => d.id === user.driverId) : undefined;
  if (!driver) throw new ApiError('not_found', 'Zu Ihrem Zugang gehört kein Fahrerprofil.');
  return { user, driver };
}

export function findOrder(e: Engine, orderId: string): Order {
  const order = typeof orderId === 'string' ? e.db.orders.find((o) => o.id === orderId) : undefined;
  if (!order) throw new ApiError('not_found', MSG.orderNotFound);
  return order;
}

export function findTour(e: Engine, tourId: string): Tour {
  const tour = typeof tourId === 'string' ? e.db.tours.find((t) => t.id === tourId) : undefined;
  if (!tour) throw new ApiError('not_found', MSG.tourNotFound);
  return tour;
}

export function findProduct(e: Engine, productId: string): Product {
  const p = typeof productId === 'string' ? e.db.products.find((x) => x.id === productId) : undefined;
  if (!p) throw new ApiError('not_found', MSG.productNotFound);
  return p;
}

export function findCustomer(e: Engine, customerId: string): Customer {
  const c = typeof customerId === 'string' ? e.db.customers.find((x) => x.id === customerId) : undefined;
  if (!c) throw new ApiError('not_found', MSG.customerNotFound);
  return c;
}

export function findDriver(e: Engine, driverId: string): Driver {
  const d = typeof driverId === 'string' ? e.db.drivers.find((x) => x.id === driverId) : undefined;
  if (!d) throw new ApiError('not_found', MSG.driverNotFound);
  return d;
}

export function findInvoice(e: Engine, invoiceId: string): Invoice {
  const i = typeof invoiceId === 'string' ? e.db.invoices.find((x) => x.id === invoiceId) : undefined;
  if (!i) throw new ApiError('not_found', MSG.invoiceNotFound);
  return i;
}

export function findSubscription(e: Engine, id: string): Subscription {
  const s = typeof id === 'string' ? e.db.subscriptions.find((x) => x.id === id) : undefined;
  if (!s) throw new ApiError('not_found', MSG.subscriptionNotFound);
  return s;
}

/** Darf der Nutzer die Bestellung sehen? (Kunde: eigene, Fahrer: zugewiesene, Admin: alle) */
export function canSeeOrder(user: User, order: Order): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'driver') return !!user.driverId && order.driverId === user.driverId;
  return !!user.customerId && order.customerId === user.customerId;
}

/** Bestellung mit Sichtprüfung – fremde Bestellungen erscheinen als „nicht gefunden“ */
export function requireVisibleOrder(e: Engine, ctx: Ctx, orderId: string): { user: User; order: Order } {
  const user = requireUser(ctx);
  const order = findOrder(e, orderId);
  if (!canSeeOrder(user, order)) throw new ApiError('not_found', MSG.orderNotFound);
  return { user, order };
}

/** Admin oder der zugewiesene Fahrer der Tour */
export function requireTourAccess(_e: Engine, ctx: Ctx, tour: Tour): User {
  const user = requireRole(ctx, 'admin', 'driver');
  if (user.role === 'driver' && user.driverId !== tour.driverId) throw new ApiError('forbidden', 'Diese Tour ist Ihnen nicht zugewiesen.');
  return user;
}

/** Auslöser-Text für den Statusverlauf */
export function actorLabel(e: Engine, user: User | null | undefined): string {
  if (!user) return 'System';
  switch (user.role) {
    case 'admin':
      return 'Markt';
    case 'driver': {
      const d = e.db.drivers.find((x) => x.id === user.driverId);
      return `Fahrer ${(d?.name ?? user.name).split(' ')[0]}`;
    }
    default:
      return 'Kunde';
  }
}
