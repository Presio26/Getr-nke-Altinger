/**
 * Benachrichtigungen und Echtzeit-Ereignisse (Zielgruppen gemäß Architektur §4.1).
 */
import type { AppNotification, Audience, Customer, Driver, Invoice, Order, Product, Subscription, Tour } from '../types';
import type { Engine } from './engine';
import { nextId } from './db';

/** Höchstzahl gespeicherter Benachrichtigungen (älteste fallen weg) */
const MAX_NOTIFICATIONS = 600;

export interface NotificationInput {
  title: string;
  body: string;
  kind: AppNotification['kind'];
  link?: string;
}

function audienceFor(recipient: AppNotification['recipient']): Audience {
  if (recipient === 'admin') return { admin: true };
  if (recipient === 'drivers') return { drivers: true };
  return { userIds: [recipient] };
}

/** Benachrichtigung speichern und als Echtzeit-Ereignis verteilen */
export function addNotification(
  e: Engine,
  recipient: AppNotification['recipient'],
  input: NotificationInput,
  at: Date = e.now(),
): AppNotification {
  const n: AppNotification = {
    id: nextId(e.db, 'n'),
    recipient,
    title: input.title,
    body: input.body,
    createdAt: at.toISOString(),
    read: false,
    kind: input.kind,
  };
  if (input.link) n.link = input.link;
  e.db.notifications.push(n);
  if (e.db.notifications.length > MAX_NOTIFICATIONS) {
    e.db.notifications.splice(0, e.db.notifications.length - MAX_NOTIFICATIONS);
  }
  e.emit({ type: 'notification', notification: n }, audienceFor(recipient));
  return n;
}

export function notifyAdmin(e: Engine, input: NotificationInput, at?: Date): AppNotification {
  return addNotification(e, 'admin', input, at);
}

/** An alle Zugänge eines Kunden */
export function notifyCustomer(e: Engine, customerId: string, input: NotificationInput, at?: Date): AppNotification[] {
  return e.db.users
    .filter((u) => u.customerId === customerId && (u.role === 'customer' || u.role === 'business'))
    .map((u) => addNotification(e, u.id, input, at));
}

/** An die Zugänge eines Fahrers */
export function notifyDriver(e: Engine, driverId: string, input: NotificationInput, at?: Date): AppNotification[] {
  return e.db.users.filter((u) => u.driverId === driverId && u.role === 'driver').map((u) => addNotification(e, u.id, input, at));
}

// ───────────────────────────── Ereignisse ─────────────────────────────

export function orderAudience(order: Order): Audience {
  return { admin: true, customerIds: [order.customerId], driverIds: order.driverId ? [order.driverId] : [] };
}

export function emitOrder(e: Engine, order: Order, type: 'order.created' | 'order.updated' = 'order.updated'): void {
  e.emit({ type, order }, orderAudience(order));
}

/** Vollständige Tour (Stopps, ETAs, Route mit allen Lieferadressen) nur an Markt und Fahrer */
export function tourAudience(_e: Engine, tour: Tour): Audience {
  return { admin: true, driverIds: [tour.driverId] };
}

/** Kunden mit einem Auftrag in der Tour */
export function tourCustomerIds(e: Engine, tour: Tour): string[] {
  const customerIds = new Set<string>();
  for (const s of tour.stops) {
    const o = e.db.orders.find((x) => x.id === s.orderId);
    if (o) customerIds.add(o.customerId);
  }
  return [...customerIds];
}

/**
 * Tour ohne Daten anderer Kunden (keine Stopps, keine Route, keine Simulation) – für Kunden der Tour,
 * damit deren Sendungsverfolgung neu lädt (getTracking liefert nur die eigenen Daten).
 */
export function customerTourView(tour: Tour): Tour {
  return {
    id: tour.id,
    name: tour.name,
    date: tour.date,
    driverId: tour.driverId,
    status: tour.status,
    stops: [],
    currentStopIndex: tour.currentStopIndex,
  };
}

export function emitTour(e: Engine, tour: Tour): void {
  e.emit({ type: 'tour.updated', tour }, tourAudience(e, tour));
  const customerIds = tourCustomerIds(e, tour);
  if (customerIds.length) e.emit({ type: 'tour.updated', tour: customerTourView(tour) }, { customerIds });
}

export function emitDriver(e: Engine, driver: Driver): void {
  e.emit({ type: 'driver.updated', driver }, { admin: true, driverIds: [driver.id] });
}

export function emitProduct(e: Engine, product: Product): void {
  e.emit({ type: 'product.updated', product }, { all: true });
}

/** Kundendaten ohne interne Notiz an den Kunden, vollständig an den Markt */
export function emitCustomer(e: Engine, customer: Customer): void {
  e.emit({ type: 'customer.updated', customer }, { admin: true });
  const { internalNote: _internal, ...visible } = customer;
  void _internal;
  e.emit({ type: 'customer.updated', customer: visible }, { customerIds: [customer.id] });
}

export function emitInvoice(e: Engine, invoice: Invoice): void {
  e.emit({ type: 'invoice.updated', invoice }, { admin: true, customerIds: [invoice.customerId] });
}

export function emitSubscription(e: Engine, subscription: Subscription): void {
  e.emit({ type: 'subscription.updated', subscription }, { admin: true, customerIds: [subscription.customerId] });
}
