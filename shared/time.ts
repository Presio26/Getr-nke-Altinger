/**
 * Zeit-Helfer in der Zeitzone des Markts (Europe/Berlin) – unabhängig von der Zeitzone
 * des Servers oder Browsers. Kalendertage als "YYYY-MM-DD", Uhrzeiten als "HH:mm".
 */
import type { DayString, TimeString } from './types';

export const STORE_TZ = 'Europe/Berlin';

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: STORE_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface BerlinParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sonntag … 6 = Samstag */
  weekday: number;
}

/** Zerlegt einen Zeitpunkt in Berliner Ortszeit. */
export function berlinParts(date: Date): BerlinParts {
  const map: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(date)) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: WEEKDAY_INDEX[map.weekday] ?? 0,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Kalendertag (Berlin) eines Zeitpunkts, z. B. "2026-10-08" */
export function dayString(date: Date): DayString {
  const p = berlinParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Uhrzeit (Berlin) eines Zeitpunkts, z. B. "14:05" */
export function timeString(date: Date): TimeString {
  const p = berlinParts(date);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "Heute" in Berlin */
export function todayString(now: Date = new Date()): DayString {
  return dayString(now);
}

/** Wochentag (0 = Sonntag … 6 = Samstag) eines Kalendertags */
export function weekdayOf(day: DayString): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Kalendertag + n Tage */
export function addDays(day: DayString, n: number): DayString {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * true für einen echten Kalendertag "YYYY-MM-DD" (z. B. nicht "2026-10-33" oder "2026-02-30" –
 * solche Werte würden addDays/weekdayOf/berlinDate stillschweigend in den Folgemonat umrechnen).
 */
export function isDayString(value: unknown): value is DayString {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && addDays(value, 0) === value;
}

/** Differenz in Kalendertagen (b − a) */
export function diffDays(a: DayString, b: DayString): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** "HH:mm" → Minuten seit Mitternacht */
export function timeToMinutes(time: TimeString): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Minuten seit Mitternacht → "HH:mm" */
export function minutesToTime(minutes: number): TimeString {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** Offset Berlin gegenüber UTC in Minuten zu einem Zeitpunkt (z. B. +120 im Sommer) */
function berlinOffsetMinutes(date: Date): number {
  const p = berlinParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/**
 * Zeitpunkt zu Berliner Wanduhrzeit (Kalendertag + "HH:mm").
 * Berücksichtigt Sommer-/Winterzeit.
 */
export function berlinDate(day: DayString, time: TimeString = '00:00'): Date {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm || 0);
  // Zweimal korrigieren, damit auch Tage mit Zeitumstellung stimmen.
  let ts = guess - berlinOffsetMinutes(new Date(guess)) * 60_000;
  ts = guess - berlinOffsetMinutes(new Date(ts)) * 60_000;
  return new Date(ts);
}

/** Minuten seit Mitternacht (Berlin) eines Zeitpunkts */
export function minutesOfDay(date: Date): number {
  const p = berlinParts(date);
  return p.hour * 60 + p.minute;
}

/** Ganze Minuten zwischen zwei Zeitpunkten (b − a) */
export function minutesBetween(a: Date | string, b: Date | string): number {
  const ta = typeof a === 'string' ? Date.parse(a) : a.getTime();
  const tb = typeof b === 'string' ? Date.parse(b) : b.getTime();
  return Math.round((tb - ta) / 60_000);
}

/** ISO-String eines Zeitpunkts plus n Minuten */
export function addMinutesIso(date: Date | string, minutes: number): string {
  const t = typeof date === 'string' ? Date.parse(date) : date.getTime();
  return new Date(t + minutes * 60_000).toISOString();
}
