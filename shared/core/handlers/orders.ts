/**
 * Bestellungen aus Kundensicht: Bestellen, Liste, Detail, Storno, Bewertung, Sendungsverfolgung.
 */
import { ApiError, type CoreHandlers } from '../../api';
import type { Address, Order } from '../../types';
import type { Engine } from '../engine';
import { actorLabel, requireCustomer, requireUser, requireVisibleOrder } from '../access';
import { normalizeAddressInput, resolveAddress } from '../addresses';
import { createOrder, notifyNewOrder } from '../orderOps';
import { cancelOrderOp } from '../lifecycle';
import { emitCustomer, emitOrder, notifyAdmin } from '../notify';
import { buildTracking } from '../tracking';
import { normalizeCheckoutInput } from './catalog';

/** Verzögerung der automatischen Bestätigung im Demo-Modus */
export const DEMO_AUTO_CONFIRM_MS = 5_000;

export function orderHandlers(
  e: Engine,
): Pick<CoreHandlers, 'placeOrder' | 'listMyOrders' | 'getOrder' | 'cancelOrder' | 'rateOrder' | 'getTracking'> {
  return {
    async placeOrder(ctx, raw) {
      const { customer: initial } = requireCustomer(e, ctx);
      if (initial.b2b?.status === 'blocked') {
        throw new ApiError('forbidden', 'Ihr Geschäftskundenkonto ist derzeit gesperrt. Bitte wenden Sie sich an den Markt.');
      }
      const input = normalizeCheckoutInput(raw);
      let address: Address | undefined;
      let isNewAddress = false;
      if (input.fulfillment === 'delivery') {
        if (input.address) {
          const norm = normalizeAddressInput(input.address, { name: initial.contactName || initial.name, label: 'Lieferadresse' });
          const existing = norm.id ? initial.addresses.find((a) => a.id === norm.id) : undefined;
          address = await resolveAddress(e, norm, existing);
          isNewAddress = !existing;
        } else {
          const id = input.addressId ?? initial.defaultAddressId;
          address = initial.addresses.find((a) => a.id === id);
          if (!address) throw new ApiError('validation', 'Bitte wählen Sie eine Lieferadresse.');
        }
      }
      // nach dem await mit dem aktuellen Datenstand weiterarbeiten
      const { customer } = requireCustomer(e, ctx);
      const { order } = createOrder(e, { customer, input, ...(address ? { address } : {}), now: ctx.now, by: 'Kunde' });
      if (isNewAddress && address) {
        customer.addresses.push({ ...address });
        if (!customer.defaultAddressId) customer.defaultAddressId = address.id;
        emitCustomer(e, customer);
      }
      notifyNewOrder(e, order, ctx.now);
      if (e.demoMode) {
        (e.db.autoConfirm ??= []).push({ orderId: order.id, at: new Date(ctx.now.getTime() + DEMO_AUTO_CONFIRM_MS).toISOString() });
      }
      return order;
    },

    listMyOrders(ctx) {
      const user = requireUser(ctx);
      let list: Order[];
      if (user.role === 'driver') list = e.db.orders.filter((o) => !!user.driverId && o.driverId === user.driverId);
      else if (user.role === 'admin') list = [];
      else list = e.db.orders.filter((o) => !!user.customerId && o.customerId === user.customerId);
      return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    getOrder(ctx, orderId) {
      return requireVisibleOrder(e, ctx, orderId).order;
    },

    cancelOrder(ctx, orderId, reason) {
      const { user, order } = requireVisibleOrder(e, ctx, orderId);
      if (user.role === 'driver') throw new ApiError('forbidden', 'Fahrer können Bestellungen nicht stornieren.');
      const allowed = user.role === 'admin' ? ['pending', 'confirmed', 'picking', 'ready', 'failed'] : ['pending', 'confirmed'];
      if (!allowed.includes(order.status)) {
        throw new ApiError(
          'conflict',
          user.role === 'admin'
            ? 'Diese Bestellung kann nicht mehr storniert werden.'
            : `Diese Bestellung wird bereits bearbeitet und kann online nicht mehr storniert werden. Bitte rufen Sie uns an: ${e.db.settings.phone}.`,
        );
      }
      const note = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 300) : undefined;
      cancelOrderOp(e, order, ctx.now, actorLabel(e, user), note, user.role !== 'admin');
      return order;
    },

    rateOrder(ctx, orderId, stars, comment) {
      const { user, order } = requireVisibleOrder(e, ctx, orderId);
      if (user.role !== 'customer' && user.role !== 'business') throw new ApiError('forbidden', 'Nur Kunden können Bestellungen bewerten.');
      if (order.status !== 'delivered' && order.status !== 'picked_up') {
        throw new ApiError('conflict', 'Sie können eine Bestellung erst nach der Zustellung bzw. Abholung bewerten.');
      }
      if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new ApiError('validation', 'Bitte vergeben Sie 1 bis 5 Sterne.');
      const text = typeof comment === 'string' ? comment.trim().slice(0, 500) : '';
      order.rating = { stars, at: ctx.now.toISOString(), ...(text ? { comment: text } : {}) };
      order.updatedAt = ctx.now.toISOString();
      emitOrder(e, order);
      notifyAdmin(
        e,
        {
          title: `Neue Bewertung: ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`,
          body: `${order.customerName} zu ${order.number}${text ? `: „${text}“` : ''}`,
          kind: 'order',
          link: `/admin/bestellungen/${order.id}`,
        },
        ctx.now,
      );
      return order;
    },

    getTracking(ctx, orderId) {
      const { user, order } = requireVisibleOrder(e, ctx, orderId);
      const staff = user.role === 'admin' || user.role === 'driver';
      return buildTracking(e, order, ctx.now, { viewer: staff ? 'staff' : 'customer' });
    },
  };
}
