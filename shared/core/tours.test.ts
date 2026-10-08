import { describe, expect, it } from 'vitest';
import type { Driver, GeoPoint, Order } from '../types';
import { addDays, weekdayOf } from '../time';
import { createTestCore } from './test/helpers';
import { distributeOrders, loopLength, optimizeSequence } from './planning';
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

  it('adminAutoPlanTours: Vorschau ohne Speichern, nur bestätigte Aufträge, gleiche Planung beim Übernehmen', async () => {
    const t = createTestCore();
    const admin = await t.as('u-admin');
    const day = nextDeliveryDay('2026-10-08');
    // ein Fahrer hat frei
    const ayse = (await admin.adminListDrivers()).find((d) => d.id === 'd-ayse')!;
    await admin.adminSaveDriver({ ...ayse, status: 'off' });
    const all = (await admin.adminListOrders({ date: day, fulfillment: 'delivery' })).filter((o) => !o.tourId);
    const confirmed = all.filter((o) => o.status !== 'pending').map((o) => o.id);
    const pending = all.filter((o) => o.status === 'pending').map((o) => o.id);
    expect(confirmed).toHaveLength(3);
    expect(pending).toHaveLength(2);

    const toursBefore = t.db().tours.length;
    const eventsBefore = t.events.length;
    const preview = await admin.adminAutoPlanTours(day, { preview: true });
    // nichts gespeichert, keine Ereignisse
    expect(t.db().tours.length).toBe(toursBefore);
    expect(t.db().orders.filter((o) => confirmed.includes(o.id)).every((o) => !o.tourId)).toBe(true);
    expect(t.events.length).toBe(eventsBefore);
    expect(preview.every((x) => x.id.startsWith('vorschau-') && x.stops.every((st) => !!st.eta))).toBe(true);
    expect(preview.flatMap((x) => x.orders).every((o) => o.tourId?.startsWith('vorschau-'))).toBe(true);
    // Vorschau ist wiederholbar (deterministisch)
    const again = await admin.adminAutoPlanTours(day, { preview: true });
    expect(again.map((x) => [x.driverId, x.stops.map((st) => st.orderId)])).toEqual(preview.map((x) => [x.driverId, x.stops.map((st) => st.orderId)]));

    const tours = await admin.adminAutoPlanTours(day);
    expect(tours.map((x) => [x.driverId, x.name, x.stops.map((st) => st.orderId)])).toEqual(preview.map((x) => [x.driverId, x.name, x.stops.map((st) => st.orderId)]));
    const planned = tours.flatMap((x) => x.orders.map((o) => o.id));
    expect(new Set(planned)).toEqual(new Set(confirmed));
    // unbestätigte Aufträge bleiben ungeplant
    expect(planned.some((id) => pending.includes(id))).toBe(false);
    expect(tours.every((x) => x.driverId !== 'd-ayse')).toBe(true);
    expect(tours.every((x) => x.route && x.route.legs.length === x.stops.length + 1)).toBe(true);
    expect(tours.every((x) => x.plannedStart && x.orders.every((o) => o.slot.start === x.plannedStart))).toBe(true);
    // nochmal planen: nichts mehr offen
    expect(await admin.adminAutoPlanTours(day)).toEqual([]);

    // ein später bestätigter Einzelauftrag kommt in die bestehende Tour seines Fensters (keine 1-Stopp-Tour)
    const late = t.db().orders.find((o) => pending.includes(o.id))!;
    const existing = tours.find((x) => x.plannedStart === late.slot.start)!;
    expect(existing).toBeTruthy();
    await admin.adminUpdateOrderStatus(late.id, 'confirmed');
    const extendedPreview = await admin.adminAutoPlanTours(day, { preview: true });
    expect(extendedPreview).toHaveLength(1);
    expect(extendedPreview[0].id).toBe(existing.id);
    expect(t.db().tours.find((x) => x.id === existing.id)!.stops).toHaveLength(existing.stops.length);
    const extended = await admin.adminAutoPlanTours(day);
    expect(extended).toHaveLength(1);
    expect(extended[0].id).toBe(existing.id);
    expect(extended[0].stops.map((st) => st.orderId)).toContain(late.id);
    expect(extended[0].route?.legs).toHaveLength(existing.stops.length + 2);
    expect((await admin.getOrder(late.id)).tourId).toBe(existing.id);
  });

  it('distributeOrders: Einzelauftrag wandert in eine Gruppe desselben Fensters mit freier Kapazität', () => {
    const mk = (id: string, crates: number, lat: number, lng: number) =>
      ({
        id,
        number: id,
        fulfillment: 'delivery',
        slot: { id: '', date: '2026-10-09', start: '10:00', end: '12:00' },
        address: { lat, lng },
        lines: [{ qty: crates }],
      }) as unknown as Order;
    const drivers = [
      { id: 'a', name: 'A', capacityCrates: 10 },
      { id: 'b', name: 'B', capacityCrates: 60 },
    ] as Driver[];
    // Richtung vom Markt: Nord (8 Kästen), Ost (5), Süd (1)
    const orders = [mk('o1', 8, 48.27, 11.6545), mk('o2', 5, 48.2525, 11.68), mk('o3', 1, 48.23, 11.6534)];
    // B hat im Fenster schon eine Tour → A wird zuerst gewählt, schafft aber nur den ersten Auftrag
    const groups = distributeOrders(STORE_LOCATION, orders, drivers, { b: 1 }, { '10:00-12:00': ['b'] });
    expect(groups.every((g) => g.orders.length > 1)).toBe(true);
    expect(groups.flatMap((g) => g.orders.map((o) => o.id)).sort()).toEqual(['o1', 'o2', 'o3']);
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
    // Herkunft der Bestellungen (Telefon-Entlastung)
    expect(stats.bySource).toBeTruthy();
    expect(stats.bySource!.app + stats.bySource!.phone + stats.bySource!.subscription).toBe(stats.ordersTotal);
    expect(stats.bySource!.app).toBeGreaterThan(stats.bySource!.phone);
    expect(stats.bySource!.phone).toBeGreaterThan(0);
    expect(stats.bySource!.subscription).toBeGreaterThan(0);
    expect(stats.depositOutstanding).toBeGreaterThan(0);
    const manual = t
      .db()
      .orders.filter((o) => o.status !== 'cancelled' && o.slot.date >= addDays('2026-10-08', -29) && o.slot.date <= '2026-10-08')
      .reduce((s, o) => s + o.totals.itemsGross - o.totals.discount, 0);
    expect(stats.revenueTotal).toBe(manual);
  });
});
