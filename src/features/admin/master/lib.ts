/**
 * Gemeinsame Helfer der Markt-Stammdaten-Seiten (Sortiment, Kunden, Rechnungen, Abos, Statistik, Einstellungen).
 * Abfragen nutzen ausschließlich die Query-Keys aus `qk` – die RealtimeBridge invalidiert sie live.
 */
import { useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AdminOrderQuery } from '@shared/api';
import type { Customer, DepositType, ID, Invoice, Order, Product } from '@shared/types';
import { api } from '@/api/client';
import { qk } from '@/api/hooks';

// ───────────────────────────── Abfragen ─────────────────────────────

const ALL_ORDERS: AdminOrderQuery = {};

export function useAdminCustomers() {
  return useQuery({ queryKey: qk.adminCustomers, queryFn: () => api.adminListCustomers() });
}

/** Alle Bestellungen (für Kennzahlen je Kunde, Rechnungslauf) */
export function useAdminAllOrders() {
  return useQuery({ queryKey: qk.adminOrders(ALL_ORDERS), queryFn: () => api.adminListOrders(ALL_ORDERS) });
}

export function useAdminInvoices() {
  return useQuery({ queryKey: qk.adminInvoices, queryFn: () => api.adminListInvoices() });
}

export function useAdminSubscriptions() {
  return useQuery({ queryKey: qk.adminSubscriptions, queryFn: () => api.adminListSubscriptions() });
}

export function useAdminDrivers() {
  return useQuery({ queryKey: qk.adminDrivers, queryFn: () => api.adminListDrivers() });
}

export function useAdminCustomer(id: ID | undefined) {
  return useQuery({
    queryKey: qk.adminCustomer(id ?? ''),
    queryFn: () => api.adminGetCustomer(id as ID),
    enabled: !!id,
  });
}

export function useAdminStats(days: number) {
  return useQuery({
    queryKey: qk.adminStats(days),
    queryFn: () => api.adminGetStats(days),
    placeholderData: keepPreviousData,
  });
}

// ───────────────────────────── URL-Zustand (Filter, Reiter) ─────────────────────────────

/**
 * Suchparameter als Seitenzustand. Änderungen bauen immer auf dem zuletzt gesetzten Stand auf –
 * auch wenn mehrere Änderungen vor dem nächsten Rendern erfolgen (schnelles Tippen, Klick direkt danach).
 */
export function useUrlState() {
  const [params, setParams] = useSearchParams();
  const latest = useRef(params);
  const rendered = useRef(params.toString());
  const key = params.toString();
  if (key !== rendered.current) {
    // Navigation erfolgt (eigene oder von außen) → diesen Stand übernehmen
    rendered.current = key;
    latest.current = params;
  }
  const set = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(latest.current);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === '') next.delete(k);
        else next.set(k, v);
      }
      latest.current = next;
      setParams(next, { replace: true });
    },
    [setParams],
  );
  const reset = useCallback(() => {
    latest.current = new URLSearchParams();
    setParams(latest.current, { replace: true });
  }, [setParams]);
  return { params, set, reset };
}

// ───────────────────────────── Zahlen & Eingaben ─────────────────────────────

export function netFromGross(gross: number, vatRate: number): number {
  return Math.round(gross / (1 + vatRate / 100));
}

export function grossFromNet(net: number, vatRate: number): number {
  return Math.round(net * (1 + vatRate / 100));
}

/**
 * Euro-Eingabe → Cent. Akzeptiert "12,99", "12.99", "1.234,50", "12", "12,9 €".
 * Leere oder ungültige Eingabe → null.
 */
export function parseEuro(input: string): number | null {
  let s = input.replace(/[€\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Cent → Eingabewert "12,99" (ohne Währungszeichen – das steht als Suffix im Feld) */
export function euroInput(cents: number | undefined | null): string {
  if (cents === undefined || cents === null || !Number.isFinite(cents)) return '';
  return (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Ganze Zahl aus Eingabe ("12", " 12 ") – sonst null */
export function parseIntInput(input: string): number | null {
  const s = input.trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/** Dezimalzahl aus Eingabe ("0,5", "4.9") – sonst null */
export function parseDecimalInput(input: string): number | null {
  const s = input.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Zahl → Eingabewert mit Dezimalkomma */
export function decimalInput(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '';
  return String(n).replace('.', ',');
}

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const ZIP_RE = /^\d{5}$/;

/** Prozent mit deutschem Komma, z. B. 12,5 % */
export function formatPercent(value: number, digits = 0): string {
  return `${value.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: 0 })} %`;
}

/** Ganze Zahl mit Tausenderpunkt */
export function formatCount(n: number): string {
  return n.toLocaleString('de-DE');
}

// ───────────────────────────── Bestand ─────────────────────────────

export type StockLevel = 'empty' | 'critical' | 'low' | 'ok' | 'rental';

/** Ampel: leer/kritisch (rot) · unter Meldebestand (gelb) · ausreichend (grün) */
export function stockLevel(p: Pick<Product, 'stock' | 'minStock' | 'isRental'>): StockLevel {
  if (p.isRental) return 'rental';
  if (p.stock <= 0) return 'empty';
  if (p.stock < p.minStock / 2) return 'critical';
  if (p.stock < p.minStock) return 'low';
  return 'ok';
}

export function isBelowMinStock(p: Product): boolean {
  return !p.isRental && p.stock < p.minStock;
}

// ───────────────────────────── Kunden-Kennzahlen ─────────────────────────────

/** Umsatz einer Bestellung wie in der Statistik: Warenwert brutto − Gutschein */
export function orderRevenue(o: Order): number {
  return o.totals.itemsGross - o.totals.discount;
}

const RECEIVABLE_METHODS = new Set(['invoice', 'sepa']);

/** Geliefert/abgeholt, auf Rechnung/SEPA, noch ohne Rechnung (wie billableOrders im Core) */
export function isBillable(o: Order): boolean {
  return (o.status === 'delivered' || o.status === 'picked_up') && RECEIVABLE_METHODS.has(o.paymentMethod) && !o.invoiceId;
}

/** Belastet das Kreditlimit: Rechnung/SEPA, nicht storniert, noch nicht abgerechnet (wie im Core) */
function isUnbilledCredit(o: Order): boolean {
  return RECEIVABLE_METHODS.has(o.paymentMethod) && !o.invoiceId && o.status !== 'cancelled' && o.paymentStatus !== 'paid';
}

export function depositValue(balance: Record<ID, number> | undefined, depositTypes: DepositType[]): { count: number; value: number } {
  let count = 0;
  let value = 0;
  for (const [id, qty] of Object.entries(balance ?? {})) {
    if (qty <= 0) continue;
    count += qty;
    value += (depositTypes.find((d) => d.id === id)?.amount ?? 0) * qty;
  }
  return { count, value };
}

export interface CustomerFigures {
  orders: number;
  revenue: number;
  lastOrderAt?: string;
  /** offene Posten: unbezahlte Rechnungen + noch nicht abgerechnete Rechnungs-/SEPA-Bestellungen */
  openAmount: number;
  overdueAmount: number;
  depositCount: number;
  depositValue: number;
  /** gelieferte, noch nicht abgerechnete Rechnungs-Bestellungen */
  billableCount: number;
  billableAmount: number;
}

export function emptyFigures(): CustomerFigures {
  return { orders: 0, revenue: 0, openAmount: 0, overdueAmount: 0, depositCount: 0, depositValue: 0, billableCount: 0, billableAmount: 0 };
}

/** Kennzahlen je Kunde aus Bestellungen, Rechnungen und Leergut-Konto */
export function customerFigures(
  customers: Customer[],
  orders: Order[],
  invoices: Invoice[],
  depositTypes: DepositType[],
): Map<ID, CustomerFigures> {
  const map = new Map<ID, CustomerFigures>();
  for (const c of customers) {
    const f = emptyFigures();
    const d = depositValue(c.depositBalance, depositTypes);
    f.depositCount = d.count;
    f.depositValue = d.value;
    map.set(c.id, f);
  }
  for (const o of orders) {
    const f = map.get(o.customerId);
    if (!f) continue;
    if (o.status !== 'cancelled') {
      f.orders += 1;
      f.revenue += orderRevenue(o);
      if (!f.lastOrderAt || o.createdAt > f.lastOrderAt) f.lastOrderAt = o.createdAt;
    }
    if (isUnbilledCredit(o)) f.openAmount += o.totals.total;
    if (isBillable(o)) {
      f.billableCount += 1;
      f.billableAmount += o.totals.total;
    }
  }
  for (const inv of invoices) {
    const f = map.get(inv.customerId);
    if (!f || inv.status === 'paid') continue;
    f.openAmount += inv.gross;
    if (inv.status === 'overdue') f.overdueAmount += inv.gross;
  }
  return map;
}

/** Text-Suche: alle Begriffe müssen vorkommen (Groß-/Kleinschreibung egal, Umlaute tolerant) */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');
}

export function matchesSearch(haystack: (string | undefined | null)[], needle: string): boolean {
  const q = normalizeSearch(needle.trim());
  if (!q) return true;
  const hay = normalizeSearch(haystack.filter(Boolean).join(' '));
  return q.split(/\s+/).every((part) => hay.includes(part));
}

/** stabile Sortierung nach Schlüssel */
export type SortDir = 'asc' | 'desc';
export function sortBy<T>(list: T[], key: (item: T) => string | number, dir: SortDir): T[] {
  const f = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (typeof ka === 'string' && typeof kb === 'string') return ka.localeCompare(kb, 'de') * f;
    return ((ka as number) - (kb as number)) * f;
  });
}
