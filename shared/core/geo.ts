/**
 * Geo-Helfer: Entfernungen, Linienzüge, PLZ-Zentren, Liefergebiete.
 */
import type { DeliveryZone, GeoPoint, LatLng, StoreSettings } from '../types';

export const EARTH_RADIUS_M = 6_371_000;

type PointLike = GeoPoint | LatLng;

function lat(p: PointLike): number {
  return Array.isArray(p) ? p[0] : p.lat;
}
function lng(p: PointLike): number {
  return Array.isArray(p) ? p[1] : p.lng;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Luftlinie in Metern (Haversine) */
export function haversine(a: PointLike, b: PointLike): number {
  const dLat = rad(lat(b) - lat(a));
  const dLng = rad(lng(b) - lng(a));
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat(a))) * Math.cos(rad(lat(b))) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Fahrtrichtung a → b in Grad (0 = Nord, 90 = Ost) */
export function bearing(a: PointLike, b: PointLike): number {
  const phi1 = rad(lat(a));
  const phi2 = rad(lat(b));
  const dLambda = rad(lng(b) - lng(a));
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function toLatLng(p: GeoPoint): LatLng {
  return [p.lat, p.lng];
}

export function toPoint(p: LatLng): GeoPoint {
  return { lat: p[0], lng: p[1] };
}

/** Länge eines Linienzugs in Metern */
export function polylineLength(coords: readonly LatLng[]): number {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversine(coords[i - 1], coords[i]);
  return d;
}

/** Linear interpolierter Punkt zwischen a und b (t = 0…1) */
export function lerp(a: LatLng, b: LatLng, t: number): LatLng {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Punkt nach `distM` Metern entlang des Linienzugs (begrenzt auf Anfang/Ende)
 * inkl. Fahrtrichtung des Segments und Segment-Index.
 */
export function pointAlong(coords: readonly LatLng[], distM: number): { point: LatLng; heading: number; segment: number } {
  if (coords.length === 0) return { point: [0, 0], heading: 0, segment: 0 };
  if (coords.length === 1) return { point: coords[0], heading: 0, segment: 0 };
  let remaining = Math.max(0, distM);
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const seg = haversine(a, b);
    if (remaining <= seg || i === coords.length - 1) {
      const t = seg > 0 ? Math.min(1, remaining / seg) : 1;
      return { point: lerp(a, b, t), heading: headingAt(coords, i), segment: i - 1 };
    }
    remaining -= seg;
  }
  const last = coords[coords.length - 1];
  return { point: last, heading: headingAt(coords, coords.length - 1), segment: coords.length - 2 };
}

/** Richtung des Segments, das bei Index i endet (überspringt Nullsegmente) */
function headingAt(coords: readonly LatLng[], i: number): number {
  for (let j = i; j >= 1; j--) {
    if (haversine(coords[j - 1], coords[j]) > 0.5) return bearing(coords[j - 1], coords[j]);
  }
  for (let j = i + 1; j < coords.length; j++) {
    if (haversine(coords[j - 1], coords[j]) > 0.5) return bearing(coords[j - 1], coords[j]);
  }
  return 0;
}

/** Rest-Linienzug ab `distM` Metern (erster Punkt = interpolierte Position) */
export function sliceFrom(coords: readonly LatLng[], distM: number): LatLng[] {
  if (coords.length < 2) return [...coords];
  if (distM <= 0) return [...coords];
  const { point, segment } = pointAlong(coords, distM);
  return [point, ...coords.slice(segment + 1)];
}

/**
 * Projektion eines Punkts auf den Linienzug: zurückgelegte Distanz entlang der Linie
 * bis zum nächstgelegenen Punkt und Abstand zur Linie (beides in Metern, näherungsweise).
 */
export function projectOnPolyline(coords: readonly LatLng[], p: PointLike): { along: number; offset: number } {
  if (coords.length === 0) return { along: 0, offset: Infinity };
  if (coords.length === 1) return { along: 0, offset: haversine(coords[0], p) };
  // Lokale äquidistante Projektion (für kurze Distanzen ausreichend genau)
  const cosLat = Math.cos(rad(lat(p)));
  const toXY = (q: PointLike): [number, number] => [rad(lng(q)) * cosLat * EARTH_RADIUS_M, rad(lat(q)) * EARTH_RADIUS_M];
  const [px, py] = toXY(p);
  let best = { along: 0, offset: Infinity };
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const [ax, ay] = toXY(coords[i - 1]);
    const [bx, by] = toXY(coords[i]);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const off = Math.hypot(px - cx, py - cy);
    const segLen = haversine(coords[i - 1], coords[i]);
    if (off < best.offset) best = { along: acc + t * segLen, offset: off };
    acc += segLen;
  }
  return best;
}

/** Gerade Linie a → b mit Zwischenpunkten (ca. alle `stepM` Meter, höchstens `maxPoints`) */
export function straightLine(a: PointLike, b: PointLike, stepM = 60, maxPoints = 80): LatLng[] {
  const A: LatLng = [lat(a), lng(a)];
  const B: LatLng = [lat(b), lng(b)];
  const d = haversine(A, B);
  const n = Math.max(1, Math.min(maxPoints - 1, Math.ceil(d / stepM)));
  const out: LatLng[] = [];
  for (let i = 0; i <= n; i++) out.push(roundLatLng(lerp(A, B, i / n)));
  return out;
}

export function roundLatLng(p: LatLng, digits = 6): LatLng {
  const f = 10 ** digits;
  return [Math.round(p[0] * f) / f, Math.round(p[1] * f) / f];
}

// ───────────────────────────── PLZ & Zonen ─────────────────────────────

export interface ZipInfo {
  city: string;
  center: GeoPoint;
}

/** Ungefähre Zentren der PLZ im Liefergebiet (für Geocoding-Fallback und Kartendarstellung) */
export const PLZ_INFO: Record<string, ZipInfo> = {
  '85748': { city: 'Garching b. München', center: { lat: 48.2510, lng: 11.6510 } },
  '85386': { city: 'Eching', center: { lat: 48.3001, lng: 11.6215 } },
  '85737': { city: 'Ismaning', center: { lat: 48.2266, lng: 11.6756 } },
  '85716': { city: 'Unterschleißheim', center: { lat: 48.2806, lng: 11.5768 } },
  '85375': { city: 'Neufahrn b. Freising', center: { lat: 48.3155, lng: 11.6648 } },
  '85764': { city: 'Oberschleißheim', center: { lat: 48.2547, lng: 11.5609 } },
  '80939': { city: 'München', center: { lat: 48.1962, lng: 11.6147 } },
  '80937': { city: 'München', center: { lat: 48.2015, lng: 11.5775 } },
  '80807': { city: 'München', center: { lat: 48.1808, lng: 11.5856 } },
  '80805': { city: 'München', center: { lat: 48.1712, lng: 11.6012 } },
  '80809': { city: 'München', center: { lat: 48.1799, lng: 11.5531 } },
};

export function plzInfo(zip: string | undefined | null): ZipInfo | undefined {
  if (!zip) return undefined;
  return PLZ_INFO[zip.trim()];
}

/** Erste fünfstellige PLZ im Text */
export function extractZip(text: string): string | undefined {
  const m = /(?:^|\D)(\d{5})(?!\d)/.exec(text);
  return m?.[1];
}

/** Liefergebiet zur PLZ */
export function zoneForZip(settings: Pick<StoreSettings, 'zones'>, zip: string | undefined | null): DeliveryZone | undefined {
  if (!zip) return undefined;
  const z = zip.trim();
  return settings.zones.find((zone) => zone.zips.includes(z));
}
