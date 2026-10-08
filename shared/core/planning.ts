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

/** Gebinde einer Gruppe */
function groupCrates(orders: readonly Order[]): number {
  return orders.reduce((s, o) => s + orderCrates(o), 0);
}

/**
 * Verteilt Lieferungen eines Tages: je Zeitfenster werden die Aufträge nach Himmelsrichtung
 * (vom Markt aus) sortiert und der Reihe nach in Gruppen geschnitten – jede Gruppe höchstens so viele
 * Kästen, wie das Fahrzeug ihres Fahrers fasst, und höchstens MAX_STOPS_PER_TOUR Stopps.
 * Reichen die Fahrer eines Fensters nicht, entsteht eine weitere Tour (statt die Kapazität zu überschreiten).
 * Bevorzugt werden Fahrer, die im Fenster noch frei sind (auch ohne bestehende Tour in diesem Fenster), deren
 * Fahrzeug den nächsten Auftrag fasst und die die wenigsten Touren des Tages haben.
 * Einzelne Aufträge, die übrig bleiben (1-Stopp-Kleinsttour), übernimmt eine andere Gruppe desselben Fensters,
 * sofern deren Fahrzeug noch Platz hat.
 */
export function distributeOrders(
  store: GeoPoint,
  orders: Order[],
  drivers: Driver[],
  existingToursPerDriver: Record<string, number>,
  /** Fahrer mit bereits geplanter Tour je Fenster ("08:00-10:00" → Fahrer-IDs) */
  busyByWindow: Record<string, readonly string[]> = {},
): PlannedGroup[] {
  if (!drivers.length || !orders.length) return [];
  const load: Record<string, number> = { ...existingToursPerDriver };
  for (const d of drivers) load[d.id] = load[d.id] ?? 0;
  const capacityOf = (d: Driver) => d.capacityCrates || 60;
  const capacityById = (id: string) => capacityOf(drivers.find((d) => d.id === id) ?? drivers[0]);
  const maxCapacity = Math.max(...drivers.map(capacityOf));
  const byWindow = new Map<string, Order[]>();
  for (const o of orders) {
    const key = `${o.slot.start}-${o.slot.end}`;
    byWindow.set(key, [...(byWindow.get(key) ?? []), o]);
  }
  const groups: PlannedGroup[] = [];
  for (const key of [...byWindow.keys()].sort()) {
    const [slotStart, slotEnd] = key.split('-');
    // nach Richtung sortieren (Sweep), dann der Reihe nach schneiden
    const sorted = [...byWindow.get(key)!].sort((a, b) => angleOf(store, a) - angleOf(store, b) || a.number.localeCompare(b.number));
    const used = new Set<string>(busyByWindow[key] ?? []);
    const windowGroups: PlannedGroup[] = [];
    let i = 0;
    while (i < sorted.length) {
      const nextCrates = orderCrates(sorted[i]);
      const rank = (d: Driver) => [Number(used.has(d.id)), Number(capacityOf(d) < nextCrates), load[d.id]];
      const driver = [...drivers].sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2] || capacityOf(b) - capacityOf(a) || a.name.localeCompare(b.name);
      })[0];
      // gleichmäßig auf die nötigen Touren verteilen (Stoppzahl), Kästen höchstens bis zur Fahrzeugkapazität
      const rest = sorted.slice(i);
      const restCrates = rest.reduce((s, o) => s + orderCrates(o), 0);
      const needed = Math.max(1, Math.ceil(restCrates / maxCapacity), Math.ceil(rest.length / MAX_STOPS_PER_TOUR));
      const maxStops = Math.min(MAX_STOPS_PER_TOUR, Math.ceil(rest.length / needed));
      const part: Order[] = [];
      let crates = 0;
      while (i < sorted.length && part.length < maxStops) {
        const c = orderCrates(sorted[i]);
        // mindestens ein Auftrag je Tour (ein einzelner zu großer Auftrag lässt sich nicht teilen)
        if (part.length && crates + c > capacityOf(driver)) break;
        part.push(sorted[i]);
        crates += c;
        i++;
      }
      used.add(driver.id);
      load[driver.id] += 1;
      windowGroups.push({ driverId: driver.id, slotStart, slotEnd, orders: part });
    }
    // 1-Stopp-Kleinsttouren vermeiden: Auftrag in eine andere Gruppe des Fensters mit freier Kapazität legen
    for (const g of windowGroups) {
      if (g.orders.length !== 1) continue;
      const c = orderCrates(g.orders[0]);
      const target = windowGroups
        .filter((x) => x !== g && x.orders.length > 0 && x.orders.length < MAX_STOPS_PER_TOUR && groupCrates(x.orders) + c <= capacityById(x.driverId))
        .sort((a, b) => groupCrates(a.orders) - groupCrates(b.orders))[0];
      if (!target) continue;
      target.orders.push(g.orders[0]);
      g.orders = [];
      load[g.driverId] -= 1;
    }
    groups.push(...windowGroups.filter((g) => g.orders.length > 0));
  }
  return groups;
}

/** Günstigste Einfügeposition (Luftlinie) eines Punkts in eine bestehende Rundfahrt start → points → start */
export function cheapestInsertion(start: GeoPoint, points: readonly GeoPoint[], extra: GeoPoint): number {
  let best = points.length;
  let bestCost = Infinity;
  for (let i = 0; i <= points.length; i++) {
    const a = i === 0 ? start : points[i - 1];
    const b = i === points.length ? start : points[i];
    const cost = haversine(a, extra) + haversine(extra, b) - haversine(a, b);
    if (cost < bestCost - 1e-9) {
      bestCost = cost;
      best = i;
    }
  }
  return best;
}

function angleOf(store: GeoPoint, order: Order): number {
  if (!order.address) return 0;
  return bearing(store, order.address);
}
