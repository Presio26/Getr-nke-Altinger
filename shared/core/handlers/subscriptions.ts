/**
 * Abos (B2C) und Daueraufträge (B2B).
 */
import { ApiError, type CoreHandlers } from '../../api';
import type { CheckoutItem, DayString, Order, PaymentMethod, Subscription, SubscriptionInterval } from '../../types';
import { addDays, isDayString, todayString, weekdayOf } from '../../time';
import { formatDate, WEEKDAY_LABEL } from '../../format';
import type { Engine } from '../engine';
import { nextId } from '../db';
import { findCustomer, findSubscription, requireAdmin, requireCustomer, requireUser } from '../access';
import { createOrder, slotText } from '../orderOps';
import { findSlot, generateSlots, nextWeekday, slotIdOf, templatesForDay } from '../slots';
import { emitSubscription, notifyAdmin, notifyCustomer } from '../notify';
import { B2B_EXTRA_PAYMENT_METHODS, B2C_PAYMENT_METHODS } from '../pricing';
import { TIME_RE } from '../util';

const INTERVAL_DAYS: Record<SubscriptionInterval, number> = { weekly: 7, biweekly: 14, monthly: 28 };

export function advanceSubscriptionDate(date: DayString, interval: SubscriptionInterval): DayString {
  return addDays(date, INTERVAL_DAYS[interval] ?? 7);
}

/** Nächster passender Wochentag ab morgen (bzw. gewünschtes Datum, wenn es passt) */
export function computeNextDate(weekday: number, today: DayString, preferred?: DayString): DayString {
  const tomorrow = addDays(today, 1);
  if (isDayString(preferred) && preferred >= tomorrow && weekdayOf(preferred) === weekday) return preferred;
  return nextWeekday(tomorrow, weekday);
}

function allowedPaymentMethods(e: Engine, customerId: string): PaymentMethod[] {
  const c = e.db.customers.find((x) => x.id === customerId);
  const list = [...B2C_PAYMENT_METHODS];
  if (c?.type === 'b2b' && c.b2b?.status === 'active' && c.b2b.allowInvoice) list.push(...B2B_EXTRA_PAYMENT_METHODS);
  return list;
}

/** Fenster für eine Abo-Lieferung: gewünschter Beginn, sonst nächstes freies Fenster des Tages */
function pickSlot(e: Engine, sub: Subscription, date: DayString, now: Date): string | null {
  const t = templatesForDay(e.db.settings, 'delivery', date).find((x) => x.start === sub.slotStart);
  if (t) {
    const s = findSlot(e.db.settings, e.db.orders, slotIdOf('delivery', date, t.start, t.end), now);
    if (s?.available) return s.id;
  }
  const free = generateSlots(e.db.settings, e.db.orders, { type: 'delivery', from: date, days: 1 }, now).filter((s) => s.available);
  return (free.find((s) => s.start >= sub.slotStart) ?? free[0])?.id ?? null;
}

/** Abo-Lieferung anlegen (bestätigt); wirft ApiError bei Problemen */
function createSubscriptionOrder(e: Engine, sub: Subscription, date: DayString, now: Date): Order {
  const customer = findCustomer(e, sub.customerId);
  const slotId = pickSlot(e, sub, date, now);
  if (!slotId) throw new ApiError('conflict', `Am ${formatDate(date, 'short')} ist kein Lieferfenster mehr frei.`);
  const address = customer.addresses.find((a) => a.id === sub.addressId) ?? customer.addresses.find((a) => a.id === customer.defaultAddressId);
  if (!address) throw new ApiError('validation', 'Die Lieferadresse des Abos gibt es nicht mehr.');
  const emptiesReturn: { depositTypeId: string; qty: number }[] = [];
  if (sub.autoEmptiesReturn) {
    const map = new Map<string, number>();
    for (const item of sub.items) {
      const p = e.db.products.find((x) => x.id === item.productId);
      const t = p?.depositTypeId ? e.db.depositTypes.find((d) => d.id === p.depositTypeId) : undefined;
      if (t?.returnable) map.set(t.id, (map.get(t.id) ?? 0) + item.qty);
    }
    for (const [depositTypeId, qty] of map) emptiesReturn.push({ depositTypeId, qty });
  }
  const { order } = createOrder(e, {
    customer,
    input: {
      items: sub.items.map((i) => ({ ...i })),
      fulfillment: 'delivery',
      addressId: address.id,
      slotId,
      emptiesReturn,
      carryService: false,
      paymentMethod: sub.paymentMethod,
      notes: `Abo „${sub.name}“`,
    },
    address,
    now,
    by: 'Abo',
    source: 'subscription',
    subscriptionId: sub.id,
    autoAdvance: ['confirmed'],
    autoAdvanceNote: 'Abo automatisch eingeplant',
  });
  sub.lastOrderId = order.id;
  notifyCustomer(
    e,
    customer.id,
    {
      title: customer.type === 'b2b' ? 'Dauerauftrag eingeplant' : 'Abo-Lieferung eingeplant',
      body: `„${sub.name}“: Lieferung ${slotText(order.slot)} (${order.number}).`,
      kind: 'order',
      link: `/bestellung/${order.id}`,
    },
    now,
  );
  return order;
}

export function subscriptionHandlers(
  e: Engine,
): Pick<
  CoreHandlers,
  'listMySubscriptions' | 'saveSubscription' | 'deleteSubscription' | 'adminListSubscriptions' | 'adminRunSubscriptions' | 'adminSetSubscriptionActive'
> {
  return {
    listMySubscriptions(ctx) {
      const { customer } = requireCustomer(e, ctx);
      return e.db.subscriptions.filter((s) => s.customerId === customer.id).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    },

    saveSubscription(ctx, input) {
      const { customer } = requireCustomer(e, ctx);
      if (!input || typeof input !== 'object') throw new ApiError('validation', 'Ungültige Abo-Daten.');
      const existing = input.id ? e.db.subscriptions.find((s) => s.id === input.id && s.customerId === customer.id) : undefined;
      if (input.id && !existing) throw new ApiError('not_found', 'Das Abo wurde nicht gefunden.');

      const items: CheckoutItem[] = [];
      for (const item of Array.isArray(input.items) ? input.items : []) {
        if (!item || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 999) {
          throw new ApiError('validation', 'Bitte geben Sie gültige Mengen (1–999) an.');
        }
        const p = e.db.products.find((x) => x.id === item.productId);
        if (!p || !p.active) throw new ApiError('validation', 'Ein Artikel des Abos ist nicht mehr erhältlich.');
        if (p.isRental) throw new ApiError('validation', 'Leihartikel können nicht abonniert werden.');
        const same = items.find((i) => i.productId === p.id);
        if (same) same.qty += item.qty;
        else items.push({ productId: p.id, qty: item.qty });
      }
      if (!items.length) throw new ApiError('validation', 'Bitte wählen Sie mindestens einen Artikel.');
      if (!['weekly', 'biweekly', 'monthly'].includes(input.interval)) throw new ApiError('validation', 'Bitte wählen Sie einen Rhythmus.');
      if (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 6) {
        throw new ApiError('validation', 'Bitte wählen Sie einen Liefertag von Montag bis Samstag.');
      }
      if (typeof input.slotStart !== 'string' || !TIME_RE.test(input.slotStart)) throw new ApiError('validation', 'Bitte wählen Sie ein Lieferfenster.');
      const hasWindow = e.db.settings.deliverySlots.some((t) => t.weekday === input.weekday && t.start === input.slotStart);
      if (!hasWindow) {
        throw new ApiError('validation', `Am ${WEEKDAY_LABEL[input.weekday]} gibt es kein Lieferfenster ab ${input.slotStart} Uhr.`);
      }
      if (!customer.addresses.some((a) => a.id === input.addressId)) throw new ApiError('validation', 'Bitte wählen Sie eine Lieferadresse.');
      if (!allowedPaymentMethods(e, customer.id).includes(input.paymentMethod)) {
        throw new ApiError('validation', 'Diese Zahlart ist für Ihr Abo nicht verfügbar.');
      }
      const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 80) : customer.type === 'b2b' ? 'Dauerauftrag' : 'Mein Abo';
      const today = todayString(ctx.now);
      const nextDate = computeNextDate(input.weekday, today, input.nextDate ?? existing?.nextDate);
      const sub: Subscription = {
        id: existing?.id ?? nextId(e.db, 's'),
        customerId: customer.id,
        name,
        items,
        interval: input.interval,
        weekday: input.weekday,
        slotStart: input.slotStart,
        addressId: input.addressId,
        paymentMethod: input.paymentMethod,
        active: input.active !== false,
        nextDate,
        autoEmptiesReturn: !!input.autoEmptiesReturn,
        createdAt: existing?.createdAt ?? ctx.now.toISOString(),
      };
      if (existing?.lastOrderId) sub.lastOrderId = existing.lastOrderId;
      if (existing) e.db.subscriptions[e.db.subscriptions.indexOf(existing)] = sub;
      else e.db.subscriptions.push(sub);
      emitSubscription(e, sub);
      return sub;
    },

    deleteSubscription(ctx, subscriptionId) {
      const user = requireUser(ctx);
      const sub = findSubscription(e, subscriptionId);
      if (user.role !== 'admin') {
        const { customer } = requireCustomer(e, ctx);
        if (sub.customerId !== customer.id) throw new ApiError('not_found', 'Das Abo wurde nicht gefunden.');
      }
      e.db.subscriptions = e.db.subscriptions.filter((s) => s.id !== sub.id);
      emitSubscription(e, { ...sub, active: false });
    },

    adminListSubscriptions(ctx) {
      requireAdmin(ctx);
      return [...e.db.subscriptions].sort((a, b) => a.nextDate.localeCompare(b.nextDate) || a.name.localeCompare(b.name));
    },

    adminSetSubscriptionActive(ctx, subscriptionId, active) {
      requireAdmin(ctx);
      if (typeof active !== 'boolean') throw new ApiError('validation', 'Bitte geben Sie an, ob das Abo aktiv sein soll.');
      const sub = findSubscription(e, subscriptionId);
      if (sub.active === active) return sub;
      sub.active = active;
      const today = todayString(ctx.now);
      // nach einer Pause nicht rückwirkend liefern: nächster passender Liefertag ab morgen
      if (active && sub.nextDate <= today) sub.nextDate = computeNextDate(sub.weekday, today);
      emitSubscription(e, sub);
      const customer = e.db.customers.find((c) => c.id === sub.customerId);
      const b2b = customer?.type === 'b2b';
      const what = b2b ? 'Dauerauftrag' : 'Abo';
      notifyCustomer(
        e,
        sub.customerId,
        {
          title: active ? `${what} fortgesetzt` : `${what} pausiert`,
          body: active
            ? `„${sub.name}“ läuft wieder – nächste Lieferung am ${formatDate(sub.nextDate, 'medium')}.`
            : `Der Markt hat „${sub.name}“ pausiert. Bis zur Fortsetzung wird nichts geliefert. Fragen? ${e.db.settings.phone}`,
          kind: 'order',
          link: b2b ? '/business/dauerauftraege' : '/konto/abos',
        },
        ctx.now,
      );
      return sub;
    },

    adminRunSubscriptions(ctx, untilDate) {
      requireAdmin(ctx);
      if (!isDayString(untilDate)) throw new ApiError('validation', 'Bitte geben Sie ein gültiges Datum an.');
      const today = todayString(ctx.now);
      const created: Order[] = [];
      for (const sub of [...e.db.subscriptions].sort((a, b) => a.nextDate.localeCompare(b.nextDate))) {
        if (!sub.active) continue;
        let date = sub.nextDate;
        let guard = 0;
        while (date <= untilDate && guard++ < 60) {
          if (date >= today) {
            try {
              created.push(createSubscriptionOrder(e, sub, date, ctx.now));
            } catch (err) {
              const msg = err instanceof ApiError ? err.message : 'Unbekannter Fehler';
              const customer = e.db.customers.find((c) => c.id === sub.customerId);
              notifyAdmin(
                e,
                {
                  title: 'Abo konnte nicht ausgeführt werden',
                  body: `„${sub.name}“ (${customer?.name ?? sub.customerId}) für ${formatDate(date, 'short')}: ${msg}`,
                  kind: 'order',
                  link: '/admin/abos',
                },
                ctx.now,
              );
            }
          }
          date = advanceSubscriptionDate(date, sub.interval);
        }
        if (date !== sub.nextDate) {
          sub.nextDate = date;
          emitSubscription(e, sub);
        }
      }
      return created;
    },
  };
}
