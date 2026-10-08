import { describe, expect, it } from 'vitest';
import type { GeoPoint } from '../types';
import { addDays, weekdayOf } from '../time';
import { createTestCore } from './test/helpers';
import { loopLength, optimizeSequence } from './planning';
import { STORE_LOCATION } from './seed/settings';

function nextDeliveryDay(today: string): string {
  let d = addDays(today, 1);
  while (weekdayOf(d) === 0) d = addDays(d, 1);
  return d;
}

describe('Tourenplanung', () => {
  it('Nearest-Neighbor + 2-Opt findet eine kurze Rundfahrt', () => {
    const pts: GeoPoint[] = [
      { lat: 48.26, lng: 11.66 },
      { lat: 48.24, lng: 11.64 },
      { lat: 48.255, lng: 11.665 },
      { lat: 48.245, lng: 11.635 },
      { lat: 48.25, lng: 11.67 },
    ];
    const order = optimizeSequence(STORE_LOCATION, pts);
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4]);
    const identity = loopLength(STORE_LOCATION, pts, [0, 1, 2, 3, 4]);
    expect(loopLength(STORE_LOCATION, pts, order)).toBeLessThanOrEqual(identity);
  });

  it('adminSaveTour: Route Markt → Stopps → Markt, ETAs, Aufträge aus anderer Tour lösen', async () => {
    const t = createTestCore();
    const admin = await t.as('u-admin');
    const day = nextDeliveryDay('2026-10-08');
    const open = (await admin.adminListOrders({ date: day, fulfillment: 'delivery' })).filter((o) => !o.tourId);
    expect(open).toHaveLength(5);
    const tour = await admin.adminSaveTour({ date: day, driverId: 'd-ayse', orderIds: open.slice(0, 3).map((o) => o.id), plannedStart: '10:00' });
    expect(tour.status).toBe('planned');
    expect(tour.route?.legs).toHaveLength(4);
    expect(tour.stops.every((s) => !!s.eta)).toBe(true);
    expect(Date.parse(tour.stops[0].eta!)).toBeGreaterThan(Date.parse(`${day}T08:00:00Z`));
    const o0 = await admin.getOrder(open[0].id);
    expect(o0).toMatchObject({ tourId: tour.id, driverId: 'd-ayse' });

    // Auftrag in eine zweite Tour verschieben → aus der ersten entfernt
    const second = await admin.adminSaveTour({ date: day, driverId: 'd-lukas', orderIds: [open[0].id, open[3].id] });
    expect(second.stops.map((s) => s.orderId)).toEqual([open[0].id, open[3].id]);
    const first = (await admin.adminListTours(day)).find((x) => x.id === tour.id)!;
    expect(first.stops.map((s) => s.orderId)).toEqual(open.slice(1, 3).map((o) => o.id));
    expect(first.route?.legs).toHaveLength(3);

    // Abholungen können nicht eingeplant werden
    const pickup = t.db().orders.find((o) => o.fulfillment === 'pickup' && o.status === 'ready')!;
    await expect(admin.adminSaveTour({ date: day, driverId: 'd-toni', orderIds: [pickup.id] })).rejects.toMatchObject({ code: 'validation' });

    // Optimieren behält alle Stopps
    const optimized = await admin.adminOptimizeTour(second.id);
    expect(optimized.stops.map((s) => s.orderId).sort()).toEqual([open[0].id, open[3].id].sort());

    // Löschen: geplante Tour ja, Aufträge wieder frei
    await admin.adminDeleteTour(second.id);
    expect((await admin.getOrder(open[0].id)).tourId).toBeUndefined();
    expect(t.events.some((e) => e.event.type === 'tour.deleted')).toBe(true);
  });

  it('adminAutoPlanTours verteilt offene Lieferungen auf verfügbare Fahrer', async () => {
    const t = createTestCore();
    const admin = await t.as('u-admin');
    const day = nextDeliveryDay('2026-10-08');
    // ein Fahrer hat frei
    const ayse = (await admin.adminListDrivers()).find((d) => d.id === 'd-ayse')!;
    await admin.adminSaveDriver({ ...ayse, status: 'off' });
    const tours = await admin.adminAutoPlanTours(day);
    expect(tours.length).toBeGreaterThanOrEqual(2);
    const planned = tours.flatMap((x) => x.orders.map((o) => o.id));
    expect(new Set(planned).size).toBe(5);
    expect(tours.every((x) => x.driverId !== 'd-ayse')).toBe(true);
    expect(tours.every((x) => x.route && x.route.legs.length === x.stops.length + 1)).toBe(true);
    expect(tours.every((x) => x.plannedStart && x.orders.every((o) => o.slot.start === x.plannedStart))).toBe(true);
    // nochmal planen: nichts mehr offen
    expect(await admin.adminAutoPlanTours(day)).toEqual([]);
  });

  it('laufende Touren können nicht gelöscht werden', async () => {
    const t = createTestCore();
    const admin = await t.as('u-admin');
    await admin.startTour('t-3');
    await expect(admin.adminDeleteTour('t-3')).rejects.toMatchObject({ code: 'conflict' });
    await expect(admin.startTour('t-1').then(() => admin.startTour('t-1'))).resolves.toMatchObject({ status: 'active' });
  });

  it('Statistik aus den Bestellungen', async () => {
    const t = createTestCore();
    const admin = await t.as('u-admin');
    const stats = await admin.adminGetStats(30);
    expect(stats.days).toBe(30);
    expect(stats.revenueByDay).toHaveLength(30);
    expect(stats.revenueByDay.reduce((s, d) => s + d.b2c + d.b2b, 0)).toBe(stats.revenueTotal);
    expect(stats.revenueByDay.reduce((s, d) => s + d.orders, 0)).toBe(stats.ordersTotal);
    expect(stats.byFulfillment.delivery + stats.byFulfillment.pickup).toBe(stats.ordersTotal);
    expect(stats.byCustomerType.b2c + stats.byCustomerType.b2b).toBe(stats.ordersTotal);
    expect(stats.ordersByHour.reduce((s, n) => s + n, 0)).toBe(stats.ordersTotal);
    expect(stats.avgOrderValue).toBe(Math.round(stats.revenueTotal / stats.ordersTotal));
    expect(stats.topProducts[0].revenue).toBeGreaterThan(0);
    expect(stats.lowStock.map((p) => p.id).sort()).toEqual(['fritz-kola', 'giesinger-erhellung', 'havana-club-3']);
    expect(stats.ratingAvg).toBeGreaterThanOrEqual(4.4);
    expect(stats.ratingAvg).toBeLessThanOrEqual(4.95);
    expect(stats.overdueInvoicesAmount).toBeGreaterThan(0);
    expect(stats.openInvoicesAmount).toBeGreaterThan(stats.overdueInvoicesAmount);
    expect(stats.today.openDeliveries).toBe(12);
    expect(stats.today.openPickups).toBe(3);
    expect(stats.depositOutstanding).toBeGreaterThan(0);
    const manual = t
      .db()
      .orders.filter((o) => o.status !== 'cancelled' && o.slot.date >= addDays('2026-10-08', -29) && o.slot.date <= '2026-10-08')
      .reduce((s, o) => s + o.totals.itemsGross - o.totals.discount, 0);
    expect(stats.revenueTotal).toBe(manual);
  });
});
