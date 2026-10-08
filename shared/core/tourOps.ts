/**
 * Touren: Route & ETAs, Start/Ankunft/Zustellung/Fehlschlag/Abschluss, Fahrerposition.
 */
import { ApiError } from '../api';
import type {
  Audience,
  DeliveryProof,
  DeliveryProofInput,
  Driver,
  GeoPoint,
  GeoPosition,
  Order,
  RouteLeg,
  Tour,
  TourStop,
  TourWithOrders,
} from '../types';
import { berlinDate, todayString } from '../time';
import type { Engine } from './engine';
import { safeRoute } from './routing';
import { haversine } from './geo';
import {
  applyCompletion,
  canTransition,
  OPEN_STATUSES,
  orderLink,
  transitionOrder,
} from './orderOps';
import { emitDriver, emitOrder, emitTour, notifyAdmin, notifyCustomer } from './notify';
import { firstName } from './util';

/** Standzeit je Stopp bei echter Fahrt (ETA-Planung) */
export const STOP_DWELL_MS = 4 * 60_000;
/** Standzeit je Stopp in der Demo-Simulation */
export const SIM_DWELL_MS = 8_000;

export const isStopDone = (s: TourStop) => s.status === 'delivered' || s.status === 'failed';
export const isStopOpen = (s: TourStop) => s.status === 'pending' || s.status === 'arrived';

export function storePoint(e: Engine): GeoPoint {
  return { lat: e.db.settings.location.lat, lng: e.db.settings.location.lng };
}

export function tourOrders(e: Engine, tour: Tour): Order[] {
  return tour.stops.map((s) => e.db.orders.find((o) => o.id === s.orderId)).filter((o): o is Order => !!o);
}

export function withOrders(e: Engine, tour: Tour): TourWithOrders {
  const out: TourWithOrders = { ...tour, orders: tourOrders(e, tour) };
  const driver = e.db.drivers.find((d) => d.id === tour.driverId);
  if (driver) out.driver = driver;
  return out;
}

/** Stopp-Koordinate eines Auftrags (Lieferadresse) */
export function orderPoint(order: Order): GeoPoint | null {
  if (!order.address || !Number.isFinite(order.address.lat) || !Number.isFinite(order.address.lng)) return null;
  return { lat: order.address.lat, lng: order.address.lng };
}

/** Route Markt → Stopps → Markt (nie fehlschlagend) */
export async function computeRoute(e: Engine, stopPoints: GeoPoint[]): Promise<NonNullable<Tour['route']>> {
  if (stopPoints.length === 0) return { legs: [], distance: 0, duration: 0 };
  const store = storePoint(e);
  const legs = await safeRoute(e.routing, [store, ...stopPoints, store]);
  return summarizeRoute(legs);
}

export function summarizeRoute(legs: RouteLeg[]): NonNullable<Tour['route']> {
  return {
    legs,
    distance: legs.reduce((s, l) => s + l.distance, 0),
    duration: legs.reduce((s, l) => s + l.duration, 0),
  };
}

/** Zwei aufeinanderfolgende Abschnitte zu einem verbinden (Straßengeometrie bleibt erhalten) */
export function joinLegs(a: RouteLeg, b: RouteLeg): RouteLeg {
  return { coords: [...a.coords, ...b.coords.slice(1)], distance: a.distance + b.distance, duration: a.duration + b.duration };
}

/**
 * Route ohne Netzwerk auf eine Teilmenge der Stopps kürzen (Reihenfolge bleibt; `keep[i]` je Stopp):
 * Abschnitte über entfallene Stopps werden verbunden. null, wenn die Route nicht zu den Stopps passt.
 */
export function pruneRoute(route: NonNullable<Tour['route']>, keep: readonly boolean[]): NonNullable<Tour['route']> | null {
  if (route.legs.length !== keep.length + 1) return null;
  if (!keep.some(Boolean)) return { legs: [], distance: 0, duration: 0 };
  const legs: RouteLeg[] = [];
  let pending: RouteLeg | undefined;
  route.legs.forEach((leg, i) => {
    pending = pending ? joinLegs(pending, leg) : leg;
    if (i === keep.length || keep[i]) {
      legs.push(pending);
      pending = undefined;
    }
  });
  return summarizeRoute(legs);
}

/** Index des nächsten offenen Stopps nach `after` (sonst erster offener; alle erledigt → stops.length) */
export function nextOpenStopIndex(tour: Tour, after = -1): number {
  for (let i = after + 1; i < tour.stops.length; i++) if (isStopOpen(tour.stops[i])) return i;
  for (let i = 0; i <= Math.min(after, tour.stops.length - 1); i++) if (isStopOpen(tour.stops[i])) return i;
  return tour.stops.length;
}

/** Startzeitpunkt einer geplanten Tour: plannedStart (bzw. frühestes Zeitfenster), frühestens jetzt */
export function plannedBase(e: Engine, tour: Tour, now: Date): number {
  let base: number | undefined;
  if (tour.plannedStart) base = berlinDate(tour.date, tour.plannedStart).getTime();
  if (base === undefined) {
    const starts = tourOrders(e, tour).map((o) => berlinDate(o.slot.date, o.slot.start).getTime());
    base = starts.length ? Math.min(...starts) : now.getTime();
  }
  return Math.max(base, now.getTime());
}

/**
 * Geschätzte Ankunftszeiten (ms) je Stopp (undefined für erledigte Stopps).
 * Geplant: ab Startzeit; aktiv: ab jetzt inkl. Simulationsfortschritt.
 */
export function estimateStopEtas(e: Engine, tour: Tour, now: Date): (number | undefined)[] {
  const legs = tour.route?.legs ?? [];
  const sim = tour.simulation?.running ? tour.simulation : undefined;
  const factor = sim ? Math.max(0.1, sim.speedFactor) : 1;
  const dwell = sim?.autoComplete ? SIM_DWELL_MS : STOP_DWELL_MS;
  const result: (number | undefined)[] = tour.stops.map(() => undefined);
  if (tour.status === 'completed') return result;
  let t: number;
  let start: number;
  if (tour.status === 'planned') {
    t = plannedBase(e, tour, now);
    start = 0;
  } else {
    t = now.getTime();
    start = sim ? Math.min(sim.legIndex, tour.stops.length) : tour.currentStopIndex;
    // aktuell wartend am Stopp?
    if (sim?.dwellUntil) {
      const stop = tour.stops[start];
      if (stop && !isStopDone(stop)) result[start] = t;
      t = Math.max(t, Date.parse(sim.dwellUntil));
      start += 1;
    }
  }
  for (let i = start; i < tour.stops.length; i++) {
    const leg = legs[i];
    let legMs = ((leg?.duration ?? 0) * 1000) / factor;
    if (sim && i === sim.legIndex && leg && leg.distance > 0) legMs *= Math.max(0, 1 - sim.progressM / leg.distance);
    const stop = tour.stops[i];
    if (stop.status === 'arrived') legMs = 0;
    t += legMs;
    if (isStopDone(stop)) continue;
    result[i] = t;
    t += dwell;
  }
  return result;
}

/** ETAs der offenen Stopps (Tour + Bestellung) neu setzen; geänderte Bestellungen werden gesendet */
export function recomputeEtas(e: Engine, tour: Tour, now: Date, options: { emitOrders?: boolean } = {}): void {
  const etas = estimateStopEtas(e, tour, now);
  tour.stops.forEach((stop, i) => {
    const ms = etas[i];
    if (ms === undefined) return;
    const iso = new Date(Math.round(ms / 1000) * 1000).toISOString();
    stop.eta = iso;
    const order = e.db.orders.find((o) => o.id === stop.orderId);
    if (order && order.eta !== iso && !['delivered', 'failed', 'cancelled'].includes(order.status)) {
      order.eta = iso;
      if (options.emitOrders) emitOrder(e, order);
    }
  });
}

/** Aktive Tour eines Fahrers */
export function activeTourOf(e: Engine, driverId: string): Tour | undefined {
  return e.db.tours.find((t) => t.driverId === driverId && t.status === 'active');
}

/** Zielgruppe für Positionsmeldungen: Admin, Fahrer, Kunden mit Auftrag unterwegs auf der aktiven Tour */
export function positionAudience(e: Engine, driverId: string): Audience {
  const tour = activeTourOf(e, driverId);
  const customerIds = new Set<string>();
  if (tour) {
    for (const o of tourOrders(e, tour)) if (o.status === 'out_for_delivery') customerIds.add(o.customerId);
  }
  return { admin: true, driverIds: [driverId], customerIds: [...customerIds] };
}

/** Position setzen und verteilen (keine Benachrichtigung) */
export function publishPosition(e: Engine, driver: Driver, position: GeoPosition): void {
  driver.position = position;
  const tour = activeTourOf(e, driver.id);
  const event: { type: 'driver.position'; driverId: string; position: GeoPosition; tourId?: string } = {
    type: 'driver.position',
    driverId: driver.id,
    position,
  };
  if (tour) event.tourId = tour.id;
  e.emit(event, positionAudience(e, driver.id));
}

// ───────────────────────────── Tour-Operationen ─────────────────────────────

/**
 * Auftrag einer aktiven Tour „auf die Straße“ bringen: fehlende Schritte bis „verladen“
 * nachziehen, dann „unterwegs“ (mit Kunden-Benachrichtigung).
 */
export function dispatchOrder(e: Engine, tour: Tour, o: Order, now: Date, by: string, driver?: Driver): void {
  if (!OPEN_STATUSES.includes(o.status)) return;
  const chain: Order['status'][] = ['confirmed', 'picking', 'ready'];
  for (const step of chain.slice(chain.indexOf(o.status) + 1)) {
    if (canTransition(o, step)) {
      transitionOrder(e, o, step, now, {
        by,
        silent: true,
        noEmit: true,
        ...(step === 'ready' ? { note: 'Bei Tourstart automatisch verladen' } : {}),
      });
    }
  }
  o.driverId = tour.driverId;
  const d = driver ?? e.db.drivers.find((x) => x.id === tour.driverId);
  transitionOrder(e, o, 'out_for_delivery', now, { by, ...(d ? { driverName: d.name } : {}) });
}

/**
 * Tour starten: Status aktiv, Fahrer auf Tour, alle offenen Aufträge → unterwegs
 * (noch nicht verladene werden automatisch nachgezogen), Kunden werden benachrichtigt.
 */
export function startTourOp(e: Engine, tour: Tour, now: Date, by: string): void {
  if (tour.status === 'completed') throw new ApiError('conflict', 'Diese Tour ist bereits abgeschlossen.');
  if (tour.status === 'active') return;
  if (tour.stops.length === 0) throw new ApiError('validation', 'Die Tour enthält keine Stopps.');
  const other = e.db.tours.find((t) => t.id !== tour.id && t.driverId === tour.driverId && t.status === 'active');
  if (other) throw new ApiError('conflict', `Bitte schließen Sie zuerst „${other.name}“ ab.`);
  const driver = e.db.drivers.find((d) => d.id === tour.driverId);
  if (!driver) throw new ApiError('not_found', 'Der Fahrer der Tour wurde nicht gefunden.');
  const orders = tourOrders(e, tour);
  for (const o of orders) {
    if (o.status === 'cancelled') throw new ApiError('conflict', `Die Bestellung ${o.number} wurde storniert – bitte zuerst aus der Tour entfernen.`);
  }

  tour.status = 'active';
  tour.startedAt = now.toISOString();
  tour.currentStopIndex = nextOpenStopIndex(tour);
  driver.status = 'on_tour';
  recomputeEtas(e, tour, now);

  const iso = now.toISOString();
  for (const o of orders) dispatchOrder(e, tour, o, now, by, driver);
  if (!driver.position) {
    publishPosition(e, driver, { ...storePoint(e), heading: 0, speed: 0, timestamp: iso });
  } else {
    e.emit(
      { type: 'driver.position', driverId: driver.id, position: driver.position, tourId: tour.id },
      positionAudience(e, driver.id),
    );
  }
  emitDriver(e, driver);
  emitTour(e, tour);
}

function stopIndexOf(tour: Tour, orderId: string): number {
  return tour.stops.findIndex((s) => s.orderId === orderId);
}

/** „Ich bin da“ */
export function arriveOp(e: Engine, order: Order, now: Date, by: string): void {
  if (order.status !== 'out_for_delivery') {
    throw new ApiError('conflict', 'Diese Bestellung ist nicht unterwegs.');
  }
  const tour = order.tourId ? e.db.tours.find((t) => t.id === order.tourId) : undefined;
  if (tour && tour.status !== 'active') throw new ApiError('conflict', 'Die Tour wurde noch nicht gestartet.');
  const idx = tour ? stopIndexOf(tour, order.id) : -1;
  const stop = tour && idx >= 0 ? tour.stops[idx] : undefined;
  if (stop?.status === 'arrived' || (!stop && order.arrivedAt)) return;
  const iso = now.toISOString();
  order.arrivedAt = iso;
  order.updatedAt = iso;
  const driver = e.db.drivers.find((d) => d.id === (tour?.driverId ?? order.driverId));
  notifyCustomer(
    e,
    order.customerId,
    {
      title: 'Ihr Fahrer ist da',
      body: `${driver ? firstName(driver.name) : 'Unser Fahrer'} ist mit Ihrer Bestellung ${order.number} eingetroffen.`,
      kind: 'delivery',
      link: orderLink(order),
    },
    now,
  );
  if (tour && stop) {
    stop.status = 'arrived';
    stop.arrivedAt = iso;
    tour.currentStopIndex = idx;
    recomputeEtas(e, tour, now);
    emitTour(e, tour);
  }
  void by;
  emitOrder(e, order);
}

/** Nach einem erledigten Stopp: nächster offener Stopp, Kunde „Sie sind als Nächstes dran“ */
function advanceAfterStop(e: Engine, tour: Tour, idx: number, now: Date): void {
  tour.currentStopIndex = nextOpenStopIndex(tour, idx);
  recomputeEtas(e, tour, now, { emitOrders: true });
  const next = tour.stops[tour.currentStopIndex];
  if (next && next.status === 'pending') {
    const nextOrder = e.db.orders.find((o) => o.id === next.orderId);
    const driver = e.db.drivers.find((d) => d.id === tour.driverId);
    if (nextOrder && nextOrder.status === 'out_for_delivery') {
      const min = next.eta ? Math.max(1, Math.round((Date.parse(next.eta) - now.getTime()) / 60_000)) : undefined;
      notifyCustomer(
        e,
        nextOrder.customerId,
        {
          title: 'Sie sind als Nächstes dran',
          body:
            `${driver ? firstName(driver.name) : 'Unser Fahrer'} ist jetzt auf dem Weg zu Ihnen` +
            (min ? ` – Ankunft in ca. ${min} Min.` : '.'),
          kind: 'delivery',
          link: orderLink(nextOrder),
        },
        now,
      );
    }
  }
  emitTour(e, tour);
}

const MAX_DATA_URL = 1_500_000;

export function sanitizeProof(e: Engine, input: DeliveryProofInput | undefined, now: Date, emptiesFallback: Order['emptiesReturn']): DeliveryProof {
  const proof: DeliveryProof = { at: now.toISOString(), emptiesCollected: [] };
  const src = (input ?? {}) as Partial<DeliveryProofInput>;
  if (Array.isArray(src.emptiesCollected)) {
    const map = new Map<string, number>();
    for (const l of src.emptiesCollected) {
      if (!l || typeof l.depositTypeId !== 'string') continue;
      if (!Number.isInteger(l.qty) || l.qty < 0 || l.qty > 999) throw new ApiError('validation', 'Bitte geben Sie beim Leergut gültige Mengen an.');
      if (!e.db.depositTypes.some((t) => t.id === l.depositTypeId)) throw new ApiError('validation', 'Unbekannte Leergut-Art.');
      if (l.qty) map.set(l.depositTypeId, (map.get(l.depositTypeId) ?? 0) + l.qty);
    }
    proof.emptiesCollected = [...map].map(([depositTypeId, qty]) => ({ depositTypeId, qty }));
  } else {
    proof.emptiesCollected = emptiesFallback.map((l) => ({ ...l }));
  }
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
  const receivedBy = str(src.receivedBy, 120);
  if (receivedBy) proof.receivedBy = receivedBy;
  const note = str(src.note, 500);
  if (note) proof.note = note;
  for (const key of ['signatureDataUrl', 'photoDataUrl'] as const) {
    const v = src[key];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string' || !/^data:image\/(png|jpe?g|webp);base64,/.test(v)) {
      throw new ApiError('validation', key === 'photoDataUrl' ? 'Das Foto hat ein ungültiges Format.' : 'Die Unterschrift hat ein ungültiges Format.');
    }
    if (v.length > MAX_DATA_URL) throw new ApiError('validation', key === 'photoDataUrl' ? 'Das Foto ist zu groß.' : 'Die Unterschrift ist zu groß.');
    proof[key] = v;
  }
  if (src.amountCollected !== undefined && src.amountCollected !== null) {
    if (!Number.isInteger(src.amountCollected) || src.amountCollected < 0) throw new ApiError('validation', 'Ungültiger kassierter Betrag.');
    proof.amountCollected = src.amountCollected;
  }
  return proof;
}

/** Zustellung abschließen */
export function completeOp(e: Engine, order: Order, proof: DeliveryProof, now: Date, by: string): void {
  if (order.status !== 'out_for_delivery') throw new ApiError('conflict', 'Diese Bestellung ist nicht unterwegs.');
  const tour = order.tourId ? e.db.tours.find((t) => t.id === order.tourId) : undefined;
  if (tour && tour.status !== 'active') throw new ApiError('conflict', 'Die Tour ist nicht aktiv.');
  order.proof = proof;
  if (!order.arrivedAt) order.arrivedAt = proof.at;
  delete order.eta;
  applyCompletion(e, order, proof.emptiesCollected);
  const driver = e.db.drivers.find((d) => d.id === (tour?.driverId ?? order.driverId));
  transitionOrder(e, order, 'delivered', now, { by, ...(driver ? { driverName: driver.name } : {}) });
  const customer = e.db.customers.find((c) => c.id === order.customerId);
  if (customer) {
    const { internalNote: _n, ...visible } = customer;
    void _n;
    e.emit({ type: 'customer.updated', customer: visible }, { customerIds: [customer.id] });
    e.emit({ type: 'customer.updated', customer }, { admin: true });
  }
  if (tour) {
    const idx = stopIndexOf(tour, order.id);
    if (idx >= 0) {
      tour.stops[idx].status = 'delivered';
      tour.stops[idx].doneAt = proof.at;
      if (!tour.stops[idx].arrivedAt) tour.stops[idx].arrivedAt = proof.at;
      advanceAfterStop(e, tour, idx, now);
    }
  }
}

/** Zustellung fehlgeschlagen */
export function failOp(e: Engine, order: Order, reason: string, now: Date, by: string): void {
  if (order.status !== 'out_for_delivery') throw new ApiError('conflict', 'Diese Bestellung ist nicht unterwegs.');
  const tour = order.tourId ? e.db.tours.find((t) => t.id === order.tourId) : undefined;
  if (tour && tour.status !== 'active') throw new ApiError('conflict', 'Die Tour ist nicht aktiv.');
  order.failureReason = reason;
  delete order.eta;
  transitionOrder(e, order, 'failed', now, { by, note: reason });
  notifyAdmin(
    e,
    {
      title: 'Zustellung fehlgeschlagen',
      body: `${order.number} · ${order.customerName}: ${reason}`,
      kind: 'delivery',
      link: `/admin/bestellungen/${order.id}`,
    },
    now,
  );
  if (tour) {
    const idx = stopIndexOf(tour, order.id);
    if (idx >= 0) {
      tour.stops[idx].status = 'failed';
      tour.stops[idx].doneAt = now.toISOString();
      advanceAfterStop(e, tour, idx, now);
    }
  }
}

/** Tour abschließen (alle Stopps müssen erledigt sein, außer force) */
export function finishTourOp(e: Engine, tour: Tour, now: Date, options: { force?: boolean } = {}): void {
  if (tour.status === 'completed') return;
  if (tour.status !== 'active') throw new ApiError('conflict', 'Die Tour wurde noch nicht gestartet.');
  const open = tour.stops.filter(isStopOpen).length;
  if (open > 0 && !options.force) {
    throw new ApiError(
      'conflict',
      open === 1
        ? 'Es ist noch 1 Stopp offen – bitte zuerst zustellen oder als fehlgeschlagen markieren.'
        : `Es sind noch ${open} Stopps offen – bitte zuerst zustellen oder als fehlgeschlagen markieren.`,
    );
  }
  tour.status = 'completed';
  tour.finishedAt = now.toISOString();
  tour.currentStopIndex = tour.stops.length;
  if (tour.simulation) {
    tour.simulation.running = false;
    delete tour.simulation.dwellUntil;
  }
  const driver = e.db.drivers.find((d) => d.id === tour.driverId);
  if (driver) {
    if (driver.status === 'on_tour') driver.status = 'available';
    emitDriver(e, driver);
  }
  emitTour(e, tour);
}

/**
 * Auftrag aus einer Tour entfernen, ohne Netzwerk: die beiden angrenzenden Abschnitte
 * werden zu einem verbunden (Straßengeometrie bleibt erhalten).
 */
export function detachOrderFromTour(e: Engine, order: Order, options: { emit?: boolean; now?: Date } = {}): Tour | undefined {
  const tour = order.tourId ? e.db.tours.find((t) => t.id === order.tourId) : undefined;
  delete order.tourId;
  if (order.status !== 'out_for_delivery' && order.status !== 'delivered' && order.status !== 'failed') delete order.driverId;
  delete order.eta;
  if (!tour) return undefined;
  const idx = stopIndexOf(tour, order.id);
  if (idx < 0) return tour;
  tour.stops.splice(idx, 1);
  if (tour.route) {
    const legs = [...tour.route.legs];
    if (tour.stops.length === 0) {
      tour.route = { legs: [], distance: 0, duration: 0 };
    } else if (legs.length >= idx + 2) {
      const a = legs[idx];
      const b = legs[idx + 1];
      const merged: RouteLeg = { coords: [...a.coords, ...b.coords.slice(1)], distance: a.distance + b.distance, duration: a.duration + b.duration };
      legs.splice(idx, 2, merged);
      tour.route = summarizeRoute(legs);
    }
  }
  if (tour.simulation && tour.simulation.legIndex > idx) tour.simulation.legIndex -= 1;
  tour.currentStopIndex = tour.status === 'active' ? nextOpenStopIndex(tour, Math.min(idx, tour.stops.length) - 1) : Math.min(tour.currentStopIndex, tour.stops.length);
  if (tour.status !== 'completed') recomputeEtas(e, tour, options.now ?? e.now());
  if (options.emit !== false) emitTour(e, tour);
  return tour;
}

/** Entfernung zwischen zwei Punkten in Metern (Kurzform für Planung) */
export function dist(a: GeoPoint, b: GeoPoint): number {
  return haversine(a, b);
}

/** Touren eines Fahrers für heute (oder aktive) */
export function driverTours(e: Engine, driverId: string, now: Date): Tour[] {
  const today = todayString(now);
  return e.db.tours
    .filter((t) => t.driverId === driverId && (t.date === today || t.status === 'active'))
    .sort((a, b) => {
      const rank = (t: Tour) => (t.status === 'active' ? 0 : t.status === 'planned' ? 1 : 2);
      return rank(a) - rank(b) || (a.plannedStart ?? '').localeCompare(b.plannedStart ?? '') || a.name.localeCompare(b.name);
    });
}
