/**
 * Rechnungen (B2B): Status „überfällig“ beim Lesen, offene Posten, Summenbildung.
 */
import type { Invoice, InvoiceStatus, Order, Totals, VatBreakdownLine } from '../types';
import { todayString } from '../time';
import type { Db } from './db';
import { recomputeOrderTotals, roundHalfAway } from './pricing';

/** Status zum Stichtag: bezahlt bleibt bezahlt, sonst überfällig, wenn Fälligkeit < heute */
export function invoiceStatus(invoice: Invoice, now: Date): InvoiceStatus {
  if (invoice.status === 'paid') return 'paid';
  return invoice.dueDate < todayString(now) ? 'overdue' : 'open';
}

/** Kopie mit berechnetem Status */
export function withInvoiceStatus(invoice: Invoice, now: Date): Invoice {
  return { ...invoice, status: invoiceStatus(invoice, now) };
}

/** Summen einer Bestellung mit MwSt.-Aufschlüsselung (ältere Datenstände ohne Aufschlüsselung werden nachgerechnet) */
export function totalsWithBreakdown(order: Pick<Order, 'customerType' | 'lines' | 'totals'>): Totals {
  const t = order.totals;
  if (t.vatBreakdown && t.netParts) return t;
  const r = recomputeOrderTotals(order);
  // gespeicherte Endbeträge bleiben maßgeblich
  return { ...r, ...t, vatBreakdown: r.vatBreakdown ?? [], netParts: r.netParts! };
}

/**
 * Summen einer Rechnung aus den Bestellungen: netto + MwSt. + Pfand − Leergut = brutto.
 * Pfand und Leergut sind umsatzsteuerpflichtig (Satz des Artikels bzw. 19 %): ihre MwSt. steckt in `vat`,
 * `deposit`/`depositRefund` sind daher Nettobeträge; `net` ist der Nettobetrag von Ware und Gebühren (abzgl. Rabatt).
 *
 * Netto je Satz = Summe der Netto-Aufschlüsselungen der Bestellungen (Positionen netto, kein Rückrechnen aus
 * Brutto); die MwSt. wird je Satz einmal auf die Rechnungssumme berechnet: round(Netto × Satz). Damit gilt
 * „19 % von Netto = ausgewiesene MwSt.“ centgenau, ohne Rundungsausgleich. Der Rechnungsbetrag kann deshalb um
 * Rundungscent von der Summe der einzelnen Bestellbeträge abweichen – maßgeblich ist die Rechnung.
 */
export function invoiceTotals(orders: readonly Order[]): Pick<Invoice, 'net' | 'vat' | 'deposit' | 'depositRefund' | 'gross' | 'vatBreakdown'> {
  let deposit = 0;
  let depositRefund = 0;
  const netByRate = new Map<number, number>();
  for (const o of orders) {
    const t = totalsWithBreakdown(o);
    deposit += t.netParts?.deposit ?? 0;
    depositRefund += t.netParts?.depositRefund ?? 0;
    for (const l of t.vatBreakdown ?? []) netByRate.set(l.rate, (netByRate.get(l.rate) ?? 0) + l.net);
  }
  const vatBreakdown: VatBreakdownLine[] = [...netByRate]
    .map(([rate, net]) => ({ rate, net, vat: roundHalfAway((net * rate) / 100) }))
    .filter((l) => l.net !== 0 || l.vat !== 0)
    .sort((a, b) => b.rate - a.rate);
  const netAll = vatBreakdown.reduce((s, l) => s + l.net, 0);
  const vat = vatBreakdown.reduce((s, l) => s + l.vat, 0);
  return { net: netAll - deposit + depositRefund, vat, deposit, depositRefund, gross: netAll + vat, vatBreakdown };
}

/** Bestellung belastet das Kreditlimit (Rechnung/SEPA, nicht storniert, noch nicht abgerechnet) */
function isUnbilledCredit(o: Order): boolean {
  return (o.paymentMethod === 'invoice' || o.paymentMethod === 'sepa') && !o.invoiceId && o.status !== 'cancelled' && o.paymentStatus !== 'paid';
}

/**
 * Offene Posten eines Kunden (Cent): unbezahlte Rechnungen + noch nicht abgerechnete
 * Rechnungs-/SEPA-Bestellungen. Bestellungen mit Leergut-Auszahlung (negativer Betrag) senken die
 * offenen Posten nicht – sonst ließe sich das Kreditlimit mit angemeldetem Leergut aushebeln.
 */
export function openAmountForCustomer(db: Db, customerId: string, now: Date): number {
  let sum = 0;
  for (const inv of db.invoices) {
    if (inv.customerId === customerId && invoiceStatus(inv, now) !== 'paid') sum += inv.gross;
  }
  for (const o of db.orders) {
    if (o.customerId === customerId && isUnbilledCredit(o)) sum += Math.max(0, o.totals.total);
  }
  return sum;
}

/** "RE-2026-00123" */
export function invoiceNumber(year: number | string, seq: number): string {
  return `RE-${year}-${String(seq).padStart(5, '0')}`;
}

/** Abrechenbare Bestellungen eines Kunden: geliefert/abgeholt, Rechnung/SEPA, ohne Rechnung */
export function billableOrders(db: Db, customerId: string): Order[] {
  return db.orders
    .filter(
      (o) =>
        o.customerId === customerId &&
        (o.status === 'delivered' || o.status === 'picked_up') &&
        (o.paymentMethod === 'invoice' || o.paymentMethod === 'sepa') &&
        !o.invoiceId,
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
