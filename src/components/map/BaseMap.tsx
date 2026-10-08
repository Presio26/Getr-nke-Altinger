import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoPoint, LatLng } from '@shared/types';
import { useSettings } from '@/api/hooks';
import { hasFinePointer } from '@/lib/platform';
import { cn } from '@/lib/cn';

export const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende';

export interface BaseMapProps {
  /** Mittelpunkt (Default: Markt) */
  center?: LatLng;
  zoom?: number;
  className?: string;
  /** Kartenausschnitt so wählen, dass alle Punkte sichtbar sind (reagiert auf Änderungen) */
  fitTo?: LatLng[];
  /** Innenabstand für fitTo in px */
  fitPadding?: number;
  /** höchster Zoom bei fitTo */
  maxFitZoom?: number;
  children?: ReactNode;
  /** Zoom-Steuerung anzeigen (Default true) */
  zoomControl?: boolean;
  /** Karte nicht verschiebbar (z. B. Vorschau-Kachel) */
  static?: boolean;
  /** Zugriff auf die Leaflet-Instanz */
  onReady?: (map: L.Map) => void;
}

export function toLatLng(p: GeoPoint | LatLng): LatLng {
  return Array.isArray(p) ? p : [p.lat, p.lng];
}

/** Ausschnitt an Punkte anpassen – nur wenn sich die Punktmenge tatsächlich ändert */
function FitBounds({ points, padding, maxZoom }: { points: LatLng[]; padding: number; maxZoom: number }) {
  const map = useMap();
  const key = points.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join('|');
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], Math.min(maxZoom, Math.max(map.getZoom(), 14)), { animate: true });
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));
    if (!bounds.isValid()) return;
    map.fitBounds(bounds, { padding: [padding, padding], maxZoom, animate: true });
  }, [key, map, padding, maxZoom]);
  return null;
}

/** Größe neu berechnen, wenn sich der Container ändert (Tabs, Drawer, Drehung des Handys) */
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    });
    ro.observe(el);
    const t = window.setTimeout(() => map.invalidateSize(), 200);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(t);
    };
  }, [map]);
  return null;
}

function Ready({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();
  const cb = useRef(onReady);
  cb.current = onReady;
  useEffect(() => {
    cb.current(map);
  }, [map]);
  return null;
}

/** OpenStreetMap-Karte (react-leaflet) mit Markt als Standard-Mittelpunkt */
export function BaseMap({
  center,
  zoom = 13,
  className,
  fitTo,
  fitPadding = 48,
  maxFitZoom = 16,
  children,
  zoomControl = true,
  static: isStatic = false,
  onReady,
}: BaseMapProps) {
  const settings = useSettings();
  const initialCenter = useMemo<LatLng>(() => center ?? [settings.location.lat, settings.location.lng], [center, settings.location.lat, settings.location.lng]);
  const desktop = useMemo(() => hasFinePointer(), []);

  return (
    <div className={cn('relative h-full w-full overflow-hidden', className)}>
      <MapContainer
        center={initialCenter}
        zoom={zoom}
        className="h-full w-full"
        scrollWheelZoom={desktop && !isStatic}
        dragging={!isStatic}
        touchZoom={!isStatic}
        doubleClickZoom={!isStatic}
        boxZoom={!isStatic}
        keyboard={!isStatic}
        zoomControl={zoomControl && !isStatic}
        attributionControl
        // Leaflet 1.9: Tippen auf iOS ohne Verzögerung
        tapTolerance={15}
      >
        <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} maxZoom={19} subdomains={['a', 'b', 'c']} detectRetina={false} />
        <AutoResize />
        {fitTo && fitTo.length ? <FitBounds points={fitTo} padding={fitPadding} maxZoom={maxFitZoom} /> : null}
        {onReady ? <Ready onReady={onReady} /> : null}
        {children}
      </MapContainer>
    </div>
  );
}
