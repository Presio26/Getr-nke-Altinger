/**
 * Live-Positionen der Fahrer (aus Echtzeit-Ereignissen `driver.position`) und GPS-Zustand des eigenen Geräts.
 * Karten lesen hieraus und bewegen Marker flüssig – ohne Refetch.
 */
import { create } from 'zustand';
import type { GeoPosition, ID } from '@shared/types';

export type GpsStatus = 'off' | 'searching' | 'active' | 'denied' | 'error';

export interface GpsState {
  status: GpsStatus;
  /** Genauigkeit in Metern (letzter Fix) */
  accuracy?: number;
  lastFixAt?: string;
  /** deutsche Fehlermeldung/Hinweis */
  message?: string;
}

interface PositionsState {
  /** letzte bekannte Position je Fahrer-ID */
  byDriver: Record<ID, GeoPosition>;
  /** aktive Tour je Fahrer (falls im Ereignis enthalten) */
  tourByDriver: Record<ID, ID | undefined>;
  /** Position übernehmen (ältere Zeitstempel werden ignoriert) */
  setPosition(driverId: ID, position: GeoPosition, tourId?: ID): void;
  /** mehrere Positionen auf einmal (z. B. aus adminListDrivers) – nur neuere übernehmen */
  seed(positions: Record<ID, GeoPosition | undefined>): void;
  clear(): void;
  /** GPS des eigenen Geräts (Fahrer-App) */
  gps: GpsState;
  setGps(patch: Partial<GpsState>): void;
}

function isNewer(next: GeoPosition, prev: GeoPosition | undefined): boolean {
  if (!prev) return true;
  const a = Date.parse(prev.timestamp);
  const b = Date.parse(next.timestamp);
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  return b >= a;
}

export const usePositions = create<PositionsState>()((set, get) => ({
  byDriver: {},
  tourByDriver: {},
  setPosition(driverId, position, tourId) {
    const prev = get().byDriver[driverId];
    if (!isNewer(position, prev)) return;
    set((s) => ({
      byDriver: { ...s.byDriver, [driverId]: position },
      tourByDriver: tourId !== undefined ? { ...s.tourByDriver, [driverId]: tourId } : s.tourByDriver,
    }));
  },
  seed(positions) {
    const current = get().byDriver;
    let changed = false;
    const next = { ...current };
    for (const [id, pos] of Object.entries(positions)) {
      if (pos && isNewer(pos, current[id])) {
        next[id] = pos;
        changed = true;
      }
    }
    if (changed) set({ byDriver: next });
  },
  clear() {
    set({ byDriver: {}, tourByDriver: {} });
  },
  gps: { status: 'off' },
  setGps(patch) {
    set((s) => ({ gps: { ...s.gps, ...patch } }));
  },
}));

/** Live-Position eines Fahrers (oder Fallback, z. B. aus Tracking-Daten) – die jeweils neuere gewinnt */
export function useDriverPosition(driverId: ID | null | undefined, fallback?: GeoPosition | null): GeoPosition | undefined {
  const live = usePositions((s) => (driverId ? s.byDriver[driverId] : undefined));
  if (!live) return fallback ?? undefined;
  if (!fallback) return live;
  return isNewer(live, fallback) ? live : fallback;
}
