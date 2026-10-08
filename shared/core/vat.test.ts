import { describe, expect, it } from 'vitest';
import type { CheckoutInput, Customer, Quote, Totals } from '../types';
import { calculateQuote, computeTotals, MAX_LOOSE_QTY, type QuoteContext } from './pricing';
import { invoiceTotals } from './invoices';
import { createSeedDb } from './seed';
import { mulberry32, int, pick } from './seed/prng';
import { checkout, createTestCore, DEFAULT_NOW, firstFreeSlot } from './test/helpers';

const db = createSeedDb(DEFAULT_NOW);
const customer = (id: string): Customer => db.customers.find((c) => c.id === id)!;
const qctx = (partial: Partial<QuoteContext> = {}): QuoteContext => ({
  settings: db.settings,
  products: db.products,
  depositTypes: db.depositTypes,
  customer: null,
  now: DEFAULT_NOW,
  orders: [],
  skipStock: true,
  skipAvailability: true,
  ...partial,
});
const input = (partial: Partial<CheckoutInput>): CheckoutInput => ({
  items: [],
  fulfillment: 'pickup',
  emptiesReturn: [],
  carryService: false,
  paymentMethod: 'cash',
  ...partial,
});
const eching = { label: 'x', name: 'x', street: 'Bahnhofstraße 1', zip: '85386', city: 'Eching' };

/** Gemeinsame Invarianten jeder Summe */
function expectConsistent(t: Totals, b2b: boolean, label = ''): void {
  const vb = t.vatBreakdown!;
  const np = t.netParts!;
  expect(vb, label).toBeTruthy();
  expect(t.total, label).toBe(t.itemsGross - t.discount + t.deposit - t.depositRefund + t.deliveryFee + t.carryFee);
  expect(vb.reduce((s, l) => s + l.net + l.vat, 0), label).toBe(t.total);
  expect(vb.reduce((s, l) => s + l.vat, 0), label).toBe(t.vat);
  expect(np.items - np.discount + np.deposit - np.depositRefund + np.deliveryFee + np.carryFee, label).toBe(vb.reduce((s, l) => s + l.net, 0));
  expect(new Set(vb.map((l) => l.rate)).size, label).toBe(vb.length);
  for (const l of vb) {
    expect(Number.isInteger(l.net) && Number.isInteger(l.vat), label).toBe(true);
    if (b2b) {
      // Netto-Basis: MwSt. = round(Netto × Satz)
      expect(Math.abs(l.vat - (l.net * l.rate) / 100), label).toBeLessThanOrEqual(0.5 + 1e-9);
    } else {
      // Brutto-Basis: MwSt. aus dem Brutto je Satz herausgerechnet
      const gross = l.net + l.vat;
      expect(Math.abs(l.vat - (gross * l.rate) / (100 + l.rate)), label).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  }
  if (b2b) expect(np.items, label).toBe(t.itemsNet);
}

describe('MwSt.-Aufschlüsselung je Satz', () => {
  it('Privatkunde: Ware 19 % + 7 %, Pfand, Leergut, Gutschein, Liefer- und Tragegebühr', () => {
    const q = calculateQuote(
      input({
        fulfillment: 'delivery',
        address: eching,
        items: [
          { productId: 'augustiner-hell', qty: 3 },
          { productId: 'eiswuerfel-2kg', qty: 4 },
        ],
        emptiesReturn: [{ depositTypeId: 'kasten-bier-20', qty: 2 }],
        carryService: true,
        couponCode: 'GARCHING',
      }),
      qctx(),
    );
    expect(q.errors).toEqual([]);
    const t = q.totals;
    expectConsistent(t, false);
    expect(t.vatBreakdown!.map((l) => l.rate)).toEqual([19, 7]);
    // 19 %: Ware + anteilige Gebühren/Gutschein + Pfand − Leergut; 7 %: Eiswürfel-Anteil
    const g19 = 3 * 1799; // Angebot der Woche
    const g7 = 4 * 299;
    const share19 = g19 / (g19 + g7);
    const gross19 = g19 - Math.round(300 * share19) + Math.round(490 * share19) + Math.round(390 * share19) + 3 * 310 - 2 * 310;
    const l19 = t.vatBreakdown![0];
    expect(Math.abs(l19.net + l19.vat - gross19)).toBeLessThanOrEqual(2);
    expect(t.netParts!.deposit).toBe(Math.round((930 * 100) / 119));
    expect(t.netParts!.depositRefund).toBe(Math.round((620 * 100) / 119));
  });

  it('Geschäftskunde: Netto je Satz, MwSt. = round(Netto × Satz), Positionen netto exakt', () => {
    const gasthaus = customer('c-gasthaus');
    const q = calculateQuote(
      input({
        fulfillment: 'delivery',
        items: [
          { productId: 'augustiner-hell', qty: 12 },
          { productId: 'paulaner-spezi', qty: 5 },
          { productId: 'eiswuerfel-2kg', qty: 7 },
        ],
        emptiesReturn: [{ depositTypeId: 'kasten-bier-20', qty: 3 }],
        paymentMethod: 'invoice',
      }),
      qctx({ customer: gasthaus, openAmount: 0 }),
    );
    expect(q.errors).toEqual([]);
    const t = q.totals;
    expectConsistent(t, true);
    const net19 = q.lines.filter((l) => l.vatRate === 19).reduce((s, l) => s + l.lineNet, 0);
    const net7 = q.lines.filter((l) => l.vatRate === 7).reduce((s, l) => s + l.lineNet, 0);
    const dep19 = q.lines.filter((l) => l.vatRate === 19).reduce((s, l) => s + l.depositTotal, 0);
    const n19 = net19 + Math.round((dep19 * 100) / 119) - Math.round((930 * 100) / 119);
    expect(t.vatBreakdown).toEqual([
      { rate: 19, net: n19, vat: Math.round(n19 * 0.19) },
      { rate: 7, net: net7, vat: Math.round(net7 * 0.07) },
    ]);
    expect(t.total).toBe(n19 + Math.round(n19 * 0.19) + net7 + Math.round(net7 * 0.07));
  });

  it('Auszahlung (mehr Leergut als Ware): Netto und MwSt. negativ, Summen stimmen', () => {
    for (const c of [null, customer('c-gasthaus')]) {
      const q = calculateQuote(
        input({ items: [{ productId: 'eiswuerfel-2kg', qty: 1 }], emptiesReturn: [{ depositTypeId: 'kasten-bier-20', qty: 10 }] }),
        qctx({ customer: c }),
      );
      expect(q.totals.total).toBeLessThan(0);
      expectConsistent(q.totals, !!c);
      const l19 = q.totals.vatBreakdown!.find((l) => l.rate === 19)!;
      expect(l19.net).toBeLessThan(0);
      expect(l19.vat).toBeLessThan(0);
      expect(q.totals.vatBreakdown!.find((l) => l.rate === 7)!.vat).toBeGreaterThan(0);
    }
  });

  it('zufällige Warenkörbe (Privat-/Geschäftskunden, Liefergebiete, Gutscheine, Leergut): immer centgenau', () => {
    const rng = mulberry32(7);
    const products = db.products.filter((p) => p.active && !p.isRental);
    const customers: (Customer | null)[] = [null, customer('c-anna'), customer('c-gasthaus'), customer('c-nordbyte'), customer('c-bauer'), customer('c-sonnenschein')];
    const returnable = db.depositTypes.filter((d) => d.returnable);
    for (let i = 0; i < 400; i++) {
      const c = pick(rng, customers);
      const items = Array.from({ length: int(rng, 1, 6) }, () => ({ productId: pick(rng, products).id, qty: int(rng, 1, 14) }));
      const empties = Array.from({ length: int(rng, 0, 3) }, () => ({ depositTypeId: pick(rng, returnable).id, qty: int(rng, 1, 30) }));
      const delivery = rng() < 0.6;
      const q: Quote = calculateQuote(
        input({
          items,
          emptiesReturn: empties,
          fulfillment: delivery ? 'delivery' : 'pickup',
          ...(delivery && !c ? { address: rng() < 0.5 ? eching : { ...eching, zip: '80939', city: 'München' } } : {}),
          carryService: delivery && rng() < 0.3,
          couponCode: pick(rng, ['', 'GARCHING', 'FEST5', 'WILLKOMMEN10']),
        }),
        qctx({ customer: c }),
      );
      expectConsistent(q.totals, q.customerType === 'b2b', `Warenkorb ${i}`);
    }
  });

  it('computeTotals ohne Ware (nur Gebühren/Leergut) bleibt konsistent', () => {
    for (const customerType of ['b2c', 'b2b'] as const) {
      const t = computeTotals({ customerType, lines: [], discount: 0, depositRefund: 620, deliveryFee: 490, carryFee: 0 });
      expectConsistent(t, customerType === 'b2b');
      expect(t.vatBreakdown!.map((l) => l.rate)).toEqual([19]);
    }
  });
});

describe('Rechnung aus Bestellungen', () => {
  it('Nettobetrag = Summe der Positionen netto, MwSt. einmal je Satz – kein Rundungsausgleich', async () => {
    const t = createTestCore({ demoMode: false });
    const gasthaus = await t.as('u-gasthaus');
    const admin = await t.as('u-admin');
    const slot = await firstFreeSlot(gasthaus, 'delivery');
    const carts = [
      [{ productId: 'augustiner-hell', qty: 11 }, { productId: 'eiswuerfel-2kg', qty: 3 }],
      [{ productId: 'paulaner-spezi', qty: 7 }, { productId: 'adelholzener-classic-075', qty: 9 }],
      [{ productId: 'augustiner-edelstoff', qty: 4 }, { productId: 'eiswuerfel-2kg', qty: 5 }, { productId: 'club-mate', qty: 3 }],
    ];
    const orders = [];
    for (const items of carts) {
      const o = await gasthaus.placeOrder(checkout({ items, slotId: slot.id, paymentMethod: 'invoice', emptiesReturn: [{ depositTypeId: 'kasten-bier-20', qty: 2 }] }));
      expectConsistent(o.totals, true);
      for (const s of ['confirmed', 'picking', 'ready', 'out_for_delivery', 'delivered'] as const) await admin.adminUpdateOrderStatus(o.id, s);
      orders.push(await admin.getOrder(o.id));
    }
    const invoice = await admin.adminCreateInvoice('c-gasthaus');
    const mine = orders.filter((o) => invoice.orderIds.includes(o.id));
    expect(mine).toHaveLength(3);
    const all = invoice.orderIds.map((id) => t.db().orders.find((o) => o.id === id)!);
    const lineNet = all.reduce((s, o) => s + o.lines.reduce((x, l) => x + l.lineNet, 0), 0);
    // frei Haus, ohne Gutschein: Nettobetrag = Positionen netto, exakt
    expect(invoice.net).toBe(lineNet);
    expect(invoice.net + invoice.vat + invoice.deposit - invoice.depositRefund).toBe(invoice.gross);
    const vb = invoice.vatBreakdown!;
    expect(vb.map((l) => l.rate)).toEqual([19, 7]);
    for (const l of vb) expect(l.vat).toBe(Math.round((l.net * l.rate) / 100));
    expect(vb.reduce((s, l) => s + l.net, 0)).toBe(invoice.net + invoice.deposit - invoice.depositRefund);
    expect(vb.reduce((s, l) => s + l.vat, 0)).toBe(invoice.vat);
    // Netto je Satz = Summe der Bestell-Aufschlüsselungen
    for (const l of vb) {
      expect(l.net).toBe(all.reduce((s, o) => s + (o.totals.vatBreakdown!.find((x) => x.rate === l.rate)?.net ?? 0), 0));
    }
    expect(Math.abs(invoice.gross - all.reduce((s, o) => s + o.totals.total, 0))).toBeLessThanOrEqual(all.length);
    // invoiceTotals ist deterministisch und unabhängig von der Reihenfolge
    expect(invoiceTotals([...all].reverse())).toMatchObject({ net: invoice.net, vat: invoice.vat, gross: invoice.gross });
  });
});

describe('Leergut: lose Flaschen und Korrektur bei Zustellung', () => {
  it('lose Einzelflaschen: ohne Leergut-Konto, aber mit Höchstmenge', () => {
    const anna = customer('c-anna');
    const base = { items: [{ productId: 'augustiner-hell', qty: 1 }] };
    const ok = calculateQuote(
      input({ ...base, emptiesReturn: [{ depositTypeId: 'flasche-bier', qty: 24 }, { depositTypeId: 'flasche-glas-mw', qty: 10 }, { depositTypeId: 'einweg-lose', qty: 4 }] }),
      qctx({ customer: anna, depositBalance: anna.depositBalance }),
    );
    expect(ok.errors).toEqual([]);
    expect(ok.totals.depositRefund).toBe(24 * 8 + 10 * 15 + 4 * 25);
    expectConsistent(ok.totals, false);
    const tooMany = calculateQuote(
      input({ ...base, emptiesReturn: [{ depositTypeId: 'flasche-pet-mw', qty: MAX_LOOSE_QTY + 1 }] }),
      qctx({ customer: anna, depositBalance: anna.depositBalance }),
    );
    expect(tooMany.errors.map((e) => e.code)).toContain('empties');
    // Kästen weiterhin nur im Rahmen des Leergut-Kontos
    const crates = calculateQuote(input({ ...base, emptiesReturn: [{ depositTypeId: 'kasten-pet-12', qty: 5 }] }), qctx({ customer: anna, depositBalance: anna.depositBalance }));
    expect(crates.errors.map((e) => e.code)).toContain('empties');
    // Sixpack-Träger ist kein Leergut-Kasten → Hinweis auf lose Flaschen
    const sixpack = calculateQuote(input({ ...base, emptiesReturn: [{ depositTypeId: 'flaschen-bier-6', qty: 1 }] }), qctx());
    expect(sixpack.errors.find((e) => e.code === 'empties')?.message).toContain('lose');
  });

  it('Zustellung mit anderem Leergut: Summen und Aufschlüsselung neu, lose Flaschen ohne Konto', async () => {
    const t = createTestCore({ demoMode: false });
    const anna = await t.as('u-anna');
    const admin = await t.as('u-admin');
    const before = await anna.getMyCustomer();
    const slot = await firstFreeSlot(anna, 'delivery');
    const o = await anna.placeOrder(
      checkout({ items: [{ productId: 'augustiner-hell', qty: 2 }, { productId: 'eiswuerfel-2kg', qty: 2 }], slotId: slot.id, emptiesReturn: [{ depositTypeId: 'kasten-bier-20', qty: 2 }] }),
    );
    expectConsistent(o.totals, false);
    for (const s of ['confirmed', 'picking', 'ready', 'out_for_delivery'] as const) await admin.adminUpdateOrderStatus(o.id, s);
    const done = await admin.completeDelivery(o.id, {
      emptiesCollected: [
        { depositTypeId: 'kasten-bier-20', qty: 1 },
        { depositTypeId: 'flasche-bier', qty: 12 },
      ],
    });
    expect(done.totals.depositRefund).toBe(310 + 12 * 8);
    expect(done.totals.total).toBe(o.totals.total + 2 * 310 - (310 + 96));
    expectConsistent(done.totals, false);
    const after = await anna.getMyCustomer();
    expect(after.depositBalance['flasche-bier']).toBeUndefined();
    expect(after.depositBalance['kasten-bier-20']).toBe((before.depositBalance['kasten-bier-20'] ?? 0) + 2 - 1);
  });
});
