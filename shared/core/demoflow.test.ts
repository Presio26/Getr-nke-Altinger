/**
 * Fehlerbehebungsrunde vor der Inhaber-Demo: Optimieren, Simulation mit manuellem Stopp, ETA mit Rest-Standzeit,
 * Telefonbestellung, Abo pausieren, Abholfrist an Öffnungszeiten.
 */
import { describe, expect, it } from 'vitest';
import type { ApiError } from '../api';
import type { GeoPoint, RouteLeg } from '../types';
import { berlinDate, dayString, timeString } from '../time';
import { createTestCore, checkout, firstFreeSlot } from './test/helpers';
import { straightLineLeg, type RoutingProvider } from './routing';
import { pickupHoldUntil } from './slots';
import { isRouteImprovement } from './handlers/tours';
import { createSeedDb } from './seed';
import { DEFAULT_NOW } from './test/helpers';

const errorOf = async (p: Promise<unknown>): Promise<ApiError> => {
  try {
    await p;
  } catch (err) {
    return err as ApiError;
  }
  throw new Error('Fehler erwartet');
};

const customerOf = (t: ReturnType<typeof createTestCore>, tourId: string) =>
  t.db().tours.find((x) => x.id === tourId)!.stops.map((s) => t.db().orders.find((o) => o.id === s.orderId)!.customerId);

describe('adminOptimizeTour übernimmt nur echte Verbesserungen', () => {
  it('Tour 1 der Demo ist bereits optimal: Anna bleibt Stopp 1, nichts wird gesendet', async () => {
    const t = createTestCore();
    const admin = await t.as('u-admin');
    const before = t.db().tours.find((x) => x.id === 't-1')!;
    const route = JSON.stringify(before.route);
    t.events.length = 0;
    const res = await admin.adminOptimizeTour('t-1');
    expect(customerOf(t, 't-1')).toEqual(['c-anna', 'c-wagner', 'c-hofmann', 'c-gasthaus']);
    expect(res.stops.map((s) => s.orderId)).toEqual(before.stops.map((s) => s.orderId));
    expect(JSON.stringify(t.db().tours.find((x) => x.id === 't-1')!.route)).toBe(route);
    expect(t.events.filter((e) => e.event.type === 'tour.updated')).toHaveLength(0);
  });

  it('ungünstige Reihenfolge wird verbessert (kürzere Route)', async () => {
    const t = createTestCore();
    const admin = await t.as('u-admin');
    const t1 = t.db().tours.find((x) => x.id === 't-1')!;
    const byCustomer = (c: string) => t1.stops.find((s) => t.db().orders.find((o) => o.id === s.orderId)!.customerId === c)!.orderId;
    // Zickzack: Anna, Gasthaus, Wagner, Hofmann
    const zigzag = ['c-anna', 'c-gasthaus', 'c-wagner', 'c-hofmann'].map(byCustomer);
    const saved = await admin.adminSaveTour({ id: 't-1', date: t1.date, driverId: t1.driverId, orderIds: zigzag });
    const res = await admin.adminOptimizeTour('t-1');
    expect(res.route!.distance).toBeLessThan(saved.route!.distance);
    expect(res.stops.map((s) => s.orderId)).not.toEqual(zigzag);
  });

  it('ist die neue Reihenfolge auf der Straße länger, bleibt alles, wie es ist', async () => {
    // Straßennetz-Attrappe: der Abschnitt Markt → Gasthaus ist ein großer Umweg
    const seed = createSeedDb(DEFAULT_NOW);
    const store = seed.settings.location;
    const gasthaus = seed.customers.find((c) => c.id === 'c-gasthaus')!.addresses[0];
    const near = (a: GeoPoint, b: GeoPoint) => Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;
    const routing: RoutingProvider = {
      async route(points) {
        const legs: RouteLeg[] = [];
        for (let i = 1; i < points.length; i++) {
          const leg = straightLineLeg(points[i - 1], points[i]);
          if (near(points[i - 1], store) && near(points[i], gasthaus)) legs.push({ ...leg, distance: leg.distance + 4000, duration: leg.duration + 400 });
          else legs.push(leg);
        }
        return legs;
      },
    };
    const t = createTestCore({ routing, db: seed });
    const admin = await t.as('u-admin');
    const t1 = t.db().tours.find((x) => x.id === 't-1')!;
    const byCustomer = (c: string) => t1.stops.find((s) => t.db().orders.find((o) => o.id === s.orderId)!.customerId === c)!.orderId;
    // Luftlinie spricht für „Gasthaus zuerst“ (deutlich kürzer als diese Reihenfolge) …
    const order = ['c-hofmann', 'c-wagner', 'c-anna', 'c-gasthaus'].map(byCustomer);
    await admin.adminSaveTour({ id: 't-1', date: t1.date, driverId: t1.driverId, orderIds: order });
    const res = await admin.adminOptimizeTour('t-1');
    // … das Straßennetz nicht: keine Verschlechterung
    const st = res.stops.map((s) => t.db().orders.find((o) => o.id === s.orderId)!.customerId);
    expect(st[0]).not.toBe('c-gasthaus');
  });

  it('isRouteImprovement: mindestens 2 % kürzer, nie länger', () => {
    expect(isRouteImprovement({ distance: 3988, duration: 757 }, { distance: 3545, duration: 589 })).toBe(false);
    expect(isRouteImprovement({ distance: 3500, duration: 585 }, { distance: 3545, duration: 589 })).toBe(false); // 1,3 %
    expect(isRouteImprovement({ distance: 3000, duration: 560 }, { distance: 3545, duration: 589 })).toBe(true);
    expect(isRouteImprovement({ distance: 3000, duration: 700 }, { distance: 3545, duration: 589 })).toBe(false);
    expect(isRouteImprovement({ distance: 3545, duration: 589 }, { distance: 3545, duration: 589 })).toBe(false);
  });
});

describe('Simulation mit manuellem Stopp (Demo: Annas Stopp)', () => {
  it('fremde Stopps automatisch, an Annas Stopp „Vor Ort“ und warten, danach automatisch weiter', async () => {
    const t = createTestCore();
    const admin = await t.as('u-admin');
    const anna = await t.as('u-anna');
    const toni = await t.as('u-toni');
    const tour0 = t.db().tours.find((x) => x.id === 't-1')!;
    const annaOrderId = tour0.stops[0].orderId;
    // umsortieren: Anna als Stopp 2, damit vorher ein automatischer Stopp liegt
    const ids = tour0.stops.map((s) => s.orderId);
    await admin.adminSaveTour({ id: 't-1', date: tour0.date, driverId: tour0.driverId, orderIds: [ids[1], ids[0], ids[2], ids[3]] });
    const sim = await admin.simulateTour('t-1', { speedFactor: 8, autoComplete: true, manualOrderIds: [annaOrderId, 'o-gibt-es-nicht'] });
    expect(sim.simulation).toMatchObject({ autoComplete: true, manualOrderIds: [annaOrderId] });

    const tour = () => t.db().tours.find((x) => x.id === 't-1')!;
    // Stopp 1 (Wagner) wird automatisch zugestellt, dann Ankunft bei Anna
    for (let i = 0; i < 200 && tour().stops[1].status === 'pending'; i++) t.tickSeconds(1);
    expect(tour().stops[0].status).toBe('delivered');
    expect(tour().stops[1].status).toBe('arrived');
    expect((await anna.listNotifications())[0].title).toBe('Ihr Fahrer ist da');
    // wartet – auch lange nach der Standzeit
    t.tickSeconds(90);
    expect(tour().simulation!.legIndex).toBe(1);
    expect(tour().stops[1].status).toBe('arrived');
    expect(t.db().orders.find((o) => o.id === annaOrderId)!.status).toBe('out_for_delivery');
    // ETA des nächsten Kunden berücksichtigt, dass Toni noch bei Anna steht (mind. 1 Min. Rest-Standzeit)
    const next = tour().stops[2].orderId;
    const eta = await admin.getTracking(next);
    expect(eta.etaMinutes!).toBeGreaterThanOrEqual(2);

    // Fahrer schließt Annas Stopp ab (bar kassiert) → Simulation fährt selbst weiter und stellt den Rest zu
    const annaOrder = t.db().orders.find((o) => o.id === annaOrderId)!;
    expect(annaOrder.paymentMethod).toBe('cash');
    await toni.completeDelivery(annaOrderId, { emptiesCollected: annaOrder.emptiesReturn, receivedBy: 'Anna Berger', amountCollected: annaOrder.totals.total });
    t.tickSeconds(3);
    expect(tour().simulation!.legIndex).toBe(2);
    t.tickSeconds(400);
    expect(tour().status).toBe('completed');
    expect(tour().stops.map((s) => s.status)).toEqual(['delivered', 'delivered', 'delivered', 'delivered']);
    expect(t.db().orders.find((o) => o.id === annaOrderId)!.proof?.amountCollected).toBe(annaOrder.totals.total);
  });

  it('Problem melden am manuellen Stopp: Simulation fährt danach weiter', async () => {
    const t = createTestCore();
    const toni = await t.as('u-toni');
    const annaOrderId = t.db().tours.find((x) => x.id === 't-1')!.stops[0].orderId;
    await toni.simulateTour('t-1', { speedFactor: 8, manualOrderIds: [annaOrderId] });
    const tour = () => t.db().tours.find((x) => x.id === 't-1')!;
    for (let i = 0; i < 120 && tour().stops[0].status === 'pending'; i++) t.tickSeconds(1);
    expect(tour().stops[0].status).toBe('arrived');
    t.tickSeconds(30);
    expect(tour().simulation!.legIndex).toBe(0);
    await toni.failDelivery(annaOrderId, 'Niemand angetroffen');
    t.tickSeconds(400);
    expect(tour().stops.map((s) => s.status)).toEqual(['failed', 'delivered', 'delivered', 'delivered']);
  });
});

describe('ETA: Rest-Standzeit am Stopp „Vor Ort“ (echte Fahrt)', () => {
  it('folgende Kunden sehen nicht „in 1 Min.“, solange der Fahrer noch vor Ort ist', async () => {
    const t = createTestCore();
    const toni = await t.as('u-toni');
    const admin = await t.as('u-admin');
    await toni.startTour('t-1');
    const stops = t.db().tours.find((x) => x.id === 't-1')!.stops;
    // Fahrer steht bei Anna (Stopp 1)
    await toni.updateDriverPosition({ lat: 48.2484249, lng: 11.6538629 });
    await toni.arriveAtStop(stops[0].orderId);
    const wagner = stops[1].orderId;
    const right = await admin.getTracking(wagner);
    // Fahrt zu Wagner (~2,5 Min.) + Rest-Standzeit bei Anna (4 Min.)
    expect(right.etaMinutes!).toBeGreaterThanOrEqual(5);
    // nach 3 Minuten vor Ort: noch ~1 Min. Standzeit + Fahrt
    t.advance(3 * 60_000);
    const later = await admin.getTracking(wagner);
    expect(later.etaMinutes!).toBeLessThan(right.etaMinutes!);
    expect(later.etaMinutes!).toBeGreaterThanOrEqual(2);
    // auch die gespeicherten ETAs der Stopps rechnen mit der Rest-Standzeit
    const order = t.db().orders.find((o) => o.id === wagner)!;
    expect(Date.parse(order.eta!) - Date.parse(t.db().tours.find((x) => x.id === 't-1')!.stops[0].arrivedAt!)).toBeGreaterThanOrEqual(4 * 60_000);
  });
});

describe('Telefonbestellung durch den Markt', () => {
  it('adminQuote/adminPlaceOrder im Namen des Kunden: Herkunft Telefon, bestätigt, Kunde informiert', async () => {
    const t = createTestCore();
    const admin = await t.as('u-admin');
    const anna = await t.as('u-anna');
    const slot = await firstFreeSlot(admin, 'delivery', 1);
    const input = checkout({
      items: [{ productId: 'augustiner-hell', qty: 2 }],
      slotId: slot.id,
      addressId: 'a-anna',
      emptiesReturn: [{ depositTypeId: 'kasten-bier-20', qty: 2 }],
    });
    const quote = await admin.adminQuote('c-anna', input);
    expect(quote.customerType).toBe('b2c');
    expect(quote.errors).toEqual([]);
    // am Telefon keine Online-Zahlung
    expect(quote.paymentMethods).toEqual(['cash', 'ec']);
    expect((await admin.adminQuote('c-anna', { ...input, paymentMethod: 'paypal' })).errors.map((e) => e.code)).toContain('payment');
    expect((await errorOf(admin.adminPlaceOrder('c-anna', { ...input, paymentMethod: 'card' }))).code).toBe('validation');
    expect(quote.loyaltyPointsEarned).toBeGreaterThan(0);
    // Leergut-Konto des Kunden gilt auch am Telefon
    const tooMuch = await admin.adminQuote('c-anna', { ...input, emptiesReturn: [{ depositTypeId: 'kasten-bier-20', qty: 9 }] });
    expect(tooMuch.errors.map((e) => e.code)).toContain('empties');

    const before = (await anna.listNotifications()).length;
    const adminBefore = (await admin.listNotifications()).length;
    const order = await admin.adminPlaceOrder('c-anna', input);
    expect(order).toMatchObject({ source: 'phone', status: 'confirmed', customerId: 'c-anna', customerName: 'Anna Berger' });
    expect(order.totals.total).toBe(quote.totals.total);
    expect(order.statusHistory.map((h) => [h.status, h.by])).toEqual([
      ['pending', 'Markt (Telefon)'],
      ['confirmed', 'Markt (Telefon)'],
    ]);
    const notes = await anna.listNotifications();
    expect(notes.length - before).toBe(1);
    expect(notes[0]).toMatchObject({ title: 'Telefonische Bestellung bestätigt', link: `/bestellung/${order.id}` });
    // kein „Neue Bestellung“-Hinweis an den Markt (er hat sie selbst erfasst), keine Demo-Autobestätigung
    expect((await admin.listNotifications()).length).toBe(adminBefore);
    expect(t.db().autoConfirm ?? []).toEqual([]);
    expect((await anna.listMyOrders())[0].id).toBe(order.id);
    expect(t.events.some((e) => e.event.type === 'order.created' && e.event.order.id === order.id && e.audience.customerIds?.includes('c-anna'))).toBe(true);

    // Kunde selbst bestellt: Herkunft App
    const own = await anna.placeOrder(checkout({ items: [{ productId: 'augustiner-hell', qty: 1 }], fulfillment: 'pickup', slotId: (await firstFreeSlot(anna, 'pickup')).id }));
    expect(own.source).toBe('app');
    expect(own.statusHistory[0].by).toBe('Kunde');
  });

  it('nur der Markt darf; gesperrte Geschäftskunden und Fehler wie in der Kasse', async () => {
    const t = createTestCore();
    const admin = await t.as('u-admin');
    const anna = await t.as('u-anna');
    const slot = await firstFreeSlot(admin, 'delivery', 1);
    const input = checkout({ items: [{ productId: 'augustiner-hell', qty: 2 }], slotId: slot.id });
    expect((await errorOf(anna.adminPlaceOrder('c-anna', input))).code).toBe('forbidden');
    expect((await errorOf(anna.adminQuote('c-anna', input))).code).toBe('forbidden');
    expect((await errorOf(admin.adminPlaceOrder('c-gibt-es-nicht', input))).code).toBe('not_found');
    const minOrder = await errorOf(admin.adminPlaceOrder('c-anna', checkout({ items: [{ productId: 'eiswuerfel-2kg', qty: 1 }], slotId: slot.id })));
    expect(minOrder.code).toBe('validation');
    // Geschäftskunde auf Rechnung (Kreditlimit, Netto-Preise wie im Portal)
    const b2b = await admin.adminPlaceOrder('c-gasthaus', { ...input, paymentMethod: 'invoice', costCenter: 'Schank' });
    expect(b2b).toMatchObject({ source: 'phone', customerType: 'b2b', paymentMethod: 'invoice', costCenter: 'Schank' });
    expect(b2b.lines[0].priceNote).toBe('Gastro-Rabatt 8 %');
    const gasthaus = t.db().customers.find((c) => c.id === 'c-gasthaus')!;
    await admin.adminSaveCustomer({ ...gasthaus, b2b: { ...gasthaus.b2b!, status: 'blocked' } });
    expect((await errorOf(admin.adminPlaceOrder('c-gasthaus', { ...input, paymentMethod: 'cash' }))).code).toBe('forbidden');
  });

  it('Abo-Läufe tragen die Herkunft „subscription“, Statistik zählt nach Herkunft', async () => {
    const t = createTestCore({ demoMode: false });
    const admin = await t.as('u-admin');
    const created = await admin.adminRunSubscriptions('2026-10-20');
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((o) => o.source === 'subscription' && o.statusHistory[0].by === 'Abo')).toBe(true);
    const stats = await admin.adminGetStats(1);
    expect(stats.bySource!.app + stats.bySource!.phone + stats.bySource!.subscription).toBe(stats.ordersTotal);
  });
});

describe('Abo durch den Markt pausieren/fortsetzen', () => {
  it('adminSetSubscriptionActive: Kunde informiert, pausierte Abos laufen nicht, Fortsetzen ab morgen', async () => {
    const t = createTestCore({ demoMode: false });
    const admin = await t.as('u-admin');
    const anna = await t.as('u-anna');
    const paused = await admin.adminSetSubscriptionActive('s-anna', false);
    expect(paused.active).toBe(false);
    expect((await anna.listNotifications())[0]).toMatchObject({ title: 'Abo pausiert', link: '/konto/abos' });
    expect(t.events.some((e) => e.event.type === 'subscription.updated' && e.audience.customerIds?.includes('c-anna'))).toBe(true);
    const run = await admin.adminRunSubscriptions('2026-11-30');
    expect(run.some((o) => o.subscriptionId === 's-anna')).toBe(false);
    // unverändert → keine weitere Nachricht
    const count = (await anna.listNotifications()).length;
    await admin.adminSetSubscriptionActive('s-anna', false);
    expect((await anna.listNotifications()).length).toBe(count);
    // Fortsetzen: nächster Termin nicht in der Vergangenheit
    t.db().subscriptions.find((s) => s.id === 's-anna')!.nextDate = '2026-10-01';
    const resumed = await admin.adminSetSubscriptionActive('s-anna', true);
    expect(resumed.active).toBe(true);
    expect(resumed.nextDate > '2026-10-08').toBe(true);
    expect((await anna.listNotifications())[0].title).toBe('Abo fortgesetzt');
    // Geschäftskunde: „Dauerauftrag“, Link ins B2B-Portal
    await admin.adminSetSubscriptionActive('s-gasthaus', false);
    const gasthaus = await t.as('u-gasthaus');
    expect((await gasthaus.listNotifications())[0]).toMatchObject({ title: 'Dauerauftrag pausiert', link: '/business/dauerauftraege' });
    // Rechte und Eingaben
    expect((await errorOf(anna.adminSetSubscriptionActive('s-anna', false))).code).toBe('forbidden');
    expect((await errorOf(admin.adminSetSubscriptionActive('s-gibt-es-nicht', false))).code).toBe('not_found');
    expect((await errorOf(admin.adminSetSubscriptionActive('s-anna', 'ja' as unknown as boolean))).code).toBe('validation');
  });
});

describe('Abholfrist (Click & Collect) an den Öffnungszeiten', () => {
  const settings = createSeedDb(DEFAULT_NOW).settings;
  const local = (iso: string) => `${dayString(new Date(iso))} ${timeString(new Date(iso))}`;

  it('Ruhetag → nächster Öffnungstag bis Ladenschluss; nach Ladenschluss → bis Ladenschluss', () => {
    // Fr 10–11 Uhr + 48 h = So 11:00 (geschlossen) → Mo 20:00
    expect(local(pickupHoldUntil(settings, '2026-10-09', '11:00'))).toBe('2026-10-12 20:00');
    // Do 19–20 Uhr + 48 h = Sa 20:00 (Sa nur bis 16 Uhr) → Sa 16:00
    expect(local(pickupHoldUntil(settings, '2026-10-08', '20:00'))).toBe('2026-10-10 16:00');
    // Mo 10–11 Uhr + 48 h = Mi 11:00 (geöffnet) → unverändert
    expect(local(pickupHoldUntil(settings, '2026-10-12', '11:00'))).toBe('2026-10-14 11:00');
    // Sa 15–16 Uhr + 48 h = Mo 16:00 → unverändert
    expect(local(pickupHoldUntil(settings, '2026-10-10', '16:00'))).toBe('2026-10-12 16:00');
  });

  it('neue Abholung: Reservierung und Benachrichtigung nennen keinen Sonntag', async () => {
    const t = createTestCore({ now: berlinDate('2026-10-09', '08:00'), demoMode: false });
    const anna = await t.as('u-anna');
    const admin = await t.as('u-admin');
    const slot = (await anna.listSlots({ type: 'pickup', from: '2026-10-09', days: 1 })).find((s) => s.start === '10:00')!;
    const order = await anna.placeOrder(checkout({ items: [{ productId: 'augustiner-hell', qty: 1 }], fulfillment: 'pickup', slotId: slot.id }));
    expect(local(order.holdUntil!)).toBe('2026-10-12 20:00');
    await admin.adminUpdateOrderStatus(order.id, 'ready');
    const note = (await anna.listNotifications())[0];
    expect(note.title).toBe('Ihre Bestellung liegt bereit');
    expect(note.body).toContain('12.10.2026');
  });
});
