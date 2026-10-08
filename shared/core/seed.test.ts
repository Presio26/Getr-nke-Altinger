import { describe, expect, it } from 'vitest';
import { addDays, berlinDate, dayString, todayString } from '../time';
import { createSeedDb, isSeedStale, reseedDb, type Db } from './index';
import { SCHEMA_VERSION } from './db';
import { haversine } from './geo';
import { parseSlotId } from './slots';
import { DEFAULT_NOW } from './test/helpers';
import { seedRoute } from './seed/routes';
import { PICKUP_CODE_ALPHABET } from './util';

/** Prüft alle Querverweise und Summen eines Datenbestands */
function assertConsistent(db: Db, now: Date): void {
  const ids = <T extends { id: string }>(list: T[]) => new Set(list.map((x) => x.id));
  const products = ids(db.products);
  const customers = ids(db.customers);
  const drivers = ids(db.drivers);
  const orders = ids(db.orders);
  const users = ids(db.users);
  const categories = ids(db.categories);
  const deposits = ids(db.depositTypes);
  const tours = ids(db.tours);
  const invoices = ids(db.invoices);

  expect(orders.size).toBe(db.orders.length);
  expect(new Set(db.orders.map((o) => o.number)).size).toBe(db.orders.length);
  for (const p of db.products) {
    expect(categories.has(p.categoryId), p.id).toBe(true);
    if (p.depositTypeId) expect(deposits.has(p.depositTypeId), p.id).toBe(true);
    expect(p.description.length, p.id).toBeGreaterThan(40);
    expect(Number.isInteger(p.priceGross)).toBe(true);
  }
  for (const u of db.users) {
    if (u.customerId) expect(customers.has(u.customerId)).toBe(true);
    if (u.driverId) expect(drivers.has(u.driverId)).toBe(true);
    expect(u.password).toBe('demo');
  }
  for (const c of db.customers) {
    if (c.defaultAddressId) expect(c.addresses.some((a) => a.id === c.defaultAddressId)).toBe(true);
    for (const f of c.favorites) expect(products.has(f)).toBe(true);
    for (const k of Object.keys(c.depositBalance)) expect(deposits.has(k)).toBe(true);
    if (c.type === 'b2b') expect(c.b2b?.customerNumber).toMatch(/^K-\d+$/);
  }
  for (const o of db.orders) {
    expect(customers.has(o.customerId), o.id).toBe(true);
    for (const l of o.lines) expect(products.has(l.productId), o.id).toBe(true);
    for (const e of o.emptiesReturn) expect(deposits.has(e.depositTypeId)).toBe(true);
    const slot = parseSlotId(o.slot.id);
    expect(slot, o.slot.id).not.toBeNull();
    expect(slot).toMatchObject({ type: o.fulfillment, date: o.slot.date, start: o.slot.start, end: o.slot.end });
    if (o.driverId) expect(drivers.has(o.driverId)).toBe(true);
    if (o.tourId) expect(tours.has(o.tourId)).toBe(true);
    if (o.invoiceId) expect(invoices.has(o.invoiceId)).toBe(true);
    if (o.fulfillment === 'delivery') expect(o.address).toBeTruthy();
    if (o.fulfillment === 'pickup') expect(o.pickupCode).toMatch(new RegExp(`^[${PICKUP_CODE_ALPHABET}]{6}$`));
    // Summen
    const t = o.totals;
    expect(t.itemsGross).toBe(o.lines.reduce((s, l) => s + l.lineGross, 0));
    expect(t.deposit).toBe(o.lines.reduce((s, l) => s + l.depositTotal, 0));
    expect(t.total).toBe(t.itemsGross - t.discount + t.deposit - t.depositRefund + t.deliveryFee + t.carryFee);
    // Verlauf: chronologisch, endet beim aktuellen Status, nichts in der Zukunft
    expect(o.statusHistory[0].status).toBe('pending');
    expect(o.statusHistory.at(-1)!.status).toBe(o.status);
    for (let i = 1; i < o.statusHistory.length; i++) {
      expect(Date.parse(o.statusHistory[i].at)).toBeGreaterThan(Date.parse(o.statusHistory[i - 1].at));
    }
    expect(Date.parse(o.statusHistory.at(-1)!.at)).toBeLessThanOrEqual(now.getTime());
    expect(Date.parse(o.createdAt)).toBeLessThanOrEqual(now.getTime());
    if (o.rating) expect(Date.parse(o.rating.at)).toBeLessThanOrEqual(now.getTime());
  }
  for (const tour of db.tours) {
    expect(drivers.has(tour.driverId)).toBe(true);
    expect(tour.route?.legs.length).toBe(tour.stops.length + 1);
    for (const s of tour.stops) {
      expect(orders.has(s.orderId)).toBe(true);
      expect(db.orders.find((o) => o.id === s.orderId)!.tourId).toBe(tour.id);
    }
  }
  for (const inv of db.invoices) {
    expect(customers.has(inv.customerId)).toBe(true);
    expect(inv.net + inv.vat + inv.deposit - inv.depositRefund).toBe(inv.gross);
    const invOrders = inv.orderIds.map((id) => db.orders.find((o) => o.id === id)!);
    expect(invOrders.every((o) => o && o.invoiceId === inv.id && o.status === 'delivered')).toBe(true);
    expect(inv.gross).toBe(invOrders.reduce((s, o) => s + o.totals.total, 0));
  }
  for (const s of db.subscriptions) {
    const c = db.customers.find((x) => x.id === s.customerId)!;
    expect(c).toBeTruthy();
    expect(c.addresses.some((a) => a.id === s.addressId)).toBe(true);
    for (const i of s.items) expect(products.has(i.productId)).toBe(true);
    expect(s.nextDate > todayString(now)).toBe(true);
    if (s.lastOrderId) expect(orders.has(s.lastOrderId)).toBe(true);
  }
  for (const n of db.notifications) {
    expect(n.recipient === 'admin' || n.recipient === 'drivers' || users.has(n.recipient), n.recipient).toBe(true);
    expect(Date.parse(n.createdAt)).toBeLessThanOrEqual(now.getTime());
  }
}

describe('Demo-Daten', () => {
  const db = createSeedDb(DEFAULT_NOW);

  it('sind deterministisch', () => {
    expect(JSON.stringify(createSeedDb(DEFAULT_NOW))).toBe(JSON.stringify(db));
  });

  it('sind in sich konsistent (Referenzen, Summen, Verläufe)', () => {
    assertConsistent(db, DEFAULT_NOW);
    expect(db.schemaVersion).toBe(SCHEMA_VERSION);
    expect(db.seq.order).toBe(24816 + db.orders.length);
  });

  it('bleiben konsistent zu jeder Tageszeit (auch Sonntag nachts, Winterzeit)', () => {
    for (const now of [
      berlinDate('2026-10-11', '23:40'), // Sonntag
      berlinDate('2026-10-10', '06:10'), // Samstag früh
      berlinDate('2026-10-26', '05:00'), // Montag, Winterzeit
      berlinDate('2026-12-31', '21:00'), // Jahreswechsel
      berlinDate('2027-03-29', '12:00'), // nach der Zeitumstellung
    ]) {
      const d = createSeedDb(now);
      assertConsistent(d, now);
      expect(d.tours).toHaveLength(3);
    }
  });

  it('Markt, Zonen, Gutscheine und Pfandarten laut Vorgabe', () => {
    expect(db.settings).toMatchObject({
      name: 'Getränke Altinger',
      legalName: 'Getränke-Altinger GmbH',
      street: 'Freisinger Landstraße 19',
      zip: '85748',
      phone: '089 3202562',
      email: 'info@getraenke-altinger.de',
      location: { lat: 48.2525161, lng: 11.6534043 },
      orderCutoffMinutes: 90,
      pickupHoldHours: 48,
      carryServiceFee: 390,
      loyaltyPointsPerEuro: 1,
    });
    expect(db.settings.openingHours[0]).toBeNull();
    expect(db.settings.openingHours[6]).toEqual({ open: '07:30', close: '16:00' });
    expect(db.settings.deliverySlots.filter((s) => s.weekday === 1)).toHaveLength(6);
    expect(db.settings.deliverySlots.filter((s) => s.weekday === 6).every((s) => s.capacity === 10)).toBe(true);
    expect(db.settings.zones.map((z) => z.name)).toEqual(['Garching & Hochbrück', 'Nachbarorte', 'München-Nord']);
    expect(db.settings.coupons.map((c) => c.code)).toEqual(['WILLKOMMEN10', 'FEST5', 'GARCHING']);
    expect(db.depositTypes).toHaveLength(11);
    expect(db.categories.map((c) => c.id)).toEqual(['bier', 'alkoholfrei', 'wasser', 'limo', 'saft', 'wein', 'spirituosen', 'fass', 'leihartikel']);
  });

  it('Sortiment: ~70 Artikel, 7 Angebote bis heute + 6, 3 unter Meldebestand, Leihartikel', () => {
    expect(db.products.length).toBeGreaterThanOrEqual(70);
    const offers = db.products.filter((p) => p.offer);
    expect(offers).toHaveLength(7);
    expect(offers.every((p) => p.offer!.validUntil === addDays(todayString(DEFAULT_NOW), 6))).toBe(true);
    expect(db.products.filter((p) => !p.isRental && p.stock < p.minStock)).toHaveLength(3);
    const rentals = db.products.filter((p) => p.isRental);
    expect(rentals).toHaveLength(10);
    expect(rentals.every((p) => !p.depositTypeId && p.categoryId === 'leihartikel')).toBe(true);
    expect(db.products.find((p) => p.id === 'augustiner-hell')).toMatchObject({ priceGross: 1949, packaging: '20 × 0,5 l Glas' });
    expect(db.products.filter((p) => p.tierPrices?.length).length).toBeGreaterThanOrEqual(6);
  });

  // OSRM rastet Wegpunkte auf die nächste Straße ein: Markt und die meisten Stopps liegen < 30 m
  // vom Routenende, einzelne Häuser (z. B. Prof.-Angermair-Ring 40) etwas weiter von der Fahrbahn entfernt.
  it('Touren-Stopps passen zu den Routen-Endpunkten (±30 m, Straßen-Einrastung max. 75 m)', () => {
    let within30 = 0;
    let total = 0;
    const keys = { 't-1': 'tour1', 't-2': 'tour2', 't-3': 'tour3' } as const;
    for (const tour of db.tours) {
      const legs = seedRoute(keys[tour.id as keyof typeof keys]);
      expect(haversine(legs[0].coords[0], db.settings.location)).toBeLessThan(30);
      expect(haversine(legs.at(-1)!.coords.at(-1)!, db.settings.location)).toBeLessThan(30);
      tour.stops.forEach((s, i) => {
        const order = db.orders.find((o) => o.id === s.orderId)!;
        const end = legs[i].coords.at(-1)!;
        const d = haversine(end, order.address!);
        expect(d, `${tour.id} Stopp ${i}`).toBeLessThan(75);
        expect(haversine(legs[i + 1].coords[0], end)).toBeLessThan(1);
        total++;
        if (d < 30) within30++;
      });
    }
    expect(within30 / total).toBeGreaterThan(0.7);
  });

  it('heutige Touren, morgige Lieferungen, Click & Collect', () => {
    const today = todayString(DEFAULT_NOW);
    const byTour = (id: string) => db.orders.filter((o) => o.tourId === id);
    expect(db.tours.map((t) => [t.id, t.driverId, t.stops.length])).toEqual([
      ['t-1', 'd-toni', 4],
      ['t-2', 'd-lukas', 3],
      ['t-3', 'd-ayse', 5],
    ]);
    expect(db.tours[0].stops.map((s) => db.orders.find((o) => o.id === s.orderId)!.customerId)).toEqual(['c-anna', 'c-wagner', 'c-hofmann', 'c-gasthaus']);
    expect(byTour('t-1').every((o) => o.status === 'ready' && o.slot.date === today)).toBe(true);
    expect(new Set(byTour('t-2').map((o) => o.status))).toEqual(new Set(['ready', 'picking']));
    expect(byTour('t-3').every((o) => o.status === 'confirmed')).toBe(true);
    expect(db.tours[0].plannedStart).toBe('14:00'); // nächste volle Stunde nach 13:20
    // Fenster passen zur geplanten Startzeit, ETAs liegen im Fenster
    for (const tour of db.tours) {
      for (const s of tour.stops) {
        const o = db.orders.find((x) => x.id === s.orderId)!;
        expect(o.slot.start <= tour.plannedStart!).toBe(true);
        expect(o.eta).toBe(s.eta);
        expect(Date.parse(s.eta!)).toBeLessThan(berlinDate(o.slot.date, o.slot.end).getTime());
      }
    }
    const tomorrow = db.orders.filter((o) => o.slot.date === addDays(today, 1));
    expect(tomorrow.map((o) => o.customerId).sort()).toEqual(['c-fischer', 'c-koch', 'c-lehmann', 'c-richter', 'c-wolf']);
    expect(tomorrow.every((o) => !o.tourId && (o.status === 'pending' || o.status === 'confirmed'))).toBe(true);
    const pickups = db.orders.filter((o) => o.fulfillment === 'pickup' && o.slot.date === today);
    expect(pickups.map((o) => o.status).sort()).toEqual(['pending', 'picking', 'ready']);
  });

  it('Kunden, Zugänge, Abos, Rechnungen, Benachrichtigungen', () => {
    const anna = db.customers.find((c) => c.id === 'c-anna')!;
    expect(anna).toMatchObject({ loyaltyPoints: 1240, depositBalance: { 'kasten-bier-20': 2, 'kasten-glas-12': 1 } });
    expect(anna.addresses[0]).toMatchObject({ street: 'Mühlgasse 6', lat: 48.2484249, lng: 11.6538629 });
    expect(anna.favorites.length).toBeGreaterThan(2);
    const annaPast = db.orders.filter((o) => o.customerId === 'c-anna' && (o.status === 'delivered' || o.status === 'picked_up'));
    expect(annaPast.length).toBeGreaterThanOrEqual(8);
    expect(annaPast.length).toBeLessThanOrEqual(10);
    expect(annaPast.filter((o) => o.rating)).toHaveLength(2);
    const gasthaus = db.customers.find((c) => c.id === 'c-gasthaus')!;
    expect(gasthaus.b2b).toMatchObject({ priceGroup: 'gastro', discountPercent: 8, paymentTermsDays: 14, creditLimit: 500000, allowInvoice: true, freeDelivery: true, customerNumber: 'K-20117', status: 'active' });
    expect(gasthaus.b2b?.costCenters).toEqual(['Küche', 'Schank', 'Biergarten']);
    expect(db.users.map((u) => u.id)).toEqual(['u-anna', 'u-gasthaus', 'u-nordbyte', 'u-toni', 'u-lukas', 'u-ayse', 'u-admin']);
    expect(db.drivers.map((d) => [d.id, d.capacityCrates, d.status])).toEqual([
      ['d-toni', 80, 'available'],
      ['d-lukas', 80, 'available'],
      ['d-ayse', 60, 'available'],
    ]);
    expect(db.subscriptions.map((s) => [s.id, s.interval, s.weekday, s.slotStart, s.paymentMethod])).toEqual([
      ['s-anna', 'biweekly', 4, '18:00', 'cash'],
      ['s-gasthaus', 'weekly', 1, '08:00', 'invoice'],
      ['s-nordbyte', 'weekly', 2, '10:00', 'invoice'],
    ]);
    const today = todayString(DEFAULT_NOW);
    const gInv = db.invoices.filter((i) => i.customerId === 'c-gasthaus');
    expect(gInv).toHaveLength(6);
    expect(gInv.filter((i) => i.status === 'paid')).toHaveLength(3);
    expect(gInv.filter((i) => i.status !== 'paid' && i.dueDate < today)).toHaveLength(1);
    expect(gInv.filter((i) => i.status !== 'paid' && i.dueDate >= today)).toHaveLength(2);
    expect(db.invoices.filter((i) => i.customerId === 'c-nordbyte')).toHaveLength(3);
    expect(db.notifications.some((n) => n.recipient === 'admin' && n.kind === 'stock')).toBe(true);
    expect(db.notifications.some((n) => n.recipient === 'u-anna' && n.title === 'Ihre Bestellung ist verladen')).toBe(true);
  });

  it('Historie: ~30 Tage, Mo–Sa, ~30 % Geschäftskunden, Bewertungen Ø ~4,7', () => {
    const today = todayString(DEFAULT_NOW);
    const past = db.orders.filter((o) => o.slot.date < today && o.slot.date >= addDays(today, -30));
    expect(past.length).toBeGreaterThan(180);
    expect(past.some((o) => new Date(`${o.slot.date}T12:00:00Z`).getUTCDay() === 0)).toBe(false);
    const b2bShare = past.filter((o) => o.customerType === 'b2b').length / past.length;
    expect(b2bShare).toBeGreaterThan(0.2);
    expect(b2bShare).toBeLessThan(0.4);
    const rated = db.orders.filter((o) => o.rating);
    const avg = rated.reduce((s, o) => s + o.rating!.stars, 0) / rated.length;
    expect(rated.length).toBeGreaterThan(15);
    expect(avg).toBeGreaterThan(4.4);
    expect(avg).toBeLessThan(4.95);
  });

  it('isSeedStale', () => {
    expect(isSeedStale(db, DEFAULT_NOW)).toBe(false);
    expect(isSeedStale(db, new Date(DEFAULT_NOW.getTime() + 8 * 3600_000))).toBe(false); // 21:20 Uhr, gleicher Tag
    expect(isSeedStale(db, new Date(DEFAULT_NOW.getTime() + 11 * 3600_000))).toBe(true); // nach Mitternacht (Berlin)
    expect(isSeedStale({ ...db, schemaVersion: 0 }, DEFAULT_NOW)).toBe(true);
    expect(isSeedStale({ ...db, seededAt: 'kaputt' }, DEFAULT_NOW)).toBe(true);
    expect(dayString(new Date(db.seededAt))).toBe('2026-10-08');
  });

  it('reseedDb erzeugt frische Daten und behält Anmeldungen bekannter Nutzer', () => {
    const tomorrow = new Date(DEFAULT_NOW.getTime() + 24 * 3600_000);
    const previous = { sessions: { 'tok-anna': 'u-anna', 'tok-admin': 'u-admin', 'tok-weg': 'u-gibt-es-nicht' } };
    const fresh = reseedDb(previous, tomorrow);
    expect(isSeedStale(fresh, tomorrow)).toBe(false);
    expect(fresh.sessions).toEqual({ 'tok-anna': 'u-anna', 'tok-admin': 'u-admin' });
    expect(reseedDb(null, tomorrow).sessions).toEqual({});
  });
});
