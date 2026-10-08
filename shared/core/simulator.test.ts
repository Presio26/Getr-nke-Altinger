import { describe, expect, it } from 'vitest';
import type { GeoPosition, RealtimeEvent } from '../types';
import { createTestCore } from './test/helpers';
import { legSpeed } from './simulator';
import { haversine } from './geo';

type PositionEvent = Extract<RealtimeEvent, { type: 'driver.position' }>;

describe('Demo-Simulation', () => {
  it('Geschwindigkeit je Abschnitt ist auf 6–16 m/s begrenzt', () => {
    expect(legSpeed({ coords: [], distance: 100, duration: 100 })).toBe(6);
    expect(legSpeed({ coords: [], distance: 1000, duration: 10 })).toBe(16);
    expect(legSpeed({ coords: [], distance: 600, duration: 60 })).toBe(10);
  });

  it('tick bewegt den Fahrer, autoComplete stellt zu, die Tour endet', async () => {
    const t = createTestCore();
    const admin = await t.as('u-admin');
    const anna = await t.as('u-anna');
    const annaOrder = t.db().orders.find((o) => o.tourId === 't-1' && o.customerId === 'c-anna')!;

    const tour = await admin.simulateTour('t-1');
    expect(tour.status).toBe('active');
    expect(tour.simulation).toMatchObject({ running: true, speedFactor: 4, autoComplete: true, legIndex: 0 });
    expect((await anna.getOrder(annaOrder.id)).status).toBe('out_for_delivery');
    expect((await anna.listNotifications())[0].title).toBe('Ihre Bestellung ist unterwegs');
    expect(t.db().drivers.find((d) => d.id === 'd-toni')!.status).toBe('on_tour');

    const start = { ...t.db().drivers.find((d) => d.id === 'd-toni')!.position! };
    const tracking0 = await anna.getTracking(annaOrder.id);
    expect(tracking0.tour?.stopsBefore).toBe(0);
    expect(tracking0.etaMinutes).toBeGreaterThan(0);

    t.events.length = 0;
    t.tickSeconds(3);
    const pos = t.db().drivers.find((d) => d.id === 'd-toni')!.position as GeoPosition;
    expect(pos.simulated).toBe(true);
    expect(haversine(start, pos)).toBeGreaterThan(30);
    expect(pos.heading).toBeTypeOf('number');
    const posEvents = t.events.filter((e) => e.event.type === 'driver.position');
    expect(posEvents.length).toBe(3);
    // Anna (Auftrag unterwegs) bekommt die Position, kein Positions-Update erzeugt Benachrichtigungen
    expect(posEvents[0].audience).toMatchObject({ admin: true, driverIds: ['d-toni'] });
    expect(posEvents[0].audience.customerIds).toContain('c-anna');
    expect((posEvents[0].event as PositionEvent).tourId).toBe('t-1');
    expect(t.events.some((e) => e.event.type === 'notification')).toBe(false);

    const tracking1 = await anna.getTracking(annaOrder.id);
    expect(tracking1.tour?.routeToCustomer?.length).toBeGreaterThan(1);
    expect(tracking1.driver?.position?.simulated).toBe(true);

    // bis zur Ankunft bei Anna (607 m) und Standzeit
    t.tickSeconds(20);
    const arrived = await anna.getOrder(annaOrder.id);
    expect(['out_for_delivery', 'delivered']).toContain(arrived.status);
    t.tickSeconds(12);
    const delivered = await anna.getOrder(annaOrder.id);
    expect(delivered.status).toBe('delivered');
    expect(delivered.proof?.note).toBe('Demo-Simulation');
    expect(delivered.proof?.emptiesCollected).toEqual(annaOrder.emptiesReturn);
    const titles = (await anna.listNotifications()).map((n) => n.title);
    expect(titles).toEqual(expect.arrayContaining(['Ihr Fahrer ist da', 'Bestellung zugestellt']));
    // Kunde des nächsten Stopps wurde informiert
    const wagnerOrder = t.db().orders.find((o) => o.tourId === 't-1' && o.customerId === 'c-wagner')!;
    expect(t.db().notifications.some((n) => n.title === 'Sie sind als Nächstes dran' && n.link === `/bestellung/${wagnerOrder.id}`)).toBe(false); // Wagner hat keinen Zugang
    expect(t.db().tours.find((x) => x.id === 't-1')!.currentStopIndex).toBe(1);

    // gesamte Tour durchfahren
    t.tickSeconds(300);
    const done = t.db().tours.find((x) => x.id === 't-1')!;
    expect(done.status).toBe('completed');
    expect(done.stops.every((s) => s.status === 'delivered')).toBe(true);
    expect(done.simulation?.running).toBe(false);
    expect(t.db().drivers.find((d) => d.id === 'd-toni')!.status).toBe('available');
    const gasthausOrder = t.db().orders.find((o) => o.tourId === 't-1' && o.customerId === 'c-gasthaus')!;
    expect(gasthausOrder.status).toBe('delivered');
    expect(gasthausOrder.paymentStatus).toBe('open'); // Rechnung folgt
    const wagner = t.db().orders.find((o) => o.id === wagnerOrder.id)!;
    expect(wagner.proof?.amountCollected).toBe(wagner.totals.total); // bar kassiert
    expect(t.core.hasRunningSimulation()).toBe(false);
  });

  it('ohne autoComplete wartet die Simulation am Stopp auf den Fahrer', async () => {
    const t = createTestCore();
    const toni = await t.as('u-toni');
    await toni.simulateTour('t-1', { autoComplete: false, speedFactor: 8 });
    t.tickSeconds(30);
    const tour = t.db().tours.find((x) => x.id === 't-1')!;
    expect(tour.stops[0].status).toBe('arrived');
    expect(tour.simulation?.legIndex).toBe(0);
    t.tickSeconds(30);
    expect(t.db().tours.find((x) => x.id === 't-1')!.simulation?.legIndex).toBe(0);
    const orderId = tour.stops[0].orderId;
    await toni.completeDelivery(orderId, { emptiesCollected: [{ depositTypeId: 'kasten-bier-20', qty: 1 }], receivedBy: 'A. Berger', amountCollected: 0 });
    const order = t.db().orders.find((o) => o.id === orderId)!;
    expect(order.status).toBe('delivered');
    // weniger Leergut als angekündigt → Gutschrift angepasst
    expect(order.totals.depositRefund).toBe(310);
    t.tickSeconds(2);
    expect(t.db().tours.find((x) => x.id === 't-1')!.simulation?.legIndex).toBe(1);
  });

  it('stopSimulation hält den Fahrer an; echte GPS-Positionen werden während der Simulation ignoriert', async () => {
    const t = createTestCore();
    const toni = await t.as('u-toni');
    await toni.simulateTour('t-1');
    t.tickSeconds(2);
    await toni.updateDriverPosition({ lat: 48.0, lng: 11.0 });
    expect(t.db().drivers.find((d) => d.id === 'd-toni')!.position!.lat).toBeGreaterThan(48.2);
    await toni.stopSimulation('t-1');
    const p1 = { ...t.db().drivers.find((d) => d.id === 'd-toni')!.position! };
    t.tickSeconds(5);
    const p2 = t.db().drivers.find((d) => d.id === 'd-toni')!.position!;
    expect(p2.lat).toBe(p1.lat);
    expect(p2.lng).toBe(p1.lng);
    expect(t.core.hasRunningSimulation()).toBe(false);
    // echte Position wird übernommen
    await toni.updateDriverPosition({ lat: 48.2501, lng: 11.6533, heading: 90, speed: 7 });
    const real = t.db().drivers.find((d) => d.id === 'd-toni')!.position!;
    expect(real).toMatchObject({ lat: 48.2501, lng: 11.6533, simulated: false });
    const anna = await t.as('u-anna');
    const annaOrder = t.db().orders.find((o) => o.tourId === 't-1' && o.customerId === 'c-anna')!;
    const tracking = await anna.getTracking(annaOrder.id);
    expect(tracking.etaMinutes).toBeGreaterThan(0);
    expect(tracking.tour?.routeToCustomer?.[0]).toEqual([48.2501, 11.6533]);
    // weiter simulieren
    await toni.simulateTour('t-1');
    expect(t.core.hasRunningSimulation()).toBe(true);
  });

  it('Tracking: ETA in Minuten, Stopps davor, Restroute', async () => {
    const t = createTestCore();
    const admin = await t.as('u-admin');
    const gasthaus = await t.as('u-gasthaus');
    const order = t.db().orders.find((o) => o.tourId === 't-1' && o.customerId === 'c-gasthaus')!;
    const planned = await gasthaus.getTracking(order.id);
    expect(planned.tour).toMatchObject({ status: 'planned', stopIndex: 3, stopsBefore: 3 });
    expect(planned.store.phone).toBe('089 3202562');
    expect(planned.driver?.name).toBe('Toni Huber');
    await admin.simulateTour('t-1', { speedFactor: 2 });
    t.tickSeconds(5);
    const a = await gasthaus.getTracking(order.id);
    t.tickSeconds(60);
    const b = await gasthaus.getTracking(order.id);
    expect(a.etaMinutes!).toBeGreaterThan(0);
    expect(b.etaMinutes!).toBeLessThanOrEqual(a.etaMinutes!);
    expect(b.tour!.stopsBefore).toBeLessThan(3);
    expect(b.tour!.routeToCustomer!.length).toBeLessThan(a.tour!.routeToCustomer!.length + 1);
  });

  it('Fahrer-Ablauf manuell: Ankunft, Fehlschlag, Abschluss', async () => {
    const t = createTestCore();
    const lukas = await t.as('u-lukas');
    const tour = await lukas.startTour('t-2');
    expect(tour.status).toBe('active');
    const orders = (await lukas.getDriverToday()).tours[0].orders;
    // „wird zusammengestellt“ wurde beim Start nachgezogen
    expect(orders.every((o) => o.status === 'out_for_delivery')).toBe(true);
    const bauer = orders.find((o) => o.customerId === 'c-bauer')!;
    expect(bauer.statusHistory.map((s) => s.status)).toEqual(['pending', 'confirmed', 'picking', 'ready', 'out_for_delivery']);
    await expect(lukas.finishTour('t-2')).rejects.toMatchObject({ code: 'conflict' });
    for (const o of orders) {
      await lukas.arriveAtStop(o.id);
      if (o.customerId === 'c-bauer') await lukas.failDelivery(o.id, 'Niemand angetroffen');
      else await lukas.completeDelivery(o.id, { emptiesCollected: [] });
    }
    const finished = await lukas.finishTour('t-2');
    expect(finished.status).toBe('completed');
    expect(finished.stops.map((s) => s.status)).toEqual(['delivered', 'delivered', 'failed']);
    const failed = t.db().orders.find((o) => o.id === bauer.id)!;
    expect(failed.status).toBe('failed');
    expect(failed.failureReason).toBe('Niemand angetroffen');
    expect(t.db().drivers.find((d) => d.id === 'd-lukas')!.status).toBe('available');
  });
});
