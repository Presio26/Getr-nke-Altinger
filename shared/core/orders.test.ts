import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import { createTestCore, checkout, firstFreeSlot } from './test/helpers';
import { PICKUP_CODE_ALPHABET } from './util';

const errorOf = async (p: Promise<unknown>): Promise<ApiError> => {
  try {
    await p;
  } catch (err) {
    return err as ApiError;
  }
  throw new Error('Fehler erwartet');
};

describe('Bestell-Lebenszyklus', () => {
  it('Demo-Autobestätigung ist standardmäßig aus – der Markt bestätigt selbst', async () => {
    const t = createTestCore();
    const anna = await t.as('u-anna');
    const admin = await t.as('u-admin');
    expect(t.db().settings.demoAutoConfirm).toBe(false);
    const slot = await firstFreeSlot(anna, 'pickup');
    const order = await anna.placeOrder(checkout({ items: [{ productId: 'paulaner-hell', qty: 1 }], fulfillment: 'pickup', slotId: slot.id }));
    expect(t.core.hasRunningSimulation()).toBe(false);
    t.tickSeconds(10);
    expect((await anna.getOrder(order.id)).status).toBe('pending');
    // eingeschaltet und wieder ausgeschaltet: vorgemerkte Bestellungen werden nicht mehr bestätigt
    const settings = (await admin.getBootstrap()).settings;
    expect((await admin.adminSaveSettings({ ...settings, demoAutoConfirm: true })).demoAutoConfirm).toBe(true);
    const second = await anna.placeOrder(checkout({ items: [{ productId: 'paulaner-hell', qty: 1 }], fulfillment: 'pickup', slotId: slot.id }));
    expect(t.core.hasRunningSimulation()).toBe(true);
    // Einstellungen ohne das Feld (ältere Oberfläche) lassen den Schalter unverändert
    const { demoAutoConfirm: _drop, ...withoutFlag } = (await admin.getBootstrap()).settings;
    void _drop;
    expect((await admin.adminSaveSettings(withoutFlag)).demoAutoConfirm).toBe(true);
    await admin.adminSaveSettings({ ...settings, demoAutoConfirm: false });
    t.tickSeconds(10);
    expect((await anna.getOrder(second.id)).status).toBe('pending');
    expect(t.core.hasRunningSimulation()).toBe(false);
  });

  it('Abholung: Code, Reservierung, Bestand, Benachrichtigung, automatische Bestätigung', async () => {
    const t = createTestCore();
    const anna = await t.as('u-anna');
    const admin = await t.as('u-admin');
    // Demo-Schalter „Bestellungen automatisch bestätigen“ einschalten
    await admin.adminSaveSettings({ ...(await admin.getBootstrap()).settings, demoAutoConfirm: true });
    const slot = await firstFreeSlot(anna, 'pickup');
    const stockBefore = t.db().products.find((p) => p.id === 'paulaner-hell')!.stock;
    const order = await anna.placeOrder(
      checkout({ items: [{ productId: 'paulaner-hell', qty: 3 }], fulfillment: 'pickup', slotId: slot.id, paymentMethod: 'paypal' }),
    );
    expect(order.number).toMatch(/^AL-\d+$/);
    expect(Number(order.number.slice(3))).toBeGreaterThan(24816);
    expect(order.status).toBe('pending');
    expect(order.paymentStatus).toBe('paid');
    expect(order.pickupCode).toMatch(new RegExp(`^[${PICKUP_CODE_ALPHABET}]{6}$`));
    const holdUntil = Date.parse(order.holdUntil!);
    expect(holdUntil).toBeGreaterThan(Date.parse(`${slot.date}T00:00:00Z`) + 48 * 3600_000);
    expect(t.db().products.find((p) => p.id === 'paulaner-hell')!.stock).toBe(stockBefore - 3);
    expect(t.events.some((e) => e.event.type === 'product.updated' && e.audience.all)).toBe(true);
    expect(t.events.some((e) => e.event.type === 'order.created' && e.audience.admin && e.audience.customerIds?.includes('c-anna'))).toBe(true);
    const adminNotes = await admin.listNotifications();
    expect(adminNotes[0].title).toBe('Neue Bestellung');
    expect(t.core.hasRunningSimulation()).toBe(true);

    // Demo: nach ~5 s automatisch bestätigt (über tick)
    t.tickSeconds(3);
    expect((await anna.getOrder(order.id)).status).toBe('pending');
    t.tickSeconds(3);
    const confirmed = await anna.getOrder(order.id);
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.statusHistory.map((s) => s.status)).toEqual(['pending', 'confirmed']);
    const notes = await anna.listNotifications();
    expect(notes[0]).toMatchObject({ title: 'Bestellung bestätigt', link: `/bestellung/${order.id}` });
    expect(t.core.hasRunningSimulation()).toBe(false);

    // Abholcode und QR finden die Bestellung
    expect((await admin.adminFindPickup(order.pickupCode!.toLowerCase())).id).toBe(order.id);
    expect((await admin.adminFindPickup(`ALTINGER:${order.id}:${order.pickupCode}`)).id).toBe(order.id);
    expect((await errorOf(admin.adminFindPickup('ZZZZZZ'))).code).toBe('not_found');
  });

  it('Lieferung an neue Adresse: wird geocodiert und beim Kunden gespeichert', async () => {
    const t = createTestCore();
    const anna = await t.as('u-anna');
    const slot = await firstFreeSlot(anna, 'delivery');
    const order = await anna.placeOrder(
      checkout({
        items: [{ productId: 'paulaner-hell', qty: 2 }],
        slotId: slot.id,
        address: { label: 'Eltern', name: 'Familie Berger', street: 'Bahnhofstraße 3', zip: '85386', city: 'Eching' },
      }),
    );
    expect(order.address?.zip).toBe('85386');
    expect(order.address?.lat).toBeCloseTo(48.3, 1);
    expect(order.totals.deliveryFee).toBe(490);
    const me = await anna.getMyCustomer();
    expect(me.addresses.some((a) => a.id === order.address!.id && a.label === 'Eltern')).toBe(true);
  });

  it('prüft Quote-Fehler und Zeitfenster', async () => {
    const t = createTestCore();
    const anna = await t.as('u-anna');
    const slot = await firstFreeSlot(anna, 'delivery');
    const minOrder = await errorOf(anna.placeOrder(checkout({ items: [{ productId: 'eiswuerfel-2kg', qty: 1 }], slotId: slot.id })));
    expect(minOrder.code).toBe('validation');
    expect(minOrder.message).toContain('Mindestbestellwert');
    expect((minOrder.details as { errors: unknown[] }).errors.length).toBeGreaterThan(0);

    const noSlot = await errorOf(anna.placeOrder(checkout({ items: [{ productId: 'paulaner-hell', qty: 2 }] })));
    expect(noSlot.code).toBe('validation');

    const past = await errorOf(
      anna.placeOrder(checkout({ items: [{ productId: 'paulaner-hell', qty: 2 }], slotId: 'delivery|2026-10-08|08:00-10:00' })),
    );
    expect(past.code).toBe('conflict');

    // Fenster füllen → ausgebucht
    for (let i = 0; i < slot.capacity - slot.booked; i++) {
      await anna.placeOrder(checkout({ items: [{ productId: 'paulaner-hell', qty: 1 }], slotId: slot.id }));
    }
    const full = await errorOf(anna.placeOrder(checkout({ items: [{ productId: 'paulaner-hell', qty: 1 }], slotId: slot.id })));
    expect(full.code).toBe('conflict');
    expect(full.message).toContain('ausgebucht');
    const quote = await anna.quote(checkout({ items: [{ productId: 'paulaner-hell', qty: 1 }], slotId: slot.id }));
    expect(quote.warnings.map((w) => w.code)).toContain('slot');
  });

  it('Storno: Kunde nur pending/confirmed, Markt bis „bereit“; Bestand zurück', async () => {
    const t = createTestCore({ demoMode: false });
    const anna = await t.as('u-anna');
    const admin = await t.as('u-admin');
    const slot = await firstFreeSlot(anna, 'pickup');
    const stock = () => t.db().products.find((p) => p.id === 'tegernseer-hell')!.stock;
    const before = stock();
    const o1 = await anna.placeOrder(checkout({ items: [{ productId: 'tegernseer-hell', qty: 2 }], fulfillment: 'pickup', slotId: slot.id }));
    expect(stock()).toBe(before - 2);
    const cancelled = await anna.cancelOrder(o1.id, 'Doch nicht');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.statusHistory.at(-1)).toMatchObject({ status: 'cancelled', note: 'Doch nicht', by: 'Kunde' });
    expect(stock()).toBe(before);
    expect((await admin.listNotifications())[0].title).toBe('Bestellung storniert');

    const o2 = await anna.placeOrder(checkout({ items: [{ productId: 'tegernseer-hell', qty: 1 }], fulfillment: 'pickup', slotId: slot.id }));
    await admin.adminUpdateOrderStatus(o2.id, 'confirmed');
    await admin.adminUpdateOrderStatus(o2.id, 'picking');
    expect((await errorOf(anna.cancelOrder(o2.id))).code).toBe('conflict');
    await admin.adminUpdateOrderStatus(o2.id, 'ready');
    const byAdmin = await admin.cancelOrder(o2.id, 'Kunde hat angerufen');
    expect(byAdmin.status).toBe('cancelled');
    expect(stock()).toBe(before);
  });

  it('Status-Übergänge sind strikt', async () => {
    const t = createTestCore({ demoMode: false });
    const anna = await t.as('u-anna');
    const admin = await t.as('u-admin');
    const slot = await firstFreeSlot(anna, 'pickup');
    const o = await anna.placeOrder(checkout({ items: [{ productId: 'paulaner-hell', qty: 1 }], fulfillment: 'pickup', slotId: slot.id }));
    // Abholung kann nie „zugestellt“ oder „unterwegs“ sein – auch nicht über einen Sprung
    expect((await errorOf(admin.adminUpdateOrderStatus(o.id, 'delivered'))).code).toBe('conflict');
    expect((await errorOf(admin.adminUpdateOrderStatus(o.id, 'out_for_delivery'))).code).toBe('conflict');
    expect((await anna.getOrder(o.id)).statusHistory).toHaveLength(1);
    // einzelne Arbeitsschritte im Abstand von Minuten → je eine Nachricht
    await admin.adminUpdateOrderStatus(o.id, 'confirmed');
    t.advance(60_000);
    await admin.adminUpdateOrderStatus(o.id, 'picking');
    t.advance(60_000);
    await admin.adminUpdateOrderStatus(o.id, 'ready');
    t.advance(60_000);
    // Abholung kann nicht „unterwegs“ sein
    expect((await errorOf(admin.adminUpdateOrderStatus(o.id, 'out_for_delivery'))).code).toBe('conflict');
    const done = await admin.adminUpdateOrderStatus(o.id, 'picked_up');
    expect(done.status).toBe('picked_up');
    expect(done.paymentStatus).toBe('paid');
    expect((await errorOf(admin.adminUpdateOrderStatus(o.id, 'cancelled'))).code).toBe('conflict');
    const titles = (await anna.listNotifications()).map((n) => n.title);
    expect(titles).toEqual(expect.arrayContaining(['Bestellung bestätigt', 'Ihre Bestellung wird zusammengestellt', 'Ihre Bestellung liegt bereit', 'Danke für Ihren Einkauf']));
  });

  it('Mehrstufiger Sprung (Eingegangen → Abgeholt): Zwischenstufen im Verlauf, nur EINE Kundennachricht', async () => {
    const t = createTestCore({ demoMode: false });
    const anna = await t.as('u-anna');
    const admin = await t.as('u-admin');
    const slot = await firstFreeSlot(anna, 'pickup');
    const o = await anna.placeOrder(checkout({ items: [{ productId: 'paulaner-hell', qty: 1 }], fulfillment: 'pickup', slotId: slot.id }));
    const before = (await anna.listNotifications()).length;
    const eventsBefore = t.events.length;
    const done = await admin.adminUpdateOrderStatus(o.id, 'picked_up', 'Kunde stand an der Kasse');
    expect(done.status).toBe('picked_up');
    expect(done.statusHistory.map((h) => h.status)).toEqual(['pending', 'confirmed', 'picking', 'ready', 'picked_up']);
    expect(done.statusHistory.slice(1).every((h) => h.by === 'Markt')).toBe(true);
    expect(done.statusHistory.at(-1)?.note).toBe('Kunde stand an der Kasse');
    expect(done.paymentStatus).toBe('paid');
    const notes = await anna.listNotifications();
    expect(notes.length - before).toBe(1);
    expect(notes[0].title).toBe('Danke für Ihren Einkauf');
    // genau ein order.updated für diese Bestellung (kein Flackern über Zwischenstände)
    const updates = t.events.slice(eventsBefore).filter((x) => x.event.type === 'order.updated' && x.event.order.id === o.id);
    expect(updates).toHaveLength(1);

    // Lieferung: Eingegangen → Bereit (verladen) in einem Schritt
    const d = await anna.placeOrder(checkout({ items: [{ productId: 'paulaner-hell', qty: 2 }], slotId: (await firstFreeSlot(anna, 'delivery')).id }));
    const ready = await admin.adminUpdateOrderStatus(d.id, 'ready');
    expect(ready.statusHistory.map((h) => h.status)).toEqual(['pending', 'confirmed', 'picking', 'ready']);
    expect((await anna.listNotifications())[0].title).toBe('Ihre Bestellung ist verladen');
  });

  it('schrittweise nachgezogene Stufen (Oberfläche ruft je Stufe auf): nur die Meldung zum Endstatus bleibt', async () => {
    const t = createTestCore({ demoMode: false });
    const anna = await t.as('u-anna');
    const admin = await t.as('u-admin');
    const slot = await firstFreeSlot(anna, 'pickup');
    const o = await anna.placeOrder(checkout({ items: [{ productId: 'paulaner-hell', qty: 1 }], fulfillment: 'pickup', slotId: slot.id }));
    const before = (await anna.listNotifications()).length;
    for (const s of ['confirmed', 'picking', 'ready', 'picked_up'] as const) {
      await admin.adminUpdateOrderStatus(o.id, s);
      t.advance(400);
    }
    const notes = await anna.listNotifications();
    expect(notes.length - before).toBe(1);
    expect(notes[0].title).toBe('Danke für Ihren Einkauf');
    // bereits gelesene oder ältere Meldungen bleiben unangetastet
    const o2 = await anna.placeOrder(checkout({ items: [{ productId: 'paulaner-hell', qty: 1 }], fulfillment: 'pickup', slotId: slot.id }));
    await admin.adminUpdateOrderStatus(o2.id, 'confirmed');
    await anna.markNotificationsRead();
    await admin.adminUpdateOrderStatus(o2.id, 'picking');
    const titles = (await anna.listNotifications()).filter((n) => n.link === `/bestellung/${o2.id}`).map((n) => n.title);
    expect(titles).toEqual(['Ihre Bestellung wird zusammengestellt', 'Bestellung bestätigt']);
  });

  it('Sprung scheitert am Endstatus → keine halben Zwischenstände', async () => {
    const t = createTestCore({ demoMode: false });
    const admin = await t.as('u-admin');
    // Annas Bestellung auf der (geplanten) Tour 1 ist „bereit“; ein Auftrag im Status bestätigt aus Tour 3
    const o = t.db().orders.find((x) => x.tourId === 't-3' && x.status === 'confirmed')!;
    const err = await errorOf(admin.adminUpdateOrderStatus(o.id, 'delivered'));
    expect(err.code).toBe('conflict');
    const after = t.db().orders.find((x) => x.id === o.id)!;
    expect(after.status).toBe('confirmed');
    expect(after.statusHistory.at(-1)?.status).toBe('confirmed');
  });

  it('Zustellung: Leergut-Konto, Treuepunkte, Zahlstatus', async () => {
    const t = createTestCore({ demoMode: false });
    const anna = await t.as('u-anna');
    const admin = await t.as('u-admin');
    const before = await anna.getMyCustomer();
    const slot = await firstFreeSlot(anna, 'delivery');
    const o = await anna.placeOrder(
      checkout({
        items: [
          { productId: 'paulaner-hell', qty: 2 }, // 2 × Bierkasten 20
          { productId: 'adelholzener-naturell-075', qty: 1 }, // 1 × Glas 12
          { productId: 'red-bull-24', qty: 1 }, // Einweg – nicht im Leergut-Konto
        ],
        slotId: slot.id,
        emptiesReturn: [{ depositTypeId: 'kasten-bier-20', qty: 2 }],
        paymentMethod: 'cash',
      }),
    );
    for (const s of ['confirmed', 'picking', 'ready', 'out_for_delivery'] as const) await admin.adminUpdateOrderStatus(o.id, s);
    expect((await anna.getOrder(o.id)).status).toBe('out_for_delivery');
    const delivered = await admin.adminUpdateOrderStatus(o.id, 'delivered');
    expect(delivered.status).toBe('delivered');
    expect(delivered.paymentStatus).toBe('paid');
    expect(delivered.proof?.emptiesCollected).toEqual([{ depositTypeId: 'kasten-bier-20', qty: 2 }]);
    const after = await anna.getMyCustomer();
    expect(after.loyaltyPoints).toBe(before.loyaltyPoints + o.loyaltyPointsEarned!);
    expect(after.depositBalance['kasten-bier-20']).toBe((before.depositBalance['kasten-bier-20'] ?? 0) + 2 - 2);
    expect(after.depositBalance['kasten-glas-12']).toBe((before.depositBalance['kasten-glas-12'] ?? 0) + 1);
    expect(after.depositBalance['dose-24']).toBeUndefined();
    await anna.rateOrder(o.id, 5, 'Top!');
    expect((await anna.getOrder(o.id)).rating?.stars).toBe(5);
  });

  it('Rechnungskauf: offen bis zur Rechnung, dann in Rechnung gestellt und bezahlt', async () => {
    const t = createTestCore({ demoMode: false });
    const gasthaus = await t.as('u-gasthaus');
    const admin = await t.as('u-admin');
    const slot = await firstFreeSlot(gasthaus, 'delivery');
    const quote = await gasthaus.quote(checkout({ items: [{ productId: 'augustiner-hell', qty: 10 }], slotId: slot.id, paymentMethod: 'invoice' }));
    expect(quote.paymentMethods).toContain('invoice');
    expect(quote.loyaltyPointsEarned).toBe(0);
    const o = await gasthaus.placeOrder(checkout({ items: [{ productId: 'augustiner-hell', qty: 10 }], slotId: slot.id, paymentMethod: 'invoice', costCenter: 'Schank' }));
    expect(o.paymentStatus).toBe('open');
    expect(o.lines[0].priceNote).toBe('Gastro-Rabatt 8 %');
    for (const s of ['confirmed', 'picking', 'ready', 'out_for_delivery', 'delivered'] as const) await admin.adminUpdateOrderStatus(o.id, s);
    expect((await gasthaus.getOrder(o.id)).paymentStatus).toBe('open');

    const invoice = await admin.adminCreateInvoice('c-gasthaus');
    expect(invoice.number).toMatch(/^RE-\d{4}-\d{5}$/);
    expect(invoice.orderIds).toContain(o.id);
    expect(invoice.status).toBe('open');
    expect(invoice.net + invoice.vat + invoice.deposit - invoice.depositRefund).toBe(invoice.gross);
    const orderAfter = await gasthaus.getOrder(o.id);
    expect(orderAfter.paymentStatus).toBe('invoiced');
    expect(orderAfter.invoiceId).toBe(invoice.id);
    expect((await gasthaus.listMyInvoices()).some((i) => i.id === invoice.id)).toBe(true);
    const detail = await gasthaus.getInvoice(invoice.id);
    expect(detail.orders.map((x) => x.id)).toContain(o.id);
    expect((await errorOf(admin.adminCreateInvoice('c-gasthaus'))).code).toBe('validation');

    const paid = await admin.adminMarkInvoicePaid(invoice.id);
    expect(paid.status).toBe('paid');
    expect((await gasthaus.getOrder(o.id)).paymentStatus).toBe('paid');
  });

  it('Rechnungsstatus „überfällig“ wird beim Lesen berechnet', async () => {
    const t = createTestCore();
    const gasthaus = await t.as('u-gasthaus');
    const invoices = await gasthaus.listMyInvoices();
    expect(invoices).toHaveLength(6);
    expect(invoices.filter((i) => i.status === 'overdue')).toHaveLength(1);
    expect(invoices.filter((i) => i.status === 'open')).toHaveLength(2);
    expect(invoices.filter((i) => i.status === 'paid')).toHaveLength(3);
    // gespeichert bleibt „open“
    expect(t.db().invoices.some((i) => i.status === ('overdue' as string))).toBe(false);
  });

  it('Meldebestand: Benachrichtigung beim Unterschreiten', async () => {
    const t = createTestCore({ demoMode: false });
    const anna = await t.as('u-anna');
    const admin = await t.as('u-admin');
    const p = t.db().products.find((x) => x.id === 'lugana')!;
    const slot = await firstFreeSlot(anna, 'pickup');
    await anna.placeOrder(checkout({ items: [{ productId: 'lugana', qty: p.stock - p.minStock + 1 }], fulfillment: 'pickup', slotId: slot.id }));
    const notes = await admin.listNotifications();
    expect(notes.some((n) => n.kind === 'stock' && n.body.includes('Lugana'))).toBe(true);
  });

  it('Abos: nächster Termin ab morgen, Ausführung erzeugt bestätigte Lieferungen', async () => {
    const t = createTestCore({ demoMode: false });
    const anna = await t.as('u-anna');
    const admin = await t.as('u-admin');
    const sub = await anna.saveSubscription({
      name: 'Saft jeden Montag',
      items: [{ productId: 'granini-orange', qty: 2 }],
      interval: 'weekly',
      weekday: 1,
      slotStart: '10:00',
      addressId: 'a-anna',
      paymentMethod: 'cash',
      active: true,
      autoEmptiesReturn: true,
    });
    expect(sub.nextDate).toBe('2026-10-12');
    const bad = await errorOf(anna.saveSubscription({ ...sub, id: undefined, weekday: 6, slotStart: '18:00' }));
    expect(bad.code).toBe('validation');
    const created = await admin.adminRunSubscriptions('2026-10-20');
    const mine = created.filter((o) => o.subscriptionId === sub.id);
    expect(mine.map((o) => o.slot.date)).toEqual(['2026-10-12', '2026-10-19']);
    expect(mine.every((o) => o.status === 'confirmed' && o.slot.start === '10:00')).toBe(true);
    expect(mine[0].emptiesReturn).toEqual([{ depositTypeId: 'kasten-saft-6', qty: 2 }]);
    const updated = (await anna.listMySubscriptions()).find((s) => s.id === sub.id)!;
    expect(updated.nextDate).toBe('2026-10-26');
    expect(updated.lastOrderId).toBe(mine[1].id);
    // Dauerauftrag Gasthaus (Montag 08:00, Rechnung) wurde ebenfalls ausgeführt
    expect(created.some((o) => o.subscriptionId === 's-gasthaus' && o.paymentMethod === 'invoice')).toBe(true);
    await anna.deleteSubscription(sub.id);
    expect((await anna.listMySubscriptions()).some((s) => s.id === sub.id)).toBe(false);
  });
});
