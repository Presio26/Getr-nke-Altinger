/**
 * Liefer- und Abholzeitfenster (Europe/Berlin).
 *
 * Slot-ID: `${type}|${date}|${start}-${end}`, z. B. "delivery|2026-10-09|10:00-12:00".
 * Kapazität = Vorlage − gebuchte, nicht stornierte Bestellungen.
 * Bestellschluss: Lieferung settings.orderCutoffMinutes (Default 90) vor Fensterbeginn,
 * Abholung settings.pickupCutoffMinutes (Default 30).
 */
import type { DayString, FulfillmentType, Order, SlotQuery, SlotTemplate, StoreSettings, TimeSlot, TimeString } from '../types';
import { addDays, berlinDate, isDayString, todayString, weekdayOf } from '../time';

export const DEFAULT_PICKUP_CUTOFF_MINUTES = 30;
const SLOT_ID_RE = /^(delivery|pickup)\|(\d{4}-\d{2}-\d{2})\|([0-2]\d:[0-5]\d)-([0-2]\d:[0-5]\d)$/;

export function slotIdOf(type: FulfillmentType, date: DayString, start: TimeString, end: TimeString): string {
  return `${type}|${date}|${start}-${end}`;
}

export function parseSlotId(id: string | undefined | null): { type: FulfillmentType; date: DayString; start: TimeString; end: TimeString } | null {
  if (!id) return null;
  const m = SLOT_ID_RE.exec(id);
  // nur echte Kalendertage – "2026-10-33" wäre sonst ein zweites Fenster für den 02.11. (eigene Kapazität)
  if (!m || !isDayString(m[2])) return null;
  return { type: m[1] as FulfillmentType, date: m[2], start: m[3], end: m[4] };
}

/** Bestellschluss in Minuten vor Fensterbeginn */
export function cutoffMinutes(settings: StoreSettings, type: FulfillmentType): number {
  if (type === 'pickup') return settings.pickupCutoffMinutes ?? DEFAULT_PICKUP_CUTOFF_MINUTES;
  return settings.orderCutoffMinutes ?? 90;
}

/** Vorlagen eines Tages, nach Beginn sortiert */
export function templatesForDay(settings: StoreSettings, type: FulfillmentType, day: DayString): SlotTemplate[] {
  const weekday = weekdayOf(day);
  const list = type === 'delivery' ? settings.deliverySlots : settings.pickupSlots;
  return list.filter((t) => t.weekday === weekday).sort((a, b) => a.start.localeCompare(b.start));
}

/** Anzahl gebuchter (nicht stornierter) Bestellungen in einem Fenster */
export function bookedCount(orders: readonly Order[], slotId: string, excludeOrderId?: string): number {
  let n = 0;
  for (const o of orders) {
    if (o.slot.id === slotId && o.status !== 'cancelled' && o.id !== excludeOrderId) n++;
  }
  return n;
}

function buildSlot(
  settings: StoreSettings,
  orders: readonly Order[],
  type: FulfillmentType,
  day: DayString,
  t: Pick<SlotTemplate, 'start' | 'end' | 'capacity'>,
  now: Date,
  excludeOrderId?: string,
): TimeSlot {
  const id = slotIdOf(type, day, t.start, t.end);
  const booked = bookedCount(orders, id, excludeOrderId);
  const startAt = berlinDate(day, t.start).getTime();
  const cutoffAt = startAt - cutoffMinutes(settings, type) * 60_000;
  let available = true;
  let reason: string | undefined;
  if (now.getTime() > cutoffAt) {
    available = false;
    reason = 'Bestellschluss überschritten';
  } else if (booked >= t.capacity) {
    available = false;
    reason = 'Ausgebucht';
  }
  const slot: TimeSlot = { id, type, date: day, start: t.start, end: t.end, capacity: t.capacity, booked, available };
  if (reason) slot.reason = reason;
  return slot;
}

/**
 * Zeitfenster ab `query.from` (Default heute) für `query.days` Tage (Default 7).
 * Bereits beendete Fenster werden weggelassen.
 */
export function generateSlots(
  settings: StoreSettings,
  orders: readonly Order[],
  query: SlotQuery,
  now: Date,
  options: { includePast?: boolean; excludeOrderId?: string } = {},
): TimeSlot[] {
  const type: FulfillmentType = query.type === 'pickup' ? 'pickup' : 'delivery';
  const from = isDayString(query.from) ? query.from : todayString(now);
  const days = Math.max(1, Math.min(60, Math.floor(query.days ?? 7)));
  const out: TimeSlot[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    for (const t of templatesForDay(settings, type, day)) {
      if (!options.includePast && berlinDate(day, t.end).getTime() <= now.getTime()) continue;
      out.push(buildSlot(settings, orders, type, day, t, now, options.excludeOrderId));
    }
  }
  return out;
}

/** Ein Fenster per ID (nur wenn es zur Vorlage des Tages passt), sonst null */
export function findSlot(
  settings: StoreSettings,
  orders: readonly Order[],
  slotId: string,
  now: Date,
  excludeOrderId?: string,
): TimeSlot | null {
  const parsed = parseSlotId(slotId);
  if (!parsed) return null;
  const t = templatesForDay(settings, parsed.type, parsed.date).find((x) => x.start === parsed.start && x.end === parsed.end);
  if (!t) return null;
  return buildSlot(settings, orders, parsed.type, parsed.date, t, now, excludeOrderId);
}

/** Nächster Kalendertag ≥ `from` mit dem gewünschten Wochentag (0 = Sonntag … 6 = Samstag) */
export function nextWeekday(from: DayString, weekday: number): DayString {
  const diff = (weekday - weekdayOf(from) + 7) % 7;
  return addDays(from, diff);
}
