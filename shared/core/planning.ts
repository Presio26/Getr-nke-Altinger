/**
 * Tourenplanung: Reihenfolge (Nearest-Neighbor + 2-Opt nach Luftlinie) und
 * automatische Verteilung offener Lieferungen auf Fahrer.
 */
import type { Driver, GeoPoint, Order } from '../types';
import { bearing, haversine } from './geo';

/** Gesamtlänge eines Rundkurses start → points[order…] → start */
export function loopLength(start: GeoPoint, points: GeoPoint[], order: number[], closed = true): number {
  if (order.length === 0) return 0;
  let d = haversine(start, points[order[0]]);
  for (let i = 1; i < order.length; i++) d += haversine(points[order[i - 1]], points[order[i]]);
  if (closed) d += haversine(points[order[order.length - 1]], start);
  return d;
}

/**
 * Optimierte Reihenfolge (Indizes in `points`) für eine Rundfahrt ab `start`
 * (zurück zu `end`, Default = start).
 */
export function optimizeSequence(start: GeoPoint, points: GeoPoint[], end: GeoPoint = start): number[] {
  const n = points.length;
  if (n <= 1) return points.map((_, i) => i);
  // Nearest Neighbor
  const left = new Set(points.map((_, i) => i));
  const route: number[] = [];
  let cur: GeoPoint = start;
  while (left.size) {
    let best = -1;
    let bestD = Infinity;
    for (const i of left) {
      const d = haversine(cur, points[i]);
      if (d < bestD - 1e-9) {
        bestD = d;
        best = i;
      }
    }
    route.push(best);
    left.delete(best);
    cur = points[best];
  }
  // 2-Opt (Pfad start → … → end)
  const node = (k: number): GeoPoint => (k < 0 ? start : k >= n ? end : points[route[k]]);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = node(i - 1);
        const b = node(i);
        const c = node(j);
        const d = node(j + 1);
        const delta = haversine(a, c) + haversine(b, d) - haversine(a, b) - haversine(c, d);
        if (delta < -0.5) {
          route.splice(i, j - i + 1, ...route.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return route;
}

/** Gebinde einer Bestellung (ohne Leihartikel) – für die Fahrzeugkapazität */
export function orderCrates(order: Order): number {
  return order.lines.reduce((s, l) => s + (l.isRental ? 0 : l.qty), 0);
}

export interface PlannedGroup {
  driverId: string;
  slotStart: string;
  slotEnd: string;
  orders: Order[];
}

/** Max. Stopps je automatisch geplanter Tour */
export const MAX_STOPS_PER_TOUR = 8;

/**
 * Verteilt Lieferungen eines Tages: je Zeitfenster werden die Aufträge nach Himmelsrichtung
 * (vom Markt aus) sortiert und so in Gruppen geteilt, dass Kapazität und Stoppzahl passen.
 * Fahrer mit den wenigsten Touren des Tages werden bevorzugt.
 */
export function distributeOrders(
  store: GeoPoint,
  orders: Order[],
  drivers: Driver[],
  existingToursPerDriver: Record<string, number>,
): PlannedGroup[] {
  if (!drivers.length || !orders.length) return [];
  const load: Record<string, number> = { ...existingToursPerDriver };
  for (const d of drivers) load[d.id] = load[d.id] ?? 0;
  const byWindow = new Map<string, Order[]>();
  for (const o of orders) {
    const key = `${o.slot.start}-${o.slot.end}`;
    byWindow.set(key, [...(byWindow.get(key) ?? []), o]);
  }
  const groups: PlannedGroup[] = [];
  for (const key of [...byWindow.keys()].sort()) {
    const list = byWindow.get(key)!;
    const [slotStart, slotEnd] = key.split('-');
    const crates = list.reduce((s, o) => s + orderCrates(o), 0);
    const maxCapacity = Math.max(...drivers.map((d) => d.capacityCrates || 60));
    const needed = Math.max(1, Math.ceil(crates / maxCapacity), Math.ceil(list.length / MAX_STOPS_PER_TOUR));
    const k = Math.min(needed, drivers.length, list.length);
    // nach Richtung sortieren (Sweep), dann gleichmäßig aufteilen
    const sorted = [...list].sort((a, b) => angleOf(store, a) - angleOf(store, b));
    const chunkSize = Math.ceil(sorted.length / k);
    const chosen = [...drivers]
      .sort((a, b) => load[a.id] - load[b.id] || (b.capacityCrates ?? 0) - (a.capacityCrates ?? 0) || a.name.localeCompare(b.name))
      .slice(0, k);
    for (let i = 0; i < k; i++) {
      const part = sorted.slice(i * chunkSize, (i + 1) * chunkSize);
      if (!part.length) continue;
      const driver = chosen[i];
      load[driver.id] += 1;
      groups.push({ driverId: driver.id, slotStart, slotEnd, orders: part });
    }
  }
  return groups;
}

function angleOf(store: GeoPoint, order: Order): number {
  if (!order.address) return 0;
  return bearing(store, order.address);
}
