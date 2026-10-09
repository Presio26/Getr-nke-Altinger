import { describe, expect, it } from 'vitest';
import type { ApiMethod } from '../api';
import { createTestCore } from './test/helpers';

/** Alle Api-Methoden, die in diesem Test mindestens einmal aufgerufen werden */
const called = new Set<ApiMethod>();
const track = <T>(method: ApiMethod, p: Promise<T>) => {
  called.add(method);
  return p;
};

describe('Api – Rundgang durch alle Methoden', () => {
  it('Konto, Katalog, Markt-Verwaltung ohne Fehler', async () => {
    const t = createTestCore();
    const guest = t.api();
    const anna = await t.as('u-anna');
    const admin = await t.as('u-admin');
    const toni = await t.as('u-toni');
    const nordbyte = await t.as('u-nordbyte');

    // ── öffentlich ──
    expect((await track('getBootstrap', guest.getBootstrap())).categories).toHaveLength(9);
    expect(await track('getDemoUsers', guest.getDemoUsers())).toHaveLength(7);
    const coupon = await track('validateCoupon', anna.validateCoupon(' willkommen10 ', 2500));
    expect(coupon.code).toBe('WILLKOMMEN10');
    await expect(anna.validateCoupon('WILLKOMMEN10', 1000)).rejects.toMatchObject({ code: 'validation' });
    await expect(nordbyte.validateCoupon('WILLKOMMEN10', 5000)).rejects.toMatchObject({ code: 'validation' });
    expect((await track('checkZip', guest.checkZip('85737')))?.name).toBe('Nachbarorte');
    expect(await guest.checkZip('80331')).toBeNull();
    const rentals = await track('rentalAvailability', guest.rentalAvailability('2026-10-17'));
    expect(rentals.find((r) => r.productId === 'kuehlanhaenger')).toMatchObject({ total: 1, available: 1 });
    const found = await track('searchAddress', guest.searchAddress('Hauptstraße 5, 85386 Eching'));
    expect(found[0]).toMatchObject({ zip: '85386', city: 'Eching' });
    expect((await track('getProduct', guest.getProduct('augustiner-hell'))).brand).toBe('Augustiner');
    await expect(guest.getProduct('gibt-es-nicht')).rejects.toMatchObject({ code: 'not_found' });

    // ── Kundenkonto ──
    let me = await track('updateMyCustomer', anna.updateMyCustomer({ phone: '0176 1111111', marketingOptIn: false }));
    expect(me.phone).toBe('0176 1111111');
    me = await track('saveAddress', anna.saveAddress({ label: 'Büro', name: 'Anna Berger', street: 'Lichtenbergstraße 2', zip: '85748', city: 'Garching b. München' }));
    const office = me.addresses.find((a) => a.label === 'Büro')!;
    expect(office.lat).toBeGreaterThan(48);
    me = await anna.saveAddress({ ...office, notes: 'Pforte' });
    expect(me.addresses.find((a) => a.id === office.id)?.notes).toBe('Pforte');
    me = await track('deleteAddress', anna.deleteAddress(office.id));
    expect(me.addresses.some((a) => a.id === office.id)).toBe(false);
    await expect(anna.deleteAddress('a-anna')).rejects.toMatchObject({ code: 'conflict' }); // vom Abo genutzt
    me = await track('toggleFavorite', anna.toggleFavorite('aperol'));
    expect(me.favorites).toContain('aperol');
    me = await anna.toggleFavorite('aperol');
    expect(me.favorites).not.toContain('aperol');
    expect((await track('listMySubscriptions', anna.listMySubscriptions())).map((s) => s.id)).toEqual(['s-anna']);
    await track('markNotificationsRead', anna.markNotificationsRead());
    expect((await anna.listNotifications()).every((n) => n.read)).toBe(true);

    // ── B2B ──
    const invoices = await nordbyte.listMyInvoices();
    const detail = await track('getInvoice', nordbyte.getInvoice(invoices[0].id));
    expect(detail.customer.id).toBe('c-nordbyte');
    expect(detail.settings.legalName).toBe('Getränke-Altinger GmbH');

    // ── Fahrer ──
    expect((await track('setDriverStatus', toni.setDriverStatus('break'))).status).toBe('break');
    await toni.setDriverStatus('available');

    // ── Markt ──
    expect((await track('adminListCustomers', admin.adminListCustomers())).length).toBeGreaterThan(40);
    expect((await track('adminListSubscriptions', admin.adminListSubscriptions())).length).toBe(3);
    expect((await track('adminListInvoices', admin.adminListInvoices())).length).toBe(9);
    expect((await track('adminListDrivers', admin.adminListDrivers())).length).toBe(3);
    const c = await track('adminAdjustDeposit', admin.adminAdjustDeposit('c-anna', 'kasten-bier-20', -1, 'Kasten im Markt abgegeben'));
    expect(c.depositBalance['kasten-bier-20']).toBe(1);
    expect(c.internalNote).toContain('Kasten im Markt abgegeben');
    await expect(admin.adminAdjustDeposit('c-anna', 'kasten-bier-20', -5)).rejects.toMatchObject({ code: 'validation' });

    const product = await track('getProduct', admin.getProduct('paulaner-hell'));
    const saved = await track('adminSaveProduct', admin.adminSaveProduct({ ...product, priceGross: 1949, offer: { priceGross: 1799, validUntil: '2026-10-20', label: 'Herbst-Aktion' } }));
    expect(saved).toMatchObject({ id: 'paulaner-hell', priceGross: 1949 });
    expect((await guest.getProduct('paulaner-hell')).offer?.label).toBe('Herbst-Aktion');
    const { id: _id, ...rest } = product;
    void _id;
    const created = await admin.adminSaveProduct({ ...rest, name: 'Original Münchner Hell (Test)', sku: 'TEST-1' });
    expect(created.id).not.toBe('paulaner-hell');
    expect((await track('adminAdjustStock', admin.adminAdjustStock(created.id, -5, 'Bruch'))).stock).toBe(product.stock - 5);
    await expect(admin.adminAdjustStock(created.id, -10_000)).rejects.toMatchObject({ code: 'validation' });

    // Einstellungen: Rundreise mit dem aktuellen Stand muss funktionieren
    const settings = (await guest.getBootstrap()).settings;
    const savedSettings = await track('adminSaveSettings', admin.adminSaveSettings({ ...settings, announcement: 'Biergarten-Saison verlängert!' }));
    expect(savedSettings.announcement).toBe('Biergarten-Saison verlängert!');
    expect(savedSettings.deliverySlots).toEqual(settings.deliverySlots);
    expect(savedSettings.zones).toEqual(settings.zones);
    expect(savedSettings.coupons).toEqual(settings.coupons);
    await expect(admin.adminSaveSettings({ ...settings, zones: [{ ...settings.zones[0], zips: ['abc'] }] })).rejects.toMatchObject({ code: 'validation' });

    const driver = (await admin.adminListDrivers())[0];
    expect((await track('adminSaveDriver', admin.adminSaveDriver({ ...driver, vehicle: 'E-Transporter · M-GA 2099' }))).vehicle).toContain('E-Transporter');

    const count = await track('adminBroadcast', admin.adminBroadcast({ title: 'Herbstfest', body: 'Am Samstag Freibier-Verkostung im Markt!', audience: 'b2c' }));
    expect(count).toBe(1); // nur Anna hat als Privatkundin einen Zugang
    expect((await anna.listNotifications())[0]).toMatchObject({ title: 'Herbstfest', kind: 'promo' });

    const customer = (await track('adminGetCustomer', admin.adminGetCustomer('c-campus'))).customer;
    const updated = await track('adminSaveCustomer', admin.adminSaveCustomer({ ...customer, internalNote: 'Neue Öffnungszeiten ab November' }));
    expect(updated.internalNote).toBe('Neue Öffnungszeiten ab November');
    const listed = await track('adminListOrders', admin.adminListOrders({ q: 'mühlgasse' }));
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((o) => o.customerId === 'c-anna')).toBe(true);
    const todayDeliveries = await admin.adminListOrders({ date: '2026-10-08', fulfillment: 'delivery', status: ['ready'] });
    expect(todayDeliveries.length).toBeGreaterThanOrEqual(6);
  });

  it('jede Api-Methode ist im Core implementiert', () => {
    const t = createTestCore();
    const handlers = t.core.handlers as unknown as Record<string, unknown>;
    expect(Object.keys(handlers).length).toBeGreaterThanOrEqual(70);
    for (const name of Object.keys(handlers)) expect(typeof handlers[name]).toBe('function');
    expect(called.size).toBeGreaterThanOrEqual(25);
  });
});
