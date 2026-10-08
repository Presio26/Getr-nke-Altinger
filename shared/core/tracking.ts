/**
 * Sendungsverfolgung: Restroute bis zum Kunden und geschätzte Ankunft.
 */
import type { LatLng, Order, TrackingInfo } from '../types';
import type { Engine } from './engine';
import { haversine, polylineLength, projectOnPolyline, sliceFrom, toLatLng } from './geo';
import { FALLBACK_DETOUR_FACTOR, FALLBACK_SPEED_MS } from './routing';
import { remainingLegCoords } from './simulator';
import { estimateStopEtas, isStopDone, isStopOpen, orderPoint, SIM_DWELL_MS, STOP_DWELL_MS } from './tourOps';

/** Linienzüge aneinanderhängen (doppelte Verbindungspunkte entfernen) */
function concat(parts: LatLng[][]): LatLng[] {
  const out: LatLng[] = [];
  for (const part of parts) {
    for (const p of part) {
      const prev = out[out.length - 1];
      if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
    }
  }
  return out;
}

const minutesCeil = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));

export function buildTracking(e: Engine, order: Order, now: Date): TrackingInfo {
  const s = e.db.settings;
  const info: TrackingInfo = {
    order,
    store: { lat: s.location.lat, lng: s.location.lng, name: s.name, phone: s.phone },
  };
  const driver = order.driverId ? e.db.drivers.find((d) => d.id === order.driverId) : undefined;
  if (driver) {
    const d: NonNullable<TrackingInfo['driver']> = {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      vehicle: driver.vehicle,
      color: driver.color,
      status: driver.status,
    };
    if (driver.position) d.position = driver.position;
    info.driver = d;
  }
  const tour = order.tourId ? e.db.tours.find((t) => t.id === order.tourId) : undefined;
  if (!tour) return info;
  const idx = tour.stops.findIndex((x) => x.orderId === order.id);
  if (idx < 0) return info;
  const stop = tour.stops[idx];
  const stopsBefore = tour.stops.slice(0, idx).filter(isStopOpen).length;
  const t: NonNullable<TrackingInfo['tour']> = {
    id: tour.id,
    status: tour.status,
    stopIndex: idx,
    currentStopIndex: tour.currentStopIndex,
    stopsBefore,
  };
  info.tour = t;

  const legs = tour.route?.legs ?? [];
  const finished = isStopDone(stop) || ['delivered', 'picked_up', 'failed', 'cancelled'].includes(order.status);
  if (finished || tour.status === 'completed') return info;

  if (stop.status === 'arrived') {
    info.etaMinutes = 0;
    return info;
  }

  if (tour.status === 'planned') {
    if (legs.length > idx) t.routeToCustomer = concat(legs.slice(0, idx + 1).map((l) => l.coords));
    const eta = estimateStopEtas(e, tour, now)[idx];
    if (eta !== undefined) info.etaMinutes = minutesCeil(eta - now.getTime());
    return info;
  }

  // ── aktive Tour ──
  const sim = tour.simulation;
  const target = orderPoint(order);
  // Simulationsfortschritt nur, solange die letzte Position simuliert ist (echtes GPS hat Vorrang)
  const simulated = !!sim && (sim.running || driver?.position?.simulated === true);
  if (sim && simulated && sim.legIndex <= idx) {
    const factor = sim.running ? Math.max(0.1, sim.speedFactor) : 1;
    const dwell = sim.running && sim.autoComplete ? SIM_DWELL_MS : STOP_DWELL_MS;
    const cur = legs[sim.legIndex];
    const parts: LatLng[][] = [];
    let remainingS = 0;
    if (cur) {
      const atStop = !!sim.dwellUntil && sim.legIndex < idx;
      if (!atStop) {
        parts.push(remainingLegCoords(cur, sim.progressM));
        remainingS += cur.distance > 0 ? cur.duration * Math.max(0, 1 - sim.progressM / cur.distance) : 0;
      } else {
        parts.push([cur.coords[cur.coords.length - 1]]);
      }
    }
    for (let i = sim.legIndex + 1; i <= idx && i < legs.length; i++) {
      parts.push(legs[i].coords);
      remainingS += legs[i].duration;
    }
    let waitMs = 0;
    if (sim.dwellUntil && sim.legIndex < idx) waitMs = Math.max(0, Date.parse(sim.dwellUntil) - now.getTime());
    t.routeToCustomer = concat(parts);
    const openBefore = tour.stops.slice(sim.legIndex, idx).filter((x) => isStopOpen(x)).length;
    const extraDwell = Math.max(0, openBefore - (sim.dwellUntil ? 1 : 0)) * dwell;
    info.etaMinutes = minutesCeil((remainingS * 1000) / factor + waitMs + extraDwell);
    return info;
  }

  // echte GPS-Position (oder noch keine Position: ab Markt)
  const k = Math.min(tour.currentStopIndex, legs.length - 1);
  const pos = driver?.position ? ([driver.position.lat, driver.position.lng] as LatLng) : toLatLng(s.location);
  const avgSpeed = tour.route && tour.route.duration > 0 ? tour.route.distance / tour.route.duration : FALLBACK_SPEED_MS;
  let remainingM = 0;
  const parts: LatLng[][] = [];
  if (k >= 0 && k <= idx && legs[k]) {
    const leg = legs[k];
    const len = polylineLength(leg.coords);
    const { along } = projectOnPolyline(leg.coords, pos);
    const rest = sliceFrom(leg.coords, along);
    parts.push([pos, ...rest.slice(1)]);
    remainingM += len > 0 ? (leg.distance * Math.max(0, len - along)) / len : 0;
    for (let i = k + 1; i <= idx && i < legs.length; i++) {
      parts.push(legs[i].coords);
      remainingM += legs[i].distance;
    }
  } else if (target) {
    parts.push([pos, toLatLng(target)]);
    remainingM = haversine(pos, toLatLng(target)) * FALLBACK_DETOUR_FACTOR;
  }
  if (parts.length) t.routeToCustomer = concat(parts);
  info.etaMinutes = minutesCeil((remainingM / Math.max(1, avgSpeed)) * 1000 + stopsBefore * STOP_DWELL_MS);
  return info;
}
