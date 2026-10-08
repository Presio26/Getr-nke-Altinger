/**
 * Kartenebenen für die Flotte: Fahrer (live), aktive Routen, Stopps.
 * Wird von Dashboard (Mini-Karte), Live-Karte und Tourenplanung genutzt.
 */
import { useMemo } from 'react';
import { Tooltip } from 'react-leaflet';
import type { Driver, GeoPoint, LatLng, Order, Tour, TourWithOrders } from '@shared/types';
import { formatTime } from '@shared/format';
import { useSettings } from '@/api/hooks';
import { useDriverPosition } from '@/stores/positions';
import { DriverMarker, RouteLine, StopMarker } from '@/components/map';
import { firstName } from '../model';

/** Entfernung in Metern (Haversine, für "am Markt"-Erkennung) */
export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Linienzug einer Tour, aufgeteilt in gefahren (vor dem aktuellen Stopp) und offen */
export function tourLines(tour: Tour): { done: LatLng[]; open: LatLng[]; all: LatLng[] } {
  const legs = tour.route?.legs ?? [];
  const split = tour.status === 'active' ? Math.min(tour.simulation?.running ? tour.simulation.legIndex : tour.currentStopIndex, legs.length) : 0;
  const done = legs.slice(0, split).flatMap((l) => l.coords);
  const open = legs.slice(split).flatMap((l) => l.coords);
  return { done, open, all: legs.flatMap((l) => l.coords) };
}

export function orderById(tour: TourWithOrders): Map<string, Order> {
  return new Map(tour.orders.map((o) => [o.id, o]));
}

/** Route + Stopps einer Tour */
export function TourLayer({
  tour,
  color,
  emphasis = 'normal',
  showStops = true,
  onStopClick,
}: {
  tour: TourWithOrders;
  color: string;
  emphasis?: 'normal' | 'strong' | 'faded';
  showStops?: boolean;
  onStopClick?: (order: Order) => void;
}) {
  const lines = useMemo(() => tourLines(tour), [tour]);
  const orders = useMemo(() => orderById(tour), [tour]);
  const planned = tour.status === 'planned';
  const weight = emphasis === 'strong' ? 6 : emphasis === 'faded' ? 4 : 5;
  return (
    <>
      {lines.done.length > 1 ? <RouteLine coords={lines.done} color={color} faded weight={weight - 1} /> : null}
      {lines.open.length > 1 ? <RouteLine coords={lines.open} color={color} dashed={planned && emphasis !== 'strong'} faded={emphasis === 'faded'} weight={weight} /> : null}
      {showStops
        ? tour.stops.map((s, i) => {
            const o = orders.get(s.orderId);
            if (!o?.address) return null;
            return (
              <StopMarker
                key={s.orderId}
                position={o.address}
                index={i + 1}
                status={s.status}
                current={tour.status === 'active' && i === tour.currentStopIndex}
                label={`${i + 1}. ${o.customerName}${s.eta && s.status === 'pending' ? ` · ETA ${formatTime(s.eta)}` : ''}`}
                onClick={onStopClick ? () => onStopClick(o) : undefined}
              />
            );
          })
        : null}
    </>
  );
}

/** Fahrer-Marker mit Live-Position (gleitet bei Echtzeit-Updates) */
export function LiveDriverMarker({ driver, label, pulse }: { driver: Driver; label?: string; pulse?: boolean }) {
  const pos = useDriverPosition(driver.id, driver.position);
  if (!pos) return null;
  return (
    <DriverMarker position={pos} color={driver.color} label={label ?? firstName(driver.name)} pulse={pulse ?? driver.status === 'on_tour'}>
      <Tooltip direction="top" offset={[0, -18]}>
        {driver.name} · {driver.vehicle}
      </Tooltip>
    </DriverMarker>
  );
}

/** Nur Fahrer zeichnen, die unterwegs sind bzw. nicht am Markt stehen */
export function useDriversAway(drivers: Driver[] | undefined, positions: Record<string, { lat: number; lng: number } | undefined>): { away: Driver[]; atStore: Driver[] } {
  const settings = useSettings();
  return useMemo(() => {
    const away: Driver[] = [];
    const atStore: Driver[] = [];
    for (const d of drivers ?? []) {
      const p = positions[d.id] ?? d.position;
      if (!p) {
        atStore.push(d);
        continue;
      }
      if (d.status !== 'on_tour' && distanceM(p, settings.location) < 150) atStore.push(d);
      else away.push(d);
    }
    return { away, atStore };
  }, [drivers, positions, settings.location]);
}
