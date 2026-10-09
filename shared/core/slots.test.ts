import { describe, expect, it } from 'vitest';
import type { Order } from '../types';
import { berlinDate } from '../time';
import { buildSettings } from './seed/settings';
import { findSlot, generateSlots, nextWeekday, parseSlotId, slotIdOf } from './slots';

const settings = buildSettings();
const booking = (slotId: string, status: Order['status'] = 'confirmed'): Order => ({ id: `o-${Math.random()}`, slot: { id: slotId }, status }) as unknown as Order;

describe('Slot-IDs', () => {
  it('folgen dem Format TYPE|DATE|START-END', () => {
    expect(slotIdOf('delivery', '2026-10-09', '10:00', '12:00')).toBe('delivery|2026-10-09|10:00-12:00');
    expect(parseSlotId('pickup|2026-10-09|08:00-09:00')).toEqual({ type: 'pickup', date: '2026-10-09', start: '08:00', end: '09:00' });
    expect(parseSlotId('delivery|2026-10-09')).toBeNull();
    expect(parseSlotId('abholung|2026-10-09|08:00-09:00')).toBeNull();
  });
});

describe('generateSlots', () => {
  it('Lieferung: Bestellschluss 90 Minuten vor Fensterbeginn (Do., 13:20 Uhr)', () => {
    const now = berlinDate('2026-10-08', '13:20');
    const slots = generateSlots(settings, [], { type: 'delivery', days: 1 }, now);
    // 08–10 und 10–12 sind vorbei und tauchen nicht auf
    expect(slots.map((s) => s.start)).toEqual(['12:00', '14:00', '16:00', '18:00']);
    expect(slots.find((s) => s.start === '12:00')).toMatchObject({ available: false, reason: 'Bestellschluss überschritten' });
    expect(slots.find((s) => s.start === '14:00')).toMatchObject({ available: false, reason: 'Bestellschluss überschritten' });
    expect(slots.find((s) => s.start === '16:00')).toMatchObject({ available: true, capacity: 8, booked: 0 });
  });

  it('Abholung: Bestellschluss 30 Minuten vor Fensterbeginn', () => {
    const now = berlinDate('2026-10-08', '13:20');
    const slots = generateSlots(settings, [], { type: 'pickup', days: 1 }, now);
    expect(slots.find((s) => s.start === '13:00')?.available).toBe(false);
    expect(slots.find((s) => s.start === '14:00')?.available).toBe(true);
    expect(slots[slots.length - 1].end).toBe('20:00');
  });

  it('Sonntag geschlossen, Samstag mit eigenen Fenstern', () => {
    const now = berlinDate('2026-10-09', '06:00');
    const slots = generateSlots(settings, [], { type: 'delivery', from: '2026-10-10', days: 2 }, now);
    expect(slots.filter((s) => s.date === '2026-10-11')).toEqual([]);
    const sat = slots.filter((s) => s.date === '2026-10-10');
    expect(sat.map((s) => `${s.start}-${s.end}`)).toEqual(['08:00-10:00', '10:00-12:00', '12:00-14:00']);
    expect(sat.every((s) => s.capacity === 10)).toBe(true);
  });

  it('Kapazität minus gebuchter, nicht stornierter Bestellungen', () => {
    const now = berlinDate('2026-10-08', '06:00');
    const id = 'delivery|2026-10-09|10:00-12:00';
    const orders = [...Array.from({ length: 7 }, () => booking(id)), booking(id, 'cancelled')];
    let slot = findSlot(settings, orders, id, now)!;
    expect(slot.booked).toBe(7);
    expect(slot.available).toBe(true);
    orders.push(booking(id));
    slot = findSlot(settings, orders, id, now)!;
    expect(slot).toMatchObject({ booked: 8, available: false, reason: 'Ausgebucht' });
  });

  it('kennt nur Fenster aus den Vorlagen', () => {
    const now = berlinDate('2026-10-08', '06:00');
    expect(findSlot(settings, [], 'delivery|2026-10-09|09:00-11:00', now)).toBeNull();
    expect(findSlot(settings, [], 'delivery|2026-10-11|10:00-12:00', now)).toBeNull(); // Sonntag
  });

  it('rechnet in Europe/Berlin – Sommerzeit (UTC+2)', () => {
    // Fr., 23.10.2026, 08:00 Uhr Sommerzeit = 06:00 UTC; Bestellschluss 06:30 Ortszeit = 04:30 UTC
    const id = 'delivery|2026-10-23|08:00-10:00';
    expect(findSlot(settings, [], id, new Date('2026-10-23T04:29:00Z'))?.available).toBe(true);
    expect(findSlot(settings, [], id, new Date('2026-10-23T04:31:00Z'))?.available).toBe(false);
  });

  it('rechnet in Europe/Berlin – Winterzeit (UTC+1) nach der Zeitumstellung', () => {
    // Mo., 26.10.2026 (Umstellung am 25.10.), 08:00 Uhr = 07:00 UTC; Bestellschluss 06:30 Ortszeit = 05:30 UTC
    const id = 'delivery|2026-10-26|08:00-10:00';
    expect(findSlot(settings, [], id, new Date('2026-10-26T05:29:00Z'))?.available).toBe(true);
    expect(findSlot(settings, [], id, new Date('2026-10-26T05:31:00Z'))?.available).toBe(false);
    // Abholung 08–09 Uhr: Bestellschluss 07:30 Ortszeit = 06:30 UTC
    const pid = 'pickup|2026-10-26|08:00-09:00';
    expect(findSlot(settings, [], pid, new Date('2026-10-26T06:29:00Z'))?.available).toBe(true);
    expect(findSlot(settings, [], pid, new Date('2026-10-26T06:31:00Z'))?.available).toBe(false);
  });

  it('rechnet über den Frühjahrs-Wechsel (29.03.2026) korrekt', () => {
    const id = 'delivery|2026-03-30|08:00-10:00'; // Montag, Sommerzeit → 06:00 UTC
    expect(findSlot(settings, [], id, new Date('2026-03-30T04:29:00Z'))?.available).toBe(true);
    expect(findSlot(settings, [], id, new Date('2026-03-30T04:31:00Z'))?.available).toBe(false);
    // Samstag davor noch Winterzeit: 08:00 = 07:00 UTC
    const sat = 'delivery|2026-03-28|08:00-10:00';
    expect(findSlot(settings, [], sat, new Date('2026-03-28T05:29:00Z'))?.available).toBe(true);
    expect(findSlot(settings, [], sat, new Date('2026-03-28T05:31:00Z'))?.available).toBe(false);
  });

  it('nextWeekday', () => {
    expect(nextWeekday('2026-10-08', 4)).toBe('2026-10-08');
    expect(nextWeekday('2026-10-08', 1)).toBe('2026-10-12');
  });
});
