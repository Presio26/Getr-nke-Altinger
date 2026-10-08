/**
 * Tour-Karte der Fahrer-App: komplette Route (alle Abschnitte), nummerierte Stopps mit Status,
 * Markt und das eigene Fahrzeug (Live-Position aus dem Positions-Store).
 */
import { useMemo, useRef, type ReactNode } from 'react';
import type L from 'leaflet';
import { Crosshair, Maximize2 } from 'lucide-react';
import type { GeoPosition, LatLng, TourWithOrders } from '@shared/types';
import { BaseMap, DriverMarker, RouteLine, StopMarker, StoreMarker } from '@/components/map';
import { useSettings } from '@/api/hooks';
import { useDriverPosition, usePositions } from '@/stores/positions';
import { cn } from '@/lib/cn';
import { currentStopIndex, isStopDone } from '../lib/driverUtils';

export function OwnVehicle({ driverId, color, fallback }: { driverId: string; color: string; fallback?: GeoPosition }) {
  const position = useDriverPosition(driverId, fallback ?? null);
  if (!position) return null;
  return <DriverMarker position={position} color={color} pulse />;
}

export interface TourMapProps {
  tour: TourWithOrders;
  className?: string;
  onStopClick?: (orderId: string) => void;
  /** eigenes Fahrzeug anzeigen (bei aktiver Tour) */
  showVehicle?: boolean;
  /** Inhalt oben rechts über der Karte (z. B. Simulationsstatus) */
  overlay?: ReactNode;
}

export function TourMap({ tour, className, onStopClick, showVehicle = true, overlay }: TourMapProps) {
  const settings = useSettings();
  const mapRef = useRef<L.Map | null>(null);
  const store: LatLng = [settings.location.lat, settings.location.lng];
  const legs = tour.route?.legs ?? [];
  const current = currentStopIndex(tour);
  const driver = tour.driver;

  // Punktmenge nur bei geänderten Stopps neu berechnen (Karte springt sonst bei jedem Update)
  const pointsKey = [store.join(','), ...tour.orders.map((o) => (o.address ? `${o.address.lat},${o.address.lng}` : ''))].join('|');
  const points = useMemo(
    () =>
      pointsKey
        .split('|')
        .filter(Boolean)
        .map((p) => p.split(',').map(Number) as LatLng),
    [pointsKey],
  );

  // Ausschnitt automatisch nachführen (Größenänderung), bis der Fahrer selbst die Karte bewegt
  const autoFit = useRef(true);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const fitAll = (animate = true) => {
    const map = mapRef.current;
    const pts = pointsRef.current;
    if (!map || pts.length < 2) return;
    // rechts unten Platz für die Kartenknöpfe, oben für den Simulationsstatus
    map.fitBounds(pts, { paddingTopLeft: [52, 60], paddingBottomRight: [72, 36], maxZoom: 16, animate });
  };
  const onReady = (map: L.Map) => {
    if (mapRef.current === map) return;
    mapRef.current = map;
    const stopAuto = () => (autoFit.current = false);
    map.getContainer().addEventListener('pointerdown', stopAuto, { passive: true });
    map.getContainer().addEventListener('wheel', stopAuto, { passive: true });
    map.on('resize', () => {
      if (autoFit.current) fitAll(false);
    });
    window.setTimeout(() => autoFit.current && fitAll(false), 350);
  };

  const centerVehicle = () => {
    const map = mapRef.current;
    if (!map || !driver) return;
    const pos = usePositions.getState().byDriver[driver.id] ?? driver.position;
    if (pos) map.setView([pos.lat, pos.lng], Math.max(map.getZoom(), 15), { animate: true });
  };

  const tourDone = tour.status === 'completed';

  return (
    <div className={cn('relative isolate overflow-hidden', className)}>
      <BaseMap fitTo={points} fitPadding={60} maxFitZoom={16} onReady={onReady} className="h-full">
        {legs.map((leg, i) => {
          // legs[i] führt zu stops[i]; legs[stops.length] = Rückfahrt
          const isReturn = i >= tour.stops.length;
          const stop = tour.stops[i];
          const done = tourDone || (stop ? isStopDone(stop) : false);
          const isCurrent = !tourDone && i === (current === -1 ? tour.stops.length : current) && tour.status === 'active';
          if (done) return <RouteLine key={i} coords={leg.coords} color="#64748b" weight={4} faded />;
          if (isCurrent) return <RouteLine key={i} coords={leg.coords} color="#1d58a0" weight={6} />;
          if (isReturn) return <RouteLine key={i} coords={leg.coords} color="#64748b" weight={4} dashed />;
          return <RouteLine key={i} coords={leg.coords} color="#3d76be" weight={4} dashed={tour.status === 'active'} />;
        })}
        <StoreMarker />
        {tour.stops.map((s, i) => {
          const order = tour.orders.find((o) => o.id === s.orderId);
          if (!order?.address) return null;
          return (
            <StopMarker
              key={s.orderId}
              position={order.address}
              index={i + 1}
              status={s.status}
              current={i === current && tour.status !== 'completed'}
              label={`${i + 1}. ${order.customerName}`}
              onClick={onStopClick ? () => onStopClick(s.orderId) : undefined}
            />
          );
        })}
        {showVehicle && driver ? <OwnVehicle driverId={driver.id} color={driver.color} fallback={driver.position} /> : null}
      </BaseMap>
      {overlay ? <div className="pointer-events-none absolute right-3 top-3 z-[1000] flex justify-end">{overlay}</div> : null}
      <div className="pointer-events-none absolute bottom-3 right-3 z-[1000] flex flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            autoFit.current = true;
            fitAll();
          }}
          aria-label="Gesamte Route anzeigen"
          title="Gesamte Route anzeigen"
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-700 shadow-raised ring-1 ring-slate-900/10 transition-colors hover:bg-slate-50 active:bg-slate-100"
        >
          <Maximize2 size={19} aria-hidden />
        </button>
        {showVehicle && driver ? (
          <button
            type="button"
            onClick={centerVehicle}
            aria-label="Auf mein Fahrzeug zentrieren"
            title="Auf mein Fahrzeug zentrieren"
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white text-brand-700 shadow-raised ring-1 ring-slate-900/10 transition-colors hover:bg-slate-50 active:bg-slate-100"
          >
            <Crosshair size={20} aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Kleine, nicht bedienbare Routen-Vorschau (z. B. auf der Tourkarte am Desktop) */
export function RoutePreview({ tour, className }: { tour: TourWithOrders; className?: string }) {
  const settings = useSettings();
  const points = useMemo<LatLng[]>(
    () => [[settings.location.lat, settings.location.lng], ...tour.orders.filter((o) => o.address).map((o) => [o.address!.lat, o.address!.lng] as LatLng)],
    [settings.location.lat, settings.location.lng, tour.orders],
  );
  const onReady = (map: L.Map) => {
    const fit = () => {
      // oben Platz für die Markt-Nadel
      if (points.length > 1) map.fitBounds(points, { paddingTopLeft: [24, 46], paddingBottomRight: [24, 14], maxZoom: 15, animate: false });
    };
    map.on('resize', fit);
    window.setTimeout(fit, 250);
  };
  return (
    <div className={cn('pointer-events-none relative isolate overflow-hidden', className)} aria-hidden>
      <BaseMap fitTo={points} fitPadding={26} maxFitZoom={15} static zoomControl={false} onReady={onReady} className="h-full">
        {(tour.route?.legs ?? []).map((leg, i) => (
          <RouteLine key={i} coords={leg.coords} color={i >= tour.stops.length ? '#64748b' : '#1d58a0'} weight={4} dashed={i >= tour.stops.length} />
        ))}
        <StoreMarker />
        {tour.stops.map((s, i) => {
          const order = tour.orders.find((o) => o.id === s.orderId);
          return order?.address ? <StopMarker key={s.orderId} position={order.address} index={i + 1} status={s.status} /> : null;
        })}
      </BaseMap>
    </div>
  );
}
