/**
 * GPS-Helfer (Fahrer-App): watchPosition-Wrapper mit deutschen Fehlermeldungen und ein React-Hook,
 * der den GPS-Zustand im Positions-Store (`usePositions().gps`) pflegt – die Fahrer-Kopfzeile zeigt ihn an.
 */
import { useEffect, useRef, useState } from 'react';
import type { GeoPositionInput } from '@shared/types';
import { usePositions } from '@/stores/positions';

export type GeoErrorCode = 'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'timeout';

export class GeoError extends Error {
  readonly code: GeoErrorCode;
  constructor(code: GeoErrorCode, message: string) {
    super(message);
    this.name = 'GeoError';
    this.code = code;
  }
}

const MESSAGES: Record<GeoErrorCode, string> = {
  unsupported: 'Dieses Gerät unterstützt keine Standortbestimmung.',
  insecure: 'Der Standort ist nur über eine sichere Verbindung (HTTPS) verfügbar.',
  denied: 'Der Zugriff auf den Standort wurde verweigert. Bitte erlauben Sie ihn in den Einstellungen.',
  unavailable: 'Der Standort ist derzeit nicht verfügbar. Bitte prüfen Sie GPS und Empfang.',
  timeout: 'Die Standortbestimmung dauert zu lange. Wir versuchen es weiter.',
};

export function geolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

function precheck(): GeoError | null {
  if (!geolocationSupported()) return new GeoError('unsupported', MESSAGES.unsupported);
  if (typeof window !== 'undefined' && window.isSecureContext === false) return new GeoError('insecure', MESSAGES.insecure);
  return null;
}

function toError(err: GeolocationPositionError): GeoError {
  if (err.code === err.PERMISSION_DENIED) return new GeoError('denied', MESSAGES.denied);
  if (err.code === err.TIMEOUT) return new GeoError('timeout', MESSAGES.timeout);
  return new GeoError('unavailable', MESSAGES.unavailable);
}

export type GeoFix = GeoPositionInput & { timestamp: string; accuracy: number };

function toFix(pos: GeolocationPosition): GeoFix {
  const c = pos.coords;
  const fix: GeoFix = {
    lat: c.latitude,
    lng: c.longitude,
    accuracy: Math.round(c.accuracy),
    timestamp: new Date(pos.timestamp || Date.now()).toISOString(),
  };
  if (typeof c.heading === 'number' && Number.isFinite(c.heading)) fix.heading = Math.round(c.heading);
  if (typeof c.speed === 'number' && Number.isFinite(c.speed)) fix.speed = Math.round(c.speed * 10) / 10;
  return fix;
}

const DEFAULT_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 };

/** Position fortlaufend beobachten. Liefert eine Funktion zum Beenden. */
export function watchPosition(
  onPosition: (fix: GeoFix) => void,
  onError?: (err: GeoError) => void,
  options: PositionOptions = DEFAULT_OPTIONS,
): () => void {
  const pre = precheck();
  if (pre) {
    onError?.(pre);
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => onPosition(toFix(pos)),
    (err) => onError?.(toError(err)),
    options,
  );
  return () => navigator.geolocation.clearWatch(id);
}

/** Einmalige Position (z. B. "Meinen Standort verwenden") */
export function getCurrentPosition(options: PositionOptions = DEFAULT_OPTIONS): Promise<GeoFix> {
  const pre = precheck();
  if (pre) return Promise.reject(pre);
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(toFix(pos)),
      (err) => reject(toError(err)),
      options,
    );
  });
}

export interface UseGeolocationResult {
  position: GeoFix | null;
  error: GeoError | null;
}

/**
 * Position beobachten, solange `enabled` true ist. `onPosition` wird bei jedem Fix aufgerufen
 * (z. B. um `api.updateDriverPosition` gedrosselt aufzurufen). Pflegt `usePositions().gps`.
 */
export function useGeolocation(
  enabled: boolean,
  onPosition?: (fix: GeoFix) => void,
  options?: PositionOptions,
): UseGeolocationResult {
  const [position, setPosition] = useState<GeoFix | null>(null);
  const [error, setError] = useState<GeoError | null>(null);
  const cb = useRef(onPosition);
  cb.current = onPosition;
  const optionsKey = JSON.stringify(options ?? null);

  useEffect(() => {
    const setGps = usePositions.getState().setGps;
    if (!enabled) {
      setGps({ status: 'off', message: undefined });
      return;
    }
    setGps({ status: 'searching', message: undefined });
    const stop = watchPosition(
      (fix) => {
        setPosition(fix);
        setError(null);
        setGps({ status: 'active', accuracy: fix.accuracy, lastFixAt: fix.timestamp, message: undefined });
        cb.current?.(fix);
      },
      (err) => {
        setError(err);
        // Zeitüberschreitung ist vorübergehend – weiter suchen
        if (err.code === 'timeout') setGps({ status: 'searching', message: err.message });
        else setGps({ status: err.code === 'denied' ? 'denied' : 'error', message: err.message });
      },
      options ?? DEFAULT_OPTIONS,
    );
    return () => {
      stop();
      setGps({ status: 'off' });
    };
  }, [enabled, optionsKey]);

  return { position, error };
}
