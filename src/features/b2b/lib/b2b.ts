/**
 * Reine Hilfsfunktionen des Geschäftskunden-Portals (keine React-Abhängigkeiten).
 * Kennzahlen werden aus den Daten berechnet, die die Api ohnehin liefert
 * (Bestellungen, Rechnungen, Kundenkonto) – identisch zur Logik im Core.
 */
import type { BadgeTone } from '@/components/ui';
import type { Customer, DepositType, EmptiesLine, ID, Invoice, InvoiceStatus, Order, OrderStatus, Product } from '@shared/types';
import { addDays, dayString, diffDays, todayString } from '@shared/time';
import { formatDate } from '@shared/format';

// ───────────────────────────── Bestellungen ─────────────────────────────

/** Status, in denen eine Bestellung noch „unterwegs“ ist (nächste Lieferungen) */
export const OPEN_ORDER_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'picking', 'ready', 'out_for_delivery'];

export function isOpenOrder(o: Order): boolean {
  return OPEN_ORDER_STATUSES.includes(o.status);
}

const slotKey = (o: Order) => `${o.slot.date} ${o.slot.start}`;

/** Offene Bestellungen, sortiert nach Liefer-/Abholtermin */
export function upcomingOrders(orders: readonly Order[]): Order[] {
  return orders.filter(isOpenOrder).sort((a, b) => slotKey(a).localeCompare(slotKey(b)));
}

/** Jüngste nicht stornierte Bestellung mit Positionen */
export function lastOrder(orders: readonly Order[]): Order | undefined {
  return [...orders]
    .filter((o) => o.status !== 'cancelled' && o.lines.length > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** Positionen einer Bestellung, die sich erneut bestellen lassen (aktiv, kein Leihartikel) */
export function reorderableLines(order: Order, productMap: Map<ID, Product>): { productId: ID; qty: number }[] {
  return order.lines
    .filter((l) => !l.isRental)
    .filter((l) => {
      const p = productMap.get(l.productId);
      return !!p && p.active && !p.isRental;
    })
    .map((l) => ({ productId: l.productId, qty: l.qty }));
}

export interface UsualItem {
  productId: ID;
  /** in wie vielen Bestellungen enthalten */
  orderCount: number;
  /** Gesamtmenge */
  totalQty: number;
  /** übliche Bestellmenge (häufigste Menge, bei Gleichstand die zuletzt bestellte) */
  typicalQty: number;
  /** zuletzt bestellt am (ISO) */
  lastOrderedAt: string;
}

/**
 * „Meine Artikel“: Artikel aus der Bestellhistorie nach Häufigkeit
 * (Anzahl Bestellungen, dann Menge). Leihartikel und nicht mehr erhältliche Artikel entfallen.
 */
export function usualItems(orders: readonly Order[], productMap: Map<ID, Product>, limit = Infinity): UsualItem[] {
  const stats = new Map<ID, { orderCount: number; totalQty: number; qtyCount: Map<number, number>; lastQty: number; lastAt: string }>();
  const sorted = [...orders].filter((o) => o.status !== 'cancelled').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const o of sorted) {
    const seen = new Set<ID>();
    for (const l of o.lines) {
      if (l.isRental || l.qty <= 0) continue;
      const s = stats.get(l.productId) ?? { orderCount: 0, totalQty: 0, qtyCount: new Map(), lastQty: 0, lastAt: '' };
      if (!seen.has(l.productId)) s.orderCount += 1;
      seen.add(l.productId);
      s.totalQty += l.qty;
      s.qtyCount.set(l.qty, (s.qtyCount.get(l.qty) ?? 0) + 1);
      s.lastQty = l.qty;
      s.lastAt = o.createdAt;
      stats.set(l.productId, s);
    }
  }
  const items: UsualItem[] = [];
  for (const [productId, s] of stats) {
    const p = productMap.get(productId);
    if (!p || !p.active || p.isRental) continue;
    let typicalQty = s.lastQty;
    let best = 0;
    for (const [qty, n] of s.qtyCount) {
      if (n > best || (n === best && qty === s.lastQty)) {
        best = n;
        typicalQty = qty;
      }
    }
    items.push({ productId, orderCount: s.orderCount, totalQty: s.totalQty, typicalQty: Math.max(1, typicalQty), lastOrderedAt: s.lastAt });
  }
  items.sort((a, b) => b.orderCount - a.orderCount || b.totalQty - a.totalQty || a.productId.localeCompare(b.productId));
  return items.slice(0, limit);
}

/** Bestellungen und Warenwert (netto) eines Kalendermonats (Berlin, nach Bestelldatum) */
export function monthStats(orders: readonly Order[], now: Date): { month: string; count: number; net: number; prevCount: number; prevNet: number } {
  const today = todayString(now);
  const month = today.slice(0, 7);
  const prevMonth = addDays(`${month}-01`, -1).slice(0, 7);
  let count = 0;
  let net = 0;
  let prevCount = 0;
  let prevNet = 0;
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    const m = dayString(new Date(o.createdAt)).slice(0, 7);
    if (m === month) {
      count += 1;
      net += o.totals.itemsNet;
    } else if (m === prevMonth) {
      prevCount += 1;
      prevNet += o.totals.itemsNet;
    }
  }
  return { month, count, net, prevCount, prevNet };
}

// ───────────────────────────── Rechnungen & Kreditlimit ─────────────────────────────

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, BadgeTone> = {
  open: 'warning',
  overdue: 'danger',
  paid: 'success',
};

export interface OpenItems {
  openCount: number;
  openAmount: number;
  overdueCount: number;
  overdueAmount: number;
  /** nächste Fälligkeit (offene, nicht überfällige Rechnung) */
  nextDue?: Invoice;
}

/** Offene Posten aus Rechnungen (offen + überfällig) */
export function openItems(invoices: readonly Invoice[]): OpenItems {
  const res: OpenItems = { openCount: 0, openAmount: 0, overdueCount: 0, overdueAmount: 0 };
  for (const inv of invoices) {
    if (inv.status === 'paid') continue;
    res.openCount += 1;
    res.openAmount += inv.gross;
    if (inv.status === 'overdue') {
      res.overdueCount += 1;
      res.overdueAmount += inv.gross;
    } else if (!res.nextDue || inv.dueDate < res.nextDue.dueDate) {
      res.nextDue = inv;
    }
  }
  return res;
}

/** Bestellung auf Rechnung/Lastschrift, die noch in keiner Rechnung steht (belastet das Kreditlimit) */
export function isUnbilledCredit(o: Order): boolean {
  return (o.paymentMethod === 'invoice' || o.paymentMethod === 'sepa') && !o.invoiceId && o.status !== 'cancelled' && o.paymentStatus !== 'paid';
}

/** Noch nicht abgerechnete, bereits gelieferte Rechnungs-Bestellungen (kommen in die nächste Sammelrechnung) */
export function unbilledDelivered(orders: readonly Order[]): Order[] {
  return orders.filter((o) => isUnbilledCredit(o) && (o.status === 'delivered' || o.status === 'picked_up'));
}

/**
 * Ausgeschöpftes Kreditlimit wie im Core (openAmountForCustomer):
 * unbezahlte Rechnungen + noch nicht abgerechnete Rechnungs-/SEPA-Bestellungen.
 */
export function creditUsage(invoices: readonly Invoice[], orders: readonly Order[]): { invoices: number; unbilled: number; total: number } {
  const inv = invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.gross, 0);
  const unbilled = orders.filter(isUnbilledCredit).reduce((s, o) => s + o.totals.total, 0);
  return { invoices: inv, unbilled, total: inv + unbilled };
}

/** "fällig in 9 Tagen" / "heute fällig" / "seit 3 Tagen überfällig" / "bezahlt am 05.10.2026" */
export function dueText(inv: Invoice, now: Date): string {
  if (inv.status === 'paid') return inv.paidAt ? `bezahlt am ${formatDate(inv.paidAt, 'short')}` : 'bezahlt';
  const days = diffDays(todayString(now), inv.dueDate);
  if (days === 0) return 'heute fällig';
  if (days === 1) return 'morgen fällig';
  if (days > 1) return `fällig in ${days} Tagen`;
  if (days === -1) return 'seit gestern überfällig';
  return `seit ${-days} Tagen überfällig`;
}

// ───────────────────────────── Leergut ─────────────────────────────

export interface DepositLine {
  type: DepositType;
  qty: number;
  value: number;
}

/** Wert des Leergut-Kontos (Gebinde beim Kunden × Pfand) */
export function depositAccount(customer: Pick<Customer, 'depositBalance'>, depositTypes: readonly DepositType[]): { value: number; units: number; lines: DepositLine[] } {
  const lines: DepositLine[] = [];
  for (const [id, qty] of Object.entries(customer.depositBalance ?? {})) {
    if (!qty) continue;
    const type = depositTypes.find((d) => d.id === id);
    if (!type) continue;
    lines.push({ type, qty, value: qty * type.amount });
  }
  lines.sort((a, b) => b.value - a.value);
  return { value: lines.reduce((s, l) => s + l.value, 0), units: lines.reduce((s, l) => s + l.qty, 0), lines };
}

/** Leergut-Zeilen mit Bezeichnung und Wert */
export function emptiesLines(lines: readonly EmptiesLine[], depositTypes: readonly DepositType[]): DepositLine[] {
  const out: DepositLine[] = [];
  for (const l of lines) {
    if (!l.qty) continue;
    const type = depositTypes.find((d) => d.id === l.depositTypeId);
    if (!type) continue;
    out.push({ type, qty: l.qty, value: l.qty * type.amount });
  }
  return out;
}

// ───────────────────────────── Schnellerfassung: Einfügen aus der Zwischenablage ─────────────────────────────

export interface PasteRow {
  /** Zeilennummer im eingefügten Text (1-basiert) */
  line: number;
  raw: string;
  code: string;
  qty: number;
  product?: Product;
  error?: string;
}

const normCode = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '').replace(/^ART\.?-?NR\.?:?/, '');

/** Artikel zu Art.-Nr., Art.-Nr. ohne Präfix („10010“), EAN oder interner ID suchen */
export function findByCode(code: string, products: readonly Product[]): Product | undefined {
  const c = normCode(code);
  if (!c) return undefined;
  return (
    products.find((p) => p.sku.toUpperCase() === c) ??
    products.find((p) => p.sku.toUpperCase().replace(/^[A-Z]+-/, '') === c) ??
    products.find((p) => p.ean === c) ??
    products.find((p) => p.id.toUpperCase() === c)
  );
}

/**
 * Text im Format „Art.-Nr.;Menge“ je Zeile auswerten. Trennzeichen: Semikolon, Tab, Komma oder Leerzeichen
 * (so funktioniert auch das Kopieren aus Excel). Kopfzeilen werden übersprungen.
 */
export function parsePasteList(text: string, products: readonly Product[]): PasteRow[] {
  const rows: PasteRow[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((rawLine, i) => {
    const raw = rawLine.trim();
    if (!raw) return;
    const parts = raw.split(/\s*[;\t,]\s*|\s+/).filter(Boolean);
    const code = parts[0] ?? '';
    const qtyRaw = parts.length > 1 ? parts[parts.length - 1] : '';
    const qty = /^\d{1,4}$/.test(qtyRaw) ? Number.parseInt(qtyRaw, 10) : NaN;
    // Kopfzeile („Art.-Nr.;Menge“) überspringen
    if (rows.length === 0 && Number.isNaN(qty) && /art|nr|menge|artikel|sku/i.test(raw)) return;
    const row: PasteRow = { line: i + 1, raw, code, qty: Number.isNaN(qty) ? 0 : qty };
    const product = findByCode(code, products);
    if (!product) row.error = 'Artikelnummer nicht gefunden';
    else if (!product.active) row.error = 'Artikel derzeit nicht erhältlich';
    else if (product.isRental) row.error = 'Leihartikel bitte über den Festservice bestellen';
    if (product) row.product = product;
    if (!row.error) {
      if (Number.isNaN(qty)) row.error = 'Menge fehlt';
      else if (qty < 1 || qty > 999) row.error = 'Menge muss zwischen 1 und 999 liegen';
    }
    rows.push(row);
  });
  return rows;
}

/** gültige Zeilen je Artikel zusammenfassen */
export function mergePasteRows(rows: readonly PasteRow[]): { productId: ID; qty: number }[] {
  const map = new Map<ID, number>();
  for (const r of rows) {
    if (r.error || !r.product) continue;
    map.set(r.product.id, Math.min(999, (map.get(r.product.id) ?? 0) + r.qty));
  }
  return [...map].map(([productId, qty]) => ({ productId, qty }));
}

// ───────────────────────────── Suche ─────────────────────────────

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');

/** einfache Artikelsuche über Name, Marke, Gebinde, Art.-Nr. und EAN (alle Begriffe müssen passen) */
export function searchProducts(products: readonly Product[], query: string, limit = 8): Product[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored: { p: Product; score: number }[] = [];
  for (const p of products) {
    if (!p.active || p.isRental) continue;
    const hay = fold(`${p.brand} ${p.name} ${p.packaging} ${p.sku} ${p.ean ?? ''} ${p.tags.join(' ')}`);
    if (!terms.every((t) => hay.includes(t))) continue;
    const name = fold(`${p.brand} ${p.name}`);
    let score = 0;
    if (fold(p.sku) === terms.join('')) score += 100;
    if (name.startsWith(terms[0])) score += 10;
    if (fold(p.name).startsWith(terms[0])) score += 6;
    if (p.tags.includes('bestseller')) score += 1;
    scored.push({ p, score });
  }
  scored.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name, 'de'));
  return scored.slice(0, limit).map((s) => s.p);
}
