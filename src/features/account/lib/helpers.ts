/**
 * Hilfsfunktionen für Kundenkonto, Adressen, Abos und Leergut-Konto (rein, ohne React).
 */
import type {
  CheckoutItem,
  Customer,
  DayString,
  DeliveryZone,
  DepositType,
  EmptiesLine,
  Order,
  PaymentMethod,
  Product,
  SlotTemplate,
  StoreSettings,
} from '@shared/types';
import { formatEuro } from '@shared/format';
import { addDays, weekdayOf } from '@shared/time';
import { zoneForZip } from '@shared/core/geo';
import { priceProduct } from '@shared/core/pricing';

// ───────────────────────────── Adressen ─────────────────────────────

/** Stockwerk lesbar: 0 → "Erdgeschoss", 2 → "2. Stock" */
export function floorLabel(floor: number | undefined | null): string | null {
  if (floor === undefined || floor === null) return null;
  if (floor === 0) return 'Erdgeschoss';
  if (floor < 0) return floor === -1 ? 'Untergeschoss' : `${-floor}. Untergeschoss`;
  return `${floor}. Stock`;
}

export const FLOOR_OPTIONS = [
  { value: '', label: 'keine Angabe' },
  { value: '-1', label: 'Untergeschoss' },
  { value: '0', label: 'Erdgeschoss' },
  ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}. Stock` })),
];

export interface ZoneHintInfo {
  zone?: DeliveryZone;
  /** kurze Zeile, z. B. "Lieferung kostenlos · Mindestbestellwert 15,00 €" */
  text: string;
  inArea: boolean;
}

/** Liefergebiet zur PLZ mit Konditionen (Gebühr, frei ab, Mindestbestellwert) */
export function zoneHint(settings: Pick<StoreSettings, 'zones'>, zip: string | undefined | null, freeDelivery = false): ZoneHintInfo {
  const zone = zoneForZip(settings, zip);
  if (!zone) return { text: 'Außerhalb des Liefergebiets – Abholung im Markt ist jederzeit möglich.', inArea: false };
  const fee =
    freeDelivery || zone.fee === 0
      ? 'Lieferung kostenlos'
      : `Liefergebühr ${formatEuro(zone.fee)}, ab ${formatEuro(zone.freeFrom)} frei Haus`;
  return { zone, inArea: true, text: `${fee} · Mindestbestellwert ${formatEuro(zone.minOrder)}` };
}

// ───────────────────────────── Zahlarten ─────────────────────────────

const B2C_METHODS: PaymentMethod[] = ['cash', 'ec', 'paypal', 'card'];

/** Für Abos/Daueraufträge erlaubte Zahlarten (wie im Core) */
export function allowedPaymentMethods(customer: Customer | null | undefined): PaymentMethod[] {
  const list = [...B2C_METHODS];
  if (customer?.type === 'b2b' && customer.b2b?.status === 'active' && customer.b2b.allowInvoice) list.push('invoice', 'sepa');
  return list;
}

export function defaultPaymentMethod(customer: Customer | null | undefined, variant: 'b2c' | 'b2b'): PaymentMethod {
  const allowed = allowedPaymentMethods(customer);
  if (variant === 'b2b' && allowed.includes('invoice')) return 'invoice';
  return 'cash';
}

export const PAYMENT_HINT: Record<PaymentMethod, string> = {
  cash: 'bar beim Fahrer',
  ec: 'mit Karte beim Fahrer',
  paypal: 'nach Lieferung (Demo)',
  card: 'nach Lieferung (Demo)',
  invoice: 'gemäß Zahlungsziel',
  sepa: 'Einzug nach Lieferung',
};

// ───────────────────────────── Zeitfenster / Abos ─────────────────────────────

/** Liefertage (1 = Mo … 6 = Sa), an denen es Lieferfenster gibt */
export function deliveryWeekdays(settings: Pick<StoreSettings, 'deliverySlots'>): number[] {
  return [...new Set(settings.deliverySlots.map((s) => s.weekday))].filter((d) => d >= 1 && d <= 6).sort((a, b) => a - b);
}

/** Lieferfenster eines Wochentags, nach Beginn sortiert (ohne Duplikate) */
export function windowsFor(settings: Pick<StoreSettings, 'deliverySlots'>, weekday: number): SlotTemplate[] {
  const seen = new Set<string>();
  return settings.deliverySlots
    .filter((s) => s.weekday === weekday)
    .sort((a, b) => a.start.localeCompare(b.start))
    .filter((s) => (seen.has(s.start) ? false : (seen.add(s.start), true)));
}

/** Ende des Lieferfensters zu Wochentag + Beginn (Fallback: +2 Std.) */
export function windowEnd(settings: Pick<StoreSettings, 'deliverySlots'>, weekday: number, start: string): string {
  const t = settings.deliverySlots.find((s) => s.weekday === weekday && s.start === start);
  if (t) return t.end;
  const [h, m] = start.split(':').map(Number);
  return `${String(Math.min(23, h + 2)).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
}

/** Nächster Termin für einen Wochentag ab morgen (wie computeNextDate im Core) */
export function nextWeekdayDate(weekday: number, today: DayString): DayString {
  let d = addDays(today, 1);
  for (let i = 0; i < 7 && weekdayOf(d) !== weekday; i++) d = addDays(d, 1);
  return d;
}

export interface ItemsEstimate {
  /** Warenwert (B2B netto, sonst brutto) */
  goods: number;
  deposit: number;
  showNet: boolean;
  count: number;
  /** Mehrweg-Gebinde, die automatisch als Leergut mitgegeben werden könnten */
  returnable: number;
}

/** Überschlägiger Wert einer Lieferung (Preise aus priceProduct – gleiche Logik wie der Core) */
export function estimateItems(
  items: CheckoutItem[],
  products: Map<string, Product>,
  customer: Customer | null | undefined,
  depositTypes: DepositType[],
): ItemsEstimate {
  let goods = 0;
  let deposit = 0;
  let count = 0;
  let returnable = 0;
  let showNet = customer?.type === 'b2b';
  const now = new Date();
  for (const item of items) {
    const p = products.get(item.productId);
    if (!p || item.qty <= 0) continue;
    const price = priceProduct(p, customer ?? null, item.qty, now, depositTypes);
    showNet = price.showNet;
    goods += price.showNet ? price.lineNet : price.lineGross;
    deposit += price.depositTotal;
    count += item.qty;
    const t = p.depositTypeId ? depositTypes.find((d) => d.id === p.depositTypeId) : undefined;
    if (t?.returnable && !t.loose) returnable += item.qty;
  }
  return { goods, deposit, showNet, count, returnable };
}

// ───────────────────────────── Leergut ─────────────────────────────

export interface DepositLine {
  type: DepositType;
  qty: number;
  value: number;
}

export interface DepositSummary {
  lines: DepositLine[];
  totalQty: number;
  totalValue: number;
  /** Leergut-Rückgabe für den Warenkorb (nur rückgabefähige Gebinde) */
  returnLines: EmptiesLine[];
}

export function depositSummary(balance: Record<string, number> | undefined, types: DepositType[]): DepositSummary {
  const lines: DepositLine[] = [];
  for (const [id, qty] of Object.entries(balance ?? {})) {
    if (!qty || qty <= 0) continue;
    const type = types.find((t) => t.id === id) ?? { id, name: id, shortName: id, amount: 0, returnable: false };
    lines.push({ type, qty, value: type.amount * qty });
  }
  lines.sort((a, b) => b.value - a.value);
  return {
    lines,
    totalQty: lines.reduce((s, l) => s + l.qty, 0),
    totalValue: lines.reduce((s, l) => s + l.value, 0),
    returnLines: lines.filter((l) => l.type.returnable && !l.type.loose).map((l) => ({ depositTypeId: l.type.id, qty: l.qty })),
  };
}

export interface EmptiesFlow {
  order: Order;
  /** gelieferte Mehrweg-Gebinde je Pfandart */
  delivered: EmptiesLine[];
  /** zurückgegebenes Leergut je Pfandart */
  returned: EmptiesLine[];
  deliveredQty: number;
  returnedQty: number;
  /** Veränderung des Leergut-Kontos (Gebinde) */
  delta: number;
}

/** Leergut-Bewegung einer abgeschlossenen Bestellung (gleiche Regeln wie applyCompletion im Core) */
export function emptiesFlow(order: Order, types: DepositType[]): EmptiesFlow {
  const deliveredMap = new Map<string, number>();
  for (const line of order.lines) {
    if (!line.depositTypeId) continue;
    const t = types.find((x) => x.id === line.depositTypeId);
    if (t?.returnable && !t.loose) deliveredMap.set(t.id, (deliveredMap.get(t.id) ?? 0) + line.qty);
  }
  const collected = order.proof?.emptiesCollected ?? order.emptiesReturn ?? [];
  const returnedMap = new Map<string, number>();
  for (const l of collected) if (l.qty > 0) returnedMap.set(l.depositTypeId, (returnedMap.get(l.depositTypeId) ?? 0) + l.qty);
  const delivered = [...deliveredMap].map(([depositTypeId, qty]) => ({ depositTypeId, qty }));
  const returned = [...returnedMap].map(([depositTypeId, qty]) => ({ depositTypeId, qty }));
  const deliveredQty = delivered.reduce((s, l) => s + l.qty, 0);
  const returnedQty = returned.reduce((s, l) => s + l.qty, 0);
  // lose Einzelflaschen laufen nicht über das Leergut-Konto
  const returnedAccount = returned.reduce((s, l) => s + (types.find((t) => t.id === l.depositTypeId)?.loose ? 0 : l.qty), 0);
  return { order, delivered, returned, deliveredQty, returnedQty, delta: deliveredQty - returnedAccount };
}

/** "2× Bierkasten (20er), 1× Wasserkasten Glas (12er)" */
export function emptiesText(lines: EmptiesLine[], types: DepositType[]): string {
  if (!lines.length) return '–';
  return lines.map((l) => `${l.qty}× ${types.find((t) => t.id === l.depositTypeId)?.shortName ?? l.depositTypeId}`).join(', ');
}

// ───────────────────────────── Bestellungen ─────────────────────────────

const CLOSED = new Set(['delivered', 'picked_up', 'cancelled', 'failed']);

export function isOpenOrder(o: Pick<Order, 'status'>): boolean {
  return !CLOSED.has(o.status);
}

export function isCompletedOrder(o: Pick<Order, 'status'>): boolean {
  return o.status === 'delivered' || o.status === 'picked_up';
}
