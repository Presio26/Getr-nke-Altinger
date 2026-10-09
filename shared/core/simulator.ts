/**
 * Demo-Fahrtsimulation entlang der Tour-Route.
 *
 * Fortschritt je Tick = Abschnittsgeschwindigkeit (distance/duration, begrenzt 6–16 m/s)
 * × speedFactor × vergangene Zeit seit dem letzten Tick. Am Ende eines Abschnitts zu Stopp i:
 * „angekommen“ (Kunde wird informiert), Standzeit ~8 s, danach (autoComplete) Zustellung; ohne autoComplete
 * – bzw. an Stopps in `manualOrderIds` (Demo: Annas Stopp) – wird gewartet, bis der Fahrer den Stopp abschließt
 * oder ein Problem meldet; danach fährt die Simulation automatisch weiter. Nach der Rückfahrt endet die Tour.
 */
import type { GeoPosition, LatLng, RouteLeg, Tour } from '../types';
import type { Engine } from './engine';
import { pointAlong, polylineLength, sliceFrom } from './geo';
import { emitTour } from './notify';
import {
  arriveOp,
  completeOp,
  finishTourOp,
  isManualStop,
  isStopDone,
  publishPosition,
  recomputeEtas,
  SIM_DWELL_MS,
  storePoint,
} from './tourOps';
import { clamp } from './util';

/** längster berücksichtigter Zeitschritt (s) – verhindert Sprünge nach Pausen/Neustarts */
export const SIM_MAX_STEP_S = 5;
export const SIM_MIN_SPEED = 6;
export const SIM_MAX_SPEED = 16;
export const SIM_DEFAULT_SPEED_FACTOR = 4;

/** Geschwindigkeit eines Abschnitts in m/s (ohne Zeitraffer) */
export function legSpeed(leg: RouteLeg): number {
  const v = leg.duration > 0 ? leg.distance / leg.duration : 8;
  return clamp(v, SIM_MIN_SPEED, SIM_MAX_SPEED);
}

/** Position nach `progressM` Metern auf einem Abschnitt (progress bezogen auf leg.distance) */
export function positionOnLeg(leg: RouteLeg, progressM: number): { point: LatLng; heading: number } {
  const length = polylineLength(leg.coords);
  const fraction = leg.distance > 0 ? clamp(progressM / leg.distance, 0, 1) : 1;
  const { point, heading } = pointAlong(leg.coords, fraction * length);
  return { point, heading };
}

/** Rest-Linienzug eines Abschnitts ab `progressM` */
export function remainingLegCoords(leg: RouteLeg, progressM: number): LatLng[] {
  const length = polylineLength(leg.coords);
  const fraction = leg.distance > 0 ? clamp(progressM / leg.distance, 0, 1) : 1;
  return sliceFrom(leg.coords, fraction * length);
}

function simPosition(leg: RouteLeg | undefined, progressM: number, speed: number, now: Date, fallback: { lat: number; lng: number }): GeoPosition {
  if (!leg || leg.coords.length === 0) return { ...fallback, heading: 0, speed: 0, timestamp: now.toISOString(), simulated: true };
  const { point, heading } = positionOnLeg(leg, progressM);
  return {
    lat: Math.round(point[0] * 1e7) / 1e7,
    lng: Math.round(point[1] * 1e7) / 1e7,
    heading: Math.round(heading),
    speed: Math.round(speed * 10) / 10,
    accuracy: 5,
    timestamp: now.toISOString(),
    simulated: true,
  };
}

export interface SimStepResult {
  /** Position hat sich geändert (nur Position – kein Strukturwechsel) */
  moved: boolean;
  /** Status von Tour/Aufträgen hat sich geändert → sofort speichern */
  changed: boolean;
}

/** Simulation um einen Schritt vorantreiben */
export function advanceSimulation(e: Engine, tour: Tour, now: Date): SimStepResult {
  const sim = tour.simulation;
  if (!sim?.running) return { moved: false, changed: false };
  const driver = e.db.drivers.find((d) => d.id === tour.driverId);
  if (tour.status !== 'active' || !tour.route || !driver) {
    sim.running = false;
    emitTour(e, tour);
    return { moved: false, changed: true };
  }
  const last = sim.lastTickAt ? Date.parse(sim.lastTickAt) : now.getTime();
  const dt = clamp((now.getTime() - last) / 1000, 0, SIM_MAX_STEP_S);
  sim.lastTickAt = now.toISOString();
  const legs = tour.route.legs;
  const n = tour.stops.length;
  const by = 'Demo-Simulation';

  // ── Warten am Stopp ──
  if (sim.dwellUntil) {
    if (now.getTime() < Date.parse(sim.dwellUntil)) return { moved: false, changed: false };
    const stop = tour.stops[sim.legIndex];
    if (stop && !isStopDone(stop)) {
      // manueller Stopp: warten, bis der Fahrer zustellt oder ein Problem meldet
      if (isManualStop(sim, stop.orderId)) return { moved: false, changed: false };
      const order = e.db.orders.find((o) => o.id === stop.orderId);
      if (order && order.status === 'out_for_delivery') {
        const customer = e.db.customers.find((c) => c.id === order.customerId);
        const amountCollected = order.paymentMethod === 'cash' || order.paymentMethod === 'ec' ? order.totals.total : undefined;
        completeOp(
          e,
          order,
          {
            at: now.toISOString(),
            receivedBy: order.address?.name || customer?.contactName || order.customerName,
            emptiesCollected: order.emptiesReturn.map((l) => ({ ...l })),
            ...(amountCollected !== undefined ? { amountCollected } : {}),
            note: 'Demo-Simulation',
          },
          now,
          by,
        );
      } else {
        // Auftrag nicht (mehr) unterwegs – Stopp überspringen
        stop.status = 'failed';
        stop.doneAt = now.toISOString();
      }
    }
    delete sim.dwellUntil;
    sim.legIndex += 1;
    sim.progressM = 0;
    recomputeEtas(e, tour, now);
    emitTour(e, tour);
    return { moved: false, changed: true };
  }

  // ── Fahren ──
  const leg = legs[sim.legIndex];
  if (!leg) {
    finishTourOp(e, tour, now, { force: true });
    return { moved: false, changed: true };
  }
  const speed = legSpeed(leg) * Math.max(0.1, sim.speedFactor);
  sim.progressM = Math.min(leg.distance, sim.progressM + speed * dt);
  const arrived = sim.progressM >= leg.distance;
  publishPosition(e, driver, simPosition(leg, sim.progressM, arrived ? 0 : speed, now, storePoint(e)));
  if (!arrived) return { moved: true, changed: false };

  if (sim.legIndex < n) {
    const stop = tour.stops[sim.legIndex];
    if (stop && !isStopDone(stop)) {
      const order = e.db.orders.find((o) => o.id === stop.orderId);
      if (stop.status === 'pending' && order?.status === 'out_for_delivery') arriveOp(e, order, now, by);
      sim.dwellUntil = new Date(now.getTime() + SIM_DWELL_MS).toISOString();
    } else {
      sim.legIndex += 1;
      sim.progressM = 0;
    }
    recomputeEtas(e, tour, now);
    emitTour(e, tour);
    return { moved: true, changed: true };
  }
  // Rückfahrt beendet → Tour abschließen
  finishTourOp(e, tour, now, { force: true });
  return { moved: true, changed: true };
}

/** Startpunkt der Simulation für eine (ggf. teilweise erledigte) aktive Tour setzen */
export function initSimulation(
  e: Engine,
  tour: Tour,
  now: Date,
  options: { speedFactor: number; autoComplete: boolean; manualOrderIds?: string[] },
): void {
  const prev = tour.simulation;
  const current = Math.min(tour.currentStopIndex, tour.stops.length);
  // Der frühere Fortschritt gilt nur, wenn er nicht hinter dem aktuellen Stopp liegt (inzwischen manuell
  // zugestellte Stopps würden sonst erneut abgefahren, der Marker spränge zurück)
  const resume = !!prev && prev.legIndex <= tour.stops.length && prev.legIndex >= current;
  const sim: NonNullable<Tour['simulation']> = {
    running: true,
    speedFactor: options.speedFactor,
    autoComplete: options.autoComplete,
    legIndex: resume && prev ? prev.legIndex : current,
    progressM: resume && prev ? prev.progressM : 0,
    lastTickAt: now.toISOString(),
  };
  const manual = options.manualOrderIds ?? prev?.manualOrderIds;
  if (manual?.length) sim.manualOrderIds = [...manual];
  if (resume && prev?.dwellUntil) sim.dwellUntil = prev.dwellUntil;
  // Ein bereits „angekommener“ Stopp wartet am Ziel des Abschnitts
  const stop = tour.stops[sim.legIndex];
  const leg = tour.route?.legs[sim.legIndex];
  if (stop && stop.status === 'arrived' && leg) {
    sim.progressM = leg.distance;
    sim.dwellUntil = sim.dwellUntil ?? new Date(now.getTime() + SIM_DWELL_MS).toISOString();
  }
  tour.simulation = sim;
  const driver = e.db.drivers.find((d) => d.id === tour.driverId);
  if (driver) publishPosition(e, driver, simPosition(leg, sim.progressM, 0, now, storePoint(e)));
}
