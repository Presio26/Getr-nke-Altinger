import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Circle, Marker, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { DeliveryZone, GeoPoint, GeoPosition, LatLng, StopStatus } from '@shared/types';
import { formatEuro } from '@shared/format';
import { useSettings } from '@/api/hooks';
import { driverIcon, homeIcon, stopIcon, storeIcon } from './icons';

// ───────────────────────────── Markt ─────────────────────────────

export interface StoreMarkerProps {
  /** Tooltip dauerhaft anzeigen */
  permanentLabel?: boolean;
  children?: ReactNode;
}

/** Marker des Getränkemarkts (Position aus den Einstellungen) */
export function StoreMarker({ permanentLabel = false, children }: StoreMarkerProps) {
  const settings = useSettings();
  const icon = useMemo(() => storeIcon(), []);
  return (
    <Marker position={[settings.location.lat, settings.location.lng]} icon={icon} zIndexOffset={500} keyboard={false}>
      <Tooltip direction="top" permanent={permanentLabel} offset={[0, 0]}>
        {settings.name}
      </Tooltip>
      {children}
    </Marker>
  );
}

// ───────────────────────────── Fahrer ─────────────────────────────

export interface DriverMarkerProps {
  position: GeoPosition | GeoPoint;
  color?: string;
  label?: string;
  /** Fahrtrichtung in Grad; Default aus position.heading bzw. Bewegungsrichtung */
  heading?: number;
  pulse?: boolean;
  /** Dauer der Gleitbewegung zwischen zwei Positionen (ms) */
  animationMs?: number;
  children?: ReactNode;
}

function bearing(from: L.LatLng, to: L.LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(to.lng - from.lng)) * Math.cos(toRad(to.lat));
  const x = Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) - Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(toRad(to.lng - from.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Fahrzeug-Marker in Fahrerfarbe mit Richtungspfeil und Puls.
 * Gleitet weich (requestAnimationFrame, ~1 s) zur neuen Position statt zu springen.
 */
export function DriverMarker({ position, color = '#2563eb', label, heading, pulse = true, animationMs = 1000, children }: DriverMarkerProps) {
  const markerRef = useRef<L.Marker | null>(null);
  const [initial] = useState<LatLng>(() => [position.lat, position.lng]);
  const icon = useMemo(() => driverIcon(color, label, pulse), [color, label, pulse]);
  const rotation = useRef<number | null>(null);
  const explicitHeading = heading ?? ('heading' in position ? position.heading : undefined);

  const applyHeading = (deg: number | undefined) => {
    if (deg === undefined || Number.isNaN(deg)) return;
    const el = markerRef.current?.getElement()?.querySelector<HTMLElement>('.alt-driver__heading');
    if (!el) return;
    // kürzesten Drehweg wählen (359° → 1° dreht 2°, nicht 358°)
    const prev = rotation.current;
    const next = prev === null ? deg : prev + ((((deg - prev) % 360) + 540) % 360) - 180;
    rotation.current = next;
    el.style.transform = `rotate(${next}deg)`;
  };

  // Gleitende Bewegung
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const from = marker.getLatLng();
    const to = L.latLng(position.lat, position.lng);
    if (from.equals(to, 1e-7)) {
      applyHeading(explicitHeading);
      return;
    }
    const dist = from.distanceTo(to);
    applyHeading(explicitHeading ?? (dist > 3 ? bearing(from, to) : undefined));
    // Sprünge über große Distanzen (z. B. Neustart der Simulation) nicht animieren
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (dist > 3000 || reduce || animationMs <= 0) {
      marker.setLatLng(to);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / animationMs);
      marker.setLatLng([from.lat + (to.lat - from.lat) * t, from.lng + (to.lng - from.lng) * t]);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [position.lat, position.lng, explicitHeading, animationMs]);

  // Icon-Wechsel setzt das DOM neu → Richtung erneut anwenden
  useEffect(() => {
    const r = rotation.current;
    rotation.current = null;
    applyHeading(r ?? explicitHeading);
  }, [icon]);

  return (
    <Marker ref={markerRef} position={initial} icon={icon} zIndexOffset={1000} keyboard={false}>
      {children}
    </Marker>
  );
}

// ───────────────────────────── Stopps & Zuhause ─────────────────────────────

export interface StopMarkerProps {
  position: GeoPoint;
  index: number;
  status?: StopStatus;
  label?: ReactNode;
  /** nächster anzufahrender Stopp (hervorgehoben) */
  current?: boolean;
  onClick?: () => void;
}

export function StopMarker({ position, index, status = 'pending', label, current = false, onClick }: StopMarkerProps) {
  const icon = useMemo(() => stopIcon(index, status, current), [index, status, current]);
  const handlers = useMemo(() => (onClick ? { click: onClick } : undefined), [onClick]);
  return (
    <Marker position={[position.lat, position.lng]} icon={icon} eventHandlers={handlers} zIndexOffset={current ? 800 : status === 'pending' ? 400 : 100}>
      {label ? <Tooltip direction="top">{label}</Tooltip> : null}
    </Marker>
  );
}

export interface HomeMarkerProps {
  position: GeoPoint;
  label?: ReactNode;
  color?: string;
  permanentLabel?: boolean;
}

/** Lieferadresse des Kunden */
export function HomeMarker({ position, label, color, permanentLabel = false }: HomeMarkerProps) {
  const icon = useMemo(() => homeIcon(color), [color]);
  return (
    <Marker position={[position.lat, position.lng]} icon={icon} zIndexOffset={600} keyboard={false}>
      {label ? (
        <Tooltip direction="top" permanent={permanentLabel}>
          {label}
        </Tooltip>
      ) : null}
    </Marker>
  );
}

// ───────────────────────────── Route & Zonen ─────────────────────────────

export interface RouteLineProps {
  coords: LatLng[];
  color?: string;
  dashed?: boolean;
  weight?: number;
  /** halbtransparent (z. B. bereits gefahrene Strecke) */
  faded?: boolean;
}

/** Fahrtroute mit weißer Kontur für gute Lesbarkeit auf der Karte */
export function RouteLine({ coords, color = '#1d58a0', dashed = false, weight = 5, faded = false }: RouteLineProps) {
  if (coords.length < 2) return null;
  return (
    <>
      <Polyline positions={coords} pathOptions={{ color: '#ffffff', weight: weight + 4, opacity: faded ? 0.5 : 0.9, lineCap: 'round', lineJoin: 'round' }} interactive={false} />
      <Polyline
        positions={coords}
        pathOptions={{
          color,
          weight,
          opacity: faded ? 0.45 : 0.95,
          dashArray: dashed ? `${weight * 1.6} ${weight * 2}` : undefined,
          lineCap: 'round',
          lineJoin: 'round',
        }}
        interactive={false}
      />
    </>
  );
}

export interface ZoneCirclesProps {
  zones: DeliveryZone[];
  /** Tooltip mit Gebühr/Mindestbestellwert */
  showInfo?: boolean;
}

/** Liefergebiete als Kreise */
export function ZoneCircles({ zones, showInfo = true }: ZoneCirclesProps) {
  const sorted = useMemo(() => [...zones].sort((a, b) => b.radiusM - a.radiusM), [zones]);
  return (
    <>
      {sorted.map((z) => (
        <Circle
          key={z.id}
          center={[z.center.lat, z.center.lng]}
          radius={z.radiusM}
          pathOptions={{ color: z.color, weight: 2, opacity: 0.7, fillColor: z.color, fillOpacity: 0.08, dashArray: '6 6' }}
        >
          {showInfo ? (
            <Tooltip sticky>
              <strong>{z.name}</strong>
              <br />
              Liefergebühr {z.fee ? formatEuro(z.fee) : 'kostenlos'} · ab {formatEuro(z.freeFrom)} frei
              <br />
              Mindestbestellwert {formatEuro(z.minOrder)}
            </Tooltip>
          ) : null}
        </Circle>
      ))}
    </>
  );
}
