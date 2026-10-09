import { describe, expect, it } from 'vitest';
import type { CheckoutInput, Customer, Order, Product } from '../types';
import { addDays, todayString } from '../time';
import { calculateQuote, priceProduct, type QuoteContext } from './pricing';
import { createSeedDb } from './seed';
import { DEFAULT_NOW } from './test/helpers';

const now = DEFAULT_NOW;
const db = createSeedDb(now);
const product = (id: string): Product => {
  const p = db.products.find((x) => x.id === id);
  if (!p) throw new Error(id);
  return p;
};
const customer = (id: string): Customer => {
  const c = db.customers.find((x) => x.id === id);
  if (!c) throw new Error(id);
  return c;
};

function ctx(partial: Partial<QuoteContext> = {}): QuoteContext {
  return { settings: db.settings, products: db.products, depositTypes: db.depositTypes, customer: null, now, orders: [], ...partial };
}

function input(partial: Partial<CheckoutInput>): CheckoutInput {
  return { items: [], fulfillment: 'pickup', emptiesReturn: [], carryService: false, paymentMethod: 'cash', ...partial };
}

/** Eching-Adresse (Nachbarorte) */
const echingCustomer: Customer = { ...customer('c-bauer') };

describe('priceProduct – Privatkunden', () => {
  it('liefert Bruttopreis, Netto und Pfand', () => {
    const p = priceProduct(product('paulaner-hell'), null, 2, now);
    expect(p.unitGross).toBe(1899);
    expect(p.unitNet).toBe(Math.round(1899 / 1.19));
    expect(p.lineGross).toBe(3798);
    expect(p.depositUnit).toBe(310);
    expect(p.depositTotal).toBe(620);
    expect(p.showNet).toBe(false);
    expect(p.priceSource).toBe('list');
    expect(p.basePrice.replace(/\s/g, ' ')).toBe('1,90 €/l');
  });

  it('wendet gültige Angebote an und ignoriert abgelaufene', () => {
    const offer = priceProduct(product('augustiner-hell'), null, 1, now);
    expect(offer.unitGross).toBe(1799);
    expect(offer.regularUnitGross).toBe(1949);
    expect(offer.priceNote).toBe('Angebot der Woche');
    expect(offer.discounted).toBe(true);
    expect(offer.savingsGross).toBe(150);

    const later = new Date(now.getTime() + 7 * 86_400_000);
    const expired = priceProduct(product('augustiner-hell'), null, 1, later);
    expect(expired.unitGross).toBe(1949);
    expect(expired.priceNote).toBeUndefined();
  });

  it('berechnet für Leihartikel kein Pfand', () => {
    const p = priceProduct(product('zapfanlage-1'), null, 1, now);
    expect(p.isRental).toBe(true);
    expect(p.depositUnit).toBe(0);
    expect(p.basePrice).toBe('');
  });
});

describe('priceProduct – Geschäftskunden', () => {
  const gasthaus = customer('c-gasthaus'); // gastro, 8 %
  const nordbyte = customer('c-nordbyte'); // standard, 3 %

  it('Gruppenrabatt schlägt Angebot und kleine Staffel', () => {
    const p = priceProduct(product('augustiner-hell'), gasthaus, 1, now);
    const listNet = Math.round(1949 / 1.19);
    expect(p.regularUnitNet).toBe(listNet);
    expect(p.unitNet).toBe(Math.round(listNet * 0.92));
    expect(p.unitGross).toBe(Math.round(p.unitNet * 1.19));
    expect(p.priceNote).toBe('Gastro-Rabatt 8 %');
    expect(p.showNet).toBe(true);
    expect(p.nextTier?.minQty).toBe(10);
  });

  it('Staffelpreis gewinnt bei großer Menge', () => {
    const p = priceProduct(product('augustiner-hell'), gasthaus, 25, now);
    const tier = product('augustiner-hell').tierPrices!.find((t) => t.minQty === 25)!;
    expect(tier.priceNet).toBeLessThan(Math.round(Math.round(1949 / 1.19) * 0.92));
    expect(p.unitNet).toBe(tier.priceNet);
    expect(p.priceNote).toBe('Staffelpreis ab 25');
    expect(p.lineNet).toBe(tier.priceNet * 25);
  });

  it('Rabatt gewinnt gegen die erste Staffel, wenn günstiger', () => {
    const later = new Date(now.getTime() + 8 * 86_400_000); // Angebot abgelaufen
    const p = priceProduct(product('augustiner-hell'), gasthaus, 10, later);
    const tier10 = product('augustiner-hell').tierPrices!.find((t) => t.minQty === 10)!;
    expect(Math.round(Math.round(1949 / 1.19) * 0.92)).toBeLessThan(tier10.priceNet);
    expect(p.priceSource).toBe('discount');
  });

  it('Angebotspreis (netto) gewinnt gegen kleinen Rabatt', () => {
    const p = priceProduct(product('adelholzener-classic-075'), nordbyte, 1, now);
    expect(p.unitNet).toBe(Math.round(899 / 1.19));
    expect(p.priceSource).toBe('offer');
    expect(p.priceNote).toBe('Angebot der Woche');
  });
});

describe('calculateQuote', () => {
  it('summiert Ware, Pfand, Leergut-Gutschrift und MwSt. (19 %)', () => {
    const q = calculateQuote(
      input({
        items: [
          { productId: 'paulaner-hell', qty: 2 },
          { productId: 'adelholzener-naturell-075', qty: 1 },
        ],
        emptiesReturn: [
          { depositTypeId: 'kasten-bier-20', qty: 2 },
          { depositTypeId: 'kasten-glas-12', qty: 1 },
        ],
      }),
      ctx(),
    );
    expect(q.errors).toEqual([]);
    const itemsGross = 2 * 1899 + 999;
    expect(q.totals.itemsGross).toBe(itemsGross);
    expect(q.totals.deposit).toBe(2 * 310 + 330);
    expect(q.totals.depositRefund).toBe(2 * 310 + 330);
    expect(q.totals.vat).toBe(Math.round((itemsGross * 19) / 119));
    expect(q.totals.total).toBe(itemsGross);
    expect(q.loyaltyPointsEarned).toBe(Math.floor(itemsGross / 100));
    expect(q.paymentMethods).toEqual(['cash', 'ec', 'paypal', 'card']);
  });

  it('teilt MwSt. bei gemischten Sätzen anteilig auf (inkl. Gutschein und Gebühren)', () => {
    const q = calculateQuote(
      input({
        fulfillment: 'delivery',
        address: { label: 'x', name: 'x', street: 'Bahnhofstraße 1', zip: '85386', city: 'Eching' },
        items: [
          { productId: 'paulaner-hell', qty: 2 }, // 19 %
          { productId: 'eiswuerfel-2kg', qty: 3 }, // 7 %
        ],
        carryService: true,
        couponCode: 'garching',
      }),
      ctx(),
    );
    expect(q.errors).toEqual([]);
    const g19 = 2 * 1899;
    const g7 = 3 * 299;
    const goods = g19 + g7;
    expect(q.totals.itemsGross).toBe(goods);
    expect(q.totals.discount).toBe(300);
    expect(q.totals.deliveryFee).toBe(490);
    expect(q.totals.carryFee).toBe(390);
    const fees = 490 + 390;
    // Pfand (2 × 3,10 € auf 19-%-Ware) ist Teil des Entgelts und wird mit 19 % versteuert
    expect(q.totals.deposit).toBe(2 * 310);
    const vat19 = ((g19 - 300 * (g19 / goods) + fees * (g19 / goods) + 2 * 310) * 19) / 119;
    const vat7 = ((g7 - 300 * (g7 / goods) + fees * (g7 / goods)) * 7) / 107;
    expect(q.totals.vat).toBe(Math.round(vat19 + vat7));
    expect(q.totals.total).toBe(goods - 300 + q.totals.deposit + fees);
    expect(q.coupon?.code).toBe('GARCHING');
  });

  it('Gutscheine: Prozent, Mindestwert, nur Privatkunden, unbekannt', () => {
    const items = [{ productId: 'paulaner-hell', qty: 2 }];
    const pct = calculateQuote(input({ items, couponCode: 'WILLKOMMEN10' }), ctx());
    expect(pct.totals.discount).toBe(Math.round(3798 * 0.1));
    expect(pct.loyaltyPointsEarned).toBe(Math.floor((3798 - 380) / 100));

    const small = calculateQuote(input({ items: [{ productId: 'eiswuerfel-2kg', qty: 1 }], couponCode: 'WILLKOMMEN10' }), ctx());
    expect(small.totals.discount).toBe(0);
    expect(small.errors).toEqual([]);
    expect(small.warnings.map((w) => w.code)).toContain('coupon');

    const b2b = calculateQuote(input({ items, couponCode: 'WILLKOMMEN10', paymentMethod: 'invoice' }), ctx({ customer: customer('c-gasthaus') }));
    expect(b2b.errors.map((e) => e.code)).toContain('coupon');

    const unknown = calculateQuote(input({ items, couponCode: 'GIBTSNICHT' }), ctx());
    expect(unknown.errors[0].code).toBe('coupon');

    const fixed = calculateQuote(input({ items: [{ productId: 'paulaner-hell', qty: 3 }], couponCode: 'FEST5' }), ctx());
    expect(fixed.totals.discount).toBe(500);
  });

  it('Liefergebiete: Gebühr, kostenlos ab, Mindestbestellwert, außerhalb', () => {
    const garching = calculateQuote(
      input({ fulfillment: 'delivery', addressId: 'a-anna', items: [{ productId: 'paulaner-hell', qty: 1 }] }),
      ctx({ customer: customer('c-anna') }),
    );
    expect(garching.zone?.id).toBe('z-garching');
    expect(garching.totals.deliveryFee).toBe(0);
    expect(garching.errors).toEqual([]);

    const tooSmall = calculateQuote(
      input({ fulfillment: 'delivery', addressId: 'a-anna', items: [{ productId: 'eiswuerfel-2kg', qty: 1 }] }),
      ctx({ customer: customer('c-anna') }),
    );
    expect(tooSmall.errors.map((e) => e.code)).toContain('min_order');
    expect(tooSmall.missingForMinOrder).toBe(1500 - 299);

    const eching = calculateQuote(
      input({ fulfillment: 'delivery', items: [{ productId: 'paulaner-hell', qty: 2 }] }),
      ctx({ customer: echingCustomer }),
    );
    expect(eching.zone?.id).toBe('z-nachbarorte');
    expect(eching.totals.deliveryFee).toBe(490);
    expect(eching.missingForFreeDelivery).toBe(7500 - 3798);

    const echingFree = calculateQuote(
      input({ fulfillment: 'delivery', items: [{ productId: 'paulaner-hell', qty: 4 }] }),
      ctx({ customer: echingCustomer }),
    );
    expect(echingFree.totals.deliveryFee).toBe(0);
    expect(echingFree.missingForFreeDelivery).toBe(0);

    const muc = calculateQuote(
      input({
        fulfillment: 'delivery',
        address: { label: 'x', name: 'x', street: 'Situlistraße 1', zip: '80939', city: 'München' },
        items: [{ productId: 'paulaner-hell', qty: 2 }],
      }),
      ctx(),
    );
    expect(muc.errors.map((e) => e.code)).toContain('min_order');
    expect(muc.totals.deliveryFee).toBe(790);

    const outside = calculateQuote(
      input({
        fulfillment: 'delivery',
        address: { label: 'x', name: 'x', street: 'Marienplatz 1', zip: '80331', city: 'München' },
        items: [{ productId: 'paulaner-hell', qty: 5 }],
      }),
      ctx(),
    );
    expect(outside.errors.map((e) => e.code)).toContain('zone');
  });

  it('Geschäftskunden mit freier Lieferung zahlen keine Liefergebühr', () => {
    const c: Customer = {
      ...customer('c-gasthaus'),
      addresses: [{ ...customer('c-gasthaus').addresses[0], zip: '85386', city: 'Eching' }],
    };
    const q = calculateQuote(
      input({ fulfillment: 'delivery', items: [{ productId: 'paulaner-hell', qty: 2 }], paymentMethod: 'invoice' }),
      ctx({ customer: c }),
    );
    expect(q.totals.deliveryFee).toBe(0);
    expect(q.loyaltyPointsEarned).toBe(0);
    expect(q.customerType).toBe('b2b');
  });

  it('Tragservice nur bei Lieferung', () => {
    const items = [{ productId: 'paulaner-hell', qty: 2 }];
    const delivery = calculateQuote(input({ fulfillment: 'delivery', addressId: 'a-anna', items, carryService: true }), ctx({ customer: customer('c-anna') }));
    expect(delivery.totals.carryFee).toBe(390);
    const pickup = calculateQuote(input({ items, carryService: true }), ctx({ customer: customer('c-anna') }));
    expect(pickup.totals.carryFee).toBe(0);
  });

  it('Zahlarten: Rechnung nur für freigeschaltete B2B-Kunden, Kreditlimit, Antrag offen', () => {
    const items = [{ productId: 'paulaner-hell', qty: 2 }];
    const gasthaus = calculateQuote(input({ items, paymentMethod: 'invoice' }), ctx({ customer: customer('c-gasthaus'), openAmount: 0 }));
    expect(gasthaus.paymentMethods).toEqual(['cash', 'ec', 'paypal', 'card', 'invoice', 'sepa']);
    expect(gasthaus.errors).toEqual([]);

    const overLimit = calculateQuote(input({ items, paymentMethod: 'invoice' }), ctx({ customer: customer('c-gasthaus'), openAmount: 499_000 }));
    expect(overLimit.paymentMethods).not.toContain('invoice');
    expect(overLimit.warnings.map((w) => w.code)).toContain('credit_limit');
    expect(overLimit.errors.map((e) => e.code)).toContain('payment');

    const pending = calculateQuote(input({ items, paymentMethod: 'cash' }), ctx({ customer: customer('c-sonnenschein') }));
    expect(pending.paymentMethods).toEqual(['cash', 'ec', 'paypal', 'card']);
    expect(pending.warnings.map((w) => w.code)).toContain('business_pending');

    const b2cInvoice = calculateQuote(input({ items, paymentMethod: 'invoice' }), ctx({ customer: customer('c-anna') }));
    expect(b2cInvoice.errors.map((e) => e.code)).toContain('payment');
  });

  it('Lagerbestand und Leihartikel-Verfügbarkeit', () => {
    const tooMany = calculateQuote(input({ items: [{ productId: 'havana-club-3', qty: 5 }] }), ctx());
    expect(tooMany.errors.map((e) => e.code)).toContain('stock');

    const noDate = calculateQuote(input({ items: [{ productId: 'zapfanlage-2', qty: 1 }] }), ctx());
    expect(noDate.errors.map((e) => e.code)).toContain('rental_date');

    const date = addDays(todayString(now), 5);
    const booked = {
      id: 'o-x',
      status: 'confirmed',
      eventDate: addDays(date, 1),
      lines: [{ productId: 'zapfanlage-2', qty: 2, isRental: true }],
    } as unknown as Order;
    const ok = calculateQuote(input({ items: [{ productId: 'zapfanlage-2', qty: 1 }], eventDate: date }), ctx({ orders: [booked] }));
    expect(ok.errors).toEqual([]);
    const full = calculateQuote(input({ items: [{ productId: 'zapfanlage-2', qty: 2 }], eventDate: date }), ctx({ orders: [booked] }));
    expect(full.errors.map((e) => e.code)).toContain('stock');
    const otherDay = calculateQuote(input({ items: [{ productId: 'zapfanlage-2', qty: 3 }], eventDate: addDays(date, 3) }), ctx({ orders: [booked] }));
    expect(otherDay.errors).toEqual([]);
    // Leihartikel laufen nicht über den Lagerbestand
    const many = calculateQuote(input({ items: [{ productId: 'bierzeltgarnitur', qty: 40 }], eventDate: date }), ctx());
    expect(many.errors).toEqual([]);
    expect(many.totals.deposit).toBe(0);
  });

  it('meldet leeren Warenkorb, ungültige Mengen und nicht rückgabefähiges Leergut', () => {
    expect(calculateQuote(input({ items: [] }), ctx()).errors[0].code).toBe('empty');
    expect(calculateQuote(input({ items: [{ productId: 'paulaner-hell', qty: 1.5 }] }), ctx()).errors.map((e) => e.code)).toContain('qty');
    const empties = calculateQuote(
      input({ items: [{ productId: 'paulaner-hell', qty: 1 }], emptiesReturn: [{ depositTypeId: 'dose-24', qty: 1 }] }),
      ctx(),
    );
    expect(empties.errors.map((e) => e.code)).toContain('empties');
    const total = calculateQuote(
      input({ items: [{ productId: 'eiswuerfel-2kg', qty: 1 }], emptiesReturn: [{ depositTypeId: 'kasten-bier-20', qty: 3 }] }),
      ctx(),
    );
    expect(total.totals.total).toBe(299 - 930); // Auszahlung
  });
});
