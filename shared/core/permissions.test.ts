import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import { createTestCore, checkout, firstFreeSlot } from './test/helpers';

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    return (err as ApiError).code;
  }
  return 'ok';
}

describe('Berechtigungen', () => {
  it('Gäste: öffentliche Daten ja, Konto/Markt nein', async () => {
    const t = createTestCore();
    const guest = t.api();
    const boot = await guest.getBootstrap();
    expect(boot.settings.name).toBe('Getränke Altinger');
    expect(boot.demoUsers.map((u) => u.id)).toEqual(['u-anna', 'u-gasthaus', 'u-nordbyte', 'u-toni', 'u-lukas', 'u-ayse', 'u-admin']);
    expect((await guest.listProducts()).length).toBeGreaterThan(60);
    expect(await guest.me()).toBeNull();
    expect(await codeOf(guest.getMyCustomer())).toBe('unauthorized');
    expect(await codeOf(guest.placeOrder(checkout({ items: [{ productId: 'paulaner-hell', qty: 1 }] })))).toBe('unauthorized');
    expect(await codeOf(guest.adminListOrders())).toBe('unauthorized');
    expect(await codeOf(guest.getDriverToday())).toBe('unauthorized');
    expect(await codeOf(guest.getOrder('o-24817'))).toBe('unauthorized');
  });

  it('Kunden sehen nur eigene Daten', async () => {
    const t = createTestCore();
    const anna = await t.as('u-anna');
    const mine = await anna.listMyOrders();
    expect(mine.length).toBeGreaterThan(5);
    expect(mine.every((o) => o.customerId === 'c-anna')).toBe(true);
    const foreign = t.db().orders.find((o) => o.customerId === 'c-gasthaus')!;
    expect(await codeOf(anna.getOrder(foreign.id))).toBe('not_found');
    expect(await codeOf(anna.getTracking(foreign.id))).toBe('not_found');
    expect(await codeOf(anna.cancelOrder(foreign.id))).toBe('not_found');
    expect(await codeOf(anna.adminListOrders())).toBe('forbidden');
    expect(await codeOf(anna.adminGetStats(30))).toBe('forbidden');
    expect(await codeOf(anna.startTour('t-1'))).toBe('forbidden');
    expect(await codeOf(anna.setCostCenters(['A']))).toBe('forbidden');
    expect(await codeOf(anna.getInvoice(t.db().invoices[0].id))).toBe('not_found');
    expect(await anna.listMyInvoices()).toEqual([]);
    const me = await anna.getMyCustomer();
    expect(me.id).toBe('c-anna');
    expect(me.internalNote).toBeUndefined();
  });

  it('Geschäftskunden pflegen Kostenstellen und sehen eigene Rechnungen', async () => {
    const t = createTestCore();
    const nordbyte = await t.as('u-nordbyte');
    const c = await nordbyte.setCostCenters(['Office München-Nord', 'Events', ' Events ', 'Weihnachtsfeier']);
    expect(c.b2b?.costCenters).toEqual(['Office München-Nord', 'Events', 'Weihnachtsfeier']);
    const invoices = await nordbyte.listMyInvoices();
    expect(invoices).toHaveLength(3);
    expect(invoices.every((i) => i.customerId === 'c-nordbyte')).toBe(true);
    const gasthausInvoice = t.db().invoices.find((i) => i.customerId === 'c-gasthaus')!;
    expect(await codeOf(nordbyte.getInvoice(gasthausInvoice.id))).toBe('not_found');
  });

  it('Fahrer sehen nur zugewiesene Touren und Aufträge', async () => {
    const t = createTestCore();
    const toni = await t.as('u-toni');
    const today = await toni.getDriverToday();
    expect(today.driver.id).toBe('d-toni');
    expect(today.tours.map((x) => x.id)).toEqual(['t-1']);
    expect(today.tours[0].orders).toHaveLength(4);
    const lukasOrder = t.db().orders.find((o) => o.tourId === 't-2')!;
    expect(await codeOf(toni.getOrder(lukasOrder.id))).toBe('not_found');
    expect(await codeOf(toni.startTour('t-2'))).toBe('forbidden');
    expect(await codeOf(toni.simulateTour('t-2'))).toBe('forbidden');
    expect(await codeOf(toni.adminListTours('2026-10-08'))).toBe('forbidden');
    expect(await codeOf(toni.cancelOrder(today.tours[0].orders[0].id))).toBe('forbidden');
    expect(await codeOf(toni.getMyCustomer())).toBe('forbidden');
    const tour = await toni.startTour('t-1');
    expect(tour.status).toBe('active');
  });

  it('gibt nie Passwörter oder Sitzungen heraus', async () => {
    const t = createTestCore();
    const session = await t.api().login('ANNA.BERGER@example.com ', 'demo');
    expect(session.user.id).toBe('u-anna');
    expect(session.token).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(JSON.stringify(session)).not.toContain('password');
    const admin = await t.as('u-admin');
    const detail = await admin.adminGetCustomer('c-anna');
    expect(JSON.stringify(detail)).not.toContain('password');
    expect(JSON.stringify(await t.api().getBootstrap())).not.toContain('password');
    expect(await codeOf(t.api().login('anna.berger@example.com', 'falsch'))).toBe('unauthorized');
    expect(t.core.userForToken(session.token)).not.toHaveProperty('password');
    expect(await t.api(session.token).me()).toMatchObject({ token: session.token, user: { id: 'u-anna' } });
    await t.api(session.token).logout();
    expect(t.core.userForToken(session.token)).toBeNull();
  });

  it('Ergebnisse sind Kopien – Aufrufer verändern den internen Stand nicht', async () => {
    const t = createTestCore();
    const products = await t.api().listProducts();
    products[0].priceGross = 1;
    products[0].name = 'Manipuliert';
    const fresh = await t.api().getProduct(products[0].id);
    expect(fresh.priceGross).not.toBe(1);
    expect(fresh.name).not.toBe('Manipuliert');
  });

  it('unbekannte Methoden → not_found, unerwartete Fehler → internal', async () => {
    const t = createTestCore();
    expect(await codeOf(t.core.call('gibtEsNicht', t.core.ctx(), []))).toBe('not_found');
    expect(await codeOf(t.core.call('constructor', t.core.ctx(), []))).toBe('not_found');
    const broken = { ...t.core.getDb(), products: null as unknown as [] };
    t.core.replaceDb(broken);
    const original = console.error;
    console.error = () => {};
    try {
      expect(await codeOf(t.core.call('listProducts', t.core.ctx(), []))).toBe('internal');
    } finally {
      console.error = original;
    }
  });

  it('Registrierung und Geschäftskunden-Antrag', async () => {
    const t = createTestCore();
    const guest = t.api();
    const s = await guest.register({
      name: 'Max Muster',
      email: 'max@example.com',
      password: 'geheim123',
      address: { label: 'Zuhause', name: 'Max Muster', street: 'Untere Straße 1', zip: '85748', city: 'Garching b. München' },
    });
    expect(s.user.role).toBe('customer');
    expect(await codeOf(guest.register({ name: 'X', email: 'max@example.com', password: 'geheim123' }))).toBe('conflict');
    expect(await codeOf(guest.register({ name: 'X', email: 'kein-mail', password: 'geheim123' }))).toBe('validation');

    const b = await guest.requestBusinessAccount({
      companyName: 'Bäckerei Test',
      contactName: 'Eva Test',
      email: 'eva@baeckerei.example',
      password: 'geheim123',
      phone: '089 1',
      segment: 'gastronomie',
      address: { label: 'Laden', name: 'Bäckerei Test', street: 'Untere Straße 2', zip: '85748', city: 'Garching b. München' },
    });
    expect(b.user.role).toBe('business');
    const biz = t.api(b.token);
    const me = await biz.getMyCustomer();
    expect(me.b2b?.status).toBe('pending');
    const slot = await firstFreeSlot(biz, 'pickup');
    const q = await biz.quote(checkout({ items: [{ productId: 'paulaner-hell', qty: 2 }], fulfillment: 'pickup', slotId: slot.id, paymentMethod: 'invoice' }));
    expect(q.paymentMethods).toEqual(['cash', 'ec', 'paypal', 'card']);
    expect(q.warnings.map((w) => w.code)).toContain('business_pending');
    const order = await biz.placeOrder(checkout({ items: [{ productId: 'paulaner-hell', qty: 2 }], fulfillment: 'pickup', slotId: slot.id, paymentMethod: 'cash' }));
    expect(order.customerType).toBe('b2b');
    const admin = await t.as('u-admin');
    expect((await admin.listNotifications()).some((n) => n.title === 'Neuer Geschäftskunden-Antrag')).toBe(true);
    // Freischaltung → Benachrichtigung
    const customer = (await admin.adminGetCustomer(me.id)).customer;
    await admin.adminSaveCustomer({ ...customer, b2b: { ...customer.b2b!, status: 'active', allowInvoice: true, creditLimit: 100000, discountPercent: 5 } });
    expect((await biz.listNotifications())[0].title).toBe('Ihr Geschäftskundenkonto ist freigeschaltet');
  });

  it('resetDemo: im Demo-Modus für alle, sonst nur Admin; Sitzungen bleiben', async () => {
    const demo = createTestCore();
    const anna = await demo.as('u-anna');
    await anna.resetDemo();
    expect(demo.events.some((e) => e.event.type === 'data.reset' && e.audience.all)).toBe(true);
    expect((await anna.me())?.user.id).toBe('u-anna');

    const prod = createTestCore({ demoMode: false });
    const anna2 = await prod.as('u-anna');
    expect(await codeOf(anna2.resetDemo())).toBe('forbidden');
    expect(await codeOf(prod.api().demoLogin('u-anna'))).toBe('forbidden');
    const admin = await prod.as('u-admin');
    await admin.resetDemo();
    expect((await admin.me())?.user.id).toBe('u-admin');
  });

  it('persistiert nach ändernden Operationen, nicht nach Lesezugriffen', async () => {
    const t = createTestCore();
    const anna = await t.as('u-anna');
    const before = t.persistCount();
    await anna.listProducts();
    await anna.getMyCustomer();
    expect(t.persistCount()).toBe(before);
    await anna.toggleFavorite('aperol');
    expect(t.persistCount()).toBe(before + 1);
  });
});
