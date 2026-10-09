/**
 * Routing (OSRM) und Geocoding (Photon) – jeweils mit Offline-Fallback.
 *
 * Netzwerkfehler dürfen NIE eine Operation scheitern lassen: Alle Provider liefern im
 * Fehlerfall eine Näherung (Luftlinie bzw. PLZ-Zentrum).
 */
import type { AddressInput, GeoPoint, LatLng, RouteLeg } from '../types';
import { extractZip, haversine, plzInfo, roundLatLng, straightLine, PLZ_INFO } from './geo';

/** Routenberechnung über eine Punktfolge. Liefert genau points.length − 1 Abschnitte. */
export interface RoutingProvider {
  route(points: GeoPoint[]): Promise<RouteLeg[]>;
}

/** Adresssuche und Geocoding */
export interface Geocoder {
  /** Vorschläge zu einer Freitext-Suche */
  search(query: string): Promise<AddressInput[]>;
  /** Koordinaten einer Adresse oder null */
  geocode(address: { street: string; zip: string; city: string }): Promise<GeoPoint | null>;
}

/** Luftlinien-Näherung: Distanz × 1,3 (Straßenfaktor), 30 km/h */
export const FALLBACK_DETOUR_FACTOR = 1.3;
export const FALLBACK_SPEED_MS = 30 / 3.6;

export function straightLineLeg(a: GeoPoint, b: GeoPoint): RouteLeg {
  const distance = Math.round(haversine(a, b) * FALLBACK_DETOUR_FACTOR);
  return {
    coords: straightLine(a, b),
    distance,
    duration: Math.round(distance / FALLBACK_SPEED_MS),
  };
}

/** Routing ohne Netzwerk (Tests, Offline-Betrieb) */
export function straightLineRouting(): RoutingProvider {
  return {
    async route(points) {
      const legs: RouteLeg[] = [];
      for (let i = 1; i < points.length; i++) legs.push(straightLineLeg(points[i - 1], points[i]));
      return legs;
    },
  };
}

/**
 * Routing mit beliebigem Provider, aber garantiert ohne Fehler: bei Ausnahme oder
 * unplausiblem Ergebnis Luftlinie.
 */
export async function safeRoute(provider: RoutingProvider, points: GeoPoint[]): Promise<RouteLeg[]> {
  if (points.length < 2) return [];
  try {
    const legs = await provider.route(points);
    if (Array.isArray(legs) && legs.length === points.length - 1 && legs.every(isValidLeg)) return legs;
  } catch (err) {
    console.warn('[routing] Routenberechnung fehlgeschlagen – Luftlinie wird verwendet.', err);
  }
  return straightLineRouting().route(points);
}

function isValidLeg(leg: RouteLeg | undefined): leg is RouteLeg {
  return (
    !!leg &&
    Array.isArray(leg.coords) &&
    leg.coords.length >= 2 &&
    Number.isFinite(leg.distance) &&
    Number.isFinite(leg.duration) &&
    leg.distance >= 0 &&
    leg.duration >= 0
  );
}

// ───────────────────────────── Netzwerk-Hilfen ─────────────────────────────

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  if (typeof fetch !== 'function') throw new Error('fetch nicht verfügbar');
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller?.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Kleiner Schutzschalter: nach einem Fehler wird der Dienst eine Weile übersprungen. */
function createBreaker(cooldownMs: number) {
  let blockedUntil = 0;
  return {
    get open() {
      return Date.now() < blockedUntil;
    },
    fail() {
      blockedUntil = Date.now() + cooldownMs;
    },
    ok() {
      blockedUntil = 0;
    },
  };
}

// ───────────────────────────── OSRM ─────────────────────────────

export interface OsrmOptions {
  /** Default https://router.project-osrm.org */
  baseUrl?: string;
  /** Default 4000 ms */
  timeoutMs?: number;
  /** Nach einem Fehler so lange direkt Luftlinie verwenden (Default 60 s) */
  cooldownMs?: number;
}

interface OsrmStep {
  geometry?: { coordinates?: [number, number][] };
}
interface OsrmLeg {
  distance: number;
  duration: number;
  steps?: OsrmStep[];
}
interface OsrmRoute {
  distance: number;
  duration: number;
  legs: OsrmLeg[];
  geometry?: { coordinates?: [number, number][] };
}

/**
 * OSRM-Routing (router.project-osrm.org). Je Abschnitt wird die Straßengeometrie
 * (GeoJSON) ermittelt – in einer einzigen Anfrage mit allen Wegpunkten, um das
 * Rate-Limit des Demo-Servers zu schonen. Fehler/Timeout → Luftlinie.
 */
export function osrmRouting(options: OsrmOptions = {}): RoutingProvider {
  const baseUrl = (options.baseUrl ?? 'https://router.project-osrm.org').replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? 4000;
  const breaker = createBreaker(options.cooldownMs ?? 60_000);
  const cache = new Map<string, RouteLeg>();
  const legKey = (a: GeoPoint, b: GeoPoint) =>
    `${a.lat.toFixed(5)},${a.lng.toFixed(5)};${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;

  async function requestLegs(points: GeoPoint[]): Promise<RouteLeg[]> {
    const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const url = `${baseUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`;
    const data = (await fetchJson(url, timeoutMs)) as { code?: string; routes?: OsrmRoute[] };
    const route = data?.routes?.[0];
    if (data?.code !== 'Ok' || !route || route.legs?.length !== points.length - 1) {
      throw new Error(`OSRM: ${data?.code ?? 'keine Route'}`);
    }
    return route.legs.map((leg, i) => {
      const line: LatLng[] = [];
      for (const step of leg.steps ?? []) {
        for (const [lng, lat] of step.geometry?.coordinates ?? []) {
          const p = roundLatLng([lat, lng]);
          const prev = line[line.length - 1];
          if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) line.push(p);
        }
      }
      if (line.length < 2) return straightLineLeg(points[i], points[i + 1]);
      return { coords: line, distance: Math.round(leg.distance), duration: Math.round(leg.duration) };
    });
  }

  return {
    async route(points) {
      if (points.length < 2) return [];
      const keys = points.slice(1).map((p, i) => legKey(points[i], p));
      if (keys.every((k) => cache.has(k))) return keys.map((k) => cache.get(k)!);
      if (!breaker.open) {
        try {
          const legs = await requestLegs(points);
          breaker.ok();
          legs.forEach((leg, i) => {
            if (cache.size > 500) cache.clear();
            cache.set(keys[i], leg);
          });
          return legs;
        } catch (err) {
          breaker.fail();
          console.warn('[routing] OSRM nicht erreichbar – Luftlinie wird verwendet.', err instanceof Error ? err.message : err);
        }
      }
      return keys.map((k, i) => cache.get(k) ?? straightLineLeg(points[i], points[i + 1]));
    },
  };
}

// ───────────────────────────── Geocoding ─────────────────────────────

/** Straße aus Freitext: alles vor der PLZ bzw. vor dem ersten Komma */
function streetFromQuery(query: string, zip?: string): string {
  let s = query;
  if (zip) s = s.split(zip)[0] ?? '';
  s = s.split(',')[0] ?? '';
  return s.replace(/\s+/g, ' ').trim();
}

/** Geocoder ohne Netzwerk: erkennt PLZ im Liefergebiet und liefert deren Zentrum */
export function plzGeocoder(): Geocoder {
  return {
    async search(query) {
      const zip = extractZip(query);
      const info = plzInfo(zip);
      // unbekannte PLZ (außerhalb des Liefergebiets): keine Näherung raten
      if (zip && !info) return [];
      if (!zip || !info) {
        // Ortsname ohne PLZ? (z. B. "Eching")
        const q = query.toLowerCase();
        const hit = Object.entries(PLZ_INFO).find(([, v]) => q.includes(v.city.toLowerCase().split(' ')[0]));
        if (!hit) return [];
        const [hitZip, hitInfo] = hit;
        return [
          {
            label: 'Adresse',
            name: '',
            street: streetFromQuery(query.replace(new RegExp(hitInfo.city.split(' ')[0], 'i'), '')),
            zip: hitZip,
            city: hitInfo.city,
            lat: hitInfo.center.lat,
            lng: hitInfo.center.lng,
          },
        ];
      }
      return [
        {
          label: 'Adresse',
          name: '',
          street: streetFromQuery(query, zip),
          zip,
          city: info.city,
          lat: info.center.lat,
          lng: info.center.lng,
        },
      ];
    },
    async geocode(address) {
      const info = plzInfo(address.zip);
      return info ? { ...info.center } : null;
    },
  };
}

export interface PhotonOptions {
  /** Default https://photon.komoot.io */
  baseUrl?: string;
  timeoutMs?: number;
  /** Suchschwerpunkt (Default: Markt Garching) */
  bias?: GeoPoint;
  /** Ergebnisse weiter weg als dieser Radius werden verworfen (Default 30 km) */
  radiusM?: number;
  cooldownMs?: number;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    district?: string;
    locality?: string;
    county?: string;
    type?: string;
    osm_value?: string;
  };
}

/**
 * Photon-Geocoder (photon.komoot.io), Ergebnisse auf PLZ im Umkreis des Markts begrenzt.
 * Fallback: PLZ-Erkennung → PLZ-Zentrum.
 */
export function photonGeocoder(options: PhotonOptions = {}): Geocoder {
  const baseUrl = (options.baseUrl ?? 'https://photon.komoot.io').replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? 4000;
  const bias = options.bias ?? { lat: 48.2525, lng: 11.6534 };
  const radiusM = options.radiusM ?? 30_000;
  const breaker = createBreaker(options.cooldownMs ?? 60_000);
  const fallback = plzGeocoder();

  async function photon(query: string, limit = 6): Promise<AddressInput[]> {
    const url =
      `${baseUrl}/api/?q=${encodeURIComponent(query)}&lang=de&limit=${limit}` +
      `&lat=${bias.lat}&lon=${bias.lng}`;
    const data = (await fetchJson(url, timeoutMs)) as { features?: PhotonFeature[] };
    const out: AddressInput[] = [];
    const seen = new Set<string>();
    for (const f of data?.features ?? []) {
      const c = f.geometry?.coordinates;
      const p = f.properties ?? {};
      if (!c || !p.postcode || !/^\d{5}$/.test(p.postcode)) continue;
      const point = { lat: c[1], lng: c[0] };
      if (haversine(point, bias) > radiusM) continue;
      const streetName = p.street ?? (p.osm_value === 'residential' || p.type === 'street' ? p.name : undefined);
      if (!streetName) continue;
      const street = p.housenumber ? `${streetName} ${p.housenumber}` : streetName;
      const city = p.city ?? p.locality ?? p.district ?? plzInfo(p.postcode)?.city ?? '';
      const key = `${street}|${p.postcode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        label: 'Adresse',
        name: '',
        street,
        zip: p.postcode,
        city: plzInfo(p.postcode)?.city ?? city,
        lat: Math.round(point.lat * 1e7) / 1e7,
        lng: Math.round(point.lng * 1e7) / 1e7,
      });
    }
    return out;
  }

  return {
    async search(query) {
      const q = query.trim();
      if (q.length < 3) return [];
      if (!breaker.open) {
        try {
          const results = await photon(q);
          breaker.ok();
          if (results.length) return results;
        } catch (err) {
          breaker.fail();
          console.warn('[geocoding] Photon nicht erreichbar – PLZ-Näherung wird verwendet.', err instanceof Error ? err.message : err);
        }
      }
      return fallback.search(q);
    },
    async geocode(address) {
      if (!breaker.open) {
        try {
          const results = await photon(`${address.street}, ${address.zip} ${address.city}`, 3);
          breaker.ok();
          const hit = results.find((r) => r.zip === address.zip) ?? undefined;
          if (hit && hit.lat !== undefined && hit.lng !== undefined) return { lat: hit.lat, lng: hit.lng };
        } catch (err) {
          breaker.fail();
          console.warn('[geocoding] Photon nicht erreichbar – PLZ-Zentrum wird verwendet.', err instanceof Error ? err.message : err);
        }
      }
      return fallback.geocode(address);
    },
  };
}

/** Geocoding ohne Ausnahme: Provider → PLZ-Zentrum → null */
export async function safeGeocode(
  geocoder: Geocoder,
  address: { street: string; zip: string; city: string },
): Promise<GeoPoint | null> {
  try {
    const p = await geocoder.geocode(address);
    if (p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) return p;
  } catch (err) {
    console.warn('[geocoding] fehlgeschlagen', err);
  }
  const info = plzInfo(address.zip);
  return info ? { ...info.center } : null;
}

/** Adresssuche ohne Ausnahme */
export async function safeSearch(geocoder: Geocoder, query: string): Promise<AddressInput[]> {
  try {
    const r = await geocoder.search(query);
    if (Array.isArray(r)) return r;
  } catch (err) {
    console.warn('[geocoding] Suche fehlgeschlagen', err);
  }
  try {
    return await plzGeocoder().search(query);
  } catch {
    return [];
  }
}
