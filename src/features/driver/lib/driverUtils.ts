/**
 * Reine Hilfsfunktionen der Fahrer-App: Kennzahlen, Ladeliste, Kassieren, Navigation.
 * Geldbeträge in Cent, Anzeige immer über formatEuro.
 */
import type {
  DepositType,
  EmptiesLine,
  GeoPoint,
  ID,
  Order,
  PaymentMethod,
  Product,
  StopStatus,
  Tour,
  TourStop,
  TourWithOrders,
} from '@shared/types';
import { berlinParts } from '@shared/time';

// ───────────────────────────── Stopps & Touren ─────────────────────────────

export const isStopDone = (s: Pick<TourStop, 'status'>) => s.status === 'delivered' || s.status === 'failed';
export const isStopOpen = (s: Pick<TourStop, 'status'>) => s.status === 'pending' || s.status === 'arrived';

/** Anzahl Gebinde (Kästen, Fässer, Leihartikel …) einer Bestellung */
export function crateCount(order: Pick<Order, 'lines'>): number {
  return order.lines.reduce((s, l) => s + l.qty, 0);
}

/** Anzahl Leergut-Gebinde (angekündigt oder erfasst) */
export function emptiesCount(lines: EmptiesLine[]): number {
  return lines.reduce((s, l) => s + l.qty, 0);
}

/** Lose Einzelflasche/-dose (stückweise Rückgabe, kein Leergut-Konto) */
export function isLoose(type: Pick<DepositType, 'loose'> | undefined): boolean {
  return !!type?.loose;
}

/** Leergut lesbar zusammengefasst: „2 Kästen · 12 Einzelflaschen“ (ohne Leergut: „kein Leergut“) */
export function emptiesLabel(lines: EmptiesLine[], types: DepositType[]): string {
  let crates = 0;
  let loose = 0;
  for (const l of lines) {
    if (!l.qty) continue;
    if (isLoose(types.find((t) => t.id === l.depositTypeId))) loose += l.qty;
    else crates += l.qty;
  }
  const parts: string[] = [];
  if (crates) parts.push(plural(crates, 'Gebinde', 'Gebinde'));
  if (loose) parts.push(plural(loose, 'Einzelflasche', 'Einzelflaschen'));
  return parts.length ? parts.join(' · ') : 'kein Leergut';
}

/** Einheit je Leergut-Art („je Kasten“, „je Fass“, „je Flasche“, „je Stück“) */
export function emptiesUnit(type: DepositType): string {
  const text = `${type.id} ${type.name} ${type.shortName}`;
  if (type.loose) return /dose|einweg/i.test(text) ? 'je Stück' : 'je Flasche';
  if (/fass/i.test(text)) return 'je Fass';
  return 'je Kasten';
}

export interface TourStats {
  stops: number;
  done: number;
  delivered: number;
  failed: number;
  open: number;
  crates: number;
  /** offener Betrag bar/EC (noch zu kassieren, Stand Bestellung) */
  toCollect: number;
  /** bereits kassiert (bar + EC) */
  collected: number;
  /** davon bar */
  collectedCash: number;
  /** angekündigtes Leergut (Gebinde) */
  emptiesExpected: number;
  /** Fortschritt 0–1 */
  progress: number;
}

export function tourStats(tour: TourWithOrders): TourStats {
  const byId = new Map(tour.orders.map((o) => [o.id, o]));
  const s: TourStats = {
    stops: tour.stops.length,
    done: 0,
    delivered: 0,
    failed: 0,
    open: 0,
    crates: 0,
    toCollect: 0,
    collected: 0,
    collectedCash: 0,
    emptiesExpected: 0,
    progress: 0,
  };
  for (const stop of tour.stops) {
    const order = byId.get(stop.orderId);
    if (stop.status === 'delivered') s.delivered += 1;
    if (stop.status === 'failed') s.failed += 1;
    if (isStopOpen(stop)) s.open += 1;
    if (!order) continue;
    s.crates += crateCount(order);
    s.emptiesExpected += emptiesCount(order.emptiesReturn);
    if (isStopOpen(stop) && payKind(order.paymentMethod) === 'collect') s.toCollect += Math.max(0, order.totals.total);
    if (order.status === 'delivered' && order.proof?.amountCollected) {
      s.collected += order.proof.amountCollected;
      if (paidWith(order) === 'cash') s.collectedCash += order.proof.amountCollected;
    }
  }
  s.done = s.delivered + s.failed;
  s.progress = s.stops ? s.done / s.stops : 0;
  return s;
}

/** Summe mehrerer Touren (Kennzahlen „Heute“) */
export function sumStats(list: TourStats[]): TourStats {
  const total: TourStats = {
    stops: 0,
    done: 0,
    delivered: 0,
    failed: 0,
    open: 0,
    crates: 0,
    toCollect: 0,
    collected: 0,
    collectedCash: 0,
    emptiesExpected: 0,
    progress: 0,
  };
  for (const s of list) {
    total.stops += s.stops;
    total.done += s.done;
    total.delivered += s.delivered;
    total.failed += s.failed;
    total.open += s.open;
    total.crates += s.crates;
    total.toCollect += s.toCollect;
    total.collected += s.collected;
    total.collectedCash += s.collectedCash;
    total.emptiesExpected += s.emptiesExpected;
  }
  total.progress = total.stops ? total.done / total.stops : 0;
  return total;
}

/** Index des nächsten offenen Stopps nach `afterIndex` (mit Umlauf), sonst -1 */
export function nextOpenIndex(stops: Pick<TourStop, 'status'>[], afterIndex: number, skip?: number): number {
  const n = stops.length;
  for (let k = 1; k <= n; k++) {
    const i = (afterIndex + k + n) % n;
    if (i === skip) continue;
    if (isStopOpen(stops[i])) return i;
  }
  return -1;
}

/** Aktueller (nächster) Stopp einer Tour oder -1 */
export function currentStopIndex(tour: Tour): number {
  if (tour.status === 'completed') return -1;
  const i = tour.currentStopIndex;
  if (i >= 0 && i < tour.stops.length && isStopOpen(tour.stops[i])) return i;
  return tour.stops.findIndex(isStopOpen);
}

/** Tour und Stopp-Index zu einer Bestellung */
export function findStop(tours: TourWithOrders[] | undefined, orderId: ID): { tour: TourWithOrders; index: number; order: Order } | null {
  for (const tour of tours ?? []) {
    const index = tour.stops.findIndex((s) => s.orderId === orderId);
    if (index === -1) continue;
    const order = tour.orders.find((o) => o.id === orderId);
    if (order) return { tour, index, order };
  }
  return null;
}

export const STOP_TONE: Record<StopStatus, 'brand' | 'warning' | 'success' | 'danger'> = {
  pending: 'brand',
  arrived: 'warning',
  delivered: 'success',
  failed: 'danger',
};

// ───────────────────────────── Ladeliste ─────────────────────────────

export interface LoadItem {
  productId: ID;
  name: string;
  packaging: string;
  qty: number;
  isRental: boolean;
  depositTypeId?: ID;
  /** Verteilung auf Stopps (1-basiert) */
  perStop: { stop: number; qty: number }[];
}

/** Alle Positionen der Tour je Artikel zusammengefasst (Reihenfolge: meiste Gebinde zuerst) */
export function aggregateLoad(tour: TourWithOrders): LoadItem[] {
  const map = new Map<ID, LoadItem>();
  tour.stops.forEach((stop, i) => {
    const order = tour.orders.find((o) => o.id === stop.orderId);
    if (!order) return;
    for (const line of order.lines) {
      let item = map.get(line.productId);
      if (!item) {
        item = {
          productId: line.productId,
          name: line.name,
          packaging: line.packaging,
          qty: 0,
          isRental: !!line.isRental,
          perStop: [],
          ...(line.depositTypeId ? { depositTypeId: line.depositTypeId } : {}),
        };
        map.set(line.productId, item);
      }
      item.qty += line.qty;
      const existing = item.perStop.find((p) => p.stop === i + 1);
      if (existing) existing.qty += line.qty;
      else item.perStop.push({ stop: i + 1, qty: line.qty });
    }
  });
  return [...map.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, 'de'));
}

export interface EmptiesItem {
  depositTypeId: ID;
  qty: number;
  perStop: { stop: number; qty: number }[];
}

/** Angekündigtes Leergut der Tour je Leergut-Art */
export function aggregateEmpties(tour: TourWithOrders): EmptiesItem[] {
  const map = new Map<ID, EmptiesItem>();
  tour.stops.forEach((stop, i) => {
    const order = tour.orders.find((o) => o.id === stop.orderId);
    if (!order) return;
    for (const l of order.emptiesReturn) {
      if (!l.qty) continue;
      let item = map.get(l.depositTypeId);
      if (!item) {
        item = { depositTypeId: l.depositTypeId, qty: 0, perStop: [] };
        map.set(l.depositTypeId, item);
      }
      item.qty += l.qty;
      item.perStop.push({ stop: i + 1, qty: l.qty });
    }
  });
  return [...map.values()].sort((a, b) => b.qty - a.qty);
}

// ───────────────────────────── Kassieren ─────────────────────────────

export type PayKind = 'collect' | 'prepaid' | 'invoice';

/** bar/EC → beim Kunden kassieren; PayPal/Karte → bezahlt; Rechnung/SEPA → per Rechnung */
export function payKind(method: PaymentMethod): PayKind {
  if (method === 'cash' || method === 'ec') return 'collect';
  if (method === 'paypal' || method === 'card') return 'prepaid';
  return 'invoice';
}

/** Leergut-Gutschrift (nur rückgabefähiges Leergut) in Cent */
export function emptiesRefund(lines: EmptiesLine[], types: DepositType[]): number {
  return lines.reduce((s, l) => s + (types.find((t) => t.id === l.depositTypeId && t.returnable)?.amount ?? 0) * l.qty, 0);
}

export interface DueInfo {
  /** Bestellsumme laut Bestellung (inkl. angekündigter Leergut-Gutschrift) */
  orderTotal: number;
  announcedRefund: number;
  actualRefund: number;
  /** actual − announced (positiv = mehr Leergut als angekündigt) */
  refundDiff: number;
  /** tatsächlich zu zahlender Betrag (kann negativ sein = Auszahlung) */
  due: number;
}

/** Zu zahlender Betrag: Bestellsumme angepasst um die Leergut-Differenz (wie der Core bei der Zustellung) */
export function dueInfo(order: Order, collected: EmptiesLine[], types: DepositType[]): DueInfo {
  const actualRefund = emptiesRefund(collected, types);
  const announcedRefund = order.totals.depositRefund;
  const refundDiff = actualRefund - announcedRefund;
  return { orderTotal: order.totals.total, announcedRefund, actualRefund, refundDiff, due: order.totals.total - refundDiff };
}

// ───────────────────────────── Jugendschutz ─────────────────────────────

export interface AgeCheck {
  /** Mindestalter: 18 bei Spirituosen bzw. ab 15 % vol, sonst 16 */
  minAge: 16 | 18;
  /** betroffene Positionen (Name) */
  items: string[];
}

/** alkoholhaltig im Sinne des Jugendschutzes (wie im Shop: über 0,5 % vol und nicht „alkoholfrei“) */
function alcoholic(p: Pick<Product, 'alcoholPercent' | 'categoryId' | 'tags' | 'isRental'>): boolean {
  if (p.isRental) return false;
  if (p.categoryId === 'alkoholfrei' || p.tags.includes('alkoholfrei')) return false;
  return (p.alcoholPercent ?? 0) > 0.5;
}

/** Enthält die Lieferung alkoholische Getränke? → Mindestalter und betroffene Positionen, sonst null */
export function ageCheck(order: Pick<Order, 'lines'>, products: Map<ID, Product>): AgeCheck | null {
  let minAge: 16 | 18 = 16;
  const items: string[] = [];
  for (const line of order.lines) {
    const p = products.get(line.productId);
    if (!p || !alcoholic(p)) continue;
    items.push(line.name);
    if (p.categoryId === 'spirituosen' || (p.alcoholPercent ?? 0) >= 15) minAge = 18;
  }
  return items.length ? { minAge, items } : null;
}

export function ageCheckNote(check: AgeCheck): string {
  return `Alter geprüft (ab ${check.minAge} Jahren)`;
}

// ───────────────────────────── Demo-Simulation ─────────────────────────────

/** Schließt der Fahrer diesen Stopp in der Simulation selbst ab (statt automatischer Zustellung)? */
export function isManualSimStop(tour: Pick<Tour, 'simulation'>, orderId: ID): boolean {
  const sim = tour.simulation;
  if (!sim) return true;
  return !sim.autoComplete || !!sim.manualOrderIds?.includes(orderId);
}

/**
 * Wartet die laufende Demo-Simulation an einem Stopp auf die Zustellung durch den Fahrer?
 * (Fahrzeug ist angekommen, Stopp „vor Ort“ und vom Fahrer abzuschließen)
 */
export function simulationWaitingStop(tour: TourWithOrders): { index: number; order: Order } | null {
  const sim = tour.simulation;
  if (!sim?.running || tour.status !== 'active') return null;
  const index = sim.legIndex;
  const stop = tour.stops[index];
  if (!stop || stop.status !== 'arrived' || !isManualSimStop(tour, stop.orderId)) return null;
  const order = tour.orders.find((o) => o.id === stop.orderId);
  return order && order.status === 'out_for_delivery' ? { index, order } : null;
}

const PAID_EC = 'Bezahlt: EC-Karte';
const PAID_CASH = 'Bezahlt: bar';

export function paymentNote(method: 'cash' | 'ec'): string {
  return method === 'ec' ? PAID_EC : PAID_CASH;
}

/** Womit wurde bei der Zustellung bezahlt (bar/EC), sonst null */
export function paidWith(order: Order): 'cash' | 'ec' | null {
  if (payKind(order.paymentMethod) !== 'collect' || !order.proof) return null;
  const note = order.proof.note ?? '';
  if (note.includes(PAID_EC)) return 'ec';
  if (note.includes(PAID_CASH)) return 'cash';
  return order.paymentMethod === 'ec' ? 'ec' : 'cash';
}

/** Eingabe "50", "50,5", "50,00 €" → Cent (null bei ungültig) */
export function parseEuroInput(raw: string): number | null {
  const s = raw.replace(/[€\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!s) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(Number.parseFloat(s) * 100);
}

/** Cent → Eingabetext "12,50" */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** Vorschläge für den erhaltenen Betrag: passend + nächste runde Scheine */
export function cashSuggestions(due: number): number[] {
  if (due <= 0) return [];
  const out = new Set<number>([due]);
  for (const step of [500, 1000, 2000, 5000, 10000]) {
    const v = Math.ceil(due / step) * step;
    if (v > due) out.add(v);
    if (out.size >= 4) break;
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

// ───────────────────────────── Navigation & Texte ─────────────────────────────

export function appleMapsUrl(p: GeoPoint): string {
  return `https://maps.apple.com/?daddr=${p.lat},${p.lng}&dirflg=d`;
}

export function googleMapsUrl(p: GeoPoint): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
}

/** 0 → "Erdgeschoss", 3 → "3. Stock" */
export function floorLabel(floor: number | undefined): string | null {
  if (floor === undefined || floor === null || !Number.isFinite(floor)) return null;
  if (floor === 0) return 'Erdgeschoss';
  if (floor < 0) return `${Math.abs(floor)}. Untergeschoss`;
  return `${floor}. Stock`;
}

/** Tageszeitabhängige Begrüßung (Berliner Zeit) */
export function greeting(now: Date = new Date()): string {
  const h = berlinParts(now).hour;
  if (h < 5) return 'Gute Nacht';
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Guten Tag';
  return 'Guten Abend';
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;
}

/** Vorname aus vollständigem Namen */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
