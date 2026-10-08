/**
 * Öffnungszeiten: Gruppierung für die Anzeige ("Mo – Fr 07:30 – 20:00 Uhr") und "Jetzt geöffnet".
 * Zeitzone immer Europe/Berlin (shared/time.ts).
 */
import type { OpeningHours } from '@shared/types';
import { WEEKDAY_SHORT } from '@shared/format';
import { berlinParts, minutesToTime, timeToMinutes } from '@shared/time';

export interface OpeningLine {
  /** "Mo – Fr", "Sa", "So" */
  days: string;
  /** "07:30 – 20:00 Uhr" bzw. "geschlossen" */
  hours: string;
  closed: boolean;
}

/** Montag zuerst */
const ORDER = [1, 2, 3, 4, 5, 6, 0];

function hoursText(h: OpeningHours[number]): string {
  return h ? `${h.open} – ${h.close} Uhr` : 'geschlossen';
}

export function groupOpeningHours(hours: OpeningHours): OpeningLine[] {
  const lines: OpeningLine[] = [];
  let start = ORDER[0];
  let prevText = hoursText(hours[start] ?? null);
  let prevDay = start;
  const flush = (from: number, to: number, text: string) => {
    const days = from === to ? WEEKDAY_SHORT[from] : `${WEEKDAY_SHORT[from]} – ${WEEKDAY_SHORT[to]}`;
    lines.push({ days, hours: text, closed: text === 'geschlossen' });
  };
  for (const day of ORDER.slice(1)) {
    const text = hoursText(hours[day] ?? null);
    if (text !== prevText) {
      flush(start, prevDay, prevText);
      start = day;
      prevText = text;
    }
    prevDay = day;
  }
  flush(start, prevDay, prevText);
  return lines;
}

export interface OpenState {
  open: boolean;
  /** z. B. "Geöffnet bis 20:00 Uhr" / "Öffnet morgen um 07:30 Uhr" */
  text: string;
}

export function openState(hours: OpeningHours, now: Date = new Date()): OpenState {
  const p = berlinParts(now);
  const minutes = p.hour * 60 + p.minute;
  const today = hours[p.weekday] ?? null;
  if (today && minutes >= timeToMinutes(today.open) && minutes < timeToMinutes(today.close)) {
    return { open: true, text: `Geöffnet bis ${today.close} Uhr` };
  }
  if (today && minutes < timeToMinutes(today.open)) {
    return { open: false, text: `Öffnet heute um ${today.open} Uhr` };
  }
  for (let i = 1; i <= 7; i++) {
    const wd = (p.weekday + i) % 7;
    const h = hours[wd] ?? null;
    if (h) {
      const when = i === 1 ? 'morgen' : `${WEEKDAY_SHORT[wd]}.`;
      return { open: false, text: `Öffnet ${when} um ${minutesToTime(timeToMinutes(h.open))} Uhr` };
    }
  }
  return { open: false, text: 'Derzeit geschlossen' };
}
