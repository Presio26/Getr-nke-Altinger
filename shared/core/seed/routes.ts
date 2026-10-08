/**
 * Vorberechnete Straßenrouten der drei Demo-Touren (OSRM, offline in routes.json).
 * Jeder Eintrag ist die Liste der Abschnitte Markt → Stopp 1 → … → Markt.
 */
import type { LatLng, RouteLeg } from '../../types';
import routesJson from './routes.json';

export interface SeedRouteLeg extends RouteLeg {
  from: string;
  to: string;
}

type RawLeg = { from: string; to: string; distance: number; duration: number; coords: number[][] };

const raw = routesJson as unknown as Record<string, RawLeg[]>;

export type SeedTourKey = 'tour1' | 'tour2' | 'tour3';

export function seedRoute(key: SeedTourKey): SeedRouteLeg[] {
  const legs = raw[key] ?? [];
  return legs.map((l) => ({
    from: l.from,
    to: l.to,
    distance: Math.round(l.distance),
    duration: Math.round(l.duration),
    coords: l.coords.map((c) => [c[0], c[1]] as LatLng),
  }));
}
