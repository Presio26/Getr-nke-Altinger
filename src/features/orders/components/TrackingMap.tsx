import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type L from 'leaflet';
import { LocateFixed } from 'lucide-react';
import type { GeoPoint, GeoPosition, LatLng } from '@shared/types';
import { haversine, projectOnPolyline, sliceFrom } from '@shared/core/geo';
import { BaseMap, DriverMarker, HomeMarker, RouteLine, StoreMarker } from '@/components/map';
import { cn } from '@/lib/cn';

export interface TrackingMapProps {
  /** Lieferadresse */
  home: GeoPoint;
  homeLabel?: string;
  driver?: { position?: GeoPosition; color: string; name: string };
  /** Restroute zum Kunden (aus der Sendungsverfolgung) */
  route?: LatLng[];
  /** zusätzlicher Punkt für den Kartenausschnitt (z. B. Markt, solange der Fahrer noch nicht losgefahren ist) */
  extraFit?: GeoPoint;
  className?: string;
}

/** Ab dieser Abweichung (m) vom zuletzt eingepassten Punkt wird der Ausschnitt nachgeführt */
const REFIT_DISTANCE_M = 220;

/** Restroute ab der aktuellen Fahrerposition (falls der Fahrer auf der Route ist) */
function trimRoute(route: LatLng[] | undefined, pos: GeoPoint | undefined): LatLng[] {
  if (!route || route.length < 2) return [];
  if (!pos) return route;
  const { along, offset } = projectOnPolyline(route, pos);
  if (offset > 120) return route;
  const rest = sliceFrom(route, along);
  return [[pos.lat, pos.lng], ...rest.slice(1)];
}

/**
 * Live-Karte der Sendungsverfolgung: Markt, Zuhause, Fahrer (gleitet weich), Restroute.
 * Der Ausschnitt folgt dem Fahrer (Fahrer + Kunde im Bild), bis der Nutzer die Karte selbst verschiebt.
 */
export function TrackingMap({ home, homeLabel = 'Ihre Lieferadresse', driver, route, extraFit, className }: TrackingMapProps) {
  const pos = driver?.position;
  const [follow, setFollow] = useState(true);
  const pointsNow = (): LatLng[] => {
    const pts: LatLng[] = [[home.lat, home.lng]];
    if (pos) pts.push([pos.lat, pos.lng]);
    if (extraFit) pts.push([extraFit.lat, extraFit.lng]);
    return pts;
  };
  const [fitPoints, setFitPoints] = useState<LatLng[]>(pointsNow);
  const lastFit = useRef<GeoPoint | null>(pos ?? null);

  // Ausschnitt nachführen: nur bei spürbarer Bewegung, damit die Karte nicht dauernd „zappelt“
  useEffect(() => {
    if (!follow) return;
    const pts = pointsNow();
    const moved = !lastFit.current || !pos || haversine(lastFit.current, pos) > REFIT_DISTANCE_M;
    if (moved || fitPoints.length !== pts.length) {
      lastFit.current = pos ?? null;
      setFitPoints(pts);
    }
  }, [pos?.lat, pos?.lng, home.lat, home.lng, extraFit?.lat, extraFit?.lng, follow]);

  // Verschiebt der Nutzer die Karte, pausiert das Nachführen („Fahrer folgen“ holt es zurück)
  const onReady = useCallback((map: L.Map) => {
    map.on('dragstart', () => setFollow(false));
  }, []);

  const recenter = () => {
    lastFit.current = null;
    setFollow(true);
  };

  const remaining = useMemo(() => trimRoute(route, pos), [route, pos]);

  return (
    <div className={cn('relative isolate', className)}>
      <BaseMap fitTo={follow ? fitPoints : undefined} fitPadding={56} maxFitZoom={16} zoom={14} onReady={onReady}>
        <StoreMarker />
        {remaining.length > 1 ? <RouteLine coords={remaining} color={driver?.color ?? '#1d58a0'} weight={5} /> : null}
        <HomeMarker position={home} label={homeLabel} />
        {pos ? <DriverMarker position={pos} color={driver?.color} label={driver?.name.split(' ')[0]} animationMs={1100} /> : null}
      </BaseMap>
      {!follow ? (
        <button
          type="button"
          onClick={recenter}
          className="absolute bottom-4 right-3 z-[500] inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-brand-800 shadow-pop ring-1 ring-slate-200 transition-colors hover:bg-brand-50"
        >
          <LocateFixed size={18} aria-hidden />
          Fahrer folgen
        </button>
      ) : null}
    </div>
  );
}
