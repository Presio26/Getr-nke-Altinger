/**
 * Bestellstatus aus Kundensicht: Einteilung aktiv/abgeschlossen und Status-Timeline je Lieferart.
 */
import type { FulfillmentType, Order, OrderStatus } from '@shared/types';
import { formatDate, formatTime, orderStatusLabel } from '@shared/format';
import { dayString, todayString } from '@shared/time';
import type { TimelineItem } from '@/components/ui';

/** Bestellungen, die noch laufen (inkl. fehlgeschlagener Zustellung – braucht Klärung) */
export const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'picking', 'ready', 'out_for_delivery', 'failed'];
export const FINAL_STATUSES: OrderStatus[] = ['delivered', 'picked_up', 'cancelled'];

export function isActiveOrder(order: Pick<Order, 'status'>): boolean {
  return ACTIVE_STATUSES.includes(order.status);
}

/** Kunde darf online stornieren */
export function canCustomerCancel(order: Pick<Order, 'status'>): boolean {
  return order.status === 'pending' || order.status === 'confirmed';
}

/** Lieferung ist live verfolgbar (verladen oder unterwegs) */
export function isTrackable(order: Pick<Order, 'status' | 'fulfillment'>): boolean {
  return order.fulfillment === 'delivery' && (order.status === 'out_for_delivery' || order.status === 'ready');
}

const DELIVERY_CHAIN: OrderStatus[] = ['pending', 'confirmed', 'picking', 'ready', 'out_for_delivery', 'delivered'];
const PICKUP_CHAIN: OrderStatus[] = ['pending', 'confirmed', 'picking', 'ready', 'picked_up'];

export function statusChain(fulfillment: FulfillmentType): OrderStatus[] {
  return fulfillment === 'pickup' ? PICKUP_CHAIN : DELIVERY_CHAIN;
}

/** Zeitstempel: "14:05 Uhr" (heute) bzw. "Mi., 07.10. · 14:05" */
export function stepTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (dayString(d) === todayString(now)) return `${formatTime(d)} Uhr`;
  return `${formatDate(d, 'medium')} · ${formatTime(d)}`;
}

function stepDescription(status: OrderStatus, order: Order, driverFirstName?: string): string {
  const pickup = order.fulfillment === 'pickup';
  switch (status) {
    case 'pending':
      return 'Wir haben Ihre Bestellung erhalten.';
    case 'confirmed':
      return 'Der Markt hat Ihre Bestellung bestätigt.';
    case 'picking':
      return 'Ihre Getränke werden im Markt zusammengestellt.';
    case 'ready':
      return pickup ? 'Ihre Bestellung liegt an der Abholtheke für Sie bereit.' : 'Ihre Bestellung ist auf dem Lieferwagen verladen.';
    case 'out_for_delivery':
      return `${driverFirstName ?? 'Unser Fahrer'} ist mit Ihrer Bestellung unterwegs.`;
    case 'delivered':
      return order.proof?.receivedBy ? `Entgegengenommen von ${order.proof.receivedBy}.` : 'Ihre Bestellung wurde zugestellt.';
    case 'picked_up':
      return 'Sie haben Ihre Bestellung im Markt abgeholt.';
    case 'failed':
      return order.failureReason ? `Grund: ${order.failureReason}` : 'Die Zustellung war leider nicht möglich.';
    case 'cancelled':
      return 'Die Bestellung wurde storniert.';
  }
}

/** Timeline: erledigte Schritte aus dem Verlauf + kommende Schritte je Lieferart */
export function buildTimeline(order: Order, opts: { driverFirstName?: string; now?: Date } = {}): TimelineItem[] {
  const now = opts.now ?? new Date();
  const lastAt = new Map<OrderStatus, string>();
  let driverFirstName = opts.driverFirstName;
  for (const h of order.statusHistory) {
    lastAt.set(h.status, h.at);
    // "Fahrer Toni" → Toni (Verlauf ohne Tracking-Daten)
    const m = !driverFirstName && h.by ? /^Fahrer(?:in)? (\S+)/.exec(h.by) : null;
    if (m) driverFirstName = m[1];
  }
  opts = { ...opts, driverFirstName };
  const label = (s: OrderStatus) => orderStatusLabel(s, order.fulfillment);
  const items: TimelineItem[] = [];

  if (order.status === 'cancelled' || order.status === 'failed') {
    // tatsächlicher Verlauf, letzter Schritt als Fehler
    order.statusHistory.forEach((h, i) => {
      const last = i === order.statusHistory.length - 1;
      const isError = last && (h.status === 'cancelled' || h.status === 'failed');
      let description = stepDescription(h.status, order, opts.driverFirstName);
      if (isError && h.note) description = h.status === 'cancelled' ? `Grund: ${h.note}` : description;
      items.push({
        title: label(h.status),
        description: last ? description : undefined,
        time: stepTime(h.at, now),
        state: isError ? 'error' : 'done',
      });
    });
    if (order.status === 'failed') {
      items.push({ title: 'Neuer Liefertermin', description: 'Wir melden uns bei Ihnen, um einen neuen Termin zu vereinbaren.', state: 'upcoming' });
    }
    return items;
  }

  const chain = statusChain(order.fulfillment);
  const currentIdx = chain.indexOf(order.status);
  chain.forEach((status, i) => {
    const at = lastAt.get(status);
    const finalDone = i === currentIdx && (status === 'delivered' || status === 'picked_up');
    const state: TimelineItem['state'] = i < currentIdx || finalDone ? 'done' : i === currentIdx ? 'current' : 'upcoming';
    let description: string | undefined = state === 'upcoming' ? undefined : stepDescription(status, order, opts.driverFirstName);
    if (status === 'out_for_delivery' && state !== 'upcoming' && order.arrivedAt && order.status === 'out_for_delivery') {
      description = `${opts.driverFirstName ?? 'Ihr Fahrer'} ist um ${formatTime(order.arrivedAt)} Uhr bei Ihnen eingetroffen.`;
    }
    if (state === 'upcoming') {
      if (status === 'delivered') description = `Geplant ${formatDate(order.slot.date, 'relative', now)}, ${order.slot.start}–${order.slot.end} Uhr`;
      if (status === 'picked_up') description = `Abholung ${formatDate(order.slot.date, 'relative', now)}, ${order.slot.start}–${order.slot.end} Uhr`;
      if (status === 'ready' && order.fulfillment === 'pickup') description = 'Wir benachrichtigen Sie, sobald alles bereitsteht.';
    }
    items.push({
      title: label(status),
      description,
      time: at && state !== 'upcoming' ? stepTime(at, now) : undefined,
      state,
    });
  });
  return items;
}

/** Kurztext zum aktuellen Stand für Karten/Listen */
export function statusHint(order: Order): string {
  const pickup = order.fulfillment === 'pickup';
  switch (order.status) {
    case 'pending':
      return 'Wird vom Markt geprüft';
    case 'confirmed':
      return pickup ? 'Bestätigt – wir stellen rechtzeitig zusammen' : 'Bestätigt – Lieferung wie geplant';
    case 'picking':
      return 'Wird gerade zusammengestellt';
    case 'ready':
      return pickup ? 'Liegt zur Abholung bereit' : 'Verladen – bald unterwegs';
    case 'out_for_delivery':
      return order.arrivedAt ? 'Ihr Fahrer ist da' : 'Unterwegs zu Ihnen';
    case 'delivered':
      return 'Zugestellt';
    case 'picked_up':
      return 'Abgeholt';
    case 'failed':
      return 'Zustellung fehlgeschlagen';
    case 'cancelled':
      return 'Storniert';
  }
}
