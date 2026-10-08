/**
 * Zusammengesetzte Bestell-Operationen (Storno, Statuswechsel durch den Markt),
 * die sowohl Bestellungen als auch Touren betreffen.
 */
import { ApiError } from '../api';
import type { EmptiesLine, Order, OrderStatus } from '../types';
import type { Engine } from './engine';
import { assertTransition, restoreStock, transitionOrder, applyCompletion, uniquePickupCode } from './orderOps';
import { completeOp, detachOrderFromTour, failOp, isStopDone, sanitizeProof } from './tourOps';
import { notifyAdmin } from './notify';

/** Bestellung stornieren: aus Tour lösen, Bestand zurückbuchen, benachrichtigen */
export function cancelOrderOp(e: Engine, order: Order, now: Date, by: string, reason?: string, notifyMarket = false): void {
  assertTransition(order, 'cancelled');
  if (order.tourId) {
    const tour = e.db.tours.find((t) => t.id === order.tourId);
    const stop = tour?.stops.find((s) => s.orderId === order.id);
    if (!stop || !isStopDone(stop)) detachOrderFromTour(e, order, { now });
  }
  transitionOrder(e, order, 'cancelled', now, { by, ...(reason ? { note: reason } : {}) });
  restoreStock(e, order);
  if (e.db.autoConfirm) e.db.autoConfirm = e.db.autoConfirm.filter((x) => x.orderId !== order.id);
  if (notifyMarket) {
    notifyAdmin(
      e,
      {
        title: 'Bestellung storniert',
        body: `${order.number} · ${order.customerName} hat storniert${reason ? `: ${reason}` : '.'}`,
        kind: 'order',
        link: `/admin/bestellungen/${order.id}`,
      },
      now,
    );
  }
}

/**
 * Tatsächlich angenommenes Leergut (vom Markt erfasst, geprüft und je Art zusammengefasst);
 * ohne Angabe die bei der Bestellung angemeldete (bereits geprüfte) Rückgabe.
 */
function collectedEmpties(e: Engine, order: Order, input: unknown, now: Date): EmptiesLine[] {
  if (input === undefined || input === null) return order.emptiesReturn.map((l) => ({ ...l }));
  if (!Array.isArray(input)) throw new ApiError('validation', 'Bitte geben Sie beim Leergut gültige Mengen an.');
  return sanitizeProof(e, { emptiesCollected: input as EmptiesLine[] }, now, []).emptiesCollected;
}

/** Statuswechsel durch den Markt inkl. aller Nebenwirkungen */
export function adminSetStatusOp(
  e: Engine,
  order: Order,
  status: OrderStatus,
  now: Date,
  by: string,
  note?: string,
  emptiesCollected?: unknown,
): void {
  if (order.status === status) return;
  switch (status) {
    case 'cancelled':
      cancelOrderOp(e, order, now, by, note);
      return;
    case 'delivered':
      assertTransition(order, 'delivered');
      completeOp(
        e,
        order,
        { at: now.toISOString(), emptiesCollected: collectedEmpties(e, order, emptiesCollected, now), note: note ?? 'Vom Markt als zugestellt markiert' },
        now,
        by,
      );
      return;
    case 'failed': {
      assertTransition(order, 'failed');
      failOp(e, order, note?.trim() || 'Vom Markt als nicht zustellbar markiert', now, by);
      return;
    }
    case 'picked_up': {
      assertTransition(order, 'picked_up');
      applyCompletion(e, order, collectedEmpties(e, order, emptiesCollected, now));
      const change = note ? { by, note } : { by };
      transitionOrder(e, order, 'picked_up', now, change);
      return;
    }
    case 'ready': {
      assertTransition(order, 'ready');
      if (order.fulfillment === 'pickup' && !order.pickupCode) order.pickupCode = uniquePickupCode(e);
      if (order.status === 'failed') {
        delete order.failureReason;
        if (order.tourId) detachOrderFromTour(e, order, { now });
      }
      transitionOrder(e, order, 'ready', now, note ? { by, note } : { by });
      return;
    }
    default:
      if (status === 'out_for_delivery' && order.tourId) {
        const tour = e.db.tours.find((t) => t.id === order.tourId);
        if (tour && tour.status === 'planned') {
          throw new ApiError('conflict', `Diese Bestellung ist für „${tour.name}“ eingeplant – bitte die Tour starten.`);
        }
      }
      transitionOrder(e, order, status, now, note ? { by, note } : { by });
  }
}
