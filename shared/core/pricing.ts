/**
 * Preise, Pfand, Gebühren und MwSt. – reine Funktionen, einzige Wahrheit für alle Beträge.
 *
 *  - B2C: Bruttopreise; ein gültiges Angebot (validUntil ≥ heute) gilt.
 *  - B2B (erst nach Freischaltung, b2b.status 'active'): Netto = round(Brutto / (1 + MwSt.)); es gewinnt
 *         der günstigste aus Gruppenrabatt, Staffelpreis (passend zur Menge) und Angebotspreis (netto).
 *         Noch nicht freigeschaltete oder gesperrte Geschäftskonten zahlen Privatkundenpreise.
 *  - Pfand je Gebinde aus DepositType, Leergut-Rückgabe als Gutschrift (je Art höchstens
 *    Leergut-Konto + bestellte Gebinde, sofern das Konto bekannt ist).
 *  - Liefergebühr nach Liefergebiet (PLZ), Mindestbestellwert, Tragservice, Gutschein.
 *  - MwSt.-Aufschlüsselung je Satz (computeTotals): Warenwert − Rabatt + Gebühren (anteilig je Satz),
 *    Pfand mit dem Satz des Artikels, die Leergut-Gutschrift mindert das Entgelt (19 %).
 *    Privatkunden: Brutto je Satz, MwSt. herausgerechnet. Geschäftskunden: Netto je Satz,
 *    MwSt. = round(Netto × Satz), Brutto = Netto + MwSt. – Σ Netto + Σ MwSt. = Endbetrag, immer.
 */
import type {
  Address,
  CheckoutInput,
  Totals,
  TotalsNetParts,
  VatBreakdownLine,
  Coupon,
  Customer,
  CustomerType,
  DayString,
  DeliveryZone,
  DepositType,
  Order,
  OrderLine,
  PaymentMethod,
  Product,
  ProductOffer,
  Quote,
  QuoteMessage,
  StoreSettings,
  TierPrice,
} from '../types';
import { addDays, isDayString, todayString } from '../time';
import { basePrice, formatDate, formatEuro, PAYMENT_METHOD_LABEL } from '../format';
import { DEPOSIT_TYPES } from './seed/catalog';
import { zoneForZip } from './geo';

/** Zahlarten für Privatkunden (und Geschäftskunden ohne Rechnungskauf) */
export const B2C_PAYMENT_METHODS: PaymentMethod[] = ['cash', 'ec', 'paypal', 'card'];
/** zusätzlich für freigeschaltete Geschäftskunden mit Rechnungskauf */
export const B2B_EXTRA_PAYMENT_METHODS: PaymentMethod[] = ['invoice', 'sepa'];
/** Steuersatz der Leergut-Gutschrift (Entgeltminderung; Getränke-Leergut i. d. R. 19 %) */
export const DEPOSIT_REFUND_VAT_RATE = 19;
/** Höchstmenge je Position bzw. je Leergut-Art */
const MAX_QTY = 999;
/** Höchstmenge loser Einzelflaschen je Art und Bestellung (kein Leergut-Konto) */
export const MAX_LOOSE_QTY = 500;

/** In einem Bruttobetrag enthaltene MwSt. (exakt, ungerundet) */
export const vatPart = (gross: number, rate: number) => (gross * rate) / (100 + rate);

const GROUP_SHORT: Record<string, string> = {
  standard: 'Kunden',
  gastro: 'Gastro',
  gastro_plus: 'Gastro-Plus',
  verein: 'Vereins',
};

/** Preis eines Artikels für einen Kunden und eine Menge – kompatibel zu OrderLine. */
export interface ProductPrice extends OrderLine {
  customerType: CustomerType;
  /** true → Nettopreise anzeigen (Geschäftskunde) */
  showNet: boolean;
  /** regulärer Netto-Stückpreis vor Angebot/Rabatt */
  regularUnitNet: number;
  /** Woher der Preis stammt */
  priceSource: 'list' | 'offer' | 'discount' | 'tier';
  /** true, wenn günstiger als der reguläre Preis */
  discounted: boolean;
  /** Ersparnis je Gebinde brutto (Cent) */
  savingsGross: number;
  /** gültiges Angebot (falls vorhanden) */
  offer?: ProductOffer;
  /** Grundpreis brutto, z. B. "1,95 €/l" (leer bei Leihartikeln) */
  basePrice: string;
  /** nächste erreichbare Staffel (B2B), z. B. { minQty: 25, priceNet: 1489 } */
  nextTier?: TierPrice;
}

const roundCents = (v: number) => Math.round(v);
const netOf = (gross: number, vat: number) => roundCents(gross / (1 + vat / 100));
const grossOf = (net: number, vat: number) => roundCents(net * (1 + vat / 100));

/** Gilt das Angebot am Stichtag? */
export function isOfferValid(offer: ProductOffer | undefined, today: DayString): offer is ProductOffer {
  return !!offer && offer.validUntil >= today && offer.priceGross > 0;
}

/**
 * Preis eines Artikels.
 * @param customer null = Gast/Privatkunde
 * @param qty Menge in Gebinden (für Staffelpreise)
 */
export function priceProduct(
  product: Product,
  customer: Customer | null | undefined,
  qty = 1,
  now: Date = new Date(),
  depositTypes: DepositType[] = DEPOSIT_TYPES,
): ProductPrice {
  const today = todayString(now);
  const vat = product.vatRate;
  const quantity = Math.max(0, Math.floor(qty));
  const offer = isOfferValid(product.offer, today) && product.offer.priceGross < product.priceGross ? product.offer : undefined;
  // Geschäftskundenpreise erst nach der Freischaltung durch den Markt
  const isB2B = customer?.type === 'b2b' && customer.b2b?.status === 'active';
  const listNet = netOf(product.priceGross, vat);

  let unitNet: number;
  let unitGross: number;
  let priceSource: ProductPrice['priceSource'] = 'list';
  let priceNote: string | undefined;
  let nextTier: TierPrice | undefined;

  if (!isB2B) {
    unitGross = offer ? offer.priceGross : product.priceGross;
    if (offer) {
      priceSource = 'offer';
      priceNote = offer.label || 'Angebot';
    }
    unitNet = netOf(unitGross, vat);
  } else {
    const b2b = customer?.b2b;
    const candidates: { net: number; source: ProductPrice['priceSource']; note?: string }[] = [
      { net: listNet, source: 'list' },
    ];
    const pct = b2b?.discountPercent ?? 0;
    if (pct > 0) {
      const label = GROUP_SHORT[b2b?.priceGroup ?? 'standard'] ?? 'Kunden';
      candidates.push({
        net: roundCents(listNet * (1 - pct / 100)),
        source: 'discount',
        note: `${label}-Rabatt ${String(pct).replace('.', ',')} %`,
      });
    }
    const tiersSorted = [...(product.tierPrices ?? [])].sort((a, b) => a.minQty - b.minQty);
    const tier = [...tiersSorted].reverse().find((t) => quantity >= t.minQty);
    if (tier) candidates.push({ net: tier.priceNet, source: 'tier', note: `Staffelpreis ab ${tier.minQty}` });
    nextTier = tiersSorted.find((t) => t.minQty > quantity);
    if (offer) candidates.push({ net: netOf(offer.priceGross, vat), source: 'offer', note: offer.label || 'Angebot' });
    // günstigster gewinnt; bei Gleichstand der zuerst genannte (Liste → Rabatt → Staffel → Angebot)
    const best = candidates.reduce((a, b) => (b.net < a.net ? b : a));
    unitNet = best.net;
    priceSource = best.source;
    priceNote = best.note;
    unitGross = grossOf(unitNet, vat);
  }

  const depositType = product.depositTypeId && !product.isRental ? depositTypes.find((d) => d.id === product.depositTypeId) : undefined;
  const depositUnit = depositType?.amount ?? 0;
  const lineGross = unitGross * quantity;
  const lineNet = isB2B ? unitNet * quantity : netOf(lineGross, vat);
  const regularUnitGross = product.priceGross;
  const price: ProductPrice = {
    productId: product.id,
    name: `${product.brand} ${product.name}`.trim(),
    packaging: product.packaging,
    qty: quantity,
    vatRate: vat,
    unitNet,
    unitGross,
    regularUnitGross,
    lineNet,
    lineGross,
    depositUnit,
    depositTotal: depositUnit * quantity,
    customerType: isB2B ? 'b2b' : 'b2c',
    showNet: isB2B,
    regularUnitNet: listNet,
    priceSource,
    discounted: unitGross < regularUnitGross,
    savingsGross: Math.max(0, regularUnitGross - unitGross),
    basePrice: product.isRental ? '' : basePrice(product, unitGross),
  };
  if (depositType) price.depositTypeId = depositType.id;
  if (product.isRental) price.isRental = true;
  if (priceNote) price.priceNote = priceNote;
  if (offer) price.offer = offer;
  if (nextTier) price.nextTier = nextTier;
  return price;
}

/** Bestellposition aus einem Preis (ohne die Zusatzfelder von ProductPrice) */
export function toOrderLine(p: ProductPrice): OrderLine {
  const line: OrderLine = {
    productId: p.productId,
    name: p.name,
    packaging: p.packaging,
    qty: p.qty,
    vatRate: p.vatRate,
    unitNet: p.unitNet,
    unitGross: p.unitGross,
    regularUnitGross: p.regularUnitGross,
    lineNet: p.lineNet,
    lineGross: p.lineGross,
    depositUnit: p.depositUnit,
    depositTotal: p.depositTotal,
  };
  if (p.depositTypeId) line.depositTypeId = p.depositTypeId;
  if (p.isRental) line.isRental = true;
  if (p.priceNote) line.priceNote = p.priceNote;
  return line;
}

// ───────────────────────────── Summen & MwSt.-Aufschlüsselung ─────────────────────────────

/** kaufmännisch runden, symmetrisch um 0 (−0,5 → −1) */
export function roundHalfAway(v: number): number {
  const r = Math.round(Math.abs(v) + 1e-9) * Math.sign(v);
  return r === 0 ? 0 : r;
}

/**
 * Ganzzahligen Betrag proportional zu Gewichten aufteilen (größter Rest) – Summe exakt `amount`.
 * Ohne positive Gewichte geht alles an `fallbackIndex`.
 */
export function allocateCents(amount: number, weights: readonly number[], fallbackIndex = 0): number[] {
  const out = weights.map(() => 0);
  if (!weights.length || !amount) return out;
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (sum <= 0) {
    out[Math.min(Math.max(0, fallbackIndex), out.length - 1)] = amount;
    return out;
  }
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);
  const exact = weights.map((w) => (abs * Math.max(0, w)) / sum);
  const base = exact.map((x) => Math.floor(x));
  let rest = abs - base.reduce((s, x) => s + x, 0);
  const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0 && k < order.length; k++, rest--) base[order[k].i] += 1;
  return base.map((x) => (x * sign === 0 ? 0 : x * sign));
}

export interface TotalsInput {
  /** 'b2b' → Netto-Basis (Geschäftskunden), sonst Brutto-Basis */
  customerType: CustomerType;
  lines: readonly Pick<OrderLine, 'vatRate' | 'lineNet' | 'lineGross' | 'depositTotal'>[];
  /** Gutschein-Rabatt brutto (positiv) */
  discount: number;
  /** Leergut-Gutschrift brutto (positiv) */
  depositRefund: number;
  deliveryFee: number;
  carryFee: number;
}

/**
 * Summen einer Bestellung inkl. MwSt.-Aufschlüsselung je Satz – einzige Stelle für die Steuerberechnung
 * (Kasse, Bestellung, nachträgliche Leergut-Korrektur, Rechnung).
 *
 *  - Rabatt und Gebühren werden anteilig nach Warenwert brutto auf die Sätze verteilt (Nebenleistung),
 *    Pfand trägt den Satz des Artikels, die Leergut-Gutschrift mindert das Entgelt zu 19 %.
 *  - Privatkunden (Brutto-Basis): Brutto je Satz, MwSt. = round(Brutto × Satz / (100 + Satz)).
 *  - Geschäftskunden (Netto-Basis): Netto je Satz (Positionen exakt netto, übrige Bestandteile einmal je Satz
 *    entsteuert), MwSt. = round(Netto × Satz), Brutto = Netto + MwSt. Der Warenwert brutto (itemsGross) ergibt
 *    sich daraus, sodass total = itemsGross − discount + deposit − depositRefund + deliveryFee + carryFee exakt gilt.
 *  - Immer: Σ net + Σ vat = total, Σ vat = vat (auch bei negativem Endbetrag = Auszahlung).
 */
export function computeTotals(input: TotalsInput): Totals {
  const lines = input.lines;
  const discount = Math.max(0, Math.round(input.discount || 0));
  const depositRefund = Math.max(0, Math.round(input.depositRefund || 0));
  const deliveryFee = Math.max(0, Math.round(input.deliveryFee || 0));
  const carryFee = Math.max(0, Math.round(input.carryFee || 0));
  const itemsGrossLines = lines.reduce((s, l) => s + l.lineGross, 0);
  const itemsNet = lines.reduce((s, l) => s + l.lineNet, 0);
  const deposit = lines.reduce((s, l) => s + l.depositTotal, 0);

  // Sätze: die der Positionen (Gewicht = Warenwert brutto), dazu 19 % für Leergut bzw. Gebühren ohne Ware
  const rateSet = new Set<number>(lines.map((l) => l.vatRate));
  if (depositRefund > 0 || rateSet.size === 0) rateSet.add(DEPOSIT_REFUND_VAT_RATE);
  const rates = [...rateSet].sort((a, b) => b - a);
  const weights = rates.map((r) => lines.reduce((s, l) => s + (l.vatRate === r ? l.lineGross : 0), 0));
  const fallback = Math.max(0, rates.indexOf(DEPOSIT_REFUND_VAT_RATE));
  const discountBy = allocateCents(discount, weights, fallback);
  const deliveryBy = allocateCents(deliveryFee, weights, fallback);
  const carryBy = allocateCents(carryFee, weights, fallback);

  const b2b = input.customerType === 'b2b';
  const breakdown: VatBreakdownLine[] = [];
  const parts: TotalsNetParts = { items: 0, discount: 0, deposit: 0, depositRefund: 0, deliveryFee: 0, carryFee: 0 };
  const netOfRate = (gross: number, rate: number) => roundHalfAway((gross * 100) / (100 + rate));

  rates.forEach((rate, i) => {
    const sameRate = lines.filter((l) => l.vatRate === rate);
    const g = {
      items: sameRate.reduce((s, l) => s + l.lineGross, 0),
      discount: discountBy[i],
      deposit: sameRate.reduce((s, l) => s + l.depositTotal, 0),
      depositRefund: rate === DEPOSIT_REFUND_VAT_RATE ? depositRefund : 0,
      deliveryFee: deliveryBy[i],
      carryFee: carryBy[i],
    };
    const n: TotalsNetParts = {
      items: b2b ? sameRate.reduce((s, l) => s + l.lineNet, 0) : netOfRate(g.items, rate),
      discount: netOfRate(g.discount, rate),
      deposit: netOfRate(g.deposit, rate),
      depositRefund: netOfRate(g.depositRefund, rate),
      deliveryFee: netOfRate(g.deliveryFee, rate),
      carryFee: netOfRate(g.carryFee, rate),
    };
    const signedNet = (p: TotalsNetParts) => p.items - p.discount + p.deposit - p.depositRefund + p.deliveryFee + p.carryFee;
    let net: number;
    let vat: number;
    if (b2b) {
      net = signedNet(n);
      vat = roundHalfAway((net * rate) / 100);
    } else {
      const gross = signedNet(g);
      vat = roundHalfAway((gross * rate) / (100 + rate));
      net = gross - vat;
      // Rundungsrest der einzeln entsteuerten Bestandteile beim größten Bestandteil des Satzes ausgleichen
      const diff = net - signedNet(n);
      if (diff) {
        const keys: (keyof TotalsNetParts)[] = ['items', 'deposit', 'deliveryFee', 'carryFee', 'discount', 'depositRefund'];
        const key = keys.reduce((a, b) => (Math.abs(g[b]) > Math.abs(g[a]) ? b : a));
        n[key] += key === 'discount' || key === 'depositRefund' ? -diff : diff;
      }
    }
    if (net !== 0 || vat !== 0) breakdown.push({ rate, net, vat });
    for (const k of Object.keys(parts) as (keyof TotalsNetParts)[]) parts[k] += n[k];
  });

  const vat = breakdown.reduce((s, l) => s + l.vat, 0);
  const total = b2b
    ? breakdown.reduce((s, l) => s + l.net + l.vat, 0)
    : itemsGrossLines - discount + deposit - depositRefund + deliveryFee + carryFee;
  const itemsGross = b2b ? total + discount - deposit + depositRefund - deliveryFee - carryFee : itemsGrossLines;
  return {
    itemsGross,
    itemsNet,
    discount,
    deposit,
    depositRefund,
    deliveryFee,
    carryFee,
    vat,
    total,
    vatBreakdown: breakdown,
    netParts: parts,
  };
}

/** Summen einer gespeicherten Bestellung neu berechnen (z. B. nach geänderter Leergut-Gutschrift) */
export function recomputeOrderTotals(
  order: Pick<Order, 'customerType' | 'lines' | 'totals'>,
  patch: Partial<Pick<Totals, 'depositRefund' | 'discount' | 'deliveryFee' | 'carryFee'>> = {},
): Totals {
  const t = order.totals;
  return computeTotals({
    customerType: order.customerType,
    lines: order.lines,
    discount: patch.discount ?? t.discount,
    depositRefund: patch.depositRefund ?? t.depositRefund,
    deliveryFee: patch.deliveryFee ?? t.deliveryFee,
    carryFee: patch.carryFee ?? t.carryFee,
  });
}

// ───────────────────────────── Gutscheine ─────────────────────────────

export function findCoupon(settings: Pick<StoreSettings, 'coupons'>, code: string | undefined | null): Coupon | undefined {
  if (!code) return undefined;
  const c = code.trim().toUpperCase();
  if (!c) return undefined;
  return settings.coupons.find((k) => k.code.toUpperCase() === c);
}

/**
 * Prüft einen Gutschein. Ergebnis: ok, oder blocking-Fehler (unbekannt/abgelaufen/nicht berechtigt)
 * bzw. Hinweis (Mindestwarenwert noch nicht erreicht).
 */
export function checkCoupon(
  coupon: Coupon | undefined,
  code: string,
  customerType: CustomerType,
  itemsGross: number,
  today: DayString,
): { ok: true } | { ok: false; blocking: boolean; message: string } {
  const shown = code.trim().toUpperCase();
  if (!coupon || !coupon.active) return { ok: false, blocking: true, message: `Der Gutscheincode „${shown}“ ist ungültig.` };
  if (coupon.validUntil && coupon.validUntil < today) {
    return { ok: false, blocking: true, message: `Der Gutschein „${coupon.code}“ ist leider abgelaufen.` };
  }
  if (coupon.b2cOnly && customerType === 'b2b') {
    return { ok: false, blocking: true, message: `Der Gutschein „${coupon.code}“ gilt nur für Privatkunden.` };
  }
  if (coupon.minOrder && itemsGross < coupon.minOrder) {
    return {
      ok: false,
      blocking: false,
      message: `Der Gutschein „${coupon.code}“ gilt ab ${formatEuro(coupon.minOrder)} Warenwert – es fehlen noch ${formatEuro(coupon.minOrder - itemsGross)}.`,
    };
  }
  return { ok: true };
}

export function couponDiscount(coupon: Coupon, itemsGross: number): number {
  if (coupon.type === 'percent') return Math.min(itemsGross, roundCents((itemsGross * coupon.value) / 100));
  return Math.min(itemsGross, Math.max(0, coupon.value));
}

// ───────────────────────────── Leihartikel ─────────────────────────────

/** Reservierte Stückzahl eines Leihartikels um ein Datum (±1 Tag), stornierte ausgenommen */
export function rentalReserved(orders: readonly Order[], productId: string, date: DayString, excludeOrderId?: string): number {
  const from = addDays(date, -1);
  const to = addDays(date, 1);
  let n = 0;
  for (const o of orders) {
    if (o.status === 'cancelled' || o.id === excludeOrderId || !o.eventDate) continue;
    if (o.eventDate < from || o.eventDate > to) continue;
    for (const l of o.lines) if (l.productId === productId && l.isRental) n += l.qty;
  }
  return n;
}

// ───────────────────────────── Angebot / Quote ─────────────────────────────

export interface QuoteContext {
  settings: StoreSettings;
  products: readonly Product[];
  depositTypes: readonly DepositType[];
  /** null = Gast (Privatkundenpreise) */
  customer: Customer | null;
  now: Date;
  /** bereits aufgelöste Lieferadresse; sonst aus input.address/addressId bzw. Standardadresse */
  address?: Pick<Address, 'zip'> | null;
  /** bestehende Bestellungen – für die Verfügbarkeit von Leihartikeln */
  orders?: readonly Order[];
  /** offene Posten des Geschäftskunden in Cent (für das Kreditlimit) */
  openAmount?: number;
  /**
   * Leergut-Konto des Kunden (Gebinde je Pfandart). Wenn gesetzt, darf je Art höchstens
   * Kontostand + in dieser Bestellung gelieferte Gebinde als Rückgabe angemeldet werden.
   */
  depositBalance?: Readonly<Record<string, number>>;
  /** Lagerbestand nicht prüfen (Demo-Daten) */
  skipStock?: boolean;
  /** Leihartikel-Verfügbarkeit nicht prüfen (Demo-Daten) */
  skipAvailability?: boolean;
}

function resolveZip(input: CheckoutInput, qc: QuoteContext): { zip?: string; error?: QuoteMessage } {
  if (qc.address) return { zip: qc.address.zip };
  if (input.address?.zip) return { zip: String(input.address.zip).trim() };
  const customer = qc.customer;
  if (input.addressId) {
    const a = customer?.addresses.find((x) => x.id === input.addressId);
    if (!a) return { error: { code: 'address', message: 'Die gewählte Lieferadresse wurde nicht gefunden.' } };
    return { zip: a.zip };
  }
  const def = customer?.addresses.find((x) => x.id === customer.defaultAddressId) ?? customer?.addresses[0];
  if (def) return { zip: def.zip };
  return { error: { code: 'address', message: 'Bitte geben Sie eine Lieferadresse an.' } };
}

/**
 * Berechnet Positionen, Summen, Gebühren, Zahlarten sowie Fehler und Hinweise.
 * Prüft KEINE Zeitfenster (das übernimmt placeOrder bzw. der quote-Handler).
 */
export function calculateQuote(input: CheckoutInput, qc: QuoteContext): Quote {
  const { settings, customer, now } = qc;
  const today = todayString(now);
  const errors: QuoteMessage[] = [];
  const warnings: QuoteMessage[] = [];
  const customerType: CustomerType = customer?.type ?? 'b2c';
  const b2b = customer?.type === 'b2b' ? customer.b2b : undefined;
  const depositTypes = qc.depositTypes.length ? [...qc.depositTypes] : DEPOSIT_TYPES;

  if (b2b?.status === 'blocked') {
    errors.push({ code: 'account_blocked', message: 'Ihr Geschäftskundenkonto ist derzeit gesperrt. Bitte wenden Sie sich an den Markt.' });
  }

  // ── Positionen ──
  const qtyById = new Map<string, number>();
  let invalidQty = false;
  for (const item of Array.isArray(input.items) ? input.items : []) {
    if (!item || typeof item.productId !== 'string') continue;
    if (!Number.isInteger(item.qty) || item.qty < 0 || item.qty > MAX_QTY) {
      invalidQty = true;
      continue;
    }
    if (item.qty === 0) continue;
    qtyById.set(item.productId, (qtyById.get(item.productId) ?? 0) + item.qty);
  }
  if (invalidQty) errors.push({ code: 'qty', message: 'Bitte geben Sie gültige Mengen (1–999) an.' });
  if (qtyById.size === 0) errors.push({ code: 'empty', message: 'Ihr Warenkorb ist leer.' });

  const lines: OrderLine[] = [];
  let hasRental = false;
  for (const [productId, qty] of qtyById) {
    const product = qc.products.find((p) => p.id === productId);
    if (!product || !product.active) {
      errors.push({
        code: 'product',
        message: product
          ? `„${product.brand} ${product.name}“ ist leider nicht mehr erhältlich.`
          : 'Ein Artikel in Ihrem Warenkorb ist nicht mehr erhältlich.',
      });
      continue;
    }
    const price = priceProduct(product, customer, qty, now, depositTypes);
    if (product.isRental) {
      hasRental = true;
    } else if (!qc.skipStock && qty > product.stock) {
      errors.push({
        code: 'stock',
        message:
          product.stock <= 0
            ? `„${price.name}“ ist leider ausverkauft.`
            : `Von „${price.name}“ sind nur noch ${product.stock} Stück verfügbar.`,
      });
    }
    lines.push(toOrderLine(price));
  }

  // ── Leihartikel ──
  if (hasRental) {
    const eventDate = input.eventDate;
    if (!isDayString(eventDate)) {
      errors.push({ code: 'rental_date', message: 'Bitte geben Sie für Leihartikel das Datum Ihrer Veranstaltung an.' });
    } else if (eventDate < today) {
      errors.push({ code: 'rental_date', message: 'Das Veranstaltungsdatum liegt in der Vergangenheit.' });
    } else if (!qc.skipAvailability) {
      for (const line of lines) {
        if (!line.isRental) continue;
        const product = qc.products.find((p) => p.id === line.productId);
        if (!product) continue;
        const available = product.stock - rentalReserved(qc.orders ?? [], line.productId, eventDate);
        if (line.qty > available) {
          errors.push({
            code: 'stock',
            message:
              available <= 0
                ? `„${line.name}“ ist am ${formatDate(eventDate, 'short')} bereits ausgebucht.`
                : `„${line.name}“ ist am ${formatDate(eventDate, 'short')} nur noch ${available}× verfügbar.`,
          });
        }
      }
    }
  }

  const itemsGross = lines.reduce((s, l) => s + l.lineGross, 0);

  // ── Leergut-Rückgabe (je Art zusammengefasst und begrenzt) ──
  let depositRefund = 0;
  const invalidEmpties = { code: 'empties', message: 'Bitte geben Sie beim Leergut gültige Mengen an.' };
  const emptiesByType = new Map<DepositType, number>();
  for (const e of Array.isArray(input.emptiesReturn) ? input.emptiesReturn : []) {
    if (!e || !e.qty) continue;
    const type = depositTypes.find((d) => d.id === e.depositTypeId);
    if (!Number.isInteger(e.qty) || e.qty < 0 || e.qty > MAX_QTY) {
      errors.push(invalidEmpties);
      continue;
    }
    if (!type) {
      errors.push({ code: 'empties', message: 'Unbekannte Leergut-Art.' });
      continue;
    }
    if (!type.returnable) {
      errors.push({
        code: 'empties',
        message: `„${type.shortName}“ kann nicht als Kasten zurückgegeben werden. Lose Flaschen erfassen Sie bitte einzeln (z. B. „Bierflasche lose“).`,
      });
      continue;
    }
    emptiesByType.set(type, (emptiesByType.get(type) ?? 0) + e.qty);
  }
  for (const [type, qty] of emptiesByType) {
    if (qty > MAX_QTY) {
      errors.push(invalidEmpties);
      continue;
    }
    if (type.loose) {
      // lose Einzelflaschen: kein Leergut-Konto, aber eine vernünftige Höchstmenge je Bestellung
      if (qty > MAX_LOOSE_QTY) {
        errors.push({
          code: 'empties',
          message: `Bitte melden Sie höchstens ${MAX_LOOSE_QTY} Stück „${type.shortName}“ an – größere Mengen nehmen wir gern im Markt an.`,
        });
        continue;
      }
      depositRefund += type.amount * qty;
      continue;
    }
    if (qc.depositBalance) {
      const delivered = lines.reduce((s, l) => s + (l.depositTypeId === type.id ? l.qty : 0), 0);
      const max = Math.max(0, qc.depositBalance[type.id] ?? 0) + delivered;
      if (qty > max) {
        const more = 'Weiteres Leergut nehmen wir bei der Lieferung bzw. im Markt gern an und schreiben es dann gut.';
        errors.push({
          code: 'empties',
          message:
            max > 0
              ? `Laut Ihrem Leergut-Konto können Sie höchstens ${max} × ${type.shortName} zur Rückgabe anmelden. ${more}`
              : `Laut Ihrem Leergut-Konto haben Sie kein Leergut „${type.shortName}“ von uns. ${more}`,
        });
        continue;
      }
    }
    depositRefund += type.amount * qty;
  }

  // ── Lieferung / Abholung ──
  let zone: DeliveryZone | undefined;
  let deliveryFee = 0;
  let carryFee = 0;
  let missingForMinOrder = 0;
  let missingForFreeDelivery = 0;
  if (input.fulfillment === 'delivery') {
    const { zip, error } = resolveZip(input, qc);
    if (error) errors.push(error);
    if (zip) {
      zone = zoneForZip(settings, zip);
      if (!zone) {
        errors.push({ code: 'zone', message: `Die PLZ ${zip} liegt leider außerhalb unseres Liefergebiets. Gerne können Sie im Markt abholen.` });
      }
    }
    if (zone) {
      missingForMinOrder = Math.max(0, zone.minOrder - itemsGross);
      if (missingForMinOrder > 0 && itemsGross > 0) {
        errors.push({
          code: 'min_order',
          message: `Der Mindestbestellwert für ${zone.name} beträgt ${formatEuro(zone.minOrder)} – es fehlen noch ${formatEuro(missingForMinOrder)}.`,
        });
      }
      const freeForCustomer = !!b2b?.freeDelivery && b2b.status === 'active';
      if (freeForCustomer || itemsGross >= zone.freeFrom) {
        deliveryFee = 0;
      } else {
        deliveryFee = zone.fee;
        missingForFreeDelivery = zone.fee > 0 ? Math.max(0, zone.freeFrom - itemsGross) : 0;
      }
    }
    if (input.carryService) carryFee = settings.carryServiceFee;
  } else if (input.fulfillment !== 'pickup') {
    errors.push({ code: 'fulfillment', message: 'Bitte wählen Sie Lieferung oder Abholung.' });
  }

  // ── Gutschein ──
  let coupon: Coupon | undefined;
  let discount = 0;
  if (typeof input.couponCode === 'string' && input.couponCode.trim()) {
    const found = findCoupon(settings, input.couponCode);
    const check = checkCoupon(found, input.couponCode, customerType, itemsGross, today);
    if (check.ok && found) {
      coupon = found;
      discount = couponDiscount(found, itemsGross);
    } else if (!check.ok) {
      (check.blocking ? errors : warnings).push({ code: 'coupon', message: check.message });
    }
  }

  // ── Summen & MwSt. (je Satz) ──
  // Pfand gehört zum Entgelt der Lieferung (Satz des Artikels), die Leergut-Rücknahme mindert es (UStAE 10.1 Abs. 8).
  const totals = computeTotals({ customerType, lines, discount, depositRefund, deliveryFee, carryFee });
  const total = totals.total;

  // ── Treuepunkte ──
  const loyaltyPointsEarned =
    customerType === 'b2c' ? Math.max(0, Math.floor((itemsGross - discount) / 100)) * Math.max(0, settings.loyaltyPointsPerEuro) : 0;

  // ── Zahlarten ──
  const paymentMethods: PaymentMethod[] = [...B2C_PAYMENT_METHODS];
  if (b2b) {
    if (b2b.status === 'active' && b2b.allowInvoice) {
      paymentMethods.push(...B2B_EXTRA_PAYMENT_METHODS);
      const open = qc.openAmount ?? 0;
      // eine Leergut-Auszahlung (negativer Betrag) schafft keinen zusätzlichen Kreditrahmen
      if (b2b.creditLimit > 0 && open + Math.max(0, total) > b2b.creditLimit) {
        // Rechnung und SEPA-Lastschrift belasten beide das Kreditlimit (siehe openAmountForCustomer)
        for (const m of B2B_EXTRA_PAYMENT_METHODS) paymentMethods.splice(paymentMethods.indexOf(m), 1);
        warnings.push({
          code: 'credit_limit',
          message: `Mit dieser Bestellung wird Ihr Kreditlimit von ${formatEuro(b2b.creditLimit)} überschritten (offen: ${formatEuro(open)}). Kauf auf Rechnung und SEPA-Lastschrift sind daher nicht möglich.`,
        });
      }
    } else if (b2b.status === 'pending') {
      warnings.push({
        code: 'business_pending',
        message: 'Ihr Geschäftskundenkonto wird noch geprüft. Bis zur Freischaltung sind nur Bar-, EC-, PayPal- und Kartenzahlung möglich.',
      });
    }
  }
  if (!input.paymentMethod) {
    errors.push({ code: 'payment', message: 'Bitte wählen Sie eine Zahlart.' });
  } else if (!paymentMethods.includes(input.paymentMethod)) {
    const known = Object.prototype.hasOwnProperty.call(PAYMENT_METHOD_LABEL, input.paymentMethod);
    const label = known ? PAYMENT_METHOD_LABEL[input.paymentMethod] : String(input.paymentMethod).slice(0, 40);
    errors.push({ code: 'payment', message: `Die Zahlart „${label}“ ist für diese Bestellung nicht verfügbar.` });
  }

  const quote: Quote = {
    customerType,
    lines,
    totals,
    missingForMinOrder,
    missingForFreeDelivery,
    loyaltyPointsEarned,
    errors,
    warnings,
    paymentMethods,
  };
  if (zone) quote.zone = zone;
  if (coupon) quote.coupon = coupon;
  return quote;
}
