/**
 * Auswertungen für das Markt-Dashboard – vollständig aus den Bestellungen berechnet.
 * Umsatz = Warenwert brutto (itemsGross) − Gutschein-Rabatt; stornierte Bestellungen ausgenommen.
 */
import type { Order, Stats } from '../types';
import { addDays, berlinParts, dayString, todayString } from '../time';
import type { Db } from './db';
import { invoiceStatus } from './invoices';

export const orderRevenue = (o: Order) => o.totals.itemsGross - o.totals.discount;

export function computeStats(db: Db, daysInput: number, now: Date): Stats {
  const days = Math.max(1, Math.min(365, Math.floor(Number.isFinite(daysInput) ? daysInput : 30)));
  const today = todayString(now);
  const from = addDays(today, -(days - 1));
  const valid = db.orders.filter((o) => o.status !== 'cancelled');
  const inRange = valid.filter((o) => o.slot.date >= from && o.slot.date <= today);

  const byDay = new Map<string, { date: string; b2c: number; b2b: number; orders: number }>();
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    byDay.set(d, { date: d, b2c: 0, b2b: 0, orders: 0 });
  }
  const ordersByHour = new Array<number>(24).fill(0);
  const products = new Map<string, { productId: string; name: string; qty: number; revenue: number }>();
  const categories = new Map<string, number>();
  let revenueTotal = 0;
  const byFulfillment = { delivery: 0, pickup: 0 };
  const byCustomerType = { b2c: 0, b2b: 0 };

  for (const o of inRange) {
    const rev = orderRevenue(o);
    revenueTotal += rev;
    const day = byDay.get(o.slot.date);
    if (day) {
      day[o.customerType] += rev;
      day.orders += 1;
    }
    byFulfillment[o.fulfillment] += 1;
    byCustomerType[o.customerType] += 1;
    ordersByHour[berlinParts(new Date(o.createdAt)).hour] += 1;
    // Rabatt anteilig auf die Positionen verteilen
    const factor = o.totals.itemsGross > 0 ? rev / o.totals.itemsGross : 1;
    for (const l of o.lines) {
      const lineRev = Math.round(l.lineGross * factor);
      const p = products.get(l.productId) ?? { productId: l.productId, name: l.name, qty: 0, revenue: 0 };
      p.qty += l.qty;
      p.revenue += lineRev;
      products.set(l.productId, p);
      const catId = db.products.find((x) => x.id === l.productId)?.categoryId ?? 'sonstiges';
      categories.set(catId, (categories.get(catId) ?? 0) + lineRev);
    }
  }

  const todays = valid.filter((o) => o.slot.date === today);
  const rated = db.orders.filter((o) => o.rating);
  const ratingSum = rated.reduce((s, o) => s + (o.rating?.stars ?? 0), 0);

  let depositOutstanding = 0;
  for (const c of db.customers) {
    for (const [typeId, qty] of Object.entries(c.depositBalance ?? {})) {
      const t = db.depositTypes.find((x) => x.id === typeId);
      if (t && qty > 0) depositOutstanding += t.amount * qty;
    }
  }

  let openInvoicesAmount = 0;
  let overdueInvoicesAmount = 0;
  for (const inv of db.invoices) {
    const st = invoiceStatus(inv, now);
    if (st === 'paid') continue;
    openInvoicesAmount += inv.gross;
    if (st === 'overdue') overdueInvoicesAmount += inv.gross;
  }

  return {
    days,
    revenueByDay: [...byDay.values()],
    revenueTotal,
    ordersTotal: inRange.length,
    avgOrderValue: inRange.length ? Math.round(revenueTotal / inRange.length) : 0,
    today: {
      orders: todays.length,
      revenue: todays.reduce((s, o) => s + orderRevenue(o), 0),
      openDeliveries: todays.filter((o) => o.fulfillment === 'delivery' && ['pending', 'confirmed', 'picking', 'ready', 'out_for_delivery'].includes(o.status)).length,
      openPickups: todays.filter((o) => o.fulfillment === 'pickup' && ['pending', 'confirmed', 'picking', 'ready'].includes(o.status)).length,
      deliveredToday: valid.filter(
        (o) =>
          (o.status === 'delivered' || o.status === 'picked_up') &&
          dayString(new Date(o.statusHistory[o.statusHistory.length - 1]?.at ?? o.updatedAt)) === today,
      ).length,
    },
    byFulfillment,
    byCustomerType,
    topProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue || b.qty - a.qty).slice(0, 10),
    byCategory: [...categories.entries()]
      .map(([categoryId, revenue]) => ({
        categoryId,
        name: db.categories.find((c) => c.id === categoryId)?.name ?? 'Sonstiges',
        revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    ordersByHour,
    lowStock: db.products.filter((p) => p.active && !p.isRental && p.stock < p.minStock).sort((a, b) => a.stock / Math.max(1, a.minStock) - b.stock / Math.max(1, b.minStock)),
    depositOutstanding,
    ratingAvg: rated.length ? Math.round((ratingSum / rated.length) * 10) / 10 : 0,
    ratingCount: rated.length,
    newCustomers: db.customers.filter((c) => dayString(new Date(c.createdAt)) >= from).length,
    openInvoicesAmount,
    overdueInvoicesAmount,
  };
}
