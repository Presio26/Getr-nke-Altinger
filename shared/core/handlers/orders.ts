/**
 * Bestellungen aus Kundensicht: Bestellen, Liste, Detail, Storno, Bewertung, Sendungsverfolgung.
 */
import { ApiError, type CoreHandlers, type Ctx } from '../../api';
import type { Address, CheckoutInput, Customer, Order, PaymentMethod, Quote } from '../../types';
import type { Engine } from '../engine';
import { actorLabel, findCustomer, requireAdmin, requireCustomer, requireUser, requireVisibleOrder } from '../access';
import { normalizeAddressInput, resolveAddress } from '../addresses';
import { createOrder, notifyNewOrder, slotText } from '../orderOps';
import { cancelOrderOp } from '../lifecycle';
import { emitCustomer, emitOrder, notifyAdmin, notifyCustomer } from '../notify';
import { buildTracking } from '../tracking';
import { normalizeCheckoutInput, quoteFor } from './catalog';

/** Verzögerung der automatischen Bestätigung im Demo-Modus (nur mit settings.demoAutoConfirm) */
export const DEMO_AUTO_CONFIRM_MS = 5_000;
/** Auslöser im Verlauf bei Telefonbestellungen */
export const PHONE_ORDER_BY = 'Markt (Telefon)';

/** Online-Zahlarten gibt es am Telefon nicht (Bar/EC bei Lieferung bzw. Abholung, Rechnung/SEPA für Geschäftskunden) */
const NOT_BY_PHONE: PaymentMethod[] = ['paypal', 'card'];
const PHONE_PAYMENT_MESSAGE = 'Am Telefon sind PayPal und Kreditkarte nicht möglich – bitte Bar, EC-Karte oder (Geschäftskunden) Rechnung wählen.';

/** Angebot für eine Telefonbestellung: nur Zahlarten, die der Markt am Telefon annehmen kann */
function phoneQuote(quote: Quote, input: CheckoutInput): Quote {
  quote.paymentMethods = quote.paymentMethods.filter((m) => !NOT_BY_PHONE.includes(m));
  if (NOT_BY_PHONE.includes(input.paymentMethod) && !quote.errors.some((x) => x.code === 'payment')) {
    quote.errors.push({ code: 'payment', message: PHONE_PAYMENT_MESSAGE });
  }
  return quote;
}

/** Demo-Autobestätigung aktiv? Nur im Demo-Modus UND wenn der Markt sie ausdrücklich eingeschaltet hat */
export function demoAutoConfirmEnabled(e: Engine): boolean {
  return e.demoMode && e.db.settings.demoAutoConfirm === true;
}

/**
 * Bestellung anlegen – für den Kunden selbst (App) oder im Namen des Kunden durch den Markt (Telefon).
 * `lookup` liefert den aktuellen Kundendatensatz (nach dem await der Adresssuche erneut aufgerufen).
 */
async function placeOrderFor(e: Engine, ctx: Ctx, lookup: () => Customer, raw: CheckoutInput, phone: boolean): Promise<Order> {
  const initial = lookup();
  if (initial.b2b?.status === 'blocked') {
    throw new ApiError(
      'forbidden',
      phone
        ? 'Das Geschäftskundenkonto ist gesperrt – bitte zuerst in den Kundendaten freischalten.'
        : 'Ihr Geschäftskundenkonto ist derzeit gesperrt. Bitte wenden Sie sich an den Markt.',
    );
  }
  const input = normalizeCheckoutInput(raw);
  if (phone && NOT_BY_PHONE.includes(input.paymentMethod)) throw new ApiError('validation', PHONE_PAYMENT_MESSAGE);
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
      if (!address) throw new ApiError('validation', phone ? 'Bitte wählen Sie eine Lieferadresse des Kunden.' : 'Bitte wählen Sie eine Lieferadresse.');
    }
  }
  // nach dem await mit dem aktuellen Datenstand weiterarbeiten
  const customer = lookup();
  const { order } = createOrder(e, {
    customer,
    input,
    ...(address ? { address } : {}),
    now: ctx.now,
    by: phone ? PHONE_ORDER_BY : 'Kunde',
    source: phone ? 'phone' : 'app',
    // telefonisch aufgenommen = vom Markt bestätigt
    ...(phone ? { autoAdvance: ['confirmed' as const], autoAdvanceBy: PHONE_ORDER_BY, autoAdvanceNote: 'Telefonisch aufgenommen' } : {}),
  });
  if (isNewAddress && address) {
    customer.addresses.push({ ...address });
    if (!customer.defaultAddressId) customer.defaultAddressId = address.id;
    emitCustomer(e, customer);
  }
  if (phone) {
    notifyCustomer(
      e,
      customer.id,
      {
        title: 'Telefonische Bestellung bestätigt',
        body: `Wir haben Ihre Bestellung ${order.number} telefonisch aufgenommen – ${order.fulfillment === 'delivery' ? 'Lieferung' : 'Abholung'} ${slotText(order.slot)}. Sie können sie jederzeit in der App verfolgen.`,
        kind: 'order',
        link: `/bestellung/${order.id}`,
      },
      ctx.now,
    );
  } else {
    notifyNewOrder(e, order, ctx.now);
    if (demoAutoConfirmEnabled(e)) {
      (e.db.autoConfirm ??= []).push({ orderId: order.id, at: new Date(ctx.now.getTime() + DEMO_AUTO_CONFIRM_MS).toISOString() });
    }
  }
  return order;
}

export function orderHandlers(
  e: Engine,
): Pick<
  CoreHandlers,
  'placeOrder' | 'listMyOrders' | 'getOrder' | 'cancelOrder' | 'rateOrder' | 'getTracking' | 'adminQuote' | 'adminPlaceOrder'
> {
  return {
    placeOrder(ctx, raw) {
      requireCustomer(e, ctx);
      return placeOrderFor(e, ctx, () => requireCustomer(e, ctx).customer, raw, false);
    },

    adminQuote(ctx, customerId, raw) {
      requireAdmin(ctx);
      const customer = findCustomer(e, customerId);
      const input = normalizeCheckoutInput(raw);
      return phoneQuote(quoteFor(e, customer, input, ctx.now), input);
    },

    adminPlaceOrder(ctx, customerId, raw) {
      requireAdmin(ctx);
      findCustomer(e, customerId);
      return placeOrderFor(e, ctx, () => findCustomer(e, customerId), raw, true);
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
