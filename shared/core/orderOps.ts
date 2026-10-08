/**
 * Bestell-Lebenszyklus: Status-Übergänge, Bestand, Abschluss (Treuepunkte, Leergut, Zahlung),
 * Anlage neuer Bestellungen (placeOrder und Abos).
 */
import { ApiError } from '../api';
import type {
  Address,
  CheckoutInput,
  Customer,
  EmptiesLine,
  Order,
  OrderStatus,
  PaymentStatus,
  Quote,
  StatusChange,
} from '../types';
import { addMinutesIso, berlinDate } from '../time';
import { formatDate, formatDateTime, formatEuro, formatTime, orderStatusLabel } from '../format';
import type { Engine } from './engine';
import { calculateQuote, type QuoteContext } from './pricing';
import { findSlot, parseSlotId } from './slots';
import { emitOrder, emitProduct, notifyAdmin, notifyCustomer } from './notify';
import { randomPickupCode } from './util';
import { openAmountForCustomer } from './invoices';

/** Erlaubte Status-Übergänge (siehe OrderStatus in types.ts) */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['picking', 'cancelled'],
  picking: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'picked_up', 'cancelled'],
  out_for_delivery: ['delivered', 'failed'],
  // nach einer fehlgeschlagenen Zustellung: erneut verladen oder stornieren
  failed: ['ready', 'cancelled'],
  delivered: [],
  picked_up: [],
  cancelled: [],
};

const DELIVERY_ONLY: OrderStatus[] = ['out_for_delivery', 'delivered', 'failed'];
const PICKUP_ONLY: OrderStatus[] = ['picked_up'];
export const FINAL_STATUSES: OrderStatus[] = ['delivered', 'picked_up', 'cancelled'];
/** Bestellungen, die noch bearbeitet werden (vor Auslieferung/Abholung) */
export const OPEN_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'picking', 'ready'];

export function canTransition(order: Order, to: OrderStatus): boolean {
  if (!ORDER_TRANSITIONS[order.status]?.includes(to)) return false;
  if (order.fulfillment === 'pickup' && DELIVERY_ONLY.includes(to)) return false;
  if (order.fulfillment === 'delivery' && PICKUP_ONLY.includes(to)) return false;
  return true;
}

export function assertTransition(order: Order, to: OrderStatus): void {
  if (!canTransition(order, to)) {
    throw new ApiError(
      'conflict',
      `Statuswechsel von „${orderStatusLabel(order.status, order.fulfillment)}“ nach „${orderStatusLabel(to, order.fulfillment)}“ ist nicht möglich.`,
    );
  }
}

export function slotText(slot: Order['slot']): string {
  return `${formatDate(slot.date, 'medium')} · ${slot.start}–${slot.end} Uhr`;
}

export const orderLink = (order: Order) => `/bestellung/${order.id}`;

export interface TransitionOptions {
  by?: string;
  note?: string;
  /** Kunden-Benachrichtigung unterdrücken (z. B. bei Sammel-Übergängen) */
  silent?: boolean;
  /** Ereignis order.updated unterdrücken (Aufrufer sendet selbst) */
  noEmit?: boolean;
  /** Fahrername für Texte */
  driverName?: string;
}

/** Text der Kunden-Benachrichtigung zu einem Status */
function statusNotification(e: Engine, order: Order, opts: TransitionOptions): { title: string; body: string; kind: 'order' | 'delivery' } | null {
  const nr = order.number;
  switch (order.status) {
    case 'confirmed':
      return {
        title: 'Bestellung bestätigt',
        body: `Ihre Bestellung ${nr} ist bestätigt – ${order.fulfillment === 'delivery' ? 'Lieferung' : 'Abholung'} ${slotText(order.slot)}.`,
        kind: 'order',
      };
    case 'picking':
      return { title: 'Ihre Bestellung wird zusammengestellt', body: `Wir stellen Ihre Bestellung ${nr} gerade für Sie zusammen.`, kind: 'order' };
    case 'ready':
      if (order.fulfillment === 'pickup') {
        return {
          title: 'Ihre Bestellung liegt bereit',
          body:
            `Ihre Bestellung ${nr} liegt zur Abholung bereit. Abholcode: ${order.pickupCode ?? '–'}` +
            (order.holdUntil ? ` – reserviert bis ${formatDateTime(order.holdUntil)} Uhr.` : '.'),
          kind: 'order',
        };
      }
      return { title: 'Ihre Bestellung ist verladen', body: `Ihre Bestellung ${nr} ist verladen und kommt ${slotText(order.slot)}.`, kind: 'delivery' };
    case 'out_for_delivery': {
      const who = opts.driverName ? opts.driverName.split(' ')[0] : 'Unser Fahrer';
      const eta = order.eta ? ` – voraussichtlich gegen ${formatTime(order.eta)} Uhr` : '';
      return {
        title: 'Ihre Bestellung ist unterwegs',
        body: `${who} ist mit Ihrer Bestellung ${nr} unterwegs${eta}. Verfolgen Sie die Lieferung live auf der Karte.`,
        kind: 'delivery',
      };
    }
    case 'delivered': {
      const pts = order.loyaltyPointsEarned ? ` Sie haben ${order.loyaltyPointsEarned} Treuepunkte gesammelt.` : '';
      return { title: 'Bestellung zugestellt', body: `Ihre Bestellung ${nr} wurde zugestellt. Vielen Dank für Ihren Einkauf!${pts}`, kind: 'delivery' };
    }
    case 'picked_up': {
      const pts = order.loyaltyPointsEarned ? ` Sie haben ${order.loyaltyPointsEarned} Treuepunkte gesammelt.` : '';
      return { title: 'Danke für Ihren Einkauf', body: `Ihre Bestellung ${nr} wurde abgeholt.${pts}`, kind: 'order' };
    }
    case 'failed':
      return {
        title: 'Zustellung nicht möglich',
        body: `Ihre Bestellung ${nr} konnte leider nicht zugestellt werden${order.failureReason ? `: ${order.failureReason}` : ''}. Wir melden uns bei Ihnen – oder rufen Sie uns an: ${e.db.settings.phone}.`,
        kind: 'delivery',
      };
    case 'cancelled':
      return {
        title: 'Bestellung storniert',
        body: `Ihre Bestellung ${nr} wurde storniert.${opts.note ? ` Grund: ${opts.note}` : ''}`,
        kind: 'order',
      };
    default:
      return null;
  }
}

/**
 * Status setzen inkl. Verlauf, Zeitstempel, Benachrichtigung und Ereignis.
 * Nebenwirkungen (Bestand, Abschluss, Tour) übernehmen die aufrufenden Operationen.
 */
export function transitionOrder(e: Engine, order: Order, to: OrderStatus, at: Date, opts: TransitionOptions = {}): void {
  assertTransition(order, to);
  const change: StatusChange = { status: to, at: at.toISOString() };
  if (opts.note) change.note = opts.note;
  if (opts.by) change.by = opts.by;
  order.status = to;
  order.statusHistory.push(change);
  order.updatedAt = change.at;
  if (!opts.silent) {
    const n = statusNotification(e, order, opts);
    if (n) notifyCustomer(e, order.customerId, { ...n, link: orderLink(order) }, at);
  }
  if (!opts.noEmit) emitOrder(e, order);
}

// ───────────────────────────── Bestand ─────────────────────────────

/** Bestand reduzieren (ohne Leihartikel), product.updated senden, Meldebestand melden */
export function deductStock(e: Engine, order: Order, at: Date): void {
  for (const line of order.lines) {
    if (line.isRental) continue;
    const p = e.db.products.find((x) => x.id === line.productId);
    if (!p) continue;
    const before = p.stock;
    p.stock = Math.max(0, p.stock - line.qty);
    emitProduct(e, p);
    if (before >= p.minStock && p.stock < p.minStock) {
      notifyAdmin(
        e,
        {
          title: 'Meldebestand unterschritten',
          body: `${p.brand} ${p.name} (${p.packaging}): noch ${p.stock} auf Lager, Meldebestand ${p.minStock}.`,
          kind: 'stock',
          link: `/admin/sortiment/${p.id}`,
        },
        at,
      );
    }
  }
}

/** Bestand zurückbuchen (Storno) */
export function restoreStock(e: Engine, order: Order): void {
  for (const line of order.lines) {
    if (line.isRental) continue;
    const p = e.db.products.find((x) => x.id === line.productId);
    if (!p) continue;
    p.stock += line.qty;
    emitProduct(e, p);
  }
}

// ───────────────────────────── Abschluss ─────────────────────────────

/** Zahlstatus nach Zustellung/Abholung */
export function paymentStatusOnCompletion(order: Order): PaymentStatus {
  if (order.paymentMethod === 'invoice' || order.paymentMethod === 'sepa') return order.invoiceId ? 'invoiced' : 'open';
  return 'paid';
}

/**
 * Wirkung von delivered/picked_up auf Kunde und Bestellung:
 * Treuepunkte (B2C), Leergut-Konto, Zahlstatus, ggf. angepasste Leergut-Gutschrift.
 */
export function applyCompletion(e: Engine, order: Order, collected: EmptiesLine[]): void {
  const customer = e.db.customers.find((c) => c.id === order.customerId);
  const types = e.db.depositTypes;
  // Leergut-Gutschrift an tatsächlich mitgenommenes Leergut anpassen
  const refund = collected.reduce((s, l) => s + (types.find((t) => t.id === l.depositTypeId && t.returnable)?.amount ?? 0) * l.qty, 0);
  if (refund !== order.totals.depositRefund) {
    const diff = refund - order.totals.depositRefund;
    order.totals = { ...order.totals, depositRefund: refund, total: order.totals.total - diff };
  }
  order.paymentStatus = paymentStatusOnCompletion(order);
  if (!customer) return;
  if (customer.type === 'b2c' && order.loyaltyPointsEarned) customer.loyaltyPoints += order.loyaltyPointsEarned;
  const balance = { ...customer.depositBalance };
  for (const line of order.lines) {
    if (!line.depositTypeId) continue;
    const t = types.find((x) => x.id === line.depositTypeId);
    if (t?.returnable) balance[t.id] = (balance[t.id] ?? 0) + line.qty;
  }
  for (const l of collected) {
    if (!l.qty) continue;
    balance[l.depositTypeId] = Math.max(0, (balance[l.depositTypeId] ?? 0) - l.qty);
  }
  for (const k of Object.keys(balance)) if (!balance[k]) delete balance[k];
  customer.depositBalance = balance;
}

// ───────────────────────────── Neue Bestellung ─────────────────────────────

/** Nächste Bestellnummer: "AL-<seq>" */
export function nextOrderNumber(e: Engine): { id: string; number: string } {
  e.db.seq.order += 1;
  const n = e.db.seq.order;
  let id = `o-${n}`;
  while (e.db.orders.some((o) => o.id === id)) id = `o-${n}-${Math.floor(Math.random() * 1e4).toString(36)}`;
  return { id, number: `AL-${n}` };
}

/** Eindeutiger Abholcode unter den offenen Abholungen */
export function uniquePickupCode(e: Engine): string {
  for (let i = 0; i < 50; i++) {
    const code = randomPickupCode();
    if (!e.db.orders.some((o) => o.pickupCode === code && o.status !== 'picked_up' && o.status !== 'cancelled')) return code;
  }
  return randomPickupCode();
}

/** Kontext für calculateQuote aus dem aktuellen Datenstand */
export function quoteContextFor(e: Engine, customer: Customer | null, now: Date, address?: Pick<Address, 'zip'> | null): QuoteContext {
  const qc: QuoteContext = {
    settings: e.db.settings,
    products: e.db.products,
    depositTypes: e.db.depositTypes,
    customer,
    now,
    orders: e.db.orders,
  };
  if (address !== undefined) qc.address = address;
  if (customer?.type === 'b2b') qc.openAmount = openAmountForCustomer(e.db, customer.id, now);
  return qc;
}

export interface CreateOrderParams {
  customer: Customer;
  input: CheckoutInput;
  /** aufgelöste Lieferadresse (Kopie wird in der Bestellung gespeichert) */
  address?: Address;
  now: Date;
  by: string;
  subscriptionId?: string;
  /** zusätzliche Statusschritte direkt nach der Anlage, z. B. ['confirmed'] für Abos */
  autoAdvance?: OrderStatus[];
}

/**
 * Prüft (Quote + Zeitfenster) und legt die Bestellung an: Nummer, Verlauf, Bestand,
 * Abholcode, Zahlstatus, Benachrichtigungen, Ereignisse. Wirft ApiError bei Problemen.
 */
export function createOrder(e: Engine, params: CreateOrderParams): { order: Order; quote: Quote } {
  const { customer, input, address, now } = params;
  const quote = calculateQuote(input, quoteContextFor(e, customer, now, address ? { zip: address.zip } : undefined));
  if (quote.errors.length) {
    throw new ApiError('validation', quote.errors[0].message, { errors: quote.errors, warnings: quote.warnings });
  }
  if (!input.slotId) {
    throw new ApiError('validation', input.fulfillment === 'pickup' ? 'Bitte wählen Sie ein Abholfenster.' : 'Bitte wählen Sie ein Lieferfenster.');
  }
  const parsed = parseSlotId(input.slotId);
  if (!parsed || parsed.type !== input.fulfillment) {
    throw new ApiError('validation', 'Das gewählte Zeitfenster passt nicht zur Lieferart.');
  }
  const slot = findSlot(e.db.settings, e.db.orders, input.slotId, now);
  if (!slot) throw new ApiError('conflict', 'Das gewählte Zeitfenster gibt es nicht (mehr). Bitte wählen Sie ein anderes.');
  if (!slot.available) {
    throw new ApiError(
      'conflict',
      slot.reason === 'Ausgebucht'
        ? 'Das gewählte Zeitfenster ist leider ausgebucht. Bitte wählen Sie ein anderes.'
        : 'Für dieses Zeitfenster ist der Bestellschluss bereits überschritten. Bitte wählen Sie ein späteres.',
      { slotId: slot.id, reason: slot.reason },
    );
  }

  const { id, number } = nextOrderNumber(e);
  const iso = now.toISOString();
  const order: Order = {
    id,
    number,
    customerId: customer.id,
    customerType: customer.type,
    customerName: customer.name,
    createdAt: iso,
    updatedAt: iso,
    status: 'pending',
    statusHistory: [{ status: 'pending', at: iso, by: params.by }],
    fulfillment: input.fulfillment,
    slot: { id: slot.id, date: slot.date, start: slot.start, end: slot.end },
    lines: quote.lines,
    emptiesReturn: (input.emptiesReturn ?? [])
      .filter((l) => !!l && typeof l.depositTypeId === 'string' && Number.isInteger(l.qty) && l.qty > 0)
      .map((l) => ({ depositTypeId: l.depositTypeId, qty: l.qty })),
    carryService: input.fulfillment === 'delivery' && !!input.carryService,
    paymentMethod: input.paymentMethod,
    paymentStatus: input.paymentMethod === 'paypal' || input.paymentMethod === 'card' ? 'paid' : 'open',
    totals: quote.totals,
  };
  if (customer.phone) order.customerPhone = customer.phone;
  if (input.fulfillment === 'delivery' && address) order.address = { ...address };
  if (quote.coupon) order.couponCode = quote.coupon.code;
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
  const notes = text(input.notes, 500);
  if (notes) order.notes = notes;
  const reference = text(input.reference, 80);
  if (reference) order.reference = reference;
  const costCenter = text(input.costCenter, 80);
  if (costCenter) order.costCenter = costCenter;
  if (input.eventDate) order.eventDate = input.eventDate;
  if (input.commission) order.commission = true;
  if (quote.loyaltyPointsEarned) order.loyaltyPointsEarned = quote.loyaltyPointsEarned;
  if (params.subscriptionId) order.subscriptionId = params.subscriptionId;
  if (input.fulfillment === 'pickup') {
    order.pickupCode = uniquePickupCode(e);
    order.holdUntil = addMinutesIso(berlinDate(slot.date, slot.end), e.db.settings.pickupHoldHours * 60);
  }

  e.db.orders.push(order);
  deductStock(e, order, now);
  for (const step of params.autoAdvance ?? []) {
    transitionOrder(e, order, step, now, { by: 'Markt', silent: true, noEmit: true });
  }
  emitOrder(e, order, 'order.created');
  return { order, quote };
}

/** Admin-Benachrichtigung „Neue Bestellung“ */
export function notifyNewOrder(e: Engine, order: Order, at: Date): void {
  const kind = order.fulfillment === 'delivery' ? 'Lieferung' : 'Abholung';
  notifyAdmin(
    e,
    {
      title: 'Neue Bestellung',
      body: `${order.number} · ${order.customerName} · ${formatEuro(order.totals.total)} · ${kind} ${slotText(order.slot)}`,
      kind: 'order',
      link: `/admin/bestellungen/${order.id}`,
    },
    at,
  );
}
