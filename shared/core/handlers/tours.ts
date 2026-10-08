/**
 * Disposition: Touren anlegen/ändern/löschen, Reihenfolge optimieren, automatisch planen.
 */
import { ApiError, type CoreHandlers } from '../../api';
import type { GeoPoint, Order, Tour, TourStop, TourWithOrders } from '../../types';
import type { Engine } from '../engine';
import { nextId } from '../db';
import { actorLabel, findDriver, findOrder, findTour, requireAdmin } from '../access';
import { OPEN_STATUSES, orderStatusText } from './tourHelpers';
import {
  computeRoute,
  detachOrderFromTour,
  dispatchOrder,
  estimateStopEtas,
  isStopDone,
  nextOpenStopIndex,
  orderPoint,
  pruneRoute,
  recomputeEtas,
  storePoint,
  summarizeRoute,
  tourOrders,
  withOrders,
} from '../tourOps';
import { straightLineLeg } from '../routing';
import { formatDate } from '../../format';
import { emitOrder, emitTour } from '../notify';
import { cheapestInsertion, distributeOrders, MAX_STOPS_PER_TOUR, optimizeSequence, orderCrates } from '../planning';
import { clone, firstName, TIME_RE } from '../util';
import { isDayString } from '../../time';

/** Status, die die automatische Planung disponiert (unbestätigte Aufträge nicht) */
export const AUTO_PLAN_STATUSES: Order['status'][] = ['confirmed', 'picking', 'ready'];

/** Vorschau-Tour mit Kopien der Aufträge (Tour-Zuordnung und ETA nur in der Kopie) */
function previewWithOrders(e: Engine, tour: Tour, orders: Order[], now: Date): TourWithOrders {
  const etas = estimateStopEtas(e, tour, now);
  tour.stops.forEach((st, i) => {
    const ms = etas[i];
    if (ms !== undefined) st.eta = new Date(Math.round(ms / 1000) * 1000).toISOString();
  });
  const copies = orders.map((o) => {
    const c = clone(o);
    c.tourId = tour.id;
    c.driverId = tour.driverId;
    const eta = tour.stops.find((st) => st.orderId === o.id)?.eta;
    if (eta) c.eta = eta;
    return c;
  });
  const out: TourWithOrders = { ...tour, orders: copies };
  const driver = e.db.drivers.find((d) => d.id === tour.driverId);
  if (driver) out.driver = driver;
  return out;
}

function tourNumberFor(e: Engine, date: string): number {
  return e.db.tours.filter((t) => t.date === date).length + 1;
}

function assertNotSimulating(tour: Tour): void {
  if (tour.simulation?.running) throw new ApiError('conflict', 'Bitte stoppen Sie zuerst die Simulation dieser Tour.');
}

/** Mindest-Ersparnis, ab der eine neue Reihenfolge übernommen wird (Fahrer und Kunden behalten sonst ihren Plan) */
export const MIN_OPTIMIZE_GAIN = 0.02;

/**
 * Ist die neue Route wirklich besser? Mindestens 2 % kürzer (Strecke oder Fahrzeit), ohne dass der andere
 * Wert spürbar schlechter wird. Gleich lange oder längere Routen werden nie übernommen.
 */
export function isRouteImprovement(candidate: Pick<NonNullable<Tour['route']>, 'distance' | 'duration'>, current: Pick<NonNullable<Tour['route']>, 'distance' | 'duration'>): boolean {
  const shorter = (a: number, b: number) => b > 0 && a <= b * (1 - MIN_OPTIMIZE_GAIN);
  const notWorse = (a: number, b: number) => a <= b * 1.01 + 1;
  return (
    (shorter(candidate.distance, current.distance) && notWorse(candidate.duration, current.duration)) ||
    (shorter(candidate.duration, current.duration) && notWorse(candidate.distance, current.distance))
  );
}

/** Stopps neu ordnen und Route/ETAs übernehmen */
function applyStops(e: Engine, tour: Tour, stops: TourStop[], route: NonNullable<Tour['route']>, now: Date): void {
  tour.stops = stops;
  tour.route = route;
  tour.currentStopIndex = tour.status === 'active' ? nextOpenStopIndex(tour) : 0;
  if (tour.simulation) {
    tour.simulation.legIndex = Math.min(tour.currentStopIndex, tour.stops.length);
    tour.simulation.progressM = 0;
    delete tour.simulation.dwellUntil;
  }
  recomputeEtas(e, tour, now);
}

export function tourHandlers(
  e: Engine,
): Pick<CoreHandlers, 'adminListTours' | 'adminSaveTour' | 'adminDeleteTour' | 'adminOptimizeTour' | 'adminAutoPlanTours'> {
  return {
    adminListTours(ctx, date) {
      requireAdmin(ctx);
      if (!isDayString(date)) throw new ApiError('validation', 'Bitte geben Sie ein gültiges Datum an.');
      return e.db.tours
        .filter((t) => t.date === date || (t.status === 'active' && t.date < date))
        .sort((a, b) => (a.plannedStart ?? '').localeCompare(b.plannedStart ?? '') || a.name.localeCompare(b.name))
        .map((t) => withOrders(e, t));
    },

    async adminSaveTour(ctx, input) {
      const user = requireAdmin(ctx);
      if (!input || typeof input !== 'object') throw new ApiError('validation', 'Ungültige Tourdaten.');
      if (!isDayString(input.date)) throw new ApiError('validation', 'Bitte geben Sie ein gültiges Datum an.');
      if (input.plannedStart !== undefined && input.plannedStart !== '' && !TIME_RE.test(String(input.plannedStart))) {
        throw new ApiError('validation', 'Bitte geben Sie eine gültige Startzeit (HH:MM) an.');
      }
      const driver = findDriver(e, input.driverId);
      const orderIds = Array.isArray(input.orderIds) ? [...new Set(input.orderIds.filter((x) => typeof x === 'string'))] : [];
      const existing = input.id ? findTour(e, input.id) : undefined;

      /** Prüfungen gegen den aktuellen Stand – vor UND nach dem await (Tour/Aufträge können sich inzwischen ändern) */
      const check = (current: Tour | undefined): Order[] => {
        if (current?.status === 'completed') throw new ApiError('conflict', 'Abgeschlossene Touren können nicht mehr geändert werden.');
        if (current) assertNotSimulating(current);
        if (current?.status === 'active' && current.driverId !== driver.id) {
          throw new ApiError('conflict', 'Der Fahrer einer laufenden Tour kann nicht gewechselt werden.');
        }
        const orders = orderIds.map((id) => {
          const o = findOrder(e, id);
          const inThis = !!current && current.stops.some((s) => s.orderId === id);
          if (o.fulfillment !== 'delivery') throw new ApiError('validation', `${o.number} ist eine Abholung und kann nicht ausgeliefert werden.`);
          if (o.status === 'cancelled') throw new ApiError('validation', `${o.number} wurde storniert.`);
          if (!inThis && !OPEN_STATUSES.includes(o.status)) {
            throw new ApiError('conflict', `${o.number} kann nicht mehr eingeplant werden (${orderStatusText(o)}).`);
          }
          // Tourdatum = Liefertag (wie bei der automatischen Planung) – sonst ginge Ware für morgen heute los
          if (o.slot.date !== input.date) {
            throw new ApiError(
              'conflict',
              `${o.number} ist für den ${formatDate(o.slot.date, 'short')} bestellt und passt nicht zu einer Tour am ${formatDate(input.date, 'short')}.`,
            );
          }
          if (!orderPoint(o)) throw new ApiError('validation', `Für ${o.number} fehlen die Koordinaten der Lieferadresse.`);
          if (o.tourId && o.tourId !== current?.id) {
            const other = e.db.tours.find((t) => t.id === o.tourId);
            if (other?.simulation?.running) throw new ApiError('conflict', `„${other.name}“ wird gerade simuliert – bitte zuerst stoppen.`);
          }
          return o;
        });
        if (current?.status === 'active') {
          for (const s of current.stops) {
            if (orderIds.includes(s.orderId)) continue;
            const o = e.db.orders.find((x) => x.id === s.orderId);
            if (isStopDone(s) || s.status === 'arrived' || o?.status === 'out_for_delivery') {
              throw new ApiError('conflict', `${o?.number ?? 'Ein Auftrag'} ist bereits unterwegs bzw. zugestellt und kann nicht entfernt werden.`);
            }
          }
        }
        return orders;
      };
      check(existing);

      const points = orderIds.map((id) => orderPoint(findOrder(e, id)) as GeoPoint);
      const route = await computeRoute(e, points);

      // ── nach dem await: alles erneut gegen den aktuellen Stand prüfen und übernehmen ──
      const now = ctx.now;
      let tour = existing ? e.db.tours.find((t) => t.id === existing.id) : undefined;
      if (existing && !tour) throw new ApiError('not_found', 'Die Tour wurde nicht gefunden.');
      const orders = check(tour);
      if (!tour) {
        tour = {
          id: nextId(e.db, 't'),
          name: '',
          date: input.date,
          driverId: driver.id,
          status: 'planned',
          stops: [],
          currentStopIndex: 0,
        };
        tour.name = `Tour ${tourNumberFor(e, input.date)} · ${firstName(driver.name)}`;
        e.db.tours.push(tour);
      }
      const t = tour;
      if (typeof input.name === 'string' && input.name.trim()) t.name = input.name.trim().slice(0, 80);
      t.date = input.date;
      t.driverId = driver.id;
      if (input.plannedStart) t.plannedStart = input.plannedStart;
      else if (input.plannedStart === '') delete t.plannedStart;

      // entfernte Aufträge lösen
      for (const s of [...t.stops]) {
        if (orderIds.includes(s.orderId)) continue;
        const o = e.db.orders.find((x) => x.id === s.orderId);
        if (o) {
          delete o.tourId;
          delete o.eta;
          if (OPEN_STATUSES.includes(o.status)) delete o.driverId;
          emitOrder(e, o);
        }
      }
      // aus anderen Touren lösen
      for (const o of orders) {
        if (o.tourId && o.tourId !== t.id) detachOrderFromTour(e, o, { now });
      }
      const oldStops = new Map(t.stops.map((s) => [s.orderId, s]));
      const stops = orderIds.map((id): TourStop => oldStops.get(id) ?? { orderId: id, status: 'pending' });
      for (const o of orders) {
        o.tourId = t.id;
        o.driverId = driver.id;
        o.updatedAt = now.toISOString();
      }
      applyStops(e, t, stops, route, now);
      if (t.status === 'active') {
        for (const o of orders) dispatchOrder(e, t, o, now, actorLabel(e, user), driver);
      }
      for (const o of orders) emitOrder(e, o);
      emitTour(e, t);
      return t;
    },

    adminDeleteTour(ctx, tourId) {
      requireAdmin(ctx);
      const tour = findTour(e, tourId);
      if (tour.status === 'active') throw new ApiError('conflict', 'Eine laufende Tour kann nicht gelöscht werden.');
      if (tour.status === 'completed') throw new ApiError('conflict', 'Abgeschlossene Touren bleiben zur Dokumentation erhalten.');
      for (const o of tourOrders(e, tour)) {
        delete o.tourId;
        delete o.eta;
        if (OPEN_STATUSES.includes(o.status)) delete o.driverId;
        o.updatedAt = ctx.now.toISOString();
        emitOrder(e, o);
      }
      e.db.tours = e.db.tours.filter((t) => t.id !== tour.id);
      e.emit({ type: 'tour.deleted', tourId: tour.id }, { admin: true, driverIds: [tour.driverId] });
    },

    async adminOptimizeTour(ctx, tourId) {
      requireAdmin(ctx);
      const tour = findTour(e, tourId);
      if (tour.status === 'completed') throw new ApiError('conflict', 'Abgeschlossene Touren können nicht mehr optimiert werden.');
      assertNotSimulating(tour);
      const fixed = tour.stops.filter((s) => isStopDone(s) || s.status === 'arrived');
      const open = tour.stops.filter((s) => s.status === 'pending');
      const openOrders = open.map((s) => findOrder(e, s.orderId));
      const openPoints = openOrders.map((o) => orderPoint(o) as GeoPoint);
      const store = storePoint(e);
      let start: GeoPoint = store;
      const lastFixed = fixed[fixed.length - 1];
      if (lastFixed) start = orderPoint(findOrder(e, lastFixed.orderId)) ?? store;
      const driver = e.db.drivers.find((d) => d.id === tour.driverId);
      if (tour.status === 'active' && driver?.position && !fixed.some((s) => s.status === 'arrived')) start = driver.position;
      const seq = optimizeSequence(start, openPoints, store);
      const stops = [...fixed, ...seq.map((i) => open[i])];
      // gleiche Reihenfolge → nichts zu tun (Route und ETAs bleiben)
      if (stops.every((s, i) => s.orderId === tour.stops[i]?.orderId)) return tour;

      // Beide Reihenfolgen mit demselben Routing-Dienst rechnen und nur übernehmen, was wirklich kürzer ist
      const pointsOf = (list: TourStop[]) => list.map((s) => orderPoint(findOrder(e, s.orderId)) as GeoPoint);
      const [candidate, currentRoute] = await Promise.all([computeRoute(e, pointsOf(stops)), computeRoute(e, pointsOf(tour.stops))]);
      const current = findTour(e, tourId);
      const sameSet =
        current.stops.length === stops.length && current.stops.every((s) => stops.some((x) => x.orderId === s.orderId));
      if (!sameSet) throw new ApiError('conflict', 'Die Tour wurde zwischenzeitlich geändert. Bitte erneut versuchen.');
      assertNotSimulating(current);
      if (!isRouteImprovement(candidate, currentRoute)) {
        // bisherige Reihenfolge ist (praktisch) optimal – nichts umstellen, Kunden behalten ihre Ankunftszeiten
        return current;
      }
      const byId = new Map(current.stops.map((s) => [s.orderId, s]));
      applyStops(e, current, stops.map((s) => byId.get(s.orderId) ?? s), candidate, ctx.now);
      for (const o of tourOrders(e, current)) emitOrder(e, o);
      emitTour(e, current);
      return current;
    },

    async adminAutoPlanTours(ctx, date, options) {
      requireAdmin(ctx);
      if (!isDayString(date)) throw new ApiError('validation', 'Bitte geben Sie ein gültiges Datum an.');
      const preview = options?.preview === true;
      const drivers = e.db.drivers.filter((d) => d.status !== 'off');
      if (!drivers.length) {
        throw new ApiError('validation', 'Es ist kein Fahrer im Dienst. Bitte setzen Sie mindestens einen Fahrer auf „Verfügbar“.');
      }
      // nur bestätigte Aufträge disponieren (unbestätigte erst nach der Bestätigung durch den Markt)
      const isOpen = (o: Order) =>
        o.fulfillment === 'delivery' && o.slot.date === date && !o.tourId && AUTO_PLAN_STATUSES.includes(o.status) && !!orderPoint(o);
      const open = e.db.orders.filter(isOpen).sort((a, b) => a.slot.start.localeCompare(b.slot.start) || a.number.localeCompare(b.number));
      if (!open.length) return [];
      const dayTours = e.db.tours.filter((t) => t.date === date && t.status !== 'completed');
      const perDriver: Record<string, number> = {};
      for (const t of dayTours) perDriver[t.driverId] = (perDriver[t.driverId] ?? 0) + 1;
      // Fahrer, die im jeweiligen Fenster schon eine Tour haben
      const windows = [...new Set(open.map((o) => `${o.slot.start}-${o.slot.end}`))];
      const inWindow = (t: Tour, key: string) => {
        const [ws, we] = key.split('-');
        return !!t.plannedStart && t.plannedStart >= ws && t.plannedStart < we;
      };
      const busyByWindow: Record<string, string[]> = {};
      for (const key of windows) busyByWindow[key] = dayTours.filter((t) => inWindow(t, key)).map((t) => t.driverId);
      const store = storePoint(e);
      const groups = distributeOrders(store, open, drivers, perDriver, busyByWindow);

      // Einzelaufträge an eine bestehende, noch geplante Tour im selben Fenster hängen, wenn dort Platz ist
      const extensions = new Map<string, Order[]>();
      const extendable = (t: Tour, key: string, add: Order) => {
        if (t.status !== 'planned' || t.simulation?.running || !inWindow(t, key)) return false;
        const driver = e.db.drivers.find((d) => d.id === t.driverId);
        if (!driver || driver.status === 'off') return false;
        const added = extensions.get(t.id) ?? [];
        const crates = [...tourOrders(e, t), ...added].reduce((sum, o) => sum + orderCrates(o), 0);
        return t.stops.length + added.length < MAX_STOPS_PER_TOUR && crates + orderCrates(add) <= (driver.capacityCrates || 60);
      };
      const newGroups = groups.filter((g) => {
        if (g.orders.length !== 1) return true;
        const key = `${g.slotStart}-${g.slotEnd}`;
        const target = dayTours
          .filter((t) => extendable(t, key, g.orders[0]))
          .sort((a, b) => a.stops.length - b.stops.length || a.name.localeCompare(b.name))[0];
        if (!target) return true;
        extensions.set(target.id, [...(extensions.get(target.id) ?? []), g.orders[0]]);
        return false;
      });

      // ── Routen (Netzwerk) ──
      const planned: { driverId: string; slotStart: string; slotEnd: string; orders: Order[]; route: NonNullable<Tour['route']> }[] = [];
      for (const g of newGroups) {
        const points = g.orders.map((o) => orderPoint(o) as GeoPoint);
        const seq = optimizeSequence(store, points, store);
        const ordered = seq.map((i) => g.orders[i]);
        const route = await computeRoute(e, ordered.map((o) => orderPoint(o) as GeoPoint));
        planned.push({ ...g, orders: ordered, route });
      }
      const extended: { tourId: string; stopIds: string[]; added: Order[]; route: NonNullable<Tour['route']> }[] = [];
      for (const [tourId, added] of extensions) {
        const t = e.db.tours.find((x) => x.id === tourId);
        if (!t) continue;
        const ids = t.stops.map((x) => x.orderId);
        const pts = tourOrders(e, t).map((o) => orderPoint(o) as GeoPoint);
        for (const o of added) {
          const pos = cheapestInsertion(store, pts, orderPoint(o) as GeoPoint);
          ids.splice(pos, 0, o.id);
          pts.splice(pos, 0, orderPoint(o) as GeoPoint);
        }
        extended.push({ tourId, stopIds: ids, added, route: await computeRoute(e, pts) });
      }

      // ── Vorschau: gleiche Planung, nichts wird gespeichert ──
      if (preview) {
        const out: TourWithOrders[] = [];
        let number = tourNumberFor(e, date);
        for (const [i, p] of planned.entries()) {
          const driver = e.db.drivers.find((d) => d.id === p.driverId);
          if (!driver) continue;
          const tour: Tour = {
            id: `vorschau-${i + 1}`,
            name: `Tour ${number++} · ${p.slotStart}–${p.slotEnd} · ${firstName(driver.name)}`,
            date,
            driverId: driver.id,
            status: 'planned',
            stops: p.orders.map((o) => ({ orderId: o.id, status: 'pending' })),
            route: p.route,
            currentStopIndex: 0,
            plannedStart: p.slotStart,
          };
          out.push(previewWithOrders(e, tour, p.orders, ctx.now));
        }
        for (const x of extended) {
          const t = e.db.tours.find((y) => y.id === x.tourId);
          if (!t) continue;
          const byId = new Map(t.stops.map((st) => [st.orderId, st]));
          const tour: Tour = {
            ...clone(t),
            stops: x.stopIds.map((id) => clone(byId.get(id)) ?? { orderId: id, status: 'pending' }),
            route: x.route,
          };
          const orders = x.stopIds.map((id) => e.db.orders.find((o) => o.id === id)).filter((o): o is Order => !!o);
          out.push(previewWithOrders(e, tour, orders, ctx.now));
        }
        return out;
      }

      // ── nach den awaits übernehmen (nur Aufträge, die noch frei sind) ──
      // Ab hier KEIN await mehr: Prüfen und Anlegen müssen ohne Unterbrechung laufen, sonst könnte ein
      // paralleler Aufruf denselben Auftrag zwischendurch in eine andere Tour legen.
      const created: TourWithOrders[] = [];
      for (const p of planned) {
        const current = p.orders.map((o) => e.db.orders.find((x) => x.id === o.id));
        const keep = current.map((o) => !!o && isOpen(o));
        const orders = current.filter((o, i): o is Order => !!o && keep[i]);
        if (!orders.length) continue;
        let route = p.route;
        if (orders.length !== p.orders.length) {
          // Route ohne Netzwerk kürzen (Abschnitte verbinden), notfalls Luftlinie
          const points = [store, ...orders.map((o) => orderPoint(o) as GeoPoint), store];
          route = pruneRoute(p.route, keep) ?? summarizeRoute(points.slice(1).map((pt, i) => straightLineLeg(points[i], pt)));
        }
        const driver = e.db.drivers.find((d) => d.id === p.driverId);
        if (!driver) continue;
        const tour: Tour = {
          id: nextId(e.db, 't'),
          name: `Tour ${tourNumberFor(e, date)} · ${p.slotStart}–${p.slotEnd} · ${firstName(driver.name)}`,
          date,
          driverId: driver.id,
          status: 'planned',
          stops: orders.map((o) => ({ orderId: o.id, status: 'pending' })),
          route,
          currentStopIndex: 0,
          plannedStart: p.slotStart,
        };
        e.db.tours.push(tour);
        for (const o of orders) {
          o.tourId = tour.id;
          o.driverId = driver.id;
          o.updatedAt = ctx.now.toISOString();
        }
        recomputeEtas(e, tour, ctx.now);
        for (const o of orders) emitOrder(e, o);
        emitTour(e, tour);
        created.push(withOrders(e, tour));
      }
      for (const x of extended) {
        const t = e.db.tours.find((y) => y.id === x.tourId);
        // nur, wenn sich die Tour inzwischen nicht verändert hat und die Aufträge noch frei sind
        const before = x.stopIds.filter((id) => !x.added.some((o) => o.id === id));
        if (!t || t.status !== 'planned' || t.simulation?.running || t.stops.length !== before.length || t.stops.some((st, i) => st.orderId !== before[i])) continue;
        const added = x.added.map((o) => e.db.orders.find((y) => y.id === o.id)).filter((o): o is Order => !!o && isOpen(o));
        if (added.length !== x.added.length) continue;
        const byId = new Map(t.stops.map((st) => [st.orderId, st]));
        applyStops(e, t, x.stopIds.map((id): TourStop => byId.get(id) ?? { orderId: id, status: 'pending' }), x.route, ctx.now);
        for (const o of added) {
          o.tourId = t.id;
          o.driverId = t.driverId;
          o.updatedAt = ctx.now.toISOString();
        }
        recomputeEtas(e, t, ctx.now);
        for (const o of tourOrders(e, t)) emitOrder(e, o);
        emitTour(e, t);
        created.push(withOrders(e, t));
      }
      return created;
    },
  };
}
