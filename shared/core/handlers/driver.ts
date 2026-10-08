/**
 * Fahrer-App: Tagesübersicht, Status, Tourablauf, GPS, Zustellung, Demo-Simulation.
 */
import { ApiError, type CoreHandlers } from '../../api';
import type { DriverStatus, GeoPosition, Tour } from '../../types';
import type { Engine } from '../engine';
import { actorLabel, findTour, requireDriver, requireRole, requireTourAccess, requireVisibleOrder } from '../access';
import { emitDriver, emitTour } from '../notify';
import {
  activeTourOf,
  arriveOp,
  completeOp,
  computeRoute,
  driverTours,
  failOp,
  finishTourOp,
  orderPoint,
  publishPosition,
  recomputeEtas,
  sanitizeProof,
  startTourOp,
  tourOrders,
  withOrders,
} from '../tourOps';
import { initSimulation, SIM_DEFAULT_SPEED_FACTOR } from '../simulator';
import { clamp } from '../util';

const DRIVER_STATUSES: DriverStatus[] = ['off', 'available', 'on_tour', 'break'];

/** Route nachrechnen, falls sie fehlt oder nicht zu den Stopps passt */
export async function ensureRoute(e: Engine, tour: Tour): Promise<void> {
  if (tour.route && tour.route.legs.length === tour.stops.length + 1) return;
  const points = tourOrders(e, tour)
    .map((o) => orderPoint(o))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const route = await computeRoute(e, points);
  const current = e.db.tours.find((t) => t.id === tour.id);
  if (current && current.stops.length === points.length) current.route = route;
}

export function driverHandlers(
  e: Engine,
): Pick<
  CoreHandlers,
  | 'getDriverToday'
  | 'setDriverStatus'
  | 'startTour'
  | 'finishTour'
  | 'updateDriverPosition'
  | 'arriveAtStop'
  | 'completeDelivery'
  | 'failDelivery'
  | 'simulateTour'
  | 'stopSimulation'
> {
  return {
    getDriverToday(ctx) {
      const { driver } = requireDriver(e, ctx);
      return { driver, tours: driverTours(e, driver.id, ctx.now).map((t) => withOrders(e, t)) };
    },

    setDriverStatus(ctx, status) {
      const { driver } = requireDriver(e, ctx);
      if (!DRIVER_STATUSES.includes(status)) throw new ApiError('validation', 'Ungültiger Fahrerstatus.');
      const active = activeTourOf(e, driver.id);
      if (active && status !== 'on_tour' && status !== 'break') {
        throw new ApiError('conflict', `Bitte schließen Sie zuerst „${active.name}“ ab.`);
      }
      driver.status = status;
      emitDriver(e, driver);
      return driver;
    },

    async startTour(ctx, tourId) {
      const tour = findTour(e, tourId);
      const user = requireTourAccess(e, ctx, tour);
      if (tour.status === 'completed') throw new ApiError('conflict', 'Diese Tour ist bereits abgeschlossen.');
      if (tour.status === 'active') return tour;
      await ensureRoute(e, tour);
      const current = findTour(e, tourId);
      startTourOp(e, current, ctx.now, actorLabel(e, user));
      return current;
    },

    finishTour(ctx, tourId) {
      const tour = findTour(e, tourId);
      requireTourAccess(e, ctx, tour);
      finishTourOp(e, tour, ctx.now);
      return tour;
    },

    updateDriverPosition(ctx, position) {
      const { driver } = requireDriver(e, ctx);
      const lat = Number(position?.lat);
      const lng = Number(position?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw new ApiError('validation', 'Ungültige GPS-Position.');
      }
      // Während einer laufenden Demo-Simulation hat die simulierte Position Vorrang
      const active = activeTourOf(e, driver.id);
      if (active?.simulation?.running) return;
      const pos: GeoPosition = { lat, lng, timestamp: ctx.now.toISOString(), simulated: false };
      const ts = typeof position.timestamp === 'string' ? Date.parse(position.timestamp) : NaN;
      if (Number.isFinite(ts) && Math.abs(ts - ctx.now.getTime()) < 10 * 60_000) pos.timestamp = new Date(ts).toISOString();
      for (const key of ['heading', 'speed', 'accuracy'] as const) {
        const v = Number(position[key]);
        if (position[key] !== undefined && position[key] !== null && Number.isFinite(v) && v >= 0) pos[key] = Math.round(v * 10) / 10;
      }
      publishPosition(e, driver, pos);
    },

    arriveAtStop(ctx, orderId) {
      const { user, order } = requireVisibleOrder(e, ctx, orderId);
      requireRole(ctx, 'driver', 'admin');
      arriveOp(e, order, ctx.now, actorLabel(e, user));
      return order;
    },

    completeDelivery(ctx, orderId, proofInput) {
      const { user, order } = requireVisibleOrder(e, ctx, orderId);
      requireRole(ctx, 'driver', 'admin');
      const proof = sanitizeProof(e, proofInput, ctx.now, order.emptiesReturn);
      completeOp(e, order, proof, ctx.now, actorLabel(e, user));
      return order;
    },

    failDelivery(ctx, orderId, reason) {
      const { user, order } = requireVisibleOrder(e, ctx, orderId);
      requireRole(ctx, 'driver', 'admin');
      const text = typeof reason === 'string' ? reason.trim().slice(0, 300) : '';
      if (!text) throw new ApiError('validation', 'Bitte geben Sie einen Grund an.');
      failOp(e, order, text, ctx.now, actorLabel(e, user));
      return order;
    },

    async simulateTour(ctx, tourId, options) {
      const tour = findTour(e, tourId);
      const user = requireTourAccess(e, ctx, tour);
      if (tour.status === 'completed') throw new ApiError('conflict', 'Diese Tour ist bereits abgeschlossen.');
      await ensureRoute(e, tour);
      const current = findTour(e, tourId);
      const speedFactor = clamp(Number(options?.speedFactor ?? current.simulation?.speedFactor ?? SIM_DEFAULT_SPEED_FACTOR) || SIM_DEFAULT_SPEED_FACTOR, 0.5, 50);
      const autoComplete = options?.autoComplete ?? current.simulation?.autoComplete ?? true;
      if (current.status === 'planned') {
        // Simulation vor dem Start setzen, damit ETAs (und die „unterwegs“-Nachricht) den Zeitraffer berücksichtigen
        const previous = current.simulation;
        current.simulation = { running: true, speedFactor, autoComplete: !!autoComplete, legIndex: 0, progressM: 0, lastTickAt: ctx.now.toISOString() };
        try {
          startTourOp(e, current, ctx.now, actorLabel(e, user));
        } catch (err) {
          if (previous) current.simulation = previous;
          else delete current.simulation;
          throw err;
        }
      }
      initSimulation(e, current, ctx.now, { speedFactor, autoComplete: !!autoComplete });
      recomputeEtas(e, current, ctx.now, { emitOrders: true });
      emitTour(e, current);
      return current;
    },

    stopSimulation(ctx, tourId) {
      const tour = findTour(e, tourId);
      requireTourAccess(e, ctx, tour);
      if (tour.simulation?.running) {
        tour.simulation.running = false;
        if (tour.status === 'active') recomputeEtas(e, tour, ctx.now, { emitOrders: true });
        emitTour(e, tour);
      }
      return tour;
    },
  };
}
