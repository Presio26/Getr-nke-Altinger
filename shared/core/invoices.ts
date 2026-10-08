/**
 * Rechnungen (B2B): Status „überfällig“ beim Lesen, offene Posten, Summenbildung.
 */
import type { Invoice, InvoiceStatus, Order } from '../types';
import { todayString } from '../time';
import type { Db } from './db';
import { DEPOSIT_REFUND_VAT_RATE } from './pricing';

/** Status zum Stichtag: bezahlt bleibt bezahlt, sonst überfällig, wenn Fälligkeit < heute */
export function invoiceStatus(invoice: Invoice, now: Date): InvoiceStatus {
  if (invoice.status === 'paid') return 'paid';
  return invoice.dueDate < todayString(now) ? 'overdue' : 'open';
}

/** Kopie mit berechnetem Status */
export function withInvoiceStatus(invoice: Invoice, now: Date): Invoice {
  return { ...invoice, status: invoiceStatus(invoice, now) };
}

/**
 * Summen einer Rechnung aus den Bestellungen: netto + MwSt. + Pfand − Leergut = brutto.
 * Pfand und Leergut sind umsatzsteuerpflichtig (Satz des Artikels bzw. 19 %): ihre MwSt. steckt in `vat`,
 * `deposit`/`depositRefund` sind daher Nettobeträge; `net` ist der Nettobetrag von Ware und Gebühren.
 */
export function invoiceTotals(orders: readonly Order[]): Pick<Invoice, 'net' | 'vat' | 'deposit' | 'depositRefund' | 'gross'> {
  let vat = 0;
  let depositNet = 0;
  let refundNet = 0;
  let gross = 0;
  for (const o of orders) {
    vat += o.totals.vat;
    gross += o.totals.total;
    for (const l of o.lines) if (l.depositTotal) depositNet += (l.depositTotal * 100) / (100 + l.vatRate);
    refundNet += (o.totals.depositRefund * 100) / (100 + DEPOSIT_REFUND_VAT_RATE);
  }
  const deposit = Math.round(depositNet);
  const depositRefund = Math.round(refundNet);
  return { net: gross - vat - deposit + depositRefund, vat, deposit, depositRefund, gross };
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
