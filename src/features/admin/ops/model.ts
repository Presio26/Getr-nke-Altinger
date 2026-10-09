/**
 * Reine Hilfsfunktionen für das Tagesgeschäft im Markt-Dashboard
 * (Gebinde, Status-Schritte, Board-Spalten, Zeitangaben).
 */
import {
  CheckCircle2,
  PackageCheck,
  PackageOpen,
  RotateCcw,
  ShoppingBag,
  Truck,
  XCircle,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import type { DayString, Order, OrderStatus, Tour } from '@shared/types';
import { ORDER_TRANSITIONS, canTransition } from '@shared/core/orderOps';
import { addDays, dayString, todayString } from '@shared/time';
import { formatDate, formatRelative } from '@shared/format';

export { ORDER_TRANSITIONS, canTransition };

/** Bestellungen, die noch im Markt bearbeitet werden */
export const OPEN_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'picking', 'ready'];

/** Gebinde einer Bestellung (ohne Leihartikel) – wie die Tourenplanung im Core */
export function orderCrates(order: Pick<Order, 'lines'>): number {
  return order.lines.reduce((s, l) => s + (l.isRental ? 0 : l.qty), 0);
}

/** Alle Positionen (inkl. Leihartikel) */
export function orderItemCount(order: Pick<Order, 'lines'>): number {
  return order.lines.reduce((s, l) => s + l.qty, 0);
}

/** Zeitpunkt des letzten Statuswechsels */
export function lastStatusAt(order: Order): string {
  return order.statusHistory[order.statusHistory.length - 1]?.at ?? order.updatedAt;
}

/** Sortierschlüssel: Tag + Fensterbeginn */
export function slotKey(order: Pick<Order, 'slot'>): string {
  return `${order.slot.date} ${order.slot.start}`;
}

/** "Heute · 18:00–20:00" (kurz, ohne "Uhr") */
export function slotShort(slot: Order['slot'], now: Date = new Date()): string {
  return `${formatDate(slot.date, 'relative', now)} · ${slot.start}–${slot.end}`;
}

/** "heute" / "morgen" klein im Satz, sonst "Sa., 10.10." */
export function relDayInline(value: string, now: Date = new Date()): string {
  const r = formatDate(value, 'relative', now);
  return r === 'Heute' || r === 'Morgen' || r === 'Gestern' ? r.toLowerCase() : r;
}

/** Kompakt: "Heute · 18–20 Uhr" bzw. "Morgen · 10:30–12 Uhr" */
export function slotCompact(slot: Order['slot'], now: Date = new Date()): string {
  const t = (x: string) => (x.endsWith(':00') ? String(Number(x.slice(0, 2))) : x);
  return `${formatDate(slot.date, 'relative', now)} · ${t(slot.start)}–${t(slot.end)} Uhr`;
}

/** Kurzes Alter: "3 Min.", "19 Std.", "2 Tg." */
export function ageShort(iso: string, now: Date): string {
  const min = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (min < 1) return 'jetzt';
  if (min < 60) return `${min} Min.`;
  if (min < 48 * 60) return `${Math.round(min / 60)} Std.`;
  return `${Math.round(min / 1440)} Tg.`;
}

/** Zeitfenster eines Tages, z. B. "17:00–18:00 Uhr" */
export function windowLabel(slot: Pick<Order['slot'], 'start' | 'end'>): string {
  return `${slot.start}–${slot.end} Uhr`;
}

/** "vor 3 s" / "vor 2 Min." – sekundengenau unter einer Minute */
export function formatAgo(iso: string | undefined, now: Date): string {
  if (!iso) return '–';
  const diff = Math.round((now.getTime() - Date.parse(iso)) / 1000);
  if (Number.isNaN(diff)) return '–';
  if (diff < 5) return 'gerade eben';
  if (diff < 60) return `vor ${diff} s`;
  return formatRelative(iso, now);
}

/** Minuten bis zu einem Zeitpunkt (negativ = vorbei) */
export function minutesUntil(iso: string | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.round((t - now.getTime()) / 60_000);
}

/** Kalendertag, an dem eine Bestellung ihren letzten Status bekam (Berlin) */
export function finishedDay(order: Order): DayString {
  return dayString(new Date(lastStatusAt(order)));
}

// ───────────────────────────── Status-Schritte ─────────────────────────────

export interface StepAction {
  to: OrderStatus;
  label: string;
  icon: LucideIcon;
  tone: 'primary' | 'success' | 'danger' | 'neutral';
}

/** Ein-Klick-Aktion zum nächsten Status (Board, Listen) – null, wenn der Markt nichts tun muss */
export function primaryStep(order: Order): StepAction | null {
  switch (order.status) {
    case 'pending':
      return { to: 'confirmed', label: 'Bestätigen', icon: CheckCircle2, tone: 'primary' };
    case 'confirmed':
      return { to: 'picking', label: 'Kommissionieren', icon: PackageOpen, tone: 'primary' };
    case 'picking':
      return order.fulfillment === 'pickup'
        ? { to: 'ready', label: 'Bereitgestellt', icon: PackageCheck, tone: 'success' }
        : { to: 'ready', label: 'Verladen', icon: PackageCheck, tone: 'success' };
    case 'ready':
      return order.fulfillment === 'pickup' ? { to: 'picked_up', label: 'Abgeholt', icon: ShoppingBag, tone: 'success' } : null;
    case 'failed':
      return { to: 'ready', label: 'Erneut verladen', icon: RotateCcw, tone: 'primary' };
    default:
      return null;
  }
}

/** Beschriftung einer Statusaktion im Detail */
export function stepLabel(order: Order, to: OrderStatus): { label: string; icon: LucideIcon } {
  switch (to) {
    case 'confirmed':
      return { label: 'Bestätigen', icon: CheckCircle2 };
    case 'picking':
      return { label: 'Kommissionierung starten', icon: PackageOpen };
    case 'ready':
      if (order.status === 'failed') return { label: 'Erneut verladen', icon: RotateCcw };
      return order.fulfillment === 'pickup'
        ? { label: 'Bereitgestellt – Kunde informieren', icon: PackageCheck }
        : { label: 'Als verladen markieren', icon: PackageCheck };
    case 'out_for_delivery':
      return { label: 'Als unterwegs markieren', icon: Truck };
    case 'delivered':
      return { label: 'Als zugestellt markieren', icon: CheckCircle2 };
    case 'picked_up':
      return { label: 'Als abgeholt markieren', icon: ShoppingBag };
    case 'failed':
      return { label: 'Zustellung fehlgeschlagen', icon: AlertTriangle };
    case 'cancelled':
      return { label: 'Stornieren', icon: XCircle };
    default:
      return { label: to, icon: CheckCircle2 };
  }
}

/** Erlaubte Übergänge für den Markt (Core: ORDER_TRANSITIONS + canTransition) */
export function allowedTransitions(order: Order, tour?: Pick<Tour, 'status'> | null): OrderStatus[] {
  return (ORDER_TRANSITIONS[order.status] ?? []).filter((to) => {
    if (!canTransition(order, to)) return false;
    // Lieferungen einer geplanten Tour gehen mit dem Tourstart auf die Straße
    if (to === 'out_for_delivery' && order.tourId && tour?.status !== 'active') return false;
    return true;
  });
}

/**
 * Schrittfolge bis zu einem Ziel (z. B. "Abgeholt" direkt aus "Bestätigt"):
 * fehlende Zwischenschritte werden nachgezogen. null = nicht erreichbar.
 */
export function pathTo(order: Order, target: OrderStatus): OrderStatus[] | null {
  if (order.status === target) return [];
  if (canTransition(order, target)) return [target];
  const chain: OrderStatus[] = ['pending', 'confirmed', 'picking', 'ready'];
  const idx = chain.indexOf(order.status);
  if (idx === -1) return null;
  const targetIdx = chain.indexOf(target);
  if (targetIdx !== -1) return targetIdx > idx ? chain.slice(idx + 1, targetIdx + 1) : null;
  // Abholung direkt an der Theke: bis „abholbereit“ nachziehen, dann „abgeholt“
  if (target === 'picked_up' && order.fulfillment === 'pickup') return [...chain.slice(idx + 1), 'picked_up'];
  return null;
}

// ───────────────────────────── Board ─────────────────────────────

export type BoardColumnId = 'pending' | 'confirmed' | 'picking' | 'ready' | 'out' | 'done';

export interface BoardColumn {
  id: BoardColumnId;
  title: string;
  statuses: OrderStatus[];
  /** Punktfarbe der Spalte */
  dot: string;
}

export const BOARD_COLUMNS: BoardColumn[] = [
  { id: 'pending', title: 'Eingegangen', statuses: ['pending'], dot: 'bg-sky-500' },
  { id: 'confirmed', title: 'Bestätigt', statuses: ['confirmed'], dot: 'bg-brand-600' },
  { id: 'picking', title: 'Kommissionierung', statuses: ['picking'], dot: 'bg-amber-500' },
  { id: 'ready', title: 'Bereit / Verladen', statuses: ['ready'], dot: 'bg-accent-500' },
  { id: 'out', title: 'Unterwegs', statuses: ['out_for_delivery', 'failed'], dot: 'bg-indigo-500' },
  { id: 'done', title: 'Erledigt heute', statuses: ['delivered', 'picked_up', 'cancelled'], dot: 'bg-emerald-500' },
];

export function columnOf(order: Order, today: DayString): BoardColumnId | null {
  const col = BOARD_COLUMNS.find((c) => c.statuses.includes(order.status));
  if (!col) return null;
  if (col.id === 'done' && finishedDay(order) !== today) return null;
  return col.id;
}

// ───────────────────────────── Tage ─────────────────────────────

export function dayOptions(today: DayString = todayString(), count = 3): { value: DayString; label: string }[] {
  return Array.from({ length: count }, (_, i) => {
    const d = addDays(today, i);
    return { value: d, label: i === 0 ? 'Heute' : i === 1 ? 'Morgen' : formatDate(d, 'medium') };
  });
}

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Fahrzeit-Auslastung in Prozent */
export function loadPercent(crates: number, capacity: number): number {
  if (!capacity) return 0;
  return Math.round((crates / capacity) * 100);
}

/** Vorname */
export function firstName(name: string): string {
  return name.split(' ')[0] ?? name;
}

/** Zeitraffer für die Demo-Simulation */
export const DEFAULT_SIM_SPEED = 8;
