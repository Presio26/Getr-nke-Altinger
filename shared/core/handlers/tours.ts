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
  isStopDone,
  nextOpenStopIndex,
  orderPoint,
  recomputeEtas,
  storePoint,
  tourOrders,
  withOrders,
} from '../tourOps';
import { emitOrder, emitTour } from '../notify';
import { distributeOrders, optimizeSequence } from '../planning';
import { DAY_RE, firstName, TIME_RE } from '../util';

function tourNumberFor(e: Engine, date: string): number {
  return e.db.tours.filter((t) => t.date === date).length + 1;
}

function assertNotSimulating(tour: Tour): void {
  if (tour.simulation?.running) throw new ApiError('conflict', 'Bitte stoppen Sie zuerst die Simulation dieser Tour.');
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
      if (typeof date !== 'string' || !DAY_RE.test(date)) throw new ApiError('validation', 'Bitte geben Sie ein gültiges Datum an.');
      return e.db.tours
        .filter((t) => t.date === date || (t.status === 'active' && t.date < date))
        .sort((a, b) => (a.plannedStart ?? '').localeCompare(b.plannedStart ?? '') || a.name.localeCompare(b.name))
        .map((t) => withOrders(e, t));
    },

    async adminSaveTour(ctx, input) {
      const user = requireAdmin(ctx);
      if (!input || typeof input !== 'object') throw new ApiError('validation', 'Ungültige Tourdaten.');
      if (typeof input.date !== 'string' || !DAY_RE.test(input.date)) throw new ApiError('validation', 'Bitte geben Sie ein gültiges Datum an.');
      if (input.plannedStart !== undefined && input.plannedStart !== '' && !TIME_RE.test(String(input.plannedStart))) {
        throw new ApiError('validation', 'Bitte geben Sie eine gültige Startzeit (HH:MM) an.');
      }
      const driver = findDriver(e, input.driverId);
      const orderIds = Array.isArray(input.orderIds) ? [...new Set(input.orderIds.filter((x) => typeof x === 'string'))] : [];
      const existing = input.id ? findTour(e, input.id) : undefined;
      if (existing?.status === 'completed') throw new ApiError('conflict', 'Abgeschlossene Touren können nicht mehr geändert werden.');
      if (existing) assertNotSimulating(existing);
      if (existing?.status === 'active' && existing.driverId !== driver.id) {
        throw new ApiError('conflict', 'Der Fahrer einer laufenden Tour kann nicht gewechselt werden.');
      }

      const validate = (): Order[] =>
        orderIds.map((id) => {
          const o = findOrder(e, id);
          const inThis = !!existing && existing.stops.some((s) => s.orderId === id);
          if (o.fulfillment !== 'delivery') throw new ApiError('validation', `${o.number} ist eine Abholung und kann nicht ausgeliefert werden.`);
          if (o.status === 'cancelled') throw new ApiError('validation', `${o.number} wurde storniert.`);
          if (!inThis && !OPEN_STATUSES.includes(o.status)) {
            throw new ApiError('conflict', `${o.number} kann nicht mehr eingeplant werden (${orderStatusText(o)}).`);
          }
          if (!orderPoint(o)) throw new ApiError('validation', `Für ${o.number} fehlen die Koordinaten der Lieferadresse.`);
          if (o.tourId && o.tourId !== existing?.id) {
            const other = e.db.tours.find((t) => t.id === o.tourId);
            if (other?.simulation?.running) throw new ApiError('conflict', `„${other.name}“ wird gerade simuliert – bitte zuerst stoppen.`);
          }
          return o;
        });
      validate();
      if (existing?.status === 'active') {
        for (const s of existing.stops) {
          if (orderIds.includes(s.orderId)) continue;
          const o = e.db.orders.find((x) => x.id === s.orderId);
          if (isStopDone(s) || s.status === 'arrived' || o?.status === 'out_for_delivery') {
            throw new ApiError('conflict', `${o?.number ?? 'Ein Auftrag'} ist bereits unterwegs bzw. zugestellt und kann nicht entfernt werden.`);
          }
        }
      }

      const points = orderIds.map((id) => orderPoint(findOrder(e, id)) as GeoPoint);
      const route = await computeRoute(e, points);

      // ── nach dem await: erneut prüfen und übernehmen ──
      const orders = validate();
      const now = ctx.now;
      let tour = existing ? e.db.tours.find((t) => t.id === existing.id) : undefined;
      if (existing && !tour) throw new ApiError('not_found', 'Die Tour wurde nicht gefunden.');
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
      const allPoints = stops.map((s) => orderPoint(findOrder(e, s.orderId)) as GeoPoint);
      const route = await computeRoute(e, allPoints);
      const current = findTour(e, tourId);
      const sameSet =
        current.stops.length === stops.length && current.stops.every((s) => stops.some((x) => x.orderId === s.orderId));
      if (!sameSet) throw new ApiError('conflict', 'Die Tour wurde zwischenzeitlich geändert. Bitte erneut versuchen.');
      assertNotSimulating(current);
      const byId = new Map(current.stops.map((s) => [s.orderId, s]));
      applyStops(e, current, stops.map((s) => byId.get(s.orderId) ?? s), route, ctx.now);
      for (const o of tourOrders(e, current)) emitOrder(e, o);
      emitTour(e, current);
      return current;
    },

    async adminAutoPlanTours(ctx, date) {
      requireAdmin(ctx);
      if (typeof date !== 'string' || !DAY_RE.test(date)) throw new ApiError('validation', 'Bitte geben Sie ein gültiges Datum an.');
      const drivers = e.db.drivers.filter((d) => d.status !== 'off');
      if (!drivers.length) {
        throw new ApiError('validation', 'Es ist kein Fahrer im Dienst. Bitte setzen Sie mindestens einen Fahrer auf „Verfügbar“.');
      }
      const isOpen = (o: Order) =>
        o.fulfillment === 'delivery' && o.slot.date === date && !o.tourId && OPEN_STATUSES.includes(o.status) && !!orderPoint(o);
      const open = e.db.orders.filter(isOpen);
      if (!open.length) return [];
      const perDriver: Record<string, number> = {};
      for (const t of e.db.tours) if (t.date === date) perDriver[t.driverId] = (perDriver[t.driverId] ?? 0) + 1;
      const store = storePoint(e);
      const groups = distributeOrders(store, open, drivers, perDriver);

      const planned: { driverId: string; slotStart: string; slotEnd: string; orders: Order[]; route: NonNullable<Tour['route']> }[] = [];
      for (const g of groups) {
        const points = g.orders.map((o) => orderPoint(o) as GeoPoint);
        const seq = optimizeSequence(store, points, store);
        const ordered = seq.map((i) => g.orders[i]);
        const route = await computeRoute(e, ordered.map((o) => orderPoint(o) as GeoPoint));
        planned.push({ ...g, orders: ordered, route });
      }

      // ── nach den awaits übernehmen (nur Aufträge, die noch frei sind) ──
      const created: TourWithOrders[] = [];
      for (const p of planned) {
        const orders = p.orders.map((o) => e.db.orders.find((x) => x.id === o.id)).filter((o): o is Order => !!o && isOpen(o));
        if (!orders.length) continue;
        let route = p.route;
        if (orders.length !== p.orders.length) route = await computeRoute(e, orders.map((o) => orderPoint(o) as GeoPoint));
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
      return created;
    },
  };
}
