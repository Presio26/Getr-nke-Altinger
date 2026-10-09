/**
 * Aufbau einer Rechnung für die Anzeige – rechnet NICHT neu, sondern verteilt die Summen des Cores
 * (invoice.net/deposit/depositRefund/vat/vatBreakdown/gross) auf die Lieferscheine.
 *
 * Grundsatz: Jede angezeigte Zwischensumme ergibt sich exakt aus den darüber stehenden Zeilen,
 * und die Summe aller Lieferscheine ergibt exakt die Werte des Cores. Pfand und Leergut sind –
 * wie im Core – Nettobeträge; ihre Umsatzsteuer steckt in der MwSt. je Satz.
 */
import type { DepositType, Invoice, Order, VatBreakdownLine } from '@shared/types';
import { DEPOSIT_REFUND_VAT_RATE } from '@shared/core/pricing';

/**
 * Ganzzahligen Betrag (Cent) proportional zu Gewichten verteilen (größter Rest),
 * sodass die Teile in Summe exakt `target` ergeben.
 */
export function allocate(target: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (!weights.length) return [];
  if (sum <= 0) {
    // keine Gewichte → alles auf die erste Zeile (kommt praktisch nicht vor)
    return weights.map((_, i) => (i === 0 ? target : 0));
  }
  const sign = target < 0 ? -1 : 1;
  const abs = Math.abs(target);
  const exact = weights.map((w) => (abs * Math.max(0, w)) / sum);
  const out = exact.map((x) => Math.floor(x));
  let rest = abs - out.reduce((s, x) => s + x, 0);
  const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0 && k < order.length; k++, rest--) out[order[k].i] += 1;
  return out.map((x) => x * sign);
}

export type ExtraKind = 'deposit' | 'refund' | 'fee' | 'discount';

export interface InvoiceExtraRow {
  key: string;
  kind: ExtraKind;
  /** z. B. "Bierkasten (20er)" */
  label: string;
  qty?: number;
  /** Pfand je Gebinde brutto (wie auf dem Lieferschein/Etikett) */
  unitGross?: number;
  /** MwSt.-Satz der Zeile */
  rate?: number;
  /** Nettobetrag mit Vorzeichen (Leergut/Rabatt negativ) */
  net: number;
}

export interface InvoiceNote {
  order: Order;
  /** Summe der Positionen netto (= Summe der angezeigten Zeilen) */
  goodsNet: number;
  extras: InvoiceExtraRow[];
  /** goodsNet + Summe extras */
  totalNet: number;
}

export interface InvoiceVatLine {
  rate: number;
  /** Bemessungsgrundlage – nur, wenn sie exakt zur Summe netto passt */
  base?: number;
  vat: number;
}

export interface InvoiceLayout {
  notes: InvoiceNote[];
  /** Summe aller Positionen netto */
  goodsNet: number;
  feesNet: number;
  /** Gutschein-Rabatt netto (positiv) */
  discountNet: number;
  /** Rest zwischen Positionen und invoice.net ohne Gebühren/Rabatt (nur bei abweichender Core-Rundung, sonst 0) */
  goodsAdjust: number;
  deposit: number;
  depositRefund: number;
  /** invoice.net + deposit − depositRefund */
  subtotalNet: number;
  vat: InvoiceVatLine[];
  gross: number;
}

interface Pending {
  note: number;
  row: Omit<InvoiceExtraRow, 'net'>;
  weight: number;
}

function deliveredOn(o: Order): string {
  return o.proof?.at ?? o.slot.date;
}

/** Lieferscheine chronologisch (Lieferdatum, dann Nummer) */
export function sortNotes(orders: readonly Order[]): Order[] {
  return [...orders].sort((a, b) => deliveredOn(a).localeCompare(deliveredOn(b)) || a.number.localeCompare(b.number));
}

/** MwSt. je Satz aus dem Core (Rechnung, sonst Summe der Bestellungen) – nur, wenn sie exakt invoice.vat ergibt */
function vatLines(invoice: Invoice, orders: readonly Order[], subtotalNet: number): InvoiceVatLine[] {
  const sources: (readonly VatBreakdownLine[] | undefined)[] = [invoice.vatBreakdown];
  if (orders.length && orders.every((o) => o.totals.vatBreakdown?.length)) {
    const merged = new Map<number, VatBreakdownLine>();
    for (const o of orders) {
      for (const l of o.totals.vatBreakdown ?? []) {
        const m = merged.get(l.rate) ?? { rate: l.rate, net: 0, vat: 0 };
        m.net += l.net;
        m.vat += l.vat;
        merged.set(l.rate, m);
      }
    }
    sources.push([...merged.values()]);
  }
  for (const src of sources) {
    if (!src?.length) continue;
    const lines = src.filter((l) => l.vat !== 0 || l.net !== 0).sort((a, b) => b.rate - a.rate);
    if (!lines.length || lines.reduce((s, l) => s + l.vat, 0) !== invoice.vat) continue;
    const basesFit = lines.reduce((s, l) => s + l.net, 0) === subtotalNet;
    return lines.map((l) => ({ rate: l.rate, vat: l.vat, ...(basesFit ? { base: l.net } : {}) }));
  }
  // ohne Aufschlüsselung: eine Zeile (Satz nur, wenn eindeutig)
  const rates = new Set<number>();
  for (const o of orders) for (const l of o.lines) rates.add(l.vatRate);
  if (invoice.depositRefund) rates.add(DEPOSIT_REFUND_VAT_RATE);
  const only = rates.size === 1 ? [...rates][0] : NaN;
  return [{ rate: only, vat: invoice.vat }];
}

export function buildInvoiceLayout(invoice: Invoice, orders: readonly Order[], depositTypes: readonly DepositType[]): InvoiceLayout {
  const sorted = sortNotes(orders);
  const typeOf = (id: string) => depositTypes.find((d) => d.id === id);
  const deposits: Pending[] = [];
  const refunds: Pending[] = [];
  const fees: Pending[] = [];
  const discounts: Pending[] = [];
  /** Gewichte je Lieferschein: Nettowerte des Cores (netParts), sonst exakt aus Brutto entsteuert */
  const noteWeight = { deposit: [] as number[], refund: [] as number[], fee: [] as number[], discount: [] as number[] };

  const notes: InvoiceNote[] = sorted.map((o, n) => {
    const np = o.totals.netParts;
    // Pfand je Art und Satz
    const dep = new Map<string, { qty: number; gross: number; unit: number; rate: number; label: string }>();
    for (const l of o.lines) {
      if (!l.depositTypeId || !l.depositTotal) continue;
      const key = `${l.depositTypeId}|${l.vatRate}`;
      const d = dep.get(key) ?? { qty: 0, gross: 0, unit: l.depositUnit, rate: l.vatRate, label: typeOf(l.depositTypeId)?.shortName ?? 'Pfand' };
      d.qty += l.qty;
      d.gross += l.depositTotal;
      dep.set(key, d);
    }
    let depExact = 0;
    for (const [key, d] of dep) {
      const weight = (d.gross * 100) / (100 + d.rate);
      depExact += weight;
      deposits.push({ note: n, row: { key: `d-${key}`, kind: 'deposit', label: d.label, qty: d.qty, unitGross: d.unit, rate: d.rate }, weight });
    }
    noteWeight.deposit.push(np ? np.deposit : depExact);

    // Leergut: tatsächlich angenommen (Zustellnachweis), sonst angemeldet – nur rückgabefähige Arten (wie der Core)
    if (o.totals.depositRefund > 0) {
      const source = o.proof?.emptiesCollected ?? o.emptiesReturn;
      const byType = new Map<string, number>();
      for (const e of source) if (e.qty > 0) byType.set(e.depositTypeId, (byType.get(e.depositTypeId) ?? 0) + e.qty);
      let covered = 0;
      for (const [id, qty] of byType) {
        const t = typeOf(id);
        if (!t || !t.returnable) continue;
        covered += t.amount * qty;
        refunds.push({
          note: n,
          row: { key: `r-${id}`, kind: 'refund', label: t.shortName, qty, unitGross: t.amount, rate: DEPOSIT_REFUND_VAT_RATE },
          weight: t.amount * qty,
        });
      }
      if (covered === 0) {
        refunds.push({ note: n, row: { key: 'r-sonst', kind: 'refund', label: 'Leergut', rate: DEPOSIT_REFUND_VAT_RATE }, weight: o.totals.depositRefund });
      }
    }
    noteWeight.refund.push(np ? np.depositRefund : (o.totals.depositRefund * 100) / (100 + DEPOSIT_REFUND_VAT_RATE));

    const feeGross = o.totals.deliveryFee + o.totals.carryFee;
    if (feeGross > 0) {
      const label = o.totals.deliveryFee && o.totals.carryFee ? 'Liefergebühr und Tragservice' : o.totals.carryFee ? 'Tragservice' : 'Liefergebühr';
      fees.push({ note: n, row: { key: 'fee', kind: 'fee', label }, weight: 1 });
    }
    noteWeight.fee.push(np ? np.deliveryFee + np.carryFee : (feeGross * 100) / 119);
    if (o.totals.discount > 0) {
      discounts.push({ note: n, row: { key: 'disc', kind: 'discount', label: o.couponCode ? `Gutschein-Rabatt (${o.couponCode})` : 'Gutschein-Rabatt' }, weight: 1 });
    }
    noteWeight.discount.push(np ? np.discount : (o.totals.discount * 100) / 119);

    const goodsNet = o.lines.reduce((s, l) => s + l.lineNet, 0);
    return { order: o, goodsNet, extras: [], totalNet: goodsNet };
  });

  const goodsNet = notes.reduce((s, x) => s + x.goodsNet, 0);
  // Gebühren/Rabatt netto: aus netParts, sonst als Differenz zwischen Core-Nettobetrag und Positionen
  const extrasNet = invoice.net - goodsNet;
  const sumOf = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  let feesNet = 0;
  let discountNet = 0;
  let goodsAdjust = 0;
  const npFees = Math.round(sumOf(noteWeight.fee));
  const npDiscount = Math.round(sumOf(noteWeight.discount));
  if (sorted.every((o) => o.totals.netParts) && npFees - npDiscount === extrasNet) {
    feesNet = npFees;
    discountNet = npDiscount;
  } else if (fees.length && discounts.length) {
    feesNet = npFees;
    discountNet = feesNet - extrasNet;
    if (discountNet < 0) {
      feesNet = extrasNet;
      discountNet = 0;
    }
  } else if (fees.length && extrasNet > 0) {
    feesNet = extrasNet;
  } else if (discounts.length && extrasNet < 0) {
    discountNet = -extrasNet;
  } else {
    goodsAdjust = extrasNet;
  }

  /** Summe zuerst auf Lieferscheine (Gewichte des Cores), dann innerhalb eines Lieferscheins auf die Zeilen verteilen */
  const place = (list: Pending[], target: number, weights: number[], sign: 1 | -1) => {
    if (!list.length || !target) return;
    const withRows = weights.map((w, n) => (list.some((p) => p.note === n) ? w : 0));
    const perNote = allocate(target, withRows);
    perNote.forEach((amount, n) => {
      const rows = list.filter((p) => p.note === n);
      if (!rows.length || !amount) return;
      allocate(amount, rows.map((p) => p.weight)).forEach((part, i) => {
        if (part) notes[n].extras.push({ ...rows[i].row, net: sign * part });
      });
    });
  };
  place(deposits, invoice.deposit, noteWeight.deposit, 1);
  place(refunds, invoice.depositRefund, noteWeight.refund, -1);
  place(fees, feesNet, noteWeight.fee, 1);
  place(discounts, discountNet, noteWeight.discount, -1);
  for (const note of notes) note.totalNet = note.goodsNet + note.extras.reduce((s, x) => s + x.net, 0);

  const subtotalNet = invoice.net + invoice.deposit - invoice.depositRefund;
  return {
    notes,
    goodsNet,
    feesNet,
    discountNet,
    goodsAdjust,
    deposit: invoice.deposit,
    depositRefund: invoice.depositRefund,
    subtotalNet,
    vat: vatLines(invoice, sorted, subtotalNet),
    gross: invoice.gross,
  };
}
