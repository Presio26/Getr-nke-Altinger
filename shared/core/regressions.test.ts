/**
 * Regressionstests zu bestätigten Fehlern (je describe eine Fehler-ID aus dem Prüfbericht).
 */
import { describe, expect, it } from 'vitest';
import type { ApiError } from '../api';
import type { CheckoutInput, Customer, GeoPoint, Order, RealtimeEvent, Tour } from '../types';
import { isDayString } from '../time';
import { createTestCore, checkout, firstFreeSlot, DEFAULT_NOW } from './test/helpers';
import { calculateQuote, priceProduct, type QuoteContext } from './pricing';
import { invoiceTotals, openAmountForCustomer } from './invoices';
import { parseSlotId } from './slots';
import { haversine } from './geo';
import { distributeOrders, orderCrates } from './planning';
import { positionOnLeg } from './simulator';
import { straightLineRouting, type RoutingProvider } from './routing';
import { createSeedDb } from './seed';

const errorOf = async (p: Promise<unknown>): Promise<ApiError & { details?: { errors?: { code: string }[] } }> => {
  try {
    await p;
  } catch (err) {
    return err as ApiError & { details?: { errors?: { code: string }[] } };
  }
  throw new Error('Fehler erwartet');
};

const seed = createSeedDb(DEFAULT_NOW);
const customer = (id: string): Customer => seed.customers.find((c) => c.id === id)!;
const product = (id: string) => seed.products.find((p) => p.id === id)!;
const qctx = (partial: Partial<QuoteContext> = {}): QuoteContext => ({
  settings: seed.settings,
  products: seed.products,
  depositTypes: seed.depositTypes,
  customer: null,
  now: DEFAULT_NOW,
  ...partial,
});

/** Routing, dessen Antworten der Test einzeln freigibt (wie ein langsamer OSRM-Server) */
function gatedRouting() {
  const base = straightLineRouting();
  const waiting: (() => void)[] = [];
  const provider: RoutingProvider = {
    async route(points) {
      await new Promise<void>((resolve) => waiting.push(resolve));
      return base.route(points);
    },
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return {
    provider,
    pending: () => waiting.length,
    /** true, sobald mindestens n Routenanfragen hängen (false nach einigen Runden ohne) */
    async untilPending(n: number) {
      for (let i = 0; i < 200 && waiting.length < n; i++) await flush();
      return waiting.length >= n;
    },
    /** wartet, bis mindestens n Routenanfragen hängen */
    async waitPending(n: number) {
      if (!(await this.untilPending(n))) throw new Error(`erwartet: ${n} wartende Routenanfragen, sind ${waiting.length}`);
    },
    /** gibt die i-te wartende Anfrage frei */
    async release(i = 0) {
      waiting.splice(i, 1)[0]();
      await flush();
    },
  };
}

/** Jede Bestellung höchstens in einer Tour, und order.tourId zeigt genau auf diese */
function expectConsistentTours(orders: Order[], tours: Tour[]) {
  for (const o of orders) {
    const containing = tours.filter((t) => t.stops.some((s) => s.orderId === o.id));
    expect(containing.length, `${o.id} in ${containing.map((t) => t.id).join(', ')}`).toBeLessThanOrEqual(1);
    expect(o.tourId).toBe(containing[0]?.id);
  }
}

// ───────────────────────────── Leergut ─────────────────────────────

describe('empties-unbounded-credit-bypass', () => {
  it('Leergut je Art zusammengefasst und auf Leergut-Konto + gelieferte Gebinde begrenzt', () => {
    const anna = customer('c-anna'); // Konto: 2 × Bierkasten, 1 × Wasserkasten
    const items = [{ productId: 'augustiner-hell', qty: 1 }];
    const ctx = qctx({ customer: anna, depositBalance: anna.depositBalance });
    const ok = calculateQuote(checkout({ items, fulfillment: 'pickup', emptiesReturn: [{ depositTypeId: 'kasten-bier-20', qty: 3 }] }), ctx);
    expect(ok.errors).toEqual([]);
    expect(ok.totals.depositRefund).toBe(3 * 310);

    // Zeilen derselben Art zählen zusammen
    const split = calculateQuote(
      checkout({
        items,
        fulfillment: 'pickup',
        emptiesReturn: [
          { depositTypeId: 'kasten-bier-20', qty: 2 },
          { depositTypeId: 'kasten-bier-20', qty: 2 },
        ],
      }),
      ctx,
    );
    expect(split.errors.map((e) => e.code)).toEqual(['empties']);
    expect(split.totals.depositRefund).toBe(0);

    // 99 Fässer (Stepper im Checkout) ohne Fass auf dem Konto
    const kegs = calculateQuote(checkout({ items, fulfillment: 'pickup', emptiesReturn: [{ depositTypeId: 'fass-30', qty: 99 }] }), ctx);
    expect(kegs.errors.map((e) => e.code)).toContain('empties');
    expect(kegs.totals.total).toBeGreaterThan(0);

    // auch ohne bekanntes Konto: höchstens 999 je Art, auch über mehrere Zeilen
    const many = calculateQuote(
      checkout({ items, fulfillment: 'pickup', emptiesReturn: [1, 2, 3].map(() => ({ depositTypeId: 'kasten-bier-20', qty: 999 })) }),
      qctx(),
    );
    expect(many.errors.map((e) => e.code)).toContain('empties');
  });

  it('NordByte: Leergut-Bestellung auf Rechnung wird abgelehnt und senkt die offenen Posten nicht', async () => {
    const t = createTestCore();
    const nb = await t.as('u-nordbyte');
    const slot = await firstFreeSlot(nb, 'pickup');
    const openBefore = openAmountForCustomer(t.db(), 'c-nordbyte', t.now());
    const ordersBefore = t.db().orders.length;

    const err = await errorOf(
      nb.placeOrder(
        checkout({
          items: [{ productId: 'augustiner-hell', qty: 1 }],
          fulfillment: 'pickup',
          slotId: slot.id,
          paymentMethod: 'invoice',
          emptiesReturn: [1, 2, 3].map(() => ({ depositTypeId: 'kasten-bier-20', qty: 999 })),
        }),
      ),
    );
    expect(err.code).toBe('validation');
    expect(t.db().orders.length).toBe(ordersBefore);

    // erlaubte, aber hohe Rückgabe (ganzes Konto) mit kleinem Einkauf → Auszahlung; die offenen Posten sinken dadurch nicht
    const nordbyte = t.db().customers.find((c) => c.id === 'c-nordbyte')!;
    const emptiesReturn = Object.entries(nordbyte.depositBalance).map(([depositTypeId, qty]) => ({ depositTypeId, qty }));
    const payout = await nb.placeOrder(
      checkout({ items: [{ productId: 'eiswuerfel-2kg', qty: 1 }], fulfillment: 'pickup', slotId: slot.id, paymentMethod: 'invoice', emptiesReturn }),
    );
    expect(payout.totals.total).toBeLessThan(0);
    expect(openAmountForCustomer(t.db(), 'c-nordbyte', t.now())).toBe(openBefore);

    // Kreditprüfung: eine Auszahlung schafft keinen Kreditrahmen
    const nbCustomer = t.db().customers.find((c) => c.id === 'c-nordbyte')!;
    const limit = nbCustomer.b2b!.creditLimit;
    const q = calculateQuote(
      checkout({ items: [{ productId: 'eiswuerfel-2kg', qty: 1 }], fulfillment: 'pickup', paymentMethod: 'invoice', emptiesReturn }),
      qctx({ customer: nbCustomer, openAmount: limit + 1 }),
    );
    expect(q.totals.total).toBeLessThan(0);
    expect(q.paymentMethods).not.toContain('invoice');
  });

  it('Abholung: der Markt erfasst das tatsächlich angenommene Leergut (sonst gilt die geprüfte Anmeldung)', async () => {
    const t = createTestCore();
    const anna = await t.as('u-anna');
    const admin = await t.as('u-admin');
    const slot = await firstFreeSlot(anna, 'pickup');
    const input = checkout({
      items: [{ productId: 'augustiner-hell', qty: 1 }],
      fulfillment: 'pickup',
      slotId: slot.id,
      emptiesReturn: [{ depositTypeId: 'kasten-bier-20', qty: 3 }],
    });
    const order = await anna.placeOrder(input);
    expect(order.totals.depositRefund).toBe(930);
    for (const s of ['confirmed', 'picking', 'ready'] as const) await admin.adminUpdateOrderStatus(order.id, s);
    const done = await admin.adminUpdateOrderStatus(order.id, 'picked_up', undefined, [{ depositTypeId: 'kasten-bier-20', qty: 1 }]);
    expect(done.status).toBe('picked_up');
    expect(done.totals.depositRefund).toBe(310);
    expect(done.totals.total).toBe(order.totals.total + 620);
    // MwSt. passt zur tatsächlichen Gutschrift
    const expected = calculateQuote({ ...input, emptiesReturn: [{ depositTypeId: 'kasten-bier-20', qty: 1 }] }, qctx({ customer: customer('c-anna') }));
    expect(Math.abs(done.totals.vat - expected.totals.vat)).toBeLessThanOrEqual(1);
    // Konto: 2 + 1 gelieferter Kasten − 1 zurückgegeben
    expect(t.db().customers.find((c) => c.id === 'c-anna')!.depositBalance['kasten-bier-20']).toBe(2);

    const second = await anna.placeOrder(input);
    for (const s of ['confirmed', 'picking', 'ready'] as const) await admin.adminUpdateOrderStatus(second.id, s);
    expect((await errorOf(admin.adminUpdateOrderStatus(second.id, 'picked_up', undefined, [{ depositTypeId: 'kasten-bier-20', qty: 1.5 }]))).code).toBe(
      'validation',
    );
    // ohne Angabe: angemeldete (geprüfte) Rückgabe
    expect((await admin.adminUpdateOrderStatus(second.id, 'picked_up')).totals.depositRefund).toBe(930);
  });
});

// ───────────────────────────── Kalendertage ─────────────────────────────

describe('noncanonical-dates', () => {
  it('ungültige Kalendertage werden überall abgelehnt', async () => {
    expect(isDayString('2026-11-02')).toBe(true);
    expect(isDayString('2026-10-33')).toBe(false);
    expect(isDayString('2026-02-29')).toBe(false);
    expect(isDayString('2028-02-29')).toBe(true);
    expect(parseSlotId('delivery|2026-10-33|10:00-12:00')).toBeNull();
    expect(parseSlotId('delivery|2026-11-02|10:00-12:00')).not.toBeNull();

    const t = createTestCore();
    const anna = await t.as('u-anna');
    const admin = await t.as('u-admin');
    const ordersBefore = t.db().orders.length;
    const stockBefore = t.db().products.find((p) => p.id === 'paulaner-hell')!.stock;
    const err = await errorOf(
      anna.placeOrder(checkout({ items: [{ productId: 'paulaner-hell', qty: 5 }], addressId: 'a-anna', slotId: 'delivery|2026-10-33|10:00-12:00' })),
    );
    expect(err.code).not.toBe('internal');
    expect(t.db().orders.length).toBe(ordersBefore);
    expect(t.db().products.find((p) => p.id === 'paulaner-hell')!.stock).toBe(stockBefore);

    // Leihartikel: '2026-10-38' wäre der 07.11. mit eigener (leerer) Reservierungsliste
    const rental = checkout({ items: [{ productId: 'bierzeltgarnitur', qty: 40 }], fulfillment: 'pickup', eventDate: '2026-10-38' });
    const q = await anna.quote(rental);
    expect(q.errors.map((e) => e.code)).toContain('rental_date');
    expect((await errorOf(anna.rentalAvailability('2026-10-38'))).code).toBe('validation');

    // Touren, Abos
    expect((await errorOf(admin.adminListTours('2026-10-33'))).code).toBe('validation');
    expect((await errorOf(admin.adminAutoPlanTours('2026-10-33'))).code).toBe('validation');
    const sub = await anna.saveSubscription({
      name: 'Test',
      items: [{ productId: 'paulaner-hell', qty: 1 }],
      interval: 'weekly',
      weekday: 1,
      slotStart: '10:00',
      addressId: 'a-anna',
      paymentMethod: 'cash',
      active: true,
      autoEmptiesReturn: false,
      nextDate: '2026-10-33',
    });
    expect(sub.nextDate).toBe('2026-10-12');
  });

  it('Veranstaltungsdatum wird nur als echter Kalendertag gespeichert', async () => {
    const t = createTestCore();
    const anna = await t.as('u-anna');
    const slot = await firstFreeSlot(anna, 'pickup');
    const order = await anna.placeOrder(
      checkout({ items: [{ productId: 'paulaner-hell', qty: 1 }], fulfillment: 'pickup', slotId: slot.id, eventDate: '2026-10-33' }),
    );
    expect(order.eventDate).toBeUndefined();
  });
});

// ───────────────────────────── Datenschutz Touren/Tracking ─────────────────────────────

describe('tour-event-leaks-other-customers / tour-updated-leaks-other-customers', () => {
  it('tour.updated: vollständige Tour nur an Markt und Fahrer, Kunden ohne Stopps und Route', async () => {
    const t = createTestCore();
    const admin = await t.as('u-admin');
    t.events.length = 0;
    await admin.adminOptimizeTour('t-1');
    await admin.startTour('t-1');
    const tourEvents = t.events.filter((e) => e.event.type === 'tour.updated') as { event: Extract<RealtimeEvent, { type: 'tour.updated' }>; audience: (typeof t.events)[number]['audience'] }[];
    expect(tourEvents.length).toBeGreaterThan(0);
    const full = tourEvents.filter((e) => e.event.tour.stops.length > 0);
    expect(full.length).toBeGreaterThan(0);
    for (const e of full) {
      expect(e.audience.all).toBeFalsy();
      expect(e.audience.customerIds ?? []).toEqual([]);
      expect(e.audience).toMatchObject({ admin: true, driverIds: ['d-toni'] });
    }
    const forCustomers = tourEvents.filter((e) => e.audience.customerIds?.length);
    expect(forCustomers.length).toBeGreaterThan(0);
    for (const e of forCustomers) {
      expect(e.event.tour.stops).toEqual([]);
      expect(e.event.tour.route).toBeUndefined();
      expect(e.event.tour.simulation).toBeUndefined();
      expect(e.audience.admin).toBeFalsy();
    }
  });

  it('getTracking: keine Route über die Adressen anderer Kunden', async () => {
    const t = createTestCore();
    const admin = await t.as('u-admin');
    const gasthaus = await t.as('u-gasthaus');
    const tour = t.db().tours.find((x) => x.id === 't-1')!;
    const own = t.db().orders.find((o) => o.id === tour.stops[3].orderId)!;

    const planned = await gasthaus.getTracking(own.id);
    expect(planned.tour?.routeToCustomer).toBeUndefined();
    // Markt sieht die volle Route
    expect((await admin.getTracking(own.id)).tour?.routeToCustomer?.length).toBeGreaterThan(1);

    await admin.startTour('t-1');
    await (await t.as('u-toni')).updateDriverPosition({ lat: 48.2525, lng: 11.6534 });
    const active = await gasthaus.getTracking(own.id);
    expect(active.tour?.stopsBefore).toBe(3);
    expect(active.tour?.routeToCustomer).toBeUndefined();
  });
});

describe('tracking-driver-gps-leak / tracking-driver-position-leak', () => {
  it('Fahrerposition nur, solange der eigene Auftrag auf der aktiven Tour unterwegs ist', async () => {
    const t = createTestCore();
    const anna = await t.as('u-anna');
    const toni = await t.as('u-toni');
    const admin = await t.as('u-admin');
    await toni.updateDriverPosition({ lat: 48.3111, lng: 11.6222 });

    // längst zugestellt
    const old = await anna.getTracking('o-24829');
    expect(old.order.status).toBe('delivered');
    expect(old.driver?.name).toBe('Toni Huber');
    expect(old.driver?.position).toBeUndefined();

    // eingeplant, Tour noch nicht gestartet
    const annaOrder = t.db().orders.find((o) => o.tourId === 't-1' && o.customerId === 'c-anna')!;
    expect((await anna.getTracking(annaOrder.id)).driver?.position).toBeUndefined();

    // Tour läuft: Anna sieht Toni, ein früherer Kunde ohne Auftrag auf der Tour nicht
    await toni.startTour('t-1');
    await toni.updateDriverPosition({ lat: 48.3111, lng: 11.6222 });
    expect((await anna.getTracking(annaOrder.id)).driver?.position).toMatchObject({ lat: 48.3111, lng: 11.6222 });
    expect((await anna.getTracking('o-24829')).driver?.position).toBeUndefined();
    // Markt sieht die Position weiterhin
    expect((await admin.getTracking('o-24829')).driver?.position).toBeDefined();
  });
});

// ───────────────────────────── Zahlarten / Preise ─────────────────────────────

describe('sepa-bypasses-credit-limit', () => {
  it('bei überschrittenem Kreditlimit weder Rechnung noch SEPA', async () => {
    const gasthaus = customer('c-gasthaus');
    const items = [{ productId: 'paulaner-hell', qty: 2 }];
    const q = calculateQuote(checkout({ items, fulfillment: 'pickup', paymentMethod: 'sepa' }), qctx({ customer: gasthaus, openAmount: 499_000 }));
    expect(q.paymentMethods).not.toContain('sepa');
    expect(q.paymentMethods).not.toContain('invoice');
    expect(q.errors.map((e) => e.code)).toContain('payment');
    expect(q.warnings.map((w) => w.code)).toContain('credit_limit');

    const t = createTestCore();
    const nb = await t.as('u-nordbyte');
    const slot = await firstFreeSlot(nb, 'pickup');
    const open = openAmountForCustomer(t.db(), 'c-nordbyte', t.now());
    const room = 200_000 - open;
    // Artikel mit genug Bestand für eine Bestellung über dem freien Kreditrahmen
    const nbCustomer = t.db().customers.find((c) => c.id === 'c-nordbyte')!;
    const p = t
      .db()
      .products.filter((x) => x.active && !x.isRental)
      .find((x) => priceProduct(x, nbCustomer, Math.min(x.stock, 999), t.now()).lineGross > room + 10_000)!;
    const qty = Math.min(p.stock, 999);
    const err = await errorOf(nb.placeOrder(checkout({ items: [{ productId: p.id, qty }], fulfillment: 'pickup', slotId: slot.id, paymentMethod: 'sepa' })));
    expect(err.code).toBe('validation');
    expect(err.details?.errors?.map((e) => e.code)).toContain('payment');
    expect(openAmountForCustomer(t.db(), 'c-nordbyte', t.now())).toBe(open);
  });
});

describe('pending-b2b-gets-b2b-prices', () => {
  it('Geschäftskunden-Antrag (pending) zahlt bis zur Freischaltung reguläre Preise', async () => {
    const pending = customer('c-sonnenschein');
    expect(pending.b2b?.status).toBe('pending');
    const p = priceProduct(product('paulaner-hell'), pending, 25, DEFAULT_NOW);
    expect(p.unitGross).toBe(product('paulaner-hell').priceGross);
    expect(p.priceSource).toBe('list');
    expect(p.showNet).toBe(false);
    // nach Freischaltung: Staffelpreis
    const active = priceProduct(product('paulaner-hell'), { ...pending, b2b: { ...pending.b2b!, status: 'active' } }, 25, DEFAULT_NOW);
    expect(active.unitGross).toBeLessThan(product('paulaner-hell').priceGross);
    expect(active.showNet).toBe(true);

    const t = createTestCore();
    const session = await t.api().requestBusinessAccount({
      companyName: 'Fake GmbH',
      contactName: 'Max Muster',
      email: 'max@fake.example',
      password: 'geheim123',
      phone: '089 123456',
      segment: 'buero',
      address: { label: 'Firmensitz', name: 'Fake GmbH', street: 'Bahnhofstraße 1', zip: '85748', city: 'Garching' },
    });
    const fake = t.api(session.token);
    const guestQuote = await t.api().quote(checkout({ items: [{ productId: 'paulaner-hell', qty: 25 }], fulfillment: 'pickup' }));
    const fakeQuote = await fake.quote(checkout({ items: [{ productId: 'paulaner-hell', qty: 25 }], fulfillment: 'pickup' }));
    // gleiche Positionspreise wie Privatkunden (Geschäftskonten rechnen die Summen auf Netto-Basis → ±1 Cent)
    expect(fakeQuote.lines.map((l) => [l.unitGross, l.lineGross])).toEqual(guestQuote.lines.map((l) => [l.unitGross, l.lineGross]));
    expect(Math.abs(fakeQuote.totals.itemsGross - guestQuote.totals.itemsGross)).toBeLessThanOrEqual(1);
    expect(fakeQuote.lines[0].priceNote).toBeUndefined();
    expect(fakeQuote.warnings.map((w) => w.code)).toContain('business_pending');
  });
});

describe('missing-payment-method', () => {
  it('ohne Zahlart keine Bestellung', async () => {
    const items = [{ productId: 'paulaner-hell', qty: 1 }];
    const base = { items, fulfillment: 'pickup', emptiesReturn: [], carryService: false } as unknown as CheckoutInput;
    expect(calculateQuote(base, qctx()).errors.map((e) => e.code)).toContain('payment');
    for (const paymentMethod of ['', null, 5, 'toString']) {
      const q = calculateQuote({ ...base, paymentMethod: paymentMethod as never }, qctx());
      expect(q.errors.map((e) => e.code)).toContain('payment');
    }

    const t = createTestCore();
    const anna = await t.as('u-anna');
    const slot = await firstFreeSlot(anna, 'pickup');
    const before = t.db().orders.length;
    const err = await errorOf(anna.placeOrder({ ...base, slotId: slot.id }));
    expect(err.code).toBe('validation');
    expect(err.details?.errors?.map((e) => e.code)).toContain('payment');
    expect(t.db().orders.length).toBe(before);
  });
});

describe('deposit-not-vat-taxed', () => {
  it('Pfand mit dem Satz des Artikels, Leergut-Gutschrift mindert die MwSt.', () => {
    const items = [{ productId: 'augustiner-hell', qty: 10 }];
    const q = calculateQuote(checkout({ items, fulfillment: 'pickup' }), qctx());
    expect(q.totals.deposit).toBe(3100);
    expect(q.totals.total).toBe(q.totals.itemsGross + 3100);
    expect(q.totals.vat).toBe(Math.round((q.totals.total * 19) / 119));

    const withEmpties = calculateQuote(checkout({ items, fulfillment: 'pickup', emptiesReturn: [{ depositTypeId: 'kasten-bier-20', qty: 4 }] }), qctx());
    expect(withEmpties.totals.vat).toBe(Math.round((withEmpties.totals.total * 19) / 119));
  });

  it('Rechnung: MwSt. inkl. Pfand, Pfand/Leergut netto, Summen stimmen', () => {
    const items = [{ productId: 'augustiner-hell', qty: 10 }];
    const q = calculateQuote(
      checkout({ items, fulfillment: 'pickup', paymentMethod: 'invoice', emptiesReturn: [{ depositTypeId: 'kasten-bier-20', qty: 2 }] }),
      qctx({ customer: customer('c-gasthaus'), openAmount: 0 }),
    );
    const order = { customerType: 'b2b', lines: q.lines, totals: q.totals } as Order;
    const inv = invoiceTotals([order, order]);
    // Netto je Satz = Summe der Bestellungen, MwSt. einmal auf die Rechnungssumme (19 % von Netto, centgenau)
    expect(inv.vatBreakdown).toEqual([{ rate: 19, net: 2 * q.totals.vatBreakdown![0].net, vat: Math.round((2 * q.totals.vatBreakdown![0].net * 19) / 100) }]);
    expect(inv.vat).toBe(inv.vatBreakdown![0].vat);
    expect(Math.abs(inv.gross - 2 * q.totals.total)).toBeLessThanOrEqual(1);
    expect(inv.deposit).toBe(2 * Math.round((3100 * 100) / 119));
    expect(inv.depositRefund).toBe(2 * Math.round((620 * 100) / 119));
    expect(inv.net + inv.vat + inv.deposit - inv.depositRefund).toBe(inv.gross);
    // Nettobetrag = Warenwert netto exakt (B2B-Positionen netto, kein Rundungsausgleich)
    expect(inv.net).toBe(2 * q.totals.itemsNet);
  });
});

// ───────────────────────────── Touren ─────────────────────────────

describe('tour-accepts-other-days', () => {
  it('Aufträge anderer Liefertage lassen sich nicht in eine Tour legen', async () => {
    const t = createTestCore();
    const admin = await t.as('u-admin');
    const tomorrow = t.db().orders.find((o) => o.customerId === 'c-lehmann' && o.slot.date === '2026-10-09')!;
    expect(tomorrow.status).toBe('confirmed');
    const err = await errorOf(admin.adminSaveTour({ date: '2026-10-08', driverId: 'd-ayse', orderIds: [tomorrow.id] }));
    expect(err.code).toBe('conflict');
    expect(t.db().orders.find((o) => o.id === tomorrow.id)!.tourId).toBeUndefined();
    // laufende Tour von heute: Auftrag von morgen hinzufügen → abgelehnt, nichts wird „unterwegs“
    await admin.startTour('t-1');
    const t1 = t.db().tours.find((x) => x.id === 't-1')!;
    const err2 = await errorOf(admin.adminSaveTour({ id: 't-1', date: t1.date, driverId: t1.driverId, orderIds: [...t1.stops.map((s) => s.orderId), tomorrow.id] }));
    expect(err2.code).toBe('conflict');
    expect(t.db().orders.find((o) => o.id === tomorrow.id)!.status).toBe('confirmed');
    // passender Tag geht
    const ok = await admin.adminSaveTour({ date: '2026-10-09', driverId: 'd-ayse', orderIds: [tomorrow.id] });
    expect(ok.stops.map((s) => s.orderId)).toEqual([tomorrow.id]);
  });
});

describe('autoplan-race-double-tour', () => {
  it('nach den awaits wird synchron übernommen – kein Auftrag landet in zwei Touren', async () => {
    const g = gatedRouting();
    const t = createTestCore({ routing: g.provider });
    const admin = await t.as('u-admin');
    const day = '2026-10-09';
    const idOf = (customerId: string) => t.db().orders.find((o) => o.customerId === customerId && o.slot.date === day)!.id;
    const lehmann = idOf('c-lehmann');
    const richter = idOf('c-richter');
    // Richter (14:00) bestätigen – unbestätigte Aufträge plant die Automatik nicht ein
    await admin.adminUpdateOrderStatus(richter, 'confirmed');

    const plan = admin.adminAutoPlanTours(day);
    await g.waitPending(1); // Route Gruppe 10:00
    // ein zweiter Disponent plant Lehmann (Gruppe 14:00) parallel
    const s1 = admin.adminSaveTour({ date: day, driverId: 'd-lukas', orderIds: [lehmann] });
    await g.waitPending(2);
    await g.release(1);
    const lukasTour = await s1;
    await g.release(0); // Route 10:00 → AutoPlan fragt die Route 14:00 an
    await g.waitPending(1);
    await g.release(0);
    // die Gruppe 14:00 ist geschrumpft: keine weitere Routenanfrage (kein await mehr), der Plan steht sofort
    const settled = await Promise.race([plan.then(() => 'fertig'), g.untilPending(1).then((p) => (p ? 'wartet erneut auf Route' : 'fertig'))]);
    expect(settled).toBe('fertig');
    const created = await plan;
    expect(g.pending()).toBe(0);
    const tour14 = created.find((x) => x.stops.some((s) => s.orderId === richter))!;
    expect(tour14.stops.map((s) => s.orderId)).toEqual([richter]);
    expect(tour14.route?.legs).toHaveLength(2);

    // danach übernimmt ein weiterer Disponent Richter → aus der AutoPlan-Tour gelöst
    const s2 = admin.adminSaveTour({ date: day, driverId: 'd-ayse', orderIds: [richter] });
    await g.waitPending(1);
    await g.release(0);
    const ayseTour = await s2;
    expectConsistentTours(t.db().orders, t.db().tours);
    expect(t.db().orders.find((o) => o.id === richter)!.tourId).toBe(ayseTour.id);
    expect(t.db().orders.find((o) => o.id === lehmann)!.tourId).toBe(lukasTour.id);
  });
});

describe('savetour-no-recheck-after-await', () => {
  it('Tourstart während der Routenberechnung: unterwegs befindlicher Auftrag wird nicht entfernt', async () => {
    const g = gatedRouting();
    const t = createTestCore({ routing: g.provider });
    const admin = await t.as('u-admin');
    const toni = await t.as('u-toni');
    const t1 = t.db().tours.find((x) => x.id === 't-1')!;
    const annaId = t1.stops[0].orderId;
    // Fehler gleich abfangen (die Ablehnung kommt während des Freigebens)
    const save = errorOf(admin.adminSaveTour({ id: 't-1', date: t1.date, driverId: t1.driverId, orderIds: t1.stops.slice(1).map((s) => s.orderId) }));
    await g.waitPending(1);
    await toni.startTour('t-1');
    expect(t.db().orders.find((o) => o.id === annaId)!.status).toBe('out_for_delivery');
    await g.release(0);
    expect((await save).code).toBe('conflict');
    const anna = t.db().orders.find((o) => o.id === annaId)!;
    expect(anna.tourId).toBe('t-1');
    expect(t.db().tours.find((x) => x.id === 't-1')!.stops.map((s) => s.orderId)).toContain(annaId);
  });

  it('Simulation während der Routenberechnung: Speichern wird abgelehnt, Fortschritt bleibt', async () => {
    const g = gatedRouting();
    const t = createTestCore({ routing: g.provider });
    const admin = await t.as('u-admin');
    const toni = await t.as('u-toni');
    const t1 = t.db().tours.find((x) => x.id === 't-1')!;
    // Fehler gleich abfangen (die Ablehnung kommt während des Freigebens)
    const save = errorOf(admin.adminSaveTour({ id: 't-1', date: t1.date, driverId: t1.driverId, orderIds: t1.stops.slice(1).map((s) => s.orderId) }));
    await g.waitPending(1);
    const sim = toni.simulateTour('t-1');
    // simulateTour berechnet ggf. selbst eine Route
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 0));
      if (g.pending() > 1) await g.release(1);
    }
    await sim;
    t.tickSeconds(5);
    const progress = t.db().tours.find((x) => x.id === 't-1')!.simulation!.progressM;
    expect(progress).toBeGreaterThan(0);
    await g.release(0);
    expect((await save).code).toBe('conflict');
    const after = t.db().tours.find((x) => x.id === 't-1')!;
    expect(after.simulation!.progressM).toBe(progress);
    expect(after.stops).toHaveLength(4);
  });
});

describe('detach-breaks-simulation-state', () => {
  it('Auftrag am wartenden Stopp entfernt: der nächste Stopp wird angefahren, nicht sofort zugestellt', async () => {
    const t = createTestCore();
    const admin = await t.as('u-admin');
    const toni = await t.as('u-toni');
    await admin.simulateTour('t-1');
    const tour = () => t.db().tours.find((x) => x.id === 't-1')!;
    const annaId = tour().stops[0].orderId;
    const wagnerId = tour().stops[1].orderId;
    for (let i = 0; i < 120 && tour().stops[0].status !== 'arrived'; i++) t.tickSeconds(1);
    expect(tour().simulation?.dwellUntil).toBeDefined();
    const legA = tour().route!.legs[0];
    await admin.stopSimulation('t-1');
    await toni.failDelivery(annaId, 'Niemand angetroffen');
    await admin.adminUpdateOrderStatus(annaId, 'ready'); // erneut verladen → aus der Tour gelöst
    const sim = tour().simulation!;
    expect(tour().stops[0].orderId).toBe(wagnerId);
    expect(sim.legIndex).toBe(0);
    expect(sim.dwellUntil).toBeUndefined();
    expect(sim.progressM).toBe(legA.distance);

    await admin.simulateTour('t-1');
    t.tickSeconds(10);
    const wagner = () => t.db().orders.find((o) => o.id === wagnerId)!;
    expect(wagner().status).toBe('out_for_delivery');
    for (let i = 0; i < 300 && wagner().status !== 'delivered'; i++) t.tickSeconds(1);
    expect(wagner().status).toBe('delivered');
    const stop = tour().stops.find((s) => s.orderId === wagnerId)!;
    expect(Date.parse(stop.doneAt!)).toBeGreaterThan(Date.parse(stop.arrivedAt!));
  });

  it('Auftrag hinter dem Fahrer entfernt: die Position springt nicht zurück', async () => {
    const t = createTestCore();
    const admin = await t.as('u-admin');
    const toni = await t.as('u-toni');
    await admin.simulateTour('t-1', { autoComplete: false });
    const tour = () => t.db().tours.find((x) => x.id === 't-1')!;
    const annaId = tour().stops[0].orderId;
    for (let i = 0; i < 120 && tour().stops[0].status !== 'arrived'; i++) t.tickSeconds(1);
    await toni.failDelivery(annaId, 'Niemand angetroffen');
    for (let i = 0; i < 30 && tour().simulation!.legIndex < 1; i++) t.tickSeconds(1);
    t.tickSeconds(3);
    expect(tour().simulation!.legIndex).toBe(1);
    const before = { ...t.db().drivers.find((d) => d.id === 'd-toni')!.position! };
    await admin.adminUpdateOrderStatus(annaId, 'ready');
    const sim = tour().simulation!;
    expect(sim.legIndex).toBe(0);
    const { point } = positionOnLeg(tour().route!.legs[0], sim.progressM);
    expect(haversine({ lat: point[0], lng: point[1] }, before)).toBeLessThan(5);
  });
});

describe('sim-restart-stale-leg', () => {
  it('Neustart der Simulation setzt beim aktuellen Stopp fort statt erledigte Abschnitte erneut zu fahren', async () => {
    const t = createTestCore();
    const toni = await t.as('u-toni');
    await toni.simulateTour('t-1');
    t.tickSeconds(3);
    await toni.stopSimulation('t-1');
    const tour = () => t.db().tours.find((x) => x.id === 't-1')!;
    expect(tour().simulation!.legIndex).toBe(0);
    const ids = tour().stops.map((s) => s.orderId);
    for (const id of ids.slice(0, 2)) {
      await toni.arriveAtStop(id);
      await toni.completeDelivery(id, { emptiesCollected: [] });
    }
    await toni.arriveAtStop(ids[2]);
    expect(tour().currentStopIndex).toBe(2);

    await toni.simulateTour('t-1');
    const sim = tour().simulation!;
    expect(sim.legIndex).toBe(2);
    expect(sim.progressM).toBe(tour().route!.legs[2].distance);
    expect(sim.dwellUntil).toBeDefined();
    const legEnd = tour().route!.legs[2].coords.at(-1)!;
    const pos = t.db().drivers.find((d) => d.id === 'd-toni')!.position!;
    expect(haversine(pos, { lat: legEnd[0], lng: legEnd[1] })).toBeLessThan(5);
    // nach der Standzeit wird Stopp 2 zugestellt, die Simulation fährt nie zurück
    for (let i = 0; i < 15; i++) {
      t.tickSeconds(1);
      expect(tour().simulation!.legIndex).toBeGreaterThanOrEqual(2);
    }
    expect(t.db().orders.find((o) => o.id === ids[2])!.status).toBe('delivered');
  });
});

describe('autoplan-ignores-driver-capacity', () => {
  const store: GeoPoint = { lat: 48.2525, lng: 11.6534 };
  const fakeOrder = (id: string, crates: number, bearingDeg: number): Order =>
    ({
      id,
      slot: { id: `delivery|2026-10-09|10:00-12:00`, date: '2026-10-09', start: '10:00', end: '12:00' },
      address: { lat: store.lat + 0.01 * Math.cos((bearingDeg * Math.PI) / 180), lng: store.lng + 0.01 * Math.sin((bearingDeg * Math.PI) / 180) },
      lines: [{ productId: 'x', qty: crates }],
    }) as unknown as Order;
  const drivers = createSeedDb(DEFAULT_NOW).drivers; // Toni 80, Lukas 80, Ayşe 60
  const capacity = (id: string) => drivers.find((d) => d.id === id)!.capacityCrates;

  const check = (orders: Order[], load: Record<string, number>) => {
    const groups = distributeOrders(store, orders, drivers, load);
    const assigned = groups.flatMap((g) => g.orders.map((o) => o.id)).sort();
    expect(assigned).toEqual(orders.map((o) => o.id).sort());
    for (const g of groups) {
      expect(g.orders.reduce((s, o) => s + orderCrates(o), 0), `${g.driverId}: ${g.orders.map((o) => o.id)}`).toBeLessThanOrEqual(capacity(g.driverId));
    }
    return groups;
  };

  it('Gruppen nach Kästen geschnitten – kein Fahrzeug über seiner Kapazität', () => {
    check([fakeOrder('a', 60, 10), fakeOrder('b', 30, 20), fakeOrder('c', 5, 30), fakeOrder('d', 5, 40)], {});
    check([fakeOrder('a', 60, 10), fakeOrder('b', 30, 20), fakeOrder('c', 5, 30), fakeOrder('d', 5, 40)], { 'd-toni': 1, 'd-lukas': 1 });
    // Ayşe (60) hat die wenigsten Touren, 70 Kästen passen nicht in ihr Fahrzeug
    check([fakeOrder('a', 40, 10), fakeOrder('b', 30, 20)], { 'd-toni': 1, 'd-lukas': 1 });
    // ein Auftrag, der nur in die großen Fahrzeuge passt, geht nicht an Ayşe
    const big = check([fakeOrder('a', 75, 10)], { 'd-toni': 1, 'd-lukas': 1 });
    expect(big[0].driverId).not.toBe('d-ayse');
  });

  it('kleine Fenster bleiben eine Tour beim Fahrer mit den wenigsten Touren', () => {
    const groups = check([fakeOrder('a', 3, 10), fakeOrder('b', 4, 100), fakeOrder('c', 3, 200)], { 'd-toni': 1, 'd-lukas': 0, 'd-ayse': 1 });
    expect(groups).toHaveLength(1);
    expect(groups[0].driverId).toBe('d-lukas');
  });
});

// ───────────────────────────── Robustheit / Einstellungen ─────────────────────────────

describe('coupon-code-type-crash', () => {
  it('couponCode, der kein String ist, führt nicht zu einem internen Fehler', async () => {
    const t = createTestCore();
    const anna = await t.as('u-anna');
    const slot = await firstFreeSlot(anna, 'pickup');
    for (const couponCode of [5, true, {}, ['x']]) {
      const input = checkout({ items: [{ productId: 'paulaner-hell', qty: 2 }], fulfillment: 'pickup', slotId: slot.id, couponCode: couponCode as never });
      const q = await anna.quote(input);
      expect(q.coupon).toBeUndefined();
      expect(q.totals.discount).toBe(0);
    }
    const order = await anna.placeOrder(
      checkout({ items: [{ productId: 'paulaner-hell', qty: 2 }], fulfillment: 'pickup', slotId: slot.id, couponCode: 5 as never }),
    );
    expect(order.couponCode).toBeUndefined();
  });
});

describe('bootstrap-leaks-coupons', () => {
  it('inaktive Gutscheine nur für den Markt (Bootstrap, settings.updated, Rechnung)', async () => {
    const t = createTestCore();
    const admin = await t.as('u-admin');
    const settings = (await admin.getBootstrap()).settings;
    t.events.length = 0;
    await admin.adminSaveSettings({
      ...settings,
      coupons: [...settings.coupons, { code: 'VIP-GASTRO-25', description: 'intern', type: 'percent', value: 25, active: false }],
    });
    const codes = (s: { coupons: { code: string }[] }) => s.coupons.map((c) => c.code);
    expect(codes((await t.api().getBootstrap()).settings)).not.toContain('VIP-GASTRO-25');
    expect(codes((await (await t.as('u-anna')).getBootstrap()).settings)).not.toContain('VIP-GASTRO-25');
    expect(codes((await admin.getBootstrap()).settings)).toContain('VIP-GASTRO-25');
    // aktive Codes bleiben (Vorprüfung im Shop)
    expect(codes((await t.api().getBootstrap()).settings)).toContain('WILLKOMMEN10');

    const updates = t.events.filter((e) => e.event.type === 'settings.updated') as { event: Extract<RealtimeEvent, { type: 'settings.updated' }>; audience: (typeof t.events)[number]['audience'] }[];
    for (const u of updates) {
      if (!u.audience.admin || u.audience.all) expect(codes(u.event.settings)).not.toContain('VIP-GASTRO-25');
    }
    // die vollständige Fassung kommt beim Markt zuletzt an
    expect(updates.at(-1)!.audience).toEqual({ admin: true });
    expect(codes(updates.at(-1)!.event.settings)).toContain('VIP-GASTRO-25');

    const gasthaus = await t.as('u-gasthaus');
    const invoice = (await gasthaus.listMyInvoices())[0];
    expect(codes((await gasthaus.getInvoice(invoice.id)).settings)).not.toContain('VIP-GASTRO-25');
  });
});
