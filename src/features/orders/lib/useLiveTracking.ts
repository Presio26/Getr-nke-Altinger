import { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ID, TrackingInfo } from '@shared/types';
import { api } from '@/api/client';
import { qk } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { useNow } from '@/lib/hooks';

/** ETA wird alle 15 s neu geholt; Fahrerposition kommt live über usePositions (ohne Refetch) */
export const TRACKING_REFRESH_MS = 15_000;

/**
 * Sendungsverfolgung mit kürzerem Intervall als useTracking (gleicher Query-Key → Echtzeit-Invalidierung
 * durch RealtimeBridge bei order.* / tour.* greift automatisch).
 */
export function useLiveTracking(orderId: ID | null | undefined, enabled = true) {
  const auth = useSession((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: qk.tracking(orderId ?? ''),
    queryFn: () => api.getTracking(orderId as ID),
    enabled: auth && enabled && !!orderId,
    refetchInterval: enabled ? TRACKING_REFRESH_MS : false,
    refetchIntervalInBackground: false,
  });
}

export interface EtaInfo {
  /** Minuten bis zur Ankunft (laufender Countdown, ≥ 1), oder 0 wenn angekommen */
  minutes: number;
  /** geschätzte Ankunftszeit */
  arrival: Date;
}

/**
 * Countdown aus der zuletzt geladenen ETA: zählt zwischen zwei Abrufen sekundengenau herunter.
 */
export function useEtaCountdown(tracking: TrackingInfo | undefined, fetchedAt: number): EtaInfo | null {
  const now = useNow(5_000);
  const eta = tracking?.etaMinutes;
  const raw = eta === undefined ? null : fetchedAt + eta * 60_000;
  // kleine Aufwärts-Sprünge (Rundung auf ganze Minuten) glätten, damit der Countdown nicht „zurückspringt“
  const smoothed = useRef<number | null>(null);
  const arrival = useMemo(() => {
    if (raw === null) {
      smoothed.current = null;
      return null;
    }
    const prev = smoothed.current;
    const next = prev !== null && raw > prev && raw - prev < 75_000 ? prev : raw;
    smoothed.current = next;
    return new Date(next);
  }, [raw]);
  if (eta === undefined || !arrival) return null;
  if (eta === 0) return { minutes: 0, arrival };
  const minutes = Math.max(1, Math.ceil((arrival.getTime() - now.getTime()) / 60_000));
  return { minutes, arrival };
}
