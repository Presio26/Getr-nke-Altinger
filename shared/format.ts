/**
 * Formatierung & Beschriftungen (deutsch). Von UI, Rechnungen und Benachrichtigungen genutzt.
 */
import type {
  BusinessSegment,
  DayString,
  FulfillmentType,
  InvoiceStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PriceGroup,
  Product,
  StopStatus,
  SubscriptionInterval,
  TourStatus,
  DriverStatus,
} from './types';
import { STORE_TZ, dayString, todayString, addDays } from './time';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const number1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const number2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 1999 → "19,99 €"; mit sign: "+3,10 €" / "−3,10 €" */
export function formatEuro(cents: number, opts: { sign?: boolean } = {}): string {
  const value = euro.format(Math.abs(cents) / 100);
  if (cents < 0) return `−${value}`;
  if (opts.sign && cents > 0) return `+${value}`;
  return value;
}

/** Zahl deutsch, max. 2 Nachkommastellen: 0.5 → "0,5" */
export function formatNumber(n: number): string {
  return number2.format(n);
}

/** Liter: 10 → "10 l", 0.33 → "0,33 l" */
export function formatLiters(liters: number): string {
  return `${number2.format(liters)} l`;
}

/** Gesamtliter eines Gebindes */
export function productLiters(product: Pick<Product, 'unitCount' | 'unitVolumeL'>): number {
  return Math.round(product.unitCount * product.unitVolumeL * 1000) / 1000;
}

/**
 * Grundpreis nach PAngV, z. B. "1,95 €/l". Bei Leihartikeln/ohne Volumen leer.
 * @param unitGross Brutto-Gebindepreis in Cent (ohne Pfand)
 */
export function basePrice(product: Pick<Product, 'unitCount' | 'unitVolumeL'>, unitGross: number): string {
  const liters = productLiters(product);
  if (!liters) return '';
  return `${formatEuro(Math.round(unitGross / liters))}/l`;
}

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  // Reiner Kalendertag → Mittag Berlin, damit der Tag in jeder Zeitzone stimmt
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00Z`);
  return new Date(value);
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function dtf(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('de-DE', { timeZone: STORE_TZ, ...options });
    fmtCache.set(key, f);
  }
  return f;
}

/**
 * Datum formatieren.
 *  - 'short'   → "09.10.2026"
 *  - 'medium'  → "Do., 09.10."
 *  - 'long'    → "Donnerstag, 9. Oktober 2026"
 *  - 'weekday' → "Donnerstag"
 *  - 'relative'→ "Heute" / "Morgen" / "Gestern" / sonst 'medium'
 */
export function formatDate(
  value: string | Date,
  style: 'short' | 'medium' | 'long' | 'weekday' | 'relative' = 'short',
  now: Date = new Date(),
): string {
  const d = toDate(value);
  switch (style) {
    case 'short':
      return dtf({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
    case 'medium':
      return dtf({ weekday: 'short', day: '2-digit', month: '2-digit' }).format(d);
    case 'long':
      return dtf({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    case 'weekday':
      return dtf({ weekday: 'long' }).format(d);
    case 'relative': {
      const day = dayString(d);
      const today = todayString(now);
      if (day === today) return 'Heute';
      if (day === addDays(today, 1)) return 'Morgen';
      if (day === addDays(today, -1)) return 'Gestern';
      return dtf({ weekday: 'short', day: '2-digit', month: '2-digit' }).format(d);
    }
  }
}

/** "14:05" (Berlin) */
export function formatTime(value: string | Date): string {
  return dtf({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(toDate(value));
}

/** "09.10.2026, 14:05" */
export function formatDateTime(value: string | Date): string {
  return `${formatDate(value, 'short')}, ${formatTime(value)}`;
}

/** Zeitfenster: "Heute · 10:00–12:00" bzw. "Do., 09.10. · 10:00–12:00" */
export function formatSlot(slot: { date: DayString; start: string; end: string }, now: Date = new Date()): string {
  return `${formatDate(slot.date, 'relative', now)} · ${slot.start}–${slot.end} Uhr`;
}

/** "vor 5 Min.", "vor 2 Std.", "gestern", "am 03.10." */
export function formatRelative(iso: string | Date, now: Date = new Date()): string {
  const t = toDate(iso).getTime();
  const diffMin = Math.round((now.getTime() - t) / 60_000);
  if (diffMin < 1 && diffMin > -1) return 'gerade eben';
  if (diffMin < 0) {
    const ahead = -diffMin;
    if (ahead < 60) return `in ${ahead} Min.`;
    if (ahead < 24 * 60) return `in ${Math.round(ahead / 60)} Std.`;
    return `am ${formatDate(iso, 'short')}`;
  }
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  if (diffMin < 24 * 60) return `vor ${Math.round(diffMin / 60)} Std.`;
  const day = dayString(toDate(iso));
  if (day === addDays(todayString(now), -1)) return 'gestern';
  return `am ${formatDate(iso, 'short')}`;
}

/** Meter → "850 m" / "2,4 km" */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${number1.format(meters / 1000)} km`;
}

/** Sekunden → "4 Min." / "1 Std. 05 Min." */
export function formatDuration(seconds: number): string {
  const min = Math.max(0, Math.round(seconds / 60));
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${String(m).padStart(2, '0')} Min.` : `${h} Std.`;
}

/** Ganze Gebinde, z. B. "1 Kasten" / "3 Kästen" (einfach: Stück) */
export function formatQty(qty: number, singular = 'Stück', plural = 'Stück'): string {
  return `${qty} ${qty === 1 ? singular : plural}`;
}

// ───────────────────────────── Labels ─────────────────────────────

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Eingegangen',
  confirmed: 'Bestätigt',
  picking: 'Wird zusammengestellt',
  ready: 'Bereit',
  out_for_delivery: 'Unterwegs',
  delivered: 'Zugestellt',
  picked_up: 'Abgeholt',
  failed: 'Zustellung fehlgeschlagen',
  cancelled: 'Storniert',
};

/** Status-Text abhängig von Lieferart (z. B. "ready" → "Verladen" bzw. "Abholbereit") */
export function orderStatusLabel(status: OrderStatus, fulfillment: FulfillmentType): string {
  if (status === 'ready') return fulfillment === 'pickup' ? 'Abholbereit' : 'Verladen';
  return ORDER_STATUS_LABEL[status];
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Barzahlung',
  ec: 'EC-/Girocard',
  paypal: 'PayPal',
  card: 'Kreditkarte',
  invoice: 'Kauf auf Rechnung',
  sepa: 'SEPA-Lastschrift',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  open: 'offen',
  paid: 'bezahlt',
  invoiced: 'in Rechnung gestellt',
};

export const FULFILLMENT_LABEL: Record<FulfillmentType, string> = {
  delivery: 'Lieferung',
  pickup: 'Abholung im Markt',
};

export const SEGMENT_LABEL: Record<BusinessSegment, string> = {
  gastronomie: 'Gastronomie',
  buero: 'Büro & Firma',
  verein: 'Verein',
  hotel: 'Hotel',
  handel: 'Handel',
  sonstiges: 'Sonstiges',
};

export const PRICE_GROUP_LABEL: Record<PriceGroup, string> = {
  standard: 'Standard',
  gastro: 'Gastronomie',
  gastro_plus: 'Gastronomie Plus',
  verein: 'Vereine',
};

/** Index 0 = Sonntag */
export const WEEKDAY_LABEL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export const INTERVAL_LABEL: Record<SubscriptionInterval, string> = {
  weekly: 'jede Woche',
  biweekly: 'alle 2 Wochen',
  monthly: 'alle 4 Wochen',
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  open: 'offen',
  paid: 'bezahlt',
  overdue: 'überfällig',
};

export const TOUR_STATUS_LABEL: Record<TourStatus, string> = {
  planned: 'Geplant',
  active: 'Unterwegs',
  completed: 'Abgeschlossen',
};

export const STOP_STATUS_LABEL: Record<StopStatus, string> = {
  pending: 'Offen',
  arrived: 'Vor Ort',
  delivered: 'Zugestellt',
  failed: 'Fehlgeschlagen',
};

export const DRIVER_STATUS_LABEL: Record<DriverStatus, string> = {
  off: 'Nicht im Dienst',
  available: 'Verfügbar',
  on_tour: 'Auf Tour',
  break: 'Pause',
};
