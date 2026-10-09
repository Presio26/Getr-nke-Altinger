import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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

function pointsKey(points: LatLng[] | undefined): string {
  return (points ?? []).map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join('|');
}

/**
 * Ausschnitt an Punkte anpassen – nur wenn sich die Punktmenge NACH dem Start ändert
 * (den ersten Ausschnitt setzt MapContainer direkt über `bounds`, ohne Zwischenstand/Springen).
 */
function FitBounds({
  points,
  padding,
  maxZoom,
  initialKey,
  instant,
  onFit,
}: {
  points: LatLng[];
  padding: number;
  maxZoom: number;
  initialKey: string;
  /** ohne Animation springen (Kacheln noch nicht geladen) */
  instant: boolean;
  onFit: () => void;
}) {
  const map = useMap();
  const key = pointsKey(points);
  const applied = useRef(initialKey);
  useEffect(() => {
    if (!points.length || key === applied.current) return;
    applied.current = key;
    const animate = !instant;
    if (points.length === 1) {
      map.setView(points[0], Math.min(maxZoom, Math.max(map.getZoom(), 14)), { animate });
    } else {
      const bounds = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));
      if (!bounds.isValid()) return;
      map.fitBounds(bounds, { padding: [padding, padding], maxZoom, animate });
    }
    onFit();
  }, [key, map, padding, maxZoom, instant, onFit]);
  return null;
}

/** so lange auf weitere Punkte warten (Daten laden noch), bevor Kacheln für den Zwischenstand geladen werden */
const FIT_SETTLE_MS = 450;

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
  // Startausschnitt direkt aus fitTo (MapContainer liest Startwerte nur einmal) → keine Kacheln für einen
  // Zwischenstand laden, die gleich wieder verworfen werden, und kein Springen der Karte
  const [initial] = useState(() => {
    const pts = fitTo ?? [];
    const key = pointsKey(pts);
    if (pts.length >= 2) {
      const bounds = L.latLngBounds(pts.map((p) => L.latLng(p[0], p[1])));
      if (bounds.isValid() && !bounds.getNorthEast().equals(bounds.getSouthWest())) {
        return { key, bounds, center: undefined, zoom: undefined };
      }
    }
    if (pts.length >= 1) return { key, bounds: undefined, center: pts[0], zoom: Math.min(maxFitZoom, Math.max(zoom, 14)) };
    return { key, bounds: undefined, center: initialCenter, zoom };
  });

  // Steht beim Start nur ein Punkt fest (meist: Markt, Touren/Aufträge laden noch), Kacheln kurz zurückhalten –
  // kommen die übrigen Punkte, springt die Karte ohne Animation dorthin und lädt nur diese Kacheln.
  const [tilesReady, setTilesReady] = useState(() => !(fitTo && fitTo.length === 1));
  useEffect(() => {
    if (tilesReady) return;
    const t = window.setTimeout(() => setTilesReady(true), FIT_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [tilesReady]);
  const markFitted = useCallback(() => setTilesReady(true), []);

  return (
    <div className={cn('relative h-full w-full overflow-hidden', className)}>
      <MapContainer
        {...(initial.bounds
          ? { bounds: initial.bounds, boundsOptions: { padding: [fitPadding, fitPadding] as [number, number], maxZoom: maxFitZoom } }
          : { center: initial.center, zoom: initial.zoom })}
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
        {tilesReady ? <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} maxZoom={19} subdomains={['a', 'b', 'c']} detectRetina={false} /> : null}
        <AutoResize />
        {fitTo && fitTo.length ? (
          <FitBounds points={fitTo} padding={fitPadding} maxZoom={maxFitZoom} initialKey={initial.key} instant={!tilesReady} onFit={markFitted} />
        ) : null}
        {onReady ? <Ready onReady={onReady} /> : null}
        {children}
      </MapContainer>
    </div>
  );
}
